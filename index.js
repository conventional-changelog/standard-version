const bump = require('./lib/lifecycles/bump')
const changelog = require('./lib/lifecycles/changelog')
const commit = require('./lib/lifecycles/commit')
const fs = require('fs')
const latestSemverTag = require('./lib/latest-semver-tag')
const path = require('path')
const printError = require('./lib/print-error')
const tag = require('./lib/lifecycles/tag')

// allows configuration of `standard-version` and submodules via `standard-version`
// key in `package.json` or a provided `--config` file.
function getConfigurationFromArguments (argv) {
  const hasConfigArg = Boolean(argv.config)
  const configurationPath = path.resolve(process.cwd(), hasConfigArg ? argv.config : 'package.json')
  if (!fs.existsSync(configurationPath)) {
    return {}
  }
  const config = require(configurationPath)
  if (typeof config === 'function') {
    // if the export of the configuraiton is a function, we expect the
    // result to be our configuration object.
    return config()
  }
  if (typeof config === 'object') {
    return !hasConfigArg || config.hasOwnProperty('standard-version') ? (config['standard-version'] || {}) : config
  }
  return {}
}

module.exports = function standardVersion (argv) {
  let pkg
  bump.pkgFiles.forEach((filename) => {
    if (pkg) return
    var pkgPath = path.resolve(process.cwd(), filename)
    try {
      var data = fs.readFileSync(pkgPath, 'utf8')
      pkg = JSON.parse(data)
    } catch (err) {}
  })
  let newVersion
  let defaults = require('./defaults')
  const packageConfiguration = Object.assign({}, getConfigurationFromArguments(argv))
  // the `modules` key is reserved for submodule configurations.
  const moduleConfigurations = packageConfiguration.modules || {}
  // module specific configurations are *not* passed as part of `standard-version`s arguments.
  delete packageConfiguration.modules
  const args = Object.assign({}, defaults, argv, packageConfiguration)
  return Promise.resolve()
    .then(() => {
      if (!pkg && args.gitTagFallback) {
        return latestSemverTag()
      } else if (!pkg) {
        throw new Error('no package file found')
      } else {
        return pkg.version
      }
    })
    .then(version => {
      newVersion = version
    })
    .then(() => {
      return bump(
        args,
        newVersion,
        moduleConfigurations['conventional-recommended-bump']
      )
    })
    .then((_newVersion) => {
      // if bump runs, it calculaes the new version that we
      // should release at.
      if (_newVersion) newVersion = _newVersion
      return changelog(
        args,
        newVersion,
        moduleConfigurations['conventional-changelog']
      )
    })
    .then(() => {
      return commit(args, newVersion)
    })
    .then(() => {
      return tag(newVersion, pkg ? pkg.private : false, args)
    })
    .catch((err) => {
      printError(args, err.message)
      throw err
    })
}
