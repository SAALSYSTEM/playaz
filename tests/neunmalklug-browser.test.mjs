// Neunmalklug – Browserprüfung: freies Spiel mit Fingertipps lösen, Notizen/Konflikte/Rückgängig, Fortsetzen nach Neuladen,
// Tagesrätsel mit (nachgebautem) Server samt Meldung ohne Zeit vom Browser, "schon gelöst", Herausforderungslink, Handy-Layout.
// Eigener kleiner Static-Server (wie Cloudflare: /pfad -> pfad.html). node --test --test-concurrency=1 tests/neunmalklug-browser.test.mjs
import { test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tagesRaetsel, baueRaetsel } from '../public/spiele/neunmalklug/sim.js';

const ROOT = fileURLToPath(new URL('../public/', import.meta.url));
function ladePlaywright() {
  const req = createRequire(import.meta.url);
  try { return req('playwright'); } catch (e) {}
  try { return req(join(execSync('npm root -g').toString().trim(), 'playwright')); } catch (e) {}
  return req('/opt/npm-tools/node_modules/playwright');
}
const { chromium } = ladePlaywright();
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webmanifest': 'application/manifest+json' };
let server, browser, base;
const offen = [];

before(async () => {
  server = createServer((req, res) => {
    const p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
    let f = join(ROOT, p);
    if (existsSync(f + '.html') && (!existsSync(f) || statSync(f).isDirectory())) f += '.html';
    if (!f.startsWith(ROOT) || !existsSync(f) || statSync(f).isDirectory()) { res.statusCode = 404; return res.end(); }
    res.setHeader('content-type', MIME[extname(f)] || 'application/octet-stream'); res.end(readFileSync(f));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch();
});
after(async () => { await browser?.close(); server?.close(); });
afterEach(async () => { while (offen.length) await offen.pop().close().catch(() => {}); });

const SEED = 4711;
// Nachgebauter PlaySaal-Server: angemeldet, Tagesrätsel mit festem Seed; "geloest" schaltet auf "schon gelöst"
const FAKE = (tag, geloest) => `window.PLAYSAAL_CFG = { url: 'https://x.supabase.co', key: 'k' };
window.__rpc = [];
window.PlaySaal = { online: true, avatare: ['🦊','🐻','🐼','🦉','🐸'], hatSitzung: () => true, token: () => 'tok',
  rpc: async (name, args) => { window.__rpc.push(name);
    if (name === 'neunmalklug_start') return { daten: ${geloest} ? { ok: false, grund: 'schon_geloest', tag: '${tag}', zeit_cs: 31234, rang: { platz: 2, spieler: 5 } } : { ok: true, run_id: '22222222-2222-4222-8222-222222222222', tag: '${tag}', seed: ${SEED}, version: 1, sek: 30 } };
    if (name === 'neunmalklug_rangliste') return { daten: { tag: '${tag}', spieler: 1, ich: null, zeilen: [{ pos: 1, platz: 1, name: 'Testi', avatar: 'a2', zeit_cs: 31234, ich: true }] } };
    if (name === 'neunmalklug_tage_liste') return { daten: ['${tag}'] };
    return { fehler: true }; } };`;

function heute() {
  const p = new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const g = (t) => p.find((x) => x.type === t).value; return g('year') + g('month') + g('day');
}

async function open({ size = { width: 390, height: 844 }, query = '', server: srv = null, geloest = false } = {}) {
  const ctx = await browser.newContext({ viewport: size, hasTouch: true, isMobile: true });
  offen.push(ctx);
  await ctx.route('**/assets/playsaal-config.js', (r) => r.fulfill({ contentType: 'application/javascript', body: srv ? FAKE(heute(), geloest) : '' }));
  await ctx.route('**/assets/playsaal.js', (r) => r.fulfill({ contentType: 'application/javascript', body: '' }));
  const meldungen = [];
  await ctx.route('https://x.supabase.co/functions/v1/neunmalklug-lauf', async (r) => { meldungen.push(JSON.parse(r.request().postData())); await r.fulfill({ contentType: 'application/json', body: JSON.stringify({ verifiziert: true, zeit_cs: 34567, tag: heute(), rang: { platz: 1, spieler: 3 } }) }); });
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('response', (r) => { if (r.status() >= 400 && !/\.(png|ico)$|nk-hintergrund/.test(r.url())) errors.push(r.status() + ' ' + r.url()); });
  await page.goto(`${base}/spiele/neunmalklug${query}`);
  await page.waitForFunction(() => window.__nk && document.querySelectorAll('#feld .z').length === 81);
  return { ctx, page, errors, meldungen };
}
const tippe = async (page, sel) => { const b = await page.locator(sel).boundingBox(); await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2); };
const zelle = (i) => `#feld .z:nth-child(${i + 1})`;
const ziffer = (k) => `#pad .p:nth-child(${k})`;

test('Freies Spiel: Stufe wählen, mit Fingertipps lösen, Ergebnis und Statistik', async () => {
  const { page, errors } = await open();
  await tippe(page, '#bFrei');
  await tippe(page, '#sGitter .btn:nth-child(1)');
  await page.waitForFunction(() => window.__nk.zustand === 'spiel');
  const r = await page.evaluate(() => ({ raetsel: window.__nk.raetsel.raetsel, loesung: window.__nk.raetsel.loesung, stufe: window.__nk.raetsel.stufe }));
  assert.equal(r.stufe, 'leicht');
  // Vorgabe lässt sich nicht ändern
  const vg = r.raetsel.findIndex(Boolean);
  await tippe(page, zelle(vg)); await tippe(page, ziffer(r.raetsel[vg] === 9 ? 1 : 9));
  assert.equal(await page.evaluate((i) => window.__nk.gitter[i], vg), r.raetsel[vg]);
  for (let i = 0; i < 81; i++) if (!r.raetsel[i]) { await tippe(page, zelle(i)); await tippe(page, ziffer(r.loesung[i])); }
  await page.waitForFunction(() => window.__nk.zustand === 'ende', null, { timeout: 10000 });
  assert.equal(await page.locator('#eKopf').textContent(), 'Neunmalklug!');
  assert.match(await page.locator('#eModus').textContent(), /Freies Spiel · Leicht/);
  const st = await page.evaluate(() => window.__nk.store());
  assert.equal(st.stats.leicht.n, 1); assert.ok(st.stats.leicht.z > 0); assert.equal(st.frei, null);
  assert.deepEqual(errors, []);
});

test('Notizen, Konflikte, Löschen, Rückgängig, Tipp; Fortsetzen nach Neuladen', async () => {
  const { page, errors } = await open();
  await page.evaluate(() => window.__nk.starteFrei('mittel', 99));
  const r = baueRaetsel(99, 'mittel');
  const leer = r.raetsel.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0);
  const a = leer[0];
  // Notizen
  await tippe(page, '#bNotiz'); await tippe(page, zelle(a)); await tippe(page, ziffer(3)); await tippe(page, ziffer(7));
  assert.equal(await page.locator(zelle(a) + ' .no i.x').count(), 2);
  await tippe(page, '#bNotiz');
  // Konflikt: eine Ziffer, die schon in derselben Zeile vorgegeben ist
  const zeile = Math.floor(a / 9), doppelt = r.raetsel.slice(zeile * 9, zeile * 9 + 9).find(Boolean);
  await tippe(page, ziffer(doppelt));
  assert.ok(await page.locator(zelle(a)).evaluate((e) => e.classList.contains('kf')), 'Konflikt rot');
  assert.equal(await page.locator(zelle(a) + ' .no.an').count(), 0, 'Ziffer ersetzt Notizen');
  await tippe(page, '#bZurueck');
  assert.equal(await page.evaluate((i) => window.__nk.gitter[i], a), 0);
  assert.equal(await page.locator(zelle(a) + ' .no i.x').count(), 2, 'Rückgängig bringt Notizen zurück');
  await tippe(page, '#bLoesch');
  assert.equal(await page.locator(zelle(a) + ' .no.an').count(), 0);
  // Tipp füllt das gewählte Feld richtig
  await tippe(page, '#bTipp');
  assert.equal(await page.evaluate((i) => window.__nk.gitter[i], a), r.loesung[a]);
  const b = leer[1]; await tippe(page, zelle(b)); await tippe(page, ziffer(r.loesung[b]));
  await page.waitForTimeout(300);
  // Neuladen: freies Spiel geht weiter
  await page.reload(); await page.waitForFunction(() => window.__nk && document.querySelectorAll('#feld .z').length === 81);
  assert.match(await page.locator('#bFrei').textContent(), /Weiterspielen · Mittel/);
  await tippe(page, '#bFrei');
  await page.waitForFunction(() => window.__nk.zustand === 'spiel');
  const g = await page.evaluate(() => window.__nk.gitter);
  assert.equal(g[a], r.loesung[a]); assert.equal(g[b], r.loesung[b]);
  assert.deepEqual(errors, []);
});

test('Tagesrätsel mit Konto: Rätsel aus Server-Seed, Uhr läuft weiter, Lösung ohne Zeit gemeldet, Platz angezeigt', async () => {
  const { page, errors, meldungen } = await open({ server: true });
  await tippe(page, '#bTag');
  await page.waitForFunction(() => !document.getElementById('sBereit').hidden);
  await tippe(page, '#bLos');
  await page.waitForFunction(() => window.__nk.zustand === 'spiel');
  const t = tagesRaetsel(SEED, 1, heute());
  assert.deepEqual(await page.evaluate(() => window.__nk.raetsel.raetsel), t.raetsel);
  assert.ok(await page.locator('#bTipp').isHidden(), 'kein Tipp im Tagesrätsel');
  assert.match(await page.locator('#hZeit').textContent(), /^0:3\d$/, 'Uhr startet bei der Serverzeit');
  const leer = t.raetsel.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0);
  for (const i of leer.slice(0, 3)) { await tippe(page, zelle(i)); await tippe(page, ziffer(t.loesung[i])); }
  // Neuladen setzt fort
  await page.reload(); await page.waitForFunction(() => window.__nk && document.querySelectorAll('#feld .z').length === 81);
  assert.match(await page.locator('#bTag').textContent(), /fortsetzen/);
  await tippe(page, '#bTag'); await tippe(page, '#bLos');
  await page.waitForFunction(() => window.__nk.zustand === 'spiel');
  for (const i of leer.slice(0, 3)) assert.equal(await page.evaluate((x) => window.__nk.gitter[x], i), t.loesung[i]);
  for (const i of leer.slice(3)) await page.evaluate(([x, v]) => { window.__nk.waehle(x); window.__nk.eingabe(v); }, [i, t.loesung[i]]);
  await page.waitForFunction(() => /Platz 1 von 3/.test(document.getElementById('eStatus').textContent), null, { timeout: 10000 });
  assert.equal(meldungen.length, 1);
  assert.deepEqual(Object.keys(meldungen[0]).sort(), ['loesung', 'run_id']);
  assert.equal(meldungen[0].loesung, t.loesung.join(''));
  assert.equal(await page.locator('#eZeit').textContent(), '5:45,67', 'Serverzeit wird angezeigt');
  assert.equal(await page.locator('#eK1').textContent(), '1/3');
  // Rangliste
  await tippe(page, '#bRang2');
  await page.waitForFunction(() => document.querySelectorAll('#rListe li').length === 1);
  assert.match(await page.locator('#rListe').textContent(), /Testi \(du\).*5:12,34/);
  assert.deepEqual(errors, []);
});

test('Tagesrätsel schon gelöst: nur das Ergebnis; Herausforderungslink startet dasselbe Rätsel', async () => {
  const { page, errors } = await open({ server: true, geloest: true });
  await tippe(page, '#bTag'); await tippe(page, '#bLos');
  await page.waitForFunction(() => window.__nk.zustand === 'ende');
  assert.equal(await page.locator('#eKopf').textContent(), 'Heute schon gelöst');
  assert.equal(await page.locator('#eK1').textContent(), '2/5');
  const z = await open({ query: '?s=schwer&n=123&t=5000' });
  await z.page.waitForFunction(() => window.__nk.zustand === 'spiel');
  assert.deepEqual(await z.page.evaluate(() => window.__nk.raetsel.raetsel), baueRaetsel(123, 'schwer').raetsel);
  assert.match(await z.page.locator('#hinweis').textContent(), /schneller als 0:50/);
  assert.deepEqual(errors, []); assert.deepEqual(z.errors, []);
});

for (const [w, h] of [[390, 844], [360, 640], [430, 932]]) {
  test(`Handy ${w}×${h}: Brett, Werkzeuge und Ziffern ganz sichtbar, nichts überlappt, kein Überlauf`, async () => {
    const { page, errors } = await open({ size: { width: w, height: h } });
    await page.evaluate(() => window.__nk.starteFrei('experte', 5));
    await page.waitForTimeout(100);
    const m = await page.evaluate(() => {
      const r = (s) => document.querySelector(s).getBoundingClientRect();
      return { feld: r('#feld'), werk: r('#werkzeuge'), pad: r('#pad'), kopf: r('#kopf'), p1: r('#pad .p'), z: r('#feld .z'), sw: document.documentElement.scrollWidth };
    });
    assert.ok(m.sw <= w, 'kein waagerechter Überlauf');
    assert.ok(m.feld.left >= 0 && m.feld.right <= w && m.feld.top >= m.kopf.bottom, 'Brett im Bild');
    assert.ok(m.feld.bottom <= m.werk.top + 1, 'Brett über den Werkzeugen');
    assert.ok(m.pad.bottom <= h, 'Ziffernleiste im Bild');
    assert.ok(m.z.width >= 32, 'Felder groß genug zum Tippen: ' + m.z.width);
    assert.ok(m.p1.height >= 42 && m.p1.width >= 32, 'Ziffernknöpfe groß genug');
    if (w === 390) await page.screenshot({ path: process.env.NK_SCREENSHOT || '/dev/null' });
    assert.deepEqual(errors, []);
  });
}
