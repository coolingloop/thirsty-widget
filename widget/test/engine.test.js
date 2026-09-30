'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {parseClaude,parseCodex}=require('../engine/parsers'),{Store,day,shiftDay,totals,mood}=require('../engine/store'),{filesIn,tailFile}=require('../engine/tailer');
const root=path.resolve(__dirname,'../.testdata');fs.mkdirSync(root,{recursive:true});
const temp=()=>fs.mkdtempSync(path.join(root,'unit-'));
const fixture=name=>fs.readFileSync(path.join(__dirname,'fixtures',name),'utf8').trim().split('\n').map(JSON.parse);
test('Personal ration: 80 percent of nonzero 14-day median, rounding, manual preservation',()=>{const dir=temp(),store=new Store(dir);const values=[0,4,5,6,7,8,9,10,11,12,13,14,0,0];values.forEach((v,i)=>{if(v)store.state.days[shiftDay(-i)]={codex:{sips:v/.0035,prompts:0,tokens:0}};});const toast=store.personalizeRation();assert.equal(store.settings.usualDay,9);assert.equal(store.settings.ration,7);assert.equal(toast,'Your usual day: 9.0 L. Ration set to 7 L. Beat it to start a streak.');assert.equal(store.personalizeRation(),null);store.updateSettings({ration:31.5});assert.equal(new Store(dir).personalizeRation(),null);assert.equal(new Store(dir).settings.ration,31.5);const manual=new Store(temp());manual.updateSettings({ration:6});manual.state.days=store.state.days;assert.equal(manual.personalizeRation(),null);assert.equal(manual.settings.ration,6);const empty=new Store(temp());assert.equal(empty.personalizeRation(),null);assert.equal(empty.settings.ration,2);const tiny=new Store(temp());tiny.state.days[day()]={codex:{sips:1}};tiny.personalizeRation();assert.equal(tiny.settings.ration,.5);});
test('Claude real streamed chunks: one sip and usage once per message ID',()=>{const store=new Store(temp()),chunks=fixture('claude-stream.jsonl');assert.equal(chunks.length,3);assert.equal(new Set(chunks.map(o=>o.message.id)).size,1);for(const o of [...chunks,...chunks])store.add(parseClaude(o,'real'),{backfill:true});const s=store.snapshot(),u=chunks.map(o=>parseClaude(o,'real').usage);assert.equal(s.lifetime.sips,1);assert.equal(s.lifetime.tokens,[0,1,2,3].reduce((n,i)=>n+Math.max(...u.map(v=>v[i])),0));});
test('Claude real human prompt counts, tool_result and isMeta do not',()=>{const entries=fixture('claude-users.jsonl');assert.ok(parseClaude(entries[0],'real'));assert.equal(parseClaude(entries[1],'real'),null);assert.equal(parseClaude(entries[2],'real'),null);assert.equal(parseClaude({...entries[0],origin:{kind:'system'}},'real'),null);});
test('Subagent directories are scanned and actual subagent reply counts',async()=>{const dir=temp(),sub=path.join(dir,'project/subagents');fs.mkdirSync(sub,{recursive:true});fs.copyFileSync(path.join(__dirname,'fixtures/claude-subagent.jsonl'),path.join(sub,'agent.jsonl'));const files=await filesIn(dir,'claude');assert.equal(files.length,1);const store=new Store(temp());await tailFile(files[0],{},e=>store.add(e,{backfill:true}));assert.equal(store.snapshot().lifetime.sips,1);});
test('Codex repeated total dedupe and last_token_usage once',()=>{const entries=fixture('codex.jsonl'),state={},store=new Store(temp());for(const o of entries.slice(0,2))store.add(parseCodex(o,'rollout-real',state),{backfill:true});assert.equal(store.snapshot().lifetime.sips,1);assert.equal(store.snapshot().lifetime.tokens,entries[0].payload.info.last_token_usage.total_tokens);});
test('Codex real user counts and real injected context does not',()=>{const entries=fixture('codex.jsonl');assert.ok(parseCodex(entries[2],'real',{}));assert.equal(parseCodex(entries[3],'real',{}),null);for(const text of ['<environment_context>x</environment_context>','# AGENTS.md instructions\nx','<permissions instructions>x','<developer_instructions>x'])assert.equal(parseCodex({type:'response_item',timestamp:new Date().toISOString(),payload:{type:'message',role:'user',content:[{type:'input_text',text}]}},'real',{}),null);});
test('Codex mirrored response_item and user_message prompt dedupe',()=>{const ts=new Date().toISOString(),state={};assert.ok(parseCodex({type:'response_item',timestamp:ts,payload:{type:'message',role:'user',content:[{type:'input_text',text:'x'}]}},'a',state));assert.equal(parseCodex({type:'event_msg',timestamp:ts,payload:{type:'user_message',message:'x'}},'a',state),null);});
test('Offset tailer holds partial line, handles appended bytes and restart',async()=>{const dir=temp(),p=path.join(dir,'a.jsonl'),chunks=fixture('claude-stream.jsonl');const line=JSON.stringify(chunks[0])+'\n',partial=JSON.stringify(chunks[1]);fs.writeFileSync(p,line+partial.slice(0,partial.length-8));const file={path:p,source:'claude'},state={},events=[];await tailFile(file,state,e=>events.push(e));assert.equal(events.length,1);assert.equal(state.offset,Buffer.byteLength(line));const persisted=JSON.parse(JSON.stringify(state));assert.ok(!JSON.stringify(persisted).includes('content'));fs.appendFileSync(p,partial.slice(-8)+'\n'+JSON.stringify(chunks[2])+'\n');await tailFile(file,persisted,e=>events.push(e));assert.equal(events.length,3);assert.equal(persisted.offset,fs.statSync(p).size);assert.equal(await tailFile(file,persisted,e=>events.push(e)),0);});
test('Streak completed days, planet and once-only badge thresholds',()=>{const store=new Store(temp());for(let i=1;i<=14;i++)store.state.days[shiftDay(-i)]={claude:{sips:100,prompts:2,tokens:4}};assert.equal(store.streak(),14);assert.equal(store.snapshot().planet,'lush');const unlocked=[];store.on('badge',b=>unlocked.push(b.id));store.checkBadges();store.checkBadges();assert.equal(new Set(unlocked).size,unlocked.length);assert.ok(store.state.badges[2]);assert.ok(store.state.badges[8]);assert.ok(store.state.badges[10]);store.state.pokes=50;store.checkBadges();assert.ok(store.state.badges[12]);});
test('All six moods use exact ration boundaries and sleep timing',()=>{for(const [litres,expected]of [[.1,'chill'],[.5,'sipping'],[1.5,'sweating'],[2,'bloated'],[4.1,'dramatic']])assert.equal(mood({today:{litres},ration:2,lastSip:Date.now()}),expected);assert.equal(mood({today:{litres:1},ration:2,lastSip:Date.now()-1800001}),'sleeping');});
test('Web events dedupe, source pause, atomic persistence and counts-only CSV',()=>{const dir=temp(),store=new Store(dir),e={source:'web:chatgpt',id:'web:unique',kind:'prompt',ts:new Date().toISOString()};assert.equal(store.add(e),true);assert.equal(store.add(e),false);assert.equal(store.snapshot().today.sips,1);assert.equal(store.snapshot().today.prompts,1);store.updateSettings({sources:{codex:false}});assert.equal(store.add({...e,source:'codex',id:'disabled',kind:'sip'}),false);store.save();assert.equal(new Store(dir).snapshot().today.sips,1);assert.ok(store.csv().includes('web:chatgpt,1,1,0,0.31,0.0011'),store.csv());assert.equal(fs.existsSync(path.join(dir,'stats.json.tmp')),false);});

// Water model v2 (WATER-MODEL.md): tokens -> Wh -> mL by provider.
const water=require('../engine/water'),{MILESTONES}=require('../engine/store');
test('Water model anchors: typical chat, Google on-site water, model size, cache discount',()=>{
 const chat=water.energyWh(water.TYPICAL_WEB_TURN);assert.ok(Math.abs(chat-0.31)<1e-9);
 assert.ok(Math.abs(water.waterMl('web:chatgpt',chat)-1.057)<0.01);
 // Google's paper: 0.24 Wh and 0.26 mL on site for the median Gemini prompt.
 assert.ok(Math.abs(0.24*water.PROVIDERS.google.site-0.26)<1e-9);
 assert.equal(water.modelScale('claude-opus-5-5'),1.7);assert.equal(water.modelScale('claude-haiku-4-5'),0.4);assert.equal(water.modelScale('gpt-6.1-sol'),1);
 assert.equal(water.energyWh({cacheRead:1e6}),water.energyWh({input:1e5}));
});
test('Claude streamed reply: water from usage growth, counted once',()=>{
 const store=new Store(temp()),ts=new Date().toISOString(),model='claude-opus-5-5';
 store.add({source:'claude',id:'claude:m1',kind:'reply',ts,model,usage:[10,100000,0,50]});
 store.add({source:'claude',id:'claude:m1',kind:'reply',ts,model,usage:[10,100000,2000,400]});
 store.add({source:'claude',id:'claude:m1',kind:'reply',ts,model,usage:[10,100000,2000,400]});
 const t=store.snapshot().today,wh=water.energyWh({input:10,cacheRead:100000,cacheWrite:2000,output:400},model);
 assert.equal(t.sips,1);assert.ok(Math.abs(t.wh-wh)<1e-9);assert.ok(Math.abs(t.ml-water.waterMl('claude',wh))<1e-9);
});
test('Codex usage: cached input split out, model from turn_context',()=>{
 const state={},ts=new Date().toISOString();
 parseCodex({type:'turn_context',timestamp:ts,payload:{model:'gpt-6.1-sol'}},'f',state);
 const e=parseCodex({type:'event_msg',timestamp:ts,payload:{type:'token_count',info:{total_token_usage:{input_tokens:5000,cached_input_tokens:4000,output_tokens:300,total_tokens:5300},last_token_usage:{input_tokens:5000,cached_input_tokens:4000,output_tokens:300,total_tokens:5300}}}},'f',state);
 assert.deepEqual(e.usage,{input:1000,cacheRead:4000,cacheWrite:0,output:300});assert.equal(e.model,'gpt-6.1-sol');
});
test('Model upgrade recounts recent Claude Code and Codex days, keeps web sips and old days',()=>{
 const dir=temp(),store=new Store(dir),today=day(),old=shiftDay(-60);
 store.state={days:{[today]:{claude:{sips:10,prompts:1,tokens:5},'web:gemini':{sips:2,prompts:2,tokens:0}},[old]:{codex:{sips:4,prompts:0,tokens:0}}},seen:{'claude:a':Date.now(),'web:b':Date.now()},usage:{'claude:a':[1,2,3,4]},badges:{1:'x'},milestones:{},pokes:0,lastSip:0};
 const offsets={'a.jsonl':{offset:99}};assert.equal(store.migrate(offsets),true);
 assert.equal(store.state.days[today].claude,undefined);assert.ok(Math.abs(store.state.days[today]['web:gemini'].ml-2*water.typicalWebMl('web:gemini'))<1e-9);
 assert.equal(store.state.days[old].codex.ml,4*water.LEGACY_ML_PER_SIP);assert.deepEqual(offsets,{});assert.equal(store.state.seen['claude:a'],undefined);assert.ok(store.state.seen['web:b']);
 assert.equal(store.state.badges[1],'x');assert.equal(store.settings.rationPersonalized,false);assert.equal(store.migrate({}),false);
});
test('Milestones: ladder unlocks with lifetime litres, next step progress, one announcement',()=>{
 const store=new Store(temp()),seen=[];store.on('milestone',m=>seen.push(m.name));
 store.state.days[day()]={codex:{sips:1,prompts:0,tokens:0,wh:0,ml:600}};store.checkBadges();
 const m=store.milestones();assert.deepEqual(m.list.filter(x=>x.unlocked).map(x=>x.name),['A GLASS','A CAN','A BOTTLE']);
 assert.equal(m.next.name,'A BIG BOTTLE');assert.ok(Math.abs(m.next.progress-0.1)<1e-9);assert.deepEqual(seen,['A BOTTLE']);
 store.checkBadges();assert.equal(seen.length,1);
 const quiet=new Store(temp());quiet.state.days[day()]={codex:{sips:1,prompts:0,tokens:0,wh:0,ml:200000}};quiet.checkBadges(Date.now(),true);assert.equal(quiet.state.milestoneToast,8);
 assert.ok(MILESTONES.every((x,i)=>i===0||x.litres>MILESTONES[i-1].litres));
});
test('Ration can follow heavy agent days up to 5000 L',()=>{const store=new Store(temp());store.updateSettings({ration:120});assert.equal(store.settings.ration,120);store.updateSettings({ration:99999});assert.equal(store.settings.ration,5000);});
