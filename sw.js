/* 离线缓存：程序外壳与课程数据全部预缓存（约 0.5 MB），断网可学。改版时递增 VERSION。 */
const VERSION = 'lit-island-v0.2.1';
const SHELL = [
  './', 'index.html', 'css/app.css', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png',
  'js/lit.js', 'js/plan.js', 'js/srs.js', 'js/store.js', 'js/app.js',
  'data/meta.js', 'data/texts.js', 'data/days1.js', 'data/days2.js', 'data/days3.js', 'data/guide.js',
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(caches.match(req, { ignoreSearch: true }).then(hit => {
    if (hit) return hit;
    return fetch(req).then(rsp => {
      if (rsp.ok) { const copy = rsp.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
      return rsp;
    }).catch(() => (req.mode === 'navigate' ? caches.match('index.html') : new Response('', { status: 504, statusText: 'offline' })));
  }));
});
