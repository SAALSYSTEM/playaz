// Neon Coast – Fluchtwagen: Regeln und Fahrphysik (ohne DOM, läuft auch in Node).
// Feste Schritte von 1/60 s. Einheiten: Meter und Sekunden. Winkel a: 0 = Osten, π/2 = Süden (y zeigt nach unten).
// Alle Autos sind Körper mit derselben Fahrphysik; sie unterscheiden sich nur darin, wer lenkt:
// der Spieler, die Polizei (jagt über ein Wegefeld zum Spieler), der Verkehr (folgt den Fahrspuren) oder niemand (geparkt, Wrack).
import { baueWelt, bodenBei, sichtFrei, BODEN, Z, NX, NY, BREITE, HOEHE, rng, KOFFER } from './welt.js';
import { FAHRZEUG, autoVon, aktiveAuftraege } from './daten.js';

export const DT = 1 / 60;
export const NITRO_DAUER = 2.6;
const TAU = Math.PI * 2, INF = 1e9;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const wrap = (a) => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; };

// Polizei je Sternzahl: Anzahl Wagen, Tempo (mindestens v, sonst f × Höchsttempo des Spielerautos), Nachschub-Takt, SUV-Anteil
export const POLIZEI = [
  null,
  { n: 2, v: 17, f: 0.86, takt: 5.0, suv: 0, acc: 10, grip: 21 },
  { n: 3, v: 19, f: 0.93, takt: 4.0, suv: 0.15, acc: 11, grip: 22 },
  { n: 4, v: 21, f: 0.99, takt: 3.2, suv: 0.3, acc: 12.5, grip: 23 },
  { n: 6, v: 23, f: 1.04, takt: 2.4, suv: 0.45, acc: 14, grip: 24 },
  { n: 8, v: 25, f: 1.08, takt: 1.7, suv: 0.6, acc: 15.5, grip: 25 }
];
export const suchzeit = (sterne) => 7 + sterne * 1.5;           // so lange ohne Sichtkontakt, dann ist man entkommen
export const multi = (serie) => Math.min(5, 1 + 0.5 * Math.max(0, serie - 1));   // Wert-Faktor des n-ten Koffers ohne Sichern
export const PEILZEIT = 12;                                     // so lange sendet der Peilsender im Koffer
export const SICHT = 58;                                        // so weit sieht ein Streifenwagen (freie Sicht vorausgesetzt)
const VERKEHR_MAX = 12;
const VERKEHR_TYPEN = ['auto-flitzer', 'auto-limo', 'auto-taxi', 'auto-suv', 'auto-pickup', 'auto-van', 'auto-muscle', 'auto-taxi', 'auto-limo', 'auto-flitzer', 'auto-lkw'];
const NB = [1, 0, -1, 0, 0, 1, 0, -1, 1, 1, 1, -1, -1, 1, -1, -1];

// ---------------------------------------------------------------- Wegefeld (Dijkstra vom Ziel aus, in einem Fenster)
const HEAP_N = 1 << 19, hK = new Int32Array(HEAP_N), hD = new Float32Array(HEAP_N);
let hN = 0, hTop = 0;
function hPush(k, d) { if (hN >= HEAP_N) return; let i = hN++; while (i > 0) { const p = (i - 1) >> 1; if (hD[p] <= d) break; hK[i] = hK[p]; hD[i] = hD[p]; i = p; } hK[i] = k; hD[i] = d; }
function hPop() {
  const k = hK[0]; hTop = hD[0]; hN--; const lk = hK[hN], ld = hD[hN]; let i = 0;
  for (;;) { let c = 2 * i + 1; if (c >= hN) break; if (c + 1 < hN && hD[c + 1] < hD[c]) c++; if (hD[c] >= ld) break; hK[i] = hK[c]; hD[i] = hD[c]; i = c; }
  hK[i] = lk; hD[i] = ld; return k;
}
export function neuesFeld() { return { d: new Float32Array(NX * NY).fill(INF), i0: 0, j0: 0, i1: 0, j1: 0, x: 0, y: 0, ok: false }; }
// halb: halbe Fenstergröße in Zellen (48 = 96 m um das Ziel). halb >= NX rechnet die ganze Karte.
export function feldRechnen(W, F, tx, ty, halb = 48) {
  let ci = clamp(Math.floor(tx / Z), 0, NX - 1), cj = clamp(Math.floor(ty / Z), 0, NY - 1);
  const K = W.kosten;
  if (!K[cj * NX + ci]) {   // Ziel klebt an einer Wand oder steht im Wasser: nächste freie Zelle
    let best = -1, bd = INF;
    for (let dj = -5; dj <= 5; dj++) for (let di = -5; di <= 5; di++) {
      const i = ci + di, j = cj + dj; if (i < 0 || j < 0 || i >= NX || j >= NY || !K[j * NX + i]) continue;
      const q = di * di + dj * dj; if (q < bd) { bd = q; best = j * NX + i; }
    }
    if (best < 0) { F.ok = false; return F; }
    ci = best % NX; cj = (best - ci) / NX;
  }
  const d = F.d;
  for (let j = F.j0; j < F.j1; j++) d.fill(INF, j * NX + F.i0, j * NX + F.i1);
  const i0 = F.i0 = Math.max(0, ci - halb), i1 = F.i1 = Math.min(NX, ci + halb + 1), j0 = F.j0 = Math.max(0, cj - halb), j1 = F.j1 = Math.min(NY, cj + halb + 1);
  hN = 0; d[cj * NX + ci] = 0; hPush(cj * NX + ci, 0);
  while (hN > 0) {
    const k = hPop(), dk = hTop; if (dk > d[k]) continue;
    const i = k % NX, j = (k - i) / NX;
    for (let n = 0; n < 8; n++) {
      const ni = i + NB[n * 2], nj = j + NB[n * 2 + 1];
      if (ni < i0 || nj < j0 || ni >= i1 || nj >= j1) continue;
      const nk = nj * NX + ni, c = K[nk]; if (!c) continue;
      let nd;
      if (n < 4) nd = dk + c; else { if (!K[j * NX + ni] || !K[nj * NX + i]) continue; nd = dk + c * 1.4142; }
      if (nd < d[nk]) { d[nk] = nd; hPush(nk, nd); }
    }
  }
  F.x = tx; F.y = ty; F.ok = true; return F;
}
// Kann ein Auto die gerade Linie fahren? (W.zu: Hindernisse mit Rand, Wasser)
export function wegFrei(W, x0, y0, x1, y1) {
  const dx = x1 - x0, dy = y1 - y0, n = Math.max(1, Math.ceil(Math.sqrt(dx * dx + dy * dy))), bis = n > 4 ? n - 2 : n;
  for (let k = 1; k <= bis; k++) {
    const x = x0 + dx * k / n, y = y0 + dy * k / n;
    if (x < 0 || y < 0 || x >= BREITE || y >= HOEHE || W.zu[Math.floor(y / Z) * NX + Math.floor(x / Z)]) return false;
  }
  return true;
}
// Dem Feld bergab folgen: liefert einen Punkt einige Zellen weiter auf dem Weg zum Ziel (in M.x, M.y), M.d = Restweg-Kosten
const M = { x: 0, y: 0, d: 0 };
export function moehre(W, F, x, y, n) {
  if (!F.ok) return null;
  let i = Math.floor(x / Z), j = Math.floor(y / Z);
  if (i < F.i0 || j < F.j0 || i >= F.i1 || j >= F.j1) return null;
  const d = F.d;
  let k = j * NX + i;
  if (d[k] >= INF) {
    let bk = -1, bd = INF;
    for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) {
      const a = i + di, b = j + dj; if (a < F.i0 || b < F.j0 || a >= F.i1 || b >= F.j1) continue;
      const q = b * NX + a; if (d[q] < bd) { bd = d[q]; bk = q; }
    }
    if (bk < 0) return null;
    k = bk; i = k % NX; j = (k - i) / NX;
  }
  M.d = d[k]; M.x = i * Z + 1; M.y = j * Z + 1;
  for (let s = 0; s < n; s++) {
    let bk = -1, bd = d[k];
    for (let q = 0; q < 8; q++) {
      const ni = i + NB[q * 2], nj = j + NB[q * 2 + 1];
      if (ni < F.i0 || nj < F.j0 || ni >= F.i1 || nj >= F.j1) continue;
      const nk = nj * NX + ni; if (d[nk] >= bd) continue;
      if (q >= 4 && (!W.kosten[j * NX + ni] || !W.kosten[nj * NX + i])) continue;
      bd = d[nk]; bk = nk;
    }
    if (bk < 0) break;
    const ni = bk % NX, nj = (bk - ni) / NX, px = ni * Z + 1, py = nj * Z + 1;
    if (s >= 2 && !wegFrei(W, x, y, px, py)) break;
    k = bk; i = ni; j = nj; M.x = px; M.y = py;
  }
  return M;
}

// ---------------------------------------------------------------- Körper
function koerper(S, bild, x, y, a, o) {
  const f = FAHRZEUG[bild], r = f.b / 2;
  const c = {
    id: S.nid++, bild, x, y, a, vx: 0, vy: 0, w: 0, l: f.l, b: f.b, r, hl: f.l / 2 - r, masse: f.masse, traeg: f.masse * (f.l * f.l + f.b * f.b) / 12,
    lenk: 0, gas: 0, bremse: 0, hand: false, nitro: false, vmax: 12, acc: 6, grip: 20, hp: 50, hpMax: 50, art: 'parker', ruht: false, rutsch: 0, boden: BODEN.ASPHALT,
    weg: false, treffer: -9
  };
  Object.assign(c, o); c.hpMax = c.hp;
  return c;
}
const ev = (S, t, o) => { if (S.ev.length > 600) S.ev.splice(0, 300); S.ev.push(o ? Object.assign(o, { t }) : { t }); };
const frei = (S, x, y, r) => { for (const c of S.autos) if (Math.abs(c.x - x) < r && Math.abs(c.y - y) < r) return false; return true; };

// ---------------------------------------------------------------- Fahrt anlegen
export function neueFahrt(save, seed = 1, opt = {}) {
  const W = baueWelt(), A = autoVon(save.auto);
  const S = {
    W, r: rng(seed), seed, t: 0, n: 0, nid: 1, auto: A, sp: null, autos: [], koffer: [], beute: 0, sicher: 0, serie: 0, fahndung: 0, sterne: 0,
    gesehen: false, sucht: 0, letzte: { x: 0, y: 0 }, suchT: 0, peil: 0, peilT: 0, torT: -9, haft: 0,
    sperren: [], deko: [], sperreT: 0, platt: 0, heli: null, heliAb: 0, ereignis: { art: '', bis: 0 }, ereignisAb: 0, ereignisLetztes: '', transporter: null, rivale: null, nitro: opt.nitro ?? 0.35, nitroT: 0, lack: 0,
    stat: { koffer: 0, sicher: 0, entkommen: 0, entkommenSterne: 0, dinge: 0, nitro: 0, serie: 0, schrott: 0, haarscharf: 0, werkstatt: 0, drift: 0, pier: 0, maxSterne: 0, versenkt: 0, dauer: 0, gold: 0, geknackt: 0, rivale: 0, sperren: 0 },
    auftraege: aktiveAuftraege(save), erledigt: [], ev: [], ende: null, pause: 0, pauseOrt: null, ort: null, wartet: true,
    weg: new Uint8Array(W.weich.length), feld: neuesFeld(), feldT: -9, spawnT: 0, res: new Array(W.knoten.length).fill(null),
    sichtweite: opt.sichtweite || 78, verkehr: opt.verkehr ?? VERKEHR_MAX, zu: new Map(), driftT: 0, erste: !save.stat || !save.stat.naechte
  };
  S.sp = koerper(S, A.bild, W.start.x, W.start.y, W.start.a, { art: 'spieler', vmax: A.vmax, acc: A.acc, grip: A.grip, hp: 100 * A.panzer, mb: 2.2 });
  S.autos.push(S.sp);
  S.letzte.x = S.sp.x; S.letzte.y = S.sp.y;
  for (const p of W.parker) S.autos.push(koerper(S, p.typ, p.x, p.y, p.a, { art: 'parker', hand: true, ruht: true, hp: 45 }));
  // drei Koffer; in der allerersten Nacht liegt der erste gleich um die Ecke
  if (S.erste) {
    let best = null, bd = INF;
    for (const q of W.koffer) { const d = Math.abs(Math.hypot(q.x - S.sp.x, q.y - S.sp.y) - 150); if (q.x > S.sp.x + 40 && d < bd) { bd = d; best = q; } }
    if (best) S.koffer.push({ id: best.id, x: best.x, y: best.y, art: best.art, wert: best.wert });
  }
  while (S.koffer.length < 3) kofferNeu(S);
  S.ereignisAb = opt.ereignisAb ?? 30 + S.r() * 12; S.ereignisNur = opt.ereignis || '';
  for (let n = 0; n < 400 && zaehle(S, 'verkehr') < S.verkehr; n++) verkehrNeu(S, 30);
  return S;
}
const zaehle = (S, art) => { let n = 0; for (const c of S.autos) if (c.art === art) n++; return n; };

function kofferNeu(S) {
  const W = S.W, sp = S.sp;
  let best = null, bw = -INF;
  for (let n = 0; n < 16; n++) {
    const q = W.koffer[Math.floor(S.r() * W.koffer.length)];
    if (S.koffer.some((k) => k.id === q.id)) continue;
    const d = Math.hypot(q.x - sp.x, q.y - sp.y);
    let nah = INF; for (const k of S.koffer) nah = Math.min(nah, Math.hypot(k.x - q.x, k.y - q.y));
    const w = Math.min(nah, 260) + S.r() * 140 - (d < 110 ? 400 : 0) - (d > 420 ? (d - 420) : 0);
    if (w > bw) { bw = w; best = q; }
  }
  if (!best) best = W.koffer[Math.floor(S.r() * W.koffer.length)];
  S.koffer.push({ id: best.id, x: best.x, y: best.y, art: best.art, wert: best.wert });
}

// ---------------------------------------------------------------- Fahrphysik
function fahre(S, c) {
  const dt = DT, fx = Math.cos(c.a), fy = Math.sin(c.a);
  let vf = c.vx * fx + c.vy * fy, vl = -c.vx * fy + c.vy * fx;
  const bo = bodenBei(S.W, c.x, c.y);
  let gf = 1, vfak = 1, roll = 1.2;
  if (bo === BODEN.GRAS) { gf = 0.74; vfak = 0.86; roll = 2.4; }
  else if (bo === BODEN.SAND) { gf = 0.62; vfak = 0.74; roll = 3.6; }
  else if (bo === BODEN.FLACH) { gf = 0.5; vfak = 0.42; roll = 9; }
  else if (bo === BODEN.HOLZ) gf = 0.9;
  c.boden = bo;
  const tot = c.hp <= 0, gas = tot ? 0 : c.gas;
  const ziel = c.vmax * vfak * (c.nitro ? 1.42 : 1);
  if (gas > 0 && !c.hand && vf < ziel) vf += Math.min(1, 2.4 * (1 - vf / ziel)) * c.acc * (c.nitro ? 2 : 1) * gas * dt;
  if (vf > ziel) vf = Math.max(ziel, vf - 9 * dt);
  if (c.bremse > 0) {
    if (vf > 0.4) vf = Math.max(0, vf - 24 * c.bremse * dt);
    else if (!tot) vf = Math.max(-7 * vfak, vf - 9 * c.bremse * dt);
  }
  if (c.hand) vf -= Math.sign(vf) * Math.min(Math.abs(vf), 8 * dt);
  const reib = (gas === 0 && c.bremse === 0 ? roll + (c.mb || 0) : roll - 1.2) + (tot ? 6 : 0);   // mb: Motorbremse, wenn man vom Gas geht
  if (reib > 0) vf -= Math.sign(vf) * Math.min(Math.abs(vf), reib * dt);
  // seitlicher Halt: was die Reifen nicht halten, wird zur Rutschpartie
  const grip = c.grip * gf * (c.hand ? 0.4 : 1) * (c.nitro ? 1.1 : 1), al = Math.abs(vl), dv = grip * dt;
  if (al <= dv) vl = 0; else { vl -= Math.sign(vl) * dv; vf -= Math.sign(vf) * Math.min(Math.abs(vf), al * 0.3 * dt); }
  c.rutsch = Math.abs(vl);
  // Lenken: bei hohem Tempo durch den Reifenhalt begrenzt; steht das Auto vor einer Wand, drehen die Räder trotzdem etwas
  const av = Math.max(Math.abs(vf), gas > 0 ? 3.2 : 0), v = Math.hypot(vf, vl);
  const wmax = Math.min(av / 3.4, 2.9, (c.hand ? 1.9 : 1.32) * c.grip * gf / Math.max(av, 6));
  let wl = c.lenk * wmax * (vf < -0.3 ? -1 : 1);
  if (v > 3) wl += clamp(vl / v, -1, 1) * (c.hand ? 0.6 : 2.2) * (vf < 0 ? -1 : 1);   // richtet sich in Fahrtrichtung aus
  c.a += (wl + c.w) * dt;
  c.w *= 1 - 5 * dt;
  c.vx = fx * vf - fy * vl; c.vy = fy * vf + fx * vl;
  c.x += c.vx * dt; c.y += c.vy * dt;
}

// Für Tests: ein Auto ohne Welt und Hindernisse fahren lassen (nur Fahrphysik auf Asphalt)
export function probefahrt(bild, werte, eingabe, sekunden, v0 = 0) {
  const S = { W: { boden: new Uint8Array(NX * NY).fill(BODEN.ASPHALT) }, nid: 1 };
  const c = koerper(S, bild, BREITE / 2, HOEHE / 2, 0, { art: 'spieler', ...werte });
  c.vx = v0; const spur = [];
  for (let n = 0; n < Math.round(sekunden / DT); n++) {
    const e = eingabe(n * DT, c) || {};
    c.lenk += clamp((e.lenk || 0) - c.lenk, -9 * DT, 9 * DT); c.gas = e.gas ?? 1; c.bremse = e.bremse ? 1 : 0; c.hand = !!e.hand; c.nitro = !!e.nitro;
    if (c.bremse) c.gas = 0;
    fahre(S, c); spur.push([c.x - BREITE / 2, c.y - HOEHE / 2, c.a, c.rutsch]);
  }
  return { c, spur };
}

function schade(S, c, d) {
  if (c.hp <= 0 || d <= 0) return;
  if (c === S.sp) { if (S.nitroT > 0) d *= 0.5; if (S.schutz) return; }
  c.hp -= d; c.treffer = S.t;
  if (c.hp > 0) return;
  c.hp = 0; c.hand = true; c.gas = 0;
  if (c === S.sp) { ende(S, 'schrott'); return; }
  if (c.art === 'polizei') {
    if (c.modus === 'jagd') {
      const st = Math.max(1, S.sterne), bonus = 150 * st;
      S.stat.schrott++; S.beute += bonus; S.nitro = Math.min(1, S.nitro + 0.3);
      S.fahndung = Math.min(5.99, S.fahndung + 0.35);
      ev(S, 'schrott', { x: c.x, y: c.y, bonus });
    }
    c.modus = 'wrack'; c.wrackT = S.t;
  } else if (c.art === 'verkehr' || c.art === 'rivale') {
    if (c.art === 'rivale' && c.hat) rivaleFallen(S, c);
    c.art = 'wrack'; c.warn = true; c.wrackT = S.t; c.transporter = false;
  }
}

// Stoß gegen etwas Festes: Kreis k (−1 hinten, 0 Mitte, 1 vorn) des Autos dringt um "tief" ein, n zeigt vom Hindernis weg
function prall(S, c, k, nx, ny, tief) {
  c.x += nx * tief; c.y += ny * tief;
  const fx = Math.cos(c.a), fy = Math.sin(c.a), rx = fx * c.hl * k - nx * c.r, ry = fy * c.hl * k - ny * c.r;
  const vn = (c.vx - c.w * ry) * nx + (c.vy + c.w * rx) * ny;
  if (vn >= 0) return;
  const rn = rx * ny - ry * nx, j = -1.3 * vn / (1 / c.masse + rn * rn / c.traeg);
  c.vx += j * nx / c.masse; c.vy += j * ny / c.masse; c.w = clamp(c.w + j * rn / c.traeg, -6, 6);
  const tx = -ny, ty = nx, vt = c.vx * tx + c.vy * ty, dvt = Math.min(Math.abs(vt), 0.25 * j / c.masse) * Math.sign(vt);
  c.vx -= dvt * tx; c.vy -= dvt * ty;
  const hart = -vn;
  if (hart > 5) schade(S, c, (hart - 5) * 1.25);
  if (c === S.sp) { if (hart > 2.5) ev(S, 'krach', { x: c.x - nx * c.r, y: c.y - ny * c.r, s: hart, mit: 'wand' }); else if (Math.abs(vt) > 7 && S.n % 4 === 0) ev(S, 'funke', { x: c.x + rx, y: c.y + ry }); }
  else if (hart > 6 && c.art === 'polizei' && c.dist < 60) ev(S, 'krach', { x: c.x, y: c.y, s: hart, mit: 'fern' });
}
function statisch(S, c) {
  const W = S.W, G = W.gitter, ext = c.hl + c.r, r = c.r;
  const i0 = clamp(Math.floor((c.x - ext) / G.G), 0, G.gx - 1), i1 = clamp(Math.floor((c.x + ext) / G.G), 0, G.gx - 1);
  const j0 = clamp(Math.floor((c.y - ext) / G.G), 0, G.gy - 1), j1 = clamp(Math.floor((c.y + ext) / G.G), 0, G.gy - 1);
  for (let gj = j0; gj <= j1; gj++) for (let gi = i0; gi <= i1; gi++) {
    const zelle = gj * G.gx + gi, bl = G.box[zelle], kl = G.kreis[zelle];
    for (let q = 0; q < bl.length; q++) {
      const b = W.boxen[bl[q]];
      if (c.x + ext <= b.x0 || c.x - ext >= b.x1 || c.y + ext <= b.y0 || c.y - ext >= b.y1) continue;
      for (let k = -1; k <= 1; k++) {
        const px = c.x + Math.cos(c.a) * c.hl * k, py = c.y + Math.sin(c.a) * c.hl * k;
        const qx = clamp(px, b.x0, b.x1), qy = clamp(py, b.y0, b.y1), dx = px - qx, dy = py - qy, d2 = dx * dx + dy * dy;
        if (d2 >= r * r) continue;
        if (d2 > 1e-8) { const d = Math.sqrt(d2); prall(S, c, k, dx / d, dy / d, r - d); }
        else {
          const li = px - b.x0, re = b.x1 - px, ob = py - b.y0, un = b.y1 - py, m = Math.min(li, re, ob, un);
          if (m === li) prall(S, c, k, -1, 0, r + m); else if (m === re) prall(S, c, k, 1, 0, r + m); else if (m === ob) prall(S, c, k, 0, -1, r + m); else prall(S, c, k, 0, 1, r + m);
        }
      }
    }
    for (let q = 0; q < kl.length; q++) {
      const o = W.kreise[kl[q]], rr = r + o.r;
      for (let k = -1; k <= 1; k++) {
        const dx = c.x + Math.cos(c.a) * c.hl * k - o.x, dy = c.y + Math.sin(c.a) * c.hl * k - o.y, d2 = dx * dx + dy * dy;
        if (d2 >= rr * rr || d2 < 1e-8) continue;
        const d = Math.sqrt(d2); prall(S, c, k, dx / d, dy / d, rr - d);
      }
    }
  }
}
// Umfahrbares: Mülleimer, Bänke, Schirme, Liegen, Hecken, Büsche, Laternen, Haltestelle
const BREMS = { muelleimer: 0.985, bank: 0.95, laterne: 0.93, haltestelle: 0.9, hecke: 0.94, busch: 0.97, schirm: 0.975, liege: 0.975 };
function weiche(S, c) {
  const v2 = c.vx * c.vx + c.vy * c.vy; if (v2 < 12) return;
  const W = S.W, G = W.gitter, ext = c.hl + c.r;
  const i0 = clamp(Math.floor((c.x - ext) / G.G), 0, G.gx - 1), i1 = clamp(Math.floor((c.x + ext) / G.G), 0, G.gx - 1);
  const j0 = clamp(Math.floor((c.y - ext) / G.G), 0, G.gy - 1), j1 = clamp(Math.floor((c.y + ext) / G.G), 0, G.gy - 1);
  for (let gj = j0; gj <= j1; gj++) for (let gi = i0; gi <= i1; gi++) {
    const wl = G.weich[gj * G.gx + gi];
    for (let q = 0; q < wl.length; q++) {
      const d = W.dinge[wl[q]]; if (S.weg[d.wi]) continue;
      const px = d.fx ?? d.x, py = d.fy ?? d.y, rr = c.r + d.r;
      let hit = false;
      for (let k = -1; k <= 1 && !hit; k++) {
        const cx = c.x + Math.cos(c.a) * c.hl * k, cy = c.y + Math.sin(c.a) * c.hl * k;
        if (d.lang) {   // längliches Ding: Abstand zur Strecke
          const ux = Math.cos(d.rot), uy = Math.sin(d.rot), s = clamp((cx - px) * ux + (cy - py) * uy, -d.lang, d.lang), ex = cx - px - ux * s, ey = cy - py - uy * s;
          hit = ex * ex + ey * ey < rr * rr;
        } else { const ex = cx - px, ey = cy - py; hit = ex * ex + ey * ey < rr * rr; }
      }
      if (!hit) continue;
      S.weg[d.wi] = 1;
      const f = BREMS[d.bild] || 0.97; c.vx *= f; c.vy *= f;
      const eigen = c === S.sp;
      if (eigen) { S.stat.dinge++; S.nitro = Math.min(1, S.nitro + 0.025); if (S.gesehen) S.fahndung = Math.min(5.99, S.fahndung + 0.01); }
      if (eigen || Math.abs(c.x - S.sp.x) + Math.abs(c.y - S.sp.y) < 90) ev(S, 'ding', { i: wl[q], x: d.x, y: d.y, vx: c.vx, vy: c.vy, eigen });
    }
  }
}
// Zwei Autos: je drei Kreise, tiefste Überlappung auflösen, Impuls nach Masse verteilen
function paar(S, A, B) {
  const dx0 = B.x - A.x, dy0 = B.y - A.y, reich = A.hl + A.r + B.hl + B.r;
  if (dx0 > reich || dx0 < -reich || dy0 > reich || dy0 < -reich) return;
  const afx = Math.cos(A.a), afy = Math.sin(A.a), bfx = Math.cos(B.a), bfy = Math.sin(B.a), rr = A.r + B.r;
  let best = 0, bi = 0, bj = 0, bnx = 1, bny = 0;
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
    const dx = B.x + bfx * B.hl * j - A.x - afx * A.hl * i, dy = B.y + bfy * B.hl * j - A.y - afy * A.hl * i, d2 = dx * dx + dy * dy;
    if (d2 >= rr * rr) continue;
    const d = Math.sqrt(d2), tief = rr - d;
    if (tief > best) { best = tief; bi = i; bj = j; if (d > 1e-6) { bnx = dx / d; bny = dy / d; } }
  }
  if (best <= 0) return;
  const ima = 1 / A.masse, imb = 1 / B.masse, s = best / (ima + imb);
  A.x -= bnx * s * ima; A.y -= bny * s * ima; B.x += bnx * s * imb; B.y += bny * s * imb;
  const rax = afx * A.hl * bi + bnx * A.r, ray = afy * A.hl * bi + bny * A.r, rbx = bfx * B.hl * bj - bnx * B.r, rby = bfy * B.hl * bj - bny * B.r;
  const vrel = ((B.vx - B.w * rby) - (A.vx - A.w * ray)) * bnx + ((B.vy + B.w * rbx) - (A.vy + A.w * rax)) * bny;
  A.ruht = B.ruht = false;
  if (vrel >= 0) return;
  const ran = rax * bny - ray * bnx, rbn = rbx * bny - rby * bnx;
  const j = -1.2 * vrel / (ima + imb + ran * ran / A.traeg + rbn * rbn / B.traeg);
  A.vx -= j * bnx * ima; A.vy -= j * bny * ima; A.w = clamp(A.w - j * ran / A.traeg, -6, 6);
  B.vx += j * bnx * imb; B.vy += j * bny * imb; B.w = clamp(B.w + j * rbn / B.traeg, -6, 6);
  const stark = -vrel, sp = S.sp;
  if (stark > 2.5) {
    const E = (stark - 2.5) * 3 / (A.masse + B.masse);
    // wer mit der Schnauze trifft, steckt weniger ein; Nitro macht zum Rammbock
    let da = E * B.masse * (bi === 1 ? 0.55 : 1), db = E * A.masse * (bj === 1 ? 0.55 : 1);
    if (A.nitro) { da *= 0.5; db *= 1.6; } if (B.nitro) { db *= 0.5; da *= 1.6; }
    schade(S, A, da); schade(S, B, db);
  }
  if (A === sp || B === sp) {
    const o = A === sp ? B : A;
    o.nahT = 0; o.nahAus = S.t + 3;
    if (stark > 2) ev(S, 'krach', { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2, s: stark, mit: o.bild.startsWith('polizei') ? 'polizei' : 'auto' });
    if (o.bild.startsWith('polizei') && stark > 3.5 && !S.ende) {   // Polizeiwagen gerammt
      if (S.sterne === 0) alarm(S, 1, 'Streifenwagen gerammt'); else if ((A === sp ? bi : bj) === 1) S.fahndung = Math.min(5.99, S.fahndung + 0.1);   // nur wer selbst rammt
      if (o.modus === 'streife' || o.modus === 'sperre') { o.modus = 'jagd'; o.hand = false; }
    } else if (o.transporter && !S.ende) {   // Geldtransporter: jeder Rammstoß mit der Schnauze schüttelt Geld heraus
      if (stark > 5 && (A === sp ? bi : bj) === 1 && S.t - o.sackT > 0.7) transporterTreffer(S, o);
    } else if (o.art === 'rivale' && !S.ende) {
      if (o.hat && stark > 4.5) rivaleFallen(S, o);
    } else if (stark > 7 && S.sterne === 0 && !S.ende) {   // Unfall vor den Augen einer Streife
      for (const z of S.autos) if (z.art === 'polizei' && z.modus === 'streife' && z.hp > 0 && Math.abs(z.x - sp.x) + Math.abs(z.y - sp.y) < 45 && sichtFrei(S.W, z.x, z.y, sp.x, sp.y)) { alarm(S, 1, 'Unfall vor einer Streife'); z.modus = 'jagd'; break; }
    }
  } else if (stark > 6 && Math.abs(A.x - sp.x) + Math.abs(A.y - sp.y) < 70) ev(S, 'krach', { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2, s: stark, mit: 'fern' });
}

// ---------------------------------------------------------------- Fahndung
function alarm(S, mindestens, grund) {
  const vorher = S.sterne;
  S.fahndung = Math.min(5.99, Math.max(S.fahndung, mindestens));
  if (vorher === 0) { S.sucht = 0; S.letzte.x = S.sp.x; S.letzte.y = S.sp.y; S.spawnT = POLIZEI[Math.floor(S.fahndung)].takt - 1.5; S.feldT = -9; ev(S, 'alarm', { grund }); }
}
function entkommen(S) {
  const st = S.sterne, bonus = 100 * st * st;
  S.stat.entkommen++; S.stat.entkommenSterne = Math.max(S.stat.entkommenSterne, st);
  S.beute += bonus; S.fahndung = 0; S.sterne = 0; S.sucht = 0; S.haft = 0; S.peil = 0;
  abziehen(S);
  ev(S, 'entkommen', { sterne: st, bonus });
}
// Jagd vorbei: die Wagen fahren als Streife im Verkehr weiter
function abziehen(S) {
  for (const c of S.autos) if (c.art === 'polizei' && c.modus === 'jagd') { c.modus = 'streife'; c.k = -1; c.blau = false; }
}
function auftraegePruefen(S) {
  for (const a of S.auftraege) {
    if (S.erledigt.includes(a.id)) continue;
    if ((S.stat[a.k] || 0) >= a.ziel) { S.erledigt.push(a.id); ev(S, 'auftrag', { id: a.id, text: a.text, lohn: a.lohn }); }
  }
}
function ende(S, grund) {
  if (S.ende) return;
  auftraegePruefen(S);   // was in den letzten Augenblicken noch geschafft wurde, zählt
  S.ende = { grund, t: S.t, verloren: S.beute };
  ev(S, 'ende', { grund });
}
export function feierabend(S) { ende(S, 'feierabend'); }

// ---------------------------------------------------------------- Polizei
function polizeiNeu(S) {
  const W = S.W, sp = S.sp, R = S.sichtweite, P = POLIZEI[Math.max(1, S.sterne)], pv = Math.hypot(sp.vx, sp.vy);
  let best = null, bw = -INF;
  for (let n = 0; n < 28; n++) {
    const ki = Math.floor(S.r() * W.kanten.length), k = W.kanten[ki], s = 4 + S.r() * (k.len - 8), o = k.spuren[0];
    const x = k.x0 + k.dx * s + k.nx * o, y = k.y0 + k.dy * s + k.ny * o, dx = x - sp.x, dy = y - sp.y, d = Math.hypot(dx, dy);
    if (d < R + 4 || d > R + 46 || !frei(S, x, y, 8)) continue;
    let w = S.r() * 30 - (d - R) * 0.6 - (dx * k.dx + dy * k.dy) / d * 25;   // lieber Wagen, die auf den Spieler zufahren
    if (pv > 4) w += (S.sterne >= 3 ? 45 : 12) * (dx * sp.vx + dy * sp.vy) / (d * pv);   // ab 3 Sternen kommen sie von vorn
    if (w > bw) { bw = w; best = { x, y, ki }; }
  }
  if (!best) return false;
  const k = W.kanten[best.ki], suv = S.r() < P.suv;
  const c = koerper(S, suv ? 'polizei-suv' : 'polizei', best.x, best.y, Math.atan2(k.dy, k.dx), { art: 'polizei', modus: 'jagd', hp: suv ? 95 : 60, k: -1, steht: 0, zurueck: 0, zurLenk: 0, klemm: 0, rolle: 0, dist: 99, blau: true, suv });
  c.rolle = S.sterne >= 3 && c.id % 3 === 0 ? 1 : 0;
  c.vx = k.dx * 10; c.vy = k.dy * 10;
  S.autos.push(c);
  return true;
}
function polizeiLenken(S, c) {
  const sp = S.sp, W = S.W;
  if (c.hp <= 0) { c.gas = 0; c.bremse = 0; c.hand = true; c.lenk = 0; return; }
  const P = POLIZEI[Math.max(1, S.sterne)];
  c.vmax = Math.max(P.v, S.auto.vmax * P.f) * (c.suv ? 0.95 : 1) * (S.gesehen ? 1 : 0.78); c.acc = P.acc; c.grip = P.grip;
  const dx = sp.x - c.x, dy = sp.y - c.y, dist = Math.hypot(dx, dy), v = Math.hypot(c.vx, c.vy);
  c.dist = dist; c.blau = true;
  if (c.zurueck > 0) { c.zurueck -= DT; c.gas = 0; c.bremse = 1; c.hand = false; c.lenk = c.zurLenk; return; }
  if (v < 1.2) { c.steht += DT; if (c.steht > 1.1 && (dist > 8 || !S.gesehen)) { c.steht = 0; c.zurueck = 0.7 + S.r() * 0.5; c.zurLenk = S.r() < 0.5 ? -1 : 1; c.klemm++; } }
  else c.steht = Math.max(0, c.steht - DT * 2);
  let tx, ty, blockt = false;
  if (S.gesehen && dist < 36 && wegFrei(W, c.x, c.y, sp.x, sp.y)) {
    const tau = clamp(dist / 26, 0.05, 0.8), pv = Math.hypot(sp.vx, sp.vy);
    tx = sp.x + sp.vx * tau; ty = sp.y + sp.vy * tau;
    if (c.rolle === 1 && dist > 6 && pv > 6) {   // Blocker: setzt sich vor den Spieler und bremst
      const px = sp.vx / pv, py = sp.vy / pv, seite = c.id % 2 ? 1 : -1, vorn = -(dx * px + dy * py);
      const bx = sp.x + px * 15 - py * 3.2 * seite, by = sp.y + py * 15 + px * 3.2 * seite;
      if (vorn > 9) blockt = true; else if (wegFrei(W, c.x, c.y, bx, by)) { tx = bx; ty = by; }
    }
  } else {
    const m = moehre(W, S.feld, c.x, c.y, 3 + Math.floor(v / 5));
    if (m) { tx = m.x; ty = m.y; } else { tx = S.feld.ok ? S.feld.x : S.letzte.x; ty = S.feld.ok ? S.feld.y : S.letzte.y; }
  }
  const ang = wrap(Math.atan2(ty - c.y, tx - c.x) - c.a), aa = Math.abs(ang);
  c.lenk = clamp(ang * 2.4, -1, 1); c.gas = 1; c.bremse = 0; c.hand = false;
  if (aa > 1.1 && v > 9) c.hand = true; else if (aa > 0.6 && v > 14) c.gas = 0.25;
  if (aa > 2.3 && v < 5 && dist > 7) { c.zurueck = 0.6; c.zurLenk = ang > 0 ? -1 : 1; }
  if (blockt) { c.gas = 0; if (v > 4) c.bremse = 1; else c.hand = true; }
  // Abstand zu Kollegen: nicht im Gänsemarsch auffahren
  const fx = Math.cos(c.a), fy = Math.sin(c.a);
  for (const o of S.autos) {
    if (o === c || o.art !== 'polizei' || o.hp <= 0) continue;
    const ox = o.x - c.x, oy = o.y - c.y; if (ox > 9 || ox < -9 || oy > 9 || oy < -9) continue;
    const df = ox * fx + oy * fy, dl = -ox * fy + oy * fx;
    if (df > 0 && df < 8 && Math.abs(dl) < 2.4) { c.lenk = clamp(c.lenk + (dl > 0 ? -0.7 : 0.7), -1, 1); if (df < 5.5) c.gas = Math.min(c.gas, 0.4); }
  }
}

// ---------------------------------------------------------------- Verkehr (und Polizei auf Streife): folgt den Fahrspuren
function naechsteKante(S, c) {   // nächstgelegene Spur in Fahrtrichtung
  const W = S.W, fx = Math.cos(c.a), fy = Math.sin(c.a);
  let best = -1, bd = INF, bs = 0;
  for (let i = 0; i < W.kanten.length; i++) {
    const k = W.kanten[i], s = clamp((c.x - k.x0) * k.dx + (c.y - k.y0) * k.dy, 0, k.len), o = k.spuren[0];
    const d = Math.hypot(k.x0 + k.dx * s + k.nx * o - c.x, k.y0 + k.dy * s + k.ny * o - c.y) + (1 - (fx * k.dx + fy * k.dy)) * 14 + (s > k.len - 8 ? 20 : 0);
    if (d < bd) { bd = d; best = i; bs = o; }
  }
  c.k = best; c.spur = bs; c.nk = null; c.abbiegen = 0; c.von = -1; c.tempo = c.tempo || 9;
}
function waehle(S, k, c) {
  const W = S.W, raus = W.knoten[k.b].raus;
  if (c && c.art === 'rivale') {   // die Kante, deren Ende dem Ziel am nächsten liegt (im Straßenraster führt das hin)
    let best = raus[0], bd = INF;
    for (const e of raus) { const n = W.kanten[e]; if (n.b === k.a && raus.length > 1) continue; const q = W.knoten[n.b], d = Math.abs(q.x - c.tx) + Math.abs(q.y - c.ty); if (d < bd) { bd = d; best = e; } }
    return best;
  }
  let wahl = -1, sum = 0;
  for (const e of raus) {
    const n = W.kanten[e]; if (n.b === k.a) continue;
    const w = n.dx === k.dx && n.dy === k.dy ? 3 : 1; sum += w;
    if (S.r() * sum < w) wahl = e;
  }
  return wahl >= 0 ? wahl : raus[0];
}
function verkehrLenken(S, c) {
  const W = S.W;
  if (c.k < 0 || c.k == null) naechsteKante(S, c);
  let k = W.kanten[c.k], s = (c.x - k.x0) * k.dx + (c.y - k.y0) * k.dy;
  const fx = Math.cos(c.a), fy = Math.sin(c.a), v = c.vx * fx + c.vy * fy;
  if (s > k.len - 12 && c.nk == null) c.nk = waehle(S, k, c);
  let vz = c.tempo;
  if (s > k.len - 0.5) {   // Kreuzung erreicht
    const n = W.kanten[c.nk]; c.von = k.b;
    c.abbiegen = k.dx * n.dy - k.dy * n.dx;   // > 0 rechts, < 0 links
    c.k = c.nk; c.nk = null; c.spur = n.spuren[Math.floor(S.r() * n.spuren.length)];
    k = n; s = (c.x - k.x0) * k.dx + (c.y - k.y0) * k.dy;
  } else if (s > k.len - 10 && c.art !== 'rivale') {   // vor der Kreuzung: nur einer zurzeit
    const res = S.res[k.b];
    if (res && res.c !== c && !res.c.weg && res.c.art !== 'wrack' && S.t - res.t < 7) vz = Math.min(vz, clamp((k.len - 1.5 - s) * 1.5, 0, vz));
    else if (!res || res.c !== c) S.res[k.b] = { c, t: S.t };
  }
  if (c.von >= 0) {
    if (s > 5) { if (S.res[c.von] && S.res[c.von].c === c) S.res[c.von] = null; c.von = -1; c.abbiegen = 0; }
    else vz = Math.min(vz, c.abbiegen > 0 ? 4.5 : c.abbiegen < 0 ? 6.5 : vz);
  }
  const st = Math.max(s, 0) + 3.5 + Math.max(0, v) * 0.45;
  const tx = k.x0 + k.dx * st + k.nx * c.spur, ty = k.y0 + k.dy * st + k.ny * c.spur;
  // Hindernis voraus?
  for (const o of S.autos) {
    if (o === c) continue;
    const ox = o.x - c.x, oy = o.y - c.y; if (ox > 24 || ox < -24 || oy > 24 || oy < -24) continue;
    const df = ox * fx + oy * fy, dl = -ox * fy + oy * fx, halb = (c.l + o.l) / 2;
    if (df > 0 && df < halb + 4 + Math.max(0, v) * 0.9 && Math.abs(dl) < (c.b + o.b) / 2 + 0.4) {
      vz = Math.min(vz, Math.max(0, (df - halb - 2.2) * 1.3));
      if (o === S.sp && vz < 1 && S.t - (c.hupT || -9) > 3) { c.hupT = S.t; ev(S, 'hupe', { x: c.x, y: c.y }); }
    }
  }
  const ang = wrap(Math.atan2(ty - c.y, tx - c.x) - c.a);
  c.lenk = clamp(ang * 2.4, -1, 1); c.hand = false; c.bremse = 0;
  if (vz > 2 && Math.abs(v) < 0.5) { c.fest = (c.fest || 0) + DT; if (c.fest > 5 && c.art === 'verkehr') { c.art = 'wrack'; c.warn = true; c.wrackT = S.t; c.hand = true; c.gas = 0; return; } } else c.fest = 0;
  if (vz < 0.3 && v < 0.6) { c.gas = 0; c.hand = true; }
  else if (v < vz - 0.4) c.gas = 0.7;
  else if (v > vz + 2.5) { c.gas = 0; c.bremse = 0.6; }
  else if (v > vz + 0.6) { c.gas = 0; c.bremse = 0.18; }
  else c.gas = 0.25;
}
function verkehrNeu(S, nah) {
  const W = S.W, sp = S.sp, R = nah ?? S.sichtweite + 6;
  const ki = Math.floor(S.r() * W.kanten.length), k = W.kanten[ki], s = 6 + S.r() * (k.len - 14), o = k.spuren[Math.floor(S.r() * k.spuren.length)];
  const x = k.x0 + k.dx * s + k.nx * o, y = k.y0 + k.dy * s + k.ny * o, d = Math.hypot(x - sp.x, y - sp.y);
  if (d < R || d > S.sichtweite + 70 || !frei(S, x, y, 11)) return false;
  const bild = VERKEHR_TYPEN[Math.floor(S.r() * VERKEHR_TYPEN.length)], tempo = (bild === 'auto-lkw' ? 7 : 8.5) + S.r() * 3.5;
  const c = koerper(S, bild, x, y, Math.atan2(k.dy, k.dx), { art: 'verkehr', k: ki, spur: o, nk: null, von: -1, abbiegen: 0, vmax: 15, acc: 5, grip: 19, hp: 45, tempo, nahT: 0, nahAus: 0 });
  c.vx = k.dx * tempo; c.vy = k.dy * tempo;
  S.autos.push(c);
  return true;
}

// ---------------------------------------------------------------- Polizei-Taktik: Straßensperre, Nagelband, Hubschrauber
export const SPERRE_TAKT = [0, 0, 0, 20, 15, 11];                      // Sekunden bis zur nächsten Sperre je Sternzahl (plus bis zu 6)
export const PLATT = { dauer: 7, tempo: 0.62, halt: 0.62 };            // platte Reifen nach einem Nagelband
export const HELI = { da: 24, tankt: 16, tempo: 27, licht: 24, kreis: 6.5, arm: 34 };   // Suchscheinwerfer folgt mit 24 m/s
function reifenHeil(S) { S.platt = 0; S.sp.vmax = S.auto.vmax; S.sp.grip = S.auto.grip; }
function kanteBei(W, x, y, fx, fy) {   // die Straße, auf der jemand in diese Richtung fährt
  let best = 0, bd = INF;
  for (let i = 0; i < W.kanten.length; i++) {
    const k = W.kanten[i], s = clamp((x - k.x0) * k.dx + (y - k.y0) * k.dy, 0, k.len);
    const d = Math.hypot(k.x0 + k.dx * s - x, k.y0 + k.dy * s - y) + (1 - (fx * k.dx + fy * k.dy)) * 14;
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}
// Sperre voraus: auf der Straße des Spielers geradeaus weiter, bis die Stelle außer Sicht liegt
function sperreNeu(S) {
  const W = S.W, sp = S.sp, v = Math.hypot(sp.vx, sp.vy);
  if (v < 8) return false;
  let k = W.kanten[kanteBei(W, sp.x, sp.y, sp.vx / v, sp.vy / v)];
  if (Math.abs((sp.x - k.x0) * k.nx + (sp.y - k.y0) * k.ny) > k.breite / 2 + 6 || k.dx * sp.vx + k.dy * sp.vy < v * 0.7) return false;
  for (let n = 0; n < 4; n++) {
    const mx = k.x0 + k.dx * k.len * 0.5, my = k.y0 + k.dy * k.len * 0.5, d = Math.hypot(mx - sp.x, my - sp.y);
    if (d > S.sichtweite + 8 && k.len > 30) return d < S.sichtweite + 130 && sperreBauen(S, k, mx, my);
    let nk = null; for (const e of W.knoten[k.b].raus) { const q = W.kanten[e]; if (q.dx === k.dx && q.dy === k.dy) nk = q; }
    if (!nk) return false;
    k = nk;
  }
  return false;
}
function sperreBauen(S, k, mx, my) {
  const P = POLIZEI[Math.max(1, S.sterne)], nagel = S.sterne >= 4 && S.r() < 0.45, seite = S.r() < 0.5 ? 1 : -1;
  const quer = Math.atan2(k.ny, k.nx), laengs = Math.atan2(k.dy, k.dx), h = k.breite / 2;
  const s = { x: mx, y: my, t: S.t, art: nagel ? 'nagel' : 'wagen', autos: [], nagel: null, nah: false };
  const wagen = (o, vor, a) => {
    const x = mx + k.nx * o + k.dx * vor, y = my + k.ny * o + k.dy * vor; if (!frei(S, x, y, 5)) return;
    const suv = S.r() < P.suv;
    const c = koerper(S, suv ? 'polizei-suv' : 'polizei', x, y, a, { art: 'polizei', modus: 'sperre', hp: suv ? 95 : 60, hand: true, k: -1, steht: 0, zurueck: 0, zurLenk: 0, klemm: 0, rolle: 0, dist: 99, blau: true, suv });
    S.autos.push(c); s.autos.push(c);
  };
  if (nagel) {   // Band quer über die Fahrbahn, an einer Seite bleiben 3,4 m frei; der Streifenwagen steht am Gehweg
    s.nagel = { x0: mx - k.nx * h * seite, y0: my - k.ny * h * seite, x1: mx + k.nx * (h - 3.4) * seite, y1: my + k.ny * (h - 3.4) * seite, benutzt: false };
    wagen(-(h + 2.1) * seite, 4, laengs);
  } else {       // Wagen quer auf der Fahrbahn; vorbei geht es nur über den Gehweg oder mitten durch
    for (const o of k.breite > 14 ? [-5.6, 0, 5.6] : [-2.9, 2.9]) wagen(o, 0, quer + (S.r() < 0.5 ? Math.PI : 0));
    if (!s.autos.length) return false;
    for (const o of [-(h + 2), h + 2]) S.deko.push({ bild: 'absperrung', x: mx + k.nx * o, y: my + k.ny * o, rot: quer, g: 2.6, r: 0.9 });
  }
  S.sperren.push(s);
  ev(S, 'sperre', { x: mx, y: my, art: s.art });
  return true;
}
function sperrenPflegen(S) {
  const sp = S.sp;
  for (let i = S.sperren.length - 1; i >= 0; i--) {
    const s = S.sperren[i], d = Math.hypot(s.x - sp.x, s.y - sp.y);
    if (d < 16) s.nah = true;
    const durch = s.nah && d > 26, geweckt = s.autos.some((c) => c.modus !== 'sperre');
    if (!durch && !geweckt && S.sterne > 0 && S.t - s.t < 35 && d < S.sichtweite + 160) continue;
    for (const c of s.autos) if (c.modus === 'sperre') { c.modus = S.sterne > 0 ? 'jagd' : 'streife'; c.hand = false; c.k = -1; }
    if (s.nah && S.sterne > 0) {   // der Spieler ist durch: kleiner Bonus, doppelt, wenn nichts berührt wurde
      const sauber = s.art === 'nagel' ? !s.nagel.benutzt : !geweckt, bonus = 100 * S.sterne * (sauber ? 2 : 1);
      S.stat.sperren++; S.beute += bonus; ev(S, 'durchbruch', { art: s.art, sauber, bonus });
    }
    S.sperren.splice(i, 1);
  }
  for (let i = S.deko.length - 1; i >= 0; i--) if (Math.abs(S.deko[i].x - sp.x) + Math.abs(S.deko[i].y - sp.y) > S.sichtweite + 120) S.deko.splice(i, 1);
}
// Hubschrauber bei 5 Sternen: sein Suchscheinwerfer hält den Sichtkontakt, auch hinter Häusern. Er folgt mit 24 m/s
// (schnelle Autos und Nitro hängen ihn ab) und muss nach 24 s für 16 s tanken.
function heliSchritt(S) {
  const sp = S.sp; let h = S.heli;
  if (!h) {
    if (S.sterne < 5) { S.heliAb = 0; return; }
    if (!S.heliAb) S.heliAb = S.t + 4;
    if (S.t < S.heliAb) return;
    h = S.heli = { x: sp.x - 150, y: sp.y - 110, vx: 0, vy: 0, lx: sp.x - 150, ly: sp.y - 110, a: 0, phase: 'an', t: HELI.da, licht: false };
    ev(S, 'heli', { an: true });
  }
  if (h.phase === 'an') {
    if (S.sterne < 5) { h.phase = 'ab'; ev(S, 'heli', { an: false, grund: 'ab' }); }
    else if ((h.t -= DT) <= 0) { h.phase = 'tankt'; h.t = HELI.tankt; ev(S, 'heli', { an: false, grund: 'tankt' }); }
  } else if (h.phase === 'tankt') {
    if (S.sterne < 5) h.phase = 'ab';
    else if ((h.t -= DT) <= 0) { h.phase = 'an'; h.t = HELI.da; ev(S, 'heli', { an: true }); }
  }
  const an = h.phase === 'an';
  const zx = an ? sp.x + Math.cos(S.t * 0.5) * 9 : sp.x - 300, zy = an ? sp.y + Math.sin(S.t * 0.5) * 9 - 4 : sp.y - 240;
  const dx = zx - h.x, dy = zy - h.y, d = Math.hypot(dx, dy) || 1, vz = Math.min(HELI.tempo, d * 1.2);
  h.vx += clamp(dx / d * vz - h.vx, -16 * DT, 16 * DT); h.vy += clamp(dy / d * vz - h.vy, -16 * DT, 16 * DT);
  h.x += h.vx * DT; h.y += h.vy * DT;
  if (h.vx * h.vx + h.vy * h.vy > 4) h.a += wrap(Math.atan2(h.vy, h.vx) - h.a) * Math.min(1, 3 * DT);
  if (!an) { h.lx = h.x; h.ly = h.y; h.licht = false; if (h.phase === 'ab' && Math.hypot(h.x - sp.x, h.y - sp.y) > 230) S.heli = null; return; }
  const ex = sp.x - h.lx, ey = sp.y - h.ly, e = Math.hypot(ex, ey), weit = Math.min(e, HELI.licht * DT);
  if (e > 0) { h.lx += ex / e * weit; h.ly += ey / e * weit; }
  const qx = h.lx - h.x, qy = h.ly - h.y, q = Math.hypot(qx, qy);
  if (q > HELI.arm) { h.lx = h.x + qx / q * HELI.arm; h.ly = h.y + qy / q * HELI.arm; }
  h.licht = Math.hypot(sp.x - h.lx, sp.y - h.ly) < HELI.kreis;
}

// ---------------------------------------------------------------- Besondere Ziele: Goldkoffer, Geldtransporter, Rivale (immer nur eines)
export const GOLD = { zeit: 60, faktor: 3 };
function ereignisEnde(S) { S.ereignis.art = ''; S.ereignisAb = S.t + 28 + S.r() * 24; }
function ereignisse(S) {
  const E = S.ereignis;
  if (E.art === 'gold') {
    const k = S.koffer.find((q) => q.gold);
    if (!k) ereignisEnde(S);
    else if (S.t > k.bis) { S.koffer.splice(S.koffer.indexOf(k), 1); ev(S, 'goldWeg', {}); ereignisEnde(S); }
  } else if (E.art === 'transporter') {
    const c = S.transporter;
    if (!c || c.weg || !c.transporter) { S.transporter = null; ereignisEnde(S); }
    else if (S.t > E.bis && Math.hypot(c.x - S.sp.x, c.y - S.sp.y) > 40) { c.transporter = false; S.transporter = null; ev(S, 'transporterWeg', {}); ereignisEnde(S); }
  } else if (E.art === 'rivale') {
    const c = S.rivale;
    if (!c || c.weg || c.art !== 'rivale') { S.rivale = null; ereignisEnde(S); }
  } else if (S.t >= S.ereignisAb) {
    const wahl = (S.erste ? ['gold'] : ['gold', 'transporter', 'rivale']).filter((a) => a !== S.ereignisLetztes);
    const art = S.ereignisNur || wahl[Math.floor(S.r() * wahl.length)] || 'gold';   // erste Nacht: nur Goldkoffer
    if (art === 'gold' ? goldNeu(S) : art === 'transporter' ? transporterNeu(S) : rivaleNeu(S)) { E.art = art; E.bis = S.t + 75; S.ereignisLetztes = art; }
    else S.ereignisAb = S.t + 2;
  }
}
function goldNeu(S) {
  const W = S.W, sp = S.sp;
  for (let n = 0; n < 30; n++) {
    const q = W.koffer[Math.floor(S.r() * W.koffer.length)], d = Math.hypot(q.x - sp.x, q.y - sp.y);
    if (d < 170 || d > 420 || S.koffer.some((k) => k.id === q.id)) continue;
    S.koffer.push({ id: q.id, x: q.x, y: q.y, art: q.art, wert: q.wert * GOLD.faktor, gold: true, extra: true, bis: S.t + GOLD.zeit, name: 'Goldkoffer' });
    ev(S, 'gold', { x: q.x, y: q.y, wert: q.wert * GOLD.faktor, wo: KOFFER[q.art].name });
    return true;
  }
  return false;
}
function strassenPunkt(S, von, bis) {   // freie Stelle auf einer Fahrspur in diesem Abstand zum Spieler
  const W = S.W, sp = S.sp;
  for (let n = 0; n < 24; n++) {
    const ki = Math.floor(S.r() * W.kanten.length), k = W.kanten[ki], s = 6 + S.r() * (k.len - 14), o = k.spuren[0];
    const x = k.x0 + k.dx * s + k.nx * o, y = k.y0 + k.dy * s + k.ny * o, d = Math.hypot(x - sp.x, y - sp.y);
    if (d >= von && d <= bis && frei(S, x, y, 10)) return { x, y, ki, k, o };
  }
  return null;
}
function transporterNeu(S) {
  const p = strassenPunkt(S, S.sichtweite + 10, S.sichtweite + 110); if (!p) return false;
  const c = koerper(S, 'auto-van', p.x, p.y, Math.atan2(p.k.dy, p.k.dx), { art: 'verkehr', k: p.ki, spur: p.o, nk: null, von: -1, abbiegen: 0, vmax: 15, acc: 5, grip: 19, hp: 150, tempo: 9, nahT: 0, nahAus: 0, transporter: true, saecke: 0, sackT: -9 });
  c.masse = 2.6; c.traeg = c.masse * (c.l * c.l + c.b * c.b) / 12; c.vx = p.k.dx * 9; c.vy = p.k.dy * 9;
  S.autos.push(c); S.transporter = c;
  ev(S, 'transporter', {});
  return true;
}
export const TRANSPORTER = { treffer: 5, sack: 300, knack: 1500 };
function transporterTreffer(S, c) {
  c.sackT = S.t; c.saecke++; c.tempo = 15; c.vmax = 18; c.acc = 8;   // er gibt Gas
  if (S.sterne === 0) alarm(S, 2, 'Geldtransporter überfallen'); else S.fahndung = Math.min(5.99, S.fahndung + 0.3);
  let betrag = TRANSPORTER.sack * Math.max(1, Math.floor(S.fahndung));
  const knack = c.saecke >= TRANSPORTER.treffer;
  if (knack) { betrag += TRANSPORTER.knack; c.transporter = false; c.art = 'wrack'; c.warn = true; c.wrackT = S.t; c.hand = true; c.gas = 0; S.stat.geknackt++; }
  S.beute += betrag; S.nitro = Math.min(1, S.nitro + 0.15);
  ev(S, knack ? 'geknackt' : 'geldsack', { x: c.x, y: c.y, betrag, n: c.saecke });
}
// Rivale: fährt über die Straßen zum nächsten Koffer und schnappt ihn weg. Rammt man ihn danach, lässt er ihn fallen (doppelter Wert).
function rivaleZiel(S, c) {
  let best = null, bd = INF;
  for (const k of S.koffer) { if (k.extra || k.art === 'yacht' || k.art === 'kai' || k.art === 'strand' || k.art === 'park') continue; const d = Math.hypot(k.x - c.x, k.y - c.y); if (d < bd) { bd = d; best = k; } }
  return best;
}
function rivaleNeu(S) {
  const p = strassenPunkt(S, S.sichtweite + 10, S.sichtweite + 120); if (!p) return false;
  const c = koerper(S, 'auto-muscle', p.x, p.y, Math.atan2(p.k.dy, p.k.dx), { art: 'rivale', k: p.ki, spur: p.o, nk: null, von: -1, abbiegen: 0, vmax: 19, acc: 9, grip: 22, hp: 70, tempo: 15.5, hat: null, flucht: false, tx: 0, ty: 0, zielId: 0, hatT: 0, steht: 0, zurueck: 0 });
  const z = rivaleZiel(S, c); if (!z) return false;
  c.zielId = z.id; c.tx = z.x; c.ty = z.y; c.vx = p.k.dx * 10; c.vy = p.k.dy * 10;
  S.autos.push(c); S.rivale = c;
  ev(S, 'rivale', { wo: KOFFER[z.art].name });
  return true;
}
function rivaleFlieht(S, c) {
  const W = S.W; let best = W.knoten[0], bd = -1;
  for (let n = 0; n < 8; n++) { const q = W.knoten[Math.floor(S.r() * W.knoten.length)], d = Math.hypot(q.x - S.sp.x, q.y - S.sp.y); if (d > bd) { bd = d; best = q; } }
  c.flucht = true; c.tx = best.x; c.ty = best.y; c.nk = null; c.tempo = 17; if (!c.hatT) c.hatT = S.t;
}
function rivaleFallen(S, c) {
  const wert = c.hat.wert * 2; c.hat = null;
  S.koffer.push({ id: -(S.nid++), x: c.x, y: c.y, art: 'laden', wert, extra: true, name: 'Koffer vom Rivalen' });
  S.stat.rivale++;
  ev(S, 'rivaleFallen', { x: c.x, y: c.y, wert });
}
function rivaleLenken(S, c) {
  const sp = S.sp, W = S.W;
  if (c.hp <= 0) return;
  if (!c.flucht) {
    let z = S.koffer.find((k) => k.id === c.zielId && !k.extra);
    if (!z) { z = rivaleZiel(S, c); if (z) { c.zielId = z.id; c.tx = z.x; c.ty = z.y; c.nk = null; } else rivaleFlieht(S, c); }
    else if (Math.hypot(z.x - c.x, z.y - c.y) < 4.2) {
      S.koffer.splice(S.koffer.indexOf(z), 1); kofferNeu(S);
      c.hat = { wert: z.wert }; c.hatT = S.t; rivaleFlieht(S, c);
      ev(S, 'rivaleHat', { x: c.x, y: c.y, wert: z.wert });
    }
  } else {
    const fern = Math.hypot(c.x - sp.x, c.y - sp.y) > S.sichtweite + 15;
    if (fern && S.t - c.hatT > 12) { c.weg = true; ev(S, 'rivaleWeg', { mit: !!c.hat }); return; }
    if (Math.hypot(c.tx - c.x, c.ty - c.y) < 14) rivaleFlieht(S, c);
  }
  const v = Math.hypot(c.vx, c.vy);
  if (c.zurueck > 0) { c.zurueck -= DT; c.gas = 0; c.bremse = 1; c.hand = false; c.lenk = 0.6; return; }
  if (v < 0.8) { c.steht += DT; if (c.steht > 2.5) { c.steht = 0; if (Math.hypot(c.x - sp.x, c.y - sp.y) > S.sichtweite + 5) { c.weg = true; return; } c.zurueck = 1; c.k = -1; } } else c.steht = 0;
  if (Math.hypot(c.tx - c.x, c.ty - c.y) < 30 && wegFrei(W, c.x, c.y, c.tx, c.ty)) {   // das letzte Stück direkt
    const ang = wrap(Math.atan2(c.ty - c.y, c.tx - c.x) - c.a);
    c.lenk = clamp(ang * 2.4, -1, 1); c.bremse = 0; c.hand = Math.abs(ang) > 1.2 && v > 9; c.gas = v > 11 ? 0.2 : 1; c.k = -1;
  } else verkehrLenken(S, c);
}

// ---------------------------------------------------------------- Orte: Versteck und Werkstatt
// Einfahrt: das Feld vor dem Tor (Vorplatz, ragt 1,5 m in die Straße). Es zählt, sobald die Wagenmitte im Feld ist –
// egal aus welcher Richtung und wie schnell. Die Fahrspur daneben bleibt frei, damit niemand im Vorbeifahren sichert.
export const EINFAHRT_VOR = 1.5;
function inEinfahrt(v, c) {
  const rx = Math.cos(v.raus), ry = Math.sin(v.raus), quer = Math.abs(ry) > 0.5;
  const tief = quer ? v.by : v.bx, breit = quer ? v.bx : v.by;
  const u = (c.x - v.x) * rx + (c.y - v.y) * ry, w = -(c.x - v.x) * ry + (c.y - v.y) * rx;
  return Math.abs(w) <= breit && u >= -tief - 1.5 && u <= tief + EINFAHRT_VOR;
}
export function werkstattKosten(S) { return S.beute <= 0 ? 0 : Math.min(S.beute, Math.max(100, Math.round(S.beute * 0.1 / 10) * 10)); }
function orte(S) {
  const sp = S.sp, W = S.W;
  let drin = null, typ = '';
  for (const v of W.verstecke) if (inEinfahrt(v, sp)) { drin = v; typ = 'versteck'; }
  for (const v of W.werkstaetten) if (inEinfahrt(v, sp)) { drin = v; typ = 'werkstatt'; }
  if (!drin) { S.ort = null; return; }
  if (S.ort === drin) return;
  // Sieht die Polizei zu, bleibt das Tor zu – es geht auf, sobald der Sichtkontakt weg ist (auch wenn man im Feld wartet)
  if (S.sterne > 0 && S.gesehen) { if (S.t - S.torT > 2.5) { S.torT = S.t; ev(S, 'tor', { typ, grund: 'gesehen' }); } return; }
  S.ort = drin;
  const heil = sp.hp >= sp.hpMax - 0.5;
  if (typ === 'versteck') {
    if (S.beute <= 0 && S.sterne === 0 && heil) { ev(S, 'tor', { typ, grund: 'leer' }); return; }
    const betrag = S.beute;
    S.sicher += betrag; S.stat.sicher = S.sicher; S.beute = 0; S.serie = 0;
    ev(S, 'gesichert', { betrag, name: drin.name, sterne: S.sterne });
  } else {
    const bis = S.zu.get(drin) || 0;
    if (bis > S.t) { ev(S, 'tor', { typ, grund: 'trocknet', s: Math.ceil(bis - S.t) }); return; }
    if (S.sterne === 0 && heil) { ev(S, 'tor', { typ, grund: 'leer' }); return; }
    const kosten = werkstattKosten(S);
    S.beute -= kosten; S.stat.werkstatt++; S.lack++; S.zu.set(drin, S.t + 60);
    ev(S, 'werkstatt', { kosten, sterne: S.sterne });
  }
  S.fahndung = 0; S.sterne = 0; S.sucht = 0; S.haft = 0; S.peil = 0; S.gesehen = false; sp.hp = sp.hpMax; reifenHeil(S);
  abziehen(S);
  S.pause = 1.6; S.pauseOrt = { v: drin, typ };
  sp.vx = sp.vy = sp.w = 0; sp.lenk = 0;
}
function pauseEnde(S) {
  const { v } = S.pauseOrt, sp = S.sp, rx = Math.cos(v.raus), ry = Math.sin(v.raus);
  sp.x = v.x + rx * 1.2; sp.y = v.y + ry * 1.2; sp.a = v.raus; sp.vx = sp.vy = sp.w = 0;
  S.pauseOrt = null; S.wartet = true; S.ort = v;
  // Platz machen: was vor dem Tor steht, wird weggeräumt
  for (const c of S.autos) if (c !== sp && c.art !== 'parker' && Math.hypot(c.x - sp.x, c.y - sp.y) < 9) c.weg = true;
  raeumen(S);
  ev(S, 'raus', {});
}
function raeumen(S) {
  const autos = S.autos;
  for (let i = autos.length - 1; i > 0; i--) if (autos[i].weg) { const c = autos[i]; for (let q = 0; q < S.res.length; q++) if (S.res[q] && S.res[q].c === c) S.res[q] = null; autos.splice(i, 1); }
}

// ---------------------------------------------------------------- ein Schritt (1/60 s)
// Eingabe e: { lenk: −1..1 (stufenlos), gas: bool, bremse: bool (im Stand: rückwärts), hand: bool (Handbremse), nitro: bool }
export function schritt(S, e) {
  if (S.ende) return;
  if (S.pause > 0) { S.pause -= DT; if (S.pause <= 0) pauseEnde(S); return; }
  if (S.wartet) { if (e.gas || e.lenk || e.nitro || e.hand || e.bremse || e.los) { S.wartet = false; ev(S, 'los', {}); } else return; }
  S.t += DT; S.n++; S.stat.dauer = S.t;
  const sp = S.sp, W = S.W, autos = S.autos;

  // --- Eingabe
  const zl = clamp(e.lenk || 0, -1, 1);
  sp.lenk += clamp(zl - sp.lenk, -9 * DT, 9 * DT);
  sp.gas = e.gas ? 1 : 0; sp.bremse = 0; sp.hand = !!e.hand;
  if (e.bremse) { sp.gas = 0; sp.bremse = 1; }
  if (e.nitro && S.nitro >= 1 && S.nitroT <= 0) { S.nitro = 0; S.nitroT = NITRO_DAUER; S.stat.nitro++; ev(S, 'nitro', {}); }
  if (S.nitroT > 0) { S.nitroT -= DT; if (!e.bremse && !e.hand) sp.gas = 1; }   // Nitro schiebt von selbst, auch wenn der Daumen kurz vom Gas ist
  else S.nitro = Math.min(1, S.nitro + 0.012 * DT);
  sp.nitro = S.nitroT > 0;

  // --- Wegefeld für die Polizei (zum Spieler, solange er gesehen wird, sonst zur letzten bekannten Stelle)
  if (S.sterne > 0 && S.t - S.feldT > 0.35) {
    S.feldT = S.t;
    if (S.gesehen) feldRechnen(W, S.feld, sp.x, sp.y); else feldRechnen(W, S.feld, S.letzte.x, S.letzte.y);
  }

  // --- Fahrer
  for (let i = 1; i < autos.length; i++) {
    const c = autos[i];
    if (c.art === 'polizei') { if (c.modus === 'jagd') polizeiLenken(S, c); else if (c.modus === 'streife' && c.hp > 0) { c.blau = false; c.vmax = 15; c.acc = 6; c.grip = 20; c.tempo = 9.5; verkehrLenken(S, c); } else { c.gas = 0; c.bremse = 0; c.hand = true; c.blau = c.modus === 'sperre'; } }
    else if (c.art === 'verkehr') verkehrLenken(S, c);
    else if (c.art === 'rivale') rivaleLenken(S, c);
  }
  // --- Bewegung und Stöße
  for (let i = 0; i < autos.length; i++) { const c = autos[i]; if (!c.ruht) fahre(S, c); }
  for (let i = 0; i < autos.length; i++) {
    const A = autos[i];
    for (let j = i + 1; j < autos.length; j++) { const B = autos[j]; if (A.ruht && B.ruht) continue; paar(S, A, B); }
  }
  let raus = false;
  for (let i = 0; i < autos.length; i++) {
    const c = autos[i]; if (c.ruht) continue;
    statisch(S, c); weiche(S, c);
    if (bodenBei(W, c.x, c.y) === BODEN.TIEF) {   // ins tiefe Wasser gefahren
      ev(S, 'platsch', { x: c.x, y: c.y, eigen: c === sp });
      if (c === sp) { ende(S, 'wasser'); return; }
      if (c.art === 'polizei' && c.modus === 'jagd') { S.stat.versenkt++; S.stat.schrott++; const bonus = 250 * Math.max(1, S.sterne); S.beute += bonus; ev(S, 'schrott', { x: c.x, y: c.y, bonus, wasser: true }); }
      c.weg = true; raus = true; continue;
    }
    if (c.art === 'parker' || c.art === 'wrack' || (c.art === 'polizei' && c.modus === 'wrack')) { if (c.vx * c.vx + c.vy * c.vy < 0.01 && Math.abs(c.w) < 0.05) { c.vx = c.vy = c.w = 0; c.ruht = true; } }
  }
  if (S.ende) return;

  // --- Sichtkontakt (alle 0,1 s) und Fahndung
  if (S.n % 6 === 0) {
    let ges = false;
    for (let i = 1; i < autos.length; i++) {
      const c = autos[i]; if (c.art !== 'polizei' || c.hp <= 0 || c.modus === 'wrack') continue;
      const dx = c.x - sp.x, dy = c.y - sp.y, d2 = dx * dx + dy * dy;
      if (d2 > SICHT * SICHT) continue;
      if (d2 < 100 || sichtFrei(W, c.x, c.y, sp.x, sp.y)) {
        if (c.modus === 'streife') { if (S.sterne > 0 && d2 < 45 * 45) { c.modus = 'jagd'; ges = true; } }
        else ges = true;
      }
    }
    if (S.heli && S.heli.licht) ges = true;   // im Suchscheinwerfer hilft kein Haus
    if (S.sterne > 0) {
      if (ges && !S.gesehen && S.sucht > 1.5) ev(S, 'entdeckt', {});
      S.gesehen = ges;
    } else S.gesehen = false;
  }
  if (S.sterne > 0) {
    // Peilsender im Koffer: verrät in den ersten Sekunden alle 2 s die Position; so lange läuft die Suchuhr nicht
    if (S.peil > 0) { S.peil -= DT; if (!S.gesehen && S.t - S.peilT > 2) { S.peilT = S.t; S.letzte.x = clamp(sp.x + sp.vx, 52, 678); S.letzte.y = clamp(sp.y + sp.vy, 52, 670); S.suchT = S.t; S.feldT = -9; } }
    if (S.gesehen) { S.sucht = 0; S.fahndung = Math.min(5.99, S.fahndung + DT / 42); S.letzte.x = clamp(sp.x + sp.vx * 1.5, 52, 678); S.letzte.y = clamp(sp.y + sp.vy * 1.5, 52, 670); S.suchT = S.t; }
    else if (S.peil > 0) S.sucht = 0;
    else {
      S.sucht += DT;
      if (S.sucht >= suchzeit(S.sterne)) entkommen(S);
      else if (S.t - S.suchT > 2.5) {   // an der letzten bekannten Stelle ist niemand: Umgebung absuchen
        for (let i = 1; i < autos.length; i++) {
          const c = autos[i];
          if (c.art === 'polizei' && c.modus === 'jagd' && c.hp > 0 && Math.abs(c.x - S.letzte.x) + Math.abs(c.y - S.letzte.y) < 16) {
            const kn = W.knoten[Math.floor(S.r() * W.knoten.length)];
            if (Math.abs(kn.x - S.letzte.x) + Math.abs(kn.y - S.letzte.y) < 170) { S.letzte.x = kn.x; S.letzte.y = kn.y; S.suchT = S.t; S.feldT = -9; }
            break;
          }
        }
      }
    }
  }
  const st = Math.floor(S.fahndung);
  if (st !== S.sterne) { if (st > S.sterne) ev(S, 'stern', { n: st }); S.sterne = st; if (st > S.stat.maxSterne) S.stat.maxSterne = st; }

  // --- Festnahme: wer steht und einen Streifenwagen neben sich hat, wird geschnappt
  let nah = 0;
  if (S.sterne > 0) for (let i = 1; i < autos.length; i++) { const c = autos[i]; if (c.art === 'polizei' && c.modus === 'jagd' && c.hp > 0 && c.dist < 6.5) nah++; }
  const tempo = Math.hypot(sp.vx, sp.vy);
  if (nah > 0 && tempo < 3) S.haft = Math.min(1, S.haft + DT * (0.38 + 0.12 * nah)); else S.haft = Math.max(0, S.haft - DT * 0.8);
  if (S.haft >= 1) { ende(S, 'geschnappt'); return; }

  // --- Driften und haarscharf
  if (sp.rutsch > 3 && tempo > 9) { S.stat.drift += DT; S.driftT += DT; S.nitro = Math.min(1, S.nitro + 0.11 * DT); } else S.driftT = 0;
  for (let i = 1; i < autos.length; i++) {
    const c = autos[i]; if (c.art !== 'verkehr') continue;
    const dx = c.x - sp.x, dy = c.y - sp.y;
    if (dx > 8 || dx < -8 || dy > 8 || dy < -8) { if (c.nahT > 0 && S.t - c.nahT > 0.3) haarscharf(S, c); continue; }
    if (c.nahT > 0) { if (S.t - c.nahT > 0.45) haarscharf(S, c); continue; }
    if (S.t < c.nahAus || tempo < 11) continue;
    const rvx = sp.vx - c.vx, rvy = sp.vy - c.vy; if (rvx * rvx + rvy * rvy < 64) continue;
    // seitlicher Abstand quer zur eigenen Fahrtrichtung
    const fx = sp.vx / tempo, fy = sp.vy / tempo, quer = Math.abs(-dx * fy + dy * fx), laengs = dx * fx + dy * fy;
    if (Math.abs(laengs) < (sp.l + c.l) / 2 && quer < (sp.b + c.b) / 2 + 1.1) c.nahT = S.t;
  }

  // --- Koffer
  for (let i = S.koffer.length - 1; i >= 0; i--) {
    const k = S.koffer[i], dx = k.x - sp.x, dy = k.y - sp.y;
    if (dx * dx + dy * dy > 3.5 * 3.5) continue;
    S.koffer.splice(i, 1);
    S.serie++; S.stat.koffer++; if (S.serie > S.stat.serie) S.stat.serie = S.serie;
    if (k.art === 'yacht' || k.art === 'kai') S.stat.pier++;
    const m = multi(S.serie), betrag = Math.round(k.wert * m / 10) * 10;
    S.beute += betrag; if (k.gold) S.stat.gold++;
    const grund = Math.min(4.2, 1 + 0.5 * (S.serie - 1) + 0.25 * Math.floor(S.stat.koffer / 3));
    const vorher = S.sterne;
    S.fahndung = Math.min(5.99, Math.max(S.fahndung + 0.6, grund));
    S.peil = PEILZEIT; S.peilT = S.t;
    if (vorher === 0) { S.sucht = 0; S.letzte.x = k.x; S.letzte.y = k.y; S.suchT = S.t; S.spawnT = POLIZEI[Math.floor(S.fahndung)].takt - 1.5; S.feldT = -9; }
    ev(S, 'koffer', { x: k.x, y: k.y, betrag, m, art: k.art, serie: S.serie, gold: !!k.gold, name: k.name || KOFFER[k.art].name });
    if (!k.extra) kofferNeu(S);
  }
  orte(S);
  if (S.ende) return;

  // --- Polizei-Taktik und besondere Ziele
  heliSchritt(S);
  for (const q of S.sperren) {   // Nagelband: wer drüberfährt, hat platte Reifen
    const n = q.nagel; if (!n || n.benutzt) continue;
    const ux = n.x1 - n.x0, uy = n.y1 - n.y0, t = clamp(((sp.x - n.x0) * ux + (sp.y - n.y0) * uy) / (ux * ux + uy * uy), 0, 1);
    if (Math.hypot(sp.x - n.x0 - ux * t, sp.y - n.y0 - uy * t) < 1) { n.benutzt = true; if (S.platt <= 0) { sp.vmax *= PLATT.tempo; sp.grip *= PLATT.halt; } S.platt = PLATT.dauer; ev(S, 'platt', { x: sp.x, y: sp.y }); }
  }
  if (S.platt > 0) { S.platt -= DT; if (S.platt <= 0) { reifenHeil(S); ev(S, 'plattEnde', {}); } }
  for (let i = S.deko.length - 1; i >= 0; i--) {   // Absperrgitter fliegen weg
    const q = S.deko[i];
    for (const c of autos) {
      if (c.ruht || Math.abs(c.x - q.x) > 4 || Math.abs(c.y - q.y) > 4 || c.vx * c.vx + c.vy * c.vy < 9) continue;
      let hit = false; for (let k = -1; k <= 1 && !hit; k++) hit = Math.hypot(c.x + Math.cos(c.a) * c.hl * k - q.x, c.y + Math.sin(c.a) * c.hl * k - q.y) < c.r + q.r;
      if (!hit) continue;
      c.vx *= 0.96; c.vy *= 0.96; ev(S, 'deko', { bild: q.bild, x: q.x, y: q.y, rot: q.rot, g: q.g, vx: c.vx, vy: c.vy, eigen: c === sp });
      S.deko.splice(i, 1); break;
    }
  }
  if (S.n % 15 === 7) {
    sperrenPflegen(S); ereignisse(S);
    if (S.sterne >= 3 && (S.gesehen || S.peil > 0) && S.t >= S.sperreT && S.sperren.length < (S.sterne >= 5 ? 2 : 1)) S.sperreT = S.t + (sperreNeu(S) ? SPERRE_TAKT[S.sterne] + S.r() * 6 : 1.5);
  }

  // --- Nachschub
  if (S.sterne > 0) {
    S.spawnT += DT;
    const P = POLIZEI[S.sterne];
    if (S.spawnT >= P.takt) {
      let n = 0; for (const c of autos) if (c.art === 'polizei' && c.modus === 'jagd' && c.hp > 0) n++;
      if (n < P.n && polizeiNeu(S)) S.spawnT = 0;
    }
  }
  if (S.n % 30 === 0) {
    const R = S.sichtweite; let nv = 0;
    for (let i = 1; i < autos.length; i++) {
      const c = autos[i]; if (c.art === 'parker') continue;
      const d = Math.abs(c.x - sp.x) + Math.abs(c.y - sp.y);
      if (c.art === 'verkehr') { nv++; if (d > R + 150 && !c.transporter) { c.weg = true; raus = true; } }
      else if (c.art === 'wrack') { if (d > R + 70) { c.weg = true; raus = true; } }
      else if (c.art === 'polizei') {
        if (c.modus === 'sperre') continue;
        if (c.modus === 'wrack' ? d > R + 60 && S.t - c.wrackT > 12 : c.modus === 'streife' ? d > R + 150 : d > R + 170 || (c.klemm >= 4 && d > R + 20)) { c.weg = true; raus = true; }
      }
    }
    if (nv < S.verkehr) verkehrNeu(S);
  }
  if (raus || S.n % 30 === 0) raeumen(S);

  // --- Aufträge
  if (S.n % 15 === 0) auftraegePruefen(S);
}
function haarscharf(S, c) {
  c.nahT = 0; c.nahAus = S.t + 4;
  const bonus = 50 * Math.max(1, S.sterne);
  S.stat.haarscharf++; S.beute += bonus; S.nitro = Math.min(1, S.nitro + 0.16);
  ev(S, 'haarscharf', { x: c.x, y: c.y, bonus });
}

// ---------------------------------------------------------------- Prüf-Fahrer (für Tests und Balance): fährt Koffer an und sichert im Versteck
export function neuerBot(o = {}) { return { feld: neuesFeld(), ziel: null, gier: o.gier ?? 2, zurueck: 0, steht: 0, lenk: 1, nitro: o.nitro ?? true }; }
export function botEingabe(S, B) {
  const sp = S.sp, W = S.W, e = { lenk: 0, gas: true, bremse: false, hand: false, nitro: false };
  const v = Math.hypot(sp.vx, sp.vy);
  // Ziel wählen
  let ziel = null, tor = null;
  const heim = S.serie >= B.gier || (S.beute > 0 && (S.sterne >= 3 || sp.hp < sp.hpMax * 0.45));
  if (heim) {
    let bd = INF;
    for (const h of W.verstecke) { const d = Math.hypot(h.x - sp.x, h.y - sp.y); if (d < bd) { bd = d; tor = h; } }
    const rx = Math.cos(tor.raus), ry = Math.sin(tor.raus), u = (sp.x - tor.x) * rx + (sp.y - tor.y) * ry, w = Math.abs(-(sp.x - tor.x) * ry + (sp.y - tor.y) * rx);
    ziel = u > 3 && w < 5 ? { x: tor.x - rx * 1.5, y: tor.y - ry * 1.5, id: 'tor' } : { x: tor.x + rx * 13, y: tor.y + ry * 13, id: 'vor' + tor.name };
  } else {
    let bd = INF;
    for (const k of S.koffer) { const d = Math.hypot(k.x - sp.x, k.y - sp.y); if (d < bd) { bd = d; ziel = { x: k.x, y: k.y, id: 'k' + k.id }; } }
  }
  if (!B.ziel || B.ziel.id !== ziel.id) { B.ziel = ziel; feldRechnen(W, B.feld, ziel.x, ziel.y, NX); }
  if (B.zurueck > 0) { B.zurueck -= DT; e.bremse = true; e.lenk = B.lenk; return e; }
  if (v < 1.2 && !S.wartet) { B.steht += DT; if (B.steht > 0.8) { B.steht = 0; B.zurueck = 0.9; B.lenk = S.r() < 0.5 ? -1 : 1; } } else B.steht = 0;
  let tx = ziel.x, ty = ziel.y;
  const dz = Math.hypot(ziel.x - sp.x, ziel.y - sp.y);
  if (!(dz < 22 && wegFrei(W, sp.x, sp.y, ziel.x, ziel.y))) { const m = moehre(W, B.feld, sp.x, sp.y, 3 + Math.floor(v / 4)); if (m) { tx = m.x; ty = m.y; } }
  const ang = wrap(Math.atan2(ty - sp.y, tx - sp.x) - sp.a), aa = Math.abs(ang);
  e.lenk = clamp(ang * 2.6, -1, 1);
  if (aa > 1.2 && v > 11) e.hand = true; else if (aa > 0.7 && v > 13) e.bremse = true;
  if (ziel.id === 'tor' && v > 9) e.bremse = true;
  if (B.nitro && S.nitro >= 1 && S.sterne >= 2 && aa < 0.2) e.nitro = true;
  return e;
}
