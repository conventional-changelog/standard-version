const fs = require('fs')

module.exports = function (argv, filePath, content) {
  if (argv.dryRun) return
  fs.writeFileSync(filePath, content, 'utf8')
}
