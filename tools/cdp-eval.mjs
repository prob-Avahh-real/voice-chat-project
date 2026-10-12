import WebSocket from 'ws';

const WS_URL = process.argv[2];
const EXPR = process.argv[3];

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

ws.on('open', async () => {
  try {
    await rpc('Runtime.enable');
    const res = await rpc('Runtime.evaluate', {
      expression: EXPR,
      awaitPromise: true,
      returnByValue: true,
      timeout: 120000,
    });
    if (res.exceptionDetails) {
      console.log('EXCEPTION:', JSON.stringify(res.exceptionDetails.exception?.description || res.exceptionDetails, null, 2));
    } else {
      console.log(JSON.stringify(res.result?.value, null, 2));
    }
  } catch (e) {
    console.log('RPC_ERROR:', e.message);
  } finally {
    ws.close();
    process.exit(0);
  }
});

ws.on('error', (e) => { console.log('WS_ERROR:', e.message); process.exit(1); });
setTimeout(() => { console.log("TIMEOUT", process.argv[4] || ""); process.exit(2); }, parseInt(process.argv[4] || "130000", 10));