// Kerkerlauf – Browserprüfung: Laden der GLB-Modelle und Clips, Wischen/Tippen, Tastatur, Sprung über Stacheln,
// Kampf mit Kombo, Sturz und Neustart, Speichern nach Neuladen, Freischalten, Pause, Dauerlauf mit Bot, Handy-Layout.
// Eigener kleiner Static-Server (wie Cloudflare: /pfad -> pfad.html). node --test --test-concurrency=1 tests/kerkerlauf-browser.test.mjs
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
  if (save) await ctx.addInitScript((s) => { if (!sessionStorage.getItem('gesetzt')) { localStorage.setItem('kerkerlauf.v1', s); sessionStorage.setItem('gesetzt', '1'); } }, JSON.stringify(save));
  const page = await ctx.newPage(); const errors = [], glb = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('response', (r) => { if (r.status() >= 400) errors.push(r.status() + ' ' + r.url()); if (r.url().includes('.glb')) glb.push(r.status() + ' ' + r.url().split('/').pop().split('?')[0]); });
  await page.goto(`${base}/spiele/kerkerlauf?test&seed=${seed}`);
  await page.waitForFunction(() => window.__kerker && window.__kerker.zustand === 'menu', null, { timeout: 60000 });
  return { ctx, page, errors, glb };
}
const T = (page, expr, arg) => page.evaluate(expr, arg);
const F = (page) => T(page, () => { const f = window.__kerker.lauf; return { d: f.d, x: f.x, y: f.y, spur: f.spur, luft: f.luft, tot: f.tot, muenzen: f.muenzen, kills: f.kills, serie: f.serie, bonus: f.bonus, getroffen: f.getroffen }; });
const warte = (page, fn, arg, ms = 20000) => page.waitForFunction(fn, arg, { timeout: ms });
async function starte(page) { await page.click('#mStart'); await warte(page, () => window.__kerker.zustand === 'lauf'); }
const setzeVorne = (page, items) => T(page, (its) => { const f = window.__kerker.lauf; window.__kerker.strecke(its.map((i) => ({ ...i, d: f.d + i.vor }))); }, items);
async function wische(page, dx, dy) {
  const x = 195, y = 600;
  await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + dx / 2, y + dy / 2); await page.mouse.move(x + dx, y + dy); await page.mouse.up();
}

test('Laden: Welt, zwei Skelette, Animationen und Startheld ohne Fehler; Menü ohne Querscrollen', async () => {
  const { page, errors, glb } = await open();
  assert.deepEqual(glb.sort(), ['200 anim-allgemein.glb', '200 anim-basis.glb', '200 anim-jubel.glb', '200 anim-kampf.glb', '200 anim-magie.glb', '200 anim-skelett.glb', '200 held-ritter.glb', '200 skelett-diener.glb', '200 skelett-krieger.glb', '200 welt.glb']);
  const clips = await T(page, () => window.__kerker.clips);
  for (const c of ['Running_A', 'Jump_Full_Short', 'Death_A', 'Idle_A', 'Melee_1H_Attack_Slice_Horizontal', 'Skeletons_Idle', 'Skeletons_Death']) assert.ok(clips.includes(c), c);
  const h = await T(page, () => window.__kerker.held);
  assert.equal(h.name, 'ritter'); assert.ok(h.sichtbar); assert.equal(h.pose, 'Idle_A');
  await warte(page, () => window.__kerker.instanzen.boden > 30);
  assert.ok(await T(page, () => document.documentElement.scrollWidth <= innerWidth));
  assert.match(await page.textContent('#mName'), /Ritter/);
  assert.deepEqual(errors, []);
});

test('Wischen links/rechts wechselt die Spur, nach oben springt, Ränder halten', async () => {
  const { page, errors } = await open();
  await starte(page); await setzeVorne(page, []);
  await wische(page, -120, 0); await warte(page, () => window.__kerker.lauf.x < -2.9);
  assert.equal((await F(page)).spur, 0);
  await wische(page, -120, 0); assert.equal((await F(page)).spur, 0, 'links ist Schluss');
  await wische(page, 120, 0); await wische(page, 120, 0); await warte(page, () => window.__kerker.lauf.x > 2.9);
  assert.equal((await F(page)).spur, 2);
  await wische(page, 0, -140); await warte(page, () => window.__kerker.lauf.luft);
  assert.equal((await T(page, () => window.__kerker.held)).pose, 'Jump_Full_Short');
  await warte(page, () => !window.__kerker.lauf.luft);
  assert.deepEqual(errors, []);
});

test('Stachelfalle: ohne Sprung Sturz mit Ergebnis, Nochmal laufen startet neu; mit Sprung drüber', async () => {
  const { page, errors } = await open();
  await starte(page); await page.waitForTimeout(200);
  await setzeVorne(page, [{ typ: 'stachel', spur: 1, vor: 10 }]);
  await warte(page, () => window.__kerker.lauf.tot);
  assert.equal((await T(page, () => window.__kerker.held)).pose, 'Death_A');
  await warte(page, () => window.__kerker.zustand === 'ende');
  assert.match(await page.textContent('#eTitel'), /Stacheln/);
  assert.equal(await page.textContent('#eMeter'), String(Math.floor((await F(page)).d)));
  await page.click('#eNochmal'); await warte(page, () => window.__kerker.zustand === 'lauf');
  assert.ok((await F(page)).d < 3);
  await setzeVorne(page, [{ typ: 'stachel', spur: 1, vor: 9 }]);
  await warte(page, () => { const f = window.__kerker.lauf; return f.strecke.items[0].d - f.d < 2.6; });
  await wische(page, 0, -140);
  await warte(page, () => { const f = window.__kerker.lauf; return f.d > f.strecke.items[0].d + 3 || f.tot; });
  assert.ok(!(await F(page)).tot, 'Sprung über die Stacheln');
  assert.deepEqual(errors, []);
});

test('Kampf: Tippen besiegt Skelette (Death-Animation), Kombo-Anzeige ab dem vierten; ohne Angriff Sturz', async () => {
  const { page, errors } = await open();
  await starte(page); await page.waitForTimeout(200);
  await setzeVorne(page, [1, 2, 3, 4].map((k) => ({ typ: 'skelett', art: k % 2 ? 'diener' : 'krieger', spur: 1, vor: 12 * k })));
  for (let k = 0; k < 4; k++) {
    await warte(page, (k) => { const f = window.__kerker.lauf, it = f.strecke.items[k]; return it.d - f.d < 4; }, k);
    await page.mouse.click(195, 500);
    await warte(page, (k) => !!window.__kerker.lauf.strecke.items[k].besiegt, k, 3000);
  }
  const f = await F(page);
  assert.equal(f.kills, 4); assert.equal(f.bonus, 250); assert.ok(!f.tot);
  assert.ok(await page.isVisible('#kombo')); assert.equal(await page.textContent('#kMal'), '×2');
  const sk = await T(page, () => window.__kerker.skelette);
  assert.ok(sk.some((s) => s.pose === 'Skeletons_Death'), JSON.stringify(sk));
  await setzeVorne(page, [{ typ: 'skelett', art: 'krieger', spur: 1, vor: 10 }]);
  await warte(page, () => window.__kerker.lauf.tot);
  assert.equal((await F(page)).getroffen, 'krieger');
  await warte(page, () => window.__kerker.zustand === 'ende');
  assert.match(await page.textContent('#eExtra'), /4 Skelette besiegt/);
  assert.deepEqual(errors, []);
});

test('Gold: Münzen und Truhe zählen, werden nach dem Sturz gespeichert und nach Neuladen angezeigt', async () => {
  const { page, errors } = await open();
  await starte(page); await page.waitForTimeout(200);
  await setzeVorne(page, [{ typ: 'muenze', spur: 1, vor: 6, y: 0.9 }, { typ: 'muenze', spur: 1, vor: 8, y: 0.9 }, { typ: 'truhe', spur: 1, vor: 12 }, { typ: 'kiste', spur: 1, vor: 20 }]);
  await warte(page, () => window.__kerker.zustand === 'ende');
  const f = await F(page); assert.equal(f.muenzen, 12);
  assert.equal(await page.textContent('#hGold'), '12');
  await page.reload(); await warte(page, () => window.__kerker && window.__kerker.zustand === 'menu', null, 60000);
  assert.equal(await page.textContent('#mGold'), '12');
  assert.equal((await T(page, () => window.__kerker.stand)).gold, 12);
  assert.deepEqual(errors, []);
});

test('Held freischalten (Barbarin für 100 Gold), auswählen und damit laufen; zu teure bleiben gesperrt', async () => {
  const { page, errors, glb } = await open({ save: { v: 1, gold: 130, rekord: 0, meter: 0, kills: 0, helden: ['ritter'], held: 'ritter', ton: false } });
  await page.click('#mRechts'); await warte(page, () => window.__kerker.held && window.__kerker.held.name === 'barbar');
  assert.ok(glb.includes('200 held-barbar.glb'), 'Held wird erst beim Blättern geladen');
  assert.ok(await page.isVisible('#mKaufen')); assert.ok(!(await page.isVisible('#mStart')));
  await page.click('#mKaufen');
  const st = await T(page, () => window.__kerker.stand);
  assert.equal(st.gold, 30); assert.deepEqual(st.helden, ['ritter', 'barbar']); assert.equal(st.held, 'barbar');
  await page.click('#mRechts'); await warte(page, () => window.__kerker.held && window.__kerker.held.name === 'schurke');
  assert.ok(await page.isDisabled('#mKaufen'));
  await page.click('#mLinks'); await warte(page, () => window.__kerker.held.name === 'barbar');
  await starte(page);
  assert.equal((await T(page, () => window.__kerker.held)).name, 'barbar');
  assert.deepEqual(errors, []);
});

test('Pause per Knopf und Escape, Tastatur am Rechner (Pfeile, Leertaste)', async () => {
  const { page, errors } = await open({ size: { width: 1280, height: 800 }, mobil: false });
  await starte(page); await setzeVorne(page, []);
  await page.keyboard.press('ArrowLeft'); await warte(page, () => window.__kerker.lauf.spur === 0);
  await page.keyboard.press('ArrowUp'); await warte(page, () => window.__kerker.lauf.luft);
  await setzeVorne(page, [{ typ: 'skelett', art: 'diener', spur: 0, vor: 9 }]);
  await warte(page, () => { const f = window.__kerker.lauf; return f.strecke.items[0].d - f.d < 4; });
  await page.keyboard.press('Space'); await warte(page, () => window.__kerker.lauf.kills === 1, null, 3000);
  await page.keyboard.press('Escape'); assert.equal(await T(page, () => window.__kerker.zustand), 'pause');
  const d1 = (await F(page)).d; await page.waitForTimeout(400); assert.equal((await F(page)).d, d1, 'steht still');
  await page.keyboard.press('Escape'); await warte(page, () => window.__kerker.zustand === 'lauf');
  await page.click('#bPause'); assert.ok(await page.isVisible('#pause'));
  await page.click('#pMenu'); await warte(page, () => window.__kerker.zustand === 'menu');
  assert.deepEqual(errors, []);
});

test('Dauerlauf: Bot läuft 30 s über die echte Strecke, Skelette aus dem Pool, wenige Zeichenaufrufe', async () => {
  const { page, errors } = await open({ size: { width: 360, height: 640 }, seed: 11 });
  await starte(page);
  await T(page, () => {
    const BLOCK = new Set(['kiste', 'fass', 'stapel']), send = (code) => dispatchEvent(new KeyboardEvent('keydown', { code }));
    window.__bot = setInterval(() => {
      const f = window.__kerker.lauf; if (f.tot) return;
      const vor = f.strecke.items.filter((it) => !it.weg && !it.besiegt && !['muenze', 'truhe'].includes(it.typ) && it.d > f.d - 0.2 && it.d < f.d + 40).sort((a, b) => a.d - b.d);
      if (!vor.length) return;
      const reihe = vor.filter((it) => it.d === vor[0].d), art = (l) => { const it = reihe.find((i) => i.spur === l); return it ? (BLOCK.has(it.typ) ? 9 : 1) : 0; };
      let ziel = f.spur, best = 99;
      for (const l of [0, 1, 2]) { const k = art(l) * 3 + Math.abs(l - f.spur); if (k < best) { best = k; ziel = l; } }
      if (ziel < f.spur) send('ArrowLeft'); else if (ziel > f.spur) send('ArrowRight');
      const hier = reihe.find((i) => i.spur === f.spur), abst = vor[0].d - f.d;
      if (hier && hier.typ === 'stachel' && !f.luft && abst < 4.5) send('ArrowUp');
      if (hier && hier.typ === 'skelett' && abst < 5) send('Space');
    }, 30);
  });
  await page.waitForTimeout(30000);
  const f = await F(page);
  assert.ok(!f.tot && f.d > 60, 'gelaufen: ' + JSON.stringify(f)); // Software-Grafik im Test: wenige Bilder pro Sekunde, Spielzeit läuft langsamer
  const n = await T(page, () => window.__kerker.lauf.strecke.items.length);
  assert.ok(n < 300, 'alte Objekte werden entfernt: ' + n);
  assert.ok(await T(page, () => window.__kerker.zeichnungen) < 70, 'wenige Zeichenaufrufe');
  assert.ok((await T(page, () => window.__kerker.skelette)).length <= 14);
  await T(page, () => clearInterval(window.__bot));
  assert.deepEqual(errors, []);
});

test('Handy-Layout 390×844 und 360×640: Menü-Knöpfe erreichbar, HUD passt, kein Querscrollen', async () => {
  for (const size of [{ width: 390, height: 844 }, { width: 360, height: 640 }]) {
    const { page, errors } = await open({ size });
    for (const id of ['mStart', 'mLinks', 'mRechts']) {
      const b = await page.locator('#' + id).boundingBox();
      assert.ok(b && b.y + b.height <= size.height && b.x >= 0 && b.x + b.width <= size.width, id + ' ' + JSON.stringify(b));
    }
    await starte(page);
    const hud = await page.locator('#hud').boundingBox(), pause = await page.locator('#bPause').boundingBox();
    assert.ok(hud.width <= size.width && pause.x + pause.width <= size.width);
    assert.ok(await T(page, () => document.documentElement.scrollWidth <= innerWidth && getComputedStyle(document.getElementById('fang')).display === 'block'));
    const meta = await T(page, () => document.querySelector('meta[name=viewport]').content);
    assert.match(meta, /user-scalable=no/);
    assert.deepEqual(errors, []);
  }
});
