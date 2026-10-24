// Krümel – Oberfläche: Zeichnen (Platzhalter-Grafik), Kamera, Steuerung, Ton, Menüs.
// Regeln/Physik stehen in engine.js. Fester 60-Hz-Takt, gezeichnet wird so oft der Bildschirm kann.
import { T, HZ, SOLID, SHELF, LADDER, SUGAR, BELT_L, BELT_R, SPONGE, CAKE, dripAt, build, newWorld, step, tileAt, LIFT_H, freshSave, sanitizeSave, fmt, points } from './engine.js?v=5';
import { LEVELS } from './levels.js?v=5';

const $ = (id) => document.getElementById(id);
const app = $('app'), cv = $('game'), cx = cv.getContext('2d');
const DEBUG = /[?&]debug\b/.test(location.search);
const STORE = 'kruemel.v1';
const VIEW_W = 270;           // sichtbare Breite in Spiel-Pixeln (≈ 8,5 Kacheln) – passt für Hochformat

let save = freshSave();
try { save = sanitizeSave(JSON.parse(localStorage.getItem(STORE)), LEVELS.length); } catch { /* Privatmodus */ }
const persist = () => { try { localStorage.setItem(STORE, JSON.stringify(save)); } catch { /* voll oder gesperrt */ } };

// ---------------------------------------------------------------- Bilder (ChatGPT-Grafiken; fehlt eins, zeichnet das Spiel den Platzhalter)
const IMG = {};
for (const n of ['schlafkater-0', 'schlafkater-1', 'schlafkater-2', 'schale-a', 'schale-b', 'linse-0', 'linse-1', 'linse-2', 'linse-3', 'linse-4',
  'cookie', 'cookie-riss', 'cookie-krumen', 'kaese-station', 'minze', 'kammer-hintergrund', 'kueche-hintergrund',
  ...['stehen', 'lauf-0', 'lauf-1', 'lauf-2', 'lauf-3', 'sprung', 'klettern', 'autsch'].flatMap((n) => ['maus-klein-' + n, 'maus-gross-' + n]),
  'kaetzchen-0', 'kaetzchen-1', 'kaetzchen-2', 'kaetzchen-flucht', 'kruemel', 'goldkaese', 'fahne-zu', 'fahne-auf', 'kaeseglocke', 'zucker',
  'regalbrett', 'kochloeffel', 'schublade', 'schrank', 'arbeitsplatte', 'fliese', 'keller-hintergrund', 'garten-hintergrund']) {
  const im = new Image(); im.decoding = 'async'; im.src = `kruemel/img/${n}.webp?v=5`; IMG[n] = im;
}
const ok = (n) => { const im = IMG[n]; return im && im.complete && im.naturalWidth > 0 ? im : null; };
// Bild mit Fußpunkt (x = Mitte, y = Unterkante) und Zielhöhe zeichnen; flip spiegelt waagerecht
function sprite(im, x, y, h, flip = false) {
  const w = h * im.naturalWidth / im.naturalHeight;
  if (flip) { cx.save(); cx.translate(x, 0); cx.scale(-1, 1); cx.drawImage(im, -w / 2, y - h, w, h); cx.restore(); }
  else cx.drawImage(im, x - w / 2, y - h, w, h);
}

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
  choc: () => { beep(880, 1320, 0.07, 'triangle', 0.06); beep(1320, 1760, 0.08, 'triangle', 0.05, 0.06); },
  grow: () => { [330, 440, 554, 660].forEach((f, i) => beep(f, f * 1.05, 0.09, 'square', 0.04, i * 0.06)); },
  shrink: () => { [660, 554, 440, 330].forEach((f, i) => beep(f, f * 0.95, 0.08, 'triangle', 0.05, i * 0.05)); },
  ouch: () => { beep(600, 200, 0.25, 'square', 0.05); },
  brk: () => { beep(1400, 500, 0.08, 'square', 0.04); beep(900, 300, 0.1, 'triangle', 0.04, 0.03); },
  crack: () => beep(1800, 900, 0.05, 'square', 0.025),
  crumble: () => beep(500, 120, 0.18, 'sawtooth', 0.035),
  scale: () => { beep(200, 400, 0.4, 'triangle', 0.06); },
  wake: () => beep(300, 520, 0.25, 'sawtooth', 0.04),
  hiss: () => { beep(2200, 1500, 0.25, 'sawtooth', 0.025); },
  nope: () => beep(240, 200, 0.15, 'square', 0.04),
  boing: () => beep(220, 880, 0.18, 'sine', 0.07),
  balloon: () => beep(500, 700, 0.15, 'triangle', 0.05),
  powder: () => beep(1200, 400, 0.12, 'sawtooth', 0.02),
  yarn: () => beep(700, 900, 0.08, 'triangle', 0.05),
  wildYarn: () => { beep(900, 500, 0.15, 'square', 0.04); beep(500, 1100, 0.15, 'triangle', 0.04, 0.12); },
  hose: () => beep(2000, 1000, 0.35, 'sawtooth', 0.025),
  free: () => { [660, 880, 1100].forEach((f, i) => beep(f, f, 0.1, 'triangle', 0.06, i * 0.08)); },
  cake: () => { [392, 523, 659, 784, 1046].forEach((f, i) => beep(f, f, 0.12, 'triangle', 0.07, i * 0.09)); },
  hole: () => { beep(900, 300, 0.12, 'triangle', 0.05); beep(300, 900, 0.12, 'triangle', 0.05, 0.12); },
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
let trail = [], prints = [], hoseT = 0, hoseFrom = null;   // Mäusefreunde laufen der Spur nach, Backpulver-Fußabdrücke, Wasserstrahl

function startLevel(idx = levelIdx) {
  levelIdx = Math.max(0, Math.min(LEVELS.length - 1, idx));
  L = build(LEVELS[levelIdx]);
  s = newWorld(L);
  particles = []; tipIdx = 0; tipTimer = 0; winDelay = 0; trail = []; prints = []; hoseT = 0;
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
function show(id) { for (const k of ['menu', 'levels', 'pause', 'done']) $(k).hidden = k !== id; }
function play(idx = levelIdx) { unlockAudio(); startLevel(idx); mode = 'play'; show(null); $('hud').hidden = false; musicOn(); if (matchMedia('(pointer:coarse)').matches) app.classList.remove('ctl-hidden'); }
function nextOpen() { for (let i = 0; i < LEVELS.length; i++) if (!save.best[i + 1]) return Math.min(i, save.unlocked - 1); return LEVELS.length - 1; }
function renderMenu() {
  levelIdx = nextOpen();
  $('playLabel').textContent = save.best[1] ? `Weiter: Level ${levelIdx + 1}` : 'Spielen';
}
function renderGrid() {
  const g = $('grid'); g.innerHTML = '';
  LEVELS.forEach((lv, i) => {
    const b = document.createElement('button');
    const best = save.best[i + 1];
    b.disabled = i + 1 > save.unlocked;
    b.className = best ? 'done' : (i + 1 === save.unlocked ? 'next' : '');
    b.innerHTML = `${i + 1}<small>${best ? '★'.repeat(best.g) + '☆'.repeat(3 - best.g) : ''}</small>`;
    b.title = lv.name;
    b.setAttribute('aria-label', `Level ${i + 1}: ${lv.name}`);
    b.onclick = () => play(i);
    g.appendChild(b);
  });
}
function openLevels() { renderGrid(); mode = mode === 'play' ? 'pause' : mode; show('levels'); }
function pause() { if (mode !== 'play') return; mode = 'pause'; show('pause'); music.pause(); clearTouch(); }
function resume() { unlockAudio(); mode = 'play'; show(null); musicOn(); }
function clearTouch() { padPointers.clear(); jumpPointers.clear(); touch.left = touch.right = touch.jump = false; padUpdate(); jumpBtn.classList.remove('on'); }
$('playBtn').onclick = () => play(levelIdx);
$('levelsBtn').onclick = openLevels;
$('pauseLevels').onclick = openLevels;
$('doneLevels').onclick = openLevels;
$('levelsBack').onclick = () => { if (mode === 'pause') show('pause'); else if (mode === 'done') show('done'); else show('menu'); };
$('nextBtn').onclick = () => play(levelIdx + 1);
$('resumeBtn').onclick = resume;
$('restartBtn').onclick = () => { play(levelIdx); };
$('retryBtn').onclick = () => { play(levelIdx); };
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
renderMenu();

// Hinweis aufs Konto: nur ohne Anmeldung und erst, wenn es etwas zu verlieren gibt (ab 2 geschafften Leveln)
function kontoHinweis(id) {
  const P = window.PlaySaal;
  const n = Object.keys(save.best).length;
  // nach dem Level nur an Meilensteinen, im Menü immer (ab 2 Leveln)
  const meilenstein = id === 'kontoBoxMenu' || [2, 5, 10, 15, 20, 30, 40, 50, 60].includes(n);
  const zeigen = !!(P && P.hostOk && !P.user() && n >= 2 && meilenstein);
  if (zeigen && n >= 5) $(id).querySelector('span').textContent = `Du hast schon ${n} Level geschafft – sichere deinen Fortschritt mit einem kostenlosen PlaySaal-Konto, dann geht nichts verloren. (ab 16 Jahren)`;
  $(id).hidden = !zeigen;
}
function kontoAnlegen() { try { window.PlaySaal && window.PlaySaal.anmelden({}); } catch { /* Konten nicht verfügbar */ } }
$('kontoBtn').onclick = kontoAnlegen;
$('kontoBtnMenu').onclick = kontoAnlegen;
setTimeout(() => kontoHinweis('kontoBoxMenu'), 1500);   // playsaal.js lädt verzögert

function finish() {
  mode = 'done';
  const key = levelIdx + 1;
  const old = save.best[key];
  const rec = !old || s.t < old.t;
  save.best[key] = { t: rec ? s.t : old.t, c: Math.max(points(s), old ? old.c : 0), g: Math.max(s.nGolds, old ? old.g : 0) };
  save.unlocked = Math.max(save.unlocked, Math.min(LEVELS.length, key + 1));
  persist();
  const last = levelIdx >= LEVELS.length - 1;
  $('nextBtn').hidden = last;
  $('doneNote').hidden = !last;
  $('doneNote').textContent = `Alle ${LEVELS.length} Level geschafft – du bist der Käsejagd-Champion!`;
  $('record').hidden = !(rec && old);
  $('doneTime').textContent = fmt(s.t);
  $('doneCrumbs').textContent = String(points(s));
  $('doneResets').textContent = String(s.resets);
  [...$('stars').children].forEach((el, i) => el.classList.toggle('on', i < s.nGolds));
  show('done'); clearTouch(); showBest(); kontoHinweis('kontoBox');
}

// ---------------------------------------------------------------- HUD
let hudCache = '';
function updateHud(force) {
  const secs = (s.t / HZ).toFixed(1).replace('.', ',');
  const k = points(s) + '|' + s.nGolds + '|' + secs + '|' + levelIdx;
  if (!force && k === hudCache) return;
  hudCache = k;
  $('lvl').textContent = levelIdx + 1;
  $('crumbs').textContent = points(s);
  [...$('golds').children].forEach((el, i) => el.classList.toggle('on', !!s.golds[i]));
  $('clock').textContent = secs;
}
function showTip(icon, text, time = 200) {
  $('tipIcon').textContent = icon; $('tipText').textContent = text;
  const el = $('tip'); el.hidden = false; el.classList.remove('away');
  tipTimer = time;
}
function tips() {
  const p = s.p;
  if (tipTimer > 0 && --tipTimer === 0) $('tip').classList.add('away');
  while (tipIdx < L.tips.length && p.x + p.w / 2 >= L.tips[tipIdx].x) { const t = L.tips[tipIdx++]; showTip(t.icon, t.text); }
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
    else if (e === 'choc') { SFX.choc(); puff(px, py, 8, ['#e8463c', '#3f8ff0', '#ffd21c', '#4cbf5a', '#ff8fd0'][Math.floor(Math.random() * 5)], 1.6); }
    else if (e === 'grow') { SFX.grow(); puff(px, py, 14, '#FFD21C', 2.2); }
    else if (e === 'shrink') { SFX.shrink(); puff(px, py, 12, '#7fd8a0', 2); }
    else if (e === 'ouch') { SFX.ouch(); puff(px, py, 10, '#ffffff', 2); if (navigator.vibrate) navigator.vibrate(30); }
    else if (e === 'break') { SFX.brk(); puff(px + p.face * 16, py, 10, '#ffffff', 2.4); }
    else if (e === 'crack') SFX.crack();
    else if (e === 'crumble') SFX.crumble();
    else if (e === 'scale') SFX.scale();
    else if (e === 'light') { SFX.nope(); showTip('⚖️', 'Zu leicht! Erst Käse essen.', 150); }
    else if (e === 'tight') { SFX.nope(); showTip('🧀', 'Zu eng zum Wachsen – erst raus hier!', 120); }
    else if (e === 'wake') { SFX.wake(); showTip('😾', 'Oh nein, der Kater ist wach! Kurz warten …', 150); }
    else if (e === 'hiss') SFX.hiss();
    else if (e === 'boing') { SFX.boing(); puff(px, p.y + p.h, 8, '#ffe066', 1.6); }
    else if (e === 'balloon') SFX.balloon();
    else if (e === 'powder') { SFX.powder(); puff(px, p.y + p.h, 12, '#ffffff', 1.6); showTip('🧁', 'Backpulver! Kurz langsamer …', 100); }
    else if (e === 'yarn') { SFX.yarn(); showTip('🧶', 'Wollknäuel dabei – ab zur wilden Katze!', 110); }
    else if (e === 'wildYarn') { SFX.wildYarn(); puff(px + p.face * 60, py, 10, '#e8463c', 2); }
    else if (e === 'hose') { SFX.hose(); hoseT = 50; hoseFrom = L.taps.reduce((a, t) => (Math.abs(t.x - px) < Math.abs(a.x - px) ? t : a)); }
    else if (e === 'wildHiss') { SFX.hiss(); if (tipTimer === 0) showTip('😼', L.yarns.length ? 'Faucht! Erst das Wollknäuel holen' : 'Faucht! Erst den Wasserhahn antreten', 120); }
    else if (e === 'free') { SFX.free(); puff(px, py, 14, '#ffd21c', 2); showTip('🐭', `Mäusefreund befreit! (${s.freed})`, 110); }
    else if (e === 'cake') { SFX.cake(); puff(px + 40, py, 30, '#ff8fb1', 3); showTip('🎂', 'Mampf! Alle zusammen futtern einen Tunnel', 120); }
    else if (e === 'cakeNeed') { SFX.nope(); const k = L.cakes[0]; showTip('🎂', `Zu viel Kuchen! Du brauchst ${k.need} Mäusefreunde (${s.freed}/${k.need})`, 150); }
    else if (e === 'caught') showTip('👑', 'Fürst Fauch hat dich erwischt – weiter geht’s am Fähnchen!', 120);
    else if (e === 'hole') { SFX.hole(); puff(p.x + p.w / 2, p.y + p.h - 6, 8, '#8a6a4a', 1.4); }
    else if (e === 'holeBig') { SFX.nope(); showTip('🕳️', 'Zu groß fürs Mauseloch – erst Minze!', 130); }
    else if (e === 'win') { SFX.win(); puff(L.goal.x, L.goal.y - 30, 30, '#FFD21C', 3); winDelay = 70; }
  }
}

// ---------------------------------------------------------------- Zeichnen (Platzhalter bis die ChatGPT-Grafiken da sind)
function rr(x, y, w, h, r) { cx.beginPath(); cx.roundRect ? cx.roundRect(x, y, w, h, r) : cx.rect(x, y, w, h); }
const THEMES = {
  kueche: { wall0: '#f7ead0', wall1: '#efd9b2', wood: '#c98b4f', top: '#f1e6d2', topLine: '#c9b493', floorA: '#e7d3b4', floorB: '#d6bb93' },
  kammer: { wall0: '#ead2a8', wall1: '#d8b781', wood: '#9c6634', top: '#dcc39b', topLine: '#a98a5e', floorA: '#c9a77a', floorB: '#b48f62' },
  keller: { wall0: '#5d5048', wall1: '#3e342e', wood: '#8a8178', top: '#a59c92', topLine: '#6d655d', floorA: '#7a7067', floorB: '#6b6158' },
  backstube: { wall0: '#f7ead0', wall1: '#efd9b2', wood: '#b9844e', top: '#f1e6d2', topLine: '#c9b493', floorA: '#e7d3b4', floorB: '#d6bb93' },
  dachboden: { wall0: '#8a6a4a', wall1: '#5e4630', wood: '#7a5636', top: '#a07a52', topLine: '#5e4630', floorA: '#8a6a4a', floorB: '#7a5c3e' },
  gartenfest: { wall0: '#f2a66a', wall1: '#6b4a8a', wood: '#7a4e2a', top: '#4fa53e', topLine: '#2f7a2a', floorA: '#7a4e2a', floorB: '#6a4424' },
  garten: { wall0: '#9fd8f5', wall1: '#e2f4fb', wood: '#8a5a32', top: '#5fb544', topLine: '#3e8e2e', floorA: '#8a5a32', floorB: '#7a4e2a' },
};
const theme = () => THEMES[L.theme] || THEMES.kueche;
function drawBgImage(name) {
  const bg = ok(name);
  if (!bg) return false;
  const k = vh / bg.naturalHeight, w = bg.naturalWidth * k;
  let x = -((cam.x * 0.35) % w);
  for (; x < vw; x += w) cx.drawImage(bg, x, 0, w + 1, vh);
  cx.fillStyle = 'rgba(255,242,220,.30)'; cx.fillRect(0, 0, vw, vh);   // etwas heller, damit Figuren davor gut zu sehen sind
  return true;
}
function drawBackground() {
  if (L.theme === 'kammer') return drawPantry();
  if (L.theme === 'keller') { if (!drawBgImage('keller-hintergrund')) drawCellar(); return; }
  if (L.theme === 'garten') { if (!drawBgImage('garten-hintergrund')) drawGarden(); return; }
  // Neue Welten: eigener Hintergrund, sonst vorerst ein verwandter Hintergrund mit Farbschleier
  if (L.theme === 'backstube') { if (drawBgImage('backstube-hintergrund')) return; if (drawBgImage('kueche-hintergrund')) { cx.fillStyle = 'rgba(255,200,140,.18)'; cx.fillRect(0, 0, vw, vh); } return; }
  if (L.theme === 'dachboden') { if (drawBgImage('dachboden-hintergrund')) return; if (!drawBgImage('kammer-hintergrund')) drawCellar(); cx.fillStyle = 'rgba(70,45,25,.32)'; cx.fillRect(0, 0, vw, vh); return; }
  if (L.theme === 'gartenfest') {
    if (drawBgImage('gartenfest-hintergrund')) return;
    if (!drawBgImage('garten-hintergrund')) drawGarden();
    const gr = cx.createLinearGradient(0, 0, 0, vh); gr.addColorStop(0, 'rgba(120,60,140,.45)'); gr.addColorStop(0.6, 'rgba(240,130,70,.25)'); gr.addColorStop(1, 'rgba(40,20,40,.2)');
    cx.fillStyle = gr; cx.fillRect(0, 0, vw, vh);
    // Lichterkette
    const off = -((cam.x * 0.35) % 60);
    for (let x = off; x < vw + 60; x += 30) { const y = 70 + Math.sin(x / 60) * 14; cx.fillStyle = ['#ffd21c', '#ff8fb1', '#7fd8ff'][Math.abs(Math.round(x / 30)) % 3]; cx.beginPath(); cx.arc(x, y, 4, 0, 7); cx.fill(); }
    return;
  }
  if (drawBgImage('kueche-hintergrund')) return;
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

// Keller: Ziegelwand, kleines Fenster oben mit Lichtstrahl, Fässer (Parallaxe) – Platzhalter bis zum ChatGPT-Bild
function drawCellar() {
  const g = cx.createLinearGradient(0, 0, 0, vh);
  g.addColorStop(0, '#5d5048'); g.addColorStop(1, '#3a312b');
  cx.fillStyle = g; cx.fillRect(0, 0, vw, vh);
  const px = cam.x * 0.4, py = cam.y * 0.4;
  cx.save(); cx.translate(-px, -py);
  cx.strokeStyle = 'rgba(0,0,0,.18)'; cx.lineWidth = 2;
  const y0 = Math.floor(py / 18) * 18;
  for (let y = y0 - 18; y < py + vh + 18; y += 18) {
    const off = (Math.round(y / 18) % 2) * 20;
    cx.beginPath(); cx.moveTo(px - 40, y); cx.lineTo(px + vw + 40, y); cx.stroke();
    for (let x = Math.floor(px / 40) * 40 - 40 + off; x < px + vw + 40; x += 40) { cx.beginPath(); cx.moveTo(x, y); cx.lineTo(x, y + 18); cx.stroke(); }
  }
  const s0 = Math.floor(px / 260) - 1, s1 = Math.floor((px + vw) / 260) + 1;
  for (let i = s0; i <= s1; i++) {
    const bx = i * 260;
    // Fenster mit Lichtkegel
    cx.fillStyle = 'rgba(255,236,170,.75)'; cx.fillRect(bx + 60, 90, 60, 34);
    cx.fillStyle = 'rgba(60,45,35,.9)'; cx.fillRect(bx + 88, 90, 4, 34);
    const beam = cx.createLinearGradient(0, 124, 0, 520); beam.addColorStop(0, 'rgba(255,236,170,.22)'); beam.addColorStop(1, 'rgba(255,236,170,0)');
    cx.fillStyle = beam; cx.beginPath(); cx.moveTo(bx + 60, 124); cx.lineTo(bx + 120, 124); cx.lineTo(bx + 190, 520); cx.lineTo(bx + 70, 520); cx.closePath(); cx.fill();
    // Fässer
    for (let j = 0; j < 2; j++) {
      const fx = bx + 150 + j * 52, fy = 470;
      cx.fillStyle = 'rgba(110,70,40,.55)'; rr(fx, fy, 46, 62, 14); cx.fill();
      cx.fillStyle = 'rgba(40,30,25,.4)'; cx.fillRect(fx, fy + 14, 46, 4); cx.fillRect(fx, fy + 44, 46, 4);
    }
  }
  cx.restore();
}
// Garten: Himmel, Sonne, Wolken, Zaun und Büsche (Parallaxe) – Platzhalter bis zum ChatGPT-Bild
function drawGarden() {
  const g = cx.createLinearGradient(0, 0, 0, vh);
  g.addColorStop(0, '#8fd0f2'); g.addColorStop(1, '#e6f6fb');
  cx.fillStyle = g; cx.fillRect(0, 0, vw, vh);
  cx.fillStyle = 'rgba(255,230,120,.9)'; cx.beginPath(); cx.arc(vw - 60, 80, 26, 0, 7); cx.fill();
  const px = cam.x * 0.3, py = cam.y * 0.4;
  cx.save(); cx.translate(-px * 0.5, 0);
  for (let i = Math.floor(px * 0.5 / 200) - 1; i <= Math.floor((px * 0.5 + vw) / 200) + 1; i++) {
    const seed = Math.abs(Math.sin(i * 9.1) * 1000) % 1;
    const cx0 = i * 200 + 40, cy0 = 130 + seed * 80;
    cx.fillStyle = 'rgba(255,255,255,.85)';
    cx.beginPath(); cx.arc(cx0, cy0, 18, 0, 7); cx.arc(cx0 + 22, cy0 - 8, 22, 0, 7); cx.arc(cx0 + 46, cy0, 16, 0, 7); cx.fill();
  }
  cx.restore();
  cx.save(); cx.translate(-px, -py);
  const fy = 420;
  for (let x = Math.floor(px / 26) * 26 - 26; x < px + vw + 26; x += 26) {
    cx.fillStyle = 'rgba(255,255,255,.7)'; cx.beginPath(); cx.moveTo(x, fy + 120); cx.lineTo(x, fy + 8); cx.lineTo(x + 9, fy); cx.lineTo(x + 18, fy + 8); cx.lineTo(x + 18, fy + 120); cx.fill();
  }
  cx.fillStyle = 'rgba(255,255,255,.7)'; cx.fillRect(px - 30, fy + 30, vw + 60, 8); cx.fillRect(px - 30, fy + 80, vw + 60, 8);
  for (let i = Math.floor(px / 150) - 1; i <= Math.floor((px + vw) / 150) + 1; i++) {
    const bx = i * 150 + 30;
    cx.fillStyle = 'rgba(80,160,70,.55)'; cx.beginPath(); cx.arc(bx, fy + 110, 34, 0, 7); cx.arc(bx + 36, fy + 100, 42, 0, 7); cx.arc(bx + 76, fy + 112, 30, 0, 7); cx.fill();
    cx.fillStyle = ['#ff8fb1', '#ffd21c', '#ffffff'][((i % 3) + 3) % 3]; for (let k = 0; k < 4; k++) { cx.beginPath(); cx.arc(bx + 10 + k * 18, fy + 86 + (k % 2) * 14, 4, 0, 7); cx.fill(); }
  }
  cx.restore();
}

// Speisekammer: Holzwand mit Regalen voller Gläser und Dosen (Parallaxe)
function drawPantry() {
  if (drawBgImage('kammer-hintergrund')) return;
  const g = cx.createLinearGradient(0, 0, 0, vh);
  g.addColorStop(0, '#ead2a8'); g.addColorStop(1, '#d8b781');
  cx.fillStyle = g; cx.fillRect(0, 0, vw, vh);
  const px = cam.x * 0.45, py = cam.y * 0.45;
  cx.save(); cx.translate(-px, -py);
  // Bretterwand
  cx.strokeStyle = 'rgba(110,70,30,.12)'; cx.lineWidth = 2;
  const x0 = Math.floor(px / 40) * 40;
  for (let x = x0; x < px + vw + 40; x += 40) { cx.beginPath(); cx.moveTo(x, py - 50); cx.lineTo(x, py + vh + 50); cx.stroke(); }
  const jars = ['#e8463c', '#f0a030', '#7cbf4a', '#c97a3c', '#f2d36b', '#b65bd1'];
  const s0 = Math.floor(px / 180) - 1, s1 = Math.floor((px + vw) / 180) + 1;
  for (let i = s0; i <= s1; i++) {
    const bx = i * 180;
    for (const sy of [150, 330, 510]) {
      cx.fillStyle = 'rgba(120,75,35,.35)'; cx.fillRect(bx + 10, sy, 160, 7);
      for (let j = 0; j < 4; j++) {
        const seed = Math.abs(Math.sin((i * 7 + j * 3 + sy) * 12.9898) * 43758.5453) % 1;
        const jx = bx + 22 + j * 38, h = 34 + seed * 22;
        cx.fillStyle = 'rgba(255,255,255,.35)'; rr(jx, sy - h, 26, h, 5); cx.fill();
        cx.fillStyle = jars[Math.floor(seed * jars.length)] + '88'; rr(jx + 3, sy - h * 0.7, 20, h * 0.7 - 2, 4); cx.fill();
        cx.fillStyle = 'rgba(140,90,40,.5)'; cx.fillRect(jx + 2, sy - h - 5, 22, 6);
      }
    }
  }
  cx.restore();
}

function drawTiles() {
  const th = theme();
  const tx0 = Math.max(0, Math.floor(cam.x / T)), tx1 = Math.min(L.w - 1, Math.floor((cam.x + vw) / T));
  const ty0 = Math.max(0, Math.floor(cam.y / T) - 8), ty1 = Math.min(L.h - 1, Math.floor((cam.y + vh) / T));
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
    const k = tileAt(s.L, tx, ty); if (!k) continue;
    const x = tx * T, y = ty * T;
    if (k === BELT_L || k === BELT_R) {
      cx.fillStyle = '#4a4f57'; cx.fillRect(x, y, T, T); cx.fillStyle = '#2e3238'; cx.fillRect(x, y, T, 9);
      cx.strokeStyle = '#ffd21c'; cx.lineWidth = 2; const d = k === BELT_L ? -1 : 1, o = ((s.t * 1.2 * d) % 16 + 16) % 16;
      for (let i = -16; i < T + 16; i += 16) { const xx = x + i + o; if (xx < x + 2 || xx > x + T - 6) continue; cx.beginPath(); cx.moveTo(xx + (d > 0 ? 0 : 5), y + 2); cx.lineTo(xx + (d > 0 ? 5 : 0), y + 4.5); cx.lineTo(xx + (d > 0 ? 0 : 5), y + 7); cx.stroke(); }
      cx.fillStyle = '#7d848e'; cx.beginPath(); cx.arc(x + T / 2, y + 20, 6, 0, 7); cx.fill();
    } else if (k === SPONGE) {
      cx.fillStyle = '#ffd84a'; rr(x + 1, y + 6, T - 2, T - 6, 5); cx.fill();
      cx.fillStyle = '#3fae5a'; rr(x + 1, y + 1, T - 2, 8, 3); cx.fill();
      cx.fillStyle = 'rgba(180,140,20,.45)'; for (let i = 0; i < 5; i++) { cx.beginPath(); cx.arc(x + 6 + (i * 7) % 22, y + 14 + (i * 5) % 12, 2, 0, 7); cx.fill(); }
    } else if (k === CAKE) {
      const row = ty % 3;
      cx.fillStyle = row === 0 ? '#fff4e8' : row === 1 ? '#f7b7c8' : '#c98a52'; cx.fillRect(x, y, T, T);
      cx.fillStyle = 'rgba(255,255,255,.5)'; cx.fillRect(x, y, T, 3);
      if (tileAt(s.L, tx, ty - 1) !== CAKE) { cx.fillStyle = '#ffffff'; for (let i = 0; i < 3; i++) { cx.beginPath(); cx.arc(x + 6 + i * 10, y + 2, 6, Math.PI, 0); cx.fill(); } cx.fillStyle = '#e8463c'; cx.beginPath(); cx.arc(x + 16, y - 4, 4.5, 0, 7); cx.fill(); }
    } else if (k === SOLID && L.theme === 'dachboden') {
      const topOpen = ty === 0 || tileAt(L, tx, ty - 1) !== SOLID;
      cx.fillStyle = (tx + ty) % 2 ? '#7a5636' : '#6e4c2e'; cx.fillRect(x, y, T, T);
      cx.strokeStyle = 'rgba(40,25,10,.4)'; cx.lineWidth = 1.5; cx.beginPath(); cx.moveTo(x, y + T / 2); cx.lineTo(x + T, y + T / 2); cx.stroke();
      cx.fillStyle = 'rgba(40,25,10,.5)'; cx.beginPath(); cx.arc(x + 5, y + 8, 1.5, 0, 7); cx.arc(x + T - 5, y + 24, 1.5, 0, 7); cx.fill();
      if (topOpen) { cx.fillStyle = '#a07a52'; cx.fillRect(x, y, T, 6); }
    } else if (k === SOLID && (L.theme === 'keller' || L.theme === 'garten' || L.theme === 'gartenfest')) {
      const topOpen = ty === 0 || tileAt(L, tx, ty - 1) !== SOLID;
      if (L.theme === 'keller') {
        cx.fillStyle = (tx * 7 + ty * 3) % 5 === 0 ? '#827870' : '#8a8178'; cx.fillRect(x, y, T, T);
        cx.strokeStyle = 'rgba(40,30,25,.35)'; cx.lineWidth = 2;
        const off = (ty % 2) * 16; cx.strokeRect(x + 1, y + 1, T - 2, T / 2 - 1); cx.beginPath(); cx.moveTo(x + off, y + T / 2); cx.lineTo(x + off, y + T); cx.stroke();
        if (topOpen) { cx.fillStyle = '#a59c92'; cx.fillRect(x, y, T, 5); }
      } else {
        cx.fillStyle = (tx + ty) % 3 === 0 ? '#7f522d' : '#8a5a32'; cx.fillRect(x, y, T, T);
        cx.fillStyle = 'rgba(60,35,15,.35)'; cx.beginPath(); cx.arc(x + 9 + (tx * 5) % 12, y + 14 + (ty * 7) % 12, 3, 0, 7); cx.fill();
        if (topOpen) {
          cx.fillStyle = '#5fb544'; cx.fillRect(x, y, T, 9); cx.fillStyle = '#3e8e2e'; cx.fillRect(x, y + 8, T, 2);
          cx.fillStyle = '#7cd25d'; for (let i = 0; i < 4; i++) { cx.beginPath(); cx.moveTo(x + 4 + i * 8, y + 1); cx.lineTo(x + 6 + i * 8, y - 4); cx.lineTo(x + 8 + i * 8, y + 1); cx.fill(); }
        }
      }
    } else if (k === SOLID && ok('schrank')) {
      const topOpen = ty === 0 || tileAt(L, tx, ty - 1) !== SOLID;
      if (ty >= L.floor) {
        if (L.theme !== 'kammer' && ok('fliese')) cx.drawImage(IMG.fliese, x, y, T, T);
        else { cx.fillStyle = (tx + ty) % 2 ? th.floorA : th.floorB; cx.fillRect(x, y, T, T); }
        if (topOpen) { cx.fillStyle = 'rgba(120,80,40,.45)'; cx.fillRect(x, y, T, 3); }
      } else {
        cx.drawImage(IMG.schrank, x, y, T, T);
        if (L.theme === 'kammer') { cx.fillStyle = 'rgba(90,50,20,.22)'; cx.fillRect(x, y, T, T); }
        if (topOpen && ok('arbeitsplatte')) { const ap = IMG.arbeitsplatte; cx.drawImage(ap, (tx % 4) * ap.naturalWidth / 4, 0, ap.naturalWidth / 4, ap.naturalHeight, x, y - 2, T, 11); }
      }
    } else if (k === SOLID) {
      const topOpen = ty === 0 || tileAt(L, tx, ty - 1) !== SOLID;
      if (ty >= L.floor) {
        cx.fillStyle = (tx + ty) % 2 ? th.floorA : th.floorB; cx.fillRect(x, y, T, T);
        if (topOpen) { cx.fillStyle = '#b48a5a'; cx.fillRect(x, y, T, 4); }
      } else {
        cx.fillStyle = th.wood; cx.fillRect(x, y, T, T);
        cx.strokeStyle = 'rgba(94,52,21,.28)'; cx.lineWidth = 2; cx.strokeRect(x + 3, y + (topOpen ? 10 : 3), T - 6, T - (topOpen ? 13 : 6));
        if (topOpen) { cx.fillStyle = th.top; cx.fillRect(x, y, T, 8); cx.fillStyle = th.topLine; cx.fillRect(x, y + 7, T, 2); }
        const leftOpen = tileAt(L, tx - 1, ty) !== SOLID, rightOpen = tileAt(L, tx + 1, ty) !== SOLID;
        cx.fillStyle = 'rgba(60,30,10,.35)';
        if (leftOpen) cx.fillRect(x, y, 2, T);
        if (rightOpen) cx.fillRect(x + T - 2, y, 2, T);
      }
    } else if (k === SUGAR && ok('zucker')) {
      cx.drawImage(IMG.zucker, x, y, T, T);
    } else if (k === SUGAR) {
      // Zuckerwürfel: weiß, leicht glitzernd
      cx.fillStyle = '#ffffff'; rr(x + 1, y + 1, T - 2, T - 2, 4); cx.fill();
      cx.fillStyle = '#e4ecf2'; cx.fillRect(x + 4, y + T - 9, T - 8, 5); cx.fillRect(x + T - 9, y + 4, 5, T - 8);
      cx.strokeStyle = '#c9d6df'; cx.lineWidth = 1.5; rr(x + 1, y + 1, T - 2, T - 2, 4); cx.stroke();
      cx.fillStyle = 'rgba(200,215,225,.9)';
      for (let i = 0; i < 5; i++) { const a = (tx * 7 + ty * 13 + i * 5) % 22; cx.fillRect(x + 5 + a, y + 5 + ((a * 3 + i * 7) % 20), 2, 2); }
      if ((s.t + tx * 17) % 120 < 8) { cx.fillStyle = '#fff'; cx.fillRect(x + 8, y + 6, 3, 3); }
    } else if (k === SHELF && ok('regalbrett')) {
      const im = IMG.regalbrett, iw = im.naturalWidth, ih = im.naturalHeight, e = iw * 0.08;
      const l = tileAt(L, tx - 1, ty) !== SHELF, r = tileAt(L, tx + 1, ty) !== SHELF;
      const sx = l ? 0 : r ? iw - iw * 0.3 : e + ((tx * 37) % 5) * (iw - 2 * e) / 6, sw = l || r ? iw * 0.3 : (iw - 2 * e) / 6;
      cx.drawImage(im, sx, 0, sw, ih, x - (l ? 1 : 0), y - 1, T + (l || r ? 1 : 0.5), 10);
    } else if (k === SHELF) {
      cx.fillStyle = '#a8692f'; rr(x - 1, y, T + 2, 8, 2); cx.fill();
      cx.fillStyle = '#c98b4f'; cx.fillRect(x - 1, y, T + 2, 3);
      if (tileAt(L, tx - 1, ty) !== SHELF || tileAt(L, tx + 1, ty) !== SHELF) {
        // Halter an den Enden
        const hx = tileAt(L, tx - 1, ty) !== SHELF ? x + 6 : x + T - 10;
        cx.fillStyle = '#7d7d86'; cx.beginPath(); cx.moveTo(hx, y + 8); cx.lineTo(hx + 4, y + 8); cx.lineTo(hx + 4, y + 22); cx.closePath(); cx.fill();
      }
    } else if (k === LADDER && ok('kochloeffel')) {
      // ganzer Kochlöffel: am obersten Feld über die gesamte Leiterlänge zeichnen
      if (tileAt(L, tx, ty - 1) !== LADDER) {
        let n = 1; while (tileAt(L, tx, ty + n) === LADDER) n++;
        const h = n * T + 22, w = h * IMG.kochloeffel.naturalWidth / IMG.kochloeffel.naturalHeight;
        cx.drawImage(IMG.kochloeffel, x + T / 2 - Math.max(w, 12) / 2, y - 22, Math.max(w, 12), h);
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

function drawPlats() {
  for (const pl of s.plats) {
    if (pl.kind === 'cookie') drawCookie(pl);
    else if (pl.kind === 'scale') drawScalePlate(pl);
  }
  drawLifts();
}
function drawCookie(pl) {
  const img = pl.state === 0 ? ok('cookie') : pl.state === 1 ? ok('cookie-riss') : null;
  if (pl.state === 2 && pl.t > 150 - 24 && ok('cookie-krumen')) {
    const k = (150 - pl.t) / 24;
    cx.globalAlpha = 1 - k; sprite(IMG['cookie-krumen'], pl.x + pl.w / 2, pl.y + 18 + k * 30, 26); cx.globalAlpha = 1;
  }
  if (img) {
    const shake = pl.state === 1 ? Math.sin(s.t * 1.7) * 1.5 : 0;
    const w = pl.w + 6, h = w * img.naturalHeight / img.naturalWidth;
    cx.drawImage(img, pl.x - 3 + shake, pl.y - 3, w, h);
    return;
  }
  if (pl.state === 2) {
    cx.strokeStyle = 'rgba(140,90,40,.35)'; cx.setLineDash([4, 4]); cx.lineWidth = 2;
    rr(pl.x + 2, pl.y, pl.w - 4, 14, 7); cx.stroke(); cx.setLineDash([]);
    return;
  }
  const shake = pl.state === 1 ? Math.sin(s.t * 1.7) * 1.5 : 0;
  cx.save(); cx.translate(shake, 0);
  cx.fillStyle = '#c98a45'; rr(pl.x + 1, pl.y, pl.w - 2, 15, 7); cx.fill();
  cx.fillStyle = '#e0a961'; rr(pl.x + 3, pl.y + 1, pl.w - 6, 6, 4); cx.fill();
  cx.fillStyle = '#4a2a14';
  for (let i = 0; i < pl.w / 12; i++) { const ox = 6 + i * 12 + ((i * 5) % 4); cx.beginPath(); cx.arc(pl.x + ox, pl.y + 8 + (i % 2) * 2, 2.4, 0, 7); cx.fill(); }
  if (pl.state === 1) { cx.strokeStyle = '#5e3415'; cx.lineWidth = 1.5; cx.beginPath(); cx.moveTo(pl.x + pl.w * 0.35, pl.y); cx.lineTo(pl.x + pl.w * 0.45, pl.y + 8); cx.lineTo(pl.x + pl.w * 0.4, pl.y + 15); cx.stroke(); }
  cx.restore();
}
function drawScalePlate(pl) {
  const triggered = s.scaleT[pl.scale] >= 0;
  // Stange nach unten bis zum Boden der Mulde
  cx.fillStyle = '#9aa3ad'; cx.fillRect(pl.x + pl.w / 2 - 3, pl.y + 8, 6, Math.max(0, pl.y0 + 3 * T - pl.y));
  const im = ok(pl.role === 'a' ? 'schale-a' : 'schale-b');
  if (im) { const w = pl.w + 14, h = w * im.naturalHeight / im.naturalWidth; cx.drawImage(im, pl.x - 7, pl.y - 6, w, h); }
  else { cx.fillStyle = '#d5dbe1'; rr(pl.x - 2, pl.y, pl.w + 4, 9, 4); cx.fill(); cx.fillStyle = '#b7c0c8'; cx.fillRect(pl.x, pl.y + 6, pl.w, 3); }
  if (pl.role === 'a' && !triggered) {
    // Gewicht-Symbol: hier draufstellen (groß)
    cx.fillStyle = 'rgba(17,18,26,.55)'; cx.font = '700 13px Fredoka, sans-serif'; cx.textAlign = 'center';
    cx.fillText('⚖', pl.x + pl.w / 2, pl.y - 6);
  }
}
function drawLifts() {
  for (const lf of s.plats) {
    if (lf.kind !== 'lift') continue;
    // Führungsschiene zeigt den festen Weg
    if (!lf.toast) {
      cx.strokeStyle = 'rgba(94,52,21,.25)'; cx.lineWidth = 3; cx.setLineDash([6, 6]);
      cx.beginPath(); cx.moveTo(lf.x + lf.w / 2, lf.high); cx.lineTo(lf.x + lf.w / 2, lf.low + 24); cx.stroke(); cx.setLineDash([]);
    }
    const y = lf.y;
    if (lf.toast) {
      // Toaster steht unten fest, der Toast springt im Takt hoch
      cx.fillStyle = '#d9a35a'; rr(lf.x + 4, y, lf.w - 8, 14, 5); cx.fill(); cx.fillStyle = '#f2c98a'; rr(lf.x + 7, y + 2, lf.w - 14, 8, 4); cx.fill();
      const ty0 = lf.low + 6;
      cx.fillStyle = '#c9ced6'; rr(lf.x - 2, ty0, lf.w + 4, 26, 8); cx.fill();
      cx.fillStyle = '#9aa1ab'; cx.fillRect(lf.x + 6, ty0 + 3, lf.w - 12, 4);
      cx.fillStyle = '#1d1d22'; rr(lf.x + lf.w - 6, ty0 + 10, 6, 10, 2); cx.fill();
      continue;
    }
    if (ok('schublade')) { const im = IMG.schublade, w = lf.w + 4; cx.drawImage(im, lf.x - 2, y - 2, w, w * im.naturalHeight / im.naturalWidth); continue; }
    cx.fillStyle = '#b97a3e'; rr(lf.x, y, lf.w, 26, 4); cx.fill();
    cx.fillStyle = '#d99c5c'; cx.fillRect(lf.x + 2, y, lf.w - 4, LIFT_H - 4);
    cx.fillStyle = '#8a5428'; rr(lf.x + lf.w / 2 - 10, y + 15, 20, 5, 2); cx.fill();
  }
}

function drawCrumb(x, y, t) {
  const b = Math.sin(t / 12 + x) * 2;
  if (ok('kruemel')) { cx.drawImage(IMG.kruemel, x - 7, y - 6 + b, 14, 12); return; }
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
  const im = ok(on ? 'fahne-auf' : 'fahne-zu');
  if (im) { sprite(im, f.x + (on ? 10 : 0), f.y + 1, 48); return; }
  cx.fillStyle = '#e2c79b'; cx.fillRect(f.x - 1.5, f.y - 46, 3, 46);
  cx.fillStyle = on ? '#FF9200' : '#bfb3a0';
  cx.beginPath(); cx.moveTo(f.x + 1.5, f.y - 46); cx.lineTo(f.x + 24, f.y - 39 + (on ? Math.sin(s.t / 6) * 2 : 0)); cx.lineTo(f.x + 1.5, f.y - 31); cx.closePath(); cx.fill();
}
function drawGoal(g, t) {
  if (ok('kaeseglocke')) { cx.fillStyle = `rgba(255,210,28,${0.2 + 0.12 * Math.sin(t / 9)})`; cx.beginPath(); cx.arc(g.x, g.y - 26, 34, 0, 7); cx.fill(); sprite(IMG.kaeseglocke, g.x, g.y + 2, 56); return; }
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
  const im = ok(fleeing ? 'kaetzchen-flucht' : 'kaetzchen-' + (Math.floor(c.t / 9) % 3));
  if (im) {
    const x = c.x + c.w / 2, y = c.y + c.h;
    cx.save();
    if (fleeing) { cx.globalAlpha = Math.max(0, 1 - c.t / 50); }
    sprite(im, x, y + 2, 32, c.vx < 0);
    cx.restore();
    return;
  }
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

function drawHole(e) {
  cx.fillStyle = L.theme === 'garten' ? '#3b2412' : '#1c140f';
  cx.beginPath(); cx.moveTo(e.x - 13, e.y); cx.lineTo(e.x - 13, e.y - 12); cx.arc(e.x, e.y - 12, 13, Math.PI, 0); cx.lineTo(e.x + 13, e.y); cx.closePath(); cx.fill();
  cx.strokeStyle = 'rgba(160,110,60,.9)'; cx.lineWidth = 3;
  cx.beginPath(); cx.moveTo(e.x - 14, e.y); cx.lineTo(e.x - 14, e.y - 12); cx.arc(e.x, e.y - 12, 14, Math.PI, 0); cx.lineTo(e.x + 14, e.y); cx.stroke();
}
function drawChoc(c, t) {
  const im = ok('linse-' + c.c);
  if (im) { const b = Math.sin(t / 11 + c.x) * 2; cx.drawImage(im, c.x - 9, c.y - 6 + b, 18, 13); return; }
  const cols = ['#e8463c', '#3f8ff0', '#ffd21c', '#4cbf5a', '#ff8fd0'];
  const b = Math.sin(t / 11 + c.x) * 2;
  cx.fillStyle = 'rgba(0,0,0,.15)'; cx.beginPath(); cx.ellipse(c.x + 1, c.y + b + 2, 8, 6, 0, 0, 7); cx.fill();
  cx.fillStyle = cols[c.c]; cx.beginPath(); cx.ellipse(c.x, c.y + b, 8, 6, 0, 0, 7); cx.fill();
  cx.fillStyle = 'rgba(255,255,255,.55)'; cx.beginPath(); cx.ellipse(c.x - 3, c.y + b - 2, 3, 1.6, -0.3, 0, 7); cx.fill();
}
function drawCheeseStation(st) {
  const k = 0.5 + 0.5 * Math.sin(s.t / 10);
  const im = ok('kaese-station');
  if (im) { cx.fillStyle = `rgba(255,210,28,${0.18 + 0.15 * k})`; cx.beginPath(); cx.arc(st.x, st.y - 12, 20, 0, 7); cx.fill(); sprite(im, st.x, st.y + 1, 26); return; }
  cx.fillStyle = '#fff'; cx.beginPath(); cx.ellipse(st.x, st.y - 2, 15, 4, 0, 0, 7); cx.fill();
  cx.fillStyle = `rgba(255,210,28,${0.18 + 0.15 * k})`; cx.beginPath(); cx.arc(st.x, st.y - 14, 18, 0, 7); cx.fill();
  drawCheese(st.x, st.y - 12, 12, false, 0);
}
function drawMint(st) {
  const sw = Math.sin(s.t / 14) * 0.15;
  const im = ok('minze');
  if (im) { cx.save(); cx.translate(st.x, st.y); cx.rotate(sw * 0.4); sprite(im, 0, 1, 26); cx.restore(); return; }
  cx.save(); cx.translate(st.x, st.y);
  cx.fillStyle = '#6b4a2a'; cx.fillRect(-1.5, -14, 3, 14);
  for (const [a, l] of [[-0.9 + sw, 13], [0.9 + sw, 13], [sw, 15]]) {
    cx.save(); cx.translate(0, -12); cx.rotate(a);
    cx.fillStyle = '#4cbf7a'; cx.beginPath(); cx.ellipse(0, -l / 2, 5.5, l / 2, 0, 0, 7); cx.fill();
    cx.strokeStyle = '#2e8a55'; cx.lineWidth = 1; cx.beginPath(); cx.moveTo(0, 0); cx.lineTo(0, -l + 2); cx.stroke();
    cx.restore();
  }
  cx.restore();
}
function drawSleeper(c) {
  const x = c.x + c.w / 2, y = c.y + c.h;
  const awake = c.state === 'awake';
  const fr = !awake ? 0 : c.t < 25 ? 1 : 2;
  const im = ok('schlafkater-' + fr);
  if (im) {
    const flip = s.p.x + s.p.w / 2 < x;      // schaut zur Maus
    const br = fr === 0 ? 1 + Math.sin(s.t / 25) * 0.015 : 1;
    sprite(im, x, y + 3, 54 * br, flip);
    return;
  }
  cx.save(); cx.translate(x, y);
  const br = awake ? 0 : Math.sin(s.t / 25) * 1.5;
  // Schwanz
  cx.strokeStyle = '#7f8794'; cx.lineWidth = 6; cx.lineCap = 'round';
  cx.beginPath(); cx.moveTo(-20, -6); cx.quadraticCurveTo(-34, awake ? -30 : -2, awake ? -26 : -30, awake ? -40 : 2); cx.stroke();
  // Körper
  cx.fillStyle = '#9aa1ad';
  cx.beginPath(); cx.ellipse(-2, awake ? -16 : -11 - br, 24, awake ? 15 : 12 + br, 0, 0, 7); cx.fill();
  cx.fillStyle = '#c3c8d0'; cx.beginPath(); cx.ellipse(4, awake ? -10 : -7, 12, 6, 0, 0, 7); cx.fill();
  // Kopf
  const hy = awake ? -30 : -14;
  cx.fillStyle = '#9aa1ad'; cx.beginPath(); cx.arc(18, hy, 11, 0, 7); cx.fill();
  cx.beginPath(); cx.moveTo(10, hy - 7); cx.lineTo(12, hy - 18); cx.lineTo(17, hy - 9); cx.fill();
  cx.beginPath(); cx.moveTo(20, hy - 9); cx.lineTo(26, hy - 18); cx.lineTo(28, hy - 5); cx.fill();
  cx.fillStyle = '#2a1a0e';
  if (awake) {
    cx.fillStyle = '#ffd21c'; cx.beginPath(); cx.arc(16, hy - 1, 3, 0, 7); cx.arc(24, hy - 1, 3, 0, 7); cx.fill();
    cx.fillStyle = '#2a1a0e'; cx.fillRect(15.4, hy - 3, 1.4, 4); cx.fillRect(23.4, hy - 3, 1.4, 4);
    cx.fillStyle = '#fff'; cx.beginPath(); cx.moveTo(17, hy + 5); cx.lineTo(19, hy + 9); cx.lineTo(21, hy + 5); cx.fill();
  } else {
    cx.fillRect(13, hy - 1, 5, 1.6); cx.fillRect(21, hy - 1, 5, 1.6);
    // Zzz-Bläschen
    const z = (s.t % 120) / 120;
    cx.globalAlpha = 1 - z; cx.strokeStyle = '#ffffff'; cx.lineWidth = 2;
    cx.beginPath(); cx.arc(30 + z * 10, hy - 16 - z * 22, 3 + z * 4, 0, 7); cx.stroke();
    cx.globalAlpha = 1;
  }
  cx.fillStyle = '#ff8fa8'; cx.beginPath(); cx.arc(20, hy + 3, 1.8, 0, 7); cx.fill();
  cx.restore();
}

function mouseFrame(p) {
  if ((p.freeze > 0 && p.freezeKind === 'hit') || p.push > 0) return 'autsch';
  if (p.ladder || p.ride >= 0) return 'klettern';
  if (!p.ground) return 'sprung';
  if (Math.abs(p.vx) > 0.3) return 'lauf-' + (Math.floor(p.runT / 11) % 4);
  return 'stehen';
}
function drawMouse() {
  const p = s.p;
  if (p.invuln > 0 && Math.floor(p.invuln / 4) % 2 === 0) return;
  const im = ok((p.big ? 'maus-gross-' : 'maus-klein-') + mouseFrame(p));
  if (im) {
    let h = p.big ? 58 : 34;
    if (p.growT > 0) h *= 1 + Math.sin(p.growT * 0.9) * 0.12;
    let sx = 1, sy = 1;
    if (p.landT > 0) { const k = p.landT / 8 * 0.15; sx = 1 + k; sy = 1 - k; }
    const x = p.x + p.w / 2, y = p.y + p.h + 2;
    cx.save(); cx.translate(x, y); cx.scale(sx, sy);
    if (p.freeze > 0 && p.freezeKind === 'hit') cx.rotate(Math.sin(s.t * 0.6) * 0.2);
    sprite(im, 0, 0, h, !p.ladder && p.ride < 0 && p.face < 0);
    cx.restore();
    return;
  }
  const x = p.x + p.w / 2, y = p.y + p.h;
  cx.save(); cx.translate(x, y);
  // Quetschen und Strecken
  let sx = 1, sy = 1;
  if (!p.ground && !p.ladder) { const k = Math.min(0.18, Math.abs(p.vy) * 0.02); sx = 1 - k; sy = 1 + k; }
  if (p.landT > 0) { const k = p.landT / 8 * 0.22; sx = 1 + k; sy = 1 - k; }
  if (p.freeze > 0 && p.freezeKind === 'hit') cx.rotate(Math.sin(s.t * 0.6) * 0.3);
  // groß: Figur skaliert (beim Wachsen/Schrumpfen kurz wackeln)
  let k = p.big ? 1.6 : 1;
  if (p.growT > 0) k *= 1 + Math.sin(p.growT * 0.9) * 0.12;
  cx.scale(sx * k * (p.ladder ? 1 : p.face), sy * k);
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

function drawBalloon(b) {
  const bx = b.x, top = b.y - 58;
  cx.strokeStyle = 'rgba(80,60,40,.8)'; cx.lineWidth = 1.2; cx.beginPath(); cx.moveTo(bx, b.y + 2); cx.quadraticCurveTo(bx + 4, b.y - 20, bx, top + 22); cx.stroke();
  const im = ok(b.limp ? 'ballon-schlaff' : 'ballon');
  if (im) { sprite(im, bx, top + 26, 44); return; }
  cx.fillStyle = b.limp ? '#5aa0e8' : '#e8463c';
  cx.beginPath(); b.limp ? cx.ellipse(bx, top + 10, 15, 11, 0.2, 0, 7) : cx.ellipse(bx, top + 4, 15, 18, 0, 0, 7); cx.fill();
  cx.fillStyle = 'rgba(255,255,255,.5)'; cx.beginPath(); cx.ellipse(bx - 5, top - 2, 4, 6, -0.4, 0, 7); cx.fill();
  cx.fillStyle = b.limp ? '#3e7cc0' : '#b8322a'; cx.beginPath(); cx.moveTo(bx - 3, top + 22); cx.lineTo(bx + 3, top + 22); cx.lineTo(bx, top + 18); cx.fill();
}
function drawDrip(d) {
  // Kaffeemaschine über der Düse
  const im = ok('kaffeemaschine');
  if (im) sprite(im, d.x, d.y + 4, 46);
  else {
    cx.fillStyle = '#b87333'; rr(d.x - 16, d.y - 40, 32, 34, 6); cx.fill(); cx.fillStyle = '#8a5428'; cx.fillRect(d.x - 4, d.y - 8, 8, 8);
    cx.fillStyle = '#ffe9c4'; cx.beginPath(); cx.arc(d.x, d.y - 26, 6, 0, 7); cx.fill();
  }
  const dp = dripAt(d, s.t);
  if (!dp) return;
  const wob = dp.warn ? Math.sin(s.t * 1.3) * 1.5 : 0;
  cx.fillStyle = '#5a3418'; cx.beginPath(); cx.moveTo(dp.x + wob, dp.y - 10); cx.quadraticCurveTo(dp.x + 6 + wob, dp.y, dp.x + wob, dp.y + 3); cx.quadraticCurveTo(dp.x - 6 + wob, dp.y, dp.x + wob, dp.y - 10); cx.fill();
}
function drawPowder(z) {
  cx.fillStyle = '#ffffff'; cx.beginPath(); cx.ellipse((z.x0 + z.x1) / 2, z.y, (z.x1 - z.x0) / 2 - 4, 7, 0, Math.PI, 0); cx.fill();
  cx.fillStyle = '#e8e8f0'; rr((z.x0 + z.x1) / 2 + 10, z.y - 18, 12, 18, 3); cx.fill(); cx.fillStyle = '#e8463c'; cx.fillRect((z.x0 + z.x1) / 2 + 10, z.y - 12, 12, 5);
}
function drawWild(w) {
  if (w.state === 'gone') return;
  const x = w.x + w.w / 2, y = w.y + w.h;
  const im = ok(w.state === 'flee' ? (w.wet ? 'wilde-katze-nass' : 'wilde-katze-knaeuel') : (Math.floor(s.t / 40) % 3 === 0 ? 'wilde-katze-fauch' : 'wilde-katze'));
  cx.save();
  if (w.state === 'flee') cx.globalAlpha = Math.max(0, 1 - w.t / 45);
  const flip = s.p.x + s.p.w / 2 > x;
  if (im) { sprite(im, x, y + 2, 34, flip); cx.restore(); return; }
  cx.translate(x, y); if (flip) cx.scale(-1, 1);
  cx.fillStyle = '#2a2a30'; cx.beginPath(); cx.ellipse(0, -11, 16, 10, 0, 0, 7); cx.fill();
  cx.fillStyle = '#ffffff'; cx.beginPath(); cx.ellipse(4, -8, 7, 5, 0, 0, 7); cx.fill();
  cx.fillStyle = '#2a2a30'; cx.beginPath(); cx.arc(-14, -16, 9, 0, 7); cx.fill();
  cx.beginPath(); cx.moveTo(-20, -21); cx.lineTo(-19, -31); cx.lineTo(-14, -23); cx.fill(); cx.beginPath(); cx.moveTo(-11, -23); cx.lineTo(-6, -30); cx.lineTo(-7, -19); cx.fill();
  cx.fillStyle = '#ffd21c'; cx.beginPath(); cx.arc(-17, -17, 2.4, 0, 7); cx.arc(-11, -17, 2.4, 0, 7); cx.fill();
  cx.strokeStyle = '#2a2a30'; cx.lineWidth = 5; cx.lineCap = 'round'; cx.beginPath(); cx.moveTo(14, -12); cx.quadraticCurveTo(26, -24, 20, -34); cx.stroke();
  if (w.wet) { cx.fillStyle = '#7fd0ff'; for (let i = 0; i < 4; i++) { cx.beginPath(); cx.arc(-10 + i * 7, -32 + (i % 2) * 6, 2, 0, 7); cx.fill(); } }
  cx.restore();
}
function drawYarn(y, carried) {
  const im = ok('wollknaeuel');
  if (im) { sprite(im, y.x, y.y + 1, carried ? 12 : 18); return; }
  cx.fillStyle = '#e8463c'; cx.beginPath(); cx.arc(y.x, y.y - (carried ? 6 : 9), carried ? 6 : 9, 0, 7); cx.fill();
  cx.strokeStyle = '#b8322a'; cx.lineWidth = 1.5; cx.beginPath(); cx.arc(y.x, y.y - (carried ? 6 : 9), carried ? 3.5 : 5.5, 0.5, 3.6); cx.stroke();
}
function drawTap(t) {
  const im = ok(hoseT > 0 ? 'wasserhahn-an' : 'wasserhahn');
  if (im) sprite(im, t.x, t.y + 1, 34);
  else {
    cx.fillStyle = '#8a5a32'; cx.fillRect(t.x - 4, t.y - 28, 8, 28);
    cx.fillStyle = '#b9c2cc'; rr(t.x - 2, t.y - 26, 16, 7, 3); cx.fill(); cx.fillStyle = '#e8463c'; cx.beginPath(); cx.arc(t.x, t.y - 30, 6, 0, 7); cx.fill();
  }
  if (hoseT > 0 && hoseFrom === t) {
    cx.strokeStyle = 'rgba(120,200,255,.8)'; cx.lineWidth = 5; cx.lineCap = 'round';
    cx.beginPath(); cx.moveTo(t.x + 12, t.y - 22); cx.quadraticCurveTo(t.x + 110, t.y - 70, t.x + 220, t.y - 10); cx.stroke();
    for (let i = 0; i < 6; i++) { cx.fillStyle = 'rgba(160,220,255,.9)'; cx.beginPath(); cx.arc(t.x + 200 + Math.random() * 40, t.y - 20 + Math.random() * 20, 2.5, 0, 7); cx.fill(); }
  }
}
function drawCage(c, i) {
  const open = s.cages[i];
  // Hebel
  cx.fillStyle = '#6b4a2a'; cx.fillRect(c.lx - 8, c.ly - 6, 16, 6);
  cx.strokeStyle = '#8a5a32'; cx.lineWidth = 4; cx.lineCap = 'round'; cx.beginPath(); cx.moveTo(c.lx, c.ly - 5); cx.lineTo(c.lx + (open ? 10 : -10), c.ly - 22); cx.stroke();
  cx.fillStyle = '#e8463c'; cx.beginPath(); cx.arc(c.lx + (open ? 10 : -10), c.ly - 23, 4, 0, 7); cx.fill();
  // Käfig mit Freund
  const im = ok(open ? 'kaefig-offen' : 'kaefig');
  if (!open) drawFriend(c.x, c.y, i, 0, true);
  if (im) { sprite(im, c.x, c.y + 1, 40); return; }
  cx.strokeStyle = '#8a5a32'; cx.lineWidth = 2.5;
  cx.strokeRect(c.x - 15, c.y - 34, 30, 34);
  if (!open) for (let k = -9; k <= 9; k += 6) { cx.beginPath(); cx.moveTo(c.x + k, c.y - 34); cx.lineTo(c.x + k, c.y); cx.stroke(); }
  cx.fillStyle = '#8a5a32'; cx.fillRect(c.x - 17, c.y - 37, 34, 5);
}
const FRIEND_TUCH = ['#3f8ff0', '#4cbf5a', '#ff8fd0'];
function drawFriend(x, y, i, f, sad) {
  const im = ok(`freund-${i % 3}-${sad ? 'traurig' : 'lauf-' + (Math.floor(s.t / 8) % 2)}`) || ok('maus-klein-' + (sad ? 'stehen' : 'lauf-' + (Math.floor(s.t / 8) % 4)));
  if (im) {
    cx.save(); sprite(im, x, y + 1, 26, f < 0); cx.restore();
    if (!ok(`freund-${i % 3}-traurig`)) { cx.fillStyle = FRIEND_TUCH[i % 3]; cx.beginPath(); cx.arc(x + (f < 0 ? -3 : 3), y - 9, 3, 0, 7); cx.fill(); }
    return;
  }
  cx.fillStyle = ['#f2f2f2', '#c9a27a', '#6b6670'][i % 3]; cx.beginPath(); cx.ellipse(x, y - 8, 8, 7, 0, 0, 7); cx.fill();
  cx.beginPath(); cx.arc(x + 4 * (f < 0 ? -1 : 1), y - 16, 5, 0, 7); cx.fill();
  cx.fillStyle = FRIEND_TUCH[i % 3]; cx.fillRect(x - 4, y - 11, 8, 3);
}
function drawFriendsFollowing() {
  for (let i = 0; i < s.freed; i++) {
    const q = trail[Math.max(0, trail.length - 1 - (i + 1) * 14)];
    if (q) drawFriend(q.x - q.f * 6, q.y, i, q.f, false);
  }
}
function drawChaser() {
  const ch = s.chaser; if (!ch) return;
  // Boden unter Fürst Fauch suchen (ab Höhe der Maus nach unten)
  const tx = Math.floor((ch.x + 20) / T);
  let ty = Math.max(0, Math.floor(s.p.y / T) - 3);
  while (ty < L.h && !(tileAt(s.L, tx, ty) && tileAt(s.L, tx, ty) !== LADDER)) ty++;
  const y = Math.min(ty * T, L.h * T);
  const im = ok('fuerst-fauch-' + (Math.floor(s.t / 7) % 4));
  if (im) { sprite(im, ch.x, y + 3, 64); return; }
  cx.save(); cx.translate(ch.x, y);
  const bob = Math.abs(Math.sin(s.t / 5)) * 3;
  cx.fillStyle = '#d98a3a'; cx.beginPath(); cx.ellipse(-6, -22 - bob, 30, 20, 0, 0, 7); cx.fill();
  cx.fillStyle = '#f2c08a'; cx.beginPath(); cx.ellipse(0, -16 - bob, 16, 10, 0, 0, 7); cx.fill();
  cx.fillStyle = '#d98a3a'; cx.beginPath(); cx.arc(24, -36 - bob, 16, 0, 7); cx.fill();
  cx.beginPath(); cx.moveTo(14, -46 - bob); cx.lineTo(16, -60 - bob); cx.lineTo(23, -50 - bob); cx.fill(); cx.beginPath(); cx.moveTo(27, -50 - bob); cx.lineTo(34, -60 - bob); cx.lineTo(37, -44 - bob); cx.fill();
  cx.fillStyle = '#ffd21c'; cx.beginPath(); cx.moveTo(16, -52 - bob); cx.lineTo(18, -62 - bob); cx.lineTo(22, -55 - bob); cx.lineTo(26, -63 - bob); cx.lineTo(29, -55 - bob); cx.lineTo(33, -62 - bob); cx.lineTo(34, -52 - bob); cx.closePath(); cx.fill();
  cx.fillStyle = '#fff'; cx.beginPath(); cx.arc(22, -38 - bob, 4, 0, 7); cx.arc(31, -38 - bob, 4, 0, 7); cx.fill();
  cx.fillStyle = '#2a1a0e'; cx.beginPath(); cx.arc(23, -38 - bob, 2, 0, 7); cx.arc(32, -38 - bob, 2, 0, 7); cx.fill();
  cx.strokeStyle = '#5e3415'; cx.lineWidth = 1.5; cx.beginPath(); cx.moveTo(28, -30 - bob); cx.lineTo(44, -33 - bob); cx.moveTo(28, -29 - bob); cx.lineTo(44, -26 - bob); cx.stroke();
  cx.restore();
}

function render() {
  cx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
  drawBackground();
  cx.save(); cx.translate(-Math.round(cam.x * scale) / scale, -Math.round(cam.y * scale) / scale);
  drawTiles();
  drawPlats();
  L.holes.forEach((h) => { drawHole(h.a); drawHole(h.b); });
  L.powders.forEach(drawPowder);
  for (const q of prints) { cx.globalAlpha = Math.min(1, q.t / 60); cx.fillStyle = '#ffffff'; cx.beginPath(); cx.ellipse(q.x, q.y, 2.6, 1.6, 0, 0, 7); cx.fill(); } cx.globalAlpha = 1;
  L.taps.forEach(drawTap);
  L.yarns.forEach((y) => drawYarn(y, false));
  L.cages.forEach(drawCage);
  L.cheeses.forEach(drawCheeseStation);
  L.mints.forEach(drawMint);
  L.flags.forEach((f, i) => drawFlag(f, s.flagHit[i]));
  L.crumbs.forEach((c, i) => { if (!s.crumbs[i]) drawCrumb(c.x, c.y, s.t); });
  L.chocs.forEach((c, i) => { if (!s.chocs[i]) drawChoc(c, s.t); });
  L.golds.forEach((g, i) => {
    if (s.golds[i]) return;
    if (ok('goldkaese')) { const b = Math.sin((s.t + i * 20) / 15) * 2; cx.fillStyle = `rgba(255,210,28,${0.22 + 0.12 * Math.sin(s.t / 8)})`; cx.beginPath(); cx.arc(g.x, g.y + b, 15, 0, 7); cx.fill(); cx.drawImage(IMG.goldkaese, g.x - 14, g.y - 12 + b, 28, 23); }
    else drawCheese(g.x, g.y, 10, true, s.t + i * 20);
  });
  s.sleepers.forEach(drawSleeper);
  drawGoal(L.goal, s.t);
  s.cats.forEach(drawCat);
  s.wilds.forEach(drawWild);
  s.balloons.forEach(drawBalloon);
  drawFriendsFollowing();
  drawMouse();
  if (s.p.item === 'yarn') drawYarn({ x: s.p.x + s.p.w / 2 - s.p.face * 10, y: s.p.y + 4 }, true);
  L.drips.forEach(drawDrip);
  drawChaser();
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
      { const p = s.p; trail.push({ x: p.x + p.w / 2, y: p.y + p.h, f: p.face }); if (trail.length > 160) trail.shift();
        if (p.slowD > 0 && p.ground && Math.abs(p.vx) > 0.3 && s.t % 9 === 0) prints.push({ x: p.x + p.w / 2 + (s.t % 18 ? -3 : 3), y: p.y + p.h - 1, t: 140 });
        prints = prints.filter((q) => --q.t > 0); if (hoseT > 0) hoseT--; }
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
