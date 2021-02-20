const bump = require('../lifecycles/bump')
const checkpoint = require('../checkpoint')
const formatCommitMessage = require('../format-commit-message')
const path = require('path')
const runExecFile = require('../run-execFile')
const runLifecycleScript = require('../run-lifecycle-script')

module.exports = async function (args, newVersion) {
  if (args.skip.commit) return
  const message = await runLifecycleScript(args, 'precommit')
  if (message && message.length) args.releaseCommitMessageFormat = message
  await execCommit(args, newVersion)
  await runLifecycleScript(args, 'postcommit')
}

async function execCommit (args, newVersion) {
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
    return
  }

  await runExecFile(args, 'git', ['add'].concat(toAdd))
  await runExecFile(
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
}
