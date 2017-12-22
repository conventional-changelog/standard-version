'use strict'

const Dotignore = require('@bcoe/dotignore')
const readFileSync = require('fs').readFileSync
const pathLib = require('path')

let matcher = null
module.exports = (path) => {
  try {
    if (!matcher) {
      const gitignore = readFileSync(
        pathLib.resolve(process.cwd(), '.gitignore'), 'utf8'
      )
      matcher = Dotignore.createMatcher(gitignore)
      matcher.delimiter = pathLib.sep
    }
    return matcher.shouldIgnore(path)
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.warn(err.message)
    }
    return false
  }
}
