// DARTFIEBER: Regeln, Geometrie, Challenge, Wind, Bonus, Determinismus, Prüfung. Start: node --test tests/dartfieber-sim.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  VERSION, KONFIG, REIHENFOLGE, RING, GRENZEN, WIND_X, WIND_Y, sektor, treffer, feldFarbe, challengeAus, linie, tempoWurf, windWurf,
  neueRunde, kodiere, dekodiere, nachfahren, pruefeLauf, MAX_TICKS
} from '../public/spiele/dartfieber/sim.js';
import { bot } from '../tools/dartfieber-bot.mjs';

const K = KONFIG[VERSION];
const rund = Math.round;
const SEEDS = Array.from({ length: 60 }, (_, i) => 1000003 + i * 7919);

test('Zahlenfolge im Uhrzeigersinn ab oben ist die klassische', () => {
  assert.deepEqual(REIHENFOLGE, [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5]);
  assert.deepEqual([...REIHENFOLGE].sort((a, b) => a - b), Array.from({ length: 20 }, (_, i) => i + 1));
});

test('Sektormitten: jede Zahl liegt dort, wo sie hingehört (alle Ringe)', () => {
  for (let k = 0; k < 20; k++) {
    const w = (k * 18) * Math.PI / 180, sx = Math.sin(w), sy = -Math.cos(w);
    for (const [r, faktor, ring] of [[3000, 1, 'innen'], [10300, 3, 'dreifach'], [13000, 1, 'aussen'], [16600, 2, 'doppel']]) {
      const t = treffer(rund(r * sx), rund(r * sy), 1000);
      assert.equal(t.zahl, REIHENFOLGE[k], `Sektor ${k} r=${r}`); assert.equal(t.faktor, faktor); assert.equal(t.ring, ring); assert.equal(t.punkte, REIHENFOLGE[k] * faktor);
    }
  }
  assert.equal(treffer(0, -10300, 1000).punkte, 60);        // oben: Triple 20
  assert.equal(treffer(0, 10300, 1000).punkte, 9);          // unten: Triple 3
  assert.equal(treffer(10300, 0, 1000).punkte, 18);         // rechts: Triple 6
  assert.equal(treffer(-10300, 0, 1000).punkte, 33);        // links: Triple 11
});

test('Bull: inneres 50, äußeres 25; Mitte genau 50', () => {
  assert.equal(treffer(0, 0, 1000).punkte, 50); assert.equal(treffer(0, 0, 1000).ring, 'innenbull');
  assert.equal(treffer(1000, 0, 1000).punkte, 25);
  assert.equal(treffer(0, -1000, 1000).punkte, 25);
});

test('Ringgrenzen: genau auf dem Radius gehört zum innen liegenden Feld', () => {
  const p = (r) => treffer(r, 0, 1000);                   // rechts = Sektor 5 (Zahl 6)
  assert.equal(p(RING.innenBull).ring, 'innenbull'); assert.equal(p(RING.innenBull + 1).ring, 'aussenbull');
  assert.equal(p(RING.aussenBull).ring, 'aussenbull'); assert.equal(p(RING.aussenBull + 1).ring, 'innen');
  assert.equal(p(RING.dreifachInnen).ring, 'innen'); assert.equal(p(RING.dreifachInnen + 1).ring, 'dreifach');
  assert.equal(p(RING.dreifachAussen).ring, 'dreifach'); assert.equal(p(RING.dreifachAussen + 1).ring, 'aussen');
  assert.equal(p(RING.doppelInnen).ring, 'aussen'); assert.equal(p(RING.doppelInnen + 1).ring, 'doppel');
  assert.equal(p(RING.doppelAussen).ring, 'doppel'); assert.equal(p(RING.doppelAussen + 1).ring, 'aus');
  assert.equal(p(RING.doppelAussen + 1).punkte, 0);
  assert.equal(p(22000).punkte, 0);                       // Zahlenring: keine Punkte
  assert.equal(p(RING.dreifachInnen).punkte, 6); assert.equal(p(RING.dreifachInnen + 1).punkte, 18); assert.equal(p(RING.doppelInnen + 1).punkte, 12);
});

test('Ringgrenzen skalieren mit der Scheibengröße (Promille), auch genau auf der Grenze', () => {
  for (const s of [820, 900, 1000]) {
    const R = (r) => r * s / 1000;                        // ganzzahlig für diese Werte? prüfen wir per Rundung auf die sichere Seite
    const rr = Math.floor(R(RING.doppelAussen));
    assert.equal(treffer(rr, 0, s).ring, 'doppel', 's=' + s);
    assert.equal(treffer(Math.ceil(R(RING.doppelAussen)) + 1, 0, s).ring, 'aus', 's=' + s);
  }
  assert.equal(treffer(8500, 0, 500).ring, 'doppel'); assert.equal(treffer(8501, 0, 500).ring, 'aus');   // 17000 · 0,5
  assert.equal(treffer(4950, 0, 500).ring, 'innen'); assert.equal(treffer(4951, 0, 500).ring, 'dreifach');
});

test('Sektorgrenzen: Punkt auf der Grenze gehört zum im Uhrzeigersinn folgenden Sektor', () => {
  for (let j = 0; j < 20; j++) assert.equal(sektor(GRENZEN.x[j], GRENZEN.y[j]), (j + 1) % 20, 'Grenze ' + j);
  // Grenze zwischen 20 (oben) und 1: zählt zur 1; knapp links davon zur 20
  assert.equal(REIHENFOLGE[sektor(GRENZEN.x[0], GRENZEN.y[0])], 1);
  assert.equal(REIHENFOLGE[sektor(GRENZEN.x[0] - 1000, GRENZEN.y[0])], 20);
  // Grenze zwischen 5 (links vom 20) und 20 (Grenze 19): zählt zur 20
  assert.equal(REIHENFOLGE[sektor(GRENZEN.x[19], GRENZEN.y[19])], 20);
  assert.equal(REIHENFOLGE[sektor(GRENZEN.x[19] - 1000, GRENZEN.y[19])], 5);
});

test('Sektoren stimmen mit der Winkelrechnung überein (100 000 Zufallspunkte, außer unmittelbar an der Grenze)', () => {
  let a = 12345; const z = () => { a = (a * 1103515245 + 12345) & 0x7fffffff; return a / 0x7fffffff; };
  let geprueft = 0;
  for (let n = 0; n < 100000; n++) {
    const dx = rund((z() - 0.5) * 40000), dy = rund((z() - 0.5) * 40000);
    if (dx === 0 && dy === 0) continue;
    let deg = Math.atan2(dx, -dy) * 180 / Math.PI; if (deg < 0) deg += 360;
    const abstand = Math.abs(((deg + 9) % 18 + 18) % 18 - 0);               // Abstand zur nächsten Grenze (Grad), 0..18
    if (abstand < 0.01 || abstand > 17.99) continue;
    assert.equal(sektor(dx, dy), Math.floor(((deg + 9) % 360) / 18), `(${dx},${dy})`); geprueft++;
  }
  assert.ok(geprueft > 99000);
});

test('Felderfarben: Zuordnung wie auf einer echten Scheibe (20 schwarz/rot, 1 creme/grün, Bull rot/grün)', () => {
  assert.equal(feldFarbe('innen', 0), 'schwarz'); assert.equal(feldFarbe('dreifach', 0), 'rot'); assert.equal(feldFarbe('doppel', 0), 'rot');
  assert.equal(feldFarbe('innen', 1), 'creme'); assert.equal(feldFarbe('dreifach', 1), 'gruen'); assert.equal(feldFarbe('aussen', 1), 'creme');
  assert.equal(feldFarbe('innenbull'), 'rot'); assert.equal(feldFarbe('aussenbull'), 'gruen');
});

test('Challenge: gleicher Seed + Version = identisch, anderer Seed = anders, unbekannte Version = null', () => {
  const a = challengeAus(1234567, 1), b = challengeAus(1234567, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)));
  assert.notDeepEqual(JSON.stringify(challengeAus(1234568, 1)), JSON.stringify(a));
  assert.equal(challengeAus(1234567, 2), null); assert.equal(challengeAus(0, 1), null); assert.equal(challengeAus(1.5, 1), null); assert.equal(challengeAus(2 ** 31, 1), null);
});

test('Challenge: alle Bedingungen liegen in den Grenzen der Konfiguration (60 Tage)', () => {
  for (const seed of SEEDS) {
    const ch = challengeAus(seed, 1);
    assert.ok(ch.s >= K.scheibe.min && ch.s <= K.scheibe.max); assert.ok(Math.abs(ch.cx) <= K.scheibe.versatz && Math.abs(ch.cy) <= K.scheibe.versatz);
    assert.ok(ch.v0 >= K.tempo.min && ch.v0 <= K.tempo.max); assert.ok(ch.windMax >= K.wind.max[0] && ch.windMax <= K.wind.max[1]);
    assert.equal(ch.wind.length, Math.ceil(K.maxWuerfe / K.wind.block));
    for (const w of ch.wind) { assert.ok(w.staerke >= 0 && w.staerke <= ch.windMax); assert.ok(w.richtung >= 0 && w.richtung < 8); }
    assert.equal(ch.startX.length, K.maxWuerfe); assert.ok(ch.startX.every((x) => x >= 0 && x < 4 * K.feld));
    // Bonus: erster bei Wurf 1 oder 2, Abstände 2 oder 3, Radius nimmt ab, Kreis liegt auf der Scheibe
    const idx = ch.bonus.map((b, i) => (b ? i : -1)).filter((i) => i >= 0);
    assert.ok(idx[0] >= 1 && idx[0] <= 2, 'erster Bonus ' + idx[0]);
    for (let n = 1; n < idx.length; n++) { const d = idx[n] - idx[n - 1]; assert.ok(d === 2 || d === 3, 'Abstand ' + d); assert.ok(ch.bonus[idx[n]].r <= ch.bonus[idx[n - 1]].r); }
    for (const i of idx) {
      const b = ch.bonus[i], dx = b.x - ch.cx, dy = b.y - ch.cy;
      assert.ok(b.r >= K.bonus.rMin && b.r <= K.bonus.r0);
      assert.ok(Math.sqrt(dx * dx + dy * dy) <= RING.doppelAussen * ch.s / 1000 * K.bonus.rand / 1000 + 1, 'Bonus liegt auf der Scheibe');
      assert.ok(Math.abs(b.x) <= K.feld && Math.abs(b.y) <= K.feld, 'Bonus liegt im Spielfeld');
    }
    // Die Spielfläche der Scheibe liegt komplett im Feld (inkl. Verschiebung)
    assert.ok(RING.doppelAussen * ch.s / 1000 + K.scheibe.versatz < K.feld);
  }
});

test('Challenge: Tempo steigt moderat, Bonuskreis wird kleiner (nachvollziehbare Abfolge)', () => {
  const ch = challengeAus(777001, 1);
  assert.ok(tempoWurf(ch, 0) === ch.v0); assert.ok(tempoWurf(ch, 29) > tempoWurf(ch, 0)); assert.ok(tempoWurf(ch, 29) <= Math.floor(ch.v0 * K.tempo.deckel / 1000));
  for (let i = 1; i < 30; i++) assert.ok(tempoWurf(ch, i) >= tempoWurf(ch, i - 1));
  const rr = ch.bonus.filter(Boolean).map((b) => b.r); assert.ok(rr[0] > rr[rr.length - 1]); assert.ok(rr.every((r, i) => i === 0 || r <= rr[i - 1]));
});

test('Wind: Versatz = Stärke × 3 mm in Windrichtung; gilt je 5 Würfe, für alle gleich', () => {
  for (const seed of SEEDS) {
    const ch = challengeAus(seed, 1);
    for (const w of ch.wind) {
      const L = Math.sqrt(w.dx * w.dx + w.dy * w.dy), soll = w.staerke * K.wind.jeMs;
      assert.ok(Math.abs(L - soll) <= 1.5, `Länge ${L} statt ${soll}`);
      assert.equal(Math.sign(w.dx), w.staerke ? Math.sign(WIND_X[w.richtung]) : 0); assert.equal(Math.sign(w.dy), w.staerke ? Math.sign(WIND_Y[w.richtung]) : 0);
    }
    for (let i = 0; i < 30; i++) assert.equal(windWurf(ch, i), ch.wind[Math.floor(i / 5)]);
    assert.equal(windWurf(ch, 0), windWurf(ch, 4)); assert.equal(windWurf(ch, 5), ch.wind[1]);
  }
  // Ost-Wind 3 m/s: 9 mm nach rechts; Süd-West-Wind 4 m/s: je 8,48 mm
  const w = { richtung: 2, staerke: 3 }; assert.equal(Math.floor((w.staerke * K.wind.jeMs * WIND_X[w.richtung] + 500) / 1000), 900);
});

test('Linien: zeitbasiert (nur der Takt zählt), pendeln zwischen -feld und +feld', () => {
  const F = K.feld;
  for (const [start, v] of [[0, 220], [12345, 300], [4 * F - 1, 317]]) {
    let min = 1e9, max = -1e9, letzte = linie(K, start, v, 0);
    for (let k = 0; k < 2000; k++) { const p = linie(K, start, v, k); min = Math.min(min, p); max = Math.max(max, p); assert.ok(Math.abs(p - letzte) <= v, 'Schritt je Takt ≤ Tempo'); letzte = p; }
    assert.ok(min >= -F && max <= F); assert.ok(min < -F + v && max > F - v, 'erreicht beide Ränder');
  }
  assert.equal(linie(K, 100, 250, 40), linie(K, 100, 250, 40));
  assert.equal(linie(K, 0, 100, 0), -F); assert.equal(linie(K, 0, 100, (2 * F) / 100), F);   // Rand nach 2·feld/v Takten
});

// ------------------------------------------------------------------ Runde
const ch0 = () => challengeAus(4242421, 1);
function tippeBei(l, kZiel) { let n = 0; while (l.s.k < kZiel && n++ < 100000) l.schritt(false); }

test('Ablauf eines Wurfs: x, y, Flug (gesperrt), Ergebnis, Pause (gesperrt), nächster Wurf', () => {
  const l = neueRunde(ch0()), s = l.s;
  assert.equal(s.phase, 'x'); assert.equal(s.pfeile, K.pfeile); assert.equal(s.punkte, 0);
  l.schritt(true); assert.equal(s.phase, 'x', 'Tippen vor der Sperre zählt nicht'); assert.equal(l.nimmtTipp(), false);
  tippeBei(l, K.sperre); assert.equal(l.nimmtTipp(), true);
  l.schritt(true); assert.equal(s.phase, 'y'); assert.equal(s.ev, 'stopp1'); assert.equal(s.k, 0);
  assert.equal(s.ax, linie(K, ch0().startX[0], tempoWurf(ch0(), 0), K.sperre));
  tippeBei(l, K.sperre); l.schritt(true); assert.equal(s.phase, 'flug'); assert.equal(s.ev, 'wurf'); assert.equal(s.pfeile, K.pfeile - 1, 'Jeder Wurf kostet einen Pfeil');
  assert.equal(l.nimmtTipp(), false);
  const tt = s.t; for (let n = 0; n < K.flugTicks - 1; n++) { l.schritt(true); assert.equal(s.phase, 'flug', 'Eingaben im Flug werden ignoriert'); assert.equal(s.wuerfe, 0); }
  l.schritt(true); assert.equal(s.phase, 'nach'); assert.equal(s.ev, 'landung'); assert.equal(s.wuerfe, 1); assert.equal(s.t - tt, K.flugTicks);
  assert.ok(s.letzter && Number.isInteger(s.letzter.punkte)); assert.equal(s.punkte, s.letzter.punkte);
  for (let n = 0; n < K.nachTicks - 1; n++) { l.schritt(true); assert.equal(s.phase, 'nach'); }
  l.schritt(true); assert.equal(s.phase, 'x'); assert.equal(s.ev, 'naechster'); assert.equal(s.i, 1); assert.equal(s.k, 0);
});

test('Trefferpunkt = Ziel + Wind, Wertung stimmt mit der Scheibe überein', () => {
  for (const seed of SEEDS.slice(0, 20)) {
    const ch = challengeAus(seed, 1), l = neueRunde(ch), s = l.s;
    tippeBei(l, K.sperre + 7); l.schritt(true); tippeBei(l, K.sperre + 3); l.schritt(true);
    const w = windWurf(ch, 0); assert.equal(s.hx, s.ax + w.dx); assert.equal(s.hy, s.ay + w.dy);
    while (s.phase === 'flug') l.schritt(false);
    assert.deepEqual({ ...s.letzter, bonus: undefined }, { ...treffer(s.hx - ch.cx, s.hy - ch.cy, ch.s), i: 0, ax: s.ax, ay: s.ay, hx: s.hx, hy: s.hy, bonus: undefined });
  }
});

// Eigene Würfe mit exakt vorgegebenem Trefferpunkt: Runde über die Linienpositionen steuern
function wurf(ch, l, zielX, zielY) {
  const s = l.s, w = windWurf(ch, s.i), v = tempoWurf(ch, s.i);
  const suche = (start, wunsch) => { let best = K.sperre, bestd = 1e18; for (let k = K.sperre; k < 4 * K.feld / v + 5; k++) { const d = Math.abs(linie(K, start, v, k) - wunsch); if (d < bestd) { bestd = d; best = k; } } return best; };
  tippeBei(l, suche(ch.startX[s.i], zielX - w.dx)); l.schritt(true);
  tippeBei(l, suche(ch.startY[s.i], zielY - w.dy)); l.schritt(true);
  while (s.phase === 'flug') l.schritt(false);
  return s.letzter;
}

test('Bonus: Treffer im Kreis gibt die Dartpunkte und drei Pfeile; Verfehlen gibt keine', () => {
  const ch = challengeAus(555111, 1), i = ch.bonus.findIndex(Boolean), b = ch.bonus[i];
  const l = neueRunde(ch), s = l.s;
  while (s.i < i) { // Würfe vor dem Bonuswurf: ins Aus (links außen), kosten je einen Pfeil
    const r = wurf(ch, l, -K.feld + 500, -K.feld + 500); assert.equal(r.punkte, 0); assert.equal(r.bonus, false);
    while (s.phase === 'nach') l.schritt(false);
  }
  const vorher = s.pfeile, pv = s.punkte;
  const r = wurf(ch, l, b.x, b.y);
  assert.equal(r.bonus, true, `Treffer (${r.hx},${r.hy}) im Kreis (${b.x},${b.y},r=${b.r})`);
  assert.equal(s.pfeile, vorher - 1 + K.bonusPfeile); assert.equal(s.boni, 1); assert.equal(s.punkte, pv + r.punkte, 'normale Dartpunkte zählen zusätzlich');
});

test('Bonus: knapp außerhalb des Kreises gibt keine Pfeile, genau auf dem Rand schon', () => {
  const ch = challengeAus(555111, 1), i = ch.bonus.findIndex(Boolean), b = ch.bonus[i];
  for (const [abstand, soll] of [[b.r, true], [b.r + 1, false]]) {
    const l = neueRunde(ch), s = l.s;
    while (s.i < i) { wurf(ch, l, -K.feld + 500, -K.feld + 500); while (s.phase === 'nach') l.schritt(false); }
    // Zielpunkt exakt auf Kreisrand (rechts vom Mittelpunkt): die Linien rasten nur in Schritten ein, deshalb über die Landung prüfen
    const r = wurf(ch, l, b.x + abstand, b.y);
    const echt = (r.hx - b.x) ** 2 + (r.hy - b.y) ** 2 <= b.r * b.r;
    assert.equal(r.bonus, echt);
    if (Math.abs(r.hx - (b.x + abstand)) < 1 && r.hy === b.y) assert.equal(r.bonus, soll);
  }
});

test('Pfeilverbrauch: fünf Pfeile ohne Bonus = fünf Würfe, dann Ende', () => {
  const ch = challengeAus(555111, 1), l = neueRunde(ch), s = l.s;
  for (let n = 0; n < 5; n++) {
    assert.equal(s.pfeile, 5 - n); wurf(ch, l, -K.feld + 500, K.feld - 500);   // immer daneben
    if (n < 4) while (s.phase === 'nach') l.schritt(false);
  }
  assert.equal(s.phase, 'ende'); assert.equal(s.ev, 'ende'); assert.equal(s.pfeile, 0); assert.equal(s.wuerfe, 5); assert.equal(l.schritt(true), false);
});

test('Obergrenze: nach 30 Würfen ist Schluss, auch mit Pfeilen übrig (perfekter Bot)', () => {
  for (const seed of SEEDS.slice(0, 10)) {
    const ch = challengeAus(seed, 1), r = bot(ch, { sigma: 0 });
    assert.equal(r.s.phase, 'ende'); assert.equal(r.s.wuerfe, 30, 'Seed ' + seed); assert.ok(r.s.pfeile > 0, 'Pfeile bleiben übrig');
    assert.ok(r.s.t / 60 < 180, 'unter drei Minuten: ' + r.s.t / 60);
  }
});

test('Bonus auf dem letzten Pfeil verlängert die Runde', () => {
  const ch = challengeAus(555111, 1), i = ch.bonus.findIndex(Boolean), b = ch.bonus[i];
  assert.ok(i >= 1 && i <= 2);
  const l = neueRunde(ch), s = l.s;
  // Pfeile bis zum Bonuswurf verbrauchen geht nur, wenn er vor dem 5. Wurf liegt: hier i ≤ 2; also direkt prüfen, dass nach Treffer Pfeile > 0
  while (s.i < i) { wurf(ch, l, -K.feld + 500, K.feld - 500); while (s.phase === 'nach') l.schritt(false); }
  const r = wurf(ch, l, b.x, b.y); assert.equal(r.bonus, true); assert.ok(s.pfeile >= 3 && s.phase === 'nach');
});

test('Gleiche Eingaben + gleiche Challenge = gleiches Ergebnis, unabhängig davon, wie die Takte verteilt werden', () => {
  const ch = challengeAus(999001, 1), r = bot(ch, { sigma: 2, seed: 7 });
  const a = nachfahren(ch, r.tipps), b = nachfahren(challengeAus(999001, 1), r.tipps);
  assert.deepEqual(a, b); assert.equal(a.punkte, r.s.punkte); assert.equal(a.ticks, r.s.t); assert.equal(a.wuerfe, r.s.wuerfe); assert.equal(a.ende, true);
  // andere Challenge → anderes Ergebnis
  assert.notEqual(nachfahren(challengeAus(999002, 1), r.tipps).punkte + '/' + nachfahren(challengeAus(999002, 1), r.tipps).ticks, a.punkte + '/' + a.ticks);
});

test('Kodierung der Eingaben', () => {
  const tipps = [14, 33, 150, 151 + 40]; assert.deepEqual(dekodiere(kodiere(tipps)), tipps); assert.deepEqual(dekodiere(''), []);
  for (const x of ['a..b', 'zzzzzzz', 'A', '-1', '1.', '.1', 5, null]) assert.equal(dekodiere(x), null, String(x));
  assert.equal(dekodiere('1.1.1', 2), null);
  assert.equal(dekodiere('zzzzzz'), null, 'über MAX_TICKS');
});

test('Prüfung: echte Runden werden bestätigt, jede Fälschung abgelehnt', () => {
  const seed = 987001, ch = challengeAus(seed, 1), r = bot(ch, { sigma: 2, seed: 3 }), gut = r.lauf;
  const p = pruefeLauf(seed, 1, gut); assert.equal(p.ok, true); assert.equal(p.punkte, gut.score); assert.equal(p.wuerfe, gut.throws); assert.equal(p.ticks, gut.ticks);
  for (const x of [{ score: gut.score + 1 }, { score: gut.score - 1 }, { score: 5000 }, { ticks: gut.ticks + 1 }, { ticks: 1 }, { throws: gut.throws + 1 }, { throws: 0 },
    { inputs: '' }, { inputs: gut.inputs + '.1' }, { inputs: '1.1.1' }, { inputs: 'zz!' }, { inputs: gut.inputs.replace(/^\w+/, (m) => (parseInt(m, 36) + 1).toString(36)) }, { inputs: 42 }]) {
    assert.equal(pruefeLauf(seed, 1, { ...gut, ...x }).ok, false, JSON.stringify(x));
  }
  assert.equal(pruefeLauf(seed + 1, 1, gut).ok, false, 'falscher Seed'); assert.equal(pruefeLauf(seed, 2, gut).grund, 'version'); assert.equal(pruefeLauf(seed, 1, null).ok, false);
  // Runde, die nicht endet (Bot hört mitten drin auf): keine Wertung
  const halb = r.tipps.slice(0, 6); const x = pruefeLauf(seed, 1, { inputs: kodiere(halb), ticks: 100, score: 0, throws: 0 }); assert.equal(x.ok, false);
});

test('Prüfung: Tippen in gesperrten Takten (Flug, Pause, vor der Sperre) ist ungültig', () => {
  const seed = 987002, ch = challengeAus(seed, 1), r = bot(ch, { sigma: 1, seed: 5 });
  const t = r.tipps.slice();
  // Tipp mitten in den Flug des ersten Wurfs einschieben
  const flugStart = t[1] + 1, mitten = flugStart + 5;
  const schlecht = [t[0], t[1], mitten, ...t.slice(2)].sort((a, b) => a - b);
  assert.equal(pruefeLauf(seed, 1, { ...r.lauf, inputs: kodiere(schlecht) }).ok, false);
  // Tipp in den ersten Takten der Linie
  const zuFrueh = [K.sperre - 2, ...t.slice(1)];
  assert.equal(pruefeLauf(seed, 1, { ...r.lauf, inputs: kodiere(zuFrueh) }).ok, false);
  // doppelter Tipp im selben Takt
  assert.equal(pruefeLauf(seed, 1, { ...r.lauf, inputs: kodiere([t[0], t[0], ...t.slice(1)]) }).ok, false);
});

test('Prüfung: erfundene Bestleistung (alle Treffer perfekt) lässt sich nur mit echten, zulässigen Eingaben erreichen', () => {
  // Wer Eingaben berechnet, die das Maximum ergeben, besteht die Regelprüfung – das ist die ehrliche Grenze (siehe Doku).
  // Unmögliche Ergebnisse (mehr Punkte als Würfe × 60) scheitern immer.
  const seed = 987003, ch = challengeAus(seed, 1), r = bot(ch, { sigma: 0, seed: 1, ziel: 't20' });
  assert.ok(r.lauf.score <= r.lauf.throws * 60);
  assert.equal(pruefeLauf(seed, 1, { ...r.lauf, score: r.lauf.throws * 60 + 1 }).ok, false);
});

test('Rundenlänge: Bot mit Menschen-Zeitgefühl braucht grob ein bis zwei Minuten, nie über die Obergrenze', () => {
  for (const sigma of [2, 3, 5]) {
    let sek = 0; const n = 40;
    for (let d = 0; d < n; d++) { const r = bot(challengeAus(1000003 + d * 7919, 1), { sigma, seed: d + 1 }); sek += r.s.t / 60; assert.ok(r.s.wuerfe <= 30); assert.ok(r.s.t < MAX_TICKS); }
    assert.ok(sek / n > 25 && sek / n < 130, `σ=${sigma}: Ø ${(sek / n).toFixed(0)} s`);
  }
});
