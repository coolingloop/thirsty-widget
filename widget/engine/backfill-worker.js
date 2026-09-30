'use strict';
const {parentPort,workerData}=require('node:worker_threads');
const {Store,load,atomic}=require('./store');const {filesIn,tailFile}=require('./tailer');const path=require('node:path');
(async()=>{
 const store=new Store(workerData.dataDir), offsets=load(path.join(workerData.dataDir,'offsets.json'),{}),since=Date.now()-30*86400000,start=performance.now();let bytes=0,n=0;
 const files=[...await filesIn(workerData.claudeDir,'claude',since),...await filesIn(workerData.codexDir,'codex',since)];
 for(const f of files){const state=offsets[f.path] ||= {};bytes+=await tailFile(f,state,e=>store.add(e,{backfill:true}),{since});n++;if(n%10===0 || n===files.length)parentPort.postMessage({type:'progress',done:n,total:files.length,bytes});}
 store.personalizeRation();store.checkBadges(Date.now(),true);store.save();atomic(path.join(workerData.dataDir,'offsets.json'),offsets);
 parentPort.postMessage({type:'done',files:files.length,bytes,ms:performance.now()-start});
})().catch(e=>{parentPort.postMessage({type:'error',message:e.stack});process.exitCode=1;});
