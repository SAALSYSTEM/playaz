// AUSFAHRT FREI: Regeln. Ganzzahlig und deterministisch, damit Browser und Prüf-Funktion (Supabase Edge Function)
// jeden Lösungsweg gleich nachspielen. Diese Datei wird nach supabase/functions/ausfahrt-lauf/sim.js kopiert
// (node tools/edge-sync.mjs). Die Rätsel selbst stehen fest in raetsel.js (gebaut und mit Löser geprüft von
// tools/ausfahrt-raetsel.mjs), damit der Server nichts suchen muss.
//
// Spielprinzip: 6×6-Lagerplatz. Fahrzeuge (2 oder 3 Felder lang) fahren nur in ihrer Längsrichtung vor und zurück,
// beliebig weit, solange der Weg frei ist. Ein Zug = ein Fahrzeug einmal verschieben. Ziel: der Betonmischer (A, waagerecht
// in Zeile 3) steht ganz rechts an der Ausfahrt (Spalten 5 und 6).
//
// Rätsel als Text mit 36 Zeichen (Zeile für Zeile): '.' frei, 'A' Betonmischer, 'B'..'Z' andere Fahrzeuge.
export const VERSION = 1;          // Konfigurationsversion: Regeln + welcher Tagespool gilt (raetsel.js)
export const N = 6;                // Kantenlänge
export const AUSFAHRT_ZEILE = 2;   // Zeile der Ausfahrt (0 = oben)
export const MAX_ZUEGE = 1000;     // mehr Eingaben nimmt die Prüfung nicht an

// Text -> Fahrzeuge. Gibt null zurück, wenn der Text kein gültiges Rätsel ist.
// Fahrzeug: { id: 'A', waag: true/false, len: 2|3, fest: Zeile (waagerecht) oder Spalte (senkrecht), pos: Spalte bzw. Zeile des vorderen Endes (oben/links) }
export function lese(text) {
  if (typeof text !== 'string' || text.length !== N * N || !/^[.A-Z]+$/.test(text)) return null;
  const felder = {};
  for (let i = 0; i < N * N; i++) { const c = text[i]; if (c !== '.') (felder[c] = felder[c] || []).push(i); }
  if (!felder.A) return null;
  const teile = [];
  for (const id of Object.keys(felder).sort()) {
    const f = felder[id], len = f.length;
    if (len < 2 || len > 3) return null;
    const x = f.map((i) => i % N), y = f.map((i) => Math.floor(i / N));
    const waag = y.every((v) => v === y[0]), senk = x.every((v) => v === x[0]);
    if (waag === senk) return null;
    const pos = waag ? Math.min(...x) : Math.min(...y);
    for (let k = 0; k < len; k++) if (!f.includes(waag ? y[0] * N + pos + k : (pos + k) * N + x[0])) return null;   // zusammenhängend
    teile.push({ id, waag, len, fest: waag ? y[0] : x[0], pos });
  }
  if (!teile[0].waag || teile[0].fest !== AUSFAHRT_ZEILE || teile[0].len !== 2) return null;
  return teile;
}
// Belegungsraster aus Fahrzeugen und Positionen: Index des Fahrzeugs oder -1
export function raster(teile, pos) {
  const g = new Array(N * N).fill(-1);
  teile.forEach((t, k) => { for (let j = 0; j < t.len; j++) g[t.waag ? t.fest * N + pos[k] + j : (pos[k] + j) * N + t.fest] = k; });
  return g;
}
export const zelle = (t, p, j) => (t.waag ? t.fest * N + p + j : (p + j) * N + t.fest);
// Wie weit kann Fahrzeug k fahren? [kleinste, größte] Position
export function spielraum(teile, pos, g, k) {
  const t = teile[k]; let lo = pos[k], hi = pos[k];
  while (lo > 0 && g[zelle(t, lo - 1, 0)] === -1) lo--;
  while (hi + t.len < N && g[zelle(t, hi + t.len, 0)] === -1) hi++;
  return [lo, hi];
}
export const geloest = (pos) => pos[0] === N - 2;

// ---------------------------------------------------------------------------------------------------------------
// Spielstand
// ---------------------------------------------------------------------------------------------------------------
export function neuesSpiel(teile) { return { pos: teile.map((t) => t.pos), zuege: 0, geloest: false }; }
// Fahrzeug k an Position p schieben (ein Zug). true, wenn erlaubt und ausgeführt.
export function fahre(teile, s, k, p) {
  if (s.geloest || !Number.isInteger(k) || k < 0 || k >= teile.length || !Number.isInteger(p) || p === s.pos[k]) return false;
  const g = raster(teile, s.pos), [lo, hi] = spielraum(teile, s.pos, g, k);
  if (p < lo || p > hi) return false;
  s.pos[k] = p; s.zuege++;
  if (geloest(s.pos)) s.geloest = true;
  return true;
}

// Eingaben: je Zug zwei Zeichen: Fahrzeug (A–Z) und neue Position (0–5)
export function kodiere(zuege, teile) { return zuege.map(([k, p]) => teile[k].id + p).join(''); }
export function dekodiere(text, teile) {
  if (typeof text !== 'string' || text.length % 2 || text.length > 2 * MAX_ZUEGE) return null;
  const out = [];
  for (let i = 0; i < text.length; i += 2) {
    const k = teile.findIndex((t) => t.id === text[i]), p = '012345'.indexOf(text[i + 1]);
    if (k < 0 || p < 0) return null;
    out.push([k, p]);
  }
  return out;
}
// Nachspielen: jeder Zug muss erlaubt sein; gelöst sein darf das Rätsel erst nach dem letzten Zug.
export function nachfahren(teile, zuege) {
  const s = neuesSpiel(teile);
  for (const [k, p] of zuege) {
    if (s.geloest) return { fehler: 'nach_loesung' };
    if (!fahre(teile, s, k, p)) return { fehler: 'eingaben' };
  }
  return { geloest: s.geloest, zuege: s.zuege };
}

// Serverseitige Prüfung. pool = Tagespool aus raetsel.js; Seed und Version kommen aus der Datenbank, nie vom Browser.
export function tagesNummer(seed, pool) { return Number.isInteger(seed) && seed >= 1 && pool.length ? seed % pool.length : -1; }
export function pruefeLauf(seed, version, lauf, POOLS) {
  try {
    const pool = POOLS[version];
    if (!pool) return { ok: false, grund: 'version' };
    const nr = tagesNummer(seed, pool); if (nr < 0) return { ok: false, grund: 'ungueltig' };
    const teile = lese(pool[nr][0]);
    if (!lauf || typeof lauf !== 'object') return { ok: false, grund: 'ungueltig' };
    const zuege = dekodiere(lauf.inputs, teile);
    if (!zuege || !zuege.length) return { ok: false, grund: 'eingaben' };
    const e = nachfahren(teile, zuege);
    if (e.fehler) return { ok: false, grund: e.fehler };
    if (!e.geloest) return { ok: false, grund: 'nicht_geloest' };
    if (e.zuege !== lauf.zuege) return { ok: false, grund: 'ergebnis_weicht_ab', zuege: e.zuege };
    return { ok: true, zuege: e.zuege, min: pool[nr][1] };
  } catch (e) { return { ok: false, grund: 'fehler' }; }
}
