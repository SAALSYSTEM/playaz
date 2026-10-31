// Tier-Ski – Browserprüfung: Laden der GLB-Modelle und Clips, Fahren, Lenken (Touch + Tastatur), Sturz, Schanze + Trick,
// Ducken, Münzen, Neustart, Speichern nach Neuladen, Freischalten, Pause, Dauerfahrt mit Bot, Handy-Layout.
// Eigener kleiner Static-Server (wie Cloudflare: /pfad -> pfad.html). node --test tests/tier-ski-browser.test.mjs
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
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.glb': 'model/gltf-binary', '.webp': 'image/webp', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.svg': 'image/svg+xml', '.png': 'image/png' };
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

async function open({ size = { width: 390, height: 844 }, mobil = true, save = null, seed = 3 } = {}) {
  const ctx = await browser.newContext({ viewport: size, hasTouch: mobil, isMobile: mobil });
  offen.push(ctx);
  await ctx.route('**/assets/playsaal*.js', (r) => r.fulfill({ contentType: 'application/javascript', body: '' }));
  if (save) await ctx.addInitScript((s) => { if (!sessionStorage.getItem('gesetzt')) { localStorage.setItem('tierski.v1', s); sessionStorage.setItem('gesetzt', '1'); } }, JSON.stringify(save));
  const page = await ctx.newPage(); const errors = [], glb = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('response', (r) => { if (r.status() >= 400) errors.push(r.status() + ' ' + r.url()); if (r.url().includes('.glb')) glb.push(r.status() + ' ' + r.url().split('/').pop()); });
  await page.goto(`${base}/spiele/tier-ski?test&seed=${seed}`);
  await page.waitForFunction(() => window.__tierski && window.__tierski.zustand === 'menu', null, { timeout: 30000 });
  return { ctx, page, errors, glb };
}
const T = (page, expr, arg) => page.evaluate(expr, arg);
const F = (page) => T(page, () => { const f = window.__tierski.fahrt; return { d: f.d, x: f.x, y: f.y, luft: f.luft, tot: f.tot, duck: f.duck, muenzen: f.muenzen, bonus: f.bonus, tricks: f.tricks, getroffen: f.getroffen }; });
const warte = (page, fn, arg, ms = 15000) => page.waitForFunction(fn, arg, { timeout: ms });
async function halte(page, id, ms) {
  const b = await page.locator('#' + id).boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down(); await page.waitForTimeout(ms); await page.mouse.up();
}
async function starte(page) { await page.click('#mStart'); await warte(page, () => window.__tierski.zustand === 'fahrt'); }
// Hindernis-Szenario relativ zur aktuellen Position
const setzeVorne = (page, items) => T(page, (its) => { const f = window.__tierski.fahrt; window.__tierski.strecke(its.map((i) => ({ ...i, x: i.x ?? f.x, d: f.d + i.vor }))); }, items);

test('Laden: alle GLB-Dateien, vier Tiere mit allen Clips, Menü ohne Fehler und ohne Querscrollen', async () => {
  const { ctx, page, errors, glb } = await open();
  assert.deepEqual(glb.map((g) => g.split('?')[0]).sort(), ['200 baer.glb', '200 fuchs.glb', '200 hase.glb', '200 pinguin.glb', '200 welt.glb']);
  assert.deepEqual(await T(page, () => window.__tierski.geladen), ['hase', 'fuchs', 'pinguin', 'baer']);
  const tier = await T(page, () => window.__tierski.tier);
  assert.deepEqual([...tier.clips].sort(), ['ducken', 'fahren', 'links', 'rechts', 'sprung', 'sturz', 'trick']);
  assert.ok(tier.sichtbar);
  await warte(page, () => window.__tierski.instanzen.tanne > 0, null, 10000); // erstes Bild gezeichnet
  const inst = await T(page, () => window.__tierski.instanzen);
  assert.ok(inst.tanne > 20 && inst.berg === 10 && inst.stange > 5, JSON.stringify(inst));
  assert.ok(await T(page, () => document.documentElement.scrollWidth <= innerWidth));
  assert.match(await page.textContent('#mName'), /Hase/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('Fahren mit dem Hasen, Lenken per Touch links/rechts, Ränder halten, Kamera bleibt ruhig', async () => {
  const { ctx, page, errors } = await open();
  await starte(page);
  assert.ok(await page.isVisible('#steuer') && await page.isVisible('#hud'));
  await page.waitForTimeout(600);
  const a = await F(page); assert.ok(a.d > 1 && !a.tot);
  await setzeVorne(page, []);
  await halte(page, 'tLinks', 450);
  const b = await F(page); assert.ok(b.x < a.x - 1, `links: ${a.x} → ${b.x}`);
  await halte(page, 'tRechts', 900);
  const c = await F(page); assert.ok(c.x > b.x + 1.5, `rechts: ${b.x} → ${c.x}`);
  await halte(page, 'tRechts', 1500);
  const d = await F(page); assert.ok(d.x <= 4.56 && d.x > 4.4, 'bleibt auf der Piste: ' + d.x);
  // Zwei Finger gleichzeitig: kein Fehler, kein Ausbrechen
  await T(page, () => { for (const [id, p] of [['tLinks', 11], ['tRechts', 12]]) document.getElementById(id).dispatchEvent(new PointerEvent('pointerdown', { pointerId: p, bubbles: true, cancelable: true })); });
  const x1 = (await F(page)).x; await page.waitForTimeout(300); const x2 = (await F(page)).x;
  assert.ok(Math.abs(x2 - x1) < 0.3, 'beide Richtungen heben sich auf');
  await T(page, () => { for (const [id, p] of [['tLinks', 11], ['tRechts', 12]]) document.getElementById(id).dispatchEvent(new PointerEvent('pointerup', { pointerId: p, bubbles: true })); });
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('Tanne treffen: Sturz-Animation, Ergebnis mit Meter/Punkte/Münzen, Nochmal fahren startet neu', async () => {
  const { ctx, page, errors } = await open();
  await starte(page);
  await page.waitForTimeout(300);
  await setzeVorne(page, [{ typ: 'tanne', vor: 10 }]);
  await warte(page, () => window.__tierski.fahrt.tot);
  assert.equal((await T(page, () => window.__tierski.tier)).pose, 'sturz');
  await warte(page, () => window.__tierski.zustand === 'ende');
  assert.equal(await page.textContent('#eTitel'), 'Oje, Schnee gefuttert!');
  assert.match(await page.textContent('#eGrund'), /Tanne/);
  const f = await F(page);
  assert.equal(await page.textContent('#eMeter'), String(Math.floor(f.d)));
  assert.ok(await page.isVisible('#eNochmal') && await page.isVisible('#eTiere'));
  await page.click('#eNochmal');
  await warte(page, () => window.__tierski.zustand === 'fahrt');
  const g = await F(page); assert.ok(g.d < 3 && !g.tot);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('Schanze: automatischer Sprung, Trick per Mitteltaste, Bonus bei der Landung', async () => {
  const { ctx, page, errors } = await open();
  await starte(page);
  await page.waitForTimeout(300);
  await setzeVorne(page, [{ typ: 'schanze', vor: 10 }, { typ: 'fels', vor: 16 }]);
  await warte(page, () => window.__tierski.fahrt.luft);
  assert.ok(await T(page, () => document.body.classList.contains('luft')), 'Trick-Taste leuchtet');
  await page.dispatchEvent('#tMitte', 'pointerdown', { pointerId: 5 });
  await page.dispatchEvent('#tMitte', 'pointerup', { pointerId: 5 });
  await warte(page, () => window.__tierski.tier.pose === 'trick', null, 3000);
  await warte(page, () => !window.__tierski.fahrt.luft);
  const f = await F(page);
  assert.ok(!f.tot && f.tricks === 1 && f.bonus === 100, JSON.stringify(f));
  assert.match(await page.textContent('#pop'), /Trick/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('Ast: geduckt (gehaltene Mitteltaste) durch, sonst Sturz', async () => {
  const { ctx, page, errors } = await open();
  await starte(page);
  await page.waitForTimeout(300);
  await setzeVorne(page, [{ typ: 'ast', vor: 14 }]);
  const b = await page.locator('#tMitte').boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down();
  await warte(page, () => window.__tierski.tier.pose === 'ducken', null, 3000);
  const start = (await F(page)).d;
  await warte(page, (s) => window.__tierski.fahrt.d > s + 18, start);
  await page.mouse.up();
  assert.ok(!(await F(page)).tot, 'geduckt kein Sturz');
  await setzeVorne(page, [{ typ: 'ast', vor: 10 }]);
  await warte(page, () => window.__tierski.fahrt.tot);
  assert.equal((await F(page)).getroffen, 'ast');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('Münzen: werden gezählt, im HUD angezeigt, nach dem Sturz gespeichert und nach Neuladen wiederhergestellt', async () => {
  const { ctx, page, errors } = await open({ save: { v: 1, muenzen: 5, rekord: 0, tiere: ['hase'], tier: 'hase', ton: false } });
  assert.equal(await page.textContent('#mMuenzen'), '5');
  await starte(page);
  await page.waitForTimeout(300);
  await setzeVorne(page, [...[8, 10, 12, 14, 16, 18].map((vor) => ({ typ: 'muenze', vor, y: 0.9 })), { typ: 'schneemann', vor: 26 }]);
  await warte(page, () => window.__tierski.fahrt.tot);
  const f = await F(page);
  assert.equal(f.muenzen, 6);
  assert.equal(await page.textContent('#hMuenzen'), '6');
  assert.equal(await T(page, () => window.__tierski.stand.muenzen), 11);
  await page.reload();
  await warte(page, () => window.__tierski && window.__tierski.zustand === 'menu', null, 30000);
  assert.equal(await page.textContent('#mMuenzen'), '11');
  assert.equal(await T(page, () => JSON.parse(localStorage.getItem('tierski.v1')).muenzen), 11);
  assert.ok((await T(page, () => window.__tierski.stand.rekord)) > 0);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('Tier freischalten (Fuchs für 50 Münzen), auswählen und damit fahren; zu teure Tiere bleiben gesperrt', async () => {
  const { ctx, page, errors } = await open({ save: { v: 1, muenzen: 60, rekord: 10, tiere: ['hase'], tier: 'hase', ton: false } });
  await page.click('#mRechts');
  assert.match(await page.textContent('#mName'), /Fuchs/);
  assert.ok(await page.isHidden('#mStart'));
  assert.ok(await page.isEnabled('#mKaufen'));
  await page.click('#mKaufen');
  const s = await T(page, () => window.__tierski.stand);
  assert.deepEqual(s.tiere, ['hase', 'fuchs']); assert.equal(s.muenzen, 10); assert.equal(s.tier, 'fuchs');
  assert.ok(await page.isVisible('#mStart'));
  await page.click('#mRechts');
  assert.match(await page.textContent('#mName'), /Pinguin/);
  assert.ok(await page.isDisabled('#mKaufen'));
  assert.match(await page.textContent('#mKaufen'), /Noch 110 Münzen/);
  await page.click('#mLinks');
  await starte(page);
  assert.equal(await T(page, () => window.__tierski.stand.tier), 'fuchs');
  assert.equal(await T(page, () => JSON.parse(localStorage.getItem('tierski.v1')).tiere.join()), 'hase,fuchs');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('Pause per Knopf und Escape: Fahrt steht still, Weiterfahren läuft weiter, Hauptmenü möglich', async () => {
  const { ctx, page, errors } = await open();
  await starte(page);
  await page.waitForTimeout(400);
  await page.click('#bPause');
  assert.equal(await T(page, () => window.__tierski.zustand), 'pause');
  const d1 = (await F(page)).d; await page.waitForTimeout(500); const d2 = (await F(page)).d;
  assert.equal(d1, d2);
  await page.click('#pWeiter');
  await page.waitForTimeout(400);
  assert.ok((await F(page)).d > d2);
  await page.keyboard.press('Escape');
  assert.equal(await T(page, () => window.__tierski.zustand), 'pause');
  await page.keyboard.press('Escape');
  assert.equal(await T(page, () => window.__tierski.zustand), 'fahrt');
  await page.click('#bPause'); await page.click('#pMenu');
  assert.equal(await T(page, () => window.__tierski.zustand), 'menu');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('Desktop: Tastatur (Pfeile, A/D, Pfeil runter, Leertaste im Sprung)', async () => {
  const { ctx, page, errors } = await open({ size: { width: 1280, height: 720 }, mobil: false });
  await starte(page);
  await setzeVorne(page, []);
  // Software-Grafik im Test ist langsam: auf das Ergebnis warten statt auf feste Zeiten
  await page.keyboard.down('ArrowLeft'); await warte(page, () => window.__tierski.fahrt.x < -1, null, 8000); await page.keyboard.up('ArrowLeft');
  const a = await F(page);
  await page.keyboard.down('KeyD'); await warte(page, (x) => window.__tierski.fahrt.x > x + 1.5, a.x, 8000); await page.keyboard.up('KeyD');
  await page.keyboard.down('ArrowDown'); await warte(page, () => window.__tierski.fahrt.duck, null, 5000);
  assert.equal((await T(page, () => window.__tierski.tier)).pose !== undefined, true); await page.keyboard.up('ArrowDown');
  await setzeVorne(page, [{ typ: 'schanze', vor: 10 }]);
  await warte(page, () => window.__tierski.fahrt.luft);
  await page.keyboard.press('Space');
  await warte(page, () => !window.__tierski.fahrt.luft);
  assert.equal((await F(page)).tricks, 1);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('Dauerfahrt: Bot fährt 35 s über die echte Strecke, Piste wird laufend erzeugt, Speicher bleibt klein', async () => {
  const { ctx, page, errors } = await open({ size: { width: 360, height: 640 }, seed: 11 });
  await starte(page);
  await T(page, () => {
    const SP = [-4, -2, 0, 2, 4];
    const send = (code, down) => dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code }));
    window.__bot = setInterval(() => {
      const f = window.__tierski.fahrt; if (f.tot) return;
      const r = f.strecke.reihen.find((x) => x.d > f.d - 0.5); const ziel = r ? SP[r.pfad] : 0;
      send('ArrowLeft', f.x > ziel + 0.15); send('ArrowRight', f.x < ziel - 0.15);
      const ast = f.strecke.items.find((i) => i.typ === 'ast' && i.d > f.d - 0.5 && i.d < f.d + 4 && Math.abs(i.x - f.x) < 2.3);
      send('ArrowDown', !!ast);
      if (f.luft && f.vy < 6 && !f.trick) send('Space', true);
    }, 10);
  });
  let maxItems = 0, maxInst = 0;
  for (let i = 0; i < 35; i++) {
    await page.waitForTimeout(1000);
    const s = await T(page, () => ({ n: window.__tierski.fahrt.strecke.items.length, inst: window.__tierski.instanzen, tot: window.__tierski.fahrt.tot }));
    maxItems = Math.max(maxItems, s.n); maxInst = Math.max(maxInst, s.inst.tanne + s.inst.muenze + s.inst.fels);
    if (s.tot) break;
  }
  const f = await F(page);
  assert.ok(!f.tot, `Bot gestürzt bei ${Math.floor(f.d)} m an ${f.getroffen}`);
  assert.ok(f.d > 150, 'gefahren: ' + f.d);
  assert.ok(maxItems < 120 && maxInst < 300, `items ${maxItems}, instanzen ${maxInst}`);
  assert.ok((await T(page, () => window.__tierski.zeichnungen)) < 80, 'wenige Zeichenaufrufe');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('Handy-Layout 390×844 und 360×640: Tasten erreichbar, nichts ragt heraus, kein Zoom/Scroll', async () => {
  for (const size of [{ width: 390, height: 844 }, { width: 360, height: 640 }]) {
    const { ctx, page, errors } = await open({ size });
    for (const id of ['mStart', 'mLinks', 'mRechts', 'mTon']) {
      const b = await page.locator('#' + id).boundingBox();
      assert.ok(b && b.x >= 0 && b.y >= 0 && b.x + b.width <= size.width && b.y + b.height <= size.height, id + ' ' + JSON.stringify(b));
    }
    await starte(page);
    const boxen = {};
    for (const id of ['tLinks', 'tMitte', 'tRechts', 'bPause', 'hud']) {
      const b = await page.locator('#' + id).boundingBox(); boxen[id] = b;
      assert.ok(b && b.x >= 0 && b.x + b.width <= size.width + 0.5 && b.y + b.height <= size.height + 0.5, id + ' ' + JSON.stringify(b));
    }
    assert.ok(boxen.tLinks.width >= 90 && boxen.tLinks.height >= 76, 'große Touch-Flächen');
    assert.ok(boxen.tLinks.y > size.height * 0.7, 'Tasten unten');
    const css = await T(page, () => ({ body: getComputedStyle(document.body).touchAction, canvas: getComputedStyle(document.getElementById('c')).touchAction, scroll: document.documentElement.scrollWidth <= innerWidth, meta: document.querySelector('meta[name=viewport]').content }));
    assert.equal(css.body, 'none'); assert.equal(css.canvas, 'none'); assert.ok(css.scroll); assert.match(css.meta, /user-scalable=no/);
    assert.deepEqual(errors, []);
    await ctx.close();
  }
});
