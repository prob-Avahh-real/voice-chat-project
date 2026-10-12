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
async function evalJs(expr){const r=await send('Runtime.evaluate',{expression:expr,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails));return r.result.value;}
const status=async()=>evalJs(`(function(){const s=document.getElementById('status');const b=document.getElementById('micButton');return {status:s?s.textContent:null, btnClass:b?b.className:null};})()`);

await new Promise(res=>ws.on('open',res));
await send('Runtime.enable');
await execSync(`${ADB} logcat -c`);
console.log('BEFORE:', JSON.stringify(await status()));
await evalJs(`document.getElementById('micButton').click()`);
await sleep(3500);
console.log('AFTER 3.5s:', JSON.stringify(await status()));
// stop it
await evalJs(`document.getElementById('micButton').click()`);
await sleep(500);
console.log('AFTER stop:', JSON.stringify(await status()));
ws.close();
setTimeout(()=>process.exit(0),300);
