'use strict';
const $ = (id) => document.getElementById(id),
  pet = $('pet'),
  body = $('body'),
  mascot = $('mascot');
document.body.classList.add('tracking-loading');

// Straw moods use the sprites whose straw is lengthened in tools/straw.py; sticker moods
// have no straw and just stand on the mound next to the glass.
const sprites = {
  chill: 'sticker-10-thumbs-up',
  sipping: 'thirsty-sip',
  sweating: 'thirsty-suck',
  bloated: 'thirsty-burp',
  dramatic: 'sticker-11-dead-x',
  sleeping: 'sticker-07-sleep',
};
const quips = [
  'that one was a big context',
  'tokens taste like pennies',
  'another agent loop? bold.',
  'keep the cooling loop going',
  'sip happens',
  'just one more sip',
  'my cup runneth over',
  'nice prompt. very refreshing.',
];
let stats,
  pending = 0,
  pendingMl = 0,
  source = 'codex',
  gulping = false,
  nextGulp = 0,
  bubbleTimer;

// Stage geometry (240 x 280). The straw tip sits near the bottom of the glass.
const GLASS = { x: 2, y: 202 },
  TIP = { x: GLASS.x + 38, y: GLASS.y + 60 },
  BODY_H = 108; // his height from rim to feet, in stage px
const S = window.THIRSTY_SPRITES,
  base = S['thirsty-sip'],
  K = BODY_H / 355, // stage px per sip-sprite px (sip body is 355 px tall)
  m0 = base.points.mouth,
  t0 = base.points.tip,
  MOUTH = { x: TIP.x + K * (m0[0] - t0[0]), y: TIP.y + K * (m0[1] - t0[1]) },
  FEET = { x: MOUTH.x + K * 55, y: MOUTH.y + K * 181 };

function place(el, box) {
  el.style.left = box.x + 'px';
  el.style.top = box.y + 'px';
  el.style.width = box.w + 'px';
  el.style.height = box.h + 'px';
}
function show(name) {
  const spec = S[name];
  if (spec && spec.points) {
    // Same real size for every pose, pinned at the mouth, so the straw stays in the glass.
    const Kf = (K * base.scale) / (spec.scale || base.scale),
      mf = spec.points.mouth,
      box = { x: MOUTH.x - Kf * mf[0], y: MOUTH.y - Kf * mf[1], w: spec.width * Kf, h: spec.height * Kf };
    place(body, box);
    mascot.classList.remove('sticker');
    Object.assign(mascot.style, { left: '', top: '', width: '', height: '' });
    body.style.transformOrigin = FEET.x - box.x + 'px ' + (FEET.y - box.y) + 'px';
    // Nothing of the straw may show below the glass floor.
    const floor = GLASS.y + 64;
    body.style.clipPath = `inset(0 0 ${Math.max(0, box.y + box.h - floor)}px 0)`;
    placeExtras(box, Kf, 500, 25);
  } else {
    const w = 104,
      h = 112,
      box = { x: FEET.x - w / 2, y: FEET.y - h + 6, w, h };
    place(body, box);
    mascot.classList.add('sticker');
    Object.assign(mascot.style, { left: '0', top: '0', width: w + 'px', height: h + 'px' });
    body.style.transformOrigin = w / 2 + 'px ' + (h - 6) + 'px';
    body.style.clipPath = '';
    placeExtras(box, 1, w * 0.62, 6);
  }
  mascot.src = 'img/' + name + '.webp';
}
function placeExtras(box, k, steamX, steamY) {
  const puffs = body.querySelectorAll('.steam');
  puffs.forEach((p, i) => {
    p.style.left = steamX * (k === 1 ? 1 : k) + i * 12 + 'px';
    p.style.top = steamY * (k === 1 ? 1 : k) + 'px';
  });
  const zzz = $('zzz');
  // Keep the Zzz inside the 240 px stage.
  zzz.style.left = Math.min(box.w - 58, 240 - 46 - box.x) + 'px';
  zzz.style.top = '-8px';
}
function layoutStage() {
  place($('mound'), { x: FEET.x - 42, y: FEET.y - 9, w: 84, h: 22 });
}

function resize() {
  pet.style.transform = `scale(${innerWidth / 240})`;
}
addEventListener('resize', resize);
resize();
layoutStage();
show('thirsty-sip');

function beadPath(emptyPx) {
  // From where the straw meets the liquid surface up to his mouth.
  const surface = GLASS.y + 8 + emptyPx,
    t = Math.max(0, Math.min(1, (surface - TIP.y) / (MOUTH.y - TIP.y))),
    x = TIP.x + t * (MOUTH.x - TIP.x),
    y = TIP.y + t * (MOUTH.y - TIP.y),
    bead = $('bead');
  bead.style.setProperty('--bx0', x + 'px');
  bead.style.setProperty('--by0', y + 'px');
  bead.style.setProperty('--bx1', MOUTH.x - 4 + 'px');
  bead.style.setProperty('--by1', MOUTH.y + 4 + 'px');
}

function draw(s) {
  if (!s || s.loading) return;
  stats = s;
  document.body.classList.remove('tracking-loading');
  $('loading').classList.add('hidden');
  $('total').textContent = s.today.litres.toFixed(2) + ' L';
  $('pill').title = s.today.sips.toLocaleString() + ' sips today';
  $('ration-amount').textContent = s.today.litres.toFixed(2) + ' / ' + s.ration + ' L';
  // The glass is today's ration: full at midnight, drained as he drinks, red once over.
  const left = Math.max(0, 1 - s.today.litres / s.ration),
    emptyPx = (1 - left) * 60;
  $('liquid').style.setProperty('--empty', emptyPx + 'px');
  beadPath(emptyPx);
  pet.classList.toggle('over', s.today.litres > s.ration);
  if (!gulping) {
    pet.dataset.mood = s.mood;
    show(sprites[s.mood]);
  }
}

function bubble(text, duration = 3400) {
  clearTimeout(bubbleTimer);
  $('bubble').textContent = text;
  $('bubble').classList.add('show');
  bubbleTimer = setTimeout(() => $('bubble').classList.remove('show'), duration);
}

function slurp() {
  if (!stats?.settings.sound) return;
  const context = new AudioContext(),
    osc = context.createOscillator(),
    gain = context.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(180, context.currentTime);
  osc.frequency.exponentialRampToValueAtTime(65, context.currentTime + 0.22);
  gain.gain.setValueAtTime(0.05, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.25);
  osc.connect(gain).connect(context.destination);
  osc.start();
  osc.stop(context.currentTime + 0.26);
  osc.onended = () => context.close();
}

const LIGHT_TEXT = ['#111111', '#10A37F', '#1463FF', '#4285F4', '#4D6BFE', '#7B61FF'];
// Water per reply now ranges from about 1 mL (a short chat) to litres (a long agent turn).
function amount(ml) {
  return ml >= 1000 ? (ml / 1000).toFixed(2) + ' L' : ml >= 10 ? Math.round(ml) + ' mL' : ml.toFixed(1) + ' mL';
}
function gulp(n, s, ml) {
  gulping = true;
  pet.dataset.mood = 'sipping';
  show('thirsty-suck');
  pet.classList.remove('gulp', 'idle');
  $('pop').classList.remove('show');
  void pet.offsetWidth;
  pet.classList.add('gulp');
  const color = stats?.bySource?.[s]?.color || '#2EC4FF';
  $('pop').textContent = '+' + amount(ml) + (n > 1 ? ' x' + n : '');
  $('pop').style.background = color;
  $('pop').style.color = LIGHT_TEXT.includes(color) ? '#FFF3D6' : '#111111';
  $('pop').classList.add('show');
  slurp();
  setTimeout(() => {
    gulping = false;
    pet.classList.remove('gulp');
    if (stats) draw(stats);
    flush();
  }, 600);
}
// Agent loops emit several replies a second: at most three gulps a second, the rest
// are counted into the next pop ("+64 mL x5").
function flush() {
  if (!pending || gulping) return;
  const delay = Math.max(0, nextGulp - Date.now());
  setTimeout(() => {
    if (gulping || !pending) return;
    const n = pending, ml = pendingMl;
    pending = 0;
    pendingMl = 0;
    nextGulp = Date.now() + 334;
    gulp(n, source, ml);
  }, delay);
}
function sip(e) {
  // A streamed reply keeps growing after its first sip: its extra water joins the next pop.
  pendingMl += e.ml || 0;
  if (!e.sips) return;
  if (pet.dataset.mood === 'sleeping') {
    show('sticker-12-wave');
    pet.classList.add('wake');
    setTimeout(() => {
      pet.classList.remove('wake');
      pending += e.sips;
      source = e.source;
      flush();
    }, 600);
  } else {
    pending += e.sips;
    source = e.source;
    setTimeout(flush, 100);
  }
}
function badge(e) {
  bubble('UNLOCKED: ' + e.name, 4200);
  confetti(20);
}
function milestone(e) {
  bubble(`${e.name}! Your AI has drunk ${amount(e.litres * 1000)} of water so far.`, 6000);
  confetti(36);
}
function confetti(count) {
  for (let i = 0; i < count; i++) {
    const c = document.createElement('i');
    c.style.cssText = `--x:${Math.cos(i) * 100}px;--y:${50 + Math.sin(i) * 90}px;--r:${i * 87}deg;background:${['#FFD12E', '#35D07F', '#2EC4FF', '#FF4A3D'][i % 4]}`;
    $('confetti').append(c);
    setTimeout(() => c.remove(), 1300);
  }
}

// Idle life in short bursts a few seconds apart instead of a nonstop loop.
function idle() {
  if (!gulping && !document.body.classList.contains('paused')) {
    pet.classList.remove('idle');
    void pet.offsetWidth;
    pet.classList.add('idle');
    setTimeout(() => pet.classList.remove('idle'), 1700);
  }
  setTimeout(idle, 7000 + Math.random() * 5000);
}
setTimeout(idle, 2500);

let pointer;
body.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  pointer = { x: e.screenX, y: e.screenY, moved: false };
  body.setPointerCapture(e.pointerId);
});
body.addEventListener('pointermove', (e) => {
  if (!pointer) return;
  const dx = e.screenX - pointer.x,
    dy = e.screenY - pointer.y;
  if (Math.abs(dx) + Math.abs(dy) > 4) pointer.moved = true;
  if (pointer.moved) window.thirsty.drag(dx, dy);
});
body.addEventListener('pointerup', (e) => {
  if (!pointer) return;
  if (pointer.moved) window.thirsty.drag(e.screenX - pointer.x, e.screenY - pointer.y, true);
  else {
    window.thirsty.poke();
    bubble(quips[Math.floor(Math.random() * quips.length)]);
    body.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.07,.93)' }, { transform: 'scale(1)' }], {
      duration: 320,
      easing: 'cubic-bezier(.34,1.56,.64,1)',
    });
  }
  pointer = null;
});
body.addEventListener('dblclick', () => window.thirsty.dashboard());
addEventListener('contextmenu', (e) => {
  e.preventDefault();
  window.thirsty.menu();
});

window.thirsty.on('stats', draw);
window.thirsty.on('sip', sip);
window.thirsty.on('badge', badge);
window.thirsty.on('milestone', milestone);
window.thirsty.on('toast', (text) => bubble(text, 6000));
window.thirsty.on('progress', (p) => {
  $('loading').textContent = `WAKING UP... ${p.done} / ${p.total}`;
});
window.thirsty.on('visibility', (visible) => document.body.classList.toggle('paused', !visible));
document.fonts.ready.then(() => window.thirsty.stats().then(draw));
setInterval(() => {
  if (stats && Date.now() - stats.lastSip > 1800000) {
    stats.mood = 'sleeping';
    draw(stats);
  }
}, 30000);
// Deterministic capture hook, local renderer only, no external control endpoint.
window.thirstyPreview = { draw, gulp, badge, bubble };
