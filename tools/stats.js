#!/usr/bin/env node
/* 内容规模统计：主线 + 书库，对照 v0.6.0 基准逐项检查是否达到 10 倍（AGENTS.md 规则 10）。
 * 用法：node tools/stats.js [--json]      退出码恒为 0（只报告，不作发布门槛，见 AGENTS.md 规则 10）。 */
const { loadCourse } = require('../tests/helpers.js');
const L = loadCourse();
const han = s => (String(s || '').match(/[㐀-鿿]/g) || []).length;

// v0.6.0 实测基准（2026-11-13）
const BASE = { passages: 122, origHan: 35798, units: 72, noteHan: 48098, quiz: 191, cards: 189, glosses: 804, focus: 220, lines: 72 };
const NAME = { passages: '原文段', origHan: '原文汉字', units: '精读单元', noteHan: '讲解汉字', quiz: '小测', cards: '卡片', glosses: '字词注', focus: '重点分析', lines: '名句' };

const learn = Object.values(L.learn);
const main = {
  passages: Object.keys(L.texts).length,
  origHan: Object.values(L.texts).reduce((a, t) => a + han(t.simp), 0),
  units: learn.length,
  noteHan: learn.reduce((a, d) => a + han(JSON.stringify(Object.assign({}, d, { texts: 0, opt: 0 }))), 0),
  quiz: learn.reduce((a, d) => a + (d.quiz || []).length, 0),
  cards: learn.reduce((a, d) => a + (d.cards || []).length, 0),
  glosses: learn.reduce((a, d) => a + (d.notes || []).length, 0),
  focus: learn.reduce((a, d) => a + (d.keys || []).length, 0),
  lines: Object.keys(L.classics).length,
};
const notes = Object.entries(L.libNotes).filter(([id]) => L.lib.units[id]).map(([, n]) => n);
const lib = {
  passages: Object.keys(L.libText).length,
  origHan: Object.values(L.libText).reduce((a, t) => a + han(t.simp), 0),
  units: notes.length,
  noteHan: notes.reduce((a, n) => a + han(JSON.stringify(n)), 0),
  quiz: notes.reduce((a, n) => a + (n.quiz || []).length, 0),
  cards: notes.reduce((a, n) => a + (n.cards || []).length, 0),
  glosses: notes.reduce((a, n) => a + (n.notes || []).length, 0),
  focus: notes.reduce((a, n) => a + (n.focus || []).length, 0),
  lines: notes.filter(n => n.line && n.line[0]).length,
};
const rows = Object.keys(BASE).map(k => {
  const total = main[k] + lib[k], ratio = total / BASE[k];
  return { 指标: NAME[k], 基准: BASE[k], 主线: main[k], 书库: lib[k], 合计: total, 倍数: ratio.toFixed(1) + '×', 达标: ratio >= 10 ? '✓' : '✗' };
});
if (process.argv.includes('--json')) console.log(JSON.stringify({ main, lib, rows }));
else {
  console.table(rows);
  const perBook = {};
  Object.values(L.lib.units).forEach(u => { const b = perBook[u.b] = perBook[u.b] || { 单元: 0, 有讲解: 0 }; b.单元++; if (u.h) b.有讲解++; });
  if (Object.keys(perBook).length) console.table(perBook);
}
const fail = rows.filter(r => r.达标 !== '✓');
console.log(`规模（仅供参考，不作发布门槛）：${fail.length ? '未到 10 倍的指标：' + fail.map(r => r.指标).join('、') : '全部指标达到 10 倍以上'}`);
process.exit(0);
