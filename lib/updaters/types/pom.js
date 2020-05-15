const detectIndent = require('detect-indent')

function versionTagRegex (contents) {
  //  The version is in an xml tag with a single indent (remember, there are
  //  normally many other version tags, e.g. for dependencies).
  const { indent } = detectIndent(contents)
  return RegExp(`^${indent}<version>([\\d\\.]+)<\\/version>`, 'm')
}

module.exports.readVersion = function (contents) {
  const matches = versionTagRegex(contents).exec(contents)
  if (matches === null) {
    throw new Error('Failed to read the <version> tag in your pom file - is it present?')
  }

  return matches[1]
}

module.exports.writeVersion = function (contents, version) {
  //  Find the version tag, set the new version in it.
  return contents.replace(versionTagRegex(contents), (match) => {
    //  Replace the inner part of the version tag with the new version.
    return match.replace(/>[^,]+</, `>${version}<`)
  })
}
