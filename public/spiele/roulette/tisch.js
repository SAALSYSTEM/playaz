// Roulette – der Tisch (hochkant): Aufteilung, Zeichnen, Antippen → Wettfeld, Ort der Jetons.
// Aufbau von links: einfache Chancen | Dutzende | Zahlen 1–36 in 12 Reihen à 3 (Null oben), unten die Kolonnen „2:1“.
// Innenwetten entstehen durch die Lage des Fingers: Feldmitte = Plein, Linie = Cheval, Kreuzung = Carré,
// linker Rand der Zahlen = Transversale (Reihe) bzw. Sixain (zwei Reihen), Linie zur Null = Wetten mit der Null.
import * as R from './roulette.js';

const FARBE = { rot: '#b3141c', schwarz: '#15151a', gruen: '#0f7a43' };
const LINIE = 'rgba(236,222,170,.78)';
const CREME = '#f4e8c4';
export const JETON_FARBEN = { 1: ['#f2f2f2', '#2f5fb3', '#1d2b4a'], 5: ['#c3172a', '#ffffff', '#ffffff'], 25: ['#178a4a', '#ffffff', '#ffffff'], 100: ['#1b1b1f', '#e8c35a', '#ffe9a6'], 500: ['#6b2fb3', '#ffffff', '#ffffff'] };

export function aufteilen(W, H) {
  const aw = Math.round(W * 0.145);
  const x0 = 1, xa = x0 + aw, xn = xa + aw;
  const cw = (W - xn - 1) / 3;
  const rh = (H - 2) / (12 + 1.3 + 1);
  const y0 = 1, y1 = y0 + rh * 1.3, y2 = y1 + 12 * rh, ch = rh;
  return { W, H, aw, x0, xa, xn, cw, rh, y0, y1, y2, ch, rechts: xn + 3 * cw };
}

const zeile = (n) => Math.floor((n - 1) / 3);
const spalte = (n) => (n - 1) % 3;
function mitte(L, n) {
  if (n === 0) return { x: L.xn + 1.5 * L.cw, y: (L.y0 + L.y1) / 2 };
  return { x: L.xn + (spalte(n) + 0.5) * L.cw, y: L.y1 + (zeile(n) + 0.5) * L.rh };
}
const EINFACH = ['manque', 'gerade', 'rot', 'schwarz', 'ungerade', 'passe'];
// Rechteck einer Außenwette
function aussenRect(L, k) {
  if (/^d[123]$/.test(k)) { const i = Number(k[1]) - 1; return { x: L.xa, y: L.y1 + i * 4 * L.rh, w: L.aw, h: 4 * L.rh }; }
  if (/^k[123]$/.test(k)) { const i = Number(k[1]) - 1; return { x: L.xn + i * L.cw, y: L.y2, w: L.cw, h: L.ch }; }
  const i = EINFACH.indexOf(k);
  if (i >= 0) return { x: L.x0, y: L.y1 + i * 2 * L.rh, w: L.aw, h: 2 * L.rh };
  return null;
}

// Mittelpunkt des Jetonstapels einer Wette
export function ort(L, key) {
  const r = aussenRect(L, key);
  if (r) return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
  const d = R.WETTEN.get(key); if (!d) return null;
  const z = d.zahlen;
  if (z.length === 1) return mitte(L, z[0]);
  if (z.includes(0)) {
    if (z.length === 4) return { x: L.xn, y: L.y1 };
    const ohne = z.filter((n) => n); return { x: ohne.reduce((s, n) => s + mitte(L, n).x, 0) / ohne.length, y: L.y1 };
  }
  const ps = z.map((n) => mitte(L, n));
  const y = ps.reduce((s, p) => s + p.y, 0) / ps.length;
  if (d.art === 'trans' || d.art === 'sixain') return { x: L.xn, y };
  return { x: ps.reduce((s, p) => s + p.x, 0) / ps.length, y };
}

// Welche Wette liegt unter dem Finger? (Tischkoordinaten in CSS-Pixeln) → Schlüssel oder null
export function treffer(L, x, y) {
  const tx = Math.min(0.24, 15 / L.cw), ty = Math.min(0.34, 11 / L.rh);
  if (x >= L.xn - tx * L.cw && x <= L.rechts + 2 && y >= L.y0 && y < L.y2 + L.ch) {
    const gx = (x - L.xn) / L.cw, gy = (y - L.y1) / L.rh;
    if (gy >= 12 + ty * 0.4) return x >= L.xn ? 'k' + (Math.min(2, Math.max(0, Math.floor(gx))) + 1) : null;
    if (gy < -ty) return x >= L.xn ? '0' : null;
    const c = Math.min(2, Math.max(0, Math.floor(gx)));
    const r = Math.min(11, Math.max(0, Math.floor(gy)));
    const links = gx <= tx;
    const kCol = Math.round(gx), nahSpalte = (kCol === 1 || kCol === 2) && Math.abs(gx - kCol) <= tx;
    const kRow = Math.round(gy), nahReihe = kRow <= 11 && Math.abs(gy - kRow) <= ty;
    if (nahReihe && kRow === 0) {
      if (links) return '0-1-2-3';
      if (nahSpalte) return kCol === 1 ? '0-1-2' : '0-2-3';
      return R.schluessel([0, c + 1]);
    }
    if (nahReihe) {
      const a = 3 * (kRow - 1) + 1;
      if (links) return R.schluessel([a, a + 1, a + 2, a + 3, a + 4, a + 5]);
      if (nahSpalte) { const n = a + kCol - 1; return R.schluessel([n, n + 1, n + 3, n + 4]); }
      const n = a + c; return R.schluessel([n, n + 3]);
    }
    if (links) return R.schluessel([3 * r + 1, 3 * r + 2, 3 * r + 3]);
    if (nahSpalte) { const n = 3 * r + kCol; return R.schluessel([n, n + 1]); }
    return String(3 * r + c + 1);
  }
  if (y >= L.y1 && y < L.y2) {
    const r = Math.floor((y - L.y1) / L.rh);
    if (x >= L.xa && x < L.xn) return 'd' + (Math.floor(r / 4) + 1);
    if (x >= L.x0 - 2 && x < L.xa) return EINFACH[Math.floor(r / 2)];
  }
  return null;
}

// ------------------------------------------------------------------ Zeichnen
const rund = (g, x, y, w, h, r) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); };
function raute(g, x, y, w, h, f) {
  g.beginPath(); g.moveTo(x, y - h / 2); g.lineTo(x + w / 2, y); g.lineTo(x, y + h / 2); g.lineTo(x - w / 2, y); g.closePath();
  g.fillStyle = f; g.fill(); g.strokeStyle = LINIE; g.lineWidth = 1.2; g.stroke();
}
function senkrecht(g, text, x, y, groesse, farbe = CREME) {
  g.save(); g.translate(x, y); g.rotate(-Math.PI / 2); g.fillStyle = farbe; g.font = '700 ' + groesse + 'px "Barlow Condensed",system-ui,sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 0, 1); g.restore();
}

// Hintergrund + Linien + Beschriftung (ändert sich nur bei neuer Größe → wird zwischengespeichert)
export function zeichneGrund(g, L) {
  const { W, H } = L;
  const grd = g.createRadialGradient(W * 0.55, H * 0.42, 10, W * 0.55, H * 0.45, Math.max(W, H) * 0.75);
  grd.addColorStop(0, '#13774c'); grd.addColorStop(0.6, '#0b5a39'); grd.addColorStop(1, '#063823');
  g.fillStyle = grd; rund(g, 0, 0, W, H, 10); g.fill();
  // feine Filzstruktur
  g.save(); g.globalAlpha = 0.05; g.fillStyle = '#000';
  for (let i = 0; i < W * H / 90; i++) { const x = (i * 97.13) % W, y = (i * 53.71 + (i % 7) * 13) % H; g.fillRect(x, y, 1, 1); }
  g.restore();
  g.strokeStyle = LINIE; g.lineWidth = 1.4;
  // Null (oben, mit Spitze)
  g.beginPath(); g.moveTo(L.xn, L.y1); g.lineTo(L.xn, L.y0 + L.rh * 0.45); g.quadraticCurveTo(L.xn + 1.5 * L.cw, L.y0 - L.rh * 0.25, L.rechts, L.y0 + L.rh * 0.45); g.lineTo(L.rechts, L.y1); g.stroke();
  const zg = Math.min(L.rh * 0.62, L.cw * 0.42);
  zahlFeld(g, L, 0, zg);
  for (let n = 1; n <= 36; n++) zahlFeld(g, L, n, zg);
  // Gitter
  g.beginPath();
  for (let r = 0; r <= 12; r++) { const y = L.y1 + r * L.rh; g.moveTo(L.xa, y); g.lineTo(L.rechts, y); }
  for (let c = 0; c <= 3; c++) { const x = L.xn + c * L.cw; g.moveTo(x, L.y1); g.lineTo(x, L.y2 + L.ch); }
  g.moveTo(L.xn, L.y2 + L.ch); g.lineTo(L.rechts, L.y2 + L.ch);
  g.moveTo(L.xa, L.y1); g.lineTo(L.xa, L.y2); g.moveTo(L.x0, L.y1); g.lineTo(L.x0, L.y2);
  for (let i = 0; i <= 6; i++) { const y = L.y1 + i * 2 * L.rh; g.moveTo(L.x0, y); g.lineTo(L.xa, y); }
  g.stroke();
  // Dicke Trennlinien der Dutzende
  g.lineWidth = 2.4; g.beginPath(); for (const r of [4, 8]) { const y = L.y1 + r * L.rh; g.moveTo(L.xa, y); g.lineTo(L.rechts, y); } g.stroke();
  // Beschriftung
  const tg = Math.max(11, Math.min(L.aw * 0.4, L.rh * 0.62, 20));
  ['1 – 12', '13 – 24', '25 – 36'].forEach((t, i) => senkrecht(g, t, L.xa + L.aw / 2, L.y1 + (i * 4 + 2) * L.rh, tg));
  ['1 – 18', 'GERADE', null, null, 'UNGERADE', '19 – 36'].forEach((t, i) => { if (t) senkrecht(g, t, L.x0 + L.aw / 2, L.y1 + (i * 2 + 1) * L.rh, Math.min(tg, L.rh * 2 / (t.length * 0.55))); });
  const rw = Math.min(L.aw * 0.62, L.rh * 0.9), rhh = Math.min(L.rh * 1.55, rw * 2);
  raute(g, L.x0 + L.aw / 2, L.y1 + 5 * L.rh, rw, rhh, FARBE.rot);
  raute(g, L.x0 + L.aw / 2, L.y1 + 7 * L.rh, rw, rhh, FARBE.schwarz);
  g.fillStyle = CREME; g.font = '700 ' + Math.max(11, Math.min(L.ch * 0.55, 18)) + 'px "Barlow Condensed",system-ui,sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  for (let c = 0; c < 3; c++) g.fillText('2 : 1', L.xn + (c + 0.5) * L.cw, L.y2 + L.ch / 2 + 1);
  // Ecke oben links: Tischlimit
  g.fillStyle = 'rgba(244,232,196,.62)'; g.font = '600 ' + Math.max(9, Math.min(11, L.rh * 0.36)) + 'px "Barlow Semi Condensed",system-ui,sans-serif';
  g.fillText('Limit', L.xa, L.y0 + (L.y1 - L.y0) * 0.36); g.fillText('1 – ' + R.FELD_MAX, L.xa, L.y0 + (L.y1 - L.y0) * 0.72);
  // Fußleiste unter den Kolonnen links: Hinweis
  g.fillStyle = 'rgba(244,232,196,.45)'; g.fillText('PlaySaal', L.xa, L.y2 + L.ch / 2);
}
function zahlFeld(g, L, n, groesse) {
  const p = mitte(L, n);
  const w = n === 0 ? Math.min(L.cw * 0.9, groesse * 2.2) : Math.min(L.cw * 0.62, groesse * 1.9), h = Math.min(L.rh * (n === 0 ? 0.95 : 0.78), groesse * 1.25);
  g.fillStyle = FARBE[R.farbe(n)];
  g.beginPath(); g.ellipse(p.x, p.y + (n === 0 ? L.rh * 0.08 : 0), w / 2, h / 2, 0, 0, Math.PI * 2); g.fill();
  g.strokeStyle = 'rgba(236,222,170,.45)'; g.lineWidth = 1; g.stroke();
  g.fillStyle = '#fff'; g.font = '700 ' + groesse + 'px "Barlow Condensed",system-ui,sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(String(n), p.x, p.y + (n === 0 ? L.rh * 0.08 : 0) + 1);
}

// Leuchten über den Feldern einer Wette (Vorschau beim Tippen, Gewinnfelder)
export function zeichneLeuchten(g, L, key, farbe = 'rgba(255,233,160,.38)') {
  const r = aussenRect(L, key);
  g.save(); g.fillStyle = farbe;
  if (r) { g.fillRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2); g.restore(); return; }
  const d = R.WETTEN.get(key); if (!d) { g.restore(); return; }
  for (const n of d.zahlen) {
    if (n === 0) { g.fillRect(L.xn + 1, L.y0 + L.rh * 0.45, 3 * L.cw - 2, L.y1 - L.y0 - L.rh * 0.45 - 1); continue; }
    g.fillRect(L.xn + spalte(n) * L.cw + 1, L.y1 + zeile(n) * L.rh + 1, L.cw - 2, L.rh - 2);
  }
  g.restore();
}

// „Dolly“ auf der Gewinnzahl
export function zeichneDolly(g, L, n, t) {
  const p = mitte(L, n); const r = Math.min(L.cw, L.rh) * 0.42;
  g.save();
  g.globalAlpha = 0.5 + 0.3 * Math.sin(t * 5);
  g.fillStyle = 'rgba(255,215,90,.35)'; g.beginPath(); g.arc(p.x, p.y, r * 1.6, 0, Math.PI * 2); g.fill();
  g.globalAlpha = 1;
  const grd = g.createRadialGradient(p.x - r * 0.3, p.y - r * 0.4, r * 0.1, p.x, p.y, r);
  grd.addColorStop(0, '#ffffff'); grd.addColorStop(0.55, '#e9e2d0'); grd.addColorStop(1, '#a89c7c');
  g.fillStyle = grd; g.beginPath(); g.arc(p.x, p.y, r, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#c9a23b'; g.lineWidth = 2.5; g.stroke();
  g.fillStyle = '#c9a23b'; g.beginPath(); g.arc(p.x, p.y, r * 0.32, 0, Math.PI * 2); g.fill();
  g.restore();
}

export const kurz = (b) => (b >= 10000 ? Math.round(b / 1000) + 'k' : b >= 1000 ? (b / 1000).toLocaleString('de-DE', { maximumFractionDigits: 1 }) + 'k' : String(b));
// Farbe eines Stapels = größter Jeton, der in den Betrag passt
export function stapelFarbe(b) { let f = 1; for (const j of R.JETONS) if (b >= j) f = j; return f; }

export function zeichneJeton(g, x, y, r, wert, text = kurz(wert), alpha = 1, schein = false) {
  const [grund, streifen, schrift] = JETON_FARBEN[stapelFarbe(wert)] || JETON_FARBEN[1];
  g.save(); g.globalAlpha = alpha;
  if (schein) { g.shadowColor = 'rgba(255,215,90,.95)'; g.shadowBlur = r * 1.2; }
  else { g.shadowColor = 'rgba(0,0,0,.45)'; g.shadowBlur = r * 0.45; g.shadowOffsetY = r * 0.15; }
  g.fillStyle = grund; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  g.shadowColor = 'transparent';
  g.strokeStyle = streifen; g.lineWidth = r * 0.24; g.setLineDash([r * 0.42, r * 0.42]);
  g.beginPath(); g.arc(x, y, r * 0.82, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
  g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 1; g.beginPath(); g.arc(x, y, r * 0.6, 0, Math.PI * 2); g.stroke();
  g.fillStyle = schrift; g.font = '700 ' + Math.round(r * (text.length > 3 ? 0.66 : text.length > 2 ? 0.78 : 0.92)) + 'px "Barlow Condensed",system-ui,sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, x, y + 1);
  g.restore();
}
export const jetonRadius = (L) => Math.max(9, Math.min(L.cw * 0.27, L.rh * 0.5, 17));
