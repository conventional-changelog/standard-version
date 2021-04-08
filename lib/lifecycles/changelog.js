const accessSync = require('fs-access').sync
const chalk = require('chalk')
const checkpoint = require('../checkpoint')
const conventionalChangelog = require('conventional-changelog')
const fs = require('fs')
const presetLoader = require('../preset-loader')
const runLifecycleScript = require('../run-lifecycle-script')
const writeFile = require('../write-file')
const join = require('path').join
const START_OF_LAST_RELEASE_PATTERN = /(^#+ (?:<.*>)?\[?[0-9]+\.[0-9]+\.[0-9]+|<a name=)/m

async function Changelog (args, newVersion) {
  if (args.skip.changelog) return
  await runLifecycleScript(args, 'prechangelog')
  await outputChangelog(args, newVersion)
  await runLifecycleScript(args, 'postchangelog')
}

function ResolveTemplatePath (templateFilePath) {
  if (!fs.existsSync(templateFilePath)) {
    templateFilePath = join(__dirname, "\\..\\..", templateFilePath);
  }
  if (fs.existsSync(templateFilePath)) {
    return fs.readFileSync(templateFilePath, 'utf-8')
  }
}

function getTemplates(args) {
  let writerOptions = {}
  var partialTemplates = [ 
    { option: 'commitPartial', template: args.templates.commit },
    { option: 'headerPartial', template: args.templates.header },
    { option: 'footerPartial', template: args.templates.footer }
  ];
  for (i = 0; i < partialTemplates.length; ++i) {
    let template = ResolveTemplatePath(partialTemplates[i].template)
    if (template != undefined) {
      template = template
        .replace(/{{compareUrlFormat}}/g, args.compareUrlFormat)
        .replace(/{{commitUrlFormat}}/g, args.commitUrlFormat)
        .replace(/{{issueUrlFormat}}/g, args.issueUrlFormat)
      writerOptions[partialTemplates[i].option] = template;
    }
  };

  return writerOptions
}

Changelog.START_OF_LAST_RELEASE_PATTERN = START_OF_LAST_RELEASE_PATTERN

module.exports = Changelog

function outputChangelog (args, newVersion) {
  return new Promise((resolve, reject) => {
    createIfMissing(args)
    const header = args.header

    let oldContent = args.dryRun ? '' : fs.readFileSync(args.infile, 'utf-8')
    const oldContentStart = oldContent.search(START_OF_LAST_RELEASE_PATTERN)
    // find the position of the last release and remove header:
    if (oldContentStart !== -1) {
      oldContent = oldContent.substring(oldContentStart)
    }
    let content = ''
    const context = { version: newVersion }
    const writerOptions = getTemplates(args)
    const changelogStream = conventionalChangelog({
      debug: args.verbose && console.info.bind(console, 'conventional-changelog'),
      preset: presetLoader(args),
      tagPrefix: args.tagPrefix
    }, context, { merges: null, path: args.path }, {}, writerOptions)
      .on('error', function (err) {
        return reject(err)
      })

    changelogStream.on('data', function (buffer) {
      content += buffer.toString()
    })

    changelogStream.on('end', function () {
      checkpoint(args, 'outputting changes to %s', [args.infile])
      if (args.dryRun) console.info(`\n---\n${chalk.gray(content.trim())}\n---\n`)
      else writeFile(args, args.infile, header + '\n' + (content + oldContent).replace(/\n+$/, '\n'))
      return resolve()
    })
  })
}

function createIfMissing (args) {
  try {
    accessSync(args.infile, fs.F_OK)
  } catch (err) {
    if (err.code === 'ENOENT') {
      checkpoint(args, 'created %s', [args.infile])
      args.outputUnreleased = true
      writeFile(args, args.infile, '\n')
    }
  }
}
