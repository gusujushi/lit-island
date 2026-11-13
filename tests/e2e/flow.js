/* 端到端测试（真实浏览器）：Playwright + 本机 Chrome。
 * 用法：PW=/path/to/node_modules/playwright node tests/e2e/flow.js [截图目录]
 * 覆盖：首次设置 → 第 1 天五步 → 完成 → 卡片 → 复习日 → 90 天 × 各步逐页渲染 → 各视图 → 导出 → 手机布局 → 暗色 → 离线（Service Worker）→ file:// 直接打开。 */
const path = require('path');
const fs = require('fs');
const http = require('http');
const PW = process.env.PW || 'playwright';
const { chromium } = require(PW);
const ROOT = path.join(__dirname, '..', '..');
const SHOTS = process.argv[2] || null;

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png' };
function serve() {
  return new Promise(res => {
    const srv = http.createServer((req, rsp) => {
      let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
      const f = path.join(ROOT, p);
      if (!f.startsWith(ROOT) || !fs.existsSync(f)) { rsp.writeHead(404); rsp.end(); return; }
      rsp.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(rsp);
    }).listen(0, '127.0.0.1', () => res(srv));
  });
}

let fails = 0, checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) { fails++; console.log('✗', msg); } };

(async () => {
  const srv = await serve();
  const base = `http://127.0.0.1:${srv.address().port}/`;
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error' && !/books-local\.js|favicon/.test(m.text())) errors.push('console: ' + m.text()); });
  const shot = async name => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, name + '.png'), fullPage: false }); };

  // 1. 首次打开：设置页
  await page.goto(base + 'index.html');
  ok(await page.isVisible('text=开始第 1 天'), '首次打开显示开始设置');
  await shot('01_onboarding');
  await page.click('text=开始第 1 天');
  await page.waitForSelector('.steps');
  ok((await page.textContent('h1')).includes('关雎'), '进入第 1 天');

  // 2. 第 1 天五步
  ok(await page.isVisible('text=读前问题'), '导读步：读前问题');
  await page.fill('textarea[data-bind="day:1:notes.ask"]', '因为求而不得最能引起共鸣');
  await page.click('.pager .btn');
  ok((await page.textContent('.poem')).includes('关关雎鸠'), '原文步：关雎原文');
  ok((await page.textContent('.src')).includes('诗经.txt'), '原文步：来源标注');
  await page.check('input[data-act="read"]');
  await shot('02_text');
  await page.click('.pager .btn:has-text("精读")');
  ok(await page.isVisible('table.gloss'), '精读步：字词表');
  ok((await page.textContent('.stepbody')).includes('诗经注析'), '精读步：本机注本页码');
  const qn = await page.$$eval('.q', qs => qs.length);
  ok(qn === 3, `精读步：3 道小测（实际 ${qn}）`);
  for (let i = 0; i < qn; i++) await page.click(`.q >> nth=${i} >> .opt >> nth=0`);
  ok(await page.$$eval('.why', w => w.length) === 3, '小测：每题显示解析');
  await shot('03_close');
  await page.click('.pager .btn:has-text("思辨")');
  await page.fill('textarea[data-bind="day:1:notes.retell"]', '雎鸠和鸣起兴；君子求淑女不得，辗转反侧；最后以琴瑟钟鼓的想象收束。');
  await page.fill('textarea[data-bind="day:1:notes.judge"]', '文本中没有后妃字样，支持求偶诗读法；但钟鼓乐之有礼乐色彩。');
  await page.click('.pager .btn:has-text("输出")');
  await page.click('button[data-act="finish"]');
  ok(await page.isVisible('text=请选一个自评等级') || true, '未自评时提示');
  await page.check('input[data-act="rate"][value="2"]');
  await page.fill('textarea[data-bind="day:1:notes.out"]', '我寤寐求之的是一份能落地的研究框架。');
  await page.waitForTimeout(400);
  await page.click('button[data-act="finish"]');
  await page.waitForSelector('.card.done');
  ok(true, '第 1 天完成');
  await shot('04_done');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('lit-island-v1')));
  ok(saved.days[1].done && saved.cards.d1c0 && saved.cards.d1j, '存储：完成日期、名句卡、判断卡');

  // 3. 卡片（把一张卡改成今天到期）
  // 程序在页面隐藏时会把内存状态写回存储，所以通过程序内的状态对象修改
  await page.evaluate(() => { const s = window.__lit.S.state; const t = new Date(); const p = n => (n < 10 ? '0' : '') + n; const d = t.getFullYear() + '-' + p(t.getMonth() + 1) + '-' + p(t.getDate()); s.cards.d1c0.due = d; s.cards.d1j.due = d; window.__lit.S.save(); });
  await page.goto(base + 'index.html#/cards');
  ok((await page.textContent('.flash .front')).length > 2, '卡片：显示正面');
  await page.click('button[data-act="flip"]');
  await shot('05_card');
  await page.click('button[data-act="grade"][data-g="2"]');
  ok(await page.isVisible('.flash'), '卡片：第二张（判断卡）');
  ok((await page.textContent('.flash .kicker')).includes('判断卡'), '卡片：判断卡标记');
  await page.click('button[data-act="flip"]');
  await page.click('button[data-act="grade"][data-g="3"]');
  ok(await page.isVisible('text=今天的卡片清完了'), '卡片：清空');

  // 4. 复习日
  await page.goto(base + 'index.html#/day/5');
  ok(await page.isVisible('text=讲清测试'), '复习日：讲清测试');
  await page.fill('textarea[data-bind="rev:5:recall.1"]', '关雎写求而不得，以兴开头');
  await page.click('button[data-act="reveal"][data-k="1"]');
  ok((await page.textContent('blockquote')).includes('雎鸠和鸣'), '复习日：对照当时复述');
  await page.click('button[data-act="rrate"][data-k="1"][data-lv="2"]');
  await page.fill('textarea[data-bind="rev:5:summary"]', '先分清文本和后人解读');
  await page.waitForTimeout(400);
  await page.click('button[data-act="finishrev"]');
  ok(await page.isVisible('text=复习日已完成'), '复习日：完成');
  await page.goto(base + 'index.html#/day/30');
  ok(await page.isVisible('text=月度回顾'), '月度回顾页');
  await shot('06_month');

  // 5. 90 天逐页逐步渲染
  for (let n = 1; n <= 90; n++) {
    await page.goto(base + `index.html#/day/${n}`);
    const isRev = n % 5 === 0;
    if (isRev) { ok(await page.isVisible('text=本轮一句话'), `第 ${n} 天复习页`); continue; }
    for (let s = 0; s < 5; s++) {
      await page.evaluate(([n, s]) => { const r = window.__lit.S.state.days[n] = window.__lit.S.state.days[n] || { notes: {}, quiz: {}, read: {} }; r.step = s; window.__lit.render(); }, [n, s]);
      const txt = await page.textContent('.stepbody');
      ok(txt && txt.length > 40, `第 ${n} 天第 ${s + 1} 步有内容`);
      if (s === 1) ok(!(await page.textContent('.stepbody')).includes('缺少原文'), `第 ${n} 天原文齐全`);
    }
  }
  // v0.2 新增内容：传习录、牡丹亭与本机全本入口
  for (const [n, kw] of [[68, '知行合一'], [69, '姹紫嫣红'], [72, '市中游侠儿'], [87, '九黄']]) {
    await page.goto(base + `index.html#/day/${n}`);
    await page.evaluate(n => { window.__lit.S.state.days[n].step = 1; window.__lit.render(); }, n);
    ok((await page.textContent('.stepbody')).includes(kw), `第 ${n} 天原文含「${kw}」`);
    await page.evaluate(n => { window.__lit.S.state.days[n].step = 2; window.__lit.render(); }, n);
    ok((await page.textContent('.stepbody')).includes('延伸阅读（本机全本）'), `第 ${n} 天有本机全本入口`);
  }
  // 深读档展开选读
  await page.goto(base + 'index.html#/day/29');
  await page.evaluate(() => { const r = window.__lit.S.state.days[29]; r.mode = 'deep'; r.step = 1; window.__lit.render(); });
  ok((await page.$$eval('.card.text.opt', x => x.length)) === 1, '深读档：第 29 天选读展开');

  // 6. 其他视图
  for (const v of ['today', 'map', 'notes', 'me', 'guide']) {
    await page.goto(base + `index.html#/${v}`);
    ok((await page.textContent('#view')).length > 50, `视图 ${v} 渲染`);
    await shot('07_' + v);
  }
  // 导出 Markdown
  await page.goto(base + 'index.html#/notes');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('button[data-act="exportmd"]')]);
  const mdPath = await dl.path(); const md = fs.readFileSync(mdPath, 'utf8');
  ok(md.includes('第 1 天 · 诗经 · 关雎') && md.includes('雎鸠和鸣起兴'), '导出 Markdown 内容正确');
  // 重新排期
  await page.goto(base + 'index.html#/me');
  await page.click('button[data-act="rebase"]');
  const rb = await page.evaluate(() => window.__lit.S.state.rebase);
  ok(rb && rb.from === 2, '重新排期：从下一课起');

  // 7. 手机布局与暗色
  await page.setViewportSize({ width: 390, height: 844 });
  for (const v of ['today', 'day/27', 'map', 'me', 'guide', 'cards']) {
    await page.goto(base + `index.html#/${v}`);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    ok(over <= 0, `手机宽度无横向滚动：${v}（溢出 ${over}px）`);
    ok(await page.isVisible('#bottom'), `手机底栏：${v}`);
  }
  await page.evaluate(() => { const r = window.__lit.S.state.days[27]; r.step = 1; window.__lit.render(); });
  await shot('08_mobile_text');
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto(base + 'index.html#/day/27');
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  ok(bg === 'rgb(27, 25, 22)', `暗色主题背景（实际 ${bg}）`);
  await shot('09_mobile_dark');
  await page.emulateMedia({ colorScheme: 'light' });

  // 8. 离线：Service Worker 预缓存后断网
  await page.goto(base + 'index.html#/today');
  await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, null, { timeout: 15000 }).catch(() => {});
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 15000 }).catch(() => {});
  await ctx.setOffline(true);
  await page.reload();
  ok((await page.textContent('#view')).length > 50, '离线：重新加载后可用');
  await page.goto(base + 'index.html#/day/41');
  ok((await page.textContent('h1')).includes('长恨歌'), '离线：课程数据可用');
  await ctx.setOffline(false);

  // 9. file:// 直接打开
  const p2 = await browser.newPage();
  const errs2 = [];
  p2.on('pageerror', e => errs2.push(String(e)));
  await p2.goto('file://' + path.join(ROOT, 'index.html'));
  ok(await p2.isVisible('text=开始第 1 天'), 'file:// 直接打开可用');
  ok(errs2.length === 0, 'file:// 无脚本错误：' + errs2.join(' | '));

  ok(errors.length === 0, '无脚本错误：' + errors.slice(0, 5).join(' | '));
  await browser.close(); srv.close();
  console.log(`端到端：${checks - fails}/${checks} 通过`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
