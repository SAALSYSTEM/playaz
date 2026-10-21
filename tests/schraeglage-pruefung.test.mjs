// Prüf-Funktion für SCHRÄGLAGE-Zeiten (supabase/functions/schraeglage-lauf/handler.js), ohne Netzwerk:
// echte Physik (sim.js) gegen echte Bot-Lösungen, Supabase wird durch Ersatzantworten simuliert.
// Start: node --test tests/schraeglage-pruefung.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { behandle } from '../supabase/functions/schraeglage-lauf/handler.js';
import { SIM_VERSION } from '../supabase/functions/schraeglage-lauf/sim.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const L = JSON.parse(readFileSync(join(ROOT, 'tests/schraeglage-loesungen.json'), 'utf8'));
const UID = '11111111-1111-4111-8111-111111111111';
const env = { url: 'https://x.supabase.co', serviceKey: 'service-geheim' };

function ersatz({ sitzungOk = true, rpcAntwort = { ok: true, platz_monat: 3, spieler_monat: 10, platz_jahr: 5 } } = {}) {
  const aufrufe = [];
  const f = async (url, o) => {
    aufrufe.push({ url, o });
    if (url.endsWith('/auth/v1/user')) return sitzungOk ? new Response(JSON.stringify({ id: UID }), { status: 200 }) : new Response('{}', { status: 401 });
    if (url.endsWith('/rpc/schraeglage_eintragen')) return new Response(JSON.stringify(rpcAntwort), { status: 200 });
    throw new Error('unerwartet ' + url);
  };
  return { f, aufrufe };
}
const anfrage = (body, { token = 'tok', origin = 'https://playsaal.com', methode = 'POST' } = {}) =>
  new Request('https://x.supabase.co/functions/v1/schraeglage-lauf', { method: methode, headers: { origin, ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: methode === 'POST' ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined });
const lauf = (id = 2, extra = {}) => ({ v: SIM_VERSION, level: id, ms: L[id].ms, inputs: L[id].inputs, ...extra });
const json = async (r) => ({ status: r.status, ...(await r.json()) });

test('Gültiger Lauf wird nachgefahren und mit Nutzer-Kennung der Sitzung eingetragen', async () => {
  const { f, aufrufe } = ersatz();
  const r = await json(await behandle(anfrage(lauf(2)), env, f));
  assert.equal(r.verifiziert, true); assert.equal(r.ms, L[2].ms); assert.equal(r.platz_monat, 3);
  const rpc = aufrufe.find((a) => a.url.endsWith('/rpc/schraeglage_eintragen'));
  const b = JSON.parse(rpc.o.body);
  assert.equal(b.p_user, UID); assert.equal(b.p_ms, L[2].ms); assert.equal(b.p_level, 2);
  assert.equal(rpc.o.headers.authorization, 'Bearer service-geheim');
});

test('Behauptete Zeit ohne passende Eingaben wird abgelehnt, nichts wird eingetragen', async () => {
  const { f, aufrufe } = ersatz();
  for (const ms of [L[2].ms - 1, L[2].ms + 1, 5000]) {
    const r = await json(await behandle(anfrage(lauf(2, { ms })), env, f));
    assert.equal(r.verifiziert, false, 'ms ' + ms);
  }
  const falsch = await json(await behandle(anfrage(lauf(2, { inputs: '0n' })), env, f));
  assert.equal(falsch.verifiziert, false);
  assert.equal(aufrufe.filter((a) => a.url.includes('/rpc/')).length, 0);
});

test('Eingaben eines anderen Levels, falsche Version, kaputte Daten und Übergröße scheitern', async () => {
  const { f, aufrufe } = ersatz();
  assert.equal((await json(await behandle(anfrage(lauf(2, { level: 4 })), env, f))).verifiziert, false);
  assert.equal((await json(await behandle(anfrage(lauf(2, { v: SIM_VERSION + 1 })), env, f))).grund, 'version');
  assert.equal((await json(await behandle(anfrage('kein json'), env, f))).status, 400);
  assert.equal((await json(await behandle(anfrage(lauf(2, { level: 'x' })), env, f))).status, 400);
  assert.equal((await json(await behandle(anfrage(lauf(2, { ms: 12.5 })), env, f))).status, 400);
  assert.equal((await json(await behandle(anfrage({ ...lauf(2), inputs: '0g'.repeat(50000) }), env, f))).status, 413);
  assert.equal(aufrufe.filter((a) => a.url.includes('/rpc/')).length, 0);
});

test('Unplausibel schnelle Zeit (unter Goldzeit/2) wird ohne Nachrechnen abgelehnt', async () => {
  const { f } = ersatz();
  const r = await json(await behandle(anfrage(lauf(1, { ms: 3000 })), env, f));
  assert.equal(r.grund, 'unplausibel_schnell');
});

test('Ohne gültige Sitzung: 401, kein Eintrag', async () => {
  const a = ersatz({ sitzungOk: false });
  assert.equal((await behandle(anfrage(lauf(2)), env, a.f)).status, 401);
  assert.equal((await behandle(anfrage(lauf(2), { token: '' }), env, a.f)).status, 401);
  assert.equal(a.aufrufe.filter((x) => x.url.includes('/rpc/')).length, 0);
});

test('Datenbank lehnt ab (Rate, kein Profil): Antwort ist "nicht verifiziert" mit Grund', async () => {
  for (const grund of ['zu_oft', 'kein_profil']) {
    const { f } = ersatz({ rpcAntwort: { ok: false, grund } });
    const r = await json(await behandle(anfrage(lauf(2)), env, f));
    assert.equal(r.verifiziert, false); assert.equal(r.grund, grund);
  }
});

test('CORS: nur playsaal.com; Voranfrage und falsche Methode', async () => {
  const { f } = ersatz();
  const ok = await behandle(anfrage(lauf(2)), env, f);
  assert.equal(ok.headers.get('access-control-allow-origin'), 'https://playsaal.com');
  const fremd = await behandle(anfrage(lauf(2), { origin: 'https://boese.example' }), env, f);
  assert.equal(fremd.headers.get('access-control-allow-origin'), null);
  const pre = await behandle(anfrage(null, { methode: 'OPTIONS' }), env, f);
  assert.equal(pre.status, 204);
  assert.equal((await behandle(anfrage(null, { methode: 'GET' }), env, f)).status, 405);
});

test('Alle 35 Bot-Lösungen werden bestätigt und bleiben unter 2 s Rechenzeit je Lauf', async () => {
  const { f } = ersatz(); let max = 0;
  for (const id of Object.keys(L)) {
    const t = process.cpuUsage(); const r = await json(await behandle(anfrage(lauf(+id)), env, f)); const d = process.cpuUsage(t);
    max = Math.max(max, (d.user + d.system) / 1000);
    assert.equal(r.verifiziert, true, 'Level ' + id + ' ' + r.grund);
  }
  assert.ok(max < 2000, 'langsamster Lauf ' + max.toFixed(0) + ' ms');
});

test('Kopien der Physik in der Edge Function sind aktuell (node tools/edge-sync.mjs)', () => {
  execFileSync('node', [join(ROOT, 'tools/edge-sync.mjs'), '--check'], { stdio: 'pipe' });
});
