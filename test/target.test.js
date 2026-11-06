'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const os = require('os');
const path = require('path');
const fs = require('fs-extra');
const {
  normalizeName,
  validateName,
  resolveTargetDir,
  inspectTarget,
  clearDir,
} = require('../src/core/target');

test('未指定名称时兜底为 kook-${模板名}', () => {
  assert.deepStrictEqual(normalizeName(undefined, 'vue3H5'), { name: 'kook-vue3H5', fallback: true });
  assert.deepStrictEqual(normalizeName('', 'vue3admin'), { name: 'kook-vue3admin', fallback: true });
  assert.deepStrictEqual(normalizeName('   ', 'vue3admin'), { name: 'kook-vue3admin', fallback: true });
});

test('指定名称时去除首尾空格', () => {
  assert.deepStrictEqual(normalizeName(' my-app ', 'vue3H5'), { name: 'my-app', fallback: false });
});

test('非法项目名被拒绝', () => {
  const invalid = ['a/b', 'a\\b', '..', '.', 'a:b', 'a*b', 'con', 'name '];
  for (const name of invalid) {
    assert.throws(() => validateName(name), undefined, `应拒绝：${name}`);
  }
});

test('合法项目名通过校验', () => {
  for (const name of ['my-app', 'my_app', 'app2024', 'kook-vue3admin']) {
    assert.strictEqual(validateName(name), name);
  }
});

test('目标目录不允许逃逸到当前目录之外', () => {
  assert.throws(() => resolveTargetDir('../escape'), /必须位于当前目录下/);
  assert.strictEqual(resolveTargetDir('ok', '/tmp/work'), path.join('/tmp/work', 'ok'));
});

test('非空目录：取消确认则不做任何改动', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'kook-test-'));
  await fs.writeFile(path.join(dir, 'a.txt'), 'x');
  const result = await inspectTarget(dir, { force: false, confirm: async () => false });
  assert.strictEqual(result.canceled, true);
  assert.strictEqual(result.needsClear, false);
  assert.ok(await fs.pathExists(path.join(dir, 'a.txt')));
  await fs.remove(dir);
});

test('非空目录：确认后只标记待清空，不立即删除', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'kook-test-'));
  await fs.writeFile(path.join(dir, 'a.txt'), 'x');
  const result = await inspectTarget(dir, { force: false, confirm: async () => true });
  assert.strictEqual(result.needsClear, true);
  assert.strictEqual(result.count, 1);
  // 下载失败时原文件必须还在
  assert.ok(await fs.pathExists(path.join(dir, 'a.txt')));

  await clearDir(dir);
  assert.ok(await fs.pathExists(dir));
  assert.deepStrictEqual(await fs.readdir(dir), []);
  await fs.remove(dir);
});

test('--force 时跳过确认直接标记覆盖', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'kook-test-'));
  await fs.writeFile(path.join(dir, 'a.txt'), 'x');
  const result = await inspectTarget(dir, { force: true });
  assert.strictEqual(result.needsClear, true);
  assert.ok(await fs.pathExists(path.join(dir, 'a.txt')));
  await fs.remove(dir);
});

test('空目录与不存在的目录无需清理', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'kook-test-'));
  const empty = await inspectTarget(dir);
  assert.strictEqual(empty.needsClear, false);
  const missing = await inspectTarget(path.join(dir, 'not-exist'));
  assert.strictEqual(missing.exists, false);
  assert.strictEqual(missing.needsClear, false);
  await fs.remove(dir);
});
