const exec = require('child_process').exec
const printError = require('./print-error')

module.exports = function (argv, cmd) {
  return new Promise((resolve, reject) => {
    // Exec given cmd and handle possible errors
    exec(cmd, function (err, stdout, stderr) {
      // If exec returns content in stderr, but no error, print it as a warning
      // If exec returns an error, print it and exit with return code 1
      if (err) {
        printError(argv, stderr || err.message)
        return reject(err)
      } else if (stderr) {
        printError(argv, stderr, {level: 'warn', color: 'yellow'})
      }
      return resolve()
    })
  })
}
