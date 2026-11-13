/* 语音识别工作线程（模块 Worker）：在浏览器里用 Whisper（base，int8 量化）把一段 16 kHz 单声道录音识别成中文文字。
 * 运行库与模型和意大利语能力岛共用同一份（同一网站下的 italy-learning/vendor、models，由 js/asr.js 传入地址），
 * 音频不会离开你的设备。只能在 http(s) 页面里使用（模块 Worker 不能从 file:// 加载）。
 * 移植自意大利语能力岛 js/asr-worker.js：语言改为中文，加了简体提示（不加时 Whisper 常输出繁体、不带标点）。 */

const MODEL = 'whisper-base';
const CACHE = 'isola-asr-v1';
let T = null, processor = null, tokenizer = null, model = null, gen = null, loading = null;
let queue = Promise.resolve();
let promptIds = [];

const post = m => self.postMessage(m);

// 提示词：让 Whisper 输出简体、带标点（Whisper 的惯用做法：把一句示范放在 <|startofprev|> 之后）
const PROMPT = '以下是普通话的句子，使用简体中文。';

async function load(assets) {
  if (model) return;
  if (!loading) {
    loading = (async () => {
      T = await import(new URL('vendor/transformers.min.js', assets).href);
      const { AutoProcessor, AutoTokenizer, WhisperForConditionalGeneration, env } = T;
      env.allowRemoteModels = false;
      env.allowLocalModels = true;
      env.localModelPath = new URL('models/', assets).href;
      env.backends.onnx.wasm.wasmPaths = new URL('vendor/', assets).href;
      env.backends.onnx.wasm.numThreads = 1;               // 没有跨源隔离（SharedArrayBuffer）时只能单线程
      // 模型文件直接从共用的缓存（isola-asr-v1，js/asr.js 下载时写入）读取，不再另存一份到 transformers-cache
      if (self.caches) {
        try { env.useBrowserCache = false; env.useCustomCache = true; env.customCache = await caches.open(CACHE); } catch (e) { env.useCustomCache = false; }
      }
      const progress_callback = p => post({ type: 'progress', p });
      gen = await (await fetch(new URL('models/' + MODEL + '/generation_config.json', assets))).json();
      const [pr, tk, md] = await Promise.all([
        AutoProcessor.from_pretrained(MODEL, { progress_callback }),
        AutoTokenizer.from_pretrained(MODEL, { progress_callback }),
        WhisperForConditionalGeneration.from_pretrained(MODEL, { dtype: { encoder_model: 'q8', decoder_model_merged: 'q8' }, device: 'wasm', progress_callback }),
      ]);
      processor = pr; tokenizer = tk; model = md;
      promptIds = Array.from(tokenizer.encode(PROMPT, { add_special_tokens: false }));
    })();
  }
  try { await loading; } catch (e) { loading = null; throw e; }
  loading = null;
}

const MAX_SAMPLES = 16000 * 28;

/** 编码（最耗时的一步），结果交给 generate 复用（Whisper 的 forward_params 里没有 encoder_outputs，运行时补上） */
async function encode(pcm) {
  const x = pcm.length > MAX_SAMPLES ? pcm.subarray(0, MAX_SAMPLES) : pcm;
  if (!model.forward_params.includes('encoder_outputs')) model.forward_params = model.forward_params.concat('encoder_outputs');
  const inputs = await processor(x);
  const out = await model.sessions.model.run({ input_features: inputs.input_features.ort_tensor || inputs.input_features });
  return { inputs, enc: new T.Tensor(out.last_hidden_state) };
}

const prefix = () => [gen.decoder_start_token_id ?? 50258, gen.lang_to_id['<|zh|>'], gen.task_to_id.transcribe, gen.no_timestamps_token_id];

async function transcribe(pcm, usePrompt) {
  const { inputs, enc } = await encode(pcm);
  const start = (usePrompt && promptIds.length ? [gen.prev_sot_token_id ?? 50361].concat(promptIds) : []).concat(prefix());
  const out = await model.generate({ input_features: inputs.input_features, encoder_outputs: enc, decoder_input_ids: start, max_new_tokens: 200 });
  const ids = Array.from(out.tolist()[0], Number).slice(start.length);
  return tokenizer.decode(ids, { skip_special_tokens: true }).trim();
}

self.onmessage = e => {
  const m = e.data;
  // 推理必须一个接一个：同一个模型会话不能并发运行
  queue = queue.then(async () => {
    try {
      if (m.type === 'load') { await load(m.assets); post({ type: 'loaded', id: m.id }); }
      else if (!model) throw new Error('模型还没有加载');
      else if (m.type === 'transcribe') post({ type: 'result', id: m.id, text: await transcribe(m.pcm, m.prompt !== false) });
    } catch (err) {
      post({ type: 'error', id: m.id, message: String((err && err.message) || err) });
    }
  });
};
