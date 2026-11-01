// Letzte Bastion – Browserprüfung: Laden der Modelle (geteilt mit Kerkerlauf), Tippen = Hieb in die Richtung, Treffer und Herzen,
// Welle geschafft → Upgrade-Karten, Ende und Neustart, Speichern, Freischalten, Pause/Tastatur, Aufzeichnung = Server-Nachspielen, Handy-Layout.
// Eigener kleiner Static-Server (wie Cloudflare: /pfad -> pfad.html). node --test --test-concurrency=1 tests/bastion-browser.test.mjs
import { test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as L from '../public/spiele/letzte-bastion/logik.js';

const ROOT = fileURLToPath(new URL('../public/', import.meta.url));
function ladePlaywright() {
  const req = createRequire(import.meta.url);
  try { return req('playwright'); } catch (e) {}
  try { return req(join(execSync('npm root -g').toString().trim(), 'playwright')); } catch (e) {}
  return req('/opt/npm-tools/node_modules/playwright');
}
const { chromium } = ladePlaywright();
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.glb': 'model/gltf-binary', '.webp': 'image/webp', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.svg': 'image/svg+xml', '.png': 'image/png', '.mp3': 'audio/mpeg' };
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
  if (save) await ctx.addInitScript((s) => { if (!sessionStorage.getItem('gesetzt')) { localStorage.setItem('bastion.v1', s); sessionStorage.setItem('gesetzt', '1'); } }, JSON.stringify(save));
  const page = await ctx.newPage(); const errors = [], glb = []; page.__mobil = mobil;
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('response', (r) => { if (r.status() >= 400) errors.push(r.status() + ' ' + r.url()); if (r.url().includes('.glb')) glb.push(r.status() + ' ' + r.url().split('/').pop().split('?')[0]); });
  await page.goto(`${base}/spiele/letzte-bastion?test&seed=${seed}`);
  await page.waitForFunction(() => window.__bastion && window.__bastion.zustand === 'menu', null, { timeout: 60000 });
  return { ctx, page, errors, glb };
}
const T = (page, expr, arg) => page.evaluate(expr, arg);
const F = (page) => T(page, () => { const f = window.__bastion.lauf; return { herzen: f.herzen, maxHerzen: f.maxHerzen, kills: f.kills, punkte: f.punkte, welle: f.welle, phase: f.phase, tot: f.tot, serie: f.serie, up: f.up, gold: f.gold }; });
const warte = (page, fn, arg, ms = 20000) => page.waitForFunction(fn, arg, { timeout: ms });
async function starte(page) { await page.click('#mStart'); await warte(page, () => window.__bastion.zustand === 'lauf' && window.__bastion.lauf.phase === 'kampf', null, 30000); }
// Testgegner direkt setzen (Plan der Welle leeren); danach zählt der Lauf nicht für die Rangliste
const gegner = (page, liste) => T(page, (l) => window.__bastion.gegner(l), liste);
// Auf dem Handy echte Touch-Taps (die Maus-Emulation im Handy-Modus verschluckt Folgeklicks), am Rechner Mausklicks
async function tippe(page, x, z) {
  // erst wenn der letzte Hieb abgeklungen ist (Software-Grafik im Test: Spielzeit läuft langsamer als echte Zeit)
  await warte(page, () => window.__bastion.lauf.abklingen <= 0);
  const p = await T(page, ([x, z]) => window.__bastion.bildschirm(x, z), [x, z]); if (page.__mobil) await page.touchscreen.tap(p.x, p.y); else await page.mouse.click(p.x, p.y); }

test('Laden: Raum, vier Skelett-Arten, Animationen und Startheld ohne Fehler; Ton; kein Querscrollen', async () => {
  const { page, errors, glb } = await open();
  assert.deepEqual(glb.sort(), ['200 anim-allgemein.glb', '200 anim-basis.glb', '200 anim-combatmelee.glb', '200 anim-general.glb', '200 anim-jubel.glb', '200 anim-kampf.glb', '200 anim-magie.glb', '200 anim-skelett.glb', '200 anim-special.glb', '200 held-ritter.glb', '200 raum.glb', '200 skelett-diener.glb', '200 skelett-krieger.glb', '200 skelett-magier.glb', '200 skelett-schurke.glb']);
  const clips = await T(page, () => window.__bastion.clips);
  for (const c of ['Idle_A', 'Melee_2H_Idle', 'Melee_1H_Attack_Slice_Horizontal', 'Melee_2H_Attack_Spin', 'Hit_B', 'Death_A', 'Cheering', 'Skeletons_Walking', 'Skeletons_Awaken_Floor', 'Skeletons_Death', 'Melee_1H_Attack_Chop', 'Ranged_Magic_Shoot']) assert.ok(clips.includes(c), c);
  const h = await T(page, () => window.__bastion.held);
  assert.equal(h.name, 'ritter'); assert.ok(h.sichtbar); assert.equal(h.pose, 'Idle_A');
  assert.ok(await T(page, () => document.documentElement.scrollWidth <= innerWidth));
  assert.match(await page.textContent('#mName'), /Ritter/);
  await page.mouse.click(195, 400);
  await warte(page, () => window.__bastion.ton.geladen.length === 16 && window.__bastion.ton.schleifen, null, 30000);
  await page.click('#mTon'); assert.equal((await T(page, () => window.__bastion.stand)).ton, false);
  assert.deepEqual(errors, []);
});

test('Tippen schlägt in die Richtung: trifft vorn und rechts, daneben trifft nichts; Skelett stirbt sichtbar', async () => {
  const { page, errors } = await open();
  await starte(page);
  await gegner(page, [{ art: 'diener', x: 0, z: -2.2, ausholen: 99 }, { art: 'diener', x: 2.2, z: 0, ausholen: 99 }, { art: 'diener', x: 0, z: 2.2, ausholen: 99 }]);
  // ausholen = 99: die Testskelette stehen still und schlagen nicht zu
  await T(page, () => { for (const e of window.__bastion.lauf.gegner) e.ausholen = 0, e.rueck = 99; });
  await tippe(page, -2.4, -0.3);   // nach links: dort steht keiner
  await page.waitForTimeout(500); assert.equal((await F(page)).kills, 0);
  await tippe(page, 0, -2.2); await warte(page, () => window.__bastion.lauf.kills === 1, null, 5000);
  assert.equal((await T(page, () => window.__bastion.held)).pose, 'Melee_1H_Attack_Slice_Horizontal');
  await page.waitForTimeout(450);
  await tippe(page, 2.2, 0); await warte(page, () => window.__bastion.lauf.kills === 2, null, 5000);
  const sk = await T(page, () => window.__bastion.skelette);
  assert.ok(sk.some((s) => s.pose === 'Skeletons_Death'), JSON.stringify(sk));
  assert.ok((await F(page)).punkte >= 20);
  assert.equal(await page.textContent('#hPunkte'), String((await F(page)).punkte));
  assert.deepEqual(errors, []);
});

test('Welle geschafft → drei Upgrade-Karten; Karte antippen wirkt, Taste 1 auch; nächste Welle startet', async () => {
  const { page, errors } = await open({ size: { width: 1280, height: 800 }, mobil: false });
  await starte(page);
  await gegner(page, [{ art: 'diener', x: 0, z: -2, rueck: 99 }]);
  await tippe(page, 0, -2);
  await warte(page, () => !document.getElementById('wahl').hidden, null, 15000);
  assert.equal(await page.locator('#wKarten button').count(), 3);
  assert.match(await page.textContent('#wTitel'), /Welle 1 geschafft/);
  const vorher = await F(page); assert.equal(vorher.phase, 'wahl');
  await page.locator('#wKarten button').first().click();
  await warte(page, () => window.__bastion.lauf.phase !== 'wahl');
  const nachher = await F(page);
  assert.equal(Object.values(nachher.up).reduce((a, b) => a + b, 0), 1, JSON.stringify(nachher.up));
  assert.ok(await page.isHidden('#wahl'));
  await warte(page, () => window.__bastion.lauf.welle === 2 && window.__bastion.lauf.phase === 'kampf', null, 15000);
  // Welle 2 per Tastatur wählen
  await gegner(page, [{ art: 'diener', x: 0, z: -2, rueck: 99 }]);
  await tippe(page, 0, -2);
  await warte(page, () => !document.getElementById('wahl').hidden, null, 15000);
  await page.keyboard.press('Digit1');
  await warte(page, () => window.__bastion.lauf.phase !== 'wahl');
  assert.equal(Object.values((await F(page)).up).reduce((a, b) => a + b, 0), 2);
  assert.deepEqual(errors, []);
});

test('Treffer kostet ein Herz (Anzeige), drei Treffer beenden den Kampf; Ergebnis, Gold gespeichert, Nochmal', async () => {
  const { page, errors } = await open();
  await starte(page);
  await gegner(page, [{ art: 'krieger', x: 0, z: -1.2, hp: 99 }]);
  await warte(page, () => window.__bastion.lauf.herzen === 2, null, 15000);
  assert.equal(await page.locator('#hHerzen i.leer').count(), 1);
  await warte(page, () => window.__bastion.lauf.tot, null, 30000);
  await warte(page, () => window.__bastion.zustand === 'ende', null, 10000);
  assert.match(await page.textContent('#eTitel'), /gefallen/);
  assert.match(await page.textContent('#eGrund'), /Krieger/);
  assert.equal(await page.textContent('#eWelle'), '1');
  await page.click('#eNochmal'); await warte(page, () => window.__bastion.zustand === 'lauf');
  const f = await F(page); assert.equal(f.herzen, 3); assert.equal(f.kills, 0);
  assert.deepEqual(errors, []);
});

test('Held freischalten (Barbarin für 500 Gold), auswählen und damit kämpfen; zu teure bleiben gesperrt; nach Neuladen gespeichert', async () => {
  const { page, errors, glb } = await open({ save: { v: 1, gold: 530, rekord: 0, welle: 0, kills: 0, helden: ['ritter'], held: 'ritter', ton: false, tag: 0, tagBest: 0 } });
  assert.equal(await page.textContent('#mGold'), '530');
  await page.click('#mRechts'); await warte(page, () => window.__bastion.held && window.__bastion.held.name === 'barbar');
  assert.ok(glb.includes('200 held-barbar.glb'), 'Held wird erst beim Blättern geladen');
  assert.ok(await page.isVisible('#mKaufen')); assert.ok(!(await page.isVisible('#mStart')));
  await page.click('#mKaufen');
  const st = await T(page, () => window.__bastion.stand);
  assert.equal(st.gold, 30); assert.deepEqual(st.helden, ['ritter', 'barbar']); assert.equal(st.held, 'barbar');
  await page.click('#mRechts'); await warte(page, () => window.__bastion.held && window.__bastion.held.name === 'schurke');
  assert.ok(await page.isDisabled('#mKaufen'));
  await page.click('#mLinks'); await warte(page, () => window.__bastion.held.name === 'barbar');
  await starte(page);
  assert.equal((await T(page, () => window.__bastion.held)).name, 'barbar');
  await page.reload(); await warte(page, () => window.__bastion && window.__bastion.zustand === 'menu', null, 60000);
  assert.equal((await T(page, () => window.__bastion.stand)).held, 'barbar');
  assert.deepEqual(errors, []);
});

test('Pause per Knopf und Escape, Pfeiltasten schlagen in die Richtung', async () => {
  const { page, errors } = await open({ size: { width: 1280, height: 800 }, mobil: false });
  await starte(page);
  await gegner(page, [{ art: 'diener', x: 2, z: 0, rueck: 99 }, { art: 'diener', x: 0, z: -6, rueck: 99 }]);
  await page.keyboard.press('ArrowRight'); await warte(page, () => window.__bastion.lauf.kills === 1, null, 5000);
  await page.keyboard.press('Escape'); assert.equal(await T(page, () => window.__bastion.zustand), 'pause');
  const t1 = await T(page, () => window.__bastion.lauf.t); await page.waitForTimeout(400); assert.equal(await T(page, () => window.__bastion.lauf.t), t1, 'steht still');
  await page.keyboard.press('Escape'); await warte(page, () => window.__bastion.zustand === 'lauf');
  await page.click('#bPause'); assert.ok(await page.isVisible('#pause'));
  await page.click('#pMenu'); await warte(page, () => window.__bastion.zustand === 'menu');
  assert.deepEqual(errors, []);
});

test('Rangliste: echter Kampf im Browser wird aufgezeichnet und in Node exakt nachgespielt; Tagesrangliste öffnet und schließt', async () => {
  const { page, errors } = await open({ seed: 20261101 });
  await starte(page);
  // Bot tippt auf das nächste Skelett / die nächste Kugel in Reichweite und wählt die erste Karte; ab Welle 3 hört er auf → Ende
  await T(page, () => {
    const fang = document.getElementById('fang');
    window.__bot = setInterval(() => {
      const B = window.__bastion, f = B.lauf; if (f.tot) return;
      if (!document.getElementById('wahl').hidden) { document.querySelector('#wKarten button').click(); return; }
      if (f.welle >= 3 || f.phase !== 'kampf') return;
      const ziele = f.gegner.filter((e) => !e.tot && e.aufstehen <= 0).concat(f.kugeln.filter((k) => !k.weg)).map((e) => ({ e, d: Math.hypot(e.x, e.z) })).filter((z) => z.d < 3).sort((a, b) => a.d - b.d);
      if (!ziele.length) return;
      const p = B.bildschirm(ziele[0].e.x, ziele[0].e.z);
      fang.dispatchEvent(new PointerEvent('pointerdown', { clientX: p.x, clientY: p.y, bubbles: true }));
    }, 40);
  });
  await warte(page, () => window.__bastion.zustand === 'ende', null, 280000);
  await T(page, () => clearInterval(window.__bot));
  const m = await T(page, () => { const f = window.__bastion.lauf, a = window.__bastion.aufnahme; return { v: 1, seed: a.seed, inputs: a.inputs, takte: a.takte, punkte: f.punkte, gold: f.gold, kills: f.kills, welle: f.welle }; });
  assert.ok(m.welle >= 3 && m.kills > 10, JSON.stringify({ ...m, inputs: m.inputs.length }));
  const r = L.pruefeLauf(m);
  assert.equal(r.ok, true, 'Server-Nachspielen: ' + JSON.stringify({ ...r, takte: m.takte, punkte: m.punkte }));
  assert.match(await page.textContent('#eStatus'), /Tagesbestwert|Gerät/);
  await page.click('#eRang'); assert.ok(await page.isVisible('#rang'));
  await warte(page, () => !/Lädt/.test(document.getElementById('rListe').textContent));
  assert.match(await page.textContent('#rListe'), /nicht erreichbar/);   // ohne PlaySaal-Konto (im Test abgeschaltet)
  await page.click('#rTabs button[data-z="monat"]'); assert.equal(await page.getAttribute('#rTabs button[data-z="monat"]', 'aria-pressed'), 'true');
  await page.click('#rZu'); assert.ok(await page.isVisible('#ende')); assert.ok(!(await page.isVisible('#rang')));
  const calls = await T(page, () => window.__bastion.zeichnungen); assert.ok(calls < 120, 'wenige Zeichenaufrufe: ' + calls);
  assert.deepEqual(errors, []);
});

test('Handy-Layout 390×844 und 360×640: Menü-Knöpfe, HUD und Upgrade-Karten passen, kein Querscrollen', async () => {
  for (const size of [{ width: 390, height: 844 }, { width: 360, height: 640 }]) {
    const { page, errors } = await open({ size });
    const passt = async (sel) => { const b = await page.locator(sel).first().boundingBox(); assert.ok(b && b.y >= 0 && b.y + b.height <= size.height && b.x >= 0 && b.x + b.width <= size.width, sel + ' ' + JSON.stringify(b)); };
    for (const id of ['#mStart', '#mLinks', '#mRechts', '#mRang']) await passt(id);
    await starte(page);
    for (const id of ['#hud', '#bPause']) await passt(id);
    await gegner(page, [{ art: 'diener', x: 0, z: -2, rueck: 99 }]);
    await tippe(page, 0, -2);
    await warte(page, () => !document.getElementById('wahl').hidden, null, 15000);
    for (let i = 0; i < 3; i++) { const b = await page.locator('#wKarten button').nth(i).boundingBox(); assert.ok(b.y + b.height <= size.height && b.x >= 0 && b.x + b.width <= size.width, 'Karte ' + i + ' ' + JSON.stringify(b)); }
    assert.ok(await T(page, () => document.documentElement.scrollWidth <= innerWidth));
    assert.deepEqual(errors, []);
  }
});
