/* 排期引擎（纯函数，UMD）。
 * 90 个学习单元按顺序排在日历上：从开始日期起，只占用"每周学习日"勾选的那几天。
 * 学习者可以随时"从今天重新排期"：rebase = {from: 第几天, date: 新起点日期}，
 * 第 from 天及之后的单元从新起点重新排，之前的保持原日期。没有锁：任何一天都可以提前学。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Plan = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const pad = n => (n < 10 ? '0' : '') + n;
  const fmt = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const parse = s => { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (s, k) => { const x = parse(s); x.setDate(x.getDate() + k); return fmt(x); };
  const diff = (a, b) => Math.round((parse(b) - parse(a)) / 86400000);
  const today = () => fmt(new Date());
  /* weekdays：0=周日…6=周六；空数组视为全周 */
  const normWeek = w => (Array.isArray(w) && w.length ? w : [0, 1, 2, 3, 4, 5, 6]);

  /** 从 date 起（含当天）按 weekdays 排 count 个日期 */
  function lay(date, count, weekdays) {
    const w = normWeek(weekdays), out = [];
    let cur = date, guard = 0;
    while (out.length < count && guard < 4000) {
      if (w.includes(parse(cur).getDay())) out.push(cur);
      cur = addDays(cur, 1); guard++;
    }
    return out;
  }

  /** 返回长度为 total 的数组：第 n 天（下标 n-1）计划日期 */
  function schedule(opts) {
    const total = opts.total || 90;
    const start = opts.start || today();
    let dates = lay(start, total, opts.weekdays);
    const rb = opts.rebase;
    if (rb && rb.from >= 1 && rb.from <= total && rb.date) {
      const tail = lay(rb.date, total - rb.from + 1, opts.weekdays);
      dates = dates.slice(0, rb.from - 1).concat(tail);
    }
    return dates;
  }

  /** 进度概览。done(n)→bool */
  function status(dates, done, now) {
    now = now || today();
    let due = 0, doneCount = 0, behind = [], todays = [], next = null;
    dates.forEach((dt, i) => {
      const n = i + 1, ok = done(n);
      if (ok) doneCount++;
      if (dt <= now) due++;
      if (dt < now && !ok) behind.push(n);
      if (dt === now) todays.push(n);
      if (!ok && next === null) next = n;
    });
    return { due, doneCount, behind, todays, next, ahead: Math.max(0, doneCount - due) };
  }

  /** 连续学习天数：以今天或昨天为结尾的连续日期段长度 */
  function streak(doneDates, now) {
    now = now || today();
    const set = new Set(doneDates);
    let cur = set.has(now) ? now : addDays(now, -1), k = 0;
    while (set.has(cur)) { k++; cur = addDays(cur, -1); }
    return k;
  }

  return { fmt, parse, addDays, diff, today, lay, schedule, status, streak, normWeek };
});
