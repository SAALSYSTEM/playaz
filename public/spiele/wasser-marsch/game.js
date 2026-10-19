// Wasser Marsch! – Oberfläche: Canvas-2D-Szene, Wasserstrahl per Finger/Maus, Drehleiter-Rettung, DOM-Menüs, Speichern, Ton.
import { SCENES, LEVELS, LEVEL_COUNT } from './levels.js';
import {
  STORE, SCENE_LAYOUT, layout, pickWindow, newState, burning, firesOut, catsDown, fireLevel, catUnlocked,
  spray, tapCat, rescuePhase, stepRescue, checkWin, freshSave, sanitizeSave, recordWin
} from './engine.js';

const $ = (id) => document.getElementById(id);
const app = $('app'), cv = $('game'), ctx = cv.getContext('2d');
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, k) => a + (b - a) * k;
const ease = (k) => (k <= 0 ? 0 : k >= 1 ? 1 : k * k * (3 - 2 * k));
const GROUND = 0.808;   // Gehweg-Oberkante im Hintergrundbild (gemessen)

// ---------- Bilder (einmal laden, Teilbilder sind bereits einzeln ausgeschnitten) ----------
const IMG = {}; let MAN = {};
const base = new URL('img/', import.meta.url);
async function loadImages() {
  try { MAN = await (await fetch(new URL('manifest.json', base))).json(); } catch { MAN = {}; }
  await Promise.all(Object.keys(MAN).map((k) => new Promise((res) => {
    const i = new Image(); i.decoding = 'async';
    i.onload = () => { IMG[k] = i; res(); }; i.onerror = () => res();
    i.src = new URL(k + '.webp', base).href;
  })));
}
// Zeichnet das Kernrechteck (sourceRect) eines Bildes in das Zielrechteck; der 2-px-Rand wird mit gezeichnet.
function drawCore(k, x, y, w, h) {
  const i = IMG[k], m = MAN[k];
  if (!i || !m) { ctx.fillStyle = 'rgba(0,0,0,.15)'; ctx.fillRect(x, y, w, h); return; }
  const [cx, cy, cw, ch] = m.core, sx = w / cw, sy = h / ch;
  ctx.drawImage(i, x - cx * sx, y - cy * sy, m.w * sx, m.h * sy);
}
const coreAspect = (k) => { const m = MAN[k]; return m ? m.core[2] / m.core[3] : 1; };

// ---------- Spielstand ----------
let save = freshSave();
try { save = sanitizeSave(JSON.parse(localStorage.getItem(STORE)), LEVEL_COUNT); } catch { /* Privatmodus */ }
const persist = () => { try { localStorage.setItem(STORE, JSON.stringify(save)); } catch { /* gesperrt */ } };

// ---------- Ton (WebAudio, erst nach der ersten Berührung) ----------
let actx = null, noiseBuf = null, sprayNode = null;
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
function tone(freq, dur, type = 'sine', vol = 0.12, slide = 0, delay = 0) {
  if (save.mute || !actx) return;
  try {
    const t = actx.currentTime + delay, o = actx.createOscillator(), g = actx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(actx.destination); o.start(t); o.stop(t + dur + 0.05);
  } catch { /* egal */ }
}
function noise(dur, freq, vol, q = 0.8, slide = 0) {
  if (save.mute || !actx || !noiseBuf) return;
  try {
    const t = actx.currentTime, s = actx.createBufferSource(), f = actx.createBiquadFilter(), g = actx.createGain();
    s.buffer = noiseBuf; s.loop = true; f.type = 'bandpass'; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (slide) f.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(actx.destination); s.start(t); s.stop(t + dur + 0.05);
  } catch { /* egal */ }
}
function sprayStart() {
  if (save.mute || !actx || !noiseBuf || sprayNode) return;
  try {
    const t = actx.currentTime, s = actx.createBufferSource(), f = actx.createBiquadFilter(), g = actx.createGain();
    s.buffer = noiseBuf; s.loop = true; f.type = 'bandpass'; f.frequency.value = 1500; f.Q.value = 0.6;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.045, t + 0.06);
    s.connect(f).connect(g).connect(actx.destination); s.start(t); sprayNode = { s, g };
  } catch { sprayNode = null; }
}
function sprayStop() {
  if (!sprayNode || !actx) { sprayNode = null; return; }
  try { const t = actx.currentTime; sprayNode.g.gain.cancelScheduledValues(t); sprayNode.g.gain.setTargetAtTime(0.0001, t, 0.015); sprayNode.s.stop(t + 0.08); } catch { /* egal */ }
  sprayNode = null;
}
const SFX = {
  out: () => { noise(0.45, 900, 0.07, 0.7, 0.4); tone(880, 0.16, 'triangle', 0.1, 0, 0.12); tone(1320, 0.24, 'triangle', 0.1, 0, 0.22); },
  ladder: () => { tone(150, 1.4, 'triangle', 0.035, 1.5); tone(300, 0.08, 'sine', 0.05); },
  meow: () => { tone(620, 0.16, 'triangle', 0.09, 1.5); tone(930, 0.22, 'triangle', 0.08, 0.72, 0.15); },
  arrive: () => [660, 880, 1175].forEach((f, i) => tone(f, 0.2, 'triangle', 0.1, 0, i * 0.1)),
  win: () => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.26, 'triangle', 0.12, 0, i * 0.12)),
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
function toggleMute() {
  save.mute = !save.mute; persist();
  if (save.mute) sprayStop(); else { unlockAudio(); SFX.click(); }
  paintMute();
}

// ---------- Größe und Aufbau ----------
let W = 360, H = 640, dpr = 1, view = null, L = null, rig = null;
function resize() {
  W = app.clientWidth; H = app.clientHeight; dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  cv.style.width = W + 'px'; cv.style.height = H + 'px';
  const s = Math.max(W / 941, H / 1672), bw = 941 * s, bh = 1672 * s;
  let by = clamp(H * 0.81 - GROUND * bh, H - bh, 0);
  const ground = by + GROUND * bh;
  const hud = $('hud').getBoundingClientRect(), ar = app.getBoundingClientRect();
  const top = Math.max(hud.bottom - ar.top + 10, H * 0.1);
  view = { w: W, h: H, top, ground, bg: { x: (W - bw) / 2, y: by, w: bw, h: bh } };
  // Fahrzeug unten rechts, Feuerwehrmann unten links
  const tw = Math.min(W * 0.56, 300), th = tw / (1502 / 806);
  const tBottom = Math.min(H - 6, ground + (H - ground) * 0.93);
  const truck = { x: W - tw - W * 0.012, y: tBottom - th, w: tw, h: th };
  const fh = clamp(H * 0.19, 100, 150), fw = fh * 602 / 1494;
  const feet = Math.min(H - 4, ground + (H - ground) * 0.9);
  const man = { x: W * 0.012, y: feet - fh, w: fw, h: fh };
  const ladderBase = { x: truck.x + 0.83 * tw, y: truck.y + 0.12 * th };
  rig = { truck, man, ladderBase, shoulder: { x: man.x + 0.77 * fw, y: man.y + 0.36 * fh }, armLen: 0.4 * fh };
  if (level) relayout();
}
function relayout() {
  L = layout(SCENES.find((s) => s.id === level.scene), view);
  // Katzen- und Korbgröße: gemeinsame Skalierung für beide Katzenposen
  const minWinH = Math.min(...L.windows.map((w) => w.h));
  const kAsp = coreAspect('korb') || 1.31;
  const maxBasketH = rig.truck.w * 0.27 / kAsp;           // Korb bleibt klein gegenüber dem Wagen
  const catH = clamp(Math.min(minWinH * 0.92, maxBasketH * 0.72), 22, 56);
  const catAsp = coreAspect('katze-wartend') || 0.79;
  const basketH = catH / 0.72, basketW = basketH * kAsp;
  rig.cat = { h: catH, w: catH * catAsp };
  rig.basket = { w: basketW, h: basketH };
  rig.ladderW = clamp(basketW * 0.3, 12, 30);
  rig.restTip = { x: rig.truck.x + rig.truck.w * 0.36, y: rig.truck.y + rig.truck.h * 0.14 };   // Korb liegt auf dem Fahrerhaus
  rig.sideCats = [0, 1, 2].map((i) => ({ x: W * 0.255 + i * (rig.cat.w * 1.05), y: Math.min(H - 6, view.ground + (H - view.ground) * 0.93) }));
}

// ---------- Zustand ----------
let mode = 'menu';          // menu | play | pause | cheer | won
let level = null, st = null, clock = 0, cheerT = 0;
let sprayer = null;         // { id, x, y }
let aim = null, jetK = 0, armAng = -0.6;
let idle = 0, hintDone = { spray: false, cat: false }, flash = null, particles = [], outFx = [];
let hudCache = '';

function loadLevel(id, play = true) {
  level = LEVELS[clamp(id, 1, LEVEL_COUNT) - 1];
  st = newState(level);
  particles = []; outFx = []; flash = null; idle = 0; cheerT = 0;
  hintDone = { spray: level.hint !== 'holdToSpray', cat: level.hint !== 'tapCatAfterClearingHouse' };
  stopSpray();
  relayout();
  hudCache = '';
  updateHud();
  if (play) setMode('play');
}

// ---------- Eingabe ----------
const catAt = (x, y) => {
  const w = pickWindow(L.windows, x, y, (w) => st.cats.some((c) => c.win === w.id && c.state === 'wait') || st.fires.some((f) => f.win === w.id && burning(f)));
  if (!w) return -1;
  return st.cats.findIndex((c) => c.win === w.id && c.state === 'wait');
};
function pos(e) { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
function stopSpray() { sprayer = null; aim = null; jetK = 0; sprayStop(); }

cv.addEventListener('pointerdown', (e) => {
  unlockAudio();
  if (mode !== 'play' || sprayer) return;
  e.preventDefault();
  idle = 0;
  if (st.rescue) return;                       // während der Rettung kein Wasser, keine weitere Rettung
  const p = pos(e);
  const ci = catAt(p.x, p.y);
  if (ci >= 0) {
    const r = tapCat(st, ci);
    if (r === 'start') { hintDone.cat = true; SFX.ladder(); }
    else if (r === 'locked') flash = { b: st.cats[ci].b, t: 1.4 };
    return;
  }
  sprayer = { id: e.pointerId, x: p.x, y: p.y };
  try { cv.setPointerCapture(e.pointerId); } catch { /* egal */ }
  sprayStart();
});
cv.addEventListener('pointermove', (e) => {
  if (!sprayer || e.pointerId !== sprayer.id) return;
  const p = pos(e); sprayer.x = p.x; sprayer.y = p.y; idle = 0;
});
const endPointer = (e) => { if (sprayer && e.pointerId === sprayer.id) stopSpray(); };
cv.addEventListener('pointerup', endPointer);
cv.addEventListener('pointercancel', endPointer);
cv.addEventListener('lostpointercapture', endPointer);
cv.addEventListener('contextmenu', (e) => e.preventDefault());
window.addEventListener('blur', () => stopSpray());

// ---------- Ablauf ----------
function update(dt) {
  clock += dt;
  if (mode === 'menu' || mode === 'pause') return;
  idle += dt;
  if (flash) { flash.t -= dt; if (flash.t <= 0) flash = null; }

  // Zielpunkt und leichtes Einrasten bei nahem brennenden Fenster
  if (sprayer && mode === 'play' && !st.rescue) {
    let tx = sprayer.x, ty = sprayer.y;
    const near = pickWindow(L.windows, tx, ty, (w) => st.fires.some((f) => f.win === w.id && burning(f)), 1.35);
    if (near) { tx = lerp(tx, near.cx, 0.55); ty = lerp(ty, near.cy, 0.55); }
    aim = { x: tx, y: ty };
    // nie auf eine Katze spritzen
    if (catAt(tx, ty) >= 0) { jetK = 0; aim.blocked = true; }
    else jetK = Math.min(1, jetK + dt / 0.16);
  } else if (st.rescue && sprayer) stopSpray();

  // Arm folgt dem Ziel (Winkel begrenzt, damit er nicht durch den Kopf dreht)
  const target = aim || { x: rig.shoulder.x + 100, y: rig.shoulder.y - 70 };
  const want = clamp(Math.atan2(target.y - rig.shoulder.y, target.x - rig.shoulder.x), -1.19, 0.15);
  armAng = lerp(armAng, want, 1 - Math.exp(-dt * 18));

  // Wasser trifft
  if (sprayer && aim && !aim.blocked && jetK >= 1 && mode === 'play') {
    const hit = pickWindow(L.windows, aim.x, aim.y, (w) => st.fires.some((f) => f.win === w.id && burning(f)));
    if (Math.random() < dt * 40) splash(aim.x, aim.y, !!hit);
    if (hit) {
      hintDone.spray = true;
      const out = spray(st, hit.id, dt);
      if (out) extinguished(hit);
    }
  }

  // Rettung
  if (st.rescue) {
    const ev = stepRescue(st, dt);
    if (ev.includes('hop')) SFX.meow();
    if (ev.includes('arrive')) { SFX.arrive(); sparkle(rig.restTip.x, rig.restTip.y - rig.basket.h * 0.5, 10); }
  }
  updateHud();

  if (mode === 'play' && checkWin(st)) win();
  if (mode === 'cheer') {
    cheerT += dt;
    if (Math.random() < dt * 30) confetti();
    if (cheerT > 1.4) { setMode('won'); }
  }

  for (const p of particles) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.g * dt; p.r += p.grow * dt; }
  particles = particles.filter((p) => p.life > 0);
  for (const o of outFx) o.t += dt;
  outFx = outFx.filter((o) => o.t < 2.4);
}

function extinguished(w) {
  SFX.out();
  outFx.push({ id: w.id, t: 0 });
  for (let i = 0; i < 14; i++) particles.push({ kind: 'steam', x: w.cx + (Math.random() - 0.5) * w.w, y: w.cy, vx: (Math.random() - 0.5) * 30, vy: -30 - Math.random() * 40, g: 0, r: 6 + Math.random() * 6, grow: 14, life: 1.2, max: 1.2 });
  sparkle(w.cx, w.cy, 12);
}
function splash(x, y, steam) {
  particles.push({ kind: 'drop', x, y, vx: (Math.random() - 0.5) * 120, vy: -60 - Math.random() * 80, g: 420, r: 2 + Math.random() * 2, grow: 0, life: 0.5, max: 0.5 });
  if (steam && Math.random() < 0.5) particles.push({ kind: 'steam', x: x + (Math.random() - 0.5) * 16, y: y - 6, vx: (Math.random() - 0.5) * 16, vy: -40, g: 0, r: 5, grow: 18, life: 0.9, max: 0.9 });
}
function sparkle(x, y, n) {
  for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, s = 60 + Math.random() * 90; particles.push({ kind: 'star', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 40, g: 160, r: 3 + Math.random() * 3, grow: 0, life: 0.9, max: 0.9, rot: Math.random() * 6 }); }
}
const CONF = ['#FFD21C', '#FF9200', '#4fc3f7', '#ffffff', '#ff6b6b', '#7ed957'];
function confetti() {
  particles.push({ kind: 'conf', x: Math.random() * W, y: -10, vx: (Math.random() - 0.5) * 60, vy: 80 + Math.random() * 80, g: 40, r: 4 + Math.random() * 3, grow: 0, life: 3, max: 3, rot: Math.random() * 6, c: CONF[(Math.random() * CONF.length) | 0] });
}

function win() {
  stopSpray();
  recordWin(save, level.id, LEVEL_COUNT); persist();
  SFX.win();
  for (let i = 0; i < 40; i++) confetti();
  setMode('cheer');
}

// ---------- Zeichnen ----------
function drawBackground() {
  const b = view.bg;
  ctx.fillStyle = '#7fc8f2'; ctx.fillRect(0, 0, W, Math.max(0, b.y + 2));
  ctx.fillStyle = '#4c5f86'; ctx.fillRect(0, b.y + b.h - 2, W, H);
  if (IMG.hintergrund) ctx.drawImage(IMG.hintergrund, b.x, b.y, b.w, b.h);
  else { const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#6ec0ef'); g.addColorStop(GROUND, '#b8e2f8'); g.addColorStop(GROUND + 0.001, '#d8cfc6'); g.addColorStop(0.85, '#56688c'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); }
}

function partKey(k, skin) { return skin && skin.v && k.startsWith('hochhaus') ? k + '-' + skin.v : skin && skin.v && k === 'reihenhaus' ? k + '-' + skin.v : k; }

function windowState(w) {
  const f = st.fires.find((x) => x.win === w.id);
  const c = st.cats.find((x) => x.win === w.id);
  return { f, c };
}

function drawBuildings() {
  for (const b of L.buildings) {
    // Hochhaus: oben nach unten zeichnen, damit Gesimse sauber überlappen
    const parts = b.kind === 'tower' ? [...b.parts].sort((a, c) => (a.k === 'hochhaus-dach' ? 1 : 0) - (c.k === 'hochhaus-dach' ? 1 : 0) || a.y - c.y) : b.parts;
    for (const p of parts) drawCore(partKey(p.k, b.skin), p.x, p.y, p.w, p.h);
    for (const w of b.windows) {
      const { f, c } = windowState(w);
      const open = !!f || !!c;
      drawCore(open ? 'fenster-1' : 'fenster-' + b.skin.win, w.x, w.y, w.w, w.h);
    }
  }
}

function drawFiresAndCats() {
  const t = clock;
  // Glühen hinter brennenden Fenstern
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  st.fires.forEach((f, i) => {
    if (!burning(f)) return;
    const w = L.byId[f.win], lv = fireLevel(f), fl = 0.85 + 0.15 * Math.sin(t * 11 + i * 2);
    const r = w.w * (0.9 + 0.8 * lv) * fl;
    const g = ctx.createRadialGradient(w.cx, w.cy, 0, w.cx, w.cy, r);
    g.addColorStop(0, `rgba(255,170,60,${0.5 * lv})`); g.addColorStop(1, 'rgba(255,120,30,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(w.cx, w.cy, r, 0, Math.PI * 2); ctx.fill();
  });
  ctx.restore();
  // Flammen: unten mittig verankert, Größe = verbleibende Stärke
  st.fires.forEach((f, i) => {
    if (!burning(f)) return;
    const w = L.byId[f.win], lv = fireLevel(f);
    const fr = Math.floor(t * 7 + i * 1.7) % 4, k = 'flamme-' + fr;
    const h = w.h * 1.25 * (0.32 + 0.68 * lv) * (1 + 0.05 * Math.sin(t * 9 + i)), wd = h * coreAspect(k);
    drawCore(k, w.cx - wd / 2, w.y + w.h * 0.9 - h, wd, h);
  });
  // markierte Feuer nach Tipp auf gesperrte Katze (über den Flammen, ohne Fehlerton)
  if (flash) {
    const a = Math.min(1, flash.t / 0.4), p = 0.5 + 0.5 * Math.sin(clock * 10);
    for (const f of st.fires) if (f.b === flash.b && burning(f)) {
      const w = L.byId[f.win], rx = w.w * (0.95 + 0.15 * p), ry = w.h * (0.9 + 0.12 * p);
      ctx.save(); ctx.setLineDash([9, 6]); ctx.lineDashOffset = -clock * 40;
      ctx.strokeStyle = `rgba(17,18,26,${0.55 * a})`; ctx.lineWidth = 7; ctx.beginPath(); ctx.ellipse(w.cx, w.cy, rx, ry, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = `rgba(255,210,28,${a})`; ctx.lineWidth = 4; ctx.beginPath(); ctx.ellipse(w.cx, w.cy, rx, ry, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
  }
  // gelöschte Fenster: kurz dampfen
  for (const o of outFx) {
    const w = L.byId[o.id]; const a = 1 - o.t / 2.4;
    for (let j = 0; j < 3; j++) {
      const k = (o.t * 0.6 + j / 3) % 1;
      ctx.fillStyle = `rgba(255,255,255,${0.45 * a * (1 - k)})`;
      ctx.beginPath(); ctx.arc(w.cx + Math.sin(k * 6 + j) * 5, w.y - k * w.h * 1.2, w.w * (0.15 + 0.2 * k), 0, Math.PI * 2); ctx.fill();
    }
  }
  // Katzen im Fenster
  st.cats.forEach((c, i) => {
    const w = L.byId[c.win];
    const inRescue = st.rescue && st.rescue.cat === i;
    if (c.state === 'down' || (inRescue && rescuePhase(st.rescue.t).phase !== 'extend')) return;
    const unlocked = catUnlocked(st, i) && !st.rescue && mode === 'play';
    let s = 1;
    if (unlocked) {
      const p = 0.5 + 0.5 * Math.sin(clock * 4.2);
      s = 1 + 0.06 * p;
      ctx.save(); ctx.strokeStyle = `rgba(255,255,255,${0.5 + 0.4 * p})`; ctx.lineWidth = 3 + 2 * p;
      ctx.shadowColor = 'rgba(255,210,28,.9)'; ctx.shadowBlur = 12;
      ctx.beginPath(); ctx.ellipse(w.cx, w.cy, w.w * (0.72 + 0.08 * p), w.h * (0.66 + 0.06 * p), 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    }
    const ch = rig.cat.h * s, cw = rig.cat.w * s;
    drawCore('katze-wartend', w.cx - cw / 2, w.y + w.h * 0.93 - ch, cw, ch);
  });
}

// Leiterpose: Winkel und Länge aus Basis und Ziel (Korb-Anschluss)
function basketTarget(w) {
  const bw = rig.basket.w, bh = rig.basket.h;
  const top = w.y + w.h - bh * 0.3;
  const bx = clamp(w.cx - bw / 2, 2, W - bw - 2);
  return { x: bx + bw * 0.5, y: top + bh * 0.92 };   // Leiterspitze sitzt unter dem Korbboden
}
function poseFrom(tip) { const dx = tip.x - rig.ladderBase.x, dy = tip.y - rig.ladderBase.y; return { a: Math.atan2(dy, dx), l: Math.hypot(dx, dy) }; }
function ladderPose() {
  const rest = poseFrom(rig.restTip);
  if (!st.rescue) return { ...rest, cat: null };
  const r = st.rescue, w = L.byId[st.cats[r.cat].win], far = poseFrom(basketTarget(w));
  const ph = rescuePhase(r.t);
  let ka = 0, kl = 0;
  if (ph.phase === 'extend') { ka = ease(clamp(ph.k * 1.7, 0, 1)); kl = ease(clamp((ph.k - 0.3) / 0.7, 0, 1)); }
  else if (ph.phase === 'hop') { ka = 1; kl = 1; }
  else if (ph.phase === 'retract') { kl = 1 - ease(clamp(ph.k / 0.7, 0, 1)); ka = 1 - ease(clamp((ph.k - 0.4) / 0.6, 0, 1)); }
  // ausfahren: erst drehen, dann ausziehen; einfahren: erst einziehen, dann zurückdrehen
  return { a: lerp(rest.a, far.a, ka), l: lerp(rest.l, far.l, kl), ph, w };
}

function drawTruckAndLadder() {
  const t = rig.truck;
  drawCore('feuerwehrwagen', t.x, t.y, t.w, t.h);
  // Blaulicht während Rettung und Jubel
  if (st.rescue || mode === 'cheer' || mode === 'won') {
    const on = (Math.sin(clock * 14) > 0) ? 1 : 0.35;
    const lx = t.x + 0.212 * t.w, ly = t.y + 0.035 * t.h, r = t.w * 0.12;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(lx, ly, 0, lx, ly, r); g.addColorStop(0, `rgba(80,160,255,${0.85 * on})`); g.addColorStop(1, 'rgba(40,110,255,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(lx, ly, r, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }
  const pose = ladderPose();
  const tip = { x: rig.ladderBase.x + Math.cos(pose.a) * pose.l, y: rig.ladderBase.y + Math.sin(pose.a) * pose.l };
  // Leiter: Segment steht bei Winkel 0 senkrecht -> +PI/2
  const lw = rig.ladderW, segH = lw / coreAspect('leiter-segment');
  ctx.save(); ctx.translate(rig.ladderBase.x, rig.ladderBase.y); ctx.rotate(pose.a + Math.PI / 2);
  ctx.beginPath(); ctx.rect(-lw, -pose.l - 1, lw * 2, pose.l + 2); ctx.clip();
  for (let y = 0; y < pose.l + segH; y += segH * 0.97) drawCore('leiter-segment', -lw / 2, -y - segH, lw, segH);
  ctx.restore();
  const jw = lw * 2.4, jh = jw / coreAspect('leiter-gelenk');
  drawCore('leiter-gelenk', rig.ladderBase.x - jw / 2, rig.ladderBase.y - jh * 0.55, jw, jh);
  // Korb waagerecht am Leiterende
  const bw = rig.basket.w, bh = rig.basket.h, bx = tip.x - bw * 0.5, by = tip.y - bh * 0.92;
  drawCore('korb', bx, by, bw, bh);
  // Katze im Korb (Pfoten hinter der Vorderkante)
  if (st.rescue && pose.ph) {
    const ph = pose.ph, w = pose.w, cw = rig.cat.w, ch = rig.cat.h;
    const pick = { x: bx + bw * 0.5, y: by + bh * 0.72 };
    if (ph.phase === 'hop') {
      const from = { x: w.cx, y: w.y + w.h * 0.93 }, k = ease(ph.k);
      const x = lerp(from.x, pick.x, k), y = lerp(from.y, pick.y, k) - Math.sin(Math.PI * ph.k) * ch * 0.6;
      drawCore('katze-wartend', x - cw / 2, y - ch, cw, ch);
    } else if (ph.phase === 'retract') {
      drawCore('katze-gluecklich', pick.x - cw / 2, pick.y - ch, cw, ch);
      ctx.save(); ctx.beginPath(); ctx.rect(bx - 2, by + bh * 0.66, bw + 4, bh); ctx.clip(); drawCore('korb', bx, by, bw, bh); ctx.restore();
    }
  }
}

function drawRescuedCats() {
  const n = catsDown(st);
  let shown = 0;
  st.cats.forEach((c, i) => {
    const inSettle = st.rescue && st.rescue.cat === i && rescuePhase(st.rescue.t).phase === 'settle';
    if (c.state !== 'down') return;
    const spot = rig.sideCats[Math.min(2, shown++)], cw = rig.cat.w, ch = rig.cat.h;
    let x = spot.x, y = spot.y;
    if (inSettle) {
      const k = ease(rescuePhase(st.rescue.t).k), from = { x: rig.restTip.x, y: rig.restTip.y - rig.basket.h * 0.2 };
      x = lerp(from.x, spot.x, k); y = lerp(from.y, spot.y, k) - Math.sin(Math.PI * k) * ch * 0.8;
    } else y -= Math.abs(Math.sin(clock * 3 + i)) * 2;
    drawCore('katze-gluecklich', x - cw / 2, y - ch, cw, ch);
  });
  return n;
}

function drawFirefighter() {
  const m = rig.man, t = rig.truck;
  // Schlauch: vom Feuerwehrmann über die Straße zum Wagen
  ctx.save(); ctx.lineCap = 'round';
  const hx = m.x + m.w * 0.55, hy = m.y + m.h * 0.62, gy = Math.min(H - 3, m.y + m.h * 1.0);
  const ex = t.x + t.w * 0.6, ey = t.y + t.h * 0.66;
  for (const [c, wdt] of [['#7e1410', 8], ['#d9281c', 5]]) {
    ctx.strokeStyle = c; ctx.lineWidth = wdt; ctx.beginPath(); ctx.moveTo(hx, hy);
    ctx.bezierCurveTo(m.x + m.w * 1.4, gy + 8, ex - t.w * 0.25, gy + 4, ex, ey); ctx.stroke();
  }
  ctx.restore();
  drawCore('feuerwehrmann', m.x, m.y, m.w, m.h);
  // Arm über der Figur, Schulter leicht überlappend
  const cw = rig.armLen / (0.98 - 0.065), ch = cw / coreAspect('arm-loeschrohr');
  ctx.save(); ctx.translate(rig.shoulder.x, rig.shoulder.y); ctx.rotate(armAng);
  drawCore('arm-loeschrohr', -0.065 * cw, -0.48 * ch, cw, ch);
  ctx.restore();
}
const nozzle = () => ({ x: rig.shoulder.x + Math.cos(armAng) * rig.armLen, y: rig.shoulder.y + Math.sin(armAng) * rig.armLen });

function drawWater() {
  if (!sprayer || !aim || aim.blocked || jetK <= 0) return;
  const p0 = nozzle(), p2 = aim, L0 = Math.hypot(p2.x - p0.x, p2.y - p0.y);
  const p1 = { x: p0.x + Math.cos(armAng) * L0 * 0.55, y: p0.y + Math.sin(armAng) * L0 * 0.55 - L0 * 0.1 };
  const pts = [];
  const n = 26;
  for (let i = 0; i <= n; i++) {
    const tt = (i / n) * jetK, u = 1 - tt;
    pts.push({ x: u * u * p0.x + 2 * u * tt * p1.x + tt * tt * p2.x, y: u * u * p0.y + 2 * u * tt * p1.y + tt * tt * p2.y });
  }
  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const path = () => { ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); for (const q of pts) ctx.lineTo(q.x, q.y); };
  ctx.strokeStyle = 'rgba(90,180,250,.45)'; ctx.lineWidth = 11; path(); ctx.stroke();
  ctx.strokeStyle = 'rgba(170,225,255,.9)'; ctx.lineWidth = 6; path(); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.lineWidth = 2.2; ctx.setLineDash([10, 9]); ctx.lineDashOffset = -clock * 160; path(); ctx.stroke();
  ctx.restore();
  if (jetK >= 1) { ctx.fillStyle = 'rgba(220,245,255,.85)'; ctx.beginPath(); ctx.arc(p2.x, p2.y, 6 + Math.sin(clock * 30) * 1.5, 0, Math.PI * 2); ctx.fill(); }
}

function drawParticles() {
  for (const p of particles) {
    const a = clamp(p.life / p.max, 0, 1);
    if (p.kind === 'drop') { ctx.fillStyle = `rgba(150,215,255,${a})`; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill(); }
    else if (p.kind === 'steam') { ctx.fillStyle = `rgba(255,255,255,${0.55 * a})`; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill(); }
    else if (p.kind === 'star') { star(p.x, p.y, p.r * (0.6 + a * 0.6), `rgba(255,222,70,${a})`); }
    else if (p.kind === 'conf') { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot + clock * 4); ctx.fillStyle = p.c; ctx.globalAlpha = Math.min(1, p.life); ctx.fillRect(-p.r, -p.r * 0.5, p.r * 2, p.r); ctx.restore(); }
  }
}
function star(x, y, r, c) {
  ctx.fillStyle = c; ctx.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
  ctx.closePath(); ctx.fill();
}

// Fingerhinweis: Finger drückt und hält (Wasser) oder tippt (Katze)
function drawFinger(x, y, kind) {
  const per = kind === 'tap' ? 1.1 : 2.0, k = (clock % per) / per;
  let press = 0, off = 0;
  if (kind === 'tap') { press = k < 0.25 ? k / 0.25 : k < 0.45 ? 1 - (k - 0.25) / 0.2 : 0; off = (1 - press) * 10; }
  else { press = k < 0.2 ? k / 0.2 : k < 0.85 ? 1 : 1 - (k - 0.85) / 0.15; off = (1 - press) * 16; }
  // Ring am Zielpunkt
  ctx.save();
  ctx.strokeStyle = `rgba(255,255,255,${0.35 + 0.5 * press})`; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(x, y, 14 + press * 10 + (kind === 'hold' ? Math.sin(clock * 6) * 2 * press : 0), 0, Math.PI * 2); ctx.stroke();
  // Hand (Zeigefinger zeigt nach oben links auf den Punkt)
  ctx.translate(x + 6 + off, y + 6 + off); ctx.rotate(-0.45); ctx.scale(1 - press * 0.06, 1 - press * 0.06);
  ctx.fillStyle = '#fff'; ctx.strokeStyle = '#11121A'; ctx.lineWidth = 2.5; ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(-6, 4); ctx.lineTo(-6, 26);           // Finger links
  ctx.quadraticCurveTo(-6, 31, -12, 34);
  ctx.quadraticCurveTo(-20, 38, -16, 48);         // Daumen
  ctx.quadraticCurveTo(-10, 62, 6, 64);
  ctx.quadraticCurveTo(22, 64, 24, 48);
  ctx.lineTo(24, 34); ctx.quadraticCurveTo(24, 28, 18, 28);
  ctx.quadraticCurveTo(14, 24, 9, 26);
  ctx.lineTo(6, 4); ctx.quadraticCurveTo(0, -4, -6, 4);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.restore();
}
function drawHints() {
  if (mode !== 'play' || sprayer || st.rescue) return;
  // Katze antippen
  const ci = st.cats.findIndex((c, i) => c.state === 'wait' && catUnlocked(st, i));
  if (ci >= 0 && (!hintDone.cat || idle > 4)) { const w = L.byId[st.cats[ci].win]; drawFinger(w.cx, w.cy, 'tap'); return; }
  // Feuer: drücken und halten
  const f = st.fires.find(burning);
  if (f && (!hintDone.spray || idle > 5.5)) { const w = L.byId[f.win]; drawFinger(w.cx, w.cy, 'hold'); }
}

function drawDeco() {
  for (const d of (SCENE_DECO() || [])) {
    const h = d.h * (view.ground - view.top) * 1.0, w = h * coreAspect(d.k);
    drawCore(d.k, d.x * W - w / 2, view.ground + 2 - h, w, h);
  }
}
const SCENE_DECO = () => (SCENE_LAYOUT[level.scene] || {}).deco;

function render() {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawBackground();
  if (!level || !L) return;
  drawBuildings();
  drawFiresAndCats();
  drawDeco();
  drawTruckAndLadder();
  drawRescuedCats();
  drawFirefighter();
  drawWater();
  drawParticles();
  drawHints();
}

// ---------- HUD und Menüs ----------
function updateHud() {
  if (!st) return;
  const key = `${level.id}|${firesOut(st)}|${catsDown(st)}`;
  if (key === hudCache) return;
  hudCache = key;
  $('hudLevel').textContent = String(level.id);
  $('hudFire').textContent = `${firesOut(st)}/${st.fires.length}`;
  $('hudCat').textContent = `${catsDown(st)}/${st.cats.length}`;
  $('chipCat').hidden = st.cats.length === 0;
  $('hudFireLabel').textContent = `Feuer gelöscht: ${firesOut(st)} von ${st.fires.length}`;
  $('hudCatLabel').textContent = `Katzen gerettet: ${catsDown(st)} von ${st.cats.length}`;
}

const SCREENS = ['start', 'levels', 'pause', 'win'];
function show(id) { for (const s of SCREENS) $(s).hidden = s !== id; }
function setMode(m) {
  mode = m;
  if (m !== 'play') stopSpray();
  $('hud').classList.toggle('off', m === 'menu');
  if (m === 'play' || m === 'cheer') show(null);
  if (m === 'pause') show('pause');
  if (m === 'won') {
    const last = level.id === LEVEL_COUNT;
    $('winTitle').textContent = last ? 'Alle Feuer gelöscht!' : 'Super gemacht!';
    $('winNext').querySelector('.lbl').textContent = last ? 'Fertig' : 'Weiter';
    $('winNext').setAttribute('aria-label', last ? 'Fertig, zur Levelauswahl' : 'Weiter zu Level ' + (level.id + 1));
    show('win');
    setTimeout(() => $('winNext').focus({ preventScroll: true }), 50);
  }
  document.body.dataset.mode = m;
}
function openMenu() { const id = nextLevel(); if (!level || level.id !== id || mode === 'won') loadLevel(id, false); setMode('menu'); show('start'); }
function nextLevel() { for (let i = 1; i <= save.unlocked; i++) if (!save.done[i]) return i; return Math.min(save.unlocked, LEVEL_COUNT); }

const SCENE_COL = ['#ffb347', '#ff8a65', '#4dd0c4', '#7cc4ff', '#b39ddb', '#ffd21c'];
function buildLevels() {
  const grid = $('levelGrid'); grid.innerHTML = '';
  const cur = nextLevel();
  for (const lv of LEVELS) {
    const b = document.createElement('button');
    const locked = lv.id > save.unlocked, done = !!save.done[lv.id];
    b.className = 'lvl' + (locked ? ' locked' : '') + (done ? ' done' : '') + (lv.id === cur && !done ? ' cur' : '');
    b.style.setProperty('--sc', SCENE_COL[lv.scene - 1]);
    b.disabled = locked;
    b.setAttribute('aria-label', `Level ${lv.id}${done ? ', geschafft' : locked ? ', gesperrt' : ''}`);
    b.innerHTML = `<span class="n">${lv.id}</span>` + (locked ? '<svg class="badge" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2" fill="currentColor"/><path d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" stroke-width="2.6"/></svg>' : done ? '<svg class="badge" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="11" fill="#2fbf71"/><path d="M6.5 12.5l3.5 3.5 7.5-8" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>' : '');
    if (lv.cats.length) b.insertAdjacentHTML('beforeend', `<img class="kitty" src="${new URL('katze-wartend.webp', base).href}" alt="">`);
    b.addEventListener('click', () => { SFX.click(); loadLevel(lv.id); });
    grid.appendChild(b);
  }
}
function openLevels() { buildLevels(); setMode('menu'); show('levels'); }

function pause() { if (mode === 'play') setMode('pause'); }
function resume() { if (mode === 'pause') setMode('play'); }

$('btnPlay').addEventListener('click', () => { unlockAudio(); SFX.click(); loadLevel(nextLevel()); });
$('btnLevels').addEventListener('click', () => { unlockAudio(); SFX.click(); openLevels(); });
$('levelsBack').addEventListener('click', () => { SFX.click(); openMenu(); });
$('btnPause').addEventListener('click', () => { unlockAudio(); SFX.click(); pause(); });
$('pResume').addEventListener('click', () => { SFX.click(); resume(); });
$('pRestart').addEventListener('click', () => { SFX.click(); loadLevel(level.id); });
$('pLevels').addEventListener('click', () => { SFX.click(); openLevels(); });
$('winNext').addEventListener('click', () => { unlockAudio(); SFX.click(); if (level.id >= LEVEL_COUNT) openLevels(); else loadLevel(level.id + 1); });
$('winAgain').addEventListener('click', () => { SFX.click(); loadLevel(level.id); });
$('winLevels').addEventListener('click', () => { SFX.click(); openLevels(); });
document.querySelectorAll('[data-mute]').forEach((b) => b.addEventListener('click', () => toggleMute()));
document.addEventListener('visibilitychange', () => { if (document.hidden) { stopSpray(); pause(); } });
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { if (mode === 'play') pause(); else if (mode === 'pause') resume(); }
});

// ---------- Schleife ----------
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000)); last = now;
  if (mode !== 'pause') update(dt);
  render();
  requestAnimationFrame(frame);
}

// Testzugang (nur für automatisierte Prüfungen): Zustand lesen, ohne das Spiel zu verändern
window.__wm = { get mode() { return mode; }, get st() { return st; }, get L() { return L; }, get rig() { return rig; }, get save() { return save; }, get level() { return level && level.id; }, nozzle };

new ResizeObserver(() => resize()).observe(app);
paintMute();
resize();
loadImages().then(() => {
  document.body.classList.add('ready');
  const q = new URLSearchParams(location.search), l = Number(q.get('level'));
  openMenu();
  if (l >= 1 && l <= save.unlocked) loadLevel(l);
  resize();
});
requestAnimationFrame((t) => { last = t; frame(t); });
