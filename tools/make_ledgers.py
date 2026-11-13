#!/usr/bin/env python3
"""生成 ../02_来源台账/ 下的三份台账（可重跑，覆盖旧台账；台账本身是派生物）。
  本机书目台账.tsv   书籍/文学 下每个文件：大小、SHA-256、PDF 页数／文字层／书签数、本程序如何使用
  PDF页码映射.tsv    课程里每一条"本机注本页码"：第几天、书、PDF 页、内容、核验方式
  外部补充来源.tsv   维基文库抓取登记（复制 sources/wikisource/_ledger.tsv）
用法：python3 tools/make_ledgers.py [书籍文件夹]
"""
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, ".."))
OUT = os.path.normpath(os.path.join(ROOT, "..", "02_来源台账"))


def sha(p):
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def pdfinfo(p):
    try:
        info = subprocess.run(["pdfinfo", p], capture_output=True, text=True, timeout=60).stdout
        pages = int(re.search(r"Pages:\s+(\d+)", info).group(1))
        txt = subprocess.run(["pdftotext", "-f", "40", "-l", "41", p, "-"], capture_output=True, text=True, timeout=60).stdout
        has_text = len(re.sub(r"\s", "", txt)) > 50
        js = subprocess.run(["qpdf", "--json", "--json-key=outlines", p], capture_output=True, text=True, timeout=120).stdout
        n = 0
        def walk(items):
            nonlocal n
            for it in items:
                n += 1
                walk(it.get("kids", []))
        walk(json.loads(js).get("outlines", []))
        return pages, has_text, n
    except Exception as e:  # noqa: BLE001
        return None, None, f"ERR {e}"


def main():
    books = os.path.expanduser(sys.argv[1] if len(sys.argv) > 1 else "~/Documents/书籍/文学")
    os.makedirs(OUT, exist_ok=True)
    texts_js = open(os.path.join(ROOT, "data", "texts.js"), encoding="utf-8").read()
    used_txt = set(re.findall(r'"file": "([^"/]+\.txt)"', texts_js))
    meta = open(os.path.join(ROOT, "data", "meta.js"), encoding="utf-8").read()
    match = dict(re.findall(r"(\w+): \{ name: '[^']*', by: '[^']*', match: '([^']*)'", meta))
    rows = ["相对路径\t字节\tSHA-256\tPDF页数\t文字层\t书签数\t本程序用途"]
    for dirpath, _, files in os.walk(books):
        for fn in sorted(files):
            if fn.startswith(".") or fn.endswith(".zip"):
                continue
            p = os.path.join(dirpath, fn)
            rel = os.path.relpath(p, books)
            use = ""
            if fn.lower().endswith(".pdf"):
                pages, has_text, n = pdfinfo(p)
                key = next((k for k, m in match.items() if m in fn), None)
                use = f"页码指引（{key}）" if key else "未使用"
            else:
                pages, has_text, n = "", "", ""
                use = "原文抽取" if fn in used_txt else "未使用"
            rows.append(f"{rel}\t{os.path.getsize(p)}\t{sha(p)}\t{pages}\t{'' if has_text == '' else ('有' if has_text else '无（扫描）')}\t{n}\t{use}")
    open(os.path.join(OUT, "本机书目台账.tsv"), "w", encoding="utf-8").write("\n".join(rows) + "\n")

    node = subprocess.run(["node", "-e", """
const {loadCourse}=require('./tests/helpers.js');const L=loadCourse();
const out=[];Object.values(L.learn).sort((a,b)=>a.d-b.d).forEach(d=>(d.book||[]).forEach(b=>out.push([d.d,b[0],L.meta.books[b[0]].name,b[1],b[2],L.meta.books[b[0]].how])));
console.log(JSON.stringify(out));"""], cwd=ROOT, capture_output=True, text=True, check=True).stdout
    refs = json.loads(node)
    lines = ["第几天\t书代号\t书名\tPDF页\t内容\t核验方式"] + ["\t".join(map(str, r)) for r in refs]
    open(os.path.join(OUT, "PDF页码映射.tsv"), "w", encoding="utf-8").write("\n".join(lines) + "\n")

    shutil.copyfile(os.path.join(ROOT, "sources", "wikisource", "_ledger.tsv"), os.path.join(OUT, "外部补充来源.tsv"))
    print(f"台账已写出：本机书目 {len(rows) - 1} 项，页码映射 {len(refs)} 条，外部来源已复制")


if __name__ == "__main__":
    main()
