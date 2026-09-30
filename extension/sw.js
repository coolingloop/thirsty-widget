'use strict';
let flushing=false,port=47821,serial=Promise.resolve();
const validSites=new Set(['claude','chatgpt','gemini','perplexity','copilot','grok','deepseek','mistral','aistudio']);
const base=()=>`http://127.0.0.1:${port}`;
async function request(route,options={}){const res=await fetch(base()+route,{...options,signal:AbortSignal.timeout(1000)});if(!res.ok)throw new Error('Widget '+res.status);return res.json();}
async function locate(){try{const h=await request('/health');if(h.ready)return true;}catch{}for(let p=47821;p<=47841;p++){if(p===port)continue;try{const res=await fetch(`http://127.0.0.1:${p}/health`,{signal:AbortSignal.timeout(150)}),h=await res.json();if(h.ok&&h.ready){port=p;await chrome.storage.local.set({port});return true;}}catch{}}return false;}
async function flush(){if(flushing)return;flushing=true;try{const stored=await chrome.storage.local.get(['queue','port']);port=stored.port||port;let queue=stored.queue||[];
 // Nothing queued: no probing, so a browser without the desktop pet stays quiet.
 if(!queue.length||!await locate())return;while(queue.length){await request('/event',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(queue[0])});queue.shift();await chrome.storage.local.set({queue});}await chrome.storage.local.set({lastConnected:Date.now()});}catch{}finally{flushing=false;}}
function enqueue(e){serial=serial.then(async()=>{const {queue=[]}=await chrome.storage.local.get('queue');if(!queue.some(q=>q.id===e.id)){queue.push(e);await chrome.storage.local.set({queue});}await flush();});return serial;}
chrome.runtime.onMessage.addListener((message,sender,respond)=>{
 const task=async()=>{if(message.type==='event'){
  const e=message.event;if(!validSites.has(e?.site)||e.kind!=='prompt'||typeof e.id!=='string')return {ok:false};
  // Only packaged content scripts on matching sites can enqueue a prompt.
  const host=sender.url?new URL(sender.url).hostname:'';const hosts={claude:['claude.ai'],chatgpt:['chatgpt.com'],gemini:['gemini.google.com'],perplexity:['perplexity.ai','www.perplexity.ai'],copilot:['copilot.microsoft.com'],grok:['grok.com'],deepseek:['chat.deepseek.com'],mistral:['chat.mistral.ai'],aistudio:['aistudio.google.com']};if(!hosts[e.site].includes(host))return {ok:false};await enqueue({source:'web',site:e.site,kind:'prompt',ts:e.ts,id:e.id});return {ok:true};
 }if(message.type==='ping'){serial=serial.then(flush);await serial;return {ok:true};}if(message.type==='stats'){serial=serial.then(flush);await serial;if(!await locate())return {connected:false};return {connected:true,stats:await request('/stats')};}if(message.type==='dashboard'){if(await locate())await request('/dashboard',{method:'POST'});return {ok:true};}return {ok:false};};
 task().then(respond,e=>respond({connected:false,error:e.message}));return true;
});
chrome.runtime.onStartup.addListener(()=>{serial=serial.then(flush);});chrome.runtime.onInstalled.addListener(()=>{serial=serial.then(flush);});
// While a chat is open content-script heartbeats wake MV3 after suspension.
setInterval(()=>{serial=serial.then(flush);},3000);
