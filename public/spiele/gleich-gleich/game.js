// Gleich, gleich! – Oberfläche: Menü, Levelauswahl, Kartenbrett, Fiete-Züge, Vorlesen, Ton, Speichern.
import * as E from './engine.js';

const $ = (id) => document.getElementById(id);
const KEY = 'gleichgleich.v1', MUTE = 'gleichgleich.muted';
const Q = new URLSearchParams(location.search);
const SCHNELL = Q.has('schnell');                       // nur für Tests: kurze Pausen
const T = (ms) => (SCHNELL ? 30 : ms);
const IMG = new URL('./img/', import.meta.url).href;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const motion = () => !matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------------------------------------------------------------- Spielstand
let save = E.ladeStand((() => { try { return localStorage.getItem(KEY); } catch { return null; } })());
function persist() { try { localStorage.setItem(KEY, JSON.stringify(save)); } catch { /* privat/voll: weiter ohne Speichern */ } }

// ---------------------------------------------------------------- Ton (selbst erzeugte kleine Klänge)
let muted = false; try { muted = localStorage.getItem(MUTE) === '1'; } catch { /* egal */ }
let ac = null;
function audio() {
  if (muted) return null;
  try { ac = ac || new (window.AudioContext || window.webkitAudioContext)(); if (ac.state === 'suspended') ac.resume(); } catch { ac = null; }
  return ac;
}
function tone(freq, t0, dur, type = 'sine', vol = 0.16, slide = 0) {
  const a = audio(); if (!a) return;
  const o = a.createOscillator(), g = a.createGain(), t = a.currentTime + t0;
  o.type = type; o.frequency.setValueAtTime(freq, t); if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + 0.02);
}
const SFX = {
  flip: () => tone(620, 0, 0.09, 'triangle', 0.14, 1.4),
  paar: () => [659, 784, 1047].forEach((f, i) => tone(f, i * 0.08, 0.2, 'sine', 0.15)),
  daneben: () => { tone(392, 0, 0.12, 'triangle', 0.1); tone(330, 0.1, 0.16, 'triangle', 0.1); },
  sieg: () => [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, i * 0.11, 0.22, 'triangle', 0.15)),
  klick: () => tone(880, 0, 0.05, 'sine', 0.06)
};
function setMuted(m) {
  muted = m; try { localStorage.setItem(MUTE, m ? '1' : '0'); } catch { /* egal */ }
  $('btnSound').setAttribute('aria-pressed', String(!m)); $('btnSound').setAttribute('aria-label', m ? 'Ton einschalten' : 'Ton ausschalten');
}

// ---------------------------------------------------------------- Vorlesen (Browser-Sprachausgabe)
const synth = 'speechSynthesis' in window ? window.speechSynthesis : null;
let deVoice = null;
function pickVoice() {
  if (!synth) return 0;
  const vs = synth.getVoices() || [];
  deVoice = vs.find((v) => /^de(-|_|$)/i.test(v.lang) && v.localService) || vs.find((v) => /^de(-|_|$)/i.test(v.lang)) || null;
  return vs.length;
}
if (synth) { pickVoice(); synth.addEventListener?.('voiceschanged', pickVoice); }
function speak(text, cancel = true) {
  if (!save.voice || !synth || !text) return;
  try { if (cancel) synth.cancel(); const u = new SpeechSynthesisUtterance(text); u.lang = 'de-DE'; if (deVoice) u.voice = deVoice; u.rate = 0.95; u.pitch = 1.08; synth.speak(u); } catch { /* ohne Stimme weiter */ }
}
async function setVoice(on, ansage = true) {
  if (on && synth) {
    let n = pickVoice();
    for (let i = 0; i < 8 && !n; i++) { await wait(200); n = pickVoice(); }
    if (n && !deVoice) { if (ansage) toast('Auf diesem Gerät gibt es keine deutsche Stimme.'); on = false; }
  }
  save.voice = on; persist();
  $('btnVoice').setAttribute('aria-pressed', String(on));
  $('btnVoice').setAttribute('aria-label', on ? 'Vorlesen ausschalten' : 'Vorlesen einschalten');
  if (on && ansage) speak('Vorlesen ist an.'); else if (!on) synth?.cancel();
}

// ---------------------------------------------------------------- Kleine Helfer
let toastTimer = 0;
function toast(t, ms = 2600) { const el = $('toast'); el.textContent = t; el.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, ms); }
function info(t) { $('info').textContent = t; }
function zeige(id) { for (const s of ['menu', 'levels', 'spiel']) $(s).hidden = s !== id; $('btnMenu').hidden = id !== 'spiel'; }
function weltFarbe(wi) { const f = E.WELTEN[wi].farbe; document.documentElement.style.setProperty('--bg1', f[0]); document.documentElement.style.setProperty('--bg2', f[1]); }
const sternText = (n) => '★'.repeat(n) + '<i>' + '★'.repeat(3 - n) + '</i>';
const summeSterne = () => Object.values(save.best).reduce((a, b) => a + b, 0);
const ava = (id, bild) => { $(id).innerHTML = bild ? `<img src="${IMG}${bild}.webp" alt="">` : ''; };

// ---------------------------------------------------------------- Menü
function modusSetzen(m) {
  save.modus = m; persist();
  document.querySelectorAll('.modus').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.modus === m)));
}
function naechstesLevel() { return E.offenBis(save.best); }
function openMenu() {
  stopp(); zeige('menu'); weltFarbe(E.LEVELS[naechstesLevel() - 1].welt);
  const n = naechstesLevel(), fertig = Object.keys(save.best).length === E.LEVELS.length;
  $('btnPlay').textContent = fertig ? 'Nochmal spielen' : n === 1 ? "Los geht's!" : 'Weiter mit Level ' + n;
  kontoHinweis('kontoBoxMenu');
}
function openLevels() {
  stopp(); zeige('levels');
  $('sternSumme').textContent = summeSterne() + ' von ' + E.LEVELS.length * 3 + ' ★';
  const offen = naechstesLevel(), box = $('welten'); box.innerHTML = '';
  E.WELTEN.forEach((w, wi) => {
    const el = document.createElement('div'); el.className = 'welt';
    el.style.background = `linear-gradient(135deg,${w.farbe[0]},${w.farbe[1]})`;
    const lv = E.LEVELS.filter((l) => l.welt === wi);
    el.innerHTML = `<div class="wbild"><img src="${IMG}${w.motive[0][0]}.webp" alt="" loading="lazy"></div><div><h3>${w.name}</h3><div class="lv"></div></div>`;
    for (const l of lv) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'lvbtn' + (l.nr === offen && !save.best[l.nr] ? ' next' : '');
      const st = save.best[l.nr] || 0, zu = l.nr > offen;
      b.disabled = zu; b.dataset.level = l.nr;
      b.innerHTML = `${zu ? '🔒' : l.nr}<small>${sternText(st)}</small>`;
      b.setAttribute('aria-label', `Level ${l.nr}, ${l.paare} Paare` + (zu ? ', noch gesperrt' : st ? `, ${st} von 3 Sternen` : ''));
      b.addEventListener('click', () => { SFX.klick(); start(l.nr); });
      el.querySelector('.lv').appendChild(b);
    }
    box.appendChild(el);
  });
  box.querySelector('.lvbtn.next')?.scrollIntoView({ block: 'center' });
}

// ---------------------------------------------------------------- Spiel
let s = null, busy = false, runde = 0, merkR = Math.random, fieteR = Math.random;
const fieteModus = () => s && s.modus === 'fiete';
const amZug = () => s && !s.ende && (s.modus !== 'fiete' || s.dran === 0);
const nameDran = () => (s.modus === 'fiete' ? (s.dran === 0 ? 'Du bist' : 'Fiete ist') : s.modus === 'zwei' ? `Spieler ${s.dran + 1} ist` : 'Du bist');

function stopp() { runde++; busy = false; synth?.cancel(); }

function start(nr) {
  stopp();
  const seed = Q.has('seed') ? Number(Q.get('seed')) + nr : (Math.random() * 2 ** 32) >>> 0;
  if (Q.has('seed')) { merkR = E.rng(seed ^ 0x5bd1e995); fieteR = E.rng(seed ^ 0x27d4eb2d); }
  s = E.neu(nr, save.modus, seed);
  const lv = E.LEVELS[nr - 1], w = E.WELTEN[lv.welt];
  weltFarbe(lv.welt); zeige('spiel');
  $('spiel').className = 'screen spiel ' + s.modus;
  $('weltName').textContent = w.name; $('levelName').textContent = 'Level ' + nr;
  if (s.modus === 'fiete') { $('ava0').textContent = '🧒'; $('wer0').textContent = 'Du'; ava('ava1', 'fiete'); $('wer1').textContent = 'Fiete'; }
  else if (s.modus === 'zwei') { $('ava0').textContent = '🧒'; $('wer0').textContent = 'Spieler 1'; $('ava1').textContent = '🧒'; $('wer1').textContent = 'Spieler 2'; }
  else { $('ava0').textContent = '🧒'; $('wer0').textContent = 'Paare'; }
  baueKarten(); leiste();
  info(s.modus === 'allein' ? 'Dreh zwei Karten um!' : nameDran() + ' dran!');
  speak(s.modus === 'allein' ? 'Finde die gleichen Bilder!' : s.modus === 'fiete' ? 'Du fängst an. Finde die gleichen Bilder!' : 'Spieler 1 fängt an.');
}

function baueKarten() {
  const box = $('karten'); box.innerHTML = '';
  s.karten.forEach((k, i) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'karte'; b.dataset.i = i;
    b.innerHTML = `<span class="innen"><span class="rueck"></span><span class="vorn"><img src="${IMG}${k.m}.webp" alt="" draggable="false"></span></span>`;
    b.setAttribute('aria-label', 'Verdeckte Karte ' + (i + 1));
    b.addEventListener('click', () => tippe(i));
    box.appendChild(b);
  });
  layout();
}
function layout() {
  if (!s || $('spiel').hidden) return;
  const r = $('brett').getBoundingClientRect(), gap = r.width < 400 ? 8 : 12;
  const g = E.raster(s.karten.length, r.width - 4, r.height - 8, gap);
  const w = Math.max(48, Math.min(g.w, 170));
  const box = $('karten'); box.style.setProperty('--sp', g.spalten); box.style.setProperty('--w', w + 'px'); box.style.setProperty('--gap', gap + 'px');
}
addEventListener('resize', layout);
if ('ResizeObserver' in window) new ResizeObserver(layout).observe($('brett'));

function zeichne(i) {
  const k = s.karten[i], b = $('karten').children[i]; if (!b) return;
  b.classList.toggle('offen', k.offen || k.weg >= 0);
  b.classList.toggle('weg', k.weg >= 0); b.classList.toggle('w1', k.weg === 1);
  b.disabled = k.weg >= 0;
  b.setAttribute('aria-label', k.weg >= 0 ? E.NAMEN[k.m] + ', gefunden' : k.offen ? E.NAMEN[k.m] : 'Verdeckte Karte ' + (i + 1));
}
function leiste() {
  const allein = s.modus === 'allein';
  $('zahl0').textContent = allein ? `${s.paare[0]}/${s.karten.length / 2}` : s.paare[0];
  $('zahl1').textContent = allein ? s.zuege : s.paare[1];
  if (allein) $('zahl1').setAttribute('title', 'Versuche'); else $('zahl1').removeAttribute('title');
  $('seite0').classList.toggle('dran', !allein && s.dran === 0 && !s.ende);
  $('seite1').classList.toggle('dran', !allein && s.dran === 1 && !s.ende);
  $('karten').classList.toggle('wartet', !amZug() || busy);
  if (fieteModus()) ava('ava1', s.dran === 1 ? 'fiete-denkt' : 'fiete');
}

async function tippe(i) {
  if (busy || !amZug() || !E.darf(s, i)) { if (s && !busy && s.karten[i] && s.karten[i].offen && s.auf.length < 2) wackel(i); return; }
  audio();
  await zug(i);
}
function wackel(i) { const b = $('karten').children[i]; if (!b || !motion()) return; b.classList.remove('wackel'); void b.offsetWidth; b.classList.add('wackel'); }

// Eine Karte aufdecken und die Folgen zeigen (für Kind und Fiete gleich)
async function zug(i) {
  const meine = runde, wer = s.dran;
  const erg = E.aufdecken(s, i, merkR); if (!erg) return;
  SFX.flip(); zeichne(i);
  const name = E.NAMEN[s.karten[i].m];
  if (erg === 'erste') { speak(name); info(name + '! Und wo ist das zweite?'); leiste(); return; }
  busy = true; leiste();
  if (erg === 'paar') {
    const [a, b] = s.karten.map((k, j) => (k.m === s.karten[i].m ? j : -1)).filter((j) => j >= 0);
    for (const j of [a, b]) { zeichne(j); const el = $('karten').children[j]; el.classList.remove('paar'); void el.offsetWidth; el.classList.add('paar'); }
    SFX.paar(); speak(name + '. Gleich, gleich!');
    info(s.modus === 'fiete' && wer === 1 ? 'Fiete hat ein Paar: ' + name + '!' : s.modus === 'zwei' ? `Paar für Spieler ${wer + 1}: ${name}!` : 'Gleich, gleich! ' + name + '!');
    leiste();
    await wait(T(900)); if (meine !== runde) return;
    busy = false;
    if (s.ende) return fertig();
    if (s.modus !== 'allein') info((wer === 1 && s.modus === 'fiete' ? 'Fiete ist' : nameDran()) + ' nochmal dran!');
    leiste();
    if (fieteModus() && s.dran === 1) fieteZug();
    return;
  }
  // daneben
  speak(name, true); SFX.daneben();
  info('Oh, nicht gleich. ' + (s.modus === 'allein' ? 'Merk sie dir!' : ''));
  await wait(T(1400)); if (meine !== runde) return;
  const offen = s.auf.slice(); E.zudecken(s); offen.forEach(zeichne);
  busy = false; leiste();
  if (s.modus !== 'allein') { info(nameDran() + ' dran!'); speak(nameDran() + ' dran.'); }
  else info('Dreh zwei Karten um!');
  if (fieteModus() && s.dran === 1) fieteZug();
}

async function fieteZug() {
  const meine = runde;
  busy = true; leiste(); info('Fiete überlegt …');
  await wait(T(900)); if (meine !== runde || s.ende) return;
  const a = E.fieteWahl(s, fieteR);
  busy = false; await zug(a); if (meine !== runde || s.ende) return;
  busy = true; leiste();
  await wait(T(1000)); if (meine !== runde) return;
  const b = E.fieteWahl(s, fieteR);
  busy = false; await zug(b);
}

// ---------------------------------------------------------------- Ende
async function fertig() {
  const st = E.sterne(s), nr = s.level, lv = E.LEVELS[nr - 1];
  if (st > (save.best[nr] || 0)) { save.best[nr] = st; persist(); }
  let titel = 'Geschafft!', text = '', bild = 'fiete-jubel', sag = '';
  if (s.modus === 'allein') {
    text = `Alle ${lv.paare} Paare in ${s.zuege} Versuchen gefunden.`;
    sag = st === 3 ? 'Super! Drei Sterne!' : 'Geschafft! Alle Paare gefunden.';
  } else if (s.modus === 'fiete') {
    if (s.paare[0] > s.paare[1]) { titel = 'Du gewinnst!'; sag = 'Juhu, du hast gewonnen!'; bild = 'fiete'; }
    else if (s.paare[0] === s.paare[1]) { titel = 'Unentschieden!'; sag = 'Unentschieden! Gut gespielt.'; }
    else { titel = 'Fiete gewinnt!'; sag = 'Fiete hat diesmal mehr Paare. Nochmal?'; bild = 'fiete-jubel'; }
    text = `Du: ${s.paare[0]} Paare · Fiete: ${s.paare[1]} Paare`;
  } else {
    titel = s.paare[0] > s.paare[1] ? 'Spieler 1 gewinnt!' : s.paare[1] > s.paare[0] ? 'Spieler 2 gewinnt!' : 'Unentschieden!';
    text = `Spieler 1: ${s.paare[0]} · Spieler 2: ${s.paare[1]} Paare`; sag = titel;
  }
  $('endeTitel').textContent = titel; $('endeText').textContent = text;
  $('endeBild').src = IMG + bild + '.webp';
  $('endeSterne').hidden = s.modus === 'zwei';
  $('endeSterne').innerHTML = [0, 1, 2].map((k) => (k < st ? '<span>★</span>' : '<span><i>★</i></span>')).join('');
  const letztes = nr >= E.LEVELS.length;
  $('btnWeiter').textContent = letztes ? 'Zur Levelauswahl' : 'Weiter zu Level ' + (nr + 1);
  kontoHinweis('kontoBox');
  SFX.sieg(); speak(sag);
  info(titel); leiste();
  await wait(T(500));
  const d = $('ende'); if (!d.open) d.showModal();
}
$('btnWeiter').addEventListener('click', () => { SFX.klick(); $('ende').close(); if (s.level >= E.LEVELS.length) openLevels(); else start(s.level + 1); });
$('btnNochmal').addEventListener('click', () => { SFX.klick(); $('ende').close(); start(s.level); });
$('btnZumMenu').addEventListener('click', () => { SFX.klick(); $('ende').close(); openMenu(); });
$('ende').addEventListener('cancel', (e) => { e.preventDefault(); $('ende').close(); openMenu(); });

// ---------------------------------------------------------------- Konto-Hinweis (nur ohne Anmeldung, ab 2 geschafften Leveln)
function kontoHinweis(id) {
  const P = window.PlaySaal, n = Object.keys(save.best).length;
  let zeigen = false;
  try { zeigen = !!(P && P.hostOk && !P.user() && n >= 2 && (id === 'kontoBoxMenu' || [2, 5, 10, 15, 21].includes(n))); } catch { zeigen = false; }
  $(id).hidden = !zeigen;
}
function kontoAnlegen() { try { window.PlaySaal && window.PlaySaal.anmelden({}); } catch { /* Konten nicht verfügbar */ } }
$('kontoBtn').addEventListener('click', kontoAnlegen);
$('kontoBtnMenu').addEventListener('click', kontoAnlegen);
setTimeout(() => { if (!$('menu').hidden) kontoHinweis('kontoBoxMenu'); }, 1500);   // playsaal.js lädt verzögert

// ---------------------------------------------------------------- Knöpfe
document.querySelectorAll('.modus').forEach((b) => b.addEventListener('click', () => {
  audio(); SFX.klick(); modusSetzen(b.dataset.modus);
  speak(b.dataset.modus === 'allein' ? 'Allein spielen' : b.dataset.modus === 'fiete' ? 'Gegen Fuchs Fiete' : 'Zu zweit');
}));
$('btnPlay').addEventListener('click', () => { audio(); SFX.klick(); const n = naechstesLevel(); start(Object.keys(save.best).length === E.LEVELS.length ? 1 : n); });
$('btnLevels').addEventListener('click', () => { audio(); SFX.klick(); openLevels(); });
$('levelsBack').addEventListener('click', () => { SFX.klick(); openMenu(); });
$('btnMenu').addEventListener('click', () => { SFX.klick(); openMenu(); });
$('btnSound').addEventListener('click', () => { setMuted(!muted); if (!muted) SFX.klick(); });
$('btnVoice').addEventListener('click', () => { audio(); setVoice(!save.voice); });
document.addEventListener('visibilitychange', () => { if (document.hidden) synth?.cancel(); });

// ---------------------------------------------------------------- Start
setMuted(muted);
modusSetzen(save.modus);
if (!synth) $('btnVoice').hidden = true;
else setVoice(save.voice, false);
openMenu();

// Für die Prüfung (Browser-Test)
window.__gleich = { get state() { return s; }, get busy() { return busy; }, start, E };
