// HAU DIE „POLITIKER“ im Browser: Start, Pause, Neustart, Maus und Touch, Speicherstand, Ergebnis, Layouts.
// Start: node --test --test-concurrency=1 tests/politiker.test.mjs   (startet wrangler dev selbst, wie tests/playsaal.test.mjs)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PK_PORT || 8798);
const BASE = `http://127.0.0.1:${PORT}`;
const SPIEL = BASE + '/spiele/hau-die-politiker';

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
  browser = await chromium.launch();
});
after(async () => { await browser?.close(); try { process.kill(-wrangler.pid); } catch (e) {} });

async function seite(opts = {}, url = SPIEL + '?test', vorher) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  const fehler = [];
  page.on('pageerror', (e) => fehler.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') fehler.push(m.text()); });
  if (vorher) await page.addInitScript(vorher);
  await page.goto(url);
  if (url.includes('test')) await page.waitForFunction(() => window.__pk);
  return { ctx, page, fehler };
}
const zustand = (page) => page.evaluate(() => __pk.state);
// Bildschirmposition des am weitesten gekommenen Gegners (oder null)
const ziel = (page) => page.evaluate(() => {
  const g = __pk.game, r = __pk.renderer;
  if (!g || __pk.state !== 'play') return null;
  const e = g.enemies.filter((x) => x.state === 'walk').sort((a, b) => b.p - a.p)[0];
  if (!e) return null;
  const rc = document.getElementById('c').getBoundingClientRect();
  return { x: rc.left + r.ox + e.x * r.s, y: rc.top + r.oy + e.y * r.s, id: e.id };
});
async function spieleBis(page, ende, touch = false, maxMs = 90000) {
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    const st = await zustand(page);
    if (ende.includes(st)) return st;
    const z = await ziel(page);
    if (z) { if (touch) await page.touchscreen.tap(z.x, z.y); else await page.mouse.click(z.x, z.y); }
    await warte(260);
  }
  throw new Error('Zeit abgelaufen, Zustand ' + await zustand(page));
}

test('Seite: lädt ohne Fehler, SEO, PlaySaal-Muster (Zurück-Link, zuletzt gespielt), Module erreichbar', async () => {
  const { ctx, page, fehler } = await seite({}, SPIEL);
  await page.waitForFunction(() => document.getElementById('sTitel') && !document.getElementById('sTitel').hidden);
  assert.match(await page.title(), /POLITIKER/);
  assert.equal(await page.getAttribute('link[rel=canonical]', 'href'), 'https://playsaal.com/spiele/hau-die-politiker');
  assert.equal(await page.getAttribute('meta[property="og:url"]', 'content'), 'https://playsaal.com/spiele/hau-die-politiker');
  assert.match(await page.getAttribute('meta[name=description]', 'content'), /Kakerlaken/);
  assert.equal(await page.getAttribute('a.pz-home', 'href'), '../');
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('playsaal.zuletzt')).s), 'hau-die-politiker');
  for (const f of ['game.js', 'sim.js', 'levels.js', 'layout.js', 'render.js', 'art.js', 'audio.js']) assert.equal((await fetch(`${SPIEL}/${f}`)).status, 200, f);
  assert.equal((await fetch(BASE + '/bilder/hau-die-politiker.jpg')).status, 200);
  assert.ok(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)), 'kein Querscrollen');
  assert.deepEqual(fehler, []);
  await ctx.close();
});

test('Ablauf: Spielen → Bereit → Los → Pause (Zeit steht) → Weiter → Neustart → Levelauswahl → Titel', async () => {
  const { ctx, page, fehler } = await seite({ viewport: { width: 1280, height: 720 } });
  await page.click('#tSpielen');
  assert.equal(await zustand(page), 'ready');
  assert.match(await page.textContent('#bTitel'), /Da krabbelt was/);
  await page.click('#bLos');
  assert.equal(await zustand(page), 'play');
  await warte(500);
  await page.click('#bPause');
  assert.equal(await zustand(page), 'pause');
  const t1 = await page.evaluate(() => __pk.game.t);
  await warte(700);
  assert.equal(await page.evaluate(() => __pk.game.t), t1, 'in der Pause läuft nichts');
  await page.click('#pWeiter');
  assert.equal(await zustand(page), 'play');
  await warte(400);
  assert.ok(await page.evaluate(() => __pk.game.t) > t1);
  await page.keyboard.press('Escape');
  assert.equal(await zustand(page), 'pause');
  await page.keyboard.press('Escape');
  assert.equal(await zustand(page), 'play');
  const alt = await page.evaluate(() => __pk.game.t);
  await page.click('#bPause'); await page.click('#pNeu');
  assert.equal(await zustand(page), 'play');
  assert.ok(await page.evaluate(() => __pk.game.t) < alt, 'Neustart beginnt bei null');
  assert.equal(await page.evaluate(() => __pk.game.defense), 5);
  await page.click('#bPause'); await page.click('#pLevels');
  assert.equal(await zustand(page), 'levels');
  await page.click('#lZurueck');
  assert.equal(await zustand(page), 'title');
  assert.deepEqual(fehler, []);
  await ctx.close();
});

test('Maus: Treffer sofort bei pointerdown, Abklingzeit verhindert Dauerfeuer, Fehlschlag kostet keinen Sitz', async () => {
  const { ctx, page, fehler } = await seite({ viewport: { width: 1280, height: 720 } });
  await page.evaluate(() => __pk.start(1));
  let z = null;
  for (let i = 0; i < 60 && !z; i++) { await warte(100); z = await ziel(page); }
  assert.ok(z, 'Gegner erscheint');
  // Fehlschlag in eine leere Ecke
  await page.mouse.click(30, 700);
  let s = await page.evaluate(() => __pk.game.summary());
  assert.equal(s.strikes, 1); assert.equal(await page.evaluate(() => __pk.game.defense), 5);
  await warte(250);
  z = await ziel(page);
  // zwei Klicks unmittelbar hintereinander: nur einer zählt
  await page.mouse.click(z.x, z.y); await page.mouse.click(z.x, z.y);
  s = await page.evaluate(() => __pk.game.summary());
  assert.equal(s.strikes, 2, 'zweiter Klick innerhalb der Abklingzeit wird ignoriert');
  assert.equal(s.hit, 1);
  assert.ok((await page.evaluate(() => __pk.game.score)) >= 100);
  assert.deepEqual(fehler, []);
  await ctx.close();
});

test('Touch: Tippen trifft, kein Zoomen/Scrollen, Seite bleibt stehen', async () => {
  const { ctx, page, fehler } = await seite({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  await page.evaluate(() => __pk.start(1));
  let z = null;
  for (let i = 0; i < 60 && !z; i++) { await warte(100); z = await ziel(page); }
  await page.touchscreen.tap(z.x, z.y);
  assert.equal(await page.evaluate(() => __pk.game.summary().hit), 1);
  assert.equal(await page.evaluate(() => [scrollX, scrollY, visualViewport.scale]).then((a) => a.join()), '0,0,1');
  assert.equal(await page.evaluate(() => getComputedStyle(document.getElementById('c')).touchAction), 'none');
  assert.deepEqual(fehler, []);
  await ctx.close();
});

test('Level 1 gewinnen: Ergebnis mit Sternen, Genauigkeit, Rekord; Fortschritt bleibt nach dem Neuladen; Level 2 frei', async () => {
  const { ctx, page, fehler } = await seite({ viewport: { width: 1280, height: 720 } });
  await page.evaluate(() => __pk.resetStore());
  await page.evaluate(() => __pk.start(1));
  assert.equal(await spieleBis(page, ['result']), 'result');
  assert.match(await page.textContent('#eTitel'), /gerettet/);
  assert.equal(await page.locator('#eSterne svg.an').count(), 3);
  assert.match(await page.textContent('#eStats'), /3 \/ 3/);
  assert.match(await page.textContent('#eStats'), /\d+ %/);
  const gespeichert = await page.evaluate(() => JSON.parse(localStorage.getItem('politiker.v1')));
  assert.equal(gespeichert.stars[1], 3); assert.equal(gespeichert.unlocked, 2); assert.ok(gespeichert.best[1] >= 300);
  await page.reload(); await page.waitForFunction(() => window.__pk);
  await page.click('#tLevels');
  assert.equal(await page.isDisabled('.lv[data-level="2"]'), false);
  assert.equal(await page.isDisabled('.lv[data-level="3"]'), true);
  assert.equal(await page.locator('.lv[data-level="1"] svg path[fill="#FFD21C"]').count(), 3);
  assert.deepEqual(fehler, []);
  await ctx.close();
});

test('Niederlage nach fünf besetzten Sitzen, Ergebnis ohne Sterne, „Erneut versuchen“ startet neu', async () => {
  const { ctx, page, fehler } = await seite({ viewport: { width: 1280, height: 720 } });
  await page.evaluate(() => __pk.start(8));
  await page.evaluate(() => { const g = __pk.game; for (let i = 0; i < 400 && !g.done; i++) g.advance(0.5); });
  await page.waitForFunction(() => __pk.state === 'result', null, { timeout: 8000 });
  assert.match(await page.textContent('#eTitel'), /Sitze besetzt/);
  assert.equal(await page.locator('#eSterne svg.an').count(), 0);
  assert.equal(await page.textContent('#eWeiter'), 'Erneut versuchen');
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('politiker.v1')).unlocked), 1, 'Niederlage schaltet nichts frei');
  await page.click('#eWeiter');
  assert.equal(await zustand(page), 'play');
  assert.equal(await page.evaluate(() => __pk.game.defense), 5);
  assert.deepEqual(fehler, []);
  await ctx.close();
});

test('Speicher: beschädigte Daten blockieren nichts, Ton aus bleibt gespeichert', async () => {
  for (const kaputt of ['{{{', 'null', '[1,2]', JSON.stringify({ unlocked: 'x', stars: { 1: 99, 2: 'a' }, best: 5, sound: 0, endless: 3 })]) {
    const { ctx, page, fehler } = await seite({}, SPIEL + '?test', `localStorage.setItem('politiker.v1', ${JSON.stringify(kaputt)})`);
    await page.click('#tLevels');
    assert.ok(await page.locator('.lv:not([disabled])').count() >= 1, 'Level 1 frei bei ' + kaputt);
    assert.equal(await page.locator('.lv:not([disabled])').count() <= 3, true);
    await page.click('#lZurueck'); await page.click('#tSpielen'); await page.click('#bLos');
    assert.equal(await zustand(page), 'play');
    assert.deepEqual(fehler, [], kaputt);
    await ctx.close();
  }
  const { ctx, page } = await seite();
  await page.evaluate(() => __pk.resetStore());
  await page.reload(); await page.waitForFunction(() => window.__pk);
  assert.equal(await page.textContent('#tTon'), 'Ton: an');
  await page.click('#tTon');
  assert.equal(await page.textContent('#tTon'), 'Ton: aus');
  await page.reload(); await page.waitForFunction(() => window.__pk);
  assert.equal(await page.textContent('#tTon'), 'Ton: aus');
  await ctx.close();
});

test('Verborgener Tab pausiert, nach der Rückkehr springt kein Gegner', async () => {
  const { ctx, page } = await seite({ viewport: { width: 1280, height: 720 } });
  await page.evaluate(() => __pk.start(3));
  await warte(2800);
  const vor = await page.evaluate(() => ({ t: __pk.game.t, p: __pk.game.enemies.map((e) => e.p) }));
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
  assert.equal(await zustand(page), 'pause');
  await warte(2500);
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); });
  const nach = await page.evaluate(() => ({ t: __pk.game.t, p: __pk.game.enemies.map((e) => e.p) }));
  assert.ok(nach.t - vor.t < 0.5, 'Spielzeit stand: ' + (nach.t - vor.t));
  assert.ok(nach.p.every((p, i) => p - vor.p[i] < 0.15), 'kein Sprung');
  await ctx.close();
});

test('Große Klatsche: erst ab Level 10 sichtbar, Leertaste macht scharf, Einschlag trifft mehrere, Ladung weg', async () => {
  const { ctx, page, fehler } = await seite({ viewport: { width: 1280, height: 720 } });
  await page.evaluate(() => __pk.start(5));
  assert.ok(await page.isHidden('#bPower'));
  await page.evaluate(() => __pk.start(10));
  assert.ok(await page.isVisible('#bPower'));
  await page.waitForFunction(() => __pk.game.enemies.length >= 2, null, { timeout: 15000 });
  await page.evaluate(() => { __pk.game.charge = 1; });
  await page.waitForFunction(() => document.getElementById('bPower').className.includes('bereit'), null, { timeout: 3000 });
  await page.keyboard.press('Space');
  await page.waitForFunction(() => document.getElementById('bPower').className.includes('scharf'), null, { timeout: 3000 });
  const z = await ziel(page);
  await page.mouse.click(z.x, z.y);
  assert.equal(await page.evaluate(() => __pk.game.charge), 0);
  await page.waitForFunction(() => !document.getElementById('bPower').className.includes('scharf'), null, { timeout: 3000 });
  assert.deepEqual(fehler, []);
  await ctx.close();
});

test('Dauersitzung: gesperrt bis Level 30, danach spielbar mit Wellenanzeige', async () => {
  const { ctx, page, fehler } = await seite({ viewport: { width: 1280, height: 720 } });
  await page.evaluate(() => __pk.resetStore());
  await page.click('#tLevels');
  assert.ok(await page.isDisabled('#lDauer'));
  await page.evaluate(() => localStorage.setItem('politiker.v1', JSON.stringify({ v: 1, unlocked: 31, stars: { 30: 2 } })));
  await page.reload(); await page.waitForFunction(() => window.__pk);
  await page.click('#tDauer');
  assert.equal(await zustand(page), 'ready');
  await page.click('#bLos');
  await page.waitForFunction(() => __pk.game.wave >= 1, null, { timeout: 8000 });
  assert.equal(await page.textContent('#hRestL'), 'Welle');
  assert.deepEqual(fehler, []);
  await ctx.close();
});

const GROESSEN = [
  { n: 'Handy hoch', w: 390, h: 844, touch: true }, { n: 'kleines Handy hoch', w: 360, h: 640, touch: true },
  { n: 'Handy quer', w: 844, h: 390, touch: true }, { n: 'kleines Handy quer', w: 640, h: 360, touch: true },
  { n: 'Tablet hoch', w: 768, h: 1024, touch: true }, { n: 'Laptop', w: 1280, h: 720 }, { n: 'Full HD', w: 1920, h: 1080 }
];
for (const G of GROESSEN) {
  test(`Layout ${G.n} ${G.w}×${G.h}: alles sichtbar, kein Überlauf, Gegner nie verdeckt, Treffer-Mindestgröße, Level 12 und 30`, async () => {
    const { ctx, page, fehler } = await seite({ viewport: { width: G.w, height: G.h }, hasTouch: !!G.touch, isMobile: !!G.touch });
    for (const level of [12, 30]) {
      await page.evaluate((l) => __pk.start(l), level);
      const probleme = [];
      let maxAktiv = 0;
      for (let i = 0; i < 70; i++) {
        await page.evaluate(() => __pk.game.advance(0.5));
        const r = await page.evaluate(() => {
          const g = __pk.game, rd = __pk.renderer, rc = document.getElementById('c').getBoundingClientRect();
          const sicht = [...document.querySelectorAll('.hud > *, .hud .zeile > *, #bPower, #bossbar, .pz-home')].filter((e) => !e.hidden && e.offsetParent !== null || e.classList.contains('pz-home')).map((e) => e.getBoundingClientRect());
          const out = [];
          let aktiv = 0;
          for (const e of g.enemies) {
            if (e.state !== 'walk') continue;
            aktiv++;
            const x = rc.left + rd.ox + e.x * rd.s, y = rc.top + rd.oy + e.y * rd.s, rad = e.def.bodyR * g.layout.unit * rd.s * 0.7;
            if (x - rad < 0 || x + rad > innerWidth || y - rad < 0 || y + rad > innerHeight) out.push(`außerhalb ${e.type} ${x | 0},${y | 0}`);
            for (const b of sicht) if (x > b.left - rad * 0.3 && x < b.right + rad * 0.3 && y > b.top - rad * 0.3 && y < b.bottom + rad * 0.3 && b.width > 0) out.push(`verdeckt ${e.type} ${x | 0},${y | 0} von ${b.left | 0},${b.top | 0},${b.width | 0}x${b.height | 0}`);
            const hitPx = Math.max(e.def.hitR * g.layout.unit, g.minHit) * rd.s;
            if (hitPx < 21.5) out.push(`Trefferfläche ${hitPx.toFixed(1)}px`);
          }
          return { out, aktiv, ueber: document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight };
        });
        maxAktiv = Math.max(maxAktiv, r.aktiv);
        assert.ok(!r.ueber, 'Seite scrollt');
        probleme.push(...r.out);
        const done = await page.evaluate(() => __pk.game.done);
        if (done) break;
        // laufende Gegner abräumen, damit das Level weitergeht
        await page.evaluate(() => { const g = __pk.game; for (const e of g.enemies.slice()) if (e.state === 'walk' && e.p > 0.6) { g.advance(0.21); g.strike(e.x, e.y); } });
      }
      assert.deepEqual([...new Set(probleme)].slice(0, 5), [], `Level ${level}`);
      assert.ok(maxAktiv >= 2, 'es waren Gegner im Spiel');
    }
    assert.deepEqual(fehler, []);
    await ctx.close();
  });
}

test('Ausrichtung ändern mitten in der Runde: Gegner bleiben erhalten und sichtbar', async () => {
  const { ctx, page, fehler } = await seite({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });
  await page.evaluate(() => __pk.start(14));
  await page.evaluate(() => { const g = __pk.game; for (let i = 0; i < 40 && g.activeCount < 3; i++) g.advance(0.5); });
  const vor = await page.evaluate(() => __pk.game.enemies.map((e) => e.id + ':' + e.p.toFixed(3)).join());
  assert.equal(await page.evaluate(() => __pk.game.layoutName), 'land');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(() => __pk.game.layoutName === 'port');
  assert.equal(await page.evaluate(() => __pk.game.enemies.map((e) => e.id + ':' + e.p.toFixed(3)).join()).then((s) => s.split(',').length), vor.split(',').length);
  const sicht = await page.evaluate(() => { const g = __pk.game, rd = __pk.renderer; return g.enemies.every((e) => { const x = rd.ox + e.x * rd.s, y = rd.oy + e.y * rd.s; return x > 0 && x < innerWidth && y > 0 && y < innerHeight; }); });
  assert.ok(sicht);
  assert.deepEqual(fehler, []);
  await ctx.close();
});
