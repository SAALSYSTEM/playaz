// MÜHLE: Regeln und Computergegner. Keine Abhängigkeiten, läuft im Browser und in Node (Tests).
//
// Brett: 24 Punkte, Nummerierung zeilenweise von oben links:
//   0-----------1-----------2
//   |   3-------4-------5   |
//   |   |   6---7---8   |   |
//   9--10--11       12--13--14
//   |   |  15--16--17   |   |
//   |  18------19------20   |
//  21----------22----------23
//
// Regeln (übliche deutsche Turnierregeln):
// - je 9 Steine, Hell beginnt; erst setzen, dann ziehen (auf benachbarten freien Punkt)
// - wer nur noch 3 Steine hat, darf springen (auf jeden freien Punkt)
// - wer eine Mühle (3 in einer Linie) schließt, nimmt einen gegnerischen Stein, der in keiner Mühle steht;
//   stehen alle gegnerischen Steine in Mühlen, darf jeder genommen werden. Zwei Mühlen auf einmal: trotzdem nur ein Stein.
// - verloren hat, wer weniger als 3 Steine hat (im Vorrat + auf dem Brett) oder nicht mehr ziehen kann
// - Remis: dieselbe Stellung zum dritten Mal (Zugphase) oder 50 Züge je Seite ohne Schlagen (Zugphase)

export const VERSION = 1;
export const PUNKTE = [
  [0, 0], [3, 0], [6, 0],
  [1, 1], [3, 1], [5, 1],
  [2, 2], [3, 2], [4, 2],
  [0, 3], [1, 3], [2, 3], [4, 3], [5, 3], [6, 3],
  [2, 4], [3, 4], [4, 4],
  [1, 5], [3, 5], [5, 5],
  [0, 6], [3, 6], [6, 6]
];
export const MUEHLEN = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8], [9, 10, 11], [12, 13, 14], [15, 16, 17], [18, 19, 20], [21, 22, 23],
  [0, 9, 21], [3, 10, 18], [6, 11, 15], [1, 4, 7], [16, 19, 22], [8, 12, 17], [5, 13, 20], [2, 14, 23]
];
export const NACHBARN = Array.from({ length: 24 }, () => []);
for (const [a, b, c] of MUEHLEN) { NACHBARN[a].push(b); NACHBARN[b].push(a, c); NACHBARN[c].push(b); }
export const MUEHLEN_AN = Array.from({ length: 24 }, () => []);
MUEHLEN.forEach((m, i) => m.forEach((p) => MUEHLEN_AN[p].push(i)));

export const STEINE = 9;
export const RUHIG_MAX = 100;   // Halbzüge ohne Schlagen in der Zugphase bis Remis
export const STUFEN = {
  gemuetlich: { tiefe: 1, toleranz: 40, fehler: 0.2 },
  geuebt: { tiefe: 3, toleranz: 6, fehler: 0.04 },
  meister: { tiefe: 14, zeit: 900, toleranz: 0, fehler: 0 }
};

// ---------- Zufall (deterministisch, für Tests und Zobrist) ----------
export function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const zr = rng(20261024);
const zz = () => (zr() * 4294967296) >>> 0;
const Z_STEIN = [null, Array.from({ length: 24 }, () => [zz(), zz()]), Array.from({ length: 24 }, () => [zz(), zz()])];
const Z_HAND = [null, Array.from({ length: STEINE + 1 }, () => [zz(), zz()]), Array.from({ length: STEINE + 1 }, () => [zz(), zz()])];
const Z_AM = [zz(), zz()];

// ---------- Stellung ----------
export function neueStellung() {
  const s = { b: new Int8Array(24), am: 1, hand: [0, STEINE, STEINE], brett: [0, 0, 0], ruhig: 0, h1: 0, h2: 0 };
  s.h1 = Z_HAND[1][STEINE][0] ^ Z_HAND[2][STEINE][0]; s.h2 = Z_HAND[1][STEINE][1] ^ Z_HAND[2][STEINE][1];
  return s;
}
export function kopie(s) { return { b: Int8Array.from(s.b), am: s.am, hand: s.hand.slice(), brett: s.brett.slice(), ruhig: s.ruhig, h1: s.h1, h2: s.h2 }; }
export const schluessel = (s) => s.h1.toString(36) + '.' + s.h2.toString(36);
export const zugphase = (s) => s.hand[1] === 0 && s.hand[2] === 0;
export const springt = (s, p) => s.hand[p] === 0 && s.brett[p] === 3;
export const steine = (s, p) => s.hand[p] + s.brett[p];

export function inMuehle(b, i, p = b[i]) {
  if (!p) return false;
  for (const mi of MUEHLEN_AN[i]) { const m = MUEHLEN[mi]; if (b[m[0]] === p && b[m[1]] === p && b[m[2]] === p) return true; }
  return false;
}
// schließt der Stein p auf t (von f kommend) eine Mühle?
function schliesst(b, f, t, p) {
  for (const mi of MUEHLEN_AN[t]) {
    const m = MUEHLEN[mi]; let ok = true;
    for (const q of m) if (q !== t && (q === f || b[q] !== p)) { ok = false; break; }
    if (ok) return true;
  }
  return false;
}
export function schlagbar(b, o) {
  const alle = [], frei = [];
  for (let i = 0; i < 24; i++) if (b[i] === o) { alle.push(i); if (!inMuehle(b, i, o)) frei.push(i); }
  return frei.length ? frei : alle;
}

// Alle Züge der Seite am Zug. Zug = { f: von (-1 = setzen), t: nach, r: geschlagener Stein (-1 = keiner) }
export function zuege(s) {
  const p = s.am, o = 3 - p, b = s.b, out = [];
  const add = (f, t) => {
    if (schliesst(b, f, t, p)) {
      // Schlagbare Steine nach dem Zug bestimmen (der eigene Zug ändert gegnerische Mühlen nicht)
      for (const r of schlagbar(b, o)) out.push({ f, t, r });
    } else out.push({ f, t, r: -1 });
  };
  if (s.hand[p] > 0) { for (let t = 0; t < 24; t++) if (!b[t]) add(-1, t); }
  else if (s.brett[p] === 3) { for (let f = 0; f < 24; f++) if (b[f] === p) for (let t = 0; t < 24; t++) if (!b[t]) add(f, t); }
  else { for (let f = 0; f < 24; f++) if (b[f] === p) for (const t of NACHBARN[f]) if (!b[t]) add(f, t); }
  return out;
}
function hatZug(s) {
  const p = s.am, b = s.b;
  if (s.hand[p] > 0 || s.brett[p] === 3) return true;   // Setzen/Springen: es gibt immer einen freien Punkt
  for (let f = 0; f < 24; f++) if (b[f] === p) for (const t of NACHBARN[f]) if (!b[t]) return true;
  return false;
}

// Zug ausführen (verändert s), liefert die Daten zum Zurücknehmen
export function mache(s, m) {
  const p = s.am, o = 3 - p, u = s.ruhig;
  if (m.f < 0) {
    s.h1 ^= Z_HAND[p][s.hand[p]][0]; s.h2 ^= Z_HAND[p][s.hand[p]][1];
    s.hand[p]--; s.brett[p]++;
    s.h1 ^= Z_HAND[p][s.hand[p]][0]; s.h2 ^= Z_HAND[p][s.hand[p]][1];
  } else { s.b[m.f] = 0; s.h1 ^= Z_STEIN[p][m.f][0]; s.h2 ^= Z_STEIN[p][m.f][1]; }
  s.b[m.t] = p; s.h1 ^= Z_STEIN[p][m.t][0]; s.h2 ^= Z_STEIN[p][m.t][1];
  if (m.r >= 0) { s.b[m.r] = 0; s.brett[o]--; s.h1 ^= Z_STEIN[o][m.r][0]; s.h2 ^= Z_STEIN[o][m.r][1]; }
  s.ruhig = m.r >= 0 || m.f < 0 ? 0 : u + 1;
  s.am = o; s.h1 ^= Z_AM[0]; s.h2 ^= Z_AM[1];
  return u;
}
export function nimmZurueck(s, m, u) {
  const o = s.am, p = 3 - o;
  s.am = p; s.h1 ^= Z_AM[0]; s.h2 ^= Z_AM[1];
  s.ruhig = u;
  if (m.r >= 0) { s.b[m.r] = o; s.brett[o]++; s.h1 ^= Z_STEIN[o][m.r][0]; s.h2 ^= Z_STEIN[o][m.r][1]; }
  s.b[m.t] = 0; s.h1 ^= Z_STEIN[p][m.t][0]; s.h2 ^= Z_STEIN[p][m.t][1];
  if (m.f < 0) {
    s.h1 ^= Z_HAND[p][s.hand[p]][0]; s.h2 ^= Z_HAND[p][s.hand[p]][1];
    s.hand[p]++; s.brett[p]--;
    s.h1 ^= Z_HAND[p][s.hand[p]][0]; s.h2 ^= Z_HAND[p][s.hand[p]][1];
  } else { s.b[m.f] = p; s.h1 ^= Z_STEIN[p][m.f][0]; s.h2 ^= Z_STEIN[p][m.f][1]; }
}

// ---------- Partie (mit Verlauf, Wiederholung, Kodierung) ----------
const ZEICHEN = 'abcdefghijklmnopqrstuvwxy';   // 0..23 = a..x, y = keiner
export const kodiere = (m) => ZEICHEN[m.f < 0 ? 24 : m.f] + ZEICHEN[m.t] + ZEICHEN[m.r < 0 ? 24 : m.r];
export function dekodiere(str) {
  const out = [];
  if (typeof str !== 'string' || str.length % 3) return null;
  for (let i = 0; i < str.length; i += 3) {
    const f = ZEICHEN.indexOf(str[i]), t = ZEICHEN.indexOf(str[i + 1]), r = ZEICHEN.indexOf(str[i + 2]);
    if (f < 0 || t < 0 || t > 23 || r < 0) return null;
    out.push({ f: f === 24 ? -1 : f, t, r: r === 24 ? -1 : r });
  }
  return out;
}
export const gleich = (a, b) => a.f === b.f && a.t === b.t && a.r === b.r;

export function neuePartie() { const s = neueStellung(); return { s, zuege: [], wdh: new Map() }; }
// Zug in die Partie übernehmen; false, wenn er nicht erlaubt ist
export function spiele(partie, m) {
  if (status(partie).ende) return false;
  const z = zuege(partie.s).find((x) => gleich(x, m));
  if (!z) return false;
  mache(partie.s, z); partie.zuege.push(z);
  if (zugphase(partie.s)) { const k = schluessel(partie.s); partie.wdh.set(k, (partie.wdh.get(k) || 0) + 1); }
  return true;
}
export function partieAus(str) {
  const liste = dekodiere(str); if (!liste) return null;
  const p = neuePartie();
  for (const m of liste) if (!spiele(p, m)) return null;
  return p;
}
export const partieText = (partie) => partie.zuege.map(kodiere).join('');

// Ergebnis: { ende, sieger (1/2, 0 = remis), grund: 'steine' | 'blockiert' | 'wiederholung' | 'ruhig' }
export function status(partie) {
  const s = partie.s, p = s.am, o = 3 - p;
  if (steine(s, p) < 3) return { ende: true, sieger: o, grund: 'steine' };
  if (!hatZug(s)) return { ende: true, sieger: o, grund: 'blockiert' };
  if (zugphase(s) && (partie.wdh.get(schluessel(s)) || 0) >= 3) return { ende: true, sieger: 0, grund: 'wiederholung' };
  if (s.ruhig >= RUHIG_MAX) return { ende: true, sieger: 0, grund: 'ruhig' };
  return { ende: false, sieger: 0, grund: '' };
}

// ---------- Bewertung ----------
const SIEG = 100000;
function beweglichkeit(b, p) {
  let n = 0, fest = 0;
  for (let f = 0; f < 24; f++) if (b[f] === p) { let k = 0; for (const t of NACHBARN[f]) if (!b[t]) k++; n += k; if (!k) fest++; }
  return [n, fest];
}
export function bewerte(s, p) {
  const o = 3 - p, b = s.b;
  let w = (steine(s, p) - steine(s, o)) * 120;
  for (const m of MUEHLEN) {
    let e = 0, g = 0, l = 0;
    for (const q of m) { const v = b[q]; if (v === p) e++; else if (v === o) g++; else l++; }
    if (e === 3) w += 14; else if (g === 3) w -= 14;
    else if (e === 2 && l === 1) w += 7; else if (g === 2 && l === 1) w -= 7;
  }
  // Steine auf Kreuzungen (4 Nachbarn) sind beweglicher
  for (const i of [4, 10, 13, 19]) { if (b[i] === p) w += 3; else if (b[i] === o) w -= 3; }
  if (s.hand[p] === 0 || s.hand[o] === 0) {
    const [mp, fp] = beweglichkeit(b, p), [mo, fo] = beweglichkeit(b, o);
    if (!springt(s, p)) w += mp * 2 - fp * 4;
    if (!springt(s, o)) w -= mo * 2 - fo * 4;
  }
  return w;
}

// ---------- Suche ----------
class Abbruch extends Error {}
function ordne(liste, tt) {
  for (const m of liste) m.o = (m.r >= 0 ? 1000 : 0) + (tt && gleich(m, tt) ? 5000 : 0);
  liste.sort((a, b) => b.o - a.o);
  return liste;
}

// Bester Zug für die Seite am Zug. stufe: 'gemuetlich' | 'geuebt' | 'meister' oder Objekt wie in STUFEN.
// opts: { zufall: () => [0,1), gesehen: Set/Map mit Stellungsschlüsseln der Partie, zeit: ms, tiefe }
export function kiZug(stellung, stufe = 'meister', opts = {}) {
  const st = typeof stufe === 'string' ? STUFEN[stufe] : stufe;
  const zufall = opts.zufall || Math.random;
  const s = kopie(stellung);
  const alle = zuege(s);
  if (!alle.length) return null;
  if (alle.length === 1) return alle[0];
  if (st.fehler && zufall() < st.fehler) return alle[Math.floor(zufall() * alle.length)];

  const gesehen = opts.gesehen || new Map();
  const pfad = [];
  const tt = new Map();
  const maxTiefe = opts.tiefe || st.tiefe;
  const zeit = opts.zeit != null ? opts.zeit : st.zeit;
  const ende = zeit ? Date.now() + zeit : Infinity;
  let knoten = 0;

  function suche(tiefe, alpha, beta, ply) {
    if ((++knoten & 2047) === 0 && Date.now() > ende) throw new Abbruch();
    const p = s.am;
    if (steine(s, p) < 3) return -(SIEG - ply);
    if (zugphase(s)) {
      const k = schluessel(s);
      if (pfad.includes(k) || (gesehen.get(k) || 0) >= 2) return 0;
      if (s.ruhig >= RUHIG_MAX) return 0;
    }
    const liste = zuege(s);
    if (!liste.length) return -(SIEG - ply);
    if (tiefe <= 0) return bewerte(s, p);
    const a0 = alpha;
    const e = tt.get(s.h1);
    let ttZug = null;
    if (e && e.h2 === s.h2) {
      ttZug = e.zug;
      if (e.tiefe >= tiefe) {
        if (e.typ === 0) return e.wert;
        if (e.typ === 1 && e.wert >= beta) return e.wert;
        if (e.typ === 2 && e.wert <= alpha) return e.wert;
      }
    }
    ordne(liste, ttZug);
    let bester = -Infinity, besterZug = null;
    const k = zugphase(s) ? schluessel(s) : null;
    if (k) pfad.push(k);
    try {
      for (const m of liste) {
        const u = mache(s, m);
        let w;
        try { w = -suche(tiefe - 1, -beta, -alpha, ply + 1); } finally { nimmZurueck(s, m, u); }
        if (w > bester) { bester = w; besterZug = m; }
        if (w > alpha) alpha = w;
        if (alpha >= beta) break;
      }
    } finally { if (k) pfad.pop(); }
    tt.set(s.h1, { h2: s.h2, tiefe, wert: bester, typ: bester <= a0 ? 2 : bester >= beta ? 1 : 0, zug: besterZug });
    return bester;
  }

  // Wurzel: jeden Zug mit offenem Fenster bewerten, wenn eine Toleranz gewünscht ist (schwächere Stufen),
  // sonst normales Alpha-Beta. Gleich gute Züge werden zufällig gewählt, damit Partien abwechslungsreich bleiben.
  const wurzel = alle.map((m) => ({ m, w: 0, z: zufall() }));
  let ergebnis = null;
  for (let tiefe = 1; tiefe <= maxTiefe; tiefe++) {
    try {
      let alpha = -Infinity;
      const tol = st.toleranz || 0;
      for (const x of wurzel) {
        const u = mache(s, x.m);
        // Fenster bis alpha-1: gleich gute Züge bekommen einen genauen Wert und bleiben Kandidaten
        try { x.w = -suche(tiefe - 1, -Infinity, tol ? Infinity : -(alpha - 1), 1); } finally { nimmZurueck(s, x.m, u); }
        if (x.w > alpha) alpha = x.w;
      }
      wurzel.sort((a, b) => b.w - a.w || a.z - b.z);
      const top = wurzel[0].w;
      // Gewinn gefunden oder sicher verloren: weiter suchen bringt nichts
      ergebnis = wurzel.filter((x) => x.w >= top - tol);
      if (opts.info) { opts.info.tiefe = tiefe; opts.info.wert = top; opts.info.knoten = knoten; }
      if (Math.abs(top) > SIEG / 2) break;
      // Zugreihenfolge für die nächste Tiefe: bester zuerst
      for (const x of wurzel) x.z = zufall();
    } catch (err) {
      if (!(err instanceof Abbruch)) throw err;
      break;
    }
  }
  if (!ergebnis) return alle[Math.floor(zufall() * alle.length)];
  // Bei Toleranz 0 sind nur exakt gleich bewertete Züge gleichwertig (Reihenfolge war zufällig gemischt)
  return ergebnis[Math.floor(zufall() * ergebnis.length)].m;
}
