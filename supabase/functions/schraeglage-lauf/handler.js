// Prüf-Funktion für SCHRÄGLAGE-Bestzeiten (läuft als Supabase Edge Function, getestet unter Node).
// Der Browser schickt nie nur eine Zeit, sondern die Eingabefolge. Sie wird mit derselben Physik (sim.js, bitgenau
// deterministisch) nachgefahren; nur bestätigte Zeiten werden eingetragen. Eine behauptete Zeit wird nie übernommen.
import { verifyRun, SIM_VERSION } from './sim.js';
import { LEVELS } from './levels.js';

export const ERLAUBTE_URSPRUENGE = ['https://playsaal.com', 'https://www.playsaal.com'];
const MAX_BYTES = 90000;

export function cors(origin) {
  const h = { 'access-control-allow-headers': 'authorization, apikey, content-type', 'access-control-allow-methods': 'POST, OPTIONS', vary: 'origin' };
  if (ERLAUBTE_URSPRUENGE.includes(origin)) h['access-control-allow-origin'] = origin;
  return h;
}
const antwort = (status, body, origin) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...cors(origin) } });

// env: { url, serviceKey }.  f: fetch (für Tests ersetzbar)
export async function behandle(req, env, f = fetch) {
  const origin = req.headers.get('origin') || '';
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });
  if (req.method !== 'POST') return antwort(405, { grund: 'methode' }, origin);

  // 1) Wer meldet? Die Sitzung des Spielers wird bei Supabase geprüft.
  const token = (req.headers.get('authorization') || '').replace(/^Bearer /i, '');
  if (!token) return antwort(401, { grund: 'nicht_angemeldet' }, origin);
  const u = await f(env.url + '/auth/v1/user', { headers: { apikey: env.serviceKey, authorization: 'Bearer ' + token } }).catch(() => null);
  if (!u || !u.ok) return antwort(401, { grund: 'nicht_angemeldet' }, origin);
  const user = await u.json().catch(() => null);
  if (!user || !/^[0-9a-f-]{36}$/i.test(user.id || '')) return antwort(401, { grund: 'nicht_angemeldet' }, origin);

  // 2) Eingaben grob prüfen, bevor gerechnet wird
  const text = await req.text();
  if (text.length > MAX_BYTES) return antwort(413, { grund: 'zu_gross' }, origin);
  let run; try { run = JSON.parse(text); } catch (e) { run = null; }
  if (!run || typeof run !== 'object') return antwort(400, { grund: 'ungueltig' }, origin);
  if (run.v !== SIM_VERSION) return antwort(200, { verifiziert: false, grund: 'version' }, origin);
  const level = LEVELS.find((l) => l.id === run.level);
  if (!level || typeof run.inputs !== 'string' || run.inputs.length > 60000 || !Number.isInteger(run.ms)) return antwort(400, { grund: 'ungueltig' }, origin);
  // Harte Untergrenze: deutlich schneller als die Goldzeit ist ohne Programm kaum möglich
  if (level.gold && run.ms < level.gold * 500) return antwort(200, { verifiziert: false, grund: 'unplausibel_schnell' }, origin);

  // 3) Lauf nachfahren (bitgenau)
  const r = verifyRun(level, run);
  if (!r.ok) return antwort(200, { verifiziert: false, grund: r.grund }, origin);

  // 4) Eintragen (nur diese Funktion darf schreiben) und Platz zurückgeben
  const h = { apikey: env.serviceKey, authorization: 'Bearer ' + env.serviceKey, 'content-type': 'application/json' };
  const res = await f(env.url + '/rest/v1/rpc/schraeglage_eintragen', { method: 'POST', headers: h,
    body: JSON.stringify({ p_user: user.id, p_level: level.id, p_ms: r.ms, p_version: SIM_VERSION, p_inputs: run.inputs }) }).catch(() => null);
  if (!res || !res.ok) return antwort(500, { grund: 'speichern' }, origin);
  const e = await res.json().catch(() => null);
  if (!e || !e.ok) return antwort(200, { verifiziert: false, grund: (e && e.grund) || 'speichern' }, origin);
  return antwort(200, { verifiziert: true, ms: r.ms, platz_monat: e.platz_monat || null, spieler_monat: e.spieler_monat || null, platz_jahr: e.platz_jahr || null }, origin);
}
