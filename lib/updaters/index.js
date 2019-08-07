const path = require('path')
const JSON_BUMP_FILES = require('../../defaults').bumpFiles
const PLAIN_TEXT_BUMP_FILES = ['VERSION.txt', 'version.txt']

function getUpdaterByType (type) {
  try {
    return require(`./types/${type}`)
  } catch (e) {
    throw Error(`Unable to locate updated for provided type (${type}).`)
  }
}

module.exports.getUpdaterByType = getUpdaterByType

module.exports.getUpdaterByFilename = function (filename) {
  if (JSON_BUMP_FILES.includes(filename)) {
    return getUpdaterByType('json')
  }
  if (PLAIN_TEXT_BUMP_FILES.includes(filename)) {
    return getUpdaterByType('plain-text')
  }
  throw Error(
    `Unsupported file (${filename}) provided for bumping.\n Please specifcy the updater \`type\` or use a custom \`updater\`.`
  )
}

module.exports.getCustomUpdater = function (updater) {
  return require(path.resolve(process.cwd(), updater))
}
