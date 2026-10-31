// Tiertrumpf – Browserprüfung: ganze Runden über die Oberfläche (alle Stufen, Handy klein), Doppeltipp,
// Fortsetzen nach Neuladen, Hintergrundwechsel, viele Handkarten. Eigener kleiner Static-Server (wie Cloudflare: /pfad -> pfad.html).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, extname, normalize } from 'node:path';
import * as E from '../public/spiele/tiertrumpf/engine.js';

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

async function open({ size = { width: 360, height: 640 }, save = null, motion = 'reduce', query = '?schnell' } = {}) {
  const ctx = await browser.newContext({ viewport: size, hasTouch: true, isMobile: true, reducedMotion: motion });
  // Plattform-Skripte (Konto, Statistik) sind für diese Prüfung nicht nötig
  await ctx.route('**/assets/playsaal*.js', (r) => r.fulfill({ contentType: 'application/javascript', body: '' }));
  if (save) await ctx.addInitScript((s) => { if (!sessionStorage.getItem('gesetzt')) { localStorage.setItem('tiertrumpf.v1', s); sessionStorage.setItem('gesetzt', '1'); } }, JSON.stringify(save));
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('response', (r) => { if (r.status() >= 400) errors.push(r.status() + ' ' + r.url()); });
  await page.goto(base + '/spiele/tiertrumpf' + query);
  await page.waitForSelector('#mStart, #mContinue');
  return { ctx, page, errors };
}
const S = (page) => page.evaluate(() => JSON.parse(JSON.stringify(window.__tiertrumpf.state)));
const idle = (page) => page.waitForFunction(() => !window.__tiertrumpf.busy, null, { timeout: 5000 });
function conserve(s) {
  const all = [...s.pile, ...s.discard, ...s.hands.flat()];
  assert.equal(all.length, E.deck(s.level).length); assert.equal(new Set(all.map((c) => c.id)).size, all.length);
}

// Ein Zug des Kindes über die Oberfläche. Liefert false, wenn die Runde vorbei ist.
async function kidMove(page) {
  if (await page.locator('dialog[open] #rAgain').count()) return false;
  if (await page.locator('dialog[open] [data-color]').count()) { await page.locator('dialog[open] [data-color]').nth(Math.floor(Math.random() * 4)).click(); return true; }
  if (await page.locator('#choice:not([hidden])').count()) { await page.click(Math.random() < 0.7 ? '#btnLay' : '#btnKeep'); return true; }
  const ok = page.locator('#hand .slot.ok');
  if (await ok.count()) { await ok.nth(Math.floor(Math.random() * (await ok.count()))).click(); return true; }
  if (await page.locator('#drawPile.must').count()) { await page.click('#drawPile'); return true; }
  await page.waitForTimeout(30); return true;   // Fiete ist dran oder Animation läuft
}

for (const level of [1, 2, 3]) {
  test(`Stufe ${level}: drei ganze Runden über die Oberfläche (360×640), Karten bleiben vollständig`, async () => {
    const { ctx, page, errors } = await open();
    await page.click(`.level[data-level="${level}"]`); await page.click('#mStart');
    for (let round = 0; round < 3; round++) {
      let n = 0;
      while (await kidMove(page)) {
        assert.ok(++n < 2500, 'Runde endet nicht');
        const s = await S(page); if (s) { conserve(s); assert.equal(s.level, level); }
      }
      const end = await S(page); assert.notEqual(end.winner, null);
      await page.click('#rAgain');
    }
    const saved = JSON.parse(await page.evaluate(() => localStorage.getItem('tiertrumpf.v1')));
    assert.equal(saved.bilanz.s + saved.bilanz.n + saved.bilanz.u, 3);
    assert.deepEqual(errors, []);
    await ctx.close();
  });
}

test('Doppeltipp auf eine Karte legt genau eine Karte', async () => {
  const { ctx, page, errors } = await open({ motion: 'no-preference', query: '' });
  await page.click('#mStart'); await idle(page);
  let s = await S(page);
  if (!E.legal(s).length) { await page.click('#drawPile'); await idle(page); s = await S(page); }
  if (s.turn !== 0 || s.drawn !== null) { await ctx.close(); return; }   // seltener Fall: Zug schon vorbei
  const before = s.hands[0].length, moves = s.moves;
  await page.evaluate(() => { const b = document.querySelector('#hand .slot.ok'); b.click(); b.click(); b.click(); });
  await page.evaluate(() => { document.querySelector('#hand .slot.ok')?.click(); document.querySelector('#drawPile').click(); });
  const after = await S(page);
  assert.equal(after.hands[0].length, before - 1); assert.equal(after.moves, moves + 1);
  await idle(page); assert.deepEqual(errors, []);
  await ctx.close();
});

test('Fortsetzen nach Neuladen, Neue Runde nur nach Rückfrage', async () => {
  const { ctx, page, errors } = await open();
  await page.click('.level[data-level="3"]'); await page.click('#mStart');
  for (let i = 0; i < 6; i++) await kidMove(page);
  await idle(page); await page.click('#btnMenu');   // Menü hält Fiete an
  const s1 = await S(page);
  await page.reload(); await page.waitForSelector('#mContinue');
  const s2 = await S(page);
  assert.deepEqual(s2.hands, s1.hands); assert.equal(s2.level, 3);
  assert.equal(await page.locator('#newBox').isHidden(), true);
  await page.click('#mNew'); assert.equal(await page.locator('#newBox').isVisible(), true);
  await page.click('#mContinue'); assert.deepEqual((await S(page)).hands, s1.hands);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('Beschädigter Spielstand wird verworfen, Bilanz bleibt', async () => {
  const s = E.create(2); s.hands[0][0].value = 'dino';
  const { ctx, page, errors } = await open({ save: { v: 1, level: 2, game: s, bilanz: { s: 4, n: 2, u: 0 }, voice: false } });
  assert.equal(await page.locator('#mContinue').count(), 0);
  assert.equal(await page.evaluate(() => window.__tiertrumpf.state), null);
  await page.click('#mStart');
  const saved = JSON.parse(await page.evaluate(() => localStorage.getItem('tiertrumpf.v1')));
  assert.deepEqual(saved.bilanz, { s: 4, n: 2, u: 0 }); assert.equal(saved.level, 2);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('Hintergrund: Fiete wartet, solange die Seite verdeckt ist', async () => {
  const s = E.create(1); s.turn = 1;
  const { ctx, page, errors } = await open({ save: { v: 1, level: 1, game: s, bilanz: { s: 0, n: 0, u: 0 } } });
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
  await page.click('#mContinue');
  await page.waitForTimeout(400);
  assert.equal((await S(page)).moves, s.moves, 'Fiete darf verdeckt nicht spielen');
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); });
  await page.waitForFunction(() => window.__tiertrumpf.state.moves > 0, null, { timeout: 3000 });
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('Kleine Handys: viele Handkarten bleiben sichtbar und antippbar', async () => {
  for (const size of [{ width: 320, height: 568 }, { width: 360, height: 640 }, { width: 390, height: 844 }, { width: 768, height: 1024 }]) {
    for (const n of [5, 9, 14, 22]) {
      const s = E.create(3); const extra = s.pile.splice(0, Math.max(0, n - 5)); s.hands[0].push(...extra);
      const { ctx, page, errors } = await open({ size, save: { v: 1, level: 3, game: s, bilanz: { s: 0, n: 0, u: 0 } } });
      await page.click('#mContinue');
      const r = await page.evaluate(() => {
        const box = document.getElementById('hand').getBoundingClientRect();
        const out = [];
        for (const el of document.querySelectorAll('#hand .slot')) {
          const b = el.getBoundingClientRect();
          // Sichtbarer Streifen: Mitte des linken Randbereichs muss die Karte selbst treffen
          const hit = document.elementFromPoint(b.left + 12, b.top + b.height * 0.55)?.closest('.slot') === el;
          out.push({ inside: b.left >= box.left - 1 && b.right <= box.right + 1 && b.top >= box.top - 1 && b.bottom <= box.bottom + 1, w: b.width, hit });
        }
        return { out, scroll: document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight };
      });
      assert.equal(r.out.length, n, `${size.width} ${n}`);
      assert.ok(r.out.every((c) => c.inside), `Karte außerhalb ${size.width}×${size.height} bei ${n}`);
      assert.ok(r.out.every((c) => c.w >= 56), `zu klein ${size.width} ${n}`);
      assert.ok(r.out.every((c) => c.hit), `verdeckt ${size.width}×${size.height} bei ${n}`);
      assert.equal(r.scroll, false, 'Seite darf nicht scrollen');
      assert.deepEqual(errors, []);
      await ctx.close();
    }
  }
});

test('Seite: Route, Metadaten und Pfade', async () => {
  const html = readFileSync(join(ROOT, 'spiele/tiertrumpf.html'), 'utf8');
  assert.match(html, /<link rel="canonical" href="https:\/\/playsaal.com\/spiele\/tiertrumpf">/);
  assert.match(html, /og:image" content="https:\/\/playsaal.com\/bilder\/tiertrumpf-og.jpg"/);
  for (const p of html.matchAll(/(?:src|href)="(\/[^"?#]+)/g)) assert.ok(existsSync(join(ROOT, p[1])) || existsSync(join(ROOT, p[1] + '.html')) || p[1] === '/', 'fehlt: ' + p[1]);
  assert.ok(existsSync(join(ROOT, 'bilder/tiertrumpf-og.jpg')) && existsSync(join(ROOT, 'bilder/tiertrumpf.webp')));
  const r = await fetch(base + '/spiele/tiertrumpf/img/manifest.json'); assert.ok(Array.isArray(await r.json()));
});
