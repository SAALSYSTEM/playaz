// Prüf-Funktion für NEUNMALKLUG (supabase/functions/neunmalklug-lauf/handler.js), ohne Netzwerk.
// Start: node --test tests/neunmalklug-pruefung.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { behandle } from '../supabase/functions/neunmalklug-lauf/handler.js';
import { tagesRaetsel, kodiere } from '../supabase/functions/neunmalklug-lauf/sim.js';

const UID = '11111111-1111-4111-8111-111111111111';
const RUN = '22222222-2222-4222-8222-222222222222';
const SEED = 515151, VERSION = 1, TAG = '20261105';
const env = { url: 'https://x.supabase.co', serviceKey: 'service-geheim' };

function ersatz({ sitzungOk = true, lesen = { ok: true, seed: SEED, version: VERSION, tag: TAG }, abschl = { ok: true, tag: TAG, zeit_cs: 45678, rang: { platz: 1, spieler: 1 } } } = {}) {
  const aufrufe = [];
  const f = async (url, o) => {
    aufrufe.push({ url, o });
    if (url.endsWith('/auth/v1/user')) return sitzungOk ? new Response(JSON.stringify({ id: UID }), { status: 200 }) : new Response('{}', { status: 401 });
    if (url.endsWith('/rpc/neunmalklug_run_lesen')) return new Response(JSON.stringify(lesen), { status: 200 });
    if (url.endsWith('/rpc/neunmalklug_abschliessen')) return new Response(JSON.stringify(abschl), { status: 200 });
    throw new Error('unerwartet ' + url);
  };
  return { f, aufrufe };
}
const anfrage = (body, { token = 'tok', origin = 'https://playsaal.com', methode = 'POST' } = {}) =>
  new Request('https://x.supabase.co/functions/v1/neunmalklug-lauf', { method: methode, headers: { origin, ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: methode === 'POST' ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined });
const json = async (r) => ({ status: r.status, ...(await r.json()) });
const rpcs = (a, n) => a.filter((x) => x.url.endsWith('/rpc/' + n)).length;
const raetsel = tagesRaetsel(SEED, VERSION, TAG);
const echt = () => ({ run_id: RUN, loesung: kodiere(raetsel.loesung) });

test('Richtige Lösung: geprüft, Zeit kommt von der Datenbank', async () => {
  const { f, aufrufe } = ersatz();
  const r = await json(await behandle(anfrage(echt()), env, f));
  assert.equal(r.verifiziert, true); assert.equal(r.zeit_cs, 45678); assert.equal(r.rang.platz, 1);
  const b = JSON.parse(aufrufe.find((a) => a.url.endsWith('/neunmalklug_abschliessen')).o.body);
  assert.deepEqual(Object.keys(b).sort(), ['p_felder', 'p_loesung', 'p_run', 'p_user'], 'keine Zeit vom Browser');
  assert.equal(b.p_user, UID); assert.equal(b.p_felder, raetsel.leer);
});

test('Mitgeschickte Zeit oder Seed werden ignoriert', async () => {
  const { f, aufrufe } = ersatz();
  assert.equal((await json(await behandle(anfrage({ ...echt(), zeit_cs: 1, seed: 1, version: 99 }), env, f))).verifiziert, true);
  assert.ok(!aufrufe.find((a) => a.url.endsWith('/neunmalklug_abschliessen')).o.body.includes('zeit'));
});

test('Falsche Lösung, geänderte Vorgabe, gültiges Sudoku eines anderen Tages: abgelehnt, nichts abgeschlossen', async () => {
  const l = raetsel.loesung.slice();
  // zwei Ziffern in einem leeren Feldpaar derselben Zeile tauschen (Regel verletzt)
  const falsch = l.slice(); const i = raetsel.raetsel.findIndex((v) => !v); const j = i + 1 < 81 && Math.floor((i + 1) / 9) === Math.floor(i / 9) ? i + 1 : i - 1; [falsch[i], falsch[j]] = [falsch[j], falsch[i]];
  // gültiges, aber anderes Sudoku: alle Ziffern 1<->2 tauschen (verletzt Vorgaben)
  const anders = l.map((v) => (v === 1 ? 2 : v === 2 ? 1 : v));
  const fremd = tagesRaetsel(4242, VERSION, TAG).loesung;
  for (const x of [falsch, anders, fremd]) {
    const { f, aufrufe } = ersatz(); const r = await json(await behandle(anfrage({ run_id: RUN, loesung: kodiere(x) }), env, f));
    assert.equal(r.verifiziert, false); assert.equal(rpcs(aufrufe, 'neunmalklug_abschliessen'), 0);
  }
});

test('Tag kommt aus der Datenbank: dieselbe Lösung passt nicht zu einem anderen Wochentag', async () => {
  const r = await json(await behandle(anfrage(echt()), env, ersatz({ lesen: { ok: true, seed: SEED, version: VERSION, tag: '20261108' } }).f));
  assert.equal(r.verifiziert, false);
});

test('Ohne Sitzung, kaputtes JSON, unvollständiges Raster, falsche Methode, zu groß', async () => {
  assert.equal((await behandle(anfrage(echt()), env, ersatz({ sitzungOk: false }).f)).status, 401);
  assert.equal((await behandle(anfrage(echt(), { token: '' }), env, ersatz().f)).status, 401);
  assert.equal((await behandle(anfrage('{kaputt'), env, ersatz().f)).status, 400);
  assert.equal((await behandle(anfrage({ run_id: RUN, loesung: '0'.repeat(81) }), env, ersatz().f)).status, 400);
  assert.equal((await behandle(anfrage({ run_id: 'x', loesung: kodiere(raetsel.loesung) }), env, ersatz().f)).status, 400);
  assert.equal((await behandle(anfrage(null, { methode: 'GET' }), env, ersatz().f)).status, 405);
  assert.equal((await behandle(anfrage('x'.repeat(2001)), env, ersatz().f)).status, 413);
});

test('Run-ID schon abgeschlossen; Datenbank lehnt ab (zu schnell)', async () => {
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
