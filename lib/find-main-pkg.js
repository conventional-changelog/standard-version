const { resolveUpdaterObjectFromArgument } = require('./updaters')
const fs = require('fs')
const path = require('path')

function findMainPkg (packageFiles) {
  for (const packageFile of packageFiles) {
    const updater = resolveUpdaterObjectFromArgument(packageFile)
    const pkgPath = path.resolve(process.cwd(), updater.filename)
    const { readName, readVersion, isPrivate } = updater.updater

    try {
      const contents = fs.readFileSync(pkgPath, 'utf8')

      const name = typeof readName === 'function' ? readName(contents) : undefined
      const version = readVersion(contents, name)
      const privateVal = typeof isPrivate === 'function' ? isPrivate(contents) : false

      return {
        name,
        version,
        private: privateVal
      }
    } catch (err) {}
  }
}

module.exports = { findMainPkg }
