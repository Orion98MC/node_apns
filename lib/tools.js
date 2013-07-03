function log () {
    var args = [].slice.call(arguments);
    args.unshift(new Date + " -");
    console.log.apply(null, args);
}

module.exports = {
  log: log
};