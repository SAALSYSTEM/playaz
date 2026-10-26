// Wasser Marsch! – Browserprüfung der Leitersteuerung (Level 21–25): Ziehen, Loslassen, erneutes Greifen, Einrasten,
// Pause/Neustart/Levelwechsel während der Rettung. Eigener kleiner Static-Server, kein wrangler nötig.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
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
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.webp': 'image/webp', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
let server, browser, base;
const SAVE = JSON.stringify({ v: 1, unlocked: 25, done: Object.fromEntries(Array.from({ length: 20 }, (_, i) => [i + 1, true])), mute: true });

before(async () => {
  server = createServer((req, res) => {
    const p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
    const f = join(ROOT, p);
    if (!f.startsWith(ROOT) || !existsSync(f) || !extname(f)) { res.statusCode = 404; return res.end(); }
    res.setHeader('content-type', MIME[extname(f)] || 'application/octet-stream'); res.end(readFileSync(f));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}/spiele/wasser-marsch.html`;
  try { browser = await chromium.launch(); } catch (e) {
    const dir = '/opt/pw-browsers', c = existsSync(dir) ? readdirSync(dir).filter((d) => d.startsWith('chromium-')).map((d) => join(dir, d, 'chrome-linux/chrome')).find(existsSync) : null;
    browser = await chromium.launch({ executablePath: c });
  }
});
after(async () => { await browser?.close(); server?.close(); });

async function open(level, size = { width: 360, height: 640 }) {
  const ctx = await browser.newContext({ viewport: size, deviceScaleFactor: 1 });
  await ctx.addInitScript((s) => { try { if (!localStorage.getItem('wassermarsch.v1')) localStorage.setItem('wassermarsch.v1', s); } catch (e) {} }, SAVE);
  const page = await ctx.newPage(), errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/404|Failed to load resource/.test(m.text())) errs.push(m.text()); });
  await page.goto(`${base}?level=${level}`);
  await page.waitForFunction(() => window.__wm && window.__wm.mode === 'play');
  const api = {
    page, errs, ctx,
    S: () => page.evaluate(() => ({ mode: __wm.mode, level: __wm.level, fires: __wm.st.fires.map((f) => [f.win, f.left, f.total]), cats: __wm.st.cats.map((c) => c.state), rescue: __wm.st.rescue ? { cat: __wm.st.rescue.cat, t: __wm.st.rescue.t, manual: !!__wm.st.rescue.manual } : null, tip: { ...__wm.bk.tip }, rest: { ...__wm.rig.restTip }, drag: !!__wm.drag, won: __wm.st.won, save: __wm.save })),
    win: (id) => page.evaluate((id) => { const w = __wm.L.byId[id], r = document.getElementById('game').getBoundingClientRect(); return { x: r.left + w.cx, y: r.top + w.cy }; }, id),
    // Bildschirmpunkt der Mitte des Korbs (greifbar) bzw. Korbposition am Fenster
    basketPt: (tip) => page.evaluate((t) => { const r = document.getElementById('game').getBoundingClientRect(), up = __wm.rig.basket.bh * 0.46; const q = t || __wm.bk.tip; return { x: r.left + q.x, y: r.top + q.y - up }; }, tip || null),
    targetPt: (win) => page.evaluate((id) => { const r = document.getElementById('game').getBoundingClientRect(), t = __wm.rig.targets[id], up = __wm.rig.basket.bh * 0.46; return { x: r.left + t.x, y: r.top + t.y - up }; }, win),
    async douse(id) {
      const c = await this.win(id);
      await page.mouse.move(c.x, c.y); await page.mouse.down();
      await page.waitForFunction((id) => __wm.st.fires.find((f) => f.win === id).left === 0, id, { timeout: 15000 });
      await page.mouse.up();
    },
    async dragTo(p, steps = 12) { await page.mouse.move(p.x, p.y, { steps }); },
    async waitRescueDone(n) { await page.waitForFunction((n) => !__wm.st.rescue && __wm.st.cats.filter((c) => c === 'down' || c.state === 'down').length >= n, n, { timeout: 12000 }); }
  };
  return api;
}
const near = (a, b, d = 1.5) => Math.hypot(a.x - b.x, a.y - b.y) <= d;

test('Level 21: Korb erst nach gelöschtem Feuer greifbar; Ziehen, Loslassen, erneutes Greifen, Einrasten, Rückfahrt, Sieg', async () => {
  const t = await open(21);
  let s = await t.S();
  assert.equal(s.level, 21); assert.equal(s.rescue, null); assert.deepEqual(s.cats, ['wait']);
  assert.equal(await t.page.evaluate(() => __wm.st.manual), true);
  // Katze gesperrt: Greifen am Korb geht nicht (Wasser statt Ziehen), Korb bleibt liegen
  const b0 = await t.basketPt();
  await t.page.mouse.move(b0.x, b0.y); await t.page.mouse.down(); await t.dragTo({ x: b0.x - 80, y: b0.y - 80 }, 6); await t.page.mouse.up();
  s = await t.S(); assert.ok(near(s.tip, s.rest), 'Korb bleibt auf dem Wagen, solange das Haus brennt'); assert.equal(s.drag, false);
  await t.douse(s.fires[0][0]);
  s = await t.S(); assert.equal(s.fires[0][1], 0);

  // Ziehen: Korb folgt dem Finger (nur bis zur Reichweite), kein Einrasten weit vom Fenster
  const tgt = await t.targetPt('b0-r2-c0'), start = await t.basketPt();
  await t.page.mouse.move(start.x, start.y); await t.page.mouse.down();
  const mid = { x: start.x + 20, y: start.y - 200 };   // weit weg vom Katzenfenster
  await t.dragTo(mid);
  s = await t.S(); assert.equal(s.drag, true); assert.equal(s.rescue, null);
  const midTip = s.tip; assert.ok(!near(midTip, s.rest, 20), 'Korb ist mitgekommen');
  // Loslassen vor dem Ziel: Korb steht, keine Strafe, Katze wartet
  await t.page.mouse.up();
  await t.page.waitForTimeout(250);
  s = await t.S(); assert.equal(s.drag, false); assert.equal(s.rescue, null); assert.deepEqual(s.cats, ['wait']);
  assert.ok(near(s.tip, midTip, 1), 'Korb bleibt stehen, wo er losgelassen wurde');
  await t.page.waitForTimeout(1500);
  assert.ok(near((await t.S()).tip, midTip, 1), 'kein Zurückfallen nach Wartezeit');

  // Erneut greifen: großzügig neben dem Korb (weiter Greifkreis), ohne Sprung
  const g = await t.basketPt();
  await t.page.mouse.move(g.x + 26, g.y + 14); await t.page.mouse.down();
  s = await t.S(); assert.equal(s.drag, true, 'neben dem Korb greifbar'); assert.ok(near(s.tip, midTip, 1), 'kein Sprung beim Greifen');
  await t.dragTo({ x: tgt.x + 26 + 3, y: tgt.y + 14 + 3 }, 20);            // knapp neben dem Ziel reicht
  await t.page.waitForFunction(() => !!__wm.st.rescue, null, { timeout: 3000 });
  s = await t.S(); assert.equal(s.rescue.manual, true); assert.equal(s.drag, false, 'Greifen endet beim Einrasten');
  // Rettung läuft: Eingaben gesperrt
  await t.page.mouse.move(tgt.x, tgt.y, { steps: 4 });
  s = await t.S(); assert.ok(s.rescue); const tipBefore = s.tip;
  await t.page.mouse.up(); await t.page.mouse.move(tgt.x, tgt.y + 5); await t.page.mouse.down();
  s = await t.S(); assert.equal(s.drag, false, 'während der Rettung nicht greifbar'); await t.page.mouse.up();
  // Katze zählt erst bei Ankunft unten
  assert.deepEqual((await t.S()).cats, ['rescue']);
  assert.equal((await t.page.evaluate(() => document.getElementById('hudCat').textContent)), '0/1');
  assert.equal(await t.page.evaluate(() => __wm.mode), 'play');
  await t.page.waitForFunction(() => __wm.st.cats[0].state === 'down', null, { timeout: 8000 });
  assert.equal((await t.page.evaluate(() => document.getElementById('hudCat').textContent)), '1/1');
  await t.page.waitForFunction(() => __wm.mode === 'cheer' || __wm.mode === 'won', null, { timeout: 4000 });
  s = await t.S(); assert.ok(s.save.done[21], 'Level 21 gespeichert');
  assert.deepEqual(t.errs, []); await t.ctx.close();
});

test('Kein Wasser beim Ziehen; zweite Katze erst nach der ersten (Level 23: zwei Häuser, zwei Katzen)', async () => {
  const t = await open(23);
  let s = await t.S();
  await t.douse('b0-r1-c0');                                    // Haus 0 aus, Haus 1 brennt noch
  const burn = await t.S(); const other = burn.fires.find((f) => f[0] === 'b1-r1-c1');
  assert.ok(other[1] > 0);
  // Korb über das brennende Fenster des anderen Hauses ziehen und dort halten
  const c = await t.win('b1-r1-c1'), st0 = await t.basketPt();
  await t.page.mouse.move(st0.x, st0.y); await t.page.mouse.down(); await t.dragTo({ x: c.x, y: c.y + 20 }, 20);
  await t.page.waitForTimeout(1200);
  s = await t.S(); assert.equal(s.drag, true); assert.equal(s.fires.find((f) => f[0] === 'b1-r1-c1')[1], other[1], 'kein Wasser während des Ziehens');
  assert.equal(s.rescue, null, 'dort ist keine freigegebene Katze');
  await t.page.mouse.up();
  // Zweite Katze (Haus 1) ist noch gesperrt: Korb am Fenster 2 löst nichts aus
  const t1 = await t.targetPt('b1-r1-c0'), g = await t.basketPt();
  await t.page.mouse.move(g.x, g.y); await t.page.mouse.down(); await t.dragTo(t1, 20); await t.page.waitForTimeout(500);
  s = await t.S(); assert.equal(s.rescue, null, 'Katze 2 bleibt gesperrt, solange Haus 1 brennt'); await t.page.mouse.up();
  // erste Katze retten
  const t0 = await t.targetPt('b0-r2-c1'), g2 = await t.basketPt();
  await t.page.mouse.move(g2.x, g2.y); await t.page.mouse.down(); await t.dragTo(t0, 20);
  await t.page.waitForFunction(() => !!__wm.st.rescue && __wm.st.rescue.cat === 0, null, { timeout: 3000 });
  await t.page.mouse.up();
  await t.page.waitForFunction(() => __wm.st.cats[0].state === 'down' && !__wm.st.rescue, null, { timeout: 8000 });
  s = await t.S(); assert.deepEqual(s.cats, ['down', 'wait']); assert.ok(near(s.tip, s.rest), 'Korb wieder auf dem Wagen');
  // Haus 1 löschen, zweite Katze retten, Sieg erst jetzt
  assert.equal(s.won, false);
  await t.douse('b1-r1-c1');
  const t2 = await t.targetPt('b1-r1-c0'), g3 = await t.basketPt();
  await t.page.mouse.move(g3.x, g3.y); await t.page.mouse.down(); await t.dragTo(t2, 20);
  await t.page.waitForFunction(() => !!__wm.st.rescue && __wm.st.rescue.cat === 1, null, { timeout: 3000 });
  await t.page.mouse.up();
  await t.page.waitForFunction(() => __wm.st.cats.every((c) => c.state === 'down'), null, { timeout: 8000 });
  await t.page.waitForFunction(() => __wm.mode === 'cheer' || __wm.mode === 'won', null, { timeout: 4000 });
  assert.equal((await t.S()).cats.filter((c) => c === 'down').length, 2, 'jede Katze genau einmal gezählt');
  assert.deepEqual(t.errs, []); await t.ctx.close();
});

test('Pause, Neustart und Levelwechsel während der Rettung', async () => {
  const t = await open(21);
  const startRescue = async () => {
    await t.douse('b0-r1-c1');
    const tgt = await t.targetPt('b0-r2-c0'), g = await t.basketPt();
    await t.page.mouse.move(g.x, g.y); await t.page.mouse.down(); await t.dragTo(tgt, 20);
    await t.page.waitForFunction(() => !!__wm.st.rescue, null, { timeout: 3000 });
  };
  await startRescue();
  // Pause während der Rettung: friert ein (auch mit gehaltenem Finger), Weiter setzt fort, Katze zählt genau einmal
  await t.page.keyboard.press('Escape');
  let s = await t.S(); assert.equal(s.mode, 'pause'); assert.equal(s.drag, false);
  const t0 = s.rescue.t; await t.page.waitForTimeout(600);
  s = await t.S(); assert.equal(s.rescue.t, t0, 'Rettung steht in der Pause'); await t.page.mouse.up();
  await t.page.keyboard.press('Escape');
  await t.page.waitForFunction(() => __wm.st.cats[0].state === 'down' && !__wm.st.rescue, null, { timeout: 8000 });
  s = await t.S(); assert.deepEqual(s.cats, ['down']); assert.ok(near(s.tip, s.rest));
  await t.page.waitForFunction(() => __wm.mode === 'cheer' || __wm.mode === 'won', null, { timeout: 4000 });
  // frisch öffnen, Rettung starten, dann Neustart über Pause-Menü
  await t.page.goto(`${base}?level=21`); await t.page.waitForFunction(() => __wm.mode === 'play');
  await startRescue();
  await t.page.mouse.up();
  await t.page.waitForTimeout(500);
  await t.page.keyboard.press('Escape'); await t.page.click('#pRestart');
  await t.page.waitForFunction(() => __wm.mode === 'play');
  s = await t.S(); assert.equal(s.rescue, null); assert.deepEqual(s.cats, ['wait']); assert.equal(s.fires[0][1], s.fires[0][2]); assert.ok(near(s.tip, s.rest)); assert.equal(s.drag, false);
  await t.page.waitForTimeout(1500); s = await t.S(); assert.deepEqual(s.cats, ['wait'], 'alte Rettung läuft nicht weiter'); assert.equal(s.rescue, null);
  // Levelwechsel während der Rettung: Pause -> Levelauswahl -> Level 22
  await startRescue(); await t.page.mouse.up();
  await t.page.keyboard.press('Escape'); await t.page.click('#pLevels');
  await t.page.waitForSelector('#levelGrid .lvl:not(.locked)');
  assert.equal(await t.page.locator('#levelGrid .lvl').count(), 25, '25 Kacheln');
  await t.page.locator('#levelGrid .lvl', { hasText: /^22$/ }).click({ force: true });
  await t.page.waitForFunction(() => __wm.level === 22 && __wm.mode === 'play');
  s = await t.S(); assert.equal(s.rescue, null); assert.deepEqual(s.cats, ['wait']); assert.ok(near(s.tip, s.rest)); assert.equal(s.drag, false);
  assert.equal(await t.page.evaluate(() => __wm.st.manual), true);
  await t.page.waitForTimeout(1200); assert.deepEqual((await t.S()).cats, ['wait']);
  assert.deepEqual(t.errs, []); await t.ctx.close();
});

test('Fensterbild: weit oben (Level 24) und drei Katzen in freier Reihenfolge (Level 25) erreichbar; Fenstergröße ändern behält den Korb', async () => {
  const t = await open(24);
  await t.douse('b0-r3-c0');
  let tgt = await t.targetPt('b0-r0-c1'), g = await t.basketPt();
  await t.page.mouse.move(g.x, g.y); await t.page.mouse.down(); await t.dragTo(tgt, 30);
  await t.page.waitForFunction(() => !!__wm.st.rescue, null, { timeout: 3000 });
  await t.page.mouse.up();
  await t.page.waitForFunction(() => __wm.st.cats[0].state === 'down' && !__wm.st.rescue, null, { timeout: 10000 });
  await t.ctx.close();

  const u = await open(25);
  for (const w of ['b0-r2-c0', 'b1-r4-c1', 'b2-r3-c0']) await u.douse(w);
  const order = [2, 0, 1], wins = ['b0-r1-c1', 'b1-r0-c0', 'b2-r1-c1'];
  for (const [n, i] of order.entries()) {
    tgt = await u.targetPt(wins[i]); g = await u.basketPt();
    await u.page.mouse.move(g.x, g.y); await u.page.mouse.down(); await u.dragTo(tgt, 30);
    await u.page.waitForFunction((i) => !!__wm.st.rescue && __wm.st.rescue.cat === i, i, { timeout: 3000 });
    if (n === 0) {                                               // Fenstergröße ändern mitten in der Rettung
      await u.page.setViewportSize({ width: 390, height: 844 }); await u.page.waitForTimeout(150);
      const r = await u.page.evaluate(() => ({ ok: !__wm.st.rescue || !!__wm.rig.targets[__wm.st.cats[__wm.st.rescue.cat].win] }));
      assert.ok(r.ok);
    }
    await u.page.mouse.up();
    await u.page.waitForFunction((n) => __wm.st.cats.filter((c) => c.state === 'down').length === n + 1 && !__wm.st.rescue, n, { timeout: 10000 }).catch(() => {});
    await u.page.waitForFunction((n) => __wm.st.cats.filter((c) => c.state === 'down').length === n + 1, n, { timeout: 10000 });
  }
  await u.page.waitForFunction(() => __wm.mode === 'cheer' || __wm.mode === 'won', null, { timeout: 4000 });
  assert.equal((await u.S()).save.done[25], true);
  assert.deepEqual(u.errs, []); await u.ctx.close();

  // gezogenen Korb bei Größenänderung im erlaubten Bereich halten
  const v = await open(22);
  await v.douse('b0-r2-c1');
  const g2 = await v.basketPt(); await v.page.mouse.move(g2.x, g2.y); await v.page.mouse.down(); await v.dragTo({ x: 120, y: 300 }, 12); await v.page.mouse.up();
  await v.page.setViewportSize({ width: 320, height: 570 }); await v.page.waitForTimeout(200);
  const inb = await v.page.evaluate(() => { const r = __wm.rig.reach, t = __wm.bk.tip; return t.x >= r.minX - 0.5 && t.x <= r.maxX + 0.5 && t.y >= r.minY - 0.5 && t.y <= r.maxY + 0.5; });
  assert.ok(inb, 'Korb nach Größenänderung im Bereich');
  assert.deepEqual(v.errs, []); await v.ctx.close();
});

test('Level 1–20 behalten ihre Bedienung: Katze antippen (Level 7), Korb ist nicht ziehbar', async () => {
  const t = await open(7);
  assert.equal(await t.page.evaluate(() => __wm.st.manual), false);
  const cat = await t.page.evaluate(() => __wm.st.cats[0].win), fireWins = await t.page.evaluate(() => __wm.st.fires.filter((f) => f.b === __wm.st.cats[0].b).map((f) => f.win));
  for (const w of fireWins) await t.douse(w);
  const g = await t.basketPt(); await t.page.mouse.move(g.x, g.y); await t.page.mouse.down(); await t.dragTo({ x: g.x - 60, y: g.y - 60 }, 6); await t.page.mouse.up();
  let s = await t.S(); assert.equal(s.drag, false); assert.ok(near(s.tip, s.rest), 'in Level 7 gibt es keinen ziehbaren Korb'); assert.equal(s.rescue, null);
  const c = await t.win(cat); await t.page.mouse.click(c.x, c.y);
  s = await t.S(); assert.ok(s.rescue && !s.rescue.manual, 'automatische Rettung per Tipp');
  await t.page.waitForFunction(() => __wm.st.cats[0].state === 'down' && !__wm.st.rescue, null, { timeout: 8000 });
  assert.deepEqual(t.errs, []); await t.ctx.close();
});
