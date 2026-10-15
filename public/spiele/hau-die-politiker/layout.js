// HAU DIE „POLITIKER“: Geometrie des Plenarsaals.
// Zwei Layouts (Querformat "land", Hochformat "port") mit derselben Topologie: fünf Gänge, je ein Eingang am
// äußeren Ende, je Gang zwölf Zielsitze (6 Tiefen × 2 Seiten). Nur die Maße unterscheiden sich, damit ein
// Wechsel zwischen Hoch- und Querformat mitten in der Runde die Gegner nicht verliert: ein Gegner wird
// über (Gang, Zielsitz, Fortschritt p) beschrieben, die Bildschirmposition liefert das jeweilige Layout.
// Kein DOM, läuft in Node (Tests) und im Browser.

const RAD = Math.PI / 180;

export const AISLE_IDS = ['L2', 'L1', 'C', 'R1', 'R2'];            // von links nach rechts
export const ENTRANCE_NAMES = {
  C: 'Haupteingang', L1: 'Nebeneingang links', R1: 'Nebeneingang rechts', L2: 'Seitentür links', R2: 'Seitentür rechts'
};
export const TARGET_DEPTHS = 6;   // Tiefe 0 = nah am Eingang (kurzer Weg), 5 = tief im Saal (langer Weg)
const SPECS = {
  // Querformat: echter Halbkreis. Innenraum (Rednerpult) groß genug, dass fünf Gänge in der ersten Reihe nicht kollidieren.
  land: {
    name: 'land', W: 1600, H: 900, cx: 800, cy: 215,
    rows: 8, rx0: 360, drx: 46, ry0: 270, dry: 40, outU: 8.8,
    unit: 1, seatW: 36, seatD: 30, aisleHalf: 44, thMin: 6, thMax: 174, powerR: 200,
    aisleDeg: { L2: 162, L1: 126, C: 90, R1: 54, R2: 18 }
  },
  // Hochformat: Fächer mit weit entferntem Mittelpunkt (leicht gebogene Reihen, fast parallele Gänge),
  // unten Platz für Bedienelemente.
  port: {
    name: 'port', W: 900, H: 1400, cx: 450, cy: -3500,
    rows: 7, rx0: 4000, drx: 100, ry0: 4000, dry: 100, outU: 7.2,
    unit: 1.4, seatW: 30, seatD: 26, aisleHalf: 36, thMin: 83.8, thMax: 96.2, powerR: 190,
    aisleDeg: { L2: 94.88, L1: 92.44, C: 90, R1: 87.56, R2: 85.12 }
  }
};

const dist2 = (ax, ay, bx, by) => (ax - bx) * (ax - bx) + (ay - by) * (ay - by);

function segDist(px, py, x0, y0, x1, y1) {
  const dx = x1 - x0, dy = y1 - y0, l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - x0) * dx + (py - y0) * dy) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.sqrt(dist2(px, py, x0 + t * dx, y0 + t * dy));
}

function build(spec) {
  const L = Object.assign({}, spec);
  const P = (deg, u) => {
    const rx = spec.rx0 + u * spec.drx, ry = spec.ry0 + u * spec.dry;
    return { x: spec.cx + rx * Math.cos(deg * RAD), y: spec.cy + ry * Math.sin(deg * RAD) };
  };
  L.P = P;
  L.rowRx = (k) => spec.rx0 + k * spec.drx;
  L.rowRy = (k) => spec.ry0 + k * spec.dry;
  L.wallU = spec.outU + 0.45;   // Innenkante der Saalwand

  // Gänge: gerade Strecken (in Ellipsenkoordinaten ist ein Gang mit festem Winkel linear)
  L.aisles = {};
  for (const id of AISLE_IDS) {
    const deg = spec.aisleDeg[id];
    const p0 = P(deg, -0.7), p1 = P(deg, spec.outU + 0.2);
    const start = P(deg, spec.outU - 0.15);
    const door = P(deg, L.wallU);
    const dx = p0.x - start.x, dy = p0.y - start.y, l = Math.hypot(dx, dy);
    L.aisles[id] = { id, deg, p0, p1, start, door, dirX: dx / l, dirY: dy / l, name: ENTRANCE_NAMES[id] };
  }

  // Zielsitze: exakt neben dem Gang, Tiefe d = 0 (außen) … 5 (innen)
  const targets = [];
  const off = spec.aisleHalf + spec.seatW * 0.5 + 8;
  for (const id of AISLE_IDS) {
    const A = L.aisles[id];
    for (let d = 0; d < TARGET_DEPTHS; d++) {
      const k = TARGET_DEPTHS - 1 - d;                 // Reihe (0 = innen)
      const c = P(A.deg, k);
      // Normale zur Gangrichtung
      const nx = -A.dirY, ny = A.dirX;
      for (const [side, sgn] of [['a', 1], ['b', -1]]) {
        const x = c.x + nx * off * sgn, y = c.y + ny * off * sgn;
        // Sitze an der Saalwand (Seitentüren im Hochformat) entfallen auf der Wandseite
        if (x < spec.seatW || x > spec.W - spec.seatW) continue;
        targets.push({ id: id + ':' + d + ':' + side, aisle: id, depth: d, side, row: k, x, y, target: true });
      }
    }
  }

  // Restliche Sitze: auf Ellipsenbögen, nicht im Gang und nicht auf Zielsitzen
  const seats = targets.map((s) => Object.assign({}, s));
  for (let k = 0; k < spec.rows; k++) {
    const rbar = (L.rowRx(k) + L.rowRy(k)) / 2;
    const pitch = (spec.seatW * 1.12) / rbar / RAD;     // Grad
    const n = Math.ceil((spec.thMax - 90) / pitch);
    for (let j = -n; j <= n; j++) {
      const deg = 90 + j * pitch;
      if (deg < spec.thMin || deg > spec.thMax) continue;
      const p = P(deg, k);
      let ok = true;
      for (const id of AISLE_IDS) {
        const A = L.aisles[id];
        if (segDist(p.x, p.y, A.p0.x, A.p0.y, A.p1.x, A.p1.y) < spec.aisleHalf + spec.seatW * 0.5 + 4) { ok = false; break; }
      }
      if (ok) for (const t of targets) if (dist2(p.x, p.y, t.x, t.y) < (spec.seatW * 0.95) ** 2) { ok = false; break; }
      if (ok) seats.push({ id: 'x' + k + ':' + j, row: k, x: p.x, y: p.y, target: false });
    }
  }
  // Blickrichtung zum Präsidium
  for (const s of seats) s.rot = Math.atan2(spec.cy - 10 - s.y, spec.cx - s.x);
  L.seats = seats;
  L.targets = targets;
  L.targetById = Object.fromEntries(targets.map((t) => [t.id, t]));
  L._routes = new Map();
  L.route = (aisleId, seatId) => {
    const key = aisleId + '>' + seatId;
    let r = L._routes.get(key);
    if (!r) { r = buildRoute(L, aisleId, L.targetById[seatId]); L._routes.set(key, r); }
    return r;
  };
  L.safe = { x0: 40, y0: 150, x1: spec.W - 40, y1: spec.H - 40 };   // Gegner bleiben in diesem Rechteck
  return L;
}

// Weg: Eingang → (Gangpunkt neben dem Sitz) → Sitz, Ecke abgerundet
function buildRoute(L, aisleId, seat) {
  if (!seat || seat.aisle !== aisleId) throw new Error('Sitz ' + (seat && seat.id) + ' gehört nicht zu Gang ' + aisleId);
  const A = L.aisles[aisleId];
  const E = A.start;
  // Fußpunkt des Sitzes auf dem Gang
  const dx = A.p0.x - A.p1.x, dy = A.p0.y - A.p1.y, l2 = dx * dx + dy * dy;
  const t = ((seat.x - A.p1.x) * dx + (seat.y - A.p1.y) * dy) / l2;
  const Q = { x: A.p1.x + dx * t, y: A.p1.y + dy * t };
  const S = { x: seat.x, y: seat.y };
  const l0 = Math.hypot(Q.x - E.x, Q.y - E.y), l1 = Math.hypot(S.x - Q.x, S.y - Q.y);
  const r = Math.min(44, l0 * 0.4, l1 * 0.7);
  const u0 = { x: (Q.x - E.x) / l0, y: (Q.y - E.y) / l0 }, u1 = { x: (S.x - Q.x) / l1, y: (S.y - Q.y) / l1 };
  const a = { x: Q.x - u0.x * r, y: Q.y - u0.y * r }, b = { x: Q.x + u1.x * r, y: Q.y + u1.y * r };
  const pts = [E, a];
  for (let i = 1; i < 8; i++) {
    const s = i / 8, m = 1 - s;
    pts.push({ x: m * m * a.x + 2 * m * s * Q.x + s * s * b.x, y: m * m * a.y + 2 * m * s * Q.y + s * s * b.y });
  }
  pts.push(b, S);
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  const len = cum[cum.length - 1];
  // Länge des geraden Gangstücks (für Zickzack-Hüllkurve)
  const run = cum[1];
  // Normale auf den Gang (für seitliche Auslenkung)
  return { aisle: aisleId, seat: seat.id, pts, cum, len, run, nx: -u0.y, ny: u0.x };
}

// Position auf einem Weg bei Fortschritt p (0…1) inkl. Zickzack-Auslenkung
export function sampleRoute(route, p, zig) {
  const pc = p < 0 ? 0 : p > 1 ? 1 : p;
  const d = pc * route.len;
  const c = route.cum;
  let i = 1;
  while (i < c.length - 1 && c[i] < d) i++;
  const seg = c[i] - c[i - 1] || 1;
  const f = (d - c[i - 1]) / seg;
  const A = route.pts[i - 1], B = route.pts[i];
  let x = A.x + (B.x - A.x) * f, y = A.y + (B.y - A.y) * f;
  if (zig && zig.amp && d < route.run) {
    const s = d / route.run;
    const off = zig.amp * Math.sin(Math.PI * 2 * zig.freq * s + zig.phase) * Math.sin(Math.PI * s);
    x += route.nx * off; y += route.ny * off;
  }
  return { x, y };
}

const CACHE = {};
export function getLayout(name) {
  const n = name === 'port' ? 'port' : 'land';
  return CACHE[n] || (CACHE[n] = build(SPECS[n]));
}

// Tiefe → Anteil der Gangstrecke (für Gehzeit, layoutunabhängig)
export function depthFraction(d) { return 0.3 + 0.7 * (d / (TARGET_DEPTHS - 1)); }
