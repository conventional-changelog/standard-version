const semverRegex = /version[" ]*=[ ]*["'](.*)["']/i

const getVersionIndex = function (lines) {
  let version
  const lineNumber = lines.findIndex(line => {
    const found = line.match(semverRegex)
    if (found == null) {
      return false
    }
    version = found[1]
    return true
  })
  return { version, lineNumber }
}

module.exports.readVersion = function (contents) {
  const lines = contents.split('\n')
  const versionIndex = getVersionIndex(lines)
  return versionIndex.version
}

module.exports.writeVersion = function (contents, version) {
  const lines = contents.split('\n')
  const versionIndex = getVersionIndex(lines)
  const versionLine = lines[versionIndex.lineNumber]
  const newVersionLine = versionLine.replace(versionIndex.version, version)
  lines[versionIndex.lineNumber] = newVersionLine
  return lines.join('\n')
}
