const latestSemverTag = require('./lib/latest-semver-tag')
const path = require('path')
const printError = require('./lib/print-error')

const bump = require('./lib/lifecycles/bump')
const changelog = require('./lib/lifecycles/changelog')
const commit = require('./lib/lifecycles/commit')
const tag = require('./lib/lifecycles/tag')

module.exports = function standardVersion (argv) {
  let pkg
  bump.pkgFiles.forEach((filename) => {
    if (pkg) return
    var pkgPath = path.resolve(process.cwd(), filename)
    try {
      pkg = require(pkgPath)
    } catch (err) {}
  })
  let newVersion
  let defaults = require('./defaults')
  let args = Object.assign({}, defaults, argv)

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
      console.info("standard-version", args);
      return bump(args, newVersion)
    })
    .then((_newVersion) => {
      // if bump runs, it calculaes the new version that we
      // should release at.
      console.info("standard-version newVersion:", _newVersion);
      console.info("standard-version args before changelog():", args);
      if (_newVersion) newVersion = _newVersion
      return changelog(args, newVersion)
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
