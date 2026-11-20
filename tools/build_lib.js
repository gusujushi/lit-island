/* 组装书库：
 *   tools/lib_notes/<书号>/*.json  → data/lib/note/<书号>.js（LIT.addLibNotes）
 *   tools/lib_books.json + tools/lib_spec/*.json + data/lib/text/*.js（+ tools/lib_pages.json）→ data/lib/index.js（LIT.setLib）
 * 用法：node tools/build_lib.js        退出码：0 成功；1 有 JSON 错误或讲解与选篇对不上。
 * 规范见 docs/LIB_FORMAT.md。data/lib/ 下都是生成物，不要手改。 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const T = p => path.join(ROOT, p);
const han = s => (String(s).match(/[㐀-鿿]/g) || []).length;

function build() {
  const errs = [];
  const cfg = JSON.parse(fs.readFileSync(T('tools/lib_books.json'), 'utf8'));
  const specDir = T('tools/lib_spec'), noteDir = T('tools/lib_notes'), textDir = T('data/lib/text'), outNote = T('data/lib/note');
  fs.mkdirSync(outNote, { recursive: true });
  const pages = fs.existsSync(T('tools/lib_pages.json')) ? JSON.parse(fs.readFileSync(T('tools/lib_pages.json'), 'utf8')).pages || {} : {};
  const index = { eras: cfg.eras, books: [], units: {}, pages: {} };
  let nUnits = 0, nNoted = 0;
  for (const b of cfg.books) {
    const sp = path.join(specDir, b.id + '.json');
    const book = Object.assign({}, b, { units: [] });
    index.books.push(book);
    if (!fs.existsSync(sp)) continue;
    let spec;
    try { spec = JSON.parse(fs.readFileSync(sp, 'utf8')); } catch (e) { errs.push(`${b.id}: spec JSON 错误：${e.message}`); continue; }
    // 原文（生成物）
    const texts = {};
    const tf = path.join(textDir, b.id + '.js');
    if (fs.existsSync(tf)) vm.runInContext(fs.readFileSync(tf, 'utf8'), vm.createContext({ LIT: { addLibText: o => Object.assign(texts, o) } }));
    // 讲解（可分多个文件）
    const notes = {};
    const nd = path.join(noteDir, b.id);
    if (fs.existsSync(nd)) {
      for (const f of fs.readdirSync(nd).filter(f => f.endsWith('.json')).sort()) {
        let o;
        try { o = JSON.parse(fs.readFileSync(path.join(nd, f), 'utf8')); } catch (e) { errs.push(`${b.id}/${f}: JSON 错误：${e.message}`); continue; }
        for (const [k, v] of Object.entries(o)) {
          if (notes[k]) errs.push(`${b.id}/${f}: 单元 ${k} 的讲解重复出现`);
          notes[k] = v;
        }
      }
    }
    const ids = new Set((spec.units || []).map(u => u.id));
    Object.keys(notes).forEach(k => { if (!ids.has(k)) errs.push(`${b.id}: 讲解里的 ${k} 不在选篇 spec 里`); });
    for (const u of spec.units || []) {
      const n = (u.passages || []).length;
      const ps = []; for (let i = 1; i <= n; i++) if (texts[`${u.id}#${i}`]) ps.push(texts[`${u.id}#${i}`]);
      if (ps.length !== n || !n) continue;                       // 原文没抽全：不进目录（抽取脚本会报错）
      if (!notes[u.id]) continue;                                // 没有讲解的单元不进目录（撰写中的单元不让学习者看见）
      nUnits++;
      const entry = { b: b.id, t: u.t, a: u.a, n, c: ps.reduce((s, p) => s + han(p.simp), 0) };
      if (notes[u.id]) { entry.h = 1; nNoted++; if (notes[u.id].tags) entry.g = notes[u.id].tags; }
      index.units[u.id] = entry;
      book.units.push(u.id);
      if (pages[u.id]) index.pages[u.id] = pages[u.id];
    }
    const kept = {}; Object.keys(notes).filter(k => index.units[k]).forEach(k => { kept[k] = notes[k]; });
    fs.writeFileSync(path.join(outNote, b.id + '.js'), '/* 由 tools/build_lib.js 从 tools/lib_notes/' + b.id + '/*.json 组装，请勿手改。 */\nLIT.addLibNotes(' + JSON.stringify(kept) + ');\n');
  }
  fs.writeFileSync(T('data/lib/index.js'), '/* 由 tools/build_lib.js 生成，请勿手改。书库书目、路线（各书单元顺序）、单元目录与注本页码。 */\nLIT.setLib(' + JSON.stringify(index) + ');\n');
  return { errs, nUnits, nNoted, books: index.books.filter(b => b.units.length).length };
}

if (require.main === module) {
  const r = build();
  r.errs.forEach(e => console.log('✗', e));
  console.log(`书库：${r.books} 本书，${r.nUnits} 个单元（已有讲解 ${r.nNoted}），${r.errs.length} 个错误`);
  process.exit(r.errs.length ? 1 : 0);
}
module.exports = { build };
