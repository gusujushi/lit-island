/* 离线缓存。改版时递增 VERSION。
 * - 程序外壳与课程数据：全部预缓存（约 0.6 MB），缓存优先，断网可学；
 * - 语音识别的运行库和模型（同一网站下意大利语能力岛的 italy-learning/vendor、models，约 100 MB）：
 *   缓存优先，放在两个能力岛共用的 isola-asr-v1 里；不随外壳版本更新而删除。下载 / 删除由 js/asr.js 负责。
 * ⚠️ 本程序和意大利语能力岛在同一个网站（同源），共用浏览器的 Cache Storage：
 *   清理旧缓存时只能删自己的（lit-island- 开头），不能动别人的（v0.4.0 及以前会把所有其他缓存都删掉，已修正）。 */
const VERSION = 'lit-island-v1.0.0';
const ASR = 'isola-asr-v1';
const LIB = 'lit-island-lib';   // 书库每本书的原文与讲解：按需下载，独立缓存，升级不删（联网时取新、断网用缓存）
const SHELL = [
  './', 'index.html', 'css/app.css', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png',
  'js/lit.js', 'js/plan.js', 'js/srs.js', 'js/store.js', 'js/pages.js', 'js/zh-data.js', 'js/zh.js', 'js/audio.js', 'js/asr.js', 'js/asr-worker.js', 'js/ai.js', 'js/app.js',
  'data/meta.js', 'data/texts.js', 'data/days1.js', 'data/days2.js', 'data/days3.js', 'data/classics1.js', 'data/classics2.js', 'data/guide.js', 'data/changelog.js',
  'data/lib/index.js',
];
const OWN = () => new URL('./', self.registration.scope).pathname;   // 本程序的路径前缀，例如 /lit-island/

self.addEventListener('install', e => {
  // cache: 'reload'：绕过浏览器的网页缓存，确保存进来的是刚发布的新文件
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => /^lit-island-v/.test(k) && k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  const mine = url.pathname.startsWith(OWN());

  // 语音识别的运行库和模型（在意大利语能力岛的目录下）：只认共用缓存，没有就走网络并存进去
  if (!mine && /\/(vendor|models)\//.test(url.pathname)) {
    e.respondWith((async () => {
      const cache = await caches.open(ASR);
      const hit = await cache.match(req, { ignoreSearch: true });
      if (hit) return hit;
      const res = await fetch(req);
      if (res && res.ok && res.status === 200 && res.type === 'basic') cache.put(req, res.clone());
      return res;
    })());
    return;
  }
  if (!mine) return;   // 同一网站上别的程序的文件：不经手

  // 书库每本书的文件：联网时取新并存进 lit-island-lib，断网时用存下的
  if (/\/data\/lib\/(text|note)\//.test(url.pathname)) {
    e.respondWith((async () => {
      const cache = await caches.open(LIB);
      try {
        const res = await fetch(req, { cache: 'no-cache' });
        if (res && res.ok) cache.put(req, res.clone());
        return res;
      } catch (err) {
        const hit = await cache.match(req, { ignoreSearch: true });
        return hit || new Response('', { status: 504, statusText: 'offline' });
      }
    })());
    return;
  }

  e.respondWith(caches.match(req, { ignoreSearch: true, cacheName: VERSION }).then(hit => {
    if (hit) return hit;
    return fetch(req).then(rsp => {
      if (rsp.ok) { const copy = rsp.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
      return rsp;
    }).catch(() => (req.mode === 'navigate' ? caches.match('index.html', { cacheName: VERSION }) : new Response('', { status: 504, statusText: 'offline' })));
  }));
});
