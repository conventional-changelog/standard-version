/* global describe it beforeEach, afterEach */

const shell = require('shelljs')
const fs = require('fs')

require('chai').should()

function exec (opt) {
  const cli = require('../command')
  opt = cli.parse(`standard-version ${opt} --silent`)
  opt.skip = { commit: true, tag: true }
  return require('../index')(opt)
}

describe('presets', () => {
  beforeEach(function () {
    shell.rm('-rf', 'tmp')
    shell.config.silent = true
    shell.mkdir('tmp')
    shell.cd('tmp')
    shell.exec('git init')
    shell.exec('git config commit.gpgSign false')
    shell.exec('git config core.autocrlf false')
    shell.exec('git commit --allow-empty -m "initial commit"')
    shell.exec('git commit --allow-empty -m "feat: A feature commit."')
    shell.exec('git commit --allow-empty -m "perf: A performance change."')
    shell.exec('git commit --allow-empty -m "chore: A chore commit."')
    shell.exec('git commit --allow-empty -m "ci: A ci commit."')
    shell.exec('git commit --allow-empty -m "custom: A custom commit."')
  })

  afterEach(function () {
    shell.cd('../')
    shell.rm('-rf', 'tmp')
  })

  it('Conventional Commits (default)', async function () {
    await exec()
    const content = fs.readFileSync('CHANGELOG.md', 'utf-8')
    content.should.contain('### Features')
    content.should.not.contain('### Performance Improvements')
    content.should.not.contain('### Custom')
  })

  it('Angular', async function () {
    await exec('--preset angular')
    const content = fs.readFileSync('CHANGELOG.md', 'utf-8')
    content.should.contain('### Features')
    content.should.contain('### Performance Improvements')
    content.should.not.contain('### Custom')
  })
})
