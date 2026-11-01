// Supabase Edge Function "rocket-reels": Space Coins für angemeldete Spieler (getestet unter Node, tests/rocket-reels-konto.test.mjs).
// Der Browser schickt nur eine Aktion: { aktion: 'stand'|'dreh'|'sichern'|'risiko'|'sprung'|'nachfuellen'|'tagesbonus'|'gast', einsatz?, route?, gast? }.
// Hier wird gelesen, mit engine.js (Kopie aus public/spiele/rocket-reels/, node tools/edge-sync.mjs) und Krypto-Zufall ausgewertet
// und nur bei unveränderter Revision gespeichert. Coin-Beträge aus dem Browser werden nie übernommen (außer gedeckelt bei der
// einmaligen Gast-Übernahme, siehe engine.js gastUebernehmen).
import * as E from './engine.js';

export const ERLAUBTE_URSPRUENGE = ['https://playsaal.com', 'https://www.playsaal.com'];
const AKTIONEN = ['stand', 'dreh', 'sichern', 'risiko', 'sprung', 'nachfuellen', 'tagesbonus', 'gast'];
const MAX_BYTES = 10000;

export function cors(origin) {
  const h = { 'access-control-allow-headers': 'authorization, apikey, content-type', 'access-control-allow-methods': 'POST, OPTIONS', vary: 'origin' };
  if (ERLAUBTE_URSPRUENGE.includes(origin)) h['access-control-allow-origin'] = origin;
  return h;
}
const antwort = (status, body, origin) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...cors(origin) } });
export function berlinTag(d) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

// env: { url, serviceKey }. f: fetch, jetzt: Datum, zufall: Zufallsquelle (für Tests ersetzbar)
export async function behandle(req, env, f = fetch, jetzt = new Date(), zufall = E.kryptoZufall()) {
  const origin = req.headers.get('origin') || '';
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });
  if (req.method !== 'POST') return antwort(405, { ok: false, grund: 'methode' }, origin);

  const token = (req.headers.get('authorization') || '').replace(/^Bearer /i, '');
  if (!token) return antwort(401, { ok: false, grund: 'nicht_angemeldet' }, origin);
  const u = await f(env.url + '/auth/v1/user', { headers: { apikey: env.serviceKey, authorization: 'Bearer ' + token } }).catch(() => null);
  if (!u || !u.ok) return antwort(401, { ok: false, grund: 'nicht_angemeldet' }, origin);
  const user = await u.json().catch(() => null);
  if (!user || !/^[0-9a-f-]{36}$/i.test(user.id || '')) return antwort(401, { ok: false, grund: 'nicht_angemeldet' }, origin);

  const text = await req.text();
  if (text.length > MAX_BYTES) return antwort(413, { ok: false, grund: 'zu_gross' }, origin);
  let b; try { b = JSON.parse(text); } catch (e) { b = null; }
  if (!b || typeof b !== 'object' || !AKTIONEN.includes(b.aktion)) return antwort(400, { ok: false, grund: 'ungueltig' }, origin);

  const h = { apikey: env.serviceKey, authorization: 'Bearer ' + env.serviceKey, 'content-type': 'application/json' };
  const rpc = async (name, args) => {
    const r = await f(env.url + '/rest/v1/rpc/' + name, { method: 'POST', headers: h, body: JSON.stringify(args) }).catch(() => null);
    if (!r || !r.ok) return { fehler: true };
    return { daten: await r.json().catch(() => null) };
  };

  const gelesen = await rpc('rocket_laden', { p_user: user.id });
  if (gelesen.fehler) return antwort(500, { ok: false, grund: 'laden' }, origin);
  let zustand = gelesen.daten && E.pruefeZustand(gelesen.daten.zustand);
  let basis = gelesen.daten ? gelesen.daten.revision : 0;
  if (gelesen.daten && !zustand) return antwort(500, { ok: false, grund: 'stand_defekt' }, origin); // nie still überschreiben
  if (!zustand) { zustand = E.neuerZustand(); basis = 0; }

  let r;
  if (b.aktion === 'stand') {
    if (basis > 0) return antwort(200, { ok: true, zustand }, origin);
    r = { zustand, ergebnis: { typ: 'neu' } };
  } else if (b.aktion === 'gast') {
    r = E.gastUebernehmen(zustand, b.gast);
  } else {
    const a = { typ: b.aktion };
    if (b.einsatz !== undefined) a.einsatz = b.einsatz;
    if (b.route !== undefined) a.route = b.route;
    r = E.aktion(zustand, a, zufall, { tag: berlinTag(jetzt) });
  }
  if (r.fehler) return antwort(200, { ok: false, grund: r.fehler, zustand }, origin);

  const s = await rpc('rocket_speichern', { p_user: user.id, p_basis: basis, p_zustand: r.zustand });
  if (s.fehler || !s.daten) return antwort(500, { ok: false, grund: 'speichern', zustand }, origin);
  if (!s.daten.ok) {
    // Konflikt: anderer Tab/anderes Gerät war schneller -> aktuellen Stand mitschicken, Aktion wurde NICHT ausgeführt
    const neu = await rpc('rocket_laden', { p_user: user.id });
    const aktuell = neu.daten && E.pruefeZustand(neu.daten.zustand);
    return antwort(200, { ok: false, grund: s.daten.grund || 'konflikt', zustand: aktuell || zustand }, origin);
  }
  return antwort(200, { ok: true, zustand: r.zustand, ergebnis: r.ergebnis }, origin);
}
