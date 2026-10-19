import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SCENES, LEVELS, LEVEL_COUNT } from '../public/spiele/wasser-marsch/levels.js';
import {
  STORE, MIN_HIT, RESCUE_TOTAL, layout, pickWindow, validateLevels, newState, spray, tapCat, stepRescue,
  checkWin, catUnlocked, firesOut, catsDown, freshSave, sanitizeSave, recordWin, buildingOf
} from '../public/spiele/wasser-marsch/engine.js';

const briefing = JSON.parse(readFileSync(new URL('../design/wasser-marsch/briefing/levels.json', import.meta.url), 'utf8'));
const manifest = JSON.parse(readFileSync(new URL('../public/spiele/wasser-marsch/img/manifest.json', import.meta.url), 'utf8'));
const scene = (id) => SCENES.find((s) => s.id === id);
// kleinste Zielansicht 360×640 (HUD ~12 %, Gehweg bei 80,8 %) und ein hohes Handy
const VIEWS = [{ w: 360, top: 64, ground: 517 }, { w: 390, top: 74, ground: 682 }, { w: 320, top: 64, ground: 460 }];

test('20 gültige Level in 6 Szenen, Daten 1:1 aus dem Briefing', () => {
  assert.equal(LEVEL_COUNT, 20);
  assert.deepEqual(validateLevels(LEVELS, SCENES), []);
  assert.deepEqual(LEVELS.map((l) => l.id), Array.from({ length: 20 }, (_, i) => i + 1));
  assert.deepEqual([...new Set(LEVELS.map((l) => l.scene))].sort(), [1, 2, 3, 4, 5, 6]);
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
    st.cats.forEach((c, i) => assert.equal(tapCat(st, i), 'locked', `L${lv.id} Katze ${i} gesperrt`));
    for (const f of st.fires) {
      let t = 0;
      while (f.left > 0) { spray(st, f.win, 1 / 60); t += 1 / 60; assert.ok(t < 10); }
      assert.ok(Math.abs(t - f.total) < 0.05, `L${lv.id} ${f.win}: ${t.toFixed(2)} s statt ${f.total}`);
      assert.equal(checkWin(st), st.fires.every((x) => x.left === 0) && st.cats.length === 0 ? true : false);
    }
    assert.equal(firesOut(st), st.fires.length);
    st.cats.forEach((c, i) => {
      assert.ok(catUnlocked(st, i));
      assert.equal(tapCat(st, i), 'start');
      if (st.cats[i + 1]) assert.equal(tapCat(st, i + 1), 'busy', 'nur eine Rettung gleichzeitig');
      let t = 0, arrived = false;
      while (st.rescue) {
        const ev = stepRescue(st, 1 / 60); t += 1 / 60;
        if (ev.includes('arrive')) { arrived = true; assert.equal(catsDown(st), i + 1, 'Zähler steigt bei Ankunft unten'); }
        if (!arrived) assert.ok(catsDown(st) === i, 'Zähler noch nicht vorher');
        if (st.rescue) assert.equal(checkWin(st), false, 'kein Sieg während der Rettung');
      }
      assert.ok(Math.abs(t - RESCUE_TOTAL) < 0.05);
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
  assert.match(html, /<meta name="robots" content="noindex/, 'noch nicht beworben');
  const umzug = readFileSync(new URL('../public/assets/umzug.js', import.meta.url), 'utf8');
  assert.match(umzug, /prefix: 'wassermarsch\.'/, 'Spielstand-Umzug kennt das Spiel');
});
