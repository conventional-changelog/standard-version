function versionRegex (contents) {
  //  The version number is at the root level of the file, in a format like this:
  //  version = '0.1.2'
  return RegExp('^version\\s+=\\s+\'([\\d\\.]+)\'', 'm')
}

module.exports.readVersion = function (contents) {
  const matches = versionRegex(contents).exec(contents)
  if (matches === null) {
    throw new Error('Failed to read the version field in your gradle file - is it present?')
  }

  return matches[1]
}

module.exports.writeVersion = function (contents, version) {
  //  Find the version tag, set the new version in it.
  return contents.replace(versionRegex(contents), () => {
    //  Return the new version.
    return `version = '${version}'`
  })
}
