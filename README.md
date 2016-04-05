# Standard Version

[![Build Status](https://travis-ci.org/conventional-changelog/standard-version.svg)](https://travis-ci.org/conventional-changelog/standard-version)
[![NPM version](https://img.shields.io/npm/v/standard-version.svg)](https://www.npmjs.com/package/standard-version)

> stop using `npm version`, use `standard-version` it does so much more:

Automatic release and CHANGELOG management, using GitHub's new squash button and
the workflow outlined in [conventional-changelog-cli](https://github.com/stevemao/conventional-changelog-cli).

**how it works:**

1. when you land commits on your `master` branch, select the _Squash and Merge_ option.
2. add a title and body that follows the [conventional-changelog conventions](https://github.com/conventional-changelog/conventional-changelog-angular/blob/master/convention.md).
3. when you're ready to release to npm:
  1. `git checkout master; git pull origin master`.
  2. run `standard-version`.
  3. `git push --follow-tags origin master; npm publish`.

`standard-version` does the following:

1. bumps the version in package.json (based on your commit history).
2. runs `conventional-changelog` and updates CHANGELOG.md.
3. commits _package.json_ and _CHANGELOG.md_.
4. tags a new release.

## Initial CHANGELOG.md Generation

When you're generating your changelog for the first time, simply do:

`standard-version --first-release`

## Installation

`npm i standard-version`

## Automating

Add this to your _package.json_

```json
{
  "scripts": {
    "release": "standard-version"
  }
}
```

## License

ISC
