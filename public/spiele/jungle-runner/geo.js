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

export class MB {
  constructor() { this.pos = []; this.nor = []; this.col = []; this.n = 0; }
  // Grundkörper mit Lage (x,y,z), Größe (sx,sy,sz), Drehung (rx,ry,rz) und Farbe; jit = zufällige Helligkeit je Fläche
  put(geo, x, y, z, sx, sy, sz, color, rx = 0, ry = 0, rz = 0, jit = 0.07) {
    _e.set(rx, ry, rz, 'YXZ'); _q.setFromEuler(_e); _p.set(x, y, z); _s.set(sx, sy, sz); _m.compose(_p, _q, _s);
    this.geo(geo, _m, color, jit);
    return this;
  }
  geo(g, m, color, jit = 0.07) {
    const pa = g.attributes.position, idx = g.index, cnt = idx ? idx.count : pa.count;
    col.set(color);
    for (let i = 0; i < cnt; i += 3) {
      const i0 = idx ? idx.getX(i) : i, i1 = idx ? idx.getX(i + 1) : i + 1, i2 = idx ? idx.getX(i + 2) : i + 2;
      A.fromBufferAttribute(pa, i0).applyMatrix4(m); B.fromBufferAttribute(pa, i1).applyMatrix4(m); C.fromBufferAttribute(pa, i2).applyMatrix4(m);
      E1.subVectors(B, A); E2.subVectors(C, A); E1.cross(E2);
      const l = E1.length(); if (l < 1e-9) continue;
      E1.multiplyScalar(1 / l);
      const f = (0.86 + 0.14 * E1.y) * (1 + (hash3(this.n, i, 7) - 0.5) * 2 * jit);
      for (const v of [A, B, C]) { this.pos.push(v.x, v.y, v.z); this.nor.push(E1.x, E1.y, E1.z); this.col.push(Math.min(1, col.r * f), Math.min(1, col.g * f), Math.min(1, col.b * f)); }
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
    if (!this.pos.length) return null;
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new T.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new T.Float32BufferAttribute(this.col, 3));
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
