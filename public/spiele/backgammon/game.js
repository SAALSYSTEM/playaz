// BACKGAMMON: Darstellung, Bedienung, Ton, Spielstand, Computergegner (Web Worker) und Zu-zweit-Modus.
// Aufbau wie MÜHLE und DAME. Brett und Würfel zeichnet das Spiel selbst (auf dem Mühle-Holz),
// Steine und Gegner-Bilder kommen aus ../muehle/img/.
//
// Hochformat: Das Brett liegt quer. Linke Spalte oben 11…6, unten 5…0 (Heimfeld Hell), rechte Spalte oben 12…17,
// unten 18…23 (Heimfeld Dunkel). Hell zieht rechts hoch, oben hinüber und links hinunter. Spielt der Mensch Dunkel,
// werden die Spalten gespiegelt, damit sein Weg genauso läuft. Mittelreihe = Bande und Würfel, unten das Feld „Raus“.
import * as E from './engine.js';

const $ = (id) => document.getElementById(id);
const KEY = 'backgammon.v1';
const WENIG_BEWEGUNG = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
const URL_SPIEL = 'https://playsaal.com/spiele/backgammon';

export const GEGNER = {
  gemuetlich: { name: 'Opa Willi', stufe: 'Gemütlich', text: 'Würfelt gemütlich und lässt gern mal Steine offen stehen.', bild: 'gegner-gemuetlich', kurz: 'W', pause: 600 },
  geuebt: { name: 'Tante Gisela', stufe: 'Geübt', text: 'Baut Blockaden und schlägt, wo sie kann.', bild: 'gegner-geuebt', kurz: 'G', pause: 500 },
  meister: { name: 'Professor Mühlberg', stufe: 'Meister', text: 'Rechnet deine Würfe mit. Frühere Züge lassen sich nicht zurücknehmen.', bild: 'gegner-meister', kurz: 'M', pause: 300 }
};
const STUFEN = Object.keys(GEGNER);

// ---------- Speicherstand ----------
let store = { v: 1, sound: true, ichZuerst: true, stats: {}, zwei: 0, offen: null };
const ganz = (x, max) => Math.max(0, Math.min(max, Math.floor(Number(x) || 0)));
const wurfOk = (w) => Array.isArray(w) && w.length === 2 && w.every((x) => Number.isInteger(x) && x >= 1 && x <= 6);
function laden() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!d || typeof d !== 'object') return;
    store.sound = d.sound !== false; store.ichZuerst = d.ichZuerst !== false; store.zwei = ganz(d.zwei, 1e6);
    for (const k of STUFEN) { const x = d.stats && d.stats[k]; if (x && typeof x === 'object') store.stats[k] = { s: ganz(x.s, 1e6), n: ganz(x.n, 1e6), g: ganz(x.g, 1e6) }; }
    const o = d.offen;
    if (o && typeof o === 'object' && (o.modus === 'ki' || o.modus === 'zwei') && typeof o.z === 'string' && E.partieAus(o.z))
      store.offen = { modus: o.modus, stufe: STUFEN.includes(o.stufe) ? o.stufe : 'gemuetlich', mensch: o.mensch === 2 ? 2 : 1, z: o.z, wurf: wurfOk(o.wurf) ? o.wurf : null };
  } catch (e) {}
}
function speichern() { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) {} }
const stat = (k) => store.stats[k] || (store.stats[k] = { s: 0, n: 0, g: 0 });

// ---------- Bilder ----------
const BILDER = { 'holz': 'muehle/img/brett-holz.webp', 'stein-hell': 'muehle/img/stein-hell.webp', 'stein-dunkel': 'muehle/img/stein-dunkel.webp', 'gegner-gemuetlich': 'muehle/img/gegner-gemuetlich.webp', 'gegner-geuebt': 'muehle/img/gegner-geuebt.webp', 'gegner-meister': 'muehle/img/gegner-meister.webp' };
const img = {};
for (const [n, src] of Object.entries(BILDER)) { const b = new Image(); b.decoding = 'async'; b.onload = () => { img[n] = b; avatareAktualisieren(); }; b.src = src; }
function avatar(el, stufe) {
  const g = GEGNER[stufe];
  el.className = 'av'; el.style.backgroundImage = ''; el.textContent = g.kurz;
  if (img[g.bild]) { el.classList.add('bild'); el.style.backgroundImage = 'url(' + BILDER[g.bild] + ')'; }
}
function steinAvatar(el, p) {
  const n = p === 1 ? 'stein-hell' : 'stein-dunkel';
  el.className = 'av stein'; el.textContent = '';
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
  const klack = (nach, f) => piep(f, 0.035, 'square', 0.035, f * 0.6, nach);
  return {
    start() { try { if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)(); if (ac.state === 'suspended') ac.resume(); } catch (e) {} },
    wurf() { for (let k = 0; k < 7; k++) klack(k * 0.06 + Math.random() * 0.02, 700 + Math.random() * 500); },
    tock() { piep(210, 0.09, 'triangle', 0.16, 120); piep(900, 0.025, 'square', 0.02); },
    wahl() { piep(660, 0.05, 'sine', 0.05); },
    schlag() { piep(520, 0.16, 'sine', 0.1, 130); piep(260, 0.12, 'triangle', 0.08); },
    raus() { piep(880, 0.12, 'triangle', 0.07, 1320); },
    nein() { piep(160, 0.1, 'square', 0.03); },
    sieg() { [523, 659, 784, 1047].forEach((f, i) => piep(f, 0.24, 'triangle', 0.1, 0, i * 0.11)); },
    verloren() { [440, 392, 330].forEach((f, i) => piep(f, 0.28, 'triangle', 0.08, 0, i * 0.16)); }
  };
})();

// ---------- Zustand ----------
let partie = null, modus = 'ki', stufe = 'gemuetlich', mensch = 1;
let wurf = null;           // aktueller Wurf der Seite am Zug
let liste = null;          // erlaubte vollständige Züge zum Wurf
let teil = [];             // schon gezogene Teilzüge (Mensch) bzw. laufende Animation (Computer)
let auswahl = -1;          // gewählter Startpunkt (24 = Bande)
let denkt = false, kiNr = 0, sperre = 0, vorbei = null, rollt = 0, wackel = null;
let anim = null;           // { p, von:[x,y], nach:[x,y], t0, dauer }

// ---------- Geometrie ----------
const cv = $('c'), cx = cv.getContext('2d');
let lay = { W: 0, H: 0, dpr: 1, x0: 0, y0: 0, w: 0, h: 0, zeile: 0, spalte: 0, mitte: 0, d: 0, raus: 0 };
function groesse() {
  const b = $('brett').getBoundingClientRect(), dpr = Math.min(2.5, window.devicePixelRatio || 1);
  cv.width = Math.round(b.width * dpr); cv.height = Math.round(b.height * dpr);
  // 13 Zeilen (12 Punkte + Bande) und 1,2 Zeilen „Raus“; in jeder Spalte sollen 5 Steine nebeneinander passen
  const zeile = Math.max(14, Math.min((b.height - 12) / 14.4, (b.width - 12) / 11.6));   // 6 px Rand für den Rahmen
  const w = Math.min(b.width, zeile * 11.6 + 12), h = zeile * 14.4;
  const mitte = Math.max(6, zeile * 0.3);
  lay = { W: b.width, H: b.height, dpr, w, h, zeile, mitte, spalte: (w - mitte) / 2, d: zeile * 0.92, raus: zeile * 1.2, x0: (b.width - w) / 2, y0: Math.max(6, (b.height - h) / 2) };
}
addEventListener('resize', groesse);
const gespiegelt = () => modus === 'ki' && mensch === 2;
function ort(i) {   // Punkt -> { spalte 0/1, zeile 0..12 }
  let sp, z;
  if (i <= 5) { sp = 0; z = 12 - i; } else if (i <= 11) { sp = 0; z = 11 - i; } else if (i <= 17) { sp = 1; z = i - 12; } else { sp = 1; z = i - 11; }
  if (gespiegelt()) sp = 1 - sp;
  return { sp, z };
}
const zeileY = (z) => lay.y0 + (z + 0.5) * lay.zeile;
const randX = (sp) => (sp === 0 ? lay.x0 : lay.x0 + lay.w);
// Mittelpunkt des k-ten Steins auf Punkt i (von außen nach innen gestapelt)
function steinPos(i, k) {
  const { sp, z } = ort(i), sichtbar = Math.min(k, 4);
  const x = sp === 0 ? lay.x0 + lay.d * (sichtbar + 0.55) : lay.x0 + lay.w - lay.d * (sichtbar + 0.55);
  return [x, zeileY(z)];
}
const heimSpalte = (p) => ort(p === 1 ? 0 : 23).sp;
function bandePos(p, k) {   // Bande in der Mittelreihe, jede Farbe auf der Seite ihres Heimfelds
  const sp = heimSpalte(p), x = sp === 0 ? lay.x0 + lay.d * (Math.min(k, 2) + 0.55) : lay.x0 + lay.w - lay.d * (Math.min(k, 2) + 0.55);
  return [x, zeileY(6)];
}
function rausBox(p) { const sp = heimSpalte(p); return { x: sp === 0 ? lay.x0 : lay.x0 + lay.spalte + lay.mitte, y: lay.y0 + 13 * lay.zeile + lay.zeile * 0.1, w: lay.spalte, h: lay.raus - lay.zeile * 0.1 }; }
function ziel(p, t, s) { if (t === E.RAUS) { const b = rausBox(p); return [b.x + b.w / 2, b.y + b.h / 2]; } return steinPos(t, Math.max(0, Math.abs(s.pt[t]))); }

// ---------- Anzeige-Stellung (Partie + schon gezogene Teilzüge) ----------
function anzeige() { const s = E.kopie(partie.s); for (const m of teil) E.setze(s, m); return s; }
function passende() { return liste ? liste.filter((x) => teil.every((m, k) => x.z[k] && x.z[k].f === m.f && x.z[k].t === m.t)) : []; }
function moeglich() {   // nächste erlaubte Teilzüge (eindeutig nach von/nach)
  const out = new Map();
  for (const x of passende()) { const m = x.z[teil.length]; if (m) out.set(m.f + '-' + m.t, m); }
  return [...out.values()];
}
function benutzteWuerfel() {
  if (!wurf) return [];
  const alle = E.wuerfelListe(wurf), pm = passende(), genutzt = [];
  const z = pm.length ? pm[0].z : teil;
  for (let k = 0; k < teil.length; k++) genutzt.push(z[k] && z[k].w);
  // Markierung: je genutztem Würfelwert einen passenden Würfel ausgrauen
  const frei = alle.map(() => true);
  for (const w of genutzt) { const i = alle.findIndex((x, j) => frei[j] && x === w); if (i >= 0) frei[i] = false; else { const j = frei.indexOf(true); if (j >= 0) frei[j] = false; } }
  return { alle, frei };
}

// ---------- Zeichnen ----------
const FARBE_HELL = '#e9cf9f', FARBE_DUNKEL = '#5e3a20';
function brett(s) {
  const { x0, y0, w, h, zeile, spalte, mitte } = lay;
  cx.save();
  cx.shadowColor = 'rgba(0,0,0,.55)'; cx.shadowBlur = 16; cx.shadowOffsetY = 6;
  cx.fillStyle = '#4a2c17'; cx.beginPath(); (cx.roundRect ? cx.roundRect(x0 - 5, y0 - 5, w + 10, 13 * zeile + 10, 8) : cx.rect(x0 - 5, y0 - 5, w + 10, 13 * zeile + 10)); cx.fill();
  cx.restore();
  // Holz in beiden Spalten
  for (const sp of [0, 1]) {
    const x = sp === 0 ? x0 : x0 + spalte + mitte;
    cx.save(); cx.beginPath(); cx.rect(x, y0, spalte, 13 * zeile); cx.clip();
    if (img.holz) cx.drawImage(img.holz, x, y0, spalte, 13 * zeile); else { cx.fillStyle = '#c98f4f'; cx.fillRect(x, y0, spalte, 13 * zeile); }
    cx.restore();
  }
  cx.fillStyle = '#3d2412'; cx.fillRect(x0 + spalte, y0, mitte, 13 * zeile);
  // Heimfelder dezent umranden (eigene Farbe sieht ihres in Gelb, wenn sie am Zug ist)
  for (let i = 0; i < 24; i++) {
    const { sp, z } = ort(i), y = y0 + z * zeile, bx = randX(sp), lang = spalte * 0.9, dir = sp === 0 ? 1 : -1;
    cx.beginPath(); cx.moveTo(bx, y + zeile * 0.04); cx.lineTo(bx + dir * lang, y + zeile / 2); cx.lineTo(bx, y + zeile * 0.96); cx.closePath();
    cx.fillStyle = i % 2 ? FARBE_DUNKEL : FARBE_HELL; cx.globalAlpha = 0.92; cx.fill(); cx.globalAlpha = 1;
    cx.strokeStyle = 'rgba(40,20,5,.35)'; cx.lineWidth = 1; cx.stroke();
  }
  // Bande (Mittelreihe)
  cx.fillStyle = 'rgba(40,22,10,.85)'; cx.fillRect(x0, y0 + 6 * zeile, w, zeile);
  cx.strokeStyle = 'rgba(255,220,170,.18)'; cx.strokeRect(x0 + 0.5, y0 + 6 * zeile + 0.5, w - 1, zeile - 1);
  // Raus-Felder
  for (const p of [1, 2]) {
    const b = rausBox(p);
    cx.fillStyle = 'rgba(17,18,26,.85)'; cx.beginPath(); (cx.roundRect ? cx.roundRect(b.x, b.y, b.w, b.h, 8) : cx.rect(b.x, b.y, b.w, b.h)); cx.fill();
    cx.strokeStyle = 'rgba(246,247,249,.14)'; cx.stroke();
    const n = s.off[p], sw = Math.min(b.w / 17, 9);
    for (let k = 0; k < n; k++) { cx.fillStyle = p === 1 ? '#e8d3a8' : '#6a432a'; cx.fillRect(b.x + 8 + k * (sw + 1.5), b.y + b.h * 0.22, sw, b.h * 0.56); }
    cx.fillStyle = 'rgba(246,247,249,.55)'; cx.font = '600 ' + Math.round(lay.zeile * 0.42) + 'px "Barlow Condensed",sans-serif'; cx.textBaseline = 'middle';
    cx.textAlign = heimSpalte(p) === 0 ? 'right' : 'left';
    if (!n) { cx.textAlign = 'center'; cx.fillText('RAUS', b.x + b.w / 2, b.y + b.h / 2); }
    else cx.fillText(n + '/15', heimSpalte(p) === 0 ? b.x + b.w - 8 : b.x + 8 + 15 * (sw + 1.5) + 4, b.y + b.h / 2);
  }
}
function stein(x, y, p, alpha = 1, skala = 1) {
  const R = lay.d / 2 * skala;
  cx.save(); cx.globalAlpha = alpha;
  cx.beginPath(); cx.ellipse(x + R * 0.06, y + R * 0.16, R * 0.98, R * 0.9, 0, 0, 7); cx.fillStyle = 'rgba(0,0,0,.35)'; cx.fill();
  const n = p === 1 ? 'stein-hell' : 'stein-dunkel';
  if (img[n]) cx.drawImage(img[n], x - R, y - R, R * 2, R * 2);
  else { cx.beginPath(); cx.arc(x, y, R, 0, 7); cx.fillStyle = p === 1 ? '#e8d3a8' : '#4a2c18'; cx.fill(); }
  cx.restore();
}
function zahl(x, y, n) {
  cx.save(); cx.font = '700 ' + Math.round(lay.d * 0.5) + 'px "Barlow Condensed",sans-serif'; cx.textAlign = 'center'; cx.textBaseline = 'middle';
  cx.lineWidth = 3; cx.strokeStyle = 'rgba(0,0,0,.75)'; cx.strokeText(String(n), x, y + 1); cx.fillStyle = '#FFD21C'; cx.fillText(String(n), x, y + 1); cx.restore();
}
function wuerfel(x, y, gr, augen, aus, drehung = 0) {
  cx.save(); cx.translate(x, y); cx.rotate(drehung); cx.globalAlpha = aus ? 0.35 : 1;
  cx.shadowColor = 'rgba(0,0,0,.5)'; cx.shadowBlur = 6; cx.shadowOffsetY = 2;
  cx.fillStyle = '#fbf6ea'; cx.beginPath(); (cx.roundRect ? cx.roundRect(-gr / 2, -gr / 2, gr, gr, gr * 0.18) : cx.rect(-gr / 2, -gr / 2, gr, gr)); cx.fill();
  cx.shadowColor = 'transparent';
  const P = { 1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]], 4: [[-1, -1], [1, -1], [-1, 1], [1, 1]], 5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], 6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]] }[augen] || [];
  cx.fillStyle = '#1a1a1a';
  for (const [a, b] of P) { cx.beginPath(); cx.arc(a * gr * 0.26, b * gr * 0.26, gr * 0.09, 0, 7); cx.fill(); }
  cx.restore();
}
const menschAmZug = () => partie && !vorbei && !denkt && (modus === 'zwei' || partie.s.am === mensch);

function zeichne(jetzt) {
  cx.setTransform(lay.dpr, 0, 0, lay.dpr, 0, 0);
  cx.clearRect(0, 0, lay.W, lay.H);
  if (!lay.w) return;
  const s = partie ? anzeige() : E.neueStellung();
  brett(s);
  const puls = WENIG_BEWEGUNG ? 0.85 : 0.7 + 0.3 * Math.sin(jetzt / 180);
  const hilfe = partie && menschAmZug() && wurf && !anim && !rollt;
  const naechste = hilfe ? moeglich() : [];
  // Heimfeld der Seite am Zug markieren
  if (partie && !vorbei) {
    const p = partie.s.am;
    const zs = [0, 1, 2, 3, 4, 5].map((k) => ort(p === 1 ? k : 23 - k).z), sp = heimSpalte(p);
    const y = lay.y0 + Math.min(...zs) * lay.zeile, x = sp === 0 ? lay.x0 : lay.x0 + lay.spalte + lay.mitte;
    cx.save(); cx.strokeStyle = 'rgba(255,210,28,.45)'; cx.lineWidth = 2; cx.setLineDash([6, 5]); cx.strokeRect(x + 2, y + 2, lay.spalte - 4, 6 * lay.zeile - 4); cx.restore();
  }
  // Steine auf den Punkten
  for (let i = 0; i < 24; i++) {
    const v = s.pt[i]; if (!v) continue;
    const p = v > 0 ? 1 : 2, n = Math.abs(v);
    for (let k = 0; k < Math.min(n, 5); k++) {
      let [x, y] = steinPos(i, k);
      if (wackel && wackel.i === i && k === Math.min(n, 5) - 1) { const t = (jetzt - wackel.t0) / 300; if (t < 1) x += Math.sin(t * 25) * lay.d * 0.08 * (1 - t); else wackel = null; }
      stein(x, y, p);
    }
    if (n > 5) { const [x, y] = steinPos(i, 4); zahl(x, y, n); }
  }
  // Bande
  for (const p of [1, 2]) { for (let k = 0; k < Math.min(s.bar[p], 3); k++) { const [x, y] = bandePos(p, k); stein(x, y, p); } if (s.bar[p] > 3) { const [x, y] = bandePos(p, 2); zahl(x, y, s.bar[p]); } }
  // Würfel in der Mitte der Bande
  if (wurf || rollt) {
    const gr = lay.zeile * 0.82, y = zeileY(6), mx = lay.x0 + lay.w / 2;
    if (rollt && jetzt < rollt) {
      const a = 1 + Math.floor(Math.random() * 6), b = 1 + Math.floor(Math.random() * 6);
      wuerfel(mx - gr * 0.62, y, gr, a, false, Math.sin(jetzt / 40) * 0.5); wuerfel(mx + gr * 0.62, y, gr, b, false, -Math.sin(jetzt / 37) * 0.5);
    } else if (wurf) {
      const bw = benutzteWuerfel(), n = bw.alle.length, abst = gr * 1.12;
      bw.alle.forEach((a, k) => wuerfel(mx + (k - (n - 1) / 2) * abst, y, n > 2 ? gr * 0.8 : gr, a, !bw.frei[k]));
    }
  }
  // fliegender Stein
  if (anim) {
    let t = Math.max(0, Math.min(1, (jetzt - anim.t0) / anim.dauer)); t = 1 - Math.pow(1 - t, 3);
    stein(anim.von[0] + (anim.nach[0] - anim.von[0]) * t, anim.von[1] + (anim.nach[1] - anim.von[1]) * t - Math.sin(t * Math.PI) * lay.d * 0.4, anim.p, 1, 1 + Math.sin(t * Math.PI) * 0.12);
  }
  // Hilfen
  if (hilfe) {
    const p = partie.s.am;
    if (auswahl < 0) {
      const quellen = new Set(naechste.map((m) => m.f));
      for (const f of quellen) { const [x, y] = f === E.BANDE ? bandePos(p, Math.max(0, s.bar[p] - 1)) : steinPos(f, Math.max(0, Math.abs(s.pt[f]) - 1)); cx.save(); cx.globalAlpha = 0.35 + 0.3 * puls; cx.beginPath(); cx.arc(x, y, lay.d * 0.56, 0, 7); cx.strokeStyle = '#FFD21C'; cx.lineWidth = 2; cx.stroke(); cx.restore(); }
    } else {
      const [x, y] = auswahl === E.BANDE ? bandePos(p, Math.max(0, s.bar[p] - 1)) : steinPos(auswahl, Math.max(0, Math.abs(s.pt[auswahl]) - 1));
      cx.beginPath(); cx.arc(x, y, lay.d * 0.58, 0, 7); cx.strokeStyle = '#FFD21C'; cx.lineWidth = 3; cx.stroke();
      for (const m of naechste) if (m.f === auswahl) {
        if (m.t === E.RAUS) { const b = rausBox(p); cx.save(); cx.globalAlpha = 0.4 + 0.5 * puls; cx.strokeStyle = '#FFD21C'; cx.lineWidth = 3; cx.strokeRect(b.x + 1.5, b.y + 1.5, b.w - 3, b.h - 3); cx.restore(); continue; }
        const [tx, ty] = steinPos(m.t, Math.abs(s.pt[m.t]) && Math.sign(s.pt[m.t]) === (p === 1 ? 1 : -1) ? Math.abs(s.pt[m.t]) : 0);
        cx.save(); cx.globalAlpha = 0.5 + 0.5 * puls; cx.beginPath(); cx.arc(tx, ty, lay.d * 0.2, 0, 7); cx.fillStyle = '#FFD21C'; cx.fill(); cx.restore();
      }
    }
  }
}
function schleife(t) { zeichne(t); requestAnimationFrame(schleife); }

// ---------- Anzeige um das Brett ----------
function panels() {
  if (!partie) return;
  const s = anzeige();
  for (const ort_ of ['Oben', 'Unten']) {
    const p = ort_ === 'Unten' ? (modus === 'ki' ? mensch : 1) : (modus === 'ki' ? 3 - mensch : 2);
    const istKi = modus === 'ki' && p !== mensch;
    if (istKi) avatar($('av' + ort_), stufe); else steinAvatar($('av' + ort_), p);
    $('n' + ort_).textContent = istKi ? GEGNER[stufe].name : modus === 'ki' ? 'Du' : (p === 1 ? 'Spieler Hell' : 'Spieler Dunkel');
    const info = $('i' + ort_);
    if (istKi && denkt) { info.textContent = 'überlegt …'; info.classList.add('denkt'); }
    else { info.textContent = [istKi ? GEGNER[stufe].stufe : (p === 1 ? 'Hell' : 'Dunkel'), E.pips(s, p) + ' Augen', s.off[p] ? s.off[p] + ' raus' : ''].filter(Boolean).join(' · '); info.classList.remove('denkt'); }
    $('sp' + ort_).classList.toggle('dran', !vorbei && partie.s.am === p);
    $('v' + ort_).hidden = true;
  }
  const amZug = menschAmZug();
  $('bWurf').hidden = !(amZug && !wurf && !rollt);
  $('bZurueck').disabled = !(amZug && !anim && !rollt && (teil.length || (!wurf && rueckSchritte() > 0)));
}
function hinweis(text) { $('hinweis').innerHTML = text; }
function standardHinweis() {
  if (!partie) return;
  if (vorbei) { hinweis('Partie vorbei. <b>Menü</b> für eine neue Partie.'); return; }
  const p = partie.s.am, wer = modus === 'zwei' ? (p === 1 ? 'Hell: ' : 'Dunkel: ') : '';
  if (modus === 'ki' && p !== mensch) { hinweis(GEGNER[stufe].name + ' ist am Zug …'); return; }
  if (rollt) { hinweis(wer + 'Die Würfel rollen …'); return; }
  if (!wurf) { hinweis(wer + 'Tippe auf <b>Würfeln</b>.'); return; }
  if (!liste || !liste[0].z.length) { hinweis(wer + '<b>Kein Zug möglich.</b> Der Gegner ist dran.'); return; }
  const s = anzeige();
  if (s.bar[p] && auswahl < 0) { hinweis(wer + 'Dein Stein auf der Bande muss zuerst <b>einsetzen</b>. Tippe ihn an.'); return; }
  if (auswahl >= 0) { hinweis(wer + 'Wohin? Tippe ein <b>gelb markiertes</b> Ziel an.'); return; }
  hinweis(wer + 'Tippe einen Stein an (gelb umrandet), der ziehen kann.');
}

// ---------- Partie ----------
function neuePartie(m, st, mn) {
  modus = m; stufe = st; mensch = mn;
  partie = E.neuePartie(1); wurf = null; liste = null; teil = []; auswahl = -1; vorbei = null; anim = null; denkt = false; rollt = 0; kiNr++;
  merken(); zeige(null); panels(); standardHinweis(); weiter();
}
function fortsetzen() {
  const o = store.offen; if (!o) return;
  const p = E.partieAus(o.z); if (!p) { store.offen = null; speichern(); return; }
  modus = o.modus; stufe = o.stufe; mensch = o.mensch;
  partie = p; teil = []; auswahl = -1; vorbei = null; anim = null; denkt = false; rollt = 0; kiNr++;
  wurf = o.wurf; liste = wurf ? E.zuege(partie.s, wurf) : null;
  zeige(null); panels(); standardHinweis(); weiter();
}
function merken() { store.offen = partie && !vorbei ? { modus, stufe, mensch, z: E.partieText(partie), wurf } : null; speichern(); }

function weiter() {
  if (!partie || vorbei) return;
  const st = E.status(partie);
  if (st.ende) { ende(st); return; }
  panels(); standardHinweis();
  if (modus === 'ki' && partie.s.am !== mensch) { kiZiehen(); return; }
  if (wurf && liste && !liste[0].z.length) setTimeout(() => abschliessen(), 1300);
}
function wuerfelnJetzt(danach) {
  ton.start(); ton.wurf();
  const dauer = WENIG_BEWEGUNG ? 0 : 550;
  rollt = performance.now() + dauer; panels(); standardHinweis();
  setTimeout(() => {
    rollt = 0; wurf = E.wuerfeln(); liste = E.zuege(partie.s, wurf); teil = []; auswahl = -1;
    merken(); panels(); standardHinweis();
    if (danach) danach();
    else if (!liste[0].z.length) setTimeout(() => abschliessen(), 1300);
    else { const s = anzeige(); if (s.bar[partie.s.am]) auswahl = E.BANDE; standardHinweis(); }
  }, dauer);
}
// Teilzug zeigen (Animation), danach Stellung aktualisieren
function teilAusfuehren(m, fertig) {
  const p = partie.s.am, vorher = anzeige();
  const von = m.f === E.BANDE ? bandePos(p, Math.max(0, vorher.bar[p] - 1)) : steinPos(m.f, Math.max(0, Math.abs(vorher.pt[m.f]) - 1));
  const geschlagen = m.t !== E.RAUS && vorher.pt[m.t] !== 0 && (vorher.pt[m.t] > 0) !== (p === 1);
  const nach = m.t === E.RAUS ? ziel(p, m.t, vorher) : steinPos(m.t, geschlagen ? 0 : Math.abs(vorher.pt[m.t]));
  const dauer = WENIG_BEWEGUNG ? 0 : 230;
  anim = dauer ? { p, von, nach, t0: performance.now(), dauer } : null;
  teil.push(m); auswahl = -1;
  setTimeout(() => {
    anim = null;
    if (m.t === E.RAUS) ton.raus(); else if (geschlagen) ton.schlag(); else ton.tock();
    panels(); standardHinweis();
    if (fertig) fertig();
  }, dauer);
}
function zugFertig() { const pm = passende(); return pm.length > 0 && pm.every((x) => x.z.length === teil.length); }
function abschliessen() {
  if (!partie || vorbei || !wurf) return;
  const z = teil.slice();
  if (!E.spiele(partie, wurf, z)) { teil = []; auswahl = -1; panels(); standardHinweis(); return; }
  wurf = null; liste = null; teil = []; auswahl = -1;
  merken(); panels(); standardHinweis();
  sperre = performance.now() + 150;
  setTimeout(weiter, 150);
}

// ---------- Computergegner ----------
let worker = null, workerKaputt = false, wartet = null;
function holeWorker() {
  if (worker || workerKaputt) return worker;
  try {
    worker = new Worker(new URL('./ki.js', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => antwort(e.data);
    worker.onerror = () => { workerKaputt = true; worker = null; if (wartet) direktRechnen(wartet.nr); };
  } catch (e) { workerKaputt = true; worker = null; }
  return worker;
}
function kiZiehen() {
  denkt = true; panels(); standardHinweis();
  const nr = ++kiNr;
  const los = () => {
    if (nr !== kiNr) return;
    wartet = { nr, start: performance.now() };
    const w = holeWorker();
    if (w) w.postMessage({ id: nr, z: E.partieText(partie), wurf, stufe, seed: (Math.random() * 4294967296) >>> 0 });
    else setTimeout(() => direktRechnen(nr), 30);
  };
  if (wurf) los(); else wuerfelnJetzt(los);
}
function direktRechnen(nr) { if (!partie || nr !== kiNr) return; antwort({ id: nr, z: E.kiZug(partie.s, wurf, stufe) }); }
function antwort(d) {
  if (!d || !wartet || d.id !== wartet.nr || d.id !== kiNr || !partie || vorbei) return;
  const rest = Math.max(0, GEGNER[stufe].pause - (performance.now() - wartet.start)); wartet = null;
  setTimeout(() => {
    if (d.id !== kiNr || !partie) return;
    let z = d.z;
    if (!z || !liste.some((x) => E.gleicheZuege(x.z, z))) z = E.kiZug(partie.s, wurf, 'geuebt');
    denkt = false; panels();
    const schritt = (k) => {
      if (d.id !== kiNr) return;
      if (k >= z.length) { setTimeout(abschliessen, z.length ? 250 : 1100); if (!z.length) hinweis(GEGNER[stufe].name + ' kann nicht ziehen.'); return; }
      teilAusfuehren(z[k], () => setTimeout(() => schritt(k + 1), 140));
    };
    schritt(0);
  }, rest);
}

// ---------- Bedienung ----------
function trefferBei(x, y) {   // Punkt (0–23), Bande (24), Raus (25) oder -1
  const p = partie.s.am;
  const b = rausBox(p);
  if (x >= b.x && x <= b.x + b.w && y >= b.y - 4 && y <= b.y + b.h + 8) return E.RAUS;
  const z = Math.floor((y - lay.y0) / lay.zeile);
  if (z < 0 || z > 12 || x < lay.x0 - 6 || x > lay.x0 + lay.w + 6) return -1;
  if (z === 6) return E.BANDE;
  const sp = x < lay.x0 + lay.w / 2 ? 0 : 1;
  for (let i = 0; i < 24; i++) { const o = ort(i); if (o.sp === sp && o.z === z) return i; }
  return -1;
}
function tippe(i) {
  if (!menschAmZug() || anim || rollt || performance.now() < sperre || i < 0) return;
  if (!wurf) { wuerfelnJetzt(); return; }
  if (!liste || !liste[0].z.length) return;
  const naechste = moeglich();
  if (auswahl >= 0) {
    const m = naechste.find((x) => x.f === auswahl && x.t === i);
    if (m) { teilAusfuehren(m, () => { if (zugFertig()) setTimeout(abschliessen, 250); else { const s = anzeige(); if (s.bar[partie.s.am]) auswahl = E.BANDE; standardHinweis(); } }); return; }
    if (i === auswahl) { auswahl = -1; standardHinweis(); return; }
  }
  if (naechste.some((x) => x.f === i)) {
    auswahl = i; ton.wahl(); standardHinweis();
    // nur ein mögliches Ziel und Abtragen/Einsetzen: trotzdem bestätigen lassen (Tippfehler vermeiden)
    return;
  }
  const s = anzeige(), p = partie.s.am;
  if (i >= 0 && i < 24 && s.pt[i] && (s.pt[i] > 0) === (p === 1)) { wackel = { i, t0: performance.now() }; ton.nein(); hinweis(s.bar[p] ? 'Erst den Stein auf der <b>Bande</b> einsetzen.' : 'Dieser Stein kann mit dem Wurf nicht ziehen.'); }
  else if (auswahl >= 0) { ton.nein(); hinweis(i === E.RAUS ? 'Abtragen geht erst, wenn alle 15 Steine im Heimfeld sind.' : 'Dorthin geht es nicht. Gelb markierte Ziele sind erlaubt.'); }
}
cv.addEventListener('pointerdown', (e) => { ton.start(); const r = cv.getBoundingClientRect(); if (partie) tippe(trefferBei(e.clientX - r.left, e.clientY - r.top)); });
$('bWurf').addEventListener('click', () => { if (menschAmZug() && !wurf && !rollt) wuerfelnJetzt(); });

function rueckSchritte() {   // ganze Züge bis zum letzten eigenen Zug
  if (!partie || (modus === 'ki' && stufe === 'meister')) return 0;
  const n = partie.zuege.length;
  if (modus === 'zwei') return n > 0 ? 1 : 0;
  for (let k = n - 1; k >= 0; k--) { const seite = (k % 2 === 0) ? partie.beginner : 3 - partie.beginner; if (seite === mensch) return n - k; }
  return 0;
}
$('bZurueck').addEventListener('click', () => {
  if (!menschAmZug() || anim || rollt) return;
  if (teil.length) { teil.pop(); auswahl = -1; ton.wahl(); panels(); standardHinweis(); return; }
  const k = rueckSchritte(); if (!k || wurf) return;
  // Den letzten eigenen Zug mit demselben Wurf noch einmal spielen
  const alt = partie.zuege[partie.zuege.length - k];
  const text = partie.beginner + ':' + partie.zuege.slice(0, partie.zuege.length - k).map((x) => E.kodiere(x.w, x.z)).join('.');
  const p = E.partieAus(text); if (!p) return;
  partie = p; wurf = alt.w; liste = E.zuege(partie.s, wurf); teil = []; auswahl = -1; kiNr++;
  ton.wahl(); merken(); panels(); standardHinweis();
});

// ---------- Ende ----------
let ergebnisText = '';
function ende(st) {
  vorbei = st; denkt = false; store.offen = null; wurf = null;
  const art = st.art === 3 ? ' mit Backgammon' : st.art === 2 ? ' mit Gammon' : '';
  let titel, text, sieg = false;
  if (modus === 'ki') {
    const g = GEGNER[stufe], x = stat(stufe);
    if (st.sieger === mensch) { x.s++; if (st.art > 1) x.g++; sieg = true; titel = st.art > 1 ? (st.art === 3 ? 'Backgammon!' : 'Gammon!') : 'Gewonnen!'; text = 'Du hast zuerst alle Steine abgetragen' + art + '. ' + (stufe === 'meister' ? 'Respekt, der Professor ist geschlagen!' : 'Stark gespielt!'); ergebnisText = 'Ich habe ' + g.name + ' (' + g.stufe + ') in Backgammon geschlagen' + art + '! Schaffst du das auch?'; }
    else { x.n++; titel = 'Verloren'; text = g.name + ' hat zuerst alle Steine abgetragen' + art + '. Revanche?'; ergebnisText = g.name + ' (' + g.stufe + ') war in Backgammon diesmal stärker. Schaffst du es?'; }
    avatar($('eAv'), stufe);
    $('eZahlen').hidden = false; $('eS').textContent = x.s; $('eU').textContent = x.g; $('eN').textContent = x.n;
  } else {
    store.zwei++; sieg = true;
    titel = (st.sieger === 1 ? 'Hell' : 'Dunkel') + ' gewinnt!'; text = 'Alle Steine abgetragen' + art + '.';
    steinAvatar($('eAv'), st.sieger);
    $('eZahlen').hidden = true; ergebnisText = 'Wir haben gerade Backgammon auf PlaySaal gespielt. Spielst du mit?';
  }
  speichern(); panels(); standardHinweis();
  setTimeout(() => {
    $('eTitel').textContent = titel; $('eTitel').className = 'ergebnis' + (sieg ? ' sieg' : '');
    $('eText').textContent = text;
    $('bRevanche').textContent = modus === 'ki' ? 'Revanche' : 'Neue Partie';
    if (sieg) ton.sieg(); else ton.verloren();
    zeige('sEnde');
  }, 900);
}
async function teilen() {
  const b = $('bTeilen'), text = ergebnisText || 'Backgammon auf PlaySaal';
  try { if (navigator.share) { await navigator.share({ title: 'Backgammon · PlaySaal', text, url: URL_SPIEL }); return; } } catch (err) { if (err && err.name === 'AbortError') return; }
  try { await navigator.clipboard.writeText(text + ' ' + URL_SPIEL); b.textContent = 'Kopiert!'; setTimeout(() => (b.textContent = 'Teilen'), 1600); } catch (e) { b.textContent = 'Teilen'; }
}

// ---------- Schirme ----------
function zeige(id) { for (const x of ['sTitel', 'sStufe', 'sRegeln', 'sEnde']) $(x).hidden = x !== id; }
function titel() {
  kiNr++; denkt = false; teil = []; auswahl = -1; anim = null; rollt = 0;
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
    const bilanz = x.s + x.n ? x.s + (x.s === 1 ? ' Sieg' : ' Siege') + ' · ' + x.n + (x.n === 1 ? ' Niederlage' : ' Niederlagen') : 'Noch nicht gespielt';
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
// Ende-Kennzahlen: Siege / Gammons / Niederlagen
const eU = $('eU'); if (eU && eU.previousElementSibling) eU.previousElementSibling.textContent = 'Gammons';

// ---------- Start ----------
laden(); tonKnopf(); groesse(); titel();
requestAnimationFrame(schleife);
window.__bg = { E, get partie() { return partie; }, get denkt() { return denkt; }, get vorbei() { return vorbei; }, get wurf() { return wurf; }, get rollt() { return rollt; }, get anim() { return anim; }, moeglich, tippe, steinPos, bandePos, rausBox, ort, get mensch() { return mensch; }, setzeWurf(w) { wurf = w; liste = E.zuege(partie.s, w); teil = []; auswahl = -1; panels(); standardHinweis(); } };
