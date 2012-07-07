Apple Push Notifier for node.js
===============================

This library helps you send notifications to iOS devices through Apple's Push Notification Service from the wonderful world of node.js.

The connecting classes (Push and Feedback) are EventEmitter-s and publish a large number of events for you to interface your code.
Both simple and enhenced notifications are handled. 


Push
====

Create a new on-demand push connexion:

	var apns = require('node_apns')
	,	Push = apns.Push
	, 	Notification = apns.Notification
	,	fs = require('fs');


	var push = Push({
		cert: fs.readFileSync('./cert.pem'), 
		key: fs.readFileSync('./key.pem')
	});

Create a new Notification:

	var n = Notification("abcdefghabcdefgh", {foo: "bar"});
	n.sound = "default";
	n.badge = 3;

Send a Notification:

	if (n.isValid()) push.sendNotification(n);

Register for events:

	push.on('sent', function (notification) {

		// The notification has been sent to the socket (it may be buffered if the network is slow...)
		console.log('Sent', notification, 'uid=', notification.identifier);

	});

	push.on('notificationError', function (errorCode, uid) {

		// Apple has returned an error:
		console.log('Notification with uid', uid, 'triggered an error:', apns.APNS.errors[errorCode]);

	});

The connexion is on-demand and will only be active when a notification needs to be sent. After a first notification, it will stay opened until it dies. When it dies, a new notification will trigger the re-connexion.

Events
------

Push objects emit these events:

* 'clientError' (exception) when a client error occured before connexion
* 'authorized' when connected and authorized
* 'error' (exception) when an error/exception occurs (ENOENT EPIPE etc...)
* 'end' when the server ended the connexion (FIN packet)
* 'close' when the server closed the connexion
* 'notificationError' (errorCode, notificationUID) when Apple reports a *bad* notification
* 'buffer' when the cleartextStream.write() returned false (meaning it is now buffering writes until next 'drain')
* 'drain' when the cleartextStream is not buffering writes anymore
* 'sent' (notification) when a notification has been written to the cleartextStream

Additional methods
------------------

* push.close([Bool now]): force the closing of a connexion.

Feedback
========

Create an immediate feedback connexion:

	var feedback = apns.Feedback({cert:cert_data, key:key_data});

	feedback.on('device', function (time, token) {
		console.log('Token', token, 'did not respond to notification on', new Date(time * 1000));
	});

	feedback.on('end', function () {
		console.log('Done');
	});

Events
------

Feedback objects emit these events:

* 'clientError' (exception) when a client error occured before connexion
* 'error' (exception) when an error/exception occurs (ENOENT EPIPE etc...)
* 'end' when the server ended the connexion (FIN packet)
* 'close' when the server closed the connexion
* 'device' (time, token) when a device token is reported by Apple

Notification
============

You can create Notification objects many different ways:

	// Create a notification with no device and no payload
	n = Notification(); 
		n.device = apns.Device("abcdefabcdef");
		n.alert = "Hello world!";

	// Create a notification with no payload
	n = Notification("abcdefabcdef"); 
		n.alert = "Hello world!";
		n.badge = 1;

	// Create a notification with device and payload
	n = Notification("abcdefabcdef", {foo: "bar"});
		n.alert = "Hello world!";
		n.sound = "default";

	// Create a notification with device and full payload
	n = Notification("abcdefabcdef", {foo: "bar", aps:{alert:"Hello world!", sound:"bipbip.aiff"}});

Checkings
---------

You should always check the notification's validity before sending it.

	if (n.isValid()) {
		push.sendNotification(n);
	} else {
		console.log("Malformed notification", n);
		// ... investigate ...
	}

Device
======

	// Create a device object with a token String
	d = Device("abcdefabcdef");

	// Create a device object with a Buffer (binary) token
	var buffer = new Buffer(32);
	d = Device(buffer);

Checkings
---------

The token string must be a valid hex string. You can check it with the isValid() method:

	if (d.isValid()) { ... }