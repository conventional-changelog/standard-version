#!/usr/bin/env node

/* istanbul ignore if */
if (process.version.match(/v(\d+)\./)[1] < 6) {
  console.error(
    'commit-and-tag-version: Node v6 or greater is required. `commit-and-tag-version` did not run.'
  )
} else {
  const standardVersion = require('../index')
  const cmdParser = require('../command')
  standardVersion(cmdParser.argv).catch(() => {
    process.exit(1)
  })
}
