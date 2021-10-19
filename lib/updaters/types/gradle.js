const versionRegex = /^version\s+=\s+['"]([\d.]+)['"]/m

module.exports.readVersion = function (contents) {
  const matches = versionRegex.exec(contents)
  if (matches === null) {
    throw new Error('Failed to read the version field in your gradle file - is it present?')
  }

  return matches[1]
}

module.exports.writeVersion = function (contents, version) {
  return contents.replace(versionRegex, () => {
    return `version = "${version}"`
  })
}
