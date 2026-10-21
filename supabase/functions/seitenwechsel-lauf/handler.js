// Prüf-Funktion für SEITENWECHSEL-Läufe (Supabase Edge Function, getestet unter Node).
// Der Browser schickt Kurs (Datum), Tippzeitpunkte, Dauer und Punkte. Der Lauf wird mit derselben Spiellogik (sim.js,
// ganzzahlig, deterministisch) nachgefahren; nur bestätigte Ergebnisse werden eingetragen.
import { pruefeLauf, SIM_VERSION } from './sim.js';

export const ERLAUBTE_URSPRUENGE = ['https://playsaal.com', 'https://www.playsaal.com'];
const MAX_BYTES = 100000;

export function cors(origin) {
  const h = { 'access-control-allow-headers': 'authorization, apikey, content-type', 'access-control-allow-methods': 'POST, OPTIONS', vary: 'origin' };
  if (ERLAUBTE_URSPRUENGE.includes(origin)) h['access-control-allow-origin'] = origin;
  return h;
}
const antwort = (status, body, origin) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...cors(origin) } });

// Datum in Berlin als Zahl JJJJMMTT (jetzt + Tage-Verschiebung)
export function berlinTag(jetzt = new Date(), tage = 0) {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(jetzt.getTime() + tage * 86400000));
  return Number(p.replace(/-/g, ''));
}

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
  if (!lauf || typeof lauf !== 'object' || typeof lauf.inputs !== 'string' || lauf.inputs.length > 80000 || !Number.isInteger(lauf.seed) || !Number.isInteger(lauf.ticks) || !Number.isInteger(lauf.score)) return antwort(400, { grund: 'ungueltig' }, origin);
  if (lauf.v !== SIM_VERSION) return antwort(200, { verifiziert: false, grund: 'version' }, origin);
  // Gewertet wird nur der Kurs von heute (oder gestern, für Läufe über Mitternacht und falsch gehende Uhren)
  if (lauf.seed !== berlinTag(jetzt) && lauf.seed !== berlinTag(jetzt, -1)) return antwort(200, { verifiziert: false, grund: 'tag' }, origin);
  if (lauf.score < 1) return antwort(200, { verifiziert: false, grund: 'ungueltig' }, origin);

  const r = pruefeLauf(lauf);
  if (!r.ok) return antwort(200, { verifiziert: false, grund: r.grund }, origin);

  const h = { apikey: env.serviceKey, authorization: 'Bearer ' + env.serviceKey, 'content-type': 'application/json' };
  const res = await f(env.url + '/rest/v1/rpc/seitenwechsel_eintragen', { method: 'POST', headers: h,
    body: JSON.stringify({ p_user: user.id, p_seed: lauf.seed, p_punkte: r.punkte, p_ticks: r.takte, p_version: SIM_VERSION, p_inputs: lauf.inputs }) }).catch(() => null);
  if (!res || !res.ok) return antwort(500, { grund: 'speichern' }, origin);
  const e = await res.json().catch(() => null);
  if (!e || !e.ok) return antwort(200, { verifiziert: false, grund: (e && e.grund) || 'speichern' }, origin);
  return antwort(200, { verifiziert: true, punkte: r.punkte, platz_heute: e.platz_heute || null, spieler_heute: e.spieler_heute || null, platz_monat: e.platz_monat || null }, origin);
}
