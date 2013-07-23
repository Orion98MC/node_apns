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
        getHost: function (scheme /* "development" or "production" */) {
          scheme = scheme || "production";
          return APNS[scheme].host.replace('gateway','feedback');
        },
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

module.exports = APNS;