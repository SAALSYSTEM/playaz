// AUSFAHRT FREI: Darstellung, Bedienung (Schieben per Finger), Ton, Speicherstand, Levelmodus, Tagesrätsel und Rangliste.
// Regeln stehen in sim.js, die Rätsel in raetsel.js (beides prüft auf dem Server jeden Lösungsweg nach).
// Fahrzeuge kommen als Bilder aus img/ (von oben, Fahrtrichtung nach rechts); fehlt ein Bild, zeichnet das Spiel einen Platzhalter.
// Aufbau wie LEITUNGSCHAOS (Server-Seed, ein gewerteter Versuch je Tag, Zeit von der Datenbank).
import { VERSION, N, AUSFAHRT_ZEILE, lese, raster, spielraum, neuesSpiel, fahre, kodiere, dekodiere, tagesNummer } from './sim.js';
import { LEVEL, POOLS } from './raetsel.js';

const $ = (id) => document.getElementById(id);
const CFG = () => window.PLAYSAAL_CFG || {};
const PS = () => window.PlaySaal || null;
const KEY = 'ausfahrt.v1';
const WENIG_BEWEGUNG = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);

// ---------- Speicherstand ----------
// frei: höchstes freigeschaltetes Level; best[nr] = { z: Züge, t: Hundertstel, s: Sterne }; tage[JJJJMMTT] = { z, t }; offen = angefangenes Tagesrätsel
let store = { v: 1, sound: true, frei: 1, best: {}, tage: {}, offen: null };
const ganz = (x, max) => Math.max(0, Math.min(max, Math.floor(Number(x) || 0)));
function laden() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!d || typeof d !== 'object') return;
    store.sound = d.sound !== false;
    store.frei = Math.max(1, Math.min(LEVEL.length, ganz(d.frei, LEVEL.length)));
    if (d.best && typeof d.best === 'object') for (const k of Object.keys(d.best)) {
      const nr = Number(k), b = d.best[k];
      if (nr >= 1 && nr <= LEVEL.length && b && typeof b === 'object') store.best[nr] = { z: ganz(b.z, 99999), t: ganz(b.t, 1e8), s: ganz(b.s, 3) };
    }
    if (d.tage && typeof d.tage === 'object') for (const k of Object.keys(d.tage).slice(-60)) {
      const t = d.tage[k]; if (/^\d{8}$/.test(k) && t && typeof t === 'object') store.tage[k] = { z: ganz(t.z, 99999), t: ganz(t.t, 1e8) };
    }
    const o = d.offen;
    if (o && typeof o === 'object' && /^\d{8}$/.test(String(o.tag)) && Number.isInteger(o.seed) && Number.isInteger(o.version) && typeof o.inputs === 'string')
      store.offen = { tag: String(o.tag), seed: o.seed, version: o.version, inputs: o.inputs.slice(0, 2000), run: typeof o.run === 'string' ? o.run : null, t0: Number(o.t0) || 0 };
  } catch (e) {}
}
function speichern() {
  const keys = Object.keys(store.tage).sort(); while (keys.length > 60) delete store.tage[keys.shift()];
  try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) {}
}
const tagText = (n) => { const s = String(n); return s.slice(6, 8) + '.' + s.slice(4, 6) + '.'; };
const tagVoll = (n) => tagText(n) + String(n).slice(0, 4);
const zeitText = (cs) => { cs = Math.max(0, Math.floor(cs)); const s = Math.floor(cs / 100), m = Math.floor(s / 60); return m + ':' + String(s % 60).padStart(2, '0'); };
const zeitGenau = (cs) => zeitText(cs) + ',' + String(Math.floor(cs % 100)).padStart(2, '0');
const zeitKurz = (cs) => (cs >= 6000 ? zeitText(cs) + ' min' : (cs / 100).toFixed(2).replace('.', ',') + ' s');
const sterneFuer = (z, min) => (z <= min ? 3 : z * 2 <= min * 3 ? 2 : 1);

// ---------- Bilder (von oben, Fahrtrichtung nach rechts) ----------
// Pflicht: Hintergrund, Mischer, je ein 2er- und 3er-Fahrzeug. Zweite Varianten sind optional.
const ZWEI = ['af-pritsche', 'af-radlader', 'af-stapler'], DREI = ['af-container', 'af-tieflader'];   // kurze (2 Felder) und lange (3 Felder) Fahrzeuge
const IMAGES = ['af-hintergrund', 'af-mischer', ZWEI[0], DREI[0]];
const OPTIONAL = [...ZWEI.slice(1), ...DREI.slice(1)];
const img = {}; let bilderFehlen = false;
for (const n of [...IMAGES, ...OPTIONAL]) {
  const b = new Image(); b.decoding = 'async';
  b.onload = () => { img[n] = b; if (n === 'af-hintergrund') { document.body.classList.add('bild'); document.body.style.backgroundImage = 'url(ausfahrt-frei/img/' + n + '.webp)'; } zeichneNeu = true; };
  b.onerror = () => { if (OPTIONAL.includes(n)) return; bilderFehlen = true; $('platzhalter').hidden = false; zeichneNeu = true; };
  b.src = 'ausfahrt-frei/img/' + n + '.webp';
}

// ---------- Ton ----------
const ton = (() => {
  let ac = null;
  const piep = (f, d, typ = 'sine', vol = 0.1, gleit = 0) => {
    if (!store.sound || !ac) return; const t = ac.currentTime, o = ac.createOscillator(), g = ac.createGain();
    o.type = typ; o.frequency.setValueAtTime(f, t); if (gleit) o.frequency.exponentialRampToValueAtTime(gleit, t + d);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d); o.connect(g).connect(ac.destination); o.start(t); o.stop(t + d + 0.02);
  };
  return {
    start() { try { if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)(); if (ac.state === 'suspended') ac.resume(); } catch (e) {} },
    fahrt() { piep(180, 0.09, 'triangle', 0.08, 120); },
    stopp() { piep(110, 0.06, 'square', 0.03); },
    geschafft() { piep(220, 0.5, 'sawtooth', 0.05, 440); [523, 659, 784].forEach((f, i) => setTimeout(() => piep(f, 0.2, 'triangle', 0.09), 350 + i * 110)); }
  };
})();

// ---------- Zustand ----------
let zustand = 'titel';       // titel | laedt | spiel | fertig | ende | level | rang | regeln | bereit
let modus = null;            // 'level' | 'tag'
let teile = null, s = null, zuege = [], verlauf = [], min = 0, levelNr = 0;
let tagKey = null, runId = null, gastGrund = '', t0 = 0, endeCs = 0, letzteMeldung = null, letzteErgebnisse = null;
let zug = null;              // laufendes Ziehen: { k, start, lo, hi, x0, y0, off }
let anim = new Map();        // Fahrzeug -> { von, t0 } (gleitet nach dem Loslassen in die Zelle)
let auswahl = -1, ausfahrt = 0, zeichneNeu = true, herausforderung = null;

// ---------- Darstellung ----------
const cv = $('c'), cx = cv.getContext('2d');
let lay = { z: 40, ox: 0, oy: 0, dpr: 1, W: 0, H: 0 };
function gr() {
  const b = $('brett').getBoundingClientRect(), dpr = Math.min(2.5, window.devicePixelRatio || 1);
  cv.width = Math.round(b.width * dpr); cv.height = Math.round(b.height * dpr);
  // Breite: Feld + Rahmen (je 6 px) + Ausfahrt-Pfeil rechts (bis 0,32 Felder hinter dem Rahmen) muss ganz hineinpassen
  const z = Math.floor(Math.min((b.width - 20) / (N + 0.4), (b.height - 24) / N, 84));
  const gesamt = 6 + z * N + 6 + Math.ceil(z * 0.34);
  lay = { dpr, W: b.width, H: b.height, z, ox: Math.floor((b.width - gesamt) / 2) + 6, oy: Math.floor((b.height - z * N) / 2) };
  zeichneNeu = true;
}
addEventListener('resize', gr);

const FARBEN = ['#4f86c6', '#3fae6a', '#8d6bd1', '#c9a227', '#2fb3b3', '#c46a9e', '#6b8e23', '#d0783a', '#5c7ea8', '#9a6b3f', '#4aa3df', '#7c8a99', '#b85c5c'];
function bildFuer(k) {
  const t = teile[k];
  if (k === 0) return img['af-mischer'];
  const liste = (t.len === 2 ? ZWEI : DREI).filter((n) => img[n]);
  return liste.length ? img[liste[(t.id.charCodeAt(0) + t.fest) % liste.length]] : null;
}
// Position (in Zellen, darf gebrochen sein) eines Fahrzeugs gerade jetzt
function anzeigePos(k, jetzt) {
  if (zug && zug.k === k) return zug.start + zug.off;
  const a = anim.get(k);
  if (a) { const p = (jetzt - a.t0) / 110; if (p >= 1) anim.delete(k); else return a.von + (s.pos[k] - a.von) * (1 - (1 - p) * (1 - p)); }
  return s.pos[k];
}
function zeichne(jetzt) {
  const { dpr, z, ox, oy } = lay;
  cx.setTransform(dpr, 0, 0, dpr, 0, 0); cx.clearRect(0, 0, lay.W, lay.H);
  if (!teile) return;
  // Platz mit Zaun; Lücke in der Ausfahrtzeile rechts
  cx.fillStyle = 'rgba(10,11,16,.78)'; rund(ox - 8, oy - 8, z * N + 16, z * N + 16, 14); cx.fill();
  for (let i = 0; i < N * N; i++) { const x = ox + (i % N) * z, y = oy + Math.floor(i / N) * z; cx.fillStyle = (i + Math.floor(i / N)) % 2 ? '#1c1e2b' : '#1f2130'; rund(x + 1, y + 1, z - 2, z - 2, 5); cx.fill(); }
  cx.strokeStyle = '#FFD21C'; cx.lineWidth = 4; cx.setLineDash([z * 0.22, z * 0.14]);
  const ay = oy + AUSFAHRT_ZEILE * z, ex = ox + N * z + 6;
  cx.beginPath(); cx.moveTo(ox - 6, oy - 6); cx.lineTo(ex, oy - 6); cx.lineTo(ex, ay); cx.moveTo(ex, ay + z); cx.lineTo(ex, oy + N * z + 6); cx.lineTo(ox - 6, oy + N * z + 6); cx.stroke();
  cx.beginPath(); cx.moveTo(ox - 6, oy - 6); cx.lineTo(ox - 6, oy + N * z + 6); cx.stroke(); cx.setLineDash([]);
  // Ausfahrt-Pfeil
  cx.fillStyle = 'rgba(255,210,28,' + (WENIG_BEWEGUNG ? 0.9 : 0.55 + 0.35 * Math.sin(jetzt / 300)) + ')';
  const px = ex + z * 0.12, py = ay + z / 2; cx.beginPath(); cx.moveTo(px, py - z * 0.18); cx.lineTo(px + z * 0.2, py); cx.lineTo(px, py + z * 0.18); cx.closePath(); cx.fill();
  // Fahrzeuge
  for (let k = teile.length - 1; k >= 0; k--) {
    const t = teile[k]; let p = anzeigePos(k, jetzt);
    if (k === 0 && ausfahrt) p += ausfahrt;
    const x = t.waag ? ox + p * z : ox + t.fest * z, y = t.waag ? oy + t.fest * z : oy + p * z;
    const w = t.waag ? t.len * z : z, h = t.waag ? z : t.len * z;
    const b = bildFuer(k), ziehen = zug && zug.k === k;
    cx.save();
    if (ziehen) { cx.shadowColor = 'rgba(0,0,0,.6)'; cx.shadowBlur = 14; cx.shadowOffsetY = 4; }
    if (b) {
      cx.translate(x + w / 2, y + h / 2); if (!t.waag) cx.rotate(Math.PI / 2);
      const L = t.len * z - z * 0.1, B = z * 0.86; cx.drawImage(b, -L / 2, -B / 2, L, B);
    } else {
      cx.fillStyle = k === 0 ? '#FF9200' : FARBEN[(k - 1) % FARBEN.length];
      rund(x + z * 0.07, y + z * 0.07, w - z * 0.14, h - z * 0.14, z * 0.16); cx.fill();
      cx.fillStyle = 'rgba(255,255,255,.22)'; rund(x + z * 0.16, y + z * 0.16, (t.waag ? w * 0.3 : w - z * 0.32), (t.waag ? h - z * 0.32 : h * 0.3), z * 0.08); cx.fill();
      if (k === 0) { cx.fillStyle = '#11121A'; cx.font = '700 ' + Math.round(z * 0.36) + 'px "Barlow Condensed",sans-serif'; cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.fillText('MISCHER', x + w / 2, y + h / 2 + 1); }
    }
    cx.restore();
    if (k === auswahl && zustand === 'spiel') { cx.strokeStyle = '#FFD21C'; cx.lineWidth = 3; rund(x + 3, y + 3, w - 6, h - 6, z * 0.16); cx.stroke(); }
  }
}
function rund(x, y, w, h, rr) { cx.beginPath(); if (cx.roundRect) cx.roundRect(x, y, w, h, rr); else cx.rect(x, y, w, h); }

// ---------- HUD ----------
const laufCs = () => (zustand === 'spiel' ? Math.floor((Date.now() - t0) / 10) : endeCs);
function hud() {
  $('hZug').textContent = s ? String(s.zuege) : '0'; $('hIdeal').textContent = teile ? String(min) : '0';
  $('hZuege').classList.toggle('ideal', !!(s && s.geloest && s.zuege <= min));
  $('bZurueck').disabled = !s || !verlauf.length || zustand !== 'spiel';
  $('bNeu').hidden = modus !== 'level'; $('bNeu').disabled = !s || !s.zuege || zustand !== 'spiel';
}
function hinweis(text, fett) { const e = $('hinweis'); e.textContent = text || ''; if (fett) { const b = document.createElement('b'); b.textContent = fett; e.appendChild(b); } }
function standardHinweis() {
  if (!teile) return hinweis('');
  if (modus === 'level') {
    if (herausforderung && herausforderung.l === levelNr) return hinweis('Herausforderung: höchstens ', herausforderung.z + ' Züge, schneller als ' + zeitText(herausforderung.t));
    return hinweis('Fahrzeug festhalten und ziehen · Ideal: ', min + ' Züge');
  }
  if (runId) return hinweis('Tagesrätsel ' + tagText(tagKey) + ' · die Uhr läuft · ', 'erster Versuch zählt');
  return hinweis('Tagesrätsel ' + tagText(tagKey) + ' · ohne Konto nur auf diesem Gerät');
}

// ---------- Spiel starten ----------
function starte(text, minZuege, eingaben) {
  teile = lese(text); min = minZuege; s = neuesSpiel(teile); zuege = []; verlauf = []; anim.clear(); zug = null; auswahl = -1; ausfahrt = 0;
  gr();
  if (eingaben) for (const [k, p] of eingaben) { const von = s.pos[k]; if (fahre(teile, s, k, p)) { zuege.push([k, p]); verlauf.push([k, von]); } }
  zustand = 'spiel'; zeige(null); hud(); standardHinweis();
  if (s.geloest) geloest();
}
function gruppe(nr) { return nr <= 6 ? 'Einfahren' : nr <= 12 ? 'Rangieren' : nr <= 18 ? 'Stau' : nr <= 24 ? 'Feierabendverkehr' : 'Meister'; }
function starteLevel(nr) {
  ton.start(); modus = 'level'; levelNr = nr; runId = null; tagKey = null;
  $('titelzeile').textContent = 'Level ' + nr + ' · ' + gruppe(nr);
  t0 = Date.now(); starte(LEVEL[nr - 1][0], LEVEL[nr - 1][1]);
}

// ---------- Tagesrätsel: Server ----------
const angemeldet = () => { const p = PS(); return !!(p && p.hatSitzung && p.hatSitzung() && p.token && p.token()); };
async function besorgeTag() {
  const p = PS(); if (!p || !p.online || !p.rpc) return { ok: false, grund: 'offline' };
  gastGrund = '';
  if (angemeldet()) {
    const r1 = await p.rpc('ausfahrt_start', {});
    const d = r1 && !r1.fehler ? r1.daten : null;
    if (d && d.ok) return pruefeInfo(d, d.run_id);
    if (d && d.grund === 'schon_geloest') return { ok: false, grund: 'schon_geloest', ergebnis: d };
    if (d && d.grund === 'zu_oft') return { ok: false, grund: 'zu_oft' };
    if (d && d.grund === 'kein_profil') gastGrund = 'kein_profil';
    else if (r1 && r1.status === 401) gastGrund = 'abgelaufen';
    else return { ok: false, grund: 'netz' };
  }
  const r2 = await p.rpc('ausfahrt_tag', {});
  if (!r2 || r2.fehler || !r2.daten || !r2.daten.seed) return { ok: false, grund: 'netz' };
  return pruefeInfo(r2.daten, null);
}
function pruefeInfo(d, run) {
  if (!POOLS[d.version] || !Number.isInteger(d.seed) || !/^\d{8}$/.test(String(d.tag))) return { ok: false, grund: 'version' };
  return { ok: true, seed: d.seed, version: d.version, tag: String(d.tag), runId: run || null, sek: Number(d.sek) || 0 };
}
const FEHLERTEXT = {
  offline: 'Das Tagesrätsel braucht eine Verbindung zum Server. Die Level gehen auch offline.',
  netz: 'Der Server ist gerade nicht erreichbar. Die Level gehen trotzdem.',
  zu_oft: 'Zu viele Versuche in kurzer Zeit. Gleich noch einmal.',
  version: 'Das heutige Rätsel braucht eine neuere Version des Spiels. Seite neu laden.'
};
function bereit() {
  zustand = 'bereit'; zeige('sBereit'); $('bStatus').textContent = ''; $('bStatus').className = 'status';
  const t = heuteLokal(); $('bTagText').textContent = tagText(t);
  const offen = store.offen && store.offen.tag === String(t) && store.offen.run;
  $('bText').textContent = angemeldet()
    ? (offen ? 'Du hast das heutige Rätsel schon angefangen. Die Uhr läuft seitdem weiter – weiter geht es da, wo du aufgehört hast.'
      : 'Mit deinem Konto zählt nur dein erster Versuch. Die Uhr startet beim Tippen auf „Los“ und läuft weiter, auch wenn du die Seite schließt.')
    : 'Ohne Konto bleibt dein Ergebnis auf diesem Gerät. Mit PlaySaal-Konto kommst du in die Tagesrangliste.';
  $('bLos').textContent = offen ? 'Weiterspielen' : 'Los – Uhr starten';
}
async function starteTag() {
  if (zustand === 'laedt') return;
  ton.start(); zustand = 'laedt'; $('bLos').disabled = true; $('bStatus').textContent = 'Rätsel wird geholt …'; $('bStatus').className = 'status';
  const info = await besorgeTag();
  $('bLos').disabled = false;
  if (!info.ok) {
    zustand = 'bereit';
    if (info.grund === 'schon_geloest') { zeigeSchonGeloest(info.ergebnis); return; }
    $('bStatus').className = 'status fehler'; $('bStatus').textContent = FEHLERTEXT[info.grund] || FEHLERTEXT.netz; return;
  }
  modus = 'tag'; tagKey = info.tag; runId = info.runId; letzteMeldung = null;
  $('titelzeile').textContent = 'Tagesrätsel ' + tagText(tagKey);
  const pool = POOLS[info.version], eintrag = pool[tagesNummer(info.seed, pool)];
  const o = store.offen; let eingaben = null;
  if (o && o.tag === tagKey && o.seed === info.seed && o.version === info.version && (runId ? o.run === runId : !o.run)) eingaben = dekodiere(o.inputs, lese(eintrag[0]));
  if (runId) t0 = Date.now() - Math.round(info.sek * 1000);
  else t0 = eingaben && o.t0 ? o.t0 : Date.now();
  store.offen = { tag: tagKey, seed: info.seed, version: info.version, run: runId, inputs: eingaben ? o.inputs : '', t0 };
  speichern();
  starte(eintrag[0], eintrag[1], eingaben);
}
function zeigeSchonGeloest(e) {
  modus = 'tag'; tagKey = String(e.tag || heuteLokal()); teile = null; s = null; runId = null;
  zustand = 'ende'; zeige('sEnde');
  $('eKopf').textContent = 'Heute schon gelöst'; $('eKopf').className = '';
  $('eZeit').textContent = zeitGenau(e.zeit_cs || 0); $('eSterne').hidden = true;
  $('eModus').textContent = 'Tagesrätsel ' + tagText(tagKey) + ' · dein gewerteter Versuch';
  $('eZug').textContent = String(e.zuege || 0); $('ePar').textContent = '–'; $('eBestT').textContent = 'Platz';
  $('eBest').textContent = e.rang ? e.rang.platz + '/' + e.rang.spieler : '–';
  $('eStatus').className = 'status'; $('eStatus').textContent = 'Morgen gibt es ein neues Rätsel. Die Level kannst du jederzeit spielen.';
  $('bWeiter').hidden = true; $('bErneut').hidden = true; $('bAnmelden').hidden = true;
  letzteErgebnisse = { tag: tagKey, t: e.zeit_cs || 0, z: e.zuege || 0, min: null };
}

// ---------- Eingabe: Schieben ----------
function zugAusfuehren(k, p) {
  const von = s.pos[k];
  if (!fahre(teile, s, k, p)) return false;
  zuege.push([k, p]); verlauf.push([k, von]); ton.fahrt();
  if (modus === 'tag' && store.offen) { store.offen.inputs = kodiere(zuege, teile); speichern(); }
  hud(); standardHinweis();
  if (s.geloest) geloest();
  return true;
}
function zelleBei(e) {
  const b = cv.getBoundingClientRect();
  return { x: (e.clientX - b.left - lay.ox) / lay.z, y: (e.clientY - b.top - lay.oy) / lay.z };
}
cv.addEventListener('pointerdown', (e) => {
  e.preventDefault(); if (zustand !== 'spiel' || zug) return;
  const { x, y } = zelleBei(e); if (x < 0 || y < 0 || x >= N || y >= N) return;
  const g = raster(teile, s.pos), k = g[Math.floor(y) * N + Math.floor(x)]; if (k < 0) return;
  ton.start(); auswahl = k;
  const [lo, hi] = spielraum(teile, s.pos, g, k);
  zug = { k, start: s.pos[k], lo, hi, x0: x, y0: y, off: 0 };
  try { cv.setPointerCapture(e.pointerId); } catch (err) {}
});
cv.addEventListener('pointermove', (e) => {
  if (!zug) return;
  const { x, y } = zelleBei(e), t = teile[zug.k];
  zug.off = Math.max(zug.lo - zug.start, Math.min(zug.hi - zug.start, t.waag ? x - zug.x0 : y - zug.y0));
});
function loslassen() {
  if (!zug) return;
  const { k, start, off } = zug, ziel = Math.round(start + off);
  zug = null;
  anim.set(k, { von: start + off, t0: performance.now() });
  if (ziel !== start) zugAusfuehren(k, ziel); else if (Math.abs(off) > 0.05) ton.stopp();
}
cv.addEventListener('pointerup', loslassen);
cv.addEventListener('pointercancel', loslassen);
addEventListener('keydown', (e) => {
  if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
  if (zustand !== 'spiel' || !teile) return;
  const k = e.key;
  if (k === 'Tab') { e.preventDefault(); auswahl = ((auswahl < 0 ? -1 : auswahl) + (e.shiftKey ? teile.length - 1 : 1)) % teile.length; return; }
  const r = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[k];
  if (r === undefined) return;
  e.preventDefault(); if (auswahl < 0) auswahl = 0;
  const t = teile[auswahl], passt = t.waag ? (k === 'ArrowLeft' || k === 'ArrowRight') : (k === 'ArrowUp' || k === 'ArrowDown');
  if (!passt) return;
  const von = s.pos[auswahl];
  if (zugAusfuehren(auswahl, von + r)) anim.set(auswahl, { von, t0: performance.now() });
});
$('bZurueck').addEventListener('click', () => {
  if (zustand !== 'spiel' || !verlauf.length) return;
  const [k, p] = verlauf[verlauf.length - 1], von = s.pos[k];
  if (zugAusfuehren(k, p)) { verlauf.pop(); verlauf.pop(); anim.set(k, { von, t0: performance.now() }); hud(); }
});
$('bNeu').addEventListener('click', () => { if (modus === 'level' && zustand === 'spiel') starteLevel(levelNr); });

// ---------- Gelöst ----------
function geloest() {
  endeCs = Math.floor((Date.now() - t0) / 10); zustand = 'fertig'; ton.geschafft(); hud(); auswahl = -1;
  hinweis('Ausfahrt frei! ', s.zuege + (s.zuege === 1 ? ' Zug' : ' Züge'));
  const t1 = performance.now();
  const fahrRaus = (jetzt) => { ausfahrt = WENIG_BEWEGUNG ? 0 : Math.min(4, ((jetzt - t1) / 700) ** 2 * 4); zeichneNeu = true; if (zustand === 'fertig' && ausfahrt < 4) requestAnimationFrame(fahrRaus); };
  requestAnimationFrame(fahrRaus);
  setTimeout(ergebnis, WENIG_BEWEGUNG ? 200 : 1200);
}
function ergebnis() {
  zustand = 'ende'; zeige('sEnde');
  const z = s.zuege, t = endeCs;
  $('eZeit').textContent = zeitGenau(t); $('eZug').textContent = String(z); $('ePar').textContent = String(min);
  for (const id of ['bErneut', 'bAnmelden']) $(id).hidden = true;
  const st = $('eStatus'); st.className = 'status'; st.textContent = '';
  const kopf = $('eKopf'); kopf.className = '';
  letzteErgebnisse = { tag: tagKey, t, z, min, level: modus === 'level' ? levelNr : null };
  if (modus === 'level') {
    const stern = sterneFuer(z, min), alt = store.best[levelNr];
    const besser = !alt || stern > alt.s || (stern === alt.s && (z < alt.z || (z === alt.z && t < alt.t)));
    store.best[levelNr] = alt ? { z: Math.min(alt.z, z), t: Math.min(alt.t, t), s: Math.max(alt.s, stern) } : { z, t, s: stern };
    if (levelNr >= store.frei && levelNr < LEVEL.length) store.frei = levelNr + 1;
    speichern();
    const se = $('eSterne'); se.hidden = false; se.textContent = '';
    for (let i = 1; i <= 3; i++) { const sp = document.createElement('span'); sp.textContent = '★'; if (i <= stern) sp.className = 'an'; se.appendChild(sp); }
    kopf.textContent = levelNr === LEVEL.length ? 'Alle Level geschafft!' : besser && alt ? 'Neuer Rekord!' : 'Ausfahrt frei!'; if (besser && alt) kopf.className = 'rek';
    $('eModus').textContent = 'Level ' + levelNr + ' · ' + gruppe(levelNr) + (z <= min ? ' · ideal gelöst' : '');
    $('eBestT').textContent = 'Bestzeit'; $('eBest').textContent = zeitText(store.best[levelNr].t);
    $('bWeiter').hidden = false; $('bWeiter').textContent = levelNr < LEVEL.length ? 'Nächstes Level' : 'Levelübersicht';
    if (herausforderung && herausforderung.l === levelNr) {
      const geschafft = z <= herausforderung.z && t < herausforderung.t;
      st.className = 'status' + (geschafft ? ' ok' : ''); st.textContent = geschafft ? 'Herausforderung geschafft!' : 'Herausforderung: ' + herausforderung.z + ' Züge in ' + zeitText(herausforderung.t) + '. Noch einmal?';
    }
    return;
  }
  $('eSterne').hidden = true; $('bWeiter').hidden = false; $('bWeiter').textContent = 'Level spielen';
  $('eModus').textContent = 'Tagesrätsel ' + tagText(tagKey) + (z <= min ? ' · ideal gelöst' : '');
  const vor = store.tage[tagKey];
  if (!vor || z < vor.z || (z === vor.z && t < vor.t)) store.tage[tagKey] = { z, t };
  store.offen = null; speichern();
  $('eBestT').textContent = 'Heute best'; $('eBest').textContent = store.tage[tagKey].z + ' Z.';
  kopf.textContent = 'Ausfahrt frei!';
  if (runId) { letzteMeldung = { run_id: runId, inputs: kodiere(zuege, teile), zuege: z }; sende(); }
  else {
    st.textContent = gastGrund === 'kein_profil' ? 'Ohne Spielernamen zählt das Rätsel nur auf diesem Gerät. Lege im Konto einen Namen an.' : gastGrund === 'abgelaufen' ? 'Deine Anmeldung ist abgelaufen. Melde dich neu an, um morgen in die Rangliste zu kommen.' : 'Nur auf diesem Gerät gespeichert. Mit PlaySaal-Konto kommst du in die Tagesrangliste.';
    $('bAnmelden').hidden = false; $('bAnmelden').textContent = gastGrund === 'kein_profil' ? 'Namen anlegen' : 'Anmelden';
  }
}
async function sende() {
  const st = $('eStatus'); st.className = 'status'; st.textContent = 'Wird vom Server geprüft …'; $('bErneut').hidden = true;
  const m = letzteMeldung, e = await melden(m);
  if (m !== letzteMeldung) return;
  if (e.status === 'verifiziert') {
    runId = null; letzteMeldung = null;
    if (Number.isInteger(e.zeit_cs)) { $('eZeit').textContent = zeitGenau(e.zeit_cs); letzteErgebnisse.t = e.zeit_cs; store.tage[tagKey] = { z: m.zuege, t: e.zeit_cs }; speichern(); }
    const g = e.rang; let t = '✓ Vom Server geprüft und gewertet.';
    if (g) {
      t += ' Heute Platz ' + g.platz + ' von ' + g.spieler + '.';
      if (g.naechster_platz) t += g.luecke_zuege > 0 ? ' ' + g.luecke_zuege + (g.luecke_zuege === 1 ? ' Zug' : ' Züge') + ' weniger für Platz ' + g.naechster_platz + '.' : ' ' + zeitKurz(g.luecke_cs) + ' schneller für Platz ' + g.naechster_platz + '.';
      else if (g.platz === 1) t += ' Du führst.';
    }
    st.className = 'status ok'; st.textContent = t; if (g) hinweis('Heute: Platz ', g.platz + ' von ' + g.spieler);
  } else if (e.status === 'abgelehnt') {
    runId = null; letzteMeldung = null; st.className = 'status fehler';
    st.textContent = e.grund === 'abgelaufen' ? 'Das Rätsel war zu lange offen und wird nicht gewertet.' : e.grund === 'schon_abgeschlossen' ? 'Dieser Versuch wurde schon gewertet.' : 'Der Server hat dieses Ergebnis nicht bestätigt. Es steht nicht in der Rangliste.';
  } else { st.className = 'status fehler'; st.textContent = 'Der Server ist gerade nicht erreichbar. Das Ergebnis ist noch nicht gewertet.'; $('bErneut').hidden = false; }
}
async function melden(m) {
  const p = PS(); if (!p || !angemeldet()) return { status: 'fehler' };
  const ctl = typeof AbortController === 'function' ? new AbortController() : null, t = setTimeout(() => ctl && ctl.abort(), 15000);
  try {
    const res = await fetch(CFG().url + '/functions/v1/ausfahrt-lauf', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + p.token(), apikey: CFG().key || '' }, body: JSON.stringify(m), signal: ctl ? ctl.signal : undefined });
    const j = await res.json().catch(() => ({}));
    if (res.ok && j.verifiziert) return { status: 'verifiziert', rang: j.rang || null, zeit_cs: j.zeit_cs };
    if (res.ok) return { status: 'abgelehnt', grund: j.grund || '' };
    return { status: 'fehler' };
  } catch (e) { return { status: 'fehler' }; } finally { clearTimeout(t); }
}

// ---------- Teilen ----------
$('bTeilen').addEventListener('click', async () => {
  const b = $('bTeilen'), e = letzteErgebnisse; if (!e) return;
  let url = location.origin + location.pathname.replace(/\/$/, ''), text;
  if (e.level) {
    const st = sterneFuer(e.z, e.min);
    text = 'Ausfahrt frei Level ' + e.level + ': ' + '★'.repeat(st) + '☆'.repeat(3 - st) + ' mit ' + e.z + ' Zügen in ' + zeitText(e.t) + '. Schaffst du es besser?';
    url += '?l=' + e.level + '&z=' + e.z + '&t=' + e.t;
  } else text = '🚛 Ausfahrt frei · Tagesrätsel ' + tagText(e.tag) + '\n🔁 ' + e.z + ' Züge' + (e.min ? ' (ideal ' + e.min + ')' : '') + ' · ⏱ ' + zeitText(e.t) + '\nSchaffst du es mit weniger?';
  const fertig = (msg) => { b.textContent = msg; setTimeout(() => { b.textContent = 'Teilen'; }, 2500); };
  b.textContent = 'Teilen …';
  try { if (navigator.share) { await navigator.share({ title: 'Ausfahrt frei', text, url }); b.textContent = 'Teilen'; return; } } catch (err) { if (err && err.name === 'AbortError') { b.textContent = 'Teilen'; return; } }
  try { await navigator.clipboard.writeText(text + '\n' + url); fertig('Kopiert ✓'); } catch (err) { fertig(url); }
});

// ---------- Menüs ----------
function zeige(id) { for (const x of ['sTitel', 'sBereit', 'sLevel', 'sEnde', 'sRang', 'sRegeln']) $(x).hidden = x !== id; }
function titel() {
  zustand = 'titel'; zeige('sTitel'); $('tStatus').textContent = ''; $('tStatus').className = 'status';
  const t = heuteLokal(); $('tTag').textContent = tagText(t);
  const heute = store.tage[t], gel = Object.keys(store.best).length;
  $('tInfo').textContent = (heute ? 'Heute: ' + heute.z + ' Züge · ' : '') + gel + ' von ' + LEVEL.length + ' Level gelöst';
  $('bTag').firstChild.textContent = store.offen && store.offen.tag === String(t) ? 'Tagesrätsel fortsetzen ' : 'Tagesrätsel ';
  teile = null; s = null; zug = null; $('titelzeile').textContent = ''; hinweis(''); hud(); zeichneNeu = true;
}
function levelMenue() {
  zustand = 'level'; zeige('sLevel');
  const g = $('lGitter'); g.textContent = '';
  const gruppen = [[1, 'Einfahren'], [7, 'Rangieren'], [13, 'Stau'], [19, 'Feierabendverkehr'], [25, 'Meister']];
  let sterne = 0;
  for (let nr = 1; nr <= LEVEL.length; nr++) {
    const gr0 = gruppen.find((x) => x[0] === nr); if (gr0) { const h = document.createElement('div'); h.className = 'grp'; h.textContent = gr0[1]; g.appendChild(h); }
    const b = document.createElement('button'); b.type = 'button'; const best = store.best[nr];
    b.textContent = String(nr); const sm = document.createElement('small'); sm.textContent = best ? '★'.repeat(best.s) : ''; b.appendChild(sm);
    if (best) sterne += best.s;
    if (nr > store.frei) b.disabled = true; else if (!best) b.className = 'neu';
    b.setAttribute('aria-label', 'Level ' + nr + (best ? ', ' + best.s + ' Sterne' : nr > store.frei ? ', gesperrt' : ''));
    b.addEventListener('click', () => starteLevel(nr)); g.appendChild(b);
  }
  $('lInfo').textContent = sterne + ' von ' + LEVEL.length * 3 + ' Sternen';
}
function heuteLokal() {
  try { const p = new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()); const g = (t) => p.find((x) => x.type === t).value; return Number(g('year') + g('month') + g('day')); }
  catch (e) { const d = new Date(); return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate(); }
}
$('bTag').addEventListener('click', bereit);
$('bLos').addEventListener('click', starteTag);
$('bBereitZu').addEventListener('click', titel);
$('bLevel').addEventListener('click', levelMenue);
$('bLevelZu').addEventListener('click', titel);
$('bRegeln').addEventListener('click', () => { zustand = 'regeln'; zeige('sRegeln'); });
$('bRegelnZu').addEventListener('click', titel);
$('bMenue').addEventListener('click', titel);
$('bWeiter').addEventListener('click', () => { if (modus === 'level' && levelNr < LEVEL.length) starteLevel(levelNr + 1); else levelMenue(); });
$('bErneut').addEventListener('click', () => { if (letzteMeldung) sende(); });
$('bAnmelden').addEventListener('click', () => { const p = PS(); if (!p) return; if (gastGrund === 'kein_profil' && p.profilBearbeiten) p.profilBearbeiten(); else if (p.anmelden) p.anmelden({}); });
function tonKnopf() { $('bTon').setAttribute('aria-pressed', String(store.sound)); $('bTon').setAttribute('aria-label', store.sound ? 'Ton ausschalten' : 'Ton einschalten'); }
$('bTon').addEventListener('click', () => { store.sound = !store.sound; speichern(); tonKnopf(); ton.start(); });

// ---------- Rangliste ----------
let rTage = [], rTag = null, rHeute = null, rVon = 'titel';
for (const id of ['bRang', 'bRang2']) $(id).addEventListener('click', () => oeffneRang(null));
$('bRangZu').addEventListener('click', () => (rVon === 'ende' ? (zustand = 'ende', zeige('sEnde')) : titel()));
$('rZurueck').addEventListener('click', () => blaettere(1));
$('rVor').addEventListener('click', () => blaettere(-1));
function blaettere(d) { const i = rTage.indexOf(rTag) + d; if (i >= 0 && i < rTage.length) ladeRang(rTage[i]); }
async function oeffneRang(tag) {
  rVon = zustand === 'ende' ? 'ende' : 'titel'; zustand = 'rang'; zeige('sRang');
  await ladeRang(tag);
  const p = PS();
  if (p && p.rpc && rHeute) {
    const x = await p.rpc('ausfahrt_tage_liste', { p_anzahl: 60 });
    const alle = new Set([rHeute]); if (x && !x.fehler && Array.isArray(x.daten)) for (const t of x.daten) if (/^\d{8}$/.test(t)) alle.add(t);
    rTage = [...alle].sort().reverse(); knoepfe();
  }
}
function knoepfe() { const i = rTage.indexOf(rTag); $('rZurueck').disabled = i < 0 || i >= rTage.length - 1; $('rVor').disabled = i <= 0; }
async function ladeRang(tag) {
  const liste = $('rListe'), p = PS();
  liste.textContent = 'Lädt …'; $('rTag').textContent = tag ? tagText(tag) : 'Heute';
  if (!p || !p.online || !p.rpc) { liste.textContent = 'Die Rangliste ist gerade nicht verfügbar.'; return; }
  const gewuenscht = tag; rTag = tag;
  const res = await p.rpc('ausfahrt_rangliste', { p_tag: tag, p_anzahl: 10 });
  if (rTag !== gewuenscht) return;
  if (!res || res.fehler || !res.daten) { liste.textContent = 'Rangliste gerade nicht erreichbar.'; return; }
  const d = res.daten; rTag = d.tag; if (!tag) { rHeute = d.tag; if (!rTage.includes(d.tag)) rTage = [d.tag, ...rTage]; }
  $('rTag').textContent = d.tag === rHeute ? 'Heute · ' + tagText(d.tag) : tagVoll(d.tag); knoepfe();
  liste.textContent = '';
  if (!d.zeilen.length) { liste.textContent = d.tag === rHeute ? 'Heute noch kein Eintrag. Sei der Erste!' : 'An diesem Tag gab es keine Einträge.'; return; }
  const av = p.avatare || []; let vorPos = 0;
  for (const z of d.zeilen) {
    if (vorPos && z.pos > vorPos + 1) { const g = document.createElement('li'); g.className = 'luecke'; g.textContent = '…'; liste.appendChild(g); }
    vorPos = z.pos;
    const li = document.createElement('li'); if (z.ich) li.className = 'ich';
    const emo = av[(parseInt(String(z.avatar || 'a1').slice(1), 10) || 1) - 1] || '🙂';
    const a = document.createElement('span'); a.className = 'pl'; a.textContent = String(z.platz);
    const b = document.createElement('span'); b.className = 'av'; b.textContent = emo;
    const c = document.createElement('span'); c.className = 'nm'; c.textContent = z.name + (z.ich ? ' (du)' : '');
    const zt = document.createElement('i'); zt.textContent = zeitText(z.zeit_cs);
    const e = document.createElement('b'); e.textContent = z.zuege + ' Z.';
    li.append(a, b, c, zt, e); liste.appendChild(li);
  }
  $('rHinweis').textContent = 'Erster Versuch je Konto. Wenigste Züge vorn, bei Gleichstand die schnellere Zeit.';
}

// ---------- Schleife ----------
let letzteSek = -1;
function frame(jetzt) {
  requestAnimationFrame(frame);
  if (zustand === 'spiel' || zustand === 'fertig') { const cs = laufCs(), sek = Math.floor(cs / 100); if (sek !== letzteSek) { letzteSek = sek; $('hZeit').textContent = zeitText(cs); } }
  if (teile && (zug || anim.size || zeichneNeu || zustand === 'spiel' || zustand === 'fertig')) { zeichne(jetzt); zeichneNeu = false; }
  else if (!teile && zeichneNeu) { zeichne(jetzt); zeichneNeu = false; }
}

// ---------- Start ----------
laden(); tonKnopf(); gr(); titel();
(() => {   // Herausforderungs-Link: ?l=Level&z=Züge&t=Hundertstel
  const q = new URLSearchParams(location.search), l = Number(q.get('l')), z = Number(q.get('z')), t = Number(q.get('t'));
  if (Number.isInteger(l) && l >= 1 && l <= LEVEL.length && Number.isInteger(z) && z > 0 && z < 10000 && Number.isInteger(t) && t > 0 && t < 1e7) { herausforderung = { l, z, t }; starteLevel(l); }
})();
requestAnimationFrame(frame);
window.__af = {
  get zustand() { return zustand; }, get teile() { return teile; }, get spiel() { return s; }, get zuege() { return zuege; }, get runId() { return runId; },
  get modus() { return modus; }, get lay() { return lay; }, store: () => store, zugAusfuehren, starteLevel, get platzhalter() { return bilderFehlen; }, VERSION
};
