const gitLogParser = require('git-log-parser')
const getStream = require('get-stream')

/**
 * Returns the list of commits since that last commit that had a tag or all of them
 */
module.exports = async () => {
  Object.assign(gitLogParser.fields, {
    hash: 'H',
    message: 'B',
    gitTags: 'd',
    committerDate: { key: 'ci', type: Date }
  })
  const commits = (await getStream.array(
    gitLogParser.parse(
      { _: 'HEAD' }
    )
  )).map(commit => {
    commit.message = commit.message.trim()
    commit.gitTags = commit.gitTags.trim()
    return commit
  });

  const endCommitIndex = commits.findIndex(c => c.gitTags && c.gitTags.length && c.gitTags.includes('tag:'))
  const commitsSinceLastTag = endCommitIndex === -1 ? commits : commits.slice(0, endCommitIndex)

  console.log(`Found ${commitsSinceLastTag.length} commits since last release`)
  return commitsSinceLastTag
}
