// NEUNMALKLUG: Sudoku-Regeln und Rätselbau. Ganzzahlig und deterministisch, damit Browser und Prüf-Funktion (Supabase Edge
// Function) jedes Rätsel bitgleich erzeugen. Diese Datei wird nach supabase/functions/neunmalklug-lauf/sim.js kopiert
// (node tools/edge-sync.mjs).
//
// Raster: 81 Felder, Index i = Zeile * 9 + Spalte, 0 = leer. Jedes Rätsel hat genau eine Lösung und ist ohne Raten
// lösbar: Leicht und Mittel nur mit "Einzelnen" (einzige Ziffer im Feld / einziger Platz in Zeile, Spalte oder Block),
// Schwer und Experte brauchen zusätzlich Block-Zeilen-Wechselwirkungen und Paare.
export const VERSION = 1;   // Konfigurationsversion (wie aus Seed und Datum das Tagesrätsel entsteht)

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
function mische(arr, rnd) {
  for (let i = arr.length - 1; i > 0; i--) { const j = rnd() % (i + 1); const x = arr[i]; arr[i] = arr[j]; arr[j] = x; }
  return arr;
}

// ---------------------------------------------------------------------------------------------------------------
// Einheiten (9 Zeilen, 9 Spalten, 9 Blöcke) und Nachbarn
// ---------------------------------------------------------------------------------------------------------------
export const BLOCK = Array.from({ length: 81 }, (_, i) => Math.floor(i / 27) * 3 + Math.floor((i % 9) / 3));
export const EINHEITEN = [];
for (let k = 0; k < 9; k++) EINHEITEN.push(Array.from({ length: 9 }, (_, m) => k * 9 + m));
for (let k = 0; k < 9; k++) EINHEITEN.push(Array.from({ length: 9 }, (_, m) => m * 9 + k));
for (let k = 0; k < 9; k++) EINHEITEN.push(Array.from({ length: 9 }, (_, m) => (Math.floor(k / 3) * 3 + Math.floor(m / 3)) * 9 + (k % 3) * 3 + (m % 3)));
export const NACHBARN = Array.from({ length: 81 }, (_, i) => {
  const s = new Set();
  for (const u of EINHEITEN) if (u.includes(i)) for (const j of u) if (j !== i) s.add(j);
  return [...s];
});
const ALLE = 0x3FE;   // Bits 1..9
const anzahl = (m) => { let c = 0; while (m) { m &= m - 1; c++; } return c; };
const ziffer = (m) => { for (let v = 1; v <= 9; v++) if (m === 1 << v) return v; return 0; };

// ---------------------------------------------------------------------------------------------------------------
// Logischer Löser: löst so weit wie mit den erlaubten Techniken möglich. stufe 1 = Einzelne,
// stufe 2 = zusätzlich Block-Zeilen-Wechselwirkung (Pointing/Claiming) und nackte Paare.
// Rückgabe: true, wenn vollständig gelöst (dann ist die Lösung auch eindeutig).
// ---------------------------------------------------------------------------------------------------------------
export function logischLoesbar(raetsel, stufe) {
  const g = raetsel.slice(), k = new Array(81).fill(0);
  for (let i = 0; i < 81; i++) if (!g[i]) { let m = ALLE; for (const j of NACHBARN[i]) if (g[j]) m &= ~(1 << g[j]); k[i] = m; }
  let offen = 0; for (let i = 0; i < 81; i++) if (!g[i]) { offen++; if (!k[i]) return false; }
  const setze = (i, v) => { g[i] = v; k[i] = 0; offen--; const b = 1 << v; for (const j of NACHBARN[i]) k[j] &= ~b; };
  while (offen > 0) {
    let fort = false;
    // Nackte Einzelne
    for (let i = 0; i < 81; i++) if (!g[i]) { if (!k[i]) return false; if (anzahl(k[i]) === 1) { setze(i, ziffer(k[i])); fort = true; } }
    if (fort) continue;
    // Versteckte Einzelne
    for (const u of EINHEITEN) for (let v = 1; v <= 9; v++) {
      const b = 1 << v; let ort = -1, n = 0, da = false;
      for (const i of u) { if (g[i] === v) { da = true; break; } if (k[i] & b) { n++; ort = i; } }
      if (!da && n === 1) { setze(ort, v); fort = true; }
      else if (!da && n === 0) return false;
    }
    if (fort) continue;
    if (stufe < 2) return false;
    // Block-Zeilen-Wechselwirkung: Kandidaten einer Ziffer in einer Einheit liegen alle in einer zweiten Einheit
    for (let a = 0; a < 27; a++) for (let v = 1; v <= 9; v++) {
      const b = 1 << v, orte = EINHEITEN[a].filter((i) => k[i] & b);
      if (orte.length < 2) continue;
      for (let c = 0; c < 27; c++) {
        if (c === a || (a < 18) === (c < 18)) continue;   // nur Block gegen Zeile/Spalte
        const u = EINHEITEN[c]; if (!orte.every((i) => u.includes(i))) continue;
        for (const i of u) if (!orte.includes(i) && (k[i] & b)) { k[i] &= ~b; fort = true; }
      }
    }
    if (fort) continue;
    // Nackte Paare
    for (const u of EINHEITEN) for (let x = 0; x < 9; x++) {
      const p = u[x]; if (g[p] || anzahl(k[p]) !== 2) continue;
      for (let y = x + 1; y < 9; y++) {
        const q = u[y]; if (g[q] || k[q] !== k[p]) continue;
        for (const i of u) if (i !== p && i !== q && (k[i] & k[p])) { k[i] &= ~k[p]; fort = true; }
      }
    }
    if (!fort) return false;
  }
  return true;
}

// Zählt Lösungen per Rücksetzsuche (bricht bei grenze ab). Für Tests und Prüfungen.
export function zaehleLoesungen(raetsel, grenze = 2) {
  const g = raetsel.slice(), z = new Array(9).fill(0), s = new Array(9).fill(0), bl = new Array(9).fill(0);
  for (let i = 0; i < 81; i++) if (g[i]) {
    const b = 1 << g[i], r = Math.floor(i / 9), c = i % 9;
    if ((z[r] | s[c] | bl[BLOCK[i]]) & b) return 0;
    z[r] |= b; s[c] |= b; bl[BLOCK[i]] |= b;
  }
  let n = 0;
  const such = () => {
    let best = -1, bm = 0, bc = 10;
    for (let i = 0; i < 81; i++) if (!g[i]) {
      const m = ~(z[Math.floor(i / 9)] | s[i % 9] | bl[BLOCK[i]]) & ALLE, c = anzahl(m);
      if (c < bc) { best = i; bm = m; bc = c; if (c < 2) break; }
    }
    if (best < 0) { n++; return n >= grenze; }
    const r = Math.floor(best / 9), c = best % 9, x = BLOCK[best];
    for (let v = 1; v <= 9; v++) {
      const b = 1 << v; if (!(bm & b)) continue;
      g[best] = v; z[r] |= b; s[c] |= b; bl[x] |= b;
      if (such()) return true;
      g[best] = 0; z[r] &= ~b; s[c] &= ~b; bl[x] &= ~b;
    }
    return false;
  };
  such();
  return n;
}

function volleLoesung(rnd) {
  const g = new Array(81).fill(0), z = new Array(9).fill(0), s = new Array(9).fill(0), bl = new Array(9).fill(0);
  const fuelle = (i) => {
    if (i === 81) return true;
    const r = Math.floor(i / 9), c = i % 9, x = BLOCK[i];
    for (const v of mische([1, 2, 3, 4, 5, 6, 7, 8, 9], rnd)) {
      const b = 1 << v; if ((z[r] | s[c] | bl[x]) & b) continue;
      g[i] = v; z[r] |= b; s[c] |= b; bl[x] |= b;
      if (fuelle(i + 1)) return true;
      g[i] = 0; z[r] &= ~b; s[c] &= ~b; bl[x] &= ~b;
    }
    return false;
  };
  fuelle(0);
  return g;
}

// ---------------------------------------------------------------------------------------------------------------
// Schwierigkeitsstufen: Zielzahl der Vorgaben und erlaubte Techniken
// ---------------------------------------------------------------------------------------------------------------
export const STUFEN = {
  leicht: { name: 'Leicht', vorgaben: 38, technik: 1 },
  mittel: { name: 'Mittel', vorgaben: 30, technik: 1 },
  schwer: { name: 'Schwer', vorgaben: 26, technik: 2 },
  experte: { name: 'Experte', vorgaben: 23, technik: 2 }
};
export const STUFEN_LISTE = ['leicht', 'mittel', 'schwer', 'experte'];

// Baut aus Seed und Stufe ein Rätsel. Felder werden paarweise punktsymmetrisch geleert, solange das Rätsel mit den
// erlaubten Techniken lösbar bleibt (damit ist es auch eindeutig).
// Schwer und Experte müssen die zusätzlichen Techniken wirklich brauchen; dafür werden bis zu VERSUCHE Raster gebaut
// (alle aus demselben Zufallsstrom, also weiterhin deterministisch). Gelingt es nicht, gilt der letzte Versuch.
const VERSUCHE = 40;
function leere(rnd, S) {
  const loesung = volleLoesung(rnd), raetsel = loesung.slice();
  let vorgaben = 81;
  // 1. punktsymmetrische Paare
  for (const i of mische(Array.from({ length: 41 }, (_, x) => x), rnd)) {
    if (vorgaben <= S.vorgaben) break;
    const j = 80 - i, a = raetsel[i], b = raetsel[j], weg = i === j ? 1 : 2;
    if (vorgaben - weg < S.vorgaben - 1) continue;
    raetsel[i] = 0; raetsel[j] = 0;
    if (logischLoesbar(raetsel, S.technik)) vorgaben -= weg; else { raetsel[i] = a; raetsel[j] = b; }
  }
  // 2. einzelne Felder, falls das Ziel noch nicht erreicht ist
  for (const i of mische(Array.from({ length: 81 }, (_, x) => x), rnd)) {
    if (vorgaben <= S.vorgaben) break;
    if (!raetsel[i]) continue;
    const a = raetsel[i]; raetsel[i] = 0;
    if (logischLoesbar(raetsel, S.technik)) vorgaben--; else raetsel[i] = a;
  }
  return { raetsel, loesung, vorgaben };
}
export function baueRaetsel(seed, stufe) {
  const S = STUFEN[stufe]; if (!S) return null;
  const rnd = zufall(seed);
  let x = null;
  for (let v = 0; v < (S.technik > 1 ? VERSUCHE : 1); v++) {
    x = leere(rnd, S);
    if (S.technik === 1 || !logischLoesbar(x.raetsel, 1)) break;
  }
  return { stufe, seed, raetsel: x.raetsel, loesung: x.loesung, vorgaben: x.vorgaben, leer: 81 - x.vorgaben };
}

// Tagesrätsel: Stufe nach Wochentag (Mo leicht ... So Experte), Seed vom Server. tag = 'JJJJMMTT'.
export const KONFIG = {
  1: { woche: ['experte', 'leicht', 'mittel', 'mittel', 'schwer', 'mittel', 'schwer'] }   // Index = Wochentag, 0 = Sonntag
};
export function tagesStufe(tag, version = VERSION) {
  const K = KONFIG[version], t = String(tag);
  if (!K || !/^\d{8}$/.test(t)) return null;
  const d = new Date(Date.UTC(+t.slice(0, 4), +t.slice(4, 6) - 1, +t.slice(6, 8), 12));
  return K.woche[d.getUTCDay()];
}
export function tagesRaetsel(seed, version, tag) {
  const stufe = tagesStufe(tag, version);
  return stufe ? baueRaetsel(seed, stufe) : null;
}

// Hilfen für Browser und Prüfung
export const kodiere = (g) => g.map((v) => String(v || 0)).join('');
export function dekodiere(text) {
  if (typeof text !== 'string' || !/^[0-9]{81}$/.test(text)) return null;
  return text.split('').map(Number);
}
// Felder, die gegen eine Regel verstoßen (gleiche Ziffer zweimal in Zeile, Spalte oder Block)
export function konflikte(g) {
  const x = new Array(81).fill(false);
  for (const u of EINHEITEN) for (let a = 0; a < 9; a++) for (let b = a + 1; b < 9; b++) {
    const p = u[a], q = u[b]; if (g[p] && g[p] === g[q]) { x[p] = true; x[q] = true; }
  }
  return x;
}

// Prüft eine eingesandte Lösung des Tagesrätsels: Seed, Version und Tag kommen aus der Datenbank (nie vom Browser).
// lauf = { run_id, loesung: '81 Ziffern' }. Rückgabe { ok, felder } (felder = Zahl der auszufüllenden Felder).
export function pruefeLauf(seed, version, tag, lauf) {
  if (!KONFIG[version]) return { ok: false, grund: 'version' };
  const r = tagesRaetsel(seed, version, tag);
  if (!r) return { ok: false, grund: 'version' };
  const a = lauf && typeof lauf.loesung === 'string' && /^[1-9]{81}$/.test(lauf.loesung) ? dekodiere(lauf.loesung) : null;
  if (!a) return { ok: false, grund: 'ungueltig' };
  for (let i = 0; i < 81; i++) if (r.raetsel[i] && r.raetsel[i] !== a[i]) return { ok: false, grund: 'vorgabe' };
  for (let i = 0; i < 81; i++) if (a[i] !== r.loesung[i]) return { ok: false, grund: 'falsch' };
  return { ok: true, felder: r.leer };
}
