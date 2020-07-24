/* global describe it beforeEach afterEach */

'use strict'

const shell = require('shelljs')
const fs = require('fs')
const path = require('path')
const { Readable } = require('stream')
const mockGit = require('mock-git')
const mockery = require('mockery')
const semver = require('semver')
const formatCommitMessage = require('./lib/format-commit-message')

const isWindows = process.platform === 'win32'

require('chai').should()

const cliPath = path.resolve(__dirname, './bin/cli.js')

function commit (msg) {
  shell.exec('git commit --allow-empty -m"' + msg + '"')
}

function execCli (argString) {
  return shell.exec('node ' + cliPath + (argString != null ? ' ' + argString : ''))
}

function execCliAsync (argString = '') {
  const cli = require('./command')
  const args = cli.parse('standard-version ' + argString + ' --silent')
  return require('./index')(args)
}

function writePackageJson (version, option) {
  option = option || {}
  const pkg = Object.assign(option, { version: version })
  fs.writeFileSync('package.json', JSON.stringify(pkg), 'utf-8')
}

function writeBowerJson (version, option) {
  option = option || {}
  const bower = Object.assign(option, { version: version })
  fs.writeFileSync('bower.json', JSON.stringify(bower), 'utf-8')
}

function writeManifestJson (version, option) {
  option = option || {}
  const manifest = Object.assign(option, { version: version })
  fs.writeFileSync('manifest.json', JSON.stringify(manifest), 'utf-8')
}

function writeNpmShrinkwrapJson (version, option) {
  option = option || {}
  const shrinkwrap = Object.assign(option, { version: version })
  fs.writeFileSync('npm-shrinkwrap.json', JSON.stringify(shrinkwrap), 'utf-8')
}

function writePackageLockJson (version, option) {
  option = option || {}
  const pkgLock = Object.assign(option, { version: version })
  fs.writeFileSync('package-lock.json', JSON.stringify(pkgLock), 'utf-8')
}

function writeGitPreCommitHook () {
  fs.writeFileSync('.git/hooks/pre-commit', '#!/bin/sh\necho "precommit ran"\nexit 1', 'utf-8')
  fs.chmodSync('.git/hooks/pre-commit', '755')
}

function writePostBumpHook (causeError) {
  writeHook('postbump', causeError)
}

function writeHook (hookName, causeError, script) {
  shell.mkdir('-p', 'scripts')
  let content = script || 'console.error("' + hookName + ' ran")'
  content += causeError ? '\nthrow new Error("' + hookName + '-failure")' : ''
  fs.writeFileSync('scripts/' + hookName + '.js', content, 'utf-8')
  fs.chmodSync('scripts/' + hookName + '.js', '755')
}

function initInTempFolder () {
  shell.rm('-rf', 'tmp')
  shell.config.silent = true
  shell.mkdir('tmp')
  shell.cd('tmp')
  shell.exec('git init')
  shell.exec('git config commit.gpgSign false')
  commit('root-commit')
  writePackageJson('1.0.0')
}

function finishTemp () {
  shell.cd('../')
  shell.rm('-rf', 'tmp')
}

function getPackageVersion () {
  return JSON.parse(fs.readFileSync('package.json', 'utf-8')).version
}

/**
 * Mock external conventional-changelog modules
 *
 * Mocks should be unregistered in test cleanup by calling unmock()
 *
 * bump?: 'major' | 'minor' | 'patch' | Error | (opt, cb) => { cb(err) | cb(null, { releaseType }) }
 * changelog?: string | Error | Array<string | Error | (opt) => string | null>
 * tags?: string[] | Error
 */
function mock ({ bump, changelog, tags }) {
  mockery.enable({ warnOnUnregistered: false, useCleanCache: true })
  if (bump) {
    mockery.registerMock('conventional-recommended-bump', function (opt, cb) {
      if (typeof bump === 'function') bump(opt, cb)
      else if (bump instanceof Error) cb(bump)
      else cb(null, { releaseType: bump })
    })
  }

  if (changelog) {
    if (!Array.isArray(changelog)) {
      changelog = [changelog]
    }
    mockery.registerMock('conventional-changelog', (opt) => new Readable({
      read (_size) {
        const next = changelog.shift()
        if (next instanceof Error) {
          this.destroy(next)
        } else if (typeof next === 'function') {
          this.push(next(opt))
        } else {
          this.push(next ? Buffer.from(next, 'utf8') : null)
        }
      }
    }))
  }

  if (tags) {
    mockery.registerMock('git-semver-tags', function (cb) {
      if (tags instanceof Error) cb(tags)
      else cb(null, tags)
    })
  }
}

function unmock () {
  mockery.deregisterAll()
  mockery.disable()
}

describe('format-commit-message', function () {
  it('works for no {{currentTag}}', function () {
    formatCommitMessage('chore(release): 1.0.0', '1.0.0').should.equal('chore(release): 1.0.0')
  })
  it('works for one {{currentTag}}', function () {
    formatCommitMessage('chore(release): {{currentTag}}', '1.0.0').should.equal('chore(release): 1.0.0')
  })
  it('works for two {{currentTag}}', function () {
    formatCommitMessage('chore(release): {{currentTag}} \n\n* CHANGELOG: https://github.com/conventional-changelog/standard-version/blob/v{{currentTag}}/CHANGELOG.md', '1.0.0').should.equal('chore(release): 1.0.0 \n\n* CHANGELOG: https://github.com/conventional-changelog/standard-version/blob/v1.0.0/CHANGELOG.md')
  })
})

describe('cli', function () {
  beforeEach(initInTempFolder)
  afterEach(finishTemp)
  afterEach(unmock)

  describe('CHANGELOG.md does not exist', function () {
    it('populates changelog with commits since last tag by default', async function () {
      mock({ bump: 'patch', changelog: 'patch release\n', tags: ['v1.0.0'] })
      await execCliAsync()
      const content = fs.readFileSync('CHANGELOG.md', 'utf-8')
      content.should.match(/patch release/)
    })

    it('includes all commits if --first-release is true', async function () {
      writePackageJson('1.0.1')
      mock({ bump: 'minor', changelog: 'first commit\npatch release\n', tags: [] })
      await execCliAsync('--first-release')
      const content = fs.readFileSync('CHANGELOG.md', 'utf-8')
      content.should.match(/patch release/)
      content.should.match(/first commit/)
      shell.exec('git tag').stdout.should.match(/1\.0\.1/)
    })

    it('skipping changelog will not create a changelog file', async function () {
      writePackageJson('1.0.0')
      mock({ bump: 'minor', changelog: 'foo\n', tags: [] })
      await execCliAsync('--skip.changelog true')
      getPackageVersion().should.equal('1.1.0')
      try {
        fs.readFileSync('CHANGELOG.md', 'utf-8')
        throw new Error('File should not exist')
      } catch (err) {
        err.code.should.equal('ENOENT')
      }
    })
  })

  describe('CHANGELOG.md exists', function () {
    it('appends the new release above the last release, removing the old header (legacy format)', async function () {
      fs.writeFileSync('CHANGELOG.md', 'legacy header format<a name="1.0.0">\n', 'utf-8')
      mock({ bump: 'patch', changelog: 'release 1.0.1\n', tags: ['v1.0.0'] })
      await execCliAsync()
      const content = fs.readFileSync('CHANGELOG.md', 'utf-8')
      content.should.match(/1\.0\.1/)
      content.should.not.match(/legacy header format/)
    })

    it('appends the new release above the last release, removing the old header (new format)', async function () {
      const { header } = require('./defaults')
      const changelog1 = '### [1.0.1](/compare/v1.0.0...v1.0.1) (YYYY-MM-DD)\n\n\n### Bug Fixes\n\n* patch release ABCDEFXY\n'
      mock({ bump: 'patch', changelog: changelog1, tags: ['v1.0.0'] })
      await execCliAsync()
      let content = fs.readFileSync('CHANGELOG.md', 'utf-8')
      content.should.equal(header + '\n' + changelog1)

      const changelog2 = '### [1.0.2](/compare/v1.0.1...v1.0.2) (YYYY-MM-DD)\n\n\n### Bug Fixes\n\n* another patch release ABCDEFXY\n'
      unmock()
      mock({ bump: 'patch', changelog: changelog2, tags: ['v1.0.0', 'v1.0.1'] })
      await execCliAsync()
      content = fs.readFileSync('CHANGELOG.md', 'utf-8')
      content.should.equal(header + '\n' + changelog2 + changelog1)
    })

    it('commits all staged files', async function () {
      fs.writeFileSync('CHANGELOG.md', 'legacy header format<a name="1.0.0">\n', 'utf-8')
      fs.writeFileSync('STUFF.md', 'stuff\n', 'utf-8')
      shell.exec('git add STUFF.md')

      mock({ bump: 'patch', changelog: 'release 1.0.1\n', tags: ['v1.0.0'] })
      await execCliAsync('--commit-all')
      const status = shell.exec('git status --porcelain') // see http://unix.stackexchange.com/questions/155046/determine-if-git-working-directory-is-clean-from-a-script
      status.should.equal('')
      status.should.not.match(/STUFF.md/)

      const content = fs.readFileSync('CHANGELOG.md', 'utf-8')
      content.should.match(/1\.0\.1/)
      content.should.not.match(/legacy header format/)
    })

    it('[DEPRECATED] (--changelogHeader) allows for a custom changelog header', async function () {
      fs.writeFileSync('CHANGELOG.md', '', 'utf-8')
      const header = '# Pork Chop Log'
      mock({ bump: 'minor', changelog: header + '\n', tags: [] })
      await execCliAsync(`--changelogHeader="${header}"`)
      const content = fs.readFileSync('CHANGELOG.md', 'utf-8')
      content.should.match(new RegExp(header))
    })

    it('[DEPRECATED] (--changelogHeader) exits with error if changelog header matches last version search regex', async function () {
      fs.writeFileSync('CHANGELOG.md', '', 'utf-8')
      mock({ bump: 'minor', changelog: [], tags: [] })
      try {
        await execCliAsync('--changelogHeader="## 3.0.2"')
        throw new Error('That should not have worked')
      } catch (error) {
        error.message.should.match(/custom changelog header must not match/)
      }
    })
  })

  // TODO: investigate why mock-git does not play well with execFile on Windows.
  if (!isWindows) {
    describe('with mocked git', function () {
      it('--sign signs the commit and tag', function () {
        // mock git with file that writes args to gitcapture.log
        return mockGit('require("fs").appendFileSync("gitcapture.log", JSON.stringify(process.argv.splice(2)) + "\\n")')
          .then(function (unmock) {
            execCli('--sign').code.should.equal(0)

            const captured = shell.cat('gitcapture.log').stdout.split('\n').map(function (line) {
              return line ? JSON.parse(line) : line
            })
            /* eslint-disable no-useless-escape */
            captured[captured.length - 4].should.deep.equal(['commit', '-S', 'CHANGELOG.md', 'package.json', '-m', 'chore(release): 1.0.1'])
            captured[captured.length - 3].should.deep.equal(['tag', '-s', 'v1.0.1', '-m', 'chore(release): 1.0.1'])
            /* eslint-enable no-useless-escape */
            unmock()
          })
      })

      it('exits with error code if git commit fails', function () {
        // mock git by throwing on attempt to commit
        return mockGit('console.error("commit yourself"); process.exit(128);', 'commit')
          .then(function (unmock) {
            const result = execCli()
            result.code.should.equal(1)
            result.stderr.should.match(/commit yourself/)

            unmock()
          })
      })

      it('exits with error code if git add fails', function () {
        // mock git by throwing on attempt to add
        return mockGit('console.error("addition is hard"); process.exit(128);', 'add')
          .then(function (unmock) {
            const result = execCli()
            result.code.should.equal(1)
            result.stderr.should.match(/addition is hard/)

            unmock()
          })
      })

      it('exits with error code if git tag fails', function () {
        // mock git by throwing on attempt to commit
        return mockGit('console.error("tag, you\'re it"); process.exit(128);', 'tag')
          .then(function (unmock) {
            const result = execCli()
            result.code.should.equal(1)
            result.stderr.should.match(/tag, you're it/)

            unmock()
          })
      })

      it('doesn\'t fail fast on stderr output from git', function () {
        // mock git by throwing on attempt to commit
        return mockGit('console.error("haha, kidding, this is just a warning"); process.exit(0);', 'add')
          .then(function (unmock) {
            writePackageJson('1.0.0')

            const result = execCli()
            result.code.should.equal(1)
            result.stderr.should.match(/haha, kidding, this is just a warning/)

            unmock()
          })
      })
    })
  }

  describe('lifecycle scripts', () => {
    describe('prerelease hook', function () {
      it('should run the prerelease hook when provided', function () {
        writePackageJson('1.0.0', {
          'standard-version': {
            scripts: {
              prerelease: 'node scripts/prerelease'
            }
          }
        })
        writeHook('prerelease')
        fs.writeFileSync('CHANGELOG.md', 'legacy header format<a name="1.0.0">\n', 'utf-8')

        commit('feat: first commit')
        const result = execCli('--patch')
        result.code.should.equal(0)
        result.stderr.should.match(/prerelease ran/)
      })

      it('should abort if the hook returns a non-zero exit code', function () {
        writePackageJson('1.0.0', {
          'standard-version': {
            scripts: {
              prerelease: 'node scripts/prerelease && exit 1'
            }
          }
        })
        writeHook('prerelease')
        fs.writeFileSync('CHANGELOG.md', 'legacy header format<a name="1.0.0">\n', 'utf-8')

        commit('feat: first commit')
        const result = execCli('--patch')
        result.code.should.equal(1)
        result.stderr.should.match(/prerelease ran/)
      })
    })

    describe('prebump hook', function () {
      it('should allow prebump hook to return an alternate version #', function () {
        writePackageJson('1.0.0', {
          'standard-version': {
            scripts: {
              prebump: 'node scripts/prebump'
            }
          }
        })
        writeHook('prebump', false, 'console.log("9.9.9")')
        fs.writeFileSync('CHANGELOG.md', 'legacy header format<a name="1.0.0">\n', 'utf-8')

        commit('feat: first commit')
        const result = execCli('--patch')
        result.stdout.should.match(/9\.9\.9/)
        result.code.should.equal(0)
      })
    })

    describe('postbump hook', function () {
      it('should run the postbump hook when provided', function () {
        writePackageJson('1.0.0', {
          'standard-version': {
            scripts: {
              postbump: 'node scripts/postbump'
            }
          }
        })
        writePostBumpHook()
        fs.writeFileSync('CHANGELOG.md', 'legacy header format<a name="1.0.0">\n', 'utf-8')

        commit('feat: first commit')
        const result = execCli('--patch')
        result.code.should.equal(0)
        result.stderr.should.match(/postbump ran/)
      })

      it('should run the postbump and exit with error when postbump fails', function () {
        writePackageJson('1.0.0', {
          'standard-version': {
            scripts: {
              postbump: 'node scripts/postbump'
            }
          }
        })
        writePostBumpHook(true)
        fs.writeFileSync('CHANGELOG.md', 'legacy header format<a name="1.0.0">\n', 'utf-8')

        commit('feat: first commit')
        const result = execCli('--patch')
        result.code.should.equal(1)
        result.stderr.should.match(/postbump-failure/)
      })
    })

    describe('precommit hook', function () {
      it('should run the precommit hook when provided via .versionrc.json (#371)', function () {
        fs.writeFileSync('.versionrc.json', JSON.stringify({
          scripts: {
            precommit: 'node scripts/precommit'
          }
        }), 'utf-8')

        writeHook('precommit')
        fs.writeFileSync('CHANGELOG.md', 'legacy header format<a name="1.0.0">\n', 'utf-8')
        commit('feat: first commit')
        const result = execCli()
        result.code.should.equal(0)
        result.stderr.should.match(/precommit ran/)
      })

      it('should run the precommit hook when provided', function () {
        writePackageJson('1.0.0', {
          'standard-version': {
            scripts: {
              precommit: 'node scripts/precommit'
            }
          }
        })
        writeHook('precommit')
        fs.writeFileSync('CHANGELOG.md', 'legacy header format<a name="1.0.0">\n', 'utf-8')

        commit('feat: first commit')
        const result = execCli('--patch')
        result.code.should.equal(0)
        result.stderr.should.match(/precommit ran/)
      })

      it('should run the precommit hook and exit with error when precommit fails', function () {
        writePackageJson('1.0.0', {
          'standard-version': {
            scripts: {
              precommit: 'node scripts/precommit'
            }
          }
        })
        writeHook('precommit', true)
        fs.writeFileSync('CHANGELOG.md', 'legacy header format<a name="1.0.0">\n', 'utf-8')

        commit('feat: first commit')
        const result = execCli('--patch')
        result.code.should.equal(1)
        result.stderr.should.match(/precommit-failure/)
      })

      it('should allow an alternate commit message to be provided by precommit script', function () {
        writePackageJson('1.0.0', {
          'standard-version': {
            scripts: {
              precommit: 'node scripts/precommit'
            }
          }
        })
        writeHook('precommit', false, 'console.log("releasing %s delivers #222")')
        fs.writeFileSync('CHANGELOG.md', 'legacy header format<a name="1.0.0">\n', 'utf-8')

        commit('feat: first commit')
        const result = execCli('--patch')
        result.code.should.equal(0)
        shell.exec('git log --oneline -n1').should.match(/delivers #222/)
      })
    })
  })

  describe('pre-release', function () {
    it('works fine without specifying a tag id when prereleasing', function () {
      writePackageJson('1.0.0')
      fs.writeFileSync('CHANGELOG.md', 'legacy header format<a name="1.0.0">\n', 'utf-8')
      mock({ bump: 'minor', changelog: [], tags: [] })
      return execCliAsync('--prerelease')
        .then(function () {
          // it's a feature commit, so it's minor type
          getPackageVersion().should.equal('1.1.0-0')
        })
    })

    it('advises use of --tag prerelease for publishing to npm', function () {
      writePackageJson('1.0.0')
      fs.writeFileSync('CHANGELOG.md', 'legacy header format<a name="1.0.0">\n', 'utf-8')

      execCli('--prerelease').stdout.should.include('--tag prerelease')
    })

    it('advises use of --tag alpha for publishing to npm when tagging alpha', function () {
      writePackageJson('1.0.0')
      fs.writeFileSync('CHANGELOG.md', 'legacy header format<a name="1.0.0">\n', 'utf-8')

      commit('feat: first commit')
      execCli('--prerelease alpha').stdout.should.include('--tag alpha')
    })

    it('does not advise use of --tag prerelease for private modules', function () {
      writePackageJson('1.0.0', { private: true })
      fs.writeFileSync('CHANGELOG.md', 'legacy header format<a name="1.0.0">\n', 'utf-8')

      commit('feat: first commit')
      execCli('--prerelease').stdout.should.not.include('--tag prerelease')
    })
  })

  describe('manual-release', function () {
    describe('release-types', function () {
      const regularTypes = ['major', 'minor', 'patch']

      regularTypes.forEach(function (type) {
        it('creates a ' + type + ' release', function () {
          const originVer = '1.0.0'
          writePackageJson(originVer)
          fs.writeFileSync('CHANGELOG.md', 'legacy header format<a name="1.0.0">\n', 'utf-8')
          mock({ bump: 'patch', changelog: [], tags: [] })
          return execCliAsync('--release-as ' + type)
            .then(function () {
              const version = {
                major: semver.major(originVer),
                minor: semver.minor(originVer),
                patch: semver.patch(originVer)
              }

              version[type] += 1

              getPackageVersion().should.equal(version.major + '.' + version.minor + '.' + version.patch)
            })
        })
      })

      // this is for pre-releases
      regularTypes.forEach(function (type) {
        it('creates a pre' + type + ' release', function () {
          const originVer = '1.0.0'
          writePackageJson(originVer)
          fs.writeFileSync('CHANGELOG.md', 'legacy header format<a name="1.0.0">\n', 'utf-8')
          mock({ bump: 'patch', changelog: [], tags: [] })
          return execCliAsync('--release-as ' + type + ' --prerelease ' + type)
            .then(function () {
              const version = {
                major: semver.major(originVer),
                minor: semver.minor(originVer),
                patch: semver.patch(originVer)
              }

              version[type] += 1

              getPackageVersion().should.equal(version.major + '.' + version.minor + '.' + version.patch + '-' + type + '.0')
            })
        })
      })
    })

    describe('release-as-exact', function () {
      it('releases as v100.0.0', function () {
        const originVer = '1.0.0'
        writePackageJson(originVer)
        fs.writeFileSync('CHANGELOG.md', 'legacy header format<a name="1.0.0">\n', 'utf-8')
        mock({ bump: 'patch', changelog: [], tags: [] })
        return execCliAsync('--release-as v100.0.0')
          .then(function () {
            getPackageVersion().should.equal('100.0.0')
          })
      })

      it('releases as 200.0.0-amazing', function () {
        const originVer = '1.0.0'
        writePackageJson(originVer)
        fs.writeFileSync('CHANGELOG.md', 'legacy header format<a name="1.0.0">\n', 'utf-8')
        mock({ bump: 'patch', changelog: [], tags: [] })
        return execCliAsync('--release-as 200.0.0-amazing')
          .then(function () {
            getPackageVersion().should.equal('200.0.0-amazing')
          })
      })
    })

    it('creates a prerelease with a new minor version after two prerelease patches', async function () {
      writePackageJson('1.0.0')
      fs.writeFileSync('CHANGELOG.md', 'legacy header format<a name="1.0.0">\n', 'utf-8')

      let releaseType = 'patch'
      const bump = (_, cb) => cb(null, { releaseType })
      mock({ bump, changelog: [], tags: [] })

      await execCliAsync('--release-as patch --prerelease dev')
      getPackageVersion().should.equal('1.0.1-dev.0')

      await execCliAsync('--prerelease dev')
      getPackageVersion().should.equal('1.0.1-dev.1')

      releaseType = 'minor'
      await execCliAsync('--release-as minor --prerelease dev')
      getPackageVersion().should.equal('1.1.0-dev.0')

      await execCliAsync('--release-as minor --prerelease dev')
      getPackageVersion().should.equal('1.1.0-dev.1')

      await execCliAsync('--prerelease dev')
      getPackageVersion().should.equal('1.1.0-dev.2')
    })
  })

  it('formats the commit and tag messages appropriately', async function () {
    mock({ bump: 'minor', changelog: [], tags: ['v1.0.0'] })
    await execCliAsync()

    // check last commit message
    shell.exec('git log --oneline -n1').stdout.should.match(/chore\(release\): 1\.1\.0/)
    // check annotated tag message
    shell.exec('git tag -l -n1 v1.1.0').stdout.should.match(/chore\(release\): 1\.1\.0/)
  })

  it('appends line feed at end of package.json', async function () {
    await execCliAsync()
    const pkgJson = fs.readFileSync('package.json', 'utf-8')
    pkgJson.should.equal(['{', '  "version": "1.0.1"', '}', ''].join('\n'))
  })

  it('preserves indentation of tabs in package.json', async function () {
    const indentation = '\t'
    const newPkgJson = ['{', indentation + '"version": "1.0.0"', '}', ''].join('\n')
    fs.writeFileSync('package.json', newPkgJson, 'utf-8')

    await execCliAsync()
    const pkgJson = fs.readFileSync('package.json', 'utf-8')
    pkgJson.should.equal(['{', indentation + '"version": "1.0.1"', '}', ''].join('\n'))
  })

  it('preserves indentation of spaces in package.json', async function () {
    const indentation = '     '
    const newPkgJson = ['{', indentation + '"version": "1.0.0"', '}', ''].join('\n')
    fs.writeFileSync('package.json', newPkgJson, 'utf-8')

    await execCliAsync()
    const pkgJson = fs.readFileSync('package.json', 'utf-8')
    pkgJson.should.equal(['{', indentation + '"version": "1.0.1"', '}', ''].join('\n'))
  })

  it('preserves line feed in package.json', async function () {
    const newPkgJson = ['{', '  "version": "1.0.0"', '}', ''].join('\n')
    fs.writeFileSync('package.json', newPkgJson, 'utf-8')

    await execCliAsync()
    const pkgJson = fs.readFileSync('package.json', 'utf-8')
    pkgJson.should.equal(['{', '  "version": "1.0.1"', '}', ''].join('\n'))
  })

  it('preserves carriage return + line feed in package.json', async function () {
    const newPkgJson = ['{', '  "version": "1.0.0"', '}', ''].join('\r\n')
    fs.writeFileSync('package.json', newPkgJson, 'utf-8')

    await execCliAsync()
    const pkgJson = fs.readFileSync('package.json', 'utf-8')
    pkgJson.should.equal(['{', '  "version": "1.0.1"', '}', ''].join('\r\n'))
  })

  it('does not run git hooks if the --no-verify flag is passed', async function () {
    writeGitPreCommitHook()
    mock({ bump: 'minor', changelog: [], tags: [] })
    await execCliAsync('--no-verify')
    await execCliAsync('-n')
  })

  it('does not print output when the --silent flag is passed', function () {
    const result = execCli('--silent')
    result.code.should.equal(0)
    result.stdout.should.equal('')
    result.stderr.should.equal('')
  })

  it('does not display `npm publish` if the package is private', function () {
    writePackageJson('1.0.0', { private: true })

    const result = execCli()
    result.code.should.equal(0)
    result.stdout.should.not.match(/npm publish/)
  })

  it('does not display `all staged files` without the --commit-all flag', function () {
    const result = execCli()
    result.code.should.equal(0)
    result.stdout.should.not.match(/and all staged files/)
  })

  it('does display `all staged files` if the --commit-all flag is passed', function () {
    const result = execCli('--commit-all')
    result.code.should.equal(0)
    result.stdout.should.match(/and all staged files/)
  })
})

describe('standard-version', function () {
  beforeEach(initInTempFolder)
  afterEach(finishTemp)
  afterEach(unmock)

  it('should exit on bump error', function (done) {
    mock({ bump: new Error('bump err') })
    require('./index')({ silent: true })
      .then(() => {
        throw new Error('Unexpected success')
      })
      .catch((err) => {
        err.message.should.match(/bump err/)
        done()
      })
  })

  it('should exit on changelog error', function (done) {
    mock({ bump: 'minor', changelog: new Error('changelog err') })
    require('./index')({ silent: true })
      .then(() => {
        throw new Error('Unexpected success')
      })
      .catch((err) => {
        err.message.should.match(/changelog err/)
        return done()
      })
  })

  it('formats the commit and tag messages appropriately', function (done) {
    mock({ bump: 'minor', changelog: [], tags: ['v1.0.0'] })
    require('./index')({ silent: true })
      .then(() => {
        // check last commit message
        shell.exec('git log --oneline -n1').stdout.should.match(/chore\(release\): 1\.1\.0/)
        // check annotated tag message
        shell.exec('git tag -l -n1 v1.1.0').stdout.should.match(/chore\(release\): 1\.1\.0/)
        done()
      })
  })

  describe('without a package file to bump', function () {
    it('should exit with error', function () {
      shell.rm('package.json')
      return require('./index')({
        silent: true,
        gitTagFallback: false
      })
        .then(() => {
          throw new Error('Unexpected success')
        })
        .catch((err) => {
          err.message.should.equal('no package file found')
        })
    })
  })

  describe('bower.json support', function () {
    it('bumps version # in bower.json', function () {
      writeBowerJson('1.0.0')
      mock({ bump: 'minor', changelog: [], tags: ['v1.0.0'] })
      return require('./index')({ silent: true })
        .then(() => {
          JSON.parse(fs.readFileSync('bower.json', 'utf-8')).version.should.equal('1.1.0')
          getPackageVersion().should.equal('1.1.0')
        })
    })
  })

  describe('manifest.json support', function () {
    it('bumps version # in manifest.json', function () {
      writeManifestJson('1.0.0')
      mock({ bump: 'minor', changelog: [], tags: ['v1.0.0'] })
      return require('./index')({ silent: true })
        .then(() => {
          JSON.parse(fs.readFileSync('manifest.json', 'utf-8')).version.should.equal('1.1.0')
          getPackageVersion().should.equal('1.1.0')
        })
    })
  })

  describe('custom `bumpFiles` support', function () {
    it('mix.exs + version.txt', function () {
      // @todo This file path is relative to the `tmp` directory, which is a little confusing
      fs.copyFileSync('../test/mocks/mix.exs', 'mix.exs')
      fs.copyFileSync('../test/mocks/version.txt', 'version.txt')
      fs.copyFileSync('../test/mocks/updater/customer-updater.js', 'custom-updater.js')
      mock({ bump: 'minor', changelog: [], tags: ['v1.0.0'] })
      return require('./index')({
        silent: true,
        bumpFiles: [
          'version.txt',
          {
            filename: 'mix.exs',
            updater: 'custom-updater.js'
          }
        ]
      })
        .then(() => {
          fs.readFileSync('mix.exs', 'utf-8').should.contain('version: "1.1.0"')
          fs.readFileSync('version.txt', 'utf-8').should.equal('1.1.0')
        })
    })

    it('bumps a custom `plain-text` file', function () {
      fs.copyFileSync('../test/mocks/VERSION-1.0.0.txt', 'VERSION_TRACKER.txt')
      mock({ bump: 'minor', changelog: [], tags: [] })
      return require('./index')({
        silent: true,
        bumpFiles: [
          {
            filename: 'VERSION_TRACKER.txt',
            type: 'plain-text'
          }
        ]
      })
        .then(() => {
          fs.readFileSync('VERSION_TRACKER.txt', 'utf-8').should.equal('1.1.0')
        })
    })
  })

  describe('custom `packageFiles` support', function () {
    it('reads and writes to a custom `plain-text` file', function () {
      fs.copyFileSync('../test/mocks/VERSION-6.3.1.txt', 'VERSION_TRACKER.txt')
      mock({ bump: 'minor', changelog: [], tags: [] })
      return require('./index')({
        silent: true,
        packageFiles: [
          {
            filename: 'VERSION_TRACKER.txt',
            type: 'plain-text'
          }
        ],
        bumpFiles: [
          {
            filename: 'VERSION_TRACKER.txt',
            type: 'plain-text'
          }
        ]
      })
        .then(() => {
          fs.readFileSync('VERSION_TRACKER.txt', 'utf-8').should.equal('6.4.0')
        })
    })
  })

  describe('npm-shrinkwrap.json support', function () {
    it('bumps version # in npm-shrinkwrap.json', function (done) {
      writeNpmShrinkwrapJson('1.0.0')
      mock({ bump: 'minor', changelog: [], tags: ['v1.0.0'] })
      require('./index')({ silent: true })
        .then(() => {
          JSON.parse(fs.readFileSync('npm-shrinkwrap.json', 'utf-8')).version.should.equal('1.1.0')
          getPackageVersion().should.equal('1.1.0')
          return done()
        })
    })
  })

  describe('package-lock.json support', function () {
    beforeEach(function () {
      writePackageLockJson('1.0.0')
      fs.writeFileSync('.gitignore', '', 'utf-8')
    })

    it('bumps version # in package-lock.json', function () {
      mock({ bump: 'minor', changelog: [], tags: ['v1.0.0'] })
      return require('./index')({ silent: true })
        .then(() => {
          JSON.parse(fs.readFileSync('package-lock.json', 'utf-8')).version.should.equal('1.1.0')
          getPackageVersion().should.equal('1.1.0')
        })
    })
  })

  describe('dry-run', function () {
    it('skips all non-idempotent steps', function (done) {
      commit('feat: first commit')
      shell.exec('git tag -a v1.0.0 -m "my awesome first release"')
      commit('feat: new feature!')
      execCli('--dry-run').stdout.should.match(/### Features/)
      shell.exec('git log --oneline -n1').stdout.should.match(/feat: new feature!/)
      shell.exec('git tag').stdout.should.match(/1\.0\.0/)
      getPackageVersion().should.equal('1.0.0')
      return done()
    })
  })

  describe('skip', () => {
    it('allows bump and changelog generation to be skipped', function () {
      const changelogContent = 'legacy header format<a name="1.0.0">\n'
      writePackageJson('1.0.0')
      fs.writeFileSync('CHANGELOG.md', changelogContent, 'utf-8')

      mock({ bump: 'minor', changelog: 'foo\n', tags: [] })
      return execCliAsync('--skip.bump true --skip.changelog true')
        .then(function () {
          getPackageVersion().should.equal('1.0.0')
          const content = fs.readFileSync('CHANGELOG.md', 'utf-8')
          content.should.equal(changelogContent)
        })
    })

    it('allows the commit phase to be skipped', function () {
      const changelogContent = 'legacy header format<a name="1.0.0">\n'
      writePackageJson('1.0.0')
      fs.writeFileSync('CHANGELOG.md', changelogContent, 'utf-8')

      commit('feat: new feature from branch')
      return execCliAsync('--skip.commit true')
        .then(function () {
          getPackageVersion().should.equal('1.1.0')
          const content = fs.readFileSync('CHANGELOG.md', 'utf-8')
          content.should.match(/new feature from branch/)
          // check last commit message
          shell.exec('git log --oneline -n1').stdout.should.match(/feat: new feature from branch/)
        })
    })
  })

  describe('.gitignore', () => {
    it('does not update files present in .gitignore', () => {
      writeBowerJson('1.0.0')
      fs.writeFileSync('.gitignore', 'bower.json', 'utf-8')

      mock({ bump: 'minor', changelog: [], tags: ['v1.0.0'] })
      return require('./index')({ silent: true })
        .then(() => {
          JSON.parse(fs.readFileSync('bower.json', 'utf-8')).version.should.equal('1.0.0')
          getPackageVersion().should.equal('1.1.0')
        })
    })
  })

  describe('gitTagFallback', () => {
    it('defaults to 1.0.0 if no tags in git history', () => {
      shell.rm('package.json')
      mock({ bump: 'minor', changelog: [], tags: [] })
      return require('./index')({ silent: true })
        .then(() => {
          const output = shell.exec('git tag')
          output.stdout.should.include('v1.1.0')
        })
    })

    it('bases version on greatest-version tag, if tags are found', () => {
      shell.rm('package.json')
      mock({ bump: 'minor', changelog: [], tags: ['v3.9.0', 'v5.0.0', 'v3.0.0'] })
      return require('./index')({ silent: true })
        .then(() => {
          const output = shell.exec('git tag')
          output.stdout.should.include('v5.1.0')
        })
    })

    it('does not display `npm publish` if there is no package.json', function () {
      shell.rm('package.json')
      const result = execCli()
      result.code.should.equal(0)
      result.stdout.should.not.match(/npm publish/)
    })
  })

  describe('configuration', () => {
    it('reads config from package.json', function () {
      writePackageJson('1.0.0', {
        repository: {
          url: 'git+https://company@scm.org/office/app.git'
        },
        'standard-version': {
          issueUrlFormat: 'https://standard-version.company.net/browse/{{id}}'
        }
      })
      commit('feat: another commit addresses issue #1')
      execCli()
      // CHANGELOG should have the new issue URL format.
      const content = fs.readFileSync('CHANGELOG.md', 'utf-8')
      content.should.include('https://standard-version.company.net/browse/1')
    })

    it('reads config from .versionrc', function () {
      // write configuration that overrides default issue
      // URL format.
      fs.writeFileSync('.versionrc', JSON.stringify({
        issueUrlFormat: 'http://www.foo.com/{{id}}'
      }), 'utf-8')
      commit('feat: another commit addresses issue #1')
      execCli()
      // CHANGELOG should have the new issue URL format.
      const content = fs.readFileSync('CHANGELOG.md', 'utf-8')
      content.should.include('http://www.foo.com/1')
    })

    it('reads config from .versionrc.json', function () {
      // write configuration that overrides default issue
      // URL format.
      fs.writeFileSync('.versionrc.json', JSON.stringify({
        issueUrlFormat: 'http://www.foo.com/{{id}}'
      }), 'utf-8')
      commit('feat: another commit addresses issue #1')
      execCli()
      // CHANGELOG should have the new issue URL format.
      const content = fs.readFileSync('CHANGELOG.md', 'utf-8')
      content.should.include('http://www.foo.com/1')
    })

    it('evaluates a config-function from .versionrc.js', function () {
      // write configuration that overrides default issue
      // URL format.
      fs.writeFileSync(
        '.versionrc.js',
        `module.exports = function() {
          return {
            issueUrlFormat: 'http://www.versionrc.js/function/{{id}}'
          }
        }`,
        'utf-8'
      )
      commit('feat: another commit addresses issue #1')
      execCli()
      // CHANGELOG should have the new issue URL format.
      const content = fs.readFileSync('CHANGELOG.md', 'utf-8')
      content.should.include('http://www.versionrc.js/function/1')
    })

    it('evaluates a config-object from .versionrc.js', function () {
      // write configuration that overrides default issue
      // URL format.
      fs.writeFileSync(
        '.versionrc.js',
        `module.exports = {
          issueUrlFormat: 'http://www.versionrc.js/object/{{id}}'
        }`,
        'utf-8'
      )
      commit('feat: another commit addresses issue #1')
      execCli()
      // CHANGELOG should have the new issue URL format.
      const content = fs.readFileSync('CHANGELOG.md', 'utf-8')
      content.should.include('http://www.versionrc.js/object/1')
    })

    it('throws an error when a non-object is returned from .versionrc.js', function () {
      // write configuration that overrides default issue
      // URL format.
      fs.writeFileSync(
        '.versionrc.js',
        'module.exports = 3',
        'utf-8'
      )
      commit('feat: another commit addresses issue #1')
      execCli().code.should.equal(1)
    })

    it('.versionrc : releaseCommitMessageFormat', function () {
      // write configuration that overrides default issue
      // URL format.
      fs.writeFileSync('.versionrc', JSON.stringify({
        releaseCommitMessageFormat: 'This commit represents release: {{currentTag}}'
      }), 'utf-8')
      commit('feat: another commit addresses issue #1')
      execCli()
      shell.exec('git log --oneline -n1').should.include('This commit represents release: 1.1.0')
    })

    it('--releaseCommitMessageFormat', function () {
      commit('feat: another commit addresses issue #1')
      execCli('--releaseCommitMessageFormat="{{currentTag}} is the version."')
      shell.exec('git log --oneline -n1').should.include('1.1.0 is the version.')
    })

    it('.versionrc : issuePrefixes', function () {
      // write configuration that overrides default issuePrefixes
      // and reference prefix in issue URL format.
      fs.writeFileSync('.versionrc', JSON.stringify({
        issueUrlFormat: 'http://www.foo.com/{{prefix}}{{id}}',
        issuePrefixes: ['ABC-']
      }), 'utf-8')
      commit('feat: another commit addresses issue ABC-1')
      execCli()
      // CHANGELOG should have the new issue URL format.
      const content = fs.readFileSync('CHANGELOG.md', 'utf-8')
      content.should.include('http://www.foo.com/ABC-1')
    })

    it('--header', function () {
      fs.writeFileSync('CHANGELOG.md', '', 'utf-8')
      commit('feat: first commit')
      execCli('--header="# Welcome to our CHANGELOG.md"').code.should.equal(0)
      const content = fs.readFileSync('CHANGELOG.md', 'utf-8')
      content.should.match(/# Welcome to our CHANGELOG.md/)
    })

    it('--issuePrefixes and --issueUrlFormat', function () {
      commit('feat: another commit addresses issue ABC-1')
      execCli('--issuePrefixes="ABC-" --issueUrlFormat="http://www.foo.com/{{prefix}}{{id}}"')
      const content = fs.readFileSync('CHANGELOG.md', 'utf-8')
      content.should.include('http://www.foo.com/ABC-1')
    })

    it('[LEGACY] supports --message (and single %s replacement)', function () {
      commit('feat: another commit addresses issue #1')
      execCli('--message="V:%s"')
      shell.exec('git log --oneline -n1').should.include('V:1.1.0')
    })

    it('[LEGACY] supports -m (and multiple %s replacements)', function () {
      commit('feat: another commit addresses issue #1')
      execCli('--message="V:%s is the %s."')
      shell.exec('git log --oneline -n1').should.include('V:1.1.0 is the 1.1.0.')
    })
  })

  describe('pre-major', () => {
    it('bumps the minor rather than major, if version < 1.0.0', function () {
      writePackageJson('0.5.0', {
        repository: {
          url: 'https://github.com/yargs/yargs.git'
        }
      })
      commit('feat!: this is a breaking change')
      execCli()
      getPackageVersion().should.equal('0.6.0')
    })

    it('bumps major if --release-as=major specified, if version < 1.0.0', function () {
      writePackageJson('0.5.0', {
        repository: {
          url: 'https://github.com/yargs/yargs.git'
        }
      })
      commit('feat!: this is a breaking change')
      execCli('-r major')
      getPackageVersion().should.equal('1.0.0')
    })
  })
})

describe('GHSL-2020-111', function () {
  beforeEach(initInTempFolder)
  afterEach(finishTemp)
  it('does not allow command injection via basic configuration', function () {
    return require('./index')({
      silent: true,
      noVerify: true,
      infile: 'foo.txt',
      releaseCommitMessageFormat: 'bla `touch exploit`'
    }).then(function () {
      const stat = shell.test('-f', './exploit')
      stat.should.equal(false)
    })
  })
})
