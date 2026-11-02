// Prüf-Funktion für PUTT-PROFI-Tagesrunden (Supabase Edge Function, getestet unter Node).
// Der Browser schickt Datum der Runde, alle Schläge (Richtung, Stärke, Mühlentakt) und die Schlagzahl.
// Die 5 Bahnen werden mit denselben Regeln (logik.js, feste Takte, deterministisch) nachgespielt; nur bestätigte Runden zählen.
import { pruefeRunde, berlinTag, SIM_VERSION } from './logik.js';

export const ERLAUBTE_URSPRUENGE = ['https://playsaal.com', 'https://www.playsaal.com'];
const MAX_BYTES = 8000;
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
  let runde; try { runde = JSON.parse(text); } catch (e) { runde = null; }
  if (!runde || typeof runde !== 'object' || typeof runde.inputs !== 'string' || runde.inputs.length > 4000 || !Number.isInteger(runde.seed) || !Number.isInteger(runde.schlaege)) return antwort(400, { grund: 'ungueltig' }, origin);
  if (runde.v !== SIM_VERSION) return antwort(200, { verifiziert: false, grund: 'version' }, origin);
  // Gewertet wird nur die Runde von heute (oder gestern, für Runden über Mitternacht und falsch gehende Uhren)
  if (runde.seed !== berlinTag(jetzt) && runde.seed !== berlinTag(jetzt, -1)) return antwort(200, { verifiziert: false, grund: 'tag' }, origin);

  const r = pruefeRunde(runde.seed, runde.inputs);
  if (!r.ok) return antwort(200, { verifiziert: false, grund: r.grund }, origin);
  if (r.schlaege !== runde.schlaege) return antwort(200, { verifiziert: false, grund: 'abweichung' }, origin);

  const h = { apikey: env.serviceKey, authorization: 'Bearer ' + env.serviceKey, 'content-type': 'application/json' };
  const res = await f(env.url + '/rest/v1/rpc/putt_eintragen', { method: 'POST', headers: h,
    body: JSON.stringify({ p_user: user.id, p_seed: runde.seed, p_schlaege: r.schlaege, p_par: r.par, p_version: SIM_VERSION, p_inputs: runde.inputs }) }).catch(() => null);
  if (!res || !res.ok) return antwort(500, { grund: 'speichern' }, origin);
  const e = await res.json().catch(() => null);
  if (!e || !e.ok) return antwort(200, { verifiziert: false, grund: (e && e.grund) || 'speichern' }, origin);
  return antwort(200, { verifiziert: true, schlaege: r.schlaege, par: r.par, platz_heute: e.platz_heute || null, spieler_heute: e.spieler_heute || null, platz_monat: e.platz_monat || null }, origin);
}
