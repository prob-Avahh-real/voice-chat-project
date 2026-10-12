import test from 'node:test';
import assert from 'node:assert/strict';
import { reasonToMessage } from '../src/lib/ui-messages.js';

test('已知 reason 返回映射文案', () => {
  assert.match(reasonToMessage('network'), /ollama serve/);
  assert.match(reasonToMessage('http-404'), /ollama pull/);
  assert.match(reasonToMessage('empty-response'), /重试/);
  assert.match(reasonToMessage('asr-not-ready'), /未就绪/);
  assert.match(reasonToMessage('tts-not-ready'), /未就绪/);
  assert.match(reasonToMessage('llm-init-failed'), /加载失败/);
  assert.match(reasonToMessage('no-web-speech'), /Web Speech/);
  assert.match(reasonToMessage('mic-permission-denied'), /权限被拒绝/);
});

test('未知 reason 落回 unknown 文案', () => {
  const msg = reasonToMessage('weird-xyz');
  assert.match(msg, /重试/);
});

test('http-<n> 通配映射', () => {
  assert.match(reasonToMessage('http-503'), /HTTP 503/);
  assert.match(reasonToMessage('http-429'), /HTTP 429/);
});

test('空 reason 返回 unknown 文案', () => {
  assert.match(reasonToMessage(''), /重试/);
  assert.match(reasonToMessage(null), /重试/);
  assert.match(reasonToMessage(undefined), /重试/);
});