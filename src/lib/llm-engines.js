import { CHAT_TEMPLATE_BUILDERS } from './qwen3-prompt.js';

export function createLlmBridge({ env, nativeApi, windowObj, ollama }) {
  const win = windowObj;
  const isNative = () => !!(env && env.Capacitor && (env.Capacitor.isNativePlatform ? env.Capacitor.isNativePlatform() : true));

  // ---------- native (llama.cpp via llama-cpp-pro) ----------
  let llmContext = null;
  let llmInitPromise = null;

  async function initNative(opts) {
    if (llmContext) return { ok: true, engine: 'native' };
    if (llmInitPromise) return llmInitPromise;
    llmInitPromise = (async () => {
      try {
        llmContext = await nativeApi.initLlama({
          model: opts.model,
          n_ctx: opts.nCtx ?? 2048,
          n_batch: opts.nBatch ?? 128,
          n_threads: opts.nThreads ?? 4,
          temperature: opts.temperature ?? 0.7,
          use_mlock: false,
        });
        return { ok: true, engine: 'native', model: opts.model };
      } catch (e) {
        llmInitPromise = null;
        return { ok: false, reason: 'llm-init-failed', detail: String(e?.message || e) };
      }
    })();
    return llmInitPromise;
  }

  async function chatNative(messages, opts) {
    const init = await initNative(opts);
    if (!init.ok) return init;
    try {
      const builder = CHAT_TEMPLATE_BUILDERS[opts.chatTemplateKind || 'qwen3'];
      const prompt = builder
        ? builder(messages, { thinking: false, addGenerationPrompt: true })
        : null;
      const result = await llmContext.completion(
        prompt
          ? { prompt, n_predict: opts.nPredict ?? 256, temperature: opts.temperature ?? 0.7 }
          : {
              messages,
              n_predict: opts.nPredict ?? 256,
              temperature: opts.temperature ?? 0.7,
              chat_template: opts.chatTemplate,
            },
      );
      let out = result?.content || result?.text || '';
      // Qwen3 may emit a lone leading </think> (or a full <think>…</think> block);
      // strip both so only the final answer is returned.
      out = out
        .replace(/<think>[\s\S]*?<\/think>\s*/g, '')
        .replace(/^\s*<\/think>\s*/g, '')
        .trim();
      if (!out) return { ok: false, reason: 'empty-response', detail: String(result?.text || '') };
      return { ok: true, text: out };
    } catch (e) {
      return { ok: false, reason: 'llm-chat-failed', detail: String(e?.message || e) };
    }
  }

  function releaseNative() {
    if (llmContext) { try { llmContext.release(); } catch (e) {} llmContext = null; }
    llmInitPromise = null;
  }

  async function chatWeb(messages, opts) {
    try {
      return await ollama.chat({
        model: opts.model || 'gemma4:e2b-it-qat',
        messages,
        host: opts.host,
        timeoutMs: opts.timeoutMs || 30000,
        options: { temperature: opts.temperature ?? 0.7, numPredict: opts.nPredict ?? 256 },
      });
    } catch (e) {
      return { ok: false, reason: 'llm-chat-failed', detail: String(e?.message || e) };
    }
  }

  const engine = isNative() ? 'native' : 'web';

  return {
    engine,
    get ready() { return engine === 'web' ? true : !!llmContext; },
    init: (opts) => (engine === 'native' ? initNative(opts) : Promise.resolve({ ok: true, engine: 'web' })),
    chat: (messages, opts) => (engine === 'native' ? chatNative(messages, opts) : chatWeb(messages, opts)),
    release: () => (engine === 'native' ? releaseNative() : undefined),
  };
}