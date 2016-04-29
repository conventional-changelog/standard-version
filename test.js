/* global describe it beforeEach afterEach */

'use strict'

var shell = require('shelljs')
var fs = require('fs')
var path = require('path')
var cliPath = path.resolve(__dirname, './index.js')

require('chai').should()

function commit (msg) {
  shell.exec('git commit --allow-empty -m"' + msg + '"')
}

describe('cli', function () {
  beforeEach(function () {
    shell.rm('-rf', 'tmp')
    shell.config.silent = true
    shell.mkdir('tmp')
    shell.cd('tmp')
    shell.exec('git init')
    commit('root-commit')
  })

  afterEach(function () {
    shell.cd('../')
    shell.rm('-rf', 'tmp')
  })

  describe('CHANGELOG.md does not exist', function () {
    it('populates changelog with commits since last tag by default', function () {
      fs.writeFileSync('package.json', JSON.stringify({
        version: '1.0.0'
      }), 'utf-8')

      commit('feat: first commit')
      shell.exec('git tag -a v1.0.0 -m "my awesome first release"')
      commit('fix: patch release')

      shell.exec(cliPath).code.should.equal(0)

      var content = fs.readFileSync('CHANGELOG.md', 'utf-8')
      content.should.match(/patch release/)
      content.should.not.match(/first commit/)
    })

    it('includes all commits if --first-release is true', function () {
      fs.writeFileSync('package.json', JSON.stringify({
        version: '1.0.1'
      }), 'utf-8')

      commit('feat: first commit')
      commit('fix: patch release')
      shell.exec(cliPath + ' --first-release').code.should.equal(0)

      var content = fs.readFileSync('CHANGELOG.md', 'utf-8')
      content.should.match(/patch release/)
      content.should.match(/first commit/)
      shell.exec('git tag').stdout.should.match(/1\.0\.1/)
    })
  })

  describe('CHANGELOG.md exists', function () {
    it('appends the new release above the last release, removing the old header', function () {
      fs.writeFileSync('package.json', JSON.stringify({
        version: '1.0.0'
      }), 'utf-8')
      fs.writeFileSync('CHANGELOG.md', 'legacy header format<a name="1.0.0">\n', 'utf-8')

      commit('feat: first commit')
      shell.exec('git tag -a v1.0.0 -m "my awesome first release"')
      commit('fix: patch release')

      shell.exec(cliPath).code.should.equal(0)
      var content = fs.readFileSync('CHANGELOG.md', 'utf-8')
      content.should.match(/1\.0\.1/)
      content.should.not.match(/legacy header format/)
    })
  })

  it('handles commit messages longer than 80 characters', function () {
    fs.writeFileSync('package.json', JSON.stringify({
      version: '1.0.0'
    }), 'utf-8')

    commit('feat: first commit')
    shell.exec('git tag -a v1.0.0 -m "my awesome first release"')
    commit('fix: this is my fairly long commit message which is testing whether or not we allow for long commit messages')

    shell.exec(cliPath).code.should.equal(0)

    var content = fs.readFileSync('CHANGELOG.md', 'utf-8')
    content.should.match(/this is my fairly long commit message which is testing whether or not we allow for long commit messages/)
  })

  it('formats the commit and tag messages appropriately', function () {
    fs.writeFileSync('package.json', JSON.stringify({
      version: '1.0.0'
    }), 'utf-8')

    commit('feat: first commit')
    shell.exec('git tag -a v1.0.0 -m "my awesome first release"')
    commit('feat: new feature!')

    shell.exec(cliPath).code.should.equal(0)

    // check last commit message
    shell.exec('git log --oneline -n1').stdout.should.match(/chore\(release\)\: 1\.1\.0/)
    // check annotated tag message
    shell.exec('git tag -l -n1 v1.1.0').stdout.should.match(/chore\(release\)\: 1\.1\.0/)
  })
})
