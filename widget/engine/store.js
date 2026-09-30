'use strict';
const fs=require('node:fs'), path=require('node:path');
const {EventEmitter}=require('node:events');
const water=require('./water');
const SOURCES={claude:{label:'Claude Code',color:'#D97757'},codex:{label:'Codex',color:'#10A37F'},'web:claude':{label:'Claude web',color:'#D97757'},'web:chatgpt':{label:'ChatGPT',color:'#10A37F'},'web:gemini':{label:'Gemini',color:'#4285F4'},'web:perplexity':{label:'Perplexity',color:'#20B8CD'},'web:copilot':{label:'Copilot',color:'#7B61FF'},'web:grok':{label:'Grok',color:'#111111'},'web:deepseek':{label:'DeepSeek',color:'#4D6BFE'},'web:mistral':{label:'Mistral',color:'#FA520F'},'web:aistudio':{label:'AI Studio',color:'#4285F4'}};
const BADGES=['FIRST SIP','HOT STREAK','MONSOON','CODE MONSTER','HYPERSCALE','FIRST BUCKET','RESERVOIR','CLOSED LOOP','NIGHT OWL','HYDROHOMIE','PLANET SAVER','ANNOYING'];
// Lifetime water, in things people can picture. Each step is a reward; the next one is always in view.
const MILESTONES=[['A GLASS',0.25],['A CAN',0.33],['A BOTTLE',0.5],['A BIG BOTTLE',1.5],['A WATERING CAN',5],['A WATER-COOLER JUG',19],['A FISH TANK',60],['A BATHTUB',150],['A KIDDIE POOL',500],['A HOT TUB',1500],['A FIRE TRUCK',3000],['A BACKYARD POOL',15000],['A TANKER TRUCK',30000],['A RAIL TANK CAR',110000],['A WATER TOWER',750000],['AN OLYMPIC POOL',2500000]].map(([name,litres],i)=>({id:i+1,name,litres}));
const RATION_MAX=5000; // litres; heavy coding-agent days run far above the old 50 L cap
const USAGE_KEYS=['input','cacheRead','cacheWrite','output'];
function day(ts=Date.now()){const d=new Date(ts); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
function shiftDay(n,base=Date.now()){const d=new Date(base);d.setDate(d.getDate()+n);return day(d);}
function load(file,fallback){try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch{return fallback;}}
function atomic(file,value){fs.mkdirSync(path.dirname(file),{recursive:true}); const temp=file+'.tmp'; fs.writeFileSync(temp,JSON.stringify(value));fs.renameSync(temp,file);}
// Water recorded before the token model existed has no ml field; web sips fall back to a typical chat turn.
function mlOf(source,v){return v?.ml ?? (v?.sips||0)*(source.startsWith('web:')?water.typicalWebMl(source):water.LEGACY_ML_PER_SIP);}
function totals(sources={}){const t={sips:0,prompts:0,tokens:0,wh:0,ml:0};for(const [s,v] of Object.entries(sources)){if(!v)continue;for(const k of ['sips','prompts','tokens','wh'])t[k]+=v[k]||0;t.ml+=mlOf(s,v);}t.litres=t.ml/1000;return t;}
function mood(stats,now=Date.now()){if(now-(stats.lastSip||0)>1800000)return 'sleeping';const ratio=stats.today.litres/stats.ration;return ratio<.25?'chill':ratio<.75?'sipping':ratio<1?'sweating':ratio<=2?'bloated':'dramatic';}
const clampRation=n=>Math.min(RATION_MAX,Math.max(.5,Number(n)));
class Store extends EventEmitter {
 constructor(dir){super();this.dir=dir;this.state=load(path.join(dir,'stats.json'),{days:{},seen:{},usage:{},badges:{},milestones:{},pokes:0,lastSip:0,waterModel:water.VERSION});// Defaults under the saved file, so a settings.json from an older version never lacks a key.
  this.settings={ration:2,size:'M',sound:false,ghost:false,startAtLogin:true,sources:{},siteUrl:'',pausedUntil:0,positions:{},...load(path.join(dir,'settings.json'),{})};this.state.seen ||= {};this.state.usage ||= {};this.state.milestones ||= {};}
 add(e,{backfill=false}={}){
  if(!e || !SOURCES[e.source] || !e.id || !Number.isFinite(Date.parse(e.ts)))return false;
  if(this.settings.sources[e.source]===false || (!backfill && Date.now()<this.settings.pausedUntil))return false;
  const key=day(e.ts), exists=this.state.seen[e.id]; let sips=0,prompts=0,tokens=0,used=null;
  if(e.kind==='reply') {
   // Claude streams one reply as several entries whose usage only grows: count the growth.
   const previous=this.state.usage[e.id]||[0,0,0,0];const usage=e.usage.map((n,i)=>Math.max(n,previous[i]));tokens=usage.reduce((a,b,i)=>a+b-previous[i],0);this.state.usage[e.id]=usage;if(!exists)sips=1;
   used=Object.fromEntries(USAGE_KEYS.map((k,i)=>[k,usage[i]-previous[i]]));
  } else if(!exists){if(e.kind==='sip')sips=1;else if(e.kind==='prompt'){prompts=1;if(e.source.startsWith('web:'))sips=1;}tokens=e.tokens||0;
   if(e.usage)used=e.usage;else if(sips && e.source.startsWith('web:'))used=water.TYPICAL_WEB_TURN;}
  if(!sips && !prompts && !tokens)return false;
  const wh=used?water.energyWh(used,e.model):0,ml=water.waterMl(e.source,wh);
  this.state.seen[e.id]=Date.parse(e.ts);
  const bucket=this.state.days[key] ||= {};const v=bucket[e.source] ||= {sips:0,prompts:0,tokens:0,wh:0,ml:0};
  const before=mlOf(e.source,v);v.sips+=sips;v.prompts+=prompts;v.tokens+=tokens;v.wh=(v.wh||0)+wh;v.ml=before+ml;
  if(sips){this.state.lastSip=Math.max(this.state.lastSip,Date.parse(e.ts));if(new Date(e.ts).getHours()>=2 && new Date(e.ts).getHours()<5)this.state.nightOwl=true;}
  this.dirty=true;
  if(!backfill){this.checkBadges();this.scheduleSave();this.emitChange();if((sips||ml) && key===day())this.emit('sip',{sips,source:e.source,ml});}
  return true;
 }
 // Water model upgrade: forget Claude Code and Codex counts for the last 31 days and the file offsets,
 // so the backfill reads those logs again with the new model. Web sips cannot be re-read; they keep
 // their counts and get the typical-chat estimate. Badges and milestones already won stay won.
 migrate(offsets,now=Date.now()){
  if(this.state.waterModel===water.VERSION)return false;
  const cutoff=shiftDay(-31,now);
  for(const [d,sources] of Object.entries(this.state.days)){for(const s of ['claude','codex'])if(d>=cutoff)delete sources[s];for(const [s,v] of Object.entries(sources))if(v.ml===undefined){v.ml=mlOf(s,v);v.wh=0;}if(!Object.keys(sources).length)delete this.state.days[d];}
  for(const map of [this.state.seen,this.state.usage])for(const id of Object.keys(map))if(/^(claude|codex):/.test(id))delete map[id];
  for(const file of Object.keys(offsets))delete offsets[file];
  this.state.waterModel=water.VERSION;this.dirty=true;
  if(!this.settings.rationManual){this.settings={...this.settings,rationPersonalized:false,rationToastShown:false};atomic(path.join(this.dir,'settings.json'),this.settings);}
  return true;
 }
 streak(now=Date.now()){
  let n=0; for(let i=1;i<36600;i++){const key=shiftDay(-i,now),v=this.state.days[key];if(!v || totals(v).litres>this.settings.ration)break;n++;}return n;
 }
 personalizeRation(now=Date.now()){
  if(this.settings.rationPersonalized || this.settings.rationManual)return null;
  const values=Array.from({length:14},(_,i)=>totals(this.state.days[shiftDay(-i,now)]))
   .filter(v=>v.sips>0).map(v=>v.litres).sort((a,b)=>a-b);
  const middle=Math.floor(values.length/2),usual=values.length?(values.length%2?values[middle]:(values[middle-1]+values[middle])/2):0;
  this.settings={...this.settings,usualDay:usual,ration:values.length?clampRation(Math.round(usual*.8*2)/2):2,rationPersonalized:true};
  atomic(path.join(this.dir,'settings.json'),this.settings);
  return values.length?`Your usual day: ${usual.toFixed(1)} L. Ration set to ${this.settings.ration} L. Beat it to start a streak.`:null;
 }
 lifetimeLitres(){return Object.values(this.state.days).reduce((a,d)=>a+totals(d).litres,0);}
 checkBadges(now=Date.now(),quiet=false){
  const all=Object.values(this.state.days).map(totals),lifetime=all.reduce((a,b)=>a+b.litres,0),streak=this.streak(now);
  const code=Object.values(this.state.days).some(d=>(d.claude?.sips||0)+(d.codex?.sips||0)>=1000);
  const half=Object.entries(this.state.days).some(([d,v])=>d<day(now)&&totals(v).litres<this.settings.ration/2);
  const achieved=[lifetime>0,streak>=7,all.some(d=>d.sips>=500),code,all.some(d=>d.litres>=10),lifetime>=10,lifetime>=100,half,this.state.nightOwl,streak>=3,streak>=30,this.state.pokes>=50];
  achieved.forEach((yes,i)=>{if(yes && !this.state.badges[i+1]){this.state.badges[i+1]=new Date(now).toISOString();this.dirty=true;if(!quiet)this.emit('badge',{id:i+1,name:BADGES[i]});}});
  // Several milestones can fall in one go (first scan of a heavy user): announce only the biggest.
  const fresh=MILESTONES.filter(m=>lifetime>=m.litres && !this.state.milestones[m.id]);
  for(const m of fresh)this.state.milestones[m.id]=new Date(now).toISOString();
  if(fresh.length){this.dirty=true;const top=fresh.at(-1);if(quiet)this.state.milestoneToast=top.id;else this.emit('milestone',{...top,lifetime});}
 }
 milestones(){
  const lifetime=this.lifetimeLitres(),next=MILESTONES.find(m=>lifetime<m.litres),reached=MILESTONES.filter(m=>lifetime>=m.litres).at(-1);
  const from=reached?.litres||0;
  return {lifetime,list:MILESTONES.map(m=>({...m,unlocked:!!this.state.milestones[m.id]||lifetime>=m.litres})),reached:reached||null,next:next?{...next,progress:Math.min(1,(lifetime-from)/(next.litres-from))}:null};
 }
 snapshot(now=Date.now()){
  const today=totals(this.state.days[day(now)]),streak=this.streak(now);const series=Array.from({length:14},(_,i)=>{const d=shiftDay(i-13,now);return {day:d,...totals(this.state.days[d])};});
  const lifetime=totals(Object.values(this.state.days).reduce((a,d)=>{for(const [s,v] of Object.entries(d)){a[s] ||= {sips:0,prompts:0,tokens:0,wh:0,ml:0};for(const k of ['sips','prompts','tokens','wh'])a[s][k]+=v[k]||0;a[s].ml+=mlOf(s,v);}return a;},{}));
  const result={today:{day:day(now),...today},yesterday:{day:shiftDay(-1,now),...totals(this.state.days[shiftDay(-1,now)])},series,bySource:Object.fromEntries(Object.entries(SOURCES).map(([s,v])=>[s,{...v,...totals({[s]:this.state.days[day(now)]?.[s]})}])),streak,ration:this.settings.ration,badges:BADGES.map((name,i)=>({id:i+1,name,unlocked:!!this.state.badges[i+1]})),milestones:this.milestones(),lifetime,pokes:this.state.pokes,lastSip:this.state.lastSip,planet:streak<3?'parched':streak<14?'okay':'lush',extensionLastSeen:this.state.extensionLastSeen||0,settings:this.settings};result.mood=mood(result,now);return result;
 }
 poke(){this.state.pokes++;this.checkBadges();this.scheduleSave();return this.state.pokes;}
 updateSettings(patch){this.settings={...this.settings,...patch,ration:clampRation(patch.ration??this.settings.ration),...({rationManual:this.settings.rationManual || "ration" in patch})};atomic(path.join(this.dir,'settings.json'),this.settings);this.checkBadges();this.emit('change',this.snapshot());return this.settings;}
 // Agent loops add several replies a second; the UI gets at most four snapshots a second.
 emitChange(){if(this.changeTimer)return;this.changeTimer=setTimeout(()=>{this.changeTimer=null;this.emit('change',this.snapshot());},250);this.changeTimer.unref?.();}
 scheduleSave(){if(!this.timer){this.timer=setTimeout(()=>{this.timer=null;this.save();},5000);this.timer.unref();}}
 // Duplicate ids only arrive within seconds (streamed chunks) or hours (extension retries),
 // so ids older than two days are dropped; file offsets keep old lines from being re-read.
 prune(now=Date.now()){const cutoff=now-2*86400000;for(const [id,ts] of Object.entries(this.state.seen)){if(ts===true || ts<cutoff){delete this.state.seen[id];delete this.state.usage[id];}}}
 save(){if(this.dirty){this.prune();atomic(path.join(this.dir,'stats.json'),this.state);this.dirty=false;}}
 csv(){let s='date,source,sips,prompts,tokens,wh,litres\n';for(const [d,sources] of Object.entries(this.state.days).sort())for(const [source,v]of Object.entries(sources))s+=`${d},${source},${v.sips},${v.prompts},${v.tokens},${(v.wh||0).toFixed(2)},${(mlOf(source,v)/1000).toFixed(4)}\n`;return s;}
}
module.exports={Store,day,shiftDay,totals,atomic,load,SOURCES,BADGES,MILESTONES,RATION_MAX,mood,mlOf};
