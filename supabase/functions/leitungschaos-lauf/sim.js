// LEITUNGSCHAOS: Regeln und Rätselbau. Ganzzahlig und deterministisch, damit Browser und Prüf-Funktion (Supabase Edge
// Function) jedes Rätsel bitgleich erzeugen und jeden Lösungsweg nachrechnen. Diese Datei wird nach
// supabase/functions/leitungschaos-lauf/sim.js kopiert (node tools/edge-sync.mjs).
//
// Spielprinzip: Raster aus Rohrstücken. Antippen dreht ein Stück um 90° im Uhrzeigersinn. Gelöst ist das Rätsel,
// wenn jede Öffnung an eine passende Öffnung des Nachbarn stößt (kein offenes Ende, nichts zeigt über den Rand)
// und alle Felder mit dem Hydranten verbunden sind. Dann haben alle Häuser Wasser.
//
// Richtungen als Bits: 1 = oben, 2 = rechts, 4 = unten, 8 = links. Ein Feld ist eine Maske aus diesen Bits.
export const VERSION = 1;              // Konfigurationsversion (Regeln + wie aus dem Seed das Tagesrätsel entsteht)
export const MAX_DREHUNGEN = 3000;     // mehr Eingaben nimmt die Prüfung nicht an

export const O = 1, R = 2, U = 4, L = 8;
export const DX = { 1: 0, 2: 1, 4: 0, 8: -1 };
export const DY = { 1: -1, 2: 0, 4: 1, 8: 0 };
export const GEGEN = { 1: 4, 2: 8, 4: 1, 8: 2 };
export const RICHTUNGEN = [O, R, U, L];

// Eine Vierteldrehung im Uhrzeigersinn: oben -> rechts -> unten -> links -> oben
export const dreh = (m) => ((m << 1) | (m >> 3)) & 15;
export const drehN = (m, n) => { for (let i = 0; i < (n & 3); i++) m = dreh(m); return m; };
export const bits = (m) => (m & 1) + ((m >> 1) & 1) + ((m >> 2) & 1) + ((m >> 3) & 1);

// Form eines Stücks: 'ende' (1 Öffnung), 'gerade', 'kurve', 't', 'kreuz'
export function form(m) {
  const n = bits(m);
  if (n === 1) return 'ende';
  if (n === 2) return m === 5 || m === 10 ? 'gerade' : 'kurve';
  if (n === 3) return 't';
  return 'kreuz';
}
// Wie viele Vierteldrehungen bis die Form wieder gleich aussieht (Gerade 2, Kreuz 1, sonst 4)
export const periode = (m) => (m === 15 ? 1 : m === 5 || m === 10 ? 2 : 4);

// ---------------------------------------------------------------------------------------------------------------
// Zufall (mulberry32): nur ganzzahlige Operationen, überall bitgleich.
// ---------------------------------------------------------------------------------------------------------------
export function zufall(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return (t ^ (t >>> 14)) >>> 0;
  };
}
const wuerfel = (rnd, n) => rnd() % n;   // ganzzahlig 0..n-1 (n klein, Verzerrung unerheblich und überall gleich)

// ---------------------------------------------------------------------------------------------------------------
// Konfiguration je Version. Eine Änderung bekommt eine NEUE Version (die alte bleibt, damit frühere Tage
// nachrechenbar bleiben).
//   w, h      Rastergröße
//   zweig     Promille: wie oft der Bau an einer zufälligen statt der neuesten Stelle weiterwächst (mehr = mehr Abzweige)
//   haeuser   [min, max] Häuser (= Enden der Leitung)
//   hausDreh  Hausanschlüsse sind verdreht und müssen mitgedreht werden
//   fix       Promille der normalen Stücke, die richtig herum verschweißt sind (nicht drehbar)
//   falsch    Promille der drehbaren Stücke, die am Anfang mindestens falsch stehen
// ---------------------------------------------------------------------------------------------------------------
export const KONFIG = {
  1: {
    tag: { w: 6, h: 8, zweig: 350, haeuser: [6, 11], hausDreh: false, fix: 0, falsch: 800 }
  }
};

// 30 feste Level (gleich für alle, gehören nicht zur Tageswertung). seed ist fest gewählt und vom Test geprüft.
const LV = (w, h, zweig, haeuser, hausDreh, fix, seed) => ({ w, h, zweig, haeuser, hausDreh, fix, falsch: 800, seed });
export const LEVEL = [
  // 1–5: Grundlagen (Gerade und Kurve, wenige Abzweige)
  LV(3, 3, 0, [1, 2], false, 0, 101), LV(3, 4, 0, [1, 2], false, 0, 102), LV(4, 4, 0, [2, 3], false, 0, 103),
  LV(4, 4, 150, [2, 3], false, 0, 104), LV(4, 5, 150, [2, 4], false, 0, 105),
  // 6–10: mehr Abzweige (T-Stücke, mehrere Häuser)
  LV(4, 5, 400, [3, 5], false, 0, 106), LV(5, 5, 300, [3, 5], false, 0, 107), LV(5, 5, 450, [4, 6], false, 0, 108),
  LV(5, 6, 350, [4, 6], false, 0, 109), LV(5, 6, 500, [5, 7], false, 0, 110),
  // 11–17: Hausanschlüsse drehen sich mit
  LV(4, 5, 250, [3, 4], true, 0, 111), LV(5, 5, 300, [3, 5], true, 0, 112), LV(5, 6, 300, [4, 6], true, 0, 113),
  LV(5, 6, 400, [4, 6], true, 0, 114), LV(6, 6, 300, [4, 7], true, 0, 115), LV(6, 7, 350, [5, 8], true, 0, 116),
  LV(6, 7, 450, [6, 9], true, 0, 117),
  // 18–24: große Felder mit verschweißten Stücken (geben Halt)
  LV(6, 8, 300, [6, 9], false, 120, 118), LV(6, 8, 400, [6, 10], false, 100, 119), LV(7, 8, 350, [6, 10], false, 100, 120),
  LV(7, 8, 450, [7, 11], false, 90, 121), LV(7, 9, 350, [7, 11], false, 90, 122), LV(7, 9, 450, [8, 12], false, 80, 123),
  LV(7, 9, 500, [8, 13], false, 70, 124),
  // 25–30: Meister (groß, Hausanschlüsse drehen sich, kaum Halt)
  LV(6, 8, 350, [6, 10], true, 60, 125), LV(7, 8, 400, [7, 11], true, 50, 126), LV(7, 9, 350, [7, 11], true, 40, 127),
  LV(7, 9, 450, [8, 12], true, 30, 128), LV(7, 9, 500, [8, 13], true, 0, 129), LV(7, 9, 550, [9, 14], true, 0, 130)
];

// ---------------------------------------------------------------------------------------------------------------
// Rätselbau. Ergebnis:
//   w, h, n = w*h, quelle (Feldindex des Hydranten)
//   loesung[i]  Maske der gebauten Leitung (ein Baum über alle Felder, Wurzel = Hydrant)
//   start[i]    Maske zu Beginn (verdreht)
//   art[i]      'q' Hydrant (fest), 'h' Haus, 'r' Rohr
//   fest[i]     true = nicht drehbar (Hydrant, Häuser ohne hausDreh, verschweißte Rohre)
//   par         Mindestzahl Drehungen bis zur gebauten Lösung
// ---------------------------------------------------------------------------------------------------------------
export function baueRaetsel(seed, K) {
  const rnd = zufall(seed);
  for (let versuch = 0; versuch < 200; versuch++) {
    const r = versuchBau(rnd, K);
    if (r) return r;
  }
  throw new Error('kein_raetsel');
}

function versuchBau(rnd, K) {
  const { w, h } = K, n = w * h;
  const m = new Array(n).fill(0);
  // Hydrant möglichst nicht am Rand (wenn das Feld groß genug ist)
  const qx = w >= 3 ? 1 + wuerfel(rnd, w - 2) : wuerfel(rnd, w);
  const qy = h >= 3 ? 1 + wuerfel(rnd, h - 2) : wuerfel(rnd, h);
  const quelle = qy * w + qx;
  const besucht = new Array(n).fill(false); besucht[quelle] = true;
  const offen = [quelle];
  // Wachsender Baum: meist an der neuesten Stelle weiter (lange Leitungen), mit Wahrscheinlichkeit "zweig" an einer zufälligen (Abzweige)
  while (offen.length) {
    const k = wuerfel(rnd, 1000) < K.zweig ? wuerfel(rnd, offen.length) : offen.length - 1;
    const c = offen[k], cx = c % w, cy = (c - cx) / w;
    const frei = [];
    for (const d of RICHTUNGEN) {
      const nx = cx + DX[d], ny = cy + DY[d];
      if (nx >= 0 && ny >= 0 && nx < w && ny < h && !besucht[ny * w + nx]) frei.push(d);
    }
    if (!frei.length) { offen.splice(k, 1); continue; }
    const d = frei[wuerfel(rnd, frei.length)], z = c + DY[d] * w + DX[d];
    m[c] |= d; m[z] |= GEGEN[d]; besucht[z] = true; offen.push(z);
  }
  const art = m.map((x, i) => (i === quelle ? 'q' : bits(x) === 1 ? 'h' : 'r'));
  const haeuser = art.filter((a) => a === 'h').length;
  if (haeuser < K.haeuser[0] || haeuser > K.haeuser[1]) return null;
  // Häuser nicht direkt neben dem Hydranten (sonst wäre es zu leicht)
  for (const d of RICHTUNGEN) if (m[quelle] & d) { const z = quelle + DY[d] * w + DX[d]; if (art[z] === 'h') return null; }

  const fest = art.map((a) => a === 'q' || (a === 'h' && !K.hausDreh));
  // Verschweißte Rohre (nur Kurven, Geraden und T-Stücke; Kreuze sehen ohnehin immer gleich aus)
  if (K.fix) {
    const kandidaten = [];
    for (let i = 0; i < n; i++) if (art[i] === 'r' && m[i] !== 15) kandidaten.push(i);
    const anzahl = Math.floor((kandidaten.length * K.fix + 500) / 1000);
    for (let j = 0; j < anzahl; j++) { const k = wuerfel(rnd, kandidaten.length); fest[kandidaten[k]] = true; kandidaten.splice(k, 1); }
  }
  // Verdrehen: so lange, bis genug Stücke falsch stehen und das Rätsel nicht schon gelöst ist
  const drehbar = []; for (let i = 0; i < n; i++) if (!fest[i] && periode(m[i]) > 1) drehbar.push(i);
  if (!drehbar.length) return null;
  let start;
  for (let v = 0; v < 50; v++) {
    start = m.slice();
    for (const i of drehbar) start[i] = drehN(m[i], wuerfel(rnd, 4));
    const falsch = drehbar.filter((i) => start[i] !== m[i]).length;
    if (falsch * 1000 >= drehbar.length * K.falsch && !geloest({ w, h, n, quelle }, start)) break;
    start = null;
  }
  if (!start) return null;
  let par = 0;
  for (const i of drehbar) { let k = 0; while (drehN(start[i], k) !== m[i]) k++; par += k; }
  return { w, h, n, quelle, loesung: m, start, art, fest, par, haeuser };
}

// ---------------------------------------------------------------------------------------------------------------
// Prüfen
// ---------------------------------------------------------------------------------------------------------------
// Welche Felder bekommen Wasser? Vom Hydranten aus über Verbindungen, bei denen beide Seiten offen sind.
// Rückgabe: { nass: Uint8Array, lecks: Anzahl offener Enden im nassen Bereich }
export function fluss(r, masken) {
  const { w, h, n, quelle } = r;
  const nass = new Uint8Array(n); nass[quelle] = 1;
  const stapel = [quelle]; let lecks = 0;
  while (stapel.length) {
    const c = stapel.pop(), cx = c % w, cy = (c - cx) / w;
    for (const d of RICHTUNGEN) {
      if (!(masken[c] & d)) continue;
      const nx = cx + DX[d], ny = cy + DY[d];
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) { lecks++; continue; }
      const z = ny * w + nx;
      if (!(masken[z] & GEGEN[d])) { lecks++; continue; }
      if (!nass[z]) { nass[z] = 1; stapel.push(z); }
    }
  }
  return { nass, lecks };
}
// Gelöst: alle Felder nass und kein offenes Ende (ein offenes Ende außerhalb des nassen Bereichs gibt es dann nicht mehr)
export function geloest(r, masken) {
  const f = fluss(r, masken);
  if (f.lecks) return false;
  for (let i = 0; i < r.n; i++) if (!f.nass[i]) return false;
  return true;
}

// ---------------------------------------------------------------------------------------------------------------
// Spielstand: Drehungen anwenden
// ---------------------------------------------------------------------------------------------------------------
export function neuesSpiel(r) {
  return { masken: r.start.slice(), drehungen: 0, geloest: false };
}
// Gibt true zurück, wenn gedreht wurde
export function tippe(r, s, i) {
  if (s.geloest || !Number.isInteger(i) || i < 0 || i >= r.n || r.fest[i]) return false;
  s.masken[i] = dreh(s.masken[i]); s.drehungen++;
  if (geloest(r, s.masken)) s.geloest = true;
  return true;
}

// Eingaben: Feldindizes in Reihenfolge, je Tipp ein Zeichen (0-9, a-z, A-Z, '-', '_' = 0..63)
const ZEICHEN = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ-_';
export function kodiere(tipps) { return tipps.map((i) => ZEICHEN[i]).join(''); }
export function dekodiere(text, n) {
  if (typeof text !== 'string' || text.length > MAX_DREHUNGEN) return null;
  const out = [];
  for (const ch of text) { const i = ZEICHEN.indexOf(ch); if (i < 0 || i >= n) return null; out.push(i); }
  return out;
}

// Nachfahren: Tipps -> Ergebnis. Jeder Tipp muss ein drehbares Feld treffen; gelöst sein darf das Rätsel erst nach dem letzten Tipp.
export function nachfahren(r, tipps) {
  const s = neuesSpiel(r);
  for (let k = 0; k < tipps.length; k++) {
    if (s.geloest) return { fehler: 'nach_loesung' };
    if (!tippe(r, s, tipps[k])) return { fehler: 'eingaben' };
  }
  return { geloest: s.geloest, drehungen: s.drehungen };
}

// Tagesrätsel aus Seed + Version
export function tagesRaetsel(seed, version) {
  const K = KONFIG[version];
  if (!K || !Number.isInteger(seed) || seed < 1) return null;
  return baueRaetsel(seed, K.tag);
}
export const levelRaetsel = (nr) => { const K = LEVEL[nr - 1]; return K ? baueRaetsel(K.seed, K) : null; };

// Serverseitige Prüfung eines gemeldeten Tagesrätsels. Seed und Version kommen aus der Datenbank (Run-ID), nie vom Browser.
// Die Zeit misst die Datenbank selbst (Ausgabe der Run-ID bis Abschluss); der Browser meldet nur die Drehungen.
export function pruefeLauf(seed, version, lauf) {
  try {
    const r = tagesRaetsel(seed, version);
    if (!r) return { ok: false, grund: 'version' };
    if (!lauf || typeof lauf !== 'object') return { ok: false, grund: 'ungueltig' };
    const tipps = dekodiere(lauf.inputs, r.n);
    if (!tipps || !tipps.length) return { ok: false, grund: 'eingaben' };
    const e = nachfahren(r, tipps);
    if (e.fehler) return { ok: false, grund: e.fehler };
    if (!e.geloest) return { ok: false, grund: 'nicht_geloest' };
    if (e.drehungen !== lauf.drehungen) return { ok: false, grund: 'ergebnis_weicht_ab', drehungen: e.drehungen };
    return { ok: true, drehungen: e.drehungen, par: r.par };
  } catch (e) { return { ok: false, grund: 'fehler' }; }
}
