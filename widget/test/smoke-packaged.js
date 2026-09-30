'use strict';
// Smoke test for a packaged build: node test/smoke-packaged.js [path-to-executable]
// Runs the real app (sandbox on, no test mode) against a temp data folder and synthetic
// Claude Code + Codex logs, then checks backfill, a live sip and the local API.
const { spawn, execFileSync } = require('node:child_process');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');

const DIST = path.join(__dirname, '..', 'dist');
const defaults = {
  win32: path.join(DIST, 'win-unpacked', 'THIRSTY.exe'),
  darwin: path.join(DIST, process.arch === 'arm64' ? 'mac-arm64' : 'mac', 'THIRSTY.app', 'Contents', 'MacOS', 'THIRSTY'),
  linux: path.join(DIST, 'linux-unpacked', 'thirsty'),
};
const exe = path.resolve(process.argv[2] || defaults[process.platform]);
const port = Number(process.env.SMOKE_PORT) || 47871;
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'thirsty-smoke-'));
const dirs = { data: path.join(root, 'data'), claude: path.join(root, 'claude', 'projects', 'demo'), codex: path.join(root, 'codex', 'sessions') };
for (const d of Object.values(dirs)) fs.mkdirSync(d, { recursive: true });
// No login item for a throwaway run.
fs.writeFileSync(path.join(dirs.data, 'settings.json'), JSON.stringify({ startAtLogin: false }));

const now = () => new Date().toISOString();
const claudeLine = (id) => JSON.stringify({ type: 'assistant', timestamp: now(), sessionId: 'smoke', message: { id, role: 'assistant', model: 'smoke', usage: { input_tokens: 10, output_tokens: 5 } } }) + '\n';
const codexDay = path.join(dirs.codex, ...new Date().toISOString().slice(0, 10).split('-'));
fs.mkdirSync(codexDay, { recursive: true });
fs.writeFileSync(path.join(codexDay, 'rollout-smoke.jsonl'), JSON.stringify({ timestamp: now(), type: 'event_msg', payload: { type: 'token_count', info: { total_token_usage: { input_tokens: 20, output_tokens: 3, total_tokens: 23 }, last_token_usage: { input_tokens: 20, output_tokens: 3, total_tokens: 23 } } } }) + '\n');
const claudeLog = path.join(dirs.claude, 'smoke.jsonl');
fs.writeFileSync(claudeLog, claudeLine('msg_smoke_1'));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function get(p) {
  const r = await fetch(`http://127.0.0.1:${port}${p}`);
  return { status: r.status, body: await r.json() };
}
async function until(what, fn, ms) {
  const end = Date.now() + ms;
  let last;
  while (Date.now() < end) {
    try { if ((last = await fn())) return last; } catch (e) { last = e.message; }
    await sleep(500);
  }
  throw new Error(`Timed out waiting for ${what} (last: ${JSON.stringify(last)})`);
}
const sipsToday = (s) => s.today?.sips ?? s.today?.count;

(async () => {
  if (!fs.existsSync(exe)) throw new Error('Executable not found: ' + exe);
  const env = { ...process.env, THIRSTY_DATA_DIR: dirs.data, THIRSTY_CLAUDE_DIR: path.dirname(dirs.claude), THIRSTY_CODEX_DIR: dirs.codex, THIRSTY_PORT: String(port) };
  delete env.THIRSTY_TEST_MODE;
  delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(exe, [], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  child.stdout.on('data', (d) => (log += d));
  child.stderr.on('data', (d) => (log += d));
  let exited = null;
  child.on('exit', (code, signal) => (exited = { code, signal }));
  const results = [];
  const pass = (name, detail) => { results.push({ name, ok: true, detail }); console.log('PASS', name, detail ?? ''); };
  try {
    const health = await until('/health ready', async () => { if (exited) throw new Error('app exited ' + JSON.stringify(exited) + '\n' + log); const h = await get('/health'); return h.body.ready && h; }, 90000);
    pass('launch + API', `port ${port}, ready ${health.body.ready}`);
    const first = await until('backfill sips', async () => { const s = (await get('/stats')).body; return sipsToday(s) >= 2 && s; }, 30000);
    pass('backfill (Claude + Codex logs)', `today ${sipsToday(first)} sips, ${first.today.litres} L`);
    fs.appendFileSync(claudeLog, claudeLine('msg_smoke_2'));
    const live = await until('live sip', async () => { const s = (await get('/stats')).body; return sipsToday(s) >= sipsToday(first) + 1 && s; }, 75000);
    pass('live sip from an appended log line', `today ${sipsToday(live)} sips`);
    const cors = await fetch(`http://127.0.0.1:${port}/stats`, { headers: { Origin: 'https://evil.example' } });
    if (cors.status !== 403) throw new Error('foreign origin got ' + cors.status);
    pass('foreign web origin refused', '403');
    if (!fs.existsSync(path.join(dirs.data, 'port'))) throw new Error('port file missing');
    pass('data folder written', dirs.data);
  } finally {
    if (!exited) {
      if (process.platform === 'win32') { try { execFileSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' }); } catch {} }
      else child.kill('SIGTERM');
      await sleep(1500);
    }
    if (process.env.SMOKE_KEEP !== '1') fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
    const failed = results.length < 5;
    if (failed) console.log('--- app output ---\n' + log.slice(-4000));
  }
  console.log(`SMOKE OK: ${results.length}/5`);
})().catch((e) => { console.error('SMOKE FAIL:', e.message); process.exit(1); });
