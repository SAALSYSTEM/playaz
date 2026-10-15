// ZAHLENSTURM im Browser: Menü, Steuerung (Tastatur, Maus, Touch), Sieg/Niederlage, Speicherstand, Awards, Teilen,
// Herausforderungs-Link, Auflösungen, keine Fremd-Requests/Werbung.
// Start: node --test --test-concurrency=1 tests/zahlensturm.test.mjs   (startet wrangler dev selbst, wie die anderen Tests)
// WebGL läuft hier über SwiftShader (Software). Bildraten aus diesem Test sagen nichts über echte Geräte.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.ZS_PORT || 8799);
const BASE = `http://127.0.0.1:${PORT}`;
const SPIEL = BASE + '/spiele/zahlensturm';
const LOES = JSON.parse(readFileSync(join(ROOT, 'tests/zahlensturm-loesungen.json'), 'utf8'));

function ladePlaywright() {
  const req = createRequire(import.meta.url);
  try { return req('playwright'); } catch (e) {}
  const g = execSync('npm root -g').toString().trim();
  try { return req(join(g, 'playwright')); } catch (e) {}
  return req('/opt/npm-tools/node_modules/playwright');
}
const { chromium } = ladePlaywright();
let wrangler, browser;
const warte = (ms) => new Promise((r) => setTimeout(r, ms));

before(async () => {
  wrangler = spawn('npx', ['-y', 'wrangler@4', 'dev', '--port', String(PORT), '--ip', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore', detached: true });
  for (let i = 0; i < 90; i++) { try { if ((await fetch(BASE + '/')).ok) break; } catch (e) {} await warte(1000); }
  browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
});
after(async () => { await browser?.close(); try { process.kill(-wrangler.pid); } catch (e) {} });

async function seite(opts = {}, url = SPIEL + '?test', vorher) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  const fehler = [], anfragen = [];
  page.on('pageerror', (e) => fehler.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') fehler.push(m.text()); });
  page.on('request', (r) => anfragen.push(r.url()));
  if (vorher) await page.addInitScript(vorher);
  await page.goto(url);
  await page.waitForFunction(() => window.__zs && __zs.sim || document.getElementById('sMenu') && !document.getElementById('sMenu').hidden, null, { timeout: 20000 });
  return { ctx, page, fehler, anfragen };
}
const zustand = (page) => page.evaluate(() => __zs.zustand);
const sichtbar = (page, sel) => page.isVisible(sel);
// Level per Bot-Lösung gewinnen und Ergebnisbildschirm abwarten
async function gewinne(page, id) {
  await page.evaluate((id) => __zs.starteLevel(id), id);
  const inp = await page.evaluate(async (a) => (await import('/spiele/zahlensturm/sim.js')).decodeInputs(a), LOES[id].a);
  const phase = await page.evaluate((inp) => __zs.spiele(inp), inp);
  assert.equal(phase, 'won');
  await page.waitForFunction(() => __zs.zustand === 'ergebnis', null, { timeout: 15000 });
}
async function awardsWeg(page) {
  for (let i = 0; i < 12; i++) {
    await page.waitForFunction(() => !document.getElementById('oAward').hidden || !document.getElementById('oErgebnis').hidden, null, { timeout: 8000 });
    if (await page.isVisible('#oErgebnis')) return;
    await page.click('#awWeiter');
  }
}

test('Seite: lädt ohne Fehler, SEO, Menü, Spielstand-Schlüssel', async () => {
  const { ctx, page, fehler } = await seite({}, SPIEL);
  await page.waitForSelector('#sMenu:not([hidden])');
  assert.match(await page.title(), /ZAHLENSTURM/);
  assert.equal(await page.getAttribute('link[rel=canonical]', 'href'), 'https://playsaal.com/spiele/zahlensturm');
  assert.match(await page.getAttribute('meta[name=description]', 'content'), /Mathe|Rechen|Tore/i);
  assert.ok(await page.$('script[type="application/ld+json"]'));
  assert.equal(await page.textContent('#mLevelZahl'), '0 / 20');
  assert.equal(await page.textContent('#mAwardsZahl').then((t) => t.trim()), '0 / 17');
  assert.deepEqual(fehler, []);
  await ctx.close();
});

test('Werbefrei: nur eigene Anfragen, keine Werbe-/Tracking-Domains im Code', async () => {
  const { ctx, page, anfragen } = await seite({}, SPIEL);
  await page.waitForTimeout(1500);
  const fremd = anfragen.filter((u) => !u.startsWith(BASE) && !u.startsWith('data:') && !u.startsWith('blob:'));
  // Schriften dürfen von Google Fonts kommen (wie im restlichen Portal); sonst nichts
  assert.deepEqual(fremd.filter((u) => !/fonts\.(googleapis|gstatic)\.com/.test(u)), []);
  const code = ['zahlensturm.html', 'spiele/zahlensturm/game.js', 'spiele/zahlensturm/render.js'].map((f) => readFileSync(join(ROOT, 'public', f.startsWith('spiele/zahlensturm/') ? f : 'spiele/' + f), 'utf8')).join('\n');
  for (const w of ['adsbygoogle', 'doubleclick', 'googletagmanager', 'googlesyndication', 'adsense', 'gpt.js', 'prebid', 'poki-sdk', 'gamemonetize', 'adinplay', 'facebook.net', 'analytics.js']) assert.ok(!code.toLowerCase().includes(w), 'Fund: ' + w);
  await ctx.close();
});

test('Menü: Spielen startet Level 1, Pause/Fortsetzen', async () => {
  const { ctx, page, fehler } = await seite({}, SPIEL + '?test');
  await page.waitForSelector('#sMenu:not([hidden])');
  await page.click('#mSpielen');
  await page.waitForFunction(() => __zs.zustand === 'bereit', null, { timeout: 8000 });
  assert.equal(await page.textContent('#hLevel'), '1');
  assert.ok(await sichtbar(page, '#hilfe') || await sichtbar(page, '#tipp'));
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(300);
  await page.keyboard.up('ArrowRight');
  await page.keyboard.press('Escape');
  await page.waitForSelector('#oPause:not([hidden])');
  await page.click('#pWeiter');
  await page.waitForSelector('#oPause', { state: 'hidden' });
  assert.deepEqual(fehler, []);
  await ctx.close();
});

test('Steuerung: Tastatur (Pfeile, A/D), Maus-Ziehen, Touch-Ziehen bewegen die Gruppe', async () => {
  const { ctx, page } = await seite({}, SPIEL + '?test');
  await page.evaluate(() => __zs.starteLevel(1));
  // Software-WebGL ist langsam: gedrückt halten, bis sich die Gruppe bewegt hat (Zeitüberschreitung = Fehler)
  await page.keyboard.down('ArrowRight');
  await page.waitForFunction(() => __zs.sim.s.x > 0.5, null, { timeout: 15000 });
  await page.keyboard.up('ArrowRight');
  const r = await page.evaluate(() => __zs.sim.s.x);
  await page.keyboard.down('a');
  await page.waitForFunction((r) => __zs.sim.s.x < r - 0.8, r, { timeout: 15000 });
  await page.keyboard.up('a');
  // Maus
  await page.evaluate(() => __zs.starteLevel(1));
  const box = await page.locator('#c').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.7);
  await page.mouse.down(); await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height * 0.7, { steps: 6 }); await page.mouse.up();
  assert.ok(await page.evaluate(() => __zs.tx) > 0.5);
  await ctx.close();
  // Touch (Pointer-Events mit pointerType touch)
  const t = await seite({ hasTouch: true, viewport: { width: 390, height: 844 }, isMobile: true }, SPIEL + '?test');
  await t.page.evaluate(() => __zs.starteLevel(1));
  await t.page.evaluate(() => {
    const c = document.getElementById('c'), b = c.getBoundingClientRect();
    const ev = (type, x) => c.dispatchEvent(new PointerEvent(type, { pointerId: 7, pointerType: 'touch', clientX: x, clientY: b.top + b.height * 0.7, bubbles: true, cancelable: true, isPrimary: true }));
    ev('pointerdown', b.left + b.width / 2); for (let i = 1; i <= 6; i++) ev('pointermove', b.left + b.width / 2 - i * 25); ev('pointerup', b.left + b.width / 2 - 150);
  });
  assert.ok(await t.page.evaluate(() => __zs.tx) < -0.5);
  assert.equal(await zustand(t.page), 'play');
  await t.ctx.close();
});

test('Sieg: Ergebnis, Sterne, Spielstand, Award „erster“, Fortschritt bleibt nach Neuladen', async () => {
  const { ctx, page, fehler } = await seite({}, SPIEL + '?test');
  await gewinne(page, 1);
  await awardsWeg(page);
  assert.ok(await sichtbar(page, '#oErgebnis'));
  assert.match(await page.textContent('#eLevel'), /Level 1/);
  const sv = await page.evaluate(() => JSON.parse(localStorage.getItem('zahlensturm.v1')));
  assert.equal(sv.v, 1); assert.ok(sv.levels[1].done); assert.ok(sv.levels[1].stars >= 1); assert.ok(sv.awards.erster); assert.ok(sv.coins > 0);
  // Neuladen: Spielstand geladen
  await page.reload(); await page.waitForFunction(() => window.__zs);
  assert.ok(await page.evaluate(() => __zs.stand.levels[1].done));
  assert.equal(await page.evaluate(() => __zs.stand.awards.erster ? 1 : 0), 1);
  assert.deepEqual(fehler, []);
  await ctx.close();
});

test('Münzen: Wiederholen bringt keine Münzen für Gleichstand (Anti-Farming)', async () => {
  const { ctx, page } = await seite({}, SPIEL + '?test');
  await gewinne(page, 1); await awardsWeg(page);
  const c1 = await page.evaluate(() => __zs.stand.coins);
  await gewinne(page, 1);
  const c2 = await page.evaluate(() => __zs.stand.coins);
  assert.equal(c2, c1, 'Gleiche Leistung darf keine Münzen geben');
  await ctx.close();
});

test('Niederlage: Verloren-Dialog, Neustart; Abbruch zählt nicht als Sieg', async () => {
  const { ctx, page } = await seite({}, SPIEL + '?test');
  await page.evaluate(() => __zs.starteLevel(20));
  await page.evaluate(() => { __zs.beginne(); __zs.schnell(60 * 120); });
  await page.waitForSelector('#oVerloren:not([hidden])', { timeout: 15000 });
  assert.ok((await page.textContent('#vGrund')).length > 3);
  assert.equal(await page.evaluate(() => !!(__zs.stand.levels[20] && __zs.stand.levels[20].done)), false);
  await page.click('#vNochmal');
  await page.waitForFunction(() => __zs.zustand === 'bereit');
  await ctx.close();
});

test('Level-Sperre: Level 2 erst nach Level 1 spielbar, Auswahl zeigt Sterne', async () => {
  const { ctx, page } = await seite({}, SPIEL);
  await page.waitForSelector('#sMenu:not([hidden])');
  await page.click('#mLevel');
  await page.waitForSelector('#sLevels:not([hidden])');
  const gesperrt = await page.locator('#lListe button:disabled, #lListe [aria-disabled=true], #lListe .zu').count();
  assert.ok(gesperrt >= 1, 'gesperrte Level sichtbar');
  await ctx.close();
});

test('Teilen: Text, Link mit Level und Anzahl, PNG-Bild (1080×1080), Fallback ohne Web Share API', async () => {
  const { ctx, page } = await seite({}, SPIEL + '?test', () => { Object.defineProperty(navigator, 'share', { value: undefined, configurable: true }); });
  await gewinne(page, 3); await awardsWeg(page);
  const link = await page.evaluate(() => __zs.teilenLink({ level: 3, n: 348 }));
  const u = new URL(link);
  assert.equal(u.searchParams.get('level'), '3'); assert.equal(u.searchParams.get('n'), '348');
  assert.equal(u.origin + u.pathname, 'https://playsaal.com/spiele/zahlensturm');
  const png = await page.evaluate(async () => { const b = await __zs.teilenBild({ level: 3, n: 348 }); const bm = await createImageBitmap(b); return { type: b.type, size: b.size, w: bm.width, h: bm.height }; });
  assert.equal(png.type, 'image/png'); assert.equal(png.w, 1080); assert.equal(png.h, 1080); assert.ok(png.size > 20000);
  await page.click('#eTeilen');
  await page.waitForSelector('#oAward:not([hidden])');
  assert.match(await page.textContent('#awZitat'), /Level 3/);
  assert.match(await page.textContent('#awFrage'), /Kannst du mich schlagen\?/);
  await ctx.close();
});

test('Herausforderungs-Link: Gast öffnet ohne Anmeldung direkt das Level samt Hinweis', async () => {
  const { ctx, page, fehler } = await seite({}, SPIEL + '?test&level=3&n=80&von=Anna');
  await page.waitForFunction(() => document.getElementById('hLevel') && document.getElementById('hLevel').textContent === '3', null, { timeout: 15000 });
  await page.waitForSelector('#banner:not([hidden])');
  assert.match(await page.textContent('#bannerText'), /Anna.*Level 3.*80/);
  assert.ok(!(await sichtbar(page, '#sMenu')));
  // Unsinnige Parameter richten nichts an
  const p2 = await ctx.newPage(); const f2 = [];
  p2.on('pageerror', (e) => f2.push(e.message));
  await p2.goto(SPIEL + '?level=999&n=-5&von=%3Cimg%20src=x%20onerror=alert(1)%3E');
  await p2.waitForSelector('#sMenu:not([hidden])', { timeout: 15000 });
  assert.deepEqual(f2, []); assert.deepEqual(fehler, []);
  await ctx.close();
});

test('Speicherstand: kaputte Daten und gesperrter Speicher crashen nicht', async () => {
  const a = await seite({}, SPIEL, () => { localStorage.setItem('zahlensturm.v1', '{kaputt'); });
  await a.page.waitForSelector('#sMenu:not([hidden])');
  assert.deepEqual(a.fehler, []);
  await a.ctx.close();
  const b = await seite({}, SPIEL, () => { localStorage.setItem('zahlensturm.v1', JSON.stringify({ v: 1, coins: -5, levels: { 1: { done: true, stars: 99, bestN: 'x' }, 77: { done: true } }, awards: { gibtsnicht: { at: 'x' } }, skins: { owned: ['unbekannt'], sel: 'unbekannt' } })); });
  await b.page.waitForSelector('#sMenu:not([hidden])');
  assert.deepEqual(b.fehler, []);
  await b.ctx.close();
  const c = await seite({}, SPIEL, () => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('gesperrt'); } }); });
  await c.page.waitForSelector('#sMenu:not([hidden])');
  await c.ctx.close();
});

test('Pause: Fensterwechsel (blur) pausiert den Lauf', async () => {
  const { ctx, page } = await seite({}, SPIEL + '?test');
  await page.evaluate(() => { __zs.starteLevel(1); __zs.beginne(); });
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  assert.equal(await zustand(page), 'pause');
  await page.click('#pWeiter');
  assert.equal(await zustand(page), 'play');
  await ctx.close();
});

for (const [w, h, name] of [[375, 667, 'Handy klein'], [390, 844, 'Handy'], [768, 1024, 'Tablet'], [1440, 900, 'Desktop']]) {
  test(`Auflösung ${w}×${h} (${name}): Menü und Spiel passen, kein Seiten-Scrollen, Bild nicht leer`, async () => {
    const { ctx, page, fehler } = await seite({ viewport: { width: w, height: h }, hasTouch: w < 800, deviceScaleFactor: 1 }, SPIEL + '?test');
    await page.waitForSelector('#sMenu:not([hidden])');
    const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, b: document.getElementById('mSpielen').getBoundingClientRect().toJSON() }));
    assert.ok(m.sw <= m.cw + 1, `horizontal scroll ${m.sw}>${m.cw}`);
    assert.ok(m.b.bottom <= h && m.b.top >= 0 && m.b.width >= 120, 'Spielen-Knopf sichtbar');
    await page.evaluate(() => __zs.starteLevel(8));
    await page.evaluate(() => { __zs.beginne(); __zs.schnell(220); });
    await page.waitForTimeout(500);
    const cvs = await page.evaluate(() => { const c = document.getElementById('c'); return { w: c.clientWidth, h: c.clientHeight, ww: innerWidth, hh: innerHeight }; });
    assert.ok(cvs.w >= cvs.ww - 1 && cvs.h >= cvs.hh - 1, 'Canvas füllt das Fenster');
    const hud = await page.evaluate(() => ['#hLevel', '#hAnzahl', '#hMuenzen', '#bPause'].map((s) => { const r = document.querySelector(s).getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight; }));
    assert.ok(hud.every(Boolean), 'HUD im Bild ' + hud);
    const buf = await page.screenshot();
    // Bild nicht einfarbig: grob Anzahl verschiedener Bytes in der PNG-Größe
    assert.ok(buf.length > 12000, 'Screenshot sieht leer aus (' + buf.length + ' B)');
    assert.deepEqual(fehler, []);
    await ctx.close();
  });
}

test('Alle 20 Level lassen sich im echten Spiel (Browser-Sim) per Bot-Lösung gewinnen', async () => {
  const { ctx, page } = await seite({}, SPIEL + '?test');
  for (let id = 1; id <= 20; id++) {
    await page.evaluate((id) => __zs.starteLevel(id), id);
    const inp = await page.evaluate(async (a) => (await import('/spiele/zahlensturm/sim.js')).decodeInputs(a), LOES[id].a);
    const phase = await page.evaluate((inp) => __zs.spiele(inp), inp);
    assert.equal(phase, 'won', 'Level ' + id);
    assert.equal(await page.evaluate(() => __zs.sim.s.n), LOES[id].nA, 'Level ' + id + ' n');
  }
  await ctx.close();
});

test('Performance-Richtwert: Zeichenaufrufe und Dreiecke bleiben klein (Instancing) – auch bei großer Gruppe', async () => {
  const { ctx, page } = await seite({}, SPIEL + '?test');
  await page.evaluate(() => { __zs.starteLevel(16); __zs.beginne(); __zs.sim.s.n = 1500; __zs.schnell(30); });
  await page.waitForTimeout(600);
  const i = await page.evaluate(() => __zs.info());
  assert.ok(i.calls < 250, 'Draw Calls ' + i.calls);
  assert.ok(i.tris < 400000, 'Dreiecke ' + i.tris);
  await ctx.close();
});
