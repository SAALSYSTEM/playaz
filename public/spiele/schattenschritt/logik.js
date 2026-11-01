// Schattenschritt – Regeln ohne Darstellung (Browser und Tests).
// Rundenbasiertes Schleich-Rätsel auf einem Raster: Der Schurke zieht ein Feld (oder wartet), danach handeln alle Wächter.
// Koordinaten: x nach rechts, y nach unten (Reihe 0 = hinten im Raum). Richtungen: 0 = N (oben), 1 = O, 2 = S, 3 = W, 4 = warten.
import { LEVEL } from './level.js?v=1';
export { LEVEL };

export const SCHLUESSEL = 'schattenschritt.v1';
export const DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0];
const RICHTUNG = { N: 0, O: 1, S: 2, W: 3 };

// Wächter-Arten: Sichtweite (Felder), Rundumblick (alle 4 Richtungen), ausschaltbar (von hinten/der Seite)
export const ARTEN = {
  diener: { sicht: 3, rund: false, aus: true, name: 'Skelett-Wache' },
  spaeher: { sicht: 5, rund: false, aus: true, name: 'Skelett-Späher' },
  krieger: { sicht: 2, rund: false, aus: false, name: 'Skelett-Krieger' },
  magier: { sicht: 2, rund: true, aus: false, name: 'Skelett-Magier' },
};
const KURZ = { d: 'diener', s: 'spaeher', k: 'krieger', m: 'magier' };

// Karte: # Mauer, x Kisten (wie Mauer), . Boden, , Schatten, S Start, Z Treppe (Ziel), o Münze, q Münze im Schatten, k Schlüssel, T Gittertor
export function baue(def) {
  const h = def.karte.length, w = def.karte[0].length;
  const feld = [], muenzen = [];
  let start = null, ziel = null, schluessel = null;
  for (let y = 0; y < h; y++) {
    if (def.karte[y].length !== w) throw new Error(`${def.name}: Reihe ${y} hat falsche Länge`);
    for (let x = 0; x < w; x++) {
      const c = def.karte[y][x];
      if (!'#x.,SZoqkT'.includes(c)) throw new Error(`${def.name}: unbekanntes Zeichen ${c}`);
      feld.push(c === '#' || c === 'x' ? c : c === 'T' ? 'T' : c === ',' || c === 'q' ? ',' : '.');
      if (c === 'S') start = [x, y];
      if (c === 'Z') ziel = [x, y];
      if (c === 'o' || c === 'q') muenzen.push([x, y]);
      if (c === 'k') schluessel = [x, y];
    }
  }
  if (!start || !ziel) throw new Error(`${def.name}: Start oder Ziel fehlt`);
  const waechter = (def.w || []).map((g, i) => {
    const art = KURZ[g.a] || g.a;
    if (!ARTEN[art]) throw new Error(`${def.name}: Wächter ${i} unbekannte Art`);
    let weg = [g.p.slice()], blicke = null, kreis = false;
    if (g.r) {
      for (const c of g.r) { const d = RICHTUNG[c], l = weg[weg.length - 1]; weg.push([l[0] + DX[d], l[1] + DY[d]]); }
      const a = weg[0], e = weg[weg.length - 1];
      if (weg.length > 2 && a[0] === e[0] && a[1] === e[1]) { kreis = true; weg.pop(); }
      if (!kreis) weg = weg.concat(weg.slice(1, -1).reverse());   // hin und zurück
    } else blicke = [...(g.b || 'S')].map((c) => RICHTUNG[c]);
    for (const [x, y] of weg) if (x < 0 || y < 0 || x >= w || y >= h || feld[y * w + x] === '#' || feld[y * w + x] === 'x') throw new Error(`${def.name}: Wächter ${i} steht in der Mauer`);
    return { art, weg, blicke, kreis, sicht: g.sicht || ARTEN[art].sicht, laenge: weg.length > 1 ? weg.length : blicke.length };
  });
  return { name: def.name, tipp: def.tipp || '', zuege: def.zuege || 0, w, h, feld, start, ziel, muenzen, schluessel, waechter };
}

// Zustand eines Wächters zum Zeitpunkt t (Wächter hängen nur von t ab, nicht vom Spieler)
export function wache(lv, i, t) {
  const g = lv.waechter[i];
  if (g.weg.length > 1) {
    const n = g.weg.length, a = g.weg[t % n], b = g.weg[(t + 1) % n];
    const dx = b[0] - a[0], dy = b[1] - a[1];
    return { x: a[0], y: a[1], b: dy < 0 ? 0 : dx > 0 ? 1 : dy > 0 ? 2 : 3 };
  }
  return { x: g.weg[0][0], y: g.weg[0][1], b: g.blicke[t % g.blicke.length] };
}

export function neuerLauf(lv) {
  return { lv, x: lv.start[0], y: lv.start[1], blick: 0, t: 0, zuege: 0, ko: lv.waechter.map(() => false), muenzen: lv.muenzen.map(() => false), schluessel: false, status: 'spiel', von: -1 };
}
export function kopie(f) { return { ...f, ko: f.ko.slice(), muenzen: f.muenzen.slice() }; }

const feldVon = (f, x, y) => (x < 0 || y < 0 || x >= f.lv.w || y >= f.lv.h ? '#' : f.lv.feld[y * f.lv.w + x]);
export function frei(f, x, y) { const c = feldVon(f, x, y); return c === '.' || c === ',' || (c === 'T' && f.schluessel); }
function wacheAuf(f, x, y, t) { for (let i = 0; i < f.lv.waechter.length; i++) { if (f.ko[i]) continue; const g = wache(f.lv, i, t); if (g.x === x && g.y === y) return i; } return -1; }

// Felder, die Wächter i zum Zeitpunkt t sieht: [{x, y, d}] (d = Abstand). Mauern, Kisten, geschlossene Tore und andere Wächter verdecken.
export function sichtfeld(f, i, t = f.t) {
  const lv = f.lv, g = wache(lv, i, t), art = ARTEN[lv.waechter[i].art], out = [];
  if (f.ko[i]) return out;
  for (const d of art.rund ? [0, 1, 2, 3] : [g.b]) {
    for (let s = 1; s <= lv.waechter[i].sicht; s++) {
      const x = g.x + DX[d] * s, y = g.y + DY[d] * s;
      if (!frei(f, x, y) || wacheAuf(f, x, y, t) >= 0) break;
      out.push({ x, y, d: s });
    }
  }
  return out;
}
// Sieht irgendein Wächter den Spieler? Im Schatten nur aus nächster Nähe (1 Feld).
export function gesehenVon(f, t = f.t) {
  const schatten = feldVon(f, f.x, f.y) === ',';
  for (let i = 0; i < f.lv.waechter.length; i++) for (const s of sichtfeld(f, i, t)) if (s.x === f.x && s.y === f.y && (!schatten || s.d === 1)) return i;
  return -1;
}

// Ein Zug. r: 0–3 Richtung, 4 = warten. Gibt Ereignisse zurück; ungültige Züge ändern nichts ([{typ:'blockiert'}]).
export function zug(f, r) {
  if (f.status !== 'spiel') return [];
  const ev = [];
  if (r !== 4) {
    const nx = f.x + DX[r], ny = f.y + DY[r];
    f.blick = r;
    if (!frei(f, nx, ny)) return [{ typ: 'blockiert', r }];
    const g = wacheAuf(f, nx, ny, f.t);
    if (g >= 0) {
      if (!ARTEN[f.lv.waechter[g].art].aus) return [{ typ: 'blockiert', r, wache: g }];
      f.ko[g] = true; ev.push({ typ: 'ko', i: g });
    }
    f.x = nx; f.y = ny; ev.push({ typ: 'schritt', r });
  } else ev.push({ typ: 'warten' });
  f.zuege++;
  f.lv.muenzen.forEach(([x, y], i) => { if (!f.muenzen[i] && x === f.x && y === f.y) { f.muenzen[i] = true; ev.push({ typ: 'muenze', i }); } });
  if (f.lv.schluessel && !f.schluessel && f.lv.schluessel[0] === f.x && f.lv.schluessel[1] === f.y) { f.schluessel = true; ev.push({ typ: 'schluessel' }); }
  if (f.x === f.lv.ziel[0] && f.y === f.lv.ziel[1]) { f.status = 'geschafft'; ev.push({ typ: 'geschafft' }); return ev; }
  let s = gesehenVon(f);
  if (s >= 0) return erwischt(f, s, ev);
  f.t++;
  for (let i = 0; i < f.lv.waechter.length; i++) if (!f.ko[i] && f.lv.waechter[i].laenge > 1) ev.push({ typ: 'wache', i });
  const auf = wacheAuf(f, f.x, f.y, f.t);
  if (auf >= 0) return erwischt(f, auf, ev);
  s = gesehenVon(f);
  if (s >= 0) return erwischt(f, s, ev);
  return ev;
}
function erwischt(f, i, ev) { f.status = 'erwischt'; f.von = i; ev.push({ typ: 'erwischt', i }); return ev; }

export const alleMuenzen = (f) => f.muenzen.every(Boolean);
export function sterne(f) { if (f.status !== 'geschafft') return 0; return 1 + (alleMuenzen(f) ? 1 : 0) + (f.zuege <= f.lv.zuege ? 1 : 0); }

// Löser (Breitensuche): kürzester Weg zum Ziel (egal welche Münzen) und kürzester Weg mit allen Münzen.
// Zustand: Feld, t modulo Periode aller Wächter, ausgeschaltete Wächter, Münzen, Schlüssel.
// opt: { ko: false } ohne Ausschalten, { warten: false } ohne Warten, { schatten: false } Schatten wirkt nicht, { tor: false } Tor bleibt zu
export function loese(lv, grenze = 200, opt = {}) {
  if (opt.schatten === false) lv = { ...lv, feld: lv.feld.map((c) => (c === ',' ? '.' : c)) };
  if (opt.tor === false) lv = { ...lv, schluessel: null };
  const ggt = (a, b) => (b ? ggt(b, a % b) : a);
  const periode = lv.waechter.reduce((p, g) => p / ggt(p, g.laenge) * g.laenge, 1);
  const schl = (f) => [f.x, f.y, f.t % periode, f.ko.map(Number).join(''), f.muenzen.map(Number).join(''), +f.schluessel].join('|');
  const start = neuerLauf(lv), gesehen = new Set([schl(start)]);
  let ebene = [{ f: start, weg: '' }], kurz = null, alle = null;
  for (let n = 1; n <= grenze && ebene.length && !alle; n++) {
    const neu = [];
    // Warten zuerst probieren: bei gleich langen Wegen bevorzugt der Löser Warten statt Hin-und-her-Laufen
    for (const { f, weg } of ebene) for (const r of opt.warten === false ? [0, 1, 2, 3] : [4, 0, 1, 2, 3]) {
      const g = kopie(f), ev = zug(g, r);
      if (ev[0] && ev[0].typ === 'blockiert') continue;
      if (opt.ko === false && ev.some((e) => e.typ === 'ko')) continue;
      if (g.status === 'erwischt') continue;
      const w = weg + 'NOSWw'[r];
      if (g.status === 'geschafft') { if (!kurz) kurz = w; if (!alle && alleMuenzen(g)) alle = w; continue; }
      const k = schl(g); if (gesehen.has(k)) continue;
      gesehen.add(k); neu.push({ f: g, weg: w });
    }
    ebene = neu;
  }
  return { kurz, alle, periode, zustaende: gesehen.size };
}
// Weg (Zeichenkette aus N/O/S/W/w) nachspielen
export function spiele(lv, weg) { const f = neuerLauf(lv); for (const c of weg) { zug(f, 'NOSWw'.indexOf(c)); if (f.status !== 'spiel') break; } return f; }

// ---------- Spielstand ----------
export function leerStand() { return { v: 1, sterne: [], ton: true }; }
export function pruefeStand(s) {
  const st = leerStand();
  if (!s || typeof s !== 'object') return st;
  if (Array.isArray(s.sterne)) st.sterne = s.sterne.slice(0, LEVEL.length).map((n) => Math.max(0, Math.min(3, Math.floor(Number(n) || 0))));
  if (typeof s.ton === 'boolean') st.ton = s.ton;
  return st;
}
// Level n ist offen, wenn das vorige geschafft ist
export const offen = (st, n) => n === 0 || (st.sterne[n - 1] || 0) > 0;
export const sterneGesamt = (st) => st.sterne.reduce((a, b) => a + (b || 0), 0);
export function verbuche(st, n, s) { const alt = st.sterne[n] || 0; while (st.sterne.length <= n) st.sterne.push(0); st.sterne[n] = Math.max(alt, s); return s > alt; }
