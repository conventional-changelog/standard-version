var conventionalRecommendedBump = require('conventional-recommended-bump')
var conventionalChangelog = require('conventional-changelog')
var path = require('path')
var Listr = require('listr')
var execa = require('execa')
var fs = require('fs')
var accessSync = require('fs-access').sync
var pkgPath = path.resolve(process.cwd(), './package.json')
var pkg = require(pkgPath)
var semver = require('semver')
var util = require('util')

var oldVersion = pkg.version
var newVersion

module.exports = function (argv) {
  var tasks = [{
    title: 'Detecting version',
    task: function () {
      return new Promise(function (resolve, reject) {
        conventionalRecommendedBump({
          preset: 'angular'
        }, function (error, release) {
          if (error) return reject(error)
          resolve(release)
        })
      }).then(function (release) {
        newVersion = pkg.version
        if (argv.firstRelease) {
          newVersion = pkg.version
        } else {
          newVersion = semver.inc(pkg.version, release.releaseAs)
        }
      })
    }
  }, {
    title: 'Bumping version',
    skip: function () {
      if (argv.firstRelease) {
        return 'Skip version bump on first version'
      }
    },
    task: function () {
      pkg.version = newVersion
      return writeFile(pkgPath, JSON.stringify(pkg, null, 2) + '\n')
        .then(function () {
          return 'Bumped version from ' + oldVersion + ' to ' + newVersion
        })
    }
  }, {
    title: 'Creating ' + argv.infile,
    skip: function () {
      try {
        accessSync(argv.infile, fs.F_OK)
      } catch (err) {
        if (err.code === 'ENOENT') {
          return
        }
      }
      return 'Already exists'
    },
    task: function () {
      return writeFile(argv.infile, '\n')
    }
  }, {
    title: 'Outputting changes to ' + argv.infile,
    task: function () {
      return outputChangelog(argv)
    }
  }, {
    title: 'Committing to git',
    task: function () {
      return commit(argv, newVersion)
    }
  }, {
    title: 'Creating git tag',
    task: function () {
      return tag(argv, newVersion)
    }
  }]

  return new Listr(tasks).run()
    .then(function () {
      return {
        oldVersion: oldVersion,
        newVersion: newVersion
      }
    })
}

function outputChangelog (argv) {
  return new Promise(function (resolve, reject) {
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
    .on('error', reject)

    changelogStream.on('data', function (buffer) {
      content += buffer.toString()
    })

    changelogStream.on('end', function () {
      resolve(
        header + '\n' + (content + oldContent).replace(/\n+$/, '\n')
      )
    })
  }).then(function (content) {
    return writeFile(argv.infile, content)
  })
}

function commit (argv, newVersion) {
  return execa.stdout('git', ['add', 'package.json', argv.infile])
    .then(function () {
      var args = ['commit']
      if (argv.verify === false || argv.n) {
        args.push('--no-verify')
      }
      if (argv.sign) {
        args.push('-S')
      }
      args.push('package.json')
      args.push(argv.infile)
      args.push('-m')
      args.push(formatCommitMessage(argv.message, newVersion))
      return execa.stdout('git', args)
    })
}

function formatCommitMessage (msg, newVersion) {
  return String(msg).indexOf('%s') !== -1 ? util.format(msg, newVersion) : msg
}

function tag (argv, newVersion) {
  var args = ['tag']
  if (argv.sign) {
    args.push('-s')
  } else {
    args.push('-a')
  }
  args.push('v' + newVersion)
  args.push('-m')
  args.push(formatCommitMessage(argv.message, newVersion))

  return execa.stdout('git', args)
    .then(function () {
      return 'Run `git push --follow-tags origin master; npm publish` to publish'
    })
}

function writeFile (filepath, content, encoding) {
  return new Promise(function (resolve, reject) {
    fs.writeFile(filepath, content, encoding || 'utf-8', function (err) {
      if (err) return reject(err)
      resolve()
    })
  })
}
