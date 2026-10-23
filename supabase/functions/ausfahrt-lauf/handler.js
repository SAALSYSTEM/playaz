// Prüf-Funktion für AUSFAHRT-FREI-Tagesrätsel (Supabase Edge Function, getestet unter Node).
// Der Browser schickt die Run-ID und die Züge (Fahrzeug + neue Position). Seed und Version kommen aus der Datenbank (nie vom
// Browser); jeder Zug wird mit derselben Spiellogik (sim.js) und demselben Rätselpool (raetsel.js) nachgespielt. Die Zeit misst die Datenbank selbst.
// Eingetragen wird nur ein gelöstes Rätsel mit übereinstimmender Zugzahl; die Run-ID gilt genau einmal.
import { pruefeLauf } from './sim.js';
import { POOLS } from './raetsel.js';

export const ERLAUBTE_URSPRUENGE = ['https://playsaal.com', 'https://www.playsaal.com'];
const MAX_BYTES = 10000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Prüfsumme über den Rätselpool (FNV-1a über JSON.stringify(POOLS)). Stimmt sie nicht, wurde raetsel.js beim Deploy
// beschädigt oder ist veraltet: dann wird nichts gewertet, und GET meldet "pool: falsch" (Abfrage ohne Anmeldung möglich).
// Nach einer Änderung an raetsel.js neu setzen: node --test tests/ausfahrt-pruefung.test.mjs nennt den neuen Wert.
export const POOL_PRUEFSUMME = 'd2014e44';
export function pruefsumme(obj) {
  const s = JSON.stringify(obj); let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}
const POOL_OK = pruefsumme(POOLS) === POOL_PRUEFSUMME;

export function cors(origin) {
  const h = { 'access-control-allow-headers': 'authorization, apikey, content-type', 'access-control-allow-methods': 'POST, OPTIONS', vary: 'origin' };
  if (ERLAUBTE_URSPRUENGE.includes(origin)) h['access-control-allow-origin'] = origin;
  return h;
}
const antwort = (status, body, origin) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...cors(origin) } });

// env: { url, serviceKey }.  f: fetch
export async function behandle(req, env, f = fetch) {
  const origin = req.headers.get('origin') || '';
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });
  if (req.method === 'GET') return antwort(200, { pool: POOL_OK ? 'ok' : 'falsch', raetsel: Object.values(POOLS).reduce((a, p) => a + p.length, 0) }, origin);
  if (req.method !== 'POST') return antwort(405, { grund: 'methode' }, origin);
  if (!POOL_OK) return antwort(500, { grund: 'pool' }, origin);

  const token = (req.headers.get('authorization') || '').replace(/^Bearer /i, '');
  if (!token) return antwort(401, { grund: 'nicht_angemeldet' }, origin);
  const u = await f(env.url + '/auth/v1/user', { headers: { apikey: env.serviceKey, authorization: 'Bearer ' + token } }).catch(() => null);
  if (!u || !u.ok) return antwort(401, { grund: 'nicht_angemeldet' }, origin);
  const user = await u.json().catch(() => null);
  if (!user || !UUID.test(user.id || '')) return antwort(401, { grund: 'nicht_angemeldet' }, origin);

  const text = await req.text();
  if (text.length > MAX_BYTES) return antwort(413, { grund: 'zu_gross' }, origin);
  let lauf; try { lauf = JSON.parse(text); } catch (e) { lauf = null; }
  if (!lauf || typeof lauf !== 'object' || !UUID.test(lauf.run_id || '') || typeof lauf.inputs !== 'string' || lauf.inputs.length > 2000
    || !Number.isInteger(lauf.zuege)) return antwort(400, { grund: 'ungueltig' }, origin);

  const h = { apikey: env.serviceKey, authorization: 'Bearer ' + env.serviceKey, 'content-type': 'application/json' };
  const rpc = async (name, body) => { const res = await f(env.url + '/rest/v1/rpc/' + name, { method: 'POST', headers: h, body: JSON.stringify(body) }).catch(() => null); return res && res.ok ? res.json().catch(() => null) : null; };

  const run = await rpc('ausfahrt_run_lesen', { p_user: user.id, p_run: lauf.run_id });
  if (!run) return antwort(500, { grund: 'speichern' }, origin);
  if (!run.ok) return antwort(200, { verifiziert: false, grund: run.grund }, origin);

  const r = pruefeLauf(run.seed, run.version, lauf, POOLS);
  if (!r.ok) return antwort(200, { verifiziert: false, grund: r.grund }, origin);

  const e = await rpc('ausfahrt_abschliessen', { p_user: user.id, p_run: lauf.run_id, p_zuege: r.zuege, p_inputs: lauf.inputs });
  if (!e) return antwort(500, { grund: 'speichern' }, origin);
  if (!e.ok) return antwort(200, { verifiziert: false, grund: e.grund || 'speichern' }, origin);
  return antwort(200, { verifiziert: true, zuege: r.zuege, zeit_cs: e.zeit_cs, tag: e.tag, rang: e.rang || null }, origin);
}
