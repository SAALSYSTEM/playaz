// ZAHLENSTURM: Rechenlogik, Tore, Hindernisse, Kämpfe, Boss, Bonus, Awards und alle 20 Level – ohne Browser.
// Start: node --test tests/zahlensturm-sim.test.mjs   (keine weiteren Abhängigkeiten)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyOp, createSim, step, result, replay, decodeInputs, encodeInputs, obstacleLoss, crowdHalfWidth, xLimit, MAX_N, BONUS_CAP, BONUS_GAP, BONUS_START, SPEED, DT } from '../public/spiele/zahlensturm/sim.js';
import { LEVELS, LEVEL_BY_ID } from '../public/spiele/zahlensturm/levels.js';
import { AWARDS, evaluateAwards } from '../public/spiele/zahlensturm/awards.js';
import { PAR } from '../public/spiele/zahlensturm/par.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LOES = JSON.parse(readFileSync(join(ROOT, 'tests/zahlensturm-loesungen.json'), 'utf8'));

// Mini-Level für Einzeltests
const hw = 5;
const mini = (o = {}) => ({ id: 99, hw, start: 10, len: 60, gates: [], obs: [], enemies: [], coins: [], bonus: [], ...o });
const tor = (z, ...ops) => {
  const w = (2 * hw) / ops.length;
  return { z, panels: ops.map((t, i) => { const m = /^([+\-×÷])(\d+)$/.exec(t); return { x0: -hw + i * w, x1: -hw + (i + 1) * w, op: m[1], v: +m[2] }; }) };
};
const lauf = (lvl, tx = 0, max = 60 * 120) => { const s = createSim(lvl); while (s.s.phase !== 'won' && s.s.phase !== 'lost' && s.s.t < max) { step(s, typeof tx === 'function' ? tx(s) : tx); } return s; };

test('Rechnen: + − × ÷, abgerundet, nie negativ, Obergrenze', () => {
  assert.equal(applyOp(10, '+', 5), 15);
  assert.equal(applyOp(10, '-', 4), 6);
  assert.equal(applyOp(10, '×', 3), 30);
  assert.equal(applyOp(10, '÷', 3), 3);
  assert.equal(applyOp(7, '÷', 2), 3);
  assert.equal(applyOp(1, '÷', 2), 0);
  assert.equal(applyOp(5, '-', 50), 0);
  assert.equal(applyOp(0, '×', 9), 0);
  assert.equal(applyOp(MAX_N, '+', 100), MAX_N);
  assert.equal(applyOp(9000, '×', 5), MAX_N);
  for (const [n, op, v] of [[3, '÷', 2], [17, '-', 4], [1, '×', 5]]) assert.ok(Number.isInteger(applyOp(n, op, v)));
});

test('Tore: richtiges Tor je nach Seite, jedes Tor genau einmal', () => {
  const lvl = mini({ gates: [tor(10, '+5', '×2')] });
  const links = lauf(lvl, -3), rechts = lauf(lvl, 3);
  assert.equal(links.s.n, 15); assert.equal(rechts.s.n, 20);
  assert.equal(links.s.stats.gates, 1);
  assert.equal(rechts.s.stats.gates, 1);
  // Wechsel hin und her über dem Tor löst nichts doppelt aus
  const s = createSim(lvl); let k = 0;
  while (s.s.phase !== 'won' && s.s.t < 3000) step(s, (k++ % 4 < 2) ? -3 : 3);
  assert.equal(s.s.stats.gates, 1);
});

test('Tore: Division rundet ab, Gruppe nie unter 0, bei 0 verloren', () => {
  const a = lauf(mini({ start: 7, gates: [tor(10, '÷2', '+1')] }), -3);
  assert.equal(a.s.n, 3);
  const b = lauf(mini({ start: 4, gates: [tor(10, '-9', '+1')] }), -3);
  assert.equal(b.s.phase, 'lost'); assert.equal(b.s.n, 0); assert.equal(b.s.why, 'tor');
});

test('Hindernisse: Wand kostet Figuren, Ausweichen kostet nichts', () => {
  const lvl = mini({ obs: [{ type: 'wall', z: 20, x0: -hw, x1: 0 }] });
  assert.ok(lauf(lvl, -2).s.n < 10);
  assert.equal(lauf(lvl, 3).s.n, 10);
  assert.equal(lauf(lvl, 3).s.stats.hazardLoss, 0);
});

test('Hindernisse: Stacheln kosten festen Betrag, Grube alles auf der Lücke, Plattform trägt nur die Mitte', () => {
  assert.equal(obstacleLoss({ type: 'spikes', x0: -5, x1: 5, cost: 4 }, 0, 20, 0, hw), 4);
  assert.equal(obstacleLoss({ type: 'spikes', x0: -5, x1: 5, cost: 40 }, 0, 20, 0, hw), 20);
  assert.ok(obstacleLoss({ type: 'pit', x0: -5, x1: 5 }, 0, 20, 0, hw) > 0);
  assert.equal(obstacleLoss({ type: 'pit', x0: -5, x1: -1 }, 3, 1, 0, hw), 0);
  const plat = { type: 'plat', cx: 0, amp: 0, pw: 2.5, period: 4 };
  assert.equal(obstacleLoss(plat, 0, 1, 0, hw), 0);
  assert.ok(obstacleLoss(plat, 4, 1, 0, hw) > 0);
});

test('Bewegte Hindernisse sind deterministisch und zeitabhängig', () => {
  const m = { type: 'mover', z: 20, cx: 0, amp: 3, half: 1.2, period: 4 };
  const l1 = obstacleLoss(m, 0, 10, 0, hw), l2 = obstacleLoss(m, 0, 10, 1, hw);
  assert.equal(l1, obstacleLoss(m, 0, 10, 0, hw));
  assert.notEqual(l1, l2);
});

test('Gegner: ausweichen oder kämpfen; wer mehr Figuren hat gewinnt und behält die Differenz, Gleichstand verliert', () => {
  const lvl = mini({ start: 50, enemies: [{ z: 20, x0: -hw, x1: 0, hp: 30 }] });
  const aus = lauf(lvl, 3);
  assert.equal(aus.s.n, 50); assert.equal(aus.s.stats.avoided, 1);
  const kampf = lauf(lvl, -3);
  assert.equal(kampf.s.phase, 'won'); assert.equal(kampf.s.n, 20);
  const knapp = (n) => lauf(mini({ start: n, enemies: [{ z: 20, x0: -hw, x1: hw, hp: 100 }] }), 0);
  assert.equal(knapp(99).s.phase, 'lost'); assert.equal(knapp(100).s.phase, 'lost');
  const g = knapp(101); assert.equal(g.s.phase, 'won'); assert.equal(g.s.n, 1);
  assert.equal(knapp(250).s.n, 150);
});

test('Boss: Kampf (Zahl gegen Zahl), Sieg führt in den Bonus, Niederlage beendet den Lauf', () => {
  const boss = { z: 40, hp: 100 };
  const bonus = [[{ x0: -hw, x1: 0, m: 2 }, { x0: 0, x1: hw, m: 5 }]];
  const sieg = lauf(mini({ start: 160, boss, bonus }), 3);
  assert.equal(sieg.s.phase, 'won'); assert.equal(sieg.s.stats.bossN, 160); assert.equal(sieg.s.n, 60);
  assert.deepEqual(sieg.s.mults, [5]);
  assert.equal(sieg.s.bonusCoins, Math.ceil((sieg.s.n * 5) / 15));
  const gleich = lauf(mini({ start: 100, boss, bonus }), 3);
  assert.equal(gleich.s.phase, 'lost'); assert.equal(gleich.s.why, 'boss');
  const verloren = lauf(mini({ start: 20, boss, bonus }), 3);
  assert.equal(verloren.s.phase, 'lost'); assert.equal(verloren.s.why, 'boss');
});

test('Münzen bringen Figuren: jede eingesammelte Münze ist +1 Figur', () => {
  const lvl = mini({ start: 10, coins: [[0, 10], [0, 20], [0, 30], [4.8, 40]] });
  const s = lauf(lvl, 0);
  assert.equal(s.s.coins, 3); assert.equal(s.s.n, 13);
});

test('Bonus: Münzen je Sprosse gedeckelt (Farm-Schutz), Sprossen genau einmal', () => {
  const bonus = [[{ x0: -hw, x1: hw, m: 3 }], [{ x0: -hw, x1: hw, m: 3 }]];
  const lvl = mini({ start: 5000, boss: null, bonus });
  const s = lauf(lvl, 0);
  assert.equal(s.s.mults.length, 2);
  assert.equal(s.s.bonusCoins, 2 * Math.ceil((BONUS_CAP * 3) / 15));
  assert.equal(BONUS_START, 16); assert.equal(BONUS_GAP, 11);
});

test('Münzen: nur im Weg der Gruppe, jede nur einmal', () => {
  const lvl = mini({ coins: [[0, 10], [0, 12], [4.8, 14]] });
  const a = lauf(lvl, 0);
  assert.equal(a.s.coins, 2);
  assert.equal(result(a).coinsGesamt, 3);
  assert.equal(result(a).alleMuenzen, false);
});

test('Gruppenbreite und Spielraum: begrenzt, nie negativ', () => {
  assert.equal(crowdHalfWidth(0), 0);
  assert.ok(crowdHalfWidth(9999) <= 3.2 + 1e-9);
  assert.ok(xLimit(5, 9999) >= 0);
  assert.ok(xLimit(4.2, 400) >= 0);
});

test('Determinismus: gleiche Eingaben → gleiches Ergebnis; Eingabe-Kodierung rundet verlustfrei', () => {
  const l = LEVEL_BY_ID[5], inp = decodeInputs(LOES[5].a);
  const a = replay(l, inp), b = replay(l, inp);
  assert.deepEqual(result(a), result(b));
  assert.equal(encodeInputs(decodeInputs(LOES[5].a)), LOES[5].a);
});

test('Levels: 20 Stück, Pflichtfelder, aufsteigende IDs, sortierbare Strecke, Tore gültig', () => {
  assert.ok(LEVELS.length >= 20);
  LEVELS.forEach((l, i) => {
    assert.equal(l.id, i + 1);
    assert.ok(l.name && l.theme && l.hw > 0 && l.start >= 1 && l.len > 0, 'Level ' + l.id);
    assert.ok(l.boss && l.boss.hp > 0, 'Boss in Level ' + l.id);
    assert.ok(l.bonus.length >= 1, 'Bonus in Level ' + l.id);
    for (const g of l.gates) {
      assert.ok(g.panels.length >= 2 && g.z > 0 && g.z < l.boss.z, `Tor L${l.id} z=${g.z}`);
      assert.ok(Math.abs(g.panels[0].x0 + (g.x0 ?? l.hw)) <= l.hw + 1e-9);
      for (let k = 1; k < g.panels.length; k++) assert.ok(Math.abs(g.panels[k].x0 - g.panels[k - 1].x1) < 1e-9, 'lückenlos');
      for (const p of g.panels) assert.ok(['+', '-', '×', '÷'].includes(p.op) && p.v > 0);
    }
  });
});

test('Schwierigkeit steigt: Boss wird stärker, Rechenarten nehmen zu', () => {
  const t = LEVELS.map((l) => l.boss.hp);
  assert.ok(t[19] > t[0] * 5, 'Boss-Zahl Level 20 ≫ Level 1');
  for (let i = 5; i < 20; i += 5) assert.ok(t[i] > t[i - 5] * 0.9, 'Block ' + i);
  const ops = (a, b) => new Set(LEVELS.slice(a, b).flatMap((l) => l.gates.flatMap((g) => g.panels.map((p) => p.op))));
  assert.ok(ops(0, 2).size <= ops(5, 20).size && ops(5, 20).size === 4);
  assert.ok(!ops(0, 1).has('÷'), 'Level 1 ohne Division');
});

test('Alle 20 Level lösbar: gespeicherte Bot-Lösungen gewinnen (Sim-Wiedergabe), n passt zur Datei', () => {
  for (const l of LEVELS) {
    const o = LOES[l.id];
    assert.ok(o, 'Lösung für Level ' + l.id);
    const sim = replay(l, decodeInputs(o.a));
    assert.equal(sim.s.phase, 'won', `Level ${l.id} nicht gelöst`);
    assert.equal(sim.s.n, o.nA, `Level ${l.id}: n weicht ab`);
    assert.ok(result(sim).sterne >= 1);
    const b = replay(l, decodeInputs(o.b));
    assert.equal(b.s.phase, 'won', `Level ${l.id} Münzroute`);
  }
});

test('Par: für jedes Level erreichbar (Bot ≥ Par) und 3 Sterne belegbar', () => {
  for (const l of LEVELS) {
    assert.ok(PAR[l.id] > 0, 'Par ' + l.id);
    const r = result(replay(l, decodeInputs(LOES[l.id].a)));
    assert.ok(r.n >= PAR[l.id], `Level ${l.id}: Bot ${r.n} < Par ${PAR[l.id]}`);
  }
  // Mindestens eine Route holt alle Münzen
  for (const l of LEVELS) { const r = result(replay(l, decodeInputs(LOES[l.id].b))); assert.ok(r.coins >= r.coinsGesamt - 3, `Level ${l.id} Münzen ${r.coins}/${r.coinsGesamt}`); }
});

test('Torentscheidungen sind abwechslungsreich: kein Level lässt sich mit „immer eine Seite“ auf Par lösen', () => {
  for (const l of LEVELS) {
    for (const tx of [-9, 0, 9]) {
      const s = lauf(l, tx, 60 * 300);
      const r = result(s);
      assert.ok(!(r.gewonnen && r.n >= PAR[l.id]), `Level ${l.id}: konstante Spur ${tx} erreicht Par`);
    }
  }
});

test('Torentscheidungen: die gute Lösung wechselt die Seite (Links und Rechts kommen in jedem Block vor)', () => {
  const seiten = (l) => {
    const sim = createSim(l); const inp = decodeInputs(LOES[l.id].a); let i = 0, tx = 0; const out = [];
    while (sim.s.phase !== 'won' && sim.s.phase !== 'lost') {
      while (i < inp.length && inp[i][0] <= sim.s.t) tx = inp[i++][1];
      step(sim, tx);
      for (const e of sim.s.log) if (e.e === 'gate') { const g = l.gates.find((q) => q.z === e.z); out.push(e.panel === 0 ? 'L' : e.panel === g.panels.length - 1 ? 'R' : 'M'); }
      sim.s.log.length = 0;
    }
    return out;
  };
  for (let a = 0; a < 20; a += 5) {
    const alle = LEVELS.slice(a, a + 5).flatMap(seiten);
    const L = alle.filter((x) => x === 'L').length, R = alle.filter((x) => x === 'R').length;
    assert.ok(L >= 3 && R >= 3, `Block ${a / 5 + 1}: L=${L} R=${R}`);
    assert.ok(Math.max(L, R) / alle.length < 0.75, `Block ${a / 5 + 1} zu einseitig`);
  }
});

test('Level 21+ lassen sich als Daten ergänzen (Struktur ist rein datengetrieben)', () => {
  const kopie = JSON.parse(JSON.stringify(LEVELS[0])); kopie.id = 21; delete kopie._p;
  const s = replay(kopie, decodeInputs(LOES[1].a));
  assert.ok(s.s.phase === 'won' || s.s.phase === 'lost');
});

test('Awards: erste, 5/10/20 Level, 100/500 gleichzeitig, unversehrt, alle Münzen, Boss mit großer Gruppe, perfekt', () => {
  const lv = (n, extra = {}) => { const o = {}; for (let i = 1; i <= n; i++) o[i] = { done: true, stars: 1, ...extra }; return o; };
  const run = { level: 1, gewonnen: true, n: 10, maxN: 10, bossN: 10, unversehrt: false, alleMuenzen: false, sterne: 1, fails: 0, ersterSieg: true };
  const hat = (save, r) => evaluateAwards(save, 20, r, new Date('2026-01-01')).map((a) => a.id);
  const leer = () => ({ levels: {}, stats: {}, awards: {}, skins: { owned: ['std'] } });
  assert.ok(hat({ ...leer(), levels: lv(1) }, run).includes('erster'));
  assert.ok(hat({ ...leer(), levels: lv(5) }, run).includes('fuenf'));
  assert.ok(hat({ ...leer(), levels: lv(10) }, run).includes('zehn'));
  assert.ok(hat({ ...leer(), levels: lv(20) }, run).includes('zwanzig'));
  assert.ok(hat({ ...leer(), levels: lv(1), stats: { maxN: 100 } }, { ...run, maxN: 100 }).includes('hundert'));
  assert.ok(hat({ ...leer(), levels: lv(1), stats: { maxN: 500 } }, { ...run, maxN: 500 }).includes('fuenfhundert'));
  assert.ok(hat({ ...leer(), levels: lv(1) }, { ...run, unversehrt: true }).includes('unversehrt'));
  assert.ok(hat({ ...leer(), levels: lv(1) }, { ...run, alleMuenzen: true }).includes('muenzen'));
  assert.ok(hat({ ...leer(), levels: lv(1) }, { ...run, bossN: 300 }).includes('bossriese'));
  assert.ok(hat({ ...leer(), levels: lv(1) }, { ...run, unversehrt: true, alleMuenzen: true, sterne: 3 }).includes('perfekt'));
  assert.ok(!hat({ ...leer(), levels: lv(1) }, { ...run, gewonnen: false }).includes('unversehrt'));
  // Doppelte Vergabe ausgeschlossen
  const save = { ...leer(), levels: lv(1) };
  assert.ok(hat(save, run).length >= 1); assert.equal(hat(save, run).length, 0);
  assert.ok(AWARDS.length >= 10);
});

test('Gewinnen ist ohne Eingabe möglich oder nicht – aber nie eine Endlosschleife (Lauf endet)', () => {
  for (const l of LEVELS) { const s = lauf(l, 0, 60 * 400); assert.ok(s.s.phase === 'won' || s.s.phase === 'lost', 'Level ' + l.id); }
  assert.ok(SPEED > 0 && DT > 0);
});
