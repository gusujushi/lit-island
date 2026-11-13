#!/usr/bin/env python3
"""从维基文库按页面标题抓取公有领域原文（原始 wikitext），逐页登记来源。

用法：python3 tools/fetch_wikisource.py 標題1 標題2 ...
  - 每次 API 请求最多带 20 个标题；请求之间间隔 6 秒，遇到 429 按 Retry-After 退避。
  - 已存在的文件不重复下载，也不覆盖（只增不改）。
  - 输出：sources/wikisource/<标题，/ 换成 __>.wiki，并在 _ledger.tsv 追加一行：
    标题、pageid、revid、修订时间、sha256、URL、抓取时间。
只请求公开页面；User-Agent 用通用名称，不带任何个人信息。
"""
import hashlib
import json
import os
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone

API = "https://zh.wikisource.org/w/api.php"
UA = "lit-island-study/0.1 (personal non-commercial study tool)"
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "sources", "wikisource")
LEDGER = os.path.join(OUT, "_ledger.tsv")


def safe(title):
    return title.replace("/", "__").replace(" ", "_")


def call(params, tries=6):
    url = API + "?" + urllib.parse.urlencode(params)
    for i in range(tries):
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        try:
            with urllib.request.urlopen(req, timeout=40) as r:
                return json.loads(r.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            if e.code == 429:
                wait = int(e.headers.get("Retry-After") or 10) + 3 * (i + 1)
                print(f"  429，等待 {wait} 秒", file=sys.stderr)
                time.sleep(wait)
                continue
            raise
    raise RuntimeError("多次 429，放弃：" + url)


def main(titles):
    os.makedirs(OUT, exist_ok=True)
    todo = [t for t in titles if not os.path.exists(os.path.join(OUT, safe(t) + ".wiki"))]
    skipped = len(titles) - len(todo)
    if skipped:
        print(f"已存在，跳过 {skipped} 个")
    new_ledger = not os.path.exists(LEDGER)
    missing = []
    with open(LEDGER, "a", encoding="utf-8") as lg:
        if new_ledger:
            lg.write("title\tresolved_title\tpageid\trevid\trev_timestamp\tsha256\turl\tfetched_at\n")
        for k in range(0, len(todo), 20):
            batch = todo[k:k + 20]
            d = call({
                "action": "query", "format": "json", "formatversion": "2", "redirects": "1",
                "prop": "revisions", "rvprop": "ids|timestamp|content", "rvslots": "main",
                "titles": "|".join(batch),
            })
            q = d.get("query", {})
            back = {}
            for m in q.get("normalized", []) + q.get("redirects", []):
                back[m["to"]] = back.get(m["from"], m["from"])
            for p in q.get("pages", []):
                asked = back.get(p["title"], p["title"])
                if p.get("missing") or "revisions" not in p:
                    missing.append(asked)
                    continue
                rev = p["revisions"][0]
                text = rev["slots"]["main"]["content"]
                fn = os.path.join(OUT, safe(asked) + ".wiki")
                with open(fn, "w", encoding="utf-8") as f:
                    f.write(text)
                sha = hashlib.sha256(text.encode("utf-8")).hexdigest()
                url = "https://zh.wikisource.org/wiki/" + urllib.parse.quote(p["title"]) + "?oldid=" + str(rev["revid"])
                now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
                lg.write(f"{asked}\t{p['title']}\t{p['pageid']}\t{rev['revid']}\t{rev['timestamp']}\t{sha}\t{url}\t{now}\n")
                print(f"  ✓ {asked} → {p['title']}（{len(text)} 字符）")
            if k + 20 < len(todo):
                time.sleep(6)
    if missing:
        print("不存在：" + "、".join(missing))
        return 2
    return 0


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    sys.exit(main(sys.argv[1:]))
