// ROCKET REELS – Datenbank (Migration 20261101200000_rocket_reels.sql) gegen eine lokale Postgres-Kopie (PGlite).
// Gleicher Aufbau wie tests/db.test.mjs (alle Migrationen in Reihenfolge). Prüft: Browser-Rollen kommen nicht an die Coins,
// Revisionen verhindern doppeltes Buchen, Größen-/Plausibilitätsgrenzen, Ratenbegrenzung, Kontolöschung, Katalogeintrag.
// Start:  PGLITE_PATH=/pfad/zu/node_modules/@electric-sql/pglite node --test tests/rocket-reels-db.test.mjs
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
const Z = (coins) => JSON.stringify({ v: 1, coins, phase: 'bereit' });

test('Katalog: Spiel und Kategorie Arcade', async () => {
  const g = await als('anon', null, "select slug, save_id, categories, listed from public.games where slug = 'rocket-reels'");
  assert.deepEqual(g[0], { slug: 'rocket-reels', save_id: 'rocketreels', categories: ['arcade'], listed: true });
  assert.equal((await als('anon', null, "select name from public.categories where slug = 'arcade'"))[0].name, 'Arcade');
});

test('Browser (anon/authenticated) kommen weder an Tabelle noch an Funktionen', async () => {
  for (const rolle of ['anon', 'authenticated']) {
    assert.ok(await fehler(rolle, A, 'select * from private.rocket_konten'), rolle + ' liest Tabelle');
    assert.ok(await fehler(rolle, A, 'select public.rocket_laden($1)', [A]), rolle + ' ruft rocket_laden');
    assert.ok(await fehler(rolle, A, 'select public.rocket_speichern($1, 0, $2::jsonb)', [A, Z(1e9)]), rolle + ' ruft rocket_speichern');
  }
});

test('Revisionen: anlegen einmal, speichern nur mit aktueller Revision', async () => {
  assert.equal(await rpc('service_role', null, 'rocket_laden', A), null);
  assert.deepEqual(await rpc('service_role', null, 'rocket_speichern', A, 0, Z(1000)), { ok: true, revision: 1 });
  assert.deepEqual(await rpc('service_role', null, 'rocket_speichern', A, 0, Z(5000)), { ok: false, grund: 'konflikt' });
  assert.deepEqual(await rpc('service_role', null, 'rocket_speichern', A, 1, Z(990)), { ok: true, revision: 2 });
  assert.deepEqual(await rpc('service_role', null, 'rocket_speichern', A, 1, Z(99999)), { ok: false, grund: 'konflikt' }, 'zweiter Tab mit alter Revision');
  const l = await rpc('service_role', null, 'rocket_laden', A);
  assert.equal(l.revision, 2); assert.equal(l.zustand.coins, 990);
});

test('Plausibilität: kein Objekt, negative Coins, zu groß -> abgelehnt', async () => {
  assert.equal((await rpc('service_role', null, 'rocket_speichern', B, 0, '[1]')).grund, 'ungueltig');
  assert.equal((await rpc('service_role', null, 'rocket_speichern', B, 0, Z(-5))).grund, 'ungueltig');
  assert.equal((await rpc('service_role', null, 'rocket_speichern', B, 0, JSON.stringify({ coins: 1, x: 'a'.repeat(9000) }))).grund, 'ungueltig');
  assert.equal(await rpc('service_role', null, 'rocket_laden', B), null);
});

test('Ratenbegrenzung greift', async () => {
  let zuOft = false;
  for (let i = 0; i < 160 && !zuOft; i++) { const r = await rpc('service_role', null, 'rocket_speichern', ADM, i === 0 ? 0 : i, Z(1000)); if (r.grund === 'zu_oft') zuOft = true; }
  assert.ok(zuOft);
});

test('Konto löschen entfernt auch die Space Coins', async () => {
  await rpc('authenticated', A, 'konto_loeschen', 'LÖSCHEN');
  assert.equal(await rpc('service_role', null, 'rocket_laden', A), null);
});
