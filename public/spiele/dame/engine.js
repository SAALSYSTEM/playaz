// DAME: Regeln und Computergegner. Keine Abhängigkeiten, läuft im Browser und in Node (Tests).
//
// Brett 8x8, Feld i = Zeile * 8 + Spalte, Zeile 0 oben. Gespielt wird auf den dunklen Feldern ((Zeile + Spalte) ungerade).
// Hell beginnt unten (Zeilen 5–7) und zieht nach oben, Dunkel oben (Zeilen 0–2) und zieht nach unten. Je 12 Steine.
//
// Regeln (Deutsche Dame, wie sie meist gespielt wird):
// - Steine ziehen ein Feld schräg vorwärts, schlagen aber vorwärts und rückwärts (über einen Nachbarstein auf das freie Feld dahinter)
// - Schlagpflicht: Kann geschlagen werden, muss geschlagen werden; man darf frei wählen, welcher Schlag, muss ihn aber bis zum Ende ausführen
// - Mehrfachschlag in einem Zug; geschlagene Steine verschwinden erst am Ende des Zugs und dürfen nicht zweimal übersprungen werden
// - Erreicht ein Stein die gegnerische Grundreihe, wird er zur Dame (nur wenn der Zug dort endet)
// - Die Dame zieht und schlägt beliebig weit schräg und darf nach dem Schlagen auf jedem freien Feld dahinter landen
// - Verloren hat, wer keinen Zug mehr hat (auch: keine Steine mehr)
// - Remis: dieselbe Stellung zum dritten Mal oder 25 Züge je Seite nur mit Damen und ohne Schlagen

export const VERSION = 1;
export const STEINE = 12;
export const RUHIG_MAX = 50;
export const STUFEN = {
  gemuetlich: { tiefe: 2, toleranz: 40, fehler: 0.2 },
  geuebt: { tiefe: 4, toleranz: 6, fehler: 0.03 },
  meister: { tiefe: 30, zeit: 900, toleranz: 0, fehler: 0 }
};

export const spielbar = (i) => ((((i >> 3) + (i & 7)) & 1) === 1);
export const farbe = (v) => (v ? ((v - 1) & 1) + 1 : 0);   // 1/3 hell, 2/4 dunkel
export const istDame = (v) => v > 2;
const zeile = (i) => i >> 3;
// Strahlen: STRAHL[i][d] = Felder von i aus in Richtung d (0: hoch-links, 1: hoch-rechts, 2: runter-links, 3: runter-rechts)
const RICHT = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
export const STRAHL = Array.from({ length: 64 }, (_, i) => RICHT.map(([dr, dc]) => {
  const out = []; let r = zeile(i) + dr, c = (i & 7) + dc;
  while (r >= 0 && r < 8 && c >= 0 && c < 8) { out.push(r * 8 + c); r += dr; c += dc; }
  return out;
}));
const VORWAERTS = [null, [0, 1], [2, 3]];     // Hell zieht nach oben, Dunkel nach unten
const ZIELREIHE = [null, 0, 7];

// ---------- Zufall (deterministisch, für Tests und Zobrist) ----------
export function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const zr = rng(20261025);
const zz = () => (zr() * 4294967296) >>> 0;
const Z = [null, 1, 2, 3, 4].map((v) => (v ? Array.from({ length: 64 }, () => [zz(), zz()]) : null));
const Z_AM = [zz(), zz()];

// ---------- Stellung ----------
export function neueStellung() {
  const s = { b: new Int8Array(64), am: 1, ruhig: 0, h1: 0, h2: 0 };
  for (let i = 0; i < 64; i++) if (spielbar(i)) { if (zeile(i) <= 2) setze(s, i, 2); else if (zeile(i) >= 5) setze(s, i, 1); }
  return s;
}
function setze(s, i, v) {
  const alt = s.b[i];
  if (alt) { s.h1 ^= Z[alt][i][0]; s.h2 ^= Z[alt][i][1]; }
  s.b[i] = v;
  if (v) { s.h1 ^= Z[v][i][0]; s.h2 ^= Z[v][i][1]; }
}
export function aus(felder, am = 1) {   // Stellung von Hand: { feld: wert }
  const s = { b: new Int8Array(64), am: 1, ruhig: 0, h1: 0, h2: 0 };
  for (const [i, v] of Object.entries(felder)) setze(s, Number(i), v);
  if (am === 2) { s.am = 2; s.h1 ^= Z_AM[0]; s.h2 ^= Z_AM[1]; }
  return s;
}
export function kopie(s) { return { b: Int8Array.from(s.b), am: s.am, ruhig: s.ruhig, h1: s.h1, h2: s.h2 }; }
export const schluessel = (s) => s.h1.toString(36) + '.' + s.h2.toString(36);
export function zaehle(s, p) { let st = 0, da = 0; for (let i = 0; i < 64; i++) if (farbe(s.b[i]) === p) { if (istDame(s.b[i])) da++; else st++; } return { st, da, alle: st + da }; }

// ---------- Züge ----------
// Zug = { p: [Start, Landefeld, Landefeld …], x: [geschlagene Felder] }
function folge(b, pos, v, pfad, geschl, out) {
  const p = farbe(v), o = 3 - p;
  let weiter = false;
  for (let d = 0; d < 4; d++) {
    const ray = STRAHL[pos][d];
    if (!istDame(v)) {
      if (ray.length < 2) continue;
      const a = ray[0], z = ray[1];
      if (farbe(b[a]) === o && !geschl.includes(a) && b[z] === 0) { weiter = true; folge(b, z, v, [...pfad, z], [...geschl, a], out); }
    } else {
      let k = 0;
      while (k < ray.length && b[ray[k]] === 0) k++;
      if (k >= ray.length) continue;
      const a = ray[k];
      if (farbe(b[a]) !== o || geschl.includes(a)) continue;
      k++;
      while (k < ray.length && b[ray[k]] === 0) { weiter = true; folge(b, ray[k], v, [...pfad, ray[k]], [...geschl, a], out); k++; }
    }
  }
  if (!weiter && geschl.length) out.push({ p: pfad, x: geschl });
}
export function zuege(s) {
  const p = s.am, b = s.b, schlag = [], ruhig = [];
  for (let i = 0; i < 64; i++) {
    const v = b[i]; if (farbe(v) !== p) continue;
    b[i] = 0; folge(b, i, v, [i], [], schlag); b[i] = v;
  }
  if (schlag.length) return schlag;
  for (let i = 0; i < 64; i++) {
    const v = b[i]; if (farbe(v) !== p) continue;
    if (istDame(v)) { for (let d = 0; d < 4; d++) for (const t of STRAHL[i][d]) { if (b[t]) break; ruhig.push({ p: [i, t], x: [] }); } }
    else for (const d of VORWAERTS[p]) { const t = STRAHL[i][d][0]; if (t !== undefined && !b[t]) ruhig.push({ p: [i, t], x: [] }); }
  }
  return ruhig;
}
export const gleich = (a, b) => a.p.length === b.p.length && a.p.every((x, k) => x === b.p[k]);
export const wirdDame = (s, m) => !istDame(s.b[m.p[0]]) && zeile(m.p[m.p.length - 1]) === ZIELREIHE[farbe(s.b[m.p[0]])];

export function mache(s, m) {
  const von = m.p[0], nach = m.p[m.p.length - 1], v = s.b[von];
  const u = { v, xs: m.x.map((i) => s.b[i]), ruhig: s.ruhig };
  setze(s, von, 0);
  for (const i of m.x) setze(s, i, 0);
  const neu = !istDame(v) && zeile(nach) === ZIELREIHE[farbe(v)] ? v + 2 : v;
  setze(s, nach, neu);
  s.ruhig = m.x.length || !istDame(v) ? 0 : s.ruhig + 1;
  s.am = 3 - s.am; s.h1 ^= Z_AM[0]; s.h2 ^= Z_AM[1];
  return u;
}
export function nimmZurueck(s, m, u) {
  const von = m.p[0], nach = m.p[m.p.length - 1];
  s.am = 3 - s.am; s.h1 ^= Z_AM[0]; s.h2 ^= Z_AM[1];
  setze(s, nach, 0);
  m.x.forEach((i, k) => setze(s, i, u.xs[k]));
  setze(s, von, u.v);
  s.ruhig = u.ruhig;
}

// ---------- Partie (Verlauf, Wiederholung, Kodierung) ----------
const ZEICHEN = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
export const kodiere = (m) => m.p.map((i) => ZEICHEN[i]).join('');
export function partieText(partie) { return partie.zuege.map(kodiere).join('.'); }
export function neuePartie() { const s = neueStellung(); const p = { s, zuege: [], wdh: new Map() }; p.wdh.set(schluessel(s), 1); return p; }
export function spiele(partie, m) {
  if (status(partie).ende) return false;
  const z = zuege(partie.s).find((x) => gleich(x, m));
  if (!z) return false;
  mache(partie.s, z); partie.zuege.push(z);
  const k = schluessel(partie.s); partie.wdh.set(k, (partie.wdh.get(k) || 0) + 1);
  return true;
}
export function partieAus(text) {
  if (typeof text !== 'string' || text.length > 4000) return null;
  const p = neuePartie();
  if (!text) return p;
  for (const teil of text.split('.')) {
    if (teil.length < 2) return null;
    const pfad = [...teil].map((c) => ZEICHEN.indexOf(c));
    if (pfad.some((i) => i < 0)) return null;
    if (!spiele(p, { p: pfad })) return null;
  }
  return p;
}

// Ergebnis: { ende, sieger (1/2, 0 = remis), grund: 'keine' | 'blockiert' | 'wiederholung' | 'ruhig' }
export function status(partie) {
  const s = partie.s, p = s.am;
  if (!zuege(s).length) return { ende: true, sieger: 3 - p, grund: zaehle(s, p).alle ? 'blockiert' : 'keine' };
  if ((partie.wdh.get(schluessel(s)) || 0) >= 3) return { ende: true, sieger: 0, grund: 'wiederholung' };
  if (s.ruhig >= RUHIG_MAX) return { ende: true, sieger: 0, grund: 'ruhig' };
  return { ende: false, sieger: 0, grund: '' };
}

// ---------- Bewertung ----------
const SIEG = 100000;
export function bewerte(s, p) {
  let w = 0, ich = 0, er = 0;
  for (let i = 0; i < 64; i++) {
    const v = s.b[i]; if (!v) continue;
    const f = farbe(v), r = zeile(i), c = i & 7;
    let x;
    if (istDame(v)) x = 320 + (c >= 2 && c <= 5 && r >= 2 && r <= 5 ? 8 : 0);
    else {
      const vor = f === 1 ? 7 - r : r;                  // wie weit vorgerückt (0 = eigene Grundreihe)
      x = 100 + vor * 4 + (vor === 0 ? 8 : 0) + (c >= 2 && c <= 5 ? 3 : 0) + (c === 0 || c === 7 ? -2 : 0);
    }
    if (f === p) { w += x; ich++; } else { w -= x; er++; }
  }
  // Wer vorne liegt, tauscht gern ab (weniger Steine insgesamt = Vorsprung zählt mehr)
  if (w > 150) w += (24 - ich - er) * 4; else if (w < -150) w -= (24 - ich - er) * 4;
  return w;
}

// ---------- Suche ----------
class Abbruch extends Error {}
function ordne(liste, tt) {
  for (const m of liste) m.o = m.x.length * 100 + (tt && gleich(m, tt) ? 5000 : 0);
  return liste.sort((a, b) => b.o - a.o);
}
export function kiZug(stellung, stufe = 'meister', opts = {}) {
  const st = typeof stufe === 'string' ? STUFEN[stufe] : stufe;
  const zufall = opts.zufall || Math.random;
  const s = kopie(stellung);
  const alle = zuege(s);
  if (!alle.length) return null;
  if (alle.length === 1) return alle[0];
  if (st.fehler && zufall() < st.fehler) return alle[Math.floor(zufall() * alle.length)];

  const gesehen = opts.gesehen || new Map();
  const pfad = [], tt = new Map();
  const maxTiefe = opts.tiefe || st.tiefe;
  const zeit = opts.zeit != null ? opts.zeit : st.zeit;
  const ende = zeit ? Date.now() + zeit : Infinity;
  let knoten = 0;

  function suche(tiefe, alpha, beta, ply) {
    if ((++knoten & 2047) === 0 && Date.now() > ende) throw new Abbruch();
    const p = s.am, k = schluessel(s);
    if (ply > 0 && (pfad.includes(k) || (gesehen.get(k) || 0) >= 2)) return 0;
    if (s.ruhig >= RUHIG_MAX) return 0;
    const liste = zuege(s);
    if (!liste.length) return -(SIEG - ply);
    const zwang = liste[0].x.length > 0;
    // Schläge werden am Horizont zu Ende gerechnet, sonst übersieht die Suche Rückschläge
    if ((tiefe <= 0 && !zwang) || ply > 60) return bewerte(s, p);
    const a0 = alpha, e = tt.get(s.h1);
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
    const neu = tiefe <= 0 ? 0 : (liste.length === 1 ? tiefe : tiefe - 1);   // Zwangszug: nicht abziehen
    let bester = -Infinity, besterZug = null;
    pfad.push(k);
    try {
      for (const m of liste) {
        const u = mache(s, m);
        let w;
        try { w = -suche(neu, -beta, -alpha, ply + 1); } finally { nimmZurueck(s, m, u); }
        if (w > bester) { bester = w; besterZug = m; }
        if (w > alpha) alpha = w;
        if (alpha >= beta) break;
      }
    } finally { pfad.pop(); }
    tt.set(s.h1, { h2: s.h2, tiefe, wert: bester, typ: bester <= a0 ? 2 : bester >= beta ? 1 : 0, zug: besterZug });
    return bester;
  }

  const wurzel = alle.map((m) => ({ m, w: 0, z: zufall() }));
  let ergebnis = null;
  pfad.push(schluessel(s));
  for (let tiefe = 1; tiefe <= maxTiefe; tiefe++) {
    try {
      let alpha = -Infinity;
      const tol = st.toleranz || 0;
      for (const x of wurzel) {
        const u = mache(s, x.m);
        try { x.w = -suche(tiefe - 1, -Infinity, tol ? Infinity : -(alpha - 1), 1); } finally { nimmZurueck(s, x.m, u); }
        if (x.w > alpha) alpha = x.w;
      }
      wurzel.sort((a, b) => b.w - a.w || a.z - b.z);
      const top = wurzel[0].w;
      ergebnis = wurzel.filter((x) => x.w >= top - tol);
      if (opts.info) { opts.info.tiefe = tiefe; opts.info.wert = top; opts.info.knoten = knoten; }
      if (Math.abs(top) > SIEG / 2) break;
      for (const x of wurzel) x.z = zufall();
    } catch (err) {
      if (!(err instanceof Abbruch)) throw err;
      break;
    }
  }
  if (!ergebnis) return alle[Math.floor(zufall() * alle.length)];
  return ergebnis[Math.floor(zufall() * ergebnis.length)].m;
}
