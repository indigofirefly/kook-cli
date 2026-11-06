'use strict';

const path = require('path');
const fs = require('fs-extra');
const inquirer = require('inquirer');
const ora = require('ora');
const chalk = require('chalk');
const pkg = require('../../package.json');
const { loadConfig } = require('../core/config');
const {
  normalizeName,
  validateName,
  resolveTargetDir,
  inspectTarget,
  clearDir,
} = require('../core/target');
const { downloadTemplate, resolveBranch, hasGit } = require('../core/download');
const { checkUpdate, getGlobalInstalledVersion, OFFICIAL_REGISTRY } = require('../core/version');
const { tempDir, formatDuration } = require('../utils/fs');
const { maskUrl } = require('../utils/text');
const log = require('../utils/log');

async function create(nameArg, options = {}) {
  const startedAt = Date.now();
  const config = loadConfig();
  const templateKeys = Object.keys(config.templates);

  if (templateKeys.length === 0) {
    throw new Error('没有可用的模板，请检查 config.json');
  }

  // 启动 create 时立刻查一次 npm 官方源，与本地全局安装的版本比较；
  // 需要在选择模板之前给出提示，所以这里同步等待结果。
  const updateInfo =
    config.checkUpdate && options.check !== false
      ? await (async () => {
          const installed = await getGlobalInstalledVersion();
          return checkUpdate(installed || pkg.version, { registry: OFFICIAL_REGISTRY });
        })()
      : null;

  if (updateInfo && updateInfo.hasUpdate) {
    printUpdateNotice(updateInfo);
  }

  const templateKey = await pickTemplate(config.templates, options.template);
  const template = config.templates[templateKey];

  // 需求 8：名称为空时兜底为 kook-${模板名}
  const { name, fallback } = normalizeName(nameArg, templateKey);
  validateName(name);
  if (fallback) {
    log.warn(`未指定项目名，已使用默认名称 ${chalk.cyan(name)}`);
  }

  const targetDir = resolveTargetDir(name);

  // 需求 9：覆盖目标目录（这里只确认，不删除，下载成功后才清空）
  const inspected = await inspectTarget(targetDir, {
    force: Boolean(options.force),
    confirm: askConfirm,
  });
  if (inspected.canceled) {
    log.info('已取消');
    return;
  }

  if (!hasGit()) {
    throw new Error('未检测到 git，请先安装 git 后重试（https://git-scm.com/downloads）');
  }

  const branch = resolveBranch(template);
  log.info(
    `开始下载 ${chalk.cyan(template.name)} ${chalk.gray(maskUrl(template.url))}${
      branch ? chalk.gray(` (${branch})`) : ''
    }`
  );

  const tmpDir = tempDir();
  const onSigint = () => {
    // 恢复被进度条隐藏的终端光标
    process.stdout.write('\x1b[?25h');
    fs.removeSync(tmpDir);
    log.info('已取消');
    process.exit(130);
  };
  process.once('SIGINT', onSigint);

  try {
    // 需求 5：下载进度
    await downloadTemplate({ ...template, branch }, { dest: tmpDir });

    const spinner = ora({ text: '清理模板文件', spinner: 'dots' }).start();
    // 去掉模板仓库的 git 历史，避免新项目带着原仓库的远端
    await fs.remove(path.join(tmpDir, '.git'));

    // 下载成功了才动目标目录，避免下载失败时原文件已被删除
    if (inspected.needsClear) {
      spinner.text = '覆盖目标目录';
      await clearDir(targetDir);
    }

    await fs.copy(tmpDir, targetDir, { overwrite: true, errorOnExist: false });
    await renamePackage(targetDir, name);
    spinner.succeed(chalk.gray('模板文件已就绪'));

    if (inspected.needsClear) {
      log.info(
        `已覆盖目录 ${chalk.cyan(path.basename(targetDir))} 中的 ${inspected.count} 项原有内容`
      );
    }
  } finally {
    process.removeListener('SIGINT', onSigint);
    await fs.remove(tmpDir).catch(() => {});
  }

  printSuccess({ name, templateKey, targetDir, startedAt });
}

async function pickTemplate(templates, presetKey) {
  const keys = Object.keys(templates);

  if (presetKey) {
    if (!templates[presetKey]) {
      throw new Error(`未找到模板「${presetKey}」，可用模板：${keys.join(', ')}`);
    }
    return presetKey;
  }

  const answer = await inquirer.prompt([
    {
      type: 'list',
      name: 'key',
      message: '请选择项目模板',
      pageSize: 10,
      choices: keys.map((key) => ({
        name: `${key}  ${chalk.gray(templates[key].description || templates[key].url)}`,
        value: key,
        short: key,
      })),
    },
  ]);

  return answer.key;
}

async function askConfirm(message) {
  const answer = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'ok',
      message,
      default: false,
    },
  ]);
  return answer.ok;
}

async function renamePackage(targetDir, name) {
  const pkgFile = path.join(targetDir, 'package.json');
  if (!(await fs.pathExists(pkgFile))) return;
  try {
    const data = await fs.readJson(pkgFile);
    if (data && typeof data === 'object') {
      data.name = name;
      await fs.writeJson(pkgFile, data, { spaces: 2 });
    }
  } catch (_) {
    // package.json 格式异常时不影响项目创建
  }
}

function printUpdateNotice(info) {
  log.info(`检测到 kook-cli 最新版:${chalk.blueBright(info.latest)}`);
  log.info(`当前版本:${chalk.blueBright(info.current)} ~`);
  log.info(`可使用 ${chalk.yellow('pnpm')} install -g kook-cli@latest 更新 ~`);
}

function printSuccess({ name, templateKey, targetDir, startedAt }) {
  log.blank();
  // 需求 6：下载成功提示
  log.success(`下载成功，用时 ${formatDuration(Date.now() - startedAt)}`);
  log.info(`模板：${chalk.cyan(templateKey)}`);
  log.info(`目录：${chalk.cyan(targetDir)}`);
  log.blank();
  // 需求 7：后续步骤
  log.info('下一步执行：');
  console.log(`  ${chalk.gray('$')} ${chalk.cyan(`cd ${name}`)}`);
  console.log(`  ${chalk.gray('$')} ${chalk.cyan('npm install')}`);
  console.log(`  ${chalk.gray('$')} ${chalk.cyan('npm run dev')}`);
  log.blank();
}

module.exports = create;
