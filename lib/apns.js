/*
    Simple Apple Push Notifier for node.js

    => EventEmitter, many event are sent for you to interface your code
    => The connexion is made as needed and never closed 
    => tls connexion options are left to the programmer
    => bundled caching/drain mecanisme when the socket buffer is full, can also be implemented by the programmer
    => handles simple and enhenced notifications
    => bundled enhenced notifications uid creation, can also be implemented by the programmer

    (C) 2012, Thierry Passeron
*/

var util = require('util')
,   events = require('events')
,   tls = require('tls')
,   fs = require('fs')
,   Buffer = require('buffer').Buffer
;

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

function log () {
    var args = [].slice.call(arguments);
    args.unshift(new Date + " -");
    console.log.apply(null, args);
}


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
            });

            /* 
                Event 'close':
                The connection was closed (timed-out or Apple closed it) 
            */
            cleartextStream.once('close', function () {
                clearConnection();
                self.emit('close');
            });

            cleartextStream.on('timeout', function () {
                if (verbose) log('timed-out');
                cleartextStream.destroy();
                clearConnection();
            });

            cleartextStream.on('end', function () {
                if (verbose) log('end');
                clearConnection();
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
                    var still_buffered = !cleartextStream.write(notification.toNetwork(options.enhanced ? self.nextUID() : null));
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
            callback();
        } else {
            clearConnection();
            setupConnection(callback);
        }
    }

    function clearConnection() {
        if (cleartextStream) cleartextStream.removeAllListeners();
        cleartextStream = null;
        buffering = false;
    }


    /* public instance methods */

    /* You may wish to check if it's already buffering so you can manage to buffer notifications by other means, else we do it */
    this.isBuffering = function () { return !!buffering; }

    /* You may provide your own method for nextID() */
    this.nextUID = function () { return uid++; }

    /* Send an _assumed_ _valid_ notification, you should always check the notification's validity with Notification#isValid() before sending it */
    this.sendNotification = function (notification) {
        if (false === (notification instanceof Notification)) {
            return false;
        }

        ensureConnection(function() {
            if (buffering) { notifications.push(notification); return; } // Default buffering

            if (!cleartextStream.write(notification.toNetwork(options.enhanced ? self.nextUID() : null))) {
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


/*
    Feedback(<tls_options> [, <options>]);

    Connect to the feedback service and retrieve the informations.

    Usage:

        var feedback = require('node_apns').Feedback({cert:cert_data, key:key_data});

        feedback.on('device', function(time, token) {
            console.log('Token', token, "is not responding since", new Date(time * 1000));
        });

        feedback.on('end', function () { 
            console.log('Done!'); 
        });
*/
function Feedback(tls_opts, opts) {
    if (false === (this instanceof Feedback)) {
        return new Feedback(tls_opts, opts);
    }
    
    events.EventEmitter.call(this);

    var options = {
        host: (function() { return APNS.production.host.replace('gateway','feedback'); })(),
        port: APNS.feedback.port,

        bufferSize: 1, /* number of tuples that are cached before being flushed */
        verbose: false /* verbose mode, say more about what is going on */
    };

    // Merge options
    for (key in opts) {
        if (opts.hasOwnProperty(key)) options[key] = opts[key];
    }

    // Options checking
    if (!tls_opts) throw "No feedback tls connection options";

    var cleartextStream = null  /* holds the connection to Apple */
    ,   buffer = new Buffer(APNS.feedback.tupleSize * options.bufferSize) /* holds the received data from Apple */
    ,   freeIndex = 0 /* the index from which the buffer can be filled with meaningful values */
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

    function setupConnection () {
        cleartextStream = tls.connect(options.port, options.host, tls_opts, function () {
            if (verbose) log('Feedback from ' + options.host + ':' + options.port);

            if (!cleartextStream.authorized) { throw cleartextStream.authorizationError; }

            cleartextStream.on('data', function (data) { feedBuffer(data); });

            cleartextStream.on('end', function () {
                if (freeIndex > 0) { // Flush
                    if (verbose) log('Flushing');
                    tuples(function(time, token) {
                        self.emit('device', time, token.toString('hex'));
                    });
                    freeIndex = 0;
                }
                self.emit('end');
                clearConnection();
            });

            cleartextStream.on('close', function () {
                clearConnection();
                self.emit('close');
            });
        });

        cleartextStream.on('clientError', function(exception) {
            clearConnection();
            self.emit('clientError', exception);
        });

        cleartextStream.on('error', function (exception) {
            clearConnection();
            self.emit('error', exception);
        });
    }

    function clearConnection() {
        if (cleartextStream) cleartextStream.removeAllListeners();
        cleartextStream = null;
    }

    function feedBuffer(data) {
        var freeBytes = buffer.length - freeIndex;
        if (freeBytes > 0) {

            if (freeBytes > data.length) {

                data.copy(buffer, freeIndex, 0, data.length);
                freeIndex = freeIndex + data.length;

            } else {
                
                data.copy(buffer, freeIndex, 0, freeBytes);
                freeIndex = freeIndex + freeBytes;

                feedBuffer(data.slice(freeBytes));

            }

        } else {

            // Consume buffer
            tuples(function (time, token) {
                /*              
                    Event 'device': 
                    @arguments 
                        <time(uint)>, <token(hex String)>
                */
                self.emit('device', time, token.toString('hex'));
            });
            freeIndex = 0; // buffer is now *empty*

            if (data && data.length) feedBuffer(data);
        }
    }

    function tuples (callback) {
        for (var i = 0; i < freeIndex; i = i + APNS.feedback.tupleSize) {
            var tuple = new Buffer(APNS.feedback.tupleSize);
            buffer.copy(tuple, 0, i, tuple.length);

            // Bytes    value
            // 4 UBE    time (UTC)
            // 2 UBE    tokenLength
            // 32       token
                
            callback(tuple.readUInt32BE(0), tuple.slice(6, tuple.readUInt16BE(4) + 6));
        }
    }

    process.nextTick(setupConnection);

    return this;
}
util.inherits(Feedback, events.EventEmitter);

/* 
    Create a new notification object

    Usage:

        // Create a notification with no device and no payload
        n = apns.Notification(); 
            n.device = apns.Device("abcdefabcdef");
            n.alert = "Hello world!";

        // Create a notification with no payload
        n = apns.Notification("abcdefabcdef"); 
            n.alert = "Hello world!";
            n.badge = 1;

        // Create a notification with device and payload
        n = apns.Notification("abcdefabcdef", {foo: "bar"});
            n.alert = "Hello world!";
            n.sound = "default";

        // Create a notification with device and full payload
        n = apns.Notification("abcdefabcdef", {foo: "bar", aps:{alert:"Hello world!", sound:"bipbip.aiff"}});

    Checkings:

        You should always check the notification's validity before sending it.

        if (n.isValid()) {
            push.sendNotification(n);
        } else {
            console.log("Malformed notification", n);
            // ... investigate ...
        }

*/
var Notification = function (token, payload) {
    if (false === (this instanceof Notification)) {
        return new Notification(token, payload);
    }
    
    this.expiry = 0;
    this.identifier = undefined;
    this.encoding = "utf8";

    if (token) this.device = new Device(token);
    if (payload) this.payload = payload;

    // Placeholders
    this.alert = undefined;
    this.badge = undefined;
    this.sound = undefined;

    return this;
};

/* Basic checking of the notification's validity */
Notification.prototype.isValid = function () {
    if (!this.device || !this.device.isValid()) return false;

    var normalized = this.normalizedPayload();
    if (Buffer.byteLength(JSON.stringify(normalized), this.encoding) > 256) return false;
    if (!normalized.aps.alert && !normalized.aps.sound && !normalized.aps.badge) return false;

    return true;
}

Notification.prototype.normalizedPayload = function () {
    var normalized = {};
    // Copy the payload so we don't alter the original notification object
    for (var key in this.payload) {
        if (this.payload.hasOwnProperty(key)) normalized[key] = this.payload[key];
    }
    if (!normalized.aps) normalized.aps = {};
    if (typeof(this.alert) === 'string') normalized.aps.alert = this.alert;
    if (typeof(this.sound) === 'string') normalized.aps.sound = this.sound;
    if (typeof(this.badge) === 'number') normalized.aps.badge = this.badge;
    return normalized;
}

Notification.prototype.payloadString = function () {
    return JSON.stringify(this.normalizedPayload());
}

/* Output the notification in network (binary) format */
Notification.prototype.toNetwork = function (uid) {
    var data = null
    ,   token = this.device.toNetwork()
    ,   tokenLength = token.length
    ,   payloadString = this.payloadString()
    ,   payloadLength = Buffer.byteLength(payloadString, this.encoding);

    var token_and_payload_size = 2 + tokenLength + 2 + payloadLength;
    
    if (typeof(uid) !== "undefined") { /* extended notification format */

        this.identifier = uid; // Set the uid in the notification

        data = new Buffer(1 + 4 + 4 + token_and_payload_size);
        
        data.writeUInt8(1,              0);                                     
        data.writeUInt32BE(uid,         1);                                     
        data.writeUInt32BE(this.expiry, 5); // Apple's doc says it could be negative but the C example uses uint32_t ??!
                                            // Comments ?...
                                            //
                                            // SOURCE: You can specify zero or a value less than zero to request that APNs not store the notification at all.
                                            //
                                            //     /* expiry date network order */
                                            //     memcpy(binaryMessagePt, &networkOrderExpiryEpochUTC, sizeof(uint32_t));

    } else { /* simple notification format */

        data = new Buffer(1 + token_and_payload_size);

        data.writeUInt8(0, 0);
        
    }

    var token_start_index = data.length - token_and_payload_size;

    data.writeUInt16BE(tokenLength,     token_start_index);
    token.copy(data,                    token_start_index + 2);
    data.writeUInt16BE(payloadLength,   token_start_index + 2 + tokenLength);
    data.write(payloadString,           token_start_index + 2 + tokenLength + 2, payloadLength, this.encoding);

    return data;
};

/* 
    Create a device with a token
    @arguments
        token: a hex String or a Buffer

    Usage:

        // Create a device object with a token String
        d = apns.Device("abcdefabcdef");

        // Create a device object with a Buffer token
        var buffer = new Buffer(32);
        d = apns.Device(buffer);

*/
var Device = function (token) {
    if (false === (this instanceof Device)) {
        return new Device(token);
    }

    if (!token) throw "No token";

    if ((typeof(token) === "object") && (token instanceof Buffer)) {
        token = token.toString('hex');
    }

    this.token = token;
    return this;
};

// Check if a device is valid (basic checking, we only check it's a valid hex string)
Device.prototype.isValid = function () {
    try { this.toNetwork(); } catch (e) {
        return false;
    }
    return true;
}

// Return the token in network (binary) format
Device.prototype.toNetwork = function () {
    return new Buffer(this.token.replace(/\s+/g, ''), 'hex');
};

exports.APNS = APNS;
exports.Push = Push;
exports.Feedback = Feedback;
exports.Notification = Notification;
exports.Device = Device;
