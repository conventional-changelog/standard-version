const toml = require('@iarna/toml')

function readName (contents) {
  const parsed = toml.parse(contents)
  return parsed.package.name
}

function readVersion (contents) {
  const parsed = toml.parse(contents)
  return parsed.package.version
}

function writeVersion (contents, version) {
  const parsed = toml.parse(contents)
  const next = {
    ...parsed,
    package: {
      ...parsed.package,
      version
    }
  }
  return toml.stringify(next)
}

function isPrivate () {
  // standard-version should not do anything with cargo crates for sure,
  // thus, consider everything private
  return true
}

module.exports = {
  readName,
  readVersion,
  writeVersion,
  isPrivate
}
