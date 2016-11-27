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
  var args = objectAssign({}, defaults, argv)

  bumpVersion(args.releaseAs, function (err, release) {
    if (err) {
      printError(args, err.message)
      return done(err)
    }

    var newVersion = pkg.version

    if (!args.firstRelease) {
      var releaseType = getReleaseType(args.prerelease, release.releaseType, pkg.version)
      newVersion = semver.inc(pkg.version, releaseType, args.prerelease)
      updateConfigs(args, newVersion)
    } else {
      checkpoint(args, 'skip version bump on first release', [], chalk.red(figures.cross))
    }

    outputChangelog(args, function (err) {
      if (err) {
        return done(err)
      }
      commit(args, newVersion, function (err) {
        if (err) {
          return done(err)
        }
        return tag(newVersion, pkg.private, args, done)
      })
    })
  })
}

/**
 * attempt to update the version # in a collection of common config
 * files, e.g., package.json, bower.json.
 *
 * @param argv config object
 * @param newVersion version # to update to.
 * @return {string}
 */
var configsToUpdate = {}
function updateConfigs (args, newVersion) {
  configsToUpdate[path.resolve(process.cwd(), './package.json')] = false
  configsToUpdate[path.resolve(process.cwd(), './bower.json')] = false
  Object.keys(configsToUpdate).forEach(function (configPath) {
    try {
      var stat = fs.lstatSync(configPath)
      if (stat.isFile()) {
        var config = require(configPath)
        var filename = path.basename(configPath)
        checkpoint(args, 'bumping version in ' + filename + ' from %s to %s', [config.version, newVersion])
        config.version = newVersion
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8')
        // flag any config files that we modify the version # for
        // as having been updated.
        configsToUpdate[configPath] = true
      }
    } catch (err) {
      if (err.code !== 'ENOENT') console.warn(err.message)
    }
  })
}

function getReleaseType (prerelease, expectedReleaseType, currentVersion) {
  if (isString(prerelease)) {
    if (isInPrerelease(currentVersion)) {
      if (shouldContinuePrerelease(currentVersion, expectedReleaseType) ||
        getTypePriority(getCurrentActiveType(currentVersion)) > getTypePriority(expectedReleaseType)
      ) {
        return 'prerelease'
      }
    }

    return 'pre' + expectedReleaseType
  } else {
    return expectedReleaseType
  }
}

function isString (val) {
  return typeof val === 'string'
}

/**
 * if a version is currently in pre-release state,
 * and if it current in-pre-release type is same as expect type,
 * it should continue the pre-release with the same type
 *
 * @param version
 * @param expectType
 * @return {boolean}
 */
function shouldContinuePrerelease (version, expectType) {
  return getCurrentActiveType(version) === expectType
}

function isInPrerelease (version) {
  return Array.isArray(semver.prerelease(version))
}

var TypeList = ['major', 'minor', 'patch'].reverse()

/**
 * extract the in-pre-release type in target version
 *
 * @param version
 * @return {string}
 */
function getCurrentActiveType (version) {
  var typelist = TypeList
  for (var i = 0; i < typelist.length; i++) {
    if (semver[typelist[i]](version)) {
      return typelist[i]
    }
  }
}

/**
 * calculate the priority of release type,
 * major - 2, minor - 1, patch - 0
 *
 * @param type
 * @return {number}
 */
function getTypePriority (type) {
  return TypeList.indexOf(type)
}

function bumpVersion (releaseAs, callback) {
  if (releaseAs) {
    callback(null, {
      releaseType: releaseAs
    })
  } else {
    conventionalRecommendedBump({
      preset: 'angular'
    }, function (err, release) {
      callback(err, release)
    })
  }
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
  }, undefined, {merges: null})
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
  var toAdd = ''
  // commit any of the config files that we've updated
  // the version # for.
  Object.keys(configsToUpdate).forEach(function (p) {
    if (configsToUpdate[p]) {
      msg += ' and %s'
      args.unshift(path.basename(p))
      toAdd += ' ' + path.relative(process.cwd(), p)
    }
  })
  checkpoint(argv, msg, args)
  handledExec(argv, 'git add' + toAdd + ' ' + argv.infile, cb, function () {
    handledExec(argv, 'git commit ' + verify + (argv.sign ? '-S ' : '') + (argv.commitAll ? '' : (argv.infile + toAdd)) + ' -m "' + formatCommitMessage(argv.message, newVersion) + '"', cb, function () {
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
  handledExec(argv, 'git tag ' + tagOption + argv.tagPrefix + newVersion + ' -m "' + formatCommitMessage(argv.message, newVersion) + '"', cb, function () {
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
