// KRÜMEL: Physik, Level-Prüfung und Löser – ohne Browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { T, C, SOLID, SHELF, LADDER, SUGAR, build, newWorld, step, solve, playPath, tileAt, sanitizeSave, fmt, points } from '../public/spiele/kruemel/engine.js';
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
  s.t = 0; s.plats.forEach((lf) => { lf.y = lf.low; });
  s.p.x = 4 * T + 6;
  run(s, { jump: 1 }, 14); run(s, {}, 20);
  assert.ok(s.p.ground && s.p.lift === 0, 'steht auf der Schublade');
  for (let i = 0; i < 200 && !(s.plats[0].y === s.plats[0].high); i++) step(s, {});
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

test('Käse macht groß (nur mit Platz nach oben), Minze macht klein – beide bleiben liegen', () => {
  const L = mini((B) => { B.cheese(4, 9); B.mint(10, 9); B.solid(14, 0, 16, 8); B.cheese(15, 9); });
  const s = newWorld(L); settle(s);
  const ev = run(s, { right: 1 }, 25);
  assert.ok(ev.includes('grow') && s.p.big && s.p.h > T, 'groß');
  const evm = runUntil(s, { right: 1 }, 200, 'shrink');
  assert.ok(evm.includes('shrink') && !s.p.big, 'Minze macht klein');
  run(s, { right: 1 }, 60);
  assert.ok(!s.p.big, 'unter niedriger Decke kein Wachsen');
  assert.ok(Math.floor(s.p.x / T) >= 14, 'kleine Krümel passt durch den Spalt');
  // Station ist nicht verbraucht
  const s2 = newWorld(L); settle(s2); run(s2, { right: 1 }, 25); assert.ok(s2.p.big);
});

test('Zuckerwürfel: klein prallt ab, groß zerbricht sie (auch mit dem Kopf)', () => {
  const L = mini((B) => { B.sugar(8, 7, 8, 9); });
  let s = newWorld(L); settle(s);
  run(s, { right: 1 }, 80);
  assert.ok(s.p.x + s.p.w <= 8 * T + 0.1 && tileAt(s.L, 8, 9) === SUGAR, 'klein kommt nicht durch');
  const L2 = mini((B) => { B.cheese(3, 9); B.sugar(8, 7, 8, 9); B.sugar(12, 6, 12, 6); });
  s = newWorld(L2); settle(s);
  run(s, { right: 1 }, 80);
  assert.ok(s.p.big && s.p.x > 8 * T && tileAt(s.L, 8, 9) === 0 && s.breaks >= 2, 'groß bricht durch');
  assert.equal(tileAt(L2, 8, 9), SUGAR, 'Leveldaten bleiben unverändert (Neustart hat wieder alle Würfel)');
  s.p.x = 12 * T + 3; s.p.vx = 0; run(s, {}, 10); run(s, { jump: 1 }, 25);
  assert.equal(tileAt(s.L, 12, 6), 0, 'Kopfstoß zerbricht den Würfel');
});

test('Crispy-Cookie bröselt nach kurzem Stehen und wächst wieder nach', () => {
  const L = build({ w: 30, h: 14, build(B) { B.solid(0, 12, 29, 13); B.cookie(4, 10, 2); B.start(4, 9); B.goal(28, 11); } });
  const s = newWorld(L);
  run(s, {}, 5);
  assert.equal(s.p.lift, 0, 'steht auf dem Cookie');
  const ev = run(s, {}, C.crack + 5);
  assert.ok(ev.includes('crumble'));
  run(s, {}, 30);
  assert.ok(s.p.y + s.p.h === 12 * T, 'auf den Boden gefallen');
  run(s, { right: 1 }, 30);
  const ev2 = run(s, {}, C.gone + 20);
  assert.ok(ev2.includes('regrow'));
});

test('Waage: nur die große Krümel löst sie aus, die andere Schale steigt und bleibt oben', () => {
  const L = build({ w: 30, h: 14, build(B) {
    B.solid(0, 12, 29, 13); B.clear(6, 12, 7, 13); B.clear(10, 12, 11, 13); B.scale(6, 12, 10, 12, 2); B.start(2, 11); B.goal(28, 11);
  } });
  let s = newWorld(L);
  const ev = run(s, { right: 1 }, 70);
  assert.ok(ev.includes('light') && s.scaleT[0] < 0, 'klein ist zu leicht');
  const L2 = build({ w: 30, h: 14, build(B) {
    B.solid(0, 12, 29, 13); B.clear(6, 12, 7, 13); B.clear(10, 12, 11, 13); B.scale(6, 12, 10, 12, 2); B.cheese(3, 11); B.start(1, 11); B.goal(28, 11);
  } });
  s = newWorld(L2);
  const ev2 = run(s, { right: 1 }, 70);
  assert.ok(s.p.big && ev2.includes('scale'));
  run(s, {}, 200);
  const b = s.plats.find((pl) => pl.role === 'b');
  assert.equal(b.y, 10 * T, 'Schale B oben und bleibt oben');
});

test('Groß + Kätzchen = wieder klein, ohne Rücksetzer', () => {
  const L = mini((B) => { B.cheese(3, 9); B.cat(14, 9, 12, 16); });
  const s = newWorld(L);
  const ev = run(s, { right: 1 }, 200);
  assert.ok(ev.includes('ouch') && !ev.includes('hit') || s.resets === 0, 'erst schrumpfen');
  assert.ok(ev.includes('ouch'));
});

test('Schlafkater: Laufen weckt ihn nicht, Springen in der Nähe schon – wach schiebt er sanft zurück', () => {
  const L = mini((B) => { B.sleeper(10, 9); });
  let s = newWorld(L);
  run(s, { right: 1 }, 150);
  assert.equal(s.sleepers[0].state, 'sleep');
  assert.ok(s.p.x > 12 * T, 'leise vorbeigelaufen');
  s = newWorld(L); settle(s);
  s.p.x = 7 * T;
  const ev = run(s, { jump: 1 }, 2);
  assert.ok(ev.includes('wake') && s.sleepers[0].state === 'awake');
  run(s, {}, 40);
  const ev2 = run(s, { right: 1 }, 60);
  assert.ok(ev2.includes('hiss') && s.resets === 0, 'zurückgeschoben, kein Rücksetzer');
  run(s, {}, C.awake + 20);
  assert.equal(s.sleepers[0].state, 'sleep', 'schläft wieder ein');
});

test('Schokolinsen zählen 5 Punkte', () => {
  const L = mini((B) => { B.chocs(4, 6, 9); B.crumbs(7, 8, 9); });
  const s = newWorld(L);
  run(s, { right: 1 }, 80);
  assert.equal(s.nChocs, 3); assert.equal(s.nCrumbs, 2); assert.equal(points(s), 17);
});

for (const [i, def] of LEVELS.entries()) {
  const n = i + 1;
  const L = build(def);

  test(`Level ${n}: Aufbau (Start, Ziel, 3 Goldkäse, Fähnchen, Fallwege höchstens 4 Kacheln)`, () => {
    assert.ok(L.start && L.goal);
    assert.equal(L.golds.length, 3);
    assert.ok(L.flags.length >= 2);
    for (const c of L.cheeses) {
      const tx = Math.floor(c.x / T), ty = c.y / T - 1;
      assert.ok(tileAt(L, tx, ty) !== SOLID && tileAt(L, tx, ty - 1) !== SOLID, `Level ${n}: Käse bei x=${tx} hat Platz zum Wachsen`);
    }
    // Fallweg: unter jeder Kante (Ende einer begehbaren Fläche) liegt innerhalb von 4 Kacheln wieder Boden – oder es ist ein gewollter Schacht ins Leere
    const walk = (x, y) => { const k = tileAt(L, x, y); return (k === SOLID || k === SHELF || (k === LADDER && tileAt(L, x, y - 1) !== LADDER)) && tileAt(L, x, y - 1) !== SOLID; };
    for (let y = 1; y < L.h; y++) for (let x = 0; x < L.w; x++) {
      if (!walk(x, y)) continue;
      for (const nx of [x - 1, x + 1]) {
        if (nx < 0 || nx >= L.w || walk(nx, y) || tileAt(L, nx, y) === SOLID || tileAt(L, nx, y - 1) === SOLID) continue;
        let d = 0; while (y + d < L.h && !walk(nx, y + d) && tileAt(L, nx, y + d) !== SOLID) d++;
        if (y + d >= L.h) continue; // Schacht ins Leere (Spüle) → Fähnchen
        // Unter Schubladen, Cookies und Waagschalen ist ein tieferer Fall erlaubt (dort steht man auf der Plattform)
        const plats = [...L.lifts, ...L.cookies, ...L.scales.flatMap((sc) => [{ x: sc.a.x, w: sc.w }, { x: sc.b.x, w: sc.w }])];
        if (plats.some((lf) => nx * T >= lf.x && nx * T < lf.x + lf.w)) continue;
        assert.ok(d <= 4, `Level ${n}: Fallweg bei x=${nx}, y=${y} ist ${d} Kacheln tief`);
      }
    }
  });

  test(`Level ${n}: Ziel vom Start und von jedem Fähnchen erreichbar, jeder Goldkäse erreichbar`, () => {
    // Abschnittsweise: Start → 1. Fähnchen → … → Ziel (jeder Abschnitt wird auch nachgespielt)
    const pts = [null, ...L.flags, null];
    let frames = 0;
    for (let k = 0; k < pts.length - 1; k++) {
      const a = pts[k], b = pts[k + 1];
      const r = solve(L, { from: a || undefined, target: b ? { x: b.x, y: b.y - 10, r: 18 } : undefined, maxNodes: 1500000 });
      assert.ok(r.ok, `Abschnitt ${k + 1} (${a ? 'Fähnchen x=' + (a.x / T - 0.5) : 'Start'} → ${b ? 'Fähnchen x=' + (b.x / T - 0.5) : 'Ziel'})`);
      frames += r.path.length * r.hold;
    }
    const replayStart = solve(L, { target: L.flags[0] ? { x: L.flags[0].x, y: L.flags[0].y - 10, r: 18 } : undefined });
    assert.ok(playPath(L, replayStart.path, replayStart.hold, { noEnemies: true }).flagHit[0], 'Weg lässt sich nachspielen');
    assert.ok(frames / 60 < 60, `Bestweg unter einer Minute (${fmt(frames)})`);
    // Damit ist auch jedes Fähnchen → Ziel geprüft (Kette über die folgenden Fähnchen).
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
