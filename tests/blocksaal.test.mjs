// BLOCKSAAL im Browser und am Worker: Spielablauf, Tastatur, Touch, Pause/Neustart/Ton, Bestwert, Teilen,
// Herausforderungslink und Link-Vorschau (Open Graph) ohne JavaScript.
// Start: node --test --test-concurrency=1 tests/blocksaal.test.mjs   (startet wrangler dev selbst, wie tests/playsaal.test.mjs)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.BS_PORT || 8796);
const BASE = `http://127.0.0.1:${PORT}`;
const SPIEL = BASE + '/spiele/blocksaal';

function ladePlaywright() {
  const req = createRequire(import.meta.url);
  try { return req('playwright'); } catch (e) {}
  const g = execSync('npm root -g').toString().trim();
  try { return req(join(g, 'playwright')); } catch (e) {}
  return req('/opt/npm-tools/node_modules/playwright');
}
const { chromium, devices } = ladePlaywright();
let wrangler, browser;
const warte = (ms) => new Promise((r) => setTimeout(r, ms));

before(async () => {
  wrangler = spawn('npx', ['-y', 'wrangler@4', 'dev', '--port', String(PORT), '--ip', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore', detached: true });
  for (let i = 0; i < 90; i++) { try { if ((await fetch(BASE + '/')).ok) break; } catch (e) {} await warte(1000); }
  browser = await chromium.launch();
});
after(async () => { await browser?.close(); try { process.kill(-wrangler.pid); } catch (e) {} });

const HANDY = { ...devices['iPhone 13'], permissions: [] };
const DESKTOP = { viewport: { width: 1280, height: 800 }, permissions: ['clipboard-read', 'clipboard-write'] };

async function seite(opts = {}, url = SPIEL + '?test', vorher) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  const fehler = [];
  page.on('pageerror', (e) => fehler.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') fehler.push(m.text()); });
  if (vorher) await page.addInitScript(vorher);
  await page.goto(url);
  await page.waitForFunction(() => window.__bs);
  return { ctx, page, fehler };
}
const st = (page) => page.evaluate(() => ({
  mode: __bs.mode, x: __bs.game.piece && __bs.game.piece.x, y: __bs.game.piece && __bs.game.piece.y, r: __bs.game.piece && __bs.game.piece.r,
  t: __bs.game.piece && __bs.game.piece.t, score: __bs.game.score, lines: __bs.game.lines, level: __bs.game.level, over: __bs.game.over,
  cells: __bs.game.board.flat().filter(Boolean).length
}));
// Brett so füllen, dass die unteren n Reihen bis auf die Spalten 0 und 1 voll sind (Lücke für ein O-Teil)
const fuelle = (page, n) => page.evaluate((k) => { const g = __bs.game; for (let y = 20 - k; y < 20; y++) for (let x = 2; x < 10; x++) g.board[y][x] = 2; }, n);
const starten = async (page) => { await page.click('#btnStart'); await page.waitForFunction(() => __bs.mode === 'playing'); };

test('Start: Seite lädt ohne Fehler, Startkarte, Eigenname und PlaySaal-Einbindung', async () => {
  const { ctx, page, fehler } = await seite(DESKTOP);
  assert.match(await page.title(), /BlockSaal/);
  assert.equal(await page.locator('#startOv').isVisible(), true);
  assert.equal(await page.locator('.pz-home').getAttribute('href'), '../', 'Knopf „Alle Spiele“');
  assert.equal(await page.locator('link[rel=canonical]').getAttribute('href'), 'https://playsaal.com/spiele/blocksaal');
  const farben = await page.evaluate(() => ({ bg: getComputedStyle(document.body).backgroundColor, btn: getComputedStyle(document.getElementById('btnStart')).backgroundColor }));
  assert.equal(farben.bg, 'rgb(17, 18, 26)', 'Anthrazit #11121A');
  assert.equal(farben.btn, 'rgb(255, 210, 28)', 'Aktionsknopf Gelb #FFD21C');
  assert.equal(await page.locator('#challengeBox').isHidden(), true, 'ohne Link keine Herausforderung');
  await starten(page);
  assert.equal(await page.locator('#startOv').isHidden(), true);
  assert.deepEqual(fehler, []);
  await ctx.close();
});

test('Spielablauf: Teil fällt langsam, Anzeigen für Punkte, Reihen, nächstes Teil und Stufe, Reihen verschwinden', async () => {
  const { ctx, page, fehler } = await seite(DESKTOP);
  await starten(page);
  const s0 = await st(page);
  await warte(1100);
  const s1 = await st(page);
  assert.ok(s1.y > s0.y, `Teil fällt von selbst (${s0.y} → ${s1.y})`);
  assert.ok(s1.y - s0.y <= 2, 'Stufe 1 ist langsam');
  assert.equal(await page.locator('#vLevel').textContent(), '1');
  assert.equal(await page.locator('#next').isVisible(), true);
  // Zwei fast volle Reihen + O-Teil in die Lücke
  await fuelle(page, 2);
  await page.evaluate(() => { const g = __bs.game; g.piece = { t: 'O', r: 0, x: 0, y: 0 }; g.acc = 0; g.lockAcc = 0; g.lowestY = 0; });
  await page.keyboard.press('Space');
  await page.waitForFunction(() => __bs.game.lines === 2);
  const s2 = await st(page);
  assert.equal(s2.lines, 2);
  assert.ok(s2.score >= 300, 'Punkte für zwei Reihen: ' + s2.score);
  await page.waitForFunction(() => !__bs.game.clearing);
  assert.equal(await page.evaluate(() => __bs.game.board.flat().filter(Boolean).length), 0, 'volle Reihen sind verschwunden');
  assert.equal(await page.locator('#vLines').textContent(), '2');
  assert.match(await page.locator('#vScore').textContent(), /^\d/);
  // Stufe steigt mit geschafften Reihen
  await page.evaluate(() => { __bs.game.lines = 9; });
  await fuelle(page, 1);
  await page.evaluate(() => { const g = __bs.game; g.piece = { t: 'O', r: 0, x: 0, y: 0 }; g.acc = 0; g.lockAcc = 0; g.lowestY = 0; });
  await page.keyboard.press('Space');
  await page.waitForFunction(() => __bs.game.level === 2);
  assert.equal(await page.locator('#vLevel').textContent(), '2');
  assert.deepEqual(fehler, []);
  await ctx.close();
});

test('Tastatur am Desktop: Pfeile, Drehen, Leertaste, P = Pause, M = Ton; Touchknöpfe am Desktop ausgeblendet', async () => {
  const { ctx, page } = await seite(DESKTOP);
  assert.equal(await page.locator('#controls').isHidden(), true, 'große Touchknöpfe nur am Handy');
  assert.equal(await page.locator('#keys').isVisible(), true, 'Tastenhinweis am Desktop');
  await starten(page);
  await page.evaluate(() => { const g = __bs.game; g.piece = { t: 'T', r: 0, x: 3, y: 2 }; g.acc = 0; });
  await page.keyboard.press('ArrowLeft'); assert.equal((await st(page)).x, 2);
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight'); assert.equal((await st(page)).x, 4);
  await page.keyboard.press('ArrowUp'); assert.equal((await st(page)).r, 1, 'drehen');
  const y0 = (await st(page)).y;
  await page.keyboard.press('ArrowDown'); assert.equal((await st(page)).y, y0 + 1, 'schneller fallen');
  // Pause
  await page.keyboard.press('KeyP');
  assert.equal((await st(page)).mode, 'paused');
  assert.equal(await page.locator('#pauseOv').isVisible(), true);
  const yp = (await st(page)).y; await warte(1300);
  assert.equal((await st(page)).y, yp, 'in der Pause fällt nichts');
  await page.keyboard.press('ArrowLeft');
  assert.equal((await st(page)).x, 4, 'in der Pause keine Eingabe');
  await page.keyboard.press('KeyP'); assert.equal((await st(page)).mode, 'playing');
  // Ton
  assert.equal(await page.getAttribute('#btnMute', 'aria-pressed'), 'false');
  await page.keyboard.press('KeyM');
  assert.equal(await page.getAttribute('#btnMute', 'aria-pressed'), 'true');
  assert.equal(await page.evaluate(() => localStorage.getItem('blocksaal.muted')), 'true');
  await page.reload(); await page.waitForFunction(() => window.__bs);
  assert.equal(await page.getAttribute('#btnMute', 'aria-pressed'), 'true', 'Ton-Aus bleibt nach dem Neuladen');
  // Leertaste lässt fallen
  await starten(page);
  const c0 = (await st(page)).cells;
  await page.keyboard.press('Space');
  await page.waitForFunction((c) => __bs.game.board.flat().filter(Boolean).length > c, c0);
  assert.equal((await st(page)).cells, c0 + 4);
  await ctx.close();
});

test('Pause-Knopf, Weiter, Neustart mit Rückfrage', async () => {
  const { ctx, page } = await seite(DESKTOP);
  await starten(page);
  await page.evaluate(() => { __bs.game.score = 500; });
  await page.click('#btnPause');
  assert.equal(await page.locator('#pauseTitle').textContent(), 'Pause');
  await page.click('#btnResume');
  assert.equal((await st(page)).mode, 'playing');
  await page.click('#btnRestart');
  assert.equal(await page.locator('#pauseTitle').textContent(), 'Neu starten?');
  assert.equal((await st(page)).score, 500, 'bis zur Bestätigung geht nichts verloren');
  await page.click('#btnResume');
  assert.equal((await st(page)).score, 500);
  await page.click('#btnRestart'); await page.click('#btnNew');
  await page.waitForFunction(() => __bs.mode === 'playing' && __bs.game.score === 0);
  assert.equal((await st(page)).cells, 0, 'leeres Feld nach Neustart');
  await ctx.close();
});

test('Handy (390 × 844, Touch): vier große Knöpfe steuern, Layout passt in den Bildschirm', async () => {
  const { ctx, page, fehler } = await seite(HANDY);
  await page.screenshot({ path: join(ROOT, 'test-results', 'blocksaal-start.png') }).catch(() => {});
  await page.tap('#btnStart');
  await page.waitForFunction(() => __bs.mode === 'playing');
  const m = await page.evaluate(() => {
    const r = (id) => document.getElementById(id).getBoundingClientRect();
    const knoepfe = ['cLeft', 'cRight', 'cRotate', 'cDrop'].map((id) => { const b = r(id); return { id, w: Math.round(b.width), h: Math.round(b.height), unten: Math.round(b.bottom), links: Math.round(b.left), rechts: Math.round(b.right) }; });
    const cv = r('board'), side = document.querySelector('.side').getBoundingClientRect();
    return { knoepfe, brett: { w: Math.round(cv.width), h: Math.round(cv.height), unten: Math.round(cv.bottom) }, sideRechts: Math.round(side.right), sideUnten: Math.round(side.bottom),
      scrollB: document.documentElement.scrollWidth, scrollH: document.documentElement.scrollHeight, vw: innerWidth, vh: innerHeight,
      sichtbar: ['vScore', 'vLines', 'vLevel', 'next'].map((id) => { const b = r(id); return b.width > 0 && b.height > 0 && b.right <= innerWidth + 0.5 && b.bottom <= innerHeight + 0.5; }) };
  });
  for (const k of m.knoepfe) { assert.ok(k.w >= 64 && k.h >= 64, `${k.id} groß genug: ${k.w}×${k.h}`); assert.ok(k.unten <= m.vh && k.links >= 0 && k.rechts <= m.vw, k.id + ' im Bild'); }
  assert.ok(m.brett.h > 400, 'Spielfeld nutzt die Höhe: ' + m.brett.h);
  assert.ok(m.brett.w / m.brett.h > 0.45 && m.brett.w / m.brett.h < 0.55, 'Seitenverhältnis 10:20');
  assert.ok(m.brett.unten <= m.knoepfe[0].unten, 'Spielfeld über den Knöpfen');
  assert.equal(m.scrollB, m.vw, 'kein seitliches Scrollen'); assert.ok(m.scrollH <= m.vh, 'kein Scrollen nach unten');
  assert.deepEqual(m.sichtbar, [true, true, true, true], 'Anzeigen sichtbar');
  assert.equal(await page.locator('#keys').isHidden(), true);

  await page.evaluate(() => { const g = __bs.game; g.piece = { t: 'T', r: 0, x: 3, y: 4 }; g.acc = 0; g.lockAcc = 0; });
  await page.tap('#cLeft'); assert.equal((await st(page)).x, 2, 'links');
  await page.tap('#cRight'); await page.tap('#cRight'); assert.equal((await st(page)).x, 4, 'rechts');
  await page.tap('#cRotate'); assert.equal((await st(page)).r, 1, 'drehen');
  const c0 = (await st(page)).cells;
  await page.tap('#cDrop');
  await page.waitForFunction((c) => __bs.game.board.flat().filter(Boolean).length > c, c0);
  assert.equal((await st(page)).cells, c0 + 4, 'sofort fallen lassen');
  // Halten wiederholt: Maus-/Zeigerdruck auf „links“ bewegt das Teil mehrfach
  await page.evaluate(() => { const g = __bs.game; g.piece = { t: 'O', r: 0, x: 7, y: 1 }; g.acc = 0; g.lockAcc = 0; });
  const b = await page.locator('#cLeft').boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down(); await warte(700); await page.mouse.up();
  assert.ok((await st(page)).x <= 4, 'gehalten bewegt mehrfach: x=' + (await st(page)).x);
  const xh = (await st(page)).x; await warte(300); assert.equal((await st(page)).x, xh, 'nach dem Loslassen Ruhe');
  assert.deepEqual(fehler, []);
  await ctx.close();
});

test('Kleines Handy (360 × 640) und Querformat: Knöpfe und Spielfeld bleiben im Bild', async () => {
  for (const vp of [{ width: 360, height: 640 }, { width: 320, height: 568 }, { width: 844, height: 390 }]) {
    const { ctx, page } = await seite({ ...HANDY, viewport: vp, screen: vp });
    await page.tap('#btnStart');
    const m = await page.evaluate(() => {
      const r = (id) => document.getElementById(id).getBoundingClientRect();
      const k = ['cLeft', 'cRight', 'cRotate', 'cDrop'].map((id) => r(id));
      return { kMin: Math.round(Math.min(...k.map((b) => Math.min(b.width, b.height)))), kUnten: Math.round(Math.max(...k.map((b) => b.bottom))), brettH: Math.round(r('board').height), brettB: Math.round(r('board').width),
        scrollB: document.documentElement.scrollWidth, scrollH: document.documentElement.scrollHeight, vw: innerWidth, vh: innerHeight, sideR: Math.round(document.querySelector('.side').getBoundingClientRect().right) };
    });
    const n = `${vp.width}×${vp.height}`;
    assert.ok(m.kMin >= 44, `${n}: Knöpfe mindestens 44 px (${m.kMin})`);
    assert.ok(m.kUnten <= m.vh, `${n}: Knöpfe im Bild`);
    assert.ok(m.brettH >= 150 && m.brettB >= 80, `${n}: Spielfeld nutzbar ${m.brettB}×${m.brettH}`);
    assert.ok(m.scrollB <= m.vw && m.scrollH <= m.vh, `${n}: kein Scrollen`);
    assert.ok(m.sideR <= m.vw, `${n}: Anzeigen im Bild`);
    await ctx.close();
  }
});

test('Spielende: Karte mit Ergebnis und „Freunde herausfordern“, Bestwert wird gespeichert und bleibt', async () => {
  const { ctx, page, fehler } = await seite(DESKTOP);
  await starten(page);
  // Sieben Reihen, dann Feld bis oben vollstopfen -> Spielende
  await page.evaluate(() => { const g = __bs.game; g.lines = 7; g.score = 1234; for (let y = 2; y < 20; y++) for (let x = 1; x < 10; x++) g.board[y][x] = 3; g.piece = { t: 'O', r: 0, x: 4, y: 0 }; });
  await page.keyboard.press('Space');
  await page.waitForFunction(() => __bs.mode === 'over');
  await page.waitForSelector('#overOv:not([hidden])');
  const btn = page.locator('#btnShare');
  assert.equal(await btn.isVisible(), true);
  assert.match(await btn.textContent(), /Freunde herausfordern/);
  const b = await btn.boundingBox(); assert.ok(b.height >= 52 && b.width >= 200, 'gut sichtbar groß');
  assert.equal(await page.locator('#oLines').textContent(), '7');
  assert.match(await page.locator('#oScore').textContent(), /1\.2\d\d|1\.\d{3}/);
  assert.equal(await page.locator('#stamp').isVisible(), true, 'neuer Bestwert');
  const gespeichert = await page.evaluate(() => JSON.parse(localStorage.getItem('blocksaal.v1')));
  assert.ok(gespeichert.score >= 1234 && gespeichert.lines === 7, JSON.stringify(gespeichert));
  assert.match(await page.locator('.fine').last().textContent(), /kein verifizierter Ranglistenrekord/);
  // Nochmal: Bestwert steht in der Anzeige, auch nach Neuladen
  await page.click('#btnAgain'); await page.waitForFunction(() => __bs.mode === 'playing');
  assert.equal(await page.locator('#vBest').textContent(), (await page.evaluate(() => new Intl.NumberFormat('de-DE').format(JSON.parse(localStorage.getItem('blocksaal.v1')).score))));
  await page.reload(); await page.waitForFunction(() => window.__bs);
  await page.waitForFunction(() => document.getElementById('vBest').textContent !== '0', null, { timeout: 3000 });   // erster Frame
  assert.notEqual(await page.locator('#vBest').textContent(), '0', 'Bestwert nach Neuladen');
  // Schlechtere Runde überschreibt den Bestwert nicht
  await starten(page);
  await page.evaluate(() => { const g = __bs.game; g.score = 10; g.lines = 0; for (let y = 2; y < 20; y++) for (let x = 1; x < 10; x++) g.board[y][x] = 3; g.piece = { t: 'O', r: 0, x: 4, y: 0 }; });
  await page.keyboard.press('Space');
  await page.waitForFunction(() => __bs.mode === 'over');
  const nach = await page.evaluate(() => JSON.parse(localStorage.getItem('blocksaal.v1')));
  assert.deepEqual(nach, gespeichert);
  assert.equal(await page.locator('#stamp').isHidden(), true);
  assert.deepEqual(fehler, []);
  await ctx.close();
});

// Spiel mit n Reihen beenden
async function beendeMit(page, reihen) {
  await page.evaluate((n) => { const g = __bs.game; g.lines = n; g.score = 100 + n; for (let y = 2; y < 20; y++) for (let x = 1; x < 10; x++) g.board[y][x] = 3; g.piece = { t: 'O', r: 0, x: 4, y: 0 }; }, reihen);
  await page.keyboard.press('Space');
  await page.waitForFunction(() => __bs.mode === 'over');
  await page.waitForSelector('#overOv:not([hidden])');
}

test('Teilen am Handy: native Teilen-Funktion mit genau dem Text und dem Link zur normalen Spielseite', async () => {
  const { ctx, page, fehler } = await seite(HANDY, SPIEL + '?test', () => {
    window.__geteilt = [];
    navigator.share = (d) => { window.__geteilt.push(d); return Promise.resolve(); };
    navigator.canShare = () => true;
  });
  await page.tap('#btnStart'); await page.waitForFunction(() => __bs.mode === 'playing');
  await page.evaluate(() => { window.focus(); });
  await page.evaluate(() => { const g = __bs.game; g.lines = 42; g.score = 4242; for (let y = 2; y < 20; y++) for (let x = 1; x < 10; x++) g.board[y][x] = 3; g.piece = { t: 'O', r: 0, x: 4, y: 0 }; });
  await page.tap('#cDrop');
  await page.waitForSelector('#overOv:not([hidden])');
  await page.tap('#btnShare');
  await page.waitForFunction(() => window.__geteilt.length === 1);
  const d = await page.evaluate(() => window.__geteilt[0]);
  assert.equal(d.text, '🧱 Ich habe 42 Reihen bei BlockSaal geschafft! Schlägst du mich? 🎮 https://playsaal.com/spiele/blocksaal?c=42');
  assert.ok(!d.url, 'Link steckt nur im Text, damit er nicht doppelt erscheint');
  assert.match(await page.locator('#shareMsg').textContent(), /Geteilt/);
  assert.equal(await page.locator('#btnShare').isDisabled(), false);
  assert.deepEqual(fehler, []);
  await ctx.close();
});

test('Teilen am Handy: abgebrochenes Teilen-Fenster ist kein Fehler; ohne Teilen-Funktion wird kopiert und bestätigt', async () => {
  // 1) Abbruch
  let t = await seite(HANDY, SPIEL + '?test', () => { navigator.share = () => Promise.reject(Object.assign(new Error('x'), { name: 'AbortError' })); navigator.canShare = () => true; });
  await t.page.tap('#btnStart'); await t.page.waitForFunction(() => __bs.mode === 'playing');
  await beendeMit(t.page, 5);
  await t.page.tap('#btnShare');
  await warte(300);
  assert.equal(await t.page.locator('#shareMsg').textContent(), '', 'Abbruch bleibt still');
  assert.equal(await t.page.locator('#btnShare').isDisabled(), false);
  assert.deepEqual(t.fehler, []);
  await t.ctx.close();

  // 2) Kein navigator.share -> Zwischenablage
  t = await seite({ ...HANDY, permissions: ['clipboard-read', 'clipboard-write'] }, SPIEL + '?test', () => { Object.defineProperty(navigator, 'share', { value: undefined, configurable: true }); });
  await t.page.tap('#btnStart'); await t.page.waitForFunction(() => __bs.mode === 'playing');
  await t.page.evaluate(() => { const g = __bs.game; g.lines = 42; for (let y = 2; y < 20; y++) for (let x = 1; x < 10; x++) g.board[y][x] = 3; g.piece = { t: 'O', r: 0, x: 4, y: 0 }; });
  await t.page.tap('#cDrop'); await t.page.waitForSelector('#overOv:not([hidden])');
  await t.page.tap('#btnShare');
  await t.page.waitForFunction(() => /Kopiert|kopiert/.test(document.getElementById('shareMsg').textContent));
  assert.equal(await t.page.evaluate(() => navigator.clipboard.readText()), '🧱 Ich habe 42 Reihen bei BlockSaal geschafft! Schlägst du mich? 🎮 https://playsaal.com/spiele/blocksaal?c=42');
  assert.match(await t.page.locator('#shareMsg').textContent(), /^✓ /, 'sichtbare Bestätigung');
  assert.match(await t.page.locator('#shareLabel').textContent(), /Kopiert/);
  await t.ctx.close();
});

test('Teilen am Desktop: kopiert Text und Link (auch wenn der Browser share() hat), sichtbare Bestätigung, Ersatzfeld bei Fehler', async () => {
  let t = await seite(DESKTOP, SPIEL + '?test', () => { window.__geteilt = 0; navigator.share = () => { window.__geteilt++; return Promise.resolve(); }; navigator.canShare = () => true; });
  await starten(t.page); await beendeMit(t.page, 12);
  await t.page.click('#btnShare');
  await t.page.waitForFunction(() => /kopiert/.test(document.getElementById('shareMsg').textContent));
  assert.equal(await t.page.evaluate(() => window.__geteilt), 0, 'Desktop nutzt kein natives Teilen');
  assert.equal(await t.page.evaluate(() => navigator.clipboard.readText()), '🧱 Ich habe 12 Reihen bei BlockSaal geschafft! Schlägst du mich? 🎮 https://playsaal.com/spiele/blocksaal?c=12');
  assert.equal(await t.page.locator('#shareMsg').isVisible(), true);
  assert.equal(await t.page.locator('#shareField').isHidden(), true);
  await t.ctx.close();

  // Zwischenablage gesperrt und execCommand schlägt fehl -> Text ist markiert zum Selbstkopieren
  t = await seite(DESKTOP, SPIEL + '?test', () => {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new Error('gesperrt')) }, configurable: true });
    document.execCommand = () => false;
  });
  await starten(t.page); await beendeMit(t.page, 3);
  await t.page.click('#btnShare');
  await t.page.waitForSelector('#shareField:not([hidden])');
  assert.equal(await t.page.inputValue('#shareField'), '🧱 Ich habe 3 Reihen bei BlockSaal geschafft! Schlägst du mich? 🎮 https://playsaal.com/spiele/blocksaal?c=3');
  assert.match(await t.page.locator('#shareMsg').textContent(), /Kopieren hat nicht geklappt/);
  await t.ctx.close();
});

test('Herausforderungslink: Karte „Schaffst du mehr als 42 Reihen?“, Ziel-Anzeige, Erfolg und Hinweis, kein Rekord', async () => {
  const { ctx, page, fehler } = await seite(DESKTOP, SPIEL + '?c=42&test');
  assert.equal(await page.locator('#challengeBox').isVisible(), true);
  assert.equal(await page.locator('#challengeText').textContent(), 'Schaffst du mehr als 42 Reihen?');
  assert.match(await page.locator('#challengeBox').textContent(), /kein verifizierter Rekord/);
  assert.match(await page.locator('#btnStart').textContent(), /Herausforderung annehmen/);
  await starten(page);
  assert.equal(await page.locator('#boxGoal').isVisible(), true);
  assert.equal(await page.locator('#vGoal').textContent(), '> 42');
  // 43 Reihen = geschlagen
  await page.evaluate(() => { __bs.game.lines = 43; });
  await page.waitForSelector('.toast');
  assert.match(await page.locator('.toast').textContent(), /Herausforderung geschafft/);
  assert.match(await page.locator('#vGoal').textContent(), /✓/);
  await beendeMit(page, 43);
  assert.match(await page.locator('#oResult').textContent(), /Geschafft!.*43 Reihen.*mehr als die 42/);
  // Weitere Runde: zu wenig
  await page.click('#btnAgain'); await page.waitForFunction(() => __bs.mode === 'playing');
  await beendeMit(page, 40);
  assert.match(await page.locator('#oResult').textContent(), /Knapp daneben.*Noch 3 Reihen/);
  await page.click('#btnAgain'); await page.waitForFunction(() => __bs.mode === 'playing');
  await beendeMit(page, 42);
  assert.match(await page.locator('#oResult').textContent(), /Gleichstand/);
  // Der eigene geteilte Link enthält die EIGENE Zahl, nicht die empfangene
  await page.click('#btnShare');
  await page.waitForFunction(() => /kopiert/.test(document.getElementById('shareMsg').textContent));
  assert.match(await page.evaluate(() => navigator.clipboard.readText()), /\?c=42$/);
  assert.deepEqual(fehler, []);
  await ctx.close();
});

test('Ungültige Herausforderungen werden ignoriert (0, 1000, Text, Skript-Versuch)', async () => {
  for (const c of ['0', '1000', 'abc', '007', '%3Cimg%20src%3Dx%20onerror%3Dalert(1)%3E', '-5', '4.2']) {
    const { ctx, page, fehler } = await seite(DESKTOP, SPIEL + '?test&c=' + c);
    assert.equal(await page.locator('#challengeBox').isHidden(), true, 'c=' + c);
    assert.equal(await page.locator('#boxGoal').isHidden(), true, 'c=' + c);
    assert.deepEqual(fehler, [], 'c=' + c);
    await ctx.close();
  }
});

test('Link-Vorschau ohne JavaScript: Open-Graph-Tags für ?c=42 kommen vom Worker, Canonical bleibt die normale Spielseite', async () => {
  const html = await (await fetch(SPIEL + '?c=42', { headers: { 'user-agent': 'WhatsApp/2.23 A' } })).text();
  const meta = (name, attr = 'property') => { const m = html.match(new RegExp(`<meta ${attr}="${name}" content="([^"]*)"`)); return m && m[1]; };
  assert.equal(meta('og:title'), '42 Reihen geschafft – schlägst du mich?');
  assert.equal(meta('og:description'), 'Spiele BlockSaal kostenlos auf PlaySaal.');
  assert.match(meta('og:image'), /^https:\/\/[^/]+\/og\/blocksaal\/42\.png$/, 'absolute https-Bildadresse');
  assert.equal(meta('og:image:width'), '1200'); assert.equal(meta('og:image:height'), '630'); assert.equal(meta('og:image:type'), 'image/png');
  assert.match(meta('og:image:alt'), /42 Reihen/);
  assert.match(meta('og:url'), /^https:\/\/[^/]+\/spiele\/blocksaal\?c=42$/);
  assert.equal(meta('og:type'), 'website'); assert.equal(meta('og:site_name'), 'PlaySaal');
  assert.equal(meta('twitter:card', 'name'), 'summary_large_image');
  assert.equal(meta('twitter:title', 'name'), '42 Reihen geschafft – schlägst du mich?');
  assert.match(meta('twitter:image', 'name'), /\/og\/blocksaal\/42\.png$/);
  assert.match(html, /<link rel="canonical" href="https:\/\/playsaal\.com\/spiele\/blocksaal">/, 'Canonical ohne ?c=');
  assert.equal((html.match(/property="og:title"/g) || []).length, 1, 'jedes Tag nur einmal');
  assert.equal((html.match(/property="og:image"/g) || []).length, 1);
  assert.ok(html.includes('<canvas id="board"'), 'dieselbe Spielseite');
  // Einzahl
  assert.equal((await (await fetch(SPIEL + '?c=1')).text()).match(/property="og:title" content="([^"]*)"/)[1], '1 Reihe geschafft – schlägst du mich?');
  // Zusätzliche Parameter stören nicht
  assert.match(await (await fetch(SPIEL + '?utm_source=wa&c=7')).text(), /og:title" content="7 Reihen geschafft/);
});

test('Link-Vorschau: ohne gültige Herausforderung die normale Spielseiten-Vorschau', async () => {
  for (const q of ['', '?c=0', '?c=1000', '?c=abc', '?c=007', '?c=%3Cscript%3E']) {
    const html = await (await fetch(SPIEL + q)).text();
    assert.match(html, /property="og:title" content="BlockSaal · PlaySaal"/, q);
    assert.ok(!/og\/blocksaal\//.test(html), q + ' kein Herausforderungsbild');
  }
  // alte Dateiendung und Schrägstrich führen auf die Adresse mit Herausforderung
  for (const u of ['/spiele/blocksaal.html?c=42', '/spiele/blocksaal/?c=42']) {
    const r = await fetch(BASE + u, { redirect: 'manual' });
    assert.ok([301, 302, 307, 308].includes(r.status), u);
    assert.equal(r.headers.get('location'), '/spiele/blocksaal?c=42', u);
  }
});

test('Vorschaubild: PNG 1200 × 630 mit Reihenzahl, klein, gecacht; ungültige Zahlen = 404', async () => {
  for (const n of [1, 42, 137, 999]) {
    const r = await fetch(`${BASE}/og/blocksaal/${n}.png`);
    assert.equal(r.status, 200, String(n));
    assert.equal(r.headers.get('content-type'), 'image/png');
    assert.match(r.headers.get('cache-control'), /immutable/);
    const b = new Uint8Array(await r.arrayBuffer());
    assert.deepEqual([...b.slice(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], 'PNG-Signatur');
    const dv = new DataView(b.buffer);
    assert.equal(dv.getUint32(16), 1200); assert.equal(dv.getUint32(20), 630);
    assert.ok(b.length < 100 * 1024, `klein genug für WhatsApp (< 300 KB): ${b.length}`);
  }
  // Verschiedene Zahlen = verschiedene Bilder, gleiche Zahl = gleiches Bild
  const hole = async (n) => Buffer.from(await (await fetch(`${BASE}/og/blocksaal/${n}.png`)).arrayBuffer()).toString('base64');
  assert.notEqual(await hole(41), await hole(42));
  assert.equal(await hole(42), await hole(42));
  for (const p of ['0', '1000', '007', 'abc', '-1', '4.2']) assert.equal((await fetch(`${BASE}/og/blocksaal/${p}.png`)).status, 404, p);
  assert.equal((await fetch(`${BASE}/og/blocksaal/42.jpg`)).status, 404);
  assert.equal((await fetch(`${BASE}/og/blocksaal/42.png`, { method: 'POST' })).status === 200, false, 'nur lesender Zugriff');
});

test('Vorschaubild im Browser: Reihenzahl ist groß im Bild und lesbar', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 630 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/og/blocksaal/42.png`);
  const d = await page.evaluate(() => { const i = document.images[0]; return { w: i.naturalWidth, h: i.naturalHeight }; });
  assert.deepEqual(d, { w: 1200, h: 630 });
  await page.screenshot({ path: join(ROOT, 'test-results', 'blocksaal-og-42.png') }).catch(() => {});
  await ctx.close();
});

test('Einbindung in PlaySaal: Kachel auf der Startseite, Sitemap, Spielstand-Umzug, Rekord-Anzeige', async () => {
  const ctx = await browser.newContext(DESKTOP);
  const page = await ctx.newPage();
  const fehler = []; page.on('pageerror', (e) => fehler.push(e.message));
  await page.addInitScript(() => localStorage.setItem('blocksaal.v1', JSON.stringify({ score: 9876, lines: 31 })));
  await page.goto(BASE + '/');
  const kachel = page.locator('.kachel[data-slug="blocksaal"]');
  assert.equal(await kachel.count(), 1);
  assert.equal(await kachel.locator('a').getAttribute('href'), '/spiele/blocksaal');
  assert.equal(await kachel.locator('img').evaluate((i) => i.complete && i.naturalWidth > 0 || i.loading === 'lazy'), true);
  assert.match(await page.locator('.kachel[data-slug="blocksaal"]').textContent(), /BlockSaal/);
  assert.ok((await (await fetch(BASE + '/sitemap.xml')).text()).includes('https://playsaal.com/spiele/blocksaal</loc>'));
  const um = await (await fetch(BASE + '/assets/umzug.js')).text();
  assert.ok(um.includes("prefix: 'blocksaal.'") && um.includes("'blocksaal.v1'"), 'Spielstand zieht mit um');
  const bild = await fetch(BASE + '/bilder/blocksaal.png');
  assert.equal(bild.status, 200);
  assert.deepEqual(fehler, []);
  await ctx.close();
});
