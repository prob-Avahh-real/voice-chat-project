import test from 'node:test';
import assert from 'node:assert/strict';
import { buildQwen3Prompt } from '../src/lib/qwen3-prompt.js';

test('buildQwen3Prompt 基础：system+user+generation prompt', () => {
  const prompt = buildQwen3Prompt(
    [
      { role: 'system', content: '你是小满。' },
      { role: 'user', content: '你好' },
    ],
    { thinking: false },
  );
  assert.match(prompt, /<\|im_start\|>system\n你是小满。<\|im_end\|>\n/);
  assert.match(prompt, /<\|im_start\|>user\n你好<\|im_end\|>\n/);
assert.match(prompt, /<\|im_start\|>assistant\n<think>\n\n<\/think>\n\n$/);
  assert.equal((prompt.match(/<think>/g) || []).length, 1);
  assert.equal((prompt.match(/<\/think>/g) || []).length, 1);
});

test('buildQwen3Prompt 思考开启时不注入关闭标记', () => {
  const prompt = buildQwen3Prompt(
    [{ role: 'user', content: 'x' }],
    { thinking: true },
  );
  assert.match(prompt, /<\|im_start\|>assistant\n$/);
  assert.doesNotMatch(prompt, /<think>/);
});

test('buildQwen3Prompt 历史 assistant 轮次完整保留', () => {
  const prompt = buildQwen3Prompt(
    [
      { role: 'user', content: 'u1' },
      { role: 'assistant', content: 'a1' },
      { role: 'user', content: 'u2' },
    ],
    { thinking: false },
  );
  assert.match(prompt, /<\|im_start\|>assistant\na1<\|im_end\|>\n/);
  assert.equal((prompt.match(/<\|im_start\|>/g) || []).length, 4);
});

test('buildQwen3Prompt 过滤非法角色与空内容', () => {
  const prompt = buildQwen3Prompt(
    [
      { role: 'tool', content: 'noise' },
      { role: 'user', content: 'ok' },
      null,
      { role: 'assistant', content: '' },
    ],
    { thinking: false },
  );
  assert.doesNotMatch(prompt, /noise/);
  assert.match(prompt, /user\nok<\|im_end\|>/);
});

test('buildQwen3Prompt addGenerationPrompt=false 不加 assistant 头', () => {
  const prompt = buildQwen3Prompt([{ role: 'user', content: 'u' }], { thinking: false, addGenerationPrompt: false });
  assert.doesNotMatch(prompt, /assistant/);
});

test('buildQwen3Prompt 与官方模板思维关闭格式一致', () => {
  const prompt = buildQwen3Prompt(
    [{ role: 'user', content: 'hello' }],
    { thinking: false },
  );
  assert.equal(
    prompt,
    '<|im_start|>user\nhello<|im_end|>\n<|im_start|>assistant\n<think>\n\n</think>\n\n',
  );
});


