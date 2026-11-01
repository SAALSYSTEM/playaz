// ROULETTE – Regeln, Auszahlungen, Quote, gemeinsame Coins mit Rocket Reels (Gast und Server).
// node --test tests/roulette-sim.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as R from '../public/spiele/roulette/roulette.js';
import * as E from '../public/spiele/rocket-reels/engine.js';
import { behandle } from '../supabase/functions/rocket-reels/handler.js';
import { ersatzSupabase, UID } from './rocket-reels-ersatz.mjs';

const folge = (...z) => () => z.shift();

test('Kessel, Farben, Wettfelder vollständig', () => {
  assert.equal(R.KESSEL.length, 37);
  assert.deepEqual([...R.KESSEL].sort((a, b) => a - b), Array.from({ length: 37 }, (_, i) => i));
  assert.equal(R.ROT.length, 18);
  // Rot/Schwarz wechseln sich im Kessel ab (außer an der Null)
  for (let i = 1; i < 36; i++) assert.notEqual(R.farbe(R.KESSEL[i]), R.farbe(R.KESSEL[i + 1]), 'Farbwechsel bei ' + R.KESSEL[i]);
  const arten = {};
  for (const w of R.WETTEN.values()) arten[w.art] = (arten[w.art] || 0) + 1;
  assert.deepEqual(arten, { plein: 37, cheval: 60, trans: 14, carre: 23, sixain: 11, dutzend: 3, kolonne: 3, einfach: 6 });
  const faktor = { plein: 35, cheval: 17, trans: 11, carre: 8, sixain: 5, dutzend: 2, kolonne: 2, einfach: 1 };
  for (const w of R.WETTEN.values()) assert.equal(w.faktor, faktor[w.art], w.key);
});

test('jede einzelne Wette hat genau 36/37 Auszahlungsquote, die Null verliert alle Außenwetten', () => {
  for (const k of R.WETTEN.keys()) {
    let rueck = 0;
    for (let z = 0; z <= 36; z++) rueck += R.auswerten({ [k]: 1 }, z).rueck;
    assert.equal(rueck, 36, k);
  }
  const aussen = { rot: 10, schwarz: 10, gerade: 10, ungerade: 10, manque: 10, passe: 10, d1: 10, d2: 10, d3: 10, k1: 10, k2: 10, k3: 10 };
  assert.equal(R.auswerten(aussen, 0).rueck, 0);
  assert.equal(R.QUOTE, 36 / 37);
});

test('Beispiele: Plein, Cheval, Carré, Rot', () => {
  const a = R.auswerten({ '17': 10, '17-20': 5, '13-14-16-17': 2, rot: 20, schwarz: 20 }, 17);
  // 17 ist schwarz
  assert.equal(R.farbe(17), 'schwarz');
  assert.equal(a.rueck, 10 * 36 + 5 * 18 + 2 * 9 + 20 * 2);
  assert.equal(a.einsatz, 57);
  assert.equal(a.treffer.length, 4);
});

test('Kesselwetten und Nachbarn bestehen nur aus gültigen Feldern', () => {
  for (const [id, a] of Object.entries(R.ANNONCEN)) {
    const zahlen = new Set();
    for (const [k] of a.felder) { assert.ok(R.WETTEN.has(k), id + ': ' + k); R.WETTEN.get(k).zahlen.forEach((n) => zahlen.add(n)); }
    assert.equal(zahlen.size, a.zahlen, id);
  }
  assert.deepEqual(R.nachbarn(0), [3, 26, 0, 32, 15]);
  assert.deepEqual(R.nachbarn(26), [35, 3, 26, 0, 32]);
});

test('Wetten prüfen: Grenzen und unbekannte Felder', () => {
  assert.equal(R.pruefeWetten({}).fehler, 'keine_wette');
  assert.equal(R.pruefeWetten({ '1-5': 1 }).fehler, 'wetten', 'keine Nachbarn auf dem Tisch');
  assert.equal(R.pruefeWetten({ '__proto__': 1 }).fehler, 'keine_wette');
  assert.equal(R.pruefeWetten({ toString: 1 }).fehler, 'wetten');
  assert.equal(R.pruefeWetten({ '1': 0 }).fehler, 'feld_limit');
  assert.equal(R.pruefeWetten({ '1': 1.5 }).fehler, 'feld_limit');
  assert.equal(R.pruefeWetten({ '1': R.FELD_MAX + 1 }).fehler, 'feld_limit');
  const viel = {}; for (let n = 0; n <= 10; n++) viel[String(n)] = 500;
  assert.equal(R.pruefeWetten(viel).fehler, 'runde_limit');
  assert.equal(R.pruefeWetten([1]).fehler, 'wetten');
  assert.deepEqual(R.pruefeWetten({ '0': 5, rot: 10 }), { summe: 15, anzahl: 2 });
});

test('Drehen bucht auf den gemeinsamen Stand, lässt Rocket Reels unangetastet und verändert die Eingabe nicht', () => {
  const z0 = E.neuerZustand(); z0.coins = 300; z0.einsatz = 20; z0.stats.runden = 7;
  const vorher = JSON.stringify(z0);
  const r = R.drehen(z0, { '7': 10, rot: 20 }, folge(7));
  assert.equal(JSON.stringify(z0), vorher);
  assert.equal(r.ergebnis.zahl, 7);
  assert.equal(r.zustand.coins, 300 - 30 + 360 + 40);
  assert.equal(r.zustand.einsatz, 20); assert.equal(r.zustand.stats.runden, 7);
  assert.ok(E.pruefeZustand(r.zustand), 'Rocket Reels akzeptiert den Stand weiter');
  assert.deepEqual(r.zustand.roulette.perm, [7]);
  assert.deepEqual(r.zustand.roulette.stats, { runden: 1, einsatz: 30, gewinn: 400, hoechster: 370, plein: 1 });
  // Verlust
  const v = R.drehen(r.zustand, { schwarz: 50 }, folge(0));
  assert.equal(v.zustand.coins, r.zustand.coins - 50);
  assert.deepEqual(v.zustand.roulette.perm, [0, 7]);
  // zu wenig Coins / kaputter Teil
  assert.equal(R.drehen({ ...z0, coins: 5 }, { rot: 10 }, folge(1)).fehler, 'zu_wenig');
  assert.equal(R.drehen({ ...z0, roulette: { v: 1, perm: [99], stats: R.neueStatistik() } }, { rot: 1 }, folge(1)).fehler, 'zustand');
});

test('Permanenz bleibt auf 50 Zahlen begrenzt; Quote in der Simulation nahe 97,3 %', () => {
  let z = E.neuerZustand(); z.coins = 1e9;
  const zufall = R.kryptoZufall();
  const zaehl = new Array(37).fill(0);
  let einsatz = 0, rueck = 0;
  for (let i = 0; i < 40000; i++) {
    const r = R.drehen(z, { rot: 10, '17': 2, '0-1-2-3': 3, d2: 5 }, zufall);
    z = r.zustand; zaehl[r.ergebnis.zahl]++; einsatz += r.ergebnis.einsatz; rueck += r.ergebnis.rueck;
  }
  assert.equal(z.roulette.perm.length, R.PERM_MAX);
  const q = rueck / einsatz;
  assert.ok(q > 0.92 && q < 1.03, 'Quote ' + q);
  // grobe Gleichverteilung (Chi-Quadrat, 36 Freiheitsgrade, sehr großzügig)
  const e = 40000 / 37; const chi = zaehl.reduce((s, x) => s + (x - e) ** 2 / e, 0);
  assert.ok(chi < 90, 'Chi² ' + chi);
});

test('Gast-Übernahme der Roulette-Statistik', () => {
  const k = R.neuerTeil(); k.stats.runden = 2; k.stats.hoechster = 50;
  const g = R.neuerTeil(); g.stats.runden = 5; g.stats.hoechster = 900; g.perm = [3, 4];
  const m = R.gastZusammen(k, g);
  assert.equal(m.stats.runden, 7); assert.equal(m.stats.hoechster, 900); assert.deepEqual(m.perm, [3, 4]);
  assert.deepEqual(R.gastZusammen(undefined, { kaputt: true }), R.neuerTeil());
});

// ------------------------------------------------------------------ Server (Edge Function "rocket-reels")
const env = { url: 'https://x.supabase.co', serviceKey: 'service' };
const anfrage = (body, token = 'gut') => new Request('https://x.supabase.co/functions/v1/rocket-reels', {
  method: 'POST', headers: { authorization: 'Bearer ' + token, origin: 'https://playsaal.com', 'content-type': 'application/json' }, body: JSON.stringify(body) });
const ruf = async (sb, body, zufall = E.seedZufall(1)) => { const r = await behandle(anfrage(body), env, sb.f, new Date('2026-11-01T12:00:00Z'), zufall); return r.json(); };

test('Server: Roulette und Rocket Reels teilen Coins und Revision; Browser-Beträge werden ignoriert', async () => {
  const sb = ersatzSupabase();
  await ruf(sb, { aktion: 'stand' });
  const a = await ruf(sb, { aktion: 'roulette', wetten: { '5': 10 }, coins: 1e9 }, folge(5));
  assert.equal(a.ok, true); assert.equal(a.ergebnis.zahl, 5);
  assert.equal(a.zustand.coins, E.START_COINS - 10 + 360);
  assert.equal(sb.db.get(UID).revision, 2);
  const b = await ruf(sb, { aktion: 'dreh', einsatz: 10 });
  assert.equal(b.ok, true);
  assert.deepEqual(b.zustand.roulette, a.zustand.roulette, 'Rocket Reels lässt die Roulette-Daten stehen');
  assert.equal(b.zustand.coins, a.zustand.coins - 10 + (b.ergebnis.freispielStart ? b.ergebnis.gewinn : 0), 'Rocket Reels spielt mit den Roulette-Coins weiter');
  const c = await ruf(sb, { aktion: 'roulette', wetten: { '5': 10, x: 1 } });
  assert.equal(c.ok, false); assert.equal(c.grund, 'wetten');
  const d = await ruf(sb, { aktion: 'roulette', wetten: { rot: 500, schwarz: 500, gerade: 500, ungerade: 500, manque: 500, passe: 500, d1: 500, d2: 500, d3: 500, k1: 500, k2: 500 } });
  assert.equal(d.grund, 'runde_limit');
  assert.equal(sb.db.get(UID).revision, 3, 'abgelehnte Wetten speichern nichts');
});

test('Server: Konflikt bucht Roulette nicht doppelt', async () => {
  const sb = ersatzSupabase();
  await ruf(sb, { aktion: 'stand' });
  sb.vorSpeichern = () => { const r = sb.db.get(UID); sb.db.set(UID, { zustand: { ...r.zustand, coins: 777 }, revision: r.revision + 1 }); };
  const a = await ruf(sb, { aktion: 'roulette', wetten: { rot: 100 } });
  assert.equal(a.ok, false); assert.equal(a.grund, 'konflikt');
  assert.equal(a.zustand.coins, 777);
  assert.equal(sb.db.get(UID).zustand.roulette, undefined);
});

test('Server: Gast-Übernahme nimmt Roulette-Statistik einmal mit', async () => {
  const sb = ersatzSupabase();
  await ruf(sb, { aktion: 'stand' });
  const gast = E.neuerZustand(); gast.coins = 4000; gast.roulette = R.neuerTeil(); gast.roulette.stats.runden = 12; gast.roulette.perm = [1, 2, 3];
  const a = await ruf(sb, { aktion: 'gast', gast });
  assert.equal(a.ok, true); assert.equal(a.zustand.coins, 4000); assert.equal(a.zustand.roulette.stats.runden, 12);
  const b = await ruf(sb, { aktion: 'gast', gast });
  assert.equal(b.grund, 'schon_uebernommen');
});
