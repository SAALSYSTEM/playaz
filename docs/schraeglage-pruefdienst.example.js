// ENTWURF – nicht aktiv. Prüfdienst für SCHRÄGLAGE-Bestzeiten als Teil des Workers "playaz".
// Einbau (erst wenn Supabase-Konten live sind): in src/worker.js (Branch "rangliste") die Route
// POST /api/schraeglage/lauf an pruefeLauf() weitergeben und in wrangler.jsonc setzen:
//   "main": "src/worker.js", "assets": { "directory": "./public", "binding": "ASSETS", "run_worker_first": ["/api/*"] },
//   "limits": { "cpu_ms": 30000 }
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_KEY (nie in den Browser!).
//
// Wichtig: Das Nachfahren kostet je Lauf etwa 0,1–1 s CPU. Auf dem kostenlosen Workers-Plan sind nur
// 10 ms CPU pro Anfrage erlaubt – dafür braucht es Workers Paid (Standard: 30 s CPU pro Anfrage).

import { verifyRun, SIM_VERSION } from '../public/spiele/schraeglage/sim.js';
import { LEVELS } from '../public/spiele/schraeglage/levels.js';

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

export async function pruefeLauf(request, env) {
  // 1) Wer meldet? Supabase-Sitzung prüfen (der Browser schickt sein access_token mit)
  const token = (request.headers.get('authorization') || '').replace(/^Bearer /, '');
  if (!token) return json(401, { grund: 'nicht_angemeldet' });
  const u = await fetch(env.SUPABASE_URL + '/auth/v1/user', { headers: { apikey: env.SUPABASE_SERVICE_KEY, authorization: 'Bearer ' + token } });
  if (!u.ok) return json(401, { grund: 'nicht_angemeldet' });
  const user = await u.json();

  // 2) Eingaben grob prüfen, bevor gerechnet wird
  const run = await request.json().catch(() => null);
  if (!run || run.v !== SIM_VERSION) return json(200, { verifiziert: false, grund: 'version' });
  const level = LEVELS.find((l) => l.id === run.level);
  if (!level || typeof run.inputs !== 'string' || run.inputs.length > 60000 || !Number.isInteger(run.ms)) return json(400, { grund: 'ungueltig' });
  // Untergrenze: schneller als ein Lösungs-Bot mit perfektem Timing geht es kaum (Goldzeit / 2 als harte Grenze)
  if (level.gold && run.ms < level.gold * 500) return json(200, { verifiziert: false, grund: 'unplausibel_schnell' });

  // 3) Lauf exakt nachfahren. Die Physik rechnet in jedem Browser und hier bitgenau gleich (det.js).
  const r = verifyRun(level, run);
  if (!r.ok) return json(200, { verifiziert: false, grund: r.grund });

  // 4) Eintragen (nur der Prüfdienst darf schreiben) und Platz zurückgeben
  const h = { apikey: env.SUPABASE_SERVICE_KEY, authorization: 'Bearer ' + env.SUPABASE_SERVICE_KEY, 'content-type': 'application/json' };
  const ins = await fetch(env.SUPABASE_URL + '/rest/v1/schraeglage_laeufe', { method: 'POST', headers: h,
    body: JSON.stringify({ user_id: user.id, level: level.id, ms: r.ms, sim_version: SIM_VERSION, inputs: run.inputs }) });
  if (!ins.ok) return json(500, { grund: 'speichern' });
  const platz = await fetch(env.SUPABASE_URL + '/rest/v1/rpc/schraeglage_platz', { method: 'POST', headers: h,
    body: JSON.stringify({ p_user: user.id, p_level: level.id }) }).then((x) => x.json()).catch(() => ({}));
  return json(200, { verifiziert: true, ms: r.ms, ...platz });
}
