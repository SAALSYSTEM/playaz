// Prüf-Funktion für PAPIERPILOT (supabase/functions/papierpilot-lauf/handler.js), ohne Netzwerk.
// Start: node --test tests/papierpilot-pruefung.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { behandle, berlinTag } from '../supabase/functions/papierpilot-lauf/handler.js';
import { kodiere, nachfliegen, SIM_VERSION } from '../supabase/functions/papierpilot-lauf/sim.js';
import { tagesStrecke } from '../supabase/functions/papierpilot-lauf/strecke.js';
import { botFlug } from '../tools/papierpilot-bot.mjs';

const UID = '11111111-1111-4111-8111-111111111111';
const env = { url: 'https://x.supabase.co', serviceKey: 'service-geheim' };
const JETZT = new Date('2026-10-22T10:00:00Z');
const SEED = berlinTag(JETZT);

function ersatz({ sitzungOk = true, rpcAntwort = { ok: true, platz_heute: 2, spieler_heute: 5, platz_monat: 3 } } = {}) {
  const aufrufe = [];
  const f = async (url, o) => {
    aufrufe.push({ url, o });
    if (url.endsWith('/auth/v1/user')) return sitzungOk ? new Response(JSON.stringify({ id: UID }), { status: 200 }) : new Response('{}', { status: 401 });
    if (url.endsWith('/rpc/papierpilot_eintragen')) return new Response(JSON.stringify(rpcAntwort), { status: 200 });
    throw new Error('unerwartet ' + url);
  };
  return { f, aufrufe };
}
const anfrage = (body, { token = 'tok', origin = 'https://playsaal.com', methode = 'POST' } = {}) =>
  new Request('https://x.supabase.co/functions/v1/papierpilot-lauf', { method: methode, headers: { origin, ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: methode === 'POST' ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined });
const json = async (r) => ({ status: r.status, ...(await r.json()) });
const rpcs = (a) => a.filter((x) => x.url.includes('/rpc/')).length;

function echterFlug(seed) {
  const b = botFlug(tagesStrecke(seed), { zittern: 0.1, seed: 5 });
  const r = nachfliegen(seed, b.eingaben);
  return { v: SIM_VERSION, seed, inputs: kodiere(b.eingaben), ticks: r.ticks, cm: r.cm, ft: r.ft };
}
const FLUG = echterFlug(SEED);

test('berlinTag: Datum in Berliner Zeit, auch um Mitternacht', () => {
  assert.equal(berlinTag(new Date('2026-10-21T22:30:00Z')), 20261022);   // 00:30 in Berlin
  assert.equal(berlinTag(new Date('2026-10-21T21:30:00Z')), 20261021);
});

test('echter Flug wird nachgeflogen und eingetragen (Distanz und Flugzeit vom Server)', async () => {
  const { f, aufrufe } = ersatz();
  const r = await json(await behandle(anfrage(FLUG), env, f, JETZT));
  assert.equal(r.status, 200); assert.equal(r.verifiziert, true); assert.equal(r.cm, FLUG.cm); assert.equal(r.platz_heute, 2);
  const body = JSON.parse(aufrufe.find((a) => a.url.includes('/rpc/')).o.body);
  assert.deepEqual([body.p_user, body.p_seed, body.p_cm, body.p_ticks, body.p_version], [UID, SEED, FLUG.cm, FLUG.ft, SIM_VERSION]);
});

test('erfundene Distanz, falsche Zeit oder fremde Eingaben werden abgelehnt', async () => {
  for (const lauf of [{ ...FLUG, cm: FLUG.cm + 500 }, { ...FLUG, ft: FLUG.ft - 1 }, { ...FLUG, inputs: FLUG.inputs.replace(/,[^,]*$/, '') }, { ...FLUG, inputs: 'z:9' }]) {
    const { f, aufrufe } = ersatz();
    const r = await json(await behandle(anfrage(lauf), env, f, JETZT));
    assert.equal(r.verifiziert, false, JSON.stringify(r)); assert.equal(rpcs(aufrufe), 0);
  }
});

test('nur heute und gestern zählen, alte Version nicht', async () => {
  const gestern = berlinTag(JETZT, -1), vorgestern = berlinTag(JETZT, -2);
  let { f } = ersatz();
  assert.equal((await json(await behandle(anfrage(echterFlug(gestern)), env, f, JETZT))).verifiziert, true);
  ({ f } = ersatz());
  assert.equal((await json(await behandle(anfrage(echterFlug(vorgestern)), env, f, JETZT))).grund, 'tag');
  ({ f } = ersatz());
  assert.equal((await json(await behandle(anfrage({ ...FLUG, v: SIM_VERSION + 1 }), env, f, JETZT))).grund, 'version');
});

test('ohne gültige Sitzung kein Eintrag; CORS nur für playsaal.com', async () => {
  let { f, aufrufe } = ersatz({ sitzungOk: false });
  assert.equal((await behandle(anfrage(FLUG), env, f, JETZT)).status, 401); assert.equal(rpcs(aufrufe), 0);
  ({ f } = ersatz());
  assert.equal((await behandle(anfrage(FLUG, { token: '' }), env, f, JETZT)).status, 401);
  const r = await behandle(anfrage(FLUG, { origin: 'https://boese.example' }), env, ersatz().f, JETZT);
  assert.equal(r.headers.get('access-control-allow-origin'), null);
  const o = await behandle(anfrage(null, { methode: 'OPTIONS' }), env, ersatz().f, JETZT);
  assert.equal(o.status, 204); assert.equal(o.headers.get('access-control-allow-origin'), 'https://playsaal.com');
});

test('Datenbank lehnt ab (z. B. zu oft) → nicht verifiziert', async () => {
  const { f } = ersatz({ rpcAntwort: { ok: false, grund: 'zu_oft' } });
  const r = await json(await behandle(anfrage(FLUG), env, f, JETZT));
  assert.equal(r.verifiziert, false); assert.equal(r.grund, 'zu_oft');
});
