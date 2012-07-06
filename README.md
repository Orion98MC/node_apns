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

