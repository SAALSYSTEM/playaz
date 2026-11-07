// Gleich, gleich! – Regeln, Level, Fiete (fair und schlagbar), Sterne, Spielstand.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import * as E from '../public/spiele/gleich-gleich/engine.js';

const IMG = new URL('../public/spiele/gleich-gleich/img/', import.meta.url).pathname;

test('21 Level in 7 Welten, jedes Motiv hat ein Bild, Namen eindeutig je Welt', () => {
  assert.equal(E.WELTEN.length, 7); assert.equal(E.LEVELS.length, 21);
  for (const w of E.WELTEN) {
    assert.equal(new Set(w.motive.map((m) => m[0])).size, w.motive.length);
    assert.equal(new Set(w.motive.map((m) => m[1])).size, w.motive.length, w.name + ': gleiche Namen');
    for (const [id] of w.motive) assert.ok(existsSync(IMG + id + '.webp'), 'Bild fehlt: ' + id);
  }
  for (const f of ['rueckseite', 'fiete', 'fiete-denkt', 'fiete-jubel']) assert.ok(existsSync(IMG + f + '.webp'), f);
  for (const l of E.LEVELS) { assert.ok(l.paare >= 3 && l.paare <= 8); assert.ok(l.paare <= E.WELTEN[l.welt].motive.length); }
  assert.equal(E.LEVELS[0].paare, 3, 'Einstieg mit 6 Karten');
});

test('Kartendeck: jedes Motiv genau zweimal, Seed reproduzierbar', () => {
  for (const l of E.LEVELS) {
    const s = E.neu(l.nr, 'allein', 42 + l.nr);
    assert.equal(s.karten.length, l.paare * 2);
    const z = {}; for (const k of s.karten) z[k.m] = (z[k.m] || 0) + 1;
    assert.ok(Object.values(z).every((n) => n === 2));
    assert.deepEqual(E.neu(l.nr, 'allein', 42 + l.nr).karten.map((k) => k.m), s.karten.map((k) => k.m));
  }
});

test('Regeln: Paar bleibt liegen und man bleibt dran, daneben wechselt der Spieler', () => {
  const s = E.neu(1, 'zwei', 7);
  const m0 = s.karten[0].m, partner = s.karten.findIndex((k, i) => i > 0 && k.m === m0);
  const fremd = s.karten.findIndex((k) => k.m !== m0);
  assert.equal(E.aufdecken(s, 0), 'erste');
  assert.equal(E.aufdecken(s, 0), null, 'gleiche Karte zweimal geht nicht');
  assert.equal(E.aufdecken(s, partner), 'paar');
  assert.equal(s.paare[0], 1); assert.equal(s.dran, 0);
  assert.equal(E.aufdecken(s, 0), null, 'gefundene Karte ist weg');
  const andere = s.karten.findIndex((k, i) => k.weg < 0 && i !== fremd && k.m !== s.karten[fremd].m);
  E.aufdecken(s, fremd); assert.equal(E.aufdecken(s, andere), 'daneben');
  assert.equal(E.aufdecken(s, s.karten.findIndex((k) => k.weg < 0 && !k.offen)), null, 'nicht mehr als 2 offen');
  E.zudecken(s); assert.equal(s.dran, 1); assert.ok(s.karten.every((k) => k.weg >= 0 || !k.offen));
  const a = E.neu(1, 'allein', 7); E.aufdecken(a, fremd); E.aufdecken(a, andere); E.zudecken(a); assert.equal(a.dran, 0, 'allein bleibt man dran');
});

function partieAllein(nr, seed, perfekt) {
  const s = E.neu(nr, 'allein', seed), r = E.rng(seed), wissen = {};
  let n = 0;
  while (!s.ende && n++ < 500) {
    const zu = E.verdeckt(s);
    const zufall = () => zu.filter((i) => !(i in wissen) && !s.karten[i].offen)[0] ?? zu.find((i) => !s.karten[i].offen);
    let a = zufall();
    if (perfekt) { const p = {}; for (const i of zu) if (i in wissen) { if (p[wissen[i]] !== undefined) { a = p[wissen[i]]; break; } p[wissen[i]] = i; } }
    E.aufdecken(s, a); wissen[a] = s.karten[a].m;
    let b = perfekt ? zu.find((i) => i !== a && wissen[i] === s.karten[a].m) : undefined;
    if (b === undefined) { const frei = zu.filter((i) => i !== a && !(i in wissen)); b = frei.length ? frei[Math.floor(r() * frei.length)] : zu.find((i) => i !== a); }
    if (E.aufdecken(s, b) === 'daneben') { wissen[b] = s.karten[b].m; E.zudecken(s); }
  }
  return s;
}

test('Allein: jede Partie endet, gutes Gedächtnis bekommt 3 Sterne, Sterne nie unter 1', () => {
  let drei = 0, total = 0;
  for (const l of E.LEVELS) for (let k = 0; k < 40; k++) {
    const s = partieAllein(l.nr, 1000 * l.nr + k, true); assert.ok(s.ende); total++;
    const st = E.sterne(s); assert.ok(st >= 1 && st <= 3); if (st === 3) drei++;
    assert.equal(s.paare[0], l.paare);
  }
  assert.ok(drei / total > 0.85, 'perfektes Gedächtnis meist 3 Sterne: ' + drei + '/' + total);
});

test('Fiete nutzt nur, was er gesehen hat (verdeckte Motive tauschen ändert seinen Zug nicht)', () => {
  for (let k = 0; k < 300; k++) {
    const nr = 1 + (k % 21), s = E.neu(nr, 'fiete', 500 + k), r = E.rng(k);
    // ein paar zufällige Züge, damit Fiete etwas gesehen hat
    for (let z = 0; z < 4 && !s.ende; z++) {
      const zu = E.verdeckt(s); E.aufdecken(s, zu[Math.floor(r() * zu.length)], r);
      const zu2 = E.verdeckt(s).filter((i) => !s.karten[i].offen); if (!zu2.length) break;
      if (E.aufdecken(s, zu2[Math.floor(r() * zu2.length)], r) === 'daneben') E.zudecken(s);
    }
    if (s.ende) continue;
    const kopie = structuredClone(s);
    // zwei Karten, die Fiete nicht kennt und die nicht offen liegen, tauschen
    const fremd = E.verdeckt(kopie).filter((i) => !(i in kopie.gedaechtnis) && !kopie.karten[i].offen);
    if (fremd.length >= 2) { const [x, y] = fremd; [kopie.karten[x].m, kopie.karten[y].m] = [kopie.karten[y].m, kopie.karten[x].m]; }
    assert.equal(E.fieteWahl(kopie, E.rng(9)), E.fieteWahl(s, E.rng(9)));
  }
});

// Kind-Modell: merkt sich jede gesehene Karte mit Wahrscheinlichkeit kindMerk (wie Fiete, nur mit eigener Quote)
function partieFiete(nr, seed, kindMerk) {
  const s = E.neu(nr, 'fiete', seed), r = E.rng(seed * 7 + 1), merk = E.rng(seed * 13 + 5), kr = E.rng(seed * 3 + 2), kw = {};
  const sieht = (i) => { if (kr() < kindMerk) kw[i] = s.karten[i].m; };
  let n = 0;
  while (!s.ende && n++ < 1000) {
    if (s.dran === 1) {
      const a = E.fieteWahl(s, r); E.aufdecken(s, a, merk); sieht(a);
      const b = E.fieteWahl(s, r); const e = E.aufdecken(s, b, merk); sieht(b);
      assert.ok(e === 'paar' || e === 'daneben'); if (e === 'daneben') E.zudecken(s);
      continue;
    }
    const zu = E.verdeckt(s), kennt = (i) => i in kw && zu.includes(i);
    let a; const p = {};
    for (const i of zu) if (kennt(i)) { if (p[kw[i]] !== undefined) { a = p[kw[i]]; break; } p[kw[i]] = i; }
    if (a === undefined) { const fr = zu.filter((i) => !kennt(i)); a = fr.length ? fr[Math.floor(r() * fr.length)] : zu[0]; }
    E.aufdecken(s, a, merk); sieht(a);
    let b = zu.find((i) => i !== a && kennt(i) && kw[i] === s.karten[a].m);
    if (b === undefined) { const frei = zu.filter((i) => i !== a && !kennt(i)); b = frei.length ? frei[Math.floor(r() * frei.length)] : zu.find((i) => i !== a); }
    const e = E.aufdecken(s, b, merk); sieht(b); if (e === 'daneben') E.zudecken(s);
  }
  return s;
}

test('Gegen Fiete: Partien enden, ein Kind mit mittlerem Gedächtnis gewinnt meistens, Fiete aber auch mal', () => {
  for (const welt of [0, 3, 6]) {
    const lv = E.LEVELS.filter((l) => l.welt === welt).at(-1);
    let kindGewinnt = 0, fieteGewinnt = 0;
    for (let k = 0; k < 400; k++) {
      const s = partieFiete(lv.nr, 77 + k, 0.5); assert.ok(s.ende);
      assert.equal(s.paare[0] + s.paare[1], lv.paare);
      if (s.paare[0] > s.paare[1]) kindGewinnt++; else if (s.paare[1] > s.paare[0]) fieteGewinnt++;
    }
    assert.ok(kindGewinnt > fieteGewinnt, `Welt ${welt + 1}: Kind ${kindGewinnt}, Fiete ${fieteGewinnt}`);
    assert.ok(fieteGewinnt > 30, `Welt ${welt + 1}: Fiete gewinnt manchmal (${fieteGewinnt}/400)`);
  }
});

test('Raster: Karten passen ins Brett, keine leere Reihe', () => {
  for (const n of [6, 8, 12, 16]) for (const [w, h] of [[296, 420], [336, 470], [376, 560], [560, 700]]) {
    const g = E.raster(n, w, h, 8);
    assert.ok(g.w > 40, `${n} Karten in ${w}x${h}`);
    assert.ok(g.spalten * g.w + (g.spalten - 1) * 8 <= w + 1);
    assert.ok(g.zeilen * g.w * 4 / 3 + (g.zeilen - 1) * 8 <= h + 1);
    assert.ok(g.spalten * g.zeilen - n < g.spalten);
  }
});

test('Spielstand: Unsinn wird verworfen, Freischalten der Reihe nach', () => {
  assert.deepEqual(E.ladeStand('kaputt{'), { v: 1, best: {}, modus: 'allein', voice: true });
  const d = E.ladeStand(JSON.stringify({ best: { 1: 3, 2: 9, 3: 2, x: 1, 40: 2 }, modus: 'hack', voice: false }));
  assert.deepEqual(d.best, { 1: 3, 3: 2 }); assert.equal(d.modus, 'allein'); assert.equal(d.voice, false);
  assert.equal(E.offenBis({}), 1); assert.equal(E.offenBis({ 1: 1, 2: 3 }), 3);
  const alle = Object.fromEntries(E.LEVELS.map((l) => [l.nr, 1])); assert.equal(E.offenBis(alle), 21);
});
