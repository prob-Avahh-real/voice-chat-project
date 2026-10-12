import personaMd from '../persona/companion-persona.md?raw';
import { chat as ollamaChat } from './lib/ollama-client.js';
import { classify, transform, buildMessages } from './lib/companion-core.js';
import { createLlmBridge } from './lib/llm-engines.js';
import llama from './plugins/llama/index.js';

export const COMPANION_CONFIG = Object.freeze({
  nativeModel: 'qwen3-1.7b-q4_k_m.gguf',
  nativeNCtx: 2048,
  nativeNBatch: 128,
  nativeNThreads: 8,
  nativeNPredict: 64,
  chatTemplateKind: 'qwen3',
  fallbackModel: 'gemma4:e2b-it-qat',
  host: 'http://localhost:11434',
  timeoutMs: 30000,
  maxHistory: 4,
});

const engine = createLlmBridge({
  env: typeof window !== 'undefined' ? window : {},
  nativeApi: llama,
  windowObj: typeof window !== 'undefined' ? window : {},
  ollama: { chat: ollamaChat },
});

const isNative = engine.engine === 'native';

let history = [];
let modelsDir = '';

export function setModelsDir(dir) {
  modelsDir = dir || '';
}

function nativeModel() {
  return modelsDir ? modelsDir + COMPANION_CONFIG.nativeModel : COMPANION_CONFIG.nativeModel;
}

export async function initCompanion() {
  if (!isNative) return { ok: true, engine: 'web' };
  return engine.init({
    model: nativeModel(),
    nCtx: COMPANION_CONFIG.nativeNCtx,
    nBatch: COMPANION_CONFIG.nativeNBatch,
    nThreads: COMPANION_CONFIG.nativeNThreads,
    nPredict: COMPANION_CONFIG.nativeNPredict,
    chatTemplateKind: COMPANION_CONFIG.chatTemplateKind,
  });
}

export async function askCompanion(userText) {
  const classification = classify({ text: userText });
  const transformed = transform(classification, { text: userText });

  if (transformed.bypassLLM) {
    return { ok: true, text: transformed.text, kind: 'crisis' };
  }

  const trimmedHistory = history.slice(-COMPANION_CONFIG.maxHistory);
  const messages = buildMessages(personaMd, trimmedHistory, userText);

  const result = isNative
    ? await engine.chat(messages, {
        model: nativeModel(),
        nPredict: COMPANION_CONFIG.nativeNPredict,
        chatTemplateKind: COMPANION_CONFIG.chatTemplateKind,
      })
    : await engine.chat(messages, {
        model: COMPANION_CONFIG.fallbackModel,
        host: COMPANION_CONFIG.host,
        timeoutMs: COMPANION_CONFIG.timeoutMs,
      });

  if (!result.ok) {
    return { ok: false, text: '', reason: result.reason, detail: result.detail };
  }

  history = [...history, { role: 'user', content: userText }, { role: 'assistant', content: result.text }];
  return { ok: true, text: result.text, kind: 'normal' };
}

export function clearHistory() {
  history = [];
}

export function releaseCompanion() {
  engine.release();
}

if (typeof window !== 'undefined') {
  window.companion = { askCompanion, clearHistory, getConfig: () => COMPANION_CONFIG, init: initCompanion, setModelsDir };
}

export default engine;
