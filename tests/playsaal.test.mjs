// Browser-Tests für Rebranding und Spielstand-Umzug.
// Start:  node --test tests/*.test.mjs
// Braucht: Playwright (global: npm i -g playwright && npx playwright install chromium) und npx wrangler.
// Startet selbst `wrangler dev` (lokaler Cloudflare-Worker mit denselben Static-Assets-Regeln wie produktiv).
// Zwei Origins für den Umzug: http://127.0.0.1:PORT (alt) und http://localhost:PORT (neu).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT || 8799);
const ALT = `http://127.0.0.1:${PORT}`;
const NEU = `http://localhost:${PORT}`;
const BOESE_PORT = PORT + 1;
const BOESE = `http://127.0.0.1:${BOESE_PORT}`;
const SPIELE = readdirSync(join(ROOT, 'public/spiele')).filter((f) => f.endsWith('.html')).map((f) => f.replace('.html', ''));

function ladePlaywright() {
  const req = createRequire(import.meta.url);
  try { return req('playwright'); } catch (e) {}
  const g = execSync('npm root -g').toString().trim();
  try { return req(join(g, 'playwright')); } catch (e) {}
  return req('/opt/npm-tools/node_modules/playwright');
}
const { chromium } = ladePlaywright();

let wrangler, browser, boese;
const warte = (ms) => new Promise((r) => setTimeout(r, ms));

before(async () => {
  wrangler = spawn('npx', ['-y', 'wrangler@4', 'dev', '--port', String(PORT), '--ip', '0.0.0.0'], { cwd: ROOT, stdio: 'ignore', detached: true });
  for (let i = 0; i < 90; i++) { try { if ((await fetch(ALT + '/')).ok) break; } catch (e) {} await warte(1000); }
  // Fremde Origin, die versucht, gefälschte Spielstände einzuschleusen
  boese = createServer((req, res) => {
    res.setHeader('content-type', 'text/html');
    res.end(`<script>
      const w = window.open('${NEU}/umzug', 'opfer');
      const p = { typ: 'playsaal-umzug', version: 1, quelle: '${ALT}', daten: { 'linkespur.v1': '{"coins":999999,"best":1}' } };
      setInterval(() => { for (const n of ['', '0'.repeat(32)]) w.postMessage({ typ: 'playsaal-umzug:paket', nonce: n, paket: p }, '*'); }, 100);
    </script>`);
  }).listen(BOESE_PORT, '127.0.0.1');
  browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
});
after(async () => {
  await browser?.close();
  boese?.close();
  try { process.kill(-wrangler.pid); } catch (e) {}
});

async function kontext(opts = {}) {
  const ctx = await browser.newContext(opts);
  // Test-Origins statt produktiver Adressen
  await ctx.route('**/assets/umzug-config.js', (r) => r.fulfill({ contentType: 'application/javascript',
    body: `window.PLAYSAAL_UMZUG = { ziel: '${NEU}', quellen: ['${ALT}'], aktiv: true };` }));
  return ctx;
}
const seiten = ['/', '/impressum', '/datenschutz', '/umzug', ...SPIELE.map((s) => '/spiele/' + s)];

// ---------------- Rebranding ----------------
test('alle Routen liefern 200, .html leitet auf saubere URL, 404 greift', async () => {
  for (const p of seiten) assert.equal((await fetch(ALT + p)).status, 200, p);
  for (const s of SPIELE) {
    const r = await fetch(`${ALT}/spiele/${s}.html`, { redirect: 'manual' });
    assert.ok([200, 307, 308].includes(r.status), s + '.html');
  }
  assert.equal((await fetch(ALT + '/spiele/linke-spur')).status, 200);
  const nf = await fetch(ALT + '/gibt-es-nicht');
  assert.equal(nf.status, 404);
  assert.match(await nf.text(), /PlaySaal/);
});

test('keine alte Marke im sichtbaren Text, Titel/Meta auf PlaySaal, keine Seitenfehler', async () => {
  const ctx = await kontext();
  for (const p of seiten) {
    const page = await ctx.newPage();
    const fehler = [];
    page.on('pageerror', (e) => fehler.push(String(e)));
    await page.goto(ALT + p, { waitUntil: 'load' });
    await page.waitForTimeout(800);
    const text = await page.evaluate(() => document.body.innerText + ' ' + document.title + ' ' +
      [...document.querySelectorAll('[aria-label],[alt],[title],meta[content]')].map((e) => e.getAttribute('aria-label') || e.getAttribute('alt') || e.getAttribute('title') || e.getAttribute('content')).join(' '));
    // Erlaubt: technische alte Adresse und die Umzugs-Hinweise, die den alten Namen bewusst nennen
    const ohneTechnik = text.replace(/playaz\.cf-922\.workers\.dev/g, '').replace(/127\.0\.0\.1:\d+/g, '')
      .replace(/Aus PlayAZ wird PlaySaal|PlayAZ heißt jetzt PlaySaal|Früher bei PlayAZ gespielt|von PlayAZ zu PlaySaal/g, '');
    assert.doesNotMatch(ohneTechnik, /playaz\.fun|\bplayaz\b/i, p + ' enthält alte Marke');
    const siteName = await page.getAttribute('meta[property="og:site_name"]', 'content').catch(() => null);
    if (siteName !== null) assert.equal(siteName, 'PlaySaal', p);
    assert.deepEqual(fehler, [], p + ' wirft Fehler');
    await page.close();
  }
  await ctx.close();
});

test('canonical und og:url zeigen auf dieselbe Adresse und den echten Pfad', async () => {
  for (const s of SPIELE) {
    const h = await (await fetch(`${ALT}/spiele/${s}`)).text();
    const canon = h.match(/<link rel="canonical" href="([^"]+)"/)[1];
    const og = h.match(/<meta property="og:url" content="([^"]+)"/)[1];
    assert.equal(canon, og, s);
    assert.ok(canon.endsWith('/spiele/' + s), s + ': ' + canon);
  }
  execSync('node tools/domain.mjs', { cwd: ROOT }); // wirft bei Inkonsistenz
});

test('Branding-Assets, Manifest und alle lokal referenzierten Dateien sind erreichbar', async () => {
  const m = await (await fetch(ALT + '/site.webmanifest')).json();
  assert.equal(m.short_name, 'PlaySaal');
  assert.equal(m.start_url, '/'); assert.equal(m.scope, '/');
  for (const i of m.icons) assert.equal((await fetch(ALT + i.src)).status, 200, i.src);
  const ctx = await kontext();
  const kaputt = [];
  for (const p of seiten) {
    const page = await ctx.newPage();
    page.on('response', (r) => { if (r.url().startsWith(ALT) && r.status() >= 400) kaputt.push(p + ' -> ' + r.url() + ' ' + r.status()); });
    await page.goto(ALT + p, { waitUntil: 'load' });
    const refs = await page.evaluate(() => [...document.querySelectorAll('link[href],img[src],script[src],a[href]')]
      .map((e) => e.href || e.src).filter((u) => u.startsWith(location.origin)));
    for (const u of new Set(refs)) { const r = await fetch(u); if (r.status >= 400) kaputt.push(p + ' verlinkt ' + u + ' ' + r.status); }
    // og:image-Pfad muss auch lokal existieren
    const og = await page.getAttribute('meta[property="og:image"]', 'content').catch(() => null);
    if (og) { const r = await fetch(ALT + new URL(og).pathname); if (r.status !== 200) kaputt.push(p + ' og:image ' + og); }
    await page.close();
  }
  await ctx.close();
  assert.deepEqual(kaputt, []);
});


// ---------------- Kopfzeile, Menü, Startseite ----------------
test('Kopfzeile + Menü auf allen Portalseiten, Menü öffnet/schließt, Filter "Neu"', async () => {
  const ctx = await kontext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  for (const p of ['/', '/impressum', '/datenschutz', '/umzug', '/gibt-es-nicht']) {
    const page = await ctx.newPage(); await page.goto(ALT + p);
    const h = await page.evaluate(() => document.querySelector('.site-head').getBoundingClientRect().height);
    assert.ok(h >= 56 && h <= 60, p + ' Kopfhöhe ' + h);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 390, p + ' seitlich scrollbar');
    await page.click('.menu-btn');
    assert.ok(await page.evaluate(() => document.getElementById('menu').open), p + ' Menü offen');
    assert.equal(await page.getAttribute('.menu-btn', 'aria-expanded'), 'true');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.getElementById('menu').open && document.querySelector('.menu-btn').getAttribute('aria-expanded') === 'false');
    assert.equal(await page.evaluate(() => document.activeElement.className), 'menu-btn', p + ' Fokus zurück auf Menüknopf');
    // Ranglisten/Freunde/Profil gibt es noch nicht -> dürfen nicht auftauchen
    assert.doesNotMatch(await page.textContent('#menu'), /Rangliste|Freunde|Profil/);
    await page.close();
  }
  const page = await ctx.newPage(); await page.goto(ALT + '/');
  assert.equal(await page.locator('.games .game').count(), SPIELE.length);
  await page.click('.menu-btn'); await page.click('#menu a[href="/#neu"]');
  await page.waitForFunction(() => document.querySelectorAll('.games .game:not([hidden])').length === 3);
  assert.equal(await page.textContent('#spiele-titel'), 'Neue Spiele');
  await page.click('[data-filter="alle"]');
  assert.equal(await page.locator('.games .game:not([hidden])').count(), SPIELE.length);
  // Jede Karte führt auf eine echte Spielroute und hat "Spielen"
  const links = await page.$$eval('.games a', (as) => as.map((a) => [a.getAttribute('href'), a.querySelector('.play').textContent.trim()]));
  for (const [href, txt] of links) { assert.equal(txt, 'Spielen'); assert.equal((await fetch(ALT + href)).status, 200, href); }
  // Im Spiel kein Portal-Header
  const spiel = await ctx.newPage(); await spiel.goto(ALT + '/spiele/linke-spur');
  assert.equal(await spiel.locator('.site-head').count(), 0);
  await ctx.close();
});


// iPhone-Breiten mit eingeblendeter Safari-Leiste (sichtbare Höhe statt Bildschirmhöhe)
for (const [w, h] of [[375, 548], [390, 664], [430, 746]]) {
  test(`Startseite mobil ${w}px (Safari-Leiste sichtbar, Höhe ${h}px): kein Überlauf, keine Überlappung, Knöpfe einheitlich`, async () => {
    const ctx = await kontext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
    const page = await ctx.newPage();
    await page.goto(NEU + '/impressum');
    await page.evaluate(() => { localStorage.setItem('linkespur.v1', JSON.stringify({ coins: 52000, best: 81234, owned: ['kombi', 'strale'] })); localStorage.setItem('anbiss.v1', JSON.stringify({ v: 1, stats: { caught: 37, best: { kg: 3.2 } }, book: { a: 1, b: 1 } })); });
    await page.goto(NEU + '/'); await page.waitForTimeout(300);
    const r = await page.evaluate(() => {
      const box = (e) => e.getBoundingClientRect();
      const karten = [...document.querySelectorAll('.games .karte')].map((k) => {
        const kb = box(k), teile = ['h3', '.chips', '.text', '.fuss'].map((s) => box(k.querySelector(s)));
        const rec = box(k.querySelector('.rec')), play = box(k.querySelector('.play')), shot = box(k.querySelector('.shot'));
        const h3 = k.querySelector('h3');
        return {
          h: Math.round(kb.height), playRechts: Math.round(kb.right - play.right), playUnten: Math.round(kb.bottom - play.bottom),
          playH: Math.round(play.height), titelPx: parseFloat(getComputedStyle(h3).fontSize),
          ueberlapp: teile.some((t, i) => i && t.top < teile[i - 1].bottom - 0.5) || rec.right > play.left + 0.5 || shot.right > teile[0].left,
          drin: [...teile, play, shot].every((t) => t.left >= kb.left - 0.5 && t.right <= kb.right + 0.5 && t.top >= kb.top - 0.5 && t.bottom <= kb.bottom + 0.5),
          textZeilen: Math.round(box(k.querySelector('.text')).height / parseFloat(getComputedStyle(k.querySelector('.text')).lineHeight))
        };
      });
      return { breite: document.documentElement.scrollWidth, h1: parseFloat(getComputedStyle(document.querySelector('.hero h1')).fontSize),
        ersteKarteOben: Math.round(box(document.querySelector('.games .karte')).top), karten };
    });
    assert.equal(r.breite, w, 'horizontaler Überlauf');
    assert.ok(r.h1 >= 40 && r.h1 <= 44, 'H1 ' + r.h1);
    assert.ok(r.ersteKarteOben < h - 100, `erstes Spiel erst bei ${r.ersteKarteOben}px sichtbar`);
    const h0 = r.karten[0];
    for (const [i, k] of r.karten.entries()) {
      assert.ok(!k.ueberlapp, `Karte ${i} überlappt`);
      assert.ok(k.drin, `Karte ${i} ragt über den Rand`);
      assert.equal(k.h, h0.h, `Karte ${i} andere Höhe`);
      assert.equal(k.playRechts, h0.playRechts, `Karte ${i} Knopf anders ausgerichtet`);
      assert.equal(k.playUnten, h0.playUnten, `Karte ${i} Knopf anders ausgerichtet`);
      assert.equal(k.titelPx, h0.titelPx, `Karte ${i} andere Titelgröße`);
      assert.ok(k.textZeilen <= 2, `Karte ${i} Text ${k.textZeilen} Zeilen`);
      assert.ok(k.h >= 44 && k.playH >= 36, `Karte ${i} Tippfläche`);
    }
    // Menü: alle Einträge im sichtbaren Bereich erreichbar
    await page.click('.menu-btn');
    const sichtbar = await page.$$eval('#menu a:not([hidden])', (as, hh) => as.every((a) => { const b = a.getBoundingClientRect(); return b.top >= 0 && b.bottom <= hh && b.height >= 40; }), h);
    assert.ok(sichtbar, 'Menüeintrag außerhalb des sichtbaren Bereichs oder zu klein');
    await ctx.close();
  });
}


test('Farbrollen: Gelb = Aktion, Orange = Marke, Rot-Orange nicht in der Oberfläche', async () => {
  const ctx = await kontext(); const page = await ctx.newPage(); await page.goto(ALT + '/');
  const f = await page.evaluate(() => {
    const bg = (s) => getComputedStyle(document.querySelector(s)).backgroundColor;
    return { play: [...document.querySelectorAll('.play')].map((e) => getComputedStyle(e).backgroundColor), playText: getComputedStyle(document.querySelector('.play')).color,
      cta: bg('.hero .btn'), filter: bg('[data-filter][aria-pressed="true"]'), badge: bg('.badge') };
  });
  const GELB = 'rgb(255, 210, 28)', ORANGE = 'rgb(255, 146, 0)', BASIS = 'rgb(17, 18, 26)';
  assert.ok(f.play.every((c) => c === GELB)); assert.equal(f.playText, BASIS);
  assert.equal(f.cta, GELB); assert.equal(f.filter, GELB); assert.equal(f.badge, ORANGE);
  // Rot-Orange nur im Logo: kein Vorkommen in Portal-CSS/HTML außerhalb der Logo-Dateien
  for (const datei of ['index.html', 'umzug.html', 'impressum.html', 'datenschutz.html', '404.html', 'assets/site.css']) {
    const txt = (await (await fetch(ALT + '/' + datei.replace('.html', ''))).text()).replace(/--logo-rot:#FF4A13;|Rot-Orange #FF4A13/g, '');
    assert.doesNotMatch(txt, /#FF4A13|--koralle/i, datei);
  }
  await ctx.close();
});

// ---------------- Spielstand-Umzug ----------------
const ALTDATEN = {
  'anbiss.v1': JSON.stringify({ v: 1, money: 420, xp: 900, lvl: 4, stats: { caught: 37, best: { kg: 3.2 } }, book: { hecht: 1, barsch: 1 } }),
  'stellwerk.v1': JSON.stringify({ best: { s1: { n: 14 } }, stars: { s1: 3, s2: 2 }, tut: 1, sound: 1 }),
  'eiszeit.v1': JSON.stringify({ v: 1, coins: 120, sold: 340, helpers: 3, paid: 50 }),
  'eiszeit.muted': 'true',
  'linkespur.v1': JSON.stringify({ coins: 52000, best: 81234, owned: ['kombi', 'strale'], car: 'strale', runs: 44 }),
  'schwindelfrei.best': '57',
  'hochstapler.best': '120', 'hochstapler.bestFloors': '22',
  'richtfest.save.v1': JSON.stringify({ v: 1, team: [{ sp: 'a', moves: [] }], caught: ['a', 'b', 'c'] }),
  // darf NICHT übertragen werden
  'sb-access-token': 'geheim', 'fremd.token': '"x"', 'playsaal.umzug.backup': '{}'
};
const NEUDATEN = { 'hochstapler.best': '300', 'linkespur.v1': JSON.stringify({ coins: 10, best: 5, owned: ['kombi'], runs: 1 }) };

async function setzeSpeicher(ctx, origin, daten) {
  const p = await ctx.newPage(); await p.goto(origin + '/impressum');
  await p.evaluate((d) => { localStorage.clear(); for (const k in d) localStorage.setItem(k, d[k]); }, daten);
  await p.close();
}
async function speicher(ctx, origin) {
  const p = await ctx.newPage(); await p.goto(origin + '/impressum');
  const d = await p.evaluate(() => Object.fromEntries(Object.keys(localStorage).map((k) => [k, localStorage.getItem(k)])));
  await p.close(); return d;
}
async function umzugPerFenster(ctx) {
  const page = await ctx.newPage();
  await page.goto(NEU + '/umzug');
  const [popup] = await Promise.all([page.waitForEvent('popup'), page.click('#quellen button')]);
  await popup.waitForSelector('#uebertragen:visible');
  await popup.click('#uebertragen');
  await page.waitForSelector('#vergleich:not([hidden])');
  return { page, popup };
}

for (const [name, opts] of [['Desktop', {}], ['Handy (390px, Touch)', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 }]]) {
  test(`Umzug per Fenster alt -> neu, Merge, Rückgängig (${name})`, async () => {
    const ctx = await kontext(opts);
    await setzeSpeicher(ctx, ALT, ALTDATEN);
    await setzeSpeicher(ctx, NEU, NEUDATEN);
    const { page, popup } = await umzugPerFenster(ctx);
    // Vorschläge: Hochstapler hier besser (300 > 120) -> behalten, Linke Spur alt besser -> übernehmen
    assert.equal(await page.inputValue('select[name=hochstapler]'), 'hier');
    assert.equal(await page.inputValue('select[name=linkespur]'), 'alt');
    assert.equal(await page.inputValue('select[name=anbiss]'), 'alt');
    await page.click('#uebernehmen');
    await page.waitForSelector('.status.ok');
    await popup.waitForSelector('.status.ok'); // alte Seite bekommt Bestätigung
    const neu = await speicher(ctx, NEU);
    for (const k of ['anbiss.v1', 'stellwerk.v1', 'eiszeit.v1', 'eiszeit.muted', 'linkespur.v1', 'schwindelfrei.best', 'richtfest.save.v1'])
      assert.equal(neu[k], ALTDATEN[k], k);
    assert.equal(neu['hochstapler.best'], '300');
    assert.equal(neu['sb-access-token'], undefined);
    assert.equal(neu['fremd.token'], undefined);
    assert.ok(neu['playsaal.umzug.empfangen']);
    // Alte Adresse behält ihre Daten
    const alt = await speicher(ctx, ALT);
    assert.equal(alt['linkespur.v1'], ALTDATEN['linkespur.v1']);
    assert.ok(alt['playsaal.umzug.gesendet']);
    // Startseite zeigt die übernommenen Rekorde
    const start = await ctx.newPage(); await start.goto(NEU + '/');
    assert.match(await start.textContent('[data-rec="linkespur"]'), /81\.234/);
    assert.match(await start.textContent('[data-rec="anbiss"]'), /2 Arten/);
    assert.ok(await start.isHidden('#umzugHinweis'), 'Hinweis nach Umzug weg');
    // Spiel lädt den Stand tatsächlich (Linke Spur liest linkespur.v1)
    const spiel = await ctx.newPage(); await spiel.goto(NEU + '/spiele/linke-spur'); await spiel.waitForTimeout(1500);
    assert.equal(await spiel.evaluate(() => JSON.parse(localStorage.getItem('linkespur.v1')).coins), 52000);
    // Rückgängig
    await page.reload(); await page.click('#rueckgaengig');
    const zurueck = await speicher(ctx, NEU);
    assert.equal(zurueck['linkespur.v1'], NEUDATEN['linkespur.v1']);
    assert.equal(zurueck['anbiss.v1'], undefined);
    assert.equal(zurueck['playsaal.umzug.backup'], undefined);
    await ctx.close();
  });
}

test('Umzug ohne Spielstände auf alter Adresse meldet "keine Spielstände"', async () => {
  const ctx = await kontext();
  await setzeSpeicher(ctx, ALT, {});
  const page = await ctx.newPage(); await page.goto(NEU + '/umzug');
  const [popup] = await Promise.all([page.waitForEvent('popup'), page.click('#quellen button')]);
  await popup.click('#uebertragen');
  await page.waitForSelector('.status.hinweis');
  assert.match(await page.textContent('#status'), /keine Spielstände/);
  await ctx.close();
});

test('gefälschte Nachrichten (fremde Origin, ohne Fenster, falsche Kennung) werden ignoriert', async () => {
  const ctx = await kontext();
  await setzeSpeicher(ctx, NEU, NEUDATEN);
  // 1) fremde Origin öffnet die Umzugsseite und feuert Pakete
  const evil = await ctx.newPage();
  const [opfer] = await Promise.all([evil.waitForEvent('popup'), evil.goto(BOESE)]);
  await opfer.waitForLoadState('load'); await opfer.waitForTimeout(1500);
  assert.ok(await opfer.isHidden('#vergleich'));
  // 2) Seite selbst / richtiges Fenster mit falscher Kennung
  const page = await ctx.newPage(); await page.goto(NEU + '/umzug');
  const [popup] = await Promise.all([page.waitForEvent('popup'), page.click('#quellen button')]);
  await popup.waitForLoadState('load');
  await page.evaluate((alt) => window.postMessage({ typ: 'playsaal-umzug:paket', nonce: 'x', paket: { typ: 'playsaal-umzug', version: 1, quelle: alt, daten: { 'linkespur.v1': '{"coins":1}' } } }, '*'), ALT);
  await popup.evaluate((neu) => window.opener.postMessage({ typ: 'playsaal-umzug:paket', nonce: '0'.repeat(32), paket: { typ: 'playsaal-umzug', version: 1, daten: { 'linkespur.v1': '{"coins":1}' } } }, neu), NEU);
  await page.waitForTimeout(800);
  assert.ok(await page.isHidden('#vergleich'));
  const d = await speicher(ctx, NEU);
  assert.equal(d['linkespur.v1'], NEUDATEN['linkespur.v1']);
  // 3) Prüffunktion filtert Schlüssel und kaputte Werte
  const r = await page.evaluate(() => window.PlaySaalUmzug.pruefen({ typ: 'playsaal-umzug', version: 1, daten: { 'linkespur.v1': '{"coins":1}', 'linkespur.x': '{kaputt', 'sb-access-token': 'a', '__proto__.x': '1', 'playsaal.umzug.backup': '{}' } }));
  assert.deepEqual(Object.keys(r.daten), ['linkespur.v1']);
  assert.equal(r.verworfen, 4);
  assert.equal((await page.evaluate(() => window.PlaySaalUmzug.pruefen({ typ: 'playsaal-umzug', version: 2, daten: {} }))).ok, false);
  await ctx.close();
});

test('Umzug per Datei: Export auf alter, Import auf neuer Adresse', async () => {
  const ctx = await kontext({ acceptDownloads: true });
  await setzeSpeicher(ctx, ALT, ALTDATEN);
  await setzeSpeicher(ctx, NEU, {});
  const a = await ctx.newPage(); await a.goto(ALT + '/umzug');
  assert.ok(await a.isVisible('#zumZielBox'));
  const [dl] = await Promise.all([a.waitForEvent('download'), a.click('#exportDatei')]);
  const pfad = await dl.path();
  const n = await ctx.newPage(); await n.goto(NEU + '/umzug');
  await n.setInputFiles('#importDatei', pfad);
  await n.waitForSelector('#vergleich:not([hidden])');
  await n.click('#uebernehmen'); await n.waitForSelector('.status.ok');
  const d = await speicher(ctx, NEU);
  assert.equal(d['richtfest.save.v1'], ALTDATEN['richtfest.save.v1']);
  assert.equal(d['sb-access-token'], undefined);
  await ctx.close();
});

test('Speicher gesperrt (Privatmodus/voll): nichts wird halb geschrieben', async () => {
  const ctx = await kontext();
  await setzeSpeicher(ctx, ALT, ALTDATEN);
  await setzeSpeicher(ctx, NEU, NEUDATEN);
  const { page } = await umzugPerFenster(ctx);
  await page.evaluate(() => { const orig = window.__origSet = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { if (k === 'richtfest.save.v1') throw new DOMException('voll', 'QuotaExceededError'); return orig.call(this, k, v); }; });
  await page.click('#uebernehmen');
  await page.waitForSelector('.status.fehler');
  await page.evaluate(() => { Storage.prototype.setItem = window.__origSet; });
  const d = await speicher(ctx, NEU);
  assert.equal(d['linkespur.v1'], NEUDATEN['linkespur.v1']);
  assert.equal(d['anbiss.v1'], undefined);
  await ctx.close();
});

test('Startseite: Umzug-Hinweis auf alter Adresse nur wenn aktiv', async () => {
  const ctx = await kontext();
  const p = await ctx.newPage(); await p.goto(ALT + '/');
  assert.ok(await p.isVisible('#umzugHinweis'));
  assert.equal(await p.getAttribute('#umzugText a', 'href'), NEU + '/umzug');
  await ctx.close();
  // Produktive Konfiguration (aktiv: false): kein Hinweis
  const ctx2 = await browser.newContext(); const p2 = await ctx2.newPage(); await p2.goto(ALT + '/');
  assert.ok(await p2.isHidden('#umzugHinweis'));
  await ctx2.close();
});
