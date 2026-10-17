// Turmschicht – Oberfläche: Pixelgrafik (Platzhalter-Sprites aus Code, später Bilder), Joystick, Aktionstaste, Modi, Teilen.
import { LEVELS, LEVEL_COUNT } from './levels.js';
import { W, H, HZ, C, STORE, layout, newState, step, nearLever, ladderX, starCount, dinoPos, monPos, segOf, freshSave, sanitizeSave, recordRun, centis, parseChallenge, beats, fmt, MODES } from './engine.js';

const $ = (id) => document.getElementById(id);
const app = $('app'), cv = $('game'), ctx = cv.getContext('2d');
const scr = document.createElement('canvas'); scr.width = W; scr.height = H; const g = scr.getContext('2d');
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ---------- Pixel-Sprites (Platzhalter, bis Bilder kommen) ----------
const PAL = { G: '#4fd04a', g: '#2c8a2a', L: '#c6f59a', W: '#f4f1e0', E: '#0b0f2a', O: '#ff8a1f', B: '#2f6bff', b: '#1b3c9e', P: '#f6b8d2', Y: '#ffd23f', y: '#c9900f', R: '#ff4a3d', S: '#9fb3e0', s: '#5a6c9e', K: '#0b0f2a', w: '#ffffff' };
const pad = (rows, w) => rows.map((r) => r.padEnd(w, '.').slice(0, w));
const DINO_TOP = ['..........GGGGG.', '.........GGGGGGG', '.........GGWEGGG', '.........GGGGGGG', '.........GGGGg..', '...O.O..GGGG....', '..OGOGOGGGGG....', '.GGGGGGGGGLL....', 'GGGGGGGGGLLL.g..', '.GGGGGGGGLLLgg..', '..GGGGGGGLL.....', '...GGGGGGG......'];
const SPR = {
  dinoIdle: pad(['', ...DINO_TOP, '...GG...GG......', '...GG...GG......', '..ggg...ggg.....'], 16),
  dinoWalk1: pad(['', ...DINO_TOP, '....GG..GG......', '...GG....GG.....', '..ggg....ggg....'], 16),
  dinoWalk2: pad(['', ...DINO_TOP, '.....GGGG.......', '.....GGGG.......', '....gggggg......'], 16),
  dinoClimb1: pad(['', '......GGGG......', '.....GGGGGG.....', '..G..GGGGGG.....', '..GG.GOGOGG.....', '...GGGGOGGGGG...', '.....GGGOGG.GG..', '.....GGGGGG..G..', '.....GGOGGG.....', '....GGGGGGGG....', '....GGGGGGGG....', '....GG.GG.GG....', '....GG..G.GG....', '...ggg.....GG...', '...........ggg..'], 16),
  monWalk1: pad(['...P.P.P......', '..PBPBPBP.....', '.BBBBBBBBBB...', 'BBBBBBBBBBBB..', 'BBBBBBBBBWEB..', 'BBBBBBBBBBBBB.', 'BBBBBBBBBBWWW.', '.BBBBBBBBBBB..', '..BB.BB.BB.BB.', '..bb.bb.bb.bb.', '..............'], 14),
  monWalk2: pad(['...P.P.P......', '..PBPBPBP.....', '.BBBBBBBBBB...', 'BBBBBBBBBBBB..', 'BBBBBBBBBWEB..', 'BBBBBBBBBBBBB.', 'BBBBBBBBBBWWW.', '.BBBBBBBBBBB..', '...BB.BB.BB.B.', '...bb.bb.bb.b.', '..............'], 14),
  monAngry: pad(['..P.P.P.P.....', '..PBPBPBP.....', '.BBBBBBBBBB...', 'BBBBBBBBBBBB..', 'BBBBBBBBBRRB..', 'BBBBBBBBBBBBB.', 'BBBBBBBBBBWWW.', '.BBBBBBBBBBB..', '..BB.BB.BB.BB.', '..bb.bb.bb.bb.', '..............'], 14),
  star: pad(['...Y...', '..YYY..', 'YYYYYYY', '.YYYYY.', '..YYY..', '.YY.YY.', 'Y.....Y'], 7),
  heart: pad(['.RR.RR.', 'RRRRRRR', 'RRRRRRR', '.RRRRR.', '..RRR..', '...R...'], 7)
};
const sprCache = new Map();
function sprite(name, flip = false) {
  const k = name + flip; if (sprCache.has(k)) return sprCache.get(k);
  const rows = SPR[name], c = document.createElement('canvas'); c.width = rows[0].length; c.height = rows.length;
  const x = c.getContext('2d');
  rows.forEach((r, y) => [...r].forEach((ch, i) => { if (ch !== '.' && PAL[ch]) { x.fillStyle = PAL[ch]; x.fillRect(flip ? r.length - 1 - i : i, y, 1, 1); } }));
  sprCache.set(k, c); return c;
}
// Bilder aus img/ (von ChatGPT), sobald geliefert; sonst Platzhalter oben.
// Jedes Bild hat feste Spielgröße in Pixeln (Breite × Höhe der ganzen Datei). Geliefert wird es vergrößert (z. B. 8-fach);
// beim Laden wird es exakt auf Spielgröße heruntergerechnet (Mitte jeder Pixelkachel, ohne Weichzeichnen).
const ART = { dino: [96, 16], monster: [64, 12], jaeger: [64, 12], stern: [16, 8], hebel: [24, 36], ausgang: [40, 28], traeger: [8, 7], leiter: [9, 4], hintergrund: [180, 320] };
const IMAGES = []; // Namen eintragen, sobald die Datei in img/ liegt
const IMG = {};
for (const k of IMAGES) {
  const i = new Image();
  i.onload = () => {
    const [w, h] = ART[k], c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d'), sx = i.naturalWidth / w, sy = i.naturalHeight / h;
    const tmp = document.createElement('canvas'); tmp.width = i.naturalWidth; tmp.height = i.naturalHeight; const tx = tmp.getContext('2d'); tx.drawImage(i, 0, 0);
    const d = tx.getImageData(0, 0, tmp.width, tmp.height).data, out = x.createImageData(w, h);
    for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) { const si = (Math.floor((yy + 0.5) * sy) * tmp.width + Math.floor((xx + 0.5) * sx)) * 4, di = (yy * w + xx) * 4; for (let q = 0; q < 4; q++) out.data[di + q] = d[si + q]; }
    x.putImageData(out, 0, 0); IMG[k] = c; buildStatic();
  };
  i.src = new URL('img/' + k + '.png', import.meta.url).href;
}
const pic = (k) => IMG[k] || null;

// ---------- Spielstand & Ton ----------
let save = freshSave();
try { save = sanitizeSave(JSON.parse(localStorage.getItem(STORE)), LEVEL_COUNT); } catch { /* Privatmodus */ }
const persist = () => { try { localStorage.setItem(STORE, JSON.stringify(save)); } catch { /* egal */ } };
let actx = null;
function unlockAudio() { if (save.mute) return; try { actx ??= new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === 'suspended') actx.resume(); } catch { actx = null; } }
function beep(f, d, type = 'square', v = 0.06, slide = 0, delay = 0) {
  if (save.mute || !actx) return;
  try { const t = actx.currentTime + delay, o = actx.createOscillator(), gn = actx.createGain(); o.type = type; o.frequency.setValueAtTime(f, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f * slide), t + d); gn.gain.setValueAtTime(v, t); gn.gain.exponentialRampToValueAtTime(0.0001, t + d); o.connect(gn).connect(actx.destination); o.start(t); o.stop(t + d + 0.02); } catch { /* egal */ }
}
const SFX = {
  star: () => { beep(988, 0.07); beep(1319, 0.12, 'square', 0.06, 0, 0.07); },
  lever: () => { beep(220, 0.05); beep(330, 0.08, 'square', 0.05, 0, 0.05); beep(660, 0.1, 'square', 0.05, 0, 0.12); },
  alert: () => { beep(880, 0.08, 'square', 0.07); beep(880, 0.08, 'square', 0.07, 0, 0.12); },
  hit: () => beep(300, 0.3, 'sawtooth', 0.08, 0.3),
  dead: () => [400, 300, 200, 120].forEach((f, i) => beep(f, 0.14, 'square', 0.07, 0, i * 0.12)),
  win: () => [523, 659, 784, 1047, 784, 1047].forEach((f, i) => beep(f, 0.1, 'square', 0.06, 0, i * 0.09)),
  locked: () => beep(150, 0.15, 'square', 0.06),
  giveup: () => beep(500, 0.2, 'triangle', 0.05, 0.5),
  grab: () => beep(500, 0.03, 'square', 0.02)
};
const SPK_ON = '<svg viewBox="0 0 16 16" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M2 6h3l4-3v10l-4-3H2z"/><path fill="currentColor" d="M11 5h1v6h-1zM13 3h1v10h-1z"/></svg>';
const SPK_OFF = '<svg viewBox="0 0 16 16" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M2 6h3l4-3v10l-4-3H2z"/><path fill="currentColor" d="M11 6h1v1h-1zM12 7h1v1h-1zM13 8h1v1h-1zM13 6h1v1h-1zM11 8h1v1h-1z"/></svg>';
function paintMute() { for (const b of [$('muteBtn'), $('muteBtn2')]) { b.innerHTML = save.mute ? SPK_OFF : SPK_ON; b.setAttribute('aria-pressed', String(!save.mute)); } }
function toggleMute() { save.mute = !save.mute; persist(); paintMute(); if (!save.mute) { unlockAudio(); SFX.star(); } }

// ---------- Zustand ----------
let mode = 'menu', levelNo = 1, lv = LEVELS[0], st = newState(lv, save.mode), L = layout(lv), playMode = save.mode;
let acc = 0, last = 0, now = 0, winAt = 0, deadAt = 0, tipAt = 0, actQueued = false, alerts = new Map(), giveups = new Map(), shake = 0, staticCv = null;
const challenge = parseChallenge(location.search, LEVEL_COUNT); let activeCh = null;

// ---------- Größe: scharfe Pixel ----------
let k = 1, ox = 0, oy = 0;
function resize() {
  const dpr = window.devicePixelRatio || 1, cw = app.clientWidth * dpr, ch = app.clientHeight * dpr;
  cv.width = Math.round(cw); cv.height = Math.round(ch);
  const raw = Math.min(cw / W, ch / H); k = raw >= 4 ? Math.floor(raw) : raw; // ganzzahlig, wenn genug Platz; sonst ohne Weichzeichnen gestreckt
  ox = Math.round((cv.width - W * k) / 2); oy = Math.round((cv.height - H * k) / 2);
  ctx.imageSmoothingEnabled = false;
}
new ResizeObserver(resize).observe(app);

// ---------- Eingabe ----------
const stickEl = $('stick'), knob = $('knob'), R = 54, DEAD = 12, stick = { id: null, ox: 0, oy: 0, x: 0, y: 0, armed: false }, keys = new Set();
function placeStick() { stickEl.style.left = stick.ox + 'px'; stickEl.style.top = stick.oy + 'px'; knob.style.transform = `translate(${stick.x * R}px,${stick.y * R}px)`; }
function releaseStick() { stick.id = null; stick.x = stick.y = 0; stickEl.classList.remove('on'); }
app.addEventListener('pointerdown', (e) => {
  unlockAudio();
  if (mode !== 'play' || stick.id !== null || e.target.closest('button,a,.screen')) return;
  e.preventDefault(); $('tip').classList.add('away');
  const r = app.getBoundingClientRect();
  Object.assign(stick, { id: e.pointerId, ox: e.clientX - r.left, oy: e.clientY - r.top, x: 0, y: 0, armed: false });
  try { app.setPointerCapture(e.pointerId); } catch { /* alt */ }
  placeStick(); stickEl.classList.add('on');
});
app.addEventListener('pointermove', (e) => {
  if (e.pointerId !== stick.id) return; e.preventDefault();
  const r = app.getBoundingClientRect(); let dx = e.clientX - r.left - stick.ox, dy = e.clientY - r.top - stick.oy, d = Math.hypot(dx, dy);
  if (!stick.armed && d < DEAD) return;
  stick.armed = true;
  const maxD = R * 1.6; if (d > maxD) { const q = (d - maxD) / d; stick.ox += dx * q; stick.oy += dy * q; dx -= dx * q; dy -= dy * q; d = maxD; }
  const m = Math.min(1, d / R); stick.x = d ? dx / d * m : 0; stick.y = d ? dy / d * m : 0; placeStick();
});
for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) app.addEventListener(t, (e) => { if (e.pointerId === stick.id) releaseStick(); });
app.addEventListener('touchstart', (e) => { if (mode === 'play' && !e.target.closest('button,a,.screen')) e.preventDefault(); }, { passive: false });
app.addEventListener('touchmove', (e) => { if (mode === 'play' || !e.target.closest('.screen')) e.preventDefault(); }, { passive: false });
for (const t of ['gesturestart', 'gesturechange', 'dblclick', 'contextmenu']) document.addEventListener(t, (e) => e.preventDefault(), { passive: false });
$('actBtn').addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); actQueued = true; unlockAudio(); });
const KEYMAP = { ArrowLeft: 'l', KeyA: 'l', ArrowRight: 'r', KeyD: 'r', ArrowUp: 'u', KeyW: 'u', ArrowDown: 'd', KeyS: 'd' };
addEventListener('keydown', (e) => {
  if (KEYMAP[e.code]) { keys.add(KEYMAP[e.code]); if (mode === 'play') { e.preventDefault(); $('tip').classList.add('away'); } unlockAudio(); }
  else if ((e.code === 'Space' || e.code === 'KeyE' || e.code === 'Enter') && mode === 'play') { e.preventDefault(); if (!e.repeat) actQueued = true; }
  else if ((e.code === 'Escape' || e.code === 'KeyP') && (mode === 'play' || mode === 'pause')) mode === 'play' ? pause() : resume();
  else if (e.code === 'KeyR' && (mode === 'play' || mode === 'pause' || mode === 'done')) startLevel(levelNo);
});
addEventListener('keyup', (e) => { if (KEYMAP[e.code]) keys.delete(KEYMAP[e.code]); });
addEventListener('blur', () => { keys.clear(); releaseStick(); if (mode === 'play') pause(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && mode === 'play') pause(); });
function input() {
  const kx = (keys.has('r') ? 1 : 0) - (keys.has('l') ? 1 : 0), ky = (keys.has('u') ? 1 : 0) - (keys.has('d') ? 1 : 0);
  return kx || ky ? { x: kx, y: ky } : { x: stick.x, y: -stick.y };
}

// ---------- Bildschirme ----------
const SCREENS = ['menu', 'levels', 'pause', 'done'];
function show(id) { for (const s of SCREENS) $(s).hidden = s !== id; $('hud').hidden = !(id === null || id === 'pause'); if (id !== null) { releaseStick(); $('actBtn').hidden = true; } }
function toast(t) { const el = $('toast'); el.textContent = t; el.hidden = false; clearTimeout(toast.h); toast.h = setTimeout(() => (el.hidden = true), 3200); }
function setMode(m) { playMode = m; save.mode = m; persist(); document.querySelectorAll('.mode-btn').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === m))); }
document.querySelectorAll('.mode-btn').forEach((b) => (b.onclick = () => setMode(b.dataset.mode)));
const nextLevel = () => { for (let n = 1; n <= save.unlocked; n++) if (!save.best[n] || !save.best[n][playMode]) return n; return save.unlocked; };
function openMenu() {
  mode = 'menu'; show('menu'); setMode(playMode);
  const box = $('challengeBox');
  if (challenge) { box.hidden = false; box.innerHTML = `Herausforderung · Level ${challenge.l} · ${MODES[challenge.m]}<b>${fmt(challenge.t)}</b>Schaffst du es schneller?`; $('playLabel').textContent = 'Annehmen'; }
  else { box.hidden = true; $('playLabel').textContent = save.best[1] ? 'Weiter' : 'Spielen'; }
}
function openLevels() {
  mode = 'levels'; show('levels'); $('levelsMode').textContent = 'Modus: ' + MODES[playMode];
  const gr = $('grid'); gr.textContent = ''; const nx = nextLevel();
  for (let n = 1; n <= LEVEL_COUNT; n++) {
    const b = document.createElement('button'), best = save.best[n] && save.best[n][playMode];
    b.innerHTML = `${String(n).padStart(2, '0')}${best ? `<small>${(best.t / HZ).toFixed(1).replace('.', ',')}</small>` : ''}`;
    b.setAttribute('aria-label', `Level ${n}${best ? ', Rekord ' + fmt(centis(best.t)) : ''}`);
    if (best) b.classList.add('done'); if (n === nx && !best) b.classList.add('next');
    b.disabled = n > save.unlocked && !(challenge && challenge.l === n);
    b.onclick = () => startLevel(n); gr.append(b);
  }
}
function pause() { if (mode !== 'play') return; mode = 'pause'; show('pause'); }
function resume() { mode = 'play'; acc = 0; show(null); }
$('playBtn').onclick = () => { unlockAudio(); if (challenge) { setMode(challenge.m); startLevel(challenge.l); } else startLevel(nextLevel()); };
$('levelsBtn').onclick = openLevels; $('levelsBack').onclick = openMenu;
$('muteBtn').onclick = toggleMute; $('muteBtn2').onclick = toggleMute;
$('pauseBtn').onclick = pause; $('resumeBtn').onclick = resume; $('restartHud').onclick = () => startLevel(levelNo);
$('restartBtn').onclick = () => startLevel(levelNo); $('pauseLevels').onclick = openLevels;
$('retryBtn').onclick = () => startLevel(levelNo); $('doneLevels').onclick = openLevels;
$('nextBtn').onclick = () => (levelNo < LEVEL_COUNT && levelNo + 1 <= save.unlocked ? startLevel(levelNo + 1) : openLevels());
$('shareBtn').onclick = share;

// ---------- Ablauf ----------
function startLevel(n, keepTip = false) {
  levelNo = n; lv = LEVELS[n - 1]; st = newState(lv, playMode); L = layout(lv);
  activeCh = challenge && challenge.l === n && challenge.m === playMode ? challenge : null;
  acc = 0; winAt = 0; deadAt = 0; alerts = new Map(); giveups = new Map(); fx = []; actQueued = false;
  buildStatic(); mode = 'play'; show(null); $('flash').hidden = true;
  $('hudLv').textContent = 'LV ' + String(n).padStart(2, '0'); $('hudMode').textContent = playMode === 'p' ? 'PERFEKT' : 'AUSBRUCH';
  if (!keepTip) { $('tipLv').textContent = `LEVEL ${n} · ${lv.name.toUpperCase()}${activeCh ? ' · ZIEL ' + fmt(activeCh.t) : ''}`; $('tipText').textContent = lv.tip; $('tip').classList.remove('away'); tipAt = now; }
  hud(true);
}
function finish() {
  mode = 'done';
  const cs = centis(st.time), wasUnlocked = save.unlocked, had = !!(save.best[levelNo] && save.best[levelNo][playMode]);
  const rec = recordRun(save, levelNo, playMode, st.time, st.hits, starCount(st), LEVEL_COUNT);
  if (levelNo > wasUnlocked) save.unlocked = wasUnlocked; // Herausforderung schaltet nichts außer der Reihe frei
  persist();
  $('doneMode').textContent = MODES[playMode] + ' · Level ' + levelNo;
  $('doneTime').textContent = fmt(cs); $('doneStars').textContent = starCount(st) + '/3'; $('doneHits').textContent = st.hits;
  $('record').hidden = !(rec && had);
  const res = $('result');
  if (activeCh) { const won = beats(st.time, activeCh), diff = Math.abs(activeCh.t - cs); res.hidden = false; res.className = 'result ' + (won ? 'win' : 'lose'); res.textContent = won ? `Herausforderung geschafft – ${fmt(diff)} schneller!` : diff ? `Noch ${fmt(diff)} zu langsam.` : 'Exakt gleich schnell – nicht geschlagen.'; }
  else res.hidden = true;
  $('nextBtn').hidden = levelNo >= LEVEL_COUNT || levelNo + 1 > save.unlocked;
  show('done');
}
async function share() {
  const cs = centis(st.time), url = `${location.origin}/spiele/turmschicht?l=${levelNo}&m=${playMode}&t=${cs}`;
  const text = `Turmschicht Level ${levelNo}, ${MODES[playMode]}: ${fmt(cs)}. Schaffst du es schneller?`;
  if (navigator.share) { try { await navigator.share({ title: 'Turmschicht', text, url }); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
  try { await navigator.clipboard.writeText(text + ' ' + url); toast('Link kopiert'); } catch { toast(url); }
}

// ---------- Ereignisse & Effekte ----------
let fx = [];
function burst(x, y, color, n) { for (let i = 0; i < n; i++) { const a = Math.random() * 6.28, v = 20 + Math.random() * 50; fx.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 30, life: 0, max: 0.4 + Math.random() * 0.4, color }); } }
function handle() {
  for (const e of st.events) {
    const d = dinoPos(st);
    if (e.t === 'star') { SFX.star(); burst(d.x, d.y - 8, '#ffd23f', 10); }
    else if (e.t === 'lever') { SFX.lever(); shake = 0.15; }
    else if (e.t === 'alert') SFX.alert();
    else if (e.t === 'hit') { SFX.hit(); shake = 0.25; burst(d.x, d.y - 7, '#ff4a3d', 8); }
    else if (e.t === 'dead') { SFX.dead(); deadAt = now; }
    else if (e.t === 'win') { SFX.win(); burst(lv.exit.x, L.ys[lv.floors.length - 1] - 12, '#ffd23f', 24); }
    else if (e.t === 'locked') { SFX.locked(); flash(`Erst alle ★ (${starCount(st)}/3)`); }
    else if (e.t === 'giveup') SFX.giveup();
    else if (e.t === 'grab') SFX.grab();
  }
  st.events.length = 0;
}
function flash(t, ms = 1200) { const f = $('flash'); f.textContent = t; f.hidden = false; clearTimeout(flash.h); flash.h = setTimeout(() => (f.hidden = true), ms); }

// ---------- Hauptschleife ----------
let hudKey = '';
function hud(force) {
  const secs = Math.floor(st.time / HZ), key = [secs, st.hearts, st.stars].join('|');
  if (!force && key === hudKey) return; hudKey = key;
  $('hudTime').textContent = Math.floor(secs / 60) + ':' + String(secs % 60).padStart(2, '0');
  $('hudHearts').textContent = '♥'.repeat(Math.max(0, st.hearts)) + '♡'.repeat(3 - Math.max(0, st.hearts));
  $('hudStars').textContent = '★' + starCount(st) + '/3';
}
function frame(ms) {
  requestAnimationFrame(frame);
  now = ms / 1000; const dt = Math.min(0.1, Math.max(0, now - last)); last = now;
  if (mode === 'play') {
    acc += dt; let n = 0;
    while (acc >= 1 / HZ && n < 8) { const v = input(); step(st, v.x, v.y, actQueued); actQueued = false; handle(); acc -= 1 / HZ; n++; if (st.done || st.dead) break; }
    if (n >= 8) acc = 0;
    if (st.started || now - tipAt > 10) $('tip').classList.add('away');
    $('actBtn').hidden = nearLever(st) < 0; $('actBtn').classList.toggle('pulse', nearLever(st) >= 0);
    if (st.done) { mode = 'win'; winAt = now; releaseStick(); $('actBtn').hidden = true; }
    else if (st.dead) { mode = 'dead'; releaseStick(); $('actBtn').hidden = true; flash('SCHICHT VORBEI', 1300); }
  }
  if (mode === 'win' && now - winAt > 1.1) finish();
  if (mode === 'dead' && now - deadAt > 1.4) startLevel(levelNo, true);
  draw(dt); hud();
}

// ---------- Zeichnen ----------
const COL = { bg: '#0a1330', bg2: '#101c44', truss: '#1a2c66', brick: '#14214f', girder: '#ff6a1f', girder2: '#b8420c', ladder: '#58b8ff', ladder2: '#2a6fb8' };
const LEVER_COL = ['#ff6a1f', '#ff5fb0', '#ffd23f'];
function buildStatic() {
  staticCv ??= document.createElement('canvas'); staticCv.width = W; staticCv.height = H;
  const c = staticCv.getContext('2d'); c.imageSmoothingEnabled = false;
  const bg = pic('hintergrund');
  if (bg) c.drawImage(bg, 0, 0, W, H);
  else {
    c.fillStyle = COL.bg; c.fillRect(0, 0, W, H);
    // Stahlgerüst im Hintergrund: Fachwerkstützen, Ziegelgruppen, Ketten
    for (const x of [0, 172]) { c.fillStyle = COL.truss; c.fillRect(x, 0, 8, H); c.fillStyle = COL.bg; for (let y = 0; y < H; y += 10) { c.fillRect(x + 2, y + 2, 4, 6); } c.fillStyle = COL.truss; for (let y = 0; y < H; y += 10) for (let i = 0; i < 4; i++) c.fillRect(x + 2 + i, y + 2 + i + (i > 1 ? 2 : 0), 1, 1); }
    let seedv = levelNo * 97; const r = () => ((seedv = (seedv * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    for (let i = 0; i < 14; i++) { const x = 16 + Math.floor(r() * 140), y = 30 + Math.floor(r() * 270); c.fillStyle = COL.brick; c.fillRect(x, y, 8, 3); c.fillRect(x + 4, y + 4, 8, 3); c.fillRect(x - 2, y + 8, 7, 3); }
    c.fillStyle = COL.truss; for (const x of [40, 132]) for (let y = 20; y < H - 20; y += 4) c.fillRect(x, y, 1, 2);
  }
  for (let f = 0; f < lv.floors.length; f++) for (const [a, b] of lv.floors[f]) girder(c, a, b, L.ys[f]);
}
function girder(c, a, b, y) {
  const img = pic('traeger');
  if (img) { for (let x = a; x < b; x += 8) c.drawImage(img, 0, 0, Math.min(8, b - x), 7, x, y, Math.min(8, b - x), 7); return; }
  c.fillStyle = COL.girder; c.fillRect(a, y, b - a, 1); c.fillRect(a, y + 5, b - a, 1); c.fillRect(a, y, 1, 6); c.fillRect(b - 1, y, 1, 6);
  for (let x = a + 1; x < b - 1; x++) { const p = (x - a) % 8, yy = p < 4 ? y + 1 + p : y + 8 - p; c.fillRect(x, Math.min(y + 4, yy), 1, 1); }
  c.fillStyle = COL.girder2; c.fillRect(a, y + 6, b - a, 1);
}
function ladderAt(x, y0, y1, color, dashed) {
  const top = y1 - 1, bot = y0, img = !dashed && pic('leiter');
  if (img) { for (let y = bot - 4; y > top - 4; y -= 4) { const h = Math.min(4, y + 4 - top); g.drawImage(img, 0, 4 - h, 9, h, x - 4, y + 4 - h, 9, h); } return; }
  g.fillStyle = color;
  for (let y = top; y <= bot; y++) { if (dashed && (y >> 1) % 2) continue; g.fillRect(x - 4, y, 1, 1); g.fillRect(x + 4, y, 1, 1); }
  if (!dashed) for (let y = bot - 3; y > top; y -= 4) g.fillRect(x - 3, y, 7, 1);
}
function draw(dt) {
  g.imageSmoothingEnabled = false;
  g.drawImage(staticCv, 0, 0);
  const t = now, top = lv.floors.length - 1;
  // Leitern (umschaltbare: gestrichelte Zielposition, farbig nach Hebel)
  lv.ladders.forEach((l) => {
    const y0 = L.ys[l.f], y1 = L.ys[l.f + 1];
    if (l.xs) {
      const cur = ladderX(l, st.levers), alt = l.xs[st.levers[l.lever] ? 0 : 1], col = LEVER_COL[l.lever % 3];
      ladderAt(alt, y0, y1, col, true); ladderAt(cur, y0, y1, COL.ladder, false);
      g.fillStyle = col; g.fillRect(cur - 4, y1 + 8, 9, 2); // Farbmarke = gehört zu diesem Hebel
    } else ladderAt(l.x, y0, y1, COL.ladder, false);
  });
  // Ausgang
  drawExit(lv.exit.x, L.ys[top], t);
  // Hebel
  (lv.levers || []).forEach((o, i) => drawLever(o.x, L.ys[o.f], st.levers[i], LEVER_COL[i % 3], nearLever(st) === i, t));
  // Sterne
  const starImg = pic('stern');
  lv.stars.forEach((o, i) => { if (st.stars >> i & 1) return; const bob = Math.floor(t * 4 + i) % 2, sx = Math.round(o.x - 4), sy = Math.round(L.ys[o.f] - 11 + bob); if (starImg) g.drawImage(starImg, (Math.floor(t * 3 + i) % 2) * 8, 0, 8, 8, sx, sy, 8, 8); else g.drawImage(sprite('star'), sx + 1, sy + 1); });
  // Monster
  st.mons.forEach((m, i) => drawMonster(m, i, t));
  // Dino
  drawDino(t);
  // Effekte
  fx = fx.filter((p) => (p.life += dt) < p.max);
  for (const p of fx) { p.vy += 140 * dt; p.x += p.vx * dt; p.y += p.vy * dt; g.fillStyle = p.color; g.fillRect(Math.round(p.x), Math.round(p.y), 1, 1); }
  // auf den Bildschirm: scharf skaliert
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#060b1e'; ctx.fillRect(0, 0, cv.width, cv.height);
  const sx = shake > 0 ? Math.round((Math.random() - 0.5) * 2) * Math.max(1, Math.round(k / 2)) : 0; shake = Math.max(0, shake - dt);
  ctx.drawImage(scr, ox + sx, oy, Math.round(W * k), Math.round(H * k));
}
function drawExit(x, y, t) {
  const img = pic('ausgang'), open = st.mode === 's' || starCount(st) === 3;
  if (img) { g.drawImage(img, open ? 20 : 0, 0, 20, 28, x - 10, y - 28, 20, 28); if (!open) pxText(starCount(st) + '/3', x, y - 11, '#ffd23f'); return; }
  g.fillStyle = '#0b0f2a'; g.fillRect(x - 10, y - 26, 20, 26);
  for (let yy = y - 22; yy < y; yy++) { g.fillStyle = ((yy >> 1) % 2) ? '#ffd23f' : '#0b0f2a'; g.fillRect(x - 10, yy, 2, 1); g.fillRect(x + 8, yy, 2, 1); }
  g.fillStyle = open ? (Math.floor(t * 3) % 2 ? '#ffd23f' : '#ffb000') : '#5a6c9e'; g.fillRect(x - 6, y - 18, 12, 18);
  g.fillStyle = '#0b0f2a'; g.fillRect(x - 5, y - 16, 10, 1);
  g.fillStyle = '#2f6bff'; g.fillRect(x - 10, y - 26, 20, 6);
  pxText('EXIT', x, y - 25, '#fff4d6');
  if (!open) pxText(starCount(st) + '/3', x, y - 11, '#0b0f2a');
}
// Winzige 3×5-Pixelschrift (scharf statt geglätteter Systemschrift)
const FONT = { E: '111100110100111', X: '101101010101101', I: '111010010010111', T: '111010010010010', '/': '001001010100100', 0: '111101101101111', 1: '010110010010111', 2: '111001111100111', 3: '111001111001111' };
function pxText(t, cx, y, col) {
  const w = t.length * 4 - 1; let x = Math.round(cx - w / 2); g.fillStyle = col;
  for (const ch of t) { const b = FONT[ch]; if (b) for (let i = 0; i < 15; i++) if (b[i] === '1') g.fillRect(x + i % 3, y + Math.floor(i / 3), 1, 1); x += 4; }
}
function drawLever(x, y, on, col, near, t) {
  const img = pic('hebel');
  if (img) { const row = LEVER_COL.indexOf(col); g.drawImage(img, on ? 12 : 0, Math.max(0, row) * 12, 12, 12, x - 6, y - 12, 12, 12); }
  else {
    g.fillStyle = '#9fb3e0'; g.fillRect(x - 4, y - 2, 9, 2); g.fillStyle = '#5a6c9e'; g.fillRect(x - 3, y - 3, 7, 1);
    g.fillStyle = col; for (let i = 0; i < 6; i++) g.fillRect(x + (on ? i >> 1 : -(i >> 1)), y - 4 - i, 1, 1);
    g.fillStyle = '#ff4a3d'; g.fillRect(x + (on ? 2 : -4), y - 12, 3, 3);
  }
  if (near && Math.floor(t * 4) % 2) { g.fillStyle = '#fff4d6'; g.fillRect(x - 1, y - 17, 3, 1); g.fillRect(x, y - 16, 1, 1); }
}
function drawMonster(m, i, t) {
  const p = monPos(st, m), face = m.dir < 0, angry = m.mode === 'chase';
  const img = pic(m.hunt ? 'jaeger' : 'monster');
  const frame = m.mode === 'alert' ? 'monAngry' : angry ? 'monAngry' : Math.floor(t * 5 + i) % 2 ? 'monWalk1' : 'monWalk2';
  if (img) { const fi = m.mode === 'alert' ? 2 : angry ? 3 : frame === 'monWalk1' ? 0 : 1; g.save(); g.translate(Math.round(p.x), Math.round(p.y)); if (face) g.scale(-1, 1); g.drawImage(img, fi * 16, 0, 16, 12, -8, -12, 16, 12); g.restore(); }
  else g.drawImage(sprite(frame, face), Math.round(p.x - 7), Math.round(p.y - 11));
  if (m.mode === 'alert') { // Entdeckt: „!“ blinkt über dem Monster
    g.fillStyle = Math.floor(t * 8) % 2 ? '#ffd23f' : '#ff4a3d'; const bx = Math.round(p.x), by = Math.round(p.y - 22);
    g.fillRect(bx - 1, by, 3, 6); g.fillRect(bx - 1, by + 7, 3, 2);
  }
  if (m.mode === 'patrol' && m.hunt && !img) { g.fillStyle = '#ff4a3d'; g.fillRect(Math.round(p.x - 1), Math.round(p.y - 13), 3, 1); } // Jäger-Markierung (Platzhalter)
}
function drawDino(t) {
  const d = dinoPos(st), inv = st.inv > 0 && Math.floor(t * 12) % 2;
  if (inv && mode === 'play') return;
  let name = 'dinoIdle';
  if (st.ladder >= 0) name = 'dinoClimb1';
  else if (st.speed > 0) name = Math.floor(t * 8) % 2 ? 'dinoWalk1' : 'dinoWalk2';
  const img = pic('dino');
  const flip = st.ladder >= 0 ? (Math.floor(st.p * L.gap / 6) % 2 === 1) : st.face < 0;
  if (img) { const fi = st.knock > 0 ? 5 : st.ladder >= 0 ? (flip ? 4 : 3) : { dinoIdle: 0, dinoWalk1: 1, dinoWalk2: 2 }[name]; g.save(); g.translate(Math.round(d.x), Math.round(d.y)); if (st.ladder < 0 && st.face < 0) g.scale(-1, 1); g.drawImage(img, fi * 16, 0, 16, 16, -8, -16, 16, 16); g.restore(); }
  else g.drawImage(sprite(name, flip), Math.round(d.x - 8), Math.round(d.y - 16));
  if (mode === 'win') { const q = clamp((now - winAt) / 0.8, 0, 1); g.fillStyle = `rgba(255,210,63,${q})`; g.fillRect(Math.round(d.x - 8), Math.round(d.y - 16), 16, 16); }
}

// ---------- Start ----------
paintMute(); resize(); buildStatic(); openMenu(); requestAnimationFrame(frame);
window.__turm = { get state() { return st; }, get mode() { return mode; }, get level() { return levelNo; }, shot: () => scr.toDataURL() };
