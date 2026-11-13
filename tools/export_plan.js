#!/usr/bin/env node
/* 由课程数据生成正式学习方案文档（Markdown）。方法章节来自 data/guide.js，九十天课表来自 data/days*.js。
 * 用法：node tools/export_plan.js <输出路径> [版本号] [日期] */
const fs = require('fs');
const { loadCourse } = require('../tests/helpers.js');
const LIT = loadCourse();
const out = process.argv[2];
const ver = process.argv[3] || 'v1';
const date = process.argv[4] || new Date().toISOString().slice(0, 10);
if (!out) { console.error('用法：node tools/export_plan.js <输出路径> [版本号] [日期]'); process.exit(1); }

const L = [];
L.push(`# 文学能力岛 · 90 天古典文学与历史学习方案（${ver}）`, '');
L.push(`> 生成日期：${date}　｜　程序：\`~/Documents/文学学习/lit-island/index.html\`　｜　本文由 \`tools/export_plan.js\` 从程序课程数据生成，改课程请改数据再重新生成。`, '');
L.push('## 结论', '');
L.push('- 一轮 90 天、三阶段：源流岛（诗经／魏晋／诸燕）→ 诗词岛（唐诗／五代／宋词）→ 世情岛（元曲／明清／公案＋燕国创作工坊）。');
L.push('- 每 5 天一轮：4 天学新课＋1 天复习；第 30、60、90 天月度回顾。每天 15／25／40 分钟三档可选，每周学习日可调。');
L.push('- 每天五步：导读 → 原文（可朗读）→ 精读（字词、要点、本机注本页码、小测）→ 思辨（复述、判断、对照）→ 输出＋自评。');
L.push('- 评估只看"讲清度"L0–L3：能否用自己的话讲清要点，并作出有根据的判断；不看读了多少。');
L.push(`- 内容规模：72 个学习日、18 个复习日；原文 ${Object.keys(LIT.texts).length} 段（全部来自可追溯的公版来源）；卡片 ${Object.values(LIT.learn).reduce((s, d) => s + d.cards.length, 0)} 张；小测 ${Object.values(LIT.learn).reduce((s, d) => s + d.quiz.length, 0)} 题。`, '');

const block = b => {
  if (typeof b === 'string') return [b, ''];
  if (b.list) return [...b.list.map(x => `- ${x}`), ''];
  if (b.table) return [`| ${b.table[0].join(' | ')} |`, `| ${b.table[0].map(() => '---').join(' | ')} |`, ...b.table.slice(1).map(r => `| ${r.join(' | ')} |`), ''];
  return [];
};
LIT.guide.forEach(sec => { L.push(`## ${sec.h}`, ''); sec.body.forEach(b => L.push(...block(b))); });

L.push('## 九、九十天课表', '');
LIT.meta.phases.forEach(p => {
  L.push(`### ${p.emoji} ${p.name}（第 ${p.days[0]}–${p.days[1]} 天）`, '', p.goal, '');
  L.push('| 天 | 模块 | 课题 | 原文（来源） | 本机注本页码 |', '| --- | --- | --- | --- | --- |');
  for (let n = p.days[0]; n <= p.days[1]; n++) {
    const d = LIT.day(n);
    if (d.type === 'review') { L.push(`| ${n} | 🔁 | **${d.title}** | 讲清测试第 ${d.covers.join('、')} 天；判断回看；到期卡片${d.month ? '；月度回顾五题' : ''} | — |`); continue; }
    const m = LIT.meta.modules[d.mod];
    const texts = [...d.texts, ...(d.opt || [])].map(id => { const t = LIT.texts[id]; return `${(d.opt || []).includes(id) ? '（选读）' : ''}${t.a}《${t.t}》`; }).join('；');
    const books = [...(d.book || []).map(b => `《${LIT.meta.books[b[0]].name}》p.${b[1]}`), ...(d.more ? [d.more.replace(/^本机全本：/, '全本 ')] : [])].join('；') || '—';
    L.push(`| ${n} | ${m.emoji} ${m.name} | ${d.title} | ${texts} | ${books} |`);
  }
  L.push('', '**月度回顾题**', '', ...p.month.map((q, i) => `${i + 1}. ${q}`), '');
});

L.push('## 十、燕国课与《燕云悲歌》章节对照', '');
L.push('| 天 | 课题 | 史料 | 对照章节与建议 |', '| --- | --- | --- | --- |');
Object.values(LIT.learn).filter(d => d.yan).sort((a, b) => a.d - b.d).forEach(d => {
  L.push(`| ${d.d} | ${d.title} | ${d.texts.map(id => LIT.texts[id].a).join('；')} | ${d.yan.replace(/\|/g, '／')} |`);
});
L.push('');

L.push('## 十一、每课经典一览', '');
L.push('每课「精读」都有一条经典：为什么经典、古人与近现代怎么用、今天怎么用（程序内有全文与例句）。', '');
L.push('| 天 | 类型 | 经典 | 出处 | 古人怎么用（举一例） |', '| --- | --- | --- | --- | --- |');
Object.keys(LIT.classics).map(Number).sort((a, b) => a - b).forEach(n => {
  const k = LIT.classics[n];
  L.push(`| ${n} | ${k.k} | ${k.item.replace(/\|/g, '／')} | ${k.src.replace(/\|/g, '／')} | ${(k.old[0][0] + '：' + k.old[0][1]).replace(/\|/g, '／')} |`);
});
L.push('');
L.push('## 十二、来源、版权与核验', '');
L.push('- 原文：本机 `~/Documents/书籍/文学/古籍下载/*.txt`（公版）与维基文库公有领域页面（原始 wikitext 存于 `lit-island/sources/wikisource/`，修订号与 SHA-256 见 `_ledger.tsv`）。每段原文在程序中标注来源文件、位置和校验值；`node tools/validate.js --check-sources` 可复核。');
L.push('- 繁转简：OpenCC 自动转换；人名与古义字（儁、暐、藉、玁）做了保护，来源原貌（繁体）在程序中可切换查看。');
L.push('- 现代注本只给 PDF 页码（PDF 阅读器页码），不摘抄。页码来源：PDF 书签（诗经注析、唐诗鉴赏辞典、宋词三百首笺注、花间集评注、红楼梦、东北丛书），或目录页＋偏移量并抽验（元人杂剧选＋26，已抽验；世说新语笺疏＋16，约数）。');
L.push('- 存疑处已在课文中标注（如北燕起始年 407／409、参合陂地望、"金城"所在、"佩刀"与"金刀"、《满江红》作者、《蝶恋花·庭院深深》作者、李煜死因等）。');
L.push('- 讲解、问题、测验为本项目原创撰写，未经专业学者审校；遇到与权威注本不一致处，以注本为准，并欢迎记入存疑台账。', '');

fs.writeFileSync(out, L.join('\n'));
console.log('已写出', out, L.length, '行');
