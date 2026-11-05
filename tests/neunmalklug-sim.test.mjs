// Spiellogik NEUNMALKLUG (public/spiele/neunmalklug/sim.js): Rätsel eindeutig, ohne Raten lösbar, Stufen, Tagesrätsel.
// Start: node --test tests/neunmalklug-sim.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { STUFEN, STUFEN_LISTE, baueRaetsel, tagesRaetsel, tagesStufe, logischLoesbar, zaehleLoesungen, pruefeLauf, kodiere, dekodiere, konflikte, EINHEITEN } from '../public/spiele/neunmalklug/sim.js';

const gueltig = (g) => EINHEITEN.every((u) => new Set(u.map((i) => g[i])).size === 9 && u.every((i) => g[i] >= 1 && g[i] <= 9));

test('Je Stufe 60 Rätsel: eindeutig, ohne Raten lösbar, Lösung passt zu den Vorgaben', () => {
  for (const st of STUFEN_LISTE) {
    for (let s = 1; s <= 60; s++) {
      const r = baueRaetsel(s * 7919 + 13, st);
      assert.ok(gueltig(r.loesung), st + ' Lösung gültig');
      for (let i = 0; i < 81; i++) if (r.raetsel[i]) assert.equal(r.raetsel[i], r.loesung[i]);
      assert.equal(zaehleLoesungen(r.raetsel, 2), 1, st + ' eindeutig');
      assert.ok(logischLoesbar(r.raetsel, STUFEN[st].technik), st + ' ohne Raten lösbar');
      if (STUFEN[st].technik === 2) assert.ok(!logischLoesbar(r.raetsel, 1), st + ' braucht mehr als Einzelne');
      assert.equal(r.leer, 81 - r.raetsel.filter(Boolean).length);
    }
  }
});

test('Stufen werden schwerer (weniger Vorgaben im Mittel)', () => {
  const mittel = (st) => { let x = 0; for (let s = 1; s <= 40; s++) x += baueRaetsel(s * 31 + 7, st).vorgaben; return x / 40; };
  const m = STUFEN_LISTE.map(mittel);
  for (let i = 1; i < m.length; i++) assert.ok(m[i] < m[i - 1], 'Stufe ' + STUFEN_LISTE[i] + ' hat weniger Vorgaben: ' + m.join(' / '));
});

test('Deterministisch und Tagesstufe nach Wochentag', () => {
  assert.deepEqual(baueRaetsel(123, 'schwer'), baueRaetsel(123, 'schwer'));
  assert.notDeepEqual(baueRaetsel(123, 'schwer').raetsel, baueRaetsel(124, 'schwer').raetsel);
  // 02.11.2026 = Montag ... 08.11.2026 = Sonntag
  assert.deepEqual(['20261102', '20261103', '20261104', '20261105', '20261106', '20261107', '20261108'].map((t) => tagesStufe(t)),
    ['leicht', 'mittel', 'mittel', 'schwer', 'mittel', 'schwer', 'experte']);
  assert.equal(tagesRaetsel(99, 1, '20261108').stufe, 'experte');
  assert.equal(tagesRaetsel(99, 2, '20261108'), null, 'unbekannte Version');
  assert.equal(tagesStufe('2026-11-08'), null);
});

test('Prüfung der Tageslösung', () => {
  const r = tagesRaetsel(777, 1, '20261105');
  assert.deepEqual(pruefeLauf(777, 1, '20261105', { loesung: kodiere(r.loesung) }), { ok: true, felder: r.leer });
  assert.equal(pruefeLauf(777, 1, '20261105', { loesung: kodiere(r.raetsel) }).ok, false, 'leere Felder');
  assert.equal(pruefeLauf(777, 9, '20261105', { loesung: kodiere(r.loesung) }).grund, 'version');
  assert.equal(pruefeLauf(778, 1, '20261105', { loesung: kodiere(r.loesung) }).ok, false, 'anderer Seed');
  assert.equal(pruefeLauf(777, 1, '20261105', {}).grund, 'ungueltig');
});

test('Kodierung und Konflikte', () => {
  const r = baueRaetsel(5, 'leicht');
  assert.deepEqual(dekodiere(kodiere(r.raetsel)), r.raetsel);
  assert.equal(dekodiere('12'), null); assert.equal(dekodiere('x'.repeat(81)), null);
  assert.ok(konflikte(r.loesung).every((x) => !x));
  const g = r.loesung.slice(); g[1] = g[0];
  const k = konflikte(g); assert.ok(k[0] && k[1]);
});

test('Edge-Function-Kopie von sim.js ist aktuell', () => {
  assert.equal(readFileSync(new URL('../supabase/functions/neunmalklug-lauf/sim.js', import.meta.url), 'utf8'), readFileSync(new URL('../public/spiele/neunmalklug/sim.js', import.meta.url), 'utf8'));
});
