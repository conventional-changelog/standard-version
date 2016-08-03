#!/usr/bin/env node

var tasks = require('./tasks')
var argv = require('yargs')
  .usage('Usage: $0 [options]')
  .option('infile', {
    alias: 'i',
    describe: 'Read the CHANGELOG from this file',
    default: 'CHANGELOG.md',
    global: true
  })
  .option('message', {
    alias: 'm',
    describe: 'Commit message, replaces %s with new version',
    type: 'string',
    default: 'chore(release): %s',
    global: true
  })
  .option('first-release', {
    alias: 'f',
    describe: 'Is this the first release?',
    type: 'boolean',
    default: false,
    global: true
  })
  .option('sign', {
    alias: 's',
    describe: 'Should the git commit and tag be signed?',
    type: 'boolean',
    default: false,
    global: true
  })
  .option('no-verify', {
    alias: 'n',
    describe: 'Bypass pre-commit or commit-msg git hooks during the commit phase',
    type: 'boolean',
    default: false,
    global: true
  })
  .help()
  .alias('help', 'h')
  .example('$0', 'Update changelog and tag release')
  .example('$0 -m "%s: see changelog for details"', 'Update changelog and tag release with custom commit message')
  .wrap(97)
  .argv

tasks(argv)
  .then(function (v) {
    console.log('\nBumped version from %s to %s', v.oldVersion, v.newVersion)
  })
  .catch(function (err) {
    console.error('\n' + err.message)
    process.exit(1)
  })
