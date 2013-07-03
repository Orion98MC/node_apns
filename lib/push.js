var 
  util = require('util')
, events = require('events')
, tls = require('tls')
, APNS = require('./constants')
, log = require('./tools').log
, Notification = require('./notification')
;

/*
    Push(<{tls_options}> [, <{options}>])
    @arguments
        
        tls_options: <tls connect options (hash)>

        options:
            host: <APNS.production.host (string)>
            port: <APNS.production.port (string)>
            [verbose:<false (boolean)>]
            enhanced: <true (boolean)>

    @returns a new Push object

    @emits
        - 'clientError'
        - 'authorized'
        - 'error'
        - 'close'
        - 'notificationError'
        - 'sent'
        - 'buffer'
        - 'drain'

        check those events in the code below for more information

    Example:
        var apns = require('node_apns')
        ,   Push = apns.Push
        ,   Notification = apns.Notification;

        var push = Push({cert: cert_data, key: key_data}); // Defaults to setting up a connection to Apple's production push gateway

        push.on('sent', function (notification) { 
            console.log('Sent', notification);
        });

        var n = Notification("abcdefabcdef", {foo:"bar"});
        n.alert = "Hello World!";
        n.sound = "default";

        // Until then, the connection is not made, it will be made as needed when you wish to send a notification
        if (n.isValid()) push.sendNotification(n); // This one starts the connexion

*/

function Push(tls_opts, opts) {
    if (false === (this instanceof Push)) {
        return new Push(tls_opts, opts);
    }
    
    events.EventEmitter.call(this);

    var options = {
        host: APNS.production.host,
        port: APNS.production.port,

        enhanced: true, /* Enhanced payloads mode or not */
        verbose: false /* verbose mode, say more about what is going on */
    };

    // Merge options
    for (key in opts) {
        if (opts.hasOwnProperty(key)) options[key] = opts[key];
    }

    // Options checking
    if (!tls_opts) throw "No tls connection options";

    var uid = 0                 /* Notifications' id */
    ,   cleartextStream = null  /* holds the stream to Apple */
    ,   notifications = []      /* holds the unsent notifications */
    ,   buffering = false       /* Are we sending notifications directly to the cleartext stream or buffering them until a drain occurs ? */
    ,   self = this
    ,   verbose = !!options.verbose
    ;

    if (verbose) { // Hijack the emit to be more verbose
        var _emit = this.emit;
        this.emit = function () { 
            log('Emit ', arguments);
            _emit.apply(self, arguments);
        };
    }   

    function setupConnection (callback) {
        cleartextStream = tls.connect(options.port, options.host, tls_opts, function () {
            if (verbose) log('Push to ' + options.host + ':' + options.port);

            if (!cleartextStream.authorized) { throw cleartextStream.authorizationError; }

            /*              
                Event 'notificationError': 
                @arguments 
                    <errorCode(string)>, <notificationUID(uint)>

                This event occurs when Apple sends back an error (a bad notification) 
            */
            cleartextStream.on('data', function (data) {
                // Bytes    value
                // 1        8
                // 1        errorCode
                // 4        notificationUID
                if (data[0] == 8) { self.emit('notificationError', data[1].toString(), data.readUInt32BE(2)); } 
                if (verbose) log('Error-response:', data);
            });

            /* 
                Event 'close':
                The connection was closed (timed-out or Apple closed it) 
            */
            cleartextStream.once('close', function () {
                if (verbose) log('closed');
                self.emit('close');
                clearConnection();
            });

            cleartextStream.on('timeout', function () {
                if (verbose) log('timed-out');
                clearConnection();
            });

            cleartextStream.on('end', function () {
                if (verbose) log('ended');
            });

            /* 
                Event 'drain':
                When the socket is able to send again after having buffered
            */
            cleartextStream.on('drain', function () {
                if (!buffering) return;

                self.emit('drain');

                var notification = null;
                while ((notification = notifications.shift()) ) {
                    var still_buffered = !cleartextStream.write(notification.toNetwork());
                    /* 
                        Event 'sent':
                        @argument
                            <notification>

                        This event occurs when the notification has been sent to the socket (it may not be sent to the server yet)
                    */
                    self.emit('sent', notification);
                    if (still_buffered) return; // We still cannot send more notifications, lets give up until a new 'drain' is sent
                }
                buffering = false;
            });

            /* 
                Event 'authorized':
                When the connexion has been made and authorized
            */
            self.emit('authorized');
            if (callback) callback();
        });

        /* 
            Event 'clientError':
            @argument
                <error>

            This event occurs when the client errors before connexion handshake
        */
        cleartextStream.on('clientError', function(exception) {
            clearConnection();
            self.emit('clientError', exception);
        });

        /* 
            Event 'error': 
            @argument
                <error>
        
            When a connection error occured 
        */
        cleartextStream.on('error', function (exception) {
            clearConnection();
            self.emit('error', exception);
        });
    };

    function ensureConnection(callback) {
      if (cleartextStream && cleartextStream.writable) {
        if (verbose) log('Connection is okay')
        callback();
      } else {
        if (verbose) log('Connection is stale!');
        clearConnection();
        setupConnection(callback);
      }
    }

    function clearConnection() {
      if (cleartextStream) {
        if (verbose) log('Destroying cleartextStream');
        cleartextStream.removeAllListeners();
        cleartextStream.destroy();
      }
      cleartextStream = null;
      buffering = false;
    }


    /* public instance methods */

    /* You may wish to check if it's already buffering so you can manage to buffer notifications by other means, else we do it */
    this.isBuffering = function () { return !!buffering; }

    /* You may provide your own method for nextUID() */
    this.nextUID = function () { return uid++; }

    /* Send an _assumed_ _valid_ notification, you should always check the notification's validity with Notification#isValid() before sending it */
    this.sendNotification = function (notification) {
        if (false === (notification instanceof Notification)) {
            return false;
        }

        if (options.enhanced) {
          notification.identifier = this.nextUID();
        }
        
        ensureConnection(function() {
            if (buffering) { notifications.push(notification); return; } // Default buffering

            if (!cleartextStream.write(notification.toNetwork())) {
                buffering = true;

                /* 
                    Event 'buffer':
                    This event occurs when the socket starts buffering (network too slow?)
                */
                self.emit('buffer');
            }

            /* 
                Event 'sent':
                @argument
                    <notification>
                        
                This event occurs when the notification has been sent to the socket (it may not be sent to the server yet)
            */
            self.emit('sent', notification);
        });
    }

    /* You can request to close the connexion */
    this.close = function (now) {
        if (!now) {
            cleartextStream.destroySoon();
        } else {
            cleartextStream.destroy();
        }
        clearConnection();
    }

    return this;
}
util.inherits(Push, events.EventEmitter);

module.exports = Push;