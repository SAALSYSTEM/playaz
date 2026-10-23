// LEITUNGSCHAOS: Regeln, Rätselbau (30 Level + Tagesrätsel), Nachspielen und Prüfung. Ohne Browser.
// Start: node --test tests/leitungschaos-sim.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VERSION, KONFIG, LEVEL, dreh, drehN, form, periode, bits, RICHTUNGEN, DX, DY, GEGEN, baueRaetsel, levelRaetsel, tagesRaetsel,
  geloest, fluss, neuesSpiel, tippe, kodiere, dekodiere, nachfahren, pruefeLauf } from '../public/spiele/leitungschaos/sim.js';
import * as kopie from '../supabase/functions/leitungschaos-lauf/sim.js';

// Lösungsweg: jedes drehbare Feld so oft antippen, bis es wie in der gebauten Lösung steht (hört auf, sobald gelöst)
export function loesungsweg(r) {
  const s = neuesSpiel(r), tipps = [];
  for (let i = 0; i < r.n && !s.geloest; i++) while (!r.fest[i] && s.masken[i] !== r.loesung[i] && !s.geloest) { tippe(r, s, i); tipps.push(i); }
  return { tipps, s };
}

test('Drehen und Formen', () => {
  assert.equal(dreh(1), 2); assert.equal(dreh(8), 1); assert.equal(dreh(3), 6); assert.equal(drehN(5, 2), 5); assert.equal(drehN(9, 4), 9);
  assert.equal(form(1), 'ende'); assert.equal(form(5), 'gerade'); assert.equal(form(10), 'gerade'); assert.equal(form(3), 'kurve'); assert.equal(form(7), 't'); assert.equal(form(15), 'kreuz');
  assert.equal(periode(5), 2); assert.equal(periode(15), 1); assert.equal(periode(3), 4);
  for (const d of RICHTUNGEN) { assert.equal(DX[d] + DX[GEGEN[d]], 0); assert.equal(DY[d] + DY[GEGEN[d]], 0); }
});

function pruefeRaetsel(r, K, name) {
  assert.equal(r.n, K.w * K.h, name);
  assert.ok(r.n <= 64, name + ': passt in die Eingabe-Kodierung');
  assert.ok(geloest(r, r.loesung), name + ': gebaute Lösung ist gültig');
  assert.ok(!geloest(r, r.start), name + ': Start ist nicht gelöst');
  assert.equal(r.art[r.quelle], 'q'); assert.ok(r.fest[r.quelle]);
  const h = r.art.filter((a) => a === 'h').length; assert.equal(h, r.haeuser);
  assert.ok(h >= K.haeuser[0] && h <= K.haeuser[1], name + ': Häuserzahl im Rahmen');
  for (let i = 0; i < r.n; i++) {
    assert.ok(bits(r.loesung[i]) >= 1, name + ': kein leeres Feld');
    assert.equal(bits(r.start[i]), bits(r.loesung[i]), name + ': Verdrehen ändert nur die Lage');
    if (r.fest[i]) assert.equal(r.start[i], r.loesung[i], name + ': feste Teile stehen richtig');
    if (r.art[i] === 'h') assert.equal(r.fest[i], !K.hausDreh, name + ': Haus fest genau ohne hausDreh');
    // Rand: nichts zeigt hinaus
    const x = i % r.w, y = Math.floor(i / r.w);
    for (const d of RICHTUNGEN) if (r.loesung[i] & d) { const nx = x + DX[d], ny = y + DY[d]; assert.ok(nx >= 0 && ny >= 0 && nx < r.w && ny < r.h); }
  }
  // Kein Haus direkt am Hydranten
  for (const d of RICHTUNGEN) if (r.loesung[r.quelle] & d) assert.notEqual(r.art[r.quelle + DY[d] * r.w + DX[d]], 'h', name);
  // Lösungsweg mit genau par Drehungen löst das Rätsel (oder früher über eine andere gültige Lösung)
  const w = loesungsweg(r); assert.ok(w.s.geloest, name + ': lösbar'); assert.ok(w.tipps.length <= r.par, name);
  assert.deepEqual(nachfahren(r, w.tipps), { geloest: true, drehungen: w.tipps.length });
}

test('30 Level: gültig, lösbar, jedes Mal gleich, neue Elemente in ihren Abschnitten', () => {
  assert.equal(LEVEL.length, 30);
  for (let nr = 1; nr <= 30; nr++) {
    const r = levelRaetsel(nr), K = LEVEL[nr - 1];
    pruefeRaetsel(r, K, 'Level ' + nr);
    assert.deepEqual(levelRaetsel(nr).start, r.start, 'deterministisch');
    if (nr >= 11 && nr <= 17) assert.ok(r.art.some((a, i) => a === 'h' && !r.fest[i]), 'Level ' + nr + ': drehbare Häuser');
    if (nr >= 18 && nr <= 24) assert.ok(r.fest.some((f, i) => f && r.art[i] === 'r'), 'Level ' + nr + ': verschweißte Rohre');
  }
});

test('Tagesrätsel: 200 Seeds gültig und lösbar, gleicher Seed = gleiches Rätsel, Version unbekannt = null', () => {
  for (let k = 1; k <= 200; k++) {
    const seed = (k * 2654435761) % 2147483646 + 1;
    const r = tagesRaetsel(seed, VERSION); pruefeRaetsel(r, KONFIG[VERSION].tag, 'Seed ' + seed);
  }
  assert.deepEqual(tagesRaetsel(123456, 1), tagesRaetsel(123456, 1));
  assert.notDeepEqual(tagesRaetsel(123456, 1).start, tagesRaetsel(123457, 1).start);
  assert.equal(tagesRaetsel(5, 99), null); assert.equal(tagesRaetsel(0, 1), null);
});

test('Fluss: Wasser nur über beidseitig offene Verbindungen, Lecks werden gezählt', () => {
  const r = { w: 3, h: 1, n: 3, quelle: 0 };
  assert.deepEqual([...fluss(r, [2, 10, 8]).nass], [1, 1, 1]); assert.equal(fluss(r, [2, 10, 8]).lecks, 0); assert.ok(geloest(r, [2, 10, 8]));
  assert.deepEqual([...fluss(r, [2, 5, 8]).nass], [1, 0, 0]); assert.equal(fluss(r, [2, 5, 8]).lecks, 1);   // Gerade steht quer
  assert.equal(fluss(r, [3, 10, 8]).lecks, 1, 'Hydrant zeigt über den Rand'); assert.ok(!geloest(r, [3, 10, 8]));
});

test('Tippen: feste Teile und ungültige Felder drehen nicht; nach dem Lösen nimmt das Spiel nichts mehr an', () => {
  const r = levelRaetsel(1), s = neuesSpiel(r);
  assert.equal(tippe(r, s, r.quelle), false); assert.equal(tippe(r, s, -1), false); assert.equal(tippe(r, s, r.n), false); assert.equal(tippe(r, s, 1.5), false);
  assert.equal(s.drehungen, 0);
  const w = loesungsweg(r);
  assert.equal(nachfahren(r, [...w.tipps, w.tipps[0]]).fehler, 'nach_loesung');
  assert.equal(nachfahren(r, [r.quelle]).fehler, 'eingaben');
});

test('Kodierung: Hin und zurück, fremde Zeichen und zu große Felder werden abgelehnt', () => {
  const t = [0, 9, 10, 35, 36, 61, 62, 63];
  assert.deepEqual(dekodiere(kodiere(t), 64), t);
  assert.equal(dekodiere('0a!', 64), null); assert.equal(dekodiere('Z', 48), null); assert.equal(dekodiere('0'.repeat(3001), 64), null); assert.equal(dekodiere(5, 64), null);
});

test('Prüfung: echter Lösungsweg ok, falsche Drehzahl / unvollständig / zusätzliche Tipps abgelehnt', () => {
  const seed = 777001, r = tagesRaetsel(seed, 1), w = loesungsweg(r);
  const ok = pruefeLauf(seed, 1, { inputs: kodiere(w.tipps), drehungen: w.tipps.length });
  assert.equal(ok.ok, true); assert.equal(ok.drehungen, w.tipps.length);
  assert.equal(pruefeLauf(seed, 1, { inputs: kodiere(w.tipps), drehungen: w.tipps.length + 1 }).grund, 'ergebnis_weicht_ab');
  assert.equal(pruefeLauf(seed, 1, { inputs: kodiere(w.tipps.slice(0, -1)), drehungen: w.tipps.length - 1 }).grund, 'nicht_geloest');
  assert.equal(pruefeLauf(seed, 1, { inputs: '', drehungen: 0 }).grund, 'eingaben');
  assert.equal(pruefeLauf(seed + 1, 1, { inputs: kodiere(w.tipps), drehungen: w.tipps.length }).ok, false, 'anderer Tag passt nicht');
  assert.equal(pruefeLauf(seed, 2, { inputs: kodiere(w.tipps), drehungen: w.tipps.length }).grund, 'version');
  assert.equal(pruefeLauf(seed, 1, null).grund, 'ungueltig');
});

test('Kopie in der Edge Function ist aktuell (node tools/edge-sync.mjs)', () => {
  assert.equal(kopie.VERSION, VERSION);
  const r = tagesRaetsel(4242, 1); assert.deepEqual(kopie.tagesRaetsel(4242, 1).start, r.start);
});
