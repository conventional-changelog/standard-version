const chalk = require('chalk')

module.exports = function (argv, msg, opts) {
  if (!argv.silent) {
    opts = Object.assign({
      level: 'error',
      color: 'red'
    }, opts)

    console[opts.level](chalk[opts.color](msg))
  }
}
