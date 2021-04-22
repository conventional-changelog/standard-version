const gitLogParser = require('git-log-parser')
const getStream = require('get-stream')

// Add gitTags field to our commit object
gitLogParser.fields.gitTags = 'D' // https://github.com/bendrucker/git-log-parser#logfields---object

const GIT_TAG_PLACEHOLDER = 'tag:'

// Returns an array of commits since the last tag
module.exports = async () => {
  const commits = await getStream.array(gitLogParser.parse())

  const latestTag = commits.findIndex(c => !!c.gitTags && c.gitTags.includes(GIT_TAG_PLACEHOLDER))
  return latestTag === -1 ? commits : commits.slice(0, latestTag)
}
