'use strict';
const fs=require('node:fs'),path=require('node:path');const {_electron}=require('playwright');
const root=path.resolve(__dirname,'..'),dataRoot=path.join(root,'.testdata');fs.mkdirSync(dataRoot,{recursive:true});
const temp=name=>fs.mkdtempSync(path.join(dataRoot,name+'-'));
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(fn,timeout=10000){const start=Date.now();let last;while(Date.now()-start<timeout){try{last=await fn();if(last)return last;}catch(e){last=e;}await sleep(100);}throw new Error('Timed out: '+String(last));}
async function launch({dataDir=temp('app'),claudeDir,codexDir,port=47821,scale=1}={}){
 const env={...process.env,THIRSTY_TEST_MODE:'1',THIRSTY_DATA_DIR:dataDir,THIRSTY_PICTURES_DIR:path.join(dataDir,'pictures'),THIRSTY_PORT:String(port)};delete env.ELECTRON_RUN_AS_NODE;if(claudeDir)env.THIRSTY_CLAUDE_DIR=claudeDir;if(codexDir)env.THIRSTY_CODEX_DIR=codexDir;
 const app=await _electron.launch({executablePath:path.join(root,'node_modules/electron/dist/electron.exe'),args:['--no-sandbox','--disable-gpu-sandbox','--force-device-scale-factor='+scale,root],env,timeout:30000});
 const errors=[];app.process().stderr.on('data',d=>errors.push(d.toString()));
 await until(()=>fs.existsSync(path.join(dataDir,'port')),15000);const usedPort=Number(fs.readFileSync(path.join(dataDir,'port'),'utf8')),url=`http://127.0.0.1:${usedPort}`;
 await until(async()=>{const h=await (await fetch(url+'/health')).json();return h.ready;},180000);
 return {app,dataDir,url,port:usedPort,errors,stats:async()=>{const r=await fetch(url+'/stats');if(!r.ok)throw new Error('Stats '+r.status);return r.json();},close:()=>app.close()};
}
module.exports={root,temp,sleep,until,launch};
