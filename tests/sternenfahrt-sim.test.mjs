// NEON COAST – STERNENFAHRT: Level fair und lösbar, Steuerung, Schutzzeit, Bildraten, Spielstand (ohne Browser).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { LEVELS, LEVEL_COUNT } from '../public/spiele/sternenfahrt/levels.js';
import {
  newRun, step, advance, press, kidBot, award, freshSave, sanitizeSave, recordWin, carsUnlocked, parseInvite,
  STEP, CAR_RUN, KINDS, AUTOS
} from '../public/spiele/sternenfahrt/engine.js';

const IMG = new URL('../public/spiele/sternenfahrt/img/', import.meta.url);

function drive(lv, bot, { dt = 1 / 60, tutorial = false, max = 300 } = {}) {
  const st = newRun(lv, { tutorial });
  const ev = [];
  while (!st.done && st.t < max) {
    const d = bot ? bot(st) : 0;
    if (d) press(st, d);
    advance(st, dt);
    ev.push(...st.events); st.events.length = 0;
  }
  return { st, ev };
}

test('20 Level, Dauer 45–75 s, Tempo steigt moderat, Welten Stadt → Strand → Hafen (Teil 2 bei Nacht/Abendrot)', () => {
  assert.equal(LEVEL_COUNT, 20);
  let last = 0;
  for (const lv of LEVELS) {
    const dauer = lv.length / lv.speed + 1;
    assert.ok(dauer >= 45 && dauer <= 75, `Level ${lv.id}: ${dauer.toFixed(0)} s`);
    if (lv.id === 11) last = 0;   // Teil 2 beginnt wieder etwas ruhiger
    assert.ok(lv.speed >= last && lv.speed <= 3.6, `Level ${lv.id}: Tempo ${lv.speed}`);
    last = lv.speed;
    assert.ok(lv.stars >= 25, `Level ${lv.id}: ${lv.stars} Sterne`);
  }
  const welten = ['stadt', 'stadt', 'stadt', 'strand', 'strand', 'strand', 'strand', 'hafen', 'hafen', 'hafen'];
  assert.deepEqual(LEVELS.map((l) => l.welt), [...welten, ...welten]);
  assert.ok(LEVELS.slice(0, 10).every((l) => !l.licht) && LEVELS.slice(10).every((l) => l.licht === 'nacht' || l.licht === 'abend'));
});

test('Lernkurve: Level 1 ohne Hindernisse am Anfang, Level 1–3 ohne Autos, Level 1–4 nie zwei Spuren gleichzeitig zu', () => {
  const l1 = LEVELS[0];
  const first = Math.min(...l1.objs.filter((o) => o.kind !== 'stern').map((o) => o.y));
  assert.ok(first >= 40, `erstes Hindernis in Level 1 erst nach der Übung (Zeile ${first})`);
  assert.ok(l1.tutorial);
  for (const lv of LEVELS.slice(0, 3)) assert.ok(!lv.objs.some((o) => o.kind === 'auto'), `Level ${lv.id}: keine Autos`);
  for (const lv of LEVELS.slice(0, 4)) {
    const rows = new Map();
    for (const o of lv.objs) if (o.kind !== 'stern') rows.set(o.y, (rows.get(o.y) || 0) + 1);
    assert.ok([...rows.values()].every((n) => n === 1), `Level ${lv.id}: höchstens ein Hindernis pro Zeile`);
  }
});

test('immer eine freie Spur, Sterne nie auf oder direkt an Hindernissen, Autospuren frei', () => {
  for (const lv of LEVELS) {
    const hind = lv.objs.filter((o) => o.kind !== 'stern');
    const byRow = new Map();
    for (const o of hind) byRow.set(o.y, [...(byRow.get(o.y) || []), o.lane]);
    for (const [y, lanes] of byRow) assert.ok(lanes.length <= 2, `Level ${lv.id}, Zeile ${y}: alle Spuren zu`);
    for (const s of lv.objs.filter((o) => o.kind === 'stern')) {
      for (const h of hind) {
        if (h.lane === s.lane && h.kind !== 'auto') assert.ok(Math.abs(h.y - s.y) >= 1.5, `Level ${lv.id}: Stern bei Zeile ${s.y} zu nah an ${h.kind}`);
      }
    }
    // Ein langsames Auto fährt CAR_RUN Zeilen bis zum Einholpunkt und rollt danach noch hinter einem her: Spur frei halten
    for (const c of hind.filter((o) => o.kind === 'auto')) {
      for (const o of lv.objs) {
        if (o === c || o.lane !== c.lane) continue;
        assert.ok(o.y < c.y - CAR_RUN - 0.5 || o.y > c.y + 6, `Level ${lv.id}: ${o.kind} bei Zeile ${o.y} liegt im Weg des Autos (Einholpunkt ${c.y})`);
      }
    }
  }
});

test('Prüf-Fahrer mit Kinder-Reaktionszeit (1,0 s und 1,4 s) und kleinster Sichtweite stößt nirgends an', () => {
  for (const lv of LEVELS) {
    for (const reaction of [1.0, 1.4]) {
      const { st, ev } = drive(lv, kidBot({ reaction }));
      assert.ok(st.done, `Level ${lv.id}: angekommen`);
      const h = ev.filter((e) => e.e === 'hoppla').map((e) => `${e.o.kind} Spur ${e.o.lane}`);
      assert.equal(st.hits, 0, `Level ${lv.id}, Reaktion ${reaction} s: ${h.join(', ')}`);
      assert.ok(st.gotLevel / lv.stars >= 0.85, `Level ${lv.id}: nur ${st.gotLevel}/${lv.stars} Sterne erreichbar`);
    }
  }
});

test('ohne Lenken kommt man trotzdem ans Ziel (kein Game-over), Sterne bleiben erhalten', () => {
  for (const lv of LEVELS) {
    const { st } = drive(lv, null);
    assert.ok(st.done, `Level ${lv.id}`);
    assert.ok(award(st.gotLevel, lv.stars) >= 1);
  }
  // Treffer nimmt keine Sterne weg
  const lv = LEVELS[1], st = newRun(lv, { tutorial: false });
  let gotBefore = -1;
  while (!st.done) {
    step(st);
    for (const e of st.events) if (e.e === 'hoppla' && gotBefore < 0) gotBefore = st.got;
    st.events.length = 0;
    if (gotBefore >= 0) { assert.ok(st.got >= gotBefore); }
  }
});

test('ein Tastendruck = genau eine Spur; Rand; beide Pfeile zugleich heben sich auf', () => {
  const st = newRun(LEVELS[1], { tutorial: false });
  assert.equal(st.target, 0);
  press(st, -1); assert.equal(st.target, -1);
  for (let i = 0; i < 60; i++) step(st);
  assert.ok(Math.abs(st.x + 1) < 1e-9, 'genau eine Spur nach links');
  assert.equal(press(st, -1), false, 'am linken Rand bleibt das Auto in der Spur');
  assert.equal(st.target, -1);
  press(st, 1); press(st, -1);   // beide im selben Bild
  for (let i = 0; i < 60; i++) step(st);
  assert.equal(st.target, -1); assert.ok(Math.abs(st.x + 1) < 1e-9);
  // zwei schnelle Drücke = zwei Spuren, nicht mehr
  press(st, 1); step(st); press(st, 1);
  for (let i = 0; i < 120; i++) step(st);
  assert.equal(st.target, 1); assert.ok(Math.abs(st.x - 1) < 1e-9);
  // Spurwechsel dauert spürbar, aber kurz
  press(st, -1);
  let n = 0; while (Math.abs(st.x) > 1e-6 && n < 200) { step(st); n++; }
  assert.ok(n * STEP > 0.2 && n * STEP < 0.4, `Spurwechsel ${(n * STEP).toFixed(2)} s`);
});

test('Hoppla: langsamer, Schutzzeit ohne zweiten Treffer, danach wieder normal', () => {
  const lv = LEVELS[8];   // dicht gesetzte Hindernisse
  const st = newRun(lv, { tutorial: false });
  const hits = [];
  while (!st.done) {
    step(st);
    for (const e of st.events) if (e.e === 'hoppla') hits.push({ t: st.t, v: null });
    st.events.length = 0;
    const h = hits[hits.length - 1];
    if (h && h.v == null && st.t - h.t >= 0.05) h.v = st.v;
  }
  assert.ok(hits.length >= 2, 'ohne Lenken gibt es Berührungen');
  for (let i = 1; i < hits.length; i++) assert.ok(hits[i].t - hits[i - 1].t >= 2.2 - 1e-6, 'kein Treffer in der Schutzzeit');
  assert.ok(hits[0].v < lv.speed * 0.6, 'kurz langsamer');
});

test('gleiches Ergebnis bei 30, 60 und 144 Bildern pro Sekunde (feste Rechenschritte)', () => {
  const lv = LEVELS[6];
  const run = (fps) => {
    const st = newRun(lv, { tutorial: false });
    const presses = [[3, -1], [7, 1], [7.05, 1], [12, -1], [20, -1], [26, 1]];
    let i = 0;
    while (!st.done) {
      while (i < presses.length && st.t >= presses[i][0]) press(st, presses[i++][1]);
      advance(st, 1 / fps);
      st.events.length = 0;
    }
    return { got: st.got, hits: st.hits, t: Math.round(st.t * 10) };
  };
  const a = run(30), b = run(60), c = run(144);
  assert.deepEqual(a.hits, b.hits); assert.deepEqual(b.hits, c.hits);
  assert.ok(Math.abs(a.got - c.got) <= 1 && Math.abs(a.t - c.t) <= 1, JSON.stringify({ a, c }));
  // Ruckler (2 s ohne Bild) springen nicht durch Hindernisse: höchstens 0,25 s werden nachgeholt
  const st = newRun(lv, { tutorial: false }); advance(st, 2); assert.ok(st.t <= 0.26);
});

test('Level 1: Übung erst links, dann rechts – das Level startet erst danach', () => {
  const st = newRun(LEVELS[0]);
  assert.equal(st.phase, 'links');
  for (let i = 0; i < 120 * 6; i++) step(st);
  assert.equal(st.phase, 'links', 'wartet auf das Kind');
  assert.equal(st.offset, null);
  assert.ok(st.objs.some((o) => o.tut && o.lane === -1), 'Übungssterne links');
  press(st, -1); for (let i = 0; i < 60; i++) step(st);
  assert.equal(st.phase, 'rechts');
  press(st, 1); for (let i = 0; i < 60; i++) step(st);
  assert.equal(st.phase, 'rechts', 'erst Mitte, noch nicht rechts');
  press(st, 1); for (let i = 0; i < 60; i++) step(st);
  assert.equal(st.phase, 'fahrt');
  assert.ok(st.offset > st.p);
  const { st: s2 } = drive(LEVELS[0], kidBot({ reaction: 1 }), { tutorial: true });
  assert.ok(s2.done);
});

test('Spielstand: bereinigen, Bestwerte, nächstes Level, Autos nach Level 3, 6, 12 und 16', () => {
  const s = sanitizeSave({ unlocked: 99, best: { 1: 3, 2: 9, x: 1 }, got: { 1: 30, 2: 5 }, car: 'orange', mute: true }, 10);
  assert.equal(sanitizeSave({ unlocked: 99 }, 20).unlocked, 20);
  assert.deepEqual(s.best, { 1: 3 }); assert.deepEqual(s.got, { 1: 30 });
  assert.equal(s.unlocked, 10); assert.equal(s.car, 'tuerkis'); assert.equal(s.mute, true);
  assert.deepEqual(sanitizeSave('kaputt', 10), freshSave());
  const save = freshSave();
  assert.deepEqual(carsUnlocked(save), ['tuerkis']);
  for (let n = 1; n <= 6; n++) {
    const lv = LEVELS[n - 1], r = recordWin(save, lv, { gotLevel: Math.ceil(lv.stars * 0.3) }, 10);
    assert.equal(r.stars, 1, 'wenige Sterne: trotzdem geschafft');
    assert.equal(save.unlocked, n + 1);
    if (n === 3) assert.equal(r.neuAuto, 'pink');
    else if (n === 6) assert.equal(r.neuAuto, 'orange');
    else assert.equal(r.neuAuto, null);
  }
  for (let n = 7; n <= 16; n++) {
    const r = recordWin(save, LEVELS[n - 1], { gotLevel: 1 }, 20);
    assert.equal(r.neuAuto, n === 12 ? 'lila' : n === 16 ? 'taxi' : null, `Level ${n}`);
  }
  assert.deepEqual(carsUnlocked(save), ['tuerkis', 'pink', 'orange', 'lila', 'taxi']);
  const r = recordWin(save, LEVELS[0], { gotLevel: LEVELS[0].stars }, 10);
  assert.equal(r.stars, 3); assert.equal(save.best[1], 3);
  recordWin(save, LEVELS[0], { gotLevel: 1 }, 10);
  assert.equal(save.best[1], 3, 'Bestwert bleibt');
  // Einladung zu gesperrtem Level schaltet nichts frei
  const s3 = freshSave(); recordWin(s3, LEVELS[7], { gotLevel: 40 }, 10); assert.equal(s3.unlocked, 1);
  assert.deepEqual(parseInvite('?l=4', 10), { l: 4 }); assert.equal(parseInvite('?l=11', 10), null);
  // Rundreise über JSON
  assert.deepEqual(sanitizeSave(JSON.parse(JSON.stringify(save)), 20), save);
});

test('Auszeichnung: 90 % → 3, 60 % → 2, sonst 1', () => {
  assert.equal(award(45, 50), 3); assert.equal(award(30, 50), 2); assert.equal(award(29, 50), 1); assert.equal(award(0, 50), 1);
});

test('alle Bilder aus manifest.json sind vorhanden', () => {
  const list = JSON.parse(readFileSync(new URL('manifest.json', IMG)));
  for (const n of ['absperrung', 'bake', 'verkehr-taxi', 'figur-mann', 'palme', ...Object.values(AUTOS).map((a) => a.img)]) assert.ok(list.includes(n), n);
  for (const n of list) assert.ok(existsSync(new URL(n + '.webp', IMG)), n);
});
