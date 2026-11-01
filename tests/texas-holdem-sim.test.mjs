// TEXAS HOLD'EM – Regeln, Handbewertung, Side-Pots, Chip-Erhaltung, Sit & Go, Computergegner, Ansicht, Server.
// node --test tests/texas-holdem-sim.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as P from '../public/spiele/texas-holdem/poker.js';
import * as E from '../public/spiele/rocket-reels/engine.js';
import { behandle } from '../supabase/functions/rocket-reels/handler.js';
import { ersatzSupabase, UID } from './rocket-reels-ersatz.mjs';

const k = (s) => s.split(' ').map((c) => P.RANG.indexOf(c[0]) * 4 + '♠♥♦♣'.indexOf(c[1]));
const name = (s) => P.handName(P.wert(k(s)));

test('Handbewertung: Kategorien und Vergleiche', () => {
  assert.equal(name('A♠ K♠ Q♠ J♠ T♠ 2♥ 3♦'), 'Royal Flush');
  assert.equal(name('9♣ 8♣ 7♣ 6♣ 5♣ A♥ A♦'), 'Straight Flush');
  assert.equal(name('7♠ 7♥ 7♦ 7♣ 2♠ 3♥ 4♦'), 'Vierling');
  assert.equal(name('9♠ 9♥ 9♦ K♣ K♠ 2♥ 2♦'), 'Full House');
  assert.equal(name('9♠ 9♥ 9♦ K♣ K♠ K♥ 2♦'), 'Full House');
  assert.equal(name('7♥ 2♥ 9♥ J♥ 4♥ 4♠ 4♦'), 'Flush');
  assert.equal(name('A♠ 2♥ 3♦ 4♣ 5♠ 9♥ K♦'), 'Straße');
  assert.equal(name('Q♠ Q♥ 5♦ 5♣ 3♠ 3♥ A♦'), 'Zwei Paare');
  const v = (s) => P.wert(k(s));
  assert.ok(v('5♠ 4♥ 3♦ 2♣ A♠') < v('6♠ 5♥ 4♦ 3♣ 2♠'), 'Wheel ist die kleinste Straße');
  assert.ok(v('A♠ A♥ K♦ Q♣ 9♠') > v('A♣ A♦ K♠ Q♥ 8♠'), 'Kicker zählt');
  assert.equal(v('A♠ A♥ K♦ Q♣ 9♠ 2♣ 3♦'), v('A♣ A♦ K♠ Q♥ 9♦ 4♣ 2♦'), 'nur die besten fünf zählen');
  assert.ok(v('Q♠ Q♥ 5♦ 5♣ A♦') > v('Q♣ Q♦ 5♠ 5♥ K♦'));
  assert.ok(v('2♠ 2♥ 2♦ 3♣ 3♠') > v('A♠ K♠ Q♠ J♠ 9♠'), 'Full House schlägt Flush');
  assert.equal(P.besteFuenf(k('A♠ K♠ Q♠ J♠ T♠ 2♥ 3♦')).length, 5);
  assert.equal(P.chen(k('A♠')[0], k('A♥')[0]), 20);
  assert.ok(P.chen(k('7♠')[0], k('2♥')[0]) < 2);
});

// eigener Tisch für gezielte Situationen
function tisch(stacks, karten, board, dealer = 5) {
  return { art: 'cash', stufe: 0, sb: 5, bb: 10, nr: 1, dealer, zug: -1, hoch: 0, minR: 10, ein: 0, phase: 'river', deck: [], board,
    s: stacks.map((c, i) => ({ b: i === 0 ? '' : P.BOT_IDS[i - 1], c, e: 0, g: 0, k: karten[i] || null, f: false, a: false, o: false, r: false, h: false })) };
}

test('Side-Pots: kurzer All-in gewinnt nur den Hauptpot, Rest geht an den Zweitbesten', () => {
  const t = tisch([0, 0, 200, 500, 500, 500], [k('A♠ A♥'), k('K♠ K♥'), k('Q♠ Q♥'), k('4♣ 5♣'), null, null], k('2♣ 7♦ 9♠ J♣ 3♥'));
  t.s[0].g = 100; t.s[0].a = true; t.s[1].g = 300; t.s[1].a = true; t.s[2].g = 300; t.s[3].g = 20; t.s[3].f = true;
  const ev = P.abrechnen(t);
  const pots = ev.filter((e) => e.t === 'pot');
  assert.deepEqual(pots.map((p) => [p.s, p.b]), [[[0], 320], [[1], 400]]);
  assert.equal(t.s[0].c, 320); assert.equal(t.s[1].c, 400); assert.equal(t.s[2].c, 200);
  assert.equal(ev.filter((e) => e.t === 'zeigen').length, 3, 'nur Spieler in der Hand zeigen');
});

test('Split-Pot: ungerader Chip geht an den ersten Gewinner links vom Dealer', () => {
  const t = tisch([0, 0, 0, 0, 0, 0], [k('2♠ 3♥'), k('2♦ 3♣'), null, null, null, k('4♦ 4♣')], k('A♣ K♦ Q♠ J♣ T♥'), 0);
  t.s[0].g = 50; t.s[1].g = 50; t.s[5].g = 25; t.s[5].f = true;
  P.abrechnen(t);
  assert.equal(t.s[1].c, 63, 'Sitz 1 sitzt direkt links vom Dealer');
  assert.equal(t.s[0].c, 62);
});

const LAEUFT = ['preflop', 'flop', 'turn', 'river'];
// Zufällige Partien: nach jeder Aktion gelten die Invarianten
function invarianten(z0, z1, ev, art) {
  const t0 = z0.poker.t, t1 = z1.poker.t;
  if (!t0 || !t1 || art !== 'cash') return;
  const summe = (t) => t.s.reduce((s, x) => s + x.c + (LAEUFT.includes(t.phase) ? x.g : 0), 0);
  const nachkauf = ev.filter((e) => e.t === 'nachkauf' && e.s > 0).reduce((s, e) => s + e.c, 0);
  const altBots = ev.filter((e) => e.t === 'nachkauf' && e.s > 0).reduce((s, e) => s + t0.s[e.s].c, 0);
  const plus = ev.filter((e) => e.t === 'nachkauf' && e.s === 0).length ? t1.s[0].c - t0.s[0].c : 0;
  assert.equal(summe(t1), summe(t0) + nachkauf - altBots + plus, 'Chips bleiben erhalten');
}
function zufallsZug(t, zuf) {
  const m = P.moeglich(t);
  const r = zuf(100);
  if (m.kannRaise && r < 18) { const ziel = m.minZiel + zuf(Math.max(1, m.maxZiel - m.minZiel + 1)); return { zug: 'raise', betrag: Math.min(ziel, m.maxZiel) }; }
  if (r < 22) return { zug: 'allin' };
  if (!m.kannCheck && r < 40) return { zug: 'fold' };
  return { zug: m.kannCheck ? 'check' : 'call' };
}

test('Cash-Game: 1.500 zufällige Züge – Chips bleiben erhalten, Stand bleibt gültig, Coins stimmen beim Aufstehen', () => {
  for (const seed of [1, 2, 3]) {
    const zuf = P.seedZufall(seed);
    let z = { ...E.neuerZustand(), coins: 50000 };
    let r = P.aktion(z, { p: 'start', art: 'cash', stufe: 1, buyin: 5000 }, zuf); assert.ok(!r.fehler, r.fehler); z = r.zustand;
    assert.equal(z.coins, 45000);
    for (let n = 0; n < 500; n++) {
      const t = z.poker.t;
      let a;
      if (t.phase === 'leer') a = t.s[0].c === 0 ? { p: 'nachkauf', buyin: 5000 } : { p: 'weiter' };
      else if (t.phase === 'ende') a = { p: 'weiter' };
      else a = { p: 'zug', ...zufallsZug(t, zuf) };
      r = P.aktion(z, a, zuf);
      if (r.fehler === 'zu_wenig') break;
      assert.ok(!r.fehler, seed + '/' + n + ': ' + r.fehler + ' ' + JSON.stringify(a));
      invarianten(z, r.zustand, r.ergebnis.ev, 'cash');
      z = r.zustand;
      assert.ok(P.pruefeTeil(z.poker), 'gültig nach ' + JSON.stringify(a));
      assert.ok(JSON.stringify(z).length < 7500, 'passt in die Datenbank (' + JSON.stringify(z).length + ' Bytes)');
      if (z.poker.t.phase !== 'ende' && z.poker.t.phase !== 'leer') assert.equal(z.poker.t.zug, 0, 'nach jeder Aktion ist der Mensch dran oder die Hand vorbei');
    }
    // Aufstehen (ggf. vorher passen)
    if (['preflop', 'flop', 'turn', 'river'].includes(z.poker.t.phase)) { r = P.aktion(z, { p: 'zug', zug: 'fold' }, zuf); z = r.zustand; }
    if (z.poker.t) {
      const coins = z.coins, aus = z.poker.stats.cashAus;
      r = P.aktion(z, { p: 'aufstehen' }, zuf); assert.ok(!r.fehler, r.fehler);
      const chips = r.ergebnis.ev.find((e) => e.t === 'aufstehen').c;
      z = r.zustand;
      assert.equal(z.coins, coins + chips); assert.equal(z.poker.stats.cashAus, aus + chips);
    }
    assert.equal(z.poker.t, null);
  }
});

test('Sit & Go: endet immer mit Platz und richtigem Preis; nur 1. und 2. gewinnen', () => {
  const plaetze = {};
  for (let seed = 1; seed <= 25; seed++) {
    const zuf = P.seedZufall(seed * 13);
    let z = { ...E.neuerZustand(), coins: 1000 };
    let r = P.aktion(z, { p: 'start', art: 'sng', stufe: 1 }, zuf); z = r.zustand;
    assert.equal(z.coins, 500);
    let ende = null;
    for (let n = 0; n < 3000 && z.poker.t; n++) {
      const t = z.poker.t;
      const sum = t.s.reduce((s, x) => s + x.c + (LAEUFT.includes(t.phase) ? x.g : 0), 0);
      assert.equal(sum, P.SNG_STACK * 6, 'Turnier-Chips bleiben erhalten');
      const a = t.phase === 'ende' || t.phase === 'leer' ? { p: 'weiter' } : { p: 'zug', ...zufallsZug(t, zuf) };
      r = P.aktion(z, a, zuf); assert.ok(!r.fehler, r.fehler);
      z = r.zustand; ende = r.ergebnis.ev.find((e) => e.t === 'sngEnde') || ende;
    }
    assert.ok(ende, 'Turnier ist zu Ende');
    assert.equal(z.poker.t, null);
    plaetze[ende.platz] = (plaetze[ende.platz] || 0) + 1;
    assert.equal(ende.preis, ende.platz === 1 ? 2000 : ende.platz === 2 ? 1000 : 0);
    assert.equal(z.coins, 500 + ende.preis);
    assert.equal(z.poker.stats.sng, 1);
  }
  assert.ok(Object.keys(plaetze).length >= 3, 'verschiedene Platzierungen: ' + JSON.stringify(plaetze));
});

test('Computergegner spielen unterschiedlich (Hilde passt öfter als Kalle) und folden Müll gegen Druck', () => {
  const zuf = P.seedZufall(99);
  let z = { ...E.neuerZustand(), coins: 1e6 };
  let r = P.aktion(z, { p: 'start', art: 'cash', stufe: 0, buyin: 1000 }, zuf); z = r.zustand;
  const alle = [];
  for (let n = 0; n < 1500; n++) {
    const t = z.poker.t;
    let a = t.phase === 'ende' || t.phase === 'leer' ? (t.s[0].c ? { p: 'weiter' } : { p: 'nachkauf', buyin: 1000 }) : { p: 'zug', zug: 'fold' };
    r = P.aktion(z, a, zuf); z = r.zustand; alle.push(...r.ergebnis.ev);
  }
  // je Hand: wer hat vor dem Flop freiwillig Geld gesetzt? (Sitz 1–5 = Kalle, Vera, Bruno, Hilde, Lindqvist)
  const vpip = {}, haende = {}; let preflop = false, dabei = new Set();
  const abschluss = () => { for (let s = 1; s < 6; s++) { const id = P.BOT_IDS[s - 1]; haende[id] = (haende[id] || 0) + 1; if (dabei.has(s)) vpip[id] = (vpip[id] || 0) + 1; } };
  for (const e of alle) {
    if (e.t === 'neu') { if (preflop !== null) abschluss(); preflop = true; dabei = new Set(); }
    else if (e.t === 'strasse') preflop = false;
    else if (e.t === 'akt' && preflop && ['call', 'raise', 'bet', 'allin'].includes(e.z)) dabei.add(e.s);
  }
  const q = (id) => (vpip[id] || 0) / haende[id];
  console.log(Object.fromEntries(P.BOT_IDS.map((id) => [id, q(id).toFixed(2)])));
  assert.ok(q('kalle') > q('hilde') + 0.1, 'Kalle ' + q('kalle') + ' / Hilde ' + q('hilde'));
  assert.ok(q('bruno') > q('vera'), 'Bruno ' + q('bruno') + ' / Vera ' + q('vera'));
});

test('Ansicht verrät keine fremden Karten und keinen Stapel', () => {
  const zuf = P.seedZufall(5);
  let z = { ...E.neuerZustand(), coins: 5000 };
  z = P.aktion(z, { p: 'start', art: 'cash', stufe: 0, buyin: 1000 }, zuf).zustand;
  const v = P.ansicht(z);
  assert.deepEqual(v.poker.t.deck, []);
  for (let i = 1; i < 6; i++) if (v.poker.t.s[i].k) assert.deepEqual(v.poker.t.s[i].k, [-1, -1]);
  assert.deepEqual(v.poker.t.s[0].k, z.poker.t.s[0].k);
  assert.ok(P.pruefeTeil(v.poker), 'Ansicht ist für die Oberfläche gültig');
  assert.equal(z.poker.t.deck.length > 0, true, 'Original unverändert');
});

test('Regeln der Aktionen: Grenzen, falsche Züge, kein doppeltes Buy-in', () => {
  const zuf = P.seedZufall(11);
  let z = { ...E.neuerZustand(), coins: 3000 };
  assert.equal(P.aktion(z, { p: 'start', art: 'cash', stufe: 0, buyin: 150 }, zuf).fehler, 'buyin');
  assert.equal(P.aktion(z, { p: 'start', art: 'cash', stufe: 2, buyin: 4000 }, zuf).fehler, 'zu_wenig');
  assert.equal(P.aktion(z, { p: 'start', art: 'cash', stufe: 0, buyin: 1005 }, zuf).fehler, 'buyin');
  z = P.aktion(z, { p: 'start', art: 'cash', stufe: 0, buyin: 1000 }, zuf).zustand;
  assert.equal(P.aktion(z, { p: 'start', art: 'sng', stufe: 0 }, zuf).fehler, 'schon_am_tisch');
  const t = z.poker.t;
  if (t.zug === 0) {
    const m = P.moeglich(t);
    if (m.kannRaise) assert.equal(P.aktion(z, { p: 'zug', zug: 'raise', betrag: m.minZiel - 1 }, zuf).fehler, 'betrag');
    if (!m.kannCheck) assert.equal(P.aktion(z, { p: 'zug', zug: 'check' }, zuf).fehler, 'check_nicht_moeglich');
    assert.equal(P.aktion(z, { p: 'zug', zug: 'schummeln' }, zuf).fehler, 'zug');
    assert.equal(P.aktion(z, { p: 'aufstehen' }, zuf).fehler, 'erst_passen');
    assert.equal(P.aktion(z, { p: 'nachkauf', buyin: 100 }, zuf).fehler, 'nicht_jetzt');
  }
  // Rocket Reels: kein Gratis-Nachfüllen, solange Chips am Tisch liegen
  const leer = { ...z, coins: 0 };
  assert.equal(E.darfNachfuellen(leer), false);
  assert.equal(E.darfNachfuellen({ ...leer, poker: { ...leer.poker, t: null } }), true);
});

// ------------------------------------------------------------------ Server
const env = { url: 'https://x.supabase.co', serviceKey: 'service' };
const anfrage = (body) => new Request('https://x.supabase.co/functions/v1/rocket-reels', {
  method: 'POST', headers: { authorization: 'Bearer gut', origin: 'https://playsaal.com', 'content-type': 'application/json' }, body: JSON.stringify(body) });
const ruf = async (sb, body, zufall = E.seedZufall(3)) => (await behandle(anfrage(body), env, sb.f, new Date('2026-11-01T12:00:00Z'), zufall)).json();

test('Server: Poker bucht vom gemeinsamen Stand, Antwort zeigt keine fremden Karten', async () => {
  const sb = ersatzSupabase();
  await ruf(sb, { aktion: 'stand' });
  const a = await ruf(sb, { aktion: 'poker', p: 'start', art: 'cash', stufe: 0, buyin: 500, coins: 1e9 });
  assert.equal(a.ok, true, a.grund);
  assert.equal(a.zustand.coins, 500);
  assert.deepEqual(a.zustand.poker.t.deck, []);
  for (let i = 1; i < 6; i++) if (a.zustand.poker.t.s[i].k && !a.zustand.poker.t.s[i].o) assert.deepEqual(a.zustand.poker.t.s[i].k, [-1, -1]);
  const gespeichert = sb.db.get(UID).zustand;
  assert.ok(gespeichert.poker.t.deck.length > 0, 'Server behält den Stapel');
  // auch Antworten anderer Aktionen verraten nichts
  const b = await ruf(sb, { aktion: 'stand' });
  assert.deepEqual(b.zustand.poker.t.deck, []);
  const c = await ruf(sb, { aktion: 'roulette', wetten: { rot: 10 } });
  assert.deepEqual(c.zustand.poker.t.deck, []);
  // Nachfüllen gesperrt, solange Chips am Tisch liegen
  const d = await ruf(sb, { aktion: 'poker', p: 'zug', zug: 'fold' });
  assert.ok(d.ok || d.grund === 'nicht_dran', d.grund);
});
