// Dino-Leiterhelden – Regeln, Level-Prüfung und Löser. Kein DOM, damit Node-Tests und Spiel dieselbe Logik nutzen.
// Fester Takt: 60 Schritte pro Sekunde. Gemessen wird in Schritten, damit Herausforderungen auf jedem Gerät gleich zählen.
export const W = 900, H = 1600, HZ = 60;
export const C = {
  walk: 300,        // Einheiten pro Sekunde
  climb: 250,
  grab: 78,         // so weit neben einer Leiter darf man stehen und sie trotzdem greifen
  edge: 24,         // Abstand zum Plattformende
  monster: 82,      // halbe Breite, die ein schlafendes Monster versperrt
  pick: 58,         // Freunde, Früchte, Hebel einsammeln
  door: 64,
  nut: 52,          // Trefferzone der Kokosnuss
  stun: 54,         // Schritte "Bonk" bis zum Rücksetzpunkt
  nudge: 16,        // Schritte, die das schnarchende Monster den Dino zurückschiebt
  warn: 66, fall: 14, hit: 12, // Kokosnuss: Schatten, Fallen, liegt am Boden
  slide: 54,        // Schritte, die die Rutsche braucht
  bw: 170,          // Breite der Fahr-Brücke
  dwell: 72,        // so lange steht die Brücke an jedem Ende still (1,2 s, genug zum Aufsteigen)
  wake: 66, warnW: 48, // Wechsel-Monster: wach, davor blinzelt es
  rise: 260, drift: 150, // Heißluftballon: steigen und seitlich treiben (Einheiten pro Sekunde)
  nbody: 200,       // so nah am Langhals-Körper wird das Blatt gefressen
  lower: 90         // Schritte, bis der Langhals seinen Hals abgelegt hat
};
export const STORE = 'dinoleiter.v1';

export function layout(lv) {
  const n = lv.floors.length;
  if (n === 1) return { ys: [1180], gap: 300 };
  const gap = Math.min(320, (1440 - 410) / (n - 1));
  return { ys: lv.floors.map((_, i) => 1440 - i * gap), gap };
}
export const segOf = (lv, f, x) => (lv.floors[f] || []).find(([a, b]) => x >= a - 0.5 && x <= b + 0.5) || null;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const arr = (lv, k) => lv[k] || [];
// Plattform-Stück unter x; ein satter Langhals verbindet die Stücke links und rechts seiner Lücke (open(i) = Hals liegt)
export function segAt(lv, f, x, open = () => false) {
  const out = [];
  for (const sg of lv.floors[f] || []) {
    const last = out[out.length - 1];
    if (last && arr(lv, 'necks').some((n, i) => n.f === f && n.a === last[1] && n.b === sg[0] && open(i))) last[1] = sg[1]; else out.push([...sg]);
  }
  return out.find(([a, b]) => x >= a - 0.5 && x <= b + 0.5) || null;
}

// Kokosnuss-Phase: 0..period-1. Gefährlich kurz vor dem Aufprall und solange sie liegt.
export function nutPhase(nut, clock) { return (clock + (nut.offset || 0)) % nut.period; }
export function nutDanger(nut, clock) { const p = nutPhase(nut, clock); return p >= nut.period - 6 || p < C.hit; }

// Rutsche: Einstieg auf Etage f+1 bei x, Ausstieg auf Etage f seitlich versetzt (dir 1 = rechts, -1 = links).
export const slideDx = (gap) => Math.round(((gap + 30) * 1.229 - 80) / 10) * 10; // auf 10er gerundet wie das Raster des Lösers
export const slideExit = (lv, sl) => sl.x + (sl.dir || 1) * slideDx(layout(lv).gap);

// Fahr-Brücke über eine Lücke [a, b] einer Etage: pendelt in festem Takt, steht an beiden Enden kurz still.
const bridgeCycle = (br, clock) => { const P = br.period, m = (P - 2 * C.dwell) / 2; return { p: (clock + (br.offset || 0)) % P, m }; };
export function bridgeLo(br, clock) {
  const { p, m } = bridgeCycle(br, clock), D = C.dwell, travel = br.b - br.a - C.bw;
  const t = p < D ? 0 : p < D + m ? (p - D) / m : p < 2 * D + m ? 1 : 1 - (p - 2 * D - m) / m;
  return br.a + t * travel;
}
// -1: steht am linken Ende, 1: steht am rechten Ende, 0: fährt
export function bridgeDock(br, clock) {
  const { p, m } = bridgeCycle(br, clock), D = C.dwell;
  return p < D ? -1 : p >= D + m && p < 2 * D + m ? 1 : 0;
}

// Heißluftballon: wartet auf Etage f bei x, steigt up Etagen durch eine Lücke und treibt dann zu to. Danach schwebt er leer zurück.
export function balloonTimes(lv, bl) {
  const { gap } = layout(lv), rise = Math.round(bl.up * gap / C.rise * HZ), drift = Math.round(Math.abs(bl.to - bl.x) / C.drift * HZ);
  return { rise, drift, T: rise + drift };
}
// Korb k Schritte nach dem Abflug (Rückweg spiegelt den Hinweg); außerhalb davon steht er zu Hause
export function balloonAt(lv, bl, k) {
  const { ys } = layout(lv), { rise, T } = balloonTimes(lv, bl), e = (v) => v * v * (3 - 2 * v);
  if (!(k >= 0 && k < 2 * T)) return { x: bl.x, y: ys[bl.f], fire: false, home: true };
  const q = k < T ? k : 2 * T - k;
  return { x: q <= rise ? bl.x : bl.x + (bl.to - bl.x) * e((q - rise) / (T - rise)), y: q <= rise ? ys[bl.f] + (ys[bl.f + bl.up] - ys[bl.f]) * e(q / rise) : ys[bl.f + bl.up], fire: k < T, home: false };
}

// Langhals über der Lücke [a, b]: side 1 = Körper rechts (schaut nach links), -1 = Körper links. Gefüttert wird am Körper.
export const neckBody = (nk, x) => ((nk.side || 1) > 0 ? x >= nk.b - 0.5 && x <= nk.b + C.nbody : x <= nk.a + 0.5 && x >= nk.a - C.nbody);
export const neckOpen = (s, i) => s.nfed[i] >= 0 && s.clock - s.nfed[i] >= C.lower;

// Wechsel-Monster: schläft, blinzelt kurz vor dem Aufwachen, ist dann wach und versperrt den Weg.
export const wakerPhase = (w, clock) => (clock + (w.offset || 0)) % w.period;
export const wakerAwake = (w, clock) => wakerPhase(w, clock) >= w.period - C.wake;
export const wakerWarn = (w, clock) => { const p = wakerPhase(w, clock); return p >= w.period - C.wake - C.warnW && p < w.period - C.wake; };

export function newState(lv) {
  const { gap } = layout(lv);
  return {
    lv, gap, clock: 0, time: 0, started: false, done: false, resets: 0,
    f: lv.start.f, x: lv.start.x, ladder: -1, p: 0, face: 1, speed: 0, climbing: 0,
    carry: -1, got: lv.friends.map(() => 0), order: [], fed: arr(lv, 'monsters').map(() => false),
    taken: arr(lv, 'fruits').map(() => false), on: arr(lv, 'levers').map(() => false),
    vis: lv.ladders.map((l) => !l.hidden), cp: { f: lv.start.f, x: lv.start.x },
    stun: 0, nudge: 0, nudgeV: 0, events: [], lastSnore: -999, lastLocked: -999, lastGrumble: -999,
    ride: -1, off: 0, slide: -1, sp: 0,
    fly: -1, bt: arr(lv, 'balloons').map(() => -1e9), leaf: -1, ltaken: arr(lv, 'leaves').map(() => false), nfed: arr(lv, 'necks').map(() => -1)
  };
}
export const gotAll = (s) => s.got.every(Boolean);
const ev = (s, t, extra) => s.events.push({ t, at: s.clock, ...extra });

function leaveLadder(s, f) {
  const l = s.lv.ladders[s.ladder];
  s.ladder = -1; s.p = 0; s.f = f; s.x = l.x; s.cp = { f, x: l.x }; ev(s, 'arrive');
}

// Ein Simulationsschritt. ix: -1 links … 1 rechts, iy: -1 runter … 1 hoch (Joystick, Länge ≤ 1).
export function step(s, ix = 0, iy = 0) {
  const lv = s.lv;
  s.clock++; s.speed = 0; s.climbing = 0;
  if (s.done) return s;
  if (s.started) s.time++;
  arr(lv, 'wakers').forEach((w, i) => { if (wakerAwake(w, s.clock) && !wakerAwake(w, s.clock - 1)) ev(s, 'wake', { m: i }); });
  if (s.stun > 0) {
    if (--s.stun === 0) { s.f = s.cp.f; s.x = s.cp.x; s.ladder = -1; s.p = 0; s.ride = -1; s.slide = -1; s.fly = -1; ev(s, 'respawn'); }
    return s;
  }
  if (!s.started && Math.hypot(ix, iy) > 0.2) s.started = true;
  if (s.slide >= 0) return slideTick(s);
  if (s.fly >= 0) return flyTick(s);
  if (s.ride >= 0) s.x = bridgeLo(lv.bridges[s.ride], s.clock) + s.off; // die Brücke nimmt den Dino mit
  // Wach-Monster: wer drinsteht, wenn es aufwacht, wird sanft hinausgeschoben
  if (s.ladder < 0 && s.ride < 0) {
    for (const w of arr(lv, 'wakers')) {
      if (w.f !== s.f || !wakerAwake(w, s.clock) || Math.abs(s.x - w.x) >= C.monster) continue;
      const [lo, hi] = walkRange(s);
      s.x = clamp(s.x + (s.x < w.x ? -1 : 1) * 220 / HZ, lo, hi);
      if (s.clock - s.lastGrumble > 50) { s.lastGrumble = s.clock; ev(s, 'grumble', { m: arr(lv, 'wakers').indexOf(w) }); }
      touch(s); return s;
    }
  }
  if (s.nudge > 0) { s.nudge--; ix = 0; iy = 0; const [lo, hi] = walkRange(s); s.x = clamp(s.x + s.nudgeV / HZ, lo, hi); }

  if (s.ladder >= 0) {
    const l = lv.ladders[s.ladder];
    s.x += clamp(l.x - s.x, -9, 9);
    if (Math.abs(iy) > 0.25) {
      const k = Math.min(1, 0.35 + (Math.abs(iy) - 0.25) / 0.45);
      s.p += Math.sign(iy) * k * C.climb / HZ / s.gap; s.climbing = Math.sign(iy);
      if (s.p >= 1) leaveLadder(s, l.f + 1); else if (s.p <= 0) leaveLadder(s, l.f);
    } else if (Math.abs(ix) > 0.5 && (s.p < 0.15 || s.p > 0.85)) leaveLadder(s, s.p > 0.5 ? l.f + 1 : l.f);
    if (s.ladder >= 0) return s;
  } else {
    // Greifen: Hoch/Runter deutlich stärker als seitlich, Leiter in Reichweite
    if (s.ride < 0 && Math.abs(iy) > 0.45 && Math.abs(iy) >= Math.abs(ix) * 0.75) {
      const up = iy > 0; let best = -1, bd = Infinity;
      lv.ladders.forEach((l, i) => {
        if (!s.vis[i] || (up ? l.f !== s.f : l.f + 1 !== s.f)) return;
        const d = Math.abs(l.x - s.x); if (d <= C.grab && d < bd) { bd = d; best = i; }
      });
      if (best >= 0) { s.ladder = best; s.p = up ? 0 : 1; ev(s, 'grab'); return s; }
      if (up) { // Heißluftballon: davor stehen und nach oben ziehen (nur wenn er zu Hause ist)
        let bb = -1, bd2 = Infinity;
        arr(lv, 'balloons').forEach((bl, i) => { const d = Math.abs(bl.x - s.x); if (bl.f === s.f && d <= C.grab && d < bd2 && s.clock - s.bt[i] >= 2 * balloonTimes(lv, bl).T) { bd2 = d; bb = i; } });
        if (bb >= 0) { s.fly = bb; s.bt[bb] = s.clock; s.x = lv.balloons[bb].x; ev(s, 'balloon', { i: bb }); return s; }
      }
      if (!up) { // Rutsche: am Einstieg nach unten ziehen
        let sb = -1, sd = Infinity;
        arr(lv, 'slides').forEach((sl, i) => { const d = Math.abs(sl.x - s.x); if (sl.f + 1 === s.f && d <= C.grab && d < sd) { sd = d; sb = i; } });
        if (sb >= 0) { const sl = lv.slides[sb]; s.slide = sb; s.sp = 0; s.x = sl.x; s.face = sl.dir || 1; ev(s, 'slide', { i: sb }); return s; }
      }
    }
    const a = Math.abs(ix);
    if (a > 0.18) {
      const dir = Math.sign(ix), sp = C.walk * Math.min(1, (a - 0.18) / 0.45 + 0.2);
      s.face = dir; s.speed = sp;
      const [rlo, rhi] = walkRange(s);
      let nx = clamp(s.x + dir * sp / HZ, rlo, rhi);
      arr(lv, 'monsters').forEach((m, i) => {
        if (s.fed[i] || m.f !== s.f) return;
        const lo = m.x - C.monster, hi = m.x + C.monster;
        const side = s.x <= lo && nx > lo ? -1 : s.x >= hi && nx < hi ? 1 : 0;
        if (!side) return;
        if (s.carry >= 0) { s.fed[i] = true; ev(s, 'feed', { m: i, fruit: s.carry }); s.carry = -1; }
        else {
          nx = side < 0 ? lo : hi; s.nudge = C.nudge; s.nudgeV = side * 160;
          if (s.clock - s.lastSnore > 50) { s.lastSnore = s.clock; ev(s, 'snore', { m: i }); }
        }
      });
      arr(lv, 'wakers').forEach((w, i) => { // wach: versperrt den Weg, schiebt sanft zurück; schlafend: einfach vorbeigehen
        if (w.f !== s.f || !wakerAwake(w, s.clock)) return;
        const lo = w.x - C.monster, hi = w.x + C.monster;
        const side = s.x <= lo && nx > lo ? -1 : s.x >= hi && nx < hi ? 1 : 0;
        if (!side) return;
        nx = side < 0 ? lo : hi; s.nudge = C.nudge; s.nudgeV = side * 160;
        if (s.clock - s.lastGrumble > 50) { s.lastGrumble = s.clock; ev(s, 'grumble', { m: i }); }
      });
      s.x = nx;
    }
    updateRide(s);
  }
  touch(s);
  return s;
}

function slideTick(s) {
  const sl = s.lv.slides[s.slide];
  s.sp += 1 / C.slide;
  if (s.sp >= 1) { const x = slideExit(s.lv, sl); s.f = sl.f; s.x = x; s.slide = -1; s.sp = 0; s.cp = { f: sl.f, x }; ev(s, 'arrive'); touch(s); }
  return s;
}

function flyTick(s) {
  const bl = s.lv.balloons[s.fly];
  if (s.clock - s.bt[s.fly] >= balloonTimes(s.lv, bl).T) { s.f = bl.f + bl.up; s.x = bl.to; s.fly = -1; s.cp = { f: s.f, x: s.x }; ev(s, 'arrive', { balloon: true }); touch(s); }
  return s;
}

// Wie weit darf der Dino auf seiner Plattform (oder der Brücke) laufen? Steht die Brücke am Rand, gehört sie dazu.
function walkRange(s) {
  const lv = s.lv, bs = arr(lv, 'bridges');
  if (s.ride >= 0) {
    const br = bs[s.ride], lo = bridgeLo(br, s.clock), d = bridgeDock(br, s.clock);
    return [d === -1 ? segOf(lv, s.f, br.a)[0] + C.edge : lo + 8, d === 1 ? segOf(lv, s.f, br.b)[1] - C.edge : lo + C.bw - 8];
  }
  const seg = segAt(lv, s.f, s.x, (i) => neckOpen(s, i));
  let a = seg[0] + C.edge, b = seg[1] - C.edge;
  bs.forEach((br) => {
    if (br.f !== s.f) return;
    const lo = bridgeLo(br, s.clock), d = bridgeDock(br, s.clock);
    if (seg[1] === br.a && d === -1) b = lo + C.bw - 8;
    if (seg[0] === br.b && d === 1) a = lo + 8;
  });
  return [a, b];
}
function updateRide(s) {
  s.ride = -1;
  arr(s.lv, 'bridges').forEach((br, i) => {
    if (br.f !== s.f) return;
    const lo = bridgeLo(br, s.clock);
    if (s.x > lo + 0.5 && s.x < lo + C.bw - 0.5) { s.ride = i; s.off = s.x - lo; }
  });
}

function touch(s) {
  const lv = s.lv, near = (o, r) => o.f === s.f && Math.abs(o.x - s.x) < r;
  lv.friends.forEach((o, i) => { if (!s.got[i] && near(o, C.pick)) { s.got[i] = 1; s.order.push(i); s.cp = { f: s.f, x: s.x }; ev(s, 'friend', { i }); } });
  arr(lv, 'fruits').forEach((o, i) => { if (s.carry < 0 && s.leaf < 0 && !s.taken[i] && near(o, C.pick)) { s.taken[i] = true; s.carry = i; ev(s, 'fruit', { i }); } });
  arr(lv, 'leaves').forEach((o, i) => { if (s.carry < 0 && s.leaf < 0 && !s.ltaken[i] && near(o, C.pick)) { s.ltaken[i] = true; s.leaf = i; ev(s, 'leaf', { i }); } });
  arr(lv, 'necks').forEach((nk, i) => { if (s.leaf >= 0 && s.nfed[i] < 0 && nk.f === s.f && neckBody(nk, s.x)) { s.nfed[i] = s.clock; s.leaf = -1; ev(s, 'munch', { i }); } });
  arr(lv, 'levers').forEach((o, i) => { if (!s.on[i] && near(o, C.pick)) { s.on[i] = true; s.vis[o.ladder] = true; ev(s, 'lever', { i, ladder: o.ladder }); } });
  for (const n of arr(lv, 'nuts')) if (near(n, C.nut) && nutDanger(n, s.clock)) { s.stun = C.stun; s.resets++; ev(s, 'bonk'); return; }
  const top = lv.floors.length - 1;
  if (s.f === top && Math.abs(lv.door.x - s.x) < C.door) {
    if (gotAll(s)) { s.done = true; ev(s, 'win'); }
    else if (s.clock - s.lastLocked > 90) { s.lastLocked = s.clock; ev(s, 'locked'); }
  }
}

// ---------- Level-Prüfung ----------
export function validate(lv) {
  const err = [], n = lv.floors.length, inSeg = (f, x, m = C.edge) => { const s = segOf(lv, f, x); return s && x >= s[0] + m && x <= s[1] - m; };
  if (n < 1 || n > 6) err.push('1 bis 6 Etagen');
  lv.floors.forEach((segs, f) => { segs.forEach(([a, b], i) => { if (a < 20 || b > 880 || b - a < 120) err.push(`Etage ${f}: Segment ${a}-${b}`); if (i && a <= segs[i - 1][1] + 40) err.push(`Etage ${f}: Lücke zu klein`); }); });
  if (lv.friends.length !== 3) err.push('genau 3 Freunde');
  const pts = [['Start', lv.start], ['Tür', { f: n - 1, x: lv.door.x }], ...lv.friends.map((o) => ['Freund', o]), ...arr(lv, 'fruits').map((o) => ['Frucht', o]), ...arr(lv, 'levers').map((o) => ['Hebel', o]), ...arr(lv, 'leaves').map((o) => ['Blatt', o])];
  for (const [k, o] of pts) if (!(o.f >= 0 && o.f < n) || !inSeg(o.f, o.x)) err.push(`${k} ${o.f}/${o.x} liegt nicht auf einer Plattform`);
  lv.ladders.forEach((l, i) => {
    if (!(l.f >= 0 && l.f < n - 1)) err.push(`Leiter ${i}: Etage`);
    else if (!inSeg(l.f, l.x) || !inSeg(l.f + 1, l.x)) err.push(`Leiter ${i} bei ${l.x}: nicht auf beiden Etagen`);
    lv.ladders.forEach((k, j) => { if (j > i && k.f === l.f && Math.abs(k.x - l.x) < 160) err.push(`Leiter ${i}/${j} zu nah`); });
  });
  arr(lv, 'levers').forEach((o, i) => { const l = lv.ladders[o.ladder]; if (!l || !l.hidden) err.push(`Hebel ${i}: braucht versteckte Leiter`); });
  lv.ladders.forEach((l, i) => { if (l.hidden && !arr(lv, 'levers').some((o) => o.ladder === i)) err.push(`Leiter ${i} versteckt ohne Hebel`); });
  arr(lv, 'slides').forEach((sl, i) => {
    const x2 = slideExit(lv, sl);
    if (!(n >= 2 && sl.f >= 0 && sl.f < n - 1)) { err.push(`Rutsche ${i}: Etage`); return; }
    if (!inSeg(sl.f + 1, sl.x)) err.push(`Rutsche ${i}: Einstieg ${sl.x} liegt nicht auf einer Plattform`);
    if (!inSeg(sl.f, x2)) err.push(`Rutsche ${i}: Ausstieg ${x2} liegt nicht auf einer Plattform`);
    lv.ladders.forEach((l, j) => { if (l.f === sl.f && Math.abs(l.x - sl.x) < 130) err.push(`Rutsche ${i}: Leiter ${j} am Einstieg zu nah`); });
    arr(lv, 'slides').forEach((k, j) => { if (j > i && k.f === sl.f && Math.abs(k.x - sl.x) < 160) err.push(`Rutsche ${i}/${j} zu nah`); });
  });
  arr(lv, 'bridges').forEach((br, i) => {
    const segs = lv.floors[br.f] || [];
    if (!segs.some(([, e]) => e === br.a) || !segs.some(([s0]) => s0 === br.b)) err.push(`Brücke ${i}: Lücke ${br.a}-${br.b} passt nicht zu den Plattformen`);
    if (!(br.b - br.a >= C.bw + 100 && br.b - br.a <= 480)) err.push(`Brücke ${i}: Lücke muss ${C.bw + 100} bis 480 breit sein`);
    if (!(br.period >= 2 * C.dwell + 140 && (br.period - 2 * C.dwell) % 2 === 0)) err.push(`Brücke ${i}: Takt`);
  });
  const ends = (f) => [...lv.ladders.filter((l) => l.f === f || l.f + 1 === f).map((l) => l.x),
    ...arr(lv, 'slides').flatMap((sl) => (sl.f + 1 === f ? [sl.x] : sl.f === f ? [slideExit(lv, sl)] : [])),
    ...arr(lv, 'balloons').flatMap((bl) => (bl.f === f ? [bl.x] : bl.f + bl.up === f ? [bl.to] : []))];
  arr(lv, 'balloons').forEach((bl, i) => {
    const t = bl.f + bl.up;
    if (!(bl.up === 1 || bl.up === 2) || !(bl.f >= 0 && t < n)) { err.push(`Ballon ${i}: Etagen`); return; }
    if (layout(lv).gap < 240) err.push(`Ballon ${i}: höchstens 5 Etagen`);
    if (!inSeg(bl.f, bl.x)) err.push(`Ballon ${i}: Start ${bl.x} liegt nicht auf einer Plattform`);
    if (!inSeg(t, bl.to)) err.push(`Ballon ${i}: Ziel ${bl.to} liegt nicht auf einer Plattform`);
    if (bl.x % 10 || bl.to % 10 || Math.abs(bl.to - bl.x) < 80 || Math.abs(bl.to - bl.x) > 220) err.push(`Ballon ${i}: Ziel 80 bis 220 seitlich, 10er-Raster`);
    for (let g = bl.f + 1; g <= t; g++) if ((lv.floors[g] || []).some(([a, b]) => a < bl.x + 95 && b > bl.x - 95)) err.push(`Ballon ${i}: über dem Start ist auf Etage ${g} keine Lücke`);
    lv.ladders.forEach((l, j) => { if (l.f === bl.f && Math.abs(l.x - bl.x) < 130) err.push(`Ballon ${i}: Leiter ${j} zu nah`); });
  });
  arr(lv, 'necks').forEach((nk, i) => {
    const segs = lv.floors[nk.f] || [], side = nk.side || 1;
    if (n > 5) err.push(`Langhals ${i}: höchstens 5 Etagen`);
    if (!segs.some(([, e]) => e === nk.a) || !segs.some(([s0]) => s0 === nk.b)) { err.push(`Langhals ${i}: Lücke ${nk.a}-${nk.b} passt nicht zu den Plattformen`); return; }
    if (!(nk.b - nk.a >= 140 && nk.b - nk.a <= 300)) err.push(`Langhals ${i}: Lücke muss 140 bis 300 breit sein`);
    const body = side > 0 ? segOf(lv, nk.f, nk.b) : segOf(lv, nk.f, nk.a);
    if (body[1] - body[0] < 280) err.push(`Langhals ${i}: zu wenig Platz für den Körper`);
    if (arr(lv, 'bridges').some((br) => br.f === nk.f)) err.push(`Langhals ${i}: keine Brücke auf derselben Etage`);
    const lo = side > 0 ? nk.a - 130 : nk.a - 230, hi = side > 0 ? nk.b + 230 : nk.b + 130, inZone = (x) => x > lo && x < hi;
    for (const [k, o] of pts) if (o.f === nk.f && inZone(o.x) && k !== 'Start') err.push(`Langhals ${i}: ${k} zu nah`);
    for (const x of ends(nk.f)) if (inZone(x)) err.push(`Langhals ${i}: Leiter, Rutsche oder Ballon zu nah`);
    for (const o of [...arr(lv, 'monsters'), ...arr(lv, 'wakers'), ...arr(lv, 'nuts')]) if (o.f === nk.f && o.x > lo - 90 && o.x < hi + 90) err.push(`Langhals ${i}: Hindernis zu nah`);
  });
  if (arr(lv, 'leaves').length < arr(lv, 'necks').length) err.push('zu wenige Blätter');
  arr(lv, 'monsters').forEach((m, i) => {
    if (!inSeg(m.f, m.x, 0)) err.push(`Monster ${i}: Plattform`);
    for (const [k, o] of pts) if (o.f === m.f && Math.abs(o.x - m.x) < C.monster + C.pick) err.push(`Monster ${i}: ${k} zu nah`);
    for (const x of ends(m.f)) if (Math.abs(x - m.x) < C.monster + 40) err.push(`Monster ${i}: Leiter zu nah`);
  });
  arr(lv, 'wakers').forEach((w, i) => {
    const z = C.monster + 30, seg = segOf(lv, w.f, w.x);
    if (!seg || !inSeg(w.f, w.x - z) || !inSeg(w.f, w.x + z) || segOf(lv, w.f, w.x - z) !== seg) err.push(`Wechsel-Monster ${i}: Platz auf der Plattform`);
    if (!(w.period >= 220)) err.push(`Wechsel-Monster ${i}: Takt`);
    for (const [k, o] of pts) if (o.f === w.f && Math.abs(o.x - w.x) < C.monster + C.pick + 20) err.push(`Wechsel-Monster ${i}: ${k} zu nah`);
    for (const x of ends(w.f)) if (Math.abs(x - w.x) < C.monster + 40) err.push(`Wechsel-Monster ${i}: Leiter oder Rutsche zu nah`);
  });
  if (arr(lv, 'fruits').length < arr(lv, 'monsters').length) err.push('zu wenige Früchte');
  arr(lv, 'nuts').forEach((nt, i) => {
    if (!inSeg(nt.f, nt.x) || !(nt.period >= 110)) err.push(`Nuss ${i}`);
    for (const [k, o] of pts) if (o.f === nt.f && Math.abs(o.x - nt.x) < 100) err.push(`Nuss ${i}: ${k} zu nah`);
    for (const x of ends(nt.f)) if (Math.abs(x - nt.x) < 100) err.push(`Nuss ${i}: Leiter zu nah`);
  });
  if (!lv.tip || !lv.tip.text) err.push('Tipp fehlt');
  return err;
}

// ---------- Löser ----------
// Dijkstra über Zellen (10 Einheiten) × Zustand (Freunde, Frucht, Monster, Hebel). Kokosnüsse fallen in festen Abständen
// und sind deshalb immer passierbar; der Bot im Test prüft das zusätzlich mit echter Steuerung.
export function solve(lv) {
  const cell = 10, top = lv.floors.length - 1, { gap } = layout(lv);
  const M = arr(lv, 'monsters'), FR = arr(lv, 'fruits'), LE = arr(lv, 'levers');
  const LF = arr(lv, 'leaves'), NK = arr(lv, 'necks');
  const key = (st) => [st.f, st.x, st.carry, st.got, st.taken, st.fed, st.on, st.leaf, st.lt, st.nf].join(',');
  const start = apply({ f: lv.start.f, x: lv.start.x, carry: -1, got: 0, taken: 0, fed: 0, on: 0, leaf: -1, lt: 0, nf: 0 });
  function apply(st) {
    st = { ...st };
    lv.friends.forEach((o, i) => { if (!(st.got >> i & 1) && o.f === st.f && Math.abs(o.x - st.x) < C.pick) st.got |= 1 << i; });
    FR.forEach((o, i) => { if (st.carry < 0 && st.leaf < 0 && !(st.taken >> i & 1) && o.f === st.f && Math.abs(o.x - st.x) < C.pick) { st.taken |= 1 << i; st.carry = i; } });
    LE.forEach((o, i) => { if (o.f === st.f && Math.abs(o.x - st.x) < C.pick) st.on |= 1 << i; });
    LF.forEach((o, i) => { if (st.carry < 0 && st.leaf < 0 && !(st.lt >> i & 1) && o.f === st.f && Math.abs(o.x - st.x) < C.pick) { st.lt |= 1 << i; st.leaf = i; } });
    NK.forEach((nk, i) => { if (st.leaf >= 0 && !(st.nf >> i & 1) && nk.f === st.f && neckBody(nk, st.x)) { st.nf |= 1 << i; st.leaf = -1; } });
    return st;
  }
  const visible = (st, i) => !lv.ladders[i].hidden || LE.some((o, k) => o.ladder === i && (st.on >> k & 1));
  const dist = new Map(), prev = new Map(), heap = [];
  const push = (d, st) => { heap.push([d, st]); let i = heap.length - 1; while (i) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const t = heap[0], l = heap.pop(); if (heap.length) { heap[0] = l; let i = 0; for (;;) { const a = 2 * i + 1, b = a + 1; let m = i; if (a < heap.length && heap[a][0] < heap[m][0]) m = a; if (b < heap.length && heap[b][0] < heap[m][0]) m = b; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return t; };
  dist.set(key(start), 0); push(0, start);
  const all = (1 << lv.friends.length) - 1;
  while (heap.length) {
    const [d, st] = pop(), k = key(st);
    if (d > dist.get(k)) continue;
    if (st.f === top && st.got === all && Math.abs(lv.door.x - st.x) < C.door) {
      const path = []; let c = k, s = st; while (c) { path.unshift(s); const pr = prev.get(c); if (!pr) break; [c, s] = pr; }
      return { ok: true, seconds: d, path };
    }
    const next = [];
    const seg = segAt(lv, st.f, st.x, (i) => st.nf >> i & 1);
    for (const dir of [-1, 1]) {
      const nx = clamp(st.x + dir * cell, seg[0] + C.edge, seg[1] - C.edge);
      if (nx === st.x) continue;
      let ns = { ...st, x: nx, via: null }, blocked = false;
      M.forEach((m, i) => {
        if (blocked || (ns.fed >> i & 1) || m.f !== st.f) return;
        const lo = m.x - C.monster, hi = m.x + C.monster;
        if ((st.x <= lo && nx > lo) || (st.x >= hi && nx < hi)) { if (ns.carry >= 0) { ns.fed |= 1 << i; ns.carry = -1; } else blocked = true; }
      });
      if (!blocked) next.push([Math.abs(nx - st.x) / C.walk, apply(ns)]);
    }
    lv.ladders.forEach((l, i) => {
      if (!visible(st, i) || Math.abs(l.x - st.x) > C.grab) return;
      if (l.f === st.f) next.push([gap / C.climb + 0.1, apply({ ...st, f: l.f + 1, x: l.x, via: null })]);
      else if (l.f + 1 === st.f) next.push([gap / C.climb + 0.1, apply({ ...st, f: l.f, x: l.x, via: null })]);
    });
    // Rutsche: nur nach unten; Wechsel-Monster sind immer passierbar (der Bot wartet auf das Schlafen)
    arr(lv, 'slides').forEach((sl, i) => {
      if (sl.f + 1 === st.f && Math.abs(sl.x - st.x) <= C.grab) next.push([C.slide / HZ + 0.2, apply({ ...st, f: sl.f, x: slideExit(lv, sl), via: 's' + i })]);
    });
    // Heißluftballon: nur nach oben
    arr(lv, 'balloons').forEach((bl, i) => {
      if (bl.f === st.f && Math.abs(bl.x - st.x) <= C.grab) next.push([balloonTimes(lv, bl).T / HZ + 0.3, apply({ ...st, f: bl.f + bl.up, x: bl.to, via: 'a' + i })]);
    });
    // Fahr-Brücke: von einem Lückenrand zum anderen, Kosten = im Schnitt warten + fahren
    arr(lv, 'bridges').forEach((br, i) => {
      if (br.f !== st.f || !seg) return;
      const cost = (br.period / 2 + 60) / HZ;
      if (seg[1] === br.a && st.x >= seg[1] - C.edge - 0.5) next.push([cost, apply({ ...st, x: segOf(lv, br.f, br.b)[0] + C.edge, via: 'b' + i })]);
      if (seg[0] === br.b && st.x <= seg[0] + C.edge + 0.5) next.push([cost, apply({ ...st, x: segOf(lv, br.f, br.a)[1] - C.edge, via: 'b' + i })]);
    });
    for (const [c, ns] of next) {
      const nk = key(ns), nd = d + c;
      if (nd < (dist.get(nk) ?? Infinity)) { dist.set(nk, nd); prev.set(nk, [k, st]); push(nd, ns); }
    }
  }
  return { ok: false };
}

// Bot: spielt einen Lösungsweg mit echter Joystick-Eingabe durch die Engine. Wartet vor fallenden Kokosnüssen.
export function playPath(lv, path, maxSeconds = 300) {
  const plan = [];
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i];
    if (b.via && b.via[0] === 'a') plan.push({ balloon: Number(b.via.slice(1)), f: b.f, x: b.x });
    else if (b.via && b.via[0] === 's') plan.push({ slide: Number(b.via.slice(1)), f: b.f, x: b.x });
    else if (b.via && b.via[0] === 'b') plan.push({ bridge: Number(b.via.slice(1)), dir: Math.sign(b.x - a.x), f: b.f, x: b.x });
    else if (b.f !== a.f) plan.push({ climb: b.f > a.f ? 1 : -1, f: b.f, x: b.x });
    else { const last = plan[plan.length - 1]; if (last && last.walk && last.f === b.f && Math.sign(b.x - a.x) === last.dir) last.x = b.x; else plan.push({ walk: 1, f: b.f, x: b.x, dir: Math.sign(b.x - a.x) }); }
  }
  const s = newState(lv); let k = 0, guard = 0;
  const nutWait = (dir) => arr(lv, 'nuts').some((n) => {
    if (n.f !== s.f) return false;
    const z = C.nut + 4, nx = s.x + dir * C.walk / HZ * 2;
    if (Math.abs(s.x - n.x) < z || Math.abs(nx - n.x) >= z) return false; // schon drin oder noch weit weg
    const ticks = Math.abs(n.x + dir * z - s.x) / (C.walk * 0.85) * HZ + 4;
    for (let t = 1; t <= ticks; t++) if (nutDanger(n, s.clock + t)) return true;
    return false;
  });
  // Wechsel-Monster: nur losgehen, wenn es die ganze Strecke durch seinen Bereich schläft
  const wakeWait = (dir) => arr(lv, 'wakers').some((w) => {
    if (w.f !== s.f) return false;
    const z = C.monster + 4, nx = s.x + dir * C.walk / HZ * 2;
    if (Math.abs(s.x - w.x) < z || Math.abs(nx - w.x) >= z) return false;
    const ticks = Math.ceil((2 * z + 40) / (C.walk * 0.85) * HZ) + 14;
    for (let t = 1; t <= ticks; t++) if (wakerAwake(w, s.clock + t)) return true;
    return false;
  });
  // Brücke: am Rand warten, bis sie frisch angelegt hat, aufsteigen, mitfahren, am anderen Ende absteigen
  const bridgeStep = (a) => {
    const br = lv.bridges[a.bridge], dir = a.dir, d = bridgeDock(br, s.clock), p = wakerPhase(br, s.clock), m = (br.period - 2 * C.dwell) / 2;
    const nearDock = dir > 0 ? -1 : 1, farDock = -nearDock;
    if (s.ride >= 0) {
      if (d === farDock) return dir;
      return Math.abs(s.off - (C.bw / 2)) > 6 ? Math.sign(C.bw / 2 - s.off) * 0.6 : 0;
    }
    const onNear = dir > 0 ? s.x <= br.a + 0.5 : s.x >= br.b - 0.5;
    if (!onNear) return dir;
    const edge = dir > 0 ? br.a - 20 : br.b + 20, dx = edge - s.x;
    if (Math.abs(dx) > 6 && d !== nearDock) return Math.sign(dx) * 0.9;
    const left = nearDock === -1 ? C.dwell - p : 2 * C.dwell + m - p;
    return d === nearDock && left >= 34 ? dir : (Math.abs(dx) > 6 ? Math.sign(dx) * 0.9 : 0);
  };
  while (!s.done && s.clock < maxSeconds * HZ) {
    const a = plan[k]; let ix = 0, iy = 0;
    if (s.stun > 0) { step(s, 0, 0); continue; }
    if (s.slide >= 0 || s.fly >= 0) { step(s, 0, 0); continue; }
    if (!a) { ix = Math.sign(lv.door.x - s.x); if (wakeWait(ix)) ix = 0; }
    else if (a.balloon !== undefined) {
      if (s.f === a.f) { k++; continue; }
      const dx = lv.balloons[a.balloon].x - s.x;
      if (Math.abs(dx) > 5) ix = Math.sign(dx) * Math.max(0.5, Math.min(1, Math.abs(dx) / 30)); else iy = 1; // wartet von allein, bis der Ballon zurück ist
    } else if (a.slide !== undefined) {
      if (s.f === a.f) { k++; continue; }
      const dx = lv.slides[a.slide].x - s.x;
      if (Math.abs(dx) > 5) ix = Math.sign(dx) * Math.max(0.5, Math.min(1, Math.abs(dx) / 30)); else iy = -1;
    } else if (a.bridge !== undefined) {
      const br = lv.bridges[a.bridge];
      if (s.ride < 0 && s.f === a.f && (a.dir > 0 ? s.x >= Math.max(a.x - 3, br.b + 5) : s.x <= Math.min(a.x + 3, br.a - 5))) { k++; continue; }
      ix = bridgeStep(a);
    } else if (a.walk) {
      if (s.f !== a.f) { // nach Rücksetzer: Plan ab passender Stelle fortsetzen
        break;
      }
      const dx = a.x - s.x;
      if (Math.abs(dx) < 3) { k++; continue; }
      ix = Math.sign(dx) * Math.max(0.5, Math.min(1, Math.abs(dx) / 30));
      if (nutWait(Math.sign(dx)) || wakeWait(Math.sign(dx))) ix = 0;
    } else {
      iy = a.climb;
      if (s.ladder < 0 && s.f === a.f) { k++; continue; }
    }
    step(s, ix, iy);
    if (++guard > maxSeconds * HZ * 2) break;
  }
  return s;
}

// ---------- Spielstand ----------
export function freshSave() { return { v: 1, unlocked: 1, best: {}, mute: false }; }
export function sanitizeSave(raw, count) {
  const s = freshSave();
  if (!raw || typeof raw !== 'object') return s;
  s.unlocked = Number.isInteger(raw.unlocked) ? clamp(raw.unlocked, 1, count) : 1;
  s.mute = raw.mute === true;
  if (raw.best && typeof raw.best === 'object') for (const [k, b] of Object.entries(raw.best)) {
    const n = Number(k); if (Number.isInteger(n) && n >= 1 && n <= count && b && Number.isInteger(b.t) && b.t > 0 && Number.isInteger(b.r) && b.r >= 0) s.best[n] = { t: b.t, r: b.r };
  }
  return s;
}
// Ergebnis eintragen. t in Schritten. Liefert, ob es eine neue Bestzeit ist.
export function recordRun(save, level, t, r, count) {
  const old = save.best[level], better = !old || t < old.t || (t === old.t && r < old.r);
  if (better) save.best[level] = { t, r };
  save.unlocked = Math.max(save.unlocked, Math.min(count, level + 1));
  return better;
}
// Herausforderung: Zeit in Hundertstelsekunden (aus Schritten), Gleichstand → weniger Rücksetzer gewinnen.
export const centis = (ticks) => Math.round(ticks * 100 / HZ);
export function parseChallenge(search, count) {
  const q = new URLSearchParams(search), l = Number(q.get('l')), t = Number(q.get('t')), r = Number(q.get('r') ?? 0);
  if (!Number.isInteger(l) || l < 1 || l > count || !Number.isInteger(t) || t < 100 || t > 360000 || !Number.isInteger(r) || r < 0 || r > 999) return null;
  return { l, t, r };
}
export function beats(myTicks, myResets, ch) {
  const mine = centis(myTicks);
  return mine < ch.t || (mine === ch.t && myResets < ch.r);
}
export const fmt = (cs) => { const s = Math.floor(cs / 100), m = Math.floor(s / 60); return (m ? m + ':' + String(s % 60).padStart(2, '0') : String(s)) + ',' + String(cs % 100).padStart(2, '0') + ' s'; };
