// Krümel – Die große Käsejagd: Regeln und Physik. Kein DOM, damit Spiel und Node-Tests dieselbe Logik nutzen.
// Fester Takt: 60 Schritte pro Sekunde. Alle Werte in Pixeln bzw. Pixeln pro Schritt, eine Kachel = 32 px.
export const T = 32, HZ = 60;

export const C = {
  run: 2.7,          // Höchsttempo
  accG: 0.42, decG: 0.55,   // Boden: anfahren, bremsen
  accA: 0.30, decA: 0.10,   // Luft: etwas weniger Kontrolle
  jump: 9.4,         // Absprung
  gUp: 0.48,         // Schwerkraft beim Steigen mit gehaltener Taste (hoher Sprung)
  g: 0.95,           // sonst (Taste losgelassen = kurzer Sprung, Fallen)
  maxFall: 10,
  coyote: 6,         // so viele Schritte nach dem Verlassen einer Kante klappt der Sprung noch
  buffer: 8,         // so viele Schritte vor der Landung wird ein Sprung gemerkt
  climb: 2.3,
  bounce: 7.2,       // Abprallen nach Sprung auf ein Kätzchen (mit gehaltener Taste: voller Sprung)
  hitFreeze: 34,     // Schritte "Autsch" bis zum Fähnchen
  fallFreeze: 18,
  invuln: 90,        // Schutzzeit nach dem Zurücksetzen
  catSpeed: 0.85,
  pick: 18,          // Sammelradius Krümel/Käse
};

// Kacheln
export const EMPTY = 0, SOLID = 1, SHELF = 2, LADDER = 3;

// ---------------------------------------------------------------- Level-Baukasten
// Level werden mit kleinen Befehlen beschrieben statt als Zeichenraster: leichter zu lesen und zu ändern.
// Koordinaten in Kacheln, y = 0 oben. Figuren/Gegenstände stehen in der Zelle (x, y), also auf der Oberkante von y + 1.
export function build(def) {
  const { w, h } = def;
  const grid = new Uint8Array(w * h);
  const L = {
    w, h, grid, crumbs: [], golds: [], flags: [], cats: [], lifts: [], tips: [], start: null, goal: null, name: def.name || '', floor: def.floor ?? h,
  };
  const set = (x, y, v) => { if (x >= 0 && x < w && y >= 0 && y < h) grid[y * w + x] = v; };
  const api = {
    solid(x0, y0, x1, y1) { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, SOLID); },
    clear(x0, y0, x1, y1) { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, EMPTY); },
    shelf(x0, x1, y) { for (let x = x0; x <= x1; x++) set(x, y, SHELF); },
    ladder(x, y0, y1) { for (let y = y0; y <= y1; y++) set(x, y, LADDER); },
    crumb(x, y) { L.crumbs.push({ x: (x + 0.5) * T, y: (y + 0.5) * T }); },
    crumbs(x0, x1, y) { for (let x = x0; x <= x1; x++) api.crumb(x, y); },
    gold(x, y) { L.golds.push({ x: (x + 0.5) * T, y: (y + 0.5) * T }); },
    flag(x, y) { L.flags.push({ x: (x + 0.5) * T, y: (y + 1) * T }); },
    cat(x, y, x0, x1) { L.cats.push({ x: (x + 0.5) * T, y: (y + 1) * T, x0: x0 * T, x1: (x1 + 1) * T }); },
    // Aufzug (Schublade): fester Ablauf unten warten → hoch → oben warten → runter. Oberkante in Kacheln.
    lift(x, w, yLow, yHigh, o = {}) { L.lifts.push({ x: x * T, w: w * T, low: yLow * T, high: yHigh * T, speed: o.speed || 1.5, wait: o.wait || 70, offset: o.offset || 0 }); },
    tip(x, text, icon) { L.tips.push({ x: x * T, text, icon: icon || '💡' }); },
    start(x, y) { L.start = { x: (x + 0.5) * T, y: (y + 1) * T }; },
    goal(x, y) { L.goal = { x: (x + 0.5) * T, y: (y + 1) * T }; },
  };
  def.build(api);
  L.tips.sort((a, b) => a.x - b.x);
  return L;
}

export const tileAt = (L, tx, ty) => {
  if (tx < 0 || tx >= L.w) return SOLID;   // Seitenränder sind Wände
  if (ty < 0 || ty >= L.h) return EMPTY;   // unten offen: wer hinausfällt, kommt zum Fähnchen zurück
  return L.grid[ty * L.w + tx];
};
// Oberste Leiterkachel trägt wie ein Regalbrett
const ladderTop = (L, tx, ty) => tileAt(L, tx, ty) === LADDER && tileAt(L, tx, ty - 1) !== LADDER;

// ---------------------------------------------------------------- Aufzug
export function liftCycle(lf) { const move = Math.ceil((lf.low - lf.high) / lf.speed); return { move, total: 2 * lf.wait + 2 * move }; }
export function liftY(lf, t) {
  const { move, total } = liftCycle(lf);
  let p = (t + lf.offset) % total;
  if (p < lf.wait) return lf.low;
  p -= lf.wait;
  if (p < move) return lf.low - (lf.low - lf.high) * (p / move);
  p -= move;
  if (p < lf.wait) return lf.high;
  p -= lf.wait;
  return lf.high + (lf.low - lf.high) * (p / move);
}
export const LIFT_H = 12;

// ---------------------------------------------------------------- Spielzustand
export function sizeOf(big) { return big ? { w: 24, h: 30 } : { w: 20, h: 20 }; }

export function newWorld(L, opt = {}) {
  const sz = sizeOf(false);
  const s = {
    L, t: 0, done: false, opt,
    p: {
      x: L.start.x - sz.w / 2, y: L.start.y - sz.h, w: sz.w, h: sz.h, vx: 0, vy: 0, big: false,
      ground: false, lift: -1, coyote: 0, buffer: 0, ladder: false, face: 1, invuln: 0, freeze: 0, freezeKind: '',
      prevJump: false, jumping: false, landT: 0, airT: 0, runT: 0,
    },
    check: { x: L.start.x, y: L.start.y },
    flagHit: L.flags.map(() => false),
    crumbs: L.crumbs.map(() => false),
    golds: L.golds.map(() => false),
    cats: L.cats.map((c) => ({ x: c.x - 13, y: c.y - 20, w: 26, h: 20, vx: -C.catSpeed, x0: c.x0, x1: c.x1, state: 'walk', t: 0 })),
    lifts: L.lifts.map((lf) => ({ ...lf, y: liftY(lf, 0), dy: 0 })),
    nCrumbs: 0, nGolds: 0, resets: 0, stomps: 0,
    events: [],
  };
  return s;
}

const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

function solidAt(L, px, py) { return tileAt(L, Math.floor(px / T), Math.floor(py / T)) === SOLID; }

// Waagerecht bewegen gegen feste Kacheln
function moveX(s, dx) {
  const p = s.p, L = s.L;
  p.x += dx;
  const y0 = Math.floor(p.y / T), y1 = Math.floor((p.y + p.h - 0.01) / T);
  if (dx > 0) {
    const tx = Math.floor((p.x + p.w) / T);
    for (let ty = y0; ty <= y1; ty++) if (tileAt(L, tx, ty) === SOLID) { p.x = tx * T - p.w; p.vx = 0; break; }
  } else if (dx < 0) {
    const tx = Math.floor(p.x / T);
    for (let ty = y0; ty <= y1; ty++) if (tileAt(L, tx, ty) === SOLID) { p.x = (tx + 1) * T; p.vx = 0; break; }
  }
}

// Senkrecht bewegen: feste Kacheln, Regalbretter und Leiterköpfe (nur von oben), Aufzüge (nur von oben)
function moveY(s, dy) {
  const p = s.p, L = s.L;
  const prevBottom = p.y + p.h;
  p.y += dy;
  const x0 = Math.floor((p.x + 0.01) / T), x1 = Math.floor((p.x + p.w - 0.01) / T);
  if (dy < 0) {
    const ty = Math.floor(p.y / T);
    for (let tx = x0; tx <= x1; tx++) if (tileAt(L, tx, ty) === SOLID) { p.y = (ty + 1) * T; p.vy = 0; break; }
    return false;
  }
  const bottom = p.y + p.h;
  const ty = Math.floor((bottom - 0.01) / T);
  let landY = Infinity;
  for (let tx = x0; tx <= x1; tx++) {
    const k = tileAt(L, tx, ty);
    const top = ty * T;
    if (k === SOLID) landY = Math.min(landY, top);
    else if ((k === SHELF || (k === LADDER && ladderTop(L, tx, ty) && !p.ladder)) && prevBottom <= top + 0.01) landY = Math.min(landY, top);
  }
  let liftIdx = -1;
  s.lifts.forEach((lf, i) => {
    if (p.x + p.w <= lf.x + 2 || p.x >= lf.x + lf.w - 2) return;
    const prevTop = lf.y - lf.dy;
    if (prevBottom <= prevTop + 0.5 && bottom >= lf.y && lf.y < landY) { landY = lf.y; liftIdx = i; }
  });
  if (landY < Infinity && bottom >= landY) { p.y = landY - p.h; p.vy = 0; p.lift = liftIdx; return true; }
  return false;
}

// Steht die Figur auf etwas? (für Kanten-Toleranz und Laufen über Kanten hinaus)
function standing(s) {
  const p = s.p, L = s.L;
  const by = p.y + p.h;
  if (Math.abs(by / T - Math.round(by / T)) < 0.001) {
    const ty = Math.round(by / T);
    const x0 = Math.floor((p.x + 0.01) / T), x1 = Math.floor((p.x + p.w - 0.01) / T);
    for (let tx = x0; tx <= x1; tx++) {
      const k = tileAt(L, tx, ty);
      if (k === SOLID || k === SHELF || (k === LADDER && ladderTop(L, tx, ty))) return -1;
    }
  }
  for (let i = 0; i < s.lifts.length; i++) {
    const lf = s.lifts[i];
    if (p.x + p.w > lf.x + 2 && p.x < lf.x + lf.w - 2 && Math.abs(by - lf.y) < 0.6) return i;
  }
  return -2;
}

// Leiter an der Körpermitte?
function ladderHere(s) {
  const p = s.p;
  const cx = p.x + p.w / 2;
  const tx = Math.floor(cx / T);
  const yTop = Math.floor((p.y + 2) / T), yBot = Math.floor((p.y + p.h - 1) / T);
  for (let ty = yTop; ty <= yBot; ty++) if (tileAt(s.L, tx, ty) === LADDER) return tx;
  // direkt über einem Leiterkopf stehend zählt nicht (man ist ja schon oben)
  return -1;
}

function resetToCheck(s, kind) {
  const p = s.p;
  p.freeze = kind === 'fall' ? C.fallFreeze : C.hitFreeze;
  p.freezeKind = kind;
  p.vx = 0; p.vy = 0; p.ladder = false;
  s.resets++;
  s.events.push(kind);
}

function respawn(s) {
  const p = s.p;
  p.x = s.check.x - p.w / 2; p.y = s.check.y - p.h;
  p.vx = 0; p.vy = 0; p.ladder = false; p.lift = -1; p.ground = true; p.invuln = C.invuln; p.coyote = 0; p.buffer = 0; p.jumping = false;
  s.events.push('respawn');
}

// Ein Schritt. inp = { left, right, jump } (gehalten)
export function step(s, inp) {
  s.events.length = 0;
  if (s.done) return s.events;
  const p = s.p, L = s.L;
  s.t++;

  // Aufzüge bewegen (fester Ablauf, hängt nur von der Zeit ab)
  for (const lf of s.lifts) { const ny = liftY(lf, s.t); lf.dy = ny - lf.y; lf.y = ny; }

  // Kätzchen
  for (const c of s.cats) {
    c.t++;
    if (c.state === 'flee') { c.x += c.vx; c.y -= 1.2; continue; }
    if (c.state === 'gone') continue;
    c.x += c.vx;
    if (c.x < c.x0) { c.x = c.x0; c.vx = Math.abs(c.vx); }
    if (c.x + c.w > c.x1) { c.x = c.x1 - c.w; c.vx = -Math.abs(c.vx); }
  }
  for (const c of s.cats) if (c.state === 'flee' && c.t > 50) c.state = 'gone';

  // Autsch / heruntergefallen: kurz anhalten, dann am Fähnchen weiter
  if (p.freeze > 0) {
    p.freeze--;
    if (p.freezeKind === 'hit') { p.vy = Math.min(p.vy + 0.5, 6); }
    if (p.freeze === 0) respawn(s);
    p.prevJump = !!inp.jump;
    return s.events;
  }
  if (p.invuln > 0) p.invuln--;

  const jumpPressed = inp.jump && !p.prevJump;
  p.prevJump = !!inp.jump;
  const dir = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
  if (dir) p.face = dir;

  // Mitfahren auf dem Aufzug
  if (p.ground && p.lift >= 0) {
    const lf = s.lifts[p.lift];
    p.y = lf.y - p.h;
    // Kopf an der Decke? Dann absteigen lassen statt zerquetschen
    if (lf.dy < 0 && (solidAt(L, p.x + 1, p.y) || solidAt(L, p.x + p.w - 1, p.y))) { p.y = Math.floor(p.y / T + 1) * T; p.ground = false; p.lift = -1; }
  }

  if (jumpPressed) p.buffer = C.buffer; else if (p.buffer > 0) p.buffer--;

  // ---- Leiter
  const lx = ladderHere(s);
  if (!p.ladder && lx >= 0 && (jumpPressed || (inp.jump && !p.ground))) {
    // Greifen: am Boden mit Druck auf Springen, in der Luft mit gehaltener Taste
    p.ladder = true; p.jumping = false; p.buffer = 0; p.vx = 0; p.vy = 0;
    p.x = lx * T + T / 2 - p.w / 2;
    s.events.push('grab');
  }
  if (p.ladder) {
    if (lx < 0) { p.ladder = false; }
    else if (dir !== 0 && !inp.jump) { p.ladder = false; p.vx = dir * 1.2; }  // seitlich loslassen
    else {
      p.vx = 0;
      p.vy = inp.jump ? -C.climb : 0;
      const before = p.y + p.h;
      p.y += p.vy;
      // oben angekommen: auf den Leiterkopf stellen
      const tx = lx;
      let topTy = Math.floor((p.y + p.h - 1) / T);
      while (tileAt(L, tx, topTy - 1) === LADDER) topTy--;
      const topY = topTy * T;
      if (p.y + p.h <= topY && before >= topY) { p.y = topY - p.h; p.ladder = false; p.ground = true; p.vy = 0; s.events.push('top'); }
      if (solidAt(L, p.x + 2, p.y) || solidAt(L, p.x + p.w - 2, p.y)) { p.y = Math.floor(p.y / T + 1) * T; }
      p.lift = -1;
      p.airT = 0;
      if (p.ladder) { pickups(s); enemies(s); return s.events; }
    }
  }

  // ---- Laufen
  const acc = p.ground ? (dir ? C.accG : C.decG) : (dir ? C.accA : C.decA);
  const target = dir * C.run;
  if (p.vx < target) p.vx = Math.min(target, p.vx + acc);
  else if (p.vx > target) p.vx = Math.max(target, p.vx - acc);

  // ---- Springen (mit Kanten-Toleranz und Sprungpuffer)
  if (p.ground) p.coyote = C.coyote; else if (p.coyote > 0) p.coyote--;
  if (p.buffer > 0 && p.coyote > 0) {
    p.vy = -C.jump; p.ground = false; p.lift = -1; p.coyote = 0; p.buffer = 0; p.jumping = true;
    s.events.push('jump');
  }

  // ---- Schwerkraft (gehaltene Taste = höher)
  const gr = p.vy < 0 && inp.jump && p.jumping ? C.gUp : C.g;
  if (!p.ground) p.vy = Math.min(C.maxFall, p.vy + gr);
  if (p.vy >= 0) p.jumping = false;

  moveX(s, p.vx);
  const wasGround = p.ground;
  if (p.ground) {
    const st = standing(s);
    if (st === -2) { p.ground = false; p.lift = -1; } else p.lift = st;
  }
  if (!p.ground) {
    const landed = moveY(s, p.vy);
    if (landed) { p.ground = true; if (!wasGround && p.airT > 6) { p.landT = 8; s.events.push('land'); } }
  }
  if (p.ground) { p.airT = 0; p.runT += Math.abs(p.vx); } else p.airT++;
  if (p.landT > 0) p.landT--;

  // ---- hinausgefallen?
  if (p.y > L.h * T + 40) { resetToCheck(s, 'fall'); return s.events; }

  pickups(s);
  enemies(s);
  return s.events;
}

function pickups(s) {
  const p = s.p, L = s.L;
  const cx = p.x + p.w / 2, cy = p.y + p.h / 2;
  const r = C.pick + p.w / 2;
  L.crumbs.forEach((c, i) => { if (!s.crumbs[i] && Math.abs(c.x - cx) < r && Math.abs(c.y - cy) < r) { s.crumbs[i] = true; s.nCrumbs++; s.events.push('crumb'); } });
  L.golds.forEach((g, i) => { if (!s.golds[i] && Math.abs(g.x - cx) < r + 2 && Math.abs(g.y - cy) < r + 2) { s.golds[i] = true; s.nGolds++; s.events.push('gold'); } });
  L.flags.forEach((f, i) => {
    if (Math.abs(f.x - cx) < 20 && p.y < f.y && p.y + p.h > f.y - 48) {
      if (!s.flagHit[i]) { s.flagHit[i] = true; s.events.push('flag'); }
      s.check = { x: f.x, y: f.y };
    }
  });
  const g = L.goal;
  if (Math.abs(g.x - cx) < 26 && p.y < g.y && p.y + p.h > g.y - 40 && !s.done) { s.done = true; s.events.push('win'); }
}

function enemies(s) {
  if (s.opt.noEnemies) return;
  const p = s.p;
  for (const c of s.cats) {
    if (c.state !== 'walk') continue;
    const box = { x: c.x + 3, y: c.y + 4, w: c.w - 6, h: c.h - 4 };
    if (!overlap(p, box)) continue;
    const prevBottom = p.y + p.h - p.vy;
    if (p.vy > 0 && prevBottom <= c.y + 10 && !p.ladder) {
      // Sprung drauf: Kätzchen erschrickt und rennt weg, Krümel prallt ab
      c.state = 'flee'; c.t = 0; c.vx = p.x + p.w / 2 < c.x + c.w / 2 ? 3 : -3;
      p.vy = p.prevJump ? -C.jump : -C.bounce; p.jumping = p.prevJump; p.ground = false;
      s.stomps++;
      s.events.push('stomp');
    } else if (p.invuln === 0) {
      p.vy = -5; p.vx = (p.x + p.w / 2 < c.x + c.w / 2 ? -1 : 1) * 2;
      resetToCheck(s, 'hit');
      return;
    }
  }
}

// ---------------------------------------------------------------- Löser (für Tests): Suche über Tasten-Kombinationen
// Jede Aktion wird `hold` Schritte gehalten. Kätzchen werden ignoriert (man kann über sie springen oder sie wegscheuchen),
// der Aufzug zählt mit, weil seine Lage nur von der Zeit abhängt.
const ACTIONS = [
  { left: 0, right: 1, jump: 0 }, { left: 0, right: 1, jump: 1 },
  { left: 1, right: 0, jump: 0 }, { left: 1, right: 0, jump: 1 },
  { left: 0, right: 0, jump: 0 }, { left: 0, right: 0, jump: 1 },
];
export function cloneWorld(s) {
  return {
    ...s, p: { ...s.p }, check: { ...s.check }, flagHit: s.flagHit.slice(), crumbs: s.crumbs.slice(), golds: s.golds.slice(),
    cats: s.cats.map((c) => ({ ...c })), lifts: s.lifts.map((l) => ({ ...l })), events: [],
  };
}
export function solve(L, o = {}) {
  const hold = o.hold || 6, maxNodes = o.maxNodes || 400000;
  const start = newWorld(L, { noEnemies: true });
  if (o.from) { start.p.x = o.from.x - start.p.w / 2; start.p.y = o.from.y - start.p.h; start.check = { ...o.from }; }
  const target = o.target || null; // {x,y} oder null = Ziel
  const cycles = start.lifts.map(liftCycle).map((c) => c.total);
  const period = cycles.length ? cycles.reduce((a, b) => a * b / gcd(a, b)) : 1;
  // Die Aufzug-Phase zählt nur in Aufzugsnähe – sonst würde die Suche unnötig groß
  const nearLift = (p) => start.lifts.some((lf) => p.x + p.w > lf.x - 3 * T && p.x < lf.x + lf.w + 3 * T);
  const key = (s) => {
    const p = s.p;
    return [Math.round(p.x / 6), Math.round(p.y / 6), Math.round(p.vy / 2), Math.sign(Math.round(p.vx)), p.ground ? 1 : 0, p.ladder ? 1 : 0, p.jumping ? 1 : 0,
      nearLift(p) ? Math.floor((s.t % period) / (hold * 2)) : 0].join(',');
  };
  const goal = target || { x: L.goal.x, y: L.goal.y - 12, r: 20 };
  const h = (s) => Math.max(Math.abs(s.p.x + s.p.w / 2 - goal.x), Math.abs(s.p.y + s.p.h / 2 - goal.y)) / (C.run * hold);
  // Gewichtete A*-Suche: findet schnell einen Weg (nicht zwingend den kürzesten)
  const heap = [];
  const push = (n) => { heap.push(n); let i = heap.length - 1; while (i > 0) { const j = (i - 1) >> 1; if (heap[j].f <= heap[i].f) break; [heap[i], heap[j]] = [heap[j], heap[i]]; i = j; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l].f < heap[m].f) m = l; if (r < heap.length && heap[r].f < heap[m].f) m = r; if (m === i) break; [heap[i], heap[m]] = [heap[m], heap[i]]; i = m; } } return top; };
  const seen = new Set([key(start)]);
  push({ s: start, path: [], f: h(start) });
  let nodes = 0;
  while (heap.length && nodes < maxNodes) {
    const n = pop();
    for (let a = 0; a < ACTIONS.length; a++) {
      const s = cloneWorld(n.s);
      let reset = false;
      for (let i = 0; i < hold; i++) { const ev = step(s, ACTIONS[a]); if (ev.includes('fall') || ev.includes('hit')) { reset = true; break; } if (s.done) break; }
      nodes++;
      if (reset) { if (o.fallOk) return { ok: true, escaped: true, nodes }; continue; }
      const path = n.path.concat(a);
      if (!target && s.done) return { ok: true, path, hold, nodes, world: s };
      if (target && reached(s, target)) return { ok: true, path, hold, nodes, world: s };
      const k = key(s);
      if (seen.has(k)) continue;
      seen.add(k);
      push({ s, path, f: path.length + 2 * h(s) });
    }
  }
  return { ok: false, nodes };
}
function reached(s, t) { const p = s.p; return Math.abs(p.x + p.w / 2 - t.x) < t.r && Math.abs(p.y + p.h / 2 - t.y) < t.r; }
function gcd(a, b) { return b ? gcd(b, a % b) : a; }
export function playPath(L, path, hold, o = {}) {
  const s = newWorld(L, o);
  for (const a of path) for (let i = 0; i < hold; i++) step(s, ACTIONS[a]);
  return s;
}

// ---------------------------------------------------------------- Speicherstand
export function freshSave() { return { v: 1, mute: false, best: {} }; }
export function sanitizeSave(o) {
  const s = freshSave();
  if (!o || typeof o !== 'object') return s;
  s.mute = !!o.mute;
  if (o.best && typeof o.best === 'object') for (const [k, b] of Object.entries(o.best)) {
    if (!/^\d{1,2}$/.test(k) || !b) continue;
    const t = Math.floor(+b.t), c = Math.floor(+b.c), g = Math.floor(+b.g);
    if (t > 0 && t < 360000) s.best[k] = { t, c: Math.max(0, c | 0), g: Math.max(0, Math.min(3, g | 0)) };
  }
  return s;
}
export const fmt = (frames) => { const cs = Math.round(frames / HZ * 100); return Math.floor(cs / 100) + ',' + String(cs % 100).padStart(2, '0') + ' s'; };
