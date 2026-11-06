'use strict';

const os = require('os');
const path = require('path');

function tempDir(prefix = 'kook-cli') {
  const random = Math.random().toString(16).slice(2, 8);
  return path.join(os.tmpdir(), `${prefix}-${Date.now()}-${random}`);
}

function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '-';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

module.exports = { tempDir, formatDuration };
