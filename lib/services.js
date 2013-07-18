var
  Push = require('./push')
, Feedback = require('./feedback')
, Notification = require('./notification')
, Device = require('./device')
, APNS = require('./constants')
;

/*

  # Notifier 
  
  A Yet Very simple notifier. 
  It starts by querying the feedback service and then maintains the connection 
  and manages everything for you in order to make reliable notifications delivery.


  ## Usage:
  
    var notifier = new Notifier({ tls_options }[, development])

      o tls_options: the certificate and key tls options
      o development: true for development gateway false for production gateway.
    
    notifier.notify(notification[, callback])
      
      o notification: a Notification object to send
      o callback: optional callback triggered when the notification is assumed to be sent and apple did not complain about it. The callback receives the notification as *this* and the error (if any) as only argument

      Example: 
        notifier.notify(notification, function (err) { 
          if (err) console.log("error", err, "in notification", this); 
          else console.log("Notification was sent!");
        });


    notifier.suspend()
      Suspend sending notifications
      Notifier always suspend notifications when a network error occures. You should register for 'error' event of notifier.push to get informed of that and take the appropriate actions

    notifier.restart()
      Restart sending notifications. This is statup state.

    notifier.feedback([callback])
      Connects to the feedback service and add any device token to the black list
    

    The Notifier instance has few interesting fields which you can interact with:
    - notifier.verbose: set whether you want verbose messages or not (default: false)
    - notifier.suspended(): whether the notifications are suspended or not.
    - notifier.elogs: contains a list of error or interesting events 
    - notifier.elogsMaxCount: the max number of elogs to keep (default: 100)
    - notifier.blacklist: contains a hash of tokens that are blacklisted with date of their blacklist as value. Blacklisted tokens are filtered on notify()
    - notifier.push: is the Push object that handles the connections to Apple. You may want to add custom event listeners on it so ...
    - notifier.gracePeriod: the period of time (in ms) we wait for Apple's feedback when no error occured before asumming all went okay. (default: 2000 ms). If you have very high latency of very high network load you may wish to increase this period.


  ## Example usage:

  var 
    apns = require('node_apns')
    certkey = require('fs').readFileSync('/Users/orion/Desktop/identity-dev.pem')
    notifier = apns.services.Notifier({cert:certkey, key:certkey}, true)

  notifier.notify(apns.Notification("39a10925ba719d0261e92186d81139e373e828d1050191ffd52ed5c85028cbae", { aps: { alert: "Hello from service", sound: "default" }}), 
    function () { console.log("Sent", this); }
  );

  #=> iPhone Tadaaa! ;)

*/


function Notifier(tls_options, /* Bool */ development) {
  
  if (false === (this instanceof Notifier)) { 
    return new Notifier(tls_options, development);
  }
  

  
  var 
    pending = []
  , notifications = {}
  , cansend = false
  , elogs = []
  , blacklist = {}
  , consumer = null
  , push
  , push_options = {
    
    host: development ? APNS.development.host : APNS.production.host,
    port: development ? APNS.development.port : APNS.production.port,
    enhanced: true,
    
  }
  , self = this
  ;
  
  
  
  function vlog() { if (self.verbose) console.log.apply(null, arguments); }
  
  function feedback(callback) {
    var fb = Feedback(tls_options, { 
      host: push_options.host.replace('gateway','feedback'), 
      port: APNS.feedback.port 
    });

    fb.on('device', function(time, token) {
      vlog("+++ Feedback device:", token);
      blacklist[token] = new Date(time * 1000);
    });

    fb.on('end', function () { 
      vlog("+++ Feedback connection ended!");
      if (callback) callback();
    });
    
    fb.on('clientError', function (error) {
      vlog("+++ Feedback client error!", error);
      if (callback) callback(error);
    });
    
    fb.on('error', function (error) {
      vlog("+++ Feedback error!", error);
      if (callback) callback(error);
    });
    
    return fb;
  }
  
  function suspend() { 
    cansend = false; 
    if (consumer) clearTimeout(consumer);
    consumer = null;
  }
  
  function restart() {
    cansend = true;
    process.nextTick(consume);
  }
  
  function notify(/* Notification */ notification, /* Function */ callback) {
    if (blacklist[notification.device.token]) {
      if (callback) callback.call(notification, new Error('blacklisted'));
      return false;
    } 
    
    if (!notification.isValid()) {
      if (callback) callback.call(notification, new Error('invalid'));
      return false;
    } 
      
    pending.push(notification);
    process.nextTick(consume);
    return true;
  }

  function cleanupAfterErrorOnNotification (uid) {    
    for (var identifier in notifications) {
      if (identifier > uid) { // Resend the other notifications
        pending.push(notifications[identifier]);
      } else {
        if (notifications[identifier].callback) notifications[identifier].callback.call(notifications[identifier], null);
      }
      delete(notifications[identifier]);
    }     
  }
  
  // Consumer process
  function consume() {
  
    if (consumer) clearTimeout(consumer);
    consumer = null;
  
    var ongoing;
    while (cansend && pending.length) {
    
      ongoing = pending.shift();
      push.sendNotification(ongoing);
    
      // Save this notification in the sent notifications hash
      var uid = ongoing.identifier;
      notifications[uid] = ongoing;
    
      vlog('*** Consumed', uid);
    }
  
    // When all is done, we let the feedback come from APNs for gracePeriod ms before we restart the comsumer process
    if (ongoing && (pending.length === 0)) {
      cansend = false;
    
      setTimeout(function () {
        for (var identifier in notifications) {
          if (notifications[identifier].callback) notifications[identifier].callback.call(notifications[identifier], null);
        }
        notifications = {};
        cansend = true;
        vlog('*** Consumed all');
      }, self.gracePeriod);
    
    }
    
    // Elogs cleanup
    while (elogs.length > self.elogsMaxCount) elogs.shift();
  
    // Reschedule ourselves in 1 second
    consumer = setTimeout(consume, 1000);
  }
  
  push = Push(tls_options, push_options).on('authorized', function () {
  
    vlog('*** Authorized to send push notifications in ' + development ? "development" : "production", "mode");
  
  }).on('sent', function (n) {
  
    vlog("*** Sent notification", n.identifier);
  
  }).on('notificationError', function (error, uid) {
  
    vlog("*** Notification", uid, "error", APNS.errors[error]);
  
    // Save error
    elogs.push([new Date(), error, notifications[uid], APNS.errors[error]]);
    
    // If it is a device-token error we add it to the black list
    if (error === 8) {
      blacklist[notifications[uid].device.token] = new Date();
    }
    
    // Callback with error
    if (notifications[uid].callback) notifications[uid].callback.call(notifications[uid], error);
    delete(notifications[uid]);
  
    // Cleanup the hash
    cleanupAfterErrorOnNotification(uid);

  }).on('error', function (error) {
  
    vlog("*** Error on stream", error);
    elogs.push([new Date(), error, null, APNS.errors[error]]);
  
    cleanupAfterErrorOnNotification(-1); // Resend all
    self.suspend();

  }).on('close', function () {
  
    vlog("*** Closed stream");
    elogs.push([new Date(), "closed", null, null]);
  
    cleanupAfterErrorOnNotification(-1); // Resend all

  });

  
  this.suspend = suspend;
  this.restart = restart;
  this.suspended = function () { return !!cansend; }
  this.notify = notify;
  this.feedback = feedback;
  this.elogs = elogs;
  this.blacklist = blacklist;  
  this.gracePeriod = 2000;
  this.elogsMaxCount = 100;
  this.push = push;
  this.verbose = false;



  /* 
    main() 
    
    First we ask for feedback from Apple. Then we start consuming
  */
  
  feedback(function(error) {
    if (error) {
      vlog("--- Startup Failed! An error occured during feedback query:", error);
      return;
    }
    
    restart();
  })

  return this;
};



module.exports = {
  Notifier: Notifier
}