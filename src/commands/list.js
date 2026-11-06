'use strict';

const chalk = require('chalk');
const { loadConfig } = require('../core/config');
const { padEndDisplay, displayWidth } = require('../utils/text');
const log = require('../utils/log');

function list() {
  const config = loadConfig();
  const entries = Object.values(config.templates);

  if (entries.length === 0) {
    log.warn('没有可用的模板，请检查 config.json');
    return;
  }

  const keyWidth = Math.max(...entries.map((tpl) => displayWidth(tpl.key))) + 2;

  log.blank();
  log.info('可用模板：');
  log.blank();
  for (const tpl of entries) {
    const source = tpl.source === 'user' ? chalk.green('用户配置') : chalk.gray('内置');
    const line = `  ${chalk.cyan(padEndDisplay(tpl.key, keyWidth))}${padEndDisplay(
      tpl.description || '-',
      36
    )}${source}`;
    console.log(line);
  }
  log.blank();
  log.info(`内置配置：${chalk.gray(config.sources.builtin)}`);
  log.info(
    config.sources.user
      ? `用户配置：${chalk.gray(config.sources.user)}`
      : `用户配置：${chalk.gray('未创建（可新建 ~/.kook-cli/config.json 追加模板）')}`
  );
  log.blank();
  log.tip('使用示例：kook-cli create my-app -t vue3admin');
  log.blank();
}

module.exports = list;
