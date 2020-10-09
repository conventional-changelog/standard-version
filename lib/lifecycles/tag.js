const bump = require('../lifecycles/bump')
const chalk = require('chalk')
const checkpoint = require('../checkpoint')
const figures = require('figures')
const formatCommitMessage = require('../format-commit-message')
const runExecFile = require('../run-execFile')
const runLifecycleHook = require('../run-lifecycle-hook')

module.exports = async function (newVersion, pkgPrivate, args) {
  if (args.skip.tag) return
  await runLifecycleHook({hookName: 'pretag',args:{...args, pkgPrivate},version: newVersion})
  await execTag(newVersion, pkgPrivate, args)
  await runLifecycleHook({hookName: 'posttag',args:{...args, pkgPrivate},version: newVersion})
}

async function execTag (newVersion, pkgPrivate, args) {
  let tagOption
  if (args.sign) {
    tagOption = '-s'
  } else {
    tagOption = '-a'
  }
  checkpoint(args, 'tagging release %s%s', [args.tagPrefix, newVersion])
  await runExecFile(args, 'git', ['tag', tagOption, args.tagPrefix + newVersion, '-m', `${formatCommitMessage(args.releaseCommitMessageFormat, newVersion)}`])
  const currentBranch = await runExecFile('', 'git', ['rev-parse', '--abbrev-ref', 'HEAD'])
  let message = 'git push --follow-tags origin ' + currentBranch.trim()
  if (pkgPrivate !== true && bump.getUpdatedConfigs()['package.json']) {
    message += ' && npm publish'
    if (args.prerelease !== undefined) {
      if (args.prerelease === '') {
        message += ' --tag prerelease'
      } else {
        message += ' --tag ' + args.prerelease
      }
    }
  }

  checkpoint(args, 'Run `%s` to publish', [message], chalk.blue(figures.info))
}
