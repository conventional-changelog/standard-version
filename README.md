# Standard Version

[![Build Status](https://travis-ci.org/conventional-changelog/standard-version.svg)](https://travis-ci.org/conventional-changelog/standard-version)
[![NPM version](https://img.shields.io/npm/v/standard-version.svg)](https://www.npmjs.com/package/standard-version)

> stop using `npm version`, use `standard-version` it does so much more:

Automatic versioning and CHANGELOG management, using GitHub's new squash button and
the [recommended workflow](https://github.com/conventional-changelog/conventional-changelog-cli#recommended-workflow) for `conventional-changelog`.

**how it works:**

1. when you land commits on your `master` branch, select the _Squash and Merge_ option.
2. add a title and body that follows the [standard-changelog conventions](https://github.com/conventional-changelog/conventional-changelog-angular/blob/master/convention.md).
3. when you're ready to release to npm:
  1. `git checkout master; git pull origin master`.
  2. run `standard-version`.
  3. `git push --follow-tags origin master; npm publish`.

`standard-version` does the following:

1. bumps the version in package.json (based on your commit history).
2. runs `conventional-changelog` and updates CHANGELOG.md.
3. commits _package.json_ and _CHANGELOG.md_.
4. tags a new release.

## Installation

### As `npm run` script

Install and add to `devDependencies`:

```
npm i --save-dev standard-version
```

Add an [`npm run` script](https://docs.npmjs.com/cli/run-script) to your _package.json_:

```json
{
  "scripts": {
    "release": "standard-version"
  }
}
```

Now you can use `npm run release` in place of `npm version`.

### As global bin

Install globally (add to your `PATH`):

```
npm i -g standard-version
```

Now you can use `standard-version` in place of `npm version`.

## Usage

### Initial CHANGELOG.md Generation

To generate your changelog for the first time, simply do:

```sh
# npm run script
npm run release -- --first-release
# or global bin
standard-version --first-release
```

### Manual Pre-Publish

If you typically use `npm version` as a manual pre-publish step, do this instead:

```sh
# npm run script
npm run release
# or global bin
standard-version
```

As long as your git commit messages are conventional and accurate, you no longer need to specify the semver type.

### CLI Help

```sh
# npm run script
npm run release -- --help
# or global bin
standard-version --help
```

## License

ISC
