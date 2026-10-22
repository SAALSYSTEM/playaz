// PUNKTLANDUNG: Regeln, Determinismus, Lösbarkeit und Prüfung. Start: node --test tests/punktlandung-sim.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { neuerLauf, nachfahren, pruefeLauf, kodiere, dekodiere, SIM_VERSION, tempo, breite, VOLL, WMIN, VMAX } from '../public/spiele/punktlandung/sim.js';

// Bot: tippt, sobald das Zielfeld erreicht ist (Mitte erreicht oder fast), optional mit Verzögerung in Takten
function bot(seed, maxTreffer, versatz = 0) {
  const l = neuerLauf(seed); const tipps = []; let warte = -1;
  while (l.s.n < maxTreffer && !l.s.tot) {
    const v = tempo(l.s.n); let tipp = false;
    if (warte < 0 && l.s.e - v < 0) warte = versatz;          // nächster Takt würde die Mitte überschreiten
    if (warte === 0) { tipp = true; warte = -1; } else if (warte > 0) warte--;
    if (tipp) tipps.push(l.s.t);
    l.schritt(tipp);
  }
  return { tipps, l };
}

test('Zufall ist deterministisch, Kurse unterscheiden sich je Tag', () => {
  const ziele = (seed) => { const l = neuerLauf(seed); const z = []; for (let i = 0; i < 30 && !l.s.tot; i++) { while (l.s.e > 0) l.schritt(false); l.schritt(true); z.push(l.s.e); } return z.join(','); };
  assert.equal(ziele(20261022), ziele(20261022)); assert.notEqual(ziele(20261022), ziele(20261023));
});

test('Ohne Tippen ist nach wenigen Sekunden Schluss, ohne Punkt', () => {
  const l = neuerLauf(20261022); while (l.schritt(false)); assert.equal(l.punkte(), 0); assert.ok(l.s.t > 20 && l.s.t < 150, String(l.s.t));
});

test('Zu früh tippen beendet den Lauf', () => {
  const l = neuerLauf(20261022); assert.equal(l.schritt(true), false); assert.equal(l.s.tot, true); assert.equal(l.punkte(), 0);
});

test('Tempo und Zielfeld: schneller und schmaler bis zu festen Grenzen; Fenster bleibt immer treffbar', () => {
  assert.equal(tempo(0) < tempo(10), true); assert.equal(tempo(10000), VMAX); assert.equal(breite(10000), WMIN);
  assert.ok(2 * WMIN >= VMAX, 'Das Fenster ist mindestens einen Takt breit');
  assert.ok(VOLL === 360000);
});

test('Treffer: Richtung kehrt um, Punkt zählt', () => {
  const l = neuerLauf(20261022); while (l.s.e > 0) l.schritt(false);
  const d = l.s.dir; assert.equal(l.schritt(true), true); assert.equal(l.punkte(), 1); assert.equal(l.s.dir, -d);
});

test('Perfekter Bot schafft 200 Treffer (auch am Ende des Anstiegs) auf vielen Kursen; leicht verspätet noch 60', () => {
  for (let k = 0; k < 20; k++) { const r = bot(20261000 + k, 200); assert.equal(r.l.s.tot, false, 'Kurs ' + k); assert.equal(r.l.punkte(), 200); }
  for (let k = 0; k < 10; k++) { const r = bot(20261100 + k, 60, 1); assert.equal(r.l.s.tot, false, 'Kurs ' + k + ' mit 1 Takt Verzug'); }
});

test('Nachfahren und Kodierung: gleiches Ergebnis wie der Live-Lauf', () => {
  const b = bot(20261022, 25); let l = neuerLauf(20261022); let k = 0; const tipps = b.tipps;
  // nach 25 Treffern aufhören zu tippen: der Lauf endet am nächsten Ziel
  for (;;) { const t = k < tipps.length && tipps[k] === l.s.t; if (t) k++; if (!l.schritt(t)) break; }
  const r = nachfahren(20261022, tipps); assert.equal(r.takte, l.s.t); assert.equal(r.punkte, 25);
  assert.deepEqual(dekodiere(kodiere(tipps)), tipps);
  assert.equal(pruefeLauf({ v: SIM_VERSION, seed: 20261022, inputs: kodiere(tipps), ticks: l.s.t, score: 25 }).ok, true);
});

test('Prüfung lehnt Falsches ab', () => {
  const b = bot(20261022, 25); const l = neuerLauf(20261022); let k = 0;
  for (;;) { const t = k < b.tipps.length && b.tipps[k] === l.s.t; if (t) k++; if (!l.schritt(t)) break; }
  const gut = { v: SIM_VERSION, seed: 20261022, inputs: kodiere(b.tipps), ticks: l.s.t, score: 25 };
  assert.equal(pruefeLauf(gut).ok, true);
  for (const x of [{ score: 26 }, { score: 24 }, { ticks: gut.ticks + 1 }, { seed: 20261023 }, { v: 2 }, { inputs: '' }, { inputs: '1.1.1' }, { inputs: 'a..b' }, { inputs: 'zzzzzzz' }]) assert.equal(pruefeLauf({ ...gut, ...x }).ok, false, JSON.stringify(x));
  // ein Lauf, der nicht endet (Bot hört nie auf), wird nicht gewertet
  const lang = bot(20261022, 30); assert.equal(pruefeLauf({ v: SIM_VERSION, seed: 20261022, inputs: kodiere(lang.tipps), ticks: lang.l.s.t, score: 30 }).ok, false);
  // doppelter Takt (Abstand 0) ist ungültig
  assert.equal(pruefeLauf({ ...gut, inputs: '5.0.3' }).ok, false);
});
