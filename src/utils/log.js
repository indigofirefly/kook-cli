'use strict';

const chalk = require('chalk');

const PREFIX = chalk.gray('[kook-cli]');

function info(message) {
  console.log(`${PREFIX} ${message}`);
}

function success(message) {
  console.log(`${PREFIX} ${chalk.green(message)}`);
}

function warn(message) {
  console.log(`${PREFIX} ${chalk.yellow(message)}`);
}

function error(message) {
  console.error(`${PREFIX} ${chalk.red(message)}`);
}

function tip(message) {
  console.log(`${PREFIX} ${chalk.cyan(message)}`);
}

function blank() {
  console.log('');
}

function raw(message) {
  console.log(message);
}

module.exports = { info, success, warn, error, tip, blank, raw };
