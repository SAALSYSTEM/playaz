// SCHRÄGLAGE: Spiel im Browser – Darstellung, Steuerung, Menüs, Ton, Speicherstand, Awards, Teilen.
// Physik und Regeln stehen in sim.js (fester 60-Hz-Takt), die Level in levels.js.
import { createSim, VEHICLES, VEHICLE_ORDER, DT, HZ, SIM_VERSION, SURFACES, encodeInputs, decodeInputs, normAngle } from './sim.js';
import { LEVELS, THEMES } from './levels.js';
import { AWARDS, AWARD_BY_ID, RARITY, evaluateAwards, progressOf, drawAwardIcon, drawShareImage } from './awards.js';
import { createOnline } from './online.js';

const $ = (s) => document.querySelector(s);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const PARAMS = new URLSearchParams(location.search);
const TEST = PARAMS.has('test');
const LEVEL_BY_ID = Object.fromEntries(LEVELS.map((l) => [l.id, l]));
const N = LEVELS.length;
const SAVE_KEY = 'schraeglage.v1';
const D3 = { x: 0.26, y: 0.5 };          // Tiefe der Pseudo-3D-Flächen in Metern
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ====================================================================== Speicherstand
function leerStand() {
  return { v: 1, levels: {}, awards: {}, stats: { crashes: 0, dist: 0, airTicks: 0, flips: 0, streak: 0, shared: 0, challengesWon: 0, vehicles: [], finishes: 0, tries: 0 },
    settings: { sound: true, ghost: true, paint: 'werk', name: '' }, last: 1 };
}
function ladeStand() {
  const s = leerStand();
  try {
    const roh = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (roh && typeof roh === 'object' && roh.v === 1) {
      if (roh.levels && typeof roh.levels === 'object') for (const k of Object.keys(roh.levels)) {
        const id = +k, l = roh.levels[k];
        if (!LEVEL_BY_ID[id] || !l || typeof l !== 'object') continue;
        s.levels[id] = { done: !!l.done, best: Number.isFinite(l.best) && l.best > 0 ? Math.round(l.best) : null, gold: !!l.gold,
          fails: Math.max(0, l.fails | 0), tries: Math.max(0, l.tries | 0), wins: Math.max(0, l.wins | 0),
          inputs: typeof l.inputs === 'string' && l.inputs.length < 40000 ? l.inputs : null, sv: l.sv | 0, ver: !!l.ver };
      }
      if (roh.awards && typeof roh.awards === 'object') for (const k of Object.keys(roh.awards)) if (AWARD_BY_ID[k] && roh.awards[k] && typeof roh.awards[k].at === 'string') s.awards[k] = { at: roh.awards[k].at, level: roh.awards[k].level | 0 || null, ms: roh.awards[k].ms | 0 || null };
      const st = roh.stats || {};
      for (const k of ['crashes', 'dist', 'airTicks', 'flips', 'streak', 'shared', 'challengesWon', 'finishes', 'tries']) if (Number.isFinite(st[k]) && st[k] >= 0) s.stats[k] = st[k];
      if (Array.isArray(st.vehicles)) s.stats.vehicles = st.vehicles.filter((v) => VEHICLES[v]);
      const se = roh.settings || {};
      if (typeof se.sound === 'boolean') s.settings.sound = se.sound;
      if (typeof se.ghost === 'boolean') s.settings.ghost = se.ghost;
      if (typeof se.paint === 'string' && PAINTS.some((p) => p.id === se.paint)) s.settings.paint = se.paint;
      if (typeof se.name === 'string') s.settings.name = saubererName(se.name);
      if (LEVEL_BY_ID[roh.last]) s.last = roh.last;
    }
  } catch (e) { /* kaputt oder gesperrt: frisch starten */ }
  return s;
}
let speicherFehler = false;
function speichern() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(stand)); speicherFehler = false; }
  catch (e) { if (!speicherFehler) toast('Speichern nicht möglich (privater Modus?)'); speicherFehler = true; }
}
function saubererName(n) {
  n = String(n || '').replace(/[^A-Za-z0-9ÄÖÜäöüß_. -]/g, '').replace(/\s+/g, ' ').trim().slice(0, 16);
  return n.length >= 3 ? n : '';
}
const levelDaten = (id) => (stand.levels[id] = stand.levels[id] || { done: false, best: null, gold: false, fails: 0, tries: 0, wins: 0, inputs: null, sv: 0, ver: false });
const freigeschaltet = (id) => id === 1 || !!(stand.levels[id] && stand.levels[id].done) || !!(stand.levels[id - 1] && stand.levels[id - 1].done);
const naechstesOffenes = () => { for (const l of LEVELS) if (!(stand.levels[l.id] && stand.levels[l.id].done)) return freigeschaltet(l.id) ? l.id : 1; return 1; };

// ====================================================================== Lackierungen (nur Optik)
const PAINTS = [
  { id: 'werk', name: 'Werkslack', award: null },
  { id: 'nacht', name: 'Mattschwarz', base: '#2b2e38', accent: '#FF9200', award: 'bronze' },
  { id: 'mint', name: 'Mint', base: '#4fd1b0', accent: '#ffffff', award: 'silber' },
  { id: 'polar', name: 'Polar', base: '#eef3fa', accent: '#2c6fd6', award: 'unkaputtbar' },
  { id: 'flamme', name: 'Flamme', base: '#e8401c', accent: '#ffd21c', award: 'stunt' },
  { id: 'pink', name: 'Neonpink', base: '#ff4fa3', accent: '#3a1d6e', award: 'salto' },
  { id: 'tarn', name: 'Tarnlack', base: '#6b7a3a', accent: '#3e4622', award: 'comeback' },
  { id: 'goldlack', name: 'Goldlack', base: '#f2b81f', accent: '#7a4a00', award: 'gold' },
  { id: 'chrom', name: 'Chrom', base: '#c9d1dc', accent: '#5b6474', award: 'meister' },
  { id: 'karo', name: 'Zielflagge', base: '#f4f4f4', accent: '#11121A', award: 'allesgold' }
];
const paintFrei = (p) => !p.award || !!stand.awards[p.award];
function farben(vehicleId, paintId) {
  const p = PAINTS.find((x) => x.id === paintId) || PAINTS[0];
  const base = p.base || VEHICLES[vehicleId].color;
  const accent = p.accent || '#ffffff';
  return { base, accent, hell: shade(base, 0.35), dunkel: shade(base, -0.35), sehrDunkel: shade(base, -0.6), id: p.id };
}
function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const t = f < 0 ? 0 : 255, p = Math.abs(f);
  r = Math.round((t - r) * p + r); g = Math.round((t - g) * p + g); b = Math.round((t - b) * p + b);
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}

let stand = ladeStand();
const online = createOnline();

// ====================================================================== Ton (WebAudio, alles synthetisch)
const ton = {
  ctx: null, master: null, motor: null, noise: null,
  init() {
    if (this.ctx || !window.AudioContext && !window.webkitAudioContext) return;
    try {
      const C = window.AudioContext || window.webkitAudioContext;
      const ctx = this.ctx = new C();
      this.master = ctx.createGain(); this.master.gain.value = stand.settings.sound ? 0.7 : 0; this.master.connect(ctx.destination);
      const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      o1.type = 'sawtooth'; o2.type = 'square'; o1.frequency.value = 50; o2.frequency.value = 25.5;
      f.type = 'lowpass'; f.frequency.value = 500; f.Q.value = 2; g.gain.value = 0;
      const g2 = ctx.createGain(); g2.gain.value = 0.5;
      o1.connect(f); o2.connect(g2); g2.connect(f); f.connect(g); g.connect(this.master);
      o1.start(); o2.start();
      this.motor = { o1, o2, f, g };
      const len = ctx.sampleRate * 1.2, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.noise = buf;
    } catch (e) { this.ctx = null; }
  },
  resume() { this.init(); if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {}); },
  setOn(on) { if (this.master) this.master.gain.setTargetAtTime(on ? 0.7 : 0, this.ctx.currentTime, 0.05); },
  engine(rpm, gas, aktiv) {
    if (!this.motor) return;
    const t = this.ctx.currentTime, m = this.motor;
    const f = 42 + rpm * 120 + gas * 14;
    m.o1.frequency.setTargetAtTime(f, t, 0.05); m.o2.frequency.setTargetAtTime(f * 0.51, t, 0.05);
    m.f.frequency.setTargetAtTime(380 + rpm * 1500 + gas * 500, t, 0.06);
    m.g.gain.setTargetAtTime(aktiv ? 0.035 + gas * 0.045 + rpm * 0.02 : 0, t, 0.08);
  },
  rauschen(dauer, typ, f0, f1, vol, q) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = this.noise; f.type = typ; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dauer); f.Q.value = q || 1;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dauer);
    s.connect(f); f.connect(g); g.connect(this.master); s.start(t); s.stop(t + dauer + 0.05);
  },
  klang(freq, dauer, typ, vol, wann, bis) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime + (wann || 0), o = ctx.createOscillator(), g = ctx.createGain();
    o.type = typ || 'triangle'; o.frequency.setValueAtTime(freq, t); if (bis) o.frequency.exponentialRampToValueAtTime(bis, t + dauer);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dauer);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dauer + 0.05);
  },
  crash() { this.rauschen(0.7, 'lowpass', 2400, 120, 0.55); this.klang(90, 0.35, 'sine', 0.5, 0, 35); this.rauschen(0.25, 'highpass', 3000, 6000, 0.12); },
  land(v) { const vol = clamp(v / 14, 0.05, 0.5); this.klang(70, 0.18, 'sine', vol, 0, 40); this.rauschen(0.12, 'lowpass', 900, 200, vol * 0.4); },
  ziel() { [523, 659, 784, 1046].forEach((f, i) => this.klang(f, 0.22, 'square', 0.08, i * 0.09)); this.klang(1046, 0.6, 'triangle', 0.12, 0.36); },
  award() { [784, 988, 1175, 1568, 1976].forEach((f, i) => this.klang(f, 0.3, 'triangle', 0.13, i * 0.07)); },
  klick() { this.klang(880, 0.05, 'square', 0.05); },
  boost() { this.rauschen(0.35, 'bandpass', 600, 2400, 0.18, 3); },
  wechsel() { this.klang(440, 0.12, 'square', 0.08); this.klang(660, 0.16, 'square', 0.08, 0.1); },
  bruch() { this.rauschen(0.3, 'lowpass', 1500, 300, 0.25); }
};

// ====================================================================== Darstellung
const canvas = $('#c');
const ctx = canvas.getContext('2d', { alpha: false });
let W = 0, H = 0, DPR = 1;
function groesse() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = Math.max(1, window.innerWidth); H = Math.max(1, window.innerHeight);
  canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
}
window.addEventListener('resize', groesse);
groesse();

const PAL = {
  wiese: { sky: ['#4fb8f5', '#bfe9ff'], sonne: '#fff6c8', fern: '#9cc9e6', mitte: '#7fcf7a', nah: '#56b25a', face: ['#a8703c', '#7b4e27'], stein: 'rgba(70,40,18,.35)', top: '#6fcf4f', wolken: 0.9 },
  canyon: { sky: ['#f88a52', '#ffd9a0'], sonne: '#fff1c2', fern: '#e8a07a', mitte: '#d07a4c', nah: '#b4603a', face: ['#c0663a', '#8d4424'], stein: 'rgba(90,30,10,.35)', top: '#e3a868', wolken: 0.45 },
  baustelle: { sky: ['#6fb1e3', '#dceefa'], sonne: '#fffbe0', fern: '#a7b5c9', mitte: '#8a99b0', nah: '#6c7b92', face: ['#8f949f', '#666b77'], stein: 'rgba(40,44,54,.28)', top: '#4b505d', wolken: 0.8 },
  gletscher: { sky: ['#6aa6e6', '#e6f3ff'], sonne: '#ffffff', fern: '#d2e4f6', mitte: '#a9c9e8', nah: '#86afd8', face: ['#8db2d8', '#5f86b2'], stein: 'rgba(30,60,110,.25)', top: '#ffffff', wolken: 0.7 },
  insel: { sky: ['#2ec5ea', '#c9f5ff'], sonne: '#fff9d2', fern: '#86d6c8', mitte: '#49bf9d', nah: '#2fa07f', face: ['#d9a65a', '#b07d38'], stein: 'rgba(120,70,20,.3)', top: '#f2d28b', wolken: 0.85 },
  gipfel: { sky: ['#5b3f9e', '#ffc2d4'], sonne: '#fff0d6', fern: '#b9a2d8', mitte: '#8f7fc2', nah: '#6d5fa6', face: ['#8a86a8', '#5a5778'], stein: 'rgba(40,30,80,.3)', top: '#ffffff', wolken: 0.6 },
  vulkan: { sky: ['#2a1633', '#b2452f'], sonne: '#ffb36b', fern: '#4a2438', mitte: '#3b1f2c', nah: '#2d1820', face: ['#43302f', '#241a1b'], stein: 'rgba(0,0,0,.35)', top: '#5d4a48', wolken: 0.25 }
};
const SURF_COL = {
  gras: ['#6fcf4f', '#3f9c34'], erde: ['#b97c45', '#875628'], asphalt: ['#4b505d', '#31343d'], holz: ['#c98f4e', '#8e5c2b'], stein: ['#9b948d', '#6b655f'],
  metall: ['#a7b2c2', '#6f7a8b'], strand: ['#f4d896', '#d2ab62'], sand: ['#e2b45f', '#a8792f'], schlamm: ['#6d4a2c', '#4a2f19'], schnee: ['#ffffff', '#c9dcf0'], eis: ['#c6efff', '#7fc6ea'],
  boost: ['#FF9200', '#b35f00'], trampolin: ['#ff5aa5', '#b8306f'], feder: ['#5fd08a', '#2e8a4a'], lava: ['#ff6a1f', '#c42d0b']
};

// Zufallszahlen nur für Optik (deterministisch je Level, damit Deko stabil steht)
function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

let szene = null;   // gecachte Pfade für das aktuelle Level
function baueSzene(level) {
  const pal = PAL[level.theme];
  const r = rng(level.id * 7919);
  const stuecke = level.ground.map((g) => {
    const pts = g.pts, n = pts.length;
    let x0 = Infinity, x1 = -Infinity, ymax = -Infinity;
    for (const p of pts) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); ymax = Math.max(ymax, p[1]); }
    const ox = -D3.x / 2, oy = -D3.y / 2;
    const face = new Path2D();
    face.moveTo(pts[0][0] + ox, g.bottom); for (const p of pts) face.lineTo(p[0] + ox, p[1] + oy); face.lineTo(pts[n - 1][0] + ox, g.bottom); face.closePath();
    const tops = {}, lips = {};
    for (let i = 0; i < n - 1; i++) {
      const s = g.surf[i] || 'erde', a = pts[i], b = pts[i + 1];
      const tp = tops[s] || (tops[s] = new Path2D());
      tp.moveTo(a[0] + ox, a[1] + oy); tp.lineTo(b[0] + ox, b[1] + oy); tp.lineTo(b[0] + ox + D3.x, b[1] + oy + D3.y); tp.lineTo(a[0] + ox + D3.x, a[1] + oy + D3.y); tp.closePath();
      const lp = lips[s] || (lips[s] = new Path2D());
      lp.moveTo(a[0] + ox, a[1] + oy); lp.lineTo(b[0] + ox, b[1] + oy);
    }
    // Steine in der Vorderfläche
    const steine = new Path2D();
    const yAt = (x) => { for (let i = 0; i < n - 1; i++) if (x >= pts[i][0] && x <= pts[i + 1][0]) { const t = (x - pts[i][0]) / (pts[i + 1][0] - pts[i][0] || 1); return lerp(pts[i][1], pts[i + 1][1], t); } return -1e9; };
    for (let x = x0 + 0.6; x < x1 - 0.4; x += 0.9 + r() * 1.6) {
      const top = yAt(x);
      for (let k = 0; k < 3; k++) {
        const y = top - 0.7 - r() * 6, rad = 0.08 + r() * 0.2;
        if (y < top - 0.45 && y > g.bottom + 1) { steine.moveTo(x + ox + rad, y); steine.ellipse(x + ox, y, rad * 1.3, rad, 0, 0, Math.PI * 2); }
      }
    }
    // Deko hinten auf der Oberfläche
    const deko = [];
    for (let i = 0; i < n - 1; i++) {
      const a = pts[i], b = pts[i + 1], len = b[0] - a[0];
      if (len <= 0) continue;
      const slope = Math.abs((b[1] - a[1]) / len);
      if (slope > 0.3) continue;
      let x = a[0] + r() * 3;
      while (x < b[0]) {
        if (x > 4 && Math.abs(x - level.finish) > 4 && r() < 0.42) deko.push({ x, y: lerp(a[1], b[1], (x - a[0]) / len), t: r(), s: 0.8 + r() * 0.5, surf: g.surf[i] });
        x += 3 + r() * 7;
      }
    }
    return { g, face, tops, lips, steine, x0, x1, ymax, deko };
  });
  // Schluchten zwischen den Bodenstücken
  const sortiert = stuecke.slice().sort((a, b) => a.x0 - b.x0);
  const luecken = [];
  for (let i = 0; i < sortiert.length - 1; i++) {
    const a = sortiert[i], b = sortiert[i + 1];
    if (b.x0 - a.x1 < 0.3) continue;
    const ya = a.g.pts[a.g.pts.length - 1][1], yb = b.g.pts[0][1];
    luecken.push({ x0: a.x1, x1: b.x0, top: Math.min(ya, yb), bottom: a.g.bottom });
  }
  // Hintergrund-Silhouetten (zufällige Phasen je Level)
  const ph = [r() * 100, r() * 100, r() * 100, r() * 100];
  const wolken = Array.from({ length: 9 }, () => ({ x: r() * 2400, y: 0.12 + r() * 0.3, s: 0.6 + r() * 0.9 }));
  return { level, pal, stuecke, luecken, ph, wolken, minY: level.killY + 7 };
}

// ---------- Kamera ----------
const cam = { x: 0, y: 3, ppm: 30, shake: 0 };
function sichtbreite() { const asp = W / H; return clamp(asp * 12.5, 13.5, 34); }
let kameraFix = null;   // nur Tests: feste Kamera für Level-Übersichten
function kameraZiel(sim, sofort) {
  if (kameraFix) { cam.x = kameraFix.x; cam.y = kameraFix.y; cam.ppm = kameraFix.ppm; return; }
  const ch = sim.car.chassis, p = ch.getPosition(), v = ch.getLinearVelocity();
  const speed = Math.sqrt(v.x * v.x + v.y * v.y);
  const ppm = (W / sichtbreite()) / (1 + clamp(speed / 45, 0, 0.22));
  const menu = zustand === 'menu' || zustand === 'start';
  const hoch = W < H;
  const tx = p.x + clamp(v.x * 0.38, -4, 7) + (W / ppm) * (menu && !hoch ? -0.2 : 0.08);
  const ty = p.y + clamp(v.y * 0.12, -2, 2) + (H / ppm) * (menu && hoch ? -0.22 : hoch ? 0.06 : 0.1);
  if (sofort) { cam.x = tx; cam.y = ty; cam.ppm = ppm; return; }
  const k = 1 - Math.exp(-frameDt * 4.5);
  cam.x += (tx - cam.x) * k; cam.y += (ty - cam.y) * (1 - Math.exp(-frameDt * 3.2)); cam.ppm += (ppm - cam.ppm) * (1 - Math.exp(-frameDt * 1.5));
}
function weltTransform() {
  let sx = 0, sy = 0;
  if (cam.shake > 0.01 && !reduceMotion) { sx = (Math.random() - 0.5) * cam.shake * 14; sy = (Math.random() - 0.5) * cam.shake * 14; }
  ctx.setTransform(DPR * cam.ppm, 0, 0, -DPR * cam.ppm, DPR * (W / 2 - cam.x * cam.ppm + sx), DPR * (H / 2 + cam.y * cam.ppm + sy));
}
const sichtX0 = () => cam.x - W / 2 / cam.ppm - 2, sichtX1 = () => cam.x + W / 2 / cam.ppm + 2;

// ---------- Hintergrund ----------
function zeichneHimmel(sz, t) {
  const pal = sz.pal;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, pal.sky[0]); g.addColorStop(1, pal.sky[1]);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  // Sonne
  const sx = W * 0.78 - cam.x * 0.4, sy = H * 0.2 + cam.y * 0.6;
  const sxm = ((sx % (W * 1.6)) + W * 1.6) % (W * 1.6) - W * 0.2;
  const rg = ctx.createRadialGradient(sxm, sy, 0, sxm, sy, 140);
  rg.addColorStop(0, pal.sonne); rg.addColorStop(0.25, pal.sonne); rg.addColorStop(0.26, hexA(pal.sonne, 0.35)); rg.addColorStop(1, hexA(pal.sonne, 0));
  ctx.fillStyle = rg; ctx.fillRect(sxm - 140, sy - 140, 280, 280);
  // Wolken
  if (pal.wolken > 0.3) {
    ctx.fillStyle = sz.level.theme === 'vulkan' ? 'rgba(80,60,70,.5)' : 'rgba(255,255,255,' + pal.wolken + ')';
    for (const w of sz.wolken) {
      const span = W + 600;
      const x = (((w.x - cam.x * cam.ppm * 0.06 + t * 8 * w.s) % span) + span) % span - 300;
      const y = H * w.y + cam.y * cam.ppm * 0.05;
      wolke(x, y, 60 * w.s);
    }
  }
  // Silhouetten in drei Ebenen
  const ppm = cam.ppm, base = H / 2 + cam.y * ppm;
  ebene(0.12, pal.fern, base - 0.0 * ppm, 0.9, sz.ph[0], sz.level.theme, 0, ppm);
  ebene(0.28, pal.mitte, base + 1.5 * ppm, 0.65, sz.ph[1], sz.level.theme, 1, ppm);
  ebene(0.5, pal.nah, base + 3.5 * ppm, 0.45, sz.ph[2], sz.level.theme, 2, ppm);
  if (sz.level.theme === 'vulkan') { // Glühen am Horizont
    const lg = ctx.createLinearGradient(0, H * 0.4, 0, H);
    lg.addColorStop(0, 'rgba(255,90,30,0)'); lg.addColorStop(1, 'rgba(255,90,30,.25)');
    ctx.fillStyle = lg; ctx.fillRect(0, H * 0.4, W, H * 0.6);
  }
}
function wolke(x, y, s) {
  ctx.beginPath();
  ctx.arc(x, y, s * 0.55, 0, 7); ctx.arc(x + s * 0.55, y - s * 0.22, s * 0.6, 0, 7); ctx.arc(x + s * 1.15, y, s * 0.5, 0, 7);
  ctx.rect(x, y - s * 0.05, s * 1.15, s * 0.5);
  ctx.fill();
}
function ebene(f, farbe, base, hoehe, phase, theme, idx, ppm) {
  const off = cam.x * ppm * f;
  ctx.fillStyle = farbe;
  ctx.beginPath(); ctx.moveTo(0, H);
  const amp = H * 0.16 * hoehe;
  const yb = Math.min(base - amp * 0.2, H * (0.55 + idx * 0.1));
  const step = 14;
  for (let sx = 0; sx <= W + step; sx += step) {
    const x = (sx + off) / 160;
    let y;
    if (theme === 'baustelle' && idx < 2) { // Skyline
      const b = Math.floor(x * 1.6 + phase), hgt = 0.35 + 0.65 * frac(Math.sin(b * 12.9898 + idx) * 43758.5);
      y = yb - amp * hgt * 1.4;
    } else if (theme === 'canyon' && idx === 0) { // Tafelberge
      const v = Math.sin(x * 0.7 + phase) + 0.5 * Math.sin(x * 1.9 + phase * 2);
      y = yb - amp * (v > 0.3 ? 1.1 : 0.35);
    } else if ((theme === 'gletscher' || theme === 'gipfel') && idx === 0) { // Zacken
      const v = Math.abs(((x * 0.8 + phase) % 2) - 1);
      y = yb - amp * (0.4 + 1.1 * (1 - v)) - amp * 0.2 * Math.sin(x * 3 + phase);
    } else {
      y = yb - amp * (0.55 + 0.3 * Math.sin(x * 0.9 + phase) + 0.18 * Math.sin(x * 2.3 + phase * 1.7) + 0.08 * Math.sin(x * 5.1 + phase));
    }
    ctx.lineTo(sx, y);
  }
  ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
  // Akzente auf der mittleren Ebene
  if (idx === 1) {
    const r = rng(Math.floor(off / 220) + 99);
    ctx.fillStyle = shade(farbe.length === 7 ? farbe : '#888888', -0.15);
    for (let k = -1; k < W / 220 + 2; k++) {
      const wx = k * 220 - (off % 220) + 80;
      const rr = rng(Math.floor((off + k * 220) / 220) * 31 + 7);
      if (rr() < 0.5) continue;
      const hy = yb - amp * 0.62;
      silhouette(theme, wx, hy, 26 + rr() * 22);
    }
  }
}
function frac(v) { return v - Math.floor(v); }
function silhouette(theme, x, y, s) {
  ctx.beginPath();
  switch (theme) {
    case 'wiese': ctx.rect(x - s * 0.06, y - s * 0.6, s * 0.12, s * 0.6); ctx.moveTo(x + s * 0.45, y - s * 0.75); ctx.arc(x, y - s * 0.75, s * 0.45, 0, 7); break;
    case 'canyon': ctx.rect(x - s * 0.1, y - s * 1.1, s * 0.2, s * 1.1); ctx.rect(x - s * 0.4, y - s * 0.75, s * 0.12, s * 0.35); ctx.rect(x - s * 0.4, y - s * 0.5, s * 0.3, s * 0.1); ctx.rect(x + s * 0.28, y - s * 0.9, s * 0.12, s * 0.4); ctx.rect(x + s * 0.1, y - s * 0.6, s * 0.3, s * 0.1); break;
    case 'baustelle': ctx.rect(x, y - s * 2.2, s * 0.1, s * 2.2); ctx.rect(x - s * 0.5, y - s * 2.2, s * 1.6, s * 0.1); ctx.rect(x - s * 0.5, y - s * 2.1, s * 0.25, s * 0.25); break;
    case 'gipfel':
    case 'gletscher': for (let i = 0; i < 3; i++) { ctx.moveTo(x - s * (0.5 - i * 0.1), y - s * i * 0.35); ctx.lineTo(x, y - s * (0.6 + i * 0.35)); ctx.lineTo(x + s * (0.5 - i * 0.1), y - s * i * 0.35); } break;
    case 'insel': ctx.moveTo(x, y); ctx.quadraticCurveTo(x + s * 0.2, y - s * 0.6, x + s * 0.1, y - s * 1.2); ctx.lineTo(x + s * 0.18, y - s * 1.2); ctx.quadraticCurveTo(x + s * 0.3, y - s * 0.6, x + s * 0.1, y);
      for (let i = 0; i < 5; i++) { const a = -2.6 + i * 0.55; ctx.moveTo(x + s * 0.14, y - s * 1.2); ctx.quadraticCurveTo(x + s * 0.14 + Math.cos(a) * s * 0.5, y - s * 1.35 + Math.sin(a) * s * 0.3, x + s * 0.14 + Math.cos(a) * s * 0.8, y - s * 1.0 + Math.sin(a) * s * 0.2); ctx.lineTo(x + s * 0.14, y - s * 1.16); } break;
    case 'vulkan': ctx.moveTo(x - s, y); ctx.lineTo(x - s * 0.2, y - s * 1.3); ctx.lineTo(x + s * 0.2, y - s * 1.3); ctx.lineTo(x + s, y); break;
  }
  ctx.fill();
}
function hexA(hex, a) { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; }

// ---------- Boden ----------
function zeichneBoden(sz, t) {
  const x0 = sichtX0(), x1 = sichtX1(), pal = sz.pal;
  const lw = 1 / cam.ppm;
  for (const l of sz.luecken) {
    if (l.x1 < x0 || l.x0 > x1) continue;
    const g = ctx.createLinearGradient(0, l.top, 0, l.top - 9);
    g.addColorStop(0, shade(pal.face[1], -0.35)); g.addColorStop(1, shade(pal.face[1], -0.8));
    ctx.fillStyle = g;
    ctx.fillRect(l.x0 - D3.x / 2, l.bottom, l.x1 - l.x0 + D3.x, l.top - 0.6 - l.bottom);
    ctx.beginPath(); ctx.moveTo(l.x0 - D3.x / 2, l.top - 0.6); ctx.lineTo(l.x0 + D3.x / 2, l.top - 0.6 + D3.y); ctx.lineTo(l.x1 + D3.x / 2, l.top - 0.6 + D3.y); ctx.lineTo(l.x1 - D3.x / 2, l.top - 0.6); ctx.fill();
  }
  for (const s of sz.stuecke) {
    if (s.x1 < x0 - 2 || s.x0 > x1 + 2) continue;
    // Oberseite (Tiefe)
    for (const k of Object.keys(s.tops)) { ctx.fillStyle = SURF_COL[k] ? SURF_COL[k][0] : pal.top; ctx.fill(s.tops[k]); }
    // Deko hinten
    for (const d of s.deko) if (d.x > x0 - 3 && d.x < x1 + 3) zeichneDeko(sz.level.theme, d, t);
    // Vorderseite
    const fg = ctx.createLinearGradient(0, s.ymax, 0, s.ymax - 14);
    fg.addColorStop(0, pal.face[0]); fg.addColorStop(1, pal.face[1]);
    ctx.fillStyle = fg; ctx.fill(s.face);
    ctx.fillStyle = pal.stein; ctx.fill(s.steine);
    // Kante: Gras, Schnee, Eis …
    ctx.lineJoin = 'round'; ctx.lineCap = 'butt';
    for (const k of Object.keys(s.lips)) {
      const c = SURF_COL[k] || [pal.top, pal.top];
      ctx.strokeStyle = c[1]; ctx.lineWidth = 0.34; ctx.stroke(s.lips[k]);
    }
    ctx.strokeStyle = 'rgba(255,255,255,.28)'; ctx.lineWidth = 0.05;
    for (const k of Object.keys(s.lips)) ctx.stroke(s.lips[k]);
    // Sonderflächen
    zeichneSonderflaechen(s, t, x0, x1);
    ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.lineWidth = 2 * lw; ctx.stroke(s.face);
  }
}
function zeichneSonderflaechen(s, t, x0, x1) {
  const g = s.g, pts = g.pts, ox = -D3.x / 2, oy = -D3.y / 2;
  for (let i = 0; i < pts.length - 1; i++) {
    const k = g.surf[i];
    if (k !== 'boost' && k !== 'lava' && k !== 'trampolin' && k !== 'eis' && k !== 'feder' && k !== 'sand') continue;
    const a = pts[i], b = pts[i + 1];
    if (b[0] < x0 || a[0] > x1) continue;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]), ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
    ctx.save(); ctx.translate(a[0], a[1]); ctx.rotate(ang);
    if (k === 'boost') {
      ctx.fillStyle = 'rgba(255,255,255,.85)';
      const off = (t * 3) % 1.2;
      for (let x = off; x < len - 0.3; x += 1.2) { ctx.beginPath(); ctx.moveTo(x, 0.05); ctx.lineTo(x + 0.35, 0.16); ctx.lineTo(x, 0.27); ctx.lineTo(x + 0.12, 0.16); ctx.closePath(); ctx.fill(); }
    } else if (k === 'lava') {
      ctx.fillStyle = `rgba(255,${150 + 60 * Math.sin(t * 4 + a[0])},40,.9)`;
      ctx.fillRect(0, -0.05, len, 0.18);
    } else if (k === 'trampolin') {
      ctx.fillStyle = 'rgba(255,255,255,.7)';
      for (let x = 0.2; x < len; x += 0.6) ctx.fillRect(x, -0.02, 0.25, 0.12);
    } else if (k === 'feder') {
      ctx.strokeStyle = '#e9ecf2'; ctx.lineWidth = 0.06;
      for (let x = 0.25; x < len - 0.1; x += 0.5) { ctx.beginPath(); for (let j = 0; j <= 6; j++) ctx.lineTo(x + (j % 2 ? 0.12 : -0.12), -0.5 + j * 0.08); ctx.stroke(); }
      ctx.fillStyle = '#2e8a4a'; ctx.fillRect(0, -0.02, len, 0.1);
    } else if (k === 'sand') {
      ctx.fillStyle = 'rgba(120,80,30,.35)';
      for (let x = 0.2; x < len; x += 0.37) ctx.fillRect(x, -0.12 + ((x * 7.3) % 0.2), 0.08, 0.05);
    } else if (k === 'eis') {
      ctx.fillStyle = 'rgba(255,255,255,.6)';
      for (let x = 0.4; x < len; x += 2.1) ctx.fillRect(x, 0.08, 0.7, 0.05);
    }
    ctx.restore();
  }
}
function zeichneDeko(theme, d, t) {
  ctx.save();
  ctx.translate(d.x + D3.x / 2, d.y + D3.y / 2 - 0.05);
  ctx.scale(d.s, d.s);
  const v = d.t;
  switch (theme) {
    case 'wiese':
      if (v < 0.4) { baum(0.0, '#3f9a45', '#2f7d36'); }
      else if (v < 0.75) { ctx.fillStyle = '#4fae4f'; blob(0, 0.35, 0.55, 0.38); ctx.fillStyle = '#5fc25c'; blob(-0.15, 0.45, 0.3, 0.25); }
      else { for (let i = 0; i < 4; i++) { ctx.fillStyle = '#2f8a3a'; ctx.fillRect(-0.4 + i * 0.25, 0, 0.03, 0.35); ctx.fillStyle = ['#ff6b9d', '#ffd23f', '#ffffff', '#a78bfa'][i]; blob(-0.385 + i * 0.25, 0.38, 0.08, 0.08); } }
      break;
    case 'canyon':
      if (v < 0.45) { ctx.fillStyle = '#4c8a3a'; rrect(-0.15, 0, 0.3, 1.6, 0.15); rrect(-0.6, 0.6, 0.22, 0.6, 0.11); rrect(-0.6, 0.6, 0.6, 0.18, 0.09); rrect(0.38, 0.8, 0.22, 0.55, 0.11); rrect(0.1, 0.8, 0.5, 0.18, 0.09); }
      else { ctx.fillStyle = '#9c5a37'; blob(0, 0.3, 0.6, 0.35); ctx.fillStyle = '#b86d43'; blob(-0.15, 0.4, 0.35, 0.22); }
      break;
    case 'baustelle':
      if (v < 0.4) { ctx.fillStyle = '#ff7a1a'; ctx.beginPath(); ctx.moveTo(-0.25, 0); ctx.lineTo(0.25, 0); ctx.lineTo(0.06, 0.75); ctx.lineTo(-0.06, 0.75); ctx.fill(); ctx.fillStyle = '#fff'; ctx.fillRect(-0.15, 0.28, 0.3, 0.1); }
      else if (v < 0.7) { ctx.fillStyle = '#f4f4f4'; ctx.fillRect(-0.8, 0.45, 1.6, 0.35); ctx.fillStyle = '#e53935'; for (let i = 0; i < 4; i++) ctx.fillRect(-0.8 + i * 0.4, 0.45, 0.2, 0.35); ctx.fillStyle = '#555'; ctx.fillRect(-0.7, 0, 0.1, 0.45); ctx.fillRect(0.6, 0, 0.1, 0.45); }
      else { ctx.fillStyle = '#7a5532'; ctx.fillRect(-0.6, 0, 1.2, 0.18); ctx.fillRect(-0.6, 0.2, 1.2, 0.18); ctx.fillStyle = '#5a3d22'; ctx.fillRect(-0.6, 0.18, 1.2, 0.02); }
      break;
    case 'gipfel':
      if (v < 0.55) { tanne(); }
      else if (v < 0.85) { ctx.fillStyle = '#c9c4dd'; blob(0, 0.28, 0.55, 0.3); ctx.fillStyle = '#ffffff'; blob(0.05, 0.4, 0.3, 0.16); }
      else { ctx.strokeStyle = '#6b4a2b'; ctx.lineWidth = 0.08; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 1.5); ctx.stroke(); ctx.fillStyle = '#ff7a1a'; ctx.beginPath(); ctx.moveTo(0.02, 1.5); ctx.lineTo(0.75, 1.3); ctx.lineTo(0.02, 1.1); ctx.fill(); }
      break;
    case 'gletscher':
      if (v < 0.6) { tanne(); }
      else { ctx.fillStyle = '#ffffff'; blob(0, 0.32, 0.35, 0.32); blob(0, 0.85, 0.25, 0.24); ctx.fillStyle = '#ff7a1a'; ctx.beginPath(); ctx.moveTo(0.18, 0.88); ctx.lineTo(0.42, 0.84); ctx.lineTo(0.18, 0.8); ctx.fill(); ctx.fillStyle = '#222'; blob(0.08, 0.93, 0.03, 0.03); }
      break;
    case 'insel':
      if (v < 0.45) { palme(); }
      else if (v < 0.7) { ctx.fillStyle = '#ffffff'; ctx.fillRect(-0.02, 0, 0.04, 1.3); ctx.fillStyle = '#ff5a5a'; ctx.beginPath(); ctx.moveTo(-0.8, 1.3); ctx.quadraticCurveTo(0, 1.8, 0.8, 1.3); ctx.closePath(); ctx.fill(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(-0.27, 1.3); ctx.quadraticCurveTo(0, 1.75, 0.27, 1.3); ctx.closePath(); ctx.fill(); }
      else { ctx.fillStyle = '#f7a0a0'; blob(0, 0.1, 0.18, 0.12); }
      break;
    case 'vulkan':
      if (v < 0.5) { ctx.fillStyle = '#2a1e1f'; ctx.beginPath(); ctx.moveTo(-0.5, 0); ctx.lineTo(-0.1, 1.4); ctx.lineTo(0.15, 0.6); ctx.lineTo(0.3, 0.9); ctx.lineTo(0.5, 0); ctx.fill(); }
      else { ctx.strokeStyle = '#2a1e1f'; ctx.lineWidth = 0.1; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 1.2); ctx.lineTo(-0.35, 1.6); ctx.moveTo(0, 0.9); ctx.lineTo(0.4, 1.3); ctx.stroke();
        ctx.fillStyle = `rgba(255,120,40,${0.5 + 0.3 * Math.sin(t * 3 + d.x)})`; ctx.fillRect(-0.4, -0.02, 0.8, 0.06); }
      break;
  }
  ctx.restore();
}
function blob(x, y, rx, ry) { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill(); }
function rrect(x, y, w, h, r) { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h); ctx.fill(); }
function baum(x, c1, c2) { ctx.fillStyle = '#7a4f2a'; ctx.fillRect(x - 0.1, 0, 0.2, 1.1); ctx.fillStyle = c2; blob(x, 1.45, 0.75, 0.62); ctx.fillStyle = c1; blob(x - 0.15, 1.6, 0.5, 0.42); }
function tanne() { ctx.fillStyle = '#6b4a2b'; ctx.fillRect(-0.08, 0, 0.16, 0.4); ctx.fillStyle = '#2f6b4f'; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(-0.7 + i * 0.15, 0.3 + i * 0.5); ctx.lineTo(0, 1.1 + i * 0.5); ctx.lineTo(0.7 - i * 0.15, 0.3 + i * 0.5); ctx.fill(); } ctx.fillStyle = '#ffffff'; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(-0.25 + i * 0.05, 0.85 + i * 0.5); ctx.lineTo(0, 1.1 + i * 0.5); ctx.lineTo(0.25 - i * 0.05, 0.85 + i * 0.5); ctx.fill(); } }
function palme() { ctx.strokeStyle = '#8a5a30'; ctx.lineWidth = 0.18; ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(0.35, 1.2, 0.15, 2.4); ctx.stroke(); ctx.fillStyle = '#2f9e5b'; for (let i = 0; i < 5; i++) { const a = 0.4 + i * 0.6; ctx.save(); ctx.translate(0.15, 2.4); ctx.rotate(a - 1.6); ctx.beginPath(); ctx.ellipse(0.6, 0, 0.7, 0.16, 0.25, 0, Math.PI * 2); ctx.fill(); ctx.restore(); } }

// ---------- Objekte ----------
function extrudiert(pts, front, oben, rand) {
  // pts: Weltpunkte (Mittelebene). Vorderfläche bei -D/2, Rückseite bei +D/2
  const ox = -D3.x / 2, oy = -D3.y / 2, n = pts.length;
  // Umlaufsinn bestimmen, damit die Außennormale stimmt
  let fl = 0; for (let i = 0; i < n; i++) { const a = pts[i], b = pts[(i + 1) % n]; fl += a[0] * b[1] - b[0] * a[1]; }
  const sgn = fl >= 0 ? 1 : -1;
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    const nx = (b[1] - a[1]) * sgn, ny = -(b[0] - a[0]) * sgn;   // Außennormale
    if (nx * D3.x + ny * D3.y <= 0) continue;                  // nur sichtbare Seiten (oben/rechts)
    ctx.fillStyle = ny > Math.abs(nx) * 0.6 ? oben : shade(front.length === 7 ? front : '#777777', -0.22);
    ctx.beginPath(); ctx.moveTo(a[0] + ox, a[1] + oy); ctx.lineTo(b[0] + ox, b[1] + oy); ctx.lineTo(b[0] - ox, b[1] - oy); ctx.lineTo(a[0] - ox, a[1] - oy); ctx.closePath(); ctx.fill();
  }
  ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0] + ox, p[1] + oy) : ctx.moveTo(p[0] + ox, p[1] + oy))); ctx.closePath();
  ctx.fillStyle = front; ctx.fill();
  if (rand) { ctx.strokeStyle = rand; ctx.lineWidth = 2 / cam.ppm; ctx.stroke(); }
}
function boxPunkte(body, w, h) {
  const p = body.getPosition(), a = body.getAngle(), c = Math.cos(a), s = Math.sin(a);
  return [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]].map(([x, y]) => [p.x + x * c - y * s, p.y + x * s + y * c]);
}
function interp(body) {
  const p = body.getPosition(), a = body.getAngle();
  if (body.__px === undefined) return { x: p.x, y: p.y, a };
  return { x: lerp(body.__px, p.x, alpha), y: lerp(body.__py, p.y, alpha), a: lerp(body.__pa, a, alpha) };
}
function zeichneObjekte(sim, t) {
  const x0 = sichtX0() - 6, x1 = sichtX1() + 6, lw = 1 / cam.ppm;
  const lv = sim.level;
  // Wasser/Lava
  for (const k of sim.killzones) {
    if (k.x1 < x0 || k.x0 > x1) continue;
    const lava = k.kind === 'lava';
    const top = k.y1;
    if (lava) { const lg = ctx.createLinearGradient(0, top, 0, top - 3); lg.addColorStop(0, '#ffb02e'); lg.addColorStop(0.25, '#ff5a1a'); lg.addColorStop(1, '#a1200c'); ctx.fillStyle = lg; }
    else { const wg = ctx.createLinearGradient(0, top, 0, top - 4); wg.addColorStop(0, 'rgba(70,190,240,.92)'); wg.addColorStop(1, 'rgba(18,90,170,.95)'); ctx.fillStyle = wg; }
    ctx.beginPath(); ctx.moveTo(k.x0, k.y0);
    for (let x = k.x0; x <= k.x1 + 0.01; x += 0.5) ctx.lineTo(x, top + Math.sin(x * 1.3 + t * (lava ? 1.5 : 2.5)) * 0.12);
    ctx.lineTo(k.x1, k.y0); ctx.closePath(); ctx.fill();
    ctx.fillStyle = lava ? 'rgba(255,200,60,.8)' : 'rgba(255,255,255,.55)';
    for (let x = Math.ceil(k.x0); x < k.x1; x += 1.7) ctx.fillRect(x + Math.sin(t + x) * 0.3, top - 0.12 + Math.sin(x * 1.3 + t * 2.5) * 0.12, 0.6, 0.07);
  }
  for (let b = sim.world.getBodyList(); b; b = b.getNext()) {
    const u = b.getUserData(); if (!u || !u.o && u.kind !== 'plank') continue;
    const o = u.o;
    const p = b.getPosition();
    if (p.x < x0 || p.x > x1) { if (!(u.kind === 'poly')) continue; }
    switch (u.kind) {
      case 'box': {
        if (o.deco === 'wand') { extrudiert(boxPunkte(b, o.w, o.h), '#6d6a72', '#8b8892', 'rgba(0,0,0,.3)'); break; }
        const c = SURF_COL[o.surface] || SURF_COL[THEMES[lv.theme].surface] || ['#999', '#666'];
        extrudiert(boxPunkte(b, o.w, o.h), shade(c[1], -0.1), c[0], 'rgba(0,0,0,.3)');
        break;
      }
      case 'rock': {
        const c = lv.theme === 'insel' ? ['#b3a58f', '#7d705f'] : lv.theme === 'gletscher' ? ['#a9bdd1', '#6e86a0'] : lv.theme === 'vulkan' ? ['#4b3c3a', '#2c2223'] : ['#a99c90', '#71665c'];
        const r0 = rng(Math.round(p.x * 13 + p.y * 7));
        const pts = []; for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2 + r0() * 0.3, rr = o.r * (0.88 + r0() * 0.2); pts.push([p.x + Math.cos(a) * rr, p.y + Math.sin(a) * rr]); }
        extrudiert(pts, c[1], c[0], 'rgba(0,0,0,.3)');
        ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.beginPath(); ctx.arc(p.x - D3.x / 2 - o.r * 0.3, p.y - D3.y / 2 + o.r * 0.35, o.r * 0.35, 0, 7); ctx.fill();
        break;
      }
      case 'poly': {
        const pts = o.pts;
        if (pts[0][0] > x1 && pts[1][0] > x1 || pts[0][0] < x0 - 10) break;
        extrudiert(pts, o.deco === 'bock' ? '#7a6f66' : '#8c857e', '#a69d94', 'rgba(0,0,0,.3)');
        break;
      }
      case 'crate': {
        const q = interp(b);
        ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(q.a);
        const w = o.w, h = o.h;
        ctx.fillStyle = '#9a6a35'; ctx.fillRect(-w / 2 + D3.x / 2 - D3.x, -h / 2 + D3.y / 2, w, h); // Rückseite angedeutet
        ctx.fillStyle = '#c98f4e'; ctx.fillRect(-w / 2 - D3.x / 2 * 0, -h / 2, w, h);
        ctx.strokeStyle = '#7b4e22'; ctx.lineWidth = w * 0.09; ctx.strokeRect(-w / 2 + w * 0.045, -h / 2 + h * 0.045, w * 0.91, h * 0.91);
        ctx.beginPath(); ctx.moveTo(-w / 2 + w * 0.1, -h / 2 + h * 0.1); ctx.lineTo(w / 2 - w * 0.1, h / 2 - h * 0.1); ctx.stroke();
        ctx.restore();
        break;
      }
      case 'barrel': case 'ball': {
        const q = interp(b);
        ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(q.a);
        if (u.kind === 'ball' && lv.theme === 'gletscher') {
          const sg = ctx.createRadialGradient(-o.r * 0.35, o.r * 0.35, o.r * 0.1, 0, 0, o.r);
          sg.addColorStop(0, '#ffffff'); sg.addColorStop(1, '#c7dcf2');
          ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(0, 0, o.r, 0, 7); ctx.fill();
          ctx.fillStyle = 'rgba(150,180,215,.5)'; for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.arc(Math.cos(i * 2.3) * o.r * 0.55, Math.sin(i * 2.3) * o.r * 0.55, o.r * 0.09, 0, 7); ctx.fill(); }
        } else if (u.kind === 'ball') {
          const cols = ['#ff5a5a', '#ffffff', '#3fa9f5', '#ffd23f'];
          for (let i = 0; i < 4; i++) { ctx.fillStyle = cols[i]; ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, o.r, i * Math.PI / 2, (i + 1) * Math.PI / 2); ctx.fill(); }
        } else {
          const fass = lv.theme === 'insel' || lv.theme === 'wiese' ? ['#a8723c', '#6e4520', '#c98f4e'] : ['#2c6fd6', '#1b4a96', '#5a95ef'];
          ctx.fillStyle = fass[0]; ctx.beginPath(); ctx.arc(0, 0, o.r, 0, 7); ctx.fill();
          ctx.strokeStyle = fass[1]; ctx.lineWidth = o.r * 0.14; ctx.beginPath(); ctx.arc(0, 0, o.r * 0.86, 0, 7); ctx.stroke();
          ctx.beginPath(); ctx.arc(0, 0, o.r * 0.5, 0, 7); ctx.stroke();
          ctx.fillStyle = fass[1]; ctx.beginPath(); ctx.arc(o.r * 0.45, o.r * 0.2, o.r * 0.12, 0, 7); ctx.fill();
          ctx.strokeStyle = fass[2]; ctx.lineWidth = o.r * 0.08; ctx.beginPath(); ctx.arc(0, 0, o.r * 0.7, 2.2, 3.2); ctx.stroke();
        }
        ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 2 * lw; ctx.beginPath(); ctx.arc(0, 0, o.r, 0, 7); ctx.stroke();
        ctx.restore();
        break;
      }
      case 'plank': {
        const q = interp(b);
        const c = SURF_COL[o.surface || 'holz'];
        const pts = eckPunkte(q, u.w, u.h);
        extrudiert(pts, c[1], c[0], 'rgba(0,0,0,.35)');
        break;
      }
      case 'seesaw': case 'swing': case 'mover': case 'fall': case 'rotor': {
        const q = interp(b);
        const c = SURF_COL[o.surface || (u.kind === 'mover' || u.kind === 'rotor' ? 'metall' : 'holz')];
        if (u.kind === 'rotor') {
          for (let i = 0; i < (o.arms || 1); i++) extrudiert(eckPunkte({ x: q.x, y: q.y, a: q.a + i * Math.PI / (o.arms || 1) }, o.w, o.h), c[1], c[0], 'rgba(0,0,0,.35)');
          ctx.fillStyle = '#3a3f4b'; ctx.beginPath(); ctx.arc(q.x, q.y, 0.3, 0, 7); ctx.fill();
          break;
        }
        let shake = 0;
        if (u.kind === 'fall') { const f = sim.fallers.find((x) => x.b === b); if (f && f.t > 0) shake = Math.sin(t * 60) * 0.04; }
        if (u.kind === 'swing') { // Seile
          ctx.strokeStyle = '#5a4128'; ctx.lineWidth = 0.06;
          for (const sx of [-o.w / 2 + 0.2, o.w / 2 - 0.2]) {
            const c2 = Math.cos(q.a), s2 = Math.sin(q.a);
            ctx.beginPath(); ctx.moveTo(o.x + sx, o.top); ctx.lineTo(q.x + sx * c2, q.y + sx * s2); ctx.stroke();
          }
          ctx.fillStyle = '#4a4f5c'; ctx.fillRect(o.x - o.w / 2 - 0.3, o.top - 0.1, o.w + 0.6, 0.25);
          // Kranhaken: Seile laufen nach oben zum (unsichtbaren) Kran
          ctx.strokeStyle = '#3a3e4a'; ctx.lineWidth = 0.07;
          ctx.beginPath(); ctx.moveTo(o.x - o.w / 2, o.top + 0.15); ctx.lineTo(o.x, o.top + 1.6); ctx.lineTo(o.x + o.w / 2, o.top + 0.15); ctx.moveTo(o.x, o.top + 1.6); ctx.lineTo(o.x, o.top + 40); ctx.stroke();
          ctx.fillStyle = '#FF9200'; ctx.beginPath(); ctx.arc(o.x, o.top + 1.75, 0.22, 0, 7); ctx.fill();
        }
        extrudiert(eckPunkte({ x: q.x + shake, y: q.y, a: q.a }, o.w, o.h || 0.35), c[1], c[0], 'rgba(0,0,0,.35)');
        if (u.kind === 'mover') { // Warnstreifen
          ctx.save(); ctx.translate(q.x - D3.x / 2, q.y - D3.y / 2); ctx.rotate(q.a);
          ctx.beginPath(); ctx.rect(-o.w / 2, -o.h / 2, o.w, o.h * 0.5); ctx.clip();
          ctx.fillStyle = '#1c1d22'; ctx.fillRect(-o.w / 2, -o.h / 2, o.w, o.h);
          ctx.fillStyle = '#ffc61a';
          for (let x = -o.w / 2 - 1; x < o.w / 2; x += 0.6) { ctx.beginPath(); ctx.moveTo(x, -o.h / 2); ctx.lineTo(x + 0.3, -o.h / 2); ctx.lineTo(x + 0.6, 0); ctx.lineTo(x + 0.3, 0); ctx.fill(); }
          ctx.restore();
        }
        if (u.kind === 'fall') { // Risse
          ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 0.04;
          ctx.beginPath(); ctx.moveTo(q.x - 0.4 - D3.x / 2 + shake, q.y - 0.25 - D3.y / 2); ctx.lineTo(q.x - 0.1 - D3.x / 2 + shake, q.y - D3.y / 2); ctx.lineTo(q.x + 0.3 - D3.x / 2 + shake, q.y + 0.1 - D3.y / 2); ctx.stroke();
        }
        break;
      }
    }
  }
  // Brücken-Geländer: Seil über die Plankenenden
  for (const o of lv.objects) {
    if (o.type !== 'bridge' || o.x1 < x0 || o.x0 > x1) continue;
    const planks = [];
    for (let b = sim.world.getBodyList(); b; b = b.getNext()) { const u = b.getUserData(); if (u && u.kind === 'plank' && u.o === o) planks.push(b); }
    planks.sort((a, b) => a.getPosition().x - b.getPosition().x);
    ctx.strokeStyle = '#6b4a2a'; ctx.lineWidth = 0.06;
    ctx.beginPath(); ctx.moveTo(o.x0 + D3.x / 2, o.y0 + 0.9 + D3.y / 2);
    for (const b of planks) { const q = interp(b); ctx.lineTo(q.x + D3.x / 2, q.y + 0.9 + D3.y / 2); }
    ctx.lineTo(o.x1 + D3.x / 2, o.y1 + 0.9 + D3.y / 2); ctx.stroke();
    for (const [x, y] of [[o.x0, o.y0], [o.x1, o.y1]]) { ctx.fillStyle = '#6b4a2a'; ctx.fillRect(x - 0.1 + D3.x / 2, y + D3.y / 2 - 0.3, 0.2, 1.4); }
  }
}
function eckPunkte(q, w, h) {
  const c = Math.cos(q.a), s = Math.sin(q.a);
  return [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]].map(([x, y]) => [q.x + x * c - y * s, q.y + x * s + y * c]);
}

// ---------- Start, Ziel, Umsteigen ----------
function zeichneMarken(sim, t) {
  const lv = sim.level, gx = lv.finish;
  if (gx > sichtX0() - 6 && gx < sichtX1() + 6) {
    const gy = bodenHoehe(sim, gx);
    // Zielbogen: zwei Pfosten, Banner mit Karomuster
    ctx.fillStyle = '#e9ecf2';
    ctx.fillRect(gx - 0.12 + D3.x / 2, gy + D3.y / 2, 0.24, 5.2);
    ctx.fillRect(gx - 0.12 - D3.x / 2, gy - D3.y / 2, 0.24, 5.2);
    const bx = gx - D3.x / 2 - 0.15, by = gy + 4.2;
    for (let i = 0; i < 2; i++) for (let j = 0; j < 4; j++) {
      ctx.fillStyle = (i + j) % 2 ? '#11121A' : '#ffffff';
      ctx.fillRect(bx + j * 0.0 + (i * 0.0), by + j * 0.25, 0.3 + D3.x, 0.25);
    }
    // Fahne
    ctx.fillStyle = '#11121A'; ctx.fillRect(gx - 0.05, gy + 5.2, 0.08, 1.4);
    const wave = Math.sin(t * 5) * 0.12;
    for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) {
      ctx.fillStyle = (i + j) % 2 ? '#11121A' : '#ffffff';
      ctx.fillRect(gx + 0.03 + i * 0.35, gy + 6.25 - j * 0.3 + wave * i * 0.5, 0.35, 0.3);
    }
    // Linie am Boden
    for (let k = 0; k < 6; k++) { ctx.fillStyle = k % 2 ? '#11121A' : '#ffffff'; ctx.beginPath(); const a = -0.5 + k / 6, b2 = a + 1 / 6; ctx.moveTo(gx - 0.2 + D3.x * a, gy + D3.y * a); ctx.lineTo(gx + 0.2 + D3.x * a, gy + D3.y * a); ctx.lineTo(gx + 0.2 + D3.x * b2, gy + D3.y * b2); ctx.lineTo(gx - 0.2 + D3.x * b2, gy + D3.y * b2); ctx.fill(); }
  }
  for (const s of lv.swaps || []) {
    if (s.x < sichtX0() - 6 || s.x > sichtX1() + 6) continue;
    const gy = bodenHoehe(sim, s.x);
    ctx.fillStyle = '#FF9200';
    ctx.fillRect(s.x - 1.6 - D3.x / 2, gy - D3.y / 2, 0.3, 4.6); ctx.fillRect(s.x + 1.3 - D3.x / 2, gy - D3.y / 2, 0.3, 4.6);
    ctx.fillStyle = 'rgba(255,146,0,.18)'; ctx.fillRect(s.x - 1.3 - D3.x / 2, gy - D3.y / 2, 2.6, 4.3);
    ctx.fillStyle = '#11121A'; ctx.fillRect(s.x - 1.6 - D3.x / 2, gy + 4.3 - D3.y / 2, 3.2, 0.9);
    ctx.save(); ctx.translate(s.x - D3.x / 2, gy + 4.75 - D3.y / 2); const sc = 0.28; ctx.scale(sc, sc);
    zeichneFahrzeugStatisch(ctx, s.vehicle, stand.settings.paint, { ohneSchatten: true, mini: true });
    ctx.restore();
  }
}
function bodenHoehe(sim, x) {
  let best = -1e9;
  for (const g of sim.level.ground) {
    const p = g.pts;
    if (x < p[0][0] || x > p[p.length - 1][0]) continue;
    for (let i = 0; i < p.length - 1; i++) if (x >= p[i][0] && x <= p[i + 1][0]) { const tt = (x - p[i][0]) / (p[i + 1][0] - p[i][0] || 1); best = Math.max(best, lerp(p[i][1], p[i + 1][1], tt)); break; }
  }
  return best > -1e8 ? best : 0;
}

// ---------- Fahrzeuge ----------
// Karosserie je Fahrzeug in lokalen Koordinaten (Meter, y nach oben)
function arcPath(c, cx, cy, r, a0, a1) { c.arc(cx, cy, r, a0, a1, false); }
function radbogen(c, cx, cy, r, ybot) {
  const s = clamp((ybot - cy) / r, -0.99, 0.99), th = Math.asin(s), hw = Math.cos(th) * r;
  return { th, hw, rechts: cx + hw, links: cx - hw, zeichne: () => arcPath(c, cx, cy, r, th, Math.PI - th) };
}
const SKIN = {
  kraxler(c, f) {
    // Unterbau mit Radläufen
    c.beginPath();
    c.moveTo(-1.42, 0.46); c.lineTo(1.0, 0.46); c.lineTo(1.46, 0.24); c.lineTo(1.48, -0.04);
    const v = radbogen(c, 0.92, -0.36, 0.56, -0.14), h = radbogen(c, -0.9, -0.36, 0.56, -0.14);
    c.lineTo(Math.min(1.46, v.rechts), -0.14); v.zeichne(); c.lineTo(h.rechts, -0.14); h.zeichne(); c.lineTo(-1.42, -0.14); c.closePath();
    lack(c, f, -0.14, 0.46); kontur(c);
    // Zierstreifen, Tür, Licht
    c.fillStyle = f.accent; c.fillRect(-1.38, 0.2, 2.75, 0.07);
    c.strokeStyle = f.dunkel; c.lineWidth = 0.035; c.beginPath(); c.moveTo(-0.15, 0.44); c.lineTo(-0.15, -0.1); c.stroke();
    c.fillStyle = '#ffe9a8'; c.beginPath(); c.arc(1.4, 0.3, 0.07, 0, 7); c.fill();
    c.fillStyle = '#2b2e38'; c.beginPath(); c.arc(-1.5, 0.22, 0.24, 0, 7); c.fill(); c.fillStyle = '#5a5f6c'; c.beginPath(); c.arc(-1.5, 0.22, 0.1, 0, 7); c.fill();
    fahrer(c, -0.42, 1.13, 0.25, f, 0.25);
    // Überrollbügel und Frontscheibe
    c.strokeStyle = '#2b2e38'; c.lineWidth = 0.08; c.lineCap = 'round';
    c.beginPath(); c.moveTo(-0.92, 0.46); c.lineTo(-0.86, 1.38); c.lineTo(-0.62, 1.42); c.stroke();
    c.beginPath(); c.moveTo(0.32, 0.46); c.lineTo(0.08, 0.9); c.stroke();
    c.fillStyle = 'rgba(170,220,255,.55)'; c.beginPath(); c.moveTo(0.3, 0.48); c.lineTo(0.09, 0.86); c.lineTo(0.16, 0.86); c.lineTo(0.38, 0.48); c.fill();
  },
  strandfloh(c, f) {
    // Rohrrahmen hinten
    c.strokeStyle = '#2b2e38'; c.lineWidth = 0.08; c.lineCap = 'round'; c.lineJoin = 'round';
    c.beginPath(); c.moveTo(-1.1, 0.34); c.lineTo(-0.98, 1.26); c.lineTo(-0.12, 1.22); c.lineTo(0.48, 0.38); c.stroke();
    c.beginPath(); c.moveTo(-0.98, 1.26); c.lineTo(-1.3, 0.4); c.stroke();
    // Motor
    c.fillStyle = '#4a4f5c'; c.fillRect(-1.38, 0.3, 0.42, 0.34); c.fillStyle = '#8c93a3'; c.fillRect(-1.52, 0.42, 0.18, 0.08);
    c.beginPath();
    c.moveTo(-1.32, 0.34); c.lineTo(0.55, 0.38); c.lineTo(1.38, 0.14); c.lineTo(1.44, -0.02);
    const v = radbogen(c, 1.0, -0.32, 0.47, -0.06);
    c.lineTo(v.rechts, -0.06); v.zeichne();
    c.lineTo(-0.42, -0.06); c.arc(-0.95, -0.3, 0.6, 0.41, 2.26, false); c.lineTo(-1.32, 0.34); c.closePath();
    lack(c, f, -0.08, 0.38); kontur(c);
    c.fillStyle = f.accent; c.beginPath(); c.moveTo(-0.6, 0.12); c.lineTo(1.1, 0.12); c.lineTo(1.25, 0.2); c.lineTo(-0.6, 0.2); c.fill();
    c.fillStyle = '#ffe9a8'; c.beginPath(); c.arc(1.36, 0.1, 0.06, 0, 7); c.fill();
    fahrer(c, -0.48, 0.98, 0.24, f, 0.2);
  },
  pritsche(c, f) {
    c.beginPath();
    c.moveTo(-1.82, 0.52); c.lineTo(-0.3, 0.52); c.lineTo(-0.28, 1.42); c.lineTo(0.42, 1.46); c.lineTo(0.98, 0.62); c.lineTo(1.72, 0.48); c.lineTo(1.82, 0.08); c.lineTo(1.78, -0.12);
    const v = radbogen(c, 1.15, -0.38, 0.58, -0.12), h = radbogen(c, -1.18, -0.38, 0.58, -0.12);
    c.lineTo(v.rechts, -0.12); v.zeichne(); c.lineTo(h.rechts, -0.12); h.zeichne(); c.lineTo(-1.82, -0.12); c.closePath();
    lack(c, f, -0.12, 1.46); kontur(c);
    // Ladefläche, Fenster
    c.fillStyle = f.dunkel; c.fillRect(-1.72, 0.4, 1.36, 0.08);
    c.fillStyle = 'rgba(30,40,60,.85)'; c.beginPath(); c.moveTo(-0.18, 0.92); c.lineTo(0.35, 0.92); c.lineTo(0.35, 1.36); c.lineTo(-0.18, 1.34); c.fill();
    fahrer(c, 0.18, 1.2, 0.22, f, 0.15);
    c.fillStyle = 'rgba(170,220,255,.45)'; c.beginPath(); c.moveTo(-0.18, 0.92); c.lineTo(0.35, 0.92); c.lineTo(0.35, 1.36); c.lineTo(-0.18, 1.34); c.fill();
    c.fillStyle = 'rgba(170,220,255,.7)'; c.beginPath(); c.moveTo(0.48, 0.92); c.lineTo(0.78, 0.92); c.lineTo(0.48, 1.36); c.fill();
    c.fillStyle = f.accent; c.fillRect(-1.75, 0.14, 3.5, 0.08);
    c.fillStyle = '#ffe9a8'; c.fillRect(1.7, 0.22, 0.1, 0.14);
    c.fillStyle = '#c9cfd8'; c.fillRect(1.6, -0.12, 0.26, 0.12);
    // Kiste auf der Ladefläche
    c.fillStyle = '#c98f4e'; c.fillRect(-1.45, 0.52, 0.5, 0.36); c.strokeStyle = '#7b4e22'; c.lineWidth = 0.04; c.strokeRect(-1.45, 0.52, 0.5, 0.36);
  },
  wummser(c, f) {
    // Rahmen
    c.fillStyle = '#2b2e38'; c.fillRect(-1.2, -0.48, 2.4, 0.2);
    c.strokeStyle = '#2b2e38'; c.lineWidth = 0.12; c.beginPath(); c.moveTo(-1.05, -0.38); c.lineTo(-0.5, 0.3); c.moveTo(1.05, -0.38); c.lineTo(0.5, 0.3); c.stroke();
    c.beginPath();
    c.moveTo(-1.6, 0.92); c.lineTo(-0.85, 0.92); c.lineTo(-0.8, 1.78); c.lineTo(0.15, 1.78); c.lineTo(0.55, 0.98); c.lineTo(1.12, 0.94); c.lineTo(1.58, 0.64); c.lineTo(1.6, 0.43);
    c.arc(1.05, -0.38, 0.98, 0.975, 2.483, false); c.lineTo(-0.275, 0.22); c.arc(-1.05, -0.38, 0.98, 0.659, 2.167, false); c.lineTo(-1.6, 0.92); c.closePath();
    lack(c, f, 0.22, 1.78); kontur(c);
    // Flammen
    c.fillStyle = f.accent;
    c.beginPath(); c.moveTo(1.5, 0.55); c.lineTo(0.6, 0.7); c.lineTo(0.85, 0.6); c.lineTo(0.2, 0.62); c.lineTo(0.55, 0.5); c.lineTo(-0.1, 0.45); c.lineTo(0.6, 0.38); c.lineTo(1.52, 0.44); c.fill();
    c.fillStyle = 'rgba(30,40,60,.85)'; c.beginPath(); c.moveTo(-0.7, 1.05); c.lineTo(0.05, 1.05); c.lineTo(0.05, 1.68); c.lineTo(-0.7, 1.68); c.fill();
    fahrer(c, -0.32, 1.5, 0.22, f, 0.15);
    c.fillStyle = 'rgba(170,220,255,.45)'; c.beginPath(); c.moveTo(-0.7, 1.05); c.lineTo(0.05, 1.05); c.lineTo(0.05, 1.68); c.lineTo(-0.7, 1.68); c.fill();
    c.fillStyle = 'rgba(170,220,255,.7)'; c.beginPath(); c.moveTo(0.2, 1.05); c.lineTo(0.45, 1.05); c.lineTo(0.2, 1.62); c.fill();
    c.fillStyle = '#c9cfd8'; c.fillRect(1.45, 0.5, 0.25, 0.12); c.fillStyle = '#ffe9a8'; c.beginPath(); c.arc(1.5, 0.78, 0.07, 0, 7); c.fill();
    // Lampen auf dem Dach
    for (let i = 0; i < 3; i++) { c.fillStyle = '#ffe9a8'; c.beginPath(); c.arc(-0.6 + i * 0.3, 1.86, 0.07, 0, 7); c.fill(); }
  },
  brummi(c, f) {
    // Fahrgestell
    c.fillStyle = '#2b2e38'; c.fillRect(-2.45, -0.18, 4.85, 0.36);
    // Koffer
    c.beginPath(); c.moveTo(-2.48, 0.3); c.lineTo(0.9, 0.3); c.lineTo(0.9, 1.32); c.lineTo(-2.48, 1.32); c.closePath();
    c.fillStyle = '#eef1f6'; c.fill(); kontur(c);
    c.strokeStyle = 'rgba(0,0,0,.12)'; c.lineWidth = 0.03; for (let x = -2.3; x < 0.85; x += 0.3) { c.beginPath(); c.moveTo(x, 0.34); c.lineTo(x, 1.28); c.stroke(); }
    c.fillStyle = f.base; c.fillRect(-2.48, 0.62, 3.38, 0.32);
    c.fillStyle = f.accent; c.fillRect(-2.48, 0.62, 3.38, 0.06);
    // Kabine
    c.beginPath(); c.moveTo(1.0, 0.18); c.lineTo(1.0, 2.04); c.lineTo(1.95, 2.06); c.lineTo(2.32, 1.55); c.lineTo(2.4, 0.18); c.closePath();
    lack(c, f, 0.18, 2.06); kontur(c);
    c.fillStyle = 'rgba(30,40,60,.85)'; c.beginPath(); c.moveTo(1.2, 1.3); c.lineTo(1.95, 1.3); c.lineTo(2.2, 1.55); c.lineTo(1.9, 1.92); c.lineTo(1.2, 1.92); c.fill();
    fahrer(c, 1.55, 1.7, 0.22, f, 0.15);
    c.fillStyle = 'rgba(170,220,255,.45)'; c.beginPath(); c.moveTo(1.2, 1.3); c.lineTo(1.95, 1.3); c.lineTo(2.2, 1.55); c.lineTo(1.9, 1.92); c.lineTo(1.2, 1.92); c.fill();
    c.fillStyle = '#c9cfd8'; c.fillRect(2.3, 0.18, 0.18, 0.5); c.fillStyle = '#ffe9a8'; c.fillRect(2.32, 0.78, 0.1, 0.18);
    c.fillStyle = '#5a5f6c'; c.fillRect(0.92, 1.0, 0.1, 1.3);
    c.strokeStyle = f.dunkel; c.lineWidth = 0.04; c.beginPath(); c.moveTo(1.15, 0.25); c.lineTo(1.15, 1.2); c.lineTo(2.0, 1.2); c.stroke();
  }
};
function lack(c, f, y0, y1) {
  const g = c.createLinearGradient(0, y1, 0, y0);
  g.addColorStop(0, f.hell); g.addColorStop(0.35, f.base); g.addColorStop(1, f.dunkel);
  c.fillStyle = g; c.fill();
}
function kontur(c) { c.strokeStyle = 'rgba(17,18,26,.85)'; c.lineWidth = 0.06; c.lineJoin = 'round'; c.stroke(); }
function fahrer(c, x, y, r, f, rumpf) {
  c.fillStyle = '#2b3242'; c.beginPath(); c.ellipse(x - 0.02, y - r - rumpf * 1.1, r * 0.9, rumpf * 1.6 + 0.1, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#ffffff'; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
  c.fillStyle = f.accent === '#ffffff' ? f.base : f.accent; c.beginPath(); c.arc(x, y, r, Math.PI * 0.55, Math.PI * 0.95); c.lineTo(x, y); c.fill();
  c.fillStyle = '#1d2433'; c.beginPath(); c.ellipse(x + r * 0.42, y + r * 0.02, r * 0.5, r * 0.36, 0, -1.3, 1.3); c.fill();
  c.fillStyle = 'rgba(255,255,255,.5)'; c.beginPath(); c.ellipse(x + r * 0.55, y + r * 0.15, r * 0.18, r * 0.08, 0.3, 0, 7); c.fill();
  c.strokeStyle = 'rgba(17,18,26,.85)'; c.lineWidth = 0.04; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.stroke();
}
function rad(c, x, y, a, r, stil) {
  c.save(); c.translate(x, y); c.rotate(a);
  c.fillStyle = '#23262f'; c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); c.fill();
  const n = r > 0.7 ? 14 : 10;
  c.fillStyle = '#3a3e4a';
  for (let i = 0; i < n; i++) { c.save(); c.rotate((i * Math.PI * 2) / n); c.fillRect(r * 0.82, -r * 0.09, r * 0.2, r * 0.18); c.restore(); }
  c.fillStyle = '#23262f'; c.beginPath(); c.arc(0, 0, r * 0.84, 0, 7); c.fill();
  c.fillStyle = stil.felge; c.beginPath(); c.arc(0, 0, r * 0.55, 0, 7); c.fill();
  c.fillStyle = shade(stil.felge, -0.3);
  for (let i = 0; i < 5; i++) { c.save(); c.rotate((i * Math.PI * 2) / 5); c.beginPath(); c.arc(r * 0.3, 0, r * 0.09, 0, 7); c.fill(); c.restore(); }
  c.fillStyle = '#5a5f6c'; c.beginPath(); c.arc(0, 0, r * 0.14, 0, 7); c.fill();
  c.strokeStyle = 'rgba(0,0,0,.5)'; c.lineWidth = 0.04; c.beginPath(); c.arc(0, 0, r, 0, 7); c.stroke();
  c.restore();
}
const FELGE = { kraxler: '#d9dde6', strandfloh: '#ffb020', pritsche: '#cfd5df', wummser: '#e2412b', brummi: '#c0c6d0' };

function zeichneAuto(sim, car, opts = {}) {
  const ch = car.chassis, q = interp(ch);
  const d = car.d, f = farben(car.id, opts.paint || stand.settings.paint);
  const ca = Math.cos(q.a), sa = Math.sin(q.a);
  if (opts.geist) { ctx.save(); ctx.globalAlpha = 0.33; }
  // Schatten
  if (!opts.geist) {
    let gy = null;
    sim.world.rayCast({ x: q.x, y: q.y }, { x: q.x, y: q.y - 12 }, (fix, pt, nrm, fr) => {
      const u = fix.getBody().getUserData(); if (fix.isSensor() || (u && (u.kind === 'wheel' || u.kind === 'chassis'))) return -1;
      gy = pt.y; return fr;
    });
    if (gy !== null) {
      const hgt = q.y - gy, al = clamp(0.32 - hgt * 0.035, 0, 0.32);
      if (al > 0.01) { ctx.fillStyle = `rgba(0,0,0,${al})`; ctx.beginPath(); ctx.ellipse(q.x, gy + 0.02, 1.4 + hgt * 0.08, 0.16, 0, 0, Math.PI * 2); ctx.fill(); }
    }
  }
  // Federbeine
  if (!car.detached) {
    ctx.strokeStyle = '#3a3e4a'; ctx.lineWidth = 0.1; ctx.lineCap = 'round';
    for (const w of car.wheels) {
      const wq = interp(w.body);
      const ax = q.x + w.x * ca - (w.y + 0.25) * sa, ay = q.y + w.x * sa + (w.y + 0.25) * ca;
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(wq.x, wq.y); ctx.stroke();
      // Feder als Zickzack
      ctx.strokeStyle = '#d4a017'; ctx.lineWidth = 0.035; ctx.beginPath();
      const dx = wq.x - ax, dy = wq.y - ay, nx = -dy, ny = dx, l = Math.hypot(dx, dy) || 1;
      for (let i = 0; i <= 8; i++) { const tt = 0.1 + i * 0.1, o = (i % 2 ? 1 : -1) * 0.07; ctx.lineTo(ax + dx * tt + (nx / l) * o, ay + dy * tt + (ny / l) * o); }
      ctx.stroke(); ctx.strokeStyle = '#3a3e4a'; ctx.lineWidth = 0.1;
    }
  }
  // Karosserie
  ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(q.a);
  SKIN[car.id](ctx, f);
  ctx.restore();
  for (const w of car.wheels) { const wq = interp(w.body); rad(ctx, wq.x, wq.y, wq.a, w.r, { felge: FELGE[car.id] }); }
  if (opts.geist) ctx.restore();
}
// Fahrzeug ohne Physik (Garage, Teilen-Bild, Umsteige-Tor)
function zeichneFahrzeugStatisch(c, id, paint, opts = {}) {
  const d = VEHICLES[id], f = farben(id, paint);
  if (!opts.ohneSchatten) { c.fillStyle = 'rgba(0,0,0,.25)'; c.beginPath(); c.ellipse(0, Math.min(...d.wheels.map((w) => w[1] - w[2])) + 0.1, 2, 0.18, 0, 0, 7); c.fill(); }
  c.strokeStyle = '#3a3e4a'; c.lineWidth = 0.1;
  for (const w of d.wheels) { c.beginPath(); c.moveTo(w[0], w[1] + 0.3); c.lineTo(w[0], w[1] + 0.1); c.stroke(); }
  SKIN[id](c, f);
  for (const w of d.wheels) rad(c, w[0], w[1] + 0.1, 0.3, w[2], { felge: FELGE[id] });
}

// ---------- Partikel ----------
const teile = [];
function partikel(x, y, vx, vy, leben, gr, farbe, art) {
  if (teile.length > 420) teile.shift();
  teile.push({ x, y, vx, vy, l: leben, m: leben, g: gr, f: farbe, a: art || 0, r: Math.random() * 6 });
}
function staub(x, y, n, farbe, kraft) {
  for (let i = 0; i < n; i++) partikel(x + (Math.random() - 0.5) * 0.4, y + 0.08, -kraft * (0.4 + Math.random() * 0.8), 0.4 + Math.random() * 1.2, 0.35 + Math.random() * 0.35, 0.08 + Math.random() * 0.12, farbe, 0);
}
function zeichnePartikel(dt) {
  for (let i = teile.length - 1; i >= 0; i--) {
    const p = teile[i];
    p.l -= dt; if (p.l <= 0) { teile.splice(i, 1); continue; }
    p.vy -= (p.a === 2 ? 6 : p.a === 1 ? 12 : 2) * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.r += dt * 6;
    if (p.a === 0) { p.vx *= 1 - dt * 2; p.g += dt * 0.35; }
    const k = p.l / p.m;
    ctx.globalAlpha = p.a === 0 ? k * 0.45 : Math.min(1, k * 2);
    ctx.fillStyle = p.f;
    if (p.a === 2) { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillRect(-p.g / 2, -p.g / 4, p.g, p.g / 2); ctx.restore(); }
    else if (p.a === 3) { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); sternPfad(p.g); ctx.fill(); ctx.restore(); }
    else { ctx.beginPath(); ctx.arc(p.x, p.y, p.g, 0, 7); ctx.fill(); }
  }
  ctx.globalAlpha = 1;
}
function sternPfad(r) { ctx.beginPath(); for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } ctx.closePath(); }
const STAUB = { gras: '#8a6a3f', erde: '#b98a5a', strand: '#f3dca8', sand: '#e9c47a', feder: '#cfe9d8', schlamm: '#5a3e24', schnee: '#ffffff', eis: '#e6f6ff', asphalt: '#9aa0aa', stein: '#a39b92', holz: '#b38654', metall: '#ffd27a', boost: '#FF9200', trampolin: '#ff9ccc', lava: '#ff7a2a' };

// ====================================================================== Spielzustand
let zustand = 'start';           // start | menu | play | crash | finish | result | pause
let sim = null, level = null, geist = null;
let aufnahme = [], letzteEingabe = 0, versuchGestartet = false;
let frameDt = 1 / 60, alpha = 0, akku = 0, zeitGesamt = 0;
let crashZeit = 0, zielZeit = 0, ergebnis = null;
let demo = null;
let herausforderung = null;      // { level, ms, von }
let fehlversuchZaehlen = true;

const tasten = { gas: false, bremse: false };
const zeiger = new Map();        // pointerId → -1 | 1
function eingabe() {
  let g = tasten.gas, b = tasten.bremse;
  for (const v of zeiger.values()) { if (v > 0) g = true; else b = true; }
  return g && !b ? 1 : b && !g ? -1 : 0;
}

function starteLevel(id, opts = {}) {
  level = LEVEL_BY_ID[id];
  if (!level) return;
  beendeVersuch('neustart');
  stand.last = id; speichern();
  sim = createSim(level);
  szene = szene && szene.level === level ? szene : baueSzene(level);
  // Geist der persönlichen Bestzeit
  geist = null;
  const ld = stand.levels[id];
  if (stand.settings.ghost && ld && ld.inputs && ld.sv === SIM_VERSION) {
    try { geist = { sim: createSim(level), changes: decodeInputs(ld.inputs), i: 0, input: 0 }; } catch (e) { geist = null; }
  }
  aufnahme = []; letzteEingabe = 0; versuchGestartet = false; akku = 0;
  $('#toasts').textContent = '';
  teile.length = 0; cam.shake = 0;
  kameraZiel(sim, true);
  zustand = 'play';
  zeigeNur(null);
  $('#hud').hidden = false; $('#zeit').hidden = false; $('#fort').hidden = false;
  $('#hLevel').textContent = id; $('#hName').textContent = level.name;
  $('#hGold').textContent = level.gold ? 'Gold ' + fmt(level.gold * 1000) : '';
  $('#hGold').hidden = !level.gold;
  $('#hGold').classList.toggle('gold', !!(ld && ld.gold));
  $('#fGeist').hidden = !geist;
  $('#crash').hidden = true; $('#zielText').hidden = true;
  const neu = !ld || !ld.tries;
  $('#hilfe').hidden = !(id <= 2 && neu || stand.stats.tries < 2);
  const tipp = $('#tipp');
  if (level.tip && (neu || opts.tipp)) { tipp.textContent = level.tip; tipp.hidden = false; } else tipp.hidden = true;
  zeigeBanner();
  pedaleZeigen(true);
  aktualisiereHud();
}
function zeigeBanner() {
  const b = $('#banner');
  if (herausforderung && level && herausforderung.level === level.id) {
    const t = $('#bannerText');
    t.textContent = '';
    const s1 = document.createElement('div');
    s1.textContent = (herausforderung.von ? herausforderung.von + ' fordert dich heraus: ' : 'Herausforderung: ') + fmt(herausforderung.ms) + ' s';
    const s2 = document.createElement('small'); s2.textContent = 'Zeit vom Gerät des Absenders, nicht verifiziert';
    t.append(s1, s2); b.hidden = false;
  } else b.hidden = true;
}

// Versuch beenden (für Statistik): grund = 'crash' | 'neustart' | 'ziel' | 'verlassen'
function beendeVersuch(grund) {
  if (!sim || !versuchGestartet) return;
  versuchGestartet = false;
  const st = stand.stats, s = sim.stats;
  st.dist += s.dist; st.airTicks += s.airTicks;
  for (const v of s.vehicles) if (!st.vehicles.includes(v)) st.vehicles.push(v);
  const ld = levelDaten(level.id);
  ld.tries++; st.tries++;
  if (grund !== 'ziel' && fehlversuchZaehlen) { if (!ld.done) ld.fails++; }
  if (grund === 'crash') { st.crashes++; st.streak = 0; }
  speichern();
}

function neustart() {
  if (!level) return;
  if (zustand === 'play' && versuchGestartet) beendeVersuch('neustart');
  starteLevel(level.id);
}

// ---------- Takt ----------
function schritt() {
  const inp = eingabe();
  if (inp !== letzteEingabe && (sim.started || inp !== 0)) { aufnahme.push([sim.tick, inp]); letzteEingabe = inp; }
  const warGestartet = sim.started;
  // vorherige Lage für die Interpolation
  for (let b = sim.world.getBodyList(); b; b = b.getNext()) { if (b.isStatic()) continue; const p = b.getPosition(); b.__px = p.x; b.__py = p.y; b.__pa = b.getAngle(); }
  sim.step(inp);
  if (!warGestartet && sim.started) {
    versuchGestartet = true;
    $('#hilfe').hidden = true; $('#tipp').hidden = true;
    ton.resume();
  }
  if (geist && sim.started) {
    const g = geist;
    for (let b = g.sim.world.getBodyList(); b; b = b.getNext()) { if (b.isStatic()) continue; const p = b.getPosition(); b.__px = p.x; b.__py = p.y; b.__pa = b.getAngle(); }
    while (g.i < g.changes.length && g.changes[g.i][0] <= g.sim.tick) { g.input = g.changes[g.i][1]; g.i++; }
    if (!g.sim.finished && !g.sim.crashed) g.sim.step(g.input); else if (g.sim.finished) g.sim.step(0);
  }
  for (const e of sim.events) ereignis(e);
}
function ereignis(e) {
  const ch = sim.car.chassis, p = ch.getPosition();
  switch (e.t) {
    case 'land':
      if (!e.small) { ton.land(e.v); cam.shake = Math.max(cam.shake, clamp(e.v / 30, 0, 0.35)); }
      for (const w of sim.car.wheels) if (w.touch) { const wp = w.body.getPosition(); staub(wp.x, wp.y - w.r, e.small ? 3 : 8, STAUB[(w.surf && Object.keys(SURFACES).find((k) => SURFACES[k] === w.surf)) || 'erde'] || '#aaa', 1.5); }
      break;
    case 'jump':
      if (e.flips >= 1) { stand.stats.flips = Math.max(stand.stats.flips, e.flips); toast(e.flips >= 2 ? 'Doppelsalto!' : 'Salto!'); }
      else if (e.air >= 50) toast('Sauber gelandet!');
      break;
    case 'crash': {
      ton.crash(); cam.shake = 0.8;
      const farbe = farben(sim.car.id, stand.settings.paint).base;
      for (let i = 0; i < 16; i++) partikel(p.x, p.y + 0.4, (Math.random() - 0.5) * 9, Math.random() * 7 + 2, 1 + Math.random(), 0.12 + Math.random() * 0.2, i % 3 ? farbe : '#2b2e38', 2);
      for (let i = 0; i < 6; i++) partikel(p.x, p.y + 1.2, (Math.random() - 0.5) * 3, Math.random() * 3 + 1, 1.2, 0.22, '#FFD21C', 3);
      wennCrash(e.reason);
      break;
    }
    case 'finish': ton.ziel(); wennZiel(); break;
    case 'boost': ton.boost(); for (const w of sim.car.wheels) if (w.touch) { const wp = w.body.getPosition(); partikel(wp.x - 0.3, wp.y - w.r * 0.5, -6, 1, 0.4, 0.15, '#FF9200', 0); } break;
    case 'swap': ton.wechsel(); toast('Umgestiegen: ' + VEHICLES[e.vehicle].name); for (let i = 0; i < 20; i++) partikel(p.x, p.y, (Math.random() - 0.5) * 6, Math.random() * 5, 0.8, 0.15, '#FF9200', 2); break;
    case 'fall': ton.bruch(); break;
    case 'bounce': ton.klang(300, 0.15, 'sine', 0.2, 0, 700); break;
  }
}

const GRUND = { kopf: 'Kopfüber gelandet', absturz: 'Abgestürzt', dach: 'Auf dem Dach gelandet', seite: 'Umgekippt', wasser: 'Baden gegangen', lava: 'Zu heiß!', eingeklemmt: 'Eingeklemmt' };
function wennCrash(grund) {
  zustand = 'crash'; crashZeit = zeitGesamt;
  $('#crashTitel').textContent = ['Crash!', 'Autsch!', 'Hoppla!', 'Bumm!'][Math.floor(Math.random() * 4)];
  $('#crashGrund').textContent = GRUND[grund] || 'Unfall';
  $('#crashHilfe').textContent = document.body.classList.contains('touch') ? 'Tippen: sofort nochmal' : 'R oder Gas: sofort nochmal';
  $('#crash').hidden = false;
  beendeVersuch('crash');
  const neu = evaluateAwards(stand, N, null);
  if (neu.length) { speichern(); awardWarteschlange.push(...neu); }
}
function wennZiel() {
  zustand = 'finish'; zielZeit = zeitGesamt;
  $('#zielText').hidden = false;
  const p = sim.car.chassis.getPosition();
  for (let i = 0; i < 70; i++) partikel(p.x + (Math.random() - 0.3) * 4, p.y + 3 + Math.random() * 3, (Math.random() - 0.5) * 10, Math.random() * 8 + 2, 2 + Math.random(), 0.12 + Math.random() * 0.12, ['#FF9200', '#FFD21C', '#ffffff', '#5cc8e6', '#ff5aa5', '#58c779'][i % 6], 2);
  // Ergebnis festhalten
  const ld = levelDaten(level.id);
  const ms = sim.finishMs;
  const ersterSieg = !ld.done;
  const alteBest = ld.best;
  const neueBest = !alteBest || ms < alteBest;
  const gold = level.gold ? ms <= level.gold * 1000 : false;
  const fails = ld.fails;
  beendeVersuch('ziel');
  ld.done = true; ld.wins++;
  if (gold) ld.gold = true;
  const inputs = encodeInputs(aufnahme);
  if (neueBest) { ld.best = ms; ld.inputs = inputs; ld.sv = SIM_VERSION; ld.ver = false; }
  const st = stand.stats;
  st.finishes++;
  st.streak = (st.streak || 0) + 1;
  let geschlagen = false;
  if (herausforderung && herausforderung.level === level.id && ms < herausforderung.ms) { st.challengesWon++; geschlagen = true; }
  const run = { level: level.id, ms, finished: true, stats: sim.stats, firstWin: ersterSieg, fails };
  const neu = evaluateAwards(stand, N, run);
  speichern();
  awardWarteschlange.push(...neu);
  ergebnis = { level: level.id, ms, alteBest, neueBest, gold, ersterSieg, neu, run, geschlagen, inputs, status: 'lokal' };
  // Online melden (nur mit PlaySaal-Konto; sonst bleibt alles lokal)
  if (neueBest) online.meldeLauf({ v: SIM_VERSION, level: level.id, ms, inputs, vehicle: level.vehicle }).then((r) => {
    if (!ergebnis || ergebnis.level !== level.id || ergebnis.ms !== ms) return;
    ergebnis.status = r.status; ergebnis.online = r;
    if (r.status === 'verifiziert') { ld.ver = true; speichern(); }
    if (zustand === 'result') zeigeStatus();
  }).catch(() => {});
}

// ---------- Hauptschleife ----------
let letzteZeit = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dtMs = letzteZeit ? Math.min(100, now - letzteZeit) : 16.7;
  letzteZeit = now;
  frameDt = dtMs / 1000; zeitGesamt += frameDt;
  if (zustand === 'play' || zustand === 'crash' || zustand === 'finish') {
    akku += frameDt;
    let n = 0;
    while (akku >= DT && n < 5) { schritt(); akku -= DT; n++; }
    if (n === 5) akku = 0;
    alpha = clamp(akku / DT, 0, 1);
    if (zustand === 'crash' && zeitGesamt - crashZeit > 1.5) nachCrash();
    if (zustand === 'finish' && zeitGesamt - zielZeit > 1.25) zeigeErgebnis();
  } else if ((zustand === 'menu' || zustand === 'start') && demo) {
    demoTakt();
  } else alpha = 1;
  if (sim) {
    kameraZiel(sim, false);
    cam.shake = Math.max(0, cam.shake - frameDt * 2.2);
    zeichne();
    if (zustand === 'play' || zustand === 'crash' || zustand === 'finish') aktualisiereHud();
    motorTon();
  }
}
function zeichne() {
  zeichneHimmel(szene, zeitGesamt);
  weltTransform();
  zeichneBoden(szene, zeitGesamt);
  zeichneObjekte(sim, zeitGesamt);
  zeichneMarken(sim, zeitGesamt);
  if (geist && geist.sim.started && !geist.sim.crashed) zeichneAuto(geist.sim, geist.sim.car, { geist: true });
  zeichneAuto(sim, sim.car);
  // Staub während der Fahrt
  if (zustand === 'play' && sim.started) {
    for (const w of sim.car.wheels) {
      if (!w.touch) continue;
      const v = w.body.getLinearVelocity(), sp = Math.abs(v.x), slip = Math.abs(w.body.getAngularVelocity() * w.r + v.x);
      if ((sp > 5 || slip > 4) && Math.random() < 0.22) {
        const key = w.surf ? Object.keys(SURFACES).find((k) => SURFACES[k] === w.surf) : 'erde';
        const wp = w.body.getPosition(); staub(wp.x, wp.y - w.r, 1, STAUB[key] || '#aaa', clamp(sp / 6, 0.5, 2.5));
      }
    }
  }
  zeichnePartikel(frameDt);
}
function motorTon() {
  if (!ton.ctx) return;
  const aktiv = (zustand === 'play' && sim.started) || zustand === 'finish';
  let rpm = 0;
  if (sim && !sim.car.detached) { const w = sim.car.wheels.find((x) => x.drive) || sim.car.wheels[0]; rpm = clamp(Math.abs(w.body.getAngularVelocity()) / sim.car.d.speed, 0, 1.2); }
  ton.engine(rpm, zustand === 'play' && eingabe() > 0 ? 1 : 0, aktiv && stand.settings.sound);
}
let hudZeit = '';
function aktualisiereHud() {
  const t = fmt(sim.started ? sim.timeMs() : 0);
  if (t !== hudZeit) { $('#hZeit').textContent = t; hudZeit = t; }
  const pr = sim.progress();
  $('#fBar').style.width = (pr * 100).toFixed(1) + '%';
  $('#fAuto').style.left = (pr * 100).toFixed(1) + '%';
  if (geist) $('#fGeist').style.left = (geist.sim.progress() * 100).toFixed(1) + '%';
}
function fmt(ms) {
  if (ms == null) return '–';
  const s = Math.floor(ms / 1000), cs = Math.floor((ms % 1000) / 10);
  if (s >= 60) return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0') + ',' + String(cs).padStart(2, '0');
  return s + ',' + String(cs).padStart(2, '0');
}
function fmtDiff(ms) { const v = Math.abs(ms); return (ms < 0 ? '−' : '+') + fmt(v); }

function nachCrash() {
  $('#crash').hidden = true;
  if (awardWarteschlange.length) { zustand = 'result'; zeigeNaechstenAward(() => starteLevel(level.id)); return; }
  starteLevel(level.id);
}

// ---------- Demo im Menü ----------
// Hintergrund-Demo im Menü: Lösung des Bots für Level 8 (läuft mit derselben Physik ab)
const DEMO = { level: 8, inputs: '0g.6un.7cg.7in.7og.e0b.ecn.eig' };
function starteDemo() {
  const lv = LEVEL_BY_ID[DEMO.level];
  level = lv; sim = createSim(lv); szene = baueSzene(lv); geist = null;
  demo = { changes: DEMO.inputs ? decodeInputs(DEMO.inputs) : [[0, 1]], i: 0, input: 0, ende: 0 };
  teile.length = 0; akku = 0;
  kameraZiel(sim, true);
}
function demoTakt() {
  akku += frameDt; let n = 0;
  while (akku >= DT && n < 4) {
    for (let b = sim.world.getBodyList(); b; b = b.getNext()) { if (b.isStatic()) continue; const p = b.getPosition(); b.__px = p.x; b.__py = p.y; b.__pa = b.getAngle(); }
    const d = demo;
    while (d.i < d.changes.length && d.changes[d.i][0] <= sim.tick) { d.input = d.changes[d.i][1]; d.i++; }
    sim.step(d.input || (sim.started ? 0 : 1));
    akku -= DT; n++;
    if ((sim.finished || sim.crashed) && !d.ende) d.ende = zeitGesamt;
  }
  if (n === 4) akku = 0;
  alpha = clamp(akku / DT, 0, 1);
  if (demo.ende && zeitGesamt - demo.ende > 2.5) starteDemo();
}

// ====================================================================== Bildschirme
const SCREENS = ['#sMenu', '#sLevels', '#sAwards', '#sGarage', '#sZeiten', '#oPause', '#oErgebnis', '#oAward'];
function zeigeNur(sel) {
  for (const s of SCREENS) $(s).hidden = s !== sel;
  // Klicksperre: Panels blenden ein, ein früher Klick soll keinen frisch erscheinenden Button treffen
  if (sel) { const el = $(sel); el.classList.add('sperre'); setTimeout(() => el.classList.remove('sperre'), 450); }
  const spiel = sel === null;
  pedaleZeigen(spiel && zustand === 'play');
}
function pedaleZeigen(an) {
  const touch = document.body.classList.contains('touch');
  $('#pedale').hidden = !(an && touch);
  $('#zonen').hidden = !(an && touch);
}

function zumMenu() {
  if (zustand === 'play' || zustand === 'pause') beendeVersuch('verlassen');
  zustand = 'menu';
  $('#hud').hidden = true; $('#zeit').hidden = true; $('#fort').hidden = true; $('#banner').hidden = true; $('#tipp').hidden = true; $('#hilfe').hidden = true; $('#crash').hidden = true; $('#zielText').hidden = true;
  zeigeNur('#sMenu');
  baueMenu();
  starteDemo();
  if (herausforderung && herausforderung.award) zeigeAwardBanner();
}
function baueMenu() {
  const n = naechstesOffenes();
  const geschafft = LEVELS.filter((l) => stand.levels[l.id] && stand.levels[l.id].done).length;
  $('#mSpielenText').textContent = geschafft ? (geschafft >= N ? 'Spielen' : 'Weiter: Level ' + n) : 'Spielen';
  $('#mLevelZahl').textContent = geschafft + ' / ' + N;
  $('#mAwardsZahl').textContent = Object.keys(stand.awards).length + ' / ' + AWARDS.length;
  tonKnopf();
}
function tonKnopf() {
  const an = stand.settings.sound;
  $('#mTon').innerHTML = an
    ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>'
    : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16 9l5 6M21 9l-5 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  $('#mTon').setAttribute('aria-label', an ? 'Ton aus' : 'Ton an');
  $('#pTon').textContent = an ? 'Ton aus' : 'Ton an';
}
function tonUmschalten() { stand.settings.sound = !stand.settings.sound; speichern(); ton.resume(); ton.setOn(stand.settings.sound); tonKnopf(); }

function zeigeLevels() {
  zeigeNur('#sLevels');
  const liste = $('#lListe'); liste.textContent = '';
  const geschafft = LEVELS.filter((l) => stand.levels[l.id] && stand.levels[l.id].done).length;
  const golds = LEVELS.filter((l) => stand.levels[l.id] && stand.levels[l.id].gold).length;
  $('#lZahl').textContent = geschafft + '/' + N + ' · ' + golds + ' Gold';
  const gruppen = {};
  for (const l of LEVELS) (gruppen[l.theme] = gruppen[l.theme] || []).push(l);
  for (const th of Object.keys(gruppen)) {
    const sec = document.createElement('section'); sec.className = 'gruppe';
    const h = document.createElement('h3'); h.textContent = THEMES[th].name + ' · Level ' + gruppen[th][0].id + '–' + gruppen[th][gruppen[th].length - 1].id;
    const grid = document.createElement('div'); grid.className = 'lgrid';
    for (const l of gruppen[th]) {
      const ld = stand.levels[l.id], frei = freigeschaltet(l.id);
      const b = document.createElement('button');
      b.className = 'ltile' + (ld && ld.done ? ' geschafft' : frei ? ' offen' : ' zu');
      b.disabled = !frei;
      b.setAttribute('aria-label', 'Level ' + l.id + ' ' + l.name + (ld && ld.done ? ', geschafft, Bestzeit ' + fmt(ld.best) + ' Sekunden' : frei ? ', offen' : ', gesperrt'));
      b.innerHTML = '<b>' + l.id + '</b>';
      const sm = document.createElement('small');
      if (ld && ld.best) sm.textContent = fmt(ld.best); else if (!frei) sm.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2" fill="currentColor"/><path d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" stroke-width="2.2"/></svg>'; else sm.textContent = 'neu';
      b.title = l.name;
      b.appendChild(sm);
      if (ld && ld.done) { const ok = document.createElement('i'); ok.className = 'ok'; b.appendChild(ok); }
      if (ld && ld.gold) { const m = document.createElement('i'); m.className = 'med'; b.appendChild(m); }
      b.addEventListener('click', () => { ton.resume(); ton.klick(); starteLevel(l.id, { tipp: true }); });
      grid.appendChild(b);
    }
    sec.append(h, grid); liste.appendChild(sec);
  }
}

function zeigeAwards() {
  zeigeNur('#sAwards');
  const liste = $('#aListe'); liste.textContent = '';
  const p = progressOf(stand, N);
  $('#aZahl').textContent = Object.keys(stand.awards).length + ' / ' + AWARDS.length;
  const sortiert = [...AWARDS].sort((a, b) => (!!stand.awards[b.id] - !!stand.awards[a.id]));
  for (const a of sortiert) {
    const da = stand.awards[a.id];
    const k = document.createElement('button'); k.type = 'button'; k.className = 'akarte' + (da ? ' da' : '');
    const cv = document.createElement('canvas'); cv.width = 128; cv.height = 128;
    drawAwardIcon(cv.getContext('2d'), a, 64, 64, 120, !da);
    const t = document.createElement('div');
    const r = RARITY[a.rarity];
    t.innerHTML = '<b></b><span class="r"></span><p></p>';
    t.querySelector('b').textContent = a.name;
    const rs = t.querySelector('.r'); rs.textContent = r.name; rs.style.color = r.color;
    t.querySelector('p').textContent = a.desc;
    if (da) { const tm = document.createElement('time'); tm.dateTime = da.at; tm.textContent = 'Freigeschaltet am ' + new Date(da.at).toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' }); t.appendChild(tm); }
    else if (a.prog) { const [ist, soll] = a.prog(p); const bar = document.createElement('div'); bar.className = 'bar'; bar.innerHTML = '<i></i>'; bar.firstChild.style.width = clamp(ist / soll * 100, 0, 100) + '%'; bar.title = ist + ' / ' + soll; const z = document.createElement('small'); z.textContent = Math.min(ist, soll).toLocaleString('de-DE') + ' / ' + soll.toLocaleString('de-DE'); t.append(bar, z); }
    k.append(cv, t);
    if (da) k.addEventListener('click', () => { awardPopup({ award: a, alt: true }, () => zeigeAwards()); });
    else k.disabled = true;
    liste.appendChild(k);
  }
}

const WERTE = { kraxler: [0.6, 0.7, 0.75, 0.6], strandfloh: [0.85, 0.5, 1, 0.35], pritsche: [0.9, 0.6, 0.65, 0.7], wummser: [0.7, 0.85, 0.6, 0.45], brummi: [0.5, 1, 0.25, 1] };
function ersteLevelMit(id) { for (const l of LEVELS) if (l.vehicle === id || (l.swaps || []).some((s) => s.vehicle === id)) return l.id; return 1; }
function zeigeGarage() {
  zeigeNur('#sGarage');
  const liste = $('#gListe'); liste.textContent = '';
  for (const id of VEHICLE_ORDER) {
    const d = VEHICLES[id], ab = ersteLevelMit(id), frei = freigeschaltet(ab);
    const k = document.createElement('div'); k.className = 'fkarte' + (frei ? '' : ' zu');
    const cv = document.createElement('canvas'); cv.width = 560; cv.height = 240;
    const c = cv.getContext('2d');
    const sk = id === 'brummi' ? 82 : id === 'wummser' ? 78 : 96;
    c.setTransform(sk, 0, 0, -sk, 280, id === 'wummser' ? 190 : 165); zeichneFahrzeugStatisch(c, id, stand.settings.paint);
    if (!frei) { c.setTransform(1, 0, 0, 1, 0, 0); c.globalCompositeOperation = 'source-atop'; c.fillStyle = '#0b0c12'; c.fillRect(0, 0, 560, 240); c.globalCompositeOperation = 'source-over'; }
    k.appendChild(cv);
    const b = document.createElement('b'); b.textContent = frei ? d.name : '???';
    const art = document.createElement('div'); art.className = 'art'; art.textContent = d.art;
    k.append(b, art);
    if (frei) {
      const p = document.createElement('p'); p.textContent = d.text; k.appendChild(p);
      const w = document.createElement('div'); w.className = 'werte';
      const zeile = (name, v) => { const s = document.createElement('span'); s.textContent = name; const i = document.createElement('i'); i.style.setProperty('--w', Math.round(clamp(v, 0.08, 1) * 100) + '%'); w.append(s, i); };
      const w4 = WERTE[id];
      zeile('Tempo', w4[0]); zeile('Kraft', w4[1]); zeile('Luftkontrolle', w4[2]); zeile('Standfestigkeit', w4[3]);
      k.appendChild(w);
    } else { const s = document.createElement('div'); s.className = 'schloss'; s.textContent = 'Wartet in Level ' + ab; k.appendChild(s); }
    liste.appendChild(k);
  }
  const lacke = $('#gLacke'); lacke.textContent = '';
  for (const p of PAINTS) {
    const frei = paintFrei(p);
    const b = document.createElement('button'); b.className = 'swatch'; b.disabled = !frei;
    b.setAttribute('aria-pressed', String(stand.settings.paint === p.id));
    const f = farben('kraxler', p.id);
    b.innerHTML = '<span></span>';
    b.firstChild.style.background = p.id === 'karo' ? 'conic-gradient(#fff 0 25%,#11121A 0 50%,#fff 0 75%,#11121A 0) 0 0/20px 20px' : `linear-gradient(135deg,${f.hell},${f.base} 50%,${f.accent} 50% 62%,${f.dunkel} 62%)`;
    b.title = p.name + (frei ? '' : ' – freischalten mit „' + AWARD_BY_ID[p.award].name + '“');
    b.setAttribute('aria-label', b.title);
    b.addEventListener('click', () => { stand.settings.paint = p.id; speichern(); ton.klick(); zeigeGarage(); });
    lacke.appendChild(b);
  }
  const nf = $('#gName'); nf.value = stand.settings.name;
}

// Bestzeiten, die noch nicht vom Server bestätigt sind (z. B. ohne Anmeldung oder offline gefahren), nachreichen.
let nachreichenLaeuft = false;
async function nachreichen() {
  if (nachreichenLaeuft) return;
  nachreichenLaeuft = true;
  try {
    let geaendert = false;
    for (const l of LEVELS) {
      const ld = stand.levels[l.id];
      if (!ld || !ld.best || ld.ver || !ld.inputs || ld.sv !== SIM_VERSION) continue;
      const r = await online.meldeLauf({ v: SIM_VERSION, level: l.id, ms: ld.best, inputs: ld.inputs, vehicle: l.vehicle });
      if (r.status === 'gast' || r.status === 'lokal' || r.status === 'fehler') break;
      if (r.status === 'verifiziert') { ld.ver = true; geaendert = true; }
    }
    if (geaendert) { speichern(); if (!$('#sZeiten').hidden) zeigeZeiten(); }
  } catch (e) {} finally { nachreichenLaeuft = false; }
}

function zeigeZeiten() {
  zeigeNur('#sZeiten');
  nachreichen();
  const tb = $('#zListe'); tb.textContent = '';
  for (const l of LEVELS) {
    const ld = stand.levels[l.id];
    const tr = document.createElement('tr');
    const td = (txt, cls) => { const c = document.createElement('td'); if (cls) c.className = cls; c.textContent = txt; tr.appendChild(c); return c; };
    td(l.id + ' · ' + (freigeschaltet(l.id) ? l.name : '???'));
    const z = td(ld && ld.best ? fmt(ld.best) : '–', 'z');
    if (ld && ld.gold) { const m = document.createElement('span'); m.className = 'med'; m.title = 'Goldzeit geschafft'; z.appendChild(m); }
    td(l.gold ? fmt(l.gold * 1000) : '–');
    const st = td('', ''); const sp = document.createElement('span');
    if (ld && ld.best) { sp.className = ld.ver ? 'ver' : 'lok'; sp.textContent = ld.ver ? '✓ verifiziert' : 'auf diesem Gerät'; }
    st.appendChild(sp);
    tb.appendChild(tr);
  }
  const box = $('#zOnline'); box.textContent = '';
  if (!online.verfuegbar()) {
    box.innerHTML = '<div class="info"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 11v6M12 7.5v.5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg><div>Deine Zeiten liegen auf diesem Gerät. Globale Monats- und Jahresranglisten kommen mit den PlaySaal-Konten; dort zählen nur Zeiten, die der Server nachgefahren hat.</div></div>';
  } else online.zeigeRangliste(box, LEVELS);
}

// ---------- Pause ----------
function pause() {
  if (zustand !== 'play') return;
  zustand = 'pause'; tasten.gas = tasten.bremse = false; zeiger.clear();
  zeigeNur('#oPause');
  setTimeout(() => $('#pWeiter').focus(), 30);
}
function weiter() { if (zustand !== 'pause') return; zustand = 'play'; zeigeNur(null); letzteZeit = 0; }

// ---------- Ergebnis ----------
function zeigeErgebnis() {
  if (zustand !== 'finish') return;
  zustand = 'result';
  $('#zielText').hidden = true;
  const e = ergebnis, l = LEVEL_BY_ID[e.level];
  $('#hErgebnis').textContent = e.neueBest && e.alteBest ? 'Neue Bestzeit!' : e.ersterSieg ? 'Geschafft!' : 'Im Ziel!';
  $('#eLevel').textContent = 'Level ' + l.id + ' · ' + l.name;
  $('#eZeit').textContent = fmt(e.ms) + ' s';
  const vgl = $('#eVgl');
  if (!e.alteBest) { vgl.textContent = 'Erste Bestzeit gesetzt'; vgl.className = 'vgl neu'; }
  else if (e.neueBest) { vgl.textContent = 'Bestzeit verbessert: ' + fmtDiff(e.ms - e.alteBest) + ' s'; vgl.className = 'vgl neu'; }
  else { vgl.textContent = 'Bestzeit ' + fmt(e.alteBest) + ' s (' + fmtDiff(e.ms - e.alteBest) + ')'; vgl.className = 'vgl alt'; }
  const gz = $('#eGold'); gz.hidden = !l.gold;
  gz.className = 'goldzeile' + (e.gold ? ' erreicht' : '');
  gz.innerHTML = '<i class="med' + (e.gold ? '' : ' leer') + '"></i><span></span>';
  gz.querySelector('span').textContent = l.gold ? (e.gold ? 'Goldzeit geschafft! (' + fmt(l.gold * 1000) + ' s)' : 'Goldzeit: ' + fmt(l.gold * 1000) + ' s') : '';
  const s = e.run.stats, ms = [];
  if (s.jumps) ms.push(s.jumps + (s.jumps === 1 ? ' sauberer Sprung' : ' saubere Sprünge'));
  if (s.flips) ms.push(s.flips === 1 ? 'Salto' : s.flips + 'fach-Salto');
  ms.push((s.airTicks / HZ).toFixed(1).replace('.', ',') + ' s Luft');
  if (e.geschlagen) ms.unshift('Herausforderung geschlagen!');
  $('#eStats').textContent = ms.join(' · ');
  const ar = $('#eAwards'); ar.textContent = '';
  for (const a of e.neu) {
    const b = document.createElement('button'); b.type = 'button';
    const cv = document.createElement('canvas'); cv.width = 64; cv.height = 64; drawAwardIcon(cv.getContext('2d'), a, 32, 32, 60, false);
    b.append(cv, document.createTextNode(a.name));
    b.addEventListener('click', () => awardPopup({ award: a, alt: true }, () => { zeigeNur('#oErgebnis'); }));
    ar.appendChild(b);
  }
  const naechstes = LEVEL_BY_ID[e.level + 1];
  $('#eWeiter').hidden = !naechstes;
  zeigeStatus();
  const danach = () => { zeigeNur('#oErgebnis'); setTimeout(() => (naechstes ? $('#eWeiter') : $('#eNochmal')).focus(), 30); };
  if (awardWarteschlange.length) zeigeNaechstenAward(danach); else danach();
}
function zeigeStatus() {
  const e = ergebnis, el = $('#eStatus');
  if (!e) return;
  const t = { lokal: 'Zeit auf diesem Gerät gespeichert', gast: 'Mit PlaySaal-Konto kommt deine Zeit in die Rangliste', verifiziert: '✓ Vom Server nachgefahren und verifiziert', abgelehnt: 'Server konnte die Zeit nicht bestätigen – sie bleibt lokal', fehler: 'Keine Verbindung – Zeit bleibt lokal gespeichert', wartet: 'Zeit wird geprüft …' }[e.status] || '';
  el.textContent = e.neueBest ? t : (e.status === 'lokal' ? '' : t);
  el.className = 'status' + (e.status === 'verifiziert' ? ' ok' : '');
  if (e.online && e.online.platz) el.textContent += ' · Platz ' + e.online.platz + ' im ' + new Date().toLocaleDateString('de-DE', { month: 'long' });
}

// ---------- Awards: Popup & Teilen ----------
const awardWarteschlange = [];
let popupZurueck = null, popupInfo = null;
function zeigeNaechstenAward(fertig) {
  const a = awardWarteschlange.shift();
  if (!a) { fertig(); return; }
  awardPopup({ award: a }, () => zeigeNaechstenAward(fertig));
}
function awardPopup(info, zurueck) {
  popupZurueck = zurueck; popupInfo = info;
  zeigeNur('#oAward');
  const cv = $('#awIcon'), c = cv.getContext('2d');
  c.clearRect(0, 0, 400, 400);
  const st = $('#awStatus'); st.textContent = '';
  if (info.award) {
    const a = info.award, r = RARITY[a.rarity];
    drawAwardIcon(c, a, 200, 200, 380, false);
    $('#awArt').textContent = (a.metal && ['bronze', 'silber', 'gold'].includes(a.id) ? a.name + '-Award' : 'Award') + ' · ' + r.name;
    $('#awArt').style.color = r.color;
    $('#hAward').textContent = a.name;
    $('#awZitat').textContent = a.share;
    $('#awFrage').textContent = 'Kannst du mich schlagen?';
    if (!info.alt) { ton.award(); }
  } else {
    // Zeit-Herausforderung
    const l = LEVEL_BY_ID[info.level];
    c.save(); c.translate(200, 210); c.rotate(-0.12); c.scale(70, -70); zeichneFahrzeugStatisch(c, l.vehicle, stand.settings.paint); c.restore();
    $('#awArt').textContent = 'Herausforderung'; $('#awArt').style.color = '#FF9200';
    $('#hAward').textContent = 'Level ' + l.id + ' in ' + fmt(info.ms) + ' s';
    $('#awZitat').textContent = 'Ich habe Level ' + l.id + ' („' + l.name + '“) in ' + fmt(info.ms) + ' Sekunden geschafft!';
    $('#awFrage').textContent = 'Kannst du mich schlagen?';
  }
  setTimeout(() => $('#awTeilen').focus(), 40);
}
function teilenLink(info) {
  const base = (document.querySelector('link[rel=canonical]') || location).href.split('?')[0];
  const u = new URL(base);
  if (info.award) u.searchParams.set('award', info.award.id);
  else { u.searchParams.set('level', info.level); u.searchParams.set('zeit', String(info.ms)); }
  if (stand.settings.name) u.searchParams.set('von', stand.settings.name);
  return u.toString();
}
function teilenText(info) {
  if (info.award) return info.award.share + ' Kannst du mich schlagen? SCHRÄGLAGE auf PlaySaal:';
  const l = LEVEL_BY_ID[info.level];
  return 'Level ' + l.id + ' in ' + fmt(info.ms) + ' s – kannst du mich schlagen? SCHRÄGLAGE auf PlaySaal:';
}
let logoBild = null;
function logo() {
  if (!logoBild) { logoBild = new Image(); logoBild.src = '../brand/playsaal-logo-horizontal-dark.svg'; }
  return logoBild;
}
async function teilenBild(info) {
  const lg = logo();
  if (!lg.complete) await new Promise((r) => { lg.onload = lg.onerror = r; setTimeout(r, 1500); });
  try {
    await Promise.all(['400 54px "Dela Gothic One"', '700 40px "Barlow"', '600 42px "Barlow"', '500 34px "Barlow"', '700 190px "Barlow Condensed"'].map((f) => document.fonts.load(f)));
  } catch (e) { /* Schriften optional */ }
  const cv = document.createElement('canvas');
  const name = stand.settings.name || (await online.spielername().catch(() => '')) || '';
  const vehicle = info.award ? (LEVEL_BY_ID[(stand.awards[info.award.id] || {}).level] || {}).vehicle || 'kraxler' : LEVEL_BY_ID[info.level].vehicle;
  const auto = (c, s) => { c.scale(s, -s); zeichneFahrzeugStatisch(c, vehicle, stand.settings.paint, { ohneSchatten: true }); };
  if (info.award) {
    const a = info.award, da = stand.awards[a.id];
    drawShareImage(cv, { award: a, kicker: (a.metal && ['bronze', 'silber', 'gold'].includes(a.id) ? a.name.toUpperCase() + ' AWARD' : 'AWARD') + ' · ' + RARITY[a.rarity].name.toUpperCase(),
      titel: a.name, zeile: '„' + a.share + '“', name, logo: lg, auto, url: urlKurz(),
      hinweis: da ? 'Freigeschaltet am ' + new Date(da.at).toLocaleDateString('de-DE') : '' });
  } else {
    const l = LEVEL_BY_ID[info.level], ld = stand.levels[l.id] || {};
    const ver = !!ld.ver && ld.best === info.ms;
    drawShareImage(cv, { zeitGross: fmt(info.ms) + ' s', unterZeit: 'Level ' + l.id + ' · ' + l.name, kicker: 'HERAUSFORDERUNG', titel: 'Kannst du das schlagen?',
      zeile: ld.gold ? 'Goldzeit geschafft!' : 'Mit ' + VEHICLES[l.vehicle].name + ' ins Ziel', name, logo: lg, auto, url: urlKurz(),
      hinweis: ver ? '✓ Zeit vom PlaySaal-Server verifiziert' : 'Zeit auf meinem Gerät gemessen (nicht verifiziert)', einladung: 'Fahr gegen mich – ohne Anmeldung!' });
  }
  return new Promise((ok) => cv.toBlob((b) => ok(b), 'image/png'));
}
function urlKurz() { const c = (document.querySelector('link[rel=canonical]') || location).href.split('?')[0]; return c.replace(/^https?:\/\//, ''); }
function geteilt() {
  stand.stats.shared = (stand.stats.shared || 0) + 1;
  const neu = evaluateAwards(stand, N, null); speichern();
  if (neu.length) { awardWarteschlange.push(...neu); toast('Award: ' + neu.map((a) => a.name).join(', ')); }
}
async function aktionTeilen() {
  const info = popupInfo, st = $('#awStatus');
  const url = teilenLink(info), text = teilenText(info);
  st.textContent = 'Bild wird erstellt …';
  let blob = null;
  try { blob = await teilenBild(info); } catch (e) { blob = null; }
  const datei = blob ? new File([blob], 'schraeglage-' + (info.award ? info.award.id : 'level-' + info.level) + '.png', { type: 'image/png' }) : null;
  try {
    if (navigator.share) {
      const mitBild = datei && navigator.canShare && navigator.canShare({ files: [datei] });
      await navigator.share(mitBild ? { files: [datei], title: 'SCHRÄGLAGE', text: text + ' ' + url } : { title: 'SCHRÄGLAGE', text, url });
      st.textContent = 'Geteilt!'; geteilt(); return;
    }
  } catch (e) { if (e && e.name === 'AbortError') { st.textContent = ''; return; } }
  // Desktop: Link kopieren und Bild herunterladen
  const kopiert = await kopieren(text + ' ' + url);
  if (blob) herunterladen(blob, datei.name);
  st.textContent = (kopiert ? 'Link kopiert' : 'Link: ' + url) + (blob ? ' · Bild gespeichert' : '');
  geteilt();
}
async function aktionBild() {
  const st = $('#awStatus'); st.textContent = 'Bild wird erstellt …';
  const blob = await teilenBild(popupInfo).catch(() => null);
  if (!blob) { st.textContent = 'Bild konnte nicht erstellt werden.'; return; }
  herunterladen(blob, 'schraeglage-' + (popupInfo.award ? popupInfo.award.id : 'level-' + popupInfo.level) + '.png');
  st.textContent = 'Bild gespeichert.';
}
async function aktionLink() {
  const info = popupInfo, url = teilenLink(info);
  const ok = await kopieren(teilenText(info) + ' ' + url);
  $('#awStatus').textContent = ok ? 'Link kopiert – ab damit in den Gruppenchat!' : url;
  if (ok) geteilt();
}
async function kopieren(t) {
  try { await navigator.clipboard.writeText(t); return true; } catch (e) { /* Fallback */ }
  try {
    const ta = document.createElement('textarea'); ta.value = t; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select(); const ok = document.execCommand('copy'); ta.remove(); return ok;
  } catch (e) { return false; }
}
function herunterladen(blob, name) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
}
function popupSchliessen() { const z = popupZurueck; popupZurueck = null; if (z) z(); }

function zeigeAwardBanner() {
  const a = AWARD_BY_ID[herausforderung.award]; if (!a) return;
  toast((herausforderung.von || 'Jemand') + ' hat „' + a.name + '“ geholt. Schaffst du das auch?', 6000);
}

// ---------- Toast ----------
function toast(t, ms = 2400) {
  const el = document.createElement('div'); el.textContent = t;
  $('#toasts').appendChild(el); setTimeout(() => el.remove(), ms);
}

// ====================================================================== Eingabe
function istTaste(e, codes, keys) { return codes.includes(e.code) || keys.includes(e.key); }
addEventListener('keydown', (e) => {
  if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
  ton.resume();
  const gas = istTaste(e, ['ArrowRight', 'KeyD'], ['ArrowRight', 'd', 'D']), br = istTaste(e, ['ArrowLeft', 'KeyA'], ['ArrowLeft', 'a', 'A']);
  if (gas || br) {
    e.preventDefault();
    if (zustand === 'crash' && gas && !e.repeat) { nachCrash(); }
    if (gas) tasten.gas = true; if (br) tasten.bremse = true;
    return;
  }
  if (e.code === 'KeyR' || e.key === 'r' || e.key === 'R') {
    if (zustand === 'play' || zustand === 'crash' || zustand === 'pause' || zustand === 'finish') { e.preventDefault(); if (zustand === 'crash') { nachCrash(); } else { neustart(); } }
    else if (zustand === 'result' && !$('#oErgebnis').hidden) { e.preventDefault(); starteLevel(level.id); }
    return;
  }
  if (e.key === 'Escape') {
    if (zustand === 'play') { e.preventDefault(); pause(); }
    else if (zustand === 'pause') { e.preventDefault(); weiter(); }
    else if (!$('#oAward').hidden) { e.preventDefault(); popupSchliessen(); }
    else if (['#sLevels', '#sAwards', '#sGarage', '#sZeiten'].some((s) => !$(s).hidden)) { e.preventDefault(); zumMenu(); }
    return;
  }
  if (e.key === 'Enter' && zustand === 'result' && !$('#oErgebnis').hidden && document.activeElement === document.body) { e.preventDefault(); $('#eWeiter').hidden ? starteLevel(level.id) : $('#eWeiter').click(); }
});
addEventListener('keyup', (e) => {
  if (istTaste(e, ['ArrowRight', 'KeyD'], ['ArrowRight', 'd', 'D'])) tasten.gas = false;
  if (istTaste(e, ['ArrowLeft', 'KeyA'], ['ArrowLeft', 'a', 'A'])) tasten.bremse = false;
});
function touchModus() { if (!document.body.classList.contains('touch')) { document.body.classList.add('touch'); pedaleZeigen(zustand === 'play' && $('#oPause').hidden); } }
if (matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window && navigator.maxTouchPoints > 0) document.body.classList.add('touch');
addEventListener('touchstart', touchModus, { passive: true, once: true });
function zeigerAn(el, wert) {
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault(); ton.resume();
    if (e.pointerType === 'touch') touchModus();
    if (zustand === 'crash') { nachCrash(); return; }
    if (zustand !== 'play') return;
    zeiger.set(e.pointerId, wert);
    try { el.setPointerCapture(e.pointerId); } catch (x) { /* egal */ }
    knopfStatus();
  });
  const los = (e) => { if (zeiger.delete(e.pointerId)) knopfStatus(); };
  el.addEventListener('pointerup', los); el.addEventListener('pointercancel', los); el.addEventListener('lostpointercapture', los);
  el.addEventListener('contextmenu', (e) => e.preventDefault());
}
function knopfStatus() {
  let g = false, b = false; for (const v of zeiger.values()) { if (v > 0) g = true; else b = true; }
  $('#pGas').classList.toggle('an', g); $('#pBremse').classList.toggle('an', b);
}
zeigerAn($('#pGas'), 1); zeigerAn($('#pBremse'), -1);
document.querySelectorAll('#zonen div').forEach((d) => zeigerAn(d, +d.dataset.p));
canvas.addEventListener('pointerdown', () => { ton.resume(); if (zustand === 'crash') nachCrash(); });
addEventListener('blur', () => { tasten.gas = tasten.bremse = false; zeiger.clear(); knopfStatus(); if (zustand === 'play' && versuchGestartet) pause(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) { tasten.gas = tasten.bremse = false; zeiger.clear(); if (zustand === 'play' && versuchGestartet) pause(); if (ton.ctx) ton.ctx.suspend().catch(() => {}); } else if (ton.ctx && stand.settings.sound) ton.ctx.resume().catch(() => {}); });

// ---------- Vollbild ----------
function vollbildMoeglich() { const d = document.documentElement; return !!(d.requestFullscreen || d.webkitRequestFullscreen); }
async function vollbild() {
  const d = document.documentElement;
  try {
    if (document.fullscreenElement || document.webkitFullscreenElement) { (document.exitFullscreen || document.webkitExitFullscreen).call(document); return; }
    await (d.requestFullscreen ? d.requestFullscreen({ navigationUI: 'hide' }) : d.webkitRequestFullscreen());
    if (screen.orientation && screen.orientation.lock && document.body.classList.contains('touch')) screen.orientation.lock('landscape').catch(() => {});
  } catch (e) { toast('Vollbild wird hier nicht unterstützt'); }
}
if (!vollbildMoeglich()) { $('#mVoll').hidden = true; $('#pVoll').hidden = true; }

// ---------- Knöpfe ----------
const klick = (sel, fn) => $(sel).addEventListener('click', (e) => { ton.resume(); ton.klick(); fn(e); });
klick('#mSpielen', () => starteLevel(naechstesOffenes(), { tipp: true }));
klick('#mLevel', zeigeLevels);
klick('#mAwards', zeigeAwards);
klick('#mGarage', zeigeGarage);
klick('#mZeiten', zeigeZeiten);
klick('#mTon', tonUmschalten);
klick('#mVoll', vollbild);
document.querySelectorAll('[data-zurueck]').forEach((b) => b.addEventListener('click', () => { ton.klick(); zumMenu(); }));
klick('#bNeu', () => { if (zustand === 'crash') nachCrash(); else if (zustand === 'play') neustart(); });
klick('#bPause', () => (zustand === 'pause' ? weiter() : pause()));
klick('#pWeiter', weiter);
klick('#pNeu', () => { zustand = 'play'; neustart(); });
klick('#pLevel', () => { beendeVersuch('verlassen'); zustand = 'menu'; $('#hud').hidden = true; $('#zeit').hidden = true; $('#fort').hidden = true; zeigeLevels(); });
klick('#pTon', tonUmschalten);
klick('#pVoll', vollbild);
klick('#pMenu', zumMenu);
klick('#eWeiter', () => { const n = LEVEL_BY_ID[level.id + 1]; if (n) starteLevel(n.id); });
klick('#eNochmal', () => starteLevel(level.id));
klick('#eTeilen', () => awardPopup({ level: ergebnis.level, ms: stand.levels[ergebnis.level].best || ergebnis.ms }, () => zeigeNur('#oErgebnis')));
klick('#eLevels', () => { zustand = 'menu'; $('#hud').hidden = true; $('#zeit').hidden = true; $('#fort').hidden = true; $('#banner').hidden = true; zeigeLevels(); });
klick('#eMenu', zumMenu);
$('#awTeilen').addEventListener('click', () => { ton.resume(); aktionTeilen(); });
$('#awBild').addEventListener('click', () => { ton.klick(); aktionBild(); });
$('#awLink').addEventListener('click', () => { ton.klick(); aktionLink(); });
klick('#awWeiter', popupSchliessen);
$('#gName').addEventListener('change', (e) => { const n = saubererName(e.target.value); stand.settings.name = n; e.target.value = n; speichern(); });
$('#oPause').addEventListener('click', (e) => { if (e.target === e.currentTarget) weiter(); });

// ====================================================================== Start
function startParameter() {
  const lv = +PARAMS.get('level');
  const ms = +PARAMS.get('zeit');
  const von = saubererName(PARAMS.get('von') || '');
  const award = PARAMS.get('award');
  if (LEVEL_BY_ID[lv]) {
    herausforderung = { level: lv, ms: Number.isFinite(ms) && ms >= 1000 && ms <= 3600000 ? Math.round(ms) : null, von };
    if (!herausforderung.ms) herausforderung = null;
    return lv;
  }
  if (award && AWARD_BY_ID[award]) herausforderung = { award, von };
  return null;
}
function init() {
  setTimeout(logo, 2500);   // Logo für Teilen-Bilder vorladen (falls die Verbindung später wegbricht)
  const direkt = startParameter();
  if (direkt) { starteDemo(); demo = null; starteLevel(direkt, { tipp: true }); }
  else zumMenu();
  requestAnimationFrame(frame);
}

// Test-Schnittstelle (nur mit ?test)
if (TEST) {
  window.__sl = {
    get zustand() { return zustand; }, get sim() { return sim; }, get stand() { return stand; }, get level() { return level; },
    get ergebnis() { return ergebnis; }, LEVELS, starteLevel, neustart, zumMenu, pause, weiter,
    tasten, setzeEingabe(v) { tasten.gas = v > 0; tasten.bremse = v < 0; },
    speichern, laden() { stand = ladeStand(); }, awardWarteschlange, awardPopup, teilenBild, teilenLink, aktionTeilen,
    set kameraFix(v) { kameraFix = v; },
    schnell(n) { for (let i = 0; i < n && (zustand === 'play' || zustand === 'crash' || zustand === 'finish'); i++) schritt(); }
  };
}
init();
