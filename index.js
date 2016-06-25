#!/usr/bin/env node
var conventionalRecommendedBump = require('conventional-recommended-bump')
var conventionalChangelog = require('conventional-changelog')
var path = require('path')
var argv = require('yargs')
  .usage('Usage: $0 [options]')
  .option('infile', {
    alias: 'i',
    describe: 'Read the CHANGELOG from this file',
    default: 'CHANGELOG.md',
    global: true
  })
  .option('message', {
    alias: 'm',
    describe: 'Commit message, replaces %s with new version',
    type: 'string',
    default: 'chore(release): %s',
    global: true
  })
  .option('first-release', {
    alias: 'f',
    describe: 'Is this the first release?',
    type: 'boolean',
    default: false,
    global: true
  })
  .option('sign', {
    alias: 's',
    describe: 'Should the git commit and tag be signed?',
    type: 'boolean',
    default: false,
    global: true
  })
  .option('no-verify', {
    alias: 'n',
    describe: 'Bypass pre-commit or commit-msg git hooks during the commit phase',
    type: 'boolean',
    default: false,
    global: true
  })
  .help()
  .alias('help', 'h')
  .example('$0', 'Update changelog and tag release')
  .example('$0 -m "%s: see changelog for details"', 'Update changelog and tag release with custom commit message')
  .wrap(97)
  .argv

var chalk = require('chalk')
var figures = require('figures')
var exec = require('child_process').exec
var fs = require('fs')
var accessSync = require('fs-access').sync
var pkgPath = path.resolve(process.cwd(), './package.json')
var pkg = require(pkgPath)
var semver = require('semver')
var util = require('util')

conventionalRecommendedBump({
  preset: 'angular'
}, function (err, release) {
  if (err) {
    console.error(chalk.red(err.message))
    return
  }

  var newVersion = pkg.version
  if (!argv.firstRelease) {
    newVersion = semver.inc(pkg.version, release.releaseAs)
    checkpoint('bumping version in package.json from %s to %s', [pkg.version, newVersion])
    pkg.version = newVersion
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf-8')
  } else {
    checkpoint('skip version bump on first release', [], chalk.red(figures.cross))
  }

  outputChangelog(argv, function () {
    commit(argv, newVersion, function () {
      return tag(newVersion, argv)
    })
  })
})

function outputChangelog (argv, cb) {
  createIfMissing(argv)
  var header = '# Change Log\n\nAll notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.\n'
  var oldContent = fs.readFileSync(argv.infile, 'utf-8')
  // find the position of the last release and remove header:
  if (oldContent.indexOf('<a name=') !== -1) {
    oldContent = oldContent.substring(oldContent.indexOf('<a name='))
  }
  var content = ''
  var changelogStream = conventionalChangelog({
    preset: 'angular'
  })
  .on('error', function (err) {
    console.error(chalk.red(err.message))
    process.exit(1)
  })

  changelogStream.on('data', function (buffer) {
    content += buffer.toString()
  })

  changelogStream.on('end', function () {
    checkpoint('outputting changes to %s', [argv.infile])
    fs.writeFileSync(argv.infile, header + '\n' + (content + oldContent).replace(/\n+$/, '\n'), 'utf-8')
    return cb()
  })
}

function commit (argv, newVersion, cb) {
  var msg = 'committing %s'
  var args = [argv.infile]
  var verify = argv.verify === false || argv.n ? '--no-verify ' : ''
  if (!argv.firstRelease) {
    msg += ' and %s'
    args.unshift('package.json')
  }
  checkpoint(msg, args)

  function handleExecError (err, stderr) {
    // If exec returns an error or content in stderr, log it and exit with return code 1
    var errMessage = stderr || (err && err.message)
    if (errMessage) {
      console.log(chalk.red(errMessage))
      process.exit(1)
    }
  }
  exec('git add package.json ' + argv.infile, function (err, stdout, stderr) {
    handleExecError(err, stderr)
    exec('git commit ' + verify + (argv.sign ? '-S ' : '') + 'package.json ' + argv.infile + ' -m "' + formatCommitMessage(argv.message, newVersion) + '"', function (err, stdout, stderr) {
      handleExecError(err, stderr)
      return cb()
    })
  })
}

function formatCommitMessage (msg, newVersion) {
  return String(msg).indexOf('%s') !== -1 ? util.format(msg, newVersion) : msg
}

function tag (newVersion, argv) {
  var tagOption
  if (argv.sign) {
    tagOption = '-s '
  } else {
    tagOption = '-a '
  }
  checkpoint('tagging release %s', [newVersion])
  exec('git tag ' + tagOption + 'v' + newVersion + ' -m "' + formatCommitMessage(argv.message, newVersion) + '"', function (err, stdout, stderr) {
    var errMessage = null
    if (err) errMessage = err.message
    if (stderr) errMessage = stderr
    if (errMessage) {
      console.log(chalk.red(errMessage))
      process.exit(1)
    } else {
      checkpoint('Run `%s` to publish', [
        'git push --follow-tags origin master; npm publish'
      ], chalk.blue(figures.info))
    }
  })
}

function createIfMissing (argv) {
  try {
    accessSync(argv.infile, fs.F_OK)
  } catch (err) {
    if (err.code === 'ENOENT') {
      checkpoint('created %s', [argv.infile])
      argv.outputUnreleased = true
      fs.writeFileSync(argv.infile, '\n', 'utf-8')
    }
  }
}

function checkpoint (msg, args, figure) {
  console.info((figure || chalk.green(figures.tick)) + ' ' + util.format.apply(util, [msg].concat(args.map(function (arg) {
    return chalk.bold(arg)
  }))))
};
