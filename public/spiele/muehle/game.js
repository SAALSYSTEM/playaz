// MÜHLE: Darstellung, Bedienung, Ton, Spielstand, Computergegner (im Web Worker) und Zu-zweit-Modus.
// Regeln und Suche stehen in engine.js. Brett-Linien und Punkte zeichnet das Spiel selbst (exakte Tippflächen);
// Holz, Steine und Gegner-Bilder kommen aus img/. Fehlt ein Bild, zeichnet das Spiel einen Platzhalter.
import * as E from './engine.js';

const $ = (id) => document.getElementById(id);
const KEY = 'muehle.v1';
const WENIG_BEWEGUNG = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
const URL_SPIEL = 'https://playsaal.com/spiele/muehle';

export const GEGNER = {
  gemuetlich: { name: 'Opa Willi', stufe: 'Gemütlich', text: 'Spielt entspannt und übersieht auch mal eine Mühle.', bild: 'gegner-gemuetlich', kurz: 'W', pause: 650 },
  geuebt: { name: 'Tante Gisela', stufe: 'Geübt', text: 'Passt gut auf und nutzt deine Fehler aus.', bild: 'gegner-geuebt', kurz: 'G', pause: 550 },
  meister: { name: 'Professor Mühlberg', stufe: 'Meister', text: 'Rechnet viele Züge voraus. Kein Zug zurück.', bild: 'gegner-meister', kurz: 'M', pause: 250 }
};
const STUFEN = Object.keys(GEGNER);

// ---------- Speicherstand (nur dieses Gerät; mit Konto wird er wie bei allen Spielen synchronisiert) ----------
// stats[stufe] = { s: Siege, u: Remis, n: Niederlagen }; zwei = gespielte Partien zu zweit
// offen = laufende Partie { modus: 'ki'|'zwei', stufe, mensch: 1|2, z: Zugfolge } zum Weiterspielen
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
    if (o && typeof o === 'object' && (o.modus === 'ki' || o.modus === 'zwei') && typeof o.z === 'string' && o.z.length <= 3000 && E.partieAus(o.z)) {
      store.offen = { modus: o.modus, stufe: STUFEN.includes(o.stufe) ? o.stufe : 'gemuetlich', mensch: o.mensch === 2 ? 2 : 1, z: o.z };
    }
  } catch (e) {}
}
function speichern() { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) {} }
const stat = (k) => store.stats[k] || (store.stats[k] = { s: 0, u: 0, n: 0 });

// ---------- Bilder ----------
const BILDER = ['brett-holz', 'stein-hell', 'stein-dunkel', 'gegner-gemuetlich', 'gegner-geuebt', 'gegner-meister'];
const img = {};
for (const n of BILDER) {
  const b = new Image(); b.decoding = 'async';
  b.onload = () => { img[n] = b; avatareAktualisieren(); };
  b.src = 'muehle/img/' + n + '.webp';
}
function avatar(el, stufe) {
  const g = GEGNER[stufe];
  el.className = 'av'; el.style.backgroundImage = ''; el.textContent = g.kurz;
  if (img[g.bild]) { el.classList.add('bild'); el.style.backgroundImage = 'url(muehle/img/' + g.bild + '.webp)'; }
}
function steinAvatar(el, p) {
  const n = p === 1 ? 'stein-hell' : 'stein-dunkel';
  el.className = 'av stein'; el.textContent = '';
  el.style.backgroundImage = img[n] ? 'url(muehle/img/' + n + '.webp)' : (p === 1 ? 'radial-gradient(circle at 40% 35%,#f6ead0,#c8a46a)' : 'radial-gradient(circle at 40% 35%,#7a5238,#2a170b)');
}
const avatareAktualisieren = () => { if (partie) panels(); stufenListe(); };

// ---------- Ton (WebAudio, kurze synthetische Klänge) ----------
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
    muehle() { [660, 880, 1320].forEach((f, i) => piep(f, 0.22, 'triangle', 0.09, 0, i * 0.07)); },
    weg() { piep(520, 0.16, 'sine', 0.1, 130); },
    nein() { piep(160, 0.1, 'square', 0.03); },
    sieg() { [523, 659, 784, 1047].forEach((f, i) => piep(f, 0.24, 'triangle', 0.1, 0, i * 0.11)); },
    verloren() { [440, 392, 330].forEach((f, i) => piep(f, 0.28, 'triangle', 0.08, 0, i * 0.16)); }
  };
})();

// ---------- Zustand ----------
let partie = null, modus = 'ki', stufe = 'gemuetlich', mensch = 1;
let auswahl = -1;          // gewählter eigener Stein (Zugphase)
let schlag = null;         // Mühle geschlossen, wartet auf Wahl des Steins: { f, t, p, r: [Punkte] }
let denkt = false, kiNr = 0, sperre = 0, vorbei = null, wackel = null;
let anim = null;           // { p, von:[x,y], nach, t0, dauer }
let weg = [];              // { i, p, t0 }
let blitz = [];            // { m: Mühle, t0 }
let letzter = null;        // letzter Zug (Markierung)

// ---------- Darstellung ----------
const cv = $('c'), cx = cv.getContext('2d');
let lay = { W: 0, H: 0, dpr: 1, x0: 0, y0: 0, gr: 0, m: 0, sch: 0, R: 0 };
function groesse() {
  const b = $('brett').getBoundingClientRect(), dpr = Math.min(2.5, window.devicePixelRatio || 1);
  cv.width = Math.round(b.width * dpr); cv.height = Math.round(b.height * dpr);
  const gr = Math.max(120, Math.min(b.width, b.height)), m = gr * 0.075, sch = (gr - 2 * m) / 6;
  lay = { W: b.width, H: b.height, dpr, gr, m, sch, R: sch * 0.42, x0: (b.width - gr) / 2, y0: (b.height - gr) / 2 };
}
addEventListener('resize', groesse);
const pos = (i) => [lay.x0 + lay.m + E.PUNKTE[i][0] * lay.sch, lay.y0 + lay.m + E.PUNKTE[i][1] * lay.sch];
const unten = (p) => (modus === 'ki' ? p === mensch : p === 1);   // welche Seite unten sitzt

function rundRechteck(x, y, w, h, r) {
  cx.beginPath(); cx.moveTo(x + r, y); cx.arcTo(x + w, y, x + w, y + h, r); cx.arcTo(x + w, y + h, x, y + h, r); cx.arcTo(x, y + h, x, y, r); cx.arcTo(x, y, x + w, y, r); cx.closePath();
}
function brett() {
  const { x0, y0, gr } = lay, r = gr * 0.045;
  cx.save();
  cx.shadowColor = 'rgba(0,0,0,.55)'; cx.shadowBlur = gr * 0.05; cx.shadowOffsetY = gr * 0.018;
  rundRechteck(x0, y0, gr, gr, r); cx.fillStyle = '#c98f4f'; cx.fill();
  cx.shadowColor = 'transparent';
  cx.clip();
  if (img['brett-holz']) cx.drawImage(img['brett-holz'], x0, y0, gr, gr);
  else {
    const g = cx.createLinearGradient(x0, y0, x0 + gr, y0 + gr); g.addColorStop(0, '#dca868'); g.addColorStop(1, '#bf8546');
    cx.fillStyle = g; cx.fillRect(x0, y0, gr, gr);
    cx.strokeStyle = 'rgba(120,70,25,.18)'; cx.lineWidth = 1;
    for (let k = 0; k < 26; k++) { const yy = y0 + (k + 0.5) * gr / 26; cx.beginPath(); cx.moveTo(x0, yy); cx.bezierCurveTo(x0 + gr * 0.3, yy - 6, x0 + gr * 0.6, yy + 6, x0 + gr, yy - 2); cx.stroke(); }
  }
  // Rand innen etwas dunkler, wirkt wie eine Kante
  const v = cx.createRadialGradient(x0 + gr / 2, y0 + gr / 2, gr * 0.3, x0 + gr / 2, y0 + gr / 2, gr * 0.75);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(60,30,8,.28)'); cx.fillStyle = v; cx.fillRect(x0, y0, gr, gr);
  cx.restore();
  // Linien als eingefräste Rillen
  const lw = Math.max(2, lay.sch * 0.075);
  cx.lineCap = 'round';
  for (const [farbe, breite, dy] of [['rgba(255,236,200,.45)', lw, lw * 0.45], ['#3b2312', lw, 0]]) {
    cx.strokeStyle = farbe; cx.lineWidth = breite;
    for (const m of E.MUEHLEN) { const a = pos(m[0]), c = pos(m[2]); cx.beginPath(); cx.moveTo(a[0], a[1] + dy); cx.lineTo(c[0], c[1] + dy); cx.stroke(); }
  }
  for (let i = 0; i < 24; i++) { const [x, y] = pos(i); cx.beginPath(); cx.arc(x, y, lay.sch * 0.12, 0, 7); cx.fillStyle = '#3b2312'; cx.fill(); }
}
function stein(x, y, p, alpha = 1, skala = 1) {
  const R = lay.R * skala;
  cx.save(); cx.globalAlpha = alpha;
  cx.beginPath(); cx.ellipse(x + R * 0.08, y + R * 0.2, R * 0.98, R * 0.9, 0, 0, 7); cx.fillStyle = 'rgba(0,0,0,.35)'; cx.fill();
  const n = p === 1 ? 'stein-hell' : 'stein-dunkel';
  if (img[n]) cx.drawImage(img[n], x - R, y - R, R * 2, R * 2);
  else {
    const g = cx.createRadialGradient(x - R * 0.3, y - R * 0.35, R * 0.1, x, y, R);
    if (p === 1) { g.addColorStop(0, '#fbf1da'); g.addColorStop(1, '#c6a066'); } else { g.addColorStop(0, '#80583c'); g.addColorStop(1, '#25140a'); }
    cx.beginPath(); cx.arc(x, y, R, 0, 7); cx.fillStyle = g; cx.fill();
    cx.beginPath(); cx.arc(x, y, R * 0.72, 0, 7); cx.strokeStyle = p === 1 ? 'rgba(120,80,30,.35)' : 'rgba(0,0,0,.4)'; cx.lineWidth = R * 0.08; cx.stroke();
  }
  cx.restore();
}
function ring(x, y, farbe, breite, r = lay.R * 1.12, alpha = 1) {
  cx.save(); cx.globalAlpha = alpha; cx.beginPath(); cx.arc(x, y, r, 0, 7); cx.strokeStyle = farbe; cx.lineWidth = breite; cx.stroke(); cx.restore();
}
function leuchtLinie(m, a) {
  const p0 = pos(m[0]), p2 = pos(m[2]);
  cx.save(); cx.globalAlpha = a; cx.lineCap = 'round';
  cx.shadowColor = '#FF9200'; cx.shadowBlur = lay.sch * 0.5;
  cx.strokeStyle = '#FF9200'; cx.lineWidth = lay.sch * 0.14; cx.beginPath(); cx.moveTo(p0[0], p0[1]); cx.lineTo(p2[0], p2[1]); cx.stroke();
  cx.restore();
}
const menschAmZug = () => partie && !vorbei && !denkt && (modus === 'zwei' || partie.s.am === mensch);

function zeichne(jetzt) {
  cx.setTransform(lay.dpr, 0, 0, lay.dpr, 0, 0);
  cx.clearRect(0, 0, lay.W, lay.H);
  if (!lay.gr) return;
  brett();
  if (!partie) return;
  const s = partie.s, b = s.b, puls = WENIG_BEWEGUNG ? 0.85 : 0.7 + 0.3 * Math.sin(jetzt / 180);
  // Leuchtende Mühlen
  blitz = blitz.filter((x) => jetzt - x.t0 < 1300);
  for (const x of blitz) { const t = (jetzt - x.t0) / 1300; leuchtLinie(x.m, t < 0.15 ? t / 0.15 : 1 - (t - 0.15) / 0.85); }
  // Letzter Zug: Spur und Markierung
  if (letzter && !anim) {
    if (letzter.f >= 0) { const a = pos(letzter.f), c = pos(letzter.t); cx.save(); cx.setLineDash([lay.sch * 0.12, lay.sch * 0.12]); cx.strokeStyle = 'rgba(255,146,0,.6)'; cx.lineWidth = lay.sch * 0.06; cx.beginPath(); cx.moveTo(a[0], a[1]); cx.lineTo(c[0], c[1]); cx.stroke(); cx.restore(); const [x, y] = a; ring(x, y, 'rgba(255,146,0,.55)', lay.sch * 0.05, lay.sch * 0.18); }
  }
  // Steine
  for (let i = 0; i < 24; i++) {
    let p = b[i];
    if (schlag && i === schlag.f) p = 0;
    if (schlag && i === schlag.t) p = schlag.p;
    if (!p) continue;
    if (anim && anim.nach === i) continue;
    const [x, y] = pos(i);
    let dx = 0; if (wackel && wackel.i === i) { const t = (jetzt - wackel.t0) / 300; if (t < 1) dx = Math.sin(t * 25) * lay.R * 0.15 * (1 - t); else wackel = null; }
    stein(x + dx, y, p);
  }
  // geschlagene Steine verblassen
  weg = weg.filter((x) => jetzt - x.t0 < 450);
  for (const x of weg) { const t = Math.max(0, (jetzt - x.t0) / 450); const [px, py] = pos(x.i); stein(px, py - t * lay.R * 0.6, x.p, 1 - t, 1 + t * 0.25); }
  // Stein in Bewegung
  if (anim) {
    let t = Math.min(1, (jetzt - anim.t0) / anim.dauer); t = 1 - Math.pow(1 - t, 3);
    const z = pos(anim.nach), x = anim.von[0] + (z[0] - anim.von[0]) * t, y = anim.von[1] + (z[1] - anim.von[1]) * t;
    stein(x, y - Math.sin(t * Math.PI) * lay.R * 0.5, anim.p, 1, 1 + Math.sin(t * Math.PI) * 0.12);
  }
  if (letzter && !anim && !schlag) { const [x, y] = pos(letzter.t); cx.beginPath(); cx.arc(x, y, lay.R * 0.16, 0, 7); cx.fillStyle = 'rgba(255,146,0,.9)'; cx.fill(); }
  // Hilfen für den Menschen am Zug
  if (menschAmZug() && !anim) {
    if (schlag) for (const i of schlag.r) { const [x, y] = pos(i); ring(x, y, '#FF9200', lay.sch * 0.09, lay.R * 1.14, puls); }
    else if (auswahl >= 0) {
      const [x, y] = pos(auswahl); ring(x, y, '#FFD21C', lay.sch * 0.09);
      for (const m of E.zuege(s)) if (m.f === auswahl) { const [tx, ty] = pos(m.t); cx.save(); cx.globalAlpha = 0.5 + puls * 0.5; cx.beginPath(); cx.arc(tx, ty, lay.sch * 0.17, 0, 7); cx.fillStyle = '#FFD21C'; cx.fill(); cx.restore(); }
    }
  }
}
function schleife(t) { zeichne(t); requestAnimationFrame(schleife); }

// ---------- Anzeige um das Brett ----------
function seiteInfo(p) {
  const s = partie.s;
  const teile = [];
  if (modus === 'ki' && p !== mensch) { teile.push(GEGNER[stufe].stufe); }
  else teile.push(p === 1 ? 'Hell' : 'Dunkel');
  if (E.zugphase(s) || s.hand[p] === 0) teile.push(E.steine(s, p) + ' Steine');
  if (E.springt(s, p)) teile.push('springt');
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
    const v = $('v' + ort); v.className = 'vorrat' + (p === 2 ? ' dunkel' : '');
    if (s.hand[p] > 0) { v.hidden = false; v.replaceChildren(...Array.from({ length: E.STEINE }, (_, k) => { const i = document.createElement('i'); if (k >= s.hand[p]) i.className = 'weg'; return i; })); }
    else v.hidden = true;
  }
  const zurueckOk = !!partie && !vorbei && !denkt && !anim && rueckSchritte() > 0;
  $('bZurueck').disabled = !zurueckOk;
  $('bZurueck').hidden = modus === 'ki' && stufe === 'meister';
}
function hinweis(text) { $('hinweis').innerHTML = text; }
function standardHinweis() {
  if (!partie) return;
  if (vorbei) { hinweis('Partie vorbei. <b>Menü</b> für eine neue Partie.'); return; }
  const s = partie.s, p = s.am;
  const wer = modus === 'zwei' ? (p === 1 ? 'Hell: ' : 'Dunkel: ') : '';
  if (modus === 'ki' && p !== mensch) { hinweis(GEGNER[stufe].name + ' ist am Zug …'); return; }
  if (schlag) { hinweis(wer + '<b>Mühle!</b> Tippe einen gegnerischen Stein an, um ihn zu nehmen.'); return; }
  if (s.hand[p] > 0) { hinweis(wer + 'Setze einen Stein auf einen freien Punkt <b>(' + s.hand[p] + ' übrig)</b>.'); return; }
  if (E.springt(s, p)) { hinweis(wer + (auswahl >= 0 ? 'Wohin? <b>Springen</b> geht auf jeden freien Punkt.' : 'Nur noch 3 Steine: Du darfst <b>springen</b>. Stein antippen.')); return; }
  hinweis(wer + (auswahl >= 0 ? 'Wohin? Tippe ein <b>gelb markiertes</b> Feld an.' : 'Tippe einen deiner Steine an, den du ziehen willst.'));
}

// ---------- Partie ----------
function neuePartie(m, st, mn) {
  modus = m; stufe = st; mensch = mn;
  partie = E.neuePartie(); auswahl = -1; schlag = null; vorbei = null; letzter = null; anim = null; weg = []; blitz = []; denkt = false; kiNr++;
  merken(); zeige(null); panels(); standardHinweis(); weiter();
}
function fortsetzen() {
  const o = store.offen; if (!o) return;
  const p = E.partieAus(o.z); if (!p) { store.offen = null; speichern(); return; }
  modus = o.modus; stufe = o.stufe; mensch = o.mensch;
  partie = p; auswahl = -1; schlag = null; vorbei = null; anim = null; weg = []; blitz = []; denkt = false; kiNr++;
  letzter = p.zuege.length ? p.zuege[p.zuege.length - 1] : null;
  zeige(null); panels(); standardHinweis(); weiter();
}
function merken() { store.offen = partie && !vorbei ? { modus, stufe, mensch, z: E.partieText(partie) } : null; speichern(); }

function herkunft(p, f) {
  if (f >= 0) return pos(f);
  // Gesetzte Steine kommen von der Seite des Spielers ins Bild
  const x = lay.x0 + lay.gr / 2, y = unten(p) ? lay.y0 + lay.gr + lay.sch : lay.y0 - lay.sch;
  return [x, y];
}
function ausfuehren(m, schonGezeigt = false) {
  const s = partie.s, p = s.am, gesetztVorher = schonGezeigt;
  if (!E.spiele(partie, m)) return;
  const jetzt = performance.now();
  const dauer = gesetztVorher || WENIG_BEWEGUNG ? 0 : (m.f < 0 ? 260 : 220);
  schlag = null; auswahl = -1; letzter = m;
  if (dauer) anim = { p, von: herkunft(p, m.f), nach: m.t, t0: jetzt, dauer };
  sperre = jetzt + dauer + (m.r >= 0 ? 380 : 60);
  setTimeout(() => { anim = null; if (!gesetztVorher) ton.tock(); }, dauer);
  if (m.r >= 0) {
    setTimeout(() => {
      const t = performance.now();
      for (const mi of E.MUEHLEN_AN[m.t]) { const mm = E.MUEHLEN[mi]; if (mm.every((q) => partie.s.b[q] === p)) blitz.push({ m: mm, t0: t }); }
      weg.push({ i: m.r, p: 3 - p, t0: t + 120 });
      ton.muehle(); setTimeout(() => ton.weg(), 160);
    }, dauer);
  }
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
let worker = null, workerKaputt = false;
function holeWorker() {
  if (worker || workerKaputt) return worker;
  try {
    worker = new Worker(new URL('./ki.js', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => antwort(e.data);
    worker.onerror = () => { workerKaputt = true; worker = null; if (denkt) direktRechnen(kiNr); };
  } catch (e) { workerKaputt = true; worker = null; }
  return worker;
}
let wartet = null;
function kiZiehen() {
  denkt = true; panels(); standardHinweis();
  const nr = ++kiNr, start = performance.now();
  wartet = { nr, start };
  const w = holeWorker();
  const seed = (Math.random() * 4294967296) >>> 0;
  if (w) w.postMessage({ id: nr, z: E.partieText(partie), stufe, seed });
  else setTimeout(() => direktRechnen(nr), 30);
}
function direktRechnen(nr) {
  if (!partie || nr !== kiNr) return;
  const m = E.kiZug(partie.s, stufe, { gesehen: partie.wdh });
  antwort({ id: nr, m });
}
function antwort(d) {
  if (!d || !wartet || d.id !== wartet.nr || d.id !== kiNr || !partie || vorbei) return;
  const rest = Math.max(0, GEGNER[stufe].pause - (performance.now() - wartet.start));
  const m = d.m; wartet = null;
  setTimeout(() => {
    if (d.id !== kiNr || !partie) return;
    denkt = false;
    const gueltig = m && E.zuege(partie.s).find((x) => E.gleich(x, m));
    ausfuehren(gueltig || E.kiZug(partie.s, 'gemuetlich', { gesehen: partie.wdh }));
  }, rest);
}

// ---------- Bedienung ----------
function punktBei(x, y) {
  let best = -1, bd = (lay.sch * 0.55) ** 2;
  for (let i = 0; i < 24; i++) { const [px, py] = pos(i), d = (px - x) ** 2 + (py - y) ** 2; if (d < bd) { bd = d; best = i; } }
  return best;
}
function tippe(i) {
  if (!menschAmZug() || anim || performance.now() < sperre || i < 0) return;
  const s = partie.s, p = s.am, b = s.b, liste = E.zuege(s);
  if (schlag) {
    if (schlag.r.includes(i)) { ausfuehren({ f: schlag.f, t: schlag.t, r: i }, true); return; }
    if (i === schlag.t) { schlag = null; ton.wahl(); standardHinweis(); return; }   // Stein zurücknehmen und anders setzen
    if (b[i] === 3 - p) { wackel = { i, t0: performance.now() }; ton.nein(); hinweis('Dieser Stein steht in einer Mühle und ist geschützt. Nimm einen <b>markierten</b> Stein.'); }
    return;
  }
  if (s.hand[p] > 0) {
    if (b[i]) { if (b[i] === p) { wackel = { i, t0: performance.now() }; ton.nein(); } return; }
    vorbereiten(liste.filter((m) => m.t === i), p);
    return;
  }
  if (b[i] === p) {
    if (auswahl === i) { auswahl = -1; standardHinweis(); return; }
    if (liste.some((m) => m.f === i)) { auswahl = i; ton.wahl(); standardHinweis(); }
    else { wackel = { i, t0: performance.now() }; ton.nein(); hinweis('Dieser Stein ist eingeklemmt. Nimm einen anderen.'); }
    return;
  }
  if (auswahl >= 0 && !b[i]) {
    const kand = liste.filter((m) => m.f === auswahl && m.t === i);
    if (!kand.length) { ton.nein(); hinweis(E.springt(s, p) ? 'Da geht es nicht hin.' : 'Steine ziehen nur entlang einer Linie auf den <b>nächsten</b> freien Punkt.'); return; }
    vorbereiten(kand, p);
  }
}
function vorbereiten(kand, p) {
  if (!kand.length) return;
  if (kand[0].r >= 0) {
    schlag = { f: kand[0].f, t: kand[0].t, p, r: kand.map((m) => m.r) }; auswahl = -1;
    ton.tock(); setTimeout(() => ton.muehle(), 60);
    const t = performance.now(), b = Int8Array.from(partie.s.b); if (schlag.f >= 0) b[schlag.f] = 0; b[schlag.t] = p;
    for (const mi of E.MUEHLEN_AN[schlag.t]) { const mm = E.MUEHLEN[mi]; if (mm.every((q) => b[q] === p)) blitz.push({ m: mm, t0: t }); }
    standardHinweis(); panels();
    return;
  }
  ausfuehren(kand[0]);
}
cv.addEventListener('pointerdown', (e) => {
  ton.start();
  const r = cv.getBoundingClientRect();
  tippe(punktBei(e.clientX - r.left, e.clientY - r.top));
});

// Wie viele Halbzüge „Zug zurück“ entfernt (0 = nicht möglich)
function rueckSchritte() {
  if (!partie || (modus === 'ki' && stufe === 'meister')) return 0;
  const n = partie.zuege.length;
  if (modus === 'zwei') return n > 0 ? 1 : 0;
  // gegen Computer: bis zum letzten eigenen Zug zurück
  for (let k = n - 1; k >= 0; k--) if ((k % 2 === 0 ? 1 : 2) === mensch) return n - k;
  return 0;
}
$('bZurueck').addEventListener('click', () => {
  if (schlag) { schlag = null; standardHinweis(); panels(); return; }
  const k = rueckSchritte(); if (!k || denkt || anim) return;
  const text = E.partieText(partie).slice(0, -3 * k);
  const p = E.partieAus(text); if (!p) return;
  partie = p; auswahl = -1; schlag = null; kiNr++;
  letzter = p.zuege.length ? p.zuege[p.zuege.length - 1] : null;
  ton.wahl(); merken(); panels(); standardHinweis(); weiter();
});

// ---------- Ende ----------
let ergebnisText = '';
function ende(st) {
  vorbei = st; denkt = false; store.offen = null;
  const grund = { steine: 'nur noch 2 Steine', blockiert: 'kein Zug mehr möglich', wiederholung: 'dreimal dieselbe Stellung', ruhig: '50 Züge ohne Schlagen' }[st.grund] || '';
  let titel, text, sieg = false;
  if (modus === 'ki') {
    const g = GEGNER[stufe], x = stat(stufe);
    if (st.sieger === 0) { x.u++; titel = 'Remis'; text = 'Unentschieden gegen ' + g.name + ' (' + grund + ').'; ergebnisText = 'Remis gegen ' + g.name + ' (' + g.stufe + ') in Mühle!'; }
    else if (st.sieger === mensch) { x.s++; sieg = true; titel = 'Gewonnen!'; text = g.name + ' hat ' + grund + '. ' + (stufe === 'meister' ? 'Respekt, der Professor ist geschlagen!' : 'Stark gespielt!'); ergebnisText = 'Ich habe ' + g.name + ' (' + g.stufe + ') in Mühle geschlagen! Schaffst du das auch?'; }
    else { x.n++; titel = 'Verloren'; text = 'Du hast ' + grund + '. Revanche?'; ergebnisText = g.name + ' (' + g.stufe + ') war in Mühle zu stark für mich. Schaffst du es?'; }
    avatar($('eAv'), stufe);
    $('eZahlen').hidden = false; $('eS').textContent = x.s; $('eU').textContent = x.u; $('eN').textContent = x.n;
  } else {
    store.zwei++;
    titel = st.sieger === 0 ? 'Remis' : (st.sieger === 1 ? 'Hell' : 'Dunkel') + ' gewinnt!'; sieg = st.sieger !== 0;
    text = st.sieger === 0 ? 'Unentschieden: ' + grund + '.' : (st.sieger === 1 ? 'Dunkel' : 'Hell') + ' hat ' + grund + '.';
    steinAvatar($('eAv'), st.sieger || 1);
    $('eZahlen').hidden = true; ergebnisText = 'Wir haben gerade Mühle auf PlaySaal gespielt. Spielst du mit?';
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
  const b = $('bTeilen'), text = ergebnisText || 'Mühle auf PlaySaal';
  try { if (navigator.share) { await navigator.share({ title: 'Mühle · PlaySaal', text, url: URL_SPIEL }); return; } } catch (err) { if (err && err.name === 'AbortError') return; }
  try { await navigator.clipboard.writeText(text + ' ' + URL_SPIEL); b.textContent = 'Kopiert!'; setTimeout(() => (b.textContent = 'Teilen'), 1600); } catch (e) { b.textContent = 'Teilen'; }
}

// ---------- Schirme ----------
function zeige(id) { for (const x of ['sTitel', 'sStufe', 'sRegeln', 'sEnde']) $(x).hidden = x !== id; }
function titel() {
  kiNr++; denkt = false;
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
// Ohne laufende Partie ein leeres Brett hinter dem Menü zeigen
partie = null;
titel();
requestAnimationFrame(schleife);
// Für Tests und Fehlersuche
window.__muehle = { E, get partie() { return partie; }, get denkt() { return denkt; }, get vorbei() { return vorbei; }, tippe, pos, get modus() { return modus; }, get mensch() { return mensch; } };
