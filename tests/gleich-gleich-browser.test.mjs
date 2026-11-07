// Gleich, gleich! – Browserprüfung: ganze Runden über die Oberfläche (allein, gegen Fiete, zu zweit),
// Level freischalten, Spielstand, Handy-Größen ohne Scrollen. Eigener kleiner Static-Server (wie Cloudflare: /pfad -> pfad.html).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, extname, normalize } from 'node:path';

const ROOT = new URL('../public/', import.meta.url).pathname;
function ladePlaywright() {
  const req = createRequire(import.meta.url);
  try { return req('playwright'); } catch (e) {}
  const g = execSync('npm root -g').toString().trim();
  try { return req(join(g, 'playwright')); } catch (e) {}
  return req('/opt/npm-tools/node_modules/playwright');
}
const { chromium } = ladePlaywright();
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.webp': 'image/webp', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };
let server, browser, base;

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
  try { browser = await chromium.launch(); } catch (e) {
    const dir = '/opt/pw-browsers', c = existsSync(dir) ? readdirSync(dir).filter((d) => d.startsWith('chromium-')).map((d) => join(dir, d, 'chrome-linux/chrome')).find(existsSync) : null;
    browser = await chromium.launch({ executablePath: c });
  }
});
after(async () => { await browser?.close(); server?.close(); });

async function open({ size = { width: 360, height: 640 }, save = null, query = '?schnell&seed=5' } = {}) {
  const ctx = await browser.newContext({ viewport: size, hasTouch: true, isMobile: true, reducedMotion: 'reduce' });
  await ctx.route('**/assets/playsaal*.js', (r) => r.fulfill({ contentType: 'application/javascript', body: '' }));
  if (save) await ctx.addInitScript((s) => { if (!sessionStorage.getItem('gesetzt')) { localStorage.setItem('gleichgleich.v1', s); sessionStorage.setItem('gesetzt', '1'); } }, JSON.stringify(save));
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('response', (r) => { if (r.status() >= 400) errors.push(r.status() + ' ' + r.url()); });
  await page.goto(base + '/spiele/gleich-gleich' + query);
  await page.waitForSelector('#btnPlay');
  return { ctx, page, errors };
}
const S = (page) => page.evaluate(() => JSON.parse(JSON.stringify(window.__gleich.state)));

// Spielt als Kind mit perfektem Wissen über die Oberfläche (tippt echte Karten an), bis der Dialog erscheint
async function spieleRunde(page) {
  for (let n = 0; n < 400; n++) {
    if (await page.locator('#ende[open]').count()) return;
    const st = await page.evaluate(() => ({ s: window.__gleich.state, busy: window.__gleich.busy }));
    const s = st.s;
    if (s.ende || st.busy || (s.modus === 'fiete' && s.dran === 1) || s.auf.length >= 2) { await page.waitForTimeout(25); continue; }
    let ziel;
    if (s.auf.length === 1) ziel = s.karten.findIndex((k, i) => i !== s.auf[0] && k.weg < 0 && k.m === s.karten[s.auf[0]].m);
    else ziel = s.karten.findIndex((k) => k.weg < 0 && !k.offen);
    await page.locator('.karte').nth(ziel).click();
    await page.waitForTimeout(10);
  }
  throw new Error('Runde endet nicht');
}

test('Allein: Level 1 durchspielen, 3 Sterne, Level 2 frei, Weiter startet Level 2', async () => {
  const { ctx, page, errors } = await open();
  await page.click('#btnPlay');
  assert.equal(await page.locator('.karte').count(), 6);
  // Bilder geladen
  const kaputt = await page.evaluate(async () => { const im = [...document.querySelectorAll('.karte img')]; await Promise.all(im.map((i) => i.decode().catch(() => {}))); return im.filter((i) => !i.naturalWidth).length; });
  assert.equal(kaputt, 0);
  await spieleRunde(page);
  await page.waitForSelector('#ende[open]');
  assert.match(await page.textContent('#endeTitel'), /Geschafft/);
  const save = await page.evaluate(() => JSON.parse(localStorage.getItem('gleichgleich.v1')));
  assert.equal(save.best[1], 3);
  await page.click('#btnWeiter');
  assert.equal((await S(page)).level, 2);
  assert.equal(await page.locator('.karte').count(), 8);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('Zwei Karten daneben werden wieder zugedeckt, eine dritte Karte geht solange nicht', async () => {
  const { ctx, page, errors } = await open();
  await page.click('#btnPlay');
  const s = await S(page);
  const a = 0, b = s.karten.findIndex((k) => k.m !== s.karten[0].m), c = s.karten.findIndex((k, i) => i !== a && i !== b);
  await page.locator('.karte').nth(a).click();
  await page.locator('.karte').nth(b).click();
  await page.locator('.karte').nth(c).click({ force: true });
  assert.equal((await S(page)).karten.filter((k) => k.offen).length, 2);
  await page.waitForFunction(() => window.__gleich.state.karten.every((k) => !k.offen) && !window.__gleich.busy);
  assert.equal((await S(page)).fehl[0], 1);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('Gegen Fiete: Fiete spielt selbst, Runde endet mit Ergebnis, Sterne gespeichert', async () => {
  const { ctx, page, errors } = await open();
  await page.click('.modus[data-modus="fiete"]');
  await page.click('#btnLevels');
  await page.locator('.lvbtn[data-level="1"]').click();
  // absichtlich daneben, damit Fiete drankommt
  const s0 = await S(page);
  await page.locator('.karte').nth(0).click();
  await page.locator('.karte').nth(s0.karten.findIndex((k) => k.m !== s0.karten[0].m)).click();
  await page.waitForFunction(() => window.__gleich.state.dran === 1);
  await page.waitForFunction(() => window.__gleich.state.zuege >= 2 || window.__gleich.state.ende, null, { timeout: 5000 });
  await spieleRunde(page);
  await page.waitForSelector('#ende[open]');
  const s = await S(page);
  assert.equal(s.paare[0] + s.paare[1], 3);
  assert.match(await page.textContent('#endeTitel'), /gewinn|Unentschieden/);
  const save = await page.evaluate(() => JSON.parse(localStorage.getItem('gleichgleich.v1')));
  assert.equal(save.modus, 'fiete'); assert.ok(save.best[1] >= 1);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('Zu zweit: Spieler wechseln, keine Sterne', async () => {
  const { ctx, page, errors } = await open();
  await page.click('.modus[data-modus="zwei"]');
  await page.click('#btnPlay');
  assert.equal(await page.textContent('#wer1'), 'Spieler 2');
  await spieleRunde(page);
  await page.waitForSelector('#ende[open]');
  assert.equal(await page.locator('#endeSterne').isHidden(), true);
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('gleichgleich.v1')).best), {});
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('Levelauswahl: gesperrt bis zum vorherigen Level, kaputter Spielstand stört nicht', async () => {
  const { ctx, page, errors } = await open({ save: { best: { 1: 2, 2: 3, 5: 9 }, modus: 'allein' } });
  await page.click('#btnLevels');
  assert.equal(await page.locator('.lvbtn[data-level="3"]').isDisabled(), false);
  assert.equal(await page.locator('.lvbtn[data-level="4"]').isDisabled(), true);
  assert.match(await page.textContent('#sternSumme'), /^5 von 63/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('16 Karten passen ohne Scrollen auf kleine und große Geräte, Karten groß genug', async () => {
  const best = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [i + 1, 3]));
  for (const size of [{ width: 320, height: 568 }, { width: 360, height: 640 }, { width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1280, height: 720 }]) {
    const { ctx, page, errors } = await open({ size, save: { best } });
    await page.evaluate(() => window.__gleich.start(21));
    await page.waitForTimeout(60);
    const r = await page.evaluate(() => {
      const ks = [...document.querySelectorAll('.karte')].map((k) => k.getBoundingClientRect());
      return { n: ks.length, w: Math.min(...ks.map((k) => k.width)), unten: Math.max(...ks.map((k) => k.bottom)), rechts: Math.max(...ks.map((k) => k.right)), links: Math.min(...ks.map((k) => k.left)), vh: innerHeight, vw: innerWidth, scroll: document.scrollingElement.scrollHeight > innerHeight };
    });
    assert.equal(r.n, 16);
    assert.ok(r.unten <= r.vh && r.rechts <= r.vw && r.links >= 0 && !r.scroll, JSON.stringify({ size, r }));
    assert.ok(r.w >= 58, 'Karten zu klein: ' + JSON.stringify({ size, w: r.w }));
    assert.deepEqual(errors, []);
    await ctx.close();
  }
});
