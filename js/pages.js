/* 注本页图：把电脑上生成的图包（zip，内含 manifest.json 与页面图片）导入手机，存进浏览器的 IndexedDB。
 * 图片只存在本机浏览器里，不上传；程序仓库里不含任何注本图片（注本有版权）。
 * unzip() 是纯函数（UMD，可在 Node 测试），只支持"存储"（不压缩）方式——图包由 tools/make_page_images.py 用此方式生成。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Pages = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /** 解析 zip（ArrayBuffer）→ [{name, method, data: Uint8Array}] */
  function unzip(buf) {
    const dv = new DataView(buf);
    let e = buf.byteLength - 22;
    while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
    if (e < 0) throw new Error('不是有效的 zip 文件');
    const count = dv.getUint16(e + 10, true);
    let p = dv.getUint32(e + 16, true);
    const td = new TextDecoder('utf-8');
    const out = [];
    for (let i = 0; i < count; i++) {
      if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('zip 目录损坏');
      const method = dv.getUint16(p + 10, true);
      const csize = dv.getUint32(p + 20, true);
      const nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
      const loff = dv.getUint32(p + 42, true);
      const name = td.decode(new Uint8Array(buf, p + 46, nlen));
      p += 46 + nlen + xlen + clen;
      if (name.endsWith('/')) continue;
      const lnl = dv.getUint16(loff + 26, true), lxl = dv.getUint16(loff + 28, true);
      const start = loff + 30 + lnl + lxl;
      out.push({ name, method, data: new Uint8Array(buf, start, csize) });
    }
    return out;
  }

  /* ---------- IndexedDB ---------- */
  const DB = 'lit-island-pages', ST = 'pages', MANIFEST = '__manifest__';
  let dbp = null;
  function open() {
    if (dbp) return dbp;
    dbp = new Promise((res, rej) => {
      if (typeof indexedDB === 'undefined') { rej(new Error('这个浏览器不支持本地图片存储')); return; }
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(ST);
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return dbp;
  }
  const done = tx => new Promise((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error); });

  async function putMany(items, onProgress) {
    const db = await open();
    for (let i = 0; i < items.length; i += 40) {
      const tx = db.transaction(ST, 'readwrite');
      items.slice(i, i + 40).forEach(it => tx.objectStore(ST).put(it.value, it.key));
      await done(tx);
      if (onProgress) onProgress(Math.min(items.length, i + 40), items.length);
    }
  }
  async function get(key) {
    const db = await open();
    return new Promise((res, rej) => { const r = db.transaction(ST).objectStore(ST).get(key); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  }
  async function clear() { const db = await open(); const tx = db.transaction(ST, 'readwrite'); tx.objectStore(ST).clear(); await done(tx); }
  const getManifest = () => get(MANIFEST);
  const setManifest = m => putMany([{ key: MANIFEST, value: m }]);

  /** 导入图包：返回 manifest（含 count、bytes） */
  async function importZip(buf, onProgress) {
    const entries = unzip(buf);
    const mf = entries.find(x => x.name === 'manifest.json');
    if (!mf) throw new Error('图包里没有 manifest.json，请用电脑上的工具重新生成');
    const manifest = JSON.parse(new TextDecoder('utf-8').decode(mf.data));
    if (manifest.app !== 'lit-island' || !manifest.refs) throw new Error('这不是文学能力岛的注本图包');
    const imgs = entries.filter(x => /\.(jpe?g|png|webp)$/i.test(x.name));
    if (imgs.some(x => x.method !== 0)) throw new Error('图包使用了压缩格式，请用电脑上的工具重新生成');
    let bytes = 0;
    const items = imgs.map(x => {
      bytes += x.data.byteLength;
      const type = /\.png$/i.test(x.name) ? 'image/png' : /\.webp$/i.test(x.name) ? 'image/webp' : 'image/jpeg';
      return { key: x.name, value: new Blob([x.data], { type }) };
    });
    await clear();
    await putMany(items, onProgress);
    const m = Object.assign({}, manifest, { count: items.length, bytes, imported: new Date().toISOString().slice(0, 10) });
    await setManifest(m);
    return m;
  }

  return { unzip, open, putMany, get, clear, getManifest, setManifest, importZip };
});
