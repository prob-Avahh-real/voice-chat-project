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
async function evalJs(expr){const r=await send('Runtime.evaluate',{expression:expr,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails));return r.result.value;}
await new Promise(res=>ws.on('open',res));
await send('Runtime.enable');
const out=await evalJs(`(function(){
  const v=window.XiaoManVoice||{};
  return {
    engine: v.engine,
    supported: v.supported,
    hasCapacitor: !!window.Capacitor,
    isNativePlatform: !!(window.Capacitor&&window.Capacitor.isNativePlatform&&window.Capacitor.isNativePlatform()),
    startASRtype: typeof v.startASR,
    hasAddListener: !!(v.startASR && true)
  };
})()`);
console.log(JSON.stringify(out,null,2));
ws.close();process.exit(0);
