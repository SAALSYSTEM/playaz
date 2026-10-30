// Hexis Zaubersuppe – Oberfläche: Canvas-2D-Hexenküche, Zutaten antippen oder in den Kessel ziehen, Kater verzaubern, Menüs, Ton, Speichern.
// Bilder von ChatGPT (img/manifest.json). Fehlt ein Bild, wird ein einfacher Platzhalter gezeichnet.
import { LEVELS, LEVEL_COUNT } from './levels.js';
import {
  STORE, ZUTATEN, VERWANDLUNGEN, VERWANDLUNG_IDS, newState, zugeben, fehlt, offen, sterne, suppenFarbe,
  freshSave, sanitizeSave, recordWin, totalStars, parseInvite
} from './engine.js';

const $ = (id) => document.getElementById(id);
const app = $('app'), cv = $('game'), ctx = cv.getContext('2d');
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, k) => a + (b - a) * k;
const ease = (k) => 1 - Math.pow(1 - clamp(k, 0, 1), 3);
const TAU = Math.PI * 2;

// ---------- Bilder ----------
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
const imgUrl = (k) => new URL(k + '.webp', base).href;
// Bild mit Mitte (x, y) in Höhe h (oder höchstens Breite maxW); false, wenn es fehlt
function drawCentered(X, k, x, y, h, maxW = Infinity, rot = 0) {
  const i = IMG[k]; if (!i) return false;
  let w = h * i.naturalWidth / i.naturalHeight;
  if (w > maxW) { h *= maxW / w; w = maxW; }
  X.save(); X.translate(x, y); if (rot) X.rotate(rot); X.drawImage(i, -w / 2, -h / 2, w, h); X.restore();
  return true;
}
// Bild unten mittig auf (x, yBottom) in Höhe h
function drawStanding(X, k, x, yBottom, h, maxW = Infinity, sx = 1, sy = 1) {
  const i = IMG[k]; if (!i) return false;
  let w = h * i.naturalWidth / i.naturalHeight;
  if (w > maxW) { h *= maxW / w; w = maxW; }
  X.save(); X.translate(x, yBottom); X.scale(sx, sy); X.drawImage(i, -w / 2, -h, w, h); X.restore();
  return true;
}

// ---------- Spielstand ----------
let save = freshSave();
try { save = sanitizeSave(JSON.parse(localStorage.getItem(STORE)), LEVEL_COUNT); } catch { /* Privatmodus */ }
const persist = () => { try { localStorage.setItem(STORE, JSON.stringify(save)); } catch { /* gesperrt */ } };
const invite = parseInvite(location.search, LEVEL_COUNT);

// ---------- Ton (WebAudio, erst nach der ersten Berührung) ----------
let actx = null, noiseBuf = null;
function unlockAudio() {
  if (save.mute) return;
  try {
    actx ??= new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
    if (!noiseBuf) {
      noiseBuf = actx.createBuffer(1, actx.sampleRate, actx.sampleRate);
      const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
  } catch { actx = null; }
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
function noise(dur, freq, vol, q = 1, delay = 0, type = 'bandpass') {
  if (save.mute || !actx || !noiseBuf) return;
  try {
    const t = actx.currentTime + delay, s = actx.createBufferSource(), f = actx.createBiquadFilter(), g = actx.createGain();
    s.buffer = noiseBuf; f.type = type; f.frequency.value = freq; f.Q.value = q;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(actx.destination); s.start(t); s.stop(t + dur + 0.05);
  } catch { /* egal */ }
}
const SFX = {
  pick: () => tone(660, 0.07, 'triangle', 0.06, 1.3),
  whoosh: () => noise(0.25, 900, 0.05, 0.8),
  blub: () => { tone(220, 0.18, 'sine', 0.12, 0.45, 0, 900); tone(330, 0.12, 'sine', 0.08, 0.5, 0.09, 900); noise(0.12, 600, 0.05, 1.5); },
  ding: (n) => tone(784 + n * 90, 0.18, 'triangle', 0.08, 0, 0.06),
  puff: () => { noise(0.45, 500, 0.18, 0.7, 0, 'lowpass'); tone(260, 0.35, 'triangle', 0.07, 0.45); tone(180, 0.3, 'square', 0.025, 0.5, 0.05, 600); },
  magic: () => [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => tone(f, 0.22, 'triangle', 0.07, 0, i * 0.07)),
  zap: () => { noise(0.5, 2400, 0.08, 1); [1568, 1319, 1760, 2093].forEach((f, i) => tone(f, 0.15, 'sine', 0.05, 0, 0.05 + i * 0.05)); },
  meow: () => { tone(620, 0.32, 'triangle', 0.07, 0.7, 0, 1800); tone(820, 0.12, 'sine', 0.03, 0.8, 0.02); },
  giggle: () => [880, 990, 880, 1046].forEach((f, i) => tone(f, 0.07, 'sine', 0.05, 1.1, i * 0.08)),
  star: (i) => tone(988 + i * 200, 0.2, 'triangle', 0.09, 0, i * 0.15),
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
// Hintergrundlied: nur im Spiel (auch auf dem Geschafft-Bildschirm), nicht in Menü, Levelauswahl und Pause; folgt dem Ton-Knopf
const music = $('music'); music.volume = 0.28;
function musicSync() {
  const want = !save.mute && !document.hidden && (mode === 'play' || mode === 'cheer' || mode === 'won');
  if (!want) { music.pause(); return; }
  const p = music.play(); if (p && p.catch) p.catch(() => {});
}
function toggleMute() { save.mute = !save.mute; persist(); if (!save.mute) { unlockAudio(); SFX.click(); } paintMute(); musicSync(); }

// ---------- Größe und Aufbau ----------
let W = 360, H = 640, dpr = 1, sabEl = null;
function safeBottom() {   // Abstand zur Wischleiste (iPhone)
  if (!sabEl) { sabEl = document.createElement('div'); sabEl.style.cssText = 'position:absolute;visibility:hidden;padding-bottom:env(safe-area-inset-bottom,0px)'; app.appendChild(sabEl); }
  return parseFloat(getComputedStyle(sabEl).paddingBottom) || 0;
}
const L = {};   // Layout: Rezeptkarte, Kessel, Hexi, Kasimir, Regal
function resize() {
  W = app.clientWidth; H = app.clientHeight; dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  cv.style.width = W + 'px'; cv.style.height = H + 'px';
  const hud = $('hud').getBoundingClientRect(), ar = app.getBoundingClientRect();
  const top = Math.max(hud.bottom - ar.top + 8, 60);
  // Rezeptkarte
  L.rx = 12; L.rw = W - 24; L.ry = top; L.rh = clamp(H * 0.15, 86, 128);
  // Regal unten (1 oder 2 Reihen)
  const n = lv ? lv.regal.length : 5, rows = n > 5 ? 2 : 1, per = Math.ceil(n / rows);
  const safeB = 10 + safeBottom();
  L.rowH = clamp(H * (rows === 2 ? 0.115 : 0.14), 64, 112);
  L.trayBottom = H - safeB;
  L.trayTop = L.trayBottom - rows * L.rowH - 8;
  L.item = Math.min(L.rowH * 0.78, (W - 24) / Math.max(per, 4) * 0.84);
  L.slots = [];
  if (lv) lv.regal.forEach((z, i) => {
    const r = rows === 2 ? (i < per ? 0 : 1) : 0, inRow = rows === 2 ? (r === 0 ? per : n - per) : n, k = rows === 2 && r === 1 ? i - per : i;
    const gap = (W - 24) / inRow;
    L.slots.push({ z, x: 12 + gap * (k + 0.5), y: L.trayTop + 8 + L.rowH * (r + 0.58), shelf: L.trayTop + 8 + L.rowH * (r + 1) - 6 });
  });
  // Boden mit Kessel, Hexi und Kasimir zwischen Rezept und Regal
  const sceneTop = L.ry + L.rh, sceneBot = L.trayTop;
  L.floor = sceneBot - 4;
  L.kw = Math.min(W * 0.5, (sceneBot - sceneTop) * 0.62);
  L.kh = L.kw * (IMG.kessel ? IMG.kessel.naturalHeight / IMG.kessel.naturalWidth : 0.94);
  L.kx = W * 0.5; L.kTop = L.floor - L.kh;
  // Suppe im Kesselbild: x 0.139–0.863, y 0.095–0.358 (siehe tools/hexis-zaubersuppe-assets.py)
  L.sx = L.kx; L.sy = L.kTop + L.kh * 0.227; L.srx = L.kw * 0.36; L.sry = L.kh * 0.13;
  L.hexH = Math.min((sceneBot - sceneTop) * 0.88, L.kh * 1.45);
  const hexW = L.hexH * (IMG.hexe ? IMG.hexe.naturalWidth / IMG.hexe.naturalHeight : 0.6);
  L.hexX = Math.max(W * 0.17, hexW * 0.5 + 2);
  L.katH = Math.min(L.kh * 0.86, (sceneBot - sceneTop) * 0.5); L.katX = W - Math.max(W * 0.16, L.katH * 0.42);
  L.katY = L.floor - L.katH * 0.5;
  soupCache = '';
  $('tip').style.top = Math.round(L.ry + L.rh + 10) + 'px';   // Tipp unter dem Rezept, damit das Regal frei bleibt
}

// ---------- Zustand ----------
let mode = 'menu';            // menu | play | pause | cheer | won
let levelNo = 1, lv = null, st = null, clock = 0, idle = 0, tipT = 0;
let grab = null;              // Zutat am Finger
let flying = [];              // Zutaten auf dem Weg in den Kessel (oder zurück ins Regal)
let parts = [], puffs = [], bubbles = [];
let soupCol = [200, 200, 200], soupTarget = [200, 200, 200], soupGlow = 0;
let hexPose = 'hexe', hexPoseT = 0, hexHop = 0, katHop = 0, katForm = 'kater', kesselWob = 0;
let slotFx = {};              // Rezept-Slot -> Zeit des letzten Treffers
let cheer = null, lastResult = null, hudCache = '';

const hexRgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

function startLevel(n) {
  levelNo = clamp(n, 1, LEVEL_COUNT); lv = LEVELS[levelNo - 1]; st = newState(lv);
  grab = null; flying = []; parts = []; puffs = []; bubbles = []; slotFx = {}; cheer = null; idle = 0; hudCache = '';
  soupCol = [200, 200, 200]; soupTarget = [200, 200, 200]; soupGlow = 0;
  hexPose = 'hexe'; hexPoseT = 0; katForm = 'kater';
  $('tipLevel').textContent = `Level ${levelNo} · ${lv.name}`;
  $('tipText').textContent = levelNo === 1 ? 'Tippe den Frosch an – oder zieh ihn in den Kessel!' : 'Rezept: ' + rezeptText();
  $('tip').classList.remove('away'); tipT = 0;
  resize(); updateHud(); setMode('play');
}
function rezeptText() {
  const parts = Object.entries(lv.rezept).map(([z, n]) => `${n} ${n === 1 ? ZUTATEN[z].name : ZUTATEN[z].viele}`);
  return parts.length > 1 ? parts.slice(0, -1).join(', ') + ' und ' + parts[parts.length - 1] : parts[0];
}

// ---------- Eingabe ----------
function pos(e) { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
function slotAt(x, y) {
  let best = null, bd = L.item * 0.75;
  for (const s of L.slots) { const d = Math.hypot(s.x - x, s.y - y); if (d < bd) { bd = d; best = s; } }
  return best;
}
const overKessel = (x, y) => Math.hypot((x - L.sx) / (L.kw * 0.62), (y - (L.kTop + L.kh * 0.35)) / (L.kh * 0.62)) < 1;
function hideTip() { $('tip').classList.add('away'); }

let pointerId = null;
cv.addEventListener('pointerdown', (e) => {
  unlockAudio();
  if (mode !== 'play') return;
  e.preventDefault();
  const p = pos(e);
  idle = 0;
  if (grab) return;
  const s = slotAt(p.x, p.y);
  if (s) {
    grab = { z: s.z, slot: s, x: p.x, y: p.y, sx: p.x, sy: p.y, t: performance.now(), moved: false };
    pointerId = e.pointerId; try { cv.setPointerCapture(e.pointerId); } catch { /* egal */ }
    SFX.pick(); hideTip();
    return;
  }
  // Figuren antippen: Kasimir maunzt, Hexi kichert
  if (Math.abs(p.x - L.katX) < L.katH * 0.45 && p.y > L.floor - L.katH && p.y < L.floor) { katHop = 1; SFX.meow(); return; }
  if (Math.abs(p.x - L.hexX) < L.hexH * 0.25 && p.y > L.floor - L.hexH && p.y < L.floor) { hexHop = 1; SFX.giggle(); }
});
cv.addEventListener('pointermove', (e) => {
  if (!grab || e.pointerId !== pointerId) return;
  const p = pos(e); grab.x = p.x; grab.y = p.y;
  if (Math.hypot(p.x - grab.sx, p.y - grab.sy) > 14) grab.moved = true;
});
function endPointer(e) {
  if (!grab || (e && e.pointerId !== pointerId)) return;
  const g = grab; grab = null; pointerId = null;
  if (mode !== 'play') return;
  if (!g.moved || overKessel(g.x, g.y)) throwIn(g.z, g.x, g.y, g.moved ? 0.28 : 0.55, !g.moved);
  else flying.push({ z: g.z, back: true, x0: g.x, y0: g.y, x1: g.slot.x, y1: g.slot.y, t: 0, dur: 0.3, arc: 0 });
}
cv.addEventListener('pointerup', endPointer);
cv.addEventListener('pointercancel', endPointer);

function throwIn(z, x, y, dur, arc) {
  flying.push({ z, back: false, x0: x, y0: y, x1: L.sx + (Math.random() - 0.5) * L.srx * 0.5, y1: L.sy, t: 0, dur, arc: arc ? Math.min(160, H * 0.2) : 30 });
  SFX.whoosh();
}

// Zutat landet in der Suppe
function land(f) {
  const res = zugeben(st, f.z);
  splash(f.x1, f.y1, ZUTATEN[f.z].farbe, res === 'puff' ? 10 : 18);
  kesselWob = 1;
  if (res === 'puff') {
    SFX.puff();
    puffs.push({ x: L.sx, y: L.sy - L.kh * 0.28, t: 0, s: L.kw * 0.95 });
    setPose('hexe-ueberrascht', 1.3);
    flying.push({ z: f.z, back: true, x0: f.x1, y0: f.y1, x1: slotOf(f.z).x, y1: slotOf(f.z).y, t: 0, dur: 0.75, arc: Math.min(190, H * 0.24), delay: 0.12 });
    slotFx['x:' + f.z] = clock;
  } else {
    SFX.blub(); SFX.ding(st.drin[f.z]);
    slotFx[f.z] = clock;
    const c = suppenFarbe(st); soupTarget = hexRgb(c); soupGlow = 1;
    hexHop = 0.7;
    if (res === 'fertig') startCheer();
  }
  updateHud();
}
const slotOf = (z) => L.slots.find((s) => s.z === z) || { x: W / 2, y: H - 60 };
function setPose(p, dur) { hexPose = p; hexPoseT = dur; }

function splash(x, y, col, n) {
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2, v = 90 + Math.random() * 170;
    parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 520, life: 0.6 + Math.random() * 0.3, t: 0, r: 3 + Math.random() * 5, col, kind: 'drop' });
  }
}

// ---------- Verzaubern ----------
function startCheer() {
  setMode('cheer');
  cheer = { t: 0, swapped: false, cycle: 0 };
  setPose('hexe-jubel', 99);
  SFX.magic();
  const won = recordWin(save, lv, st, LEVEL_COUNT); persist();
  lastResult = { ...won, form: lv.kater };
}
function updateCheer(dt) {
  const c = cheer; c.t += dt;
  // Funkelstrom vom Kessel zu Kasimir
  if (c.t < 1.0 && Math.random() < dt * 40) {
    const k = Math.random();
    parts.push({ kind: 'spark', x: L.sx, y: L.sy, tx: L.katX, ty: L.katY, t: 0, life: 0.8, r: 3 + Math.random() * 4, off: (Math.random() - 0.5) * 60, col: k < 0.5 ? '#FFD21C' : '#c86bff' });
  }
  const T = 1.0;
  if (c.t >= T && !c.swapped) {
    c.swapped = true; SFX.puff(); SFX.zap();
    puffs.push({ x: L.katX, y: L.katY, t: 0, s: L.katH * 1.6 });
    c.swapAt = c.t + 0.22;
  }
  if (c.swapAt && c.t >= c.swapAt) {
    c.swapAt = 0;
    if (lv.fest) { c.cycle = 1; c.next = c.t + 0.32; katForm = VERWANDLUNG_IDS[0]; }
    else katForm = lv.kater;
    katHop = 1;
  }
  // Großes Zauberfest: einmal durch alle Verwandlungen wirbeln
  if (lv.fest && c.cycle && c.t >= c.next) {
    if (c.cycle < VERWANDLUNG_IDS.length) {
      katForm = VERWANDLUNG_IDS[c.cycle]; c.cycle++; c.next = c.t + 0.32; katHop = 0.6; SFX.zap();
      puffs.push({ x: L.katX, y: L.katY, t: 0.18, s: L.katH * 1.1 });
    } else { c.cycle = 0; katForm = lv.kater; c.end = c.t + 1.4; }
  }
  const end = lv.fest ? (c.end || 99) : T + 1.8;
  if (c.t >= end) setMode('won');
}

// ---------- Hilfe-Finger ----------
function hintDelay() { return levelNo === 1 && !save.best[1] ? 1.2 : levelNo <= 3 ? 5 : 9; }
function hintTarget() {
  const z = offen(st)[0]; if (!z) return null;
  return slotOf(z);
}

// ---------- Aktualisieren ----------
function update(dt) {
  clock += dt;
  if (mode === 'play') {
    tipT += dt; if (tipT > 4.5) hideTip();
    if (!grab && !flying.length) idle += dt;
  }
  if (mode === 'cheer') updateCheer(dt);
  for (const f of flying) {
    if (f.delay > 0) { f.delay -= dt; continue; }
    f.t += dt / f.dur;
    if (f.t >= 1 && !f.done) { f.done = true; if (!f.back) land(f); }
  }
  flying = flying.filter((f) => !f.done);
  for (const p of parts) {
    p.t += dt;
    if (p.kind === 'drop') { p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; }
  }
  parts = parts.filter((p) => p.t < p.life);
  for (const p of puffs) p.t += dt;
  puffs = puffs.filter((p) => p.t < 0.9);
  // Suppe: Farbe gleitet, Blasen steigen
  for (let i = 0; i < 3; i++) soupCol[i] = lerp(soupCol[i], soupTarget[i], Math.min(1, dt * 4));
  soupGlow = Math.max(mode === 'cheer' || mode === 'won' ? 0.8 : 0, soupGlow - dt * 1.2);
  if (Math.random() < dt * (mode === 'cheer' ? 14 : 4)) {
    const a = Math.random() * TAU, rr = Math.sqrt(Math.random()) * 0.8;
    bubbles.push({ x: L.sx + Math.cos(a) * L.srx * rr, y: L.sy + Math.sin(a) * L.sry * rr, t: 0, life: 0.6 + Math.random() * 0.8, r: 2 + Math.random() * (mode === 'cheer' ? 9 : 6) });
  }
  for (const b of bubbles) b.t += dt;
  bubbles = bubbles.filter((b) => b.t < b.life);
  if (hexPoseT > 0) { hexPoseT -= dt; if (hexPoseT <= 0) hexPose = 'hexe'; }
  hexHop = Math.max(0, hexHop - dt * 2.2); katHop = Math.max(0, katHop - dt * 2); kesselWob = Math.max(0, kesselWob - dt * 2.5);
}

// ---------- Zeichnen ----------
let soupCanvas = null, soupCache = '';
function soupImage(w, h, col) {
  const key = `${Math.round(w)}|${col.map((v) => Math.round(v / 3)).join(',')}`;
  if (key === soupCache && soupCanvas) return soupCanvas;
  soupCache = key;
  const m = IMG['kessel-suppe']; if (!m) return null;
  soupCanvas ??= document.createElement('canvas');
  const c = soupCanvas; c.width = Math.max(1, Math.round(w * dpr)); c.height = Math.max(1, Math.round(h * dpr));
  const X = c.getContext('2d');
  X.globalCompositeOperation = 'source-over'; X.clearRect(0, 0, c.width, c.height);
  X.drawImage(m, 0, 0, c.width, c.height);
  X.globalCompositeOperation = 'multiply';
  X.fillStyle = `rgb(${col.map((v) => Math.round(Math.min(255, v * 1.18))).join(',')})`; X.fillRect(0, 0, c.width, c.height);
  X.globalCompositeOperation = 'destination-in'; X.drawImage(m, 0, 0, c.width, c.height);
  X.globalCompositeOperation = 'source-over';
  return c;
}

function drawBackground(X) {
  const bg = IMG.hintergrund;
  if (bg) {
    const s = Math.max(W / bg.naturalWidth, H / bg.naturalHeight), w = bg.naturalWidth * s, h = bg.naturalHeight * s;
    X.drawImage(bg, (W - w) / 2, (H - h) * 0.6, w, h);
  } else {
    const g = X.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#7a4a24'); g.addColorStop(0.55, '#a06a3a'); g.addColorStop(1, '#5a3418');
    X.fillStyle = g; X.fillRect(0, 0, W, H);
  }
  // Abendlicht: leicht abdunkeln, damit Figuren und Zutaten leuchten
  const v = X.createLinearGradient(0, 0, 0, H); v.addColorStop(0, 'rgba(40,16,70,.28)'); v.addColorStop(0.5, 'rgba(40,16,70,0)'); v.addColorStop(1, 'rgba(30,10,40,.25)');
  X.fillStyle = v; X.fillRect(0, 0, W, H);
}

function roundRect(X, x, y, w, h, r) { X.beginPath(); X.roundRect ? X.roundRect(x, y, w, h, r) : X.rect(x, y, w, h); }

function drawRecipe(X) {
  const { rx, ry, rw, rh } = L;
  X.save();
  X.shadowColor = 'rgba(0,0,0,.35)'; X.shadowBlur = 12; X.shadowOffsetY = 4;
  roundRect(X, rx, ry, rw, rh, 20); X.fillStyle = '#fff3d6'; X.fill();
  X.shadowColor = 'transparent';
  X.lineWidth = 4; X.strokeStyle = '#8a5cd6'; X.stroke();
  X.setLineDash([6, 6]); X.lineWidth = 2; X.strokeStyle = 'rgba(138,92,214,.45)';
  roundRect(X, rx + 7, ry + 7, rw - 14, rh - 14, 14); X.stroke(); X.setLineDash([]);
  const items = Object.entries(st.brauch), n = items.length, sw = (rw - 16) / n;
  const shake = (k) => (slotFx['x:' + k] != null && clock - slotFx['x:' + k] < 0.45 ? Math.sin((clock - slotFx['x:' + k]) * 50) * 4 : 0);
  items.forEach(([z, need], i) => {
    const x = rx + 8 + sw * (i + 0.5) + shake(z), done = fehlt(st, z) <= 0;
    const hit = slotFx[z] != null ? clamp(1 - (clock - slotFx[z]) / 0.35, 0, 1) : 0;
    const isz = Math.min(sw * 0.7, rh * 0.58) * (1 + hit * 0.25);
    X.globalAlpha = done ? 0.55 : 1;
    if (!drawCentered(X, z, x, ry + rh * 0.42, isz, sw * 0.82)) { X.fillStyle = ZUTATEN[z].farbe; X.beginPath(); X.arc(x, ry + rh * 0.42, isz * 0.4, 0, TAU); X.fill(); }
    X.globalAlpha = 1;
    // Punkte zum Zählen
    const dr = Math.min(7.5, sw / (need * 3.2)), gap = dr * 2.7, y = ry + rh * 0.84;
    for (let k = 0; k < need; k++) {
      const dx = x + (k - (need - 1) / 2) * gap, filled = k < st.drin[z];
      X.beginPath(); X.arc(dx, y, dr, 0, TAU);
      X.fillStyle = filled ? '#FFD21C' : '#fff'; X.fill();
      X.lineWidth = 2; X.strokeStyle = filled ? '#c48a00' : '#b49a7a'; X.stroke();
    }
    if (done) {
      X.beginPath(); X.arc(x + isz * 0.42, ry + rh * 0.2, 11, 0, TAU); X.fillStyle = '#2fbf71'; X.fill();
      X.strokeStyle = '#fff'; X.lineWidth = 3; X.lineCap = 'round'; X.lineJoin = 'round';
      X.beginPath(); X.moveTo(x + isz * 0.42 - 5, ry + rh * 0.2); X.lineTo(x + isz * 0.42 - 1, ry + rh * 0.2 + 4); X.lineTo(x + isz * 0.42 + 6, ry + rh * 0.2 - 4); X.stroke();
    }
  });
  X.restore();
}

function drawKessel(X) {
  const wob = Math.sin(clock * 30) * kesselWob * 0.03;
  X.save(); X.translate(L.kx, L.floor); X.scale(1 + wob, 1 - wob); X.translate(-L.kx, -L.floor);
  // Lichtschein der Suppe auf der Wand
  if (soupGlow > 0.05) {
    const g = X.createRadialGradient(L.sx, L.sy, 0, L.sx, L.sy, L.kw * 0.9);
    g.addColorStop(0, `rgba(${soupCol.map(Math.round).join(',')},${0.45 * soupGlow})`); g.addColorStop(1, 'rgba(0,0,0,0)');
    X.fillStyle = g; X.fillRect(L.sx - L.kw, L.sy - L.kw, L.kw * 2, L.kw * 2);
  }
  if (IMG.kessel) {
    X.drawImage(IMG.kessel, L.kx - L.kw / 2, L.kTop, L.kw, L.kh);
    const s = soupImage(L.kw, L.kh, soupCol);
    if (s && st && st.rein.length) X.drawImage(s, L.kx - L.kw / 2, L.kTop, L.kw, L.kh);
  } else {
    X.fillStyle = '#222'; X.beginPath(); X.ellipse(L.kx, L.kTop + L.kh * 0.55, L.kw * 0.48, L.kh * 0.42, 0, 0, TAU); X.fill();
    X.fillStyle = `rgb(${soupCol.map(Math.round).join(',')})`; X.beginPath(); X.ellipse(L.sx, L.sy, L.srx, L.sry, 0, 0, TAU); X.fill();
  }
  // Blasen in der Suppe
  X.save(); X.beginPath(); X.ellipse(L.sx, L.sy, L.srx, L.sry, 0, 0, TAU); X.clip();
  const light = soupCol.map((v) => Math.round(Math.min(255, v + 60))).join(',');
  for (const b of bubbles) {
    const k = b.t / b.life, r = b.r * (0.4 + k);
    X.globalAlpha = 1 - k * k; X.beginPath(); X.arc(b.x, b.y - k * 4, r, 0, TAU);
    X.fillStyle = `rgba(${light},.75)`; X.fill(); X.lineWidth = 1.5; X.strokeStyle = 'rgba(255,255,255,.7)'; X.stroke();
  }
  X.restore(); X.globalAlpha = 1;
  X.restore();
}

function drawHexi(X) {
  const hop = Math.sin(hexHop * Math.PI) * 14, sway = Math.sin(clock * 2.2) * 0.012;
  if (!drawStanding(X, hexPose, L.hexX, L.floor + 6 - hop, L.hexH, Infinity, 1 - sway, 1 + sway)) {
    X.fillStyle = '#3f8f2a'; X.beginPath(); X.ellipse(L.hexX, L.floor - L.hexH * 0.3, L.hexH * 0.18, L.hexH * 0.3, 0, 0, TAU); X.fill();
    X.fillStyle = '#7b3fbf'; X.beginPath(); X.moveTo(L.hexX - L.hexH * 0.22, L.floor - L.hexH * 0.7); X.lineTo(L.hexX + L.hexH * 0.22, L.floor - L.hexH * 0.7); X.lineTo(L.hexX, L.floor - L.hexH); X.fill();
  }
}

function drawKasimir(X) {
  const hop = Math.sin(katHop * Math.PI) * 18, breathe = Math.sin(clock * 3) * 0.015;
  const k = katForm === 'kater' ? 'kater' : 'kater-' + katForm;
  const fly = katForm === 'fluegel' ? Math.sin(clock * 4) * 6 - 10 : 0;
  const h = katForm === 'winzig' ? L.katH * 0.8 : L.katH;
  if (!drawStanding(X, k, L.katX, L.floor + 2 - hop + fly, h, W * 0.36, 1 - breathe, 1 + breathe)) {
    X.fillStyle = '#1b1b22'; X.beginPath(); X.ellipse(L.katX, L.floor - h * 0.35, h * 0.28, h * 0.35, 0, 0, TAU); X.fill();
  }
}

function drawTray(X) {
  // Regalbretter
  const rows = L.slots.length > 5 ? 2 : 1;
  const g = X.createLinearGradient(0, L.trayTop, 0, H); g.addColorStop(0, 'rgba(40,18,8,.0)'); g.addColorStop(0.15, 'rgba(40,18,8,.45)'); g.addColorStop(1, 'rgba(30,12,6,.65)');
  X.fillStyle = g; X.fillRect(0, L.trayTop, W, H - L.trayTop);
  for (let r = 0; r < rows; r++) {
    const y = L.trayTop + 8 + L.rowH * (r + 1) - 8;
    roundRect(X, 8, y, W - 16, 12, 5);
    const wg = X.createLinearGradient(0, y, 0, y + 12); wg.addColorStop(0, '#c98b4f'); wg.addColorStop(1, '#7a4a24');
    X.fillStyle = wg; X.fill();
    X.fillStyle = 'rgba(0,0,0,.25)'; X.fillRect(14, y + 12, W - 28, 4);
  }
  const hint = mode === 'play' && idle > hintDelay() ? hintTarget() : null;
  for (const s of L.slots) {
    const lifted = grab && grab.slot === s;
    const bob = hint === s ? Math.abs(Math.sin(clock * 5)) * -8 : 0;
    if (hint === s) {
      X.beginPath(); X.arc(s.x, s.y, L.item * 0.62 + Math.sin(clock * 5) * 3, 0, TAU);
      X.fillStyle = 'rgba(255,210,28,.35)'; X.fill();
    }
    X.globalAlpha = lifted ? 0.35 : 1;
    X.fillStyle = 'rgba(0,0,0,.25)'; X.beginPath(); X.ellipse(s.x, s.shelf - 2, L.item * 0.36, 4, 0, 0, TAU); X.fill();
    if (!drawCentered(X, s.z, s.x, s.y + bob, L.item, L.item * 1.15)) {
      X.fillStyle = ZUTATEN[s.z].farbe; X.beginPath(); X.arc(s.x, s.y + bob, L.item * 0.4, 0, TAU); X.fill();
    }
    X.globalAlpha = 1;
  }
  if (hint) drawHint(X, hint);
}

function drawHint(X, s) {
  // Finger wandert vom Regal zum Kessel
  const k = (clock * 0.7) % 1, e = ease(Math.min(1, k * 1.4));
  const x = lerp(s.x, L.sx, e), y = lerp(s.y, L.sy, e) - Math.sin(e * Math.PI) * 60;
  X.globalAlpha = k > 0.85 ? (1 - k) / 0.15 : 1;
  X.font = `${Math.round(L.item * 0.7)}px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
  X.textAlign = 'center'; X.textBaseline = 'middle';
  X.fillText('👆', x + 10, y + 28);
  X.globalAlpha = 1;
}

function drawFlying(X) {
  for (const f of flying) {
    if (f.delay > 0) continue;
    const e = f.back ? ease(f.t) : f.t * f.t * (3 - 2 * f.t);
    const x = lerp(f.x0, f.x1, e), y = lerp(f.y0, f.y1, e) - Math.sin(e * Math.PI) * f.arc;
    const size = L.item * (f.back ? lerp(0.8, 1, e) : lerp(1.15, 0.55, e));
    drawCentered(X, f.z, x, y, size, size * 1.15, f.back ? 0 : e * 2.5) || (X.fillStyle = ZUTATEN[f.z].farbe, X.beginPath(), X.arc(x, y, size * 0.4, 0, TAU), X.fill());
  }
  if (grab && grab.moved) {
    const near = overKessel(grab.x, grab.y);
    if (near) { X.beginPath(); X.ellipse(L.sx, L.sy, L.srx * 1.1, L.sry * 1.5, 0, 0, TAU); X.strokeStyle = 'rgba(255,210,28,.9)'; X.lineWidth = 4; X.stroke(); }
    drawCentered(X, grab.z, grab.x, grab.y - 20, L.item * 1.25, L.item * 1.5);
  }
}

function drawParts(X) {
  for (const p of parts) {
    const k = p.t / p.life;
    if (p.kind === 'drop') {
      X.globalAlpha = 1 - k; X.fillStyle = p.col; X.beginPath(); X.arc(p.x, p.y, p.r * (1 - k * 0.5), 0, TAU); X.fill();
    } else {
      const e = ease(k), x = lerp(p.x, p.tx, e) + Math.sin(k * Math.PI) * p.off, y = lerp(p.y, p.ty, e) - Math.sin(k * Math.PI) * 70;
      X.globalAlpha = 1 - k * 0.6; X.fillStyle = p.col;
      star(X, x, y, p.r * 1.6, p.r * 0.6);
    }
  }
  X.globalAlpha = 1;
  for (const p of puffs) {
    const k = clamp(p.t / 0.9, 0, 1), s = p.s * (k < 0.25 ? ease(k / 0.25) * 1.1 : lerp(1.1, 1.3, (k - 0.25) / 0.75));
    X.globalAlpha = k < 0.55 ? 1 : 1 - (k - 0.55) / 0.45;
    if (!drawCentered(X, 'rauchwolke', p.x, p.y, s, s, k * 0.6)) {
      X.fillStyle = '#b07ee8'; X.beginPath(); X.arc(p.x, p.y, s * 0.4, 0, TAU); X.fill();
    }
  }
  X.globalAlpha = 1;
}
function star(X, x, y, R, r) {
  X.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r : R; X.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
  X.closePath(); X.fill();
}

function render() {
  const X = ctx;
  X.setTransform(dpr, 0, 0, dpr, 0, 0);
  X.clearRect(0, 0, W, H);
  drawBackground(X);
  if (!st) return;
  drawHexi(X);
  drawKessel(X);
  drawKasimir(X);
  drawTray(X);
  drawRecipe(X);
  drawParts(X);
  drawFlying(X);
}

// ---------- HUD und Menüs ----------
function updateHud() {
  if (!st) return;
  const key = `${levelNo}|${st.rein.length}`;
  if (key === hudCache) return;
  hudCache = key;
  $('hudLevel').textContent = String(levelNo);
  const rest = offen(st).map((z) => `${fehlt(st, z)} ${fehlt(st, z) === 1 ? ZUTATEN[z].name : ZUTATEN[z].viele}`);
  $('hudRezept').textContent = rest.length ? 'Noch in den Kessel: ' + rest.join(', ') : 'Rezept fertig!';
}
const SCREENS = ['start', 'levels', 'buch', 'pause', 'win'];
function show(id) { for (const s of SCREENS) $(s).hidden = s !== id; }
function setMode(m) {
  mode = m;
  if (m !== 'play') grab = null;
  $('hud').classList.toggle('off', m === 'menu');
  if (m !== 'play') hideTip();
  if (m === 'play' || m === 'cheer') show(null);
  if (m === 'pause') show('pause');
  if (m === 'won') showWin();
  document.body.dataset.mode = m;
  musicSync();
}
const STAR_SVG = (on) => `<svg viewBox="0 0 24 24" class="${on ? 'on' : ''}" aria-hidden="true"><path d="M12 2l2.9 6.3 6.9.7-5.2 4.6 1.5 6.8L12 17l-6.1 3.4 1.5-6.8L2.2 9l6.9-.7z" fill="${on ? '#FFD21C' : 'rgba(255,255,255,.2)'}" stroke="${on ? '#c48a00' : 'rgba(255,255,255,.35)'}" stroke-width="1.2" stroke-linejoin="round"/></svg>`;
function showWin() {
  const last = levelNo === LEVEL_COUNT, r = lastResult;
  $('winTitle').textContent = last ? 'Großes Zauberfest!' : ['Hex, hex!', 'Simsalabim!', 'Abrakadabra!', 'Zauberhaft!'][levelNo % 4];
  $('winKater').src = imgUrl('kater-' + r.form);
  $('winKater').alt = VERWANDLUNGEN[r.form];
  $('winNeu').hidden = !r.neu;
  $('winNeu').textContent = r.neu ? `Neu im Zauberbuch: ${VERWANDLUNGEN[r.form]}!` : '';
  $('winStars').innerHTML = [0, 1, 2].map((i) => STAR_SVG(i < r.stars)).join('');
  $('winStars').setAttribute('aria-label', `${r.stars} von 3 Sternen`);
  for (let i = 0; i < r.stars; i++) SFX.star(i);
  $('winNext').querySelector('.lbl').textContent = last ? 'Fertig' : 'Weiter';
  $('winNext').setAttribute('aria-label', last ? 'Fertig, zur Levelauswahl' : 'Weiter zu Level ' + (levelNo + 1));
  show('win');
  kontoHinweis('kontoBox');
  setTimeout(() => $('winNext').focus({ preventScroll: true }), 50);
}
function nextLevel() { for (let n = 1; n <= save.unlocked; n++) if (!save.best[n]) return n; return Math.min(save.unlocked, LEVEL_COUNT); }
function openMenu() {
  setMode('menu'); show('start');
  const box = $('inviteBox');
  if (invite) { box.hidden = false; box.textContent = `🧙‍♀️ Ihr wurdet zu Level ${invite.l} eingeladen: „${LEVELS[invite.l - 1].name}“`; $('playLabel').textContent = 'Los geht’s'; }
  else { box.hidden = true; $('playLabel').textContent = save.best[1] ? 'Weiter' : 'Spielen'; }
  kontoHinweis('kontoBoxMenu');
}
function buildLevels() {
  const g = $('levelGrid'); g.innerHTML = '';
  const nx = nextLevel();
  $('levelStars').textContent = `★ ${totalStars(save)} von ${LEVEL_COUNT * 3}`;
  for (let n = 1; n <= LEVEL_COUNT; n++) {
    const b = document.createElement('button'), best = save.best[n];
    const locked = n > save.unlocked && !(invite && invite.l === n);
    b.className = 'lvl' + (n === nx && !best ? ' next' : '');
    b.disabled = locked;
    b.innerHTML = `${n}${best ? `<small>${'★'.repeat(best)}${'☆'.repeat(3 - best)}</small>` : ''}`;
    b.setAttribute('aria-label', `Level ${n}${best ? `, ${best} von 3 Sternen` : locked ? ', gesperrt' : ''}`);
    b.addEventListener('click', () => { unlockAudio(); SFX.click(); startLevel(n); });
    g.appendChild(b);
  }
}
function openLevels() { buildLevels(); setMode('menu'); show('levels'); }
function openBuch() {
  const g = $('buchGrid'); g.innerHTML = '';
  $('buchZahl').textContent = `${save.kater.length} von ${VERWANDLUNG_IDS.length} Verwandlungen`;
  for (const k of VERWANDLUNG_IDS) {
    const on = save.kater.includes(k), d = document.createElement('div');
    d.className = 'seite' + (on ? '' : ' zu');
    d.innerHTML = `<img src="${imgUrl('kater-' + k)}" alt="${on ? VERWANDLUNGEN[k] : 'Noch nicht gezaubert'}" loading="lazy"><span>${on ? VERWANDLUNGEN[k] : '???'}</span>`;
    g.appendChild(d);
  }
  setMode('menu'); show('buch');
}
function pause() { if (mode === 'play') setMode('pause'); }
function resume() { if (mode === 'pause') setMode('play'); }
function toast(text) { const t = $('toast'); t.textContent = text; t.hidden = false; clearTimeout(toast.h); toast.h = setTimeout(() => (t.hidden = true), 3200); }

async function share() {
  const url = `${location.origin}/spiele/hexis-zaubersuppe?l=${levelNo}`;
  const text = `Hexis Zaubersuppe, Level ${levelNo}: Wir haben Kater Kasimir in einen ${VERWANDLUNGEN[lastResult.form]} verzaubert! Schafft ihr das auch?`;
  if (navigator.share) { try { await navigator.share({ title: 'Hexis Zaubersuppe', text, url }); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
  try { await navigator.clipboard.writeText(text + ' ' + url); toast('Link kopiert – schickt ihn an eure Freunde!'); } catch { toast(url); }
}

// Hinweis aufs Konto: nur ohne Anmeldung und erst, wenn es etwas zu verlieren gibt (ab 2 geschafften Leveln)
function kontoHinweis(id) {
  const P = window.PlaySaal, n = Object.keys(save.best).length;
  const meilenstein = id === 'kontoBoxMenu' || [2, 5, 10, 15].includes(n);
  let zeigen = false;
  try { zeigen = !!(P && P.hostOk && !P.user() && n >= 2 && meilenstein); } catch { zeigen = false; }
  $(id).hidden = !zeigen;
}
function kontoAnlegen() { try { window.PlaySaal && window.PlaySaal.anmelden({}); } catch { /* Konten nicht verfügbar */ } }
$('kontoBtn').addEventListener('click', kontoAnlegen);
$('kontoBtnMenu').addEventListener('click', kontoAnlegen);
setTimeout(() => { if (mode === 'menu' && !$('start').hidden) kontoHinweis('kontoBoxMenu'); }, 1500);   // playsaal.js lädt verzögert

$('btnPlay').addEventListener('click', () => { unlockAudio(); SFX.click(); startLevel(invite ? invite.l : nextLevel()); });
$('btnLevels').addEventListener('click', () => { unlockAudio(); SFX.click(); openLevels(); });
$('btnBuch').addEventListener('click', () => { unlockAudio(); SFX.click(); openBuch(); });
$('levelsBack').addEventListener('click', () => { SFX.click(); openMenu(); });
$('buchBack').addEventListener('click', () => { SFX.click(); openMenu(); });
$('btnPause').addEventListener('click', () => { unlockAudio(); SFX.click(); pause(); });
$('pResume').addEventListener('click', () => { SFX.click(); resume(); });
$('pRestart').addEventListener('click', () => { SFX.click(); startLevel(levelNo); });
$('pLevels').addEventListener('click', () => { SFX.click(); openLevels(); });
$('winNext').addEventListener('click', () => { unlockAudio(); SFX.click(); if (levelNo >= LEVEL_COUNT) openLevels(); else startLevel(levelNo + 1 <= save.unlocked ? levelNo + 1 : nextLevel()); });
$('winAgain').addEventListener('click', () => { SFX.click(); startLevel(levelNo); });
$('winLevels').addEventListener('click', () => { SFX.click(); openLevels(); });
$('winShare').addEventListener('click', () => { SFX.click(); share(); });
document.querySelectorAll('[data-mute]').forEach((b) => b.addEventListener('click', () => toggleMute()));
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); musicSync(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { if (mode === 'play') pause(); else if (mode === 'pause') resume(); } });

// ---------- Schleife ----------
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000)); last = now;
  if (mode !== 'pause' && mode !== 'menu') update(dt);
  render();
  requestAnimationFrame(frame);
}

// Testzugang (nur für automatisierte Prüfungen)
window.__zauber = {
  get mode() { return mode; }, get st() { return st; }, get save() { return save; }, get level() { return levelNo; },
  get layout() { return L; }, slot: (z) => { const s = slotOf(z); return { x: s.x, y: s.y }; }, offen: () => (st ? offen(st) : [])
};

new ResizeObserver(() => resize()).observe(app);
paintMute();
resize();
loadImages().then(() => {
  document.body.classList.add('ready');
  resize();
  openMenu();
  const q = new URLSearchParams(location.search), l = Number(q.get('level'));
  if (!invite && l >= 1 && l <= save.unlocked) startLevel(l);
});
requestAnimationFrame((t) => { last = t; frame(t); });
