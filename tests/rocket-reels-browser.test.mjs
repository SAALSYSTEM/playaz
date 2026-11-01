// ROCKET REELS – Browserprüfung (nur dieses Spiel): Layout auf schmalen Handys/quer/Desktop, Doppeltipp, Gewinn sichern,
// Hyperjump (Erfolg, Verlust, Neuladen mitten im Risiko), Freispiele komplett, Nachtanken, Gewinnübersicht = Regeln,
// Konto-Modus über die echte Edge-Function-Logik (Ersatz-Datenbank) inkl. Gast-Übernahme, Konto-Hinweis mit 24-h-Ruhe.
// Eigener kleiner Static-Server (wie Cloudflare: /pfad -> pfad.html). node --test --test-concurrency=1 tests/rocket-reels-browser.test.mjs
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, extname, normalize } from 'node:path';
import * as E from '../public/spiele/rocket-reels/engine.js';
import { behandle } from '../supabase/functions/rocket-reels/handler.js';
import { ersatzSupabase } from './rocket-reels-ersatz.mjs';

const ROOT = new URL('../public/', import.meta.url).pathname;
function ladePlaywright() {
  const req = createRequire(import.meta.url);
  try { return req('playwright'); } catch (e) {}
  const g = execSync('npm root -g').toString().trim();
  try { return req(join(g, 'playwright')); } catch (e) {}
  return req('/opt/npm-tools/node_modules/playwright');
}
const { chromium } = ladePlaywright();
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.webp': 'image/webp', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };
let server, browser, base;
const UID = '11111111-2222-3333-4444-555555555555';

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
  try { browser = await chromium.launch(); } catch (e) {
    const dir = '/opt/pw-browsers', c = existsSync(dir) ? readdirSync(dir).filter((d) => d.startsWith('chromium-')).map((d) => join(dir, d, 'chrome-linux/chrome')).find(existsSync) : null;
    browser = await chromium.launch({ executablePath: c });
  }
});
after(async () => { await browser?.close(); server?.close(); });

// Stopps für gezielte Situationen
const W3 = [E.BAENDER[0].indexOf(E.WILD), E.BAENDER[1].indexOf(E.WILD), E.BAENDER[2].indexOf(E.WILD), 5, 5];
function gewinnStopps() { const z = E.seedZufall(3); for (;;) { const s = E.zufallsStopps(z); const w = E.auswerten(E.raster(s), 10); if (w.gesamt >= 30 && w.gesamt <= 90 && !w.ausloesung) return { s, g: w.gesamt }; } }
const GEWINN = gewinnStopps();

async function open({ size = { width: 360, height: 640 }, gast = null, query = '?test', plattform = null, extra = null } = {}) {
  const ctx = await browser.newContext({ viewport: size, hasTouch: true, isMobile: size.width < 700, reducedMotion: 'no-preference' });
  await ctx.route('**/assets/playsaal*.js', (r) => r.fulfill({ contentType: 'application/javascript', body: '' }));
  if (gast) await ctx.addInitScript((s) => { if (!sessionStorage.getItem('gesetzt')) { localStorage.setItem('rocketreels-gast.v1', s); sessionStorage.setItem('gesetzt', '1'); } }, JSON.stringify(gast));
  if (plattform) await ctx.addInitScript(plattform.skript, plattform.arg);
  if (extra) await extra(ctx);
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('response', (r) => { if (r.status() >= 400) errors.push(r.status() + ' ' + r.url()); });
  await page.goto(base + '/spiele/rocket-reels' + query);
  await page.waitForSelector('#laden', { state: 'hidden' });
  return { ctx, page, errors };
}
const Z = (page) => page.evaluate(() => window.__rocket.zustand);
const ruhig = (page) => page.waitForFunction(() => !window.__rocket.beschaeftigt, null, { timeout: 20000 });
const box = (page, sel) => page.locator(sel).boundingBox();

test('Layout: alles sichtbar und ohne Überlappung (320×568, 360×640, 412×915, quer 740×360, Desktop)', async () => {
  for (const size of [{ width: 320, height: 568 }, { width: 360, height: 640 }, { width: 412, height: 915 }, { width: 740, height: 360 }, { width: 1280, height: 800 }]) {
    const { ctx, page, errors } = await open({ size });
    const b = {};
    for (const s of ['#bStart', '#walzen', '.einsatz', '#bCoins', '#bInfo', '#bTon', '#bProfil', '#anzeige']) {
      b[s] = await box(page, s); assert.ok(b[s], s + ' fehlt bei ' + size.width);
      assert.ok(b[s].x >= -1 && b[s].y >= -1 && b[s].x + b[s].width <= size.width + 1 && b[s].y + b[s].height <= size.height + 1, `${s} außerhalb bei ${size.width}×${size.height}: ${JSON.stringify(b[s])}`);
    }
    assert.ok(b['#walzen'].y + b['#walzen'].height <= b['#bStart'].y + 1, 'Walzen überlappen Start bei ' + size.width);
    assert.ok(b['#walzen'].width >= Math.min(size.width, 560) * 0.55 || size.height < 400, 'Walzen zu klein bei ' + size.width);
    assert.ok(b['#bStart'].width >= 80, 'Start zu klein');
    const zelle = await page.evaluate(() => window.__rocket.zelle);
    assert.ok(zelle >= 40);
    assert.deepEqual(errors, []);
    await ctx.close();
  }
});

test('Drehung/Größenänderung: Walzen passen sich an', async () => {
  const { ctx, page, errors } = await open({ size: { width: 360, height: 640 } });
  const vorher = await page.evaluate(() => window.__rocket.zelle);
  await page.setViewportSize({ width: 640, height: 360 });
  await page.waitForTimeout(400);
  const nachher = await page.evaluate(() => window.__rocket.zelle);
  assert.notEqual(vorher, nachher);
  const w = await box(page, '#walzen'), s = await box(page, '#bStart');
  assert.ok(w.y + w.height <= 361 && s.y + s.height <= 361);
  assert.deepEqual(errors, []); await ctx.close();
});

test('Dreh: Einsatz abgezogen, mehrfaches Tippen löst nur eine Runde aus', async () => {
  const { ctx, page, errors } = await open({ query: '?test&seed=11' });
  await page.evaluate(() => { const b = document.querySelector('#bStart'); for (let i = 0; i < 6; i++) b.click(); });
  await ruhig(page);
  const z = await Z(page);
  assert.equal(z.stats.runden, 1);
  assert.equal(z.stats.einsatz, 10);
  // Einsatz 50 wählen, drehen
  await page.click('.einsatz [data-e="50"]');
  if (z.phase === 'gewinn') await page.click('#bSichern');
  await page.click('#bStart'); await ruhig(page);
  const z2 = await Z(page);
  assert.equal(z2.stats.einsatz, 60);
  assert.deepEqual(errors, []); await ctx.close();
});

test('Gewinn sichern, Neuladen behält den Stand', async () => {
  const { ctx, page, errors } = await open({ query: '?test&folge=' + GEWINN.s.join(',') });
  await page.click('#bStart'); await ruhig(page);
  let z = await Z(page);
  assert.equal(z.phase, 'gewinn'); assert.equal(z.offen, GEWINN.g);
  assert.ok(await page.isVisible('#bSichern')); assert.ok(await page.isVisible('#bRisiko'));
  await page.click('#bSichern'); await ruhig(page);
  z = await Z(page);
  assert.equal(z.coins, 1000 - 10 + GEWINN.g); assert.equal(z.phase, 'bereit');
  assert.equal(await page.textContent('#hCoins'), (1000 - 10 + GEWINN.g).toLocaleString('de-DE'));
  await page.reload(); await page.waitForSelector('#laden', { state: 'hidden' });
  assert.equal((await Z(page)).coins, 1000 - 10 + GEWINN.g);
  assert.deepEqual(errors, []); await ctx.close();
});

test('Hyperjump: Erfolg, Neuladen mitten im Risiko, Sichern; danach kein erneutes Riskieren', async () => {
  const { ctx, page, errors } = await open({ query: '?test&folge=' + [...GEWINN.s, 1].join(',') });
  await page.click('#bStart'); await ruhig(page);
  await page.click('#bRisiko');
  await page.waitForSelector('#risiko:not([hidden])');
  await page.click('#rLinks'); await ruhig(page);
  let z = await Z(page);
  assert.equal(z.phase, 'risiko'); assert.equal(z.offen, GEWINN.g * 2); assert.equal(z.coins, 990);
  await page.reload(); await page.waitForSelector('#laden', { state: 'hidden' });
  assert.ok(await page.isVisible('#risiko'), 'Risiko-Spiel nach Neuladen wieder offen');
  assert.ok(!(await page.isEnabled('#bStart')), 'Start im Risiko gesperrt');
  await page.click('#rSichern'); await ruhig(page);
  z = await Z(page);
  assert.equal(z.coins, 990 + GEWINN.g * 2); assert.equal(z.phase, 'bereit'); assert.equal(z.stats.spruenge, 1);
  assert.ok(await page.isHidden('#risiko')); assert.ok(await page.isHidden('#wahl'));
  assert.deepEqual(errors, []); await ctx.close();
});

test('Hyperjump verloren: offener Gewinn weg, Kontostand unberührt', async () => {
  const { ctx, page, errors } = await open({ query: '?test&folge=' + [...GEWINN.s, 0].join(',') });
  await page.click('#bStart'); await ruhig(page);
  await page.click('#bRisiko'); await page.click('#rRechts'); await ruhig(page);
  const z = await Z(page);
  assert.equal(z.coins, 990); assert.equal(z.phase, 'bereit'); assert.equal(z.offen, 0);
  assert.ok(await page.isHidden('#risiko'));
  assert.match(await page.textContent('#anzeige'), /Asteroidensturm/);
  assert.deepEqual(errors, []); await ctx.close();
});

test('Freispiele: Start, Spezial-Symbol, alle Runden, Gutschrift einmal = Regel-Nachrechnung', async () => {
  const folge = [...W3, 11];
  const { ctx, page, errors } = await open({ query: '?test&seed=7&folge=' + folge.join(',') });
  await page.click('#bStart');
  await page.waitForFunction(() => window.__rocket.zustand.phase === 'bonus' || window.__rocket.zustand.stats.freispiele > 0, null, { timeout: 10000 });
  await ruhig(page);
  const z = await Z(page);
  // Gleiche Zufallsfolge in Node nachspielen
  const q = folge.slice(); const basis = E.seedZufall(7); const zuf = (n) => { while (q.length) { const v = q.shift(); if (v < n) return v; } return basis(n); };
  let e = E.aktion(E.neuerZustand(), { typ: 'dreh', einsatz: 10 }, zuf, { tag: 'x' }).zustand;
  assert.equal(e.bonus.sym, E.REGULAER[11]);
  while (e.phase === 'bonus') e = E.aktion(e, { typ: 'dreh' }, zuf).zustand;
  assert.equal(z.phase, e.phase); assert.equal(z.coins, e.coins); assert.deepEqual(z.stats, e.stats);
  assert.equal(z.stats.freispiele, 1);
  assert.ok(await page.isHidden('#bonusHud'));
  assert.ok(await page.isHidden('#szene'));
  assert.deepEqual(errors, []); await ctx.close();
});

test('Leer: kostenlos nachtanken ohne Konto und ohne Werbung', async () => {
  const gast = { ...E.neuerZustand(), coins: 4 };
  const { ctx, page, errors } = await open({ gast });
  assert.equal(await page.textContent('#startText'), 'Tanken');
  await page.click('#bStart'); await ruhig(page);
  const z = await Z(page);
  assert.equal(z.coins, E.NACHFUELLEN); assert.equal(z.stats.nachgefuellt, 1);
  assert.equal(await page.textContent('#startText'), 'Start');
  assert.deepEqual(errors, []); await ctx.close();
});

test('Einsätze über dem Kontostand sind gesperrt; Tagesbonus einmal', async () => {
  const gast = { ...E.neuerZustand(), coins: 30 };
  const { ctx, page, errors } = await open({ gast });
  assert.ok(await page.isEnabled('.einsatz [data-e="20"]'));
  assert.ok(!(await page.isEnabled('.einsatz [data-e="50"]')));
  await page.click('#bTages'); await ruhig(page);
  assert.equal((await Z(page)).coins, 30 + E.TAGESBONUS);
  assert.ok(await page.isHidden('#bTages'));
  assert.ok(await page.isEnabled('.einsatz [data-e="100"]'));
  assert.deepEqual(errors, []); await ctx.close();
});

test('Gewinnübersicht zeigt genau die Werte der Regeln', async () => {
  const { ctx, page, errors } = await open();
  await page.click('.einsatz [data-e="20"]');
  await page.click('#bInfo');
  const zeilen = await page.$$eval('#iTabelle .zeile', (z) => z.map((x) => [x.querySelector('.sr').textContent, [...x.querySelectorAll('li b')].map((b) => b.textContent)]));
  assert.equal(zeilen.length, 12);
  zeilen.forEach(([name, werte], i) => {
    assert.equal(name, E.SYMBOLE[i].name);
    assert.deepEqual(werte, [5, 4, 3].map((n) => (E.AUSZAHLUNG[i][n - 3] * 2).toLocaleString('de-DE')));
  });
  assert.equal(await page.$$eval('#iLinien .linie', (l) => l.length), 10);
  const txt = await page.textContent('#info');
  assert.match(txt, /keinen Geldwert/); assert.match(txt, /50 %/); assert.match(txt, /keine offizielle Altersfreigabe/);
  assert.match(txt, new RegExp((E.QUOTE * 100).toLocaleString('de-DE', { maximumFractionDigits: 1 }).replace('.', '\\.')));
  await page.click('#info [data-zu]'); assert.ok(await page.isHidden('#info'));
  assert.deepEqual(errors, []); await ctx.close();
});

// Ersatz-PlaySaal (angemeldet) + Edge Function über die echte handler.js
function plattform(angemeldet) {
  return {
    skript: ([uid, an]) => {
      const cfg = { url: 'https://sb.test', key: 'k', rocketReels: true };
      window.PLAYSAAL_CFG = cfg;
      window.PlaySaal = { cfg, hostOk: true, bereit: () => true, on() {}, token: () => 'gut', user: () => (an ? { id: uid } : null),
        anbieter: async () => ({ email: true }), anmelden() { window.__anmelden = (window.__anmelden || 0) + 1; } };
    },
    arg: [UID, angemeldet]
  };
}
async function edgeRoute(ctx, sb) {
  await ctx.route('https://sb.test/functions/v1/rocket-reels', async (route) => {
    const r = route.request();
    const kopf = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, apikey, content-type' };
    if (r.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: kopf });
    const antwort = await behandle(new Request('https://sb.test/functions/v1/rocket-reels', { method: 'POST', headers: { authorization: r.headers().authorization, origin: 'https://playsaal.com' }, body: r.postData() }),
      { url: 'https://sb.test', serviceKey: 'service' }, sb.f);
    route.fulfill({ status: antwort.status, headers: { ...kopf, 'content-type': 'application/json' }, body: await antwort.text() });
  });
}

test('Konto: Gast-Stand einmalig übernehmen, danach rechnet der Server', async () => {
  const sb = ersatzSupabase();
  const gast = { ...E.neuerZustand(), coins: 3456, stats: { ...E.neueStatistik(), runden: 25, einsatz: 500, gewinn: 2956, hoechster: 300 } };
  const { ctx, page, errors } = await open({ gast, plattform: plattform(true), extra: (c) => edgeRoute(c, sb) });
  await page.waitForSelector('#gast:not([hidden])');
  assert.match(await page.textContent('#gText'), /3\.456/);
  await page.click('#gJa');
  await page.waitForFunction(() => window.__rocket.zustand.coins === 3456);
  assert.equal(await page.evaluate(() => window.__rocket.art), 'konto');
  assert.equal(sb.db.get(UID).zustand.gastUebernommen, true);
  assert.equal(sb.db.get(UID).zustand.stats.runden, 25);
  await page.click('#bStart'); await ruhig(page);
  const z = await Z(page);
  assert.deepEqual(sb.db.get(UID).zustand, z, 'Browser zeigt den Server-Stand');
  assert.equal(z.stats.runden, 26);
  // Neuladen: keine zweite Übernahme angeboten
  await page.reload(); await page.waitForSelector('#laden', { state: 'hidden' });
  await page.waitForTimeout(200);
  assert.ok(await page.isHidden('#gast'));
  assert.equal((await Z(page)).coins, z.coins);
  // Profil zeigt Konto
  await page.click('#bProfil'); assert.match(await page.textContent('#pModus'), /Konto/);
  assert.deepEqual(errors, []); await ctx.close();
});

test('Gast: dezenter Konto-Hinweis nach 10 Runden, nach Ablehnung 24 h Ruhe', async () => {
  const gast = { ...E.neuerZustand(), stats: { ...E.neueStatistik(), runden: 9, einsatz: 90 } };
  const { ctx, page, errors } = await open({ gast, query: '?test&seed=4', plattform: plattform(false) });
  await page.click('#bStart'); await ruhig(page);
  await page.waitForSelector('#werbung:not([hidden])');
  assert.match(await page.textContent('#werbung'), /Mission erfolgreich!/);
  await page.click('#wNein');
  assert.ok(await page.isHidden('#werbung'));
  for (let i = 0; i < 3; i++) { if ((await Z(page)).phase === 'gewinn') await page.click('#bSichern'); await page.click('#bStart'); await ruhig(page); }
  assert.ok(await page.isHidden('#werbung'));
  const h = await page.evaluate(() => JSON.parse(localStorage.getItem('rocketreels-hinweis')));
  assert.ok(Date.now() - h.nein < 60000);
  // "Coins sichern" öffnet die PlaySaal-Anmeldung
  await page.click('#bProfil'); await page.click('#pKonto');
  assert.equal(await page.evaluate(() => window.__anmelden), 1);
  assert.deepEqual(errors, []); await ctx.close();
});
