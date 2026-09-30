'use strict';
(()=>{
 const match=Object.entries(THIRSTY_SITES).find(([,s])=>[s.host,...s.aliases||[]].includes(location.hostname));if(!match)return;
 const [site,selectors]=match;let href=location.href,ignoreUntil=Date.now()+2000,seen=new WeakSet(),armed=[],pendingTimer;
 function nodes(){return [...document.querySelectorAll(selectors.user)].filter(n=>!n.parentElement?.closest(selectors.user));}
 function baseline(){seen=new WeakSet(nodes());armed=[];ignoreUntil=Date.now()+2000;}
 function hash(text){let h=2166136261;for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,16777619);}return (h>>>0).toString(16);}
 // Sites decorate the sent bubble ("You said ...", screen-reader copies), so a hashed sample of the
 // composer text is looked for anywhere in the new node's text. Only hashes are kept, never the text.
 function norm(text){return text.replace(/[\u200b-\u200d\ufeff]/g,'').replace(/\s+/g,' ').trim().toLowerCase();}
 function contains(text,entry){text=norm(text).slice(0,20000);for(let i=0;i+entry.length<=text.length;i++)if(hash(text.slice(i,i+entry.length))===entry.hash)return true;return false;}
 function arm(){if(Date.now()<ignoreUntil)return;const composer=document.querySelector(selectors.composer);if(!composer)return;const sample=norm(composer.value??composer.textContent??'').slice(0,48);if(!sample)return;armed.push({at:Date.now(),hash:hash(sample),length:sample.length});armed=armed.filter(e=>Date.now()-e.at<10000).slice(-5);}
 document.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.ctrlKey&&!e.altKey&&!e.metaKey&&!e.isComposing&&e.target.closest(selectors.composer))arm();},true);
 document.addEventListener('click',e=>{if(e.target.closest(selectors.send))arm();},true);
 function scan(){if(location.href!==href){href=location.href;baseline();return;}const fresh=nodes().filter(n=>!seen.has(n));fresh.forEach(n=>seen.add(n));if(!fresh.length)return;if(Date.now()<ignoreUntil||fresh.length>=2){armed=[];return;}armed=armed.filter(e=>Date.now()-e.at<10000);const text=fresh[0].textContent||'',index=armed.findIndex(e=>contains(text,e));if(index<0)return;armed.splice(index,1);const event={source:'web',site,kind:'prompt',ts:new Date().toISOString(),id:crypto.randomUUID()};chrome.runtime.sendMessage({type:'event',event}).catch(()=>{});}
 const observer=new MutationObserver(()=>{clearTimeout(pendingTimer);pendingTimer=setTimeout(scan,60);});observer.observe(document.documentElement,{childList:true,subtree:true});baseline();setInterval(()=>{if(location.href!==href){href=location.href;baseline();}},500);setInterval(()=>chrome.runtime.sendMessage({type:'ping'}).catch(()=>{}),5000);
})();
