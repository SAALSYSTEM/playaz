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
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT || 8799);
const ALT = `http://127.0.0.1:${PORT}`;
const NEU = `http://localhost:${PORT}`;
const BOESE_PORT = PORT + 1;
const BOESE = `http://127.0.0.1:${BOESE_PORT}`;
const SPIELDATEIEN = readdirSync(join(ROOT, 'public/spiele')).filter((f) => f.endsWith('.html'));
const SPIELE = SPIELDATEIEN.map((f) => f.replace('.html', ''));
const OEFFENTLICHE_SPIELE = SPIELDATEIEN.filter((f) => !/<meta name="robots" content="[^"]*noindex/i.test(readFileSync(join(ROOT, 'public/spiele', f), 'utf8'))).map((f) => f.replace('.html', ''));

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
test('Kopfzeile + Menü auf den Rechtsseiten, Menü öffnet/schließt', async () => {
  const ctx = await kontext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  for (const p of ['/impressum', '/datenschutz', '/umzug', '/gibt-es-nicht']) {
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
  // Im Spiel kein Portal-Header
  const spiel = await ctx.newPage(); await spiel.goto(ALT + '/spiele/linke-spur');
  assert.equal(await spiel.locator('.site-head, .portal-head').count(), 0);
  await ctx.close();
});

test('Startseite: feste Kopfzeile mit Icons, Neu/Top nacheinander, jede Kachel führt auf ein echtes Spiel, alle Spiele erreichbar', async () => {
  const ctx = await kontext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage(); await page.goto(ALT + '/');
  // Kopf bleibt beim Scrollen oben
  await page.evaluate(() => window.scrollTo(0, 900));
  const kopf = await page.evaluate(() => { const b = document.querySelector('.portal-head-in').getBoundingClientRect(); return { top: b.top, h: b.height }; });
  assert.ok(kopf.top >= 0 && kopf.top <= 12, 'Kopf klebt nicht oben: ' + kopf.top); assert.ok(kopf.h >= 56 && kopf.h <= 120, 'Kopfhöhe ' + kopf.h);
  assert.deepEqual(await page.$$eval('.p-tabs > *, .p-tools > *', (e) => e.map((x) => x.textContent.trim())), ['Hot', 'Neu', 'Freunde', 'Suche', 'Profil']);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 390);
  // Reihenfolge: Hot vor Neu; höchstens 20 Kacheln je Block
  const pos = await page.evaluate(() => [document.getElementById('hot').getBoundingClientRect().top, document.getElementById('neu').getBoundingClientRect().top]);
  assert.ok(pos[0] < pos[1]);
  for (const id of ['hot', 'neu']) { const n = await page.locator(`#${id} .kachel`).count(); assert.ok(n >= 1 && n <= 20, id + ' ' + n); }
  // Jedes Spiel kommt mindestens einmal vor, jede Kachel führt auf eine echte Route
  const links = await page.$$eval('.kachel a', (as) => as.map((a) => a.getAttribute('href')));
  for (const s of OEFFENTLICHE_SPIELE) assert.ok(links.includes('/spiele/' + s), s + ' fehlt auf der Startseite');
  for (const s of SPIELE.filter((x) => !OEFFENTLICHE_SPIELE.includes(x))) assert.ok(!links.includes('/spiele/' + s), s + ' ist noindex und darf nicht auf der Startseite stehen');
  for (const h of new Set(links)) assert.equal((await fetch(ALT + h)).status, 200, h);
  // Anker aus anderen Seiten
  for (const id of ['spiele', 'hot', 'neu']) assert.equal(await page.locator('#' + id).count(), 1, '#' + id);
  // Zusammen/Profil: nur "bald verfügbar", keine Navigation
  await page.click('[data-bald="Freunde"]', { force: true });
  assert.match(await page.textContent('#toast'), /Freunde.*bald verfügbar/);
  assert.ok(page.url().endsWith('/'));
  await page.click('[data-bald="Profil"]', { force: true });
  assert.match(await page.textContent('#toast'), /Profil.*bald verfügbar/);
  assert.match(await page.textContent('.seo'), /bald verfügbar/);
  // Aktiver Bereich: am Anfang Hot, nach dem Springen zu Neu Neu
  assert.equal(await page.getAttribute('.p-tabs a[href="#hot"]', 'aria-current'), 'true');
  await page.evaluate(() => document.getElementById('neu').scrollIntoView());
  await page.waitForFunction(() => document.querySelector('.p-tabs a[href="#neu"]').getAttribute('aria-current') === 'true');
  assert.equal(await page.getAttribute('.p-tabs a[href="#hot"]', 'aria-current'), null);
  await page.waitForTimeout(400);
  // Farben passend zum Bereich: Hot orange, Neu gelb
  const farbe = await page.evaluate(() => { const bg = (s) => getComputedStyle(document.querySelector(s)).backgroundColor; return [bg('.p-tabs a[href="#neu"]'), getComputedStyle(document.querySelector('.p-tabs a[href="#hot"] svg')).color]; });
  assert.equal(farbe[0], 'rgb(255, 210, 28)'); assert.equal(farbe[1], 'rgb(255, 146, 0)');
  assert.equal(await page.locator('.seo a').count(), 0, 'Platzhalter-Kategorien dürfen noch keine Links sein');
  await ctx.close();
});

test('Startseite: Suche mit Live-Treffern (Name, Art, Kategorie), Leermeldung, Esc schließt', async () => {
  const ctx = await kontext(); const page = await ctx.newPage(); await page.goto(ALT + '/');
  await page.click('#sucheBtn');
  assert.ok(await page.isVisible('#sucheText'));
  assert.equal(await page.evaluate(() => document.activeElement.id), 'sucheText');
  await page.fill('#sucheText', 'stamm');
  assert.deepEqual(await page.$$eval('#sucheListe b', (e) => e.map((x) => x.textContent)), ['Stammvölker']);
  await page.fill('#sucheText', 'retro');
  assert.deepEqual(await page.$$eval('#sucheListe b', (e) => e.map((x) => x.textContent)), ['Richtfest', 'Kristallrausch']);
  await page.fill('#sucheText', 'sondengaenger');   // ohne Umlaut
  assert.equal(await page.locator('#sucheListe li').count(), 1);
  await page.fill('#sucheText', '3d');
  assert.ok((await page.locator('#sucheListe li').count()) >= 5);
  await page.fill('#sucheText', 'xyzxyz');
  assert.equal(await page.locator('#sucheListe li').count(), 0);
  assert.ok(await page.isVisible('#sucheLeer')); assert.match(await page.textContent('#sucheLeer'), /Kein Spiel/);
  // Art-Knopf füllt die Suche
  await page.click('#sucheTags button:text-is("Puzzle")');
  assert.deepEqual(await page.$$eval('#sucheListe b', (e) => e.map((x) => x.textContent)), ['Stellwerk', 'Dino-Leiterhelden', 'Kristallrausch']);
  await page.click('#sucheListe a[href="/spiele/stellwerk"]'); await page.waitForURL(/\/spiele\/stellwerk/);
  await page.goBack(); await page.click('#sucheBtn'); await page.keyboard.press('Escape');
  assert.ok(await page.isHidden('#suche'));
  await ctx.close();
});

test('Startseite: "Weiter spielen" erscheint erst nach einem Spiel und führt dorthin zurück', async () => {
  const ctx = await kontext(); const page = await ctx.newPage();
  await page.goto(ALT + '/'); assert.ok(await page.isHidden('#weiter'));
  await page.goto(ALT + '/spiele/hochstapler');
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('playsaal.zuletzt')).s), 'hochstapler');
  await page.evaluate(() => localStorage.setItem('hochstapler.best', '120'));
  await page.goto(ALT + '/'); assert.ok(await page.isVisible('#weiter'));
  assert.equal(await page.textContent('#weiterName'), 'Hochstapler');
  assert.match(await page.textContent('#weiterRec'), /120/);
  assert.equal(await page.getAttribute('#weiterLink', 'href'), '/spiele/hochstapler');
  // kaputter oder fremder Wert: Band bleibt weg, keine Seitenfehler
  const fehler = []; page.on('pageerror', (e) => fehler.push(e.message));
  await page.evaluate(() => localStorage.setItem('playsaal.zuletzt', '{"s":"gibt-es-nicht"}')); await page.reload();
  assert.ok(await page.isHidden('#weiter'));
  await page.evaluate(() => localStorage.setItem('playsaal.zuletzt', 'kaputt{')); await page.reload();
  assert.ok(await page.isHidden('#weiter')); assert.deepEqual(fehler, []);
  await ctx.close();
});


// Handy (iPhone-Breiten mit Safari-Leiste), schmales Handy, Tablet, Desktop
for (const [w, h, spalten] of [[320, 548, 2], [375, 548, 3], [390, 664, 3], [430, 746, 3], [768, 1024, 4], [1440, 900, 6]]) {
  test(`Startseite ${w}px: ${spalten} Spalten, quadratische Zellen, keine Lücken, kein Überlauf, erste Kacheln sichtbar`, async () => {
    const mobil = w < 700;
    const ctx = await kontext({ viewport: { width: w, height: h }, isMobile: mobil, hasTouch: mobil, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    await page.goto(NEU + '/impressum');
    await page.evaluate(() => localStorage.setItem('playsaal.zuletzt', JSON.stringify({ s: 'linke-spur', t: 1 })));
    await page.goto(NEU + '/'); await page.waitForTimeout(300);
    const r = await page.evaluate(() => {
      const bl = (e) => e.getBoundingClientRect();
      const bloecke = [...document.querySelectorAll('.kacheln')].map((g) => {
        const cs = getComputedStyle(g), gap = parseFloat(cs.columnGap), cols = cs.gridTemplateColumns.split(' ').length;
        const z = bl(g).width, zelle = (z - (cols - 1) * gap) / cols, rows = Math.round((bl(g).height + gap) / (zelle + gap));
        const ts = [...g.children].map((k) => { const b = bl(k); return { sw: Math.round((b.width + gap) / (zelle + gap)), sh: Math.round((b.height + gap) / (zelle + gap)), w: b.width, h: b.height }; });
        const belegt = ts.reduce((s, x) => s + x.sw * x.sh, 0);
        const inA = [...g.children].every((k) => { const b = bl(k), gb = bl(g); return b.left >= gb.left - 0.5 && b.right <= gb.right + 0.5; });
        return { id: g.parentElement.id, cols, rows, zelle, belegt, soll: cols * rows, inA, n: ts.length,
          ungleich: ts.some((x) => Math.abs(x.w - (x.sw * zelle + (x.sw - 1) * gap)) > 1 || Math.abs(x.h - (x.sh * zelle + (x.sh - 1) * gap)) > 1) };
      });
      const k1 = bl(document.querySelector('.kachel'));
      const kopf = bl(document.getElementById('kopf'));
      const nav = [...document.querySelectorAll('.p-tabs > *, .p-tools > *')].map((e) => bl(e));
      return { breite: document.documentElement.scrollWidth, bloecke, kachelOben: Math.round(k1.top), kopfH: Math.round(kopf.height), navMin: Math.min(...nav.map((n) => Math.min(n.width, n.height))), navRechts: Math.max(...nav.map((n) => n.right)),
        bild: document.querySelector('.kachel img').complete, lazy: [...document.querySelectorAll('#neu .kachel img')].every((i) => i.loading === 'lazy') };
    });
    assert.equal(r.breite, w, 'horizontaler Überlauf');
    assert.ok(r.navRechts <= w, 'Navigation ragt rechts raus');
    assert.ok(r.navMin >= 36, 'Tippfläche ' + r.navMin);
    assert.ok(r.kachelOben < h - 100, `erste Kachel erst bei ${r.kachelOben}px sichtbar`);
    assert.ok(r.lazy, 'Bilder unterhalb des ersten Blocks laden nicht lazy');
    for (const b of r.bloecke) {
      assert.equal(b.cols, spalten, `${b.id}: Spalten`);
      assert.equal(b.belegt, b.soll, `${b.id}: Lücken im Raster (${b.belegt} von ${b.soll} Zellen belegt)`);
      assert.ok(!b.ungleich, `${b.id}: Kachelmaße passen nicht zum Raster`);
      assert.ok(b.inA, `${b.id}: Kachel ragt über den Rand`);
      assert.ok(b.zelle >= 90, `${b.id}: Zellen zu klein (${Math.round(b.zelle)}px)`);
    }
    await ctx.close();
  });
}


test('Farbrollen: Gelb = Aktion, Orange = Marke, Rot-Orange nicht in der Oberfläche', async () => {
  const ctx = await kontext(); const page = await ctx.newPage(); await page.goto(ALT + '/');
  const f = await page.evaluate(() => {
    const bg = (s) => getComputedStyle(document.querySelector(s)).backgroundColor;
    const sicht = document.getElementById('weiter'); sicht.hidden = false;
    return { play: [...document.querySelectorAll('.play')].map((e) => getComputedStyle(e).backgroundColor), playText: getComputedStyle(document.querySelector('.play')).color,
      badge: bg('.kachel .badge'), basis: getComputedStyle(document.body).backgroundColor, aktiv: (document.getElementById('sucheBtn').click(), getComputedStyle(document.getElementById('sucheBtn')).color) };
  });
  const GELB = 'rgb(255, 210, 28)', ORANGE = 'rgb(255, 146, 0)', BASIS = 'rgb(17, 18, 26)';
  assert.ok(f.play.every((c) => c === GELB)); assert.equal(f.playText, BASIS);
  assert.equal(f.badge, ORANGE); assert.equal(f.basis, BASIS); assert.equal(f.aktiv, GELB);
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
    await start.evaluate(() => localStorage.setItem('playsaal.zuletzt', JSON.stringify({ s: 'linke-spur', t: 1 }))); await start.reload();
    assert.match(await start.textContent('#weiterRec'), /81\.234/);
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

test('Stammvölker: Bauauswahl, Rohstoffe, Bäume wachsen nach, Jahreszeit nach Uhr, Speicherstand', async () => {
  const ctx = await kontext({ viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage(); const fehler = [];
  p.on('pageerror', (e) => fehler.push(e.message));
  // Jahreszeit nach Uhrzeit: jede volle Stunde die nächste, ohne Knopf
  await p.goto(ALT + '/spiele/stammvoelker?test&direkt');
  await p.waitForFunction(() => window.__sv && __sv.trees.length > 0);
  const erwartet = Math.floor(Date.now() / 3600000) % 4;
  assert.equal(await p.evaluate(() => __sv.seasonNow()), erwartet);
  assert.equal(await p.locator('#season').count(), 0, 'kein Knopf zum Umstellen der Jahreszeit');
  await p.waitForFunction(() => /Min\./.test(document.getElementById('seasonLeft').textContent), null, { timeout: 15000 });
  assert.equal(await p.textContent('#seasonName'), ['Frühling', 'Sommer', 'Herbst', 'Winter'][erwartet]);
  // Anzeige und Auswahl
  const hud = await p.evaluate(() => ['vWood', 'vStone', 'vFood', 'vPop'].map((i) => document.getElementById(i).textContent));
  assert.deepEqual(hud.slice(0, 3), ['6', '0', '18']);
  await p.click('#build');
  const karten = await p.evaluate(() => [...document.querySelectorAll('.card')].map((c) => [c.dataset.k, c.classList.contains('poor')]));
  assert.deepEqual(karten.map((k) => k[0]), ['tent', 'holz', 'foerster', 'stein', 'sammler']);
  assert.deepEqual(karten.map((k) => k[1]), [false, true, true, true, true], 'nur das Zelt ist mit 6 Holz bezahlbar');
  // Förster pflanzt Setzlinge, Steinbruch liefert Stein
  await p.goto(ALT + '/spiele/stammvoelker?test&direkt&jahreszeit=0&neu');
  await p.waitForFunction(() => window.__sv && __sv.trees.length > 0);
  await p.evaluate(() => { __sv.state.wood = 40; __sv.state.stone = 5; __sv.buildNow('foerster', 5, 6); __sv.buildNow('stein', 8, 3); });
  await p.waitForFunction(() => __sv.trees.some((t) => t.g < 1), null, { timeout: 120000 });
  await p.waitForFunction(() => __sv.state.stone > 5, null, { timeout: 120000 });
  // Speicherstand bleibt über ein Neuladen erhalten
  const vorher = await p.evaluate(() => { __sv.save(); return { wood: __sv.state.wood, stone: __sv.state.stone, trees: __sv.trees.filter((t) => !t.fell).length, built: __sv.built.length }; });
  await p.goto(ALT + '/spiele/stammvoelker?test&direkt&jahreszeit=0');
  await p.waitForFunction(() => window.__sv && __sv.trees.length > 0);
  const nachher = await p.evaluate(() => ({ wood: __sv.state.wood, stone: __sv.state.stone, trees: __sv.trees.length, built: __sv.built.length }));
  assert.equal(nachher.built, 2); assert.equal(nachher.wood, vorher.wood); assert.equal(nachher.stone, vorher.stone); assert.equal(nachher.trees, vorher.trees);
  // kaputter Speicherstand: Spiel startet trotzdem
  await ctx.addInitScript(() => { if (location.search.includes('korrupt')) localStorage.setItem('stammvoelker.v1', '{"v":1,"wood":"x","t":[[1]],"b":[["constructor",5,5],5]}'); });
  await p.goto(ALT + '/spiele/stammvoelker?test&direkt&jahreszeit=0&korrupt');
  await p.waitForFunction(() => window.__sv && __sv.state);
  assert.equal(await p.evaluate(() => __sv.built.length), 0);
  assert.deepEqual(fehler, []);
  await ctx.close();
});
