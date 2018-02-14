const core = require('@commitlint/core');
var gitSemverTags = require('git-semver-tags');
const RULES = require('conventional-changelog-meso/commitlint.config');
const chalk = require('chalk');

module.exports = function () {
    const check = commit => {
        return core.lint(commit, RULES)
            .then(report => {
                return {
                    commit,
                    report
                }
            })
    }
    return new Promise((resolve, reject) => {
        gitSemverTags(function (err, tags) {
            if (err) {
                reject(err);
            }
            resolve(tags[0]);
        });
    }).then(function (tag) {
        return core.read({ to: 'HEAD', from: tag })
    }).then(commits => {
        return Promise.all(commits.map(check))
    }).then(tasks => {
        var hasErrors=false;
        for(var task of tasks){
            console.log(chalk.blue(task.commit));
            for(var i in task.report.errors){
                console.log(chalk.red('Error '+(+i+1)+'.',task.report.errors[i].message));
            }
            for(var i in task.report.warnings){
                console.log(chalk.yellow('Warning '+(+i+1)+'.',task.report.warnings[i].message));
            }
            console.log(chalk.black('------------------------'));
            if(task.report.errors.length){
                hasErrors=true;
            }
        }
        if(hasErrors){
            return Promise.reject({
                message:"ERRORS: Invalid commits"
            });   
        }
    });
}
