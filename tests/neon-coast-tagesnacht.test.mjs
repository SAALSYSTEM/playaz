// NEON COAST – Tagesnacht: Aufzeichnung, Nachprüfung und Prüf-Funktion (supabase/functions/neon-coast-lauf), ohne Netzwerk.
// Start: node --test tests/neon-coast-tagesnacht.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { behandle, berlinTag } from '../supabase/functions/neon-coast-lauf/handler.js';
import { SIM_VERSION, pruefeLauf, packe, entpacke, kodiere, dekodiere, tagesAuto, tagFahrt, TAG } from '../supabase/functions/neon-coast-lauf/tagesnacht.js';
import { botNacht } from '../tools/neon-coast-bot.mjs';

const UID = '33333333-3333-4333-8333-333333333333';
const env = { url: 'https://x.supabase.co', serviceKey: 'service-geheim' };
const JETZT = new Date('2026-11-14T18:00:00Z');
const SEED = berlinTag(JETZT);
// Eine Nacht mit gesicherter Beute suchen (der Bot ist kein Profi)
let NACHT = null;
for (const gier of [1, 2, 3]) { const n = botNacht(SEED, gier); if (n.S.sicher > 0) { NACHT = n; break; } }
const LAUF = NACHT.lauf;

function ersatz({ sitzungOk = true, rpcAntwort = { ok: true, platz_heute: 1, spieler_heute: 3, platz_monat: 2 } } = {}) {
  const aufrufe = [];
  const f = async (url, o) => {
    aufrufe.push({ url, o });
    if (url.endsWith('/auth/v1/user')) return sitzungOk ? new Response(JSON.stringify({ id: UID }), { status: 200 }) : new Response('{}', { status: 401 });
    if (url.endsWith('/rpc/neon_coast_eintragen')) return new Response(JSON.stringify(rpcAntwort), { status: 200 });
    throw new Error('unerwartet ' + url);
  };
  return { f, aufrufe };
}
const anfrage = (body, { token = 'tok', origin = 'https://playsaal.com', methode = 'POST' } = {}) =>
  new Request('https://x.supabase.co/functions/v1/neon-coast-lauf', { method: methode, headers: { origin, ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: methode === 'POST' ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined });
const json = async (r) => ({ status: r.status, ...(await r.json()) });
const rpcs = (a) => a.filter((x) => x.url.includes('/rpc/')).length;

test('Kopien in der Edge Function entsprechen dem Spiel', () => {
  for (const f of ['tagesnacht.js', 'engine.js', 'welt.js', 'daten.js', 'bilder.js', 'det.js']) {
    assert.equal(readFileSync(new URL('../supabase/functions/neon-coast-lauf/' + f, import.meta.url), 'utf8'), readFileSync(new URL('../public/spiele/neon-coast/' + f, import.meta.url), 'utf8'), f + ' veraltet: node tools/edge-sync.mjs');
  }
});

test('Eingaben: kodieren, packen und entpacken ohne Verlust; Unsinn wird abgelehnt', () => {
  for (const e of [{}, { lenk: -1, gas: true }, { lenk: 0.43, bremse: true, hand: true }, { lenk: 1, nitro: true, gas: true }]) {
    const d = dekodiere(kodiere(e)); assert.equal(kodiere(d), kodiere(e));
    assert.ok(Math.abs(d.lenk - (e.lenk || 0)) <= 1 / 30 + 1e-9);
  }
  const codes = [15, 15, 15, 47, 47, 1, 30, 30, 30, 30, 511 - 1];
  assert.deepEqual(entpacke(packe(codes)), codes);
  assert.deepEqual(entpacke(packe(NACHT.codes)), NACHT.codes);
  for (const t of ['', 'x!', 'v', 'f*0', 'zz*zzzz', '15*' + (TAG.maxTakte + 1).toString(36)]) assert.equal(entpacke(t), null, t);
});

test('Tagesnacht: gleicher Tag = gleiche Nacht, Auto wechselt täglich, endet bei Sonnenaufgang', () => {
  const a = tagFahrt(SEED), b = tagFahrt(SEED), c = tagFahrt(SEED + 1);
  assert.deepEqual(a.koffer.map((k) => [k.x, k.y]), b.koffer.map((k) => [k.x, k.y]));
  assert.notDeepEqual(a.koffer.map((k) => [k.x, k.y]), c.koffer.map((k) => [k.x, k.y]));
  assert.notEqual(tagesAuto(SEED).id, tagesAuto(SEED + 1).id);
  assert.equal(a.sichtweite, TAG.sichtweite);
  // ohne Unfall: nur kurz anfahren, dann stehen bleiben -> nach 150 s ist Schluss
  const S = tagFahrt(SEED); let n = 0;
  while (!S.ende && n < TAG.maxTakte) { S.sp.hp = S.sp.hpMax; S.haft = 0; S.fahndung = 0; S.sterne = 0; S.sp.vx = S.sp.vy = 0; schritt(S, n < 2 ? { gas: true } : {}); S.ev.length = 0; n++; }
  assert.equal(S.ende && S.ende.grund, 'morgen'); assert.ok(Math.abs(S.t - TAG.dauer) < 0.02);
});
import { schritt } from '../supabase/functions/neon-coast-lauf/engine.js';

test('Nachprüfung: echte Nacht passt, veränderte Zahlen oder Eingaben nicht', () => {
  const r = pruefeLauf(LAUF);
  assert.equal(r.ok, true, JSON.stringify(r)); assert.equal(r.sicher, LAUF.sicher);
  for (const l of [{ ...LAUF, sicher: LAUF.sicher + 50 }, { ...LAUF, koffer: LAUF.koffer + 1 }, { ...LAUF, takte: LAUF.takte - 1 }, { ...LAUF, seed: LAUF.seed + 1 }, { ...LAUF, v: SIM_VERSION + 1 }]) {
    assert.equal(pruefeLauf(l).ok, false, JSON.stringify({ ...l, inputs: '…' }));
  }
  // andere Lenkung in der Mitte der Nacht ergibt eine andere Nacht
  const c = entpacke(LAUF.inputs); const m = Math.floor(c.length / 3); for (let i = m; i < m + 60; i++) c[i] = (c[i] & ~31) | 30;
  assert.equal(pruefeLauf({ ...LAUF, inputs: packe(c) }).ok, false);
  // Takte vor dem ersten Gas dürfen nicht mitgeschickt werden
  assert.equal(pruefeLauf({ ...LAUF, takte: LAUF.takte + 1, inputs: packe([15, ...entpacke(LAUF.inputs)]) }).grund, 'eingaben');
});

test('Prüf-Funktion: echte Nacht wird eingetragen (Beute vom Server)', async () => {
  const { f, aufrufe } = ersatz();
  const r = await json(await behandle(anfrage(LAUF), env, f, JETZT));
  assert.equal(r.status, 200); assert.equal(r.verifiziert, true, JSON.stringify(r)); assert.equal(r.beute, LAUF.sicher); assert.equal(r.platz_heute, 1);
  const body = JSON.parse(aufrufe.find((a) => a.url.includes('/rpc/')).o.body);
  assert.deepEqual([body.p_user, body.p_seed, body.p_beute, body.p_koffer, body.p_takte, body.p_version], [UID, SEED, LAUF.sicher, LAUF.koffer, LAUF.takte, SIM_VERSION]);
});

test('Prüf-Funktion: falsche Zahlen, alter Tag, alte Version, keine Beute', async () => {
  for (const [l, grund] of [[{ ...LAUF, sicher: LAUF.sicher * 2 }, 'abweichung'], [{ ...LAUF, v: SIM_VERSION + 1 }, 'version'], [{ ...LAUF, sicher: 0 }, 'keine_beute']]) {
    const { f, aufrufe } = ersatz();
    const r = await json(await behandle(anfrage(l), env, f, JETZT));
    assert.equal(r.verifiziert, false); assert.equal(r.grund, grund); assert.equal(rpcs(aufrufe), 0);
  }
  const alt = botNacht(berlinTag(JETZT, -2), 1).lauf;
  assert.equal((await json(await behandle(anfrage({ ...alt, sicher: Math.max(1, alt.sicher) }), env, ersatz().f, JETZT))).grund, 'tag');
});

test('Prüf-Funktion: Anmeldung, Methode, JSON, CORS, Grenzen der Datenbank', async () => {
  let { f, aufrufe } = ersatz();
  assert.equal((await behandle(anfrage(LAUF, { token: '' }), env, f, JETZT)).status, 401);
  ({ f } = ersatz({ sitzungOk: false }));
  assert.equal((await behandle(anfrage(LAUF), env, f, JETZT)).status, 401);
  ({ f, aufrufe } = ersatz());
  assert.equal((await behandle(anfrage('{kaputt'), env, f, JETZT)).status, 400);
  assert.equal(rpcs(aufrufe), 0);
  assert.equal((await behandle(anfrage(null, { methode: 'GET' }), env, f, JETZT)).status, 405);
  const o = await behandle(anfrage(null, { methode: 'OPTIONS' }), env, f, JETZT);
  assert.equal(o.headers.get('access-control-allow-origin'), 'https://playsaal.com');
  const fremd = await behandle(anfrage(LAUF, { origin: 'https://boese.example' }), env, ersatz().f, JETZT);
  assert.equal(fremd.headers.get('access-control-allow-origin'), null);
  ({ f } = ersatz({ rpcAntwort: { ok: false, grund: 'zu_oft' } }));
  assert.equal((await json(await behandle(anfrage(LAUF), env, f, JETZT))).grund, 'zu_oft');
  // Grenzen in der Migration passen zur längsten möglichen Nacht
  const sql = readFileSync(new URL('../supabase/migrations/20261114120000_neon_coast_tagesnacht.sql', import.meta.url), 'utf8');
  assert.ok(TAG.maxTakte <= 20000 && sql.includes('takte between 1 and 20000'));
});
