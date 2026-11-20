/* 测试辅助：在 Node 的 vm 环境里装载课程数据（与浏览器同一份文件）。 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');

function loadCourse() {
  const LIT = require(path.join(ROOT, 'js/lit.js'));
  for (const k of Object.keys(LIT.learn)) delete LIT.learn[k];
  for (const k of Object.keys(LIT.texts)) delete LIT.texts[k];
  for (const k of Object.keys(LIT.classics)) delete LIT.classics[k];
  for (const k of Object.keys(LIT.libText)) delete LIT.libText[k];
  for (const k of Object.keys(LIT.libNotes)) delete LIT.libNotes[k];
  LIT.lib = { eras: [], books: [], units: {} };
  const ctx = vm.createContext({ LIT, console });
  const files = ['data/meta.js', 'data/texts.js', 'data/days1.js', 'data/days2.js', 'data/days3.js', 'data/classics1.js', 'data/classics2.js', 'data/guide.js', 'data/changelog.js'];
  // 书库（生成物，可缺省）：index + 每本书的原文与讲解
  const lib = path.join(ROOT, 'data', 'lib');
  if (fs.existsSync(path.join(lib, 'index.js'))) files.push('data/lib/index.js');
  for (const sub of ['text', 'note']) {
    const d = path.join(lib, sub);
    if (fs.existsSync(d)) fs.readdirSync(d).filter(f => f.endsWith('.js')).sort().forEach(f => files.push(`data/lib/${sub}/${f}`));
  }
  LIT.loadErrors = [];
  for (const f of files) {
    try { vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f }); }
    catch (e) { if (f.startsWith('data/lib/')) LIT.loadErrors.push(`${f}: ${e.message}`); else throw e; }   // 书库文件可能正被另一个撰写者重写
  }
  return LIT;
}

/** 内存版 localStorage */
function memStorage() {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), _m: m };
}

module.exports = { ROOT, loadCourse, memStorage };
