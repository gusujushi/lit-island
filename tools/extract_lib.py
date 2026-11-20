#!/usr/bin/env python3
"""书库原文抽取：tools/lib_spec/<书号>.json → data/lib/text/<书号>.js（每段带来源、行号、SHA-256，繁体同时保留）。

定位方式与主线完全相同（复用 tools/extract_texts.py 的 extract：bracket/chtxt/ss/lines/span/wiki），规范见 docs/LIB_FORMAT.md。
用法：
  .venv/bin/python tools/extract_lib.py                 # 全部书
  .venv/bin/python tools/extract_lib.py --book shijingf # 一本书
  .venv/bin/python tools/extract_lib.py --book shijingf --show shijingf_taoyao   # 只看一个单元，不写文件
  .venv/bin/python tools/extract_lib.py --check         # 只检查，不写文件
退出码：0 全部成功；1 有定位失败或格式错误。
"""
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, ".."))
sys.path.insert(0, HERE)
import extract_texts as X  # noqa: E402

SPEC_DIR = os.path.join(HERE, "lib_spec")
OUT_DIR = os.path.join(ROOT, "data", "lib", "text")
ID_RE = re.compile(r"^[a-z]+_[a-z0-9_]+$")


def books():
    return [f[:-5] for f in sorted(os.listdir(SPEC_DIR)) if f.endswith(".json")] if os.path.isdir(SPEC_DIR) else []


def run_book(book, show=None):
    path = os.path.join(SPEC_DIR, book + ".json")
    try:
        spec = json.load(open(path, encoding="utf-8"))
    except Exception as e:  # noqa: BLE001
        return {}, [f"{book}: spec 不是合法 JSON：{e}"]
    errs, out, seen = [], {}, set()
    if spec.get("book") != book:
        errs.append(f"{book}: spec 里的 book 应为 {book}")
    for u in spec.get("units", []):
        uid = u.get("id", "")
        if show and uid != show:
            continue
        if not ID_RE.match(uid) or not uid.startswith(book + "_"):
            errs.append(f"{uid or '（无 id）'}: id 必须以 {book}_ 开头，只用小写字母、数字、下划线")
            continue
        if uid in seen:
            errs.append(f"{uid}: id 重复")
            continue
        seen.add(uid)
        for k in ("t", "a", "why"):
            if not str(u.get(k, "")).strip():
                errs.append(f"{uid}: 缺 {k}")
        ps = u.get("passages") or []
        if not 1 <= len(ps) <= 3:
            errs.append(f"{uid}: passages 应有 1–3 段（现有 {len(ps)}）")
        for i, p in enumerate(ps, 1):
            pid = f"{uid}#{i}"
            s = dict(p)
            s["id"] = pid
            s["t"] = u["t"] + ("·" + p["t"] if p.get("t") else "")
            s["a"] = u.get("a", "")
            if s.get("kind") not in X.KINDS:
                errs.append(f"{pid}: kind 不认识：{s.get('kind')}")
                continue
            try:
                item = X.extract(s)
            except X.Miss as e:
                errs.append(f"{pid}: {e}")
                continue
            except Exception as e:  # noqa: BLE001
                errs.append(f"{pid}: {type(e).__name__} {e}")
                continue
            n = len(re.findall(r"[㐀-鿿]", item["simp"]))
            if n > 1600:
                errs.append(f"{pid}: 太长（{n} 字），长文请节选到 1500 字以内")
            item["u"] = uid
            out[pid] = item
    return out, errs


def main(argv):
    only = argv[argv.index("--book") + 1] if "--book" in argv else None
    show = argv[argv.index("--show") + 1] if "--show" in argv else None
    check = "--check" in argv or bool(show)
    targets = [only] if only else books()
    if only and not os.path.exists(os.path.join(SPEC_DIR, only + ".json")):
        print(f"没有 tools/lib_spec/{only}.json")
        return 1
    total_err = 0
    for b in targets:
        out, errs = run_book(b, show)
        for e in errs:
            print("✗", e)
        total_err += len(errs)
        if show:
            for k, v in out.items():
                print(k, json.dumps(v, ensure_ascii=False, indent=1))
            continue
        chars = sum(len(re.findall(r"[㐀-鿿]", v["simp"])) for v in out.values())
        units = len({v["u"] for v in out.values()})
        print(f"{b}: {units} 单元，{len(out)} 段，原文 {chars} 字，失败 {len(errs)}")
        if errs or check:
            continue
        os.makedirs(OUT_DIR, exist_ok=True)
        js = ("/* 由 tools/extract_lib.py 自动生成，请勿手改。来源与定位见每段 src；u 为所属单元。 */\n"
              "LIT.addLibText(" + json.dumps(out, ensure_ascii=False, indent=0) + ");\n")
        with open(os.path.join(OUT_DIR, b + ".js"), "w", encoding="utf-8") as f:
            f.write(js)
    return 1 if total_err else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
