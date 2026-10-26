// Ab in den Stall! – Oberfläche: Canvas-2D-Bauernhof, Wege mit dem Finger malen, Tiere laufen nach Hause, Menüs, Ton, Speichern.
// Grafik: gezeichnete Platzhalter. Liegt ein Bild aus img/manifest.json vor (ChatGPT-Grafiken), wird stattdessen das Bild gezeichnet.
import { LEVELS, LEVEL_COUNT, WORLDS, worldOf } from './levels.js';
import {
  STORE, COLS, ROWS, KINDS, newState, startDraft, extend, send, step, tapGate, findPath, gateOpen, homeAt, waitingAt,
  animalPos, animalsHome, freshSave, sanitizeSave, recordWin, centis, fmt, parseChallenge
} from './engine.js';

const $ = (id) => document.getElementById(id);
const app = $('app'), cv = $('game'), ctx = cv.getContext('2d');
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, k) => a + (b - a) * k;
const TAU = Math.PI * 2;

// ---------- Bilder (optional) ----------
// Erwartete Namen, sobald Grafiken geliefert sind: tier-<art>, haus-<art>, baum, heuballen, pfuetze, gatter-zu, gatter-auf
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
// Bild unten mittig auf (x, yBottom) mit Breite w zeichnen; false, wenn es das Bild (noch) nicht gibt
function drawImg(X, k, x, yBottom, w) {
  const i = IMG[k]; if (!i) return false;
  const h = w * i.naturalHeight / i.naturalWidth;
  X.drawImage(i, x - w / 2, yBottom - h, w, h);
  return true;
}

// ---------- Spielstand ----------
let save = freshSave();
try { save = sanitizeSave(JSON.parse(localStorage.getItem(STORE)), LEVEL_COUNT); } catch { /* Privatmodus */ }
const persist = () => { try { localStorage.setItem(STORE, JSON.stringify(save)); } catch { /* gesperrt */ } };
const challenge = parseChallenge(location.search, LEVEL_COUNT);

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
function noise(dur, freq, vol, q = 1, delay = 0) {
  if (save.mute || !actx || !noiseBuf) return;
  try {
    const t = actx.currentTime + delay, s = actx.createBufferSource(), f = actx.createBiquadFilter(), g = actx.createGain();
    s.buffer = noiseBuf; f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(actx.destination); s.start(t); s.stop(t + dur + 0.05);
  } catch { /* egal */ }
}
// Tierstimmen (gezeichnet aus Tönen, keine Aufnahmen)
const VOICE = {
  kueken: () => { tone(2300, 0.08, 'sine', 0.08, 1.25); tone(2500, 0.09, 'sine', 0.08, 1.2, 0.13); },
  ferkel: () => { tone(120, 0.22, 'sawtooth', 0.07, 0.8, 0, 700); noise(0.2, 380, 0.08, 2); tone(140, 0.16, 'sawtooth', 0.06, 0.75, 0.25, 700); noise(0.15, 420, 0.06, 2, 0.25); },
  kalb: () => { tone(190, 0.7, 'sawtooth', 0.07, 0.72, 0, 900); },
  lamm: () => { [0, 0.07, 0.14, 0.21, 0.28].forEach((d, i) => tone(470 - i * 8, 0.09, 'square', 0.035, 1, d, 1600)); },
  ente: () => { tone(620, 0.1, 'square', 0.05, 0.6, 0, 1400); tone(600, 0.12, 'square', 0.05, 0.6, 0.16, 1400); },
  fohlen: () => { tone(950, 0.5, 'triangle', 0.07, 0.5); tone(700, 0.25, 'triangle', 0.04, 1.2, 0.08); }
};
const SFX = {
  pick: (k) => VOICE[k] && VOICE[k](),
  draw: (n) => tone(400 + Math.min(n, 14) * 40, 0.05, 'triangle', 0.045),
  done: () => [660, 880].forEach((f, i) => tone(f, 0.12, 'triangle', 0.08, 0, i * 0.08)),
  nope: () => { tone(300, 0.12, 'triangle', 0.08); tone(220, 0.16, 'triangle', 0.08, 0, 0.12); },
  gate: () => { tone(180, 0.25, 'sawtooth', 0.04, 1.6, 0, 800); tone(520, 0.1, 'triangle', 0.06, 0, 0.2); },
  home: () => [784, 988, 1319].forEach((f, i) => tone(f, 0.16, 'triangle', 0.08, 0, i * 0.08)),
  hop: () => tone(300, 0.05, 'sine', 0.025, 1.4),
  win: () => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.26, 'triangle', 0.11, 0, i * 0.12)),
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
// Hintergrundlied: läuft nur im Spiel (auch auf dem Geschafft-Bildschirm), nicht in Menü, Levelauswahl und Pause; folgt dem Ton-Knopf
const music = $('music'); music.volume = 0.3;
function musicSync() {
  const want = !save.mute && !document.hidden && (mode === 'play' || mode === 'cheer' || mode === 'won');
  if (!want) { music.pause(); return; }
  const p = music.play(); if (p && p.catch) p.catch(() => {});
}
function toggleMute() { save.mute = !save.mute; persist(); if (!save.mute) { unlockAudio(); SFX.click(); } paintMute(); musicSync(); }

// ---------- Farben ----------
const KIND_COL = { kueken: '#f5b800', ferkel: '#ff7aa2', kalb: '#5b6b7a', lamm: '#8c7bd1', ente: '#2f9ee8', fohlen: '#b8682c' };
const WORLD_COL = {
  1: { grass: '#8fd16a', a: '#9ad874', b: '#92d36d', tuft: '#6fb64c', frame: '#c58b4c' },
  2: { grass: '#7fcc78', a: '#8ad482', b: '#83cf7b', tuft: '#5fae5a', frame: '#b98049' },
  3: { grass: '#b6c95e', a: '#c1d36a', b: '#bacd63', tuft: '#93a845', frame: '#a8713f' }
};
const LVL_COL = { 1: '#ffd166', 2: '#7fd8f0', 3: '#f4a261' };

// ---------- Zeichnen: Tiere ----------
const OUT = 'rgba(70,45,30,.55)';
function eye(X, x, y, r, blink) {
  if (blink) { X.strokeStyle = '#2b2b33'; X.lineWidth = r * 0.7; X.lineCap = 'round'; X.beginPath(); X.arc(x, y - r * 0.2, r, 0.15 * Math.PI, 0.85 * Math.PI); X.stroke(); return; }
  X.fillStyle = '#2b2b33'; X.beginPath(); X.arc(x, y, r, 0, TAU); X.fill();
  X.fillStyle = '#fff'; X.beginPath(); X.arc(x - r * 0.35, y - r * 0.35, r * 0.38, 0, TAU); X.fill();
}
function blob(X, x, y, rx, ry, fill, stroke = OUT, lw = 0) {
  X.fillStyle = fill; X.beginPath(); X.ellipse(x, y, rx, ry, 0, 0, TAU); X.fill();
  if (lw) { X.strokeStyle = stroke; X.lineWidth = lw; X.stroke(); }
}
function cheeks(X, x, y, dx, r) { X.fillStyle = 'rgba(255,120,140,.35)'; for (const s of [-1, 1]) { X.beginPath(); X.arc(x + s * dx, y, r, 0, TAU); X.fill(); } }

// (x, y) = Mitte, s = Größe (Feldbreite). o: { blink, happy }
function drawAnimal(X, kind, x, y, s, o = {}) {
  const im = IMG['tier-' + kind];
  if (im) { const h = s * 0.86, w = h * im.naturalWidth / im.naturalHeight; X.drawImage(im, x - w / 2, y + s * 0.42 - h, w, h); return; }
  const lw = s * 0.028, bl = !!o.blink;
  X.save(); X.lineJoin = 'round'; X.lineCap = 'round';
  if (kind === 'kueken') {
    for (const sx of [-1, 1]) { X.strokeStyle = '#f08c00'; X.lineWidth = s * 0.035; X.beginPath(); X.moveTo(x + sx * s * 0.09, y + s * 0.3); X.lineTo(x + sx * s * 0.09, y + s * 0.36); X.stroke(); }
    blob(X, x, y + s * 0.04, s * 0.3, s * 0.29, '#ffd43b', OUT, lw);
    for (const sx of [-1, 1]) blob(X, x + sx * s * 0.27, y + s * 0.09, s * 0.07, s * 0.12, '#ffc61a', OUT, lw);
    X.strokeStyle = '#e0a800'; X.lineWidth = s * 0.03;
    X.beginPath(); X.moveTo(x - s * 0.03, y - s * 0.24); X.quadraticCurveTo(x - s * 0.05, y - s * 0.33, x - s * 0.01, y - s * 0.36); X.moveTo(x + s * 0.02, y - s * 0.24); X.quadraticCurveTo(x + s * 0.05, y - s * 0.32, x + s * 0.09, y - s * 0.32); X.stroke();
    eye(X, x - s * 0.1, y - s * 0.03, s * 0.042, bl); eye(X, x + s * 0.1, y - s * 0.03, s * 0.042, bl);
    X.fillStyle = '#ff8c1a'; X.beginPath(); X.moveTo(x - s * 0.055, y + s * 0.04); X.lineTo(x + s * 0.055, y + s * 0.04); X.lineTo(x, y + s * 0.11); X.closePath(); X.fill();
    cheeks(X, x, y + s * 0.06, s * 0.17, s * 0.04);
  } else if (kind === 'ferkel') {
    for (const sx of [-1, 1]) { X.fillStyle = '#ff9fbb'; X.strokeStyle = OUT; X.lineWidth = lw; X.beginPath(); X.moveTo(x + sx * s * 0.12, y - s * 0.2); X.lineTo(x + sx * s * 0.3, y - s * 0.32); X.lineTo(x + sx * s * 0.26, y - s * 0.09); X.closePath(); X.fill(); X.stroke(); }
    blob(X, x, y + s * 0.04, s * 0.32, s * 0.29, '#ffb8cc', OUT, lw);
    blob(X, x, y + s * 0.1, s * 0.13, s * 0.09, '#ff8fb0', OUT, lw);
    X.fillStyle = '#b8466a'; for (const sx of [-1, 1]) { X.beginPath(); X.ellipse(x + sx * s * 0.045, y + s * 0.1, s * 0.022, s * 0.032, 0, 0, TAU); X.fill(); }
    eye(X, x - s * 0.12, y - s * 0.05, s * 0.04, bl); eye(X, x + s * 0.12, y - s * 0.05, s * 0.04, bl);
    cheeks(X, x, y + s * 0.07, s * 0.21, s * 0.04);
  } else if (kind === 'kalb') {
    for (const sx of [-1, 1]) { blob(X, x + sx * s * 0.33, y - s * 0.12, s * 0.12, s * 0.06, '#f4c7c3', OUT, lw); }
    for (const sx of [-1, 1]) blob(X, x + sx * s * 0.13, y - s * 0.3, s * 0.045, s * 0.05, '#efe0b8', OUT, lw);
    blob(X, x, y + s * 0.0, s * 0.27, s * 0.3, '#ffffff', OUT, lw);
    X.save(); X.beginPath(); X.ellipse(x, y, s * 0.27, s * 0.3, 0, 0, TAU); X.clip();
    X.fillStyle = '#3b3b45'; X.beginPath(); X.ellipse(x - s * 0.17, y - s * 0.15, s * 0.12, s * 0.1, 0.4, 0, TAU); X.fill();
    X.beginPath(); X.ellipse(x + s * 0.22, y + s * 0.02, s * 0.08, s * 0.12, -0.2, 0, TAU); X.fill();
    X.restore();
    blob(X, x, y + s * 0.17, s * 0.19, s * 0.12, '#ffc2c8', OUT, lw);
    X.fillStyle = '#b85566'; for (const sx of [-1, 1]) { X.beginPath(); X.arc(x + sx * s * 0.07, y + s * 0.17, s * 0.022, 0, TAU); X.fill(); }
    eye(X, x - s * 0.1, y - s * 0.04, s * 0.042, bl); eye(X, x + s * 0.1, y - s * 0.04, s * 0.042, bl);
  } else if (kind === 'lamm') {
    X.fillStyle = '#fffaf0'; X.strokeStyle = OUT; X.lineWidth = lw;
    const puff = [[0, -0.27], [0.2, -0.2], [0.29, 0], [0.2, 0.2], [0, 0.27], [-0.2, 0.2], [-0.29, 0], [-0.2, -0.2]];
    X.beginPath(); for (const [dx, dy] of puff) { X.moveTo(x + dx * s + s * 0.11, y + dy * s + s * 0.03); X.arc(x + dx * s, y + dy * s + s * 0.03, s * 0.11, 0, TAU); } X.fill(); X.stroke();
    blob(X, x, y + s * 0.03, s * 0.27, s * 0.27, '#fffaf0');
    for (const sx of [-1, 1]) blob(X, x + sx * s * 0.2, y - s * 0.02, s * 0.09, s * 0.045, '#5b5361', OUT, lw);
    blob(X, x, y + s * 0.05, s * 0.15, s * 0.18, '#5b5361', OUT, lw);
    X.fillStyle = '#fffaf0'; X.beginPath(); X.arc(x - s * 0.05, y - s * 0.16, s * 0.07, 0, TAU); X.arc(x + s * 0.05, y - s * 0.16, s * 0.07, 0, TAU); X.fill();
    X.fillStyle = '#fff'; for (const sx of [-1, 1]) { X.beginPath(); X.arc(x + sx * s * 0.06, y + s * 0.02, s * 0.045, 0, TAU); X.fill(); }
    eye(X, x - s * 0.06, y + s * 0.025, s * 0.03, bl); eye(X, x + s * 0.06, y + s * 0.025, s * 0.03, bl);
    X.strokeStyle = '#d9c8d8'; X.lineWidth = s * 0.02; X.beginPath(); X.arc(x, y + s * 0.12, s * 0.035, 0.15 * Math.PI, 0.85 * Math.PI); X.stroke();
  } else if (kind === 'ente') {
    for (const sx of [-1, 1]) blob(X, x + sx * s * 0.1, y + s * 0.33, s * 0.07, s * 0.03, '#ff8c1a');
    blob(X, x, y + s * 0.06, s * 0.3, s * 0.28, '#ffffff', OUT, lw);
    blob(X, x - s * 0.24, y + s * 0.12, s * 0.08, s * 0.12, '#f1f4f8', OUT, lw);
    X.fillStyle = '#ffffff'; X.strokeStyle = OUT; X.lineWidth = lw; X.beginPath(); X.moveTo(x - s * 0.02, y - s * 0.21); X.quadraticCurveTo(x + s * 0.02, y - s * 0.34, x + s * 0.08, y - s * 0.3); X.stroke();
    eye(X, x - s * 0.1, y - s * 0.04, s * 0.042, bl); eye(X, x + s * 0.1, y - s * 0.04, s * 0.042, bl);
    blob(X, x, y + s * 0.07, s * 0.13, s * 0.06, '#ff9a1f', OUT, lw);
    X.strokeStyle = '#d06a00'; X.lineWidth = s * 0.015; X.beginPath(); X.moveTo(x - s * 0.1, y + s * 0.07); X.lineTo(x + s * 0.1, y + s * 0.07); X.stroke();
    cheeks(X, x, y + s * 0.02, s * 0.18, s * 0.035);
  } else if (kind === 'fohlen') {
    for (const sx of [-1, 1]) { X.fillStyle = '#b9773f'; X.strokeStyle = OUT; X.lineWidth = lw; X.beginPath(); X.moveTo(x + sx * s * 0.08, y - s * 0.24); X.lineTo(x + sx * s * 0.17, y - s * 0.4); X.lineTo(x + sx * s * 0.2, y - s * 0.2); X.closePath(); X.fill(); X.stroke(); }
    blob(X, x, y - s * 0.02, s * 0.22, s * 0.3, '#c98546', OUT, lw);
    X.fillStyle = '#6b3d1f'; X.beginPath(); X.ellipse(x - s * 0.02, y - s * 0.27, s * 0.12, s * 0.07, -0.3, 0, TAU); X.fill(); X.beginPath(); X.ellipse(x + s * 0.06, y - s * 0.22, s * 0.07, s * 0.05, 0.4, 0, TAU); X.fill();
    blob(X, x, y + s * 0.17, s * 0.16, s * 0.12, '#ecc394', OUT, lw);
    X.fillStyle = '#8a5a35'; for (const sx of [-1, 1]) { X.beginPath(); X.ellipse(x + sx * s * 0.06, y + s * 0.19, s * 0.02, s * 0.03, 0, 0, TAU); X.fill(); }
    eye(X, x - s * 0.1, y - s * 0.04, s * 0.042, bl); eye(X, x + s * 0.1, y - s * 0.04, s * 0.042, bl);
    X.fillStyle = '#fff'; X.beginPath(); X.moveTo(x, y - s * 0.17); X.lineTo(x - s * 0.035, y - s * 0.08); X.lineTo(x + s * 0.035, y - s * 0.08); X.closePath(); X.fill();
  }
  if (o.happy) { X.strokeStyle = '#2b2b33'; X.lineWidth = s * 0.02; X.beginPath(); X.arc(x, y + (kind === 'ferkel' ? s * 0.18 : kind === 'kalb' || kind === 'fohlen' ? s * 0.25 : s * 0.13), s * 0.04, 0.1 * Math.PI, 0.9 * Math.PI); X.stroke(); }
  X.restore();
}

// ---------- Zeichnen: Häuser ----------
const HOUSE = {
  kueken: { wall: '#f6d38a', roof: '#e0702a', trim: '#fff6e0' },
  ferkel: { wall: '#ffc6d6', roof: '#c8436a', trim: '#fff0f4' },
  kalb: { wall: '#d9473f', roof: '#7a2a24', trim: '#ffffff' },
  lamm: { wall: '#a9dbf2', roof: '#2e6f9e', trim: '#f2fbff' },
  fohlen: { wall: '#c99a6b', roof: '#5d3a1a', trim: '#f6e6d2' }
};
function roundRect(X, x, y, w, h, r) { X.beginPath(); X.moveTo(x + r, y); X.arcTo(x + w, y, x + w, y + h, r); X.arcTo(x + w, y + h, x, y + h, r); X.arcTo(x, y + h, x, y, r); X.arcTo(x, y, x + w, y, r); X.closePath(); }

// (x, y) = Feldmitte, s = Feldgröße. o: { glow, shake, bounce, peek }
function drawHome(X, kind, x, y, s, o = {}) {
  X.save();
  if (o.shake) X.translate(Math.sin(o.shake * 40) * s * 0.06 * o.shake, 0);
  if (o.bounce) { const k = 1 + Math.sin(o.bounce * Math.PI) * 0.12; X.translate(x, y + s * 0.45); X.scale(k, 2 - k); X.translate(-x, -(y + s * 0.45)); }
  if (o.glow) {
    X.fillStyle = `rgba(255,236,120,${0.35 + 0.25 * Math.sin(o.glow * 6)})`;
    X.beginPath(); X.ellipse(x, y + s * 0.05, s * 0.62, s * 0.58, 0, 0, TAU); X.fill();
  }
  if (kind === 'ente') {
    if (!drawImg(X, 'teich', x, y + s * 0.47, s * 1.0)) {
      blob(X, x, y + s * 0.12, s * 0.48, s * 0.32, '#3b8fc7');
      blob(X, x, y + s * 0.1, s * 0.43, s * 0.27, '#62bdf0');
      X.strokeStyle = 'rgba(255,255,255,.7)'; X.lineWidth = s * 0.025; X.lineCap = 'round';
      X.beginPath(); X.arc(x - s * 0.12, y + s * 0.12, s * 0.08, 1.1 * Math.PI, 1.8 * Math.PI); X.arc(x + s * 0.15, y + s * 0.2, s * 0.06, 1.1 * Math.PI, 1.8 * Math.PI); X.stroke();
      blob(X, x + s * 0.2, y + s * 0.02, s * 0.08, s * 0.045, '#5cb85c');
      X.strokeStyle = '#4e8a2e'; X.lineWidth = s * 0.03;
      for (const [dx, h] of [[-0.42, 0.38], [-0.36, 0.3], [0.4, 0.34]]) { X.beginPath(); X.moveTo(x + dx * s, y + s * 0.2); X.lineTo(x + dx * s + s * 0.02, y + s * 0.2 - h * s); X.stroke(); blob(X, x + dx * s + s * 0.02, y + s * 0.2 - h * s + s * 0.05, s * 0.025, s * 0.07, '#8a5a2b'); }
      // Schild am Stock
      X.strokeStyle = '#8a5a2b'; X.lineWidth = s * 0.035; X.beginPath(); X.moveTo(x - s * 0.05, y - s * 0.05); X.lineTo(x - s * 0.05, y - s * 0.2); X.stroke();
      blob(X, x - s * 0.05, y - s * 0.3, s * 0.15, s * 0.15, '#fff', OUT, s * 0.025);
      drawAnimal(X, 'ente', x - s * 0.05, y - s * 0.3, s * 0.36);
    }
  } else if (!drawImg(X, 'haus-' + kind, x, y + s * 0.47, s * 0.95)) {
    const c = HOUSE[kind], w = s * 0.9, h = s * 0.62, bx = x - w / 2, by = y + s * 0.46 - h;
    X.fillStyle = 'rgba(0,0,0,.15)'; X.beginPath(); X.ellipse(x, y + s * 0.46, w * 0.55, s * 0.07, 0, 0, TAU); X.fill();
    X.fillStyle = c.wall; X.strokeStyle = OUT; X.lineWidth = s * 0.03; roundRect(X, bx, by, w, h, s * 0.04); X.fill(); X.stroke();
    if (kind === 'kalb') { X.strokeStyle = c.trim; X.lineWidth = s * 0.03; X.strokeRect(bx + s * 0.06, by + s * 0.06, w - s * 0.12, h - s * 0.06); }
    // Dach
    X.fillStyle = c.roof; X.strokeStyle = OUT; X.lineWidth = s * 0.03; X.beginPath();
    X.moveTo(bx - s * 0.06, by + s * 0.04); X.lineTo(x, by - s * 0.34); X.lineTo(bx + w + s * 0.06, by + s * 0.04); X.closePath(); X.fill(); X.stroke();
    // Tür
    const dw = w * 0.42, dh = h * 0.62;
    X.fillStyle = '#5a3a26'; X.beginPath(); X.moveTo(x - dw / 2, by + h); X.lineTo(x - dw / 2, by + h - dh + dw / 2); X.arc(x, by + h - dh + dw / 2, dw / 2, Math.PI, 0); X.lineTo(x + dw / 2, by + h); X.closePath(); X.fill();
    if (o.peek) drawAnimal(X, kind, x, by + h - dh * 0.45, s * 0.42, { happy: true });
    // Schild im Giebel
    blob(X, x, by - s * 0.08, s * 0.15, s * 0.15, '#fff', OUT, s * 0.025);
    drawAnimal(X, kind, x, by - s * 0.08, s * 0.36);
  }
  X.restore();
}

// ---------- Zeichnen: Felder ----------
const hash = (r, c, k = 0) => { let h = (r * 73856093) ^ (c * 19349663) ^ (k * 83492791); h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
function tileAt(r, c) { return r >= 0 && r < ROWS && c >= 0 && c < COLS ? st.tiles[r][c].t : null; }
const isWet = (r, c) => { const t = tileAt(r, c); return t === 'bach' || t === 'bruecke'; };

function drawTree(X, x, y, s) {
  if (drawImg(X, 'baum', x, y + s * 0.45, s * 0.95)) return;
  X.fillStyle = 'rgba(0,0,0,.15)'; X.beginPath(); X.ellipse(x, y + s * 0.4, s * 0.32, s * 0.08, 0, 0, TAU); X.fill();
  X.fillStyle = '#8b5a2b'; roundRect(X, x - s * 0.07, y + s * 0.05, s * 0.14, s * 0.36, s * 0.04); X.fill();
  for (const [dx, dy, r, col] of [[-0.17, -0.02, 0.2, '#3f9b45'], [0.17, -0.02, 0.2, '#3f9b45'], [0, -0.2, 0.25, '#4caf50'], [0, 0.02, 0.22, '#45a849']]) blob(X, x + dx * s, y + dy * s, r * s, r * s, col);
  blob(X, x - s * 0.08, y - s * 0.26, s * 0.08, s * 0.06, 'rgba(255,255,255,.25)');
  X.fillStyle = '#e74c3c'; for (const [dx, dy] of [[-0.12, -0.08], [0.14, -0.15], [0.05, 0.05]]) { X.beginPath(); X.arc(x + dx * s, y + dy * s, s * 0.035, 0, TAU); X.fill(); }
}
function drawHay(X, x, y, s) {
  if (drawImg(X, 'heuballen', x, y + s * 0.4, s * 0.86)) return;
  X.fillStyle = 'rgba(0,0,0,.15)'; X.beginPath(); X.ellipse(x, y + s * 0.38, s * 0.4, s * 0.07, 0, 0, TAU); X.fill();
  X.fillStyle = '#f2c14e'; X.strokeStyle = '#b88a1e'; X.lineWidth = s * 0.03; roundRect(X, x - s * 0.4, y - s * 0.2, s * 0.8, s * 0.56, s * 0.14); X.fill(); X.stroke();
  X.strokeStyle = '#d9a52f'; X.lineWidth = s * 0.022;
  for (let i = 0; i < 4; i++) { X.beginPath(); X.moveTo(x - s * 0.3, y - s * 0.1 + i * s * 0.12); X.lineTo(x + s * 0.3, y - s * 0.08 + i * s * 0.12); X.stroke(); }
  X.strokeStyle = '#c0392b'; X.lineWidth = s * 0.03; for (const dx of [-0.18, 0.18]) { X.beginPath(); X.moveTo(x + dx * s, y - s * 0.2); X.lineTo(x + dx * s, y + s * 0.36); X.stroke(); }
}
function drawFence(X, r, c, x, y, s) {
  const conn = (rr, cc) => { const t = tileAt(rr, cc); return t === 'zaun' || t === 'gatter'; };
  const L = conn(r, c - 1) || c === 0, R = conn(r, c + 1) || c === COLS - 1, U = conn(r - 1, c), D = conn(r + 1, c);
  const horiz = L || R || !(U || D);
  X.strokeStyle = '#a86f3a'; X.lineCap = 'round';
  if (horiz) {
    const x0 = L ? x - s / 2 : x - s * 0.3, x1 = R ? x + s / 2 : x + s * 0.3;
    X.lineWidth = s * 0.07; for (const dy of [-0.1, 0.1]) { X.beginPath(); X.moveTo(x0, y + dy * s); X.lineTo(x1, y + dy * s); X.stroke(); }
  }
  if (U || D) {
    const y0 = U ? y - s / 2 : y - s * 0.3, y1 = D ? y + s / 2 : y + s * 0.3;
    X.lineWidth = s * 0.07; for (const dx of [-0.1, 0.1]) { X.beginPath(); X.moveTo(x + dx * s, y0); X.lineTo(x + dx * s, y1); X.stroke(); }
  }
  X.fillStyle = '#c58b4c'; X.strokeStyle = OUT; X.lineWidth = s * 0.025;
  roundRect(X, x - s * 0.07, y - s * 0.24, s * 0.14, s * 0.44, s * 0.04); X.fill(); X.stroke();
}
function drawWater(X, r, c, x, y, s, t) {
  X.fillStyle = '#4fb3ea'; X.fillRect(x - s / 2 - 0.5, y - s / 2 - 0.5, s + 1, s + 1);
  X.strokeStyle = 'rgba(255,255,255,.55)'; X.lineWidth = s * 0.03; X.lineCap = 'round';
  const flowH = isWet(r, c - 1) || isWet(r, c + 1);
  for (let i = 0; i < 2; i++) {
    const ph = (t * 0.6 + hash(r, c, i)) % 1;
    X.beginPath();
    if (flowH) { const xx = x - s / 2 + ph * s, yy = y - s * 0.2 + i * s * 0.35; X.moveTo(xx - s * 0.12, yy); X.quadraticCurveTo(xx, yy - s * 0.06, xx + s * 0.12, yy); }
    else { const yy = y - s / 2 + ph * s, xx = x - s * 0.2 + i * s * 0.35; X.moveTo(xx, yy - s * 0.12); X.quadraticCurveTo(xx + s * 0.06, yy, xx, yy + s * 0.12); }
    X.stroke();
  }
  // Ufer, wo kein Wasser angrenzt
  X.fillStyle = 'rgba(90,140,60,.55)';
  if (!isWet(r - 1, c)) X.fillRect(x - s / 2, y - s / 2, s, s * 0.07);
  if (!isWet(r + 1, c)) X.fillRect(x - s / 2, y + s / 2 - s * 0.07, s, s * 0.07);
  if (!isWet(r, c - 1) && c > 0) X.fillRect(x - s / 2, y - s / 2, s * 0.07, s);
  if (!isWet(r, c + 1) && c < COLS - 1) X.fillRect(x + s / 2 - s * 0.07, y - s / 2, s * 0.07, s);
}
function drawBridge(X, r, c, x, y, s, t) {
  drawWater(X, r, c, x, y, s, t);
  const flowH = isWet(r, c - 1) || isWet(r, c + 1);   // Bach läuft waagerecht → Brücke senkrecht
  X.save(); X.translate(x, y); if (!flowH) X.rotate(Math.PI / 2);
  X.fillStyle = 'rgba(0,0,0,.18)'; X.fillRect(-s * 0.36, -s * 0.5, s * 0.76, s);
  for (let i = 0; i < 5; i++) { X.fillStyle = i % 2 ? '#c8935a' : '#d6a46a'; X.fillRect(-s * 0.4, -s * 0.5 + i * s * 0.2, s * 0.8, s * 0.19); }
  X.fillStyle = '#8b5a2b'; X.fillRect(-s * 0.44, -s * 0.52, s * 0.08, s * 1.04); X.fillRect(s * 0.36, -s * 0.52, s * 0.08, s * 1.04);
  X.restore();
}
function drawPuddle(X, r, c, x, y, s, t) {
  if (drawImg(X, 'pfuetze', x, y + s * 0.38, s * 0.98)) return;
  const shape = (k) => {
    X.beginPath();
    for (let i = 0; i <= 24; i++) { const a = i / 24 * TAU, rr = s * k * (1 + 0.1 * Math.sin(a * 3 + hash(r, c) * 6) + 0.05 * Math.sin(a * 5)); const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr * 0.62; i ? X.lineTo(px, py) : X.moveTo(px, py); }
    X.closePath();
  };
  X.fillStyle = '#8a5d36'; shape(0.47); X.fill();
  X.fillStyle = '#b5875a'; shape(0.38); X.fill();
  X.fillStyle = 'rgba(160,205,235,.45)'; shape(0.28); X.fill();
  X.strokeStyle = 'rgba(255,255,255,.75)'; X.lineWidth = s * 0.03; X.lineCap = 'round';
  X.beginPath(); X.moveTo(x - s * 0.2, y - s * 0.07); X.quadraticCurveTo(x - s * 0.1, y - s * 0.13, x + s * 0.02, y - s * 0.11); X.stroke();
  X.fillStyle = '#8a5d36'; for (const [dx, dy, rr] of [[-0.42, 0.22, 0.04], [0.43, -0.2, 0.035], [0.36, 0.27, 0.03]]) { X.beginPath(); X.arc(x + dx * s, y + dy * s, rr * s, 0, TAU); X.fill(); }
  const b = (t * 0.8 + hash(r, c, 3)) % 1; X.strokeStyle = `rgba(255,255,255,${0.6 * (1 - b)})`; X.lineWidth = s * 0.018; X.beginPath(); X.ellipse(x + s * 0.12, y + s * 0.05, s * 0.03 + b * s * 0.08, (s * 0.03 + b * s * 0.08) * 0.6, 0, 0, TAU); X.stroke();
}
function drawGate(X, r, c, x, y, s, open, pulse) {
  const vertical = (tileAt(r - 1, c) === 'zaun' || tileAt(r + 1, c) === 'zaun') && !(tileAt(r, c - 1) === 'zaun' || tileAt(r, c + 1) === 'zaun');
  if (drawImg(X, open ? 'gatter-auf' : 'gatter-zu', x, y + s * 0.36, s * 1.02)) { if (pulse && !open) tapRing(X, x, y, s, pulse); return; }
  X.save(); X.translate(x, y); if (vertical) X.rotate(Math.PI / 2);
  X.fillStyle = '#c58b4c'; X.strokeStyle = OUT; X.lineWidth = s * 0.025;
  for (const sx of [-1, 1]) { roundRect(X, sx * s * 0.46 - s * 0.06, -s * 0.28, s * 0.12, s * 0.5, s * 0.04); X.fill(); X.stroke(); }
  if (!open) {
    X.fillStyle = '#ff9f43'; X.strokeStyle = '#a0521a'; X.lineWidth = s * 0.03;
    roundRect(X, -s * 0.4, -s * 0.18, s * 0.8, s * 0.34, s * 0.04); X.fill(); X.stroke();
    X.strokeStyle = '#ffffff'; X.lineWidth = s * 0.05; X.lineCap = 'round';
    X.beginPath(); X.moveTo(-s * 0.33, -s * 0.12); X.lineTo(s * 0.33, s * 0.1); X.moveTo(-s * 0.33, s * 0.1); X.lineTo(s * 0.33, -s * 0.12); X.stroke();
  } else {
    X.fillStyle = '#ff9f43'; X.strokeStyle = '#a0521a'; X.lineWidth = s * 0.03;
    roundRect(X, -s * 0.46, -s * 0.5, s * 0.1, s * 0.34, s * 0.03); X.fill(); X.stroke();
  }
  X.restore();
  if (pulse && !open) tapRing(X, x, y, s, pulse);
}
function tapRing(X, x, y, s, t) {
  const k = (t * 1.2) % 1;
  X.strokeStyle = `rgba(255,255,255,${0.9 * (1 - k)})`; X.lineWidth = s * 0.05;
  X.beginPath(); X.arc(x, y, s * (0.3 + k * 0.35), 0, TAU); X.stroke();
}

// ---------- Größe und Aufbau ----------
let W = 360, H = 640, dpr = 1, cs = 60, ox = 0, oy = 0;
function resize() {
  W = app.clientWidth; H = app.clientHeight; dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  cv.style.width = W + 'px'; cv.style.height = H + 'px';
  const hud = $('hud').getBoundingClientRect(), ar = app.getBoundingClientRect();
  const top = Math.max(hud.bottom - ar.top + 12, 64);
  cs = Math.floor(Math.min((W - 16) / COLS, (H - top - 16) / ROWS));
  ox = Math.round((W - cs * COLS) / 2);
  oy = Math.round(top + Math.max(0, (H - top - 16 - cs * ROWS) * 0.35));
}
const cx = (c) => ox + (c + 0.5) * cs, cy = (r) => oy + (r + 0.5) * cs;
function cellAt(x, y) { return { r: Math.floor((y - oy) / cs), c: Math.floor((x - ox) / cs) }; }

// ---------- Zustand ----------
let mode = 'menu';           // menu | play | pause | cheer | won
let levelNo = 1, lv = null, st = null, clock = 0, cheerT = 0, idle = 0;
let draft = null, pointerId = null, fading = [], fx = [], particles = [];
let homeFx = {}, hintSeen = false, tipT = 0, activeCh = null, lastBump = 0, hudCache = '';

function startLevel(n) {
  levelNo = clamp(n, 1, LEVEL_COUNT); lv = LEVELS[levelNo - 1]; st = newState(lv);
  draft = null; pointerId = null; fading = []; fx = []; particles = []; homeFx = {}; idle = 0; cheerT = 0; hudCache = '';
  hintSeen = levelNo !== 1 || !!save.best[1];
  activeCh = challenge && challenge.l === levelNo ? challenge : null;
  const w = worldOf(levelNo);
  document.body.style.background = WORLD_COL[w.id].grass; app.style.background = WORLD_COL[w.id].grass;
  $('tipIcon').textContent = lv.tip.icon; $('tipText').textContent = lv.tip.text;
  $('tipLevel').textContent = activeCh ? `Level ${levelNo} · Ziel ${fmt(activeCh.t)}` : `Level ${levelNo} · ${lv.title}`;
  $('tip').classList.remove('away'); tipT = 0;
  resize(); updateHud(); setMode('play');
}

// ---------- Eingabe ----------
function pos(e) { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
function pickAnimal(x, y) {
  let best = null, bd = cs * 0.75;
  for (const a of st.animals) {
    if (a.state !== 'wait') continue;
    const d = Math.hypot(cx(a.c) - x, cy(a.r) - y);
    if (d < bd) { bd = d; best = a; }
  }
  return best;
}
function hideTip() { $('tip').classList.add('away'); }

cv.addEventListener('pointerdown', (e) => {
  unlockAudio();
  if (mode !== 'play' || draft) return;
  e.preventDefault();
  const p = pos(e), { r, c } = cellAt(p.x, p.y);
  idle = 0; st.started = true;
  if (tipT > 0.6) hideTip();
  // Gatter antippen
  if (st.tiles[r] && st.tiles[r][c] && st.tiles[r][c].t === 'gatter' && !gateOpen(st, r, c)) {
    if (tapGate(st, r, c)) { SFX.gate(); sparkle(cx(c), cy(r), 10, '#ffd21c'); }
    return;
  }
  const a = pickAnimal(p.x, p.y);
  if (!a) return;
  draft = startDraft(st, a.i);
  pointerId = e.pointerId;
  try { cv.setPointerCapture(e.pointerId); } catch { /* egal */ }
  SFX.pick(a.kind);
  hideTip();
});
cv.addEventListener('pointermove', (e) => {
  if (!draft || e.pointerId !== pointerId) return;
  const p = pos(e);
  const r = clamp(Math.floor((p.y - oy) / cs), 0, ROWS - 1), c = clamp(Math.floor((p.x - ox) / cs), 0, COLS - 1);
  // erst ein Stück in die Nachbarzelle hinein zählen (zittrige Finger an der Kante)
  const last = draft.cells[draft.cells.length - 1];
  if (r === last[0] && c === last[1]) return;
  const fx0 = (p.x - ox) / cs - (c + 0.5), fy0 = (p.y - oy) / cs - (r + 0.5);
  if (Math.max(Math.abs(fx0), Math.abs(fy0)) > 0.42 && Math.abs(r - last[0]) + Math.abs(c - last[1]) === 1) return;
  const before = draft.cells.length, res = extend(st, draft, r, c);
  idle = 0;
  if (res === 'grow' || res === 'done') SFX.draw(draft.cells.length);
  if (res === 'wrong') { const h = st.homes.find((x) => x.r === r && x.c === c); if (h) bumpHome(h, 'shake'); }
  if (res === 'gate' && clock - lastBump > 0.6) { lastBump = clock; SFX.nope(); fx.push({ type: 'gatehint', r, c, t: 0 }); }
  if (res === 'done') {
    send(st, draft); SFX.done();
    hintSeen = true;
    endDraft(false);
  } else if (draft.cells.length < before && res === 'back') { /* zurückgemalt */ }
});
function endDraft(fade) {
  if (draft && fade && draft.cells.length > 1) fading.push({ cells: draft.cells.slice(), kind: draft.kind, t: 0 });
  draft = null;
  if (pointerId !== null) { try { cv.releasePointerCapture(pointerId); } catch { /* egal */ } }
  pointerId = null;
}
const endPointer = (e) => { if (draft && e.pointerId === pointerId) endDraft(true); };
cv.addEventListener('pointerup', endPointer);
cv.addEventListener('pointercancel', endPointer);
cv.addEventListener('contextmenu', (e) => e.preventDefault());

function bumpHome(h, kind) {
  const k = h.r + ',' + h.c;
  homeFx[k] = homeFx[k] || {};
  if (kind === 'shake') { if (!homeFx[k].shake) SFX.nope(); homeFx[k].shake = 1; }
  if (kind === 'bounce') { homeFx[k].bounce = 1; homeFx[k].peek = 1.6; }
}

// ---------- Ablauf ----------
function update(dt) {
  clock += dt;
  if (mode === 'menu' || mode === 'pause') return;
  idle += dt; tipT += dt;
  if (tipT > 4.5 && hintSeen) hideTip();
  const ev = step(st, mode === 'play' ? dt : dt);
  for (const e of ev) {
    if (e.type === 'hop' && Math.random() < 0.5) SFX.hop();
    if (e.type === 'home') {
      const a = st.animals[e.i];
      VOICE[a.kind] && VOICE[a.kind](); setTimeout(() => SFX.home(), 180);
      bumpHome(st.homes.find((h) => h.kind === a.kind), 'bounce');
      sparkle(cx(a.c), cy(a.r) - cs * 0.2, 14, KIND_COL[a.kind]);
      hearts(cx(a.c), cy(a.r) - cs * 0.4);
    }
    if (e.type === 'win') win();
  }
  for (const k of Object.keys(homeFx)) {
    const h = homeFx[k];
    if (h.shake) h.shake = Math.max(0, h.shake - dt * 2.2);
    if (h.bounce) h.bounce = Math.max(0, h.bounce - dt * 2.5);
    if (h.peek) h.peek = Math.max(0, h.peek - dt);
  }
  for (const f of fading) f.t += dt;
  fading = fading.filter((f) => f.t < 0.5);
  for (const f of fx) f.t += dt;
  fx = fx.filter((f) => f.t < 1.2);
  for (const p of particles) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.g * dt; p.rot = (p.rot || 0) + dt * 4; }
  particles = particles.filter((p) => p.life > 0);
  if (mode === 'cheer') {
    cheerT += dt;
    if (Math.random() < dt * 30) confetti();
    if (cheerT > 1.5) setMode('won');
  }
  updateHud();
}

function sparkle(x, y, n, col) {
  for (let i = 0; i < n; i++) { const a = Math.random() * TAU, s = 60 + Math.random() * 90; particles.push({ kind: 'star', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 40, g: 160, r: 3 + Math.random() * 3, life: 0.9, max: 0.9, c: col || '#FFD21C' }); }
}
function hearts(x, y) { for (let i = 0; i < 3; i++) particles.push({ kind: 'heart', x: x + (i - 1) * cs * 0.2, y, vx: (i - 1) * 12, vy: -50 - i * 10, g: -10, r: cs * 0.09, life: 1.2, max: 1.2 }); }
const CONF = ['#FFD21C', '#FF9200', '#4fc3f7', '#ffffff', '#ff6b9d', '#7ed957'];
function confetti() { particles.push({ kind: 'conf', x: Math.random() * W, y: -10, vx: (Math.random() - 0.5) * 60, vy: 80 + Math.random() * 80, g: 40, r: 4 + Math.random() * 3, life: 3, max: 3, rot: Math.random() * 6, c: CONF[(Math.random() * CONF.length) | 0] }); }

let lastResult = null;
function win() {
  endDraft(false);
  const cs100 = centis(st.time), had = !!save.best[levelNo], wasUnlocked = save.unlocked;
  const rec = recordWin(save, levelNo, cs100, LEVEL_COUNT);
  if (levelNo > wasUnlocked) save.unlocked = wasUnlocked;   // Herausforderung schaltet nichts außer der Reihe frei
  persist();
  lastResult = { cs: cs100, rec: rec && had };
  SFX.win();
  for (let i = 0; i < 40; i++) confetti();
  setMode('cheer');
}

// ---------- Zeichnen ----------
function drawGround() {
  const w = WORLD_COL[worldOf(levelNo).id];
  ctx.fillStyle = w.grass; ctx.fillRect(0, 0, W, H);
  // Brett
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    ctx.fillStyle = (r + c) % 2 ? w.a : w.b;
    ctx.fillRect(ox + c * cs, oy + r * cs, cs, cs);
    // Grasbüschel (fest je Feld)
    if (st.tiles[r][c].t === 'gras' && hash(r, c, levelNo) < 0.45) {
      const gx = ox + (c + 0.2 + hash(r, c, 1) * 0.6) * cs, gy = oy + (r + 0.3 + hash(r, c, 2) * 0.5) * cs;
      ctx.strokeStyle = w.tuft; ctx.lineWidth = Math.max(1.5, cs * 0.025); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(gx - cs * 0.05, gy); ctx.lineTo(gx - cs * 0.07, gy - cs * 0.08); ctx.moveTo(gx, gy); ctx.lineTo(gx, gy - cs * 0.1); ctx.moveTo(gx + cs * 0.05, gy); ctx.lineTo(gx + cs * 0.08, gy - cs * 0.07); ctx.stroke();
      if (hash(r, c, 9) < 0.2) { ctx.fillStyle = hash(r, c, 7) < 0.5 ? '#fff' : '#ffd84d'; ctx.beginPath(); ctx.arc(gx + cs * 0.15, gy - cs * 0.02, cs * 0.035, 0, TAU); ctx.fill(); }
    }
  }
  // Holzrahmen ums Brett
  ctx.strokeStyle = w.frame; ctx.lineWidth = Math.max(4, cs * 0.08);
  roundRect(ctx, ox - cs * 0.06, oy - cs * 0.06, cs * COLS + cs * 0.12, cs * ROWS + cs * 0.12, cs * 0.12); ctx.stroke();
}

function drawTiles() {
  // flache Felder zuerst, dann Gegenstände von oben nach unten (Überlappung nach oben)
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const t = st.tiles[r][c].t, x = cx(c), y = cy(r);
    if (t === 'bach') drawWater(ctx, r, c, x, y, cs, clock);
    else if (t === 'bruecke') drawBridge(ctx, r, c, x, y, cs, clock);
    else if (t === 'pfuetze') drawPuddle(ctx, r, c, x, y, cs, clock);
  }
}
function drawObjects() {
  const target = draft ? draft.kind : null;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const t = st.tiles[r][c], x = cx(c), y = cy(r);
      if (t.t === 'baum') drawTree(ctx, x, y, cs);
      else if (t.t === 'heu') drawHay(ctx, x, y, cs);
      else if (t.t === 'zaun') drawFence(ctx, r, c, x, y, cs);
      else if (t.t === 'gatter') {
        const hinted = fx.some((f) => f.type === 'gatehint' && f.r === r && f.c === c);
        drawGate(ctx, r, c, x, y, cs, gateOpen(st, r, c), hinted ? clock : (hintGate && hintGate.r === r && hintGate.c === c ? clock : 0));
      } else if (t.t === 'zuhause') {
        const h = homeFx[r + ',' + c] || {};
        drawHome(ctx, t.kind, x, y, cs, { glow: target === t.kind ? clock + 0.01 : 0, shake: h.shake || 0, bounce: h.bounce || 0, peek: h.peek > 0 });
      }
    }
    // Tiere dieser Reihe (wartend) – laufende werden danach obenauf gezeichnet
    for (const a of st.animals) if (a.state === 'wait' && a.r === r) drawAnimalAt(a);
  }
  for (const a of st.animals) if (a.state === 'walk') drawAnimalAt(a);
}
function drawAnimalAt(a) {
  const p = animalPos(a), x = ox + (p.c + 0.5) * cs;
  let y = oy + (p.r + 0.5) * cs, s = cs * 0.92;
  if (a.state === 'walk') {
    const k = a.s % 1; y -= Math.abs(Math.sin(k * Math.PI)) * cs * 0.14;
    const n = a.path.length - 1;
    if (a.s > n - 0.6) s *= clamp((n - a.s) / 0.6, 0.15, 1);   // schlüpft ins Haus
  } else {
    y += Math.sin(clock * 2.2 + a.i * 1.7) * cs * 0.015;
    if (draft && draft.idx === a.i) s *= 1.12;
  }
  ctx.fillStyle = 'rgba(0,0,0,.14)'; ctx.beginPath(); ctx.ellipse(x, oy + (p.r + 0.5) * cs + cs * 0.34, s * 0.28, s * 0.07, 0, 0, TAU); ctx.fill();
  const blink = ((clock + a.i * 1.3) % 3.7) < 0.12;
  ctx.save();
  if (a.dir < 0) { ctx.translate(x, 0); ctx.scale(-1, 1); ctx.translate(-x, 0); }
  drawAnimal(ctx, a.kind, x, y, s, { blink, happy: a.state === 'walk' });
  ctx.restore();
}

function pathLine(cells, col, alpha, width, dashed) {
  if (cells.length < 2) return;
  ctx.save(); ctx.globalAlpha = alpha; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath(); cells.forEach(([r, c], i) => (i ? ctx.lineTo(cx(c), cy(r)) : ctx.moveTo(cx(c), cy(r))));
  ctx.strokeStyle = col; ctx.lineWidth = width; ctx.stroke();
  if (dashed) { ctx.setLineDash([cs * 0.08, cs * 0.14]); ctx.lineDashOffset = -clock * cs * 0.6; ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = width * 0.3; ctx.stroke(); }
  ctx.restore();
}
function drawPaths() {
  for (const a of st.animals) {
    if (a.state !== 'walk') continue;
    const k = Math.floor(a.s);
    const rest = [[animalPos(a).r, animalPos(a).c], ...a.path.slice(k + 1)];
    ctx.save(); ctx.globalAlpha = 0.55; ctx.fillStyle = KIND_COL[a.kind];
    for (let i = 1; i < rest.length; i++) { ctx.beginPath(); ctx.arc(cx(rest[i][1]), cy(rest[i][0]), cs * 0.06, 0, TAU); ctx.fill(); }
    ctx.restore();
  }
  for (const f of fading) pathLine(f.cells, KIND_COL[f.kind], 0.5 * (1 - f.t / 0.5), cs * 0.3, false);
  if (draft) {
    pathLine(draft.cells, KIND_COL[draft.kind], 0.75, cs * 0.32, true);
    const [r, c] = draft.cells[draft.cells.length - 1];
    ctx.fillStyle = '#fff'; ctx.strokeStyle = KIND_COL[draft.kind]; ctx.lineWidth = cs * 0.05;
    ctx.beginPath(); ctx.arc(cx(c), cy(r), cs * 0.13, 0, TAU); ctx.fill(); ctx.stroke();
  }
}

function drawParticles() {
  for (const p of particles) {
    const k = clamp(p.life / p.max, 0, 1);
    ctx.save(); ctx.globalAlpha = Math.min(1, k * 1.5);
    if (p.kind === 'star') { ctx.translate(p.x, p.y); ctx.rotate(p.rot || 0); ctx.fillStyle = p.c; star(ctx, 0, 0, p.r * 1.6, p.r * 0.7); }
    else if (p.kind === 'heart') { ctx.fillStyle = '#ff5c8a'; heart(ctx, p.x, p.y, p.r); }
    else if (p.kind === 'conf') { ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillStyle = p.c; ctx.fillRect(-p.r, -p.r * 0.5, p.r * 2, p.r); }
    ctx.restore();
  }
}
function star(X, x, y, R, r) { X.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r : R; X.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } X.closePath(); X.fill(); }
function heart(X, x, y, s) { X.beginPath(); X.moveTo(x, y + s * 0.9); X.bezierCurveTo(x - s * 1.6, y - s * 0.1, x - s * 0.6, y - s * 1.2, x, y - s * 0.35); X.bezierCurveTo(x + s * 0.6, y - s * 1.2, x + s * 1.6, y - s * 0.1, x, y + s * 0.9); X.fill(); }

// ---------- Hilfe-Finger ----------
let hintGate = null;
function hintTarget() {
  hintGate = null;
  if (mode !== 'play' || draft) return null;
  const wait = hintSeen ? 7 : 1.0;
  if (idle < wait) return null;
  for (const a of st.animals) {
    if (a.state !== 'wait') continue;
    const p = findPath(st, a.i, true);
    if (!p) continue;
    const g = p.find(([r, c]) => st.tiles[r][c].t === 'gatter' && !gateOpen(st, r, c));
    if (g) { hintGate = { r: g[0], c: g[1] }; return { tap: true, r: g[0], c: g[1] }; }
    return { path: p };
  }
  return null;
}
function drawFinger(x, y, press) {
  ctx.save();
  ctx.translate(x + 4, y + 4); ctx.rotate(-0.45); ctx.scale(1 - press * 0.08, 1 - press * 0.08);
  ctx.fillStyle = '#fff'; ctx.strokeStyle = '#11121A'; ctx.lineWidth = 2.5; ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(-6, 4); ctx.lineTo(-6, 26); ctx.quadraticCurveTo(-6, 31, -12, 34); ctx.quadraticCurveTo(-20, 38, -16, 48);
  ctx.quadraticCurveTo(-10, 62, 6, 64); ctx.quadraticCurveTo(22, 64, 24, 48); ctx.lineTo(24, 34); ctx.quadraticCurveTo(24, 28, 18, 28);
  ctx.quadraticCurveTo(14, 24, 9, 26); ctx.lineTo(6, 4); ctx.quadraticCurveTo(0, -4, -6, 4);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.restore();
}
function drawHint() {
  const h = hintTarget();
  if (!h) return;
  if (h.tap) { const k = (clock * 1.2) % 1; drawFinger(cx(h.c), cy(h.r), k < 0.3 ? 1 : 0); return; }
  const p = h.path, dur = 0.45 * p.length + 0.6, k = (clock % (dur + 0.8)) / dur;
  if (k > 1) return;
  const f = clamp(k, 0, 1) * (p.length - 1), i = Math.min(p.length - 2, Math.floor(f)), t = f - i;
  const x = lerp(cx(p[i][1]), cx(p[i + 1][1]), t), y = lerp(cy(p[i][0]), cy(p[i + 1][0]), t);
  ctx.save(); ctx.globalAlpha = 0.45; pathLine(p.slice(0, i + 1).concat([[lerp(p[i][0], p[i + 1][0], t), lerp(p[i][1], p[i + 1][1], t)]]), '#ffffff', 1, cs * 0.18, false); ctx.restore();
  drawFinger(x, y, 1);
}

function render() {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (!st) { ctx.fillStyle = '#8fd16a'; ctx.fillRect(0, 0, W, H); return; }
  drawGround();
  drawTiles();
  drawPaths();
  drawObjects();
  drawParticles();
  drawHint();
}

// ---------- Startbild ----------
function drawHero() {
  const hc = $('hero'), X = hc.getContext('2d'), w = hc.width, h = hc.height;
  X.clearRect(0, 0, w, h);
  X.fillStyle = 'rgba(0,0,0,.08)'; X.beginPath(); X.ellipse(w / 2, h * 0.86, w * 0.46, h * 0.07, 0, 0, TAU); X.fill();
  drawHome(X, 'kalb', w * 0.5, h * 0.47, h * 0.6);
  drawTree(X, w * 0.13, h * 0.5, h * 0.42);
  drawAnimal(X, 'kueken', w * 0.22, h * 0.78, h * 0.26, { happy: true });
  drawAnimal(X, 'ferkel', w * 0.4, h * 0.8, h * 0.3, { happy: true });
  drawAnimal(X, 'lamm', w * 0.6, h * 0.8, h * 0.3, { happy: true });
  drawAnimal(X, 'kalb', w * 0.8, h * 0.78, h * 0.3, { happy: true });
}

// ---------- HUD und Menüs ----------
function updateHud() {
  if (!st) return;
  const n = animalsHome(st), all = st.animals.length, key = `${levelNo}|${n}|${all}`;
  if (key === hudCache) return;
  hudCache = key;
  $('hudLevel').textContent = String(levelNo);
  $('hudHome').textContent = `${n}/${all}`;
  $('hudHomeLabel').textContent = `Tiere zu Hause: ${n} von ${all}`;
}
const SCREENS = ['start', 'levels', 'pause', 'win'];
function show(id) { for (const s of SCREENS) $(s).hidden = s !== id; }
function setMode(m) {
  mode = m;
  if (m !== 'play') endDraft(false);
  $('hud').classList.toggle('off', m === 'menu');
  if (m !== 'play') hideTip();
  if (m === 'play' || m === 'cheer') show(null);
  if (m === 'pause') show('pause');
  if (m === 'won') showWin();
  document.body.dataset.mode = m;
  musicSync();
}
function showWin() {
  const last = levelNo === LEVEL_COUNT;
  $('winTitle').textContent = last ? 'Alle Tiere schlafen!' : ['Super gemacht!', 'Toll!', 'Juhu!', 'Prima!'][levelNo % 4];
  $('winTime').textContent = fmt(lastResult.cs);
  $('winRecord').hidden = !lastResult.rec;
  const res = $('winResult');
  if (activeCh) {
    const won = lastResult.cs <= activeCh.t, diff = Math.abs(activeCh.t - lastResult.cs);
    res.hidden = false; res.className = 'result ' + (won ? 'win' : 'lose');
    res.textContent = won ? (diff ? `🏆 Herausforderung geschafft – ${fmt(diff)} schneller!` : '🏆 Herausforderung geschafft – genau gleich schnell!') : `Knapp! Noch ${fmt(diff)} schneller – nochmal?`;
  } else res.hidden = true;
  $('winNext').querySelector('.lbl').textContent = last ? 'Fertig' : 'Weiter';
  $('winNext').setAttribute('aria-label', last ? 'Fertig, zur Levelauswahl' : 'Weiter zu Level ' + (levelNo + 1));
  show('win');
  kontoHinweis('kontoBox');
  setTimeout(() => $('winNext').focus({ preventScroll: true }), 50);
}
function nextLevel() { for (let n = 1; n <= save.unlocked; n++) if (!save.best[n]) return n; return Math.min(save.unlocked, LEVEL_COUNT); }
function openMenu() {
  if (!st) { lv = LEVELS[nextLevel() - 1]; levelNo = lv.id; st = newState(lv); }
  setMode('menu'); show('start');
  const box = $('challengeBox');
  if (challenge) { box.hidden = false; box.innerHTML = `🏆 Herausforderung · Level ${challenge.l}<b>${fmt(challenge.t)}</b>Schafft ihr es schneller?`; $('playLabel').textContent = 'Annehmen'; }
  else { box.hidden = true; $('playLabel').textContent = save.best[1] ? 'Weiter' : 'Spielen'; }
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
      b.className = 'lvl' + (n === nx && !best ? ' next' : '');
      b.style.setProperty('--sc', LVL_COL[w.id]);
      b.disabled = locked;
      b.innerHTML = `${n}${best ? `<small>${fmt(best)}</small><svg class="ok" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="11" fill="#2fbf71"/><path d="M6.5 12.5l3.5 3.5 7.5-8" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>` : ''}`;
      b.setAttribute('aria-label', `Level ${n}${best ? ', geschafft, Bestzeit ' + fmt(best) : locked ? ', gesperrt' : ''}`);
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
  const url = `${location.origin}/spiele/ab-in-den-stall?l=${levelNo}&t=${lastResult.cs}`;
  const text = `Ab in den Stall!, Level ${levelNo}: Wir haben alle Tiere in ${fmt(lastResult.cs)} nach Hause gebracht. Schafft ihr es schneller?`;
  if (navigator.share) { try { await navigator.share({ title: 'Ab in den Stall!', text, url }); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
  try { await navigator.clipboard.writeText(text + ' ' + url); toast('Link kopiert – schickt ihn an eure Freunde!'); } catch { toast(url); }
}

// Hinweis aufs Konto: nur ohne Anmeldung und erst, wenn es etwas zu verlieren gibt (ab 2 geschafften Leveln)
function kontoHinweis(id) {
  const P = window.PlaySaal, n = Object.keys(save.best).length;
  const meilenstein = id === 'kontoBoxMenu' || [2, 5, 10, 15, 20, 25, 30].includes(n);
  let zeigen = false;
  try { zeigen = !!(P && P.hostOk && !P.user() && n >= 2 && meilenstein); } catch { zeigen = false; }
  $(id).hidden = !zeigen;
}
function kontoAnlegen() { try { window.PlaySaal && window.PlaySaal.anmelden({}); } catch { /* Konten nicht verfügbar */ } }
$('kontoBtn').addEventListener('click', kontoAnlegen);
$('kontoBtnMenu').addEventListener('click', kontoAnlegen);
setTimeout(() => { if (mode === 'menu' && !$('start').hidden) kontoHinweis('kontoBoxMenu'); }, 1500);   // playsaal.js lädt verzögert

$('btnPlay').addEventListener('click', () => { unlockAudio(); SFX.click(); startLevel(challenge ? challenge.l : nextLevel()); });
$('btnLevels').addEventListener('click', () => { unlockAudio(); SFX.click(); openLevels(); });
$('levelsBack').addEventListener('click', () => { SFX.click(); openMenu(); });
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
  if (mode !== 'pause') update(dt);
  render();
  requestAnimationFrame(frame);
}

// Testzugang (nur für automatisierte Prüfungen)
window.__stall = {
  get mode() { return mode; }, get st() { return st; }, get save() { return save; }, get level() { return levelNo; },
  cell: (r, c) => ({ x: cx(c), y: cy(r) }), findPath: (i) => findPath(st, i, true), homeAt: (r, c) => homeAt(st, r, c), waitingAt: (r, c) => waitingAt(st, r, c)
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
