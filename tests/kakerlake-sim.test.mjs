// HAU DIE KAKERLAKE!: Level, Spiellogik, Bot-Durchläufe ohne Browser.
// Start: node --test tests/kakerlake-sim.test.mjs   (keine weiteren Abhängigkeiten)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, comboMult, starsFor, STEP, COMBO_WINDOW, STRIKE_COOLDOWN, DEFENSE_MAX, POWER_EVERY } from '../public/spiele/hau-die-kakerlake/sim.js';
import { LEVELS, CHAPTERS, TYPES, BOSSES, buildPlan, buildEndlessWave, endlessParams, POWER_FROM_LEVEL, FOLLOWUP_LEAD } from '../public/spiele/hau-die-kakerlake/levels.js';
import { getLayout, AISLE_IDS, sampleRoute } from '../public/spiele/hau-die-kakerlake/layout.js';
import { playBot } from './kakerlake-bot.mjs';

// Vorgaben aus der Aufgabenstellung
const TOTALS = [3, 6, 9, 12, 15, 18, 18, 20, 23, 25, 28, 30, 28, 30, 33, 35, 38, 40, 38, 40, 43, 45, 48, 50, 48, 52, 56, 60, 65, 75];
const SPANS = [6, 10, 14, 18, 20, 24, 24, 26, 28, 30, 32, 34, 32, 34, 36, 38, 40, 42, 38, 40, 42, 44, 46, 48, 44, 48, 50, 54, 58, 65];

// Spiel ohne geplante Spawns; ein ferner Platzhalter verhindert das vorzeitige Ende
function bare(level = 12, opts = {}) {
  const g = new Game({ level, layout: 'land', seed: 3, ...opts });
  g.queue = [{ at: 1e9, type: 'standard', ent: 'C', d: 0, r1: 0.5, r2: 0.5, hp: 1 }];
  return g;
}
const put = (g, type, ent = 'C', extra = {}) => {
  g._spawn({ at: g.t, type, ent, d: 0, r1: 0.5, r2: 0.5, hp: TYPES[type].hp, boss: type === 'boss' ? (extra.boss || 'hinterbaenkler') : null });
  return g.enemies[g.enemies.length - 1];
};
const wait = (g, s = STRIKE_COOLDOWN + 0.02) => g.advance(s);

test('Level: 30 Stück, Gegnerzahlen und Spawnphasen wie vorgegeben, fünf Kapitel mit je sechs Level', () => {
  assert.equal(LEVELS.length, 30);
  assert.deepEqual(LEVELS.map((l) => l.total), TOTALS);
  assert.deepEqual(LEVELS.map((l) => l.span), SPANS);
  assert.equal(CHAPTERS.length, 5);
  for (const c of CHAPTERS) assert.equal(c.levels.length, 6);
  assert.deepEqual(CHAPTERS.flatMap((c) => c.levels), LEVELS.map((l) => l.id));
  assert.deepEqual([6, 12, 18, 24, 30].map((i) => LEVELS[i - 1].boss.id), ['hinterbaenkler', 'fraktionskrabbler', 'dauerredner', 'ausschusskoenig', 'vorsitzender']);
});

test('Level: jede Konfiguration gültig, Spawnplan vollständig, zeitlich geordnet, nur geöffnete Eingänge', () => {
  for (const L of LEVELS) {
    assert.ok(L.name && L.tip, 'Text ' + L.id);
    assert.ok(L.cap >= 3 && L.cap <= 9, 'Cap ' + L.id);
    assert.ok(L.speed > 0 && L.rows[0] >= 0 && L.rows[1] <= 5 && L.rows[0] <= L.rows[1], 'Werte ' + L.id);
    const plan = buildPlan(L);
    const nachr = plan.events.filter((e) => e.type === 'nachr').length;
    assert.equal(plan.events.length + nachr, L.total, 'Summe Level ' + L.id);
    const bosses = plan.events.filter((e) => e.type === 'boss');
    assert.equal(bosses.length, L.boss ? 1 : 0, 'Boss Level ' + L.id);
    let prev = -1;
    for (const e of plan.events) {
      assert.ok(TYPES[e.type], 'Typ ' + e.type);
      assert.ok(L.ent.includes(e.ent), `Eingang ${e.ent} in Level ${L.id}`);
      assert.ok(Number.isFinite(e.at) && e.at >= prev - 1e-9, 'Reihenfolge Level ' + L.id);
      prev = e.at;
    }
    // Spawnphase ungefähr wie vorgegeben
    const last = plan.events[plan.events.length - 1].at, first = plan.events[0].at;
    assert.ok(last - first <= L.span + 1.5 && last >= L.span * 0.7, `Spanne Level ${L.id}: ${first.toFixed(1)}–${last.toFixed(1)} s`);
    // reproduzierbar
    assert.deepEqual(buildPlan(L), plan);
    for (const b of bosses) assert.ok(b.ent !== 'L2' && b.ent !== 'R2', 'Boss nicht an den äußersten Türen, Level ' + L.id);
  }
  // Gegnerarten werden in den Leveln eingeführt, die der Plan vorsieht (Flitzer 5, Helm 8, Koffer 13, Zickzack 14, Nachrücker 16)
  const first = (t) => LEVELS.find((L) => buildPlan(L).events.some((e) => e.type === t)).id;
  assert.deepEqual(['flitzer', 'helm', 'koffer', 'zickzack', 'nachr', 'boss'].map(first), [5, 8, 13, 14, 16, 6]);
  // Kapitel 1 bleibt am Haupteingang (kurze Wege)
  for (let i = 1; i <= 6; i++) assert.deepEqual(LEVELS[i - 1].ent, ['C']);
});

test('Layout: alle Wege in beiden Ausrichtungen endlich und im sichtbaren Bereich, jeder Eingang hat Zielsitze', () => {
  for (const name of ['land', 'port']) {
    const L = getLayout(name);
    for (const id of AISLE_IDS) {
      const seats = L.targets.filter((t) => t.aisle === id);
      assert.ok(seats.length >= 9, `${name} ${id} Zielsitze ${seats.length}`);
      for (const s of seats) {
        const r = L.route(id, s.id);
        for (let p = 0; p <= 1.0001; p += 0.02) {
          const q = sampleRoute(r, p, { amp: L.aisleHalf * 0.5, freq: 1.5, phase: 1 });
          assert.ok(Number.isFinite(q.x) && Number.isFinite(q.y), 'endlich');
          assert.ok(q.x >= 0 && q.x <= L.W && q.y >= 0 && q.y <= L.H, `${name} ${id} ${s.id} außerhalb: ${q.x | 0},${q.y | 0}`);
        }
      }
    }
  }
});

test('Kombo, Sterne', () => {
  assert.deepEqual([0, 1, 4, 5, 9, 10, 11, 99].map(comboMult), [1, 1, 1, 2, 2, 3, 3, 3]);
  assert.deepEqual([0, 1, 2, 3, 4, 5].map(starsFor), [3, 2, 2, 1, 1, 0]);
});

test('Schlag: Abklingzeit, kein Dauerfeuer, Fehlschlag kostet keinen Verteidigungspunkt, unterbricht aber die Kombo', () => {
  const g = bare();
  const e = put(g, 'standard');
  const a = g.strike(e.x + 400, e.y + 400);              // daneben
  assert.ok(a.miss && g.defense === DEFENSE_MAX && g.streak === 0);
  const b = g.strike(e.x, e.y);                          // sofort danach: ignoriert
  assert.ok(b.ignored && g.enemies.includes(e) && g.strikes === 1);
  g.advance(STRIKE_COOLDOWN + STEP);
  assert.ok(g.strike(e.x, e.y).hits[0].killed);
  assert.equal(g.streak, 1);
  const e2 = put(g, 'standard');
  wait(g); g.strike(e2.x + 500, e2.y);                   // Fehlschlag bricht die Serie
  assert.equal(g.streak, 0);
  assert.equal(g.defense, DEFENSE_MAX);
});

test('Punkte je Gegnerart und Kombostufen (×2 ab 5, ×3 ab 10 Treffern in Folge, nie mehr)', () => {
  const g = bare();
  const pts = { standard: 100, flitzer: 150, zickzack: 150, koffer: 100, nachr: 100 };
  for (const [type, p] of Object.entries(pts)) {
    const gg = bare(); const e = put(gg, type);
    assert.equal(gg.strike(e.x, e.y).hits[0].points, p, type);
  }
  const mults = [];
  for (let i = 0; i < 14; i++) { const e = put(g, 'standard'); wait(g, STRIKE_COOLDOWN + 0.02); const r = g.strike(e.x, e.y); mults.push(r.hits[0].points / 100); }
  assert.deepEqual(mults, [1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 3, 3, 3, 3]);
  assert.equal(g.comboMultiplier, 3);
  // Zeitfenster: nach COMBO_WINDOW ohne Treffer ist die Serie weg
  g.advance(COMBO_WINDOW + 0.1);
  assert.equal(g.streak, 0);
});

test('Helmträger: zwei Treffer, Helm fliegt weg, volle Punkte erst beim Besiegen, Treffer zählen für die Kombo', () => {
  const g = bare();
  const e = put(g, 'helm');
  const r1 = g.strike(e.x, e.y);
  assert.ok(!r1.hits[0].killed && !e.helmet && e.hp === 1 && g.score === 0 && g.streak === 1);
  assert.ok(g.drainEvents().some((ev) => ev.type === 'helm'));
  wait(g); g.advance(0.3);
  const r2 = g.strike(e.x, e.y);
  assert.ok(r2.hits[0].killed && g.score === 200 * r2.mult && g.streak === 2);
});

test('Boss: mehrere Treffer, 1000 Punkte nur beim Besiegen, größere Trefferfläche, langsam', () => {
  const g = bare(6);
  const e = put(g, 'boss');
  assert.equal(e.hp, TYPES.boss.hp);
  assert.ok(TYPES.boss.hitR > TYPES.standard.hitR * 1.5);
  assert.ok(e.dur > TYPES.standard.hp * 4, 'Boss ist langsam: ' + e.dur);
  for (let i = 1; i < e.hpMax; i++) { const r = g.strike(e.x, e.y); assert.ok(!r.hits[0].killed); assert.equal(g.score, 0); wait(g); g.advance(0.15); }
  const r = g.strike(e.x, e.y);
  assert.ok(r.hits[0].killed && g.score === 1000 * r.mult);
});

test('Überlappende Gegner: höchstens zwei Treffer je Schlag, der Gegner unter dem Zeiger zuerst', () => {
  const g = bare();
  const a = put(g, 'standard'), b = put(g, 'standard'), c = put(g, 'standard');
  b.x += 14; c.x -= 14;                                  // alle drei überlappen
  const r = g.strike(b.x, b.y);
  assert.equal(r.hits.length, 2);
  assert.equal(r.hits[0].id, b.id, 'Gegner unter dem Zeiger zuerst');
  assert.equal(g.streak, 1, 'ein Schlag, eine Kombo-Stufe');
  assert.equal(g.enemies.filter((e) => e.state === 'walk').length, 1);
});

test('Mindest-Trefferfläche: Schlag knapp neben dem Gegner trifft, wenn der Finger größer ist', () => {
  const g = bare(12, { minHit: 80 });
  const e = put(g, 'standard');
  assert.ok(!g.strike(e.x + 70, e.y).miss);
  const g2 = bare(12, { minHit: 0 });
  const e2 = put(g2, 'standard');
  assert.ok(g2.strike(e2.x + 70, e2.y).miss);
});

test('Nachrücker: Folgegegner mit Vorwarnung, nur eine Generation, Gesamtzahl bleibt', () => {
  const g = bare(19);
  const n = put(g, 'nachr');
  g.strike(n.x, n.y);
  assert.equal(g.followups.length, 1);
  g.drainEvents();
  g.advance(FOLLOWUP_LEAD + 0.5);
  const ev = g.drainEvents();
  assert.ok(ev.some((e) => e.type === 'warn' && e.follow), 'Vorwarnung');
  const f = g.enemies.find((e) => e.follow);
  assert.ok(f && f.type === 'standard', 'Folgegegner ist ein Standardgegner');
  wait(g); g.strike(f.x, f.y);
  assert.equal(g.followups.length, 0, 'kein zweiter Nachrücker');
  // über ein ganzes Level: besiegte + entkommene = Gesamtzahl
  const { summary } = playBot(20, { skill: 'perfekt' });
  assert.equal(summary.hit + summary.escaped, LEVELS[19].total);
});

test('Verteidigung: fünf besetzte Sitze verlieren, Sitzanimation, Ergebnis ohne ungültige Prozentwerte', () => {
  const g = new Game({ level: 8, layout: 'land', seed: 1 });
  assert.equal(g.summary().accuracy, null, 'keine Schläge → kein Prozentwert');
  while (!g.done && g.t < 200) g.advance(0.5);
  assert.ok(g.status === 'lost' && g.escaped === 5 && g.defense === 0);
  assert.equal(g.summary().stars, 0);
  assert.equal(g.occupied.size, 5);
  g.advance(3);
  assert.ok(g.enemies.every((e) => e.state !== 'sit'), 'Sitzanimation endet, Figur verschwindet');
  assert.equal(g.drainEvents().filter((e) => e.type === 'lost').length, 1);
});

test('Große Klatsche: erst ab Level 10, lädt nach 10 besiegten Gegnern, höchstens eine Ladung, ein Treffer je Gegner, kein Selbstläufer bei Helm/Boss', () => {
  const g0 = bare(9); assert.ok(!g0.powerEnabled);
  const g = bare(POWER_FROM_LEVEL);
  assert.ok(g.powerEnabled && !g.arm(true), 'ohne Ladung nicht scharf');
  for (let i = 0; i < POWER_EVERY; i++) { const e = put(g, 'standard'); wait(g); g.strike(e.x, e.y); }
  assert.equal(g.charge, 1);
  for (let i = 0; i < POWER_EVERY; i++) { const e = put(g, 'standard'); wait(g); g.strike(e.x, e.y); }
  assert.equal(g.charge, 1, 'nie mehr als eine Ladung');
  g.enemies.length = 0;
  const a = put(g, 'standard'), h = put(g, 'helm'), s = put(g, 'standard');
  wait(g);
  a.x = h.x = s.x = 800; a.y = h.y = s.y = 500; s.x = 1500;
  assert.ok(g.arm(true));
  const r = g.strike(800, 500);
  assert.ok(r.power && r.hits.length === 2, 'Radius trifft nahe Gegner, nicht den fernen');
  assert.ok(r.hits.find((x) => x.id === a.id).killed);
  assert.ok(!r.hits.find((x) => x.id === h.id).killed && h.hp === 1, 'Helmträger überlebt den ersten Treffer');
  assert.equal(g.charge, 0);
  assert.ok(!g.armed);
  // neues Level: Ladung zurück auf 0
  assert.equal(new Game({ level: 11, seed: 1 }).charge, 0);
});

test('Zeit: große Sprünge werden gedeckelt, Zustand springt nicht, Layoutwechsel behält alle Gegner', () => {
  const g = new Game({ level: 14, layout: 'land', seed: 2 });
  g.update(10);
  assert.ok(g.t <= 0.26, 'ein Aufruf verarbeitet höchstens 0,25 s: ' + g.t);
  for (let i = 0; i < 200; i++) g.update(0.016);
  const before = g.enemies.map((e) => e.id + ':' + e.p.toFixed(3));
  g.setLayout('port');
  assert.deepEqual(g.enemies.map((e) => e.id + ':' + e.p.toFixed(3)), before);
  for (const e of g.enemies) assert.ok(Number.isFinite(e.x) && Number.isFinite(e.y));
  g.setLayout('land');
  for (const e of g.enemies) assert.ok(Number.isFinite(e.x) && Number.isFinite(e.y));
});

test('Warnung vor jedem Auftritt, nie mehr als das Limit gleichzeitig, jede Warnung wird ein Gegner', () => {
  for (const level of [6, 18, 24, 30]) {
    const g = new Game({ level, layout: 'land', seed: 4 });
    let warns = 0, spawns = 0, max = 0, next = 0.5;
    while (!g.done && g.t < 300) {
      g.advance(STEP);
      if (g.t >= next) { const e = g.enemies.filter((x) => x.state === 'walk').sort((p, q) => q.p - p.p)[0]; if (e) { g.strike(e.x, e.y); next = g.t + 0.3; } }
      for (const ev of g.drainEvents()) { if (ev.type === 'warn') warns++; if (ev.type === 'spawn') spawns++; }
      max = Math.max(max, g.activeCount);
      assert.ok(g.activeCount + g.warnings.length <= g.cap, `Level ${level}: ${g.activeCount}+${g.warnings.length} > ${g.cap}`);
    }
    assert.ok(g.status === 'won', 'Level ' + level);
    assert.equal(warns, spawns, 'jede Warnung wird zu einem Gegner, Level ' + level);
    assert.equal(spawns, LEVELS[level - 1].total, 'alle Gegner erscheinen');
    assert.ok(max >= (level >= 18 ? 3 : 1) && max <= 9, `gleichzeitig aktiv: ${max}`);
  }
});

test('Bot (perfekt): alle 30 Level in beiden Ausrichtungen schaffbar, Zählung und Ende stimmen, keine NaN', () => {
  for (const layout of ['land', 'port']) {
    for (const L of LEVELS) {
      const { g, summary } = playBot(L.id, { layout, skill: 'perfekt', sizeFactor: layout === 'port' ? 0.8 : 1, minHit: layout === 'port' ? 55 : 28 });
      assert.ok(summary.won, `Level ${L.id} ${layout} nicht gewonnen (${summary.hit}/${summary.total}, ${summary.escaped} entkommen)`);
      assert.equal(summary.hit + summary.escaped, L.total, `Zählung Level ${L.id}`);
      assert.equal(g.resolved, L.total);
      assert.equal(g.remaining, 0);
      assert.ok(Number.isFinite(g.score) && g.score > 0);
      assert.ok(summary.stars >= 2, `Level ${L.id} ${layout}: ${summary.stars} Sterne`);
      assert.ok(g.enemies.every((e) => e.state !== 'walk'));
    }
  }
});

test('Schwierigkeit: lockere Spieler scheitern in den späten Leveln, gute Spieler schaffen die frühen sicher', () => {
  for (const id of [1, 2, 3, 6, 9, 12]) assert.ok(playBot(id, { skill: 'locker' }).summary.won, 'locker Level ' + id);
  let fails = 0;
  for (const id of [24, 26, 27, 28, 29, 30]) if (!playBot(id, { skill: 'locker' }).summary.won) fails++;
  assert.ok(fails >= 3, 'späte Level fordern: lockere Bots scheitern in ' + fails + ' von 6');
  assert.equal(playBot(30, { skill: 'perfekt' }).summary.stars, 3);
});

test('Level 1, 6, 12, 18, 24, 30: reproduzierbar (gleicher Startwert, gleiches Ergebnis)', () => {
  for (const id of [1, 6, 12, 18, 24, 30]) {
    const a = playBot(id, { skill: 'gut', seed: 5 }).summary, b = playBot(id, { skill: 'gut', seed: 5 }).summary;
    assert.deepEqual(a, b);
  }
});

test('Dauersitzung: fünf Sitze für die ganze Runde, Wellen steigen langsam, Limits, Boss alle fünf Wellen, Verschnaufpausen', () => {
  const lim = (n) => endlessParams(n);
  for (let n = 1; n < 60; n++) {
    assert.ok(lim(n).cap <= 9 && lim(n + 1).cap >= lim(n).cap, 'Cap steigt nicht zurück ' + n);
    assert.ok(lim(n).speed <= 1.6 && lim(n + 1).speed >= lim(n).speed, 'Tempo gedeckelt ' + n);
  }
  assert.ok(buildEndlessWave(5, 1).events.some((e) => e.type === 'boss') && !buildEndlessWave(4, 1).events.some((e) => e.type === 'boss'));
  assert.ok(lim(4).relief > lim(3).relief, 'längere Pause nach jeder vierten Welle');
  const { g, summary } = playBot('endless', { skill: 'gut', limit: 240, seed: 2 });
  assert.equal(g.mode, 'endless');
  assert.ok(summary.wave >= 3 && summary.score > 0 && summary.time > 60, 'läuft weiter: Welle ' + summary.wave);
  assert.ok(g.defense >= 0 && g.defense <= 5);
  assert.deepEqual(playBot('endless', { skill: 'gut', limit: 120, seed: 2 }).summary, playBot('endless', { skill: 'gut', limit: 120, seed: 2 }).summary);
  const none = new Game({ level: 'endless', seed: 1 });
  while (!none.done && none.t < 400) none.advance(0.5);
  assert.ok(none.status === 'lost' && none.escaped === 5, 'ohne Schläge nach fünf Sitzen vorbei');
});

test('Bosse: Namen, Zubehör und eigene Tempi vollständig', () => {
  assert.deepEqual(Object.values(BOSSES).map((b) => b.name), ['Der Hinterbänkler', 'Der Fraktionskrabbler', 'Der Dauerredner', 'Der Ausschusskönig', 'Der große Vorsitzende']);
  for (const b of Object.values(BOSSES)) assert.ok(b.accessory && b.speed > 0 && b.speed < 0.7);
});
