#!/usr/bin/env node
var standardVersion = require('./index')
var defaults = require('./defaults')

var argv = require('yargs')
  .usage('Usage: $0 [options]')
  .option('infile', {
    alias: 'i',
    describe: 'Read the CHANGELOG from this file',
    default: defaults.infile,
    global: true
  })
  .option('message', {
    alias: 'm',
    describe: 'Commit message, replaces %s with new version',
    type: 'string',
    default: defaults.message,
    global: true
  })
  .option('first-release', {
    alias: 'f',
    describe: 'Is this the first release?',
    type: 'boolean',
    default: defaults.firstRelease,
    global: true
  })
  .option('sign', {
    alias: 's',
    describe: 'Should the git commit and tag be signed?',
    type: 'boolean',
    default: defaults.sign,
    global: true
  })
  .option('no-verify', {
    alias: 'n',
    describe: 'Bypass pre-commit or commit-msg git hooks during the commit phase',
    type: 'boolean',
    default: defaults.noVerify,
    global: true
  })
  .option('commit-all', {
    alias: 'a',
    describe: 'Commit all staged changes, not just files affected by standard-version',
    type: 'boolean',
    default: defaults.commitAll,
    global: true
  })
  .option('silent', {
    describe: 'Don\'t print logs and errors',
    type: 'boolean',
    default: defaults.silent,
    global: true
  })
  .help()
  .alias('help', 'h')
  .example('$0', 'Update changelog and tag release')
  .example('$0 -m "%s: see changelog for details"', 'Update changelog and tag release with custom commit message')
  .wrap(97)
  .argv

standardVersion(argv, function (err) {
  if (err) {
    process.exit(1)
  }
})
