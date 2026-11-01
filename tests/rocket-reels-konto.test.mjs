// ROCKET REELS – Edge Function "rocket-reels" unter Node mit einer Ersatz-Datenbank (Revisionen wie in der Migration).
// Prüft: Anmeldung nötig, Server rechnet selbst (Coins aus dem Browser werden ignoriert), Konflikte/Doppeltipp buchen nichts doppelt,
// Gast-Übernahme genau einmal und gedeckelt, kaputte Stände werden nie überschrieben, CORS.
// node --test tests/rocket-reels-konto.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { behandle } from '../supabase/functions/rocket-reels/handler.js';
import * as E from '../public/spiele/rocket-reels/engine.js';
import { ersatzSupabase, UID } from './rocket-reels-ersatz.mjs';

const env = { url: 'https://x.supabase.co', serviceKey: 'service' };
const anfrage = (body, token = 'gut', origin = 'https://playsaal.com') => new Request('https://x.supabase.co/functions/v1/rocket-reels', {
  method: 'POST', headers: { authorization: 'Bearer ' + token, origin, 'content-type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body) });
const ruf = async (sb, body, opt = {}) => { const r = await behandle(anfrage(body, opt.token), env, sb.f, opt.jetzt || new Date('2026-11-01T12:00:00Z'), opt.zufall || E.seedZufall(1)); return { status: r.status, d: await r.json(), r }; };

test('ohne gültige Anmeldung passiert nichts', async () => {
  const sb = ersatzSupabase();
  assert.equal((await ruf(sb, { aktion: 'stand' }, { token: 'falsch' })).status, 401);
  assert.equal(sb.db.size, 0);
  const r = await behandle(new Request('https://x/f', { method: 'POST', body: '{}' }), env, sb.f);
  assert.equal(r.status, 401);
  assert.equal((await ruf(sb, { aktion: 'geld_drucken' })).status, 400);
  assert.equal((await ruf(sb, 'kein json')).status, 400);
  assert.equal((await ruf(sb, { aktion: 'stand', x: 'a'.repeat(20000) })).status, 413);
});

test('erster Aufruf legt Konto-Stand mit Startcoins an, zweiter liest nur', async () => {
  const sb = ersatzSupabase();
  const a = await ruf(sb, { aktion: 'stand' });
  assert.equal(a.d.ok, true); assert.equal(a.d.zustand.coins, E.START_COINS); assert.equal(sb.db.get(UID).revision, 1);
  const b = await ruf(sb, { aktion: 'stand' });
  assert.equal(b.d.ok, true); assert.equal(sb.db.get(UID).revision, 1, 'Lesen speichert nicht');
});

test('Server rechnet selbst: mitgeschickte Coins/Gewinne werden ignoriert', async () => {
  const sb = ersatzSupabase();
  await ruf(sb, { aktion: 'stand' });
  const r = await ruf(sb, { aktion: 'dreh', einsatz: 20, coins: 999999, gewinn: 5000, zustand: { coins: 1e9 } });
  assert.equal(r.d.ok, true);
  const erwartet = E.aktion(E.neuerZustand(), { typ: 'dreh', einsatz: 20 }, E.seedZufall(1), { tag: '2026-11-01' });
  assert.deepEqual(r.d.zustand, erwartet.zustand);
  assert.deepEqual(sb.db.get(UID).zustand, erwartet.zustand);
  assert.ok(r.d.zustand.coins <= E.START_COINS - 20 + r.d.ergebnis.gewinn);
  // ungültiger Einsatz
  const f = await ruf(sb, { aktion: 'dreh', einsatz: 7 });
  assert.equal(f.d.ok, false); assert.equal(f.d.grund, 'einsatz');
});

test('Konflikt (anderer Tab war schneller): Aktion wird nicht gebucht, aktueller Stand kommt zurück', async () => {
  const sb = ersatzSupabase();
  await ruf(sb, { aktion: 'stand' });
  sb.vorSpeichern = () => { const r = sb.db.get(UID); r.zustand = { ...r.zustand, coins: 777 }; r.revision++; };
  const k = await ruf(sb, { aktion: 'dreh', einsatz: 10 });
  assert.equal(k.d.ok, false); assert.equal(k.d.grund, 'konflikt'); assert.equal(k.d.zustand.coins, 777);
  assert.equal(sb.db.get(UID).zustand.coins, 777);
});

test('Doppeltes Sichern und Hyperjump über den Server: nie doppelt gutgeschrieben', async () => {
  const sb = ersatzSupabase();
  sb.db.set(UID, { zustand: { ...E.neuerZustand(), coins: 500, phase: 'gewinn', offen: 100 }, revision: 3 });
  const [a, b] = await Promise.all([ruf(sb, { aktion: 'sichern' }), ruf(sb, { aktion: 'sichern' })]);
  const oks = [a, b].filter((x) => x.d.ok).length;
  assert.equal(oks, 1, 'genau ein Sichern gelingt');
  assert.equal(sb.db.get(UID).zustand.coins, 600);
  // Risiko: 50 %-Entscheidung kommt vom Server-Zufall, die Route ist egal
  sb.db.set(UID, { zustand: { ...E.neuerZustand(), coins: 500, phase: 'gewinn', offen: 100 }, revision: 9 });
  assert.equal((await ruf(sb, { aktion: 'risiko' })).d.ok, true);
  const s = await ruf(sb, { aktion: 'sprung', route: 1 }, { zufall: () => 1 });
  assert.equal(s.d.ergebnis.erfolg, true); assert.equal(sb.db.get(UID).zustand.offen, 200); assert.equal(sb.db.get(UID).zustand.coins, 500);
  const v = await ruf(sb, { aktion: 'sprung', route: 0 }, { zufall: () => 0 });
  assert.equal(v.d.ergebnis.erfolg, false); assert.equal(sb.db.get(UID).zustand.coins, 500); assert.equal(sb.db.get(UID).zustand.phase, 'bereit');
  assert.equal((await ruf(sb, { aktion: 'sichern' })).d.ok, false, 'verlorener Gewinn kann nicht gesichert werden');
});

test('Tagesbonus nach Berliner Datum, einmal je Tag', async () => {
  const sb = ersatzSupabase();
  await ruf(sb, { aktion: 'stand' });
  const spaet = new Date('2026-11-01T23:30:00Z'); // in Berlin schon der 2. November
  assert.equal((await ruf(sb, { aktion: 'tagesbonus' }, { jetzt: spaet })).d.zustand.tagesbonus, '2026-11-02');
  assert.equal((await ruf(sb, { aktion: 'tagesbonus' }, { jetzt: spaet })).d.grund, 'schon_abgeholt');
  assert.equal(sb.db.get(UID).zustand.coins, E.START_COINS + E.TAGESBONUS);
});

test('Gast-Übernahme: einmal je Konto, höherer Stand, gedeckelt, Unsinn abgelehnt', async () => {
  const sb = ersatzSupabase();
  const gast = { ...E.neuerZustand(), coins: 3000, stats: { ...E.neueStatistik(), runden: 40, einsatz: 800, gewinn: 2800, hoechster: 400 } };
  const a = await ruf(sb, { aktion: 'gast', gast });
  assert.equal(a.d.ok, true); assert.equal(a.d.zustand.coins, 3000); assert.equal(a.d.zustand.gastUebernommen, true);
  const b = await ruf(sb, { aktion: 'gast', gast });
  assert.equal(b.d.ok, false); assert.equal(b.d.grund, 'schon_uebernommen'); assert.equal(sb.db.get(UID).zustand.coins, 3000);
  const sb2 = ersatzSupabase();
  const c = await ruf(sb2, { aktion: 'gast', gast: { ...gast, coins: 5e8 } });
  assert.equal(c.d.zustand.coins, E.GAST_IMPORT_MAX);
  const sb3 = ersatzSupabase();
  assert.equal((await ruf(sb3, { aktion: 'gast', gast: { coins: 1e9 } })).d.grund, 'gast_ungueltig');
  assert.equal(sb3.db.size, 0);
});

test('Kaputter Server-Stand wird nie still überschrieben', async () => {
  const sb = ersatzSupabase();
  sb.db.set(UID, { zustand: { kaputt: true }, revision: 5 });
  const r = await ruf(sb, { aktion: 'dreh', einsatz: 10 });
  assert.equal(r.status, 500); assert.equal(r.d.grund, 'stand_defekt');
  assert.deepEqual(sb.db.get(UID).zustand, { kaputt: true });
});

test('Konten sind getrennt; CORS nur für playsaal.com', async () => {
  const sb = ersatzSupabase();
  await ruf(sb, { aktion: 'stand' }); await ruf(sb, { aktion: 'dreh', einsatz: 100 });
  const zwei = await ruf(sb, { aktion: 'stand' }, { token: 'zwei' });
  assert.equal(zwei.d.zustand.coins, E.START_COINS);
  assert.equal(sb.db.size, 2);
  assert.equal(zwei.r.headers.get('access-control-allow-origin'), 'https://playsaal.com');
  const fremd = await behandle(anfrage({ aktion: 'stand' }, 'gut', 'https://boese.example'), env, sb.f);
  assert.equal(fremd.headers.get('access-control-allow-origin'), null);
  const opt = await behandle(new Request('https://x/f', { method: 'OPTIONS', headers: { origin: 'https://playsaal.com' } }), env, sb.f);
  assert.equal(opt.status, 204);
});

test('Ganzer Bonus über den Server: Freispiele einzeln, Gutschrift genau einmal', async () => {
  const sb = ersatzSupabase();
  await ruf(sb, { aktion: 'stand' });
  const s3 = [E.BAENDER[0].indexOf(E.WILD), E.BAENDER[1].indexOf(E.WILD), E.BAENDER[2].indexOf(E.WILD), 5, 5];
  const q = [...s3, 4];
  const folge = (n) => (q.length ? q.shift() : E.seedZufall(5)(n));
  const t = await ruf(sb, { aktion: 'dreh', einsatz: 10 }, { zufall: folge });
  assert.equal(t.d.zustand.phase, 'bonus');
  const vorher = t.d.zustand.coins; let summe = 0, n = 0, z = t.d.zustand;
  const zuf = E.seedZufall(99);
  while (z.phase === 'bonus') {
    const r = await ruf(sb, { aktion: 'dreh', einsatz: 100 }, { zufall: zuf });
    assert.equal(r.d.ok, true); summe += r.d.ergebnis.gewinn; n++; z = r.d.zustand;
    assert.ok(n <= E.FREISPIELE_MAX);
  }
  assert.equal(z.coins, vorher + summe);
  assert.equal(sb.db.get(UID).zustand.coins, vorher + summe);
});
