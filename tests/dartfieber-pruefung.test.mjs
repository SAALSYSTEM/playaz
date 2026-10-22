// Prüf-Funktion für DARTFIEBER (supabase/functions/dartfieber-lauf/handler.js), ohne Netzwerk.
// Start: node --test tests/dartfieber-pruefung.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { behandle } from '../supabase/functions/dartfieber-lauf/handler.js';
import { challengeAus } from '../supabase/functions/dartfieber-lauf/sim.js';
import { bot } from '../tools/dartfieber-bot.mjs';

const UID = '11111111-1111-4111-8111-111111111111';
const RUN = '22222222-2222-4222-8222-222222222222';
const SEED = 424242, VERSION = 1;
const env = { url: 'https://x.supabase.co', serviceKey: 'service-geheim' };

function ersatz({ sitzungOk = true, lesen = { ok: true, seed: SEED, version: VERSION, tag: '20261022' }, abschl = { ok: true, tag: '20261022', rang: { platz: 1, punkte: 1, spieler: 1, luecke: null } } } = {}) {
  const aufrufe = [];
  const f = async (url, o) => {
    aufrufe.push({ url, o });
    if (url.endsWith('/auth/v1/user')) return sitzungOk ? new Response(JSON.stringify({ id: UID }), { status: 200 }) : new Response('{}', { status: 401 });
    if (url.endsWith('/rpc/dartfieber_run_lesen')) return new Response(JSON.stringify(lesen), { status: 200 });
    if (url.endsWith('/rpc/dartfieber_abschliessen')) return new Response(JSON.stringify(abschl), { status: 200 });
    throw new Error('unerwartet ' + url);
  };
  return { f, aufrufe };
}
const anfrage = (body, { token = 'tok', origin = 'https://playsaal.com', methode = 'POST' } = {}) =>
  new Request('https://x.supabase.co/functions/v1/dartfieber-lauf', { method: methode, headers: { origin, ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: methode === 'POST' ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined });
const json = async (r) => ({ status: r.status, ...(await r.json()) });
const rpcs = (a, n) => a.filter((x) => x.url.endsWith('/rpc/' + n)).length;
const echt = () => { const r = bot(challengeAus(SEED, VERSION), { sigma: 2, seed: 5 }); return { run_id: RUN, inputs: r.lauf.inputs, ticks: r.lauf.ticks, score: r.lauf.score, throws: r.lauf.throws }; };

test('Gültige Runde: nachgerechnet und mit Kennung der Sitzung abgeschlossen', async () => {
  const l = echt(); const { f, aufrufe } = ersatz();
  const r = await json(await behandle(anfrage(l), env, f));
  assert.equal(r.verifiziert, true); assert.equal(r.punkte, l.score); assert.equal(r.rang.platz, 1);
  const b = JSON.parse(aufrufe.find((a) => a.url.endsWith('/dartfieber_abschliessen')).o.body);
  assert.equal(b.p_user, UID); assert.equal(b.p_run, RUN); assert.equal(b.p_punkte, l.score); assert.equal(b.p_wuerfe, l.throws);
  assert.ok(!JSON.stringify(aufrufe.map((a) => a.url)).includes('service-geheim'));
});

test('Seed kommt aus der Datenbank, nicht vom Browser: ein mitgeschickter Seed wird ignoriert', async () => {
  const l = { ...echt(), seed: 1, version: 99 }; const { f } = ersatz();
  assert.equal((await json(await behandle(anfrage(l), env, f))).verifiziert, true);
});

test('Falsche Punkte, Würfe oder Takte werden abgelehnt, nichts wird abgeschlossen', async () => {
  for (const feld of ['score', 'throws', 'ticks']) {
    const l = echt(); l[feld] += 1; const { f, aufrufe } = ersatz();
    const r = await json(await behandle(anfrage(l), env, f));
    assert.equal(r.verifiziert, false); assert.equal(rpcs(aufrufe, 'dartfieber_abschliessen'), 0);
  }
});

test('Gefälschte oder abgeschnittene Eingaben werden abgelehnt', async () => {
  const l = echt(); const { f, aufrufe } = ersatz();
  for (const inputs of ['', 'zz', l.inputs.split('.').slice(0, -2).join('.'), l.inputs + '.1.1.1']) {
    const r = await json(await behandle(anfrage({ ...l, inputs }), env, f)); assert.equal(r.verifiziert, false);
  }
  assert.equal(rpcs(aufrufe, 'dartfieber_abschliessen'), 0);
});

test('Run-ID: unbekannt, schon abgeschlossen, zu viele Versuche → abgelehnt ohne Prüfung', async () => {
  for (const grund of ['unbekannt', 'schon_abgeschlossen', 'zu_viele_versuche']) {
    const { f, aufrufe } = ersatz({ lesen: { ok: false, grund } });
    const r = await json(await behandle(anfrage(echt()), env, f));
    assert.equal(r.verifiziert, false); assert.equal(r.grund, grund); assert.equal(rpcs(aufrufe, 'dartfieber_abschliessen'), 0);
  }
});

test('Ablehnung der Datenbank (zu schnell, abgelaufen) wird ehrlich weitergegeben', async () => {
  const { f } = ersatz({ abschl: { ok: false, grund: 'zu_schnell' } });
  const r = await json(await behandle(anfrage(echt()), env, f));
  assert.equal(r.verifiziert, false); assert.equal(r.grund, 'zu_schnell');
});

test('Datenbank nicht erreichbar: Fehler 500, kein erfundener Rang', async () => {
  const f = async (url) => url.endsWith('/auth/v1/user') ? new Response(JSON.stringify({ id: UID })) : new Response('x', { status: 500 });
  const r = await json(await behandle(anfrage(echt()), env, f));
  assert.equal(r.status, 500); assert.equal(r.rang, undefined);
});

test('Anmeldung, Methode, Größe, Form und Herkunft', async () => {
  const l = echt();
  assert.equal((await behandle(anfrage(l, { token: '' }), env, ersatz().f)).status, 401);
  assert.equal((await behandle(anfrage(l), env, ersatz({ sitzungOk: false }).f)).status, 401);
  assert.equal((await behandle(anfrage(null, { methode: 'GET' }), env, ersatz().f)).status, 405);
  assert.equal((await behandle(anfrage('x'.repeat(10001)), env, ersatz().f)).status, 413);
  assert.equal((await behandle(anfrage('kein json'), env, ersatz().f)).status, 400);
  assert.equal((await behandle(anfrage({ ...l, run_id: 'abc' }), env, ersatz().f)).status, 400);
  assert.equal((await behandle(anfrage({ ...l, score: 1.5 }), env, ersatz().f)).status, 400);
  const ok = await behandle(anfrage(l), env, ersatz().f);
  assert.equal(ok.headers.get('access-control-allow-origin'), 'https://playsaal.com');
  const fremd = await behandle(anfrage(l, { origin: 'https://boese.example' }), env, ersatz().f);
  assert.equal(fremd.headers.get('access-control-allow-origin'), null);
});
