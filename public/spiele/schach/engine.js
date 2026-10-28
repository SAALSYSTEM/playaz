// SCHACH: Regeln, Partie und Computergegner ohne Oberfläche (läuft auch im Web Worker und in Node-Tests).
// Brett: 64 Felder, Index = Reihe * 8 + Linie, Reihe 0 = 8. Reihe (oben aus Sicht von Weiß), Feld 0 = a8, 63 = h1.
// Figuren: + Weiß, - Schwarz; 1 Bauer, 2 Springer, 3 Läufer, 4 Turm, 5 Dame, 6 König. Spieler am Zug: 1 = Weiß, 2 = Schwarz.
export const BAUER = 1, SPRINGER = 2, LAEUFER = 3, TURM = 4, DAME = 5, KOENIG = 6;
export const WERT = [0, 100, 320, 330, 500, 900, 0];

export function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export const reihe = (i) => i >> 3, linie = (i) => i & 7;
export const feldName = (i) => 'abcdefgh'[i & 7] + (8 - (i >> 3));
export const feldAus = (t) => (/^[a-h][1-8]$/.test(t) ? (8 - Number(t[1])) * 8 + 'abcdefgh'.indexOf(t[0]) : -1);
const vz = (p) => (p === 1 ? 1 : -1);

// ---------- Tabellen ----------
const SPRUNG = [], KOENIGZ = [], STRAHL = [];        // STRAHL[i][d]: Felder in Richtung d (0..3 gerade, 4..7 schräg)
const RICHT = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]];
for (let i = 0; i < 64; i++) {
  const r = reihe(i), c = linie(i), n = [], k = [], s = [];
  for (const [dr, dc] of [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]]) { const a = r + dr, b = c + dc; if (a >= 0 && a < 8 && b >= 0 && b < 8) n.push(a * 8 + b); }
  for (const [dr, dc] of RICHT) {
    const a = r + dr, b = c + dc; if (a >= 0 && a < 8 && b >= 0 && b < 8) k.push(a * 8 + b);
    const ray = []; for (let x = r + dr, y = c + dc; x >= 0 && x < 8 && y >= 0 && y < 8; x += dr, y += dc) ray.push(x * 8 + y);
    s.push(ray);
  }
  SPRUNG.push(n); KOENIGZ.push(k); STRAHL.push(s);
}

// Zobrist-Schlüssel (zwei 32-Bit-Hälften) für Wiederholung und Transpositionstabelle
const zr = rng(20261028), z32 = () => (zr() * 4294967296) >>> 0;
const ZF = [new Uint32Array(13 * 64), new Uint32Array(13 * 64)];
for (let i = 0; i < 13 * 64; i++) { ZF[0][i] = z32(); ZF[1][i] = z32(); }
const ZR = [Array.from({ length: 16 }, z32), Array.from({ length: 16 }, z32)];
const ZE = [Array.from({ length: 8 }, z32), Array.from({ length: 8 }, z32)];
const ZAM = [z32(), z32()];
const zi = (v, i) => (v + 6) * 64 + i;

// ---------- Stellung ----------
// s = { b, am, ro (Rochaderechte 1 = Weiß kurz, 2 = Weiß lang, 4 = Schwarz kurz, 8 = Schwarz lang), ep (Feld oder -1), halb, nr, k: [_, König Weiß, König Schwarz], h1, h2 }
export const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const ZEICHEN_FIG = { p: 1, n: 2, b: 3, r: 4, q: 5, k: 6 };
export function ausFen(fen) {
  const [brett, am, ro, ep, halb, nr] = fen.trim().split(/\s+/);
  const s = { b: new Int8Array(64), am: am === 'b' ? 2 : 1, ro: 0, ep: ep && ep !== '-' ? feldAus(ep) : -1, halb: Number(halb) || 0, nr: Number(nr) || 1, k: [0, -1, -1], h1: 0, h2: 0 };
  let i = 0;
  for (const ch of brett) {
    if (ch === '/') continue;
    if (/\d/.test(ch)) { i += Number(ch); continue; }
    const t = ZEICHEN_FIG[ch.toLowerCase()]; s.b[i] = ch === ch.toUpperCase() ? t : -t;
    if (t === KOENIG) s.k[ch === 'K' ? 1 : 2] = i;
    i++;
  }
  for (const [ch, bit] of [['K', 1], ['Q', 2], ['k', 4], ['q', 8]]) if (ro && ro.includes(ch)) s.ro |= bit;
  neuerSchluessel(s);
  return s;
}
export function zuFen(s) {
  let out = '';
  for (let r = 0; r < 8; r++) {
    let leer = 0;
    for (let c = 0; c < 8; c++) {
      const v = s.b[r * 8 + c]; if (!v) { leer++; continue; }
      if (leer) { out += leer; leer = 0; }
      const ch = ' pnbrqk'[Math.abs(v)]; out += v > 0 ? ch.toUpperCase() : ch;
    }
    if (leer) out += leer; if (r < 7) out += '/';
  }
  const ro = (s.ro & 1 ? 'K' : '') + (s.ro & 2 ? 'Q' : '') + (s.ro & 4 ? 'k' : '') + (s.ro & 8 ? 'q' : '');
  return out + ' ' + (s.am === 1 ? 'w' : 'b') + ' ' + (ro || '-') + ' ' + (s.ep >= 0 ? feldName(s.ep) : '-') + ' ' + s.halb + ' ' + s.nr;
}
function neuerSchluessel(s) {
  let a = 0, b = 0;
  for (let i = 0; i < 64; i++) if (s.b[i]) { a ^= ZF[0][zi(s.b[i], i)]; b ^= ZF[1][zi(s.b[i], i)]; }
  a ^= ZR[0][s.ro]; b ^= ZR[1][s.ro];
  if (s.ep >= 0) { a ^= ZE[0][s.ep & 7]; b ^= ZE[1][s.ep & 7]; }
  if (s.am === 2) { a ^= ZAM[0]; b ^= ZAM[1]; }
  s.h1 = a >>> 0; s.h2 = b >>> 0;
}
export const neueStellung = () => ausFen(START);
export const kopie = (s) => ({ b: Int8Array.from(s.b), am: s.am, ro: s.ro, ep: s.ep, halb: s.halb, nr: s.nr, k: s.k.slice(), h1: s.h1, h2: s.h2 });
export const schluessel = (s) => s.h1.toString(36) + ':' + s.h2.toString(36);

// Wird Feld i von Spieler p (1/2) angegriffen?
export function angegriffen(s, i, p) {
  const b = s.b, g = vz(p), r = reihe(i), c = linie(i);
  // Bauern: ein weißer Bauer schlägt nach oben (kleinere Reihe), steht also eine Reihe tiefer
  const pr = r + g;
  if (pr >= 0 && pr < 8) { if (c > 0 && b[pr * 8 + c - 1] === g) return true; if (c < 7 && b[pr * 8 + c + 1] === g) return true; }
  for (const t of SPRUNG[i]) if (b[t] === g * SPRINGER) return true;
  for (const t of KOENIGZ[i]) if (b[t] === g * KOENIG) return true;
  const st = STRAHL[i];
  for (let d = 0; d < 8; d++) {
    const ray = st[d];
    for (let k = 0; k < ray.length; k++) {
      const v = b[ray[k]]; if (!v) continue;
      if (v * g > 0) { const t = v * g; if (t === DAME || (d < 4 ? t === TURM : t === LAEUFER)) return true; }
      break;
    }
  }
  return false;
}
export const imSchach = (s, p = s.am) => angegriffen(s, s.k[p], 3 - p);

// ---------- Züge ----------
// Zug als Zahl: von | nach << 6 | umw << 12 | art << 15  (art: 1 en passant, 2 Rochade, 4 Doppelschritt)
const ZUG = (f, t, u = 0, a = 0) => f | (t << 6) | (u << 12) | (a << 15);
export const von = (m) => m & 63, nach = (m) => (m >> 6) & 63, umw = (m) => (m >> 12) & 7, art = (m) => m >> 15;

function pseudo(s, nurSchlag = false) {
  const b = s.b, p = s.am, g = vz(p), out = [];
  const vor = -8 * g, startR = p === 1 ? 6 : 1, endR = p === 1 ? 0 : 7;
  for (let i = 0; i < 64; i++) {
    const v = b[i]; if (v * g <= 0) continue;
    const t = v * g;
    if (t === BAUER) {
      const r = reihe(i), c = linie(i), z = i + vor;
      const zr = reihe(z);
      if (!b[z] && (!nurSchlag || zr === endR)) {
        if (zr === endR) for (const u of [DAME, SPRINGER, TURM, LAEUFER]) out.push(ZUG(i, z, u));
        else { out.push(ZUG(i, z)); if (r === startR && !b[z + vor]) out.push(ZUG(i, z + vor, 0, 4)); }
      }
      for (const dc of [-1, 1]) {
        if (c + dc < 0 || c + dc > 7) continue;
        const x = z + dc;
        if (b[x] * g < 0) { if (zr === endR) for (const u of [DAME, SPRINGER, TURM, LAEUFER]) out.push(ZUG(i, x, u)); else out.push(ZUG(i, x)); }
        else if (x === s.ep) out.push(ZUG(i, x, 0, 1));
      }
    } else if (t === SPRINGER || t === KOENIG) {
      for (const x of (t === SPRINGER ? SPRUNG : KOENIGZ)[i]) { const w = b[x]; if (w * g > 0) continue; if (nurSchlag && !w) continue; out.push(ZUG(i, x)); }
      if (t === KOENIG && !nurSchlag) {
        const kurz = p === 1 ? 1 : 4, lang = p === 1 ? 2 : 8, e = p === 1 ? 60 : 4;
        if (i === e && (s.ro & (kurz | lang)) && !angegriffen(s, e, 3 - p)) {
          if ((s.ro & kurz) && !b[e + 1] && !b[e + 2] && b[e + 3] === g * TURM && !angegriffen(s, e + 1, 3 - p) && !angegriffen(s, e + 2, 3 - p)) out.push(ZUG(e, e + 2, 0, 2));
          if ((s.ro & lang) && !b[e - 1] && !b[e - 2] && !b[e - 3] && b[e - 4] === g * TURM && !angegriffen(s, e - 1, 3 - p) && !angegriffen(s, e - 2, 3 - p)) out.push(ZUG(e, e - 2, 0, 2));
        }
      }
    } else {
      const d0 = t === TURM ? 0 : t === LAEUFER ? 4 : 0, d1 = t === TURM ? 4 : 8;
      for (let d = d0; d < d1; d++) for (const x of STRAHL[i][d]) {
        const w = b[x];
        if (w * g > 0) break;
        if (!nurSchlag || w) out.push(ZUG(i, x));
        if (w) break;
      }
    }
  }
  return out;
}

const RO_MASKE = new Uint8Array(64).fill(15);
RO_MASKE[60] = 15 & ~3; RO_MASKE[63] = 15 & ~1; RO_MASKE[56] = 15 & ~2; RO_MASKE[4] = 15 & ~12; RO_MASKE[7] = 15 & ~4; RO_MASKE[0] = 15 & ~8;

function setzeF(s, i, v) {
  const alt = s.b[i];
  if (alt) { s.h1 ^= ZF[0][zi(alt, i)]; s.h2 ^= ZF[1][zi(alt, i)]; }
  s.b[i] = v;
  if (v) { s.h1 ^= ZF[0][zi(v, i)]; s.h2 ^= ZF[1][zi(v, i)]; }
}
// Zug ausführen; gibt Rückgabedaten für nimmZurueck zurück
export function mache(s, m) {
  const f = von(m), t = nach(m), a = art(m), p = s.am, g = vz(p), v = s.b[f];
  const u = { m, cap: s.b[t], ro: s.ro, ep: s.ep, halb: s.halb, h1: s.h1, h2: s.h2, k: s.k[p] };
  if (s.ep >= 0) { s.h1 ^= ZE[0][s.ep & 7]; s.h2 ^= ZE[1][s.ep & 7]; }
  s.h1 ^= ZR[0][s.ro]; s.h2 ^= ZR[1][s.ro];
  setzeF(s, f, 0);
  if (a & 1) { const x = t + 8 * g; u.cap = s.b[x]; u.epFeld = x; setzeF(s, x, 0); }
  setzeF(s, t, umw(m) ? g * umw(m) : v);
  if (a & 2) { if (t > f) { setzeF(s, f + 3, 0); setzeF(s, f + 1, g * TURM); } else { setzeF(s, f - 4, 0); setzeF(s, f - 1, g * TURM); } }
  if (v * g === KOENIG) s.k[p] = t;
  s.ro &= RO_MASKE[f] & RO_MASKE[t];
  s.ep = a & 4 ? (f + t) >> 1 : -1;
  s.halb = v * g === BAUER || u.cap ? 0 : s.halb + 1;
  if (p === 2) s.nr++;
  s.am = 3 - p;
  s.h1 ^= ZR[0][s.ro] ^ ZAM[0]; s.h2 ^= ZR[1][s.ro] ^ ZAM[1];
  if (s.ep >= 0) { s.h1 ^= ZE[0][s.ep & 7]; s.h2 ^= ZE[1][s.ep & 7]; }
  s.h1 >>>= 0; s.h2 >>>= 0;
  return u;
}
export function nimmZurueck(s, u) {
  const m = u.m, f = von(m), t = nach(m), a = art(m);
  s.am = 3 - s.am; const p = s.am, g = vz(p);
  if (p === 2) s.nr--;
  const v = umw(m) ? g * BAUER : s.b[t];
  s.b[f] = v;
  if (a & 1) { s.b[t] = 0; s.b[u.epFeld] = u.cap; } else s.b[t] = u.cap;
  if (a & 2) { if (t > f) { s.b[f + 1] = 0; s.b[f + 3] = g * TURM; } else { s.b[f - 1] = 0; s.b[f - 4] = g * TURM; } }
  s.k[p] = u.k; s.ro = u.ro; s.ep = u.ep; s.halb = u.halb; s.h1 = u.h1; s.h2 = u.h2;
}
// Alle erlaubten Züge (der eigene König darf danach nicht im Schach stehen)
export function zuege(s, nurSchlag = false) {
  const p = s.am, out = [];
  for (const m of pseudo(s, nurSchlag)) { const u = mache(s, m); if (!angegriffen(s, s.k[p], 3 - p)) out.push(m); nimmZurueck(s, u); }
  return out;
}
export function perft(s, tiefe) {
  if (tiefe === 0) return 1;
  let n = 0;
  for (const m of zuege(s)) { const u = mache(s, m); n += tiefe === 1 ? 1 : perft(s, tiefe - 1); nimmZurueck(s, u); }
  return n;
}

// Zug als Text: e2e4, e7e8q
export const zugText = (m) => feldName(von(m)) + feldName(nach(m)) + (umw(m) ? ' nbrq'[umw(m) - 1] : '');
export function zugAus(s, text) {
  text = String(text);
  const f = feldAus(text.slice(0, 2)), t = feldAus(text.slice(2, 4)), u = text[4] ? 'nbrq'.indexOf(text[4]) + 2 : 0;
  if (f < 0 || t < 0 || u === 1) return null;
  return zuege(s).find((m) => von(m) === f && nach(m) === t && umw(m) === u) ?? null;
}
// Kurze Notation auf Deutsch (K, D, T, L, S), z. B. Sf3, exd5, O-O, e8=D+
export function notation(s, m) {
  const f = von(m), t = nach(m), v = Math.abs(s.b[f]), schlag = s.b[t] || (art(m) & 1);
  let txt;
  if (art(m) & 2) txt = t > f ? 'O-O' : 'O-O-O';
  else {
    const B = ' .SLTDK'[v];
    if (v === BAUER) txt = (schlag ? 'abcdefgh'[f & 7] + 'x' : '') + feldName(t) + (umw(m) ? '=' + ' .SLTD'[umw(m)] : '');
    else {
      const andere = zuege(s).filter((x) => x !== m && nach(x) === t && Math.abs(s.b[von(x)]) === v);
      let zus = '';
      if (andere.length) zus = andere.some((x) => linie(von(x)) === linie(f)) ? (andere.some((x) => reihe(von(x)) === reihe(f)) ? feldName(f) : feldName(f)[1]) : feldName(f)[0];
      txt = B + zus + (schlag ? 'x' : '') + feldName(t);
    }
  }
  const u = mache(s, m), schach = imSchach(s), matt = schach && !zuege(s).length; nimmZurueck(s, u);
  return txt + (matt ? '#' : schach ? '+' : '');
}

// ---------- Partie ----------
export function neuePartie() { const s = neueStellung(); const p = { s, zuege: [], wdh: new Map() }; p.wdh.set(schluessel(s), 1); return p; }
export function spiele(partie, m) {
  if (status(partie).ende) return false;
  if (!zuege(partie.s).includes(m)) return false;
  mache(partie.s, m); partie.zuege.push(m);
  const k = schluessel(partie.s); partie.wdh.set(k, (partie.wdh.get(k) || 0) + 1);
  return true;
}
export const partieText = (partie) => partie.zuege.map(zugText).join(' ');
export function partieAus(text) {
  if (typeof text !== 'string' || text.length > 6000) return null;
  const p = neuePartie();
  for (const t of text.split(' ').filter(Boolean)) { const m = zugAus(p.s, t); if (m === null || !spiele(p, m)) return null; }
  return p;
}
function zuWenigMaterial(s) {
  const fig = [];
  for (let i = 0; i < 64; i++) { const t = Math.abs(s.b[i]); if (t && t !== KOENIG) { if (t === BAUER || t === TURM || t === DAME) return false; fig.push({ t, i }); } }
  if (fig.length <= 1) return true;
  // nur Läufer, alle auf derselben Feldfarbe
  return fig.every((x) => x.t === LAEUFER) && new Set(fig.map((x) => (reihe(x.i) + linie(x.i)) & 1)).size === 1;
}
// Ergebnis: { ende, sieger (1/2, 0 = Remis), grund: 'matt' | 'patt' | 'wiederholung' | 'fuenfzig' | 'material' }
export function status(partie) {
  const s = partie.s;
  if (!zuege(s).length) return imSchach(s) ? { ende: true, sieger: 3 - s.am, grund: 'matt' } : { ende: true, sieger: 0, grund: 'patt' };
  if ((partie.wdh.get(schluessel(s)) || 0) >= 3) return { ende: true, sieger: 0, grund: 'wiederholung' };
  if (s.halb >= 100) return { ende: true, sieger: 0, grund: 'fuenfzig' };
  if (zuWenigMaterial(s)) return { ende: true, sieger: 0, grund: 'material' };
  return { ende: false, sieger: 0, grund: '' };
}

// ---------- Bewertung ----------
// Figurentabellen aus Sicht von Weiß (Index 0 = a8), angelehnt an die „Simplified Evaluation Function“
const PST = [null,
  [0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 50, 50, 50, 50, 50, 50, 10, 10, 20, 30, 30, 20, 10, 10, 5, 5, 10, 25, 25, 10, 5, 5, 0, 0, 0, 20, 20, 0, 0, 0, 5, -5, -10, 0, 0, -10, -5, 5, 5, 10, 10, -20, -20, 10, 10, 5, 0, 0, 0, 0, 0, 0, 0, 0],
  [-50, -40, -30, -30, -30, -30, -40, -50, -40, -20, 0, 0, 0, 0, -20, -40, -30, 0, 10, 15, 15, 10, 0, -30, -30, 5, 15, 20, 20, 15, 5, -30, -30, 0, 15, 20, 20, 15, 0, -30, -30, 5, 10, 15, 15, 10, 5, -30, -40, -20, 0, 5, 5, 0, -20, -40, -50, -40, -30, -30, -30, -30, -40, -50],
  [-20, -10, -10, -10, -10, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 10, 10, 5, 0, -10, -10, 5, 5, 10, 10, 5, 5, -10, -10, 0, 10, 10, 10, 10, 0, -10, -10, 10, 10, 10, 10, 10, 10, -10, -10, 5, 0, 0, 0, 0, 5, -10, -20, -10, -10, -10, -10, -10, -10, -20],
  [0, 0, 0, 0, 0, 0, 0, 0, 5, 10, 10, 10, 10, 10, 10, 5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, 0, 0, 0, 5, 5, 0, 0, 0],
  [-20, -10, -10, -5, -5, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 5, 5, 5, 0, -10, -5, 0, 5, 5, 5, 5, 0, -5, 0, 0, 5, 5, 5, 5, 0, -5, -10, 5, 5, 5, 5, 5, 0, -10, -10, 0, 5, 0, 0, 0, 0, -10, -20, -10, -10, -5, -5, -10, -10, -20],
  [-30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -20, -30, -30, -40, -40, -30, -30, -20, -10, -20, -20, -20, -20, -20, -20, -10, 20, 20, 0, 0, 0, 0, 20, 20, 20, 30, 10, 0, 0, 10, 30, 20]];
const KOENIG_ENDE = [-50, -40, -30, -20, -20, -30, -40, -50, -30, -20, -10, 0, 0, -10, -20, -30, -30, -10, 20, 30, 30, 20, -10, -30, -30, -10, 30, 40, 40, 30, -10, -30, -30, -10, 30, 40, 40, 30, -10, -30, -30, -10, 20, 30, 30, 20, -10, -30, -30, -30, 0, 0, 0, 0, -30, -30, -50, -30, -30, -30, -30, -30, -30, -50];
const PHASE = [0, 0, 1, 1, 2, 4, 0];

// Bewertung aus Sicht des Spielers p (in Hundertstel Bauern)
export function bewerte(s, p = s.am) {
  let mg = 0, eg = 0, phase = 0, lw = 0, ls = 0;
  const b = s.b;
  for (let i = 0; i < 64; i++) {
    const v = b[i]; if (!v) continue;
    const t = v > 0 ? v : -v, j = v > 0 ? i : i ^ 56, g = v > 0 ? 1 : -1;   // Schwarz: Tabelle gespiegelt
    phase += PHASE[t];
    if (t === KOENIG) { mg += g * PST[6][j]; eg += g * KOENIG_ENDE[j]; continue; }
    const w = WERT[t] + PST[t][j]; mg += g * w; eg += g * w;
    if (t === LAEUFER) { if (g > 0) lw++; else ls++; }
  }
  if (lw >= 2) { mg += 30; eg += 30; } if (ls >= 2) { mg -= 30; eg -= 30; }
  const ph = Math.min(24, phase);
  const w = (mg * ph + eg * (24 - ph)) / 24;
  return p === 1 ? w : -w;
}

// ---------- Suche ----------
export const STUFEN = {
  gemuetlich: { tiefe: 1, toleranz: 90, fehler: 0.12 },
  geuebt: { tiefe: 3, toleranz: 12, fehler: 0.02 },
  meister: { tiefe: 30, zeit: 1000 }
};
const MATT = 30000;
class Abbruch extends Error {}

// Kleines Eröffnungsbuch: gängige erste Züge, damit der Computer nicht mit Randbauern beginnt
const BUCH = {
  '': ['e2e4', 'd2d4', 'c2c4', 'g1f3'],
  'e2e4': ['e7e5', 'c7c5', 'e7e6', 'c7c6'], 'd2d4': ['d7d5', 'g8f6'], 'c2c4': ['e7e5', 'g8f6', 'c7c5'], 'g1f3': ['d7d5', 'g8f6'],
  'e2e4 e7e5': ['g1f3', 'f1c4'], 'e2e4 c7c5': ['g1f3', 'b1c3'], 'e2e4 e7e6': ['d2d4'], 'e2e4 c7c6': ['d2d4'],
  'd2d4 d7d5': ['c2c4', 'g1f3'], 'd2d4 g8f6': ['c2c4', 'g1f3'], 'c2c4 e7e5': ['b1c3'], 'c2c4 g8f6': ['b1c3', 'g1f3'], 'g1f3 d7d5': ['d2d4', 'g2g3'], 'g1f3 g8f6': ['c2c4', 'd2d4'],
  'e2e4 e7e5 g1f3': ['b8c6'], 'e2e4 e7e5 f1c4': ['g8f6', 'b8c6'], 'e2e4 c7c5 g1f3': ['d7d6', 'b8c6', 'e7e6'], 'e2e4 e7e6 d2d4': ['d7d5'], 'e2e4 c7c6 d2d4': ['d7d5'],
  'd2d4 d7d5 c2c4': ['e7e6', 'c7c6'], 'd2d4 g8f6 c2c4': ['e7e6', 'g7g6'],
  'e2e4 e7e5 g1f3 b8c6': ['f1b5', 'f1c4', 'd2d4']
};
export function buchZug(s, verlauf, zufall = Math.random) {
  const liste = BUCH[verlauf]; if (!liste) return null;
  const m = zugAus(s, liste[Math.floor(zufall() * liste.length)]);
  return m;
}

export function kiZug(stellung, stufe = 'meister', opts = {}) {
  const st = typeof stufe === 'string' ? STUFEN[stufe] : stufe;
  const zufall = opts.zufall || Math.random;
  const s = kopie(stellung);
  const alle = zuege(s);
  if (!alle.length) return null;
  if (alle.length === 1) return alle[0];
  if (st.fehler && zufall() < st.fehler) return alle[Math.floor(zufall() * alle.length)];
  if (opts.verlauf != null) { const b = buchZug(s, opts.verlauf, zufall); if (b !== null) return b; }
  const gesehen = opts.gesehen || new Map();
  const zeit = opts.zeit != null ? opts.zeit : st.zeit;
  const ende = zeit ? Date.now() + zeit : Infinity;
  const maxTiefe = opts.tiefe || st.tiefe;
  const tt = new Map(), pfad = [], killer = [], hist = new Int32Array(64 * 64);
  let knoten = 0;

  const ordnungsWert = (m, ttZug, ply) => {
    if (m === ttZug) return 1e7;
    const opfer = Math.abs(s.b[nach(m)]) || (art(m) & 1 ? 1 : 0);
    if (opfer || umw(m)) return 1e6 + opfer * 10 * 100 + (umw(m) === DAME ? 5000 : 0) - Math.abs(s.b[von(m)]);
    if (killer[ply] && (killer[ply][0] === m || killer[ply][1] === m)) return 9e5;
    return hist[von(m) * 64 + nach(m)];
  };
  const ordne = (liste, ttZug, ply) => { const w = liste.map((m) => ordnungsWert(m, ttZug, ply)); const idx = liste.map((_, k) => k).sort((a, b) => w[b] - w[a]); return idx.map((k) => liste[k]); };

  function ruhe(alpha, beta, ply) {
    if ((++knoten & 2047) === 0 && Date.now() > ende) throw new Abbruch();
    const steht = bewerte(s);
    if (steht >= beta) return steht;
    if (steht > alpha) alpha = steht;
    if (ply > 40) return steht;
    const liste = ordne(pseudo(s, true), 0, ply);
    const p = s.am;
    for (const m of liste) {
      const u = mache(s, m);
      if (angegriffen(s, s.k[p], 3 - p)) { nimmZurueck(s, u); continue; }
      const w = -ruhe(-beta, -alpha, ply + 1);
      nimmZurueck(s, u);
      if (w >= beta) return w;
      if (w > alpha) alpha = w;
    }
    return alpha;
  }
  function suche(tiefe, alpha, beta, ply, nullErlaubt) {
    if ((++knoten & 2047) === 0 && Date.now() > ende) throw new Abbruch();
    const k = schluessel(s);
    if (ply > 0 && (s.halb >= 100 || pfad.includes(k) || (gesehen.get(k) || 0) >= 2)) return 0;
    const p = s.am, schach = angegriffen(s, s.k[p], 3 - p);
    if (schach) tiefe++;                                  // Schach verlängert die Suche
    if (tiefe <= 0) return ruhe(alpha, beta, ply);
    const e = tt.get(s.h1);
    let ttZug = 0;
    if (e && e.h2 === s.h2) {
      ttZug = e.zug;
      if (e.tiefe >= tiefe && ply > 0) {
        if (e.typ === 0) return e.wert;
        if (e.typ === 1 && e.wert >= beta) return e.wert;
        if (e.typ === 2 && e.wert <= alpha) return e.wert;
      }
    }
    // Nullzug: wenn selbst ein ausgelassener Zug noch über beta liegt, lohnt die Suche nicht
    if (nullErlaubt && !schach && tiefe >= 3 && ply > 0 && hatFiguren(s, p) && bewerte(s) >= beta) {
      const ep = s.ep; s.am = 3 - p; s.h1 ^= ZAM[0]; s.h2 ^= ZAM[1]; if (ep >= 0) { s.h1 ^= ZE[0][ep & 7]; s.h2 ^= ZE[1][ep & 7]; } s.ep = -1; s.h1 >>>= 0; s.h2 >>>= 0;
      let w;
      try { w = -suche(tiefe - 3, -beta, -beta + 1, ply + 1, false); }
      finally { s.am = p; s.ep = ep; s.h1 ^= ZAM[0]; s.h2 ^= ZAM[1]; if (ep >= 0) { s.h1 ^= ZE[0][ep & 7]; s.h2 ^= ZE[1][ep & 7]; } s.h1 >>>= 0; s.h2 >>>= 0; }
      if (w >= beta) return beta;
    }
    const liste = ordne(pseudo(s), ttZug, ply);
    const a0 = alpha;
    let bester = -Infinity, besterZug = 0, legal = 0;
    pfad.push(k);
    try {
      for (const m of liste) {
        const u = mache(s, m);
        if (angegriffen(s, s.k[p], 3 - p)) { nimmZurueck(s, u); continue; }
        legal++;
        let w;
        try { w = -suche(tiefe - 1, -beta, -alpha, ply + 1, true); } finally { nimmZurueck(s, u); }
        if (w > bester) { bester = w; besterZug = m; }
        if (w > alpha) alpha = w;
        if (alpha >= beta) {
          if (!s.b[nach(m)] && !umw(m)) { const kl = killer[ply] || (killer[ply] = [0, 0]); if (kl[0] !== m) { kl[1] = kl[0]; kl[0] = m; } hist[von(m) * 64 + nach(m)] += tiefe * tiefe; }
          break;
        }
      }
    } finally { pfad.pop(); }
    if (!legal) return schach ? -(MATT - ply) : 0;
    tt.set(s.h1, { h2: s.h2, tiefe, wert: bester, typ: bester <= a0 ? 2 : bester >= beta ? 1 : 0, zug: besterZug });
    return bester;
  }

  const wurzel = alle.map((m) => ({ m, w: 0, r: zufall() }));
  let ergebnis = null;
  pfad.push(schluessel(s));
  for (let tiefe = 1; tiefe <= maxTiefe; tiefe++) {
    try {
      let alpha = -Infinity, bester = null;
      const tol = st.toleranz || 0;
      for (const x of wurzel) {
        const u = mache(s, x.m);
        try { x.w = -suche(tiefe - 1, -Infinity, tol ? Infinity : -alpha, 1, true); } finally { nimmZurueck(s, u); }
        if (x.w > alpha) { alpha = x.w; bester = x; }
      }
      // Ohne Toleranz sind die Werte der schlechteren Züge nur Obergrenzen: nur der echte Beste zählt
      wurzel.sort((a, b) => (b === bester) - (a === bester) || b.w - a.w || a.r - b.r);
      const top = bester.w;
      ergebnis = tol ? wurzel.filter((x) => x.w >= top - tol) : [bester];
      if (opts.info) { opts.info.tiefe = tiefe; opts.info.wert = top; opts.info.knoten = knoten; }
      if (Math.abs(top) > MATT - 100) break;
      for (const x of wurzel) x.r = zufall();
    } catch (err) {
      if (!(err instanceof Abbruch)) throw err;
      break;
    }
  }
  if (!ergebnis) return alle[Math.floor(zufall() * alle.length)];
  return ergebnis[Math.floor(zufall() * ergebnis.length)].m;
}
function hatFiguren(s, p) {
  const g = vz(p);
  for (let i = 0; i < 64; i++) { const t = s.b[i] * g; if (t > BAUER && t < KOENIG) return true; }
  return false;
}
