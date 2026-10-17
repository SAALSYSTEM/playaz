import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LEVELS, LEVEL_COUNT } from '../public/spiele/dino-leiterhelden/levels.js';
import { C, HZ, layout, newState, step, validate, solve, playPath, nutDanger, freshSave, sanitizeSave, recordRun, parseChallenge, beats, centis, fmt } from '../public/spiele/dino-leiterhelden/engine.js';
import worker from '../src/worker.js';

const run = (s, ix, iy, ticks) => { for (let i = 0; i < ticks; i++) step(s, ix, iy); return s; };
const lv = (o) => ({ tip: { icon: '·', text: 'Test' }, ladders: [], door: { x: 820 }, start: { f: 0, x: 100 }, friends: [{ f: 0, x: 300 }, { f: 0, x: 500 }, { f: 0, x: 700 }], ...o });

test('30 gültige Level: Freunde erreichbar, Tür lösbar, jede Mechanik wird gebraucht, Bot schafft jedes ohne Rücksetzer', () => {
  assert.equal(LEVEL_COUNT, 30);
  LEVELS.forEach((level, i) => {
    const n = i + 1;
    assert.deepEqual(validate(level), [], `Level ${n}`);
    assert.equal(level.friends.length, 3);
    const sol = solve(level);
    assert.ok(sol.ok, `Level ${n} lösbar`);
    const end = sol.path.at(-1);
    assert.equal(end.fed, (1 << (level.monsters || []).length) - 1, `Level ${n}: alle Monster nötig`);
    assert.equal(end.on, (1 << (level.levers || []).length) - 1, `Level ${n}: alle Hebel nötig`);
    const s = playPath(level, sol.path);
    assert.ok(s.done, `Level ${n}: Bot erreicht die Tür`);
    assert.equal(s.resets, 0, `Level ${n}: Bot weicht Kokosnüssen aus`);
    assert.ok(s.time / HZ < 60, `Level ${n}: Bestweg unter einer Minute (${(s.time / HZ).toFixed(1)} s)`);
  });
});

test('Schwierigkeit steigt: frühe Level erklären je eine Sache, spätere haben mehr Etagen und Wege', () => {
  const mech = (l) => ['monsters', 'fruits', 'levers', 'nuts'].filter((k) => (l[k] || []).length);
  assert.equal(LEVELS[0].floors.length, 1); assert.equal(LEVELS[0].ladders.length, 0);
  assert.deepEqual(mech(LEVELS[1]), []); assert.deepEqual(mech(LEVELS[5]), ['monsters', 'fruits']);
  assert.deepEqual(mech(LEVELS[6]), ['nuts']); assert.deepEqual(mech(LEVELS[7]), ['levers']);
  assert.ok(LEVELS.slice(20).every((l) => l.floors.length === 6));
  const t = (n) => solve(LEVELS[n - 1]).seconds;
  assert.ok(t(1) < t(10) && t(10) < t(25), 'Wege werden länger');
  assert.ok(LEVELS.every((l) => l.tip.icon && l.tip.text.length <= 45), 'kurze Tipps mit Symbol');
});

test('Joystick: kleine Ausschläge bewegen nichts, Leiter greift großzügig, Klettern führt auf die nächste Etage', () => {
  const level = lv({ floors: [[[40, 860]], [[40, 860]]], ladders: [{ f: 0, x: 400 }], friends: [{ f: 1, x: 300 }, { f: 1, x: 500 }, { f: 1, x: 700 }] });
  const s = newState(level);
  run(s, 0.15, 0.1, 30); assert.equal(s.x, 100); assert.equal(s.started, false, 'Zittern startet die Uhr nicht');
  run(s, 1, 0, 50); assert.ok(s.x > 330 && s.x < 400, 'nahe der Leiter, aber nicht genau davor');
  run(s, 0.3, 0.9, 1); assert.equal(s.ladder, 0, 'schräg nach oben greift die Leiter');
  run(s, 0, 1, 200); assert.equal(s.f, 1); assert.equal(s.ladder, -1); assert.equal(s.x, 400);
  assert.deepEqual(s.cp, { f: 1, x: 400 }, 'Rücksetzpunkt = Ende der Leiter');
  run(s, 0, -1, 1); assert.equal(s.ladder, 0, 'runter greift dieselbe Leiter');
});

test('Schlafmonster: ohne Frucht zurückgeschoben, mit Frucht frei', () => {
  const level = lv({ floors: [[[40, 860]]], monsters: [{ f: 0, x: 450 }], fruits: [{ f: 0, x: 180 }], friends: [{ f: 0, x: 120 }, { f: 0, x: 600 }, { f: 0, x: 700 }], start: { f: 0, x: 280 } });
  const s = newState(level);
  run(s, 1, 0, 40); assert.ok(s.x <= 450 - C.monster, 'Monster versperrt'); assert.ok(s.events.some((e) => e.t === 'snore'));
  s.events.length = 0;
  run(s, -1, 0, 60); assert.equal(s.carry, 0, 'Frucht aufgehoben');
  run(s, 1, 0, 120); assert.equal(s.fed[0], true); assert.equal(s.carry, -1); assert.ok(s.x > 600);
  assert.equal(s.resets, 0, 'Monster kostet keinen Rücksetzer');
});

test('Hebel macht die Leiter sichtbar; Kokosnuss gibt Bonk und Rücksetzpunkt, Freunde bleiben', () => {
  const level = lv({ floors: [[[40, 860]], [[40, 860]]], ladders: [{ f: 0, x: 700, hidden: true }], levers: [{ f: 0, x: 300, ladder: 0 }], nuts: [{ f: 0, x: 500, period: 150, offset: 0 }], friends: [{ f: 0, x: 200 }, { f: 1, x: 300 }, { f: 1, x: 500 }] });
  const s = newState(level);
  assert.equal(s.vis[0], false);
  run(s, 1, 0, 30); assert.equal(s.on[0], true); assert.equal(s.vis[0], true);
  // genau in den Aufprall laufen
  const target = 500 - C.nut + 4; while (s.x < target) step(s, 1, 0);
  while (!nutDanger(level.nuts[0], s.clock + 1)) step(s, 0, 0);
  step(s, 0, 0); assert.ok(s.stun > 0, 'Bonk'); assert.equal(s.resets, 1);
  run(s, 1, 0, C.stun); assert.equal(s.stun, 0); assert.equal(s.x, s.cp.x); assert.equal(s.got[0], 1, 'Freund bleibt eingesammelt');
});

test('Tür: erst mit allen drei Freunden; feste 60-Hz-Zeit ist auf jedem Gerät gleich', () => {
  const level = lv({ floors: [[[40, 860]]], door: { x: 200 }, friends: [{ f: 0, x: 400 }, { f: 0, x: 500 }, { f: 0, x: 600 }], start: { f: 0, x: 120 } });
  const s = newState(level); run(s, 1, 0, 20); assert.equal(s.done, false); assert.ok(s.events.some((e) => e.t === 'locked'));
  run(s, 1, 0, 120); run(s, -1, 0, 200); assert.equal(s.done, true);
  const a = playPath(LEVELS[11], solve(LEVELS[11]).path), b = playPath(LEVELS[11], solve(LEVELS[11]).path);
  assert.equal(a.time, b.time);
});

test('Spielstand und Herausforderung: Bestzeit, Freischalten, Gleichstand über Rücksetzer', () => {
  const save = freshSave();
  assert.equal(recordRun(save, 1, 600, 0, 30), true); assert.equal(save.unlocked, 2);
  assert.equal(recordRun(save, 1, 700, 0, 30), false); assert.equal(recordRun(save, 1, 600, 0, 30), false);
  assert.deepEqual(sanitizeSave({ unlocked: 99, best: { 1: { t: 5, r: 0 }, 50: { t: 1, r: 0 }, x: 1 }, mute: 'ja' }, 30), { v: 1, unlocked: 30, best: { 1: { t: 5, r: 0 } }, mute: false });
  assert.deepEqual(sanitizeSave('kaputt', 30), freshSave());
  assert.deepEqual(parseChallenge('?l=7&t=4523&r=1', 30), { l: 7, t: 4523, r: 1 });
  for (const bad of ['?l=0&t=4000', '?l=31&t=4000', '?l=3&t=abc', '?l=3&t=50', '?l=3&t=4000&r=-1']) assert.equal(parseChallenge(bad, 30), null, bad);
  const ch = { l: 7, t: centis(2400), r: 1 };
  assert.equal(beats(2399, 5, ch), true); assert.equal(beats(2400, 0, ch), true); assert.equal(beats(2400, 1, ch), false); assert.equal(beats(2460, 0, ch), false);
  assert.equal(fmt(4523), '45,23 s'); assert.equal(fmt(7505), '1:15,05 s');
});

test('Einbindung: Seite, Startseite, Umzug, Sitemap und Herausforderungs-Vorschau', async () => {
  const html = readFileSync(new URL('../public/spiele/dino-leiterhelden.html', import.meta.url), 'utf8');
  for (const id of ['pauseBtn', 'restartBtn', 'muteBtn', 'shareBtn', 'tip', 'stick']) assert.ok(html.includes(`id="${id}"`), id);
  assert.ok(html.includes('class="pz-home" href="/"'), 'Weg zurück zu PlaySaal');
  assert.ok(/touch-action:none/.test(html) && /user-scalable=no/.test(html), 'keine Browser-Gesten');
  assert.ok(readFileSync(new URL('../public/index.html', import.meta.url), 'utf8').includes('href="/spiele/dino-leiterhelden"'));
  assert.ok(readFileSync(new URL('../public/assets/umzug.js', import.meta.url), 'utf8').includes("prefix: 'dinoleiter.'"));
  assert.ok(readFileSync(new URL('../public/sitemap.xml', import.meta.url), 'utf8').includes('/spiele/dino-leiterhelden<'));
  const env = { ASSETS: { fetch: async () => new Response(html, { headers: { 'Content-Type': 'text/html' } }) } };
  const res = await worker.fetch(new Request('https://playsaal.com/spiele/dino-leiterhelden?l=7&t=4523&r=1'), env);
  const out = await res.text();
  assert.ok(out.includes('content="Dino-Leiterhelden Level 7: 45,23 s – schaffst du es schneller?"'));
  const plain = await worker.fetch(new Request('https://playsaal.com/spiele/dino-leiterhelden?l=99&t=1'), env);
  assert.ok((await plain.text()).includes('content="Dino-Leiterhelden · Kletterspiel für Kinder"'));
});
