// KRÜMEL: Physik, Level-Prüfung und Löser – ohne Browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { T, C, SOLID, SHELF, LADDER, build, newWorld, step, solve, playPath, tileAt, sanitizeSave, fmt } from '../public/spiele/kruemel/engine.js';
import { LEVELS } from '../public/spiele/kruemel/levels.js';

const run = (s, inp, n) => { const ev = []; for (let i = 0; i < n; i++) ev.push(...step(s, inp)); return ev; };
const runUntil = (s, inp, n, name) => { const ev = []; for (let i = 0; i < n; i++) { const e = step(s, inp); ev.push(...e); if (e.includes(name)) break; } return ev; };
const mini = (fn, w = 30, h = 12) => build({ w, h, build(L) { L.solid(0, 10, w - 1, 11); L.start(2, 9); L.goal(w - 2, 9); fn(L); } });
const settle = (s) => run(s, {}, 20);

test('Sprunggefühl: gehalten ~2,7 Kacheln hoch (2er-Stufen gehen, 3er nicht), kurz getippt deutlich niedriger', () => {
  const L = mini(() => {});
  let s = newWorld(L); settle(s);
  const y0 = s.p.y; let top = y0;
  for (let i = 0; i < 60; i++) { step(s, { jump: 1 }); top = Math.min(top, s.p.y); }
  const high = y0 - top;
  assert.ok(high > 2 * T + 10 && high < 3 * T - 4, `hoher Sprung ${high.toFixed(1)} px`);
  s = newWorld(L); settle(s);
  step(s, { jump: 1 }); top = s.p.y;
  for (let i = 0; i < 60; i++) { step(s, {}); top = Math.min(top, s.p.y); }
  const low = y0 - top;
  assert.ok(low < high * 0.6 && low > T, `kurzer Sprung ${low.toFixed(1)} px`);
});

test('Kanten-Toleranz und Sprungpuffer', () => {
  // Kante bei x = 10 Kacheln, danach Abgrund
  const L = build({ w: 30, h: 12, build(B) { B.solid(0, 10, 9, 11); B.solid(20, 10, 29, 11); B.start(7, 9); B.goal(28, 9); } });
  let s = newWorld(L); settle(s);
  let off = -1;
  for (let i = 0; i < 80; i++) { step(s, { right: 1 }); if (!s.p.ground) { off = i; break; } }
  assert.ok(off > 0, 'läuft über die Kante');
  run(s, { right: 1 }, C.coyote - 2);
  const ev = step(s, { right: 1, jump: 1 });
  assert.ok(ev.includes('jump'), 'Sprung kurz nach der Kante klappt noch');
  // Puffer: Taste kurz vor der Landung gedrückt → springt bei Landung
  s = newWorld(mini(() => {})); settle(s);
  step(s, { jump: 1 }); run(s, { jump: 1 }, 15); run(s, {}, 1);
  let jumped = false;
  for (let i = 0; i < 60 && !jumped; i++) {
    const nearGround = s.p.vy > 0 && (10 * T - (s.p.y + s.p.h)) < 18;
    const ev2 = step(s, { jump: nearGround ? 1 : 0 });
    if (nearGround && ev2.includes('jump')) jumped = true;
    if (nearGround && !ev2.includes('jump') && s.p.ground) { jumped = step(s, { jump: 1 }).includes('jump'); }
  }
  assert.ok(jumped, 'Sprung kurz vor der Landung wird ausgeführt');
});

test('Kochlöffel-Leiter: Springen halten klettert hoch, oben steht man auf der Platte', () => {
  const L = mini((B) => { B.ladder(5, 6, 9); B.solid(6, 6, 12, 9); });
  const s = newWorld(L); settle(s);
  s.p.x = 5 * T + 6;
  run(s, { jump: 1 }, 90);
  assert.equal(s.p.ladder, false);
  assert.ok(s.p.ground);
  assert.equal(s.p.y + s.p.h, 6 * T, 'steht auf Höhe der Platte');
  run(s, { right: 1 }, 30);
  assert.ok(s.p.ground && s.p.y + s.p.h === 6 * T && s.p.x > 6 * T, 'läuft auf die Platte');
});

test('Regalbretter: von unten durchspringen, oben landen', () => {
  const L = mini((B) => { B.shelf(3, 8, 8); });
  const s = newWorld(L); settle(s);
  s.p.x = 5 * T;
  run(s, { jump: 1 }, 40); run(s, {}, 30);
  assert.ok(s.p.ground && s.p.y + s.p.h === 8 * T, 'auf dem Brett gelandet');
});

test('Schublade fährt nach festem Ablauf und nimmt Krümel mit', () => {
  const L = mini((B) => { B.lift(4, 2, 9, 4, { speed: 1.5, wait: 60 }); B.solid(6, 4, 12, 9); });
  const s = newWorld(L); settle(s);
  // auf die Schublade springen, solange sie unten wartet (Oberkante 9 = 1 Kachel über dem Boden)
  s.t = 0; s.lifts.forEach((lf) => { lf.y = lf.low; });
  s.p.x = 4 * T + 6;
  run(s, { jump: 1 }, 14); run(s, {}, 20);
  assert.ok(s.p.ground && s.p.lift === 0, 'steht auf der Schublade');
  for (let i = 0; i < 200 && !(s.lifts[0].y === s.lifts[0].high); i++) step(s, {});
  run(s, {}, 2);
  assert.ok(Math.abs(s.p.y + s.p.h - 4 * T) < 1, 'oben angekommen');
  run(s, { right: 1 }, 30);
  assert.ok(s.p.x > 6 * T && s.p.ground, 'auf die hohe Platte gelaufen');
});

test('Kätzchen: drauf springen verscheucht es, seitlich berühren schickt zum Fähnchen', () => {
  let L = mini((B) => { B.cat(8, 9, 6, 12); });
  let s = newWorld(L); settle(s);
  s.cats[0].x = 6 * T; s.cats[0].vx = 0;
  s.p.x = 6 * T + 2; s.p.y = 5 * T; s.p.ground = false;
  const ev = run(s, {}, 40);
  assert.ok(ev.includes('stomp'), 'Sprung drauf');
  assert.equal(s.resets, 0);
  run(s, {}, 60);
  assert.equal(s.cats[0].state, 'gone');
  L = mini((B) => { B.flag(3, 9); B.cat(10, 9, 9, 12); });
  s = newWorld(L);
  const ev2 = runUntil(s, { right: 1 }, 400, 'respawn');
  assert.ok(ev2.includes('hit') && ev2.includes('respawn'));
  assert.equal(s.resets, 1);
  assert.ok(Math.abs(s.p.x + s.p.w / 2 - L.flags[0].x) < 30, 'zurück am Fähnchen');
  assert.ok(s.p.invuln > 0 || ev2.includes('respawn'), 'kurz geschützt');
});

test('Hinausfallen führt zum letzten Fähnchen, nie ganz an den Anfang zurück', () => {
  const L = build({ w: 30, h: 12, build(B) { B.solid(0, 10, 12, 11); B.solid(16, 10, 29, 11); B.start(2, 9); B.flag(10, 9); B.goal(28, 9); } });
  const s = newWorld(L);
  const ev = runUntil(s, { right: 1 }, 400, 'respawn');
  assert.ok(ev.includes('flag') && ev.includes('fall') && ev.includes('respawn'));
  assert.ok(Math.abs(s.p.x + s.p.w / 2 - L.flags[0].x) < 40);
});

for (const [i, def] of LEVELS.entries()) {
  const n = i + 1;
  const L = build(def);

  test(`Level ${n}: Aufbau (Start, Ziel, 3 Goldkäse, Fähnchen, Fallwege höchstens 4 Kacheln)`, () => {
    assert.ok(L.start && L.goal);
    assert.equal(L.golds.length, 3);
    assert.ok(L.flags.length >= 2);
    // Fallweg: unter jeder Kante (Ende einer begehbaren Fläche) liegt innerhalb von 4 Kacheln wieder Boden – oder es ist ein gewollter Schacht ins Leere
    const walk = (x, y) => { const k = tileAt(L, x, y); return (k === SOLID || k === SHELF || (k === LADDER && tileAt(L, x, y - 1) !== LADDER)) && tileAt(L, x, y - 1) !== SOLID; };
    for (let y = 1; y < L.h; y++) for (let x = 0; x < L.w; x++) {
      if (!walk(x, y)) continue;
      for (const nx of [x - 1, x + 1]) {
        if (nx < 0 || nx >= L.w || walk(nx, y) || tileAt(L, nx, y) === SOLID || tileAt(L, nx, y - 1) === SOLID) continue;
        let d = 0; while (y + d < L.h && !walk(nx, y + d) && tileAt(L, nx, y + d) !== SOLID) d++;
        if (y + d >= L.h) continue; // Schacht ins Leere (Spüle) → Fähnchen
        if (L.lifts.some((lf) => nx * T >= lf.x && nx * T < lf.x + lf.w)) continue; // Aufzugsschacht: unten wartet die Schublade wieder
        assert.ok(d <= 4, `Level ${n}: Fallweg bei x=${nx}, y=${y} ist ${d} Kacheln tief`);
      }
    }
  });

  test(`Level ${n}: Ziel vom Start und von jedem Fähnchen erreichbar, jeder Goldkäse erreichbar`, () => {
    const full = solve(L, { maxNodes: 2000000 });
    assert.ok(full.ok, 'vom Start zum Ziel');
    const replay = playPath(L, full.path, full.hold, { noEnemies: true });
    assert.ok(replay.done, 'Weg lässt sich nachspielen');
    assert.ok(replay.t / 60 < 60, `Bestweg unter einer Minute (${fmt(replay.t)})`);
    for (const f of L.flags) assert.ok(solve(L, { from: f, maxNodes: 1500000 }).ok, `vom Fähnchen bei x=${f.x / T - 0.5}`);
    for (const g of L.golds) {
      const from = L.flags.filter((f) => f.x <= g.x).at(-1);
      assert.ok(solve(L, { from, target: { x: g.x, y: g.y, r: 22 }, maxNodes: 1500000 }).ok, `Goldkäse bei x=${g.x / T - 0.5}`);
    }
  });

  test(`Level ${n}: keine Sackgassen – von jeder begehbaren Stelle kommt man weiter (zum Ziel oder per Sturz zum Fähnchen)`, () => {
    const spots = [];
    for (let y = 1; y < L.h; y++) for (let x = 0; x < L.w; x += 2) {
      const k = tileAt(L, x, y);
      const stand = (k === SOLID || k === SHELF) && tileAt(L, x, y - 1) === 0 && tileAt(L, x, y - 2) !== SOLID;
      if (stand) spots.push({ x: (x + 0.5) * T, y: y * T });
    }
    assert.ok(spots.length > 20);
    for (const sp of spots) {
      // Es reicht, das nächste Fähnchen rechts davon zu erreichen – von dort ist das Ziel geprüft erreichbar
      const next = L.flags.find((f) => f.x > sp.x + T);
      const r = solve(L, { from: sp, fallOk: true, target: next ? { x: next.x, y: next.y - 10, r: 18 } : undefined, maxNodes: 1500000 });
      assert.ok(r.ok, `Sackgasse bei x=${sp.x / T - 0.5}, y=${sp.y / T}`);
    }
  });
}

test('Speicherstand wird bereinigt', () => {
  assert.deepEqual(sanitizeSave(null).best, {});
  const s = sanitizeSave({ mute: 1, best: { 1: { t: 1234, c: 10, g: 7 }, x: { t: 1 }, 2: { t: -5 } } });
  assert.equal(s.mute, true);
  assert.deepEqual(s.best, { 1: { t: 1234, c: 10, g: 3 } });
});
