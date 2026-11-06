'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { mapProgress, classifyError } = require('../src/core/download');

test('Receiving objects 映射到下载阶段', () => {
  const parsed = mapProgress('Receiving objects:  47% (4210/8957), 12.30 MiB | 1.10 MiB/s');
  assert.strictEqual(parsed.phase, '下载中');
  assert.strictEqual(parsed.detail, '12.30 MiB | 1.10 MiB/s');
  assert.ok(parsed.percent >= 15 && parsed.percent <= 90, `实际 ${parsed.percent}`);
});

test('remote 前缀与 \\r 覆盖行也能解析', () => {
  const parsed = mapProgress('remote: Compressing objects: 100% (30/30), done.');
  assert.strictEqual(parsed.phase, '压缩对象');
});

test('Resolving deltas 映射到收尾阶段', () => {
  const parsed = mapProgress('Resolving deltas:  83% (3001/3615)');
  assert.strictEqual(parsed.phase, '解析差异');
  assert.ok(parsed.percent > 90 && parsed.percent < 100);
});

test('没有百分比的输出返回 null', () => {
  assert.strictEqual(mapProgress('Enumerating objects: 12, done.'), null);
  assert.strictEqual(mapProgress('Cloning into \'demo\'...'), null);
});

test('百分比始终落在 0-100 之间', () => {
  const parsed = mapProgress('Receiving objects: 100% (8957/8957), 20.00 MiB | 2.00 MiB/s');
  assert.ok(parsed.percent <= 100);
});

test('git 错误分类', () => {
  assert.strictEqual(classifyError('fatal: Authentication failed for repo'), 'AUTH');
  assert.strictEqual(classifyError('fatal: Remote branch foo not found in upstream origin'), 'BRANCH');
  assert.strictEqual(classifyError('fatal: repository not found'), 'REPO');
  assert.strictEqual(classifyError("fatal: unable to access: Could not resolve host: gitee.com"), 'NETWORK');
  assert.strictEqual(classifyError('something weird happened'), 'UNKNOWN');
});
