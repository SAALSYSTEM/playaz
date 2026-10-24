// DAME: Regeln und Computergegner ohne Browser. node --test tests/dame-sim.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../public/spiele/dame/engine.js';

const f = (r, c) => r * 8 + c;
const partieMit = (s) => ({ s, zuege: [], wdh: new Map() });

test('Startstellung: je 12 Steine auf dunklen Feldern, Hell hat 7 Züge', () => {
  const s = E.neueStellung();
  assert.deepEqual(E.zaehle(s, 1), { st: 12, da: 0, alle: 12 });
  assert.deepEqual(E.zaehle(s, 2), { st: 12, da: 0, alle: 12 });
  for (let i = 0; i < 64; i++) if (s.b[i]) assert.ok(E.spielbar(i));
  assert.equal(E.zuege(s).length, 7);
  assert.ok(E.zuege(s).every((m) => m.p[1] < m.p[0]), 'Hell zieht nach oben');
});

test('Schlagpflicht: wenn geschlagen werden kann, gibt es nur Schläge', () => {
  const s = E.aus({ [f(5, 2)]: 1, [f(4, 3)]: 2, [f(6, 7)]: 1 });
  const z = E.zuege(s);
  assert.equal(z.length, 1);
  assert.deepEqual(z[0], { p: [f(5, 2), f(3, 4)], x: [f(4, 3)] });
});

test('Steine schlagen auch rückwärts, ziehen aber nur vorwärts', () => {
  const s = E.aus({ [f(3, 2)]: 1, [f(4, 3)]: 2 });
  assert.deepEqual(E.zuege(s).map((m) => m.p), [[f(3, 2), f(5, 4)]]);
  const r = E.aus({ [f(3, 2)]: 1, [f(7, 0)]: 2 });
  assert.ok(E.zuege(r).every((m) => m.p[1] < m.p[0]));
});

test('Mehrfachschlag muss zu Ende geführt werden, Steine nicht doppelt überspringen', () => {
  const s = E.aus({ [f(7, 0)]: 1, [f(6, 1)]: 2, [f(4, 3)]: 2, [f(2, 3)]: 2, [f(0, 7)]: 2 });
  const z = E.zuege(s);
  assert.equal(z.length, 1);
  assert.deepEqual(z[0].p, [f(7, 0), f(5, 2), f(3, 4), f(1, 2)]);
  assert.deepEqual(z[0].x, [f(6, 1), f(4, 3), f(2, 3)]);
});

test('Umwandlung zur Dame am Zugende, Dame zieht und schlägt weit', () => {
  const s = E.aus({ [f(1, 2)]: 1, [f(7, 7)]: 2 });
  const p = partieMit(s);
  assert.ok(E.spiele(p, { p: [f(1, 2), f(0, 1)] }));
  assert.equal(p.s.b[f(0, 1)], 3, 'Hell ist Dame');
  const d = E.aus({ [f(7, 0)]: 3, [f(4, 3)]: 2, [f(0, 1)]: 2 });
  const z = E.zuege(d);
  // Dame schlägt 4,3 aus der Ferne und darf auf 3,4 / 2,5 / 1,6 / 0,7 landen
  assert.deepEqual(z.map((m) => m.p[1]).sort((a, b) => a - b), [f(0, 7), f(1, 6), f(2, 5), f(3, 4)].sort((a, b) => a - b));
  assert.ok(z.every((m) => m.x[0] === f(4, 3)));
});

test('Stein, der beim Schlagen die Grundreihe erreicht und weiterschlagen kann, schlägt als Stein weiter', () => {
  // Hell auf 2,1 schlägt 1,2 -> landet 0,3; von dort kann ein Stein rückwärts 1,4 -> 2,5 schlagen
  const s = E.aus({ [f(2, 1)]: 1, [f(1, 2)]: 2, [f(1, 4)]: 2 });
  const z = E.zuege(s);
  assert.equal(z.length, 1);
  assert.deepEqual(z[0].p, [f(2, 1), f(0, 3), f(2, 5)]);
  const p = partieMit(s); E.spiele(p, z[0]);
  assert.equal(p.s.b[f(2, 5)], 1, 'kein Dame, Zug endet nicht auf der Grundreihe');
});

test('Verloren ohne Steine oder ohne Zug', () => {
  const s = E.aus({ [f(5, 0)]: 1 }, 2);
  assert.deepEqual(E.status(partieMit(s)), { ende: true, sieger: 1, grund: 'keine' });
  // Dunkel auf 7,0 ist Stein (zieht nach unten) und hat keinen Zug
  const b = E.aus({ [f(7, 0)]: 2, [f(0, 1)]: 1 }, 2);
  assert.equal(E.status(partieMit(b)).grund, 'blockiert');
});

test('Mache/Zurücknehmen exakt, Kodierung hin und zurück', () => {
  const r = E.rng(5), p = E.neuePartie();
  for (let i = 0; i < 120 && !E.status(p).ende; i++) {
    const s = p.s, vorher = [Array.from(s.b), s.am, s.ruhig, s.h1, s.h2].join('|');
    for (const m of E.zuege(s)) { const u = E.mache(s, m); E.nimmZurueck(s, m, u); assert.equal([Array.from(s.b), s.am, s.ruhig, s.h1, s.h2].join('|'), vorher); }
    const z = E.zuege(s); E.spiele(p, z[Math.floor(r() * z.length)]);
  }
  const q = E.partieAus(E.partieText(p));
  assert.ok(q); assert.equal(E.schluessel(q.s), E.schluessel(p.s));
  assert.equal(E.partieAus('AB'), null);
  assert.ok(E.partieAus(''), 'leere Partie ist gültig');
});

test('Remis bei Wiederholung mit Damen', () => {
  const s = E.aus({ [f(7, 0)]: 3, [f(0, 1)]: 4 });
  const p = partieMit(s); p.wdh.set(E.schluessel(s), 1);
  const z = [[f(7, 0), f(6, 1)], [f(0, 1), f(1, 0)], [f(6, 1), f(7, 0)], [f(1, 0), f(0, 1)]];
  let i = 0;
  while (!E.status(p).ende && i < 20) assert.ok(E.spiele(p, { p: z[i++ % 4] }));
  assert.equal(E.status(p).grund, 'wiederholung');
});

test('Computer nimmt freie Steine und gibt keinen geschenkt', () => {
  // Hell kann 3,4 schlagen oder sicher ziehen: Pflicht – aber Auswahl zwischen zwei Schlägen, einer verliert sofort eine Dame
  const s = E.aus({ [f(5, 2)]: 1, [f(5, 6)]: 1, [f(4, 3)]: 2, [f(4, 5)]: 2, [f(2, 7)]: 2, [f(0, 1)]: 2 });
  for (const st of ['geuebt', 'meister']) { const m = E.kiZug(s, st, { zufall: E.rng(1), zeit: 300 }); assert.ok(m.x.length === 1, st); }
});

function partieZwischen(a, b, seed, zeit) {
  const r = E.rng(seed), p = E.neuePartie(), st = [null, a, b];
  for (let i = 0; i < 300; i++) {
    const s = E.status(p); if (s.ende) return s.sieger;
    const z = E.zuege(p.s);
    const m = st[p.s.am] === 'zufall' ? z[Math.floor(r() * z.length)] : E.kiZug(p.s, st[p.s.am], { zufall: r, gesehen: p.wdh, zeit });
    assert.ok(E.spiele(p, m), 'Computerzug muss erlaubt sein');
  }
  return 0;
}
function turnier(a, b, n, zeit) {
  const e = { [a]: 0, [b]: 0, remis: 0 };
  for (let i = 0; i < n; i++) { const tausch = i % 2; const w = partieZwischen(tausch ? b : a, tausch ? a : b, 700 + i, zeit); if (!w) e.remis++; else e[(w === 1) !== !!tausch ? a : b]++; }
  return e;
}
test('Stufen sind klar abgestuft', { timeout: 300000 }, () => {
  const g = turnier('gemuetlich', 'zufall', 8); assert.ok(g.gemuetlich >= 7, JSON.stringify(g));
  const m = turnier('geuebt', 'gemuetlich', 8); assert.ok(m.geuebt >= 6 && m.gemuetlich <= 1, JSON.stringify(m));
  const x = turnier('meister', 'geuebt', 4, 300); assert.ok(x.meister >= 2 && x.geuebt === 0, JSON.stringify(x));
});

test('Meister bleibt im Zeitlimit', () => {
  const p = E.neuePartie(), r = E.rng(4);
  for (let i = 0; i < 6; i++) { const t = Date.now(); E.spiele(p, E.kiZug(p.s, 'meister', { zufall: r, gesehen: p.wdh })); assert.ok(Date.now() - t < 1500); }
});
