// DARTFIEBER: Darstellung, Steuerung, Ton, Speicherstand, Tageschallenge und Rangliste. Die Regeln stehen in sim.js
// (dieselbe Datei prüft auf dem Server jede Runde nach). Die Dartscheibe wird komplett aus den Regel-Konstanten gezeichnet,
// Bilder (Hintergrund, Holzfassung, Pfeile) kommen aus img/; fehlt eines, wird ein technischer Platzhalter gezeichnet.
import { VERSION, KONFIG, REIHENFOLGE, RING, SCHEIBE_AUSSEN, WIND_X, WIND_Y, feldFarbe, challengeAus, neueRunde, linie, windWurf, tempoWurf, kodiere } from './sim.js';

const $ = (id) => document.getElementById(id);
const CFG = () => window.PLAYSAAL_CFG || {};
const PS = () => window.PlaySaal || null;
const KEY = 'dartfieber.v1';
const TAKT = 1000 / 60;
const VIEW = 25400;                       // halbe Breite des sichtbaren Spielfelds (Feldeinheiten = 1/100 mm)
const WENIG_BEWEGUNG = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);

// ---------- Speicherstand (nur dieses Gerät) ----------
let store = { v: 1, best: 0, runs: 0, tage: {}, sound: true };
function laden() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (d && typeof d === 'object') {
      store.best = Math.max(0, Math.min(1e6, Math.floor(Number(d.best) || 0)));
      store.runs = Math.max(0, Math.min(1e9, Math.floor(Number(d.runs) || 0)));
      store.sound = d.sound !== false;
      store.tage = {};
      if (d.tage && typeof d.tage === 'object') for (const k of Object.keys(d.tage).slice(-60)) if (/^\d{8}$/.test(k)) store.tage[k] = Math.max(0, Math.min(3000, Math.floor(Number(d.tage[k]) || 0)));
    }
  } catch (e) {}
}
function speichern() {
  const keys = Object.keys(store.tage).sort(); while (keys.length > 60) delete store.tage[keys.shift()];
  try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) {}
}
const tagText = (n) => { const s = String(n); return s.slice(6, 8) + '.' + s.slice(4, 6) + '.'; };
const tagVoll = (n) => tagText(n) + String(n).slice(0, 4);

// ---------- Bilder (mit Platzhalter, wenn eine Datei fehlt) ----------
const bild = {};
const DATEIEN = { hg: 'df-hintergrund.jpg', holz: 'df-holzfassung.webp', pfeil: 'df-pfeil-bereit.png', treff: 'df-pfeil-treffer.png', icon: 'df-pfeil-icon.png' };
let bilderOffen = Object.keys(DATEIEN).length, bilderFehlen = 0;
function bilderFertig() {
  if (--bilderOffen > 0) return;
  $('platzhalter').hidden = bilderFehlen === 0;
  if (bild.icon) { $('icoPf').src = bild.icon.src; $('icoPf').hidden = false; }
  if (bild.hg) { document.body.style.backgroundImage = 'url("' + bild.hg.src + '")'; document.body.classList.add('bild'); }
  neuBauen();
}
for (const k of Object.keys(DATEIEN)) {
  const im = new Image();
  im.onload = () => { bild[k] = im; bilderFertig(); };
  im.onerror = () => { bilderFehlen++; bilderFertig(); };
  im.src = new URL('./img/' + DATEIEN[k], import.meta.url).href;
}

// ---------- Ton ----------
const ton = {
  ctx: null,
  start() { if (this.ctx || !(window.AudioContext || window.webkitAudioContext)) return; try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} },
  piep(f0, f1, dauer, typ, lautst, verz) {
    if (!store.sound || !this.ctx) return; try {
      const c = this.ctx, o = c.createOscillator(), g = c.createGain(), t = c.currentTime + (verz || 0);
      o.type = typ || 'sine'; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dauer);
      g.gain.setValueAtTime(lautst || 0.1, t); g.gain.exponentialRampToValueAtTime(0.001, t + dauer); o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + dauer + 0.02);
    } catch (e) {}
  },
  stopp() { this.piep(900, 700, 0.06, 'square', 0.05); },
  wurf() { this.piep(500, 180, 0.4, 'triangle', 0.07); },
  landung(p) { this.piep(160, 70, 0.14, 'sine', 0.2); if (p >= 40) this.piep(880, 1320, 0.18, 'triangle', 0.08, 0.05); },
  bonus() { [0, 0.09, 0.18].forEach((v, i) => this.piep(600 * (1 + i * 0.25), 600 * (1 + i * 0.25), 0.16, 'square', 0.06, v)); },
  ende() { this.piep(330, 110, 0.5, 'sawtooth', 0.08); }
};

// ---------- Zustand ----------
let zustand = 'titel';          // titel | laedt | bereit | spiel | fertig (Ergebnis der letzten Runde läuft aus) | ende | rang | regeln
let modus = 'tag';              // tag | ueben
let ch = null, l = null, tipps = [], tippOffen = false, runId = null, tagKey = null, gastGrund = '';
let treffer = [], flug = null, partikel = [], popups = [], schuettel = 0, bonusBlitz = 0;
let lay = null, off = null;
let letzteMeldung = null;       // zuletzt an den Server geschickte Runde (für "Erneut senden")

// ---------- Layout ----------
const cv = $('c'), cx = cv.getContext('2d');
function gr() {
  const el = $('brett'), w = Math.max(1, el.clientWidth), h = Math.max(1, el.clientHeight), dpr = Math.min(window.devicePixelRatio || 1, 2);
  cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
  const zone = Math.max(46, Math.min(h * 0.2, 130));          // Platz für den bereitliegenden Pfeil unter der Scheibe
  const B = Math.max(80, Math.min(w, h - zone * 0.85));
  const ox = (w - B) / 2, oy = Math.max(0, (h - zone * 0.85 - B) / 2);
  lay = { w, h, dpr, B, ox, oy, sc: B / (2 * VIEW), mx: ox + B / 2, my: oy + B / 2, ah: Math.min(zone * 1.7, h * 0.4) };
  neuBauen();
}
addEventListener('resize', gr);
const px = (x) => lay.mx + x * lay.sc, py = (y) => lay.my + y * lay.sc;

// ---------- Scheibe (aus den Regel-Konstanten gezeichnet) ----------
const FARBEN = { schwarz: '#1b1b1d', creme: '#efe2bf', rot: '#c8372d', gruen: '#2d8a4b' };
const winkelRad = (grad) => (grad * Math.PI) / 180 - Math.PI / 2;     // 0 Grad = oben, im Uhrzeigersinn
function baueScheibe() {
  if (!ch || !lay) { off = null; return; }
  const s = ch.s / 1000, sc = lay.sc, rOut = SCHEIBE_AUSSEN * s, rw = rOut + 1400;
  const D = Math.ceil((rw * 2 * sc) / 0.96) + 2, dpr = lay.dpr;
  off = document.createElement('canvas'); off.width = Math.ceil(D * dpr); off.height = Math.ceil(D * dpr);
  const g = off.getContext('2d'); g.scale(dpr, dpr);
  const c0 = D / 2, R = (u) => u * s * sc;
  // Holzfassung
  if (bild.holz) g.drawImage(bild.holz, c0 - D / 2, c0 - D / 2, D, D);
  else { g.fillStyle = '#6a4a2c'; g.beginPath(); g.arc(c0, c0, rw * sc, 0, 7); g.fill(); g.lineWidth = Math.max(2, rw * sc * 0.03); g.strokeStyle = '#3d2915'; g.stroke(); }
  // Zahlenring
  g.fillStyle = '#141416'; g.beginPath(); g.arc(c0, c0, R(SCHEIBE_AUSSEN), 0, 7); g.fill();
  // Ringbänder je Sektor: Farbe über feldFarbe(), dieselbe Zuordnung wie in der Wertung
  const band = (name, r0, r1) => {
    for (let k = 0; k < 20; k++) {
      const a0 = winkelRad(18 * k - 9), a1 = winkelRad(18 * k + 9);
      g.fillStyle = FARBEN[feldFarbe(name, k)];
      g.beginPath(); g.arc(c0, c0, R(r1), a0, a1); g.arc(c0, c0, R(r0), a1, a0, true); g.closePath(); g.fill();
    }
  };
  band('doppel', RING.doppelInnen, RING.doppelAussen);
  band('aussen', RING.dreifachAussen, RING.doppelInnen);
  band('dreifach', RING.dreifachInnen, RING.dreifachAussen);
  band('innen', RING.aussenBull, RING.dreifachInnen);
  g.fillStyle = FARBEN[feldFarbe('aussenbull', 0)]; g.beginPath(); g.arc(c0, c0, R(RING.aussenBull), 0, 7); g.fill();
  g.fillStyle = FARBEN[feldFarbe('innenbull', 0)]; g.beginPath(); g.arc(c0, c0, R(RING.innenBull), 0, 7); g.fill();
  // Drähte
  g.strokeStyle = 'rgba(205,205,200,.75)'; g.lineWidth = Math.max(0.6, 200 * s * sc);
  for (const r of [RING.innenBull, RING.aussenBull, RING.dreifachInnen, RING.dreifachAussen, RING.doppelInnen, RING.doppelAussen]) { g.beginPath(); g.arc(c0, c0, R(r), 0, 7); g.stroke(); }
  for (let k = 0; k < 20; k++) { const a = winkelRad(18 * k + 9); g.beginPath(); g.moveTo(c0 + Math.cos(a) * R(RING.aussenBull), c0 + Math.sin(a) * R(RING.aussenBull)); g.lineTo(c0 + Math.cos(a) * R(RING.doppelAussen), c0 + Math.sin(a) * R(RING.doppelAussen)); g.stroke(); }
  // Zahlen
  g.fillStyle = '#f3ead1'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = '700 ' + Math.max(8, Math.round(2500 * s * sc)) + 'px "Barlow Condensed","Arial Narrow",system-ui,sans-serif';
  for (let k = 0; k < 20; k++) { const a = winkelRad(18 * k); g.fillText(String(REIHENFOLGE[k]), c0 + Math.cos(a) * R(19750), c0 + Math.sin(a) * R(19750) + 1); }
  off.D = D;
}
function neuBauen() { baueScheibe(); }
if (document.fonts && document.fonts.ready) document.fonts.ready.then(neuBauen);

// ---------- Hilfen zur Anzeige ----------
const RICHTUNG = ['oben', 'rechts oben', 'rechts', 'rechts unten', 'unten', 'links unten', 'links', 'links oben'];
function zeichneWind(w) {
  const c = $('windPfeil'), g = c.getContext('2d'), S = c.width, m = S / 2;
  g.clearRect(0, 0, S, S);
  g.strokeStyle = 'rgba(246,244,238,.2)'; g.lineWidth = 2; g.beginPath(); g.arc(m, m, m - 3, 0, 7); g.stroke();
  if (!w.staerke) { g.fillStyle = '#A9BAC8'; g.beginPath(); g.arc(m, m, 4, 0, 7); g.fill(); return; }
  const dx = WIND_X[w.richtung] / 1000, dy = WIND_Y[w.richtung] / 1000, L = m * 0.62, br = 3 + w.staerke * 0.5;
  g.strokeStyle = '#2FD6C4'; g.fillStyle = '#2FD6C4'; g.lineWidth = br; g.lineCap = 'round';
  g.beginPath(); g.moveTo(m - dx * L, m - dy * L); g.lineTo(m + dx * (L - 4), m + dy * (L - 4)); g.stroke();
  const ex = m + dx * L, ey = m + dy * L, nx = -dy, ny = dx, k = 8 + br;
  g.beginPath(); g.moveTo(ex, ey); g.lineTo(ex - dx * k + nx * k * 0.55, ey - dy * k + ny * k * 0.55); g.lineTo(ex - dx * k - nx * k * 0.55, ey - dy * k - ny * k * 0.55); g.closePath(); g.fill();
}
function hud() {
  const s = l.s;
  $('hP').textContent = String(s.punkte);
  $('hPf').textContent = String(s.pfeile);
  $('hWurf').textContent = 'Wurf ' + Math.min(s.wuerfe + (s.phase === 'ende' ? 0 : 1), ch.K.maxWuerfe) + ' von ' + ch.K.maxWuerfe;
  const w = windWurf(ch, Math.min(s.i, ch.K.maxWuerfe - 1));
  $('hWind').textContent = String(w.staerke);
  $('windBox').setAttribute('aria-label', w.staerke ? 'Wind ' + w.staerke + ' Meter pro Sekunde, schiebt nach ' + RICHTUNG[w.richtung] : 'Windstille');
  zeichneWind(w);
  const ph = s.phase;
  $('s1').className = ph === 'x' ? 'an' : ''; $('s2').className = ph === 'y' ? 'an' : ''; $('s3').className = ph === 'flug' || ph === 'nach' ? 'an' : '';
  $('bStopp').setAttribute('aria-disabled', String(!(ph === 'x' || ph === 'y')));
}
function leeresHud() {
  $('hP').textContent = '0'; $('hPf').textContent = '5'; $('hWurf').textContent = 'Wurf 1 von 30'; $('hWind').textContent = '0';
  zeichneWind({ staerke: 0, richtung: 0 }); $('s1').className = $('s2').className = $('s3').className = ''; $('bStopp').setAttribute('aria-disabled', 'true');
}
const TEXT_RING = { doppel: 'DOPPEL ', dreifach: 'TRIPLE ' };
function trefferText(r) {
  if (r.ring === 'innenbull') return ['BULLSEYE', '50'];
  if (r.ring === 'aussenbull') return ['BULL', '25'];
  if (r.ring === 'aus') return ['DANEBEN', '0'];
  return [(TEXT_RING[r.ring] || '') + r.zahl, String(r.punkte)];
}

// ---------- Server: Challenge, Start, Meldung ----------
const angemeldet = () => { const p = PS(); return !!(p && p.hatSitzung && p.hatSitzung() && p.token && p.token()); };
async function besorge(m) {
  if (m === 'ueben') return { ok: true, seed: 1 + Math.floor(Math.random() * 2147483646), version: VERSION, tag: null, runId: null };
  const p = PS(); if (!p || !p.online || !p.rpc) return { ok: false, grund: 'offline' };
  gastGrund = '';
  if (angemeldet()) {
    const r = await p.rpc('dartfieber_start', {});
    if (r && !r.fehler && r.daten && r.daten.ok) return pruefeInfo(r.daten, r.daten.run_id);
    if (r && !r.fehler && r.daten && r.daten.grund === 'zu_oft') return { ok: false, grund: 'zu_oft' };
    if (r && !r.fehler && r.daten && r.daten.grund === 'kein_profil') gastGrund = 'kein_profil';
    else if (r && r.status === 401) gastGrund = 'abgelaufen';
    else return { ok: false, grund: 'netz' };
  }
  const r = await p.rpc('dartfieber_tag', {});
  if (!r || r.fehler || !r.daten || !r.daten.seed) return { ok: false, grund: 'netz' };
  return pruefeInfo(r.daten, null);
}
function pruefeInfo(d, run) {
  if (!KONFIG[d.version] || !Number.isInteger(d.seed) || !/^\d{8}$/.test(String(d.tag))) return { ok: false, grund: 'version' };
  return { ok: true, seed: d.seed, version: d.version, tag: String(d.tag), runId: run || null };
}
const FEHLERTEXT = {
  offline: 'Die Tageschallenge braucht eine Verbindung zum Server. Du kannst trotzdem üben.',
  netz: 'Der Server ist gerade nicht erreichbar. Du kannst trotzdem üben.',
  zu_oft: 'Zu viele Runden in kurzer Zeit. Gleich noch einmal versuchen.',
  version: 'Die Challenge von heute braucht eine neuere Version des Spiels. Seite neu laden (Strg+F5).'
};
function statusZeile(text, art) {
  const e = zustand === 'ende' ? $('eStatus') : $('tStatus');
  e.textContent = text || ''; e.className = 'status' + (art ? ' ' + art : '');
}

async function startRunde(m) {
  if (zustand === 'laedt' || zustand === 'spiel' || zustand === 'bereit') return;
  const vorher = zustand; ton.start();
  zustand = 'laedt'; $('bTag').disabled = $('bNochmal').disabled = true; statusZeile(m === 'tag' ? 'Challenge wird geholt …' : '');
  const info = await besorge(m);
  $('bTag').disabled = $('bNochmal').disabled = false;
  if (!info.ok) { zustand = vorher === 'laedt' ? 'titel' : vorher; statusZeile(FEHLERTEXT[info.grund] || FEHLERTEXT.netz, 'fehler'); return; }
  modus = m; ch = challengeAus(info.seed, info.version); runId = info.runId; tagKey = info.tag;
  l = neueRunde(ch); tipps = []; tippOffen = false; treffer = []; flug = null; partikel = []; popups = []; schuettel = 0; bonusBlitz = 0; letzteMeldung = null;
  zeige(null); zustand = 'bereit'; gr(); hud();
  rangLeiste();
}
function tippen() {
  if (zustand === 'bereit') { zustand = 'spiel'; acc = 0; return; }       // der erste Tipp startet nur
  if (zustand !== 'spiel') return;
  const ph = l.s.phase; if (ph === 'x' || ph === 'y') tippOffen = true;
}

function ereignis(ev) {
  const s = l.s;
  if (ev === 'stopp1') { ton.stopp(); hud(); }
  else if (ev === 'wurf') { ton.wurf(); flug = { ax: s.ax, ay: s.ay, hx: s.hx, hy: s.hy }; hud(); }
  else if (ev === 'landung' || ev === 'ende') {
    const r = s.letzter; flug = null; treffer.push({ x: r.hx, y: r.hy });
    ton.landung(r.punkte); const [t1, t2] = trefferText(r);
    popups.push({ t: t1, u: r.ring === 'aus' ? '' : t2 + ' Punkte', c: r.ring === 'aus' ? '#A9BAC8' : '#FFD36B', t0: performance.now(), y: 0 });
    if (r.bonus) { ton.bonus(); popups.push({ t: '+' + ch.K.bonusPfeile + ' PFEILE', u: '', c: '#2FD6C4', t0: performance.now(), y: 1 }); bonusBlitz = 40; const e = $('bPfeile'); e.classList.add('plus'); setTimeout(() => e.classList.remove('plus'), 1200); }
    funken(px(r.hx), py(r.hy), r.bonus ? 26 : r.punkte >= 40 ? 18 : 8, r.bonus ? '#FFD36B' : r.punkte >= 40 ? '#2FD6C4' : '#F6F4EE');
    if (r.punkte >= 40 && !WENIG_BEWEGUNG) schuettel = 8;
    hud();
    if (ev === 'ende') { zustand = 'fertig'; ton.ende(); setTimeout(ergebnis, 1100); }
  } else if (ev === 'naechster') hud();
}
function funken(x, y, n, farbe) {
  for (let i = 0; i < n; i++) { const a = Math.random() * 6.283, v = 1 + Math.random() * 3.6; partikel.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 0.8, l: 28 + Math.random() * 20, c: farbe }); }
}

// ---------- Ergebnis ----------
function ergebnis() {
  const s = l.s, p = s.punkte;
  store.runs++;
  let rekord = false, tagRekord = false;
  if (p > store.best) { store.best = p; rekord = true; }
  const vorherTag = modus === 'tag' && tagKey ? store.tage[tagKey] || 0 : 0;
  if (modus === 'tag' && tagKey && p > vorherTag) { store.tage[tagKey] = p; tagRekord = true; }
  speichern();
  zustand = 'ende'; zeige('sEnde');
  $('ePunkte').textContent = String(p); $('eWuerfe').textContent = String(s.wuerfe); $('eBoni').textContent = String(s.boni);
  $('eModus').textContent = modus === 'tag' ? 'Tageschallenge ' + tagText(tagKey) : 'Übungsrunde (zählt nicht für die Rangliste)';
  $('eBest').textContent = String(modus === 'tag' ? store.tage[tagKey] || 0 : store.best);
  const k = $('eKopf'); k.textContent = tagRekord && vorherTag ? 'Neuer Tagesbestwert!' : rekord ? 'Neuer Bestwert!' : 'Runde vorbei'; k.className = tagRekord || rekord ? 'rek' : '';
  for (const id of ['bErneut', 'bAnmelden']) $(id).hidden = true;
  $('bNochmal').focus();
  const st = $('eStatus'); st.className = 'status'; st.textContent = '';
  if (modus !== 'tag') return;
  if (runId) {
    letzteMeldung = { run_id: runId, inputs: kodiere(tipps), ticks: s.t, score: p, throws: s.wuerfe };
    sende();
  } else {
    st.textContent = gastGrund === 'kein_profil' ? 'Ohne Spielernamen zählt die Runde nur auf diesem Gerät. Lege im Konto einen Namen an.' : gastGrund === 'abgelaufen' ? 'Deine Anmeldung ist abgelaufen. Melde dich neu an, damit deine Runden in die Rangliste kommen.' : 'Nur auf diesem Gerät gespeichert. Mit PlaySaal-Konto kommst du in die Tagesrangliste.';
    $('bAnmelden').hidden = false; $('bAnmelden').textContent = gastGrund === 'kein_profil' ? 'Namen anlegen' : 'Anmelden';
  }
}
async function sende() {
  const st = $('eStatus'); st.className = 'status'; st.textContent = 'Wird vom Server geprüft …'; $('bErneut').hidden = true;
  const m = letzteMeldung, aktuellerLauf = l;
  const r = await melden(m);
  if (l !== aktuellerLauf || zustand !== 'ende') return;
  if (r.status === 'verifiziert') {
    runId = null; letzteMeldung = null;
    const g = r.rang || null;
    if (g && Number.isInteger(g.punkte)) { store.tage[tagKey] = Math.max(store.tage[tagKey] || 0, g.punkte); speichern(); $('eBest').textContent = String(store.tage[tagKey]); }
    let t = '✓ Vom Server nachgerechnet.';
    if (g) {
      t += ' Heute Platz ' + g.platz + ' von ' + g.spieler + '.';
      if (g.luecke) t += ' Noch ' + g.luecke + ' Punkte bis Platz ' + g.naechster_platz + '.';
      else if (g.platz === 1) t += ' Du führst.';
    }
    st.className = 'status ok'; st.textContent = t; rangLeiste(g);
  } else if (r.status === 'abgelehnt') {
    runId = null; letzteMeldung = null; st.className = 'status fehler';
    st.textContent = r.grund === 'abgelaufen' ? 'Die Runde war zu lange offen und wurde nicht gewertet.' : r.grund === 'zu_oft' ? 'Zu viele Meldungen in kurzer Zeit. Das Ergebnis bleibt nur auf diesem Gerät.' : 'Der Server hat dieses Ergebnis nicht bestätigt. Es steht nicht in der Rangliste.';
  } else {
    st.className = 'status fehler'; st.textContent = 'Der Server ist gerade nicht erreichbar. Das Ergebnis ist noch nicht in der Rangliste.'; $('bErneut').hidden = false;
  }
}
async function melden(m) {
  const p = PS(); if (!p || !angemeldet()) return { status: 'fehler' };
  const ctl = typeof AbortController === 'function' ? new AbortController() : null, t = setTimeout(() => ctl && ctl.abort(), 15000);
  try {
    const r = await fetch(CFG().url + '/functions/v1/dartfieber-lauf', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + p.token(), apikey: CFG().key || '' }, body: JSON.stringify(m), signal: ctl ? ctl.signal : undefined });
    const j = await r.json().catch(() => ({}));
    if (r.ok && j.verifiziert) return { status: 'verifiziert', rang: j.rang || null };
    if (r.ok) return { status: 'abgelehnt', grund: j.grund || '' };
    return { status: 'fehler' };
  } catch (e) { return { status: 'fehler' }; } finally { clearTimeout(t); }
}

// Kompakte Tagesplatzierung unter dem STOPP-Knopf (nur bestätigte Daten; ohne Konto der lokale Tagesbestwert)
async function rangLeiste(vorhanden) {
  const el = $('rang'); el.textContent = '';
  const add = (t, fett) => { const n = fett ? document.createElement('b') : document.createTextNode(''); n.textContent = t; el.appendChild(n); };
  if (modus !== 'tag') { add('Übungsrunde · zählt nicht für die Rangliste'); return; }
  const lokal = store.tage[tagKey] || 0;
  if (!angemeldet() || gastGrund) { add('Heute bester Wert: '); add(String(lokal), true); add(' · mit Konto in die Rangliste'); return; }
  let g = vorhanden;
  if (g === undefined) {
    add('Tagesplatz wird geladen …');
    const r = await PS().rpc('dartfieber_rangliste', { p_tag: tagKey, p_anzahl: 1 });
    if (modus !== 'tag') return;
    if (!r || r.fehler || !r.daten) { el.textContent = 'Tagesplatz gerade nicht erreichbar'; return; }
    g = r.daten.ich || null; el.textContent = '';
  }
  if (!g) { add('Heute noch kein Ergebnis von dir'); return; }
  add('Heute: Platz '); add(g.platz + ' von ' + g.spieler, true);
  if (g.luecke) { add(' · noch '); add(String(g.luecke), true); add(' bis Platz ' + g.naechster_platz); } else if (g.platz === 1) add(' · du führst');
}

// ---------- Schleife ----------
let acc = 0, last = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(100, now - (last || now)); last = now;
  if (zustand === 'spiel') {
    acc += dt; let n = 0;
    while (acc >= TAKT && n++ < 6) {
      acc -= TAKT;
      const tipp = tippOffen && l.nimmtTipp(); tippOffen = false;
      if (tipp) tipps.push(l.s.t);
      const weiter = l.schritt(tipp);
      if (l.s.ev) ereignis(l.s.ev);
      if (!weiter) break;
    }
    if (acc > TAKT * 6) acc = 0;
  } else acc = 0;
  const f = dt / 16.67;
  if (schuettel > 0) schuettel = Math.max(0, schuettel - f);
  if (bonusBlitz > 0) bonusBlitz = Math.max(0, bonusBlitz - f);
  for (const q of partikel) { q.x += q.vx * f; q.y += q.vy * f; q.vy += 0.09 * f; q.l -= f; }
  partikel = partikel.filter((q) => q.l > 0);
  const jetzt = performance.now(); popups = popups.filter((p) => jetzt - p.t0 < 1500);
  if (lay) zeichne(zustand === 'spiel' ? acc / TAKT : 0, jetzt);
}

// ---------- Zeichnen ----------
function platzhalterPfeil(g, x, y, h, w) {   // technischer Platzhalter: schlichter Pfeil, Spitze bei (x, y)
  g.save(); g.translate(x, y);
  g.fillStyle = '#b9bfc4'; g.fillRect(-w * 0.03, 0, w * 0.06, h * 0.55);
  g.fillStyle = '#c9a24b'; g.fillRect(-w * 0.06, h * 0.12, w * 0.12, h * 0.3);
  g.fillStyle = '#2FD6C4';
  for (const sg of [-1, 1]) { g.beginPath(); g.moveTo(0, h * 0.62); g.lineTo(sg * w * 0.45, h * 0.98); g.lineTo(0, h * 0.9); g.closePath(); g.fill(); }
  g.restore();
}
function zeichne(alpha, jetzt) {
  const { w, h, dpr, B } = lay, sc = lay.sc;
  cx.setTransform(dpr, 0, 0, dpr, 0, 0); cx.clearRect(0, 0, w, h);
  if (!ch || !l) return;
  const s = l.s;
  cx.save();
  if (schuettel > 0) cx.translate((Math.random() - 0.5) * schuettel * 0.7, (Math.random() - 0.5) * schuettel * 0.7);
  // Scheibe
  if (off) cx.drawImage(off, px(ch.cx) - off.D / 2, py(ch.cy) - off.D / 2, off.D, off.D);
  // Vorige Treffer: die letzten beiden als Pfeil, ältere als kleiner Punkt
  const sz = B * 0.5;           // Bild 512 px, Spitze genau in der Mitte; der Pfeil selbst nimmt etwa 38 % ein
  treffer.forEach((t, i) => {
    const x = px(t.x), y = py(t.y);
    if (i < treffer.length - 2) { cx.fillStyle = 'rgba(246,244,238,.85)'; cx.strokeStyle = 'rgba(0,0,0,.6)'; cx.lineWidth = 1; cx.beginPath(); cx.arc(x, y, Math.max(2, B * 0.006), 0, 7); cx.fill(); cx.stroke(); }
    else if (bild.treff) cx.drawImage(bild.treff, x - sz / 2, y - sz / 2, sz, sz);
    else { cx.strokeStyle = '#2FD6C4'; cx.lineWidth = Math.max(2, B * 0.008); cx.beginPath(); cx.moveTo(x, y); cx.lineTo(x + sz * 0.22, y - sz * 0.3); cx.stroke(); cx.fillStyle = '#F6F4EE'; cx.beginPath(); cx.arc(x, y, Math.max(2, B * 0.006), 0, 7); cx.fill(); }
  });
  const ph = s.phase, K = ch.K;
  // Bonusziel (goldener Kreis), sichtbar solange der Wurf läuft
  const b = ch.bonus[Math.min(s.i, K.maxWuerfe - 1)];
  if (b && (ph === 'x' || ph === 'y' || ph === 'flug')) {
    const x = px(b.x), y = py(b.y), r = b.r * sc, puls = 1 + (WENIG_BEWEGUNG ? 0 : Math.sin(jetzt / 220) * 0.05);
    cx.save(); cx.shadowColor = '#FFD36B'; cx.shadowBlur = 16;
    cx.fillStyle = 'rgba(255,211,107,.22)'; cx.beginPath(); cx.arc(x, y, r * puls, 0, 7); cx.fill();
    cx.lineWidth = Math.max(2, r * 0.16); cx.strokeStyle = '#FFD36B'; cx.stroke(); cx.restore();
    if (r >= 8) { cx.fillStyle = '#FFF3C4'; cx.font = '700 ' + Math.round(r * 0.95) + 'px "Barlow Condensed",sans-serif'; cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.fillText('+' + K.bonusPfeile, x, y + 1); }
  }
  // Ziellinien: senkrechte (Seite), danach waagerechte (Höhe); alles in Feldeinheiten, Zeit über Takt + Zwischenschritt
  if (ph === 'x' || ph === 'y' || ph === 'flug') {
    const vv = tempoWurf(ch, s.i);
    let ax, ay;
    if (ph === 'x') ax = linie(K, ch.startX[s.i], vv, s.k + alpha);
    else ax = s.ax;
    if (ph === 'y') ay = linie(K, ch.startY[s.i], vv, s.k + alpha);
    else if (ph === 'flug') ay = s.ay;
    const gesamt = VIEW * sc;
    cx.save(); cx.lineCap = 'round'; cx.shadowColor = '#2FD6C4'; cx.shadowBlur = 10;
    cx.strokeStyle = ph === 'x' ? '#7FFFF0' : 'rgba(47,214,196,.9)'; cx.lineWidth = Math.max(2, B * 0.008);
    cx.beginPath(); cx.moveTo(px(ax), py(0) - gesamt); cx.lineTo(px(ax), py(0) + gesamt); cx.stroke();
    if (ph === 'y' || ph === 'flug') { cx.strokeStyle = ph === 'y' ? '#7FFFF0' : 'rgba(47,214,196,.9)'; cx.beginPath(); cx.moveTo(px(0) - gesamt, py(ay)); cx.lineTo(px(0) + gesamt, py(ay)); cx.stroke(); }
    if (ph === 'flug') { cx.shadowBlur = 0; cx.fillStyle = '#7FFFF0'; cx.beginPath(); cx.arc(px(ax), py(ay), Math.max(3, B * 0.012), 0, 7); cx.fill(); }
    cx.restore();
  }
  // Bereitliegender oder fliegender Pfeil (Ich-Perspektive; Spitze bei tip)
  const ah = lay.ah, aw = ah * 0.75, tip0 = { x: w / 2, y: h - ah + ah * 0.025 };
  const zeichnePfeil = (tx, ty, skala, winkel) => {
    cx.save(); cx.translate(tx, ty); cx.rotate(winkel); cx.scale(skala, skala);
    if (bild.pfeil) cx.drawImage(bild.pfeil, -aw / 2, -ah * 0.025, aw, ah); else platzhalterPfeil(cx, 0, 0, ah, aw);
    cx.restore();
  };
  if (ph === 'x' || ph === 'y' || zustand === 'bereit') zeichnePfeil(tip0.x, tip0.y, 1, 0);
  else if (ph === 'flug' && flug) {
    const u = Math.min(1, (s.k + alpha) / K.flugTicks), e = 1 - (1 - u) * (1 - u), tx = px(flug.hx), ty = py(flug.hy);
    const x = tip0.x + (tx - tip0.x) * e, y = tip0.y + (ty - tip0.y) * e - Math.sin(Math.PI * u) * B * 0.06;
    zeichnePfeil(x, y, 1 - 0.84 * e, ((tx - tip0.x) / B) * 0.3 * (1 - u));
  }
  // Funken
  for (const q of partikel) { cx.globalAlpha = Math.max(0, Math.min(1, q.l / 24)); cx.fillStyle = q.c; cx.fillRect(q.x - 2, q.y - 2, 4, 4); } cx.globalAlpha = 1;
  // Textmeldungen
  for (const p of popups) {
    const a = (jetzt - p.t0) / 1500, al = a < 0.1 ? a / 0.1 : a > 0.7 ? Math.max(0, (1 - a) / 0.3) : 1;
    const y = lay.oy + B * (0.17 + p.y * 0.1) - a * B * 0.05;
    cx.globalAlpha = al; cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.lineJoin = 'round';
    cx.font = '400 ' + Math.round(B * 0.085) + 'px "Dela Gothic One","Arial Black",sans-serif'; cx.lineWidth = Math.max(3, B * 0.012); cx.strokeStyle = 'rgba(8,16,24,.85)'; cx.strokeText(p.t, lay.mx, y); cx.fillStyle = p.c; cx.fillText(p.t, lay.mx, y);
    if (p.u) { cx.font = '700 ' + Math.round(B * 0.05) + 'px "Barlow Condensed",sans-serif'; cx.lineWidth = Math.max(2, B * 0.008); cx.strokeText(p.u, lay.mx, y + B * 0.07); cx.fillStyle = '#F6F4EE'; cx.fillText(p.u, lay.mx, y + B * 0.07); }
    cx.globalAlpha = 1;
  }
  if (zustand === 'bereit') {
    const y = lay.oy + B * 0.5; cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.font = '700 ' + Math.round(B * 0.07) + 'px "Barlow Condensed",sans-serif';
    const t = 'Tippen zum Start', tw = cx.measureText(t).width + B * 0.08;
    cx.fillStyle = 'rgba(8,16,24,.78)'; cx.beginPath(); cx.roundRect ? cx.roundRect(lay.mx - tw / 2, y - B * 0.06, tw, B * 0.12, B * 0.03) : cx.rect(lay.mx - tw / 2, y - B * 0.06, tw, B * 0.12); cx.fill();
    cx.globalAlpha = WENIG_BEWEGUNG ? 1 : 0.6 + 0.4 * Math.sin(jetzt / 300); cx.fillStyle = '#FFD36B'; cx.fillText(t.toUpperCase(), lay.mx, y + 1); cx.globalAlpha = 1;
  }
  cx.restore();
}

// ---------- Bedienung ----------
function zeige(id) { for (const x of ['sTitel', 'sEnde', 'sRang', 'sRegeln']) $(x).hidden = x !== id; }
function titel() {
  zustand = 'titel'; zeige('sTitel'); statusZeile('');
  const t = heuteLokal(); $('tTag').textContent = tagText(t);
  $('tBest').textContent = (store.tage[t] ? 'Heute: ' + store.tage[t] + ' · ' : '') + 'Bestwert: ' + store.best;
  l = null; ch = null; off = null; treffer = []; flug = null; leeresHud(); $('rang').textContent = '';
}
// Nur Anzeige auf dem Titel (die verbindliche Tageszeit kommt vom Server): Berliner Datum der Gerätezeit
function heuteLokal() {
  try { const p = new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()); const g = (t) => p.find((x) => x.type === t).value; return Number(g('year') + g('month') + g('day')); }
  catch (e) { const d = new Date(); return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate(); }
}
const spielt = () => zustand === 'bereit' || zustand === 'spiel';
cv.addEventListener('pointerdown', (e) => { e.preventDefault(); if (spielt()) tippen(); });
$('bStopp').addEventListener('pointerdown', (e) => { e.preventDefault(); if (spielt()) tippen(); });
$('bStopp').addEventListener('click', (e) => e.preventDefault());
addEventListener('keydown', (e) => {
  if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
  const k = e.key;
  if (spielt()) { if (k === ' ' || k === 'Enter' || k === 'ArrowDown') { e.preventDefault(); if (!e.repeat) tippen(); } }
  else if (zustand === 'ende' && (k === ' ' || k === 'Enter') && document.activeElement === document.body) { e.preventDefault(); startRunde(modus); }
});
$('bTag').addEventListener('click', () => startRunde('tag'));
$('bUeben').addEventListener('click', () => startRunde('ueben'));
$('bNochmal').addEventListener('click', () => startRunde(modus));
$('bMenue').addEventListener('click', titel);
$('bErneut').addEventListener('click', () => { if (letzteMeldung) sende(); });
$('bAnmelden').addEventListener('click', () => { const p = PS(); if (!p) return; if (gastGrund === 'kein_profil' && p.profilBearbeiten) p.profilBearbeiten(); else if (p.anmelden) p.anmelden({}); });
$('bRegeln').addEventListener('click', () => { zeige('sRegeln'); zustand = 'regeln'; });
$('bRegelnZu').addEventListener('click', titel);
$('bTeilen').addEventListener('click', async () => {
  const b = $('bTeilen'), url = location.origin + location.pathname.replace(/\/$/, '');
  const text = 'Ich habe ' + $('ePunkte').textContent + ' Punkte bei Dartfieber geschafft. Schaffst du mehr?';
  const fertig = (msg) => { b.textContent = msg; setTimeout(() => { b.textContent = 'Teilen'; }, 2500); };
  b.textContent = 'Teilen …';
  try { if (navigator.share) { await navigator.share({ title: 'Dartfieber', text, url }); b.textContent = 'Teilen'; return; } } catch (e) { if (e && e.name === 'AbortError') { b.textContent = 'Teilen'; return; } }
  try { await navigator.clipboard.writeText(text + ' ' + url); fertig('Link kopiert ✓'); } catch (e) { fertig(url); }
});
function tonKnopf() { $('bTon').setAttribute('aria-pressed', String(store.sound)); $('bTon').setAttribute('aria-label', store.sound ? 'Ton ausschalten' : 'Ton einschalten'); }
$('bTon').addEventListener('click', () => { store.sound = !store.sound; speichern(); tonKnopf(); ton.start(); });

// ---------- Rangliste (Tage blättern; früher Tage = Archiv) ----------
let rTage = [], rTag = null, rHeute = null, rVon = 'titel';
for (const id of ['bRang', 'bRang2']) $(id).addEventListener('click', () => oeffneRang(null));
$('bRangZu').addEventListener('click', () => (rVon === 'ende' && l ? (zustand = 'ende', zeige('sEnde')) : titel()));
$('rZurueck').addEventListener('click', () => blaettere(1));
$('rVor').addEventListener('click', () => blaettere(-1));
function blaettere(d) { const i = rTage.indexOf(rTag) + d; if (i >= 0 && i < rTage.length) ladeRang(rTage[i]); }
async function oeffneRang(tag) {
  rVon = zustand === 'ende' ? 'ende' : 'titel'; zustand = 'rang'; zeige('sRang');
  await ladeRang(tag);
  const p = PS();
  if (p && p.rpc && rHeute) {
    const r = await p.rpc('dartfieber_tage_liste', { p_anzahl: 60 });
    const alle = new Set([rHeute]); if (r && !r.fehler && Array.isArray(r.daten)) for (const t of r.daten) if (/^\d{8}$/.test(t)) alle.add(t);
    rTage = [...alle].sort().reverse(); knoepfe();
  }
}
function knoepfe() { const i = rTage.indexOf(rTag); $('rZurueck').disabled = i < 0 || i >= rTage.length - 1; $('rVor').disabled = i <= 0; }
async function ladeRang(tag) {
  const liste = $('rListe'), p = PS();
  liste.textContent = 'Lädt …'; $('rTag').textContent = tag ? tagText(tag) : 'Heute';
  if (!p || !p.online || !p.rpc) { liste.textContent = 'Die Rangliste ist gerade nicht verfügbar.'; return; }
  const gewuenscht = tag; rTag = tag;
  const res = await p.rpc('dartfieber_rangliste', { p_tag: tag, p_anzahl: 10 });
  if (rTag !== gewuenscht) return;
  if (!res || res.fehler || !res.daten) { liste.textContent = 'Rangliste gerade nicht erreichbar.'; return; }
  const d = res.daten; rTag = d.tag; if (!tag) { rHeute = d.tag; if (!rTage.includes(d.tag)) rTage = [d.tag, ...rTage]; }
  $('rTag').textContent = d.tag === rHeute ? 'Heute · ' + tagText(d.tag) : tagVoll(d.tag); knoepfe();
  liste.textContent = '';
  if (!d.zeilen.length) { liste.textContent = d.tag === rHeute ? 'Heute noch kein Eintrag. Sei der Erste!' : 'An diesem Tag gab es keine Einträge.'; return; }
  const av = p.avatare || []; let vorPos = 0;
  for (const r of d.zeilen) {
    if (vorPos && r.pos > vorPos + 1) { const g = document.createElement('li'); g.className = 'luecke'; g.textContent = '…'; liste.appendChild(g); }
    vorPos = r.pos;
    const li = document.createElement('li'); if (r.ich) li.className = 'ich';
    const emo = av[(parseInt(String(r.avatar || 'a1').slice(1), 10) || 1) - 1] || '🙂';
    const a = document.createElement('span'); a.className = 'pl'; a.textContent = String(r.platz);
    const b = document.createElement('span'); b.className = 'av'; b.textContent = emo;
    const c = document.createElement('span'); c.className = 'nm'; c.textContent = r.name + (r.ich ? ' (du)' : '');
    const e = document.createElement('b'); e.textContent = String(r.punkte);
    li.append(a, b, c, e); liste.appendChild(li);
  }
  $('rHinweis').textContent = d.ich && d.ich.luecke ? 'Dir fehlen ' + d.ich.luecke + ' Punkte bis Platz ' + d.ich.naechster_platz + '.' : 'Bester geprüfter Wert je Konto. Gleiche Punkte = gleicher Platz.';
}

// ---------- Start ----------
laden(); tonKnopf(); gr(); titel(); requestAnimationFrame(frame);
window.__df = {
  get zustand() { return zustand; }, get ch() { return ch; }, get lauf() { return l; }, get tipps() { return tipps; }, get runId() { return runId; },
  get modus() { return modus; }, get lay() { return lay; }, store: () => store, px, py, tippen,
  get platzhalter() { return bilderFehlen; }, scheibe: () => off
};
