import test from 'node:test';
import assert from 'node:assert/strict';
import { computeEngineStatus, isReady, STATUS_OK, STATUS_ERROR, STATUS_PENDING } from '../src/lib/engine-status.js';

test('native 全就绪 → 三灯 ok', () => {
  const s = computeEngineStatus({
    engine: 'native',
    companionInit: { ok: true },
    voiceInit: { asrReady: true, ttsReady: true },
  });
  assert.equal(s.asr, STATUS_OK);
  assert.equal(s.tts, STATUS_OK);
  assert.equal(s.llm, STATUS_OK);
  assert.equal(s.overall, STATUS_OK);
  assert.equal(isReady(s), true);
});

test('native 未 init → pending', () => {
  const s = computeEngineStatus({ engine: 'native' });
  assert.equal(s.asr, STATUS_PENDING);
  assert.equal(s.llm, STATUS_ERROR); // companion 无 ok → error
  assert.equal(isReady(s), false);
});

test('native ASR 失败带 reason', () => {
  const s = computeEngineStatus({
    engine: 'native',
    companionInit: { ok: true },
    voiceInit: { asrReady: false, ttsReady: true, reason: 'asr-init-failed' },
  });
  assert.equal(s.asr, STATUS_ERROR);
  assert.ok(s.details.some(d => d.part === 'asr' && d.reason === 'asr-init-failed'));
  assert.equal(s.overall, STATUS_ERROR);
});

test('web 全可用 → 三灯 ok', () => {
  const s = computeEngineStatus({ engine: 'web', webSpeechOk: true, ollamaOk: true });
  assert.equal(s.asr, STATUS_OK);
  assert.equal(s.tts, STATUS_OK);
  assert.equal(s.llm, STATUS_OK);
  assert.equal(isReady(s), true);
});

test('web Ollama 挂 → llm error + reason network', () => {
  const s = computeEngineStatus({ engine: 'web', webSpeechOk: true, ollamaOk: false });
  assert.equal(s.llm, STATUS_ERROR);
  assert.ok(s.details.some(d => d.part === 'llm' && d.reason === 'network'));
  assert.equal(isReady(s), false);
});

test('web 无 Web Speech → asr+tts error', () => {
  const s = computeEngineStatus({ engine: 'web', webSpeechOk: false, ollamaOk: true });
  assert.equal(s.asr, STATUS_ERROR);
  assert.equal(s.tts, STATUS_ERROR);
});