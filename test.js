/* global describe it beforeEach afterEach */

'use strict'

var shell = require('shelljs')
var fs = require('fs')
var path = require('path')
var cliPath = path.resolve(__dirname, './index.js')
var PATH

require('chai').should()

function commit (msg) {
  shell.exec('git commit --allow-empty -m"' + msg + '"')
}

function writePackageJson (version) {
  fs.writeFileSync('package.json', JSON.stringify({
    version: version
  }), 'utf-8')
}

function mockGit (logic) {
  fs.writeFileSync('git', '#!/usr/bin/env node\n' + logic, 'utf8')
  shell.chmod('+x', 'git')
  PATH = shell.env.PATH
  shell.env.PATH = shell.pwd() + ':' + PATH
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
    if (PATH) {
      shell.env['PATH'] = PATH
      PATH = undefined
    }
    shell.cd('../')
    shell.rm('-rf', 'tmp')
  })

  describe('CHANGELOG.md does not exist', function () {
    it('populates changelog with commits since last tag by default', function () {
      writePackageJson('1.0.0')

      commit('feat: first commit')
      shell.exec('git tag -a v1.0.0 -m "my awesome first release"')
      commit('fix: patch release')

      shell.exec(cliPath).code.should.equal(0)

      var content = fs.readFileSync('CHANGELOG.md', 'utf-8')
      content.should.match(/patch release/)
      content.should.not.match(/first commit/)
    })

    it('includes all commits if --first-release is true', function () {
      writePackageJson('1.0.1')

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
      writePackageJson('1.0.0')
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

  describe('with mocked git', function () {
    it('--sign signs the commit and tag', function () {
      // mock git with file that writes args to gitcapture.log
      mockGit('require("fs").appendFileSync("gitcapture.log", JSON.stringify(process.argv.splice(2)) + "\\n", "utf8")')
      writePackageJson('1.0.0')

      shell.exec(cliPath + ' --sign').code.should.equal(0)

      var captured = shell.cat('gitcapture.log').stdout.split('\n').map(function (line) {
        return line ? JSON.parse(line) : line
      })
      captured[captured.length - 3].should.deep.equal(['commit', '-S', 'package.json', 'CHANGELOG.md', '-m', 'chore(release): 1.0.1'])
      captured[captured.length - 2].should.deep.equal(['tag', '-s', 'v1.0.1', '-m', 'chore(release): 1.0.1'])
    })

    it('exits with error code if git commit fails', function () {
      // mock git by throwing on attempt to commit
      mockGit('if (process.argv[2] === "commit") { console.error("commit yourself"); process.exit(128); }')
      writePackageJson('1.0.0')

      var result = shell.exec(cliPath)
      result.code.should.equal(1)
      result.stdout.should.match(/commit yourself/)
    })

    it('exits with error code if git tag fails', function () {
      // mock git by throwing on attempt to commit
      mockGit('if (process.argv[2] === "tag") { console.error("tag, you\'re it"); process.exit(128); }')
      writePackageJson('1.0.0')

      var result = shell.exec(cliPath)
      result.code.should.equal(1)
      result.stdout.should.match(/tag, you're it/)
    })
  })

  it('handles commit messages longer than 80 characters', function () {
    writePackageJson('1.0.0')

    commit('feat: first commit')
    shell.exec('git tag -a v1.0.0 -m "my awesome first release"')
    commit('fix: this is my fairly long commit message which is testing whether or not we allow for long commit messages')

    shell.exec(cliPath).code.should.equal(0)

    var content = fs.readFileSync('CHANGELOG.md', 'utf-8')
    content.should.match(/this is my fairly long commit message which is testing whether or not we allow for long commit messages/)
  })

  it('formats the commit and tag messages appropriately', function () {
    writePackageJson('1.0.0')

    commit('feat: first commit')
    shell.exec('git tag -a v1.0.0 -m "my awesome first release"')
    commit('feat: new feature!')

    shell.exec(cliPath).code.should.equal(0)

    // check last commit message
    shell.exec('git log --oneline -n1').stdout.should.match(/chore\(release\): 1\.1\.0/)
    // check annotated tag message
    shell.exec('git tag -l -n1 v1.1.0').stdout.should.match(/chore\(release\): 1\.1\.0/)
  })
})
