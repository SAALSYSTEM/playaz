// SCHACH: Regeln und Computergegner ohne Browser. node --test tests/schach-sim.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../public/spiele/schach/engine.js';

const zug = (s, t) => { const m = E.zugAus(s, t); assert.notEqual(m, null, t + ' nicht erlaubt'); return m; };

test('Perft: Zuggenerator stimmt mit den bekannten Zahlen überein (Rochade, en passant, Umwandlung, Fesselung)', () => {
  const T = [[E.START, 4, 197281], ['r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1', 3, 97862],
    ['8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1', 5, 674624], ['r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1', 4, 422333],
    ['rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8', 3, 62379], ['r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10', 3, 89890]];
  for (const [fen, tiefe, n] of T) { const s = E.ausFen(fen); assert.equal(E.perft(s, tiefe), n, fen); assert.equal(E.zuFen(s), fen, 'Stellung unverändert'); }
});

test('Zug machen und zurücknehmen: Stellung und Schlüssel exakt wie vorher', () => {
  const s = E.neueStellung(), r = E.rng(4);
  for (let i = 0; i < 300; i++) {
    const z = E.zuege(s); if (!z.length) break;
    const m = z[Math.floor(r() * z.length)], fen = E.zuFen(s), h = [s.h1, s.h2];
    const u = E.mache(s, m); const frisch = E.ausFen(E.zuFen(s));
    assert.deepEqual([s.h1, s.h2], [frisch.h1, frisch.h2]);
    E.nimmZurueck(s, u); assert.equal(E.zuFen(s), fen); assert.deepEqual([s.h1, s.h2], h);
    E.mache(s, m);
  }
});

test('Schäfermatt, Patt, en passant, Rochade durch Schach verboten', () => {
  const p = E.partieAus('e2e4 e7e5 f1c4 b8c6 d1h5 g8f6 h5f7');
  assert.ok(p); assert.deepEqual(E.status(p), { ende: true, sieger: 1, grund: 'matt' });
  const patt = { s: E.ausFen('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1'), wdh: new Map() };
  assert.deepEqual(E.status(patt), { ende: true, sieger: 0, grund: 'patt' });
  const ep = E.partieAus('e2e4 a7a6 e4e5 d7d5');
  assert.ok(E.zugAus(ep.s, 'e5d6'), 'en passant erlaubt'); E.spiele(ep, zug(ep.s, 'e5d6'));
  assert.equal(ep.s.b[E.feldAus('d5')], 0, 'geschlagener Bauer ist weg');
  const ro = E.ausFen('r3k2r/8/8/8/8/8/8/R3K1r1 w Qkq - 0 1');
  assert.equal(E.zugAus(ro, 'e1g1'), null, 'kein Recht mehr'); assert.equal(E.zugAus(ro, 'e1c1'), null, 'König steht im Schach');
  const frei = E.ausFen('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
  E.mache(frei, zug(frei, 'e1g1')); assert.equal(frei.b[E.feldAus('f1')], E.TURM, 'Turm springt mit');
  const durch = E.ausFen('4k3/8/8/8/8/8/5r2/R3K2R w KQ - 0 1');
  assert.equal(E.zugAus(durch, 'e1g1'), null, 'f1 wird angegriffen');
});

test('Umwandlung mit Wahl, Notation auf Deutsch', () => {
  const s = E.ausFen('1n5k/P7/8/8/8/8/8/4K3 w - - 0 1');
  const um = E.zuege(s).filter((m) => E.von(m) === E.feldAus('a7'));
  assert.equal(um.length, 8, 'a8 und b8 je vier Figuren');
  assert.equal(E.notation(s, zug(s, 'a7b8q')), 'axb8=D+');
  assert.equal(E.notation(s, zug(s, 'a7a8n')), 'a8=S');
  const t = E.ausFen('4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1');
  assert.equal(E.notation(t, zug(t, 'e1g1')), 'O-O'); assert.equal(E.notation(t, zug(t, 'a1d1')), 'Td1', 'h1 ist vom König versperrt');
  const zwei = E.ausFen('k7/8/8/8/8/8/4K3/R6R w - - 0 1');
  assert.equal(E.notation(zwei, zug(zwei, 'a1d1')), 'Tad1');
  assert.equal(E.notation(E.neueStellung(), zug(E.neueStellung(), 'g1f3')), 'Sf3');
});

test('Remis: Wiederholung, 50 Züge, zu wenig Material', () => {
  const p = E.partieAus('g1f3 g8f6 f3g1 f6g8 g1f3 g8f6 f3g1 f6g8');
  assert.deepEqual(E.status(p), { ende: true, sieger: 0, grund: 'wiederholung' });
  assert.equal(E.status({ s: E.ausFen('4k3/8/8/8/8/8/4R3/4K3 w - - 100 80'), wdh: new Map() }).grund, 'fuenfzig');
  assert.equal(E.status({ s: E.ausFen('4k3/8/8/8/8/8/3N4/4K3 w - - 0 1'), wdh: new Map() }).grund, 'material');
  assert.equal(E.status({ s: E.ausFen('4k3/8/8/8/8/8/3P4/4K3 w - - 0 1'), wdh: new Map() }).ende, false);
});

test('Partie: Text hin und zurück, ungültige Züge abgelehnt', () => {
  const r = E.rng(8), p = E.neuePartie();
  for (let i = 0; i < 120 && !E.status(p).ende; i++) { const z = E.zuege(p.s); assert.ok(E.spiele(p, z[Math.floor(r() * z.length)])); }
  const q = E.partieAus(E.partieText(p));
  assert.ok(q); assert.equal(E.zuFen(q.s), E.zuFen(p.s));
  assert.equal(E.partieAus('e2e5'), null); assert.equal(E.partieAus('e7e5'), null); assert.equal(E.partieAus('xx'), null);
});

test('Computer findet Matt in eins und schlägt eine hängende Dame', () => {
  for (const st of ['geuebt', 'meister']) {
    const s = E.ausFen('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1');
    assert.equal(E.zugText(E.kiZug(s, st, { zufall: E.rng(1), zeit: 300 })), 'a1a8', st);
    const d = E.ausFen('4k3/8/8/3q4/8/8/8/3RK3 w - - 0 1');
    assert.equal(E.zugText(E.kiZug(d, st, { zufall: E.rng(1), zeit: 300 })), 'd1d5', st);
  }
});

function partieZwischen(a, b, seed) {
  const r = E.rng(seed), p = E.neuePartie(), st = [null, a, b];
  for (let i = 0; i < 300; i++) {
    const s = E.status(p); if (s.ende) return s.sieger;
    const wer = st[p.s.am];
    const m = wer === 'zufall' ? (() => { const z = E.zuege(p.s); return z[Math.floor(r() * z.length)]; })() : E.kiZug(p.s, wer, { zufall: r, gesehen: p.wdh, verlauf: E.partieText(p), zeit: wer === 'meister' ? 150 : undefined });
    assert.ok(E.spiele(p, m));
  }
  return 0;
}
function turnier(a, b, n) {
  const e = { [a]: 0, [b]: 0, remis: 0 };
  for (let i = 0; i < n; i++) { const tausch = i % 2, w = partieZwischen(tausch ? b : a, tausch ? a : b, 300 + i); if (!w) e.remis++; else e[(w === 1) !== !!tausch ? a : b]++; }
  return e;
}
test('Stufen: Gemütlich schlägt den Zufall, Geübt schlägt Gemütlich, Meister schlägt Geübt', { timeout: 900000 }, () => {
  const g = turnier('gemuetlich', 'zufall', 4); assert.ok(g.gemuetlich >= 3, JSON.stringify(g));
  const m = turnier('geuebt', 'gemuetlich', 6); assert.ok(m.geuebt >= 5, JSON.stringify(m));
  const x = turnier('meister', 'geuebt', 6); assert.ok(x.meister >= 4, JSON.stringify(x));
});

test('Meister bleibt im Zeitlimit, Eröffnungsbuch liefert erlaubte Züge', () => {
  const p = E.neuePartie(), r = E.rng(3); let max = 0;
  for (let i = 0; i < 16; i++) {
    const t0 = Date.now(), m = E.kiZug(p.s, 'meister', { zufall: r, gesehen: p.wdh, verlauf: E.partieText(p) }); max = Math.max(max, Date.now() - t0);
    assert.ok(E.spiele(p, m));
  }
  assert.ok(max < 1600, 'max ' + max + ' ms');
});
