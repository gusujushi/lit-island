/* 录音与音频处理。纯计算部分（UMD，可在 Node 测试）：
 *   resample  任意采样率 → 16 kHz（Whisper 的输入）；
 *   stats     有没有说话、说了多久（按短时能量）；
 *   split     长录音切成 ≤ 28 秒的段（在最安静的地方切），Whisper 一次只能听 30 秒。
 * 浏览器部分：Rec.start() 开始录音（MediaRecorder），stop() 得到 16 kHz 单声道 Float32Array。录音只在内存里，不上传、不存盘。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(null);
  else root.Audio16 = factory(root);
})(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';
  const SR = 16000;

  /** 线性重采样（降采样时先按窗口取平均，避免混叠） */
  function resample(pcm, from, to) {
    to = to || SR;
    if (from === to) return pcm;
    const ratio = from / to, n = Math.floor(pcm.length / ratio), out = new Float32Array(n);
    if (ratio > 1) {
      for (let i = 0; i < n; i++) {
        const a = Math.floor(i * ratio), b = Math.min(pcm.length, Math.floor((i + 1) * ratio));
        let s = 0; for (let j = a; j < b; j++) s += pcm[j];
        out[i] = b > a ? s / (b - a) : pcm[a] || 0;
      }
    } else {
      for (let i = 0; i < n; i++) {
        const x = i * ratio, a = Math.floor(x), f = x - a;
        out[i] = (pcm[a] || 0) * (1 - f) + (pcm[a + 1] || 0) * f;
      }
    }
    return out;
  }

  /** 短时能量（RMS），每 10 ms 一帧、窗长 25 ms */
  function frames(pcm, sr) {
    sr = sr || SR;
    const hop = Math.round(sr * 0.01), win = Math.round(sr * 0.025), out = [];
    for (let i = 0; i + win <= pcm.length; i += hop) {
      let s = 0; for (let j = i; j < i + win; j++) s += pcm[j] * pcm[j];
      out.push(Math.sqrt(s / win));
    }
    return out;
  }

  /** 有没有说话、说了多久：{dur, speech（有声秒数）, peak, quiet（几乎没声音）} */
  function stats(pcm, sr) {
    sr = sr || SR;
    const e = frames(pcm, sr);
    const dur = pcm.length / sr;
    if (!e.length) return { dur, speech: 0, peak: 0, quiet: true };
    const sorted = e.slice().sort((a, b) => a - b);
    const floor = sorted[Math.floor(sorted.length * 0.1)], peak = sorted[sorted.length - 1];
    // 门限：底噪的 3 倍，但不超过峰值的一半（整段都在说话、没有停顿时，底噪分位数就是说话声本身）
    const th = Math.max(0.004, Math.min(floor * 3, peak * 0.5), peak * 0.08);
    const voiced = e.filter(x => x >= th).length;
    return { dur, speech: voiced * 0.01, peak, quiet: peak < 0.006 || voiced * 0.01 < 0.2 };
  }

  /** 切成 ≤ maxSec 秒的段：在 [minSec, maxSec] 里找最安静的 0.3 秒，从那里切 */
  function split(pcm, maxSec, minSec, sr) {
    sr = sr || SR; maxSec = maxSec || 28; minSec = minSec || 15;
    const out = [];
    let start = 0;
    while (pcm.length - start > maxSec * sr) {
      const seg = pcm.subarray(start, start + maxSec * sr);
      const e = frames(seg, sr), w = 30;
      let best = -1, bestV = Infinity;
      for (let i = Math.floor(minSec * 100); i + w <= e.length; i++) {
        let s = 0; for (let j = i; j < i + w; j++) s += e[j];
        if (s < bestV) { bestV = s; best = i; }
      }
      const cut = best < 0 ? maxSec * sr : Math.round((best + w / 2) * 0.01 * sr);
      out.push(pcm.subarray(start, start + cut));
      start += cut;
    }
    if (pcm.length - start > sr * 0.3 || !out.length) out.push(pcm.subarray(start));
    return out;
  }

  /* ---------- 浏览器：录音 ---------- */
  function mono(ab) {
    const n = ab.numberOfChannels;
    if (n === 1) return ab.getChannelData(0);
    const out = new Float32Array(ab.length);
    for (let c = 0; c < n; c++) { const d = ab.getChannelData(c); for (let i = 0; i < out.length; i++) out[i] += d[i] / n; }
    return out;
  }

  /** 录音文件（webm / mp4）→ 16 kHz 单声道 */
  async function decode(blob) {
    const Ctx = root.AudioContext || root.webkitAudioContext;
    if (!Ctx) throw new Error('这个浏览器不能解码音频');
    const ctx = new Ctx();
    try {
      const buf = await blob.arrayBuffer();
      const ab = await new Promise((res, rej) => { ctx.decodeAudioData(buf, res, rej); });
      return resample(mono(ab), ab.sampleRate, SR);
    } finally { if (ctx.close) ctx.close().catch(() => {}); }
  }

  /** 录音器：一次只录一段。start() → stop() 得到 Float32Array（16 kHz） */
  function Recorder(maxSec) {
    let stream = null, mr = null, chunks = [], t0 = 0, timer = null, stopping = null;
    const api = {
      get on() { return !!mr; },
      get secs() { return mr ? (Date.now() - t0) / 1000 : 0; },
      onAuto: null,
      async start() {
        if (mr) return;
        stream = await root.navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
        chunks = [];
        mr = new root.MediaRecorder(stream);
        mr.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
        mr.start();
        t0 = Date.now();
        if (maxSec) timer = setTimeout(() => { if (api.onAuto) api.onAuto(); }, maxSec * 1000);
      },
      stop() {
        if (!mr) return Promise.reject(new Error('没有在录音'));
        if (stopping) return stopping;
        clearTimeout(timer);
        const r = mr;
        stopping = new Promise((res, rej) => {
          r.onstop = () => {
            stream.getTracks().forEach(t => t.stop());
            const blob = new Blob(chunks, { type: r.mimeType || 'audio/webm' });
            mr = null; stream = null; stopping = null;
            if (!blob.size) { rej(new Error('没有录到声音')); return; }
            decode(blob).then(res, rej);
          };
          try { r.stop(); } catch (e) { mr = null; stopping = null; rej(e); }
        });
        return stopping;
      },
      cancel() {
        clearTimeout(timer);
        if (mr) { try { mr.onstop = null; mr.stop(); } catch (e) { /* ignore */ } }
        if (stream) stream.getTracks().forEach(t => t.stop());
        mr = null; stream = null; stopping = null;
      },
    };
    return api;
  }

  return { SR, resample, frames, stats, split, decode, Recorder };
});
