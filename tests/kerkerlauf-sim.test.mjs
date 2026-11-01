// Kerkerlauf – Regeln ohne Browser: faire Strecke, Springen, Angriff, Kombo, Münzen, Truhe, Tempo, Spielstand, Bot-Dauerlauf.
// node --test tests/kerkerlauf-sim.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../public/spiele/kerkerlauf/logik.js';
import { bot, botLauf } from '../tools/kerkerlauf-bot.mjs';

const BLOCK = new Set(['kiste', 'fass', 'stapel']);
const lauf = (f, sek, ein = () => ({})) => { const ev = []; for (let i = 0; i < sek * 60 && !f.tot; i++) ev.push(...L.schritt(f, 1 / 60, ein(i))); return ev; };
const setze = (f, items) => { f.strecke.items = items.map((it, i) => ({ id: 900 + i, ...it })); f.strecke.next = 1e9; };

test('Strecke: jede Reihe hat mindestens eine Spur ohne Kiste/Fass/Stapel, Pfad springt höchstens eine Spur', () => {
  for (let seed = 1; seed <= 60; seed++) {
    const s = L.neueStrecke(seed); L.erzeuge(s, 6000);
    const reihen = new Map();
    for (const it of s.items) if (BLOCK.has(it.typ) || it.typ === 'stachel' || it.typ === 'skelett') (reihen.get(it.d) || reihen.set(it.d, []).get(it.d)).push(it);
    for (const [d, its] of reihen) {
      const blockiert = new Set(its.filter((i) => BLOCK.has(i.typ)).map((i) => i.spur));
      assert.ok(blockiert.size <= 2, `Seed ${seed}, ${d} m: alle Spuren zu`);
      const zwei = new Set(its.map((i) => i.spur));
      assert.ok(zwei.size <= 3);
    }
    const ds = [...reihen.keys()].sort((a, b) => a - b);
    assert.ok(ds[0] >= 45, 'Start bleibt frei');
    for (let i = 1; i < ds.length; i++) assert.ok(ds[i] - ds[i - 1] >= 12.9, `Reihenabstand ${ds[i] - ds[i - 1]}`);
  }
});

test('Tempo steigt gleichmäßig und ist gedeckelt; Kombo ×1 bis ×5', () => {
  assert.equal(L.tempo(0), 9);
  assert.ok(L.tempo(1000) > L.tempo(500));
  assert.equal(L.tempo(99999), 22);
  assert.deepEqual([0, 2, 3, 6, 12, 40].map(L.kombo), [1, 1, 2, 3, 5, 5]);
});

test('Kiste in der Spur: Sturz; Spurwechsel weicht aus', () => {
  const f = L.neuerLauf(1); setze(f, [{ typ: 'kiste', spur: 1, d: 12 }]);
  lauf(f, 3); assert.ok(f.tot); assert.equal(f.getroffen, 'kiste');
  const g = L.neuerLauf(1); setze(g, [{ typ: 'kiste', spur: 1, d: 12 }]);
  lauf(g, 3, (i) => ({ links: i === 5 })); assert.ok(!g.tot && g.spur === 0 && g.d > 20);
  // Am Rand geht es nicht weiter
  const h = L.neuerLauf(1); setze(h, []); lauf(h, 1, () => ({ links: true })); assert.equal(h.spur, 0); assert.equal(h.x, -3);
});

test('Stacheln: nur im Sprung passierbar', () => {
  const f = L.neuerLauf(1); setze(f, [{ typ: 'stachel', spur: 1, d: 12 }]);
  lauf(f, 3); assert.ok(f.tot); assert.equal(f.getroffen, 'stachel');
  const g = L.neuerLauf(1); setze(g, [{ typ: 'stachel', spur: 1, d: 12 }]);
  // Sprung ca. 0,3 s vor den Stacheln
  lauf(g, 3, () => ({ sprung: g.d > 9 && g.d < 9.5 })); assert.ok(!g.tot, 'Sprung rettet'); assert.ok(g.d > 20);
});

test('Skelett: Angriff in Reichweite besiegt es (Kombo zählt), ohne Angriff Sturz, verpasstes Skelett beendet die Serie', () => {
  const f = L.neuerLauf(1); setze(f, [{ typ: 'skelett', art: 'diener', spur: 1, d: 15 }]);
  lauf(f, 3); assert.ok(f.tot); assert.equal(f.getroffen, 'diener');
  const g = L.neuerLauf(1);
  setze(g, [1, 2, 3, 4].map((k) => ({ typ: 'skelett', art: 'krieger', spur: 1, d: 15 * k })).concat([{ typ: 'skelett', art: 'diener', spur: 0, d: 75 }]));
  const ev = lauf(g, 9, () => ({ angriff: g.strecke.items.some((it) => it.typ === 'skelett' && it.spur === 1 && !it.besiegt && it.d - g.d < 4 && it.d > g.d) }));
  assert.ok(!g.tot); assert.equal(g.kills, 4); assert.equal(g.besteSerie, 4);
  assert.equal(g.bonus, 50 + 50 + 50 + 100, 'ab dem vierten Treffer in Folge ×2');
  assert.ok(ev.includes('serieWeg') && g.serie === 0, 'Skelett in Nachbarspur verpasst → Serie weg');
  // Angriff außer Reichweite trifft nicht
  const h = L.neuerLauf(1); setze(h, [{ typ: 'skelett', art: 'diener', spur: 1, d: 30 }]);
  L.schritt(h, 1 / 60, { angriff: true }); assert.equal(h.kills, 0);
});

test('Münzen und Truhe: werden gezählt, Münzen über Stacheln nur im Sprung', () => {
  const f = L.neuerLauf(1); setze(f, [{ typ: 'muenze', spur: 1, d: 10, y: 0.9 }, { typ: 'muenze', spur: 0, d: 12, y: 0.9 }, { typ: 'truhe', spur: 1, d: 16 }, { typ: 'muenze', spur: 1, d: 22, y: 2.6 }]);
  lauf(f, 3);
  assert.equal(f.muenzen, 11); assert.equal(f.truhen, 1);
  assert.equal(L.punkte(f), Math.floor(f.d) + 11 * 10 + 100);
});

test('Spielstand: prüfen, verbuchen, Rekord, freischalten', () => {
  assert.deepEqual(L.pruefeStand(null), L.leerStand());
  const st = L.pruefeStand({ gold: -5, rekord: 'x', helden: ['magier', 'quatsch'], held: 'magier', ton: false });
  assert.deepEqual(st.helden, ['ritter', 'magier']); assert.equal(st.held, 'magier'); assert.equal(st.gold, 0); assert.equal(st.ton, false);
  const f = L.neuerLauf(1); f.d = 321; f.muenzen = 520; f.kills = 3; f.bonus = 150;
  assert.equal(L.verbuche(st, f), true); assert.equal(st.gold, 520); assert.equal(st.rekord, 321 + 5200 + 150);
  assert.equal(L.verbuche(st, L.neuerLauf(2)), false);
  assert.equal(L.freischalten(st, 'schurke'), false, 'zu teuer');
  assert.equal(L.freischalten(st, 'barbar'), true); assert.equal(st.gold, 20); assert.equal(st.held, 'barbar');
  assert.equal(L.freischalten(st, 'barbar'), false, 'schon frei');
});

test('Bot läuft 30 Strecken à 4000 m ohne Sturz (jede Strecke ist machbar)', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const f = L.neuerLauf(seed * 7919);
    for (let i = 0; i < 60 * 600 && f.d < 4000 && !f.tot; i++) L.schritt(f, 1 / 60, bot(f));
    assert.ok(!f.tot, `Seed ${seed}: Sturz bei ${Math.floor(f.d)} m (${f.getroffen})`);
    assert.ok(f.muenzen > 100 && f.kills > 8, `Seed ${seed}: ${f.muenzen} Münzen, ${f.kills} Skelette`);
  }
});

// ---------- Geprüfte Rangliste: Aufzeichnen und Nachspielen ----------
test('Eingaben: kodieren/dekodieren, kaputte Texte werden abgelehnt', () => {
  const e = [[0, 8], [5, 1], [6, 4], [300, 15]];
  assert.deepEqual(L.dekodiere(L.kodiere(e)), e);
  assert.deepEqual(L.dekodiere(''), []);
  for (const x of ['a:1', '3:0', '3:16', '3:1,0:2', '3;1', null]) assert.equal(L.dekodiere(x), null, String(x));
});

test('Nachspielen: echter Lauf wird bestätigt, jede Manipulation abgelehnt', () => {
  const l = botLauf(20261101, 900);
  assert.ok(l.punkte > 900 && l.kills > 3, JSON.stringify({ ...l, inputs: l.inputs.length }));
  const r = L.pruefeLauf(l);
  assert.equal(r.ok, true, JSON.stringify(r)); assert.equal(r.punkte, l.punkte);
  const falsch = [
    [{ ...l, punkte: l.punkte + 50 }, 'abweichung'], [{ ...l, gold: l.gold + 1 }, 'abweichung'], [{ ...l, kills: l.kills + 1 }, 'abweichung'],
    [{ ...l, takte: l.takte - 1 }, 'kein_ende'], [{ ...l, takte: l.takte + 30 }, 'zu_lang'], [{ ...l, seed: l.seed + 1 }, null],
    [{ ...l, inputs: 'x' }, 'eingaben'], [{ ...l, v: 99 }, 'ungueltig'], [{ ...l, takte: L.MAX_TAKTE + 1 }, 'ungueltig'],
  ];
  for (const [x, grund] of falsch) { const q = L.pruefeLauf(x); assert.equal(q.ok, false, grund); if (grund) assert.equal(q.grund, grund); }
});

test('Tagesbestwert: nur ein besserer Lauf am selben Tag zählt als neuer Tagesbestwert', () => {
  const st = L.leerStand();
  const a = L.neuerLauf(1); a.d = 500; L.verbuche(st, a, 20261101); assert.equal(a.tagesBest, true); assert.equal(st.tagBest, 500);
  const b = L.neuerLauf(1); b.d = 300; L.verbuche(st, b, 20261101); assert.ok(!b.tagesBest); assert.equal(st.tagBest, 500);
  const c = L.neuerLauf(1); c.d = 100; L.verbuche(st, c, 20261102); assert.equal(c.tagesBest, true); assert.equal(st.tag, 20261102);
  assert.equal(L.berlinTag(new Date('2026-10-31T23:30:00Z')), 20261101);
});
