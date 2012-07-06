Apple Push Notifier for node.js
===============================

Usage:

	var apns = require('node_apns')
	,	Push = apns.Push
	, 	Notification = apns.Notification
	,	fs = require('fs');


	var push = Push({
		cert: fs.readFileSync('./cert.pem'), 
		key: fs.readFileSync('./key.pem')
	});
