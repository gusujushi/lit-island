# 数据格式

## 学习日（data/days1–3.js）

```js
LIT.addDays([{
  d: 27, mod: 'yan', title: '课题',
  texts: ['tj_feishui', 'jin_chui'],   // 主读原文 id（见 texts.js）
  opt: ['jin_fengba'],                 // 可选：选读（深读档自动展开）
  bg: '背景 100–200 字', ask: '读前问题',
  notes: [['字词', '释义'], ...],        // 3–14 条
  keys: ['精读要点', ...],               // 2–3 条
  retell: '复述任务', judge: '判断题', link: '对照题', out: '输出任务',
  quiz: [['题干', ['正确项', '干扰项', '干扰项'], '解析'], ...],  // 正确项写第一位，显示时打乱
  cards: [['正面', '背面'], ...],        // 完成当天后进入复习盒
  book: [['dbcs', 1164, '内容说明'], ...], // 本机注本：书代号、PDF 阅读器页码、说明
  yan: '与《燕云悲歌》的对照（燕国课必填）',
}]);
```

复习日（5 的倍数）不写数据，由 `LIT.day(n)` 自动生成，覆盖前 4 个学习日；30 的倍数为月度回顾，题目在 `meta.js` 的 `phases[].month`。

## 原文（tools/text_spec.py → data/texts.js）

每段：`{ t, a, src: { file, line, loc, sha }, simp, trad? }`。`sha` 是来源文件原始字节的 SHA-256；`trad` 仅在来源与简体不同时保存。定位方式（kind）：`bracket`、`chtxt`、`ss`、`lines`、`span`、`wiki`，详见 `text_spec.py` 文件头。

## 进度（localStorage `lit-island-v1`）

`{ v:1, settings, rebase, days:{n:{mode, step, read, quiz, notes:{ask,retell,judge,link,out}, rating, done}}, reviews:{n:{recall, rate, revise, month, summary, done}}, cards:{id:{box,due,seen,wrong,last}}, log:{date:minutes} }`。卡片 id：`d{n}c{i}`（课程卡）、`d{n}j`（判断卡，内容取自学习者自己的判断回答）。
