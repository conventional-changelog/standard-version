const chalk = require('chalk')
const checkpoint = require('./checkpoint')
const figures = require('figures')
const runExec = require('./run-exec')

/**
 * @name runLifecycle
 * @param {object} ctx - all available context for a hook
 * @param {object} ctx.args - merged program options
 * @param {string} ctx.hookName - the ID of the hook
 * @param {string} ctx.version - available version string
 * @param {string?} [ctx.newVersion] - additional version string if available
 */
module.exports = async function (ctx) {
  const { args, hookName } = ctx
  const scripts = args.scripts
  if (!scripts || !scripts[hookName]) return Promise.resolve()
  const command = scripts[hookName]
  if (typeof command === 'function') {
    checkpoint(args, 'Running lifecycle script "%s"', [hookName])
    checkpoint(args, '- execute command: "%s"', [command.name], chalk.blue(figures.info))
    return command(ctx)
  } else {
    checkpoint(args, 'Running lifecycle script "%s"', [hookName])
    checkpoint(args, '- execute command: "%s"', [command], chalk.blue(figures.info))
    return runExec(args, command)
  }
}
