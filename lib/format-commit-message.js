const util = require('util')

module.exports = function (msg, newVersion) {
  return String(msg).indexOf('%s') !== -1 ? util.format(msg, newVersion) : msg
}
