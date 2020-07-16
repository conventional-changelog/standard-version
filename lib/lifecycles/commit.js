const bump = require('../lifecycles/bump')
const checkpoint = require('../checkpoint')
const formatCommitMessage = require('../format-commit-message')
const path = require('path')
const runExecFile = require('../run-execFile')
const runLifecycleScript = require('../run-lifecycle-script')

module.exports = function (args, newVersion) {
  if (args.skip.commit) return Promise.resolve()
  return runLifecycleScript(args, 'precommit')
    .then((message) => {
      if (message && message.length) args.releaseCommitMessageFormat = message
      return execCommit(args, newVersion)
    })
    .then(() => {
      return runLifecycleScript(args, 'postcommit')
    })
}

function execCommit (args, newVersion) {
  let msg = 'committing %s'
  let paths = []
  const verify = args.verify === false || args.n ? ['--no-verify'] : []
  const sign = args.sign ? ['-S'] : []
  const toAdd = []

  // only start with a pre-populated paths list when CHANGELOG processing is not skipped
  if (!args.skip.changelog) {
    paths = [args.infile]
    toAdd.push(args.infile)
  }

  // commit any of the config files that we've updated
  // the version # for.
  Object.keys(bump.getUpdatedConfigs()).forEach(function (p) {
    paths.unshift(p)
    toAdd.push(path.relative(process.cwd(), p))

    // account for multiple files in the output message
    if (paths.length > 1) {
      msg += ' and %s'
    }
  })

  if (args.commitAll) {
    msg += ' and %s'
    paths.push('all staged files')
  }

  checkpoint(args, msg, paths)

  // nothing to do, exit without commit anything
  if (args.skip.changelog && args.skip.bump && toAdd.length === 0) {
    return Promise.resolve()
  }

  return runExecFile(args, 'git', ['add'].concat(toAdd))
    .then(() => {
      return runExecFile(
        args,
        'git',
        [
          'commit'
        ].concat(
          verify,
          sign,
          args.commitAll ? [] : toAdd,
          [
            '-m',
            `${formatCommitMessage(args.releaseCommitMessageFormat, newVersion)}`
          ]
        )
      )
    })
}
