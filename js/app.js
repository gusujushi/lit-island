/* 文学能力岛 · 界面（单页，hash 路由）。依赖：LIT、Plan、SRS、Store（均为全局）。 */
(function () {
  'use strict';

  /* ---------- 基础 ---------- */
  function safeStorage() {
    try { const k = '__lit_t'; localStorage.setItem(k, '1'); localStorage.removeItem(k); return localStorage; } catch (e) { return null; }
  }
  const S = Store.create(safeStorage());
  const st = () => S.state;
  const today = () => Plan.today();
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = sel => document.querySelector(sel);
  const MODES = LIT.meta.modes;
  const WEEK = ['日', '一', '二', '三', '四', '五', '六'];
  const STEPS = ['导读', '原文', '精读', '思辨', '输出'];
  let saveTimer = null;
  const saveSoon = () => { clearTimeout(saveTimer); saveTimer = setTimeout(() => S.save(), 300); };

  function toast(msg) {
    const t = $('#toast'); if (!t) return;
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 2200);
  }

  function schedule() {
    const s = st().settings;
    return Plan.schedule({ total: LIT.total(), start: s.start || today(), weekdays: s.weekdays, rebase: st().rebase });
  }
  const isDone = n => Store.isDone(st(), n);
  const modOf = d => (d.type === 'review' ? { name: d.month ? '月度回顾' : '复习日', emoji: '🔁', color: '#777' } : LIT.meta.modules[d.mod]);

  /* 打乱选项（按天＋题号固定种子，每次打开顺序一致） */
  function order(n, qi, len) {
    const a = []; for (let i = 0; i < len; i++) a.push(i);
    let s = (n * 131 + qi * 17 + 7) % 2147483647;
    for (let i = a.length - 1; i > 0; i--) { s = (s * 48271) % 2147483647; const j = s % (i + 1); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  const textOf = id => {
    const t = LIT.texts[id]; if (!t) return '';
    return st().settings.script === 'trad' && t.trad ? t.trad : t.simp;
  };
  const len = s => String(s || '').replace(/\s/g, '').length;

  /* ---------- 朗读 ---------- */
  function speak(text) {
    if (!('speechSynthesis' in window)) { toast('这个浏览器不支持朗读'); return; }
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text.replace(/〔[^〕]*〕/g, ''));
    u.lang = 'zh-CN'; u.rate = +st().settings.tts || 0.85;
    const v = speechSynthesis.getVoices().find(x => /zh[-_]CN/i.test(x.lang)) || speechSynthesis.getVoices().find(x => /^zh/i.test(x.lang));
    if (v) u.voice = v;
    speechSynthesis.speak(u);
  }

  /* ---------- 组件 ---------- */
  const chip = d => { const m = modOf(d); return `<span class="chip" style="--c:${m.color}">${m.emoji} ${esc(m.name)}</span>`; };
  const area = (bind, val, ph, rows) => `<div class="ta"><textarea data-bind="${bind}" rows="${rows || 4}" placeholder="${esc(ph || '')}">${esc(val || '')}</textarea><button class="mic${voice.bind === bind ? (voice.phase === 'rec' ? ' on' : ' busy') : ''}" data-act="mic" data-target="${bind}" title="语音输入" aria-label="语音输入">🎤</button></div><div class="count"><span class="vstat" data-vstat="${bind}">${voice.bind === bind ? esc(voice.msg || '') : ''}</span><span data-count="${bind}">${len(val)} 字</span></div>`;

  /* ---------- 语音输入：录音 → 本机 Whisper 识别（模型与意大利语能力岛共用，音频不出设备）→ DeepSeek 校对（可选，只发文字） ---------- */
  const MAX_REC = 120;                                   // 一次最多录 2 分钟（自动停止）
  const voice = { bind: null, phase: null, rec: null, timer: null, at: null, msg: '', last: null };
  const vTarget = bind => document.querySelector(`textarea[data-bind="${bind}"]`);
  function vStatus(bind, html) {
    if (voice.bind === bind) voice.msg = html.replace(/<[^>]+>/g, '');
    const el = document.querySelector(`[data-vstat="${bind}"]`); if (el) el.innerHTML = html;
  }
  function vButtons() {
    document.querySelectorAll('.mic').forEach(b => {
      const mine = b.dataset.target === voice.bind;
      b.classList.toggle('on', mine && voice.phase === 'rec');
      b.classList.toggle('busy', mine && (voice.phase === 'asr' || voice.phase === 'ai' || voice.phase === 'dl'));
    });
  }
  function vReset() { clearInterval(voice.timer); voice.bind = null; voice.phase = null; voice.rec = null; voice.msg = ''; vButtons(); }

  /** 这个输入框在答哪道题、属于哪一课 —— 给 DeepSeek 校对时判断书名、人名、引文用 */
  function voiceCtx(bind) {
    const [kind, a, path] = bind.split(':');
    const textsOf = ids => (ids || []).slice(0, 2).filter(id => LIT.texts[id]).map(id => ({ t: LIT.texts[id].t, a: LIT.texts[id].a, text: LIT.texts[id].simp }));
    if (kind === 'ask') { const t = LIT.texts[a]; return t ? { title: t.t, texts: textsOf([a]), question: '对这篇原文的提问' } : {}; }
    let n = +a, q = '';
    if (kind === 'rev') {
      const m = /^(recall|revise)\.(\d+)$/.exec(path || '');
      if (!m) { const d = LIT.day(n); return { title: '复习日', question: '复习（本轮各课：' + ((d && d.covers) || []).map(k => LIT.learn[k].title).join('、') + '）', texts: [], words: [] }; }
      n = +m[2]; q = m[1] === 'recall' ? LIT.learn[n].retell : LIT.learn[n].judge;
    }
    const d = LIT.learn[n]; if (!d) return {};
    const k = LIT.classics[n];
    const Q = { 'notes.ask': d.ask, 'notes.retell': d.retell, 'notes.judge': d.judge, 'notes.link': d.link, 'notes.out': d.out, 'notes.classic': k ? '用「' + k.item + '」造一个句子' : '' };
    return { day: n, title: d.title, question: q || Q[path] || '', texts: textsOf(d.texts), words: (d.notes || []).map(x => x[0]).slice(0, 15).concat(k ? [k.item] : []) };
  }

  /** 把文字插进输入框（输入框不在屏幕上时直接写进进度） */
  function vInsert(bind, text) {
    const ta = vTarget(bind);
    const [kind, n, path] = bind.split(':');
    let cur = ta ? ta.value : '';
    if (!ta && (kind === 'day' || kind === 'rev')) { const rec = kind === 'day' ? Store.dayRec(st(), +n) : Store.revRec(st(), +n); cur = path.split('.').reduce((o, k) => (o ? o[k] : ''), rec) || ''; }
    const r = ZH.insertAt(cur, voice.at, text);
    if (ta) {
      ta.value = r.value; ta.dispatchEvent(new Event('input', { bubbles: true }));
      try { ta.setSelectionRange(r.end, r.end); } catch (e) { /* 不可选中 */ }
    } else if (kind === 'day' || kind === 'rev') {
      const rec = kind === 'day' ? Store.dayRec(st(), +n) : Store.revRec(st(), +n); setPath(rec, path, r.value);
    }
    S.save();
  }

  async function micTap(bind) {
    if (voice.phase === 'rec' && voice.bind === bind) { voiceFinish(); return; }
    if (voice.phase) { toast(voice.phase === 'rec' ? '另一个输入框正在录音，先点那里的 🎤 结束' : '上一段还在处理，请稍等'); return; }
    const sup = ASR.supported();
    if (!sup.ok) { toast(sup.text + ' 也可以用手机键盘自带的听写键。'); return; }
    if (!(await ASR.cached())) {
      if (!confirm(`第一次用语音输入，需要下载本机语音识别模型（约 ${ASR.TOTAL_MB} MB，和意大利语能力岛共用一份）。下载后断网也能用，录音不会上传。建议连 Wi-Fi。现在下载？`)) return;
      voice.bind = bind; voice.phase = 'dl'; vButtons();
      try {
        await ASR.download((p) => vStatus(bind, `正在下载语音模型 ${Math.round(p * 100)}%…`));
        if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
        vReset(); vStatus(bind, '语音模型已下载。再点 🎤 开始说话。');
      } catch (e) { vReset(); vStatus(bind, ''); alert('下载没有完成：' + e.message); }
      return;
    }
    const ta = vTarget(bind);
    voice.at = ta && document.activeElement === ta && typeof ta.selectionStart === 'number' ? ta.selectionStart : null;
    const rec = Audio16.Recorder(MAX_REC);
    rec.onAuto = () => { if (voice.rec === rec) voiceFinish(); };
    try { await rec.start(); } catch (e) {
      const m = e && e.name === 'NotAllowedError' ? '没有麦克风权限：请在浏览器设置里允许本网站使用麦克风' : e && e.name === 'NotFoundError' ? '找不到麦克风' : '无法录音：' + (e && e.message || e);
      toast(m); return;
    }
    voice.bind = bind; voice.phase = 'rec'; voice.rec = rec; vButtons();
    const tick = () => vStatus(bind, `● 正在录音 ${Math.floor(rec.secs)} 秒……说完再点一次 🎤（最长 ${MAX_REC / 60} 分钟）`);
    tick(); voice.timer = setInterval(tick, 500);
    ASR.load().catch(() => {});                          // 边说边把模型加载进内存
  }

  async function voiceFinish() {
    const bind = voice.bind, rec = voice.rec;
    if (!rec) return;
    clearInterval(voice.timer);
    voice.phase = 'asr'; vButtons(); vStatus(bind, '识别中……');
    let note = '';
    try {
      const pcm = await rec.stop();
      if (Audio16.stats(pcm).quiet) throw new Error('没有听到声音：靠近麦克风再说一次');
      await ASR.load(p => vStatus(bind, `正在加载语音模型 ${Math.round(p * 100)}%…`));
      const raw = await ASR.transcribeLong(pcm, (i, n) => vStatus(bind, n > 1 ? `识别中 ${i}/${n}……` : '识别中……'));
      const text = ZH.cleanDictation(raw);
      if (!text) throw new Error('没有识别出文字，再说一次试试');
      let out = text, fixed = false;
      if (AI.ready() && AI.settings().polish !== false) {
        voice.phase = 'ai'; vButtons(); vStatus(bind, 'DeepSeek 校对中……');
        try {
          const r = await AI.polish(text, voiceCtx(bind));
          if (r.changed) { out = r.text; fixed = true; } else if (r.rejected) note = 'AI 校对结果和原话出入太大，已保留原识别';
        } catch (e) { note = 'AI 校对没成功（' + e.message + '），已保留原识别'; }
      }
      vInsert(bind, out);
      voice.last = fixed ? { bind, raw: text, text: out } : null;
      vReset();
      vStatus(bind, fixed ? `已用 DeepSeek 校对 <button class="mini" data-act="vundo" data-target="${bind}">撤销校对</button>` : esc(note || '已转成文字，可以直接改'));
    } catch (e) {
      vReset(); vStatus(bind, ''); toast(e.message || String(e));
    }
  }

  function voiceCancel() { if (voice.phase === 'rec' && voice.rec) { const b = voice.bind; voice.rec.cancel(); vReset(); vStatus(b, ''); toast('已取消录音'); } }

  /* ---------- AI 老师（DeepSeek，可选）：讲解原文、回答提问、点评思辨与输出 ---------- */
  const aiView = {};                                     // key → {loading, text, error, cached}
  const aiFmt = t => esc(t).replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>');
  function aiInner(key) {
    const v = aiView[key];
    if (!v) return '';
    if (v.loading) return '<p class="muted">🤖 AI 老师正在写……（通常 5–30 秒）</p>';
    if (v.error) return `<p class="warn">AI 没有回答：${esc(v.error)}</p>`;
    if (!v.text) return '';
    return `<div class="aitext">${aiFmt(v.text)}</div><p class="hint">🤖 DeepSeek 生成${v.cached ? '（之前的结果）' : ''}，仅供参考；史实与引文请对照原文和注本核对。${v.redo ? ` <button class="mini" data-act="${v.redo}" ${v.redoAttr || ''} data-force="1">重新生成</button>` : ''}</p>`;
  }
  const aiBox = key => `<div class="aibox" data-ai="${esc(key)}">${aiInner(key)}</div>`;
  function aiPaint(key) { const el = document.querySelector(`[data-ai="${key}"]`); if (el) el.innerHTML = aiInner(key); }
  async function aiRun(key, fn, redo, redoAttr) {
    if (!AI.ready()) { toast('先在「我的 → AI 老师」填写 DeepSeek API Key（可选功能）'); return; }
    if (aiView[key] && aiView[key].loading) return;
    aiView[key] = { loading: true, redo, redoAttr };
    aiPaint(key);
    try { const r = await fn(); Object.assign(aiView[key], { loading: false, text: r.text, cached: !!r.cached }); }
    catch (e) { Object.assign(aiView[key], { loading: false, error: e.message || String(e) }); }
    aiPaint(key);
  }
  const textCtx = (id, n) => { const t = LIT.texts[id], d = LIT.learn[n]; return { id, day: n, title: d ? d.title : '', t: t.t, a: t.a, text: t.simp }; };
  function reviewCtx(n, kind) {
    const d = LIT.learn[n], nt = Store.dayRec(st(), n).notes || {}, k = LIT.classics[n];
    const items = kind === 'think' ? [[d.retell, nt.retell], [d.judge, nt.judge], [d.link, nt.link]]
      : [[d.out, nt.out]].concat(k ? [['用今日经典「' + k.item + '」造一个句子', nt.classic]] : []);
    return { day: n, title: d.title, ask: d.ask, keys: d.keys, items, rubric: LIT.meta.rubric };
  }
  const voiceHint = () => `<p class="hint">🎤 点输入框右下角的麦克风说话，再点一次结束：本机识别成文字（录音不上传）${AI.ready() && AI.settings().polish !== false ? '，再由 DeepSeek 按本课内容校对错字' : ''}。也可以用手机键盘自带的听写键。</p>`;
  const aiHint = () => (AI.ready() ? '' : '<p class="hint">🤖 想请 AI 老师讲解、点评：在「我的 → AI 老师」填上自己的 DeepSeek API Key（可选）。</p>');

  /* ---------- 注本页图（手机上看注本） ---------- */
  let PG = null;
  if (window.Pages) Pages.getManifest().then(m => { if (m) { PG = m; render(); } }).catch(() => {});
  function openViewer(key, title) {
    const names = (PG && PG.refs[key]) || [];
    if (!names.length) return;
    const v = document.createElement('div');
    v.className = 'viewer'; v.id = 'viewer';
    v.innerHTML = `<div class="vbar"><b>${esc(title)}</b><span><button class="mini" data-act="vzoom">放大</button> <button class="mini" data-act="vclose">关闭</button></span></div><div class="vbody">${names.map(n => `<figure><img alt="${esc(n)}" data-name="${esc(n)}"><figcaption>${esc(n.replace(/^(\w+)_0*(\d+)\.\w+$/, '第 $2 页'))}</figcaption></figure>`).join('')}</div>`;
    document.body.appendChild(v);
    document.body.classList.add('noscroll');
    v.querySelectorAll('img').forEach(img => Pages.get(img.dataset.name).then(b => { if (b) img.src = URL.createObjectURL(b); }));
  }
  function closeViewer() {
    const v = $('#viewer'); if (!v) return;
    v.querySelectorAll('img').forEach(img => { if (img.src.startsWith('blob:')) URL.revokeObjectURL(img.src); });
    v.remove(); document.body.classList.remove('noscroll');
  }

  function bookRef(ref) {
    const b = LIT.bookRef(ref);
    const approx = /约/.test(b.how || '') || /约/.test(b.what || '');
    const link = b.path ? ` <a class="mini" href="file://${encodeURI(b.path)}#page=${b.page}" target="_blank" rel="noopener">打开</a> <button class="mini" data-act="copy" data-text="${esc(b.path)}">复制路径</button>` : '';
    const key = `${b.key}:${b.page}`;
    const pics = PG && PG.refs[key] ? ` <button class="mini pic" data-act="pages" data-key="${key}" data-title="《${esc(b.name)}》第 ${b.page} 页起">📷 看 ${PG.refs[key].length} 页</button>` : '';
    return `<li>📖 <b>《${esc(b.name)}》</b> PDF 第 <b>${b.page}</b> 页${approx ? '（约）' : ''} — ${esc(b.what)}${pics}${link}</li>`;
  }

  function nav(active) {
    const items = [['today', '🏝️', '今日'], ['map', '🗺️', '地图'], ['cards', '🃏', '卡片'], ['notes', '📝', '笔记'], ['me', '📊', '我的'], ['guide', '📖', '方法']];
    const due = SRS.dueList(st().cards, today()).length;
    return items.map(([k, ic, name]) => `<a href="#/${k}" class="${active === k ? 'on' : ''}"><span>${ic}</span>${name}${k === 'cards' && due ? `<i class="badge">${due}</i>` : ''}</a>`).join('');
  }

  /* ---------- 视图：今日 ---------- */
  function viewToday() {
    const s = st().settings;
    if (!s.start) {
      return `<section class="card hero">
        <h1>🏝️ 文学能力岛</h1>
        <p class="lead">九十天，每天 15–40 分钟：诗经、唐诗、宋词、元曲、魏晋、五代、十六国诸燕、明清、公案。不是为了显得有文化，是让脑子不生锈，练出底气和判断力。</p>
        <div class="form">
          <label>开始日期 <input type="date" id="f-start" value="${today()}"></label>
          <div class="label">每周学习日</div>
          <div class="weeks">${[1, 2, 3, 4, 5, 6, 0].map(w => `<label class="wk"><input type="checkbox" class="f-week" value="${w}" checked>周${WEEK[w]}</label>`).join('')}</div>
          <div class="label">默认时长</div>
          <div class="seg">${Object.keys(MODES).map(k => `<label><input type="radio" name="f-mode" value="${k}" ${k === 'std' ? 'checked' : ''}>${MODES[k].name}</label>`).join('')}</div>
          <button class="btn big" data-act="begin">开始第 1 天</button>
        </div>
        <p class="hint">之后都可以在「我的 → 设置」里改。进度只保存在这台设备的浏览器里。</p>
      </section>`;
    }
    const dates = schedule();
    const sum = Plan.status(dates, isDone, today());
    const due = SRS.dueList(st().cards, today()).length;
    const doneDates = Object.values(st().days).map(r => r.done).concat(Object.values(st().reviews).map(r => r.done)).filter(Boolean);
    const streak = Plan.streak(doneDates, today());
    let main;
    if (sum.next === null) {
      main = `<section class="card hero"><h2>🎉 九十天完成</h2><p>去「我的」看看各模块的讲清度，再读「方法」里的第二轮建议。</p></section>`;
    } else {
      const d = LIT.day(sum.next);
      const mode = (st().days[sum.next] && st().days[sum.next].mode) || s.mode;
      main = `<section class="card hero">
        <div class="kicker">下一课 · 第 ${d.d} 天 · 计划 ${dates[d.d - 1]}</div>
        <h2>${esc(d.title)}</h2>
        <div class="row">${chip(d)}${d.type === 'learn' ? `<span class="muted">${(d.texts || []).map(id => '《' + esc(LIT.texts[id] ? LIT.texts[id].t : id) + '》').join(' ')}</span>` : ''}</div>
        ${d.type === 'learn' ? `<div class="seg mode">${Object.keys(MODES).map(k => `<button class="${k === mode ? 'on' : ''}" data-act="pickmode" data-n="${d.d}" data-mode="${k}">${MODES[k].name}</button>`).join('')}</div>` : ''}
        <a class="btn big" href="#/day/${d.d}">${isStarted(d.d) ? '继续' : '开始'} →</a>
      </section>`;
    }
    const lag = sum.behind.length;
    const lagTxt = lag ? `<span class="warn">落后 ${lag} 个单元</span>` : sum.ahead ? `<span class="ok">超前 ${sum.ahead} 个单元</span>` : '<span class="ok">正好在计划上</span>';
    const upcoming = [];
    for (let n = sum.next || LIT.total() + 1; n <= LIT.total() && upcoming.length < 5; n++) if (!isDone(n)) upcoming.push(n);
    return `${main}
      <section class="stats">
        <div class="stat"><b>${sum.doneCount}</b><span>/ ${LIT.total()} 已完成</span></div>
        <div class="stat"><b>${sum.due}</b><span>按计划应到第几单元</span></div>
        <div class="stat"><b>${streak}</b><span>连续学习天数</span></div>
        <a class="stat" href="#/cards"><b>${due}</b><span>张卡片到期</span></a>
      </section>
      <section class="card"><div class="row between"><div>${lagTxt}</div>${lag >= 2 ? '<button class="btn ghost" data-act="rebase">从今天重新排期</button>' : ''}</div>
        <div class="phases">${LIT.meta.phases.map(p => { let k = 0; for (let n = p.days[0]; n <= p.days[1]; n++) if (isDone(n)) k++; return `<div class="ph"><div class="row between"><span>${p.emoji} ${esc(p.name)}</span><span class="muted">${k}/30</span></div><div class="bar"><i style="width:${(k / 30) * 100}%;--h:${p.hue}"></i></div></div>`; }).join('')}</div>
      </section>
      ${upcoming.length ? `<section class="card"><h3>接下来</h3><ul class="plain">${upcoming.map(n => { const d = LIT.day(n); return `<li><a href="#/day/${n}"><span class="muted">${dates[n - 1]} · 第 ${n} 天</span> ${esc(d.title)}</a></li>`; }).join('')}</ul></section>` : ''}`;
  }
  const isStarted = n => !!(st().days[n] && (st().days[n].step || Object.keys(st().days[n].notes || {}).length)) || !!st().reviews[n];

  /* ---------- 视图：地图 ---------- */
  function viewMap() {
    const dates = schedule();
    const nextN = Plan.status(dates, isDone, today()).next;
    return `<h1 class="page">学习地图</h1>` + LIT.meta.phases.map(p => {
      const tiles = [];
      for (let n = p.days[0]; n <= p.days[1]; n++) {
        const d = LIT.day(n); const m = modOf(d);
        const rec = d.type === 'review' ? st().reviews[n] : st().days[n];
        const rating = rec && typeof rec.rating === 'number' ? rec.rating : null;
        const cls = ['tile', isDone(n) ? 'done' : '', n === nextN ? 'next' : '', d.type === 'review' ? 'rev' : '', !isDone(n) && dates[n - 1] < today() ? 'late' : ''].join(' ');
        tiles.push(`<a class="${cls}" href="#/day/${n}" title="${esc(d.title)}" style="--c:${m.color}"><b>${n}</b><span>${d.type === 'review' ? (d.month ? '月' : '⟳') : m.emoji}</span>${rating !== null ? `<i class="lv lv${rating}">L${rating}</i>` : ''}</a>`);
      }
      return `<section class="card"><h2>${p.emoji} ${esc(p.name)} <span class="muted">第 ${p.days[0]}–${p.days[1]} 天</span></h2><p class="muted">${esc(p.goal)}</p><div class="tiles">${tiles.join('')}</div></section>`;
    }).join('') + `<p class="hint">颜色条＝模块；⟳＝复习日；月＝月度回顾；红框＝已过计划日期未完成；L0–L3＝你的自评。</p>`;
  }

  /* ---------- 视图：学习日 ---------- */
  function viewDay(n) {
    const d = LIT.day(n);
    if (!d) return `<p>没有第 ${n} 天。</p>`;
    if (d.type === 'review') return viewReview(d);
    const rec = Store.dayRec(st(), n);
    const mode = rec.mode || st().settings.mode;
    const step = Math.min(4, rec.step || 0);
    const dates = schedule();
    const head = `<div class="dayhead">
      <a class="back" href="#/today">← 今日</a>
      <div class="kicker">第 ${n} 天 · 计划 ${dates[n - 1]}${rec.done ? ` · ✅ 已完成于 ${rec.done}` : ''}</div>
      <h1>${esc(d.title)}</h1>
      <div class="row">${chip(d)}<div class="seg mode small">${Object.keys(MODES).map(k => `<button class="${k === mode ? 'on' : ''}" data-act="pickmode" data-n="${n}" data-mode="${k}">${MODES[k].name}</button>`).join('')}</div></div>
      <nav class="steps">${STEPS.map((s, i) => `<button class="${i === step ? 'on' : ''} ${stepDone(d, rec, i) ? 'ok' : ''}" data-act="step" data-n="${n}" data-step="${i}">${i + 1}. ${s}</button>`).join('')}</nav>
    </div>`;
    const body = [stepIntro, stepText, stepClose, stepThink, stepOut][step](d, rec, mode);
    const pager = `<div class="pager">${step > 0 ? `<button class="btn ghost" data-act="step" data-n="${n}" data-step="${step - 1}">← ${STEPS[step - 1]}</button>` : '<span></span>'}${step < 4 ? `<button class="btn" data-act="step" data-n="${n}" data-step="${step + 1}">${STEPS[step + 1]} →</button>` : ''}</div>`;
    return head + `<div class="stepbody">${body}</div>` + pager;
  }

  function stepDone(d, rec, i) {
    const nt = rec.notes || {};
    if (i === 0) return (rec.step || 0) > 0;
    if (i === 1) return (d.texts || []).every(id => rec.read && rec.read[id]);
    if (i === 2) return (d.quiz || []).every((q, k) => rec.quiz && rec.quiz[k] !== undefined);
    if (i === 3) return len(nt.retell) >= 10;
    return !!rec.done;
  }

  function stepIntro(d, rec, mode) {
    return `<section class="card"><h3>背景</h3><p class="prose">${esc(d.bg)}</p></section>
      <section class="card ask"><h3>读前问题</h3><p class="prose">${esc(d.ask)}</p>${mode === 'light' ? '' : area(`day:${d.d}:notes.ask`, rec.notes.ask, '（可选）先写下你的猜想，读完再回来对照', 2)}</section>
      ${d.yan ? `<section class="card yan"><h3>✒️ 与《燕云悲歌》</h3><p class="prose">${esc(d.yan)}</p></section>` : ''}`;
  }

  function textCard(id, rec, optional) {
    const t = LIT.texts[id]; if (!t) return `<p class="warn">缺少原文 ${esc(id)}</p>`;
    const src = t.src || {};
    return `<section class="card text ${optional ? 'opt' : ''}">
      <div class="row between"><h3>${optional ? '选读 · ' : ''}《${esc(t.t)}》 <span class="muted">${esc(t.a)}</span></h3>
      <div class="row"><button class="mini" data-act="speak" data-id="${id}">🔊 朗读</button><button class="mini" data-act="hush">⏹</button>${t.trad ? `<button class="mini" data-act="script">${st().settings.script === 'trad' ? '简' : '繁'}</button>` : ''}</div></div>
      <div class="poem">${esc(textOf(id))}</div>
      <div class="src">来源：${esc(src.file)}${src.loc ? ' · ' + esc(src.loc) : ''}${src.line ? ' · 第 ' + src.line + ' 行' : ''}</div>
      <label class="check"><input type="checkbox" data-act="read" data-n="${rec.n}" data-id="${id}" ${rec.read && rec.read[id] ? 'checked' : ''}> 我已出声诵读一遍</label>
      ${AI.ready() ? `<div class="ai"><button class="mini" data-act="aiexplain" data-id="${id}" data-n="${rec.n}">🤖 请 AI 讲解这篇</button>${aiBox('x:' + id)}
        <div class="askrow">${area(`ask:${id}`, (aiView['q:' + id] || {}).q || '', '对这篇有什么疑问？打字或点 🎤 说', 2)}<button class="btn small" data-act="aiask" data-id="${id}" data-n="${rec.n}">问 AI</button></div>${aiBox('q:' + id)}</div>` : ''}
    </section>`;
  }

  function stepText(d, rec, mode) {
    rec.n = d.d;
    const main = (d.texts || []).map(id => textCard(id, rec, false)).join('');
    const opt = (d.opt || []).length ? (mode === 'deep' ? d.opt.map(id => textCard(id, rec, true)).join('') : `<details class="card"><summary>选读 ${d.opt.length} 篇（深读档会自动展开）</summary>${d.opt.map(id => textCard(id, rec, true)).join('')}</details>`) : '';
    delete rec.n;
    return main + opt + aiHint();
  }

  function stepClose(d, rec, mode) {
    const notes = (d.notes || []).map(([w, g]) => `<tr><th>${esc(w)}</th><td>${esc(g)}</td></tr>`).join('');
    const quiz = (d.quiz || []).map((q, qi) => {
      const chosen = rec.quiz ? rec.quiz[qi] : undefined;
      const opts = order(d.d, qi, q[1].length).map(o => {
        const cls = chosen === undefined ? '' : o === 0 ? 'right' : o === chosen ? 'wrong' : '';
        return `<button class="opt ${cls}" data-act="quiz" data-n="${d.d}" data-q="${qi}" data-o="${o}" ${chosen !== undefined ? 'disabled' : ''}>${esc(q[1][o])}</button>`;
      }).join('');
      return `<div class="q"><p>${qi + 1}. ${esc(q[0])}</p><div class="opts">${opts}</div>${chosen !== undefined ? `<p class="why ${chosen === 0 ? 'ok' : 'warn'}">${chosen === 0 ? '✓ 对' : '✗ 不对'}：${esc(q[2])}</p>` : ''}</div>`;
    }).join('');
    const books = (d.book || []).length ? `<section class="card ${mode === 'deep' ? 'hl' : ''}"><h3>本机注本${mode === 'deep' ? '（深读档：今天读这几页）' : '（深读时读）'}</h3><ul class="plain">${d.book.map(bookRef).join('')}</ul>${PG ? '' : '<p class="hint">📱 想在手机上看这些页：电脑上生成"注本图包"传到手机后，在「我的 → 注本页图」导入一次即可。</p>'}${LIT.local ? '' : '<p class="hint">💻 在电脑上运行 tools/make_local_books.py 后，这里会出现"打开"按钮。</p>'}</section>` : '';
    const k = LIT.classics[d.d];
    const li = rows => rows.map(([w, t]) => `<li><b>${esc(w)}</b>：${esc(t)}</li>`).join('');
    const classic = k ? `<section class="card classic"><h3>📌 今日经典 · ${esc(k.k)}</h3><p class="citem">${esc(k.item)}</p><p class="muted">出处：${esc(k.src)}</p>
      <h4>为什么经典</h4><p class="prose">${esc(k.why)}</p>
      <h4>古人怎么用</h4><ul class="dots">${li(k.old)}</ul>
      <h4>近现代怎么用</h4><ul class="dots">${li(k.now)}</ul>
      <h4>你可以这样用</h4><ul class="dots">${k.use.map(([sc, ex]) => `<li><span class="tag">${esc(sc)}</span>${esc(ex)}</li>`).join('')}</ul>
      ${k.tip ? `<p class="hint">⚠️ ${esc(k.tip)}</p>` : ''}</section>` : '';
    const more = d.more ? `<section class="card"><h3>延伸阅读（本机全本）</h3><p class="prose">📂 ${esc(d.more)}</p><p class="hint">在电脑上打开「书籍/文学」文件夹即可找到；读完可以回到"对照"题写一句。</p></section>` : '';
    return `<section class="card"><h3>字词</h3><table class="gloss">${notes}</table></section>
      <section class="card"><h3>精读要点</h3><ol class="keys">${(d.keys || []).map(x => `<li>${esc(x)}</li>`).join('')}</ol></section>
      ${classic}${books}${more}
      ${mode === 'light' ? '' : `<section class="card"><h3>小测</h3>${quiz}</section>`}`;
  }

  function stepThink(d, rec, mode) {
    const nt = rec.notes;
    const four = '<details class="hint"><summary>判断四问</summary>证据：哪一句支持你？ 反证：哪一句不支持？ 条件：什么情况下成立／失效？ 代价：照此去做，代价由谁承担？</details>';
    return `${voiceHint()}<section class="card"><h3>复述 <span class="muted">（合上原文再写）</span></h3><p class="prose">${esc(d.retell)}</p>${area(`day:${d.d}:notes.retell`, nt.retell, '用自己的话，不抄原句', 4)}</section>
      ${mode === 'light' ? '<p class="hint">轻量档只需复述。判断与对照可以留到复习日。</p>' : `
      <section class="card"><h3>判断</h3><p class="prose">${esc(d.judge)}</p>${four}${area(`day:${d.d}:notes.judge`, nt.judge, '观点＋证据＋条件', 5)}<p class="hint">写满 10 字，这条判断会变成一张"判断卡"，过几天回来问你还同不同意。</p></section>
      <section class="card"><h3>对照</h3><p class="prose">${esc(d.link)}</p>${area(`day:${d.d}:notes.link`, nt.link, '跨时代、跨文本、或联系你的处境', 3)}</section>`}
      ${AI.ready() ? `<section class="card ai"><button class="btn ghost" data-act="aireview" data-n="${d.d}" data-kind="think">🤖 请 AI 老师点评我的复述与判断</button>${aiBox('r:' + d.d + ':think')}</section>` : aiHint()}`;
  }

  function stepOut(d, rec, mode) {
    const R = LIT.meta.rubric;
    const done = rec.done ? `<section class="card done"><h3>✅ 第 ${d.d} 天已完成（${rec.done}）</h3><p>本日卡片已进入复习盒。</p><div class="row"><a class="btn" href="#/today">回到今日</a>${d.d < LIT.total() ? `<a class="btn ghost" href="#/day/${d.d + 1}">下一天 →</a>` : ''}</div></section>` : '';
    const k = LIT.classics[d.d];
    const kuse = k && mode !== 'light' ? `<section class="card"><h3>用今日经典造一句 <span class="muted">（可选）</span></h3><p class="prose">「${esc(k.item)}」——写一个和你的工作或生活有关的句子。</p>${area(`day:${d.d}:notes.classic`, rec.notes.classic, '例：' + k.use[0][1], 2)}</section>` : '';
    return `${voiceHint()}<section class="card"><h3>输出${mode === 'light' ? '（轻量档可选）' : ''}</h3><p class="prose">${esc(d.out)}</p>${area(`day:${d.d}:notes.out`, rec.notes.out, mode === 'deep' ? '深读档：写满 200 字' : '50–200 字，有一句是你自己的判断', 6)}</section>
      ${kuse}
      ${AI.ready() ? `<section class="card ai"><button class="btn ghost" data-act="aireview" data-n="${d.d}" data-kind="out">🤖 请 AI 老师点评我的输出</button>${aiBox('r:' + d.d + ':out')}</section>` : ''}
      <section class="card"><h3>自评：今天这一课，我能讲清到哪一级？</h3><div class="rubric">${R.map(r => `<label class="${rec.rating === r.lv ? 'on' : ''}"><input type="radio" name="rating" data-act="rate" data-n="${d.d}" value="${r.lv}" ${rec.rating === r.lv ? 'checked' : ''}><b>L${r.lv} ${esc(r.name)}</b><span>${esc(r.desc)}</span></label>`).join('')}</div></section>
      ${done || `<button class="btn big" data-act="finish" data-n="${d.d}">完成第 ${d.d} 天</button><p class="hint">完成条件：复述至少 10 字 ＋ 选一个自评等级。</p>`}`;
  }

  /* ---------- 视图：复习日 ---------- */
  function viewReview(d) {
    const n = d.d;
    const r = Store.revRec(st(), n);
    const due = SRS.dueList(st().cards, today()).length;
    const R = LIT.meta.rubric;
    const recall = d.covers.map(k => {
      const L = LIT.learn[k]; const old = (st().days[k] && st().days[k].notes && st().days[k].notes.retell) || '';
      const shown = r.show && r.show[k];
      return `<div class="recall"><h4>第 ${k} 天 · ${esc(L.title)}</h4><p class="muted">${esc(L.retell)}</p>
        ${area(`rev:${n}:recall.${k}`, r.recall[k], '不看笔记，再讲一遍', 3)}
        <div class="row"><button class="mini" data-act="reveal" data-n="${n}" data-k="${k}">${shown ? '收起' : '对照当时的复述'}</button>
        <span class="rates">${R.map(x => `<button class="mini ${r.rate[k] === x.lv ? 'on' : ''}" data-act="rrate" data-n="${n}" data-k="${k}" data-lv="${x.lv}" title="${esc(x.desc)}">L${x.lv}</button>`).join('')}</span></div>
        ${shown ? `<blockquote>${old ? esc(old) : '<span class="muted">（当时没有写复述）</span>'}</blockquote>` : ''}</div>`;
    }).join('');
    const revise = d.covers.filter(k => st().days[k] && st().days[k].notes && len(st().days[k].notes.judge) >= 1).map(k => {
      const L = LIT.learn[k];
      return `<div class="recall"><h4>第 ${k} 天判断题</h4><p class="muted">${esc(L.judge)}</p><blockquote>${esc(st().days[k].notes.judge)}</blockquote>${area(`rev:${n}:revise.${k}`, r.revise[k], '现在还同意吗？要修正哪一句、为什么？', 2)}</div>`;
    }).join('');
    let month = '';
    if (d.month) {
      const ph = LIT.meta.phases.find(p => p.id === d.phase);
      const sts = Store.stats(st(), LIT);
      const rows = Object.keys(LIT.meta.modules).filter(k => LIT.meta.modules[k].phase <= ph.id).map(k => {
        const m = LIT.meta.modules[k], s = sts[k];
        return `<tr><th>${m.emoji} ${esc(m.name)}</th><td>${s.done}/${s.total}</td><td>${s.avg === null ? '—' : 'L' + s.avg.toFixed(1)}</td><td>${s.acc === null ? '—' : Math.round(s.acc * 100) + '%'}</td></tr>`;
      }).join('');
      month = `<section class="card hl"><h3>📅 月度回顾 · ${esc(ph.name)}</h3>${ph.month.map((q, i) => `<div class="recall"><h4>${i + 1}. ${esc(q)}</h4>${area(`rev:${n}:month.${i}`, r.month[i], '', 4)}</div>`).join('')}
        <h4>各模块讲清度</h4><table class="gloss"><tr><th>模块</th><td>完成</td><td>平均自评</td><td>小测正确率</td></tr>${rows}</table></section>`;
    }
    return `<div class="dayhead"><a class="back" href="#/today">← 今日</a><div class="kicker">第 ${n} 天${r.done ? ` · ✅ 已完成于 ${r.done}` : ''}</div><h1>${esc(d.title)}</h1></div>
      <section class="card"><h3>① 到期卡片</h3><p>现在有 <b>${due}</b> 张卡片到期。${due ? '<a class="btn" href="#/cards">去复习卡片</a>' : '今天没有到期卡片。'}</p></section>
      ${recall ? `<section class="card"><h3>② 讲清测试</h3><p class="hint">不看笔记，把本轮每一天再复述一遍，然后对照当时写的，给讲清度打分。</p>${recall}</section>` : ''}
      ${revise ? `<section class="card"><h3>③ 判断回看</h3>${revise}</section>` : ''}
      ${month}
      <section class="card"><h3>${d.month ? '⑤' : '④'} 本轮一句话</h3>${area(`rev:${n}:summary`, r.summary, '这一轮最有用的一句话（至少 5 字）', 2)}</section>
      ${r.done ? `<section class="card done"><h3>✅ 复习日已完成</h3><a class="btn" href="#/today">回到今日</a></section>` : `<button class="btn big" data-act="finishrev" data-n="${n}">完成第 ${n} 天</button>`}`;
  }

  /* ---------- 视图：卡片 ---------- */
  let cardFlip = false;
  function viewCards() {
    const cards = st().cards;
    const ids = Object.keys(cards);
    const due = SRS.dueList(cards, today());
    const boxes = [1, 2, 3, 4, 5, 6].map(b => ids.filter(id => cards[id].box === b).length);
    const dist = `<div class="boxes">${boxes.map((c, i) => `<div><b>${c}</b><span>盒 ${i + 1}</span></div>`).join('')}</div>`;
    if (!ids.length) return `<h1 class="page">卡片</h1><section class="card"><p>还没有卡片。每完成一天，名句和概念卡会自动进来。</p></section>`;
    if (!due.length) return `<h1 class="page">卡片</h1><section class="card"><h3>今天的卡片清完了 👍</h3><p class="muted">共 ${ids.length} 张。</p>${dist}</section>`;
    const id = due[0];
    const c = Store.cardContent(st(), id, LIT);
    if (!c) { delete cards[id]; S.save(); return viewCards(); }
    return `<h1 class="page">卡片 <span class="muted">还剩 ${due.length} 张</span></h1>
      <section class="card flash ${c.kind}"><div class="kicker">${c.kind === 'judge' ? '我的判断卡 · ' : ''}来自第 ${c.d} 天 · ${esc(LIT.learn[c.d].title)}</div>
        <div class="front">${esc(c.front)}</div>
        ${cardFlip ? `<div class="back">${c.kind === 'judge' ? '你当时写道：' : ''}${esc(c.back)}</div>${c.kind === 'judge' ? '<p class="hint">现在还同意吗？想修正就去那一天改，或在复习日写进"判断回看"。</p>' : ''}
          <div class="grades"><button data-act="grade" data-id="${id}" data-g="0">不会</button><button data-act="grade" data-id="${id}" data-g="1">模糊</button><button data-act="grade" data-id="${id}" data-g="2">记得</button><button data-act="grade" data-id="${id}" data-g="3">很熟</button></div>`
        : `<button class="btn big" data-act="flip">${c.kind === 'judge' ? '看看我当时怎么说' : '想好了，看答案'}</button>`}
      </section>${dist}`;
  }

  /* ---------- 视图：笔记 ---------- */
  let noteQ = '', noteMod = '';
  function viewNotes() {
    const items = [];
    for (let n = 1; n <= LIT.total(); n++) {
      const d = LIT.day(n);
      if (d.type !== 'learn') continue;
      const r = st().days[n]; if (!r) continue;
      const nt = r.notes || {};
      const all = ['ask', 'retell', 'judge', 'link', 'out'].map(k => nt[k] || '').join(' ');
      if (!all.trim()) continue;
      if (noteMod && d.mod !== noteMod) continue;
      if (noteQ && !(all + d.title).includes(noteQ)) continue;
      items.push(`<a class="note" href="#/day/${n}"><div class="row between"><b>第 ${n} 天 · ${esc(d.title)}</b>${chip(d)}</div>
        ${nt.retell ? `<p><span class="tag">复述</span>${esc(nt.retell.slice(0, 120))}</p>` : ''}${nt.judge ? `<p><span class="tag">判断</span>${esc(nt.judge.slice(0, 120))}</p>` : ''}${nt.out ? `<p><span class="tag">输出</span>${esc(nt.out.slice(0, 120))}</p>` : ''}</a>`);
    }
    return `<h1 class="page">笔记</h1>
      <section class="card row wrap"><input type="search" id="note-q" placeholder="搜索笔记" value="${esc(noteQ)}">
        <select id="note-mod"><option value="">全部模块</option>${Object.keys(LIT.meta.modules).map(k => `<option value="${k}" ${noteMod === k ? 'selected' : ''}>${esc(LIT.meta.modules[k].name)}</option>`).join('')}</select>
        <button class="btn" data-act="exportmd">导出 Markdown</button></section>
      ${items.length ? items.join('') : '<p class="muted">还没有笔记。</p>'}`;
  }

  /* ---------- 视图：我的 ---------- */
  function viewMe() {
    const s = st().settings;
    const sts = Store.stats(st(), LIT);
    const rows = Object.keys(LIT.meta.modules).map(k => {
      const m = LIT.meta.modules[k], x = sts[k];
      const w = x.avg === null ? 0 : (x.avg / 3) * 100;
      return `<tr><th>${m.emoji} ${esc(m.name)}</th><td>${x.done}/${x.total}</td><td><div class="bar small"><i style="width:${w}%;background:${m.color}"></i></div>${x.avg === null ? '—' : 'L' + x.avg.toFixed(1)}</td><td>${x.acc === null ? '—' : Math.round(x.acc * 100) + '%'}</td></tr>`;
    }).join('');
    // 近 12 周热力图
    const cells = []; const end = Plan.parse(today()); const start = Plan.addDays(today(), -83 - end.getDay());
    for (let i = 0; i < 84 + end.getDay() + 1; i++) { const dt = Plan.addDays(start, i); const m = st().log[dt] || 0; cells.push(`<i title="${dt} ${m} 分钟" class="h${m === 0 ? 0 : m < 20 ? 1 : m < 35 ? 2 : 3}"></i>`); }
    const total = Object.values(st().log).reduce((a, b) => a + b, 0);
    return `<h1 class="page">我的</h1>
      <section class="card"><h3>各模块讲清度</h3><table class="gloss"><tr><th>模块</th><td>完成</td><td>平均自评</td><td>小测</td></tr>${rows}</table>
        <p class="hint">评估看"能不能讲清、能不能下有据的判断"（L0–L3），不看读了多少。</p></section>
      <section class="card"><h3>学习记录 <span class="muted">累计约 ${total} 分钟</span></h3><div class="heat">${cells.join('')}</div></section>
      <section class="card"><h3>设置</h3><div class="form">
        <label>开始日期 <input type="date" data-set="start" value="${esc(s.start || today())}"></label>
        <div class="label">每周学习日</div><div class="weeks">${[1, 2, 3, 4, 5, 6, 0].map(w => `<label class="wk"><input type="checkbox" data-act="week" value="${w}" ${Plan.normWeek(s.weekdays).includes(w) ? 'checked' : ''}>周${WEEK[w]}</label>`).join('')}</div>
        <label>默认时长 <select data-set="mode">${Object.keys(MODES).map(k => `<option value="${k}" ${s.mode === k ? 'selected' : ''}>${MODES[k].name}</option>`).join('')}</select></label>
        <label>原文字形 <select data-set="script"><option value="simp" ${s.script === 'simp' ? 'selected' : ''}>简体（自动转换）</option><option value="trad" ${s.script === 'trad' ? 'selected' : ''}>来源原貌（繁体等）</option></select></label>
        <label>朗读语速 <input type="range" min="0.5" max="1.3" step="0.05" data-set="tts" value="${s.tts}"></label>
        <label>字号 <input type="range" min="0.9" max="1.4" step="0.05" data-set="font" value="${s.font}"></label>
        <label>主题 <select data-set="theme"><option value="auto" ${s.theme === 'auto' ? 'selected' : ''}>跟随系统</option><option value="light" ${s.theme === 'light' ? 'selected' : ''}>明亮</option><option value="dark" ${s.theme === 'dark' ? 'selected' : ''}>暗夜</option></select></label>
        <button class="btn ghost" data-act="rebase">从今天重新排期（未完成的单元从今天起顺延）</button>
      </div></section>
      <section class="card"><h3>数据</h3><p class="hint">进度只存在这台设备的浏览器里。换设备或清理浏览器前，先导出备份。</p>
        <div class="row wrap"><button class="btn" data-act="exportjson">导出备份（JSON）</button><button class="btn ghost" data-act="importjson">导入备份</button><button class="btn ghost" data-act="exportmd">导出笔记（Markdown）</button><button class="btn danger" data-act="reset">清空全部进度</button></div>
        <input type="file" id="import-file" accept=".json,application/json" hidden>
        <p class="hint">${LIT.local ? '✅ 已连接本机书籍文件夹：注本页码旁会出现"打开"按钮（电脑本地打开时可用）。' : '本机书籍文件夹未连接：在电脑上运行 <code>python3 tools/make_local_books.py</code> 后刷新。'}</p></section>
      <section class="card"><h3>📷 注本页图（在手机上看注本）</h3>
        <p>${PG ? `✅ 已导入 ${PG.count} 张页图，约 ${Math.round(PG.bytes / 1048576)} MB，覆盖 ${Object.keys(PG.refs).length} 条注本页码（${esc(PG.imported || '')} 导入，图包 ${esc(PG.version || '')}）。` : '尚未导入。'}</p>
        <ol class="dots"><li>在电脑上运行 <code>python3 tools/make_page_images.py</code>，生成"注本图包"zip。</li><li>用隔空投送（AirDrop）发到 iPhone，存进「文件」；或放进 Google Drive。</li><li>在这里点「导入注本图包」，选中那个 zip——只需一次，之后每课的注本旁会出现"📷 看图"。</li></ol>
        <p class="hint">手机浏览器不能自己去翻「文件」，所以第一次要你手动选一下；导入后图片存在本机程序里，断网也能看。注本有版权，图包只供你自己学习，不要外传。</p>
        <div class="row wrap"><button class="btn" data-act="importpages">导入注本图包</button>${PG ? '<button class="btn ghost" data-act="clearpages">删除已导入的页图</button>' : ''}</div>
        <input type="file" id="pages-file" accept=".zip,application/zip,application/x-zip-compressed" hidden></section>
      <section class="card" id="asr-card"><h3>🎤 语音输入（本机识别）</h3>
        <p>每个输入框右下角都有 🎤：点一下开始说，再点一下结束，说的话会转成文字插进去。</p>
        <ul class="dots"><li>识别用的是本机的 Whisper 语音模型（和意大利语能力岛同一套、同一份文件），在你的手机或电脑上运行，<b>录音不上传</b>，也不保存。</li>
        <li>第一次使用要下载模型，约 ${ASR.TOTAL_MB} MB；下载后断网也能用。在同一个浏览器里，意大利语能力岛下载过就不用再下（iPhone 添加到主屏幕的两个应用各自存储，可能要各下一次）。</li>
        <li>这个小模型对古文、人名、书名常写错同音字：填了下面的 DeepSeek Key，识别完会自动按本课内容校对一遍（只发文字）。</li>
        <li>需要通过网址打开（https）；直接双击打开的本地文件用不了，可以改用手机键盘自带的听写键。</li></ul>
        <p id="asr-status" class="muted">正在检查……</p>
        <div class="bar" id="asr-bar" hidden><i style="width:0"></i></div>
        <div class="row wrap" id="asr-btns"></div></section>
      <section class="card" id="ai-card"><h3>🤖 AI 老师（DeepSeek，可选）</h3>
        <p>填上你自己的 DeepSeek API Key 之后：语音输入会自动校对错字；原文旁可以「请 AI 讲解」和提问；思辨、输出可以请 AI 按讲清度（L0–L3）点评。</p>
        <div class="form">
          <label>API Key <input type="password" autocomplete="off" spellcheck="false" data-ai-set="apiKey" value="${esc(AI.settings().apiKey)}" placeholder="sk-……（在 platform.deepseek.com 申请）"></label>
          <label>接口地址 <input type="url" spellcheck="false" data-ai-set="base" value="${esc(AI.settings().base)}" placeholder="${AI.DEFAULT_BASE}（留空即可）"></label>
          <label>模型 <input type="text" spellcheck="false" data-ai-set="model" value="${esc(AI.settings().model)}" placeholder="留空自动选择（优先 flash）"></label>
          <label class="check"><input type="checkbox" data-ai-set="polish" ${AI.settings().polish !== false ? 'checked' : ''}> 语音识别后自动用 DeepSeek 校对错字</label>
        </div>
        <div class="row wrap"><button class="btn ghost" data-act="aitest">测试连接</button>${AI.ready() ? '<button class="btn danger" data-act="aiclear">清除 Key</button>' : ''}</div>
        <p id="ai-test" class="muted"></p>
        <p class="hint">Key 只存在这台设备的浏览器里，导出备份不含 Key；请求由浏览器直接发给 DeepSeek。发出去的只有文字（题目、要点、原文摘录、你写或说的话），没有录音。费用按 DeepSeek 账户计；同一内容的讲解和点评会记在本机，不重复花钱。</p></section>`;
  }

  /* ---------- 视图：方法 ---------- */
  function viewGuide() {
    const block = b => {
      if (typeof b === 'string') return `<p class="prose">${esc(b)}</p>`;
      if (b.list) return `<ul class="dots">${b.list.map(x => `<li>${esc(x)}</li>`).join('')}</ul>`;
      if (b.table) return `<div class="scroll"><table class="gloss wide"><tr>${b.table[0].map(c => `<th>${esc(c)}</th>`).join('')}</tr>${b.table.slice(1).map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</table></div>`;
      return '';
    };
    return `<h1 class="page">方法</h1>` + (LIT.guide || []).map(sec => `<section class="card" id="g-${sec.id}"><h2>${esc(sec.h)}</h2>${sec.body.map(block).join('')}</section>`).join('');
  }

  /* ---------- 路由与渲染 ---------- */
  function route() {
    const h = (location.hash || '#/today').slice(2).split('/');
    return { name: h[0] || 'today', arg: h[1] };
  }
  function render() {
    const r = route();
    const s = st().settings;
    document.documentElement.style.setProperty('--fs', s.font || 1);
    if (s.theme === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', s.theme);
    const views = { today: viewToday, map: viewMap, day: () => viewDay(+r.arg), cards: viewCards, notes: viewNotes, me: viewMe, guide: viewGuide };
    const v = views[r.name] || viewToday;
    $('#view').innerHTML = v();
    const active = r.name === 'day' ? 'today' : r.name;
    $('#nav').innerHTML = nav(active);
    $('#bottom').innerHTML = nav(active);
    document.body.dataset.route = r.name;
    if (r.name === 'me') asrCard();
  }

  /** 「我的 → 语音输入」：模型下载状态与按钮 */
  async function asrCard() {
    const stEl = $('#asr-status'), btns = $('#asr-btns'); if (!stEl) return;
    const x = await ASR.status();
    if (!$('#asr-status')) return;
    if (!x.supported) { stEl.textContent = '⚠️ ' + x.reason; btns.innerHTML = ''; return; }
    stEl.textContent = x.cached ? `✅ 语音模型已在本机（约 ${x.sizeMB} MB），断网也能用。` : `尚未下载（约 ${x.sizeMB} MB）。`;
    btns.innerHTML = x.cached ? '<button class="btn danger" data-act="asrclear">删除语音模型</button>' : '<button class="btn" data-act="asrdl">下载语音模型</button>';
  }

  /* ---------- 写入绑定 ---------- */
  function setPath(obj, path, val) {
    const ks = path.split('.');
    let o = obj;
    for (let i = 0; i < ks.length - 1; i++) { o[ks[i]] = o[ks[i]] || {}; o = o[ks[i]]; }
    o[ks[ks.length - 1]] = val;
  }
  document.addEventListener('input', e => {
    const el = e.target;
    if (el.dataset.bind && el.dataset.bind.startsWith('ask:')) {
      const k = 'q:' + el.dataset.bind.slice(4); aiView[k] = aiView[k] || {}; aiView[k].q = el.value;
      const c = document.querySelector(`[data-count="${el.dataset.bind}"]`); if (c) c.textContent = len(el.value) + ' 字';
    } else if (el.dataset.bind) {
      const [kind, n, path] = el.dataset.bind.split(':');
      const rec = kind === 'day' ? Store.dayRec(st(), +n) : Store.revRec(st(), +n);
      setPath(rec, path, el.value);
      const c = document.querySelector(`[data-count="${el.dataset.bind}"]`); if (c) c.textContent = len(el.value) + ' 字';
      saveSoon();
    } else if (el.id === 'note-q') { noteQ = el.value; const pos = el.selectionStart; render(); const q = $('#note-q'); if (q) { q.focus(); q.setSelectionRange(pos, pos); } }
  });
  document.addEventListener('change', e => {
    const el = e.target;
    if (el.dataset.aiSet) {
      const k = el.dataset.aiSet, v = el.type === 'checkbox' ? el.checked : el.value.trim();
      if (k === 'base' && v && !AI.validBase(v.replace(/\/+$/, ''))) { toast('接口地址必须以 https:// 开头'); el.value = AI.settings().base; return; }
      AI.save({ [k]: v }); toast(k === 'apiKey' ? (v ? '已保存 Key（只存在本机）' : '已清空 Key') : '已保存');
      if (k === 'apiKey') render();
    } else if (el.dataset.set) {
      const k = el.dataset.set; const s = st().settings;
      s[k] = (k === 'tts' || k === 'font') ? +el.value : el.value;
      if (k === 'start') st().rebase = null;
      S.save(); render();
    } else if (el.id === 'note-mod') { noteMod = el.value; render(); }
    else if (el.id === 'pages-file' && el.files[0]) {
      const f = el.files[0];
      toast('正在读取图包……');
      f.arrayBuffer().then(buf => Pages.importZip(buf, (i, n) => toast(`正在导入 ${i}/${n} 张`)))
        .then(m => { PG = m; if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {}); toast(`已导入 ${m.count} 张页图`); render(); })
        .catch(err => alert('导入失败：' + err.message));
      el.value = '';
    }
    else if (el.id === 'import-file' && el.files[0]) {
      const fr = new FileReader();
      fr.onload = () => { try { S.importJSON(fr.result); toast('已导入备份'); render(); } catch (err) { alert('导入失败：' + err.message); } };
      fr.readAsText(el.files[0]);
    }
  });

  function download(name, text, type) {
    const blob = new Blob([text], { type: type || 'text/plain;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  /* ---------- 动作 ---------- */
  const actions = {
    begin() {
      const s = st().settings;
      s.start = $('#f-start').value || today();
      s.weekdays = [...document.querySelectorAll('.f-week:checked')].map(x => +x.value);
      const m = document.querySelector('input[name="f-mode"]:checked'); s.mode = m ? m.value : 'std';
      S.save(); location.hash = '#/day/1'; render();
    },
    pickmode(el) { const rec = Store.dayRec(st(), +el.dataset.n); rec.mode = el.dataset.mode; S.save(); render(); },
    step(el) { const rec = Store.dayRec(st(), +el.dataset.n); rec.step = +el.dataset.step; S.save(); render(); window.scrollTo(0, 0); },
    read(el) { const rec = Store.dayRec(st(), +el.dataset.n); rec.read[el.dataset.id] = el.checked; S.save(); },
    speak(el) { speak(textOf(el.dataset.id)); },
    hush() { if ('speechSynthesis' in window) speechSynthesis.cancel(); },
    script() { const s = st().settings; s.script = s.script === 'trad' ? 'simp' : 'trad'; S.save(); render(); },
    quiz(el) { const rec = Store.dayRec(st(), +el.dataset.n); const q = +el.dataset.q; if (rec.quiz[q] === undefined) { rec.quiz[q] = +el.dataset.o; S.save(); render(); } },
    rate(el) { const rec = Store.dayRec(st(), +el.dataset.n); rec.rating = +el.value; S.save(); render(); },
    finish(el) {
      const n = +el.dataset.n; const rec = Store.dayRec(st(), n);
      if (len(rec.notes.retell) < 10) { toast('先在「思辨」里写下至少 10 字的复述'); rec.step = 3; S.save(); render(); return; }
      if (typeof rec.rating !== 'number') { toast('请选一个自评等级'); return; }
      if (!rec.mode) rec.mode = st().settings.mode;
      Store.completeDay(st(), n, today(), LIT); S.save(); toast(`第 ${n} 天完成 ✓`); render();
    },
    reveal(el) { const r = Store.revRec(st(), +el.dataset.n); r.show = r.show || {}; r.show[el.dataset.k] = !r.show[el.dataset.k]; render(); },
    rrate(el) { const r = Store.revRec(st(), +el.dataset.n); r.rate[el.dataset.k] = +el.dataset.lv; S.save(); render(); },
    finishrev(el) {
      const n = +el.dataset.n; const r = Store.revRec(st(), n);
      if (len(r.summary) < 5) { toast('写一句本轮总结（至少 5 字）再完成'); return; }
      delete r.show; Store.completeReview(st(), n, today()); S.save(); toast(`第 ${n} 天完成 ✓`); render();
    },
    flip() { cardFlip = true; render(); },
    grade(el) { const id = el.dataset.id; st().cards[id] = SRS.grade(st().cards[id], +el.dataset.g, today()); cardFlip = false; S.save(); render(); },
    week(el) {
      const s = st().settings; const w = new Set(Plan.normWeek(s.weekdays)); const v = +el.value;
      if (el.checked) w.add(v); else w.delete(v);
      if (!w.size) { el.checked = true; toast('至少保留一个学习日'); return; }
      s.weekdays = [...w].sort(); S.save(); render();
    },
    rebase() {
      const dates = schedule(); const sum = Plan.status(dates, isDone, today());
      if (sum.next === null) return;
      st().rebase = { from: sum.next, date: today() }; S.save(); toast(`已从今天起重排：第 ${sum.next} 天排在今天`); render();
    },
    copy(el) { const t = el.dataset.text; if (navigator.clipboard) navigator.clipboard.writeText(t).then(() => toast('已复制路径')); else prompt('复制路径', t); },
    exportmd() { download(`文学能力岛笔记_${today()}.md`, Store.markdown(st(), LIT, today()), 'text/markdown;charset=utf-8'); },
    exportjson() { download(`文学能力岛备份_${today()}.json`, S.exportJSON(), 'application/json'); },
    importjson() { $('#import-file').click(); },
    mic(el) { micTap(el.dataset.target); },
    vundo(el) {
      const L = voice.last, b = el.dataset.target; if (!L || L.bind !== b) return;
      const ta = vTarget(b); if (!ta) return;
      const i = ta.value.lastIndexOf(L.text); if (i < 0) { toast('文字已经改过，无法撤销'); return; }
      ta.value = ta.value.slice(0, i) + L.raw + ta.value.slice(i + L.text.length); ta.dispatchEvent(new Event('input', { bubbles: true }));
      voice.last = null; vStatus(b, '已恢复为原始识别'); S.save();
    },
    async asrdl() {
      const bar = $('#asr-bar'), stEl = $('#asr-status'); if (bar) bar.hidden = false;
      try {
        await ASR.download((p) => { if (bar) bar.firstElementChild.style.width = Math.round(p * 100) + '%'; if (stEl) stEl.textContent = '正在下载…' + Math.round(p * 100) + '%'; });
        if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
        toast('语音模型已下载');
      } catch (e) { alert('下载没有完成：' + e.message); }
      if (bar) bar.hidden = true; asrCard();
    },
    async asrclear() { if (confirm('删除本机语音模型？（意大利语能力岛也用同一份，会一起删除；以后用语音输入需要重新下载）')) { await ASR.clear(); toast('已删除'); asrCard(); } },
    async aitest() {
      const o = $('#ai-test'); if (o) o.textContent = '正在连接……';
      try { const r = await AI.test(); if (o) o.textContent = '✅ 连接成功，使用模型：' + (r.using || '（默认）'); }
      catch (e) { if (o) o.textContent = '❌ ' + e.message; }
    },
    aiclear() { if (confirm('清除本机保存的 DeepSeek API Key？')) { AI.save({ apiKey: '' }); toast('已清除'); render(); } },
    aiexplain(el) { const id = el.dataset.id, n = +el.dataset.n; aiRun('x:' + id, () => AI.explain(textCtx(id, n), !!el.dataset.force), 'aiexplain', `data-id="${id}" data-n="${n}"`); },
    aiask(el) {
      const id = el.dataset.id, n = +el.dataset.n, ta = vTarget('ask:' + id), q = ta ? ta.value.trim() : '';
      if (q.length < 2) { toast('先写下（或说出）你的问题'); return; }
      aiRun('q:' + id, () => AI.ask(q, textCtx(id, n)));
      (aiView['q:' + id] = aiView['q:' + id] || {}).q = q;
    },
    aireview(el) {
      const n = +el.dataset.n, kind = el.dataset.kind, ctx = reviewCtx(n, kind);
      if (!ctx.items.some(x => len(x[1]) >= 5)) { toast('先写（或说）几句再请 AI 点评'); return; }
      aiRun('r:' + n + ':' + kind, () => AI.review(ctx, kind, !!el.dataset.force), 'aireview', `data-n="${n}" data-kind="${kind}"`);
    },
    pages(el) { openViewer(el.dataset.key, el.dataset.title); },
    vclose() { closeViewer(); },
    vzoom(el) { const v = $('#viewer'); if (!v) return; const z = v.classList.toggle('zoom'); el.textContent = z ? '适应宽度' : '放大'; },
    importpages() { if (!window.Pages) { alert('这个浏览器不支持本地图片存储'); return; } $('#pages-file').click(); },
    clearpages() { if (confirm('删除已导入的全部注本页图？（不影响学习进度）')) Pages.clear().then(() => { PG = null; toast('已删除'); render(); }); },
    reset() { if (confirm('清空全部进度、笔记和卡片？此操作不可撤销（建议先导出备份）。')) { S.reset(); toast('已清空'); location.hash = '#/today'; render(); } },
  };
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const fn = actions[el.dataset.act];
    if (!fn) return;
    if (el.tagName === 'BUTTON' || el.tagName === 'A') e.preventDefault();
    fn(el);
  });
  window.addEventListener('hashchange', () => { cardFlip = false; voiceCancel(); render(); window.scrollTo(0, 0); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) S.save(); });
  if ('speechSynthesis' in window) speechSynthesis.getVoices();

  render();
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) navigator.serviceWorker.register('sw.js').catch(() => {});
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeViewer(); });
  window.__lit = { S, render, actions, voice, aiView, get PG() { return PG; } };
})();
