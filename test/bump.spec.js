/* global describe it beforeEach afterEach */

'use strict'

const { bumpVersion } = require('../lib/lifecycles/bump')
const shell = require('shelljs')
const chai = require('chai')
const { expect } = chai

describe('bumpVersion', () => {
  const args = {
    types: [
      { type: 'feat', section: 'Features' },
      { type: 'test', section: 'Tests', hidden: true }
    ]
  }

  beforeEach(() => {
    shell.rm('-rf', 'tmp')
    shell.config.silent = true
    shell.mkdir('tmp')
    shell.cd('tmp')
    shell.exec('git init')
    shell.exec('git config commit.gpgSign false')
    shell.exec('git config core.autocrlf false')
  })

  afterEach(() => {
    shell.cd('../')
    shell.rm('-rf', 'tmp')
  })

  describe('when a tag is avaialble', () => {
    let result

    beforeEach(async () => {
      shell.exec('git commit --allow-empty -m "first-commit"')
      shell.exec('git tag 1.2.3')
    })

    describe('and release commits are present', () => {
      beforeEach(async () => {
        shell.exec('git commit --allow-empty -m "feat: second-commit"')

        result = await bumpVersion(null, '1.2.3', args)
      })

      it('should return a release recommendation', async () => {
        expect(result).to.include({ level: 1, releaseType: 'minor' })
      })
    })

    describe('and no release commits are present', () => {
      beforeEach(async () => {
        shell.exec('git commit --allow-empty -m "test: second-commit"')

        result = await bumpVersion(null, '1.2.3', args)
      })

      it('should return no release', async () => {
        expect(result).to.include({
          level: null,
          reason: 'No commits found for types: [feat], skipping release stage.'
        })
      })
    })
  })

  describe('when no tag is found', () => {
    let result

    beforeEach(async () => {
      shell.exec('git commit --allow-empty -m "first-commit"')
      shell.exec('git commit --allow-empty -m "second-commit"')

      result = await bumpVersion(null, '1.2.3', args)
    })

    it('should return no release', async () => {
      expect(result).to.include({
        level: null,
        reason: 'No commits found for types: [feat], skipping release stage.'
      })
    })
  })
})
