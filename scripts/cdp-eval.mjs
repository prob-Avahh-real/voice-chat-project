import { execSync } from 'node:child_process';
import WebSocket from 'ws';

const ADB = '/opt/homebrew/share/android-commandlinetools/platform-tools/adb';
const PID = execSync(`${ADB} shell pidof com.skat.voicechat`).toString().trim();
execSync(`${ADB} forward tcp:9222 localabstract:webview_devtools_remote_${PID}`);
const list = JSON.parse(execSync('curl -s http://localhost:9222/json').toString());
const page = list.find(t => t.type === 'page') || list[0];
const ws = new WebSocket(page.webSocketDebuggerUrl, [], { headers: { Upgrade: 'websocket' } });

setTimeout(() => { console.log('SCRIPT_TIMEOUT'); process.exit(2); }, 18000).unref();
let id = 0;
const pending = new Map();
ws.on('message', (b) => {
  const m = JSON.parse(b.toString());
  if (m.id && pending.has(m.id)) {
    const { resolve, reject } = pending.get(m.id);
    pending.delete(m.id);
    if (m.error) reject(new Error(JSON.stringify(m.error)));
    else resolve(m.result);
  }
});
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const mid = ++id;
    pending.set(mid, { resolve, reject });
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function evalJs(expr, awaitMs = 4000) {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
  return r.result.value;
}

async function main() {
  await new Promise(res => ws.on('open', res));
  await send('Runtime.enable');
  const what = process.argv[2] || 'asrStart';
  if (what === 'asrStart') {
    const out = await evalJs(`(async()=>{ try { const r = await window.XiaoManVoice.startASR({lang:'zh'}); return {ok:true, r}; } catch(e){ return {ok:false, err:String(e)} } })()`, 6000);
    console.log('asrStart =>', JSON.stringify(out));
  } else if (what === 'tts') {
    const out = await evalJs(`(async()=>{ try { const r = await window.XiaoManVoice.speak('你好，我是小满，很高兴见到你。'); return {ok:true, r}; } catch(e){ return {ok:false, err:String(e)} } })()`, 6000);
    console.log('ttsSpeak =>', JSON.stringify(out));
  } else if (what === 'asrStop') {
    const out = await evalJs(`(async()=>{ try { const r = await window.XiaoManVoice.stopASR(); return {ok:true, r}; } catch(e){ return {ok:false, err:String(e)} } })()`, 4000);
    console.log('asrStop =>', JSON.stringify(out));
  }
  await sleep(300);
  ws.close();
  process.exit(0);
}
main().catch(e => { console.error('ERR', e.message); process.exit(1); });
