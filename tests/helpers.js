/* 测试辅助：在 Node 的 vm 环境里装载课程数据（与浏览器同一份文件）。 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');

function loadCourse() {
  const LIT = require(path.join(ROOT, 'js/lit.js'));
  for (const k of Object.keys(LIT.learn)) delete LIT.learn[k];
  for (const k of Object.keys(LIT.texts)) delete LIT.texts[k];
  const ctx = vm.createContext({ LIT, console });
  for (const f of ['data/meta.js', 'data/texts.js', 'data/days1.js', 'data/days2.js', 'data/days3.js', 'data/guide.js']) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  }
  return LIT;
}

/** 内存版 localStorage */
function memStorage() {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), _m: m };
}

module.exports = { ROOT, loadCourse, memStorage };
