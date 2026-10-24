// HALMA: Regeln und Computergegner ohne Browser. node --test tests/halma-sim.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../public/spiele/halma/engine.js';

const f = (r, c) => r * 16 + c;
// Stellung aus Start: die ersten Steine werden in die Mitte gesetzt, der Rest bleibt in den Ecken (weit weg)
function mitte(hell, dunkel, am = 1) {
  const s = E.neueStellung();
  for (const [p, liste] of [[1, hell], [2, dunkel]]) {
    liste.forEach(([r, c], k) => { s.b[s.st[p][k]] = 0; s.st[p][k] = f(r, c); });
    liste.forEach(([r, c]) => { s.b[f(r, c)] = p; });
  }
  s.am = am; E.neuBerechnen(s);
  return s;
}
const ziele = (s, r, c) => E.zielfelder(s, f(r, c)).sort((a, b) => a - b);

test('Startstellung: je 19 Steine in der Ecke, Ziel ist das gegenüberliegende Lager', () => {
  const s = E.neueStellung();
  assert.equal(E.LAGER[1].length, 19); assert.equal(E.LAGER[2].length, 19);
  assert.equal(new Set([...E.LAGER[1], ...E.LAGER[2]]).size, 38, 'Lager überschneiden sich nicht');
  assert.deepEqual([...E.LAGER[1]].sort(), [...E.ZIEL[2]].sort());
  assert.ok(E.LAGER[1].includes(f(15, 0)) && E.LAGER[1].includes(f(11, 0)) && E.LAGER[1].includes(f(15, 4)) && !E.LAGER[1].includes(f(15, 5)));
  assert.ok(E.LAGER[2].includes(f(0, 15)) && E.LAGER[2].includes(f(0, 11)) && !E.LAGER[2].includes(f(0, 10)));
  assert.equal(s.b.filter((v) => v === 1).length, 19); assert.equal(s.b.filter((v) => v === 2).length, 19);
  assert.equal(E.imZielAnzahl(s, 1), 0); assert.equal(s.am, 1);
  assert.ok(E.zuege(s).length > 0);
});

test('Schritt in alle acht Richtungen, nur auf freie Felder', () => {
  const s = mitte([[8, 8]], []);
  assert.deepEqual(ziele(s, 8, 8), [f(7, 7), f(7, 8), f(7, 9), f(8, 7), f(8, 9), f(9, 7), f(9, 8), f(9, 9)]);
  const t = mitte([[8, 8], [8, 9]], []);
  assert.ok(!ziele(t, 8, 8).includes(f(8, 9)));
});

test('Sprung über einen Stein (eigen oder gegnerisch), nicht über zwei, nicht auf ein besetztes Feld', () => {
  const s = mitte([[8, 8], [8, 9]], [[9, 8]]);
  const z = ziele(s, 8, 8);
  assert.ok(z.includes(f(8, 10)), 'über den eigenen Stein');
  assert.ok(z.includes(f(10, 8)), 'über den gegnerischen Stein');
  const zwei = mitte([[8, 8], [8, 9], [8, 10]], []);
  assert.ok(!ziele(zwei, 8, 8).includes(f(8, 11)) && !ziele(zwei, 8, 8).includes(f(8, 10)), 'zwei Steine hintereinander sind gesperrt');
  const blockiert = mitte([[8, 8], [8, 9], [8, 10]], []);
  assert.ok(!ziele(blockiert, 8, 8).includes(f(8, 10)));
  assert.ok(E.zielfelder(s, f(5, 5)).length === 0, 'leeres Feld hat keine Züge');
});

test('Sprungkette über mehrere Steine, Weg mit Zwischenlandungen, Kette darf zurückführen', () => {
  const s = mitte([[8, 4], [8, 5], [7, 7], [6, 8]], [[5, 5]]);
  // (8,4) springt über (8,5) nach (8,6); über (7,7) nach (6,8)? besetzt -> nein. Dafür von (8,6) über (7,7) nach (6,8) nicht, aber über (7,6)? leer.
  const t = mitte([[8, 4], [8, 5], [8, 7], [6, 8]], [[7, 9]]);
  // (8,4) -> (8,6) [über (8,5)] -> (8,8) [über (8,7)] -> (6,10) [über (7,9)]
  const z = ziele(t, 8, 4);
  assert.ok(z.includes(f(8, 6)) && z.includes(f(8, 8)) && z.includes(f(6, 10)), 'Dreierkette');
  assert.deepEqual(E.weg(t, f(8, 4), f(6, 10)), [f(8, 4), f(8, 6), f(8, 8), f(6, 10)]);
  assert.deepEqual(E.weg(t, f(8, 4), f(7, 4)), [f(8, 4), f(7, 4)], 'einfacher Schritt');
  assert.ok(s.b[f(8, 4)] === 1);
});

test('Zug machen und zurücknehmen stellt alles exakt wieder her, auch Zähler', () => {
  const r = E.rng(5), p = E.neuePartie();
  for (let i = 0; i < 60; i++) {
    const l = E.zuege(p.s), m = l[Math.floor(r() * l.length)];
    const vor = E.kopie(p.s), key = E.schluessel(p.s);
    E.mache(p.s, m);
    const frisch = E.kopie(p.s); E.neuBerechnen(frisch);
    assert.ok(Math.abs(frisch.sc[1] - p.s.sc[1]) < 1e-6 && Math.abs(frisch.sc[2] - p.s.sc[2]) < 1e-6, 'Fortschrittssumme stimmt');
    assert.deepEqual(frisch.g, p.s.g);
    E.nimmZurueck(p.s, m);
    assert.equal(E.schluessel(p.s), key); assert.ok(Math.abs(p.s.sc[1] - vor.sc[1]) < 1e-6 && Math.abs(p.s.sc[2] - vor.sc[2]) < 1e-6); assert.deepEqual(p.s.g, vor.g);
    E.mache(p.s, m);
  }
});

test('Partie: Kodierung hin und zurück, ungültige Texte werden abgelehnt', () => {
  const r = E.rng(9), p = E.neuePartie();
  for (let i = 0; i < 80; i++) { const l = E.zuege(p.s), m = l[Math.floor(r() * l.length)]; assert.ok(E.spiele(p, m)); }
  const q = E.partieAus(E.partieText(p));
  assert.ok(q); assert.equal(E.schluessel(q.s), E.schluessel(p.s)); assert.equal(q.zuege.length, 80);
  assert.equal(E.partieAus('aaab'), null, 'Feld ist keine Figur oder unerlaubt');
  assert.equal(E.partieAus('abc'), null);
  assert.equal(E.partieAus('zzzz'), null);
  assert.ok(!E.spiele(E.neuePartie(), { v: f(0, 15), n: f(1, 14) }), 'Dunkel darf nicht anfangen');
});

function ziel(eigen, fremd) {   // Hell: `eigen` Steine im Ziel, Dunkel: `fremd` Steine ebenfalls dort, alle anderen mitten auf dem Brett
  const s = E.neueStellung(); s.b.fill(0);
  const z = E.ZIEL[1];
  for (let k = 0; k < 19; k++) { const i = k < eigen ? z[k] : f(4 + (k >> 4), k & 15); s.st[1][k] = i; s.b[i] = 1; }
  for (let k = 0; k < 19; k++) { const i = k < fremd ? z[eigen + k] : f(10 + (k >> 4), k & 15); s.st[2][k] = i; s.b[i] = 2; }
  E.neuBerechnen(s); return s;
}
test('Sieg: alle 19 im Ziel, oder volles Ziel mit höchstens zwei Fremden; mit drei Fremden noch nicht', () => {
  const s = ziel(19, 0);
  assert.ok(E.hatGewonnen(s, 1)); assert.ok(!E.hatGewonnen(s, 2));
  assert.deepEqual(E.status({ s }), { ende: true, sieger: 1, grund: 'ziel' });
  assert.ok(E.hatGewonnen(ziel(17, 2), 1), '17 eigene + 2 Blockierer reichen');
  assert.ok(!E.hatGewonnen(ziel(16, 3), 1), '16 eigene + 3 Fremde noch nicht');
  assert.ok(!E.hatGewonnen(ziel(17, 1), 1), 'ein Feld ist noch frei');
});

test('Zu lange Partien enden remis', () => {
  const p = E.neuePartie(); p.s.n = E.MAX_ZUEGE * 2;
  assert.deepEqual(E.status(p), { ende: true, sieger: 0, grund: 'zulang' });
});

function partieZwischen(a, b, seed) {
  const r = E.rng(seed), p = E.neuePartie(), st = [null, a, b];
  for (;;) {
    const s = E.status(p); if (s.ende) return s.sieger;
    const m = st[p.s.am] === 'zufall' ? (() => { const l = E.zuege(p.s); return l[Math.floor(r() * l.length)]; })() : E.kiZug(p.s, st[p.s.am], { zufall: r, zeit: 120 });
    assert.ok(E.spiele(p, m));
  }
}
function turnier(a, b, n) {
  const e = { [a]: 0, [b]: 0, remis: 0 };
  for (let i = 0; i < n; i++) { const tausch = i % 2, w = partieZwischen(tausch ? b : a, tausch ? a : b, 700 + i); if (!w) e.remis++; else e[(w === 1) !== !!tausch ? a : b]++; }
  return e;
}
test('Stufen: Geübt schlägt Gemütlich, Meister schlägt Geübt, Gemütlich schlägt den Zufall', { timeout: 900000 }, () => {
  const g = turnier('gemuetlich', 'zufall', 4); assert.ok(g.gemuetlich >= 3, JSON.stringify(g));
  const m = turnier('geuebt', 'gemuetlich', 6); assert.ok(m.geuebt >= 5, JSON.stringify(m));
  const x = turnier('meister', 'geuebt', 4); assert.ok(x.meister >= 3, JSON.stringify(x));
});

test('Meister bleibt im Zeitlimit', () => {
  const p = E.neuePartie(), r = E.rng(3); let max = 0;
  for (let i = 0; i < 24; i++) {
    const t0 = Date.now(), m = E.kiZug(p.s, 'meister', { zufall: r }); max = Math.max(max, Date.now() - t0);
    assert.ok(E.spiele(p, m));
  }
  assert.ok(max < 1500, 'max ' + max + ' ms');
});
