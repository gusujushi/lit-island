/* 课程数据容器（UMD：浏览器里是全局 LIT，Node 里可 require 测试）。
 * data/*.js 通过 LIT.setMeta / LIT.addTexts / LIT.addDays 注册内容；
 * LIT.day(n) 返回第 n 天（学习日为作者撰写的条目，复习日由程序生成）。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LIT = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const ROUND = 5;
  const L = {
    ROUND,
    meta: null,
    texts: {},
    learn: {},
    local: null,
    setMeta(m) { L.meta = m; },
    addTexts(t) { Object.assign(L.texts, t); },
    addDays(list) { list.forEach(d => { L.learn[d.d] = d; }); },
    classics: {},
    setLocalBooks(x) { L.local = x; },
    addClassics(o) { Object.assign(L.classics, o); },
    // 书库（data/lib/）：index 随外壳加载；每本书的原文与讲解按需加载
    lib: { eras: [], books: [], units: {} },
    libText: {},
    libNotes: {},
    setLib(x) { L.lib = x; },
    addLibText(o) { Object.assign(L.libText, o); },
    addLibNotes(o) { Object.assign(L.libNotes, o); },
  };

  /** 书库单元的原文段（已加载的才有） */
  L.unitTexts = id => { const u = L.lib.units[id]; if (!u) return []; const out = []; for (let i = 1; i <= u.n; i++) { const t = L.libText[id + '#' + i]; if (t) out.push(t); } return out; };
  L.bookOf = id => { const u = L.lib.units[id]; return u ? L.lib.books.find(b => b.id === u.b) : null; };

  L.total = () => (L.meta && L.meta.total) || 90;
  L.isReview = n => n % ROUND === 0;
  L.phaseOf = n => (L.meta.phases.find(p => n >= p.days[0] && n <= p.days[1]) || L.meta.phases[0]);

  /** 某复习日覆盖的学习日：上一个复习日之后到本日之前 */
  L.roundDays = n => {
    const out = [];
    for (let k = n - ROUND + 1; k < n; k++) if (k >= 1 && !L.isReview(k) && L.learn[k]) out.push(k);
    return out;
  };

  L.day = n => {
    if (L.isReview(n)) {
      const phase = L.phaseOf(n);
      const month = n % 30 === 0;
      return {
        d: n, type: 'review', mod: 'review', month, phase: phase.id,
        title: month ? `月度回顾：${phase.name}（第 ${phase.id} 月）` : `复习日：第 ${n - 4}–${n - 1} 天`,
        covers: L.roundDays(n),
      };
    }
    const d = L.learn[n];
    return d ? Object.assign({ type: 'learn' }, d) : null;
  };

  L.all = () => { const a = []; for (let n = 1; n <= L.total(); n++) a.push(L.day(n)); return a; };

  /** 一天所有卡片：[{id, front, back, d}] */
  L.cardsOf = n => {
    const d = L.learn[n];
    if (!d || !d.cards) return [];
    return d.cards.map((c, i) => ({ id: `d${n}c${i}`, front: c[0], back: c[1], d: n }));
  };

  /** 本机书目：返回 {name, page, what, path|null} */
  L.bookRef = ref => {
    const [key, page, what] = ref;
    const b = (L.meta.books || {})[key] || { name: key };
    let path = null;
    if (L.local && L.local.files && L.local.files[key]) path = L.local.dir.replace(/\/$/, '') + '/' + L.local.files[key];
    return { key, name: b.name, by: b.by, how: b.how, page, what, path };
  };

  return L;
});
