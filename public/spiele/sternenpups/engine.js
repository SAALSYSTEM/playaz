// Sternenpups – Regeln, Wolken-Graph, Bewegungen, Löser und Spielstand (ohne DOM, in Node testbar).
// Grundsatz für Kinder ab 4: kein Absturz, kein Scheitern, keine Zeitnot. Nicht erreichbare Wolken werden einfach nicht angeflogen.
//
// Ein Level ist ein Raster mit 6 Spalten; jede Reihe ist eine Etage (oberste Reihe zuerst, unterste = Wiese).
// Zusammenhängende Wolkenzeichen in einer Reihe bilden eine Wolke (Plattform).

export const STORE = 'sternenpups.v1';
export const COLS = 6;
export const MAX_GAP = 2;          // so viele leere Spalten darf ein Pups überbrücken (gleiche Etage oder eine hoch/runter)
export const TAXI_FLOORS = 3;      // Schmetterlings-Taxi: von einer Wolke mit Schmetterling (B) zu jeder Wolke bis zu 3 Etagen höher oder tiefer

// Zeichen, die zu einer festen Wolke gehören
const CLOUD = new Set(['=', '*', 'Z', 'P', 'E', 'w', 'F', 'R', 'f', 'B']);
const GROUND = new Set(['_', 'S']);
const GHOST = 'g';
const VINE = '|', ELFVINE = ':';
const KNOWN = new Set([...CLOUD, ...GROUND, GHOST, VINE, ELFVINE, '.']);

// ---------- Level einlesen ----------
export function parseLevel(lv) {
  const rows = lv && lv.map;
  if (!Array.isArray(rows) || rows.length < 2) throw new Error(`Level ${lv && lv.id}: mindestens 2 Reihen`);
  const R = rows.length;
  rows.forEach((line, r) => {
    if (line.length !== COLS) throw new Error(`Level ${lv.id}, Reihe ${r + 1}: ${COLS} Zeichen erwartet („${line}“)`);
    for (const ch of line) if (!KNOWN.has(ch)) throw new Error(`Level ${lv.id}: unbekanntes Zeichen „${ch}“`);
  });
  if (!/^[_S]+$/.test(rows[R - 1]) || rows[R - 1].split('S').length !== 2) throw new Error(`Level ${lv.id}: unterste Reihe ist die Wiese mit genau einem S`);

  const plats = [], cellPlat = rows.map(() => Array(COLS).fill(-1));
  for (let r = 0; r < R; r++) {
    let c = 0;
    while (c < COLS) {
      const ch = rows[r][c];
      const kind = GROUND.has(ch) ? 'ground' : CLOUD.has(ch) ? 'cloud' : ch === GHOST ? 'ghost' : null;
      if (!kind) { c++; continue; }
      const same = (x) => (kind === 'ground' ? GROUND.has(x) : kind === 'cloud' ? CLOUD.has(x) : x === GHOST);
      let e = c; while (e + 1 < COLS && same(rows[r][e + 1])) e++;
      const p = { i: plats.length, row: r, floor: R - 1 - r, a: c, b: e, kind, cells: {} };
      for (let x = c; x <= e; x++) { cellPlat[r][x] = p.i; if (rows[r][x] !== '=' && rows[r][x] !== '_') p.cells[x] = rows[r][x]; }
      plats.push(p);
      c = e + 1;
    }
  }
  const has = (p, ch) => Object.entries(p.cells).filter(([, v]) => v === ch).map(([k]) => Number(k));

  // Besonderheiten je Wolke
  let start = -1, startCol = 0, goal = -1, wand = -1, fairy = -1;
  const taxis = [];
  const stars = [], rests = [], elves = [], decoFairies = [];
  for (const p of plats) {
    for (const [cs, ch] of Object.entries(p.cells)) {
      const col = Number(cs);
      if (ch === 'S') { start = p.i; startCol = col; }
      if (ch === 'Z') { if (goal >= 0 && goal !== p.i) throw new Error(`Level ${lv.id}: nur eine Zielwolke`); goal = p.i; }
      if (ch === '*') stars.push({ i: stars.length, plat: p.i, col });
      if (ch === 'P') rests.push({ plat: p.i, col });
      if (ch === 'w') { if (wand >= 0) throw new Error(`Level ${lv.id}: höchstens ein Zauberstab`); wand = p.i; p.wandCol = col; }
      if (ch === 'F') { if (fairy >= 0) throw new Error(`Level ${lv.id}: höchstens eine Fee ohne Stab`); fairy = p.i; p.fairyCol = col; }
      if (ch === 'f') decoFairies.push({ plat: p.i, col });
      if (ch === 'B') { if (p.taxiCol !== undefined) throw new Error(`Level ${lv.id}: ein Schmetterling je Wolke`); p.taxiCol = col; taxis.push({ plat: p.i, col }); }
      if (ch === 'E') elves.push({ i: elves.length, plat: p.i, col, vine: -1 });
    }
  }
  if (goal < 0) throw new Error(`Level ${lv.id}: Zielwolke (Z) fehlt`);
  if (plats[goal].row !== 0) throw new Error(`Level ${lv.id}: Zielwolke gehört in die oberste Reihe`);
  if ((wand >= 0) !== (fairy >= 0)) throw new Error(`Level ${lv.id}: Zauberstab und Fee nur zusammen`);
  if (fairy >= 0 && !plats.some((p) => p.kind === 'ghost')) throw new Error(`Level ${lv.id}: Fee braucht Zauberwolken (g)`);
  if (fairy < 0 && plats.some((p) => p.kind === 'ghost')) throw new Error(`Level ${lv.id}: Zauberwolken nur mit Fee`);

  // Ranken: senkrechte Folgen aus | oder : ; unten und oben muss je eine Wolke anschließen
  const vines = [];
  for (let c = 0; c < COLS; c++) {
    let r = 0;
    while (r < R) {
      const ch = rows[r][c];
      if (ch !== VINE && ch !== ELFVINE) { r++; continue; }
      let e = r; while (e + 1 < R && rows[e + 1][c] === ch) e++;
      const up = r - 1 >= 0 ? cellPlat[r - 1][c] : -1, down = e + 1 < R ? cellPlat[e + 1][c] : -1;
      if (up < 0 || down < 0 || plats[up].kind === 'ghost' || plats[down].kind === 'ghost') throw new Error(`Level ${lv.id}: Ranke in Spalte ${c + 1} hängt nicht zwischen zwei Wolken`);
      const v = { i: vines.length, col: c, top: r, bottom: e, up, down, elf: -1 };
      if (ch === ELFVINE) {
        const elf = elves.find((x) => x.plat === down);
        if (!elf) throw new Error(`Level ${lv.id}: Elfen-Ranke in Spalte ${c + 1} ohne Elf auf der unteren Wolke`);
        if (elf.vine >= 0) throw new Error(`Level ${lv.id}: ein Elf, eine Ranke`);
        v.elf = elf.i; elf.vine = v.i;
      }
      vines.push(v);
      r = e + 1;
    }
  }
  for (const e of elves) if (e.vine < 0) throw new Error(`Level ${lv.id}: Elf ohne Ranke`);

  // Regenbogen: zwei R in einer Reihe auf verschiedenen Wolken
  const rainbows = [];
  for (let r = 0; r < R; r++) {
    const cols = [...rows[r]].map((ch, c) => (ch === 'R' ? c : -1)).filter((c) => c >= 0);
    if (!cols.length) continue;
    if (cols.length !== 2 || cellPlat[r][cols[0]] === cellPlat[r][cols[1]]) throw new Error(`Level ${lv.id}: Regenbogen braucht genau zwei R auf zwei Wolken einer Reihe`);
    rainbows.push({ i: rainbows.length, row: r, a: cellPlat[r][cols[0]], b: cellPlat[r][cols[1]], colA: cols[0], colB: cols[1] });
  }
  return { id: lv.id, rows: R, plats, cellPlat, start, startCol, goal, stars, rests, elves, vines, rainbows, taxis, wand, fairy, decoFairies, has };
}

// ---------- Zustand ----------
export function newState(lv) {
  const L = typeof lv.plats === 'object' && lv.plats && lv.rows ? lv : parseLevel(lv);
  return {
    L, id: L.id, plat: L.start, col: L.startCol,
    wand: false, fairyHelped: false, elves: L.elves.map(() => false), rainbows: L.rainbows.map(() => false),
    stars: L.stars.map(() => false), rests: L.rests.map(() => false), moves: 0, done: false
  };
}

const solid = (st, p) => p.kind !== 'ghost' || st.fairyHelped;
function gapBetween(p, q) { return Math.max(0, q.a - p.b - 1, p.a - q.b - 1); }

// Pups-Nachbarn: gleiche Etage oder eine Etage hoch/runter, höchstens MAX_GAP leere Spalten dazwischen
export function pupReach(L, st, i, j) {
  if (i === j) return false;
  const p = L.plats[i], q = L.plats[j];
  if (!solid(st, p) || !solid(st, q)) return false;
  return Math.abs(p.row - q.row) <= 1 && gapBetween(p, q) <= MAX_GAP;
}

// Alle Ziele, die von der aktuellen Wolke aus erreichbar sind: [{ plat, via: 'pup'|'vine'|'rainbow', ref }]
export function moves(st, from = st.plat) {
  const L = st.L, out = new Map();
  for (const q of L.plats) if (pupReach(L, st, from, q.i)) out.set(q.i, { plat: q.i, via: 'pup' });
  for (const v of L.vines) {
    if (v.elf >= 0 && !st.elves[v.elf]) continue;
    if (v.down === from && !out.has(v.up)) out.set(v.up, { plat: v.up, via: 'vine', ref: v.i });
    else if (v.up === from && !out.has(v.down)) out.set(v.down, { plat: v.down, via: 'vine', ref: v.i });
  }
  // Schmetterlings-Taxi: von einer Wolke mit Schmetterling zu jeder festen Wolke bis TAXI_FLOORS Etagen höher/tiefer
  if (L.plats[from].taxiCol !== undefined) {
    const p = L.plats[from];
    for (const q of L.plats) if (q.i !== from && solid(st, q) && Math.abs(q.row - p.row) <= TAXI_FLOORS && !out.has(q.i)) out.set(q.i, { plat: q.i, via: 'taxi', ref: from });
  }
  for (const rb of L.rainbows) {
    if (!st.rainbows[rb.i]) continue;
    if (rb.a === from) out.set(rb.b, { plat: rb.b, via: 'rainbow', ref: rb.i });
    else if (rb.b === from) out.set(rb.a, { plat: rb.a, via: 'rainbow', ref: rb.i });
  }
  return [...out.values()];
}
export const canMove = (st, j) => moves(st).find((m) => m.plat === j) || null;

// Landespalte: bei Pups die Spalte der Zielwolke, die der aktuellen Spalte am nächsten liegt (Figuren-Felder möglichst meiden)
export function landingCol(st, m) {
  const L = st.L, q = L.plats[m.plat];
  if (m.via === 'vine') return L.vines[m.ref].col;
  if (m.via === 'rainbow') { const rb = L.rainbows[m.ref]; return rb.a === m.plat ? rb.colA : rb.colB; }
  const busy = (c) => ['F', 'E', 'f', 'B'].includes(q.cells[c]);
  let best = q.a, bd = Infinity;
  for (let c = q.a; c <= q.b; c++) { const d = Math.abs(c - st.col) + (busy(c) ? 10 : 0); if (d < bd) { bd = d; best = c; } }
  return best;
}

// Bewegung ausführen (Logik sofort, die Oberfläche spielt sie danach ab). Gibt { move, col, events } oder null zurück.
export function moveTo(st, j) {
  if (st.done) return null;
  const m = canMove(st, j);
  if (!m) return null;
  const from = st.plat, fromCol = st.col, col = landingCol(st, m);
  st.plat = j; st.col = col; st.moves++;
  const events = arrive(st);
  return { move: m, from, fromCol, col, events };
}

// Ankunft auf einer Wolke: Sterne, Zauberstab, Fee, Elf, Regenbogen, Ruhewolke, Ziel
export function arrive(st) {
  const L = st.L, p = L.plats[st.plat], ev = [];
  L.stars.forEach((s) => { if (s.plat === p.i && !st.stars[s.i]) { st.stars[s.i] = true; ev.push({ type: 'star', i: s.i, col: s.col }); } });
  if (L.wand === p.i && !st.wand && !st.fairyHelped) { st.wand = true; ev.push({ type: 'wand', col: p.wandCol }); }
  if (L.fairy === p.i && !st.fairyHelped) {
    if (st.wand) { st.wand = false; st.fairyHelped = true; ev.push({ type: 'fairy', col: p.fairyCol, ghosts: L.plats.filter((q) => q.kind === 'ghost').map((q) => q.i) }); }
    else ev.push({ type: 'fairyWaits', col: p.fairyCol });
  }
  L.elves.forEach((e) => { if (e.plat === p.i && !st.elves[e.i]) { st.elves[e.i] = true; ev.push({ type: 'elf', i: e.i, col: e.col, vine: e.vine }); } });
  L.rainbows.forEach((rb) => { if ((rb.a === p.i || rb.b === p.i) && !st.rainbows[rb.i]) { st.rainbows[rb.i] = true; ev.push({ type: 'rainbow', i: rb.i }); } });
  L.rests.forEach((r, i) => { if (r.plat === p.i && !st.rests[i]) { st.rests[i] = true; ev.push({ type: 'rest', i, col: r.col }); } });
  if (p.i === L.goal) { st.done = true; ev.push({ type: 'goal' }); }
  return ev;
}

export const starCount = (st) => st.stars.filter(Boolean).length;

// ---------- Löser (Hilfe-Finger, Tests) ----------
// Zustand für die Suche: Wolke + Stab + Fee + Elfen + Regenbögen (Sterne und Ruhewolken ändern keine Wege)
function snap(st) { return { plat: st.plat, col: st.col, wand: st.wand, fairyHelped: st.fairyHelped, elves: st.elves.slice(), rainbows: st.rainbows.slice(), stars: st.stars.slice(), rests: st.rests.slice(), moves: st.moves, done: st.done }; }
function keyOf(s) { return `${s.plat}|${+s.wand}|${+s.fairyHelped}|${s.elves.map(Number).join('')}|${s.rainbows.map(Number).join('')}`; }

// Kürzeste Zugfolge (Wolken-Indizes) vom aktuellen Zustand bis zu einer Bedingung (Standard: Ziel)
export function plan(st0, goalTest = (s) => s.done) {
  const start = { ...snap(st0), L: st0.L };
  if (goalTest(start)) return [];
  const seen = new Set([keyOf(start)]), q = [[start, []]];
  while (q.length) {
    const [s, path] = q.shift();
    for (const m of moves(s)) {
      const n = { ...snap(s), L: s.L };
      moveTo(n, m.plat);
      const p = path.concat(m.plat);
      if (goalTest(n)) return p;
      if (n.done) continue;
      const k = keyOf(n);
      if (seen.has(k)) continue;
      seen.add(k); q.push([n, p]);
    }
  }
  return null;
}
export function solve(lv) { const st = newState(lv); return plan(st); }

// Ist die Zielwolke ohne eine bestimmte Hilfe erreichbar? (für Tests: Pflichtaufgaben müssen nötig sein)
export function solvableWithout(lv, what) {
  const st = newState(lv), L = st.L;
  const block = (s) => {
    if (what === 'fairy') s.fairyHelped = false;
    if (what === 'elf') s.elves = s.elves.map(() => false);
    if (what === 'rainbow') s.rainbows = s.rainbows.map(() => false);
    if (what === 'vine' || what === 'taxi') return;
  };
  const start = { ...snap(st), L };
  const seen = new Set([keyOf(start)]), q = [start];
  while (q.length) {
    const s = q.shift();
    for (const m of moves(s)) {
      if (what === 'vine' && m.via === 'vine' && L.vines[m.ref].elf < 0) continue;
      if (what === 'taxi' && m.via === 'taxi') continue;
      const n = { ...snap(s), L };
      moveTo(n, m.plat); block(n);
      if (n.done) return true;
      const k = keyOf(n);
      if (!seen.has(k)) { seen.add(k); q.push(n); }
    }
  }
  return false;
}

// Welche Wolken sind überhaupt erreichbar (mit allen Hilfen)? Für Sterne-Prüfung.
export function reachableAll(lv) {
  const st = newState(lv), L = st.L, start = { ...snap(st), L };
  const seen = new Set([keyOf(start)]), plats = new Set([st.plat]), q = [start];
  while (q.length) {
    const s = q.shift();
    for (const m of moves(s)) {
      const n = { ...snap(s), L }; moveTo(n, m.plat); plats.add(n.plat);
      if (n.done) continue;
      const k = keyOf(n); if (!seen.has(k)) { seen.add(k); q.push(n); }
    }
  }
  return plats;
}

// Nächster sinnvoller Schritt für den Hilfe-Finger: zuerst zum Ziel; wenn nichts geht, null
export function hintMove(st) { const p = plan(st); return p && p.length ? p[0] : null; }

// ---------- Spielstand ----------
// best: Level -> Sterne (0–3, -1 nie); run: begonnenes Level zum Fortsetzen
export function freshSave() { return { v: 1, unlocked: 1, best: {}, run: null, mute: false }; }
export function sanitizeSave(raw, count) {
  const s = freshSave();
  if (!raw || typeof raw !== 'object') return s;
  s.unlocked = Math.max(1, Math.min(count, Math.floor(Number(raw.unlocked)) || 1));
  const unlockedBefore = s.unlocked;
  if (raw.best && typeof raw.best === 'object') {
    for (const [k, v] of Object.entries(raw.best)) {
      const n = Math.floor(Number(k)), t = Math.floor(Number(v));
      if (n >= 1 && n <= count && t >= 0 && t <= 3) s.best[n] = t;
    }
  }
  // Neue Level nach einem früheren Ende: war das letzte freigeschaltete Level schon geschafft, geht es weiter
  if (unlockedBefore < count && s.best[unlockedBefore] !== undefined) s.unlocked = unlockedBefore + 1;
  if (raw.run && typeof raw.run === 'object' && raw.run.l >= 1 && raw.run.l <= count) s.run = raw.run;
  s.mute = !!raw.mute;
  return s;
}
export function recordWin(save, id, stars, count) {
  const old = save.best[id];
  const better = old === undefined || stars > old;
  if (better) save.best[id] = stars;
  save.unlocked = Math.max(save.unlocked, Math.min(count, id + 1));
  if (save.run && save.run.l === id) save.run = null;
  return better;
}
// Laufenden Stand sichern / wiederherstellen (nur gültige Werte übernehmen)
export function runOf(st) {
  return { l: st.id, p: st.plat, c: st.col, w: st.wand ? 1 : 0, f: st.fairyHelped ? 1 : 0, e: st.elves.map(Number), r: st.rainbows.map(Number), s: st.stars.map(Number), q: st.rests.map(Number), m: st.moves };
}
export function restoreRun(lv, run) {
  const st = newState(lv), L = st.L;
  if (!run || run.l !== L.id) return st;
  const p = Math.floor(Number(run.p));
  if (!(p >= 0 && p < L.plats.length) || p === L.goal) return st;
  const arr = (a, n) => (Array.isArray(a) && a.length === n ? a.map((x) => !!x) : null);
  const e = arr(run.e, L.elves.length), r = arr(run.r, L.rainbows.length), s = arr(run.s, L.stars.length), q = arr(run.q, L.rests.length);
  if (!e || !r || !s || !q) return st;
  st.fairyHelped = !!run.f && L.fairy >= 0; st.wand = !!run.w && L.wand >= 0 && !st.fairyHelped;
  if (L.plats[p].kind === 'ghost' && !st.fairyHelped) return newState(lv);
  st.plat = p; const c = Math.floor(Number(run.c)); st.col = c >= L.plats[p].a && c <= L.plats[p].b ? c : L.plats[p].a;
  st.elves = e; st.rainbows = r; st.stars = s; st.rests = q; st.moves = Math.max(0, Math.floor(Number(run.m)) || 0);
  return st;
}
export function parseChallenge(search, count) {
  const q = new URLSearchParams(search), l = Math.floor(Number(q.get('l'))), raw = q.get('s'), s = raw === null || raw === '' ? NaN : Math.floor(Number(raw));
  if (!(l >= 1 && l <= count)) return null;
  return { l, s: s >= 0 && s <= 3 ? s : null };
}
