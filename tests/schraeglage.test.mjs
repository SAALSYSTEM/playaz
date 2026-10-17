// SCHRÄGLAGE im Browser: Steuerung, Ziel, Neustart, Speicherstand, Awards, Teilen, Herausforderung, Mobil, Auflösungen.
// Start: node --test --test-concurrency=1 tests/schraeglage.test.mjs   (startet wrangler dev selbst, wie tests/playsaal.test.mjs)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.SL_PORT || 8797);
const BASE = `http://127.0.0.1:${PORT}`;
const SPIEL = BASE + '/spiele/schraeglage';

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

async function seite(opts = {}, url = SPIEL + '?test') {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  const fehler = [];
  page.on('pageerror', (e) => fehler.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') fehler.push(m.text()); });
  await page.goto(url);
  if (url.includes('test')) await page.waitForFunction(() => window.__sl && __sl.sim);
  else await page.waitForSelector('#sMenu:not([hidden])');
  return { ctx, page, fehler };
}
const zustand = (page) => page.evaluate(() => __sl.zustand);
// Nach dem Ziel können mehrere Award-Popups nacheinander kommen
async function awardsWeg(page) {
  for (let i = 0; i < 8; i++) {
    await page.waitForFunction(() => !document.getElementById('oAward').hidden || !document.getElementById('oErgebnis').hidden, null, { timeout: 6000 });
    if (await page.isVisible('#oErgebnis')) return;
    await page.click('#awWeiter');
  }
}
const x = (page) => page.evaluate(() => __sl.sim.car.chassis.getPosition().x);

test('Seite: lädt ohne Fehler, Menü, SEO, Spielstand-Schlüssel, Module erreichbar', async () => {
  const { ctx, page, fehler } = await seite({}, SPIEL);
  await page.waitForSelector('#sMenu:not([hidden])');
  assert.match(await page.title(), /SCHRÄGLAGE/);
  assert.equal(await page.getAttribute('link[rel=canonical]', 'href'), 'https://playsaal.com/spiele/schraeglage');
  assert.match(await page.getAttribute('meta[name=description]', 'content'), /Physik-Fahrspiel/);
  for (const f of ['planck.js', 'sim.js', 'levels.js', 'det.js', 'game.js', 'awards.js', 'online.js']) {
    const r = await fetch(BASE + '/spiele/schraeglage/' + f);
    assert.equal(r.status, 200, f);
    assert.match(r.headers.get('content-type') || '', /javascript/, f);
  }
  assert.equal((await fetch(BASE + '/bilder/schraeglage.jpg')).status, 200);
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('playsaal.zuletzt')).s), 'schraeglage');
  assert.equal(await page.locator('.pz-home').getAttribute('href'), '../');
  assert.deepEqual(fehler, []);
  await ctx.close();
});

test('Steuerung Tastatur: Gas, Bremse, Uhr startet erst mit Gas, R = Neustart, Esc = Pause', async () => {
  const { ctx, page, fehler } = await seite();
  await page.evaluate(() => __sl.starteLevel(1));
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => __sl.sim.started), false, 'Uhr läuft ohne Eingabe');
  await page.keyboard.down('ArrowRight');
  await page.evaluate(() => __sl.schnell(60));
  const v1 = await page.evaluate(() => __sl.sim.car.chassis.getLinearVelocity().x);
  assert.ok(v1 > 4, 'beschleunigt mit Pfeil rechts: ' + v1);
  await page.keyboard.up('ArrowRight');
  await page.keyboard.down('a');
  await page.evaluate(() => __sl.schnell(45));
  await page.keyboard.up('a');
  const v2 = await page.evaluate(() => __sl.sim.car.chassis.getLinearVelocity().x);
  assert.ok(v2 < 1.5, 'bremst mit A: ' + v2);
  await page.keyboard.down('d'); await page.evaluate(() => __sl.schnell(30)); await page.keyboard.up('d');
  assert.ok(await page.evaluate(() => __sl.sim.tick) >= 130);
  assert.ok(await page.evaluate(() => __sl.sim.timeMs()) >= 2000);
  await page.keyboard.press('r');
  assert.equal(await page.evaluate(() => __sl.sim.tick), 0, 'R startet neu');
  assert.ok((await x(page)) < 0.5);
  await page.keyboard.down('ArrowRight'); await page.evaluate(() => __sl.schnell(20)); await page.keyboard.up('ArrowRight');
  await page.keyboard.press('Escape');
  assert.equal(await zustand(page), 'pause');
  assert.ok(await page.isVisible('#oPause'));
  const t = await page.evaluate(() => __sl.sim.tick);
  await page.waitForTimeout(400);
  assert.equal(await page.evaluate(() => __sl.sim.tick), t, 'Pause hält die Physik an');
  await page.keyboard.press('Escape');
  assert.equal(await zustand(page), 'play');
  assert.deepEqual(fehler, []);
  await ctx.close();
});

test('Ziel: Ergebnis, Bestzeit, Award Bronze mit Teilen-Ansicht, Speicherstand übersteht Neuladen, Geist', async () => {
  const { ctx, page, fehler } = await seite();
  await page.evaluate(() => { localStorage.removeItem('schraeglage.v1'); __sl.laden(); __sl.starteLevel(1); });
  await page.keyboard.down('ArrowRight');
  await page.evaluate(() => __sl.schnell(1200));
  await page.keyboard.up('ArrowRight');
  assert.equal(await zustand(page), 'finish');
  // Award-Popup (Bronze) erscheint nach der Zielanimation, danach das Ergebnis
  await page.waitForSelector('#oAward:not([hidden])', { timeout: 5000 });
  assert.equal(await page.textContent('#hAward'), 'Bronze');
  assert.match(await page.textContent('#awZitat'), /erstes Level/);
  for (const b of ['#awTeilen', '#awBild', '#awLink', '#awWeiter']) assert.ok(await page.isVisible(b), b);
  await awardsWeg(page);
  assert.match(await page.textContent('#eZeit'), /^\d+,\d\d s$/);
  assert.match(await page.textContent('#eVgl'), /Erste Bestzeit/);
  assert.ok(await page.isVisible('#eWeiter'));
  const st = await page.evaluate(() => JSON.parse(localStorage.getItem('schraeglage.v1')));
  assert.equal(st.levels[1].done, true);
  assert.ok(st.levels[1].best > 5000);
  assert.ok(st.awards.bronze && /^\d{4}-\d\d-\d\dT/.test(st.awards.bronze.at));
  assert.ok(typeof st.levels[1].inputs === 'string');
  // Neu laden: Menü bietet Level 2 an, Level 2 ist frei, Bestzeit sichtbar
  await page.goto(SPIEL + '?test'); await page.waitForFunction(() => window.__sl && __sl.sim);
  assert.match(await page.textContent('#mSpielenText'), /Level 2/);
  await page.click('#mLevel');
  assert.equal(await page.locator('.ltile').nth(1).isDisabled(), false);
  assert.equal(await page.locator('.ltile').nth(2).isDisabled(), true);
  assert.match(await page.locator('.ltile').first().textContent(), /\d+,\d\d/);
  // Nochmal Level 1: Geist der Bestzeit fährt mit
  await page.locator('.ltile').first().click();
  assert.ok(await page.isVisible('#fGeist'));
  await page.keyboard.down('ArrowRight'); await page.evaluate(() => __sl.schnell(60)); await page.keyboard.up('ArrowRight');
  assert.ok(await page.evaluate(() => __sl.sim.car.chassis.getPosition().x > 1));
  // Auszeichnungen-Liste zeigt Bronze mit Datum
  await page.evaluate(() => __sl.zumMenu()); await page.click('#mAwards');
  assert.match(await page.textContent('.akarte.da'), /Bronze.*Freigeschaltet am/s);
  assert.deepEqual(fehler, []);
  await ctx.close();
});

test('Crash: Animation, automatischer Neustart, sofortiger Neustart mit R, Fehlversuch gezählt', async () => {
  const { ctx, page, fehler } = await seite();
  const crash = () => page.evaluate(() => {
    __sl.starteLevel(2); __sl.setzeEingabe(1); __sl.schnell(5); __sl.setzeEingabe(0);
    const c = __sl.sim.car.chassis; const p = c.getPosition();
    c.setTransform({ x: p.x, y: p.y + 1.6 }, Math.PI); __sl.schnell(40);
    return __sl.zustand;
  });
  assert.equal(await crash(), 'crash');
  assert.ok(await page.isVisible('#crash'));
  assert.match(await page.textContent('#crashGrund'), /Kopfüber|Dach/);
  await page.waitForFunction(() => __sl.zustand === 'play', null, { timeout: 4000 });
  assert.equal(await page.evaluate(() => __sl.sim.tick), 0);
  assert.equal(await crash(), 'crash');
  await page.keyboard.press('r');
  assert.equal(await zustand(page), 'play');
  const st = await page.evaluate(() => __sl.stand);
  assert.ok(st.stats.crashes >= 2 && st.levels[2].fails >= 2);
  assert.deepEqual(fehler, []);
  await ctx.close();
});

test('Teilen: Web Share mit 1080×1080-Bild und Link, Desktop-Fallback (Link kopieren + Bild speichern)', async () => {
  // a) Handy mit Web Share API
  const { ctx, page, fehler } = await seite({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await page.evaluate(() => {
    window.__geteilt = null;
    navigator.canShare = (d) => !!(d && d.files);
    navigator.share = async (d) => { window.__geteilt = { text: d.text, title: d.title, n: d.files ? d.files.length : 0, typ: d.files && d.files[0].type, size: d.files && d.files[0].size, name: d.files && d.files[0].name }; };
    const st = __sl.stand; st.awards.bronze = { at: new Date().toISOString(), level: 1 }; st.settings.name = 'Lena'; __sl.speichern();
    __sl.awardPopup({ award: { id: 'bronze', name: 'Bronze', rarity: 1, metal: 'bronze', glyph: '1', share: 'Ich habe mein erstes Level geschafft!' } }, () => {});
  });
  await page.click('#awTeilen');
  await page.waitForFunction(() => window.__geteilt);
  const g = await page.evaluate(() => window.__geteilt);
  assert.equal(g.n, 1); assert.equal(g.typ, 'image/png');
  assert.match(g.text, /https:\/\/playsaal\.com\/spiele\/schraeglage\?award=bronze&von=Lena/);
  const dim = await page.evaluate(async () => { const b = await __sl.teilenBild({ level: 1, ms: 12345 }); const bm = await createImageBitmap(b); return [bm.width, bm.height]; });
  assert.deepEqual(dim, [1080, 1080]);
  assert.equal(await page.evaluate(() => __sl.stand.stats.shared), 1);
  assert.ok(await page.evaluate(() => !!__sl.stand.awards.herausforderer), 'Teilen schaltet „Herausforderer“ frei');
  assert.deepEqual(fehler, []);
  await ctx.close();
  // b) Desktop ohne Web Share
  const d = await seite({ acceptDownloads: true, permissions: ['clipboard-read', 'clipboard-write'] });
  await d.page.evaluate(() => { delete Navigator.prototype.share; delete Navigator.prototype.canShare; __sl.awardPopup({ level: 1, ms: 12345 }, () => {}); });
  const [dl] = await Promise.all([d.page.waitForEvent('download'), d.page.click('#awTeilen')]);
  assert.match(dl.suggestedFilename(), /schraeglage-level-1\.png/);
  await d.page.waitForFunction(() => /Link kopiert/.test(document.getElementById('awStatus').textContent));
  const clip = await d.page.evaluate(() => navigator.clipboard.readText());
  assert.match(clip, /level=1&zeit=12345/);
  const [dl2] = await Promise.all([d.page.waitForEvent('download'), d.page.click('#awBild')]);
  assert.match(dl2.suggestedFilename(), /\.png$/);
  await d.page.click('#awLink');
  await d.page.waitForFunction(() => /Link kopiert/.test(document.getElementById('awStatus').textContent));
  assert.deepEqual(d.fehler, []);
  await d.ctx.close();
});

test('Herausforderungs-Link: startet direkt ohne Anmeldung, Banner „nicht verifiziert“, Sieg zählt', async () => {
  const { ctx, page, fehler } = await seite({}, SPIEL + '?test&level=1&zeit=60000&von=Lena');
  assert.equal(await zustand(page), 'play');
  assert.equal(await page.evaluate(() => __sl.level.id), 1);
  assert.match(await page.textContent('#banner'), /Lena fordert dich heraus: 1:00,00 s/);
  assert.match(await page.textContent('#banner'), /nicht verifiziert/);
  await page.keyboard.down('ArrowRight'); await page.evaluate(() => __sl.schnell(1200)); await page.keyboard.up('ArrowRight');
  assert.equal(await page.evaluate(() => __sl.stand.stats.challengesWon), 1);
  assert.ok(await page.evaluate(() => !!__sl.stand.awards.angenommen));
  // Böse Parameter werden ignoriert bzw. bereinigt
  await page.goto(SPIEL + '?test&level=99&zeit=-5&von=%3Cimg%20src=x%3E'); await page.waitForFunction(() => window.__sl && __sl.sim);
  assert.equal(await zustand(page), 'menu');
  await page.goto(SPIEL + '?test&level=2&zeit=15000&von=%3Cb%3EX%3C/b%3E'); await page.waitForFunction(() => window.__sl && __sl.sim);
  assert.equal(await page.locator('#banner b').count(), 0);
  assert.deepEqual(fehler, []);
  await ctx.close();
});

test('Mobil: Touch-Pedale, Gas/Bremse per Finger, kein Scrollen, Vollbild-Knopf nur wenn möglich', async () => {
  const { ctx, page, fehler } = await seite({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
  await page.evaluate(() => __sl.starteLevel(1));
  assert.ok(await page.isVisible('#pGas')); assert.ok(await page.isVisible('#pBremse'));
  const box = await page.locator('#pGas').boundingBox();
  assert.ok(box.width >= 84 && box.height >= 84, 'Pedal groß genug');
  const gas = (typ) => page.locator('#pGas').dispatchEvent(typ, { pointerId: 7, pointerType: 'touch', isPrimary: true, bubbles: true });
  await gas('pointerdown');
  await page.evaluate(() => __sl.schnell(90));
  assert.ok((await x(page)) > 3, 'fährt mit Gas-Pedal');
  await gas('pointerup');
  const b = (typ) => page.locator('#pBremse').dispatchEvent(typ, { pointerId: 8, pointerType: 'touch', isPrimary: true, bubbles: true });
  const v1 = await page.evaluate(() => __sl.sim.car.chassis.getLinearVelocity().x);
  await b('pointerdown'); await page.evaluate(() => __sl.schnell(60)); await b('pointerup');
  assert.ok(await page.evaluate(() => __sl.sim.car.chassis.getLinearVelocity().x) < v1 * 0.5, 'Bremse per Finger');
  // linke/rechte Bildschirmhälfte funktionieren ebenfalls
  await page.locator('#zonen div[data-p="1"]').dispatchEvent('pointerdown', { pointerId: 9, pointerType: 'touch', bubbles: true });
  assert.equal(await page.evaluate(() => { __sl.schnell(1); return __sl.sim.input; }), 1);
  await page.locator('#zonen div[data-p="1"]').dispatchEvent('pointerup', { pointerId: 9, pointerType: 'touch', bubbles: true });
  const ta = await page.evaluate(() => getComputedStyle(document.getElementById('game')).touchAction);
  assert.equal(ta, 'none');
  await page.touchscreen.tap(200, 400);
  assert.equal(await page.evaluate(() => [document.scrollingElement.scrollTop, document.scrollingElement.scrollLeft].join()), '0,0');
  assert.deepEqual(fehler, []);
  await ctx.close();
  // Desktop: Vollbild-Knopf ruft die Fullscreen-API
  const d = await seite();
  await d.page.evaluate(() => { window.__voll = 0; document.documentElement.requestFullscreen = async () => { window.__voll++; }; __sl.zumMenu(); });
  await d.page.click('#mVoll');
  assert.equal(await d.page.evaluate(() => window.__voll), 1);
  await d.ctx.close();
});

test('Speicher gesperrt (Privatmodus): Spiel läuft trotzdem, Hinweis statt Absturz', async () => {
  const ctx = await browser.newContext();
  await ctx.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('gesperrt', 'SecurityError'); } }); });
  const page = await ctx.newPage(); const fehler = [];
  page.on('pageerror', (e) => fehler.push(e.message));
  await page.goto(SPIEL + '?test'); await page.waitForFunction(() => window.__sl && __sl.sim);
  await page.evaluate(() => __sl.starteLevel(1));
  await page.keyboard.down('ArrowRight'); await page.evaluate(() => __sl.schnell(1200)); await page.keyboard.up('ArrowRight');
  assert.equal(await zustand(page), 'finish');
  assert.deepEqual(fehler, []);
  await ctx.close();
});

// Handy hoch/quer, Tablet, Desktop: nichts ragt heraus, HUD und Pedale überlappen nicht
for (const [w, h, touch] of [[320, 568, true], [390, 844, true], [844, 390, true], [768, 1024, true], [1440, 900, false]]) {
  test(`Auflösung ${w}×${h}: Menü, HUD und Ergebnis passen`, async () => {
    const { ctx, page, fehler } = await seite({ viewport: { width: w, height: h }, isMobile: touch, hasTouch: touch });
    await page.evaluate(() => __sl.zumMenu());
    const menu = await page.evaluate(() => [...document.querySelectorAll('#sMenu button:not([hidden])')].map((b) => { const r = b.getBoundingClientRect(); return [r.left, r.right, r.width]; }));
    for (const [l, r, bw] of menu) { assert.ok(l >= 0 && r <= w + 0.5 && bw > 30, `Menüknopf ragt raus (${l}–${r})`); }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), w);
    await page.evaluate(() => { __sl.starteLevel(3); __sl.setzeEingabe(1); __sl.schnell(30); __sl.setzeEingabe(0); });
    const lage = await page.evaluate(() => {
      const r = (s) => { const e = document.querySelector(s); if (!e || e.hidden || e.offsetParent === null && getComputedStyle(e).position !== 'fixed') return null; const b = e.getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, b: b.bottom }; };
      return { zeit: r('#zeit'), neu: r('#bNeu'), pause: r('#bPause'), gas: r('#pGas'), bremse: r('#pBremse'), home: r('.pz-home'), lv: r('.lvchip') };
    });
    const ueber = (a, b) => a && b && a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
    for (const k of ['neu', 'pause', 'home']) { assert.ok(lage[k] && lage[k].r <= w && lage[k].l >= 0, k); assert.ok(!ueber(lage[k], lage.zeit), k + ' überdeckt die Zeit'); }
    assert.ok(!ueber(lage.home, lage.lv), 'Alle-Spiele-Knopf überdeckt Levelanzeige');
    if (touch) { assert.ok(lage.gas && lage.bremse, 'Pedale sichtbar'); assert.ok(!ueber(lage.gas, lage.bremse)); assert.ok(lage.gas.b <= h && lage.gas.r <= w); }
    // Ergebnis-Panel vollständig erreichbar
    await page.evaluate(() => { __sl.starteLevel(1); __sl.setzeEingabe(1); __sl.schnell(1200); __sl.setzeEingabe(0); });
    await awardsWeg(page);
    await page.locator('#eWeiter').scrollIntoViewIfNeeded();
    const btn = await page.locator('#eWeiter').boundingBox();
    assert.ok(btn.y >= 0 && btn.y + btn.height <= h + 1, 'Nächstes Level erreichbar');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), w);
    assert.deepEqual(fehler, []);
    await ctx.close();
  });
}

test('Portal: Kachel unter „Neu“, Weiter spielen zeigt Fortschritt', async () => {
  const ctx = await browser.newContext(); const page = await ctx.newPage();
  await page.goto(BASE + '/');
  assert.equal(await page.locator('#neu .kachel a[href="/spiele/schraeglage"]').count(), 1);   // neueste Spiele stehen vorn, Schräglage bleibt unter „Neu“
  await page.goto(SPIEL);
  await page.evaluate(() => localStorage.setItem('schraeglage.v1', JSON.stringify({ v: 1, levels: { 1: { done: true, best: 12000, gold: true }, 2: { done: true, best: 9000 } }, awards: {} })));
  await page.goto(BASE + '/');
  assert.equal(await page.textContent('#weiterName'), 'Schräglage');
  assert.match(await page.textContent('#weiterRec'), /2 von 35 Level · 1 Gold/);
  await ctx.close();
});
