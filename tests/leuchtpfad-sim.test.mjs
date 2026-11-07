// LEUCHTPFAD: alle 30 Level (Weg gültig, eindeutig, Irrlichter neben dem Weg), Nachlaufen, Sterne, Zeigen, Rekordpfad, Spielstand.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../public/spiele/leuchtpfad/engine.js';
import { LEVELS, LEVEL_COUNT, WELTEN } from '../public/spiele/leuchtpfad/levels.js';

const beruehrt = (p, c, r) => p.some((x, i) => E.nachbarn(x, c, r).some((m) => { const j = p.indexOf(m); return j !== -1 && Math.abs(j - i) > 1; }));

function pruefeBrett(b, def, name) {
  const { path, cols, rows } = b;
  assert.equal(path.length, def.len, name + ': Länge');
  assert.equal(new Set(path).size, path.length, name + ': kein Stein doppelt');
  for (const x of path) assert.ok(x >= 0 && x < cols * rows, name + ': im Feld');
  for (let i = 1; i < path.length; i++) assert.ok(E.benachbart(path[i - 1], path[i], cols), name + `: Schritt ${i} nur waagrecht/senkrecht`);
  assert.equal(E.zeile(path[0], cols), rows - 1, name + ': Start unten');
  assert.ok(E.zeile(path.at(-1), cols) < rows - 1, name + ': Pilzhaus weiter oben');
  assert.ok(!beruehrt(path, cols, rows), name + ': Weg berührt sich nicht selbst');
  assert.ok(E.knicke(path, cols) >= E.mindestKnicke(def.len), name + ': genug Knicke');
  assert.equal(b.irr.length, def.irr || 0, name + ': Anzahl Irrlichter');
  for (const ir of b.irr) {
    assert.ok(!path.includes(ir.cell), name + ': Irrlicht nicht auf dem Weg');
    assert.ok(E.benachbart(ir.cell, path[ir.an], cols), name + ': Irrlicht zweigt vom Weg ab');
    assert.ok(!E.benachbart(ir.cell, path[0], cols), name + ': Irrlicht nicht neben dem Start');
  }
}

test('30 Level in 3 Welten, steigende Schwierigkeit', () => {
  assert.equal(LEVEL_COUNT, 30);
  assert.deepEqual(WELTEN.map((w) => [w.von, w.bis]), [[1, 10], [11, 20], [21, 30]]);
  for (const def of LEVELS) {
    assert.ok(def.len >= 3 && def.len <= def.c * def.r / 2, def.id + ': Länge passt ins Feld');
    assert.ok(def.r > def.c, def.id + ': Hochformat');
    assert.ok(def.step >= 300 && def.hold >= 400, def.id + ': nicht zu schnell');
  }
  assert.equal(LEVELS[0].len, 3); assert.ok(LEVELS[0].hold >= 2000, 'Level 1 für Vierjährige: kurz und lange sichtbar');
  for (let i = 0; i < 10; i++) assert.equal(LEVELS[i].irr + LEVELS[i].spur, 0, 'Blumenwiese ohne Irrlichter und Spur');
  assert.ok(LEVELS.slice(20).every((d) => d.irr > 0), 'Mondsee mit Irrlichtern');
});

test('jeder Level-Weg ist gültig und auf jedem Gerät gleich', () => {
  for (const def of LEVELS) {
    const b = E.brett(def);
    pruefeBrett(b, def, 'Level ' + def.id);
    assert.deepEqual(E.brett(def).path, b.path, def.id + ': gleicher Weg bei gleichem Startwert');
  }
});

test('Nachlaufen: richtig, Ziel, falsch zurück zum Start, Irrlicht ist falsch', () => {
  const b = E.brett(LEVELS[22]), st = E.neuerLauf(), p = b.path;
  assert.equal(E.tippe(b, st, p[0]), 'still');
  assert.equal(E.tippe(b, st, p[1]), 'gut');
  assert.equal(E.tippe(b, st, p[1]), 'still', 'schon gelaufen');
  assert.equal(E.tippe(b, st, p[3]), 'falsch', 'Stein überspringen');
  assert.equal(st.pos, 0); assert.equal(st.fehler, 1);
  assert.equal(E.tippe(b, st, p[1]), 'gut');
  assert.equal(E.tippe(b, st, b.irr[0].cell), 'falsch', 'Irrlicht');
  for (let i = 1; i < p.length - 1; i++) assert.equal(E.tippe(b, st, p[i]), 'gut');
  assert.equal(E.tippe(b, st, p.at(-1)), 'ziel');
  assert.equal(E.tippe(b, st, p[1]), 'still', 'nach dem Ziel nichts mehr');
  assert.equal(E.sterne(st), 1);
  const ohne = E.neuerLauf(); assert.equal(E.sterne(ohne), 3);
  E.hinweis(ohne); assert.equal(E.sterne(ohne), 2, 'Nochmal zeigen kostet einen Stern');
});

test('Zeigen: Steine gehen nacheinander an, alle wieder aus, Spur verblasst', () => {
  const b = E.brett(LEVELS[0]), end = E.zeigeEnde(b);
  assert.equal(E.helligkeit(b, 1, 0), 0);
  assert.equal(E.helligkeit(b, 1, b.step + 200), 1);
  assert.equal(E.helligkeit(b, 0, end - 1), 1, 'ganzer Weg leuchtet bis zum Schluss');
  for (let i = 0; i < b.path.length; i++) assert.equal(E.helligkeit(b, i, E.zeigeDauer(b)), 0, 'am Ende alles dunkel');
  assert.equal(E.lumiBeimZeigen(b, 99999), b.path.length - 1);
  const s = E.brett(LEVELS[15]);   // Spur 3
  assert.equal(E.helligkeit(s, 0, 3 * s.step + 400), 0, 'erster Stein verblasst hinter Lumi');
  assert.equal(E.helligkeit(s, 3, 3 * s.step + 400), 1);
  const m = E.brett(LEVELS[25]), ir = m.irr[0];
  let max = 0; for (let t = 0; t < E.zeigeDauer(m); t += 20) max = Math.max(max, E.irrHelligkeit(m, ir, t));
  assert.equal(max, 1, 'Irrlicht flackert sichtbar auf');
  assert.equal(E.irrHelligkeit(m, ir, E.zeigeDauer(m)), 0);
});

test('Rekordpfad: jede Länge bis über die Grenze baubar und eindeutig', () => {
  for (let len = E.REKORD_START; len <= E.REKORD_MAX + 3; len++) {
    for (let s = 1; s <= 12; s++) {
      const b = E.rekordRunde(s * 977 + len, len), l = Math.min(len, E.REKORD_MAX);
      pruefeBrett(b, { len: l, irr: 0 }, `Rekord ${len}/${s}`);
      assert.ok(b.step >= 300 && b.hold >= 450);
    }
  }
});

test('Spielstand: aufräumen, freischalten, Einladung', () => {
  const s = E.sanitizeSave({ best: { 1: 3, 2: 9, 40: 2, 3: 1 }, unlocked: 1, rekord: 12, mute: true }, LEVEL_COUNT);
  assert.deepEqual(s.best, { 1: 3, 3: 1 }); assert.equal(s.unlocked, 4); assert.equal(s.rekord, 12); assert.equal(s.mute, true);
  assert.deepEqual(E.sanitizeSave('kaputt', 30), E.freshSave());
  assert.equal(E.sanitizeSave({ rekord: -3 }, 30).rekord, 0);
  const sv = E.freshSave(), st = E.neuerLauf();
  assert.deepEqual(E.recordWin(sv, 1, st, 30), { rec: true, stars: 3 }); assert.equal(sv.unlocked, 2);
  st.fehler = 2; assert.deepEqual(E.recordWin(sv, 1, st, 30), { rec: false, stars: 1 }); assert.equal(sv.best[1], 3);
  E.recordWin(sv, 9, E.neuerLauf(), 30); assert.equal(sv.unlocked, 2, 'Einladung schaltet nichts außer der Reihe frei');
  assert.deepEqual(E.parseInvite('?l=7', 30), { l: 7 });
  assert.deepEqual(E.parseInvite('?r=11', 30), { r: 11 });
  assert.equal(E.parseInvite('?l=31', 30), null); assert.equal(E.parseInvite('?r=1', 30), null); assert.equal(E.parseInvite('', 30), null);
});
