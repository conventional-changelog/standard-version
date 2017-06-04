const chalk = require('chalk')
const checkpoint = require('./checkpoint')
const figures = require('figures')
const runExec = require('./run-exec')

module.exports = function (argv, hookName, newVersion, scripts, cb) {
  if (!scripts[hookName]) return Promise.resolve()
  var command = scripts[hookName]
  if (newVersion) command += ' --new-version="' + newVersion + '"'
  checkpoint(argv, 'Running lifecycle script "%s"', [hookName])
  checkpoint(argv, '- execute command: "%s"', [command], chalk.blue(figures.info))
  return runExec(argv, command)
}
