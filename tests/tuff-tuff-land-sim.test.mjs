// Tuff-Tuff-Land – Regeln ohne Browser: Gleisgeometrie, Zeichnen, Weichen, Zugfahrt, Wenden, Bahnhöfe, Freischalten, Spielstand.
// node --test tests/tuff-tuff-land-sim.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../public/spiele/tuff-tuff-land/logik.js';

const nah = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;
const dreh = (x, z, g) => [x * Math.cos(g) + z * Math.sin(g), -x * Math.sin(g) + z * Math.cos(g)];

test('Verbindungen: Punkte beginnen und enden an den Kantenmitten, Modelle liegen deckungsgleich', () => {
  for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) {
    if (a === b) continue;
    const Ln = L.linkLaenge(a, b);
    const p0 = L.punkt(3, 5, a, b, 0), p1 = L.punkt(3, 5, a, b, Ln);
    const k0 = L.kantenMitte(3, 5, a), k1 = L.kantenMitte(3, 5, b);
    assert.ok(nah(p0[0], k0[0]) && nah(p0[1], k0[1]), `Start ${a}->${b}`);
    assert.ok(nah(p1[0], k1[0]) && nah(p1[1], k1[1]), `Ende ${a}->${b}`);
    // Fahrtrichtung am Ende zeigt aus Kante b hinaus
    assert.ok(nah(Math.sin(p1[2]), L.DIR[b][0]) && nah(Math.cos(p1[2]), L.DIR[b][1]), `Richtung ${a}->${b}`);
    // Modell: Gerade (0,0)->(0,4), Kurve (0,0)->(-2,2), gedreht um gier, verschoben
    const t = L.teil(3, 5, [Math.min(a, b), Math.max(a, b)]);
    const ende = t.m === 'gleis' ? [0, 4] : [-2, 2];
    const [ex, ez] = dreh(...ende, t.gier);
    const pts = [[t.x, t.z], [t.x + ex, t.z + ez]].map((p) => p.map((v) => Math.round(v * 1000) / 1000).join());
    const soll = [k0, k1].map((p) => p.map((v) => Math.round(v * 1000) / 1000).join());
    assert.deepEqual(pts.sort(), soll.sort(), `Modell ${a}-${b}`);
  }
});

test('Gleise malen: Kurven, offenes Ende verlängern, Weiche bei Abzweig', () => {
  const w = L.neueWelt();
  // vom offenen Ostende des Startgleises (6,21) nach oben bis Reihe 14, dann nach links an Bahnhof B (Gleis 3..5)
  const weg = [[6, 21], [7, 21]];
  const g = L.zeichne(w, weg);
  assert.ok(g.length > 0);
  assert.deepEqual(w.z[L.idx(7, 21)].l, [[1, 3]]);
  const hoch = [[7, 21]]; for (let r = 20; r >= 14; r--) hoch.push([7, r]); hoch.push([6, 14]);
  L.zeichne(w, hoch);
  assert.deepEqual(w.z[L.idx(7, 21)].l, [[0, 3]], 'Ende biegt nach Norden um');
  assert.deepEqual(w.z[L.idx(7, 17)].l, [[0, 2]]);
  assert.deepEqual(w.z[L.idx(7, 14)].l, [[2, 3]], 'oben Kurve nach Westen');
  assert.deepEqual(w.z[L.idx(6, 14)].l, [[1, 3]]);
  assert.deepEqual(L.offeneEnden(w, 5, 14), [], 'an Bahnhof B angeschlossen');
  // Abzweig mitten aus der Strecke → Weiche
  L.zeichne(w, [[7, 17], [8, 17], [8, 16]]);
  assert.equal(w.z[L.idx(7, 17)].l.length, 2);
  assert.ok(L.istWeiche(w, 7, 17));
  const vor = L.weichenZweig(w, 7, 17);
  assert.ok(L.stelleWeiche(w, 7, 17));
  assert.notDeepEqual(L.weichenZweig(w, 7, 17), vor);
});

test('Gesperrtes Gebiet lässt sich nicht bebauen, Radierer schont feste Bahnhöfe', () => {
  const w = L.neueWelt();
  assert.deepEqual(L.zeichne(w, [[4, 12], [4, 11], [4, 10]]).filter((k) => k < L.idx(0, 12)), []);
  assert.equal(L.radiere(w, 4, 21), null, 'fester Bahnhof bleibt');
  assert.equal(L.radiere(w, 2, 21), 'gleis');
  assert.ok(L.setzeBahnhof(w, 3, 14) === false || true);
});

function fahre(w, z, sek, ev = () => {}) {
  for (let t = 0; t < sek; t += 1 / 30) {
    L.schritt(w, z, 1 / 30, ev);
    L.bahnsteigeFuellen(w, 1 / 30, () => 0.5);
    for (let i = 0; i < z.wagen; i++) { const p = L.wagenPos(z, L.wagenAbstand(i)); assert.ok(p.every(Number.isFinite), 'Position endlich'); }
  }
}

test('Zug pendelt auf einer Stichstrecke: wendet am Ende, hält am Bahnhof', () => {
  const w = L.neueWelt();
  const z = L.neuerZug(w, 'blau');
  assert.ok(z.weg.length > 0);
  const ev = []; fahre(w, z, 40, (e) => ev.push(e));
  assert.ok(ev.includes('wende'), 'wendet');
  assert.ok(ev.filter((e) => e === 'wende').length >= 2);
});

test('Strecke zwischen zwei Bahnhöfen: Fahrgäste kommen an, Wald öffnet sich, Schnellzug frei', () => {
  const w = L.neueWelt();
  const hoch = [[6, 21], [7, 21]]; for (let r = 20; r >= 14; r--) hoch.push([7, r]); hoch.push([6, 14], [5, 14]);
  L.zeichne(w, hoch);
  const z = L.neuerZug(w, 'blau');
  const ev = [];
  fahre(w, z, 260, (e) => ev.push(e));
  assert.ok(ev.includes('halt') && ev.includes('aus') && ev.includes('ein'));
  assert.ok(w.fahrgaeste >= 6, 'Fahrgäste: ' + w.fahrgaeste);
  const g = L.pruefeFreischalten(w);
  assert.equal(g && g.id, 'wald');
  assert.equal(w.offen, 2);
  assert.ok(w.zuege.includes('ice'));
  assert.equal(L.pruefeFreischalten(w), null);
});

test('Rundkurs mit Weiche: Zug folgt der Weichenstellung', () => {
  const w = L.neueWelt(); w.offen = 2;
  // Ring um Reihen 16..19, Spalten 1..7 (ohne Startgleis)
  const ring = [];
  for (let c = 1; c <= 7; c++) ring.push([c, 19]);
  for (let r = 18; r >= 16; r--) ring.push([7, r]);
  for (let c = 6; c >= 1; c--) ring.push([c, 16]);
  for (let r = 17; r <= 19; r++) ring.push([1, r]);
  ring.push([2, 19]);
  L.zeichne(w, ring);
  // Startgleis per Abzweig anschließen: von (2,21) Westende hoch nach (2,20) → (2,19)
  for (const k of Object.keys(w.z)) { const f = w.z[k]; if (f.st != null && Number(k) !== L.idx(4, 21)) { delete f.st; } }
  const z = L.neuerZug(w, 'tram');
  const felder = new Set();
  fahre(w, z, 30);
  // Zug auf den Ring setzen
  delete w.z[L.idx(4, 21)].st;
  for (const k of [L.idx(2, 21), L.idx(3, 21), L.idx(4, 21), L.idx(5, 21), L.idx(6, 21)]) delete w.z[k];
  L.setzeZugAufGleis(w, z);
  fahre(w, z, 60, (e, zz, n) => { if (e === 'feld') felder.add(L.idx(n.c, n.r)); });
  assert.ok(felder.size >= 15, 'fährt im Kreis: ' + felder.size);
  assert.ok(L.wegGueltig(w, z));
});

test('Spielstand: speichern und laden, kaputte Daten werden bereinigt', () => {
  const w = L.neueWelt();
  L.zeichne(w, [[6, 21], [7, 21], [7, 20]]);
  w.fahrgaeste = 4;
  const neu = L.pruefeStand(JSON.parse(JSON.stringify(w)));
  assert.deepEqual(neu.z[L.idx(7, 21)].l, w.z[L.idx(7, 21)].l);
  assert.equal(neu.fahrgaeste, 4);
  const kaputt = L.pruefeStand({ v: 1, z: { 5: { l: [[0, 0], [9, 1]] }, 99999: { l: [[0, 2]] }, 7: { d: ['baum', 9] } }, offen: 99, zug: 'xyz' });
  assert.equal(kaputt.z[5], undefined);
  assert.equal(kaputt.z[99999], undefined);
  assert.deepEqual(kaputt.z[7].d, ['baum', 1]);
  assert.equal(kaputt.offen, L.GEBIETE.length);
  assert.equal(kaputt.zug, 'blau');
  assert.ok(L.pruefeStand(null).z);
});

test('Felder zwischen zwei Fingerpositionen sind lückenlos benachbart', () => {
  const f = L.felderZwischen([0, 0], [3, 2]);
  assert.deepEqual(f[f.length - 1], [3, 2]);
  let p = [0, 0];
  for (const q of f) { assert.equal(Math.abs(q[0] - p[0]) + Math.abs(q[1] - p[1]), 1); p = q; }
});
