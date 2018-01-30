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
        var failedTasks="";
        for(var task of tasks){
            if(task.report.valid==false){
                for(var i in task.report.errors){
                    console.log(chalk.red((+i+1)+'.',task.report.errors[i].message));
                }
                console.log(chalk.blue(task.commit));
                console.log(chalk.black('------------------------'));
                
            } 
        }
        
        if(failedTasks.length>0){
            return Promise.reject({
                message:"ERRORS: Invalid commits"
            })   
        }
    });
}
