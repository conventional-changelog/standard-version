const spec = require('conventional-changelog-config-spec')

const defaults = {
  infile: 'CHANGELOG.md',
  firstRelease: false,
  sign: false,
  noVerify: false,
  commitAll: false,
  silent: false,
  tagPrefix: 'v',
  scripts: {},
  skip: {},
  dryRun: false,
  gitTagFallback: true,
  preset: 'conventionalcommits'
}

/**
 * Merge in defaults provided by the spec
 */
Object.keys(spec.properties).forEach(propertyKey => {
  const property = spec.properties[propertyKey]
  defaults[propertyKey] = property.default
})

defaults.packageFiles = [
  'package.json',
  'bower.json',
  'manifest.json',
  'composer.json'
]

defaults.bumpFiles = defaults.packageFiles.concat([
  'package-lock.json',
  'npm-shrinkwrap.json',
  'composer.lock'
])

module.exports = defaults
