'use strict';
const http=require('node:http');const path=require('node:path');const fs=require('node:fs');const {SOURCES}=require('./store');
async function startAPI(getStore,dataDir,{port=47821,openDashboard=()=>{},progress=()=>null}={}){
 const server=http.createServer(async(req,res)=>{
  const origin=req.headers.origin || '',extension=/^chrome-extension:\/\/[a-z0-9-]+$/i.test(origin),store=getStore();
  let siteOrigin='';try{siteOrigin=new URL(store?.settings.siteUrl).origin;}catch{}
  const allowed=extension || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin) || origin && origin===siteOrigin;
  if(allowed){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');res.setHeader('Access-Control-Allow-Headers','Content-Type');res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');res.setHeader('Access-Control-Allow-Private-Network','true');}
  res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');
  const send=(code,value)=>{res.writeHead(code);res.end(JSON.stringify(value));};
  if(req.method==='OPTIONS')return send(allowed?204:403,{});
  const url=new URL(req.url,'http://127.0.0.1');
  if(req.method==='GET' && url.pathname==='/health')return send(200,{ok:true,ready:!!store,progress:progress()});
  if(req.method==='GET' && url.pathname==='/stats'){if(origin&&!allowed)return send(403,{error:'Origin not allowed'});if(!store)return send(503,{error:'Backfill in progress'});if(extension){store.state.extensionLastSeen=Date.now();store.dirty=true;store.scheduleSave();}return send(200,store.snapshot());}
  if(req.method==='POST' && ['/event','/dashboard'].includes(url.pathname)){
   if(!extension)return send(403,{error:'chrome-extension:// origin required'});
   if(!store)return send(503,{error:'Backfill in progress'});
   store.state.extensionLastSeen=Date.now();store.dirty=true;store.scheduleSave();
   if(url.pathname==='/dashboard'){openDashboard();return send(200,{ok:true});}
   let body='';try{for await(const chunk of req){body+=chunk;if(body.length>8192)return send(413,{error:'Body too large'});}const e=JSON.parse(body);const source='web:'+e.site;if(e.source!=='web' && e.source!==source || !SOURCES[source] || !['prompt','sip'].includes(e.kind) || typeof e.id!=='string' || e.id.length>200 || !Number.isFinite(Date.parse(e.ts)))return send(400,{error:'Invalid event'});
    const accepted=store.add({...e,source,id:'web:'+e.id});return send(200,{ok:true,deduped:!accepted});
   }catch{return send(400,{error:'Invalid JSON'});}
  }
  send(404,{error:'Not found'});
 });
 while(true){try{await new Promise((resolve,reject)=>{const failed=e=>{server.removeListener('listening',resolve);reject(e);};server.once('error',failed);server.once('listening',()=>{server.removeListener('error',failed);resolve();});server.listen(port,'127.0.0.1');});break;}catch(e){if(e.code!=='EADDRINUSE' || port>=47841)throw e;port++;}}
 fs.mkdirSync(dataDir,{recursive:true});fs.writeFileSync(path.join(dataDir,'port'),String(port));return {server,port,close:()=>new Promise(resolve=>server.close(resolve))};
}
module.exports={startAPI};
