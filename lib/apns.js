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

module.exports = {
  Push:         require('./push'),
  Feedback:     require('./feedback'),
  Device:       require('./device'),
  Notification: require('./notification'),
  APNS:         require('./constants'),
  services:     require('./services')
};




