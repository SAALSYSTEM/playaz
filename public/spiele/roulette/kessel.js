// Roulette – der Kessel: Zeichnen (Holz, Kugelbahn, Zahlenkranz, Fächer, Drehkreuz) und die Bahn der Kugel.
// Die Zielzahl steht vorher fest; plan() berechnet nur eine glaubwürdige Bahn, die genau in diesem Fach endet.
import * as R from './roulette.js';

const TAU = Math.PI * 2, STEP = TAU / 37;
const FARBE = { rot: '#b3141c', schwarz: '#141418', gruen: '#0f7a43' };

// Lage im Kessel (Anteile des Radius)
export const MASS = { rand: 0.985, bahnAussen: 0.87, bahnInnen: 0.745, kranzAussen: 0.735, kranzInnen: 0.6, fachInnen: 0.49, kugelBahn: 0.805, kugelFach: 0.545, kugel: 0.036 };

// Drehender Teil wird einmal je Größe vorgezeichnet
let rotorCache = null, rotorGroesse = 0;
function rotor(S) {
  if (rotorCache && rotorGroesse === S) return rotorCache;
  const c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d');
  const R0 = S / 2; g.translate(R0, R0);
  // Zahlenkranz + Fächer
  for (let i = 0; i < 37; i++) {
    const n = R.KESSEL[i], a0 = i * STEP - STEP / 2 - Math.PI / 2, a1 = a0 + STEP;
    g.beginPath(); g.arc(0, 0, R0 * MASS.kranzAussen, a0, a1); g.arc(0, 0, R0 * MASS.kranzInnen, a1, a0, true); g.closePath();
    g.fillStyle = FARBE[R.farbe(n)]; g.fill();
    g.beginPath(); g.arc(0, 0, R0 * MASS.kranzInnen, a0, a1); g.arc(0, 0, R0 * MASS.fachInnen, a1, a0, true); g.closePath();
    const fg = g.createRadialGradient(0, 0, R0 * MASS.fachInnen, 0, 0, R0 * MASS.kranzInnen);
    const f = FARBE[R.farbe(n)];
    fg.addColorStop(0, '#050505'); fg.addColorStop(0.5, f); fg.addColorStop(1, '#0a0a0a');
    g.fillStyle = fg; g.fill();
    // Zahl
    g.save(); g.rotate(i * STEP); g.fillStyle = '#fff';
    g.font = '700 ' + Math.round(R0 * 0.085) + 'px "Barlow Condensed",system-ui,sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(String(n), 0, -R0 * (MASS.kranzAussen + MASS.kranzInnen) / 2 + 1);
    g.restore();
  }
  // goldene Stege
  g.strokeStyle = '#d9b456'; g.lineWidth = Math.max(1, R0 * 0.008);
  for (let i = 0; i < 37; i++) {
    const a = i * STEP - STEP / 2 - Math.PI / 2;
    g.beginPath(); g.moveTo(Math.cos(a) * R0 * MASS.fachInnen, Math.sin(a) * R0 * MASS.fachInnen); g.lineTo(Math.cos(a) * R0 * MASS.kranzAussen, Math.sin(a) * R0 * MASS.kranzAussen); g.stroke();
  }
  for (const r of [MASS.kranzAussen, MASS.kranzInnen, MASS.fachInnen]) { g.beginPath(); g.arc(0, 0, R0 * r, 0, TAU); g.stroke(); }
  // Kegel (Holz) mit Drehkreuz
  const kg = g.createRadialGradient(-R0 * 0.12, -R0 * 0.15, R0 * 0.05, 0, 0, R0 * MASS.fachInnen);
  kg.addColorStop(0, '#a8692e'); kg.addColorStop(0.55, '#6e3b16'); kg.addColorStop(1, '#3a1d09');
  g.fillStyle = kg; g.beginPath(); g.arc(0, 0, R0 * MASS.fachInnen, 0, TAU); g.fill();
  g.strokeStyle = 'rgba(255,220,140,.25)'; g.lineWidth = 1;
  for (let i = 0; i < 18; i++) { g.beginPath(); g.arc(0, 0, R0 * MASS.fachInnen * (0.35 + i * 0.036), 0, TAU); g.stroke(); }
  const gold = g.createLinearGradient(-R0 * 0.3, -R0 * 0.3, R0 * 0.3, R0 * 0.3);
  gold.addColorStop(0, '#fff1b8'); gold.addColorStop(0.45, '#d9a83a'); gold.addColorStop(1, '#8a5e12');
  g.fillStyle = gold; g.strokeStyle = '#6b4708'; g.lineWidth = 1;
  for (let k = 0; k < 4; k++) {
    g.save(); g.rotate(k * Math.PI / 2);
    g.beginPath(); g.moveTo(-R0 * 0.025, 0); g.lineTo(-R0 * 0.018, -R0 * 0.3); g.arc(0, -R0 * 0.32, R0 * 0.03, Math.PI * 0.9, Math.PI * 2.1); g.lineTo(R0 * 0.025, 0); g.closePath(); g.fill(); g.stroke();
    g.restore();
  }
  g.beginPath(); g.arc(0, 0, R0 * 0.075, 0, TAU); g.fill(); g.stroke();
  g.fillStyle = '#fff6cf'; g.beginPath(); g.arc(-R0 * 0.02, -R0 * 0.025, R0 * 0.025, 0, TAU); g.fill();
  rotorCache = c; rotorGroesse = S;
  return c;
}

let schaleCache = null, schaleGroesse = 0;
function schale(S) {
  if (schaleCache && schaleGroesse === S) return schaleCache;
  const c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d');
  const R0 = S / 2; g.translate(R0, R0);
  // Holzrand
  const hg = g.createRadialGradient(0, 0, R0 * MASS.bahnAussen, 0, 0, R0 * MASS.rand);
  hg.addColorStop(0, '#2a1407'); hg.addColorStop(0.35, '#7a4219'); hg.addColorStop(0.7, '#a35e27'); hg.addColorStop(1, '#3b1c08');
  g.fillStyle = hg; g.beginPath(); g.arc(0, 0, R0 * MASS.rand, 0, TAU); g.fill();
  g.strokeStyle = '#d9b456'; g.lineWidth = Math.max(1.5, R0 * 0.012); g.beginPath(); g.arc(0, 0, R0 * MASS.rand - g.lineWidth / 2, 0, TAU); g.stroke();
  // Kugelbahn
  const bg = g.createRadialGradient(0, 0, R0 * MASS.bahnInnen, 0, 0, R0 * MASS.bahnAussen);
  bg.addColorStop(0, '#1d0f06'); bg.addColorStop(0.5, '#4a2810'); bg.addColorStop(0.92, '#6f3d17'); bg.addColorStop(1, '#2a1407');
  g.fillStyle = bg; g.beginPath(); g.arc(0, 0, R0 * MASS.bahnAussen, 0, TAU); g.arc(0, 0, R0 * MASS.bahnInnen, 0, TAU, true); g.fill();
  g.strokeStyle = 'rgba(217,180,86,.7)'; g.lineWidth = 1; g.beginPath(); g.arc(0, 0, R0 * MASS.bahnAussen, 0, TAU); g.stroke();
  // Rauten (Ablenker)
  g.fillStyle = '#e3c26a'; g.strokeStyle = '#7a5810';
  for (let k = 0; k < 8; k++) {
    const a = k * TAU / 8 + TAU / 16, r = R0 * 0.775, w = R0 * 0.022, h = R0 * 0.05;
    g.save(); g.rotate(a); g.translate(0, -r);
    g.beginPath(); g.moveTo(0, -h); g.lineTo(w, 0); g.lineTo(0, h); g.lineTo(-w, 0); g.closePath(); g.fill(); g.stroke();
    g.restore();
  }
  schaleCache = c; schaleGroesse = S;
  return c;
}

// Kugelposition in Kessel-Koordinaten (Winkel absolut, Radius-Anteil)
export function zeichne(g, S, winkel, kugel) {
  const R0 = S / 2;
  g.clearRect(0, 0, S, S);
  g.drawImage(schale(S), 0, 0);
  g.save(); g.translate(R0, R0); g.rotate(winkel); g.drawImage(rotor(S), -R0, -R0); g.restore();
  // Glanz
  const gl = g.createRadialGradient(R0 * 0.7, R0 * 0.55, R0 * 0.05, R0, R0, R0);
  gl.addColorStop(0, 'rgba(255,255,255,.12)'); gl.addColorStop(0.5, 'rgba(255,255,255,0)');
  g.fillStyle = gl; g.beginPath(); g.arc(R0, R0, R0 * MASS.rand, 0, TAU); g.fill();
  if (kugel) {
    const x = R0 + Math.cos(kugel.w - Math.PI / 2) * R0 * kugel.r, y = R0 + Math.sin(kugel.w - Math.PI / 2) * R0 * kugel.r, kr = Math.max(3, R0 * MASS.kugel);
    g.fillStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.arc(x + kr * 0.3, y + kr * 0.4, kr, 0, TAU); g.fill();
    const kg = g.createRadialGradient(x - kr * 0.35, y - kr * 0.4, kr * 0.1, x, y, kr);
    kg.addColorStop(0, '#ffffff'); kg.addColorStop(0.6, '#e6e6e6'); kg.addColorStop(1, '#9a9a9a');
    g.fillStyle = kg; g.beginPath(); g.arc(x, y, kr, 0, TAU); g.fill();
  }
}

export function cacheLeeren() { rotorCache = null; schaleCache = null; }

// ------------------------------------------------------------------ Bewegung
// Kessel: dreht gegen den Uhrzeigersinn. Ruhe-Tempo + Anschub, der abklingt.
export const RUHE = -0.32;
export function kesselWinkel(k, t) {
  const dt = t - k.t0;
  return k.w0 + k.ruhe * dt + k.schub * (1 - Math.exp(-dt / k.tau));
}
export function kesselTempo(k, t) { const dt = t - k.t0; return k.ruhe + (k.schub / k.tau) * Math.exp(-dt / k.tau); }
export function anschub(w0, t0, staerke = 1) { return { w0, t0, ruhe: RUHE, schub: -1.6 * Math.PI * staerke, tau: 2.2 }; }
// Kessel läuft sanft aus (aus dem aktuellen Tempo bis zum Stillstand)
export function auslaufen(k, t) { const tau = 2.5; return { w0: kesselWinkel(k, t), t0: t, ruhe: 0, schub: kesselTempo(k, t) * tau, tau }; }
export const stehend = (w0 = 0) => ({ w0, t0: 0, ruhe: 0, schub: 0, tau: 1 });

// Kugelbahn zur Zielzahl. k = Kessel-Bewegung, start = Zeit des Abwurfs, dauer in s.
// Liefert f(t) → { w, r, phase, klack } (w absolut, r Anteil des Radius)
export function plan(k, start, dauer, zahl, kugelStart) {
  const i = R.KESSEL.indexOf(zahl);
  const T1 = dauer * 0.6, T2 = dauer - T1;
  const v0 = 15, v1 = 4.6, a = (v0 - v1) / T1;
  const w0 = kugelStart;
  const kugelW = (dt) => w0 + v0 * dt - 0.5 * a * dt * dt;
  const phi1 = kugelW(T1) - kesselWinkel(k, start + T1);
  const rho1 = v1 - kesselTempo(k, start + T1);
  // Zielwinkel relativ zum Kessel: Fach i, so weit voraus, dass die Kugel natürlich ausläuft
  let phiT = i * STEP; const minD = rho1 * T2 * 0.42;
  while (phiT - phi1 < minD) phiT += TAU;
  while (phiT - phi1 > minD + TAU) phiT -= TAU;
  const D = T2;
  return (t) => {
    const dt = t - start;
    if (dt <= 0) return { w: w0, r: MASS.kugelBahn, phase: 0 };
    if (dt < T1) return { w: kugelW(dt), r: MASS.kugelBahn - 0.012 * Math.sin(dt * 9) * (dt / T1), phase: 1 };
    const s = Math.min(1, (dt - T1) / D);
    const h00 = 2 * s ** 3 - 3 * s ** 2 + 1, h10 = s ** 3 - 2 * s ** 2 + s, h01 = -2 * s ** 3 + 3 * s ** 2;
    const phi = h00 * phi1 + h10 * D * rho1 + h01 * phiT;
    const d = MASS.kugelBahn - MASS.kugelFach;
    const r = MASS.kugelFach + d * ((1 - s) ** 3 + 0.2 * (1 - s) * Math.abs(Math.sin(9 * s)));
    return { w: kesselWinkel(k, start + dt) + phi, r, phase: s >= 1 ? 3 : 2, s };
  };
}
// Ruhende Kugel im Fach einer Zahl
export function imFach(k, t, zahl) { return { w: kesselWinkel(k, t) + R.KESSEL.indexOf(zahl) * STEP, r: MASS.kugelFach, phase: 3 }; }
