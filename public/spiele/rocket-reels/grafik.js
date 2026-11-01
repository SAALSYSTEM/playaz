// Rocket Reels – Grafik: Bilder laden (img/manifest.json), Platzhalter-Symbole zeichnen, Sternenhimmel, Rakete, Stargate-Wirbel.
// Fehlt ein ChatGPT-Bild, zeichnet diese Datei ein eigenes Symbol in derselben Farbwelt. Das Spiel bleibt damit voll spielbar.
import { SYMBOLE } from './engine.js';

const BASIS = '/spiele/rocket-reels/img/';
export const BILDER = {};
export const TOENE = []; // optionale Musikdateien in ton/ (z. B. "freispiele", "musik")

export async function ladeBilder(fortschritt) {
  let liste = [];
  try { const r = await fetch(BASIS + 'manifest.json', { cache: 'no-cache' }); if (r.ok) liste = await r.json(); } catch (e) {}
  if (!Array.isArray(liste)) liste = [];
  liste.forEach((n) => { const m = typeof n === 'string' && n.match(/^ton\/([a-z0-9-]+)\.mp3$/); if (m) TOENE.push(m[1]); });
  liste = liste.filter((n) => typeof n === 'string' && !n.endsWith('.mp3'));
  let fertig = 0;
  await Promise.all(liste.map((name) => new Promise((ok) => {
    if (typeof name !== 'string' || !/^[a-z0-9-]+\.(webp|jpg|png)$/.test(name)) return ok();
    const img = new Image(); img.decoding = 'async';
    img.onload = () => { BILDER[name.replace(/\.\w+$/, '')] = img; fertig++; fortschritt && fortschritt(fertig / liste.length); ok(); };
    img.onerror = () => ok();
    img.src = BASIS + name;
  })));
  return BILDER;
}

const TAU = Math.PI * 2;
function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

// ------------------------------------------------------------------ Platzhalter-Symbole (Größe 100 × 100, wird skaliert)
const ZEICHNE = {
  rakete(g) {
    g.save(); g.translate(50, 52); g.rotate(Math.PI / 4.6);
    const fl = g.createLinearGradient(0, 22, 0, 48); fl.addColorStop(0, '#fff6b0'); fl.addColorStop(.4, '#ffb21c'); fl.addColorStop(1, 'rgba(255,60,0,0)');
    g.fillStyle = fl; g.beginPath(); g.moveTo(-8, 24); g.quadraticCurveTo(0, 56, 8, 24); g.fill();
    const k = g.createLinearGradient(-14, 0, 14, 0); k.addColorStop(0, '#8a5200'); k.addColorStop(.35, '#ffe27a'); k.addColorStop(.55, '#ffc23a'); k.addColorStop(1, '#a86200');
    g.fillStyle = '#c47600'; g.beginPath(); g.moveTo(-11, 10); g.lineTo(-21, 27); g.lineTo(-9, 22); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(11, 10); g.lineTo(21, 27); g.lineTo(9, 22); g.closePath(); g.fill();
    g.fillStyle = k; g.beginPath(); g.moveTo(0, -40); g.bezierCurveTo(16, -24, 14, 10, 10, 24); g.lineTo(-10, 24); g.bezierCurveTo(-14, 10, -16, -24, 0, -40); g.fill();
    g.strokeStyle = 'rgba(90,50,0,.6)'; g.lineWidth = 1.5; g.stroke();
    g.fillStyle = '#0b2a4a'; g.beginPath(); g.arc(0, -10, 7, 0, TAU); g.fill();
    const f = g.createRadialGradient(-2, -12, 1, 0, -10, 7); f.addColorStop(0, '#d8ffff'); f.addColorStop(1, '#25b9e6');
    g.fillStyle = f; g.beginPath(); g.arc(0, -10, 5.3, 0, TAU); g.fill();
    g.restore();
  },
  astronaut(g) {
    const a = g.createLinearGradient(20, 70, 80, 100); a.addColorStop(0, '#f4f6ff'); a.addColorStop(1, '#9aa4c8');
    g.fillStyle = a; rr(g, 18, 70, 64, 30, 14); g.fill();
    g.fillStyle = '#ffc93c'; g.fillRect(44, 74, 12, 6);
    const h = g.createRadialGradient(40, 32, 4, 50, 44, 34); h.addColorStop(0, '#ffffff'); h.addColorStop(.7, '#dfe3f5'); h.addColorStop(1, '#8a93b8');
    g.fillStyle = h; g.beginPath(); g.arc(50, 44, 32, 0, TAU); g.fill();
    const v = g.createLinearGradient(30, 30, 70, 62); v.addColorStop(0, '#fff1a8'); v.addColorStop(.3, '#f0a31c'); v.addColorStop(.6, '#6b2fa3'); v.addColorStop(1, '#1b0b3a');
    g.fillStyle = v; g.beginPath(); g.ellipse(50, 46, 23, 18, 0, 0, TAU); g.fill();
    g.fillStyle = 'rgba(255,255,255,.7)'; g.beginPath(); g.ellipse(41, 39, 7, 3.5, -0.5, 0, TAU); g.fill();
    g.strokeStyle = '#3be8ff'; g.lineWidth = 2.5; g.beginPath(); g.arc(50, 44, 31, -2.6, -2.0); g.stroke(); g.beginPath(); g.arc(50, 44, 31, -1.1, -0.5); g.stroke();
  },
  alien(g) {
    const k = g.createRadialGradient(42, 30, 4, 50, 48, 42); k.addColorStop(0, '#d6ffcf'); k.addColorStop(.45, '#46e07a'); k.addColorStop(1, '#0d6b3a');
    g.fillStyle = k; g.beginPath(); g.moveTo(50, 10); g.bezierCurveTo(84, 10, 88, 48, 72, 70); g.quadraticCurveTo(60, 92, 50, 92); g.quadraticCurveTo(40, 92, 28, 70); g.bezierCurveTo(12, 48, 16, 10, 50, 10); g.fill();
    g.fillStyle = '#05110a';
    g.beginPath(); g.ellipse(36, 50, 12, 7, 0.55, 0, TAU); g.fill();
    g.beginPath(); g.ellipse(64, 50, 12, 7, -0.55, 0, TAU); g.fill();
    g.fillStyle = 'rgba(120,255,255,.85)'; g.beginPath(); g.arc(32, 47, 2.4, 0, TAU); g.arc(60, 47, 2.4, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(190,255,200,.55)'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(50, 18); g.lineTo(50, 32); g.moveTo(42, 22); g.lineTo(45, 32); g.moveTo(58, 22); g.lineTo(55, 32); g.stroke();
  },
  planet(g) {
    g.save(); g.translate(50, 50); g.rotate(-0.35);
    g.strokeStyle = '#a8650a'; g.lineWidth = 7; g.beginPath(); g.ellipse(0, 0, 46, 13, 0, Math.PI, TAU); g.stroke();
    const p = g.createRadialGradient(-10, -12, 3, 0, 0, 30); p.addColorStop(0, '#ffd2ff'); p.addColorStop(.45, '#b04fe0'); p.addColorStop(1, '#3b0d6b');
    g.fillStyle = p; g.beginPath(); g.arc(0, 0, 28, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(255,170,240,.35)'; g.lineWidth = 3; for (const y of [-12, 0, 10]) { g.beginPath(); g.ellipse(0, y, 27 - Math.abs(y) * .4, 3, 0, 0, Math.PI); g.stroke(); }
    const r = g.createLinearGradient(-46, 0, 46, 0); r.addColorStop(0, '#a8650a'); r.addColorStop(.5, '#ffe58a'); r.addColorStop(1, '#a8650a');
    g.strokeStyle = r; g.lineWidth = 7; g.beginPath(); g.ellipse(0, 0, 46, 13, 0, 0, Math.PI); g.stroke();
    g.restore();
  },
  kristall(g) {
    const pts = [[50, 6], [72, 30], [70, 70], [50, 94], [30, 70], [28, 30]];
    const k = g.createLinearGradient(28, 10, 72, 90); k.addColorStop(0, '#bff8ff'); k.addColorStop(.35, '#2f8fff'); k.addColorStop(.7, '#1236b8'); k.addColorStop(1, '#0a1a66');
    g.fillStyle = k; g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo : g.moveTo).call(g, p[0], p[1])); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(200,250,255,.7)'; g.lineWidth = 1.5; g.stroke();
    g.fillStyle = 'rgba(255,255,255,.35)'; g.beginPath(); g.moveTo(50, 6); g.lineTo(50, 94); g.lineTo(30, 70); g.lineTo(28, 30); g.closePath(); g.fill();
    const c = g.createRadialGradient(50, 50, 1, 50, 50, 16); c.addColorStop(0, 'rgba(220,255,255,.95)'); c.addColorStop(1, 'rgba(60,232,255,0)');
    g.fillStyle = c; g.beginPath(); g.arc(50, 50, 16, 0, TAU); g.fill();
  },
  meteor(g) {
    const t = g.createLinearGradient(86, 14, 40, 60); t.addColorStop(0, 'rgba(255,60,0,0)'); t.addColorStop(.5, 'rgba(255,140,20,.8)'); t.addColorStop(1, '#fff2a0');
    g.fillStyle = t; g.beginPath(); g.moveTo(92, 6); g.lineTo(52, 40); g.lineTo(34, 58); g.lineTo(58, 64); g.lineTo(96, 22); g.closePath(); g.fill();
    const s = g.createRadialGradient(34, 60, 3, 40, 66, 26); s.addColorStop(0, '#8a6a58'); s.addColorStop(.7, '#3b2a22'); s.addColorStop(1, '#1b1310');
    g.fillStyle = s; g.beginPath(); g.moveTo(22, 58); g.lineTo(32, 42); g.lineTo(52, 44); g.lineTo(62, 62); g.lineTo(52, 84); g.lineTo(30, 84); g.lineTo(18, 72); g.closePath(); g.fill();
    g.strokeStyle = '#ff8a1f'; g.lineWidth = 2.2; g.beginPath(); g.moveTo(30, 52); g.lineTo(40, 62); g.lineTo(36, 74); g.moveTo(48, 54); g.lineTo(52, 70); g.stroke();
  },
  satellit(g) {
    g.save(); g.translate(50, 50); g.rotate(-0.4);
    const pan = (x) => { const p = g.createLinearGradient(x, -12, x + 30, 12); p.addColorStop(0, '#2a5bd9'); p.addColorStop(.5, '#7fd0ff'); p.addColorStop(1, '#1c3c99'); g.fillStyle = p; g.fillRect(x, -11, 30, 22);
      g.strokeStyle = 'rgba(220,240,255,.6)'; g.lineWidth = 1; for (let i = 1; i < 3; i++) { g.beginPath(); g.moveTo(x + i * 10, -11); g.lineTo(x + i * 10, 11); g.stroke(); } g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 30, 0); g.stroke(); };
    pan(-46); pan(16);
    g.fillStyle = '#9aa3b8'; g.fillRect(-16, -2, 32, 4);
    const k = g.createLinearGradient(-12, -14, 12, 14); k.addColorStop(0, '#fff3c0'); k.addColorStop(.5, '#e0a52a'); k.addColorStop(1, '#7a5a10');
    g.fillStyle = k; rr(g, -12, -14, 24, 28, 4); g.fill();
    g.fillStyle = '#d7dbe8'; g.beginPath(); g.ellipse(0, -22, 12, 6, 0, Math.PI, TAU); g.fill(); g.fillRect(-1.5, -22, 3, 8);
    g.fillStyle = '#3be8ff'; g.beginPath(); g.arc(-6, 6, 2.2, 0, TAU); g.arc(6, 6, 2.2, 0, TAU); g.fill();
    g.restore();
  }
};
const BUCHSTABE = { a: ['A', '#b07bff'], k: ['K', '#ff5bd2'], q: ['Q', '#3be8ff'], j: ['J', '#3bff9a'], zehn: ['10', '#ff9a2a'] };
function buchstabe(g, txt, farbe) {
  g.save();
  g.font = (txt.length > 1 ? '400 56px' : '400 72px') + ' "Bungee", "Arial Black", sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = farbe; g.shadowBlur = 14;
  g.lineWidth = 7; g.strokeStyle = farbe; g.strokeText(txt, 50, 55);
  g.shadowBlur = 0;
  const c = g.createLinearGradient(0, 22, 0, 84); c.addColorStop(0, '#ffffff'); c.addColorStop(.45, '#c9d2e8'); c.addColorStop(.55, '#6f7898'); c.addColorStop(1, '#e8ecf8');
  g.fillStyle = c; g.fillText(txt, 50, 55);
  g.restore();
}
export function stargateBasis(g, s = 100) {
  g.save(); g.scale(s / 100, s / 100);
  const p = g.createRadialGradient(50, 50, 2, 50, 50, 38); p.addColorStop(0, '#ffffff'); p.addColorStop(.25, '#9ff6ff'); p.addColorStop(.6, '#7b3dff'); p.addColorStop(1, '#14063a');
  g.fillStyle = p; g.beginPath(); g.arc(50, 50, 38, 0, TAU); g.fill();
  const r = g.createLinearGradient(10, 10, 90, 90); r.addColorStop(0, '#5a5f7a'); r.addColorStop(.5, '#20243a'); r.addColorStop(1, '#4a4f68');
  g.strokeStyle = r; g.lineWidth = 11; g.beginPath(); g.arc(50, 50, 41, 0, TAU); g.stroke();
  g.strokeStyle = '#ffc93c'; g.lineWidth = 2; g.beginPath(); g.arc(50, 50, 46, 0, TAU); g.stroke(); g.beginPath(); g.arc(50, 50, 36, 0, TAU); g.stroke();
  for (let i = 0; i < 7; i++) { const a = -Math.PI / 2 + i * TAU / 7; g.fillStyle = '#3be8ff'; g.shadowColor = '#3be8ff'; g.shadowBlur = 8; g.beginPath(); g.arc(50 + Math.cos(a) * 41, 50 + Math.sin(a) * 41, 3.6, 0, TAU); g.fill(); }
  g.restore();
}

const cache = new Map();
// Liefert eine Canvas mit dem Symbol in Pixelgröße px (quadratisch). Bild vor Platzhalter.
export function symbolCanvas(i, px) {
  const key = i + ':' + px + ':' + (BILDER['sym-' + SYMBOLE[i].id] ? 1 : 0);
  if (cache.has(key)) return cache.get(key);
  const c = document.createElement('canvas'); c.width = c.height = px;
  const g = c.getContext('2d');
  const img = BILDER['sym-' + SYMBOLE[i].id];
  if (img) {
    const pad = px * 0.06, m = px - 2 * pad, f = Math.min(m / img.width, m / img.height);
    g.imageSmoothingQuality = 'high';
    g.drawImage(img, (px - img.width * f) / 2, (px - img.height * f) / 2, img.width * f, img.height * f);
  } else {
    g.scale(px / 100, px / 100);
    const id = SYMBOLE[i].id;
    if (ZEICHNE[id]) ZEICHNE[id](g); else if (BUCHSTABE[id]) buchstabe(g, ...BUCHSTABE[id]); else stargateBasis(g);
  }
  cache.set(key, c);
  return c;
}
export function cacheLeeren() { cache.clear(); }

// Wirbel über dem Stargate (zusätzlich zum Bild): drehende Energiearme + pulsierender Ring
export function stargateWirbel(g, x, y, s, t, staerke = 1) {
  g.save(); g.translate(x + s / 2, y + s / 2);
  const r = s * 0.36;
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 3; i++) {
    g.rotate(t * 1.6 + i * TAU / 3);
    const gr = g.createLinearGradient(0, 0, r, 0); gr.addColorStop(0, 'rgba(180,250,255,' + 0.55 * staerke + ')'); gr.addColorStop(1, 'rgba(123,61,255,0)');
    g.strokeStyle = gr; g.lineWidth = s * 0.06; g.beginPath(); g.arc(0, 0, r * 0.6, 0, 2.2); g.stroke();
  }
  const puls = 0.5 + 0.5 * Math.sin(t * 5);
  g.strokeStyle = 'rgba(59,232,255,' + (0.25 + 0.45 * puls) * staerke + ')'; g.lineWidth = s * 0.03;
  g.beginPath(); g.arc(0, 0, s * (0.45 + 0.03 * puls), 0, TAU); g.stroke();
  g.restore();
}

// ------------------------------------------------------------------ Rakete (senkrecht, Spitze oben). Höhe h, Mittelpunkt x/y.
export function zeichneRakete(g, x, y, h, flamme = 0, t = 0) {
  const img = BILDER.rakete;
  g.save(); g.translate(x, y);
  if (flamme > 0) {
    const lang = h * (0.35 + 0.45 * flamme) * (0.9 + 0.1 * Math.sin(t * 40));
    const fl = g.createLinearGradient(0, h * 0.42, 0, h * 0.42 + lang);
    fl.addColorStop(0, 'rgba(255,255,220,.95)'); fl.addColorStop(.25, 'rgba(255,190,40,.9)'); fl.addColorStop(.7, 'rgba(255,80,10,.5)'); fl.addColorStop(1, 'rgba(255,40,0,0)');
    g.globalCompositeOperation = 'lighter'; g.fillStyle = fl;
    g.beginPath(); g.moveTo(-h * 0.09, h * 0.4); g.quadraticCurveTo(0, h * 0.42 + lang * 1.2, h * 0.09, h * 0.4); g.fill();
    g.globalCompositeOperation = 'source-over';
  }
  if (img) {
    const f = h / img.height; g.drawImage(img, -img.width * f / 2, -h / 2, img.width * f, h);
  } else {
    const s = h / 100; g.scale(s, s);
    const k = g.createLinearGradient(-14, 0, 14, 0); k.addColorStop(0, '#8a5200'); k.addColorStop(.35, '#ffe27a'); k.addColorStop(.55, '#ffc23a'); k.addColorStop(1, '#a86200');
    g.fillStyle = '#c47600';
    g.beginPath(); g.moveTo(-11, 18); g.lineTo(-24, 44); g.lineTo(-9, 36); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(11, 18); g.lineTo(24, 44); g.lineTo(9, 36); g.closePath(); g.fill();
    g.fillStyle = k; g.beginPath(); g.moveTo(0, -50); g.bezierCurveTo(17, -30, 15, 16, 11, 40); g.lineTo(-11, 40); g.bezierCurveTo(-15, 16, -17, -30, 0, -50); g.fill();
    g.fillStyle = '#2a2f45'; g.fillRect(-8, 38, 16, 7);
    g.fillStyle = '#0b2a4a'; g.beginPath(); g.arc(0, -14, 7.5, 0, TAU); g.fill();
    g.fillStyle = '#5fe3ff'; g.beginPath(); g.arc(0, -14, 5.5, 0, TAU); g.fill();
    g.fillStyle = 'rgba(255,255,255,.75)'; g.beginPath(); g.arc(-2, -16, 1.8, 0, TAU); g.fill();
  }
  g.restore();
}

// ------------------------------------------------------------------ Sternenhimmel (einmal je Größe gezeichnet)
export function zeichneHimmel(cv, seed = 7) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = cv.clientWidth, h = cv.clientHeight;
  cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
  const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
  let a = seed; const r = () => { a = (a * 16807) % 2147483647; return a / 2147483647; };
  const nebel = (x, y, rad, farbe) => { const n = g.createRadialGradient(x, y, 0, x, y, rad); n.addColorStop(0, farbe); n.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = n; g.fillRect(0, 0, w, h); };
  g.globalCompositeOperation = 'lighter';
  nebel(w * 0.1, h * 0.18, w * 0.7, 'rgba(155,92,255,.16)');
  nebel(w * 0.95, h * 0.62, w * 0.75, 'rgba(59,232,255,.10)');
  nebel(w * 0.3, h * 0.95, w * 0.6, 'rgba(255,120,40,.08)');
  for (let i = 0; i < (w * h) / 1400; i++) {
    const x = r() * w, y = r() * h, s = r() < 0.08 ? 1.6 : r() < 0.3 ? 1 : 0.6;
    g.fillStyle = `rgba(${200 + r() * 55 | 0},${210 + r() * 45 | 0},255,${0.35 + r() * 0.6})`;
    g.beginPath(); g.arc(x, y, s, 0, TAU); g.fill();
  }
  g.globalCompositeOperation = 'source-over';
}
