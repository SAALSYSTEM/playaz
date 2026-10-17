// Turmschicht – Regeln, Monster-KI, Level-Prüfung, Löser und Bot. Kein DOM.
// Welt in Pixeln (180 × 320), fester Takt 60 Hz: Herausforderungen zählen in Schritten und sind überall gleich.
export const W = 180, H = 320, HZ = 60;
export const C = {
  walk: 42, climb: 32, grab: 7, edge: 5,
  patrol: 17, hunt: 27, hclimb: 21, see: 72, alert: 42, giveUp: 150,
  inv: 90, knock: 10, knockV: 110, lever: 9, star: 7, exit: 8,
  dino: { hw: 4, h: 14 }, mon: { hw: 6, h: 11 }
};
export const STORE = 'turmschicht.v1';
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const arr = (lv, k) => lv[k] || [];

export function layout(lv) {
  const n = lv.floors.length, gap = n >= 6 ? 45 : n === 5 ? 54 : 62;
  return { gap, ys: lv.floors.map((_, f) => 300 - f * gap) };
}
export const segIndex = (lv, f, x) => (lv.floors[f] || []).findIndex(([a, b]) => x >= a - 0.5 && x <= b + 0.5);
export const segOf = (lv, f, x) => (lv.floors[f] || [])[segIndex(lv, f, x)] || null;
export const ladderX = (l, levers) => (l.xs ? l.xs[levers[l.lever] ? 1 : 0] : l.x);

export function newState(lv, mode = 's') {
  const { gap, ys } = layout(lv);
  const levers = arr(lv, 'levers').map((o) => (o.init ? 1 : 0));
  return {
    lv, mode, gap, ys, clock: 0, time: 0, started: false, done: false, dead: false,
    f: 0, x: lv.start.x, ladder: -1, p: 0, face: lv.start.x < 90 ? 1 : -1, speed: 0, climbing: 0,
    hearts: 3, hits: 0, inv: 0, knock: 0, knockDir: 0, stars: 0, levers, events: [], lastLocked: -999,
    mons: arr(lv, 'monsters').map((m) => ({ f: m.f, x: m.x, dir: m.dir || 1, a: m.a, b: m.b, hunt: !!m.hunt, mode: 'patrol', t: 0, ladder: -1, p: 0, goal: -1, lost: 0 }))
  };
}
const ev = (s, t, extra) => s.events.push({ t, at: s.clock, ...extra });
export const starCount = (s) => (s.stars & 1) + (s.stars >> 1 & 1) + (s.stars >> 2 & 1);

// Hebel in Reichweite? (für die Aktionstaste)
export function nearLever(s) {
  if (s.ladder >= 0 || s.done) return -1;
  return arr(s.lv, 'levers').findIndex((o) => o.f === s.f && Math.abs(o.x - s.x) <= C.lever);
}
export function toggle(s, k) {
  const lv = s.lv;
  s.levers[k] ^= 1;
  // Niemand darf in einer verschobenen Leiter hängen bleiben: Monster landen auf der näheren Plattform an derselben Stelle.
  lv.ladders.forEach((l, i) => {
    if (l.lever !== k) return;
    for (const m of s.mons) if (m.ladder === i) { m.f = m.goal > l.f ? l.f : l.f + 1; m.x = ladderX(l, s.levers.map((v, j) => (j === k ? v ^ 1 : v))); m.ladder = -1; m.p = 0; m.goal = -1; } // zurück auf die Etage, von der es kam
    if (s.ladder === i) { s.f = s.p > 0.5 ? l.f + 1 : l.f; s.ladder = -1; s.p = 0; }
  });
  ev(s, 'lever', { k, on: s.levers[k] });
}

function dinoBox(s) {
  const y = s.ladder >= 0 ? s.ys[s.lv.ladders[s.ladder].f] - s.p * s.gap : s.ys[s.f];
  return { x: s.x, y };
}
function monY(s, m) { return m.ladder >= 0 ? s.ys[s.lv.ladders[m.ladder].f] - m.p * s.gap : s.ys[m.f]; }
export function monPos(s, m) { return { x: m.x, y: monY(s, m) }; }
export function dinoPos(s) { return dinoBox(s); }

// Ein Schritt. ix/iy: Joystick (-1…1, iy > 0 = hoch). act: Aktionstaste in diesem Schritt gedrückt.
export function step(s, ix = 0, iy = 0, act = false) {
  const lv = s.lv;
  s.clock++; s.speed = 0; s.climbing = 0;
  if (s.done || s.dead) return s;
  if (!s.started && (Math.hypot(ix, iy) > 0.2 || act)) s.started = true;
  if (s.started) s.time++;
  if (s.inv > 0) s.inv--;
  if (act) { const k = nearLever(s); if (k >= 0) toggle(s, k); }

  if (s.knock > 0) { // Rückstoß
    s.knock--; ix = 0; iy = 0;
    if (s.ladder < 0) { const seg = segOf(lv, s.f, s.x); s.x = clamp(s.x + s.knockDir * C.knockV / HZ, seg[0] + C.edge, seg[1] - C.edge); }
  }
  if (s.ladder >= 0) {
    const l = lv.ladders[s.ladder], lx = ladderX(l, s.levers);
    s.x += clamp(lx - s.x, -1.5, 1.5);
    if (Math.abs(iy) > 0.25) {
      s.p += Math.sign(iy) * Math.min(1, 0.4 + (Math.abs(iy) - 0.25)) * C.climb / HZ / s.gap; s.climbing = Math.sign(iy);
      if (s.p >= 1) arrive(s, l.f + 1, lx); else if (s.p <= 0) arrive(s, l.f, lx);
    } else if (Math.abs(ix) > 0.5 && (s.p < 0.15 || s.p > 0.85)) arrive(s, s.p > 0.5 ? l.f + 1 : l.f, lx);
  } else if (s.knock <= 0) {
    if (Math.abs(iy) > 0.45 && Math.abs(iy) >= Math.abs(ix) * 0.75) {
      const up = iy > 0; let best = -1, bd = Infinity;
      lv.ladders.forEach((l, i) => {
        if (up ? l.f !== s.f : l.f + 1 !== s.f) return;
        const d = Math.abs(ladderX(l, s.levers) - s.x); if (d <= C.grab && d < bd) { bd = d; best = i; }
      });
      if (best >= 0) { s.ladder = best; s.p = up ? 0 : 1; ev(s, 'grab'); }
    }
    if (s.ladder < 0 && Math.abs(ix) > 0.18) {
      const dir = Math.sign(ix), sp = C.walk * Math.min(1, (Math.abs(ix) - 0.18) / 0.45 + 0.25);
      const seg = segOf(lv, s.f, s.x); s.face = dir; s.speed = sp;
      s.x = clamp(s.x + dir * sp / HZ, seg[0] + C.edge, seg[1] - C.edge);
    }
  }
  if (s.ladder < 0) pickups(s);
  for (const m of s.mons) monster(s, m);
  hits(s);
  return s;
}
function arrive(s, f, x) { s.ladder = -1; s.p = 0; s.f = f; s.x = x; ev(s, 'arrive'); }

function pickups(s) {
  const lv = s.lv;
  lv.stars.forEach((o, i) => { if (!(s.stars >> i & 1) && o.f === s.f && Math.abs(o.x - s.x) < C.star) { s.stars |= 1 << i; ev(s, 'star', { i }); } });
  if (s.f === lv.floors.length - 1 && Math.abs(lv.exit.x - s.x) < C.exit) {
    if (s.mode === 's' || starCount(s) === 3) { s.done = true; ev(s, 'win'); }
    else if (s.clock - s.lastLocked > 80) { s.lastLocked = s.clock; ev(s, 'locked'); }
  }
}
function hits(s) {
  if (s.inv > 0) return;
  const d = dinoBox(s);
  for (const m of s.mons) {
    if (m.mode === 'alert') continue; // Ankündigung: Monster steht still und greift nicht an
    const my = monY(s, m);
    if (Math.abs(m.x - d.x) < C.dino.hw + C.mon.hw - 1 && d.y > my - C.mon.h + 1 && d.y - C.dino.h < my - 1) {
      s.hearts--; s.hits++; s.inv = C.inv; ev(s, 'hit', { hearts: s.hearts });
      if (s.ladder < 0) { s.knock = C.knock; s.knockDir = Math.sign(s.x - m.x) || -s.face; }
      if (s.hearts <= 0) { s.dead = true; ev(s, 'dead'); }
      return;
    }
  }
}

// Wegsuche für Jäger: Knoten = (Etage, Plattformstück), Kanten = aktuell nutzbare Leitern
export function routeTo(s, f0, x0, f1, x1) {
  const lv = s.lv, key = (f, i) => f * 10 + i, start = key(f0, segIndex(lv, f0, x0)), goal = key(f1, segIndex(lv, f1, x1));
  if (start === goal) return { same: true };
  const prev = new Map([[start, null]]), q = [start];
  while (q.length) {
    const n = q.shift(); if (n === goal) break;
    const f = Math.floor(n / 10), si = n % 10;
    lv.ladders.forEach((l, i) => {
      const lx = ladderX(l, s.levers);
      for (const [ff, tf] of [[l.f, l.f + 1], [l.f + 1, l.f]]) {
        if (ff !== f || segIndex(lv, f, lx) !== si) continue;
        const t = key(tf, segIndex(lv, tf, lx)); if (!prev.has(t)) { prev.set(t, { n, i, tf }); q.push(t); }
      }
    });
  }
  if (!prev.has(goal)) return null;
  let n = goal, first = null; while (prev.get(n)) { first = prev.get(n); n = first.n; }
  return { ladder: first.i, to: first.tf };
}
function monster(s, m) {
  const lv = s.lv;
  if (m.ladder >= 0) { // klettert
    const l = lv.ladders[m.ladder], dir = m.goal > l.f ? 1 : -1;
    m.x = ladderX(l, s.levers); m.p += dir * C.hclimb / HZ / s.gap;
    if (m.p >= 1 || m.p <= 0) { m.f = m.p >= 1 ? l.f + 1 : l.f; m.ladder = -1; m.p = 0; }
    return;
  }
  const seg = segOf(lv, m.f, m.x), pf = s.ladder >= 0 ? (s.p > 0.5 ? lv.ladders[s.ladder].f + 1 : lv.ladders[s.ladder].f) : s.f;
  if (m.mode === 'patrol') {
    m.x += m.dir * C.patrol / HZ;
    if (m.x <= m.a) { m.x = m.a; m.dir = 1; } else if (m.x >= m.b) { m.x = m.b; m.dir = -1; }
    if (m.hunt && s.ladder < 0 && s.f === m.f && segIndex(lv, s.f, s.x) === segIndex(lv, m.f, m.x) && Math.abs(s.x - m.x) < C.see && s.started) {
      m.mode = 'alert'; m.t = C.alert; m.dir = Math.sign(s.x - m.x) || 1; ev(s, 'alert');
    }
    return;
  }
  if (m.mode === 'alert') { if (--m.t <= 0) m.mode = 'chase'; return; }
  // Verfolgung
  const r = routeTo(s, m.f, m.x, pf, s.x);
  if (!r) { // Weg abgeschnitten (z. B. per Hebel): nach kurzer Zeit aufgeben
    if (++m.lost > C.giveUp) { m.mode = 'patrol'; m.lost = 0; m.a = clamp(m.x - 26, seg[0] + 6, seg[1] - 6); m.b = clamp(m.x + 26, seg[0] + 6, seg[1] - 6); ev(s, 'giveup'); }
    return;
  }
  m.lost = 0;
  const tx = r.same ? s.x : ladderX(lv.ladders[r.ladder], s.levers), dx = tx - m.x;
  if (Math.abs(dx) > 0.6) { m.dir = Math.sign(dx); m.x = clamp(m.x + m.dir * Math.min(Math.abs(dx), C.hunt / HZ), seg[0] + 4, seg[1] - 4); }
  else if (!r.same) { m.ladder = r.ladder; m.goal = r.to; m.p = r.to > m.f ? 0 : 1; }
}

// ---------- Level-Prüfung ----------
export function validate(lv) {
  const err = [], n = lv.floors.length, inSeg = (f, x, m = C.edge) => { const s = segOf(lv, f, x); return !!s && x >= s[0] + m && x <= s[1] - m; };
  if (n < 5 || n > 6) err.push('5 oder 6 Etagen');
  lv.floors.forEach((segs, f) => segs.forEach(([a, b], i) => { if (a < 2 || b > 178 || b - a < 24) err.push(`Etage ${f}: Stück ${a}-${b}`); if (i && a < segs[i - 1][1] + 12) err.push(`Etage ${f}: Lücke`); }));
  if (lv.stars.length !== 3) err.push('3 Sterne');
  const pts = [['Start', { f: 0, x: lv.start.x }], ['Ausgang', { f: n - 1, x: lv.exit.x }], ...lv.stars.map((o) => ['Stern', o]), ...arr(lv, 'levers').map((o) => ['Hebel', o])];
  for (const [k, o] of pts) if (!(o.f >= 0 && o.f < n) || !inSeg(o.f, o.x)) err.push(`${k} ${o.f}/${o.x}`);
  const ends = []; // alle möglichen Leiterpositionen je Etage
  lv.ladders.forEach((l, i) => {
    const xs = l.xs || [l.x];
    if (l.xs && !(l.lever >= 0 && l.lever < arr(lv, 'levers').length)) err.push(`Leiter ${i}: Hebel`);
    for (const x of xs) {
      if (!(l.f >= 0 && l.f < n - 1) || !inSeg(l.f, x) || !inSeg(l.f + 1, x)) err.push(`Leiter ${i} bei ${x}`);
      ends.push({ f: l.f, x, i, up: 1 }, { f: l.f + 1, x, i, up: 0 });
    }
  });
  for (const a of ends) for (const b of ends) if (a.i < b.i && a.f === b.f && a.up === b.up && Math.abs(a.x - b.x) < 16) err.push(`Leitern ${a.i}/${b.i} zu nah`);
  arr(lv, 'levers').forEach((o, k) => { if (!lv.ladders.some((l) => l.lever === k)) err.push(`Hebel ${k} ohne Leiter`); });
  arr(lv, 'monsters').forEach((m, i) => {
    const sg = segOf(lv, m.f, m.x);
    if (!sg || m.a < sg[0] + 4 || m.b > sg[1] - 4 || m.x < m.a || m.x > m.b) err.push(`Monster ${i}: Bereich`);
    if (m.f === 0 && Math.min(Math.abs(m.a - lv.start.x), Math.abs(m.b - lv.start.x)) < 50 || (m.f === 0 && lv.start.x > m.a - 50 && lv.start.x < m.b + 50)) err.push(`Monster ${i}: zu nah am Start`);
  });
  if (!lv.tip) err.push('Tipp');
  return err;
}

// ---------- Löser (ohne Monster) ----------
// Dijkstra über (Etage, Position in 2-px-Schritten, Hebelzustände, Sterne). Liefert kürzeste Zeit und Weg.
export function solve(lv, mode = 's', opts = {}) {
  const { gap } = layout(lv), top = lv.floors.length - 1, LE = arr(lv, 'levers'), cell = 2;
  const st0 = opts.start ? { ...opts.start, x: Math.round(opts.start.x / 2) * 2 } : { f: 0, x: Math.round(lv.start.x), lev: LE.reduce((m, o, k) => m | ((o.init ? 1 : 0) << k), 0), st: 0 };
  const levArr = (mask) => LE.map((_, k) => mask >> k & 1);
  const key = (s) => `${s.f},${s.x},${s.lev},${s.st}`;
  const take = (s) => { let st = s.st; lv.stars.forEach((o, i) => { if (o.f === s.f && Math.abs(o.x - s.x) < C.star) st |= 1 << i; }); return { ...s, st }; };
  const goal = (s) => s.f === top && Math.abs(lv.exit.x - s.x) < C.exit && (mode === 's' || s.st === 7);
  const dist = new Map(), prev = new Map(), heap = [];
  const push = (d, s) => { heap.push([d, s]); let i = heap.length - 1; while (i) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const t = heap[0], l = heap.pop(); if (heap.length) { heap[0] = l; let i = 0; for (;;) { const a = 2 * i + 1, b = a + 1; let m = i; if (a < heap.length && heap[a][0] < heap[m][0]) m = a; if (b < heap.length && heap[b][0] < heap[m][0]) m = b; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return t; };
  const s0 = take(st0); dist.set(key(s0), 0); push(0, s0);
  while (heap.length) {
    const [d, s] = pop(), k = key(s);
    if (d > dist.get(k)) continue;
    if (goal(s)) { const path = []; let c = k, cur = s; while (c) { path.unshift(cur); const pr = prev.get(c); if (!pr) break; [c, cur] = pr; } return { ok: true, seconds: d, path, toggles: path.filter((p, i) => i && p.lev !== path[i - 1].lev).length }; }
    const next = [], seg = segOf(lv, s.f, s.x);
    for (const dir of [-1, 1]) { const nx = clamp(s.x + dir * cell, seg[0] + C.edge, seg[1] - C.edge); if (nx !== s.x) next.push([cell / C.walk, take({ ...s, x: nx })]); }
    const levs = levArr(s.lev);
    lv.ladders.forEach((l) => {
      const lx = ladderX(l, levs); if (Math.abs(lx - s.x) > C.grab) return;
      if (l.f === s.f) next.push([gap / C.climb + 0.1, take({ ...s, f: l.f + 1, x: Math.round(lx) })]);
      else if (l.f + 1 === s.f) next.push([gap / C.climb + 0.1, take({ ...s, f: l.f, x: Math.round(lx) })]);
    });
    if (!opts.noLevers) LE.forEach((o, k2) => { if (o.f === s.f && Math.abs(o.x - s.x) <= C.lever) next.push([0.35, { ...s, lev: s.lev ^ (1 << k2) }]); });
    for (const [c, ns] of next) { const nk = key(ns), nd = d + c; if (nd < (dist.get(nk) ?? Infinity)) { dist.set(nk, nd); prev.set(nk, [k, s]); push(nd, ns); } }
  }
  return { ok: false };
}

// ---------- Bot: spielt den Löserweg mit echter Eingabe, weicht Monstern auf Leitern aus ----------
function toPlan(path) {
  const plan = [];
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i];
    if (b.lev !== a.lev) plan.push({ lever: 1 });
    else if (b.f !== a.f) plan.push({ climb: b.f > a.f ? 1 : -1, f: b.f });
    else { const last = plan[plan.length - 1]; if (last && last.walk && Math.sign(b.x - a.x) === last.dir) last.x = b.x; else plan.push({ walk: 1, x: b.x, dir: Math.sign(b.x - a.x), f: b.f }); }
  }
  return plan;
}
export function playPath(lv, mode, path, maxSeconds = 240) {
  let plan = toPlan(path);
  const s = newState(lv, mode); let k = 0, dodge = null, act = false, replans = 0;
  const replan = () => { // vom aktuellen Zustand neu planen (z. B. nach Ausweichen vor einem Jäger)
    const r = solve(lv, mode, { start: { f: s.f, x: s.x, lev: s.levers.reduce((m, v, i) => m | (v << i), 0), st: s.stars } });
    if (r.ok) { plan = toPlan(r.path); k = 0; } replans++;
  };
  const threat = () => s.mons.find((m) => {
    if (m.ladder >= 0 || m.f !== s.f || m.mode === 'alert' && m.t > 20) return false;
    const dx = m.x - s.x; if (Math.abs(dx) > 30) return false;
    const toward = m.mode === 'chase' || Math.sign(-dx) === m.dir || Math.abs(dx) < 12;
    const ahead = plan[k] && plan[k].walk && Math.sign(dx) === Math.sign(plan[k].x - s.x);
    return toward || ahead;
  });
  while (!s.done && !s.dead && s.clock < maxSeconds * HZ) {
    let ix = 0, iy = 0; act = false;
    const a = plan[k];
    if (dodge) { // auf Leiter warten, bis die Gefahr vorbei ist
      const m = dodge.m, safe = m.ladder >= 0 || m.f !== dodge.f || s.inv > 30 || (Math.abs(m.x - dodge.x) > 18 && Math.sign(m.x - dodge.x) === m.dir);
      if (s.ladder < 0) { dodge = null; if (s.f !== (plan[k] && plan[k].f)) replan(); continue; }
      if (m.mode === 'chase' && !safe) { dodge = { ...dodge, flee: true }; }
      if (dodge.flee) { iy = -dodge.back; step(s, 0, iy, false); if (s.ladder < 0) { dodge = null; replan(); } continue; }
      iy = safe ? dodge.back : Math.abs(s.p - dodge.p) > 0.04 ? Math.sign(dodge.p - s.p) : 0;
      step(s, 0, iy, false); continue;
    }
    if (!a) { ix = Math.sign(lv.exit.x - s.x); }
    else if (a.lever) { if (nearLever(s) >= 0) { act = true; k++; } else { k++; continue; } }
    else if (a.walk) {
      const dx = a.x - s.x;
      if (dx * a.dir <= 0.5 || Math.abs(dx) < 0.6) { k++; continue; }
      const m = s.inv < 20 && threat();
      if (m) { // nächste Leiter in Reichweite zum Ausweichen suchen
        let best = null;
        s.lv.ladders.forEach((l, i) => { const lx = ladderX(l, s.levers); if (Math.abs(lx - s.x) <= C.grab && (l.f === s.f || l.f + 1 === s.f)) best = { i, up: l.f === s.f }; });
        if (best && (m.mode === 'chase' ? false : true)) { dodge = { m, f: s.f, x: s.x, p: best.up ? 0.42 : 0.58, back: best.up ? -1 : 1 }; step(s, 0, best.up ? 1 : -1); continue; }
        if (m.mode !== 'chase' && Math.sign(m.x - s.x) === Math.sign(dx) && Math.sign(-(m.x - s.x)) !== m.dir) { step(s, 0, 0); continue; } // vorne, läuft weg: kurz warten
      }
      ix = Math.sign(dx) * Math.max(0.6, Math.min(1, Math.abs(dx) / 6));
    } else { iy = a.climb; if (s.ladder < 0 && s.f === a.f) { k++; continue; } }
    step(s, ix, iy, act);
  }
  return s;
}

// ---------- Spielstand & Herausforderung ----------
export const MODES = { s: 'Schneller Ausbruch', p: 'Perfekter Lauf' };
export function freshSave() { return { v: 1, unlocked: 1, best: {}, mute: false, mode: 's' }; }
export function sanitizeSave(raw, count) {
  const s = freshSave();
  if (!raw || typeof raw !== 'object') return s;
  s.unlocked = Number.isInteger(raw.unlocked) ? clamp(raw.unlocked, 1, count) : 1;
  s.mute = raw.mute === true; s.mode = raw.mode === 'p' ? 'p' : 's';
  if (raw.best && typeof raw.best === 'object') for (const [k, b] of Object.entries(raw.best)) {
    const n = Number(k); if (!Number.isInteger(n) || n < 1 || n > count || !b || typeof b !== 'object') continue;
    const e = {}; for (const m of ['s', 'p']) if (b[m] && Number.isInteger(b[m].t) && b[m].t > 0) e[m] = { t: b[m].t, hits: Number.isInteger(b[m].hits) ? b[m].hits : 0, stars: Number.isInteger(b[m].stars) ? clamp(b[m].stars, 0, 3) : 0 };
    if (Object.keys(e).length) s.best[n] = e;
  }
  return s;
}
export function recordRun(save, level, mode, t, hits, stars, count) {
  const e = (save.best[level] ??= {}), old = e[mode], better = !old || t < old.t;
  if (better) e[mode] = { t, hits, stars };
  save.unlocked = Math.max(save.unlocked, Math.min(count, level + 1));
  return better;
}
export const centis = (ticks) => Math.round(ticks * 100 / HZ);
export function parseChallenge(search, count) {
  const q = new URLSearchParams(search), l = Number(q.get('l')), t = Number(q.get('t')), m = q.get('m');
  if (!Number.isInteger(l) || l < 1 || l > count || !Number.isInteger(t) || t < 100 || t > 360000 || (m !== 's' && m !== 'p')) return null;
  return { l, t, m };
}
export const beats = (ticks, ch) => centis(ticks) < ch.t;
export const fmt = (cs) => { const s = Math.floor(cs / 100), m = Math.floor(s / 60); return (m ? m + ':' + String(s % 60).padStart(2, '0') : String(s)) + ',' + String(cs % 100).padStart(2, '0') + ' s'; };
