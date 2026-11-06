'use strict';

const path = require('path');
const fs = require('fs');
const https = require('https');
const { execFile } = require('child_process');
const semver = require('semver');
const pkg = require('../../package.json');

const OFFICIAL_REGISTRY = 'https://registry.npmjs.org';
const FALLBACK_REGISTRIES = ['https://registry.npmmirror.com', 'https://registry.npmjs.org'];
const REQUEST_TIMEOUT = 3000;

function fetchJson(url, timeout = REQUEST_TIMEOUT, redirects = 3) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (value) => {
      if (!settled) {
        settled = true;
        resolve(value);
      }
    };

    let req;
    try {
      // 支持自建 http registry（企业内网 / 本地调试）
      const client = url.startsWith('http://') ? require('http') : https;
      req = client.get(
        url,
        { headers: { accept: 'application/json', 'user-agent': `${pkg.name}/${pkg.version}` } },
        (res) => {
          const status = res.statusCode || 0;
          if ([301, 302, 307, 308].includes(status) && res.headers.location && redirects > 0) {
            res.resume();
            const next = new URL(res.headers.location, url).toString();
            fetchJson(next, timeout, redirects - 1).then(done);
            return;
          }
          if (status !== 200) {
            res.resume();
            return done(null);
          }
          let body = '';
          res.setEncoding('utf8');
          res.on('data', (chunk) => {
            body += chunk;
            if (body.length > 2 * 1024 * 1024) {
              req.destroy();
              done(null);
            }
          });
          res.on('end', () => {
            try {
              done(JSON.parse(body));
            } catch (_) {
              done(null);
            }
          });
        }
      );
    } catch (_) {
      return done(null);
    }

    req.on('error', () => done(null));
    req.setTimeout(timeout, () => {
      req.destroy();
      done(null);
    });
  });
}

function buildRegistries(registry) {
  const list = [];
  for (const item of [registry, ...FALLBACK_REGISTRIES]) {
    if (!item) continue;
    const normalized = String(item).replace(/\/+$/, '');
    if (!list.includes(normalized)) list.push(normalized);
  }
  return list;
}

function globalRoots() {
  const pms = ['npm', 'pnpm'].map((pm) =>
    new Promise((resolve) => {
      const command = process.platform === 'win32' ? `${pm}.cmd` : pm;
      execFile(command, ['root', '-g'], { timeout: 5000 }, (err, stdout) => {
        const root = err ? '' : String(stdout).trim();
        resolve(root || null);
      });
    })
  );
  return Promise.all(pms);
}

/**
 * 读取本地全局安装的版本号。取不到（未全局安装 / 包管理器不可用）返回 null。
 */
async function getGlobalInstalledVersion() {
  const roots = await globalRoots();
  for (const root of roots) {
    if (!root) continue;
    try {
      const file = path.join(root, pkg.name, 'package.json');
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (semver.valid(data.version)) return data.version;
    } catch (_) {
      // 该包管理器下没有全局安装
    }
  }
  return null;
}

/**
 * 多个 registry 的结果里取版本号最高的一个。
 * 镜像站（npmmirror）同步有延迟，先返回的未必是最新的，必须比较后取最高。
 */
function pickHighest(results) {
  const valid = (results || []).filter((item) => item && semver.valid(item.version));
  if (valid.length === 0) return null;
  return valid.sort((a, b) => semver.rcompare(a.version, b.version))[0];
}

/**
 * 并行查询多个 registry，取最高版本。总耗时不叠加，最多一个 timeout。
 * 永不抛错，失败返回 null。
 */
async function getLatestVersion(registry, timeout = REQUEST_TIMEOUT) {
  const bases = buildRegistries(registry);
  const results = await Promise.all(
    bases.map(async (base) => {
      const url = `${base}/${encodeURIComponent(pkg.name)}/latest`;
      const data = await fetchJson(url, timeout);
      if (data && data.version && semver.valid(data.version)) {
        return { version: data.version, registry: base };
      }
      return null;
    })
  );
  return pickHighest(results);
}

function isNewer(latest, current) {
  if (!semver.valid(latest) || !semver.valid(current)) return false;
  return semver.gt(latest, current);
}

/**
 * 检查更新。不落盘缓存，避免镜像延迟或缓存过期导致「明明有新版本却不提醒」。
 * 调用方不需要阻塞等待：该函数有 3 秒超时且永不抛错。
 */
async function checkUpdate(currentVersion, options = {}) {
  const result = { current: currentVersion, latest: null, hasUpdate: false };

  try {
    const fetched = await getLatestVersion(options.registry);
    if (fetched) {
      result.latest = fetched.version;
      result.hasUpdate = isNewer(fetched.version, currentVersion);
    }
  } catch (_) {
    // 版本检查失败不影响主流程
  }

  return result;
}

module.exports = {
  getLatestVersion,
  getGlobalInstalledVersion,
  checkUpdate,
  pickHighest,
  isNewer,
  OFFICIAL_REGISTRY,
};
