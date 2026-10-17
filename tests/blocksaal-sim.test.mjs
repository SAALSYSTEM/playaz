// BLOCKSAAL: Spiellogik, Tempo, Spielende, Herausforderungslink und Teilen-Text ohne Browser.
// Start: node --test tests/blocksaal-sim.test.mjs   (keine weiteren Abhängigkeiten)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import Engine from '../public/spiele/blocksaal/engine.js';

const { Game, COLS, ROWS, TYPES, SHAPES } = Engine;

// Reproduzierbarer Zufall
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
const leer = () => Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
// Spiel mit eigenem Brett und festem aktuellem Teil
function aufbau(typ, rows = {}) {
  const g = new Game(rng(1));
  g.board = leer();
  for (const [y, cols] of Object.entries(rows)) for (const x of cols) g.board[y][x] = 1;
  g.piece = { t: typ, r: 0, x: Math.floor((COLS - Engine.BASE[typ].n) / 2), y: 0 };
  g.acc = 0; g.lockAcc = 0; g.lockResets = 0; g.lowestY = 0;
  return g;
}
const alle = (von, bis) => Array.from({ length: bis - von }, (_, i) => von + i);

test('Formen: sieben Teile, je vier Kästchen, vier Drehungen, nach vier Drehungen wieder gleich', () => {
  assert.equal(TYPES.length, 7);
  for (const t of TYPES) {
    assert.equal(SHAPES[t].length, 4);
    const n = Engine.BASE[t].n;
    for (const rot of SHAPES[t]) {
      assert.equal(new Set(rot.map((c) => c.join(','))).size, 4, t + ' hat vier verschiedene Kästchen');
      for (const [x, y] of rot) assert.ok(x >= 0 && x < n && y >= 0 && y < n, t + ' bleibt im Kästchen');
    }
  }
  // O dreht sich nicht sichtbar
  const norm = (c) => c.map((p) => p.join(',')).sort().join(';');
  assert.equal(new Set(SHAPES.O.map(norm)).size, 1);
});

test('Teilefolge: 7er-Beutel, in jeder Runde von sieben jedes Teil genau einmal', () => {
  const g = new Game(rng(7));
  const folge = [g.piece.t, g.nextType];   // beim Start sind schon zwei Teile gezogen
  while (folge.length < 70) folge.push(g.draw());
  for (let i = 0; i < 70; i += 7) assert.deepEqual([...folge.slice(i, i + 7)].sort(), [...TYPES].sort(), 'Runde ab ' + i);
});

test('Start: leeres Feld 10 × 20, Teil oben mittig, nächstes Teil bekannt, 0 Punkte, Stufe 1', () => {
  const g = new Game(rng(3));
  assert.equal(g.board.length, 20); assert.equal(g.board[0].length, 10);
  assert.ok(g.piece && TYPES.includes(g.nextType));
  assert.equal(g.score, 0); assert.equal(g.lines, 0); assert.equal(g.level, 1); assert.equal(g.over, false);
  for (const [, y] of g.cells(g.piece)) assert.ok(y >= 0, 'sichtbar im Feld');
});

test('Bewegen und Drehen: Wände und Steine halten das Teil auf, Wandtritt beim Drehen', () => {
  const g = aufbau('T');
  for (let i = 0; i < 20; i++) g.move(-1);
  assert.ok(Math.min(...g.cells(g.piece).map((c) => c[0])) === 0, 'stoppt links an der Wand');
  assert.equal(g.move(-1), false);
  for (let i = 0; i < 20; i++) g.move(1);
  assert.ok(Math.max(...g.cells(g.piece).map((c) => c[0])) === COLS - 1, 'stoppt rechts an der Wand');
  // Stange senkrecht direkt an der Wand: Drehen in die Waagerechte muss per Wandtritt klappen
  const h = aufbau('I');
  h.piece.r = 1;
  for (let i = 0; i < 20; i++) h.move(1);
  assert.equal(h.rotate(1), true, 'Wandtritt');
  const xs = h.cells(h.piece).map((c) => c[0]);
  assert.ok(Math.min(...xs) >= 0 && Math.max(...xs) < COLS);
  // Blockierte Drehung wird abgelehnt, Teil bleibt unverändert
  const k = aufbau('I', { 1: alle(0, 10), 2: alle(0, 10) });
  k.piece.y = -1;
  const vorher = JSON.stringify(k.piece);
  k.piece.r = 0;
  assert.equal(k.rotate(1), false);
  assert.equal(JSON.stringify(k.piece), vorher);
});

test('Sofort fallen: Teil landet unten, Punkte 2 je Zeile, nächstes Teil kommt', () => {
  const g = aufbau('O');
  const d = g.ghostDistance();
  assert.equal(d, ROWS - 2);
  const next = g.nextType;
  g.hardDrop();
  assert.equal(g.score, 2 * d);
  assert.equal(g.board[ROWS - 1].filter(Boolean).length, 2);
  assert.equal(g.piece.t, next, 'das angezeigte nächste Teil wird wirklich das aktuelle');
});

test('Volle Reihen verschwinden: 1 bis 4 Reihen, Punkte 100/300/500/800 mal Stufe, Reste rutschen nach', () => {
  const erwartet = { 1: 100, 2: 300, 3: 500, 4: 800 };
  for (let n = 1; n <= 4; n++) {
    // n Reihen am Boden, links 2 Spalten frei (Lücke für O) bzw. 1 Spalte (Stange)
    const g = aufbau(n === 4 ? 'I' : 'O');
    if (n === 4) {
      for (let y = ROWS - 4; y < ROWS; y++) for (let x = 1; x < COLS; x++) g.board[y][x] = 2;
      g.piece.r = 1; g.piece.x = -2;   // senkrechte Stange in Spalte 0 (Kästchen x=2)
      g.piece.x = -2;
    } else {
      for (let y = ROWS - n; y < ROWS; y++) for (let x = 2; x < COLS; x++) g.board[y][x] = 2;
      g.board[ROWS - n - 1][5] = 3;   // ein loser Stein darüber, muss nachrutschen
      g.piece.x = 0;
    }
    const d = g.hardDrop();
    const gewonnen = n === 4 ? 4 : Math.min(n, 2);   // O ist nur zwei Reihen hoch
    assert.equal(g.lines, gewonnen);
    assert.equal(g.score, 2 * d + erwartet[gewonnen] * 1, n + ' Reihen: Fallpunkte + Reihenpunkte');
    assert.ok(g.clearing, 'Blitz läuft');
    g.update(Engine.CLEAR_MS + 1);
    assert.equal(g.clearing, null);
    for (let y = 0; y < ROWS; y++) assert.ok(!g.board[y].every((v) => v), 'keine volle Reihe bleibt stehen');
  }
});

test('Reihe mit Lücke bleibt, nachrutschende Steine behalten Abstand', () => {
  const g = aufbau('O');
  for (let x = 2; x < COLS; x++) { g.board[ROWS - 1][x] = 2; }
  g.board[ROWS - 2][9] = 3;
  g.piece.x = 0;
  g.hardDrop();
  g.update(Engine.CLEAR_MS + 1);
  assert.equal(g.lines, 1);
  assert.equal(g.board[ROWS - 1][9], 3, 'Stein aus Zeile darüber ist eine Zeile nach unten gerutscht');
  assert.equal(g.board[ROWS - 1][0], 2, 'Rest vom O (Farbe 2) bleibt liegen');
  assert.equal(g.board[ROWS - 1][1], 2);
  assert.equal(g.board[ROWS - 1].filter(Boolean).length, 3, 'O-Rest (2) + nachgerutschter Stein (1)');
});

test('Tempo: Stufe 1 langsam, alle 10 Reihen eine Stufe schneller, nie unter der Untergrenze', () => {
  assert.equal(Engine.levelFor(0), 1);
  assert.equal(Engine.levelFor(9), 1);
  assert.equal(Engine.levelFor(10), 2);
  assert.equal(Engine.levelFor(25), 3);
  assert.ok(Engine.intervalFor(1) >= 800, 'Start bewusst langsam');
  let prev = Infinity;
  for (let l = 1; l <= 40; l++) { const i = Engine.intervalFor(l); assert.ok(i <= prev); assert.ok(i >= 50); prev = i; }
  assert.ok(Engine.intervalFor(10) < Engine.intervalFor(1) / 4);
  // Im Spiel: zehnte Reihe löst Stufe 2 und Ereignis aus
  const g = aufbau('I');
  g.lines = 9;
  for (let y = ROWS - 1; y < ROWS; y++) for (let x = 1; x < COLS; x++) g.board[y][x] = 2;
  g.piece.r = 1; g.piece.x = -2;
  g.hardDrop();
  assert.equal(g.lines, 10);
  assert.equal(g.level, 2);
  assert.ok(g.drainEvents().some((e) => e.type === 'level' && e.level === 2));
  assert.ok(g.interval() < Engine.intervalFor(1));
});

test('Schwerkraft: ohne Eingabe fällt das Teil im Takt der Stufe, landet und das nächste kommt', () => {
  const g = new Game(rng(5));
  const y0 = g.piece.y;
  g.update(Engine.intervalFor(1) - 1); assert.equal(g.piece.y, y0);
  g.update(2); assert.equal(g.piece.y, y0 + 1);
  const erstes = g.piece.t;
  let guard = 0;
  while (g.piece && g.piece.t === erstes && !g.over && guard++ < 5000) g.update(50);
  assert.ok(g.board.flat().some(Boolean), 'erstes Teil ist gelandet');
});

test('Landeverzögerung: aufliegendes Teil lässt sich noch kurz verschieben, aber nicht endlos', () => {
  const g = aufbau('O');
  const erstes = g.piece;
  g.piece.y = ROWS - 2;                     // liegt am Boden
  g.update(200); assert.equal(g.piece, erstes, 'nach 200 ms noch nicht fest');
  g.move(-1); g.update(300);
  assert.equal(g.piece, erstes, 'Verschieben verlängert die Frist');
  let n = 0;
  while (g.piece === erstes && n < 100) { g.move(n % 2 ? -1 : 1); g.update(300); n++; }
  assert.ok(g.piece !== erstes, 'wird trotzdem irgendwann fest');
  assert.ok(n <= Engine.MAX_LOCK_RESETS + 3, 'Dauer-Schweben endet nach wenigen Verschiebungen: ' + n);
});

test('Spielende: sobald oben kein Platz mehr ist, danach keine Eingabe mehr', () => {
  const g = new Game(rng(2));
  // Feld bis oben mit Lücken füllen (nie eine volle Reihe)
  g.board = Array.from({ length: ROWS }, () => Array.from({ length: COLS }, (_, x) => (x === 0 ? 0 : 2)));
  g.piece = null; g.spawn();
  assert.equal(g.over, true);
  assert.ok(g.drainEvents().some((e) => e.type === 'over'));
  assert.equal(g.move(1), false); assert.equal(g.rotate(1), false); assert.equal(g.hardDrop(), 0);
  const punkte = g.score; g.update(5000); assert.equal(g.score, punkte);
});

test('Spielende im echten Spiel: wer nichts tut, verliert, ohne Fehler und mit Zählern ≥ 0', () => {
  const g = new Game(rng(11));
  let t = 0;
  while (!g.over && t < 2e6) { g.update(100); g.drainEvents(); t += 100; }
  assert.equal(g.over, true);
  assert.equal(g.lines, 0);
});

// Einfacher Bot: setzt jedes Teil dorthin, wo am wenigsten Löcher und die niedrigste Höhe entstehen
function bestePlatzierung(g) {
  const p = g.piece; let best = null;
  for (let r = 0; r < 4; r++) for (let x = -3; x < COLS; x++) {
    if (g.collides(p.t, r, x, p.y)) continue;
    let y = p.y; while (!g.collides(p.t, r, x, y + 1)) y++;
    const b = g.board.map((z) => z.slice());
    for (const [cx, cy] of SHAPES[p.t][r]) if (y + cy >= 0) b[y + cy][x + cx] = 1;
    const voll = b.filter((z) => z.every(Boolean)).length;
    const nb = b.filter((z) => !z.every(Boolean));              // volle Reihen verschwinden
    while (nb.length < ROWS) nb.unshift(new Array(COLS).fill(0));
    const hs = [];
    let loecher = 0;
    for (let c = 0; c < COLS; c++) { let h = 0, gesehen = false; for (let rr = 0; rr < ROWS; rr++) { if (nb[rr][c]) { if (!gesehen) h = ROWS - rr; gesehen = true; } else if (gesehen) loecher++; } hs.push(h); }
    const hoehe = hs.reduce((a2, c) => a2 + c, 0);
    let uneben = 0; for (let c = 1; c < COLS; c++) uneben += Math.abs(hs[c] - hs[c - 1]);
    const wert = 0.76 * voll - 0.51 * hoehe - 0.36 * loecher - 0.18 * uneben;
    if (!best || wert > best.wert) best = { r, x, wert };
  }
  return best;
}
test('Bot-Durchlauf: 600 Teile ohne Fehler, viele Reihen, Stufen steigen, Brett bleibt gültig', () => {
  const g = new Game(rng(42));
  const stufen = new Set([1]);
  for (let i = 0; i < 600 && !g.over; i++) {
    const b = bestePlatzierung(g);
    assert.ok(b, 'es gibt eine Platzierung');
    for (let k = 0; k < 4 && g.piece.r !== b.r; k++) g.rotate(1);
    let guard = 0;
    while (g.piece.x !== b.x && guard++ < 20) g.move(g.piece.x < b.x ? 1 : -1);
    g.hardDrop();
    g.update(Engine.CLEAR_MS + 1);
    stufen.add(g.level);
    for (const z of g.board) for (const v of z) assert.ok(v >= 0 && v <= 7);
  }
  assert.ok(g.lines >= 100, 'Bot schafft viele Reihen: ' + g.lines);
  assert.ok(stufen.size >= 5, 'Tempo steigt über die Stufen: ' + [...stufen]);
  assert.equal(g.level, Engine.levelFor(g.lines));
});

// ---------- Herausforderung und Teilen ----------
test('Herausforderungslink: nur 1–999 ohne führende Null zählt, alles andere ist keine Herausforderung', () => {
  const ok = { '?c=42&c=7x': 42, '?c=42': 42, '?c=1': 1, '?c=999': 999, '?a=1&c=17': 17, 'c=5': 5 };
  for (const [s, n] of Object.entries(ok)) assert.equal(Engine.parseChallenge(s), n, s);
  for (const s of ['', '?c=0', '?c=007', '?c=1000', '?c=-3', '?c=4.2', '?c=abc', '?c=', '?c=42x', '?c=%3Cscript%3E', '?c=1e3', '?x=42', undefined, null])
    assert.equal(Engine.parseChallenge(s), 0, String(s));
});

test('Teilen-Text: genau das Beispiel aus der Aufgabe, Link mit Reihenzahl, Grenzwerte', () => {
  const base = 'https://playsaal.com/spiele/blocksaal';
  const url = Engine.challengeUrl(base, 42);
  assert.equal(url, base + '?c=42');
  assert.equal(Engine.shareText(42, url), '🧱 Ich habe 42 Reihen bei BlockSaal geschafft! Schlägst du mich? 🎮 https://playsaal.com/spiele/blocksaal?c=42');
  assert.equal(Engine.shareText(1, Engine.challengeUrl(base, 1)), '🧱 Ich habe 1 Reihe bei BlockSaal geschafft! Schlägst du mich? 🎮 ' + base + '?c=1');
  assert.equal(Engine.challengeUrl(base, 0), base, 'ohne Reihen keine Herausforderung');
  assert.equal(Engine.challengeUrl(base, 5000), base + '?c=999', 'gedeckelt');
  assert.equal(Engine.challengeUrl(base, 7.9), base + '?c=7');
  assert.equal(Engine.parseChallenge(Engine.challengeUrl(base, 42).split('?')[1]), 42, 'Hin- und Rückweg');
  assert.ok(!Engine.shareText(0, base).includes('0 Reihen'));
});

test('Vorschau-Texte: Titel und Beschreibung wie vorgegeben', () => {
  assert.equal(Engine.previewTitle(42), '42 Reihen geschafft – schlägst du mich?');
  assert.equal(Engine.previewTitle(1), '1 Reihe geschafft – schlägst du mich?');
  assert.equal(Engine.PREVIEW_DESCRIPTION, 'Spiele BlockSaal kostenlos auf PlaySaal.');
});
