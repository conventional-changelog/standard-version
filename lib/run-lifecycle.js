const chalk = require('chalk')
const checkpoint = require('./checkpoint')
const figures = require('figures')
const runExec = require('./run-exec')

/**
 * @name runLifecycle
 * @param {object} payload - all available context for a hook
 * @param {string} payload.hookName - the ID of the hook
 * @param {object} payload.args - merged program options
 * @param {object} payload.context - Information/State of the current hook
 * @param {string} payload.context.version - available version string
 * @param {string?} [payload.context.newVersion] - additional version string if more than one are in the current context
 * @param {boolean?} [payload.context.pkgPrivate] - The result of the isPrivate function being run on the contents of the package file
 */
module.exports = async function ({ hookName, args, context }) {
  const scripts = args.scripts
  if (!scripts || !scripts[hookName]) return Promise.resolve()
  const command = scripts[hookName]
  if (typeof command === 'function') {
    checkpoint(args, 'Running lifecycle script "%s"', [hookName])
    checkpoint(args, '- execute command: "%s"', [command.name], chalk.blue(figures.info))
    return command({ hookName, args, context })
  } else {
    checkpoint(args, 'Running lifecycle script "%s"', [hookName])
    checkpoint(args, '- execute command: "%s"', [command], chalk.blue(figures.info))
    return runExec(args, command)
  }
}
