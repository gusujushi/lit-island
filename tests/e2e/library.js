/* 端到端（真实浏览器，手机视口）：书库。
 * 书架 → 书页 → 单元（原文、导读、小测、学完）→ 设为我的路线（今日显示）→ 卡片复习（书库卡）→ 导出 Markdown（书库一节）→ 主线精读的"书库延伸"。
 * 用法：PW=<playwright 路径> node tests/e2e/library.js [截图目录]
 * 依赖：已运行 node tools/build_lib.js（书库目录与讲解是生成物）。 */
const path = require('path');
const fs = require('fs');
const { chromium } = require(process.env.PW || 'playwright');
const { serve } = require('./serve.js');

const BOOK = 'honglou';
const UNIT = 'honglou_zanghua';
let fails = 0, checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) { fails++; console.log('✗', msg); } else console.log('✓', msg); };

(async () => {
  const shots = process.argv[2] || null;
  const srv = await serve({});
  const base = `http://127.0.0.1:${srv.address().port}/lit-island/`;
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error' && !/books-local\.js/.test(m.text())) errors.push(m.text()); });
  const shot = async n => { if (shots) await page.screenshot({ path: path.join(shots, n + '.png'), fullPage: false }); };

  await page.goto(base + 'index.html');
  await page.click('text=开始第 1 天');
  await page.waitForSelector('.steps');

  // 1. 书库首页：书架按时代分组，有进度条
  await page.click('#bottom a[href="#/lib"]');
  await page.waitForSelector('.shelf .book');
  const books = await page.$$eval('.shelf .book', els => els.length);
  ok(books >= 6, `书架有 ${books} 本书`);
  ok((await page.$$eval('h2.era', els => els.length)) >= 3, '书架按时代分组');
  const q = await page.$$eval('.shelf .book b', els => els.map(e => e.textContent));
  ok(q.some(x => x.includes('红楼梦')), '书架含红楼梦');
  await shot('lib_home');

  // 搜索（输入即过滤）
  await page.fill('#lib-q', '葬花');
  await page.waitForSelector('.hits a');
  ok((await page.textContent('.hits')).includes('黛玉葬花'), '搜索"葬花"命中黛玉葬花');
  await page.fill('#lib-q', '');

  // 2. 书页：导读卡、目录、设为路线
  await page.goto(base + `index.html#/lib/${BOOK}`);
  await page.waitForSelector('.units li');
  ok((await page.$$eval('.units li', els => els.length)) >= 20, '书页目录至少 20 篇');
  ok(await page.isVisible(`.units a[href="#/u/${UNIT}"]`), '目录含黛玉葬花');
  ok(await page.isVisible(`button[data-act="routeset"][data-book="${BOOK}"]`), '书页有"设为我的路线"');

  // 3. 单元页：原文（诗歌不留空行）、导读、重点分析、字词、名句、思考、小测、学完
  await page.goto(base + `index.html#/u/${UNIT}`);
  await page.waitForSelector('.unithead .kicker, .unithead h1');
  ok((await page.textContent('.unithead h1')).includes('黛玉葬花'), '单元标题');
  ok((await page.$$eval('.card.text .poem', els => els.length)) === 2, '两段原文');
  const verseLines = await page.$$eval('.card.text .poem', els => els[0].innerText.split('\n').filter(x => x.trim()).length);
  ok(verseLines > 0 && verseLines < 40, `诗歌行间不留空行（${verseLines} 行）`);
  ok((await page.textContent('.stepbody')).includes('重点分析'), '有重点分析');
  ok(await page.isVisible('.gloss'), '有字词表');
  ok((await page.textContent('.lineCard')).includes('怎么用'), '名句卡含用法例句');
  ok(await page.isVisible('textarea[data-bind="lib:' + UNIT + ':think"]'), '思考框可写');
  ok(!(await page.isVisible('.ai')), '没填 Key 时不显示 AI 按钮');
  await shot('lib_unit');

  // 小测：答一题，显示解析
  await page.click('button[data-act="lquiz"] >> nth=0');
  ok((await page.$$eval('.why', els => els.length)) >= 1, '小测：答后显示解析');
  // 思考写几个字（语音框与普通输入框一样保存）
  await page.fill(`textarea[data-bind="lib:${UNIT}:think"]`, '葬花既是黛玉的自悼，也是宝玉对一切美好散尽的体认。');
  await page.waitForTimeout(400);

  // 4. 学完：本篇卡片入盒，只计一次时长
  await page.click('button[data-act="unitdone"]');
  await page.waitForSelector('.card.done');
  const cards1 = await page.evaluate(() => Object.keys(window.__lit.S.state.cards).filter(k => k.startsWith('L:')));
  ok(cards1.includes(`L:${UNIT}:0`) && cards1.includes(`L:${UNIT}:k`), '学完后卡片入盒');
  const mins = await page.evaluate(() => window.__lit.S.state.log[Object.keys(window.__lit.S.state.lib).length ? window.__lit.S.state.lib['honglou_zanghua'].done : ''] || 0);
  ok(mins === 15, `学完记 15 分钟（实际 ${mins}）`);
  await page.reload();
  ok(await page.isVisible('.card.done'), '刷新后仍显示已学完');

  // 5. 设为我的路线：今日页显示路线卡片
  await page.goto(base + `index.html#/lib/${BOOK}`);
  await page.click(`button[data-act="routeset"][data-book="${BOOK}"]`);
  await page.waitForSelector('button[data-act="routeoff"]');
  ok((await page.textContent('.bookhead')).includes('这是我的路线'), '书页标明"这是我的路线"');
  await page.goto(base + 'index.html#/lib');
  await page.waitForSelector('.shelf .book');
  ok(await page.isVisible('.book .rt'), '书架上标出"我的路线"');
  await page.goto(base + 'index.html#/today');
  await page.waitForSelector('.card.route');
  const rt = await page.textContent('.card.route');
  ok(rt.includes('我的路线') && rt.includes('红楼梦'), '今日页显示路线卡片（红楼梦）');
  await shot('lib_today_route');

  // 6. 卡片复习：把书库卡改成今天到期，看到"来自书库"
  await page.evaluate(() => {
    const S = window.__lit.S, t = new Date(), p = n => (n < 10 ? '0' : '') + n;
    const d = t.getFullYear() + '-' + p(t.getMonth() + 1) + '-' + p(t.getDate());
    Object.keys(S.state.cards).filter(k => k.startsWith('L:')).forEach(k => { S.state.cards[k].due = d; });
    S.save();
  });
  await page.goto(base + 'index.html#/cards');
  await page.waitForSelector('.flash');
  ok((await page.textContent('.flash .kicker')).includes('来自书库'), '卡片：书库卡标明来源');
  await page.click('button[data-act="flip"]');
  ok((await page.textContent('.flash .back')).length > 2, '卡片：翻面看到答案');

  // 7. 导出 Markdown：书库一节
  await page.goto(base + 'index.html#/notes');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('button[data-act="exportmd"]')]);
  const md = fs.readFileSync(await dl.path(), 'utf8');
  ok(md.includes('# 书库') && md.includes('黛玉葬花') && md.includes('葬花既是黛玉的自悼'), '导出 Markdown 含书库一节与思考');

  // 8. 主线精读"书库延伸"：第 1 天（诗经）
  await page.goto(base + 'index.html#/day/1');
  await page.evaluate(() => { window.__lit.S.state.days[1].step = 2; window.__lit.render(); });
  ok((await page.$$eval('.libmore a', els => els.length)) >= 1, '主线精读末尾有书库延伸');

  // 9. 手机布局无横向滚动（书库各页）
  for (const v of ['lib', `lib/${BOOK}`, `u/${UNIT}`]) {
    await page.goto(base + `index.html#/${v}`);
    await page.waitForSelector('#view *');
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    ok(over <= 0, `手机宽度无横向滚动：${v}（溢出 ${over}px）`);
  }

  // 10. 离线：「我的」下载全部书库 → 断网 → 重新打开一篇照常显示
  await page.goto(base + 'index.html#/me');
  await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, null, { timeout: 20000 }).catch(() => {});
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, null, { timeout: 20000 });
  await page.click('button[data-act="libdl"]');
  await page.waitForFunction(() => /全部/.test((document.querySelector('#lib-status') || {}).textContent || ''), null, { timeout: 180000 });
  ok(true, '「我的」下载全部书库完成');
  await ctx.setOffline(true);
  await page.goto(base + `index.html#/u/${UNIT}`);
  await page.waitForSelector('.unithead h1', { timeout: 30000 });
  ok((await page.textContent('.unithead h1')).includes('黛玉葬花'), '断网后仍能打开书库单元');
  ok((await page.$$eval('.card.text .poem', els => els.length)) === 2, '断网后原文照常显示');
  await ctx.setOffline(false);

  ok(errors.length === 0, '无脚本错误：' + errors.slice(0, 5).join(' | '));
  await browser.close(); srv.close();
  console.log(`书库端到端：${checks - fails}/${checks} 通过`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
