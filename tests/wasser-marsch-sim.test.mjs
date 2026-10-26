import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SCENES, LEVELS, LEVEL_COUNT } from '../public/spiele/wasser-marsch/levels.js';
import {
  STORE, MIN_HIT, RESCUE_TOTAL, layout, pickWindow, validateLevels, newState, spray, tapCat, stepRescue,
  checkWin, catUnlocked, firesOut, catsDown, freshSave, sanitizeSave, recordWin, buildingOf,
  RESCUE_M, isManual, startManualRescue, rescuePhaseOf, retractTime, truckGeometry, basketGeom, basketTip, makeReach, clampTip,
  snapRadius, pickSnap, grabZone, grabbable
} from '../public/spiele/wasser-marsch/engine.js';

const briefing = JSON.parse(readFileSync(new URL('../design/wasser-marsch/briefing/levels.json', import.meta.url), 'utf8'));
const manifest = JSON.parse(readFileSync(new URL('../public/spiele/wasser-marsch/img/manifest.json', import.meta.url), 'utf8'));
const scene = (id) => SCENES.find((s) => s.id === id);
// kleinste Zielansicht 360×640 (HUD ~12 %, Gehweg bei 80,8 %) und ein hohes Handy
const VIEWS = [{ w: 360, top: 64, ground: 517 }, { w: 390, top: 74, ground: 682 }, { w: 320, top: 64, ground: 460 }];

test('25 gültige Level in 6 Szenen, Level 1–20 1:1 aus dem Briefing', () => {
  assert.equal(LEVEL_COUNT, 25);
  assert.deepEqual(validateLevels(LEVELS, SCENES), []);
  assert.deepEqual(LEVELS.map((l) => l.id), Array.from({ length: 25 }, (_, i) => i + 1));
  assert.deepEqual([...new Set(LEVELS.map((l) => l.scene))].sort(), [1, 2, 3, 4, 5, 6]);
  assert.equal(briefing.levels.length, 20);
  assert.ok(LEVELS.slice(0, 20).every((l) => !l.ladder), 'Level 1–20 ohne Leitersteuerung');
  assert.ok(LEVELS.slice(20).every((l) => l.ladder === 'manual' && l.cats.length >= 1), 'Level 21–25 manuell');
  assert.deepEqual(LEVELS.slice(20).map((l) => l.cats.length), [1, 1, 2, 2, 3]);
  briefing.levels.forEach((b, i) => {
    assert.deepEqual(LEVELS[i].fires, b.fires, `Level ${b.id} Feuer`);
    assert.deepEqual(LEVELS[i].cats, b.cats, `Level ${b.id} Katzen`);
    assert.equal(LEVELS[i].scene, b.scene);
  });
  briefing.scenes.forEach((s) => assert.deepEqual(scene(s.id).profiles, s.buildings.map((b) => b.profile)));
  assert.ok(LEVELS.slice(0, 6).every((l) => l.cats.length === 0) && LEVELS[6].cats.length === 1, 'erste Katze in Level 7');
});

test('Prüfer erkennt kaputte Leveldaten', () => {
  const bad = structuredClone(LEVELS);
  bad[7].cats[0].window = bad[7].fires[0].window;
  bad[2].fires.push({ window: 'b0-r5-c0', waterSeconds: 2 });
  bad[3].cats = [{ window: 'b0-r1-c1', unlock: 'buildingFiresCleared' }];
  const err = validateLevels(bad, SCENES).join('\n');
  assert.match(err, /doppelt/); assert.match(err, /existiert nicht/); assert.match(err, /ab Level 7/);
});

test('Aufbau: auf 360×640 jedes Fenster sichtbar, Trefferflächen groß genug, eindeutig erreichbar', () => {
  for (const v of VIEWS) for (const s of SCENES) {
    const L = layout(s, v);
    for (const b of L.buildings) {
      assert.ok(b.x >= -0.05 * v.w && b.x + b.w <= 1.05 * v.w, `Szene ${s.id} Haus ${b.b} in der Breite`);
      assert.ok(b.y >= v.top - 1, `Szene ${s.id} Haus ${b.b} unter dem HUD (${b.y.toFixed(0)} < ${v.top})`);
    }
    for (const w of L.windows) {
      assert.ok(w.hit.w >= MIN_HIT && w.hit.h >= MIN_HIT, `Szene ${s.id} ${w.id} Trefferfläche`);
      assert.ok(w.w >= 22, `Szene ${s.id} ${w.id} Fensterbild ${w.w.toFixed(1)} px`);
      assert.ok(w.cx > 0 && w.cx < v.w && w.cy > v.top && w.cy < v.ground, `Szene ${s.id} ${w.id} im Bild`);
      assert.equal(pickWindow(L.windows, w.cx, w.cy).id, w.id, `Szene ${s.id} ${w.id} in seiner Mitte treffbar`);
    }
    // Fensterbilder überlappen sich nicht
    for (const a of L.windows) for (const c of L.windows) if (a !== c) {
      const o = a.x < c.x + c.w && c.x < a.x + a.w && a.y < c.y + c.h && c.y < a.y + a.h;
      assert.ok(!o, `Szene ${s.id}: ${a.id} überlappt ${c.id}`);
    }
  }
});

test('Jeder Level ist ohne Scheitern spielbar: Feuer löschen, Katzen retten, Sieg erst am Ende', () => {
  for (const lv of LEVELS) {
    const st = newState(lv);
    // Katzen sind gesperrt, solange ihr Haus brennt
    st.cats.forEach((c, i) => assert.equal(isManual(lv) ? startManualRescue(st, i) : tapCat(st, i), 'locked', `L${lv.id} Katze ${i} gesperrt`));
    for (const f of st.fires) {
      let t = 0;
      while (f.left > 0) { spray(st, f.win, 1 / 60); t += 1 / 60; assert.ok(t < 10); }
      assert.ok(Math.abs(t - f.total) < 0.05, `L${lv.id} ${f.win}: ${t.toFixed(2)} s statt ${f.total}`);
      assert.equal(checkWin(st), st.fires.every((x) => x.left === 0) && st.cats.length === 0 ? true : false);
    }
    assert.equal(firesOut(st), st.fires.length);
    st.cats.forEach((c, i) => {
      assert.ok(catUnlocked(st, i));
      const man = isManual(lv), go = (k) => (man ? startManualRescue(st, k, 1.6) : tapCat(st, k));
      assert.equal(go(i), 'start');
      if (man) { st.rescue.from = { x: 1, y: 1 }; st.rescue.to = { x: 2, y: 2 }; }
      if (st.cats[i + 1]) assert.equal(go(i + 1), 'busy', 'nur eine Rettung gleichzeitig');
      let t = 0, arrived = false;
      while (st.rescue) {
        const ev = stepRescue(st, 1 / 60); t += 1 / 60;
        if (ev.includes('arrive')) { arrived = true; assert.equal(catsDown(st), i + 1, 'Zähler steigt bei Ankunft unten'); }
        if (!arrived) assert.ok(catsDown(st) === i, 'Zähler noch nicht vorher');
        if (st.rescue) assert.equal(checkWin(st), false, 'kein Sieg während der Rettung');
      }
      assert.ok(Math.abs(t - (man ? RESCUE_M.dock + RESCUE_M.hop + 1.6 + RESCUE_M.settle : RESCUE_TOTAL)) < 0.05);
    });
    assert.equal(checkWin(st), true, `L${lv.id} gewonnen`);
  }
});

test('Während der Rettung wirkt kein Wasser; Neustart = frischer Zustand', () => {
  const lv = LEVELS[9];
  const st = newState(lv);
  st.fires.filter((f) => f.b === buildingOf(lv.cats[0].window)).forEach((f) => { f.left = 0; });
  assert.equal(tapCat(st, 0), 'start');
  const other = st.fires.find((f) => f.left > 0);
  if (other) { const before = other.left; spray(st, other.win, 0.5); assert.equal(other.left, before); }
  const fresh = newState(lv);
  assert.equal(fresh.rescue, null); assert.ok(fresh.cats.every((c) => c.state === 'wait')); assert.ok(fresh.fires.every((f) => f.left === f.total));
});

test('Spielstand: versioniert, robust, schrittweise Freischaltung', () => {
  assert.equal(STORE, 'wassermarsch.v1');
  assert.deepEqual(sanitizeSave(null, 20), freshSave());
  assert.deepEqual(sanitizeSave({ v: 99, unlocked: 20 }, 20), freshSave());
  const s = sanitizeSave({ v: 1, unlocked: 99, done: { 1: true, 2: true, 77: true, x: true }, mute: 1 }, 20);
  assert.equal(s.unlocked, 20); assert.deepEqual(Object.keys(s.done), ['1', '2']); assert.equal(s.mute, true);
  const t = freshSave(); recordWin(t, 1, 20); assert.equal(t.unlocked, 2); recordWin(t, 20, 20); assert.equal(t.unlocked, 20);
  assert.equal(sanitizeSave({ v: 1, unlocked: 1, done: { 5: true } }, 20).unlocked, 6);
});

test('Laufzeitbilder und Manifest vollständig', () => {
  const need = ['hintergrund', 'kleines-haus', 'reihenhaus', 'hochhaus-eg', 'hochhaus-etage', 'hochhaus-dach', 'fenster-0', 'fenster-1', 'fenster-2', 'fenster-3',
    'feuerwehrwagen', 'feuerwehrmann', 'arm-loeschrohr', 'leiter-segment', 'leiter-gelenk', 'korb', 'katze-wartend', 'katze-gluecklich',
    'flamme-0', 'flamme-1', 'flamme-2', 'flamme-3', 'deko-baum', 'deko-busch', 'deko-zaun', 'deko-laterne'];
  for (const k of need) {
    assert.ok(manifest[k], k);
    readFileSync(new URL(`../public/spiele/wasser-marsch/img/${k}.webp`, import.meta.url));
  }
  const html = readFileSync(new URL('../public/spiele/wasser-marsch.html', import.meta.url), 'utf8');
  assert.doesNotMatch(html, /name="robots"[^>]*noindex/, 'öffentlich gelistet');
  assert.match(html, /og:image" content="https:\/\/playsaal\.com\/bilder\/wasser-marsch-og\.jpg"/, 'Social Preview mit Schriftzug');
  readFileSync(new URL('../public/bilder/wasser-marsch-og.jpg', import.meta.url));
  readFileSync(new URL('../public/bilder/wasser-marsch.webp', import.meta.url));
  const umzug = readFileSync(new URL('../public/assets/umzug.js', import.meta.url), 'utf8');
  assert.match(umzug, /prefix: 'wassermarsch\.'/, 'Spielstand-Umzug kennt das Spiel');
});

// ---------- Leitersteuerung (Level 21–25) ----------
const KORB = manifest.korb.core, KATZE = manifest['katze-wartend'].core;
const geoms = (v) => {
  const H = v.ground + (v.h - v.ground), geo = truckGeometry(v.w, v.h, v.ground);
  return { H, geo };
};
const VIEWS2 = [{ w: 360, h: 640, top: 64, ground: 517 }, { w: 390, h: 844, top: 74, ground: 682 }, { w: 320, h: 570, top: 64, ground: 460 }, { w: 412, h: 915, top: 80, ground: 740 }];
function setup(sc, v) {
  const L = layout(scene(sc), v), { geo } = geoms(v);
  const minWinH = Math.min(...L.windows.map((w) => w.h));
  const bg = basketGeom(geo.truck.w, minWinH, KORB[2] / KORB[3], KATZE[2] / KATZE[3]);
  const basket = { w: bg.bw, h: bg.bh, bw: bg.bw, bh: bg.bh };
  return { L, geo, basket, reach: makeReach(geo, v, basket) };
}

test('Leitersteuerung: jedes Katzenfenster in 21–25 ist auf allen Ansichten erreichbar, ohne Klemmen', () => {
  for (const v of VIEWS2) for (const lv of LEVELS.filter(isManual)) {
    const { L, basket, reach } = setup(lv.scene, v);
    for (const c of lv.cats) {
      const tip = basketTip(L.byId[c.window], basket, v.w), cl = clampTip(reach, tip);
      assert.ok(Math.hypot(cl.x - tip.x, cl.y - tip.y) < 0.5, `L${lv.id} ${c.window} @${v.w}×${v.h}: Ziel liegt außerhalb der Reichweite (${tip.x.toFixed(0)},${tip.y.toFixed(0)} → ${cl.x.toFixed(0)},${cl.y.toFixed(0)})`);
      assert.ok(tip.y - basket.bh > v.top - 1, `L${lv.id} ${c.window}: Korb unter HUD`);
    }
  }
});

test('Leitersteuerung: kein Katzenfenster liegt so nah an der Ruhelage, dass der Korb beim Greifen sofort einrastet', () => {
  for (const v of VIEWS2) for (const lv of LEVELS.filter(isManual)) {
    const { L, geo, basket } = setup(lv.scene, v), r = snapRadius(basket);
    for (const c of lv.cats) {
      const tip = basketTip(L.byId[c.window], basket, v.w), d = Math.hypot(tip.x - geo.restTip.x, tip.y - geo.restTip.y);
      assert.ok(d >= r * 1.4, `L${lv.id} ${c.window} @${v.w}×${v.h}: ${d.toFixed(0)} px von der Ruhelage, Einrastradius ${r.toFixed(0)}`);
    }
    // Katzenfenster einer Stufe rasten nicht ineinander (Abstand ≥ 1,4 Radien)
    for (const a of lv.cats) for (const b of lv.cats) if (a !== b) {
      const p = basketTip(L.byId[a.window], basket, v.w), q = basketTip(L.byId[b.window], basket, v.w);
      assert.ok(Math.hypot(p.x - q.x, p.y - q.y) >= r * 1.4, `L${lv.id} ${a.window}/${b.window} @${v.w}×${v.h} zu nah beieinander`);
    }
  }
});

test('Leitersteuerung: Klemmen hält Spitze im Bereich; Ruhelage ist erlaubt; weit entfernte Punkte werden auf Reichweite gezogen', () => {
  const v = VIEWS2[0], { geo, reach } = setup(3, v);
  const rest = clampTip(reach, geo.restTip);
  assert.ok(Math.hypot(rest.x - geo.restTip.x, rest.y - geo.restTip.y) < 0.5);
  for (const p of [{ x: -50, y: -50 }, { x: 999, y: 999 }, { x: 0, y: 700 }, { x: 180, y: 10 }, { x: 321, y: 536 }]) {
    const c = clampTip(reach, p), l = Math.hypot(reach.base.x - c.x, reach.base.y - c.y);
    assert.ok(c.x >= reach.minX - 0.01 && c.x <= reach.maxX + 0.01 && c.y >= reach.minY - 0.01 && c.y <= reach.maxY + 0.01, 'im Bildschirm');
    assert.ok(l >= reach.minL - 0.5 && l <= reach.maxL + 0.5, 'Länge im Bereich');
    assert.ok(c.y <= geo.restTip.y + 0.01, 'nie unter Ruhehöhe');
  }
});

test('Leitersteuerung: Einrasten – nur freigegebene, wartende Katze; großzügiger Radius; keine Doppelzählung', () => {
  const lv = LEVELS[22], v = VIEWS2[0], { L, basket } = setup(lv.scene, v);   // Level 23
  const st = newState(lv), targets = Object.fromEntries(lv.cats.map((c) => [c.window, basketTip(L.byId[c.window], basket, v.w)]));
  const r = snapRadius(basket);
  assert.ok(r >= 56 && r <= 84);
  const t0 = targets[lv.cats[0].window];
  assert.equal(pickSnap(st, targets, t0, r), -1, 'Haus brennt noch');
  for (const f of st.fires) f.left = 0;
  assert.equal(pickSnap(st, targets, t0, r), 0);
  const t1 = targets[lv.cats[1].window], dd = Math.hypot(t0.x - t1.x, t0.y - t1.y), ux = (t0.x - t1.x) / dd, uy = (t0.y - t1.y) / dd;
  const away = (p, d) => ({ x: p.x + ux * d, y: p.y + uy * d });   // vom zweiten Fenster weg
  const near = away(t0, r * 0.9), far = away(t0, r + 30);
  assert.ok(Math.hypot(near.x - t1.x, near.y - t1.y) > r, 'Testpunkt liegt nicht beim zweiten Fenster');
  assert.equal(pickSnap(st, targets, near, r), 0, 'knapp daneben reicht');
  assert.equal(pickSnap(st, targets, far, r), -1, 'zu weit weg');
  assert.equal(startManualRescue(st, 0, 1.6), 'start');
  assert.equal(pickSnap(st, targets, t0, r), -1, 'während der Rettung kein weiteres Einrasten');
  assert.equal(startManualRescue(st, 0), 'done', 'dieselbe Katze nicht doppelt'); assert.equal(startManualRescue(st, 1), 'busy');
  assert.equal(grabbable(st), false, 'Korb während der Rettung nicht greifbar');
  assert.equal(tapCat(st, 1), 'manual', 'Antippen startet in 21–25 nichts');
  let arrives = 0, t = 0;
  while (st.rescue) { const ev = stepRescue(st, 1 / 60); t += 1 / 60; arrives += ev.filter((e) => e === 'arrive').length; assert.ok(t < 10); assert.equal(catsDown(st), arrives); }
  assert.equal(arrives, 1); assert.equal(catsDown(st), 1);
  assert.equal(startManualRescue(st, 0), 'done', 'schon gerettet');
  assert.equal(pickSnap(st, targets, t0, r), -1, 'gerettete Katze rastet nie wieder ein');
  assert.ok(grabbable(st), 'zweite Katze greifbar');
  assert.equal(pickSnap(st, targets, targets[lv.cats[1].window], r), 1);
});

test('Leitersteuerung: Greifzonen großzügig, Phasen und Rückfahrzeit', () => {
  const v = VIEWS2[0], { geo, basket } = setup(3, v), tip = geo.restTip;
  assert.equal(grabZone(tip, basket, { x: tip.x, y: tip.y - basket.bh * 0.46 }), 'tight');
  assert.equal(grabZone(tip, basket, { x: tip.x + basket.bw / 2 + 18, y: tip.y - basket.bh * 0.46 }), 'wide');
  assert.equal(grabZone(tip, basket, { x: tip.x + 120, y: tip.y - 120 }), null);
  const r = { cat: 0, t: 0, manual: true, retractDur: retractTime(300) };
  assert.equal(rescuePhaseOf(r).phase, 'dock');
  r.t = RESCUE_M.dock + 0.01; assert.equal(rescuePhaseOf(r).phase, 'hop');
  r.t = RESCUE_M.dock + RESCUE_M.hop + 0.01; assert.equal(rescuePhaseOf(r).phase, 'retract');
  r.t += r.retractDur; assert.equal(rescuePhaseOf(r).phase, 'settle');
  assert.equal(retractTime(10), 1.2); assert.equal(retractTime(9999), 2.4);
  assert.equal(rescuePhaseOf({ cat: 0, t: 0.1 }).phase, 'extend', 'Level 1–20 unverändert');
});

test('Leitersteuerung: Level 1–20 behalten ihre Bedienung; Spielstand bleibt gültig', () => {
  for (const lv of LEVELS.slice(0, 20)) {
    const st = newState(lv);
    assert.equal(st.manual, false);
    if (st.cats.length) { for (const f of st.fires) f.left = 0; assert.equal(tapCat(st, 0), 'start', `L${lv.id}`); assert.equal(startManualRescue(newState(lv), 0), 'none'); }
    assert.equal(grabbable(st), false);
  }
  // Spielstand eines Kindes, das 20 Level geschafft hat: Level 21 ist automatisch offen, Format v1 unverändert
  const done = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [i + 1, true]));
  const s = sanitizeSave({ v: 1, unlocked: 20, done, mute: false }, LEVEL_COUNT);
  assert.equal(s.unlocked, 21); assert.equal(s.v, 1); assert.equal(Object.keys(s.done).length, 20);
  assert.equal(sanitizeSave({ v: 1, unlocked: 20, done: { 1: true } }, LEVEL_COUNT).unlocked, 20, 'alter Stand ohne 20 bleibt wie er war');
  const t = freshSave(); recordWin(t, 25, LEVEL_COUNT); assert.equal(t.unlocked, 25);
});
