// ROULETTE – Spielregeln (europäisch, eine Null) ohne DOM. Läuft im Browser (Gäste) und in der Edge Function "rocket-reels"
// (Konten, Kopie per node tools/edge-sync.mjs). Keine Importe: Die Datei arbeitet auf dem gemeinsamen Coin-Stand von Rocket Reels
// (z.coins) und legt ihre eigenen Daten nur unter z.roulette ab. Alles andere im Stand bleibt unangetastet.
// Grundsatz wie bei Rocket Reels: Das Ergebnis steht fest, bevor die Kugel rollt. Zufall: zufall(37) gleichverteilt.
// Alle Beträge sind ganze Coins ohne jeden Geldwert.

export const VERSION = 1;

// Zahlenfolge im Kessel (europäisch, im Uhrzeigersinn ab der Null)
export const KESSEL = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
export const ROT = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
const ROT_SET = new Set(ROT);
export const farbe = (n) => (n === 0 ? 'gruen' : ROT_SET.has(n) ? 'rot' : 'schwarz');

export const JETONS = [1, 5, 25, 100, 500];
export const FELD_MAX = 500;    // höchstens so viel auf einem Wettfeld
export const RUNDE_MAX = 5000;  // höchstens so viel Einsatz je Runde
export const WETTEN_MAX = 160;  // höchstens so viele belegte Felder je Runde
export const PERM_MAX = 50;     // so viele letzte Zahlen werden gemerkt
// Theoretische Auszahlungsquote: Jede Wette zahlt 36/(Anzahl Zahlen) inklusive Einsatz → 36/37 bei jeder Wette.
export const QUOTE = 36 / 37;

// ------------------------------------------------------------------ Wettfelder
// Schlüssel: Innenwetten = beteiligte Zahlen aufsteigend mit "-" verbunden ("17", "17-20", "25-26-28-29"),
// Außenwetten = Name. Auszahlung (Faktor, ohne den Einsatz) = 36 / Anzahl Zahlen − 1.
export const schluessel = (zahlen) => [...zahlen].sort((a, b) => a - b).join('-');
const bereich = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const ART_NAMEN = { plein: 'Plein', cheval: 'Cheval', trans: 'Transversale', carre: 'Carré', sixain: 'Sixain', dutzend: 'Dutzend', kolonne: 'Kolonne', einfach: 'Einfache Chance' };

function baueWetten() {
  const m = new Map();
  const add = (key, zahlen, art, name) => { m.set(key, { key, zahlen, art, name: name || key, faktor: 36 / zahlen.length - 1 }); };
  const innen = (zahlen, art) => add(schluessel(zahlen), [...zahlen].sort((a, b) => a - b), art, schluessel(zahlen).replace(/-/g, '/'));
  for (let n = 0; n <= 36; n++) innen([n], 'plein');
  for (let r = 0; r < 12; r++) for (let c = 0; c < 2; c++) { const n = 3 * r + c + 1; innen([n, n + 1], 'cheval'); }
  for (let r = 0; r < 11; r++) for (let c = 0; c < 3; c++) { const n = 3 * r + c + 1; innen([n, n + 3], 'cheval'); }
  for (const n of [1, 2, 3]) innen([0, n], 'cheval');
  for (let r = 0; r < 12; r++) innen(bereich(3 * r + 1, 3 * r + 3), 'trans');
  innen([0, 1, 2], 'trans'); innen([0, 2, 3], 'trans');
  for (let r = 0; r < 11; r++) for (let c = 0; c < 2; c++) { const n = 3 * r + c + 1; innen([n, n + 1, n + 3, n + 4], 'carre'); }
  innen([0, 1, 2, 3], 'carre');
  for (let r = 0; r < 11; r++) innen(bereich(3 * r + 1, 3 * r + 6), 'sixain');
  add('d1', bereich(1, 12), 'dutzend', '1. Dutzend'); add('d2', bereich(13, 24), 'dutzend', '2. Dutzend'); add('d3', bereich(25, 36), 'dutzend', '3. Dutzend');
  for (let c = 1; c <= 3; c++) add('k' + c, bereich(0, 11).map((r) => 3 * r + c), 'kolonne', c + '. Kolonne');
  add('rot', ROT, 'einfach', 'Rot'); add('schwarz', bereich(1, 36).filter((n) => !ROT_SET.has(n)), 'einfach', 'Schwarz');
  add('gerade', bereich(1, 36).filter((n) => n % 2 === 0), 'einfach', 'Gerade'); add('ungerade', bereich(1, 36).filter((n) => n % 2 === 1), 'einfach', 'Ungerade');
  add('manque', bereich(1, 18), 'einfach', '1–18'); add('passe', bereich(19, 36), 'einfach', '19–36');
  return m;
}
export const WETTEN = baueWetten();
export const artName = (art) => ART_NAMEN[art] || art;

// Kesselwetten (Annoncen): Liste von [Schlüssel, Stücke]. Gesetzt wird je Stück ein Jeton des gewählten Werts.
export const ANNONCEN = {
  voisins: { name: 'Voisins du Zéro', zahlen: 17, felder: [['0-2-3', 2], ['4-7', 1], ['12-15', 1], ['18-21', 1], ['19-22', 1], ['25-26-28-29', 2], ['32-35', 1]] },
  tiers: { name: 'Tiers du Cylindre', zahlen: 12, felder: [['5-8', 1], ['10-11', 1], ['13-16', 1], ['23-24', 1], ['27-30', 1], ['33-36', 1]] },
  orphelins: { name: 'Orphelins', zahlen: 8, felder: [['1', 1], ['6-9', 1], ['14-17', 1], ['17-20', 1], ['31-34', 1]] },
  zero: { name: 'Jeu Zéro', zahlen: 7, felder: [['0-3', 1], ['12-15', 1], ['26', 1], ['32-35', 1]] }
};
// Nachbarn: die Zahl und je zwei links und rechts im Kessel (5 Plein-Wetten)
export function nachbarn(n, weite = 2) {
  const i = KESSEL.indexOf(n); if (i < 0) return [];
  const r = []; for (let d = -weite; d <= weite; d++) r.push(KESSEL[(i + d + 37) % 37]);
  return r;
}

// ------------------------------------------------------------------ Zufall (wie Rocket Reels, damit die Datei allein läuft)
export function kryptoZufall(cr = globalThis.crypto) {
  const buf = new Uint32Array(1);
  return (n) => {
    if (!(n >= 1 && n <= 0x100000000)) throw new Error('zufall: n ungültig');
    const grenze = Math.floor(0x100000000 / n) * n;
    let x;
    do { cr.getRandomValues(buf); x = buf[0]; } while (x >= grenze);
    return x % n;
  };
}

// ------------------------------------------------------------------ Prüfen und Auswerten
const ganz = (x, min, max) => Number.isInteger(x) && x >= min && x <= max;

// wetten = { schluessel: betrag }. Ergebnis { summe, anzahl } oder { fehler }
export function pruefeWetten(w) {
  if (!w || typeof w !== 'object' || Array.isArray(w)) return { fehler: 'wetten' };
  const keys = Object.keys(w);
  if (keys.length === 0) return { fehler: 'keine_wette' };
  if (keys.length > WETTEN_MAX) return { fehler: 'zu_viele' };
  let summe = 0;
  for (const k of keys) {
    if (!WETTEN.has(k)) return { fehler: 'wetten' };
    if (!ganz(w[k], 1, FELD_MAX)) return { fehler: 'feld_limit' };
    summe += w[k];
  }
  if (summe > RUNDE_MAX) return { fehler: 'runde_limit' };
  return { summe, anzahl: keys.length };
}

// Auswertung einer Zahl. rueck = zurück an den Spieler (Einsatz + Gewinn der Treffer)
export function auswerten(w, zahl) {
  const treffer = [];
  let rueck = 0, summe = 0;
  for (const [k, b] of Object.entries(w)) {
    summe += b;
    const d = WETTEN.get(k);
    if (d.zahlen.includes(zahl)) { const r = b * (d.faktor + 1); treffer.push({ key: k, betrag: b, rueck: r }); rueck += r; }
  }
  return { zahl, farbe: farbe(zahl), treffer, einsatz: summe, rueck, netto: rueck - summe };
}

// ------------------------------------------------------------------ Eigene Daten im gemeinsamen Stand
export function neueStatistik() { return { runden: 0, einsatz: 0, gewinn: 0, hoechster: 0, plein: 0 }; }
export function neuerTeil() { return { v: VERSION, perm: [], stats: neueStatistik() }; }
export function pruefeTeil(r) {
  if (!r || typeof r !== 'object' || r.v !== VERSION) return null;
  if (!Array.isArray(r.perm) || r.perm.length > PERM_MAX || r.perm.some((n) => !ganz(n, 0, 36))) return null;
  const s = r.stats;
  if (!s || typeof s !== 'object' || Object.keys(neueStatistik()).some((k) => !ganz(s[k], 0, 1e15))) return null;
  return r;
}
// Teil aus einem Stand holen (fehlt er, beginnt Roulette frisch; ist er kaputt, wird nichts überschrieben → null)
export function teil(z) {
  if (!z || z.roulette === undefined) return neuerTeil();
  return pruefeTeil(z.roulette);
}

// ------------------------------------------------------------------ Drehen
// z = gemeinsamer Stand (bereits von Rocket Reels geprüft). Der übergebene Stand wird nie verändert.
// Rückgabe { zustand, ergebnis } oder { fehler }
export function drehen(z, wetten, zufall) {
  if (!z || typeof z !== 'object' || !ganz(z.coins, 0, 1e12)) return { fehler: 'zustand' };
  const t = teil(z);
  if (!t) return { fehler: 'zustand' };
  const p = pruefeWetten(wetten);
  if (p.fehler) return p;
  if (p.summe > z.coins) return { fehler: 'zu_wenig' };
  const w = {}; for (const k of Object.keys(wetten)) w[k] = wetten[k]; // nur geprüfte Felder, keine fremden Eigenschaften
  const zahl = zufall(37);
  const a = auswerten(w, zahl);
  const neu = JSON.parse(JSON.stringify(z));
  const r = JSON.parse(JSON.stringify(t));
  neu.coins = z.coins - a.einsatz + a.rueck;
  r.perm = [zahl, ...r.perm].slice(0, PERM_MAX);
  r.stats.runden += 1; r.stats.einsatz += a.einsatz; r.stats.gewinn += a.rueck;
  if (a.netto > r.stats.hoechster) r.stats.hoechster = a.netto;
  if (a.treffer.some((x) => WETTEN.get(x.key).art === 'plein')) r.stats.plein += 1;
  neu.roulette = r;
  return { zustand: neu, ergebnis: { typ: 'roulette', ...a } };
}

// Gast-Übernahme ins Konto (nur Statistik; Coins regelt Rocket Reels): Zähler addieren, Höchstwert als Maximum.
export function gastZusammen(konto, gast) {
  const k = pruefeTeil(konto === undefined ? neuerTeil() : konto) ? JSON.parse(JSON.stringify(konto === undefined ? neuerTeil() : konto)) : null;
  if (!k) return konto; // kaputter Konto-Teil: unverändert lassen
  const g = gast === undefined ? null : pruefeTeil(gast);
  if (!g) return k;
  const cap = (x) => Math.min(x, 1e9);
  for (const key of ['runden', 'einsatz', 'gewinn', 'plein']) k.stats[key] = cap(k.stats[key] + g.stats[key]);
  k.stats.hoechster = Math.max(k.stats.hoechster, Math.min(g.stats.hoechster, 100000));
  if (!k.perm.length) k.perm = g.perm.slice(0, PERM_MAX);
  return k;
}
