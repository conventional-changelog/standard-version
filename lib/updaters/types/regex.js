module.exports.readVersion = function (contents, options) {
  let match = options.match
  if (!match) {
    throw Error('You must provide a `match` option when using the `regex` updater.')
  }
  const found = contents.match(match)
  if (!found) {
    throw Error('No matches found for provided `match`.')
  }
  if (!found.groups || !found.groups.version) {
    throw Error('The named capture group `version` was not found.')
  }
  return found.groups.version
}

module.exports.writeVersion = function (contents, version, options) {
  let replace = options.replace
  if (!replace || !(replace instanceof RegExp)) {
    throw Error('You must provide a valid RegExp as a `replace` option when using the `regex` updater.')
  }
  contents = contents.replace(replace, version)
  return contents
}
