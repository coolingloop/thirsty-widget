'use strict';
const fs=require('node:fs'),path=require('node:path');
const {parseLine}=require('./parsers');
async function filesIn(root,source,since=0){let result=[];try{const entries=await fs.promises.readdir(root,{withFileTypes:true});for(const e of entries){const p=path.join(root,e.name);if(e.isDirectory())result.push(...await filesIn(p,source,since));else if(e.isFile() && e.name.endsWith('.jsonl') && (source!=='codex'||e.name.startsWith('rollout-'))){const s=await fs.promises.stat(p);if(s.mtimeMs>=since)result.push({path:p,source,size:s.size,mtime:s.mtimeMs});}}}catch(e){if(!['ENOENT','ENOTDIR'].includes(e.code))throw e;}return result;}
async function tailFile(file,state,onEvent,{since=0}={}){
 const s=await fs.promises.stat(file.path);let offset=state.offset||0;
 if(s.size<offset || state.birth && state.birth!==s.birthtimeMs){offset=0;state.parser={};}
 state.birth=s.birthtimeMs;state.parser ||= {};
 if(s.size===offset)return 0;
 const handle=await fs.promises.open(file.path,'r');let carry=Buffer.alloc(0),read=0,committed=offset;
 try{
  const buffer=Buffer.allocUnsafe(256*1024);
  while(offset<s.size){const {bytesRead}=await handle.read(buffer,0,Math.min(buffer.length,s.size-offset),offset);if(!bytesRead)break;offset+=bytesRead;read+=bytesRead;
   let joined=carry.length?Buffer.concat([carry,buffer.subarray(0,bytesRead)]):buffer.subarray(0,bytesRead);let start=0,idx;
   while((idx=joined.indexOf(10,start))!==-1){const line=joined.subarray(start,idx).toString('utf8');const event=parseLine(line,file.source,file.path,state.parser);if(event && Date.parse(event.ts)>=since)onEvent(event);committed+=idx-start+1;start=idx+1;}
   carry=Buffer.from(joined.subarray(start));
  }
 }finally{await handle.close();}
 // Offset stops BEFORE a partial last line. No prompt text is persisted.
 state.offset=committed;state.mtime=s.mtimeMs;return read;
}
module.exports={filesIn,tailFile};
