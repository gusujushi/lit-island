/* 单元测试：课程容器、排期、间隔复习、进度存储、原文转换。运行：node --test tests/ */
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadCourse, memStorage } = require('./helpers.js');
const Plan = require('../js/plan.js');
const SRS = require('../js/srs.js');
const Store = require('../js/store.js');

const LIT = loadCourse();

test('90 天：72 个学习日 + 18 个复习日，复习日覆盖前 4 天', () => {
  const all = LIT.all();
  assert.equal(all.length, 90);
  assert.equal(all.filter(d => d.type === 'learn').length, 72);
  assert.equal(all.filter(d => d.type === 'review').length, 18);
  assert.deepEqual(LIT.day(5).covers, [1, 2, 3, 4]);
  assert.deepEqual(LIT.day(90).covers, [86, 87, 88, 89]);
  assert.equal(LIT.day(30).month, true);
  assert.equal(LIT.day(25).month, false);
  assert.equal(LIT.phaseOf(31).id, 2);
});

test('卡片编号与内容', () => {
  const cs = LIT.cardsOf(1);
  assert.ok(cs.length >= 2);
  assert.equal(cs[0].id, 'd1c0');
  assert.equal(LIT.cardsOf(5).length, 0);
});

test('排期：全周连续排、只排工作日、重新排期', () => {
  const all = Plan.schedule({ total: 90, start: '2026-11-16', weekdays: [] });
  assert.equal(all.length, 90);
  assert.equal(all[0], '2026-11-16');
  assert.equal(all[89], Plan.addDays('2026-11-16', 89));
  const wk = Plan.schedule({ total: 90, start: '2026-11-14', weekdays: [1, 2, 3, 4, 5] }); // 11-14 是周六
  assert.equal(wk[0], '2026-11-16');
  assert.ok(wk.every(d => { const w = Plan.parse(d).getDay(); return w >= 1 && w <= 5; }));
  assert.equal(Plan.diff(wk[0], wk[89]), 123); // 第 18 周的周五：17×7+4
  const rb = Plan.schedule({ total: 90, start: '2026-11-16', weekdays: [], rebase: { from: 10, date: '2026-12-20' } });
  assert.equal(rb[8], '2026-11-24');
  assert.equal(rb[9], '2026-12-20');
  assert.equal(rb.length, 90);
});

test('排期状态：落后、超前、下一课、连续天数', () => {
  const dates = Plan.schedule({ total: 90, start: '2026-11-16', weekdays: [] });
  const done = new Set([1, 2]);
  const s = Plan.status(dates, n => done.has(n), '2026-11-20');
  assert.equal(s.next, 3);
  assert.equal(s.due, 5);
  assert.deepEqual(s.behind, [3, 4]);
  assert.deepEqual(s.todays, [5]);
  assert.equal(Plan.streak(['2026-11-18', '2026-11-19', '2026-11-20'], '2026-11-20'), 3);
  assert.equal(Plan.streak(['2026-11-18', '2026-11-19'], '2026-11-20'), 2);
  assert.equal(Plan.streak(['2026-11-17'], '2026-11-20'), 0);
});

test('间隔复习：升盒、回盒、减半', () => {
  let c = SRS.newCard('2026-11-16');
  assert.equal(c.due, '2026-11-17');
  c = SRS.grade(c, 2, '2026-11-17'); assert.equal(c.box, 2); assert.equal(c.due, '2026-11-19');
  c = SRS.grade(c, 3, '2026-11-19'); assert.equal(c.box, 4); assert.equal(c.due, '2026-11-27');
  const m = SRS.grade(c, 1, '2026-11-27'); assert.equal(m.box, 4); assert.equal(m.due, '2026-12-01');
  c = SRS.grade(c, 0, '2026-11-27'); assert.equal(c.box, 1); assert.equal(c.due, '2026-11-27'); assert.equal(c.wrong, 1);
  assert.deepEqual(SRS.dueList({ a: { due: '2026-11-20', box: 2 }, b: { due: '2026-11-19', box: 3 }, c: { due: '2026-12-01', box: 1 } }, '2026-11-20'), ['b', 'a']);
});

test('进度：完成学习日 → 卡片入盒、判断卡、时长记录；导出导入往返', () => {
  const mem = memStorage();
  const S = Store.create(mem);
  const rec = Store.dayRec(S.state, 3);
  rec.notes.retell = '女子自述相识、婚约、婚后、被弃、决断五段经历。';
  rec.notes.judge = '能看出来：婚前"将子无怒"已有急躁迹象，言行不一。';
  rec.rating = 2; rec.mode = 'deep';
  Store.completeDay(S.state, 3, '2026-11-18', LIT);
  S.save();
  assert.equal(S.state.days[3].done, '2026-11-18');
  assert.ok(S.state.cards.d3c0 && S.state.cards.d3j);
  assert.equal(S.state.log['2026-11-18'], 40);
  Store.completeDay(S.state, 3, '2026-11-19', LIT); // 重复完成不重复计时
  assert.equal(S.state.log['2026-11-19'], undefined);
  const judge = Store.cardContent(S.state, 'd3j', LIT);
  assert.equal(judge.kind, 'judge'); assert.match(judge.back, /将子无怒/);
  const md = Store.markdown(S.state, LIT, '2026-11-18');
  assert.match(md, /第 3 天 · 诗经 · 氓/); assert.match(md, /\*\*复述\*\*/); assert.match(md, /L2 有依据/);
  const S2 = Store.create(memStorage());
  S2.importJSON(S.exportJSON());
  assert.equal(S2.state.days[3].done, '2026-11-18');
  assert.throws(() => S2.importJSON('{"foo":1}'));
  const S3 = Store.create(mem); // 从存储重新读取
  assert.equal(S3.state.days[3].rating, 2);
});

test('进度：存储损坏或不可用时照常运行', () => {
  const bad = memStorage(); bad.setItem(Store.KEY, '{不是 JSON');
  const S = Store.create(bad);
  assert.equal(S.state.v, 1);
  const none = Store.create(null);
  assert.equal(none.save(), false);
  const thrower = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
  const T = Store.create(thrower);
  assert.equal(T.save(), false);
});

test('复习日完成与统计', () => {
  const S = Store.create(memStorage());
  const r = Store.revRec(S.state, 5); r.summary = '本轮最有用：区分文本与后人解读';
  Store.completeReview(S.state, 5, '2026-11-20');
  assert.ok(Store.isDone(S.state, 5));
  const d1 = Store.dayRec(S.state, 1); d1.rating = 3; d1.quiz = { 0: 0, 1: 1 }; d1.done = '2026-11-16';
  const st = Store.stats(S.state, LIT);
  assert.equal(st.shijing.done, 1); assert.equal(st.shijing.avg, 3); assert.equal(st.shijing.acc, 0.5);
  assert.equal(st.yan.total, 10);
});

test('原文：人名保护与来源字段', () => {
  assert.match(LIT.texts.jin_ke.simp, /慕容恪/);
  assert.match(LIT.texts.jin_ke.simp, /儁寝疾/);
  assert.doesNotMatch(LIT.texts.jin_ke.simp, /俊寝疾/);
  assert.match(LIT.texts.jin_fangtou.simp, /伐暐/);
  assert.match(LIT.texts.sj_caiwei.simp, /玁狁/);
  assert.match(LIT.texts.ss_xinting.simp, /藉卉/);
  Object.entries(LIT.texts).forEach(([id, t]) => {
    assert.ok(t.src && t.src.file && /^[0-9a-f]{64}$/.test(t.src.sha), id);
    assert.ok(!/[{}\[\]|=]{2}/.test(t.simp), `${id} 残留 wiki 标记`);
  });
});
