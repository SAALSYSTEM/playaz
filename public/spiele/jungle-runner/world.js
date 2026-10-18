// JUNGLE RUNNER: Strecke und Landschaft in Stücken (je 36 m). Jedes Stück ist eine einzige verschmolzene Low-Poly-Geometrie.
// Alles hier ist prozedural und vorläufig (siehe docs/JUNGLE_RUNNER.md). Die Sichtmaße stimmen mit den Trefferflächen der Simulation überein.
import { laneX, OB, groundH } from './sim.js';
import { MB, G, hash3, shade, mix } from './geo.js';
import { WORLDS } from './levels.js';

const T = window.THREE;
export const CH = 36;
export const PATH0 = -14;
const TILE = 2.2;

export const worldFor = (level, z) => (level.endless ? WORLDS[Math.floor(Math.max(0, z) / 700) % WORLDS.length] : WORLDS[level.world]);
const pathEnd = (level) => (level.endless ? 1e9 : level.len + 34);
const lowerZ = (arr, z) => { let a = 0, b = arr.length; while (a < b) { const m = (a + b) >> 1; if (arr[m].z < z) a = m + 1; else b = m; } return a; };

// feste Teile eines Wasser-/Boden-Profils in [a,b]
function solid(level, lane, a, b) {
  const out = []; let cur = a;
  for (const g of level.ground[lane]) {
    if (g.t !== 'water') continue;
    if (g.z1 <= a) continue; if (g.z0 >= b) break;
    if (g.z0 > cur) out.push([cur, Math.min(g.z0, b)]);
    cur = Math.max(cur, g.z1); if (cur >= b) break;
  }
  if (cur < b) out.push([cur, b]);
  return out;
}
const waterAt = (level, lane, z) => groundH(level, lane, z) === null;
const Z = (z) => -z;                                  // Sim-z → three-z

// ---------------------------------------------------------------- Pflanzen und Dekor
function blade(b, px, py, pz, yaw, pitch, len, w, color) {      // Blatt, das vom Punkt aus nach vorn (−z, gedreht um yaw) zeigt
  const h = len / 2, cp = Math.cos(pitch);
  b.box(px - h * cp * Math.sin(yaw), py + h * Math.sin(pitch), pz - h * cp * Math.cos(yaw), w, 0.045, len, color, pitch, yaw, 0, 0.1);
}
function palm(b, x, z, h, W, r) {
  const lean = (r() - 0.5) * 0.5, segs = 5;
  let cx = x, cy = 0;
  for (let i = 0; i < segs; i++) {
    const sh = h / segs, nx = cx + lean * 0.25;
    b.cyl((cx + nx) / 2, cy + sh / 2, Z(z), 0.42 - i * 0.04, sh * 1.08, 0.42 - i * 0.04, i % 2 ? W.trunk : shade(W.trunk, 0.12), 0, 0, (cx - nx) * 0.5, 7);
    cx = nx; cy += sh;
  }
  const n = 8, base = r() * 6;
  for (let i = 0; i < n; i++) blade(b, cx, cy, Z(z), base + (i * Math.PI * 2) / n, -0.25 - r() * 0.45, 2.3 + r() * 0.7, 0.55, W.leaves[(i + (r() * 3 | 0)) % W.leaves.length]);
  b.ico(cx, cy - 0.15, Z(z), 0.5, 0.35, 0.5, 0x5a3a1c);
  if (r() < 0.6) { b.sph(cx + 0.2, cy - 0.4, Z(z) + 0.1, 0.32, 0.32, 0.32, 0x6b4423, 7); b.sph(cx - 0.15, cy - 0.42, Z(z) - 0.12, 0.3, 0.3, 0.3, 0x6b4423, 7); }
}
function tree(b, x, z, h, W, r) {
  const w = 0.55 + h * 0.07;
  b.tex('rinde').cyl(x, h * 0.4, Z(z), w, h * 0.8, w, W.trunk, 0, 0, (r() - 0.5) * 0.08, 8).tex('');
  b.cone(x, 0.1, Z(z), w * 2.2, h * 0.3, w * 2.2, W.trunk, 0, 0, 0, 8);          // Wurzelansatz
  const R = 2.0 + h * 0.2;
  for (let i = 0; i < 4; i++) b.ico(x + (r() - 0.5) * R * 0.9, h * 0.85 + r() * R * 0.5, Z(z) + (r() - 0.5) * R * 0.9, R * (0.9 + r() * 0.5), R * (0.7 + r() * 0.3), R * (0.9 + r() * 0.5), W.leaves[(r() * W.leaves.length) | 0], r() * 3, r() * 3, 0, 0);
  if (r() < 0.5) b.cyl(x + 0.6, h * 0.55, Z(z) - 0.5, 0.08, h * 0.5, 0.08, 0x3f7a35, 0, 0, 0.1, 5);            // Liane
}
function acacia(b, x, z, h, W, r) {
  b.cyl(x, h / 2, Z(z), 0.4, h, 0.4, W.trunk, 0, 0, (r() - 0.5) * 0.25, 7);
  const R = 2.6 + r() * 1.4;
  b.ico(x, h + 0.2, Z(z), R * 2, 0.7, R * 2, W.leaves[(r() * W.leaves.length) | 0], 0, r() * 3, 0, 0, 0.05);
  b.ico(x + 0.8, h + 0.55, Z(z) - 0.6, R * 1.2, 0.5, R * 1.2, W.leaves[(r() * W.leaves.length) | 0], 0, r() * 3, 0, 0, 0.05);
}
function bush(b, x, z, s, W, r) {
  for (let i = 0; i < 3; i++) b.ico(x + (r() - 0.5) * s, s * 0.28 + r() * 0.1, Z(z) + (r() - 0.5) * s, s * (0.7 + r() * 0.4), s * (0.55 + r() * 0.3), s * (0.7 + r() * 0.4), W.leaves[(r() * W.leaves.length) | 0], r() * 3, r() * 3, 0, 0);
}
function fern(b, x, z, s, W, r) {                          // große Blätter
  const n = 7, base = r() * 6;
  for (let i = 0; i < n; i++) blade(b, x, 0.18 * s + 0.1, Z(z), base + (i * Math.PI * 2) / n, 0.35 + r() * 0.25, 1.5 * s, 0.7 * s, W.leaves[(i + 1) % W.leaves.length]);
}
function flowers(b, x, z, W, r) {
  for (let i = 0; i < 5; i++) {
    const fx = x + (r() - 0.5) * 1.4, fz = z + (r() - 0.5) * 1.4, h = 0.3 + r() * 0.3;
    b.cyl(fx, h / 2, Z(fz), 0.04, h, 0.04, 0x3c8a3a, 0, 0, 0, 4);
    b.sph(fx, h + 0.04, Z(fz), 0.2, 0.14, 0.2, W.flowers[(r() * W.flowers.length) | 0], 6, 0.05);
  }
}
function rocks(b, x, z, s, r, tint) {
  const c = tint || 0x8e8b84;
  b.tex('stein').put(G.dode(), x, s * 0.3, Z(z), s * 1.5, s * 0.9, s * 1.3, c, r() * 3, r() * 3, 0);
  if (r() < 0.7) b.put(G.dode(), x + s * 0.9, s * 0.18, Z(z) + 0.4, s * 0.8, s * 0.5, s * 0.7, shade(c, 0.1), r() * 3, r() * 3, 0);
  b.tex('');
  b.ico(x, s * 0.72, Z(z), s * 1.0, s * 0.25, s * 0.9, 0x5ea352, 0, r() * 3, 0, 0);          // Moos
}
function pillar(b, x, z, h, W, r, broken) {
  const c = W.tile[0], d = shade(c, -0.15);
  b.tex('pfad');
  b.box(x, 0.2, Z(z), 1.5, 0.4, 1.5, d);
  b.box(x, h / 2 + 0.4, Z(z), 1.0, h, 1.0, c);
  if (!broken) { b.box(x, h + 0.55, Z(z), 1.4, 0.3, 1.4, d); b.box(x, h + 0.8, Z(z), 1.15, 0.2, 1.15, c); }
  else { b.box(x + 0.3, h + 0.45, Z(z) + 0.1, 0.55, 0.25, 0.5, shade(c, -0.05), 0.2, 0.5, 0.3); b.box(x + 1.1, 0.35, Z(z) + 0.8, 0.9, 0.6, 0.8, c, 0.1, 0.7, 0.1); }
  b.tex('').ico(x, 0.55, Z(z), 1.25, 0.3, 1.25, 0x5ea352, 0, 0, 0, 0);
  b.box(x, h * 0.55 + 0.4, Z(z) - 0.505, 0.25, 0.9, 0.02, W.curb);                           // Ritzmuster
  b.box(x, h * 0.55 + 0.4, Z(z) - 0.506, 0.7, 0.14, 0.02, 0xe0b72f);
}
function ruinWall(b, x, z, W, r) {
  const c = W.tile[1], n = 3 + ((r() * 3) | 0);
  b.tex('pfad');
  for (let i = 0; i < n; i++) b.box(x, 0.45 + i * 0.5, Z(z) + (r() - 0.5) * 0.15, 3.2 - i * 0.3, 0.5, 0.8, i % 2 ? shade(c, 0.08) : c);
  b.tex('');
  b.ico(x, n * 0.5 + 0.2, Z(z), 2.4, 0.3, 0.8, 0x5ea352, 0, 0, 0, 0);
}
function spire(b, x, z, h, W, r) {
  b.put(G.cone(6), x, h / 2, Z(z), 3 + r() * 3, h, 3 + r() * 3, W.mount, 0, r() * 3, 0, 0.1);
  b.put(G.cone(6), x + 2, h * 0.3, Z(z) + 1, 2.5, h * 0.6, 2.5, shade(W.mount, 0.12), 0, r() * 3, 0, 0.1);
}
function reeds(b, x, z, W, r) {
  for (let i = 0; i < 9; i++) { const h = 0.9 + r() * 0.9; b.cone(x + (r() - 0.5) * 0.9, h / 2, Z(z) + (r() - 0.5) * 0.9, 0.09, h, 0.09, W.leaves[(i + 2) % W.leaves.length], (r() - 0.5) * 0.4, 0, (r() - 0.5) * 0.4, 4); }
  b.cyl(x + 0.1, 0.55, Z(z), 0.09, 1.1, 0.09, 0x7a4f2a, 0, 0, 0, 5); b.cyl(x + 0.1, 1.15, Z(z), 0.16, 0.3, 0.16, 0x5a3a1c, 0, 0, 0, 6);
}
function tuft(b, x, z, W, r) {
  for (let i = 0; i < 6; i++) { const h = 0.4 + r() * 0.5; b.cone(x + (r() - 0.5) * 0.7, h / 2, Z(z) + (r() - 0.5) * 0.7, 0.1, h, 0.1, W.leaves[(r() * W.leaves.length) | 0], (r() - 0.5) * 0.5, 0, (r() - 0.5) * 0.5, 4, 0.1); }
}
function waterfall(b, x, z, side, W) {
  const rock = shade(W.mount, -0.1);
  b.put(G.dode(), x, 6, Z(z), 9, 12, 8, rock, 0, 0.4, 0);
  b.put(G.dode(), x - side * 3, 4, Z(z) - 3, 6, 8, 6, shade(rock, 0.1), 0, 1.1, 0);
  b.box(x - side * 3.6, 5.5, Z(z) + 0.3, 2.2, 9.5, 0.35, 0xeaffff, 0, 0, 0, 0.03);
  b.box(x - side * 3.6, 0.35, Z(z) + 0.9, 3.6, 0.5, 2.4, 0xffffff, 0, 0, 0, 0.1);
}

// ---------------------------------------------------------------- Hindernisse
function obstacle(b, o, W, ci) {
  const x = laneX(o.lane), z = Z(o.z);
  const hs = (k) => hash3(Math.round(o.z * 10), o.lane + 5, k);
  switch (o.k) {
    case 'log': {
      const c = 0x8a5a2f;
      b.tex('rinde').cyl(x, 0.25, z, 1.2, 1.9, 1.2, c, 0, 0, Math.PI / 2, 10).tex('');
      b.tex('schnitt'); for (const sx of [-1, 1]) b.cyl(x + sx * 0.955, 0.25, z, 1.12, 0.06, 1.12, 0xe0b980, 0, 0, Math.PI / 2, 10, 0.02); b.tex('');
      b.cyl(x, 0.25, z - 0.35, 0.3, 1.88, 0.2, shade(c, -0.25), 0, 0, Math.PI / 2, 5);
      b.ico(x - 0.3, 0.83, z + 0.1, 0.7, 0.18, 0.5, 0x5ea352, 0, 0.3, 0, 0);
      b.cyl(x + 0.5, 0.86, z + 0.05, 0.12, 0.1, 0.12, 0x3a2412, 0, 0, 0, 5);
      break;
    }
    case 'hang': {
      const c = 0x7d5128;
      b.tex('rinde').cyl(x, 1.65, z, 1.2, 1.9, 1.2, c, 0, 0, Math.PI / 2, 10).tex('');
      for (const sx of [-1, 1]) {
        b.tex('schnitt').cyl(x + sx * 0.955, 1.65, z, 1.12, 0.06, 1.12, 0xe0b980, 0, 0, Math.PI / 2, 10, 0.02).tex('');
        b.cyl(x + sx * 1.07, 1.45, z, 0.26, 2.9, 0.26, shade(c, -0.1), 0, 0, sx * -0.04, 6);              // Stützstamm außen
        b.cyl(x + sx * 1.1, 0.04, z, 0.5, 0.14, 0.5, shade(c, -0.2), 0, 0, 0, 6);
      }
      for (let i = 0; i < 4; i++) b.ico(x + (hs(i) - 0.5) * 1.6, 2.3 + hs(i + 5) * 0.2, z + (hs(i + 9) - 0.5) * 0.5, 0.7, 0.3, 0.6, W.leaves[i % W.leaves.length], hs(i) * 3, hs(i + 3) * 3, 0, 0);
      b.cyl(x - 0.4, 0.98, z + 0.1, 0.05, 0.14, 0.05, 0x3f8a3a, 0, 0, 0, 4);
      break;
    }
    case 'rock': {
      const c = 0x93908a;
      b.tex('stein').put(G.dode(), x, 0.7, z, 1.9, 1.65, 1.65, c, 0.3, hs(1) * 3, 0.2);
      b.put(G.dode(), x + 0.45, 0.35, z - 0.4, 1.0, 0.7, 0.9, shade(c, 0.1), 0.2, hs(2) * 3, 0);
      b.tex('');
      b.ico(x - 0.2, 1.4, z, 1.0, 0.28, 0.9, 0x5ea352, 0, 0, 0, 0);
      b.ico(x + 0.6, 1.25, z + 0.3, 0.5, 0.2, 0.4, 0x6dbd5a, 0, 0, 0, 0);
      break;
    }
    case 'root': {
      b.ico(x, 0.12, z, 1.7, 0.4, 0.9, 0x6a4a2a, 0, 0, 0, 0);
      for (const [dx, rz] of [[-0.5, 0.5], [0.3, -0.6], [0.0, 0.1]]) b.cyl(x + dx, 0.22, z, 0.2, 1.4, 0.2, 0x7a5430, Math.PI / 2 + 0.3 * rz, 0.2 * rz, 0.9 * rz, 6);
      break;
    }
    case 'mud': {
      const w = 1.9, len = o.len;
      b.tex('schlamm').box(x, 0.02, z, w, 0.04, len, 0x6b4a2e, 0, 0, 0, 0.12);
      b.box(x, 0.045, z, w - 0.3, 0.02, len - 0.4, 0x7c583a, 0, 0, 0, 0.18);
      b.tex('');
      for (let i = 0; i < 6; i++) b.sph(x + (hs(i) - 0.5) * 1.4, 0.06, z + (hs(i + 20) - 0.5) * (len - 1), 0.22, 0.1, 0.22, 0x8a6544, 6, 0.05);
      break;
    }
    case 'wind': {
      const zs = Z(o.z + o.len / 2), ze = Z(o.z - o.len / 2);
      // Schild am Anfang der Zone und Fahnen entlang des Weges
      for (const sx of [-1, 1]) {
        b.cyl(sx * 3.75, 1.6, zs, 0.14, 3.2, 0.14, 0x6a4a2a, 0, 0, 0, 6);
        b.box(sx * 3.75, 2.9, zs, 0.1, 0.9, 1.6, 0xfff1c9);
        for (let k = 0; k < 3; k++) b.box(sx * 3.75, 2.9, zs + 0.45 - k * 0.45, 0.14, 0.16, 0.34, 0x2f9be8, 0, 0, 0.3 * k - 0.3);
      }
      for (let zz = zs; zz > ze; zz -= 8) for (const sx of [-1, 1]) { b.cyl(sx * 3.9, 1.4, zz, 0.08, 2.8, 0.08, 0x6a4a2a, 0, 0, 0, 5); b.box(sx * 3.9, 2.55, zz - 0.5, 0.04, 0.4, 1.1, sx < 0 ? 0xff6b81 : 0xffd23f, 0, -0.15, 0); }
      break;
    }
    default: break;
  }
}

// ---------------------------------------------------------------- Bauwerke: Start, Ziel, Checkpoint, Tor
function gateFrame(b, z, W) {
  const zz = Z(z), c = W.tile[0], d = shade(c, -0.18), gold = 0xe8b82a;
  for (const x of [-3.3, -1.1, 1.1, 3.3]) { b.box(x, 3.0, zz, 0.4, 6.0, 1.0, c); b.box(x, 0.2, zz, 0.95, 0.4, 1.25, d); b.box(x, 6.05, zz, 0.9, 0.2, 1.2, d); }
  b.box(0, 6.3, zz, 7.9, 0.8, 1.1, c); b.box(0, 6.78, zz, 8.2, 0.2, 1.3, d); b.box(0, 6.3, zz - 0.57, 6.8, 0.14, 0.04, gold);
  for (const x of [-2.2, 0, 2.2]) b.cone(x, 7.15, zz, 0.7, 0.8, 0.7, gold, 0, 0, 0, 4);
  for (const sx of [-1, 1]) { b.box(sx * 6.4, 1.5, zz, 5.2, 3.0, 1.0, shade(c, 0.05)); b.box(sx * 6.4, 3.1, zz, 5.4, 0.25, 1.2, d); b.ico(sx * 6.4, 3.3, zz, 3.2, 0.3, 0.9, 0x5ea352, 0, 0, 0, 0); }
}
function startArch(b, z, W) {
  const zz = Z(z), w = 0x8a5a2f;
  for (const sx of [-1, 1]) { b.cyl(sx * 3.7, 2.4, zz, 0.45, 4.8, 0.45, w, 0, 0, 0, 7); b.cyl(sx * 3.7, 0.1, zz, 0.9, 0.22, 0.9, shade(w, -0.2), 0, 0, 0, 7); }
  b.box(0, 4.7, zz, 8.2, 0.55, 0.6, shade(w, 0.1));
  for (let i = 0; i < 8; i++) b.cone(-3.5 + i, 5.1, zz, 0.35, 0.6, 0.35, W.leaves[i % W.leaves.length], 0, 0, 0.1 * (i % 3 - 1), 5);
  b.ico(-3.5, 4.9, zz, 1.4, 0.6, 1, W.leaves[0], 0, 0, 0, 0); b.ico(3.5, 4.9, zz, 1.4, 0.6, 1, W.leaves[1], 0, 0, 0, 0);
}
function finishArch(b, z, W, level) {
  const zz = Z(z), gold = 0xf5b81f, c = level.id === 30 ? 0xf0cf72 : W.tile[0], d = shade(c, -0.2);
  const big = level.id % 6 === 0;
  const H = big ? 8.5 : 6.2;
  for (const sx of [-1, 1]) { b.box(sx * 3.9, H / 2, zz, 1.0, H, 1.2, c); b.box(sx * 3.9, 0.25, zz, 1.4, 0.5, 1.6, d); b.box(sx * 3.9, H + 0.1, zz, 1.3, 0.3, 1.5, d); if (big) b.cone(sx * 3.9, H + 0.9, zz, 1.0, 1.6, 1.0, gold, 0, 0, 0, 4); }
  b.box(0, H, zz, 8.8, 1.3, 1.3, c); b.box(0, H + 0.75, zz, 9.2, 0.25, 1.5, d); b.box(0, H, zz - 0.68, 8.0, 0.2, 0.05, gold);
  const n = 8; for (let i = 0; i < n; i++) b.box(-3.8 + (i + 0.5) * (7.6 / n), H - 0.0, zz - 0.69, 7.6 / n - 0.02, 0.5, 0.04, i % 2 ? 0x14182e : 0xffffff);
  for (let i = 0; i < 8; i++) for (let j = 0; j < 2; j++) b.box(-3.5 + i * 1.0, 0.02, zz + (j - 0.5) * 0.5, 1.0, 0.03, 0.5, (i + j) % 2 ? 0x14182e : 0xffffff);
  if (level.id === 30) {                                                   // goldene Zielpforte: Tempelfassade dahinter
    for (let s = 0; s < 5; s++) b.box(0, 0.6 + s * 1.2, zz - 14 - s * 2.2, 22 - s * 3.4, 1.2, 8 - s * 1.2, s % 2 ? gold : 0xf8da7a);
    b.cone(0, 8.6, zz - 24, 4, 4.5, 4, gold, 0, 0.8, 0, 4);
    for (const sx of [-1, 1]) for (let k = 0; k < 3; k++) { b.cyl(sx * (8 + k * 3), 3.2, zz - 8 - k * 4, 1.1, 6.4, 1.1, 0xf0cf72, 0, 0, 0, 8); b.cyl(sx * (8 + k * 3), 6.5, zz - 8 - k * 4, 1.5, 0.35, 1.5, gold, 0, 0, 0, 8); }
  } else if (big) {
    for (const sx of [-1, 1]) for (let k = 0; k < 2; k++) pillar(b, sx * (7.5 + k * 3.5), z + 10 + k * 5, 4.5 - k, W, () => 0.5, false);
  }
}
function checkpoint(b, z, W) {
  const zz = Z(z), w = 0x8a5a2f;
  for (const sx of [-1, 1]) {
    b.cyl(sx * 3.75, 1.8, zz, 0.22, 3.6, 0.22, w, 0, 0, 0, 6);
    b.box(sx * 3.75, 3.4, zz, 0.05, 0.9, 1.4, 0x2dbd5a, 0, 0, 0); b.box(sx * 3.75, 3.4, zz - 0.4, 0.07, 0.35, 0.35, 0xffffff, 0, 0, 0.7);
    b.sph(sx * 3.75, 3.75, zz, 0.3, 0.3, 0.3, 0xffd23f, 6);
  }
  b.box(0, 0.015, zz, 6.6, 0.03, 0.4, 0x7dffb0, 0, 0, 0, 0.03);
}

// ---------------------------------------------------------------- Stück bauen
export function buildChunk(level, ci, o = {}) {
  const a = ci * CH, bz = a + CH, W = worldFor(level, a + CH / 2), deco = o.deco === undefined ? 1 : o.deco;
  const b = new MB();
  const r = (() => { let s = (hash3(level.id + 11, ci, 99) * 4294967296) >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); })();
  const pe = pathEnd(level), p0 = Math.max(a, PATH0), p1 = Math.min(bz, pe);
  const gt = W.tile, bridgeZ = [];
  // Brücken: Wasser neben der Mittelspur
  for (const lane of [0, 2]) for (const g of level.ground[lane]) if (g.t === 'water' && g.z1 - g.z0 >= 10 && g.z1 > a && g.z0 < bz && !waterAt(level, 1, (g.z0 + g.z1) / 2)) bridgeZ.push([g.z0, g.z1, lane]);
  // Wegplatten
  if (p1 > p0) for (let lane = 0; lane < 3; lane++) {
    const x = laneX(lane);
    for (const [s0, s1] of solid(level, lane, p0, p1)) {
      const n = Math.max(1, Math.round((s1 - s0) / TILE)), len = (s1 - s0) / n;
      for (let i = 0; i < n; i++) {
        const z0 = s0 + i * len, zc = z0 + len / 2, br = lane === 1 && bridgeZ.some((q) => zc >= q[0] - 1 && zc <= q[1] + 1);
        const col = br ? (i % 2 ? 0xa57a4a : 0x946a3c) : ((i + lane) % 2 ? gt[0] : gt[1]);
        b.tex(br ? 'holz' : 'pfad').box(x, -0.6, Z(zc), 2.14, 1.2, len - 0.05, col, 0, 0, 0, br ? 0.08 : 0.05).tex('');
        const hh = hash3(ci, lane * 50 + i, 3);
        if (!br && hh < 0.14) b.box(x + (hh - 0.07) * 8, 0.012, Z(zc) + (hh * 30 % 1 - 0.5), 0.55, 0.02, 0.45, 0x5ea352, 0, hh * 6, 0, 0.1);
        else if (!br && hh > 0.9) b.box(x + (hh - 0.95) * 10, 0.012, Z(zc), 0.7, 0.02, 0.05, shade(col, -0.35), 0, hh * 9, 0, 0);
        if (br) b.box(x, 0.01, Z(zc), 2.1, 0.02, 0.06, shade(col, -0.4));
      }
    }
  }
  // Ränder, Wiese, Hügel
  const grass = W.ground, dirt = 0x7a5a3a;
  const bank = (lane, side) => {
    const parts = (p1 > p0) ? solid(level, lane, p0, p1) : [];
    for (const [s0, s1] of parts) {
      const n = Math.max(1, Math.round((s1 - s0) / 6)), len = (s1 - s0) / n;
      for (let i = 0; i < n; i++) {
        const zc = s0 + i * len + len / 2, cx = side * (3.6 + 33.5);
        b.tex('gras').box(cx, -0.225, Z(zc), 67, 0.25, len + 0.02, hash3(ci, i + lane * 9, 5) < 0.5 ? grass : W.ground2, 0, 0, 0, 0.05).tex('');
        b.box(cx, -0.85, Z(zc), 67, 1.0, len + 0.02, dirt, 0, 0, 0, 0.04);
      }
      // Randsteine
      const m = Math.max(1, Math.round((s1 - s0) / 2.0)), cl = (s1 - s0) / m;
      for (let i = 0; i < m; i++) { const zc = s0 + i * cl + cl / 2; b.box(side * 3.55, 0.13, Z(zc), 0.34, 0.3, cl - 0.12, i % 2 ? W.curb : shade(W.curb, 0.1), 0, 0, 0, 0.08); }
    }
  };
  bank(0, -1); bank(2, 1);
  // vor dem Start und hinter dem Ziel: Wiese über die ganze Breite
  const full = (z0, z1) => { if (z1 - z0 < 0.01) return; b.tex('gras').box(0, -0.225, Z((z0 + z1) / 2), 140, 0.25, z1 - z0 + 0.02, grass).tex(''); b.box(0, -0.85, Z((z0 + z1) / 2), 140, 1.0, z1 - z0 + 0.02, dirt); };
  if (a < PATH0) full(a, Math.min(bz, PATH0));
  if (bz > pe) full(Math.max(a, pe), bz);
  // Brückengeländer aus Seil und Pfosten
  for (const [z0, z1, lane] of bridgeZ) {
    const sx = lane === 0 ? -1 : 1, s0 = Math.max(z0, a), s1 = Math.min(z1, bz);
    for (let zz = Math.ceil(s0 / 3.6) * 3.6; zz < s1; zz += 3.6) {
      b.cyl(sx * 1.2, 0.55, Z(zz), 0.14, 1.1, 0.14, 0x6a4a2a, 0, 0, 0, 5);
      b.box(sx * 1.2, 0.95, Z(zz + 1.8), 0.05, 0.05, 3.6, 0xd9b77a); b.box(sx * 1.2, 0.5, Z(zz + 1.8), 0.05, 0.05, 3.6, 0xd9b77a);
    }
  }
  // begehbare Stämme
  for (const lane of [0, 1, 2]) for (const g of level.ground[lane]) {
    if (g.t !== 'log' || g.z1 < a || g.z0 >= bz) continue;
    const x = laneX(lane), h = g.h, ramp = g.ramp, c = 0x8a5a2f, R = 0.95;
    const m0 = g.z0 + ramp, m1 = g.z1 - ramp;
    b.tex('rinde').cyl(x, h - R * 0.92, Z((m0 + m1) / 2), R * 2, m1 - m0, R * 2, c, Math.PI / 2, 0, 0, 8);
    b.cyl(x, h - R * 0.92, Z((m0 + m1) / 2), R * 2.04, m1 - m0 - 0.5, R * 2.04, shade(c, -0.15), Math.PI / 2, 0, 0, 8);
    b.tex('schnitt'); for (const zz of [m0, m1]) b.cyl(x, h - R * 0.92, Z(zz), R * 1.9, 0.08, R * 1.9, 0xe0b980, Math.PI / 2, 0, 0, 8, 0.02); b.tex('');
    for (let i = 0; i < 3; i++) b.box(x + (hash3(Math.round(g.z0), i, 8) - 0.5) * 0.5, h + 0.03, Z(m0 + ((i + 0.6) * (m1 - m0)) / 3), 0.5, 0.05, 0.9, 0x5ea352, 0, 0, 0, 0.1);
    // Rampen (schräge Bretter)
    const ang = Math.atan2(h, ramp), L = Math.hypot(ramp, h);
    b.tex('holz'); for (const [zA, dir] of [[g.z0, 1], [g.z1, -1]]) b.box(x, h / 2, Z(zA + (dir * ramp) / 2), 1.8, 0.2, L, 0xa9753f, dir * -ang * -1, 0, 0, 0.08); b.tex('');
    b.box(x, h * 0.5 - 0.12, Z((g.z0 + g.z1) / 2), 1.3, 0.12, g.z1 - g.z0 - 0.6, 0x3a2a18, 0, 0, 0, 0);
  }
  // Hindernisse
  for (let i = lowerZ(level.obs, a - 0.001); i < level.obs.length && level.obs[i].z < bz; i++) { const ob = level.obs[i]; if (ob.z >= a) obstacle(b, ob, W, ci); }
  // Tor-Rahmen
  const seenGate = new Set();
  for (let i = lowerZ(level.dyn, a - 0.001); i < level.dyn.length && level.dyn[i].z < bz; i++) { const d = level.dyn[i]; if (d.k === 'gate' && d.z >= a && !seenGate.has(d.z)) { seenGate.add(d.z); gateFrame(b, d.z, W); } }
  // Checkpoints, Start und Ziel
  for (const cp of level.cps) if (cp >= a && cp < bz) checkpoint(b, cp, W);
  if (a <= 2 && bz > 2) startArch(b, 2, W);
  if (!level.endless && level.len >= a && level.len < bz) finishArch(b, level.len, W, level);
  // Dekor
  const dn = Math.round(11 * deco);
  const pr = hash3(level.id, ci, 17);
  for (const side of [-1, 1]) {
    // Wegbegleiter (kleine Pflanzen direkt am Rand)
    for (let k = 0; k < Math.round(6 * deco); k++) {
      const z = a + r() * CH, x = side * (4.3 + r() * 1.8);
      if (z > pe || z < PATH0 || waterAt(level, side < 0 ? 0 : 2, z)) continue;
      const t = r();
      if (t < 0.4) tuft(b, x, z, W, r); else if (t < 0.7) flowers(b, x, z, W, r); else if (t < 0.85) fern(b, x, z, 0.8, W, r); else rocks(b, x, z, 0.5, r);
    }
    for (let k = 0; k < dn; k++) {
      const z = a + r() * CH, x = side * (6.5 + r() * 24), near = Math.abs(x) < 12;
      if (z > pe + 30 || waterAt(level, side < 0 ? 0 : 2, z) && z < pe) continue;
      const t = r();
      switch (W.deco) {
        case 'dschungel':
          if (t < 0.34) palm(b, x, z, 5 + r() * 5, W, r); else if (t < 0.56) tree(b, x, z, 6 + r() * 5, W, r); else if (t < 0.72) bush(b, x, z, 1.6 + r() * 1.2, W, r); else if (t < 0.84) fern(b, x, z, 1.3, W, r); else if (t < 0.93) rocks(b, x, z, 1 + r(), r); else flowers(b, x, z, W, r);
          break;
        case 'fluss':
          if (t < 0.3) palm(b, x, z, 5 + r() * 4, W, r); else if (t < 0.45) reeds(b, x, z, W, r); else if (t < 0.62) bush(b, x, z, 1.6 + r(), W, r); else if (t < 0.78) tree(b, x, z, 6 + r() * 4, W, r); else if (t < 0.9) fern(b, x, z, 1.3, W, r); else rocks(b, x, z, 1 + r(), r, 0x7d8a8e);
          break;
        case 'tal':
          if (t < 0.3) acacia(b, x, z, 4 + r() * 3, W, r); else if (t < 0.5) tuft(b, x, z, W, r); else if (t < 0.68) rocks(b, x, z, 1.4 + r() * 1.6, r, 0xc59b6e); else if (t < 0.82) bush(b, x, z, 1.3 + r(), W, r); else if (t < 0.92) tree(b, x, z, 5 + r() * 3, W, r); else flowers(b, x, z, W, r);
          break;
        case 'tempel':
          if (t < 0.22) pillar(b, x, z, 2.5 + r() * 3, W, r, r() < 0.5); else if (t < 0.34) ruinWall(b, x, z, W, r); else if (t < 0.58) tree(b, x, z, 6 + r() * 5, W, r); else if (t < 0.72) palm(b, x, z, 5 + r() * 4, W, r); else if (t < 0.84) bush(b, x, z, 1.6 + r(), W, r); else fern(b, x, z, 1.3, W, r);
          break;
        default: // gipfel
          if (t < 0.28) spire(b, x * 1.6 + side * 8, z, 7 + r() * 9, W, r); else if (t < 0.5) tree(b, x, z, 6 + r() * 4, W, r); else if (t < 0.66) rocks(b, x, z, 1.5 + r() * 1.8, r, 0x9aa0a6); else if (t < 0.82) palm(b, x, z, 5 + r() * 4, W, r); else if (t < 0.92) bush(b, x, z, 1.5 + r(), W, r); else fern(b, x, z, 1.3, W, r);
      }
      void near;
    }
    // Tempelsäulen entlang des Weges in fester Reihe
    if (W.deco === 'tempel') for (let zz = Math.ceil(a / 14) * 14; zz < bz; zz += 14) { if (zz > PATH0 && zz < pe && !level.dyn.some((d) => d.k === 'gate' && Math.abs(d.z - zz) < 3)) pillar(b, side * 5.6, zz, 3.2 + hash3(zz, side, 1) * 2.4, W, () => 0.5, hash3(zz, side, 2) < 0.4); }
    if (W.deco === 'fluss' && pr < 0.4 && side === (pr < 0.2 ? -1 : 1)) waterfall(b, side * 27, a + CH / 2, side, W);
  }
  // sanfte Hügel in der Ferne
  for (let k = 0; k < 4; k++) { const side = k % 2 ? 1 : -1, x = side * (30 + r() * 25), z = a + r() * CH; b.ico(x, -1 + r(), Z(z), 24 + r() * 14, 5 + r() * 8, 20 + r() * 12, W.deco === 'gipfel' ? shade(W.mount, 0.1) : mix(W.ground2, W.mount, 0.4), 0, r() * 3, 0, 0); }
  const geo = b.build();
  return geo;
}
