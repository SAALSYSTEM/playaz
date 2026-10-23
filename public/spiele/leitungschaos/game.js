// LEITUNGSCHAOS: Darstellung, Bedienung, Ton, Speicherstand, Levelmodus, Tagesrätsel und Rangliste.
// Regeln und Rätselbau stehen in sim.js (dieselbe Datei prüft auf dem Server jeden Lösungsweg nach).
// Die Rohre werden im Code gezeichnet; Bilder (Hintergrund, Hydrant, Häuser) kommen aus img/.
// Fehlt ein Bild, zeichnet das Spiel einen Platzhalter.
import { VERSION, KONFIG, LEVEL, DX, DY, RICHTUNGEN, form, periode, fluss, neuesSpiel, tippe, kodiere, dekodiere, tagesRaetsel, levelRaetsel } from './sim.js';

const $ = (id) => document.getElementById(id);
const CFG = () => window.PLAYSAAL_CFG || {};
const PS = () => window.PlaySaal || null;
const KEY = 'leitungschaos.v1';
const WENIG_BEWEGUNG = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
const DREH_MS = 130;

// ---------- Speicherstand (nur dieses Gerät; mit Konto wird er wie bei allen Spielen synchronisiert) ----------
// frei: höchstes freigeschaltetes Level; best[nr] = { d: Drehungen, z: Hundertstel, s: Sterne }
// tage[JJJJMMTT] = { z, d } bestes Ergebnis des Tages; offen = angefangenes Tagesrätsel (Fortsetzen nach Neuladen)
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
      if (nr >= 1 && nr <= LEVEL.length && b && typeof b === 'object') store.best[nr] = { d: ganz(b.d, 99999), z: ganz(b.z, 1e8), s: ganz(b.s, 3) };
    }
    if (d.tage && typeof d.tage === 'object') for (const k of Object.keys(d.tage).slice(-60)) {
      const t = d.tage[k]; if (/^\d{8}$/.test(k) && t && typeof t === 'object') store.tage[k] = { z: ganz(t.z, 1e8), d: ganz(t.d, 99999) };
    }
    const o = d.offen;
    if (o && typeof o === 'object' && /^\d{8}$/.test(String(o.tag)) && Number.isInteger(o.seed) && Number.isInteger(o.version) && typeof o.inputs === 'string')
      store.offen = { tag: String(o.tag), seed: o.seed, version: o.version, inputs: o.inputs.slice(0, 3000), run: typeof o.run === 'string' ? o.run : null, t0: Number(o.t0) || 0 };
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
const sterneFuer = (d, par) => (d <= par ? 3 : d * 2 <= par * 3 ? 2 : 1);

// ---------- Bilder ----------
// Pflicht: Hintergrund, Hydrant, Haus a. Weitere Häuser (b, c) sind optional und kommen nur dazu, wenn es die Datei gibt.
const IMAGES = ['lc-hintergrund', 'lc-hydrant', 'lc-haus-a', 'lc-haus-a-licht'];
const OPTIONAL = ['lc-haus-b', 'lc-haus-b-licht', 'lc-haus-c', 'lc-haus-c-licht'];
const img = {}; let bilderFehlen = false;
for (const n of [...IMAGES, ...OPTIONAL]) {
  const b = new Image(); b.decoding = 'async';
  b.onload = () => { img[n] = b; if (n === 'lc-hintergrund') { document.body.classList.add('bild'); document.body.style.backgroundImage = 'url(leitungschaos/img/' + n + '.webp)'; } zeichneNeu = true; };
  b.onerror = () => { if (OPTIONAL.includes(n)) return; bilderFehlen = true; $('platzhalter').hidden = false; zeichneNeu = true; };
  b.src = 'leitungschaos/img/' + n + '.webp';
}

// ---------- Ton (WebAudio, kurze synthetische Klänge) ----------
const ton = (() => {
  let ac = null;
  const an = () => store.sound && ac;
  const piep = (f, d, typ = 'sine', vol = 0.12, gleit = 0) => {
    if (!an()) return; const t = ac.currentTime, o = ac.createOscillator(), g = ac.createGain();
    o.type = typ; o.frequency.setValueAtTime(f, t); if (gleit) o.frequency.exponentialRampToValueAtTime(gleit, t + d);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d); o.connect(g).connect(ac.destination); o.start(t); o.stop(t + d + 0.02);
  };
  return {
    start() { try { if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)(); if (ac.state === 'suspended') ac.resume(); } catch (e) {} },
    dreh() { piep(520, 0.05, 'square', 0.04, 300); },
    nass(n) { piep(260 + Math.min(6, n) * 40, 0.12, 'sine', 0.08, 520); },
    fest() { piep(140, 0.08, 'triangle', 0.08); },
    geschafft() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => piep(f, 0.22, 'triangle', 0.1), i * 110)); }
  };
})();

// ---------- Zustand ----------
let zustand = 'titel';       // titel | laedt | spiel | fertig | ende | level | rang | regeln | bereit
let modus = null;            // 'level' | 'tag'
let r = null, s = null, tipps = [], nass = null, lecks = [], levelNr = 0;
let tagKey = null, runId = null, seedInfo = null, gastGrund = '', t0 = 0, endeCs = 0, letzteMeldung = null;
let anim = new Map();        // Feld -> Startzeit der Drehanimation
let welle = new Map();       // Feld -> Zeit, ab der es nass ist (Füllanimation)
let spritzer = [], cursor = -1, herausforderung = null, zeichneNeu = true;

// ---------- Darstellung ----------
const cv = $('c'), cx = cv.getContext('2d');
let lay = { z: 40, ox: 0, oy: 0, dpr: 1, W: 0, H: 0 };
function gr() {
  const b = $('brett').getBoundingClientRect(), dpr = Math.min(2.5, window.devicePixelRatio || 1);
  cv.width = Math.round(b.width * dpr); cv.height = Math.round(b.height * dpr);
  lay = { ...lay, dpr, W: b.width, H: b.height };
  if (r) {
    const z = Math.floor(Math.min((b.width - 8) / r.w, (b.height - 8) / r.h, 92));
    lay.z = z; lay.ox = Math.floor((b.width - z * r.w) / 2); lay.oy = Math.floor((b.height - z * r.h) / 2);
    if (s) berechneFluss(null);
  }
  zeichneNeu = true;
}
addEventListener('resize', gr);

const STAHL = '#8f96ac', STAHL_DUNKEL = '#4a4f63', STAHL_HELL = '#c9cedd', WASSER = '#3DB7FF', WASSER_HELL = '#a8e2ff';
function hausVariante(i) {
  const da = ['a', 'b', 'c'].filter((v) => img['lc-haus-' + v]);
  const alle = da.length ? da : ['a', 'b', 'c'];   // ohne Bilder: drei Platzhalter-Farben
  return alle[(i * 7 + r.w) % alle.length];
}

function zeichneArme(m, z, nassFeld, jetzt, i) {
  const h = z / 2, br = Math.max(6, z * 0.26), innen = br * 0.52;
  const arme = []; for (const d of RICHTUNGEN) if (m & d) arme.push(d);
  // Außenrohr
  cx.lineCap = 'butt';
  for (const pass of [0, 1, 2]) {
    cx.strokeStyle = pass === 0 ? STAHL_DUNKEL : pass === 1 ? STAHL : (nassFeld ? WASSER : '#2b2e3d');
    cx.lineWidth = pass === 0 ? br + 4 : pass === 1 ? br : innen;
    cx.beginPath();
    for (const d of arme) { cx.moveTo(0, 0); cx.lineTo(DX[d] * h, DY[d] * h); }
    cx.stroke();
    cx.fillStyle = cx.strokeStyle; cx.beginPath(); cx.arc(0, 0, (pass === 0 ? br + 4 : pass === 1 ? br : innen) / 2, 0, Math.PI * 2); cx.fill();
  }
  // Glanzlinie auf dem Stahl
  cx.strokeStyle = 'rgba(255,255,255,.18)'; cx.lineWidth = Math.max(1, br * 0.1);
  cx.beginPath(); for (const d of arme) { const nx = -DY[d] * br * 0.32, ny = DX[d] * br * 0.32; cx.moveTo(nx, ny); cx.lineTo(DX[d] * h + nx, DY[d] * h + ny); } cx.stroke();
  // Fließendes Wasser (wandernde helle Punkte)
  if (nassFeld && !WENIG_BEWEGUNG) {
    cx.fillStyle = WASSER_HELL;
    const p = (jetzt / 600 + i * 0.37) % 1;
    for (const d of arme) { const t = (p + 0.5) % 1; cx.beginPath(); cx.arc(DX[d] * h * t, DY[d] * h * t, innen * 0.28, 0, Math.PI * 2); cx.fill(); }
  }
  // Muffen an den Rändern
  cx.fillStyle = STAHL_HELL;
  for (const d of arme) {
    const ex = DX[d] * (h - 2), ey = DY[d] * (h - 2), qx = DY[d] !== 0, len = br + 6, dick = Math.max(3, z * 0.06);
    cx.fillRect(qx ? ex - len / 2 : ex - dick / 2, qx ? ey - dick / 2 : ey - len / 2, qx ? len : dick, qx ? dick : len);
  }
}

function zeichneHydrant(z) {
  const b = img['lc-hydrant'], g = z * 0.7;
  if (b) { cx.drawImage(b, -g / 2, -g / 2, g, g); return; }
  cx.fillStyle = '#d8342a'; cx.beginPath(); cx.arc(0, 0, z * 0.26, 0, Math.PI * 2); cx.fill();
  cx.fillStyle = '#FFD21C'; cx.beginPath(); cx.arc(0, 0, z * 0.14, 0, Math.PI * 2); cx.fill();
  cx.fillStyle = '#7a1a14'; cx.beginPath(); cx.arc(0, 0, z * 0.06, 0, Math.PI * 2); cx.fill();
}
function zeichneHaus(i, z, an) {
  const v = hausVariante(i), b = (an && img['lc-haus-' + v + '-licht']) || img['lc-haus-' + v], g = z * 0.64;
  if (b) { cx.drawImage(b, -g / 2, -g / 2, g, g); return; }
  const dach = v === 'a' ? '#FF9200' : v === 'b' ? '#3fae6a' : '#9a6b3f';
  const s2 = z * 0.21;
  cx.fillStyle = '#e9e3d6'; cx.fillRect(-s2, -s2 * 0.2, s2 * 2, s2 * 1.3);
  cx.fillStyle = dach; cx.beginPath(); cx.moveTo(-s2 * 1.2, -s2 * 0.15); cx.lineTo(0, -s2 * 1.1); cx.lineTo(s2 * 1.2, -s2 * 0.15); cx.closePath(); cx.fill();
  cx.fillStyle = an ? '#FFD21C' : '#3a3d4f'; cx.fillRect(-s2 * 0.6, s2 * 0.15, s2 * 0.45, s2 * 0.45); cx.fillRect(s2 * 0.15, s2 * 0.15, s2 * 0.45, s2 * 0.45);
  if (an) { cx.fillStyle = WASSER; cx.beginPath(); cx.arc(0, -s2 * 1.35, s2 * 0.22, 0, Math.PI * 2); cx.fill(); }
}

function zeichne(jetzt) {
  const { dpr, z, ox, oy } = lay;
  cx.setTransform(dpr, 0, 0, dpr, 0, 0); cx.clearRect(0, 0, lay.W, lay.H);
  if (!r) return;
  // Grube
  cx.fillStyle = 'rgba(10,11,16,.72)'; rund(ox - 4, oy - 4, z * r.w + 8, z * r.h + 8, 12); cx.fill();
  for (let i = 0; i < r.n; i++) {
    const x = ox + (i % r.w) * z, y = oy + Math.floor(i / r.w) * z;
    cx.fillStyle = r.fest[i] && r.art[i] === 'r' ? '#262838' : (i + Math.floor(i / r.w)) % 2 ? '#1c1e2b' : '#1f2130';
    rund(x + 1, y + 1, z - 2, z - 2, 6); cx.fill();
    if (r.fest[i] && r.art[i] === 'r') { cx.fillStyle = '#6b7088'; for (const [a, b] of [[0.14, 0.14], [0.86, 0.14], [0.14, 0.86], [0.86, 0.86]]) { cx.beginPath(); cx.arc(x + a * z, y + b * z, Math.max(1.5, z * 0.045), 0, Math.PI * 2); cx.fill(); } }
    if (i === cursor && zustand === 'spiel') { cx.strokeStyle = '#FFD21C'; cx.lineWidth = 2; rund(x + 2, y + 2, z - 4, z - 4, 6); cx.stroke(); }
  }
  for (let i = 0; i < r.n; i++) {
    const x = ox + (i % r.w) * z + z / 2, y = oy + Math.floor(i / r.w) * z + z / 2;
    let winkel = 0; const a0 = anim.get(i);
    if (a0 !== undefined) { const p = (jetzt - a0) / DREH_MS; if (p >= 1) anim.delete(i); else winkel = -(1 - einfach(p)) * Math.PI / 2; }
    const w0 = welle.get(i), istNass = nass && nass[i] && (w0 === undefined || jetzt >= w0);
    cx.save(); cx.translate(x, y); cx.rotate(winkel);
    zeichneArme(s.masken[i], z, istNass, jetzt, i);
    cx.restore();
    cx.save(); cx.translate(x, y);
    if (r.art[i] === 'q') zeichneHydrant(z);
    else if (r.art[i] === 'h') {
      // Haus etwas vom Anschluss weggerückt, damit man die Richtung des Anschlusses sieht (dreht sich mit)
      const m = s.masken[i]; let dx = 0, dy = 0; for (const d of RICHTUNGEN) if (m & d) { dx = -DX[d]; dy = -DY[d]; }
      const p = a0 !== undefined && anim.has(i) ? winkel : 0;
      const ux = dx * Math.cos(p) - dy * Math.sin(p), uy = dx * Math.sin(p) + dy * Math.cos(p);
      cx.translate(ux * z * 0.13, uy * z * 0.13); zeichneHaus(i, z, istNass);
    }
    cx.restore();
  }
  // Lecks: Wasser spritzt aus offenen Enden im nassen Bereich
  if (zustand === 'spiel' && !WENIG_BEWEGUNG) for (const l of lecks) if (Math.random() < 0.35) {
    spritzer.push({ x: l.x, y: l.y, vx: l.dx * (1 + Math.random() * 1.6) + (Math.random() - 0.5) * 1.2, vy: l.dy * (1 + Math.random() * 1.6) + (Math.random() - 0.5) * 1.2, t: 26 + Math.random() * 14 });
  }
  cx.fillStyle = WASSER_HELL;
  spritzer = spritzer.filter((p) => (p.t -= 1) > 0);
  for (const p of spritzer) { p.x += p.vx; p.y += p.vy; p.vx *= 0.94; p.vy *= 0.94; cx.globalAlpha = Math.min(1, p.t / 20); cx.beginPath(); cx.arc(p.x, p.y, Math.max(1.5, lay.z * 0.035), 0, Math.PI * 2); cx.fill(); }
  cx.globalAlpha = 1;
}
const einfach = (p) => 1 - (1 - p) * (1 - p);
function rund(x, y, w, h, rr) { cx.beginPath(); if (cx.roundRect) cx.roundRect(x, y, w, h, rr); else cx.rect(x, y, w, h); }

function berechneFluss(alt) {
  const f = fluss(r, s.masken); const jetzt = performance.now();
  // Füllanimation: neu nasse Felder füllen sich nacheinander (nach Abstand vom gedrehten Feld)
  let neu = 0;
  if (alt) for (let i = 0; i < r.n; i++) if (f.nass[i] && !alt[i]) { neu++; welle.set(i, jetzt + Math.min(400, neu * 22)); }
  nass = f.nass;
  lecks = [];
  const { z, ox, oy } = lay;
  for (let c = 0; c < r.n; c++) {
    if (!nass[c]) continue;
    const cxx = c % r.w, cyy = Math.floor(c / r.w);
    for (const d of RICHTUNGEN) {
      if (!(s.masken[c] & d)) continue;
      const nx = cxx + DX[d], ny = cyy + DY[d];
      const offen = nx < 0 || ny < 0 || nx >= r.w || ny >= r.h || !(s.masken[ny * r.w + nx] & ({ 1: 4, 2: 8, 4: 1, 8: 2 })[d]);
      if (offen) lecks.push({ x: ox + cxx * z + z / 2 + DX[d] * z / 2, y: oy + cyy * z + z / 2 + DY[d] * z / 2, dx: DX[d], dy: DY[d] });
    }
  }
  return neu;
}

// ---------- HUD ----------
function laufCs() { return zustand === 'spiel' ? Math.floor((Date.now() - t0) / 10) : endeCs; }
function hud() {
  if (!r) { $('hZeit').textContent = '0:00'; $('hDreh').textContent = '0'; $('hHaeuser').textContent = '0/0'; return; }
  $('hDreh').textContent = String(s.drehungen);
  let h = 0; for (let i = 0; i < r.n; i++) if (r.art[i] === 'h' && nass && nass[i]) h++;
  $('hHaeuser').textContent = h + '/' + r.haeuser; $('hHaus').classList.toggle('voll', h === r.haeuser);
}
function hinweis(text, fett) {
  const e = $('hinweis'); e.textContent = text || '';
  if (fett) { const b = document.createElement('b'); b.textContent = fett; e.appendChild(b); }
}
function standardHinweis() {
  if (!r) return hinweis('');
  if (modus === 'level') {
    if (herausforderung && herausforderung.l === levelNr) return hinweis('Herausforderung: schneller als ', zeitText(herausforderung.t) + ' mit höchstens ' + herausforderung.d + ' Drehungen');
    return hinweis('Ideal: ' + r.par + ' Drehungen · Tippen dreht ein Rohr');
  }
  if (runId) return hinweis('Tagesrätsel ' + tagText(tagKey) + ' · die Uhr läuft · ', 'erster Versuch zählt');
  return hinweis('Tagesrätsel ' + tagText(tagKey) + ' · ohne Konto nur auf diesem Gerät');
}

// ---------- Spiel starten ----------
function starte(raetsel, eingaben) {
  r = raetsel; s = neuesSpiel(r); tipps = []; anim.clear(); welle.clear(); spritzer = []; cursor = -1;
  gr();
  if (eingaben) for (const i of eingaben) if (tippe(r, s, i)) tipps.push(i);
  berechneFluss(null); zustand = 'spiel'; zeige(null); hud(); standardHinweis();
  if (s.geloest) geloest();
}
function starteLevel(nr) {
  ton.start(); modus = 'level'; levelNr = nr; runId = null; tagKey = null;
  $('titelzeile').textContent = 'Level ' + nr + ' · ' + gruppe(nr);
  t0 = Date.now(); starte(levelRaetsel(nr));
}
function gruppe(nr) { return nr <= 5 ? 'Grundlagen' : nr <= 10 ? 'Abzweige' : nr <= 17 ? 'Hausanschlüsse drehen' : nr <= 24 ? 'Verschweißt' : 'Meister'; }

// ---------- Tagesrätsel: Server ----------
const angemeldet = () => { const p = PS(); return !!(p && p.hatSitzung && p.hatSitzung() && p.token && p.token()); };
async function besorgeTag() {
  const p = PS(); if (!p || !p.online || !p.rpc) return { ok: false, grund: 'offline' };
  gastGrund = '';
  if (angemeldet()) {
    const r1 = await p.rpc('leitungschaos_start', {});
    const d = r1 && !r1.fehler ? r1.daten : null;
    if (d && d.ok) return pruefeInfo(d, d.run_id);
    if (d && d.grund === 'schon_geloest') return { ok: false, grund: 'schon_geloest', ergebnis: d };
    if (d && d.grund === 'zu_oft') return { ok: false, grund: 'zu_oft' };
    if (d && d.grund === 'kein_profil') gastGrund = 'kein_profil';
    else if (r1 && r1.status === 401) gastGrund = 'abgelaufen';
    else return { ok: false, grund: 'netz' };
  }
  const r2 = await p.rpc('leitungschaos_tag', {});
  if (!r2 || r2.fehler || !r2.daten || !r2.daten.seed) return { ok: false, grund: 'netz' };
  return pruefeInfo(r2.daten, null);
}
function pruefeInfo(d, run) {
  if (!KONFIG[d.version] || !Number.isInteger(d.seed) || !/^\d{8}$/.test(String(d.tag))) return { ok: false, grund: 'version' };
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
    : 'Ohne Konto bleibt deine Zeit auf diesem Gerät. Mit PlaySaal-Konto kommst du in die Tagesrangliste.';
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
  modus = 'tag'; tagKey = info.tag; runId = info.runId; seedInfo = { seed: info.seed, version: info.version }; letzteMeldung = null;
  $('titelzeile').textContent = 'Tagesrätsel ' + tagText(tagKey);
  const raetsel = tagesRaetsel(info.seed, info.version);
  // Angefangenes Rätsel fortsetzen (gleicher Tag und gleiche Runde bzw. gleicher Seed als Gast)
  const o = store.offen; let eingaben = null;
  if (o && o.tag === tagKey && o.seed === info.seed && o.version === info.version && (runId ? o.run === runId : !o.run)) eingaben = dekodiere(o.inputs, raetsel.n);
  if (runId) t0 = Date.now() - Math.round(info.sek * 1000);
  else t0 = eingaben && o.t0 ? o.t0 : Date.now();
  store.offen = { tag: tagKey, seed: info.seed, version: info.version, run: runId, inputs: eingaben ? kodiere(eingaben) : '', t0 };
  speichern();
  starte(raetsel, eingaben);
}
function zeigeSchonGeloest(e) {
  modus = 'tag'; tagKey = String(e.tag || heuteLokal()); r = null; runId = null;
  zustand = 'ende'; zeige('sEnde');
  $('eKopf').textContent = 'Heute schon gelöst'; $('eKopf').className = '';
  $('eZeit').textContent = zeitGenau(e.zeit_cs || 0); $('eSterne').hidden = true;
  $('eModus').textContent = 'Tagesrätsel ' + tagText(tagKey) + ' · dein gewerteter Versuch';
  $('eDreh').textContent = String(e.drehungen || 0); $('ePar').textContent = '–'; $('eBestT').textContent = 'Platz';
  $('eBest').textContent = e.rang ? e.rang.platz + '/' + e.rang.spieler : '–';
  $('eStatus').className = 'status'; $('eStatus').textContent = 'Morgen gibt es ein neues Rätsel. Die Level kannst du jederzeit spielen.';
  $('bWeiter').hidden = true; $('bErneut').hidden = true; $('bAnmelden').hidden = true;
  letzteErgebnisse = { tag: tagKey, z: e.zeit_cs || 0, d: e.drehungen || 0, par: null };
}

// ---------- Eingabe ----------
function dreheFeld(i) {
  if (zustand !== 'spiel' || !r) return;
  if (r.fest[i]) { ton.fest(); wackel(i); return; }
  const alt = nass.slice();
  if (!tippe(r, s, i)) return;
  tipps.push(i); anim.set(i, performance.now()); ton.dreh();
  const neu = berechneFluss(alt); if (neu) ton.nass(neu);
  if (modus === 'tag' && store.offen) { store.offen.inputs = kodiere(tipps); speichern(); }
  hud();
  if (s.geloest) geloest();
}
function wackel(i) { anim.set(i, performance.now() - DREH_MS * 0.6); }
function feldBei(e) {
  const b = cv.getBoundingClientRect(), x = e.clientX - b.left - lay.ox, y = e.clientY - b.top - lay.oy;
  const fx = Math.floor(x / lay.z), fy = Math.floor(y / lay.z);
  return fx >= 0 && fy >= 0 && fx < r.w && fy < r.h ? fy * r.w + fx : -1;
}
cv.addEventListener('pointerdown', (e) => { e.preventDefault(); if (zustand !== 'spiel' || !r) return; const i = feldBei(e); if (i >= 0) { cursor = -1; dreheFeld(i); } });
addEventListener('keydown', (e) => {
  if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
  if (zustand !== 'spiel' || !r) return;
  const k = e.key, pf = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[k];
  if (pf) { e.preventDefault(); if (cursor < 0) cursor = r.quelle; const x = Math.max(0, Math.min(r.w - 1, cursor % r.w + pf[0])), y = Math.max(0, Math.min(r.h - 1, Math.floor(cursor / r.w) + pf[1])); cursor = y * r.w + x; }
  else if ((k === ' ' || k === 'Enter') && cursor >= 0) { e.preventDefault(); if (!e.repeat) dreheFeld(cursor); }
});

// ---------- Gelöst ----------
let letzteErgebnisse = null;
function geloest() {
  endeCs = Math.floor((Date.now() - t0) / 10); zustand = 'fertig'; ton.geschafft(); hud();
  hinweis('Wasser marsch! ', 'Alle Häuser versorgt');
  setTimeout(ergebnis, WENIG_BEWEGUNG ? 200 : 1300);
}
function ergebnis() {
  zustand = 'ende'; zeige('sEnde');
  const d = s.drehungen, z = endeCs;
  $('eZeit').textContent = zeitGenau(z); $('eDreh').textContent = String(d); $('ePar').textContent = String(r.par);
  for (const id of ['bErneut', 'bAnmelden']) $(id).hidden = true;
  const st = $('eStatus'); st.className = 'status'; st.textContent = '';
  const k = $('eKopf'); k.className = '';
  letzteErgebnisse = { tag: tagKey, z, d, par: r.par, level: modus === 'level' ? levelNr : null };
  if (modus === 'level') {
    const stern = sterneFuer(d, r.par), alt = store.best[levelNr];
    const neu = !alt || stern > alt.s || (stern === alt.s && z < alt.z);
    if (neu) store.best[levelNr] = { d: alt ? Math.min(alt.d, d) : d, z: alt ? Math.min(alt.z, z) : z, s: Math.max(stern, alt ? alt.s : 0) };
    else store.best[levelNr] = { d: Math.min(alt.d, d), z: Math.min(alt.z, z), s: alt.s };
    if (levelNr >= store.frei && levelNr < LEVEL.length) store.frei = levelNr + 1;
    speichern();
    const se = $('eSterne'); se.hidden = false; se.textContent = '';
    for (let i = 1; i <= 3; i++) { const sp = document.createElement('span'); sp.textContent = '★'; if (i <= stern) sp.className = 'an'; se.appendChild(sp); }
    k.textContent = levelNr === LEVEL.length ? 'Alle Level geschafft!' : neu && alt ? 'Neuer Rekord!' : 'Wasser marsch!'; if (neu && alt) k.className = 'rek';
    $('eModus').textContent = 'Level ' + levelNr + ' · ' + gruppe(levelNr);
    $('eBestT').textContent = 'Bestzeit'; $('eBest').textContent = zeitText(store.best[levelNr].z);
    $('bWeiter').hidden = false; $('bWeiter').textContent = levelNr < LEVEL.length ? 'Nächstes Level' : 'Levelübersicht';
    if (herausforderung && herausforderung.l === levelNr) {
      const besser = z < herausforderung.t && d <= herausforderung.d;
      st.className = 'status' + (besser ? ' ok' : ''); st.textContent = besser ? 'Herausforderung geschafft!' : 'Herausforderung: ' + zeitText(herausforderung.t) + ' mit ' + herausforderung.d + ' Drehungen. Noch einmal?';
    }
    return;
  }
  // Tagesrätsel
  $('eSterne').hidden = true; $('bWeiter').hidden = false; $('bWeiter').textContent = 'Level spielen';
  $('eModus').textContent = 'Tagesrätsel ' + tagText(tagKey);
  const vor = store.tage[tagKey];
  if (!vor || z < vor.z || (z === vor.z && d < vor.d)) store.tage[tagKey] = { z, d };
  store.offen = null; speichern();
  $('eBestT').textContent = 'Heute best'; $('eBest').textContent = zeitText(store.tage[tagKey].z);
  k.textContent = 'Wasser marsch!';
  if (runId) { letzteMeldung = { run_id: runId, inputs: kodiere(tipps), drehungen: d }; sende(); }
  else {
    st.textContent = gastGrund === 'kein_profil' ? 'Ohne Spielernamen zählt das Rätsel nur auf diesem Gerät. Lege im Konto einen Namen an.' : gastGrund === 'abgelaufen' ? 'Deine Anmeldung ist abgelaufen. Melde dich neu an, um morgen in die Rangliste zu kommen.' : 'Nur auf diesem Gerät gespeichert. Mit PlaySaal-Konto kommst du in die Tagesrangliste.';
    $('bAnmelden').hidden = false; $('bAnmelden').textContent = gastGrund === 'kein_profil' ? 'Namen anlegen' : 'Anmelden';
  }
}
async function sende() {
  const st = $('eStatus'); st.className = 'status'; st.textContent = 'Wird vom Server geprüft …'; $('bErneut').hidden = true;
  const m = letzteMeldung;
  const e = await melden(m);
  if (m !== letzteMeldung) return;
  if (e.status === 'verifiziert') {
    runId = null; letzteMeldung = null;
    // Gewertet wird die Serverzeit (Ausgabe der Runde bis Abschluss, inklusive Übertragung)
    if (Number.isInteger(e.zeit_cs)) { $('eZeit').textContent = zeitGenau(e.zeit_cs); letzteErgebnisse.z = e.zeit_cs; store.tage[tagKey] = { z: e.zeit_cs, d: m.drehungen }; speichern(); $('eBest').textContent = zeitText(e.zeit_cs); }
    const g = e.rang; let t = '✓ Vom Server geprüft und gewertet.';
    if (g) { t += ' Heute Platz ' + g.platz + ' von ' + g.spieler + '.'; if (g.luecke) t += ' ' + zeitGenauKurz(g.luecke) + ' fehlen bis Platz ' + g.naechster_platz + '.'; else if (g.platz === 1) t += ' Du führst.'; }
    st.className = 'status ok'; st.textContent = t; rangLeiste(g || null);
  } else if (e.status === 'abgelehnt') {
    runId = null; letzteMeldung = null; st.className = 'status fehler';
    st.textContent = e.grund === 'abgelaufen' ? 'Das Rätsel war zu lange offen und wird nicht gewertet.' : e.grund === 'schon_abgeschlossen' ? 'Dieser Versuch wurde schon gewertet.' : 'Der Server hat dieses Ergebnis nicht bestätigt. Es steht nicht in der Rangliste.';
  } else { st.className = 'status fehler'; st.textContent = 'Der Server ist gerade nicht erreichbar. Das Ergebnis ist noch nicht gewertet.'; $('bErneut').hidden = false; }
}
const zeitGenauKurz = (cs) => (cs >= 6000 ? zeitText(cs) + ' min' : (cs / 100).toFixed(2).replace('.', ',') + ' s');
async function melden(m) {
  const p = PS(); if (!p || !angemeldet()) return { status: 'fehler' };
  const ctl = typeof AbortController === 'function' ? new AbortController() : null, t = setTimeout(() => ctl && ctl.abort(), 15000);
  try {
    const res = await fetch(CFG().url + '/functions/v1/leitungschaos-lauf', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + p.token(), apikey: CFG().key || '' }, body: JSON.stringify(m), signal: ctl ? ctl.signal : undefined });
    const j = await res.json().catch(() => ({}));
    if (res.ok && j.verifiziert) return { status: 'verifiziert', rang: j.rang || null, zeit_cs: j.zeit_cs };
    if (res.ok) return { status: 'abgelehnt', grund: j.grund || '' };
    return { status: 'fehler' };
  } catch (e) { return { status: 'fehler' }; } finally { clearTimeout(t); }
}
function rangLeiste(g) { if (g) hinweis('Heute: Platz ', g.platz + ' von ' + g.spieler); }

// ---------- Teilen ----------
$('bTeilen').addEventListener('click', async () => {
  const b = $('bTeilen'), e = letzteErgebnisse; if (!e) return;
  let url = location.origin + location.pathname.replace(/\/$/, ''), text;
  if (e.level) {
    const st = sterneFuer(e.d, e.par);
    text = 'Leitungschaos Level ' + e.level + ': ' + '★'.repeat(st) + '☆'.repeat(3 - st) + ' in ' + zeitText(e.z) + ' mit ' + e.d + ' Drehungen. Schaffst du es besser?';
    url += '?l=' + e.level + '&d=' + e.d + '&t=' + e.z;
  } else text = '🚰 Leitungschaos · Tagesrätsel ' + tagText(e.tag) + '\n⏱ ' + zeitText(e.z) + ' · 🔄 ' + e.d + ' Drehungen' + (e.par ? ' (ideal ' + e.par + ')' : '') + '\nSchaffst du es schneller?';
  const fertig = (msg) => { b.textContent = msg; setTimeout(() => { b.textContent = 'Teilen'; }, 2500); };
  b.textContent = 'Teilen …';
  try { if (navigator.share) { await navigator.share({ title: 'Leitungschaos', text, url }); b.textContent = 'Teilen'; return; } } catch (err) { if (err && err.name === 'AbortError') { b.textContent = 'Teilen'; return; } }
  try { await navigator.clipboard.writeText(text + '\n' + url); fertig('Kopiert ✓'); } catch (err) { fertig(url); }
});

// ---------- Menüs ----------
function zeige(id) { for (const x of ['sTitel', 'sBereit', 'sLevel', 'sEnde', 'sRang', 'sRegeln']) $(x).hidden = x !== id; }
function titel() {
  zustand = 'titel'; zeige('sTitel'); $('tStatus').textContent = ''; $('tStatus').className = 'status';
  const t = heuteLokal(); $('tTag').textContent = tagText(t);
  const heute = store.tage[t], gel = Object.keys(store.best).length;
  $('tInfo').textContent = (heute ? 'Heute: ' + zeitText(heute.z) + ' · ' : '') + gel + ' von ' + LEVEL.length + ' Level gelöst';
  $('bTag').firstChild.textContent = store.offen && store.offen.tag === String(t) ? 'Tagesrätsel fortsetzen ' : 'Tagesrätsel ';
  r = null; s = null; nass = null; lecks = []; spritzer = []; $('titelzeile').textContent = ''; hinweis(''); hud(); zeichneNeu = true;
}
function levelMenue() {
  zustand = 'level'; zeige('sLevel');
  const g = $('lGitter'); g.textContent = '';
  const gruppen = [[1, 'Grundlagen'], [6, 'Abzweige'], [11, 'Hausanschlüsse drehen sich'], [18, 'Verschweißte Rohre'], [25, 'Meister']];
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

// ---------- Rangliste (Tage blättern; frühere Tage = Archiv) ----------
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
    const x = await p.rpc('leitungschaos_tage_liste', { p_anzahl: 60 });
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
  const res = await p.rpc('leitungschaos_rangliste', { p_tag: tag, p_anzahl: 10 });
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
    const dr = document.createElement('i'); dr.textContent = z.drehungen + '↻';
    const e = document.createElement('b'); e.textContent = zeitGenau(z.zeit_cs);
    li.append(a, b, c, dr, e); liste.appendChild(li);
  }
  $('rHinweis').textContent = d.ich && d.ich.luecke ? 'Dir fehlen ' + zeitGenauKurz(d.ich.luecke) + ' bis Platz ' + d.ich.naechster_platz + '.' : 'Erster Versuch je Konto. Schnellste Zeit vorn, bei Gleichstand weniger Drehungen.';
}

// ---------- Schleife ----------
let letzteSek = -1;
function frame(jetzt) {
  requestAnimationFrame(frame);
  if (zustand === 'spiel' || zustand === 'fertig') {
    const cs = laufCs(), sek = Math.floor(cs / 100);
    if (sek !== letzteSek) { letzteSek = sek; $('hZeit').textContent = zeitText(cs); }
  }
  if (r && (zustand === 'spiel' || zustand === 'fertig' || anim.size || spritzer.length || zeichneNeu || (nass && !WENIG_BEWEGUNG))) { zeichne(jetzt); zeichneNeu = false; }
  else if (!r && zeichneNeu) { zeichne(jetzt); zeichneNeu = false; }
}

// ---------- Start ----------
laden(); tonKnopf(); gr(); titel();
(() => {   // Herausforderungs-Link: ?l=Level&d=Drehungen&t=Hundertstel
  const q = new URLSearchParams(location.search), l = Number(q.get('l')), d = Number(q.get('d')), t = Number(q.get('t'));
  if (Number.isInteger(l) && l >= 1 && l <= LEVEL.length && Number.isInteger(d) && d > 0 && d < 10000 && Number.isInteger(t) && t > 0 && t < 1e7) {
    herausforderung = { l, d, t }; starteLevel(l);
  }
})();
requestAnimationFrame(frame);
window.__lc = {
  get zustand() { return zustand; }, get raetsel() { return r; }, get spiel() { return s; }, get tipps() { return tipps; }, get runId() { return runId; },
  get modus() { return modus; }, get lay() { return lay; }, store: () => store, dreheFeld, starteLevel, get platzhalter() { return bilderFehlen; }
};
