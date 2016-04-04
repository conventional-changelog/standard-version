# Conventional Recommended Workflow

[![Build Status](https://travis-ci.org/bcoe/conventional-recommended-workflow.svg)](https://travis-ci.org/bcoe/conventional-recommended-workflow)
[![NPM version](https://img.shields.io/npm/v/conventional-recommended-workflow.svg)](https://www.npmjs.com/package/conventional-recommended-workflow)

Automatic CHANGELOG.md generation, using GitHub's new squash button and
the workflow outlined in [conventional-changelog-cli](https://github.com/stevemao/conventional-changelog-cli).

**how it works:**

1. when you land commits on your `master` branch, select the _Squash and Merge_ option.
2. add a title and body that follows the [conventional-changelog conventions](https://github.com/stevemao/conventional-changelog-angular/blob/master/convention.md).
3. when you're ready to release to npm:
  1. checkout `master`.
  2. run `conventional-recommended-workflow`.
  3. `git push --tags; git push origin master; npm publish`.

`conventional-recommended-workflow` does the following:

1. bumps the version in package.json
2. runs `conventional-changelog` and updates CHANGELOG.md.
3. commits _package.json_ and _CHANGELOG.md_.
4. tags a new release.

## Installation

`npm i conventional-recommended-workflow`

## Automating

Add this to your _package.json_

```json
{
  "scripts": {
    "release": "conventional-recommended-workflow"
  }
}
```

## License

ISC
