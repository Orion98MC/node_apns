var 
  Buffer = require('buffer').Buffer
, Device = require('./device')
;

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
var Notification = function (device, payload) {
    if (false === (this instanceof Notification)) {
        return new Notification(device, payload);
    }
    
    this.expiry = 0;
    this.identifier = undefined;
    this.encoding = "utf8";

    if (device) {
      if (device instanceof Device) this.device = device;
      else this.device = new Device(device);
    }
    
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
Notification.prototype.toNetwork = function () {
    var data = null
    ,   token = this.device.toNetwork()
    ,   tokenLength = token.length
    ,   payloadString = this.payloadString()
    ,   payloadLength = Buffer.byteLength(payloadString, this.encoding);

    var token_and_payload_size = 2 + tokenLength + 2 + payloadLength;
    
    if (typeof(this.identifier) !== "undefined") { /* extended notification format */

        data = new Buffer(1 + 4 + 4 + token_and_payload_size);
        
        data.writeUInt8(1,                  0);                                     
        data.writeUInt32BE(this.identifier, 1);                                     
        data.writeUInt32BE(this.expiry,     5); // Apple's doc says it could be negative but the C example uses uint32_t ??!
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

module.exports = Notification;