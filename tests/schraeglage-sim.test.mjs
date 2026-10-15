// SCHRÄGLAGE: Physik, Level und Awards ohne Browser.
// Start: node --test tests/schraeglage-sim.test.mjs   (keine weiteren Abhängigkeiten)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSim, replay, verifyRun, decodeInputs, encodeInputs, SIM_VERSION, VEHICLES, DT } from '../public/spiele/schraeglage/sim.js';
import { LEVELS } from '../public/spiele/schraeglage/levels.js';
import { dsin, dcos, datan2 } from '../public/spiele/schraeglage/det.js';
import { AWARDS, evaluateAwards, progressOf } from '../public/spiele/schraeglage/awards.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// Lösungen des Bots (tools/schraeglage-bot.mjs --json tests/schraeglage-loesungen.json)
const LOES = JSON.parse(readFileSync(join(ROOT, 'tests/schraeglage-loesungen.json'), 'utf8'));

test('deterministische Winkelfunktionen: genau genug und ohne Math.sin/cos', () => {
  for (let i = 0; i < 20000; i++) {
    const x = (i - 10000) * 0.0137;
    assert.ok(Math.abs(dsin(x) - Math.sin(x)) < 1e-14, 'sin ' + x);
    assert.ok(Math.abs(dcos(x) - Math.cos(x)) < 1e-14, 'cos ' + x);
    const y = Math.sin(i) * 7, z = Math.cos(i * 1.3) * 5;
    assert.ok(Math.abs(datan2(y, z) - Math.atan2(y, z)) < 1e-14, 'atan2');
  }
  const src = readFileSync(join(ROOT, 'public/spiele/schraeglage/sim.js'), 'utf8') + readFileSync(join(ROOT, 'public/spiele/schraeglage/levels.js'), 'utf8');
  assert.doesNotMatch(src.replace(/\/\/.*$/gm, ''), /Math\.(sin|cos|tan|atan2|atan|exp|pow|hypot|log)\(/, 'Physik/Level nutzen ungenaue Math-Funktionen');
  assert.doesNotMatch(readFileSync(join(ROOT, 'public/spiele/schraeglage/planck.js'), 'utf8'), /Math\.(sin|cos|atan2)\b/);
});

test('30 Level, aufsteigende IDs, jedes mit Ziel, Fahrzeug, Goldzeit und Tipp', () => {
  assert.equal(LEVELS.length, 30);
  LEVELS.forEach((l, i) => {
    assert.equal(l.id, i + 1);
    assert.ok(VEHICLES[l.vehicle], 'Fahrzeug ' + l.id);
    assert.ok(l.finish > 20, 'Ziel ' + l.id);
    assert.ok(l.gold > 3 && l.gold < 120, 'Goldzeit ' + l.id);
    assert.ok(l.tip.length > 5, 'Tipp ' + l.id);
    for (const s of l.swaps) assert.ok(VEHICLES[s.vehicle], 'Umsteigen ' + l.id);
  });
  // Alle fünf Fahrzeuge kommen vor; Fahrzeugwechsel in 21–25
  const benutzt = new Set(LEVELS.flatMap((l) => [l.vehicle, ...l.swaps.map((s) => s.vehicle)]));
  assert.equal(benutzt.size, 5);
  assert.ok(LEVELS.slice(20, 25).filter((l) => l.swaps.length).length >= 3);
});

test('Simulation ist deterministisch: gleicher Lauf, gleiches Ergebnis bis aufs Bit', () => {
  for (const id of [1, 13, 30]) {
    const ch = decodeInputs(LOES[id].inputs);
    const a = replay(LEVELS[id - 1], ch), b = replay(LEVELS[id - 1], ch);
    assert.equal(a.hash, b.hash, 'Level ' + id);
    assert.equal(a.ms, b.ms);
  }
});

test('jedes der 30 Level ist mit der gespeicherten Bot-Lösung lösbar, die Goldzeit ist erreichbar', () => {
  for (const l of LEVELS) {
    const s = LOES[l.id];
    assert.ok(s, 'keine Lösung für Level ' + l.id);
    const schnell = replay(l, decodeInputs(s.inputs));
    assert.ok(schnell.finished, `Level ${l.id}: schnelle Lösung kommt nicht ins Ziel (${schnell.crashed || 'stecken'})`);
    assert.ok(schnell.ms <= l.gold * 1000, `Level ${l.id}: Goldzeit ${l.gold}s nicht erreichbar (Bot ${schnell.ms} ms)`);
    const einfach = replay(l, decodeInputs(s.einfach));
    assert.ok(einfach.finished, `Level ${l.id}: einfache Lösung kommt nicht ins Ziel`);
  }
});

test('Prüfung gemeldeter Zeiten: echter Lauf ok, gefälschte Zeit/Eingaben/Version abgelehnt', () => {
  const l = LEVELS[7], s = LOES[8];
  const ok = verifyRun(l, { v: SIM_VERSION, level: 8, ms: s.ms, inputs: s.inputs });
  assert.equal(ok.ok, true);
  assert.equal(verifyRun(l, { v: SIM_VERSION, level: 8, ms: s.ms - 500, inputs: s.inputs }).grund, 'zeit_weicht_ab');
  assert.equal(verifyRun(l, { v: SIM_VERSION + 1, level: 8, ms: s.ms, inputs: s.inputs }).grund, 'version');
  assert.equal(verifyRun(l, { v: SIM_VERSION, level: 9, ms: s.ms, inputs: s.inputs }).grund, 'level');
  assert.equal(verifyRun(l, { v: SIM_VERSION, level: 8, ms: s.ms, inputs: '0g.zz9' }).ok, false);
  assert.equal(verifyRun(l, { v: SIM_VERSION, level: 8, ms: s.ms, inputs: 'kaputt!' }).ok, false);
  assert.equal(verifyRun(l, { v: SIM_VERSION, level: 8, ms: 5000, inputs: '0g' }).ok, false); // nur Gas: kommt nicht so schnell an
  // Kodierung hin und zurück
  const ch = [[0, 1], [37, 0], [120, -1], [999, 1]];
  assert.deepEqual(decodeInputs(encodeInputs(ch)), ch);
});

test('Fahrzeuge: fahren an, bremsen, kippen nicht auf flachem Boden', () => {
  const flach = { id: 0, start: [0, 0], finish: 400, killY: -40, ground: [{ pts: [[-20, 0], [420, 0]], surf: ['asphalt'], bottom: -50 }], objects: [] };
  for (const id of Object.keys(VEHICLES)) {
    const s = createSim(flach, { vehicle: id });
    const y0 = s.car.chassis.getPosition().y;
    for (let i = 0; i < 180; i++) s.step(1);
    const v = s.car.chassis.getLinearVelocity().x;
    assert.ok(v > 8, id + ' beschleunigt zu schwach: ' + v);
    assert.ok(!s.crashed, id + ' überschlägt sich beim Anfahren');
    let n = 0;
    while (s.car.chassis.getLinearVelocity().x > 0.5 && n < 300) { s.step(-1); n++; }
    assert.ok(n < 240, id + ' bremst nicht (' + n + ' Takte)');
    assert.ok(!s.crashed);
    // Federung: Fahrzeug steht ruhig (kein Zittern)
    const r = createSim(flach, { vehicle: id }); r.step(1); for (let i = 0; i < 3; i++) r.step(0);
    let maxW = 0; for (let i = 0; i < 120; i++) { r.step(0); maxW = Math.max(maxW, Math.abs(r.car.chassis.getAngularVelocity())); }
    assert.ok(maxW < 0.2, id + ' zittert: ' + maxW);
    assert.ok(Math.abs(r.car.chassis.getPosition().y - y0) < 0.3, id + ' sackt durch');
  }
});

test('Crash-Erkennung: Kopf, Absturz, Lava; Ziel-Erkennung mit genauer Zeit', () => {
  const mini = (extra) => Object.assign({ id: 0, start: [0, 0], finish: 300, killY: -15, objects: [] }, extra);
  // Absturz: Boden endet
  const s = createSim(mini({ ground: [{ pts: [[-20, 0], [15, 0]], surf: ['gras'], bottom: -30 }] }));
  for (let i = 0; i < 600 && !s.crashed; i++) s.step(1);
  assert.equal(s.crashed, 'absturz');
  // Wasser in einer Lücke
  const wa = createSim(mini({ ground: [{ pts: [[-20, 0], [15, 0]], surf: ['gras'], bottom: -30 }, { pts: [[40, 0], [300, 0]], surf: ['gras'], bottom: -30 }],
    objects: [{ type: 'kill', x0: 15, x1: 40, y0: -14, y1: -2.5, kind: 'wasser' }] }));
  for (let i = 0; i < 600 && !wa.crashed; i++) wa.step(1);
  assert.equal(wa.crashed, 'wasser');
  // Überschlag: Monstertruck mit Dauergas über Schanze in der Luft -> Kopf/Dach
  const sp = { id: 0, start: [0, 0], finish: 300, killY: -60, ground: [{ pts: [[-20, 0], [30, 0], [36, 1], [42, 3.2]], surf: ['gras', 'gras', 'gras'], bottom: -60 }, { pts: [[52, 0], [300, 0]], surf: ['gras'], bottom: -60 }], objects: [] };
  const w = createSim(sp, { vehicle: 'wummser' });
  for (let i = 0; i < 600 && !w.crashed; i++) w.step(1);
  assert.ok(['kopf', 'dach'].includes(w.crashed), 'Überschlag erkannt: ' + w.crashed);
  // Lava-Belag
  const lv = createSim(mini({ ground: [{ pts: [[-20, 0], [12, 0], [20, 0], [300, 0]], surf: ['stein', 'lava', 'stein'], bottom: -30 }] }));
  for (let i = 0; i < 600 && !lv.crashed; i++) lv.step(1);
  assert.equal(lv.crashed, 'lava');
  // Ziel: Zeit liegt zwischen den Takten
  const z = replay(LEVELS[0], [[0, 1]]);
  assert.ok(z.finished);
  assert.ok(z.ms > (z.ticks - 2) * DT * 1000 && z.ms <= z.ticks * DT * 1000 + 1);
});

test('Awards: Bedingungen, Datum, keine doppelte Vergabe', () => {
  assert.ok(AWARDS.length >= 15);
  for (const a of AWARDS) { assert.ok(a.name && a.desc && a.share && a.glyph && a.rarity >= 1 && a.rarity <= 4, a.id); }
  const ids = AWARDS.map((a) => a.id); assert.equal(new Set(ids).size, ids.length);
  const save = { levels: {}, stats: { streak: 0 }, awards: {} };
  const t = new Date('2026-10-15T12:00:00Z');
  const lauf = (level, extra = {}) => ({ level, ms: 9000, finished: true, firstWin: true, fails: 0, stats: { jumps: 0, flips: 0, chassisHit: true, maxTilt: 0.3, brake: true, wheelieMax: 0, airTicks: 0, dist: 100, vehicles: ['kraxler'] }, ...extra });
  save.levels[1] = { done: true };
  let neu = evaluateAwards(save, 30, lauf(1), t).map((a) => a.id);
  assert.deepEqual(neu, ['bronze']);
  assert.equal(save.awards.bronze.at, t.toISOString());
  assert.deepEqual(evaluateAwards(save, 30, lauf(1), t), [], 'nicht doppelt');
  for (let i = 2; i <= 10; i++) save.levels[i] = { done: true };
  assert.deepEqual(evaluateAwards(save, 30, null, t).map((a) => a.id), ['silber']);
  // Perfekte Landung, Stunt-König, Ohne Bremse aus einem Lauf
  const r = lauf(12, { stats: { jumps: 3, flips: 0, chassisHit: false, maxTilt: 0.6, brake: false, wheelieMax: 200, airTicks: 120, dist: 200, vehicles: ['kraxler'] } });
  const n2 = evaluateAwards(save, 30, r, t).map((a) => a.id).sort();
  assert.deepEqual(n2, ['landung', 'ohnebremse', 'stunt', 'wheelie']);
  // Comeback: nur ab Level 11, erster Sieg, mind. 10 Fehlversuche
  assert.ok(!evaluateAwards(save, 30, lauf(5, { fails: 12 }), t).some((a) => a.id === 'comeback'));
  assert.ok(evaluateAwards(save, 30, lauf(14, { fails: 10 }), t).some((a) => a.id === 'comeback'));
  // Unkaputtbar: Serie von 5
  save.stats.streak = 5; assert.ok(evaluateAwards(save, 30, null, t).some((a) => a.id === 'unkaputtbar'));
  // Fortschritt
  const p = progressOf(save, 30);
  assert.equal(p.done, 10);
});
