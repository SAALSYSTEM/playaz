// Tuff-Tuff-Land – Darstellung (three.js r128), Eingabe, Oberfläche, Ton. Regeln stehen in logik.js.
// Modelle: Kenney Train Kit, Nature Kit, City Kit Suburban (CC0, www.kenney.nl), gebacken mit tools/tuff-tuff-land-assets.py
// zu modelle.bin (Vertex-Farben, ein Material). Bahnhof, Prellbock, Weichenpfeil, Figuren und Wolken entstehen hier im Code.
import * as L from './logik.js?v=1';

const THREE = window.THREE;
const $ = (id) => document.getElementById(id);
const Q = new URLSearchParams(location.search);
const TEST = Q.has('test');
const LIN = new Float32Array(256).map((_, i) => { const c = i / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
const farbe = (hex) => new THREE.Color(hex).convertSRGBToLinear();

// ---------- Spielstand ----------
let welt = ladeStand();
function ladeStand() { try { return L.pruefeStand(JSON.parse(localStorage.getItem(L.SCHLUESSEL))); } catch (e) { return L.neueWelt(); } }
let speicherTimer = 0;
function speichere(sofort) {
  clearTimeout(speicherTimer);
  const f = () => { try { const { _takt, ...rest } = welt; localStorage.setItem(L.SCHLUESSEL, JSON.stringify(rest)); } catch (e) {} };
  if (sofort) f(); else speicherTimer = setTimeout(f, 400);
}
addEventListener('visibilitychange', () => { if (document.hidden) speichere(true); });
addEventListener('pagehide', () => speichere(true));

// ---------- Renderer ----------
const canvas = $('c');
let renderer;
try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' }); }
catch (e) { $('ladeText').textContent = 'Dein Browser kann leider kein 3D (WebGL) anzeigen.'; throw e; }
let pixel = Math.min(window.devicePixelRatio || 1, 2);
renderer.setPixelRatio(pixel);
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.setClearColor(new THREE.Color('#bfe6ff'), 1);
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(farbe('#bfe6ff'), 90, 190);
const camera = new THREE.PerspectiveCamera(42, 1, 1, 400);
scene.add(new THREE.HemisphereLight(farbe('#ffffff'), farbe('#4d6a45'), 0.52));
const sonne = new THREE.DirectionalLight(farbe('#fff1d6'), 0.6); sonne.position.set(-20, 40, 18); scene.add(sonne);
const MAT = new THREE.MeshLambertMaterial({ vertexColors: true });

// ---------- Modelle laden ----------
const GEO = {};
async function ladeModelle(fortschritt) {
  const res = await fetch(new URL('./modelle.bin?v=1', import.meta.url));
  if (!res.ok) throw new Error('modelle.bin ' + res.status);
  const gesamt = Number(res.headers.get('content-length')) || 1100000;
  const leser = res.body && res.body.getReader ? res.body.getReader() : null;
  let buf;
  if (leser) {
    const teile = []; let n = 0;
    for (;;) { const { done, value } = await leser.read(); if (done) break; teile.push(value); n += value.length; fortschritt(Math.min(1, n / gesamt)); }
    buf = new Uint8Array(n); let o = 0; for (const t of teile) { buf.set(t, o); o += t.length; }
    buf = buf.buffer;
  } else buf = await res.arrayBuffer();
  const jl = new DataView(buf).getUint32(0, true);
  const kopf = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, jl)));
  const basis = 4 + jl;
  for (const [name, m] of Object.entries(kopf)) {
    const p = new Int16Array(buf, basis + m.p, m.n * 3), no = new Int8Array(buf, basis + m.no, m.n * 3), f = new Uint8Array(buf, basis + m.f, m.n * 3);
    const pos = new Float32Array(m.n * 3), nor = new Float32Array(m.n * 3), col = new Float32Array(m.n * 3);
    for (let i = 0; i < m.n * 3; i++) { pos[i] = p[i] * m.q; nor[i] = no[i] / 127; col[i] = LIN[f[i]]; }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setIndex(new THREE.BufferAttribute(new Uint16Array(buf.slice(basis + m.ix, basis + m.ix + m.i * 2)), 1));
    g.userData.box = m.box;
    GEO[name] = g;
  }
}

// ---------- Eigene Formen (Bahnhof, Prellbock, Pfeil, Figuren, Wolken) ----------
function faerbe(g, hex) {
  g = g.index ? g.toNonIndexed() : g;
  const c = farbe(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  if (g.attributes.uv) g.deleteAttribute('uv');
  return g;
}
const kiste = (w, h, d, hex, x, y, z, ry = 0) => { const g = faerbe(new THREE.BoxGeometry(w, h, d), hex); if (ry) g.rotateY(ry); g.translate(x, y, z); return g; };
const rolle = (r, h, hex, x, y, z, seg = 10) => faerbe(new THREE.CylinderGeometry(r, r, h, seg), hex).translate(x, y, z);
const kugel = (r, hex, x, y, z, d = 1) => faerbe(new THREE.IcosahedronGeometry(r, d), hex).translate(x, y, z);
const zusammen = (gs) => THREE.BufferGeometryUtils.mergeBufferGeometries(gs);

// Bahnhof: Gleis läuft entlang +z durch den Ursprung, Bahnsteig auf der +x-Seite
const GEO_BAHNHOF = () => zusammen([
  kiste(1.4, 0.36, 3.9, '#d8dce6', 1.5, 0.18, 0), kiste(0.14, 0.03, 3.9, '#FFD21C', 0.9, 0.375, 0),
  kiste(1.75, 0.2, 2.9, '#FF9200', 1.65, 2.25, 0), kiste(1.85, 0.08, 3.0, '#e07a00', 1.65, 2.12, 0),
  rolle(0.09, 1.8, '#ffffff', 2.05, 1.26, -1.1, 8), rolle(0.09, 1.8, '#ffffff', 2.05, 1.26, 1.1, 8),
  kiste(0.12, 1.2, 2.4, '#f4efe4', 2.15, 0.96, 0),
  kiste(0.5, 0.1, 1.2, '#b0703a', 1.85, 0.62, 0), kiste(0.5, 0.25, 0.08, '#8a5428', 1.85, 0.48, -0.55), kiste(0.5, 0.25, 0.08, '#8a5428', 1.85, 0.48, 0.55),
  rolle(0.32, 0.08, '#ffffff', 1.65, 1.75, 1.7, 16).rotateZ(0), kiste(0.05, 0.9, 0.05, '#6d7488', 1.65, 1.3, 1.7),
]);
const GEO_PRELLBOCK = () => zusammen([
  kiste(1.3, 0.45, 0.35, '#e8423a', 0, 0.42, 0), kiste(1.32, 0.12, 0.37, '#ffffff', 0, 0.42, 0),
  kiste(0.18, 0.5, 0.6, '#6d7488', -0.45, 0.25, -0.2), kiste(0.18, 0.5, 0.6, '#6d7488', 0.45, 0.25, -0.2),
  kiste(0.3, 0.3, 0.12, '#FFD21C', -0.38, 0.42, 0.2), kiste(0.3, 0.3, 0.12, '#FFD21C', 0.38, 0.42, 0.2),
]);
function GEO_PFEIL() {
  const form = (s) => { const sh = new THREE.Shape(); sh.moveTo(0, 0.95 * s); sh.lineTo(0.62 * s, 0.1 * s); sh.lineTo(0.24 * s, 0.1 * s); sh.lineTo(0.24 * s, -0.75 * s); sh.lineTo(-0.24 * s, -0.75 * s); sh.lineTo(-0.24 * s, 0.1 * s); sh.lineTo(-0.62 * s, 0.1 * s); sh.closePath(); return sh; };
  const g1 = faerbe(new THREE.ExtrudeGeometry(form(1), { depth: 0.08, bevelEnabled: false }), '#FFD21C');
  const g2 = faerbe(new THREE.ExtrudeGeometry(form(1.28), { depth: 0.05, bevelEnabled: false }), '#11121A').translate(0, -0.06, -0.06);
  return zusammen([g1, g2]).rotateX(-Math.PI / 2).translate(0, 0.16, 0);   // liegt flach, Spitze zeigt nach +z
}
const GEO_KOERPER = () => zusammen([rolle(0.24, 0.5, '#ffffff', 0, 0.3, 0, 10), kugel(0.24, '#ffffff', 0, 0.55, 0, 1)]);
const GEO_KOPF = () => zusammen([kugel(0.22, '#ffd2a8', 0, 0.86, 0, 1), kugel(0.235, '#5b3a24', 0, 0.93, -0.04, 1).scale(1, 0.62, 1).translate(0, 0.37, 0)]);

// ---------- Ebenen der Welt ----------
const welten = new THREE.Group(); scene.add(welten);
let IM = {};                         // InstancedMeshes je Art
const tmp = new THREE.Object3D();
function instanz(name, geo, cap, mat = MAT) {
  let m = IM[name];
  if (m && m.userData.cap >= cap) return m;
  if (m) { welten.remove(m); m.dispose && m.dispose(); }
  m = new THREE.InstancedMesh(geo, mat, cap);
  m.userData.cap = cap; m.count = 0; m.frustumCulled = false;
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  welten.add(m); IM[name] = m;
  return m;
}
const rnd = (k, n = 0) => { let x = Math.sin(k * 127.1 + n * 311.7) * 43758.5453; return x - Math.floor(x); };

// Boden: je Gebiet eine Fläche, außen herum Wiese
let boden;
function baueBoden() {
  if (boden) welten.remove(boden);
  boden = new THREE.Group();
  const W = L.BREITE * L.FELD;
  const rand = new THREE.Mesh(faerbe(new THREE.PlaneGeometry(W + 160, L.HOEHE * L.FELD + 160).rotateX(-Math.PI / 2), '#72c04a'), MAT);
  rand.position.set(W / 2, -0.06, L.HOEHE * L.FELD / 2); boden.add(rand);
  L.GEBIETE.forEach((g, i) => {
    const offen = i < welt.offen;
    const h = L.GEBIET_H * L.FELD;
    const m = new THREE.Mesh(faerbe(new THREE.PlaneGeometry(W, h).rotateX(-Math.PI / 2), offen ? g.boden : '#a8c79a'), MAT);
    m.position.set(W / 2, -0.02, (L.GEBIETE.length - 1 - i) * h + h / 2); boden.add(m);
  });
  // feines Raster nur im offenen Bereich
  const r0 = L.HOEHE - welt.offen * L.GEBIET_H, pts = [];
  for (let c = 0; c <= L.BREITE; c++) pts.push(c * 4, 0.02, r0 * 4, c * 4, 0.02, L.HOEHE * 4);
  for (let r = r0; r <= L.HOEHE; r++) pts.push(0, 0.02, r * 4, W, 0.02, r * 4);
  const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  raster = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.22 }));
  boden.add(raster);
  welten.add(boden);
}
let raster;

// Gleise, Prellböcke, Weichenpfeile
function baueGleise() {
  const teile = { gleis: [], kurve: [] }, ende = [], pfeile = [];
  for (const [k, f] of Object.entries(welt.z)) {
    if (!f.l) continue;
    const c = k % L.BREITE, r = Math.floor(k / L.BREITE);
    for (const l of f.l) { const t = L.teil(c, r, l); teile[t.m].push(t); }
    for (const e of L.offeneEnden(welt, c, r)) {
      const nc = c + L.DIR[e][0], nr = r + L.DIR[e][1];
      if (L.inWelt(nc, nr) && !L.feldOffen(welt, nc, nr) && L.feldOffen(welt, c, r)) continue;   // führt in die Wolken: kein Prellbock
      const [x, z] = L.kantenMitte(c, r, e);
      ende.push({ x: x - L.DIR[e][0] * 0.55, z: z - L.DIR[e][1] * 0.55, gier: Math.atan2(L.DIR[e][0], L.DIR[e][1]) });
    }
    if (L.istWeiche(welt, c, r)) {
      const [g, b] = L.weichenZweig(welt, c, r);
      const p = L.punkt(c, r, g, b, L.linkLaenge(g, b) * 0.62);
      pfeile.push({ x: p[0], z: p[1], gier: p[2], k: Number(k) });
    }
  }
  for (const m of ['gleis', 'kurve']) {
    const im = instanz(m, GEO[m], Math.max(64, teile[m].length + 32));
    teile[m].forEach((t, i) => { tmp.position.set(t.x, 0, t.z); tmp.rotation.set(0, t.gier, 0); tmp.scale.set(1, 1, 1); tmp.updateMatrix(); im.setMatrixAt(i, tmp.matrix); });
    im.count = teile[m].length; im.instanceMatrix.needsUpdate = true;
  }
  const pb = instanz('prellbock', GEO.prellbock, Math.max(16, ende.length + 8));
  ende.forEach((t, i) => { tmp.position.set(t.x, 0, t.z); tmp.rotation.set(0, t.gier, 0); tmp.updateMatrix(); pb.setMatrixAt(i, tmp.matrix); });
  pb.count = ende.length; pb.instanceMatrix.needsUpdate = true;
  weichenPfeile = pfeile;
  instanz('pfeil', GEO.pfeil, Math.max(16, pfeile.length + 8)).count = pfeile.length;
  setzePfeile(0);
}
let weichenPfeile = [];
function setzePfeile(t) {
  const im = IM.pfeil; if (!im) return;
  weichenPfeile.forEach((p, i) => {
    const s = 1 + 0.12 * Math.sin(t * 5 + i);
    tmp.position.set(p.x, 0.05, p.z); tmp.rotation.set(0, p.gier, 0); tmp.scale.set(s, 1, s); tmp.updateMatrix(); im.setMatrixAt(i, tmp.matrix);
  });
  tmp.scale.set(1, 1, 1);
  im.instanceMatrix.needsUpdate = true;
}

// Bahnhöfe und wartende Fahrgäste
let bahnhoefe = [];
const HEMD = ['#ff6b6b', '#4dabf7', '#ffd43b', '#69db7c', '#b197fc', '#ff922b', '#f783ac', '#38d9a9'];
const HEMD_LIN = HEMD.map(farbe);
function baueBahnhoefe() {
  bahnhoefe = [];
  for (const [k, f] of Object.entries(welt.z)) {
    if (f.st == null || !f.l) continue;
    const c = k % L.BREITE, r = Math.floor(k / L.BREITE);
    if (!L.feldOffen(welt, c, r)) continue;
    const [x, z] = L.mitte(c, r);
    const gier = f.l[0][0] === 0 ? 0 : Math.PI / 2;
    bahnhoefe.push({ k: Number(k), x, z, gier, f });
  }
  const im = instanz('bahnhof', GEO.bahnhof, Math.max(16, bahnhoefe.length + 8));
  bahnhoefe.forEach((b, i) => { tmp.position.set(b.x, 0, b.z); tmp.rotation.set(0, b.gier, 0); tmp.updateMatrix(); im.setMatrixAt(i, tmp.matrix); });
  im.count = bahnhoefe.length; im.instanceMatrix.needsUpdate = true;
  if (!IM.koerper) { const k = instanz('koerper', GEO.koerper, 160, new THREE.MeshLambertMaterial({ vertexColors: true })); k.count = 160; for (let i = 0; i < 160; i++) k.setColorAt(i, farbe(HEMD[i % HEMD.length])); k.count = 0; }
  instanz('kopf', GEO.kopf, 160);
}
const lokal = (b, lx, lz) => { const s = Math.sin(b.gier), c = Math.cos(b.gier); return [b.x + lx * c + lz * s, b.z - lx * s + lz * c]; };
function setzeWartende(t) {
  const kb = IM.koerper, kk = IM.kopf; if (!kb) return;
  let n = 0;
  for (const b of bahnhoefe) {
    const w8 = Math.min(L.WARTEND_MAX, b.f.w8 || 0);
    for (let i = 0; i < w8 && n < 160; i++, n++) {
      const [x, z] = lokal(b, 1.45 + (i === 1 ? 0.2 : -0.1), -1.15 + i * 1.05);
      const hops = Math.max(0, Math.sin(t * 4 + b.k + i * 1.7)) * 0.12;
      tmp.position.set(x, 0.36 + hops, z); tmp.rotation.set(0, b.gier - Math.PI / 2, 0); tmp.updateMatrix();
      kb.setMatrixAt(n, tmp.matrix); kk.setMatrixAt(n, tmp.matrix);
      kb.setColorAt(n, HEMD_LIN[(b.k * 3 + i) % HEMD.length]);
    }
  }
  kb.count = kk.count = n; kb.instanceMatrix.needsUpdate = kk.instanceMatrix.needsUpdate = true;
  if (kb.instanceColor) kb.instanceColor.needsUpdate = true;
}

// Deko (Bäume, Häuser, Blumen …)
const RAND = [];
for (let r = 0; r < L.HOEHE + 4; r++) for (const c of [-3, -2, -1, L.BREITE, L.BREITE + 1, L.BREITE + 2]) if (rnd(r * 7 + c, 11) < 0.7) RAND.push([c, r]);
for (let r = L.HOEHE; r < L.HOEHE + 4; r++) for (let c = 0; c < L.BREITE; c++) if (rnd(r * 7 + c, 12) < 0.55) RAND.push([c, r]);
const KLEIN = new Set(['blume-rot', 'blume-gelb', 'blume-lila', 'busch', 'busch-gross', 'gras', 'pilz', 'stein', 'stumpf', 'kuerbis']);
function baueDeko() {
  const je = {};
  for (const [k, f] of Object.entries(welt.z)) {
    if (!f.d || !GEO[f.d[0]]) continue;
    const c = k % L.BREITE, r = Math.floor(k / L.BREITE), [mx, mz] = L.mitte(c, r), m = f.d[0];
    const box = GEO[m].userData.box, cx = (box[0] + box[3]) / 2, cz = (box[2] + box[5]) / 2;
    const liste = (je[m] ||= []);
    if (KLEIN.has(m)) {
      for (let i = 0; i < 3; i++) liste.push({ x: mx + (rnd(k, i) - 0.5) * 2.6, z: mz + (rnd(k, i + 7) - 0.5) * 2.6, gier: rnd(k, i + 3) * 6.28, s: 0.8 + rnd(k, i + 5) * 0.4, cx: 0, cz: 0 });
    } else if (m.startsWith('haus')) {
      liste.push({ x: mx, z: mz, gier: f.d[1] * Math.PI / 2, s: Math.min(1, 3.7 / Math.max(box[3] - box[0], box[5] - box[2])), cx, cz });
    } else {
      liste.push({ x: mx + (rnd(k, 1) - 0.5) * 1.2, z: mz + (rnd(k, 2) - 0.5) * 1.2, gier: rnd(k, 3) * 6.28, s: 0.85 + rnd(k, 4) * 0.3, cx: 0, cz: 0 });
    }
  }
  // Wald rund um die Welt (nur Schmuck)
  for (const [c, r] of RAND) { const k = 1000 + c * 37 + r * 101, m = r < L.HOEHE - L.offenBis(welt) ? 'tanne' : ['baum', 'eiche', 'dickbaum', 'tanne'][Math.floor(rnd(k, 9) * 4)]; (je[m] ||= []).push({ x: c * 4 + 2 + (rnd(k, 1) - 0.5) * 2, z: r * 4 + 2 + (rnd(k, 2) - 0.5) * 2, gier: rnd(k, 3) * 6.28, s: 0.9 + rnd(k, 4) * 0.4, cx: 0, cz: 0 }); }
  for (const [name, im] of Object.entries(IM)) if (im.userData.deko && !je[name.slice(5)]) im.count = 0;
  for (const [m, liste] of Object.entries(je)) {
    const im = instanz('deko:' + m, GEO[m], Math.max(16, liste.length * 2)); im.userData.deko = true;
    liste.forEach((d, i) => {
      tmp.rotation.set(0, d.gier, 0); tmp.scale.set(d.s, d.s, d.s);
      const s = Math.sin(d.gier), co = Math.cos(d.gier);
      tmp.position.set(d.x - (d.cx * co + d.cz * s) * d.s, 0, d.z - (-d.cx * s + d.cz * co) * d.s);
      tmp.updateMatrix(); im.setMatrixAt(i, tmp.matrix);
    });
    tmp.scale.set(1, 1, 1);
    im.count = liste.length; im.instanceMatrix.needsUpdate = true;
  }
}

// Wolken über gesperrten Gebieten + Schild mit Fortschritt
let wolken = [], schild = null, schildCanvas = null;
function baueWolken() {
  wolken = [];
  for (let r = 0; r < L.HOEHE; r++) for (let c = -1; c <= L.BREITE; c++) {
    if (r >= 0 && L.gebietVon(r) < welt.offen) continue;
    const k = r * 31 + c + 7;
    for (let i = 0; i < 2; i++) wolken.push({ x: c * 4 + 2 + (rnd(k, i) - 0.5) * 3, y: 1.6 + rnd(k, i + 2) * 2.2, z: r * 4 + 2 + (rnd(k, i + 4) - 0.5) * 3, s: 2.1 + rnd(k, i + 6) * 1.5, g: L.gebietVon(r), weg: 0 });
  }
  const im = instanz('wolke', GEO.wolke, Math.max(64, wolken.length));
  im.count = wolken.length;
  setzeWolken(0, 0);
  baueSchild();
}
function setzeWolken(t, dt) {
  const im = IM.wolke; if (!im) return;
  let n = 0;
  for (const w of wolken) {
    if (w.weg > 0) w.weg = Math.min(1, w.weg + dt * 0.7);
    const sc = w.s * (1 - w.weg) * (1 + 0.05 * Math.sin(t * 0.8 + w.x));
    if (sc < 0.02) continue;
    tmp.position.set(w.x + Math.sin(t * 0.3 + w.z) * 0.4, w.y + w.weg * 6, w.z); tmp.rotation.set(0, 0, 0); tmp.scale.set(sc, sc * 0.7, sc); tmp.updateMatrix();
    im.setMatrixAt(n++, tmp.matrix);
  }
  tmp.scale.set(1, 1, 1);
  im.count = n; im.instanceMatrix.needsUpdate = true;
}
function baueSchild() {
  if (schild) { scene.remove(schild); schild.material.map.dispose(); schild.material.dispose(); schild = null; }
  const g = L.GEBIETE[welt.offen];
  if (!g) return;
  schildCanvas = document.createElement('canvas'); schildCanvas.width = 512; schildCanvas.height = 256;
  const tex = new THREE.CanvasTexture(schildCanvas); tex.encoding = THREE.sRGBEncoding;
  schild = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
  schild.renderOrder = 5;
  const zGrenze = (L.HOEHE - welt.offen * L.GEBIET_H) * 4;
  schild.position.set(L.BREITE * 2, 5, zGrenze - 2);
  schild.scale.set(11, 5.5, 1);
  scene.add(schild);
  maleSchild();
}
function maleSchild() {
  const g = L.GEBIETE[welt.offen]; if (!g || !schildCanvas) return;
  const x = schildCanvas.getContext('2d');
  x.clearRect(0, 0, 512, 256);
  x.fillStyle = 'rgba(17,18,26,.25)'; rundRechteck(x, 12, 20, 488, 224, 48); x.fill();
  x.fillStyle = '#ffffff'; rundRechteck(x, 8, 8, 488, 224, 48); x.fill();
  x.font = '700 92px Fredoka, system-ui, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillStyle = '#11121A';
  const n = Math.min(welt.fahrgaeste, g.ziel);
  x.fillText(`🔒 🧍 ${n}/${g.ziel}`, 252, 102);
  x.fillStyle = '#eef3f8'; rundRechteck(x, 60, 168, 384, 34, 17); x.fill();
  x.fillStyle = '#FF9200'; rundRechteck(x, 60, 168, Math.max(34, 384 * n / g.ziel), 34, 17); x.fill();
  schild.material.map.needsUpdate = true;
}
function rundRechteck(x, a, b, w, h, r) { x.beginPath(); x.moveTo(a + r, b); x.arcTo(a + w, b, a + w, b + h, r); x.arcTo(a + w, b + h, a, b + h, r); x.arcTo(a, b + h, a, b, r); x.arcTo(a, b, a + w, b, r); x.closePath(); }

// Rauch und Wölkchen (Dampf, Bauen, Wegräumen)
const PUFF = [];
function puff(x, y, z, art = 'dampf') {
  const p = PUFF.find((q) => q.t <= 0) || (PUFF.length < 90 ? (PUFF.push({}), PUFF[PUFF.length - 1]) : PUFF[0]);
  const st = art === 'dampf';
  Object.assign(p, { x, y, z, vx: (Math.random() - 0.5) * (st ? 0.4 : 3), vy: st ? 1.6 : 1.5 + Math.random(), vz: (Math.random() - 0.5) * (st ? 0.4 : 3), t: st ? 1.3 : 0.7, T: st ? 1.3 : 0.7, s: st ? 0.35 : 0.55 });
}
function setzePuffs(dt) {
  const im = IM.puff; if (!im) return;
  let n = 0;
  for (const p of PUFF) {
    if (p.t <= 0) continue;
    p.t -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.vy *= 0.97;
    const a = 1 - p.t / p.T, sc = p.s * (0.6 + a * 1.4) * (p.t < 0.25 ? p.t / 0.25 : 1);
    tmp.position.set(p.x, p.y, p.z); tmp.rotation.set(0, 0, 0); tmp.scale.set(sc, sc, sc); tmp.updateMatrix();
    im.setMatrixAt(n++, tmp.matrix);
  }
  tmp.scale.set(1, 1, 1);
  im.count = n; im.instanceMatrix.needsUpdate = true;
}
function wolkeAuf(c, r, n = 6) { const [x, z] = L.mitte(c, r); for (let i = 0; i < n; i++) puff(x + (Math.random() - 0.5) * 2.4, 0.6, z + (Math.random() - 0.5) * 2.4, 'bau'); }

// Markierung unter dem Finger
const marke = new THREE.Mesh(new THREE.PlaneGeometry(3.7, 3.7).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffd21c, transparent: true, opacity: 0.4, depthWrite: false }));
marke.position.y = 0.04; marke.visible = false; scene.add(marke);

// Hilfsweg für den ersten Tipp
const HILFE = [[6, 21], [7, 21], [7, 20], [7, 19], [7, 18], [7, 17], [7, 16], [7, 15], [7, 14], [6, 14], [5, 14]];
let hilfe = null;
function baueHilfe() {
  if (hilfe) { scene.remove(hilfe); hilfe = null; }
  if (!welt.tipp) return;
  const g = faerbe(new THREE.CylinderGeometry(0.28, 0.28, 0.06, 14), '#FFD21C');
  hilfe = new THREE.InstancedMesh(g, new THREE.MeshBasicMaterial({ color: 0xffd21c, transparent: true, opacity: 0.85 }), 64);
  let n = 0;
  for (let i = 1; i < HILFE.length - 1; i++) {
    const [c, r] = HILFE[i], [x, z] = L.mitte(c, r), [px, pz] = L.mitte(...HILFE[i - 1]);
    for (const t of [0, 0.5]) { tmp.position.set(px + (x - px) * t, 0.1, pz + (z - pz) * t); tmp.rotation.set(0, 0, 0); tmp.updateMatrix(); hilfe.setMatrixAt(n++, tmp.matrix); }
  }
  hilfe.count = n; scene.add(hilfe);
}

// ---------- Zug ----------
let zug = null, zugGruppe = null, zugWagen = [];
function baueZug() {
  if (zugGruppe) scene.remove(zugGruppe);
  zugGruppe = new THREE.Group(); zugWagen = [];
  for (const m of L.ZUEGE[zug.art].wagen) { const mesh = new THREE.Mesh(GEO[m], MAT); zugGruppe.add(mesh); zugWagen.push({ mesh, dampf: m.startsWith('lok-'), t: 0 }); }
  scene.add(zugGruppe);
  setzeZug(0, 0);
}
let tutenPuls = 0;
function setzeZug(t, dt) {
  if (!zug || !zugWagen.length) return;
  zugGruppe.visible = zug.weg.length > 0;
  if (!zug.weg.length) return;
  const n = zugWagen.length, dreh = L.ZUEGE[zug.art].dreh || [];
  zugWagen.forEach((w, i) => {
    const d = L.wagenAbstand(zug.rueck ? n - 1 - i : i);
    const [x, z, g] = L.wagenPos(zug, d);
    const gier = g + (zug.rueck ? Math.PI : 0) + (dreh[i] || 0);
    const wack = zug.v > 0.1 ? Math.sin(t * 14 + i) * 0.015 : 0;
    w.mesh.position.set(x, wack, z); w.mesh.rotation.set(0, gier, 0);
    const s = i === 0 ? 1 + tutenPuls * 0.08 : 1; w.mesh.scale.set(s, s, s);
    if (w.dampf) {
      w.t -= dt * (0.6 + zug.v / L.TEMPO * 2.5);
      if (w.t <= 0 && (zug.v > 0.2 || tutenPuls > 0)) {
        w.t = 0.28;
        puff(x + Math.sin(gier) * 0.95, 1.95, z + Math.cos(gier) * 0.95);
      }
    }
  });
  tutenPuls = Math.max(0, tutenPuls - dt * 2.5);
}

// ---------- Kamera ----------
const kam = { x: L.BREITE * 2, z: 19 * 4, zoom: 1, folge: false, flug: null };
const NEIGUNG = 50 * Math.PI / 180;
function kameraGrenzen() {
  const zMin = (L.HOEHE - welt.offen * L.GEBIET_H) * 4 - 6, zMax = L.HOEHE * 4 - 10;
  kam.x = Math.max(6, Math.min(L.BREITE * 4 - 6, kam.x));
  kam.z = Math.max(zMin, Math.min(zMax, kam.z));
  kam.zoom = Math.max(0.7, Math.min(1.7, kam.zoom));
}
function setzeKamera() {
  const a = camera.aspect, halb = 10 * kam.zoom;
  const tanH = Math.tan(camera.fov * Math.PI / 360) * Math.min(a, 1);
  const d = halb / tanH;
  camera.position.set(kam.x, d * Math.sin(NEIGUNG), kam.z + d * Math.cos(NEIGUNG));
  camera.lookAt(kam.x, 0, kam.z);
  scene.fog.near = d * 1.1; scene.fog.far = d * 2.4;
}
function groesse() {
  const r = canvas.getBoundingClientRect();
  renderer.setSize(r.width, r.height, false);
  camera.aspect = r.width / Math.max(1, r.height); camera.updateProjectionMatrix();
}
addEventListener('resize', groesse);
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
function boden0(px, py) {
  const r = canvas.getBoundingClientRect();
  ndc.set(((px - r.left) / r.width) * 2 - 1, -((py - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const o = ray.ray.origin, d = ray.ray.direction;
  if (Math.abs(d.y) < 1e-4) return null;
  const t = -o.y / d.y;
  return [o.x + d.x * t, o.z + d.z * t];
}
const feldVon = (p) => (p ? [Math.floor(p[0] / L.FELD), Math.floor(p[1] / L.FELD)] : null);
function bildschirm(x, z, y = 0) {
  const v = new THREE.Vector3(x, y, z).project(camera), r = canvas.getBoundingClientRect();
  return [r.left + (v.x + 1) / 2 * r.width, r.top + (1 - v.y) / 2 * r.height];
}

// ---------- Ton ----------
let ac = null, master = null, sfxGain = null, musikGain = null, fahrtQuelle = null, fahrtGain = null;
const PUFFER = {};
function tonStart() {
  if (ac || TEST) { if (ac && ac.state === 'suspended') ac.resume(); return; }
  try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
  master = ac.createGain(); master.connect(ac.destination);
  sfxGain = ac.createGain(); sfxGain.connect(master);
  musikGain = ac.createGain(); musikGain.connect(master);
  tonSchalter();
  for (const n of ['musik', 'fahrt', 'pfeife', 'glocke']) {
    fetch(new URL(`./sound/${n}.mp3?v=1`, import.meta.url)).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(r.status)))
      .then((b) => ac.decodeAudioData(b)).then((p) => { PUFFER[n] = p; if (n === 'musik') musikAn(); if (n === 'fahrt') fahrtAn(); }).catch(() => {});
  }
}
function tonSchalter() {
  if (!ac) return;
  sfxGain.gain.value = welt.ton ? 1 : 0;
  musikGain.gain.value = welt.musik ? 0.32 : 0;
}
function musikAn() { const s = ac.createBufferSource(); s.buffer = PUFFER.musik; s.loop = true; s.connect(musikGain); s.start(); }
function fahrtAn() {
  fahrtGain = ac.createGain(); fahrtGain.gain.value = 0; fahrtGain.connect(sfxGain);
  fahrtQuelle = ac.createBufferSource(); fahrtQuelle.buffer = PUFFER.fahrt; fahrtQuelle.loop = true; fahrtQuelle.connect(fahrtGain); fahrtQuelle.start();
}
function spiele(n, laut = 1, rate = 1) {
  if (!ac || !PUFFER[n]) return;
  const s = ac.createBufferSource(), g = ac.createGain(); s.buffer = PUFFER[n]; s.playbackRate.value = rate; g.gain.value = laut;
  s.connect(g); g.connect(sfxGain); s.start();
}
function ton(art, hoehe = 0) {
  if (!ac) return;
  const t = ac.currentTime, g = ac.createGain(); g.connect(sfxGain);
  const osz = (typ, f0, f1, dauer, laut, start = 0) => {
    const o = ac.createOscillator(), gg = ac.createGain(); o.type = typ;
    o.frequency.setValueAtTime(f0, t + start); o.frequency.exponentialRampToValueAtTime(f1, t + start + dauer);
    gg.gain.setValueAtTime(0.0001, t + start); gg.gain.exponentialRampToValueAtTime(laut, t + start + 0.012); gg.gain.exponentialRampToValueAtTime(0.0001, t + start + dauer);
    o.connect(gg); gg.connect(g); o.start(t + start); o.stop(t + start + dauer + 0.02);
  };
  if (art === 'plopp') osz('sine', 520 * 2 ** (hoehe / 12), 880 * 2 ** (hoehe / 12), 0.09, 0.25);
  else if (art === 'klick') { osz('square', 900, 600, 0.05, 0.12); osz('square', 600, 1100, 0.06, 0.12, 0.07); }
  else if (art === 'weg') { osz('triangle', 500, 140, 0.18, 0.25); }
  else if (art === 'nein') { osz('sine', 300, 220, 0.16, 0.22); osz('sine', 260, 190, 0.18, 0.2, 0.15); }
  else if (art === 'jubel') [0, 4, 7, 12].forEach((s, i) => osz('triangle', 523 * 2 ** (s / 12), 523 * 2 ** (s / 12) * 1.01, 0.22, 0.22, i * 0.09));
  else if (art === 'fanfare') [0, 4, 7, 12, 7, 12, 16].forEach((s, i) => osz('square', 392 * 2 ** (s / 12), 392 * 2 ** (s / 12), i === 6 ? 0.6 : 0.16, 0.12, i * 0.14));
}

// ---------- Oberfläche ----------
let werkzeug = 'gleis', zustand = 'laden';
function toast(text, ms = 3000) { const t = $('toast'); t.textContent = text; t.hidden = false; clearTimeout(toast.h); toast.h = setTimeout(() => (t.hidden = true), ms); }
function zeigeGaeste(hupf) {
  $('gast').textContent = welt.fahrgaeste;
  const g = L.GEBIETE[welt.offen];
  $('gastZiel').textContent = g ? '/' + g.ziel : '';
  if (hupf) { const c = $('chipGast'); c.classList.remove('hupf'); void c.offsetWidth; c.classList.add('hupf'); }
  maleSchild();
}
function plus(x, z, text) {
  const [sx, sy] = bildschirm(x, z, 2.6), r = $('app').getBoundingClientRect();
  const el = document.createElement('div'); el.className = 'plus'; el.textContent = text;
  el.style.left = (sx - r.left) + 'px'; el.style.top = (sy - r.top) + 'px';
  $('app').appendChild(el); setTimeout(() => el.remove(), 1700);
}
function setzeWerkzeug(w) {
  werkzeug = w;
  document.querySelectorAll('.wz').forEach((b) => b.classList.toggle('an', b.dataset.wz === w));
  if (raster) raster.visible = w !== 'hand';
}
document.querySelectorAll('.wz').forEach((b) => b.addEventListener('click', () => { tonStart(); ton('klick'); setzeWerkzeug(b.dataset.wz); }));
function losKnopf() {
  const b = $('btnLos'), l = zug && zug.laeuft;
  b.classList.toggle('halt', !!l);
  b.setAttribute('aria-label', l ? 'Zug anhalten' : 'Zug fahren lassen');
  b.innerHTML = l ? '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2.5" fill="currentColor"/></svg>'
    : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15a1 1 0 0 0 1.5.86l12-7.5a1 1 0 0 0 0-1.72l-12-7.5A1 1 0 0 0 7 4.5z" fill="currentColor"/></svg>';
}
$('btnLos').addEventListener('click', () => { tonStart(); if (!zug) return; zug.laeuft = !zug.laeuft; ton('klick'); if (zug.laeuft) tuten(); losKnopf(); });
function tuten() { spiele('pfeife', 0.8); tutenPuls = 1; }
$('btnTuten').addEventListener('click', () => { tonStart(); tuten(); });
$('btnFolge').addEventListener('click', () => { tonStart(); ton('klick'); kam.folge = !kam.folge; $('btnFolge').classList.toggle('an', kam.folge); });
$('btnPause').addEventListener('click', () => { tonStart(); ton('klick'); oeffnePause(); });
function oeffnePause() { zustand = 'pause'; $('pause').hidden = false; tonTexte(); kontoHinweis('kontoBox'); neuBestaetigen = false; $('pNeu').lastElementChild.textContent = 'Neue Welt'; }
$('pWeiter').addEventListener('click', () => { ton('klick'); $('pause').hidden = true; zustand = 'spiel'; });
function tonTexte() { $('pTon').lastElementChild.textContent = 'Geräusche: ' + (welt.ton ? 'an' : 'aus'); $('pMusik').lastElementChild.textContent = 'Musik: ' + (welt.musik ? 'an' : 'aus'); }
$('pTon').addEventListener('click', () => { welt.ton = !welt.ton; tonSchalter(); tonTexte(); ton('klick'); speichere(); });
$('pMusik').addEventListener('click', () => { welt.musik = !welt.musik; tonSchalter(); tonTexte(); ton('klick'); speichere(); });
let neuBestaetigen = false;
$('pNeu').addEventListener('click', () => {
  if (!neuBestaetigen) { neuBestaetigen = true; $('pNeu').lastElementChild.textContent = 'Wirklich? Alles weg!'; ton('nein'); return; }
  const ton0 = welt.ton, musik0 = welt.musik;
  welt = L.neueWelt(); welt.ton = ton0; welt.musik = musik0;
  zug = L.neuerZug(welt, welt.zug);
  allesNeu(); kam.x = L.BREITE * 2; kam.z = 18 * 4; speichere(true);
  $('pause').hidden = true; zustand = 'spiel'; ton('jubel');
});

// Zugauswahl mit kleinen Bildern
const ZUGBILD = {};
function zugBilder() {
  let r2;
  try { r2 = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true }); } catch (e) { return; }
  r2.setSize(320, 200); r2.outputEncoding = THREE.sRGBEncoding; r2.setClearColor(0x000000, 0);
  const s = new THREE.Scene(); s.add(new THREE.HemisphereLight(farbe('#ffffff'), farbe('#8899aa'), 0.9));
  const d = new THREE.DirectionalLight(0xffffff, 0.55); d.position.set(-4, 8, 6); s.add(d);
  const cam = new THREE.PerspectiveCamera(30, 1.6, 0.1, 100);
  for (const [k, z] of Object.entries(L.ZUEGE)) {
    const g = new THREE.Group(); s.add(g);
    z.wagen.forEach((m, i) => { const mesh = new THREE.Mesh(GEO[m], MAT); mesh.position.z = -i * L.WAGEN_ABSTAND; mesh.rotation.y = (z.dreh && z.dreh[i]) || 0; g.add(mesh); });
    const mitteZ = -(z.wagen.length - 1) * L.WAGEN_ABSTAND / 2, weite = Math.max(4.5, z.wagen.length * 3.2);
    cam.position.set(weite * 0.95, weite * 0.62, mitteZ + weite * 0.62); cam.lookAt(0, 0.7, mitteZ);
    r2.render(s, cam);
    ZUGBILD[k] = r2.domElement.toDataURL('image/png');
    s.remove(g);
  }
  r2.dispose(); try { r2.forceContextLoss(); } catch (e) {}
}
function oeffneZuege() {
  zustand = 'pause';
  const liste = $('zugListe'); liste.innerHTML = '';
  for (const [k, z] of Object.entries(L.ZUEGE)) {
    const frei = welt.zuege.includes(k);
    const b = document.createElement('button'); b.type = 'button'; b.className = 'zugk' + (welt.zug === k ? ' an' : ''); b.disabled = !frei;
    b.innerHTML = (ZUGBILD[k] ? `<img src="${ZUGBILD[k]}" alt="">` : '<span style="font-size:40px">🚂</span>') + `<span>${z.name}</span>` + (frei ? '' : '<span class="schloss" aria-hidden="true">🔒</span>');
    b.setAttribute('aria-label', z.name + (frei ? '' : ' (noch gesperrt)'));
    b.addEventListener('click', () => {
      welt.zug = k; L.wechsleZug(welt, zug, k); baueZug(); speichere(); tuten();
      $('zuege').hidden = true; zustand = 'spiel';
    });
    liste.appendChild(b);
  }
  $('zuege').hidden = false;
}
$('btnZug').addEventListener('click', () => { tonStart(); ton('klick'); oeffneZuege(); });
$('zZu').addEventListener('click', () => { ton('klick'); $('zuege').hidden = true; zustand = 'spiel'; });

// Konto-Hinweis: nur ohne Anmeldung und erst, wenn es etwas zu verlieren gibt
function kontoHinweis(id) {
  const P = window.PlaySaal;
  let zeigen = false;
  try { zeigen = !!(P && P.hostOk && !P.user() && welt.fahrgaeste >= 6); } catch (e) { zeigen = false; }
  $(id).hidden = !zeigen;
}
function kontoAnlegen() { try { window.PlaySaal && window.PlaySaal.anmelden({}); } catch (e) { /* Konten nicht verfügbar */ } }
$('kontoBtn').addEventListener('click', kontoAnlegen);
$('kontoBtnMenu').addEventListener('click', kontoAnlegen);

$('btnSpielen').addEventListener('click', () => { tonStart(); ton('jubel'); $('start').hidden = true; zustand = 'spiel'; tuten(); zeigeTipp(); });

// ---------- Tipp für den Anfang ----------
function verbunden(a, b) {
  const start = Object.entries(welt.z).find(([, f]) => f.st === a), ziel = Object.entries(welt.z).find(([, f]) => f.st === b);
  if (!start || !ziel) return false;
  const gesehen = new Set([Number(start[0])]), offen = [Number(start[0])];
  while (offen.length) {
    const k = offen.pop(); if (k === Number(ziel[0])) return true;
    const c = k % L.BREITE, r = Math.floor(k / L.BREITE), f = welt.z[k];
    for (const l of (f && f.l) || []) for (const e of l) {
      const n = L.weiter(welt, c, r, e); if (!n) continue;
      const nk = L.idx(n.c, n.r); if (!gesehen.has(nk)) { gesehen.add(nk); offen.push(nk); }
    }
  }
  return false;
}
function zeigeTipp() {
  if (!welt.tipp || zustand !== 'spiel') { $('tipp').hidden = true; $('finger').hidden = true; return; }
  $('tippText').textContent = 'Male mit dem Finger ein Gleis zum anderen Bahnhof!';
  $('tipp').hidden = false;
}
function pruefeTipp() {
  if (!welt.tipp) return;
  if (verbunden(0, 1)) {
    welt.tipp = false; baueHilfe(); $('tipp').hidden = true; $('finger').hidden = true;
    ton('jubel'); toast('Super! Jetzt fährt der Zug von Bahnhof zu Bahnhof 🚂'); speichere();
  }
}
function setzeFinger(t) {
  const f = $('finger');
  if (!welt.tipp || zustand !== 'spiel' || zeichnen) { f.hidden = true; return; }
  const n = HILFE.length - 1, u = (t * 0.35) % 1.3, s = Math.min(1, u) * n, i = Math.min(n - 1, Math.floor(s)), a = s - i;
  const [x0, z0] = L.mitte(...HILFE[i]), [x1, z1] = L.mitte(...HILFE[i + 1]);
  const [sx, sy] = bildschirm(x0 + (x1 - x0) * a, z0 + (z1 - z0) * a), r = $('app').getBoundingClientRect();
  f.style.left = (sx - r.left) + 'px'; f.style.top = (sy - r.top) + 'px'; f.hidden = u > 1.15;
}

// ---------- Eingabe ----------
const zeiger = new Map();
let zeichnen = null, schwenk = null, pinch = null, letzterZeiger = null;
const besetzt = () => { const s = zug ? L.zugFelder(zug) : new Set(); return (k) => s.has(k); };

function nachAenderung(gleise = true) {
  if (gleise) baueGleise();
  baueBahnhoefe(); baueDeko();
  if (zug && zug.weg.length && !L.wegGueltig(welt, zug)) { L.setzeZugAufGleis(welt, zug); }
  if (zug && !zug.weg.length) L.setzeZugAufGleis(welt, zug);
  pruefeTipp();
  speichere();
}

function tippen(c, r) {
  if (!L.inWelt(c, r)) return;
  if (!L.feldOffen(welt, c, r)) { ton('nein'); const g = L.GEBIETE[welt.offen]; toast(`Bring ${g.ziel} Fahrgäste ans Ziel, dann verschwinden die Wolken! ☁️`); return; }
  const k = L.idx(c, r), f = welt.z[k];
  if (werkzeug === 'gleis') {
    if (L.stelleWeiche(welt, c, r)) { ton('klick'); baueGleise(); speichere(); return; }
    if (zug && L.zugFelder(zug).has(k)) { tuten(); return; }
  } else if (werkzeug === 'bahnhof') {
    if (f && f.st != null) {
      if (f.fest) { ton('nein'); toast('Dieser Bahnhof bleibt stehen 🚉'); return; }
      L.radiere(welt, c, r); ton('weg'); wolkeAuf(c, r); nachAenderung(false); return;
    }
    if (L.setzeBahnhof(welt, c, r)) { ton('jubel'); wolkeAuf(c, r); nachAenderung(false); }
    else { ton('nein'); toast('Bahnhöfe passen nur auf ein gerades Gleis 🛤️'); }
  }
}
function feldAktion(c, r, erstes) {
  if (!L.inWelt(c, r)) return;
  if (!L.feldOffen(welt, c, r)) return;
  const k = L.idx(c, r);
  if (werkzeug === 'baum' || werkzeug === 'haus') {
    const f = welt.z[k];
    if (f && f.d && !erstes) return;
    if (L.setzeDeko(welt, c, r, werkzeug, Math.floor(Math.random() * 8))) { ton('plopp', Math.random() * 6); wolkeAuf(c, r, 4); baueDeko(); speichere(); }
  } else if (werkzeug === 'radierer') {
    if (zug && L.zugFelder(zug).has(k) && welt.z[k] && welt.z[k].l) { if (erstes) { ton('nein'); toast('Da steht gerade der Zug 🚂'); } return; }
    const was = L.radiere(welt, c, r);
    if (was) { ton('weg'); wolkeAuf(c, r); nachAenderung(was === 'gleis'); }
  }
}

canvas.addEventListener('pointerdown', (e) => {
  if (zustand !== 'spiel') return;
  tonStart();
  canvas.setPointerCapture(e.pointerId);
  zeiger.set(e.pointerId, { x: e.clientX, y: e.clientY });
  letzterZeiger = { x: e.clientX, y: e.clientY };
  if (zeiger.size === 2) {        // zwei Finger: verschieben und zoomen
    zeichnen = null; marke.visible = false;
    const [a, b] = [...zeiger.values()];
    pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), zoom: kam.zoom, mitte: boden0((a.x + b.x) / 2, (a.y + b.y) / 2) };
    return;
  }
  if (zeiger.size > 2) return;
  const p = boden0(e.clientX, e.clientY), f = feldVon(p);
  if (werkzeug === 'hand' || !f) { schwenk = { p }; kam.folge = false; $('btnFolge').classList.remove('an'); return; }
  zeichnen = { felder: [f], bewegt: false, start: f };
  zeigeMarke(f);
  if (werkzeug !== 'gleis' && werkzeug !== 'bahnhof') feldAktion(f[0], f[1], true);
});
canvas.addEventListener('pointermove', (e) => {
  if (!zeiger.has(e.pointerId)) return;
  zeiger.set(e.pointerId, { x: e.clientX, y: e.clientY });
  letzterZeiger = { x: e.clientX, y: e.clientY };
  if (pinch && zeiger.size >= 2) {
    const [a, b] = [...zeiger.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    kam.zoom = pinch.zoom * pinch.d / Math.max(20, d); kameraGrenzen(); setzeKamera();
    const m = boden0((a.x + b.x) / 2, (a.y + b.y) / 2);
    if (m && pinch.mitte) { kam.x += pinch.mitte[0] - m[0]; kam.z += pinch.mitte[1] - m[1]; kameraGrenzen(); setzeKamera(); }
    kam.folge = false; $('btnFolge').classList.remove('an');
    return;
  }
  if (schwenk) {
    const p = boden0(e.clientX, e.clientY);
    if (p && schwenk.p) { kam.x += schwenk.p[0] - p[0]; kam.z += schwenk.p[1] - p[1]; kameraGrenzen(); setzeKamera(); }
    return;
  }
  if (zeichnen) bewegeZeichnen(e.clientX, e.clientY);
});
function bewegeZeichnen(px, py) {
  const f = feldVon(boden0(px, py));
  if (!f) return;
  const fs = zeichnen.felder, last = fs[fs.length - 1];
  if (f[0] === last[0] && f[1] === last[1]) return;
  zeichnen.bewegt = true;
  zeigeMarke(f);
  for (const n of L.felderZwischen(last, f)) {
    const vor = fs[fs.length - 2];
    if (vor && vor[0] === n[0] && vor[1] === n[1]) { fs.pop(); continue; }   // zurück: nichts bauen
    if (!L.inWelt(n[0], n[1])) break;
    fs.push(n);
    if (werkzeug === 'gleis') {
      if (!L.feldOffen(welt, n[0], n[1])) { ton('nein'); fs.pop(); break; }
      const hatteDeko = fs.slice(-3).filter(([c, r]) => welt.z[L.idx(c, r)] && welt.z[L.idx(c, r)].d);
      const g = L.zeichne(welt, fs.slice(-3), besetzt());
      if (g.length) {
        ton('plopp', Math.min(12, fs.length));
        hatteDeko.forEach(([c, r]) => { if (!welt.z[L.idx(c, r)] || !welt.z[L.idx(c, r)].d) wolkeAuf(c, r, 5); });
        nachAenderung(true);
      }
    } else if (werkzeug !== 'bahnhof') feldAktion(n[0], n[1], false);
  }
}
function ende(e) {
  if (!zeiger.has(e.pointerId)) return;
  zeiger.delete(e.pointerId);
  if (pinch) { if (zeiger.size < 2) pinch = null; if (zeiger.size === 1) { const [a] = [...zeiger.values()]; schwenk = { p: boden0(a.x, a.y) }; } return; }
  if (zeichnen && !zeichnen.bewegt && e.type === 'pointerup') tippen(zeichnen.start[0], zeichnen.start[1]);
  zeichnen = null; schwenk = null; marke.visible = false;
}
canvas.addEventListener('pointerup', ende);
canvas.addEventListener('pointercancel', ende);
canvas.addEventListener('wheel', (e) => { e.preventDefault(); kam.zoom *= e.deltaY > 0 ? 1.1 : 0.9; kameraGrenzen(); setzeKamera(); }, { passive: false });
function zeigeMarke(f) {
  if (!L.inWelt(f[0], f[1])) { marke.visible = false; return; }
  const [x, z] = L.mitte(f[0], f[1]);
  marke.position.set(x, 0.04, z); marke.visible = true;
  marke.material.color.set(werkzeug === 'radierer' ? 0xff5b4a : L.feldOffen(welt, f[0], f[1]) ? 0xffd21c : 0x9aa3b5);
}
// Beim Malen am Rand weiterschieben
function randSchieben(dt) {
  if (!zeichnen || !letzterZeiger || TEST) return;
  const r = canvas.getBoundingClientRect(), x = (letzterZeiger.x - r.left) / r.width, y = (letzterZeiger.y - r.top) / r.height;
  let dx = 0, dz = 0;
  if (x < 0.1) dx = -1; else if (x > 0.9) dx = 1;
  if (y < 0.2) dz = -1; else if (y > 0.74) dz = 1;
  if (!dx && !dz) return;
  const x0 = kam.x, z0 = kam.z;
  kam.x += dx * 11 * dt; kam.z += dz * 11 * dt; kameraGrenzen();
  if (kam.x !== x0 || kam.z !== z0) { setzeKamera(); bewegeZeichnen(letzterZeiger.x, letzterZeiger.y); }
}

// ---------- Ereignisse vom Zug ----------
function zugEreignis(art, z, f, n) {
  if (art === 'halt') { spiele('glocke', 0.55); }
  else if (art === 'ab') { spiele('pfeife', 0.5); tutenPuls = 0.6; }
  else if (art === 'aus') {
    const k = Object.keys(welt.z).find((kk) => welt.z[kk] === f), c = k % L.BREITE, r = Math.floor(k / L.BREITE), [x, zz] = L.mitte(c, r);
    plus(x, zz, '+' + n + ' 🧍'); ton('jubel'); zeigeGaeste(true);
    const g = L.pruefeFreischalten(welt);
    if (g) freigeschaltet(g);
    speichere();
  } else if (art === 'ein') { ton('plopp', 7); }
}
function freigeschaltet(g) {
  ton('fanfare'); setTimeout(tuten, 900);
  wolken.forEach((w) => { if (w.g === welt.offen - 1) w.weg = 0.001; });
  setTimeout(() => { baueBoden(); baueWolken(); baueGleise(); baueBahnhoefe(); setzeWerkzeug(werkzeug); }, 1600);
  const st = Object.entries(welt.z).find(([k, f]) => f.st != null && L.gebietVon(Math.floor(k / L.BREITE)) === welt.offen - 1);
  if (st) { const k = Number(st[0]); kam.flug = L.mitte(k % L.BREITE, Math.floor(k / L.BREITE)); kam.folge = false; $('btnFolge').classList.remove('an'); }
  const zn = g.zug ? L.ZUEGE[g.zug].name : null;
  toast(`Der ${g.name} ist offen! 🌲` + (zn ? ` Neuer Zug: ${zn} 🚄` : ''), 5000);
  zeigeGaeste(false);
}

// ---------- Hauptschleife ----------
let vorher = performance.now(), zeit = 0, fpsZeit = 0, fpsBilder = 0, langsam = 0;
function bild(jetzt) {
  requestAnimationFrame(bild);
  const dt = Math.min(0.05, (jetzt - vorher) / 1000); vorher = jetzt;
  if (zustand === 'laden') return;
  zeit += dt;
  if (zustand === 'spiel' || zustand === 'start') {
    if (zug) L.schritt(welt, zug, dt, zugEreignis);
    if (L.bahnsteigeFuellen(welt, dt).length) speichere();
  }
  if (kam.flug) {
    kam.x += (kam.flug[0] - kam.x) * Math.min(1, dt * 1.6); kam.z += (kam.flug[1] - kam.z) * Math.min(1, dt * 1.6);
    if (Math.hypot(kam.flug[0] - kam.x, kam.flug[1] - kam.z) < 0.3) kam.flug = null;
    kameraGrenzen(); setzeKamera();
  } else if (kam.folge && zug && zug.weg.length) {
    const [x, z] = L.wagenPos(zug, 0);
    kam.x += (x - kam.x) * Math.min(1, dt * 2.5); kam.z += (z - kam.z) * Math.min(1, dt * 2.5); kameraGrenzen(); setzeKamera();
  }
  randSchieben(dt);
  setzeZug(zeit, dt); setzeWartende(zeit); setzePfeile(zeit); setzeWolken(zeit, dt); setzePuffs(dt); setzeFinger(zeit);
  if (fahrtGain && zug) fahrtGain.gain.setTargetAtTime(zustand === 'spiel' ? 0.28 * zug.v / L.TEMPO : 0, ac.currentTime, 0.15);
  if (fahrtQuelle && zug) fahrtQuelle.playbackRate.setTargetAtTime(0.75 + 0.35 * zug.v / L.TEMPO, ac.currentTime, 0.2);
  renderer.render(scene, camera);
  // langsame Geräte: weniger Pixel
  fpsZeit += dt; fpsBilder++;
  if (fpsZeit > 2) { const fps = fpsBilder / fpsZeit; fpsZeit = 0; fpsBilder = 0; if (fps < 40 && pixel > 1) { if (++langsam >= 2) { pixel = Math.max(1, pixel - 0.5); renderer.setPixelRatio(pixel); groesse(); langsam = 0; } } else langsam = 0; window.__fps = fps; }
}

function allesNeu() {
  baueBoden(); baueGleise(); baueBahnhoefe(); baueDeko(); baueWolken(); baueHilfe(); baueZug();
  setzeWerkzeug(werkzeug); zeigeGaeste(false); losKnopf(); kameraGrenzen(); setzeKamera();
}

async function start() {
  try {
    await ladeModelle((a) => { $('ladeBalken').style.width = Math.round(a * 90) + '%'; });
  } catch (e) { $('ladeText').textContent = 'Die Bahn hat Verspätung – bitte neu laden.'; throw e; }
  GEO.bahnhof = GEO_BAHNHOF(); GEO.prellbock = GEO_PRELLBOCK(); GEO.pfeil = GEO_PFEIL();
  GEO.koerper = GEO_KOERPER(); GEO.kopf = GEO_KOPF();
  GEO.wolke = faerbe(new THREE.IcosahedronGeometry(1, 1), '#ffffff');
  instanz('puff', faerbe(new THREE.IcosahedronGeometry(1, 1), '#ffffff'), 90);
  zug = L.neuerZug(welt, welt.zug);
  groesse();
  allesNeu();
  zugBilder();
  $('ladeBalken').style.width = '100%';
  $('laden').hidden = true;
  zustand = 'start'; $('start').hidden = false;
  setTimeout(() => kontoHinweis('kontoBoxMenu'), 1500);   // playsaal.js lädt verzögert
}
requestAnimationFrame(bild);
start();

// ---------- Prüf-Schnittstelle (nur für Tests) ----------
if (TEST) {
  window.__tufftuff = {
    get zustand() { return zustand; }, get welt() { return welt; }, get zug() { return zug; }, get kam() { return kam; },
    L, bildschirm: (c, r) => { const [x, z] = L.mitte(c, r); return bildschirm(x, z); },
    vorspulen(sek) { for (let t = 0; t < sek; t += 1 / 30) { L.schritt(welt, zug, 1 / 30, zugEreignis); L.bahnsteigeFuellen(welt, 1 / 30); } },
    werkzeug: setzeWerkzeug, schaueAuf(c, r) { const [x, z] = L.mitte(c, r); kam.x = x; kam.z = z; kameraGrenzen(); setzeKamera(); },
    instanzen: () => Object.fromEntries(Object.entries(IM).map(([k, m]) => [k, m.count])),
  };
}
