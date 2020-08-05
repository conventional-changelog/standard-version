const bump = require('../lifecycles/bump')
const chalk = require('chalk')
const checkpoint = require('../checkpoint')
const figures = require('figures')
const runExecFile = require('../run-execFile')
const runLifecycleScript = require('../run-lifecycle-script')

module.exports = function (newVersion, pkgPrivate, args, tagMessage) {
  if (args.skip.tag) return Promise.resolve()
  return runLifecycleScript(args, 'pretag')
    .then(() => {
      return execTag(newVersion, pkgPrivate, args, tagMessage)
    })
    .then(() => {
      return runLifecycleScript(args, 'posttag')
    })
}

function execTag (newVersion, pkgPrivate, args, tagMessage) {
  let tagOption
  if (args.sign) {
    tagOption = '-s'
  } else {
    tagOption = '-a'
  }
  checkpoint(args, 'tagging release %s%s', [args.tagPrefix, newVersion])
  return runExecFile(args, 'git', ['tag', tagOption, args.tagPrefix + newVersion, '-m', tagMessage])
    .then(() => runExecFile('', 'git', ['rev-parse', '--abbrev-ref', 'HEAD']))
    .then((currentBranch) => {
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
    })
}
