/* 学习进度与笔记（UMD）。数据只存在本机浏览器 localStorage；可导出 JSON 备份、导出 Markdown 笔记。
 * 读写一律 try/catch：隐私模式或存储被禁用时程序照常运行，只是不保存。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./srs.js'));
  else root.Store = factory(root.SRS);
})(typeof self !== 'undefined' ? self : this, function (SRS) {
  'use strict';
  const KEY = 'lit-island-v1';
  const MODE_MIN = { light: 15, std: 25, deep: 40 };

  const blank = () => ({
    v: 1,
    settings: { start: null, weekdays: [0, 1, 2, 3, 4, 5, 6], mode: 'std', script: 'simp', tts: 0.85, theme: 'auto', font: 1 },
    rebase: null,
    days: {},
    reviews: {},
    cards: {},
    log: {},
  });

  function merge(base, x) {
    if (!x || typeof x !== 'object') return base;
    const out = Object.assign(base, x);
    out.settings = Object.assign(blank().settings, x.settings || {});
    ['days', 'reviews', 'cards', 'log'].forEach(k => { if (!out[k] || typeof out[k] !== 'object') out[k] = {}; });
    return out;
  }

  function create(storage) {
    let state = blank();
    try { const raw = storage && storage.getItem(KEY); if (raw) state = merge(blank(), JSON.parse(raw)); } catch (e) { /* 读不到就用空进度 */ }
    const api = {
      get state() { return state; },
      save() { if (!storage) return false; try { storage.setItem(KEY, JSON.stringify(state)); return true; } catch (e) { return false; } },
      reset() { state = blank(); api.save(); },
      exportJSON() { return JSON.stringify(state, null, 1); },
      importJSON(str) {
        const x = JSON.parse(str);
        if (!x || x.v !== 1 || typeof x.days !== 'object') throw new Error('不是文学能力岛的备份文件');
        state = merge(blank(), x); api.save();
      },
    };
    return api;
  }

  const dayRec = (state, n) => (state.days[n] = state.days[n] || { notes: {}, quiz: {}, read: {} });
  const revRec = (state, n) => (state.reviews[n] = state.reviews[n] || { recall: {}, rate: {}, revise: {}, month: {} });
  const isDone = (state, n) => !!((state.days[n] && state.days[n].done) || (state.reviews[n] && state.reviews[n].done));

  /** 学习日完成：写完成日期、记学习时长、把本日卡片和"我的判断卡"放进复习盒 */
  function completeDay(state, n, today, LIT) {
    const r = dayRec(state, n);
    const first = !r.done;
    r.done = r.done || today;
    if (first) state.log[today] = (state.log[today] || 0) + (MODE_MIN[r.mode || state.settings.mode] || 25);
    LIT.cardsOf(n).forEach(c => { if (!state.cards[c.id]) state.cards[c.id] = SRS.newCard(today); });
    if (r.notes && r.notes.judge && r.notes.judge.trim().length >= 10 && !state.cards[`d${n}j`]) state.cards[`d${n}j`] = SRS.newCard(today);
    return r;
  }

  function completeReview(state, n, today) {
    const r = revRec(state, n);
    if (!r.done) state.log[today] = (state.log[today] || 0) + 25;
    r.done = r.done || today;
    return r;
  }

  /** 卡片内容：学习卡来自课程数据；判断卡来自学习者自己的回答 */
  function cardContent(state, id, LIT) {
    let m = /^d(\d+)c(\d+)$/.exec(id);
    if (m) { const d = LIT.learn[+m[1]]; const c = d && d.cards && d.cards[+m[2]]; return c ? { kind: 'card', d: +m[1], front: c[0], back: c[1] } : null; }
    m = /^d(\d+)j$/.exec(id);
    if (m) {
      const n = +m[1], d = LIT.learn[n], rec = state.days[n];
      if (!d || !rec || !rec.notes || !rec.notes.judge) return null;
      return { kind: 'judge', d: n, front: `第 ${n} 天判断题：${d.judge}`, back: rec.notes.judge };
    }
    return null;
  }

  /** 每个模块的统计：完成数、平均自评、测验正确率 */
  function stats(state, LIT) {
    const out = {};
    Object.keys(LIT.meta.modules).forEach(k => { out[k] = { total: 0, done: 0, ratingSum: 0, rated: 0, right: 0, answered: 0 }; });
    Object.values(LIT.learn).forEach(d => {
      const s = out[d.mod]; if (!s) return;
      s.total++;
      const r = state.days[d.d]; if (!r) return;
      if (r.done) s.done++;
      if (typeof r.rating === 'number') { s.ratingSum += r.rating; s.rated++; }
      (d.quiz || []).forEach((q, i) => { if (r.quiz && r.quiz[i] !== undefined) { s.answered++; if (r.quiz[i] === 0) s.right++; } });
    });
    Object.values(out).forEach(s => { s.avg = s.rated ? s.ratingSum / s.rated : null; s.acc = s.answered ? s.right / s.answered : null; });
    return out;
  }

  const md = s => String(s || '').trim();
  /** 笔记导出为 Markdown：按天排列，只导出有内容的部分 */
  function markdown(state, LIT, todayStr) {
    const lines = [`# 文学能力岛 · 学习笔记`, '', `导出日期：${todayStr || ''}`, ''];
    const R = LIT.meta.rubric;
    for (let n = 1; n <= LIT.total(); n++) {
      const d = LIT.day(n);
      if (!d) continue;
      if (d.type === 'learn') {
        const r = state.days[n]; if (!r) continue;
        const nt = r.notes || {};
        const has = ['ask', 'retell', 'judge', 'link', 'out'].some(k => md(nt[k])) || typeof r.rating === 'number';
        if (!has) continue;
        const mod = LIT.meta.modules[d.mod] || { name: d.mod };
        lines.push(`## 第 ${n} 天 · ${mod.name} · ${d.title}`, '');
        if (r.done) lines.push(`完成：${r.done}${typeof r.rating === 'number' ? `　自评：L${r.rating} ${R[r.rating].name}` : ''}`, '');
        lines.push(`原文：${(d.texts || []).map(id => (LIT.texts[id] ? `${LIT.texts[id].a}《${LIT.texts[id].t}》` : id)).join('、')}`, '');
        const sec = [['ask', '读前猜想', d.ask], ['retell', '复述', d.retell], ['judge', '判断', d.judge], ['link', '对照', d.link], ['out', '输出', d.out]];
        sec.forEach(([k, name, prompt]) => { if (md(nt[k])) lines.push(`**${name}**　_${prompt}_`, '', md(nt[k]), ''); });
      } else {
        const r = state.reviews[n]; if (!r) continue;
        const parts = [];
        Object.keys(r.recall || {}).forEach(k => { if (md(r.recall[k])) parts.push(`- 第 ${k} 天再复述：${md(r.recall[k])}`); });
        Object.keys(r.revise || {}).forEach(k => { if (md(r.revise[k])) parts.push(`- 第 ${k} 天判断修正：${md(r.revise[k])}`); });
        Object.keys(r.month || {}).forEach(k => { if (md(r.month[k])) parts.push(`- 月度第 ${+k + 1} 题：${md(r.month[k])}`); });
        if (md(r.summary)) parts.push(`- 本轮一句话：${md(r.summary)}`);
        if (!parts.length) continue;
        lines.push(`## 第 ${n} 天 · ${d.title}`, '', ...parts, '');
      }
    }
    return lines.join('\n');
  }

  return { KEY, MODE_MIN, blank, create, dayRec, revRec, isDone, completeDay, completeReview, cardContent, stats, markdown };
});
