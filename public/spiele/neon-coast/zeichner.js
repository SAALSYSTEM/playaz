// Neon Coast – Fluchtwagen: Zeichner. Canvas 2D, Draufsicht, Kamera dreht mit der Fahrtrichtung (vorn ist oben).
// Reihenfolge: Wasser, Bodenflächen (Muster), Markierungen, Bremsspuren, Dinge am Boden, Autos, Gebäude, Bäume,
// dann die Nacht (Lichtkarte, multipliziert) und zuletzt alles, was leuchtet (Neon, Scheinwerfer, Blaulicht).
import { GROESSE } from './bilder.js';
import { baueWelt, BODEN, NX, NY, Z, BREITE, HOEHE } from './welt.js';
import { wrap } from './engine.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, k) => a + (b - a) * k;

// ---------------------------------------------------------------- Bilder
export const IMG = {};
const basis = new URL('img/', import.meta.url);
export const bildUrl = (k) => new URL(k + '.webp', basis).href;
export async function ladeBilder() {
  await Promise.all(Object.keys(GROESSE).map((k) => new Promise((res) => {
    const i = new Image(); i.decoding = 'async';
    i.onload = () => { IMG[k] = i; res(); }; i.onerror = () => res();
    i.src = bildUrl(k);
  })));
  if (IMG.container) for (const [n, c] of [['blau', '#3a8dff'], ['gruen', '#2fbf71'], ['gelb', '#ffc93a'], ['lila', '#a77bff']]) IMG['container-' + n] = gefaerbt(IMG.container, c, 1);
}
function gefaerbt(i, farbe, deck) {
  const c = document.createElement('canvas'); c.width = i.naturalWidth || i.width; c.height = i.naturalHeight || i.height;
  const g = c.getContext('2d');
  g.drawImage(i, 0, 0); g.globalCompositeOperation = 'color'; g.globalAlpha = deck; g.fillStyle = farbe; g.fillRect(0, 0, c.width, c.height);
  g.globalAlpha = 1; g.globalCompositeOperation = 'destination-in'; g.drawImage(i, 0, 0);
  return c;
}
function dunkel(i) {
  const c = document.createElement('canvas'); c.width = i.naturalWidth || i.width; c.height = i.naturalHeight || i.height;
  const g = c.getContext('2d');
  g.drawImage(i, 0, 0); g.globalCompositeOperation = 'multiply'; g.fillStyle = '#4a4038'; g.fillRect(0, 0, c.width, c.height);
  g.globalCompositeOperation = 'destination-in'; g.drawImage(i, 0, 0);
  return c;
}
const LACK = [null, '#1ED6E0', '#FF5FA2', '#9BE564', '#FF9200', '#B48CFF', '#F4F4F8', '#FFD21C'];
const cache = new Map();
function variante(bild, art, farbe) {
  const key = bild + '|' + art + '|' + (farbe || '');
  let v = cache.get(key);
  if (!v && IMG[bild]) { v = art === 'wrack' ? dunkel(IMG[bild]) : gefaerbt(IMG[bild], farbe, 0.82); cache.set(key, v); }
  return v || IMG[bild];
}
const glows = new Map();
function glow(farbe) {
  let c = glows.get(farbe);
  if (!c) {
    c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, farbe); gr.addColorStop(0.35, farbe.replace(/[\d.]+\)$/, '0.5)')); gr.addColorStop(1, farbe.replace(/[\d.]+\)$/, '0)'));
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64); glows.set(farbe, c);
  }
  return c;
}
const rgba = (hex, a = 1) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };
let kegel = null;
function lichtkegel() {
  if (kegel) return kegel;
  const c = document.createElement('canvas'); c.width = 128; c.height = 96;
  const g = c.getContext('2d'), gr = g.createRadialGradient(0, 48, 2, 0, 48, 128);
  gr.addColorStop(0, 'rgba(255,246,214,1)'); gr.addColorStop(0.45, 'rgba(255,246,214,.5)'); gr.addColorStop(1, 'rgba(255,246,214,0)');
  g.fillStyle = gr; g.beginPath(); g.moveTo(0, 40); g.lineTo(128, 0); g.lineTo(128, 96); g.lineTo(0, 56); g.closePath(); g.fill();
  // weiche Ränder
  g.globalCompositeOperation = 'destination-in';
  const q = g.createLinearGradient(0, 0, 0, 96); q.addColorStop(0, 'rgba(0,0,0,0)'); q.addColorStop(0.3, '#000'); q.addColorStop(0.7, '#000'); q.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = q; g.fillRect(0, 0, 128, 96);
  return (kegel = c);
}
function rr(X, x, y, w, h, r) {
  X.beginPath(); X.moveTo(x + r, y); X.arcTo(x + w, y, x + w, y + h, r); X.arcTo(x + w, y + h, x, y + h, r); X.arcTo(x, y + h, x, y, r); X.arcTo(x, y, x + w, y, r); X.closePath();
}

// Bodenmuster: Bild und Kantenlänge einer Kachel in Metern
const MUSTER = {
  [BODEN.TIEF]: ['boden-meer', 26, '#0d3a66'], [BODEN.FLACH]: ['boden-flach', 18, '#2a9fb5'], [BODEN.SAND]: ['boden-sand', 14, '#e2c98f'],
  [BODEN.GRAS]: ['boden-gras', 10, '#4f9a45'], [BODEN.ASPHALT]: ['boden-asphalt', 12, '#343a4e'], [BODEN.GEHWEG]: ['boden-platten', 6, '#b9b1a2'],
  [BODEN.PFLASTER]: ['boden-pflaster', 8, '#85868f'], [BODEN.BETON]: ['boden-beton', 10, '#8e9097'], [BODEN.HOLZ]: [null, 2, '#8a5f3a']
};
const AMBIENT = 'rgb(84,90,156)';
const VIERTEL_NEON = { stadt: 1, strand: 1, platz: 1, versteckStadt: 1 };

export function neuerZeichner(cv) {
  const X = cv.getContext('2d', { alpha: false });
  const W = baueWelt();
  const lm = document.createElement('canvas'), L = lm.getContext('2d');
  let vw = 360, vh = 640, dpr = 1, dprMax = 2, cw = 360, ch = 640, basisPpm = 9.5;
  const cam = { x: W.start.x, y: W.start.y, a: 0, zoom: 1, bereit: false };
  const T = { c: 1, s: 0, ppm: 9, cx: 180, cy: 400 };   // aktuelle Abbildung Welt -> Bildschirm (CSS-Pixel)
  let uhr = 0, wackel = 0, wx = 0, wy = 0, licht = true;
  const pat = {};
  let parts = [], spuren = [], truemmer = [], pops = [], leute = [];
  const letzteRad = new Map();

  // ---------- Raster fürs Zeichnen (40 m): Dinge je Ebene, Gebäude, Laternen
  const RG = 40, rgx = Math.ceil(BREITE / RG), rgy = Math.ceil(HOEHE / RG);
  const raster = Array.from({ length: rgx * rgy }, () => ({ d: [[], [], []], g: [], l: [] }));
  const zelle = (x, y) => raster[clamp(Math.floor(y / RG), 0, rgy - 1) * rgx + clamp(Math.floor(x / RG), 0, rgx - 1)];
  W.dinge.forEach((d, n) => { zelle(d.x, d.y).d[d.ebene].push(n); if (d.licht) zelle(d.x, d.y).l.push(n); });
  W.gebaeude.forEach((g, n) => zelle(g.x, g.y).g.push(n));
  W.bloecke.forEach((b, n) => { b.nr = n; });

  // ---------- Stadtplan (ein Pixel je 2-m-Zelle) für Radar und Pause
  const karte = document.createElement('canvas'); karte.width = NX; karte.height = NY;
  {
    const g = karte.getContext('2d'), im = g.createImageData(NX, NY), F = { 0: [9, 30, 58], 1: [18, 78, 104], 2: [150, 132, 88], 3: [38, 84, 52], 4: [52, 57, 80], 5: [98, 102, 122], 6: [84, 86, 104], 7: [90, 93, 106], 8: [116, 84, 52] };
    for (let k = 0; k < NX * NY; k++) { const c = F[W.boden[k]]; im.data[k * 4] = c[0]; im.data[k * 4 + 1] = c[1]; im.data[k * 4 + 2] = c[2]; im.data[k * 4 + 3] = 255; }
    g.putImageData(im, 0, 0);
    for (const b of W.gebaeude) { if (b.bild === 'tank-dach') continue; g.fillStyle = '#1a1d30'; g.fillRect(b.bb.x0 / Z, b.bb.y0 / Z, (b.bb.x1 - b.bb.x0) / Z, (b.bb.y1 - b.bb.y0) / Z); g.fillStyle = rgba(b.neon, 0.55); g.fillRect(b.bb.x0 / Z, b.bb.y0 / Z, (b.bb.x1 - b.bb.x0) / Z, 1); }
  }

  function groesse(schaerfe) {
    if (schaerfe) dprMax = schaerfe;
    vw = Math.max(200, window.innerWidth); vh = Math.max(200, window.innerHeight);
    dpr = Math.min(window.devicePixelRatio || 1, dprMax);
    cw = cv.width = Math.round(vw * dpr); ch = cv.height = Math.round(vh * dpr);
    lm.width = Math.ceil(cw / 4); lm.height = Math.ceil(ch / 4);
    basisPpm = Math.min(vw / 38, vh / 60);
    for (const k of Object.keys(pat)) delete pat[k];
  }
  // so weit kann man höchstens sehen (für den Nachschub außerhalb des Bildes)
  const sichtweite = () => Math.hypot(vw / 2, Math.min(vh * 0.66, vh - 250) + 10) / (basisPpm * 0.78) + 6;

  function muster(t) {
    if (pat[t]) return pat[t];
    const [bild, meter, farbe] = MUSTER[t];
    let p = farbe;
    if (bild && IMG[bild]) { p = X.createPattern(IMG[bild], 'repeat'); if (p.setTransform) p.setTransform(new DOMMatrix().scale(meter / IMG[bild].naturalWidth)); }
    else if (t === BODEN.HOLZ) {
      const c = document.createElement('canvas'); c.width = 64; c.height = 64; const g = c.getContext('2d');
      g.fillStyle = '#8a5f3a'; g.fillRect(0, 0, 64, 64);
      for (let i = 0; i < 4; i++) { g.fillStyle = i % 2 ? '#93683f' : '#7d5533'; g.fillRect(0, i * 16, 64, 15); g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(0, i * 16 + 15, 64, 1); g.fillRect((i * 23) % 64, i * 16, 1, 15); }
      p = X.createPattern(c, 'repeat'); if (p.setTransform) p.setTransform(new DOMMatrix().scale(meter / 64));
    }
    return (pat[t] = p);
  }

  // ---------- Abbildung
  const sx = (x, y) => T.cx + ((x - cam.x) * T.c - (y - cam.y) * T.s) * T.ppm;
  const sy = (x, y) => T.cy + ((x - cam.x) * T.s + (y - cam.y) * T.c) * T.ppm;
  const sichtbar = (x, y, r) => { const a = sx(x, y), b = sy(x, y), m = r * T.ppm; return a > -m && a < vw + m && b > -m && b < vh + m; };
  function welt(C, k) {   // Welt-Transformation auf einem Kontext, k = Gerätepixel je CSS-Pixel
    const m = T.ppm * k;
    C.setTransform(T.c * m, T.s * m, -T.s * m, T.c * m, (T.cx + wx) * k - (cam.x * T.c - cam.y * T.s) * m, (T.cy + wy) * k - (cam.x * T.s + cam.y * T.c) * m);
  }
  const B = { x0: 0, y0: 0, x1: 0, y1: 0 };
  function grenzen() {
    B.x0 = B.y0 = 1e9; B.x1 = B.y1 = -1e9;
    for (const [px, py] of [[0, 0], [vw, 0], [0, vh], [vw, vh]]) {
      const ux = (px - T.cx) / T.ppm, uy = (py - T.cy) / T.ppm, x = cam.x + ux * T.c + uy * T.s, y = cam.y - ux * T.s + uy * T.c;
      if (x < B.x0) B.x0 = x; if (x > B.x1) B.x1 = x; if (y < B.y0) B.y0 = y; if (y > B.y1) B.y1 = y;
    }
  }
  function zellen(rand, fn) {
    const i0 = clamp(Math.floor((B.x0 - rand) / RG), 0, rgx - 1), i1 = clamp(Math.floor((B.x1 + rand) / RG), 0, rgx - 1), j0 = clamp(Math.floor((B.y0 - rand) / RG), 0, rgy - 1), j1 = clamp(Math.floor((B.y1 + rand) / RG), 0, rgy - 1);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) fn(raster[j * rgx + i]);
  }

  // ---------- Effekte
  const funke = (x, y, n, staerke = 1) => { for (let i = 0; i < n && parts.length < 420; i++) { const a = Math.random() * TAU, v = (3 + Math.random() * 9) * staerke; parts.push({ typ: 1, x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: 0, life: 0.25 + Math.random() * 0.3, r: 0.12, col: Math.random() < 0.5 ? '#ffd27a' : '#fff4c9' }); } };
  const rauch = (x, y, col, r0 = 0.5, life = 1.1, vx = 0, vy = 0) => { if (parts.length < 420) parts.push({ typ: 0, x: x + (Math.random() - 0.5) * 0.6, y: y + (Math.random() - 0.5) * 0.6, vx: vx + (Math.random() - 0.5), vy: vy + (Math.random() - 0.5), t: 0, life, r: r0, col }); };
  function effekt(e, S) {
    if (e.t === 'krach') { const k = clamp(e.s / 14, 0.15, 1); if (e.mit !== 'fern') wackel = Math.max(wackel, 3 + 13 * k); funke(e.x, e.y, Math.round(4 + 14 * k), 0.6 + k); if (k > 0.5) for (let i = 0; i < 4; i++) rauch(e.x, e.y, 'rgba(150,150,160,', 0.6, 0.9); }
    else if (e.t === 'funke') funke(e.x, e.y, 2, 0.5);
    else if (e.t === 'ding') {
      const d = W.dinge[e.i], v = Math.hypot(e.vx, e.vy) || 1, q = (Math.random() - 0.5) * 0.9;
      if (truemmer.length > 90) truemmer.shift();
      truemmer.push({ bild: d.bild, x: d.x, y: d.y, g: d.g, rot: d.rot, vx: (e.vx * Math.cos(q) - e.vy * Math.sin(q)) * 0.95, vy: (e.vx * Math.sin(q) + e.vy * Math.cos(q)) * 0.95, vr: (Math.random() - 0.5) * (6 + v * 0.5), t: 0 });
      if (d.bild === 'hecke' || d.bild === 'busch') for (let i = 0; i < 6; i++) rauch(d.x, d.y, 'rgba(90,170,80,', 0.35, 0.7, e.vx * 0.3, e.vy * 0.3);
      else if (d.bild === 'laterne') funke(d.fx, d.fy, 8, 0.8);
      if (e.eigen) wackel = Math.max(wackel, 2.5);
    }
    else if (e.t === 'koffer') { pops.push({ x: e.x, y: e.y, text: '+' + e.betrag.toLocaleString('de-DE') + ' $', sub: e.m > 1 ? '×' + String(e.m).replace('.', ',') : '', col: '#FFD21C', t: 0, life: 1.5, gr: 1.25 }); for (let i = 0; i < 14; i++) funke(e.x, e.y, 1, 0.9); }
    else if (e.t === 'haarscharf') pops.push({ x: S.sp.x, y: S.sp.y, text: 'HAARSCHARF', sub: '+' + e.bonus + ' $', col: '#1ED6E0', t: 0, life: 1.1, gr: 0.9 });
    else if (e.t === 'schrott') { pops.push({ x: e.x, y: e.y, text: e.wasser ? 'VERSENKT' : 'SCHROTT', sub: '+' + e.bonus + ' $', col: '#FF5FA2', t: 0, life: 1.4, gr: 1 }); wackel = Math.max(wackel, 9); for (let i = 0; i < 12; i++) rauch(e.x, e.y, 'rgba(60,60,70,', 0.9, 1.6); funke(e.x, e.y, 16, 1.2); }
    else if (e.t === 'platsch') { for (let i = 0; i < 22 && parts.length < 420; i++) { const a = Math.random() * TAU, v = 2 + Math.random() * 7; parts.push({ typ: 0, x: e.x, y: e.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: 0, life: 0.9 + Math.random() * 0.5, r: 0.5, col: 'rgba(220,245,255,' }); } parts.push({ typ: 2, x: e.x, y: e.y, vx: 0, vy: 0, t: 0, life: 1.4, r: 1, col: 'rgba(230,250,255,' }); if (e.eigen) wackel = 12; }
    else if (e.t === 'nitro') wackel = Math.max(wackel, 6);
  }

  // ---------- Fußgänger (nur Stimmung: laufen auf den Gehwegen und springen vor Autos zur Seite)
  const FIG = ['figur-mann', 'figur-frau', 'figur-business', 'figur-hafen'];
  function ort(p) {   // Position auf dem Gehweg-Umlauf eines Blocks
    const b = p.b, w = b.x1 - b.x0 - 4, h = b.y1 - b.y0 - 4, U = 2 * (w + h);
    let u = ((p.u % U) + U) % U;
    if (u < w) { p.x = b.x0 + 2 + u; p.y = b.y0 + 2; p.a = 0; }
    else if (u < w + h) { p.x = b.x1 - 2; p.y = b.y0 + 2 + (u - w); p.a = Math.PI / 2; }
    else if (u < 2 * w + h) { p.x = b.x1 - 2 - (u - w - h); p.y = b.y1 - 2; p.a = Math.PI; }
    else { p.x = b.x0 + 2; p.y = b.y1 - 2 - (u - 2 * w - h); p.a = -Math.PI / 2; }
    if (p.dir < 0) p.a += Math.PI;
  }
  function leuteSchritt(S, dt) {
    if (leute.length < 16 && Math.random() < 0.5) {
      const b = W.bloecke[Math.floor(Math.random() * W.bloecke.length)];
      if (Math.abs((b.x0 + b.x1) / 2 - cam.x) < 110 && Math.abs((b.y0 + b.y1) / 2 - cam.y) < 110) {
        const p = { b, u: Math.random() * 400, dir: Math.random() < 0.5 ? 1 : -1, v: 1.1 + Math.random() * 0.6, typ: b.typ === 'lager' || b.typ === 'container' || b.typ === 'versteckHafen' ? 3 : Math.floor(Math.random() * 3), ph: Math.random() * 3, ox: 0, oy: 0, sp: 0, jx: 0, jy: 0, halt: 0, x: 0, y: 0, a: 0 };
        ort(p); if (!cam.bereit || !sichtbar(p.x, p.y, 2)) leute.push(p);
      }
    }
    for (let i = leute.length - 1; i >= 0; i--) {
      const p = leute[i];
      if (Math.abs(p.x - cam.x) + Math.abs(p.y - cam.y) > 190) { leute.splice(i, 1); continue; }
      if (p.sp > 0) { p.sp -= dt; p.ox += p.jx * dt; p.oy += p.jy * dt; continue; }
      if (p.halt > 0) { p.halt -= dt; continue; }
      p.ox *= 1 - 2.5 * dt; p.oy *= 1 - 2.5 * dt;
      p.u += p.dir * p.v * dt; p.ph += p.v * dt * 2.6; ort(p);
      if (S) for (const c of S.autos) {
        if (c.ruht) continue;
        const rx = c.x - p.x - p.ox, ry = c.y - p.y - p.oy; if (rx > 16 || rx < -16 || ry > 16 || ry < -16) continue;
        const v2 = c.vx * c.vx + c.vy * c.vy; if (v2 < 16) continue;
        const tt = clamp(-(rx * c.vx + ry * c.vy) / v2, 0, 0.75), qx = rx + c.vx * tt, qy = ry + c.vy * tt;
        if (qx * qx + qy * qy > 6.8) continue;
        const v = Math.sqrt(v2), nx = -c.vy / v, ny = c.vx / v, seite = -(rx * nx + ry * ny) >= 0 ? 1 : -1;
        p.sp = 0.3; p.jx = nx * seite * 9; p.jy = ny * seite * 9; p.halt = 1.4; p.ruf = uhr; break;
      }
    }
  }

  // ---------- ein Bild
  // z: { modus: 'spiel' | 'menue', dt }
  function zeichne(S, al, dt, menue) {
    uhr += dt;
    const sp = S ? S.sp : null;
    // --- Kamera
    if (sp) {
      const px = sp.px + (sp.x - sp.px) * al, py = sp.py + (sp.y - sp.py) * al, pa = sp.pa + wrap(sp.a - sp.pa) * al;
      const v = Math.hypot(sp.vx, sp.vy), vf = sp.vx * Math.cos(sp.a) + sp.vy * Math.sin(sp.a);
      let ziel = pa;
      if (vf > 3) ziel = pa + wrap(Math.atan2(sp.vy, sp.vx) - pa) * 0.6 * clamp((vf - 3) / 6, 0, 1);
      if (!cam.bereit) { cam.a = ziel; cam.zoom = 1; cam.bereit = true; }
      cam.a += wrap(ziel - cam.a) * Math.min(1, 4.2 * dt);
      cam.zoom += (lerp(1, 0.78, clamp(v / 30, 0, 1)) - cam.zoom) * Math.min(1, 1.6 * dt);
      cam.x = px; cam.y = py;
    } else { cam.a += dt * 0.03; cam.zoom = 0.8; }
    const th = -(cam.a + Math.PI / 2);
    T.c = Math.cos(th); T.s = Math.sin(th); T.ppm = basisPpm * cam.zoom; T.cx = vw / 2; T.cy = menue ? vh * 0.5 : Math.min(vh * 0.66, vh - 250);
    wackel = Math.max(0, wackel - dt * 40); wx = (Math.random() - 0.5) * wackel; wy = (Math.random() - 0.5) * wackel;
    grenzen();
    leuteSchritt(S, dt);

    // --- Boden
    X.setTransform(1, 0, 0, 1, 0, 0); X.globalAlpha = 1; X.globalCompositeOperation = 'source-over';
    X.fillStyle = '#0d3a66'; X.fillRect(0, 0, cw, ch);
    welt(X, dpr);
    X.fillStyle = muster(BODEN.TIEF); X.fillRect(B.x0, B.y0, B.x1 - B.x0, B.y1 - B.y0);
    for (const f of W.flaechen) {
      if (f.x1 < B.x0 || f.x0 > B.x1 || f.y1 < B.y0 || f.y0 > B.y1) continue;
      X.fillStyle = muster(f.t); X.fillRect(f.x0, f.y0, f.x1 - f.x0, f.y1 - f.y0);
    }
    // Brandung am Strand
    if (B.y1 > 664) { const w = Math.sin(uhr * 0.9) * 0.8; X.fillStyle = 'rgba(255,255,255,.5)'; X.fillRect(Math.max(B.x0, 30), 671.2 + w, Math.min(B.x1, 646) - Math.max(B.x0, 30), 0.5); X.fillStyle = 'rgba(255,255,255,.25)'; X.fillRect(Math.max(B.x0, 30), 673.5 + w * 1.4, Math.min(B.x1, 646) - Math.max(B.x0, 30), 0.35); }
    // Bordsteine
    X.lineWidth = 0.3; X.strokeStyle = 'rgba(225,228,240,.55)';
    for (const b of W.bloecke) { if (b.x1 < B.x0 || b.x0 > B.x1 || b.y1 < B.y0 || b.y0 > B.y1) continue; X.strokeRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0); }
    // Fahrbahnmarkierungen
    for (const k of W.kanten) {
      if (k.a > k.b) continue;
      const ex = k.x0 + k.dx * k.len, ey = k.y0 + k.dy * k.len;
      if (Math.max(k.x0, ex) < B.x0 - 12 || Math.min(k.x0, ex) > B.x1 + 12 || Math.max(k.y0, ey) < B.y0 - 12 || Math.min(k.y0, ey) > B.y1 + 12) continue;
      const breit = k.breite > 14;
      X.strokeStyle = 'rgba(255,205,70,.85)'; X.lineWidth = 0.16;
      if (breit) { X.setLineDash([]); for (const o of [-0.22, 0.22]) { X.beginPath(); X.moveTo(k.x0 + k.dx * 4 + k.nx * o, k.y0 + k.dy * 4 + k.ny * o); X.lineTo(ex - k.dx * 4 + k.nx * o, ey - k.dy * 4 + k.ny * o); X.stroke(); } }
      else { X.setLineDash([2.6, 3.4]); X.beginPath(); X.moveTo(k.x0 + k.dx * 4, k.y0 + k.dy * 4); X.lineTo(ex - k.dx * 4, ey - k.dy * 4); X.stroke(); }
      if (breit) { X.strokeStyle = 'rgba(240,240,250,.7)'; X.setLineDash([2.4, 3.6]); for (const o of [-5, 5]) { X.beginPath(); X.moveTo(k.x0 + k.dx * 4 + k.nx * o, k.y0 + k.dy * 4 + k.ny * o); X.lineTo(ex - k.dx * 4 + k.nx * o, ey - k.dy * 4 + k.ny * o); X.stroke(); } }
      // Zebrastreifen an beiden Enden
      X.strokeStyle = 'rgba(240,240,250,.62)'; X.lineWidth = 2.2; X.setLineDash([0.55, 0.6]);
      const hb = k.breite / 2 - 0.5;
      for (const s of [1.6, k.len - 1.6]) { const mx = k.x0 + k.dx * s, my = k.y0 + k.dy * s; X.beginPath(); X.moveTo(mx - k.nx * hb, my - k.ny * hb); X.lineTo(mx + k.nx * hb, my + k.ny * hb); X.stroke(); }
    }
    X.setLineDash([]);
    // Bremsspuren
    if (spuren.length) {
      X.strokeStyle = 'rgba(8,8,14,.5)'; X.lineWidth = 0.26; X.lineCap = 'round'; X.beginPath();
      for (const s of spuren) { if (s.x0 < B.x0 - 2 || s.x0 > B.x1 + 2 || s.y0 < B.y0 - 2 || s.y0 > B.y1 + 2) continue; X.moveTo(s.x0, s.y0); X.lineTo(s.x1, s.y1); }
      X.stroke(); X.lineCap = 'butt';
      if (spuren.length > 700) spuren.splice(0, spuren.length - 700);
    }

    // --- Einfahrten (Versteck grün, Werkstatt türkis)
    if (S && !menue) {
      for (const [liste, farbe] of [[W.verstecke, '#3DF08A'], [W.werkstaetten, '#1ED6E0']]) for (const v of liste) {
        if (!sichtbar(v.x, v.y, 20)) continue;
        const zu = (S.sterne > 0 && S.gesehen) || (S.zu.get(v) || 0) > S.t, col = zu ? '#FF4A5E' : farbe;
        const rx = Math.cos(v.raus), ry = Math.sin(v.raus), quer = Math.abs(ry) > 0.5, tief = quer ? v.by : v.bx, breit = quer ? v.bx : v.by;
        X.save(); X.translate(v.x, v.y); X.rotate(v.raus);
        X.fillStyle = rgba(col, 0.13 + 0.07 * Math.sin(uhr * 4)); X.fillRect(-tief, -breit, tief * 2 + 5, breit * 2);
        X.strokeStyle = rgba(col, 0.9); X.lineWidth = 0.3; X.strokeRect(-tief, -breit, tief * 2 + 5, breit * 2);
        X.lineWidth = 0.5; X.lineCap = 'round';
        for (let i = 0; i < 3; i++) { const u = 5.5 - i * 2.2 - ((uhr * 2.5) % 2.2); if (u < -tief + 0.6) continue; X.globalAlpha = 0.85; X.beginPath(); X.moveTo(u + 1.1, -2.2); X.lineTo(u, 0); X.lineTo(u + 1.1, 2.2); X.stroke(); }
        X.restore(); X.globalAlpha = 1; X.lineCap = 'butt';
      }
      // Koffer: Lichtkreis am Boden
      for (const k of S.koffer) { if (!sichtbar(k.x, k.y, 6)) continue; const p = 0.5 + 0.5 * Math.sin(uhr * 5 + k.id); X.strokeStyle = `rgba(255,210,28,${0.5 + 0.4 * p})`; X.lineWidth = 0.35; X.beginPath(); X.arc(k.x, k.y, 2.2 + p * 0.9, 0, TAU); X.stroke(); X.fillStyle = 'rgba(255,210,28,.16)'; X.fill(); }
    }

    // --- Schatten der Gebäude, Dinge am Boden
    X.fillStyle = 'rgba(6,8,22,.42)';
    zellen(30, (z) => { for (const n of z.g) { const g = W.gebaeude[n]; if (g.ueber) continue; for (const b of g.boxen) X.fillRect(b.x0 + 1.1, b.y0 + 1.5, b.x1 - b.x0, b.y1 - b.y0); } });
    dinge(S, 0);
    // Trümmer (umgefahrene Dinge)
    for (let i = truemmer.length - 1; i >= 0; i--) {
      const t = truemmer[i]; t.t += dt; t.x += t.vx * dt; t.y += t.vy * dt; t.rot += t.vr * dt;
      const br = Math.max(0, 1 - 3.2 * dt); t.vx *= br; t.vy *= br; t.vr *= br;
      if (t.t > 16) { truemmer.splice(i, 1); continue; }
      const im = IMG[t.bild]; if (!im || !sichtbar(t.x, t.y, 5)) continue;
      const k = t.g / Math.max(im.naturalWidth, im.naturalHeight);
      X.save(); X.globalAlpha = t.t > 13 ? (16 - t.t) / 3 : 1; X.translate(t.x, t.y); X.rotate(t.rot); X.drawImage(im, -im.naturalWidth * k / 2, -im.naturalHeight * k / 2, im.naturalWidth * k, im.naturalHeight * k); X.restore();
    }
    X.globalAlpha = 1;

    // --- Fußgänger
    for (const p of leute) {
      const x = p.x + p.ox, y = p.y + p.oy; if (!sichtbar(x, y, 2)) continue;
      const im = IMG[FIG[p.typ]]; if (!im) continue;
      const fw = im.naturalWidth / 3, h = p.sp > 0 ? 1.5 : 1.3, w = h * fw / im.naturalHeight, f = p.halt > 0 && p.sp <= 0 ? 1 : Math.floor(p.ph) % 3;
      X.save(); X.translate(x, y); X.rotate(p.a + Math.PI / 2); X.fillStyle = 'rgba(0,0,0,.3)'; X.beginPath(); X.ellipse(0.12, 0.15, 0.4, 0.3, 0, 0, TAU); X.fill();
      X.drawImage(im, f * fw, 0, fw, im.naturalHeight, -w / 2, -h / 2, w, h); X.restore();
    }

    // --- Autos
    if (S) {
      for (const c of S.autos) {
        const x = c.ruht ? c.x : c.px + (c.x - c.px) * al, y = c.ruht ? c.y : c.py + (c.y - c.py) * al;
        if (!sichtbar(x, y, 5)) { letzteRad.delete(c.id); continue; }
        const a = c.ruht ? c.a : c.pa + wrap(c.a - c.pa) * al;
        c.zx = x; c.zy = y; c.za = a;
        const tot = c.hp <= 0 && c !== sp;
        let im = IMG[c.bild];
        if (tot) im = variante(c.bild, 'wrack'); else if (c === sp && LACK[S.lack % LACK.length]) im = variante(c.bild, 'lack', LACK[S.lack % LACK.length]);
        if (!im) { X.save(); X.translate(x, y); X.rotate(a); X.fillStyle = c.bild.startsWith('polizei') ? '#223' : '#c44'; X.fillRect(-c.l / 2, -c.b / 2, c.l, c.b); X.restore(); continue; }
        const h = c.l * 1.04, w = h * (im.naturalWidth || im.width) / (im.naturalHeight || im.height);
        X.save(); X.translate(x, y); X.rotate(a + Math.PI / 2);
        X.fillStyle = 'rgba(4,6,18,.4)'; rr(X, -w * 0.4 + 0.3, -h / 2 + 0.45, w * 0.8, h, 0.6); X.fill();
        X.drawImage(im, -w / 2, -h / 2, w, h);
        X.restore();
        // Rauch bei Schaden, Bremsspuren beim Rutschen, Staub abseits der Straße
        const v = Math.hypot(c.vx, c.vy), q = c.hp / c.hpMax;
        if (q < 0.4 && Math.random() < (tot ? 0.25 : 0.5 - q)) rauch(x + Math.cos(a) * c.hl, y + Math.sin(a) * c.hl, q < 0.15 ? 'rgba(40,40,46,' : 'rgba(170,170,180,', 0.45, 1.3, c.vx * 0.3, c.vy * 0.3);
        if (c.art === 'spieler' || c.art === 'polizei') {
          if ((c.rutsch > 2.6 || c.hand) && v > 5 && c.boden !== BODEN.FLACH) {
            const fx = Math.cos(a), fy = Math.sin(a), alt = letzteRad.get(c.id), neu = [x - fx * c.hl - fy * c.b * 0.4, y - fy * c.hl + fx * c.b * 0.4, x - fx * c.hl + fy * c.b * 0.4, y - fy * c.hl - fx * c.b * 0.4];
            if (alt && Math.abs(alt[0] - neu[0]) + Math.abs(alt[1] - neu[1]) < 3) { spuren.push({ x0: alt[0], y0: alt[1], x1: neu[0], y1: neu[1] }, { x0: alt[2], y0: alt[3], x1: neu[2], y1: neu[3] }); }
            letzteRad.set(c.id, neu);
            if (c.rutsch > 5 && Math.random() < 0.5) rauch(neu[0], neu[1], 'rgba(215,215,225,', 0.4, 0.6, c.vx * 0.2, c.vy * 0.2);
          } else letzteRad.delete(c.id);
          if (v > 6 && (c.boden === BODEN.SAND || c.boden === BODEN.GRAS) && Math.random() < 0.5) rauch(x - Math.cos(a) * c.hl, y - Math.sin(a) * c.hl, c.boden === BODEN.SAND ? 'rgba(226,203,150,' : 'rgba(110,150,90,', 0.4, 0.7);
          if (v > 3 && c.boden === BODEN.FLACH && Math.random() < 0.6) rauch(x, y, 'rgba(225,245,255,', 0.5, 0.6);
        }
        if (c === sp && c.nitro) for (let i = 0; i < 2; i++) parts.push({ typ: 0, x: x - Math.cos(a) * (c.l / 2 + 0.2), y: y - Math.sin(a) * (c.l / 2 + 0.2), vx: -Math.cos(a) * 6 + (Math.random() - 0.5) * 2, vy: -Math.sin(a) * 6 + (Math.random() - 0.5) * 2, t: 0, life: 0.3, r: 0.4, col: Math.random() < 0.5 ? 'rgba(255,150,40,' : 'rgba(120,220,255,', hell: true });
      }
    }
    dinge(S, 1);

    // --- Gebäude
    zellen(30, (z) => {
      for (const n of z.g) {
        const g = W.gebaeude[n]; if (g.ueber) continue;
        const im = IMG[g.bild]; if (!im || g.bb.x1 < B.x0 || g.bb.x0 > B.x1 || g.bb.y1 < B.y0 || g.bb.y0 > B.y1) continue;
        X.save(); X.translate(g.x, g.y); if (g.rot) X.rotate(g.rot * Math.PI / 2); X.drawImage(im, -g.b / 2, -g.h / 2, g.b, g.h); X.restore();
      }
    });
    dinge(S, 2);
    zellen(30, (z) => { for (const n of z.g) { const g = W.gebaeude[n]; if (!g.ueber || !IMG[g.bild]) continue; X.save(); X.translate(g.x, g.y); if (g.rot) X.rotate(g.rot * Math.PI / 2); X.globalAlpha = 0.93; X.drawImage(IMG[g.bild], -g.b / 2, -g.h / 2, g.b, g.h); X.restore(); } });
    X.globalAlpha = 1;

    // --- Rauch, Funken (dunkle Teilchen vor dem Licht)
    teilchen(dt, false);

    // --- Nacht
    if (licht) nacht(S, al);
    leuchten(S);
    teilchen(0, true);

    // --- Bildschirm-Ebene: Koffer, Schilder, Zahlen, Wegweiser, Radar
    X.setTransform(dpr, 0, 0, dpr, 0, 0); X.globalCompositeOperation = 'source-over';
    if (S && !menue && !window.__ncFoto) oben(S, dt);
  }

  function dinge(S, ebene) {
    zellen(12, (z) => {
      for (const n of z.d[ebene]) {
        const d = W.dinge[n];
        if (d.x < B.x0 - 6 || d.x > B.x1 + 6 || d.y < B.y0 - 6 || d.y > B.y1 + 6) continue;
        if (d.weich && S && S.weg[d.wi]) continue;
        const im = IMG[d.bild]; if (!im) continue;
        const iw = im.naturalWidth || im.width, ih = im.naturalHeight || im.height, k = d.g / Math.max(iw, ih);
        let al = 1;
        if (ebene === 2 && S && d.g > 4 && d.bild !== 'laterne') { const dx = S.sp.x - d.x, dy = S.sp.y - d.y; if (dx * dx + dy * dy < d.g * d.g * 0.3) al = 0.45; }
        X.globalAlpha = al;
        if (d.rot) { X.save(); X.translate(d.x, d.y); X.rotate(d.rot); X.drawImage(im, -iw * k / 2, -ih * k / 2, iw * k, ih * k); X.restore(); }
        else X.drawImage(im, d.x - iw * k / 2, d.y - ih * k / 2, iw * k, ih * k);
      }
    });
    X.globalAlpha = 1;
  }

  function teilchen(dt, hell) {
    if (hell) X.globalCompositeOperation = 'lighter';
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      if (!hell) { p.t += dt; if (p.t >= p.life) { parts.splice(i, 1); continue; } p.x += p.vx * dt; p.y += p.vy * dt; const br = 1 - 2.2 * dt; p.vx *= br; p.vy *= br; }
      const istHell = p.typ === 1 || p.hell;
      if (istHell !== hell) continue;
      if (p.x < B.x0 - 3 || p.x > B.x1 + 3 || p.y < B.y0 - 3 || p.y > B.y1 + 3) continue;
      const k = p.t / p.life;
      if (p.typ === 1) { X.strokeStyle = p.col; X.globalAlpha = 1 - k; X.lineWidth = 0.14; X.beginPath(); X.moveTo(p.x, p.y); X.lineTo(p.x - p.vx * 0.035, p.y - p.vy * 0.035); X.stroke(); }
      else if (p.typ === 2) { X.strokeStyle = p.col + (0.8 * (1 - k)) + ')'; X.lineWidth = 0.4; X.beginPath(); X.arc(p.x, p.y, 1 + k * 7, 0, TAU); X.stroke(); }
      else { X.fillStyle = p.col + (0.55 * (1 - k)) + ')'; X.beginPath(); X.arc(p.x, p.y, p.r * (1 + k * 2.4), 0, TAU); X.fill(); }
    }
    X.globalAlpha = 1; X.globalCompositeOperation = 'source-over';
  }

  // ---------- Nacht: Lichtkarte in Viertel-Auflösung, dann auf das Bild multipliziert
  function nacht(S, al) {
    L.setTransform(1, 0, 0, 1, 0, 0); L.globalCompositeOperation = 'source-over'; L.globalAlpha = 1;
    L.fillStyle = AMBIENT; L.fillRect(0, 0, lm.width, lm.height);
    L.globalCompositeOperation = 'lighter';
    welt(L, dpr / 4);
    const pkt = (x, y, r, farbe, st) => { L.globalAlpha = st; L.drawImage(glow(farbe), x - r, y - r, r * 2, r * 2); };
    zellen(34, (z) => {
      for (const n of z.l) { const d = W.dinge[n]; if (S && S.weg[d.wi]) continue; pkt(2 * d.x - d.fx, 2 * d.y - d.fy, 11, 'rgba(255,214,150,1)', 0.8); }
      for (const n of z.g) {
        const g = W.gebaeude[n], v = [[0, 1], [-1, 0], [0, -1], [1, 0]][g.rot], r = Math.max(10, g.b * 0.7);
        pkt(g.x + v[0] * (g.h / 2 + 2.5), g.y + v[1] * (g.h / 2 + 2.5), r, rgba(g.neon, 1), g.schwach ? 0.3 : 0.62);
      }
    });
    if (S) {
      const kg = lichtkegel();
      for (const c of S.autos) {
        if (c.zx === undefined || !sichtbar(c.x, c.y, 30)) continue;
        if (c.art === 'parker' || c.hp <= 0) continue;
        L.save(); L.translate(c.zx, c.zy); L.rotate(c.za); L.globalAlpha = c === S.sp ? 1 : 0.75; L.drawImage(kg, c.l / 2 - 0.5, -8, 26, 16); L.restore();
        if (c.blau && c.hp > 0) { const ph = Math.floor(uhr * 5 + c.id) % 2; pkt(c.zx, c.zy, 17, ph ? 'rgba(255,40,60,1)' : 'rgba(50,110,255,1)', 0.95); }
      }
      pkt(S.sp.x, S.sp.y, 9, 'rgba(255,255,255,1)', 0.5);
      if (S.sp.nitro) pkt(S.sp.x - Math.cos(S.sp.a) * 3, S.sp.y - Math.sin(S.sp.a) * 3, 9, 'rgba(255,150,40,1)', 0.9);
      for (const k of S.koffer) pkt(k.x, k.y, 8, 'rgba(255,210,28,1)', 0.85);
      for (const v of W.verstecke) pkt(v.x, v.y, 14, 'rgba(61,240,138,1)', 0.6);
      for (const v of W.werkstaetten) pkt(v.x, v.y, 14, 'rgba(30,214,224,1)', 0.6);
    }
    L.globalAlpha = 1;
    X.setTransform(1, 0, 0, 1, 0, 0); X.globalCompositeOperation = 'multiply'; X.imageSmoothingEnabled = true;
    X.drawImage(lm, 0, 0, cw, ch);
    X.globalCompositeOperation = 'source-over';
  }
  // ---------- alles, was selbst leuchtet (additiv)
  function leuchten(S) {
    welt(X, dpr); X.globalCompositeOperation = 'lighter';
    // Neon-Bordsteine in der Innenstadt, Neonkanten der Gebäude
    for (const b of W.bloecke) {
      if (!VIERTEL_NEON[b.typ] || b.x1 < B.x0 || b.x0 > B.x1 || b.y1 < B.y0 || b.y0 > B.y1) continue;
      const col = b.nr % 2 ? '#FF5FA2' : '#1ED6E0';
      X.strokeStyle = rgba(col, 0.16); X.lineWidth = 1.3; X.strokeRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0);
      X.strokeStyle = rgba(col, 0.6); X.lineWidth = 0.22; X.strokeRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0);
    }
    zellen(30, (z) => {
      for (const n of z.g) {
        const g = W.gebaeude[n]; if (g.schwach || g.ueber) continue;
        const flacker = 0.75 + 0.25 * Math.sin(uhr * 3 + n * 1.7);
        X.strokeStyle = rgba(g.neon, 0.13 * flacker); X.lineWidth = 1.5;
        for (const b of g.boxen) X.strokeRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0);
        X.strokeStyle = rgba(g.neon, 0.5 * flacker); X.lineWidth = 0.25;
        for (const b of g.boxen) X.strokeRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0);
      }
      for (const n of z.l) { const d = W.dinge[n]; if (S && S.weg[d.wi]) continue; X.globalAlpha = 0.9; X.drawImage(glow('rgba(255,236,190,1)'), 2 * d.x - d.fx - 1.3, 2 * d.y - d.fy - 1.3, 2.6, 2.6); }
    });
    X.globalAlpha = 1;
    if (S) {
      for (const c of S.autos) {
        if (c.zx === undefined || !sichtbar(c.x, c.y, 8)) continue;
        const fx = Math.cos(c.za), fy = Math.sin(c.za), nx = -fy, ny = fx, vorn = c.l / 2 - 0.25, seit = c.b * 0.33;
        const pkt = (u, w, r, farbe, st) => { X.globalAlpha = st; X.drawImage(glow(farbe), c.zx + fx * u + nx * w - r, c.zy + fy * u + ny * w - r, r * 2, r * 2); };
        if (c.art !== 'parker' && c.hp > 0) {
          pkt(vorn, -seit, 0.9, 'rgba(255,248,220,1)', 0.95); pkt(vorn, seit, 0.9, 'rgba(255,248,220,1)', 0.95);
          const br = c.bremse > 0 || c.hand ? 1 : 0.55, rr2 = c.bremse > 0 || c.hand ? 1.2 : 0.8;
          pkt(-vorn, -seit, rr2, 'rgba(255,30,40,1)', br); pkt(-vorn, seit, rr2, 'rgba(255,30,40,1)', br);
        }
        if (c.blau && c.hp > 0) { const ph = Math.floor(uhr * 5 + c.id) % 2; pkt(0.1, -0.45, ph ? 2.6 : 1, 'rgba(255,40,60,1)', ph ? 1 : 0.4); pkt(0.1, 0.45, ph ? 1 : 2.6, 'rgba(60,120,255,1)', ph ? 0.4 : 1); }
        if (c.warn && Math.floor(uhr * 2.5) % 2) for (const u of [vorn, -vorn]) for (const w of [-seit, seit]) pkt(u, w, 0.9, 'rgba(255,170,30,1)', 0.9);
      }
      X.globalAlpha = 1;
    }
    X.globalCompositeOperation = 'source-over';
  }

  // ---------- Bildschirm-Ebene
  function koffer(x, y, s) {
    X.save(); X.translate(x, y);
    X.lineJoin = 'round'; X.strokeStyle = '#11121A'; X.lineWidth = s * 0.1;
    rr(X, -s * 0.2, -s * 0.5, s * 0.4, s * 0.3, s * 0.08); X.stroke();
    X.fillStyle = '#FFD21C'; rr(X, -s * 0.5, -s * 0.3, s, s * 0.66, s * 0.12); X.fill(); X.stroke();
    X.fillStyle = '#11121A'; X.fillRect(-s * 0.5, -s * 0.03, s, s * 0.07); X.fillStyle = '#fff'; X.fillRect(-s * 0.09, -s * 0.09, s * 0.18, s * 0.18);
    X.restore();
  }
  function schild(x, y, text, farbe) {
    X.font = '800 13px "Barlow Condensed", sans-serif'; X.textAlign = 'center'; X.textBaseline = 'middle';
    const w = X.measureText(text).width + 14;
    X.fillStyle = 'rgba(8,10,24,.85)'; rr(X, x - w / 2, y - 11, w, 22, 8); X.fill(); X.strokeStyle = farbe; X.lineWidth = 1.5; X.stroke();
    X.fillStyle = farbe; X.fillText(text, x, y + 1);
  }
  // Wegweiser am Bildrand für Ziele außerhalb des Bildes
  function wegweiser(wx0, wy0, farbe, zeichen, text) {
    const x = sx(wx0, wy0), y = sy(wx0, wy0), l = 30, r = vw - 30, o = 150 + (window.__ncOben || 0), u = vh - (window.__ncUnten || 150) - 26;
    if (x >= l - 10 && x <= r + 10 && y >= o - 10 && y <= u + 10) return false;
    const mx = vw / 2, my = (o + u) / 2, dx = x - mx, dy = y - my;
    const k = Math.min(dx > 0 ? (r - mx) / dx : dx < 0 ? (l - mx) / dx : 1e9, dy > 0 ? (u - my) / dy : dy < 0 ? (o - my) / dy : 1e9);
    let px = mx + dx * k, py = my + dy * k; const a = Math.atan2(dy, dx);
    // nicht übereinander: am Rand entlang ausweichen
    for (let n = 0; n < 4; n++) { const q = belegt.find((b) => Math.abs(b[0] - px) < 40 && Math.abs(b[1] - py) < 46); if (!q) break; if (px <= l + 1 || px >= r - 1) py = Math.min(u, q[1] + 48); else px = Math.min(r, q[0] + 44); }
    belegt.push([px, py]);
    X.save(); X.translate(px, py);
    X.fillStyle = farbe; X.beginPath(); X.moveTo(Math.cos(a) * 26, Math.sin(a) * 26); X.lineTo(Math.cos(a + 2.5) * 16, Math.sin(a + 2.5) * 16); X.lineTo(Math.cos(a - 2.5) * 16, Math.sin(a - 2.5) * 16); X.closePath(); X.fill();
    X.beginPath(); X.arc(0, 0, 17, 0, TAU); X.fillStyle = 'rgba(8,10,24,.88)'; X.fill(); X.strokeStyle = farbe; X.lineWidth = 2.5; X.stroke();
    if (zeichen === 'koffer') koffer(0, 1, 17);
    else { X.fillStyle = farbe; X.font = '800 17px "Barlow Condensed", sans-serif'; X.textAlign = 'center'; X.textBaseline = 'middle'; X.fillText(zeichen, 0, 1); }
    if (text) { X.font = '700 12px "Barlow Condensed", sans-serif'; X.textAlign = 'center'; X.textBaseline = 'middle'; const ty = py < my ? 28 : -27; X.fillStyle = 'rgba(8,10,24,.8)'; const tw = X.measureText(text).width + 8; rr(X, -tw / 2, ty - 8, tw, 16, 5); X.fill(); X.fillStyle = '#fff'; X.fillText(text, 0, ty + 1); }
    X.restore();
    return true;
  }
  const belegt = [];
  function oben(S, dt) {
    const sp = S.sp; belegt.length = 0;
    // Koffer im Bild: Symbol und Wert
    for (const k of S.koffer) {
      const x = sx(k.x, k.y), y = sy(k.x, k.y);
      const d = Math.hypot(k.x - sp.x, k.y - sp.y);
      if (!wegweiser(k.x, k.y, '#FFD21C', 'koffer', Math.round(d / 10) * 10 + ' m')) {
        const hop = Math.sin(uhr * 5 + k.id) * 3;
        koffer(x, y - 6 + hop, clamp(T.ppm * 2.3, 18, 30));
        X.font = '800 14px "Barlow Condensed", sans-serif'; X.textAlign = 'center'; X.textBaseline = 'middle'; X.lineWidth = 3; X.strokeStyle = 'rgba(8,10,24,.9)'; X.fillStyle = '#FFD21C';
        const txt = k.wert + ' $'; X.strokeText(txt, x, y - 30 + hop); X.fillText(txt, x, y - 30 + hop);
      }
    }
    // Versteck und Werkstatt
    const naechst = (liste) => { let b = null, bd = 1e9; for (const v of liste) { const d = Math.hypot(v.x - sp.x, v.y - sp.y); if (d < bd) { bd = d; b = v; } } return [b, bd]; };
    const [hv, hd] = naechst(W.verstecke), [wv, wd] = naechst(W.werkstaetten);
    for (const v of W.verstecke) if (sichtbar(v.x, v.y, 4)) schild(sx(v.x, v.y), sy(v.x, v.y) - 26, S.sterne > 0 && S.gesehen ? 'ERST ABHÄNGEN' : 'VERSTECK', S.sterne > 0 && S.gesehen ? '#FF4A5E' : '#3DF08A');
    for (const v of W.werkstaetten) if (sichtbar(v.x, v.y, 4)) { const zu = (S.zu.get(v) || 0) > S.t; schild(sx(v.x, v.y), sy(v.x, v.y) - 26, zu ? 'LACK TROCKNET ' + Math.ceil(S.zu.get(v) - S.t) + ' s' : 'LACK & FIX', zu ? '#FF4A5E' : '#1ED6E0'); }
    if (S.beute > 0 || S.sterne > 0) wegweiser(hv.x, hv.y, '#3DF08A', '⌂', Math.round(hd / 10) * 10 + ' m');
    if ((S.sterne > 0 || sp.hp < sp.hpMax * 0.6) && (S.zu.get(wv) || 0) <= S.t) wegweiser(wv.x, wv.y, '#1ED6E0', '🔧', Math.round(wd / 10) * 10 + ' m');
    // Polizei außerhalb des Bildes
    for (const c of S.autos) {
      if (c.art !== 'polizei' || c.modus !== 'jagd' || c.hp <= 0) continue;
      const x = sx(c.x, c.y), y = sy(c.x, c.y); if (x > 0 && x < vw && y > 0 && y < vh) continue;
      const mx = vw / 2, my = vh * 0.5, dx = x - mx, dy = y - my, k = Math.min(dx > 0 ? (vw - 12 - mx) / dx : dx < 0 ? (12 - mx) / dx : 1e9, dy > 0 ? (vh - 12 - my) / dy : dy < 0 ? (96 - my) / dy : 1e9);
      const a = Math.atan2(dy, dx), px = mx + dx * k, py = my + dy * k;
      X.fillStyle = Math.floor(uhr * 5 + c.id) % 2 ? '#FF4A5E' : '#4d86ff';
      X.beginPath(); X.moveTo(px + Math.cos(a) * 9, py + Math.sin(a) * 9); X.lineTo(px + Math.cos(a + 2.4) * 9, py + Math.sin(a + 2.4) * 9); X.lineTo(px + Math.cos(a - 2.4) * 9, py + Math.sin(a - 2.4) * 9); X.closePath(); X.fill();
    }
    // Festnahme-Ring ums Auto
    if (S.haft > 0.02) { const x = sx(sp.x, sp.y), y = sy(sp.x, sp.y), r = T.ppm * 4.2; X.lineWidth = 6; X.strokeStyle = 'rgba(255,74,94,.25)'; X.beginPath(); X.arc(x, y, r, 0, TAU); X.stroke(); X.strokeStyle = '#FF4A5E'; X.beginPath(); X.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + TAU * S.haft); X.stroke(); }
    // erschrockene Fußgänger
    X.font = '800 16px "Barlow Condensed", sans-serif'; X.textAlign = 'center'; X.textBaseline = 'middle';
    for (const p of leute) if (p.ruf && uhr - p.ruf < 0.9) { const x = sx(p.x + p.ox, p.y + p.oy), y = sy(p.x + p.ox, p.y + p.oy) - 14; X.fillStyle = '#fff'; X.strokeStyle = '#11121A'; X.lineWidth = 3; X.strokeText('!', x, y); X.fillText('!', x, y); }
    // aufsteigende Zahlen
    for (let i = pops.length - 1; i >= 0; i--) {
      const p = pops[i]; p.t += dt; if (p.t >= p.life) { pops.splice(i, 1); continue; }
      const k = p.t / p.life, x = sx(p.x, p.y), y = sy(p.x, p.y) - 24 - k * 46, gr = p.gr * (k < 0.12 ? 0.6 + k / 0.12 * 0.4 : 1);
      X.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1; X.textAlign = 'center'; X.textBaseline = 'middle'; X.lineJoin = 'round';
      X.font = `800 ${Math.round(24 * gr)}px "Barlow Condensed", sans-serif`; X.lineWidth = 4; X.strokeStyle = 'rgba(8,10,24,.92)'; X.strokeText(p.text, x, y); X.fillStyle = p.col; X.fillText(p.text, x, y);
      if (p.sub) { X.font = `800 ${Math.round(17 * gr)}px "Barlow Condensed", sans-serif`; X.strokeText(p.sub, x, y + 20 * gr); X.fillStyle = '#fff'; X.fillText(p.sub, x, y + 20 * gr); }
    }
    X.globalAlpha = 1;
    radar(S);
  }
  // Radar oben links: Stadtplan dreht mit, Norden ist markiert
  function radar(S) {
    const sp = S.sp, R = 46, mx = 12 + R, my = 10 + R + (window.__ncOben || 0), mass = 0.42;
    X.save();
    X.beginPath(); X.arc(mx, my, R, 0, TAU); X.fillStyle = '#091e3a'; X.fill(); X.clip();
    X.translate(mx, my); X.rotate(-(cam.a + Math.PI / 2)); X.scale(mass, mass); X.translate(-sp.x, -sp.y);
    X.imageSmoothingEnabled = true; X.drawImage(karte, 0, 0, BREITE, HOEHE);
    const punkt = (x, y, r, farbe) => { X.fillStyle = farbe; X.beginPath(); X.arc(x, y, r / mass, 0, TAU); X.fill(); };
    // Ziele außerhalb des Radars an den Rand klemmen
    const rand = (x, y) => { const dx = x - sp.x, dy = y - sp.y, d = Math.hypot(dx, dy), max = (R - 5) / mass; return d > max ? [sp.x + dx / d * max, sp.y + dy / d * max] : [x, y]; };
    for (const v of W.verstecke) { const [x, y] = rand(v.x, v.y); punkt(x, y, 4.2, '#3DF08A'); }
    for (const v of W.werkstaetten) { const [x, y] = rand(v.x, v.y); punkt(x, y, 3.4, '#1ED6E0'); }
    for (const k of S.koffer) { const [x, y] = rand(k.x, k.y); punkt(x, y, 4, '#FFD21C'); }
    for (const c of S.autos) if (c.art === 'polizei' && c.hp > 0 && c.modus !== 'wrack') { if (Math.hypot(c.x - sp.x, c.y - sp.y) > (R - 3) / mass) continue; punkt(c.x, c.y, 3, c.modus === 'jagd' ? (Math.floor(uhr * 5) % 2 ? '#FF4A5E' : '#6aa0ff') : 'rgba(120,150,255,.7)'); }
    X.restore();
    X.save(); X.translate(mx, my);
    X.strokeStyle = S.sterne > 0 ? (S.gesehen ? '#FF4A5E' : '#1ED6E0') : 'rgba(255,255,255,.55)'; X.lineWidth = 2.5; X.beginPath(); X.arc(0, 0, R, 0, TAU); X.stroke();
    // Spieler (zeigt relativ zur Kamera)
    X.rotate(wrap(sp.a - cam.a)); X.fillStyle = '#fff'; X.strokeStyle = '#11121A'; X.lineWidth = 1.5; X.beginPath(); X.moveTo(0, -7); X.lineTo(5, 6); X.lineTo(0, 3); X.lineTo(-5, 6); X.closePath(); X.fill(); X.stroke();
    X.restore();
    // Norden
    const na = -(cam.a + Math.PI / 2) - Math.PI / 2;
    X.fillStyle = '#11121A'; X.beginPath(); X.arc(mx + Math.cos(na) * R, my + Math.sin(na) * R, 8, 0, TAU); X.fill();
    X.fillStyle = '#fff'; X.font = '800 11px "Barlow Condensed", sans-serif'; X.textAlign = 'center'; X.textBaseline = 'middle'; X.fillText('N', mx + Math.cos(na) * R, my + Math.sin(na) * R + 0.5);
  }
  // Stadtplan für die Pause
  function plan(ziel, S) {
    const g = ziel.getContext('2d'); g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(karte, 0, 0);
    const pk = (x, y, r, f) => { g.fillStyle = f; g.beginPath(); g.arc(x / Z, y / Z, r, 0, TAU); g.fill(); g.strokeStyle = '#11121A'; g.lineWidth = 1.5; g.stroke(); };
    for (const v of W.verstecke) pk(v.x, v.y, 8, '#3DF08A');
    for (const v of W.werkstaetten) pk(v.x, v.y, 7, '#1ED6E0');
    if (S) {
      for (const k of S.koffer) pk(k.x, k.y, 7, '#FFD21C');
      for (const c of S.autos) if (c.art === 'polizei' && c.modus === 'jagd' && c.hp > 0) pk(c.x, c.y, 5, '#FF4A5E');
      g.save(); g.translate(S.sp.x / Z, S.sp.y / Z); g.rotate(S.sp.a + Math.PI / 2); g.fillStyle = '#fff'; g.strokeStyle = '#11121A'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, -11); g.lineTo(8, 9); g.lineTo(0, 4); g.lineTo(-8, 9); g.closePath(); g.fill(); g.stroke(); g.restore();
    }
    g.font = '700 13px "Barlow Condensed", sans-serif'; g.textAlign = 'center'; g.fillStyle = 'rgba(255,255,255,.75)';
    for (const [t, x, y] of [['PALMENHÜGEL', 250, 100], ['NEONSTADT', 300, 410], ['STRANDMEILE', 330, 650], ['HAFEN', 654, 360]]) { g.save(); g.translate(x / Z, y / Z); if (t === 'HAFEN') g.rotate(Math.PI / 2); g.fillText(t, 0, 0); g.restore(); }
  }

  const neu = () => { parts = []; spuren = []; truemmer = []; pops = []; letzteRad.clear(); cam.bereit = false; wackel = 0; };
  return { groesse, sichtweite, zeichne, effekt, plan, neu, lichtAn: (v) => { licht = v; }, schaerfe: () => dprMax, kamera: cam, punkt: (x, y) => ({ x: sx(x, y), y: sy(x, y) }) };
}
