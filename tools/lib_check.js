/* 书库校验（被 tools/validate.js 调用）：规范见 docs/LIB_FORMAT.md 第三、四节。
 * 查：选篇都已抽出原文、都有讲解；讲解字数与数量下限；名句是原文连续字串；字词条目在原文中；
 * 小测与卡片格式；简体；不点名现代注本作者；不与主线原文、不与其他单元重复（连续 40 字）。 */
const fs = require('fs');
const path = require('path');
const ZH = require('../js/zh.js');

const ROOT = path.join(__dirname, '..');
const han = s => (String(s || '').match(/[㐀-鿿]/g) || []).length;
const squash = s => String(s || '').replace(/[\s　]/g, '');
// 繁简转换表会改、但在简体里照常使用的字
const SIMP_OK = new Set(Array.from('乾著徵瞭藉儁暐玁夥兒鬥祇隻甦襬濛'));
// 现代注本与研究著作的作者：讲解里不点名（docs/LIB_FORMAT.md 写作纪律 1）
const SCHOLARS = ['程俊英', '蒋见元', '唐圭璋', '萧涤非', '余嘉锡', '袁行霈', '叶嘉莹', '王仲闻', '张友鹤', '陈寅恪', '田余庆', '谭其骧', '顾学颉', '李冰若', '万绳楠', '赵红梅', '田立坤'];
const SHINGLE = 40;

function strings(v, out = []) {
  if (typeof v === 'string') out.push(v);
  else if (Array.isArray(v)) v.forEach(x => strings(x, out));
  else if (v && typeof v === 'object') Object.values(v).forEach(x => strings(x, out));
  return out;
}

function checkLib(L, opts) {
  opts = opts || {};
  const errs = [], warns = [];
  const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/lib_books.json'), 'utf8'));
  const only = opts.book || null;
  if (only && !cfg.books.some(b => b.id === only)) { errs.push(`书号 ${only} 不在 tools/lib_books.json`); return { errs, warns }; }

  // 主线原文的 40 字片段
  const mainSh = new Set();
  Object.values(L.texts).forEach(t => { const s = squash(t.simp); for (let i = 0; i + SHINGLE <= s.length; i++) mainSh.add(s.slice(i, i + SHINGLE)); });
  const libSh = new Map();   // 片段 → 单元
  const dupPairs = new Set();

  for (const b of cfg.books) {
    const sp = path.join(ROOT, 'tools/lib_spec', b.id + '.json');
    if (!fs.existsSync(sp)) { if (only === b.id) errs.push(`${b.id}: 还没有 tools/lib_spec/${b.id}.json`); continue; }
    let spec;
    try { spec = JSON.parse(fs.readFileSync(sp, 'utf8')); } catch (e) { errs.push(`${b.id}: spec JSON 错误`); continue; }
    const mine = !only || only === b.id;
    // 讲解直接读 tools/lib_notes/<书号>/*.json（不依赖组装产物，撰写者并行工作时互不干扰）
    const notes = {};
    const nd = path.join(ROOT, 'tools/lib_notes', b.id);
    if (mine && fs.existsSync(nd)) {
      for (const f of fs.readdirSync(nd).filter(f => f.endsWith('.json')).sort()) {
        try { Object.assign(notes, JSON.parse(fs.readFileSync(path.join(nd, f), 'utf8'))); } catch (e) { errs.push(`${b.id}/${f}: JSON 错误：${e.message}`); }
      }
      const ids = new Set((spec.units || []).map(u => u.id));
      Object.keys(notes).forEach(k => { if (!ids.has(k)) errs.push(`${b.id}: 讲解里的 ${k} 不在选篇 spec 里`); });
    }
    for (const u of spec.units || []) {
      const id = u.id;
      const np = (u.passages || []).length;
      const texts = []; for (let i = 1; i <= np; i++) if (L.libText[`${id}#${i}`]) texts.push(L.libText[`${id}#${i}`]);
      // 重复检查对所有书都做（别人的书也要算进片段表），报错只报本书
      const body = squash(texts.map(t => t.simp).join(''));
      for (let i = 0; i + SHINGLE <= body.length; i++) {
        const sh = body.slice(i, i + SHINGLE);
        if (mainSh.has(sh) && mine) { errs.push(`${id}: 原文与主线原文重复（「${sh.slice(0, 12)}…」）`); break; }
        const other = libSh.get(sh);
        if (other && other !== id) { const k = [other, id].sort().join('|'); if (!dupPairs.has(k) && mine) { dupPairs.add(k); errs.push(`${id}: 原文与 ${other} 重复（「${sh.slice(0, 12)}…」）`); } }
        else if (!other) libSh.set(sh, id);
      }
      if (!mine) continue;
      if (!np || texts.length !== np) { errs.push(`${id}: 原文没有全部抽出（运行 .venv/bin/python tools/extract_lib.py --book ${b.id}）`); continue; }
      const n = notes[id];
      if (!n) { warns.push(`${id}: 还没有讲解（撰写中，不进程序目录）`); continue; }
      const raw = squash(texts.map(t => t.simp).join('\n'));
      const bad = m => errs.push(`${id}: ${m}`);
      if (han(n.intro) < 60) bad(`intro 只有 ${han(n.intro)} 字（≥60）`);
      if (!Array.isArray(n.focus) || n.focus.length < 2 || n.focus.length > 3) bad('focus 应为 2–3 条');
      else n.focus.forEach((f, i) => { if (han(f) < 40) bad(`focus 第 ${i + 1} 条只有 ${han(f)} 字（≥40）`); });
      if (!Array.isArray(n.notes) || n.notes.length < 8) bad(`notes 只有 ${(n.notes || []).length} 条（≥8）`);
      else n.notes.forEach(w => {
        if (!Array.isArray(w) || w.length !== 2 || !String(w[0]).trim() || !String(w[1]).trim()) bad(`notes 条目格式不对：${JSON.stringify(w)}`);
        else if (!raw.includes(squash(w[0]))) bad(`字词「${w[0]}」不在原文里`);
      });
      if (!Array.isArray(n.think) || n.think.length !== 2 || han(n.think[1]) < 30) bad('think 应为 [思考题, 参考思路≥30字]');
      if (!Array.isArray(n.quiz) || n.quiz.length < 2) bad(`quiz 只有 ${(n.quiz || []).length} 道（≥2）`);
      else n.quiz.forEach((q, i) => {
        const ok = Array.isArray(q) && q.length === 3 && String(q[0]).trim() && Array.isArray(q[1]) && q[1].length >= 3 && q[1].every(o => String(o).trim()) && new Set(q[1].map(String)).size === q[1].length && String(q[2]).trim();
        if (!ok) bad(`quiz 第 ${i + 1} 道格式不对（[题干, [正确, 干扰, 干扰], 解析]，选项不能重复）`);
      });
      if (!Array.isArray(n.cards) || n.cards.length < 2 || !n.cards.every(c => Array.isArray(c) && c.length === 2 && String(c[0]).trim() && String(c[1]).trim())) bad('cards 应为 ≥2 张 [正面, 背面]');
      if (!Array.isArray(n.line) || n.line.length !== 2) bad('line 应为 [名句, 用法例句]');
      else {
        const ln = squash(n.line[0]);
        if (!raw.includes(ln)) bad(`名句「${n.line[0]}」不是原文里的连续字串`);
        if (han(n.line[0]) < 4 || han(n.line[0]) > 40) bad(`名句应为 4–40 字（现 ${han(n.line[0])}）`);
        if (han(n.line[1]) < 10) bad('用法例句太短');
      }
      if (!Array.isArray(n.tags) || n.tags.length < 1 || n.tags.length > 4) bad('tags 应为 1–4 个');
      const all = strings(n).join('\n');
      const trad = Array.from(new Set(Array.from(all).filter(c => /[㐀-鿿]/.test(c) && !SIMP_OK.has(c) && ZH.t2s(c) !== c)));
      if (trad.length) bad(`讲解里有繁体字：${trad.slice(0, 10).join('')}`);
      const who = SCHOLARS.filter(s => all.includes(s));
      if (who.length) bad(`讲解点名了现代注本作者：${who.join('、')}（不摘抄、不点名转述）`);
      if (/让我们|总之，|值得一提的是/.test(all)) warns.push(`${id}: 有套话（让我们／总之／值得一提的是）`);
    }
  }
  return { errs, warns };
}

module.exports = { checkLib, han, squash };
