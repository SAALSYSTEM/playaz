// Prüf-Funktion für PUTT-PROFI (supabase/functions/putt-profi-runde/handler.js), ohne Netzwerk.
// Start: node --test tests/putt-profi-pruefung.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { behandle, berlinTag } from '../supabase/functions/putt-profi-runde/handler.js';
import * as L from '../supabase/functions/putt-profi-runde/logik.js';

const UID = '22222222-2222-4222-8222-222222222222';
const env = { url: 'https://x.supabase.co', serviceKey: 'service-geheim' };
const JETZT = new Date('2026-11-02T10:00:00Z');
const SEED = berlinTag(JETZT);
const LOES = JSON.parse(readFileSync(new URL('./putt-profi-loesungen.json', import.meta.url))).loesungen;
function runde(seed) {
  const plan = L.tagesRunde(seed);
  const inputs = plan.map((p) => LOES[p.nr + (p.spiegel ? 's' : '')]).join('|');
  const r = L.pruefeRunde(seed, inputs);
  return { v: L.SIM_VERSION, seed, inputs, schlaege: r.schlaege, par: r.par };
}
const RUNDE = runde(SEED);

function ersatz({ sitzungOk = true, rpcAntwort = { ok: true, platz_heute: 1, spieler_heute: 3, platz_monat: 2 } } = {}) {
  const aufrufe = [];
  const f = async (url, o) => {
    aufrufe.push({ url, o });
    if (url.endsWith('/auth/v1/user')) return sitzungOk ? new Response(JSON.stringify({ id: UID }), { status: 200 }) : new Response('{}', { status: 401 });
    if (url.endsWith('/rpc/putt_eintragen')) return new Response(JSON.stringify(rpcAntwort), { status: 200 });
    throw new Error('unerwartet ' + url);
  };
  return { f, aufrufe };
}
const anfrage = (body, { token = 'tok', origin = 'https://playsaal.com', methode = 'POST' } = {}) =>
  new Request('https://x.supabase.co/functions/v1/putt-profi-runde', { method: methode, headers: { origin, ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: methode === 'POST' ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined });
const json = async (r) => ({ status: r.status, ...(await r.json()) });
const rpcs = (a) => a.filter((x) => x.url.includes('/rpc/')).length;

test('echte Runde wird nachgespielt und eingetragen (Schläge und Par vom Server)', async () => {
  const { f, aufrufe } = ersatz();
  const r = await json(await behandle(anfrage(RUNDE), env, f, JETZT));
  assert.equal(r.status, 200); assert.equal(r.verifiziert, true); assert.equal(r.schlaege, RUNDE.schlaege); assert.equal(r.platz_heute, 1);
  const body = JSON.parse(aufrufe.find((a) => a.url.includes('/rpc/')).o.body);
  assert.deepEqual([body.p_user, body.p_seed, body.p_schlaege, body.p_par, body.p_version], [UID, SEED, RUNDE.schlaege, RUNDE.par, L.SIM_VERSION]);
});

test('geschönte Schlagzahl, fehlende Bahn oder fremde Schläge werden abgelehnt', async () => {
  const teile = RUNDE.inputs.split('|');
  for (const x of [{ ...RUNDE, schlaege: RUNDE.schlaege - 1 }, { ...RUNDE, inputs: teile.slice(0, 4).join('|') }, { ...RUNDE, inputs: teile.map(() => '0,-10000,5,0').join('|') }, { ...RUNDE, inputs: 'a,b' }]) {
    const { f, aufrufe } = ersatz();
    const r = await json(await behandle(anfrage(x), env, f, JETZT));
    assert.equal(r.verifiziert, false, JSON.stringify(r)); assert.equal(rpcs(aufrufe), 0);
  }
});

test('nur heute und gestern zählen, alte Version nicht', async () => {
  let { f } = ersatz();
  assert.equal((await json(await behandle(anfrage(runde(berlinTag(JETZT, -2))), env, f, JETZT))).grund, 'tag');
  ({ f } = ersatz());
  assert.equal((await json(await behandle(anfrage({ ...RUNDE, v: L.SIM_VERSION + 1 }), env, f, JETZT))).grund, 'version');
  ({ f } = ersatz());
  assert.equal((await json(await behandle(anfrage(runde(berlinTag(JETZT, -1))), env, f, JETZT))).verifiziert, true);
});

test('ohne Anmeldung, falsche Methode, kaputtes JSON, CORS nur für playsaal.com', async () => {
  let { f, aufrufe } = ersatz();
  assert.equal((await behandle(anfrage(RUNDE, { token: '' }), env, f, JETZT)).status, 401);
  ({ f, aufrufe } = ersatz({ sitzungOk: false }));
  assert.equal((await behandle(anfrage(RUNDE), env, f, JETZT)).status, 401); assert.equal(rpcs(aufrufe), 0);
  ({ f } = ersatz());
  assert.equal((await behandle(anfrage(null, { methode: 'GET' }), env, f, JETZT)).status, 405);
  ({ f } = ersatz());
  assert.equal((await behandle(anfrage('{kaputt'), env, f, JETZT)).status, 400);
  ({ f } = ersatz());
  const r = await behandle(anfrage(RUNDE, { origin: 'https://boese.example' }), env, f, JETZT);
  assert.equal(r.headers.get('access-control-allow-origin'), null);
  ({ f } = ersatz());
  const o = await behandle(anfrage(null, { methode: 'OPTIONS' }), env, f, JETZT);
  assert.equal(o.status, 204); assert.equal(o.headers.get('access-control-allow-origin'), 'https://playsaal.com');
});

test('Datenbank lehnt ab (zu oft, kein Profil) → nicht verifiziert', async () => {
  for (const grund of ['zu_oft', 'kein_profil']) {
    const { f } = ersatz({ rpcAntwort: { ok: false, grund } });
    const r = await json(await behandle(anfrage(RUNDE), env, f, JETZT));
    assert.equal(r.verifiziert, false); assert.equal(r.grund, grund);
  }
});
