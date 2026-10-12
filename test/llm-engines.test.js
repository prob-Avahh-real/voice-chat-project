import test from 'node:test';
import assert from 'node:assert/strict';
import { createLlmBridge } from '../src/lib/llm-engines.js';

function fakeNativeApi() {
  let context = null;
  const log = [];
  return {
    initLlama: async (params) => {
      log.push(['initLlama', params.model]);
      context = {
        _params: params,
        completion: async ({ prompt, messages, n_predict, temperature }) => {
          const last = messages ? messages.at(-1).content : prompt;
          log.push(['completion', last, n_predict, temperature]);
          return { text: '小满回复：' + last };
        },
        release: async () => { log.push(['release']); },
      };
      return context;
    },
    releaseAllLlama: async () => { log.push(['releaseAllLlama']); },
    _log: log,
    _ctx: () => context,
  };
}

function fakeOllama(overrides = {}) {
  const log = [];
  const chat = async (payload) => {
    log.push(payload);
    return { ok: true, text: 'ollama回复：' + payload.messages.at(-1).content };
  };
  return { chat, _log: log, ...overrides };
}

const nativeEnv = { Capacitor: { isNativePlatform: () => true } };

test('非 Capacitor 环境走 web 引擎', () => {
  const bridge = createLlmBridge({ env: {}, nativeApi: fakeNativeApi(), windowObj: {}, ollama: fakeOllama() });
  assert.equal(bridge.engine, 'web');
  assert.equal(bridge.ready, true);
});

test('Capacitor 环境走 native 引擎', () => {
  const bridge = createLlmBridge({ env: nativeEnv, nativeApi: fakeNativeApi(), windowObj: {}, ollama: fakeOllama() });
  assert.equal(bridge.engine, 'native');
  assert.equal(bridge.ready, false); // 未 init
});

test('native init 幂等：重复调用只 init 一次', async () => {
  const api = fakeNativeApi();
  const bridge = createLlmBridge({ env: nativeEnv, nativeApi: api, windowObj: {}, ollama: fakeOllama() });
  const r1 = await bridge.init({ model: 'qwen3-1.7b.gguf', nCtx: 2048 });
  const r2 = await bridge.init({ model: 'qwen3-1.7b.gguf' });
  assert.equal(r1.ok, true);
  assert.equal(r2.ok, true);
  const inits = api._log.filter(([k]) => k === 'initLlama');
  assert.equal(inits.length, 1);
});

test('native init 异常返回 llm-init-failed', async () => {
  const api = fakeNativeApi();
  api.initLlama = async () => { throw new Error('no model file'); };
  const bridge = createLlmBridge({ env: nativeEnv, nativeApi: api, windowObj: {}, ollama: fakeOllama() });
  const r = await bridge.init({ model: 'missing.gguf' });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'llm-init-failed');
  assert.match(r.detail, /no model file/);
});

test('native chat 走 initLlama->completion 并取 text', async () => {
  const api = fakeNativeApi();
  const bridge = createLlmBridge({ env: nativeEnv, nativeApi: api, windowObj: {}, ollama: fakeOllama() });
  const messages = [
    { role: 'system', content: '你是小满。' },
    { role: 'user', content: '你好' },
  ];
  const r = await bridge.chat(messages, { model: 'qwen3-1.7b.gguf', nPredict: 128 });
  assert.equal(r.ok, true);
  assert.match(r.text, /你好/);
  const last = api._log.at(-1);
  assert.equal(last[0], 'completion');
  assert.equal(last[2], 128);
  assert.equal(last[3], 0.7);
  assert.match(last[1], /<\|im_start\|>user\n你好<\|im_end\|>/);
  assert.match(last[1], /<think>\n\n<\/think>\n\n/);
});

test('native chat empty-response 报错不伪装成功', async () => {
  const api = fakeNativeApi();
  const ctx = { completion: async () => ({ text: '' }) };
  api.initLlama = async () => ctx;
  const bridge = createLlmBridge({ env: nativeEnv, nativeApi: api, windowObj: {}, ollama: fakeOllama() });
  const r = await bridge.chat([{ role: 'user', content: 'x' }], { model: 'm.gguf' });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'empty-response');
});

test('native chat 异常返回 llm-chat-failed', async () => {
  const api = fakeNativeApi();
  const ctx = { completion: async () => { throw new Error('kv cache OOM'); } };
  api.initLlama = async () => ctx;
  const bridge = createLlmBridge({ env: nativeEnv, nativeApi: api, windowObj: {}, ollama: fakeOllama() });
  const r = await bridge.chat([{ role: 'user', content: 'x' }], { model: 'm.gguf' });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'llm-chat-failed');
});

test('native release 释放 context', async () => {
  const api = fakeNativeApi();
  const bridge = createLlmBridge({ env: nativeEnv, nativeApi: api, windowObj: {}, ollama: fakeOllama() });
  await bridge.init({ model: 'm.gguf' });
  bridge.release();
  assert.ok(api._log.some(([k]) => k === 'release'));
  assert.equal(bridge.ready, false);
});

test('web chat 转发给 ollama 客户端并透传结果', async () => {
  const ollama = fakeOllama();
  const bridge = createLlmBridge({ env: {}, nativeApi: {}, windowObj: {}, ollama });
  const messages = [{ role: 'system', content: 'sys' }, { role: 'user', content: 'hi' }];
  const r = await bridge.chat(messages, { model: 'gemma4:e2b-it-qat', host: 'http://h:11434' });
  assert.equal(r.ok, true);
  assert.equal(r.text, 'ollama回复：hi');
  assert.equal(ollama._log[0].model, 'gemma4:e2b-it-qat');
  assert.equal(ollama._log[0].host, 'http://h:11434');
  assert.equal(ollama._log[0].messages.at(-1).content, 'hi');
});

test('web chat 异常返回 llm-chat-failed', async () => {
  const ollama = { chat: async () => { throw new Error('conn refused'); } };
  const bridge = createLlmBridge({ env: {}, nativeApi: {}, windowObj: {}, ollama });
  const r = await bridge.chat([{ role: 'user', content: 'x' }], {});
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'llm-chat-failed');
});

test('web release 为 no-op 不报错', () => {
  const bridge = createLlmBridge({ env: {}, nativeApi: {}, windowObj: {}, ollama: fakeOllama() });
  assert.doesNotThrow(() => bridge.release());
});

test('native init 后 chat 不重复 initLlama', async () => {
  const api = fakeNativeApi();
  const bridge = createLlmBridge({ env: nativeEnv, nativeApi: api, windowObj: {}, ollama: fakeOllama() });
  await bridge.init({ model: 'qwen3-1.7b.gguf' });
  await bridge.chat([{ role: 'user', content: 'again' }], { model: 'qwen3-1.7b.gguf' });
  const inits = api._log.filter(([k]) => k === 'initLlama');
  assert.equal(inits.length, 1);
});
