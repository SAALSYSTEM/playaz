// SEITENWECHSEL: Regeln, Determinismus, Lösbarkeit und Prüfung (ohne Browser). Start: node --test tests/seitenwechsel-sim.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { neuerLauf, neuerKurs, nachfahren, pruefeLauf, kodiere, dekodiere, SIM_VERSION, V, PL, VF, W, SPIKE, MARGIN, TAPGAP } from '../public/spiele/seitenwechsel/sim.js';

// Einfacher Bot: wechselt rechtzeitig auf die freie Seite. Zeigt, dass die Kurse lösbar sind (auch spät mit engen Abständen).
// Regel: Der nächste Block verlangt die Gegenseite, bis die Figur ihn "fast" verlassen hat (14 Takte vor Ende darf sie schon losflitzen).
function bot(seed, maxTakte = 60 * 60 * 5, vorlauf = 40, frueh = 14) {
  const l = neuerLauf(seed); const tipps = [];
  while (l.s.t < maxTakte) {
    const p0 = l.s.t * V;
    let i = l.s.naechster, b = l.kurs.block(i);
    while (b.d1 - frueh * V <= p0) b = l.kurs.block(++i);
    const unterwegs = l.s.dir === -1 ? 0 : 1;            // Seite, zu der die Figur gerade unterwegs ist
    let tipp = false;
    if (b.d0 - p0 <= vorlauf * V && unterwegs === b.seite) tipp = true;
    if (tipp) tipps.push(l.s.t);
    if (!l.schritt(tipp)) break;
  }
  return { tipps, takte: l.s.t, tot: l.s.tot, punkte: l.punkte() };
}

test('Zufall und Kurs sind deterministisch und unterscheiden sich je Kurs', () => {
  const a = neuerKurs(20261021), b = neuerKurs(20261021), c = neuerKurs(20261022);
  const f = (k) => Array.from({ length: 40 }, (_, i) => JSON.stringify(k.block(i))).join('|');
  assert.equal(f(a), f(b)); assert.notEqual(f(a), f(c));
  assert.equal(a.block(0).seite, 1, 'der erste Stachel kommt von rechts, die Figur startet links: erster Wechsel nötig');
});

test('Ohne Tippen ist früh Schluss; Punkte = Takte / 6', () => {
  const l = neuerLauf(20261021); while (l.schritt(false)); assert.equal(l.s.tot, true);
  assert.ok(l.s.t > 60 && l.s.t < 400, 'erste Hürde trifft die Figur an der linken Wand: ' + l.s.t);
  assert.equal(l.punkte(), Math.floor(l.s.t / 6));
});

test('Mitte halten geht nicht: gegenüberliegende Stacheln lassen keinen Platz', () => {
  assert.ok(2 * (SPIKE - MARGIN) + PL > W, 'Zonen überlappen');
});

test('Bot schafft 30 Kurse mindestens 5 Minuten (Kurse sind lösbar, auch am Ende des Anstiegs)', () => {
  for (let k = 0; k < 30; k++) { const r = bot(20261000 + k, 60 * 60 * 5); assert.equal(r.tot, false, 'Kurs ' + k + ' Takt ' + r.takte); }
});

test('Nachfahren eines Bot-Laufs ergibt dasselbe Ergebnis, ebenso nach Kodierung', () => {
  const l = neuerLauf(20261021); const tipps = []; let k = 0;
  // Lauf mit festen Tippern, bis Ende
  const fest = [58, 120, 180, 260, 330];
  while (true) { const tipp = k < fest.length && fest[k] === l.s.t; if (tipp) { tipps.push(l.s.t); k++; } if (!l.schritt(tipp)) break; }
  const r = nachfahren(20261021, tipps);
  assert.equal(r.takte, l.s.t); assert.equal(r.punkte, l.punkte());
  const txt = kodiere(tipps); assert.deepEqual(dekodiere(txt), tipps);
  assert.equal(pruefeLauf({ v: SIM_VERSION, seed: 20261021, inputs: txt, ticks: l.s.t, score: l.punkte() }).ok, true);
});

test('Prüfung lehnt falsche Behauptungen ab (langer Lauf eines Bots, dann Fremdkurs/Änderungen)', () => {
  const b = bot(20261021, 60 * 60 * 2); assert.equal(b.tot, false);
  const l = neuerLauf(20261021); let k = 0;
  while (true) { const tipp = k < b.tipps.length && b.tipps[k] === l.s.t; if (tipp) k++; if (!l.schritt(tipp)) break; }
  // der Bot hört nach 2 Minuten auf zu tippen und stirbt am nächsten Block: ein echter, endender Lauf
  const gut = { v: SIM_VERSION, seed: 20261021, inputs: kodiere(b.tipps), ticks: l.s.t, score: l.punkte() };
  assert.ok(gut.score > 100); assert.equal(pruefeLauf(gut).ok, true);
  const mitFremdkurs = pruefeLauf({ ...gut, seed: 20261022 }); assert.equal(mitFremdkurs.ok, false, 'anderer Kurs ergibt anderes Ergebnis');
  for (const aender of [{ score: gut.score + 1 }, { ticks: gut.ticks + 6 }, { v: 2 }, { inputs: '1' }, { inputs: 'zz.!' }, { seed: 5 }, { inputs: '0.0' }, { inputs: kodiere(b.tipps.slice(0, -3)) }])
    assert.equal(pruefeLauf({ ...gut, ...aender }).ok, false, JSON.stringify(aender).slice(0, 80));
  assert.equal(pruefeLauf(null).ok, false);
});

test('Zu schnelles Tippen (unter Mindestabstand) wird ignoriert, nicht bestraft', () => {
  const a = nachfahren(20261021, [60]), b = nachfahren(20261021, [60, 61, 62]);
  assert.equal(a.takte, b.takte);
  assert.ok(TAPGAP >= 2 && VF > 0);
});
