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
  preset: 'conventionalcommits',
  pkgFiles: [
    'package.json',
    'bower.json',
    'manifest.json',
    'composer.json'
  ],
  lockFiles: [
    'package-lock.json',
    'npm-shrinkwrap.json',
    'composer.lock'
  ]
}

/**
 * Merge in defaults provided by the spec
 */
Object.keys(spec.properties).forEach(propertyKey => {
  const property = spec.properties[propertyKey]
  defaults[propertyKey] = property.default
})

module.exports = defaults
