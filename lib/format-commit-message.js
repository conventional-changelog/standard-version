const util = require('util')

module.exports = function (rawMsg, newVersion) {
  /**
   * Since `args.message` (`rawMsg`) is used as the alias to `releaseCommitMessageFormat`,
   * we have to make sure the substitution defined by the `conventional-changelog-config-spec`
   * is handled properly.
   * @see https://github.com/conventional-changelog/conventional-changelog-config-spec/blob/master/versions/1.0.0/README.md#releasecommitmessageformat-string
   */
  const message = String(rawMsg).replace('{{currentTag}}', '%s')
  const matchCount = (message.match(/%s/g) || []).length
  const args = Array(1 + matchCount)
  args[0] = message
  args.fill(newVersion, 1, args.length)
  return util.format.apply(util, args)
}
