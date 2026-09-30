'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {filesIn}=require('../engine/tailer'),{Collectors}=require('../engine/collectors'),{day,shiftDay,totals}=require('../engine/store'),{temp}=require('./helpers');
async function run(){const claudeDir=path.join(os.homedir(),'.claude/projects'),codexDir=path.join(os.homedir(),'.codex/sessions'),since=Date.now()-30*86400000;
 const files=[...await filesIn(claudeDir,'claude',since),...await filesIn(codexDir,'codex',since)];
 // Use closed, old files so concurrent live model writes cannot confound this audit.
 const candidates=files.filter(f=>f.mtime<Date.now()-3600000).sort((a,b)=>a.mtime-b.mtime);const picked=[...candidates.filter(f=>f.source==='claude').slice(0,10),...candidates.filter(f=>f.source==='codex').slice(0,10)];assert.equal(picked.length,20);
 const before=picked.map(f=>{const s=fs.statSync(f.path);return {file:f.path,size:s.size,mtimeMs:s.mtimeMs};});
 const dataDir=temp('real'),c=new Collectors({claudeDir,codexDir,dataDir});c.on('progress',p=>{if(p.done%100===0||p.done===p.total)console.log(`Backfill ${p.done}/${p.total}, ${p.bytes} bytes`);});c.on('error',e=>{throw e;});const result=await c.start();await c.stop();
 const after=before.map(f=>{const s=fs.statSync(f.file);return {file:f.file,size:s.size,mtimeMs:s.mtimeMs};});assert.deepEqual(after,before);
 const days=[];for(let i=0;i<=7;i++){const date=shiftDay(-i);for(const source of ['claude','codex'])days.push({day:date,source,...totals({s:c.store.state.days[date]?.[source]})});}
 const evidence={...result,dataDir,claudeDir,codexDir,days,audit:{files:20,unchanged:true,before,after}};fs.writeFileSync(path.join(__dirname,'backfill-results.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify({item:2,files:result.files,bytes:result.bytes,seconds:result.ms/1000,unchanged:20,days},null,2));return evidence;
}
if(require.main===module)run().catch(e=>{console.error(e);process.exitCode=1;});module.exports=run;
