/* 间隔复习（莱特纳盒子，纯函数，UMD）。沿用意大利语能力岛的规则：
 * 盒子 1–6，间隔 1/2/4/8/16/32 天；评分 0 不会（回盒 1，今天再来）、1 模糊（原盒，间隔减半）、
 * 2 记得（升一盒）、3 很熟（升两盒）。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SRS = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const INTERVALS = [0, 1, 2, 4, 8, 16, 32];
  const MAX_BOX = 6;
  const pad = n => (n < 10 ? '0' : '') + n;
  const addDays = (s, k) => { const [y, m, d] = s.split('-').map(Number); const x = new Date(y, m - 1, d + k); return x.getFullYear() + '-' + pad(x.getMonth() + 1) + '-' + pad(x.getDate()); };

  const newCard = today => ({ box: 1, due: addDays(today, 1), seen: 0, wrong: 0, last: today });

  function grade(card, rating, today) {
    const c = Object.assign({}, card);
    c.seen = (c.seen || 0) + 1;
    c.last = today;
    if (rating <= 0) { c.box = 1; c.due = today; c.wrong = (c.wrong || 0) + 1; }
    else if (rating === 1) { c.due = addDays(today, Math.max(1, Math.floor(INTERVALS[c.box] / 2))); }
    else { c.box = Math.min(MAX_BOX, c.box + (rating >= 3 ? 2 : 1)); c.due = addDays(today, INTERVALS[c.box]); }
    return c;
  }

  function dueList(cards, today, limit) {
    const ids = Object.keys(cards).filter(id => cards[id].due <= today);
    ids.sort((a, b) => (cards[a].due < cards[b].due ? -1 : cards[a].due > cards[b].due ? 1 : cards[a].box - cards[b].box));
    return limit ? ids.slice(0, limit) : ids;
  }

  return { INTERVALS, MAX_BOX, addDays, newCard, grade, dueList };
});
