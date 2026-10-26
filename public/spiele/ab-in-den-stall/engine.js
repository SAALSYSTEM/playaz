// Ab in den Stall! – Regeln, Wegmalen, Laufen, Löser und Spielstand (ohne DOM, in Node testbar).
// Grundsatz für Kinder ab 4: kein Scheitern, keine Zeitnot. Ein falscher Weg wird einfach nicht angenommen.

export const STORE = 'stall.v1';
export const COLS = 6, ROWS = 9;
export const SPEED = 3.2;            // Felder pro Sekunde beim Laufen

// Tierarten: Zeichen im Level, Zuhause-Zeichen, Namen
export const KINDS = {
  kueken: { ch: 'k', home: 'K', name: 'Küken', homeName: 'Hühnerstall' },
  ferkel: { ch: 's', home: 'S', name: 'Ferkel', homeName: 'Schweinestall' },
  kalb: { ch: 'c', home: 'C', name: 'Kälbchen', homeName: 'Kuhstall' },
  lamm: { ch: 'l', home: 'L', name: 'Lämmchen', homeName: 'Schafstall' },
  ente: { ch: 'e', home: 'E', name: 'Entchen', homeName: 'Teich' },
  fohlen: { ch: 'f', home: 'F', name: 'Fohlen', homeName: 'Pferdestall' }
};
const BY_CH = {}, BY_HOME = {};
for (const [k, v] of Object.entries(KINDS)) { BY_CH[v.ch] = k; BY_HOME[v.home] = k; }

const TILE = { '.': 'gras', T: 'baum', H: 'heu', Z: 'zaun', W: 'bach', B: 'bruecke', P: 'pfuetze', G: 'gatter' };
const BLOCK = new Set(['baum', 'heu', 'zaun', 'bach']);

// ---------- Level einlesen ----------
export function parseLevel(lv) {
  const tiles = [], animals = [], homes = [];
  if (!lv || !Array.isArray(lv.map) || lv.map.length !== ROWS) throw new Error(`Level ${lv && lv.id}: ${ROWS} Reihen erwartet`);
  lv.map.forEach((line, r) => {
    if (line.length !== COLS) throw new Error(`Level ${lv.id}, Reihe ${r + 1}: ${COLS} Zeichen erwartet`);
    const row = [];
    for (let c = 0; c < COLS; c++) {
      const ch = line[c];
      if (TILE[ch]) row.push({ t: TILE[ch] });
      else if (BY_CH[ch]) { row.push({ t: 'gras' }); animals.push({ kind: BY_CH[ch], r, c }); }
      else if (BY_HOME[ch]) { row.push({ t: 'zuhause', kind: BY_HOME[ch] }); homes.push({ kind: BY_HOME[ch], r, c }); }
      else throw new Error(`Level ${lv.id}: unbekanntes Zeichen „${ch}“`);
    }
    tiles.push(row);
  });
  return { id: lv.id, tiles, animals, homes };
}

// ---------- Zustand ----------
export function newState(lv) {
  const p = parseLevel(lv);
  return {
    id: p.id, tiles: p.tiles, homes: p.homes,
    animals: p.animals.map((a, i) => ({ i, kind: a.kind, r: a.r, c: a.c, state: 'wait', path: null, s: 0 })),
    gates: {},            // "r,c" -> true, sobald offen
    time: 0, started: false, done: false, events: []
  };
}

const key = (r, c) => r + ',' + c;
const inside = (r, c) => r >= 0 && r < ROWS && c >= 0 && c < COLS;
export const gateOpen = (st, r, c) => !!st.gates[key(r, c)];
export const homeAt = (st, r, c) => (inside(r, c) && st.tiles[r][c].t === 'zuhause' ? st.tiles[r][c].kind : null);
export const waitingAt = (st, r, c) => st.animals.find((a) => a.state === 'wait' && a.r === r && a.c === c) || null;
export const animalsLeft = (st) => st.animals.filter((a) => a.state !== 'home').length;
export const animalsHome = (st) => st.animals.filter((a) => a.state === 'home').length;

// Darf ein Tier dieser Art das Feld betreten? (wartende Tiere versperren, laufende nicht)
// gatesOpen: Löser tut so, als wären alle Gatter offen (Antippen geht jederzeit).
export function passable(st, kind, r, c, selfIdx = -1, gatesOpen = false) {
  if (!inside(r, c)) return false;
  const t = st.tiles[r][c];
  if (BLOCK.has(t.t)) return false;
  if (t.t === 'zuhause') return t.kind === kind;
  if (t.t === 'pfuetze' && kind !== 'ferkel') return false;
  if (t.t === 'gatter' && !gatesOpen && !gateOpen(st, r, c)) return false;
  const w = waitingAt(st, r, c);
  return !w || w.i === selfIdx;
}

// ---------- Weg malen ----------
// Ein Entwurf beginnt am Tier. extend() nimmt eine Zelle unter dem Finger an und läuft Feld für Feld dorthin.
// Ergebnis: 'grow' | 'back' | 'same' | 'blocked' | 'wrong' | 'gate' | 'done'
export function startDraft(st, idx) {
  const a = st.animals[idx];
  if (!a || a.state !== 'wait') return null;
  return { idx, kind: a.kind, cells: [[a.r, a.c]], done: false, last: 'start' };
}

function stepOne(st, d, r, c) {
  const cells = d.cells, [lr, lc] = cells[cells.length - 1];
  if (r === lr && c === lc) return 'same';
  // zurück auf eine frühere Zelle: Weg bis dorthin kürzen
  const at = cells.findIndex(([a, b]) => a === r && b === c);
  if (at >= 0) { cells.length = at + 1; d.done = false; return 'back'; }
  if (d.done) return 'same';
  if (Math.abs(r - lr) + Math.abs(c - lc) !== 1) return 'blocked';
  const h = homeAt(st, r, c);
  if (h && h !== d.kind) return 'wrong';
  if (inside(r, c) && st.tiles[r][c].t === 'gatter' && !gateOpen(st, r, c)) return 'gate';
  if (!passable(st, d.kind, r, c, d.idx)) return 'blocked';
  cells.push([r, c]);
  if (h === d.kind) { d.done = true; return 'done'; }
  return 'grow';
}

export function extend(st, d, r, c) {
  if (!d || !inside(r, c)) return 'blocked';
  let res = 'same';
  // in Schritten Richtung Ziel (bei schnellen Fingern werden Felder übersprungen)
  for (let guard = 0; guard < COLS + ROWS; guard++) {
    const [lr, lc] = d.cells[d.cells.length - 1];
    if (lr === r && lc === c) break;
    const back = d.cells.findIndex(([a, b]) => a === r && b === c);
    if (back >= 0) { res = stepOne(st, d, r, c); break; }
    const dr = r - lr, dc = c - lc;
    const tryCells = Math.abs(dr) >= Math.abs(dc)
      ? [[lr + Math.sign(dr), lc], dc ? [lr, lc + Math.sign(dc)] : null]
      : [[lr, lc + Math.sign(dc)], dr ? [lr + Math.sign(dr), lc] : null];
    let moved = false, firstFail = null;
    for (const t of tryCells) {
      if (!t) continue;
      const out = stepOne(st, d, t[0], t[1]);
      if (out === 'grow' || out === 'done' || out === 'back') { res = out; moved = true; break; }
      firstFail ??= out;
    }
    if (!moved) { res = firstFail || 'blocked'; break; }
    if (d.done) break;
  }
  d.last = res;
  return res;
}

// Weg abschicken: nur vollständige Wege (bis zum richtigen Zuhause) werden angenommen.
export function send(st, d) {
  if (!d || !d.done) return false;
  const a = st.animals[d.idx];
  if (a.state !== 'wait') return false;
  a.state = 'walk'; a.path = d.cells.map(([r, c]) => [r, c]); a.s = 0;
  st.started = true;
  return true;
}

export function tapGate(st, r, c) {
  if (!inside(r, c) || st.tiles[r][c].t !== 'gatter') return false;
  if (gateOpen(st, r, c)) return false;
  st.gates[key(r, c)] = true;
  st.started = true;
  return true;
}

// Position eines Tieres (Feldkoordinaten, auch zwischen zwei Feldern)
export function animalPos(a) {
  if (a.state !== 'walk' || !a.path) return { r: a.r, c: a.c, dir: 0 };
  const n = a.path.length - 1, s = Math.min(a.s, n), i = Math.min(n - 1, Math.floor(s)), k = s - i;
  const [r0, c0] = a.path[i], [r1, c1] = a.path[Math.min(n, i + 1)];
  return { r: r0 + (r1 - r0) * k, c: c0 + (c1 - c0) * k, dir: c1 - c0 || (a.dir || 0) };
}

export function step(st, dt) {
  st.events = [];
  if (st.done) return st.events;
  if (st.started) st.time += dt;
  for (const a of st.animals) {
    if (a.state !== 'walk') continue;
    const n = a.path.length - 1;
    const before = Math.floor(a.s);
    a.s = Math.min(n, a.s + SPEED * dt);
    if (Math.floor(a.s) !== before && a.s < n) st.events.push({ type: 'hop', i: a.i });
    const p = a.path[Math.min(n, Math.floor(a.s))];
    a.r = p[0]; a.c = p[1];
    const nx = a.path[Math.min(n, Math.floor(a.s) + 1)];
    if (nx[1] !== p[1]) a.dir = Math.sign(nx[1] - p[1]);
    if (a.s >= n) { a.state = 'home'; a.r = a.path[n][0]; a.c = a.path[n][1]; st.events.push({ type: 'home', i: a.i, kind: a.kind }); }
  }
  if (st.animals.every((a) => a.state === 'home')) { st.done = true; st.events.push({ type: 'win' }); }
  return st.events;
}

// ---------- Wege suchen (Löser, Bot, Hilfe-Finger) ----------
// Kürzester Weg eines wartenden Tieres zu seinem Zuhause; gatesOpen = Gatter zählen als offen.
export function findPath(st, idx, gatesOpen = true) {
  const a = st.animals[idx];
  if (!a || a.state !== 'wait') return null;
  const prev = new Map([[key(a.r, a.c), null]]), q = [[a.r, a.c]];
  while (q.length) {
    const [r, c] = q.shift();
    if (homeAt(st, r, c) === a.kind) {
      const out = []; let k = key(r, c);
      while (k) { const [y, x] = k.split(',').map(Number); out.unshift([y, x]); k = prev.get(k); }
      return out;
    }
    if (homeAt(st, r, c)) continue;
    for (const [dr, dc] of [[-1, 0], [0, 1], [1, 0], [0, -1]]) {
      const nr = r + dr, nc = c + dc, k = key(nr, nc);
      if (prev.has(k) || !passable(st, a.kind, nr, nc, idx, gatesOpen)) continue;
      prev.set(k, key(r, c)); q.push([nr, nc]);
    }
  }
  return null;
}

// Löser: Tiere nacheinander nach Hause schicken. Weil Tiere nur verschwinden (Felder werden frei),
// kann keine Reihenfolge in eine Sackgasse führen – gierig reicht. Liefert Reihenfolge und Wege oder null.
export function solve(lv) {
  const st = newState(lv), order = [];
  for (let round = 0; round < st.animals.length; round++) {
    let found = null;
    for (const a of st.animals) {
      if (a.state !== 'wait') continue;
      const p = findPath(st, a.i, true);
      if (p) { found = { i: a.i, path: p }; break; }
    }
    if (!found) return null;
    const a = st.animals[found.i];
    a.state = 'home'; a.r = found.path.at(-1)[0]; a.c = found.path.at(-1)[1];
    order.push(found);
  }
  return order;
}

// Welche Tiere kommen am Anfang noch nicht nach Hause (müssen warten)?
export function blockedAtStart(lv) {
  const st = newState(lv);
  return st.animals.filter((a) => !findPath(st, a.i, true)).map((a) => a.i);
}

// ---------- Spielstand ----------
export function freshSave() { return { v: 1, unlocked: 1, best: {}, mute: false }; }
export function sanitizeSave(raw, count) {
  const s = freshSave();
  if (!raw || typeof raw !== 'object') return s;
  s.unlocked = Math.max(1, Math.min(count, Math.floor(Number(raw.unlocked)) || 1));
  if (raw.best && typeof raw.best === 'object') {
    for (const [k, v] of Object.entries(raw.best)) {
      const n = Math.floor(Number(k)), t = Math.floor(Number(v));
      if (n >= 1 && n <= count && t > 0 && t < 360000) s.best[n] = t;
    }
  }
  s.mute = !!raw.mute;
  return s;
}
// Zeit in Hundertstel. Gibt true zurück, wenn es eine neue Bestzeit ist.
export function recordWin(save, id, centis, count) {
  const old = save.best[id];
  const rec = !old || centis < old;
  if (rec) save.best[id] = centis;
  save.unlocked = Math.max(save.unlocked, Math.min(count, id + 1));
  return rec;
}
export const centis = (sec) => Math.max(1, Math.round(sec * 100));
export function fmt(cs) {
  const s = cs / 100;
  return (s < 60 ? s.toFixed(1).replace('.', ',') + ' s' : Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0') + ' min');
}
export function parseChallenge(search, count) {
  const q = new URLSearchParams(search), l = Math.floor(Number(q.get('l'))), t = Math.floor(Number(q.get('t')));
  if (!(l >= 1 && l <= count && t > 0 && t < 360000)) return null;
  return { l, t };
}
