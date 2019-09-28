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
  if (!replace) {
    throw Error('You must provide a `replace` option when using the `regex` updater.')
  }
  if (replace instanceof RegExp) {
    replace = [replace]
  }
  replace.forEach((r) => {
    contents = contents.replace(r, version)
  })
  return contents
}
