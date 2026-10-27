// Sternenpups – Oberfläche: Canvas-2D-Himmel, Wolke antippen, Einhorn pupst sich hinauf, Kamera, Menüs, Ton, Speichern.
// Grafik: gezeichnete Platzhalter. Liegt ein Bild aus img/manifest.json vor (ChatGPT-Grafiken), wird stattdessen das Bild gezeichnet.
import { LEVELS, LEVEL_COUNT, WORLDS, worldOf } from './levels.js';
import {
  STORE, COLS, newState, moves, canMove, moveTo, plan, hintMove, starCount,
  freshSave, sanitizeSave, recordWin, runOf, restoreRun, parseChallenge
} from './engine.js';

const $ = (id) => document.getElementById(id);
const app = $('app'), cv = $('game'), ctx = cv.getContext('2d');
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, k) => a + (b - a) * k;
const ease = (k) => k * k * (3 - 2 * k);
const TAU = Math.PI * 2;

// ---------- Bilder (optional) ----------
// Namen: einhorn, einhorn-flug, einhorn-jubel, fee, fee-traurig, elf, wolke-1, wolke-2, wolke-3, ziel, boden, ranke, regenbogen, zauberstab, stern, hintergrund
const IMG = {};
const base = new URL('img/', import.meta.url);
async function loadImages() {
  let list = [];
  try { list = await (await fetch(new URL('manifest.json', base))).json(); } catch { list = []; }
  if (!Array.isArray(list)) list = [];
  await Promise.all(list.map((k) => new Promise((res) => {
    const i = new Image(); i.decoding = 'async';
    i.onload = () => { IMG[k] = i; res(); }; i.onerror = () => res();
    i.src = new URL(k + '.webp', base).href;
  })));
}
// Wo liegt in den Wolkenbildern die Standfläche? (Anteil der Bildhöhe von oben)
const SURF = { 'wolke-1': 0.1, 'wolke-2': 0.1, 'wolke-3': 0.1, ziel: 0.58, boden: 0.05 };
const aspect = (k) => IMG[k].naturalHeight / IMG[k].naturalWidth;

// ---------- Spielstand ----------
let save = freshSave();
try { save = sanitizeSave(JSON.parse(localStorage.getItem(STORE)), LEVEL_COUNT); } catch { /* Privatmodus */ }
const persist = () => { try { localStorage.setItem(STORE, JSON.stringify(save)); } catch { /* gesperrt */ } };
const challenge = parseChallenge(location.search, LEVEL_COUNT);

// ---------- Ton ----------
// Geräusche als Dateien (pups-1…4, funkel, zauber); fehlt eine, wird sie mit WebAudio nachgebaut.
let actx = null, noiseBuf = null, soundsLoading = false;
const BUF = {};
const SOUND_FILES = ['pups-1', 'pups-2', 'pups-3', 'pups-4', 'funkel', 'zauber'];
function unlockAudio() {
  if (save.mute) return;
  try {
    actx ??= new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
    if (!noiseBuf) {
      noiseBuf = actx.createBuffer(1, actx.sampleRate, actx.sampleRate);
      const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (!soundsLoading) { soundsLoading = true; loadSounds(); }
  } catch { actx = null; }
}
async function loadSounds() {
  await Promise.all(SOUND_FILES.map(async (n) => {
    try {
      const r = await fetch(new URL(n + '.mp3', import.meta.url));
      if (!r.ok) return;
      const ab = await r.arrayBuffer();
      BUF[n] = await new Promise((res, rej) => actx.decodeAudioData(ab, res, rej));
    } catch { /* Ersatzton */ }
  }));
}
function playBuf(n, vol, rate = 1) {
  if (save.mute || !actx || !BUF[n]) return false;
  try {
    const s = actx.createBufferSource(), g = actx.createGain();
    s.buffer = BUF[n]; s.playbackRate.value = rate; g.gain.value = vol;
    s.connect(g).connect(actx.destination); s.start();
    return true;
  } catch { return false; }
}
function tone(freq, dur, type = 'sine', vol = 0.1, slide = 0, delay = 0, lp = 0) {
  if (save.mute || !actx) return;
  try {
    const t = actx.currentTime + delay, o = actx.createOscillator(), g = actx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = o.connect(g);
    if (lp) { const f = actx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; node = g.connect(f); }
    node.connect(actx.destination); o.start(t); o.stop(t + dur + 0.05);
  } catch { /* egal */ }
}
function noise(dur, freq, vol, q = 1, delay = 0) {
  if (save.mute || !actx || !noiseBuf) return;
  try {
    const t = actx.currentTime + delay, s = actx.createBufferSource(), f = actx.createBiquadFilter(), g = actx.createGain();
    s.buffer = noiseBuf; f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(actx.destination); s.start(t); s.stop(t + dur + 0.05);
  } catch { /* egal */ }
}
let lastPups = -1;
const SFX = {
  pups: () => {
    let i = Math.floor(Math.random() * 4); if (i === lastPups) i = (i + 1) % 4; lastPups = i;
    if (!playBuf('pups-' + (i + 1), 1.0, 0.95 + Math.random() * 0.15)) { tone(90 + Math.random() * 30, 0.32, 'sawtooth', 0.09, 0.7, 0, 500); noise(0.3, 260, 0.08, 1.5); }
  },
  funkel: () => { if (!playBuf('funkel', 0.5)) [1319, 1568, 2093].forEach((f, i) => tone(f, 0.18, 'triangle', 0.06, 0, i * 0.06)); },
  zauber: () => { if (!playBuf('zauber', 0.55)) [784, 988, 1175, 1568, 1976].forEach((f, i) => tone(f, 0.3, 'sine', 0.06, 0, i * 0.07)); },
  land: () => noise(0.16, 700, 0.05, 0.8),
  nope: () => { tone(330, 0.12, 'triangle', 0.06); tone(262, 0.16, 'triangle', 0.06, 0, 0.12); },
  hm: () => { tone(392, 0.14, 'triangle', 0.05); tone(349, 0.2, 'triangle', 0.05, 0, 0.14); },
  climb: () => { for (let i = 0; i < 3; i++) tone(420 + i * 90, 0.07, 'triangle', 0.04, 0, i * 0.12); },
  rest: () => [659, 784, 1047].forEach((f, i) => tone(f, 0.2, 'triangle', 0.07, 0, i * 0.1)),
  win: () => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.26, 'triangle', 0.1, 0, i * 0.12)),
  click: () => tone(520, 0.06, 'sine', 0.06)
};
const SPEAKER_ON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9z" fill="currentColor"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>';
const SPEAKER_OFF = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9z" fill="currentColor"/><path d="M16.5 9.5l5 5M21.5 9.5l-5 5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>';
function paintMute() {
  document.querySelectorAll('[data-mute]').forEach((b) => {
    b.querySelector('.ico').innerHTML = save.mute ? SPEAKER_OFF : SPEAKER_ON;
    b.setAttribute('aria-pressed', String(!save.mute));
    b.setAttribute('aria-label', save.mute ? 'Ton an' : 'Ton aus');
  });
}
// Hintergrundlied: nur im Spiel (auch auf dem Geschafft-Bildschirm), folgt dem Ton-Knopf
const music = $('music'); music.volume = 0.07;
function musicSync() {
  const want = !save.mute && !document.hidden && (mode === 'play' || mode === 'won');
  if (!want) { music.pause(); return; }
  const p = music.play(); if (p && p.catch) p.catch(() => {});
}
function toggleMute() { save.mute = !save.mute; persist(); if (!save.mute) { unlockAudio(); SFX.click(); } paintMute(); musicSync(); }

// ---------- Farben ----------
const SKY = {
  1: ['#a9d8ff', '#cfe6ff', '#e9dcff'],
  2: ['#9fd6f0', '#c8ecd9', '#e5f3c8'],
  3: ['#b7c8ff', '#e3cdfa', '#ffd3e8'],
  4: ['#8f86d8', '#c3a8f0', '#ffcfe2']
};
const LVL_COL = { 1: '#ffd166', 2: '#9be8b0', 3: '#ffb3d1', 4: '#c9b3ff' };
const MANE = ['#ff9ecf', '#c8a2ff', '#9fd4ff'];
const OUT = 'rgba(110,80,150,.45)';

// ---------- Größe und Kamera ----------
let W = 360, H = 640, dpr = 1, cs = 60, rowH = 87, groundPad = 52, topSafe = 64;
let cam = 0;
function resize() {
  W = app.clientWidth; H = app.clientHeight; dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  cv.style.width = W + 'px'; cv.style.height = H + 'px';
  const hud = $('hud').getBoundingClientRect(), ar = app.getBoundingClientRect();
  topSafe = Math.max(hud.bottom - ar.top + 6, 60);
  cs = W / COLS;
  rowH = Math.round(Math.min(cs * 1.45, (H - topSafe) / 5.2));
  groundPad = Math.round(rowH * 0.62);
  if (st) cam = camTargetFor(U.y);
}
const colX = (c) => (c + 0.5) * cs;                 // Spaltenmitte
const floorY = (f) => f * rowH;                      // Welt: Höhe der Standfläche (nach oben positiv)
const scrY = (wy) => H - groundPad - (wy - cam);     // Welt → Bildschirm
function camMax() { if (!L) return 0; return Math.max(0, floorY(L.rows - 1) - (H - groundPad - topSafe - rowH * 1.35)); }
function camTargetFor(wy) { return clamp(wy - (H - groundPad - H * 0.66), 0, camMax()); }

// ---------- Zustand ----------
let mode = 'menu';           // menu | play | pause | won
let levelNo = 1, lv = null, st = null, L = null, clock = 0, idle = 0, tipT = 0, hudCache = '';
let particles = [], vis = null, flashReach = 0, fairyBubble = 0, cheer = 0;
const U = { x: 0, y: 0, face: 1, pose: 'stand', sq: 0, plat: 0, walk: 0 };

// ---------- Ablaufplan (Animationen nacheinander) ----------
let queue = [], cur = null;
function run(a) { queue.push(a); }
const call = (fn) => run({ dur: 0, end: fn });
const wait = (d) => run({ dur: d });
function tickActions(dt) {
  let guard = 0;
  while (guard++ < 20) {
    if (!cur && queue.length) { cur = queue.shift(); cur.t = 0; cur.start && cur.start(); }
    if (!cur) return;
    cur.t += dt; dt = 0;
    const k = cur.dur ? clamp(cur.t / cur.dur, 0, 1) : 1;
    cur.update && cur.update(k);
    if (k < 1) return;
    const done = cur; cur = null; done.end && done.end();
  }
}
const busy = () => !!cur || queue.length > 0;
const camSettled = () => Math.abs(camTargetFor(U.y) - cam) < rowH * 0.15;
const canTap = () => mode === 'play' && !busy() && camSettled() && !st.done;

// ---------- Level starten ----------
function startLevel(n, fresh = false) {
  levelNo = clamp(n, 1, LEVEL_COUNT); lv = LEVELS[levelNo - 1];
  st = fresh || !save.run || save.run.l !== levelNo ? newState(lv) : restoreRun(lv, save.run);
  if (fresh && save.run && save.run.l === levelNo) { save.run = null; persist(); }
  L = st.L;
  queue = []; cur = null; particles = []; idle = 0; tipT = 0; hudCache = ''; flashReach = 0; fairyBubble = 0; cheer = 0;
  vis = {
    stars: st.stars.map((s) => !s), ghost: st.fairyHelped ? 1 : 0, wand: st.fairyHelped ? 'fairy' : st.wand ? 'horn' : 'cloud',
    elves: st.elves.map((e) => (e ? 1 : 0)), rainbows: st.rainbows.map((r) => (r ? 1 : 0)), rests: st.rests.slice(),
    bounce: {}, wobble: {}, elfJoy: L.elves.map(() => 0), fairyJoy: 0
  };
  const p = L.plats[st.plat];
  U.x = colX(st.col); U.y = floorY(p.floor); U.face = st.col >= COLS / 2 ? -1 : 1; U.pose = 'stand'; U.sq = 0; U.plat = st.plat;
  const w = worldOf(levelNo).id;
  document.body.style.background = SKY[w][1]; app.style.background = SKY[w][1];
  $('tipIcon').textContent = lv.tip.icon; $('tipText').textContent = lv.tip.text;
  $('tipLevel').textContent = `Level ${levelNo} · ${lv.title}`;
  $('tip').classList.remove('away');
  resize(); cam = camTargetFor(U.y);
  updateHud(); setMode('play');
}

// ---------- Eingabe ----------
function pos(e) { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
const bobOf = (p) => (p.kind === 'ground' ? 0 : Math.sin(clock * 1.6 + p.i * 1.3) * cs * 0.022);
function surfScr(p) { return scrY(floorY(p.floor)) + bobOf(p); }
// Welche Wolke ist gemeint? Große Tippflächen; erreichbare Wolken gewinnen, dann die nächste.
function platAt(x, y) {
  let best = null, bd = Infinity;
  for (const p of L.plats) {
    const ys = surfScr(p);
    let x0 = p.a * cs - cs * 0.35, x1 = (p.b + 1) * cs + cs * 0.35, y0 = ys - rowH * (p.i === L.goal ? 1.35 : 0.85), y1 = ys + rowH * 0.42;
    if (p.kind === 'ground') { x0 = 0; x1 = W; y0 = ys - rowH * 0.55; y1 = H; }
    if (x < x0 || x > x1 || y < y0 || y > y1) continue;
    const reach = p.i !== st.plat && canMove(st, p.i) ? 0 : 1;
    const d = reach * 1e6 + Math.hypot(clamp(x, p.a * cs, (p.b + 1) * cs) - x, ys - rowH * 0.25 - y);
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}
cv.addEventListener('pointerdown', (e) => {
  unlockAudio();
  if (mode !== 'play') return;
  e.preventDefault();
  if (!canTap()) return;              // während Flug, Zauber oder Kamerafahrt: nichts annehmen (kein Ketten-Springen)
  const pt = pos(e), p = platAt(pt.x, pt.y);
  if (!p) return;
  idle = 0; if (tipT > 0.6) hideTip();
  if (p.i === st.plat) {
    if (L.fairy === p.i && !st.fairyHelped) { fairyBubble = 2.4; SFX.hm(); }
    return;
  }
  const res = moveTo(st, p.i);
  if (!res) { vis.wobble[p.i] = 1; flashReach = 1.4; SFX.nope(); return; }
  hideTip();
  save.run = st.done ? null : runOf(st); persist();
  animateMove(res);
});
cv.addEventListener('contextmenu', (e) => e.preventDefault());
function hideTip() { $('tip').classList.add('away'); }

// ---------- Bewegungen abspielen ----------
function animateMove(res) {
  const from = L.plats[res.from], to = L.plats[res.move.plat];
  const y0 = floorY(from.floor), y1 = floorY(to.floor), x1 = colX(res.col);
  const via = res.move.via;
  if (via === 'pup') {
    const x0 = U.x;
    let face = Math.sign(x1 - x0) || U.face;
    run({ dur: 0.17, start: () => { U.face = face; U.pose = 'crouch'; }, update: (k) => { U.sq = Math.sin(k * Math.PI / 2) * 0.22; } });
    const up = y1 - y0, dist = Math.hypot(x1 - x0, up);
    const arc = up > 0 ? rowH * 0.5 : up < 0 ? rowH * 0.3 : rowH * 0.42;
    const dur = 0.5 + dist / (cs * 9);
    let trail = 0;
    run({ dur, start: () => { U.pose = 'fly'; U.sq = -0.12; SFX.pups(); pupPuff(x0 - U.face * cs * 0.34, y0 + cs * 0.3, 1); U.plat = -1; },
      update: (k) => {
        U.x = lerp(x0, x1, ease(k * 0.85 + 0.15 * k * k)); U.y = lerp(y0, y1, k) + arc * 4 * k * (1 - k);
        U.sq = lerp(-0.12, 0, k);
        trail += 1; if (trail % 2 === 0 && k < 0.8) spark(U.x - U.face * cs * 0.3, U.y + cs * 0.3, 1);
      },
      end: () => { U.x = x1; U.y = y1; } });
    landing(to);
  } else if (via === 'vine') {
    const v = L.vines[res.move.ref], vx = colX(v.col), up = y1 > y0;
    walkTo(vx);
    run({ dur: 0.42 * Math.abs(to.floor - from.floor), start: () => { U.pose = 'climb'; U.face = 1; U.plat = -1; SFX.climb(); },
      update: (k) => { U.x = vx + Math.sin(k * 18) * cs * 0.03; U.y = lerp(y0, y1, ease(k)); U.walk = k * 8; },
      end: () => { U.x = vx; U.y = y1; U.pose = 'stand'; } });
    if (!up) { /* herunter: gleich stehen */ }
    landing(to, true);
  } else {
    const rb = L.rainbows[res.move.ref], fromCol = rb.a === res.from ? rb.colA : rb.colB;
    const xa = colX(fromCol), xb = x1, arcH = rowH * 0.7;
    walkTo(xa);
    let trail = 0;
    run({ dur: 0.35 + Math.abs(xb - xa) / (cs * 3.2), start: () => { U.face = Math.sign(xb - xa) || 1; U.pose = 'stand'; U.plat = -1; SFX.climb(); },
      update: (k) => { const e = ease(k); U.x = lerp(xa, xb, e); U.y = y0 + Math.sin(e * Math.PI) * arcH; U.walk = k * 10; if (++trail % 3 === 0) spark(U.x, U.y + cs * 0.1, 1); },
      end: () => { U.x = xb; U.y = y1; } });
    landing(to, true);
  }
  for (const ev of res.events) playEvent(ev, to);
  call(() => { updateHud(); idle = 0; });
}
function walkTo(x) {
  let x0 = 0;
  run({ dur: 0.22, start: () => { x0 = U.x; if (Math.abs(x - x0) > 1) U.face = Math.sign(x - x0); }, update: (k) => { U.x = lerp(x0, x, ease(k)); U.walk = k * 4; } });
}
function landing(to, soft = false) {
  run({ dur: soft ? 0.12 : 0.2, start: () => { U.pose = 'stand'; U.plat = to.i; vis.bounce[to.i] = 1; if (!soft) { SFX.land(); pupPuff(U.x, U.y + cs * 0.05, 0.45); } },
    update: (k) => { U.sq = soft ? 0 : Math.sin(k * Math.PI) * 0.18; }, end: () => { U.sq = 0; } });
}
function playEvent(ev, to) {
  const ys = floorY(to.floor);
  if (ev.type === 'star') {
    const sx0 = colX(ev.col), sy0 = ys + rowH * 0.5;
    run({ dur: 0.42, start: () => { vis.stars[ev.i] = false; vis.flyStar = { x: sx0, y: sy0 }; },
      update: (k) => { const e = ease(k); vis.flyStar = { x: lerp(sx0, U.x, e), y: lerp(sy0, U.y + cs * 0.6, e) + Math.sin(k * Math.PI) * cs * 0.4, s: 1 - k * 0.5 }; },
      end: () => { vis.flyStar = null; SFX.funkel(); burst(U.x, U.y + cs * 0.6, 12, '#ffd21c'); updateHud(); } });
  } else if (ev.type === 'wand') {
    const wx = colX(ev.col);
    run({ dur: 0.45, start: () => { vis.wand = 'fly'; vis.wandPos = { x: wx, y: ys }; },
      update: (k) => { const e = ease(k); vis.wandPos = { x: lerp(wx, hornX(), e), y: lerp(ys + cs * 0.1, hornY(), e) + Math.sin(k * Math.PI) * cs * 0.5, r: k * TAU }; },
      end: () => { vis.wand = 'horn'; SFX.funkel(); burst(hornX(), hornY(), 8, '#fff6b0'); } });
  } else if (ev.type === 'fairyWaits') {
    call(() => { fairyBubble = 2.6; SFX.hm(); });
  } else if (ev.type === 'fairy') {
    const fx = colX(ev.col);
    run({ dur: 0.18, start: () => { U.face = Math.sign(fx - U.x) || U.face; } });
    run({ dur: 0.55, start: () => { vis.wand = 'fly'; },
      update: (k) => { const e = ease(k); vis.wandPos = { x: lerp(hornX(), fx + cs * 0.12, e), y: lerp(hornY(), ys + cs * 0.75, e) + Math.sin(k * Math.PI) * cs * 0.4, r: k * TAU }; },
      end: () => { vis.wand = 'fairy'; vis.fairyJoy = 2; SFX.zauber(); burst(fx, ys + cs * 0.8, 18, '#ffd6f5'); } });
    run({ dur: 0.8, start: () => { for (const g of ev.ghosts) { const q = L.plats[g]; for (let c = q.a; c <= q.b; c++) pupPuff(colX(c), floorY(q.floor), 0.6); } },
      update: (k) => { vis.ghost = ease(k); } });
  } else if (ev.type === 'elf') {
    const e = L.elves[ev.i], v = L.vines[e.vine], vx = colX(v.col);
    const top = floorY(L.plats[v.up].floor);
    run({ dur: 0.2, start: () => { U.face = U.x < vx ? -1 : 1; U.pose = 'crouch'; }, update: (k) => { U.sq = k * 0.2; } });   // Po zur Ranke
    run({ dur: 0.2, start: () => { U.pose = 'fly'; SFX.pups(); pupPuff(vx, ys + cs * 0.25, 0.9); }, update: (k) => { U.sq = -0.1 * (1 - k); U.y = ys + Math.sin(k * Math.PI) * cs * 0.12; }, end: () => { U.pose = 'stand'; U.sq = 0; U.y = ys; } });
    run({ dur: 1.1, start: () => SFX.zauber(), update: (k) => { vis.elves[ev.i] = ease(k); if (Math.random() < 0.5) spark(vx + (Math.random() - 0.5) * cs * 0.4, lerp(ys, top, ease(k)), 1); },
      end: () => { vis.elfJoy[ev.i] = 2; } });
  } else if (ev.type === 'rainbow') {
    const rb = L.rainbows[ev.i], mine = rb.a === to.i ? rb.colA : rb.colB, other = rb.a === to.i ? rb.colB : rb.colA;
    const rx = colX(mine);
    run({ dur: 0.2, start: () => { U.face = other > mine ? -1 : 1; U.pose = 'crouch'; }, update: (k) => { U.sq = k * 0.2; } });   // Po zum Regenbogen
    run({ dur: 0.2, start: () => { U.pose = 'fly'; SFX.pups(); pupPuff(rx + (other > mine ? 1 : -1) * cs * 0.3, ys + cs * 0.3, 1); }, update: (k) => { U.y = ys + Math.sin(k * Math.PI) * cs * 0.12; }, end: () => { U.pose = 'stand'; U.sq = 0; U.y = ys; } });
    run({ dur: 1.0, start: () => SFX.zauber(), update: (k) => { vis.rainbows[ev.i] = ease(k); } });
  } else if (ev.type === 'rest') {
    run({ dur: 0.6, start: () => { vis.rests[ev.i] = true; SFX.rest(); burst(colX(ev.col), ys + rowH * 0.6, 14, '#ffe27a'); U.pose = 'cheer'; },
      update: (k) => { U.y = ys + Math.abs(Math.sin(k * Math.PI * 2)) * cs * 0.18; }, end: () => { U.y = ys; U.pose = 'stand'; } });
  } else if (ev.type === 'goal') {
    run({ dur: 1.5, start: () => { SFX.win(); U.pose = 'cheer'; cheer = 1; for (let i = 0; i < 40; i++) confetti(); },
      update: (k) => { U.y = ys + Math.abs(Math.sin(k * Math.PI * 3)) * cs * 0.25; if (Math.random() < 0.5) confetti(); },
      end: () => { U.y = ys; win(); } });
  }
}
const hornX = () => U.x + U.face * cs * 0.36;
const hornY = () => U.y + cs * 0.95;

// ---------- Teilchen ----------
const PUFF = ['#ffd1ec', '#e2cbff', '#c9e6ff', '#fff3b8', '#d4f7e3'];
function pupPuff(x, wy, n) {
  for (let i = 0; i < 9 * n; i++) {
    const a = Math.random() * TAU, s = (20 + Math.random() * 60) * (0.6 + n * 0.4);
    particles.push({ kind: 'puff', x, y: wy, vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.6 + 10, g: 0, r: cs * (0.08 + Math.random() * 0.1) * (0.6 + n * 0.5), grow: cs * 0.25, life: 0.7, max: 0.7, c: PUFF[i % PUFF.length] });
  }
  for (let i = 0; i < 6 * n; i++) spark(x, wy, 1);
}
function spark(x, wy, n) {
  for (let i = 0; i < n; i++) { const a = Math.random() * TAU, s = 20 + Math.random() * 50; particles.push({ kind: 'star', x: x + (Math.random() - 0.5) * cs * 0.2, y: wy, vx: Math.cos(a) * s, vy: Math.sin(a) * s, g: -20, r: 2 + Math.random() * 3, life: 0.8, max: 0.8, c: PUFF[(Math.random() * PUFF.length) | 0], rot: Math.random() * 6 }); }
}
function burst(x, wy, n, col) {
  for (let i = 0; i < n; i++) { const a = Math.random() * TAU, s = 60 + Math.random() * 90; particles.push({ kind: 'star', x, y: wy, vx: Math.cos(a) * s, vy: Math.sin(a) * s + 40, g: -150, r: 3 + Math.random() * 3, life: 0.9, max: 0.9, c: col, rot: Math.random() * 6 }); }
}
const CONF = ['#FFD21C', '#FF9200', '#9fd4ff', '#ffffff', '#ff9ecf', '#c8a2ff'];
function confetti() { particles.push({ kind: 'conf', screen: true, x: Math.random() * W, y: -10, vx: (Math.random() - 0.5) * 60, vy: 80 + Math.random() * 80, g: 40, r: 4 + Math.random() * 3, life: 3, max: 3, rot: Math.random() * 6, c: CONF[(Math.random() * CONF.length) | 0] }); }

// ---------- Zeichnen: Grundformen ----------
function star(X, x, y, R, r) { X.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r : R; X.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } X.closePath(); }
function blob(X, x, y, rx, ry, fill, stroke, lw = 0, rot = 0) { X.fillStyle = fill; X.beginPath(); X.ellipse(x, y, rx, ry, rot, 0, TAU); X.fill(); if (lw) { X.strokeStyle = stroke; X.lineWidth = lw; X.stroke(); } }
function heart(X, x, y, s) { X.beginPath(); X.moveTo(x, y + s * 0.9); X.bezierCurveTo(x - s * 1.6, y - s * 0.1, x - s * 0.6, y - s * 1.2, x, y - s * 0.35); X.bezierCurveTo(x + s * 0.6, y - s * 1.2, x + s * 1.6, y - s * 0.1, x, y + s * 0.9); X.fill(); }
function eye(X, x, y, r, blink) {
  if (blink) { X.strokeStyle = '#3a2a4a'; X.lineWidth = r * 0.6; X.lineCap = 'round'; X.beginPath(); X.arc(x, y - r * 0.2, r * 0.9, 0.15 * Math.PI, 0.85 * Math.PI); X.stroke(); return; }
  blob(X, x, y, r, r * 1.15, '#3a2a4a');
  blob(X, x - r * 0.3, y - r * 0.4, r * 0.38, r * 0.38, '#fff');
  blob(X, x + r * 0.3, y + r * 0.35, r * 0.16, r * 0.16, '#fff');
}
function goldStar(X, x, y, s, a = 1) {
  X.save(); X.globalAlpha *= a;
  X.fillStyle = 'rgba(255,230,120,.35)'; X.beginPath(); X.arc(x, y, s * 0.75, 0, TAU); X.fill();
  if (IMG.stern) { X.drawImage(IMG.stern, x - s / 2, y - s / 2, s, s); X.restore(); return; }
  X.fillStyle = '#ffcf33'; X.strokeStyle = '#e09a12'; X.lineWidth = s * 0.06; X.lineJoin = 'round';
  star(X, x, y, s * 0.5, s * 0.24); X.fill(); X.stroke();
  X.fillStyle = 'rgba(255,255,255,.6)'; star(X, x - s * 0.06, y - s * 0.08, s * 0.2, s * 0.09); X.fill();
  X.restore();
}

// Einhorn (Füße auf (x, y), Größe s ≈ Breite), Blick nach rechts; face -1 spiegelt
function drawUnicorn(X, x, y, s, o = {}) {
  const face = o.face || 1, sq = o.sq || 0, pose = o.pose || 'stand';
  X.save(); X.translate(x, y); X.scale(face * (1 + sq * 0.6), 1 - sq);
  const k = pose === 'cheer' && IMG['einhorn-jubel'] ? 'einhorn-jubel' : pose === 'fly' && IMG['einhorn-flug'] ? 'einhorn-flug' : 'einhorn';
  if (IMG[k]) {
    const h = s * (k === 'einhorn' ? 1.0 : 1.05), w = h / aspect(k);
    X.drawImage(IMG[k], -w / 2, -h, w, h);
    X.restore(); return;
  }
  const lw = s * 0.022, legBend = pose === 'fly' ? 1 : 0, bob = pose === 'climb' ? Math.sin((o.walk || 0) * 3) * s * 0.02 : 0;
  X.lineJoin = 'round'; X.lineCap = 'round';
  // Schweif
  for (let i = 0; i < 3; i++) blob(X, -s * 0.42 - i * s * 0.05, -s * 0.42 + i * s * 0.08 + (pose === 'fly' ? -s * 0.06 : 0), s * 0.12, s * 0.07, MANE[i], OUT, lw * 0.6, -0.6 + i * 0.4);
  // Beine
  X.strokeStyle = '#f3e7f6'; X.lineWidth = s * 0.11;
  for (const [lx, ph] of [[-0.24, 0], [-0.1, 1], [0.12, 1], [0.26, 0]]) {
    X.beginPath(); X.moveTo(lx * s, -s * 0.3);
    if (legBend) X.lineTo(lx * s + s * 0.08 * (lx < 0 ? -1 : 1), -s * 0.14); else X.lineTo(lx * s + Math.sin((o.walk || 0) * 6 + ph * 3) * s * 0.02, -s * 0.05);
    X.stroke();
  }
  X.fillStyle = '#b48ad8';
  for (const lx of [-0.24, -0.1, 0.12, 0.26]) { if (!legBend) { X.beginPath(); X.ellipse(lx * s, -s * 0.03, s * 0.06, s * 0.035, 0, 0, TAU); X.fill(); } }
  // Körper
  blob(X, 0, -s * 0.4 + bob, s * 0.38, s * 0.24, '#fffaf6', OUT, lw);
  X.fillStyle = '#ff8fbf'; heart(X, -s * 0.18, -s * 0.42 + bob, s * 0.05);
  // Kopf
  blob(X, s * 0.3, -s * 0.72 + bob, s * 0.24, s * 0.22, '#fffaf6', OUT, lw);
  blob(X, s * 0.46, -s * 0.64 + bob, s * 0.13, s * 0.1, '#ffe9f2', OUT, lw);
  blob(X, s * 0.5, -s * 0.66 + bob, s * 0.018, s * 0.012, '#d58aa8');
  // Horn
  X.fillStyle = '#ffd34d'; X.strokeStyle = '#d99a1a'; X.lineWidth = lw;
  X.beginPath(); X.moveTo(s * 0.3, -s * 0.9 + bob); X.lineTo(s * 0.4, -s * 1.12 + bob); X.lineTo(s * 0.42, -s * 0.88 + bob); X.closePath(); X.fill(); X.stroke();
  // Ohr
  X.fillStyle = '#fffaf6'; X.strokeStyle = OUT; X.beginPath(); X.moveTo(s * 0.17, -s * 0.86 + bob); X.lineTo(s * 0.2, -s * 1.02 + bob); X.lineTo(s * 0.27, -s * 0.88 + bob); X.closePath(); X.fill(); X.stroke();
  // Mähne
  for (let i = 0; i < 4; i++) blob(X, s * (0.18 - i * 0.07), -s * (0.86 - i * 0.07) + bob, s * 0.1, s * 0.08, MANE[i % 3], OUT, lw * 0.6);
  // Auge, Wange, Lächeln
  eye(X, s * 0.36, -s * 0.75 + bob, s * 0.045, o.blink);
  blob(X, s * 0.38, -s * 0.66 + bob, s * 0.04, s * 0.025, 'rgba(255,130,170,.4)');
  X.strokeStyle = '#7a4a6a'; X.lineWidth = lw; X.beginPath(); X.arc(s * 0.45, -s * 0.62 + bob, s * 0.04, 0.1 * Math.PI, 0.8 * Math.PI); X.stroke();
  X.restore();
}

// Fee (Füße auf (x, y)); happy = hat ihren Stab
function drawFairy(X, x, y, s, happy, t) {
  const k = happy ? 'fee' : 'fee-traurig', hover = Math.sin(t * 2.4) * s * 0.04;
  if (IMG[k]) { const h = s, w = h / aspect(k); X.drawImage(IMG[k], x - w / 2, y - h + hover, w, h); return; }
  X.save(); X.translate(x, y + hover);
  const wing = 0.85 + Math.sin(t * 14) * 0.15;
  X.fillStyle = 'rgba(200,235,255,.75)'; X.strokeStyle = 'rgba(140,160,220,.6)'; X.lineWidth = s * 0.015;
  for (const sx of [-1, 1]) { X.beginPath(); X.ellipse(sx * s * 0.2 * wing, -s * 0.6, s * 0.2 * wing, s * 0.12, sx * 0.5, 0, TAU); X.fill(); X.stroke(); }
  X.fillStyle = '#9be0a8'; X.beginPath(); X.moveTo(-s * 0.16, -s * 0.12); X.lineTo(s * 0.16, -s * 0.12); X.lineTo(s * 0.08, -s * 0.5); X.lineTo(-s * 0.08, -s * 0.5); X.closePath(); X.fill();
  X.strokeStyle = '#f6d2b8'; X.lineWidth = s * 0.05; X.beginPath(); X.moveTo(-s * 0.05, -s * 0.12); X.lineTo(-s * 0.05, 0); X.moveTo(s * 0.05, -s * 0.12); X.lineTo(s * 0.05, 0); X.stroke();
  blob(X, 0, -s * 0.66, s * 0.15, s * 0.15, '#ffe1cc', OUT, s * 0.012);
  blob(X, 0, -s * 0.78, s * 0.16, s * 0.08, '#ffd25e');
  blob(X, s * 0.13, -s * 0.74, s * 0.06, s * 0.08, '#ffd25e');
  eye(X, -s * 0.05, -s * 0.66, s * 0.022, false); eye(X, s * 0.05, -s * 0.66, s * 0.022, false);
  X.strokeStyle = '#7a4a4a'; X.lineWidth = s * 0.015; X.beginPath();
  if (happy) X.arc(0, -s * 0.6, s * 0.035, 0.1 * Math.PI, 0.9 * Math.PI); else X.arc(0, -s * 0.56, s * 0.035, 1.15 * Math.PI, 1.85 * Math.PI);
  X.stroke();
  if (happy) { X.strokeStyle = '#c9a56a'; X.lineWidth = s * 0.025; X.beginPath(); X.moveTo(s * 0.15, -s * 0.4); X.lineTo(s * 0.3, -s * 0.68); X.stroke(); X.fillStyle = '#ffd21c'; star(X, s * 0.31, -s * 0.71, s * 0.07, s * 0.035); X.fill(); }
  X.restore();
}
function drawElf(X, x, y, s, joy, t) {
  const hop = joy > 0 ? Math.abs(Math.sin(t * 8)) * s * 0.08 : 0;
  if (IMG.elf) { const h = s, w = h / aspect('elf'); X.drawImage(IMG.elf, x - w / 2, y - h - hop, w, h); return; }
  X.save(); X.translate(x, y - hop);
  X.fillStyle = '#7cc46a'; X.beginPath(); X.moveTo(-s * 0.15, -s * 0.1); X.lineTo(s * 0.15, -s * 0.1); X.lineTo(s * 0.12, -s * 0.45); X.lineTo(-s * 0.12, -s * 0.45); X.closePath(); X.fill();
  X.strokeStyle = '#5a8a3a'; X.lineWidth = s * 0.06; X.beginPath(); X.moveTo(-s * 0.06, -s * 0.1); X.lineTo(-s * 0.06, 0); X.moveTo(s * 0.06, -s * 0.1); X.lineTo(s * 0.06, 0); X.stroke();
  blob(X, 0, -s * 0.58, s * 0.16, s * 0.15, '#ffd9bf', OUT, s * 0.012);
  for (const sx of [-1, 1]) { X.fillStyle = '#ffd9bf'; X.beginPath(); X.moveTo(sx * s * 0.13, -s * 0.62); X.lineTo(sx * s * 0.27, -s * 0.7); X.lineTo(sx * s * 0.14, -s * 0.54); X.closePath(); X.fill(); }
  X.fillStyle = '#4caf50'; X.beginPath(); X.moveTo(-s * 0.17, -s * 0.66); X.quadraticCurveTo(0, -s * 0.95, s * 0.2, -s * 0.98); X.quadraticCurveTo(s * 0.08, -s * 0.8, s * 0.17, -s * 0.66); X.closePath(); X.fill();
  eye(X, -s * 0.055, -s * 0.58, s * 0.022, false); eye(X, s * 0.055, -s * 0.58, s * 0.022, false);
  X.strokeStyle = '#7a4a4a'; X.lineWidth = s * 0.015; X.beginPath(); X.arc(0, -s * 0.52, s * 0.035, 0.1 * Math.PI, 0.9 * Math.PI); X.stroke();
  X.restore();
}
function drawWand(X, x, y, s, rot) {
  X.save(); X.translate(x, y); X.rotate(rot);
  if (IMG.zauberstab) { const w = s, h = w * aspect('zauberstab'); X.drawImage(IMG.zauberstab, -w / 2, -h / 2, w, h); X.restore(); return; }
  X.strokeStyle = '#b5864a'; X.lineWidth = s * 0.09; X.lineCap = 'round'; X.beginPath(); X.moveTo(-s * 0.4, 0); X.lineTo(s * 0.2, 0); X.stroke();
  X.fillStyle = '#ffd21c'; X.strokeStyle = '#d9a012'; X.lineWidth = s * 0.03; star(X, s * 0.32, 0, s * 0.2, s * 0.09); X.fill(); X.stroke();
  X.restore();
}

// Wolke: Standfläche bei ys (Bildschirm), von Spalte a bis b
function drawCloud(X, p, ys, alpha) {
  const len = p.b - p.a + 1, x0 = p.a * cs, w = len * cs;
  X.save(); X.globalAlpha *= alpha;
  const isGoal = p.i === L.goal;
  const key = isGoal && IMG.ziel ? 'ziel' : IMG['wolke-' + Math.min(3, len)] ? 'wolke-' + Math.min(3, len) : null;
  if (key) {
    const dw = w + cs * (isGoal ? 0.6 : 0.3), dh = dw * aspect(key);
    X.drawImage(IMG[key], x0 + w / 2 - dw / 2, ys - dh * SURF[key], dw, dh);
    X.restore(); return;
  }
  const cx = x0 + w / 2, rx = w / 2 + cs * 0.1, top = ys, bot = ys + rowH * 0.34;
  // Unterseite
  X.fillStyle = '#e4d8f7';
  X.beginPath(); X.ellipse(cx, top + rowH * 0.06, rx, rowH * 0.1, 0, 0, TAU); X.fill();
  const n = Math.max(2, len * 2);
  for (let i = 0; i < n; i++) { const bx = x0 + (i + 0.5) * w / n; blob(X, bx, top + rowH * 0.16 + (i % 2) * rowH * 0.04, w / n * 0.75, (bot - top) * 0.5, '#efe6fb'); }
  // Oberseite (flach, gut erkennbar)
  blob(X, cx, top + rowH * 0.02, rx * 0.98, rowH * 0.13, '#ffffff');
  for (let i = 0; i < len + 1; i++) blob(X, x0 + i * w / len, top - rowH * 0.01, cs * 0.2, rowH * 0.09, '#ffffff');
  X.fillStyle = 'rgba(255,214,235,.45)'; X.beginPath(); X.ellipse(cx, top + rowH * 0.03, rx * 0.8, rowH * 0.05, 0, 0, TAU); X.fill();
  if (isGoal) drawCastle(X, cx, top, w);
  X.restore();
}
function drawGhostOutline(X, p, ys, k) {
  const x0 = p.a * cs, w = (p.b - p.a + 1) * cs;
  X.save(); X.setLineDash([cs * 0.1, cs * 0.08]); X.lineDashOffset = -clock * cs * 0.3;
  X.strokeStyle = `rgba(255,255,255,${0.85 * (1 - k)})`; X.lineWidth = Math.max(2, cs * 0.04);
  X.beginPath(); X.ellipse(x0 + w / 2, ys + rowH * 0.08, w / 2 + cs * 0.08, rowH * 0.2, 0, 0, TAU); X.stroke();
  X.restore();
}
function drawCastle(X, cx, top, w) {
  const s = Math.min(w, cs * 2.4), y = top + rowH * 0.02;
  X.save();
  X.fillStyle = '#fbe6f3'; X.strokeStyle = OUT; X.lineWidth = s * 0.012;
  const tw = s * 0.16;
  for (const [dx, h] of [[-0.32, 0.62], [0.32, 0.62], [0, 0.86]]) {
    X.fillStyle = dx ? '#f6dcf3' : '#fff0fa'; X.fillRect(cx + dx * s - tw / 2, y - h * s * 0.75, tw, h * s * 0.75); X.strokeRect(cx + dx * s - tw / 2, y - h * s * 0.75, tw, h * s * 0.75);
    X.fillStyle = '#b48ad8'; X.beginPath(); X.moveTo(cx + dx * s - tw * 0.65, y - h * s * 0.75); X.lineTo(cx + dx * s, y - h * s * 0.75 - s * 0.2); X.lineTo(cx + dx * s + tw * 0.65, y - h * s * 0.75); X.closePath(); X.fill();
    X.fillStyle = '#ffd21c'; star(X, cx + dx * s, y - h * s * 0.75 - s * 0.23, s * 0.035, s * 0.016); X.fill();
  }
  X.fillStyle = '#fff6fb'; X.fillRect(cx - s * 0.3, y - s * 0.32, s * 0.6, s * 0.32); X.strokeRect(cx - s * 0.3, y - s * 0.32, s * 0.6, s * 0.32);
  X.fillStyle = '#c99adf'; X.beginPath(); X.moveTo(cx - s * 0.07, y); X.lineTo(cx - s * 0.07, y - s * 0.12); X.arc(cx, y - s * 0.12, s * 0.07, Math.PI, 0); X.lineTo(cx + s * 0.07, y); X.closePath(); X.fill();
  X.restore();
}
function drawGround(X, ys) {
  if (IMG.boden) { const dw = W + cs * 0.4, dh = dw * aspect('boden'); X.drawImage(IMG.boden, -cs * 0.2, ys - dh * SURF.boden, dw, dh); if (ys - dh * SURF.boden + dh < H) { X.fillStyle = '#86cf6a'; X.fillRect(0, ys - dh * SURF.boden + dh - 1, W, H); } return; }
  X.fillStyle = '#9edc7c'; X.beginPath(); X.moveTo(0, ys + 4);
  for (let i = 0; i <= 12; i++) X.lineTo(i * W / 12, ys + Math.sin(i * 1.7) * 3);
  X.lineTo(W, H + 5); X.lineTo(0, H + 5); X.closePath(); X.fill();
  X.fillStyle = '#86cf6a'; X.fillRect(0, ys + rowH * 0.3, W, H);
  for (let i = 0; i < 9; i++) {
    const fx = (i + 0.4) * W / 9, fy = ys + rowH * (0.12 + (i % 3) * 0.08);
    X.strokeStyle = '#5fae4c'; X.lineWidth = 2; X.beginPath(); X.moveTo(fx, fy + 8); X.lineTo(fx, fy); X.stroke();
    X.fillStyle = ['#ff9ecf', '#fff', '#c8a2ff', '#ffd84d'][i % 4]; for (let j = 0; j < 5; j++) { const a = j / 5 * TAU; X.beginPath(); X.arc(fx + Math.cos(a) * 3.5, fy + Math.sin(a) * 3.5, 2.6, 0, TAU); X.fill(); }
    X.fillStyle = '#ffd21c'; X.beginPath(); X.arc(fx, fy, 2, 0, TAU); X.fill();
  }
}
function drawVine(X, x, yb, yt, k, glow) {
  if (k <= 0) return;
  const yk = lerp(yb, yt, k);
  if (IMG.ranke) {
    const w = cs * 0.62, full = yb - yt, h = yb - yk, ih = IMG.ranke.naturalHeight;
    X.drawImage(IMG.ranke, 0, ih * (1 - h / full), IMG.ranke.naturalWidth, ih * h / full, x - w / 2, yk, w, h);
  } else {
    X.strokeStyle = '#5aa64a'; X.lineWidth = cs * 0.09; X.lineCap = 'round';
    X.beginPath(); X.moveTo(x, yb); for (let y = yb; y >= yk; y -= 6) X.lineTo(x + Math.sin(y * 0.06) * cs * 0.06, y); X.stroke();
    for (let y = yb - cs * 0.2; y > yk; y -= cs * 0.32) { const sd = Math.round(y / (cs * 0.32)) % 2 ? 1 : -1; blob(X, x + sd * cs * 0.11, y, cs * 0.1, cs * 0.05, '#7fd36a', null, 0, sd * 0.5); }
    for (let y = yb - cs * 0.5; y > yk; y -= cs * 0.9) { X.fillStyle = '#fff'; X.beginPath(); X.arc(x - cs * 0.04, y, cs * 0.05, 0, TAU); X.fill(); X.fillStyle = '#ffd21c'; X.beginPath(); X.arc(x - cs * 0.04, y, cs * 0.02, 0, TAU); X.fill(); }
  }
  if (glow) { X.save(); X.globalAlpha = glow; X.strokeStyle = '#fff6b0'; X.lineWidth = cs * 0.04; X.setLineDash([cs * 0.06, cs * 0.12]); X.lineDashOffset = clock * cs * 0.5; X.beginPath(); X.moveTo(x, yb); X.lineTo(x, yt); X.stroke(); X.restore(); }
}
function drawSprout(X, x, y) {
  X.strokeStyle = '#5aa64a'; X.lineWidth = cs * 0.05; X.lineCap = 'round';
  X.beginPath(); X.moveTo(x, y); X.quadraticCurveTo(x - cs * 0.03, y - cs * 0.12, x, y - cs * 0.2); X.stroke();
  blob(X, x - cs * 0.08, y - cs * 0.17, cs * 0.08, cs * 0.04, '#7fd36a', null, 0, 0.5);
  blob(X, x + cs * 0.08, y - cs * 0.2, cs * 0.08, cs * 0.04, '#7fd36a', null, 0, -0.5);
}
const BOW = ['#ff8a8a', '#ffb86b', '#ffe27a', '#8fe08a', '#7cc7ff', '#b79cff'];
function drawRainbow(X, xa, xb, ys, k) {
  const cx = (xa + xb) / 2, r = Math.abs(xb - xa) / 2, hgt = rowH * 0.7;
  X.save();
  if (IMG.regenbogen) {
    const dw = Math.abs(xb - xa) + cs * 0.7, dh = dw * aspect('regenbogen');
    X.globalAlpha = 0.28 + 0.72 * k; X.filter = k < 1 ? `grayscale(${Math.round((1 - k) * 100)}%)` : 'none';
    X.drawImage(IMG.regenbogen, cx - dw / 2, ys - dh + rowH * 0.06, dw, dh); X.filter = 'none';
  } else {
    const bw = cs * 0.08;
    BOW.forEach((c, i) => {
      X.strokeStyle = k >= 1 ? c : `rgba(220,215,235,${0.55})`; X.lineWidth = bw;
      X.beginPath(); X.ellipse(cx, ys + rowH * 0.02, r - i * bw * 0.95, hgt - i * bw * 0.95, 0, Math.PI, TAU); X.stroke();
      if (k > 0 && k < 1) { X.save(); X.globalAlpha = k; X.strokeStyle = c; X.stroke(); X.restore(); }
    });
    if (k < 0.05) { X.setLineDash([cs * 0.08, cs * 0.08]); X.strokeStyle = 'rgba(255,255,255,.8)'; X.lineWidth = 2; X.beginPath(); X.ellipse(cx, ys, r, hgt, 0, Math.PI, TAU); X.stroke(); }
  }
  X.restore();
}
function drawLantern(X, x, y, lit, t) {
  X.strokeStyle = '#b5864a'; X.lineWidth = cs * 0.04; X.beginPath(); X.moveTo(x, y); X.lineTo(x, y - cs * 0.55); X.stroke();
  if (lit) { X.fillStyle = `rgba(255,226,122,${0.35 + 0.15 * Math.sin(t * 4)})`; X.beginPath(); X.arc(x, y - cs * 0.6, cs * 0.24, 0, TAU); X.fill(); }
  X.fillStyle = lit ? '#ffd21c' : '#fff3c4'; X.strokeStyle = '#d9a012'; X.lineWidth = cs * 0.02; star(X, x, y - cs * 0.6, cs * 0.14, cs * 0.065); X.fill(); X.stroke();
}
function finger(X, x, y, press) {
  X.save(); X.translate(x + 4, y + 4); X.rotate(-0.45); X.scale(1 - press * 0.08, 1 - press * 0.08);
  X.fillStyle = '#fff'; X.strokeStyle = '#11121A'; X.lineWidth = 2.5; X.lineJoin = 'round';
  X.beginPath();
  X.moveTo(-6, 4); X.lineTo(-6, 26); X.quadraticCurveTo(-6, 31, -12, 34); X.quadraticCurveTo(-20, 38, -16, 48);
  X.quadraticCurveTo(-10, 62, 6, 64); X.quadraticCurveTo(22, 64, 24, 48); X.lineTo(24, 34); X.quadraticCurveTo(24, 28, 18, 28);
  X.quadraticCurveTo(14, 24, 9, 26); X.lineTo(6, 4); X.quadraticCurveTo(0, -4, -6, 4);
  X.closePath(); X.fill(); X.stroke(); X.restore();
}

// ---------- Zeichnen: Szene ----------
function drawSky() {
  const w = worldOf(levelNo).id, c = SKY[w], k = camMax() ? cam / camMax() : 0;
  if (IMG.hintergrund) {
    const dh = H * 1.35, dw = Math.max(W, dh / aspect('hintergrund'));
    ctx.drawImage(IMG.hintergrund, (W - dw) / 2, -(1 - k) * (dh - H), dw, dh);
    ctx.fillStyle = `rgba(255,255,255,${0.08})`; ctx.fillRect(0, 0, W, H);
    return;
  }
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, k > 0.5 ? c[0] : c[1]); g.addColorStop(0.5, c[1]); g.addColorStop(1, c[2]);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  // ferne Schleierwolken (langsamer als die Spielwolken)
  ctx.fillStyle = 'rgba(255,255,255,.35)';
  for (let i = 0; i < 14; i++) {
    const wy = i * rowH * 1.7, y = H - groundPad - (wy - cam * 0.35);
    if (y < -60 || y > H + 60) continue;
    const x = ((i * 137) % 100) / 100 * W;
    ctx.beginPath(); ctx.ellipse(x, y, cs * 1.1, cs * 0.22, 0, 0, TAU); ctx.ellipse(x + cs * 0.5, y - cs * 0.1, cs * 0.6, cs * 0.2, 0, 0, TAU); ctx.fill();
  }
  if (w >= 3) { ctx.fillStyle = 'rgba(255,255,255,.7)'; for (let i = 0; i < 24; i++) { const x = ((i * 89) % 97) / 97 * W, y = ((i * 53) % 61) / 61 * H * 0.6; ctx.globalAlpha = 0.3 + 0.3 * Math.sin(clock * 2 + i); ctx.beginPath(); ctx.arc(x, y, 1.4, 0, TAU); ctx.fill(); } ctx.globalAlpha = 1; }
}

function render() {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (!st) { ctx.fillStyle = '#cfe6ff'; ctx.fillRect(0, 0, W, H); return; }
  drawSky();
  const reach = canTap() ? moves(st) : [];
  const reachSet = new Set(reach.map((m) => m.plat));
  const hint = hintTarget();
  // Wiese
  const ground = L.plats[L.start];
  if (L.plats.some((p) => p.kind === 'ground')) drawGround(ctx, scrY(0));
  // Ranken
  for (const v of L.vines) {
    const up = L.plats[v.up], dn = L.plats[v.down];
    const yb = surfScr(dn) - rowH * 0.02, yt = surfScr(up) + rowH * 0.1;
    if (yt > H + 40 || yb < -40) continue;
    const k = v.elf >= 0 ? vis.elves[v.elf] : 1;
    const glow = reach.some((m) => m.via === 'vine' && m.ref === v.i) ? 0.5 + 0.4 * Math.sin(clock * 4) : 0;
    drawVine(ctx, colX(v.col), yb, yt, k, glow);
    if (v.elf >= 0 && k < 0.15) drawSprout(ctx, colX(v.col), yb);
  }
  // Regenbögen
  for (const rb of L.rainbows) {
    const ys = scrY(floorY(L.rows - 1 - rb.row));
    if (ys < -rowH || ys > H + rowH) continue;
    drawRainbow(ctx, colX(rb.colA), colX(rb.colB), ys, vis.rainbows[rb.i]);
  }
  // Wolken mit allem, was darauf steht
  for (const p of L.plats) {
    if (p.kind === 'ground') continue;
    let ys = surfScr(p);
    if (ys < -rowH * 1.6 || ys > H + rowH) continue;
    const bo = vis.bounce[p.i] || 0, wo = vis.wobble[p.i] || 0;
    ys += Math.sin(bo * Math.PI) * cs * 0.06;
    ctx.save();
    if (wo) { const cx = (p.a + p.b + 1) / 2 * cs; ctx.translate(cx, ys); ctx.rotate(Math.sin(wo * 22) * 0.05 * wo); ctx.translate(-cx, -ys); }
    if (p.kind === 'ghost') { drawCloud(ctx, p, ys, 0.25 + 0.75 * vis.ghost); if (vis.ghost < 1) drawGhostOutline(ctx, p, ys, vis.ghost); }
    else drawCloud(ctx, p, ys, 1);
    ctx.restore();
    if (reachSet.has(p.i)) reachRing(p, ys, hint === p.i);
    drawOnCloud(p, ys);
  }
  // Wiese: Markierung, wenn man wieder hinunter kann
  if (reachSet.has(ground.i)) reachRing(ground, scrY(0), hint === ground.i);
  // fliegende Sachen
  if (vis.flyStar) goldStar(ctx, vis.flyStar.x, scrY(vis.flyStar.y), cs * 0.42 * (vis.flyStar.s || 1));
  drawUnicornNow();
  if (vis.wand === 'fly' && vis.wandPos) drawWand(ctx, vis.wandPos.x, scrY(vis.wandPos.y), cs * 0.55, vis.wandPos.r || 0);
  drawParticles();
  if (hint !== null && hint !== undefined) {
    const p = L.plats[hint], ys = p.kind === 'ground' ? scrY(0) : surfScr(p);
    const fx = p.kind === 'ground' ? colX(st.col) : (p.a + p.b + 1) / 2 * cs, k = (clock * 1.1) % 1;
    finger(ctx, fx, ys - rowH * 0.15, k < 0.3 ? 1 : 0);
  }
  drawGuide();
}
function reachRing(p, ys, strong) {
  const x0 = p.kind === 'ground' ? colX(st.col) - cs : p.a * cs, w = p.kind === 'ground' ? cs * 2 : (p.b - p.a + 1) * cs;
  const k = 0.5 + 0.5 * Math.sin(clock * 4 + p.i), a = clamp(0.55 + 0.35 * k + (flashReach > 0 ? 0.3 : 0) + (strong ? 0.2 : 0), 0, 1);
  ctx.save();
  ctx.fillStyle = `rgba(255,236,140,${0.22 * a})`; ctx.beginPath(); ctx.ellipse(x0 + w / 2, ys + rowH * 0.02, w / 2 + cs * 0.04, rowH * 0.12, 0, 0, TAU); ctx.fill();
  ctx.strokeStyle = `rgba(255,210,60,${a})`; ctx.lineWidth = Math.max(3, cs * 0.055);
  ctx.setLineDash([cs * 0.16, cs * 0.09]); ctx.lineDashOffset = -clock * cs * 0.4;
  ctx.beginPath(); ctx.ellipse(x0 + w / 2, ys + rowH * 0.02, w / 2 * (0.9 + k * 0.04), rowH * 0.1, 0, 0, TAU); ctx.stroke();
  ctx.restore();
  // kleine Funkel über der Wolke
  ctx.fillStyle = `rgba(255,255,255,${0.6 * a})`;
  for (let i = 0; i < 2; i++) { const ph = (clock * 0.8 + i * 0.5 + p.i * 0.13) % 1; star(ctx, x0 + w * (0.3 + i * 0.4), ys - rowH * (0.15 + ph * 0.35), cs * 0.05 * (1 - ph), cs * 0.02 * (1 - ph)); ctx.fill(); }
}
function drawOnCloud(p, ys) {
  // Sterne
  for (const s of L.stars) if (s.plat === p.i && vis.stars[s.i]) goldStar(ctx, colX(s.col), ys - rowH * 0.5 + Math.sin(clock * 3 + s.i) * cs * 0.05, cs * 0.42);
  // Zauberstab
  if (L.wand === p.i && vis.wand === 'cloud') {
    const x = colX(p.wandCol), y = ys - cs * 0.08;
    ctx.fillStyle = `rgba(255,246,176,${0.35 + 0.2 * Math.sin(clock * 5)})`; ctx.beginPath(); ctx.ellipse(x, y, cs * 0.34, cs * 0.14, 0, 0, TAU); ctx.fill();
    drawWand(ctx, x, y, cs * 0.58, -0.25 + Math.sin(clock * 2) * 0.05);
  }
  // Fee
  if (L.fairy === p.i) {
    const x = colX(p.fairyCol), happy = vis.wand === 'fairy';
    drawFairy(ctx, x, ys + 1, cs * 0.95, happy, clock);
    if (!happy && (fairyBubble > 0 || (clock % 6) < 1.4)) thought(x + cs * 0.35, ys - cs * 1.15);
    if (happy && vis.fairyJoy > 0) { if (Math.random() < 0.3) spark(x, floorY(p.floor) + cs * 0.8, 1); }
  }
  for (const f of L.decoFairies) if (f.plat === p.i) drawFairy(ctx, colX(f.col), ys + 1, cs * 0.9, true, clock + f.col);
  // Elf
  for (const e of L.elves) if (e.plat === p.i) {
    const v = L.vines[e.vine], off = v.col === p.b ? -0.32 : 0.32;
    drawElf(ctx, colX(e.col) + off * cs, ys + 1, cs * 0.9, vis.elfJoy[e.i], clock);
  }
  // Ruhewolke
  for (let i = 0; i < L.rests.length; i++) { const r = L.rests[i]; if (r.plat === p.i) drawLantern(ctx, colX(r.col) + cs * 0.3, ys, vis.rests[i], clock); }
  // Ziel: Feen-Freunde winken
  if (p.i === L.goal && !IMG.ziel) {
    drawFairy(ctx, p.a * cs + cs * 0.3, ys - rowH * 0.02, cs * 0.75, true, clock * 1.3);
    drawFairy(ctx, (p.b + 1) * cs - cs * 0.3, ys - rowH * 0.02, cs * 0.75, true, clock * 1.1 + 1);
  }
}
function thought(x, y) {
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,.95)'; ctx.strokeStyle = 'rgba(140,110,190,.6)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(x - cs * 0.2, y + cs * 0.42, cs * 0.05, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.arc(x - cs * 0.1, y + cs * 0.3, cs * 0.08, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(x, y, cs * 0.34, cs * 0.24, 0, 0, TAU); ctx.fill(); ctx.stroke();
  drawWand(ctx, x, y, cs * 0.44, -0.5);
  ctx.restore();
}
function drawUnicornNow() {
  const p = U.plat >= 0 ? L.plats[U.plat] : null;
  const bob = p ? bobOf(p) + Math.sin((vis.bounce[p.i] || 0) * Math.PI) * cs * 0.06 : 0;
  const y = scrY(U.y) + bob;
  const s = cs * 1.12;
  ctx.fillStyle = 'rgba(80,60,140,.13)'; if (p) { ctx.beginPath(); ctx.ellipse(U.x, y + 2, s * 0.32, s * 0.06, 0, 0, TAU); ctx.fill(); }
  const blink = (clock % 3.9) < 0.12;
  drawUnicorn(ctx, U.x, y, s, { face: U.face, sq: U.sq, pose: U.pose, blink, walk: U.walk });
  if (vis.wand === 'horn') drawWand(ctx, U.x + U.face * s * 0.3, y - s * 1.0, cs * 0.42, U.face > 0 ? -0.9 : -2.2);
}
function drawParticles() {
  for (const p of particles) {
    const k = clamp(p.life / p.max, 0, 1), x = p.x, y = p.screen ? p.y : scrY(p.y);
    ctx.save(); ctx.globalAlpha = Math.min(1, k * 1.6);
    if (p.kind === 'puff') { ctx.fillStyle = p.c; ctx.beginPath(); ctx.arc(x, y, p.r + (1 - k) * p.grow, 0, TAU); ctx.fill(); }
    else if (p.kind === 'star') { ctx.translate(x, y); ctx.rotate(p.rot || 0); ctx.fillStyle = p.c; star(ctx, 0, 0, p.r * 1.6, p.r * 0.7); ctx.fill(); }
    else if (p.kind === 'conf') { ctx.translate(x, y); ctx.rotate(p.rot); ctx.fillStyle = p.c; ctx.fillRect(-p.r, -p.r * 0.5, p.r * 2, p.r); }
    ctx.restore();
  }
}
// Orientierung: Zielporträt mit Pfeil, solange das Ziel oben außer Sicht ist; schmale Fortschrittsleiste in langen Leveln
function drawGuide() {
  const goal = L.plats[L.goal], gy = surfScr(goal), top = L.rows - 1;
  const bx = W - 7, y0 = topSafe + 66, y1 = H - 26;
  if (top >= 6) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 6; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(bx, y0); ctx.lineTo(bx, y1); ctx.stroke();
    const fy = (f) => lerp(y1, y0, f / top);
    ctx.strokeStyle = 'rgba(255,190,90,.9)'; ctx.beginPath(); ctx.moveTo(bx, y1); ctx.lineTo(bx, fy(clamp(U.y / rowH, 0, top))); ctx.stroke();
    L.rests.forEach((r, i) => { ctx.fillStyle = vis.rests[i] ? '#ffd21c' : 'rgba(255,255,255,.9)'; ctx.beginPath(); ctx.arc(bx, fy(L.plats[r.plat].floor), 4.5, 0, TAU); ctx.fill(); });
    ctx.fillStyle = '#ff9ecf'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(bx, fy(clamp(U.y / rowH, 0, top)), 6, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.restore();
  }
  if (gy < topSafe - rowH * 0.1) {
    const px = W - 34, py = topSafe + 30, b = Math.sin(clock * 4) * 3;
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,.95)'; ctx.strokeStyle = '#c8a2ff'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(px, py, 22, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(px, py, 20, 0, TAU); ctx.clip();
    drawCastle(ctx, px, py + 14, 34);
    ctx.restore();
    ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#8c6bd6'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(px, py - 38 + b); ctx.lineTo(px - 9, py - 27 + b); ctx.lineTo(px + 9, py - 27 + b); ctx.closePath(); ctx.fill(); ctx.stroke();
  }
}

// ---------- Hilfe-Finger ----------
let hintCache = { key: '', target: null };
function hintTarget() {
  if (!canTap()) return null;
  const wait = lv.hintNow && st.moves === 0 ? 1.2 : levelNo === 1 ? 2.5 : 8;
  if (idle < wait) return null;
  const key = `${st.plat}|${st.wand}|${st.fairyHelped}|${st.elves}|${st.rainbows}`;
  if (hintCache.key !== key) hintCache = { key, target: hintMove(st) };
  return hintCache.target;
}

// ---------- Ablauf ----------
function update(dt) {
  clock += dt;
  if (mode === 'menu' || mode === 'pause') return;
  if (!busy()) idle += dt;
  tipT += dt;
  if (tipT > 5 && st.moves > 0) hideTip();
  tickActions(dt);
  cam += (camTargetFor(U.y) - cam) * (1 - Math.exp(-dt * 5));
  flashReach = Math.max(0, flashReach - dt);
  fairyBubble = Math.max(0, fairyBubble - dt);
  vis.fairyJoy = Math.max(0, vis.fairyJoy - dt);
  vis.elfJoy = vis.elfJoy.map((j) => Math.max(0, j - dt));
  for (const k of Object.keys(vis.bounce)) { vis.bounce[k] = Math.max(0, vis.bounce[k] - dt * 3); }
  for (const k of Object.keys(vis.wobble)) { vis.wobble[k] = Math.max(0, vis.wobble[k] - dt * 2); }
  if (U.pose === 'stand' && !busy()) U.walk = 0;
  for (const p of particles) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.g * dt; p.rot = (p.rot || 0) + dt * 4; if (p.kind === 'puff') { p.vx *= 0.94; p.vy *= 0.94; } }
  particles = particles.filter((p) => p.life > 0);
  updateHud();
}

let lastStars = 0;
function win() {
  const n = starCount(st), wasUnlocked = save.unlocked;
  const better = recordWin(save, levelNo, n, LEVEL_COUNT);
  if (levelNo > wasUnlocked) save.unlocked = wasUnlocked;   // per Link gespieltes Level schaltet nichts außer der Reihe frei
  persist();
  lastStars = n; void better;
  setMode('won');
}

// ---------- Startbild ----------
function drawHero() {
  const hc = $('hero'), X = hc.getContext('2d'), w = hc.width, h = hc.height;
  X.clearRect(0, 0, w, h);
  const g = X.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#b9dcff'); g.addColorStop(1, '#f3d9ff');
  X.fillStyle = g; X.beginPath(); X.roundRect ? X.roundRect(0, 0, w, h, 60) : X.rect(0, 0, w, h); X.fill();
  const save0 = { cs, rowH, L };
  cs = w / 6; rowH = cs * 1.45; L = { goal: -1 };
  drawCloud(X, { i: 0, a: 3, b: 5 }, h * 0.3, 1);
  drawCloud(X, { i: 1, a: 0, b: 1 }, h * 0.84, 1);
  goldStar(X, w * 0.68, h * 0.18, cs * 0.5);
  goldStar(X, w * 0.2, h * 0.5, cs * 0.42);
  for (let i = 0; i < 10; i++) { const k = i / 9; X.fillStyle = PUFF[i % PUFF.length]; X.beginPath(); X.arc(lerp(w * 0.18, w * 0.38, k), lerp(h * 0.82, h * 0.62, k), cs * (0.12 + k * 0.08), 0, TAU); X.fill(); }
  drawUnicorn(X, w * 0.5, h * 0.62, w * 0.36, { face: 1, pose: 'fly' });
  cs = save0.cs; rowH = save0.rowH; L = save0.L;
}

// ---------- HUD und Menüs ----------
const STAR_ON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l2.8 6 6.6.7-5 4.5 1.4 6.5L12 16.9l-5.8 3.3 1.4-6.5-5-4.5 6.6-.7z" fill="#ffcf33" stroke="#e09a12" stroke-width="1.4" stroke-linejoin="round"/></svg>';
const STAR_OFF = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l2.8 6 6.6.7-5 4.5 1.4 6.5L12 16.9l-5.8 3.3 1.4-6.5-5-4.5 6.6-.7z" fill="#d9d2ea" stroke="#b8acd4" stroke-width="1.4" stroke-linejoin="round"/></svg>';
function updateHud() {
  if (!st) return;
  const n = vis ? vis.stars.filter((x) => !x).length - (vis.flyStar ? 1 : 0) : 0, shown = clamp(n, 0, 3), key = `${levelNo}|${shown}`;
  if (key === hudCache) return;
  hudCache = key;
  $('hudLevel').textContent = String(levelNo);
  $('chipStars').innerHTML = [0, 1, 2].map((i) => (i < shown ? STAR_ON : STAR_OFF)).join('');
  $('hudStarsLabel').textContent = `Sterne: ${shown} von 3`;
}
const SCREENS = ['start', 'levels', 'pause', 'win'];
function show(id) { for (const s of SCREENS) $(s).hidden = s !== id; }
function setMode(m) {
  mode = m;
  $('hud').classList.toggle('off', m === 'menu');
  if (m !== 'play') hideTip();
  if (m === 'play') show(null);
  if (m === 'pause') show('pause');
  if (m === 'won') showWin();
  document.body.dataset.mode = m;
  musicSync();
}
function showWin() {
  const last = levelNo === LEVEL_COUNT;
  $('winTitle').textContent = last ? 'Feenfest!' : ['Juhu!', 'Super!', 'Toll gepupst!', 'Hurra!'][levelNo % 4];
  $('winStars').innerHTML = [0, 1, 2].map((i) => (i < lastStars ? STAR_ON.replace('<svg', `<svg class="on" style="animation-delay:${0.15 + i * 0.25}s"`) : STAR_OFF)).join('');
  $('winStars').setAttribute('aria-label', `${lastStars} von 3 Sternen`);
  [0, 1, 2].forEach((i) => { if (i < lastStars) setTimeout(() => SFX.funkel(), 150 + i * 250); });
  const res = $('winResult');
  if (challenge && challenge.l === levelNo && challenge.s !== null) {
    const ok = lastStars >= challenge.s;
    res.hidden = false; res.className = 'result ' + (ok ? 'win' : 'lose');
    res.textContent = ok ? `🌟 Geschafft – ${lastStars} von 3 Sternen!` : `Fast! ${challenge.s} Sterne sind möglich – nochmal?`;
  } else res.hidden = true;
  $('winNext').querySelector('.lbl').textContent = last ? 'Fertig' : 'Weiter';
  $('winNext').setAttribute('aria-label', last ? 'Fertig, zur Levelauswahl' : 'Weiter zu Level ' + (levelNo + 1));
  show('win');
  kontoHinweis('kontoBox');
  setTimeout(() => $('winNext').focus({ preventScroll: true }), 50);
}
function nextLevel() { for (let n = 1; n <= save.unlocked; n++) if (save.best[n] === undefined) return n; return Math.min(save.unlocked, LEVEL_COUNT); }
function openMenu() {
  setMode('menu'); show('start');
  const box = $('challengeBox');
  if (challenge) {
    box.hidden = false;
    box.innerHTML = `🦄 Einladung · Level ${challenge.l}<b>${challenge.s !== null ? '⭐'.repeat(challenge.s) || 'Los geht\'s!' : 'Los geht\'s!'}</b>${challenge.s ? 'Schafft ihr auch so viele Sterne?' : 'Pupst ihr mit nach oben?'}`;
    $('playLabel').textContent = 'Los!';
  } else { box.hidden = true; $('playLabel').textContent = save.run || save.best[1] !== undefined ? 'Weiter' : 'Spielen'; }
  kontoHinweis('kontoBoxMenu');
}
function buildLevels() {
  const wrap = $('levelGrid'); wrap.innerHTML = '';
  const nx = nextLevel();
  for (const w of WORLDS) {
    const hd = document.createElement('div'); hd.className = 'world'; hd.textContent = w.name; wrap.appendChild(hd);
    const g = document.createElement('div'); g.className = 'grid'; wrap.appendChild(g);
    for (let n = w.from; n <= w.to; n++) {
      const b = document.createElement('button'), best = save.best[n];
      const locked = n > save.unlocked && !(challenge && challenge.l === n);
      b.className = 'lvl' + (n === nx && best === undefined ? ' next' : '');
      b.style.setProperty('--sc', LVL_COL[w.id]);
      b.disabled = locked;
      b.innerHTML = `${n}${best !== undefined ? `<small>${'★'.repeat(best)}${'☆'.repeat(3 - best)}</small>` : ''}`;
      b.setAttribute('aria-label', `Level ${n}${best !== undefined ? `, geschafft, ${best} von 3 Sternen` : locked ? ', gesperrt' : ''}`);
      b.addEventListener('click', () => { unlockAudio(); SFX.click(); startLevel(n); });
      g.appendChild(b);
    }
  }
}
function openLevels() { buildLevels(); setMode('menu'); show('levels'); }
function pause() { if (mode === 'play') setMode('pause'); }
function resume() { if (mode === 'pause') setMode('play'); }
function toast(text) { const t = $('toast'); t.textContent = text; t.hidden = false; clearTimeout(toast.h); toast.h = setTimeout(() => (t.hidden = true), 3200); }

async function share() {
  const url = `${location.origin}/spiele/sternenpups?l=${levelNo}&s=${lastStars}`;
  const text = `Sternenpups, Level ${levelNo}: Unser Einhorn hat sich hochgepupst und ${lastStars} von 3 Sternen gesammelt. Pupst ihr mit?`;
  if (navigator.share) { try { await navigator.share({ title: 'Sternenpups', text, url }); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
  try { await navigator.clipboard.writeText(text + ' ' + url); toast('Link kopiert – schickt ihn an eure Freunde!'); } catch { toast(url); }
}

// Hinweis aufs Konto: nur ohne Anmeldung und erst, wenn es etwas zu verlieren gibt (ab 2 geschafften Leveln)
function kontoHinweis(id) {
  const P = window.PlaySaal, n = Object.keys(save.best).length;
  const meilenstein = id === 'kontoBoxMenu' || [2, 5, 10, 15, 20].includes(n);
  let zeigen = false;
  try { zeigen = !!(P && P.hostOk && !P.user() && n >= 2 && meilenstein); } catch { zeigen = false; }
  $(id).hidden = !zeigen;
}
function kontoAnlegen() { try { window.PlaySaal && window.PlaySaal.anmelden({}); } catch { /* Konten nicht verfügbar */ } }
$('kontoBtn').addEventListener('click', kontoAnlegen);
$('kontoBtnMenu').addEventListener('click', kontoAnlegen);
setTimeout(() => { if (mode === 'menu' && !$('start').hidden) kontoHinweis('kontoBoxMenu'); }, 1500);   // playsaal.js lädt verzögert

$('btnPlay').addEventListener('click', () => { unlockAudio(); SFX.click(); startLevel(challenge ? challenge.l : save.run ? save.run.l : nextLevel()); });
$('btnLevels').addEventListener('click', () => { unlockAudio(); SFX.click(); openLevels(); });
$('levelsBack').addEventListener('click', () => { SFX.click(); openMenu(); });
$('btnPause').addEventListener('click', () => { unlockAudio(); SFX.click(); pause(); });
$('pResume').addEventListener('click', () => { SFX.click(); resume(); });
$('pRestart').addEventListener('click', () => { SFX.click(); startLevel(levelNo, true); });
$('pLevels').addEventListener('click', () => { SFX.click(); openLevels(); });
$('winNext').addEventListener('click', () => { unlockAudio(); SFX.click(); if (levelNo >= LEVEL_COUNT) openLevels(); else startLevel(levelNo + 1 <= save.unlocked ? levelNo + 1 : nextLevel(), true); });
$('winAgain').addEventListener('click', () => { SFX.click(); startLevel(levelNo, true); });
$('winLevels').addEventListener('click', () => { SFX.click(); openLevels(); });
$('winShare').addEventListener('click', () => { SFX.click(); share(); });
document.querySelectorAll('[data-mute]').forEach((b) => b.addEventListener('click', () => toggleMute()));
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); musicSync(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { if (mode === 'play') pause(); else if (mode === 'pause') resume(); } });

// ---------- Schleife ----------
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000)); last = now;
  if (mode !== 'pause') update(dt);
  render();
  requestAnimationFrame(frame);
}

// Testzugang (nur für automatisierte Prüfungen)
window.__sternenpups = {
  get mode() { return mode; }, get st() { return st; }, get save() { return save; }, get level() { return levelNo; },
  get busy() { return busy(); }, get canTap() { return st ? canTap() : false; }, get cam() { return cam; },
  platPoint: (i) => { const p = L.plats[i]; return { x: p.kind === 'ground' ? colX(st.col) : (p.a + p.b + 1) / 2 * cs, y: (p.kind === 'ground' ? scrY(0) : surfScr(p)) - rowH * 0.2 }; },
  plan: () => plan(st)
};

new ResizeObserver(() => resize()).observe(app);
paintMute();
resize();
loadImages().then(() => {
  document.body.classList.add('ready');
  drawHero();
  openMenu();
  const q = new URLSearchParams(location.search), l = Number(q.get('level'));
  if (!challenge && l >= 1 && l <= save.unlocked) startLevel(l);
});
document.fonts && document.fonts.ready.then(drawHero);
requestAnimationFrame((t) => { last = t; frame(t); });
