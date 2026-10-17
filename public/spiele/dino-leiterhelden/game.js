// Dino-Leiterhelden – Oberfläche: Canvas-Grafik (Bilder oder gekennzeichnete Platzhalter), schwebender Joystick, Bildschirme, Speichern, Herausforderung.
import { LEVELS, LEVEL_COUNT } from './levels.js';
import { W, H, HZ, C, STORE, layout, newState, step, gotAll, nutPhase, freshSave, sanitizeSave, recordRun, centis, parseChallenge, beats, fmt } from './engine.js';

const $ = (id) => document.getElementById(id);
const app = $('app'), cv = $('game'), ctx = cv.getContext('2d');
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ---------- Bilder ----------
// Nur tatsächlich gelieferte Dateien eintragen; alles andere zeichnet der Code als Platzhalter (keine 404-Anfragen).
// Hintergründe lädt das Spiel erst, wenn ein Level sie braucht.
const IMAGES = ['dino-held', 'freund-tuerkis', 'freund-rosa', 'freund-gelb', 'schlafmonster', 'frucht', 'kokosnuss', 'hebel', 'baumhaus', 'tuer', 'plattform', 'plattform-ende', 'leiter', 'gelaender', 'effekte'];
const LAZY = ['hintergrund-1', 'hintergrund-2', 'hintergrund-3'];
const IMG = {};
function load(k) { if (IMG[k]) return; const i = new Image(); i.decoding = 'async'; i.onload = () => { if (/^(hintergrund|plattform|gelaender)/.test(k)) buildStatic(); }; i.src = new URL('img/' + k + '.webp', import.meta.url).href; IMG[k] = i; }
IMAGES.forEach(load);
const pic = (k) => { const i = IMG[k]; return i && i.complete && i.naturalWidth ? i : null; };

const FRIEND = [
  { body: '#3fc9bd', belly: '#c9f4ec', dark: '#23968c', sheet: 'freund-tuerkis' },
  { body: '#ff8fa8', belly: '#ffe0e6', dark: '#e0607e', sheet: 'freund-rosa', plates: '#ffc93c' },
  { body: '#ffd23f', belly: '#fff3c4', dark: '#e0a91c', sheet: 'freund-gelb' }
];
const HERO = { body: '#5cc94a', belly: '#e4f6b8', dark: '#3a9a2c', sheet: 'dino-held' };

// ---------- Spielstand ----------
let save = freshSave();
try { save = sanitizeSave(JSON.parse(localStorage.getItem(STORE)), LEVEL_COUNT); } catch { /* Privatmodus */ }
const persist = () => { try { localStorage.setItem(STORE, JSON.stringify(save)); } catch { /* voll oder gesperrt */ } };

// ---------- Ton ----------
let actx = null;
function unlockAudio() { if (save.mute) return; try { actx ??= new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === 'suspended') actx.resume(); } catch { actx = null; } }
function tone(freq, dur, type = 'sine', vol = 0.14, slide = 0, delay = 0) {
  if (save.mute || !actx) return;
  try {
    const t = actx.currentTime + delay, o = actx.createOscillator(), g = actx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(actx.destination); o.start(t); o.stop(t + dur + 0.03);
  } catch { /* egal */ }
}
const SFX = {
  friend: () => { tone(660, 0.12, 'triangle'); tone(880, 0.12, 'triangle', 0.14, 0, 0.1); tone(1175, 0.2, 'triangle', 0.14, 0, 0.2); },
  fruit: () => { tone(520, 0.1); tone(780, 0.15, 'sine', 0.14, 0, 0.08); },
  grab: () => tone(330, 0.06, 'triangle', 0.06),
  snore: () => { tone(85, 0.55, 'sawtooth', 0.05, 1.7); tone(120, 0.4, 'sine', 0.06, 0.6, 0.5); },
  feed: () => { for (let i = 0; i < 4; i++) tone(180 + i * 25, 0.07, 'square', 0.05, 0, i * 0.11); tone(620, 0.3, 'triangle', 0.12, 1.6, 0.48); },
  lever: () => { tone(240, 0.05, 'square', 0.07); tone(400, 0.45, 'triangle', 0.12, 2.2, 0.08); },
  bonk: () => { tone(520, 0.4, 'sine', 0.18, 0.3); tone(900, 0.12, 'triangle', 0.06, 0, 0.05); },
  respawn: () => tone(700, 0.25, 'sine', 0.08, 1.6),
  locked: () => { tone(260, 0.1, 'triangle', 0.08); tone(200, 0.16, 'triangle', 0.08, 0, 0.12); },
  win: () => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.24, 'triangle', 0.15, 0, i * 0.12))
};
const SPEAKER_ON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9z" fill="currentColor"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>';
const SPEAKER_OFF = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9z" fill="currentColor"/><path d="M16.5 9.5l5 5M21.5 9.5l-5 5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>';
function paintMute() { for (const b of [$('muteBtn'), $('muteBtn2')]) { b.innerHTML = save.mute ? SPEAKER_OFF : SPEAKER_ON; b.setAttribute('aria-pressed', String(!save.mute)); } }
function toggleMute() { save.mute = !save.mute; persist(); paintMute(); if (!save.mute) { unlockAudio(); SFX.fruit(); } }

// ---------- Zustand ----------
let mode = 'menu', levelNo = 1, lv = LEVELS[0], st = newState(lv), L = layout(lv);
let acc = 0, last = 0, now = 0, winAt = 0, tipAt = 0;
let trail = [], fx = [], reveal = [], bump = {}, fedAt = {}, fedSide = {}, lockedAt = -9, bonkAt = -9;
const challenge = parseChallenge(location.search, LEVEL_COUNT);
let activeCh = null;

// ---------- Größe ----------
let cw = 1, ch = 1, dpr = 1, sc = 1, ox = 0, oy = 0, staticCv = null;
function resize() {
  cw = app.clientWidth; ch = app.clientHeight; dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
  sc = Math.min(cw / W, ch / H); ox = (cw - W * sc) / 2; oy = (ch - H * sc) / 2;
  buildStatic();
}
new ResizeObserver(resize).observe(app);
const world = (c = ctx) => c.setTransform(sc * dpr, 0, 0, sc * dpr, ox * dpr, oy * dpr);
const top = () => -oy / sc, bottom = () => H + oy / sc; // sichtbarer Weltbereich (Hochformat-Ränder)

// ---------- Eingabe ----------
const stickEl = $('stick'), knob = $('knob'), R = 56, DEAD = 12;
const stick = { id: null, ox: 0, oy: 0, x: 0, y: 0, armed: false };
const keys = new Set();
function placeStick() { stickEl.style.left = stick.ox + 'px'; stickEl.style.top = stick.oy + 'px'; knob.style.transform = `translate(${stick.x * R}px,${stick.y * R}px)`; }
function releaseStick() { stick.id = null; stick.x = stick.y = 0; stickEl.classList.remove('on'); }
app.addEventListener('pointerdown', (e) => {
  unlockAudio();
  if (mode !== 'play' || stick.id !== null || e.target.closest('button,a,.screen')) return;
  e.preventDefault(); hideTip();
  const r = app.getBoundingClientRect();
  Object.assign(stick, { id: e.pointerId, ox: e.clientX - r.left, oy: e.clientY - r.top, x: 0, y: 0, armed: false });
  try { app.setPointerCapture(e.pointerId); } catch { /* alte Browser */ }
  placeStick(); stickEl.classList.add('on');
});
app.addEventListener('pointermove', (e) => {
  if (e.pointerId !== stick.id) return;
  e.preventDefault();
  const r = app.getBoundingClientRect();
  let dx = e.clientX - r.left - stick.ox, dy = e.clientY - r.top - stick.oy, d = Math.hypot(dx, dy);
  if (!stick.armed && d < DEAD) { stick.x = stick.y = 0; placeStick(); return; } // Aufsetzen allein bewegt nichts
  stick.armed = true;
  const maxD = R * 1.6;
  if (d > maxD) { const k = (d - maxD) / d; stick.ox += dx * k; stick.oy += dy * k; dx -= dx * k; dy -= dy * k; d = maxD; } // Joystick wandert mit
  const m = Math.min(1, d / R); stick.x = d ? dx / d * m : 0; stick.y = d ? dy / d * m : 0;
  placeStick();
});
for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) app.addEventListener(t, (e) => { if (e.pointerId === stick.id) releaseStick(); });
app.addEventListener('touchstart', (e) => { if (mode === 'play' && !e.target.closest('button,a,.screen')) e.preventDefault(); }, { passive: false });
app.addEventListener('touchmove', (e) => { if (mode === 'play' || !e.target.closest('.screen')) e.preventDefault(); }, { passive: false });
for (const t of ['gesturestart', 'gesturechange', 'dblclick', 'contextmenu']) document.addEventListener(t, (e) => e.preventDefault(), { passive: false });
const KEYMAP = { ArrowLeft: 'l', KeyA: 'l', ArrowRight: 'r', KeyD: 'r', ArrowUp: 'u', KeyW: 'u', ArrowDown: 'd', KeyS: 'd' };
addEventListener('keydown', (e) => {
  if (KEYMAP[e.code]) { keys.add(KEYMAP[e.code]); if (mode === 'play') { e.preventDefault(); hideTip(); } unlockAudio(); }
  else if ((e.code === 'Escape' || e.code === 'KeyP') && (mode === 'play' || mode === 'pause')) mode === 'play' ? pause() : resume();
  else if (e.code === 'KeyR' && (mode === 'play' || mode === 'pause')) startLevel(levelNo);
});
addEventListener('keyup', (e) => { if (KEYMAP[e.code]) keys.delete(KEYMAP[e.code]); });
addEventListener('blur', () => { keys.clear(); releaseStick(); if (mode === 'play') pause(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && mode === 'play') pause(); });
function input() {
  const kx = (keys.has('r') ? 1 : 0) - (keys.has('l') ? 1 : 0), ky = (keys.has('u') ? 1 : 0) - (keys.has('d') ? 1 : 0);
  if (kx || ky) return { x: kx, y: ky };
  return { x: stick.x, y: -stick.y };
}

function hideTip() { $('tip').classList.add('away'); }

// ---------- Bildschirme ----------
const SCREENS = ['menu', 'levels', 'pause', 'done'];
function show(id) { for (const s of SCREENS) $(s).hidden = s !== id; $('hud').hidden = !(id === null || id === 'pause'); if (id !== null) { releaseStick(); } }
function toast(text) { const t = $('toast'); t.textContent = text; t.hidden = false; clearTimeout(toast.h); toast.h = setTimeout(() => (t.hidden = true), 3200); }

function nextLevel() { for (let n = 1; n <= save.unlocked; n++) if (!save.best[n]) return n; return save.unlocked; }
function openMenu() {
  mode = 'menu'; show('menu');
  const box = $('challengeBox');
  if (challenge) {
    box.hidden = false;
    box.innerHTML = `🏆 Herausforderung · Level ${challenge.l}<b>${fmt(challenge.t)}</b>${challenge.r ? `mit ${challenge.r} Rücksetzer${challenge.r === 1 ? '' : 'n'} · ` : ''}Schaffst du es schneller?`;
    $('playLabel').textContent = 'Annehmen';
  } else { box.hidden = true; $('playLabel').textContent = save.best[1] ? 'Weiter' : 'Spielen'; }
}
function openLevels() {
  mode = 'levels'; show('levels');
  const g = $('grid'); g.textContent = ''; const nx = nextLevel();
  for (let n = 1; n <= LEVEL_COUNT; n++) {
    const b = document.createElement('button'), best = save.best[n];
    b.innerHTML = `${n}${best ? `<small>${(best.t / HZ).toFixed(1).replace('.', ',')} s</small>` : ''}`;
    b.setAttribute('aria-label', `Level ${n}${best ? ', Bestzeit ' + fmt(centis(best.t)) : ''}`);
    if (best) b.classList.add('done'); if (n === nx && !best) b.classList.add('next');
    b.disabled = n > save.unlocked && !(challenge && challenge.l === n);
    b.onclick = () => startLevel(n);
    g.append(b);
  }
}
function pause() { if (mode !== 'play') return; mode = 'pause'; show('pause'); }
function resume() { mode = 'play'; acc = 0; show(null); }

$('playBtn').onclick = () => { unlockAudio(); startLevel(challenge ? challenge.l : nextLevel()); };
$('levelsBtn').onclick = openLevels; $('levelsBack').onclick = openMenu;
$('muteBtn').onclick = toggleMute; $('muteBtn2').onclick = toggleMute;
$('pauseBtn').onclick = pause; $('resumeBtn').onclick = resume;
$('restartBtn').onclick = () => startLevel(levelNo); $('pauseLevels').onclick = openLevels;
$('retryBtn').onclick = () => startLevel(levelNo); $('doneLevels').onclick = openLevels;
$('nextBtn').onclick = () => (levelNo < LEVEL_COUNT ? startLevel(levelNo + 1 <= save.unlocked ? levelNo + 1 : nextLevel()) : openLevels());
$('shareBtn').onclick = share;

// ---------- Level ----------
function startLevel(n) {
  levelNo = n; lv = LEVELS[n - 1]; st = newState(lv); L = layout(lv);
  activeCh = challenge && challenge.l === n ? challenge : null;
  acc = 0; winAt = 0; fx = []; trail = []; bump = {}; fedAt = {}; fedSide = {}; lockedAt = -9; bonkAt = -9;
  reveal = lv.ladders.map(() => -1);
  buildStatic(); track();
  mode = 'play'; show(null);
  $('lvl').textContent = n;
  const desk = n === 1 && matchMedia('(pointer:fine)').matches;
  $('tipIcon').textContent = desk ? '⌨️' : lv.tip.icon; $('tipText').textContent = desk ? 'Pfeiltasten oder mit der Maus ziehen' : lv.tip.text;
  $('tipLevel').textContent = activeCh ? `Level ${n} · Ziel ${fmt(activeCh.t)}` : `Level ${n}`;
  const tip = $('tip'); tip.hidden = false; tip.classList.remove('away'); tipAt = now;
  hud(true);
}
function finish() {
  mode = 'done';
  const cs = centis(st.time), wasUnlocked = save.unlocked, hadBest = !!save.best[levelNo];
  const record = recordRun(save, levelNo, st.time, st.resets, LEVEL_COUNT);
  if (levelNo > wasUnlocked) save.unlocked = wasUnlocked; // Herausforderung schaltet nichts außer der Reihe frei
  persist();
  $('doneTitle').textContent = ['Geschafft!', 'Super!', 'Toll gemacht!', 'Juhu!'][levelNo % 4];
  $('doneTime').textContent = fmt(cs); $('doneResets').textContent = st.resets;
  $('record').hidden = !(record && hadBest);
  const res = $('result');
  if (activeCh) {
    const won = beats(st.time, st.resets, activeCh), diff = Math.abs(activeCh.t - cs);
    res.hidden = false; res.className = 'result ' + (won ? 'win' : 'lose');
    res.textContent = won ? (diff ? `🏆 Herausforderung geschafft – ${fmt(diff)} schneller!` : '🏆 Herausforderung geschafft – gleiche Zeit, weniger Rücksetzer!')
      : (diff ? `Knapp! Noch ${fmt(diff)} schneller – nochmal?` : 'Gleiche Zeit! Mit weniger Rücksetzern gewinnst du.');
  } else res.hidden = true;
  const nx = LEVELS[levelNo];
  $('nextTip').textContent = nx ? `Als Nächstes: ${nx.tip.icon} ${nx.tip.text}` : '🎉 Du hast alle Level geschafft!';
  show('done');
}
async function share() {
  const cs = centis(st.time);
  const url = `${location.origin}/spiele/dino-leiterhelden?l=${levelNo}&t=${cs}&r=${st.resets}`;
  const text = `Dino-Leiterhelden, Level ${levelNo}: Ich habe alle 3 Freunde in ${fmt(cs)} ins Baumhaus gebracht. Schaffst du es schneller?`;
  if (navigator.share) { try { await navigator.share({ title: 'Dino-Leiterhelden', text, url }); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
  try { await navigator.clipboard.writeText(text + ' ' + url); toast('Link kopiert – schick ihn an deine Freunde!'); } catch { toast(url); }
}

// ---------- Ereignisse ----------
function playerPos() {
  if (st.ladder >= 0) { const l = lv.ladders[st.ladder]; return { x: st.x, y: L.ys[l.f] - st.p * L.gap, climb: true }; }
  return { x: st.x, y: L.ys[st.f], climb: false };
}
function track() {
  const p = playerPos(), q = trail[trail.length - 1];
  if (!q || Math.hypot(p.x - q.x, p.y - q.y) >= 6) { trail.push({ ...p, face: st.face }); if (trail.length > 300) trail.splice(0, trail.length - 300); }
}
function handle() {
  for (const e of st.events) {
    const p = playerPos();
    if (e.t === 'friend') { SFX.friend(); burst(p.x, p.y - 70, FRIEND[e.i].body, 18, 'heart'); }
    else if (e.t === 'fruit') { SFX.fruit(); burst(p.x, p.y - 120, '#ffb02e', 10); }
    else if (e.t === 'lever') { SFX.lever(); reveal[e.ladder] = now; const l = lv.ladders[e.ladder]; burst(l.x, L.ys[l.f] - L.gap / 2, '#fff2a8', 26, 'star'); }
    else if (e.t === 'feed') { SFX.feed(); fedAt[e.m] = now; fedSide[e.m] = Math.sign(lv.monsters[e.m].x - st.x) || 1; burst(lv.monsters[e.m].x, L.ys[lv.monsters[e.m].f] - 90, '#ff7aa8', 12, 'heart'); }
    else if (e.t === 'snore') { SFX.snore(); bump[e.m] = now; }
    else if (e.t === 'bonk') { SFX.bonk(); bonkAt = now; burst(p.x, p.y - 120, '#ffe14d', 10, 'star'); }
    else if (e.t === 'respawn') { SFX.respawn(); trail = []; track(); burst(st.x, L.ys[st.f] - 60, '#ffffff', 16, 'star'); }
    else if (e.t === 'locked') { SFX.locked(); lockedAt = now; }
    else if (e.t === 'grab') SFX.grab();
    else if (e.t === 'win') { SFX.win(); for (let i = 0; i < 4; i++) burst(lv.door.x + (i - 1.5) * 60, L.ys[lv.floors.length - 1] - 200, ['#ff8fa8', '#ffd23f', '#3fc9bd', '#8fd66a'][i], 14, 'conf'); }
  }
  st.events.length = 0;
}
function burst(x, y, color, n, kind = 'dot') {
  for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, v = 80 + Math.random() * 220; fx.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 160, life: 0, max: 0.7 + Math.random() * 0.6, color, kind, r: Math.random() * 6 }); }
}

// ---------- Hauptschleife ----------
function frame(ms) {
  requestAnimationFrame(frame);
  now = ms / 1000; const dt = Math.min(0.1, Math.max(0, now - last)); last = now;
  if (mode === 'play') {
    acc += dt; let n = 0;
    while (acc >= 1 / HZ && n < 8) { const v = input(); step(st, v.x, v.y); handle(); acc -= 1 / HZ; n++; if (st.done) break; }
    if (n >= 8) acc = 0;
    track();
    if (st.done) { mode = 'win'; winAt = now; releaseStick(); }
    if (st.started || now - tipAt > 9) hideTip();
  }
  if (mode === 'win' && now - winAt > 2.1) finish();
  draw(dt); hud();
}
let hudCache = '';
function hud(force) {
  const secs = Math.floor(st.time / HZ), key = secs + '|' + st.got.join('');
  if (!force && key === hudCache) return; hudCache = key;
  $('clock').textContent = Math.floor(secs / 60) + ':' + String(secs % 60).padStart(2, '0');
  [...$('hudFriends').children].forEach((i, k) => i.classList.toggle('on', !!st.got[k]));
}

// ---------- Zeichnen: statische Ebene (Hintergrund + Plattformen) ----------
function buildStatic() {
  if (!cv.width) return;
  staticCv ??= document.createElement('canvas');
  staticCv.width = cv.width; staticCv.height = cv.height;
  const c = staticCv.getContext('2d');
  c.setTransform(1, 0, 0, 1, 0, 0);
  const bgIdx = Math.min(3, Math.floor((levelNo - 1) / 10) + 1); load(LAZY[bgIdx - 1]);
  const bg = pic(LAZY[bgIdx - 1]);
  if (bg) { const k = Math.max(cv.width / bg.width, cv.height / bg.height); c.drawImage(bg, (cv.width - bg.width * k) / 2, (cv.height - bg.height * k) / 2, bg.width * k, bg.height * k); c.fillStyle = bgIdx === 3 ? 'rgba(20,10,50,.18)' : 'rgba(255,250,235,.16)'; c.fillRect(0, 0, cv.width, cv.height); world(c); }
  else { world(c); paintBackdrop(c); }
  for (let f = 0; f < lv.floors.length; f++) for (const [a, b] of lv.floors[f]) paintPlatform(c, a, b, L.ys[f], f);
}
function paintBackdrop(c) {
  const y0 = top(), y1 = bottom();
  const sky = c.createLinearGradient(0, y0, 0, y1); sky.addColorStop(0, '#7cd3f6'); sky.addColorStop(0.55, '#c9eef0'); sky.addColorStop(1, '#a8dca0');
  c.fillStyle = sky; c.fillRect(-200, y0, W + 400, y1 - y0);
  // ferne Berge mit Wasserfällen
  c.fillStyle = '#9fcdbb';
  c.beginPath(); c.moveTo(-200, 900); [[-40, 520], [120, 700], [230, 470], [380, 760], [560, 600], [700, 440], [860, 640], [1100, 520], [1100, 1100], [-200, 1100]].forEach(([x, y]) => c.lineTo(x, y)); c.fill();
  c.fillStyle = 'rgba(255,255,255,.75)'; for (const [x, y, h] of [[120, 720, 300], [770, 560, 360], [40, 800, 240]]) c.fillRect(x, y, 14, h);
  c.fillStyle = '#7fbf86'; c.beginPath(); c.moveTo(-200, 1200); for (let x = -200; x <= 1100; x += 100) c.quadraticCurveTo(x + 50, 1080 + ((x / 100) % 3) * 30, x + 100, 1150); c.lineTo(1100, y1); c.lineTo(-200, y1); c.fill();
  // Baumstamm mit Wurzeln
  const tw = c.createLinearGradient(290, 0, 610, 0); tw.addColorStop(0, '#6a3f1f'); tw.addColorStop(0.45, '#9b6638'); tw.addColorStop(1, '#5a3418');
  c.fillStyle = tw; c.beginPath(); c.moveTo(330, 160); c.bezierCurveTo(310, 600, 300, 1200, 220, y1); c.lineTo(680, y1); c.bezierCurveTo(600, 1200, 590, 600, 570, 160); c.fill();
  c.strokeStyle = 'rgba(60,32,12,.35)'; c.lineWidth = 6;
  for (const x of [380, 450, 520]) { c.beginPath(); c.moveTo(x, 200); c.bezierCurveTo(x - 20, 700, x + 20, 1100, x - 10, y1); c.stroke(); }
  c.fillStyle = '#4c2b12'; c.beginPath(); c.ellipse(450, 1290, 46, 70, 0, 0, Math.PI * 2); c.fill();
  // Laubkrone
  for (const [x, y, r, col] of [[450, 120, 260, '#3f9a3a'], [200, 180, 170, '#4fae45'], [700, 170, 180, '#4fae45'], [450, 20, 220, '#5cbf4f'], [80, 330, 120, '#3f9a3a'], [830, 320, 130, '#3f9a3a']]) { c.fillStyle = col; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); }
  c.fillStyle = 'rgba(255,255,255,.12)'; for (const [x, y, r] of [[380, 40, 70], [640, 110, 60], [170, 140, 50]]) { c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); }
  // Büsche unten
  for (let x = -60; x < 980; x += 110) { c.fillStyle = x % 220 ? '#3e8f37' : '#4aa142'; c.beginPath(); c.arc(x, y1 - 30, 90, 0, Math.PI * 2); c.fill(); }
}
function paintPlatform(c, a, b, y, f) {
  const img = pic('plattform'), end = pic('plattform-ende');
  if (img) {
    const h = 54, tw = img.width * h / img.height;
    for (let x = a; x < b; x += tw) { const w = Math.min(tw, b - x); c.drawImage(img, 0, 0, img.width * w / tw, img.height, x, y - 12, w, h); }
    if (end) { c.drawImage(end, a - 34, y - 12, 54, 54); c.save(); c.translate(b + 34, 0); c.scale(-1, 1); c.drawImage(end, 0, y - 12, 54, 54); c.restore(); }
    const fence = pic('gelaender');
    if (fence) for (const [fx, dir] of [[a, 1], [b, -1]]) { c.save(); c.translate(fx, 0); c.scale(dir, 1); c.drawImage(fence, 0, 0, 100, 64, -4, y - 46, 70, 45); c.restore(); }
    return;
  }
  // Platzhalter: Holzbrett mit Moos, Geländerpfosten an den Enden
  c.fillStyle = 'rgba(0,0,0,.18)'; rr(c, a + 4, y + 8, b - a, 32, 12); c.fill();
  c.fillStyle = '#9a5f2c'; rr(c, a, y, b - a, 30, 12); c.fill();
  c.fillStyle = '#7b4720'; rr(c, a, y + 17, b - a, 13, 8); c.fill();
  c.strokeStyle = 'rgba(70,36,12,.45)'; c.lineWidth = 3;
  for (let x = a + 60; x < b - 20; x += 72) { c.beginPath(); c.moveTo(x, y + 3); c.lineTo(x, y + 27); c.stroke(); }
  c.fillStyle = '#5cbf3c'; rr(c, a - 6, y - 9, b - a + 12, 15, 8); c.fill();
  c.fillStyle = '#8be05a'; rr(c, a + 4, y - 9, b - a - 8, 5, 3); c.fill();
  c.strokeStyle = '#3f9a2e'; c.lineWidth = 4; c.lineCap = 'round';
  for (let x = a + 30 + (f * 37) % 50; x < b - 20; x += 130) { const len = 30 + ((x * 7) % 40); c.beginPath(); c.moveTo(x, y + 26); c.quadraticCurveTo(x + 10, y + 26 + len / 2, x - 4, y + 26 + len); c.stroke(); c.fillStyle = '#5cbf3c'; c.beginPath(); c.ellipse(x - 4, y + 28 + len, 7, 4, 0.6, 0, Math.PI * 2); c.fill(); }
  for (const x of [a + 12, b - 12]) { c.fillStyle = '#7b4720'; rr(c, x - 7, y - 46, 14, 50, 5); c.fill(); c.fillStyle = '#b07a44'; c.beginPath(); c.arc(x, y - 46, 8, 0, Math.PI * 2); c.fill(); }
}
function rr(c, x, y, w, h, r) { c.beginPath(); c.roundRect ? c.roundRect(x, y, w, h, r) : c.rect(x, y, w, h); }

// ---------- Zeichnen: Bild ----------
function draw(dt) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (staticCv) ctx.drawImage(staticCv, 0, 0); else { ctx.fillStyle = '#8fd8f2'; ctx.fillRect(0, 0, cv.width, cv.height); }
  world();
  const t = now, topF = lv.floors.length - 1;
  drawHouse(t, topF);
  lv.ladders.forEach((l, i) => drawLadder(l, i, t));
  (lv.levers || []).forEach((o, i) => drawLever(o, i, t));
  (lv.fruits || []).forEach((o, i) => { if (!st.taken[i]) drawFruit(o.x, L.ys[o.f] - 30 + Math.sin(t * 3 + i) * 5, 1); });
  (lv.monsters || []).forEach((m, i) => drawMonster(m, i, t));
  (lv.nuts || []).forEach((n) => drawNut(n, t));
  // Freunde: wartend oder hinterher
  let k = 0;
  for (const i of [0, 1, 2]) if (!st.got[i]) drawWaiting(i, t);
  for (const i of st.order) drawFollower(i, k++, t);
  drawHero(t);
  if (st.stun > 0) drawFlag(st.cp.x, L.ys[st.cp.f], t);
  // Effekte
  fx = fx.filter((p) => (p.life += dt) < p.max);
  for (const p of fx) {
    p.vy += 600 * dt; p.x += p.vx * dt; p.y += p.vy * dt;
    const a = 1 - p.life / p.max; ctx.globalAlpha = a; ctx.fillStyle = p.color;
    const fxImg = pic('effekte');
    if (fxImg && (p.kind === 'heart' || p.kind === 'star')) { const z = 26 + p.r * 2; ctx.drawImage(fxImg, (p.kind === 'heart' ? 2 : 3) * 128, 0, 128, 128, p.x - z / 2, p.y - z / 2, z, z); }
    else if (p.kind === 'heart') heart(p.x, p.y, 10 + p.r);
    else if (p.kind === 'star') star(p.x, p.y, 9 + p.r, p.life * 6);
    else if (p.kind === 'conf') { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.life * 9 + p.r); ctx.fillRect(-7, -4, 14, 8); ctx.restore(); }
    else { ctx.beginPath(); ctx.arc(p.x, p.y, 5 + p.r / 2, 0, Math.PI * 2); ctx.fill(); }
  }
  ctx.globalAlpha = 1;
}

function drawLadder(l, i, t) {
  const yb = L.ys[l.f], yt = L.ys[l.f + 1] - 40, vis = st.vis[i];
  if (!vis) { // Umriss, wo die Leiter erscheint
    ctx.save(); ctx.globalAlpha = 0.35 + Math.sin(t * 3) * 0.1; ctx.setLineDash([10, 10]); ctx.strokeStyle = '#fff'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(l.x - 30, yb); ctx.lineTo(l.x - 30, yt); ctx.moveTo(l.x + 30, yb); ctx.lineTo(l.x + 30, yt); ctx.stroke(); ctx.restore();
    ctx.font = '700 34px Fredoka, sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.fillText('?', l.x, (yb + yt) / 2 + 12); return;
  }
  const grow = reveal[i] >= 0 ? clamp((t - reveal[i]) / 0.6, 0, 1) : 1, y2 = yb - (yb - yt) * grow;
  const img = pic('leiter');
  if (img) { const w = 84, h = img.height * w / img.width; ctx.save(); ctx.beginPath(); ctx.rect(l.x - 50, y2, 100, yb - y2 + 4); ctx.clip(); for (let y = yb - h; y > y2 - h; y -= h) ctx.drawImage(img, l.x - w / 2, y, w, h); ctx.restore(); return; }
  ctx.lineCap = 'round';
  for (const [col, wdt] of [['#6b3d17', 13], ['#d39a57', 8]]) {
    ctx.strokeStyle = col; ctx.lineWidth = wdt; ctx.beginPath();
    for (let y = yb - 22; y > y2 + 6; y -= 30) { ctx.moveTo(l.x - 28, y); ctx.lineTo(l.x + 28, y); }
    ctx.moveTo(l.x - 30, yb + 4); ctx.lineTo(l.x - 30, y2); ctx.moveTo(l.x + 30, yb + 4); ctx.lineTo(l.x + 30, y2); ctx.stroke();
  }
}
function drawLever(o, i, t) {
  const y = L.ys[o.f], on = st.on[i], img = pic('hebel');
  if (img) { const s = img.height; ctx.drawImage(img, on ? s : 0, 0, s, s, o.x - 50, y - 92, 100, 100); }
  else {
    ctx.fillStyle = '#6b3d17'; rr(ctx, o.x - 28, y - 18, 56, 20, 8); ctx.fill();
    ctx.save(); ctx.translate(o.x, y - 14); ctx.rotate(on ? 0.7 : -0.7); ctx.strokeStyle = '#a8763f'; ctx.lineWidth = 9; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -52); ctx.stroke();
    ctx.fillStyle = on ? '#6fd04b' : '#ff5d4a'; ctx.beginPath(); ctx.arc(0, -56, 12, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }
  if (!on) { ctx.globalAlpha = 0.6 + Math.sin(t * 5) * 0.3; ctx.fillStyle = '#fff2a8'; star(o.x, y - 104 + Math.sin(t * 3) * 4, 13, t); ctx.globalAlpha = 1; }
}
function drawFruit(x, y, s) {
  const img = pic('frucht');
  if (img) { ctx.drawImage(img, x - 30 * s, y - 30 * s, 60 * s, 60 * s); return; }
  ctx.fillStyle = '#ff9a1f'; ctx.beginPath(); ctx.arc(x, y, 21 * s, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.beginPath(); ctx.ellipse(x - 7 * s, y - 8 * s, 6 * s, 4 * s, -0.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#3f9a2e'; ctx.beginPath(); ctx.ellipse(x + 9 * s, y - 22 * s, 11 * s, 5 * s, -0.4, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#6b3d17'; ctx.lineWidth = 3 * s; ctx.beginPath(); ctx.moveTo(x, y - 18 * s); ctx.lineTo(x + 2 * s, y - 26 * s); ctx.stroke();
}
function drawNut(n, t) {
  const y = L.ys[n.f], hy = y - L.gap + 76, ph = nutPhase(n, st.clock), P = n.period, img = pic('kokosnuss');
  const ball = (x, yy, r = 22) => { if (img) ctx.drawImage(img, x - r * 1.35, yy - r * 1.35, r * 2.7, r * 2.7); else { ctx.fillStyle = '#7a4a24'; ctx.strokeStyle = '#fff1cf'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(x, yy, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#a36a39'; ctx.beginPath(); ctx.arc(x - 6, yy - 7, 7, 0, Math.PI * 2); ctx.fill(); } };
  // Nuss hängt an einer kurzen Ranke unter der Plattform darüber
  ctx.strokeStyle = '#3f8f2e'; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(n.x, hy - 46); ctx.quadraticCurveTo(n.x + 8, hy - 34, n.x, hy - 20); ctx.stroke();
  ctx.fillStyle = '#5cbf3c'; ctx.beginPath(); ctx.ellipse(n.x + 10, hy - 36, 10, 5, -0.5, 0, Math.PI * 2); ctx.fill();
  const warnStart = P - C.warn, fallStart = P - C.fall;
  if (ph >= warnStart) { const q = (ph - warnStart) / C.warn; ctx.fillStyle = `rgba(40,20,0,${0.15 + q * 0.35})`; ctx.beginPath(); ctx.ellipse(n.x, y - 2, 14 + q * 34, 5 + q * 6, 0, 0, Math.PI * 2); ctx.fill(); }
  if (ph >= fallStart) { const q = (ph - fallStart) / C.fall; ball(n.x, hy + (y - 22 - hy) * q * q); }
  else if (ph < C.hit + 30) { // aufgeschlagen, kullert weg
    const q = ph / (C.hit + 30); ctx.globalAlpha = 1 - q; ball(n.x + q * 70, y - 22 - Math.sin(q * Math.PI) * 30); ctx.globalAlpha = 1;
  } else if (ph > 40) { const wob = ph >= warnStart ? Math.sin(t * 40) * 4 : Math.sin(t * 2) * 1.5; ctx.globalAlpha = Math.min(1, (ph - 40) / 20); ball(n.x + wob, hy); ctx.globalAlpha = 1; }
}
function drawMonster(m, i, t) {
  const y = L.ys[m.f], fed = st.fed[i], fa = fedAt[i] ?? 0, q = fed ? clamp((t - fa) / 0.8, 0, 1) : 0;
  const x = m.x + (fed ? (fedSide[i] || 1) * 70 * q : 0), bumped = !fed && t - (bump[i] ?? -9) < 1.6, s = 1 - 0.15 * q;
  const img = pic('schlafmonster');
  ctx.save(); ctx.translate(x + (bumped && t - bump[i] < 0.4 ? Math.sin(t * 50) * 4 : 0), y); ctx.scale(s, s * (fed ? 1 : 1 + Math.sin(t * 2) * 0.03));
  if (img) { const fw = img.width / 4, fr = fed ? 3 : bumped ? 2 : Math.floor(t * 1.2) % 2; ctx.drawImage(img, fr * fw, 0, fw, img.height, -130, -173 * 240 / 256, 260, 173); }
  else {
    ctx.fillStyle = 'rgba(0,0,0,.15)'; ctx.beginPath(); ctx.ellipse(0, 2, 100, 12, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#a57ee6'; ctx.beginPath(); ctx.ellipse(10, -50, 98, 50, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#8a62d0'; for (const [sx, sy, r] of [[40, -80, 12], [70, -60, 9], [10, -88, 8], [85, -85, 7]]) { ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = '#c8b0f4'; ctx.beginPath(); ctx.ellipse(0, -28, 66, 24, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#a57ee6'; ctx.beginPath(); ctx.ellipse(-68, -66, 46, 40, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f0a54a'; for (const hx of [-90, -56]) { ctx.beginPath(); ctx.moveTo(hx - 8, -100); ctx.lineTo(hx, -124); ctx.lineTo(hx + 8, -100); ctx.fill(); }
    ctx.strokeStyle = '#3c2357'; ctx.lineWidth = 4; ctx.lineCap = 'round';
    for (const ex of [-88, -60]) {
      if (bumped) { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(ex, -74, 10, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#3c2357'; ctx.beginPath(); ctx.arc(ex - 2, -73, 5, 0, Math.PI * 2); ctx.fill(); }
      else { ctx.beginPath(); fed ? ctx.arc(ex, -70, 8, Math.PI * 1.1, Math.PI * 1.9) : ctx.arc(ex, -76, 8, Math.PI * 0.1, Math.PI * 0.9); ctx.stroke(); }
    }
    ctx.fillStyle = '#3c2357'; ctx.beginPath(); ctx.ellipse(-78, -48, 12, fed ? 6 + Math.abs(Math.sin(t * 10)) * 6 : 4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(-70, -50); ctx.lineTo(-66, -40); ctx.lineTo(-62, -50); ctx.fill();
  }
  ctx.restore();
  if (fed) { if (Math.floor(t * 2) % 2) { ctx.fillStyle = '#ff7aa8'; heart(x - 40, y - 150 - (t * 30 % 20), 12); } drawFruit(x - 60, y - 52, 0.7 * (1 - clamp((t - fa) / 4, 0, 0.8))); }
  else if (bumped) { // Denkblase: Ich will eine Frucht!
    const bx = x - 30, by = y - 180;
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#7a4a24'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.ellipse(bx, by, 52, 40, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    for (const [cx, cy, r] of [[bx + 30, by + 46, 10], [bx + 44, by + 66, 6]]) { ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
    drawFruit(bx, by + 4, 1.1);
  } else { ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.font = '700 28px Fredoka'; ctx.textAlign = 'center'; for (let k = 0; k < 3; k++) { const q2 = (t * 0.6 + k / 3) % 1; ctx.globalAlpha = 1 - q2; ctx.fillText('z', x - 70 + q2 * 50, y - 120 - q2 * 70); } ctx.globalAlpha = 1; }
}
function drawHouse(t, f) {
  const y = L.ys[f], dx = lv.door.x, hx = clamp(dx, 175, 725), open = gotAll(st), img = pic('baumhaus');
  if (img) { const k = 380 / 640; ctx.save(); ctx.beginPath(); ctx.rect(dx - 200, y - 300, 400, 304); ctx.clip(); ctx.drawImage(img, dx - 320 * k, y - 388 * k, 640 * k, 480 * k); ctx.restore(); }
  else {
    ctx.fillStyle = '#b77a3f'; rr(ctx, hx - 150, y - 200, 300, 200, 14); ctx.fill();
    ctx.strokeStyle = 'rgba(90,50,20,.4)'; ctx.lineWidth = 3; for (let yy = y - 170; yy < y; yy += 32) { ctx.beginPath(); ctx.moveTo(hx - 148, yy); ctx.lineTo(hx + 148, yy); ctx.stroke(); }
    ctx.fillStyle = '#c4462f'; ctx.beginPath(); ctx.moveTo(hx - 185, y - 190); ctx.lineTo(hx, y - 300); ctx.lineTo(hx + 185, y - 190); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#9a3424'; ctx.fillRect(hx - 185, y - 196, 370, 12);
    const wx = dx > hx ? hx - 95 : hx + 95; ctx.fillStyle = '#ffe08a'; rr(ctx, wx - 26, y - 160, 52, 46, 8); ctx.fill(); ctx.strokeStyle = '#6b3d17'; ctx.lineWidth = 5; ctx.stroke(); ctx.beginPath(); ctx.moveTo(wx, y - 160); ctx.lineTo(wx, y - 114); ctx.stroke();
    ['#ff8fa8', '#ffd23f', '#3fc9bd', '#8fd66a', '#ff9a1f'].forEach((c, k) => { const px = hx - 150 + k * 66; ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(px, y - 210); ctx.lineTo(px + 40, y - 210); ctx.lineTo(px + 20, y - 182 + Math.sin(t * 3 + k) * 3); ctx.fill(); });
  }
  // Tür
  const shake = t - lockedAt < 0.6 ? Math.sin(t * 60) * 5 : 0, doorImg = pic('tuer');
  if (doorImg) { const fw = doorImg.width / 2, w = 84, h = w * doorImg.height / fw; ctx.drawImage(doorImg, open ? fw : 0, 0, fw, doorImg.height, dx - w / 2 + shake, y - h + 3, w, h); }
  else {
    ctx.fillStyle = open ? '#ffd56a' : '#6b3d17'; rr(ctx, dx - 44 + shake, y - 124, 88, 124, 40); ctx.fill();
    if (open) { const g = ctx.createRadialGradient(dx, y - 60, 5, dx, y - 60, 90); g.addColorStop(0, 'rgba(255,240,170,.9)'); g.addColorStop(1, 'rgba(255,200,80,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(dx, y - 60, 90, 0, Math.PI * 2); ctx.fill(); }
    else { ctx.fillStyle = '#8a5326'; rr(ctx, dx - 34 + shake, y - 112, 68, 108, 30); ctx.fill(); ctx.fillStyle = '#ffcf4a'; ctx.beginPath(); ctx.arc(dx + 22 + shake, y - 56, 6, 0, Math.PI * 2); ctx.fill(); }
  }
  // Plätze für die drei Freunde über der Tür
  const sy = pic('baumhaus') ? y - 252 : y - 150;
  if (pic('baumhaus')) { ctx.fillStyle = 'rgba(70,38,14,.9)'; rr(ctx, dx - 56, sy - 20, 112, 40, 20); ctx.fill(); ctx.strokeStyle = '#d9a35f'; ctx.lineWidth = 3; ctx.stroke(); }
  for (let k = 0; k < 3; k++) {
    const cx = dx - 32 + k * 32, cy = sy, on = st.got[k];
    ctx.fillStyle = on ? FRIEND[k].body : 'rgba(255,255,255,.35)'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 3;
    if (!on) ctx.setLineDash([5, 4]);
    ctx.beginPath(); ctx.arc(cx, cy, 12 * (t - lockedAt < 0.6 && !on ? 1.25 : 1), 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.setLineDash([]);
  }
}
function drawFlag(x, y, t) { ctx.strokeStyle = '#6b3d17'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - 80); ctx.stroke(); ctx.fillStyle = '#ffcf4a'; ctx.beginPath(); ctx.moveTo(x, y - 80); ctx.lineTo(x + 40, y - 70 + Math.sin(t * 8) * 4); ctx.lineTo(x, y - 58); ctx.fill(); }

// ---------- Figuren ----------
function drawHero(t) {
  if (mode === 'win' || mode === 'done') { const q = clamp((now - winAt - 1.0) / 0.6, 0, 1); ctx.globalAlpha = 1 - q; }
  const p = playerPos(), stun = st.stun > 0;
  const pose = stun ? 'dizzy' : p.climb ? 'climb' : mode === 'win' ? 'cheer' : st.speed > 0 ? 'walk' : st.carry >= 0 ? 'carry' : 'idle';
  const ph = p.climb ? st.p * L.gap / 40 : t;
  dino(p.x, p.y, { c: HERO, face: st.face, pose, ph, s: 1 });
  if (st.carry >= 0 && !p.climb) drawFruit(p.x, p.y - 150 + Math.sin(t * 6) * 3, 0.95);
  else if (st.carry >= 0) drawFruit(p.x + 34, p.y - 70, 0.8);
  if (stun) { ctx.font = '700 34px Fredoka, sans-serif'; ctx.textAlign = 'center'; ctx.lineWidth = 6; ctx.strokeStyle = '#5a3416'; ctx.strokeText('Bonk!', p.x, p.y - 175); ctx.fillStyle = '#fff'; ctx.fillText('Bonk!', p.x, p.y - 175); }
  if (stun && !pic('dino-held')) for (let k = 0; k < 3; k++) { const a = t * 6 + k * 2.1; ctx.fillStyle = '#ffe14d'; star(p.x + Math.cos(a) * 40, p.y - 140 + Math.sin(a) * 12, 10, a); }
  ctx.globalAlpha = 1;
}
function drawWaiting(i, t) {
  const o = lv.friends[i], y = L.ys[o.f];
  dino(o.x, y, { c: FRIEND[i], face: st.x < o.x && st.f === o.f ? -1 : 1, pose: 'wave', ph: t + i, s: 0.72 });
  ctx.globalAlpha = 0.85 + Math.sin(t * 4 + i) * 0.15; const hy = y - 140 + Math.sin(t * 3 + i) * 6, fxi = pic('effekte'); if (fxi) ctx.drawImage(fxi, 256, 0, 128, 128, o.x - 15, hy - 15, 30, 30); else { ctx.fillStyle = '#ff6f91'; heart(o.x, hy, 14); } ctx.globalAlpha = 1;
}
function drawFollower(i, k, t) {
  const idx = trail.length - 1 - (k + 1) * 11, p = trail[Math.max(0, idx)] || playerPos();
  let x = p.x, y = p.y, alpha = 1;
  if (idx < 0 && !p.climb) x -= (k + 1) * 30 * st.face; // nach Rücksetzer dicht beieinander
  if (mode === 'win' || mode === 'done') { const q = clamp((now - winAt - k * 0.22) / 0.7, 0, 1); x += (lv.door.x - x) * q; alpha = 1 - clamp((now - winAt - k * 0.22 - 0.6) / 0.3, 0, 1); }
  if (alpha <= 0) return;
  ctx.globalAlpha = alpha;
  const moving = st.speed > 0 || st.climbing || mode === 'win';
  dino(x, y, { c: FRIEND[i], face: p.face || 1, pose: p.climb ? 'climb' : moving ? 'walk' : 'idle', ph: p.climb ? (y / 40) : t + k * 0.3, s: 0.72 });
  ctx.globalAlpha = 1;
}
// Ein Dino: Bild aus dem Sprite-Sheet oder Platzhalter-Zeichnung. Füße bei (x, y), Blick nach rechts (face 1) oder links.
const FRAMES = { hero: { idle: [0, 1], walk: [2, 3, 4, 5, 6, 7], climb: [8, 9, 10, 11], cheer: [12, 13], dizzy: [14], carry: [15], wave: [0, 1] },
  friend: { wave: [0, 1], idle: [0], walk: [2, 3], climb: [4, 5], cheer: [6, 7], carry: [0], dizzy: [0] } };
function dino(x, y, o) {
  const img = pic(o.c.sheet);
  if (img) {
    const hero = o.c === HERO, cols = hero ? 8 : 4, cell = img.width / cols, list = FRAMES[hero ? 'hero' : 'friend'][o.pose] || [0];
    const speed = o.pose === 'walk' ? (hero ? 10 : 6) : o.pose === 'climb' ? 1 : 2.5, f = list[Math.floor(Math.abs(o.ph) * speed) % list.length];
    const size = 196 * (hero ? 1 : 1 / 0.72) * o.s, foot = size * 240 / 256;
    ctx.save(); ctx.translate(x, y); if (o.face < 0 && o.pose !== 'climb') ctx.scale(-1, 1);
    ctx.drawImage(img, (f % cols) * cell, Math.floor(f / cols) * cell, cell, cell, -size / 2, -foot, size, size); ctx.restore(); return;
  }
  const c = o.c, s = o.s;
  ctx.save(); ctx.translate(x, y); ctx.scale(o.face < 0 ? -s : s, s);
  ctx.fillStyle = 'rgba(0,0,0,.16)'; ctx.beginPath(); ctx.ellipse(0, 2, 40, 8, 0, 0, Math.PI * 2); ctx.fill();
  if (o.pose === 'climb') { climbPose(c, o.ph); ctx.restore(); return; }
  const walk = o.pose === 'walk' ? Math.sin(o.ph * 12) : 0;
  const bob = o.pose === 'walk' ? -Math.abs(walk) * 5 : o.pose === 'cheer' ? -Math.abs(Math.sin(o.ph * 8)) * 16 : o.pose === 'wave' ? -Math.abs(Math.sin(o.ph * 3)) * 8 : Math.sin(o.ph * 2.5) * 1.5;
  ctx.translate(0, bob);
  const E = (x0, y0, rx, ry, col, rot = 0) => { ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(x0, y0, rx, ry, rot, 0, Math.PI * 2); ctx.fill(); };
  // Schwanz, Beine
  ctx.fillStyle = c.body; ctx.beginPath(); ctx.moveTo(-28, -64); ctx.quadraticCurveTo(-72, -56, -84, -22); ctx.quadraticCurveTo(-52, -28, -22, -30); ctx.fill();
  for (const [lx, d] of [[-16, walk], [16, -walk]]) { ctx.fillStyle = c.dark; rr(ctx, lx - 9 + d * 7, -30 - Math.max(0, d) * 6, 18, 30, 8); ctx.fill(); }
  // Rücken-Merkmal je Figur (Form unterscheidet die Freunde auch ohne Farbe)
  if (c === HERO) { ctx.fillStyle = c.dark; for (let k = 0; k < 4; k++) { const bx = -24 + k * 15; ctx.beginPath(); ctx.moveTo(bx - 7, -76 + k * 2); ctx.lineTo(bx, -92 + k * 2); ctx.lineTo(bx + 7, -76 + k * 2); ctx.fill(); } }
  if (c.plates) { ctx.fillStyle = c.plates; for (let k = 0; k < 4; k++) { const bx = -30 + k * 17; ctx.beginPath(); ctx.moveTo(bx - 10, -74); ctx.lineTo(bx, -98 + Math.abs(k - 1.5) * 6); ctx.lineTo(bx + 10, -74); ctx.fill(); } }
  E(0, -50, 40, 32, c.body); E(8, -42, 25, 20, c.belly);
  if (c === FRIEND[2]) for (const [sx, sy] of [[-18, -64], [-4, -72], [-24, -46], [12, -66]]) E(sx, sy, 5, 5, c.dark);
  // Kopf
  if (c === FRIEND[0]) { E(14, -98, 24, 26, c.dark, -0.4); ctx.fillStyle = '#fff4d6'; for (const [hx, hy] of [[30, -122], [50, -116]]) { ctx.beginPath(); ctx.moveTo(hx - 5, hy + 10); ctx.lineTo(hx + 4, hy - 8); ctx.lineTo(hx + 7, hy + 10); ctx.fill(); } }
  E(30, -90, 30, 27, c.body); E(54, -82, 19, 14, c.body); E(52, -76, 14, 7, c.belly);
  if (o.pose === 'dizzy') { ctx.strokeStyle = '#2b1a0c'; ctx.lineWidth = 3.5; ctx.beginPath(); for (let a = 0; a < 9; a += 0.4) { const r = a * 1.1; ctx.lineTo(38 + Math.cos(a + o.ph * 8) * r, -98 + Math.sin(a + o.ph * 8) * r); } ctx.stroke(); }
  else { E(38, -98, 10, 11, '#fff'); E(41, -97, 5.5, 6.5, '#2b1a0c'); E(43, -100, 2, 2, '#fff'); }
  ctx.strokeStyle = '#2b1a0c'; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(54, -80, 9, 0.2, Math.PI * 0.75); ctx.stroke();
  E(26, -80, 6, 4, 'rgba(255,120,140,.45)');
  // Arme
  ctx.strokeStyle = c.dark; ctx.lineWidth = 9;
  const up = o.pose === 'cheer' || o.pose === 'carry' || (o.pose === 'wave' && Math.sin(o.ph * 6) > 0);
  ctx.beginPath(); ctx.moveTo(22, -58); up ? ctx.lineTo(30 + (o.pose === 'wave' ? Math.sin(o.ph * 12) * 6 : 0), -86) : ctx.lineTo(34, -44); ctx.stroke();
  ctx.restore();
}
function climbPose(c, ph) { // Rückenansicht an der Leiter
  const alt = Math.sin(ph * Math.PI), E = (x0, y0, rx, ry, col) => { ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(x0, y0, rx, ry, 0, 0, Math.PI * 2); ctx.fill(); };
  ctx.fillStyle = c.body; ctx.beginPath(); ctx.moveTo(-10, -30); ctx.quadraticCurveTo(0, 6, 14, -6); ctx.quadraticCurveTo(8, -24, 10, -30); ctx.fill();
  ctx.strokeStyle = c.dark; ctx.lineWidth = 11; ctx.lineCap = 'round';
  for (const sd of [-1, 1]) { ctx.beginPath(); ctx.moveTo(sd * 16, -34); ctx.lineTo(sd * 24, -6 + sd * alt * 8); ctx.stroke(); ctx.beginPath(); ctx.moveTo(sd * 22, -70); ctx.lineTo(sd * 30, -104 - sd * alt * 10); ctx.stroke(); }
  E(0, -54, 34, 36, c.body);
  if (c === HERO || c.plates) { ctx.fillStyle = c.plates || c.dark; for (let k = 0; k < 4; k++) { const by = -84 + k * 14; ctx.beginPath(); ctx.moveTo(-8, by + 6); ctx.lineTo(0, by - 8); ctx.lineTo(8, by + 6); ctx.fill(); } }
  if (c === FRIEND[2]) for (const [sx, sy] of [[-14, -60], [10, -44], [6, -70]]) E(sx, sy, 5, 5, c.dark);
  if (c === FRIEND[0]) E(0, -100, 32, 18, c.dark);
  E(0, -96, 26, 24, c.body);
}
function heart(x, y, r) { ctx.beginPath(); ctx.moveTo(x, y + r * 0.9); ctx.bezierCurveTo(x - r * 1.6, y - r * 0.2, x - r * 0.6, y - r * 1.4, x, y - r * 0.4); ctx.bezierCurveTo(x + r * 0.6, y - r * 1.4, x + r * 1.6, y - r * 0.2, x, y + r * 0.9); ctx.fill(); }
function star(x, y, r, rot = 0) { ctx.beginPath(); for (let k = 0; k < 10; k++) { const a = rot + k * Math.PI / 5, rr2 = k % 2 ? r * 0.45 : r; ctx.lineTo(x + Math.cos(a) * rr2, y + Math.sin(a) * rr2); } ctx.fill(); }

// ---------- Start ----------
paintMute(); resize();
openMenu();
requestAnimationFrame(frame);
// Für Browser-Tests: Zustand ablesen (keine Steuerung von außen)
window.__dino = { get state() { return st; }, get mode() { return mode; }, get level() { return levelNo; } };
