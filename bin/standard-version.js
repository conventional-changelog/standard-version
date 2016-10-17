#!/usr/bin/env node
var standardVersion = require('../index')
var cmdParser = require('../cli')

standardVersion(cmdParser.argv, function (err) {
  if (err) {
    process.exit(1)
  }
})
