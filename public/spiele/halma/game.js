// HALMA: Darstellung, Bedienung, Ton, Spielstand, Computergegner (im Web Worker) und Zu-zweit-Modus.
// Regeln und Suche stehen in engine.js. Aufbau wie DAME; Gegner-Bilder kommen aus ../muehle/img/,
// Brett und Steine aus img/. Fehlt ein Bild, zeichnet das Spiel einen Platzhalter.
import * as E from './engine.js';

const $ = (id) => document.getElementById(id);
const KEY = 'halma.v1';
const WENIG_BEWEGUNG = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
const URL_SPIEL = 'https://playsaal.com/spiele/halma';

export const GEGNER = {
  gemuetlich: { name: 'Opa Willi', stufe: 'Gemütlich', text: 'Zieht gemütlich los und trödelt mit dem einen oder anderen Stein.', bild: 'gegner-gemuetlich', kurz: 'W', pause: 650 },
  geuebt: { name: 'Tante Gisela', stufe: 'Geübt', text: 'Baut sich Sprungleitern und holt Nachzügler nach.', bild: 'gegner-geuebt', kurz: 'G', pause: 550 },
  meister: { name: 'Professor Mühlberg', stufe: 'Meister', text: 'Rechnet viele Züge voraus. Kein Zug zurück.', bild: 'gegner-meister', kurz: 'M', pause: 250 }
};
const STUFEN = Object.keys(GEGNER);

// ---------- Speicherstand (nur dieses Gerät; mit Konto wird er wie bei allen Spielen synchronisiert) ----------
let store = { v: 1, sound: true, ichZuerst: true, stats: {}, zwei: 0, offen: null };
const ganz = (x, max) => Math.max(0, Math.min(max, Math.floor(Number(x) || 0)));
function laden() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!d || typeof d !== 'object') return;
    store.sound = d.sound !== false;
    store.ichZuerst = d.ichZuerst !== false;
    store.zwei = ganz(d.zwei, 1e6);
    for (const k of STUFEN) { const x = d.stats && d.stats[k]; if (x && typeof x === 'object') store.stats[k] = { s: ganz(x.s, 1e6), u: ganz(x.u, 1e6), n: ganz(x.n, 1e6) }; }
    const o = d.offen;
    if (o && typeof o === 'object' && (o.modus === 'ki' || o.modus === 'zwei') && typeof o.z === 'string' && E.partieAus(o.z)) {
      store.offen = { modus: o.modus, stufe: STUFEN.includes(o.stufe) ? o.stufe : 'gemuetlich', mensch: o.mensch === 2 ? 2 : 1, z: o.z };
    }
  } catch (e) {}
}
function speichern() { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) {} }
const stat = (k) => store.stats[k] || (store.stats[k] = { s: 0, u: 0, n: 0 });

// ---------- Bilder ----------
const BILDER = { 'brett': 'halma/img/brett.webp', 'stein-hell': 'halma/img/stein-hell.webp', 'stein-dunkel': 'halma/img/stein-dunkel.webp', 'gegner-gemuetlich': 'muehle/img/gegner-gemuetlich.webp', 'gegner-geuebt': 'muehle/img/gegner-geuebt.webp', 'gegner-meister': 'muehle/img/gegner-meister.webp' };
const img = {};
for (const [n, src] of Object.entries(BILDER)) {
  const b = new Image(); b.decoding = 'async';
  b.onload = () => { img[n] = b; avatareAktualisieren(); };
  b.src = src;
}
function avatar(el, stufe) {
  const g = GEGNER[stufe];
  el.className = 'av'; el.style.backgroundImage = ''; el.style.backgroundSize = ''; el.textContent = g.kurz;
  if (img[g.bild]) { el.classList.add('bild'); el.style.backgroundImage = 'url(' + BILDER[g.bild] + ')'; }
}
function steinAvatar(el, p) {
  const n = p === 1 ? 'stein-hell' : 'stein-dunkel';
  el.className = 'av stein'; el.textContent = ''; el.style.backgroundSize = 'contain';
  el.style.backgroundImage = img[n] ? 'url(' + BILDER[n] + ')' : (p === 1 ? 'radial-gradient(circle at 40% 35%,#f6ead0,#c8a46a)' : 'radial-gradient(circle at 40% 35%,#7a5238,#2a170b)');
}
const avatareAktualisieren = () => { if (partie) panels(); stufenListe(); };

// ---------- Ton ----------
const ton = (() => {
  let ac = null;
  const an = () => store.sound && ac;
  const piep = (f, d, typ = 'sine', vol = 0.12, gleit = 0, nach = 0) => {
    if (!an()) return; const t = ac.currentTime + nach, o = ac.createOscillator(), g = ac.createGain();
    o.type = typ; o.frequency.setValueAtTime(f, t); if (gleit) o.frequency.exponentialRampToValueAtTime(gleit, t + d);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g).connect(ac.destination); o.start(t); o.stop(t + d + 0.03);
  };
  return {
    start() { try { if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)(); if (ac.state === 'suspended') ac.resume(); } catch (e) {} },
    tock() { piep(210, 0.09, 'triangle', 0.16, 120); piep(900, 0.025, 'square', 0.02); },
    wahl() { piep(660, 0.05, 'sine', 0.05); },
    sprung(n) { piep(420 + n * 90, 0.12, 'triangle', 0.09, 760 + n * 90); },
    nein() { piep(160, 0.1, 'square', 0.03); },
    sieg() { [523, 659, 784, 1047].forEach((f, i) => piep(f, 0.24, 'triangle', 0.1, 0, i * 0.11)); },
    verloren() { [440, 392, 330].forEach((f, i) => piep(f, 0.28, 'triangle', 0.08, 0, i * 0.16)); }
  };
})();

// ---------- Zustand ----------
let partie = null, modus = 'ki', stufe = 'gemuetlich', mensch = 1;
let wahlFeld = null, wahlZiele = [];   // angetippter Stein des Menschen und seine Zielfelder
let denkt = false, kiNr = 0, sperre = 0, vorbei = null, wackel = null;
let anim = null;           // { v, pfad: [[x,y]…], t0, dauer, nach }
let letzter = null;        // letzter Zug { v, n }

// ---------- Darstellung ----------
const cv = $('c'), cx = cv.getContext('2d');
// Das Brettbild (img/brett.webp, quadratisch mit Holzrahmen): das Raster beginnt bei GX/GY und ist GSX breit, GSY hoch (Anteile der Bildgröße)
const GX = 0.0236, GY = 0.0244, GSX = 0.9511, GSY = 0.9593;   // gemessen mit tools/halma-assets.py
let lay = { W: 0, H: 0, dpr: 1, x0: 0, y0: 0, S: 0, f: 0, fy: 0 };
function groesse() {
  const b = $('brett').getBoundingClientRect(), dpr = Math.min(2.5, window.devicePixelRatio || 1);
  cv.width = Math.round(b.width * dpr); cv.height = Math.round(b.height * dpr);
  const S = Math.max(160, Math.floor(Math.min(b.width, b.height)));
  lay = { W: b.width, H: b.height, dpr, S, f: S * GSX / E.N, fy: S * GSY / E.N, x0: Math.round((b.width - S) / 2), y0: Math.round((b.height - S) / 2) };
}
addEventListener('resize', groesse);
const gedreht = () => modus === 'ki' && mensch === 2;           // Brett so drehen, dass der Mensch unten links spielt
const ansicht = (i) => (gedreht() ? 255 - i : i);
const pos = (i) => { const j = ansicht(i); return [lay.x0 + lay.S * GX + ((j & 15) + 0.5) * lay.f, lay.y0 + lay.S * GY + ((j >> 4) + 0.5) * lay.fy]; };

function feldRechteck(i, farbe, alpha) {
  const j = ansicht(i), x = lay.x0 + lay.S * GX + (j & 15) * lay.f, y = lay.y0 + lay.S * GY + (j >> 4) * lay.fy;
  cx.save(); cx.globalAlpha = alpha; cx.fillStyle = farbe; cx.fillRect(x, y, lay.f, lay.fy); cx.restore();
}
function brett() {
  const { x0, y0, S } = lay;
  cx.save(); cx.shadowColor = 'rgba(0,0,0,.55)'; cx.shadowBlur = S * 0.04; cx.shadowOffsetY = S * 0.014;
  if (img.brett) cx.drawImage(img.brett, x0, y0, S, S);
  else { cx.fillStyle = '#5a361d'; cx.fillRect(x0, y0, S, S); }
  cx.restore();
  if (!img.brett) for (let i = 0; i < 256; i++) feldRechteck(i, ((i >> 4) + (i & 15)) & 1 ? '#6b4226' : '#e9cf9f', 1);
  // die beiden Lager leicht einfärben: hell unten links, dunkel oben rechts (je Ziel des anderen)
  for (const i of E.LAGER[1]) feldRechteck(i, '#fff3c8', 0.3);
  for (const i of E.LAGER[2]) feldRechteck(i, '#1b0e05', 0.34);
}
// Stein mit Fuß auf dem Feld: aufrecht, etwas höher als das Feld
function stein(x, y, p, alpha = 1, skala = 1) {
  const f = lay.f * skala, h = f * 1.0, n = p === 1 ? 'stein-hell' : 'stein-dunkel', im = img[n], w = im ? h * im.width / im.height : h * 0.6;
  cx.save(); cx.globalAlpha = alpha;
  cx.beginPath(); cx.ellipse(x + f * 0.05, y + f * 0.4, w * 0.5, f * 0.15, 0, 0, 7); cx.fillStyle = 'rgba(0,0,0,.4)'; cx.fill();
  if (im) cx.drawImage(im, x - w / 2, y + f * 0.44 - h, w, h);
  else { cx.beginPath(); cx.arc(x, y, f * 0.32, 0, 7); cx.fillStyle = p === 1 ? '#e8d3a8' : '#4a2c18'; cx.fill(); }
  cx.restore();
}
function ring(x, y, farbe, breite, alpha = 1) {
  cx.save(); cx.globalAlpha = alpha; cx.beginPath(); cx.ellipse(x, y + lay.f * 0.38, lay.f * 0.46, lay.f * 0.2, 0, 0, 7); cx.strokeStyle = farbe; cx.lineWidth = breite; cx.stroke(); cx.restore();
}
const menschAmZug = () => partie && !vorbei && !denkt && (modus === 'zwei' || partie.s.am === mensch);

function zeichne(jetzt) {
  cx.setTransform(lay.dpr, 0, 0, lay.dpr, 0, 0);
  cx.clearRect(0, 0, lay.W, lay.H);
  if (!lay.S) return;
  brett();
  if (!partie) return;
  const s = partie.s, b = s.b, puls = WENIG_BEWEGUNG ? 0.85 : 0.7 + 0.3 * Math.sin(jetzt / 180);
  if (letzter && !anim) { feldRechteck(letzter.v, '#FF9200', 0.25); feldRechteck(letzter.n, '#FF9200', 0.4); }
  const hilfe = menschAmZug() && !anim;
  if (hilfe && wahlFeld !== null) for (const t of wahlZiele) {
    const [tx, ty] = pos(t); cx.save(); cx.globalAlpha = 0.55 + puls * 0.45; cx.beginPath(); cx.arc(tx, ty, lay.f * 0.2, 0, 7); cx.fillStyle = '#FFD21C'; cx.fill(); cx.strokeStyle = 'rgba(60,30,0,.7)'; cx.lineWidth = 1; cx.stroke(); cx.restore();
  }
  // Steine von oben nach unten zeichnen, damit die unteren die oberen überdecken
  const reihe = [];
  for (let i = 0; i < 256; i++) if (b[i] && !(anim && i === anim.nach)) reihe.push(i);
  reihe.sort((a, c) => (ansicht(a) >> 4) - (ansicht(c) >> 4));
  for (const i of reihe) {
    const [x, y] = pos(i);
    let dx = 0; if (wackel && wackel.i === i) { const t = (jetzt - wackel.t0) / 300; if (t < 1) dx = Math.sin(t * 25) * lay.f * 0.15 * (1 - t); else wackel = null; }
    if (hilfe && i === wahlFeld) ring(x, y, '#FFD21C', Math.max(2, lay.f * 0.12));
    stein(x + dx, y - (hilfe && i === wahlFeld ? lay.f * 0.1 : 0), b[i]);
  }
  if (anim) {
    const n = anim.pfad.length - 1;
    let t = Math.max(0, Math.min(1, (jetzt - anim.t0) / anim.dauer)) * n; const k = Math.min(n - 1, Math.floor(t)); t -= k;
    const e = 1 - Math.pow(1 - t, 2), a = anim.pfad[k], z = anim.pfad[k + 1];
    const huepf = Math.sin(t * Math.PI) * lay.f * (anim.sprung ? 0.9 : 0.3);
    stein(a[0] + (z[0] - a[0]) * e, a[1] + (z[1] - a[1]) * e - huepf, anim.v, 1, 1 + Math.sin(t * Math.PI) * 0.12);
  }
}
function schleife(t) { zeichne(t); requestAnimationFrame(schleife); }

// ---------- Anzeige um das Brett ----------
function seiteInfo(p) {
  const teile = [modus === 'ki' && p !== mensch ? GEGNER[stufe].stufe : (p === 1 ? 'Hell' : 'Dunkel')];
  teile.push(E.imZielAnzahl(partie.s, p) + ' von ' + E.ANZ + ' im Ziel');
  return teile.join(' · ');
}
function panels() {
  if (!partie) return;
  const s = partie.s;
  for (const ort of ['Oben', 'Unten']) {
    const p = ort === 'Unten' ? (modus === 'ki' ? mensch : 1) : (modus === 'ki' ? 3 - mensch : 2);
    const istKi = modus === 'ki' && p !== mensch;
    if (istKi) avatar($('av' + ort), stufe); else steinAvatar($('av' + ort), p);
    $('n' + ort).textContent = istKi ? GEGNER[stufe].name : modus === 'ki' ? 'Du' : (p === 1 ? 'Spieler Hell' : 'Spieler Dunkel');
    const info = $('i' + ort);
    if (istKi && denkt) { info.textContent = 'überlegt …'; info.classList.add('denkt'); } else { info.textContent = seiteInfo(p); info.classList.remove('denkt'); }
    $('sp' + ort).classList.toggle('dran', !vorbei && s.am === p);
  }
  $('bZurueck').disabled = !(partie && !vorbei && !denkt && !anim && (rueckSchritte() > 0 || wahlFeld !== null));
  $('bZurueck').hidden = modus === 'ki' && stufe === 'meister';
}
function hinweis(text) { $('hinweis').innerHTML = text; }
function standardHinweis() {
  if (!partie) return;
  if (vorbei) { hinweis('Partie vorbei. <b>Menü</b> für eine neue Partie.'); return; }
  const p = partie.s.am, wer = modus === 'zwei' ? (p === 1 ? 'Hell: ' : 'Dunkel: ') : '';
  if (modus === 'ki' && p !== mensch) { hinweis(GEGNER[stufe].name + ' ist am Zug …'); return; }
  if (wahlFeld !== null) { hinweis(wer + 'Wohin? Tippe ein <b>gelbes</b> Feld an. Ketten springst du in einem Zug.'); return; }
  hinweis(wer + (partie.zuege.length < 2 ? 'Tippe einen Stein an. <b>Ziel ist die Ecke gegenüber.</b>' : 'Tippe einen deiner Steine an, den du ziehen willst.'));
}

// ---------- Partie ----------
function neuePartie(m, st, mn) {
  modus = m; stufe = st; mensch = mn;
  partie = E.neuePartie(); wahlFeld = null; wahlZiele = []; vorbei = null; letzter = null; anim = null; denkt = false; kiNr++;
  merken(); zeige(null); panels(); standardHinweis(); weiter();
}
function fortsetzen() {
  const o = store.offen; if (!o) return;
  const p = E.partieAus(o.z); if (!p) { store.offen = null; speichern(); return; }
  modus = o.modus; stufe = o.stufe; mensch = o.mensch;
  partie = p; wahlFeld = null; wahlZiele = []; vorbei = null; anim = null; denkt = false; kiNr++;
  letzter = p.zuege.length ? p.zuege[p.zuege.length - 1] : null;
  zeige(null); panels(); standardHinweis(); weiter();
}
function merken() { store.offen = partie && !vorbei ? { modus, stufe, mensch, z: E.partieText(partie) } : null; speichern(); }

function ausfuehren(m) {
  const s = partie.s, v = s.b[m.v], pfad = E.weg(s, m.v, m.n), sprung = pfad.length > 2;
  if (!E.spiele(partie, m)) return;
  const jetzt = performance.now(), schritte = pfad.length - 1;
  const proSchritt = sprung ? 240 : 200, dauer = WENIG_BEWEGUNG ? 0 : schritte * proSchritt;
  wahlFeld = null; wahlZiele = []; letzter = { v: m.v, n: m.n };
  if (dauer) anim = { v, pfad: pfad.map(pos), t0: jetzt, dauer, nach: m.n, sprung };
  sperre = jetzt + dauer + 80;
  if (dauer) for (let k = 0; k < schritte; k++) setTimeout(() => { if (sprung) ton.sprung(k); else ton.tock(); }, (k + 1) * proSchritt - 30);
  else ton.tock();
  setTimeout(() => { anim = null; }, dauer);
  merken(); panels(); standardHinweis();
  setTimeout(weiter, Math.max(0, sperre - jetzt));
}
function weiter() {
  if (!partie || vorbei) return;
  const st = E.status(partie);
  if (st.ende) { ende(st); return; }
  panels(); standardHinweis();
  if (modus === 'ki' && partie.s.am !== mensch) kiZiehen();
}

// ---------- Computergegner ----------
let worker = null, workerKaputt = false, wartet = null;
function holeWorker() {
  if (worker || workerKaputt) return worker;
  try {
    worker = new Worker(new URL('./ki.js', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => antwort(e.data);
    worker.onerror = () => { workerKaputt = true; worker = null; if (denkt) direktRechnen(kiNr); };
  } catch (e) { workerKaputt = true; worker = null; }
  return worker;
}
function kiZiehen() {
  denkt = true; panels(); standardHinweis();
  const nr = ++kiNr; wartet = { nr, start: performance.now() };
  const w = holeWorker(), seed = (Math.random() * 4294967296) >>> 0;
  if (w) w.postMessage({ id: nr, z: E.partieText(partie), stufe, seed });
  else setTimeout(() => direktRechnen(nr), 30);
}
function direktRechnen(nr) { if (!partie || nr !== kiNr) return; antwort({ id: nr, m: E.kiZug(partie.s, stufe) }); }
function antwort(d) {
  if (!d || !wartet || d.id !== wartet.nr || d.id !== kiNr || !partie || vorbei) return;
  const rest = Math.max(0, GEGNER[stufe].pause - (performance.now() - wartet.start)), m = d.m; wartet = null;
  setTimeout(() => {
    if (d.id !== kiNr || !partie) return;
    denkt = false;
    const s = partie.s, gueltig = m && s.b[m.v] === s.am && !s.b[m.n] && E.zielfelder(s, m.v).includes(m.n);
    ausfuehren(gueltig ? m : E.kiZug(s, 'gemuetlich'));
  }, rest);
}

// ---------- Bedienung ----------
function feldBei(x, y) {
  const c = Math.floor((x - lay.x0 - lay.S * GX) / lay.f), r = Math.floor((y - lay.y0 - lay.S * GY) / lay.fy);
  if (c < 0 || c > 15 || r < 0 || r > 15) return -1;
  const j = r * 16 + c; return gedreht() ? 255 - j : j;
}
function waehle(i) {
  const z = E.zielfelder(partie.s, i);
  if (!z.length) { wackel = { i, t0: performance.now() }; ton.nein(); hinweis('Dieser Stein ist <b>eingekeilt</b> und kann gerade nicht ziehen.'); return; }
  wahlFeld = i; wahlZiele = z; ton.wahl(); standardHinweis(); panels();
}
function tippe(i) {
  if (!menschAmZug() || anim || performance.now() < sperre || i < 0) return;
  const s = partie.s, b = s.b;
  if (b[i] === s.am) {
    if (wahlFeld === i) { wahlFeld = null; wahlZiele = []; standardHinweis(); panels(); return; }
    return waehle(i);
  }
  if (wahlFeld !== null && !b[i]) {
    if (wahlZiele.includes(i)) return ausfuehren({ v: wahlFeld, n: i });
    ton.nein(); hinweis('Dahin geht es nicht. Tippe ein <b>gelbes</b> Feld an.');
  }
}
cv.addEventListener('pointerdown', (e) => {
  ton.start();
  const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
  let i = feldBei(x, y);
  // Die Felder sind auf dem Handy klein: trifft der Finger knapp daneben, gilt das nächste gelbe Zielfeld in Reichweite
  if (wahlFeld !== null && menschAmZug() && i >= 0 && !partie.s.b[i] && !wahlZiele.includes(i)) {
    let best = -1, bd = lay.f * 0.95;
    for (const t of wahlZiele) { const [px, py] = pos(t), d = Math.hypot(px - x, py - y); if (d < bd) { bd = d; best = t; } }
    if (best >= 0) i = best;
  }
  tippe(i);
});

function rueckSchritte() {
  if (!partie || (modus === 'ki' && stufe === 'meister')) return 0;
  const n = partie.zuege.length;
  if (modus === 'zwei') return n > 0 ? 1 : 0;
  for (let k = n - 1; k >= 0; k--) if ((k % 2 === 0 ? 1 : 2) === mensch) return n - k;
  return 0;
}
$('bZurueck').addEventListener('click', () => {
  if (wahlFeld !== null) { wahlFeld = null; wahlZiele = []; standardHinweis(); panels(); return; }
  const k = rueckSchritte(); if (!k || denkt || anim) return;
  const p = E.partieAus(partie.zuege.slice(0, partie.zuege.length - k).map(E.kodiere).join('')); if (!p) return;
  partie = p; wahlFeld = null; wahlZiele = []; kiNr++;
  letzter = p.zuege.length ? p.zuege[p.zuege.length - 1] : null;
  ton.wahl(); merken(); panels(); standardHinweis(); weiter();
});

// ---------- Ende ----------
let ergebnisText = '';
function ende(st) {
  vorbei = st; denkt = false; store.offen = null;
  const grund = st.grund === 'zulang' ? '200 Züge ohne Sieger' : 'alle Steine im Ziel';
  let titel, text, sieg = false;
  if (modus === 'ki') {
    const g = GEGNER[stufe], x = stat(stufe);
    if (st.sieger === 0) { x.u++; titel = 'Remis'; text = 'Unentschieden gegen ' + g.name + ' (' + grund + ').'; ergebnisText = 'Remis gegen ' + g.name + ' (' + g.stufe + ') in Halma!'; }
    else if (st.sieger === mensch) { x.s++; sieg = true; titel = 'Gewonnen!'; text = 'Alle deine Steine sind im Ziel. ' + (stufe === 'meister' ? 'Respekt, der Professor ist geschlagen!' : 'Stark gespielt!'); ergebnisText = 'Ich habe ' + g.name + ' (' + g.stufe + ') in Halma geschlagen! Schaffst du das auch?'; }
    else { x.n++; titel = 'Verloren'; text = g.name + ' hat alle Steine im Ziel. Revanche?'; ergebnisText = g.name + ' (' + g.stufe + ') war in Halma zu stark für mich. Schaffst du es?'; }
    avatar($('eAv'), stufe);
    $('eZahlen').hidden = false; $('eS').textContent = x.s; $('eU').textContent = x.u; $('eN').textContent = x.n;
  } else {
    store.zwei++;
    titel = st.sieger === 0 ? 'Remis' : (st.sieger === 1 ? 'Hell' : 'Dunkel') + ' gewinnt!'; sieg = st.sieger !== 0;
    text = st.sieger === 0 ? 'Unentschieden: ' + grund + '.' : (st.sieger === 1 ? 'Hell' : 'Dunkel') + ' hat alle Steine im Ziel.';
    steinAvatar($('eAv'), st.sieger || 1);
    $('eZahlen').hidden = true; ergebnisText = 'Wir haben gerade Halma auf PlaySaal gespielt. Spielst du mit?';
  }
  speichern(); panels(); standardHinweis();
  setTimeout(() => {
    $('eTitel').textContent = titel; $('eTitel').className = 'ergebnis' + (sieg ? ' sieg' : '');
    $('eText').textContent = text;
    $('bRevanche').textContent = modus === 'ki' ? 'Revanche' : 'Neue Partie';
    if (sieg || st.sieger === 0) ton.sieg(); else ton.verloren();
    zeige('sEnde');
  }, 900);
}
async function teilen() {
  const b = $('bTeilen'), text = ergebnisText || 'Halma auf PlaySaal';
  try { if (navigator.share) { await navigator.share({ title: 'Halma · PlaySaal', text, url: URL_SPIEL }); return; } } catch (err) { if (err && err.name === 'AbortError') return; }
  try { await navigator.clipboard.writeText(text + ' ' + URL_SPIEL); b.textContent = 'Kopiert!'; setTimeout(() => (b.textContent = 'Teilen'), 1600); } catch (e) { b.textContent = 'Teilen'; }
}

// ---------- Schirme ----------
function zeige(id) { for (const x of ['sTitel', 'sStufe', 'sRegeln', 'sEnde']) $(x).hidden = x !== id; }
function titel() {
  kiNr++; denkt = false; wahlFeld = null; wahlZiele = [];
  if (partie && !vorbei) merken();
  $('bWeiter').hidden = !store.offen;
  if (store.offen) { const o = store.offen; $('bWeiter').textContent = 'Weiterspielen · ' + (o.modus === 'ki' ? GEGNER[o.stufe].name : 'zu zweit'); }
  zeige('sTitel');
}
function stufenListe() {
  const box = $('stufen'); if (!box) return;
  box.replaceChildren(...STUFEN.map((k) => {
    const g = GEGNER[k], x = stat(k), b = document.createElement('button');
    b.type = 'button'; b.className = 'stufe';
    const av = document.createElement('div'); avatar(av, k);
    const t = document.createElement('div');
    const bilanz = x.s + x.u + x.n ? x.s + (x.s === 1 ? ' Sieg' : ' Siege') + ' · ' + x.u + ' Remis · ' + x.n + (x.n === 1 ? ' Niederlage' : ' Niederlagen') : 'Noch nicht gespielt';
    t.innerHTML = '<b></b><span></span><small></small>';
    t.children[0].textContent = g.name + ' · ' + g.stufe; t.children[1].textContent = g.text; t.children[2].textContent = bilanz;
    b.append(av, t);
    b.addEventListener('click', () => { ton.start(); neuePartie('ki', k, store.ichZuerst ? 1 : 2); });
    return b;
  }));
}
function wahl() { $('wIch').setAttribute('aria-pressed', String(store.ichZuerst)); $('wKi').setAttribute('aria-pressed', String(!store.ichZuerst)); }
$('wIch').addEventListener('click', () => { store.ichZuerst = true; speichern(); wahl(); });
$('wKi').addEventListener('click', () => { store.ichZuerst = false; speichern(); wahl(); });
$('bComputer').addEventListener('click', () => { ton.start(); stufenListe(); wahl(); zeige('sStufe'); });
$('bStufeZu').addEventListener('click', titel);
$('bZwei').addEventListener('click', () => { ton.start(); neuePartie('zwei', stufe, 1); });
$('bWeiter').addEventListener('click', () => { ton.start(); fortsetzen(); });
$('bRegeln').addEventListener('click', () => zeige('sRegeln'));
$('bRegelnZu').addEventListener('click', titel);
$('bMenue').addEventListener('click', titel);
$('bEndeMenue').addEventListener('click', titel);
$('bTeilen').addEventListener('click', teilen);
$('bBrett').addEventListener('click', () => zeige(null));
$('bRevanche').addEventListener('click', () => { ton.start(); if (modus === 'ki') { store.ichZuerst = mensch !== 1; speichern(); neuePartie('ki', stufe, 3 - mensch); } else neuePartie('zwei', stufe, 1); });
const tonKnopf = () => $('bTon').setAttribute('aria-pressed', String(store.sound));
$('bTon').addEventListener('click', () => { store.sound = !store.sound; speichern(); tonKnopf(); if (store.sound) { ton.start(); ton.wahl(); } });

// ---------- Start ----------
laden(); tonKnopf(); groesse();
titel();
requestAnimationFrame(schleife);
window.__halma = { E, get partie() { return partie; }, get denkt() { return denkt; }, get vorbei() { return vorbei; }, tippe, pos, get mensch() { return mensch; } };
