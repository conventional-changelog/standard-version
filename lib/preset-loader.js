// TODO: this should be replaced with an object we maintain and
// describe in: https://github.com/conventional-changelog/conventional-changelog-config-spec
const spec = require('conventional-changelog-config-spec')

module.exports = (args) => {
  let preset = args.preset || 'conventionalcommits'
  if (preset === 'conventionalcommits') {
    preset = {
      name: preset
    }
    Object.keys(spec.properties).forEach(key => {
      if (args[key] !== undefined) preset[key] = args[key]
    })
  }
  return preset
}
