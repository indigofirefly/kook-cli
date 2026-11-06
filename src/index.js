'use strict';

const { Command } = require('commander');
const semver = require('semver');
const pkg = require('../package.json');
const log = require('./utils/log');
const create = require('./commands/create');
const list = require('./commands/list');
const update = require('./commands/update');

const REQUIRED_NODE = '16.14.0';

if (semver.valid(process.versions.node) && semver.lt(process.versions.node, REQUIRED_NODE)) {
  log.warn(`当前 Node 版本 ${process.versions.node} 过低，建议升级到 ${REQUIRED_NODE} 以上`);
}

const program = new Command();

program
  .name('kook-cli')
  .description('A Vue CLI style scaffolding tool')
  .version(pkg.version, '-V, --version', '查看当前版本号')
  .helpOption('-h, --help', '查看命令帮助')
  .configureHelp({ sortSubcommands: false })
  .addHelpText(
    'after',
    [
      '',
      '示例:',
      '  $ kook-cli create my-app',
      '  $ kook-cli create my-app -t vue3H5',
      '  $ kook-cli create my-app -f',
      '  $ kook-cli list',
      '  $ kook-cli update',
    ].join('\n')
  );

program
  .command('create [name]')
  .description('创建一个新项目')
  .option('-t, --template <key>', '直接指定模板，跳过交互选择')
  .option('-f, --force', '目标目录非空时直接覆盖，不再二次确认')
  .option('--no-check', '跳过版本更新检查')
  .action((name, options) => {
    return run(() => create(name, options));
  });

program
  .command('list')
  .description('查看可用的模板列表')
  .action(() => run(() => list()));

program
  .command('update')
  .description('升级 kook-cli 到最新版本')
  .action(() => run(() => update()));

program.showHelpAfterError('(使用 kook-cli -h 查看帮助)');

async function run(task) {
  try {
    await task();
  } catch (err) {
    if (isUserCancel(err)) {
      log.info('已取消');
      return;
    }
    log.error(err && err.message ? err.message : String(err));
    if (process.env.KOOK_DEBUG && err && err.stack) {
      console.error(err.stack);
    }
    process.exitCode = 1;
  }
}

function isUserCancel(err) {
  if (!err) return false;
  if (err.name === 'ExitPromptError') return true;
  return /force closed|SIGINT|User force closed/i.test(err.message || '');
}

process.on('unhandledRejection', (err) => {
  log.error(err && err.message ? err.message : String(err));
  process.exitCode = 1;
});

if (process.argv.length <= 2) {
  program.help();
} else {
  program.parseAsync(process.argv).catch((err) => run(() => Promise.reject(err)));
}
