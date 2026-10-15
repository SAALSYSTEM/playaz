// HAU DIE KAKERLAKE! – Kakerlaken im Parlament: Steuerung, Oberfläche, Speicherstand.
// Verbindet Simulation (sim.js), Darstellung (render.js) und Ton (audio.js). Alle Eingaben sind pointerdown.

import { Game } from './sim.js';
import { LEVELS, CHAPTERS, LEVEL_COUNT, BOSSES, POWER_FROM_LEVEL } from './levels.js';
import { Renderer } from './render.js';
import { Sound } from './audio.js';

const KEY = 'kakerlake.v1';
const ALL = ['C', 'L1', 'R1', 'L2', 'R2'];
const MIN_HIT_CSS = 22;                 // mindestens 44 CSS-Pixel Trefferfläche
const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const TEST = params.has('test');

// ------------------------------------------------------------------ Speicherstand
function clampInt(v, lo, hi, d) { v = Math.floor(Number(v)); return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d; }
function sanitize(d) {
  const out = { v: 1, unlocked: 1, stars: {}, best: {}, endless: { score: 0, wave: 0, time: 0 }, sound: true };
  if (!d || typeof d !== 'object') return out;
  out.unlocked = clampInt(d.unlocked, 1, LEVEL_COUNT + 1, 1);
  for (let i = 1; i <= LEVEL_COUNT; i++) {
    if (d.stars && d.stars[i] != null) { const s = clampInt(d.stars[i], 0, 3, 0); if (s) out.stars[i] = s; }
    if (d.best && d.best[i] != null) { const b = clampInt(d.best[i], 0, 1e9, 0); if (b) out.best[i] = b; }
  }
  // wer Sterne hat, hat das Level auch freigespielt
  for (const k of Object.keys(out.stars)) out.unlocked = Math.max(out.unlocked, Math.min(LEVEL_COUNT + 1, Number(k) + 1));
  if (d.endless && typeof d.endless === 'object') {
    out.endless = { score: clampInt(d.endless.score, 0, 1e9, 0), wave: clampInt(d.endless.wave, 0, 1e6, 0), time: clampInt(d.endless.time, 0, 1e7, 0) };
  }
  out.sound = d.sound !== false;
  return out;
}
function load() {
  try { return sanitize(JSON.parse(localStorage.getItem(KEY))); } catch (e) { return sanitize(null); }
}
let store = load();
function save() { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) { /* Speicher gesperrt: Spiel läuft trotzdem */ } }

// ------------------------------------------------------------------ Zustand
const cv = $('c');
const renderer = new Renderer(cv);
const sound = new Sound();
sound.muted = !store.sound;
let game = null;
let state = 'title';                    // title | levels | ready | play | pause | ending | result
let current = null;                     // 1…30 | 'endless'
let layoutName = 'land';
let last = performance.now();
let endT = 0;
let lastSummary = null;
let attempt = 0;
const hudCache = {};

const show = (el, on) => { el.hidden = !on; };
function setState(s) {
  state = s;
  show($('sTitel'), s === 'title');
  show($('sLevels'), s === 'levels');
  show($('oBereit'), s === 'ready');
  show($('oPause'), s === 'pause');
  show($('oErgebnis'), s === 'result');
  const inGame = s === 'ready' || s === 'play' || s === 'pause' || s === 'ending' || s === 'result';
  show($('hud'), inGame);
  show($('bPower'), inGame && !!game && game.powerEnabled);
  if (!inGame) show($('bossbar'), false);
  if (s === 'ready') $('bLos').focus({ preventScroll: true });
  if (TEST) document.documentElement.dataset.state = s;
}

// ------------------------------------------------------------------ Größe und Layout
function resize() {
  const w = Math.max(1, $('game').clientWidth), h = Math.max(1, $('game').clientHeight);
  layoutName = w / h >= 1.05 ? 'land' : 'port';
  const hudh = layoutName === 'land' ? 54 : (w <= 520 ? 100 : 60);
  $('game').style.setProperty('--hudh', hudh + 'px');
  renderer.setLayout(layoutName);
  renderer.resize(w, h, window.devicePixelRatio || 1, layoutName === 'port' ? hudh : 0, 0);
  if (game) {
    if (game.layoutName !== layoutName) game.setLayout(layoutName);
    game.setMinHit(renderer.cssToUnits(MIN_HIT_CSS));
  }
}
let resizeQueued = false;
function queueResize() { if (resizeQueued) return; resizeQueued = true; requestAnimationFrame(() => { resizeQueued = false; resize(); }); }
window.addEventListener('resize', queueResize);
window.addEventListener('orientationchange', () => setTimeout(queueResize, 120));

// ------------------------------------------------------------------ Start / Ende
function levelEntrances(id) { return id === 'endless' ? ALL : LEVELS[id - 1].ent; }

function newGame(id) {
  current = id;
  attempt++;
  const w = $('game').clientWidth, h = $('game').clientHeight;
  const seed = params.has('seed') ? clampInt(params.get('seed'), 1, 1e9, 1) : 1 + ((attempt * 7919) % 9973);
  game = new Game({ level: id, layout: layoutName, sizeFactor: Math.min(w, h) < 520 ? 0.8 : 1, seed, minHit: renderer.cssToUnits(MIN_HIT_CSS) });
  renderer.reset();
  renderer.setOpen(levelEntrances(id));
  for (const k of Object.keys(hudCache)) delete hudCache[k];
  show($('bossbar'), false);
  $('toast').className = 'toast';
  const L = game.L;
  $('hLv').textContent = id === 'endless' ? '∞' : String(id);
  $('hLvName').textContent = id === 'endless' ? 'Dauersitzung' : L.name;
  $('hRestL').textContent = id === 'endless' ? 'Welle' : 'Noch';
  $('bPower').hidden = !game.powerEnabled;
  updateHud(true);
}

function openReady(id) {
  newGame(id);
  if (id === 'endless') {
    $('bKap').textContent = 'Dauersitzung';
    $('bTitel').textContent = 'Die Sitzung hört nie auf';
    $('bTip').textContent = 'Fünf Sitze für die ganze Runde. Die Wellen werden langsam dichter, dazwischen gibt es kurze Verschnaufpausen. Alle fünf Wellen kommt ein Boss.';
  } else {
    const L = game.L, ch = CHAPTERS[Math.floor((id - 1) / 6)];
    $('bKap').textContent = 'Level ' + id + ' · ' + ch.name;
    $('bTitel').textContent = L.name;
    let tip = L.tip;
    if (id === POWER_FROM_LEVEL) tip += ' Neu: Nach 10 besiegten Gegnern lädt die Große Klatsche (Taste oder Knopf).';
    $('bTip').textContent = tip;
  }
  setState('ready');
}

function begin(withToast) {
  sound.unlock();
  if (withToast) flashToast('Los!');
  last = performance.now();
  setState('play');
}

function startLevel(id, direct) {
  newGame(id);
  if (direct) { setState('play'); begin(true); } else openReady(id);
}

function flashToast(text) {
  const t = $('toast');
  t.textContent = text; t.className = 'toast';
  void t.offsetWidth;
  t.className = 'toast an';
}

function pauseGame() {
  if (state !== 'play') return;
  game.arm(false);
  $('pSub').textContent = current === 'endless' ? 'Dauersitzung' : 'Level ' + current + ' · ' + game.L.name;
  setState('pause');
}
function resumeGame() {
  if (state !== 'pause') return;
  last = performance.now();
  setState('play');
}

function finish(summary) {
  // Speicherstand
  let neuerRekord = false, firstStars = 0;
  if (summary.mode === 'level') {
    const id = summary.level;
    if (summary.won) {
      firstStars = store.stars[id] || 0;
      if (summary.stars > (store.stars[id] || 0)) store.stars[id] = summary.stars;
      if (summary.score > (store.best[id] || 0)) { neuerRekord = (store.best[id] || 0) > 0; store.best[id] = summary.score; }
      store.unlocked = Math.max(store.unlocked, Math.min(LEVEL_COUNT + 1, id + 1));
    }
  } else {
    const e = store.endless;
    if (summary.score > e.score) { neuerRekord = e.score > 0; e.score = summary.score; }
    if (summary.wave > e.wave) e.wave = summary.wave;
    if (Math.floor(summary.time) > e.time) e.time = Math.floor(summary.time);
  }
  save();
  lastSummary = summary;
  fillResult(summary, neuerRekord);
  setState('result');
  sound.play(summary.won ? 'win' : 'lose');
}

const fmtTime = (s) => { s = Math.floor(s); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
const fmt = (n) => Number(n).toLocaleString('de-DE');
function starSvg(on) {
  return '<svg viewBox="0 0 24 24" class="' + (on ? 'an' : '') + '" aria-hidden="true"><path d="M12 2.2l2.9 6.1 6.7.8-4.9 4.6 1.3 6.6L12 17l-6 3.3 1.3-6.6L2.4 9.1l6.7-.8z" fill="' + (on ? '#FFD21C' : '#3a3d52') + '" stroke="' + (on ? '#a37a22' : '#262838') + '" stroke-width="1.2" stroke-linejoin="round"/></svg>';
}
function statBox(label, val, cls) { return '<div' + (cls ? ' class="' + cls + '"' : '') + '><small>' + label + '</small><b>' + val + '</b></div>'; }

function fillResult(s, neuerRekord) {
  $('eStatus').textContent = '';
  const endless = s.mode === 'endless';
  $('eTitel').textContent = endless ? 'Sitzung beendet' : s.won ? 'Sitzung gerettet!' : 'Alle Sitze besetzt!';
  $('eSub').textContent = endless ? 'Dauersitzung' : 'Level ' + s.level + ' · ' + LEVELS[s.level - 1].name;
  $('eSterne').innerHTML = endless ? '' : [1, 2, 3].map((i) => starSvg(s.won && s.stars >= i)).join('');
  show($('eSterne'), !endless);
  const acc = s.accuracy == null ? '–' : s.accuracy + ' %';
  let html = '';
  if (endless) {
    html += statBox('Punkte', fmt(s.score), 'breit') + statBox('Welle', s.wave) + statBox('Überlebt', fmtTime(s.time));
    html += statBox('Treffer', fmt(s.hit)) + statBox('Treffsicherheit', acc) + statBox('Max. Kombo', s.maxCombo) + statBox('Bestwert', fmt(store.endless.score));
  } else {
    html += statBox('Treffer', s.hit + ' / ' + s.total) + statBox('Entkommen', s.escaped);
    html += statBox('Treffsicherheit', acc) + statBox('Max. Kombo', s.maxCombo) + statBox('Punkte', fmt(s.score), 'breit');
  }
  $('eStats').innerHTML = html;
  const best = endless ? store.endless.score : store.best[s.level] || 0;
  $('eRekord').textContent = neuerRekord ? 'Neuer Rekord!' : best ? 'Bestwert: ' + fmt(best) : '';
  const w = $('eWeiter'), n = $('eNochmal');
  if (endless) { w.textContent = 'Erneut spielen'; n.hidden = true; }
  else if (s.won && s.level < LEVEL_COUNT) { w.textContent = 'Nächstes Level'; n.hidden = false; }
  else if (s.won) { w.textContent = 'Zur Dauersitzung'; n.hidden = false; }
  else { w.textContent = 'Erneut versuchen'; n.hidden = true; }
  $('eLevels').textContent = endless ? 'Menü' : 'Levelauswahl';
}

// ------------------------------------------------------------------ Bildschirme
function buildLevels() {
  const box = $('lListe');
  box.textContent = '';
  for (const ch of CHAPTERS) {
    const sec = document.createElement('div');
    sec.className = 'kap';
    sec.innerHTML = '<h3></h3><p></p><div class="raster"></div>';
    sec.querySelector('h3').textContent = ch.id + '. ' + ch.name;
    sec.querySelector('p').textContent = ch.sub;
    const grid = sec.querySelector('.raster');
    for (const id of ch.levels) {
      const b = document.createElement('button');
      const open = id <= store.unlocked;
      const st = store.stars[id] || 0;
      b.className = 'lv' + (id % 6 === 0 ? ' boss' : '') + (open ? '' : ' zu') + (open && !st && id === store.unlocked ? ' neu' : '');
      b.setAttribute('aria-label', 'Level ' + id + ' ' + LEVELS[id - 1].name + (open ? (st ? ', ' + st + ' Sterne' : '') : ', gesperrt'));
      b.innerHTML = '<b>' + id + '</b><span class="st">' + [1, 2, 3].map((i) => starSvg(st >= i).replace(' class="an"', '')).join('') + '</span>';
      if (!open) b.disabled = true;
      b.dataset.level = id;
      b.addEventListener('click', () => { sound.unlock(); openReady(id); });
      grid.appendChild(b);
    }
    box.appendChild(sec);
  }
  const dauer = $('lDauer');
  const un = store.unlocked > LEVEL_COUNT;
  dauer.disabled = !un;
  $('lDauerSub').textContent = un ? (store.endless.score ? 'Bestwert ' + fmt(store.endless.score) + ' · Welle ' + store.endless.wave : 'Fünf Sitze, steigende Wellen, kein Ende') : 'Wird nach Level 30 freigeschaltet';
}

function toTitle() {
  game = null; current = null;
  renderer.reset(); renderer.setOpen(ALL);
  const un = store.unlocked > LEVEL_COUNT;
  show($('tDauer'), un);
  const nxt = Math.min(store.unlocked, LEVEL_COUNT);
  $('tSpielen').textContent = store.unlocked > 1 && store.unlocked <= LEVEL_COUNT ? 'Weiter mit Level ' + nxt : 'Spielen';
  updateSoundLabels();
  setState('title');
}
function toLevels() {
  game = null; current = null;
  renderer.reset(); renderer.setOpen(ALL);
  buildLevels();
  setState('levels');
  const f = document.querySelector('.lv.neu') || document.querySelector('.lv:not(.zu)');
  if (f) f.scrollIntoView({ block: 'center' });
}
function updateSoundLabels() {
  const t = 'Ton: ' + (sound.muted ? 'aus' : 'an');
  $('tTon').textContent = t; $('pTon').textContent = t;
}
function toggleSound() {
  sound.unlock();
  sound.setMuted(!sound.muted);
  store.sound = !sound.muted; save();
  updateSoundLabels();
  if (!sound.muted) sound.play('tap');
}

// ------------------------------------------------------------------ HUD
function setText(id, v) { if (hudCache[id] !== v) { hudCache[id] = v; $(id).textContent = v; } }
function updateHud(force) {
  if (!game) return;
  setText('hScore', fmt(game.score));
  setText('hRest', game.mode === 'endless' ? String(game.wave) : String(Math.max(0, game.remaining)));
  const mult = game.comboMultiplier;
  setText('hMult', '×' + mult);
  const cb = $('hCombo');
  const cls = 'chip combo' + (game.streak < 1 ? ' aus' : '') + (mult === 2 ? ' m2' : mult >= 3 ? ' m3' : '');
  if (hudCache.cc !== cls) { hudCache.cc = cls; cb.className = cls; }
  const w = game.streak > 0 ? Math.max(0, game.comboT / 2.5) : 0;
  $('hComboBar').style.width = (w * 100).toFixed(0) + '%';
  if (hudCache.def !== game.defense || force) {
    const seats = $('hDef').children;
    for (let i = 0; i < seats.length; i++) {
      const weg = i >= game.defense;
      const was = seats[i].classList.contains('weg');
      seats[i].classList.toggle('weg', weg);
      if (weg && !was && !force) { seats[i].classList.remove('neu'); void seats[i].offsetWidth; seats[i].classList.add('neu'); }
    }
    $('hDef').setAttribute('aria-label', 'Verteidigung: ' + game.defense + ' von 5 Sitzen frei');
    hudCache.def = game.defense;
  }
  if (game.powerEnabled) {
    const prog = game.charge ? 1 : game.chargeProg / 10;
    const off = (207.3 * (1 - prog)).toFixed(1);
    if (hudCache.ring !== off) { hudCache.ring = off; $('pRing').setAttribute('stroke-dashoffset', off); }
    const pc = 'power' + (game.armed ? ' scharf' : game.charge ? ' bereit' : '');
    if (hudCache.pc !== pc) { hudCache.pc = pc; $('bPower').className = pc; $('bPower').setAttribute('aria-label', game.armed ? 'Große Klatsche ist scharf, tippe aufs Spielfeld' : game.charge ? 'Die große Klatsche ist bereit' : 'Die große Klatsche lädt, ' + game.chargeProg + ' von 10'); }
  }
  // Bossleiste (Name oben, Lebensanzeige am Gegner selbst)
  const boss = game.enemies.find((e) => e.type === 'boss' && e.state === 'walk');
  if (boss) {
    if (hudCache.boss !== boss.id) { hudCache.boss = boss.id; $('bossName').textContent = boss.bossName; show($('bossbar'), true); }
    $('bossHp').style.transform = 'scaleX(' + Math.max(0, boss.hp / boss.hpMax).toFixed(2) + ')';
  } else if (hudCache.boss) { hudCache.boss = 0; show($('bossbar'), false); }
}

// ------------------------------------------------------------------ Ereignisse → Ton, Hinweise
function handleEvents(events) {
  for (const ev of events) {
    switch (ev.type) {
      case 'strike': sound.play(ev.hit ? 'hit' : 'miss', game.streak); break;
      case 'kill': sound.play('kill'); break;
      case 'helm': sound.play('helm'); break;
      case 'bosshit': sound.play('bosshit'); break;
      case 'warn': {
        if (ev.kind === 'flitzer' || ev.kind === 'boss' || ev.kind === 'nachr' || ev.follow) sound.play('warn');
        if (ev.kind === 'boss') { const w = game.warnings.find((x) => x.id === ev.id); const b = w && w.boss && BOSSES[w.boss]; if (b) flashToast(b.name); }
        break;
      }
      case 'spawn': if (ev.kind === 'boss') sound.play('boss'); break;
      case 'escape': sound.play('escape'); break;
      case 'slam': sound.play('slam'); break;
      case 'armed': flashToast('Tippe aufs Spielfeld!'); break;
      case 'charged': sound.play('charged'); flashToast('Klatsche bereit!'); break;
      case 'combo': if (ev.streak === 5 || ev.streak === 10) sound.play('combo'); break;
      case 'wave': if (game.mode === 'endless') flashToast('Welle ' + ev.wave); break;
      case 'won': case 'lost': state = 'ending'; endT = 0; game.arm(false); if (TEST) document.documentElement.dataset.state = 'ending'; break;
      default: break;
    }
  }
}

// ------------------------------------------------------------------ Schleife
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
  last = now;
  let rdt = 0;
  if (game && (state === 'play' || state === 'ending')) {
    game.update(dt);
    rdt = dt;
    const ev = game.drainEvents();
    if (ev.length) { renderer.handle(ev, game); handleEvents(ev); }
    if (state === 'ending') {
      endT += dt;
      if (endT >= (game.status === 'won' ? 1.6 : 1.9)) finish(game.summary());
    }
  }
  renderer.draw(game, rdt);
  if (game) updateHud();
}

// ------------------------------------------------------------------ Eingabe
cv.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  if (state !== 'play' || !game) return;
  sound.unlock();
  const p = renderer.toLogical(e.clientX, e.clientY);
  if (e.pointerType === 'mouse') renderer.setHover(p.x, p.y);
  game.setMinHit(renderer.cssToUnits(MIN_HIT_CSS));
  game.strike(p.x, p.y);
  const ev = game.drainEvents();
  if (ev.length) { renderer.handle(ev, game); handleEvents(ev); }
});
cv.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse' && state === 'play') { const p = renderer.toLogical(e.clientX, e.clientY); renderer.setHover(p.x, p.y); } });
cv.addEventListener('pointerleave', () => renderer.setHover(null));
cv.addEventListener('contextmenu', (e) => e.preventDefault());
cv.addEventListener('dragstart', (e) => e.preventDefault());

function togglePower() {
  if (state !== 'play' || !game || !game.powerEnabled) return;
  if (game.armed) game.arm(false);
  else if (game.charge >= 1) { sound.unlock(); game.arm(true); const ev = game.drainEvents(); renderer.handle(ev, game); handleEvents(ev); }
}
$('bPower').addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); togglePower(); });
$('bPower').addEventListener('click', (e) => { if (e.detail === 0) togglePower(); });   // Tastatur
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && state === 'play') { e.preventDefault(); if (!e.repeat) togglePower(); }
  else if ((e.code === 'Escape' || e.code === 'KeyP') && !e.repeat) {
    if (state === 'play') pauseGame(); else if (state === 'pause') resumeGame();
  }
});

$('bPause').addEventListener('click', () => { if (state === 'play') pauseGame(); });
$('pWeiter').addEventListener('click', resumeGame);
$('pNeu').addEventListener('click', () => { startLevel(current, true); });
$('pLevels').addEventListener('click', () => (current === 'endless' ? toTitle() : toLevels()));
$('pTon').addEventListener('click', toggleSound);
$('tTon').addEventListener('click', toggleSound);
$('tSpielen').addEventListener('click', () => { sound.unlock(); openReady(Math.min(store.unlocked, LEVEL_COUNT)); });
$('tLevels').addEventListener('click', () => { sound.unlock(); toLevels(); });
$('tDauer').addEventListener('click', () => { sound.unlock(); openReady('endless'); });
$('lZurueck').addEventListener('click', toTitle);
$('lDauer').addEventListener('click', () => { if (store.unlocked > LEVEL_COUNT) { sound.unlock(); openReady('endless'); } });
$('bLos').addEventListener('click', () => begin(false));
$('bZurueck').addEventListener('click', () => (current === 'endless' ? toTitle() : toLevels()));
$('eWeiter').addEventListener('click', () => {
  const s = game && game.summary();
  if (!s) return toTitle();
  if (s.mode === 'endless') return startLevel('endless', true);
  if (s.won) return s.level < LEVEL_COUNT ? openReady(s.level + 1) : openReady('endless');
  startLevel(s.level, true);
});
$('eNochmal').addEventListener('click', () => startLevel(current, true));
$('eLevels').addEventListener('click', () => (current === 'endless' ? toTitle() : toLevels()));

// ------------------------------------------------------------------ Punkte teilen
const SHARE_URL = 'https://playsaal.com/spiele/hau-die-kakerlake';
const SHARE_TITLE = 'Hau die Kakerlake! – Chaos im Parlament';
function shareText(s) {
  const pts = fmt(s.score) + ' Punkte';
  if (s.mode === 'endless') return 'Ich habe in der Dauersitzung von „' + SHARE_TITLE + '“ ' + pts + ' geholt (Welle ' + s.wave + ', ' + fmtTime(s.time) + ' durchgehalten). Schaffst du mehr?';
  const stars = s.won ? ' ' + '★'.repeat(s.stars) + '☆'.repeat(3 - s.stars) : '';
  return 'Ich habe in Level ' + s.level + ' von „' + SHARE_TITLE + '“ ' + pts + ' geholt' + stars + (s.won ? '' : ' (leider nicht geschafft)') + '. Schaffst du mehr?';
}
async function sharePoints() {
  const s = lastSummary, out = $('eStatus');
  if (!s) return;
  const text = shareText(s);
  if (navigator.share) {
    try { await navigator.share({ title: SHARE_TITLE, text, url: SHARE_URL }); out.textContent = 'Geteilt.'; return; }
    catch (e) { if (e && e.name === 'AbortError') return; }
  }
  const full = text + ' ' + SHARE_URL;
  try { await navigator.clipboard.writeText(full); out.textContent = 'Text kopiert. Jetzt in einen Chat einfügen.'; return; } catch (e) { /* weiter */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = full; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;left:-999px;top:0';
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    out.textContent = ok ? 'Text kopiert. Jetzt in einen Chat einfügen.' : full;
  } catch (e) { out.textContent = full; }
}
$('eTeilen').addEventListener('click', sharePoints);

document.addEventListener('visibilitychange', () => {
  if (document.hidden) { pauseGame(); sound.suspend(); } else { sound.resume(); last = performance.now(); }
});
window.addEventListener('pagehide', () => pauseGame());
document.addEventListener('selectstart', (e) => { if (!e.target.closest || !e.target.closest('input,textarea')) e.preventDefault(); });

// ------------------------------------------------------------------ Start
resize();
toTitle();
requestAnimationFrame((t) => { last = t; frame(t); });

if (TEST) {
  window.__pk = {
    get game() { return game; }, share: shareText, get state() { return state; }, renderer, store: () => store,
    start: (id, direct = true) => { sound.unlock(); startLevel(id, direct); }, resize,
    toLogical: (x, y) => renderer.toLogical(x, y), pause: pauseGame, resume: resumeGame,
    resetStore: () => { store = sanitize(null); save(); }
  };
}
