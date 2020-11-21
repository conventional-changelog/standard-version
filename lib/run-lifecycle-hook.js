const chalk = require('chalk')
const checkpoint = require('./checkpoint')
const figures = require('figures')
const runSpawn = require('./run-spawn')

module.exports = function (args, hookName, newVersion, hooks, cb) {
  if (!hooks[hookName]) return Promise.resolve()
  const command = hooks[hookName] + ' --new-version="' + newVersion + '"'
  checkpoint(args, 'Running lifecycle hook "%s"', [hookName])
  checkpoint(args, '- hook command: "%s"', [command], chalk.blue(figures.info))
  return runSpawn(args, command)
}
