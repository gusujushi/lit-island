#!/usr/bin/env node
/* 课程数据校验：结构、引用、天数、题目格式、页码范围、原文来源可追溯。任何错误 → 退出码 1。
 * 用法：node tools/validate.js [--check-sources]
 *   --check-sources：同时重新计算本机 txt 与维基文库文件的 SHA-256，确认与 texts.js 记录一致。 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { loadCourse, ROOT } = require('../tests/helpers.js');

const LIT = loadCourse();
const errs = [], warns = [];
const E = m => errs.push(m), W = m => warns.push(m);
const total = LIT.total();

// PDF 页数上限（按 2026-11-12 本机文件 pdfinfo）
const PAGES = { sjzx: 820, tsjs: 1221, scjz: 393, hjpz: 254, ssjs: 986, yrzj: 569, hlm: 1031, dbcs: 4081, sglc: 766, dmzz: 362, cyk: 378, dtjs: 108, tyjz: 485, ntjd: 174, tsc17: 436, lzhp1: 538, lzhp2: 443 };

if (total !== 90) E(`total 应为 90，实际 ${total}`);
const learnNums = Object.keys(LIT.learn).map(Number).sort((a, b) => a - b);
for (let n = 1; n <= total; n++) {
  if (n % 5 === 0) { if (LIT.learn[n]) E(`第 ${n} 天是复习日，不应有学习内容`); continue; }
  if (!LIT.learn[n]) E(`缺少第 ${n} 天学习内容`);
}
if (learnNums.length !== 72) E(`学习日应为 72 个，实际 ${learnNums.length}`);

const usedTexts = new Set();
const REQ = ['d', 'mod', 'title', 'texts', 'bg', 'ask', 'notes', 'keys', 'retell', 'judge', 'link', 'out', 'quiz', 'cards', 'book'];
for (const n of learnNums) {
  const d = LIT.learn[n];
  const at = `第 ${n} 天`;
  REQ.forEach(k => { if (d[k] === undefined) E(`${at} 缺字段 ${k}`); });
  if (!LIT.meta.modules[d.mod]) E(`${at} 模块 ${d.mod} 不存在`);
  const ph = LIT.phaseOf(n); if (LIT.meta.modules[d.mod] && LIT.meta.modules[d.mod].phase !== ph.id) E(`${at} 模块 ${d.mod} 不属于第 ${ph.id} 阶段`);
  [...(d.texts || []), ...(d.opt || [])].forEach(id => { if (!LIT.texts[id]) E(`${at} 引用了不存在的原文 ${id}`); usedTexts.add(id); });
  if (!d.texts || !d.texts.length) E(`${at} 没有主读原文`);
  (d.notes || []).forEach((x, i) => { if (!Array.isArray(x) || x.length !== 2 || !x[0] || !x[1]) E(`${at} 字词注第 ${i + 1} 条格式错误`); });
  if ((d.keys || []).length < 2) E(`${at} 精读要点少于 2 条`);
  if ((d.quiz || []).length < 2) E(`${at} 小测少于 2 题`);
  (d.quiz || []).forEach((q, i) => {
    if (!Array.isArray(q) || q.length !== 3 || typeof q[0] !== 'string' || !Array.isArray(q[1]) || q[1].length !== 3 || typeof q[2] !== 'string') E(`${at} 小测第 ${i + 1} 题格式错误`);
    else if (new Set(q[1]).size !== 3) E(`${at} 小测第 ${i + 1} 题选项重复`);
  });
  if ((d.cards || []).length < 2) E(`${at} 卡片少于 2 张`);
  (d.cards || []).forEach((c, i) => { if (!Array.isArray(c) || c.length !== 2 || !c[0] || !c[1]) E(`${at} 卡片第 ${i + 1} 张格式错误`); });
  (d.book || []).forEach((b, i) => {
    if (!LIT.meta.books[b[0]]) E(`${at} 书目第 ${i + 1} 条：未知书 ${b[0]}`);
    else if (!(b[1] >= 1 && b[1] <= PAGES[b[0]])) E(`${at} 书目第 ${i + 1} 条：页码 ${b[1]} 超出 1–${PAGES[b[0]]}`);
    if (!b[2]) E(`${at} 书目第 ${i + 1} 条缺说明`);
  });
  if (d.more !== undefined && (typeof d.more !== 'string' || d.more.length < 8)) E(`${at} more 字段应为说明文字`);
  const kc = LIT.classics[n];
  if (!kc) E(`${at} 缺少"今日经典"`);
  else {
    if (!['句', '词', '典故', '句式'].includes(kc.k)) E(`${at} 经典类型 ${kc.k} 不在 句/词/典故/句式 内`);
    ['item', 'src', 'why'].forEach(f => { if (!kc[f]) E(`${at} 经典缺 ${f}`); });
    ['old', 'now', 'use'].forEach(f => { if (!Array.isArray(kc[f]) || !kc[f].length || kc[f].some(x => !Array.isArray(x) || x.length !== 2 || !x[0] || !x[1])) E(`${at} 经典 ${f} 格式错误`); });
    if (kc.use && kc.use.length < 2) W(`${at} 经典例句少于 2 条`);
  }
  if (d.mod === 'yan' || d.mod === 'yanw') { if (!d.yan) E(`${at} 燕国课缺少《燕云悲歌》对照（yan 字段）`); }
  ['bg', 'ask', 'retell', 'judge', 'link', 'out'].forEach(k => { if (typeof d[k] === 'string' && d[k].length < 12) W(`${at} ${k} 过短`); });
}
Object.keys(LIT.texts).forEach(id => { if (!usedTexts.has(id)) W(`原文 ${id} 未被任何一天使用`); });

// 原文来源可追溯
const BOOKS = process.env.LIT_BOOKS || path.join(process.env.HOME, 'Documents/书籍/文学/古籍下载');
Object.entries(LIT.texts).forEach(([id, t]) => {
  if (!t.src || !t.src.file || !t.src.sha) E(`原文 ${id} 缺少来源或校验值`);
  if (!t.simp || t.simp.length < 16) E(`原文 ${id} 正文过短`);
});
if (process.argv.includes('--check-sources')) {
  const cache = {};
  const sha = f => (cache[f] = cache[f] || crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex'));  // 原始字节
  Object.entries(LIT.texts).forEach(([id, t]) => {
    const first = t.src.file.split(' + ')[0];
    const f = first.startsWith('sources/') ? path.join(ROOT, first) : first.includes('/') ? path.join(path.dirname(BOOKS), first) : path.join(BOOKS, first);
    if (!fs.existsSync(f)) { E(`原文 ${id} 的来源文件不存在：${f}`); return; }
    if (sha(f) !== t.src.sha) E(`原文 ${id} 的来源文件校验值已变化：${first}`);
  });
}

// 复习日与月度回顾
for (let n = 5; n <= total; n += 5) {
  const d = LIT.day(n);
  if (d.type !== 'review') E(`第 ${n} 天应为复习日`);
  if (d.covers.length !== 4) E(`第 ${n} 天复习日应覆盖 4 个学习日，实际 ${d.covers.length}`);
  if ((n % 30 === 0) !== d.month) E(`第 ${n} 天月度回顾标记错误`);
}
LIT.meta.phases.forEach(p => { if (!p.month || p.month.length < 3) E(`阶段 ${p.name} 月度回顾题不足`); });

// 模块天数
const count = {};
learnNums.forEach(n => { const m = LIT.learn[n].mod; count[m] = (count[m] || 0) + 1; });

warns.forEach(w => console.log('⚠', w));
errs.forEach(e => console.log('✗', e));
Object.keys(LIT.classics).forEach(k => { if (!LIT.learn[k]) E(`经典第 ${k} 天不是学习日`); });
console.log(`学习日 ${learnNums.length}，复习日 ${total - learnNums.length}，原文 ${Object.keys(LIT.texts).length} 段，卡片 ${learnNums.reduce((s, n) => s + LIT.learn[n].cards.length, 0)} 张，小测 ${learnNums.reduce((s, n) => s + LIT.learn[n].quiz.length, 0)} 题`);
console.log('模块天数：' + Object.entries(count).map(([k, v]) => `${LIT.meta.modules[k].name} ${v}`).join('，'));
// 版本与更新记录：data/changelog.js 第一条 = package.json version = sw.js VERSION；每条都要有日期和主要修改
{
  const cl = LIT.changelog || [];
  const vc = (a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i]; return 0; };
  if (!cl.length) errs.push('缺少更新记录 data/changelog.js');
  else {
    cl.forEach((c, i) => {
      if (!/^\d+\.\d+\.\d+$/.test(c.v || '') || !/^\d{4}-\d{2}-\d{2}$/.test(c.date || '') || !(c.items || []).length) errs.push(`更新记录第 ${i + 1} 条格式不对（要有 v、date、items）`);
      if (i && vc(cl[i - 1].v, c.v) <= 0) errs.push(`更新记录要从新到旧排列：v${cl[i - 1].v} 在 v${c.v} 前面`);
    });
    const v = cl[0].v;
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
    const swText = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
    const sw = (swText.match(/lit-island-v([0-9.]+)'/) || [])[1];
    if (pkg !== v) errs.push(`版本不一致：package.json ${pkg}，更新记录 ${v}`);
    if (sw !== v) errs.push(`版本不一致：sw.js ${sw}，更新记录 ${v}（手机靠 sw.js 的版本号才会更新）`);
    if (!swText.includes("'data/changelog.js'")) errs.push('sw.js 的离线清单缺 data/changelog.js');
    if (!fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').includes('data/changelog.js')) errs.push('index.html 没有加载 data/changelog.js');
    console.log(`版本 v${v}（${cl[0].date}），更新记录 ${cl.length} 条`);
  }
}

console.log(errs.length ? `校验失败：${errs.length} 个错误` : '校验通过');
process.exit(errs.length ? 1 : 0);
