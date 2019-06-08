const path = require('path')
const findUp = require('find-up')
const { readFileSync } = require('fs')

const CONFIGURATION_FILES = [
  '.versionrc',
  '.versionrc.json',
  '.versionrc.js'
]

module.exports.getConfiguration = function () {
  let config = {}
  const configPath = findUp.sync(CONFIGURATION_FILES)
  if (!configPath) {
    return config
  }
  if (path.extname(configPath) === '.js') {
    const jsConfiguration = require(configPath)
    if (typeof jsConfiguration === 'function') {
      config = jsConfiguration()
    } else {
      config = jsConfiguration
    }
  } else {
    config = JSON.parse(readFileSync(configPath))
  }

  /**
   * @todo we could eventually have deeper validation of the configuration (using `ajv`) and
   * provide a more helpful error.
   */
  if (typeof config !== 'object') {
    throw Error(
      '[standard-version] Invalid default export found in configuration file.\n' +
      'You must provide an object or function.'
    )
  }

  return config
}
