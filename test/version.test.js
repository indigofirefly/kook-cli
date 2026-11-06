'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { isNewer, pickHighest } = require('../src/core/version');
const { displayWidth, padEndDisplay } = require('../src/utils/text');

test('版本比较', () => {
  assert.strictEqual(isNewer('0.2.0', '0.1.0'), true);
  assert.strictEqual(isNewer('1.0.0', '0.9.9'), true);
  assert.strictEqual(isNewer('0.1.0', '0.1.0'), false);
  assert.strictEqual(isNewer('0.0.9', '0.1.0'), false);
  assert.strictEqual(isNewer('not-a-version', '0.1.0'), false);
  assert.strictEqual(isNewer('0.2.0', undefined), false);
});

test('多个 registry 结果取最高版本，而不是先返回的那个', () => {
  // npmmirror 同步延迟：0.1.0，npmjs 已是 0.1.1
  const picked = pickHighest([
    { version: '0.1.0', registry: 'https://registry.npmmirror.com' },
    { version: '0.1.1', registry: 'https://registry.npmjs.org' },
  ]);
  assert.strictEqual(picked.version, '0.1.1');
  assert.strictEqual(picked.registry, 'https://registry.npmjs.org');
});

test('全部失败或版本号非法时返回 null', () => {
  assert.strictEqual(pickHighest([]), null);
  assert.strictEqual(pickHighest([null, undefined, { version: 'not-a-version' }]), null);
});

test('中文按两个字符宽度计算', () => {
  assert.strictEqual(displayWidth('abc'), 3);
  assert.strictEqual(displayWidth('中文'), 4);
  assert.strictEqual(displayWidth('a中'), 3);
});

test('按显示宽度补齐空格', () => {
  assert.strictEqual(displayWidth(padEndDisplay('中文', 6)), 6);
  assert.strictEqual(displayWidth(padEndDisplay('abc', 6)), 6);
  assert.strictEqual(padEndDisplay('abcdef', 3), 'abcdef');
});
