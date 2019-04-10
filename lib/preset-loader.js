// TODO: this should be replaced with an object we maintain and
// describe in: https://github.com/conventional-changelog/conventional-changelog-config-spec
const spec = {
  types: {},
  commitUrlFormat: {},
  compareUrlFormat: {},
  issueUrlFormat: {},
  userUrlFormat: {}
}

module.exports = (args) => {
  let preset = args.preset || 'conventionalcommits'
  if (preset === 'conventionalcommits') {
    preset = {
      name: preset
    }
    Object.keys(spec).forEach(key => {
      if (args[key]) preset[key] = args[key]
    })
  }
  return preset
}
