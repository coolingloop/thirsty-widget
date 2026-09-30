'use strict';
const crypto = require('node:crypto');
const hash = text => crypto.createHash('sha256').update(text).digest('hex').slice(0,24);
const textOf = c => typeof c === 'string' ? c : Array.isArray(c) ? c.filter(b => ['text','input_text'].includes(b.type)).map(b => b.text || '').join('\n') : '';
const injected = text => /^(?:\s*(?:#\s*AGENTS\.md\b|<environment_context>|<permissions|<developer_instructions>|<system|<INSTRUCTIONS>|\[Injected|<collaboration_mode>|<user_instructions>|#\s*Instructions for))/i.test(text) || /^\s*You are (?:Codex|an AI|ChatGPT)\b/.test(text);
function parseClaude(o, file) {
  const m=o.message || {}, ts=o.timestamp;
  if(o.type==='assistant' && m.id) {
    const u=m.usage || {};
    return {source:'claude',id:'claude:'+m.id,kind:'reply',ts,model:m.model||'',usage:[u.input_tokens,u.cache_read_input_tokens,u.cache_creation_input_tokens,u.output_tokens].map(n=>Number(n)||0)};
  }
  if(o.type!=='user' || o.isMeta || m.isMeta || (o.origin && o.origin.kind!=='human')) return null;
  if(Array.isArray(m.content) && m.content.some(b=>b.type==='tool_result')) return null;
  if(!textOf(m.content)) return null;
  return {source:'claude',id:'claude:prompt:'+(o.uuid || hash(file+ts+textOf(m.content))),kind:'prompt',ts};
}
function parseCodex(o,file,state={}) {
  const p=o.payload || {}, ts=o.timestamp;
  if(o.type==='session_meta') {state.session=p.id || file; return null;}
  if(o.type==='turn_context') {if(p.model)state.model=p.model; return null;}
  const session=state.session || file;
  if(o.type==='event_msg' && p.type==='token_count') {
    const info=p.info; if(!info || !info.total_token_usage) return null;
    const u=info.total_token_usage, last=info.last_token_usage || {};
    const sig=JSON.stringify([u.input_tokens||0,u.cached_input_tokens||0,u.cache_write_input_tokens||0,u.output_tokens||0,u.reasoning_output_tokens||0,u.total_tokens||0]);
    if(sig===state.lastTotal || !(Number(u.total_tokens) || Number(u.input_tokens)+Number(u.output_tokens))) return null;
    state.lastTotal=sig;
    const tokens=Number(last.total_tokens) || (Number(last.input_tokens)||0)+(Number(last.output_tokens)||0);
    // Cached input is part of input_tokens in Codex logs; reasoning is part of output_tokens.
    const cached=Number(last.cached_input_tokens)||0;
    const usage={input:Math.max(0,(Number(last.input_tokens)||0)-cached),cacheRead:cached,cacheWrite:Number(last.cache_write_input_tokens)||0,output:Number(last.output_tokens)||0};
    return {source:'codex',id:'codex:'+hash(session)+':'+hash(sig),kind:'sip',ts,tokens,usage,model:state.model||''};
  }
  const response=o.type==='response_item' && p.type==='message' && p.role==='user';
  const event=o.type==='event_msg' && p.type==='user_message';
  if(!response && !event) return null;
  if(p.isMeta || o.isMeta || p.origin && p.origin.kind!=='human') return null;
  const kinds=p.internal_chat_message_metadata_passthrough?.content_item_kinds;
  if(response && Array.isArray(kinds) && kinds.length && kinds.every(k=>/^(agents_md\.|environments\.|permissions\.|developer\.|system\.)/.test(k)))return null;
  const humanContent=response && Array.isArray(kinds) && Array.isArray(p.content) && kinds.length===p.content.length && kinds.includes('user.text') ? p.content.filter((_,i)=>kinds[i]==='user.text') : p.content;
  const text=event ? textOf(p.message) : textOf(humanContent);
  if(!text || injected(text)) return null;
  const h=hash(text), time=Date.parse(ts);
  // Some versions mirror one prompt in response_item and event_msg.
  if(state.promptHash===h && state.promptForm!==o.type && Math.abs(time-state.promptTime)<1500) {state.promptForm=o.type; return null;}
  state.promptHash=h; state.promptTime=time; state.promptForm=o.type;
  return {source:'codex',id:'codex:prompt:'+hash(session+':'+(p.id || ts)+':'+h),kind:'prompt',ts};
}
function parseLine(line,source,file,state) {
  if(!line.includes('"assistant"') && !line.includes('"token_count"') && !line.includes('"user"') && !line.includes('"user_message"') && !line.includes('"session_meta"') && !line.includes('"turn_context"')) return null;
  try {const o=JSON.parse(line); return source==='claude' ? parseClaude(o,file) : parseCodex(o,file,state);} catch {return null;}
}
module.exports={parseClaude,parseCodex,parseLine,textOf,injected,hash};
