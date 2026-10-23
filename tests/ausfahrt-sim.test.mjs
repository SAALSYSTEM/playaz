// AUSFAHRT FREI: Regeln, feste Rätsel (30 Level + Tagespool) mit dem Löser geprüft, Nachspielen und Prüfung. Ohne Browser.
// Start: node --test tests/ausfahrt-sim.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VERSION, N, lese, raster, neuesSpiel, fahre, kodiere, dekodiere, nachfahren, pruefeLauf, tagesNummer } from '../public/spiele/ausfahrt-frei/sim.js';
import { LEVEL, POOLS } from '../public/spiele/ausfahrt-frei/raetsel.js';
import { loese, loesungsweg } from '../tools/ausfahrt-raetsel.mjs';
import * as kopie from '../supabase/functions/ausfahrt-lauf/sim.js';
import * as kopieR from '../supabase/functions/ausfahrt-lauf/raetsel.js';

test('Lesen: gültige und ungültige Aufstellungen', () => {
  const t = lese('......' + '......' + 'AA....' + '......' + '......' + '......'); assert.equal(t.length, 1); assert.equal(t[0].pos, 0);
  assert.equal(lese('x'.repeat(36)), null); assert.equal(lese('.'.repeat(36)), null, 'ohne Mischer');
  assert.equal(lese('......' + '......' + 'AAA...' + '.'.repeat(18)), null, 'Mischer zu lang');
  assert.equal(lese('A.....' + 'A.....' + '.'.repeat(24)), null, 'Mischer senkrecht');
  assert.equal(lese('B.B...' + '......' + 'AA....' + '.'.repeat(18)), null, 'nicht zusammenhängend');
  assert.equal(lese('BB....' + 'B.....' + 'AA....' + '.'.repeat(18)), null, 'L-Form');
});

test('Fahren: nur in Längsrichtung, nicht durch andere, ein Zug je Fahrt', () => {
  const t = lese('......' + '......' + 'AA..B.' + '....B.' + '......' + '......'), s = neuesSpiel(t);
  assert.equal(fahre(t, s, 0, 3), false, 'B steht im Weg'); assert.equal(fahre(t, s, 0, 2), true); assert.equal(s.zuege, 1);
  assert.equal(fahre(t, s, 1, 5), false, 'B würde aus dem Feld ragen'); assert.equal(fahre(t, s, 1, 4), true); assert.equal(fahre(t, s, 1, 4), false, 'gleiche Stelle ist kein Zug'); assert.equal(s.zuege, 2);
  assert.equal(fahre(t, s, 0, 4), true); assert.ok(s.geloest); assert.equal(fahre(t, s, 1, 0), false, 'nach dem Lösen nichts mehr');
});

function pruefeEintrag([text, min], name) {
  const t = lese(text); assert.ok(t, name + ': lesbar');
  const g = raster(t, t.map((x) => x.pos)); assert.equal(g.filter((k) => k >= 0).length, t.reduce((a, x) => a + x.len, 0), name + ': keine Überlappung');
  assert.ok(min >= 1, name); assert.equal(loese(text), min, name + ': Mindestzüge stimmen');
  const weg = loesungsweg(text); assert.equal(weg.length, min, name);
  assert.deepEqual(nachfahren(t, weg), { geloest: true, zuege: min }, name + ': Lösungsweg spielt sich nach');
}

test('30 Level: gültig, Mindestzüge vom Löser bestätigt, steigend', () => {
  assert.equal(LEVEL.length, 30);
  LEVEL.forEach((e, i) => pruefeEintrag(e, 'Level ' + (i + 1)));
  for (let i = 1; i < 30; i++) assert.ok(LEVEL[i][1] >= LEVEL[i - 1][1], 'Level ' + (i + 1) + ' nicht leichter als davor');
});

test('Tagespool: 366 verschiedene Rätsel mit 14–24 Mindestzügen, Stichprobe vom Löser bestätigt', () => {
  const pool = POOLS[VERSION]; assert.equal(pool.length, 366);
  assert.equal(new Set(pool.map((x) => x[0])).size, 366, 'keine Doppelten');
  for (const [text, min] of pool) { assert.ok(lese(text), text); assert.ok(min >= 14 && min <= 24, text); }
  for (let i = 0; i < pool.length; i += 9) pruefeEintrag(pool[i], 'Tag ' + i);
  assert.equal(tagesNummer(366 * 5 + 7, pool), 7); assert.equal(tagesNummer(0, pool), -1);
});

test('Kodierung und Prüfung: echter Weg ok, falsche Zugzahl / unvollständig / Zug nach dem Lösen abgelehnt', () => {
  const seed = 1234567, pool = POOLS[1], [text] = pool[tagesNummer(seed, pool)], t = lese(text), weg = loesungsweg(text);
  const inputs = kodiere(weg, t); assert.deepEqual(dekodiere(inputs, t), weg);
  assert.equal(pruefeLauf(seed, 1, { inputs, zuege: weg.length }, POOLS).ok, true);
  assert.equal(pruefeLauf(seed, 1, { inputs, zuege: weg.length + 1 }, POOLS).grund, 'ergebnis_weicht_ab');
  assert.equal(pruefeLauf(seed, 1, { inputs: kodiere(weg.slice(0, -1), t), zuege: weg.length - 1 }, POOLS).grund, 'nicht_geloest');
  assert.equal(pruefeLauf(seed, 1, { inputs: inputs + inputs.slice(0, 2), zuege: weg.length + 1 }, POOLS).ok, false);
  assert.equal(pruefeLauf(seed, 1, { inputs: 'A9', zuege: 1 }, POOLS).grund, 'eingaben');
  assert.equal(pruefeLauf(seed, 1, { inputs: 'A', zuege: 1 }, POOLS).grund, 'eingaben');
  assert.equal(pruefeLauf(seed, 2, { inputs, zuege: weg.length }, POOLS).grund, 'version');
  assert.equal(pruefeLauf(seed, 1, null, POOLS).grund, 'ungueltig');
});

test('Kopien in der Edge Function sind aktuell (node tools/edge-sync.mjs)', () => {
  assert.equal(kopie.VERSION, VERSION); assert.deepEqual(kopieR.POOLS, POOLS); assert.deepEqual(kopieR.LEVEL, LEVEL);
});
