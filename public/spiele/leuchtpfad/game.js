// Leuchtpfad – Oberfläche: Canvas-2D-Nachtwiese, Lumi zeigt den Weg, Kind läuft ihn nach (antippen oder mit dem Finger ziehen).
// Alles wird gezeichnet. Liegen Bilder von ChatGPT in img/ (Liste img/manifest.json), ersetzen sie Hintergrund, Lumi und Pilzhaus.
import { LEVELS, LEVEL_COUNT, WELTEN } from './levels.js';
import {
  STORE, brett, zeigeDauer, helligkeit, irrHelligkeit, lumiBeimZeigen, neuerLauf, tippe, hinweis,
  rekordRunde, REKORD_START, freshSave, sanitizeSave, recordWin, totalStars, parseInvite
} from './engine.js';

const $ = (id) => document.getElementById(id);
const app = $('app'), cv = $('game'), ctx = cv.getContext('2d');
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, k) => a + (b - a) * k;
const ease = (k) => 1 - Math.pow(1 - clamp(k, 0, 1), 3);
const TAU = Math.PI * 2;
const SCHNELL = new URLSearchParams(location.search).has('schnell') ? 6 : 1;   // nur für automatische Prüfungen

// ---------- Bilder (optional) ----------
const IMG = {};
const base = new URL('img/', import.meta.url);
async function loadImages() {
  let list = [];
  try { const r = await fetch(new URL('manifest.json', base)); if (r.ok) list = await r.json(); } catch { list = []; }
  if (!Array.isArray(list)) list = [];
  await Promise.all(list.map((k) => new Promise((res) => {
    const i = new Image(); i.decoding = 'async';
    i.onload = () => { IMG[k] = i; res(); }; i.onerror = () => res();
    i.src = new URL(k + '.webp', base).href;
  })));
}

// ---------- Spielstand ----------
let save = freshSave();
try { save = sanitizeSave(JSON.parse(localStorage.getItem(STORE)), LEVEL_COUNT); } catch { /* Privatmodus */ }
const persist = () => { try { localStorage.setItem(STORE, JSON.stringify(save)); } catch { /* gesperrt */ } };
const invite = parseInvite(location.search, LEVEL_COUNT);

// ---------- Ton (WebAudio, erst nach der ersten Berührung) ----------
let actx = null;
function unlockAudio() {
  if (save.mute) return;
  try { actx ??= new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === 'suspended') actx.resume(); } catch { actx = null; }
}
function tone(freq, dur, type = 'sine', vol = 0.1, slide = 0, delay = 0) {
  if (save.mute || !actx) return;
  try {
    const t = actx.currentTime + delay, o = actx.createOscillator(), g = actx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(actx.destination); o.start(t); o.stop(t + dur + 0.05);
  } catch { /* egal */ }
}
// Jeder Stein im Weg hat seinen eigenen Ton (Pentatonik) – die Melodie hilft beim Merken
const PENTA = [0, 2, 4, 7, 9];
const note = (i) => 392 * Math.pow(2, (PENTA[i % 5] + 12 * Math.floor(i / 5)) / 12 / 1.6);
const SFX = {
  stein: (i) => { tone(note(i), 0.32, 'triangle', 0.09); tone(note(i) * 2, 0.2, 'sine', 0.025, 0, 0.01); },
  irr: () => { tone(300, 0.4, 'sine', 0.05, 1.5); tone(310, 0.4, 'sine', 0.04, 0.7, 0.05); },
  aus: () => tone(520, 0.4, 'sine', 0.04, 0.5),
  falsch: () => { tone(330, 0.18, 'square', 0.04, 0.7); tone(220, 0.3, 'triangle', 0.08, 0.6, 0.12); },
  ziel: () => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.25, 'triangle', 0.08, 0, i * 0.08)),
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
function toggleMute() { save.mute = !save.mute; persist(); if (!save.mute) { unlockAudio(); SFX.click(); } paintMute(); }

// ---------- Zustand ----------
let mode = 'menu';          // menu | show | play | oops | cheer | won | over | pause
let pausedFrom = 'play';
let art = 'level';          // level | rekord
let levelNo = 1, welt = 1, b = null, lauf = null;
let showT = 0, phaseT = 0, idleT = 0;
let lastResult = null;
let rek = { len: REKORD_START, leben: 3, best: 0, neu: false };
const lumi = { x: 0, y: 0, fx: 0, fy: 0, tx: 0, ty: 0, t: 1, dur: 0.22, hop: 1, dir: 1 };
const shake = new Map();    // Zelle -> Restzeit
const funken = [];          // Glitzer beim Ziel
const flieger = Array.from({ length: 16 }, (_, i) => ({ x: (i * 0.618) % 1, y: ((i * 0.37) % 1), p: i * 1.7, s: 0.6 + (i % 3) * 0.3 }));
let lastShowLit = -1, irrGespielt = new Set();

// ---------- Größe und Aufbau ----------
let W = 360, H = 640, dpr = 1, sabEl = null;
function safeBottom() {
  if (!sabEl) { sabEl = document.createElement('div'); sabEl.style.cssText = 'position:absolute;visibility:hidden;padding-bottom:env(safe-area-inset-bottom,0px)'; app.appendChild(sabEl); }
  return parseFloat(getComputedStyle(sabEl).paddingBottom) || 0;
}
const L = { bx: 0, by: 0, cs: 60 };
let bgCache = null, bgKey = '';
function resize() {
  W = app.clientWidth; H = app.clientHeight; dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  cv.style.width = W + 'px'; cv.style.height = H + 'px';
  if (b) {
    const top = 118, bottom = H - safeBottom() - 70;
    const cs = Math.min((W - 20) / b.cols, (bottom - top) / (b.rows + 0.55), 120);
    L.cs = cs; L.bx = (W - cs * b.cols) / 2; L.by = top + cs * 0.55 + Math.max(0, (bottom - top - cs * (b.rows + 0.55)) / 2);
    const s = mitte(lauf && mode !== 'show' ? b.path[lauf.pos] : b.path[0]);
    lumi.x = lumi.tx = s.x; lumi.y = lumi.ty = s.y; lumi.t = 1;
  }
  bgKey = '';
}
function mitte(cell) { return { x: L.bx + ((cell % b.cols) + 0.5) * L.cs, y: L.by + (Math.floor(cell / b.cols) + 0.5) * L.cs }; }
function zelleBei(x, y) {
  if (!b) return -1;
  const c = Math.floor((x - L.bx) / L.cs), r = Math.floor((y - L.by) / L.cs);
  if (c < 0 || r < 0 || c >= b.cols || r >= b.rows) return -1;
  const cell = r * b.cols + c, m = mitte(cell);
  return Math.hypot(x - m.x, (y - m.y) * 1.15) <= L.cs * 0.44 ? cell : -1;
}

// ---------- Ablauf ----------
function ansage(ic, text) { $('ansageIc').textContent = ic; $('ansageText').textContent = text; $('ansage').classList.remove('away'); }
function ansageWeg() { $('ansage').classList.add('away'); }
function zeigeTipp(text) {
  const t = $('tip');
  if (!text) { t.classList.add('away'); return; }
  t.textContent = text; t.classList.remove('away');
  clearTimeout(zeigeTipp.h); zeigeTipp.h = setTimeout(() => t.classList.add('away'), 5200 / SCHNELL);
}

function lumiNach(cell, dur = 0.22, hop = 1) {
  const m = mitte(cell);
  lumi.fx = lumi.x; lumi.fy = lumi.y; lumi.tx = m.x; lumi.ty = m.y; lumi.t = 0; lumi.dur = dur; lumi.hop = hop;
  if (Math.abs(m.x - lumi.x) > 1) lumi.dir = m.x > lumi.x ? 1 : -1;
}

function startShow() {
  mode = 'show'; showT = 0; idleT = 0; lastShowLit = -1; irrGespielt = new Set();
  const s = mitte(b.path[0]); lumi.x = lumi.tx = s.x; lumi.y = lumi.ty = s.y; lumi.t = 1;
  $('btnZeig').hidden = true; $('btnZeig').classList.remove('wink');
  ansage('👀', 'Schau genau!');
  setMode('show');
}
function startPlay() {
  mode = 'play'; idleT = 0;
  $('btnZeig').hidden = false;
  ansage('👆', lauf.fehler + lauf.hinweise ? 'Jetzt du – du schaffst das!' : 'Jetzt du!');
  setMode('play');
}

function startLevel(n) {
  art = 'level'; levelNo = n; const def = LEVELS[n - 1]; welt = def.welt;
  b = brett(def); lauf = neuerLauf(); shake.clear(); funken.length = 0;
  resize(); updateHud();
  zeigeTipp(def.tipp);
  startShow();
}
function startRekord() {
  art = 'rekord'; welt = 3; rek = { len: REKORD_START, leben: 3, best: 0, neu: false };
  neueRunde();
}
function neueRunde() {
  b = rekordRunde((Math.random() * 2 ** 31) >>> 0, rek.len); lauf = neuerLauf(); shake.clear(); funken.length = 0;
  welt = rek.len < 8 ? 1 : rek.len < 13 ? 2 : 3;
  resize(); updateHud();
  zeigeTipp(rek.len === REKORD_START ? 'Rekordpfad: Jeder Weg wird einen Stein länger. Du hast 3 Leben!' : '');
  startShow();
}

function tippen(cell) {
  if (mode !== 'play' || cell < 0) return;
  const r = tippe(b, lauf, cell);
  if (r === 'still') return;
  idleT = 0; $('btnZeig').classList.remove('wink');
  if (r === 'gut' || r === 'ziel') {
    SFX.stein(lauf.pos);
    lumiNach(cell);
    if (r === 'ziel') {
      SFX.ziel(); mode = 'cheer'; phaseT = 0; $('btnZeig').hidden = true;
      ansage('🍄', art === 'rekord' ? `Super! ${b.path.length} Steine!` : 'Lumi ist zu Hause!');
      const m = mitte(cell);
      for (let i = 0; i < 26; i++) funken.push({ x: m.x, y: m.y - L.cs * 0.4, vx: Math.cos(i) * (40 + i * 6), vy: -60 - (i % 7) * 25, t: 0, life: 1 + (i % 5) * 0.15 });
      if (art === 'rekord') {
        rek.best = Math.max(rek.best, b.path.length);
        if (rek.best > save.rekord) { save.rekord = rek.best; rek.neu = true; persist(); }
      }
      setMode('cheer');
    }
    return;
  }
  // falsch
  SFX.falsch(); shake.set(cell, 0.6);
  if (art === 'rekord') { rek.leben--; updateHud(); }
  mode = 'oops'; phaseT = 0; $('btnZeig').hidden = true;
  ansage('🙈', art === 'rekord' && rek.leben <= 0 ? 'Hoppla!' : 'Hoppla! Lumi zeigt es dir nochmal.');
  setTimeout(() => { if (mode === 'oops') lumiNach(b.path[0], 0.55, 2.2); }, 350 / SCHNELL);
  setMode('oops');
}

function nochmalZeigen() {
  if (mode !== 'play') return;
  hinweis(lauf);
  startShow();
}

function finishLevel() {
  const res = recordWin(save, levelNo, lauf, LEVEL_COUNT); persist();
  lastResult = res;
  mode = 'won'; setMode('won');
}

function update(dt) {
  const ms = dt * 1000 * SCHNELL;
  // Lumi bewegen
  if (lumi.t < 1) {
    lumi.t = Math.min(1, lumi.t + dt * SCHNELL / lumi.dur);
    const k = ease(lumi.t);
    lumi.x = lerp(lumi.fx, lumi.tx, k);
    lumi.y = lerp(lumi.fy, lumi.ty, k) - Math.sin(Math.PI * lumi.t) * L.cs * 0.28 * lumi.hop;
  }
  for (const [c, t] of shake) { if (t - dt <= 0) shake.delete(c); else shake.set(c, t - dt); }
  for (let i = funken.length - 1; i >= 0; i--) {
    const f = funken[i]; f.t += dt; f.x += f.vx * dt; f.y += f.vy * dt; f.vy += 160 * dt;
    if (f.t > f.life) funken.splice(i, 1);
  }
  if (mode === 'show') {
    showT += ms;
    const fl = lumiBeimZeigen(b, showT), i0 = Math.floor(fl), i1 = Math.min(b.path.length - 1, i0 + 1);
    const a = mitte(b.path[i0]), c = mitte(b.path[i1]), k = ease((fl - i0) * 1.6);
    lumi.x = lerp(a.x, c.x, k); lumi.y = lerp(a.y, c.y, k) - Math.sin(Math.PI * clamp((fl - i0) * 1.6, 0, 1)) * L.cs * 0.3;
    if (c.x !== a.x) lumi.dir = c.x > a.x ? 1 : -1;
    const lit = Math.min(b.path.length - 1, Math.floor(showT / b.step));
    if (lit > lastShowLit) { for (let i = lastShowLit + 1; i <= lit; i++) SFX.stein(i); lastShowLit = lit; }
    for (const ir of b.irr) if (!irrGespielt.has(ir.cell) && irrHelligkeit(b, ir, showT) > 0.5) { irrGespielt.add(ir.cell); SFX.irr(); }
    if (showT >= zeigeDauer(b)) {
      SFX.aus();
      lumiNach(b.path[0], 0.5, 1.5);   // Lumi fliegt zurück zum Start, jetzt ist das Kind dran
      startPlay();
    }
  } else if (mode === 'play') {
    idleT += dt;
    if (idleT > 7 && art === 'level') $('btnZeig').classList.add('wink');
  } else if (mode === 'oops') {
    phaseT += ms;
    if (phaseT > 1300) {
      if (art === 'rekord' && rek.leben <= 0) { mode = 'over'; setMode('over'); }
      else startShow();
    }
  } else if (mode === 'cheer') {
    phaseT += ms;
    if (phaseT > 1500) {
      if (art === 'rekord') { rek.len++; neueRunde(); }
      else finishLevel();
    }
  }
}

// ---------- Zeichnen ----------
const WELT_FARBEN = {
  1: { himmel: ['#1d2463', '#2d3a86', '#3c4f8f'], boden: '#1f4a3a', gras: '#2f6b4c', stein: '#566091' },
  2: { himmel: ['#0f2133', '#173a46', '#1f4a4a'], boden: '#163628', gras: '#24573d', stein: '#55707a' },
  3: { himmel: ['#120f3a', '#22225e', '#2c3a78'], boden: '#1a2c55', gras: '#26406e', stein: '#5c63a3' }
};
function hintergrund() {
  const key = `${W}x${H}x${dpr}x${welt}x${!!IMG['welt-' + welt]}`;
  if (key === bgKey && bgCache) return bgCache;
  bgKey = key;
  bgCache ??= document.createElement('canvas');
  bgCache.width = cv.width; bgCache.height = cv.height;
  const X = bgCache.getContext('2d'); X.setTransform(dpr, 0, 0, dpr, 0, 0);
  const F = WELT_FARBEN[welt], img = IMG['welt-' + welt];
  if (img) {
    const k = Math.max(W / img.naturalWidth, H / img.naturalHeight), w = img.naturalWidth * k, h = img.naturalHeight * k;
    X.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
    X.fillStyle = 'rgba(8,10,30,.25)'; X.fillRect(0, 0, W, H);
    return bgCache;
  }
  const g = X.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, F.himmel[0]); g.addColorStop(0.5, F.himmel[1]); g.addColorStop(1, F.himmel[2]);
  X.fillStyle = g; X.fillRect(0, 0, W, H);
  // Sterne
  for (let i = 0; i < 70; i++) {
    const x = (i * 97.3) % W, y = (i * 53.7) % (H * 0.32), r = 0.6 + (i % 3) * 0.5;
    X.fillStyle = `rgba(255,255,240,${0.35 + (i % 4) * 0.15})`; X.beginPath(); X.arc(x, y, r, 0, TAU); X.fill();
  }
  // Mond
  X.fillStyle = '#fff6c8'; X.beginPath(); X.arc(W * 0.82, H * 0.13, Math.min(W, H) * 0.06, 0, TAU); X.fill();
  X.fillStyle = F.himmel[0]; X.beginPath(); X.arc(W * 0.82 + Math.min(W, H) * 0.028, H * 0.13 - 4, Math.min(W, H) * 0.055, 0, TAU); X.fill();
  // Weltbesonderheit im Hintergrund
  if (welt === 2) {
    for (let i = 0; i < 9; i++) {
      const x = (i + 0.3) * W / 8.5, h = H * (0.2 + (i % 3) * 0.06), y = H * 0.36;
      X.fillStyle = i % 2 ? '#0d2a26' : '#123630';
      X.beginPath(); X.moveTo(x, y - h); X.lineTo(x - W * 0.09, y); X.lineTo(x + W * 0.09, y); X.fill();
    }
  }
  // Hügel / Boden
  X.fillStyle = F.boden;
  X.beginPath(); X.moveTo(0, H * 0.34);
  for (let x = 0; x <= W; x += W / 12) X.lineTo(x, H * 0.33 + Math.sin(x / W * 5 + welt) * H * 0.02);
  X.lineTo(W, H); X.lineTo(0, H); X.fill();
  if (welt === 3) {   // Mondsee: Wasserglitzern
    for (let i = 0; i < 40; i++) {
      const x = (i * 61.7) % W, y = H * 0.38 + (i * 37.1) % (H * 0.6);
      X.strokeStyle = 'rgba(180,200,255,.16)'; X.lineWidth = 2; X.beginPath(); X.moveTo(x, y); X.lineTo(x + 14 + (i % 4) * 6, y); X.stroke();
    }
  }
  // Grashalme und Blumen
  for (let i = 0; i < 90; i++) {
    const x = (i * 41.3) % W, y = H * 0.36 + (i * 71.9) % (H * 0.64);
    X.strokeStyle = F.gras; X.lineWidth = 2; X.lineCap = 'round';
    X.beginPath(); X.moveTo(x, y); X.quadraticCurveTo(x + 3, y - 7, x + 1, y - 12); X.stroke();
    if (welt === 1 && i % 6 === 0) { X.fillStyle = ['#ff9ad5', '#ffd21c', '#9ad7ff'][i % 3]; X.beginPath(); X.arc(x + 1, y - 13, 2.6, 0, TAU); X.fill(); }
    if (welt === 2 && i % 9 === 0) { X.fillStyle = '#c94a3a'; X.beginPath(); X.ellipse(x, y - 4, 5, 3.5, 0, Math.PI, TAU); X.fill(); X.fillStyle = '#e8dcc0'; X.fillRect(x - 1.5, y - 4, 3, 5); }
  }
  return bgCache;
}

function steinZeichnen(X, cell, gold, blau, laufLicht, t) {
  const m = mitte(cell), cs = L.cs, sh = shake.get(cell) || 0;
  const ox = sh ? Math.sin(sh * 60) * cs * 0.05 : 0;
  const x = m.x + ox, y = m.y, rx = cs * 0.37, ry = cs * 0.3;
  // Schatten
  X.fillStyle = 'rgba(0,0,0,.28)'; X.beginPath(); X.ellipse(x, y + ry * 0.35, rx * 1.02, ry * 0.9, 0, 0, TAU); X.fill();
  // Leuchten (hinter dem Stein)
  const glow = Math.max(gold, laufLicht * 0.6);
  if (glow > 0.01 || blau > 0.01) {
    X.save(); X.globalCompositeOperation = 'lighter';
    const col = blau > gold ? `rgba(90,170,255,${0.75 * blau})` : `rgba(255,200,40,${0.75 * glow})`;
    const g = X.createRadialGradient(x, y, rx * 0.2, x, y, rx * 1.9);
    g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)');
    X.fillStyle = g; X.beginPath(); X.arc(x, y, rx * 1.9, 0, TAU); X.fill(); X.restore();
  }
  // Stein
  const F = WELT_FARBEN[welt];
  const g = X.createRadialGradient(x - rx * 0.3, y - ry * 0.5, rx * 0.1, x, y, rx * 1.1);
  if (sh) { g.addColorStop(0, '#ff9a8a'); g.addColorStop(1, '#b8443a'); }
  else if (blau > 0.01 && blau > gold) { g.addColorStop(0, mix('#8a95c8', '#e6f4ff', blau)); g.addColorStop(1, mix(F.stein, '#4aa3ff', blau)); }
  else { const k = Math.max(gold, laufLicht * 0.65); g.addColorStop(0, mix('#8a95c8', '#fff7c2', k)); g.addColorStop(1, mix(F.stein, '#ffb300', k)); }
  X.fillStyle = g; X.beginPath(); X.ellipse(x, y, rx, ry, 0, 0, TAU); X.fill();
  X.strokeStyle = 'rgba(255,255,255,.18)'; X.lineWidth = Math.max(1.5, cs * 0.025); X.stroke();
  // kleine Moosflecken auf dunklen Steinen
  if (gold + blau + laufLicht < 0.05) { X.fillStyle = 'rgba(120,200,140,.25)'; X.beginPath(); X.ellipse(x + rx * 0.35, y + ry * 0.25, rx * 0.22, ry * 0.18, 0.3, 0, TAU); X.fill(); }
}
function mix(a, b2, k) {
  k = clamp(k, 0, 1);
  const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const A = p(a), B = p(b2);
  return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * k).toString(16).padStart(2, '0')).join('');
}

function pilzhaus(X, cell, licht, t) {
  const m = mitte(cell), cs = L.cs, x = m.x, y = m.y - cs * 0.06;
  if (IMG.pilzhaus) {
    const i = IMG.pilzhaus, h = cs * 1.05, w = h * i.naturalWidth / i.naturalHeight;
    X.drawImage(i, x - w / 2, y - h * 0.92, w, h);
  } else {
    // Stiel
    X.fillStyle = '#f3e6c8'; X.beginPath(); X.roundRect(x - cs * 0.2, y - cs * 0.42, cs * 0.4, cs * 0.42, cs * 0.07); X.fill();
    // Tür und Fenster
    X.fillStyle = '#7a4c26'; X.beginPath(); X.roundRect(x - cs * 0.07, y - cs * 0.2, cs * 0.14, cs * 0.2, [cs * 0.07, cs * 0.07, 0, 0]); X.fill();
    // Hut
    X.fillStyle = '#e8473a'; X.beginPath(); X.ellipse(x, y - cs * 0.42, cs * 0.42, cs * 0.3, 0, Math.PI, TAU); X.fill();
    X.fillStyle = '#c93a2f'; X.beginPath(); X.ellipse(x, y - cs * 0.42, cs * 0.42, cs * 0.06, 0, 0, TAU); X.fill();
    X.fillStyle = '#fff'; for (const [dx, dy, r] of [[-0.2, -0.55, 0.06], [0.08, -0.64, 0.07], [0.25, -0.5, 0.05], [-0.05, -0.5, 0.04]]) { X.beginPath(); X.arc(x + dx * cs, y + dy * cs, r * cs, 0, TAU); X.fill(); }
  }
  // Fenster leuchtet immer ein wenig – stark, wenn Lumi zu Hause ist
  const w = 0.45 + 0.55 * licht + Math.sin(t * 3) * 0.05;
  X.save(); X.globalCompositeOperation = 'lighter';
  const g = X.createRadialGradient(x + cs * 0.12, y - cs * 0.3, 1, x + cs * 0.12, y - cs * 0.3, cs * 0.35);
  g.addColorStop(0, `rgba(255,210,60,${0.7 * w})`); g.addColorStop(1, 'rgba(0,0,0,0)');
  X.fillStyle = g; X.beginPath(); X.arc(x + cs * 0.12, y - cs * 0.3, cs * 0.35, 0, TAU); X.fill(); X.restore();
  if (!IMG.pilzhaus) { X.fillStyle = mix('#7a5a20', '#fff3a0', w); X.beginPath(); X.arc(x + cs * 0.12, y - cs * 0.3, cs * 0.05, 0, TAU); X.fill(); }
}

function lumiZeichnen(X, t) {
  const s = L.cs * 0.42, x = lumi.x, y = lumi.y - L.cs * 0.32 + Math.sin(t * 4) * s * 0.06, d = lumi.dir;
  // Leuchten am Hinterleib
  const puls = 0.75 + Math.sin(t * 5) * 0.25;
  X.save(); X.globalCompositeOperation = 'lighter';
  const g = X.createRadialGradient(x - d * s * 0.35, y + s * 0.25, 1, x - d * s * 0.35, y + s * 0.25, s * 1.3);
  g.addColorStop(0, `rgba(255,230,90,${0.85 * puls})`); g.addColorStop(1, 'rgba(0,0,0,0)');
  X.fillStyle = g; X.beginPath(); X.arc(x - d * s * 0.35, y + s * 0.25, s * 1.3, 0, TAU); X.fill(); X.restore();
  if (IMG.lumi) {
    const i = IMG.lumi, h = s * 2.1, w = h * i.naturalWidth / i.naturalHeight;
    X.save(); X.translate(x, y); X.scale(d, 1); X.drawImage(i, -w / 2, -h / 2, w, h); X.restore();
    return;
  }
  X.save(); X.translate(x, y); X.scale(d, 1);
  // Flügel
  const f = 0.55 + Math.abs(Math.sin(t * 18)) * 0.45;
  X.fillStyle = 'rgba(220,240,255,.55)'; X.strokeStyle = 'rgba(255,255,255,.7)'; X.lineWidth = 1.2;
  for (const [dx, rot] of [[-0.15, -0.9], [0.1, -0.5]]) {
    X.save(); X.translate(dx * s, -s * 0.25); X.rotate(rot); X.scale(1, f);
    X.beginPath(); X.ellipse(0, -s * 0.38, s * 0.24, s * 0.42, 0, 0, TAU); X.fill(); X.stroke(); X.restore();
  }
  // Leuchtender Hinterleib
  X.fillStyle = '#ffe56b'; X.beginPath(); X.ellipse(-s * 0.38, s * 0.22, s * 0.36, s * 0.3, -0.3, 0, TAU); X.fill();
  X.fillStyle = '#fff6b8'; X.beginPath(); X.ellipse(-s * 0.45, s * 0.2, s * 0.16, s * 0.12, -0.3, 0, TAU); X.fill();
  // Körper und Kopf
  X.fillStyle = '#4b3a78'; X.beginPath(); X.ellipse(-s * 0.02, s * 0.08, s * 0.3, s * 0.26, 0, 0, TAU); X.fill();
  X.fillStyle = '#5d4a94'; X.beginPath(); X.arc(s * 0.3, -s * 0.12, s * 0.36, 0, TAU); X.fill();
  // Fühler
  X.strokeStyle = '#4b3a78'; X.lineWidth = Math.max(1.5, s * 0.06); X.lineCap = 'round';
  for (const dx of [0.2, 0.45]) { X.beginPath(); X.moveTo(dx * s, -s * 0.42); X.quadraticCurveTo((dx + 0.05) * s, -s * 0.75, (dx + 0.2) * s, -s * 0.8); X.stroke(); X.fillStyle = '#ffd21c'; X.beginPath(); X.arc((dx + 0.2) * s, -s * 0.8, s * 0.07, 0, TAU); X.fill(); }
  // Augen, Wangen, Lächeln
  for (const dx of [0.2, 0.44]) {
    X.fillStyle = '#fff'; X.beginPath(); X.arc(dx * s, -s * 0.16, s * 0.11, 0, TAU); X.fill();
    X.fillStyle = '#1a1230'; X.beginPath(); X.arc(dx * s + s * 0.025, -s * 0.15, s * 0.06, 0, TAU); X.fill();
    X.fillStyle = '#fff'; X.beginPath(); X.arc(dx * s + s * 0.045, -s * 0.18, s * 0.022, 0, TAU); X.fill();
  }
  X.fillStyle = 'rgba(255,140,170,.7)'; X.beginPath(); X.arc(s * 0.1, s * 0.02, s * 0.06, 0, TAU); X.arc(s * 0.56, s * 0.02, s * 0.06, 0, TAU); X.fill();
  X.strokeStyle = '#1a1230'; X.lineWidth = Math.max(1.2, s * 0.04); X.beginPath(); X.arc(s * 0.33, s * 0.0, s * 0.08, 0.2, Math.PI - 0.2); X.stroke();
  X.restore();
}

function render() {
  const t = performance.now() / 1000;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(hintergrund(), 0, 0);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  // schwebende Glühwürmchen im Hintergrund
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (const f of flieger) {
    const x = ((f.x + Math.sin(t * 0.13 * f.s + f.p) * 0.08) % 1) * W, y = (0.15 + f.y * 0.8 + Math.sin(t * 0.21 * f.s + f.p * 2) * 0.03) * H;
    const a = 0.25 + 0.25 * Math.sin(t * 1.6 * f.s + f.p);
    const g = ctx.createRadialGradient(x, y, 0, x, y, 7); g.addColorStop(0, `rgba(255,236,120,${a})`); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 7, 0, TAU); ctx.fill();
  }
  ctx.restore();
  if (!b || mode === 'menu') return;
  const goal = b.path[b.path.length - 1];
  const zuHause = mode === 'cheer' || mode === 'won' ? 1 : 0;
  for (let cell = 0; cell < b.cols * b.rows; cell++) {
    const i = b.path.indexOf(cell);
    let gold = 0, blau = 0, licht = 0;
    if (mode === 'show') {
      if (i >= 0) gold = helligkeit(b, i, showT);
      const ir = b.irr.find((r) => r.cell === cell); if (ir) blau = irrHelligkeit(b, ir, showT);
    } else if (i >= 0) {
      if (zuHause) gold = 0.7 + 0.3 * Math.sin(t * 6 - i * 0.6);
      else if (i <= lauf.pos && mode === 'play') licht = 1;
    }
    if (i === 0 && mode !== 'show') licht = Math.max(licht, 0.5);
    steinZeichnen(ctx, cell, gold, blau, licht, t);
  }
  pilzhaus(ctx, goal, zuHause, t);
  lumiZeichnen(ctx, t);
  // Glitzer
  for (const f of funken) {
    const a = 1 - f.t / f.life; ctx.fillStyle = `rgba(255,230,120,${a})`;
    ctx.beginPath(); ctx.arc(f.x, f.y, 2.5 + a * 2, 0, TAU); ctx.fill();
  }
}

// ---------- HUD und Menüs ----------
function updateHud() {
  if (art === 'rekord') {
    $('hudArt').textContent = 'Rekordpfad, Steine ';
    $('hudLevel').textContent = String(b ? b.path.length : rek.len);
    $('chipLevel').title = 'Steine im Weg';
    const l = $('chipLeben'); l.hidden = false;
    l.textContent = '💛'.repeat(Math.max(0, rek.leben)) + '🤍'.repeat(3 - Math.max(0, rek.leben));
    l.setAttribute('aria-label', `${Math.max(0, rek.leben)} von 3 Leben`);
  } else {
    $('hudArt').textContent = 'Level ';
    $('hudLevel').textContent = String(levelNo);
    $('chipLevel').title = 'Level';
    $('chipLeben').hidden = true;
  }
}
const SCREENS = ['start', 'levels', 'pause', 'win', 'over'];
function show(id) { for (const s of SCREENS) $(s).hidden = s !== id; }
function setMode(m) {
  mode = m;
  $('hud').classList.toggle('off', m === 'menu');
  if (m === 'menu' || m === 'won' || m === 'over' || m === 'pause') { ansageWeg(); zeigeTipp(''); }
  if (m === 'show' || m === 'play' || m === 'oops' || m === 'cheer') show(null);
  if (m === 'pause') show('pause');
  if (m === 'won') showWin();
  if (m === 'over') showOver();
  document.body.dataset.mode = m;
}
const STAR_SVG = (on) => `<svg viewBox="0 0 24 24" class="${on ? 'on' : ''}" aria-hidden="true"><path d="M12 2l2.9 6.3 6.9.7-5.2 4.6 1.5 6.8L12 17l-6.1 3.4 1.5-6.8L2.2 9l6.9-.7z" fill="${on ? '#FFD21C' : 'rgba(255,255,255,.2)'}" stroke="${on ? '#c48a00' : 'rgba(255,255,255,.35)'}" stroke-width="1.2" stroke-linejoin="round"/></svg>`;
function showWin() {
  const last = levelNo === LEVEL_COUNT, r = lastResult;
  $('winTitle').textContent = last ? 'Alle Wege geschafft!' : ['Juhu!', 'Super gemerkt!', 'Klasse!', 'Toll gemacht!'][levelNo % 4];
  $('winText').textContent = `${b.path.length} Steine bis nach Hause${lauf.fehler + lauf.hinweise ? '' : ' – ganz ohne Hilfe!'}`;
  $('winNeu').hidden = !(r.rec && save.best[levelNo] === r.stars && r.stars === 3);
  $('winNeu').textContent = 'Alle 3 Sterne!';
  $('winStars').innerHTML = [0, 1, 2].map((i) => STAR_SVG(i < r.stars)).join('');
  $('winStars').setAttribute('aria-label', `${r.stars} von 3 Sternen`);
  for (let i = 0; i < r.stars; i++) SFX.star(i);
  $('winNext').querySelector('.lbl').textContent = last ? 'Fertig' : 'Weiter';
  $('winNext').setAttribute('aria-label', last ? 'Fertig, zur Levelauswahl' : 'Weiter zu Level ' + (levelNo + 1));
  show('win');
  kontoHinweis('kontoBox');
  setTimeout(() => $('winNext').focus({ preventScroll: true }), 50);
}
function showOver() {
  const n = rek.best;
  $('overTitle').textContent = n >= 10 ? 'Gedächtnis-Profi!' : n ? 'Toll gemerkt!' : 'Fast geschafft!';
  $('overText').textContent = n ? `Du hast dir einen Weg mit ${n} Steinen gemerkt.${save.rekord > n ? ` Dein Rekord: ${save.rekord}.` : ''}` : 'Versuch es gleich nochmal!';
  $('overNeu').hidden = !rek.neu;
  $('overShare').hidden = !n;
  show('over');
  setTimeout(() => $('overAgain').focus({ preventScroll: true }), 50);
}
function nextLevel() { for (let n = 1; n <= save.unlocked; n++) if (!save.best[n]) return n; return Math.min(save.unlocked, LEVEL_COUNT); }
function openMenu() {
  setMode('menu'); show('start'); b = null;
  const box = $('inviteBox');
  if (invite && invite.l) { box.hidden = false; box.textContent = `✨ Ihr wurdet zu Level ${invite.l} eingeladen. Schafft ihr den Weg?`; $('playLabel').textContent = 'Los geht’s'; }
  else if (invite && invite.r) { box.hidden = false; box.textContent = `🏆 Jemand hat sich ${invite.r} Steine gemerkt. Schaffst du mehr? Tippe auf „Rekordpfad“!`; $('playLabel').textContent = save.best[1] ? 'Weiter' : 'Spielen'; }
  else { box.hidden = true; $('playLabel').textContent = save.best[1] ? 'Weiter' : 'Spielen'; }
  $('rekordInfo').hidden = !save.rekord;
  $('rekordInfo').textContent = `🏆 Dein Rekord: ${save.rekord} Steine`;
  kontoHinweis('kontoBoxMenu');
}
function buildLevels() {
  const box = $('levelWelten'); box.innerHTML = '';
  const nx = nextLevel();
  $('levelStars').textContent = `★ ${totalStars(save)} von ${LEVEL_COUNT * 3}`;
  for (const w of WELTEN) {
    const h = document.createElement('h3'); h.className = 'welt'; h.textContent = `${['🌼', '🌲', '🌙'][w.id - 1]} ${w.name}`; box.appendChild(h);
    const g = document.createElement('div'); g.className = 'grid';
    for (let n = w.von; n <= w.bis; n++) {
      const bt = document.createElement('button'), best = save.best[n];
      const locked = n > save.unlocked && !(invite && invite.l === n);
      bt.className = 'lvl' + (n === nx && !best ? ' next' : '');
      bt.disabled = locked;
      bt.innerHTML = `${n}${best ? `<small>${'★'.repeat(best)}${'☆'.repeat(3 - best)}</small>` : ''}`;
      bt.setAttribute('aria-label', `Level ${n}${best ? `, ${best} von 3 Sternen` : locked ? ', gesperrt' : ''}`);
      bt.addEventListener('click', () => { unlockAudio(); SFX.click(); startLevel(n); });
      g.appendChild(bt);
    }
    box.appendChild(g);
  }
}
function openLevels() { buildLevels(); setMode('menu'); show('levels'); b = null; }
function pause() { if (mode === 'show' || mode === 'play' || mode === 'oops' || mode === 'cheer') { pausedFrom = mode; setMode('pause'); } }
function resume() { if (mode === 'pause') { setMode(pausedFrom); if (pausedFrom === 'play') ansage('👆', 'Jetzt du!'); if (pausedFrom === 'show') ansage('👀', 'Schau genau!'); } }
function toast(text) { const t = $('toast'); t.textContent = text; t.hidden = false; clearTimeout(toast.h); toast.h = setTimeout(() => (t.hidden = true), 3200); }

async function teilen(url, text) {
  if (navigator.share) { try { await navigator.share({ title: 'Leuchtpfad', text, url }); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
  try { await navigator.clipboard.writeText(text + ' ' + url); toast('Link kopiert – schickt ihn an eure Freunde!'); } catch { toast(url); }
}

// Hinweis aufs Konto: nur ohne Anmeldung und erst, wenn es etwas zu verlieren gibt (ab 2 geschafften Leveln)
function kontoHinweis(id) {
  const P = window.PlaySaal, n = Object.keys(save.best).length;
  const meilenstein = id === 'kontoBoxMenu' || [2, 5, 10, 20, 30].includes(n);
  let zeigen = false;
  try { zeigen = !!(P && P.hostOk && !P.user() && n >= 2 && meilenstein); } catch { zeigen = false; }
  $(id).hidden = !zeigen;
}
function kontoAnlegen() { try { window.PlaySaal && window.PlaySaal.anmelden({}); } catch { /* Konten nicht verfügbar */ } }
$('kontoBtn').addEventListener('click', kontoAnlegen);
$('kontoBtnMenu').addEventListener('click', kontoAnlegen);
setTimeout(() => { if (mode === 'menu' && !$('start').hidden) kontoHinweis('kontoBoxMenu'); }, 1500);   // playsaal.js lädt verzögert

$('btnPlay').addEventListener('click', () => { unlockAudio(); SFX.click(); startLevel(invite && invite.l ? invite.l : nextLevel()); });
$('btnLevels').addEventListener('click', () => { unlockAudio(); SFX.click(); openLevels(); });
$('btnRekord').addEventListener('click', () => { unlockAudio(); SFX.click(); startRekord(); });
$('levelsBack').addEventListener('click', () => { SFX.click(); openMenu(); });
$('btnPause').addEventListener('click', () => { unlockAudio(); SFX.click(); pause(); });
$('btnZeig').addEventListener('click', () => { unlockAudio(); SFX.click(); nochmalZeigen(); });
$('pResume').addEventListener('click', () => { SFX.click(); resume(); });
$('pRestart').addEventListener('click', () => { SFX.click(); if (art === 'rekord') startRekord(); else startLevel(levelNo); });
$('pLevels').addEventListener('click', () => { SFX.click(); if (art === 'rekord') openMenu(); else openLevels(); });
$('winNext').addEventListener('click', () => { unlockAudio(); SFX.click(); if (levelNo >= LEVEL_COUNT) openLevels(); else startLevel(levelNo + 1 <= save.unlocked ? levelNo + 1 : nextLevel()); });
$('winAgain').addEventListener('click', () => { SFX.click(); startLevel(levelNo); });
$('winLevels').addEventListener('click', () => { SFX.click(); openLevels(); });
$('winShare').addEventListener('click', () => { SFX.click(); teilen(`${location.origin}/spiele/leuchtpfad?l=${levelNo}`, `Leuchtpfad, Level ${levelNo}: Ich habe mir Lumis Weg mit ${b.path.length} Steinen gemerkt. Schaffst du das auch?`); });
$('overAgain').addEventListener('click', () => { unlockAudio(); SFX.click(); startRekord(); });
$('overMenu').addEventListener('click', () => { SFX.click(); openMenu(); });
$('overShare').addEventListener('click', () => { SFX.click(); teilen(`${location.origin}/spiele/leuchtpfad?r=${rek.best}`, `Leuchtpfad: Ich habe mir einen Weg mit ${rek.best} Steinen gemerkt! Wie viele schaffst du?`); });
document.querySelectorAll('[data-mute]').forEach((bt) => bt.addEventListener('click', () => toggleMute()));
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { if (mode === 'pause') resume(); else pause(); } });

// ---------- Eingabe: antippen oder mit dem Finger über die Steine ziehen ----------
let ziehen = false, letzteZelle = -1;
function punkt(e) { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
cv.addEventListener('pointerdown', (e) => {
  unlockAudio();
  if (mode !== 'play') return;
  ziehen = true; try { cv.setPointerCapture(e.pointerId); } catch { /* egal */ }
  const p = punkt(e); letzteZelle = zelleBei(p.x, p.y);
  tippen(letzteZelle);
});
cv.addEventListener('pointermove', (e) => {
  if (!ziehen || mode !== 'play') return;
  const p = punkt(e), c = zelleBei(p.x, p.y);
  if (c >= 0 && c !== letzteZelle) { letzteZelle = c; tippen(c); }
});
const loslassen = () => { ziehen = false; letzteZelle = -1; };
cv.addEventListener('pointerup', loslassen);
cv.addEventListener('pointercancel', loslassen);

// ---------- Schleife ----------
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000)); last = now;
  if (mode !== 'pause' && mode !== 'menu') update(dt);
  render();
  requestAnimationFrame(frame);
}

// Testzugang (nur für automatisierte Prüfungen)
window.__leuchtpfad = {
  get mode() { return mode; }, get art() { return art; }, get brett() { return b; }, get lauf() { return lauf; },
  get save() { return save; }, get level() { return levelNo; }, get rekord() { return rek; },
  punkt(cell) { const m = mitte(cell), r = cv.getBoundingClientRect(); return { x: r.left + m.x, y: r.top + m.y }; }
};

new ResizeObserver(() => resize()).observe(app);
paintMute();
resize();
loadImages().then(() => {
  document.body.classList.add('ready');
  bgKey = '';
  openMenu();
  const q = new URLSearchParams(location.search), l = Number(q.get('level'));
  if (!invite && l >= 1 && l <= save.unlocked) startLevel(l);
});
requestAnimationFrame((t) => { last = t; frame(t); });
