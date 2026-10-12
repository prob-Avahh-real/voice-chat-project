import test from 'node:test';
import assert from 'node:assert/strict';
import { detectCrisis, buildCrisisResponse, classify, transform, buildMessages } from '../src/lib/companion-core.js';

test('detectCrisis 命中关键词', () => {
  assert.equal(detectCrisis('我觉得活着没意思'), true);
  assert.equal(detectCrisis('今天吃了好吃的'), false);
});

test('classify 区分 crisis/normal', () => {
  assert.equal(classify({ text: '我想死' }).kind, 'crisis');
  assert.equal(classify({ text: '今天天气不错' }).kind, 'normal');
});

test('transform 危机短路 bypassLLM 且返回固定话术', () => {
  const t = transform(classify({ text: '我撑不住了' }), { text: '我撑不住了' });
  assert.equal(t.bypassLLM, true);
  assert.equal(t.kind, 'crisis');
  assert.equal(t.text, buildCrisisResponse());
});

test('transform 正常消息不 bypass', () => {
  const t = transform(classify({ text: '午饭吃啥' }), { text: '午饭吃啥' });
  assert.equal(t.bypassLLM, false);
  assert.equal(t.text, '午饭吃啥');
});

test('buildMessages 组装 system + 历史 + 当前', () => {
  const msgs = buildMessages('SYS', [
    { role: 'user', content: 'a' },
    { role: 'assistant', content: 'b' },
  ], 'c');
  assert.equal(msgs.length, 4);
  assert.equal(msgs[0].role, 'system');
  assert.equal(msgs[3].content, 'c');
});

test('buildCrisisResponse 含固定两个要点', () => {
  const r = buildCrisisResponse();
  assert.ok(r.includes('我在这儿'));
  assert.ok(r.includes('专业人员'));
});