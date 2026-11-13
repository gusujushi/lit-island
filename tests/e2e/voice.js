/* 端到端（真实语音识别）：假麦克风播放一段中文录音 → 真实下载、加载、运行 Whisper → 写进输入框；
 * 再填 Key 用假 DeepSeek 接口校对；再断网识别一次（模型、运行库从共用缓存读）；
 * 并检查 Service Worker 升级时不删同站意大利语能力岛的缓存。
 * 用法：PW=<playwright 路径> ASSETS=<含 vendor/ 与 models/ 的意大利语能力岛目录> node tests/e2e/voice.js
 *   录音默认用 macOS 的 say（Tingting）现场合成；也可用 VOICE_WAV=<16 kHz 单声道 wav> 指定。 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFileSync } = require('child_process');
const { chromium } = require(process.env.PW || 'playwright');
const { serve } = require('./serve.js');

const ASSETS = process.env.ASSETS;
if (!ASSETS || !fs.existsSync(path.join(ASSETS, 'models', 'whisper-base', 'onnx', 'encoder_model_quantized.onnx'))) {
  console.log('跳过：没有设置 ASSETS（意大利语能力岛的 vendor/ 与 models/ 所在目录），未运行真实语音识别测试。');
  process.exit(0);
}
const SENT = '我认为关雎首先是一首求爱诗，文本里没有后妃的字样，但是钟鼓乐之带有礼乐的色彩。';
let wav = process.env.VOICE_WAV;
if (!wav) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'litvoice-'));
  execFileSync('say', ['-v', 'Tingting', '-o', path.join(tmp, 'v.aiff'), SENT]);
  wav = path.join(tmp, 'v.wav');
  execFileSync('afconvert', ['-f', 'WAVE', '-d', 'LEI16@16000', '-c', '1', path.join(tmp, 'v.aiff'), wav]);
}

let fails = 0, checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) { fails++; console.log('✗', msg); } else console.log('✓', msg); };

(async () => {
  let offline = false;
  const srv = await serve({ assets: ASSETS, offline: () => offline });
  const base = `http://127.0.0.1:${srv.address().port}/`;
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--use-file-for-fake-audio-capture=' + wav] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.grantPermissions(['microphone']);
  const polishReqs = [];
  await ctx.route('https://api.deepseek.com/**', async route => {
    const req = route.request();
    if (offline) { await route.abort('internetdisconnected'); return; }      // 路由拦截不受 setOffline 影响，这里模拟断网
    if (req.url().endsWith('/models')) { await route.fulfill({ json: { data: [{ id: 'deepseek-v4-flash' }] } }); return; }
    const body = JSON.parse(req.postData() || '{}');
    polishReqs.push(body.messages[1].content);
    await route.fulfill({ json: { choices: [{ message: { content: SENT }, finish_reason: 'stop' }] } });
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));

  // 0. 同站缓存：先放一个"意大利语能力岛的缓存"和一个"本程序旧版缓存"，看 Service Worker 启用后谁被删
  await page.goto(base + 'italy-learning/models/whisper-base/config.json');
  await page.evaluate(async () => {
    await (await caches.open('isola-shell-v3')).put('/italy-learning/x', new Response('x'));
    await (await caches.open('lit-island-v0.4.0')).put('/lit-island/x', new Response('x'));
  });

  // 1. 打开程序、开始第 1 天
  await page.goto(base + 'lit-island/index.html');
  await page.click('text=开始第 1 天');
  await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, null, { timeout: 20000 }).catch(() => {});
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 20000 });
  const keys = await page.evaluate(() => caches.keys());
  ok(keys.includes('isola-shell-v3'), 'Service Worker 启用后，同站意大利语能力岛的缓存还在');
  ok(!keys.includes('lit-island-v0.4.0') && keys.includes('lit-island-v0.5.0'), '只删除了本程序的旧版缓存：' + keys.join(','));

  // 2. 「我的」下载语音模型
  await page.goto(base + 'lit-island/index.html#/me');
  await page.waitForSelector('button[data-act="asrdl"]');
  const t0 = Date.now();
  await page.click('button[data-act="asrdl"]');
  await page.waitForFunction(() => document.querySelector('#asr-status').textContent.includes('已在本机'), null, { timeout: 120000 });
  ok(true, `语音模型下载完成（${((Date.now() - t0) / 1000).toFixed(1)} 秒，本机服务器）`);
  ok(await page.evaluate(async () => (await (await caches.open('isola-asr-v1')).keys()).length === ASR.ASSETS.length), '模型存进共用缓存 isola-asr-v1');

  // 3. 真实识别（没填 Key：直接插入识别结果）
  async function dictate(field, secs) {
    await page.goto(base + 'lit-island/index.html#/day/1');
    await page.evaluate(() => { window.__lit.S.state.days[1].step = 3; window.__lit.render(); });
    const sel = `textarea[data-bind="day:1:notes.${field}"]`;
    await page.fill(sel, '');
    await page.click(`button[data-act="mic"][data-target="day:1:notes.${field}"]`);
    await page.waitForSelector(`button.mic.on[data-target="day:1:notes.${field}"]`);
    await page.waitForTimeout(secs * 1000);
    const t = Date.now();
    await page.click(`button[data-act="mic"][data-target="day:1:notes.${field}"]`);
    await page.waitForFunction(s => document.querySelector(s).value.length > 5, sel, { timeout: 90000 });
    return { text: await page.inputValue(sel), ms: Date.now() - t, status: await page.textContent(`[data-vstat="day:1:notes.${field}"]`) };
  }
  const a = await dictate('retell', 9);
  console.log('  识别结果：', a.text, `（停止后 ${a.ms} 毫秒）`);
  ok(/[一-鿿]{8,}/.test(a.text), '真实识别：输出中文');
  ok(!/[為認個裡沒後樂這說詩]/.test(a.text), '真实识别：已是简体');
  ok(/我认为/.test(a.text) && /首先是一首/.test(a.text), '真实识别：主要内容正确');
  ok(/。$/.test(a.text), '真实识别：句末有句号');
  ok(polishReqs.length === 0, '没填 Key 不调用 DeepSeek');

  // 4. 填 Key：识别后用（假）DeepSeek 校对
  await page.evaluate(() => AI.save({ apiKey: 'sk-test-voice' }));
  const b = await dictate('judge', 9);
  ok(b.text === SENT, 'DeepSeek 校对后的文字写入输入框');
  ok(polishReqs.length === 1 && /首先是一首/.test(polishReqs[0]) && /关关雎鸠/.test(polishReqs[0]), '校对请求带着真实识别结果和本课原文');
  ok(b.status.includes('撤销校对'), '可以撤销校对');

  // 5. 断网：模型和运行库从共用缓存读，识别照常；DeepSeek 连不上 → 保留原识别并说明
  await page.evaluate(() => ASR.release());
  offline = true; await ctx.setOffline(true);
  await page.reload();
  const c = await dictate('link', 9);
  console.log('  断网识别：', c.text);
  ok(/我认为/.test(c.text), '断网：真实识别照常（模型来自本机缓存）');
  ok(c.status.includes('已保留原识别'), '断网：AI 校对失败时保留原识别并提示');
  offline = false; await ctx.setOffline(false);

  ok(errors.length === 0, '无脚本错误：' + errors.slice(0, 5).join(' | '));
  await browser.close(); srv.close();
  console.log(`真实语音识别端到端：${checks - fails}/${checks} 通过`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
