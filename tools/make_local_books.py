#!/usr/bin/env python3
"""扫描本机书籍文件夹，按 meta.js 中的 match 关键字找到 PDF，写出 data/books-local.js。

用法：python3 tools/make_local_books.py [书籍文件夹]   （默认 ~/Documents/书籍/文学）
data/books-local.js 含本机绝对路径与原始文件名，已列入 .gitignore，不随程序发布。
找不到的书只打印提示，不报错；程序在没有此文件时照常运行（只是没有"打开"按钮）。
"""
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, ".."))


def main():
    folder = os.path.expanduser(sys.argv[1] if len(sys.argv) > 1 else "~/Documents/书籍/文学")
    meta = open(os.path.join(ROOT, "data", "meta.js"), encoding="utf-8").read()
    keys = re.findall(r"(\w+): \{ name: '[^']*', by: '[^']*', match: '([^']*)'", meta)
    pdfs = [f for f in os.listdir(folder) if f.lower().endswith(".pdf")]
    files, missing = {}, []
    for key, match in keys:
        hit = [f for f in pdfs if match in f]
        if len(hit) == 1:
            files[key] = hit[0]
        else:
            missing.append(f"{key}（{match}）：找到 {len(hit)} 个")
    out = os.path.join(ROOT, "data", "books-local.js")
    with open(out, "w", encoding="utf-8") as f:
        f.write("/* 本机生成，不入库。 */\nLIT.setLocalBooks(" + json.dumps({"dir": folder, "files": files}, ensure_ascii=False, indent=1) + ");\n")
    print(f"已写出 data/books-local.js：匹配 {len(files)}/{len(keys)} 本")
    for m in missing:
        print("  未匹配：", m)
    return 0 if not missing else 2


if __name__ == "__main__":
    sys.exit(main())
