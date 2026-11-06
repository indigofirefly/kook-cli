'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const os = require('os');
const path = require('path');
const fs = require('fs-extra');
const { loadConfig } = require('../src/core/config');

async function withUserConfig(content, fn) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'kook-config-'));
  const file = path.join(dir, 'config.json');
  if (content !== null) {
    await fs.writeFile(file, typeof content === 'string' ? content : JSON.stringify(content));
  }
  try {
    return await fn(file);
  } finally {
    await fs.remove(dir);
  }
}

test('默认加载内置的三个模板', () => {
  const config = loadConfig({ userConfigPath: '/nonexistent/config.json' });
  assert.deepStrictEqual(Object.keys(config.templates).sort(), [
    'uni-mini-program',
    'vue3H5',
    'vue3admin',
  ]);
  assert.strictEqual(config.templates.vue3admin.url, 'https://gitee.com/yinghuopocket/yyadmin.git');
  assert.strictEqual(config.templates.vue3H5.url, 'https://gitee.com/yinghuopocket/uni-vue3.git');
  assert.strictEqual(
    config.templates['uni-mini-program'].url,
    'https://gitee.com/yinghuopocket/uni-app.git'
  );
  assert.strictEqual(config.templates.vue3admin.source, 'builtin');
});

test('用户配置覆盖同名模板并追加新模板', async () => {
  await withUserConfig(
    {
      registry: 'https://registry.npmjs.org',
      templates: {
        vue3H5: { description: '自定义描述', url: 'https://example.com/h5.git' },
        mine: { description: '我的模板', url: 'https://example.com/mine.git' },
      },
    },
    (file) => {
      const config = loadConfig({ userConfigPath: file });
      assert.deepStrictEqual(Object.keys(config.templates).sort(), [
        'mine',
        'uni-mini-program',
        'vue3H5',
        'vue3admin',
      ]);
      assert.strictEqual(config.templates.vue3H5.description, '自定义描述');
      assert.strictEqual(config.templates.vue3H5.url, 'https://example.com/h5.git');
      assert.strictEqual(config.templates.vue3H5.source, 'user');
      // 未被用户覆盖的字段保留内置值
      assert.strictEqual(config.templates.vue3H5.branch, 'master');
      assert.strictEqual(config.registry, 'https://registry.npmjs.org');
      assert.strictEqual(config.sources.user, file);
    }
  );
});

test('用户配置 JSON 语法错误时回退到内置配置', async () => {
  await withUserConfig('{ this is not json }', (file) => {
    const config = loadConfig({ userConfigPath: file });
    assert.strictEqual(Object.keys(config.templates).length, 3);
    assert.strictEqual(config.sources.user, null);
  });
});

test('缺少 url 的模板被忽略', async () => {
  await withUserConfig({ templates: { broken: { description: '没有 url' } } }, (file) => {
    const config = loadConfig({ userConfigPath: file });
    assert.strictEqual(config.templates.broken, undefined);
  });
});

test('用户配置文件不存在时正常返回', () => {
  const config = loadConfig({ userConfigPath: '/definitely/not/here.json' });
  assert.strictEqual(Object.keys(config.templates).length, 3);
  assert.strictEqual(config.sources.user, null);
});
