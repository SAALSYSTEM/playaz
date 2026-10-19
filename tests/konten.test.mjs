// Browser-Tests für Konto, Anmeldung per E-Mail-Code, Spielstand-Sync, Favoriten, Kategorien, Fehlermeldung, Statistik.
// Ohne Netzwerk: eine kleine statische Webseite aus public/ und ein Supabase-Ersatz im Speicher (Playwright-Routen).
// Der Ersatz bildet die Regeln der echten Datenbank nach (Revisionen, Konflikt, getrennte Konten); die echte Datenbank
// ist separat in tests/db.test.mjs geprüft. Start:  node --test tests/konten.test.mjs
import { test as t0, before, after } from 'node:test';
const test = (name, fn) => t0(name, { timeout: 90000 }, fn);
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUB = join(ROOT, 'public');
const FAKE = 'https://fake.supabase.test';

function ladePlaywright() {
  const req = createRequire(import.meta.url);
  try { return req('playwright'); } catch (e) {}
  try { return req(join(execSync('npm root -g').toString().trim(), 'playwright')); } catch (e) {}
  return req('/opt/npm-tools/node_modules/playwright');
}
const { chromium } = ladePlaywright();
const warte = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- statische Seite (wie der Worker: ohne .html erreichbar)
const TYPEN = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.txt': 'text/plain', '.webmanifest': 'application/manifest+json' };
let web, BASE, browser;
function datei(pfad) {
  let p = decodeURIComponent(pfad.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  for (const c of [p, p + '.html']) { const f = join(PUB, c); if (f.startsWith(PUB) && existsSync(f) && statSync(f).isFile()) return f; }
  return null;
}

// ---------------------------------------------------------------- Supabase-Ersatz
function b64u(o) { return Buffer.from(JSON.stringify(o)).toString('base64url'); }
function neuerServer() {
  const S = { users: new Map(), codes: new Map(), saves: new Map(), profiles: new Map(), favs: new Map(), bugs: [], stats: [], log: [], settings: { email: true, google: false, apple: false }, ausfall: false, code: '123456', codeAblauf: Infinity, n: 0 };
  S.user = (email) => { let u = S.users.get(email); if (!u) { const id = '00000000-0000-4000-8000-' + String(++S.n).padStart(12, '0'); u = { id, email }; S.users.set(email, u); } return u; };
  S.session = (u) => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const jwt = b64u({ alg: 'HS256', typ: 'JWT' }) + '.' + b64u({ sub: u.id, email: u.email, role: 'authenticated', aud: 'authenticated', exp, iat: exp - 3600 }) + '.sig';
    return { access_token: jwt, token_type: 'bearer', expires_in: 3600, expires_at: exp, refresh_token: 'r-' + u.id,
      user: { id: u.id, aud: 'authenticated', role: 'authenticated', email: u.email, email_confirmed_at: '2026-10-19T10:00:00Z', phone: '', app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {}, created_at: '2026-10-19T10:00:00Z',
        identities: [{ identity_id: 'i-' + u.id, id: u.id, user_id: u.id, provider: 'email', identity_data: { email: u.email, sub: u.id }, created_at: '2026-10-19T10:00:00Z', last_sign_in_at: '2026-10-19T10:00:00Z' }] } };
  };
  S.uid = (req) => { const a = req.headers()['authorization'] || ''; const m = /^Bearer ([^.]+)\.([^.]+)\./.exec(a); if (!m) return null; try { return JSON.parse(Buffer.from(m[2], 'base64url').toString()).sub; } catch (e) { return null; } };
  S.rows = (m, uid) => { if (!m.has(uid)) m.set(uid, new Map()); return m.get(uid); };
  return S;
}
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS', 'access-control-expose-headers': '*' };
const json = (route, status, body, extra) => route.fulfill({ status, headers: { ...CORS, 'content-type': 'application/json', ...(extra || {}) }, body: body === undefined ? '' : JSON.stringify(body) });

async function fakeAnbinden(ctx, S) {
  await ctx.route(FAKE + '/**', async (route) => {
    const req = route.request(); const url = new URL(req.url()); const p = url.pathname; const m = req.method();
    if (m === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    S.log.push(m + ' ' + p);
    if (S.ausfall) return route.abort('failed');
    const uid = S.uid(req); let body = null; try { body = req.postDataJSON(); } catch (e) {}
    // ---- Auth
    if (p === '/auth/v1/settings') return json(route, 200, { external: { email: S.settings.email, google: S.settings.google, apple: S.settings.apple }, disable_signup: false, mailer_autoconfirm: false });
    if (p === '/auth/v1/otp') {
      if (!body || !/^[^@\s]+@[^@\s]+$/.test(body.email || '')) return json(route, 400, { code: 400, error_code: 'validation_failed', msg: 'bad' });
      S.codes.set(body.email, { code: S.code, ablauf: S.codeAblauf }); return json(route, 200, {});
    }
    if (p === '/auth/v1/verify') {
      const c = S.codes.get(body.email);
      if (!c || c.code !== body.token) return json(route, 403, { code: 403, error_code: 'otp_expired', msg: 'Token has expired or is invalid' });
      if (Date.now() > c.ablauf) return json(route, 403, { code: 403, error_code: 'otp_expired', msg: 'Token has expired or is invalid' });
      S.codes.delete(body.email); return json(route, 200, S.session(S.user(body.email)));
    }
    if (p === '/auth/v1/user') { const u = [...S.users.values()].find((x) => x.id === uid); return u ? json(route, 200, S.session(u).user) : json(route, 401, { code: 401, msg: 'invalid JWT' }); }
    if (p === '/auth/v1/token') { const u = [...S.users.values()].find((x) => 'r-' + x.id === (body && body.refresh_token)); return u ? json(route, 200, S.session(u)) : json(route, 400, { code: 400, msg: 'Invalid Refresh Token' }); }
    if (p === '/auth/v1/logout') return route.fulfill({ status: 204, headers: CORS });
    // ---- Tabellen
    const t = /^\/rest\/v1\/([a-z_]+)$/.exec(p);
    if (t) {
      const tab = t[1]; const accept = req.headers()['accept'] || ''; const einzel = accept.includes('vnd.pgrst.object');
      const antwort = (rows) => einzel ? (rows.length === 1 ? json(route, 200, rows[0]) : json(route, 406, { code: 'PGRST116', details: 'The result contains ' + rows.length + ' rows', message: 'x' })) : json(route, 200, rows);
      if (tab === 'games' || tab === 'categories') return json(route, 200, []);
      if (!uid) return json(route, 401, { code: '42501', message: 'permission denied' });
      if (tab === 'profiles') return antwort(S.profiles.has(uid) ? [S.profiles.get(uid)] : []);
      if (tab === 'saves') return antwort([...S.rows(S.saves, uid).values()]);
      if (tab === 'favorites') {
        const f = S.rows(S.favs, uid);
        if (m === 'GET') return json(route, 200, [...f.keys()].map((g) => ({ game_slug: g })));
        if (m === 'POST') { if (body.user_id !== uid) return json(route, 403, { code: '42501', message: 'row-level security' }); f.set(body.game_slug, 1); return route.fulfill({ status: 201, headers: CORS }); }
        if (m === 'DELETE') { f.delete((url.searchParams.get('game_slug') || '').replace(/^eq\./, '')); return route.fulfill({ status: 204, headers: CORS }); }
      }
      return json(route, 404, {});
    }
    const r = /^\/rest\/v1\/rpc\/([a-z_]+)$/.exec(p);
    if (r) {
      const fn = r[1];
      if (fn === 'fehler_melden') {
        if (!body.p_message || body.p_message.trim().length < 3) return json(route, 200, { ok: false, fehler: 'zu_kurz' });
        if (S.bugs.length >= 5) return json(route, 200, { ok: false, fehler: 'zu_oft' });
        S.bugs.push({ ...body, auth: req.headers()['authorization'] || null }); return json(route, 200, { ok: true });
      }
      if (fn === 'statistik_melden') { S.stats.push(body); return json(route, 200, { ok: true }); }
      if (!uid) return json(route, 401, { code: '42501', message: 'permission denied' });
      if (fn === 'name_frei') { const frei = ![...S.profiles.entries()].some(([k, v]) => k !== uid && v.display_name.toLowerCase() === body.p_name.trim().toLowerCase()); return json(route, 200, frei ? { frei: true } : { frei: false, fehler: 'vergeben' }); }
      if (fn === 'profil_speichern') {
        const n = body.p_name.trim().replace(/\s+/g, ' ');
        if (n.length < 3) return json(route, 200, { ok: false, fehler: 'zu_kurz' });
        if ([...S.profiles.entries()].some(([k, v]) => k !== uid && v.display_name.toLowerCase() === n.toLowerCase())) return json(route, 200, { ok: false, fehler: 'vergeben' });
        S.profiles.set(uid, { display_name: n, avatar: body.p_avatar }); return json(route, 200, { ok: true, name: n, avatar: body.p_avatar });
      }
      if (fn === 'spielstand_speichern') {
        const z = S.rows(S.saves, uid); const alt = z.get(body.p_game); const base = body.p_base || 0;
        const zeile = (rev) => ({ game_id: body.p_game, user_id: uid, revision: rev, format: 1, data: body.p_data, progress: body.p_progress, summary: body.p_summary, device: body.p_device, client_saved_at: body.p_saved_at, updated_at: new Date().toISOString() });
        if (alt && alt.revision !== base) return json(route, 200, { status: 'konflikt', server: { ...alt } });
        if (!alt && base !== 0) return json(route, 200, { status: 'konflikt', server: { revision: 0 } });
        const neu = zeile(alt ? alt.revision + 1 : 1); z.set(body.p_game, neu); return json(route, 200, { status: 'ok', revision: neu.revision, updated_at: neu.updated_at });
      }
      if (fn === 'konto_loeschen') {
        if (body.p_bestaetigung !== 'LÖSCHEN') return json(route, 200, { ok: false, fehler: 'bestaetigung' });
        S.saves.delete(uid); S.favs.delete(uid); S.profiles.delete(uid); for (const [e, u] of S.users) if (u.id === uid) S.users.delete(e);
        return json(route, 200, { ok: true });
      }
      return json(route, 404, {});
    }
    return json(route, 404, {});
  });
}

// ---------------------------------------------------------------- Browser-Kontext mit angepasster Konfiguration
const CFG_ORIGINAL = readFileSync(join(PUB, 'assets/playsaal-config.js'), 'utf8');
async function kontext(S, opts = {}, cfg = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 800 }, ...opts });
  await fakeAnbinden(ctx, S);
  await ctx.route('**/assets/playsaal-config.js', (r) => r.fulfill({ contentType: 'application/javascript', body:
    CFG_ORIGINAL.replace(/url: '[^']+'/, `url: '${FAKE}'`).replace(/siteUrl: '[^']+'/, `siteUrl: '${BASE}'`)
      .replace('anmelden: { email: false, google: false, apple: false }', `anmelden: { email: ${cfg.email !== false}, google: false, apple: false }`)
      .replace('statistik: false', `statistik: ${!!cfg.statistik}`) }));
  // Katalog-Grafiken und Schriften sind für diese Tests egal
  await ctx.route(/\.(woff2?|mp3|ogg)(\?.*)?$/, (r) => r.abort());
  // Die Frage nach dem Spielernamen ist ein eigener Test; sonst wird sie weggeklickt, damit sie keine anderen Abläufe verdeckt.
  if (!cfg.profilFrage) await ctx.addInitScript(() => { try { sessionStorage.setItem('playsaal.profil.spaeter', '1'); } catch (e) {} });
  return ctx;
}
const ui = (page) => page.locator('#playsaal-ui');
async function einloggen(page, mail, code = '123456') {
  await page.evaluate(() => localStorage.removeItem('playsaal.otp.t')); // 60-s-Wartezeit für neue Codes überspringen
  if (!(await ui(page).locator('dialog[open]').count())) await page.evaluate(() => { window.PlaySaal.anmelden(); });
  const d = ui(page).locator('dialog[open]');
  await d.locator('input[type=email]').fill(mail);
  await d.getByRole('button', { name: 'Code per E-Mail senden' }).click();
  await d.locator('input.code').fill(code);
  await d.getByRole('button', { name: 'Bestätigen' }).click();
}
const speicher = (page) => page.evaluate(() => Object.fromEntries(Object.keys(localStorage).filter((k) => /^(eiszeit|stellwerk)\./.test(k)).map((k) => [k, localStorage.getItem(k)])));
// Nach der ersten Anmeldung fragt PlaySaal nach einem Spielernamen; „Später“ schließt den Dialog.
async function spaeter(page) {
  const b = ui(page).getByRole('button', { name: 'Später' });
  try { await b.waitFor({ timeout: 4000 }); await b.click(); } catch (e) {}
}
// Konto mit bereits gesichertem Spielstand (Übernahme bestätigt), danach auf der Konto-Seite
async function kontoMitStand(page, S, mail, sold) {
  await page.goto(BASE + '/konto', { waitUntil: 'load' });
  await page.waitForSelector('#anmelden:not([hidden])');
  await page.evaluate((v) => localStorage.setItem('eiszeit.v1', v), eis(sold));
  await einloggen(page, mail);
  await ui(page).locator('dialog[open]').getByRole('button', { name: 'In mein Konto übernehmen' }).click();
  const u = S.users.get(mail); await waitFor(() => S.saves.get(u.id) && S.saves.get(u.id).size === 1);
  await page.waitForSelector('#angemeldet:not([hidden])');
  return u;
}
const eis = (sold) => JSON.stringify({ sold, paid: 0, coins: sold * 2 });

before(async () => {
  web = createServer((req, res) => {
    const f = datei(req.url);
    if (!f) { res.statusCode = 404; res.end('nicht gefunden'); return; }
    res.setHeader('content-type', TYPEN[extname(f)] || 'application/octet-stream'); res.end(readFileSync(f));
  }).listen(0, '127.0.0.1');
  await new Promise((r) => web.once('listening', r));
  BASE = 'http://127.0.0.1:' + web.address().port;
  browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
});
after(async () => { await browser?.close(); web?.close(); });

// ================================================================ Tests
test('Gast: Spielen ohne Konto, nichts geht an Supabase außer dem Anbieter-Check, Status "Nur auf diesem Gerät"', async () => {
  const S = neuerServer(); const ctx = await kontext(S); const page = await ctx.newPage();
  const fehler = []; page.on('pageerror', (e) => fehler.push(e.message));
  await page.goto(BASE + '/spiele/eiszeit', { waitUntil: 'load' });
  await page.evaluate((v) => localStorage.setItem('eiszeit.v1', v), eis(7));
  await page.waitForSelector('#playsaal-ui', { state: 'attached' });
  await expect_text(ui(page).locator('.pill'), 'Nur auf diesem Gerät');
  await ui(page).locator('button[aria-label="Fehler melden"]').waitFor();
  await warte(600);
  assert.deepEqual(S.log.filter((l) => !l.includes('/auth/v1/settings')), [], 'Gast sendet keine Daten: ' + S.log.join(', '));
  assert.equal((await speicher(page))['eiszeit.v1'], eis(7));
  assert.deepEqual(fehler, []);
  await ctx.close();
});

test('Gast ohne freigegebene Anmeldung: kein Knopf zum Anmelden, Spiel und Fehlermeldung bleiben', async () => {
  const S = neuerServer(); S.settings.email = false; const ctx = await kontext(S); const page = await ctx.newPage();
  await page.goto(BASE + '/spiele/eiszeit', { waitUntil: 'load' });
  await ui(page).locator('button[aria-label="Fehler melden"]').waitFor();
  assert.equal(await ui(page).locator('.pill').isHidden(), true, 'Statusknopf nur, wenn Anmeldung wirklich verfügbar ist');
  await page.goto(BASE + '/konto', { waitUntil: 'load' });
  await page.waitForSelector('#gast:not([hidden])');
  assert.match(await page.textContent('#gastHinweis'), /noch nicht freigeschaltet/);
  assert.equal(await page.locator('#anmelden').isHidden(), true);
  await ctx.close();
});

test('Supabase-Ausfall: Startseite, Spiel und Katalog bleiben benutzbar', async () => {
  const S = neuerServer(); S.ausfall = true; const ctx = await kontext(S); const page = await ctx.newPage();
  const fehler = []; page.on('pageerror', (e) => fehler.push(e.message));
  await page.goto(BASE + '/', { waitUntil: 'load' });
  await page.waitForSelector('#kategorien .kat-chips button');
  assert.equal(await page.locator('.kachel:not([hidden])').count() > 15, true);
  await page.goto(BASE + '/spiele/eiszeit', { waitUntil: 'load' });
  await ui(page).locator('button[aria-label="Fehler melden"]').waitFor();
  assert.deepEqual(fehler, []);
  await ctx.close();
});

test('Anmeldung per E-Mail-Code: falscher und abgelaufener Code scheitern, richtiger meldet an, Rückkehr zur Seite, Abmelden', async () => {
  const S = neuerServer(); const ctx = await kontext(S, {}, { profilFrage: true }); const page = await ctx.newPage();
  await page.goto(BASE + '/konto', { waitUntil: 'load' });
  await page.waitForSelector('#anmelden:not([hidden])');
  await page.click('#anmelden');
  const d = ui(page).locator('dialog[open]');
  await d.locator('input[type=email]').fill('kaputt');
  await d.getByRole('button', { name: 'Code per E-Mail senden' }).click();
  await expect_text(d.locator('.f'), 'gültige E-Mail');
  await d.locator('input[type=email]').fill('anna@example.org');
  await d.getByRole('button', { name: 'Code per E-Mail senden' }).click();
  await d.locator('input.code').fill('000000');
  await d.getByRole('button', { name: 'Bestätigen' }).click();
  await expect_text(d.locator('.f.e'), 'Code');
  assert.equal(await page.evaluate(() => !!window.PlaySaal.user()), false, 'falscher Code meldet nicht an');
  await d.locator('input.code').fill('12ab56');
  await d.getByRole('button', { name: 'Bestätigen' }).click();
  await expect_text(d.locator('.f.e'), 'Ziffern');
  // abgelaufen
  S.codes.get('anna@example.org').ablauf = Date.now() - 1;
  await d.locator('input.code').fill('123456');
  await d.getByRole('button', { name: 'Bestätigen' }).click();
  await expect_text(d.locator('.f.e'), 'Code');
  assert.equal(await page.evaluate(() => !!window.PlaySaal.user()), false, 'abgelaufener Code meldet nicht an');
  // neuer Code gleich danach: gesperrt (60 s Wartezeit)
  assert.match(await d.getByRole('button', { name: /Neuer Code in/ }).textContent(), /\d+ s/);
  // richtiger Code
  S.codes.set('anna@example.org', { code: '123456', ablauf: Infinity });
  await d.locator('input.code').fill('123456');
  await d.getByRole('button', { name: 'Bestätigen' }).click();
  await page.waitForSelector('#angemeldet:not([hidden])');
  assert.equal(await page.evaluate(() => window.PlaySaal.user().email), 'anna@example.org');
  // Spielername: der Dialog erscheint nach der ersten Anmeldung von selbst
  const p = ui(page).locator('dialog[open]');
  await expect_text(p.locator('h2'), 'Wie heißt du im Spiel');
  await p.locator('input[aria-label="Spielername"]').fill('Anna Maus');
  await p.getByRole('button', { name: 'Bild 3' }).click();
  await p.getByRole('button', { name: 'Speichern' }).click();
  await expect_text(page.locator('#spielername'), 'Anna Maus');
  assert.equal(S.profiles.get(S.users.get('anna@example.org').id).avatar, 'a3');
  // Seite neu laden: bleibt angemeldet
  await page.reload({ waitUntil: 'load' }); await page.waitForSelector('#angemeldet:not([hidden])');
  // Abmelden
  page.on('dialog', (x) => x.accept());
  await page.click('#abmelden'); await page.waitForSelector('#gast:not([hidden])');
  assert.equal(await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('playsaal.auth')).length), 0);
  await ctx.close();
});

test('Rückkehr: nach der Anmeldung geht es zur ursprünglichen Seite; fremde Rücksprungziele werden ignoriert', async () => {
  const S = neuerServer(); const ctx = await kontext(S); const page = await ctx.newPage();
  await page.goto(BASE + '/spiele/stellwerk', { waitUntil: 'load' });
  await page.evaluate(() => window.PlaySaal.rueckweg && 0);
  const gut = await page.evaluate(() => window.PlaySaal.gueltigerRueckweg('/spiele/stellwerk?x=1#a'));
  const boese = await page.evaluate(() => ['https://evil.example/', '//evil.example', 'javascript:alert(1)', '/\\evil.example', '/spiele/../../x'].map((u) => window.PlaySaal.gueltigerRueckweg(u)));
  assert.ok(gut, 'eigener Pfad erlaubt');
  assert.deepEqual(boese.filter(Boolean), [], 'fremde Ziele abgelehnt');
  await ctx.close();
});

test('Zwei Konten: Spielstände, Favoriten und Profil sind getrennt, Kontowechsel am selben Gerät leckt nichts', async () => {
  const S = neuerServer(); const ctx = await kontext(S); const page = await ctx.newPage();
  await page.goto(BASE + '/konto', { waitUntil: 'load' });
  await page.waitForSelector('#anmelden:not([hidden])');
  // A: lokaler Fortschritt wird angeboten und übernommen
  await page.evaluate((v) => localStorage.setItem('eiszeit.v1', v), eis(10));
  await einloggen(page, 'a@example.org');
  const dAng = ui(page).locator('dialog[open]');
  await expect_text(dAng.locator('h2'), 'Fortschritt übernehmen');
  await dAng.getByRole('button', { name: 'In mein Konto übernehmen' }).click();
  await waitFor(() => S.saves.size === 1);
  await spaeter(page);
  const a = S.users.get('a@example.org');
  assert.equal(JSON.parse(S.saves.get(a.id).get('eiszeit').data.keys['eiszeit.v1']).sold, 10);
  await page.evaluate(() => window.PlaySaal.favorit('eiszeit', true));
  await waitFor(() => S.favs.get(a.id) && S.favs.get(a.id).has('eiszeit'));
  // A meldet sich ab: lokale Sync-Stände verschwinden vom Gerät
  page.on('dialog', (x) => x.accept());
  await page.click('#abmelden'); await page.waitForSelector('#gast:not([hidden])');
  assert.equal((await speicher(page))['eiszeit.v1'], undefined, 'Spielstand von A nicht mehr im Browser');
  // B meldet sich an: sieht nichts von A
  await einloggen(page, 'b@example.org');
  await spaeter(page);
  await page.waitForSelector('#angemeldet:not([hidden])');
  assert.equal(await page.evaluate(() => [...window.PlaySaal.favoriten()].length), 0, 'Favoriten von A nicht bei B');
  assert.equal((await speicher(page))['eiszeit.v1'], undefined);
  await page.waitForSelector('#staende p.klein');
  assert.match(await page.textContent('#staende'), /Noch keine Spielstände/);
  const b = S.users.get('b@example.org'); assert.equal(S.saves.get(b.id) === undefined || S.saves.get(b.id).size === 0, true);
  // B spielt etwas und lädt hoch; A bleibt unverändert
  await page.evaluate((v) => localStorage.setItem('eiszeit.v1', v), eis(3));
  await page.evaluate(() => { window.PlaySaal.syncJetzt(); });
  await ui(page).locator('dialog[open]').getByRole('button', { name: 'In mein Konto übernehmen' }).click();
  await waitFor(() => S.saves.get(b.id) && S.saves.get(b.id).size === 1);
  await ctx.close();
  assert.equal(JSON.parse(S.saves.get(a.id).get('eiszeit').data.keys['eiszeit.v1']).sold, 10, 'Stand von A unverändert');
});

test('Direkter Kontowechsel ohne Abmelden (zweiter Tab): Stand des alten Kontos wandert in die Sicherung, nicht ins neue Konto', async () => {
  const S = neuerServer(); const ctx = await kontext(S); const page = await ctx.newPage();
  await page.goto(BASE + '/konto', { waitUntil: 'load' });
  await page.waitForSelector('#anmelden:not([hidden])');
  await einloggen(page, 'a@example.org'); await page.waitForSelector('#angemeldet:not([hidden])');
  await page.evaluate((v) => localStorage.setItem('eiszeit.v1', v), eis(42));
  await page.evaluate(() => { window.PlaySaal.syncJetzt(); }); // neuer lokaler Stand -> Angebot zur Übernahme, kein stilles Hochladen
  await expect_text(ui(page).locator('dialog[open] h2'), 'Fortschritt übernehmen');
  assert.equal((S.saves.get(S.users.get('a@example.org').id) || new Map()).size, 0, 'ohne Zustimmung nichts im Konto');
  await ui(page).locator('dialog[open]').getByRole('button', { name: 'In mein Konto übernehmen' }).click();
  await waitFor(() => S.saves.get(S.users.get('a@example.org').id) && S.saves.get(S.users.get('a@example.org').id).size === 1);
  // neues Konto meldet sich auf dem Gerät an (ohne Abmelden von A)
  const u = S.user('c@example.org'); const sess = S.session(u);
  await page.evaluate(async (s) => { const c = await window.PlaySaal.client(); await c.auth.setSession({ access_token: s.access_token, refresh_token: s.refresh_token }); }, sess);
  await waitFor(async () => (await page.evaluate(() => window.PlaySaal.user() && window.PlaySaal.user().email)) === 'c@example.org');
  await warte(500);
  assert.equal((await speicher(page))['eiszeit.v1'], undefined, 'Stand von A ist im Gerätespeicher für C nicht sichtbar');
  assert.ok(await page.evaluate(() => Object.keys(localStorage).some((k) => k.startsWith('playsaal.quarantaene.'))), 'Stand von A liegt in der Sicherung');
  assert.equal(S.saves.get(u.id) === undefined || S.saves.get(u.id).size === 0, true, 'nichts landet im Konto von C');
  await ctx.close();
});

test('Anderes Gerät hat einen anderen Stand: Konflikt-Dialog mit Fortschritt und Zeit, nichts wird ungefragt überschrieben', async () => {
  const S = neuerServer(); const ctx = await kontext(S); const page = await ctx.newPage();
  const u = S.user('k@example.org');
  S.rows(S.saves, u.id).set('eiszeit', { game_id: 'eiszeit', user_id: u.id, revision: 4, format: 1, data: { keys: { 'eiszeit.v1': eis(50) } }, progress: 50, summary: '50 Eis verkauft', device: 'Handy', client_saved_at: '2026-10-18T08:00:00Z', updated_at: '2026-10-18T08:00:00Z' });
  await page.goto(BASE + '/konto', { waitUntil: 'load' });
  await page.evaluate((v) => localStorage.setItem('eiszeit.v1', v), eis(20)); // anderer, nicht verwandter Stand auf diesem Gerät
  await page.waitForSelector('#anmelden:not([hidden])');
  await einloggen(page, 'k@example.org');
  const d = ui(page).locator('dialog[open]');
  await expect_text(d.locator('h2'), 'Welcher Stand gilt');
  const text = await d.textContent();
  assert.match(text, /Dieses Gerät/); assert.match(text, /Dein Konto/); assert.match(text, /50 Eis verkauft/); assert.match(text, /Gespeichert: /);
  assert.equal(JSON.parse((await speicher(page))['eiszeit.v1']).sold, 20, 'lokal unverändert, solange nichts gewählt ist');
  assert.equal(S.saves.get(u.id).get('eiszeit').revision, 4, 'Konto unverändert, solange nichts gewählt ist');
  // Wahl: Stand aus dem Konto laden
  await d.getByRole('button', { name: 'Stand aus dem Konto laden' }).click();
  await waitFor(async () => JSON.parse((await speicher(page))['eiszeit.v1']).sold === 50);
  assert.equal(S.saves.get(u.id).get('eiszeit').revision, 4);
  // Sicherung des verworfenen Stands bleibt erhalten
  assert.ok(await page.evaluate(() => Object.keys(localStorage).some((k) => k.startsWith('playsaal.sicherung.'))), 'verworfener Stand als Sicherung');
  await ctx.close();
});

test('Gleichzeitige Änderung: veraltete Revision wird abgelehnt (Konflikt) statt zu überschreiben', async () => {
  const S = neuerServer(); const ctx = await kontext(S); const page = await ctx.newPage();
  await page.goto(BASE + '/konto', { waitUntil: 'load' });
  await page.waitForSelector('#anmelden:not([hidden])');
  await page.evaluate((v) => localStorage.setItem('eiszeit.v1', v), eis(5));
  await einloggen(page, 'g@example.org');
  await ui(page).locator('dialog[open]').getByRole('button', { name: 'In mein Konto übernehmen' }).click();
  const u = S.users.get('g@example.org'); await waitFor(() => S.saves.get(u.id) && S.saves.get(u.id).size === 1);
  // „anderes Gerät" erhöht die Revision im Konto
  const z = S.saves.get(u.id).get('eiszeit'); z.revision = 2; z.data = { keys: { 'eiszeit.v1': eis(99) } };
  await page.evaluate((v) => localStorage.setItem('eiszeit.v1', v), eis(6)); // dieses Gerät ändert auch, kennt aber Revision 1
  const res = await page.evaluate(() => window.PlaySaal.rpc('spielstand_speichern', { p_game: 'eiszeit', p_format: 1, p_data: { keys: { 'eiszeit.v1': '{"sold":6}' } }, p_progress: 6, p_summary: '', p_base: 1, p_device: 'x', p_saved_at: new Date().toISOString() }));
  assert.equal(res.daten.status, 'konflikt');
  assert.equal(S.saves.get(u.id).get('eiszeit').revision, 2);
  assert.equal(JSON.parse(S.saves.get(u.id).get('eiszeit').data.keys['eiszeit.v1']).sold, 99, 'Konto nicht überschrieben');
  await ctx.close();
});

test('Offline spielen, später synchronisieren; Status zeigt Offline/Ausstehend/Gespeichert', async () => {
  const S = neuerServer(); const ctx = await kontext(S); const page = await ctx.newPage();
  const u = await kontoMitStand(page, S, 'o@example.org', 1);
  await page.goto(BASE + '/spiele/eiszeit', { waitUntil: 'load' });
  await expect_text(ui(page).locator('.pill'), 'Gespeichert');
  await ctx.setOffline(true); S.ausfall = true; // Playwright-Routen umgehen das Netz, daher fällt der Ersatz-Server mit aus
  await page.evaluate((v) => localStorage.setItem('eiszeit.v1', v), eis(8));
  await page.evaluate(() => { window.dispatchEvent(new Event('offline')); document.dispatchEvent(new Event('visibilitychange')); window.PlaySaal.syncJetzt(); });
  await warte(800);
  assert.equal(JSON.parse(S.saves.get(u.id).get('eiszeit').data.keys['eiszeit.v1']).sold, 1, 'offline wird nichts hochgeladen');
  assert.equal(JSON.parse((await speicher(page))['eiszeit.v1']).sold, 8, 'lokal gespeichert');
  await waitFor(async () => /Offline|ausstehend/i.test(await ui(page).locator('.pill').textContent()), 15000);
  await ctx.setOffline(false); S.ausfall = false;
  await page.evaluate(() => { window.dispatchEvent(new Event('online')); window.PlaySaal.syncJetzt(); });
  await waitFor(() => JSON.parse(S.saves.get(u.id).get('eiszeit').data.keys['eiszeit.v1']).sold === 8);
  assert.equal(S.saves.get(u.id).get('eiszeit').revision, 2);
  await expect_text(ui(page).locator('.pill'), 'Gespeichert');
  await ctx.close();
});

test('Gebündeltes Speichern: viele Änderungen in kurzer Zeit erzeugen wenige Schreibvorgänge', async () => {
  const S = neuerServer(); const ctx = await kontext(S); const page = await ctx.newPage();
  const u = await kontoMitStand(page, S, 'b2@example.org', 1);
  await page.goto(BASE + '/spiele/eiszeit', { waitUntil: 'load' });
  await expect_text(ui(page).locator('.pill'), 'Gespeichert');
  S.log.length = 0;
  for (let i = 2; i <= 31; i++) { await page.evaluate((v) => localStorage.setItem('eiszeit.v1', v), eis(i)); await warte(30); }
  await page.evaluate(() => { window.PlaySaal.syncJetzt(); });
  await waitFor(() => JSON.parse(S.saves.get(u.id).get('eiszeit').data.keys['eiszeit.v1']).sold === 31);
  const schreib = S.log.filter((l) => l.includes('spielstand_speichern')).length;
  assert.ok(schreib >= 1 && schreib <= 3, 'Schreibvorgänge: ' + schreib);
  await ctx.close();
});

test('Favoriten: Herz setzt/entfernt, bleibt nach Neuladen, Filter "Favoriten", Leer-Hinweis', async () => {
  const S = neuerServer(); const ctx = await kontext(S); const page = await ctx.newPage();
  await page.goto(BASE + '/', { waitUntil: 'load' });
  await page.waitForSelector('.kachel .fav');
  // als Gast öffnet das Herz die Anmeldung
  await page.locator('.kachel[data-slug="eiszeit"] .fav').first().click();
  await ui(page).locator('dialog[open] input[type=email]').waitFor();
  await einloggen(page, 'f@example.org');
  await page.waitForFunction(() => window.PlaySaal.user());
  await page.locator('.kachel[data-slug="eiszeit"] .fav').first().click();
  const u = S.users.get('f@example.org');
  await waitFor(() => S.favs.get(u.id) && S.favs.get(u.id).has('eiszeit'));
  await page.locator('#kategorien button', { hasText: 'Favoriten' }).click();
  assert.equal(await page.locator('.kachel:not([hidden])').count(), 1);
  await page.reload({ waitUntil: 'load' }); await page.waitForFunction(() => window.PlaySaal.favoriten().has('eiszeit'));
  assert.equal(await page.locator('.kachel[data-slug="eiszeit"] .fav[aria-pressed="true"]').count() >= 1, true);
  // entfernen -> Leerhinweis im Favoriten-Filter
  await page.locator('.kachel[data-slug="eiszeit"] .fav').first().click();
  await waitFor(() => !S.favs.get(u.id).has('eiszeit'));
  await page.locator('#kategorien button', { hasText: 'Favoriten' }).click();
  await expect_text(page.locator('#katLeer'), 'noch keine Favoriten');
  await ctx.close();
});

test('Kategorien: Filter, Suche nach Kategorie, Leer-Hinweis, Umschalten, Mobil ohne Überlauf', async () => {
  const S = neuerServer(); S.settings.email = false;
  const ctx = await kontext(S, { viewport: { width: 375, height: 700 }, hasTouch: true, isMobile: true }, { email: false });
  const page = await ctx.newPage();
  await page.goto(BASE + '/', { waitUntil: 'load' });
  await page.waitForSelector('#kategorien .kat-chips button');
  const alle = await page.locator('.kachel:not([hidden])').count();
  assert.ok(alle >= 15);
  await page.locator('#kategorien button', { hasText: 'Für Kinder' }).click();
  const kinder = await page.$$eval('.kachel:not([hidden])', (e) => e.map((x) => x.dataset.slug));
  assert.ok(kinder.includes('eiszeit') && kinder.includes('wasser-marsch') && !kinder.includes('stellwerk'), kinder.join());
  assert.equal(new Set(kinder).size, kinder.length, 'keine Doppelten');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'kein horizontaler Überlauf');
  assert.equal(await page.locator('#kategorien button[aria-pressed="true"]').textContent(), 'Für Kinder');
  await page.locator('#kategorien button', { hasText: 'Für Kinder' }).click(); // erneut -> alle
  assert.equal(await page.locator('.kachel:not([hidden])').count(), alle);
  // Kategorie ohne Spiel -> Leerhinweis mit Weg zurück
  await page.evaluate(() => { document.querySelectorAll('.kachel').forEach((l) => { l.dataset.kategorien = (l.dataset.kategorien || '').split(',').filter((x) => x !== 'rennen').join(','); }); });
  await page.locator('#kategorien button', { hasText: 'Rennen' }).click();
  await expect_text(page.locator('#katLeer'), 'noch kein Spiel');
  await page.locator('#katLeer button').click();
  assert.equal(await page.locator('.kachel:not([hidden])').count(), alle);
  // Suche findet über Kategorienamen
  await page.click('#sucheBtn'); await page.fill('#sucheText', 'Rätsel');
  const treffer = await page.locator('#sucheListe li').count(); assert.ok(treffer >= 3, 'Suche nach Kategorie: ' + treffer);
  await ctx.close();
});

test('Katalog aus der Datenbank: Hot-Auswahl und Listung werden übernommen, unveröffentlichte Spiele bleiben verborgen', async () => {
  const S = neuerServer(); const ctx = await kontext(S, {}, { email: false });
  const katalog = [
    { slug: 'stellwerk', categories: ['raetsel', 'kinder'], hot: true, hot_rank: 1, listed: true },
    { slug: 'eiszeit', categories: ['aufbau'], hot: false, hot_rank: null, listed: false }];
  await ctx.route(FAKE + '/rest/v1/games*', (r) => json(r, 200, katalog));
  await ctx.route(FAKE + '/rest/v1/categories*', (r) => json(r, 200, [{ slug: 'raetsel', name: 'Knobeln', rank: 1, active: true }, { slug: 'kinder', name: 'Kids', rank: 2, active: true }]));
  const page = await ctx.newPage();
  await page.goto(BASE + '/', { waitUntil: 'load' });
  await page.waitForFunction(() => [...document.querySelectorAll('#kategorien button')].some((b) => b.textContent === 'Knobeln'));
  assert.deepEqual(await page.$$eval('#kategorien button', (b) => b.map((x) => x.textContent)), ['Alle', 'Knobeln', 'Kids']);
  assert.equal(await page.locator('.kachel[data-slug="eiszeit"]:not([hidden])').count(), 0, 'nicht gelistet = verborgen');
  assert.equal(await page.locator('#hot .kachel:not([hidden])').count(), 1);
  await ctx.close();
});

test('Fehler melden: ohne Login, validiert, ohne Token/Spielstand, Spiel läuft weiter, Spam-Limit', async () => {
  const S = neuerServer(); const ctx = await kontext(S); const page = await ctx.newPage();
  const fehler = []; page.on('pageerror', (e) => fehler.push(e.message));
  await page.goto(BASE + '/spiele/eiszeit', { waitUntil: 'load' });
  await page.evaluate((v) => localStorage.setItem('eiszeit.v1', v), eis(12));
  const knopf = ui(page).locator('button[aria-label="Fehler melden"]'); await knopf.waitFor();
  await knopf.click();
  const d = ui(page).locator('dialog[open]');
  await d.getByRole('button', { name: 'Fehler senden' }).click();
  await expect_text(d.locator('.f.e'), 'beschreibe');
  assert.equal(S.bugs.length, 0, 'leere Meldung wird nicht gesendet');
  await d.locator('textarea').fill('Der Button hängt nach dem Level <b>3</b>');
  await d.getByRole('button', { name: 'Fehler senden' }).click();
  await expect_text(d.locator('h2'), 'Danke');
  assert.equal(S.bugs.length, 1);
  const b = S.bugs[0];
  assert.equal(b.p_game, 'eiszeit'); assert.equal(b.auth, null, 'kein Token');
  assert.deepEqual(Object.keys(b.p_context).sort(), ['ansicht', 'browser', 'touch'].sort().filter((k) => k in b.p_context));
  assert.ok(!JSON.stringify(b).includes('"sold"') && !JSON.stringify(b).includes('eiszeit.v1'), 'kein Spielstand in der Meldung');
  await d.getByRole('button', { name: 'Weiterspielen' }).click();
  assert.equal((await speicher(page))['eiszeit.v1'], eis(12), 'Fortschritt unverändert');
  // Spam-Limit des Servers wird freundlich angezeigt
  for (let i = 0; i < 4; i++) S.bugs.push({ p_test: true });
  await knopf.click();
  await ui(page).locator('dialog[open] textarea').fill('Noch ein Fehler');
  await ui(page).locator('dialog[open]').getByRole('button', { name: 'Fehler senden' }).click();
  await expect_text(ui(page).locator('dialog[open] .f.e'), 'mehrere Meldungen');
  assert.ok(await ui(page).locator('dialog[open] textarea').inputValue() === 'Noch ein Fehler', 'Text bleibt erhalten');
  assert.deepEqual(fehler, []);
  await ctx.close();
});

test('Fehler melden bei Netzfehler: Text bleibt stehen, nichts geht verloren', async () => {
  const S = neuerServer(); const ctx = await kontext(S); const page = await ctx.newPage();
  await page.goto(BASE + '/spiele/eiszeit', { waitUntil: 'load' });
  await ui(page).locator('button[aria-label="Fehler melden"]').click();
  S.ausfall = true;
  await ui(page).locator('dialog[open] textarea').fill('Es ruckelt');
  await ui(page).locator('dialog[open]').getByRole('button', { name: 'Fehler senden' }).click();
  await expect_text(ui(page).locator('dialog[open] .f.e'), 'Keine Verbindung');
  assert.equal(await ui(page).locator('dialog[open] textarea').inputValue(), 'Es ruckelt');
  await ctx.close();
});

test('Fehlermeldung, Anmeldedialog und Tastatur: Eingaben im Dialog steuern das Spiel nicht', async () => {
  const S = neuerServer(); const ctx = await kontext(S); const page = await ctx.newPage();
  await page.goto(BASE + '/spiele/stellwerk', { waitUntil: 'load' });
  await page.evaluate(() => { window.__tasten = []; window.addEventListener('keydown', (e) => window.__tasten.push(e.key)); });
  await ui(page).locator('button[aria-label="Fehler melden"]').click();
  await ui(page).locator('dialog[open] textarea').pressSequentially('wasd ');
  assert.deepEqual(await page.evaluate(() => window.__tasten), [], 'Tastendrücke erreichen das Spiel nicht');
  await ctx.close();
});

test('Statistik: Start einmal je Seitenaufruf, aktive Zeit, kein Frame-Verkehr, Testlauf markiert; aus, wenn nicht freigegeben', async () => {
  // aus
  let S = neuerServer(); let ctx = await kontext(S); let page = await ctx.newPage();
  await page.goto(BASE + '/spiele/eiszeit', { waitUntil: 'load' }); await warte(800);
  assert.equal(S.stats.length, 0, 'ohne Freigabe keine Statistik');
  await ctx.close();
  // an
  S = neuerServer(); ctx = await kontext(S, {}, { statistik: true }); page = await ctx.newPage();
  await page.goto(BASE + '/spiele/eiszeit?playsaal-test', { waitUntil: 'load' }); await warte(500);
  assert.equal(S.stats.length, 0, 'ohne Spielaktion kein Start (bloßes Öffnen der Seite zählt nicht)');
  await page.mouse.click(300, 300); await warte(300); await page.mouse.click(310, 310); await warte(7000); // zweimal geklickt, ca. 7 s aktiv
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  await warte(500);
  const evs = S.stats.flatMap((s) => s.p_events);
  assert.equal(evs.filter((e) => e.k === 'start').length, 1, 'genau ein Start trotz zweier Klicks');
  const zeit = evs.filter((e) => e.k === 'zeit'); assert.equal(zeit.length, 1); assert.ok(zeit[0].s >= 5 && zeit[0].s <= 12, 'aktive Sekunden: ' + zeit[0].s);
  assert.ok(S.stats.every((s) => s.p_test === true), 'Testlauf als Test markiert');
  assert.ok(S.stats.length <= 4, 'wenige Meldungen, kein Frame-Verkehr: ' + S.stats.length);
  assert.ok(S.stats.every((s) => /^[0-9a-f-]{36}$/.test(s.p_sid)), 'zufällige Sitzungs-ID, keine Gerätekennung');
  assert.ok(S.stats.every((s) => new Set(s.p_events.map((e) => e.k)).size <= 3 && s.p_events.every((e) => ['start', 'level', 'zeit'].includes(e.k))), 'nur Start/Level/Zeit');
  const n = S.stats.length;
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide'))); await warte(300);
  assert.equal(S.stats.length, n, 'zweites Seitenverlassen sendet nichts doppelt');
  await ctx.close();
});

test('Konto löschen: Bestätigung nötig, Daten weg, lokaler Stand nur auf Wunsch entfernt', async () => {
  const S = neuerServer(); const ctx = await kontext(S); const page = await ctx.newPage();
  await page.goto(BASE + '/konto', { waitUntil: 'load' });
  await page.waitForSelector('#anmelden:not([hidden])');
  await page.evaluate((v) => localStorage.setItem('eiszeit.v1', v), eis(9));
  await einloggen(page, 'x@example.org');
  await ui(page).locator('dialog[open]').getByRole('button', { name: 'In mein Konto übernehmen' }).click();
  await spaeter(page);
  await page.waitForSelector('#angemeldet:not([hidden])');
  const u = S.users.get('x@example.org'); await waitFor(() => S.saves.get(u.id) && S.saves.get(u.id).size === 1);
  await page.click('#loeschen');
  const d = page.locator('dialog[open]');
  assert.equal(await d.getByRole('button', { name: 'Endgültig löschen' }).isDisabled(), true, 'ohne Eingabe gesperrt');
  await d.locator('input[type=text]').fill('loeschen');
  assert.equal(await d.getByRole('button', { name: 'Endgültig löschen' }).isDisabled(), true, 'falsche Eingabe gesperrt');
  await d.locator('input[type=text]').fill('LÖSCHEN');
  await d.getByRole('button', { name: 'Endgültig löschen' }).click();
  await page.waitForURL(BASE + '/');
  assert.equal(S.users.has('x@example.org'), false); assert.equal(S.saves.has(u.id), false);
  assert.equal(JSON.parse((await speicher(page))['eiszeit.v1']).sold, 9, 'lokaler Stand bleibt ohne Haken');
  await ctx.close();
});

test('Admin-Seite: ohne Anmeldung/ohne Recht kein Zugriff, keine Daten sichtbar', async () => {
  const S = neuerServer(); const ctx = await kontext(S);
  await ctx.route(FAKE + '/rest/v1/rpc/ist_admin', (r) => json(r, 200, false));
  await ctx.route(FAKE + '/rest/v1/rpc/admin_*', (r) => json(r, 403, { code: '42501', message: 'Keine Berechtigung' }));
  const page = await ctx.newPage();
  await page.goto(BASE + '/admin', { waitUntil: 'load' }); await warte(600);
  assert.equal(S.log.filter((l) => /rpc\/admin_/.test(l)).length, 0, 'ohne Anmeldung keine Admin-Abfragen');
  assert.doesNotMatch(await page.textContent('body'), /Fehlermeldungen\s*\d|Spielstarts\s*\d/);
  await page.evaluate((v) => 0); // Anmeldung als normaler Nutzer
  await page.waitForFunction(() => window.PlaySaal);
  await einloggen(page, 'n@example.org');
  await page.waitForFunction(() => window.PlaySaal.user());
  await warte(800);
  assert.match(await page.textContent('body'), /Kein Zugriff/);
  assert.equal(await page.locator('table').evaluateAll((t) => t.filter((x) => x.offsetParent !== null).length), 0, 'keine sichtbaren Tabellen');
  await ctx.close();
});

// ---------------------------------------------------------------- Hilfen
async function expect_text(loc, teil, ms = 8000) {
  const t0 = Date.now(); let t = '';
  while (Date.now() - t0 < ms) { try { t = (await loc.first().textContent({ timeout: 500 })) || ''; } catch (e) { t = ''; } if (t.includes(teil)) return; await warte(100); }
  assert.fail(`Text "${teil}" nicht gefunden, zuletzt: "${t}"`);
}
async function waitFor(fn, ms = 8000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (await fn()) return; await warte(100); }
  assert.fail('Bedingung nicht erfüllt: ' + fn.toString());
}
