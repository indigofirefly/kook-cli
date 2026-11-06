'use strict';

const path = require('path');
const os = require('os');
const fs = require('fs-extra');
const log = require('../utils/log');

const BUILTIN_PATH = path.join(__dirname, '..', 'config.json');
const USER_CONFIG_PATH = path.join(os.homedir(), '.kook-cli', 'config.json');

function readJson(file) {
  const content = fs.readFileSync(file, 'utf8');
  return JSON.parse(content);
}

/**
 * 读取内置配置，并用用户级配置覆盖。
 * 用户级配置路径优先级：options.userConfigPath > 环境变量 KOOK_CLI_CONFIG > ~/.kook-cli/config.json
 */
function loadConfig(options = {}) {
  const builtin = readJson(BUILTIN_PATH);
  const userPath = options.userConfigPath || process.env.KOOK_CLI_CONFIG || USER_CONFIG_PATH;

  const result = {
    registry: builtin.registry,
    checkUpdate: builtin.checkUpdate !== false,
    templates: {},
    sources: {
      builtin: BUILTIN_PATH,
      user: null,
    },
  };

  for (const [key, tpl] of Object.entries(builtin.templates || {})) {
    const normalized = normalizeTemplate(key, tpl, 'builtin');
    if (normalized) result.templates[key] = normalized;
  }

  if (fs.existsSync(userPath)) {
    let userConfig = null;
    try {
      userConfig = readJson(userPath);
    } catch (err) {
      log.warn(`用户配置解析失败，已回退到内置配置：${userPath}`);
      log.warn(`原因：${err.message}`);
    }

    if (userConfig && typeof userConfig === 'object') {
      result.sources.user = userPath;
      if (typeof userConfig.registry === 'string' && userConfig.registry.trim()) {
        result.registry = userConfig.registry.trim();
      }
      if (typeof userConfig.checkUpdate === 'boolean') {
        result.checkUpdate = userConfig.checkUpdate;
      }
      for (const [key, tpl] of Object.entries(userConfig.templates || {})) {
        const normalized = normalizeTemplate(key, tpl, 'user');
        if (normalized) {
          const previous = result.templates[key] || {};
          const merged = { ...previous, ...normalized };
          // 用户没写 branch 时保留内置分支，而不是用空值覆盖
          if (!normalized.branch) merged.branch = previous.branch || '';
          result.templates[key] = merged;
        }
      }
    }
  }

  if (typeof result.registry !== 'string' || !/^https?:\/\//.test(result.registry)) {
    result.registry = builtin.registry;
  }

  return result;
}

function normalizeTemplate(key, tpl, source) {
  if (!key || !tpl || typeof tpl !== 'object') {
    log.warn(`忽略无效模板配置：${key}`);
    return null;
  }
  const url = typeof tpl.url === 'string' ? tpl.url.trim() : '';
  if (!url) {
    log.warn(`模板「${key}」缺少 url 字段，已忽略`);
    return null;
  }
  return {
    key,
    name: typeof tpl.name === 'string' && tpl.name.trim() ? tpl.name.trim() : key,
    description: typeof tpl.description === 'string' ? tpl.description.trim() : '',
    url,
    branch: typeof tpl.branch === 'string' && tpl.branch.trim() ? tpl.branch.trim() : '',
    source,
  };
}

module.exports = {
  loadConfig,
  normalizeTemplate,
  BUILTIN_PATH,
  USER_CONFIG_PATH,
};
