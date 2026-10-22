// PUNKTLANDUNG im Browser (wrangler dev + Playwright): Titel, Üben, Treffer per Bot, Ende, Rangliste-Ansicht.
// Start: node --test tests/punktlandung.test.mjs
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PL_PORT || 8798);
const BASE = `http://127.0.0.1:${PORT}`;
function ladePlaywright() {
  const req = createRequire(import.meta.url);
  try { return req('playwright'); } catch (e) {}
  try { return req(join(execSync('npm root -g').toString().trim(), 'playwright')); } catch (e) {}
  return req('/opt/npm-tools/node_modules/playwright');
}
const { chromium } = ladePlaywright();
let wrangler, browser;
const warte = (ms) => new Promise((r) => setTimeout(r, ms));
before(async () => {
  wrangler = spawn('npx', ['-y', 'wrangler@4', 'dev', '--port', String(PORT), '--ip', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore', detached: true });
  for (let i = 0; i < 90; i++) { try { if ((await fetch(BASE + '/')).ok) break; } catch (e) {} await warte(1000); }
  browser = await chromium.launch();
});
after(async () => { await browser?.close(); try { process.kill(-wrangler.pid); } catch (e) {} });

async function seite() {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 780 } });
  await ctx.route(/supabase\.co/, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  const page = await ctx.newPage(); const fehler = [];
  page.on('pageerror', (e) => fehler.push(e.message));
  await page.goto(BASE + '/spiele/punktlandung?test');
  return { ctx, page, fehler };
}

test('Titel, SEO-Angaben und Üben bis zum Ende', async () => {
  const { ctx, page, fehler } = await seite();
  assert.match(await page.title(), /PUNKTLANDUNG/);
  assert.match(await page.getAttribute('link[rel=canonical]', 'href'), /\/spiele\/punktlandung$/);
  assert.equal(await page.locator('h1').count(), 1);
  assert.ok((await page.getAttribute('meta[name=description]', 'content')).length > 80);
  await page.click('#bUeben');
  assert.equal(await page.evaluate(() => window.__pl.zustand), 'bereit');
  await page.mouse.click(195, 400);                       // erster Tipp startet nur
  assert.equal(await page.evaluate(() => window.__pl.zustand), 'spiel');
  await page.waitForFunction(() => window.__pl.zustand === 'ende', null, { timeout: 15000 });   // ohne Tippen verpasst man das erste Ziel
  assert.equal(await page.textContent('#ePunkte'), '0');
  assert.match(await page.textContent('#eKopf'), /Verfehlt|Bestwert/);
  assert.deepEqual(fehler, []);
  await ctx.close();
});

test('Bot trifft mehrere Ziele hintereinander im echten Browser-Takt', async () => {
  const { ctx, page, fehler } = await seite();
  await page.click('#bUeben'); await page.mouse.click(195, 400);
  // tippt, sobald das Ziel erreicht ist (liest den Spielzustand, tippt mit echtem Mausklick)
  const ergebnis = await page.evaluate(() => new Promise((fertig) => {
    const t0 = performance.now();
    const f = () => {
      const l = window.__pl.lauf; if (!l || window.__pl.zustand !== 'spiel' || performance.now() - t0 > 12000) return fertig(l ? l.s.n : -1);
      const v = 2400 + l.s.n * 45; if (l.s.e - v * 2 < 0 && l.s.e > -3000) document.getElementById('c').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      requestAnimationFrame(f);
    }; f();
  }));
  assert.ok(ergebnis >= 3, 'Treffer: ' + ergebnis);
  assert.deepEqual(fehler, []);
  await ctx.close();
});

test('Rangliste ohne Server: freundliche Meldung statt Fehler', async () => {
  const { ctx, page, fehler } = await seite();
  await page.click('#bRang');
  await page.waitForFunction(() => document.querySelector('#rListe').textContent.length > 3);
  assert.deepEqual(fehler, []);
  await page.click('#bRangZu');
  assert.equal(await page.isVisible('#bTag'), true);
  await ctx.close();
});
