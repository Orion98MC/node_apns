var 
  Buffer = require('buffer').Buffer
;

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

module.exports = Device;
