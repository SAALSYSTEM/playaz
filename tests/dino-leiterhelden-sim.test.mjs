import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LEVELS, LEVEL_COUNT } from '../public/spiele/dino-leiterhelden/levels.js';
import { C, HZ, layout, newState, step, validate, solve, playPath, nutDanger, bridgeDock, bridgeLo, wakerAwake, slideExit, balloonTimes, neckOpen, freshSave, sanitizeSave, recordRun, parseChallenge, beats, centis, fmt } from '../public/spiele/dino-leiterhelden/engine.js';
import worker from '../src/worker.js';

const run = (s, ix, iy, ticks) => { for (let i = 0; i < ticks; i++) step(s, ix, iy); return s; };
const lv = (o) => ({ tip: { icon: '·', text: 'Test' }, ladders: [], door: { x: 820 }, start: { f: 0, x: 100 }, friends: [{ f: 0, x: 300 }, { f: 0, x: 500 }, { f: 0, x: 700 }], ...o });

test('90 gültige Level: Freunde erreichbar, Tür lösbar, jede Mechanik wird gebraucht, Bot schafft jedes ohne Rücksetzer', () => {
  assert.equal(LEVEL_COUNT, 90);
  LEVELS.forEach((level, i) => {
    const n = i + 1;
    assert.deepEqual(validate(level), [], `Level ${n}`);
    assert.equal(level.friends.length, 3);
    const sol = solve(level);
    assert.ok(sol.ok, `Level ${n} lösbar`);
    const end = sol.path.at(-1);
    assert.equal(end.fed, (1 << (level.monsters || []).length) - 1, `Level ${n}: alle Monster nötig`);
    assert.equal(end.on, (1 << (level.levers || []).length) - 1, `Level ${n}: alle Hebel nötig`);
    assert.equal(end.nf, (1 << (level.necks || []).length) - 1, `Level ${n}: jeder Langhals nötig`);
    const s = playPath(level, sol.path);
    assert.ok(s.done, `Level ${n}: Bot erreicht die Tür`);
    assert.equal(s.resets, 0, `Level ${n}: Bot weicht Kokosnüssen aus`);
    assert.ok(s.time / HZ < 60, `Level ${n}: Bestweg unter einer Minute (${(s.time / HZ).toFixed(1)} s)`);
  });
});

test('Schwierigkeit steigt: frühe Level erklären je eine Sache, spätere haben mehr Etagen und Wege', () => {
  const mech = (l) => ['monsters', 'fruits', 'levers', 'nuts', 'slides', 'bridges', 'wakers'].filter((k) => (l[k] || []).length);
  assert.equal(LEVELS[0].floors.length, 1); assert.equal(LEVELS[0].ladders.length, 0);
  assert.deepEqual(mech(LEVELS[1]), []); assert.deepEqual(mech(LEVELS[5]), ['monsters', 'fruits']);
  assert.deepEqual(mech(LEVELS[6]), ['nuts']); assert.deepEqual(mech(LEVELS[7]), ['levers']);
  assert.ok(LEVELS.slice(20, 30).every((l) => l.floors.length === 6));
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

test('Level 31–60: jedes neue Element wird eingeführt und gebraucht, danach gemischt', () => {
  const used = (n, c) => solve(LEVELS[n - 1]).path.some((p) => p.via && p.via[0] === c);
  const kinds = (l) => ['slides', 'bridges', 'wakers'].filter((k) => (l[k] || []).length);
  for (let n = 36; n <= 42; n++) assert.ok(used(n, 's'), `Level ${n}: Rutsche gehört zum Bestweg`);
  for (let n = 43; n <= 49; n++) assert.ok(used(n, 'b'), `Level ${n}: Fahr-Brücke gehört zum Bestweg`);
  for (let n = 50; n <= 55; n++) assert.ok((LEVELS[n - 1].wakers || []).length, `Level ${n}: Wechsel-Monster`);
  for (let n = 31; n <= 35; n++) assert.deepEqual(kinds(LEVELS[n - 1]), [], `Level ${n}: nur bekannte Elemente`);
  for (const n of [56, 58, 59, 60]) assert.ok(kinds(LEVELS[n - 1]).length >= 2, `Level ${n}: Mischung`);
  assert.deepEqual(kinds(LEVELS[35]), ['slides'], 'Level 36 zeigt nur die Rutsche');
  assert.deepEqual(kinds(LEVELS[42]), ['bridges'], 'Level 43 zeigt nur die Brücke');
  assert.deepEqual(kinds(LEVELS[49]), ['wakers'], 'Level 50 zeigt nur das Wechsel-Monster');
  assert.ok(LEVELS.slice(30).every((l) => solve(l).seconds < 40), 'neue Level bleiben kurz');
});

test('Level 61–90: Ballon und Langhals werden eingeführt, gebraucht und gemischt', () => {
  const path = (n) => solve(LEVELS[n - 1]).path, kinds = (l) => ['slides', 'bridges', 'wakers', 'balloons', 'necks'].filter((k) => (l[k] || []).length);
  for (let n = 61; n <= 64; n++) assert.ok(!kinds(LEVELS[n - 1]).some((k) => k === 'balloons' || k === 'necks'), `Level ${n}: nur bekannte Elemente`);
  for (let n = 65; n <= 71; n++) assert.ok(path(n).some((p) => p.via && p.via[0] === 'a'), `Level ${n}: Ballon gehört zum Bestweg`);
  for (let n = 72; n <= 78; n++) assert.ok((LEVELS[n - 1].necks || []).length && !(LEVELS[n - 1].balloons || []).length, `Level ${n}: Langhals`);
  for (let n = 79; n <= 84; n++) assert.ok(path(n).some((p) => p.via && p.via[0] === 'a') && LEVELS[n - 1].necks.length, `Level ${n}: Ballon und Langhals`);
  for (let n = 85; n <= 90; n++) assert.ok(kinds(LEVELS[n - 1]).length >= 2, `Level ${n}: Mischung`);
  assert.deepEqual(kinds(LEVELS[64]), ['balloons'], 'Level 65 zeigt nur den Ballon');
  assert.deepEqual(kinds(LEVELS[71]), ['necks'], 'Level 72 zeigt nur den Langhals');
  assert.ok(LEVELS.slice(60).every((l) => l.tip.text.length <= 45 && solve(l).seconds < 40), 'neue Level bleiben kurz');
});

test('Heißluftballon: nach oben ziehen, fliegt von allein, landet am Ziel, schwebt leer zurück, nie nach unten', () => {
  const bl = { f: 0, x: 450, up: 1, to: 600 };
  const level = lv({ floors: [[[40, 860]], [[40, 340], [560, 860]]], balloons: [bl], door: { x: 705 }, friends: [{ f: 0, x: 250 }, { f: 0, x: 700 }, { f: 1, x: 800 }] });
  assert.deepEqual(validate(level), []);
  const s = newState({ ...level, start: { f: 0, x: 420 } });
  run(s, 0, 1, 1); assert.equal(s.fly, 0, 'nach oben zieht den Ballon'); assert.equal(s.x, 450);
  run(s, -1, 0, 10); assert.equal(s.x, 450, 'im Flug wirkt keine Steuerung');
  run(s, 0, 0, balloonTimes(level, bl).T); assert.equal(s.fly, -1); assert.equal(s.f, 1); assert.equal(s.x, 600);
  assert.deepEqual(s.cp, { f: 1, x: 600 }, 'Rücksetzpunkt am Landeplatz'); assert.ok(s.events.some((e) => e.t === 'balloon'));
  const down = newState({ ...level, start: { f: 1, x: 600 } }); run(down, 0, -1, 20); assert.equal(down.fly, -1); assert.equal(down.f, 1, 'nach unten fliegt er nicht');
  const again = newState({ ...level, start: { f: 0, x: 450 } }); again.bt[0] = 0; again.clock = 10; run(again, 0, 1, 5); assert.equal(again.fly, -1, 'unterwegs: erst warten, bis er zurück ist');
  assert.ok(validate(lv({ ...level, floors: [[[40, 860]], [[40, 860]]] })).some((e) => e.includes('keine Lücke')), 'über dem Ballon muss eine Lücke sein');
  assert.ok(validate(lv({ ...level, balloons: [{ ...bl, to: 470 }] })).some((e) => e.includes('Ballon')), 'Ziel muss auf einer Plattform liegen');
});

test('Langhals: will ein Blatt, legt danach den Hals über die Lücke; immer nur ein Ding tragen', () => {
  const nk = { f: 0, a: 240, b: 440, side: 1 };
  const level = lv({ floors: [[[40, 240], [440, 860]]], necks: [nk], leaves: [{ f: 0, x: 760 }], fruits: [{ f: 0, x: 820 }], door: { x: 90 }, start: { f: 0, x: 700 },
    friends: [{ f: 0, x: 680 }, { f: 0, x: 800 }, { f: 0, x: 830 }] });
  assert.deepEqual(validate(level), []);
  const s = newState(level);
  run(s, -1, 0, 60); assert.equal(s.x, 440 + C.edge, 'ohne Blatt: Lücke bleibt'); assert.equal(s.nfed[0], -1);
  run(s, 1, 0, 120); assert.equal(s.leaf, 0, 'Blatt aufgehoben'); assert.equal(s.carry, -1, 'mit Blatt keine Frucht dazu');
  run(s, -1, 0, 120); assert.ok(s.nfed[0] >= 0, 'gefressen'); assert.equal(s.leaf, -1);
  assert.ok(!neckOpen(s, 0) && s.x === 440 + C.edge, 'erst nach dem Ablegen geht es weiter');
  run(s, -1, 0, C.lower + 120); assert.ok(s.x < 240, 'über den Hals gelaufen'); assert.equal(s.resets, 0);
  assert.ok(validate(lv({ ...level, friends: [{ f: 0, x: 500 }, { f: 0, x: 800 }, { f: 0, x: 830 }] })).some((e) => e.includes('Langhals')), 'nichts im Langhals-Bereich');
  assert.ok(validate(lv({ ...level, necks: [{ ...nk, b: 700 }] })).length > 0, 'Lücke muss passen');
});

test('Rutsche: am Einstieg nach unten ziehen, rutscht von allein, Rücksetzpunkt am Ausstieg, nie nach oben', () => {
  const level = lv({ floors: [[[40, 860]], [[40, 860]]], slides: [{ f: 0, x: 300, dir: 1 }], start: { f: 1, x: 250 }, friends: [{ f: 0, x: 780 }, { f: 1, x: 100 }, { f: 1, x: 500 }] });
  const s = newState(level);
  run(s, 0, -1, 1); assert.equal(s.slide, 0, 'nach unten greift die Rutsche'); assert.equal(s.x, 300);
  run(s, 1, 0, 10); assert.equal(s.x, 300, 'während des Rutschens wirkt keine Steuerung');
  run(s, 0, 0, C.slide); assert.equal(s.slide, -1); assert.equal(s.f, 0); assert.equal(s.x, slideExit(level, level.slides[0]));
  assert.deepEqual(s.cp, { f: 0, x: s.x }); assert.ok(s.events.some((e) => e.t === 'slide'));
  const up = newState(lv({ ...level, start: { f: 0, x: 300 } })); run(up, 0, 1, 20); assert.equal(up.slide, -1); assert.equal(up.f, 0, 'nach oben geht es nicht');
  const far = newState(lv({ ...level, start: { f: 1, x: 100 } })); run(far, 0, -1, 5); assert.equal(far.slide, -1, 'zu weit weg vom Einstieg');
  assert.ok(validate(lv({ ...level, slides: [{ f: 0, x: 800, dir: 1 }] })).some((e) => e.includes('Ausstieg')), 'Ausstieg muss auf einer Plattform liegen');
});

test('Fahr-Brücke: aufsteigen nur wenn angelegt, mitfahren, am anderen Ende absteigen', () => {
  const br = { f: 0, a: 230, b: 550, period: 300, offset: 100 };
  const level = lv({ floors: [[[40, 230], [550, 860]]], bridges: [br], door: { x: 800 }, start: { f: 0, x: 100 }, friends: [{ f: 0, x: 150 }, { f: 0, x: 650 }, { f: 0, x: 730 }] });
  assert.deepEqual(validate(level), []);
  const s = newState(level);
  run(s, 1, 0, 100); assert.equal(s.ride, -1); assert.equal(s.x, 230 - C.edge, 'Brücke nicht da: am Rand bleiben');
  while (bridgeDock(br, s.clock + 1) !== -1) step(s, 1, 0);
  assert.equal(s.x, 230 - C.edge, 'bleibt am Rand, bis sie anlegt');
  run(s, 1, 0, 12); assert.equal(s.ride, 0, 'aufgestiegen'); assert.ok(s.x > 230);
  const off = s.x - bridgeLo(br, s.clock);
  while (bridgeDock(br, s.clock + 1) !== 1) step(s, 0, 0);
  assert.ok(Math.abs(s.x - (bridgeLo(br, s.clock) + off)) < 0.01 && s.x > 380, 'fährt mit');
  run(s, 1, 0, 90); assert.equal(s.ride, -1); assert.ok(s.x > 550, 'drüben abgestiegen'); assert.equal(s.resets, 0);
  assert.ok(validate(lv({ ...level, bridges: [{ ...br, b: 400 }] })).length > 0, 'Lücke muss zur Brücke passen');
});

test('Wechsel-Monster: schlafend passierbar, wach versperrt und schiebt sanft zurück, nie ein Rücksetzer', () => {
  const w = { f: 0, x: 450, period: 300, offset: 0 };
  const base = lv({ floors: [[[40, 860]]], wakers: [w], friends: [{ f: 0, x: 120 }, { f: 0, x: 780 }, { f: 0, x: 820 }], start: { f: 0, x: 200 } });
  assert.deepEqual(validate(base), []);
  const sleepy = newState(base); run(sleepy, 1, 0, 70); assert.ok(sleepy.x > 540, 'schläft: einfach vorbeigehen'); assert.equal(wakerAwake(w, 1), false);
  const awake = newState(lv({ ...base, wakers: [{ ...w, offset: 250 }] }));
  run(awake, 1, 0, 44); assert.ok(awake.x <= 450 - C.monster, 'wach: davor stehen bleiben'); assert.ok(awake.events.some((e) => e.t === 'grumble'));
  const inside = newState(lv({ ...base, start: { f: 0, x: 440 }, wakers: [{ ...w, offset: 232 }] }));
  run(inside, 0, 0, 40); assert.ok(Math.abs(inside.x - 450) >= C.monster, 'wird beim Aufwachen hinausgeschoben'); assert.ok(inside.events.some((e) => e.t === 'wake'));
  assert.equal(awake.resets + inside.resets, 0);
  assert.ok(validate(lv({ ...base, friends: [{ f: 0, x: 400 }, { f: 0, x: 780 }, { f: 0, x: 820 }] })).some((e) => e.includes('Wechsel-Monster')), 'Freund darf nicht im Schlafbereich liegen');
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
  assert.equal(recordRun(save, 30, 900, 0, 60), true); assert.equal(save.unlocked, 31, 'nach Level 30 geht es mit Level 31 weiter'); assert.equal(recordRun(save, 60, 900, 0, 90), true); assert.equal(save.unlocked, 61, 'nach Level 60 geht es mit Level 61 weiter'); assert.equal(recordRun(save, 90, 900, 0, 90), true); assert.equal(save.unlocked, 90);
  assert.deepEqual(parseChallenge('?l=45&t=4000', 60), { l: 45, t: 4000, r: 0 });
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
  const late = await worker.fetch(new Request('https://playsaal.com/spiele/dino-leiterhelden?l=85&t=2345&r=0'), env);
  assert.ok((await late.text()).includes('content="Dino-Leiterhelden Level 85: 23,45 s – schaffst du es schneller?"'), 'Herausforderungen gelten bis Level 90');
});
