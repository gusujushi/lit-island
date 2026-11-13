/* 语音输入的文字整理（纯函数，UMD，Node 与浏览器通用）。
 * Whisper 识别出来的中文常常是繁体、标点不全，安静或嘈杂时还会"编"出视频字幕套话；这里统一整理后再写进输入框。
 * 识别错字（同音字、专有名词、古诗文）这里不管——交给 DeepSeek 校对（js/ai.js 的 polish），没填 Key 时保留原样。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./zh-data.js').ZH_DATA);
  else root.ZH = factory(root.ZH_DATA);
})(typeof self !== 'undefined' ? self : this, function (D) {
  'use strict';

  // 史书人名、古义字：繁→简时不动（与 tools/extract_texts.py 的 PROTECT 一致）
  const PROTECT = '儁暐藉玁';
  let T2S = null;
  function table() {
    if (T2S) return T2S;
    T2S = new Map();
    const t = Array.from((D && D.t2s) || '');
    for (let i = 0; i + 1 < t.length; i += 2) T2S.set(t[i], t[i + 1]);
    return T2S;
  }

  /** 繁→简（逐字）；keep 里的字不转 */
  function t2s(s, keep) {
    const m = table();
    let out = '';
    for (const c of String(s)) out += (keep && keep.includes(c)) ? c : (m.get(c) || c);
    return out;
  }

  /** 汉字个数 */
  const hanCount = s => Array.from(String(s || '')).filter(c => /\p{Script=Han}/u.test(c)).length;

  // Whisper 的"幻觉"：训练数据里的视频字幕尾巴，或把提示词原样吐出来
  const HALLU_WORDS = '字幕|Amara|amara|不吝|點贊|点赞|訂閱|订阅|打赏|打賞|明镜|明鏡|点点栏目|點點欄目|谢谢观看|謝謝觀看|感谢观看|感謝觀看|下集再见|下期再见|优优独播|中文字幕|以下是普通话|以下是普通話|使用简体中文';
  const HALLU = new RegExp(HALLU_WORDS);
  // 含套话的整个小句（到空格或标点为止）一起去掉
  const HALLU_CLAUSE = new RegExp('[^\\s。！？!?，,；;]*(?:' + HALLU_WORDS + ')[^\\s。！？!?，,；;]*[。！？!?，,；;]?', 'g');

  /** 识别出来的文字 → 写进输入框的文字：繁转简（保护字除外）、去掉幻觉套话、空格变逗号、半角标点变全角、补句号 */
  function cleanDictation(raw) {
    let s = t2s(String(raw || ''), PROTECT).replace(/\r?\n+/g, ' ').trim();
    const had = HALLU.test(s);
    s = s.replace(HALLU_CLAUSE, ' ').trim();
    if (had && hanCount(s) <= 3) return '';          // 套话去掉后只剩零星几个字：整段都是"编"出来的
    s = s.replace(/([\p{Script=Han}])\s+(?=[\p{Script=Han}])/gu, '$1，').replace(/\s+/g, ' ').trim();
    s = s.replace(/,/g, '，').replace(/\?/g, '？').replace(/!/g, '！').replace(/;/g, '；').replace(/:/g, '：')
      .replace(/([，。！？、；：])\1+/g, '$1').replace(/^[，。、；：\s]+/, '');
    if (s && /[\p{Script=Han}A-Za-z0-9]$/u.test(s)) s += '。';
    return s;
  }

  /** 把识别文字插进原有文字的 at 处（前后自动隔开） */
  function insertAt(base, at, text) {
    base = String(base || ''); at = Math.max(0, Math.min(base.length, at == null ? base.length : at));
    const before = base.slice(0, at), after = base.slice(at);
    const sep = before && !/[\s。！？，、；：\n]$/.test(before) ? '，' : '';
    return { value: before + sep + text + after, start: before.length + sep.length, end: before.length + sep.length + text.length };
  }

  /** DeepSeek 校对结果是否可信：汉字数和原文相差太多（被改写、被回答、被截断）就不用 */
  function polishOk(raw, out) {
    const a = hanCount(raw), b = hanCount(out);
    if (!b) return false;
    if (a < 6) return b <= a + 6;
    return b >= a * 0.6 && b <= a * 1.5 + 4;
  }

  return { t2s, hanCount, cleanDictation, insertAt, polishOk, PROTECT, HALLU };
});
