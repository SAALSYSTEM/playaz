import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LEVELS, LEVEL_COUNT } from '../public/spiele/turmschicht/levels.js';
import { C, HZ, newState, step, toggle, nearLever, ladderX, validate, solve, playPath, routeTo, starCount, freshSave, sanitizeSave, recordRun, parseChallenge, beats, centis, fmt } from '../public/spiele/turmschicht/engine.js';
import worker from '../src/worker.js';

const F = [[4, 176]];
const run = (s, ix, iy, n, act = false) => { for (let i = 0; i < n; i++) step(s, ix, iy, act && i === 0); return s; };
const base = (o) => ({ tip: 't', floors: [F, F, F, F, F], start: { x: 20 }, exit: { x: 160 }, ladders: [{ f: 0, x: 60 }, { f: 1, x: 60 }, { f: 2, x: 60 }, { f: 3, x: 60 }], stars: [{ f: 1, x: 150 }, { f: 2, x: 150 }, { f: 3, x: 150 }], ...o });

test('30 Level: gültig, beide Modi lösbar, Bot schafft beide Modi ohne Neustart, Hebel werden gebraucht', () => {
  assert.equal(LEVEL_COUNT, 30);
  LEVELS.forEach((lv, i) => {
    const n = i + 1;
    assert.deepEqual(validate(lv), [], `Level ${n}`);
    const sp = solve(lv, 's'), pf = solve(lv, 'p');
    assert.ok(sp.ok && pf.ok, `Level ${n}: Ausgang und alle Sterne erreichbar`);
    assert.ok(pf.seconds >= sp.seconds * (n <= 6 ? 1.02 : 1.35), `Level ${n}: Sternweg ist ein eigener Weg (${sp.seconds.toFixed(1)} / ${pf.seconds.toFixed(1)} s)`);
    if (n > 6 && lv.levers.length) assert.ok(!(solve(lv, 's', { noLevers: true }).ok && solve(lv, 'p', { noLevers: true }).ok), `Level ${n}: Hebel nötig`);
    for (const [mode, path] of [['s', sp.path], ['p', pf.path]]) {
      const s = playPath(lv, mode, path);
      assert.ok(s.done && !s.dead, `Level ${n} ${mode}: Bot kommt raus (Treffer ${s.hits})`);
      if (mode === 'p') assert.equal(starCount(s), 3);
    }
  });
});

test('Einführung: Steuerung, Monster, Verfolgung, Sterne, Hebel kommen nacheinander', () => {
  assert.equal(LEVELS[0].monsters, undefined); assert.equal(LEVELS[0].levers, undefined);
  assert.ok(LEVELS[1].monsters.every((m) => !m.hunt));
  assert.ok(LEVELS[2].monsters.some((m) => m.hunt));
  assert.ok(LEVELS[4].levers.length === 1 && !LEVELS[4].monsters);
  assert.ok(LEVELS[5].levers.length && LEVELS[5].monsters.some((m) => m.hunt));
  assert.ok(LEVELS.slice(14).every((l) => l.floors.length === 6), 'später sechs Etagen');
  assert.ok(LEVELS.slice(20).every((l) => l.monsters.filter((m) => m.hunt).length >= 2), 'später zwei Jäger');
});

test('Herzen: Treffer kostet eins, Rückstoß und 1,5 s Schutz, bei null Neustart', () => {
  const lv = base({ monsters: [{ f: 0, x: 120, a: 110, b: 130 }] });
  const s = newState(lv, 's');
  while (!s.events.some((e) => e.t === 'hit') && s.clock < 600) step(s, 1, 0);
  assert.equal(s.hearts, 2); assert.equal(s.inv, C.inv); assert.ok(s.knock > 0);
  const x = s.x; run(s, 0, 0, 5); assert.ok(s.x < x, 'zurückgestoßen');
  run(s, 1, 0, C.inv - 10); assert.equal(s.hearts, 2, 'geschützt');
  for (let i = 0; i < 800 && !s.dead; i++) { if (!s.inv && !s.knock) s.x = s.mons[0].x; step(s, 0, 0); } // immer wieder ins Monster
  assert.equal(s.dead, true); assert.equal(s.hits, 3);
});

test('Jäger: kündigt sich mit „!“ an, verfolgt über Leitern, Hebel kappt den Weg', () => {
  const lv = base({ floors: [F, F, F, [[4, 60], [76, 176]], F], ladders: [{ f: 0, x: 150 }, { f: 1, x: 30 }, { f: 2, x: 150 }, { f: 3, xs: [120, 30], lever: 0 }], levers: [{ f: 4, x: 140 }], monsters: [{ f: 3, x: 100, a: 90, b: 110, hunt: true }], stars: [{ f: 1, x: 100 }, { f: 2, x: 100 }, { f: 4, x: 60 }] });
  const s = newState(lv, 's'); const m = s.mons[0];
  Object.assign(s, { f: 3, x: 150, started: true });
  step(s); assert.equal(m.mode, 'alert'); assert.ok(s.events.some((e) => e.t === 'alert'));
  run(s, 0, 0, C.alert - 2); assert.equal(m.mode, 'alert', 'Ankündigung dauert');
  const before = m.x; run(s, 0, 0, 3); assert.equal(m.mode, 'chase'); assert.ok(m.x > before, 'läuft auf den Dino zu');
  // Dino flieht über die Leiter nach oben, Jäger folgt
  Object.assign(s, { inv: 999 }); while (Math.abs(s.x - 120) > 1) step(s, -1, 0);
  run(s, 0, 1, 120); assert.equal(s.f, 4);
  for (let i = 0; i < 400 && m.ladder < 0; i++) step(s, 0, 0);
  assert.ok(m.ladder >= 0, 'Jäger klettert hinterher');
  // Hebel: Leiter springt weg, Jäger landet sicher auf seiner Etage und findet keinen Weg mehr
  while (nearLever(s) < 0) step(s, 1, 0);
  step(s, 0, 0, true); assert.equal(s.levers[0], 1); assert.equal(m.ladder, -1); assert.equal(m.f, 3);
  assert.equal(routeTo(s, m.f, m.x, 4, s.x), null);
  run(s, 0, 0, C.giveUp + 5); assert.equal(m.mode, 'patrol', 'gibt auf');
});

test('Hebel: Leiter wechselt zwischen zwei festen Stellen, niemand bleibt in der Leiter hängen', () => {
  const lv = base({ ladders: [{ f: 0, xs: [60, 140], lever: 0 }, { f: 1, x: 30 }, { f: 2, x: 60 }, { f: 3, x: 60 }], levers: [{ f: 0, x: 100 }] });
  const s = newState(lv, 's');
  assert.equal(ladderX(lv.ladders[0], s.levers), 60);
  s.mons.push({ f: 0, x: 60, ladder: 0, p: 0.5, goal: 1, mode: 'chase', dir: 1, a: 0, b: 0, lost: 0 });
  toggle(s, 0); assert.equal(ladderX(lv.ladders[0], s.levers), 140);
  assert.equal(s.mons[0].ladder, -1); assert.equal(s.mons[0].f, 0, 'zurück auf die Ausgangsetage'); assert.equal(s.mons[0].x, 60);
  assert.equal(nearLever(s), -1); Object.assign(s, { x: 100 }); assert.equal(nearLever(s), 0, 'Aktionstaste nur in Reichweite');
});

test('Perfekter Lauf: Ausgang erst mit allen drei Sternen; Schneller Ausbruch sofort', () => {
  const lv = base({});
  for (const [mode, done] of [['s', true], ['p', false]]) {
    const s = newState(lv, mode); Object.assign(s, { f: 4, x: 150, started: true });
    run(s, 1, 0, 30); assert.equal(s.done, done, mode);
    if (!done) { assert.ok(s.events.some((e) => e.t === 'locked')); s.stars = 7; s.x = 158; step(s, 0, 0); assert.equal(s.done, true); }
  }
  const a = playPath(LEVELS[9], 'p', solve(LEVELS[9], 'p').path), b = playPath(LEVELS[9], 'p', solve(LEVELS[9], 'p').path);
  assert.equal(a.time, b.time, 'gleiche Eingaben, gleiche Zeit');
});

test('Spielstand und Herausforderung je Modus', () => {
  const save = freshSave();
  assert.equal(recordRun(save, 1, 's', 900, 1, 0, 30), true); assert.equal(recordRun(save, 1, 'p', 1500, 0, 3, 30), true);
  assert.equal(recordRun(save, 1, 's', 950, 0, 0, 30), false); assert.equal(save.unlocked, 2);
  assert.deepEqual(save.best[1].p, { t: 1500, hits: 0, stars: 3 });
  assert.deepEqual(sanitizeSave({ unlocked: 50, best: { 1: { s: { t: 5, hits: 1, stars: 9 } }, 40: { s: { t: 1 } } }, mode: 'x' }, 30), { v: 1, unlocked: 30, best: { 1: { s: { t: 5, hits: 1, stars: 3 } } }, mute: false, mode: 's' });
  assert.deepEqual(parseChallenge('?l=4&m=p&t=4523', 30), { l: 4, t: 4523, m: 'p' });
  for (const bad of ['?l=4&m=x&t=4523', '?l=0&m=s&t=4523', '?l=4&m=s&t=12', '?l=31&m=p&t=5000']) assert.equal(parseChallenge(bad, 30), null, bad);
  assert.equal(beats(2700, { t: centis(2701) }), true); assert.equal(beats(2700, { t: centis(2700) }), false);
  assert.equal(fmt(4523), '45,23 s');
});

test('Einbindung: Seite, Startseite, Umzug, Sitemap, Vorschautext der Herausforderung', async () => {
  const html = readFileSync(new URL('../public/spiele/turmschicht.html', import.meta.url), 'utf8');
  for (const id of ['pauseBtn', 'restartBtn', 'restartHud', 'muteBtn', 'shareBtn', 'actBtn', 'stick', 'nextBtn', 'retryBtn']) assert.ok(html.includes(`id="${id}"`), id);
  assert.ok(html.includes('class="pz-home" href="/"') && /image-rendering:pixelated/.test(html) && /touch-action:none/.test(html));
  assert.ok(readFileSync(new URL('../public/index.html', import.meta.url), 'utf8').includes('href="/spiele/turmschicht"'));
  assert.ok(readFileSync(new URL('../public/assets/umzug.js', import.meta.url), 'utf8').includes("prefix: 'turmschicht.'"));
  assert.ok(readFileSync(new URL('../public/sitemap.xml', import.meta.url), 'utf8').includes('/spiele/turmschicht<'));
  const env = { ASSETS: { fetch: async () => new Response(html, { headers: { 'Content-Type': 'text/html' } }) } };
  const out = await (await worker.fetch(new Request('https://playsaal.com/spiele/turmschicht?l=4&m=p&t=4523'), env)).text();
  assert.ok(out.includes('content="Turmschicht Level 4 · Perfekter Lauf: 45,23 s – schaffst du es schneller?"'));
  const plain = await (await worker.fetch(new Request('https://playsaal.com/spiele/turmschicht?l=4&m=q&t=4523'), env)).text();
  assert.ok(plain.includes('content="Turmschicht · Retro-Kletterspiel"'));
});
