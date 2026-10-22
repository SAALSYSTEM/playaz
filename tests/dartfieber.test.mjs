// DARTFIEBER im Browser (wrangler dev + Playwright, Server-Aufrufe ersetzt): Seite, Runde mit Bot, Tageschallenge (Gast und
// angemeldet), Sperren gegen Doppelauslösung, Zeichnung gegen Wertung, kleine Bildschirme, Rangliste.
// Start: node --test tests/dartfieber.test.mjs
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pruefeLauf, challengeAus, kodiere } from '../public/spiele/dartfieber/sim.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.DF_PORT || 8797);
const BASE = process.env.DF_BASE || `http://127.0.0.1:${PORT}`;   // DF_BASE: vorhandenen statischen Server nutzen (schneller Lauf)
function ladePlaywright() {
  const req = createRequire(import.meta.url);
  try { return req('playwright'); } catch (e) {}
  try { return req(join(execSync('npm root -g').toString().trim(), 'playwright')); } catch (e) {}
  return req('/opt/npm-tools/node_modules/playwright');
}
const { chromium } = ladePlaywright();
let wrangler, browser;
const warte = (ms) => new Promise((r) => setTimeout(r, ms));
before(async () => {
  if (!process.env.DF_BASE) wrangler = spawn('npx', ['-y', 'wrangler@4', 'dev', '--port', String(PORT), '--ip', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore', detached: true });
  for (let i = 0; i < (process.env.DF_BASE ? 1 : 90); i++) { try { if ((await fetch(BASE + '/')).ok) break; } catch (e) {} await warte(1000); }
  browser = await chromium.launch();
});
after(async () => { await browser?.close(); try { if (wrangler) process.kill(-wrangler.pid); } catch (e) {} });

const SEED = 424242, RUN = '22222222-2222-4222-8222-222222222222';
const antworte = (body, status = 200) => (r) => r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
// o.server: Verhalten der Server-Aufrufe; o.viewport
async function seite(o = {}) {
  const ctx = await browser.newContext({ viewport: o.viewport || { width: 390, height: 780 } });
  const aufrufe = [];
  await ctx.route(/supabase\.co/, antworte([]));
  await ctx.route(/supabase\.co\/rest\/v1\/rpc\/dartfieber_tag$/, antworte({ tag: '20261022', seed: SEED, version: 1 }));
  await ctx.route(/supabase\.co\/rest\/v1\/rpc\/dartfieber_start$/, antworte({ ok: true, run_id: RUN, tag: '20261022', seed: SEED, version: 1 }));
  await ctx.route(/supabase\.co\/rest\/v1\/rpc\/dartfieber_rangliste$/, antworte({ tag: '20261022', spieler: 12, ich: { platz: 4, punkte: 200, spieler: 12, luecke: 20, naechster_platz: 3 }, zeilen: [
    { pos: 1, platz: 1, name: 'Anna', avatar: 'a1', punkte: 410, ich: false }, { pos: 2, platz: 2, name: 'Ben', avatar: 'a2', punkte: 300, ich: false },
    { pos: 3, platz: 2, name: 'Cem', avatar: 'a3', punkte: 300, ich: false }, { pos: 9, platz: 9, name: 'Ich', avatar: 'a4', punkte: 120, ich: true }] }));
  await ctx.route(/supabase\.co\/rest\/v1\/rpc\/dartfieber_tage_liste$/, antworte(['20261022', '20261021']));
  await ctx.route(/supabase\.co\/functions\/v1\/dartfieber-lauf$/, async (r) => { aufrufe.push(JSON.parse(r.request().postData())); await (o.edge ? o.edge(r) : r.fulfill({ status: 500, body: '{}' })); });
  const page = await ctx.newPage(); const fehler = [];
  page.on('pageerror', (e) => fehler.push(e.message));
  await page.goto(BASE + (process.env.DF_BASE ? '/spiele/dartfieber.html' : '/spiele/dartfieber') + '?test');
  if (o.angemeldet) await page.evaluate(() => { window.PlaySaal.hatSitzung = () => true; window.PlaySaal.token = () => 'tok'; });
  return { ctx, page, fehler, aufrufe };
}
const zust = (page) => page.evaluate(() => window.__df.zustand);

// Bot im Browser: tippt mit echten Zeigerereignissen, wenn die Linie das Wunschziel erreicht (Wunsch = Mitte T20-Triple, Wind eingerechnet)
function botLaeuft(page, { max = 150000 } = {}) {
  return page.evaluate((max) => new Promise((fertig) => {
    const t0 = performance.now(); const c = document.getElementById('c');
    const f = () => {
      const d = window.__df, l = d.lauf;
      if (d.zustand === 'ende' || d.zustand === 'fertig') return fertig(true);
      if (performance.now() - t0 > max) return fertig(false);
      if (d.zustand === 'spiel') {
        const s = l.s, ch = d.ch, K = ch.K;
        if ((s.phase === 'x' || s.phase === 'y') && l.nimmtTipp()) {
          const w = ch.wind[Math.floor(s.i / K.wind.block)], b = ch.bonus[s.i];
          const zx = (b ? b.x : ch.cx) - w.dx, zy = (b ? b.y : ch.cy - Math.floor((9900 + 10700) / 2 * ch.s / 1000)) - w.dy;
          const v = Math.floor(ch.v0 * Math.min(K.tempo.deckel, 1000 + K.tempo.zuwachs * s.i) / 1000);
          const ist = l.pos(s.phase === 'x' ? 'x' : 'y'), ziel = s.phase === 'x' ? zx : zy;
          if (Math.abs(ist - ziel) <= v / 2) c.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
        }
      }
      requestAnimationFrame(f);
    }; f();
  }), max);
}

test('Seite: Titel, SEO, Testphase noindex, Regeln mit 30-Würfe-Grenze', async () => {
  const { ctx, page, fehler } = await seite();
  assert.match(await page.title(), /DARTFIEBER/);
  assert.match(await page.getAttribute('link[rel=canonical]', 'href'), /\/spiele\/dartfieber$/);
  assert.equal(await page.locator('h1').count(), 1);
  assert.ok((await page.getAttribute('meta[name=description]', 'content')).length > 80);
  await page.click('#bRegeln');
  assert.match(await page.textContent('#sRegeln'), /30 Würfe/);
  assert.match(await page.textContent('#sRegeln'), /Bot/);        // ehrlicher Hinweis zu den Grenzen der Prüfung
  await page.click('#bRegelnZu');
  assert.equal(await page.isVisible('#bTag'), true);
  assert.deepEqual(fehler, []); await ctx.close();
});

test('Üben: komplette Runde mit Bot; Ergebnis stimmt mit der serverseitigen Prüfung überein', async () => {
  const { ctx, page, fehler } = await seite();
  await page.click('#bUeben'); await page.waitForFunction(() => window.__df.zustand === 'bereit');
  await page.mouse.click(195, 300);                              // erster Tipp startet nur
  assert.equal(await zust(page), 'spiel');
  assert.equal(await botLaeuft(page), true, 'Runde endet');
  await page.waitForFunction(() => window.__df.zustand === 'ende', null, { timeout: 5000 });
  const d = await page.evaluate(() => { const l = window.__df.lauf.s; return { seed: window.__df.ch.seed, v: window.__df.ch.version, inputs: window.__df.tipps, punkte: l.punkte, ticks: l.t, wuerfe: l.wuerfe, text: document.getElementById('ePunkte').textContent }; });
  assert.ok(d.punkte > 0 && d.wuerfe >= 5 && d.wuerfe <= 30, JSON.stringify(d));
  assert.equal(d.text, String(d.punkte));
  const r = pruefeLauf(d.seed, d.v, { inputs: kodiere(d.inputs), ticks: d.ticks, score: d.punkte, throws: d.wuerfe });
  assert.equal(r.ok, true, 'Browser-Runde = Server-Nachrechnung: ' + JSON.stringify(r));
  assert.match(await page.textContent('#eModus'), /Übung/);
  assert.equal(await page.isVisible('#bNochmal'), true); assert.equal(await page.isVisible('#bRang2'), true);
  assert.deepEqual(fehler, []); await ctx.close();
});

test('Tageschallenge als Gast: gleiche Bedingungen bei jedem Versuch, lokales Ergebnis, Anmelde-Hinweis ohne zweite Anmeldung', async () => {
  const { ctx, page, fehler, aufrufe } = await seite();
  const bedingungen = async () => page.evaluate(() => { const c = window.__df.ch; return JSON.stringify([c.seed, c.s, c.cx, c.cy, c.v0, c.windMax, c.wind, c.startX.slice(0, 8), c.bonus.filter(Boolean).length]); });
  await page.click('#bTag'); await page.waitForFunction(() => window.__df.zustand === 'bereit');
  const eins = await bedingungen();
  assert.equal(await page.evaluate(() => window.__df.ch.seed), SEED);
  assert.equal(await page.evaluate(() => window.__df.runId), null);
  await page.mouse.click(195, 300); await botLaeuft(page);
  await page.waitForFunction(() => window.__df.zustand === 'ende');
  assert.match(await page.textContent('#eStatus'), /nur auf diesem Gerät/i);
  assert.equal(await page.isVisible('#bAnmelden'), true);
  assert.equal(aufrufe.length, 0, 'ohne Konto nichts an die Prüf-Funktion');
  const punkte = await page.evaluate(() => window.__df.lauf.s.punkte);
  assert.equal(await page.evaluate(() => window.__df.store().tage['20261022']), punkte);
  await page.click('#bNochmal'); await page.waitForFunction(() => window.__df.zustand === 'bereit');
  assert.equal(await bedingungen(), eins, 'Wiederholung = gleiche Bedingungen');
  assert.deepEqual(fehler, []); await ctx.close();
});

test('Tageschallenge angemeldet: Run-ID, Eingaben werden gemeldet und sind serverseitig nachrechenbar; Rang wird angezeigt', async () => {
  const { ctx, page, fehler, aufrufe } = await seite({ angemeldet: true, edge: antworte({ verifiziert: true, punkte: 1, wuerfe: 1, tag: '20261022', rang: { platz: 3, punkte: 250, spieler: 12, luecke: 40, naechster_platz: 2 } }) });
  await page.click('#bTag'); await page.waitForFunction(() => window.__df.zustand === 'bereit');
  assert.equal(await page.evaluate(() => window.__df.runId), RUN);
  assert.match(await page.textContent('#rang'), /Platz 4 von 12/);      // eigener Tagesplatz aus der Datenbank, nie erfunden
  assert.match(await page.textContent('#rang'), /noch 20/);
  await page.mouse.click(195, 300); await botLaeuft(page);
  await page.waitForFunction(() => window.__df.zustand === 'ende');
  await page.waitForFunction(() => /nachgerechnet/.test(document.getElementById('eStatus').textContent));
  assert.match(await page.textContent('#eStatus'), /Platz 3 von 12/); assert.match(await page.textContent('#eStatus'), /Noch 40 Punkte bis Platz 2/);
  assert.equal(aufrufe.length, 1); const m = aufrufe[0];
  assert.equal(m.run_id, RUN); assert.equal(Object.keys(m).sort().join(), 'inputs,run_id,score,throws,ticks');   // kein Seed, keine Punkte-Extras vom Browser
  assert.equal(pruefeLauf(SEED, 1, m).ok, true);
  assert.deepEqual(fehler, []); await ctx.close();
});

test('Speicherfehler: ehrliche Meldung, kein erfundener Rang, erneut senden möglich', async () => {
  const { ctx, page, fehler } = await seite({ angemeldet: true });   // Prüf-Funktion antwortet 500
  await page.click('#bTag'); await page.waitForFunction(() => window.__df.zustand === 'bereit');
  await page.mouse.click(195, 300); await botLaeuft(page);
  await page.waitForFunction(() => window.__df.zustand === 'ende');
  await page.waitForFunction(() => /nicht erreichbar/.test(document.getElementById('eStatus').textContent));
  assert.doesNotMatch(await page.textContent('#eStatus'), /Platz \d/);
  assert.equal(await page.isVisible('#bErneut'), true);
  assert.deepEqual(fehler, []); await ctx.close();
});

test('Server ohne Challenge: Tageschallenge meldet den Fehler, Üben bleibt möglich', async () => {
  const { ctx, page, fehler } = await seite();
  await ctx.route(/supabase\.co\/rest\/v1\/rpc\/dartfieber_tag$/, (r) => r.abort());
  await page.click('#bTag');
  await page.waitForFunction(() => /nicht erreichbar/.test(document.getElementById('tStatus').textContent));
  assert.equal(await zust(page), 'titel');
  await page.click('#bUeben'); await page.waitForFunction(() => window.__df.zustand === 'bereit');
  assert.deepEqual(fehler, []); await ctx.close();
});

test('Eingabesperren: Tipp nur in den Zielphasen, nie doppelt, nicht im Flug', async () => {
  const { ctx, page, fehler } = await seite();
  await page.click('#bUeben'); await page.waitForFunction(() => window.__df.zustand === 'bereit');
  await page.mouse.click(195, 300);
  const r = await page.evaluate(() => new Promise((fertig) => {
    const c = document.getElementById('c'), tap = () => c.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    const d = window.__df; let schritt = 0, flugTipps = 0, t0 = performance.now(), vorFlug = 0;
    const f = () => {
      const s = d.lauf.s;
      if (schritt === 0 && s.phase === 'x' && s.k > 10) { tap(); tap(); tap(); schritt = 1; }           // dreifaches Tippen im selben Moment
      else if (schritt === 1 && s.phase === 'y' && s.k > 10) { tap(); schritt = 2; }
      else if (schritt === 2 && s.phase === 'flug') { vorFlug = d.tipps.length; for (let i = 0; i < 5; i++) tap(); schritt = 3; }
      else if (schritt === 3 && s.phase === 'nach') { flugTipps = d.tipps.length; tap(); schritt = 4; }
      else if (schritt === 4 && s.phase === 'x') return fertig({ tipps: d.tipps.length, vorFlug, flugTipps, wuerfe: s.wuerfe, pfeile: s.pfeile });
      if (performance.now() - t0 > 15000) return fertig(null);
      requestAnimationFrame(f);
    }; f();
  }));
  assert.ok(r, 'Ablauf erreicht'); assert.equal(r.vorFlug, 2, 'dreifaches Tippen zählt einmal'); assert.equal(r.flugTipps, 2, 'im Flug keine Eingabe');
  assert.equal(r.tipps, 2, 'auch in der Pause keine'); assert.equal(r.wuerfe, 1); assert.equal(r.pfeile, 4);
  assert.deepEqual(fehler, []); await ctx.close();
});

test('Zeichnung = Wertung: Farben der gezeichneten Scheibe passen zu treffer()/feldFarbe() an 80 Feldpunkten', async () => {
  const { ctx, page, fehler } = await seite();
  await page.click('#bTag'); await page.waitForFunction(() => window.__df.zustand === 'bereit');
  const r = await page.evaluate(async () => {
    const sim = await import('/spiele/dartfieber/sim.js'); const d = window.__df, ch = d.ch, off = d.scheibe(), sc = d.lay.sc, dpr = d.lay.dpr, s = ch.s / 1000;
    const g = off.getContext('2d'), FARBE = { schwarz: [27, 27, 29], creme: [239, 226, 191], rot: [200, 55, 45], gruen: [45, 138, 75] };
    const nah = (p) => Object.entries(FARBE).sort((a, b) => dist(a[1], p) - dist(b[1], p))[0][0];
    const dist = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
    let n = 0, falsch = [];
    const pruefe = (dx, dy) => {
      const t = sim.treffer(Math.round(dx), Math.round(dy), ch.s); const soll = sim.feldFarbe(t.ring, t.sektor);
      const x = (off.D / 2 + dx * sc) * dpr, y = (off.D / 2 + dy * sc) * dpr, p = g.getImageData(Math.round(x), Math.round(y), 1, 1).data;
      n++; const ist = nah([p[0], p[1], p[2]]); if (ist !== soll) falsch.push([dx, dy, t.ring, soll, ist]);
    };
    pruefe(0, 0); pruefe(1000 * s, 0);
    const mitten = [(sim.RING.aussenBull + sim.RING.dreifachInnen) / 2, (sim.RING.dreifachInnen + sim.RING.dreifachAussen) / 2, (sim.RING.dreifachAussen + sim.RING.doppelInnen) / 2, (sim.RING.doppelInnen + sim.RING.doppelAussen) / 2];
    for (let k = 0; k < 20; k++) for (const rad of mitten) { const a = (k * 18 * Math.PI) / 180; pruefe(Math.sin(a) * rad * s, -Math.cos(a) * rad * s); }
    return { n, falsch };
  });
  assert.equal(r.n, 82); assert.deepEqual(r.falsch, []);
  assert.deepEqual(fehler, []); await ctx.close();
});

test('Kleine Bildschirme: nichts läuft über, STOPP und Scheibe sichtbar', async () => {
  for (const vp of [{ width: 360, height: 560 }, { width: 320, height: 520 }, { width: 390, height: 780 }, { width: 1280, height: 720 }]) {
    const { ctx, page, fehler } = await seite({ viewport: vp });
    await page.click('#bUeben'); await page.waitForFunction(() => window.__df.zustand === 'bereit');
    const m = await page.evaluate(() => {
      const b = document.getElementById('bStopp').getBoundingClientRect(), k = document.getElementById('kopf').getBoundingClientRect(), l = window.__df.lay;
      return { stoppUnten: b.bottom, stoppH: b.height, kopfUnten: k.bottom, scheibe: l.B, brett: [l.w, l.h], scroll: document.documentElement.scrollWidth, vw: innerWidth, vh: innerHeight };
    });
    assert.ok(m.stoppUnten <= m.vh + 1 && m.stoppH >= 44, 'STOPP sichtbar ' + JSON.stringify([vp, m]));
    assert.ok(m.scheibe >= Math.min(vp.width - 20, vp.height * 0.4), 'Scheibe groß genug ' + JSON.stringify([vp, m]));
    assert.ok(m.scroll <= m.vw, 'kein Seitenscroll ' + JSON.stringify([vp, m]));
    assert.deepEqual(fehler, []); await ctx.close();
  }
});

test('Rangliste: Top, eigene Platzierung mit Lücke, Gleichstand, Tage blättern', async () => {
  const { ctx, page, fehler } = await seite({ angemeldet: true });
  await page.click('#bRang'); await page.waitForSelector('#rListe li');
  const zeilen = await page.$$eval('#rListe li', (l) => l.map((x) => x.textContent));
  assert.equal(zeilen.length, 5); assert.match(zeilen[0], /Anna/); assert.match(zeilen[1], /^2.*Ben/); assert.match(zeilen[2], /^2.*Cem/);
  assert.equal(zeilen[3], '…'); assert.match(zeilen[4], /Ich \(du\)/);
  assert.match(await page.textContent('#rHinweis'), /20 Punkte bis Platz 3/);
  assert.match(await page.textContent('#rTag'), /Heute/);
  await page.waitForFunction(() => !document.getElementById('rZurueck').disabled);
  await page.click('#rZurueck'); await page.waitForFunction(() => !/Heute/.test(document.getElementById('rTag').textContent));
  await page.click('#bRangZu'); assert.equal(await page.isVisible('#bTag'), true);
  assert.deepEqual(fehler, []); await ctx.close();
});
