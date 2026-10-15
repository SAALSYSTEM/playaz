// HAU DIE „POLITIKER“ – Kakerlaken im Parlament: Zeichenfunktionen (Canvas 2D, alles selbst gezeichnet).
// Saal, Sitze, Türen, Kakerlaken (alle Arten und Bosse), Spielzeughammer, Warnschilder, Kleinteile.
// Kein Spielzustand hier, nur Zeichnen. Koordinaten sind Layout-Einheiten.

import { AISLE_IDS } from './layout.js';

export const TAU = Math.PI * 2;
export const COL = {
  ink: '#2a1a12',
  wall: '#26303f', wall2: '#2d3a4d', wood: '#8a5a34', woodDark: '#5e3a20', gold: '#e0b04a', goldDark: '#a37a22',
  floor: '#566a86', floorLight: '#62789a', tierA: '#43556f', tierB: '#4a5d7a', well: '#7a2f3d', wellDark: '#5e2230',
  aisle: '#f0e4c4', aisleEdge: '#c9a24a', aisleMark: '#dccb9c', aisleOff: '#6d7a8f',
  seat: '#3fa7ad', seatBack: '#1f6f78', seatLine: '#0f3d44',
  roach: '#d26b2c', roachDark: '#6b3414', roachLight: '#f0a05a', legs: '#4a2a14'
};

export function rr(ctx, x, y, w, h, r) {
  const m = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + m, y); ctx.lineTo(x + w - m, y); ctx.quadraticCurveTo(x + w, y, x + w, y + m);
  ctx.lineTo(x + w, y + h - m); ctx.quadraticCurveTo(x + w, y + h, x + w - m, y + h);
  ctx.lineTo(x + m, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - m);
  ctx.lineTo(x, y + m); ctx.quadraticCurveTo(x, y, x + m, y); ctx.closePath();
}

export function star(ctx, x, y, r, rot = 0) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = rot + (i * Math.PI) / 5 - Math.PI / 2, rad = i % 2 ? r * 0.45 : r;
    ctx.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad);
  }
  ctx.closePath();
}

// ------------------------------------------------------------------ Saal
function floorPath(L) {
  const p = new Path2D();
  const rw = (u) => ({ rx: L.rx0 + u * L.drx, ry: L.ry0 + u * L.dry });
  if (L.name === 'land') {
    const { rx, ry } = rw(L.wallU);
    p.moveTo(L.cx - rx, 96); p.lineTo(L.cx + rx, 96); p.lineTo(L.cx + rx, L.cy);
    p.ellipse(L.cx, L.cy, rx, ry, 0, 0, Math.PI);
    p.closePath();
  } else {
    const r = L.rx0 + L.wallU * L.drx, x0 = 26, x1 = L.W - 26;
    p.moveTo(x0, 112); p.lineTo(x1, 112);
    for (let i = 0; i <= 40; i++) { const x = x1 - ((x1 - x0) * i) / 40; p.lineTo(x, L.cy + Math.sqrt(r * r - (x - L.cx) * (x - L.cx))); }
    p.closePath();
  }
  return p;
}

function arcStroke(ctx, L, u, a0, a1) {
  const rx = L.rx0 + u * L.drx, ry = L.ry0 + u * L.dry;
  ctx.beginPath(); ctx.ellipse(L.cx, L.cy, rx, ry, 0, a0 * Math.PI / 180, a1 * Math.PI / 180); ctx.stroke();
}

function drawSeat(ctx, s, L, glow, sit) {
  const w = L.seatW * 0.92, d = L.seatD;
  ctx.save();
  ctx.translate(s.x, s.y); ctx.rotate(s.rot);
  if (glow) { ctx.strokeStyle = 'rgba(255,210,28,.75)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(0, 0, w * 0.74, d * 0.82, 0, 0, TAU); ctx.stroke(); }
  ctx.fillStyle = 'rgba(0,0,0,.28)'; rr(ctx, -d * 0.55 + 3, -w / 2 + 4, d * 1.1, w, 6); ctx.fill();
  // Rückenlehne (außen, abgewandt vom Präsidium)
  ctx.fillStyle = COL.seatBack; ctx.strokeStyle = COL.seatLine; ctx.lineWidth = 2;
  rr(ctx, -d * 0.62, -w / 2 - 1, d * 0.34, w + 2, 5); ctx.fill(); ctx.stroke();
  // Sitzfläche
  ctx.fillStyle = sit ? '#b34a4a' : COL.seat;
  rr(ctx, -d * 0.34, -w / 2 + 1, d * 0.9, w - 2, 6); ctx.fill(); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,.22)'; rr(ctx, -d * 0.2, -w / 2 + 4, d * 0.5, w * 0.28, 4); ctx.fill();
  ctx.restore();
}

export function drawBriefcase(ctx, w, h, open, t = 0) {
  ctx.save();
  ctx.fillStyle = '#9a5a2a'; ctx.strokeStyle = COL.ink; ctx.lineWidth = 2.5;
  rr(ctx, -w / 2, -h / 2, w, h, 3); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#7a4420'; ctx.fillRect(-w / 2 + 2, -h / 2 + 2, w - 4, 3);
  ctx.strokeStyle = '#5a3216'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(-w * 0.18, -h / 2); ctx.quadraticCurveTo(0, -h / 2 - h * 0.45, w * 0.18, -h / 2); ctx.stroke();
  ctx.fillStyle = COL.gold; ctx.fillRect(-2.5, -h / 2 - 1, 5, 6);
  if (open) {
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#999'; ctx.lineWidth = 1;
    for (let i = 0; i < 3; i++) { ctx.save(); ctx.translate(-w * 0.2 + i * w * 0.2, -h * 0.5 - 6 - Math.sin(t * 6 + i) * 2); ctx.rotate(-0.3 + i * 0.3); ctx.fillRect(-6, -8, 12, 14); ctx.strokeRect(-6, -8, 12, 14); ctx.restore(); }
  }
  ctx.restore();
}

function drawDoor(ctx, L, id, isOpen) {
  const A = L.aisles[id];
  const ang = Math.atan2(A.door.y - A.start.y, A.door.x - A.start.x);
  const big = id === 'C';
  const w = big ? 132 : 92, dp = big ? 44 : 34;
  ctx.save();
  ctx.translate(A.door.x, A.door.y); ctx.rotate(ang);
  // Wandrahmen
  ctx.fillStyle = COL.woodDark; rr(ctx, -dp * 0.7, -w / 2 - 8, dp * 1.55, w + 16, 8); ctx.fill();
  ctx.strokeStyle = COL.ink; ctx.lineWidth = 3; ctx.stroke();
  if (isOpen) {
    const g = ctx.createLinearGradient(-dp * 0.5, 0, dp * 0.8, 0);
    g.addColorStop(0, '#1a1320'); g.addColorStop(1, '#3a2a30');
    ctx.fillStyle = g; rr(ctx, -dp * 0.55, -w / 2, dp * 1.3, w, 6); ctx.fill();
    // aufgeklappte Türflügel
    ctx.fillStyle = COL.wood; ctx.strokeStyle = COL.ink; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(dp * 0.1, -w / 2); ctx.lineTo(dp * 0.85, -w / 2 - 14); ctx.lineTo(dp * 0.85, -w / 2 + 12); ctx.lineTo(dp * 0.1, -w / 2 + 14); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(dp * 0.1, w / 2); ctx.lineTo(dp * 0.85, w / 2 + 14); ctx.lineTo(dp * 0.85, w / 2 - 12); ctx.lineTo(dp * 0.1, w / 2 - 14); ctx.closePath(); ctx.fill(); ctx.stroke();
  } else {
    ctx.fillStyle = '#6b4a2c'; rr(ctx, -dp * 0.55, -w / 2, dp * 1.3, w, 6); ctx.fill();
    ctx.strokeStyle = '#2a1a12'; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(dp * 0.1, -w / 2 + 4); ctx.lineTo(dp * 0.1, w / 2 - 4); ctx.stroke();
    // Absperrband
    ctx.fillStyle = '#e8c23a'; ctx.fillRect(-dp * 0.2, -w / 2 - 6, dp * 0.34, w + 12);
    ctx.fillStyle = '#2a1a12';
    for (let y = -w / 2 - 6; y < w / 2 + 6; y += 16) { ctx.beginPath(); ctx.moveTo(-dp * 0.2, y); ctx.lineTo(dp * 0.14, y + 8); ctx.lineTo(dp * 0.14, y + 16); ctx.lineTo(-dp * 0.2, y + 8); ctx.closePath(); ctx.fill(); }
  }
  ctx.restore();
}

// Der ganze unveränderliche Saal. open = Menge der geöffneten Eingänge (Gang-IDs).
export function drawHall(ctx, L, open) {
  const { W, H } = L;
  // Wand
  const wg = ctx.createLinearGradient(0, 0, 0, H);
  wg.addColorStop(0, COL.wall2); wg.addColorStop(1, COL.wall);
  ctx.fillStyle = wg; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(255,255,255,.035)';
  for (let x = 0; x < W; x += 90) ctx.fillRect(x, 0, 3, H);
  ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.fillRect(0, 0, W, 8);

  const floor = floorPath(L);
  ctx.save();
  ctx.fillStyle = COL.floor; ctx.fill(floor);
  ctx.clip(floor);
  // Teppichmuster
  ctx.strokeStyle = 'rgba(255,255,255,.055)'; ctx.lineWidth = 2;
  for (let i = -H; i < W + H; i += 64) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + H, H); ctx.stroke(); ctx.beginPath(); ctx.moveTo(i + H, 0); ctx.lineTo(i, H); ctx.stroke(); }

  // Tribünenstufen: Bänder je Reihe
  const rowsEdge = L.rows - 0.5;
  const band = (L.drx + L.dry) / 2 * 0.98;
  const a0 = L.name === 'land' ? 0 : L.thMin - 4, a1 = L.name === 'land' ? 180 : L.thMax + 4;
  ctx.lineCap = 'butt';
  for (let k = L.rows - 1; k >= 0; k--) {
    ctx.strokeStyle = k % 2 ? COL.tierA : COL.tierB; ctx.lineWidth = band;
    arcStroke(ctx, L, k, a0, a1);
    ctx.strokeStyle = 'rgba(160,190,230,.35)'; ctx.lineWidth = 3;
    arcStroke(ctx, L, k - 0.48, a0, a1);
    ctx.strokeStyle = 'rgba(0,0,0,.22)'; ctx.lineWidth = 5;
    arcStroke(ctx, L, k + 0.47, a0, a1);
  }
  // Umgang (äußerer Gang) etwas heller
  ctx.strokeStyle = COL.floorLight; ctx.lineWidth = (L.wallU - rowsEdge) * band * 0.98;
  arcStroke(ctx, L, (L.wallU + rowsEdge) / 2, a0, a1);

  // Innenraum (Plenarsaal-Parkett) mit Teppich
  ctx.fillStyle = COL.well;
  ctx.beginPath(); ctx.ellipse(L.cx, L.cy, L.rx0 - L.drx * 0.62, L.ry0 - L.dry * 0.62, 0, 0, TAU);
  if (L.name === 'port') { ctx.rect(L.cx - 600, 112, 1200, L.cy + L.ry0 - L.dry * 0.62 - 112 + 0); }
  ctx.fill();
  ctx.restore();

  if (L.name === 'port') {
    // Hochformat: Parkett-Rechteck oben, abgesetzt von den Reihen
    ctx.save(); ctx.clip(floor);
    ctx.fillStyle = COL.well; ctx.fillRect(0, 112, W, L.cy + L.ry0 - L.dry * 0.6 - 112);
    ctx.fillStyle = COL.wellDark; ctx.fillRect(0, L.cy + L.ry0 - L.dry * 0.6 - 6, W, 6);
    ctx.restore();
  } else {
    ctx.save(); ctx.clip(floor);
    ctx.fillStyle = COL.well; ctx.fillRect(L.cx - (L.rx0 - L.drx * 0.62), 96, 2 * (L.rx0 - L.drx * 0.62), L.cy - 96);
    ctx.strokeStyle = COL.gold; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.ellipse(L.cx, L.cy, L.rx0 - L.drx * 0.62, L.ry0 - L.dry * 0.62, 0, 0, Math.PI); ctx.stroke();
    ctx.restore();
  }

  // Wandkante (Fußleiste)
  ctx.strokeStyle = COL.woodDark; ctx.lineWidth = 12; ctx.stroke(floor);
  ctx.strokeStyle = COL.wood; ctx.lineWidth = 5; ctx.stroke(floor);

  // Gänge
  ctx.save(); ctx.clip(floor);
  for (const id of AISLE_IDS) {
    const A = L.aisles[id], on = open.has(id);
    const inner = L.P(A.deg, -0.55), outer = L.P(A.deg, L.wallU);
    ctx.lineCap = 'butt';
    ctx.strokeStyle = on ? COL.aisleEdge : '#46546a'; ctx.lineWidth = (L.aisleHalf + 5) * 2;
    ctx.beginPath(); ctx.moveTo(inner.x, inner.y); ctx.lineTo(outer.x, outer.y); ctx.stroke();
    ctx.strokeStyle = on ? COL.aisle : COL.aisleOff; ctx.lineWidth = L.aisleHalf * 2;
    ctx.beginPath(); ctx.moveTo(inner.x, inner.y); ctx.lineTo(outer.x, outer.y); ctx.stroke();
    if (on) {
      // Laufrichtung: Pfeile nach innen
      const dx = inner.x - outer.x, dy = inner.y - outer.y, len = Math.hypot(dx, dy), ux = dx / len, uy = dy / len;
      ctx.fillStyle = COL.aisleMark;
      for (let s = 70; s < len - 40; s += 92) {
        const px = outer.x + ux * s, py = outer.y + uy * s, a = 13 * (L.unit > 1 ? 1.1 : 1);
        ctx.beginPath();
        ctx.moveTo(px + ux * a, py + uy * a); ctx.lineTo(px - ux * a * 0.6 - uy * a, py - uy * a * 0.6 + ux * a);
        ctx.lineTo(px - ux * a * 0.2, py - uy * a * 0.2); ctx.lineTo(px - ux * a * 0.6 + uy * a, py - uy * a * 0.6 - ux * a); ctx.closePath(); ctx.fill();
      }
    }
  }
  ctx.restore();

  // Sitze (von hinten nach vorn)
  const targetOpen = (s) => s.target && open.has(s.aisle);
  const sorted = L.seats.slice().sort((a, b) => a.y - b.y);
  for (const s of sorted) drawSeat(ctx, s, L, targetOpen(s), false);

  // Bühne: Präsidium und Rednerpult
  drawStage(ctx, L);

  // Türen
  for (const id of AISLE_IDS) drawDoor(ctx, L, id, open.has(id));
  drawDeco(ctx, L);
}

function drawStage(ctx, L) {
  const { cx } = L;
  const top = L.name === 'land' ? 112 : 150;
  const wd = L.name === 'land' ? 480 : 520;
  // Wandwappen (erfunden: goldener Schild mit gekreuzten Spielzeughämmern)
  ctx.save();
  ctx.translate(cx, top - (L.name === 'land' ? 2 : 6));
  ctx.fillStyle = COL.gold; ctx.strokeStyle = COL.goldDark; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(-38, -4); ctx.lineTo(38, -4); ctx.lineTo(38, 30); ctx.quadraticCurveTo(38, 52, 0, 62); ctx.quadraticCurveTo(-38, 52, -38, 30); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#7a2f3d'; ctx.beginPath(); ctx.moveTo(-30, 2); ctx.lineTo(30, 2); ctx.lineTo(30, 30); ctx.quadraticCurveTo(30, 46, 0, 55); ctx.quadraticCurveTo(-30, 46, -30, 30); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#ffe9a6'; ctx.lineWidth = 5; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-16, 12); ctx.lineTo(16, 42); ctx.moveTo(16, 12); ctx.lineTo(-16, 42); ctx.stroke();
  ctx.fillStyle = '#ffe9a6'; ctx.fillRect(-22, 8, 14, 9); ctx.fillRect(8, 8, 14, 9);
  ctx.restore();
  // Präsidium
  const y = top + 66;
  ctx.fillStyle = COL.woodDark; rr(ctx, cx - wd / 2, y, wd, 60, 14); ctx.fill();
  ctx.fillStyle = COL.wood; rr(ctx, cx - wd / 2 + 6, y + 4, wd - 12, 44, 10); ctx.fill();
  ctx.fillStyle = COL.gold; ctx.fillRect(cx - wd / 2 + 14, y + 44, wd - 28, 5);
  ctx.strokeStyle = COL.ink; ctx.lineWidth = 3; rr(ctx, cx - wd / 2, y, wd, 60, 14); ctx.stroke();
  // Namensschild und Glocke
  ctx.fillStyle = '#f3e7c6'; rr(ctx, cx - 56, y + 14, 112, 20, 5); ctx.fill();
  ctx.fillStyle = '#7a5a2a'; ctx.fillRect(cx - 44, y + 22, 88, 4);
  ctx.fillStyle = COL.gold; ctx.beginPath(); ctx.arc(cx + wd / 2 - 46, y + 12, 9, Math.PI, 0); ctx.fill(); ctx.fillRect(cx + wd / 2 - 55, y + 12, 18, 4);
  // Rednerpult
  const py = L.name === 'land' ? L.cy + 46 : L.cy + L.ry0 - L.dry * 0.62 - 120;
  ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(cx + 4, py + 40, 50, 14, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = COL.wood; ctx.strokeStyle = COL.ink; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(cx - 40, py - 8); ctx.lineTo(cx + 40, py - 8); ctx.lineTo(cx + 32, py + 36); ctx.lineTo(cx - 32, py + 36); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = COL.woodDark; ctx.beginPath(); ctx.moveTo(cx - 40, py - 8); ctx.lineTo(cx + 40, py - 8); ctx.lineTo(cx + 36, py + 6); ctx.lineTo(cx - 36, py + 6); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#d9d9d9'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(cx, py - 8); ctx.quadraticCurveTo(cx - 2, py - 34, cx + 12, py - 36); ctx.stroke();
  ctx.fillStyle = '#333'; ctx.beginPath(); ctx.ellipse(cx + 14, py - 37, 7, 5, 0.3, 0, TAU); ctx.fill();
}

function plant(ctx, x, y, s) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  ctx.fillStyle = '#7a4a2a'; ctx.strokeStyle = COL.ink; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(-18, 0); ctx.lineTo(18, 0); ctx.lineTo(13, 30); ctx.lineTo(-13, 30); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#3f9d5a';
  for (const [a, l] of [[-0.9, 40], [-0.4, 52], [0, 58], [0.4, 52], [0.9, 40]]) {
    ctx.save(); ctx.rotate(a); ctx.beginPath(); ctx.ellipse(0, -l * 0.5, 9, l * 0.55, 0, 0, TAU); ctx.fill(); ctx.stroke(); ctx.restore();
  }
  ctx.restore();
}
function drawDeco(ctx, L) {
  if (L.name === 'land') {
    plant(ctx, 70, 120, 0.9); plant(ctx, L.W - 70, 120, 0.9);
    plant(ctx, 64, L.H - 70, 0.9); plant(ctx, L.W - 64, L.H - 70, 0.9);
    // Säulen
    for (const x of [200, L.W - 200]) { ctx.fillStyle = '#c9bfa8'; ctx.strokeStyle = COL.ink; ctx.lineWidth = 3; rr(ctx, x - 20, 20, 40, 78, 6); ctx.fill(); ctx.stroke(); }
  } else {
    plant(ctx, 62, 150, 0.8); plant(ctx, L.W - 62, 150, 0.8);
    plant(ctx, 60, L.H - 70, 0.8); plant(ctx, L.W - 60, L.H - 70, 0.8);
  }
}

// ------------------------------------------------------------------ Kakerlaken
const SUIT = { standard: '#2f5aa8', flitzer: null, helm: '#59606e', zickzack: '#2f9b6a', koffer: '#7a4a8a', nachr: '#2f5aa8', boss: '#3a3a52' };
const TIE = { standard: '#e63946', flitzer: '#ff5a1f', helm: '#e8b923', zickzack: '#ffd23f', koffer: '#f4a3c4', nachr: '#e63946', boss: '#d62839' };

function eye(ctx, x, y, r, look) {
  ctx.fillStyle = '#fff'; ctx.strokeStyle = COL.ink; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(x + look, y, r * 0.5, 0, TAU); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x + look - r * 0.12, y - r * 0.22, r * 0.17, 0, TAU); ctx.fill();
}

// e: Gegner (x, y, heading, type, state, p, age, hp, hpMax, helmet, flash, seed, sitT, accessory)
export function drawRoach(ctx, e, time, unit, opts = {}) {
  const def = e.def, sc = unit * def.scale;
  const sitting = e.state === 'sit';
  let alpha = 1, pop = 1;
  if (e.age < 0.4) { const q = Math.max(0, e.age / 0.4); alpha = Math.min(1, q * 1.6); pop = 0.45 + 0.55 * q; }
  if (sitting) { alpha = Math.min(1, Math.max(0, (1.2 - e.sitT) / 0.3)); pop = 1 + Math.sin(Math.min(1, e.sitT / 0.35) * Math.PI) * 0.12; }
  if (opts.alpha != null) alpha *= opts.alpha;
  ctx.save();
  ctx.globalAlpha = alpha;
  // Schatten
  ctx.fillStyle = 'rgba(0,0,0,.25)';
  ctx.beginPath(); ctx.ellipse(e.x + 4 * sc, e.y + 9 * sc, 34 * sc, 19 * sc, e.heading, 0, TAU); ctx.fill();
  ctx.translate(e.x, e.y);
  let heading = e.heading;
  if (sitting) heading = e.seatRot != null ? e.seatRot : heading;
  ctx.rotate(heading);
  ctx.scale(sc * pop, sc * pop);

  const speedMul = e.type === 'flitzer' ? 1.7 : e.type === 'boss' ? 0.5 : 1;
  const gait = sitting || e.flinch > 0 ? 0 : time * (11 * speedMul + 4) + e.seed * 20;
  const wob = sitting ? 0 : Math.sin(gait * 0.5) * 0.06;
  ctx.rotate(wob + (e.type === 'zickzack' && e.zig ? Math.sin(time * 5 + e.seed * 9) * 0.08 : 0));

  // Beine (Dreifuß-Gang)
  ctx.strokeStyle = COL.legs; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const legs = [[16, 1, 0], [0, 1, Math.PI], [-16, 1, 0], [16, -1, Math.PI], [0, -1, 0], [-16, -1, Math.PI]];
  for (const [lx, side, ph] of legs) {
    const sw = Math.sin(gait + ph) * 9, lift = Math.max(0, Math.cos(gait + ph)) * 4;
    const kx = lx + sw * 0.4, ky = side * (24 + lift * 0.3), fx = lx + sw + 6, fy = side * (33 + lift);
    ctx.beginPath(); ctx.moveTo(lx, side * 11); ctx.lineTo(kx, ky); ctx.lineTo(fx, fy); ctx.stroke();
    if (e.type === 'flitzer') { ctx.fillStyle = '#fff'; ctx.strokeStyle = COL.ink; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(fx + 3, fy, 7, 4.5, 0, 0, TAU); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#e63946'; ctx.fillRect(fx, fy - 1.5, 6, 3); ctx.strokeStyle = COL.legs; ctx.lineWidth = 4; }
  }
  // Tempostriche des Flitzers
  if (e.type === 'flitzer' && !sitting) {
    ctx.strokeStyle = 'rgba(255,255,255,.65)'; ctx.lineWidth = 3;
    for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(-40 - Math.sin(time * 18 + i) * 4, i * 13); ctx.lineTo(-74 - i * i * 6, i * 13); ctx.stroke(); }
  }
  // Aktenkoffer in der Vorderhand
  if (e.type === 'koffer' || (e.type === 'boss' && e.accessory === 'case')) {
    const sw = sitting ? 0 : Math.sin(time * 7 + e.seed * 5) * 0.35;
    ctx.save(); ctx.translate(e.type === 'boss' ? 6 : 26, 34); ctx.rotate(sw);
    ctx.strokeStyle = '#5a3216'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, -14); ctx.lineTo(0, -4); ctx.stroke();
    drawBriefcase(ctx, e.type === 'boss' ? 34 : 28, e.type === 'boss' ? 24 : 20, false);
    ctx.restore();
  }
  // Körper
  ctx.fillStyle = COL.roach; ctx.strokeStyle = COL.roachDark; ctx.lineWidth = 3.5;
  ctx.beginPath(); ctx.ellipse(-2, 0, 33, 21, 0, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.fillStyle = COL.roachLight; ctx.beginPath(); ctx.ellipse(-4, -7, 22, 6, 0, 0, TAU); ctx.fill();
  ctx.strokeStyle = COL.roachDark; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-34, 0); ctx.lineTo(8, 0); ctx.stroke();

  // Sakko
  const suit = SUIT[e.type];
  if (suit) {
    ctx.fillStyle = suit; ctx.strokeStyle = COL.ink; ctx.lineWidth = 2.5;
    rr(ctx, -12, -18, 31, 36, 9); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.fillRect(-9, -15, 5, 30);
    // Revers und Hemd
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(19, -8); ctx.lineTo(8, 0); ctx.lineTo(19, 8); ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  // Krawatte (flattert nach hinten)
  const flap = Math.sin(time * (e.type === 'flitzer' ? 22 : 9) + e.seed * 7) * (e.type === 'flitzer' ? 7 : 2.5);
  const tl = e.type === 'flitzer' ? 36 : 22;
  ctx.fillStyle = TIE[e.type]; ctx.strokeStyle = COL.ink; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(18, -3.5); ctx.lineTo(18, 3.5); ctx.quadraticCurveTo(18 - tl * 0.6, 7 + flap, 18 - tl, 5 + flap * 1.4);
  ctx.lineTo(18 - tl - 8, flap * 1.6); ctx.lineTo(18 - tl, -5 + flap * 1.4); ctx.quadraticCurveTo(18 - tl * 0.6, -7 + flap, 18, -3.5); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = TIE[e.type]; ctx.beginPath(); ctx.arc(18, 0, 4.5, 0, TAU); ctx.fill(); ctx.stroke();

  // Nachrücker: grüne Schärpe mit Stern
  if (e.type === 'nachr') {
    ctx.save(); ctx.rotate(-0.55);
    ctx.fillStyle = '#3cc46a'; ctx.strokeStyle = COL.ink; ctx.lineWidth = 2; ctx.fillRect(-6, -29, 12, 54); ctx.strokeRect(-6, -29, 12, 54);
    ctx.restore();
    ctx.fillStyle = '#ffd23f'; ctx.strokeStyle = COL.ink; ctx.lineWidth = 1.5; star(ctx, -2, 3, 6.5); ctx.fill(); ctx.stroke();
  }

  // Kopf
  ctx.fillStyle = '#c0592a'; ctx.strokeStyle = COL.roachDark; ctx.lineWidth = 3.5;
  ctx.beginPath(); ctx.ellipse(35, 0, 15, 14, 0, 0, TAU); ctx.fill(); ctx.stroke();
  // Fühler
  ctx.strokeStyle = COL.legs; ctx.lineWidth = 2.5;
  const aw = sitting ? 0 : Math.sin(time * 9 + e.seed * 3) * 7;
  for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(46, s * 5); ctx.quadraticCurveTo(60, s * (13 + aw * 0.4), 72 + aw * 0.3, s * (22 + aw)); ctx.stroke(); }
  // Gesicht
  const look = e.state === 'sit' ? 0 : 2;
  eye(ctx, 38, -7.5, 7, look); eye(ctx, 38, 7.5, 7, look);
  ctx.strokeStyle = COL.ink; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(32, -15); ctx.lineTo(43, -12 - (e.type === 'flitzer' ? 2 : 0)); ctx.moveTo(32, 15); ctx.lineTo(43, 12 + (e.type === 'flitzer' ? 2 : 0)); ctx.stroke();
  ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(46, -2.5); ctx.quadraticCurveTo(49, 0, 46, 2.5); ctx.stroke();

  // Helm
  if (e.type === 'helm' && e.helmet) {
    ctx.fillStyle = '#ffcc1f'; ctx.strokeStyle = COL.ink; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(33, 0, 18, 17, 0, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#e6a800'; ctx.fillRect(22, -3.5, 22, 7);
    ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.beginPath(); ctx.ellipse(31, -8, 8, 3.5, 0.2, 0, TAU); ctx.fill();
    ctx.strokeStyle = COL.ink; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(48, -9); ctx.lineTo(48, 9); ctx.stroke();
  }
  // Boss-Zubehör
  if (e.type === 'boss') drawBossGear(ctx, e, time);
  // Trefferblitz
  if (e.flash > 0) {
    ctx.fillStyle = 'rgba(255,255,255,' + Math.min(0.75, e.flash * 7) + ')';
    ctx.beginPath(); ctx.ellipse(10, 0, 50, 24, 0, 0, TAU); ctx.fill();
  }
  ctx.restore();
}

function drawBossGear(ctx, e, time) {
  const a = e.accessory;
  ctx.strokeStyle = COL.ink; ctx.lineWidth = 3;
  if (a === 'tie') {
    // riesige gepunktete Krawatte
    ctx.fillStyle = '#ff8a1f'; ctx.beginPath(); ctx.moveTo(14, -7); ctx.lineTo(14, 7); ctx.lineTo(-30, 16); ctx.lineTo(-46, 0); ctx.lineTo(-30, -16); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#fff'; for (const [x, y] of [[-8, -3], [-20, 5], [-24, -7], [-36, 1]]) { ctx.beginPath(); ctx.arc(x, y, 3, 0, TAU); ctx.fill(); }
  } else if (a === 'megaphone') {
    ctx.save(); ctx.translate(40, -22); ctx.rotate(-0.5);
    ctx.fillStyle = '#e63946'; ctx.beginPath(); ctx.moveTo(0, -5); ctx.lineTo(26, -14); ctx.lineTo(26, 14); ctx.lineTo(0, 5); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.fillRect(-8, -5, 9, 10); ctx.strokeRect(-8, -5, 9, 10);
    ctx.restore();
  } else if (a === 'crown') {
    ctx.fillStyle = COL.gold; ctx.beginPath(); ctx.moveTo(24, -12); ctx.lineTo(24, 12); ctx.lineTo(40, 14); ctx.lineTo(40, 6); ctx.lineTo(47, 0); ctx.lineTo(40, -6); ctx.lineTo(40, -14); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#e63946'; ctx.beginPath(); ctx.arc(44, 0, 3, 0, TAU); ctx.fill();
    ctx.fillStyle = '#b3202f'; ctx.beginPath(); ctx.moveTo(-14, -20); ctx.lineTo(-50, -14); ctx.lineTo(-50, 14); ctx.lineTo(-14, 20); ctx.closePath(); ctx.fill(); ctx.stroke();
  } else if (a === 'gavel') {
    // Zylinder, Monokel und Richterhammer
    ctx.fillStyle = '#1d1d26'; ctx.beginPath(); ctx.ellipse(32, 0, 14, 17, 0, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#2a2a38'; ctx.fillRect(26, -8, 14, 16);
    ctx.fillStyle = '#d62839'; ctx.fillRect(26, -2.5, 14, 5);
    ctx.strokeStyle = COL.gold; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(40, 8, 6, 0, TAU); ctx.stroke();
    ctx.save(); ctx.translate(-4, -38); ctx.rotate(Math.sin(time * 4) * 0.25 - 0.6);
    ctx.fillStyle = '#8a5a34'; ctx.strokeStyle = COL.ink; ctx.lineWidth = 3; ctx.fillRect(-3, 0, 6, 26); ctx.strokeRect(-3, 0, 6, 26);
    rr(ctx, -12, -8, 24, 12, 3); ctx.fill(); ctx.stroke();
    ctx.restore();
    // goldene Amtskette
    ctx.strokeStyle = COL.gold; ctx.lineWidth = 4; ctx.beginPath(); ctx.ellipse(10, 0, 4, 19, 0, 0, TAU); ctx.stroke();
  }
}

// ------------------------------------------------------------------ Hammer
// Zeichnet den Spielzeughammer, Kopf mittig im Ursprung. s = Skalierung.
export function drawToyHammer(ctx, s) {
  ctx.save(); ctx.scale(s, s);
  ctx.lineJoin = 'round';
  // Stiel
  ctx.save(); ctx.rotate(-0.95);
  ctx.fillStyle = '#ffcf33'; ctx.strokeStyle = COL.ink; ctx.lineWidth = 5;
  rr(ctx, -9, 22, 18, 120, 8); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#e63946'; for (const y of [58, 88, 118]) ctx.fillRect(-9, y, 18, 10);
  ctx.strokeStyle = COL.ink; ctx.lineWidth = 3; ctx.strokeRect(-9, 58, 18, 10); ctx.strokeRect(-9, 88, 18, 10); ctx.strokeRect(-9, 118, 18, 10);
  ctx.fillStyle = '#ffcf33'; ctx.beginPath(); ctx.arc(0, 142, 13, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.restore();
  // Kopf
  ctx.rotate(-0.95 + Math.PI / 2);
  const g = ctx.createLinearGradient(0, -30, 0, 30); g.addColorStop(0, '#ff6b5a'); g.addColorStop(0.5, '#e63946'); g.addColorStop(1, '#b3202f');
  ctx.fillStyle = g; ctx.strokeStyle = COL.ink; ctx.lineWidth = 5;
  rr(ctx, -44, -29, 88, 58, 14); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#3d7bd9'; rr(ctx, -52, -29, 16, 58, 8); ctx.fill(); ctx.stroke(); rr(ctx, 36, -29, 16, 58, 8); ctx.fill(); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,.55)'; rr(ctx, -30, -22, 52, 9, 4); ctx.fill();
  ctx.fillStyle = '#ffcf33'; for (const x of [-12, 12]) { ctx.beginPath(); ctx.arc(x, 8, 5, 0, TAU); ctx.fill(); }
  ctx.restore();
}

// ------------------------------------------------------------------ Warnschild
export function drawWarnSign(ctx, kind, t, s = 1) {
  ctx.save(); ctx.scale(s, s);
  const pulse = 1 + Math.sin(t * 14) * 0.08;
  ctx.scale(pulse, pulse);
  const hot = kind === 'flitzer' || kind === 'boss';
  ctx.lineJoin = 'round';
  ctx.fillStyle = kind === 'flitzer' ? '#ff3b30' : kind === 'boss' ? '#b3202f' : '#ffd23f';
  ctx.strokeStyle = COL.ink; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.moveTo(0, -30); ctx.lineTo(29, 22); ctx.lineTo(-29, 22); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = hot ? '#fff' : COL.ink;
  if (kind === 'flitzer') {
    ctx.fillRect(-9, -12, 6, 22); ctx.fillRect(3, -12, 6, 22); ctx.beginPath(); ctx.arc(-6, 16, 3.4, 0, TAU); ctx.arc(6, 16, 3.4, 0, TAU); ctx.fill();
  } else {
    ctx.fillRect(-3.5, -12, 7, 21); ctx.beginPath(); ctx.arc(0, 16, 3.6, 0, TAU); ctx.fill();
  }
  ctx.restore();
}

export function drawHelmetDebris(ctx) {
  ctx.fillStyle = '#ffcc1f'; ctx.strokeStyle = COL.ink; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.ellipse(0, 0, 18, 17, 0, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#e6a800'; ctx.fillRect(-11, -3.5, 22, 7);
}
