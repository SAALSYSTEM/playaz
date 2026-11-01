// ROULETTE – Browserprüfung (nur dieses Spiel): Layout 320–1280 px, jedes Wettfeld lässt sich genau dort antippen, wo sein Jeton liegt,
// Setzen/Zurück/Leeren/Limits, Drehen mit fester Zahl, Nochmal/Doppelt, Kesselwetten, Auffüllen, Tagesbonus, gemeinsamer Stand mit Rocket Reels.
// node --test --test-concurrency=1 tests/roulette-browser.test.mjs
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, extname, normalize } from 'node:path';
import * as R from '../public/spiele/roulette/roulette.js';
import * as E from '../public/spiele/rocket-reels/engine.js';

const ROOT = new URL('../public/', import.meta.url).pathname;
function ladePlaywright() {
  const req = createRequire(import.meta.url);
  try { return req('playwright'); } catch (e) {}
  const g = execSync('npm root -g').toString().trim();
  try { return req(join(g, 'playwright')); } catch (e) {}
  return req('/opt/npm-tools/node_modules/playwright');
}
const { chromium } = ladePlaywright();
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };
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

async function open({ size = { width: 360, height: 640 }, gast = null, query = '?test' } = {}) {
  const ctx = await browser.newContext({ viewport: size, hasTouch: true, isMobile: size.width < 700 });
  await ctx.route('**/assets/playsaal*.js', (r) => r.fulfill({ contentType: 'application/javascript', body: '' }));
  if (gast) await ctx.addInitScript((s) => { if (!sessionStorage.getItem('gesetzt')) { localStorage.setItem('rocketreels-gast.v1', s); sessionStorage.setItem('gesetzt', '1'); } }, JSON.stringify(gast));
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('response', (r) => { if (r.status() >= 400) errors.push(r.status() + ' ' + r.url()); });
  await page.goto(base + '/spiele/roulette' + query);
  await page.waitForFunction(() => document.querySelector('#laden').hidden);
  return { ctx, page, errors };
}
const st = (page) => page.evaluate(() => ({ z: window.__roulette.zustand, w: window.__roulette.wetten, phase: window.__roulette.phase, busy: window.__roulette.beschaeftigt }));
async function tippe(page, key) { const p = await page.evaluate((k) => window.__roulette.punkt(k), key); await page.mouse.click(p.x, p.y); }
const bereit = (page) => page.waitForFunction(() => !window.__roulette.beschaeftigt && window.__roulette.phase === 'ergebnis');

test('Layout: alles sichtbar, kein Überlauf, keine Fehler (320–1280 px)', async () => {
  for (const size of [{ width: 320, height: 568 }, { width: 360, height: 640 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1280, height: 800 }]) {
    const { ctx, page, errors } = await open({ size });
    const m = await page.evaluate(() => {
      const r = (s) => document.querySelector(s).getBoundingClientRect();
      const ids = ['#tisch', '#bDreh', '#bKessel', '#bZurueck', '.jetons button[data-j="500"]', '#bCoins'];
      return { sw: document.documentElement.scrollWidth, vw: innerWidth, vh: innerHeight, rects: ids.map((i) => [i, r(i).left, r(i).right, r(i).top, r(i).bottom]), dreh: r('#bDreh'), j500: r('.jetons button[data-j="500"]') };
    });
    assert.ok(m.sw <= m.vw, size.width + ': kein waagrechter Überlauf');
    if (size.height >= 568) for (const [id, l, rr, t, b] of m.rects) assert.ok(l >= -1 && rr <= m.vw + 1 && t >= -1 && b <= m.vh + 1, size.width + 'x' + size.height + ': ' + id + ' sichtbar');
    assert.ok(m.j500.right <= m.dreh.left + 1, size.width + ': Jetons überlappen den Dreh-Knopf nicht');
    assert.deepEqual(errors, []);
    await ctx.close();
  }
});

test('Jedes der 157 Wettfelder ist genau an seinem Jeton-Ort antippbar', async () => {
  for (const size of [{ width: 320, height: 568 }, { width: 390, height: 844 }]) {
    const { ctx, page } = await open({ size });
    const falsch = await page.evaluate((keys) => keys.filter((k) => { const p = window.__roulette.punkt(k); return window.__roulette.treffer(p.x, p.y) !== k; }), [...R.WETTEN.keys()]);
    assert.deepEqual(falsch, [], size.width + ' px');
    await ctx.close();
  }
});

test('Setzen, Zurück, Leeren, Feldlimit', async () => {
  const { ctx, page, errors } = await open();
  await tippe(page, '17'); await tippe(page, '17'); await tippe(page, 'rot');
  let s = await st(page);
  assert.deepEqual(s.w, { '17': 10, rot: 5 });
  assert.equal(await page.textContent('#hCoins'), '985');
  await page.click('#bZurueck'); s = await st(page); assert.deepEqual(s.w, { '17': 10 });
  await page.click('.jetons button[data-j="500"]');
  await tippe(page, '17'); s = await st(page); assert.equal(s.w['17'], 500, 'auf das Feldlimit gekappt');
  await tippe(page, '17'); s = await st(page); assert.equal(s.w['17'], 500);
  assert.match(await page.textContent('#toast'), /Tischlimit/);
  await page.click('#bLeeren'); s = await st(page); assert.deepEqual(s.w, {});
  await page.click('#bZurueck'); s = await st(page); assert.deepEqual(s.w, { '17': 500 }, 'Leeren lässt sich zurücknehmen');
  // langes Drücken nimmt den Stapel weg
  const p = await page.evaluate(() => window.__roulette.punkt('17'));
  await page.mouse.move(p.x, p.y); await page.mouse.down(); await page.waitForTimeout(700); await page.mouse.up();
  s = await st(page); assert.deepEqual(s.w, {});
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('Drehen mit fester Zahl: Kugel, Auszahlung, Permanenz, Nochmal, Doppelt; Stand für Rocket Reels gültig', async () => {
  const { ctx, page, errors } = await open({ query: '?test&folge=17,0,17' });
  await tippe(page, '17'); await tippe(page, '17-20'); await tippe(page, 'rot'); await tippe(page, 'd2');
  await page.click('#bDreh'); await bereit(page);
  let s = await st(page);
  assert.deepEqual(s.z.roulette.perm, [17]);
  assert.equal(s.z.coins, 1000 - 20 + 180 + 90 + 15);
  assert.deepEqual(s.w, {});
  assert.equal(await page.textContent('#hCoins'), '1.265');
  assert.equal((await page.textContent('#drehText')).trim(), 'Nochmal');
  const gespeichert = JSON.parse(await page.evaluate(() => localStorage.getItem('rocketreels-gast.v1')));
  assert.ok(E.pruefeZustand(gespeichert), 'Rocket Reels akzeptiert den gemeinsamen Stand');
  assert.equal(gespeichert.coins, 1265);
  // Nochmal + Drehen mit einem Tipp: Null fällt, alles verloren
  await page.click('#bDreh'); await bereit(page);
  s = await st(page); assert.equal(s.z.coins, 1245); assert.deepEqual(s.z.roulette.perm, [0, 17]);
  // Doppelt nach der Runde = letzte Einsätze ×2
  await page.click('#bDoppelt'); s = await st(page);
  assert.deepEqual(s.w, { '17': 10, '17-20': 10, rot: 10, d2: 10 });
  await page.click('#bDreh'); await bereit(page);
  s = await st(page); assert.equal(s.z.coins, 1245 - 40 + 360 + 180 + 30);
  // Neuladen: Stand bleibt
  await page.reload(); await page.waitForFunction(() => document.querySelector('#laden').hidden);
  s = await st(page); assert.equal(s.z.coins, 1775); assert.equal(await page.locator('#perm li').count(), 3);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('Kesselwetten und Nachbarn setzen die richtigen Felder', async () => {
  const { ctx, page } = await open();
  await page.click('.jetons button[data-j="1"]');
  await page.click('#bKessel'); await page.click('.ann[data-a="voisins"]');
  let s = await st(page);
  assert.deepEqual(s.w, Object.fromEntries(R.ANNONCEN.voisins.felder));
  await page.click('#bZurueck'); s = await st(page); assert.deepEqual(s.w, {}, 'eine Kesselwette = ein Zurück');
  await page.click('#bKessel'); await page.click('#nachbarn button:nth-child(1)'); // Null
  s = await st(page); assert.deepEqual(Object.keys(s.w).sort(), ['0', '15', '26', '3', '32']);
  await ctx.close();
});

test('Auffüllen bei unter 10 Coins, Tagesbonus, offener Rocket-Reels-Gewinn', async () => {
  const gast = E.neuerZustand(); gast.coins = 4; gast.tagesbonus = '2000-01-01';
  const { ctx, page, errors } = await open({ gast });
  assert.equal((await page.textContent('#drehText')).trim(), 'Auffüllen');
  await page.click('#bDreh'); await page.waitForFunction(() => window.__roulette.zustand.coins === 1000);
  await page.click('#bTages'); await page.waitForFunction(() => window.__roulette.zustand.coins === 1100);
  assert.ok(await page.isHidden('#bTages'));
  await ctx.close();
  const g2 = E.neuerZustand(); g2.phase = 'gewinn'; g2.offen = 80;
  const b = await open({ gast: g2 });
  assert.ok(await b.page.isVisible('#rrHinweis'));
  await b.page.click('#rrHinweis button'); await b.page.waitForFunction(() => window.__roulette.zustand.coins === 1080);
  assert.ok(await b.page.isHidden('#rrHinweis'));
  assert.deepEqual([...errors, ...b.errors], []);
  await b.ctx.close();
});
