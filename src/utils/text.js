'use strict';

/**
 * 计算字符串在终端中的显示宽度（中文/全角字符按 2 列计算）。
 */
function displayWidth(str) {
  let width = 0;
  for (const ch of String(str)) {
    const code = ch.codePointAt(0);
    const wide =
      code >= 0x1100 &&
      (code <= 0x115f ||
        code === 0x2329 ||
        code === 0x232a ||
        (code >= 0x2e80 && code <= 0xa4cf) ||
        (code >= 0xac00 && code <= 0xd7a3) ||
        (code >= 0xf900 && code <= 0xfaff) ||
        (code >= 0xfe30 && code <= 0xfe6f) ||
        (code >= 0xff00 && code <= 0xff60) ||
        (code >= 0xffe0 && code <= 0xffe6) ||
        (code >= 0x1f300 && code <= 0x1f64f) ||
        (code >= 0x1f900 && code <= 0x1f9ff));
    width += wide ? 2 : 1;
  }
  return width;
}

function padEndDisplay(str, targetWidth) {
  const pad = Math.max(0, targetWidth - displayWidth(str));
  return String(str) + ' '.repeat(pad);
}

/**
 * 隐藏 URL 里的账号密码 / token，避免日志泄露凭据。
 * https://user:token@gitee.com/a/b.git -> https://***@gitee.com/a/b.git
 */
function maskUrl(url) {
  return String(url == null ? '' : url).replace(/\/\/[^/@\s]+@/g, '//***@');
}

module.exports = { displayWidth, padEndDisplay, maskUrl };
