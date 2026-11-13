# 🏝️ 文学能力岛（lit-island）v0.2.0

九十天古典文学与历史学习程序：诗经、魏晋南北朝、十六国诸燕、唐诗、五代十国、宋词、元曲、明清（心学、戏曲、小说笔记）、公案。每天 15–40 分钟，五步学习，间隔复习，按"讲清度"评估。程序流程沿用意大利语能力岛与新概念英语能力岛（学习计划可调、每 5 天一轮 4 学 1 复、间隔复习卡片、纯静态 PWA），把语言课的六步换成了文学课的五步：导读 → 原文 → 精读 → 思辨 → 输出。

**在线地址**：<https://gusujushi.github.io/lit-island/>

## 怎么用

- **手机（像 App 一样）**：iPhone 用 **Safari** 打开上面的网址 → 分享按钮 ⬆️ →「添加到主屏幕」；安卓用 **Chrome** 打开 → 菜单 ⋮ →「安装应用 / 添加到主屏幕」。打开一次后断网也能学。
- **电脑**：直接打开网址；或双击本地的 `index.html`（本地打开时，注本页码旁会出现"打开"按钮，可直接跳到本机 PDF 对应页）。
- 进度、笔记、卡片只存在当前浏览器里，不上传。iPhone 上"主屏幕 App"和 Safari 的进度是分开保存的：先添加到主屏幕再开始学；换设备时在「我的」导出备份、在新设备导入。

## 内容

| 项目 | 数量 |
| --- | --- |
| 学习日 / 复习日 | 72 / 18（第 30、60、90 天为月度回顾） |
| 模块 | 诗经 7 · 魏晋 7 · 诸燕 10 · 唐诗 10 · 五代 5 · 宋词 9 · 元曲 6 · 明清 11 · 公案 5 · 燕国创作工坊 2 |
| 原文 | 109 段，全部来自公版文本，每段标来源文件、位置与 SHA-256 |
| 卡片 / 小测 | 189 张 / 191 题 |
| 注本页码指引 | 81 条（学习者本机的 PDF 注本，只给页码，不摘抄） |

原文来源：古籍公版 txt（诗经、唐诗三百首、宋词三百首、元曲、花间集、南唐二主词、世说新语、晋书、红楼梦、三侠五义；第二批：传习录、牡丹亭、儒林外史、聊斋志异、施公案、彭公案）与维基文库公有领域页面（陶渊明、曹植、阮籍、搜神记、资治通鉴、窦娥冤、西厢记、汉宫秋、赵氏孤儿、湖心亭看雪；原始 wikitext 与修订号见 `sources/wikisource/`）。同一作品有两个来源时择优使用，对源文件的任何改动（缺字还原、标点规范）都登记在该段原文的来源信息里。讲解、问题、测验为本项目原创撰写。

## 目录

```
index.html  manifest.webmanifest  sw.js（离线缓存）
css/app.css                       明暗主题、手机优先
js/lit.js   课程容器（复习日自动生成）   js/plan.js  排期（每周学习日、重新排期）
js/srs.js   莱特纳盒子                  js/store.js 进度、笔记、导出（Markdown／JSON）
js/app.js   界面
data/meta.js      阶段、模块、书目、量规、时长档、月度回顾题
data/texts.js     原文（自动生成，勿手改）
data/days1-3.js   72 个学习日
data/guide.js     方法页（也用于生成方案文档）
data/books-local.js  本机 PDF 路径（不入库，tools/make_local_books.py 生成，可缺省）
sources/wikisource/  维基文库原始 wikitext + _ledger.tsv
tools/  extract_texts.py · text_spec.py · fetch_wikisource.py · make_local_books.py
        validate.js · export_plan.js · make_ledgers.py · make_icons.py
tests/  core.test.js（单元）· e2e/flow.js（端到端）
```

## 维护

```bash
python3 -m venv .venv && .venv/bin/pip install opencc-python-reimplemented   # 首次
.venv/bin/python tools/extract_texts.py      # 改了 text_spec.py 后重抽原文（需要本机古籍 txt）
python3 tools/make_local_books.py            # 生成本机 PDF 路径（可选）
node tools/validate.js --check-sources       # 数据校验 + 原文来源校验值复核
node --test tests/*.test.js                  # 单元测试
PW=/path/to/node_modules/playwright node tests/e2e/flow.js [截图目录]   # 端到端（用本机 Chrome）
node tools/export_plan.js <输出.md> vN YYYY-MM-DD   # 生成方案文档
```

改课程只改 `data/days*.js`、`data/meta.js`、`data/guide.js`；改原文只改 `tools/text_spec.py` 再重抽。每次发布前递增 `sw.js` 的 `VERSION`，手机端才会拿到新版。

## 已知边界

- 讲解、问题、测验为原创撰写，未经专业学者审校；与权威注本不一致时以注本为准。
- 繁转简为 OpenCC 自动转换，已保护"儁、暐、藉、玁"等字；可切换"来源原貌"对照。
- 朗读用浏览器自带中文语音，质量取决于系统。
- 仓库尚未选择许可证（默认保留所有权利）；古籍原文本身属公有领域。
