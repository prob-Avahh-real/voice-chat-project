const IM_START = '<|im_start|>';
const IM_END = '<|im_end|>';

function roleTurn(role, content) {
  return `${IM_START}${role}\n${content}${IM_END}\n`;
}

export function buildQwen3Prompt(messages, opts = {}) {
  const thinking = opts.thinking !== false;
  const parts = [];
  for (const msg of messages || []) {
    if (!msg || typeof msg.content !== 'string') continue;
    if (msg.role === 'system' || msg.role === 'user') {
      parts.push(roleTurn(msg.role, msg.content));
    } else if (msg.role === 'assistant') {
      parts.push(roleTurn('assistant', msg.content));
    }
  }
  if (opts.addGenerationPrompt === false) {
    return parts.join('');
  }
let prompt = parts.join('');
  prompt += `${IM_START}assistant\n`;
  if (!thinking) {
    prompt += '<think>\n\n</think>\n\n';
  }
  return prompt;
}

export const CHAT_TEMPLATE_BUILDERS = Object.freeze({
  qwen3: buildQwen3Prompt,
  chatml: buildQwen3Prompt,
});
