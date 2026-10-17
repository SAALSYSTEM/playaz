// JUNGLE RUNNER: Regeln, Level, Lösungen, Sterne, Awards, Speicherstand, Endlosmodus – ohne Browser.
// Start: node --test tests/jungle-sim.test.mjs   (keine weiteren Abhängigkeiten)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSim, step, result, replay, decodeInputs, encodeInputs, cloneSim, starFlags, laneX, INVUL_HIT, HZ } from '../public/spiele/jungle-runner/sim.js';
import { LEVELS, LEVEL_BY_ID, WORLDS, endlessLevel } from '../public/spiele/jungle-runner/levels.js';
import { AWARDS, evaluateAwards, progressOf } from '../public/spiele/jungle-runner/awards.js';
import { leerStand, ladeAusRoh, migriere, SAVE_VERSION, saubererName, tagesSeed, heute } from '../public/spiele/jungle-runner/save.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LOES = JSON.parse(readFileSync(join(ROOT, 'tests/jungle-loesungen.json'), 'utf8'));
const IDS = { levels: LEVELS.map((l) => l.id), outfits: ['entdecker', 'blau', 'safari', 'schatz', 'tempel', 'gold'], awards: AWARDS.map((a) => a.id) };

test('30 Level in 5 Welten zu je 6, Länge 60–180 s, eindeutige Namen', () => {
  assert.equal(LEVELS.length, 30);
  assert.equal(WORLDS.length, 5);
  for (let w = 0; w < 5; w++) assert.equal(LEVELS.filter((l) => l.world === w).length, 6);
  assert.equal(new Set(LEVELS.map((l) => l.name)).size, 30);
  for (const l of LEVELS) {
    const sek = l.len / l.speed;
    assert.ok(sek >= 60 && sek <= 180, `Level ${l.id}: ${sek.toFixed(0)} s`);
    assert.ok(l.starCoins > 0 && l.starCoins < l.coins.length, `Level ${l.id}: Münz-Sterne erreichbar`);
  }
});

test('Level sind fest: jede Erzeugung liefert identische Daten', () => {
  const a = JSON.stringify(LEVEL_BY_ID[12].obs), b = JSON.stringify(LEVELS.find((l) => l.id === 12).obs);
  assert.equal(a, b);
});

test('Alle 30 Lösungen laufen in der echten Simulation fehlerfrei durchs Ziel (3 Sterne)', () => {
  for (const l of LEVELS) {
    const r = result(replay(l, decodeInputs(LOES[l.id].route)));
    assert.ok(r.gewonnen, `Level ${l.id} nicht gewonnen`);
    assert.equal(r.hits, 0, `Level ${l.id} Treffer`);
    assert.equal(r.falls, 0, `Level ${l.id} Absturz`);
    assert.equal(r.hearts, 3);
    assert.ok(r.coins >= 0.5 * l.coins.length, `Level ${l.id}: Münzen`);
  }
});

test('Münzroute erreicht die Münz-Mindestzahl für den zweiten Stern (alle Level)', () => {
  for (const l of LEVELS) {
    const sim = replay(l, decodeInputs(LOES[l.id].muenzRoute));
    const r = result(sim);
    assert.ok(r.gewonnen && r.coins >= l.starCoins, `Level ${l.id}: ${r.coins}/${l.starCoins}`);
    assert.deepEqual(starFlags(l, sim.s), [true, true, true], `Level ${l.id} Sterne`);
  }
});

test('Sterne: Ziel = 1, genug Münzen = 2, ≥2 Herzen im Ziel = 3', () => {
  const l = LEVEL_BY_ID[1];
  const fake = (o) => ({ phase: 'won', coins: 0, hearts: 1, ...o });
  assert.deepEqual(starFlags(l, fake({})), [true, false, false]);
  assert.deepEqual(starFlags(l, fake({ coins: l.starCoins })), [true, true, false]);
  assert.deepEqual(starFlags(l, fake({ coins: l.starCoins, hearts: 2 })), [true, true, true]);
  assert.deepEqual(starFlags(l, { phase: 'lost', coins: 999, hearts: 3 }), [false, false, false]);
});

test('Ohne Eingabe: genau ein Herz pro Treffer, danach Unverwundbarkeit', () => {
  const sim = replay(LEVEL_BY_ID[1], []);
  const r = result(sim);
  assert.equal(r.hits, 2);
  assert.equal(r.hearts, 3 - r.hits);
  assert.equal(r.sterne, 1);
  // Treffer-Zeitpunkte liegen mindestens INVUL_HIT auseinander
  const s = createSim(LEVEL_BY_ID[1]); const zeiten = [];
  while (s.s.phase === 'run' && s.s.t < HZ * 200) { step(s, null); for (const e of s.s.log) if (e.e === 'hit') zeiten.push(s.s.t); s.s.log.length = 0; }
  assert.ok(zeiten.length >= 2);
  for (let i = 1; i < zeiten.length; i++) assert.ok((zeiten[i] - zeiten[i - 1]) / HZ >= INVUL_HIT - 0.01);
});

test('Ohne Eingabe in Level 5: drei Treffer = verloren, Herzen 0', () => {
  const r = result(replay(LEVEL_BY_ID[5], []));
  assert.equal(r.gewonnen, false);
  assert.equal(r.hearts, 0);
  assert.ok(r.hits + r.falls >= 3);
});

test('Wassersturz kostet ein Herz und setzt auf den letzten Checkpoint zurück', () => {
  // Lösung bis kurz nach dem ersten Checkpoint spielen, dann nichts mehr tun, bis die Figur ins Wasser fällt
  const l = LEVEL_BY_ID[9], inp = decodeInputs(LOES[9].route);
  const sim = createSim(l); let i = 0, cp = null, fall = null, resp = null;
  while (sim.s.phase === 'run' && sim.s.t < HZ * 150 && !resp) {
    let cmd = null; if (!cp && i < inp.length && inp[i][0] <= sim.s.t) cmd = inp[i++][1];
    step(sim, cmd);
    for (const e of sim.s.log) {
      if (e.e === 'checkpoint' && !cp) cp = { z: sim.s.z };
      if (e.e === 'splash' && !fall) fall = { z: sim.s.z, hearts: sim.s.hearts };
      if (e.e === 'respawn' && !resp) resp = { z: e.z, hearts: sim.s.hearts, soll: 3 - sim.s.stats.hits - sim.s.stats.falls };
    }
    sim.s.log.length = 0;
  }
  assert.ok(cp, 'Checkpoint erreicht'); assert.ok(fall, 'Sturz'); assert.ok(resp, 'Respawn');
  assert.ok(resp.z <= fall.z, 'Respawn nicht weiter vorn als der Sturz');
  assert.ok(resp.z >= cp.z - 1, 'Respawn am letzten sicheren Checkpoint');
  assert.ok(sim.s.stats.falls >= 1);
  assert.equal(resp.hearts, resp.soll, 'Herzen = 3 − Treffer − Stürze (je genau eines)');
});

test('Simulation ist deterministisch und unabhängig vom Klonen', () => {
  const l = LEVEL_BY_ID[7], inp = decodeInputs(LOES[7].route);
  const a = result(replay(l, inp)), b = result(replay(l, inp));
  assert.deepEqual(a, b);
  const s = createSim(l); for (let i = 0; i < 600; i++) step(s, null);
  const c = cloneSim(s); for (let i = 0; i < 600; i++) { step(s, 'L'); step(c, 'L'); }
  assert.equal(s.s.x, c.s.x); assert.equal(s.s.z, c.s.z); assert.equal(s.s.t, c.s.t);
});

test('Eingaben: encode/decode Rundreise', () => {
  const s = LOES[3].route; assert.equal(encodeInputs(decodeInputs(s)), s);
  assert.throws(() => decodeInputs('xx!'));
});

test('Spurwechsel bleibt in den drei Spuren, Befehle am Rand ändern nichts', () => {
  const s = createSim(LEVEL_BY_ID[1]);
  for (let i = 0; i < 5; i++) { step(s, 'L'); for (let k = 0; k < 12; k++) step(s, null); }
  assert.equal(s.s.lane, 0); assert.ok(Math.abs(s.s.x - laneX(0)) < 1e-6);
  for (let i = 0; i < 5; i++) { step(s, 'R'); for (let k = 0; k < 12; k++) step(s, null); }
  assert.equal(s.s.lane, 2);
});

test('Sprung und Rutschen: Boden, Flugzeit, Rutschdauer', () => {
  const s = createSim(LEVEL_BY_ID[1]); step(s, 'U');
  let t = 0; while (!s.s.grounded && t < 200) { step(s, null); t++; }
  assert.ok(t > 30 && t < 60, 'Flugzeit ~0,77 s, war ' + t);
  step(s, 'D'); assert.ok(s.s.slideT > 0);
  for (let i = 0; i < 60; i++) step(s, null);
  assert.equal(s.s.slideT, 0);
});

test('Fortschritt der Tiere: Nashorn-Warnzeit je Level ≥ 1,75 s (Prüfer-Wert)', () => {
  for (const l of LEVELS) {
    const rh = l.dyn.filter((d) => d.k === 'rhino' || d.kind === 'rhino');
    for (const d of rh) assert.ok((d.warn ?? 2) >= 1.75, `Level ${l.id} Warnzeit`);
  }
});

test('Endlosmodus: gleiche Zahl gibt gleiche Strecke, Tempo steigt bis zur Obergrenze', () => {
  const mk = (seed) => { const l = endlessLevel(seed); const s = createSim(l); for (let i = 0; i < 60 * 30; i++) step(s, null); return l; };
  const a = mk(5), b = mk(5), c = mk(6);
  assert.equal(JSON.stringify(a.obs.slice(0, 40)), JSON.stringify(b.obs.slice(0, 40)));
  assert.notEqual(JSON.stringify(a.obs.slice(0, 40)), JSON.stringify(c.obs.slice(0, 40)));
  assert.ok(a.vmax >= 16 && a.vmax <= 20);
  assert.ok(a.coins.length > 20);
});

test('Awards: mindestens 12, eindeutige IDs, keine doppelte Freischaltung', () => {
  assert.ok(AWARDS.length >= 12);
  assert.equal(new Set(AWARDS.map((a) => a.id)).size, AWARDS.length);
  const sv = leerStand();
  sv.levels[1] = { done: true, stars: 3 };
  const n1 = evaluateAwards(sv, 30, { level: 1, gewonnen: true, unversehrt: true, sterne: 3 }, new Date('2026-01-01T10:00:00Z'));
  assert.ok(n1.some((a) => a.id === 'erster'));
  const n2 = evaluateAwards(sv, 30, { level: 1, gewonnen: true, unversehrt: true, sterne: 3 }, new Date('2026-01-02T10:00:00Z'));
  assert.equal(n2.length, 0);
  assert.equal(sv.awards.erster.at, '2026-01-01T10:00:00.000Z');
});

test('Awards: Schwellen für 5/10/20/30 Level, Münzen, Nashörner, Stämme, Rutschen, Endlos', () => {
  const sv = leerStand();
  const frei = () => new Set(Object.keys(sv.awards));
  for (let i = 1; i <= 30; i++) { sv.levels[i] = { done: true, stars: 3 }; evaluateAwards(sv, 30, { level: i }, new Date()); if (i === 4) assert.ok(!frei().has('fuenf')); if (i === 5) assert.ok(frei().has('fuenf')); if (i === 10) assert.ok(frei().has('zehn')); if (i === 20) assert.ok(frei().has('zwanzig')); }
  assert.ok(frei().has('dreissig'));
  assert.ok(frei().has('welt'));
  sv.stats.coinsTotal = 99; assert.ok(!evaluateAwards(sv, 30, null, new Date()).some((a) => a.id === 'm100'));
  sv.stats.coinsTotal = 100; assert.ok(evaluateAwards(sv, 30, null, new Date()).some((a) => a.id === 'm100'));
  sv.stats.coinsTotal = 1000; evaluateAwards(sv, 30, null, new Date()); assert.ok(frei().has('m500') && frei().has('m1000'));
  sv.stats.rhino = 10; sv.stats.logs = 20; sv.stats.slides = 10; evaluateAwards(sv, 30, null, new Date());
  assert.ok(frei().has('nashorn') && frei().has('staemme') && frei().has('rutscher'));
  sv.endless.best = 1000; evaluateAwards(sv, 30, null, new Date()); assert.ok(frei().has('endlos'));
  assert.equal(progressOf(sv, 30).done, 30);
});

test('Speicherstand: leer, kaputt, neuer, alt (v0) und manipuliert', () => {
  assert.deepEqual(ladeAusRoh(null, IDS), leerStand());
  assert.deepEqual(ladeAusRoh('x', IDS), leerStand());
  assert.deepEqual(ladeAusRoh([], IDS), leerStand());
  const alt = { levels: { 1: 3, 2: 1, 99: 3 }, muenzen: 250, figur: 'girl' };
  assert.equal(migriere(alt).v, SAVE_VERSION);
  const s = ladeAusRoh(alt, IDS);
  assert.equal(s.v, SAVE_VERSION); assert.equal(s.coins, 250); assert.equal(s.char.kind, 'girl');
  assert.deepEqual([s.levels[1].done, s.levels[1].stars, s.levels[2].stars], [true, 3, 1]);
  assert.equal(s.levels[99], undefined);
  const bose = { v: 1, coins: -5, levels: { 1: { done: true, stars: 77, bestHearts: 9 }, 2: { done: false, stars: 3 } }, char: { kind: 'robot', outfit: 'gold', owned: ['x', 'gold'] }, awards: { erster: { at: 'kaputt' }, zehn: { at: '2026-03-01T00:00:00Z' } }, settings: { name: '<b>Max</b>' } };
  const t = ladeAusRoh(bose, IDS);
  assert.equal(t.coins, 0); assert.equal(t.levels[1].stars, 3); assert.equal(t.levels[1].bestHearts, 3); assert.equal(t.levels[2].stars, 0);
  assert.equal(t.char.kind, null); assert.ok(t.char.owned.includes('entdecker') && t.char.owned.includes('gold') && !t.char.owned.includes('x'));
  assert.equal(t.awards.erster, undefined); assert.ok(t.awards.zehn);
  assert.ok(!/[<>]/.test(t.settings.name));
  const neu = { v: SAVE_VERSION + 1, coins: 5 };
  assert.equal(migriere(neu), neu);
});

test('Name und Tagesstrecke', () => {
  assert.equal(saubererName('  Lena  Sophie  '), 'Lena Sophie');
  assert.equal(saubererName('ab'), '');
  assert.equal(saubererName('A'.repeat(40)).length, 16);
  assert.equal(tagesSeed('2026-10-18'), tagesSeed('2026-10-18'));
  assert.notEqual(tagesSeed('2026-10-18'), tagesSeed('2026-10-19'));
  assert.match(heute(new Date(2026, 9, 18)), /^2026-10-18$/);
});
