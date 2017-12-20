const Dotignore = require('@bcoe/dotignore')
const readFileSync = require('fs').readFileSync
const resolve = require('path').resolve

let matcher = null
module.exports = (path) => {
  try {
    if (!matcher) {
      const gitignore = readFileSync(
        resolve(process.cwd(), './.gitignore'), 'utf8'
      )
      matcher = Dotignore.createMatcher(gitignore)
    }
    return matcher.shouldIgnore(path)
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.warn(err.message)
    }
    return false
  }
}
