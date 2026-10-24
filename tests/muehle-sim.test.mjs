// MÜHLE: Regeln und Computergegner ohne Browser. node --test tests/muehle-sim.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../public/spiele/muehle/engine.js';

// Stellung von Hand bauen: hell/dunkel = Punktlisten, hand = [hell, dunkel]
function stellung(hell, dunkel, am = 1, hand = [0, 0]) {
  const s = E.neueStellung();
  // über echte Züge geht es nicht beliebig, daher direkt setzen und Schlüssel neu berechnen lassen
  const p = { b: new Int8Array(24), am, hand: [0, hand[0], hand[1]], brett: [0, hell.length, dunkel.length], ruhig: 0, h1: s.h1 ^ 1, h2: s.h2 ^ 1 };
  hell.forEach((i) => (p.b[i] = 1)); dunkel.forEach((i) => (p.b[i] = 2));
  return p;
}
const partieMit = (s) => ({ s, zuege: [], wdh: new Map() });

test('Brett: 24 Punkte, 16 Mühlen, Nachbarn symmetrisch', () => {
  assert.equal(E.PUNKTE.length, 24);
  assert.equal(E.MUEHLEN.length, 16);
  for (let i = 0; i < 24; i++) {
    assert.ok(E.NACHBARN[i].length >= 2 && E.NACHBARN[i].length <= 4);
    for (const j of E.NACHBARN[i]) assert.ok(E.NACHBARN[j].includes(i));
    assert.equal(E.MUEHLEN_AN[i].length, 2, 'jeder Punkt liegt in genau zwei Mühlen');
  }
  assert.deepEqual([...E.NACHBARN[4]].sort((a, b) => a - b), [1, 3, 5, 7]);
});

test('Setzphase: 24 Setzzüge, Mühle erlaubt Schlagen, geschützte Steine', () => {
  const p = E.neuePartie();
  assert.equal(E.zuege(p.s).length, 24);
  // Hell: 0, 1 · Dunkel: 9, 10 · Hell schließt 0-1-2
  for (const t of [0, 9, 1, 10]) assert.ok(E.spiele(p, { f: -1, t, r: -1 }));
  const mit = E.zuege(p.s).filter((m) => m.t === 2);
  assert.deepEqual(mit.map((m) => m.r).sort((a, b) => a - b), [9, 10]);
  assert.equal(E.spiele(p, { f: -1, t: 2, r: -1 }), false, 'Mühle ohne Schlagen ist kein gültiger Zug');
  assert.ok(E.spiele(p, { f: -1, t: 2, r: 9 }));
  assert.equal(p.s.brett[2], 1); assert.equal(p.s.hand[1], 6);
});

test('Steine in Mühlen sind geschützt, außer alle stehen in Mühlen', () => {
  const s = stellung([3, 4], [0, 1, 2, 21], 1, [5, 5]);
  const r = E.zuege(s).filter((m) => m.t === 5).map((m) => m.r);
  assert.deepEqual(r, [21]);
  const s2 = stellung([3, 4], [0, 1, 2], 1, [5, 6]);
  assert.deepEqual(E.zuege(s2).filter((m) => m.t === 5).map((m) => m.r).sort((a, b) => a - b), [0, 1, 2]);
});

test('Zugphase: nur auf Nachbarpunkte, mit 3 Steinen springen', () => {
  const s = stellung([0, 4, 22, 13], [9, 21, 19], 1);
  for (const m of E.zuege(s)) assert.ok(E.NACHBARN[m.f].includes(m.t));
  s.am = 2;
  const spr = E.zuege(s);
  assert.equal(spr.length, 3 * (24 - 7), 'Springen: jeder Stein auf jeden freien Punkt');
});

test('Verloren mit 2 Steinen und bei Blockade', () => {
  const s = stellung([0, 1, 4, 7], [9, 21], 2);
  assert.deepEqual(E.status(partieMit(s)), { ende: true, sieger: 1, grund: 'steine' });
  // Dunkel auf 0 und 2, eingeschlossen von 1, 9, 14 (hell) und weiteren
  const b = stellung([1, 9, 14, 5, 7], [0, 2, 21, 23], 2);
  // 21 kann nach 22, also noch nicht blockiert
  assert.equal(E.status(partieMit(b)).ende, false);
  const c = stellung([1, 9, 14, 22, 5, 7], [0, 2, 21, 23], 2);
  assert.deepEqual(E.status(partieMit(c)), { ende: true, sieger: 1, grund: 'blockiert' });
});

test('Mache/Zurücknehmen stellt Stellung und Schlüssel exakt wieder her', () => {
  const r = E.rng(5), p = E.neuePartie();
  for (let i = 0; i < 80 && !E.status(p).ende; i++) {
    const s = p.s, vorher = [Array.from(s.b), s.am, s.hand.join(), s.brett.join(), s.ruhig, s.h1, s.h2].join('|');
    for (const m of E.zuege(s)) { const u = E.mache(s, m); E.nimmZurueck(s, m, u); assert.equal([Array.from(s.b), s.am, s.hand.join(), s.brett.join(), s.ruhig, s.h1, s.h2].join('|'), vorher); }
    const z = E.zuege(s); E.spiele(p, z[Math.floor(r() * z.length)]);
  }
});

test('Kodierung: Partie hin und zurück, ungültige Texte abgelehnt', () => {
  const r = E.rng(9), p = E.neuePartie();
  for (let i = 0; i < 60 && !E.status(p).ende; i++) { const z = E.zuege(p.s); E.spiele(p, z[Math.floor(r() * z.length)]); }
  const t = E.partieText(p), q = E.partieAus(t);
  assert.ok(q); assert.equal(E.schluessel(q.s), E.schluessel(p.s));
  assert.equal(E.partieAus('aaa'), null, 'Setzen mit Herkunft geht nicht');
  assert.equal(E.partieAus('ya'), null);
  assert.equal(E.partieAus('yay' + 'yay'), null, 'Punkt doppelt belegt');
});

test('Remis bei dreifacher Wiederholung in der Zugphase', () => {
  // Hell 0,1,3 · Dunkel 21,22,18: beide schieben hin und her
  const s = stellung([0, 4, 13, 20], [9, 21, 22, 18], 1);
  const p = partieMit(s);
  const hin = [{ f: 13, t: 14, r: -1 }, { f: 22, t: 19, r: -1 }, { f: 14, t: 13, r: -1 }, { f: 19, t: 22, r: -1 }];
  let i = 0;
  while (!E.status(p).ende && i < 40) assert.ok(E.spiele(p, hin[i++ % 4]), 'Zug ' + i);
  assert.equal(E.status(p).grund, 'wiederholung');
  assert.equal(E.status(p).sieger, 0);
});

test('Computer nimmt eine sofortige Mühle und verhindert eine gegnerische', () => {
  const s = stellung([0, 1], [9, 10], 1, [7, 7]);
  for (const st of ['geuebt', 'meister']) { const m = E.kiZug(s, st, { zufall: E.rng(1), zeit: 300 }); assert.equal(m.t, 2, st + ' schließt die Mühle'); }
  const d = stellung([0, 1, 13], [9, 10], 2, [6, 7]);
  // Dunkel kann 11 nehmen (eigene Mühle) oder 2 blockieren; tiefer gerechnet sind beide gleichwertig
  assert.equal(E.kiZug(d, 'geuebt', { zufall: E.rng(2) }).t, 11);
  assert.ok([2, 11].includes(E.kiZug(d, 'meister', { zufall: E.rng(2), zeit: 300 }).t));
  const v = stellung([0, 1, 13], [9, 20], 2, [6, 7]);
  assert.equal(E.kiZug(v, 'geuebt', { zufall: E.rng(3) }).t, 2, 'Geübt blockiert die Mühle');
});

function partieZwischen(a, b, seed, zeit) {
  const r = E.rng(seed), p = E.neuePartie(), st = [null, a, b];
  for (let i = 0; i < 300; i++) {
    const s = E.status(p); if (s.ende) return s.sieger;
    const m = st[p.s.am] === 'zufall' ? E.zuege(p.s)[Math.floor(r() * E.zuege(p.s).length)] : E.kiZug(p.s, st[p.s.am], { zufall: r, gesehen: p.wdh, zeit });
    assert.ok(E.spiele(p, m), 'Computerzug muss erlaubt sein');
  }
  return 0;
}
function turnier(a, b, n, zeit) {
  const e = { [a]: 0, [b]: 0, remis: 0 };
  for (let i = 0; i < n; i++) { const tausch = i % 2; const w = partieZwischen(tausch ? b : a, tausch ? a : b, 500 + i, zeit); if (!w) e.remis++; else e[(w === 1) !== !!tausch ? a : b]++; }
  return e;
}

test('Stufen sind klar abgestuft', { timeout: 240000 }, () => {
  const g = turnier('gemuetlich', 'zufall', 10); assert.ok(g.gemuetlich >= 7, JSON.stringify(g));
  const m = turnier('geuebt', 'gemuetlich', 8); assert.ok(m.geuebt >= 7, JSON.stringify(m));
  const x = turnier('meister', 'geuebt', 4, 250); assert.ok(x.meister >= 3 && x.geuebt === 0, JSON.stringify(x));
});

test('Meister bleibt im Zeitlimit', () => {
  const p = E.neuePartie(), r = E.rng(4);
  for (let i = 0; i < 6; i++) { const t = Date.now(); E.spiele(p, E.kiZug(p.s, 'meister', { zufall: r, gesehen: p.wdh })); assert.ok(Date.now() - t < 1500); }
});
