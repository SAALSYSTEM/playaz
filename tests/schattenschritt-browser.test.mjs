// Schattenschritt – Browserprüfung: Laden (Modelle geteilt mit Kerkerlauf/Letzte Bastion), Levelauswahl, Wischen/Tippen/Tasten,
// Erwischt → Zug zurück, Ausschalten, Schlüssel/Tor, Sterne speichern und nächstes Level frei, Pause, Handy-Layout.
// Eigener kleiner Static-Server (wie Cloudflare: /pfad -> pfad.html). node --test --test-concurrency=1 tests/schattenschritt-browser.test.mjs
import { test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as L from '../public/spiele/schattenschritt/logik.js';

const ROOT = fileURLToPath(new URL('../public/', import.meta.url));
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

async function open({ size = { width: 390, height: 844 }, mobil = true, save = null, level = 0 } = {}) {
  const ctx = await browser.newContext({ viewport: size, hasTouch: mobil, isMobile: mobil });
  offen.push(ctx);
  await ctx.route('**/assets/playsaal*.js', (r) => r.fulfill({ contentType: 'application/javascript', body: '' }));
  if (save) await ctx.addInitScript((s) => { if (!sessionStorage.getItem('gesetzt')) { localStorage.setItem('schattenschritt.v1', s); sessionStorage.setItem('gesetzt', '1'); } }, JSON.stringify(save));
  const page = await ctx.newPage(); const errors = [], glb = []; page.__mobil = mobil;
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('response', (r) => { if (r.status() >= 400) errors.push(r.status() + ' ' + r.url()); if (r.url().includes('.glb')) glb.push(r.status() + ' ' + r.url().split('/').pop().split('?')[0]); });
  await page.goto(`${base}/spiele/schattenschritt?test${level ? '&level=' + level : ''}`);
  await page.waitForFunction(() => window.__schatten && ['menu', 'spiel'].includes(window.__schatten.zustand), null, { timeout: 60000 });
  return { ctx, page, errors, glb };
}
const T = (page, expr, arg) => page.evaluate(expr, arg);
const S = (page) => T(page, () => { const f = window.__schatten.lauf; return { x: f.x, y: f.y, zuege: f.zuege, status: f.status, ko: f.ko.slice(), muenzen: f.muenzen.filter(Boolean).length, schluessel: f.schluessel }; });
const warte = (page, fn, arg, ms = 20000) => page.waitForFunction(fn, arg, { timeout: ms });
const TASTE = { N: 'ArrowUp', O: 'ArrowRight', S: 'ArrowDown', W: 'ArrowLeft', w: 'Space' };
async function gehe(page, weg) {
  for (const c of weg) { await warte(page, () => !window.__schatten.beschaeftigt); await page.keyboard.press(TASTE[c]); }
  await warte(page, () => !window.__schatten.beschaeftigt);
}
const loesung = (n, art = 'alle') => L.loese(L.baue(L.LEVEL[n - 1]), 80)[art];
async function wische(page, dx, dy) {
  const x = 195, y = 520;
  await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + dx / 2, y + dy / 2); await page.mouse.move(x + dx, y + dy); await page.mouse.up();
}

test('Laden: Raum, Schurke, vier Skelett-Arten, Animationen; Levelauswahl mit 24 Leveln (nur das erste offen); Ton', async () => {
  const { page, errors, glb } = await open();
  assert.deepEqual(glb.sort(), ['200 anim-allgemein.glb', '200 anim-combatmelee.glb', '200 anim-jubel.glb', '200 anim-magie.glb', '200 anim-schleichen.glb', '200 anim-skelett.glb', '200 anim-special.glb', '200 held-schurke.glb', '200 raum.glb', '200 skelett-diener.glb', '200 skelett-krieger.glb', '200 skelett-magier.glb', '200 skelett-schurke.glb']);
  const clips = await T(page, () => window.__schatten.clips);
  for (const c of ['Sneaking', 'Crouching', 'Melee_Dualwield_Attack_Stab', 'Death_A', 'Cheering', 'Skeletons_Idle', 'Skeletons_Walking', 'Skeletons_Death', 'Melee_1H_Attack_Chop', 'Ranged_Magic_Shoot']) assert.ok(clips.includes(c), c);
  assert.equal(await page.locator('#mLevel .raster button').count(), 24);
  assert.equal(await page.locator('#mLevel .raster button:not([disabled])').count(), 1);
  assert.equal(await page.textContent('#mMax'), '72');
  assert.ok(await T(page, () => document.documentElement.scrollWidth <= innerWidth));
  await page.mouse.click(195, 300);
  await warte(page, () => window.__schatten.ton.geladen.length === 13 && window.__schatten.ton.schleifen, null, 30000);
  await page.click('#mTon'); assert.equal((await T(page, () => window.__schatten.stand)).ton, false);
  assert.deepEqual(errors, []);
});

test('Level 1: Wischen und Tippen aufs Nachbarfeld bewegen, Mauer blockiert ohne Zug; Lösung → 2 Sterne, gespeichert, Level 2 frei', async () => {
  const { page, errors } = await open();
  await page.click('#mLevel .raster button'); await warte(page, () => window.__schatten.zustand === 'spiel');
  assert.match(await page.textContent('#hName'), /Erste Schritte/);
  assert.ok(await page.isVisible('#hinweis'));
  await wische(page, 0, -120); await warte(page, () => window.__schatten.lauf.zuege === 1 && !window.__schatten.beschaeftigt);
  assert.deepEqual([(await S(page)).x, (await S(page)).y], [2, 5]);
  await wische(page, 0, 120); await warte(page, () => window.__schatten.lauf.zuege === 2 && !window.__schatten.beschaeftigt);
  // Tippen aufs Feld links daneben
  const p = await T(page, () => window.__schatten.bildschirm(1, 6));
  await page.mouse.click(p.x, p.y); await warte(page, () => window.__schatten.lauf.zuege === 3 && !window.__schatten.beschaeftigt);
  assert.deepEqual([(await S(page)).x, (await S(page)).y], [1, 6]);
  await page.keyboard.press('ArrowLeft'); await page.waitForTimeout(300);
  assert.equal((await S(page)).zuege, 3, 'Mauer: kein Zug');
  await page.click('#bNeu'); assert.equal((await S(page)).zuege, 0);
  await gehe(page, loesung(1));
  await warte(page, () => window.__schatten.zustand === 'ende');
  await warte(page, () => !document.getElementById('ende').hidden);
  assert.equal(await page.locator('#eSterne .stern.an').count(), 2, 'Ausgang + alle Münzen, aber nicht der kürzeste Weg');
  assert.equal((await T(page, () => window.__schatten.stand)).sterne[0], 2);
  await page.click('#eWeiter'); await warte(page, () => window.__schatten.zustand === 'spiel' && window.__schatten.nr === 1);
  await page.reload(); await warte(page, () => window.__schatten && window.__schatten.zustand === 'menu', null, 60000);
  assert.equal(await page.locator('#mLevel .raster button:not([disabled])').count(), 2);
  assert.equal(await page.textContent('#mSterne'), '2');
  assert.deepEqual(errors, []);
});

test('Erwischt: Dialog, „Zug zurück“ setzt einen Zug zurück, „Neu starten“ auf Anfang; Warten zählt als Zug', async () => {
  const { page, errors } = await open({ level: 2 });
  await gehe(page, 'WN');
  await warte(page, () => !document.getElementById('erwischt').hidden);
  assert.equal((await S(page)).status, 'erwischt');
  assert.match(await page.textContent('#xGrund'), /Skelett-Wache/);
  assert.equal((await T(page, () => window.__schatten.held)).pose, 'Death_A');
  await page.click('#xZurueck');
  const s = await S(page); assert.equal(s.status, 'spiel'); assert.equal(s.zuege, 1);
  assert.equal((await T(page, () => window.__schatten.held)).pose, 'Crouching');
  await page.click('#bWarten'); await warte(page, () => window.__schatten.lauf.zuege === 2 && !window.__schatten.beschaeftigt);
  await page.keyboard.press('KeyZ'); assert.equal((await S(page)).zuege, 1);
  await gehe(page, 'N'); await warte(page, () => !document.getElementById('erwischt').hidden);
  await page.click('#xNeu'); assert.equal((await S(page)).zuege, 0); assert.equal((await S(page)).status, 'spiel');
  assert.deepEqual(errors, []);
});

test('Ausschalten (Level 3) auf dem kürzesten Weg; Schlüssel öffnet das Tor (Level 11)', async () => {
  const { page, errors } = await open({ level: 3, save: { v: 1, sterne: [3, 3], ton: false } });
  await gehe(page, loesung(3, 'kurz'));
  await warte(page, () => window.__schatten.zustand === 'ende');
  const s = await S(page); assert.ok(s.ko.some(Boolean)); assert.equal(s.status, 'geschafft');
  assert.equal((await T(page, () => window.__schatten.stand)).sterne[2], 2, 'kürzester Weg ohne alle Münzen: Ausgang + Züge');
  await page.goto(page.url().replace('level=3', 'level=11'));
  await warte(page, () => window.__schatten && window.__schatten.zustand === 'spiel', null, 60000);
  await gehe(page, loesung(11));
  await warte(page, () => window.__schatten.zustand === 'ende');
  const t = await S(page); assert.equal(t.schluessel, true); assert.equal(t.muenzen, 2);
  assert.deepEqual(errors, []);
});

test('Pause per Knopf und Escape; Levelauswahl aus der Pause', async () => {
  const { page, errors } = await open({ level: 5, size: { width: 1280, height: 800 }, mobil: false });
  await page.keyboard.press('Escape'); assert.equal(await T(page, () => window.__schatten.zustand), 'pause');
  await page.keyboard.press('ArrowUp'); assert.equal((await S(page)).zuege, 0, 'in der Pause keine Züge');
  await page.keyboard.press('Escape'); assert.equal(await T(page, () => window.__schatten.zustand), 'spiel');
  await page.click('#bPause'); assert.ok(await page.isVisible('#pause'));
  await page.click('#pMenu'); await warte(page, () => window.__schatten.zustand === 'menu');
  assert.deepEqual(errors, []);
});

test('Handy-Layout 390×844 und 360×640: Menü, HUD, Knöpfe und das größte Level passen, kein Querscrollen', async () => {
  for (const size of [{ width: 390, height: 844 }, { width: 360, height: 640 }]) {
    const { page, errors } = await open({ size, level: 24 });
    const kasten = async (sel) => page.locator(sel).first().boundingBox();
    const hud = await kasten('#hud .hud-box'), steuer = await kasten('#steuer');
    assert.ok(steuer.y + steuer.height <= size.height + 1 && steuer.x >= 0, JSON.stringify(steuer));
    // Alle Felder des größten Levels zwischen HUD und Knöpfen
    const lv = L.baue(L.LEVEL[23]);
    for (const [x, y] of [[0, 0], [lv.w - 1, 0], [0, lv.h - 1], [lv.w - 1, lv.h - 1]]) {
      const p = await T(page, ([x, y]) => window.__schatten.bildschirm(x, y), [x, y]);
      assert.ok(p.x > 0 && p.x < size.width && p.y > hud.y + hud.height && p.y < steuer.y, `Feld ${x},${y}: ${JSON.stringify(p)}`);
    }
    await page.click('#bPause'); await page.click('#pMenu'); await warte(page, () => window.__schatten.zustand === 'menu');
    for (const id of ['#mStart', '#mTon']) { const b = await kasten(id); assert.ok(b.y + b.height <= size.height + 1, id); }
    assert.ok(await T(page, () => document.documentElement.scrollWidth <= innerWidth));
    assert.ok(await T(page, () => window.__schatten.zeichnungen) < 80, 'wenige Zeichenaufrufe');
    assert.deepEqual(errors, []);
  }
});
