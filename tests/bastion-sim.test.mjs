// Letzte Bastion – Regeln ohne Browser: Winkeltabelle, Hieb im Kegel, Nahkampf, Magier/Kugeln, Wellen, Upgrades,
// Kombo, Nachspielen (Rangliste), Balance mit Bots, Spielstand.  node --test tests/bastion-sim.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../public/spiele/letzte-bastion/logik.js';
import { botLauf } from '../tools/bastion-bot.mjs';

const kampf = (gegner = []) => { const f = L.neuerLauf(1); f.welle = 1; f.phase = 'kampf'; f.plan = []; f.gegner = gegner.map((g, i) => ({ id: 100 + i, art: 'diener', hp: 1, tot: false, aufstehen: 0, ausholen: 0, rueck: 0, zauber: 0, abstand: 0, ...g })); return f; };
const tick = (f, n, ein = {}) => { const ev = []; for (let i = 0; i < n && !f.tot; i++) ev.push(...L.schritt(f, L.DT, i === 0 ? { angriff: -1, wahl: -1, ...ein } : { angriff: -1, wahl: -1 })); return ev; };

test('Winkeltabelle: feste Werte, sin² + cos² = 1', () => {
  assert.equal(L.sin(30), 0.5); assert.equal(L.cos(60), 0.5); assert.equal(L.sin(90), 1); assert.equal(L.cos(180), -1); assert.equal(L.sin(-90), -1); assert.equal(L.sin(450), 1);
  for (let g = 0; g < 360; g++) assert.ok(Math.abs(L.sin(g) ** 2 + L.cos(g) ** 2 - 1) < 3e-6, String(g));
});

test('Hieb trifft nur im Blickkegel und in Reichweite', () => {
  const f = kampf([{ x: 0, z: -2 }, { x: 2, z: 0 }, { x: 0, z: -4 }, { x: 0, z: 2 }]);   // vorn, rechts, vorn zu weit, hinten
  const ev = tick(f, 1, { angriff: 0 });
  assert.deepEqual(f.gegner.map((e) => e.tot), [true, false, false, false]);
  assert.ok(ev.some((e) => e.typ === 'kill' && e.punkte === 10));
  // Abklingzeit: sofort danach kein zweiter Hieb
  tick(f, 1, { angriff: 90 }); assert.equal(f.gegner[1].tot, false);
  tick(f, Math.ceil(L.abklingzeit(f) * 60)); tick(f, 1, { angriff: 90 }); assert.equal(f.gegner[1].tot, true);
  // Krieger braucht zwei Treffer
  const k = kampf([{ art: 'krieger', hp: 2, x: 1, z: -1 }]);
  tick(k, 1, { angriff: 45 }); assert.equal(k.gegner[0].tot, false);
  tick(k, 30); tick(k, 1, { angriff: 45 }); assert.equal(k.gegner[0].tot, true);
});

test('Nahkampf: Skelett holt aus, trifft, wird zurückgestoßen; kurzer Schutz; bei 0 Herzen ist Schluss', () => {
  const f = kampf([{ x: 0, z: -3 }]);
  tick(f, 150); assert.ok(f.herzen < 3, 'getroffen'); const h = f.herzen;
  const l = Math.sqrt(f.gegner[0].x ** 2 + f.gegner[0].z ** 2); assert.ok(l > 1.5, 'zurückgestoßen');
  assert.equal(f.serie, 0);
  tick(f, 600); assert.ok(f.tot); assert.equal(f.herzen, 0); assert.equal(f.getroffenVon, 'diener');
  assert.ok(h === 2);
});

test('Magier: zaubert aus der Ferne, rückt nach jedem Zauber näher; Hieb zerstört Kugeln', () => {
  const f = kampf([{ art: 'magier', x: 0, z: -9, abstand: 6.5, zauber: 1.5 }]);
  const ev = tick(f, 60 * 6);
  assert.ok(ev.some((e) => e.typ === 'zauber'));
  assert.ok(f.gegner[0].abstand < 6.5);
  const RUHE = { x: 0, z: -40, aufstehen: 9999 };   // hält die Welle offen
  const g = kampf([RUHE]); g.kugeln = [{ id: 1, x: 0, z: -2.5, vx: 0, vz: 3.2, weg: false }];
  tick(g, 1, { angriff: 0 }); assert.ok(g.kugeln[0].weg); assert.equal(g.punkte, 2);
  const h = kampf([RUHE]); h.kugeln = [{ id: 1, x: 0, z: -2.5, vx: 0, vz: 3.2, weg: false }];
  tick(h, 60); assert.equal(h.herzen, 2, 'Kugel trifft ohne Hieb');
});

test('Welle geschafft → 3 Upgrades zur Wahl, Wahl wirkt; alles ausgebaut → direkt weiter', () => {
  const f = kampf([{ x: 0, z: -2 }]);
  const ev = tick(f, 2, { angriff: 0 });
  assert.ok(ev.some((e) => e.typ === 'geschafft'));
  assert.equal(f.phase, 'wahl'); assert.equal(f.wahl.length, 3); assert.equal(f.punkte, 10 + 50); assert.equal(f.gold, 1 + 1);
  const u = f.wahl[1]; tick(f, 1, { wahl: 1 }); assert.equal(f.up[u], 1); assert.equal(f.phase, 'pause');
  tick(f, 90); assert.equal(f.welle, 2); assert.equal(f.phase, 'kampf');
  const g = kampf([{ x: 0, z: -2 }]); for (const k of Object.keys(L.UPGRADES)) if (k !== 'heilen') g.up[k] = L.UPGRADES[k].max;
  tick(g, 2, { angriff: 0 }); assert.equal(g.phase, 'pause', 'ohne Auswahl weiter');
});

test('Kombo steigt alle 8 Treffer, ein Treffer am Helden setzt sie zurück', () => {
  assert.deepEqual([0, 7, 8, 16, 40, 99].map(L.kombo), [1, 1, 2, 3, 5, 5]);
});

test('Eingaben kodieren/dekodieren, kaputte Texte abgelehnt', () => {
  const e = [[0, 10], [5, 359], [9, 400], [500, 402]];
  assert.deepEqual(L.dekodiere(L.kodiere(e)), e);
  for (const x of ['1:360', '1:403', '1:399', '2:5,0:6', 'a', null]) assert.equal(L.dekodiere(x), null, String(x));
});

test('Nachspielen: echter Bot-Lauf wird bestätigt, Manipulationen abgelehnt', () => {
  const { lauf, f } = botLauf(20261101, 5, { reaktion: 12, fehler: 15 });
  assert.ok(f.tot && f.welle >= 5, JSON.stringify({ welle: f.welle, tot: f.tot }));
  const r = L.pruefeLauf(lauf); assert.equal(r.ok, true, JSON.stringify(r)); assert.equal(r.punkte, lauf.punkte);
  for (const [x, grund] of [[{ ...lauf, punkte: lauf.punkte + 10 }, 'abweichung'], [{ ...lauf, welle: lauf.welle + 1 }, 'abweichung'], [{ ...lauf, takte: lauf.takte - 1 }, 'kein_ende'],
    [{ ...lauf, takte: lauf.takte + 9 }, 'zu_lang'], [{ ...lauf, inputs: 'x' }, 'eingaben'], [{ ...lauf, v: 2 }, 'ungueltig'], [{ ...lauf, seed: lauf.seed + 1 }, null]]) {
    const q = L.pruefeLauf(x); assert.equal(q.ok, false, grund); if (grund) assert.equal(q.grund, grund);
  }
});

test('Balance: jeder Lauf endet; guter Spieler kommt weit, langsamer früh raus', () => {
  const gut = [], langsam = [];
  for (let s = 1; s <= 4; s++) {
    const a = botLauf(20261101 + s, 999, { reaktion: 12, fehler: 15 }).f; assert.ok(a.tot); gut.push(a.welle);
    const b = botLauf(20261101 + s, 999, { reaktion: 25, fehler: 30, traege: 0.5 }).f; assert.ok(b.tot); langsam.push(b.welle);
  }
  assert.ok(Math.min(...gut) >= 12, 'gut: ' + gut); assert.ok(Math.max(...gut) <= 45, 'gut: ' + gut);
  assert.ok(Math.max(...langsam) <= 12 && Math.min(...langsam) >= 2, 'langsam: ' + langsam);
});

test('Spielstand: prüfen, verbuchen, Tagesbestwert, freischalten', () => {
  assert.deepEqual(L.pruefeStand(null), L.leerStand());
  const st = L.pruefeStand({ gold: -1, helden: ['magier', 'x'], held: 'magier', ton: false });
  assert.deepEqual(st.helden, ['ritter', 'magier']); assert.equal(st.ton, false);
  const f = L.neuerLauf(1); f.punkte = 900; f.gold = 520; f.welle = 7; f.kills = 40;
  assert.equal(L.verbuche(st, f, 20261101), true); assert.equal(f.tagesBest, true); assert.equal(st.gold, 520); assert.equal(st.welle, 7);
  assert.equal(L.freischalten(st, 'barbar'), true); assert.equal(st.gold, 20);
  assert.equal(L.freischalten(st, 'schurke'), false);
});
