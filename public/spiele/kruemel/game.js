// Krümel – Oberfläche: Zeichnen (Platzhalter-Grafik), Kamera, Steuerung, Ton, Menüs.
// Regeln/Physik stehen in engine.js. Fester 60-Hz-Takt, gezeichnet wird so oft der Bildschirm kann.
import { T, HZ, SOLID, SHELF, LADDER, build, newWorld, step, tileAt, LIFT_H, freshSave, sanitizeSave, fmt } from './engine.js';
import { LEVELS } from './levels.js';

const $ = (id) => document.getElementById(id);
const app = $('app'), cv = $('game'), cx = cv.getContext('2d');
const DEBUG = /[?&]debug\b/.test(location.search);
const STORE = 'kruemel.v1';
const VIEW_W = 270;           // sichtbare Breite in Spiel-Pixeln (≈ 8,5 Kacheln) – passt für Hochformat

let save = freshSave();
try { save = sanitizeSave(JSON.parse(localStorage.getItem(STORE))); } catch { /* Privatmodus */ }
const persist = () => { try { localStorage.setItem(STORE, JSON.stringify(save)); } catch { /* voll oder gesperrt */ } };

// ---------------------------------------------------------------- Ton
const music = $('music');
music.volume = 0.35;
let actx = null;
function unlockAudio() {
  if (save.mute) return;
  try { actx ??= new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === 'suspended') actx.resume(); } catch { actx = null; }
}
function musicOn() { if (save.mute) { music.pause(); return; } const p = music.play(); if (p && p.catch) p.catch(() => {}); }
function beep(f0, f1, dur, type = 'square', vol = 0.06, delay = 0) {
  if (save.mute || !actx) return;
  const t = actx.currentTime + delay, o = actx.createOscillator(), g = actx.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(actx.destination); o.start(t); o.stop(t + dur + 0.02);
}
const SFX = {
  jump: () => beep(420, 760, 0.12, 'square', 0.035),
  crumb: () => { beep(1100, 1500, 0.06, 'triangle', 0.05); },
  gold: () => { beep(660, 990, 0.1, 'triangle', 0.08); beep(990, 1480, 0.16, 'triangle', 0.08, 0.1); },
  stomp: () => { beep(300, 120, 0.15, 'square', 0.06); beep(900, 1300, 0.08, 'triangle', 0.04, 0.05); },
  hit: () => beep(500, 140, 0.3, 'sawtooth', 0.05),
  fall: () => beep(700, 160, 0.4, 'triangle', 0.06),
  flag: () => { beep(520, 520, 0.08, 'triangle', 0.06); beep(780, 780, 0.12, 'triangle', 0.06, 0.08); },
  win: () => { [523, 659, 784, 1046].forEach((f, i) => beep(f, f, 0.16, 'triangle', 0.08, i * 0.12)); },
  land: () => beep(160, 90, 0.06, 'sine', 0.05),
};
function renderMute() {
  const on = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';
  const off = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16 9l5 6M21 9l-5 6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>';
  for (const b of [$('muteBtn'), $('muteBtn2')]) { b.innerHTML = save.mute ? off : on; b.setAttribute('aria-pressed', String(!save.mute)); }
}
function toggleMute() { save.mute = !save.mute; persist(); renderMute(); if (save.mute) music.pause(); else { unlockAudio(); if (mode === 'play' || mode === 'pause') musicOn(); } }

// ---------------------------------------------------------------- Zustand
let mode = 'menu';
let levelIdx = 0;
let L = build(LEVELS[levelIdx]);
let s = newWorld(L);
const cam = { x: 0, y: 0, look: 0 };
let particles = [];
let tipIdx = 0, tipTimer = 0;
let winDelay = 0;

function startLevel() {
  L = build(LEVELS[levelIdx]);
  s = newWorld(L);
  particles = []; tipIdx = 0; tipTimer = 0; winDelay = 0;
  snapCamera();
  $('tip').hidden = true;
  updateHud(true);
}

// ---------------------------------------------------------------- Steuerung
const keys = { left: false, right: false, jump: false };
const touch = { left: false, right: false, jump: false };
const input = () => ({ left: keys.left || touch.left, right: keys.right || touch.right, jump: keys.jump || touch.jump });
const KEYMAP = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', Space: 'jump', ArrowUp: 'jump', KeyW: 'jump' };
addEventListener('keydown', (e) => {
  const k = KEYMAP[e.code];
  if (k) { keys[k] = true; e.preventDefault(); app.classList.add('ctl-hidden'); }
  if ((e.code === 'Escape' || e.code === 'KeyP') && mode === 'play') pause();
  else if ((e.code === 'Escape' || e.code === 'KeyP') && mode === 'pause') resume();
});
addEventListener('keyup', (e) => { const k = KEYMAP[e.code]; if (k) keys[k] = false; });
addEventListener('blur', () => { keys.left = keys.right = keys.jump = false; });

// Steuerkreuz: ein Feld für links/rechts – der Finger darf zwischen den Hälften wechseln
const pad = $('pad'), padL = $('padL'), padR = $('padR'), jumpBtn = $('jump');
const padPointers = new Map();
function padUpdate() {
  const r = pad.getBoundingClientRect(), mid = r.left + r.width / 2;
  let l = false, rr = false;
  for (const x of padPointers.values()) { if (x < mid) l = true; else rr = true; }
  touch.left = l; touch.right = rr;
  padL.classList.toggle('on', l); padR.classList.toggle('on', rr);
}
pad.addEventListener('pointerdown', (e) => { e.preventDefault(); pad.setPointerCapture(e.pointerId); padPointers.set(e.pointerId, e.clientX); padUpdate(); });
pad.addEventListener('pointermove', (e) => { if (padPointers.has(e.pointerId)) { padPointers.set(e.pointerId, e.clientX); padUpdate(); } });
for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) pad.addEventListener(ev, (e) => { padPointers.delete(e.pointerId); padUpdate(); });
const jumpPointers = new Set();
jumpBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); jumpBtn.setPointerCapture(e.pointerId); jumpPointers.add(e.pointerId); touch.jump = true; jumpBtn.classList.add('on'); });
for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) jumpBtn.addEventListener(ev, (e) => { jumpPointers.delete(e.pointerId); touch.jump = jumpPointers.size > 0; jumpBtn.classList.toggle('on', touch.jump); });
addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch' || e.pointerType === 'pen') app.classList.remove('ctl-hidden'); }, true);
cv.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('gesturestart', (e) => e.preventDefault());

// ---------------------------------------------------------------- Menüs
function show(id) { for (const k of ['menu', 'pause', 'done']) $(k).hidden = k !== id; }
function play() { unlockAudio(); startLevel(); mode = 'play'; show(null); $('hud').hidden = false; musicOn(); if (matchMedia('(pointer:coarse)').matches) app.classList.remove('ctl-hidden'); }
function pause() { if (mode !== 'play') return; mode = 'pause'; show('pause'); music.pause(); clearTouch(); }
function resume() { unlockAudio(); mode = 'play'; show(null); musicOn(); }
function clearTouch() { padPointers.clear(); jumpPointers.clear(); touch.left = touch.right = touch.jump = false; padUpdate(); jumpBtn.classList.remove('on'); }
$('playBtn').onclick = play;
$('resumeBtn').onclick = resume;
$('restartBtn').onclick = () => { play(); };
$('retryBtn').onclick = () => { play(); };
$('pauseBtn').onclick = pause;
$('muteBtn').onclick = toggleMute; $('muteBtn2').onclick = toggleMute;
document.addEventListener('visibilitychange', () => { if (document.hidden) { if (mode === 'play') pause(); else music.pause(); } });
renderMute();
function showBest() {
  const b = save.best[levelIdx + 1];
  $('bestLine').hidden = !b;
  if (b) $('bestLine').textContent = `Deine Bestzeit: ${fmt(b.t)} · ${'★'.repeat(b.g)}${'☆'.repeat(3 - b.g)}`;
}
showBest();

function finish() {
  mode = 'done';
  const key = levelIdx + 1;
  const old = save.best[key];
  const rec = !old || s.t < old.t;
  save.best[key] = { t: rec ? s.t : old.t, c: Math.max(s.nCrumbs, old ? old.c : 0), g: Math.max(s.nGolds, old ? old.g : 0) };
  persist();
  $('record').hidden = !(rec && old);
  $('doneTime').textContent = fmt(s.t);
  $('doneCrumbs').textContent = `${s.nCrumbs}/${L.crumbs.length}`;
  $('doneResets').textContent = String(s.resets);
  [...$('stars').children].forEach((el, i) => el.classList.toggle('on', i < s.nGolds));
  show('done'); clearTouch(); showBest();
}

// ---------------------------------------------------------------- HUD
let hudCache = '';
function updateHud(force) {
  const secs = (s.t / HZ).toFixed(1).replace('.', ',');
  const k = s.nCrumbs + '|' + s.nGolds + '|' + secs;
  if (!force && k === hudCache) return;
  hudCache = k;
  $('crumbs').textContent = s.nCrumbs;
  [...$('golds').children].forEach((el, i) => el.classList.toggle('on', !!s.golds[i]));
  $('clock').textContent = secs;
}
function tips() {
  const p = s.p;
  if (tipTimer > 0 && --tipTimer === 0) $('tip').classList.add('away');
  while (tipIdx < L.tips.length && p.x + p.w / 2 >= L.tips[tipIdx].x) {
    const t = L.tips[tipIdx++];
    $('tipIcon').textContent = t.icon; $('tipText').textContent = t.text;
    const el = $('tip'); el.hidden = false; el.classList.remove('away');
    tipTimer = 200;
  }
}

// ---------------------------------------------------------------- Kamera
let vw = VIEW_W, vh = 500, scale = 1, dpr = 1;
function resize() {
  const r = app.getBoundingClientRect();
  dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
  scale = r.width / VIEW_W; vw = VIEW_W; vh = r.height / scale;
}
addEventListener('resize', resize);
resize();
// Krümel steht im linken Drittel (Blick nach rechts), etwas über der Mitte (unten liegen die Tasten)
function camTarget() {
  const p = s.p;
  const tx = p.x + p.w / 2 - vw * 0.36 + cam.look;
  const ty = p.y + p.h / 2 - vh * 0.5;
  return { tx, ty };
}
function clampCam() {
  cam.x = Math.max(0, Math.min(L.w * T - vw, cam.x));
  const maxY = L.h * T - vh;
  cam.y = maxY < 0 ? maxY : Math.max(0, Math.min(maxY, cam.y));
}
function snapCamera() { cam.look = 0; const { tx, ty } = camTarget(); cam.x = tx; cam.y = ty; clampCam(); }
function updateCamera() {
  const p = s.p;
  // Vorausblick in Laufrichtung, weich
  const want = p.face > 0 ? 12 : -60;
  cam.look += (want - cam.look) * 0.03;
  const { tx, ty } = camTarget();
  cam.x += (tx - cam.x) * 0.12;
  // senkrecht: am Boden/Leiter zügig nachziehen, im Sprung ruhig bleiben, beim Fallen mitgehen
  const sy = p.y + p.h / 2 - cam.y;
  let k = p.ground || p.ladder ? 0.08 : 0.025;
  if (sy > vh * 0.68 || sy < vh * 0.2) k = 0.2;
  cam.y += (ty - cam.y) * k;
  clampCam();
}

// ---------------------------------------------------------------- Partikel
function puff(x, y, n, color, spd = 1.6) {
  for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, v = spd * (0.4 + Math.random()); particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 0.8, life: 30 + Math.random() * 20, color, r: 2 + Math.random() * 2.5 }); }
}
function handleEvents(ev) {
  const p = s.p, px = p.x + p.w / 2, py = p.y + p.h / 2;
  for (const e of ev) {
    if (e === 'jump') SFX.jump();
    else if (e === 'crumb') { SFX.crumb(); puff(px, py, 5, '#e2a64a', 1.2); }
    else if (e === 'gold') { SFX.gold(); puff(px, py, 16, '#FFD21C', 2.4); }
    else if (e === 'stomp') { SFX.stomp(); puff(px, p.y + p.h, 12, '#ffffff', 2); if (navigator.vibrate) navigator.vibrate(15); }
    else if (e === 'hit') { SFX.hit(); if (navigator.vibrate) navigator.vibrate(40); }
    else if (e === 'fall') SFX.fall();
    else if (e === 'flag') { SFX.flag(); puff(px, py - 10, 10, '#FF9200', 1.8); }
    else if (e === 'land') SFX.land();
    else if (e === 'respawn') { snapCamera(); puff(px, py, 10, '#ffffff', 1.4); }
    else if (e === 'win') { SFX.win(); puff(L.goal.x, L.goal.y - 30, 30, '#FFD21C', 3); winDelay = 70; }
  }
}

// ---------------------------------------------------------------- Zeichnen (Platzhalter bis die ChatGPT-Grafiken da sind)
function rr(x, y, w, h, r) { cx.beginPath(); cx.roundRect ? cx.roundRect(x, y, w, h, r) : cx.rect(x, y, w, h); }
function drawBackground() {
  const H = vh;
  const g = cx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#f7ead0'); g.addColorStop(1, '#efd9b2');
  cx.fillStyle = g; cx.fillRect(0, 0, vw, H);
  // Wand mit Parallaxe: Fliesenspiegel, Fenster, Hängeschränke
  const px = cam.x * 0.45, py = cam.y * 0.45;
  cx.save(); cx.translate(-px, -py);
  const x0 = Math.floor(px / 220) - 1, x1 = Math.floor((px + vw) / 220) + 1;
  for (let i = x0; i <= x1; i++) {
    const bx = i * 220;
    const seed = Math.abs(Math.sin(i * 12.9898) * 43758.5453) % 1;
    // Fliesenspiegel
    cx.fillStyle = '#e8f1ef'; cx.fillRect(bx, 330, 220, 110);
    cx.strokeStyle = 'rgba(120,150,150,.25)'; cx.lineWidth = 1;
    for (let yy = 330; yy <= 440; yy += 22) { cx.beginPath(); cx.moveTo(bx, yy); cx.lineTo(bx + 220, yy); cx.stroke(); }
    for (let xx = 0; xx <= 220; xx += 22) { cx.beginPath(); cx.moveTo(bx + xx, 330); cx.lineTo(bx + xx, 440); cx.stroke(); }
    if (seed < 0.45) {
      // Fenster
      cx.fillStyle = '#fff'; rr(bx + 50, 130, 120, 150, 8); cx.fill();
      const sky = cx.createLinearGradient(0, 140, 0, 270); sky.addColorStop(0, '#a9dcf2'); sky.addColorStop(1, '#dff3fb');
      cx.fillStyle = sky; cx.fillRect(bx + 58, 138, 104, 134);
      cx.fillStyle = '#fff'; cx.fillRect(bx + 107, 138, 6, 134); cx.fillRect(bx + 58, 202, 104, 6);
      cx.fillStyle = 'rgba(255,146,0,.25)'; cx.fillRect(bx + 40, 120, 18, 170); cx.fillRect(bx + 162, 120, 18, 170);
    } else {
      // Hängeschrank
      cx.fillStyle = '#dcb98a'; rr(bx + 30, 90, 160, 170, 6); cx.fill();
      cx.strokeStyle = 'rgba(94,52,21,.25)'; cx.lineWidth = 2; cx.beginPath(); cx.moveTo(bx + 110, 96); cx.lineTo(bx + 110, 254); cx.stroke();
      cx.fillStyle = 'rgba(94,52,21,.35)'; cx.fillRect(bx + 98, 200, 4, 22); cx.fillRect(bx + 118, 200, 4, 22);
    }
  }
  cx.restore();
}

function drawTiles() {
  const tx0 = Math.max(0, Math.floor(cam.x / T)), tx1 = Math.min(L.w - 1, Math.floor((cam.x + vw) / T));
  const ty0 = Math.max(0, Math.floor(cam.y / T)), ty1 = Math.min(L.h - 1, Math.floor((cam.y + vh) / T));
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
    const k = tileAt(L, tx, ty); if (!k) continue;
    const x = tx * T, y = ty * T;
    if (k === SOLID) {
      const topOpen = ty === 0 || tileAt(L, tx, ty - 1) !== SOLID;
      if (ty >= L.floor) {
        cx.fillStyle = (tx + ty) % 2 ? '#e7d3b4' : '#d6bb93'; cx.fillRect(x, y, T, T);
        if (topOpen) { cx.fillStyle = '#b48a5a'; cx.fillRect(x, y, T, 4); }
      } else {
        cx.fillStyle = '#c98b4f'; cx.fillRect(x, y, T, T);
        cx.strokeStyle = 'rgba(94,52,21,.28)'; cx.lineWidth = 2; cx.strokeRect(x + 3, y + (topOpen ? 10 : 3), T - 6, T - (topOpen ? 13 : 6));
        if (topOpen) { cx.fillStyle = '#f1e6d2'; cx.fillRect(x, y, T, 8); cx.fillStyle = '#c9b493'; cx.fillRect(x, y + 7, T, 2); }
        const leftOpen = tileAt(L, tx - 1, ty) !== SOLID, rightOpen = tileAt(L, tx + 1, ty) !== SOLID;
        cx.fillStyle = 'rgba(60,30,10,.35)';
        if (leftOpen) cx.fillRect(x, y, 2, T);
        if (rightOpen) cx.fillRect(x + T - 2, y, 2, T);
      }
    } else if (k === SHELF) {
      cx.fillStyle = '#a8692f'; rr(x - 1, y, T + 2, 8, 2); cx.fill();
      cx.fillStyle = '#c98b4f'; cx.fillRect(x - 1, y, T + 2, 3);
      if (tileAt(L, tx - 1, ty) !== SHELF || tileAt(L, tx + 1, ty) !== SHELF) {
        // Halter an den Enden
        const hx = tileAt(L, tx - 1, ty) !== SHELF ? x + 6 : x + T - 10;
        cx.fillStyle = '#7d7d86'; cx.beginPath(); cx.moveTo(hx, y + 8); cx.lineTo(hx + 4, y + 8); cx.lineTo(hx + 4, y + 22); cx.closePath(); cx.fill();
      }
    } else if (k === LADDER) {
      // Kochlöffel: Stiel mit Kerben, oben die Kelle
      const mx = x + T / 2;
      cx.fillStyle = '#e0b077'; rr(mx - 5, y, 10, T, 3); cx.fill();
      cx.fillStyle = 'rgba(122,74,36,.45)'; for (let i = 6; i < T; i += 10) cx.fillRect(mx - 5, y + i, 10, 2);
      if (tileAt(L, tx, ty - 1) !== LADDER) {
        cx.fillStyle = '#d9a466'; cx.beginPath(); cx.ellipse(mx, y - 10, 10, 14, 0, 0, Math.PI * 2); cx.fill();
        cx.fillStyle = 'rgba(122,74,36,.25)'; cx.beginPath(); cx.ellipse(mx, y - 11, 6, 9, 0, 0, Math.PI * 2); cx.fill();
      }
    }
  }
}

function drawLifts() {
  for (const lf of s.lifts) {
    // Führungsschiene zeigt den festen Weg
    cx.strokeStyle = 'rgba(94,52,21,.25)'; cx.lineWidth = 3; cx.setLineDash([6, 6]);
    cx.beginPath(); cx.moveTo(lf.x + lf.w / 2, lf.high); cx.lineTo(lf.x + lf.w / 2, lf.low + 24); cx.stroke(); cx.setLineDash([]);
    const y = lf.y;
    cx.fillStyle = '#b97a3e'; rr(lf.x, y, lf.w, 26, 4); cx.fill();
    cx.fillStyle = '#d99c5c'; cx.fillRect(lf.x + 2, y, lf.w - 4, LIFT_H - 4);
    cx.fillStyle = '#8a5428'; rr(lf.x + lf.w / 2 - 10, y + 15, 20, 5, 2); cx.fill();
  }
}

function drawCrumb(x, y, t) {
  const b = Math.sin(t / 12 + x) * 2;
  cx.fillStyle = '#d99a3e'; cx.beginPath(); cx.ellipse(x, y + b, 6, 5, 0.3, 0, Math.PI * 2); cx.fill();
  cx.fillStyle = '#f2c46c'; cx.beginPath(); cx.ellipse(x - 2, y - 2 + b, 2.5, 2, 0, 0, Math.PI * 2); cx.fill();
}
function drawCheese(x, y, size, glow, t) {
  const b = Math.sin(t / 15) * 2;
  if (glow) { cx.fillStyle = `rgba(255,210,28,${0.25 + 0.15 * Math.sin(t / 8)})`; cx.beginPath(); cx.arc(x, y + b, size * 1.25, 0, Math.PI * 2); cx.fill(); }
  cx.save(); cx.translate(x, y + b);
  cx.fillStyle = glow ? '#FFD21C' : '#ffd95e'; cx.strokeStyle = '#b8650d'; cx.lineWidth = 2;
  cx.beginPath(); cx.moveTo(-size, size * 0.6); cx.lineTo(size, size * 0.6); cx.lineTo(size, -size * 0.3); cx.lineTo(-size, size * 0.1); cx.closePath(); cx.fill(); cx.stroke();
  cx.fillStyle = '#e8a91e'; cx.beginPath(); cx.arc(-size * 0.3, size * 0.32, size * 0.15, 0, 7); cx.arc(size * 0.45, size * 0.15, size * 0.12, 0, 7); cx.fill();
  cx.restore();
}
function drawFlag(f, on) {
  cx.fillStyle = '#e2c79b'; cx.fillRect(f.x - 1.5, f.y - 46, 3, 46);
  cx.fillStyle = on ? '#FF9200' : '#bfb3a0';
  cx.beginPath(); cx.moveTo(f.x + 1.5, f.y - 46); cx.lineTo(f.x + 24, f.y - 39 + (on ? Math.sin(s.t / 6) * 2 : 0)); cx.lineTo(f.x + 1.5, f.y - 31); cx.closePath(); cx.fill();
}
function drawGoal(g, t) {
  cx.fillStyle = '#fff'; cx.beginPath(); cx.ellipse(g.x, g.y - 3, 26, 5, 0, 0, Math.PI * 2); cx.fill();
  cx.strokeStyle = '#d9cfc0'; cx.lineWidth = 2; cx.stroke();
  drawCheese(g.x, g.y - 16, 13, true, t);
  cx.fillStyle = 'rgba(200,235,255,.35)'; cx.strokeStyle = 'rgba(255,255,255,.9)'; cx.lineWidth = 2;
  cx.beginPath(); cx.moveTo(g.x - 22, g.y - 4); cx.lineTo(g.x - 22, g.y - 30); cx.quadraticCurveTo(g.x - 22, g.y - 52, g.x, g.y - 52); cx.quadraticCurveTo(g.x + 22, g.y - 52, g.x + 22, g.y - 30); cx.lineTo(g.x + 22, g.y - 4); cx.fill(); cx.stroke();
  cx.fillStyle = '#fff'; cx.beginPath(); cx.arc(g.x, g.y - 55, 4, 0, 7); cx.fill();
}

function drawCat(c) {
  if (c.state === 'gone') return;
  const fleeing = c.state === 'flee';
  const x = c.x + c.w / 2, y = c.y + c.h;
  const dir = c.vx > 0 ? 1 : -1;
  cx.save(); cx.translate(x, y);
  if (fleeing) { cx.globalAlpha = Math.max(0, 1 - c.t / 50); cx.rotate(dir * c.t * 0.05); }
  cx.scale(dir, 1);
  const step = Math.sin(c.t / 5) * (fleeing ? 0 : 2);
  // Schwanz
  cx.strokeStyle = '#e8822e'; cx.lineWidth = 4; cx.lineCap = 'round';
  cx.beginPath(); cx.moveTo(-11, -10); cx.quadraticCurveTo(-22, -14, -18, -26 + step); cx.stroke();
  // Körper
  cx.fillStyle = '#f39a40'; cx.beginPath(); cx.ellipse(-2, -9, 13, 8, 0, 0, Math.PI * 2); cx.fill();
  cx.fillStyle = '#e8822e'; cx.fillRect(-8, -15, 3, 8); cx.fillRect(-2, -16, 3, 8);
  // Beine
  cx.fillStyle = '#f39a40'; cx.fillRect(-10, -4, 4, 4 + step * 0.5); cx.fillRect(4, -4, 4, 4 - step * 0.5);
  // Kopf
  cx.beginPath(); cx.arc(10, -15, 8, 0, Math.PI * 2); cx.fill();
  cx.beginPath(); cx.moveTo(4, -20); cx.lineTo(6, -28); cx.lineTo(10, -22); cx.fill();
  cx.beginPath(); cx.moveTo(11, -22); cx.lineTo(15, -28); cx.lineTo(17, -19); cx.fill();
  cx.fillStyle = '#fff'; cx.beginPath(); cx.ellipse(12, -15, fleeing ? 3.5 : 2.6, fleeing ? 3.5 : 3, 0, 0, 7); cx.fill();
  cx.fillStyle = '#2a1a0e'; cx.beginPath(); cx.arc(13, -15, fleeing ? 1.2 : 1.6, 0, 7); cx.fill();
  cx.fillStyle = '#ff8fa8'; cx.beginPath(); cx.arc(17.5, -12.5, 1.6, 0, 7); cx.fill();
  cx.restore();
}

function drawMouse() {
  const p = s.p;
  if (p.invuln > 0 && Math.floor(p.invuln / 4) % 2 === 0) return;
  const x = p.x + p.w / 2, y = p.y + p.h;
  cx.save(); cx.translate(x, y);
  // Quetschen und Strecken
  let sx = 1, sy = 1;
  if (!p.ground && !p.ladder) { const k = Math.min(0.18, Math.abs(p.vy) * 0.02); sx = 1 - k; sy = 1 + k; }
  if (p.landT > 0) { const k = p.landT / 8 * 0.22; sx = 1 + k; sy = 1 - k; }
  if (p.freeze > 0 && p.freezeKind === 'hit') cx.rotate(Math.sin(s.t * 0.6) * 0.3);
  cx.scale(sx * (p.ladder ? 1 : p.face), sy);
  const run = p.ground && Math.abs(p.vx) > 0.3;
  const bob = run ? Math.abs(Math.sin(p.runT / 9)) * 1.5 : 0;
  cx.translate(0, -bob);
  const legA = run ? Math.sin(p.runT / 9) * 3 : 0;
  // Schwanz
  cx.strokeStyle = '#c9a2a2'; cx.lineWidth = 2.2; cx.lineCap = 'round';
  cx.beginPath(); cx.moveTo(-9, -6); cx.bezierCurveTo(-18, -4, -20, -16, -26, -12 + Math.sin(s.t / 8) * 2); cx.stroke();
  // Füße
  cx.fillStyle = '#f0b5b5';
  cx.beginPath(); cx.ellipse(-4 + legA, -1, 3.5, 2, 0, 0, 7); cx.fill();
  cx.beginPath(); cx.ellipse(5 - legA, -1, 3.5, 2, 0, 0, 7); cx.fill();
  // Körper
  cx.fillStyle = '#9b8573'; cx.beginPath(); cx.ellipse(0, -10, 11, 9.5, 0, 0, Math.PI * 2); cx.fill();
  cx.fillStyle = '#c9b8a6'; cx.beginPath(); cx.ellipse(3, -7, 6, 5, 0, 0, Math.PI * 2); cx.fill();
  if (p.ladder) {
    // Rückenansicht beim Klettern: Ohren, Schwanz, Halstuch
    cx.fillStyle = '#9b8573'; cx.beginPath(); cx.arc(-7, -21, 6, 0, 7); cx.arc(7, -21, 6, 0, 7); cx.fill();
    cx.fillStyle = '#FF9200'; cx.fillRect(-8, -15, 16, 3);
    cx.fillStyle = '#f0b5b5'; const a = Math.sin(s.t / 5) * 3;
    cx.beginPath(); cx.arc(-9, -18 + a, 2.5, 0, 7); cx.arc(9, -18 - a, 2.5, 0, 7); cx.fill();
    cx.restore(); return;
  }
  // Ohr
  cx.fillStyle = '#9b8573'; cx.beginPath(); cx.arc(1, -20, 7, 0, 7); cx.fill();
  cx.fillStyle = '#f2a9b4'; cx.beginPath(); cx.arc(1.5, -20, 4.5, 0, 7); cx.fill();
  // Kopf nach vorn
  cx.fillStyle = '#9b8573'; cx.beginPath(); cx.ellipse(8, -12, 6.5, 5.5, 0.2, 0, 7); cx.fill();
  cx.beginPath(); cx.moveTo(12, -15); cx.lineTo(17, -11); cx.lineTo(12, -9); cx.fill();
  cx.fillStyle = '#f07a8a'; cx.beginPath(); cx.arc(16.5, -11, 1.8, 0, 7); cx.fill();
  // Auge
  const blink = (s.t % 180) < 6;
  cx.fillStyle = '#1d120a';
  if (blink || (p.freeze > 0 && p.freezeKind === 'hit')) { cx.fillRect(7, -14, 4, 1.4); }
  else { cx.beginPath(); cx.arc(9, -13.5, 2.3, 0, 7); cx.fill(); cx.fillStyle = '#fff'; cx.beginPath(); cx.arc(9.8, -14.3, 0.8, 0, 7); cx.fill(); }
  // Halstuch
  cx.fillStyle = '#FF9200'; cx.beginPath(); cx.moveTo(1, -8); cx.lineTo(9, -7); cx.lineTo(4, -3); cx.closePath(); cx.fill();
  cx.restore();
}

function drawParticles() {
  for (const q of particles) { cx.globalAlpha = Math.max(0, q.life / 40); cx.fillStyle = q.color; cx.beginPath(); cx.arc(q.x, q.y, q.r, 0, 7); cx.fill(); }
  cx.globalAlpha = 1;
}

function render() {
  cx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
  drawBackground();
  cx.save(); cx.translate(-Math.round(cam.x * scale) / scale, -Math.round(cam.y * scale) / scale);
  drawTiles();
  drawLifts();
  L.flags.forEach((f, i) => drawFlag(f, s.flagHit[i]));
  L.crumbs.forEach((c, i) => { if (!s.crumbs[i]) drawCrumb(c.x, c.y, s.t); });
  L.golds.forEach((g, i) => { if (!s.golds[i]) drawCheese(g.x, g.y, 10, true, s.t + i * 20); });
  drawGoal(L.goal, s.t);
  s.cats.forEach(drawCat);
  drawMouse();
  drawParticles();
  if (DEBUG) {
    cx.strokeStyle = 'red'; cx.lineWidth = 1; cx.strokeRect(s.p.x, s.p.y, s.p.w, s.p.h);
    for (const c of s.cats) cx.strokeRect(c.x + 3, c.y + 4, c.w - 6, c.h - 4);
  }
  cx.restore();
}

// ---------------------------------------------------------------- Schleife (fester Takt)
let last = performance.now(), acc = 0;
function frame(now) {
  const dt = Math.min(100, now - last); last = now;
  if (mode === 'play') {
    acc += dt;
    let n = 0;
    while (acc >= 1000 / HZ && n < 5) {
      acc -= 1000 / HZ; n++;
      const ev = step(s, input());
      if (ev.length) handleEvents(ev);
      for (const q of particles) { q.x += q.vx; q.y += q.vy; q.vy += 0.08; q.life--; }
      particles = particles.filter((q) => q.life > 0);
      updateCamera();
      tips();
      if (winDelay > 0 && --winDelay === 0) finish();
    }
    if (n === 5) acc = 0;
    updateHud();
  } else { acc = 0; if (mode === 'menu') { s.t++; } }
  render();
  requestAnimationFrame(frame);
}
snapCamera();
requestAnimationFrame(frame);

// Für Browser-Tests
window.__kruemel = { get s() { return s; }, get mode() { return mode; }, keys, cam };
