#!/usr/bin/env python3
"""按 text_spec.py 从本机古籍与维基文库来源抽取原文，生成 data/texts.js。

用法：
  .venv/bin/python tools/extract_texts.py            # 抽取并写出 data/texts.js
  .venv/bin/python tools/extract_texts.py --show ID  # 只打印某段，检查用
  .venv/bin/python tools/extract_texts.py --check    # 只校验，不写文件
任一条目定位失败（找不到、首行字串不符、结果过短）→ 退出码 1，不写文件。
繁转简用 OpenCC（t2s）；来源原貌（繁体或混排）原样保留在 trad 字段。
"""
import hashlib
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, ".."))
sys.path.insert(0, HERE)
from text_spec import TEXTS  # noqa: E402

BOOKS = os.environ.get("LIT_BOOKS", os.path.expanduser("~/Documents/书籍/文学/古籍下载"))


def book_path(f):
    """"古籍下载2/xxx.txt" 这类相对路径以书籍/文学为根；其余在古籍下载里。"""
    if "/" in f:
        return os.path.join(os.path.dirname(BOOKS.rstrip("/")), f)
    return os.path.join(BOOKS, f)


def unwrap(raw):
    """古登堡本按固定宽度硬换行：以全角空格起头的行才是新段落，其余行接回上一行。"""
    out = []
    for l in raw.split("\n"):
        if not out or not l.strip() or not out[-1].strip() or l.startswith("　") or re.match(r"^(第.{1,5}[回齣出]|【|〔)", l):
            out.append(l)
        else:
            out[-1] = out[-1].rstrip() + l.strip()
    return "\n".join(out)


def full_punct(t):
    """半角标点在汉字之间时换成全角（传习录本用半角标点），不改字。"""
    table = {",": "，", ":": "：", ";": "；", "?": "？", "!": "！"}
    return re.sub(r"(?<=[\u4e00-\u9fff」』”）])([,:;?!])(?=\s*[\u4e00-\u9fff「『“（]|$)", lambda m: table[m.group(1)], t, flags=re.M)
WIKI = os.path.join(ROOT, "sources", "wikisource")

try:
    from opencc import OpenCC
    T2S = OpenCC("t2s").convert
except ImportError:  # pragma: no cover
    sys.exit("缺少 OpenCC：先运行 python3 -m venv .venv && .venv/bin/pip install opencc-python-reimplemented")

_cache = {}


def read(path):
    if path not in _cache:
        with open(path, "rb") as f:
            blob = f.read()
        raw = blob.decode("utf-8").replace("\r\n", "\n")
        _cache[path] = (raw, hashlib.sha256(blob).hexdigest())  # 校验值按原始字节计算
    return _cache[path]


class Miss(Exception):
    pass


def tidy(s):
    s = s.replace("\ufeff", "")
    s = re.sub(r"[A-Za-z\u00c0-\u024f]", lambda m: m.group(0) if m.group(0).isascii() else "□", s)  # 源文件个别缺字被编码成拉丁字母，标为缺字
    lines = [re.sub(r"^[\s　]+|[\s　]+$", "", l) for l in s.split("\n")]
    out, blank = [], False
    for l in lines:
        if not l:
            if out and not blank:
                out.append("")
            blank = True
            continue
        out.append(l)
        blank = False
    return "\n".join(out).strip()


def cut(text, maxlen):
    """不给结尾锚点时，在 maxlen 以内最后一个句末标点处截断。"""
    if len(text) <= maxlen:
        return text
    seg = text[:maxlen]
    m = max(seg.rfind(p) for p in "。！？」”．")
    if m < maxlen * 0.5:
        raise Miss(f"截断点太靠前（{m}/{maxlen}）")
    j = m + 1
    while j < len(text) and text[j] in "」”』":
        j += 1
    return text[:j]


def span(text, start, end, maxlen=None, frm=0):
    if start:
        i = text.find(start, frm)
        if i < 0:
            raise Miss(f"找不到起点「{start}」")
    else:
        i = frm
    if end:
        j = text.find(end, i)
        if j < 0:
            raise Miss(f"起点之后找不到终点「{end}」")
        return text[i:j + len(end)]
    if not maxlen:
        return text[i:]
    return cut(text[i:], maxlen)


def clean_wiki(w):
    w = re.sub(r"<ref[^>]*>[\s\S]*?</ref>", "", w)
    w = re.sub(r"<ref[^>]*/>", "", w)

    def conv(m):
        inner = m.group(1)
        if ":" in inner:
            parts = dict(p.split(":", 1) for p in inner.split(";") if ":" in p)
            return parts.get("zh-hant") or parts.get("zh") or list(parts.values())[0]
        return inner
    w = re.sub(r"-\{([^{}]*)\}-", conv, w)
    w = w.replace("{{!}}", "|")
    # 模板由内向外逐层替换：取正文的模板留第一个参数，元数据模板整体删除
    DROP = {"header", "header2", "novel", "novel-f", "檢索", "textquality", "wikibooks", "reflist", "col-begin", "col-break", "col-end", "clr"}

    def tpl(m):
        parts = m.group(1).split("|")
        name = parts[0].strip()
        if name.lower() in DROP or len(parts) == 1:
            return ""
        return parts[1]
    for _ in range(8):
        w2 = re.sub(r"\{\{([^{}]*)\}\}", tpl, w)
        if w2 == w:
            break
        w = w2
    if "{{" in w or "}}" in w:
        raise Miss("wiki 模板未清理干净")
    w = re.sub(r"\[\[(?:[Cc]ategory|分類|分类):[^\]]*\]\]", "", w)
    w = re.sub(r"\[\[[^\]|]*\|([^\]]*)\]\]", r"\1", w)
    w = re.sub(r"\[\[([^\]]*)\]\]", r"\1", w)
    w = re.sub(r"<br\s*/?>", "\n", w)
    w = re.sub(r"</?[A-Za-z][^>]*>", "", w)
    w = w.replace("__TOC__", "").replace("'''", "").replace("''", "")
    w = re.sub(r"^:+", "", w, flags=re.M)
    return w


def wiki_section(w, name):
    """返回标题为 name 的小节正文（到下一个同级或更高级标题为止）。"""
    hs = list(re.finditer(r"^(=+)\s*(.*?)\s*\1\s*$", w, flags=re.M))
    for k, h in enumerate(hs):
        if h.group(2).strip() == name:
            lvl = len(h.group(1))
            end = len(w)
            for h2 in hs[k + 1:]:
                if len(h2.group(1)) <= lvl:
                    end = h2.start()
                    break
            return w[h.end():end]
    raise Miss(f"找不到小节「{name}」")


def strip_headings(w):
    return re.sub(r"^(=+)\s*.*?\s*\1\s*$", "", w, flags=re.M)


def do_bracket(s):
    path = book_path(s["file"])
    raw, sha = read(path)
    lines = raw.split("\n")
    hits = []
    for n, l in enumerate(lines):
        if l.lstrip().startswith("【" + s["title"] + "】"):
            rest = l.lstrip()[len(s["title"]) + 2:]
            if s.get("meta") and s["meta"] not in rest:
                continue
            body = []
            for l2 in lines[n + 1:]:
                if l2.lstrip().startswith("【"):
                    break
                body.append(l2)
            text = tidy("\n".join(body))
            if s.get("has") and s["has"] not in text:
                continue
            hits.append((n + 1, l.strip(), text))
    if len(hits) != 1:
        raise Miss(f"【{s['title']}】匹配到 {len(hits)} 处")
    ln, head, text = hits[0]
    return text, dict(file=s["file"], line=ln, loc=head, sha=sha)


def do_chtxt(s):
    path = os.path.join(BOOKS, s["file"])
    raw, sha = read(path)
    lines = raw.split("\n")
    hits = []
    for n, l in enumerate(lines):
        m = re.match(r"^○\s*(.+?)\s*/\s*(\S+)\s*$", l)
        if not m:
            continue
        title, author = m.group(1), m.group(2)
        ok = title == s["title"] or title.startswith(s["title"] + "·") or title.startswith(s["title"] + "(")
        if author != s["author"] or not ok:
            continue
        body = []
        for l2 in lines[n + 1:]:
            if l2.startswith("○") or l2.startswith("##"):
                break
            body.append(l2)
        text = tidy("\n".join(body))
        if s.get("has") and s["has"] not in text:
            continue
        hits.append((n + 1, l.strip(), text))
    if len(hits) != 1:
        raise Miss(f"「{s['title']} / {s['author']}」匹配到 {len(hits)} 处")
    ln, head, text = hits[0]
    return text, dict(file=s["file"], line=ln, loc=head, sha=sha)


def do_ss(s):
    path = os.path.join(BOOKS, "世说新语.txt")
    raw, sha = read(path)
    sec = re.search(r"^## " + re.escape(s["pian"]) + r"\s*$([\s\S]*?)(?=^## )", raw, flags=re.M)
    if not sec:
        raise Miss(f"找不到篇「{s['pian']}」")
    items = re.findall(r"^(\d+)\.\s*(.+)$", sec.group(1), flags=re.M)
    hits = [(n, t) for n, t in items if s["has"] in t]
    if len(hits) != 1:
        raise Miss(f"「{s['has']}」在{s['pian']}匹配到 {len(hits)} 条")
    n, t = hits[0]
    line = raw[:raw.find(t)].count("\n") + 1
    return tidy(t), dict(file="世说新语.txt", line=line, loc=f"{s['pian']} 第{n}则", sha=sha)


def do_lines(s):
    path = book_path(s["file"])
    raw, sha = read(path)
    lines = raw.split("\n")
    a, b = s["a_line"], s["b_line"]
    if s["expect"] not in lines[a - 1]:
        raise Miss(f"第 {a} 行不含「{s['expect']}」——原文件可能已变动")
    pick = s.get("pick") or list(range(a, b + 1))
    paras = [lines[k - 1] for k in pick if lines[k - 1].strip()]
    return tidy("\n".join(paras)), dict(file=s["file"], line=a, loc=f"第 {'、'.join(map(str, pick))} 行", sha=sha)


def do_span(s):
    path = book_path(s["file"])
    raw, sha = read(path)
    if s.get("unwrap"):
        raw = unwrap(raw)
    lines = raw.split("\n")
    frm = len("\n".join(lines[:s.get("after", 0)]))
    pieces = s.get("pieces") or [(s["start"], s.get("end"))]
    out, first = [], None
    for st, en in pieces:
        t = span(raw, st, en, s.get("maxlen"), frm)
        pos = raw.find(t, frm)
        first = pos if first is None else first
        frm = pos + len(t)
        out.append(t)
    line = None if s.get("unwrap") else raw[:first].count("\n") + 1
    text = s.get("sep", "\n").join(out)
    if s["file"] == "红楼梦.txt":
        text = text.replace("．", "。")  # 该本用全角点作句号，统一为句号，不改字
        text = text.replace("`雪-也", "“雪”也")  # 第四回源文件引号错码，还原为引号
    return tidy(text), dict(file=s["file"], line=line, loc=f"「{pieces[0][0][:12]}…」起", sha=sha)


def do_wiki(s):
    path = os.path.join(WIKI, s["file"])
    raw, sha = read(path)
    w = clean_wiki(raw)
    if s.get("section"):
        w = wiki_section(w, s["section"])
    w = strip_headings(w)
    w = tidy(w)
    text = span(w, s.get("start"), s.get("end"), s.get("maxlen"))
    meta = dict(file="sources/wikisource/" + s["file"], line=None, loc=(s.get("section") or "") + (f"「{s['start'][:12]}…」起" if s.get("start") else ""), sha=sha)
    al = s.get("also")
    if al:
        f2 = al.get("file", s["file"])
        raw2, _ = read(os.path.join(WIKI, f2))
        w2 = tidy(strip_headings(clean_wiki(raw2)))
        if al.get("end_line"):
            i = w2.find(al["start"])
            if i < 0:
                raise Miss(f"also 找不到「{al['start']}」")
            j = w2.find("\n", i)
            t2 = w2[i:j if j > 0 else len(w2)]
        else:
            t2 = span(w2, al["start"], al.get("end"))
        text = text + "\n……\n" + t2
        if f2 != s["file"]:
            meta["file"] += " + sources/wikisource/" + f2
    return tidy(text), meta


KINDS = dict(bracket=do_bracket, chtxt=do_chtxt, ss=do_ss, lines=do_lines, span=do_span, wiki=do_wiki)


# OpenCC 会把史书人名、个别古义字改错（儁→俊、暐→晔/𬀩、藉卉→借卉、玁狁→𤞤狁），转换时原样保护
PROTECT = "儁暐藉玁"


def to_simp(text):
    marks = {}
    buf = []
    for ch in text:
        if ch in PROTECT:
            key = chr(0xE000 + len(marks))
            marks[key] = ch
            buf.append(key)
        else:
            buf.append(ch)
    simp = T2S("".join(buf))
    for k, ch in marks.items():
        simp = simp.replace(k, ch)
    # 转出的扩展区汉字（码位 > U+FFFF，多数字体缺字）若原文没有，逐位还原为原字
    if len(simp) == len(text):
        simp = "".join(t if (ord(c) > 0xFFFF and c != t) else c for c, t in zip(simp, text))
    return simp


def extract(s):
    text, src = KINDS[s["kind"]](s)
    if s.get("punct"):
        text = full_punct(text)
        src["norm"] = "半角标点改全角"
    for a, b, why in s.get("fix", []):
        if a not in text:
            raise Miss(f"修正项「{a}」不在原文中")
        text = text.replace(a, b)
        src.setdefault("fix", []).append(f"{a}→{b}（{why}）")
    if len(text) < 16:
        raise Miss(f"结果过短（{len(text)} 字）")
    simp = to_simp(text)
    item = dict(t=s["t"], a=s["a"], src=src, simp=simp)
    if simp != text:
        item["trad"] = text
    return item


def main(argv):
    show = argv[argv.index("--show") + 1] if "--show" in argv else None
    check = "--check" in argv
    ids = [s["id"] for s in TEXTS]
    dup = {i for i in ids if ids.count(i) > 1}
    if dup:
        print("重复 id：", dup)
        return 1
    out, errs = {}, []
    for s in TEXTS:
        if show and s["id"] != show:
            continue
        try:
            out[s["id"]] = extract(s)
        except Miss as e:
            errs.append(f"{s['id']}: {e}")
        except Exception as e:  # noqa: BLE001
            errs.append(f"{s['id']}: {type(e).__name__} {e}")
    if show:
        it = out.get(show)
        print(json.dumps(it, ensure_ascii=False, indent=1) if it else errs)
        return 0 if it else 1
    for e in errs:
        print("✗", e)
    print(f"抽取 {len(out)}/{len(TEXTS)} 段，失败 {len(errs)} 段；总字数 {sum(len(v['simp']) for v in out.values())}")
    if errs:
        return 1
    if check:
        return 0
    js = "/* 由 tools/extract_texts.py 自动生成，请勿手改。原文来源与定位见每段 src。 */\nLIT.addTexts(" + json.dumps(out, ensure_ascii=False, indent=0) + ");\n"
    with open(os.path.join(ROOT, "data", "texts.js"), "w", encoding="utf-8") as f:
        f.write(js)
    print("已写出 data/texts.js")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
