// Prüf-Funktion für LEITUNGSCHAOS-Tagesrätsel (Supabase Edge Function, getestet unter Node).
// Der Browser schickt die Run-ID und die Folge der angetippten Felder. Seed und Version kommen aus der Datenbank (nie vom
// Browser); der Lösungsweg wird mit derselben Spiellogik (sim.js) nachgespielt. Die Zeit misst die Datenbank selbst.
// Eingetragen wird nur ein gelöstes Rätsel mit übereinstimmender Zahl der Drehungen; die Run-ID gilt genau einmal.
import { pruefeLauf } from './sim.js';

export const ERLAUBTE_URSPRUENGE = ['https://playsaal.com', 'https://www.playsaal.com'];
const MAX_BYTES = 10000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  if (req.method !== 'POST') return antwort(405, { grund: 'methode' }, origin);

  const token = (req.headers.get('authorization') || '').replace(/^Bearer /i, '');
  if (!token) return antwort(401, { grund: 'nicht_angemeldet' }, origin);
  const u = await f(env.url + '/auth/v1/user', { headers: { apikey: env.serviceKey, authorization: 'Bearer ' + token } }).catch(() => null);
  if (!u || !u.ok) return antwort(401, { grund: 'nicht_angemeldet' }, origin);
  const user = await u.json().catch(() => null);
  if (!user || !UUID.test(user.id || '')) return antwort(401, { grund: 'nicht_angemeldet' }, origin);

  const text = await req.text();
  if (text.length > MAX_BYTES) return antwort(413, { grund: 'zu_gross' }, origin);
  let lauf; try { lauf = JSON.parse(text); } catch (e) { lauf = null; }
  if (!lauf || typeof lauf !== 'object' || !UUID.test(lauf.run_id || '') || typeof lauf.inputs !== 'string' || lauf.inputs.length > 3000
    || !Number.isInteger(lauf.drehungen)) return antwort(400, { grund: 'ungueltig' }, origin);

  const h = { apikey: env.serviceKey, authorization: 'Bearer ' + env.serviceKey, 'content-type': 'application/json' };
  const rpc = async (name, body) => { const res = await f(env.url + '/rest/v1/rpc/' + name, { method: 'POST', headers: h, body: JSON.stringify(body) }).catch(() => null); return res && res.ok ? res.json().catch(() => null) : null; };

  const run = await rpc('leitungschaos_run_lesen', { p_user: user.id, p_run: lauf.run_id });
  if (!run) return antwort(500, { grund: 'speichern' }, origin);
  if (!run.ok) return antwort(200, { verifiziert: false, grund: run.grund }, origin);

  const r = pruefeLauf(run.seed, run.version, lauf);
  if (!r.ok) return antwort(200, { verifiziert: false, grund: r.grund }, origin);

  const e = await rpc('leitungschaos_abschliessen', { p_user: user.id, p_run: lauf.run_id, p_drehungen: r.drehungen, p_inputs: lauf.inputs });
  if (!e) return antwort(500, { grund: 'speichern' }, origin);
  if (!e.ok) return antwort(200, { verifiziert: false, grund: e.grund || 'speichern' }, origin);
  return antwort(200, { verifiziert: true, drehungen: r.drehungen, zeit_cs: e.zeit_cs, tag: e.tag, rang: e.rang || null }, origin);
}
