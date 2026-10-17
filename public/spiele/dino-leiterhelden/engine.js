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
  warn: 66, fall: 14, hit: 12 // Kokosnuss: Schatten, Fallen, liegt am Boden
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

// Kokosnuss-Phase: 0..period-1. Gefährlich kurz vor dem Aufprall und solange sie liegt.
export function nutPhase(nut, clock) { return (clock + (nut.offset || 0)) % nut.period; }
export function nutDanger(nut, clock) { const p = nutPhase(nut, clock); return p >= nut.period - 6 || p < C.hit; }

export function newState(lv) {
  const { gap } = layout(lv);
  return {
    lv, gap, clock: 0, time: 0, started: false, done: false, resets: 0,
    f: lv.start.f, x: lv.start.x, ladder: -1, p: 0, face: 1, speed: 0, climbing: 0,
    carry: -1, got: lv.friends.map(() => 0), order: [], fed: arr(lv, 'monsters').map(() => false),
    taken: arr(lv, 'fruits').map(() => false), on: arr(lv, 'levers').map(() => false),
    vis: lv.ladders.map((l) => !l.hidden), cp: { f: lv.start.f, x: lv.start.x },
    stun: 0, nudge: 0, nudgeV: 0, events: [], lastSnore: -999, lastLocked: -999
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
  if (s.stun > 0) {
    if (--s.stun === 0) { s.f = s.cp.f; s.x = s.cp.x; s.ladder = -1; s.p = 0; ev(s, 'respawn'); }
    return s;
  }
  if (!s.started && Math.hypot(ix, iy) > 0.2) s.started = true;
  if (s.nudge > 0) { s.nudge--; ix = 0; iy = 0; const seg = segOf(lv, s.f, s.x); s.x = clamp(s.x + s.nudgeV / HZ, seg[0] + C.edge, seg[1] - C.edge); }

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
    if (Math.abs(iy) > 0.45 && Math.abs(iy) >= Math.abs(ix) * 0.75) {
      const up = iy > 0; let best = -1, bd = Infinity;
      lv.ladders.forEach((l, i) => {
        if (!s.vis[i] || (up ? l.f !== s.f : l.f + 1 !== s.f)) return;
        const d = Math.abs(l.x - s.x); if (d <= C.grab && d < bd) { bd = d; best = i; }
      });
      if (best >= 0) { s.ladder = best; s.p = up ? 0 : 1; ev(s, 'grab'); return s; }
    }
    const a = Math.abs(ix);
    if (a > 0.18) {
      const dir = Math.sign(ix), sp = C.walk * Math.min(1, (a - 0.18) / 0.45 + 0.2);
      s.face = dir; s.speed = sp;
      const seg = segOf(lv, s.f, s.x);
      let nx = clamp(s.x + dir * sp / HZ, seg[0] + C.edge, seg[1] - C.edge);
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
      s.x = nx;
    }
  }
  touch(s);
  return s;
}

function touch(s) {
  const lv = s.lv, near = (o, r) => o.f === s.f && Math.abs(o.x - s.x) < r;
  lv.friends.forEach((o, i) => { if (!s.got[i] && near(o, C.pick)) { s.got[i] = 1; s.order.push(i); s.cp = { f: s.f, x: s.x }; ev(s, 'friend', { i }); } });
  arr(lv, 'fruits').forEach((o, i) => { if (s.carry < 0 && !s.taken[i] && near(o, C.pick)) { s.taken[i] = true; s.carry = i; ev(s, 'fruit', { i }); } });
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
  const pts = [['Start', lv.start], ['Tür', { f: n - 1, x: lv.door.x }], ...lv.friends.map((o) => ['Freund', o]), ...arr(lv, 'fruits').map((o) => ['Frucht', o]), ...arr(lv, 'levers').map((o) => ['Hebel', o])];
  for (const [k, o] of pts) if (!(o.f >= 0 && o.f < n) || !inSeg(o.f, o.x)) err.push(`${k} ${o.f}/${o.x} liegt nicht auf einer Plattform`);
  lv.ladders.forEach((l, i) => {
    if (!(l.f >= 0 && l.f < n - 1)) err.push(`Leiter ${i}: Etage`);
    else if (!inSeg(l.f, l.x) || !inSeg(l.f + 1, l.x)) err.push(`Leiter ${i} bei ${l.x}: nicht auf beiden Etagen`);
    lv.ladders.forEach((k, j) => { if (j > i && k.f === l.f && Math.abs(k.x - l.x) < 160) err.push(`Leiter ${i}/${j} zu nah`); });
  });
  arr(lv, 'levers').forEach((o, i) => { const l = lv.ladders[o.ladder]; if (!l || !l.hidden) err.push(`Hebel ${i}: braucht versteckte Leiter`); });
  lv.ladders.forEach((l, i) => { if (l.hidden && !arr(lv, 'levers').some((o) => o.ladder === i)) err.push(`Leiter ${i} versteckt ohne Hebel`); });
  const ends = (f) => lv.ladders.filter((l) => l.f === f || l.f + 1 === f).map((l) => l.x);
  arr(lv, 'monsters').forEach((m, i) => {
    if (!inSeg(m.f, m.x, 0)) err.push(`Monster ${i}: Plattform`);
    for (const [k, o] of pts) if (o.f === m.f && Math.abs(o.x - m.x) < C.monster + C.pick) err.push(`Monster ${i}: ${k} zu nah`);
    for (const x of ends(m.f)) if (Math.abs(x - m.x) < C.monster + 40) err.push(`Monster ${i}: Leiter zu nah`);
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
  const key = (st) => [st.f, st.x, st.carry, st.got, st.taken, st.fed, st.on].join(',');
  const start = apply({ f: lv.start.f, x: lv.start.x, carry: -1, got: 0, taken: 0, fed: 0, on: 0 });
  function apply(st) {
    st = { ...st };
    lv.friends.forEach((o, i) => { if (!(st.got >> i & 1) && o.f === st.f && Math.abs(o.x - st.x) < C.pick) st.got |= 1 << i; });
    FR.forEach((o, i) => { if (st.carry < 0 && !(st.taken >> i & 1) && o.f === st.f && Math.abs(o.x - st.x) < C.pick) { st.taken |= 1 << i; st.carry = i; } });
    LE.forEach((o, i) => { if (o.f === st.f && Math.abs(o.x - st.x) < C.pick) st.on |= 1 << i; });
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
    const seg = segOf(lv, st.f, st.x);
    for (const dir of [-1, 1]) {
      const nx = clamp(st.x + dir * cell, seg[0] + C.edge, seg[1] - C.edge);
      if (nx === st.x) continue;
      let ns = { ...st, x: nx }, blocked = false;
      M.forEach((m, i) => {
        if (blocked || (ns.fed >> i & 1) || m.f !== st.f) return;
        const lo = m.x - C.monster, hi = m.x + C.monster;
        if ((st.x <= lo && nx > lo) || (st.x >= hi && nx < hi)) { if (ns.carry >= 0) { ns.fed |= 1 << i; ns.carry = -1; } else blocked = true; }
      });
      if (!blocked) next.push([Math.abs(nx - st.x) / C.walk, apply(ns)]);
    }
    lv.ladders.forEach((l, i) => {
      if (!visible(st, i) || Math.abs(l.x - st.x) > C.grab) return;
      if (l.f === st.f) next.push([gap / C.climb + 0.1, apply({ ...st, f: l.f + 1, x: l.x })]);
      else if (l.f + 1 === st.f) next.push([gap / C.climb + 0.1, apply({ ...st, f: l.f, x: l.x })]);
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
    if (b.f !== a.f) plan.push({ climb: b.f > a.f ? 1 : -1, f: b.f, x: b.x });
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
  while (!s.done && s.clock < maxSeconds * HZ) {
    const a = plan[k]; let ix = 0, iy = 0;
    if (s.stun > 0) { step(s, 0, 0); continue; }
    if (!a) { ix = Math.sign(lv.door.x - s.x); }
    else if (a.walk) {
      if (s.f !== a.f) { // nach Rücksetzer: Plan ab passender Stelle fortsetzen
        break;
      }
      const dx = a.x - s.x;
      if (Math.abs(dx) < 3) { k++; continue; }
      ix = Math.sign(dx) * Math.max(0.5, Math.min(1, Math.abs(dx) / 30));
      if (nutWait(Math.sign(dx))) ix = 0;
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
