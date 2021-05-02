/* global describe it beforeEach afterEach */

'use strict'

const shell = require('shelljs')
const fs = require('fs')
const { Readable } = require('stream')
const mockery = require('mockery')
const stdMocks = require('std-mocks')

require('chai').should()

function exec (opt = '') {
  if (typeof opt === 'string') {
    const cli = require('../command')
    opt = cli.parse(`standard-version ${opt}`)
  }
  return require('../index')(opt)
}

function writePackageJson (version, option) {
  const pkg = Object.assign({}, option, { version })
  fs.writeFileSync('package.json', JSON.stringify(pkg), 'utf-8')
}

function writeHook (hookName, causeError, script) {
  shell.mkdir('-p', 'scripts')
  let content = script || 'console.error("' + hookName + ' ran")'
  content += causeError ? '\nthrow new Error("' + hookName + '-failure")' : ''
  fs.writeFileSync('scripts/' + hookName + '.js', content, 'utf-8')
  fs.chmodSync('scripts/' + hookName + '.js', '755')
}

function getPackageVersion () {
  return JSON.parse(fs.readFileSync('package.json', 'utf-8')).version
}

/**
 * Mock external conventional-changelog modules
 *
 * bump: 'major' | 'minor' | 'patch' | Error | (opt, cb) => { cb(err) | cb(null, { releaseType }) }
 * changelog?: string | Error | Array<string | Error | (opt) => string | null>
 * tags?: string[] | Error
 */
function mock ({ bump, changelog, tags }) {
  if (bump === undefined) throw new Error('bump must be defined for mock()')
  mockery.enable({ warnOnUnregistered: false, useCleanCache: true })

  mockery.registerMock('conventional-recommended-bump', function (opt, cb) {
    if (typeof bump === 'function') bump(opt, cb)
    else if (bump instanceof Error) cb(bump)
    else cb(null, { releaseType: bump })
  })

  if (!Array.isArray(changelog)) changelog = [changelog]
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

  mockery.registerMock('git-semver-tags', function (_, cb) {
    if (tags instanceof Error) cb(tags)
    else cb(null, tags || [])
  })

  stdMocks.use()
  return () => stdMocks.flush()
}

describe('git', function () {
  beforeEach(function () {
    shell.rm('-rf', 'tmp')
    shell.config.silent = true
    shell.mkdir('tmp')
    shell.cd('tmp')
    shell.exec('git init')
    shell.exec('git config commit.gpgSign false')
    shell.exec('git config core.autocrlf false')
    shell.exec('git commit --allow-empty -m"root-commit"')
    writePackageJson('1.0.0')
  })

  afterEach(function () {
    shell.cd('../')
    shell.rm('-rf', 'tmp')

    mockery.deregisterAll()
    mockery.disable()
    stdMocks.restore()

    // push out prints from the Mocha reporter
    const { stdout } = stdMocks.flush()
    for (const str of stdout) {
      if (str.startsWith(' ')) process.stdout.write(str)
    }
  })

  describe('tagPrefix', () => {
    // TODO: Use unmocked git-semver-tags and stage a git environment
    it('will add prefix onto tag based on version from package', async function () {
      writePackageJson('1.2.0')
      mock({ bump: 'minor', tags: ['p-v1.2.0'] })
      await exec('--tag-prefix p-v')
      shell.exec('git tag').stdout.should.match(/p-v1\.3\.0/)
    })

    it('will add prefix onto tag via when gitTagFallback is true and no package [cli]', async function () {
      shell.rm('package.json')
      mock({ bump: 'minor', tags: ['android/production/v1.2.0', 'android/production/v1.0.0'] })
      await exec('--tag-prefix android/production/v')
      shell.exec('git tag').stdout.should.match(/android\/production\/v1\.3\.0/)
    })

    it('will add prefix onto tag via when gitTagFallback is true and no package [options]', async function () {
      mock({ bump: 'minor', tags: ['android/production/v1.2.0', 'android/production/v1.0.0'] })
      await exec({ tagPrefix: 'android/production/v', packageFiles: [] })
      shell.exec('git tag').stdout.should.match(/android\/production\/v1\.3\.0/)
    })
  })

  it('formats the commit and tag messages appropriately', async function () {
    mock({ bump: 'minor', tags: ['v1.0.0'] })
    await exec({})
    // check last commit message
    shell.exec('git log --oneline -n1').stdout.should.match(/chore\(release\): 1\.1\.0/)
    // check annotated tag message
    shell.exec('git tag -l -n1 v1.1.0').stdout.should.match(/chore\(release\): 1\.1\.0/)
  })

  it('formats the tag if --first-release is true', async function () {
    writePackageJson('1.0.1')
    mock({ bump: 'minor' })
    await exec('--first-release')
    shell.exec('git tag').stdout.should.match(/1\.0\.1/)
  })

  it('commits all staged files', async function () {
    fs.writeFileSync('CHANGELOG.md', 'legacy header format<a name="1.0.0">\n', 'utf-8')
    fs.writeFileSync('STUFF.md', 'stuff\n', 'utf-8')
    shell.exec('git add STUFF.md')

    mock({ bump: 'patch', changelog: 'release 1.0.1\n', tags: ['v1.0.0'] })
    await exec('--commit-all')
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

    mock({ bump: 'minor' })
    await exec('--no-verify')
    await exec('-n')
  })

  it('allows the commit phase to be skipped', async function () {
    const changelogContent = 'legacy header format<a name="1.0.0">\n'
    writePackageJson('1.0.0')
    fs.writeFileSync('CHANGELOG.md', changelogContent, 'utf-8')

    mock({ bump: 'minor', changelog: 'new feature\n' })
    await exec('--skip.commit true')
    getPackageVersion().should.equal('1.1.0')
    const content = fs.readFileSync('CHANGELOG.md', 'utf-8')
    content.should.match(/new feature/)
    shell.exec('git log --oneline -n1').stdout.should.match(/root-commit/)
  })

  it('dry-run skips all non-idempotent steps', async function () {
    shell.exec('git tag -a v1.0.0 -m "my awesome first release"')
    const flush = mock({ bump: 'minor', changelog: '### Features\n', tags: ['v1.0.0'] })
    await exec('--dry-run')
    const { stdout } = flush()
    stdout.join('').should.match(/### Features/)
    shell.exec('git log --oneline -n1').stdout.should.match(/root-commit/)
    shell.exec('git tag').stdout.should.match(/1\.0\.0/)
    getPackageVersion().should.equal('1.0.0')
  })

  it('works fine without specifying a tag id when prereleasing', async function () {
    writePackageJson('1.0.0')
    fs.writeFileSync('CHANGELOG.md', 'legacy header format<a name="1.0.0">\n', 'utf-8')
    mock({ bump: 'minor' })
    await exec('--prerelease')
    getPackageVersion().should.equal('1.1.0-0')
  })

  describe('gitTagFallback', () => {
    it('defaults to 1.0.0 if no tags in git history', async () => {
      shell.rm('package.json')
      mock({ bump: 'minor' })
      await exec({})
      const output = shell.exec('git tag')
      output.stdout.should.include('v1.1.0')
    })

    it('bases version on greatest version tag, if tags are found', async () => {
      shell.rm('package.json')
      mock({ bump: 'minor', tags: ['v3.9.0', 'v5.0.0', 'v3.0.0'] })
      await exec({})
      const output = shell.exec('git tag')
      output.stdout.should.include('v5.1.0')
    })
  })

  describe('configuration', () => {
    it('.versionrc : releaseCommitMessageFormat', async function () {
      fs.writeFileSync('.versionrc', JSON.stringify({
        releaseCommitMessageFormat: 'This commit represents release: {{currentTag}}'
      }), 'utf-8')
      mock({ bump: 'minor' })
      await exec('')
      shell.exec('git log --oneline -n1').should.include('This commit represents release: 1.1.0')
    })

    it('--releaseCommitMessageFormat', async function () {
      mock({ bump: 'minor' })
      await exec('--releaseCommitMessageFormat="{{currentTag}} is the version."')
      shell.exec('git log --oneline -n1').should.include('1.1.0 is the version.')
    })

    it('[LEGACY] supports --message (and single %s replacement)', async function () {
      mock({ bump: 'minor' })
      await exec('--message="V:%s"')
      shell.exec('git log --oneline -n1').should.include('V:1.1.0')
    })

    it('[LEGACY] supports -m (and multiple %s replacements)', async function () {
      mock({ bump: 'minor' })
      await exec('--message="V:%s is the %s."')
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
      const flush = mock({ bump: 'minor' })
      await exec('')
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

      const flush = mock({ bump: 'minor' })
      await exec('--patch')
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

      mock({ bump: 'minor' })
      try {
        await exec('--patch')
        /* istanbul ignore next */
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

      mock({ bump: 'minor' })
      await exec('--patch')
      shell.exec('git log --oneline -n1').should.match(/delivers #222/)
    })
  })

  describe('Run ... to publish', function () {
    it('does normally display `npm publish`', async function () {
      const flush = mock({ bump: 'patch' })
      await exec('')
      flush().stdout.join('').should.match(/npm publish/)
    })

    it('does not display `npm publish` if the package is private', async function () {
      writePackageJson('1.0.0', { private: true })
      const flush = mock({ bump: 'patch' })
      await exec('')
      flush().stdout.join('').should.not.match(/npm publish/)
    })

    it('does not display `npm publish` if there is no package.json', async function () {
      shell.rm('package.json')
      const flush = mock({ bump: 'patch' })
      await exec('')
      flush().stdout.join('').should.not.match(/npm publish/)
    })

    it('does not display `all staged files` without the --commit-all flag', async function () {
      const flush = mock({ bump: 'patch' })
      await exec('')
      flush().stdout.join('').should.not.match(/all staged files/)
    })

    it('does display `all staged files` if the --commit-all flag is passed', async function () {
      const flush = mock({ bump: 'patch' })
      await exec('--commit-all')
      flush().stdout.join('').should.match(/all staged files/)
    })

    it('advises use of --tag prerelease for publishing to npm', async function () {
      writePackageJson('1.0.0')
      fs.writeFileSync('CHANGELOG.md', 'legacy header format<a name="1.0.0">\n', 'utf-8')

      const flush = mock({ bump: 'patch' })
      await exec('--prerelease')
      const { stdout } = flush()
      stdout.join('').should.include('--tag prerelease')
    })

    it('advises use of --tag alpha for publishing to npm when tagging alpha', async function () {
      writePackageJson('1.0.0')
      fs.writeFileSync('CHANGELOG.md', 'legacy header format<a name="1.0.0">\n', 'utf-8')

      const flush = mock({ bump: 'patch' })
      await exec('--prerelease alpha')
      const { stdout } = flush()
      stdout.join('').should.include('--tag alpha')
    })

    it('does not advise use of --tag prerelease for private modules', async function () {
      writePackageJson('1.0.0', { private: true })
      fs.writeFileSync('CHANGELOG.md', 'legacy header format<a name="1.0.0">\n', 'utf-8')

      const flush = mock({ bump: 'minor' })
      await exec('--prerelease')
      const { stdout } = flush()
      stdout.join('').should.not.include('--tag prerelease')
    })
  })
})
