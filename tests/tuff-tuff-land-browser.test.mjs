// Tuff-Tuff-Land – Browserprüfung: Laden, Gleise malen per Fingerbewegung, Weiche tippen, Bahnhof/Deko/Radierer,
// Zug wechseln, Fahrgäste bis zum Freischalten, Speichern nach Neuladen, Handy-Layout.
// Eigener kleiner Static-Server (wie Cloudflare: /pfad -> pfad.html). node --test tests/tuff-tuff-land-browser.test.mjs
import { test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../public/', import.meta.url));
function ladePlaywright() {
  const req = createRequire(import.meta.url);
  try { return req('playwright'); } catch (e) {}
  try { return req(join(execSync('npm root -g').toString().trim(), 'playwright')); } catch (e) {}
  return req('/opt/npm-tools/node_modules/playwright');
}
const { chromium } = ladePlaywright();
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.bin': 'application/octet-stream', '.webp': 'image/webp', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.mp3': 'audio/mpeg' };
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

async function open({ size = { width: 390, height: 844 }, mobil = true, ctx = null } = {}) {
  ctx ||= await browser.newContext({ viewport: size, hasTouch: mobil, isMobile: mobil });
  if (!offen.includes(ctx)) offen.push(ctx);
  await ctx.route('**/assets/playsaal*.js', (r) => r.fulfill({ contentType: 'application/javascript', body: '' }));
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('response', (r) => { if (r.status() >= 400) errors.push(r.status() + ' ' + r.url()); });
  await page.goto(`${base}/spiele/tuff-tuff-land?test`);
  await page.waitForFunction(() => window.__tufftuff && window.__tufftuff.zustand === 'start', null, { timeout: 30000 });
  return { page, errors, ctx };
}
const feld = (page, c, r) => page.evaluate(([c, r]) => { const t = window.__tufftuff; const f = t.welt.z[t.L.idx(c, r)]; return f ? JSON.parse(JSON.stringify(f)) : null; }, [c, r]);
const punkt = (page, c, r) => page.evaluate(([c, r]) => window.__tufftuff.bildschirm(c, r), [c, r]);
async function ziehe(page, felder) {
  const [x0, y0] = await punkt(page, ...felder[0]);
  await page.mouse.move(x0, y0); await page.mouse.down();
  for (const f of felder.slice(1)) { const [x, y] = await punkt(page, ...f); await page.mouse.move(x, y, { steps: 4 }); }
  await page.mouse.up();
}
async function tippe(page, c, r) { const [x, y] = await punkt(page, c, r); await page.mouse.click(x, y); }

test('lädt ohne Fehler, Start-Knopf führt ins Spiel, Zug steht am Bahnhof', async () => {
  const { page, errors } = await open();
  await page.click('#btnSpielen');
  assert.equal(await page.evaluate(() => window.__tufftuff.zustand), 'spiel');
  assert.equal(await page.isVisible('#tipp'), true, 'Tipp für den Anfang');
  const zug = await page.evaluate(() => ({ n: window.__tufftuff.zug.weg.length, art: window.__tufftuff.zug.art }));
  assert.ok(zug.n > 0); assert.equal(zug.art, 'blau');
  const inst = await page.evaluate(() => window.__tufftuff.instanzen());
  assert.ok(inst.gleis >= 8 && inst.bahnhof >= 2 && inst.prellbock >= 4, JSON.stringify(inst));
  assert.ok(Object.keys(inst).some((k) => k.startsWith('deko:haus')), 'Häuser stehen');
  await page.waitForTimeout(600);
  assert.deepEqual(errors, []);
});

test('Gleis malen verbindet die Bahnhöfe, Tipp verschwindet, Weiche lässt sich stellen', async () => {
  const { page, errors } = await open();
  await page.click('#btnSpielen');
  await page.evaluate(() => { const t = window.__tufftuff; t.kam.zoom = 1.6; t.schaueAuf(5, 18); });
  const weg = [[6, 21], [7, 21]]; for (let r = 20; r >= 14; r--) weg.push([7, r]); weg.push([6, 14], [5, 14]);
  await ziehe(page, weg);
  assert.deepEqual((await feld(page, 7, 21)).l, [[0, 3]]);
  assert.deepEqual((await feld(page, 7, 14)).l, [[2, 3]]);
  assert.equal(await page.evaluate(() => window.__tufftuff.welt.tipp), false);
  // Abzweig → Weiche, antippen stellt um
  await ziehe(page, [[7, 18], [8, 18], [8, 17]]);
  assert.equal((await feld(page, 7, 18)).l.length, 2);
  const w0 = (await feld(page, 7, 18)).w || 0;
  await tippe(page, 7, 18);
  assert.equal((await feld(page, 7, 18)).w, w0 ^ 1);
  assert.ok((await page.evaluate(() => window.__tufftuff.instanzen())).pfeil >= 1);
  assert.deepEqual(errors, []);
});

test('Bahnhof, Bäume, Häuser und Radierer', async () => {
  const { page, errors } = await open();
  await page.click('#btnSpielen');
  await page.evaluate(() => { const t = window.__tufftuff; t.kam.zoom = 1.4; t.schaueAuf(4, 18); });
  await ziehe(page, [[1, 19], [2, 19], [3, 19], [4, 19]]);
  await page.click('[data-wz="bahnhof"]');
  await tippe(page, 2, 19);
  assert.ok((await feld(page, 2, 19)).st >= 5, 'neuer Bahnhof');
  await tippe(page, 2, 19);
  assert.equal((await feld(page, 2, 19)).st, undefined, 'eigener Bahnhof wieder weg');
  await tippe(page, 4, 21);
  assert.equal((await feld(page, 4, 21)).st, 0, 'Startbahnhof bleibt');
  await page.click('[data-wz="baum"]');
  await tippe(page, 2, 17);
  const d1 = (await feld(page, 2, 17)).d[0];
  await tippe(page, 2, 17);
  assert.notEqual((await feld(page, 2, 17)).d[0], d1, 'nochmal tippen = anderes Motiv');
  await page.click('[data-wz="haus"]');
  await ziehe(page, [[1, 16], [2, 16], [3, 16]]);
  assert.ok((await feld(page, 3, 16)).d[0].startsWith('haus'));
  await page.click('[data-wz="radierer"]');
  await ziehe(page, [[1, 19], [2, 19], [3, 19]]);
  assert.equal(await feld(page, 2, 19), null);
  await tippe(page, 2, 17);
  assert.equal(await feld(page, 2, 17), null);
  assert.deepEqual(errors, []);
});

test('Zug wechseln, Fahrgäste bringen, Wald und Schnellzug freischalten, nach Neuladen alles noch da', async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const { page, errors } = await open({ ctx });
  await page.click('#btnSpielen');
  await page.click('#btnZug');
  assert.equal(await page.locator('.zugk').count(), 5);
  assert.equal(await page.locator('.zugk:disabled').count(), 1, 'Schnellzug noch gesperrt');
  await page.locator('.zugk', { hasText: 'Straßenbahn' }).click();
  assert.equal(await page.evaluate(() => window.__tufftuff.zug.art), 'tram');
  await page.evaluate(() => { const t = window.__tufftuff; t.kam.zoom = 1.6; t.schaueAuf(5, 18); });
  const weg = [[6, 21], [7, 21]]; for (let r = 20; r >= 14; r--) weg.push([7, r]); weg.push([6, 14], [5, 14]);
  await ziehe(page, weg);
  await page.evaluate(() => window.__tufftuff.vorspulen(260));
  await page.waitForTimeout(1900);
  const s = await page.evaluate(() => ({ g: window.__tufftuff.welt.fahrgaeste, o: window.__tufftuff.welt.offen, z: window.__tufftuff.welt.zuege }));
  assert.ok(s.g >= 6 && s.o === 2 && s.z.includes('ice'), JSON.stringify(s));
  assert.equal(await page.isVisible('#toast'), true);
  // Gleis in den Wald malen ist jetzt erlaubt
  await page.evaluate(() => { const t = window.__tufftuff; t.kam.zoom = 1.4; t.schaueAuf(4, 11); });
  await ziehe(page, [[4, 12], [4, 11], [4, 10]]);
  assert.ok((await feld(page, 4, 11)).l);
  await page.click('#btnZug');
  assert.equal(await page.locator('.zugk:disabled').count(), 0);
  await page.locator('.zugk', { hasText: 'Schnellzug' }).click();
  await page.waitForTimeout(500);
  await page.close();
  const { page: p2, errors: e2 } = await open({ ctx });
  const s2 = await p2.evaluate(() => ({ g: window.__tufftuff.welt.fahrgaeste, o: window.__tufftuff.welt.offen, zug: window.__tufftuff.zug.art, l: !!window.__tufftuff.welt.z[window.__tufftuff.L.idx(7, 17)].l }));
  assert.deepEqual({ ...s2, g: s2.g >= 6 }, { g: true, o: 2, zug: 'ice', l: true });
  assert.deepEqual([...errors, ...e2], []);
});

test('Anleitung: Schritte mit Weiter, Malen, Hupe, Baum; Vorlesen schaltbar, Anleitung im Menü neu startbar', async () => {
  const { page, errors } = await open();
  await page.click('#btnSpielen');
  const schritt = () => page.evaluate(() => window.__tufftuff.welt.anleitung);
  assert.equal(await schritt(), 0);
  assert.match(await page.textContent('#tippText'), /Willkommen/);
  await page.click('#tippWeiter');
  assert.equal(await schritt(), 1);
  assert.equal(await page.isVisible('#tippWeiter'), false, 'Malen: kein Weiter-Knopf');
  await page.waitForTimeout(1500);
  await page.evaluate(() => { const t = window.__tufftuff; t.kam.flug = null; t.kam.zoom = 1.6; t.schaueAuf(5, 18); });
  const weg = [[6, 21], [7, 21]]; for (let r = 20; r >= 14; r--) weg.push([7, r]); weg.push([6, 14], [5, 14]);
  await ziehe(page, weg);
  await page.waitForTimeout(200);
  assert.equal(await schritt(), 2);
  await page.click('#tippWeiter');
  assert.equal(await schritt(), 3);
  assert.ok(await page.$eval('#btnTuten', (e) => e.classList.contains('zeig')), 'Hupe leuchtet');
  await page.click('#btnTuten', { force: true }); await page.waitForTimeout(700);
  assert.equal(await schritt(), 4);
  await page.click('[data-wz="baum"]', { force: true });
  await page.evaluate(() => { const t = window.__tufftuff; t.kam.flug = null; t.kam.folge = false; t.kam.zoom = 1.4; t.schaueAuf(3, 18); });
  await tippe(page, 2, 17); await page.waitForTimeout(1200);
  assert.equal(await schritt(), 5);
  await page.click('#tippWeiter');
  assert.equal(await schritt(), -1);
  assert.equal(await page.isVisible('#tipp'), false);
  await page.click('#btnPause');
  assert.match(await page.textContent('#pVorlesen'), /an/);
  await page.click('#pVorlesen');
  assert.match(await page.textContent('#pVorlesen'), /aus/);
  await page.click('#pAnleitung');
  assert.equal(await schritt(), 0);
  assert.equal(await page.isVisible('#tipp'), true);
  assert.deepEqual(errors, []);
});

test('Handy-Layout: Werkzeugleiste und Knöpfe sichtbar und groß genug, Rechner-Ansicht ohne Fehler', async () => {
  for (const size of [{ width: 360, height: 640 }, { width: 390, height: 844 }, { width: 1280, height: 800 }]) {
    const { page, errors } = await open({ size, mobil: size.width < 800 });
    await page.click('#btnSpielen');
    const bar = await page.locator('#werkzeuge').boundingBox();
    assert.ok(bar.y + bar.height <= size.height, 'Leiste im Bild');
    for (const b of await page.locator('.wz').all()) { const bb = await b.boundingBox(); assert.ok(bb.width >= 40 && bb.height >= 50, JSON.stringify(bb)); }
    const los = await page.locator('#btnLos').boundingBox();
    assert.ok(los.y + los.height < bar.y, 'Los-Knopf über der Leiste');
    assert.deepEqual(errors, []);
  }
});
