#!/usr/bin/env node
var standardVersion = require('../index')
var cmdParser = require('../command')

standardVersion(cmdParser.argv, function (err) {
  if (err) {
    process.exit(1)
  }
})
