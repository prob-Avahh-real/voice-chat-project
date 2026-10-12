import WebSocket from 'ws';

const WS_URL = process.argv[2];
const POLL_MS = parseInt(process.argv[3] || '3000', 10);
const TOTAL_MS = parseInt(process.argv[4] || '120000', 10);

const ws = new WebSocket(WS_URL);
let id = 0;
const pending = new Map();

function rpc(method, params = {}) {
  return new Promise((resolve, reject) => {
    const mid = ++id;
    pending.set(mid, { resolve, reject });
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
}

ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(msg.error.message));
    else resolve(msg.result);
  }
});

function timeout(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

ws.on('open', async () => {
  try {
    await rpc('Runtime.enable');
    // fire an async ask, store result on window.__cr
    await rpc('Runtime.evaluate', {
      expression: `(() => {
        window.__cr = { __state: 'pending' };
        (async () => {
          const t0 = Date.now();
          try {
            const r = await window.companion.askCompanion('嗨，你最近好吗？');
            window.__cr = { __done: true, ok: r.ok, kind: r.kind, text: r.text, ms: Date.now() - t0, reason: r.reason };
          } catch (e) { window.__cr = { __done: true, err: String(e) }; }
        })();
      })()`,
    });
    const start = Date.now();
    let last = null;
    while (Date.now() - start < TOTAL_MS) {
      await timeout(POLL_MS);
      const res = await rpc('Runtime.evaluate', { expression: 'window.__cr', returnByValue: true });
      const v = res.result?.value;
      if (v && v.__done) { last = v; break; }
      last = v || last;
    }
    console.log(JSON.stringify(last || { __never: true, waitedMs: Date.now() - start }, null, 2));
  } catch (e) {
    console.log('RPC_ERROR:', e.message);
  } finally {
    ws.close();
    process.exit(0);
  }
});

ws.on('error', (e) => { console.log('WS_ERROR:', e.message); process.exit(1); });