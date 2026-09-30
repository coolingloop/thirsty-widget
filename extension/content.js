'use strict';
(()=>{
 const match=Object.entries(THIRSTY_SITES).find(([,s])=>[s.host,...s.aliases||[]].includes(location.hostname));if(!match)return;
 const [site,selectors]=match;let href=location.href,ignoreUntil=Date.now()+2000,seen=new WeakSet(),armed=[],pendingTimer,reply=null;
 function nodes(){return [...document.querySelectorAll(selectors.user)].filter(n=>!n.parentElement?.closest(selectors.user));}
 function baseline(){seen=new WeakSet(nodes());armed=[];ignoreUntil=Date.now()+2000;}
 function hash(text){let h=2166136261;for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,16777619);}return (h>>>0).toString(16);}
 // Sites decorate the sent bubble ("You said ...", screen-reader copies), so a hashed sample of the
 // composer text is looked for anywhere in the new node's text. Only hashes are kept, never the text.
 function norm(text){return text.replace(/[​-‍﻿]/g,'').replace(/\s+/g,' ').trim().toLowerCase();}
 function contains(text,entry){text=norm(text).slice(0,20000);for(let i=0;i+entry.length<=text.length;i++)if(hash(text.slice(i,i+entry.length))===entry.hash)return true;return false;}
 // Sizes for the water estimate, as character counts only: the conversation before the prompt
 // (context the model re-reads), the prompt, and how much the page grows while the answer streams.
 const CHARS_PER_TOKEN=4;
 function root(){return document.querySelector('main')||document.body;}
 function arm(){if(Date.now()<ignoreUntil)return;const composer=document.querySelector(selectors.composer);if(!composer)return;const raw=composer.value??composer.textContent??'',sample=norm(raw).slice(0,48);if(!sample)return;
  const inside=root().contains(composer),before=root().textContent.length;
  armed.push({at:Date.now(),hash:hash(sample),length:sample.length,prompt:raw.length,before,inside,context:Math.max(0,before-(inside?raw.length:0))});armed=armed.filter(e=>Date.now()-e.at<10000).slice(-5);}
 document.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.ctrlKey&&!e.altKey&&!e.metaKey&&!e.isComposing&&e.target.closest(selectors.composer))arm();},true);
 document.addEventListener('click',e=>{if(e.target.closest(selectors.send))arm();},true);
 // The sip lands when the answer is done: the page has stopped growing for 4 s. No growth at all
 // after 45 s (or 3 minutes in total) sends it anyway, and the widget assumes a typical answer.
 function finish(){if(!reply)return;const r=reply;reply=null;clearInterval(r.timer);
  const grown=Math.max(0,r.last-r.start-(r.inside?0:r.prompt));
  const event={source:'web',site,kind:'prompt',ts:r.ts,id:r.id,tokensIn:Math.round(r.prompt/CHARS_PER_TOKEN),tokensContext:Math.round(r.context/CHARS_PER_TOKEN)};
  if(r.grown)event.tokensOut=Math.max(1,Math.round(grown/CHARS_PER_TOKEN));
  chrome.runtime.sendMessage({type:'event',event}).catch(()=>{});}
 function watch(entry){finish();
  reply={id:crypto.randomUUID(),ts:new Date().toISOString(),prompt:entry.prompt,context:entry.context,inside:entry.inside,start:entry.before,last:entry.before,grown:false,still:0,began:Date.now()};
  reply.timer=setInterval(()=>{const r=reply;if(!r)return;const now=root().textContent.length;
   if(now>r.last){r.last=now;r.still=0;if(now-r.start-(r.inside?0:r.prompt)>20)r.grown=true;}else r.still++;
   const age=Date.now()-r.began;if(r.grown&&r.still>=4||!r.grown&&age>45000||age>180000)finish();},1000);}
 addEventListener('pagehide',finish);
 function scan(){if(location.href!==href){href=location.href;baseline();return;}const fresh=nodes().filter(n=>!seen.has(n));fresh.forEach(n=>seen.add(n));if(!fresh.length)return;if(Date.now()<ignoreUntil||fresh.length>=2){armed=[];return;}armed=armed.filter(e=>Date.now()-e.at<10000);const text=fresh[0].textContent||'',index=armed.findIndex(e=>contains(text,e));if(index<0)return;const [entry]=armed.splice(index,1);watch(entry);}
 const observer=new MutationObserver(()=>{clearTimeout(pendingTimer);pendingTimer=setTimeout(scan,60);});observer.observe(document.documentElement,{childList:true,subtree:true});baseline();setInterval(()=>{if(location.href!==href){href=location.href;baseline();}},500);setInterval(()=>chrome.runtime.sendMessage({type:'ping'}).catch(()=>{}),5000);
})();
