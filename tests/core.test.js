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

test('每课经典：72 条，完成当天生成经典用法卡，笔记导出含造句', () => {
  assert.equal(Object.keys(LIT.classics).length, 72);
  const S = Store.create(memStorage());
  const r = Store.dayRec(S.state, 2); r.notes.retell = '在水一方，可望不可即的追寻。'; r.notes.classic = '那个目标一直在水一方。'; r.rating = 1;
  Store.completeDay(S.state, 2, '2026-11-20', LIT);
  assert.ok(S.state.cards.d2k);
  const c = Store.cardContent(S.state, 'd2k', LIT);
  assert.equal(c.kind, 'classic'); assert.match(c.front, /在水一方/);
  assert.match(Store.markdown(S.state, LIT, '2026-11-20'), /用经典造句/);
});

test('注本图包：解析不压缩的 zip', () => {
  const Pages = require('../js/pages.js');
  const { execFileSync } = require('child_process');
  const os = require('os'), fs = require('fs'), path = require('path');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'litzip-'));
  const zp = path.join(tmp, 't.zip');
  execFileSync('python3', ['-I', '-c', `import zipfile,json\nz=zipfile.ZipFile(${JSON.stringify(zp)},'w',zipfile.ZIP_STORED)\nz.writestr('manifest.json',json.dumps({'app':'lit-island','refs':{'sglc:398':['sglc_0398.jpg']}}))\nz.writestr('sglc_0398.jpg',b'JPEGDATA')\nz.close()`]);
  const buf = fs.readFileSync(zp);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const files = Pages.unzip(ab);
  assert.deepEqual(files.map(f => f.name), ['manifest.json', 'sglc_0398.jpg']);
  assert.equal(files.every(f => f.method === 0), true);
  assert.equal(Buffer.from(files[1].data).toString(), 'JPEGDATA');
  assert.equal(JSON.parse(Buffer.from(files[0].data).toString()).refs['sglc:398'][0], 'sglc_0398.jpg');
  assert.throws(() => Pages.unzip(new ArrayBuffer(10)));
});

test('语音输入文字整理：繁转简（保护字不动）、去幻觉套话、空格变逗号、补句号', () => {
  const ZH = require('../js/zh.js');
  assert.equal(ZH.t2s('關關雎鳩'), '关关雎鸠');
  assert.equal(ZH.t2s('慕容儁', ZH.PROTECT), '慕容儁');
  assert.equal(ZH.cleanDictation('我認為這是 起興的手法 字幕由Amara.org社区提供'), '我认为这是，起兴的手法。');
  assert.equal(ZH.cleanDictation('請不吝點贊 訂閱 轉發 打賞支持明鏡與點點欄目'), '');
  assert.equal(ZH.cleanDictation('你好,世界?'), '你好，世界？');
  assert.equal(ZH.cleanDictation('我认为，这是求爱诗。谢谢观看'), '我认为，这是求爱诗。');
  assert.equal(ZH.cleanDictation(''), '');
  assert.deepEqual(ZH.insertAt('前文', 2, '新内容。'), { value: '前文，新内容。', start: 3, end: 7 });
  assert.equal(ZH.insertAt('前文。后文', 3, '插入。').value, '前文。插入。后文');
  assert.equal(ZH.insertAt('', null, '甲。').value, '甲。');
  // DeepSeek 校对结果的可信度：改错字可以，答非所问、整段改写不行
  assert.equal(ZH.polishOk('我认为冠军首先是一首球艾诗', '我认为《关雎》首先是一首求爱诗。'), true);
  assert.equal(ZH.polishOk('我认为冠军首先是一首球艾诗', '好的，下面是校对后的文本：我认为关雎首先是一首求爱诗，这首诗描写了君子对淑女的思慕和追求，体现了先秦礼乐文化的特点'), false);
  assert.equal(ZH.polishOk('一首求爱诗', ''), false);
});

test('录音处理：重采样到 16 kHz、有没有说话、长录音切段', () => {
  const A = require('../js/audio.js');
  const sr = 48000, n = sr * 2, x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = 0.3 * Math.sin(2 * Math.PI * 220 * i / sr);
  const y = A.resample(x, sr, 16000);
  assert.equal(y.length, 32000);
  const up = A.resample(new Float32Array(8000), 8000, 16000);
  assert.equal(up.length, 16000);
  assert.equal(A.stats(y).quiet, false);
  assert.equal(A.stats(new Float32Array(16000)).quiet, true);
  // 70 秒：每 10 秒里有 1 秒静音 → 切成 ≤ 28 秒的段，切点落在静音里
  const L = 16000 * 70, z = new Float32Array(L);
  for (let i = 0; i < L; i++) { const t = i / 16000; z[i] = (t % 10) > 9 ? 0 : 0.3 * Math.sin(2 * Math.PI * 200 * t); }
  const parts = A.split(z, 28, 15);
  assert.ok(parts.length >= 3);
  assert.equal(parts.reduce((s, p) => s + p.length, 0), L);
  parts.forEach(p => assert.ok(p.length <= 28 * 16000));
  parts.slice(0, -1).forEach(p => assert.ok(Math.abs(p[p.length - 1]) < 1e-6, '切点在静音处'));
  assert.equal(A.split(new Float32Array(16000 * 5)).length, 1);
});

test('AI 提示词：校对带本课背景、点评带量规且跳过空题、不发送多余内容', () => {
  const AI = require('../js/ai.js');
  const P = AI.prompts;
  const d = LIT.learn[1];
  const m = P.polishMessages('我认为冠军是求爱诗', { day: 1, title: d.title, question: d.judge, texts: [{ t: '关雎', a: '诗经', text: LIT.texts.sj_guanju.simp }], words: ['雎鸠'] });
  assert.equal(m.length, 1);
  assert.match(m[0].content, /关关雎鸠/);
  assert.match(m[0].content, /【语音转写，请校对】\n我认为冠军是求爱诗$/);
  assert.match(P.POLISH, /不要改写/);
  const r = P.reviewMessages({ day: 1, title: d.title, ask: d.ask, keys: d.keys, items: [[d.retell, '雎鸠和鸣起兴，求之不得。'], [d.judge, ''], [d.link, '  ']], rubric: LIT.meta.rubric });
  assert.match(r[0].content, /L3/);
  assert.match(r[0].content, /雎鸠和鸣起兴/);
  assert.equal((r[0].content.match(/【题目】/g) || []).length, 1, '空题不发');
  assert.match(P.SYSTEM, /不要编造引文/);
  const e = P.explainMessages({ day: 1, title: d.title, t: '长文', a: '', text: '字'.repeat(5000) });
  assert.ok(e[0].content.length < 2200, '原文截断');
  assert.equal(AI.validBase('http://example.com'), false);
  assert.equal(AI.validBase('https://api.deepseek.com'), true);
  assert.equal(AI.validBase('http://127.0.0.1:8080'), true);
});
