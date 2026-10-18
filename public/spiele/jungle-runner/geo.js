// JUNGLE RUNNER: kleine Hilfen für Low-Poly-Geometrie.
// MB sammelt viele Grundkörper (Quader, Zylinder, Kegel, Kugeln …) mit Farbe in EINE Geometrie (flache Normalen, Vertexfarben),
// damit ein Streckenstück mit hunderten Teilen nur einen Zeichenaufruf kostet.
const T = window.THREE;

const cacheG = new Map();
const mk = (k, f) => { if (!cacheG.has(k)) cacheG.set(k, f()); return cacheG.get(k); };
export const G = {
  box: () => mk('box', () => new T.BoxGeometry(1, 1, 1)),
  cyl: (n = 10) => mk('cyl' + n, () => new T.CylinderGeometry(0.5, 0.5, 1, n)),
  cone: (n = 8) => mk('cone' + n, () => new T.ConeGeometry(0.5, 1, n)),
  ico: (d = 0) => mk('ico' + d, () => new T.IcosahedronGeometry(0.5, d)),
  dode: () => mk('dode', () => new T.DodecahedronGeometry(0.5, 0)),
  sph: (n = 10) => mk('sph' + n, () => new T.SphereGeometry(0.5, n, Math.max(4, Math.round(n * 0.7)))),
  oct: () => mk('oct', () => new T.OctahedronGeometry(0.5, 0)),
  plane: () => mk('plane', () => { const g = new T.PlaneGeometry(1, 1); g.rotateX(-Math.PI / 2); return g; })
};

const _m = new T.Matrix4(), _q = new T.Quaternion(), _e = new T.Euler(), _p = new T.Vector3(), _s = new T.Vector3();
const A = new T.Vector3(), B = new T.Vector3(), C = new T.Vector3(), E1 = new T.Vector3(), E2 = new T.Vector3(), col = new T.Color();

export const hash3 = (a, b, c) => { let h = (Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(c | 0, 2147483647)) >>> 0; h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

// Texturschichten: jede Schicht hat ein eigenes Material (Gruppe in der Geometrie). Reihenfolge = Materialindex, '' = einfarbig.
// m = Meter pro Kachel (Weltkoordinaten, je nach Flächenrichtung), tint = wie weit die Vertexfarbe Richtung Weiß gezogen wird, gain = Aufhellung
// (so bleibt der Farbton der Welt erhalten, die Textur bestimmt die Zeichnung), uv: 'welt' | 'zyl' (Zylinder-UV) | 'lokal' (Deckfläche)
export const LAYERS = ['', 'gras', 'pfad', 'holz', 'rinde', 'schnitt', 'schlamm', 'stein'];
export const LAYER_DEF = {
  gras: { file: 'tex-gras.webp', m: 4, tint: 0.1, gain: 1.7 }, pfad: { file: 'tex-tempelstein.webp', m: 2.2, tint: 0.45 },
  holz: { file: 'tex-holzbohlen.webp', m: 2.4, tint: 0.4 }, rinde: { file: 'tex-rinde.webp', m: 2.6, tint: 0.35, uv: 'zyl' },
  schnitt: { file: 'tex-stamm-schnitt.png', m: 1, tint: 1, uv: 'lokal', alphaTest: 0.5 }, schlamm: { file: 'tex-schlamm.webp', m: 2.4, tint: 0.4 },
  stein: { file: 'tex-stein-moos.webp', m: 2.2, tint: 0.55 }
};
const WHITE = new T.Color(1, 1, 1);

export class MB {
  constructor() { this.L = {}; this.cur = ''; this.n = 0; }
  tex(name) { this.cur = name || ''; return this; }                // ab jetzt in diese Schicht schreiben ('' = einfarbig)
  // Grundkörper mit Lage (x,y,z), Größe (sx,sy,sz), Drehung (rx,ry,rz) und Farbe; jit = zufällige Helligkeit je Fläche
  put(geo, x, y, z, sx, sy, sz, color, rx = 0, ry = 0, rz = 0, jit = 0.07) {
    _e.set(rx, ry, rz, 'YXZ'); _q.setFromEuler(_e); _p.set(x, y, z); _s.set(sx, sy, sz); _m.compose(_p, _q, _s);
    this.geo(geo, _m, color, jit, sy);
    return this;
  }
  geo(g, m, color, jit = 0.07, sy = 1) {
    const L = this.L[this.cur] || (this.L[this.cur] = { pos: [], nor: [], col: [], uv: [] }), def = LAYER_DEF[this.cur];
    const pa = g.attributes.position, ua = g.attributes.uv, idx = g.index, cnt = idx ? idx.count : pa.count;
    col.set(color); if (def) { col.lerp(WHITE, def.tint); if (def.gain) col.multiplyScalar(def.gain); }
    for (let i = 0; i < cnt; i += 3) {
      const i0 = idx ? idx.getX(i) : i, i1 = idx ? idx.getX(i + 1) : i + 1, i2 = idx ? idx.getX(i + 2) : i + 2;
      A.fromBufferAttribute(pa, i0); B.fromBufferAttribute(pa, i1); C.fromBufferAttribute(pa, i2);
      const loc = def && def.uv === 'lokal' ? [[A.x, A.z], [B.x, B.z], [C.x, C.z]] : null;
      A.applyMatrix4(m); B.applyMatrix4(m); C.applyMatrix4(m);
      E1.subVectors(B, A); E2.subVectors(C, A); E1.cross(E2);
      const l = E1.length(); if (l < 1e-9) continue;
      E1.multiplyScalar(1 / l);
      const f = (0.86 + 0.14 * E1.y) * (1 + (hash3(this.n, i, 7) - 0.5) * 2 * jit);
      const ax = Math.abs(E1.x), ay = Math.abs(E1.y), az = Math.abs(E1.z);
      [A, B, C].forEach((v, k) => {
        L.pos.push(v.x, v.y, v.z); L.nor.push(E1.x, E1.y, E1.z); L.col.push(Math.min(1, col.r * f), Math.min(1, col.g * f), Math.min(1, col.b * f));
        if (!def) return;
        if (loc) L.uv.push(loc[k][0] * 1.08 + 0.5, loc[k][1] * 1.08 + 0.5);
        else if (def.uv === 'zyl' && ua) L.uv.push(ua.getX([i0, i1, i2][k]) * 2, ua.getY([i0, i1, i2][k]) * sy / def.m);
        else if (ay >= ax && ay >= az) L.uv.push(v.x / def.m, v.z / def.m);
        else if (ax >= az) L.uv.push(v.z / def.m, v.y / def.m);
        else L.uv.push(v.x / def.m, v.y / def.m);
      });
    }
    this.n++;
    return this;
  }
  box(x, y, z, sx, sy, sz, color, rx, ry, rz, jit) { return this.put(G.box(), x, y, z, sx, sy, sz, color, rx, ry, rz, jit); }
  cyl(x, y, z, dx, h, dz, color, rx, ry, rz, n = 10, jit) { return this.put(G.cyl(n), x, y, z, dx, h, dz, color, rx, ry, rz, jit); }
  cone(x, y, z, dx, h, dz, color, rx, ry, rz, n = 8, jit) { return this.put(G.cone(n), x, y, z, dx, h, dz, color, rx, ry, rz, jit); }
  ico(x, y, z, sx, sy, sz, color, rx, ry, rz, d = 0, jit) { return this.put(G.ico(d), x, y, z, sx, sy, sz, color, rx, ry, rz, jit); }
  sph(x, y, z, sx, sy, sz, color, n = 10, jit) { return this.put(G.sph(n), x, y, z, sx, sy, sz, color, 0, 0, 0, jit); }
  build() {
    const names = LAYERS.filter((n) => this.L[n] && this.L[n].pos.length);
    if (!names.length) return null;
    const textured = names.some((n) => n);
    const pos = [], nor = [], colr = [], uv = [], groups = [];
    let start = 0;
    for (const n of names) {
      const L = this.L[n], cnt = L.pos.length / 3;
      for (let i = 0; i < L.pos.length; i++) { pos.push(L.pos[i]); nor.push(L.nor[i]); colr.push(L.col[i]); }
      if (textured) { if (n) for (let i = 0; i < L.uv.length; i++) uv.push(L.uv[i]); else for (let i = 0; i < cnt * 2; i++) uv.push(0); }
      groups.push([start, cnt, LAYERS.indexOf(n)]); start += cnt;
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new T.Float32BufferAttribute(nor, 3));
    g.setAttribute('color', new T.Float32BufferAttribute(colr, 3));
    if (textured) { g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); for (const [s0, c, mi] of groups) g.addGroup(s0, c, mi); }
    g.computeBoundingSphere();
    return g;
  }
}

export const shade = (hex, f) => {
  const r = (hex >> 16) & 255, g = (hex >> 8) & 255, b = hex & 255;
  const t = f < 0 ? 0 : 255, p = Math.abs(f);
  const q = (v) => Math.round((t - v) * p + v);
  return (q(r) << 16) | (q(g) << 8) | q(b);
};
export const mix = (a, b, t) => {
  const f = (x, y) => Math.round(x + (y - x) * t);
  return (f((a >> 16) & 255, (b >> 16) & 255) << 16) | (f((a >> 8) & 255, (b >> 8) & 255) << 8) | f(a & 255, b & 255);
};
export const hexs = (n) => '#' + n.toString(16).padStart(6, '0');
