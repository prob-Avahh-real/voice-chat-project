export const CRISIS_KEYWORDS = [
  '活不下去', '想死', '自杀', '自伤', '撑不住', '结束一切',
  '没有活着的意义', '活着没意思', '不想活了', '伤害自己',
];

export const CRISIS_RESPONSE = {
  first: '我在这儿，别一个人扛。',
  second: '如果你现在真的撑不住，我想陪你先找专业人员聊聊，好吗？',
};

export function detectCrisis(text) {
  if (!text || typeof text !== 'string') return false;
  return CRISIS_KEYWORDS.some((kw) => text.includes(kw));
}

export function buildCrisisResponse() {
  return `${CRISIS_RESPONSE.first}${CRISIS_RESPONSE.second}`;
}

export function classify(payload) {
  const { text } = payload;
  return {
    ok: true,
    kind: detectCrisis(text) ? 'crisis' : 'normal',
    reason: '',
  };
}

export function transform(classification, payload) {
  if (classification.kind === 'crisis') {
    return {
      ok: true,
      kind: 'crisis',
      text: buildCrisisResponse(),
      bypassLLM: true,
      reason: 'crisis-keyword',
    };
  }
  return { ok: true, kind: 'normal', text: payload.text, bypassLLM: false, reason: '' };
}

export function buildMessages(systemPrompt, history, userText) {
  const messages = [{ role: 'system', content: systemPrompt }];
  for (const h of history || []) {
    if (h.role === 'user' || h.role === 'assistant') {
      messages.push({ role: h.role, content: String(h.content) });
    }
  }
  messages.push({ role: 'user', content: userText });
  return messages;
}