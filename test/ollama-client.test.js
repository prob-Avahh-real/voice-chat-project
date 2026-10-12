import test from 'node:test';
import assert from 'node:assert/strict';
import { chat, buildChatPayload, DEFAULT_OLLAMA_HOST } from '../src/lib/ollama-client.js';

test('buildChatPayload 结构正确', () => {
  const payload = JSON.parse(buildChatPayload('m', [{ role: 'user', content: 'hi' }], { temperature: 0.2 }));
  assert.equal(payload.model, 'm');
  assert.equal(payload.stream, false);
  assert.equal(payload.options.temperature, 0.2);
  assert.equal(payload.messages[0].role, 'user');
});

test('chat 成功返回 ok:text', async () => {
  const fetchImpl = async () => ({
    ok: true,
    json: async () => ({ message: { content: '你好' } }),
  });
  const r = await chat({ model: 'm', messages: [], fetchImpl });
  assert.deepEqual(r.ok, true);
  assert.equal(r.text, '你好');
});

test('chat 空响应返回 empty-response 理由', async () => {
  const fetchImpl = async () => ({ ok: true, json: async () => ({ message: { content: '  ' } }) });
  const r = await chat({ model: 'm', messages: [], fetchImpl });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'empty-response');
  assert.ok(r.detail);
});

test('chat HTTP 错误返回 http-<code>', async () => {
  const fetchImpl = async () => ({ ok: false, status: 404, text: async () => 'not found' });
  const r = await chat({ model: 'm', messages: [], fetchImpl });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'http-404');
});

test('chat 无 fetch 实现返回 no-fetch-impl', async () => {
  const saved = globalThis.fetch;
  try {
    globalThis.fetch = undefined;
    const r = await chat({ model: 'm', messages: [], fetchImpl: null });
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'no-fetch-impl');
  } finally {
    globalThis.fetch = saved;
  }
});

test('chat 超时返回 timeout', async () => {
  const fetchImpl = (_url, { signal }) =>
    new Promise((_, reject) => {
      signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    });
  const r = await chat({ model: 'm', messages: [], fetchImpl, timeoutMs: 50 });
  assert.equal(r.reason, 'timeout');
});