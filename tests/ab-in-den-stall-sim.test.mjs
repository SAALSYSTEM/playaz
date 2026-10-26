// AB IN DEN STALL!: Leveldaten, Lösbarkeit, Wegmalen, Laufen, Gatter, Pfützen, Spielstand, Herausforderung (ohne Browser).
import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS, LEVEL_COUNT, WORLDS } from '../public/spiele/ab-in-den-stall/levels.js';
import {
  KINDS, COLS, ROWS, parseLevel, newState, startDraft, extend, send, step, tapGate, findPath, solve,
  blockedAtStart, freshSave, sanitizeSave, recordWin, centis, fmt, parseChallenge, animalsHome
} from '../public/spiele/ab-in-den-stall/engine.js';

// Spielt einen Weg wie ein Finger: Zelle für Zelle
function draw(st, idx, path) {
  const d = startDraft(st, idx);
  let res = null;
  for (const [r, c] of path.slice(1)) res = extend(st, d, r, c);
  return { d, res };
}
function runToEnd(st) { for (let i = 0; i < 6000 && !st.done; i++) step(st, 1 / 60); }

test('30 Level in 3 Welten, je 6×9, nur bekannte Zeichen', () => {
  assert.equal(LEVEL_COUNT, 30);
  assert.deepEqual(WORLDS.map((w) => [w.from, w.to]), [[1, 10], [11, 20], [21, 30]]);
  LEVELS.forEach((lv, i) => {
    assert.equal(lv.id, i + 1);
    assert.ok(lv.title && lv.tip && lv.tip.icon && lv.tip.text, `Level ${lv.id}: Titel/Tipp`);
    const p = parseLevel(lv);
    assert.ok(p.animals.length >= 1 && p.animals.length <= 7, `Level ${lv.id}: Tierzahl`);
    // zu jedem Tier gibt es genau ein passendes Zuhause, keine Häuser ohne Tier
    const kinds = new Set(p.animals.map((a) => a.kind));
    for (const k of kinds) assert.equal(p.homes.filter((h) => h.kind === k).length, 1, `Level ${lv.id}: ein Zuhause für ${k}`);
    for (const h of p.homes) assert.ok(kinds.has(h.kind), `Level ${lv.id}: Haus ohne Tier (${h.kind})`);
  });
});

test('jedes Level ist lösbar (Löser, Gatter dürfen angetippt werden)', () => {
  for (const lv of LEVELS) {
    const sol = solve(lv);
    assert.ok(sol, `Level ${lv.id} unlösbar`);
    assert.equal(sol.length, parseLevel(lv).animals.length);
  }
});

test('neue Elemente kommen dort vor, wo der Tipp sie ankündigt', () => {
  const has = (lv, ch) => lv.map.join('').includes(ch);
  assert.ok(!LEVELS.slice(0, 10).some((lv) => has(lv, 'W') || has(lv, 'G') || has(lv, 'P')), 'Welt 1 ohne Bach/Gatter/Pfütze');
  assert.ok(has(LEVELS[10], 'B') && has(LEVELS[12], 'G') && has(LEVELS[13], 'E'), 'Brücke 11, Gatter 13, Teich 14');
  assert.ok(!LEVELS.slice(0, 20).some((lv) => has(lv, 'P') || has(lv, 'F')), 'Pfütze und Fohlen erst ab Welt 3');
  assert.ok(has(LEVELS[20], 'P') && has(LEVELS[22], 'F'), 'Pfütze 21, Fohlen 23');
  // Reihenfolge-Rätsel: dort muss am Anfang mindestens ein Tier warten
  for (const id of [9, 19, 29]) assert.ok(blockedAtStart(LEVELS[id - 1]).length > 0, `Level ${id}: Reihenfolge zählt`);
  // Level 29: drei Tiere hintereinander, nur das vorderste kann los
  assert.equal(blockedAtStart(LEVELS[28]).length, 2);
});

test('Gatter-Level brauchen das Gatter wirklich', () => {
  for (const lv of LEVELS) {
    if (!lv.map.join('').includes('G')) continue;
    const st = newState(lv);
    const needsGate = st.animals.some((a) => !findPath(st, a.i, false) && findPath(st, a.i, true));
    assert.ok(needsGate, `Level ${lv.id}: Gatter ohne Wirkung`);
  }
});

test('Pfützen: Ferkel darf durch, alle anderen nicht', () => {
  const st = newState(LEVELS[21]);   // Level 22
  const pig = st.animals.find((a) => a.kind === 'ferkel'), chick = st.animals.find((a) => a.kind === 'kueken');
  const p = findPath(st, pig.i);
  assert.ok(p.some(([r, c]) => st.tiles[r][c].t === 'pfuetze'), 'Ferkel-Weg führt durch die Pfütze');
  const d = startDraft(st, chick.i);
  // Küken von (7,0) hoch bis vor die Pfütze (3,0) und dann hinein
  for (const r of [6, 5, 4, 3]) extend(st, d, r, 0);
  assert.equal(extend(st, d, 2, 0), 'blocked');
});

test('Weg malen: Ecken, zurückmalen, falsches Haus, Sprünge des Fingers', () => {
  const st = newState(LEVELS[2]);    // Level 3: K....S / .k..s.
  const chick = st.animals.find((a) => a.kind === 'kueken');
  const d = startDraft(st, chick.i);
  assert.equal(extend(st, d, 6, 1), 'grow');
  assert.equal(extend(st, d, 5, 1), 'grow');
  assert.equal(extend(st, d, 6, 1), 'back');
  assert.equal(d.cells.length, 2);
  // Finger springt weit nach oben: Weg wird Feld für Feld ergänzt
  assert.equal(extend(st, d, 1, 1), 'grow');
  assert.deepEqual(d.cells.at(-1), [1, 1]);
  assert.ok(!send(st, d), 'unfertiger Weg wird nicht angenommen');
  // Weg zum Schweinestall: falsches Haus
  for (const c of [2, 3, 4, 5]) extend(st, d, 1, c);
  assert.equal(extend(st, d, 0, 5), 'wrong');
  assert.equal(d.done, false);
  // richtiges Haus
  for (const c of [4, 3, 2, 1]) extend(st, d, 1, c);
  assert.equal(extend(st, d, 0, 0), 'done');
  assert.ok(send(st, d));
  assert.equal(st.animals[chick.i].state, 'walk');
});

test('Gatter: zu versperrt den Weg, antippen öffnet (einmalig)', () => {
  const st = newState(LEVELS[12]);   // Level 13
  const lamb = st.animals[0];
  const d = startDraft(st, lamb.i);
  for (const r of [5, 4, 3]) extend(st, d, r, 2);
  assert.equal(extend(st, d, 2, 2), 'gate');
  assert.ok(tapGate(st, 2, 2));
  assert.ok(!tapGate(st, 2, 2), 'offenes Gatter bleibt offen');
  assert.equal(extend(st, d, 2, 2), 'grow');
  assert.equal(extend(st, d, 0, 2), 'done');
});

test('wartende Tiere versperren, laufende nicht', () => {
  const st = newState(LEVELS[8]);    // Level 9: Küken vor dem Ferkel im Gang
  const pig = st.animals.find((a) => a.kind === 'ferkel'), chick = st.animals.find((a) => a.kind === 'kueken');
  assert.equal(findPath(st, pig.i), null);
  const { d } = draw(st, chick.i, findPath(st, chick.i));
  assert.ok(send(st, d));
  assert.ok(findPath(st, pig.i), 'sobald das Küken losläuft, ist der Gang frei');
});

test('Bot spielt alle 30 Level bis zum Ende (Malen wie ein Finger, Gatter antippen, Laufen)', () => {
  for (const lv of LEVELS) {
    const st = newState(lv);
    let guard = 0;
    while (!st.done && guard++ < 50) {
      const next = st.animals.find((a) => a.state === 'wait' && findPath(st, a.i, true));
      if (!next) { step(st, 1 / 60); continue; }
      const path = findPath(st, next.i, true);
      for (const [r, c] of path) if (st.tiles[r][c].t === 'gatter') tapGate(st, r, c);
      const { d, res } = draw(st, next.i, path);
      assert.equal(res, 'done', `Level ${lv.id}: Weg nicht fertig`);
      assert.ok(send(st, d));
      for (let i = 0; i < 20; i++) step(st, 1 / 60);   // Kind malt das nächste Tier, während das erste noch läuft
    }
    runToEnd(st);
    assert.ok(st.done, `Level ${lv.id} nicht geschafft`);
    assert.equal(animalsHome(st), st.animals.length);
    assert.ok(st.time > 0.5 && st.time < 60, `Level ${lv.id}: Zeit ${st.time}`);
  }
});

test('Tierarten: Namen und Häuser vollständig', () => {
  for (const [k, v] of Object.entries(KINDS)) assert.ok(v.name && v.homeName && v.ch && v.home, k);
  assert.equal(COLS, 6); assert.equal(ROWS, 9);
});

test('Spielstand: bereinigen, Bestzeit, Freischalten', () => {
  const s = sanitizeSave({ unlocked: 99, best: { 1: 1234, 2: -5, 40: 100, x: 3 }, mute: 1 }, 30);
  assert.equal(s.unlocked, 30); assert.deepEqual(s.best, { 1: 1234 }); assert.equal(s.mute, true);
  assert.deepEqual(sanitizeSave(null, 30), freshSave());
  const f = freshSave();
  assert.ok(recordWin(f, 1, 900, 30)); assert.equal(f.unlocked, 2);
  assert.ok(!recordWin(f, 1, 950, 30)); assert.equal(f.best[1], 900);
  assert.ok(recordWin(f, 1, 800, 30));
  assert.ok(recordWin(f, 30, 500, 30)); assert.equal(f.unlocked, 30);
  assert.equal(centis(12.345), 1235); assert.equal(fmt(1235), '12,3 s'); assert.equal(fmt(7500), '1:15 min');
});

test('Herausforderungs-Link', () => {
  assert.deepEqual(parseChallenge('?l=7&t=1234', 30), { l: 7, t: 1234 });
  assert.equal(parseChallenge('?l=31&t=1234', 30), null);
  assert.equal(parseChallenge('?l=3', 30), null);
  assert.equal(parseChallenge('', 30), null);
});
