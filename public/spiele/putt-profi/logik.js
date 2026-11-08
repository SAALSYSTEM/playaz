// PUTT-PROFI – Regeln und Physik ohne Darstellung (läuft im Browser und in der Edge Function).
// Bahn aus Kenney-Kacheln (teile.js), Kugel in festen Takten von 1/240 s. Nur + − × ÷ und Wurzel,
// keine Winkelfunktionen: so rechnen alle Browser und der Server Bit für Bit gleich.
import { TEILE } from './teile.js';
import { BAHNEN, WELTEN, PLAETZE } from './bahnen.js';
export { BAHNEN, WELTEN, PLAETZE };

export const SCHLUESSEL = 'puttprofi.v1';
export const SIM_VERSION = 5;          // erhöhen, sobald sich Regeln oder Bahnen ändern (alte Runden zählen dann nicht mehr)
export const HZ = 240, DT = 1 / HZ;
export const R = 0.04;                 // Kugelradius (1 = ein Feld)
export const G = 6.5;                  // Schwerkraft (Felder/s²)
export const ROLL = 0.5;               // Rollwiderstand (Felder/s²)
export const LUFT = 0.12;              // zusätzlicher Widerstand je Geschwindigkeit (1/s)
export const VMIN = 0.25, VMAX = 4.8;  // Schlaggeschwindigkeit bei Stärke 1 bzw. 1000
export const LOCH_R = 0.067;           // Lochradius (aus dem Modell)
export const V_LOCH = 1.45;            // schneller rollt die Kugel übers Loch hinweg
export const MAX_SCHLAEGE = 6;         // Bahnengolf-Regel: nach 6 Schlägen ohne Treffer zählt die Bahn 7
export const MAX_TAKTE = 14 * HZ;      // ein Schlag rollt höchstens 14 s
export const AUFLOESUNG = 40;          // Höhenraster: Punkte je Feld und Richtung
export const RUNDE = 5;                // Bahnen in der Tagesrunde
export const MUEHLE = { periode: 300, hebel: 0.854, breite: 0.06, frei: 0.27, z0: -0.492, z1: -0.405, hoehe: 0.45 };
export const BAELLE = [
  { id: 'rot', name: 'Rot', sterne: 0 }, { id: 'blau', name: 'Blau', sterne: 10 },
  { id: 'gruen', name: 'Grün', sterne: 22 }, { id: 'gold', name: 'Gold', sterne: 40 },
];
const E_WAND = 0.68, REIB_WAND = 0.94, VIERTEL = 1.5707963267948966;

export function zufall(seed) {
  let a = seed >>> 0 || 1;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export function berlinTag(jetzt = new Date(), tage = 0) {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(jetzt.getTime() + tage * 86400000));
  return Number(p.replace(/-/g, ''));
}

// ---------- Bahn bauen ----------
// Richtungen: 0 = Norden (−z), 1 = Osten (+x), 2 = Süden (+z), 3 = Westen (−x). Maske: Bit d = Nachbar in Richtung d.
export const DX = [0, 1, 0, -1], DZ = [-1, 0, 1, 0];
const GRUND = { straight: 5, end: 1, corner: 9, 'round-corner-c': 9, 'skew-corner': 9, side: 13, open: 15, 'hole-round': 1, 'hole-open': 15 };
const GERADE = { k: 'obstacle-block', n: 'narrow-block', m: 'narrow-round', v: 'narrow-square', C: 'castle', W: 'windmill', U: 'tunnel-narrow', V: 'tunnel-wide', D: 'tunnel-double', g: 'gap', s: 'split', b: 'bump-walls', h: 'hill-round', q: 'hill-square', z: 'bump-down-walls', j: 'crest' };
const FREI = { x: 'obstacle-diamond', y: 'obstacle-triangle', o: 'bump', u: 'bump-down' };
function dreheMaske(m, r) { let o = 0; for (let d = 0; d < 4; d++) if (m & (1 << d)) o |= 1 << ((d - r + 4) % 4); return o; }
// Kachel um r × 90° drehen (wie three.js rotation.y = r·π/2): (x, z) → (z, −x) je Schritt
function dreheXZ(x, z, r) { return r === 0 ? [x, z] : r === 1 ? [z, -x] : r === 2 ? [-x, -z] : [-z, x]; }
const bits = (m) => (m & 1) + ((m >> 1) & 1) + ((m >> 2) & 1) + ((m >> 3) & 1);

export function baueBahn(nr, spiegel = false) {
  const def = BAHNEN[nr];
  if (!def) throw new Error('Bahn unbekannt: ' + nr);
  const karte = spiegel ? def.karte.map((z) => [...z].reverse().join('')) : def.karte;
  const h = karte.length, w = Math.max(...karte.map((z) => z.length));
  const zeichen = (x, z) => (z >= 0 && z < h && x >= 0 && x < w ? karte[z][x] || '.' : '.');
  const belegt = (x, z) => zeichen(x, z) !== '.' && zeichen(x, z) !== ' ';
  let tee = null, loch = null;
  for (let z = 0; z < h; z++) for (let x = 0; x < w; x++) { if (zeichen(x, z) === 'T') tee = { x, z }; if (zeichen(x, z) === 'H') loch = { x, z }; }
  if (!tee || !loch) throw new Error(def.name + ': Abschlag oder Loch fehlt');
  // Wegstrecke vom Abschlag (Felder) – für die Mühle (Flügel zum Abschlag hin) und für den Prüf-Bot
  const vomTee = new Map([[tee.x + ',' + tee.z, 0]]), q = [tee];
  while (q.length) { const c = q.shift(), d0 = vomTee.get(c.x + ',' + c.z); for (let d = 0; d < 4; d++) { const nx = c.x + DX[d], nz = c.z + DZ[d], k = nx + ',' + nz; if (belegt(nx, nz) && !vomTee.has(k)) { vomTee.set(k, d0 + 1); q.push({ x: nx, z: nz }); } } }
  const felder = [];
  for (let z = 0; z < h; z++) for (let x = 0; x < w; x++) {
    if (!belegt(x, z)) continue;
    let maske = 0;
    for (let d = 0; d < 4; d++) if (belegt(x + DX[d], z + DZ[d])) maske |= 1 << d;
    const c = zeichen(x, z), n = bits(maske);
    let teil, grund;
    if (c === 'H') { teil = maske === 15 ? 'hole-open' : 'hole-round'; if (n !== 1 && n !== 4) throw new Error(`${def.name}: Loch braucht Sackgasse oder freie Fläche`); }
    else if (GERADE[c]) { teil = GERADE[c]; grund = 5; }
    else if (FREI[c]) { teil = FREI[c]; grund = 15; }
    else if (c === 'r') teil = 'round-corner-c';
    else if (c === 'e') teil = 'skew-corner';
    else teil = n === 1 ? 'end' : n === 2 ? ((maske === 5 || maske === 10) ? 'straight' : 'corner') : n === 3 ? 'side' : 'open';
    if (!n) throw new Error(`${def.name}: Feld ${x},${z} ohne Nachbarn`);
    grund = grund ?? GRUND[teil];
    const rs = [0, 1, 2, 3].filter((r) => dreheMaske(grund, r) === maske);
    if (!rs.length) throw new Error(`${def.name}: „${c}“ passt nicht an Feld ${x},${z}`);
    let r = rs[0];
    if (teil === 'windmill') {           // Flügel (Kachel-Norden) zeigen zur Seite, von der die Kugel kommt
      const ab = (rr) => { const d = (4 - rr) % 4; return vomTee.get((x + DX[d]) + ',' + (z + DZ[d])) ?? 1e9; };
      r = rs.reduce((a, b) => (ab(b) < ab(a) ? b : a));
    }
    felder.push({ x, z, teil, r, weg: vomTee.get(x + ',' + z) ?? -1 });
  }
  // Höhenraster aus den Boden-Dreiecken (höchster Boden je Punkt, NaN = kein Boden)
  const N = AUFLOESUNG, hw = w * N, hh = h * N;
  const hoehe = new Float64Array(hw * hh).fill(NaN);
  const wand = [];
  for (const f of felder) {
    const T = TEILE[f.teil];
    const welt = (src) => { const o = []; for (let i = 0; i < src.length; i += 3) { const [lx, lz] = dreheXZ(src[i], src[i + 2], f.r); o.push((lx + f.x * 10000) / 10000, src[i + 1] / 10000, (lz + f.z * 10000) / 10000); } return o; };
    const b = welt(T.b);
    for (let t = 0; t < b.length; t += 9) {
      const ax = b[t], ay = b[t + 1], az = b[t + 2], bx = b[t + 3], by = b[t + 4], bz = b[t + 5], cx = b[t + 6], cy = b[t + 7], cz = b[t + 8];
      const det = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
      if (det > -1e-12 && det < 1e-12) continue;
      const i0 = Math.max(f.x * N, Math.floor((Math.min(ax, bx, cx) + 0.5) * N - 0.5)), i1 = Math.min(f.x * N + N - 1, Math.ceil((Math.max(ax, bx, cx) + 0.5) * N - 0.5));
      const j0 = Math.max(f.z * N, Math.floor((Math.min(az, bz, cz) + 0.5) * N - 0.5)), j1 = Math.min(f.z * N + N - 1, Math.ceil((Math.max(az, bz, cz) + 0.5) * N - 0.5));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const px = -0.5 + (i + 0.5) / N, pz = -0.5 + (j + 0.5) / N;
        const l1 = ((bz - cz) * (px - cx) + (cx - bx) * (pz - cz)) / det, l2 = ((cz - az) * (px - cx) + (ax - cx) * (pz - cz)) / det, l3 = 1 - l1 - l2;
        if (l1 < -1e-9 || l2 < -1e-9 || l3 < -1e-9) continue;
        const y = l1 * ay + l2 * by + l3 * cy, k = j * hw + i;
        if (!(hoehe[k] >= y)) hoehe[k] = y;
      }
    }
    for (const v of welt(T.w)) wand.push(v);
  }
  // Wände in ein Raster aus Viertel-Feldern einsortieren (nur Dreiecke in der Nähe prüfen)
  const gw = w * 4, gh = h * 4, zellen = Array.from({ length: gw * gh }, () => []);
  const W = new Float64Array(wand);
  for (let t = 0; t < W.length; t += 9) {
    const x0 = Math.min(W[t], W[t + 3], W[t + 6]) - R - 0.01, x1 = Math.max(W[t], W[t + 3], W[t + 6]) + R + 0.01;
    const z0 = Math.min(W[t + 2], W[t + 5], W[t + 8]) - R - 0.01, z1 = Math.max(W[t + 2], W[t + 5], W[t + 8]) + R + 0.01;
    for (let j = Math.max(0, Math.floor((z0 + 0.5) * 4)); j <= Math.min(gh - 1, Math.floor((z1 + 0.5) * 4)); j++)
      for (let i = Math.max(0, Math.floor((x0 + 0.5) * 4)); i <= Math.min(gw - 1, Math.floor((x1 + 0.5) * 4)); i++) zellen[j * gw + i].push(t);
  }
  const bahn = { nr, spiegel, name: def.name, par: def.par, welt: def.welt, w, h, felder, hoehe, hw, hh, W, zellen, gw, gh, muehlen: felder.filter((f) => f.teil === 'windmill').map((f) => ({ x: f.x, z: f.z, r: f.r })) };
  bahn.tee = { x: tee.x, z: tee.z, y: boden(bahn, tee.x, tee.z) + R };
  bahn.loch = { x: loch.x, z: loch.z, y: boden(bahn, loch.x, loch.z) };
  return bahn;
}

// Bodenhöhe (bilinear) und Gefälle an (x, z); NaN = kein Boden
let GX = 0, GZ = 0;
function punkt(b, i, j) { return i < 0 || j < 0 || i >= b.hw || j >= b.hh ? NaN : b.hoehe[j * b.hw + i]; }
export function boden(b, x, z) {
  const N = AUFLOESUNG, fx = (x + 0.5) * N - 0.5, fz = (z + 0.5) * N - 0.5;
  const i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j;
  const a = punkt(b, i, j), c = punkt(b, i + 1, j), d = punkt(b, i, j + 1), e = punkt(b, i + 1, j + 1);
  if (a === a && c === c && d === d && e === e) {
    GX = ((c - a) * (1 - tz) + (e - d) * tz) * N; GZ = ((d - a) * (1 - tx) + (e - c) * tx) * N;
    return a * (1 - tx) * (1 - tz) + c * tx * (1 - tz) + d * (1 - tx) * tz + e * tx * tz;
  }
  GX = 0; GZ = 0;
  return punkt(b, tx < 0.5 ? i : i + 1, tz < 0.5 ? j : j + 1);
}

// Nächster Punkt eines Dreiecks zu p (Ericson, „Real-Time Collision Detection“ 5.1.5)
let QX = 0, QY = 0, QZ = 0;
function naechster(W, o, px, py, pz) {
  const ax = W[o], ay = W[o + 1], az = W[o + 2], bx = W[o + 3], by = W[o + 4], bz = W[o + 5], cx = W[o + 6], cy = W[o + 7], cz = W[o + 8];
  const abx = bx - ax, aby = by - ay, abz = bz - az, acx = cx - ax, acy = cy - ay, acz = cz - az;
  const apx = px - ax, apy = py - ay, apz = pz - az;
  const d1 = abx * apx + aby * apy + abz * apz, d2 = acx * apx + acy * apy + acz * apz;
  if (d1 <= 0 && d2 <= 0) { QX = ax; QY = ay; QZ = az; return; }
  const bpx = px - bx, bpy = py - by, bpz = pz - bz;
  const d3 = abx * bpx + aby * bpy + abz * bpz, d4 = acx * bpx + acy * bpy + acz * bpz;
  if (d3 >= 0 && d4 <= d3) { QX = bx; QY = by; QZ = bz; return; }
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3); QX = ax + v * abx; QY = ay + v * aby; QZ = az + v * abz; return; }
  const cpx = px - cx, cpy = py - cy, cpz = pz - cz;
  const d5 = abx * cpx + aby * cpy + abz * cpz, d6 = acx * cpx + acy * cpy + acz * cpz;
  if (d6 >= 0 && d5 <= d6) { QX = cx; QY = cy; QZ = cz; return; }
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) { const v = d2 / (d2 - d6); QX = ax + v * acx; QY = ay + v * acy; QZ = az + v * acz; return; }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) { const v = (d4 - d3) / ((d4 - d3) + (d5 - d6)); QX = bx + v * (cx - bx); QY = by + v * (cy - by); QZ = bz + v * (cz - bz); return; }
  const k = 1 / (va + vb + vc), v = vb * k, u = vc * k;
  QX = ax + abx * v + acx * u; QY = ay + aby * v + acy * u; QZ = az + abz * v + acz * u;
}

// Kleinster Abstand² von p zu einer Wand in der Nähe (für den Prüf-Bot und die Zielhilfe)
export function wandAbstand2(b, x, y, z) {
  const gi = Math.floor((x + 0.5) * 4), gj = Math.floor((z + 0.5) * 4);
  if (gi < 0 || gj < 0 || gi >= b.gw || gj >= b.gh) return 0;
  let m = 1;
  for (const o of b.zellen[gj * b.gw + gi]) { naechster(b.W, o, x, y, z); const d = (x - QX) ** 2 + (y - QY) ** 2 + (z - QZ) ** 2; if (d < m) m = d; }
  return m;
}

// ---------- Schlag ----------
// Eingabe je Schlag: dx, dz (Richtung, ganze Zahlen bis ±10000), p (Stärke 1…1000), ph (Takt der Mühle beim Schlag, 0…periode−1)
export function gueltig(s) {
  return s && [s.dx, s.dz, s.p, s.ph].every(Number.isInteger) && Math.abs(s.dx) <= 10000 && Math.abs(s.dz) <= 10000
    && (s.dx !== 0 || s.dz !== 0) && s.p >= 1 && s.p <= 1000 && s.ph >= 0 && s.ph < MUEHLE.periode;
}
export function neuerBall(b) { return { x: b.tee.x, y: b.tee.y, z: b.tee.z, schlaege: 0, aus: 0, eingelocht: false, fertig: false }; }
export function ergebnis(ball) { return ball.eingelocht ? ball.schlaege : MAX_SCHLAEGE + 1; }

export function starteSchlag(b, ball, s) {
  const l = Math.sqrt(s.dx * s.dx + s.dz * s.dz), v = VMIN + (VMAX - VMIN) * s.p / 1000;
  return { x: ball.x, y: ball.y, z: ball.z, vx: s.dx / l * v, vy: 0, vz: s.dz / l * v, k: 0, ph: s.ph, ruhe: 0, ende: null, amBoden: true };
}

// Ein Takt. ev (optional): Ereignisse für Ton und Effekte
export function takt(b, s, ev) {
  if (s.ende) return;
  s.k++;
  s.vy -= G * DT;
  s.x += s.vx * DT; s.y += s.vy * DT; s.z += s.vz * DT;
  // Boden
  const h = boden(b, s.x, s.z);
  const warAmBoden = s.amBoden;
  s.amBoden = false;
  if (h === h && s.y - R <= h + 0.003 && s.y - R >= h - 0.025) {   // tiefer drin = in einen Graben gefallen
    let nx = -GX, ny = 1, nz = -GZ; const l = Math.sqrt(nx * nx + 1 + nz * nz); nx /= l; ny /= l; nz /= l;
    if (s.y - R < h) s.y = h + R;
    const vn = s.vx * nx + s.vy * ny + s.vz * nz;
    if (vn < 0) {
      const e = vn < -0.9 ? 0.3 : 0;
      if (ev && !warAmBoden && vn < -0.5) ev.push({ typ: 'aufprall', st: -vn });
      s.vx -= (1 + e) * vn * nx; s.vy -= (1 + e) * vn * ny; s.vz -= (1 + e) * vn * nz;
    }
    s.amBoden = true;
    const sp = Math.sqrt(s.vx * s.vx + s.vy * s.vy + s.vz * s.vz);
    if (sp > 0) { const f = Math.max(0, sp - (ROLL + LUFT * sp) * DT) / sp; s.vx *= f; s.vy *= f; s.vz *= f; }
  }
  // Banden und Hindernisse
  const gi = Math.floor((s.x + 0.5) * 4), gj = Math.floor((s.z + 0.5) * 4);
  if (gi >= 0 && gj >= 0 && gi < b.gw && gj < b.gh) {
    let knall = 0;
    // Banden reichen gedacht beliebig hoch: Eine Kugel, die über einen Hügel hüpft, prallt trotzdem ab
    // und eine Kugel auf einem Plateau so hoch wie die Bande (hill-square) prallt an deren Oberkante ab.
    const yk = h === h && s.y > h + R ? h + R : s.y;
    for (const o of b.zellen[gj * b.gw + gi]) {
      const top = b.W[o + 1] > b.W[o + 4] ? (b.W[o + 1] > b.W[o + 7] ? b.W[o + 1] : b.W[o + 7]) : (b.W[o + 4] > b.W[o + 7] ? b.W[o + 4] : b.W[o + 7]);
      const py = yk > top ? top : yk;
      naechster(b.W, o, s.x, py, s.z);
      const dx = s.x - QX, dy = py - QY, dz = s.z - QZ, d2 = dx * dx + dy * dy + dz * dz;
      if (d2 >= R * R || d2 < 1e-14) continue;
      // Wände sind senkrecht: nur waagerecht abstoßen. Sonst würde die Kante zwischen zwei Dreiecken
      // derselben Wandfläche die Kugel schräg nach oben werfen.
      const h = Math.sqrt(dx * dx + dz * dz);
      if (h < 1e-9) continue;
      const nx = dx / h, nz = dz / h, t = R - Math.sqrt(d2);
      s.x += nx * t; s.z += nz * t;
      const vn = s.vx * nx + s.vz * nz;
      if (vn >= 0) continue;
      if (-vn > knall) knall = -vn;
      s.vx -= (1 + E_WAND) * vn * nx; s.vz -= (1 + E_WAND) * vn * nz;
      const vn2 = s.vx * nx + s.vz * nz;
      s.vx = (s.vx - vn2 * nx) * REIB_WAND + vn2 * nx; s.vz = (s.vz - vn2 * nz) * REIB_WAND + vn2 * nz; s.vy *= REIB_WAND;
    }
    if (ev && knall > 0.2) ev.push({ typ: 'bande', st: knall });
  }
  // Windmühlen: ein Flügel sperrt die Tür, solange er unten steht
  for (const m of b.muehlen) muehle(b, s, m, ev);
  // Aus, Loch, Ruhe
  if (s.y < -0.25) { s.ende = 'aus'; return; }
  const sp2 = s.vx * s.vx + s.vy * s.vy + s.vz * s.vz;
  const lx = s.x - b.loch.x, lz = s.z - b.loch.z;
  if (lx * lx + lz * lz < LOCH_R * LOCH_R && sp2 < V_LOCH * V_LOCH && s.y < b.loch.y + R + 0.03) { s.ende = 'loch'; return; }
  if (s.amBoden && sp2 < 0.0016) s.ruhe++; else s.ruhe = 0;
  if (s.ruhe >= 30) { s.vx = s.vy = s.vz = 0; s.ende = 'ruhe'; return; }
  if (s.k >= MAX_TAKTE) { s.vx = s.vy = s.vz = 0; s.ende = 'ruhe'; }
}

// Stellung des Mühlenflügels: x-Mitte des unteren Flügels (Kachel-Koordinaten) oder null, wenn kein Flügel unten ist
export function muehlenFluegel(ph) {
  const xc = MUEHLE.hebel * (ph - MUEHLE.periode / 2) * (VIERTEL / MUEHLE.periode);
  return xc > MUEHLE.frei || xc < -MUEHLE.frei ? null : xc;
}
function muehle(b, s, m, ev) {
  const xc = muehlenFluegel((s.ph + s.k) % MUEHLE.periode);
  if (xc === null) return;
  const inv = (4 - m.r) % 4;
  let [lx, lz] = dreheXZ(s.x - m.x, s.z - m.z, inv), [vx, vz] = dreheXZ(s.vx, s.vz, inv);
  const x0 = xc - MUEHLE.breite, x1 = xc + MUEHLE.breite;
  const qx = lx < x0 ? x0 : lx > x1 ? x1 : lx, qz = lz < MUEHLE.z0 ? MUEHLE.z0 : lz > MUEHLE.z1 ? MUEHLE.z1 : lz;
  const qy = s.y > MUEHLE.hoehe ? MUEHLE.hoehe : s.y;
  const dx = lx - qx, dy = s.y - qy, dz = lz - qz, d2 = dx * dx + dy * dy + dz * dz;
  if (d2 >= R * R) return;
  let nx, ny, nz, t;
  if (d2 < 1e-14) { nx = 0; ny = 0; nz = lz < (MUEHLE.z0 + MUEHLE.z1) / 2 ? -1 : 1; t = nz < 0 ? lz - MUEHLE.z0 + R : MUEHLE.z1 - lz + R; }
  else { const d = Math.sqrt(d2); nx = dx / d; ny = dy / d; nz = dz / d; t = R - d; }
  lx += nx * t; s.y += ny * t; lz += nz * t;
  const vb = MUEHLE.hebel * VIERTEL / MUEHLE.periode * HZ;       // Flügel bewegt sich in +x
  const rx = vx - vb, rn = rx * nx + s.vy * ny + vz * nz;
  if (rn < 0) {
    vx = rx - 1.5 * rn * nx + vb; s.vy -= 1.5 * rn * ny; vz -= 1.5 * rn * nz;
    if (ev) ev.push({ typ: 'muehle', st: -rn });
  }
  [lx, lz] = dreheXZ(lx, lz, m.r); [vx, vz] = dreheXZ(vx, vz, m.r);
  s.x = lx + m.x; s.z = lz + m.z; s.vx = vx; s.vz = vz;
}

// Schlag auswerten: Kugel bleibt liegen, ist im Loch oder war im Aus (zurück an den Abschlagpunkt, +1 Strafschlag)
export function beende(b, ball, s) {
  ball.schlaege++;
  if (s.ende === 'loch') { ball.eingelocht = true; ball.fertig = true; ball.x = b.loch.x; ball.z = b.loch.z; ball.y = b.loch.y + R; return; }
  if (s.ende === 'aus') { ball.schlaege++; ball.aus++; }
  else { ball.x = s.x; ball.y = s.y; ball.z = s.z; }
  if (ball.schlaege >= MAX_SCHLAEGE) ball.fertig = true;
}
// Ganzer Schlag am Stück (Server, Tests, Bot)
export function schlage(b, ball, eingabe, ev) {
  const s = starteSchlag(b, ball, eingabe);
  while (!s.ende) takt(b, s, ev);
  beende(b, ball, s);
  return s;
}

// ---------- Aufzeichnung ----------
export function kodiere(runde) { return runde.map((schlaege) => schlaege.map((s) => `${s.dx},${s.dz},${s.p},${s.ph}`).join(';')).join('|'); }
export function dekodiere(text) {
  if (typeof text !== 'string' || text.length > 4000 || !/^[-0-9,;|]*$/.test(text)) return null;
  const out = [];
  for (const teil of text.split('|')) {
    const liste = [];
    for (const t of teil ? teil.split(';') : []) {
      const z = t.split(',');
      if (z.length !== 4 || z.some((x) => !/^-?\d{1,5}$/.test(x))) return null;
      const s = { dx: Number(z[0]), dz: Number(z[1]), p: Number(z[2]), ph: Number(z[3]) };
      if (!gueltig(s)) return null;
      liste.push(s);
    }
    out.push(liste);
  }
  return out;
}

// ---------- Tagesrunde: 5 Bahnen aus 5 verschiedenen Welten, für alle gleich (Datum in Berlin), manche gespiegelt ----------
export function tagesRunde(seed) {
  const r = zufall(seed * 7 + 3);
  const nimm = (liste) => liste.splice(Math.floor(r() * liste.length), 1)[0];
  const welten = WELTEN.map((_, w) => w);
  const wahl = [];
  while (wahl.length < RUNDE) { const w = nimm(welten); wahl.push(nimm(BAHNEN.map((_, i) => i).filter((i) => BAHNEN[i].welt === w))); }
  return wahl.sort((a, b) => a - b).map((nr) => ({ nr, spiegel: r() < 0.5 }));
}

// Eine gemeldete Tagesrunde nachspielen. Jede Bahn muss fertig sein (eingelocht oder 6 Schläge), danach kein Schlag mehr.
export function pruefeRunde(seed, text) {
  const runde = dekodiere(text);
  if (!runde || runde.length !== RUNDE) return { ok: false, grund: 'format' };
  const plan = tagesRunde(seed);
  let schlaege = 0, par = 0, hio = 0;
  const je = [];
  for (let i = 0; i < RUNDE; i++) {
    const b = baueBahn(plan[i].nr, plan[i].spiegel), ball = neuerBall(b);
    if (!runde[i].length) return { ok: false, grund: 'unvollstaendig' };
    for (const s of runde[i]) { if (ball.fertig) return { ok: false, grund: 'zuviel' }; schlage(b, ball, s); }
    if (!ball.fertig) return { ok: false, grund: 'unvollstaendig' };
    const e = ergebnis(ball);
    schlaege += e; par += b.par; je.push(e); if (ball.eingelocht && ball.schlaege === 1) hio++;
  }
  return { ok: true, schlaege, par, je, hio };
}

// ---------- Sterne und Spielstand ----------
export function sterne(nr, ergebnisSchlaege) {
  const par = BAHNEN[nr].par;
  if (!ergebnisSchlaege || ergebnisSchlaege > MAX_SCHLAEGE) return 0;
  return ergebnisSchlaege < par ? 3 : ergebnisSchlaege <= par ? 2 : 1;
}
export function leerStand() { return { v: 1, ton: true, ball: 'rot', bahnen: {}, hio: 0, tag: 0, tagBest: 0 }; }
export function pruefeStand(s) {
  const l = leerStand();
  if (!s || typeof s !== 'object') return l;
  if (typeof s.ton === 'boolean') l.ton = s.ton;
  if (BAELLE.some((b) => b.id === s.ball)) l.ball = s.ball;
  if (s.bahnen && typeof s.bahnen === 'object') for (const [k, v] of Object.entries(s.bahnen)) { const n = Number(k); if (Number.isInteger(n) && n >= 0 && n < BAHNEN.length && Number.isInteger(v) && v >= 1 && v <= MAX_SCHLAEGE + 1) l.bahnen[n] = v; }
  for (const k of ['hio', 'tag', 'tagBest']) if (Number.isInteger(s[k]) && s[k] >= 0) l[k] = s[k];
  return l;
}
export function gesamtSterne(st) { let n = 0; for (const [k, v] of Object.entries(st.bahnen)) n += sterne(Number(k), v); return n; }
export const platzVon = (nr) => WELTEN[BAHNEN[nr].welt].platz;
export const platzFrei = (st, p) => gesamtSterne(st) >= PLAETZE[p].sterne;
// Innerhalb eines Platzes der Reihe nach; der erste Bahn eines Platzes öffnet sich mit genug Sternen
export function frei(st, nr) {
  const p = platzVon(nr), erste = BAHNEN.findIndex((_, i) => platzVon(i) === p);
  return nr === erste ? platzFrei(st, p) : st.bahnen[nr - 1] !== undefined;
}
export const MAX_STERNE = BAHNEN.length * 3;
export function ballFrei(st, id) { const b = BAELLE.find((x) => x.id === id); return !!b && gesamtSterne(st) >= b.sterne; }
// Bahn fertig gespielt (Übungsmodus): bestes Ergebnis merken. Rückgabe: neue Bestleistung?
export function verbucheBahn(st, nr, ball) {
  const e = ergebnis(ball), alt = st.bahnen[nr];
  if (ball.eingelocht && ball.schlaege === 1) st.hio++;
  if (alt === undefined || e < alt) { st.bahnen[nr] = e; return true; }
  return false;
}
// Tagesrunde fertig: Tagesbestwert (weniger Schläge ist besser). Rückgabe: neuer Tagesbestwert?
export function verbucheRunde(st, tag, schlaege) {
  if (st.tag !== tag) { st.tag = tag; st.tagBest = 0; }
  if (!st.tagBest || schlaege < st.tagBest) { st.tagBest = schlaege; return true; }
  return false;
}
