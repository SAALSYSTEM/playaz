// PUNKTLANDUNG: Regeln. Ganzzahlig und deterministisch, damit Browser und Prüf-Funktion (Supabase Edge Function)
// jeden Lauf bitgleich nachrechnen. Diese Datei wird nach supabase/functions/punktlandung-lauf/sim.js kopiert
// (node tools/edge-sync.mjs).
//
// Regel: Ein Zeiger kreist um den Ring, ein Zielfeld liegt auf dem Weg. Tippen, wenn der Zeiger im Zielfeld ist.
// Treffer: +1 Punkt, der Zeiger kehrt um, das nächste Zielfeld erscheint (etwas kleiner, der Zeiger etwas schneller).
// Daneben tippen oder das Zielfeld verpassen beendet den Lauf.
export const SIM_VERSION = 1;
export const VOLL = 360000;          // Vollkreis in Tausendstelgrad
export const V0 = 2400;              // Zeigergeschwindigkeit je Takt am Anfang (2,4 Grad)
export const DV = 45;                // schneller je Treffer
export const VMAX = 4200;
export const W0 = 16000;             // halbe Breite des Zielfelds am Anfang (16 Grad)
export const DW = 250;               // schmaler je Treffer
export const WMIN = 9000;
export const E_MIN = 90000;          // Abstand des nächsten Zielfelds in Laufrichtung: 90 bis 210 Grad
export const E_SPANNE = 120000;
export const E_START = 150000;
export const MAX_TICKS = 60 * 60 * 20;   // höchstens 20 Minuten je Lauf

// Zufall (mulberry32): nur ganzzahlige Operationen, überall bitgleich
export function zufall(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const tempo = (n) => Math.min(VMAX, V0 + n * DV);
export const breite = (n) => Math.max(WMIN, W0 - n * DW);

// Zustand: t = Takt, a = Zeigerwinkel, dir = Richtung (1 oder -1), e = Weg bis zur Mitte des Zielfelds in Laufrichtung
// (wird je Takt kleiner, negativ = schon vorbei), n = Treffer, tot.
export function neuerLauf(seed) {
  const r = zufall(seed ^ 0x9E3779B1);
  const s = { t: 0, a: 0, dir: 1, e: E_START, n: 0, tot: false };
  function schritt(tipp) {
    if (s.tot) return false;
    if (s.t >= MAX_TICKS) { s.tot = true; return false; }
    const w = breite(s.n);
    if (tipp) {
      if (Math.abs(s.e) <= w) {
        s.n++; s.dir = -s.dir; s.e = E_MIN + Math.floor(r() * E_SPANNE);
      } else { s.tot = true; }
      s.t++;
      return !s.tot;
    }
    const v = tempo(s.n);
    s.a = (((s.a + s.dir * v) % VOLL) + VOLL) % VOLL;
    s.e -= v;
    s.t++;
    if (s.e < -w) { s.tot = true; return false; }
    return true;
  }
  return { s, schritt, punkte: () => s.n, ziel: () => (((s.a + s.dir * s.e) % VOLL) + VOLL) % VOLL };
}

// Eingaben als Text: Tippzeitpunkte als Abstände in Takten, Basis 36, durch Punkte getrennt ("1c.a.9"). Leer = nie getippt.
export function kodiere(tipps) {
  let vor = 0; const out = [];
  for (const t of tipps) { out.push((t - vor).toString(36)); vor = t; }
  return out.join('.');
}
export function dekodiere(text) {
  if (typeof text !== 'string') return null;
  if (text === '') return [];
  const teile = text.split('.'); if (teile.length > 20000) return null;
  const out = []; let t = 0;
  for (const p of teile) { if (!/^[0-9a-z]{1,6}$/.test(p)) return null; t += parseInt(p, 36); if (t > MAX_TICKS) return null; out.push(t); }
  return out;
}

// Nachfahren: Tipps (Takte, aufsteigend) -> Ergebnis
export function nachfahren(seed, tipps) {
  const l = neuerLauf(seed); let k = 0;
  for (;;) {
    let tipp = false;
    while (k < tipps.length && tipps[k] < l.s.t) k++;
    if (k < tipps.length && tipps[k] === l.s.t) { tipp = true; k++; }
    if (!l.schritt(tipp)) break;
  }
  return { takte: l.s.t, punkte: l.punkte(), tot: l.s.tot };
}

// Serverseitige Prüfung einer gemeldeten Leistung
export function pruefeLauf(lauf) {
  try {
    if (!lauf || lauf.v !== SIM_VERSION) return { ok: false, grund: 'version' };
    if (!Number.isInteger(lauf.seed) || lauf.seed < 20200101 || lauf.seed > 20991231) return { ok: false, grund: 'seed' };
    const tipps = dekodiere(lauf.inputs);
    if (!tipps) return { ok: false, grund: 'eingaben' };
    for (let i = 1; i < tipps.length; i++) if (tipps[i] === tipps[i - 1]) return { ok: false, grund: 'eingaben' };
    const r = nachfahren(lauf.seed, tipps);
    if (!r.tot) return { ok: false, grund: 'kein_ende' };
    if (r.takte !== lauf.ticks || r.punkte !== lauf.score) return { ok: false, grund: 'ergebnis_weicht_ab', takte: r.takte, punkte: r.punkte };
    return { ok: true, takte: r.takte, punkte: r.punkte };
  } catch (e) { return { ok: false, grund: 'fehler' }; }
}
