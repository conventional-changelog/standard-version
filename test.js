/* global describe it beforeEach afterEach */

'use strict'

const shell = require('shelljs')
const fs = require('fs')
const { Readable } = require('stream')
const mockGit = require('mock-git')
const mockery = require('mockery')
const stdMocks = require('std-mocks')
const semver = require('semver')
const formatCommitMessage = require('./lib/format-commit-message')

require('chai').should()

function exec (opt = '', git) {
  if (typeof opt === 'string') {
    const cli = require('./command')
    opt = cli.parse(`standard-version ${opt}`)
  }
  if (!git) opt.skip = Object.assign({}, opt.skip, { commit: true, tag: true })
  return require('./index')(opt)
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
  shell.exec('git commit --allow-empty -m"root-commit"')
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
function mock ({ bump, changelog, tags } = {}) {
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

  stdMocks.use()
  return () => stdMocks.flush()
}

function unmock () {
  mockery.deregisterAll()
  mockery.disable()
  stdMocks.restore()

  // push out prints from the Mocha reporter
  const { stdout } = stdMocks.flush()
  for (const str of stdout) {
    if (str.startsWith(' ')) process.stdout.write(str)
  }
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
      await exec()
      const content = fs.readFileSync('CHANGELOG.md', 'utf-8')
      content.should.match(/patch release/)
    })

    it('includes all commits if --first-release is true', async function () {
      writePackageJson('1.0.1')
      mock({ bump: 'minor', changelog: 'first commit\npatch release\n', tags: [] })
      await exec('--first-release')
      const content = fs.readFileSync('CHANGELOG.md', 'utf-8')
      content.should.match(/patch release/)
      content.should.match(/first commit/)
    })

    it('skipping changelog will not create a changelog file', async function () {
      writePackageJson('1.0.0')
      mock({ bump: 'minor', changelog: 'foo\n', tags: [] })
      await exec('--skip.changelog true')
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
      await exec()
      const content = fs.readFileSync('CHANGELOG.md', 'utf-8')
      content.should.match(/1\.0\.1/)
      content.should.not.match(/legacy header format/)
    })

    it('appends the new release above the last release, removing the old header (new format)', async function () {
      const { header } = require('./defaults')
      const changelog1 = '### [1.0.1](/compare/v1.0.0...v1.0.1) (YYYY-MM-DD)\n\n\n### Bug Fixes\n\n* patch release ABCDEFXY\n'
      mock({ bump: 'patch', changelog: changelog1, tags: ['v1.0.0'] })
      await exec()
      let content = fs.readFileSync('CHANGELOG.md', 'utf-8')
      content.should.equal(header + '\n' + changelog1)

      const changelog2 = '### [1.0.2](/compare/v1.0.1...v1.0.2) (YYYY-MM-DD)\n\n\n### Bug Fixes\n\n* another patch release ABCDEFXY\n'
      unmock()
      mock({ bump: 'patch', changelog: changelog2, tags: ['v1.0.0', 'v1.0.1'] })
      await exec()
      content = fs.readFileSync('CHANGELOG.md', 'utf-8')
      content.should.equal(header + '\n' + changelog2 + changelog1)
    })

    it('[DEPRECATED] (--changelogHeader) allows for a custom changelog header', async function () {
      fs.writeFileSync('CHANGELOG.md', '', 'utf-8')
      const header = '# Pork Chop Log'
      mock({ bump: 'minor', changelog: header + '\n', tags: [] })
      await exec(`--changelogHeader="${header}"`)
      const content = fs.readFileSync('CHANGELOG.md', 'utf-8')
      content.should.match(new RegExp(header))
    })

    it('[DEPRECATED] (--changelogHeader) exits with error if changelog header matches last version search regex', async function () {
      fs.writeFileSync('CHANGELOG.md', '', 'utf-8')
      mock({ bump: 'minor', changelog: [], tags: [] })
      try {
        await exec('--changelogHeader="## 3.0.2"')
        throw new Error('That should not have worked')
      } catch (error) {
        error.message.should.match(/custom changelog header must not match/)
      }
    })
  })

  describe('lifecycle scripts', () => {
    describe('prerelease hook', function () {
      it('should run the prerelease hook when provided', async function () {
        writePackageJson('1.0.0', {
          'standard-version': {
            scripts: { prerelease: 'node scripts/prerelease' }
          }
        })
        writeHook('prerelease')
        fs.writeFileSync('CHANGELOG.md', 'legacy header format<a name="1.0.0">\n', 'utf-8')

        const flush = mock({ bump: 'minor', changelog: [], tags: [] })
        await exec('--patch')
        const { stderr } = flush()
        stderr[0].should.match(/prerelease ran/)
      })

      it('should abort if the hook returns a non-zero exit code', async function () {
        writePackageJson('1.0.0', {
          'standard-version': {
            scripts: { prerelease: 'node scripts/prerelease && exit 1' }
          }
        })
        writeHook('prerelease')
        fs.writeFileSync('CHANGELOG.md', 'legacy header format<a name="1.0.0">\n', 'utf-8')

        mock({ bump: 'minor', changelog: [], tags: [] })
        try {
          await exec('--patch')
          throw new Error('Unexpected success')
        } catch (error) {
          error.message.should.match(/prerelease ran/)
        }
      })
    })

    describe('prebump hook', function () {
      it('should allow prebump hook to return an alternate version #', async function () {
        writePackageJson('1.0.0', {
          'standard-version': {
            scripts: { prebump: 'node scripts/prebump' }
          }
        })
        writeHook('prebump', false, 'console.log("9.9.9")')
        fs.writeFileSync('CHANGELOG.md', 'legacy header format<a name="1.0.0">\n', 'utf-8')

        const flush = mock({ bump: 'minor', changelog: [], tags: [] })
        await exec('--patch')
        const { stdout } = flush()
        stdout.join('').should.match(/9\.9\.9/)
      })
    })

    describe('postbump hook', function () {
      it('should run the postbump hook when provided', async function () {
        writePackageJson('1.0.0', {
          'standard-version': {
            scripts: { postbump: 'node scripts/postbump' }
          }
        })
        writePostBumpHook()
        fs.writeFileSync('CHANGELOG.md', 'legacy header format<a name="1.0.0">\n', 'utf-8')

        const flush = mock({ bump: 'minor', changelog: [], tags: [] })
        await exec('--patch')
        const { stderr } = flush()
        stderr[0].should.match(/postbump ran/)
      })

      it('should run the postbump and exit with error when postbump fails', async function () {
        writePackageJson('1.0.0', {
          'standard-version': {
            scripts: {
              postbump: 'node scripts/postbump'
            }
          }
        })
        writePostBumpHook(true)
        fs.writeFileSync('CHANGELOG.md', 'legacy header format<a name="1.0.0">\n', 'utf-8')

        mock({ bump: 'minor', changelog: [], tags: [] })
        try {
          await exec('--patch')
          throw new Error('Unexpected success')
        } catch (error) {
          error.message.should.match(/postbump-failure/)
        }
      })
    })
  })

  describe('manual-release', function () {
    describe('release-types', function () {
      const regularTypes = ['major', 'minor', 'patch']

      regularTypes.forEach(function (type) {
        it('creates a ' + type + ' release', async function () {
          const originVer = '1.0.0'
          writePackageJson(originVer)
          fs.writeFileSync('CHANGELOG.md', 'legacy header format<a name="1.0.0">\n', 'utf-8')
          mock({ bump: 'patch', changelog: [], tags: [] })
          await exec('--release-as ' + type)
          const version = {
            major: semver.major(originVer),
            minor: semver.minor(originVer),
            patch: semver.patch(originVer)
          }
          version[type] += 1
          getPackageVersion().should.equal(version.major + '.' + version.minor + '.' + version.patch)
        })
      })

      // this is for pre-releases
      regularTypes.forEach(function (type) {
        it('creates a pre' + type + ' release', async function () {
          const originVer = '1.0.0'
          writePackageJson(originVer)
          fs.writeFileSync('CHANGELOG.md', 'legacy header format<a name="1.0.0">\n', 'utf-8')
          mock({ bump: 'patch', changelog: [], tags: [] })
          await exec('--release-as ' + type + ' --prerelease ' + type)
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

    describe('release-as-exact', function () {
      it('releases as v100.0.0', async function () {
        const originVer = '1.0.0'
        writePackageJson(originVer)
        fs.writeFileSync('CHANGELOG.md', 'legacy header format<a name="1.0.0">\n', 'utf-8')
        mock({ bump: 'patch', changelog: [], tags: [] })
        await exec('--release-as v100.0.0')
        getPackageVersion().should.equal('100.0.0')
      })

      it('releases as 200.0.0-amazing', async function () {
        const originVer = '1.0.0'
        writePackageJson(originVer)
        fs.writeFileSync('CHANGELOG.md', 'legacy header format<a name="1.0.0">\n', 'utf-8')
        mock({ bump: 'patch', changelog: [], tags: [] })
        await exec('--release-as 200.0.0-amazing')
        getPackageVersion().should.equal('200.0.0-amazing')
      })
    })

    it('creates a prerelease with a new minor version after two prerelease patches', async function () {
      writePackageJson('1.0.0')
      fs.writeFileSync('CHANGELOG.md', 'legacy header format<a name="1.0.0">\n', 'utf-8')

      let releaseType = 'patch'
      const bump = (_, cb) => cb(null, { releaseType })
      mock({ bump, changelog: [], tags: [] })

      await exec('--release-as patch --prerelease dev')
      getPackageVersion().should.equal('1.0.1-dev.0')

      await exec('--prerelease dev')
      getPackageVersion().should.equal('1.0.1-dev.1')

      releaseType = 'minor'
      await exec('--release-as minor --prerelease dev')
      getPackageVersion().should.equal('1.1.0-dev.0')

      await exec('--release-as minor --prerelease dev')
      getPackageVersion().should.equal('1.1.0-dev.1')

      await exec('--prerelease dev')
      getPackageVersion().should.equal('1.1.0-dev.2')
    })
  })

  it('appends line feed at end of package.json', async function () {
    mock()
    await exec()
    const pkgJson = fs.readFileSync('package.json', 'utf-8')
    pkgJson.should.equal(['{', '  "version": "1.0.1"', '}', ''].join('\n'))
  })

  it('preserves indentation of tabs in package.json', async function () {
    const indentation = '\t'
    const newPkgJson = ['{', indentation + '"version": "1.0.0"', '}', ''].join('\n')
    fs.writeFileSync('package.json', newPkgJson, 'utf-8')

    mock()
    await exec()
    const pkgJson = fs.readFileSync('package.json', 'utf-8')
    pkgJson.should.equal(['{', indentation + '"version": "1.0.1"', '}', ''].join('\n'))
  })

  it('preserves indentation of spaces in package.json', async function () {
    const indentation = '     '
    const newPkgJson = ['{', indentation + '"version": "1.0.0"', '}', ''].join('\n')
    fs.writeFileSync('package.json', newPkgJson, 'utf-8')

    mock()
    await exec()
    const pkgJson = fs.readFileSync('package.json', 'utf-8')
    pkgJson.should.equal(['{', indentation + '"version": "1.0.1"', '}', ''].join('\n'))
  })

  it('preserves line feed in package.json', async function () {
    const newPkgJson = ['{', '  "version": "1.0.0"', '}', ''].join('\n')
    fs.writeFileSync('package.json', newPkgJson, 'utf-8')

    mock()
    await exec()
    const pkgJson = fs.readFileSync('package.json', 'utf-8')
    pkgJson.should.equal(['{', '  "version": "1.0.1"', '}', ''].join('\n'))
  })

  it('preserves carriage return + line feed in package.json', async function () {
    const newPkgJson = ['{', '  "version": "1.0.0"', '}', ''].join('\r\n')
    fs.writeFileSync('package.json', newPkgJson, 'utf-8')

    mock()
    await exec()
    const pkgJson = fs.readFileSync('package.json', 'utf-8')
    pkgJson.should.equal(['{', '  "version": "1.0.1"', '}', ''].join('\r\n'))
  })

  it('does not print output when the --silent flag is passed', async function () {
    const flush = mock()
    await exec('--silent')
    flush().should.eql({ stdout: [], stderr: [] })
  })
})

describe('standard-version', function () {
  beforeEach(initInTempFolder)
  afterEach(finishTemp)
  afterEach(unmock)

  it('should exit on bump error', async function () {
    mock({ bump: new Error('bump err') })
    try {
      await exec()
      throw new Error('Unexpected success')
    } catch (err) {
      err.message.should.match(/bump err/)
    }
  })

  it('should exit on changelog error', async function () {
    mock({ bump: 'minor', changelog: new Error('changelog err') })
    try {
      await exec()
      throw new Error('Unexpected success')
    } catch (err) {
      err.message.should.match(/changelog err/)
    }
  })

  it('should exit with error without a package file to bump', async function () {
    shell.rm('package.json')
    mock()
    try {
      await exec({ gitTagFallback: false })
      throw new Error('Unexpected success')
    } catch (err) {
      err.message.should.equal('no package file found')
    }
  })

  it('bumps version # in bower.json', async function () {
    writeBowerJson('1.0.0')
    mock({ bump: 'minor', changelog: [], tags: ['v1.0.0'] })
    await exec()
    JSON.parse(fs.readFileSync('bower.json', 'utf-8')).version.should.equal('1.1.0')
    getPackageVersion().should.equal('1.1.0')
  })

  it('bumps version # in manifest.json', async function () {
    writeManifestJson('1.0.0')
    mock({ bump: 'minor', changelog: [], tags: ['v1.0.0'] })
    await exec()
    JSON.parse(fs.readFileSync('manifest.json', 'utf-8')).version.should.equal('1.1.0')
    getPackageVersion().should.equal('1.1.0')
  })

  describe('custom `bumpFiles` support', function () {
    it('mix.exs + version.txt', async function () {
      // @todo This file path is relative to the `tmp` directory, which is a little confusing
      fs.copyFileSync('../test/mocks/mix.exs', 'mix.exs')
      fs.copyFileSync('../test/mocks/version.txt', 'version.txt')
      fs.copyFileSync('../test/mocks/updater/customer-updater.js', 'custom-updater.js')
      mock({ bump: 'minor', changelog: [], tags: ['v1.0.0'] })
      await exec({
        bumpFiles: [
          'version.txt',
          { filename: 'mix.exs', updater: 'custom-updater.js' }
        ]
      })
      fs.readFileSync('mix.exs', 'utf-8').should.contain('version: "1.1.0"')
      fs.readFileSync('version.txt', 'utf-8').should.equal('1.1.0')
    })

    it('bumps a custom `plain-text` file', async function () {
      fs.copyFileSync('../test/mocks/VERSION-1.0.0.txt', 'VERSION_TRACKER.txt')
      mock({ bump: 'minor', changelog: [], tags: [] })
      await exec({
        bumpFiles: [
          { filename: 'VERSION_TRACKER.txt', type: 'plain-text' }
        ]
      })
      fs.readFileSync('VERSION_TRACKER.txt', 'utf-8').should.equal('1.1.0')
    })
  })

  describe('custom `packageFiles` support', function () {
    it('reads and writes to a custom `plain-text` file', async function () {
      fs.copyFileSync('../test/mocks/VERSION-6.3.1.txt', 'VERSION_TRACKER.txt')
      mock({ bump: 'minor', changelog: [], tags: [] })
      await exec({
        packageFiles: [
          { filename: 'VERSION_TRACKER.txt', type: 'plain-text' }
        ],
        bumpFiles: [
          { filename: 'VERSION_TRACKER.txt', type: 'plain-text' }
        ]
      })
      fs.readFileSync('VERSION_TRACKER.txt', 'utf-8').should.equal('6.4.0')
    })
  })

  it('bumps version # in npm-shrinkwrap.json', async function () {
    writeNpmShrinkwrapJson('1.0.0')
    mock({ bump: 'minor', changelog: [], tags: ['v1.0.0'] })
    await exec()
    JSON.parse(fs.readFileSync('npm-shrinkwrap.json', 'utf-8')).version.should.equal('1.1.0')
    getPackageVersion().should.equal('1.1.0')
  })

  it('bumps version # in package-lock.json', async function () {
    writePackageLockJson('1.0.0')
    fs.writeFileSync('.gitignore', '', 'utf-8')
    mock({ bump: 'minor', changelog: [], tags: ['v1.0.0'] })
    await exec()
    JSON.parse(fs.readFileSync('package-lock.json', 'utf-8')).version.should.equal('1.1.0')
    getPackageVersion().should.equal('1.1.0')
  })

  describe('skip', () => {
    it('allows bump and changelog generation to be skipped', async function () {
      const changelogContent = 'legacy header format<a name="1.0.0">\n'
      writePackageJson('1.0.0')
      fs.writeFileSync('CHANGELOG.md', changelogContent, 'utf-8')

      mock({ bump: 'minor', changelog: 'foo\n', tags: [] })
      await exec('--skip.bump true --skip.changelog true')
      getPackageVersion().should.equal('1.0.0')
      const content = fs.readFileSync('CHANGELOG.md', 'utf-8')
      content.should.equal(changelogContent)
    })
  })

  it('does not update files present in .gitignore', async () => {
    writeBowerJson('1.0.0')
    fs.writeFileSync('.gitignore', 'bower.json', 'utf-8')

    mock({ bump: 'minor', changelog: [], tags: ['v1.0.0'] })
    await exec()
    JSON.parse(fs.readFileSync('bower.json', 'utf-8')).version.should.equal('1.0.0')
    getPackageVersion().should.equal('1.1.0')
  })

  describe('configuration', () => {
    it('reads config from package.json', async function () {
      const issueUrlFormat = 'https://standard-version.company.net/browse/{{id}}'
      writePackageJson('1.0.0', {
        repository: { url: 'git+https://company@scm.org/office/app.git' },
        'standard-version': { issueUrlFormat }
      })

      const changelog = ({ preset }) => preset.issueUrlFormat
      mock({ bump: 'minor', changelog, tags: [] })
      await exec()
      const content = fs.readFileSync('CHANGELOG.md', 'utf-8')
      content.should.include(issueUrlFormat)
    })

    it('reads config from .versionrc', async function () {
      const issueUrlFormat = 'http://www.foo.com/{{id}}'
      fs.writeFileSync('.versionrc', JSON.stringify({ issueUrlFormat }), 'utf-8')

      const changelog = ({ preset }) => preset.issueUrlFormat
      mock({ bump: 'minor', changelog, tags: [] })
      await exec()
      const content = fs.readFileSync('CHANGELOG.md', 'utf-8')
      content.should.include(issueUrlFormat)
    })

    it('reads config from .versionrc.json', async function () {
      const issueUrlFormat = 'http://www.foo.com/{{id}}'
      fs.writeFileSync('.versionrc.json', JSON.stringify({ issueUrlFormat }), 'utf-8')

      const changelog = ({ preset }) => preset.issueUrlFormat
      mock({ bump: 'minor', changelog, tags: [] })
      await exec()
      const content = fs.readFileSync('CHANGELOG.md', 'utf-8')
      content.should.include(issueUrlFormat)
    })

    it('evaluates a config-function from .versionrc.js', async function () {
      const issueUrlFormat = 'http://www.foo.com/{{id}}'
      const src = `module.exports = function() { return ${JSON.stringify({ issueUrlFormat })} }`
      fs.writeFileSync('.versionrc.js', src, 'utf-8')

      const changelog = ({ preset }) => preset.issueUrlFormat
      mock({ bump: 'minor', changelog, tags: [] })
      await exec()
      const content = fs.readFileSync('CHANGELOG.md', 'utf-8')
      content.should.include(issueUrlFormat)
    })

    it('evaluates a config-object from .versionrc.js', async function () {
      const issueUrlFormat = 'http://www.foo.com/{{id}}'
      const src = `module.exports = ${JSON.stringify({ issueUrlFormat })}`
      fs.writeFileSync('.versionrc.js', src, 'utf-8')

      const changelog = ({ preset }) => preset.issueUrlFormat
      mock({ bump: 'minor', changelog, tags: [] })
      await exec()
      const content = fs.readFileSync('CHANGELOG.md', 'utf-8')
      content.should.include(issueUrlFormat)
    })

    it('throws an error when a non-object is returned from .versionrc.js', async function () {
      fs.writeFileSync('.versionrc.js', 'module.exports = 3', 'utf-8')
      mock({ bump: 'minor', changelog: [], tags: [] })
      try {
        await exec()
        throw new Error('Unexpected success')
      } catch (error) {
        error.message.should.match(/Invalid configuration/)
      }
    })

    it('--header', async function () {
      fs.writeFileSync('CHANGELOG.md', '', 'utf-8')
      mock({ bump: 'minor', changelog: [], tags: [] })
      await exec('--header="# Welcome to our CHANGELOG.md"')
      const content = fs.readFileSync('CHANGELOG.md', 'utf-8')
      content.should.match(/# Welcome to our CHANGELOG.md/)
    })

    it('--issuePrefixes and --issueUrlFormat', async function () {
      const format = 'http://www.foo.com/{{prefix}}{{id}}'
      const prefix = 'ABC-'
      mock({ bump: 'minor', changelog: [], tags: [] })
      const changelog = ({ preset }) => preset.issueUrlFormat + ':' + preset.issuePrefixes
      mock({ bump: 'minor', changelog, tags: [] })
      await exec(`--issuePrefixes="${prefix}" --issueUrlFormat="${format}"`)
      const content = fs.readFileSync('CHANGELOG.md', 'utf-8')
      content.should.include(`${format}:${prefix}`)
    })
  })

  describe('pre-major', () => {
    it('bumps the minor rather than major, if version < 1.0.0', async function () {
      writePackageJson('0.5.0', {
        repository: {
          url: 'https://github.com/yargs/yargs.git'
        }
      })
      mock({ bump: 'minor', changelog: [], tags: [] })
      await exec()
      getPackageVersion().should.equal('0.6.0')
    })

    it('bumps major if --release-as=major specified, if version < 1.0.0', async function () {
      writePackageJson('0.5.0', {
        repository: {
          url: 'https://github.com/yargs/yargs.git'
        }
      })
      mock({ bump: 'major', changelog: [], tags: [] })
      await exec('-r major')
      getPackageVersion().should.equal('1.0.0')
    })
  })
})

describe('git', function () {
  beforeEach(initInTempFolder)
  afterEach(finishTemp)
  afterEach(unmock)

  it('formats the commit and tag messages appropriately', async function () {
    mock({ bump: 'minor', changelog: [], tags: ['v1.0.0'] })
    await exec({}, true)
    // check last commit message
    shell.exec('git log --oneline -n1').stdout.should.match(/chore\(release\): 1\.1\.0/)
    // check annotated tag message
    shell.exec('git tag -l -n1 v1.1.0').stdout.should.match(/chore\(release\): 1\.1\.0/)
  })

  it('formats the tag if --first-release is true', async function () {
    writePackageJson('1.0.1')
    mock({ bump: 'minor', changelog: [], tags: [] })
    await exec('--first-release', true)
    shell.exec('git tag').stdout.should.match(/1\.0\.1/)
  })

  it('commits all staged files', async function () {
    fs.writeFileSync('CHANGELOG.md', 'legacy header format<a name="1.0.0">\n', 'utf-8')
    fs.writeFileSync('STUFF.md', 'stuff\n', 'utf-8')
    shell.exec('git add STUFF.md')

    mock({ bump: 'patch', changelog: 'release 1.0.1\n', tags: ['v1.0.0'] })
    await exec('--commit-all', true)
    const status = shell.exec('git status --porcelain') // see http://unix.stackexchange.com/questions/155046/determine-if-git-working-directory-is-clean-from-a-script
    status.should.equal('')
    status.should.not.match(/STUFF.md/)

    const content = fs.readFileSync('CHANGELOG.md', 'utf-8')
    content.should.match(/1\.0\.1/)
    content.should.not.match(/legacy header format/)
  })

  it('does not run git hooks if the --no-verify flag is passed', async function () {
    fs.writeFileSync('.git/hooks/pre-commit', '#!/bin/sh\necho "precommit ran"\nexit 1', 'utf-8')
    fs.chmodSync('.git/hooks/pre-commit', '755')

    mock({ bump: 'minor', changelog: [], tags: [] })
    await exec('--no-verify', true)
    await exec('-n', true)
  })

  it('allows the commit phase to be skipped', async function () {
    const changelogContent = 'legacy header format<a name="1.0.0">\n'
    writePackageJson('1.0.0')
    fs.writeFileSync('CHANGELOG.md', changelogContent, 'utf-8')

    mock({ bump: 'minor', changelog: 'new feature\n', tags: [] })
    await exec('--skip.commit true', true)
    getPackageVersion().should.equal('1.1.0')
    const content = fs.readFileSync('CHANGELOG.md', 'utf-8')
    content.should.match(/new feature/)
    shell.exec('git log --oneline -n1').stdout.should.match(/root-commit/)
  })

  it('dry-run skips all non-idempotent steps', async function () {
    shell.exec('git tag -a v1.0.0 -m "my awesome first release"')
    const flush = mock({ bump: 'minor', changelog: '### Features\n', tags: ['v1.0.0'] })
    await exec('--dry-run', true)
    const { stdout } = flush()
    stdout.join('').should.match(/### Features/)
    shell.exec('git log --oneline -n1').stdout.should.match(/root-commit/)
    shell.exec('git tag').stdout.should.match(/1\.0\.0/)
    getPackageVersion().should.equal('1.0.0')
  })

  it('works fine without specifying a tag id when prereleasing', async function () {
    writePackageJson('1.0.0')
    fs.writeFileSync('CHANGELOG.md', 'legacy header format<a name="1.0.0">\n', 'utf-8')
    mock({ bump: 'minor', changelog: [], tags: [] })
    await exec('--prerelease', true)
    getPackageVersion().should.equal('1.1.0-0')
  })

  describe('gitTagFallback', () => {
    it('defaults to 1.0.0 if no tags in git history', async () => {
      shell.rm('package.json')
      mock({ bump: 'minor', changelog: [], tags: [] })
      await exec({}, true)
      const output = shell.exec('git tag')
      output.stdout.should.include('v1.1.0')
    })

    it('bases version on greatest version tag, if tags are found', async () => {
      shell.rm('package.json')
      mock({ bump: 'minor', changelog: [], tags: ['v3.9.0', 'v5.0.0', 'v3.0.0'] })
      await exec({}, true)
      const output = shell.exec('git tag')
      output.stdout.should.include('v5.1.0')
    })
  })

  describe('configuration', () => {
    it('.versionrc : releaseCommitMessageFormat', async function () {
      fs.writeFileSync('.versionrc', JSON.stringify({
        releaseCommitMessageFormat: 'This commit represents release: {{currentTag}}'
      }), 'utf-8')
      mock({ bump: 'minor', changelog: [], tags: [] })
      await exec('', true)
      shell.exec('git log --oneline -n1').should.include('This commit represents release: 1.1.0')
    })

    it('--releaseCommitMessageFormat', async function () {
      mock({ bump: 'minor', changelog: [], tags: [] })
      await exec('--releaseCommitMessageFormat="{{currentTag}} is the version."', true)
      shell.exec('git log --oneline -n1').should.include('1.1.0 is the version.')
    })

    it('[LEGACY] supports --message (and single %s replacement)', async function () {
      mock({ bump: 'minor', changelog: [], tags: [] })
      await exec('--message="V:%s"', true)
      shell.exec('git log --oneline -n1').should.include('V:1.1.0')
    })

    it('[LEGACY] supports -m (and multiple %s replacements)', async function () {
      mock({ bump: 'minor', changelog: [], tags: [] })
      await exec('--message="V:%s is the %s."', true)
      shell.exec('git log --oneline -n1').should.include('V:1.1.0 is the 1.1.0.')
    })
  })

  describe('precommit hook', function () {
    it('should run the precommit hook when provided via .versionrc.json (#371)', async function () {
      fs.writeFileSync('.versionrc.json', JSON.stringify({
        scripts: { precommit: 'node scripts/precommit' }
      }), 'utf-8')

      writeHook('precommit')
      fs.writeFileSync('CHANGELOG.md', 'legacy header format<a name="1.0.0">\n', 'utf-8')
      const flush = mock({ bump: 'minor', changelog: [], tags: [] })
      await exec('', true)
      const { stderr } = flush()
      stderr[0].should.match(/precommit ran/)
    })

    it('should run the precommit hook when provided', async function () {
      writePackageJson('1.0.0', {
        'standard-version': {
          scripts: { precommit: 'node scripts/precommit' }
        }
      })
      writeHook('precommit')
      fs.writeFileSync('CHANGELOG.md', 'legacy header format<a name="1.0.0">\n', 'utf-8')

      const flush = mock({ bump: 'minor', changelog: [], tags: [] })
      await exec('--patch', true)
      const { stderr } = flush()
      stderr[0].should.match(/precommit ran/)
    })

    it('should run the precommit hook and exit with error when precommit fails', async function () {
      writePackageJson('1.0.0', {
        'standard-version': {
          scripts: { precommit: 'node scripts/precommit' }
        }
      })
      writeHook('precommit', true)
      fs.writeFileSync('CHANGELOG.md', 'legacy header format<a name="1.0.0">\n', 'utf-8')

      mock({ bump: 'minor', changelog: [], tags: [] })
      try {
        await exec('--patch', true)
        throw new Error('Unexpected success')
      } catch (error) {
        error.message.should.match(/precommit-failure/)
      }
    })

    it('should allow an alternate commit message to be provided by precommit script', async function () {
      writePackageJson('1.0.0', {
        'standard-version': {
          scripts: { precommit: 'node scripts/precommit' }
        }
      })
      writeHook('precommit', false, 'console.log("releasing %s delivers #222")')
      fs.writeFileSync('CHANGELOG.md', 'legacy header format<a name="1.0.0">\n', 'utf-8')

      mock({ bump: 'minor', changelog: [], tags: [] })
      await exec('--patch', true)
      shell.exec('git log --oneline -n1').should.match(/delivers #222/)
    })
  })

  describe('Run ... to publish', function () {
    it('does normally display `npm publish`', async function () {
      const flush = mock()
      await exec('', true)
      flush().stdout.join('').should.match(/npm publish/)
    })

    it('does not display `npm publish` if the package is private', async function () {
      writePackageJson('1.0.0', { private: true })
      const flush = mock()
      await exec('', true)
      flush().stdout.join('').should.not.match(/npm publish/)
    })

    it('does not display `npm publish` if there is no package.json', async function () {
      shell.rm('package.json')
      const flush = mock()
      await exec('', true)
      flush().stdout.join('').should.not.match(/npm publish/)
    })

    it('does not display `all staged files` without the --commit-all flag', async function () {
      const flush = mock()
      await exec('', true)
      flush().stdout.join('').should.not.match(/all staged files/)
    })

    it('does display `all staged files` if the --commit-all flag is passed', async function () {
      const flush = mock()
      await exec('--commit-all', true)
      flush().stdout.join('').should.match(/all staged files/)
    })

    it('advises use of --tag prerelease for publishing to npm', async function () {
      writePackageJson('1.0.0')
      fs.writeFileSync('CHANGELOG.md', 'legacy header format<a name="1.0.0">\n', 'utf-8')

      const flush = mock({ bump: 'patch', changelog: [], tags: [] })
      await exec('--prerelease', true)
      const { stdout } = flush()
      stdout.join('').should.include('--tag prerelease')
    })

    it('advises use of --tag alpha for publishing to npm when tagging alpha', async function () {
      writePackageJson('1.0.0')
      fs.writeFileSync('CHANGELOG.md', 'legacy header format<a name="1.0.0">\n', 'utf-8')

      const flush = mock({ bump: 'patch', changelog: [], tags: [] })
      await exec('--prerelease alpha', true)
      const { stdout } = flush()
      stdout.join('').should.include('--tag alpha')
    })

    it('does not advise use of --tag prerelease for private modules', async function () {
      writePackageJson('1.0.0', { private: true })
      fs.writeFileSync('CHANGELOG.md', 'legacy header format<a name="1.0.0">\n', 'utf-8')

      const flush = mock({ bump: 'minor', changelog: [], tags: [] })
      await exec('--prerelease', true)
      const { stdout } = flush()
      stdout.join('').should.not.include('--tag prerelease')
    })
  })

  // TODO: investigate why mock-git does not play well with execFile on Windows.
  if (!process.platform !== 'win32') {
    describe('with mocked git', function () {
      it('--sign signs the commit and tag', async function () {
        // mock git with file that writes args to gitcapture.log
        const done = await mockGit('require("fs").appendFileSync("gitcapture.log", JSON.stringify(process.argv.splice(2)) + "\\n")')
        mock({ bump: 'patch', changelog: 'foo\n', tags: [] })
        await exec('--sign', true)
        const { stdout } = shell.cat('gitcapture.log')
        const captured = stdout.split('\n').map((line) => line ? JSON.parse(line) : line)
        done()
        /* eslint-disable no-useless-escape */
        captured[captured.length - 4].should.deep.equal(['commit', '-S', 'CHANGELOG.md', 'package.json', '-m', 'chore(release): 1.0.1'])
        captured[captured.length - 3].should.deep.equal(['tag', '-s', 'v1.0.1', '-m', 'chore(release): 1.0.1'])
        /* eslint-enable no-useless-escape */
      })

      it('fails if git commit fails', async function () {
        // mock git by throwing on attempt to commit
        const done = await mockGit('console.error("commit yourself"); process.exit(128);', 'commit')
        mock({ bump: 'patch', changelog: 'foo\n', tags: [] })
        try {
          await exec({}, true)
          throw new Error('Unexpected success')
        } catch (error) {
          done()
          error.message.should.match(/commit yourself/)
        }
      })

      it('fails if git add fails', async function () {
        // mock git by throwing on attempt to add
        const done = await mockGit('console.error("addition is hard"); process.exit(128);', 'add')
        mock({ bump: 'patch', changelog: 'foo\n', tags: [] })
        try {
          await exec({}, true)
          throw new Error('Unexpected success')
        } catch (error) {
          done()
          error.message.should.match(/addition is hard/)
        }
      })

      it('fails if git tag fails', async function () {
        // mock git by throwing on attempt to commit
        const done = await mockGit('console.error("tag, you\'re it"); process.exit(128);', 'tag')
        mock({ bump: 'patch', changelog: 'foo\n', tags: [] })
        try {
          await exec({}, true)
          throw new Error('Unexpected success')
        } catch (error) {
          done()
          error.message.should.match(/tag, you're it/)
        }
      })

      it('doesn\'t fail fast on stderr output from git', async function () {
        writePackageJson('1.0.0')
        // mock git by throwing on attempt to commit
        const done = await mockGit('console.error("this is just a warning"); process.exit(0);', 'add')
        const flush = mock({ bump: 'patch', changelog: 'foo\n', tags: [] })
        try {
          await exec({}, true)
          throw new Error('Unexpected success')
        } catch (error) {
          done()
          const expected = /this is just a warning/
          error.message.should.not.match(expected)
          const { stderr } = flush()
          stderr[0].should.match(expected)
        }
      })
    })
  }
})

describe('GHSL-2020-111', function () {
  beforeEach(initInTempFolder)
  afterEach(finishTemp)
  afterEach(unmock)

  it('does not allow command injection via basic configuration', async function () {
    mock()
    await exec({
      noVerify: true,
      infile: 'foo.txt',
      releaseCommitMessageFormat: 'bla `touch exploit`'
    })
    const stat = shell.test('-f', './exploit')
    stat.should.equal(false)
  })
})
