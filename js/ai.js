/* AI 老师（可选）：调用 DeepSeek 的聊天接口。移植自意大利语能力岛 js/ai.js，用途改为：
 *   polish  语音输入校对：本机 Whisper 识别出的文字常有同音字、专有名词、古诗文写错，按本课的原文和题目改正、补标点（只校对，不改写）；
 *   explain 讲解原文；ask 针对原文提问；
 *   review  点评思辨 / 输出：按"能否用自己的话讲清要点并做出有根据的判断"（L0–L3）给反馈。
 * 密钥只存在你自己浏览器的 localStorage（lit-island-ai，与学习进度分开存），请求由浏览器直接发给 DeepSeek，不经过其他服务器；
 * 导出备份不含密钥。发出去的只有文字（题目、要点、原文摘录、你写或说的文字），没有录音。没填密钥时，程序的其他功能照常使用。
 * 模型名：DeepSeek 改名较快，不写死——"模型"留空时向 /models 查询，优先选名字里带 flash 的（快、便宜）。
 * 接口地址：默认 DeepSeek 官方；也可以改成其他"兼容 OpenAI 格式"的平台（只允许 https，防止密钥明文传输）。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(null);
  else root.AI = factory(root);
})(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';

  const DEFAULT_BASE = 'https://api.deepseek.com';
  const FALLBACK_MODEL = 'deepseek-v4-flash';
  const KEY = 'lit-island-ai', CACHE_KEY = 'lit-island-ai-cache';

  /* ---------- 设置（与学习进度分开存，导出不带） ---------- */
  const ls = () => { try { return root && root.localStorage; } catch (e) { return null; } };
  function settings() {
    try { const s = ls() && JSON.parse(ls().getItem(KEY) || '{}'); return Object.assign({ apiKey: '', base: '', model: '', polish: true }, s || {}); } catch (e) { return { apiKey: '', base: '', model: '', polish: true }; }
  }
  function save(patch) {
    const s = Object.assign(settings(), patch || {});
    try { if (ls()) ls().setItem(KEY, JSON.stringify(s)); } catch (e) { /* 存不下 */ }
    autoModel = '';
    return s;
  }
  const ready = () => !!String(settings().apiKey || '').trim();

  /* ---------- 结果缓存（同一份内容不重复花钱） ---------- */
  function cacheAll() { try { return JSON.parse((ls() && ls().getItem(CACHE_KEY)) || '{}'); } catch (e) { return {}; } }
  function cacheGet(k) { return cacheAll()[k] || null; }
  function cacheSet(k, v) {
    try {
      const a = cacheAll(); a[k] = v;
      const ks = Object.keys(a); if (ks.length > 300) ks.slice(0, ks.length - 300).forEach(x => delete a[x]);
      ls().setItem(CACHE_KEY, JSON.stringify(a));
    } catch (e) { /* 空间不足：不缓存 */ }
  }
  /** 简单字符串指纹（用来判断你的文字改没改） */
  function hash(s) { let h = 2166136261; for (const c of String(s)) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); }

  /* ---------- 接口 ---------- */
  const validBase = u => /^https:\/\/[^\s/]+(\/\S*)?$/i.test(u) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/\S*)?$/i.test(u);
  const base = () => String(settings().base || '').trim().replace(/\/+$/, '') || DEFAULT_BASE;
  const isDefaultBase = () => base() === DEFAULT_BASE;
  let autoModel = '', autoModelBase = '';

  function describe(status, data) {
    const m = (data && data.error && data.error.message) || '';
    if (status === 401) return 'API Key 不正确，请到「我的 → AI 老师」重新填写';
    if (status === 402) return 'DeepSeek 账户余额不足，请到 platform.deepseek.com 充值';
    if (status === 429) return '请求太频繁，请稍等几秒再试';
    if (status >= 500) return 'DeepSeek 服务暂时繁忙，请稍后再试';
    return m || 'HTTP ' + status;
  }

  async function call(path, init, timeout) {
    const key = String(settings().apiKey || '').trim();
    if (!key) throw new Error('还没有填写 API Key（在「我的 → AI 老师」里填写）');
    if (!validBase(base())) throw new Error('接口地址必须以 https:// 开头（在「我的 → AI 老师」里修改）');
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), timeout || 60000);
    let res;
    try {
      res = await root.fetch(base() + path, Object.assign({ signal: ctrl.signal }, init, { headers: Object.assign({ 'Content-Type': 'application/json', Authorization: 'Bearer ' + key }, (init && init.headers) || {}) }));
    } catch (e) {
      throw new Error(e && e.name === 'AbortError' ? '请求超时，请检查网络后重试' : '连不上 DeepSeek，请检查网络');
    } finally { clearTimeout(to); }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { const err = new Error(describe(res.status, data)); err.status = res.status; err.api = data; throw err; }
    return data;
  }

  async function models() {
    const d = await call('/models', { method: 'GET' }, 20000);
    return (d.data || []).map(m => m.id).filter(Boolean);
  }
  const pick = ids => ids.find(i => /flash/i.test(i)) || ids.find(i => /^deepseek-/i.test(i)) || ids[0] || '';

  async function model() {
    const m = String(settings().model || '').trim();
    if (m) return m;
    if (autoModel && autoModelBase === base()) return autoModel;
    autoModel = ''; autoModelBase = base();
    try { autoModel = pick(await models()); } catch (e) { /* 查询失败：官方接口用保底名字，真正的错误留给聊天请求报告 */ }
    if (!autoModel && !isDefaultBase()) throw new Error('这个平台没有返回模型列表，请在「我的 → AI 老师」里手动填写模型名');
    return autoModel || FALLBACK_MODEL;
  }

  async function chat(messages, opts) {
    opts = opts || {};
    const body = m => JSON.stringify(Object.assign({
      model: m, messages: [{ role: 'system', content: opts.system || SYSTEM }].concat(messages), temperature: opts.temperature == null ? 0.3 : opts.temperature, stream: false,
      max_tokens: opts.maxTokens || 3000,                                   // 有些模型的"思考过程"也计入 max_tokens，多留余量
    }, isDefaultBase() ? { reasoning_effort: 'low' } : {}));                // reasoning_effort 是 DeepSeek 的参数，其他平台不一定认
    let m = await model(), d;
    try {
      d = await call('/chat/completions', { method: 'POST', body: body(m) }, opts.timeout || 90000);
    } catch (e) {
      if ((e.status === 400 || e.status === 404) && /model/i.test(String(e.message))) {
        let ids = [];
        try { ids = await models(); } catch (e2) { /* ignore */ }
        if (ids.length && ids.indexOf(m) < 0) {
          const alt = pick(ids);
          if (!String(settings().model || '').trim() && alt && alt !== m) { autoModel = alt; m = alt; d = await call('/chat/completions', { method: 'POST', body: body(m) }, opts.timeout || 90000); }
          else throw new Error('账户里没有模型「' + m + '」。可用的模型有：' + ids.join('、') + '。请在「我的 → AI 老师」里改一下。');
        } else throw e;
      } else throw e;
    }
    const c = (d.choices || [])[0] || {};
    const text = String((c.message && c.message.content) || '').trim();
    if (!text) throw new Error(c.finish_reason === 'length' ? '回答太长被截断了，请再试一次' : '没有收到回答');
    return { text, truncated: c.finish_reason === 'length' };
  }

  /* ---------- 提示词（纯函数，可测试） ---------- */
  const SYSTEM = '你是一位严谨、耐心的中国古典文学与历史老师。学生是成年人，用碎片时间系统学习诗经、唐诗、宋词、元曲、魏晋南北朝、五代十国、十六国诸燕、明清小说与公案。' +
    '请用简体中文，短段落；不要使用 Markdown 标题和表格；需要列点时用「• 」开头；重点词用 **双星号** 包起来。' +
    '引用原文只引下面给出的文字；不要编造引文、出处和史料；史实有争议或你不确定的，直接写"存疑"并说明分歧所在。';

  const POLISH = '你是语音转写校对员。输入是语音识别（Whisper）自动转写的中文，常有同音字、近音字错误，书名、篇名、人名、地名、古诗文词句常被写错，标点也不全。' +
    '请只做校对：改正识别错误，补全标点（书名、篇名加书名号）；不要改写措辞、不要润色、不要增删内容或观点、不要回答或评价其中的话。拿不准的地方保持原样。' +
    '只输出校对后的正文，不要加任何说明、引号或前缀。';

  const clip = (s, n) => { s = String(s || ''); return s.length > n ? s.slice(0, n) + '……' : s; };

  /** ctx: {day, title, question, texts:[{t, a, text}], words:[...] } —— 由界面根据当前输入框所在的课准备 */
  function polishMessages(raw, ctx) {
    ctx = ctx || {};
    const bg = [];
    if (ctx.title) bg.push('本课：' + (ctx.day ? '第 ' + ctx.day + ' 天「' + ctx.title + '」' : ctx.title));
    (ctx.texts || []).forEach(t => bg.push('原文《' + t.t + '》' + (t.a ? '（' + t.a + '）' : '') + '：' + clip(t.text, 600)));
    if (ctx.words && ctx.words.length) bg.push('本课字词：' + ctx.words.join('、'));
    if (ctx.question) bg.push('学生在回答的题目：' + ctx.question);
    return [{ role: 'user', content: '【参考背景，用来判断专有名词和引文，不要写进输出】\n' + bg.join('\n') + '\n\n【语音转写，请校对】\n' + raw }];
  }

  function explainMessages(ctx) {
    return [{ role: 'user', content: (ctx.day ? '第 ' + ctx.day + ' 天「' + ctx.title + '」。' : '') + '原文《' + ctx.t + '》' + (ctx.a ? '（' + ctx.a + '）' : '') + '：\n' + clip(ctx.text, 1800) + '\n\n' +
      '请讲解：\n• 大意：用白话串讲（长文只讲最关键的一两段）；\n• 难懂的字词和典故 3–6 个；\n• 写法（或史笔、叙事）上最值得注意的一点；\n• 读这篇时一个常见的误解。\n控制在 400 字以内。' }];
  }

  function askMessages(question, ctx) {
    return [{ role: 'user', content: (ctx.day ? '第 ' + ctx.day + ' 天「' + ctx.title + '」。' : '') + '原文《' + ctx.t + '》：\n' + clip(ctx.text, 1500) + '\n\n我的问题：' + question + '\n请简明回答，300 字以内。' }];
  }

  /** 思辨 / 输出点评。ctx: {day, title, ask, keys[], items:[[题目, 学生的回答]], rubric:[{lv,name,desc}]} */
  function reviewMessages(ctx) {
    const items = ctx.items.filter(x => String(x[1] || '').trim());
    return [{ role: 'user', content: '第 ' + ctx.day + ' 天「' + ctx.title + '」\n' +
      (ctx.ask ? '读前问题：' + ctx.ask + '\n' : '') +
      '本课精读要点：\n' + (ctx.keys || []).map((k, i) => (i + 1) + '. ' + k).join('\n') + '\n\n' +
      items.map(([q, a]) => '【题目】' + q + '\n【学生】' + a).join('\n\n') + '\n\n' +
      '评估标准（讲清度）：' + (ctx.rubric || []).map(r => 'L' + r.lv + ' ' + r.name + '——' + r.desc).join('；') + '\n\n' +
      '请点评：\n① 你估计的等级（L0–L3）和一句理由；\n② 讲清了哪些要点、漏了哪些（对照精读要点）；\n③ 判断有没有依据：证据、反证、成立条件是否到位；\n④ 最值得改的一处，并给一句改写示范；\n⑤ 如有史实、引文或字词错误，指出并标"请核对"。\n' +
      '只依据上面的材料，不要编造；语气直接、具体，不要客套；控制在 350 字以内。' }];
  }

  /* ---------- 用途 ---------- */
  /** 语音输入校对。返回 {text, changed}；结果不可信（字数差太多）时返回原文并带 rejected */
  async function polish(raw, ctx) {
    const r = await chat(polishMessages(raw, ctx), { system: POLISH, temperature: 0, maxTokens: 2000, timeout: 45000 });
    let t = r.text.replace(/^[「“"']+|[」”"']+$/g, '').trim();
    const Z = root && root.ZH;
    if (r.truncated || (Z && !Z.polishOk(raw, t))) return { text: raw, changed: false, rejected: true };
    return { text: t, changed: t !== raw };
  }

  async function explain(ctx, force) {
    const k = 'x:' + ctx.id;
    const old = force ? null : cacheGet(k);
    if (old) return { text: old, cached: true };
    const r = await chat(explainMessages(ctx));
    const text = r.truncated ? r.text + '\n\n（回答较长，后面部分被截断）' : r.text;
    cacheSet(k, text);
    return { text, cached: false };
  }

  async function ask(question, ctx) {
    const r = await chat(askMessages(question, ctx));
    return { text: r.text };
  }

  async function review(ctx, kind, force) {
    const k = 'r:' + ctx.day + ':' + kind + ':' + hash(JSON.stringify(ctx.items));
    const old = force ? null : cacheGet(k);
    if (old) return { text: old, cached: true };
    const r = await chat(reviewMessages(ctx));
    cacheSet(k, r.text);
    return { text: r.text, cached: false };
  }

  /** 「测试连接」：只查询模型列表，不消耗额度。没有 /models 的平台（只在自定义地址下）改发一条很短的聊天 */
  async function test() {
    const want = String(settings().model || '').trim();
    let ids;
    try { ids = await models(); } catch (e) {
      if (isDefaultBase() || (e.status !== 404 && e.status !== 405)) throw e;
      if (!want) throw new Error('这个平台没有模型列表接口，请先填写模型名，再测试连接');
      await call('/chat/completions', { method: 'POST', body: JSON.stringify({ model: want, messages: [{ role: 'user', content: '请只回复：成功' }], max_tokens: 16, stream: false }) }, 30000);
      return { models: [], using: want };
    }
    if (ids.length && want && ids.indexOf(want) < 0) throw new Error('Key 有效，但账户里没有模型「' + want + '」。可用的模型有：' + ids.join('、'));
    return { models: ids, using: want || pick(ids) };
  }

  return { ready, settings, save, test, models, polish, explain, ask, review, cacheGet, hash, validBase, DEFAULT_BASE,
    prompts: { SYSTEM, POLISH, polishMessages, explainMessages, askMessages, reviewMessages } };
});
