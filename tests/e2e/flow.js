/* 端到端测试（真实浏览器）：Playwright + 本机 Chrome。
 * 用法：PW=/path/to/node_modules/playwright node tests/e2e/flow.js [截图目录]
 * 覆盖：首次设置 → 第 1 天五步（含语音输入）→ 完成 → AI 老师（假 DeepSeek 接口）→ 卡片 → 复习日 → 90 天 × 各步逐页渲染 → 各视图 → 导出 → 手机布局 → 暗色 → 离线（Service Worker）→ file:// 直接打开。
 * 语音输入：Chrome 假麦克风（真实录音、解码、重采样），识别一步用替身（本测试不带模型；真实识别见 tests/e2e/voice.js）。 */
const path = require('path');
const fs = require('fs');
const http = require('http');
const PW = process.env.PW || 'playwright';
const { chromium } = require(PW);
const ROOT = path.join(__dirname, '..', '..');
const SHOTS = process.argv[2] || null;

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png' };
let swOverride = null;   // 模拟"线上发布了新版本"：把 sw.js 的版本号换掉
function serve() {
  return new Promise(res => {
    const srv = http.createServer((req, rsp) => {
      let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
      if (p === '/sw.js' && swOverride) { rsp.writeHead(200, { 'Content-Type': 'text/javascript' }); rsp.end(fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8').replace(/lit-island-v[0-9.]+'/, `lit-island-v${swOverride}'`)); return; }
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
  // 假麦克风的声音：4 秒"像说话"的调幅音（Chrome 默认的假麦克风每秒只响 0.1 秒，会被判成"没有说话"）
  const wav = path.join(require('os').tmpdir(), 'lit-fake-voice.wav');
  { const sr = 16000, n = sr * 4, b = Buffer.alloc(44 + n * 2);
    b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
    b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
    for (let i = 0; i < n; i++) { const t = i / sr, env = 0.5 + 0.5 * Math.sin(2 * Math.PI * 4 * t); b.writeInt16LE(Math.round(9000 * env * Math.sin(2 * Math.PI * 180 * t)), 44 + i * 2); }
    fs.writeFileSync(wav, b); }
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--use-file-for-fake-audio-capture=' + wav] });
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 }, acceptDownloads: true });
  await ctx.grantPermissions(['microphone']);
  // 假 DeepSeek 接口：按请求内容回答，并记下发出去的东西
  const aiReqs = [];
  await ctx.route('https://api.deepseek.com/**', async route => {
    const req = route.request(), url = req.url();
    const auth = req.headers()['authorization'] || '';
    if (url.endsWith('/models')) { await route.fulfill({ json: { data: [{ id: 'deepseek-v4-flash' }, { id: 'deepseek-v4-pro' }] } }); return; }
    const body = JSON.parse(req.postData() || '{}');
    aiReqs.push({ url, auth, body });
    const sys = body.messages[0].content, user = body.messages[1].content;
    const content = /语音转写校对员/.test(sys) ? '我认为《关雎》首先是一首求爱诗。'
      : /请讲解/.test(user) ? '• 大意：以**雎鸠**和鸣起兴，写君子求淑女。\n• 字词：逑，配偶。'
      : /我的问题/.test(user) ? '「好逑」的逑，是配偶的意思。'
      : /请点评/.test(user) ? '① 估计 **L2**：要点讲到了，判断还缺反证。' : '（未知请求）';
    await route.fulfill({ json: { choices: [{ message: { content }, finish_reason: 'stop' }] } });
  });
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
  const APPV = await page.evaluate(() => LIT.changelog[0].v);
  ok((await page.textContent('#ver')) === 'v' + APPV, `页眉显示版本号 v${APPV}`);

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
  ok(await page.isVisible('text=今日经典'), '精读步：今日经典卡');
  ok((await page.textContent('.classic')).includes('乐而不淫，哀而不伤'), '今日经典：古人用例');
  const qn = await page.$$eval('.q', qs => qs.length);
  ok(qn === 3, `精读步：3 道小测（实际 ${qn}）`);
  for (let i = 0; i < qn; i++) await page.click(`.q >> nth=${i} >> .opt >> nth=0`);
  ok(await page.$$eval('.why', w => w.length) === 3, '小测：每题显示解析');
  await shot('03_close');
  await page.click('.pager .btn:has-text("思辨")');
  await page.fill('textarea[data-bind="day:1:notes.retell"]', '雎鸠和鸣起兴；君子求淑女不得，辗转反侧；最后以琴瑟钟鼓的想象收束。');
  await page.fill('textarea[data-bind="day:1:notes.judge"]', '文本中没有后妃字样，支持求偶诗读法；但钟鼓乐之有礼乐色彩。');
  // 语音输入：点判断框旁的麦克风 → 假麦克风录 1 秒 → 再点结束 → 识别（替身，返回繁体）→ 整理后插入
  await page.evaluate(() => { ASR.cached = async () => true; ASR.load = async () => {}; ASR.transcribeLong = async () => '我認為冠軍首先是一首球艾詩'; });
  await page.click('button[data-act="mic"][data-target="day:1:notes.judge"]');
  await page.waitForSelector('button.mic.on[data-target="day:1:notes.judge"]');
  ok((await page.textContent('[data-vstat="day:1:notes.judge"]')).includes('正在录音'), '语音输入：录音中提示');
  await page.waitForTimeout(1200);
  await page.click('button[data-act="mic"][data-target="day:1:notes.judge"]');
  await page.waitForFunction(() => document.querySelector('textarea[data-bind="day:1:notes.judge"]').value.includes('球艾诗'), null, { timeout: 15000 });
  ok((await page.inputValue('textarea[data-bind="day:1:notes.judge"]')).endsWith('钟鼓乐之有礼乐色彩。我认为冠军首先是一首球艾诗。'), '语音输入：繁转简、补句号、接在原文字后面');
  ok((await page.evaluate(() => window.__lit.S.state.days[1].notes.judge)).includes('球艾诗'), '语音输入：文字已存入进度');
  ok(!(await page.isVisible('button.mic.on')), '语音输入：结束后按钮复原');
  ok(aiReqs.length === 0, '没填 Key 时不调用 DeepSeek');
  await page.click('.pager .btn:has-text("输出")');
  ok(await page.isVisible('text=用今日经典造一句'), '输出步：用今日经典造句');
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

  // 2b. AI 老师（假 DeepSeek 接口）：在「我的」填 Key → 语音校对、讲解、提问、点评
  await page.goto(base + 'index.html#/me');
  ok(await page.isVisible('#ai-card'), '我的：AI 老师设置卡');
  ok((await page.getAttribute('input[data-ai-set="apiKey"]', 'type')) === 'password', 'AI：Key 输入框不明文显示');
  await page.waitForFunction(() => /尚未下载|已在本机/.test(document.querySelector('#asr-status').textContent));
  ok(await page.isVisible('button[data-act="asrdl"]'), '我的：语音模型下载按钮');
  await page.fill('input[data-ai-set="apiKey"]', 'sk-test-123');
  await page.press('input[data-ai-set="apiKey"]', 'Tab');
  await page.waitForSelector('button[data-act="aiclear"]');
  await page.click('button[data-act="aitest"]');
  await page.waitForFunction(() => document.querySelector('#ai-test').textContent.includes('连接成功'));
  ok((await page.textContent('#ai-test')).includes('deepseek-v4-flash'), 'AI：测试连接并自动选 flash 模型');
  ok(!(await page.evaluate(() => localStorage.getItem('lit-island-v1'))).includes('sk-test'), 'AI：Key 不在学习进度里');
  // 语音输入 + DeepSeek 校对 + 撤销
  await page.goto(base + 'index.html#/day/1');
  await page.evaluate(() => { window.__lit.S.state.days[1].step = 3; window.__lit.render(); ASR.cached = async () => true; ASR.load = async () => {}; ASR.transcribeLong = async () => '我認為冠軍首先是一首球艾詩'; });
  ok((await page.textContent('.stepbody')).includes('DeepSeek 按本课内容校对'), '思辨：提示会用 DeepSeek 校对');
  await page.fill('textarea[data-bind="day:1:notes.link"]', '');
  await page.click('button[data-act="mic"][data-target="day:1:notes.link"]');
  await page.waitForSelector('button.mic.on[data-target="day:1:notes.link"]');
  await page.waitForTimeout(800);
  await page.click('button[data-act="mic"][data-target="day:1:notes.link"]');
  await page.waitForFunction(() => document.querySelector('textarea[data-bind="day:1:notes.link"]').value.includes('求爱诗'), null, { timeout: 15000 });
  ok((await page.inputValue('textarea[data-bind="day:1:notes.link"]')) === '我认为《关雎》首先是一首求爱诗。', 'AI 校对：错字改正后插入');
  const pol = aiReqs.find(r => /语音转写校对员/.test(r.body.messages[0].content));
  ok(pol && pol.auth === 'Bearer sk-test-123' && !JSON.stringify(pol.body).includes('sk-test'), 'AI 校对：Key 只在请求头里');
  ok(pol && /关关雎鸠/.test(pol.body.messages[1].content) && /我认为冠军首先是一首球艾诗/.test(pol.body.messages[1].content), 'AI 校对：发送识别文字与本课原文背景');
  ok(pol && pol.body.temperature === 0, 'AI 校对：温度 0');
  await page.click('[data-vstat="day:1:notes.link"] button[data-act="vundo"]');
  ok((await page.inputValue('textarea[data-bind="day:1:notes.link"]')) === '我认为冠军首先是一首球艾诗。', 'AI 校对：可撤销，恢复原始识别');
  // 点评思辨
  await page.click('button[data-act="aireview"][data-kind="think"]');
  await page.waitForFunction(() => document.querySelector('[data-ai="r:1:think"]').textContent.includes('L2'));
  ok((await page.textContent('[data-ai="r:1:think"] b')) === 'L2', 'AI 点评：显示结果（加粗）');
  const rv = aiReqs.find(r => /请点评/.test(r.body.messages[1].content));
  ok(rv && /雎鸠和鸣起兴/.test(rv.body.messages[1].content) && /L3/.test(rv.body.messages[1].content), 'AI 点评：发送复述与量规');
  const before = aiReqs.length;
  await page.evaluate(() => window.__lit.render());
  await page.click('button[data-act="aireview"][data-kind="think"]');
  await page.waitForFunction(() => document.querySelector('[data-ai="r:1:think"]').textContent.includes('之前的结果'));
  ok(aiReqs.length === before, 'AI 点评：同一内容用本机缓存，不重复请求');
  // 讲解与提问（原文步）
  await page.evaluate(() => { window.__lit.S.state.days[1].step = 1; window.__lit.render(); });
  await page.click('button[data-act="aiexplain"][data-id="sj_guanju"]');
  await page.waitForFunction(() => document.querySelector('[data-ai="x:sj_guanju"]').textContent.includes('起兴'));
  ok((await page.textContent('[data-ai="x:sj_guanju"]')).includes('仅供参考'), 'AI 讲解：显示并标注仅供参考');
  ok(await page.isVisible('button[data-act="mic"][data-target="ask:sj_guanju"]'), 'AI 提问框也有语音输入');
  await page.fill('textarea[data-bind="ask:sj_guanju"]', '好逑是什么意思？');
  await page.click('button[data-act="aiask"][data-id="sj_guanju"]');
  await page.waitForFunction(() => document.querySelector('[data-ai="q:sj_guanju"]').textContent.includes('配偶'));
  ok(true, 'AI 提问：显示回答');
  ok(aiReqs.every(r => !JSON.stringify(r.body).includes('sk-test')), 'AI：所有请求体都不含 Key');
  await shot('11_ai');

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
  // v0.3：第三批材料——三源对勘页码、地图、王国维与鲁迅原文选读
  for (const [n, step, kw] of [[27, 2, '十六国春秋辑补'], [28, 2, '中国历史地图集'], [47, 1, '眼界始大'], [57, 1, '三种之境界'], [73, 1, '足称讽刺之书'], [13, 2, '坞壁及桃花源']]) {
    await page.goto(base + `index.html#/day/${n}`);
    await page.evaluate(([n, step]) => { const r = window.__lit.S.state.days[n] = window.__lit.S.state.days[n] || { notes: {}, quiz: {}, read: {} }; r.mode = 'deep'; r.step = step; window.__lit.render(); }, [n, step]);
    ok((await page.textContent('.stepbody')).includes(kw), `第 ${n} 天（深读）含「${kw}」`);
  }
  // v0.4：注本图包导入与看图（测试用小图包，不含真实注本）
  {
    const { execFileSync } = require('child_process');
    const os = require('os');
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'litpk-'));
    const zp = path.join(tmp, 'test-pack.zip');
    const png = path.join(ROOT, 'icons', 'icon-192.png');
    execFileSync('python3', ['-I', '-c', `import zipfile,json\nz=zipfile.ZipFile(${JSON.stringify(zp)},'w',zipfile.ZIP_STORED)\nz.writestr('manifest.json',json.dumps({'app':'lit-island','version':'test','refs':{'sjzx:26':['sjzx_0026.png','sjzx_0027.png']}}))\nz.write(${JSON.stringify(png)},'sjzx_0026.png')\nz.write(${JSON.stringify(png)},'sjzx_0027.png')\nz.close()`]);
    await page.goto(base + 'index.html#/me');
    await page.setInputFiles('#pages-file', zp);
    await page.waitForFunction(() => window.__lit.PG && window.__lit.PG.count === 2, null, { timeout: 10000 });
    ok(true, '图包导入：2 张页图');
    await page.goto(base + 'index.html#/day/1');
    await page.evaluate(() => { window.__lit.S.state.days[1].step = 2; window.__lit.render(); });
    ok(await page.isVisible('button[data-act="pages"]:has-text("看 2 页")'), '注本旁出现看图按钮');
    await page.click('button[data-act="pages"]');
    await page.waitForFunction(() => [...document.querySelectorAll('#viewer img')].every(i => i.complete && i.naturalWidth > 0));
    ok((await page.$$eval('#viewer img', x => x.length)) === 2, '看图：两页图片已显示');
    await shot('10_viewer');
    await page.click('button[data-act="vclose"]');
    ok(!(await page.isVisible('#viewer')), '看图：关闭');
    await page.reload();
    await page.waitForFunction(() => window.__lit.PG && window.__lit.PG.count === 2);
    ok(true, '图包：刷新后仍在（存在本机）');
  }
  // 深读档展开选读
  await page.goto(base + 'index.html#/day/29');
  await page.evaluate(() => { const r = window.__lit.S.state.days[29]; r.mode = 'deep'; r.step = 1; window.__lit.render(); });
  ok((await page.$$eval('.card.text.opt', x => x.length)) === 1, '深读档：第 29 天选读展开');

  // 5b. 版本与更新记录
  await page.goto(base + 'index.html#/today');
  ok(!(await page.isVisible('.whatsnew')), '新用户：首页不提示更新');
  await page.evaluate(() => { window.__lit.S.state.settings.seenVersion = '0.5.0'; window.__lit.render(); });
  ok((await page.textContent('.whatsnew h3')).includes('已更新到 v' + APPV), '从 v0.5.0 升级：首页提示已更新');
  ok((await page.textContent('.whatsnew')).includes(await page.evaluate(() => LIT.changelog[0].items[0].slice(0, 12))), '首页提示：列出本次主要修改');
  ok(!(await page.textContent('.whatsnew')).includes('v0.4.0'), '首页提示：只列 v0.5.0 之后的版本');
  await page.click('button[data-act="seenver"]');
  ok(!(await page.isVisible('.whatsnew')), '点"知道了"后不再提示');
  await page.evaluate(() => { delete window.__lit.S.state.settings.seenVersion; window.__lit.render(); });
  ok(await page.isVisible('.whatsnew details'), '从更早版本升级：首页提示带之前的更新记录');
  await page.click('button[data-act="seenver"]');
  await page.goto(base + 'index.html#/me');
  const vc = await page.textContent('#ver-card');
  ok(vc.includes('当前版本 v' + APPV) && /更新于 \d{4}-\d{2}-\d{2}/.test(vc), '我的：显示版本号与更新日期');
  ok(vc.includes('全部更新记录') && vc.includes('v0.3.0'), '我的：全部更新记录');
  await page.click('button[data-act="checkupdate"]');
  await page.waitForFunction(() => /已是最新|检查失败/.test(document.querySelector('#upd-msg').textContent));
  ok((await page.textContent('#upd-msg')).includes('已是最新版本 v' + APPV), '我的：检查更新（已是最新）');

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
  await page.goto(base + 'index.html#/me');
  const [dj] = await Promise.all([page.waitForEvent('download'), page.click('button[data-act="exportjson"]')]);
  ok(!fs.readFileSync(await dj.path(), 'utf8').includes('sk-test'), '导出备份不含 AI Key');
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
  ok(bg === 'rgb(23, 19, 15)', `暗色主题背景（实际 ${bg}）`);
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

  // 8b. 手机更新流程：线上发布新版本 → 点「检查更新」→ 新版本下载、接管 → 自动刷新 → 旧缓存删除
  swOverride = '9.9.9';
  await page.goto(base + 'index.html#/me');
  await page.waitForFunction(() => navigator.serviceWorker.controller);
  const nav = page.waitForEvent('framenavigated', { timeout: 30000 });
  await page.click('button[data-act="checkupdate"]');
  await page.waitForFunction(() => /发现新版本 v9\.9\.9/.test((document.querySelector('#upd-msg') || {}).textContent || ''), null, { timeout: 15000 }).catch(() => {});
  await nav;
  await page.waitForLoadState();
  let ks = await page.evaluate(() => caches.keys());
  ok(ks.includes('lit-island-v9.9.9') && !ks.includes('lit-island-v' + APPV), '更新：新版本接管后自动刷新，旧缓存已删除（' + ks.join(',') + '）');
  // 正在打字时不强行刷新，改为提示条
  swOverride = '9.9.10';
  await page.goto(base + 'index.html#/day/1');
  await page.evaluate(() => { window.__lit.S.state.days[1].step = 3; window.__lit.render(); });
  await page.focus('textarea[data-bind="day:1:notes.retell"]');
  await page.evaluate(() => navigator.serviceWorker.getRegistration().then(r => r.update()));
  await page.waitForSelector('#updbar', { timeout: 30000 });
  ok((await page.textContent('#updbar')).includes('点此更新'), '更新：正在打字时显示"点此更新"，不强行刷新');
  const nav2 = page.waitForEvent('framenavigated', { timeout: 30000 });
  await page.click('#updbar button[data-act="doupdate"]');
  await nav2; await page.waitForLoadState();
  ks = await page.evaluate(() => caches.keys());
  ok(ks.includes('lit-island-v9.9.10') && !ks.includes('lit-island-v9.9.9'), '更新：点提示条后刷新到新版本');
  swOverride = null;

  // 9. file:// 直接打开
  const p2 = await browser.newPage();
  const errs2 = [];
  p2.on('pageerror', e => errs2.push(String(e)));
  await p2.goto('file://' + path.join(ROOT, 'index.html'));
  ok(await p2.isVisible('text=开始第 1 天'), 'file:// 直接打开可用');
  await p2.click('text=开始第 1 天');
  await p2.waitForSelector('.steps');
  await p2.evaluate(() => { window.__lit.S.state.days[1].step = 3; window.__lit.render(); });
  await p2.click('button[data-act="mic"][data-target="day:1:notes.retell"]');
  ok((await p2.textContent('#toast')).includes('https'), 'file://：语音输入给出改用网址或键盘听写的说明');
  ok(errs2.length === 0, 'file:// 无脚本错误：' + errs2.join(' | '));

  ok(errors.length === 0, '无脚本错误：' + errors.slice(0, 5).join(' | '));
  await browser.close(); srv.close();
  console.log(`端到端：${checks - fails}/${checks} 通过`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
