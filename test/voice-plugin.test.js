import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const proj = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const apk = path.join(proj, 'android/app/build/outputs/apk/debug/app-debug.apk');

test('debug APK 已构建', () => {
  assert.ok(fs.existsSync(apk), 'missing app-debug.apk — run: npm run apk:debug');
  const size = fs.statSync(apk).size;
  assert.ok(size > 10 * 1024 * 1024, 'APK 应含 sherpa .so + 模型（>10MB），实际 ' + size);
});

test('APK 内含 sherpa-onnx 原生库（arm64）', () => {
  const list = execUnzipList();
  const libs = list.filter(l => l.endsWith('.so'));
  assert.ok(libs.some(l => l.includes('sherpa-onnx-jni')), '缺 sherpa-onnx-jni.so');
  assert.ok(libs.some(l => l.includes('onnxruntime')), '缺 onnxruntime.so');
  assert.ok(libs.some(l => l.includes('arm64-v8a')), '缺 arm64-v8a ABI');
});

test('APK 内含 ASR + TTS 模型资产', () => {
  const list = execUnzipList();
  assert.ok(list.some(l => l.includes('models/asr/zipformer/encoder')), '缺 ASR encoder');
  assert.ok(list.some(l => l.includes('models/tts/piper/zh_CN')), '缺 TTS onnx');
  assert.ok(list.some(l => l.includes('models/tts/piper/phone.fst')), '缺 TTS rule fst');
});

test('Voice 插件 Java 源码存在且用 setter 风格（无 builder）', () => {
  const src = path.join(proj, 'android/app/src/main/java/com/skat/voicechat/plugins/VoicePlugin.java');
  assert.ok(fs.existsSync(src), 'missing VoicePlugin.java');
  const code = fs.readFileSync(src, 'utf8');
  assert.ok(!code.includes('ModelConfig.builder()'), '不应再用 builder()（v1.13.5 AAR 是 Kotlin setter API）');
  assert.ok(code.includes('setEncoder'), '应使用 setEncoder setter');
});

test('voice-bridge 支持原生与 web 双引擎', () => {
  const src = path.join(proj, 'src/voice-bridge.js');
  const lib = path.join(proj, 'src/lib/voice-engines.js');
  assert.ok(fs.existsSync(src));
  assert.ok(fs.existsSync(lib), '缺 src/lib/voice-engines.js');
  const code = fs.readFileSync(src, 'utf8');
  const libCode = fs.readFileSync(lib, 'utf8');
  assert.ok(code.includes('createVoiceBridge'), 'voice-bridge 应组装统一桥');
  assert.ok(libCode.includes("engine = isNative() ? 'native' : 'web'"), 'lib 应做双引擎分流');
});

import { execSync } from 'node:child_process';

function execUnzipList() {
  const out = execSync(`unzip -Z1 "${apk}"`, { maxBuffer: 10 * 1024 * 1024 });
  return out.toString().split('\n');
}
