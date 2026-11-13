# 语音输入与 AI 老师：怎么工作，能信到什么程度

v0.5.0 起，语音输入和 AI 老师沿用意大利语能力岛的做法：**"听"由本机 Whisper 完成，"想"由 DeepSeek 完成**。DeepSeek 是文本模型，不接收音频，所以两者分工如下：

```
你说话 ──→ 录音（只在内存里）──→ 本机 Whisper（浏览器里运行，录音不上传）──→ 识别文字
                                                                   │  繁转简、去掉"字幕由…提供"之类幻觉套话（js/zh.js）
                                                                   ↓
                       填了 DeepSeek Key？──否──→ 直接插进输入框
                              │是
                              ↓
          DeepSeek 校对：只发文字（识别结果 + 本课标题、原文摘录、字词、题目），
          只改同音字、书名人名、古诗文引文和标点，不改写、不润色 ──→ 插进输入框（可"撤销校对"）
```

AI 老师另外三个用途（都要先填 Key，都只发文字）：

| 用途 | 位置 | 发出去的内容 |
| --- | --- | --- |
| 讲解原文 | ②原文，每篇原文下「🤖 请 AI 讲解这篇」 | 本课标题、这篇原文（最多约 1800 字） |
| 提问 | 同上，「问 AI」 | 本课标题、原文摘录、你的问题 |
| 点评 | ④思辨、⑤输出底部 | 本课标题、读前问题、精读要点、各题题目和你的回答、讲清度量规 L0–L3 |

讲解和点评的结果记在本机（`lit-island-ai-cache`），同一内容不重复花钱；点评按你的文字指纹缓存，文字改了会重新点评。

## 本机语音识别

- **模型与运行库**：whisper-base（int8 量化）+ transformers.js 3.7.6 + ONNX Runtime Web（WebAssembly，单线程）。文件**不放在本仓库**，直接用同一网站下意大利语能力岛的那一份：

  | 文件（相对 `https://gusujushi.github.io/italy-learning/`） | 大小 | SHA-256 |
  | --- | --- | --- |
  | `vendor/transformers.min.js` | 0.9 MB | `13746ae88695b62e431fc5ebe3beb10a080d2081406047670639ce8c10a9ba25` |
  | `vendor/ort-wasm-simd-threaded.jsep.mjs` | 0.05 MB | `08fb86ec433c78bfb032c5d84a68b8e8e5a8d81268fa39e24314179a5767a5b9` |
  | `vendor/ort-wasm-simd-threaded.jsep.wasm` | 21.6 MB | `c46655e8a94afc45338d4cb2b840475f88e5012d524509916e505079c00bfa39` |
  | `models/whisper-base/onnx/encoder_model_quantized.onnx` | 23.2 MB | `5862993336bf33acd23736071aae2b32261d3b1b2f37780194460d4ef974dd46` |
  | `models/whisper-base/onnx/decoder_model_merged_quantized.onnx` | 53.7 MB | `fa3ef9902734ce5ae6f9ef2bdb2ba9a6c4b5785b09f4f420ce036573dc9d090b` |
  | `models/whisper-base/` 下 config、generation_config、preprocessor_config、tokenizer、tokenizer_config | 约 2.8 MB | — |

  许可：模型来自 onnx-community/whisper-base（Apache-2.0；OpenAI Whisper 原模型 MIT）；transformers.js、ONNX Runtime 均为 Apache-2.0 / MIT。
- **缓存**：下载后放在浏览器 Cache Storage 的 `isola-asr-v1`，与意大利语能力岛**同名同键**，所以在同一个浏览器里只下一次；删除也会两边一起删。iPhone 上"添加到主屏幕"的网页应用各自独立存储，可能要各下一次。工作线程通过 transformers.js 的 `customCache` 直接读这份缓存，不再另存一份。
- **⚠️ 同站缓存**：两个程序同源，共用 Cache Storage。v0.4.0 及以前的 `sw.js` 在升级时会删除**所有**非本版本的缓存（包括意大利语能力岛下载的音频和模型）；v0.5.0 改为只删 `lit-island-` 开头的缓存。
- **中文设置**：语言固定为中文；解码前加一句简体提示（`<|startofprev|>以下是普通话的句子，使用简体中文。`）——不加时 whisper-base 常输出繁体、不带标点。剩下的繁体由 `js/zh-data.js`（OpenCC t2s 单字表）转成简体，"儁、暐、藉、玁"不转。
- **长录音**：一次最多录 2 分钟；超过 28 秒的录音在最安静处切段逐段识别（Whisper 一次只听 30 秒）。
- **限制**：需要 http(s) 打开（模块 Worker 不能从 `file://` 加载）；需要 WebAssembly、Web Worker、MediaRecorder。

## 实测（2026-11-12，本机 Chrome，单线程 WebAssembly）

| 测试 | 结果 |
| --- | --- |
| 模型加载（已缓存） | 约 0.8 秒 |
| 识别 10 秒录音 | 约 1.5 秒（手机可能慢几倍） |
| 真人朗读现代汉语（FLEURS 普通话测试集 30 句，男女各 15，CC BY 4.0，只用于本机评测、未入库），字错误率 | **19.5%** |
| 合成语音朗读本课程古文（40 段），字错误率 | **42.6%** |
| 典型错误（合成语音读"我认为关雎首先是一首求爱诗……钟鼓乐之带有礼乐的色彩"） | "我认为**冠军**首先是一首**球艾诗**，文本里没有**后非**的字样，但是**中古**乐之**代**有礼**月**的色彩" |

结论：**whisper-base 识别现代汉语口语大致能用，古文、书名、人名常写成同音字**——这正是 DeepSeek 校对要补的地方（它拿到本课原文和题目，能把"冠军/球艾诗/后非"改回"关雎/求爱诗/后妃"）。DeepSeek 校对这一步**没有用真实 API 做过评测**（开发时没有 Key）：端到端测试里用的是假接口，只验证了数据流、撤销校对、结果不可信时的回退；实际效果请先试几次。

校对的安全措施：温度 0；提示词要求只改识别错误和标点、不改写不回答；返回的汉字数与原识别相差过大（少于 0.6 倍或多于 1.5 倍）时视为不可信，保留原识别并提示；插入后可一键"撤销校对"。

## 隐私

- 录音只在内存里解码和识别，不上传、不存盘；页面空闲 3 分钟后释放识别线程。
- DeepSeek 只收到文字。Key 只存在本机浏览器的 `lit-island-ai`（与学习进度 `lit-island-v1` 分开），导出备份不含 Key；接口地址只允许 https（本机调试地址除外）。
- 不填 Key 时，语音识别和全部学习功能照常可用。

## 相关文件

```
js/audio.js        录音（MediaRecorder）、16 kHz 重采样、有没有说话、长录音切段（纯计算部分有单元测试）
js/asr.js          主线程：下载 / 缓存 / 删除模型，调用工作线程（移植自意大利语能力岛）
js/asr-worker.js   Whisper 工作线程：中文识别（移植自意大利语能力岛，改为中文 + 简体提示）
js/zh.js           识别文字整理：繁转简、去幻觉套话、补标点、插入位置、校对结果可信度
js/zh-data.js      繁→简单字表（tools/make_zh_tables.py 生成）
js/ai.js           DeepSeek：polish 校对、explain 讲解、ask 提问、review 点评（移植自意大利语能力岛）
tests/e2e/flow.js  端到端：假麦克风 + 识别替身 + 假 DeepSeek 接口
tests/e2e/voice.js 端到端：假麦克风播放录音 → 真实 Whisper → 假 DeepSeek → 断网再识别一次
```
