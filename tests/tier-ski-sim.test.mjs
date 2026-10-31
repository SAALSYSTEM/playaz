// Tier-Ski – Regeln ohne Browser: faire Strecke, Fahrphysik, Schanze/Trick, Münzen, Sturz, Spielstand.
// node --test tests/tier-ski-sim.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../public/spiele/tier-ski/logik.js';

const spur = (x) => Math.round((x + 4) / 2);
const HINDERNIS = new Set(['tanne', 'fels', 'schneemann']);

function erzeuge(seed, bis) {
  const s = L.neueStrecke(seed); const alle = [];
  while (s.next < bis) { const vor = s.items.length; L.fuelle(s, s.next + 0.01); alle.push(...s.items.slice(vor)); }
  return { s, alle };
}

test('Strecke: Start frei, jede Reihe lässt den Pfad frei, Pfad springt höchstens eine Spur', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const { s, alle } = erzeuge(seed, 6000);
    assert.ok(alle.every((it) => it.d >= L.START_FREI - 1), 'nichts direkt am Start');
    let vor = 2;
    for (const r of s.reihen) {
      assert.ok(Math.abs(r.pfad - vor) <= 1, `Pfad springt bei ${r.d}`);
      assert.ok(r.frei.includes(r.pfad) && r.frei.includes(vor));
      vor = r.pfad;
    }
    for (const it of alle.filter((i) => HINDERNIS.has(i.typ))) {
      const r = s.reihen.find((x) => Math.abs(x.d - it.d) < 1);
      assert.ok(r, 'Hindernis gehört zu einer Reihe');
      assert.ok(!r.frei.includes(spur(it.x)), `Hindernis auf freier Spur bei ${it.d}`);
      // Lücke für die Figur: Abstand zur freien Spurmitte groß genug
      for (const fi of r.frei) assert.ok(Math.abs(it.x - L.SPUREN[fi]) >= L.HIND[it.typ].r + L.SPIELER_R + 0.4, 'Lücke zu eng');
    }
  }
});

test('Strecke: hinter jeder Schanze ist die Landezone frei, Abstände nie zu knapp', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const { s, alle } = erzeuge(seed, 6000);
    const schanzen = alle.filter((i) => i.typ === 'schanze');
    assert.ok(schanzen.length > 10, 'Schanzen kommen vor');
    for (const sch of schanzen) {
      const lande = sch.d + L.SCHANZE.l / 2 + L.tempo(sch.d) * L.flugzeit() + 6;
      assert.ok(!alle.some((i) => (HINDERNIS.has(i.typ) || i.typ === 'ast' || i.typ === 'schanze') && i.d > sch.d + 0.5 && i.d < lande), `Landezone frei nach ${sch.d}`);
    }
    for (let i = 1; i < s.reihen.length; i++) assert.ok(s.reihen[i].d - s.reihen[i - 1].d >= 10.9);
    assert.ok(alle.some((i) => i.typ === 'ast') && alle.some((i) => i.typ === 'flocke') && alle.some((i) => i.typ === 'muenze'));
  }
});

test('Tempo: startet langsam, steigt gleichmäßig, hat eine Obergrenze', () => {
  assert.equal(L.tempo(0), L.V0);
  let alt = L.V0;
  for (let d = 0; d <= 10000; d += 50) { const v = L.tempo(d); assert.ok(v >= alt && v - alt < 0.5); alt = v; }
  assert.equal(L.tempo(1e6), L.VMAX);
});

// Bot: fährt zur Pfad-Spur der nächsten Reihe, duckt sich unter Ästen, macht in der Luft einen Trick
function bot(f) {
  const r = f.strecke.reihen.find((x) => x.d > f.d - 0.5);
  const ziel = r ? L.SPUREN[r.pfad] : 0;
  const ast = f.strecke.items.find((i) => i.typ === 'ast' && i.d > f.d - 0.5 && i.d < f.d + 3 && Math.abs(i.x - f.x) < L.AST.b + 0.3);
  return { links: f.x > ziel + 0.15, rechts: f.x < ziel - 0.15, duck: !!ast, trick: f.luft && f.vy < 6 };
}

test('Bot fährt 4000 m ohne Sturz (jede Strecke ist schaffbar), springt, trickst, sammelt', () => {
  for (let seed = 1; seed <= 25; seed++) {
    const f = L.neueFahrt(seed); let spruenge = 0, sammeln = 0, gelenkt = 0;
    while (f.d < 4000 && !f.tot) {
      const e = L.schritt(f, 1 / 60, bot(f));
      if (e.includes('sprung')) spruenge++;
      if (e.includes('muenze')) sammeln++;
      if (Math.abs(f.x) > L.RAND + 1e-9) assert.fail('außerhalb der Piste');
      gelenkt = Math.max(gelenkt, Math.abs(f.x));
    }
    assert.ok(!f.tot, `Seed ${seed}: Sturz bei ${f.d.toFixed(0)} m an ${f.getroffen}`);
    assert.ok(spruenge > 5 && f.tricks > 5 && sammeln > 50 && gelenkt > 3, `Seed ${seed}`);
    assert.ok(f.strecke.items.length < 200 && f.strecke.reihen.length < 40, 'Speicher wächst nicht');
    assert.equal(L.punkte(f), Math.floor(f.d) + f.muenzen * L.PUNKTE.muenze + f.bonus);
  }
});

test('Geradeaus in ein Hindernis: Sturz, danach keine Bewegung mehr', () => {
  const f = L.neueFahrt(3);
  f.strecke.items = [{ typ: 'tanne', x: 0, d: 20, id: 1 }];
  f.strecke.next = 1e9;
  let e = [];
  while (!f.tot && f.d < 30) e = L.schritt(f, 1 / 60, {});
  assert.ok(f.tot && e.includes('sturz') && f.getroffen === 'tanne');
  const d = f.d; L.schritt(f, 1 / 60, { rechts: true }); assert.equal(f.d, d);
});

test('Ast: ohne Ducken Sturz, geduckt durch', () => {
  for (const duck of [false, true]) {
    const f = L.neueFahrt(4);
    f.strecke.items = [{ typ: 'ast', x: 0, d: 20, id: 1 }]; f.strecke.next = 1e9;
    while (!f.tot && f.d < 30) L.schritt(f, 1 / 60, { duck });
    assert.equal(f.tot, !duck);
  }
});

test('Schanze: automatischer Sprung über Felsen, Trick bringt 100 Punkte bei der Landung', () => {
  const f = L.neueFahrt(5);
  f.strecke.items = [{ typ: 'schanze', x: 0, d: 20, id: 1 }, { typ: 'fels', x: 0, d: 25, id: 2 }]; f.strecke.next = 1e9;
  let sprung = false, maxY = 0, trick = false;
  while (f.d < 60 && !f.tot) {
    const e = L.schritt(f, 1 / 60, { trick: f.luft });
    if (e.includes('sprung')) sprung = true;
    if (e.includes('trick')) trick = true;
    maxY = Math.max(maxY, f.y);
  }
  assert.ok(sprung && !f.tot && maxY > 2 && trick && f.bonus === L.PUNKTE.trick && !f.luft);
});

test('Münze und Schneeflocke werden genau einmal gezählt', () => {
  const f = L.neueFahrt(6);
  f.strecke.items = [{ typ: 'muenze', x: 0.3, d: 15, y: 0.9, id: 1 }, { typ: 'flocke', x: -0.4, d: 18, y: 1.1, id: 2 }, { typ: 'muenze', x: 3, d: 20, y: 0.9, id: 3 }];
  f.strecke.next = 1e9;
  while (f.d < 30) L.schritt(f, 1 / 30, {});
  assert.equal(f.muenzen, 1); assert.equal(f.flocken, 1); assert.equal(f.bonus, 50);
});

test('Rand: Figur bleibt auf der Piste', () => {
  const f = L.neueFahrt(7); f.strecke.items = []; f.strecke.next = 1e9;
  for (let i = 0; i < 300; i++) L.schritt(f, 1 / 60, { links: true });
  assert.equal(f.x, -L.RAND);
});

test('Spielstand: prüfen, freischalten, verbuchen', () => {
  assert.deepEqual(L.pruefeStand(null), L.leerStand());
  const s = L.pruefeStand({ muenzen: 60, tiere: ['hase', 'drache'], tier: 'drache', rekord: -4 });
  assert.deepEqual(s.tiere, ['hase']); assert.equal(s.tier, 'hase'); assert.equal(s.rekord, 0);
  assert.equal(L.freischalten(s, 'pinguin'), false);
  assert.equal(L.freischalten(s, 'fuchs'), true); assert.equal(s.muenzen, 10); assert.equal(s.tier, 'fuchs');
  assert.equal(L.freischalten(s, 'fuchs'), false);
  const f = L.neueFahrt(1); f.d = 321.7; f.muenzen = 7; f.bonus = 150;
  assert.equal(L.verbuche(s, f), true); assert.equal(s.rekord, 321 + 35 + 150); assert.equal(s.muenzen, 17);
  assert.equal(L.verbuche(s, f), false);
});
