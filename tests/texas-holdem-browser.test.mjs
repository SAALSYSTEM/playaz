// TEXAS HOLD'EM – Browserprüfung (nur dieses Spiel): Layout 320–1280 px, Lobby, Cash-Game mit Knöpfen und Raise-Regler,
// keine Gegnerkarten im Browser, Aufstehen gibt Chips zurück, Sit & Go bis zum Ende, Nachkaufen bei leerem Stack, Auffüllen gesperrt.
// node --test --test-concurrency=1 tests/texas-holdem-browser.test.mjs
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, extname, normalize } from 'node:path';
import * as P from '../public/spiele/texas-holdem/poker.js';
import * as E from '../public/spiele/rocket-reels/engine.js';

const ROOT = new URL('../public/', import.meta.url).pathname;
function ladePlaywright() {
  const req = createRequire(import.meta.url);
  try { return req('playwright'); } catch (e) {}
  const g = execSync('npm root -g').toString().trim();
  try { return req(join(g, 'playwright')); } catch (e) {}
  return req('/opt/npm-tools/node_modules/playwright');
}
const { chromium } = ladePlaywright();
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.json': 'application/json', '.webp': 'image/webp', '.ico': 'image/x-icon' };
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
  try { browser = await chromium.launch(); } catch (e) {
    const dir = '/opt/pw-browsers', c = existsSync(dir) ? readdirSync(dir).filter((d) => d.startsWith('chromium-')).map((d) => join(dir, d, 'chrome-linux/chrome')).find(existsSync) : null;
    browser = await chromium.launch({ executablePath: c });
  }
});
after(async () => { await browser?.close(); server?.close(); });

async function open({ size = { width: 360, height: 640 }, gast = null, seed = 1 } = {}) {
  const ctx = await browser.newContext({ viewport: size, hasTouch: true, isMobile: size.width < 700 });
  await ctx.route('**/assets/playsaal*.js', (r) => r.fulfill({ contentType: 'application/javascript', body: '' }));
  if (gast) await ctx.addInitScript((s) => { if (!sessionStorage.getItem('gesetzt')) { localStorage.setItem('rocketreels-gast.v1', s); sessionStorage.setItem('gesetzt', '1'); } }, JSON.stringify(gast));
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('response', (r) => { if (r.status() >= 400) errors.push(r.status() + ' ' + r.url()); });
  await page.goto(base + '/spiele/texas-holdem?test&seed=' + seed);
  await page.waitForFunction(() => document.querySelector('#laden').hidden);
  return { ctx, page, errors };
}
const st = (page) => page.evaluate(() => window.__holdem.zustand);
const ruhig = (page) => page.waitForFunction(() => !window.__holdem.beschaeftigt);
// Keine verdeckten Gegnerkarten im Browser – weder im Zustand noch im DOM
async function keineFremdenKarten(page) {
  const z = await st(page); const t = z.poker.t; if (!t) return;
  assert.deepEqual(t.deck, []);
  t.s.forEach((x, i) => { if (i > 0 && x.k && !x.o) assert.deepEqual(x.k, [-1, -1]); });
  const offen = await page.evaluate(() => [...document.querySelectorAll('#sitze .hk .karte-x:not(.ruecken)')].length);
  const gezeigt = t.s.filter((x, i) => i > 0 && x.o && x.k && !x.f).length * 2;
  assert.ok(offen <= gezeigt, 'nur aufgedeckte Karten sichtbar');
}
// spielt eine Aktion über die Knöpfe; gibt false zurück, wenn kein Tisch mehr
async function schritt(page, wahl) {
  const z = await st(page); const t = z.poker.t; if (!t) return false;
  if (t.phase === 'ende') await page.click('#bWeiter');
  else if (t.phase === 'leer') return false;
  else if (wahl === 'raise' && await page.isEnabled('#bRaise')) { await page.click('#bRaise'); await page.click('#raisePreset [data-r="0.5"]'); await page.click('#bRaiseOk'); }
  else if (wahl === 'fold') await page.click('#bFold');
  else await page.click('#bCall');
  await ruhig(page);
  return true;
}

test('Layout: Lobby und Tisch sichtbar, kein Überlauf, keine Fehler (320–1280 px)', async () => {
  for (const size of [{ width: 320, height: 568 }, { width: 360, height: 640 }, { width: 390, height: 844 }, { width: 1280, height: 800 }]) {
    const { ctx, page, errors } = await open({ size });
    assert.ok(await page.isVisible('[data-cash="0"]'));
    await page.click('[data-cash="0"]'); await page.click('#bOk'); await ruhig(page);
    const m = await page.evaluate(() => {
      const r = (s) => document.querySelector(s).getBoundingClientRect();
      return { sw: document.documentElement.scrollWidth, vw: innerWidth, vh: innerHeight,
        sitze: [...document.querySelectorAll('.sitz')].map((s) => s.getBoundingClientRect()).map((b) => [b.left, b.right, b.top, b.bottom]),
        karten: r('#meineKarten'), steuer: r('#steuer'), board: r('#board') };
    });
    assert.ok(m.sw <= m.vw, size.width + ': kein Überlauf');
    for (const [l, rr, t, b] of m.sitze) assert.ok(l >= -2 && rr <= m.vw + 2 && t >= 0 && b <= m.vh, size.width + 'x' + size.height + ': Sitz sichtbar ' + [l, rr, t, b]);
    assert.ok(m.karten.bottom <= m.steuer.top + 2, size.width + ': eigene Karten über den Knöpfen');
    await keineFremdenKarten(page);
    assert.deepEqual(errors, []);
    await ctx.close();
  }
});

test('Cash-Game: 40 Aktionen über die Knöpfe (inkl. Raise-Regler), Anzeige = Zustand, Aufstehen gibt Chips zurück', async () => {
  const { ctx, page, errors } = await open({ seed: 7 });
  await page.click('[data-cash="0"]');
  await page.click('#bOk'); await ruhig(page);
  let z = await st(page); assert.equal(z.coins, 0); assert.equal(z.poker.t.s[0].c + z.poker.t.s[0].g, 1000);
  for (let n = 0; n < 40; n++) {
    if (!await schritt(page, n % 5 === 2 ? 'raise' : n % 7 === 3 ? 'fold' : 'call')) break;
    z = await st(page);
    const t = z.poker.t; if (!t) break;
    await keineFremdenKarten(page);
    const chipsAnzeige = await page.evaluate(() => [...document.querySelectorAll('.sitz .chips')].map((c) => c.textContent));
    t.s.forEach((x, i) => { if (!(x.a && x.c === 0)) assert.equal(chipsAnzeige[i], x.c.toLocaleString('de-DE'), 'Chips Sitz ' + i + ' nach Schritt ' + n); });
    if (P.moeglich(t)) assert.ok(await page.isVisible('#zugKnoepfe'), 'Knöpfe sichtbar, wenn ich dran bin');
  }
  // aufstehen (ggf. passen)
  z = await st(page);
  const chips = z.poker.t.s[0].c;
  if (await page.isVisible('#meldung')) await page.click('#mKnoepfe button:has-text("Aufstehen")'); // Stack leer
  else {
    await page.click('#bInfo'); await page.click('#iAufstehen');
    if (await page.isVisible('#meldung')) await page.click('#mKnoepfe .haupt');
  }
  await page.waitForFunction(() => !window.__holdem.zustand.poker.t);
  z = await st(page);
  assert.ok(z.coins >= 0 && (z.coins === chips || z.poker.stats.cashAus === z.coins));
  assert.ok(await page.isVisible('#lobby'));
  assert.equal(await page.textContent('#hCoins'), z.coins.toLocaleString('de-DE'));
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('Sit & Go: immer passen → Turnier endet mit Platzierung, Preis stimmt, zurück zur Lobby', async () => {
  const { ctx, page, errors } = await open({ seed: 3 });
  await page.click('[data-sng="0"]'); await ruhig(page);
  let z = await st(page); assert.equal(z.coins, 900);
  for (let n = 0; n < 400 && z.poker.t; n++) {
    if (await page.isVisible('#meldung')) break;
    await schritt(page, 'fold');
    z = await st(page);
  }
  await page.waitForSelector('#meldung:not([hidden])');
  const titel = await page.textContent('#mTitel');
  z = await st(page);
  assert.equal(z.poker.t, null);
  assert.equal(z.poker.stats.sng, 1);
  const platz = /Turniersieg/.test(titel) ? 1 : Number(titel.replace(/\D/g, ''));
  assert.equal(z.coins, 900 + (platz === 1 ? 400 : platz === 2 ? 200 : 0));
  await page.click('#mKnoepfe .haupt');
  assert.ok(await page.isVisible('#lobby'));
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('Leerer Stack: Nachkaufen-Dialog startet die nächste Hand; Gratis-Auffüllen erst nach dem Aufstehen', async () => {
  const zuf = P.seedZufall(2);
  let g = { ...E.neuerZustand(), coins: 5 };
  g = P.aktion({ ...g, coins: 1005 }, { p: 'start', art: 'cash', stufe: 0, buyin: 1000 }, zuf).zustand;
  g.poker.t.phase = 'leer'; g.poker.t.zug = -1; g.poker.t.board = [];
  g.poker.t.s.forEach((x) => { x.e = 0; x.g = 0; x.k = null; x.f = false; x.a = false; x.o = false; x.h = false; });
  g.poker.t.s[0].c = 0; g.coins = 300;
  assert.ok(P.pruefeTeil(g.poker));
  const { ctx, page, errors } = await open({ gast: g });
  await page.waitForSelector('#meldung:not([hidden])');
  assert.equal(await page.textContent('#mTitel'), 'Keine Chips mehr');
  await page.click('#mKnoepfe .haupt'); // Nachkaufen
  await page.waitForSelector('#buyin:not([hidden])');
  await page.click('#bOk'); await ruhig(page);
  const z = await st(page);
  assert.equal(z.coins, 0); assert.equal(z.poker.t.s[0].c + z.poker.t.s[0].g, 300);
  assert.ok(['preflop', 'flop', 'turn', 'river', 'ende'].includes(z.poker.t.phase));
  assert.equal(E.darfNachfuellen(z), false, 'kein Gratis-Auffüllen mit Chips am Tisch');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('Lobby: zu teure Tische gesperrt, Auffüllen-Knopf bei wenig Coins', async () => {
  const g = { ...E.neuerZustand(), coins: 4, tagesbonus: S_heute() };
  const { ctx, page } = await open({ gast: g });
  assert.ok(await page.isDisabled('[data-cash="0"]'));
  assert.ok(await page.isDisabled('[data-sng="0"]'));
  assert.ok(await page.isVisible('#bTanken'));
  await page.click('#bTanken'); await page.waitForFunction(() => window.__holdem.zustand.coins === 1000);
  assert.ok(await page.isEnabled('[data-cash="0"]'));
  await ctx.close();
});
function S_heute() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }
