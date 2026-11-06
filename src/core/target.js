'use strict';

const path = require('path');
const fs = require('fs-extra');

// Windows 不允许的字符 + 控制字符
const ILLEGAL_CHARS = /[<>:"/\\|?*\u0000-\u001f]/;
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
const MAX_LENGTH = 214;

/**
 * 需求 8：项目名为空时兜底为 kook-${模板名}
 */
function normalizeName(input, templateKey) {
  const raw = input == null ? '' : String(input).trim();
  if (!raw) {
    return { name: `kook-${templateKey}`, fallback: true };
  }
  return { name: raw, fallback: false };
}

function validateName(name) {
  if (!name) throw new Error('项目名不能为空');
  if (name === '.' || name === '..') throw new Error(`项目名不合法：${name}`);
  if (name.includes('/') || name.includes('\\')) {
    throw new Error('项目名不能包含路径分隔符，请输入单个目录名（如 my-app）');
  }
  if (ILLEGAL_CHARS.test(name)) {
    throw new Error('项目名包含非法字符：< > : " / \\ | ? *');
  }
  if (WINDOWS_RESERVED.test(name)) {
    throw new Error(`「${name}」是系统保留名，请换一个项目名`);
  }
  if (/[. ]$/.test(name)) {
    throw new Error('项目名不能以空格或点结尾');
  }
  if (name.length > MAX_LENGTH) {
    throw new Error(`项目名过长（最多 ${MAX_LENGTH} 个字符）`);
  }
  return name;
}

/**
 * 目标目录必须落在当前工作目录之下，避免 ../ 或绝对路径逃逸。
 */
function resolveTargetDir(name, cwd = process.cwd()) {
  const target = path.resolve(cwd, name);
  const relative = path.relative(cwd, target);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('项目目录必须位于当前目录下');
  }
  return target;
}

/**
 * 只做检测与确认，不删除任何文件。
 * 真正清空放在下载成功之后，避免下载失败时用户原文件已经被删。
 */
async function inspectTarget(targetDir, options = {}) {
  const { force = false, confirm } = options;

  let stat;
  try {
    // 必须用 lstat：指向目录的软链接会被 stat 跟随，清空时会误删链接指向的真实目录
    stat = await fs.lstat(targetDir);
  } catch (err) {
    if (err.code === 'ENOENT') {
      return { exists: false, count: 0, needsClear: false, canceled: false };
    }
    throw err;
  }

  if (stat.isSymbolicLink()) {
    throw new Error(`目标路径是符号链接，为避免误删已停止操作：${targetDir}`);
  }

  if (!stat.isDirectory()) {
    throw new Error(`目标路径已存在且不是目录：${targetDir}`);
  }

  const items = await fs.readdir(targetDir);
  if (items.length === 0) {
    return { exists: true, count: 0, needsClear: false, canceled: false };
  }

  if (!force) {
    if (typeof confirm !== 'function') {
      throw new Error(`目标目录非空：${targetDir}，可使用 -f/--force 覆盖`);
    }
    const ok = await confirm(
      `目录 ${path.basename(targetDir)} 已存在且不为空，是否覆盖其中的 ${items.length} 项内容？`
    );
    if (!ok) {
      return { exists: true, count: items.length, needsClear: false, canceled: true };
    }
  }

  return { exists: true, count: items.length, needsClear: true, canceled: false };
}

/**
 * 清空目录内容，保留目录本身。
 */
async function clearDir(targetDir) {
  const stat = await fs.lstat(targetDir);
  if (stat.isSymbolicLink()) {
    throw new Error(`目标路径是符号链接，为避免误删已停止操作：${targetDir}`);
  }
  await fs.emptyDir(targetDir);
}

module.exports = {
  normalizeName,
  validateName,
  resolveTargetDir,
  inspectTarget,
  clearDir,
};
