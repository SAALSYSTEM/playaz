// HEXIS ZAUBERSUPPE: Leveldaten, Lernkurve, Zutaten zugeben, Puff, Sterne, Zauberbuch, Spielstand, Einladung (ohne Browser).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LEVELS, LEVEL_COUNT } from '../public/spiele/hexis-zaubersuppe/levels.js';
import {
  ZUTATEN, VERWANDLUNG_IDS, checkLevel, newState, zugeben, offen, fehlt, gesamt, geschafft, sterne, suppenFarbe,
  freshSave, sanitizeSave, recordWin, totalStars, parseInvite
} from '../public/spiele/hexis-zaubersuppe/engine.js';

const total = (lv) => Object.values(lv.rezept).reduce((a, b) => a + b, 0);

test('15 gültige Level mit fortlaufenden Nummern', () => {
  assert.equal(LEVEL_COUNT, 15);
  LEVELS.forEach((lv, i) => { assert.equal(lv.id, i + 1); assert.ok(checkLevel(lv)); assert.ok(lv.name); });
});

test('Lernkurve: erst eine Zutat, dann mehr; Regal wird voller', () => {
  for (const n of [1, 2, 3]) assert.equal(Object.keys(LEVELS[n - 1].rezept).length, 1, `Level ${n}`);
  assert.deepEqual(LEVELS.slice(0, 3).map(total), [1, 2, 3], 'Zählen bis 3');
  for (let i = 1; i < LEVELS.length; i++) {
    assert.ok(LEVELS[i].regal.length >= LEVELS[i - 1].regal.length, `Regal Level ${i + 1} nicht kleiner`);
    assert.ok(Object.keys(LEVELS[i].rezept).length >= Object.keys(LEVELS[i - 1].rezept).length - 1, `Level ${i + 1}: kein großer Rücksprung`);
  }
  assert.equal(LEVELS[LEVEL_COUNT - 1].regal.length, 10, 'Im letzten Level stehen alle Zutaten im Regal');
});

test('Alle Zutaten und alle Verwandlungen kommen vor, jede Verwandlung bis Level 10', () => {
  const zut = new Set(LEVELS.flatMap((lv) => Object.keys(lv.rezept)));
  for (const z of Object.keys(ZUTATEN)) assert.ok(zut.has(z), `${z} im Rezept`);
  for (const k of VERWANDLUNG_IDS) {
    const first = LEVELS.find((lv) => lv.kater === k);
    assert.ok(first && first.id <= 10, `${k} spätestens in Level 10`);
  }
  assert.ok(LEVELS[LEVEL_COUNT - 1].fest, 'Finale wirbelt durch alle Verwandlungen');
});

test('Jede Zutat hat ein Bild, jede Verwandlung ein Kater-Bild', () => {
  const list = JSON.parse(readFileSync(new URL('../public/spiele/hexis-zaubersuppe/img/manifest.json', import.meta.url)));
  for (const z of Object.keys(ZUTATEN)) assert.ok(list.includes(z), z);
  for (const k of VERWANDLUNG_IDS) assert.ok(list.includes('kater-' + k), 'kater-' + k);
  for (const k of ['kater', 'hexe', 'hexe-jubel', 'hexe-ueberrascht', 'kessel', 'kessel-suppe', 'rauchwolke', 'hintergrund']) assert.ok(list.includes(k), k);
});

test('Zugeben: passende Zutat zählt, falsche und zu viele machen Puff, fertig erst wenn alles drin ist', () => {
  const lv = LEVELS[4];   // 2 Fledermäuse, 1 Stern
  const st = newState(lv);
  assert.equal(gesamt(st), 3);
  assert.equal(zugeben(st, 'pilz'), 'puff');
  assert.equal(zugeben(st, 'fledermaus'), 'gut');
  assert.equal(zugeben(st, 'stern'), 'gut');
  assert.equal(zugeben(st, 'stern'), 'puff', 'zweiter Stern ist zu viel');
  assert.deepEqual(offen(st), ['fledermaus']);
  assert.equal(fehlt(st, 'fledermaus'), 1);
  assert.equal(zugeben(st, 'fledermaus'), 'fertig');
  assert.equal(st.fehler, 2);
  assert.equal(geschafft(st), 3);
  assert.equal(zugeben(st, 'fledermaus'), 'aus', 'nach dem Fertigwerden passiert nichts mehr');
});

test('Sterne: ohne Puff 3, 1–2 Puffs 2, mehr 1', () => {
  assert.deepEqual([0, 1, 2, 3, 9].map(sterne), [3, 2, 2, 1, 1]);
});

test('Suppenfarbe mischt die Zutaten', () => {
  const st = newState(LEVELS[0]);
  assert.equal(suppenFarbe(st), null);
  zugeben(st, 'frosch');
  assert.equal(suppenFarbe(st), ZUTATEN.frosch.farbe);
});

test('Bot spielt alle Level fehlerfrei (3 Sterne) und füllt das Zauberbuch', () => {
  const save = freshSave();
  for (const lv of LEVELS) {
    assert.ok(lv.id <= save.unlocked, `Level ${lv.id} freigeschaltet`);
    const st = newState(lv);
    let res = null, n = 0;
    while (offen(st).length && n++ < 50) res = zugeben(st, offen(st)[0]);
    assert.equal(res, 'fertig');
    assert.equal(n, total(lv));
    const r = recordWin(save, lv, st, LEVEL_COUNT);
    assert.equal(r.stars, 3);
  }
  assert.equal(totalStars(save), 45);
  assert.deepEqual(save.kater, VERWANDLUNG_IDS);
  assert.equal(save.unlocked, LEVEL_COUNT);
});

test('Bestwert bleibt, schlechterer Versuch überschreibt nicht; Einladung schaltet nichts frei', () => {
  const save = freshSave();
  const st = newState(LEVELS[0]); zugeben(st, 'apfel'); zugeben(st, 'apfel'); zugeben(st, 'apfel'); zugeben(st, 'frosch');
  assert.equal(recordWin(save, LEVELS[0], st, LEVEL_COUNT).stars, 1);
  const st2 = newState(LEVELS[0]); zugeben(st2, 'frosch');
  assert.equal(recordWin(save, LEVELS[0], st2, LEVEL_COUNT).rec, true);
  const st3 = newState(LEVELS[0]); zugeben(st3, 'apfel'); zugeben(st3, 'frosch');
  assert.equal(recordWin(save, LEVELS[0], st3, LEVEL_COUNT).rec, false);
  assert.equal(save.best[1], 3);
  assert.equal(save.unlocked, 2);
  const st9 = newState(LEVELS[8]); while (offen(st9).length) zugeben(st9, offen(st9)[0]);
  recordWin(save, LEVELS[8], st9, LEVEL_COUNT);
  assert.equal(save.unlocked, 2, 'eingeladenes Level 9 schaltet 10 nicht frei');
});

test('Spielstand wird bereinigt', () => {
  const s = sanitizeSave({ unlocked: 99, best: { 1: 3, 2: 7, 40: 3, x: 2, 3: 2 }, kater: ['hut', 'quatsch', 'lila'], mute: true }, LEVEL_COUNT);
  assert.deepEqual(s.best, { 1: 3, 3: 2 });
  assert.equal(s.unlocked, LEVEL_COUNT);
  assert.deepEqual(s.kater, ['lila', 'hut']);
  assert.equal(s.mute, true);
  assert.deepEqual(sanitizeSave(null, LEVEL_COUNT), freshSave());
  assert.equal(sanitizeSave({ best: { 4: 2 } }, LEVEL_COUNT).unlocked, 5);
});

test('Einladungslink', () => {
  assert.deepEqual(parseInvite('?l=7', LEVEL_COUNT), { l: 7 });
  assert.equal(parseInvite('?l=0', LEVEL_COUNT), null);
  assert.equal(parseInvite('?l=16', LEVEL_COUNT), null);
  assert.equal(parseInvite('', LEVEL_COUNT), null);
});
