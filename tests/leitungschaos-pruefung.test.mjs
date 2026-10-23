// Prüf-Funktion für LEITUNGSCHAOS (supabase/functions/leitungschaos-lauf/handler.js), ohne Netzwerk.
// Start: node --test tests/leitungschaos-pruefung.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { behandle } from '../supabase/functions/leitungschaos-lauf/handler.js';
import { tagesRaetsel, neuesSpiel, tippe, kodiere } from '../supabase/functions/leitungschaos-lauf/sim.js';

const UID = '11111111-1111-4111-8111-111111111111';
const RUN = '22222222-2222-4222-8222-222222222222';
const SEED = 515151, VERSION = 1;
const env = { url: 'https://x.supabase.co', serviceKey: 'service-geheim' };

function ersatz({ sitzungOk = true, lesen = { ok: true, seed: SEED, version: VERSION, tag: '20261023' }, abschl = { ok: true, tag: '20261023', zeit_cs: 12345, rang: { platz: 1, spieler: 1 } } } = {}) {
  const aufrufe = [];
  const f = async (url, o) => {
    aufrufe.push({ url, o });
    if (url.endsWith('/auth/v1/user')) return sitzungOk ? new Response(JSON.stringify({ id: UID }), { status: 200 }) : new Response('{}', { status: 401 });
    if (url.endsWith('/rpc/leitungschaos_run_lesen')) return new Response(JSON.stringify(lesen), { status: 200 });
    if (url.endsWith('/rpc/leitungschaos_abschliessen')) return new Response(JSON.stringify(abschl), { status: 200 });
    throw new Error('unerwartet ' + url);
  };
  return { f, aufrufe };
}
const anfrage = (body, { token = 'tok', origin = 'https://playsaal.com', methode = 'POST' } = {}) =>
  new Request('https://x.supabase.co/functions/v1/leitungschaos-lauf', { method: methode, headers: { origin, ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: methode === 'POST' ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined });
const json = async (r) => ({ status: r.status, ...(await r.json()) });
const rpcs = (a, n) => a.filter((x) => x.url.endsWith('/rpc/' + n)).length;
function echt() {
  const r = tagesRaetsel(SEED, VERSION), s = neuesSpiel(r), t = [];
  for (let i = 0; i < r.n && !s.geloest; i++) while (!r.fest[i] && s.masken[i] !== r.loesung[i] && !s.geloest) { tippe(r, s, i); t.push(i); }
  return { run_id: RUN, inputs: kodiere(t), drehungen: t.length };
}

test('Gültiger Lösungsweg: nachgespielt, Zeit kommt von der Datenbank', async () => {
  const l = echt(); const { f, aufrufe } = ersatz();
  const r = await json(await behandle(anfrage(l), env, f));
  assert.equal(r.verifiziert, true); assert.equal(r.zeit_cs, 12345); assert.equal(r.drehungen, l.drehungen); assert.equal(r.rang.platz, 1);
  const b = JSON.parse(aufrufe.find((a) => a.url.endsWith('/leitungschaos_abschliessen')).o.body);
  assert.deepEqual(Object.keys(b).sort(), ['p_drehungen', 'p_inputs', 'p_run', 'p_user'], 'keine Zeit vom Browser');
  assert.equal(b.p_user, UID); assert.equal(b.p_drehungen, l.drehungen);
});

test('Mitgeschickte Zeit oder Seed werden ignoriert', async () => {
  const l = { ...echt(), zeit_cs: 1, seed: 1, version: 99 }; const { f, aufrufe } = ersatz();
  assert.equal((await json(await behandle(anfrage(l), env, f))).verifiziert, true);
  assert.ok(!aufrufe.find((a) => a.url.endsWith('/leitungschaos_abschliessen')).o.body.includes('zeit'));
});

test('Falsche Drehzahl, ungelöst, fremde Zeichen: abgelehnt, nichts abgeschlossen', async () => {
  const l = echt();
  for (const x of [{ ...l, drehungen: l.drehungen + 1 }, { ...l, inputs: l.inputs.slice(0, -1), drehungen: l.drehungen - 1 }, { ...l, inputs: '#' }, { ...l, inputs: '' , drehungen: 0 }]) {
    const { f, aufrufe } = ersatz(); const r = await json(await behandle(anfrage(x), env, f));
    assert.equal(r.verifiziert, false); assert.equal(rpcs(aufrufe, 'leitungschaos_abschliessen'), 0);
  }
});

test('Ohne Sitzung, kaputtes JSON, falsche Methode, zu groß', async () => {
  const { f } = ersatz({ sitzungOk: false });
  assert.equal((await behandle(anfrage(echt()), env, f)).status, 401);
  assert.equal((await behandle(anfrage(echt(), { token: '' }), env, ersatz().f)).status, 401);
  assert.equal((await behandle(anfrage('{kaputt'), env, ersatz().f)).status, 400);
  assert.equal((await behandle(anfrage({ run_id: 'x', inputs: '1', drehungen: 1 }), env, ersatz().f)).status, 400);
  assert.equal((await behandle(anfrage(null, { methode: 'GET' }), env, ersatz().f)).status, 405);
  assert.equal((await behandle(anfrage('x'.repeat(10001)), env, ersatz().f)).status, 413);
});

test('Run-ID unbekannt oder schon abgeschlossen; Datenbank lehnt ab (zu schnell)', async () => {
  assert.equal((await json(await behandle(anfrage(echt()), env, ersatz({ lesen: { ok: false, grund: 'schon_abgeschlossen' } }).f))).grund, 'schon_abgeschlossen');
  const r = await json(await behandle(anfrage(echt()), env, ersatz({ abschl: { ok: false, grund: 'zu_schnell' } }).f));
  assert.equal(r.verifiziert, false); assert.equal(r.grund, 'zu_schnell');
});

test('CORS nur für playsaal.com', async () => {
  const a = await behandle(anfrage(null, { methode: 'OPTIONS' }), env, ersatz().f);
  assert.equal(a.headers.get('access-control-allow-origin'), 'https://playsaal.com');
  const b = await behandle(anfrage(null, { methode: 'OPTIONS', origin: 'https://boese.example' }), env, ersatz().f);
  assert.equal(b.headers.get('access-control-allow-origin'), null);
});
