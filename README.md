# Apple Push Notifier for node.js

This library helps you send notifications to iOS devices through Apple's Push Notification Service from the wonderful world of node.js.

The connecting classes (Push and Feedback) are EventEmitter-s and publish a large number of events for you to interface your code.
Both simple and enhenced notifications are handled. 


## Push

### Basics

First, require *node_apns*

```js
var Push = require('node_apns').Push;
```

Create a new on-demand push connexion

```js
var push = Push({
	cert: require('fs').readFileSync('./cert.pem'), 
	key: require('fs').readFileSync('./key.pem')
});
```

Create a new Notification

```js
var Notification = require('node_apns').Notification
,	n = Notification("abcdefghabcdefgh", {foo: "bar", aps:{"alert":"Hello world!", "sound":"default"}});
                      /*  ^----- fake device token hex string */
```

Send the notification

```js
if (n.isValid()) push.sendNotification(n);
```

Register for events

```js
push.on('sent', function (notification) {

	// The notification has been sent to the socket (it may be buffered if the network is slow...)
	console.log('Sent', notification);

});

push.on('notificationError', function (errorCode, uid) {

	// Apple has returned an error:
	console.log('Notification with uid', uid, 'triggered an error:', apns.APNS.errors[errorCode]);

});
```

The connexion is on-demand and will only be active when a notification needs to be sent. After a first notification, it will stay opened until it dies. When it dies, a new notification will trigger the re-connexion.

### Constructor

	Push(tls_options, options)

	tls_options: {cert:cert_data, key:key_data [,...]} // See Node.js documentation at http://nodejs.org/api/tls.html#tls_tls_connect_options_secureconnectlistener

	options: {
		host:<gateway-host | APNS.production.host>, 
		port:<gateway-port | APNS.production.port>, 
		enhenced:<Bool | true>,
		verbose:<Bool | false>
	}

### Events

Push objects emit these events:

* 'clientError' (exception) when a client error occured before connexion
* 'authorized' when connected and authorized
* 'error' (exception) when an error/exception occurs (ENOENT EPIPE etc...)
* 'end' when the server ended the connexion (FIN packet)
* 'close' when the server closed the connexion
* 'notificationError' (String errorCode, notificationUID) when Apple reports a *bad* notification
* 'buffer' when the cleartextStream.write() returned false (meaning it is now buffering writes until next 'drain')
* 'drain' when the cleartextStream is not buffering writes anymore
* 'sent' (notification) when a notification has been written to the cleartextStream

### Additional methods

* push.close([Bool now]): force the closing of a connexion.

## Feedback

Create an immediate feedback connexion

```js
var feedback = require('node_apns').Feedback({cert:cert_data, key:key_data});

feedback.on('device', function (time, token) {
	console.log('Token', token, 'did not respond to notification on', new Date(time * 1000));
});

feedback.on('end', function () {
	console.log('Done');
});
```

### Constructor

	Feedback(tls_options, options)

	tls_options: {cert:cert_data, key:key_data [,...]} // See Node.js documentation at http://nodejs.org/api/tls.html#tls_tls_connect_options_secureconnectlistener

	options: {
		host:<gateway-host | APNS.feedback.host>, 
		port:<gateway-port | APNS.feedback.port>, 
		
		bufferSize:<uint | 1>, /* size of tuple buffer in tuples unit */
		verbose:<Bool | false>
	}


### Events

Feedback objects emit these events:

* 'clientError' (exception) when a client error occured before connexion
* 'error' (exception) when an error/exception occurs (ENOENT EPIPE etc...)
* 'end' when the server ended the connexion (FIN packet)
* 'close' when the server closed the connexion
* 'device' (uint time, String token) when a device token is reported by Apple

## Notification

You can create Notification objects many different ways:

```js
var Device = require("node_apns").Device
	tokenString = "abcdefghabcdefgh";

// Create a notification with no device and no payload
n = Notification(); 
	// then...
	n.device = Device(tokenString); 
	n.alert = "Hello world!";

// Create a notification with no payload
n = Notification(tokenString); 
	// then...
	n.alert = "Hello world!";
	n.badge = 1;

// Create a notification with device and payload
n = Notification(tokenString, {foo: "bar"});
	// then...
	n.alert = "Hello world!";
	n.sound = "default";

// Create a notification with device and full payload
n = Notification(tokenString, {foo: "bar", aps:{alert:"Hello world!", sound:"bipbip.aiff"}});
```

### Checkings

You should always check the notification's validity before sending it.

```js
if (n.isValid()) { push.sendNotification(n); } 
else {
	console.log("Malformed notification", n);
	// ... investigate ...
}
```

## Device

```js
// Create a device object with a token (hex) String
d = Device("abcdefabcdef");

// Create a device object with a Buffer (binary) token
var buffer = new Buffer(32);
d = Device(buffer);
```

### Checkings

The token string must be a valid hex string. You can check it with the isValid() method:

```js
if (d.isValid()) { ... }
```

## "Constants"

Apple's service define some properties that are accessible through the APNS exports

```js
var APNS = {
	/*
		SOURCE: http://developer.apple.com/library/ios/#DOCUMENTATION/NetworkingInternet/Conceptual/RemoteNotificationsPG/CommunicatingWIthAPS/CommunicatingWIthAPS.html
	*/

	development: {
		host: 'gateway.sandbox.push.apple.com',
		port: 2195
	},
	production: {
		host: 'gateway.push.apple.com',
		port: 2195
	},
	feedback: {
		port: 2196,
		tupleSize: 38 /* The feedback binary tuple's size in Bytes (4 + 2 + 32) */
	},
	errors : {
		'0': 'No errors encountered',
		'1': 'Processing error',
		'2': 'Missing device token',
		'3': 'Missing topic',
		'4': 'Missing payload',
		'5': 'Invalid token size',
		'6': 'Invalid topic size',
		'7': 'Invalid payload size',
		'8': 'Invalid token',
		'255': 'None (unknown)'
	}		
};
```

You can use them for example to specify a development gateway to your Push connexion (default is the production gateway)

```js
var push = Push({cert:cert_data, key:key_data}, {
	host: require('node_apns').APNS.development.host
});
```

You can also use the errors to get a meaningful output of the errorCode provided by Apple when 'notificationError' occurs

```js
	push.on('notificationError', function (errorCode, notificationUID) {
		console.log('Notification with UID', notifcationUID, 'Error:', require('node_apns').APNS.errors[errorCode]);
	});
```

# License terms

The MIT License

Copyright (C) 2012 Thierry Passeron

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated 
documentation files (the "Software"), to deal in the Software without restriction, including without limitation 
the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, 
and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED 
TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL 
THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF 
CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER 
DEALINGS IN THE SOFTWARE.
