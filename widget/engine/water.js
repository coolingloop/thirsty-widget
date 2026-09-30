'use strict';
// How much water one AI reply uses, estimated from its tokens. Reasoning and sources: WATER-MODEL.md.
//
//   energy (Wh) = model size x (input x 250 + cache writes x 310 + cache reads x 25 + output x 600) / 1,000,000
//   water (mL)  = energy x (on-site cooling water + power-plant water) for the data centres that run it
//
// Anchors: a typical 500-token chat answer is about 0.3 Wh (Epoch AI 2025; OpenAI 0.34 Wh average ChatGPT
// query; Google 0.24 Wh median Gemini prompt). A fresh 10,000-token prompt adds about 2.5 Wh (Epoch AI).
// Cache writes and reads follow the providers' price ratios to fresh input (1.25x and 0.1x), the same
// scaling Simon Couch used for Claude Code. Output here includes hidden reasoning tokens.

const VERSION = 2;
const WH_PER_MTOK = {input: 250, cacheWrite: 310, cacheRead: 25, output: 600};

// Bigger models burn more per token. Opus-class models are priced 1.7x the mid-size ones; mini-class
// models about 0.4x. Anything unknown counts as mid-size.
function modelScale(model = '') {
  if (/haiku|mini|nano|flash|lite|luna/i.test(model)) return 0.4;
  if (/opus/i.test(model)) return 1.7;
  return 1;
}

// Water per Wh drawn by the data centre, in mL (the same number as L per kWh).
// site: cooling water on site. source: water evaporated at power plants making that electricity.
// Azure, AWS and DeepSeek: Jegham et al. 2025 (WUE on site / PUE, and their off-site factor).
// Google: its own paper, 0.26 mL on site for a 0.24 Wh median prompt (arXiv 2508.15734).
// Average: US data centres 2023, 17.4 billion gallons direct over 176 TWh (LBNL 2024), 0.374 L/kWh.
const PROVIDERS = {
  azure: {label: 'Microsoft Azure', site: 0.30 / 1.12, source: 3.142},
  aws: {label: 'Amazon Web Services', site: 0.18 / 1.14, source: 3.142},
  google: {label: 'Google', site: 0.26 / 0.24, source: 3.142},
  deepseek: {label: 'DeepSeek, China', site: 1.20 / 1.27, source: 6.016},
  average: {label: 'US data-centre average', site: 0.374, source: 3.142},
};
const SOURCE_PROVIDER = {
  claude: 'aws', 'web:claude': 'aws', 'web:perplexity': 'aws',
  codex: 'azure', 'web:chatgpt': 'azure', 'web:copilot': 'azure',
  'web:gemini': 'google', 'web:aistudio': 'google',
  'web:deepseek': 'deepseek', 'web:grok': 'average', 'web:mistral': 'average',
};
// A web chat whose reply length could not be measured counts as a typical chat turn (about 0.3 Wh).
const TYPICAL_WEB_TURN = {input: 40, cacheWrite: 0, cacheRead: 0, output: 500};
// Days recorded before this model existed kept only a sip count; they stay at the old flat rate.
const LEGACY_ML_PER_SIP = 3.5;

function energyWh(usage = {}, model = '') {
  let wh = 0;
  for (const [kind, rate] of Object.entries(WH_PER_MTOK)) wh += (Number(usage[kind]) || 0) * rate;
  return (wh / 1e6) * modelScale(model);
}

function waterMl(source, wh) {
  const p = PROVIDERS[SOURCE_PROVIDER[source]] || PROVIDERS.average;
  return wh * (p.site + p.source);
}

function typicalWebMl(source) {
  return waterMl(source, energyWh(TYPICAL_WEB_TURN));
}

module.exports = {VERSION, WH_PER_MTOK, PROVIDERS, SOURCE_PROVIDER, TYPICAL_WEB_TURN, LEGACY_ML_PER_SIP, modelScale, energyWh, waterMl, typicalWebMl};
