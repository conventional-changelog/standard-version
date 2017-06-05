const conventionalRecommendedBump = require('conventional-recommended-bump')
const conventionalChangelog = require('conventional-changelog')
const path = require('path')

const chalk = require('chalk')
const figures = require('figures')
const fs = require('fs')
const accessSync = require('fs-access').sync
const semver = require('semver')
const util = require('util')

const checkpoint = require('./lib/checkpoint')
const printError = require('./lib/print-error')
const runExec = require('./lib/run-exec')
const runLifecycleScript = require('./lib/run-lifecycle-script')
const writeFile = require('./lib/write-file')

module.exports = function standardVersion (argv) {
  var pkgPath = path.resolve(process.cwd(), './package.json')
  var pkg = require(pkgPath)
  var newVersion = pkg.version
  var defaults = require('./defaults')
  var args = Object.assign({}, defaults, argv)

  return runLifecycleScript(args, 'prebump', null)
    .then((stdout) => {
      if (stdout && stdout.trim().length) args.releaseAs = stdout.trim()
      return bumpVersion(args.releaseAs)
    })
    .then((release) => {
      if (!args.firstRelease) {
        var releaseType = getReleaseType(args.prerelease, release.releaseType, pkg.version)
        newVersion = semver.valid(releaseType) || semver.inc(pkg.version, releaseType, args.prerelease)
        updateConfigs(args, newVersion)
      } else {
        checkpoint(args, 'skip version bump on first release', [], chalk.red(figures.cross))
      }

      return runLifecycleScript(args, 'postbump', newVersion, args)
    })
    .then(() => {
      return outputChangelog(args, newVersion)
    })
    .then(() => {
      return runLifecycleScript(args, 'precommit', newVersion, args)
    })
    .then((message) => {
      if (message && message.length) args.message = message
      return commit(args, newVersion)
    })
    .then(() => {
      return tag(newVersion, pkg.private, args)
    })
    .catch((err) => {
      printError(args, err.message)
      throw err
    })
}

/**
 * attempt to update the version # in a collection of common config
 * files, e.g., package.json, bower.json.
 *
 * @param args config object
 * @param newVersion version # to update to.
 * @return {string}
 */
var configsToUpdate = {}
function updateConfigs (args, newVersion) {
  configsToUpdate[path.resolve(process.cwd(), './package.json')] = false
  configsToUpdate[path.resolve(process.cwd(), './npm-shrinkwrap.json')] = false
  configsToUpdate[path.resolve(process.cwd(), './bower.json')] = false
  Object.keys(configsToUpdate).forEach(function (configPath) {
    try {
      var stat = fs.lstatSync(configPath)
      if (stat.isFile()) {
        var config = require(configPath)
        var filename = path.basename(configPath)
        checkpoint(args, 'bumping version in ' + filename + ' from %s to %s', [config.version, newVersion])
        config.version = newVersion
        writeFile(args, configPath, JSON.stringify(config, null, 2) + '\n')
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
  return new Promise((resolve, reject) => {
    if (releaseAs) {
      return resolve({
        releaseType: releaseAs
      })
    } else {
      conventionalRecommendedBump({
        preset: 'angular'
      }, function (err, release) {
        if (err) return reject(err)
        else return resolve(release)
      })
    }
  })
}

function outputChangelog (args, newVersion) {
  return new Promise((resolve, reject) => {
    createIfMissing(args)
    var header = '# Change Log\n\nAll notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.\n'
    var oldContent = args.dryRun ? '' : fs.readFileSync(args.infile, 'utf-8')
    // find the position of the last release and remove header:
    if (oldContent.indexOf('<a name=') !== -1) {
      oldContent = oldContent.substring(oldContent.indexOf('<a name='))
    }
    var content = ''
    var context
    if (args.dryRun) context = {version: newVersion}
    var changelogStream = conventionalChangelog({
      preset: 'angular'
    }, context, {merges: null})
      .on('error', function (err) {
        return reject(err)
      })

    changelogStream.on('data', function (buffer) {
      content += buffer.toString()
    })

    changelogStream.on('end', function () {
      checkpoint(args, 'outputting changes to %s', [args.infile])
      if (args.dryRun) console.info(`\n---\n${chalk.gray(content.trim())}\n---\n`)
      else writeFile(args, args.infile, header + '\n' + (content + oldContent).replace(/\n+$/, '\n'))
      return resolve()
    })
  })
}

function commit (args, newVersion) {
  var msg = 'committing %s'
  var paths = [args.infile]
  var verify = args.verify === false || args.n ? '--no-verify ' : ''
  var toAdd = ''
  // commit any of the config files that we've updated
  // the version # for.
  Object.keys(configsToUpdate).forEach(function (p) {
    if (configsToUpdate[p]) {
      msg += ' and %s'
      paths.unshift(path.basename(p))
      toAdd += ' ' + path.relative(process.cwd(), p)
    }
  })
  checkpoint(args, msg, paths)
  return runExec(args, 'git add' + toAdd + ' ' + args.infile)
    .then(() => {
      return runExec(args, 'git commit ' + verify + (args.sign ? '-S ' : '') + (args.commitAll ? '' : (args.infile + toAdd)) + ' -m "' + formatCommitMessage(args.message, newVersion) + '"')
    })
}

function formatCommitMessage (msg, newVersion) {
  return String(msg).indexOf('%s') !== -1 ? util.format(msg, newVersion) : msg
}

function tag (newVersion, pkgPrivate, args) {
  var tagOption
  if (args.sign) {
    tagOption = '-s '
  } else {
    tagOption = '-a '
  }
  checkpoint(args, 'tagging release %s', [newVersion])
  return runExec(args, 'git tag ' + tagOption + args.tagPrefix + newVersion + ' -m "' + formatCommitMessage(args.message, newVersion) + '"')
    .then(() => {
      var message = 'git push --follow-tags origin master'
      if (pkgPrivate !== true) message += '; npm publish'

      checkpoint(args, 'Run `%s` to publish', [message], chalk.blue(figures.info))
    })
}

function createIfMissing (args) {
  try {
    accessSync(args.infile, fs.F_OK)
  } catch (err) {
    if (err.code === 'ENOENT') {
      checkpoint(args, 'created %s', [args.infile])
      args.outputUnreleased = true
      writeFile(args, args.infile, '\n')
    }
  }
}
