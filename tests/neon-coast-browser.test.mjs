// Neon Coast – Fluchtwagen – Browserprüfung: Seite lädt ohne Fehler, Steuerung (Lenkleiste, Pedale, Tasten), Koffer -> HUD,
// Nitro, Pause mit Stadtplan, Nacht beenden -> Abrechnung und Spielstand, Garage-Kauf, Platz auf kleinen Handys.
// Eigener kleiner Static-Server (wie Cloudflare: /pfad -> pfad.html).
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
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.mp3': 'audio/mpeg' };
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
  const args = ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'];
  try { browser = await chromium.launch({ args }); } catch (e) {
    const dir = '/opt/pw-browsers', c = existsSync(dir) ? readdirSync(dir).filter((d) => d.startsWith('chromium-')).flatMap((d) => [join(dir, d, 'chrome-linux/chrome'), join(dir, d, 'chrome-linux64/chrome')]).find(existsSync) : null;
    browser = await chromium.launch({ executablePath: c, args });
  }
});
after(async () => { await browser?.close(); server?.close(); });

async function open({ size = { width: 390, height: 780 }, save = null, query = '', touch = true } = {}) {
  const ctx = await browser.newContext({ viewport: size, hasTouch: touch, isMobile: touch });
  await ctx.route('**/assets/playsaal*.js', (r) => r.fulfill({ contentType: 'application/javascript', body: '' }));
  if (save) await ctx.addInitScript((s) => { if (!sessionStorage.getItem('gesetzt')) { localStorage.setItem('neoncoast.v1', s); sessionStorage.setItem('gesetzt', '1'); } }, JSON.stringify(save));
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('response', (r) => { if (r.status() >= 400) errors.push(r.status() + ' ' + r.url()); });
  await page.goto(base + '/spiele/neon-coast' + query);
  await page.waitForSelector('body.ready');
  return { ctx, page, errors };
}
const mode = (page) => page.evaluate(() => window.__neoncoast.mode);
const zeiger = (page, typ, id, x, y) => page.evaluate(([t, i, a, b]) => document.getElementById('game').dispatchEvent(new PointerEvent(t, { pointerId: i, clientX: a, clientY: b, bubbles: true, cancelable: true, pointerType: 'touch' })), [typ, id, x, y]);
const lenk = (page) => page.evaluate(() => ({ ...window.__neoncoast.eingabe }));
const mitte = async (page, sel, fx = 0.5, fy = 0.5) => { const k = await kasten(page, sel); return [k.x0 + (k.x1 - k.x0) * fx, k.y0 + (k.y1 - k.y0) * fy]; };
const kasten = (page, sel) => page.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return { x0: r.left, y0: r.top, x1: r.right, y1: r.bottom }; }, sel);
const frei = (a, b) => a.x1 <= b.x0 || b.x1 <= a.x0 || a.y1 <= b.y0 || b.y1 <= a.y0;

test('Start: lädt ohne Fehler, alle Bilder da, Losfahren auf kleinen Handys sichtbar, Einladung wird gezeigt', async () => {
  for (const size of [{ width: 320, height: 568 }, { width: 390, height: 780 }, { width: 412, height: 915 }]) {
    const { ctx, page, errors } = await open({ size, query: '?r=2500' });
    assert.equal(await mode(page), 'start');
    const b = await kasten(page, '#bLos');
    assert.ok(b.y1 <= size.height && b.x0 >= 0 && b.x1 <= size.width, `Losfahren im Bild bei ${size.width}×${size.height}`);
    assert.match(await page.textContent('#einladung'), /2\.500 \$/);
    assert.ok(await page.evaluate(() => document.getElementById('hero').naturalWidth > 0), 'Kachel geladen');
    const bilder = await page.evaluate(async () => { const m = await import('/spiele/neon-coast/zeichner.js'); const g = await import('/spiele/neon-coast/bilder.js'); return [Object.keys(g.GROESSE).length, Object.keys(g.GROESSE).filter((k) => !m.IMG[k])]; });
    assert.deepEqual(bilder[1], [], 'alle Motive geladen'); assert.ok(bilder[0] > 50);
    assert.deepEqual(errors, []);
    await ctx.close();
  }
});

test('Fahren: Lenkleiste stufenlos, Gas/Bremse/Handbremse (auch von Pedal zu Pedal gerutscht), Nitro, Tasten; nichts überlappt', async () => {
  for (const size of [{ width: 320, height: 568 }, { width: 390, height: 780 }]) {
    const { ctx, page, errors } = await open({ size });
    await page.click('#bLos');
    assert.equal(await mode(page), 'spiel');
    assert.ok(await page.isVisible('#hud') && await page.isVisible('#ctl'));
    const namen = ['#lenk', '#bGas', '#bBremse', '#bHand', '#bNitro'], k = {};
    for (const n of [...namen, '#bPause']) { k[n] = await kasten(page, n); assert.ok(k[n].x0 >= 0 && k[n].x1 <= size.width && k[n].y0 >= 0 && k[n].y1 <= size.height, n + ' im Bild'); }
    for (let a = 0; a < namen.length; a++) for (let b = a + 1; b < namen.length; b++) assert.ok(frei(k[namen[a]], k[namen[b]]), namen[a] + ' und ' + namen[b] + ' überlappen nicht');
    assert.ok(k['#bGas'].x1 - k['#bGas'].x0 >= 72 && k['#bGas'].y1 - k['#bGas'].y0 >= 96 && k['#bBremse'].x1 - k['#bBremse'].x0 >= 60 && k['#lenk'].x1 - k['#lenk'].x0 >= 125, 'groß genug für Daumen');
    // Auto steht, bis Gas kommt
    assert.equal(await page.evaluate(() => window.__neoncoast.S.wartet), true);
    const a0 = await page.evaluate(() => window.__neoncoast.S.sp.a);
    // Lenkleiste: Rand = Vollausschlag, dazwischen stufenlos, Mitte = geradeaus
    const y = (await mitte(page, '#lenk'))[1];
    await zeiger(page, 'pointerdown', 1, k['#lenk'].x0 + 8, y);
    assert.equal((await lenk(page)).lenk, -1);
    await zeiger(page, 'pointermove', 1, (await mitte(page, '#lenk', 0.33))[0], y);
    const teil = (await lenk(page)).lenk; assert.ok(teil < -0.1 && teil > -0.8, 'halber Weg lenkt nur teilweise: ' + teil);
    await zeiger(page, 'pointermove', 1, (await mitte(page, '#lenk'))[0], y); assert.equal((await lenk(page)).lenk, 0);
    await zeiger(page, 'pointermove', 1, k['#lenk'].x1 - 8, y); assert.equal((await lenk(page)).lenk, 1);
    await zeiger(page, 'pointermove', 1, k['#lenk'].x0 + 8, y - 40); assert.equal((await lenk(page)).lenk, -1, 'auch knapp über der Leiste');
    assert.equal(await page.evaluate(() => window.__neoncoast.S.wartet), false);
    assert.ok(await page.evaluate(() => Math.hypot(window.__neoncoast.S.sp.vx, window.__neoncoast.S.sp.vy) < 0.01), 'ohne Gas rollt nichts');
    // Gas: fährt los und dreht nach links
    await zeiger(page, 'pointerdown', 2, ...(await mitte(page, '#bGas')));
    assert.deepEqual([(await lenk(page)).gas, (await lenk(page)).bremse, (await lenk(page)).hand], [true, false, false]);
    assert.ok(await page.evaluate(() => document.getElementById('bGas').classList.contains('an')));
    await page.waitForFunction(() => window.__neoncoast.S.t > 0.9);
    assert.ok(await page.evaluate((a) => window.__neoncoast.S.sp.a < a - 0.2 && Math.hypot(window.__neoncoast.S.sp.vx, window.__neoncoast.S.sp.vy) > 3, a0), 'Auto fährt und dreht nach links');
    // derselbe Daumen rutscht aufs nächste Pedal
    await zeiger(page, 'pointermove', 2, ...(await mitte(page, '#bHand')));
    assert.deepEqual([(await lenk(page)).gas, (await lenk(page)).hand], [false, true]);
    await zeiger(page, 'pointermove', 2, ...(await mitte(page, '#bBremse')));
    assert.deepEqual([(await lenk(page)).gas, (await lenk(page)).hand, (await lenk(page)).bremse], [false, false, true]);
    await zeiger(page, 'pointermove', 2, ...(await mitte(page, '#bGas'))); assert.equal((await lenk(page)).gas, true);
    // Nitro mit einem dritten Finger
    await page.evaluate(() => { window.__neoncoast.S.nitro = 1; });
    await zeiger(page, 'pointerdown', 3, ...(await mitte(page, '#bNitro')));
    await page.waitForFunction(() => window.__neoncoast.S.stat.nitro === 1);
    await zeiger(page, 'pointerup', 3, 0, 0);
    await zeiger(page, 'pointerup', 2, 0, 0); await zeiger(page, 'pointerup', 1, 0, 0);
    assert.deepEqual(await lenk(page), { lenk: 0, gas: false, bremse: false, hand: false, nitro: false });
    // Tasten
    await page.keyboard.down('ArrowRight'); assert.equal((await lenk(page)).lenk, 1);
    await page.keyboard.down('KeyW'); assert.equal((await lenk(page)).gas, true);
    await page.keyboard.down('Space'); assert.equal((await lenk(page)).hand, true);
    await page.keyboard.down('ArrowDown'); assert.equal((await lenk(page)).bremse, true);
    for (const t of ['ArrowDown', 'Space', 'KeyW', 'ArrowRight']) await page.keyboard.up(t);
    assert.deepEqual(await lenk(page), { lenk: 0, gas: false, bremse: false, hand: false, nitro: false });
    assert.deepEqual(errors, []);
    await ctx.close();
  }
});

test('Koffer füllt die Beute, Stern leuchtet, Nitro zündet; Pause zeigt den Stadtplan; Nacht beenden rechnet ab und speichert', async () => {
  const { ctx, page, errors } = await open({ save: { v: 1, geld: 0, rekord: 0, autos: ['flitzer'], auto: 'flitzer', erledigt: [], stat: { naechte: 2, sicher: 0 }, mute: true, hilfe: 3 } });
  await page.click('#bLos');
  // Auto anhalten und auf den ersten Koffer setzen
  const wert = await page.evaluate(() => { const S = window.__neoncoast.S, k = S.koffer[0]; S.sp.vmax = 0.0001; S.sp.x = k.x; S.sp.y = k.y; S.wartet = false; return k.wert; });
  await page.waitForFunction(() => window.__neoncoast.S.beute > 0);
  await page.waitForFunction((t) => document.getElementById('hBeuteZ').textContent === t, wert.toLocaleString('de-DE') + ' $');
  assert.equal(await page.evaluate(() => document.querySelectorAll('#hSterne .an').length), 1);
  assert.match(await page.textContent('#hSuchT'), /Peilsender|Polizei sieht dich/);
  await page.evaluate(() => { window.__neoncoast.S.nitro = 1; });
  await page.waitForSelector('#bNitro.voll');
  await zeiger(page, 'pointerdown', 7, ...(await mitte(page, '#bNitro'))); await zeiger(page, 'pointerup', 7, 0, 0);
  await page.waitForSelector('#bNitro.brennt');
  assert.equal(await page.evaluate(() => window.__neoncoast.S.stat.nitro), 1);
  // Pause
  await page.click('#bPause'); assert.equal(await mode(page), 'pause');
  const t0 = await page.evaluate(() => window.__neoncoast.S.t); await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => window.__neoncoast.S.t), t0, 'in der Pause steht die Zeit');
  const farben = await page.evaluate(() => { const c = document.getElementById('karte'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data, s = new Set(); for (let i = 0; i < d.length; i += 4 * 97) s.add(d[i] + ',' + d[i + 1] + ',' + d[i + 2]); return s.size; });
  assert.ok(farben > 6, 'Stadtplan gezeichnet');
  assert.equal(await page.locator('#pAuftraege .auftrag').count(), 3);
  await page.click('#pWeiter'); assert.equal(await mode(page), 'spiel');
  // etwas sichern, dann Nacht beenden
  await page.evaluate(() => { const S = window.__neoncoast.S; S.sicher = S.stat.sicher = 1200; });
  await page.click('#bPause'); await page.click('#pEnde');
  await page.waitForFunction(() => window.__neoncoast.mode === 'ende');
  assert.equal(await page.textContent('#eTitel'), 'FEIERABEND');
  const text = await page.textContent('#eRechnung');
  assert.match(text, /Gesichert1\.200 \$/); assert.match(text, /Im Auto verloren/); assert.match(text, /Auftrag: Sichere 500 \$ im Versteck\+200 \$/); assert.match(text, /Aufs Konto\+1\.400 \$/);
  assert.ok(await page.isVisible('#eRekord'));
  const save = JSON.parse(await page.evaluate(() => localStorage.getItem('neoncoast.v1')));
  assert.equal(save.geld, 1400); assert.equal(save.rekord, 1200); assert.equal(save.stat.naechte, 3); assert.deepEqual(save.erledigt, ['a1']);
  const b = await kasten(page, '#eNochmal'); assert.ok(b.y1 <= 780, 'Nächste Nacht ohne Scrollen erreichbar');
  await page.click('#eNochmal'); assert.equal(await mode(page), 'spiel');
  assert.equal(await page.evaluate(() => window.__neoncoast.S.sicher), 0);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('Garage: kaufen, wählen, speichern; Aufträge und Hilfe öffnen und schließen', async () => {
  const { ctx, page, errors } = await open({ save: { v: 1, geld: 2000, rekord: 900, autos: ['flitzer'], auto: 'flitzer', erledigt: ['a1'], stat: { naechte: 4, sicher: 2500 }, mute: true, hilfe: 3 } });
  assert.ok(await page.isVisible('#garagePunkt'), 'Hinweis: ein Auto ist bezahlbar');
  assert.match(await page.textContent('#sRang'), /Fahrer/);
  await page.click('#bGarage');
  assert.equal(await page.locator('#gListe .auto').count(), 8);
  await page.click('#gListe .auto:nth-child(2) button');
  let save = JSON.parse(await page.evaluate(() => localStorage.getItem('neoncoast.v1')));
  assert.equal(save.geld, 500); assert.deepEqual(save.autos, ['flitzer', 'taxi']); assert.equal(save.auto, 'taxi');
  assert.match(await page.textContent('#gListe .auto.gewaehlt h3'), /Taxi/);
  assert.ok(await page.locator('#gListe .auto:nth-child(3) button').isDisabled(), 'Limousine noch zu teuer');
  await page.click('#gListe .auto:nth-child(1) button');
  save = JSON.parse(await page.evaluate(() => localStorage.getItem('neoncoast.v1'))); assert.equal(save.auto, 'flitzer');
  await page.click('#garage [data-zurueck]'); assert.equal(await mode(page), 'start');
  await page.click('#bAuftraege'); assert.equal(await page.locator('#aListe .auftrag').count(), 3); assert.match(await page.textContent('#aStand'), /1 von 28/);
  await page.keyboard.press('Escape'); assert.equal(await mode(page), 'start');
  await page.click('#bHilfe'); assert.equal(await page.locator('#hilfe .hilfe > div').count(), 8); await page.click('#hilfe [data-zurueck]');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('Rechner im Querformat: ganze Fensterbreite, Tastenhilfe statt Pedalen, Shift zündet Nitro', async () => {
  const { ctx, page, errors } = await open({ size: { width: 1280, height: 720 }, touch: false });
  await page.click('#bLos');
  assert.ok(await page.isVisible('#tasten')); assert.ok(!(await page.isVisible('#lenk')) && !(await page.isVisible('#bGas')));
  assert.ok(await page.isVisible('#bNitro'), 'Nitro-Anzeige bleibt sichtbar');
  assert.deepEqual(await page.evaluate(() => { const c = document.getElementById('game'); return [c.clientWidth, c.clientHeight]; }), [1280, 720]);
  await page.keyboard.down('ArrowUp'); await page.keyboard.down('ArrowLeft');
  await page.waitForFunction(() => window.__neoncoast.S.t > 1);
  await page.keyboard.up('ArrowLeft'); await page.keyboard.up('ArrowUp');
  assert.ok(await page.evaluate(() => Math.hypot(window.__neoncoast.S.sp.vx, window.__neoncoast.S.sp.vy) > 5), 'Auto fährt');
  await page.evaluate(() => { window.__neoncoast.S.nitro = 1; });
  await page.keyboard.press('ShiftLeft');
  await page.waitForFunction(() => window.__neoncoast.S.stat.nitro === 1);
  await page.keyboard.press('Escape'); assert.equal(await mode(page), 'pause');
  await page.keyboard.press('Escape'); assert.equal(await mode(page), 'spiel');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('Autoradio: nach dem ersten Tippen lädt einer der beiden eigenen Sender, beide Dateien sind da', async () => {
  const { ctx, page, errors } = await open();
  const geladen = page.waitForRequest((r) => /\/spiele\/neon-coast\/radio\/sender-[12]\.mp3$/.test(r.url()), { timeout: 15000 });
  await page.click('#bLos');
  await geladen;
  for (const n of [1, 2]) assert.equal(await page.evaluate(async (k) => (await fetch('/spiele/neon-coast/radio/sender-' + k + '.mp3', { method: 'HEAD' })).status, n), 200);
  assert.deepEqual(errors, []);
  await ctx.close();
});
