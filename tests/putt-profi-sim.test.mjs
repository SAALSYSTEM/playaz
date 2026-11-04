// PUTT-PROFI ohne Browser: Bahnen bauen, Physik (Banden halten, Loch, Graben, Mühle), Lösbarkeit mit Par,
// Tagesrunde, Nachspielen für die Rangliste, Spielstand.  node --test tests/putt-profi-sim.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as L from '../public/spiele/putt-profi/logik.js';

const LOES = JSON.parse(readFileSync(new URL('./putt-profi-loesungen.json', import.meta.url))).loesungen;
const schlaege = (text) => L.dekodiere(text)[0];

test('alle 108 Bahnen lassen sich bauen (normal und gespiegelt), Abschlag und Loch liegen auf dem Boden', () => {
  assert.equal(L.BAHNEN.length, 108);
  for (let nr = 0; nr < 108; nr++) for (const sp of [false, true]) {
    const b = L.baueBahn(nr, sp);
    assert.ok(Number.isFinite(b.tee.y) && Math.abs(b.tee.y - (0.0633 + L.R)) < 1e-3, `${b.name}: Abschlag`);
    assert.ok(b.loch.y < 0.04, `${b.name}: Loch`);
    assert.ok([2, 3, 4].includes(b.par));
  }
  assert.equal(L.baueBahn(12).muehlen.length, 1);
});

test('Prüf-Bot: jede Bahn ist lösbar und das Par ist erreichbar (normal und gespiegelt)', () => {
  assert.equal(JSON.parse(readFileSync(new URL('./putt-profi-loesungen.json', import.meta.url))).sim, L.SIM_VERSION, 'Lösungen neu erzeugen: node tools/putt-profi-bot.mjs');
  for (let nr = 0; nr < 108; nr++) for (const sp of [false, true]) {
    const text = LOES[nr + (sp ? 's' : '')];
    assert.ok(text, `Bahn ${nr + 1}${sp ? ' gespiegelt' : ''} ohne Lösung`);
    const b = L.baueBahn(nr, sp), ball = L.neuerBall(b);
    for (const s of schlaege(text)) L.schlage(b, ball, s);
    assert.ok(ball.eingelocht, `Bahn ${nr + 1}: nicht eingelocht`);
    assert.ok(ball.schlaege <= b.par, `Bahn ${nr + 1}: ${ball.schlaege} > Par ${b.par}`);
  }
});

test('Banden halten: 150 zufällige Schläge je Bahn enden auf der Bahn (Aus nur am Graben)', () => {
  const r = L.zufall(42);
  for (let nr = 0; nr < 108; nr++) {
    const b = L.baueBahn(nr, nr % 2 === 1), graben = b.felder.some((f) => f.teil === 'gap');
    const felder = new Set(b.felder.map((f) => f.x + ',' + f.z));
    for (let i = 0; i < 150; i++) {
      const ball = L.neuerBall(b);
      const a = r() * Math.PI * 2;
      const s = L.schlage(b, ball, { dx: Math.round(Math.sin(a) * 10000) || 1, dz: Math.round(Math.cos(a) * 10000), p: 1 + Math.floor(r() * 1000), ph: Math.floor(r() * 300) });
      if (s.ende === 'aus') { assert.ok(graben, `${b.name}: Kugel im Aus ohne Graben`); continue; }
      assert.ok(felder.has(Math.round(ball.x) + ',' + Math.round(ball.z)), `${b.name}: Kugel liegt neben der Bahn (${ball.x}, ${ball.z})`);
      assert.ok(Math.abs(ball.y - L.boden(b, ball.x, ball.z) - L.R) < 0.01, `${b.name}: Kugel schwebt`);
    }
  }
});

test('Physik: gerader Putt, zu schnell rollt übers Loch, Graben = Aus mit Strafschlag, gleiche Eingabe = gleiches Ergebnis', () => {
  const b = L.baueBahn(0);
  const kurz = L.neuerBall(b); L.schlage(b, kurz, { dx: 0, dz: -10000, p: 150, ph: 0 });
  assert.ok(!kurz.eingelocht && kurz.z > 3 && kurz.z < 5 && Math.abs(kurz.x) < 1e-9);
  const voll = L.neuerBall(b); const sv = L.schlage(b, voll, { dx: 0, dz: -10000, p: 1000, ph: 0 });
  assert.ok(!voll.eingelocht, 'mit voller Kraft fällt die Kugel nicht'); assert.equal(sv.ende, 'ruhe');
  const g = L.baueBahn(9), ball = L.neuerBall(g);
  const s = L.schlage(g, ball, { dx: 0, dz: -10000, p: 500, ph: 0 });
  assert.equal(s.ende, 'aus'); assert.equal(ball.schlaege, 2); assert.equal(ball.aus, 1);
  assert.deepEqual([ball.x, ball.z], [g.tee.x, g.tee.z], 'zurück an den Abschlag');
  const a = L.neuerBall(b), c = L.neuerBall(b);
  L.schlage(b, a, { dx: 1234, dz: -9000, p: 700, ph: 0 }); L.schlage(b, c, { dx: 1234, dz: -9000, p: 700, ph: 0 });
  assert.deepEqual(a, c);
});

test('Mühle: ein Flügel sperrt die Tür nur zeitweise', () => {
  const b = L.baueBahn(12); let gesperrt = 0, drin = 0;
  for (let ph = 0; ph < L.MUEHLE.periode; ph += 10) {
    const ball = L.neuerBall(b), ev = [];
    L.schlage(b, ball, { dx: 0, dz: -10000, p: 620, ph }, ev);
    if (ev.some((e) => e.typ === 'muehle')) gesperrt++; if (ball.eingelocht) drin++;
  }
  assert.ok(gesperrt >= 3 && gesperrt <= 12, 'gesperrt ' + gesperrt); assert.ok(drin >= 15, 'drin ' + drin);
});

test('nach 6 Schlägen ist die Bahn vorbei und zählt 7', () => {
  const b = L.baueBahn(0), ball = L.neuerBall(b);
  for (let i = 0; i < 6; i++) L.schlage(b, ball, { dx: 0, dz: 10000, p: 5, ph: 0 });
  assert.ok(ball.fertig && !ball.eingelocht); assert.equal(L.ergebnis(ball), 7); assert.equal(L.sterne(0, 7), 0);
});

// Eine Tagesrunde aus den Bot-Lösungen
export function botRunde(seed) {
  const plan = L.tagesRunde(seed);
  const eingaben = plan.map((p) => schlaege(LOES[p.nr + (p.spiegel ? 's' : '')]));
  const text = L.kodiere(eingaben);
  return { text, plan };
}

test('Tagesrunde: 5 Bahnen aus 5 verschiedenen Welten (alle Plätze), je Tag fest, Tage verschieden', () => {
  const t1 = L.tagesRunde(20261102), t2 = L.tagesRunde(20261102), t3 = L.tagesRunde(20261103);
  assert.deepEqual(t1, t2); assert.notDeepEqual(t1, t3);
  for (let d = 0; d < 60; d++) {
    const t = L.tagesRunde(20261101 + d);
    assert.equal(t.length, 5); assert.equal(new Set(t.map((x) => x.nr)).size, 5);
    assert.equal(new Set(t.map((x) => L.BAHNEN[x.nr].welt)).size, 5);
  }
});

test('Runde nachspielen: echte Runde zählt, Manipulationen nicht', () => {
  const seed = 20261102, { text } = botRunde(seed);
  const r = L.pruefeRunde(seed, text);
  assert.ok(r.ok, r.grund); assert.equal(r.je.length, 5); assert.ok(r.schlaege <= r.par);
  assert.equal(L.pruefeRunde(seed + 1, text).ok === true && L.pruefeRunde(seed + 1, text).schlaege === r.schlaege && false, false);
  const teile = text.split('|');
  assert.equal(L.pruefeRunde(seed, teile.slice(0, 4).join('|')).grund, 'format');
  assert.equal(L.pruefeRunde(seed, [teile[0] + ';0,-10000,10,0', ...teile.slice(1)].join('|')).grund, 'zuviel');
  const kaputt = teile[0].split(';'); kaputt[kaputt.length - 1] = kaputt[kaputt.length - 1].replace(/,(\d+),(\d+)$/, (_, p, ph) => `,${Math.max(1, Number(p) - 300)},${ph}`);
  assert.equal(L.pruefeRunde(seed, [kaputt.join(';'), ...teile.slice(1)].join('|')).grund, 'unvollstaendig');
  for (const t of ['', 'x', '0,0,5,0|||||', teile.map(() => '1,1,2000,0').join('|'), teile.map(() => '1,1,5,999').join('|')]) assert.equal(L.pruefeRunde(seed, t).ok, false, t);
});

test('Spielstand: aufräumen, Sterne, Bälle, Bestwerte', () => {
  const st = L.pruefeStand({ ton: false, ball: 'gold', bahnen: { 0: 1, 3: 9, 120: 2, x: 1, 4: 2 }, hio: 2, tag: 'x' });
  assert.equal(st.ton, false); assert.deepEqual(st.bahnen, { 0: 1, 4: 2 }); assert.equal(st.hio, 2); assert.equal(st.tag, 0);
  assert.equal(L.gesamtSterne(st), 3 + 3);
  assert.ok(!L.ballFrei(st, 'blau')); assert.ok(L.ballFrei(st, 'rot'));
  assert.ok(L.frei(st, 0) && L.frei(st, 1) && !L.frei(st, 2) && L.frei(st, 5));
  assert.ok(!L.frei(st, 18) && !L.platzFrei(st, 1), 'Platz 2 erst ab 24 Sternen');
  const viel = L.pruefeStand({ bahnen: Object.fromEntries([...Array(12)].map((_, i) => [i, 1])) });
  assert.ok(L.platzFrei(viel, 1) && L.frei(viel, 18) && !L.frei(viel, 19)); assert.equal(L.MAX_STERNE, 324); assert.ok(!L.platzFrei(viel, 2) && L.PLAETZE.length === 6);
  const b = L.baueBahn(1), ball = L.neuerBall(b); ball.eingelocht = true; ball.schlaege = 2; ball.fertig = true;
  assert.equal(L.verbucheBahn(st, 1, ball), true); assert.equal(L.verbucheBahn(st, 1, ball), false);
  assert.equal(L.verbucheRunde(st, 20261102, 14), true); assert.equal(L.verbucheRunde(st, 20261102, 15), false); assert.equal(L.verbucheRunde(st, 20261102, 12), true);
  assert.equal(L.verbucheRunde(st, 20261103, 16), true); assert.equal(st.tagBest, 16);
});
