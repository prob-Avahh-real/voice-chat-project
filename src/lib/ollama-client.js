export const DEFAULT_OLLAMA_HOST = 'http://localhost:11434';

export function buildChatPayload(model, messages, options = {}) {
  return JSON.stringify({
    model,
    messages,
    stream: false,
    options: {
      temperature: options.temperature ?? 0.7,
      num_predict: options.numPredict ?? 256,
    },
  });
}

export async function chat({ model, messages, host, timeoutMs, fetchImpl, options }) {
  const base = host || DEFAULT_OLLAMA_HOST;
  const fetcher = fetchImpl || globalThis.fetch;
  if (!fetcher) {
    return { ok: false, reason: 'no-fetch-impl' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs || 30000);
  let res;
  try {
    res = await fetcher(base + '/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: buildChatPayload(model, messages, options),
      signal: controller.signal,
    });
  } catch (err) {
    return { ok: false, reason: err?.name === 'AbortError' ? 'timeout' : 'network', detail: String(err?.message || err) };
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    return { ok: false, reason: 'http-' + res.status, detail: await res.text().catch(() => '') };
  }

  let data;
  try {
    data = await res.json();
  } catch (err) {
    return { ok: false, reason: 'bad-json', detail: String(err?.message || err) };
  }

  const text = data?.message?.content;
  if (typeof text !== 'string' || !text.trim()) {
    return { ok: false, reason: 'empty-response', detail: JSON.stringify(data).slice(0, 200) };
  }
  return { ok: true, text, raw: data };
}
