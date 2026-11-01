// ROCKET REELS – Mission Jackpot: Spielregeln und Coin-Buchhaltung (ohne DOM, ohne Zufall von außen nicht lauffähig).
// Dieselbe Datei läuft im Browser (Gäste) und in der Supabase Edge Function "rocket-reels" (Konten, Kopie per tools/edge-sync.mjs).
// Grundsatz: Das Ergebnis steht fest, bevor irgendeine Animation startet. Die Oberfläche zeigt nur an, was aktion() zurückgibt.
// Zufall: zufall(n) liefert eine gleichverteilte ganze Zahl 0..n-1 (Browser/Server: kryptoZufall, Tests: seedZufall).
// Alle Beträge sind ganze Space Coins ohne jeden Geldwert.

export const VERSION = 1;

// ------------------------------------------------------------------ Symbole
// Reihenfolge = Wertigkeit. Das Kürzel ist das Zeichen auf den Walzenbändern unten.
export const SYMBOLE = [
  { id: 'rakete', name: 'Goldene Rakete', kurz: 'R' },
  { id: 'astronaut', name: 'Astronaut', kurz: 'S' },
  { id: 'alien', name: 'Alien', kurz: 'L' },
  { id: 'planet', name: 'Ringplanet', kurz: 'P' },
  { id: 'kristall', name: 'Energie-Kristall', kurz: 'C' },
  { id: 'meteor', name: 'Meteor', kurz: 'M' },
  { id: 'satellit', name: 'Satellit', kurz: 'T' },
  { id: 'a', name: 'A', kurz: 'A' },
  { id: 'k', name: 'K', kurz: 'K' },
  { id: 'q', name: 'Q', kurz: 'Q' },
  { id: 'j', name: 'J', kurz: 'J' },
  { id: 'zehn', name: '10', kurz: 'Z' },
  { id: 'stargate', name: 'Stargate', kurz: 'W' }
];
export const WILD = 12; // Stargate: ersetzt jedes reguläre Symbol und ist zugleich Scatter
export const REGULAER = SYMBOLE.slice(0, WILD).map((_, i) => i);
const KURZ = Object.fromEntries(SYMBOLE.map((s, i) => [s.kurz, i]));

// ------------------------------------------------------------------ Auszahlungstabelle (zentral)
// Linien: Vielfaches des Linieneinsatzes (Gesamteinsatz / 10) für 3, 4, 5 gleiche Symbole von links.
export const AUSZAHLUNG = [
  [100, 1000, 5000], // Goldene Rakete
  [50, 400, 2000],   // Astronaut
  [30, 150, 750],    // Alien
  [30, 150, 750],    // Ringplanet
  [25, 100, 400],    // Energie-Kristall
  [20, 75, 250],     // Meteor
  [20, 75, 250],     // Satellit
  [10, 50, 150],     // A
  [10, 50, 150],     // K
  [10, 30, 100],     // Q
  [10, 30, 100],     // J
  [10, 30, 100]      // 10
];
// Stargate-Scatter: Vielfaches des Gesamteinsatzes für 3, 4, 5 Stargates irgendwo auf den Walzen
export const SCATTER = [2, 20, 200];

// 10 feste Gewinnlinien: Zeile (0 oben, 1 Mitte, 2 unten) je Walze
export const LINIEN = [
  [1, 1, 1, 1, 1],
  [0, 0, 0, 0, 0],
  [2, 2, 2, 2, 2],
  [0, 1, 2, 1, 0],
  [2, 1, 0, 1, 2],
  [1, 0, 0, 0, 1],
  [1, 2, 2, 2, 1],
  [0, 0, 1, 2, 2],
  [2, 2, 1, 0, 0],
  [1, 0, 1, 2, 1]
];

// Walzenbänder (im Kreis). Jede Stopp-Position ist gleich wahrscheinlich; sichtbar sind Position, +1, +2.
// Abgestimmt mit tools/rocket-reels-mathe.mjs (exakte Rechnung über alle Stopp-Kombinationen), siehe docs/ROCKET_REELS.md.
export const WALZEN = [
  'WQPCTZKQZKAZSRQLCJAKTJQMJZJAKM',
  'JAPKTAKJCQZTARKZQZJMZQJSLQMW',
  'LRZAJKMQMAZSKJTPCZQTJWAQTK',
  'JSRKAJPZMZJQZTJMQACWAZTKQLK',
  'JQZAJKCLMZTQJMPZKJZKRWSPTQACQK'
];

export const EINSAETZE = [10, 20, 50, 100];
export const START_COINS = 1000;
export const NACHFUELLEN = 1000;  // kostenlos, sobald kein Einsatz mehr möglich ist
export const TAGESBONUS = 100;    // einmal je Kalendertag (Europe/Berlin)
export const FREISPIELE = 10;     // je Auslösung (auch erneut während der Freispiele)
export const FREISPIELE_MAX = 50; // höchstens so viele Freispiele je Bonusrunde
export const SPEZIAL_MIN = 3;     // so viele Walzen braucht das Spezial-Symbol zum Ausdehnen
export const RISIKO_SPRUENGE = 4; // höchstens 4 erfolgreiche Hyperjumps
export const RISIKO_GRENZE = 20000; // ein Sprung wird nur angeboten, wenn der verdoppelte Betrag diese Grenze nicht übersteigt
export const GAST_IMPORT_MAX = 25000; // Gast-Coins, die einmalig ins Konto übernommen werden können
// Theoretische Auszahlungsquote der Bänder oben (exakt berechnet mit tools/rocket-reels-mathe.mjs, im Test geprüft).
// Das Risiko-Spiel ändert sie nicht (50 % Chance auf das Doppelte).
export const QUOTE = 0.9513;

export const BAENDER = WALZEN.map((b) => [...b].map((c) => {
  if (!(c in KURZ)) throw new Error('Unbekanntes Walzenzeichen ' + c);
  return KURZ[c];
}));

// ------------------------------------------------------------------ Zufall
// Gleichverteilt ohne Modulo-Verzerrung (Ablehnungsverfahren).
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
// Nur für Tests und Simulationen: reproduzierbar (mulberry32)
export function seedZufall(seed) {
  let a = seed >>> 0;
  const u32 = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return (t ^ (t >>> 14)) >>> 0; };
  return (n) => { const grenze = Math.floor(0x100000000 / n) * n; let x; do { x = u32(); } while (x >= grenze); return x % n; };
}

// ------------------------------------------------------------------ Auswertung
export function raster(stopps) {
  return BAENDER.map((b, w) => [0, 1, 2].map((r) => b[(stopps[w] + r) % b.length]));
}
export function zufallsStopps(zufall) { return BAENDER.map((b) => zufall(b.length)); }

// Eine Linie von links: erstes Nicht-Stargate bestimmt das Symbol, Stargates ersetzen es.
// Fünf Stargates auf einer Linie zahlen nicht als Linie (sie zahlen als Scatter).
export function linie(r, l) {
  const s = l.map((zeile, w) => r[w][zeile]);
  let sym = -1;
  for (const x of s) if (x !== WILD) { sym = x; break; }
  if (sym < 0) return null;
  let n = 0;
  while (n < 5 && (s[n] === sym || s[n] === WILD)) n++;
  return n >= 3 ? { sym, anzahl: n } : null;
}

// Komplette Auswertung eines Rasters. einsatz = Gesamteinsatz (Vielfaches von 10).
// spezial: Symbol-Index während der Freispiele (sonst null).
export function auswerten(r, einsatz, spezial = null) {
  const lb = einsatz / 10;
  const linien = [];
  let summe = 0;
  LINIEN.forEach((l, i) => {
    const t = linie(r, l);
    if (!t) return;
    const gewinn = AUSZAHLUNG[t.sym][t.anzahl - 3] * lb;
    linien.push({ nr: i + 1, sym: t.sym, anzahl: t.anzahl, gewinn, felder: l.slice(0, t.anzahl).map((z, w) => [w, z]) });
    summe += gewinn;
  });
  const sFelder = [];
  r.forEach((sp, w) => sp.forEach((x, z) => { if (x === WILD) sFelder.push([w, z]); }));
  const sn = sFelder.length;
  const scatter = { anzahl: sn, gewinn: sn >= 3 ? SCATTER[Math.min(sn, 5) - 3] * einsatz : 0, felder: sFelder };
  summe += scatter.gewinn;
  let sp = null;
  if (spezial !== null && spezial !== undefined && spezial !== WILD) {
    const walzen = [];
    r.forEach((s, w) => { if (s.includes(spezial)) walzen.push(w); });
    if (walzen.length >= SPEZIAL_MIN) {
      const jeLinie = AUSZAHLUNG[spezial][walzen.length - 3] * lb;
      sp = { sym: spezial, walzen, jeLinie, gewinn: jeLinie * LINIEN.length };
      summe += sp.gewinn;
    }
  }
  return { linien, scatter, spezial: sp, gesamt: summe, ausloesung: sn >= 3 };
}

// ------------------------------------------------------------------ Zustand
export function neueStatistik() {
  return { runden: 0, einsatz: 0, gewinn: 0, hoechster: 0, freispiele: 0, spruenge: 0, nachgefuellt: 0 };
}
export function neuerZustand() {
  return { v: VERSION, coins: START_COINS, einsatz: EINSAETZE[0], phase: 'bereit', offen: 0, risiko: null, bonus: null,
    letzte: [0, 0, 0, 0, 0], tagesbonus: '', gastUebernommen: false, stats: neueStatistik() };
}

const ganz = (x, min, max) => Number.isInteger(x) && x >= min && x <= max;
// Prüft einen geladenen Zustand (z. B. aus dem localStorage). Ungültig -> null (dann neu beginnen).
export function pruefeZustand(z) {
  if (!z || typeof z !== 'object' || z.v !== VERSION) return null;
  if (!ganz(z.coins, 0, 1e12) || !EINSAETZE.includes(z.einsatz) || !ganz(z.offen, 0, 1e12)) return null;
  if (!['bereit', 'gewinn', 'risiko', 'bonus'].includes(z.phase)) return null;
  if (!Array.isArray(z.letzte) || z.letzte.length !== 5 || z.letzte.some((s, w) => !ganz(s, 0, BAENDER[w].length - 1))) return null;
  if (z.phase === 'bereit' && (z.offen !== 0 || z.risiko || z.bonus)) return null;
  if (z.phase === 'gewinn' && (z.offen <= 0 || z.risiko || z.bonus)) return null;
  if (z.phase === 'risiko' && (z.offen <= 0 || !z.risiko || !ganz(z.risiko.stufe, 0, RISIKO_SPRUENGE - 1) || !ganz(z.risiko.start, 1, 1e12))) return null;
  if (z.phase === 'bonus') {
    const b = z.bonus;
    if (z.offen !== 0 || z.risiko || !b || !ganz(b.sym, 0, WILD - 1) || !ganz(b.rest, 1, FREISPIELE_MAX) || !ganz(b.gesamt, FREISPIELE, FREISPIELE_MAX)
      || !ganz(b.gespielt, 0, FREISPIELE_MAX) || !ganz(b.summe, 0, 1e12) || !EINSAETZE.includes(b.einsatz)) return null;
  }
  const s = z.stats;
  if (!s || typeof s !== 'object' || Object.keys(neueStatistik()).some((k) => !ganz(s[k], 0, 1e15))) return null;
  if (typeof z.tagesbonus !== 'string' || z.tagesbonus.length > 10 || typeof z.gastUebernommen !== 'boolean') return null;
  return z;
}

const kopie = (z) => JSON.parse(JSON.stringify(z));
export const risikoMoeglich = (z) => (z.phase === 'gewinn' && z.offen * 2 <= RISIKO_GRENZE)
  || (z.phase === 'risiko' && z.risiko.stufe < RISIKO_SPRUENGE && z.offen * 2 <= RISIKO_GRENZE);
// Nicht, solange in Texas Hold'em ein Tisch offen ist (dort liegen Coins als Chips) – sonst gäbe es Gratis-Coins ohne Ende.
export const darfNachfuellen = (z) => z.phase === 'bereit' && z.coins < EINSAETZE[0] && !(z.poker && z.poker.t);
// Die Stationen der Risiko-Leiter (Start + bis zu 4 Stufen, solange unter der Grenze)
export function leiter(start) {
  const s = [start];
  while (s.length <= RISIKO_SPRUENGE && s[s.length - 1] * 2 <= RISIKO_GRENZE) s.push(s[s.length - 1] * 2);
  return s;
}

function gutschrift(z, betrag) {
  z.coins += betrag;
  z.stats.gewinn += betrag;
  if (betrag > z.stats.hoechster) z.stats.hoechster = betrag;
}

// ------------------------------------------------------------------ Aktionen
// aktion(zustand, { typ, ... }, zufall, { tag }) -> { zustand, ergebnis } oder { fehler }
// Der übergebene Zustand wird nie verändert. Jede Aktion wird genau einmal ausgewertet.
export function aktion(alt, a, zufall, opt = {}) {
  if (!pruefeZustand(alt)) return { fehler: 'zustand' };
  if (!a || typeof a !== 'object') return { fehler: 'aktion' };
  const z = kopie(alt);
  switch (a.typ) {
    case 'dreh': return dreh(z, a, zufall);
    case 'sichern': {
      if (z.phase !== 'gewinn' && z.phase !== 'risiko') return { fehler: 'nichts_offen' };
      const betrag = z.offen;
      gutschrift(z, betrag);
      z.offen = 0; z.risiko = null; z.phase = 'bereit';
      return { zustand: z, ergebnis: { typ: 'sichern', betrag } };
    }
    case 'risiko': {
      if (z.phase !== 'gewinn' || !risikoMoeglich(z)) return { fehler: 'risiko_nicht_moeglich' };
      z.phase = 'risiko'; z.risiko = { start: z.offen, stufe: 0 };
      return { zustand: z, ergebnis: { typ: 'risiko', leiter: leiter(z.offen) } };
    }
    case 'sprung': {
      if (z.phase !== 'risiko' || !risikoMoeglich(z)) return { fehler: 'kein_sprung' };
      const route = a.route === 1 ? 1 : 0; // die Route ist reine Wahl des Spielers, die Chance ist immer 50 %
      const erfolg = zufall(2) === 1;
      if (!erfolg) {
        const verloren = z.offen;
        z.offen = 0; z.risiko = null; z.phase = 'bereit';
        return { zustand: z, ergebnis: { typ: 'sprung', route, erfolg: false, verloren } };
      }
      z.offen *= 2; z.risiko.stufe += 1; z.stats.spruenge += 1;
      const ergebnis = { typ: 'sprung', route, erfolg: true, betrag: z.offen, stufe: z.risiko.stufe, gesichert: 0 };
      if (!risikoMoeglich(z)) { // oberste Station erreicht: automatisch sichern
        ergebnis.gesichert = z.offen;
        gutschrift(z, z.offen);
        z.offen = 0; z.risiko = null; z.phase = 'bereit';
      }
      return { zustand: z, ergebnis };
    }
    case 'einsatz': {
      if (!EINSAETZE.includes(a.einsatz)) return { fehler: 'einsatz' };
      z.einsatz = a.einsatz;
      return { zustand: z, ergebnis: { typ: 'einsatz' } };
    }
    case 'nachfuellen': {
      if (!darfNachfuellen(z)) return { fehler: 'nicht_noetig' };
      const plus = NACHFUELLEN - z.coins;
      z.coins = NACHFUELLEN; z.stats.nachgefuellt += 1;
      if (z.einsatz > z.coins) z.einsatz = EINSAETZE[0];
      return { zustand: z, ergebnis: { typ: 'nachfuellen', plus } };
    }
    case 'tagesbonus': {
      const tag = opt.tag;
      if (typeof tag !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(tag)) return { fehler: 'tag' };
      if (z.tagesbonus === tag) return { fehler: 'schon_abgeholt' };
      z.tagesbonus = tag; z.coins += TAGESBONUS;
      return { zustand: z, ergebnis: { typ: 'tagesbonus', plus: TAGESBONUS } };
    }
    default: return { fehler: 'aktion' };
  }
}

function dreh(z, a, zufall) {
  let gesichert = 0;
  if (z.phase === 'risiko') return { fehler: 'risiko_laeuft' };
  if (z.phase === 'gewinn') { // START nach einem Gewinn = Gewinn sichern und weiterspielen
    gesichert = z.offen; gutschrift(z, z.offen); z.offen = 0; z.phase = 'bereit';
  }
  if (z.phase === 'bonus') return freispiel(z, zufall);
  const einsatz = a.einsatz === undefined ? z.einsatz : a.einsatz;
  if (!EINSAETZE.includes(einsatz)) return { fehler: 'einsatz' };
  if (einsatz > z.coins) return { fehler: z.coins < EINSAETZE[0] ? 'leer' : 'zu_wenig' };
  z.einsatz = einsatz;
  z.coins -= einsatz;
  z.stats.runden += 1; z.stats.einsatz += einsatz;
  const stopps = zufallsStopps(zufall);
  const r = raster(stopps);
  const w = auswerten(r, einsatz);
  z.letzte = stopps;
  const ergebnis = { typ: 'dreh', stopps, wertung: w, gewinn: w.gesamt, gesichert, frei: false };
  if (w.ausloesung) {
    // Gewinn der auslösenden Runde wird sofort gutgeschrieben (nicht riskierbar), dann beginnen die Freispiele
    if (w.gesamt > 0) gutschrift(z, w.gesamt);
    const sym = REGULAER[zufall(REGULAER.length)];
    z.phase = 'bonus';
    z.bonus = { sym, rest: FREISPIELE, gesamt: FREISPIELE, gespielt: 0, summe: 0, einsatz };
    z.stats.freispiele += 1;
    ergebnis.freispielStart = { sym, anzahl: FREISPIELE };
  } else if (w.gesamt > 0) {
    z.phase = 'gewinn'; z.offen = w.gesamt;
  }
  return { zustand: z, ergebnis };
}

function freispiel(z, zufall) {
  const b = z.bonus;
  const stopps = zufallsStopps(zufall);
  const r = raster(stopps);
  const w = auswerten(r, b.einsatz, b.sym);
  z.letzte = stopps;
  b.rest -= 1; b.gespielt += 1; b.summe += w.gesamt;
  let neu = 0;
  if (w.ausloesung) { neu = Math.min(FREISPIELE, FREISPIELE_MAX - b.gesamt); b.rest += neu; b.gesamt += neu; }
  const ergebnis = { typ: 'dreh', stopps, wertung: w, gewinn: w.gesamt, gesichert: 0, frei: true,
    bonus: { nr: b.gespielt, rest: b.rest, summe: b.summe, sym: b.sym, neu } };
  if (b.rest === 0) {
    gutschrift(z, b.summe);
    ergebnis.bonusEnde = { summe: b.summe, gespielt: b.gespielt };
    z.bonus = null; z.phase = 'bereit';
  }
  return { zustand: z, ergebnis };
}

// ------------------------------------------------------------------ Gast-Übernahme (nur Server, genau einmal je Konto)
// Übernommen wird der höhere Kontostand (nichts wird addiert, also keine doppelte Gutschrift), höchstens GAST_IMPORT_MAX.
// Statistik: Zähler werden addiert, Höchstwert als Maximum. Laufende Phasen des Gasts werden nicht übernommen.
export function gastUebernehmen(konto, gast) {
  if (!pruefeZustand(konto)) return { fehler: 'zustand' };
  if (konto.gastUebernommen) return { fehler: 'schon_uebernommen' };
  const g = pruefeZustand(gast);
  if (!g) return { fehler: 'gast_ungueltig' };
  const z = kopie(konto);
  const gastCoins = Math.min(GAST_IMPORT_MAX, g.coins); // offene, noch nicht gesicherte Gewinne des Gasts zählen nicht
  const vorher = z.coins;
  z.coins = Math.max(z.coins, gastCoins);
  const st = z.stats, gs = g.stats, cap = (x) => Math.min(x, 1e9);
  for (const k of ['runden', 'einsatz', 'gewinn', 'freispiele', 'spruenge', 'nachgefuellt']) st[k] = cap(st[k] + gs[k]);
  st.hoechster = Math.max(st.hoechster, Math.min(gs.hoechster, GAST_IMPORT_MAX * 4));
  z.gastUebernommen = true;
  return { zustand: z, ergebnis: { typ: 'gast', vorher, nachher: z.coins } };
}
