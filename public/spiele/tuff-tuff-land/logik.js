// Tuff-Tuff-Land – Regeln ohne Darstellung (unter Node testbar).
// Welt = Raster aus Feldern (je 4×4 Einheiten). Ein Feld hat bis zu zwei Gleis-Verbindungen zwischen seinen Kanten
// (N=0, O=1, S=2, W=3): gerade (gegenüberliegende Kanten) oder Kurve (Nachbarkanten, Viertelkreis mit Radius 2).
// Zwei Verbindungen mit gemeinsamer Kante = Weiche; ohne gemeinsame Kante = Kreuzung bzw. zwei getrennte Bögen.

export const SCHLUESSEL = 'tufftuff.v1';
export const FELD = 4;                 // Einheiten je Feld
export const BREITE = 9;               // Felder quer
export const GEBIET_H = 12;            // Felder je Gebiet (längs)
export const GEBIETE = [
  { id: 'wiese', name: 'Wiesenhausen', boden: '#86d158', ziel: 0 },
  { id: 'wald', name: 'Tannenwald', boden: '#6cc04f', ziel: 6, zug: 'ice' },
];
export const HOEHE = GEBIET_H * GEBIETE.length;
export const DIR = [[0, -1], [1, 0], [0, 1], [-1, 0]];   // N, O, S, W als (dx, dz)
export const gegen = (e) => (e + 2) % 4;

export const ZUEGE = {
  blau: { name: 'Blaue Dampflok', wagen: ['lok-blau', 'wagen-rot', 'wagen-gelb'] },
  rot: { name: 'Rote Dampflok', wagen: ['lok-rot', 'wagen-a', 'wagen-b'] },
  gruen: { name: 'Grüne Dampflok', wagen: ['lok-gruen', 'wagen-blau', 'holz', 'wagen-gruen'] },
  tram: { name: 'Straßenbahn', wagen: ['tram'] },
  ice: { name: 'Schnellzug', wagen: ['ice-a', 'ice-b', 'ice-c'], dreh: [0, 0, Math.PI] },
};
export const ZUG_START = ['blau', 'rot', 'gruen', 'tram'];
export const WAGEN_ABSTAND = 2.85;
export const TEMPO = 3.4;              // Einheiten pro Sekunde
export const HALT_ZEIT = 3.2;          // Sekunden am Bahnhof
export const PLATZ = 6;                // Fahrgäste im Zug
export const WARTEND_MAX = 3;

export const DEKO = {
  // Antippen desselben Feldes wechselt reihum durch die Liste
  baum: ['baum', 'blume-rot', 'tanne', 'blume-gelb', 'eiche', 'busch', 'baum-herbst', 'blume-lila', 'kegelbaum', 'pilz', 'dickbaum', 'kuerbis', 'eiche-herbst', 'stein'],
  haus: ['haus1', 'haus2', 'haus3', 'haus4', 'haus5', 'haus6', 'haus7', 'haus8'],
};

// ---------- Raster ----------
export const idx = (c, r) => r * BREITE + c;
export const inWelt = (c, r) => c >= 0 && c < BREITE && r >= 0 && r < HOEHE;
export const gebietVon = (r) => GEBIETE.length - 1 - Math.floor(r / GEBIET_H);
export const mitte = (c, r) => [c * FELD + FELD / 2, r * FELD + FELD / 2];
export const kantenMitte = (c, r, e) => { const [x, z] = mitte(c, r); return [x + DIR[e][0] * FELD / 2, z + DIR[e][1] * FELD / 2]; };
const norm = (a, b) => (a < b ? [a, b] : [b, a]);
const gleich = (l, a, b) => (l[0] === a && l[1] === b) || (l[0] === b && l[1] === a);
export const istGerade = (l) => gegen(l[0]) === l[1];
export const linkLaenge = (a, b) => (gegen(a) === b ? FELD : Math.PI * FELD / 4);

// Punkt auf einer Verbindung von Kante a nach Kante b nach Strecke s: [x, z, gier]
export function punkt(c, r, a, b, s) {
  const L = linkLaenge(a, b);
  const t = Math.max(0, Math.min(1, s / L));
  if (gegen(a) === b) {
    const [x0, z0] = kantenMitte(c, r, a), [x1, z1] = kantenMitte(c, r, b);
    return [x0 + (x1 - x0) * t, z0 + (z1 - z0) * t, Math.atan2(DIR[b][0], DIR[b][1])];
  }
  const [mx, mz] = mitte(c, r), R = FELD / 2;
  const kx = mx + R * (DIR[a][0] + DIR[b][0]), kz = mz + R * (DIR[a][1] + DIR[b][1]);
  const th = t * Math.PI / 2, co = Math.cos(th), si = Math.sin(th);
  const x = kx + R * (-DIR[b][0] * co - DIR[a][0] * si), z = kz + R * (-DIR[b][1] * co - DIR[a][1] * si);
  const tx = DIR[b][0] * si - DIR[a][0] * co, tz = DIR[b][1] * si - DIR[a][1] * co;
  return [x, z, Math.atan2(tx, tz)];
}

// Darstellung: welches Modell, wo, wie gedreht (Modelle starten im Ursprung und zeigen nach +z, Kurve biegt nach -x)
export function teil(c, r, l) {
  let [a, b] = l;
  if (istGerade(l)) { const [x, z] = kantenMitte(c, r, a); return { m: 'gleis', x, z, gier: Math.atan2(DIR[b][0], DIR[b][1]) }; }
  let hx = -DIR[a][0], hz = -DIR[a][1];
  if (!(DIR[b][0] === -hz && DIR[b][1] === hx)) { [a, b] = [b, a]; hx = -DIR[a][0]; hz = -DIR[a][1]; }
  const [x, z] = kantenMitte(c, r, a);
  return { m: 'kurve', x, z, gier: Math.atan2(hx, hz) };
}

// ---------- Welt ----------
function zufall(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

export function neueWelt() {
  const z = {};
  const feld = (c, r) => (z[idx(c, r)] ||= {});
  const gleisReihe = (r, c0, c1) => { for (let c = c0; c <= c1; c++) feld(c, r).l = [[1, 3]]; };
  const gleisSpalte = (c, r0, r1) => { for (let r = r0; r <= r1; r++) feld(c, r).l = [[0, 2]]; };
  const bahnhof = (c, r, nr, fest = true) => { const f = feld(c, r); f.st = nr; f.fest = fest; f.w8 = 2; };
  const deko = (c, r, m, rot = 0) => { const f = feld(c, r); if (!f.l && f.st == null) f.d = [m, rot]; };
  // Gebiet 1: Wiesenhausen (Reihen 12–23)
  gleisReihe(21, 2, 6); bahnhof(4, 21, 0);
  gleisReihe(14, 3, 5); bahnhof(4, 14, 1);
  [[0, 22, 'haus3', 0], [1, 23, 'haus1', 2], [3, 23, 'haus4', 0], [5, 23, 'haus6', 0], [7, 23, 'haus2', 0], [8, 22, 'haus7', 3],
   [0, 13, 'haus5', 1], [7, 12, 'haus8', 0]].forEach(([c, r, m, d]) => deko(c, r, m, d));
  // Gebiet 2: Tannenwald (Reihen 0–11)
  gleisReihe(9, 3, 5); bahnhof(4, 9, 2);
  gleisSpalte(1, 1, 3); bahnhof(1, 2, 3);
  gleisReihe(2, 6, 8); bahnhof(7, 2, 4);
  const rnd = zufall(20261102);
  const BLUMEN = ['blume-rot', 'blume-gelb', 'blume-lila', 'busch', 'gras', 'gras', 'stein'];
  const WALD = ['tanne', 'tanne2', 'tanne-hoch', 'kegelbaum', 'tanne', 'tanne2', 'tanne-hoch', 'baum', 'pilz', 'stumpf', 'fels', 'stamm'];
  const FREI1 = new Set([idx(6, 20), idx(6, 19), idx(6, 18), idx(6, 17), idx(6, 16), idx(6, 15), idx(6, 14), idx(5, 14), idx(7, 21), idx(7, 20)]);
  for (let r = 0; r < HOEHE; r++) for (let c = 0; c < BREITE; c++) {
    const k = idx(c, r); if (z[k] || FREI1.has(k)) continue;
    const g = gebietVon(r), x = rnd(), rot = Math.floor(rnd() * 4);
    if (g === 0) { if (x < 0.13) deko(c, r, ['baum', 'eiche', 'dickbaum', 'baum2'][Math.floor(rnd() * 4)], rot); else if (x < 0.33) deko(c, r, BLUMEN[Math.floor(rnd() * BLUMEN.length)], rot); }
    else if (x < (r === 10 || r === 8 ? 0.15 : 0.58)) deko(c, r, WALD[Math.floor(rnd() * WALD.length)], rot);
  }
  return {
    v: 1, z, offen: 1, fahrgaeste: 0, zug: 'blau', zuege: [...ZUG_START], ton: true, musik: true,
    stationen: 5, naechste: 5, tipp: true,
  };
}

export function pruefeStand(s) {
  if (!s || s.v !== 1 || typeof s.z !== 'object') return neueWelt();
  const w = neueWelt();
  const z = {};
  for (const [k, f] of Object.entries(s.z)) {
    const i = Number(k); if (!(i >= 0 && i < BREITE * HOEHE) || !f) continue;
    const n = {};
    if (Array.isArray(f.l)) n.l = f.l.filter((l) => Array.isArray(l) && l.length === 2 && l.every((e) => e >= 0 && e < 4 && Number.isInteger(e)) && l[0] !== l[1]).slice(0, 2).map((l) => norm(l[0], l[1]));
    if (n.l && !n.l.length) delete n.l;
    if (Number.isInteger(f.w)) n.w = f.w & 1;
    if (Number.isInteger(f.st) && n.l && n.l.length === 1 && istGerade(n.l[0])) { n.st = f.st; if (f.fest) n.fest = true; n.w8 = Math.max(0, Math.min(WARTEND_MAX, f.w8 | 0)); }
    if (Array.isArray(f.d) && typeof f.d[0] === 'string' && !n.l) n.d = [f.d[0], (f.d[1] | 0) & 3];
    if (Object.keys(n).length) z[i] = n;
  }
  return {
    v: 1, z, offen: Math.max(1, Math.min(GEBIETE.length, s.offen | 0)), fahrgaeste: Math.max(0, s.fahrgaeste | 0),
    zug: ZUEGE[s.zug] ? s.zug : 'blau', zuege: Array.isArray(s.zuege) ? [...new Set([...ZUG_START, ...s.zuege.filter((k) => ZUEGE[k])])] : [...ZUG_START],
    ton: s.ton !== false, musik: s.musik !== false, naechste: Math.max(w.naechste, s.naechste | 0), tipp: s.tipp !== false,
  };
}

export const offenBis = (w) => w.offen * GEBIET_H;   // Anzahl offener Reihen (von unten)
export const feldOffen = (w, c, r) => inWelt(c, r) && gebietVon(r) < w.offen;
const links = (w, c, r) => (w.z[idx(c, r)] && w.z[idx(c, r)].l) || [];

function aufraeumen(w, k) { const f = w.z[k]; if (f && !f.l && !f.d && f.st == null) delete w.z[k]; }

// Kanten eines Feldes, an denen kein Nachbar anschließt
export function offeneEnden(w, c, r) {
  const out = [];
  for (const l of links(w, c, r)) for (const e of l) {
    const nc = c + DIR[e][0], nr = r + DIR[e][1];
    if (!links(w, nc, nr).some((m) => m.includes(gegen(e)))) out.push(e);
  }
  return out;
}

// Verbindung a–b in Feld einfügen. besetzt(k) = Zug steht auf dem Feld → dort nichts ersetzen.
function verbinde(w, c, r, a, b, ersetzenErlaubt) {
  const k = idx(c, r), f = (w.z[k] ||= {});
  const ls = f.l || [];
  if (ls.some((l) => gleich(l, a, b))) return false;
  if (f.st != null) return false;                 // Bahnhofsgleis bleibt, wie es ist
  delete f.d;
  if (!ls.length) { f.l = [norm(a, b)]; return true; }
  // offenes Ende verlängern: einziges Gleis endet an Kante a oder b ins Leere → umbiegen statt Weiche
  if (ersetzenErlaubt && ls.length === 1) {
    const l = ls[0], off = offeneEnden(w, c, r);
    for (const neu of [a, b]) {
      const alt = neu === a ? b : a;                 // Kante, die schon zum Gleis gehört
      if (l.includes(alt) && off.includes(l[0] === alt ? l[1] : l[0]) && !l.includes(neu)) { f.l = [norm(alt, neu)]; return true; }
    }
  }
  if (ls.length >= 2) return false;
  f.l = [...ls, norm(a, b)];
  f.w = 0;
  return true;
}

// Ein Fingerstrich als Folge benachbarter Felder → Gleise. Gibt geänderte Feld-Indizes zurück.
export function zeichne(w, felder, besetzt = () => false) {
  const geaendert = new Set();
  const kante = (p, q) => DIR.findIndex(([dx, dz]) => q[0] - p[0] === dx && q[1] - p[1] === dz);
  const f = felder.filter((p) => feldOffen(w, p[0], p[1]));
  if (f.length < 2) return [];
  for (let i = 0; i < f.length; i++) {
    const p = f[i], vor = f[i - 1], nach = f[i + 1];
    const ev = vor ? kante(p, vor) : -1, en = nach ? kante(p, nach) : -1;
    if ((vor && ev < 0) || (nach && en < 0)) continue;
    const k = idx(p[0], p[1]), frei = !besetzt(k);
    let a, b;
    if (ev >= 0 && en >= 0) { if (ev === en) continue; a = ev; b = en; }
    else {
      const e = ev >= 0 ? ev : en;
      const ls = links(w, p[0], p[1]);
      if (ls.some((l) => l.includes(e))) continue;  // schließt schon an
      if (ls.length) {
        // Randfeld mit vorhandenem Gleis: an ein offenes Ende anschließen, sonst Abzweig
        const off = offeneEnden(w, p[0], p[1]);
        const l = ls[0];
        if (ls.length === 1 && off.length && frei && w.z[k].st == null) {
          const bleibt = off.length === 2 ? (gegen(e) === l[0] ? l[0] : gegen(e) === l[1] ? l[1] : l[0]) : (l[0] === off[0] ? l[1] : l[0]);
          if (bleibt !== e) { w.z[k].l = [norm(bleibt, e)]; geaendert.add(k); }
          continue;
        }
        a = l.includes(gegen(e)) ? gegen(e) : l[0]; b = e;
        if (a === b || gegen(a) === b && false) continue;
      } else { a = gegen(e); b = e; }
    }
    if (verbinde(w, p[0], p[1], a, b, frei)) geaendert.add(k);
  }
  return [...geaendert];
}

export function radiere(w, c, r) {
  const k = idx(c, r), f = w.z[k];
  if (!f) return null;
  let was = null;
  if (f.st != null && !f.fest) { delete f.st; delete f.w8; was = 'bahnhof'; }
  else if (f.l && f.st == null) { delete f.l; delete f.w; was = 'gleis'; }
  else if (f.d) { delete f.d; was = 'deko'; }
  aufraeumen(w, k);
  return was;
}

export function istWeiche(w, c, r) {
  const ls = links(w, c, r);
  return ls.length === 2 && ls[0].some((e) => ls[1].includes(e));
}
export function stelleWeiche(w, c, r) {
  if (!istWeiche(w, c, r)) return false;
  const f = w.z[idx(c, r)]; f.w = (f.w || 0) ^ 1; return true;
}
// Aktiver Zweig einer Weiche: [gemeinsame Kante, Zielkante]
export function weichenZweig(w, c, r) {
  const ls = links(w, c, r), f = w.z[idx(c, r)];
  const g = ls[0].find((e) => ls[1].includes(e));
  const l = ls[(f.w || 0) & 1];
  return [g, l[0] === g ? l[1] : l[0]];
}

export function setzeBahnhof(w, c, r) {
  const k = idx(c, r), f = w.z[k];
  if (!f || !f.l || f.l.length !== 1 || !istGerade(f.l[0])) return false;
  if (f.st != null) return false;
  f.st = w.naechste++; f.w8 = 1; return true;
}

export function setzeDeko(w, c, r, art, n) {
  if (!feldOffen(w, c, r)) return false;
  const k = idx(c, r), f = (w.z[k] ||= {});
  if (f.l || f.st != null) return false;
  const liste = DEKO[art];
  const jetzt = f.d ? liste.indexOf(f.d[0]) : -1;
  const i = jetzt >= 0 ? jetzt + 1 : n;           // gleiches Feld nochmal antippen = nächstes Motiv
  f.d = [liste[i % liste.length], (i + c + r) % 4];
  return true;
}

// ---------- Zug ----------
// Schritt = Fahrt durch ein Feld von Kante a nach Kante b. Weg = Liste der Schritte, letzter = aktueller.
export function weiter(w, c, r, b) {
  const nc = c + DIR[b][0], nr = r + DIR[b][1];
  if (!feldOffen(w, nc, nr)) return null;
  const e = gegen(b), ls = links(w, nc, nr).filter((l) => l.includes(e));
  if (!ls.length) return null;
  let l = ls[0];
  if (ls.length > 1) {
    const f = w.z[idx(nc, nr)];
    l = links(w, nc, nr)[(f.w || 0) & 1];
    if (!l.includes(e)) l = ls[0];
  }
  return { c: nc, r: nr, a: e, b: l[0] === e ? l[1] : l[0] };
}

export function neuerZug(w, art) {
  const z = { art, wagen: ZUEGE[art].wagen.length, weg: [], s: 0, v: 0, zustand: 'fahrt', warte: 0, gaeste: [], letzter: null, letzteZeit: -99, zeit: 0, laeuft: true };
  setzeZugAufGleis(w, z);
  return z;
}
const zugLaenge = (z) => (z.wagen - 1) * WAGEN_ABSTAND + 2;

// Zug an den ersten Bahnhof mit Gleis stellen (sonst irgendein Gleis); Weg rückwärts so weit wie möglich
export function setzeZugAufGleis(w, z) {
  z.weg = []; z.s = 0; z.v = 0; z.zustand = 'fahrt'; z.warte = 0;
  const kandidaten = Object.entries(w.z).filter(([, f]) => f.l && f.l.length).map(([k, f]) => [Number(k), f])
    .filter(([k]) => feldOffen(w, k % BREITE, Math.floor(k / BREITE)))
    .sort((p, q) => (q[1].st === 0) - (p[1].st === 0) || (q[1].st != null) - (p[1].st != null) || q[0] - p[0]);
  if (!kandidaten.length) return false;
  const [k, f] = kandidaten[0];
  const c = k % BREITE, r = Math.floor(k / BREITE);
  let l = f.l[0];
  // Richtung: zum längeren freien Stück hin
  const vorwaerts = (a, b) => { let n = 0, p = { c, r, a, b }; while (n < 12 && (p = weiter(w, p.c, p.r, p.b))) n++; return n; };
  if (vorwaerts(l[1], l[0]) > vorwaerts(l[0], l[1])) l = [l[1], l[0]];
  const kopf = { c, r, a: l[0], b: l[1] };
  // rückwärts Schritte sammeln
  const weg = [kopf];
  let p = { c, r, a: l[1], b: l[0] }, laenge = linkLaenge(l[0], l[1]);
  while (laenge < zugLaenge(z) + FELD && (p = weiter(w, p.c, p.r, p.b))) { weg.unshift({ c: p.c, r: p.r, a: p.b, b: p.a }); laenge += linkLaenge(p.a, p.b); }
  z.weg = weg;
  // Kopf in die Feldmitte (Bahnhof) bzw. so weit vorn, dass alle Wagen auf dem Gleis stehen
  const L0 = linkLaenge(kopf.a, kopf.b);
  const hinten = laenge - L0;
  z.s = Math.min(L0, Math.max(L0 / 2, zugLaenge(z) - hinten));
  if (f.st != null) { z.letzter = f.st; z.letzteZeit = 0; }
  return true;
}

// Weg nach hinten so weit verlängern, wie Gleis da ist (z. B. nach Zugwechsel auf einen längeren Zug)
export function verlaengereWeg(w, z) {
  let L = z.s;
  for (let i = 0; i < z.weg.length - 1; i++) L += linkLaenge(z.weg[i].a, z.weg[i].b);
  while (L < zugLaenge(z) + 1 && z.weg.length) {
    const st = z.weg[0];
    const p = weiter(w, st.c, st.r, st.a);
    if (!p || z.weg.length > 40) break;
    z.weg.unshift({ c: p.c, r: p.r, a: p.b, b: p.a }); L += linkLaenge(p.a, p.b);
  }
  return L >= zugLaenge(z);
}
export function wechsleZug(w, z, art) {
  z.art = art; z.wagen = ZUEGE[art].wagen.length; z.rueck = false;
  if (!z.weg.length || !verlaengereWeg(w, z)) setzeZugAufGleis(w, z);
}

// Position des Wagens mit Abstand d hinter dem Kopf: [x, z, gier]
export function wagenPos(z, d) {
  let i = z.weg.length - 1, rest = d, s = z.s;
  while (i >= 0) {
    const st = z.weg[i];
    if (rest <= s || i === 0) return punkt(st.c, st.r, st.a, st.b, Math.max(0, s - rest));
    rest -= s; i--; s = linkLaenge(z.weg[i].a, z.weg[i].b);
  }
  return [0, 0, 0];
}
export const wagenAbstand = (i) => i * WAGEN_ABSTAND;

function kuerzen(z) {
  let L = z.s, i = z.weg.length - 1;
  while (i > 0 && L < zugLaenge(z) + 1) { i--; L += linkLaenge(z.weg[i].a, z.weg[i].b); }
  if (i > 0) z.weg.splice(0, i);
}

function wenden(z) {
  // Ende des Zuges wird zum Kopf: Weg umdrehen
  const d = zugLaenge(z) - 2;
  let i = z.weg.length - 1, rest = d, s = z.s;
  while (i > 0 && rest > s) { rest -= s; i--; s = linkLaenge(z.weg[i].a, z.weg[i].b); }
  const sNeu = linkLaenge(z.weg[i].a, z.weg[i].b) - Math.max(0, s - rest);
  const teilWeg = z.weg.slice(i).map((st) => ({ c: st.c, r: st.r, a: st.b, b: st.a })).reverse();
  // Rest des alten Kopfschritts hinter dem neuen Ende ergänzen, damit der letzte Wagen Gleis hat
  z.weg = teilWeg; z.s = sNeu; z.rueck = !z.rueck;
}

// Ereignisse: 'halt' (Bahnhof), 'ab' (Abfahrt), 'wende', 'aus' (Fahrgäste ausgestiegen), 'ein'
export function schritt(w, z, dt, ereignis = () => {}) {
  z.zeit += dt;
  if (!z.weg.length) return;
  const kopf = z.weg[z.weg.length - 1];
  const L = linkLaenge(kopf.a, kopf.b);
  const f = w.z[idx(kopf.c, kopf.r)];
  if (z.zustand === 'halt') {
    z.v = 0; z.warte -= dt;
    if (z.warte <= 0) { z.zustand = 'fahrt'; ereignis('ab', z); }
    return;
  }
  if (z.zustand === 'ende') {
    z.v = 0; z.warte -= dt;
    if (z.warte <= 0) {
      if (weiter(w, kopf.c, kopf.r, kopf.b)) z.zustand = 'fahrt';
      else { wenden(z); z.zustand = 'fahrt'; ereignis('wende', z); }
    }
    return;
  }
  if (!z.laeuft) { z.v = Math.max(0, z.v - 4 * dt); if (z.v === 0) return; }
  // Grenze in diesem Schritt: Gleisende oder Bahnhof (Feldmitte)
  const nach = weiter(w, kopf.c, kopf.r, kopf.b);
  let grenze = Infinity, art = null;
  if (!nach) { grenze = L - 1.5; art = 'ende'; }
  if (f && f.st != null && z.s <= L / 2 + 0.001 && (f.st !== z.letzter || z.zeit - z.letzteZeit > 12)) { if (L / 2 < grenze) { grenze = L / 2; art = 'halt'; } }
  const bremsweg = (z.v * z.v) / (2 * 3.2);
  const restWeg = grenze - z.s;
  const ziel = z.laeuft ? (restWeg < bremsweg + 0.05 && grenze < Infinity ? Math.max(0.6, Math.sqrt(2 * 3.2 * Math.max(0, restWeg))) : TEMPO) : 0;
  z.v += Math.max(-6 * dt, Math.min(2.2 * dt, ziel - z.v));
  let ds = z.v * dt;
  if (z.s + ds >= grenze) {
    z.s = Math.max(z.s, grenze); z.v = 0;
    if (art === 'halt') {
      z.zustand = 'halt'; z.warte = HALT_ZEIT; z.letzter = f.st; z.letzteZeit = z.zeit;
      ereignis('halt', z, f);
      steigeUm(w, z, f, ereignis);
    } else { z.zustand = 'ende'; z.warte = 0.9; ereignis('ende', z); }
    return;
  }
  z.s += ds;
  while (z.s >= linkLaenge(z.weg[z.weg.length - 1].a, z.weg[z.weg.length - 1].b)) {
    const k = z.weg[z.weg.length - 1], LL = linkLaenge(k.a, k.b);
    const n = weiter(w, k.c, k.r, k.b);
    if (!n) { z.s = LL - 1.5; break; }
    z.s -= LL; z.weg.push(n);
    ereignis('feld', z, n);
  }
  kuerzen(z);
}

function steigeUm(w, z, f, ereignis) {
  const aus = z.gaeste.filter((g) => g !== f.st).length;
  z.gaeste = z.gaeste.filter((g) => g === f.st);
  if (aus) { w.fahrgaeste += aus; ereignis('aus', z, f, aus); }
  const ein = Math.min(f.w8 || 0, PLATZ - z.gaeste.length);
  if (ein > 0) { for (let i = 0; i < ein; i++) z.gaeste.push(f.st); f.w8 -= ein; ereignis('ein', z, f, ein); }
}

// Fahrgäste kommen nach und nach an die Bahnsteige
export function bahnsteigeFuellen(w, dt, zufallsZahl = Math.random) {
  w._takt = (w._takt || 0) + dt;
  if (w._takt < 5) return [];
  w._takt = 0;
  const neu = [];
  for (const [k, f] of Object.entries(w.z)) {
    const r = Math.floor(k / BREITE);
    if (f.st == null || !feldOffen(w, k % BREITE, r)) continue;
    if ((f.w8 || 0) < WARTEND_MAX && zufallsZahl() < 0.6) { f.w8 = (f.w8 || 0) + 1; neu.push(Number(k)); }
  }
  return neu;
}

// Nächstes Gebiet freischalten, sobald genug Fahrgäste angekommen sind
export function pruefeFreischalten(w) {
  const g = GEBIETE[w.offen];
  if (!g || w.fahrgaeste < g.ziel) return null;
  w.offen++;
  if (g.zug && !w.zuege.includes(g.zug)) w.zuege.push(g.zug);
  return g;
}

// Belegt der Zug ein Feld? (für Radierer und Gleis-Umbiegen)
export function zugFelder(z) {
  const s = new Set();
  for (const st of z.weg) s.add(idx(st.c, st.r));
  return s;
}

// Prüfen, ob der Weg des Zuges noch auf existierenden Gleisen liegt (nach Änderungen)
export function wegGueltig(w, z) {
  return z.weg.length > 0 && z.weg.every((st) => links(w, st.c, st.r).some((l) => gleich(l, st.a, st.b)));
}

// Felder einer Fingerbewegung lückenlos (nur waagrecht/senkrecht) von p nach q
export function felderZwischen(p, q) {
  const out = []; let [c, r] = p;
  while (c !== q[0] || r !== q[1]) {
    const dc = q[0] - c, dr = q[1] - r;
    if (Math.abs(dc) >= Math.abs(dr)) c += Math.sign(dc); else r += Math.sign(dr);
    out.push([c, r]);
  }
  return out;
}
