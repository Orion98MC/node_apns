var 
  util = require('util')
, events = require('events')
, tls = require('tls')
, Buffer = require('buffer').Buffer
, APNS = require('./constants')
, log = require('./tools').log
;

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

module.exports = Feedback;