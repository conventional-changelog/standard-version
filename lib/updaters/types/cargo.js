const toml = require('@iarna/toml')
const detectNewline = require('detect-newline')

function findLineIndexWithVersion (lines) {
  let lineWithVersion = 0

  let keep = true
  while (keep) {
    const maybeLine = lines[lineWithVersion]
    if (maybeLine.match('version')) {
      keep = false
    } else {
      lineWithVersion += 1
    }
  }

  return lineWithVersion
}

exports.readName = function readName (contents) {
  const parsed = toml.parse(contents)
  return parsed.package.name
}

exports.readVersion = function readVersion (contents) {
  const parsed = toml.parse(contents)
  return parsed.package.version
}

exports.writeVersion = function writeVersion (contents, version) {
  const newline = detectNewline(contents)
  const byLine = contents.split(newline)
  const lineIndexWithVersion = findLineIndexWithVersion(byLine)

  const lineWithVersion = byLine[lineIndexWithVersion]
  byLine[lineIndexWithVersion] = lineWithVersion.replace(/".*?"/g, `"${version}"`)

  return byLine.join(newline)
}

exports.isPrivate = function isPrivate () {
  // standard-version should not do anything with cargo crates for sure,
  // thus, consider everything private
  return true
}
