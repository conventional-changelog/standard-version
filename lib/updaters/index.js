const path = require('path')
const JSON_BUMP_FILES = require('../../defaults').bumpFiles
const updatersByType = {
  json: require('./types/json'),
  'plain-text': require('./types/plain-text'),
  pom: require('./types/pom'),
  gradle: require('./types/gradle')
}
const PLAIN_TEXT_BUMP_FILES = ['VERSION.txt', 'version.txt']

function getUpdaterByType (type) {
  const updater = updatersByType[type]
  if (!updater) {
    throw Error(`Unable to locate updater for provided type (${type}).`)
  }
  return updater
}

function getUpdaterByFilename (filename) {
  if (JSON_BUMP_FILES.includes(path.basename(filename))) {
    return getUpdaterByType('json')
  }
  if (PLAIN_TEXT_BUMP_FILES.includes(filename)) {
    return getUpdaterByType('plain-text')
  }
  if (/pom.xml$/.test(filename)) {
    return getUpdaterByType('pom')
  }
  if (/build.gradle$/.test(filename)) {
    return getUpdaterByType('gradle')
  }
  throw Error(
    `Unsupported file (${filename}) provided for bumping.\n Please specify the updater \`type\` or use a custom \`updater\`.`
  )
}

function getCustomUpdater (updater) {
  if (typeof updater === 'string') {
    return require(path.resolve(process.cwd(), updater))
  }
  if (
    typeof updater.readVersion === 'function' &&
    typeof updater.writeVersion === 'function'
  ) {
    return updater
  }
  throw new Error('Updater must be a string path or an object with readVersion and writeVersion methods')
}

module.exports.resolveUpdaterObjectFromArgument = function (arg) {
  /**
   * If an Object was not provided, we assume it's the path/filename
   * of the updater.
   */
  let updater = arg
  if (typeof updater !== 'object') {
    updater = {
      filename: arg
    }
  }
  try {
    if (updater.updater) {
      updater.updater = getCustomUpdater(updater.updater)
    } else if (updater.type) {
      updater.updater = getUpdaterByType(updater.type)
    } else {
      updater.updater = getUpdaterByFilename(updater.filename)
    }
  } catch (err) {
    if (err.code !== 'ENOENT') console.warn(err.message)
  }
  /**
   * We weren't able to resolve an updater for the argument.
   */
  if (!updater.updater) {
    /* Previously we just returned 'false' for this function, but that causes
    an error immediately afterwards as we try to read the result as an object
    with a field 'filename'. So better to bail here, it means something is
    wrong, most likely someone has goofed making an updater. */
    throw Error(
      `Failed to create an updater for ${JSON.stringify(arg)}\n Please specify the updater \`type\` or use a custom \`updater\`.`
    )
  }

  return updater
}
