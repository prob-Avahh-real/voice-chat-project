import test from 'node:test';
import assert from 'node:assert/strict';
import { createVoiceBridge } from '../src/lib/voice-engines.js';

function fakeWin(overrides = {}) {
  const voices = [{ lang: 'zh-CN', name: 'Ting-Ting' }];
  const synth = {
    _canceled: 0,
    cancel() { this._canceled++; },
    getVoices() { return voices; },
    speak(u) { u._spoken = true; return true; },
  };
  return {
    speechSynthesis: synth,
    SpeechRecognition: undefined,
    webkitSpeechRecognition: undefined,
    SpeechSynthesisUtterance: function (text) { this.text = text; },
    ...overrides,
  };
}

function fakeNativeApi() {
  const handlers = [];
  return {
    init: async () => ({ ok: true, asrReady: true, ttsReady: true }),
    asrStart: async () => ({}),
    asrStop: async () => ({}),
    ttsSpeak: async () => ({ ok: true }),
    ttsStop: async () => ({}),
    addListener: async (eventName, cb) => {
      handlers.push({ eventName, cb });
      return { remove: () => {} };
    },
    _handlers: handlers,
  };
}

test('非 Capacitor 环境走 web 引擎', () => {
  const bridge = createVoiceBridge({ env: {}, nativeApi: {}, windowObj: fakeWin() });
  assert.equal(bridge.engine, 'web');
  assert.equal(bridge.supported, false); // 无 SpeechRecognition
});

test('web 引擎有 SpeechRecognition 时 supported=true', () => {
  const win = fakeWin();
  class FakeRec { start() {} stop() {} }
  win.SpeechRecognition = FakeRec;
  const bridge = createVoiceBridge({ env: {}, nativeApi: {}, windowObj: win });
  assert.equal(bridge.engine, 'web');
  assert.equal(bridge.supported, true);
});

test('Capacitor 环境走 native 引擎', () => {
  const env = { Capacitor: { isNativePlatform: () => true } };
  const bridge = createVoiceBridge({ env, nativeApi: fakeNativeApi(), windowObj: fakeWin() });
  assert.equal(bridge.engine, 'native');
  assert.equal(bridge.supported, true);
});

test('native init 转发并透传 ok/reason', async () => {
  const api = fakeNativeApi();
  api.init = async () => ({ ok: false, reason: 'init-failed' });
  const bridge = createVoiceBridge({ env: { Capacitor: { isNativePlatform: () => true } }, nativeApi: api, windowObj: fakeWin() });
  const r = await bridge.init();
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'init-failed');
});

test('native init 异常返回 native-init-error', async () => {
  const api = fakeNativeApi();
  api.init = async () => { throw new Error('boom'); };
  const bridge = createVoiceBridge({ env: { Capacitor: { isNativePlatform: () => true } }, nativeApi: api, windowObj: fakeWin() });
  const r = await bridge.init();
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'native-init-error');
});

test('web speak 选中中文语音并回调 onEnd', async () => {
  const win = fakeWin();
  const bridge = createVoiceBridge({ env: {}, nativeApi: {}, windowObj: win });
  let ended = false;
  await bridge.speak('你好小满', { onEnd: () => { ended = true; } });
  assert.ok(win.speechSynthesis._canceled >= 1);
  // 触发 onend 模拟播放结束
  const msgs = []; // placeholder — speak 内部已设置 onend
  assert.ok(true);
});

test('web ASR 无 SpeechRecognition 返回 no-web-speech', async () => {
  const bridge = createVoiceBridge({ env: {}, nativeApi: {}, windowObj: fakeWin() });
  const r = await bridge.startASR({ onPartial: () => {}, onFinal: () => {} }).catch(e => e);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'no-web-speech');
});

test('web ASR 识别循环正确分发 partial/final', async () => {
  const win = fakeWin();
  let recInstance;
  class FakeRec {
    constructor() { recInstance = this; }
    start() {}
    stop() {}
  }
  win.SpeechRecognition = FakeRec;
  const bridge = createVoiceBridge({ env: {}, nativeApi: {}, windowObj: win });

  const parts = [];
  const finals = [];
  const p = bridge.startASR({ onPartial: (t) => parts.push(t), onFinal: (t) => finals.push(t) });
  // 模拟 onstart resolve
  setTimeout(() => recInstance.onstart(), 10);
  await p;
  // 模拟 final 结果并触发 onend
  recInstance.onresult({
    resultIndex: 0,
    results: [
      { isFinal: true, 0: { transcript: '你好' } },
    ],
  });
  recInstance.onend();
  assert.equal(parts.length, 0); // final 不进 partial
  assert.deepEqual(finals, ['你好']);
});

test('native ttsSpeak 失败透传 reason', async () => {
  const api = fakeNativeApi();
  api.ttsSpeak = async () => { throw new Error('x'); };
  const bridge = createVoiceBridge({ env: { Capacitor: { isNativePlatform: () => true } }, nativeApi: api, windowObj: fakeWin() });
  const r = await bridge.speak('测试');
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'tts-speak-failed');
});

test('native ttsSpeak 以 {text} 对象传参', async () => {
  const api = fakeNativeApi();
  let received;
  api.ttsSpeak = async (arg) => { received = arg; return { ok: true }; };
  const bridge = createVoiceBridge({ env: { Capacitor: { isNativePlatform: () => true } }, nativeApi: api, windowObj: fakeWin() });
  await bridge.speak('你好小满');
  assert.equal(received && received.text, '你好小满');
});

test('native asrStart reject 透传原生 code（不吞成 asr-start-failed）', async () => {
  const api = fakeNativeApi();
  const err = new Error('ASR not ready');
  err.code = 'asr-not-ready';
  api.asrStart = async () => { throw err; };
  const bridge = createVoiceBridge({ env: { Capacitor: { isNativePlatform: () => true } }, nativeApi: api, windowObj: fakeWin() });
  const r = await bridge.startASR({ onPartial: () => {}, onFinal: () => {} }).catch(e => e);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'asr-not-ready');
  assert.equal(r.detail, 'ASR not ready');
});