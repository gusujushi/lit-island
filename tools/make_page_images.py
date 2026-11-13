#!/usr/bin/env python3
"""把课程里的"本机注本页码"渲染成手机可读的页面图，打成注本图包（zip，存储方式不压缩）。

用法：python3 tools/make_page_images.py [输出文件夹]   （默认 ~/Documents/文学学习/03_注本页图）
前提：已运行 tools/make_local_books.py（需要 data/books-local.js 里的本机 PDF 路径）；本机有 pdftoppm、qpdf、node。
输出：<输出文件夹>/pages/*.jpg（已渲染的会复用）与 <输出文件夹>/文学能力岛_注本图包_vYYYYMMDD.zip。
⚠️ 注本受版权保护：图包只供本人学习，放在程序仓库之外，永不提交、不发布。
"""
import datetime
import glob
import json
import os
import re
import subprocess
import sys
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, ".."))

# 每本书：最多取几页、是否按书签算跨度、起始偏移、宽度、是否彩色、JPEG 质量
RULES = {
    "sjzx": dict(max=4, outline=True), "tsjs": dict(max=3, outline=True), "scjz": dict(max=3, outline=True),
    "hjpz": dict(max=4, outline=True), "hlm": dict(max=4, outline=True), "dbcs": dict(max=4, outline=True),
    "sglc": dict(max=4, outline=True), "dmzz": dict(max=4, outline=True), "cyk": dict(max=4, outline=True),
    "tsc17": dict(max=4, outline=True), "tyjz": dict(max=4), "ntjd": dict(max=2), "yrzj": dict(max=3),
    "lzhp1": dict(max=6), "lzhp2": dict(max=6), "ssjs": dict(max=3, shift=-1),
    "dtjs": dict(max=1, width=2400, color=True, quality=75),
}
WIDTH, QUALITY = 1100, 68


def refs_from_course():
    js = r"""
const {loadCourse}=require('./tests/helpers.js');const L=loadCourse();
const out={};Object.values(L.learn).forEach(d=>(d.book||[]).forEach(b=>{const k=b[0]+':'+b[1];(out[k]=out[k]||{b:b[0],p:b[1],days:[]}).days.push(d.d);}));
console.log(JSON.stringify({refs:Object.values(out),books:Object.fromEntries(Object.entries(L.meta.books).map(([k,v])=>[k,v.name]))}));"""
    return json.loads(subprocess.run(["node", "-e", js], cwd=ROOT, capture_output=True, text=True, check=True).stdout)


def local_books():
    p = os.path.join(ROOT, "data", "books-local.js")
    if not os.path.exists(p):
        sys.exit("缺少 data/books-local.js：先运行 python3 tools/make_local_books.py")
    s = open(p, encoding="utf-8").read()
    d = json.loads(s[s.index("(") + 1:s.rindex(")")])
    return d["dir"], d["files"]


_outline_cache = {}


def outline_pages(pdf):
    if pdf not in _outline_cache:
        js = subprocess.run(["qpdf", "--json", "--json-key=outlines", "--json-key=pages", pdf], capture_output=True, text=True).stdout
        d = json.loads(js)
        objs = {p["object"]: i + 1 for i, p in enumerate(d.get("pages", []))}
        pages = set()

        def walk(items):
            for it in items:
                n = it.get("destpageposfrom1") or objs.get(it.get("destpage"))
                if n:
                    pages.add(n)
                walk(it.get("kids", []))
        walk(d.get("outlines", []))
        _outline_cache[pdf] = sorted(pages)
    return _outline_cache[pdf]


def page_count(pdf):
    info = subprocess.run(["pdfinfo", pdf], capture_output=True, text=True).stdout
    return int(re.search(r"Pages:\s+(\d+)", info).group(1))


def plan_pages(key, p, pdf):
    r = RULES.get(key, dict(max=3))
    start = max(1, p + r.get("shift", 0))
    n = r["max"]
    if r.get("outline"):
        nxt = [x for x in outline_pages(pdf) if x > p]
        if nxt:
            n = max(1, min(n, nxt[0] - p))
    last = min(page_count(pdf), start + n - 1)
    return list(range(start, last + 1))


def render(pdf, key, pages, outdir):
    r = RULES.get(key, {})
    need = [x for x in pages if not os.path.exists(os.path.join(outdir, f"{key}_{x:04d}.jpg"))]
    # 连续页一次渲染
    runs, cur = [], []
    for x in need:
        if cur and x != cur[-1] + 1:
            runs.append(cur); cur = []
        cur.append(x)
    if cur:
        runs.append(cur)
    for run in runs:
        tmp = os.path.join(outdir, f"_tmp_{key}")
        cmd = ["pdftoppm", "-f", str(run[0]), "-l", str(run[-1]), "-scale-to-x", str(r.get("width", WIDTH)), "-scale-to-y", "-1",
               "-jpeg", "-jpegopt", f"quality={r.get('quality', QUALITY)}"]
        if not r.get("color"):
            cmd.append("-gray")
        subprocess.run(cmd + [pdf, tmp], capture_output=True)
        made = sorted(glob.glob(tmp + "-*.jpg"))
        for f in made:
            num = int(re.search(r"-(\d+)\.jpg$", f).group(1))
            os.replace(f, os.path.join(outdir, f"{key}_{num:04d}.jpg"))
    missing = [x for x in pages if not os.path.exists(os.path.join(outdir, f"{key}_{x:04d}.jpg"))]
    return missing


def main():
    out = os.path.expanduser(sys.argv[1] if len(sys.argv) > 1 else "~/Documents/文学学习/03_注本页图")
    pages_dir = os.path.join(out, "pages")
    os.makedirs(pages_dir, exist_ok=True)
    course = refs_from_course()
    bdir, files = local_books()
    manifest = {"app": "lit-island", "version": "v" + datetime.date.today().strftime("%Y%m%d"), "created": datetime.datetime.now().isoformat(timespec="seconds"),
                "books": course["books"], "refs": {}}
    problems = []
    for i, ref in enumerate(sorted(course["refs"], key=lambda r: (r["b"], r["p"]))):
        key, p = ref["b"], ref["p"]
        if key not in files:
            problems.append(f"{key}:{p} 本机找不到这本书"); continue
        pdf = os.path.join(bdir, files[key])
        pages = plan_pages(key, p, pdf)
        miss = render(pdf, key, pages, pages_dir)
        if miss:
            problems.append(f"{key}:{p} 渲染失败页 {miss}")
        manifest["refs"][f"{key}:{p}"] = [f"{key}_{x:04d}.jpg" for x in pages if x not in miss]
        print(f"[{i + 1}/{len(course['refs'])}] {key}:{p} → {len(pages) - len(miss)} 页", flush=True)
    names = sorted({n for v in manifest["refs"].values() for n in v})
    zpath = os.path.join(out, f"文学能力岛_注本图包_{manifest['version']}.zip")
    with zipfile.ZipFile(zpath, "w", compression=zipfile.ZIP_STORED) as z:
        z.writestr("manifest.json", json.dumps(manifest, ensure_ascii=False))
        for n in names:
            z.write(os.path.join(pages_dir, n), n)
    size = os.path.getsize(zpath)
    print(f"图包：{zpath}\n共 {len(names)} 张页图，{len(manifest['refs'])} 条页码，{size / 1048576:.1f} MB")
    for pb in problems:
        print("⚠", pb)
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
