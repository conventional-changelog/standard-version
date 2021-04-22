/* global describe it beforeEach afterEach */

'use strict'

const getLatestCommits = require('../lib/latest-commits')
const shell = require('shelljs')
const { expect } = require('chai')

describe('getLatestCommits', () => {
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
      shell.exec('git commit --allow-empty -m "second-commit"')

      result = await getLatestCommits()
    })

    it('should only return commits since last tag', async () => {
      expect(result).to.have.lengthOf(1)
      expect(result[0].subject).to.equal('second-commit')
    })
  })

  describe('when no tag is found', () => {
    let result

    beforeEach(async () => {
      shell.exec('git commit --allow-empty -m "first-commit"')
      shell.exec('git commit --allow-empty -m "second-commit"')

      result = await getLatestCommits()
    })

    it('should return commit history', () => {
      expect(result).to.have.lengthOf(2)
      expect(result[0].subject).to.equal('second-commit')
      expect(result[1].subject).to.equal('first-commit')
    })
  })
})
