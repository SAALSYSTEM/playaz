// BACKGAMMON: Regeln und Computergegner ohne Browser. node --test tests/backgammon-sim.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../public/spiele/backgammon/engine.js';

function st(hell, dunkel, opts = {}) {   // hell/dunkel: { punkt: anzahl }
  const s = { pt: new Int8Array(24), bar: [0, opts.barH || 0, opts.barD || 0], off: [0, opts.offH || 0, opts.offD || 0], am: opts.am || 1 };
  for (const [i, n] of Object.entries(hell)) s.pt[i] = n;
  for (const [i, n] of Object.entries(dunkel)) s.pt[i] = -n;
  return s;
}
const summe = (s, p) => s.bar[p] + s.off[p] + Array.from(s.pt).reduce((a, v) => a + (p === 1 ? Math.max(0, v) : Math.max(0, -v)), 0);

test('Startstellung: je 15 Steine, 167 Augen', () => {
  const s = E.neueStellung();
  assert.equal(summe(s, 1), 15); assert.equal(summe(s, 2), 15);
  assert.equal(E.pips(s, 1), 167); assert.equal(E.pips(s, 2), 167);
});

test('Eröffnung 3-1: der Klassiker 8/5 6/5 ist dabei, alle Züge nutzen beide Würfel', () => {
  const z = E.zuege(E.neueStellung(), [3, 1]);
  assert.ok(z.every((x) => x.z.length === 2));
  assert.ok(z.some((x) => x.s.pt[4] === 2 && x.s.pt[7] === 2 && x.s.pt[5] === 4));
});

test('Pasch zieht viermal', () => {
  const z = E.zuege(E.neueStellung(), [6, 6]);
  assert.ok(z.length > 0 && z.every((x) => x.z.length === 4));
});

test('Gesperrte Punkte, Schlagen auf die Bande, Einsetzen zuerst', () => {
  const s = st({ 10: 1 }, { 7: 2, 8: 1 });
  const z = E.zuege(s, [3, 2]);
  assert.ok(z.every((x) => !x.z.some((m) => m.t === 7)), '7 ist gesperrt');
  assert.ok(z.some((x) => x.s.bar[2] === 1), 'Einzelstein auf 8 kann geschlagen werden');
  const b = st({ 10: 2 }, { 20: 2, 18: 1 }, { barH: 1 });
  for (const x of E.zuege(b, [4, 6])) assert.equal(x.z[0].f, E.BANDE, 'erst einsetzen');
  // 24-4 = 20 gesperrt, 24-6 = 18 Einzelstein -> nur mit der 6 einsetzen
  assert.ok(E.zuege(b, [4, 6]).every((x) => x.z[0].t === 18));
});

test('Geht nur ein Würfel, muss der höhere genommen werden', () => {
  // Hell hat einen Stein auf 13; mit der 2 geht es auf 11 (gesperrt), die 6 auf 7 ist frei, danach 7-2=5 gesperrt
  const s = st({ 13: 1, 0: 14 }, { 11: 2, 5: 2 });
  const z = E.zuege(s, [2, 6]);
  assert.equal(z.length, 1); assert.deepEqual(z[0].z.map((m) => [m.f, m.t]), [[13, 7]]);
});

test('Abtragen: erst wenn alle daheim, höherer Würfel nur ohne höhere Steine', () => {
  const s = st({ 2: 3, 4: 2, 12: 1 }, { 20: 2 });
  assert.ok(E.zuege(s, [6, 5]).every((x) => !x.z.some((m) => m.t === E.RAUS)), 'nicht alle daheim');
  const d = st({ 1: 2, 3: 1 }, { 20: 2 }, { offH: 12 });
  const z = E.zuege(d, [6, 5]);
  assert.ok(z.some((x) => x.z[0].f === 3 && x.z[0].t === E.RAUS), 'die 6 trägt vom höchsten Punkt ab');
  assert.ok(z.every((x) => !x.z.some((m) => m.f === 1 && m.t === E.RAUS && m.w === 6 && x.s.pt[3] > 0)));
});

test('Partie: Kodierung hin und zurück, Zufallspartien enden regelgerecht', () => {
  const r = E.rng(11);
  for (let n = 0; n < 15; n++) {
    const p = E.neuePartie(1 + (n % 2));
    for (let i = 0; i < 2000 && !E.status(p).ende; i++) {
      const w = E.wuerfeln(r), l = E.zuege(p.s, w);
      assert.ok(E.spiele(p, w, l[Math.floor(r() * l.length)].z));
      assert.equal(summe(p.s, 1), 15); assert.equal(summe(p.s, 2), 15);
    }
    assert.ok(E.status(p).ende, 'Partie endet');
    const q = E.partieAus(E.partieText(p));
    assert.ok(q); assert.equal(E.schluessel(q.s), E.schluessel(p.s));
  }
  assert.equal(E.partieAus('1:66AB'), null);
});

test('Gammon wird erkannt', () => {
  const s = st({}, { 3: 15 }, { offH: 15 });
  assert.deepEqual(E.status({ s }), { ende: true, sieger: 1, art: 3 });
  const g = st({}, { 20: 15 }, { offH: 15 });
  assert.equal(E.status({ s: g }).art, 2);
});

function partieZwischen(a, b, seed) {
  const r = E.rng(seed), p = E.neuePartie(1 + (seed % 2)), st = [null, a, b];
  for (let i = 0; i < 3000; i++) {
    const s = E.status(p); if (s.ende) return s.sieger;
    const w = E.wuerfeln(r);
    const z = st[p.s.am] === 'zufall' ? (() => { const l = E.zuege(p.s, w); return l[Math.floor(r() * l.length)].z; })() : E.kiZug(p.s, w, st[p.s.am], { zufall: r });
    assert.ok(E.spiele(p, w, z));
  }
  return 0;
}
function turnier(a, b, n) {
  const e = { [a]: 0, [b]: 0 };
  for (let i = 0; i < n; i++) { const tausch = i % 2; const w = partieZwischen(tausch ? b : a, tausch ? a : b, 900 + i); e[(w === 1) !== !!tausch ? a : b]++; }
  return e;
}
test('Stufen: Würfelglück, aber klar abgestuft', { timeout: 600000 }, () => {
  const g = turnier('gemuetlich', 'zufall', 20); assert.ok(g.gemuetlich >= 15, JSON.stringify(g));
  const m = turnier('geuebt', 'gemuetlich', 30); assert.ok(m.geuebt >= 17, JSON.stringify(m));
  const x = turnier('meister', 'geuebt', 24); assert.ok(x.meister >= 12, JSON.stringify(x));
});

test('Teilzüge in beliebiger Reihenfolge: jeder Stein, der ziehen kann, darf zuerst ziehen', () => {
  // Stellung aus einer echten Partie (Pasch 3): 6->3 schlägt den Einzelstein und muss erlaubt sein, egal in welcher Reihenfolge
  const s = st({ 12: 3, 19: 2, 21: 3, 6: 1, 5: 5, 4: 1 }, { 18: 4, 23: 3, 13: 2, 16: 2, 17: 2, 9: 1, 3: 1 });
  const alle = E.zuege(s, [3, 3], true);
  const erste = new Set(alle.map((x) => x.z[0].f + '>' + x.z[0].t));
  for (const v of ['6>3', '5>2', '4>1', '12>9']) assert.ok(erste.has(v), v + ' fehlt');
  // nach 4->1 darf 6->3 als zweiter Teilzug folgen
  assert.ok(alle.some((x) => x.z[0].f === 4 && x.z[0].t === 1 && x.z[1].f === 6 && x.z[1].t === 3));
  // und die Partie nimmt diese Reihenfolge an
  const p = E.neuePartie(1); p.s = s;
  const z = alle.find((x) => x.z[0].f === 6 && x.z[0].t === 3).z;
  assert.ok(E.spiele(p, [3, 3], z));
});
