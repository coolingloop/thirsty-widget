'use strict';
const fs = require('node:fs'), path = require('node:path');
const { Worker } = require('node:worker_threads');
const { EventEmitter } = require('node:events');
const { Store, load, atomic } = require('./store');
const { filesIn, tailFile } = require('./tailer');

const MONTH = 30 * 86400000;
// The watcher reports each changed file, so normal work only touches those files.
// A slow full rescan catches anything a watcher missed (network drives, sleep, etc.).
const RESCAN_MS = 60000;
const DEBOUNCE_MS = 150;

function isLog(file, source) {
  return file.endsWith('.jsonl') && (source !== 'codex' || path.basename(file).startsWith('rollout-'));
}

class Collectors extends EventEmitter {
  constructor(config) {
    super();
    this.config = config;
    this.watches = [];
    this.stopped = false;
    this.changed = new Map(); // absolute path -> source
  }

  async start() {
    const result = await new Promise((resolve, reject) => {
      // Packaged builds unpack engine/ next to app.asar, because worker threads load from disk.
      const script = path.join(__dirname, 'backfill-worker.js').replace(/app\.asar([\\/])/, 'app.asar.unpacked$1');
      this.worker = new Worker(script, { workerData: this.config });
      this.worker.on('message', (m) => {
        if (m.type === 'progress') this.emit('progress', m);
        else if (m.type === 'done') resolve(m);
        else if (m.type === 'error') reject(new Error(m.message));
      });
      this.worker.on('error', reject);
      this.worker.on('exit', (code) => {
        if (code) reject(new Error('Backfill worker exited ' + code));
      });
    });
    if (this.stopped) return result;
    this.store = new Store(this.config.dataDir);
    this.offsets = load(path.join(this.config.dataDir, 'offsets.json'), {});
    for (const [root, source] of [[this.config.claudeDir, 'claude'], [this.config.codexDir, 'codex']]) {
      try {
        this.watches.push(fs.watch(root, { recursive: true }, (_, name) => this.schedule(root, source, name)));
      } catch {}
    }
    this.timer = setInterval(() => this.rescan(), RESCAN_MS);
    this.timer.unref();
    await this.rescan();
    this.emit('ready', this.store, result);
    return result;
  }

  schedule(root, source, name) {
    if (this.stopped) return;
    if (!name) return this.rescan(); // the platform did not say which file; look at everything
    const file = path.join(root, String(name));
    if (!isLog(file, source)) return;
    this.changed.set(file, source);
    if (this.pending) return;
    this.pending = setTimeout(() => {
      this.pending = null;
      this.tailChanged();
    }, DEBOUNCE_MS);
    this.pending.unref();
  }

  async tailChanged() {
    const batch = [...this.changed];
    this.changed.clear();
    const files = [];
    for (const [file, source] of batch) {
      try {
        const s = await fs.promises.stat(file);
        files.push({ path: file, source, size: s.size, mtime: s.mtimeMs });
      } catch {} // deleted or renamed away; the rescan settles it
    }
    await this.process(files);
  }

  async rescan() {
    const since = Date.now() - MONTH;
    try {
      const files = [
        ...(await filesIn(this.config.claudeDir, 'claude', since)),
        ...(await filesIn(this.config.codexDir, 'codex', since)),
      ];
      await this.process(files);
    } catch (e) {
      this.emit('error', e);
    }
  }

  async process(files) {
    if (this.stopped || !this.store || !files.length) return;
    // One pass at a time; anything that arrives meanwhile waits for the next debounce.
    while (this.busy) await new Promise((r) => setTimeout(r, 50));
    this.busy = true;
    let changed = false;
    try {
      const since = Date.now() - MONTH;
      for (const f of files) {
        const state = (this.offsets[f.path] ||= {});
        if (f.size !== state.offset && (f.mtime !== state.mtime || f.size > state.offset)) {
          await tailFile(f, state, (e) => this.store.add(e), { since });
          changed = true;
        }
      }
      if (changed) {
        this.store.scheduleSave();
        this.scheduleOffsets();
      }
    } catch (e) {
      this.emit('error', e);
    } finally {
      this.busy = false;
    }
  }

  scheduleOffsets() {
    if (this.offsetTimer) return;
    this.offsetTimer = setTimeout(() => {
      this.offsetTimer = null;
      atomic(path.join(this.config.dataDir, 'offsets.json'), this.offsets);
    }, 5000);
    this.offsetTimer.unref();
  }

  async stop() {
    this.stopped = true;
    clearInterval(this.timer);
    clearTimeout(this.pending);
    clearTimeout(this.offsetTimer);
    for (const w of this.watches) w.close();
    if (this.worker) await this.worker.terminate();
    if (this.offsets) atomic(path.join(this.config.dataDir, 'offsets.json'), this.offsets);
    this.store?.save();
  }
}

module.exports = { Collectors };
