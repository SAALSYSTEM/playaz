// Schattenschritt – Regeln ohne Browser: Sicht, Schatten, Ausschalten, Rundgänge, Tor/Schlüssel, Sterne, Spielstand
// und alle Level mit dem Löser (lösbar, 3. Stern = kürzester Weg, alle Münzen erreichbar, Wachen machen etwas aus).
// node --test tests/schattenschritt-sim.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../public/spiele/schattenschritt/logik.js';

const lv = (karte, w = []) => L.baue({ name: 't', karte, w });
const geh = (f, weg) => { const ev = []; for (const c of weg) ev.push(...L.zug(f, 'NOSWw'.indexOf(c))); return ev; };

test('Karte: Rand, Start/Ziel nötig, unbekannte Zeichen und Wachen in Mauern werden abgelehnt', () => {
  assert.throws(() => lv(['...', '...']), /Start oder Ziel/);
  assert.throws(() => lv(['S.Z', '.?.']), /unbekannt/);
  assert.throws(() => lv(['S#Z'], [{ a: 'd', p: [1, 0], b: 'S' }]), /Mauer/);
  const f = L.neuerLauf(lv(['S.Z']));
  assert.deepEqual(L.zug(f, 0), [{ typ: 'blockiert', r: 0 }], 'Rand ist Mauer');
  assert.equal(f.zuege, 0, 'Blockierter Zug zählt nicht');
});

test('Sicht: gerade Linie bis zur Reichweite, Mauern verdecken; Schatten nur aus einem Feld', () => {
  const l = lv(['Z.....', 'S.#...', '......', ',,,,,.'], [{ a: 'd', p: [5, 1], b: 'W' }, { a: 'd', p: [5, 3], b: 'W' }]);
  const f = L.neuerLauf(l);
  assert.deepEqual(L.sichtfeld(f, 0).map((s) => s.x), [4, 3], 'Mauer bei x=2 verdeckt');
  assert.deepEqual(L.sichtfeld(f, 1).map((s) => [s.x, s.d]), [[4, 1], [3, 2], [2, 3]], 'Diener: 3 Felder');
  // Im Schatten 2 Felder vor der Wache: unsichtbar; 1 Feld davor: gesehen
  f.x = 3; f.y = 3; assert.equal(L.gesehenVon(f), -1);
  f.x = 4; assert.equal(L.gesehenVon(f), 1);
  // Sichtbar auf normalem Boden
  f.x = 4; f.y = 1; assert.equal(L.gesehenVon(f), 0);
});

test('In die Sicht laufen = erwischt; Zurück (Kopie) stellt den Zustand wieder her', () => {
  const l = lv(['Z...', '....', 'S...'], [{ a: 'd', p: [3, 1], b: 'W' }]);
  const f = L.neuerLauf(l), vorher = L.kopie(f);
  const ev = geh(f, 'N');
  assert.equal(f.status, 'erwischt'); assert.equal(f.von, 0); assert.ok(ev.some((e) => e.typ === 'erwischt'));
  assert.deepEqual(L.zug(f, 1), [], 'nach dem Erwischen keine Züge mehr');
  assert.equal(vorher.status, 'spiel'); assert.equal(vorher.y, 2);
});

test('Ausschalten von hinten/der Seite; Krieger und Magier lassen sich nicht ausschalten (blockieren)', () => {
  const l = lv(['Z.....', '......', 'S.....'], [{ a: 'd', p: [1, 2], b: 'O' }]);
  const f = L.neuerLauf(l);
  const ev = geh(f, 'O');   // von hinten (Wache schaut nach Osten, Schurke kommt von Westen)
  assert.ok(ev.some((e) => e.typ === 'ko')); assert.equal(f.ko[0], true); assert.equal(f.status, 'spiel');
  assert.deepEqual(L.sichtfeld(f, 0), [], 'ausgeschaltet sieht nichts');
  const k = L.neuerLauf(lv(['Z.....', '......', 'S.....'], [{ a: 'k', p: [1, 2], b: 'N' }]));
  assert.equal(L.zug(k, 1)[0].typ, 'blockiert'); assert.equal(k.x, 0);
  const m = L.neuerLauf(lv(['Z....', '.....', '.....', '.....', 'S....'], [{ a: 'm', p: [2, 2], b: 'N' }]));
  assert.deepEqual(L.sichtfeld(m, 0).map((s) => `${s.x},${s.y}`).sort(), ['0,2', '1,2', '2,0', '2,1', '2,3', '2,4', '3,2', '4,2'], 'Magier: 2 Felder in alle Richtungen');
});

test('Rundgang: hin und zurück, Blick in Laufrichtung; im Kreis; Drehen; Patrouille ausschalten', () => {
  const l = lv(['Z....', '.....', 'S....'], [{ a: 'd', p: [1, 0], r: 'OOO' }, { a: 'd', p: [0, 1], r: 'OSWN' }, { a: 'd', p: [4, 2], b: 'NW' }]);
  const pos = (i, t) => { const g = L.wache(l, i, t); return [g.x, g.y, 'NOSW'[g.b]]; };
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6].map((t) => pos(0, t).join('')), ['10O', '20O', '30O', '40W', '30W', '20W', '10O']);
  assert.deepEqual([0, 1, 2, 3, 4].map((t) => pos(1, t).join('')), ['01O', '11S', '12W', '02N', '01O']);
  assert.deepEqual([0, 1, 2].map((t) => pos(2, t)[2]), ['N', 'W', 'N']);
  assert.equal(l.waechter[1].kreis, true);
  // Patrouille von der Seite ausschalten: danach läuft und sieht sie nicht mehr
  const f = L.neuerLauf(lv(['Z...', '....', 'S...'], [{ a: 'd', p: [3, 0], r: 'SS' }]));
  geh(f, 'OO'); assert.equal(f.status, 'spiel');
  assert.ok(geh(f, 'O').some((e) => e.typ === 'ko')); assert.equal(f.ko[0], true);
  geh(f, 'NNWWW'); assert.equal(f.status, 'geschafft');
});

test('Schlüssel öffnet das Gittertor; Tor verdeckt die Sicht, solange es zu ist; Münzen und Sterne', () => {
  const l = lv(['ZT..', '#.o.', 'S..k']);
  const f = L.neuerLauf(l);
  geh(f, 'ON'); assert.deepEqual([f.x, f.y], [1, 1]);
  assert.equal(L.zug(f, 0)[0].typ, 'blockiert', 'Tor zu');
  geh(f, 'SOO'); assert.equal(f.schluessel, true);
  geh(f, 'NWNWW');
  assert.equal(f.status, 'geschafft'); assert.ok(L.alleMuenzen(f)); assert.equal(L.sterne(f), 2, 'Ausgang + Münzen, aber mehr Züge als zuege (0)');
  const g = L.neuerLauf({ ...l, zuege: 8 }); geh(g, 'OOONWNWW'); assert.equal(g.status, 'geschafft'); assert.equal(L.sterne(g), 3);
  const t = L.neuerLauf(lv(['Z.T..', '.....', 'S....'], [{ a: 'd', p: [4, 0], b: 'W' }]));
  assert.deepEqual(L.sichtfeld(t, 0).map((s) => s.x), [3], 'geschlossenes Tor verdeckt');
});

test('Alle Level: lösbar, 3. Stern = kürzester Weg, alle Münzen erreichbar, Start ungesehen, Wachen und neue Mechaniken zählen', () => {
  assert.equal(L.LEVEL.length, 24);
  const namen = new Set();
  L.LEVEL.forEach((d, i) => {
    const l = L.baue(d), r = L.loese(l, 80), was = `Level ${i + 1} ${d.name}`;
    assert.ok(!namen.has(d.name), was + ': Name doppelt'); namen.add(d.name);
    assert.ok(l.w <= 6 && l.h <= 10, was + ': zu groß fürs Handy');
    assert.equal(L.gesehenVon(L.neuerLauf(l)), -1, was + ': Start schon gesehen');
    assert.ok(r.kurz, was + ': nicht lösbar'); assert.ok(r.alle, was + ': nicht alle Münzen erreichbar');
    assert.equal(d.zuege, r.kurz.length, was + ': zuege passt nicht zum Löser');
    // Der gefundene Weg führt im Spiel wirklich zum Ziel
    const f = L.spiele(l, r.alle); assert.equal(f.status, 'geschafft', was); assert.ok(L.alleMuenzen(f));
    assert.equal(L.sterne(L.spiele(l, r.kurz)) >= 2 || l.muenzen.length > 0, true);
    if (l.waechter.length) assert.ok(L.loese({ ...l, waechter: [] }, 80).kurz.length < r.kurz.length, was + ': Wachen ändern nichts');
  });
  const brauch = (n, opt) => assert.equal(L.loese(L.baue(L.LEVEL[n - 1]), 80, opt).kurz, null, `Level ${n} geht ohne ${JSON.stringify(opt)}`);
  const geht = (n, opt) => assert.ok(L.loese(L.baue(L.LEVEL[n - 1]), 80, opt).kurz, `Level ${n} sollte ohne ${JSON.stringify(opt)} gehen`);
  geht(2, { ko: false }); geht(2, { warten: false });   // erste Wache: nur umgehen
  brauch(3, { ko: false });                              // Von hinten: Ausschalten nötig
  brauch(9, { schatten: false });                        // Im Schatten
  brauch(11, { tor: false });                            // Der Schlüssel (ohne Schlüssel bleibt das Tor zu)
});

test('Spielstand: prüfen, verbuchen (bester Wert bleibt), Level freischalten der Reihe nach', () => {
  assert.deepEqual(L.pruefeStand(null), L.leerStand());
  const st = L.pruefeStand({ sterne: [3, 'x', 9, -1], ton: false });
  assert.deepEqual(st.sterne, [3, 0, 3, 0]); assert.equal(st.ton, false);
  const s = L.leerStand();
  assert.equal(L.offen(s, 0), true); assert.equal(L.offen(s, 1), false);
  assert.equal(L.verbuche(s, 0, 2), true); assert.equal(L.offen(s, 1), true);
  assert.equal(L.verbuche(s, 0, 1), false); assert.equal(s.sterne[0], 2, 'schlechterer Versuch überschreibt nicht');
  assert.equal(L.verbuche(s, 0, 3), true); assert.equal(L.sterneGesamt(s), 3);
});
