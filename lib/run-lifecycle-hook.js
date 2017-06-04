const chalk = require('chalk')
const checkpoint = require('./checkpoint')
const figures = require('figures')
const runExec = require('./run-exec')

module.exports = function (argv, hookName, newVersion, hooks, cb) {
  if (!hooks[hookName]) {
    cb()
    return
  }
  var command = hooks[hookName] + ' --new-version="' + newVersion + '"'
  checkpoint(argv, 'Running lifecycle hook "%s"', [hookName])
  checkpoint(argv, '- hook command: "%s"', [command], chalk.blue(figures.info))
  runExec(argv, command, cb, function () {
    cb()
  })
}
