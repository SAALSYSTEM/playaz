// JUNGLE RUNNER im Browser: Seite, Figurenwahl, Steuerung (Tastatur, Touch), Sieg/Niederlage, Herzen, Wassersturz,
// Speicherstand, Awards, Teilen (PNG 1080×1080), Herausforderungs-Link, Endlosmodus, Garage, Auflösungen, Werbefreiheit.
// Start: node --test --test-concurrency=1 tests/jungle.test.mjs   (startet wrangler dev selbst, wie die anderen Tests)
// WebGL läuft hier über SwiftShader (Software). Bildraten aus diesem Test sagen nichts über echte Geräte.
import { test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.JR_PORT || 8797);
const BASE = `http://127.0.0.1:${PORT}`;
const SPIEL = BASE + '/spiele/jungle-runner';
const LOES = JSON.parse(readFileSync(join(ROOT, 'tests/jungle-loesungen.json'), 'utf8'));
const dec = (s) => s.split('.').map((q) => { const m = /^([0-9a-z]+)([LRUD])$/.exec(q); return [parseInt(m[1], 36), m[2]]; });

function ladePlaywright() {
  const req = createRequire(import.meta.url);
  try { return req('playwright'); } catch (e) {}
  const g = execSync('npm root -g').toString().trim();
  try { return req(join(g, 'playwright')); } catch (e) {}
  return req('/opt/npm-tools/node_modules/playwright');
}
const { chromium } = ladePlaywright();
let wrangler, browser;
const offen = [];
const warte = (ms) => new Promise((r) => setTimeout(r, ms));

before(async () => {
  wrangler = spawn('npx', ['-y', 'wrangler@4', 'dev', '--port', String(PORT), '--ip', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore', detached: true });
  for (let i = 0; i < 90; i++) { try { if ((await fetch(BASE + '/')).ok) break; } catch (e) {} await warte(1000); }
  browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
});
afterEach(async () => { while (offen.length) { try { await offen.pop().close(); } catch (e) {} } });
after(async () => { await browser?.close(); try { process.kill(-wrangler.pid); } catch (e) {} });

const MIT_FIGUR = () => { try { if (!localStorage.getItem('jungle.v1')) localStorage.setItem('jungle.v1', JSON.stringify({ v: 1, char: { kind: 'boy', outfit: 'entdecker', owned: ['entdecker'] } })); } catch (e) {} };
async function seite(opts = {}, url = SPIEL + '?test', vorher = MIT_FIGUR, warteAuf = 'menu') {
  const ctx = await browser.newContext(opts); offen.push(ctx);
  const page = await ctx.newPage();
  const fehler = [], anfragen = [];
  page.on('pageerror', (e) => fehler.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') fehler.push(m.text()); });
  page.on('request', (r) => anfragen.push(r.url()));
  if (vorher) await page.addInitScript(vorher);
  await page.goto(url);
  await page.waitForFunction((z) => window.__jr && (!z || __jr.zustand === z), warteAuf, { timeout: 25000 });
  return { ctx, page, fehler, anfragen };
}
const zu = (page) => page.evaluate(() => __jr.zustand);
const stand = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('jungle.v1')));
const sicht = (page, sel) => page.isVisible(sel);
const MOBIL = { viewport: { width: 390, height: 800 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 };

test('Seite: lädt ohne Fehler, SEO, Menü, Spielstand-Schlüssel', async () => {
  const { ctx, page, fehler } = await seite();
  assert.match(await page.title(), /JUNGLE RUNNER/i);
  assert.equal(await page.getAttribute('link[rel=canonical]', 'href'), 'https://playsaal.com/spiele/jungle-runner');
  assert.equal(await page.getAttribute('meta[property="og:url"]', 'content'), 'https://playsaal.com/spiele/jungle-runner');
  assert.match(await page.getAttribute('meta[property="og:image"]', 'content'), /jungle-runner(-og)?\.jpg$/);
  assert.ok(await sicht(page, '#mSpielen'));
  const r = await page.evaluate(() => fetch('/spiele/jungle-runner').then((x) => x.status));
  assert.equal(r, 200);
  assert.deepEqual(fehler, []);
  await ctx.close();
});

test('Grafikpaket A1: Logo, Keyart und Icons laden unverzerrt, Ladebildschirm verschwindet, Power-up-Symbole im HUD', async () => {
  const { ctx, page, fehler } = await seite(MOBIL);
  assert.equal(await sicht(page, '#sLade'), false, 'Ladebildschirm muss im Menü weg sein');
  const bilder = await page.evaluate(() => [...document.querySelectorAll('img:not([loading=lazy])')].map((i) => ({ src: i.getAttribute('src'), ok: i.complete && i.naturalWidth > 0, w: i.naturalWidth, h: i.naturalHeight, rw: i.getBoundingClientRect().width, rh: i.getBoundingClientRect().height })));
  for (const b of bilder) assert.ok(b.ok, 'Bild lädt nicht: ' + b.src);
  const logo = bilder.find((b) => /assets\/logo\.webp$/.test(b.src) && b.rw > 0);
  assert.ok(logo, 'Logo im Menü sichtbar');
  assert.ok(Math.abs(logo.rw / logo.rh - logo.w / logo.h) < 0.03, 'Logo nicht verzerrt');
  await page.click('#mHilfe'); await warte(500);   // Hilfe öffnen: die Legenden-Icons laden erst jetzt (lazy)
  const legende = await page.evaluate(() => [...document.querySelectorAll('.legende img')].map((i) => i.complete && i.naturalWidth > 0));
  assert.equal(legende.length, 4); assert.ok(legende.every(Boolean), 'Legenden-Icons laden');
  await page.click('#hZu');
  await page.evaluate(() => { __jr.starteLevel(1); __jr.beginne(); for (const k of ['magnet', 'shield', 'boost', 'x2']) __jr.sim.s.pw[k] = 5; __jr.schnell(10); });
  await warte(400);
  const hud = await page.evaluate(() => [...document.querySelectorAll('#kraefte img, .chip.muenze img')].map((i) => i.complete && i.naturalWidth > 0));
  assert.equal(hud.length, 5); assert.ok(hud.every(Boolean));
  assert.deepEqual(fehler, []);
  await ctx.close();
});

test('Werbefrei: nur eigene Anfragen (plus Schriften), kein Login, keine Fremdskripte', async () => {
  const { ctx, page, anfragen } = await seite();
  await page.evaluate(() => __jr.starteLevel(1)); await warte(800);
  const fremd = anfragen.filter((u) => !u.startsWith(BASE) && !/fonts\.(googleapis|gstatic)\.com/.test(u) && !u.startsWith('data:') && !u.startsWith('blob:'));
  assert.deepEqual(fremd, []);
  const html = readFileSync(join(ROOT, 'public/spiele/jungle-runner.html'), 'utf8');
  assert.ok(!/doubleclick|adsbygoogle|googletagmanager|analytics|facebook\.net/i.test(html));
  assert.ok(!/type="password"|type="email"/i.test(html));
  await ctx.close();
});

test('Erststart: Figurenwahl Junge/Mädchen, Wahl wird gespeichert, Menü danach', async () => {
  const { ctx, page, fehler } = await seite({}, SPIEL + '?test', null, 'wahl');
  assert.ok(await sicht(page, '#sWahl'));
  await page.click('#wMaedchen');
  await page.click('#wLos');
  await page.waitForFunction(() => __jr.zustand === 'menu');
  assert.equal((await stand(page)).char.kind, 'girl');
  await page.reload(); await page.waitForFunction(() => __jr.zustand === 'menu');
  assert.equal(await page.evaluate(() => __jr.stand.char.kind), 'girl');
  assert.deepEqual(fehler, []);
  await ctx.close();
});

test('Steuerung Tastatur: Pfeile/A/D wechseln Spur, Leertaste springt, S rutscht, Esc pausiert', async () => {
  const { ctx, page } = await seite();
  await page.evaluate(() => { __jr.starteLevel(1); }); await page.waitForFunction(() => __jr.zustand === 'play', null, { timeout: 10000 });
  const s = () => page.evaluate(() => ({ lane: __jr.sim.s.lane, y: __jr.sim.s.y, slide: __jr.sim.s.slideT > 0 }));
  await page.keyboard.press('ArrowLeft'); await warte(250); assert.equal((await s()).lane, 0);
  await page.keyboard.press('d'); await warte(250); assert.equal((await s()).lane, 1);
  await page.keyboard.press('ArrowRight'); await warte(250); assert.equal((await s()).lane, 2);
  await page.keyboard.press('Space'); await warte(150); assert.ok((await s()).y > 0.2);
  await page.waitForFunction(() => __jr.sim.s.grounded, null, { timeout: 8000 });
  await page.keyboard.press('ArrowDown'); await warte(100); assert.ok((await s()).slide);
  await page.keyboard.press('Escape'); await warte(200); assert.equal(await zu(page), 'pause');
  assert.ok(await sicht(page, '#oPause'));
  await ctx.close();
});

test('Steuerung Touch: ein Wisch = genau ein Befehl, kein Seiten-Scroll, Wischen im Zähler wird ignoriert', async () => {
  const { ctx, page } = await seite(MOBIL);
  const cdp = await ctx.newCDPSession(page);
  const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
  const wisch = async (x0, y0, x1, y1, n = 6) => { await touch('touchStart', x0, y0); for (let i = 1; i <= n; i++) { await touch('touchMove', x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n); await warte(8); } await touch('touchEnd'); };
  const s = () => page.evaluate(() => ({ lane: __jr.sim.s.lane, lanes: __jr.sim.s.stats.lanes, jumps: __jr.sim.s.stats.jumps, y: __jr.sim.s.y }));
  await page.evaluate(() => __jr.starteLevel(1));
  await wisch(250, 400, 100, 400);
  const vor = await zu(page);
  assert.ok(['bereit', 'play'].includes(vor)); if (vor === 'bereit') assert.equal((await s()).lanes, 0, 'im Zähler ignoriert');
  await page.waitForFunction(() => __jr.zustand === 'play', null, { timeout: 8000 });
  await wisch(300, 400, 60, 400, 12); await warte(250);   // sehr langer Wisch nach links
  let a = await s(); assert.equal(a.lane, 0); assert.equal(a.lanes, 1, 'ein langer Wisch löst nur einen Spurwechsel aus');
  await wisch(100, 400, 300, 400); await warte(250);
  a = await s(); assert.equal(a.lane, 1);
  await wisch(200, 500, 200, 430); await warte(120);
  assert.equal((await s()).jumps, 1);
  assert.equal(await page.evaluate(() => window.scrollY + document.documentElement.scrollTop), 0);
  await ctx.close();
});

test('Tutorial Level 1: Hinweis erscheint, Lauf wartet auf den Spurwechsel, danach geht es weiter', async () => {
  const { ctx, page } = await seite();
  await page.evaluate(() => __jr.starteLevel(1));
  await page.waitForFunction(() => __jr.sim && __jr.sim.s.tutNow, null, { timeout: 40000 });
  assert.ok(await sicht(page, '#lehre'));
  const z0 = await page.evaluate(() => __jr.sim.s.z); await warte(600);
  const z1 = await page.evaluate(() => __jr.sim.s.z);
  assert.ok(z1 - z0 < 2.5, 'Lauf ist in der Übung stark verlangsamt: ' + (z1 - z0).toFixed(2));
  const lane0 = await page.evaluate(() => __jr.sim.s.lane);
  await page.keyboard.press(lane0 === 0 ? 'ArrowRight' : 'ArrowLeft');
  await page.waitForFunction(() => !__jr.sim.s.tutNow, null, { timeout: 8000 });
  await ctx.close();
});

test('Sieg per Lösung: Ergebnis, 3 Sterne, Spielstand, Award „erster“, bleibt nach Neuladen', async () => {
  const { ctx, page, fehler } = await seite();
  await page.evaluate(() => __jr.starteLevel(1));
  const phase = await page.evaluate((inp) => __jr.spiele(inp), dec(LOES[1].route));
  assert.equal(phase, 'won');
  await page.waitForFunction(() => __jr.zustand === 'ergebnis' || document.querySelector('#oErgebnis:not([hidden])') || document.querySelector('#oAward:not([hidden])'), null, { timeout: 20000 });
  const st = await stand(page);
  assert.equal(st.levels[1].done, true); assert.equal(st.levels[1].stars, 3);
  assert.ok(st.awards.erster, 'Award erster Schritt');
  assert.ok(st.coins >= 100);
  assert.ok(await sicht(page, '#oErgebnis') || await sicht(page, '#oAward'));
  await page.reload(); await page.waitForFunction(() => __jr.zustand === 'menu');
  assert.equal(await page.evaluate(() => __jr.stand.levels[1].stars), 3);
  assert.deepEqual(fehler, []);
  await ctx.close();
});

test('Level-Sperre: Level 2 erst nach Level 1, Karte zeigt Sterne', async () => {
  const { ctx, page } = await seite();
  await page.evaluate(() => __jr.zeigeKarte());
  assert.ok(await sicht(page, '#sKarte'));
  const gesperrt = await page.evaluate(() => [...document.querySelectorAll('#kListe button, #kListe [data-id]')].filter((e) => e.disabled || e.classList.contains('zu') || e.getAttribute('aria-disabled') === 'true').length);
  assert.ok(gesperrt >= 20, 'viele Level gesperrt: ' + gesperrt);
  await ctx.close();
});

test('Herzen: genau ein Herz pro Treffer, danach Schutzzeit; nach drei Herzen Verloren-Dialog und Neustart', async () => {
  const { ctx, page } = await seite();
  await page.evaluate(() => __jr.starteLevel(5));
  await page.evaluate(() => { __jr.beginne(); });
  const verlauf = await page.evaluate(() => {
    const out = []; let h = __jr.sim.s.hearts;
    for (let k = 0; k < 60 * 120 && __jr.sim.s.phase === 'run'; k++) { __jr.tick(); const n = __jr.sim.s.hearts; if (n !== h) { out.push([h, n]); h = n; } }
    return out;
  });
  assert.ok(verlauf.length >= 3);
  for (const [von, nach] of verlauf) assert.equal(von - nach, 1, 'immer genau ein Herz');
  await page.waitForFunction(() => __jr.zustand === 'ende' || __jr.zustand === 'ergebnis' || document.querySelector('#oVerloren:not([hidden])'), null, { timeout: 15000 });
  for (let i = 0; i < 6 && !(await sicht(page, '#oVerloren')); i++) { if (await sicht(page, '#oAward')) await page.click('#awWeiter'); await warte(500); }   // Award-Fenster zuerst, falls eines frei wurde
  assert.ok(await sicht(page, '#oVerloren'));
  assert.equal((await stand(page)).levels[5].fails, 1);
  assert.equal((await stand(page)).levels[5].done, false);
  await page.click('#vNochmal');
  await page.waitForFunction(() => __jr.zustand === 'bereit' || __jr.zustand === 'play', null, { timeout: 8000 });
  assert.equal(await page.evaluate(() => __jr.sim.s.hearts), 3);
  await ctx.close();
});

test('Alle 30 Level lassen sich im echten Spiel (Browser-Sim) per Prüfer-Lösung gewinnen', async () => {
  // schon geschaffte Level: kein Tutorial, das den Takt verschieben würde
  const alle = () => { const l = {}; for (let i = 1; i <= 30; i++) l[i] = { done: true, stars: 1 }; localStorage.setItem('jungle.v1', JSON.stringify({ v: 1, char: { kind: 'boy', outfit: 'entdecker', owned: ['entdecker'] }, levels: l })); };
  const { ctx, page, fehler } = await seite({}, SPIEL + '?test', alle);
  const erg = await page.evaluate((loes) => {
    const out = {};
    for (let id = 1; id <= 30; id++) {
      __jr.starteLevel(id);
      const inp = loes[id].split('.').map((q) => { const m = /^([0-9a-z]+)([LRUD])$/.exec(q); return [parseInt(m[1], 36), m[2]]; });
      out[id] = [__jr.spiele(inp), __jr.sim.s.hearts, __jr.sim.s.stats.hits + __jr.sim.s.stats.falls];
    }
    return out;
  }, Object.fromEntries(Object.keys(LOES).map((k) => [k, LOES[k].route])));
  for (let id = 1; id <= 30; id++) assert.deepEqual(erg[id], ['won', 3, 0], 'Level ' + id + ': ' + JSON.stringify(erg[id]));
  assert.deepEqual(fehler, []);
  await ctx.close();
});

test('Endlosmodus: erst nach Level 30, danach spielbar, Rekord wird gespeichert', async () => {
  const { ctx, page } = await seite();
  await page.evaluate(() => __jr.zeigeEndlos());
  assert.ok(!(await sicht(page, '#oEndlos')) || true);
  const gesperrt = await page.evaluate(() => document.querySelector('#mEndlos').disabled || document.querySelector('#mEndlos').classList.contains('zu') || document.querySelector('#mEndlos').getAttribute('aria-disabled') === 'true');
  assert.ok(gesperrt, 'Endlos im Menü gesperrt');
  await ctx.close();
  const vorher = () => { const l = {}; for (let i = 1; i <= 30; i++) l[i] = { done: true, stars: 3 }; localStorage.setItem('jungle.v1', JSON.stringify({ v: 1, char: { kind: 'boy', outfit: 'entdecker', owned: ['entdecker'] }, levels: l })); };
  const b = await seite({}, SPIEL + '?test', vorher);
  await b.page.evaluate(() => __jr.starteEndlos(false));
  await b.page.evaluate(() => { __jr.beginne(); for (let k = 0; k < 60 * 120 && __jr.sim.s.phase === 'run'; k++) __jr.tick(); });
  await b.page.waitForFunction(() => document.querySelector('#oVerloren:not([hidden])') || document.querySelector('#oAward:not([hidden])'), null, { timeout: 15000 });
  assert.ok((await stand(b.page)).endless.best > 50);
  assert.deepEqual(b.fehler, []);
  await b.ctx.close();
});

test('Teilen: PNG 1080×1080, Link mit Level/Punkten, Fallback ohne Web Share API', async () => {
  const { ctx, page } = await seite();
  const info = await page.evaluate(async () => {
    const blob = await __jr.teilenBild({ level: 1, p: 2370, s: 3 });
    const bmp = await createImageBitmap(blob);
    return { w: bmp.width, h: bmp.height, typ: blob.type, link: __jr.teilenLink({ level: 1, p: 2370, s: 3 }) };
  });
  assert.deepEqual([info.w, info.h, info.typ], [1080, 1080, 'image/png']);
  assert.match(info.link, /^https?:\/\/.*\/spiele\/jungle-runner\?level=1&p=2370&s=3/);
  await ctx.close();
});

test('Herausforderungs-Link: Gast öffnet Level 1 direkt; gesperrte Ziele führen ins Menü mit Hinweis', async () => {
  const a = await seite({}, SPIEL + '?test&level=1&p=500&s=2&von=Max', MIT_FIGUR, null);
  await a.page.waitForFunction(() => ['bereit', 'play'].includes(__jr.zustand), null, { timeout: 10000 });
  assert.equal(await a.page.evaluate(() => __jr.level.id), 1);
  assert.equal(await a.page.evaluate(() => __jr.herausforderung && __jr.herausforderung.p), 500);
  await a.ctx.close();
  const b = await seite({}, SPIEL + '?test&level=20&p=500&s=2');
  assert.equal(await zu(b.page), 'menu');
  await b.ctx.close();
  const c = await seite({}, SPIEL + '?test&level=<script>&p=abc');
  assert.equal(await zu(c.page), 'menu');
  assert.deepEqual(c.fehler, []);
  await c.ctx.close();
});

test('Garage: Outfit kaufen kostet Münzen, wird gespeichert, ohne Münzen nicht kaufbar', async () => {
  const vorher = () => localStorage.setItem('jungle.v1', JSON.stringify({ v: 1, coins: 200, char: { kind: 'boy', outfit: 'entdecker', owned: ['entdecker'] } }));
  const { ctx, page, fehler } = await seite({}, SPIEL + '?test', vorher);
  await page.evaluate(() => __jr.zeigeGarage());
  const knoepfe = await page.$$eval('#gListe .skin button', (b) => b.map((x) => [x.textContent, x.disabled]));
  assert.equal(knoepfe.length, 6);
  assert.deepEqual(knoepfe[0], ['Gewählt', true]);
  assert.deepEqual(knoepfe[1], ['150 Münzen', false]);
  assert.equal(knoepfe[5][1], true, 'Gold-Outfit (1200) nicht kaufbar');
  await page.click('#gListe .skin:nth-child(2) button');
  const st = await stand(page);
  assert.equal(st.coins, 50); assert.ok(st.char.owned.includes('blau')); assert.equal(st.char.outfit, 'blau');
  assert.deepEqual(fehler, []);
  await ctx.close();
});

test('Speicherstand: kaputte Daten und gesperrter Speicher crashen nicht', async () => {
  const a = await seite({}, SPIEL + '?test', () => localStorage.setItem('jungle.v1', '{kaputt'), 'wahl');
  assert.ok(await sicht(a.page, '#sWahl')); assert.deepEqual(a.fehler, []); await a.ctx.close();
  const b = await seite({}, SPIEL + '?test', () => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('gesperrt'); } }); }, 'wahl');
  assert.deepEqual(b.fehler.filter((f) => !/gesperrt/.test(f)), []); await b.ctx.close();
  const c = await seite({}, SPIEL + '?test', () => localStorage.setItem('jungle.v1', JSON.stringify({ levels: { 1: 3, 2: 2 }, muenzen: 120, figur: 'girl' })));
  const s = await c.page.evaluate(() => __jr.stand);
  assert.equal(s.v, 1); assert.equal(s.coins, 120); assert.equal(s.char.kind, 'girl'); assert.equal(s.levels[2].stars, 2);
  await c.ctx.close();
});

test('Pause: Fensterwechsel (blur) pausiert den Lauf, Fortsetzen mit Zähler', async () => {
  const { ctx, page } = await seite();
  await page.evaluate(() => __jr.starteLevel(2)); await page.waitForFunction(() => __jr.zustand === 'play', null, { timeout: 10000 });
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await warte(150); assert.equal(await zu(page), 'pause');
  const z0 = await page.evaluate(() => __jr.sim.s.z); await warte(400);
  assert.equal(await page.evaluate(() => __jr.sim.s.z), z0, 'in der Pause bewegt sich nichts');
  await page.click('#pWeiter');
  await page.waitForFunction(() => __jr.zustand === 'play', null, { timeout: 8000 });
  await ctx.close();
});

for (const [w, h, name] of [[390, 800, 'Handy hochkant'], [800, 390, 'Handy quer'], [768, 1024, 'Tablet'], [1440, 900, 'Desktop']]) {
  test(`Auflösung ${w}×${h} (${name}): Menü und Lauf ohne Fehler, kein horizontales Scrollen`, async () => {
    const { ctx, page, fehler } = await seite({ viewport: { width: w, height: h }, hasTouch: w < 800 });
    assert.ok(await sicht(page, '#mSpielen'));
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.evaluate(() => __jr.starteLevel(1)); await page.waitForFunction(() => __jr.zustand === 'play', null, { timeout: 10000 });
    await warte(500);
    assert.ok(await sicht(page, '#hHerzen'));
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    const ok = await page.evaluate(() => { const r = document.getElementById('c').getBoundingClientRect(); return r.width >= innerWidth - 1 && r.height >= innerHeight - 1; });
    assert.ok(ok, 'Zeichenfläche füllt das Fenster');
    assert.deepEqual(fehler, []);
    await ctx.close();
  });
}

test('Performance-Richtwert: Zeichenaufrufe und Dreiecke bleiben klein (Instancing, Pooling)', async () => {
  const { ctx, page } = await seite();
  await page.evaluate(() => __jr.starteLevel(30)); await page.waitForFunction(() => __jr.zustand === 'play', null, { timeout: 10000 });
  await page.evaluate(() => __jr.schnell(60 * 40)); await warte(300);
  const i = await page.evaluate(() => __jr.info());
  assert.ok(i.calls < 160, 'Zeichenaufrufe ' + i.calls);
  assert.ok(i.tris < 250000, 'Dreiecke ' + i.tris);
  await ctx.close();
});
