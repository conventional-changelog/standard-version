const chalk = require('chalk')
const figures = require('figures')
const util = require('util')

module.exports = function (argv, msg, args, figure) {
  if (!argv.silent) {
    console.info((figure || chalk.green(figures.tick)) + ' ' + util.format.apply(util, [msg].concat(args.map(function (arg) {
      return chalk.bold(arg)
    }))))
  }
}
