const chalk = require('chalk')

module.exports = function (args, msg, opts) {
  if (!args.silent || args.printError) {
    opts = Object.assign({
      level: 'error',
      color: 'red'
    }, opts)

    console[opts.level](chalk[opts.color](msg))
  }
}
