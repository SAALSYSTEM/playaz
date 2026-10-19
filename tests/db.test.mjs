// Datenbanktests für supabase/migrations/*.sql gegen eine lokale Postgres-Kopie (PGlite, WebAssembly, kein Netzwerk).
// Stellt die Supabase-Rollen (anon, authenticated), auth.uid() und die Standardrechte nach und prüft:
// Row Level Security, Rechte auf Tabellen und Funktionen, Spielstand-Revisionen, Namensregeln, Adminschutz,
// Ratenbegrenzung, Statistik-Deduplizierung und Kontolöschung.
// Start:  npm i --no-save @electric-sql/pglite && node --test tests/db.test.mjs
//         (oder PGLITE_PATH=/pfad/zu/node_modules/@electric-sql/pglite node --test tests/db.test.mjs)
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIG = join(ROOT, 'supabase/migrations');
let db;
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const ADM = '33333333-3333-4333-8333-333333333333';

async function ladePglite() {
  const wege = [process.env.PGLITE_PATH && join(process.env.PGLITE_PATH, 'dist/index.js'), '@electric-sql/pglite'].filter(Boolean);
  for (const w of wege) { try { return await import(w.startsWith('/') ? pathToFileURL(w).href : w); } catch (e) {} }
  throw new Error('PGlite fehlt: npm i --no-save @electric-sql/pglite');
}

// Führt SQL als Rolle/Nutzer aus (wie PostgREST): erst Rolle und JWT-Claims setzen, dann abfragen, danach zurücksetzen.
async function als(rolle, uid, sql, params) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid || ''}', false); select set_config('request.headers', '{"cf-connecting-ip":"203.0.113.7"}', false);`);
  if (rolle) await db.exec(`set role ${rolle}`);
  try { return (await db.query(sql, params)).rows; } finally { await db.exec('reset role'); }
}
const fehler = async (rolle, uid, sql, params) => { try { await als(rolle, uid, sql, params); return null; } catch (e) { return e; } };
const rpc = async (rolle, uid, fn, ...args) => {
  const ph = args.map((_, i) => `$${i + 1}`).join(', ');
  return (await als(rolle, uid, `select public.${fn}(${ph}) as r`, args))[0].r;
};
const ADMIN_UID = ADM;

before(async () => {
  const { PGlite } = await ladePglite();
  const { pgcrypto } = await import(process.env.PGLITE_PATH ? pathToFileURL(join(process.env.PGLITE_PATH, 'dist/contrib/pgcrypto.js')).href : '@electric-sql/pglite/contrib/pgcrypto');
  db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin;
    create schema extensions; create extension pgcrypto with schema extensions;
    create schema auth; create table auth.users (id uuid primary key, email text);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema public, extensions, auth to anon, authenticated, service_role;
    grant execute on function auth.uid() to anon, authenticated;
    grant select on auth.users to service_role;
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
    alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
    insert into auth.users (id, email) values ('${A}', 'a@example.org'), ('${B}', 'b@example.org'), ('${ADM}', 'admin@example.org');
  `);
  for (const f of readdirSync(MIG).filter((x) => x.endsWith('.sql')).sort()) await db.exec(readFileSync(join(MIG, f), 'utf8'));
});

const keys = (o) => ({ keys: o });
const speichern = (uid, game, data, base = 0, fortschritt = 1) => rpc('authenticated', uid, 'spielstand_speichern', game, 1, JSON.stringify(data), fortschritt, 'Test', base, 'Test-Gerät', '2026-10-19T12:00:00Z');

test('Stammdaten: 21 Spiele, 7 Kategorien, Spiele ohne Kollision', async () => {
  assert.equal((await als('anon', null, 'select count(*)::int n from public.games'))[0].n, 21);
  assert.equal((await als('anon', null, 'select count(*)::int n from public.categories'))[0].n, 7);
  assert.equal((await als('anon', null, `select count(*)::int n from public.games where hot`))[0].n, 7);
});

test('Anonyme Besucher: keine privaten Tabellen, keine privaten Funktionen', async () => {
  for (const t of ['profiles', 'saves', 'favorites']) {
    const e = await fehler('anon', null, `select * from public.${t}`);
    assert.match(String(e && e.message), /permission denied/, t);
  }
  for (const t of ['bug_reports', 'stat_daily', 'admins', 'rate_limits', 'settings']) {
    const e = await fehler('anon', null, `select * from private.${t}`);
    assert.match(String(e && e.message), /permission denied/, 'private.' + t);
  }
  for (const f of ['profil_speichern(\'x\',\'a1\')', 'name_frei(\'abc\')', 'ist_admin()', 'konto_loeschen(\'LÖSCHEN\')', 'admin_statistik(1)', 'admin_fehler()']) {
    const e = await fehler('anon', null, `select public.${f}`);
    assert.match(String(e && e.message), /permission denied/, f);
  }
  const e2 = await fehler('anon', null, `insert into public.games (slug,name,save_id,save_prefix) values ('hack','x','hack','hack.')`);
  assert.match(String(e2 && e2.message), /permission denied/);
});

test('Profil: Namensregeln, Eindeutigkeit ohne Groß/Klein, Avatar, eigene Sicht', async () => {
  assert.deepEqual(await rpc('authenticated', A, 'profil_speichern', 'ab', 'a1'), { ok: false, fehler: 'zu_kurz' });
  assert.deepEqual(await rpc('authenticated', A, 'profil_speichern', 'x'.repeat(21), 'a1'), { ok: false, fehler: 'zu_lang' });
  assert.deepEqual(await rpc('authenticated', A, 'profil_speichern', '<b>Hack</b>', 'a1'), { ok: false, fehler: 'zeichen' });
  assert.deepEqual(await rpc('authenticated', A, 'profil_speichern', 'Admin Anna', 'a1'), { ok: false, fehler: 'unzulaessig' });
  assert.deepEqual(await rpc('authenticated', A, 'profil_speichern', 'Anna', 'zz'), { ok: false, fehler: 'avatar' });
  assert.deepEqual(await rpc('authenticated', A, 'profil_speichern', '  Anna  Maus ', 'a3'), { ok: true, name: 'Anna Maus', avatar: 'a3' });
  assert.deepEqual(await rpc('authenticated', B, 'profil_speichern', 'anna maus', 'a1'), { ok: false, fehler: 'vergeben' });
  assert.deepEqual(await rpc('authenticated', B, 'name_frei', 'ANNA MAUS'), { frei: false, fehler: 'vergeben' });
  assert.deepEqual(await rpc('authenticated', B, 'name_frei', 'Ben 7'), { frei: true });
  assert.equal((await rpc('authenticated', B, 'profil_speichern', 'Ben 7', 'a2')).ok, true);
  assert.deepEqual(await rpc('authenticated', A, 'profil_speichern', 'Anna Maus', 'a4'), { ok: true, name: 'Anna Maus', avatar: 'a4' }); // eigener Name bleibt änderbar
  const a = await als('authenticated', A, 'select user_id, display_name from public.profiles');
  assert.equal(a.length, 1); assert.equal(a[0].user_id, A);
  const direkt = await fehler('authenticated', A, `update public.profiles set display_name='Hacker' where user_id='${A}'`);
  assert.match(String(direkt && direkt.message), /permission denied/);
});

test('Spielstände: Revisionen, Konflikt, Validierung, Isolation zwischen Konten', async () => {
  const r1 = await speichern(A, 'jungle-runner', keys({ 'jungle.v1': '{"levels":{"1":{"done":true}}}' }));
  assert.equal(r1.status, 'ok'); assert.equal(r1.revision, 1);
  const r2 = await speichern(A, 'jungle-runner', keys({ 'jungle.v1': '{"levels":{"1":{"done":true},"2":{"done":true}}}' }), 1, 2);
  assert.equal(r2.status, 'ok'); assert.equal(r2.revision, 2);
  // zweites Gerät kennt nur Revision 1: Konflikt, Server-Stand kommt zurück, nichts wird überschrieben
  const k = await speichern(A, 'jungle-runner', keys({ 'jungle.v1': '{"alt":true}' }), 1);
  assert.equal(k.status, 'konflikt'); assert.equal(k.server.revision, 2); assert.match(k.server.data.keys['jungle.v1'], /"2"/);
  // erster Upload eines Geräts, obwohl es schon einen Stand gibt: ebenfalls Konflikt
  assert.equal((await speichern(A, 'jungle-runner', keys({ 'jungle.v1': '{}' }), 0)).status, 'konflikt');
  assert.match((await als('authenticated', A, `select data->'keys'->>'jungle.v1' v from public.saves`))[0].v, /"2"/);
  // Validierung
  assert.equal((await speichern(A, 'gibtsnicht', keys({ 'x.v1': '1' }))).grund, 'spiel');
  assert.equal((await speichern(A, 'anbiss', keys({ 'jungle.v1': '1' }))).grund, 'schluessel'); // falsches Präfix
  assert.equal((await speichern(A, 'anbiss', keys({ 'anbiss.v1': 5 }))).grund, 'schluessel'); // kein String
  assert.equal((await speichern(A, 'anbiss', keys({ 'anbiss.bad_key': '5' }))).grund, 'schluessel'); // Zeichen
  assert.equal((await speichern(A, 'anbiss', { nope: 1 })).grund, 'aufbau');
  assert.equal((await speichern(A, 'anbiss', keys({ 'anbiss.v1': 'x'.repeat(1500001) }))).grund, 'groesse');
  const viele = Object.fromEntries(Array.from({ length: 51 }, (_, i) => ['anbiss.k' + i, '1'])); assert.equal((await speichern(A, 'anbiss', keys(viele))).grund, 'schluessel');
  assert.equal((await rpc('authenticated', A, 'spielstand_speichern', 'anbiss', 0, JSON.stringify(keys({ 'anbiss.v1': '1' })), 1, '', 0, '', null)).grund, 'format');
  // Isolation: B sieht nichts von A, kann A nicht überschreiben oder löschen
  assert.equal((await als('authenticated', B, 'select * from public.saves')).length, 0);
  const rb = await speichern(B, 'jungle-runner', keys({ 'jungle.v1': '{"b":1}' }));
  assert.equal(rb.status, 'ok'); assert.equal(rb.revision, 1);
  assert.equal((await als('authenticated', A, 'select count(*)::int n from public.saves'))[0].n, 1);
  assert.match((await als('authenticated', A, `select data->'keys'->>'jungle.v1' v from public.saves`))[0].v, /"2"/);
  await als('authenticated', B, `delete from public.saves where user_id = '${A}'`);
  assert.equal((await als('authenticated', A, 'select count(*)::int n from public.saves'))[0].n, 1);
  for (const sql of [`insert into public.saves (user_id, game_id, format, data) values ('${B}', 'anbiss', 1, '{}')`, `update public.saves set revision = 99`]) {
    assert.match(String((await fehler('authenticated', B, sql)).message), /permission denied/);
  }
});

test('Favoriten: nur eigene, keine Fremdeinträge, nur bekannte Spiele', async () => {
  await als('authenticated', A, `insert into public.favorites (user_id, game_slug) values ('${A}', 'stellwerk')`);
  assert.match(String((await fehler('authenticated', B, `insert into public.favorites (user_id, game_slug) values ('${A}', 'eiszeit')`)).message), /row-level security/);
  assert.ok(await fehler('authenticated', A, `insert into public.favorites (user_id, game_slug) values ('${A}', 'gibtsnicht')`));
  assert.equal((await als('authenticated', B, 'select * from public.favorites')).length, 0);
  await als('authenticated', B, `delete from public.favorites where user_id = '${A}'`);
  assert.equal((await als('authenticated', A, 'select * from public.favorites')).length, 1);
  assert.match(String((await fehler('authenticated', A, `update public.favorites set game_slug='eiszeit'`)).message), /permission denied/);
});

test('Admin: Selbstfreischaltung unmöglich, serverseitige Prüfung, erst nach privilegiertem Eintrag', async () => {
  assert.equal(await rpc('authenticated', A, 'ist_admin'), false);
  for (const sql of ['select public.admin_statistik(7)', 'select public.admin_fehler()', `select public.admin_fehler_status(1,'erledigt')`, `select public.admin_spiel_speichern('anbiss','{}',true,1,true)`, `select public.admin_kategorie_speichern('neu','Neu',1,true)`]) {
    const e = await fehler('authenticated', A, sql); assert.match(String(e && e.message), /Keine Berechtigung/, sql);
  }
  const e1 = await fehler('authenticated', A, `insert into private.admins (user_id) values ('${A}')`); assert.match(String(e1.message), /permission denied/);
  const e2 = await fehler('authenticated', A, `select public.admin_statistik(7)`); assert.ok(e2);
  assert.ok(await fehler(null, null, 'select public.admin_statistik(7)'), 'ohne Anmeldung (Rolle postgres, uid null) ebenfalls verweigert');
  // Metadaten oder Profilfelder geben keine Rechte
  await als('authenticated', A, `select set_config('request.jwt.claims', '{"sub":"${A}","role":"authenticated","app_metadata":{"role":"admin"},"user_metadata":{"admin":true}}', false)`);
  assert.equal(await rpc('authenticated', A, 'ist_admin'), false);
  // Freischaltung: nur über privilegierten SQL-Schritt (postgres/service_role)
  await db.exec(`insert into private.admins (user_id, note) values ('${ADM}', 'Test')`);
  assert.equal(await rpc('authenticated', ADM, 'ist_admin'), true);
  const st = await rpc('authenticated', ADM, 'admin_statistik', 7);
  assert.equal(typeof st.summe.starts, 'number'); assert.equal(st.spiele.length, 21);
  assert.deepEqual(await rpc('authenticated', ADM, 'admin_kategorie_speichern', 'neu-kat', 'Neu', 9, true), { ok: true });
  assert.deepEqual(await rpc('authenticated', ADM, 'admin_spiel_speichern', 'anbiss', ['abenteuer', 'neu-kat'], true, 8, true), { ok: true });
  assert.match(String((await fehler('authenticated', ADM, `select public.admin_spiel_speichern('anbiss','{gibtsnicht}',true,1,true)`)).message), /Unbekannte Kategorie/);
  assert.match(String((await fehler('authenticated', ADM, `select public.admin_statistik(5)`)).message), /Zeitraum/);
  // Admin ändert Katalog, normale Nutzer weiterhin nicht direkt
  assert.equal((await als('anon', null, `select hot from public.games where slug='anbiss'`))[0].hot, true);
  assert.match(String((await fehler('authenticated', ADM, `update public.games set hot=false`)).message), /permission denied/);
});

test('Fehler melden: Validierung, Datenschutz, Ratenbegrenzung, Testmarkierung, Admin-Ansicht', async () => {
  const f = (text, ctx, test = false, game = 'eiszeit') => rpc('anon', null, 'fehler_melden', game, 'build 1', text, JSON.stringify(ctx || {}), test);
  assert.deepEqual(await f('ab'), { ok: false, fehler: 'zu_kurz' });
  assert.deepEqual(await f('x'.repeat(1001)), { ok: false, fehler: 'zu_lang' });
  assert.deepEqual(await f('Fehler', {}, false, 'gibtsnicht'), { ok: false, fehler: 'spiel' });
  assert.deepEqual(await f('Das Spiel friert ein\u0007 <script>alert(1)</script>', { ansicht: '390x844', touch: true, browser: 'Chrome/120 <x>', token: 'GEHEIM', nutzer: 'a@b.de', daten: { spielstand: 1 } }), { ok: true });
  const z = (await db.query(`select * from private.bug_reports where message like 'Das Spiel%'`)).rows[0];
  assert.ok(!z.message.includes('\u0007')); assert.equal(z.message, 'Das Spiel friert ein <script>alert(1)</script>'.replace('einrein', 'ein')); // wird nur als Text gespeichert
  assert.deepEqual(Object.keys(z.context).sort(), ['ansicht', 'browser', 'touch']);
  assert.equal(z.context.browser, 'Chrome/120 x');
  assert.equal(z.is_test, false); assert.equal(z.status, 'offen');
  // Ratenbegrenzung: höchstens 5 je 10 Minuten und Absender
  const erg = []; for (let i = 0; i < 6; i++) erg.push((await f('Meldung Nummer ' + i)).ok);
  assert.deepEqual(erg, [true, true, true, true, false, false]); // 1 + 4 erlaubt, danach gesperrt
  assert.equal((await f('noch eine Meldung')).fehler, 'zu_oft');
  // anderer Absender (andere IP) ist nicht betroffen
  await db.exec(`select set_config('request.headers', '{"cf-connecting-ip":"198.51.100.9"}', false); reset role; set role anon`);
  const r = (await db.query(`select public.fehler_melden('stellwerk','b','Test von anderer IP','{}', true) r`)).rows[0].r; await db.exec('reset role');
  assert.deepEqual(r, { ok: true });
  assert.equal((await db.query(`select is_test from private.bug_reports where message='Test von anderer IP'`)).rows[0].is_test, true);
  // keine IP im Klartext gespeichert
  const rl = (await db.query(`select string_agg(key, ',') k from private.rate_limits`)).rows[0].k; assert.ok(!/203\.0\.113|198\.51\.100/.test(rl));
  // Admin sieht Meldungen, setzt Status
  const liste = await rpc('authenticated', ADM, 'admin_fehler', null);
  assert.ok(liste.length >= 3); assert.equal(liste[0].status, 'offen');
  assert.deepEqual(await rpc('authenticated', ADM, 'admin_fehler_status', liste[0].id, 'in_arbeit'), { ok: true });
  assert.equal((await rpc('authenticated', ADM, 'admin_fehler', 'in_arbeit')).length, 1);
  assert.match(String((await fehler('authenticated', ADM, `select public.admin_fehler_status(1,'kaputt')`)).message), /Status ungültig/);
  const st = await rpc('authenticated', ADM, 'admin_statistik', 30);
  assert.ok(st.fehler >= 5); assert.equal(st.fehler_offen, st.fehler); // Testmeldung zählt nicht mit
});

test('Statistik: Spielstart zählt einmal je Seitenaufruf, aktive Zeit gedeckelt, Tests ausgeschlossen, Berliner Tage', async () => {
  const sid = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', sid2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const s = (id, game, evs, test = false) => rpc('anon', null, 'statistik_melden', id, game, JSON.stringify(evs), test);
  assert.deepEqual(await s(sid, 'eiszeit', [{ k: 'start', r: 'p' }, { k: 'zeit', r: 't0', s: 30 }]), { ok: true });
  assert.deepEqual(await s(sid, 'eiszeit', [{ k: 'start', r: 'p' }, { k: 'zeit', r: 't0', s: 30 }, { k: 'zeit', r: 't1', s: 9999 }, { k: 'level', r: '3' }]), { ok: true }); // Wiederholung zählt nicht doppelt
  assert.deepEqual(await s(sid2, 'eiszeit', [{ k: 'start', r: 'p' }]), { ok: true });
  assert.deepEqual(await s(sid2, 'stellwerk', [{ k: 'start', r: 'p' }, { k: 'boese', r: 'x' }, { k: 'start', r: '' }]), { ok: true });
  assert.deepEqual(await s(sid2, 'eiszeit', [{ k: 'start', r: 'q' }], true), { ok: true, test: true }); // Test: nichts gezählt
  assert.equal((await s(sid2, 'gibtsnicht', [{ k: 'start', r: 'p' }])).ok, false);
  assert.equal((await s(sid2, 'eiszeit', 'kaputt')).ok, false);
  assert.equal((await s(sid2, 'eiszeit', Array.from({ length: 31 }, (_, i) => ({ k: 'level', r: 'l' + i })))).ok, false);
  const z = (await db.query(`select game_slug, sessions, starts, completions, play_seconds::int ps, day::text d from private.stat_daily order by game_slug`)).rows;
  const eis = z.find((x) => x.game_slug === 'eiszeit'), stw = z.find((x) => x.game_slug === 'stellwerk');
  assert.deepEqual([eis.sessions, eis.starts, eis.completions, eis.ps], [2, 2, 1, 150]); // 30 + min(9999,120)
  assert.deepEqual([stw.sessions, stw.starts], [1, 1]);
  const berlin = (await db.query(`select (now() at time zone 'Europe/Berlin')::date::text d`)).rows[0].d; assert.equal(eis.d, berlin);
  const a = await rpc('authenticated', ADM, 'admin_statistik', 1);
  assert.equal(a.summe.starts, 3); assert.equal(a.summe.spielzeit_s, 150); assert.equal(a.tage.length, 1);
  assert.equal((await db.query(`select count(*)::int n from private.stat_seen where sid::text like 'bbbbbbbb%' and ref = 'q'`)).rows[0].n, 0);
  // Aufräumen: Aufbewahrung
  await db.exec(`insert into private.stat_daily (day, game_slug, starts) values (current_date - 500, 'anbiss', 1); insert into private.stat_seen (day, sid, game_slug, kind) values (current_date - 5, gen_random_uuid(), 'anbiss', 'sitzung'); select private.aufraeumen()`);
  assert.equal((await db.query(`select count(*)::int n from private.stat_daily where day < current_date - 400`)).rows[0].n, 0);
  assert.equal((await db.query(`select count(*)::int n from private.stat_seen where day < current_date - 2`)).rows[0].n, 0);
});

test('Kontolöschung: Bestätigung nötig, entfernt alle privaten Daten des Kontos, lässt andere unberührt', async () => {
  assert.deepEqual(await rpc('authenticated', A, 'konto_loeschen', 'ja'), { ok: false, fehler: 'bestaetigung' });
  assert.equal((await db.query(`select count(*)::int n from auth.users where id='${A}'`)).rows[0].n, 1);
  assert.deepEqual(await rpc('authenticated', A, 'konto_loeschen', 'LÖSCHEN'), { ok: true });
  for (const t of ['public.profiles', 'public.saves', 'public.favorites']) assert.equal((await db.query(`select count(*)::int n from ${t} where user_id='${A}'`)).rows[0].n, 0, t);
  assert.equal((await db.query(`select count(*)::int n from auth.users where id='${A}'`)).rows[0].n, 0);
  assert.equal((await db.query(`select count(*)::int n from public.saves where user_id='${B}'`)).rows[0].n, 1);
  assert.equal((await db.query(`select count(*)::int n from public.profiles where user_id='${B}'`)).rows[0].n, 1);
  // Adminrecht verschwindet mit dem Konto
  await rpc('authenticated', ADM, 'konto_loeschen', 'LÖSCHEN');
  assert.equal((await db.query(`select count(*)::int n from private.admins`)).rows[0].n, 0);
  const e = await fehler('authenticated', null, 'select public.konto_loeschen($1)', ['LÖSCHEN']); assert.match(String(e && e.message), /Nicht angemeldet/);
});

test('Ratenbegrenzung für angemeldete Nutzer (Spielstände, Profil)', async () => {
  let gesperrt = 0;
  for (let i = 0; i < 42; i++) { const r = await speichern(B, 'jungle-runner', keys({ 'jungle.v1': '{"n":' + i + '}' }), i === 0 ? 1 : i + 1); if (r.status === 'zu_oft') gesperrt++; }
  assert.ok(gesperrt >= 1, 'mehr als 40 Schreibvorgänge pro Minute werden gebremst');
});
