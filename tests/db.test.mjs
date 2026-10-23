// Datenbanktests für supabase/migrations/*.sql gegen eine lokale Postgres-Kopie (PGlite, WebAssembly, kein Netzwerk).
// Stellt die Supabase-Rollen (anon, authenticated), auth.uid() und die Standardrechte nach und prüft:
// Row Level Security, Rechte auf Tabellen und Funktionen, Spielstand-Revisionen, Namensregeln, Adminschutz,
// Ratenbegrenzung, Statistik-Deduplizierung und Kontolöschung.
// Start:  npm i --no-save @electric-sql/pglite && node --test tests/db.test.mjs
//         (oder PGLITE_PATH=/pfad/zu/node_modules/@electric-sql/pglite node --test tests/db.test.mjs)
import { test as echterTest, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIG = join(ROOT, 'supabase/migrations');
let db, ohnePglite = false;
const test = (name, fn) => echterTest(name, (t) => (ohnePglite ? t.skip('PGlite nicht installiert (npm i --no-save @electric-sql/pglite)') : fn(t)));
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
  let pg; try { pg = await ladePglite(); } catch (e) { ohnePglite = true; return; }
  const { PGlite } = pg;
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

test('Stammdaten: 25 Spiele, 7 Kategorien, Spiele ohne Kollision', async () => {
  assert.equal((await als('anon', null, 'select count(*)::int n from public.games'))[0].n, 25);
  assert.equal((await als('anon', null, 'select count(*)::int n from public.categories'))[0].n, 7);
  assert.equal((await als('anon', null, `select count(*)::int n from public.games where hot`))[0].n, 12);
});

test('HOT automatisch: immer genau 12, Spielzeit der letzten 30 Tage rückt ein Spiel nach vorn, ein anderes fliegt raus', async () => {
  const hot = async () => (await als('anon', null, `select slug, hot_rank from public.games where hot order by hot_rank`));
  const vorher = await hot();
  assert.equal(vorher.length, 12); assert.deepEqual(vorher.map((x) => x.hot_rank), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  assert.equal((await als('anon', null, `select count(*)::int n from public.games where hot and not listed`))[0].n, 0);
  const neuer = (await db.query(`select slug from public.games where listed and not hot order by slug limit 1`)).rows[0].slug;
  await db.exec(`insert into private.stat_daily (day, game_slug, sessions, starts, completions, play_seconds) values (private.berlin_heute(), '${neuer}', 1, 1, 0, 99999) on conflict (day, game_slug) do update set play_seconds = 99999`);
  const nachher = await hot();
  assert.equal(nachher.length, 12); assert.equal(nachher[0].slug, neuer);
  assert.equal(vorher.filter((x) => !nachher.some((y) => y.slug === x.slug)).length, 1);
  // Spielzeit älter als 7 Tage zählt nicht
  await db.exec(`update private.stat_daily set day = private.berlin_heute() - 30 where game_slug = '${neuer}'; select private.hot_berechnen()`);
  assert.equal((await hot()).length, 12);
  await db.exec(`delete from private.stat_daily where game_slug = '${neuer}'`);
  // ausgeblendetes Spiel wird nie Hot
  await db.exec(`update public.games set listed = false where slug = '${nachher[1].slug}'; select private.hot_berechnen()`);
  const ohne = await hot(); assert.equal(ohne.length, 12); assert.ok(!ohne.some((x) => x.slug === nachher[1].slug));
  await db.exec(`update public.games set listed = true where slug = '${nachher[1].slug}'; select private.hot_berechnen()`);
});

test('NEU: jedes Spiel hat ein Hinzufügedatum (added_on), öffentlich lesbar', async () => {
  const r = await als('anon', null, `select count(*)::int n from public.games where added_on = (now() at time zone 'Europe/Berlin')::date`);
  assert.equal(r[0].n, 25);
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
  assert.equal(typeof st.summe.starts, 'number'); assert.equal(st.spiele.length, 25);
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

test('SCHRÄGLAGE-Rangliste: nur die Prüf-Funktion trägt ein, Browser nie; Wertung, Platz, Zeitraum, Löschung', async () => {
  const A = '44444444-4444-4444-8444-444444444444', B = '55555555-5555-4555-8555-555555555555', ADM = '66666666-6666-4666-8666-666666666666';
  await db.exec(`insert into auth.users (id, email) values ('${A}', 'c@example.org'), ('${B}', 'd@example.org'), ('${ADM}', 'e@example.org')`);
  // Profile anlegen (Namen sind Voraussetzung für einen Eintrag)
  await rpc('authenticated', A, 'profil_speichern', 'Anna', 'a1');
  await rpc('authenticated', B, 'profil_speichern', 'Bernd', 'a2');
  const rang = (rolle, uid, level, zr, n) => als(rolle, uid, 'select * from public.schraeglage_rangliste($1, $2, $3)', [level, zr, n]);
  const eintragen = (uid, level, ms) => rpc('service_role', null, 'schraeglage_eintragen', uid, level, ms, 1, '0g');
  // Browser/Anonyme: weder eintragen noch Tabelle lesen
  for (const rolle of ['anon', 'authenticated']) {
    const e = await fehler(rolle, A, `select public.schraeglage_eintragen('${A}', 1, 12000, 1, '0g')`);
    assert.match(String(e && e.message), /permission denied/, 'eintragen als ' + rolle);
    const e2 = await fehler(rolle, A, 'select * from private.schraeglage_laeufe');
    assert.match(String(e2 && e2.message), /permission denied/, 'Tabelle als ' + rolle);
    const e3 = await fehler(rolle, A, `select * from private.schraeglage_wertung(1, 'monat')`);
    assert.match(String(e3 && e3.message), /permission denied/, 'Wertung als ' + rolle);
  }
  // Ungültiges und fehlendes Profil
  assert.equal((await eintragen(A, 99, 12000)).grund, 'ungueltig');
  assert.equal((await eintragen(A, 1, 500)).grund, 'ungueltig');
  assert.equal((await eintragen(ADM, 1, 12000)).grund, 'kein_profil');
  // Einträge: Anna 12,0 s, Bernd 11,5 s, Anna später 11,0 s
  assert.equal((await eintragen(A, 1, 12000)).ok, true);
  const b = await eintragen(B, 1, 11500);
  assert.equal(b.platz_monat, 1); assert.equal(b.spieler_monat, 2);
  const a2 = await eintragen(A, 1, 11000);
  assert.equal(a2.platz_monat, 1);
  // Öffentliche Rangliste: Name, Zeit, Platz; eigener Eintrag markiert; keine Kennungen
  const r = await rang('anon', null, 1, 'monat', 50);
  assert.deepEqual(r.map((x) => [x.platz, x.name, x.ms, x.ich]).map(String), ['1,Anna,11000,false', '2,Bernd,11500,false']);
  assert.deepEqual(Object.keys(r[0]).sort(), ['avatar', 'erreicht', 'ich', 'ms', 'name', 'platz']);
  const meine = await rang('authenticated', B, 1, 'gesamt', 1);
  assert.equal(meine.find((x) => x.ich).name, 'Bernd');       // eigener Platz auch außerhalb der Top-Anzahl
  assert.equal((await rang('anon', null, 2, 'jahr', 50)).length, 0);
  for (const x of [['x', 1], ['monat', 0], ['monat', 99]]) assert.match(String((await fehler('anon', null, `select * from public.schraeglage_rangliste(${x[1]}, '${x[0]}', 5)`)).message), /unbekannt/);
  assert.equal(r[0].avatar, 'a1');
  // Gesamtwertung: Anzahl Level, dann Zeitsumme
  await eintragen(A, 2, 15000);
  const ges = await als('anon', null, 'select * from public.schraeglage_gesamt(50)');
  assert.deepEqual(ges.map((x) => [x.platz, x.name, x.level_anzahl, Number(x.summe_ms)]).map(String), ['1,Anna,2,26000', '2,Bernd,1,11500']);
  // Alte Läufe: Wertung des Vormonats zählt nicht für "monat", aber für "gesamt"
  await db.exec(`insert into private.schraeglage_laeufe (user_id, level, ms, sim_version, inputs, created_at) values ('${B}', 1, 9000, 1, '0g', now() - interval '70 days')`);
  assert.equal((await rang('anon', null, 1, 'monat', 50)).find((x) => x.name === 'Bernd').ms, 11500);
  assert.equal((await rang('anon', null, 1, 'gesamt', 50))[0].name, 'Bernd');
  // Aufräumen behält je Spieler/Level/Monat nur die beste Zeit
  await db.exec('select private.aufraeumen()');
  assert.equal((await db.query(`select count(*)::int n from private.schraeglage_laeufe where user_id = '${A}' and level = 1`)).rows[0].n, 1);
  // Ratenbegrenzung der Prüf-Funktion
  let zuOft = null; for (let i = 0; i < 8 && !zuOft; i++) { const x = await eintragen(B, 2, 20000 + i); if (!x.ok) zuOft = x.grund; }
  assert.equal(zuOft, 'zu_oft');
  // Kontolöschung entfernt die Zeiten
  await rpc('authenticated', A, 'konto_loeschen', 'LÖSCHEN');
  assert.equal((await db.query(`select count(*)::int n from private.schraeglage_laeufe where user_id = '${A}'`)).rows[0].n, 0);
});

test('SEITENWECHSEL-Rangliste: nur die Prüf-Funktion trägt ein; Tage, Wertung, Rate, Aufräumen, Löschung', async () => {
  const A = '77777777-7777-4777-8777-777777777777', B = '88888888-8888-4888-8888-888888888888', K = '99999999-9999-4999-8999-999999999999';
  await db.exec(`insert into auth.users (id, email) values ('${A}', 'f@example.org'), ('${B}', 'g@example.org'), ('${K}', 'h@example.org')`);
  await rpc('authenticated', A, 'profil_speichern', 'Anja', 'a3');
  await rpc('authenticated', B, 'profil_speichern', 'Bodo', 'a4');
  const heute = Number((await db.query(`select to_char(private.berlin_heute(), 'YYYYMMDD') d`)).rows[0].d);
  const gestern = Number((await db.query(`select to_char(private.berlin_heute() - 1, 'YYYYMMDD') d`)).rows[0].d);
  const eintragen = (uid, seed, punkte) => rpc('service_role', null, 'seitenwechsel_eintragen', uid, seed, punkte, punkte * 6, 1, '1c');
  const rang = (rolle, uid, zr) => als(rolle, uid, 'select * from public.seitenwechsel_rangliste($1, 50)', [zr]);
  for (const rolle of ['anon', 'authenticated']) {
    const e = await fehler(rolle, A, `select public.seitenwechsel_eintragen('${A}', ${heute}, 10, 60, 1, '1c')`);
    assert.match(String(e && e.message), /permission denied/, 'eintragen als ' + rolle);
    assert.match(String((await fehler(rolle, A, 'select * from private.seitenwechsel_laeufe')).message), /permission denied/);
    assert.match(String((await fehler(rolle, A, `select * from private.seitenwechsel_wertung('heute')`)).message), /permission denied/);
  }
  assert.equal((await eintragen(A, heute, 0)).grund, 'ungueltig');
  assert.equal((await eintragen(A, 20200101, 10)).grund, 'tag');
  assert.equal((await eintragen(A, heute + 1000, 10)).grund, 'tag');
  assert.equal((await eintragen(A, 20261399, 10)).grund, 'tag');
  assert.equal((await eintragen(K, heute, 10)).grund, 'kein_profil');
  assert.equal((await eintragen(A, heute, 40)).ok, true);
  const b = await eintragen(B, heute, 55); assert.equal(b.platz_heute, 1); assert.equal(b.spieler_heute, 2);
  assert.equal((await eintragen(A, gestern, 90)).ok, true);   // Läufe über Mitternacht zählen für ihren Kurstag
  const h = await rang('anon', null, 'heute');
  assert.deepEqual(h.map((x) => [x.platz, x.name, x.avatar, x.punkte, x.ich]).map(String), ['1,Bodo,a4,55,false', '2,Anja,a3,40,false']);
  assert.deepEqual(Object.keys(h[0]).sort(), ['avatar', 'ich', 'name', 'platz', 'punkte']);
  assert.equal((await rang('authenticated', A, 'heute')).find((x) => x.ich).name, 'Anja');
  assert.equal((await rang('anon', null, 'gesamt'))[0].name, 'Anja');   // 90 gestern
  assert.match(String((await fehler('anon', null, `select * from public.seitenwechsel_rangliste('x', 5)`)).message), /unbekannt/);
  await db.exec('select private.aufraeumen()');
  assert.equal((await db.query(`select count(*)::int n from private.seitenwechsel_laeufe where user_id = '${A}'`)).rows[0].n, 2);
  let zuOft = null; for (let i = 0; i < 12 && !zuOft; i++) { const x = await eintragen(B, heute, 10 + i); if (!x.ok) zuOft = x.grund; }
  assert.equal(zuOft, 'zu_oft');
  await rpc('authenticated', A, 'konto_loeschen', 'LÖSCHEN');
  assert.equal((await db.query(`select count(*)::int n from private.seitenwechsel_laeufe where user_id = '${A}'`)).rows[0].n, 0);
});

test('PUNKTLANDUNG-Rangliste: nur die Prüf-Funktion trägt ein; Tage, Wertung, Rate, Aufräumen, Löschung', async () => {
  const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', K = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  await db.exec(`insert into auth.users (id, email) values ('${A}', 'i@example.org'), ('${B}', 'j@example.org'), ('${K}', 'k@example.org')`);
  await rpc('authenticated', A, 'profil_speichern', 'Anke', 'a3');
  await rpc('authenticated', B, 'profil_speichern', 'Bernhard', 'a4');
  const heute = Number((await db.query(`select to_char(private.berlin_heute(), 'YYYYMMDD') d`)).rows[0].d);
  const gestern = Number((await db.query(`select to_char(private.berlin_heute() - 1, 'YYYYMMDD') d`)).rows[0].d);
  const eintragen = (uid, seed, punkte) => rpc('service_role', null, 'punktlandung_eintragen', uid, seed, punkte, punkte * 6, 1, '1c');
  const rang = (rolle, uid, zr) => als(rolle, uid, 'select * from public.punktlandung_rangliste($1, 50)', [zr]);
  for (const rolle of ['anon', 'authenticated']) {
    const e = await fehler(rolle, A, `select public.punktlandung_eintragen('${A}', ${heute}, 10, 60, 1, '1c')`);
    assert.match(String(e && e.message), /permission denied/, 'eintragen als ' + rolle);
    assert.match(String((await fehler(rolle, A, 'select * from private.punktlandung_laeufe')).message), /permission denied/);
    assert.match(String((await fehler(rolle, A, `select * from private.punktlandung_wertung('heute')`)).message), /permission denied/);
  }
  assert.equal((await eintragen(A, heute, 0)).grund, 'ungueltig');
  assert.equal((await eintragen(A, 20200101, 10)).grund, 'tag');
  assert.equal((await eintragen(A, heute + 1000, 10)).grund, 'tag');
  assert.equal((await eintragen(A, 20261399, 10)).grund, 'tag');
  assert.equal((await eintragen(K, heute, 10)).grund, 'kein_profil');
  assert.equal((await eintragen(A, heute, 40)).ok, true);
  const b = await eintragen(B, heute, 55); assert.equal(b.platz_heute, 1); assert.equal(b.spieler_heute, 2);
  assert.equal((await eintragen(A, gestern, 90)).ok, true);   // Läufe über Mitternacht zählen für ihren Kurstag
  const h = await rang('anon', null, 'heute');
  assert.deepEqual(h.map((x) => [x.platz, x.name, x.avatar, x.punkte, x.ich]).map(String), ['1,Bernhard,a4,55,false', '2,Anke,a3,40,false']);
  assert.deepEqual(Object.keys(h[0]).sort(), ['avatar', 'ich', 'name', 'platz', 'punkte']);
  assert.equal((await rang('authenticated', A, 'heute')).find((x) => x.ich).name, 'Anke');
  assert.equal((await rang('anon', null, 'gesamt'))[0].name, 'Anke');   // 90 gestern
  assert.match(String((await fehler('anon', null, `select * from public.punktlandung_rangliste('x', 5)`)).message), /unbekannt/);
  await db.exec('select private.aufraeumen()');
  assert.equal((await db.query(`select count(*)::int n from private.punktlandung_laeufe where user_id = '${A}'`)).rows[0].n, 2);
  let zuOft = null; for (let i = 0; i < 12 && !zuOft; i++) { const x = await eintragen(B, heute, 10 + i); if (!x.ok) zuOft = x.grund; }
  assert.equal(zuOft, 'zu_oft');
  await rpc('authenticated', A, 'konto_loeschen', 'LÖSCHEN');
  assert.equal((await db.query(`select count(*)::int n from private.punktlandung_laeufe where user_id = '${A}'`)).rows[0].n, 0);
});

test('PAPIERPILOT-Rangliste: nur die Prüf-Funktion trägt ein; Distanz vor Zeit, Tage, Rate, Aufräumen, Löschung', async () => {
  const A = 'a1a1a1a1-aaaa-4aaa-8aaa-aaaaaaaaaaaa', B = 'b1b1b1b1-bbbb-4bbb-8bbb-bbbbbbbbbbbb', C = 'c1c1c1c1-cccc-4ccc-8ccc-cccccccccccc', K = 'd1d1d1d1-dddd-4ddd-8ddd-dddddddddddd';
  await db.exec(`insert into auth.users (id, email) values ('${A}', 'pa@example.org'), ('${B}', 'pb@example.org'), ('${C}', 'pc@example.org'), ('${K}', 'pk@example.org')`);
  await rpc('authenticated', A, 'profil_speichern', 'Pia', 'a3');
  await rpc('authenticated', B, 'profil_speichern', 'Paul', 'a4');
  await rpc('authenticated', C, 'profil_speichern', 'Petra', 'a5');
  const heute = Number((await db.query(`select to_char(private.berlin_heute(), 'YYYYMMDD') d`)).rows[0].d);
  const gestern = Number((await db.query(`select to_char(private.berlin_heute() - 1, 'YYYYMMDD') d`)).rows[0].d);
  const eintragen = (uid, seed, cm, ticks) => rpc('service_role', null, 'papierpilot_eintragen', uid, seed, cm, ticks, 1, '4,0:9');
  const rang = (rolle, uid, zr) => als(rolle, uid, 'select * from public.papierpilot_rangliste($1, 50)', [zr]);
  for (const rolle of ['anon', 'authenticated']) {
    const e = await fehler(rolle, A, `select public.papierpilot_eintragen('${A}', ${heute}, 30000, 2000, 1, '4')`);
    assert.match(String(e && e.message), /permission denied/, 'eintragen als ' + rolle);
    assert.match(String((await fehler(rolle, A, 'select * from private.papierpilot_fluege')).message), /permission denied/);
    assert.match(String((await fehler(rolle, A, `select * from private.papierpilot_wertung('heute')`)).message), /permission denied/);
  }
  assert.equal((await eintragen(A, heute, 50, 100)).grund, 'ungueltig');
  assert.equal((await eintragen(A, heute, 30000, 0)).grund, 'ungueltig');
  assert.equal((await eintragen(A, 20200101, 30000, 2000)).grund, 'tag');
  assert.equal((await eintragen(A, heute + 1000, 30000, 2000)).grund, 'tag');
  assert.equal((await eintragen(K, heute, 30000, 2000)).grund, 'kein_profil');
  assert.equal((await eintragen(A, heute, 30000, 2400)).ok, true);
  assert.equal((await eintragen(B, heute, 30000, 2100)).ok, true);   // gleiche Distanz, schneller → vorn
  const c = await eintragen(C, heute, 24700, 1900); assert.equal(c.platz_heute, 3); assert.equal(c.spieler_heute, 3);
  assert.equal((await eintragen(A, heute, 29000, 1000)).ok, true);   // schlechter, zählt nicht
  assert.equal((await eintragen(C, gestern, 90000, 5000)).ok, true);  // Flug über Mitternacht zählt für seinen Tag
  const h = await rang('anon', null, 'heute');
  assert.deepEqual(h.map((x) => [x.platz, x.name, x.cm, x.ticks, x.ich]).map(String), ['1,Paul,30000,2100,false', '2,Pia,30000,2400,false', '3,Petra,24700,1900,false']);
  assert.deepEqual(Object.keys(h[0]).sort(), ['avatar', 'cm', 'ich', 'name', 'platz', 'ticks']);
  assert.equal((await rang('authenticated', A, 'heute')).find((x) => x.ich).name, 'Pia');
  assert.equal((await rang('anon', null, 'gesamt'))[0].name, 'Petra');
  assert.match(String((await fehler('anon', null, `select * from public.papierpilot_rangliste('x', 5)`)).message), /unbekannt/);
  await db.exec('select private.aufraeumen()');
  assert.equal((await db.query(`select count(*)::int n from private.papierpilot_fluege where user_id = '${A}'`)).rows[0].n, 1);
  assert.equal((await db.query(`select cm from private.papierpilot_fluege where user_id = '${A}'`)).rows[0].cm, 30000);
  let zuOft = null; for (let i = 0; i < 12 && !zuOft; i++) { const x = await eintragen(B, heute, 1000 + i, 500); if (!x.ok) zuOft = x.grund; }
  assert.equal(zuOft, 'zu_oft');
  await rpc('authenticated', A, 'konto_loeschen', 'LÖSCHEN');
  assert.equal((await db.query(`select count(*)::int n from private.papierpilot_fluege where user_id = '${A}'`)).rows[0].n, 0);
});

test('DARTFIEBER: Challenge pro Tag fest, Run-ID einmalig, nur Prüf-Funktion schließt ab; Rangliste, Gleichstand, Archiv, Löschung', async () => {
  const { VERSION } = await import(pathToFileURL(join(ROOT, 'public/spiele/dartfieber/sim.js')).href);
  assert.equal((await db.query('select private.dartfieber_version() v')).rows[0].v, VERSION, 'Version in SQL und sim.js gleich');
  const U = ['a2a2a2a2-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'b2b2b2b2-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'c2c2c2c2-cccc-4ccc-8ccc-cccccccccccc', 'd2d2d2d2-dddd-4ddd-8ddd-dddddddddddd'];
  await db.exec(`insert into auth.users (id, email) values ${U.map((u, i) => `('${u}', 'df${i}@example.org')`).join(',')}`);
  const [P, Q, R, K] = U;
  await rpc('authenticated', P, 'profil_speichern', 'Dora', 'a3');
  await rpc('authenticated', Q, 'profil_speichern', 'Dirk', 'a4');
  await rpc('authenticated', R, 'profil_speichern', 'Dana', 'a5');
  const heute = (await db.query(`select to_char(private.berlin_heute(), 'YYYYMMDD') d`)).rows[0].d;
  // Challenge: auch für Gäste, pro Tag unveränderlich
  const t1 = await rpc('anon', null, 'dartfieber_tag'), t2 = await rpc('authenticated', P, 'dartfieber_tag');
  assert.equal(t1.tag, heute); assert.deepEqual(t1, t2); assert.ok(Number.isInteger(t1.seed) && t1.seed >= 1);
  assert.equal(t1.version, VERSION);
  // Start: nur angemeldet mit Profil; jede Runde bekommt eine eigene Run-ID, gleiche Bedingungen
  assert.ok(await fehler('anon', null, 'select public.dartfieber_start()'));
  assert.equal((await rpc('authenticated', K, 'dartfieber_start')).grund, 'kein_profil');
  const s1 = await rpc('authenticated', P, 'dartfieber_start'), s2 = await rpc('authenticated', P, 'dartfieber_start');
  assert.equal(s1.ok, true); assert.notEqual(s1.run_id, s2.run_id); assert.equal(s1.seed, t1.seed); assert.equal(s2.seed, t1.seed);
  // Prüf-Funktionen nur für service_role, Tabellen privat
  for (const rolle of ['anon', 'authenticated']) {
    assert.match(String((await fehler(rolle, P, `select public.dartfieber_abschliessen('${P}', '${s1.run_id}', 100, 10, 3000, '4.5')`)).message), /permission denied/);
    assert.match(String((await fehler(rolle, P, `select public.dartfieber_run_lesen('${P}', '${s1.run_id}')`)).message), /permission denied/);
    assert.match(String((await fehler(rolle, P, 'select * from private.dartfieber_runden')).message), /permission denied/);
    assert.match(String((await fehler(rolle, P, `select * from private.dartfieber_wertung(private.berlin_heute())`)).message), /permission denied/);
  }
  const lesen = (u, r) => rpc('service_role', null, 'dartfieber_run_lesen', u, r);
  const fertig = (u, r, p, w = 10, t = 100) => rpc('service_role', null, 'dartfieber_abschliessen', u, r, p, w, t, '4.5');
  // fremde oder unbekannte Run-ID
  assert.equal((await lesen(Q, s1.run_id)).grund, 'unbekannt');
  assert.equal((await lesen(P, '99999999-9999-4999-8999-999999999999')).grund, 'unbekannt');
  const l = await lesen(P, s1.run_id); assert.equal(l.ok, true); assert.equal(l.seed, t1.seed);
  // ungültige Werte
  assert.equal((await fertig(P, s1.run_id, -1)).grund, 'ungueltig');
  assert.equal((await fertig(P, s1.run_id, 3001)).grund, 'ungueltig');
  assert.equal((await fertig(P, s1.run_id, 100, 31)).grund, 'ungueltig');
  // Zeitprüfung: Runde mit 3000 Takten (50 s) ist direkt nach dem Start zu schnell
  assert.equal((await fertig(P, s1.run_id, 100, 10, 3000)).grund, 'zu_schnell');
  // zu alt
  await db.exec(`update private.dartfieber_runden set issued_at = now() - interval '31 minutes' where id = '${s2.run_id}'`);
  assert.equal((await fertig(P, s2.run_id, 100)).grund, 'abgelaufen');
  // Versuchsgrenze (ein Versuch durch lesen oben; vier weitere, dann gesperrt)
  for (let i = 0; i < 4; i++) assert.equal((await lesen(P, s1.run_id)).ok, true);
  assert.equal((await lesen(P, s1.run_id)).grund, 'zu_viele_versuche');
  // gültige Abschlüsse; Run-ID einmalig
  const a = await fertig(P, s1.run_id, 300); assert.equal(a.ok, true); assert.equal(a.tag, heute); assert.equal(a.rang.platz, 1);
  assert.equal((await fertig(P, s1.run_id, 900)).grund, 'schon_abgeschlossen');
  assert.equal((await lesen(P, s1.run_id)).grund, 'schon_abgeschlossen');
  const q1 = await rpc('authenticated', Q, 'dartfieber_start'); assert.equal((await fertig(Q, q1.run_id, 300)).rang.platz, 1);   // Gleichstand = gleicher Platz
  const r1 = await rpc('authenticated', R, 'dartfieber_start'); const rr = await fertig(R, r1.run_id, 120);
  assert.equal(rr.rang.platz, 3); assert.equal(rr.rang.luecke, 180); assert.equal(rr.rang.naechster_platz, 1); assert.equal(rr.rang.spieler, 3);
  // weitere, schlechtere Runde von P zählt nicht; bessere ersetzt
  const p3 = await rpc('authenticated', P, 'dartfieber_start'); await fertig(P, p3.run_id, 50);
  assert.equal((await rpc('authenticated', P, 'dartfieber_rangliste', null, 10)).ich.punkte, 300);
  const p4 = await rpc('authenticated', P, 'dartfieber_start'); await fertig(P, p4.run_id, 310);
  const rl = await rpc('authenticated', R, 'dartfieber_rangliste', null, 10);
  assert.deepEqual(rl.zeilen.map((z) => [z.platz, z.name, z.punkte, z.ich]).map(String), ['1,Dora,310,false', '2,Dirk,300,false', '3,Dana,120,true']);
  assert.equal(rl.spieler, 3); assert.equal(rl.ich.luecke, 180); assert.equal(rl.tag, heute);
  assert.deepEqual(Object.keys(rl.zeilen[0]).sort(), ['avatar', 'ich', 'name', 'platz', 'pos', 'punkte']);
  assert.equal((await rpc('anon', null, 'dartfieber_rangliste', null, 10)).ich, null);
  assert.equal((await rpc('anon', null, 'dartfieber_rangliste', heute, 1)).zeilen.length, 1, 'Anzahl begrenzt');
  assert.match(String((await fehler('anon', null, `select public.dartfieber_rangliste('x', 5)`)).message), /tag_unbekannt/);
  assert.match(String((await fehler('anon', null, `select public.dartfieber_rangliste('20261345', 5)`)).message), /tag_unbekannt/);
  // Archiv: gestern angelegter Tag bleibt abrufbar und unverändert
  await db.exec(`insert into private.dartfieber_tage (tag, seed, version) values (private.berlin_heute() - 1, 777, 1)`);
  await db.exec(`insert into private.dartfieber_runden (user_id, tag, finished_at, punkte, wuerfe, ticks, inputs) values ('${Q}', private.berlin_heute() - 1, now(), 500, 12, 4000, '1')`);
  const gestern = (await db.query(`select to_char(private.berlin_heute() - 1, 'YYYYMMDD') d`)).rows[0].d;
  const ar = await rpc('anon', null, 'dartfieber_rangliste', gestern, 10); assert.equal(ar.zeilen[0].name, 'Dirk'); assert.equal(ar.zeilen.length, 1);
  assert.deepEqual(await rpc('anon', null, 'dartfieber_tage_liste', 10), [heute, gestern]);
  assert.equal((await rpc('anon', null, 'dartfieber_tag')).seed, t1.seed, 'heutiger Seed bleibt');
  // Nachbarn: eigene Platzierung samt zwei Nachbarn auch außerhalb der Top-N
  const ws = [];
  for (let i = 0; i < 6; i++) { const u = `e${i}e${i}e${i}e${i}-eeee-4eee-8eee-eeeeeeeeeeee`; ws.push(u); await db.exec(`insert into auth.users (id, email) values ('${u}', 'dfe${i}@example.org')`); await rpc('authenticated', u, 'profil_speichern', 'Eli' + i, 'a1'); const x = await rpc('authenticated', u, 'dartfieber_start'); await fertig(u, x.run_id, 1000 - i * 100); }
  const nb = await rpc('authenticated', R, 'dartfieber_rangliste', null, 3);
  assert.deepEqual(nb.zeilen.map((z) => z.pos), [1, 2, 3, 7, 8, 9].filter((p) => p <= 9)); assert.equal(nb.ich.platz, 9);
  // Rate-Limit beim Start
  let zuOft = null; for (let i = 0; i < 10 && !zuOft; i++) { const x = await rpc('authenticated', K === R ? R : R, 'dartfieber_start'); if (!x.ok) zuOft = x.grund; }
  assert.equal(zuOft, 'zu_oft');
  // Aufräumen: nie beendete alte Runden weg, je Spieler/Tag bleibt die beste
  await db.exec(`update private.dartfieber_runden set issued_at = now() - interval '3 days' where finished_at is null`);
  await db.exec('select private.aufraeumen()');
  assert.equal((await db.query(`select count(*)::int n from private.dartfieber_runden where finished_at is null`)).rows[0].n, 0);
  assert.deepEqual((await db.query(`select punkte from private.dartfieber_runden where user_id = '${P}' and finished_at is not null`)).rows.map((x) => x.punkte), [310]);
  // Löschung des Kontos entfernt die Runden
  await rpc('authenticated', P, 'konto_loeschen', 'LÖSCHEN');
  assert.equal((await db.query(`select count(*)::int n from private.dartfieber_runden where user_id = '${P}'`)).rows[0].n, 0);
});

test('LEITUNGSCHAOS: Rätsel pro Tag fest, ein Versuch je Konto und Tag, Zeit von der Datenbank; Rangliste, Gleichstand, Archiv, Löschung', async () => {
  const { VERSION } = await import(pathToFileURL(join(ROOT, 'public/spiele/leitungschaos/sim.js')).href);
  assert.equal((await db.query('select private.leitungschaos_version() v')).rows[0].v, VERSION, 'Version in SQL und sim.js gleich');
  const U = ['a3a3a3a3-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'b3b3b3b3-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'c3c3c3c3-cccc-4ccc-8ccc-cccccccccccc', 'd3d3d3d3-dddd-4ddd-8ddd-dddddddddddd'];
  await db.exec(`insert into auth.users (id, email) values ${U.map((u, i) => `('${u}', 'lc${i}@example.org')`).join(',')}`);
  const [P, Q, R, K] = U;
  await rpc('authenticated', P, 'profil_speichern', 'Lena', 'a3');
  await rpc('authenticated', Q, 'profil_speichern', 'Lars', 'a4');
  await rpc('authenticated', R, 'profil_speichern', 'Lotte', 'a5');
  const heute = (await db.query(`select to_char(private.berlin_heute(), 'YYYYMMDD') d`)).rows[0].d;
  const t1 = await rpc('anon', null, 'leitungschaos_tag'), t2 = await rpc('authenticated', P, 'leitungschaos_tag');
  assert.equal(t1.tag, heute); assert.deepEqual(t1, t2); assert.ok(Number.isInteger(t1.seed) && t1.seed >= 1); assert.equal(t1.version, VERSION);
  // Start: nur angemeldet mit Profil; ein zweiter Start setzt dieselbe Runde fort (gleiche Run-ID, Uhr läuft weiter)
  assert.ok(await fehler('anon', null, 'select public.leitungschaos_start()'));
  assert.equal((await rpc('authenticated', K, 'leitungschaos_start')).grund, 'kein_profil');
  const s1 = await rpc('authenticated', P, 'leitungschaos_start');
  assert.equal(s1.ok, true); assert.equal(s1.seed, t1.seed); assert.equal(s1.tag, heute);
  await db.exec(`update private.leitungschaos_runden set issued_at = now() - interval '40 seconds' where id = '${s1.run_id}'`);
  const s2 = await rpc('authenticated', P, 'leitungschaos_start');
  assert.equal(s2.run_id, s1.run_id); assert.ok(Number(s2.sek) >= 39 && Number(s2.sek) < 60, 'Uhr läuft weiter');
  for (const rolle of ['anon', 'authenticated']) {
    assert.match(String((await fehler(rolle, P, `select public.leitungschaos_abschliessen('${P}', '${s1.run_id}', 3, '123')`)).message), /permission denied/);
    assert.match(String((await fehler(rolle, P, `select public.leitungschaos_run_lesen('${P}', '${s1.run_id}')`)).message), /permission denied/);
    assert.match(String((await fehler(rolle, P, 'select * from private.leitungschaos_runden')).message), /permission denied/);
  }
  const lesen = (u, r) => rpc('service_role', null, 'leitungschaos_run_lesen', u, r);
  const fertig = (u, r, d = 3, inp) => rpc('service_role', null, 'leitungschaos_abschliessen', u, r, d, inp === undefined ? '1'.repeat(d) : inp);
  assert.equal((await lesen(Q, s1.run_id)).grund, 'unbekannt');
  const l = await lesen(P, s1.run_id); assert.equal(l.ok, true); assert.equal(l.seed, t1.seed);
  assert.equal((await fertig(P, s1.run_id, 0, '')).grund, 'ungueltig');
  assert.equal((await fertig(P, s1.run_id, 3, '12')).grund, 'ungueltig', 'Eingaben passen nicht zur Drehzahl');
  assert.equal((await fertig(P, s1.run_id, 600)).grund, 'zu_schnell', '600 Drehungen in 40 s');
  const a = await fertig(P, s1.run_id, 50); assert.equal(a.ok, true); assert.equal(a.tag, heute);
  assert.ok(a.zeit_cs >= 4000 && a.zeit_cs < 6000, 'Zeit von der Datenbankuhr'); assert.equal(a.rang.platz, 1);
  assert.equal((await fertig(P, s1.run_id, 40)).grund, 'schon_abgeschlossen');
  // Nach dem Lösen gibt es keinen zweiten Versuch, nur das Ergebnis
  const s3 = await rpc('authenticated', P, 'leitungschaos_start');
  assert.equal(s3.ok, false); assert.equal(s3.grund, 'schon_geloest'); assert.equal(s3.zeit_cs, a.zeit_cs); assert.equal(s3.drehungen, 50); assert.equal(s3.rang.platz, 1);
  assert.equal(s3.seed, undefined);
  // Zu schnell direkt nach dem Start (unter 2 s)
  const q1 = await rpc('authenticated', Q, 'leitungschaos_start');
  assert.equal((await fertig(Q, q1.run_id, 1)).grund, 'zu_schnell');
  // Gleiche Zeit: weniger Drehungen vorn; gleiche Zeit und Drehungen = gleicher Platz
  const zeitVon = async (u, run, sek, d) => { await db.exec(`update private.leitungschaos_runden set issued_at = now() - interval '${sek} seconds' where id = '${run}'`); return fertig(u, run, d); };
  await db.exec(`update private.leitungschaos_runden set issued_at = now() - interval '45 seconds', finished_at = now(), zeit_cs = 4500, drehungen = 50 where id = '${s1.run_id}'`);
  const qa = await zeitVon(Q, q1.run_id, 45, 48); assert.equal(qa.ok, true);
  await db.exec(`update private.leitungschaos_runden set zeit_cs = 4500 where id = '${q1.run_id}'`);
  const r1 = await rpc('authenticated', R, 'leitungschaos_start'); const ra = await zeitVon(R, r1.run_id, 90, 60);
  assert.equal(ra.rang.platz, 3); assert.equal(ra.rang.naechster_platz, 2); assert.ok(ra.rang.luecke > 4000); assert.equal(ra.rang.spieler, 3);
  const rl = await rpc('authenticated', R, 'leitungschaos_rangliste', null, 10);
  assert.deepEqual(rl.zeilen.map((z) => [z.platz, z.name, z.drehungen, z.ich]).map(String), ['1,Lars,48,false', '2,Lena,50,false', '3,Lotte,60,true']);
  assert.deepEqual(Object.keys(rl.zeilen[0]).sort(), ['avatar', 'drehungen', 'ich', 'name', 'platz', 'pos', 'zeit_cs']);
  assert.equal((await rpc('anon', null, 'leitungschaos_rangliste', null, 10)).ich, null);
  assert.match(String((await fehler('anon', null, `select public.leitungschaos_rangliste('20261399', 5)`)).message), /tag_unbekannt/);
  // Archiv
  await db.exec(`insert into private.leitungschaos_tage (tag, seed, version) values (private.berlin_heute() - 1, 4242, 1)`);
  await db.exec(`insert into private.leitungschaos_runden (user_id, tag, finished_at, zeit_cs, drehungen, inputs) values ('${Q}', private.berlin_heute() - 1, now(), 9000, 2, '12')`);
  const gestern = (await db.query(`select to_char(private.berlin_heute() - 1, 'YYYYMMDD') d`)).rows[0].d;
  assert.equal((await rpc('anon', null, 'leitungschaos_rangliste', gestern, 10)).zeilen[0].name, 'Lars');
  assert.deepEqual(await rpc('anon', null, 'leitungschaos_tage_liste', 10), [heute, gestern]);
  // Zu lange offen
  await db.exec(`insert into auth.users (id, email) values ('f3f3f3f3-ffff-4fff-8fff-ffffffffffff', 'lcf@example.org')`);
  const F = 'f3f3f3f3-ffff-4fff-8fff-ffffffffffff'; await rpc('authenticated', F, 'profil_speichern', 'Lio', 'a1');
  const f1 = await rpc('authenticated', F, 'leitungschaos_start');
  await db.exec(`update private.leitungschaos_runden set issued_at = now() - interval '13 hours' where id = '${f1.run_id}'`);
  assert.equal((await fertig(F, f1.run_id, 5)).grund, 'abgelaufen');
  // Aufräumen: nie beendete alte Runden weg, gewertete bleiben
  await db.exec(`update private.leitungschaos_runden set issued_at = now() - interval '3 days' where finished_at is null`);
  await db.exec('select private.aufraeumen()');
  assert.equal((await db.query(`select count(*)::int n from private.leitungschaos_runden where finished_at is null`)).rows[0].n, 0);
  assert.equal((await db.query(`select count(*)::int n from private.leitungschaos_runden where finished_at is not null`)).rows[0].n, 4);
  // Kontolöschung entfernt die Runden
  await rpc('authenticated', P, 'konto_loeschen', 'LÖSCHEN');
  assert.equal((await db.query(`select count(*)::int n from private.leitungschaos_runden where user_id = '${P}'`)).rows[0].n, 0);
});

test('AUSFAHRT FREI: Rätsel pro Tag fest, ein Versuch je Konto und Tag, Züge vor Zeit; Rangliste, Archiv, Löschung', async () => {
  const { VERSION } = await import(pathToFileURL(join(ROOT, 'public/spiele/ausfahrt-frei/sim.js')).href);
  assert.equal((await db.query('select private.ausfahrt_version() v')).rows[0].v, VERSION, 'Version in SQL und sim.js gleich');
  const U = ['a4a4a4a4-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'b4b4b4b4-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'c4c4c4c4-cccc-4ccc-8ccc-cccccccccccc', 'd4d4d4d4-dddd-4ddd-8ddd-dddddddddddd'];
  await db.exec(`insert into auth.users (id, email) values ${U.map((u, i) => `('${u}', 'af${i}@example.org')`).join(',')}`);
  const [P, Q, R, K] = U;
  await rpc('authenticated', P, 'profil_speichern', 'Ali', 'a3');
  await rpc('authenticated', Q, 'profil_speichern', 'Ben', 'a4');
  await rpc('authenticated', R, 'profil_speichern', 'Cem', 'a5');
  const heute = (await db.query(`select to_char(private.berlin_heute(), 'YYYYMMDD') d`)).rows[0].d;
  const t1 = await rpc('anon', null, 'ausfahrt_tag'); assert.equal(t1.tag, heute); assert.equal(t1.version, VERSION);
  assert.ok(await fehler('anon', null, 'select public.ausfahrt_start()'));
  assert.equal((await rpc('authenticated', K, 'ausfahrt_start')).grund, 'kein_profil');
  const s1 = await rpc('authenticated', P, 'ausfahrt_start'); assert.equal(s1.ok, true); assert.equal(s1.seed, t1.seed);
  assert.equal((await rpc('authenticated', P, 'ausfahrt_start')).run_id, s1.run_id, 'Fortsetzen statt neu');
  for (const rolle of ['anon', 'authenticated']) {
    assert.match(String((await fehler(rolle, P, `select public.ausfahrt_abschliessen('${P}', '${s1.run_id}', 1, 'A4')`)).message), /permission denied/);
    assert.match(String((await fehler(rolle, P, 'select * from private.ausfahrt_runden')).message), /permission denied/);
  }
  const fertig = (u, r, z, inp) => rpc('service_role', null, 'ausfahrt_abschliessen', u, r, z, inp === undefined ? 'A4'.repeat(z) : inp);
  const alt = (run, sek) => db.exec(`update private.ausfahrt_runden set issued_at = now() - interval '${sek} seconds' where id = '${run}'`);
  assert.equal((await fertig(P, s1.run_id, 2, 'A4')).grund, 'ungueltig', 'Eingaben passen nicht zur Zugzahl');
  assert.equal((await fertig(P, s1.run_id, 20)).grund, 'zu_schnell', 'gleich nach dem Start');
  await alt(s1.run_id, 60);
  const a = await fertig(P, s1.run_id, 20); assert.equal(a.ok, true); assert.ok(a.zeit_cs >= 6000 && a.zeit_cs < 7000);
  const s2 = await rpc('authenticated', P, 'ausfahrt_start'); assert.equal(s2.grund, 'schon_geloest'); assert.equal(s2.zuege, 20);
  // Weniger Züge schlagen schnellere Zeit; gleiche Züge: schnellere Zeit vorn
  const q1 = await rpc('authenticated', Q, 'ausfahrt_start'); await alt(q1.run_id, 300); assert.equal((await fertig(Q, q1.run_id, 18)).rang.platz, 1);
  const r1 = await rpc('authenticated', R, 'ausfahrt_start'); await alt(r1.run_id, 30); const rr = await fertig(R, r1.run_id, 20);
  assert.equal(rr.rang.platz, 2); assert.equal(rr.rang.naechster_platz, 1); assert.equal(rr.rang.luecke_zuege, 2);
  const rl = await rpc('authenticated', R, 'ausfahrt_rangliste', null, 10);
  assert.deepEqual(rl.zeilen.map((z) => [z.platz, z.name, z.zuege]).map(String), ['1,Ben,18', '2,Cem,20', '3,Ali,20']);
  assert.deepEqual(Object.keys(rl.zeilen[0]).sort(), ['avatar', 'ich', 'name', 'platz', 'pos', 'zeit_cs', 'zuege']);
  const ali = (await rpc('authenticated', P, 'ausfahrt_rangliste', null, 10)).ich; assert.equal(ali.luecke_zuege, 0); assert.ok(ali.luecke_cs > 0);
  assert.deepEqual(await rpc('anon', null, 'ausfahrt_tage_liste', 10), [heute]);
  await db.exec(`update private.ausfahrt_runden set issued_at = now() - interval '3 days' where finished_at is null`);
  await db.exec('select private.aufraeumen()');
  assert.equal((await db.query(`select count(*)::int n from private.ausfahrt_runden where finished_at is not null`)).rows[0].n, 3);
  await rpc('authenticated', P, 'konto_loeschen', 'LÖSCHEN');
  assert.equal((await db.query(`select count(*)::int n from private.ausfahrt_runden where user_id = '${P}'`)).rows[0].n, 0);
});
