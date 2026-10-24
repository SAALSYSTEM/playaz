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
  invuln: 90,        // Schutzzeit nach dem Zurücksetzen bzw. Schrumpfen
  catSpeed: 0.85,
  pick: 18,          // Sammelradius Krümel/Käse
  crack: 36,         // Crispy-Cookie: so lange hält er, wenn man draufsteht
  gone: 150,         // … so lange ist er weg, dann wächst er nach
  scaleMove: 60,     // Waage: Dauer der festen Bewegung
  wakeR: 5 * 32,     // Schlafkater: Sprünge in diesem Abstand wecken ihn
  awake: 110,        // … so lange bleibt er wach
};

// Kacheln
export const EMPTY = 0, SOLID = 1, SHELF = 2, LADDER = 3, SUGAR = 4;
const isSolid = (k) => k === SOLID || k === SUGAR;

// ---------------------------------------------------------------- Level-Baukasten
// Level werden mit kleinen Befehlen beschrieben statt als Zeichenraster: leichter zu lesen und zu ändern.
// Koordinaten in Kacheln, y = 0 oben. Figuren/Gegenstände stehen in der Zelle (x, y), also auf der Oberkante von y + 1.
export function build(def) {
  const { w, h } = def;
  const grid = new Uint8Array(w * h);
  const L = {
    w, h, grid, crumbs: [], chocs: [], golds: [], flags: [], cats: [], sleepers: [], lifts: [], cookies: [], scales: [], cheeses: [], mints: [], holes: [], tips: [],
    start: null, goal: null, name: def.name || '', floor: def.floor ?? h, theme: def.theme || 'kueche', hasSugar: false,
  };
  const set = (x, y, v) => { if (x >= 0 && x < w && y >= 0 && y < h) grid[y * w + x] = v; };
  const cell = (x, y) => ({ x: (x + 0.5) * T, y: (y + 0.5) * T });
  const api = {
    solid(x0, y0, x1, y1) { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, SOLID); },
    clear(x0, y0, x1, y1) { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, EMPTY); },
    shelf(x0, x1, y) { for (let x = x0; x <= x1; x++) set(x, y, SHELF); },
    ladder(x, y0, y1) { for (let y = y0; y <= y1; y++) set(x, y, LADDER); },
    sugar(x0, y0, x1 = x0, y1 = y0) { L.hasSugar = true; for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, SUGAR); },
    crumb(x, y) { L.crumbs.push(cell(x, y)); },
    crumbs(x0, x1, y) { for (let x = x0; x <= x1; x++) api.crumb(x, y); },
    // Schokolinsen: bunte Bonus-Sammelstücke (5 Punkte)
    choc(x, y) { L.chocs.push({ ...cell(x, y), c: L.chocs.length % 5 }); },
    chocs(x0, x1, y) { for (let x = x0; x <= x1; x++) api.choc(x, y); },
    gold(x, y) { L.golds.push(cell(x, y)); },
    flag(x, y) { L.flags.push({ x: (x + 0.5) * T, y: (y + 1) * T }); },
    cat(x, y, x0, x1) { L.cats.push({ x: (x + 0.5) * T, y: (y + 1) * T, x0: x0 * T, x1: (x1 + 1) * T }); },
    sleeper(x, y) { L.sleepers.push({ x: (x + 0.5) * T, y: (y + 1) * T }); },
    // Käse macht groß, Minze macht klein. Beides sind feste Stationen: sie verschwinden nie, damit man nie festsitzt.
    cheese(x, y) { L.cheeses.push({ x: (x + 0.5) * T, y: (y + 1) * T }); },
    mint(x, y) { L.mints.push({ x: (x + 0.5) * T, y: (y + 1) * T }); },
    // Aufzug (Schublade): fester Ablauf unten warten → hoch → oben warten → runter. Oberkante in Kacheln.
    lift(x, w, yLow, yHigh, o = {}) { L.lifts.push({ x: x * T, w: w * T, low: yLow * T, high: yHigh * T, speed: o.speed || 1.5, wait: o.wait || 70, offset: o.offset || 0 }); },
    // Crispy-Cookie: Plattform (Oberkante Reihe y), zerbröselt kurz nach dem Draufstellen und wächst nach
    cookie(x, y, w = 2) { L.cookies.push({ x: x * T, y: y * T, w: w * T }); },
    // Waage: Schale A (Oberkante ya) sinkt um `d` Kacheln, sobald die große Krümel draufsteht; Schale B (yb) steigt um `d`. Bleibt danach so.
    scale(xa, ya, xb, yb, d, w = 2) { L.scales.push({ a: { x: xa * T, y: ya * T }, b: { x: xb * T, y: yb * T }, d: d * T, w: w * T }); },
    // Mauseloch-Paar: Zellen (xa, ya) und (xb, yb) am Boden. Nur die kleine Krümel passt hinein und kommt am anderen Loch heraus.
    hole(xa, ya, xb, yb) { L.holes.push({ a: { x: (xa + 0.5) * T, y: (ya + 1) * T }, b: { x: (xb + 0.5) * T, y: (yb + 1) * T } }); },
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
export const SIZE = { small: { w: 20, h: 20 }, big: { w: 26, h: 38 } };

export function newWorld(L, opt = {}) {
  const sz = SIZE.small;
  // Plattformen in einer Liste: Schubladen, Crispy-Cookies, Waagschalen
  const plats = [];
  for (const lf of L.lifts) plats.push({ kind: 'lift', ...lf, y: liftY(lf, 0), dy: 0 });
  for (const ck of L.cookies) plats.push({ kind: 'cookie', x: ck.x, w: ck.w, y: ck.y, y0: ck.y, dy: 0, state: 0, t: 0 });
  L.scales.forEach((sc, i) => {
    plats.push({ kind: 'scale', role: 'a', scale: i, x: sc.a.x, w: sc.w, y: sc.a.y, y0: sc.a.y, y1: sc.a.y + sc.d, dy: 0 });
    plats.push({ kind: 'scale', role: 'b', scale: i, x: sc.b.x, w: sc.w, y: sc.b.y, y0: sc.b.y, y1: sc.b.y - sc.d, dy: 0 });
  });
  const s = {
    L: L.hasSugar ? { ...L, grid: L.grid.slice() } : L, t: 0, done: false, opt,
    p: {
      x: L.start.x - sz.w / 2, y: L.start.y - sz.h, w: sz.w, h: sz.h, vx: 0, vy: 0, big: false,
      ground: false, lift: -1, coyote: 0, buffer: 0, ladder: false, face: 1, invuln: 0, freeze: 0, freezeKind: '',
      prevJump: false, jumping: false, landT: 0, airT: 0, runT: 0, push: 0, tightT: 0, lightAt: -1, growT: 0, holeLock: '', holeT: 0,
    },
    check: { x: L.start.x, y: L.start.y },
    flagHit: L.flags.map(() => false),
    crumbs: L.crumbs.map(() => false),
    chocs: L.chocs.map(() => false),
    golds: L.golds.map(() => false),
    cats: L.cats.map((c) => ({ x: c.x - 13, y: c.y - 20, w: 26, h: 20, vx: -C.catSpeed, x0: c.x0, x1: c.x1, state: 'walk', t: 0 })),
    sleepers: L.sleepers.map((c) => ({ x: c.x - 24, y: c.y - 26, w: 48, h: 26, state: 'sleep', t: 0 })),
    plats,
    scaleT: L.scales.map(() => -1),
    nCrumbs: 0, nChocs: 0, nGolds: 0, resets: 0, stomps: 0, breaks: 0, brokenKey: 0,
    events: [],
  };
  return s;
}

const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
function solidAt(L, px, py) { return isSolid(tileAt(L, Math.floor(px / T), Math.floor(py / T))); }
function boxFree(L, x, y, w, h) {
  const x0 = Math.floor((x + 0.01) / T), x1 = Math.floor((x + w - 0.01) / T), y0 = Math.floor((y + 0.01) / T), y1 = Math.floor((y + h - 0.01) / T);
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (isSolid(tileAt(L, tx, ty))) return false;
  return true;
}
const platSolid = (pl) => !(pl.kind === 'cookie' && pl.state === 2);

function breakSugar(s, tx, ty) {
  const L = s.L;
  L.grid[ty * L.w + tx] = EMPTY;
  s.breaks++; s.brokenKey = (s.brokenKey + (ty * L.w + tx) * 2654435761) >>> 0;
  s.events.push('break');
}

// Waagerecht bewegen gegen feste Kacheln. Die große Krümel zerbricht Zuckerwürfel.
function moveX(s, dx) {
  const p = s.p, L = s.L;
  p.x += dx;
  const y0 = Math.floor(p.y / T), y1 = Math.floor((p.y + p.h - 0.01) / T);
  if (dx === 0) return;
  const tx = dx > 0 ? Math.floor((p.x + p.w) / T) : Math.floor(p.x / T);
  let hit = false;
  for (let ty = y0; ty <= y1; ty++) {
    const k = tileAt(L, tx, ty);
    if (k === SUGAR && p.big) { breakSugar(s, tx, ty); p.vx *= 0.6; continue; }
    if (isSolid(k)) hit = true;
  }
  if (hit) { p.x = dx > 0 ? tx * T - p.w : (tx + 1) * T; p.vx = 0; }
}

// Senkrecht bewegen: feste Kacheln, Regalbretter und Leiterköpfe (nur von oben), Plattformen (nur von oben)
function moveY(s, dy) {
  const p = s.p, L = s.L;
  const prevBottom = p.y + p.h;
  p.y += dy;
  const x0 = Math.floor((p.x + 0.01) / T), x1 = Math.floor((p.x + p.w - 0.01) / T);
  if (dy < 0) {
    const ty = Math.floor(p.y / T);
    let hit = false;
    for (let tx = x0; tx <= x1; tx++) {
      const k = tileAt(L, tx, ty);
      if (k === SUGAR && p.big) { breakSugar(s, tx, ty); hit = true; }
      else if (isSolid(k)) hit = true;
    }
    if (hit) { p.y = (ty + 1) * T; p.vy = 0; }
    return false;
  }
  const bottom = p.y + p.h;
  const ty = Math.floor((bottom - 0.01) / T);
  let landY = Infinity;
  for (let tx = x0; tx <= x1; tx++) {
    const k = tileAt(L, tx, ty);
    const top = ty * T;
    if (isSolid(k)) landY = Math.min(landY, top);
    else if ((k === SHELF || (k === LADDER && ladderTop(L, tx, ty) && !p.ladder)) && prevBottom <= top + 0.01) landY = Math.min(landY, top);
  }
  let liftIdx = -1;
  s.plats.forEach((lf, i) => {
    if (!platSolid(lf)) return;
    if (p.x + p.w <= lf.x + 2 || p.x >= lf.x + lf.w - 2) return;
    const prevTop = lf.y - lf.dy;
    if (prevBottom <= prevTop + 0.5 && bottom >= lf.y && lf.y < landY) { landY = lf.y; liftIdx = i; }
  });
  if (landY < Infinity && bottom >= landY) { p.y = landY - p.h; p.vy = 0; p.lift = liftIdx; return true; }
  return false;
}

// Steht die Figur auf etwas? -1 = Kachel, >= 0 = Plattform, -2 = nichts
function standing(s) {
  const p = s.p, L = s.L;
  const by = p.y + p.h;
  if (Math.abs(by / T - Math.round(by / T)) < 0.001) {
    const ty = Math.round(by / T);
    const x0 = Math.floor((p.x + 0.01) / T), x1 = Math.floor((p.x + p.w - 0.01) / T);
    for (let tx = x0; tx <= x1; tx++) {
      const k = tileAt(L, tx, ty);
      if (isSolid(k) || k === SHELF || (k === LADDER && ladderTop(L, tx, ty))) return -1;
    }
  }
  for (let i = 0; i < s.plats.length; i++) {
    const lf = s.plats[i];
    if (!platSolid(lf)) continue;
    if (p.x + p.w > lf.x + 2 && p.x < lf.x + lf.w - 2 && Math.abs(by - lf.y) < 0.6) return i;
  }
  return -2;
}

// Leiter an der Körpermitte?
function ladderHere(s) {
  const p = s.p;
  const tx = Math.floor((p.x + p.w / 2) / T);
  const yTop = Math.floor((p.y + 2) / T), yBot = Math.floor((p.y + p.h - 1) / T);
  for (let ty = yTop; ty <= yBot; ty++) if (tileAt(s.L, tx, ty) === LADDER) return tx;
  return -1;
}

// Größe wechseln: Füße bleiben, wo sie sind. Wachsen nur, wenn über dem Kopf Platz ist.
function resize(s, big) {
  const p = s.p, sz = big ? SIZE.big : SIZE.small;
  const nx = p.x + (p.w - sz.w) / 2, ny = p.y + p.h - sz.h;
  for (const off of [0, -8, 8, -16, 16]) {
    if (boxFree(s.L, nx + off, ny, sz.w, sz.h)) { p.x = nx + off; p.y = ny; p.w = sz.w; p.h = sz.h; p.big = big; p.growT = 20; return true; }
  }
  return false;
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
  if (p.big) { p.big = false; p.w = SIZE.small.w; p.h = SIZE.small.h; }
  p.x = s.check.x - p.w / 2; p.y = s.check.y - p.h;
  p.vx = 0; p.vy = 0; p.ladder = false; p.lift = -1; p.ground = true; p.invuln = C.invuln; p.coyote = 0; p.buffer = 0; p.jumping = false; p.push = 0;
  s.events.push('respawn');
}

// ---------------------------------------------------------------- Plattformen bewegen
function updatePlats(s) {
  for (const pl of s.plats) {
    let ny = pl.y;
    if (pl.kind === 'lift') ny = liftY(pl, s.t);
    else if (pl.kind === 'scale') {
      const tt = s.scaleT[pl.scale];
      const k = tt < 0 ? 0 : Math.min(1, (s.t - tt) / C.scaleMove);
      ny = pl.y0 + (pl.y1 - pl.y0) * k;
    } else if (pl.kind === 'cookie') {
      if (pl.state === 1 && --pl.t <= 0) { pl.state = 2; pl.t = C.gone; s.events.push('crumble'); }
      else if (pl.state === 2 && --pl.t <= 0) {
        const p = s.p;
        // erst nachwachsen, wenn niemand im Weg steht
        if (overlap(p, { x: pl.x, y: pl.y - 2, w: pl.w, h: 14 })) pl.t = 10; else { pl.state = 0; s.events.push('regrow'); }
      }
    }
    pl.dy = ny - pl.y; pl.y = ny;
  }
}

// Ein Schritt. inp = { left, right, jump } (gehalten)
export function step(s, inp) {
  s.events.length = 0;
  if (s.done) return s.events;
  const p = s.p, L = s.L;
  s.t++;

  updatePlats(s);

  // Kätzchen
  for (const c of s.cats) {
    c.t++;
    if (c.state === 'flee') { c.x += c.vx; c.y -= 1.2; if (c.t > 50) c.state = 'gone'; continue; }
    if (c.state === 'gone') continue;
    c.x += c.vx;
    if (c.x < c.x0) { c.x = c.x0; c.vx = Math.abs(c.vx); }
    if (c.x + c.w > c.x1) { c.x = c.x1 - c.w; c.vx = -Math.abs(c.vx); }
  }
  for (const c of s.sleepers) { c.t++; if (c.state === 'awake' && c.t > C.awake) { c.state = 'sleep'; c.t = 0; } }

  // Autsch / heruntergefallen: kurz anhalten, dann am Fähnchen weiter
  if (p.freeze > 0) {
    p.freeze--;
    if (p.freezeKind === 'hit') p.vy = Math.min(p.vy + 0.5, 6);
    if (p.freeze === 0) respawn(s);
    p.prevJump = !!inp.jump;
    return s.events;
  }
  if (p.invuln > 0) p.invuln--;
  if (p.tightT > 0) p.tightT--;
  if (p.growT > 0) p.growT--;

  const jumpPressed = inp.jump && !p.prevJump;
  p.prevJump = !!inp.jump;
  let dir = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
  if (p.push > 0) { p.push--; dir = 0; }
  if (dir) p.face = dir;

  // Mitfahren auf Plattformen
  if (p.ground && p.lift >= 0) {
    const lf = s.plats[p.lift];
    if (!platSolid(lf)) { p.ground = false; p.lift = -1; }
    else {
      p.y = lf.y - p.h;
      if (lf.dy < 0 && (solidAt(L, p.x + 1, p.y) || solidAt(L, p.x + p.w - 1, p.y))) { p.y = Math.floor(p.y / T + 1) * T; p.ground = false; p.lift = -1; }
    }
  }

  if (jumpPressed) p.buffer = C.buffer; else if (p.buffer > 0) p.buffer--;

  // ---- Leiter
  const lx = ladderHere(s);
  if (!p.ladder && lx >= 0 && (jumpPressed || (inp.jump && !p.ground))) {
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
      let topTy = Math.floor((p.y + p.h - 1) / T);
      while (tileAt(L, lx, topTy - 1) === LADDER) topTy--;
      const topY = topTy * T;
      if (p.y + p.h <= topY && before >= topY) { p.y = topY - p.h; p.ladder = false; p.ground = true; p.vy = 0; s.events.push('top'); }
      if (solidAt(L, p.x + 2, p.y) || solidAt(L, p.x + p.w - 2, p.y)) { p.y = Math.floor(p.y / T + 1) * T; }
      p.lift = -1;
      p.airT = 0;
      if (p.ladder) { interact(s); return s.events; }
    }
  }

  // ---- Laufen
  const acc = p.ground ? (dir ? C.accG : C.decG) : (dir ? C.accA : C.decA);
  const target = dir * C.run;
  if (p.push > 0) { /* Rückstoß läuft aus */ }
  else if (p.vx < target) p.vx = Math.min(target, p.vx + acc);
  else if (p.vx > target) p.vx = Math.max(target, p.vx - acc);

  // ---- Springen (mit Kanten-Toleranz und Sprungpuffer)
  if (p.ground) p.coyote = C.coyote; else if (p.coyote > 0) p.coyote--;
  if (p.buffer > 0 && p.coyote > 0) {
    p.vy = -C.jump; p.ground = false; p.lift = -1; p.coyote = 0; p.buffer = 0; p.jumping = true;
    s.events.push('jump');
    wakeSleepers(s);
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

  interact(s);
  return s.events;
}

function wakeSleepers(s) {
  const p = s.p, cx = p.x + p.w / 2, cy = p.y + p.h;
  for (const c of s.sleepers) {
    if (Math.abs(c.x + c.w / 2 - cx) < C.wakeR && Math.abs(c.y + c.h - cy) < 3 * T) {
      if (c.state === 'sleep') s.events.push('wake');
      c.state = 'awake'; c.t = 0;
    }
  }
}

// Plattform-Wirkung (Cookie bröselt, Waage), Sammeln, Stationen, Gegner
function interact(s) {
  const p = s.p, L = s.L;
  if (p.ground && p.lift >= 0) {
    const pl = s.plats[p.lift];
    if (pl.kind === 'cookie' && pl.state === 0) { pl.state = 1; pl.t = C.crack; s.events.push('crack'); }
    if (pl.kind === 'scale' && pl.role === 'a' && s.scaleT[pl.scale] < 0) {
      if (p.big) { s.scaleT[pl.scale] = s.t; s.events.push('scale'); }
      else if (p.lightAt !== pl.scale) { p.lightAt = pl.scale; s.events.push('light'); }
    }
  } else if (!p.ground) p.lightAt = -1;

  const cx = p.x + p.w / 2, cy = p.y + p.h / 2;
  const r = C.pick + p.w / 2, ry = C.pick + p.h / 2;
  L.crumbs.forEach((c, i) => { if (!s.crumbs[i] && Math.abs(c.x - cx) < r && Math.abs(c.y - cy) < ry) { s.crumbs[i] = true; s.nCrumbs++; s.events.push('crumb'); } });
  L.chocs.forEach((c, i) => { if (!s.chocs[i] && Math.abs(c.x - cx) < r && Math.abs(c.y - cy) < ry) { s.chocs[i] = true; s.nChocs++; s.events.push('choc'); } });
  L.golds.forEach((g, i) => { if (!s.golds[i] && Math.abs(g.x - cx) < r + 2 && Math.abs(g.y - cy) < ry + 2) { s.golds[i] = true; s.nGolds++; s.events.push('gold'); } });
  L.flags.forEach((f, i) => {
    if (Math.abs(f.x - cx) < 20 && p.y < f.y && p.y + p.h > f.y - 48) {
      if (!s.flagHit[i]) { s.flagHit[i] = true; s.events.push('flag'); }
      s.check = { x: f.x, y: f.y };
    }
  });
  // Stationen
  const near = (st) => Math.abs(st.x - cx) < 18 + p.w / 2 && p.y < st.y && p.y + p.h > st.y - 30;
  if (!p.big) for (const st of L.cheeses) if (near(st)) {
    if (resize(s, true)) s.events.push('grow');
    else if (p.tightT === 0) { p.tightT = 60; s.events.push('tight'); }
  }
  if (p.big) for (const st of L.mints) if (near(st)) { resize(s, false); s.events.push('shrink'); }
  // Mauselöcher
  if (p.holeT > 0) p.holeT--;
  if (p.holeLock) {
    const [hi, end] = p.holeLock.split(':');
    const e = L.holes[+hi][end];
    if (Math.abs(e.x - cx) > 26) p.holeLock = '';
  }
  if (p.ground && !p.ladder) L.holes.forEach((ho, i) => {
    for (const [end, other] of [['a', 'b'], ['b', 'a']]) {
      const e = ho[end];
      if (Math.abs(e.x - cx) > 12 || Math.abs(p.y + p.h - e.y) > 2 || p.holeLock === i + ':' + end) continue;
      if (p.big) { if (p.tightT === 0) { p.tightT = 60; s.events.push('holeBig'); } continue; }
      const o = ho[other];
      p.x = o.x - p.w / 2; p.y = o.y - p.h; p.lift = -1; p.holeLock = i + ':' + other; p.holeT = 16;
      s.events.push('hole');
      return;
    }
  });

  const g = L.goal;
  if (Math.abs(g.x - cx) < 26 && p.y < g.y && p.y + p.h > g.y - 40 && !s.done) { s.done = true; s.events.push('win'); }
  enemies(s);
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
      const away = p.x + p.w / 2 < c.x + c.w / 2 ? -1 : 1;
      if (p.big) {
        // groß: nur schrumpfen, kein Rücksetzer
        resize(s, false); p.invuln = C.invuln; p.vy = -4; p.vx = away * 2.5; p.push = 10; p.ground = false; p.lift = -1;
        s.events.push('ouch');
      } else {
        p.vy = -5; p.vx = away * 2;
        resetToCheck(s, 'hit');
      }
      return;
    }
  }
  // Schlafkater: wach schiebt er Krümel sanft zurück (kein Rücksetzer)
  for (const c of s.sleepers) {
    if (c.state !== 'awake' || p.push > 0) continue;
    if (!overlap(p, { x: c.x + 6, y: c.y + 4, w: c.w - 12, h: c.h - 4 })) continue;
    const away = p.x + p.w / 2 < c.x + c.w / 2 ? -1 : 1;
    p.vx = away * 4; p.vy = -4.5; p.ground = false; p.lift = -1; p.push = 14; p.ladder = false;
    c.t = Math.min(c.t, C.awake - 40);
    s.events.push('hiss');
  }
}

// ---------------------------------------------------------------- Löser (für Tests): Suche über Tasten-Kombinationen
// Jede Aktion wird `hold` Schritte gehalten. Kätzchen und Schlafkater werden ignoriert (man kann über sie springen,
// sie verscheuchen bzw. warten). Schubladen, Waagen, Cookies und Zuckerwürfel zählen mit.
const ACTIONS = [
  { left: 0, right: 1, jump: 0 }, { left: 0, right: 1, jump: 1 },
  { left: 1, right: 0, jump: 0 }, { left: 1, right: 0, jump: 1 },
  { left: 0, right: 0, jump: 0 }, { left: 0, right: 0, jump: 1 },
];
export function cloneWorld(s) {
  return {
    ...s, L: s.L.hasSugar ? { ...s.L, grid: s.L.grid.slice() } : s.L,
    p: { ...s.p }, check: { ...s.check }, flagHit: s.flagHit.slice(), crumbs: s.crumbs.slice(), chocs: s.chocs.slice(), golds: s.golds.slice(),
    cats: s.cats.map((c) => ({ ...c })), sleepers: s.sleepers.map((c) => ({ ...c })), plats: s.plats.map((l) => ({ ...l })), scaleT: s.scaleT.slice(), events: [],
  };
}
export function solve(L, o = {}) {
  const hold = o.hold || 6, maxNodes = o.maxNodes || 400000;
  const start = newWorld(L, { noEnemies: true });
  if (o.from) { start.p.x = o.from.x - start.p.w / 2; start.p.y = o.from.y - start.p.h; start.check = { ...o.from }; }
  const target = o.target || null; // {x,y,r} oder null = Ziel
  const lifts = start.plats.filter((pl) => pl.kind === 'lift');
  const cycles = lifts.map(liftCycle).map((c) => c.total);
  const period = cycles.length ? cycles.reduce((a, b) => a * b / gcd(a, b)) : 1;
  // Die Aufzug-Phase zählt nur in Aufzugsnähe – sonst würde die Suche unnötig groß
  const nearLift = (p) => lifts.some((lf) => p.x + p.w > lf.x - 3 * T && p.x < lf.x + lf.w + 3 * T);
  const key = (s) => {
    const p = s.p;
    let k = [Math.round(p.x / 6), Math.round(p.y / 6), Math.round(p.vy / 2), Math.sign(Math.round(p.vx)), p.ground ? 1 : 0, p.ladder ? 1 : 0, p.jumping ? 1 : 0, p.big ? 1 : 0,
      nearLift(p) ? Math.floor((s.t % period) / (hold * 2)) : 0, s.brokenKey].join(',');
    for (const pl of s.plats) if (pl.kind === 'cookie') k += pl.state ? ',' + pl.state + Math.floor(pl.t / 15) : ',0';
    if (s.scaleT.length) k += ',' + s.scaleT.map((t) => (t < 0 ? 0 : Math.min(2, 1 + Math.floor((s.t - t) / C.scaleMove)))).join('');
    return k;
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
function reached(s, t) { const p = s.p; return Math.abs(p.x + p.w / 2 - t.x) < t.r && Math.abs(p.y + p.h / 2 - t.y) < t.r + (p.h - 20) / 2; }
function gcd(a, b) { return b ? gcd(b, a % b) : a; }
export function playPath(L, path, hold, o = {}) {
  const s = newWorld(L, o);
  for (const a of path) for (let i = 0; i < hold; i++) step(s, ACTIONS[a]);
  return s;
}

// ---------------------------------------------------------------- Punkte und Speicherstand
export const points = (s) => s.nCrumbs + 5 * s.nChocs;
export function freshSave() { return { v: 1, mute: false, unlocked: 1, best: {} }; }
export function sanitizeSave(o, levelCount = 99) {
  const s = freshSave();
  if (!o || typeof o !== 'object') return s;
  s.mute = !!o.mute;
  s.unlocked = Math.max(1, Math.min(levelCount, Math.floor(+o.unlocked) || 1));
  if (o.best && typeof o.best === 'object') for (const [k, b] of Object.entries(o.best)) {
    if (!/^\d{1,2}$/.test(k) || !b) continue;
    const t = Math.floor(+b.t), c = Math.floor(+b.c), g = Math.floor(+b.g);
    if (t > 0 && t < 360000) {
      s.best[k] = { t, c: Math.max(0, c | 0), g: Math.max(0, Math.min(3, g | 0)) };
      s.unlocked = Math.max(s.unlocked, Math.min(levelCount, +k + 1));
    }
  }
  return s;
}
export const fmt = (frames) => { const cs = Math.round(frames / HZ * 100); return Math.floor(cs / 100) + ',' + String(cs % 100).padStart(2, '0') + ' s'; };
