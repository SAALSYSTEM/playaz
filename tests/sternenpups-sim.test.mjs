// STERNENPUPS: Leveldaten, Lernkurve, Lösbarkeit, Pflichtaufgaben, Sterne, Bewegungen, Spielstand (ohne Browser).
import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS, LEVEL_COUNT, WORLDS } from '../public/spiele/sternenpups/levels.js';
import {
  COLS, parseLevel, newState, moves, canMove, moveTo, solve, solvableWithout, reachableAll, plan, starCount,
  freshSave, sanitizeSave, recordWin, runOf, restoreRun, parseChallenge
} from '../public/spiele/sternenpups/engine.js';

const floors = (lv) => lv.map.length - 1;
const has = (lv, ch) => lv.map.join('').includes(ch);

test('50 Level in 7 Welten, gültige Raster', () => {
  assert.equal(LEVEL_COUNT, 50);
  assert.deepEqual(WORLDS.map((w) => [w.from, w.to]), [[1, 5], [6, 10], [11, 15], [16, 20], [21, 30], [31, 40], [41, 50]]);
  LEVELS.forEach((lv, i) => {
    assert.equal(lv.id, i + 1);
    assert.ok(lv.title && lv.tip && lv.tip.icon && lv.tip.text, `Level ${lv.id}: Titel/Tipp`);
    const L = parseLevel(lv);
    assert.equal(L.stars.length, 3, `Level ${lv.id}: genau 3 Sterne`);
    for (const row of lv.map) assert.equal(row.length, COLS);
  });
});

test('Etagen wachsen behutsam: 1–2, dann 3–5, 6–10, bis 20', () => {
  const f = LEVELS.map(floors);
  for (let i = 0; i < 4; i++) assert.ok(f[i] >= 1 && f[i] <= 2, `Level ${i + 1}: ${f[i]} Etagen`);
  for (let i = 4; i < 9; i++) assert.ok(f[i] >= 3 && f[i] <= 5, `Level ${i + 1}: ${f[i]} Etagen`);
  for (let i = 9; i < 15; i++) assert.ok(f[i] >= 6 && f[i] <= 10, `Level ${i + 1}: ${f[i]} Etagen`);
  for (let i = 15; i < 20; i++) assert.ok(f[i] >= 11 && f[i] <= 20, `Level ${i + 1}: ${f[i]} Etagen`);
  assert.equal(f[19], 20);
  for (let i = 1; i < 20; i++) assert.ok(f[i] >= f[i - 1], 'nie wieder kürzer');
  // Welten 5–7: jede Welt beginnt kürzer und wird dann länger, nie kürzer innerhalb einer Welt
  for (const w of WORLDS.filter((x) => x.id >= 5)) {
    for (let n = w.from + 1; n <= w.to; n++) assert.ok(f[n - 1] >= f[n - 2], `Level ${n}: nie kürzer innerhalb der Welt`);
  }
  assert.ok(f[20] >= 4 && f[20] <= 6, 'Level 21 (neuer Schmetterling) bleibt kurz');
  for (let i = 20; i < 50; i++) assert.ok(f[i] >= 4 && f[i] <= 26, `Level ${i + 1}: ${f[i]} Etagen`);
  assert.ok(f[49] >= f[39], 'Finale ist am höchsten');
});

test('Mechaniken kommen einzeln: Ranke 6, Zauberstab 8, Regenbogen 11, Elf 13, Schmetterling 21', () => {
  const first = (ch) => LEVELS.findIndex((lv) => has(lv, ch)) + 1;
  assert.equal(first('|'), 6);
  assert.equal(first('w'), 8);
  assert.equal(first('R'), 11);
  assert.equal(first('E'), 13);
  assert.equal(first('B'), 21);
  // Schmetterling: 21–23 nur er allein, danach je eine bekannte Mechanik dazu
  for (const n of [21, 22, 23]) for (const ch of '|wREF:g') assert.ok(!has(LEVELS[n - 1], ch), `Level ${n} ohne ${ch}`);
  assert.ok(has(LEVELS[23], '|') && !has(LEVELS[23], 'R') && !has(LEVELS[23], 'E') && !has(LEVELS[23], 'w'), 'Level 24: Schmetterling + Ranke');
  assert.ok(has(LEVELS[24], 'w') && !has(LEVELS[24], 'R') && !has(LEVELS[24], 'E'), 'Level 25: + Fee');
  assert.ok(has(LEVELS[26], 'R') && !has(LEVELS[26], 'E') && !has(LEVELS[26], 'w'), 'Level 27: + Regenbogen');
  assert.ok(has(LEVELS[27], 'E') && !has(LEVELS[27], 'R') && !has(LEVELS[27], 'w'), 'Level 28: + Elf');
  // ab Level 21 ist der Schmetterling fast immer dabei; Level 34 ist eine bewusste Pause ohne ihn
  assert.deepEqual(LEVELS.filter((x) => x.id >= 21 && !has(x, 'B')).map((x) => x.id), [34]);
  // Einführungslevel bringen nur ihr eigenes neues Element mit
  assert.ok(!has(LEVELS[7], '|') && !has(LEVELS[10], 'w') && !has(LEVELS[12], 'R') && !has(LEVELS[12], 'w'));
  // Ruhewolken nach etwa 4–5 Etagen in langen Leveln
  for (const lv of LEVELS.filter((x) => floors(x) >= 10)) {
    const L = parseLevel(lv), rf = L.rests.map((r) => L.plats[r.plat].floor).sort((a, b) => a - b);
    assert.ok(rf.length >= Math.floor(floors(lv) / 5) - 1 && rf.length >= 1, `Level ${lv.id}: Ruhewolken ${rf}`);
    let prev = 0; for (const f of [...rf, floors(lv)]) { assert.ok(f - prev <= 7, `Level ${lv.id}: Abstand ${prev}→${f}`); prev = f; }
  }
});

test('jedes Level lösbar, alle Sterne und Wolken erreichbar', () => {
  for (const lv of LEVELS) {
    assert.ok(solve(lv), `Level ${lv.id} unlösbar`);
    const L = parseLevel(lv), reach = reachableAll(lv);
    for (const s of L.stars) assert.ok(reach.has(s.plat), `Level ${lv.id}: Stern ${s.i} unerreichbar`);
    for (const p of L.plats) assert.ok(reach.has(p.i), `Level ${lv.id}: Wolke r${p.row}[${p.a}-${p.b}] unerreichbar`);
  }
});

test('Pflichtaufgaben sind wirklich nötig (Fee, Elf, Regenbogen, Schmetterling; Ranke außer in Level 10)', () => {
  for (const lv of LEVELS) {
    const L = parseLevel(lv);
    if (L.taxis.length) assert.ok(!solvableWithout(lv, 'taxi'), `Level ${lv.id}: Schmetterling umgehbar`);
    if (L.fairy >= 0) assert.ok(!solvableWithout(lv, 'fairy'), `Level ${lv.id}: Fee umgehbar`);
    if (L.elves.length) assert.ok(!solvableWithout(lv, 'elf'), `Level ${lv.id}: Elf umgehbar`);
    if (L.rainbows.length) assert.ok(!solvableWithout(lv, 'rainbow'), `Level ${lv.id}: Regenbogen umgehbar`);
    if (L.vines.some((v) => v.elf < 0) && lv.id !== 10) assert.ok(!solvableWithout(lv, 'vine'), `Level ${lv.id}: Ranke umgehbar`);
  }
});

test('keine Sackgassen: von jedem erreichbaren Zustand geht es noch zum Ziel', () => {
  for (const lv of LEVELS) {
    const st0 = newState(lv), seen = new Set(), q = [st0];
    const key = (s) => `${s.plat}|${s.wand}|${s.fairyHelped}|${s.elves}|${s.rainbows}`;
    let n = 0;
    while (q.length && n < 3000) {
      const s = q.shift(); n++;
      if (seen.has(key(s))) continue; seen.add(key(s));
      if (s.done) continue;
      assert.ok(plan(s), `Level ${lv.id}: Sackgasse auf Wolke ${s.plat}`);
      for (const m of moves(s)) {
        const c = restoreRun(lv, runOf(s)); c.plat = s.plat; c.col = s.col;
        moveTo(c, m.plat); q.push(c);
      }
    }
  }
});

test('Pupsen: nur erreichbare Wolken, kein Absturz, Ziel beendet', () => {
  const st = newState(LEVELS[1]);   // Level 2
  const L = st.L, goal = L.goal, mid = L.plats.find((p) => p.row === 1).i;
  assert.equal(canMove(st, goal), null, 'Ziel zwei Etagen hoch nicht direkt');
  assert.equal(moveTo(st, goal), null);
  assert.equal(st.plat, L.start, 'nichts passiert');
  const r = moveTo(st, mid);
  assert.equal(r.move.via, 'pup');
  assert.ok(r.events.some((e) => e.type === 'star'));
  const g = moveTo(st, goal);
  assert.ok(g.events.some((e) => e.type === 'goal') && st.done);
  assert.equal(starCount(st), 3);
  assert.equal(moveTo(st, mid), null, 'nach dem Ziel keine Züge mehr');
});

test('Zauberstab zur Fee: Zauberwolken erscheinen erst danach', () => {
  const lv = LEVELS[7], st = newState(lv), L = st.L;
  const ghost = L.plats.find((p) => p.kind === 'ghost');
  const path = solve(lv);
  for (const j of path) {
    if (L.plats[j].kind === 'ghost') assert.ok(st.fairyHelped, 'Zauberwolke erst nach der Fee');
    moveTo(st, j);
  }
  assert.ok(st.done && st.fairyHelped && !st.wand);
  // Fee ohne Stab besuchen: sie wartet, nichts geht kaputt
  const s2 = newState(lv), fairyPlat = L.fairy;
  const toFairy = plan(s2, (s) => s.plat === fairyPlat && !s.wand);
  if (toFairy) { for (const j of toFairy) moveTo(s2, j); assert.ok(!s2.fairyHelped); assert.ok(plan(s2)); }
  assert.ok(ghost);
});

test('Ranke, Elf und Regenbogen funktionieren hoch und runter', () => {
  const lv = LEVELS[5], st = newState(lv), L = st.L;   // Level 6: Ranke
  const v = L.vines[0];
  for (const j of plan(st, (s) => s.plat === v.down)) moveTo(st, j);
  const up = moveTo(st, v.up);
  assert.equal(up.move.via, 'vine');
  assert.equal(up.col, v.col);
  // Level 13: Elf lässt die Ranke wachsen
  const s13 = newState(LEVELS[12]), L13 = s13.L, e = L13.elves[0], ev = L13.vines[e.vine];
  assert.equal(canMove(s13, ev.up), null);
  for (const j of plan(s13, (s) => s.plat === e.plat)) moveTo(s13, j);
  assert.ok(s13.elves[0]);
  assert.equal(canMove(s13, ev.up).via, 'vine');
  moveTo(s13, ev.up); assert.equal(canMove(s13, ev.down).via, 'vine', 'auch wieder runter');
  // Level 11: Regenbogen
  const s11 = newState(LEVELS[10]), rb = s11.L.rainbows[0];
  for (const j of plan(s11, (s) => s.plat === rb.a)) moveTo(s11, j);
  assert.ok(s11.rainbows[0]);
  assert.equal(canMove(s11, rb.b).via, 'rainbow');
  moveTo(s11, rb.b); assert.equal(canMove(s11, rb.a).via, 'rainbow');
});

test('Schmetterlings-Taxi: bis 3 Etagen hoch/runter, nur von der Schmetterlingswolke, kein Absturz', () => {
  const lv = LEVELS[20], st = newState(lv), L = st.L;   // Level 21
  const b = L.taxis[0], top = L.plats[L.goal];
  // zur Schmetterlingswolke (auf der Wiese kein Taxi)
  assert.ok(!moves(st).some((m) => m.via === 'taxi'));
  moveTo(st, b.plat);
  const t = moves(st).filter((m) => m.via === 'taxi');
  assert.ok(t.length > 0 && t.every((m) => Math.abs(L.plats[m.plat].row - L.plats[b.plat].row) <= 3));
  assert.ok(t.every((m) => L.plats[m.plat].row < L.plats[b.plat].row), 'in Level 21 nur nach oben');
  assert.ok(!t.some((m) => m.plat === top.i), 'Ziel liegt 4 Etagen höher: nicht direkt per Taxi');
  const r = moveTo(st, t[0].plat);
  assert.equal(r.move.via, 'taxi'); assert.equal(st.plat, t[0].plat);
  // von einer Wolke ohne Schmetterling gibt es kein Taxi
  assert.ok(!moves(st).some((m) => m.via === 'taxi'));
});

test('Spielstand: Sterne, Freischalten, begonnenes Level fortsetzen', () => {
  const s = freshSave();
  assert.equal(recordWin(s, 1, 2, LEVEL_COUNT), true);
  assert.equal(recordWin(s, 1, 1, LEVEL_COUNT), false);
  assert.equal(s.best[1], 2); assert.equal(s.unlocked, 2);
  // Fortsetzen
  const lv = LEVELS[13], st = newState(lv), p = solve(lv);
  for (const j of p.slice(0, 4)) moveTo(st, j);
  const run = JSON.parse(JSON.stringify(runOf(st)));
  const back = restoreRun(lv, run);
  assert.equal(back.plat, st.plat); assert.equal(back.wand, st.wand); assert.deepEqual(back.stars, st.stars); assert.deepEqual(back.elves, st.elves);
  assert.ok(plan(back), 'fortgesetztes Level lösbar');
  // kaputte Daten
  assert.equal(restoreRun(lv, { l: 14, p: 999 }).plat, newState(lv).plat);
  assert.equal(restoreRun(lv, { l: 3, p: 1 }).plat, newState(lv).plat);
  const clean = sanitizeSave({ unlocked: 99, best: { 1: 3, 2: 7, 51: 1, 50: 2, x: 2 }, run: { l: 2 }, mute: 1 }, LEVEL_COUNT);
  assert.deepEqual(clean.best, { 1: 3, 50: 2 }); assert.equal(clean.unlocked, 50);
  // Wer die ersten 20 Level schon geschafft hatte, darf mit Level 21 weitermachen
  assert.equal(sanitizeSave({ unlocked: 20, best: { 20: 2 } }, LEVEL_COUNT).unlocked, 21);
  assert.equal(sanitizeSave({ unlocked: 20, best: { 19: 2 } }, LEVEL_COUNT).unlocked, 20);
  assert.equal(sanitizeSave({ unlocked: 7, best: { 3: 1 } }, LEVEL_COUNT).unlocked, 7); assert.equal(clean.mute, true); assert.equal(clean.run.l, 2);
  s.run = { l: 1 }; recordWin(s, 1, 3, LEVEL_COUNT); assert.equal(s.run, null, 'geschafft = kein offener Lauf');
});

test('Einladungslink', () => {
  assert.deepEqual(parseChallenge('?l=7&s=2', 20), { l: 7, s: 2 });
  assert.deepEqual(parseChallenge('?l=7', 20), { l: 7, s: null });
  assert.equal(parseChallenge('?l=21&s=2', 20), null);
  assert.deepEqual(parseChallenge('?l=3&s=9', 20), { l: 3, s: null });
});
