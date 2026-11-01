// Prüf-Funktion für KERKERLAUF (supabase/functions/kerkerlauf-lauf/handler.js), ohne Netzwerk.
// Start: node --test tests/kerkerlauf-pruefung.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { behandle, berlinTag } from '../supabase/functions/kerkerlauf-lauf/handler.js';
import { SIM_VERSION } from '../supabase/functions/kerkerlauf-lauf/logik.js';
import { botLauf } from '../tools/kerkerlauf-bot.mjs';

const UID = '22222222-2222-4222-8222-222222222222';
const env = { url: 'https://x.supabase.co', serviceKey: 'service-geheim' };
const JETZT = new Date('2026-11-01T10:00:00Z');
const SEED = berlinTag(JETZT);
const LAUF = botLauf(SEED, 700);

function ersatz({ sitzungOk = true, rpcAntwort = { ok: true, platz_heute: 2, spieler_heute: 7, platz_monat: 4 } } = {}) {
  const aufrufe = [];
  const f = async (url, o) => {
    aufrufe.push({ url, o });
    if (url.endsWith('/auth/v1/user')) return sitzungOk ? new Response(JSON.stringify({ id: UID }), { status: 200 }) : new Response('{}', { status: 401 });
    if (url.endsWith('/rpc/kerkerlauf_eintragen')) return new Response(JSON.stringify(rpcAntwort), { status: 200 });
    throw new Error('unerwartet ' + url);
  };
  return { f, aufrufe };
}
const anfrage = (body, { token = 'tok', origin = 'https://playsaal.com', methode = 'POST' } = {}) =>
  new Request('https://x.supabase.co/functions/v1/kerkerlauf-lauf', { method: methode, headers: { origin, ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: methode === 'POST' ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined });
const json = async (r) => ({ status: r.status, ...(await r.json()) });
const rpcs = (a) => a.filter((x) => x.url.includes('/rpc/')).length;

test('echter Lauf wird nachgespielt und eingetragen (Punkte vom Server)', async () => {
  const { f, aufrufe } = ersatz();
  const r = await json(await behandle(anfrage(LAUF), env, f, JETZT));
  assert.equal(r.status, 200); assert.equal(r.verifiziert, true); assert.equal(r.punkte, LAUF.punkte); assert.equal(r.platz_heute, 2);
  assert.equal(r.status, 200);
  const body = JSON.parse(aufrufe.find((a) => a.url.includes('/rpc/')).o.body);
  assert.deepEqual([body.p_user, body.p_seed, body.p_punkte, body.p_takte, body.p_version], [UID, SEED, LAUF.punkte, LAUF.takte, SIM_VERSION]);
});

test('erfundene Punkte, abgeschnittene Eingaben oder fremde Strecke werden abgelehnt', async () => {
  for (const lauf of [{ ...LAUF, punkte: LAUF.punkte + 100 }, { ...LAUF, takte: LAUF.takte - 1 }, { ...LAUF, inputs: LAUF.inputs.replace(/,[^,]*$/, '') }, { ...LAUF, inputs: 'z:9' }]) {
    const { f, aufrufe } = ersatz();
    const r = await json(await behandle(anfrage(lauf), env, f, JETZT));
    assert.equal(r.verifiziert, false, JSON.stringify(r)); assert.equal(rpcs(aufrufe), 0);
  }
});

test('nur heute und gestern zählen, alte Version nicht', async () => {
  const vorgestern = botLauf(berlinTag(JETZT, -2), 300);
  let { f } = ersatz();
  assert.equal((await json(await behandle(anfrage(vorgestern), env, f, JETZT))).grund, 'tag');
  ({ f } = ersatz());
  assert.equal((await json(await behandle(anfrage({ ...LAUF, v: SIM_VERSION + 1 }), env, f, JETZT))).grund, 'version');
  const gestern = botLauf(berlinTag(JETZT, -1), 300);
  ({ f } = ersatz());
  assert.equal((await json(await behandle(anfrage(gestern), env, f, JETZT))).verifiziert, true);
});

test('ohne Anmeldung, falsche Methode, kaputtes JSON, CORS nur für playsaal.com', async () => {
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
});
