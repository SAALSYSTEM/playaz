// PAPIERPILOT: Regeln, Determinismus, Strecke fliegbar, Rundenlängen (ohne Browser).
// node --test tests/papierpilot-sim.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { neuerFlug, vorbereiteteStrecke, kraftBei, kodiere, dekodiere, M, TIPP, LINKS, RECHTS, XMAX, START_Y } from '../public/spiele/papierpilot/sim.js';
import { TESTSTRECKE, ABSCHNITTE, TYPEN } from '../public/spiele/papierpilot/strecke.js';
import { botFlug } from '../tools/papierpilot-bot.mjs';

const S = vorbereiteteStrecke(TESTSTRECKE);
function fliege(eingaben) { const f = neuerFlug(S); for (const e of eingaben) { if (f.s.phase === 'ende') break; f.schritt(e); } return f; }

test('Kraftanzeige pendelt 0 → 1000 → 0', () => {
  assert.equal(kraftBei(0), 0); assert.equal(kraftBei(40), 1000); assert.equal(kraftBei(80), 0); assert.equal(kraftBei(20), 500);
});

test('ohne Wurf startet der Flug nicht', () => {
  const f = fliege(new Array(300).fill(0));
  assert.equal(f.s.phase, 'wurf'); assert.equal(f.s.z, 0); assert.equal(f.s.y, START_Y);
});

test('stärkerer Wurf fliegt anfangs weiter', () => {
  const nach = (k) => { const e = new Array(k).fill(0); e.push(TIPP); for (let i = 0; i < 240; i++) e.push(0); return fliege(e).s.z; };
  assert.ok(nach(39) > nach(9));
});

test('Steuern: links/rechts verschiebt, Korridor hält', () => {
  const basis = [...new Array(39).fill(0), TIPP];
  assert.ok(fliege([...basis, ...new Array(30).fill(LINKS)]).s.x < -M);
  assert.ok(fliege([...basis, ...new Array(30).fill(RECHTS)]).s.x > M);
  const lange = fliege([...basis, ...new Array(400).fill(RECHTS)]);
  assert.ok(lange.s.x <= XMAX);
});

test('Kurven kosten Höhe', () => {
  const basis = [...new Array(39).fill(0), TIPP];
  const gerade = neuerFlug(S), kurvig = neuerFlug(S);
  for (const e of basis) { gerade.schritt(e); kurvig.schritt(e); }
  for (let i = 0; i < 60; i++) { gerade.schritt(0); kurvig.schritt(i % 40 < 20 ? LINKS : RECHTS); }
  assert.ok(kurvig.s.y < gerade.s.y);
});

test('geradeaus endet am Turm in Abschnitt 3 (Hindernis-Kollision greift)', () => {
  const f = fliege([...new Array(39).fill(0), TIPP, ...new Array(20000).fill(0)]);
  assert.equal(f.s.grund, 'hindernis'); assert.equal(S.o[f.s.treffer].t, 'turm');
});

test('bitgleich reproduzierbar (Grundlage für Server-Prüfung und Geist)', () => {
  const r = botFlug(TESTSTRECKE, { zittern: 0.15, seed: 7, wurf: 750 });
  const text = kodiere(r.eingaben), zurueck = dekodiere(text);
  assert.deepEqual(zurueck, r.eingaben);
  const a = fliege(zurueck), b = fliege(zurueck);
  assert.equal(a.s.z, b.s.z); assert.equal(a.s.ft, b.s.ft); assert.equal(Math.round(a.s.z / M * 1000), Math.round(r.m * 1000));
  assert.equal(dekodiere('9:3'), null);
});

test('Teststrecke ist fliegbar und Rundenlängen passen (Bot)', () => {
  const gut = botFlug(TESTSTRECKE);
  assert.ok(gut.m > 450, 'guter Flug ' + gut.m);
  assert.ok(gut.sek > 45 && gut.sek < 100, 'guter Flug dauert ' + gut.sek);
  const mittel = [1, 2, 3, 4].map((seed) => botFlug(TESTSTRECKE, { zittern: 0.25, horizont: 90, wurf: 600, seed }));
  const sek = mittel.map((r) => r.sek).sort((a, b) => a - b);
  assert.ok(sek[1] > 20 && sek[2] < 75, 'normale Flüge ' + sek.join(', '));
});

test('jeder Abschnitt lässt eine Lücke in Bodennähe', () => {
  for (const [name, ab] of Object.entries(ABSCHNITTE)) {
    for (let z = 0; z < 40; z += 0.5) {
      const belegt = [];
      for (const [t, x, oz] of ab.o) { const T = TYPEN[t], tiefe = T.form === 'rund' ? T.r : T.hz; if (Math.abs(z - oz) < tiefe + 0.35) belegt.push([x - (T.form === 'rund' ? T.r : T.hx) - 0.35, x + (T.form === 'rund' ? T.r : T.hx) + 0.35]); }
      belegt.sort((a, b) => a[0] - b[0]);
      let frei = 0, x = -11;
      for (const [a, b] of belegt) { frei = Math.max(frei, a - x); x = Math.max(x, b); }
      frei = Math.max(frei, 11 - x);
      assert.ok(frei >= 1.5, name + ' bei z=' + z + ': Lücke ' + frei.toFixed(2) + ' m');
    }
  }
});

test('Tagesstrecke: gleich für alle am selben Tag, jeden Tag anders, Regeln eingehalten', async () => {
  const { tagesStrecke, TAGES_ABSCHNITTE } = await import('../public/spiele/papierpilot/strecke.js');
  assert.deepEqual(tagesStrecke(20261022), tagesStrecke(20261022));
  assert.notDeepEqual(tagesStrecke(20261022), tagesStrecke(20261023));
  for (let d = 0; d < 365; d++) {
    const t = new Date(Date.UTC(2026, 0, 1) + d * 86400000), seed = Number(t.toISOString().slice(0, 10).replace(/-/g, ''));
    const n = tagesStrecke(seed), basis = n.map((x) => x.replace('-', ''));
    assert.equal(n.length, TAGES_ABSCHNITTE); assert.equal(n[0], 'start');
    for (let i = 1; i < n.length; i++) assert.notEqual(basis[i], basis[i - 1], seed + ': doppelt');
    const fl = basis.flatMap((b, i) => (b === 'fluss' ? [i] : []));
    for (let i = 1; i < fl.length; i++) assert.ok(fl[i] - fl[i - 1] >= 4, seed + ': Fluss zu dicht');
  }
});

test('Tagesstrecken der nächsten 40 Tage sind fliegbar (Bot kommt weit genug)', async () => {
  const { tagesStrecke } = await import('../public/spiele/papierpilot/strecke.js');
  for (let d = 0; d < 40; d++) {
    const t = new Date(Date.UTC(2026, 9, 22) + d * 86400000), seed = Number(t.toISOString().slice(0, 10).replace(/-/g, ''));
    const best = Math.max(botFlug(tagesStrecke(seed)).m, botFlug(tagesStrecke(seed), { zittern: 0.1, seed: 2 }).m);
    assert.ok(best > 280, seed + ': nur ' + best.toFixed(0) + ' m');
  }
});
