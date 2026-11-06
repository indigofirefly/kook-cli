'use strict';

const path = require('path');
const { execSync, spawn } = require('child_process');
const fs = require('fs-extra');
const semver = require('semver');
const chalk = require('chalk');
const pkg = require('../../package.json');
const { loadConfig } = require('../core/config');
const { getLatestVersion } = require('../core/version');
const log = require('../utils/log');

async function update() {
  const config = loadConfig();
  const latest = await getLatestVersion(config.registry);

  if (!latest) {
    throw new Error('无法获取最新版本，请检查网络或 config.json 中的 registry 配置');
  }

  const current = pkg.version;
  if (semver.valid(latest.version) && semver.valid(current) && semver.gte(current, latest.version)) {
    log.success(`当前已是最新版本 ${chalk.cyan(current)}`);
    log.success(`当前已是最新版本 ~~`);
    return;
  }

  const pm = detectInstaller();
  if (!isGlobalInstall()) {
    log.warn('检测到当前可能不是全局安装，升级后可能不会生效');
    log.info('如需全局安装：npm install -g kook-cli');
  }

  log.info(`准备升级 kook-cli ${chalk.gray(current)} -> ${chalk.cyan(latest.version)}（使用 ${pm}）`);

  const args =
    pm === 'yarn' ? ['global', 'add', 'kook-cli@latest'] : ['install', '-g', 'kook-cli@latest'];
  await runLive(pm, args);

  log.success('升级完成，执行 kook-cli -V 查看新版本');
}

function detectInstaller() {
  if (process.env.KOOK_CLI_PM) return process.env.KOOK_CLI_PM;
  const userAgent = process.env.npm_config_user_agent || '';
  const match = /^(pnpm|yarn|npm)\//.exec(userAgent);
  return match ? match[1] : 'npm';
}

function globalRoots() {
  const roots = [];
  for (const pm of ['npm', 'pnpm']) {
    try {
      const root = execSync(`${pm} root -g`, {
        encoding: 'utf8',
        timeout: 5000,
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
      if (root) roots.push(root);
    } catch (_) {
      // 该包管理器未安装
    }
  }
  return roots;
}

function isGlobalInstall() {
  const pkgRoot = path.resolve(__dirname, '..', '..');
  let realPkgRoot = pkgRoot;
  try {
    realPkgRoot = fs.realpathSync(pkgRoot);
  } catch (_) {}

  return globalRoots().some((root) => {
    const rootPath = path.resolve(root);
    if (realPkgRoot.startsWith(rootPath + path.sep)) return true;
    // npm link：全局目录里是指向本地的软链
    try {
      return fs.realpathSync(path.join(rootPath, pkg.name)) === realPkgRoot;
    } catch (_) {
      return false;
    }
  });
}

function runLive(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });

    child.on('error', (err) => {
      if (err.code === 'ENOENT') {
        reject(new Error(`未找到 ${command}，请先安装 ${command}`));
        return;
      }
      reject(err);
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      // npm 在权限不足时通常返回 243
      if (code === 243 || code === 1) {
        reject(
          new Error(
            `升级失败（退出码 ${code}），可能是权限不足。可尝试 sudo，或修改全局安装目录：npm config set prefix ~/.npm-global`
          )
        );
        return;
      }
      reject(new Error(`${command} 执行失败，退出码 ${code}`));
    });
  });
}

module.exports = update;
