/* global describe it beforeEach afterEach */

'use strict'

const shell = require('shelljs')
const fs = require('fs')
const { Readable } = require('stream')
const mockery = require('mockery')
const stdMocks = require('std-mocks')

require('chai').should()

function exec () {
  const cli = require('../command')
  const opt = cli.parse('standard-version')
  opt.skip = { commit: true, tag: true }
  return require('../index')(opt)
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

  mockery.registerMock('conventional-recommended-bump', function (opt, cb) {
    if (typeof bump === 'function') bump(opt, cb)
    else if (bump instanceof Error) cb(bump)
    else cb(null, bump ? { releaseType: bump } : {})
  })

  if (!Array.isArray(changelog)) changelog = [changelog]
  mockery.registerMock(
    'conventional-changelog',
    (opt) =>
      new Readable({
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
      })
  )

  mockery.registerMock('git-semver-tags', function (cb) {
    if (tags instanceof Error) cb(tags)
    else cb(null, tags | [])
  })

  stdMocks.use()
  return () => stdMocks.flush()
}

describe('config files', () => {
  beforeEach(function () {
    shell.rm('-rf', 'tmp')
    shell.config.silent = true
    shell.mkdir('tmp')
    shell.cd('tmp')
    fs.writeFileSync(
      'package.json',
      JSON.stringify({ version: '1.0.0' }),
      'utf-8'
    )
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

  it('reads config from package.json', async function () {
    const issueUrlFormat = 'https://standard-version.company.net/browse/{{id}}'
    mock({
      bump: 'minor',
      changelog: ({ preset }) => preset.issueUrlFormat
    })
    const pkg = {
      version: '1.0.0',
      repository: { url: 'git+https://company@scm.org/office/app.git' },
      'standard-version': { issueUrlFormat }
    }
    fs.writeFileSync('package.json', JSON.stringify(pkg), 'utf-8')

    await exec()
    const content = fs.readFileSync('CHANGELOG.md', 'utf-8')
    content.should.include(issueUrlFormat)
  })

  it('reads config from .versionrc', async function () {
    const issueUrlFormat = 'http://www.foo.com/{{id}}'
    const changelog = ({ preset }) => preset.issueUrlFormat
    mock({ bump: 'minor', changelog })
    fs.writeFileSync('.versionrc', JSON.stringify({ issueUrlFormat }), 'utf-8')

    await exec()
    const content = fs.readFileSync('CHANGELOG.md', 'utf-8')
    content.should.include(issueUrlFormat)
  })

  it('reads config from .versionrc.json', async function () {
    const issueUrlFormat = 'http://www.foo.com/{{id}}'
    const changelog = ({ preset }) => preset.issueUrlFormat
    mock({ bump: 'minor', changelog })
    fs.writeFileSync(
      '.versionrc.json',
      JSON.stringify({ issueUrlFormat }),
      'utf-8'
    )

    await exec()
    const content = fs.readFileSync('CHANGELOG.md', 'utf-8')
    content.should.include(issueUrlFormat)
  })

  it('evaluates a config-function from .versionrc.js', async function () {
    const issueUrlFormat = 'http://www.foo.com/{{id}}'
    const src = `module.exports = function() { return ${JSON.stringify({
      issueUrlFormat
    })} }`
    const changelog = ({ preset }) => preset.issueUrlFormat
    mock({ bump: 'minor', changelog })
    fs.writeFileSync('.versionrc.js', src, 'utf-8')

    await exec()
    const content = fs.readFileSync('CHANGELOG.md', 'utf-8')
    content.should.include(issueUrlFormat)
  })

  it('evaluates a config-object from .versionrc.js', async function () {
    const issueUrlFormat = 'http://www.foo.com/{{id}}'
    const src = `module.exports = ${JSON.stringify({ issueUrlFormat })}`
    const changelog = ({ preset }) => preset.issueUrlFormat
    mock({ bump: 'minor', changelog })
    fs.writeFileSync('.versionrc.js', src, 'utf-8')

    await exec()
    const content = fs.readFileSync('CHANGELOG.md', 'utf-8')
    content.should.include(issueUrlFormat)
  })

  it('throws an error when a non-object is returned from .versionrc.js', async function () {
    mock({ bump: 'minor' })
    fs.writeFileSync('.versionrc.js', 'module.exports = 3', 'utf-8')
    try {
      await exec()
      /* istanbul ignore next */
      throw new Error('Unexpected success')
    } catch (error) {
      error.message.should.match(/Invalid configuration/)
    }
  })
})
