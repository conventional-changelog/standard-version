const chalk = require('chalk')
const checkpoint = require('./checkpoint')
const figures = require('figures')
const runExec = require('./run-exec')

module.exports = function (args, hookName, newVersion) {
  const scripts = args.scripts
  if (!scripts || !scripts[hookName]) return Promise.resolve()
  var command = scripts[hookName]
  if (newVersion) command += ' --new-version="' + newVersion + '"'
  checkpoint(args, 'Running lifecycle script "%s"', [hookName])
  checkpoint(args, '- execute command: "%s"', [command], chalk.blue(figures.info))
  return runExec(args, command)
}
