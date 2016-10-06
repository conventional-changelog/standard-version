var conventionalRecommendedBump = require('conventional-recommended-bump')
var conventionalChangelog = require('conventional-changelog')
var path = require('path')

var chalk = require('chalk')
var figures = require('figures')
var exec = require('child_process').exec
var fs = require('fs')
var accessSync = require('fs-access').sync
var semver = require('semver')
var util = require('util')
var objectAssign = require('object-assign')

module.exports = function standardVersion (argv, done) {
  var pkgPath = path.resolve(process.cwd(), './package.json')
  var pkg = require(pkgPath)
  var defaults = require('./defaults')

  argv = objectAssign(defaults, argv)

  conventionalRecommendedBump({
    preset: 'angular'
  }, function (err, release) {
    if (err) {
      printError(argv, err.message)
      return done(err)
    }

    var newVersion = pkg.version
    if (!argv.firstRelease) {
      newVersion = semver.inc(pkg.version, release.releaseType)
      checkpoint(argv, 'bumping version in package.json from %s to %s', [pkg.version, newVersion])
      pkg.version = newVersion
      fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf-8')
    } else {
      checkpoint(argv, 'skip version bump on first release', [], chalk.red(figures.cross))
    }

    outputChangelog(argv, function (err) {
      if (err) {
        return done(err)
      }
      commit(argv, newVersion, function (err) {
        if (err) {
          return done(err)
        }
        return tag(newVersion, pkg.private, argv, done)
      })
    })
  })
}

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
      return cb(err)
    })

  changelogStream.on('data', function (buffer) {
    content += buffer.toString()
  })

  changelogStream.on('end', function () {
    checkpoint(argv, 'outputting changes to %s', [argv.infile])
    fs.writeFileSync(argv.infile, header + '\n' + (content + oldContent).replace(/\n+$/, '\n'), 'utf-8')
    return cb()
  })
}

function handledExec (argv, cmd, errorCb, successCb) {
  // Exec given cmd and handle possible errors

  exec(cmd, function (err, stdout, stderr) {
    // If exec returns content in stderr, but no error, print it as a warning
    // If exec returns an error, print it and exit with return code 1
    if (err) {
      printError(argv, stderr || err.message)
      return errorCb(err)
    } else if (stderr) {
      printError(argv, stderr, {level: 'warn', color: 'yellow'})
    }
    successCb()
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
  checkpoint(argv, msg, args)

  handledExec(argv, 'git add package.json ' + argv.infile, cb, function () {
    handledExec(argv, 'git commit ' + verify + (argv.sign ? '-S ' : '') + (argv.commitAll ? '' : ('package.json ' + argv.infile)) + ' -m "' + formatCommitMessage(argv.message, newVersion) + '"', cb, function () {
      cb()
    })
  })
}

function formatCommitMessage (msg, newVersion) {
  return String(msg).indexOf('%s') !== -1 ? util.format(msg, newVersion) : msg
}

function tag (newVersion, pkgPrivate, argv, cb) {
  var tagOption
  if (argv.sign) {
    tagOption = '-s '
  } else {
    tagOption = '-a '
  }
  checkpoint(argv, 'tagging release %s', [newVersion])
  handledExec(argv, 'git tag ' + tagOption + 'v' + newVersion + ' -m "' + formatCommitMessage(argv.message, newVersion) + '"', cb, function () {
    var message = 'git push --follow-tags origin master'
    if (pkgPrivate !== true) message += '; npm publish'

    checkpoint(argv, 'Run `%s` to publish', [message], chalk.blue(figures.info))
    cb()
  })
}

function createIfMissing (argv) {
  try {
    accessSync(argv.infile, fs.F_OK)
  } catch (err) {
    if (err.code === 'ENOENT') {
      checkpoint(argv, 'created %s', [argv.infile])
      argv.outputUnreleased = true
      fs.writeFileSync(argv.infile, '\n', 'utf-8')
    }
  }
}

function checkpoint (argv, msg, args, figure) {
  if (!argv.silent) {
    console.info((figure || chalk.green(figures.tick)) + ' ' + util.format.apply(util, [msg].concat(args.map(function (arg) {
      return chalk.bold(arg)
    }))))
  }
}

function printError (argv, msg, opts) {
  if (!argv.silent) {
    opts = objectAssign({
      level: 'error',
      color: 'red'
    }, opts)

    console[opts.level](chalk[opts.color](msg))
  }
}
