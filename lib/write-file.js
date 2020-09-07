const fs = require('fs')
const path = require('path')

module.exports = function (args, filePath, content) {
  if (args.dryRun) return
  fs.writeFileSync(path.resolve(args.path || process.cwd(), filePath), content, 'utf8')
}
