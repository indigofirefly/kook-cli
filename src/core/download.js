'use strict';

const { spawn, spawnSync } = require('child_process');
const cliProgress = require('cli-progress');
const chalk = require('chalk');
const fs = require('fs-extra');
const log = require('../utils/log');

const GIT_PHASES = [
  { test: /Counting objects/i, label: '统计对象', from: 0, to: 5 },
  { test: /Compressing objects/i, label: '压缩对象', from: 5, to: 15 },
  { test: /Receiving objects/i, label: '下载中', from: 15, to: 90 },
  { test: /Resolving deltas/i, label: '解析差异', from: 90, to: 99 },
  { test: /Updating files|Checking out files/i, label: '写入文件', from: 99, to: 100 },
];

/**
 * 把 git 的一行进度输出解析成进度条需要的数据。
 * 例：Receiving objects:  47% (4210/8957), 12.30 MiB | 1.10 MiB/s
 */
function mapProgress(line) {
  const match = /([A-Za-z][A-Za-z ]+?):\s+(\d+)%/.exec(line);
  if (!match) return null;

  const phaseName = match[1].trim();
  const rawPercent = Number(match[2]);
  const phase = GIT_PHASES.find((item) => item.test.test(phaseName)) || {
    label: '下载中',
    from: 0,
    to: 100,
  };

  let percent = phase.from + ((phase.to - phase.from) * rawPercent) / 100;
  if (!Number.isFinite(percent)) percent = phase.from;
  percent = Math.max(0, Math.min(100, percent));

  const detailMatch = /(\d+(?:\.\d+)?\s*[KMG]iB\s*\|\s*\d+(?:\.\d+)?\s*[KMG]iB\/s)/.exec(line);

  return {
    phase: phase.label,
    percent,
    detail: detailMatch ? detailMatch[1] : '',
  };
}

function hasGit() {
  const result = spawnSync('git', ['--version'], { stdio: 'ignore', timeout: 5000 });
  return !result.error && result.status === 0;
}

/**
 * 探测仓库默认分支（master / main），失败返回 null。
 */
function detectDefaultBranch(url, timeout = 6000) {
  const result = spawnSync('git', ['ls-remote', '--symref', url, 'HEAD'], {
    encoding: 'utf8',
    timeout,
  });
  if (result.error || result.status !== 0 || !result.stdout) return null;
  const match = /ref:\s+refs\/heads\/(\S+)\s+HEAD/.exec(result.stdout);
  return match ? match[1] : null;
}

function resolveBranch(template) {
  return detectDefaultBranch(template.url) || template.branch || 'master';
}

function classifyError(stderr) {
  if (/Authentication failed|could not read Username|Permission denied|access denied|terminal prompts disabled/i.test(stderr)) {
    return 'AUTH';
  }
  if (/Remote branch .* not found|couldn't find remote ref/i.test(stderr)) {
    return 'BRANCH';
  }
  if (/not found|does not exist|Repository .* not found/i.test(stderr)) {
    return 'REPO';
  }
  if (/Could not resolve host|Network is unreachable|Connection (timed out|refused|reset)|Failed to connect|operation timed out/i.test(stderr)) {
    return 'NETWORK';
  }
  return 'UNKNOWN';
}

function buildErrorMessage(stderr, branch, url) {
  const code = classifyError(stderr);
  if (code === 'AUTH') {
    return `仓库鉴权失败：请先在终端执行 git clone ${url || ''} 确认已登录 Gitee，或改用 SSH 地址`;
  }
  if (code === 'BRANCH') {
    return `分支 ${branch ? `「${branch}」` : ''}不存在，请检查 config.json 中的 branch 配置`;
  }
  if (code === 'REPO') {
    return '仓库不存在或地址有误，请检查 config.json 中的 url 配置';
  }
  if (code === 'NETWORK') {
    return '网络连接失败，请检查网络或代理后重试';
  }
  const lastLine = String(stderr)
    .split(/\r|\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .pop();
  return lastLine ? `git clone 失败：${lastLine}` : 'git clone 失败，请稍后重试';
}

function createBar() {
  const bar = new cliProgress.SingleBar(
    {
      format: `  {phase} ${chalk.gray('|')}{bar}${chalk.gray('|')} ${chalk.cyan('{percentage}%')} {detail}`,
      barCompleteChar: '█',
      barIncompleteChar: '░',
      barsize: 28,
      hideCursor: true,
      clearOnComplete: true,
      etaBuffer: 10,
    },
    cliProgress.Presets.shades_classic
  );
  return bar;
}

function cloneOnce({ url, branch, dest, onProgress }) {
  return new Promise((resolve, reject) => {
    const args = ['clone', '--depth', '1', '--progress', '--single-branch'];
    if (branch) args.push('--branch', branch);
    args.push(url, dest);

    // 交互终端下允许 git 弹出账号密码输入（私有 Gitee 仓库）；CI 下直接失败
    const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY);
    const child = spawn('git', args, {
      stdio: [interactive ? 'inherit' : 'ignore', 'pipe', 'pipe'],
      env: { ...process.env, GIT_TERMINAL_PROMPT: interactive ? '1' : '0' },
    });

    let stderrTail = '';
    let buffer = '';
    let finished = false;

    const finish = (err) => {
      if (finished) return;
      finished = true;
      if (err) reject(err);
      else resolve();
    };

    child.stdout.on('data', () => {});

    child.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      stderrTail = (stderrTail + text).slice(-4000);
      buffer += text;

      // git 用 \r 覆盖同一行，需要按 \r 和 \n 一起切分
      const lines = buffer.split(/\r|\n/);
      buffer = lines.pop() || '';

      for (const line of lines) {
        const parsed = mapProgress(line);
        if (parsed) {
          onProgress(parsed);
        } else if (/Cloning into/i.test(line)) {
          onProgress({ phase: '下载中', percent: 2, detail: '正在连接仓库...' });
        }
      }
    });

    child.on('error', (err) => {
      if (err.code === 'ENOENT') {
        const notFound = new Error('未检测到 git，请先安装 git 后重试（https://git-scm.com/downloads）');
        notFound.code = 'GIT_MISSING';
        return finish(notFound);
      }
      finish(err);
    });

    child.on('close', (code) => {
      if (code === 0) return finish();
      const err = new Error(buildErrorMessage(stderrTail, branch, url));
      err.code = classifyError(stderrTail);
      err.stderr = stderrTail;
      finish(err);
    });
  });
}

/**
 * 下载模板到 dest，带进度条与一次自动重试。
 */
async function downloadTemplate(template, options = {}) {
  const { url, branch } = template;
  const { dest, retries = 2 } = options;
  const bar = createBar();
  let current = { phase: '下载中', percent: 0, detail: '准备下载...' };

  bar.start(100, 0, current);

  const onProgress = (next) => {
    // 进度只增不减，避免 git 阶段切换时百分比回退
    if (next.percent < current.percent) {
      next = { ...next, percent: current.percent };
    }
    current = next;
    bar.update(Math.min(100, Math.round(next.percent)), next);
  };

  let lastError = null;
  try {
    for (let attempt = 1; attempt <= retries; attempt += 1) {
      try {
        await cloneOnce({ url, branch, dest, onProgress });
        bar.update(100, { phase: '下载中', detail: '完成' });
        bar.stop();
        return;
      } catch (err) {
        lastError = err;
        await fs.remove(dest).catch(() => {});
        const retryable = err.code === 'NETWORK' || err.code === 'UNKNOWN';
        if (!retryable || attempt === retries) break;
        bar.update(Math.min(100, Math.round(current.percent)), {
          phase: '下载中',
          detail: `第 ${attempt} 次失败，正在重试...`,
        });
        await new Promise((resolve) => setTimeout(resolve, 800));
      }
    }
    bar.stop();
    throw lastError;
  } catch (err) {
    bar.stop();
    throw err;
  }
}

module.exports = {
  downloadTemplate,
  detectDefaultBranch,
  resolveBranch,
  hasGit,
  mapProgress,
  classifyError,
};
