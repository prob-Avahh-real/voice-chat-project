import { execSync } from 'node:child_process';
import WebSocket from 'ws';
const ADB='/opt/homebrew/share/android-commandlinetools/platform-tools/adb';
const PID=execSync(`${ADB} shell "pidof com.skat.voicechat"`).toString().trim();
execSync(`${ADB} forward tcp:9222 localabstract:webview_devtools_remote_${PID}`);
const list=JSON.parse(execSync('curl -s http://localhost:9222/json').toString());
const page=list.find(t=>t.type==='page')||list[0];
const ws=new WebSocket(page.webSocketDebuggerUrl,[],{headers:{Upgrade:'websocket'}});
let id=0;const pending=new Map();
ws.on('message',b=>{const m=JSON.parse(b.toString());if(m.id&&pending.has(m.id)){const{resolve,reject}=pending.get(m.id);pending.delete(m.id);if(m.error)reject(new Error(JSON.stringify(m.error)));else resolve(m.result);}});
function send(method,params={}){return new Promise((resolve,reject)=>{const mid=++id;pending.set(mid,{resolve,reject});ws.send(JSON.stringify({id:mid,method,params}));});}
function sleep(ms){return new Promise(r=>setTimeout(r,ms));}
async function evalJs(expr){const r=await send('Runtime.evaluate',{expression:expr,awaitPromise:true,returnByValue:true});return r.result?.value ?? {__err:r.exceptionDetails?.text};}

await new Promise(res=>ws.on('open',res));
await send('Runtime.enable');

console.log('=== GLOBAL STATE ===');
console.log(JSON.stringify(await evalJs(`(function(){
  return {
    capNative: !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()),
    voiceBridge: !!window.voiceBridge,
    companion: !!window.companion,
    xmUi: !!window.xmUi,
    micBtn: !!document.getElementById('micButton'),
    scBtn: !!document.getElementById('selfCheckBtn'),
    readyEls: !!document.getElementById('bridgeReady')
  };
})()`), null, 1));

console.log('=== CHECK LISTENER BOUND (patch click) ===');
console.log(JSON.stringify(await evalJs(`(async function(){
  const b=document.getElementById('micButton');
  // count listeners by wrapping
  let calls=0;
  const origAdd=b.addEventListener.bind(b);
  // we can't easily count existing; instead inspect isRecording flag via behavior
  // Try dispatching and see if any handler runs by checking whether statusLine changes
  const st0=document.getElementById('statusText').textContent;
  b.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,view:window}));
  await new Promise(r=>setTimeout(r,600));
  const st1=document.getElementById('statusText').textContent;
  const cls=document.getElementById('statusLine').className;
  return {st0, st1, cls, btnClass:b.className};
})()`), null, 1));

console.log('=== READ INTERNAL VARIABLES VIA CLOSURE HOOK ===');
// Try to access closure vars by evaluating in page context using Function that reaches into module scope isn't possible; use UI-visible probes instead.
console.log(JSON.stringify(await evalJs(`(function(){
  const st=document.getElementById('statusText').textContent;
  const sl=document.getElementById('statusLine').className;
  const b=document.getElementById('micButton');
  const unsup=document.getElementById('unsupported');
  return {status:st, cls:sl, btnClass:b.className, unsupportedVisible: unsup?getComputedStyle(unsup).display!=='none':null,
          micParentDisplay: getComputedStyle(b.parentElement).display};
})()`), null, 1));

console.log('=== SELF-CHECK BUTTON ENABLED? ===');
console.log(JSON.stringify(await evalJs(`(function(){
  const sc=document.getElementById('selfCheckBtn');
  return sc?{disabled:sc.disabled, text:sc.textContent}:null;
})()`)));

// grab logcat without -s filter, search console errors
await execSync(`${ADB} logcat -c`);
await evalJs(`document.getElementById('micButton').click()`);
await sleep(2000);
console.log('=== LOGCAT FULL (last 100) ===');
try { console.log(execSync(`${ADB} logcat -d 2>/dev/null | tail -100`).toString()); } catch(e) { console.log('empty'); }

ws.close();
setTimeout(()=>process.exit(0),300);
