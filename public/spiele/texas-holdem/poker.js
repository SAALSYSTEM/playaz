// TEXAS HOLD'EM – Regeln, Handbewertung und Computergegner ohne DOM, ohne Importe.
// Läuft im Browser (Gäste) und in der Edge Function "rocket-reels" (Konten, Kopie per node tools/edge-sync.mjs).
// Arbeitet auf dem gemeinsamen Casino-Stand (z.coins wie Rocket Reels/Roulette) und legt eigene Daten unter z.poker ab.
// Grundsatz: Jede Aktion wird vollständig ausgewertet (inkl. aller Computerzüge), die Oberfläche spielt nur die Ereignisse ab.
// Computergegner sehen NIE fremde Karten: Sie schätzen ihre Chancen nur aus eigenen Karten und dem Board.
// Karten: Zahl 0–51, Rang = k >> 2 (0 = Zwei … 12 = Ass), Farbe = k & 3 (0 ♠, 1 ♥, 2 ♦, 3 ♣). Alle Beträge sind Coins ohne Geldwert.

export const VERSION = 1;
export const PLAETZE = 6;
export const RANG = '23456789TJQKA';
export const FARBE = ['♠', '♥', '♦', '♣'];
export const kartenText = (k) => RANG[k >> 2] + FARBE[k & 3];

// Cash-Tische: Blinds und erlaubtes Buy-in (in Coins = Chips)
export const CASH = [
  { name: 'Kleiner Tisch', sb: 5, bb: 10, min: 200, max: 1000 },
  { name: 'Mittlerer Tisch', sb: 25, bb: 50, min: 1000, max: 5000 },
  { name: 'Hoher Tisch', sb: 100, bb: 200, min: 4000, max: 20000 }
];
// Sit & Go: 6 Spieler, alle 1.500 Chips, Blinds steigen alle 6 Hände. Preis: 1. Platz 4× Buy-in, 2. Platz 2× Buy-in.
export const SNG = [{ buyin: 100 }, { buyin: 500 }, { buyin: 2000 }];
export const SNG_STACK = 1500;
export const SNG_HAENDE = 6;
export const SNG_BLINDS = [[10, 20], [15, 30], [25, 50], [40, 80], [60, 120], [100, 200], [150, 300], [200, 400], [300, 600], [500, 1000], [800, 1600], [1200, 2400], [2000, 4000]];
export const SNG_PREIS = [4, 2];

// Computergegner: Name und Spielstil (open = nötige Chen-Punkte zum Mitgehen, raise = zum Erhöhen,
// bluff = Bluff-Neigung, mut = wie gern nach dem Flop gesetzt wird, call = Faktor auf die Pot-Odds (kleiner = callt mehr),
// zaeh = wie sehr Erhöhungen abschrecken (kleiner = callt auch gegen Druck))
export const BOTS = {
  kalle: { name: 'Kalle', stil: 'Gemütlich – geht fast immer mit', open: 4, raise: 12, bluff: 0.03, mut: 0.72, call: 0.6, zaeh: 0.5 },
  vera: { name: 'Vera', stil: 'Kühl – spielt wenig, aber hart', open: 9, raise: 10, bluff: 0.07, mut: 0.55, call: 1.05, zaeh: 1 },
  bruno: { name: 'Bruno', stil: 'Bluffer – setzt gern unter Druck', open: 5, raise: 7, bluff: 0.22, mut: 0.5, call: 0.9, zaeh: 0.8 },
  hilde: { name: 'Oma Hilde', stil: 'Der Fels – wartet auf Asse', open: 10, raise: 12, bluff: 0.01, mut: 0.68, call: 1.25, zaeh: 1.2 },
  lindqvist: { name: 'Prof. Lindqvist', stil: 'Rechner – solide und schwer zu lesen', open: 7, raise: 9, bluff: 0.09, mut: 0.58, call: 1.0, zaeh: 1 }
};
export const BOT_IDS = Object.keys(BOTS);

// ------------------------------------------------------------------ Zufall
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
// schnelle, reproduzierbare Folge (für die Rechnungen der Computergegner und für Tests)
export function seedZufall(seed) {
  let a = seed >>> 0;
  const u32 = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return (t ^ (t >>> 14)) >>> 0; };
  return (n) => { const grenze = Math.floor(0x100000000 / n) * n; let x; do { x = u32(); } while (x >= grenze); return x % n; };
}
function mischen(zufall) {
  const d = Array.from({ length: 52 }, (_, i) => i);
  for (let i = 51; i > 0; i--) { const j = zufall(i + 1); const x = d[i]; d[i] = d[j]; d[j] = x; }
  return d;
}

// ------------------------------------------------------------------ Handbewertung (5 bis 7 Karten) → Zahl, größer = besser
export const HAND_NAMEN = ['Höchste Karte', 'Ein Paar', 'Zwei Paare', 'Drilling', 'Straße', 'Flush', 'Full House', 'Vierling', 'Straight Flush'];
function strasse(m) {
  for (let h = 12; h >= 4; h--) { const n = 0x1F << (h - 4); if ((m & n) === n) return h; }
  return (m & 0x100F) === 0x100F ? 3 : -1; // A-2-3-4-5
}
const punkte = (kat, ks) => { let v = kat; for (let i = 0; i < 5; i++) v = v * 16 + (ks[i] === undefined ? 0 : ks[i] + 1); return v; };
export function wert(karten) {
  const cnt = new Array(13).fill(0), sc = [0, 0, 0, 0], sm = [0, 0, 0, 0]; let m = 0;
  for (const k of karten) { const r = k >> 2, s = k & 3; cnt[r]++; sc[s]++; sm[s] |= 1 << r; m |= 1 << r; }
  for (let s = 0; s < 4; s++) if (sc[s] >= 5) {
    const sf = strasse(sm[s]); if (sf >= 0) return punkte(8, [sf]);
  }
  const vier = [], drei = [], zwei = [], eins = [];
  for (let r = 12; r >= 0; r--) { const c = cnt[r]; if (c === 4) vier.push(r); else if (c === 3) drei.push(r); else if (c === 2) zwei.push(r); else if (c === 1) eins.push(r); }
  if (vier.length) { const rest = [...drei, ...zwei, ...eins].sort((a, b) => b - a); return punkte(7, [vier[0], rest[0]]); }
  if (drei.length && (drei.length > 1 || zwei.length)) { const p = drei.length > 1 ? Math.max(drei[1], zwei[0] === undefined ? -1 : zwei[0]) : zwei[0]; return punkte(6, [drei[0], p]); }
  for (let s = 0; s < 4; s++) if (sc[s] >= 5) { const ks = []; for (let r = 12; r >= 0 && ks.length < 5; r--) if (sm[s] & (1 << r)) ks.push(r); return punkte(5, ks); }
  const st = strasse(m); if (st >= 0) return punkte(4, [st]);
  if (drei.length) return punkte(3, [drei[0], ...eins.slice(0, 2)]);
  if (zwei.length >= 2) { const k = [...zwei.slice(2), ...eins].sort((a, b) => b - a)[0]; return punkte(2, [zwei[0], zwei[1], k]); }
  if (zwei.length) return punkte(1, [zwei[0], ...eins.slice(0, 3)]);
  return punkte(0, eins.slice(0, 5));
}
export const kategorie = (w) => Math.floor(w / 16 ** 5);
export function handName(w) {
  const k = kategorie(w);
  if (k === 8 && Math.floor(w / 16 ** 4) % 16 === 13) return 'Royal Flush';
  return HAND_NAMEN[k];
}
// die fünf Karten, die die Hand bilden (für die Anzeige)
export function besteFuenf(karten) {
  const ziel = wert(karten); const n = karten.length;
  for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) {
    const f = karten.filter((_, i) => i !== a && i !== b);
    if (n === 7 && wert(f) === ziel) return f;
  }
  return karten.slice(0, 5);
}

// Chen-Formel: Stärke zweier Startkarten (etwa −1 bis 20)
export function chen(k1, k2) {
  let a = k1 >> 2, b = k2 >> 2; if (b > a) { const x = a; a = b; b = x; }
  const basis = (r) => (r === 12 ? 10 : r === 11 ? 8 : r === 10 ? 7 : r === 9 ? 6 : (r + 2) / 2);
  let p = basis(a);
  if (a === b) return Math.max(5, p * 2);
  if ((k1 & 3) === (k2 & 3)) p += 2;
  const luecke = a - b - 1;
  p -= luecke <= 0 ? 0 : luecke === 1 ? 1 : luecke === 2 ? 2 : luecke === 3 ? 4 : 5;
  if (luecke <= 1 && a < 10) p += 1;
  return Math.ceil(p);
}
// Gewinnchance per Simulation – nur mit eigenen Karten und Board, Gegnerkarten sind unbekannt
export function chance(eigene, board, gegner, rnd, laeufe = 90) {
  const bekannt = new Set([...eigene, ...board]);
  const rest = []; for (let k = 0; k < 52; k++) if (!bekannt.has(k)) rest.push(k);
  let punkteSumme = 0;
  for (let l = 0; l < laeufe; l++) {
    const n = rest.length;
    let zieh = 0; const nimm = () => { const j = zieh + rnd(n - zieh); const x = rest[j]; rest[j] = rest[zieh]; rest[zieh] = x; return rest[zieh++]; };
    const b = board.slice(); while (b.length < 5) b.push(nimm());
    const mein = wert([...eigene, ...b]);
    let besser = false, gleich = 0;
    for (let g = 0; g < gegner && !besser; g++) { const w = wert([nimm(), nimm(), ...b]); if (w > mein) besser = true; else if (w === mein) gleich++; }
    if (!besser) punkteSumme += 1 / (1 + gleich);
  }
  return punkteSumme / laeufe;
}

// ------------------------------------------------------------------ Zustand
export function neueStatistik() { return { haende: 0, gewonnen: 0, groessterPot: 0, cashEin: 0, cashAus: 0, sng: 0, sngSieg: 0, sngZweiter: 0 }; }
export function neuerTeil() { return { v: VERSION, stats: neueStatistik(), t: null }; }
const ganz = (x, min, max) => Number.isInteger(x) && x >= min && x <= max;
const karte = (k) => ganz(k, 0, 51);
const PHASEN = ['preflop', 'flop', 'turn', 'river', 'ende', 'leer'];
export function pruefeTeil(p) {
  if (!p || typeof p !== 'object' || p.v !== VERSION) return null;
  const s = p.stats; if (!s || typeof s !== 'object' || Object.keys(neueStatistik()).some((k) => !ganz(s[k], 0, 1e15))) return null;
  if (p.t === null) return p;
  const t = p.t;
  if (!t || typeof t !== 'object' || !['cash', 'sng'].includes(t.art) || !ganz(t.stufe, 0, 2) || !PHASEN.includes(t.phase)) return null;
  if (!ganz(t.sb, 1, 1e7) || !ganz(t.bb, 2, 1e7) || !ganz(t.nr, 0, 1e9) || !ganz(t.dealer, 0, PLAETZE - 1) || !ganz(t.zug, -1, PLAETZE - 1)) return null;
  if (!ganz(t.hoch, 0, 1e9) || !ganz(t.minR, 0, 1e9) || !ganz(t.ein, 0, 1e12)) return null;
  if (!Array.isArray(t.deck) || t.deck.length > 52 || !t.deck.every(karte) || !Array.isArray(t.board) || t.board.length > 5 || !t.board.every(karte)) return null;
  if (!Array.isArray(t.s) || t.s.length !== PLAETZE) return null;
  for (let i = 0; i < PLAETZE; i++) {
    const x = t.s[i];
    if (!x || typeof x !== 'object' || (i === 0 ? x.b !== '' : !BOT_IDS.includes(x.b))) return null;
    if (!ganz(x.c, 0, 1e12) || !ganz(x.e, 0, 1e12) || !ganz(x.g, 0, 1e12)) return null;
    if (x.k !== null && !(Array.isArray(x.k) && x.k.length === 2 && x.k.every((k) => karte(k) || k === -1))) return null;
    for (const f of ['f', 'a', 'o', 'r', 'h']) if (typeof x[f] !== 'boolean') return null;
  }
  if (t.art === 'sng') { const g = t.sng; if (!g || !ganz(g.buyin, 1, 1e7) || !ganz(g.level, 0, SNG_BLINDS.length - 1) || !ganz(g.rest, 0, 99) || !ganz(g.lebend, 1, PLAETZE)) return null; }
  return p;
}
export function teil(z) {
  if (!z || z.poker === undefined) return neuerTeil();
  return pruefeTeil(z.poker);
}
// Was die Oberfläche sehen darf: kein Kartenstapel, keine verdeckten Karten der Computergegner
export function ansicht(z) {
  if (!z || !z.poker || !z.poker.t) return z;
  const v = JSON.parse(JSON.stringify(z));
  const t = v.poker.t;
  t.deck = [];
  t.s.forEach((x, i) => { if (i > 0 && x.k && !x.o) x.k = [-1, -1]; });
  return v;
}
// Chips, die gerade am Tisch liegen (für die Anzeige des Gesamtguthabens)
export function amTisch(z) {
  const t = z && z.poker && z.poker.t; if (!t) return 0;
  if (t.art === 'cash') return t.s[0].c + t.s[0].g;
  return 0;
}

// ------------------------------------------------------------------ Hilfen am Tisch
const lebt = (x) => !x.r && (x.c > 0 || x.g > 0);
const imSpiel = (x) => !x.r && x.k && !x.f;                 // hat Karten und nicht gepasst
const kannHandeln = (x) => imSpiel(x) && !x.a;
function naechster(t, von, pruef) {
  for (let d = 1; d <= PLAETZE; d++) { const i = (von + d) % PLAETZE; if (pruef(t.s[i])) return i; }
  return -1;
}
const potSumme = (t) => t.s.reduce((s, x) => s + x.g, 0);
function setze(t, i, betrag) {
  const x = t.s[i]; const b = Math.min(betrag, x.c);
  x.c -= b; x.e += b; x.g += b; if (x.c === 0) x.a = true;
  return b;
}

function neuerBot(id, chips) { return { b: id, c: chips, e: 0, g: 0, k: null, f: false, a: false, o: false, r: false, h: false }; }
function botStack(stufe, zufall) { const c = CASH[stufe]; const schritte = (c.max - c.min) / c.bb; return c.min + c.bb * zufall(schritte + 1); }

// Neue Hand geben (setzt Blinds, ruft danach die Computerzüge bis der Mensch dran ist)
function neueHand(t, zufall, ev) {
  // Cash: pleite Computergegner kaufen neu ein
  if (t.art === 'cash') t.s.forEach((x, i) => { if (i > 0 && x.c < t.bb) { const neu = botStack(t.stufe, zufall); t.s[i] = neuerBot(x.b, neu); ev.push({ t: 'nachkauf', s: i, c: neu }); } });
  if (t.art === 'sng') {
    t.sng.rest -= 1;
    if (t.sng.rest <= 0 && t.sng.level < SNG_BLINDS.length - 1) { t.sng.level++; t.sng.rest = SNG_HAENDE; [t.sb, t.bb] = SNG_BLINDS[t.sng.level]; ev.push({ t: 'level', sb: t.sb, bb: t.bb }); }
  }
  for (const x of t.s) { x.e = 0; x.g = 0; x.k = null; x.f = false; x.a = false; x.o = false; x.h = false; }
  t.board = [];
  if (t.s[0].c <= 0) { t.phase = 'leer'; t.zug = -1; return; }
  const aktiv = (x) => !x.r && x.c > 0;
  t.nr += 1; t.board = []; t.deck = mischen(zufall);
  t.dealer = naechster(t, t.dealer, aktiv);
  const anzahl = t.s.filter(aktiv).length;
  let sb, bb;
  if (anzahl === 2) { sb = t.dealer; bb = naechster(t, sb, aktiv); } else { sb = naechster(t, t.dealer, aktiv); bb = naechster(t, sb, aktiv); }
  t.s.forEach((x) => { if (aktiv(x)) x.k = [t.deck.pop(), t.deck.pop()]; });
  const vorBlinds = t.s.map((x) => x.c);
  const bsb = setze(t, sb, t.sb), bbb = setze(t, bb, t.bb);
  t.hoch = Math.max(t.s[sb].e, t.s[bb].e); t.minR = t.bb; t.phase = 'preflop';
  ev.push({ t: 'neu', nr: t.nr, dealer: t.dealer, c: vorBlinds, sb: [sb, bsb], bb: [bb, bbb], karten: t.s[0].k ? t.s[0].k.slice() : null });
  t.zug = naechster(t, bb, kannHandeln);
  if (rundeFertig(t)) strasseWeiter(t, ev, zufall);
}

function rundeFertig(t) {
  const drin = t.s.filter(imSpiel);
  if (drin.length <= 1) return true;
  return t.s.every((x) => !kannHandeln(x) || (x.h && x.e === t.hoch)) && !(t.s.filter(kannHandeln).length === 1 && t.s.find(kannHandeln).e < t.hoch);
}

function strasseWeiter(t, ev, zufall) {
  for (;;) {
    const drin = t.s.filter(imSpiel);
    if (drin.length <= 1) return handEnde(t, ev, zufall);
    for (const x of t.s) { x.e = 0; x.h = false; }
    t.hoch = 0; t.minR = t.bb;
    if (t.phase === 'river') return handEnde(t, ev, zufall);
    const neu = t.phase === 'preflop' ? 3 : 1;
    t.deck.pop(); // verbrennen
    const k = []; for (let i = 0; i < neu; i++) k.push(t.deck.pop());
    t.board.push(...k);
    t.phase = t.phase === 'preflop' ? 'flop' : t.phase === 'flop' ? 'turn' : 'river';
    ev.push({ t: 'strasse', p: t.phase, k });
    // Nur noch höchstens einer kann setzen → Karten ohne Setzrunde aufdecken
    if (t.s.filter(kannHandeln).length <= 1) { if (!t.s.some((x) => x.o)) zeigen(t, ev); continue; }
    t.zug = naechster(t, t.dealer, kannHandeln);
    return;
  }
}

function zeigen(t, ev) {
  t.s.forEach((x, i) => { if (imSpiel(x) && !x.o) { x.o = true; ev.push({ t: 'zeigen', s: i, k: x.k.slice(), w: handName(wert([...x.k, ...t.board])) }); } });
}

function handEnde(t, ev, zufall) {
  t.zug = -1;
  const drin = t.s.map((x, i) => i).filter((i) => imSpiel(t.s[i]));
  let gewinnSpieler = 0;
  if (drin.length === 1) {
    const i = drin[0]; const b = potSumme(t);
    t.s[i].c += b; ev.push({ t: 'pot', s: [i], b, name: null, je: [b] });
    if (i === 0) gewinnSpieler = b;
  } else {
    zeigen(t, ev);
    const w = t.s.map((x) => (imSpiel(x) ? wert([...x.k, ...t.board]) : -1));
    const stufen = [...new Set(drin.map((i) => t.s[i].g))].sort((a, b) => a - b);
    let vorher = 0;
    for (const L of stufen) {
      let b = 0; t.s.forEach((x) => { b += Math.min(x.g, L) - Math.min(x.g, vorher); });
      vorher = L;
      if (b <= 0) continue;
      const wer = drin.filter((i) => t.s[i].g >= L);
      const best = Math.max(...wer.map((i) => w[i]));
      const sieger = wer.filter((i) => w[i] === best);
      // Reihenfolge ab links vom Dealer (bekommt Rest-Chips)
      sieger.sort((a, c) => ((a - t.dealer + PLAETZE - 1) % PLAETZE) - ((c - t.dealer + PLAETZE - 1) % PLAETZE));
      const teilB = Math.floor(b / sieger.length); let rest = b - teilB * sieger.length;
      const je = sieger.map(() => { const x = teilB + (rest > 0 ? 1 : 0); if (rest > 0) rest--; return x; });
      sieger.forEach((i, n) => { t.s[i].c += je[n]; if (i === 0) gewinnSpieler += je[n]; });
      const letzter = ev.length && ev[ev.length - 1];
      // gleiche Gewinner wie der vorige Topf (z. B. nicht gecallter Rest) → zusammenfassen
      if (letzter && letzter.t === 'pot' && letzter.s.join() === sieger.join()) { letzter.b += b; letzter.je = letzter.je.map((x, n) => x + je[n]); }
      else ev.push({ t: 'pot', s: sieger, b, name: wer.length > 1 ? handName(best) : null, je });
    }
    // Sicherheitsnetz: was über dem höchsten Einsatz der Verbliebenen liegt (kommt praktisch nicht vor), geht an den besten Verbliebenen
    const uebrig = t.s.reduce((s, x) => s + Math.max(0, x.g - vorher), 0);
    if (uebrig > 0) {
      const best = drin.reduce((m, i) => (w[i] > w[m] ? i : m), drin[0]);
      t.s[best].c += uebrig; if (best === 0) gewinnSpieler += uebrig;
      ev.push({ t: 'pot', s: [best], b: uebrig, name: null, je: [uebrig] });
    }
  }
  t.phase = 'ende';
  t.gewinn = gewinnSpieler;
  return gewinnSpieler;
}

// ------------------------------------------------------------------ Computergegner
function botZug(t, i, zufall) {
  const x = t.s[i]; const st = BOTS[x.b];
  const rnd = seedZufall(zufall(0x7fffffff));
  const p = () => rnd(10000) / 10000;
  const zuZahlen = Math.min(t.hoch - x.e, x.c);
  const pot = potSumme(t);
  const gegner = t.s.filter((y, j) => j !== i && imSpiel(y)).length;
  const erhoehe = (ziel) => {
    const minZiel = t.hoch + t.minR;
    let z = Math.max(minZiel, Math.round(ziel / t.bb) * t.bb);
    if (z - x.e >= x.c * 0.7) z = x.e + x.c; // fast alles → ganz rein
    if (z - x.e >= x.c) return { zug: 'allin' };
    return { zug: 'raise', betrag: z };
  };
  if (t.phase === 'preflop') {
    const s = chen(x.k[0], x.k[1]);
    const druck = zuZahlen / t.bb; // wie viele Big Blinds kostet das Mitgehen
    const noetig = st.open + st.zaeh * ((druck > 3 ? 2 : 0) + (druck > 10 ? 3 : 0)) + (x.c + x.g < t.bb * 12 ? -1 : 0);
    if (s >= st.raise + (druck > 3 ? 3 : 0) || (p() < st.bluff && druck <= 3)) {
      if (s >= 16 && druck > 3) return { zug: 'allin' };
      return erhoehe(Math.max(t.bb * 3, t.hoch * 3) + t.bb * t.s.filter((y) => imSpiel(y) && y.e === t.bb).length);
    }
    if (zuZahlen === 0) return { zug: 'check' };
    if (s >= noetig || (druck <= 1 && s >= noetig - 2)) return { zug: zuZahlen >= x.c ? 'allin' : 'call' };
    return { zug: 'fold' };
  }
  const eq = chance(x.k, t.board, Math.max(1, gegner), rnd, 90);
  const odds = zuZahlen / (pot + zuZahlen || 1);
  const stark = 1 - (1 - st.mut) * Math.min(1, 0.8 + gegner * 0.1);
  if (eq > stark || (p() < st.bluff && gegner <= 2 && zuZahlen === 0)) {
    const ziel = t.hoch + Math.max(t.bb, Math.round(pot * (eq > 0.85 ? 0.85 : 0.6)));
    if (zuZahlen > 0 && eq < stark + 0.12 && p() < 0.5) return { zug: zuZahlen >= x.c ? 'allin' : 'call' };
    return erhoehe(ziel);
  }
  if (zuZahlen === 0) return { zug: 'check' };
  if (eq >= odds * st.call) return { zug: zuZahlen >= x.c ? 'allin' : 'call' };
  return { zug: 'fold' };
}

// Einen Zug ausführen (Mensch oder Computer). Rückgabe Fehlertext oder null
function ausfuehren(t, i, zug, betrag, ev) {
  const x = t.s[i];
  if (t.zug !== i || !kannHandeln(x)) return 'nicht_dran';
  const zuZahlen = t.hoch - x.e;
  let art = zug, gesetzt = 0;
  if (zug === 'fold') { if (zuZahlen === 0) art = 'check'; else x.f = true; }
  if (art === 'check') { if (zuZahlen > 0) return 'check_nicht_moeglich'; }
  else if (zug === 'call') { if (zuZahlen <= 0) art = 'check'; else { gesetzt = setze(t, i, zuZahlen); if (x.a) art = 'allin'; } }
  else if (zug === 'raise' || zug === 'allin') {
    const ziel = zug === 'allin' ? x.e + x.c : betrag;
    if (!Number.isInteger(ziel)) return 'betrag';
    if (ziel >= x.e + x.c) { gesetzt = setze(t, i, x.c); }
    else {
      if (ziel < t.hoch + t.minR) return 'betrag';
      gesetzt = setze(t, i, ziel - x.e);
    }
    if (x.e > t.hoch) {
      const plus = x.e - t.hoch;
      if (plus >= t.minR) { t.minR = plus; t.s.forEach((y, j) => { if (j !== i) y.h = false; }); }
      art = t.hoch === 0 ? 'bet' : 'raise';
      t.hoch = x.e;
    } else art = 'call';
    if (x.a) art = 'allin';
  }
  x.h = true;
  ev.push({ t: 'akt', s: i, z: art, b: gesetzt, e: x.e, c: x.c });
  return null;
}

function laufen(t, ev, zufall) {
  for (let schutz = 0; schutz < 500; schutz++) {
    if (t.phase === 'ende' || t.phase === 'leer') return;
    if (rundeFertig(t) || t.zug < 0) { strasseWeiter(t, ev, zufall); continue; }
    if (!kannHandeln(t.s[t.zug])) { t.zug = naechster(t, t.zug, kannHandeln); continue; }
    if (t.zug === 0) return; // Mensch ist dran
    const z = botZug(t, t.zug, zufall);
    if (ausfuehren(t, t.zug, z.zug, z.betrag, ev)) ausfuehren(t, t.zug, 'fold', 0, ev);
    t.zug = naechster(t, t.zug, kannHandeln);
  }
}

// Sit & Go: Ausgeschiedene nach der Hand vermerken; Spielende mit Preis
function sngNachHand(z, p, ev) {
  const t = p.t; if (t.art !== 'sng') return;
  const raus = t.s.map((x, i) => i).filter((i) => !t.s[i].r && t.s[i].c === 0);
  if (!raus.length) return;
  // wer mit mehr Chips in die Hand ging, wird besser platziert
  raus.sort((a, b) => t.s[b].g - t.s[a].g);
  raus.forEach((i, n) => { t.s[i].r = true; ev.push({ t: 'raus', s: i, platz: t.sng.lebend - (raus.length - 1 - n) }); });
  t.sng.lebend -= raus.length;
  const menschRaus = raus.includes(0);
  if (menschRaus || t.sng.lebend === 1) {
    const platz = menschRaus ? t.sng.lebend + 1 + raus.indexOf(0) : 1;
    sngEnde(z, p, platz, ev);
  }
}
function sngEnde(z, p, platz, ev) {
  const t = p.t;
  const preis = platz <= SNG_PREIS.length ? SNG_PREIS[platz - 1] * t.sng.buyin : 0;
  z.coins += preis;
  p.stats.sng += 1; if (platz === 1) p.stats.sngSieg += 1; if (platz === 2) p.stats.sngZweiter += 1;
  ev.push({ t: 'sngEnde', platz, preis });
  p.t = null;
}

// ------------------------------------------------------------------ Aktionen
// a = { p: 'start'|'zug'|'weiter'|'aufstehen'|'nachkauf', art, stufe, buyin, zug, betrag }
export function aktion(z, a, zufall) {
  if (!z || typeof z !== 'object' || !ganz(z.coins, 0, 1e12)) return { fehler: 'zustand' };
  const alt = teil(z); if (!alt) return { fehler: 'zustand' };
  if (!a || typeof a !== 'object') return { fehler: 'aktion' };
  const neu = JSON.parse(JSON.stringify(z));
  const p = JSON.parse(JSON.stringify(alt)); neu.poker = p;
  const ev = [];
  const fertig = () => {
    const t = p.t;
    if (t && t.phase === 'ende') {
      p.stats.haende += 1;
      if (t.gewinn > 0) p.stats.gewonnen += 1;
      const pot = ev.filter((e) => e.t === 'pot' && e.s.includes(0)).reduce((s, e) => s + e.je[e.s.indexOf(0)], 0);
      if (pot > p.stats.groessterPot) p.stats.groessterPot = pot;
      sngNachHand(neu, p, ev);
    }
    return { zustand: neu, ergebnis: { typ: 'poker', ev } };
  };
  switch (a.p) {
    case 'start': {
      if (p.t) return { fehler: 'schon_am_tisch' };
      if (a.art === 'cash') {
        const c = CASH[a.stufe]; if (!c) return { fehler: 'stufe' };
        if (!ganz(a.buyin, c.min, c.max) || a.buyin % c.bb !== 0) return { fehler: 'buyin' };
        if (a.buyin > z.coins) return { fehler: 'zu_wenig' };
        neu.coins -= a.buyin; p.stats.cashEin += a.buyin;
        const bots = BOT_IDS.slice();
        p.t = { art: 'cash', stufe: a.stufe, sb: c.sb, bb: c.bb, nr: 0, dealer: zufall(PLAETZE), zug: -1, hoch: 0, minR: c.bb, ein: a.buyin, phase: 'leer', deck: [], board: [],
          s: [neuerBot('', a.buyin), ...bots.map((b) => neuerBot(b, botStack(a.stufe, zufall)))] };
        p.t.s[0].b = '';
      } else if (a.art === 'sng') {
        const g = SNG[a.stufe]; if (!g) return { fehler: 'stufe' };
        if (g.buyin > z.coins) return { fehler: 'zu_wenig' };
        neu.coins -= g.buyin;
        const [sb, bb] = SNG_BLINDS[0];
        p.t = { art: 'sng', stufe: a.stufe, sb, bb, nr: 0, dealer: zufall(PLAETZE), zug: -1, hoch: 0, minR: bb, ein: g.buyin, phase: 'leer', deck: [], board: [],
          s: [neuerBot('', SNG_STACK), ...BOT_IDS.map((b) => neuerBot(b, SNG_STACK))], sng: { buyin: g.buyin, level: 0, rest: SNG_HAENDE + 1, lebend: PLAETZE } };
        p.t.s[0].b = '';
      } else return { fehler: 'art' };
      neueHand(p.t, zufall, ev); laufen(p.t, ev, zufall);
      return fertig();
    }
    case 'zug': {
      const t = p.t; if (!t || !['preflop', 'flop', 'turn', 'river'].includes(t.phase)) return { fehler: 'keine_hand' };
      if (!['fold', 'check', 'call', 'raise', 'allin'].includes(a.zug)) return { fehler: 'zug' };
      const f = ausfuehren(t, 0, a.zug, a.betrag, ev); if (f) return { fehler: f };
      t.zug = naechster(t, 0, kannHandeln);
      laufen(t, ev, zufall);
      return fertig();
    }
    case 'weiter': {
      const t = p.t; if (!t || !['ende', 'leer'].includes(t.phase)) return { fehler: 'keine_hand' };
      if (t.phase === 'leer' && t.s[0].c <= 0) return { fehler: 'keine_chips' };
      neueHand(t, zufall, ev); laufen(t, ev, zufall);
      return fertig();
    }
    case 'nachkauf': {
      const t = p.t; if (!t || t.art !== 'cash' || !['ende', 'leer'].includes(t.phase)) return { fehler: 'nicht_jetzt' };
      const c = CASH[t.stufe];
      if (!ganz(a.buyin, 1, c.max - t.s[0].c) || a.buyin % c.bb !== 0) return { fehler: 'buyin' };
      if (a.buyin > z.coins) return { fehler: 'zu_wenig' };
      neu.coins -= a.buyin; t.s[0].c += a.buyin; t.ein += a.buyin; p.stats.cashEin += a.buyin;
      ev.push({ t: 'nachkauf', s: 0, c: t.s[0].c });
      return { zustand: neu, ergebnis: { typ: 'poker', ev } };
    }
    case 'aufstehen': {
      const t = p.t; if (!t) return { fehler: 'kein_tisch' };
      const laeuft = ['preflop', 'flop', 'turn', 'river'].includes(t.phase);
      if (laeuft && imSpiel(t.s[0])) return { fehler: 'erst_passen' };
      if (laeuft) { laufen(t, ev, zufall); if (t.phase === 'ende') { p.stats.haende += 1; } }
      if (t.art === 'cash') {
        const chips = t.s[0].c; neu.coins += chips; p.stats.cashAus += chips;
        ev.push({ t: 'aufstehen', c: chips }); p.t = null;
      } else {
        if (t.phase === 'ende') sngNachHand(neu, p, ev);
        if (p.t) sngEnde(neu, p, t.sng.lebend, ev); // Aufgeben = letzter Platz der noch Lebenden
      }
      return { zustand: neu, ergebnis: { typ: 'poker', ev } };
    }
    default: return { fehler: 'aktion' };
  }
}

// Was darf der Mensch gerade? (für Knöpfe und Prüfungen in der Oberfläche)
export function moeglich(t) {
  if (!t || t.zug !== 0 || !['preflop', 'flop', 'turn', 'river'].includes(t.phase)) return null;
  const x = t.s[0]; const zu = Math.min(t.hoch - x.e, x.c);
  const minZiel = Math.min(t.hoch + t.minR, x.e + x.c), maxZiel = x.e + x.c;
  return { zuZahlen: zu, kannCheck: zu === 0, kannRaise: x.c > zu, minZiel, maxZiel, pot: potSumme(t), hoch: t.hoch };
}
export { potSumme };
// Nur für Tests: eine vorbereitete Hand abrechnen
export function abrechnen(t) { const ev = []; handEnde(t, ev); return ev; }
