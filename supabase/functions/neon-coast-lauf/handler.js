// Prüf-Funktion für die NEON-COAST-Tagesnacht (Supabase Edge Function, getestet unter Node).
// Der Browser schickt den Tag (Datum), die Eingaben je Takt, Takte, gesicherte Beute und Koffer.
// Die Nacht wird mit denselben Regeln (engine.js, feste Takte, deterministisch) nachgespielt; nur bestätigte Nächte zählen.
import { pruefeLauf, berlinTag, SIM_VERSION } from './tagesnacht.js';

export const ERLAUBTE_URSPRUENGE = ['https://playsaal.com', 'https://www.playsaal.com'];
const MAX_BYTES = 200000;
export { berlinTag };

export function cors(origin) {
  const h = { 'access-control-allow-headers': 'authorization, apikey, content-type', 'access-control-allow-methods': 'POST, OPTIONS', vary: 'origin' };
  if (ERLAUBTE_URSPRUENGE.includes(origin)) h['access-control-allow-origin'] = origin;
  return h;
}
const antwort = (status, body, origin) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...cors(origin) } });

// env: { url, serviceKey }.  f: fetch, jetzt: Zeitpunkt (für Tests ersetzbar)
export async function behandle(req, env, f = fetch, jetzt = new Date()) {
  const origin = req.headers.get('origin') || '';
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });
  if (req.method !== 'POST') return antwort(405, { grund: 'methode' }, origin);

  const token = (req.headers.get('authorization') || '').replace(/^Bearer /i, '');
  if (!token) return antwort(401, { grund: 'nicht_angemeldet' }, origin);
  const u = await f(env.url + '/auth/v1/user', { headers: { apikey: env.serviceKey, authorization: 'Bearer ' + token } }).catch(() => null);
  if (!u || !u.ok) return antwort(401, { grund: 'nicht_angemeldet' }, origin);
  const user = await u.json().catch(() => null);
  if (!user || !/^[0-9a-f-]{36}$/i.test(user.id || '')) return antwort(401, { grund: 'nicht_angemeldet' }, origin);

  const text = await req.text();
  if (text.length > MAX_BYTES) return antwort(413, { grund: 'zu_gross' }, origin);
  let lauf; try { lauf = JSON.parse(text); } catch (e) { lauf = null; }
  if (!lauf || typeof lauf !== 'object' || typeof lauf.inputs !== 'string' || lauf.inputs.length > 150000 || !Number.isInteger(lauf.seed)
    || !Number.isInteger(lauf.takte) || !Number.isInteger(lauf.sicher) || !Number.isInteger(lauf.koffer)) return antwort(400, { grund: 'ungueltig' }, origin);
  if (lauf.v !== SIM_VERSION) return antwort(200, { verifiziert: false, grund: 'version' }, origin);
  // Gewertet wird nur die Nacht von heute (oder gestern, für Nächte über Mitternacht und falsch gehende Uhren)
  if (lauf.seed !== berlinTag(jetzt) && lauf.seed !== berlinTag(jetzt, -1)) return antwort(200, { verifiziert: false, grund: 'tag' }, origin);
  if (lauf.sicher < 1) return antwort(200, { verifiziert: false, grund: 'keine_beute' }, origin);

  const t0 = Date.now();
  const r = pruefeLauf(lauf);
  const ms = Date.now() - t0;   // Rechenzeit der Nachprüfung (Grenze der Plattform: 2 s)
  if (!r.ok) return antwort(200, { verifiziert: false, grund: r.grund, ms }, origin);

  const h = { apikey: env.serviceKey, authorization: 'Bearer ' + env.serviceKey, 'content-type': 'application/json' };
  const res = await f(env.url + '/rest/v1/rpc/neon_coast_eintragen', { method: 'POST', headers: h,
    body: JSON.stringify({ p_user: user.id, p_seed: lauf.seed, p_beute: r.sicher, p_koffer: r.koffer, p_takte: r.takte, p_version: SIM_VERSION, p_inputs: lauf.inputs }) }).catch(() => null);
  if (!res || !res.ok) return antwort(500, { grund: 'speichern' }, origin);
  const e = await res.json().catch(() => null);
  if (!e || !e.ok) return antwort(200, { verifiziert: false, grund: (e && e.grund) || 'speichern' }, origin);
  return antwort(200, { verifiziert: true, beute: r.sicher, platz_heute: e.platz_heute || null, spieler_heute: e.spieler_heute || null, platz_monat: e.platz_monat || null, ms }, origin);
}
