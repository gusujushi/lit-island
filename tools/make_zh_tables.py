#!/usr/bin/env python3
"""生成语音输入后处理用的繁→简单字表 → js/zh-data.js（自动生成，勿手改）。

Whisper 识别中文时常常输出繁体。程序把识别结果逐字转成简体再写进输入框（史书人名等保护字除外，见 js/zh.js）。
用与 tools/extract_texts.py 相同的 OpenCC（t2s）逐字转换；只收"一个字转成另一个字"的条目。

用法：.venv/bin/python tools/make_zh_tables.py
依赖：项目自己的 .venv 里的 opencc-python-reimplemented。
许可：OpenCC 字表 Apache-2.0。
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, ".."))
OUT = os.path.join(ROOT, "js", "zh-data.js")

try:
    from opencc import OpenCC
except ImportError:  # pragma: no cover
    sys.exit("缺少 OpenCC：.venv/bin/pip install opencc-python-reimplemented")

T2S = OpenCC("t2s").convert
RANGES = [(0x3400, 0x4DBF), (0x4E00, 0x9FFF)]


def is_han(c):
    o = ord(c)
    return any(a <= o <= b for a, b in RANGES)


def main():
    t2s = {}
    for a, b in RANGES:
        for o in range(a, b + 1):
            c = chr(o)
            s = T2S(c)
            if s != c and len(s) == 1 and is_han(s):
                t2s[c] = s
    t2s_str = "".join(k + v for k, v in sorted(t2s.items()))
    body = (
        "/* 由 tools/make_zh_tables.py 自动生成，请勿手改。\n"
        " * t2s：繁→简单字表，两个字一组（繁、简）；来源 OpenCC t2s（Apache-2.0）。 */\n"
        "(function (root) {\n"
        f"  root.ZH_DATA = {{ t2s: {json.dumps(t2s_str, ensure_ascii=False)} }};\n"
        "})(typeof self !== 'undefined' ? self : this);\n"
    )
    with open(OUT, "w", encoding="utf-8") as f:
        f.write(body)
    print(f"繁→简 {len(t2s)} 对；{OUT} {os.path.getsize(OUT) / 1024:.1f} KB")


if __name__ == "__main__":
    main()
