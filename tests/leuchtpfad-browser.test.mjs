// Leuchtpfad – Browserprüfung: Level über die Oberfläche lösen (Tippen und Ziehen), Fehler -> neu zeigen, Sterne/Speichern,
// Rekordpfad mit 3 Leben, Platz auf kleinen Handys. Eigener kleiner Static-Server (wie Cloudflare: /pfad -> pfad.html).
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
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };
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

async function open({ size = { width: 390, height: 780 }, save = null, query = '?schnell' } = {}) {
  const ctx = await browser.newContext({ viewport: size, hasTouch: true, isMobile: true, reducedMotion: 'reduce' });
  await ctx.route('**/assets/playsaal*.js', (r) => r.fulfill({ contentType: 'application/javascript', body: '' }));
  if (save) await ctx.addInitScript((s) => { if (!sessionStorage.getItem('gesetzt')) { localStorage.setItem('leuchtpfad.v1', s); sessionStorage.setItem('gesetzt', '1'); } }, JSON.stringify(save));
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('response', (r) => { if (r.status() >= 400) errors.push(r.status() + ' ' + r.url()); });
  await page.goto(base + '/spiele/leuchtpfad' + query);
  await page.waitForSelector('body.ready');
  return { ctx, page, errors };
}
const mode = (page) => page.evaluate(() => window.__leuchtpfad.mode);
const warte = (page, m) => page.waitForFunction((x) => window.__leuchtpfad.mode === x, m, { timeout: 15000 });
const pfad = (page) => page.evaluate(() => window.__leuchtpfad.brett.path.slice());
const tippe = async (page, cell) => { const p = await page.evaluate((c) => window.__leuchtpfad.punkt(c), cell); await page.mouse.click(p.x, p.y); };

test('Level 1: zeigen, nachtippen, 3 Sterne, gespeichert, nächstes Level frei', async () => {
  const { ctx, page, errors } = await open();
  await page.click('#btnPlay');
  assert.equal(await mode(page), 'show');
  await page.mouse.click(200, 400);   // Tippen während des Zeigens zählt nicht
  await warte(page, 'play');
  assert.ok(await page.isVisible('#btnZeig'));
  const p = await pfad(page);
  for (const c of p.slice(1)) await tippe(page, c);
  await warte(page, 'won');
  assert.equal(await page.locator('#winStars svg.on').count(), 3);
  const s = await page.evaluate(() => JSON.parse(localStorage.getItem('leuchtpfad.v1')));
  assert.equal(s.best[1], 3); assert.equal(s.unlocked, 2);
  await page.click('#winNext'); assert.equal(await page.evaluate(() => window.__leuchtpfad.level), 2);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('Fehler: Hoppla, Weg wird neu gezeigt, zurück zum Start; Nochmal zeigen kostet einen Stern', async () => {
  const { ctx, page, errors } = await open({ save: { unlocked: 6, best: { 1: 3, 2: 3, 3: 3, 4: 3, 5: 3 } } });
  await page.click('#btnLevels'); await page.click('#levelWelten .lvl[aria-label="Level 6"]');
  await warte(page, 'play');
  const p = await pfad(page), b = await page.evaluate(() => window.__leuchtpfad.brett);
  const falsch = [...Array(b.cols * b.rows).keys()].find((c) => !p.includes(c));
  await tippe(page, p[1]); await tippe(page, falsch);
  assert.equal(await mode(page), 'oops');
  assert.match(await page.textContent('#ansageText'), /Hoppla/);
  await warte(page, 'show'); await warte(page, 'play');
  assert.equal(await page.evaluate(() => window.__leuchtpfad.lauf.pos), 0);
  await page.click('#btnZeig'); assert.equal(await mode(page), 'show');
  await warte(page, 'play');
  for (const c of p.slice(1)) await tippe(page, c);
  await warte(page, 'won');
  assert.equal(await page.locator('#winStars svg.on').count(), 1, 'ein Fehler und einmal zeigen = 1 Stern');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('Ziehen mit dem Finger über die Steine löst den Weg', async () => {
  const { ctx, page } = await open();
  await page.click('#btnPlay'); await warte(page, 'play');
  const p = await pfad(page);
  const pts = await page.evaluate((cs) => cs.map((c) => window.__leuchtpfad.punkt(c)), p);
  await page.mouse.move(pts[0].x, pts[0].y); await page.mouse.down();
  for (let i = 1; i < pts.length; i++) {
    for (let k = 1; k <= 6; k++) await page.mouse.move(pts[i - 1].x + (pts[i].x - pts[i - 1].x) * k / 6, pts[i - 1].y + (pts[i].y - pts[i - 1].y) * k / 6);
  }
  await page.mouse.up();
  await warte(page, 'won');
  await ctx.close();
});

test('Rekordpfad: Runde geschafft -> ein Stein mehr; drei Fehler -> Ende mit Rekord', async () => {
  const { ctx, page, errors } = await open();
  await page.click('#btnRekord'); await warte(page, 'play');
  assert.equal((await pfad(page)).length, 3);
  for (const c of (await pfad(page)).slice(1)) await tippe(page, c);
  await page.waitForFunction(() => window.__leuchtpfad.brett && window.__leuchtpfad.brett.path.length === 4 && window.__leuchtpfad.mode === 'play', null, { timeout: 15000 });
  assert.equal(await page.textContent('#chipLeben'), '💛💛💛');
  for (let n = 0; n < 3; n++) {
    await warte(page, 'play');
    const p = await pfad(page), b = await page.evaluate(() => window.__leuchtpfad.brett);
    await tippe(page, [...Array(b.cols * b.rows).keys()].find((c) => !p.includes(c)));
  }
  await warte(page, 'over');
  assert.match(await page.textContent('#overText'), /3 Steinen/);
  assert.ok(await page.isVisible('#overNeu'));
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('leuchtpfad.v1')).rekord), 3);
  await page.click('#overMenu');
  assert.match(await page.textContent('#rekordInfo'), /3 Steine/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('Kleines Handy: alle Steine sichtbar, nicht unter Kopfzeile oder Ansage', async () => {
  for (const size of [{ width: 320, height: 568 }, { width: 390, height: 844 }]) {
    const { ctx, page } = await open({ size, save: { unlocked: 30 } });
    await page.goto(base + '/spiele/leuchtpfad?schnell&level=30'); await warte(page, 'show');
    const r = await page.evaluate(() => {
      const L = window.__leuchtpfad, b = L.brett, hud = document.getElementById('hud').getBoundingClientRect();
      const an = document.getElementById('ansage').getBoundingClientRect();
      const pts = [...Array(b.cols * b.rows).keys()].map((c) => L.punkt(c));
      return { minY: Math.min(...pts.map((p) => p.y)), maxY: Math.max(...pts.map((p) => p.y)), minX: Math.min(...pts.map((p) => p.x)), maxX: Math.max(...pts.map((p) => p.x)), hud: hud.bottom, an: an.top, w: innerWidth };
    });
    assert.ok(r.minY > r.hud + 20, `${size.width}: oberste Reihe unter der Kopfzeile`);
    assert.ok(r.maxY < r.an - 15, `${size.width}: unterste Reihe über der Ansage`);
    assert.ok(r.minX > 10 && r.maxX < r.w - 10, `${size.width}: seitlich im Bild`);
    await ctx.close();
  }
});
