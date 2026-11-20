#!/usr/bin/env python3
"""看源文件：打印带行号的原文，帮助写 spec 的定位（行号、start/end 字串）。只读。

用法：
  .venv/bin/python tools/lib_peek.py <文件> <关键字> [行数=40]   # 列出关键字出现的行（最多 30 处），并打印第一处起的若干行
  .venv/bin/python tools/lib_peek.py <文件> <行号> [行数=40]     # 从该行起打印
  .venv/bin/python tools/lib_peek.py <文件> --heads [正则]        # 列出标题行（默认匹配【…】、##、第…回/出/篇）
文件写法同 spec：古籍下载里的直接写文件名，其余写「古籍下载2/xxx.txt」；维基文库写「wiki:文件名」。
关键字照源文件原样（多数是繁体）。
"""
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import extract_texts as X  # noqa: E402


def main(argv):
    if len(argv) < 2:
        print(__doc__)
        return 2
    f = argv[0]
    path = os.path.join(X.WIKI, f[5:]) if f.startswith("wiki:") else X.book_path(f)
    if not os.path.exists(path):
        print("找不到文件：", path)
        return 1
    raw, sha = X.read(path)
    lines = raw.split("\n")
    if argv[1] == "--heads":
        pat = re.compile(argv[2] if len(argv) > 2 else r"^\s*(【|##|第.{1,6}[回出齣篇])")
        n = 0
        for i, l in enumerate(lines, 1):
            if pat.search(l):
                print(f"{i}: {l.strip()[:80]}")
                n += 1
        print(f"共 {n} 行")
        return 0
    count = int(argv[2]) if len(argv) > 2 else 40
    if argv[1].isdigit():
        start = int(argv[1])
    else:
        hits = [i for i, l in enumerate(lines, 1) if argv[1] in l]
        if not hits:
            print("没有找到：", argv[1])
            return 1
        print("出现在第", "、".join(map(str, hits[:30])), "行" + ("（仅列前 30 处）" if len(hits) > 30 else ""))
        start = hits[0]
    for i in range(start, min(len(lines), start + count - 1) + 1):
        print(f"{i}: {lines[i - 1]}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
