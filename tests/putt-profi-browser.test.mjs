// Putt-Profi – Browserprüfung: Laden der Kenney-Modelle ohne Fehler, Zurückziehen und Loslassen mit dem Finger,
// Bahn einlochen mit Sternen, Spielstand nach Neuladen, ganze Tagesrunde mit Auswertung, Bahnen-Auswahl, Handy-Layout.
// Eigener kleiner Static-Server (wie Cloudflare: /pfad -> pfad.html). node --test --test-concurrency=1 tests/putt-profi-browser.test.mjs
import { test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as L from '../public/spiele/putt-profi/logik.js';

const ROOT = fileURLToPath(new URL('../public/', import.meta.url));
const LOES = JSON.parse(readFileSync(new URL('./putt-profi-loesungen.json', import.meta.url))).loesungen;
function ladePlaywright() {
  const req = createRequire(import.meta.url);
  try { return req('playwright'); } catch (e) {}
  try { return req(join(execSync('npm root -g').toString().trim(), 'playwright')); } catch (e) {}
  return req('/opt/npm-tools/node_modules/playwright');
}
const { chromium } = ladePlaywright();
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.glb': 'model/gltf-binary', '.webp': 'image/webp', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.svg': 'image/svg+xml', '.png': 'image/png', '.mp3': 'audio/mpeg' };
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
  browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
});
after(async () => { await browser?.close(); server?.close(); });
afterEach(async () => { while (offen.length) await offen.pop().close().catch(() => {}); });

async function open({ size = { width: 390, height: 844 }, mobil = true, save = null, query = '' } = {}) {
  const ctx = await browser.newContext({ viewport: size, hasTouch: mobil, isMobile: mobil });
  offen.push(ctx);
  await ctx.route('**/assets/playsaal*.js', (r) => r.fulfill({ contentType: 'application/javascript', body: '' }));
  if (save) await ctx.addInitScript((s) => { if (!sessionStorage.getItem('gesetzt')) { localStorage.setItem('puttprofi.v1', s); sessionStorage.setItem('gesetzt', '1'); } }, JSON.stringify(save));
  const page = await ctx.newPage(); const errors = [], glb = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('response', (r) => { if (r.status() >= 400) errors.push(r.status() + ' ' + r.url()); if (r.url().includes('.glb')) glb.push(r.status()); });
  await page.goto(`${base}/spiele/putt-profi?test${query}`);
  await page.waitForFunction(() => window.__putt && window.__putt.zustand() === 'menu', null, { timeout: 60000 });
  return { ctx, page, errors, glb };
}
const T = (page, expr, arg) => page.evaluate(expr, arg);
const warte = (page, fn, arg, ms = 30000) => page.waitForFunction(fn, arg, { timeout: ms });
const zielen = (page) => warte(page, () => window.__putt.zustand() === 'zielen');
async function spieleLoesung(page, text) {
  for (const s of L.dekodiere(text)[0]) {
    await zielen(page);
    await T(page, (e) => window.__putt.schiesse(e), s);
    await warte(page, () => window.__putt.zustand() !== 'rollen', null, 30000);
  }
}

test('Laden: alle Modelle ohne Fehler, Menü ohne Querscrollen, Bälle und Ton', async () => {
  const { page, errors, glb } = await open();
  assert.equal(glb.length, 36); assert.ok(glb.every((s) => s === 200));
  assert.equal(await T(page, () => document.documentElement.scrollWidth <= innerWidth), true);
  assert.equal(await page.locator('#mBaelle button').count(), 4);
  assert.equal(await page.locator('#mBaelle button:disabled').count(), 3);
  await page.click('#mTon'); assert.equal(await page.textContent('#mTon'), 'Ton: aus');
  assert.deepEqual(errors, []);
});

test('Finger zurückziehen und loslassen schlägt die Kugel in Gegenrichtung', async () => {
  const { page, errors } = await open();
  await T(page, () => window.__putt.starteUebung(0));
  await zielen(page);
  await page.mouse.move(195, 500); await page.mouse.down(); await page.mouse.move(195, 560, { steps: 4 });
  assert.equal(await page.isVisible('#staerke'), true);
  await page.mouse.up();
  assert.equal(await T(page, () => window.__putt.zustand()), 'rollen');
  await warte(page, () => window.__putt.zustand() === 'zielen');
  const b = await T(page, () => window.__putt.ball());
  assert.equal(b.schlaege, 1); assert.ok(b.z < 4.9, 'Kugel ist nach vorn (Norden) gerollt: ' + b.z); assert.ok(Math.abs(b.x) < 0.2);
  // kurzes Antippen schlägt nicht
  await page.mouse.move(195, 500); await page.mouse.down(); await page.mouse.up();
  assert.equal(await T(page, () => window.__putt.ball().schlaege), 1);
  assert.deepEqual(errors, []);
});

test('Bahn einlochen: Karte mit Sternen, Bestleistung bleibt nach Neuladen, nächste Bahn frei', async () => {
  const { page, errors } = await open();
  await T(page, () => window.__putt.starteUebung(0));
  await spieleLoesung(page, LOES['0']);
  await warte(page, () => !document.getElementById('loch').hidden);
  assert.equal(await page.textContent('#lTitel'), 'Hole-in-one!');
  assert.equal(await page.locator('#lSterne span.an').count(), 3);
  await page.reload();
  await page.waitForFunction(() => window.__putt && window.__putt.zustand() === 'menu');
  assert.deepEqual(await T(page, () => window.__putt.stand().bahnen), { 0: 1 });
  assert.equal(await page.textContent('#mSterne'), '3');
  await page.click('#mBahnen');
  assert.equal(await page.locator('#bListe button').count(), 18);
  assert.equal(await page.locator('#bPlaetze button').count(), 9);
  await page.locator('#bPlaetze button').nth(1).click();
  assert.equal(await page.locator('#bListe button:not([disabled])').count(), 0, 'Platz 2 noch gesperrt');
  await page.locator('#bPlaetze button').nth(0).click();
  assert.equal(await page.locator('#bListe button:not([disabled])').count(), 2);
  await page.locator('#bListe button').nth(1).click();
  await zielen(page);
  assert.equal(await T(page, () => window.__putt.bahn().nr), 1);
  assert.deepEqual(errors, []);
});

test('ganze Tagesrunde: 5 Bahnen, Auswertung mit Schlägen und Par, Tagesbestwert gespeichert', async () => {
  const seed = 20261102, plan = L.tagesRunde(seed);
  const { page, errors } = await open({ query: '&seed=' + seed });
  await page.click('#mRunde');
  for (let i = 0; i < 5; i++) {
    await zielen(page);
    assert.equal(await page.textContent('#hBahn'), `Bahn ${i + 1}/5`);
    await spieleLoesung(page, LOES[plan[i].nr + (plan[i].spiegel ? 's' : '')]);
    await warte(page, () => !document.getElementById('loch').hidden);
    await page.click('#lWeiter');
  }
  await warte(page, () => !document.getElementById('ende').hidden);
  const erwartet = L.pruefeRunde(seed, plan.map((p) => LOES[p.nr + (p.spiegel ? 's' : '')]).join('|'));
  assert.equal(await page.textContent('#eSchlaege'), String(erwartet.schlaege));
  assert.equal(await page.textContent('#ePar'), String(erwartet.par));
  assert.equal(await page.locator('#eBahnen div').count(), 5);
  assert.equal(await T(page, () => window.__putt.stand().tagBest), erwartet.schlaege);
  assert.match(await page.textContent('#eRekord'), /Tagesbestwert/);
  // die aufgezeichneten Schläge ergeben beim Nachspielen dieselbe Zahl (wie auf dem Server)
  const text = await T(page, () => window.__putt.runde().eingaben.map((b) => b.map((s) => `${s.dx},${s.dz},${s.p},${s.ph}`).join(';')).join('|'));
  assert.equal(L.pruefeRunde(seed, text).schlaege, erwartet.schlaege);
  assert.deepEqual(errors, []);
});

test('Herausforderungs-Link zeigt Bahn und Schläge, Pause und Menü', async () => {
  const { page, errors } = await open({ query: '&b=7&s=2' });
  assert.equal(await page.isVisible('#mHerausforderung'), true);
  assert.match(await page.textContent('#mHText'), /Bahn 7 „Burgtor“ in 2 Schlägen/);
  await page.click('#mHLos'); await zielen(page);
  assert.equal(await T(page, () => window.__putt.bahn().nr), 6);
  await page.click('#bPause'); assert.equal(await page.isVisible('#pause'), true);
  await page.click('#pMenu'); assert.equal(await T(page, () => window.__putt.zustand()), 'menu');
  assert.deepEqual(errors, []);
});

test('Querformat am Rechner: alles sichtbar, Maus zieht', async () => {
  const { page, errors } = await open({ size: { width: 1280, height: 720 }, mobil: false });
  await T(page, () => window.__putt.starteUebung(0)); await zielen(page);
  await page.mouse.move(640, 300); await page.mouse.down(); await page.mouse.move(640, 380, { steps: 4 }); await page.mouse.up();
  await warte(page, () => window.__putt.zustand() === 'zielen');
  assert.equal(await T(page, () => window.__putt.ball().schlaege), 1);
  assert.deepEqual(errors, []);
});
