// Neon Coast – Sternenfahrt: Oberfläche. Canvas-2D-Draufsicht, zwei Lenktasten, Handy-Menü, Ton, Speichern.
// Motive aus den Neon-Coast-Tafeln (img/manifest.json, aufbereitet mit tools/sternenfahrt-assets.py).
// Straße, Markierungen, Leitkegel, Sterne, Ziel und Effekte werden gezeichnet. Fehlt ein Bild, gibt es einen einfachen Ersatz.
import { LEVELS, LEVEL_COUNT } from './levels.js';
import {
  STORE, VIS_MIN, AUTOS, AUTO_IDS, newRun, advance, press, progress, award,
  freshSave, sanitizeSave, recordWin, carsUnlocked, totalAwards, parseInvite
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
const imgUrl = (k) => new URL(k + '.webp', base).href;
async function loadImages() {
  let list = [];
  try { list = await (await fetch(new URL('manifest.json', base))).json(); } catch { list = []; }
  if (!Array.isArray(list)) list = [];
  await Promise.all(list.map((k) => new Promise((res) => {
    const i = new Image(); i.decoding = 'async';
    i.onload = () => { IMG[k] = i; res(); }; i.onerror = () => res();
    i.src = imgUrl(k);
  })));
  // Container in mehreren Farben (Original ist rot)
  if (IMG.container) {
    for (const [n, c] of [['blau', '#3a8dff'], ['gruen', '#2fbf71'], ['gelb', '#ffc93a'], ['lila', '#a77bff']]) {
      const i = IMG.container, c2 = document.createElement('canvas');
      c2.width = i.naturalWidth; c2.height = i.naturalHeight;
      const g = c2.getContext('2d');
      g.drawImage(i, 0, 0); g.globalCompositeOperation = 'color'; g.fillStyle = c; g.fillRect(0, 0, c2.width, c2.height);
      g.globalCompositeOperation = 'destination-in'; g.drawImage(i, 0, 0);
      IMG['container-' + n] = c2;
    }
  }
}
const iw = (i) => i.naturalWidth || i.width, ih = (i) => i.naturalHeight || i.height;
// Bild mit Mitte (x, y), Länge h (Bildhöhe in px), gedreht
function sprite(X, k, x, y, h, rot = 0, alpha = 1, flip = false) {
  const i = IMG[k]; if (!i) return false;
  const w = h * iw(i) / ih(i);
  X.save(); X.globalAlpha *= alpha; X.translate(x, y); if (rot) X.rotate(rot); if (flip) X.scale(-1, 1);
  X.drawImage(i, -w / 2, -h / 2, w, h); X.restore();
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
let combo = 0, comboT = 0;
const SFX = {
  stern: () => { const n = Math.min(combo, 8); tone(880 * Math.pow(2, n / 12), 0.12, 'triangle', 0.08); tone(1320 * Math.pow(2, n / 12), 0.14, 'sine', 0.05, 0, 0.05); },
  spur: () => noise(0.16, 1500, 0.035, 0.7),
  rand: () => tone(170, 0.12, 'sine', 0.09, 0.7),
  hoppla: () => { tone(330, 0.32, 'sine', 0.13, 0.55); tone(495, 0.3, 'triangle', 0.05, 0.6, 0.06); noise(0.2, 400, 0.06, 0.8, 0, 'lowpass'); },
  hupe: () => { tone(415, 0.11, 'square', 0.025, 0, 0, 1400); tone(415, 0.13, 'square', 0.025, 0, 0.16, 1400); },
  ziel: () => [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => tone(f, i === 6 ? 0.5 : 0.16, 'triangle', 0.08, 0, i * 0.11)),
  lerne: () => [784, 988, 1175].forEach((f, i) => tone(f, 0.16, 'sine', 0.07, 0, i * 0.08)),
  award: (i) => tone(988 + i * 200, 0.2, 'triangle', 0.09, 0, i * 0.15),
  neu: () => [659, 784, 988, 1319].forEach((f, i) => tone(f, 0.2, 'triangle', 0.08, 0, 0.5 + i * 0.1)),
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
function toggleMute() { save.mute = !save.mute; persist(); if (!save.mute) { unlockAudio(); SFX.click(); } paintMute(); radioSync(); }

// ---------- Autoradio ----------
// Während der Fahrt (und auf dem Geschafft-Bildschirm) läuft ein zufälliger Sender. Nach 45–90 s Fahrzeit (oder am Liedende)
// rauscht es kurz und ein anderer Sender kommt, mitten im Lied wie beim echten Radio. In Menü und Pause ist es still.
const SENDER = ['sender-1', 'sender-2', 'sender-3', 'sender-4'];
const radioUrl = (k) => new URL('radio/' + k + '.mp3', import.meta.url).href;
const VOL_M = 0.3, VOL_R = 0.2;
const musik = new Audio(); musik.preload = 'none'; musik.volume = VOL_M;
const rausch = new Audio(radioUrl('rauschen')); rausch.preload = 'none'; rausch.volume = VOL_R;
let sender = -1, radioNext = 0, tuning = false, radioGain = null;
function radioRoute() {   // über WebAudio, damit die Lautstärke auch auf dem iPhone gilt
  if (radioGain || !actx) return;
  try {
    const m = actx.createGain(), r = actx.createGain();
    actx.createMediaElementSource(musik).connect(m).connect(actx.destination);
    actx.createMediaElementSource(rausch).connect(r).connect(actx.destination);
    m.gain.value = tuning ? 0 : VOL_M; r.gain.value = VOL_R; musik.volume = 1; rausch.volume = 1;
    radioGain = { m, r };
  } catch { radioGain = null; }
}
function musikVol(v) {
  if (radioGain) { try { radioGain.m.gain.setTargetAtTime(v, actx.currentTime, 0.08); return; } catch { /* unten */ } }
  musik.volume = radioGain ? 1 : v;
}
const radioWant = () => !save.mute && !document.hidden && !!st && (mode === 'play' || mode === 'won');
const playSafe = (a) => { const p = a.play(); if (p && p.catch) p.catch(() => {}); };
function umschalten() {
  let n; do { n = Math.floor(Math.random() * SENDER.length); } while (n === sender);
  sender = n; tuning = true; radioNext = clock + 45 + Math.random() * 45;
  radioRoute();
  musikVol(0);
  musik.src = radioUrl(SENDER[n]);
  musik.addEventListener('loadedmetadata', () => { try { musik.currentTime = Math.random() * Math.max(0, musik.duration - 50); } catch { /* egal */ } }, { once: true });
  try { rausch.currentTime = Math.random() * 4; } catch { /* noch nicht geladen */ }
  if (radioWant()) { playSafe(rausch); playSafe(musik); }   // beide gleich starten (zählt als Nutzergeste), Musik erst leise
  clearTimeout(umschalten.h);
  umschalten.h = setTimeout(() => { rausch.pause(); tuning = false; musikVol(VOL_M); radioSync(); }, 1000);
}
function radioSync() {
  if (!radioWant()) { musik.pause(); rausch.pause(); return; }
  if (sender < 0) { umschalten(); return; }
  radioRoute();
  if (tuning) playSafe(rausch);
  playSafe(musik);
}
musik.addEventListener('ended', () => { if (radioWant()) umschalten(); });

// ---------- Zustand ----------
let mode = 'menu', st = null, lv = null, levelNo = 1, lastResult = null, backTo = 'start';
let clock = 0, hudCache = '', tipTimer = 0;
let parts = [], confetti = [], peds = [], pedNext = 0, hopT = -9, randT = -9, randDir = 0;
const segCache = new Map();

// ---------- Größe und Maßstab ----------
let W = 360, H = 640, dpr = 1;
const L = {};   // s = Pixel je Spurbreite, carY = Automitte, x0/x1 = Straßenränder, top = Oberkante der Sicht
function resize() {
  W = app.clientWidth; H = app.clientHeight; dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  cv.style.width = W + 'px'; cv.style.height = H + 'px';
  const ar = app.getBoundingClientRect();
  L.top = Math.max($('hud').getBoundingClientRect().bottom - ar.top + 4, 56);
  L.ctlTop = $('ctl').getBoundingClientRect().top - ar.top;
  // Maßstab: Straße ca. 56 % der Breite, aber Sicht nach vorn immer zwischen VIS_MIN und 11 Spurbreiten
  let s = W * 0.56 / 3;
  for (let i = 0; i < 3; i++) {
    const carY = L.ctlTop - s * 0.8 - 12, ahead = carY - L.top;
    s = clamp(W * 0.56 / 3, ahead / 11, ahead / VIS_MIN);
  }
  L.s = s; L.carY = L.ctlTop - s * 0.8 - 12;
  L.cx = W / 2; L.x0 = W / 2 - 1.5 * s; L.x1 = W / 2 + 1.5 * s;
  L.side = L.x0 / s;   // Breite des Randes in Spurbreiten
  L.ahead = (L.carY - L.top) / s;
  makePatterns();
}
const SX = (x) => L.cx + x * L.s;
const SY = (y) => L.carY - (y - (st ? st.p : 0)) * L.s;

// Bodenflächen als gekachelte Muster (Größe passend zum Maßstab)
const PAT = {};
function makePatterns() {
  const sizes = { 'boden-asphalt': 2.4, 'boden-sand': 2.2, 'boden-gras': 2.2, 'boden-meer': 3, 'boden-flach': 2.4, 'boden-platten': 1, 'boden-pflaster': 1.8 };
  for (const [k, u] of Object.entries(sizes)) {
    const i = IMG[k]; if (!i) { PAT[k] = null; continue; }
    const c = document.createElement('canvas'), w = Math.max(8, Math.round(u * L.s * dpr)), h = Math.max(8, Math.round(w * ih(i) / iw(i)));
    c.width = w; c.height = h; c.getContext('2d').drawImage(i, 0, 0, w, h);
    PAT[k] = { p: ctx.createPattern(c, 'repeat'), h: h / dpr, w: w / dpr };
  }
}
const FALLBACK = { 'boden-asphalt': '#3b4152', 'boden-sand': '#f3d89a', 'boden-gras': '#6fbf4a', 'boden-meer': '#1f7fd1', 'boden-flach': '#4fd6e6', 'boden-platten': '#eadcc2', 'boden-pflaster': '#9a9ca3' };
// Fläche zwischen x-Werten a..b (px) mit Muster, das mit der Straße mitläuft
function ground(X, k, a, b, tint) {
  if (b <= a) return;
  const P = PAT[k];
  if (P) {
    const off = ((st ? st.p : 0) * L.s) % P.h;
    X.save(); X.translate(0, off); X.fillStyle = P.p; X.fillRect(a, -off - P.h, b - a, H + P.h * 2); X.restore();
  } else { X.fillStyle = FALLBACK[k]; X.fillRect(a, 0, b - a, H); }
  if (tint) { X.fillStyle = tint; X.fillRect(a, 0, b - a, H); }
}

// ---------- Landschaft (in Abschnitten, je Level gleich) ----------
const SEG = 16;
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
// Randbereiche je Welt (in Spurbreiten ab Straßenrand)
function bands(welt, side) {
  const sw = 0.55, rest = Math.max(0.4, L.side - sw);
  if (welt === 'strand' && side > 0) return { sand: [sw, sw + Math.max(0.4, rest * 0.5)], wasser: sw + Math.max(0.4, rest * 0.5) };
  if (welt === 'hafen' && side > 0) return { kai: [sw, sw + Math.max(0.3, rest * 0.35)], wasser: sw + Math.max(0.3, rest * 0.35) + 0.07 };
  return {};
}
function genSeg(n) {
  const r = rng(lv.id * 7919 + n * 104729 + 17), items = [], y0 = n * SEG, welt = lv.welt;
  for (const side of [-1, 1]) {
    const b = bands(welt, side);
    // Bäume und Möbel auf dem Gehweg (außen am Rand)
    for (let y = y0 + r() * 2; y < y0 + SEG; y += 3 + r() * 3) {
      const t = r();
      if (welt === 'hafen') { if (t < 0.5) items.push({ k: 'muelleimer', side, d: 0.42, y, h: 0.22, z: 1 }); continue; }
      if (t < 0.55) items.push({ k: pick(r, ['palme', 'palme-jung', 'palme-faecher']), side, d: 0.45, y, h: 0.95 + r() * 0.2, rot: r() * TAU, z: 3 });
      else if (t < 0.75) items.push({ k: 'bank', side, d: 0.46, y, h: 0.55, rot: side < 0 ? 0 : Math.PI, z: 1 });
      else items.push({ k: 'muelleimer', side, d: 0.45, y, h: 0.22, z: 1 });
    }
    if (welt === 'strand' && side > 0) {
      // Strand: Schirme mit Liegen, ab und zu ein Rettungsturm
      const mid = (b.sand[0] + b.sand[1]) / 2;
      for (let y = y0 + r() * 2; y < y0 + SEG; y += 2.6 + r() * 2.2) {
        if (r() < 0.15) { items.push({ k: 'rettungsturm', side, d: mid + 0.1, y, h: 1.1, z: 2 }); y += 1; continue; }
        items.push({ k: 'liege', side, d: mid + 0.18, y: y - 0.1, h: 0.75, rot: 0.2 * (r() - 0.5), z: 1 });
        items.push({ k: 'schirm', side, d: mid - 0.05, y: y + 0.25, h: 0.85, rot: r() * TAU, z: 3 });
      }
      for (let y = y0 + r() * 4; y < y0 + SEG; y += 6 + r() * 5) items.push({ k: 'boot', side, d: b.wasser + 0.9 + r() * 0.6, y, h: 1.4, rot: Math.PI * 0.5 * (r() < 0.5 ? 1 : -1) + (r() - 0.5) * 0.4, z: 1, schwimm: true });
      continue;
    }
    if (welt === 'hafen' && side > 0) {
      // Hafenbecken: Stege und Boote
      for (let y = y0 + r() * 3; y < y0 + SEG; y += 4.5 + r() * 2.5) {
        items.push({ k: 'steg', side, d: b.wasser + 0.35, y, h: 2.4, z: 0 });
        items.push({ k: 'boot', side, d: b.wasser + 0.95, y: y + (r() - 0.5), h: 1.5, rot: (r() - 0.5) * 0.15, z: 1, schwimm: true });
      }
      continue;
    }
    // Häuserzeile (Stadt beidseitig, Strand links, Hafen links: Hallen und Container)
    const haeuser = welt === 'stadt' ? ['haus-wohn', 'haus-apart', 'haus-hotel', 'haus-laden', 'haus-cafe', 'haus-club']
      : welt === 'strand' ? ['haus-cafe', 'haus-laden', 'haus-hotel', 'haus-apart'] : ['haus-halle', 'haus-werk'];
    for (let y = y0 + r() * 1.5; y < y0 + SEG;) {
      if (welt === 'hafen' && r() < 0.55) {
        // Containerstapel: 2–3 Container nebeneinander
        const n = 2 + Math.floor(r() * 2), col = ['container', 'container-blau', 'container-gruen', 'container-gelb', 'container-lila'];
        for (let i = 0; i < n; i++) items.push({ k: pick(r, col), side, d: 0.95 + i * 0.62, y: y + 1.05, h: 2.1, z: 2 });
        y += 2.6 + r() * 0.8; continue;
      }
      const k = pick(r, haeuser), h = 2.6 + r() * 0.8;
      items.push({ k, side, d: 0.75, y: y + h / 2, h, flip: side > 0, z: 2, haus: true });
      y += h + 0.4 + r() * 0.9;
      if (welt !== 'hafen' && r() < 0.6) items.push({ k: pick(r, ['baum', 'zierbaum', 'busch']), side, d: 1.1, y: y - 0.3, h: 0.9 + r() * 0.3, rot: r() * TAU, z: 3 });
    }
  }
  items.sort((a, b) => a.z - b.z);
  return items;
}
function seg(n) { if (!segCache.has(n)) segCache.set(n, genSeg(n)); return segCache.get(n); }

// Fußgänger: nur auf dem Gehweg, laufen langsam hin und her (reine Dekoration)
const FIGUREN = ['figur-mann', 'figur-frau', 'figur-business', 'figur-hafen'];
function updatePeds(dt) {
  if (!st) return;
  if (st.p >= pedNext) {
    pedNext = st.p + 1.6 + Math.random() * 2.2;
    const side = Math.random() < 0.5 ? -1 : 1;
    if (!(lv.welt === 'hafen' && side > 0)) {
      const dir = Math.random() < 0.5 ? 1 : -1;
      const fig = lv.welt === 'hafen' && Math.random() < 0.6 ? 'figur-hafen' : pick(Math.random, FIGUREN);
      peds.push({ fig, side, d: 0.24 + Math.random() * 0.06, y: st.p + L.ahead + 2 + Math.random() * 3, dir, v: 0.45 + Math.random() * 0.25, ph: Math.random() * 4 });
    }
  }
  for (const p of peds) p.y += p.dir * p.v * dt;
  peds = peds.filter((p) => p.y > st.p - 4);
}

// ---------- Effekte ----------
function burst(x, y, n, cols, spd = 160) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU, v = spd * (0.4 + Math.random() * 0.8);
    parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: 0, life: 0.5 + Math.random() * 0.3, r: 2 + Math.random() * 3.5, col: pick(Math.random, cols), star: Math.random() < 0.5 });
  }
}
function confettiRain() {
  const cols = ['#1ED6E0', '#FF5FA2', '#FFD21C', '#B9A3F5', '#fff'];
  for (let i = 0; i < 90; i++) confetti.push({ x: Math.random() * W, y: -20 - Math.random() * H * 0.5, vx: (Math.random() - 0.5) * 60, vy: 90 + Math.random() * 120, rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 8, w: 6 + Math.random() * 6, col: pick(Math.random, cols) });
}

// ---------- Zeichnen ----------
function rr(X, x, y, w, h, r) { X.beginPath(); X.roundRect ? X.roundRect(x, y, w, h, r) : X.rect(x, y, w, h); }
function starPath(X, x, y, R, r, rot = 0) {
  X.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + rot + i * Math.PI / 5, q = i % 2 ? r : R; X.lineTo(x + Math.cos(a) * q, y + Math.sin(a) * q); }
  X.closePath();
}

function drawGround(X) {
  const s = L.s, welt = lv.welt;
  for (const side of [-1, 1]) {
    const edge = side < 0 ? L.x0 : L.x1, xa = (d) => edge + side * d * s;
    const span = (d0, d1) => side < 0 ? [Math.max(0, xa(d1)), xa(d0)] : [xa(d0), Math.min(W, xa(d1))];
    const b = bands(welt, side), far = L.side + 1;
    if (welt === 'strand' && side > 0) {
      ground(X, 'boden-sand', ...span(b.sand[0], b.wasser + 0.2));
      ground(X, 'boden-flach', ...span(b.wasser, b.wasser + 0.45));
      ground(X, 'boden-meer', ...span(b.wasser + 0.45, far));
      // Wellen am Ufer
      X.save(); X.strokeStyle = 'rgba(255,255,255,.85)'; X.lineWidth = Math.max(2, s * 0.05); X.beginPath();
      for (let y = -10; y <= H + 10; y += 6) {
        const wy = y + ((st.p * s) % (s * 1.2)), xx = xa(b.wasser + 0.05 + Math.sin(wy / (s * 0.38) + clock * 1.6) * 0.06);
        y === -10 ? X.moveTo(xx, y) : X.lineTo(xx, y);
      }
      X.stroke(); X.restore();
    } else if (welt === 'hafen' && side > 0) {
      ground(X, 'boden-pflaster', ...span(b.kai[0], b.wasser));
      ground(X, 'boden-meer', ...span(b.wasser, far), 'rgba(20,40,90,.18)');
      // Kaimauer
      const [ka, kb] = span(b.wasser - 0.07, b.wasser);
      X.fillStyle = '#d9d4cb'; X.fillRect(ka, 0, kb - ka, H);
      X.fillStyle = 'rgba(0,0,0,.18)'; X.fillRect(kb, 0, Math.max(2, s * 0.04), H);
      // Poller
      X.fillStyle = '#2a2f3d';
      const step = s * 1.6, off = (st.p * s) % step;
      for (let y = off - step; y < H + step; y += step) { X.beginPath(); X.arc(xa(b.wasser - 0.16), y, s * 0.06, 0, TAU); X.fill(); }
    } else {
      ground(X, welt === 'hafen' ? 'boden-pflaster' : 'boden-gras', ...span(0.55, far));
    }
    // Gehweg (Strand rechts: rosa Promenade)
    const [ga, gb] = span(0.08, 0.55);
    ground(X, 'boden-platten', ga, gb, welt === 'strand' && side > 0 ? 'rgba(255,120,180,.32)' : null);
    // Plattenfugen
    X.strokeStyle = 'rgba(120,100,80,.22)'; X.lineWidth = 1;
    const fs = s * 0.48, off = (st.p * s) % fs;
    X.beginPath();
    for (let y = off - fs; y < H + fs; y += fs) { X.moveTo(ga, y); X.lineTo(gb, y); }
    X.moveTo((ga + gb) / 2, 0); X.lineTo((ga + gb) / 2, H);
    X.stroke();
    // Bordstein mit Neon-Linie
    const [ba, bb] = span(0, 0.08);
    X.fillStyle = '#ece6dc'; X.fillRect(ba, 0, bb - ba, H);
    X.fillStyle = side < 0 ? '#FF5FA2' : '#1ED6E0'; X.globalAlpha = 0.85;
    X.fillRect(side < 0 ? bb - 3 : ba, 0, 3, H); X.globalAlpha = 1;
  }
}

function drawRoad(X) {
  const s = L.s;
  ground(X, 'boden-asphalt', L.x0, L.x1, 'rgba(40,46,66,.18)');
  // Randlinien
  X.fillStyle = 'rgba(255,255,255,.92)';
  X.fillRect(L.x0 + s * 0.06, 0, Math.max(2, s * 0.05), H);
  X.fillRect(L.x1 - s * 0.06 - Math.max(2, s * 0.05), 0, Math.max(2, s * 0.05), H);
  // Leitlinien zwischen den Spuren
  const dl = s * 0.7, gap = s * 0.7, per = dl + gap, off = (st.p * s) % per;
  for (const x of [-0.5, 0.5]) {
    for (let y = off - per; y < H + per; y += per) rr(X, SX(x) - s * 0.03, y, s * 0.06, dl, s * 0.03), X.fill();
  }
  // Ziel: Schachbrett quer über die Straße
  if (st.offset != null) {
    const fy = SY(st.offset + lv.length);
    if (fy > -s * 2 && fy < H + s) {
      const n = 12, cw = (L.x1 - L.x0) / n, chh = cw;
      for (let r = 0; r < 2; r++) for (let i = 0; i < n; i++) {
        X.fillStyle = (i + r) % 2 ? '#11121A' : '#fff';
        X.fillRect(L.x0 + i * cw, fy - chh * (r + 1), cw, chh);
      }
    }
  }
}

function drawSidesItems(X, zMin, zMax) {
  const s = L.s, p = st.p;
  const a = Math.floor((p - 6) / SEG), b = Math.floor((p + L.ahead + 6) / SEG);
  for (let n = a; n <= b; n++) {
    for (const it of seg(n)) {
      if (it.z < zMin || it.z > zMax) continue;
      const y = SY(it.y);
      if (y < -s * 3 || y > H + s * 3) continue;
      const edge = it.side < 0 ? L.x0 : L.x1, x = edge + it.side * it.d * s;
      if (it.haus) {
        // Haus mit der Fassade zur Straße: Bild ist schon gedreht, Lage über die Fassadenkante
        const i = IMG[it.k]; if (!i) continue;
        const h = it.h * s, w = h * iw(i) / ih(i);
        const cx = it.side < 0 ? x - w / 2 : x + w / 2;
        X.fillStyle = 'rgba(0,0,0,.18)'; X.fillRect(cx - w / 2 + 5, y - h / 2 + 7, w, h);
        sprite(X, it.k, cx, y, h, 0, 1, it.flip);
        continue;
      }
      const bob = it.schwimm ? Math.sin(clock * 1.5 + it.y) * s * 0.03 : 0;
      if (it.z >= 3) { X.fillStyle = 'rgba(0,0,0,.16)'; X.beginPath(); X.ellipse(x + s * 0.08, y + s * 0.1, it.h * s * 0.38, it.h * s * 0.34, 0, 0, TAU); X.fill(); }
      if (!sprite(X, it.k, x, y + bob, it.h * s, it.rot || 0)) {
        X.fillStyle = it.z >= 3 ? '#3fa34d' : '#c9b79a'; X.beginPath(); X.arc(x, y, it.h * s * 0.35, 0, TAU); X.fill();
      }
    }
  }
}

function drawPeds(X) {
  const s = L.s;
  for (const p of peds) {
    const y = SY(p.y); if (y < -s || y > H + s) continue;
    const edge = p.side < 0 ? L.x0 : L.x1, x = edge + p.side * p.d * s;
    const i = IMG[p.fig];
    const f = [0, 1, 2, 1][Math.floor(clock * 5 + p.ph) % 4];
    const h = s * 0.46;
    if (!i) { X.fillStyle = '#ff9a6a'; X.beginPath(); X.arc(x, y, h * 0.3, 0, TAU); X.fill(); continue; }
    const fw = iw(i) / 3, w = h * fw / ih(i);
    X.save(); X.translate(x, y); if (p.dir > 0) X.rotate(Math.PI);
    X.fillStyle = 'rgba(0,0,0,.18)'; X.beginPath(); X.ellipse(2, 3, w * 0.42, h * 0.3, 0, 0, TAU); X.fill();
    X.drawImage(i, f * fw, 0, fw, ih(i), -w / 2, -h / 2, w, h);
    X.restore();
  }
}

const VERKEHR = ['verkehr-klein', 'verkehr-lila', 'verkehr-taxi', 'verkehr-suv', 'verkehr-bus'];
function drawKegel(X, x, y, s) {
  const b = s * 0.46;
  X.fillStyle = 'rgba(0,0,0,.22)'; rr(X, x - b / 2 + 3, y - b / 2 + 4, b, b, b * 0.22); X.fill();
  X.fillStyle = '#d4471a'; rr(X, x - b / 2, y - b / 2, b, b, b * 0.22); X.fill();
  X.fillStyle = '#ff7a1a'; X.beginPath(); X.arc(x, y, b * 0.4, 0, TAU); X.fill();
  X.fillStyle = '#fff'; X.beginPath(); X.arc(x, y, b * 0.27, 0, TAU); X.fill();
  X.fillStyle = '#ff8a2a'; X.beginPath(); X.arc(x, y, b * 0.17, 0, TAU); X.fill();
  X.fillStyle = '#ffd0a0'; X.beginPath(); X.arc(x - b * 0.04, y - b * 0.04, b * 0.06, 0, TAU); X.fill();
}
function drawStar(X, x, y, s, t) {
  const R = s * 0.3 * (1 + Math.sin(t * 5) * 0.05), wob = Math.sin(t * 3) * 0.15;
  X.fillStyle = 'rgba(0,0,0,.18)'; X.beginPath(); X.ellipse(x + s * 0.06, y + s * 0.2, R * 0.7, R * 0.28, 0, 0, TAU); X.fill();
  const g = X.createRadialGradient(x, y, 0, x, y, R * 1.9); g.addColorStop(0, 'rgba(255,240,140,.6)'); g.addColorStop(1, 'rgba(255,240,140,0)');
  X.fillStyle = g; X.beginPath(); X.arc(x, y, R * 1.9, 0, TAU); X.fill();
  starPath(X, x, y - s * 0.06, R, R * 0.48, wob);
  const sg = X.createLinearGradient(x, y - R, x, y + R); sg.addColorStop(0, '#fff27a'); sg.addColorStop(1, '#ffb800');
  X.fillStyle = sg; X.fill(); X.lineJoin = 'round'; X.lineWidth = Math.max(2, s * 0.045); X.strokeStyle = '#fff'; X.stroke();
  X.fillStyle = 'rgba(255,255,255,.7)'; X.beginPath(); X.arc(x - R * 0.25, y - R * 0.35, R * 0.14, 0, TAU); X.fill();
}

function drawObjects(X) {
  const s = L.s;
  for (const o of st.objs) {
    if (o.got) continue;
    let x = SX(o.lane), y = SY(o.y), rot = 0, alpha = 1;
    if (y < L.top - s * 3 || y > H + s * 2) continue;
    if (o.hit) {
      o.hitT ??= clock;
      const k = clamp((clock - o.hitT) / 0.9, 0, 1);
      if (o.kind === 'auto') { x += o.hitX * Math.sin(k * Math.PI) * s * 0.3; }
      else { x += o.hitX * ease(k) * s * 0.75; rot = o.hitX * ease(k) * 1.4; alpha = 1 - k * 0.65; }
    }
    if (o.kind === 'stern') drawStar(X, x, y, s, clock + o.y);
    else if (o.kind === 'kegel') { X.save(); X.globalAlpha = alpha; X.translate(x, y); X.rotate(rot); drawKegel(X, 0, 0, s); X.restore(); }
    else if (o.kind === 'auto') {
      const k = VERKEHR[(typeof o.id === 'number' ? o.id : 0) % VERKEHR.length], h = s * (k === 'verkehr-bus' ? 1.55 : 1.35);
      X.fillStyle = 'rgba(0,0,0,.25)'; rr(X, x - s * 0.3 + 4, y - h / 2 + 6, s * 0.6, h, s * 0.18); X.fill();
      if (!sprite(X, k, x, y, h, 0, alpha)) { X.fillStyle = '#ff8a7a'; rr(X, x - s * 0.3, y - h / 2, s * 0.6, h, s * 0.15); X.fill(); }
      // Blinker blinkt sanft, wenn man es antippt
      if (o.hit && clock - o.hitT < 0.9 && Math.floor(clock * 6) % 2) { X.fillStyle = 'rgba(255,200,40,.9)'; X.beginPath(); X.arc(x - s * 0.25, y + h * 0.45, s * 0.07, 0, TAU); X.arc(x + s * 0.25, y + h * 0.45, s * 0.07, 0, TAU); X.fill(); }
    } else {
      const w = o.kind === 'absperrung' ? s * 0.92 : s * 0.74, i = IMG[o.kind];
      const h = i ? w * ih(i) / iw(i) : s * 0.3;
      X.fillStyle = 'rgba(0,0,0,.25)'; rr(X, x - w / 2 + 3, y - h / 2 + 5, w, h, 4); X.fill();
      if (!sprite(X, o.kind, x, y, h, rot, alpha)) { X.fillStyle = '#ff6a2a'; X.fillRect(x - w / 2, y - h / 2, w, h); }
    }
  }
}

function drawCar(X) {
  const s = L.s, k = 'auto-' + save.car, i = IMG[k];
  const h = s * 1.5, w = i ? h * iw(i) / ih(i) : s * 0.66;
  let x = SX(st.x), y = L.carY, rot = 0;
  if (st.k < 1) rot += (st.x1 - st.x0) * Math.sin(Math.PI * st.k) * 0.13;
  const hk = clock - hopT;
  if (hk < 0.8) { rot += Math.sin(hk * 24) * 0.2 * (1 - hk / 0.8); y += Math.sin(hk * Math.PI / 0.8) * s * 0.12; }
  const rk = clock - randT;
  if (rk < 0.25) x += randDir * Math.sin(rk / 0.25 * Math.PI) * s * 0.08;
  const blink = st.inv > 0 && Math.floor(clock * 9) % 2 === 0;
  X.save(); X.translate(x, y); X.rotate(rot);
  X.fillStyle = 'rgba(0,0,0,.3)'; rr(X, -w / 2 + 5, -h / 2 + 8, w, h, w * 0.3); X.fill();
  X.globalAlpha = blink ? 0.45 : 1;
  if (i) X.drawImage(i, -w / 2, -h / 2, w, h);
  else { X.fillStyle = '#1ED6E0'; rr(X, -w / 2, -h / 2, w, h, w * 0.3); X.fill(); }
  X.restore();
  // Hoppla-Sprechblase
  if (hk < 1.3) {
    const a = hk < 1 ? 1 : 1 - (hk - 1) / 0.3, sc = ease(hk / 0.25);
    X.save(); X.globalAlpha = a; X.translate(x, y - h * 0.75); X.scale(sc, sc);
    X.font = `700 ${Math.round(s * 0.36)}px Fredoka, system-ui, sans-serif`; X.textAlign = 'center'; X.textBaseline = 'middle';
    const tw = X.measureText('Hoppla!').width + s * 0.4;
    X.fillStyle = '#fff'; rr(X, -tw / 2, -s * 0.28, tw, s * 0.56, s * 0.25); X.fill();
    X.beginPath(); X.moveTo(-s * 0.1, s * 0.26); X.lineTo(s * 0.1, s * 0.26); X.lineTo(0, s * 0.45); X.fill();
    X.fillStyle = '#e83f8a'; X.fillText('Hoppla!', 0, 1);
    X.restore();
    // kleine Sterne kreisen
    for (let n = 0; n < 4; n++) {
      const ang = hk * 6 + n * TAU / 4;
      X.globalAlpha = a; X.fillStyle = '#FFD21C';
      starPath(X, x + Math.cos(ang) * w * 0.8, y - h * 0.15 + Math.sin(ang) * w * 0.35, s * 0.09, s * 0.04); X.fill();
    }
    X.globalAlpha = 1;
  }
}

function drawFinishArch(X) {
  if (st.offset == null) return;
  const s = L.s, fy = SY(st.offset + lv.length) - s * 0.5;
  if (fy < -s * 2 || fy > H + s * 2) return;
  // Banner über der Straße
  X.fillStyle = 'rgba(0,0,0,.2)'; rr(X, L.x0 - s * 0.05 + 6, fy - s * 0.22 + 8, L.x1 - L.x0 + s * 0.1, s * 0.44, s * 0.12); X.fill();
  const g = X.createLinearGradient(L.x0, 0, L.x1, 0); g.addColorStop(0, '#1ED6E0'); g.addColorStop(1, '#FF5FA2');
  X.fillStyle = g; rr(X, L.x0 - s * 0.05, fy - s * 0.22, L.x1 - L.x0 + s * 0.1, s * 0.44, s * 0.12); X.fill();
  X.font = `700 ${Math.round(s * 0.34)}px Fredoka, system-ui, sans-serif`; X.textAlign = 'center'; X.textBaseline = 'middle';
  X.fillStyle = '#fff'; X.fillText('★ ZIEL ★', L.cx, fy + 1);
  // Ballons an den Pfosten
  const cols = ['#FFD21C', '#FF5FA2', '#1ED6E0', '#B9A3F5'];
  for (const side of [-1, 1]) {
    const px = side < 0 ? L.x0 - s * 0.12 : L.x1 + s * 0.12;
    X.fillStyle = '#ece6dc'; X.beginPath(); X.arc(px, fy, s * 0.1, 0, TAU); X.fill();
    for (let n = 0; n < 4; n++) {
      const a = n * TAU / 4 + Math.sin(clock * 2 + n) * 0.2;
      X.fillStyle = cols[n]; X.beginPath(); X.arc(px + Math.cos(a) * s * 0.2, fy + Math.sin(a) * s * 0.2, s * 0.15, 0, TAU); X.fill();
      X.fillStyle = 'rgba(255,255,255,.55)'; X.beginPath(); X.arc(px + Math.cos(a) * s * 0.2 - s * 0.04, fy + Math.sin(a) * s * 0.2 - s * 0.05, s * 0.04, 0, TAU); X.fill();
    }
  }
}

function drawTutorial(X) {
  if (!st || (st.phase !== 'links' && st.phase !== 'rechts')) return;
  const s = L.s, dir = st.phase === 'links' ? -1 : 1, from = st.x, to = st.target + dir <= 1 && st.target + dir >= -1 ? st.target + dir : st.target;
  if (st.phase === 'rechts' && st.target === 1) return;
  const k = (clock * 0.8) % 1, x0 = SX(from), y0 = L.carY - s * 1.1, x1 = SX(to), y1 = L.carY - s * 2.6;
  X.save(); X.globalAlpha = 0.9 - k * 0.3;
  X.lineCap = 'round'; X.lineJoin = 'round';
  for (const [col, lw] of [['#fff', s * 0.28], ['#FFD21C', s * 0.17]]) {
    X.strokeStyle = col; X.lineWidth = lw;
    X.beginPath(); X.moveTo(x0, y0); X.quadraticCurveTo(x0, y1 + s * 0.4, x1, y1); X.stroke();
    X.beginPath(); X.moveTo(x1 - dir * s * 0.35, y1 - s * 0.32); X.lineTo(x1, y1); X.lineTo(x1 - dir * s * 0.38, y1 + s * 0.26); X.stroke();
  }
  X.restore();
}

function drawParticles(X, dt) {
  for (const p of parts) {
    p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.92; p.vy *= 0.92;
    const a = 1 - p.t / p.life; if (a <= 0) continue;
    X.globalAlpha = a; X.fillStyle = p.col;
    if (p.star) { starPath(X, p.x, p.y, p.r * 1.8, p.r * 0.8); X.fill(); } else { X.beginPath(); X.arc(p.x, p.y, p.r, 0, TAU); X.fill(); }
  }
  parts = parts.filter((p) => p.t < p.life);
  for (const c of confetti) {
    c.x += c.vx * dt; c.y += c.vy * dt; c.rot += c.vr * dt;
    X.globalAlpha = 1; X.save(); X.translate(c.x, c.y); X.rotate(c.rot); X.fillStyle = c.col; X.fillRect(-c.w / 2, -c.w / 4, c.w, c.w / 2); X.restore();
  }
  confetti = confetti.filter((c) => c.y < H + 20);
  X.globalAlpha = 1;
}

let lastRender = 0;
function render(now) {
  const X = ctx, dt = Math.min(0.05, (now - lastRender) / 1000 || 0); lastRender = now;
  X.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (!st) { X.fillStyle = '#1f2a52'; X.fillRect(0, 0, W, H); return; }
  drawGround(X);
  drawSidesItems(X, 0, 1);
  drawPeds(X);
  drawSidesItems(X, 2, 2);
  drawRoad(X);
  drawObjects(X);
  drawFinishArch(X);
  drawSidesItems(X, 3, 3);
  drawCar(X);
  drawTutorial(X);
  drawParticles(X, mode === 'pause' ? 0 : dt);
}

// ---------- Ereignisse aus der Fahrt ----------
function handleEvents() {
  for (const e of st.events) {
    if (e.e === 'stern') {
      combo = clock - comboT < 1.2 ? combo + 1 : 0; comboT = clock;
      SFX.stern();
      burst(SX(e.o.lane), SY(e.o.y), 12, ['#FFD21C', '#fff27a', '#ffffff']);
      const c = $('chipStars'); c.classList.remove('pop'); void c.offsetWidth; c.classList.add('pop');
    } else if (e.e === 'hoppla') {
      hopT = clock; SFX.hoppla(); if (e.o.kind === 'auto') SFX.hupe();
      burst(SX(st.x), L.carY - L.s * 0.6, 10, ['#B9A3F5', '#fff', '#FF5FA2'], 120);
      try { navigator.vibrate && navigator.vibrate(30); } catch { /* egal */ }
    } else if (e.e === 'spur') SFX.spur();
    else if (e.e === 'rand') { SFX.rand(); randT = clock; randDir = e.dir; }
    else if (e.e === 'lerne') { SFX.lerne(); lernUI(); if (e.phase === 'fertig') showTip(lv.tip.icon, lv.tip.text, 3.2); }
    else if (e.e === 'ziel') { SFX.ziel(); confettiRain(); }
    else if (e.e === 'fertig') finish();
  }
  st.events.length = 0;
}

function finish() {
  const vorher = { best: { ...save.best } };
  lastResult = { ...recordWin(save, lv, st, LEVEL_COUNT), got: st.gotLevel, total: lv.stars, erstes: !vorher.best[levelNo] };
  persist();
  setMode('won');
}

// ---------- HUD, Tipps, Lernhilfe ----------
function updateHud() {
  if (!st) return;
  const pr = progress(st), key = `${st.got}|${Math.round(pr * 200)}`;
  if (key === hudCache) return;
  hudCache = key;
  $('hudStars').textContent = String(st.got);
  $('bahnFill').style.width = `calc(${(pr * 100).toFixed(1)}% - ${pr * 6}px)`;
  $('bahnAuto').style.left = (pr * 100).toFixed(1) + '%';
  $('bahn').setAttribute('aria-valuenow', String(Math.round(pr * 100)));
}
function showTip(icon, text, secs) {
  $('tipIcon').textContent = icon; $('tipText').textContent = text; $('tipLevel').textContent = `Level ${levelNo} · ${lv.name}`;
  $('tip').classList.remove('away'); tipTimer = secs;
}
function hideTip() { $('tip').classList.add('away'); tipTimer = 0; }
function lernUI() {
  const ph = st ? st.phase : 'fahrt';
  $('btnL').classList.toggle('lern', ph === 'links'); $('handL').hidden = ph !== 'links';
  $('btnR').classList.toggle('lern', ph === 'rechts'); $('handR').hidden = ph !== 'rechts';
  if (ph === 'links') showTip('⬅️', 'Tippe auf den linken Pfeil!', 999);
  else if (ph === 'rechts') showTip('➡️', 'Super! Jetzt nach rechts!', 999);
}

// ---------- Bildschirme ----------
const SCREENS = ['start', 'levels', 'autos', 'pause', 'win'];
function show(id) { for (const s of SCREENS) $(s).hidden = s !== id; }
function setMode(m) {
  mode = m;
  $('hud').classList.toggle('off', m === 'menu');
  $('ctl').classList.toggle('off', m !== 'play');
  if (m === 'play') { show(null); downL.clear(); downR.clear(); paintDown(); }
  if (m === 'pause') { show('pause'); $('uhr').textContent = new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }); setTimeout(() => $('pResume').focus({ preventScroll: true }), 30); }
  if (m === 'won') showWin();
  if (m !== 'play') { $('handL').hidden = $('handR').hidden = true; }
  if (m === 'won' || m === 'menu') hideTip();
  document.body.dataset.mode = m;
  radioSync();
}
const STAR_SVG = (on) => `<svg viewBox="0 0 24 24" class="${on ? 'on' : ''}" aria-hidden="true"><path d="M12 2l2.9 6.3 6.9.7-5.2 4.6 1.5 6.8L12 17l-6.1 3.4 1.5-6.8L2.2 9l6.9-.7z" fill="${on ? '#FFD21C' : 'rgba(255,255,255,.2)'}" stroke="${on ? '#c48a00' : 'rgba(255,255,255,.35)'}" stroke-width="1.2" stroke-linejoin="round"/></svg>`;
const STAR_SMALL = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l2.9 6.3 6.9.7-5.2 4.6 1.5 6.8L12 17l-6.1 3.4 1.5-6.8L2.2 9l6.9-.7z" fill="#FFD21C" stroke="#c48a00" stroke-width="1.3" stroke-linejoin="round"/></svg>';
function showWin() {
  const r = lastResult, last = levelNo === LEVEL_COUNT;
  $('winTitle').textContent = last ? 'Großer Sieger!' : ['Super gefahren!', 'Klasse!', 'Toll gemacht!', 'Wow, super!'][levelNo % 4];
  $('winSub').textContent = `Level ${levelNo} · ${lv.name}`;
  $('winAuto').src = imgUrl('auto-' + save.car); $('winAuto').alt = AUTOS[save.car].name;
  $('winStars').innerHTML = [0, 1, 2].map((i) => STAR_SVG(i < r.stars)).join('');
  $('winStars').setAttribute('aria-label', `${r.stars} von 3 Auszeichnungssternen`);
  $('winZahl').innerHTML = `${STAR_SMALL}<span>${r.got} von ${r.total} Sternen</span>`;
  for (let i = 0; i < r.stars; i++) SFX.award(i);
  $('winNeu').hidden = !r.neuAuto;
  if (r.neuAuto) { $('winNeuImg').src = imgUrl('auto-' + r.neuAuto); $('winNeuText').textContent = `Neues Auto: ${AUTOS[r.neuAuto].name}! Wähle es unter „Autos“.`; SFX.neu(); }
  $('winNext').querySelector('.lbl').textContent = last ? 'Fertig' : 'Weiter';
  $('winNext').setAttribute('aria-label', last ? 'Fertig, zur Levelauswahl' : 'Weiter zu Level ' + (levelNo + 1));
  show('win');
  kontoHinweis('kontoBox');
  setTimeout(() => $('winNext').focus({ preventScroll: true }), 50);
}
function nextLevel() { for (let n = 1; n <= save.unlocked; n++) if (!save.best[n]) return n; return Math.min(save.unlocked, LEVEL_COUNT); }
function openMenu() {
  st = null; setMode('menu'); show('start');
  const box = $('inviteBox');
  if (invite) { box.hidden = false; box.textContent = `🚗 Du wurdest zu Level ${invite.l} eingeladen: „${LEVELS[invite.l - 1].name}“`; $('playLabel').textContent = 'Los geht’s'; }
  else { box.hidden = true; $('playLabel').textContent = save.best[1] ? 'Weiterfahren' : 'Losfahren'; }
  kontoHinweis('kontoBoxMenu');
}
const WELT = { stadt: 'Stadt', strand: 'Strandpromenade', hafen: 'Hafen' };
function openLevels(from) {
  backTo = from || (mode === 'pause' ? 'pause' : 'start');
  const g = $('levelGrid'); g.innerHTML = '';
  const nx = nextLevel();
  $('levelStars').textContent = `★ ${totalAwards(save)} von ${LEVEL_COUNT * 3}`;
  for (const w of ['stadt', 'strand', 'hafen']) {
    const h = document.createElement('div'); h.className = 'welt'; h.textContent = WELT[w]; g.appendChild(h);
    const row = document.createElement('div'); row.className = 'grid'; g.appendChild(row);
    for (const l of LEVELS.filter((x) => x.welt === w)) {
      const n = l.id, b = document.createElement('button'), best = save.best[n];
      const locked = n > save.unlocked && !(invite && invite.l === n);
      b.className = 'lvl' + (n === nx && !best ? ' next' : ''); b.dataset.w = w;
      b.disabled = locked;
      b.innerHTML = `${n}${best ? `<small>${'★'.repeat(best)}${'☆'.repeat(3 - best)}</small>` : ''}`;
      b.setAttribute('aria-label', `Level ${n}: ${l.name}${best ? `, ${best} von 3 Sternen` : locked ? ', gesperrt' : ''}`);
      b.addEventListener('click', () => { unlockAudio(); SFX.click(); startLevel(n); });
      row.appendChild(b);
    }
  }
  if (mode !== 'pause') setMode('menu');
  show('levels');
}
function openAutos(from) {
  backTo = from || (mode === 'pause' ? 'pause' : 'start');
  const g = $('garage'); g.innerHTML = '';
  const frei = carsUnlocked(save);
  for (const id of AUTO_IDS) {
    const on = frei.includes(id), b = document.createElement('button');
    b.className = 'auto' + (save.car === id ? ' on' : ''); b.disabled = !on;
    b.innerHTML = `<img src="${imgUrl('auto-' + id)}" alt="" loading="lazy"><span>${on ? AUTOS[id].name : '???'}</span>${on ? '' : `<span class="lock">🔒 nach Level ${AUTOS[id].ab}</span>`}`;
    b.setAttribute('aria-label', on ? `${AUTOS[id].name}${save.car === id ? ', ausgewählt' : ''}` : `Gesperrt, frei nach Level ${AUTOS[id].ab}`);
    b.setAttribute('aria-pressed', String(save.car === id));
    b.addEventListener('click', () => { SFX.click(); save.car = id; persist(); openAutos(backTo); });
    g.appendChild(b);
  }
  if (mode !== 'pause') setMode('menu');
  show('autos');
}
function back() { SFX.click(); if (backTo === 'pause' && st) { setMode('pause'); } else openMenu(); }

function startLevel(n) {
  levelNo = n; lv = LEVELS[n - 1];
  st = newRun(lv, { tutorial: n === 1 && !save.best[1] });
  segCache.clear(); peds = []; pedNext = 0; parts = []; confetti = []; hopT = -9; randT = -9; hudCache = '';
  // Gehweg gleich zu Beginn belebt
  for (let i = 0; i < 6; i++) { pedNext = 0; st.p = -2 + i * 2.2 - L.ahead - 2; updatePeds(0); }
  st.p = 0; pedNext = 4;
  setMode('play');
  updateHud();
  if (st.phase === 'links') lernUI(); else { lernUI(); showTip(lv.tip.icon, lv.tip.text, 3.2); }
}
function pause() { if (mode === 'play') setMode('pause'); }
function resume() { if (mode === 'pause' && st) { setMode('play'); if (st.phase === 'links' || st.phase === 'rechts') lernUI(); } }
function toast(text) { const t = $('toast'); t.textContent = text; t.hidden = false; clearTimeout(toast.h); toast.h = setTimeout(() => (t.hidden = true), 3200); }

async function share() {
  const url = `${location.origin}/spiele/sternenfahrt?l=${levelNo}`;
  const text = `Neon Coast – Sternenfahrt, Level ${levelNo}: Ich habe ${lastResult.got} Sterne gesammelt! Schaffst du mehr?`;
  if (navigator.share) { try { await navigator.share({ title: 'Neon Coast – Sternenfahrt', text, url }); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
  try { await navigator.clipboard.writeText(text + ' ' + url); toast('Link kopiert – schick ihn deinen Freunden!'); } catch { toast(url); }
}

// Hinweis aufs Konto: nur ohne Anmeldung und erst, wenn es etwas zu verlieren gibt
function kontoHinweis(id) {
  const P = window.PlaySaal, n = Object.keys(save.best).length;
  const meilenstein = id === 'kontoBoxMenu' || [2, 4, 7, 10].includes(n);
  let zeigen = false;
  try { zeigen = !!(P && P.hostOk && !P.user() && n >= 2 && meilenstein); } catch { zeigen = false; }
  $(id).hidden = !zeigen;
}
function kontoAnlegen() { try { window.PlaySaal && window.PlaySaal.anmelden({}); } catch { /* Konten nicht verfügbar */ } }
$('kontoBtn').addEventListener('click', kontoAnlegen);
$('kontoBtnMenu').addEventListener('click', kontoAnlegen);
setTimeout(() => { if (mode === 'menu' && !$('start').hidden) kontoHinweis('kontoBoxMenu'); }, 1500);

// ---------- Steuerung ----------
// Jeder Druck (Finger, Maus, Taste) = genau eine Spur. Gedrückthalten und Tastenwiederholung lösen nichts weiter aus.
const downL = new Set(), downR = new Set();
function paintDown() { $('btnL').classList.toggle('down', downL.size > 0); $('btnR').classList.toggle('down', downR.size > 0); }
function steer(dir) {
  if (mode !== 'play' || !st) return;
  unlockAudio();
  press(st, dir);
}
for (const [id, dir, set] of [['btnL', -1, downL], ['btnR', 1, downR]]) {
  const b = $(id);
  b.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (set.has(e.pointerId)) return;
    set.add(e.pointerId); paintDown();
    try { b.setPointerCapture(e.pointerId); } catch { /* egal */ }
    steer(dir);
  });
  const up = (e) => { set.delete(e.pointerId); paintDown(); };
  b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('lostpointercapture', up);
  b.addEventListener('click', (e) => e.preventDefault());
  b.addEventListener('contextmenu', (e) => e.preventDefault());
}
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') { if (mode === 'play') pause(); else if (mode === 'pause') resume(); return; }
  if (mode !== 'play') return;
  const dir = e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A' ? -1 : e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D' ? 1 : 0;
  if (!dir) return;
  e.preventDefault();
  if (e.repeat) return;
  (dir < 0 ? downL : downR).add('key'); paintDown();
  steer(dir);
});
document.addEventListener('keyup', (e) => {
  if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') downL.delete('key');
  if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') downR.delete('key');
  paintDown();
});
// Kein Zoomen, kein Scrollen beim Spielen (iOS-Gesten, Doppeltipp)
for (const ev of ['gesturestart', 'gesturechange', 'dblclick']) document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
cv.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
$('ctl').addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });

$('btnPlay').addEventListener('click', () => { unlockAudio(); SFX.click(); startLevel(invite && invite.l <= LEVEL_COUNT ? invite.l : nextLevel()); });
$('btnLevels').addEventListener('click', () => { unlockAudio(); SFX.click(); openLevels('start'); });
$('btnAutos').addEventListener('click', () => { unlockAudio(); SFX.click(); openAutos('start'); });
$('levelsBack').addEventListener('click', back);
$('autosBack').addEventListener('click', back);
$('btnPhone').addEventListener('click', () => { unlockAudio(); SFX.click(); pause(); });
$('pResume').addEventListener('click', () => { SFX.click(); resume(); });
$('pLevels').addEventListener('click', () => { SFX.click(); openLevels('pause'); });
$('pAutos').addEventListener('click', () => { SFX.click(); openAutos('pause'); });
$('winNext').addEventListener('click', () => { unlockAudio(); SFX.click(); if (levelNo >= LEVEL_COUNT) openLevels('start'); else startLevel(levelNo + 1 <= save.unlocked ? levelNo + 1 : nextLevel()); });
$('winAgain').addEventListener('click', () => { SFX.click(); startLevel(levelNo); });
$('winLevels').addEventListener('click', () => { SFX.click(); openLevels('start'); });
$('winShare').addEventListener('click', () => { SFX.click(); share(); });
document.querySelectorAll('[data-mute]').forEach((b) => b.addEventListener('click', () => toggleMute()));
// Pause beim Tab-Wechsel oder wenn das Fenster den Fokus verliert
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); radioSync(); });
window.addEventListener('blur', () => pause());
window.addEventListener('pagehide', () => pause());

// ---------- Schleife ----------
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.25, Math.max(0, (now - last) / 1000)); last = now;
  if (mode === 'play' && st) {
    clock += dt;
    advance(st, dt);
    updatePeds(dt);
    handleEvents();
    updateHud();
    if (tipTimer > 0 && tipTimer < 900) { tipTimer -= dt; if (tipTimer <= 0) hideTip(); }
    if (sender >= 0 && !tuning && clock >= radioNext && radioWant()) umschalten();
  } else if (mode === 'won' && st) { clock += dt; }
  render(now);
  requestAnimationFrame(frame);
}

// Testzugang (nur für automatisierte Prüfungen)
window.__fahrt = {
  get mode() { return mode; }, get st() { return st; }, get save() { return save; }, get level() { return levelNo; },
  get layout() { return { ...L, W, H }; }, start: (n) => startLevel(n)
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
requestAnimationFrame((t) => { last = t; lastRender = t; frame(t); });
