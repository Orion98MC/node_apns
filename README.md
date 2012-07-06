Apple Push Notifier for node.js
===============================

Create a push connexion:

	var apns = require('node_apns')
	,	Push = apns.Push
	, 	Notification = apns.Notification
	,	fs = require('fs');


	var push = Push({
		cert: fs.readFileSync('./cert.pem'), 
		key: fs.readFileSync('./key.pem')
	});

Create a Notification:

	var n = Notification("abcdefghabcdefgh", {foo: "bar"});
	n.sound = "default";
	n.badge = 3;

Send a Notification:

	if (n.isValid()) push.sendNotification(n);

Register for events:

	push.on('sent', function (notification) {
		console.log('Sent', notification, 'uid=', notification.identifier);
	});

	push.on('notificationError', function (errorCode, uid) {
		console.log('Notification with uid', uid, 'triggered an error:', apns.APNS.errors[errorCode]);
	});

Feedback
========

	var feedback = apns.Feedback({cert:cert_data, key:key_data});

	feedback.on('device', function (time, token) {
		console.log('Token', token, 'did not respond to notification on', new Date(time * 1000));
	});

	feedback.on('end', function () {
		console.log('Done');
	});

