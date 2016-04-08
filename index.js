#!/usr/bin/env node
var conventionalChangelog = require('conventional-changelog')
var conventionalRecommendedBump = require('conventional-recommended-bump')
var path = require('path')
var argv = require('yargs')
  .usage('Usage: $0 [options]')
  .option('infile', {
    alias: 'i',
    describe: 'Read the CHANGELOG from this file',
    default: 'CHANGELOG.md',
    global: true
  })
  .option('preset', {
    alias: 'p',
    describe: 'Name of the preset you want to use. Must be one of the following:\nangular, atom, codemirror, ember, eslint, express, jquery, jscs, or jshint',
    default: 'angular',
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
  preset: argv.preset
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
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2), 'utf-8')
  } else {
    console.log(chalk.red(figures.cross) + ' skip version bump on first release')
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
    preset: argv.preset,
    outputUnreleased: true,
    pkg: {
      path: path.resolve(process.cwd(), './package.json')
    }
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
    fs.writeFileSync(argv.infile, header + '\n' + content + oldContent, 'utf-8')
    return cb()
  })
}

function commit (argv, newVersion, cb) {
  var msg = 'committing %s'
  var args = [argv.infile]
  if (!argv.firstRelease) {
    msg += ' and %s'
    args.unshift('package.json')
  }
  checkpoint(msg, args)
  exec('git add package.json ' + argv.infile + ';git commit package.json ' + argv.infile + ' -m "' + formatCommitMessage(argv.message, newVersion) + '"', function (err, stdout, stderr) {
    var errMessage = null
    if (err) errMessage = err.message
    if (stderr) errMessage = stderr
    if (errMessage) {
      console.log(chalk.red(errMessage))
      process.exit(1)
    }
    return cb()
  })
}

function formatCommitMessage (msg, newVersion) {
  return String(msg).indexOf('%s') !== -1 ? util.format(msg, newVersion) : msg
}

function tag (newVersion, argv) {
  checkpoint('tagging release %s', [newVersion])
  exec('git tag -a v' + newVersion + ' -m "' + argv.message + '"', function (err, stdout, stderr) {
    var errMessage = null
    if (err) errMessage = err.message
    if (stderr) errMessage = stderr
    if (errMessage) {
      console.log(chalk.red(errMessage))
      process.exit(1)
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

function checkpoint (msg, args) {
  console.info(chalk.green(figures.tick) + ' ' + util.format.apply(util, [msg].concat(args.map(function (arg) {
    return chalk.bold(arg)
  }))))
};
