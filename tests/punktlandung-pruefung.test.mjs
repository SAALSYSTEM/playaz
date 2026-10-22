// Prüf-Funktion für PUNKTLANDUNG (supabase/functions/punktlandung-lauf/handler.js), ohne Netzwerk.
// Start: node --test tests/punktlandung-pruefung.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { behandle, berlinTag } from '../supabase/functions/punktlandung-lauf/handler.js';
import { neuerLauf, kodiere, tempo, SIM_VERSION } from '../supabase/functions/punktlandung-lauf/sim.js';

const UID = '11111111-1111-4111-8111-111111111111';
const env = { url: 'https://x.supabase.co', serviceKey: 'service-geheim' };
const JETZT = new Date('2026-10-21T10:00:00Z');
const SEED = berlinTag(JETZT);

function ersatz({ sitzungOk = true, rpcAntwort = { ok: true, platz_heute: 2, spieler_heute: 5, platz_monat: 3 } } = {}) {
  const aufrufe = [];
  const f = async (url, o) => {
    aufrufe.push({ url, o });
    if (url.endsWith('/auth/v1/user')) return sitzungOk ? new Response(JSON.stringify({ id: UID }), { status: 200 }) : new Response('{}', { status: 401 });
    if (url.endsWith('/rpc/punktlandung_eintragen')) return new Response(JSON.stringify(rpcAntwort), { status: 200 });
    throw new Error('unerwartet ' + url);
  };
  return { f, aufrufe };
}
const anfrage = (body, { token = 'tok', origin = 'https://playsaal.com', methode = 'POST' } = {}) =>
  new Request('https://x.supabase.co/functions/v1/punktlandung-lauf', { method: methode, headers: { origin, ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: methode === 'POST' ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined });
const json = async (r) => ({ status: r.status, ...(await r.json()) });
const rpcs = (a) => a.filter((x) => x.url.includes('/rpc/')).length;

// Ein echter Lauf: 12 Treffer (perfekter Bot), dann nicht mehr tippen bis zum Ende
function echterLauf(seed, treffer = 12) {
  const l = neuerLauf(seed); const tipps = [];
  for (;;) {
    let tipp = false;
    if (l.s.n < treffer && l.s.e - tempo(l.s.n) < 0) tipp = true;
    if (tipp) tipps.push(l.s.t);
    if (!l.schritt(tipp)) break;
  }
  return { v: SIM_VERSION, seed, inputs: kodiere(tipps), ticks: l.s.t, score: l.punkte() };
}

test('berlinTag: Datum in Berliner Zeit, auch um Mitternacht', () => {
  assert.equal(berlinTag(new Date('2026-10-21T10:00:00Z')), 20261021);
  assert.equal(berlinTag(new Date('2026-10-20T22:30:00Z')), 20261021);   // 00:30 MESZ
  assert.equal(berlinTag(JETZT, -1), 20261020);
});

test('Gültiger Lauf wird nachgefahren und mit der Kennung der Sitzung eingetragen', async () => {
  const lauf = echterLauf(SEED); assert.ok(lauf.score >= 1);
  const { f, aufrufe } = ersatz();
  const r = await json(await behandle(anfrage(lauf), env, f, JETZT));
  assert.equal(r.verifiziert, true); assert.equal(r.punkte, lauf.score); assert.equal(r.platz_heute, 2);
  const b = JSON.parse(aufrufe.find((a) => a.url.endsWith('/rpc/punktlandung_eintragen')).o.body);
  assert.equal(b.p_user, UID); assert.equal(b.p_seed, SEED); assert.equal(b.p_punkte, lauf.score);
});

test('Gestern ist erlaubt, andere Tage nicht', async () => {
  const { f } = ersatz();
  assert.equal((await json(await behandle(anfrage(echterLauf(berlinTag(JETZT, -1))), env, f, JETZT))).verifiziert, true);
  for (const tag of [berlinTag(JETZT, -2), berlinTag(JETZT, 1)]) {
    const r = await json(await behandle(anfrage(echterLauf(tag)), env, f, JETZT)); assert.equal(r.grund, 'tag');
  }
});

test('Erfundene Punkte, Dauer oder Eingaben werden abgelehnt, nichts wird eingetragen', async () => {
  const lauf = echterLauf(SEED); const { f, aufrufe } = ersatz();
  for (const x of [{ score: lauf.score + 1 }, { ticks: lauf.ticks + 1 }, { score: 5000, ticks: 30000 }, { inputs: '' }, { inputs: '1.1.1' }, { inputs: 'zz!' }]) {
    const r = await json(await behandle(anfrage({ ...lauf, ...x }), env, f, JETZT)); assert.equal(r.verifiziert, false, JSON.stringify(x));
  }
  assert.equal(rpcs(aufrufe), 0);
});

test('Falsche Version, kaputte Daten, Übergröße', async () => {
  const lauf = echterLauf(SEED); const { f, aufrufe } = ersatz();
  assert.equal((await json(await behandle(anfrage({ ...lauf, v: SIM_VERSION + 1 }), env, f, JETZT))).grund, 'version');
  assert.equal((await json(await behandle(anfrage('kein json'), env, f, JETZT))).status, 400);
  assert.equal((await json(await behandle(anfrage({ ...lauf, score: 1.5 }), env, f, JETZT))).status, 400);
  assert.equal((await json(await behandle(anfrage({ ...lauf, inputs: '0g'.repeat(50000) }), env, f, JETZT))).status, 413);
  assert.equal(rpcs(aufrufe), 0);
});

test('Ohne gültige Sitzung: 401; fremde Herkunft bekommt keine CORS-Freigabe', async () => {
  const a = ersatz({ sitzungOk: false });
  assert.equal((await behandle(anfrage(echterLauf(SEED)), env, a.f, JETZT)).status, 401);
  assert.equal((await behandle(anfrage(echterLauf(SEED), { token: '' }), env, a.f, JETZT)).status, 401);
  assert.equal(rpcs(a.aufrufe), 0);
  const b = ersatz();
  const r = await behandle(anfrage(echterLauf(SEED), { origin: 'https://boese.example' }), env, b.f, JETZT);
  assert.equal(r.headers.get('access-control-allow-origin'), null);
  assert.equal((await behandle(anfrage('', { methode: 'GET' }), env, b.f, JETZT)).status, 405);
});

test('Datenbank lehnt ab (Rate, kein Profil): "nicht verifiziert" mit Grund', async () => {
  for (const grund of ['zu_oft', 'kein_profil']) {
    const { f } = ersatz({ rpcAntwort: { ok: false, grund } });
    const r = await json(await behandle(anfrage(echterLauf(SEED)), env, f, JETZT));
    assert.equal(r.verifiziert, false); assert.equal(r.grund, grund);
  }
});
