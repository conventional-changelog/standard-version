const chalk = require('chalk')
const figures = require('figures')
const util = require('util')

module.exports = function (args, msg, vars, figure) {
  const defaultFigure = args.dryRun ? chalk.yellow(figures.tick) : chalk.green(figures.tick)
  if (!args.silent) {
    console.info((figure || defaultFigure) + ' ' + util.format.apply(util, [msg].concat(vars.map(function (arg) {
      return chalk.bold(arg)
    }))))
  }
}
