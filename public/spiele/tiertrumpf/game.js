// Tiertrumpf – Oberfläche. Regeln in engine.js, hier nur Darstellung, Eingabe, Animation, Speichern und Vorlesen.
// Grafik: Liegt ein Bild in img/manifest.json (ChatGPT-Grafiken, siehe design/tiertrumpf/PROMPTS.md), wird es verwendet.
// Sonst PLATZHALTER: System-Emoji für Tiere und Fiete. Zahlen, Farbsymbole und Sonderkarten zeichnet das Spiel immer selbst.
import * as E from './engine.js';

const BASE = new URL('./', import.meta.url);
const KEY = 'tiertrumpf.v1', MUTE = 'tiertrumpf.muted';
const $ = (id) => document.getElementById(id);
const motion = () => !matchMedia('(prefers-reduced-motion: reduce)').matches;
// Nur für automatische Tests (?schnell im Testbrowser): alle Wartezeiten stark verkürzt
const SPEED = navigator.webdriver && /[?&]schnell\b/.test(location.search) ? 0.05 : 1;
const wait = (ms) => new Promise((r) => setTimeout(r, ms * SPEED));

// ---------------------------------------------------------------- Inhalte
const TIERE = {
  elephant: { bild: 'elefant', emoji: '🐘', name: 'Elefant', den: 'den Elefanten', einen: 'einen Elefanten' },
  panda: { bild: 'panda', emoji: '🐼', name: 'Panda', den: 'den Panda', einen: 'einen Panda' },
  frog: { bild: 'frosch', emoji: '🐸', name: 'Frosch', den: 'den Frosch', einen: 'einen Frosch' },
  cat: { bild: 'katze', emoji: '🐱', name: 'Katze', den: 'die Katze', einen: 'eine Katze' },
  lion: { bild: 'loewe', emoji: '🦁', name: 'Löwe', den: 'den Löwen', einen: 'einen Löwen' },
  rabbit: { bild: 'hase', emoji: '🐰', name: 'Hase', den: 'den Hasen', einen: 'einen Hasen' }
};
const SONDER = {
  wild: { name: 'Farbwechsel', den: 'den Farbwechsel', einen: 'einen Farbwechsel' },
  skip: { name: 'Pause', den: 'eine Pause', einen: 'eine Pause-Karte' },
  draw1: { name: 'Plus eins', den: 'Plus eins', einen: 'eine Plus-eins-Karte' }
};
const FARBEN = {
  red: { name: 'Rot', hex: '#E5484D', form: '<circle cx="12" cy="12" r="9"/>' },
  blue: { name: 'Blau', hex: '#2D7FF9', form: '<path d="M12 2.5l9.5 9.5-9.5 9.5L2.5 12z"/>' },
  green: { name: 'Grün', hex: '#1FA35A', form: '<path d="M12 3l10 17.5H2z"/>' },
  yellow: { name: 'Gelb', hex: '#FFB400', form: '<rect x="3.5" y="3.5" width="17" height="17" rx="2"/>' }
};
const ORDER = { red: 0, blue: 1, green: 2, yellow: 3, wild: 4 };
const VORDER = { skip: 7, draw1: 8, wild: 9 };
const form = (color, fill = '#fff', stroke = 'rgba(0,0,0,.25)') =>
  `<svg viewBox="0 0 24 24" aria-hidden="true"><g fill="${fill}" stroke="${stroke}" stroke-width="1.6" stroke-linejoin="round">${FARBEN[color].form}</g></svg>`;
const ICON_WILD = '<svg class="big" viewBox="0 0 100 100" aria-hidden="true"><g fill="none" stroke-width="9" stroke-linecap="round"><path d="M14 70a36 36 0 0 1 72 0" stroke="#E5484D"/><path d="M24 70a26 26 0 0 1 52 0" stroke="#FFB400"/><path d="M34 70a16 16 0 0 1 32 0" stroke="#1FA35A"/><path d="M44 70a6 6 0 0 1 12 0" stroke="#2D7FF9"/></g><path d="M50 14l4.4 9.6 10.4 1.1-7.8 7 2.2 10.3L50 36.8 40.8 42l2.2-10.3-7.8-7 10.4-1.1z" fill="#FFD21C" stroke="#c99c00" stroke-width="2" stroke-linejoin="round"/><circle cx="22" cy="30" r="3" fill="#FFD21C"/><circle cx="80" cy="26" r="3.5" fill="#FFD21C"/><circle cx="74" cy="84" r="2.5" fill="#FFD21C"/></svg>';
const iconSkip = (hex) => `<svg class="big" viewBox="0 0 100 100" aria-hidden="true"><path d="M58 18a32 32 0 1 0 26 48 26 26 0 1 1-26-48z" fill="${hex}"/><g fill="${hex}" font-family="Fredoka,sans-serif" font-weight="700"><text x="60" y="40" font-size="20">Z</text><text x="74" y="26" font-size="15">z</text><text x="84" y="14" font-size="11">z</text></g></svg>`;
const iconPlus = (hex) => `<svg class="big" viewBox="0 0 100 100" aria-hidden="true"><rect x="52" y="22" width="30" height="42" rx="6" fill="#fff" stroke="${hex}" stroke-width="5" transform="rotate(12 67 43)"/><text x="40" y="74" text-anchor="middle" font-family="Fredoka,sans-serif" font-weight="700" font-size="50" fill="${hex}" stroke="#fff" stroke-width="3" paint-order="stroke">+1</text></svg>`;
const ICON_MOON_SMALL = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3a9 9 0 1 0 7 14A7.5 7.5 0 1 1 14 3z" fill="#fff" stroke="rgba(0,0,0,.25)" stroke-width="1.4"/></svg>';

let bilder = new Set();   // vorhandene Grafiken laut manifest.json
const img = (name) => `<img src="${new URL('img/' + name + '.webp', BASE)}" alt="" draggable="false">`;
const fieteHtml = (pose = 'fiete') => bilder.has(pose) ? img(pose) : bilder.has('fiete') ? img('fiete') : '🦊';

function cardName(c) {
  if (TIERE[c.value]) return `${FARBEN[c.color].name}, ${TIERE[c.value].name}, ${E.number(c.value)}`;
  if (c.value === 'wild') return 'Farbwechsel';
  return `${FARBEN[c.color].name}, ${SONDER[c.value].name}`;
}
function cardInner(c) {
  if (c.value === 'wild') return `<span class="num tl">★</span><span class="win">${ICON_WILD}</span><span class="num br">★</span>`;
  const f = FARBEN[c.color], shp = `<span class="shp tr">${form(c.color)}</span><span class="shp bl">${form(c.color)}</span>`;
  if (c.value === 'skip') return `<span class="shp tr">${ICON_MOON_SMALL}</span><span class="shp bl">${ICON_MOON_SMALL}</span><span class="win">${iconSkip(f.hex)}</span>`;
  if (c.value === 'draw1') return `<span class="num tl">+1</span><span class="num br">+1</span>${shp}<span class="win">${iconPlus(f.hex)}</span>`;
  const t = TIERE[c.value], n = E.number(c.value);
  const pic = bilder.has(t.bild) ? img(t.bild) : `<span class="emo">${t.emoji}</span>`;
  return `<span class="num tl">${n}</span><span class="num br">${n}</span>${shp}<span class="win">${pic}</span>`;
}
function cardFace(c, w, tag = 'div') {
  const el = document.createElement(tag);
  el.className = 'card ' + c.color;
  if (w) el.style.setProperty('--w', w + 'px');
  el.innerHTML = cardInner(c);
  if (tag === 'div') el.setAttribute('aria-hidden', 'true');
  return el;
}
function backFace(w) { const el = document.createElement('div'); el.className = 'card back'; el.style.setProperty('--w', w + 'px'); return el; }

// ---------------------------------------------------------------- Speichern
let storageOk = true;
let save = { v: 1, level: 1, game: null, bilanz: { s: 0, n: 0, u: 0 }, voice: false };
function load() {
  let raw = null;
  try { raw = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { raw = null; }
  try { localStorage.getItem('x'); } catch { storageOk = false; }
  if (!raw || typeof raw !== 'object') return;
  if ([1, 2, 3].includes(raw.level)) save.level = raw.level;
  const b = raw.bilanz || {}; const n = (x) => (Number.isInteger(x) && x >= 0 && x < 1e6 ? x : 0);
  save.bilanz = { s: n(b.s), n: n(b.n), u: n(b.u) };
  save.voice = raw.voice === true;
  save.game = raw.game ? E.restore(raw.game) : null;
  if (save.game && save.game.winner !== null) save.game = null;   // abgeschlossene Runde: neu beginnen
}
function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(save)); storageOk = true; } catch { storageOk = false; }
}
load();
let state = save.game;

// ---------------------------------------------------------------- Ton (kleine selbst erzeugte Klänge, kein Download)
let muted = false; try { muted = localStorage.getItem(MUTE) === '1'; } catch { /* egal */ }
let ac = null;
function audio() {
  if (muted) return null;
  try { ac = ac || new (window.AudioContext || window.webkitAudioContext)(); if (ac.state === 'suspended') ac.resume(); } catch { ac = null; }
  return ac;
}
function tone(freq, t0, dur, type = 'sine', vol = 0.18, slide = 0) {
  const a = audio(); if (!a) return;
  const o = a.createOscillator(), g = a.createGain(), t = a.currentTime + t0;
  o.type = type; o.frequency.setValueAtTime(freq, t); if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + 0.02);
}
const SFX = {
  lay: () => { tone(220, 0, 0.12, 'triangle', 0.22, 0.6); tone(520, 0.02, 0.08, 'sine', 0.08); },
  draw: () => tone(700, 0, 0.16, 'sine', 0.1, 1.8),
  oops: () => { tone(330, 0, 0.12, 'triangle', 0.12); tone(262, 0.11, 0.16, 'triangle', 0.12); },
  wild: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.06, 0.18, 'sine', 0.12)),
  skip: () => { tone(392, 0, 0.18, 'sine', 0.13); tone(294, 0.16, 0.3, 'sine', 0.13); },
  plus: () => { tone(440, 0, 0.1, 'square', 0.06); tone(660, 0.08, 0.14, 'square', 0.06); },
  win: () => [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, i * 0.11, 0.22, 'triangle', 0.16)),
  lose: () => [392, 349, 330, 392].forEach((f, i) => tone(f, i * 0.14, 0.2, 'triangle', 0.12)),
  click: () => tone(880, 0, 0.05, 'sine', 0.06)
};
function setMuted(m) {
  muted = m; try { localStorage.setItem(MUTE, m ? '1' : '0'); } catch { /* egal */ }
  $('btnSound').setAttribute('aria-pressed', String(!m)); $('btnSound').setAttribute('aria-label', m ? 'Ton einschalten' : 'Ton ausschalten');
}

// ---------------------------------------------------------------- Vorlesen (Browser-Sprachausgabe, Stimme je Gerät)
const synth = 'speechSynthesis' in window ? window.speechSynthesis : null;
let deVoice = null;
function pickVoice() {
  if (!synth) return null;
  const vs = synth.getVoices() || [];
  deVoice = vs.find((v) => /^de(-|_|$)/i.test(v.lang) && v.localService) || vs.find((v) => /^de(-|_|$)/i.test(v.lang)) || null;
  return vs.length;
}
if (synth) { pickVoice(); synth.addEventListener?.('voiceschanged', pickVoice); }
function speak(text) {
  if (!save.voice || !synth || !text) return;
  try { synth.cancel(); const u = new SpeechSynthesisUtterance(text); u.lang = 'de-DE'; if (deVoice) u.voice = deVoice; u.rate = 0.92; u.pitch = 1.05; synth.speak(u); } catch { /* ohne Stimme weiter */ }
}
async function setVoice(on) {
  if (on) {
    let n = pickVoice();
    for (let i = 0; i < 8 && !n; i++) { await wait(200); n = pickVoice(); }
    if (n && !deVoice) { toast('Auf diesem Gerät gibt es keine deutsche Stimme.'); on = false; }
  }
  save.voice = on; persist();
  $('btnVoice').setAttribute('aria-pressed', String(on));
  $('btnVoice').setAttribute('aria-label', on ? 'Vorlesen ausschalten' : 'Vorlesen einschalten');
  if (on) speak('Vorlesen ist an. ' + (state && !dialog.open ? sayTurn() : ''));
  else synth?.cancel();
}

// ---------------------------------------------------------------- Kleine Helfer
let toastTimer = 0;
function toast(t, ms = 2600) { const el = $('toast'); el.textContent = t; el.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, ms); }
function setMsg(icon, title, hint = '', flash = false) {
  $('msgIcon').textContent = icon; $('msgTitle').textContent = title; $('msgHint').textContent = hint;
  if (flash && motion()) { const m = $('msg'); m.classList.remove('flash'); void m.offsetWidth; m.classList.add('flash'); }
}
function bubble(t) { $('fieteBubble').textContent = t; }
function wiggle(el) { if (!el) return; el.classList.remove('wiggle'); void el.offsetWidth; el.classList.add('wiggle'); setTimeout(() => el.classList.remove('wiggle'), 450); }

// Was gerade gilt, als kurzer Satz fürs Vorlesen
function sayTurn() {
  if (!state || state.winner !== null) return '';
  if (state.turn === 1) return 'Fiete ist dran.';
  if (state.drawn !== null) return 'Die neue Karte passt! Ablegen oder behalten?';
  const ids = E.legal(state);
  if (!ids.length) return 'Nichts passt. Tipp auf den Stapel und zieh eine Karte.';
  const top = state.discard.at(-1), col = FARBEN[state.color].name;
  if (top.value === 'wild') return `Du bist dran. Leg ${col}.`;
  const what = TIERE[top.value] ? TIERE[top.value].einen : SONDER[top.value].einen;
  return `Du bist dran. Leg ${col} oder ${what}.`;
}

// ---------------------------------------------------------------- Layout
const handEls = new Map();      // Karten-ID -> Knopf in der Hand
let layoutCache = { pw: 100, cw: 80 };
function sortHand(h) { return [...h].sort((a, b) => ORDER[a.color] - ORDER[b.color] || (E.number(a.value) || VORDER[a.value]) - (E.number(b.value) || VORDER[b.value]) || a.id - b.id); }

// Beste Kartenbreite für n Karten in W×H: möglichst groß, ohne Überlappung; sonst überlappend in Reihen.
export function handLayout(n, W, H, gap = 8, maxW = 120, minW = 58, ratio = 1.4) {
  if (!n || W <= 0 || H <= 0) return { w: maxW, pos: [] };
  let best = null;
  for (let k = 1; k <= n; k++) {
    const r = Math.ceil(n / k);
    const w = Math.min(maxW, (W - (k - 1) * gap) / k, (H - (r - 1) * gap) / r / ratio);
    if (!best || w > best.w + 0.01) best = { k, r, w };
  }
  let { k, r, w } = best, stepX, stepY;
  if (w >= minW) { w = Math.floor(w); stepX = w + gap; stepY = w * ratio + gap; }
  else {
    // Sehr viele Karten: Mindestgröße halten, Reihen füllen, Karten in einer Reihe überlappen
    w = minW; const h = w * ratio;
    r = Math.max(1, Math.min(n, Math.floor((H + 4) / (h * 0.8))));
    k = Math.ceil(n / r);
    stepX = k > 1 ? Math.min(w + gap, (W - w) / (k - 1)) : 0;
    stepY = r > 1 ? Math.min(h + gap, (H - h) / (r - 1)) : 0;
  }
  const h = w * ratio, pos = [];
  const rows = Math.ceil(n / k), usedH = (rows - 1) * stepY + h, y0 = Math.max(0, (H - usedH) / 2);
  for (let i = 0; i < n; i++) {
    const row = Math.floor(i / k), inRow = Math.min(k, n - row * k), col = i - row * k;
    const usedW = (inRow - 1) * stepX + w, x0 = (W - usedW) / 2;
    pos.push({ x: Math.round(x0 + col * stepX), y: Math.round(y0 + row * stepY) });
  }
  return { w, pos };
}

function sizeTable() {
  const app = $('app'), table = $('table');
  const W = app.clientWidth - 24;
  // Stapel: etwa 34 % der freien Höhe, begrenzt durch Breite
  const free = app.clientHeight - $('statusBox').offsetHeight - document.querySelector('.head').offsetHeight - document.querySelector('.fiete').offsetHeight - 40;
  const pw = Math.round(Math.max(66, Math.min(140, (free * 0.36 - 40) / 1.4, (W - 60) / 2.7)));
  layoutCache.pw = pw; table.style.setProperty('--pw', pw + 'px');
}

// ---------------------------------------------------------------- Darstellung
const dialog = $('dialog'), content = $('dialogContent');
let busy = false, aiTimer = 0;

function render(o = {}) {
  const hide = o.hide || new Set();
  sizeTable();
  if (!state) { $('hand').replaceChildren(); handEls.clear(); return; }
  const yours = state.turn === 0 && state.winner === null;
  // Fiete
  const fn = state.hands[1].length;
  $('fieteNum').textContent = fn - (o.fieteHide || 0);
  const fan = $('fieteFan'); const show = Math.min(fn - (o.fieteHide || 0), 12);
  if (fan.childElementCount !== show) {
    fan.replaceChildren();
    const fw = fan.clientWidth || 120, step = show > 1 ? Math.min(20, (fw - 32) / (show - 1)) : 0, x0 = (fw - (32 + step * (show - 1))) / 2;
    for (let i = 0; i < show; i++) { const el = document.createElement('i'); el.style.left = (x0 + i * step) + 'px'; el.style.transform = `rotate(${(i - (show - 1) / 2) * 4}deg)`; fan.append(el); }
  }
  document.querySelector('.fiete').classList.toggle('dran', state.turn === 1 && state.winner === null);
  // Stapel
  const pile = $('drawPile');
  pile.classList.toggle('empty', !state.pile.length && state.discard.length <= 1);
  const mustDraw = yours && !busy && state.drawn === null && E.legal(state).length === 0;
  pile.classList.toggle('must', mustDraw);
  pile.setAttribute('aria-label', mustDraw ? 'Karte ziehen – nichts passt' : 'Nachziehstapel');
  // Ablage: oberste Karte plus zwei angedeutete darunter
  const pw = layoutCache.pw, d = $('discard'); d.replaceChildren();
  const list = o.holdTop ? state.discard.slice(0, -1) : state.discard;
  list.slice(-3).forEach((c, i, arr) => {
    const el = cardFace(c, pw); const top = i === arr.length - 1;
    if (!top) { el.classList.add('under'); el.style.transform = `rotate(${(c.id * 37 % 13) - 6}deg)`; }
    d.append(el);
  });
  const topCard = list.at(-1);
  d.setAttribute('aria-label', 'Ablage: ' + (topCard ? cardName(topCard) : 'leer'));
  // Gültige Farbe
  const col = o.holdTop ? (o.prevColor || state.color) : state.color, chip = $('colorChip');
  chip.innerHTML = form(col, FARBEN[col].hex, 'rgba(0,0,0,.2)') + `<span>${FARBEN[col].name}</span>`;
  chip.setAttribute('aria-label', 'Jetzt gilt ' + FARBEN[col].name);
  // Hand
  renderHand(hide, yours);
  // Status und Auswahl
  const choice = yours && state.drawn !== null && !busy;
  $('choice').hidden = !choice; $('msg').hidden = choice;
  const one = state.hands[0].length === 1 && state.winner === null;
  $('lastCard').hidden = !one;
  $('handCount').textContent = state.hands[0].length - hide.size;
  if (!o.keepMsg) {
    if (state.winner !== null) setMsg(state.winner === 0 ? '🎉' : state.winner === 1 ? '🦊' : '🤝', state.winner === 0 ? 'Du hast gewonnen!' : state.winner === 1 ? 'Fiete hat gewonnen!' : 'Unentschieden!');
    else if (state.turn === 1) setMsg('🦊', 'Fiete ist dran', 'Schau zu, was er legt.');
    else if (state.drawn !== null) setMsg('✨', 'Die neue Karte passt!');
    else if (mustDraw) setMsg('👆', 'Nichts passt', 'Tipp auf den Stapel.');
    else setMsg('👇', 'Du bist dran!', one ? 'Leg deine letzte Karte!' : state.discard.at(-1).value === 'wild' ? 'Jetzt gilt ' + FARBEN[state.color].name + '.' : 'Leg eine leuchtende Karte.');
  }
}

function renderHand(hide, yours) {
  const box = $('hand'), handBox = $('handBox');
  const legal = yours && !busy ? new Set(E.legal(state)) : new Set();
  const cards = sortHand(state.hands[0]);
  const W = box.clientWidth, H = box.clientHeight;
  const maxW = Math.min(124, Math.round(layoutCache.pw * 0.95));
  const { w, pos } = handLayout(cards.length, W, H, 8, maxW, 58);
  layoutCache.cw = w;
  handBox.classList.toggle('mine', yours);
  handBox.classList.toggle('busy', busy);
  const keep = new Set(cards.map((c) => c.id));
  for (const [id, el] of handEls) if (!keep.has(id)) { el.remove(); handEls.delete(id); }
  cards.forEach((c, i) => {
    let el = handEls.get(c.id);
    if (!el) {
      el = document.createElement('button'); el.type = 'button'; el.className = 'slot'; el.dataset.id = c.id;
      el.append(cardFace(c)); el.addEventListener('click', () => onCard(c.id));
      // Neue Karten ohne Gleit-Animation an ihren Platz setzen
      el.style.transition = 'none'; requestAnimationFrame(() => requestAnimationFrame(() => { el.style.transition = ''; }));
      handEls.set(c.id, el); box.append(el);
    }
    el.style.setProperty('--w', w + 'px');
    el.style.width = w + 'px'; el.style.height = Math.round(w * 1.4) + 'px';
    el.style.transform = `translate(${pos[i].x}px,${pos[i].y}px)`;
    el.style.zIndex = String(i + 1);
    el.style.visibility = hide.has(c.id) ? 'hidden' : '';
    const ok = legal.has(c.id);
    el.classList.toggle('ok', ok); el.classList.toggle('no', yours && !ok);
    el.classList.toggle('neu', state.drawn === c.id);
    el.setAttribute('aria-label', cardName(c) + (ok ? ', passt' : ''));
    if (box.children[i] !== el) box.insertBefore(el, box.children[i] || null);   // Reihenfolge für die Tastatur
  });
}

// ---------------------------------------------------------------- Animation (blockiert Eingaben, bis sie fertig ist)
function rectOf(el) { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }
function fly(face, from, to, dur = 380) {
  dur *= SPEED;
  if (!motion() || !from || !to || document.hidden) return Promise.resolve();
  const layer = $('fly'); const w = from.w;
  face.style.setProperty('--w', w + 'px'); face.style.left = from.x + 'px'; face.style.top = from.y + 'px';
  face.style.width = w + 'px'; face.style.height = w * 1.4 + 'px'; face.removeAttribute('aria-hidden');
  layer.append(face);
  const s = to.w / w, dx = to.x - from.x, dy = to.y - from.y, rot = (Math.random() * 10 - 5).toFixed(1);
  let anim;
  try {
    anim = face.animate([{ transform: 'translate(0,0) scale(1)' }, { transform: `translate(${dx}px,${dy}px) scale(${s}) rotate(${rot}deg)` }],
      { duration: dur, easing: 'cubic-bezier(.3,.7,.3,1)', fill: 'forwards' });
  } catch { face.remove(); return Promise.resolve(); }
  // Fallback, falls der Browser die Animation im Hintergrund anhält
  return Promise.race([anim.finished.catch(() => {}), wait(dur + 400)]).then(() => face.remove());
}
const centerRect = (el, w) => { const r = rectOf(el); return { x: r.x + r.w / 2 - w / 2, y: r.y + r.h / 2 - w * 0.7, w }; };

function colorPop() { if (!motion()) return; const c = $('colorChip'); c.classList.remove('pop'); void c.offsetWidth; c.classList.add('pop'); }
function zzz(who, on) { if (who === 1) $('fieteZzz').hidden = !on; }

// Einen Spielschritt ausführen, darstellen, ansagen. mutate() ändert state über die Engine und liefert true/false.
async function step(mutate, origin) {
  if (busy || !state) return false;
  const prevTop = state.discard.at(-1), prevColor = state.color;
  if (!mutate()) return false;
  busy = true; persist(); stopAi();
  const L = state.last, who = L.who;
  try {
    if (L.type === 'play') {
      const c = [...state.discard].reverse().find((k) => k.id === L.card);
      const from = who === 0 ? origin : centerRect($('fieteFan'), layoutCache.pw * 0.6);
      render({ holdTop: true, prevColor, keepMsg: true, fieteHide: L.extra != null && who === 0 ? 1 : 0, hide: new Set(L.extra != null && who === 1 ? [L.extra] : []) });
      SFX.lay();
      await fly(cardFace(c), from, rectOf($('discard')));
      render({ keepMsg: true, fieteHide: L.extra != null && who === 0 ? 1 : 0, hide: new Set(L.extra != null && who === 1 ? [L.extra] : []) });
      announcePlay(c, who);
      if (c.value === 'wild') { SFX.wild(); colorPop(); }
      if (state.winner === null && (c.value === 'skip' || c.value === 'draw1')) {
        zzz(1 - who, true);
        if (c.value === 'draw1' && L.extra != null) {
          await wait(250); SFX.plus();
          const to = 1 - who === 1 ? centerRect($('fieteFan'), layoutCache.pw * 0.6) : rectOf(handEls.get(L.extra) || $('hand'));
          await fly(backFace(layoutCache.pw), rectOf($('drawPile')), to, 420);
        } else SFX.skip();
        render({ keepMsg: true });
        await wait(motion() ? 650 : 200);
        zzz(1 - who, false);
      }
    } else if (L.type === 'draw') {
      SFX.draw();
      if (who === 0) {
        render({ hide: new Set([L.card]), keepMsg: true });
        const target = handEls.get(L.card);
        await fly(cardFace(state.hands[0].find((k) => k.id === L.card)), rectOf($('drawPile')), target ? rectOf(target) : null, 420);
        render({ keepMsg: true });
        if (L.fits) { setMsg('✨', 'Die neue Karte passt!', 'Ablegen oder behalten?', true); speak('Die neue Karte passt! Ablegen oder behalten?'); }
        else { setMsg('🙈', 'Passt leider nicht', 'Jetzt ist Fiete dran.', true); speak('Passt leider nicht. Fiete ist dran.'); await wait(700); }
      } else {
        render({ fieteHide: 1, keepMsg: true });
        await fly(backFace(layoutCache.pw), rectOf($('drawPile')), centerRect($('fieteFan'), layoutCache.pw * 0.6), 420);
        render({ keepMsg: true });
        bubble(L.fits ? 'Oh, die passt!' : 'Hmm, passt nicht.');
        setMsg('🦊', 'Fiete zieht eine Karte', '', true); speak('Fiete zieht eine Karte.');
        await wait(500);
      }
    } else if (L.type === 'keep') {
      SFX.click(); render({ keepMsg: true });
      if (who === 0) { setMsg('✋', 'Karte behalten', 'Jetzt ist Fiete dran.', true); speak('Behalten. Fiete ist dran.'); await wait(500); }
    } else if (L.type === 'empty') {
      toast('Der Stapel ist leer – weiter geht’s.'); render({ keepMsg: true }); await wait(600);
    }
  } finally {
    busy = false;
  }
  render();
  if (state.winner !== null) { finish(); return true; }
  if (state.turn === 0 && state.drawn === null && who === 1) speak(sayTurn());
  else if (state.turn === 0 && state.drawn === null && who === 0 && L.type === 'play' && (state.event === 'skip' || state.event === 'draw1')) speak('Fiete setzt aus. Du bist nochmal dran. ' + sayTurn().replace('Du bist dran. ', ''));
  else if (state.turn === 0 && state.drawn === null && L.type === 'empty') speak(sayTurn());
  if (state.turn === 0) focusHand();
  scheduleAi();
  return true;
}

function announcePlay(c, who) {
  const col = FARBEN[state.color].name;
  if (who === 1) {
    let t;
    if (c.value === 'wild') { t = `Fiete zaubert. Jetzt gilt ${col}.`; bubble('Ich wünsche mir ' + col + '!'); setMsg('🌈', 'Fiete wünscht sich ' + col, '', true); }
    else if (c.value === 'skip') { t = 'Fiete legt eine Pause. Du setzt aus.'; bubble('Pause für dich!'); setMsg('💤', 'Du setzt aus', 'Fiete ist nochmal dran.', true); }
    else if (c.value === 'draw1') { t = 'Fiete legt Plus eins. Du bekommst eine Karte und setzt aus.'; bubble('Plus eins!'); setMsg('🎁', 'Du bekommst eine Karte', 'Und Fiete ist nochmal dran.', true); }
    else { t = `Fiete legt ${TIERE[c.value].den} in ${FARBEN[c.color].name}.`; bubble(state.hands[1].length === 1 ? 'Letzte Karte!' : 'Da!'); }
    if (state.hands[1].length === 1 && state.winner === null) t += ' Fiete hat nur noch eine Karte.';
    if (state.winner === null) speak(t);
  } else {
    if (c.value === 'wild') setMsg('🌈', 'Jetzt gilt ' + col, '', true);
    else if (c.value === 'skip') { setMsg('💤', 'Fiete setzt aus', 'Du bist nochmal dran!', true); bubble('Ich schlafe kurz …'); }
    else if (c.value === 'draw1') { setMsg('🎁', 'Fiete bekommt eine Karte', 'Und du bist nochmal dran!', true); bubble('Oh nein, eine mehr!'); }
    else if (state.turn === 1) bubble(['Schöne Karte!', 'Hmm …', 'Mal sehen …', 'Gut gelegt!'][state.moves % 4]);
  }
}

function focusHand() {
  if (!document.activeElement || document.activeElement === document.body || !document.activeElement.isConnected || document.activeElement.closest('#hand,#table,.choice')) {
    if (!matchMedia('(hover: hover)').matches) return;   // auf Touch-Geräten keinen sichtbaren Fokusrahmen erzwingen
    const ok = [...$('hand').querySelectorAll('.slot.ok')][0];
    (state.drawn !== null ? $('btnLay') : ok || ($('drawPile').classList.contains('must') ? $('drawPile') : null))?.focus({ preventScroll: true });
  }
}

// ---------------------------------------------------------------- Eingaben
function onCard(id) {
  if (busy || dialog.open || !state || state.winner !== null) return;
  const el = handEls.get(id), c = state.hands[0].find((k) => k.id === id);
  if (!c) return;
  if (state.turn !== 0) { wiggle(el); toast('Warte kurz – Fiete ist dran.', 1500); return; }
  if (!E.legal(state).includes(id)) {
    wiggle(el); SFX.oops();
    if (state.drawn !== null) { setMsg('✨', 'Nur die neue Karte', 'Ablegen oder behalten?', true); speak('Du kannst nur die neue Karte ablegen. Oder behalten.'); }
    else { setMsg('🙅', 'Passt nicht', 'Gleiche Farbe oder gleiches Tier!', true); speak('Passt nicht. ' + sayTurn().replace('Du bist dran. ', '')); }
    return;
  }
  const origin = rectOf(el.firstElementChild);
  if (c.value === 'wild' && state.hands[0].length > 1) { chooseColor(id, origin); return; }
  step(() => E.play(state, id, state.color), origin);
}
function onDraw() {
  if (busy || dialog.open || !state || state.winner !== null) return;
  if (state.turn !== 0) { toast('Warte kurz – Fiete ist dran.', 1500); return; }
  if (state.drawn !== null) { wiggle($('drawPile')); setMsg('✨', 'Die neue Karte passt!', 'Ablegen oder behalten?', true); return; }
  if (E.legal(state).length) {
    wiggle($('drawPile')); SFX.oops();
    setMsg('💡', 'Eine Karte passt schon!', 'Schau, was leuchtet.', true); speak('Eine Karte passt schon. Schau, welche Karte leuchtet.');
    return;
  }
  step(() => E.draw(state));
}
function onLay() { if (state && state.drawn !== null) onCard(state.drawn); }
function onKeep() { if (busy || dialog.open || !state || state.turn !== 0) return; step(() => E.pass(state)); }

// ---------------------------------------------------------------- Fiete
function stopAi() { clearTimeout(aiTimer); aiTimer = 0; }
function scheduleAi(delay) {
  stopAi();
  if (!state || state.winner !== null || state.turn !== 1 || busy || dialog.open || document.hidden) return;
  bubble(['Ich überlege …', 'Hmm …', 'Mal sehen …'][state.moves % 3]);
  setMsg('🦊', 'Fiete ist dran', 'Schau zu, was er legt.');
  $('fieteAvatar').innerHTML = fieteHtml('fiete-denkt');
  const s = state;
  aiTimer = setTimeout(async () => {
    aiTimer = 0;
    if (state !== s || busy || dialog.open || document.hidden || state.turn !== 1 || state.winner !== null) return;
    await step(() => E.ai(state));
    $('fieteAvatar').innerHTML = fieteHtml(state && state.turn === 1 ? 'fiete-denkt' : 'fiete');
  }, (delay ?? (motion() ? 1000 : 600)) * SPEED);
}

// ---------------------------------------------------------------- Dialoge
function openDialog(html, onCancel) {
  stopAi(); content.innerHTML = html;
  dialog._cancel = onCancel || null;
  if (!dialog.open) dialog.showModal();
  dialog.scrollTop = 0;
}
function closeDialog() { if (dialog.open) dialog.close(); render(); scheduleAi(); }
dialog.addEventListener('cancel', (e) => { e.preventDefault(); if (dialog._cancel) dialog._cancel(); });

function chooseColor(id, origin) {
  openDialog(`<h2 id="dlgTitle">Welche Farbe?</h2><p>Wünsch dir eine Farbe!</p><div class="colors">${E.COLORS.map((k) =>
    `<button type="button" data-color="${k}" style="background:${FARBEN[k].hex}">${form(k)}${FARBEN[k].name}</button>`).join('')}</div>
    <button class="btn secondary" type="button" id="colorBack">Zurück</button>`, () => closeDialog());
  speak('Welche Farbe wünschst du dir? Rot, Blau, Grün oder Gelb?');
  content.querySelectorAll('[data-color]').forEach((b) => b.addEventListener('click', () => {
    if (!dialog.open) return;
    const color = b.dataset.color; dialog.close();
    step(() => E.play(state, id, color), origin);
  }, { once: true }));
  $('colorBack').addEventListener('click', () => closeDialog());
}

const LEVELS = [
  { name: 'Entdecken', sub: 'Farben und Tiere · ab 4', minis: [{ color: 'red', value: 'cat' }, { color: 'blue', value: 'cat' }], say: 'Stufe eins: Entdecken. Nur Farben und Tiere.' },
  { name: 'Zaubern', sub: 'Mit Farbwechsel · ab 5', minis: [{ color: 'green', value: 'frog' }, { color: 'wild', value: 'wild' }], say: 'Stufe zwei: Zaubern. Mit Farbwechsel-Karten.' },
  { name: 'Abenteuer', sub: 'Mit Pause und +1 · ab 6', minis: [{ color: 'yellow', value: 'skip' }, { color: 'red', value: 'draw1' }], say: 'Stufe drei: Abenteuer. Mit Pause und Plus eins.' }
];
let pickLevel = save.level;
function levelButtons() {
  return '<div class="levels">' + LEVELS.map((l, i) => `<button type="button" class="level" data-level="${i + 1}" aria-pressed="${pickLevel === i + 1}"><span class="no">${i + 1}</span><span class="minis"></span><span class="txt"><b>${l.name}</b><small>${l.sub}</small></span></button>`).join('') + '</div>';
}
function wireLevels() {
  content.querySelectorAll('.level').forEach((b) => {
    const l = LEVELS[b.dataset.level - 1];
    l.minis.forEach((c) => b.querySelector('.minis').append(cardFace({ ...c, id: 0 }, 30)));
    b.addEventListener('click', () => {
      pickLevel = Number(b.dataset.level); SFX.click();
      content.querySelectorAll('.level').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      speak(l.say);
    });
  });
}

function showMenu(start = false) {
  const running = state && state.winner === null;
  pickLevel = state ? state.level : save.level;
  const hero = `<div class="hero">${cardFaceHtml({ color: 'red', value: 'rabbit' }, 62, -12)}${cardFaceHtml({ color: 'blue', value: 'rabbit' }, 66, -4)}<div class="avatar">${fieteHtml()}</div>${cardFaceHtml({ color: 'green', value: 'panda' }, 66, 6)}</div>`;
  openDialog(`${hero}<h2 id="dlgTitle" class="${start ? 'titlebig' : ''}">${start ? 'Tier<span>trumpf</span>' : 'Pause'}</h2>
    ${start ? '<p class="sub">Farbe auf Farbe, Tier auf Tier!</p>' : ''}
    ${running ? '<button class="btn primary" type="button" id="mContinue"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15a1 1 0 0 0 1.5.86l12-7.5a1 1 0 0 0 0-1.72l-12-7.5A1 1 0 0 0 7 4.5z" fill="currentColor"/></svg>Weiterspielen</button>' : ''}
    <div id="newBox" ${running ? 'hidden' : ''}>${levelButtons()}<button class="btn primary" type="button" id="mStart"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15a1 1 0 0 0 1.5.86l12-7.5a1 1 0 0 0 0-1.72l-12-7.5A1 1 0 0 0 7 4.5z" fill="currentColor"/></svg>Los geht’s!</button></div>
    ${running ? '<button class="btn secondary" type="button" id="mNew">Neue Runde</button>' : ''}
    <div class="toggles"><button class="btn secondary" type="button" id="mHelp">❓ Regeln</button><button class="btn secondary" type="button" id="mSound" aria-pressed="${!muted}">🔊 Ton</button>${synth ? `<button class="btn secondary" type="button" id="mVoice" aria-pressed="${save.voice}">💬 Vorlesen</button>` : ''}</div>
    ${!storageOk ? '<p class="note">Speichern ist hier nicht möglich. Die Runde bleibt bis zum Schließen offen.</p>' : running ? '<p class="note">Deine Runde bleibt auf diesem Gerät gespeichert.</p>' : ''}`,
  () => { if (running) closeDialog(); });
  wireLevels();
  $('mContinue')?.addEventListener('click', () => { SFX.click(); closeDialog(); speak(sayTurn()); });
  $('mNew')?.addEventListener('click', () => {
    SFX.click(); $('newBox').hidden = false; $('mNew').hidden = true; $('mContinue').classList.replace('primary', 'secondary');
    $('mStart').textContent = 'Neu mischen'; speak('Welche Stufe? Die laufende Runde wird beendet.');
  });
  $('mStart').addEventListener('click', () => { SFX.click(); newGame(pickLevel); });
  $('mHelp').addEventListener('click', () => { SFX.click(); showHelp(() => showMenu(start)); });
  $('mSound').addEventListener('click', (e) => { setMuted(!muted); e.currentTarget.setAttribute('aria-pressed', String(!muted)); SFX.click(); });
  $('mVoice')?.addEventListener('click', async (e) => { const b = e.currentTarget; await setVoice(!save.voice); b.setAttribute('aria-pressed', String(save.voice)); });
}
function cardFaceHtml(c, w, rot) { const el = cardFace({ ...c, id: 0 }, w); el.style.transform = `rotate(${rot}deg)`; return el.outerHTML; }

function showHelp(back) {
  const m = (c) => cardFaceHtml(c, 34, 0);
  openDialog(`<h2 id="dlgTitle">So geht’s</h2>
    <ul class="rules">
      <li><span class="ex">${m({ color: 'red', value: 'cat' })}→${m({ color: 'red', value: 'lion' })}✅</span><span><b>Gleiche Farbe</b> passt.</span></li>
      <li><span class="ex">${m({ color: 'red', value: 'cat' })}→${m({ color: 'blue', value: 'cat' })}✅</span><span><b>Gleiches Tier</b> passt. Die Zahl gehört immer zum Tier.</span></li>
      <li><span class="ex">👆 ${m({ color: 'green', value: 'frog' })}</span><span>Nichts passt? <b>Karte ziehen.</b> Passt sie, darfst du sie legen oder behalten.</span></li>
      <li><span class="ex">${m({ color: 'wild', value: 'wild' })}</span><span><b>Farbwechsel</b> (Stufe 2): passt immer. Du wünschst dir eine Farbe.</span></li>
      <li><span class="ex">${m({ color: 'blue', value: 'skip' })}</span><span><b>Pause</b> (Stufe 3): Der andere setzt aus. Du bist nochmal dran.</span></li>
      <li><span class="ex">${m({ color: 'yellow', value: 'draw1' })}</span><span><b>+1</b> (Stufe 3): Der andere bekommt eine Karte und setzt aus.</span></li>
      <li><span class="ex">🏆</span><span>Wer zuerst <b>keine Karten</b> mehr hat, gewinnt. Kein Rufen nötig, keine Eile.</span></li>
    </ul>
    ${synth ? '<button class="btn secondary" type="button" id="hSay">💬 Vorlesen</button>' : ''}
    <button class="btn primary" type="button" id="hBack">Verstanden!</button>`, () => back());
  $('hBack').addEventListener('click', () => { SFX.click(); synth?.cancel(); back(); });
  $('hSay')?.addEventListener('click', () => {
    const was = save.voice; save.voice = true;
    speak('Leg die gleiche Farbe oder das gleiche Tier. Die Zahl gehört immer zum Tier. Passt nichts, ziehst du eine Karte. Passt sie, darfst du sie legen oder behalten. Der Farbwechsel passt immer, dann wünschst du dir eine Farbe. Bei der Pause setzt der andere aus. Bei Plus eins bekommt der andere eine Karte und setzt aus. Wer zuerst keine Karten mehr hat, gewinnt.');
    save.voice = was;
  });
}

function newGame(level) {
  stopAi(); synth?.cancel();
  state = E.create(level); save.level = level; save.game = state; persist();
  for (const el of handEls.values()) el.remove(); handEls.clear();
  if (dialog.open) dialog.close();
  $('fieteAvatar').innerHTML = fieteHtml(); bubble('Viel Glück!');
  render();
  // Karten austeilen: kurz nacheinander einfliegen lassen
  if (motion()) {
    busy = true; render();
    const ids = sortHand(state.hands[0]).map((c) => c.id);
    ids.forEach((id) => { const el = handEls.get(id); if (el) el.style.visibility = 'hidden'; });
    (async () => {
      const from = rectOf($('drawPile'));
      for (const id of ids) {
        const el = handEls.get(id); if (!el) continue;
        SFX.draw();
        await fly(cardFace(state.hands[0].find((k) => k.id === id)), from, rectOf(el), 260);
        el.style.visibility = '';
      }
      busy = false; render(); speak(sayTurn()); focusHand();
    })();
  } else speak(sayTurn());
}

function finish() {
  stopAi();
  const w = state.winner;
  if (w === 0) save.bilanz.s++; else if (w === 1) save.bilanz.n++; else save.bilanz.u++;
  const level = state.level;
  save.game = null; persist();   // abgeschlossene Runde nicht fortsetzen
  if (w === 0) { SFX.win(); confetti(); } else SFX.lose();
  $('fieteAvatar').innerHTML = fieteHtml(w === 1 ? 'fiete-jubel' : 'fiete');
  bubble(w === 0 ? 'Glückwunsch!' : w === 1 ? 'Juhu, gewonnen!' : 'Gleichstand!');
  const pic = w === 0 ? '🏆' : `<div class="avatar" style="width:96px;height:96px;font-size:62px">${fieteHtml(w === 1 ? 'fiete-jubel' : 'fiete')}</div>`;
  const title = w === 0 ? 'Gewonnen!' : w === 1 ? 'Fiete gewinnt!' : 'Gleichstand!';
  const text = w === 0 ? 'Alle Karten sind weg. Super gespielt!' : w === 1 ? 'Fiete war diesmal schneller. Nochmal?' : 'Keiner kann mehr legen. Neue Runde?';
  setTimeout(() => {
    openDialog(`<div class="winpic">${pic}</div><h2 id="dlgTitle">${title}</h2><p>${text}</p>
      <div class="score" aria-label="Bilanz: du ${save.bilanz.s}, Fiete ${save.bilanz.n}"><span>🧒 ${save.bilanz.s}</span><small>:</small><span>${save.bilanz.n} 🦊</span></div>
      <button class="btn primary" type="button" id="rAgain"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.4-5.7" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"/><path d="M4 4v5h5" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/></svg>Nochmal!</button>
      <button class="btn secondary" type="button" id="rLevel">Andere Stufe</button>
      <div class="konto" id="kontoBox" hidden><b>🦊 Bilanz sichern</b><span>Mit einem kostenlosen PlaySaal-Konto bleibt eure Bilanz gegen Fiete erhalten – auch auf einem neuen Gerät. (ab 16 Jahren)</span><button type="button" id="kontoBtn">Konto anlegen</button></div>`,
    () => { state = null; showMenu(true); });
    $('rAgain').addEventListener('click', () => { SFX.click(); newGame(level); });
    $('rLevel').addEventListener('click', () => { SFX.click(); state = null; showMenu(true); });
    kontoHinweis('kontoBox');
    speak(title + ' ' + text);
  }, (motion() ? 700 : 100) * SPEED);
}

function kontoHinweis(id) {
  if (!id) return;
  const P = window.PlaySaal, runden = save.bilanz.s + save.bilanz.n + save.bilanz.u;
  let zeigen = false;
  try { zeigen = !!(P && P.hostOk && !P.user() && runden >= 3); } catch { zeigen = false; }
  const box = $(id); if (!box) return;
  box.hidden = !zeigen;
  $('kontoBtn')?.addEventListener('click', () => { try { P.anmelden({}); } catch { /* Konten nicht verfügbar */ } }, { once: true });
}

function confetti() {
  if (!motion()) return;
  const box = document.createElement('div'); box.className = 'confetti'; box.setAttribute('aria-hidden', 'true');
  const cols = Object.values(FARBEN).map((f) => f.hex).concat('#FFD21C', '#fff');
  for (let i = 0; i < 60; i++) {
    const p = document.createElement('i');
    p.style.left = Math.random() * 100 + '%'; p.style.background = cols[i % cols.length];
    p.style.animationDuration = 1.6 + Math.random() * 1.6 + 's'; p.style.animationDelay = Math.random() * 0.5 + 's';
    box.append(p);
  }
  document.body.append(box); setTimeout(() => box.remove(), 4000);
}

// ---------------------------------------------------------------- Start
$('drawPile').addEventListener('click', onDraw);
$('btnLay').addEventListener('click', onLay);
$('btnKeep').addEventListener('click', onKeep);
$('btnMenu').addEventListener('click', () => { if (!busy) { SFX.click(); showMenu(!state); } });
$('btnSound').addEventListener('click', () => { setMuted(!muted); SFX.click(); });
$('btnVoice').addEventListener('click', () => setVoice(!save.voice));
if (!synth) $('btnVoice').hidden = true;
setMuted(muted);
$('btnVoice').setAttribute('aria-pressed', String(save.voice));
$('btnVoice').setAttribute('aria-label', save.voice ? 'Vorlesen ausschalten' : 'Vorlesen einschalten');

document.addEventListener('visibilitychange', () => {
  if (document.hidden) { stopAi(); persist(); synth?.cancel(); }
  else if (!dialog.open) { render(); scheduleAi(); }
});
addEventListener('pagehide', () => { stopAi(); persist(); });
let rz = 0; addEventListener('resize', () => { cancelAnimationFrame(rz); rz = requestAnimationFrame(() => { $('fieteFan').replaceChildren(); render({ keepMsg: true }); }); });

$('fieteAvatar').innerHTML = fieteHtml();
render();
showMenu(true);
if (state) speak('Willkommen zurück!');

// Grafiken nachladen (fehlende Bilder bleiben Platzhalter)
fetch(new URL('img/manifest.json', BASE)).then((r) => (r.ok ? r.json() : [])).catch(() => []).then((list) => {
  if (!Array.isArray(list) || !list.length) return;
  bilder = new Set(list.filter((x) => typeof x === 'string'));
  if (bilder.has('hintergrund')) { document.body.style.setProperty('--bg', `url("${new URL('img/hintergrund.webp', BASE)}")`); document.body.classList.add('bg'); }
  for (const el of handEls.values()) el.remove(); handEls.clear();
  $('fieteAvatar').innerHTML = fieteHtml();
  render({ keepMsg: true });
});

// Für Tests: Zustand lesen (ohne Einfluss auf das Spiel)
window.__tiertrumpf = { get state() { return state; }, get busy() { return busy; }, layout: handLayout };
