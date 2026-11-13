/* 测试用静态服务器：模拟 GitHub Pages 上"两个能力岛同站"的目录结构。
 *   /lit-island/      → 本程序
 *   /italy-learning/  → 意大利语能力岛的 vendor/、models/（语音模型；--assets 指定的本机目录）
 *   /_audio/          → 测试录音（--audio 指定的目录，可缺省）
 * 被 tests/e2e/voice.js 引用。 */
const path = require('path');
const fs = require('fs');
const http = require('http');

const ROOT = path.join(__dirname, '..', '..');   // tests/e2e → 程序根目录
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm',
  '.wav': 'audio/wav', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.onnx': 'application/octet-stream' };

function serve(opts) {
  const mounts = [['/lit-island/', ROOT]];
  if (opts.assets) mounts.push(['/italy-learning/', opts.assets]);
  if (opts.audio) mounts.push(['/_audio/', opts.audio]);
  return new Promise(res => {
    const srv = http.createServer((req, rsp) => {
      if (opts.offline && opts.offline()) { req.socket.destroy(); return; }
      let p = decodeURIComponent(req.url.split('?')[0]);
      if (p.endsWith('/')) p += 'index.html';
      const m = mounts.find(([pre]) => p.startsWith(pre));
      if (!m) { rsp.writeHead(404); rsp.end(); return; }
      const base = path.resolve(m[1]);
      const f = path.resolve(base, p.slice(m[0].length));
      if (!f.startsWith(base) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { rsp.writeHead(404); rsp.end(); return; }
      if (opts.log) opts.log(p);
      rsp.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Content-Length': fs.statSync(f).size });
      fs.createReadStream(f).pipe(rsp);
    }).listen(0, '127.0.0.1', () => res(srv));
  });
}

module.exports = { serve, ROOT };
