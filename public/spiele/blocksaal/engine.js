/* BLOCKSAAL – Spiellogik ohne DOM.
   Läuft im Browser (window.BlockEngine), in Node-Tests und im Cloudflare Worker (src/worker.js
   nutzt parseChallenge/Texte, damit Link, Vorschau und Spiel dieselben Regeln haben). */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.BlockEngine = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const COLS = 10, ROWS = 20;
  const START_MS = 900;           // Fallzeit je Zeile auf Stufe 1: bewusst langsam
  const MIN_MS = 80;              // schnellste Fallzeit
  const SPEEDUP = 0.82;           // je Stufe 18 % schneller
  const LINES_PER_LEVEL = 10;     // alle 10 Reihen eine Stufe höher
  const LOCK_MS = 450;            // so lange darf ein aufliegendes Teil noch verschoben werden
  const MAX_LOCK_RESETS = 10;     // ... höchstens so oft, sonst Dauer-Schweben
  const CLEAR_MS = 240;           // Blitz-Animation voller Reihen
  const POINTS = [0, 100, 300, 500, 800];
  const MAX_CHALLENGE = 999;      // größere Herausforderungswerte gelten nicht (Link-Schutz)

  // Reihenfolge = Farbnummer 1..7 im Spielfeld
  const TYPES = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];
  // Eigene Palette (Spielwelt darf eigene Farben haben); auch für das Vorschaubild
  const COLORS = ['#38D5C9', '#FFD21C', '#FF9200', '#7ED957', '#FF5C7A', '#7B8CFF', '#C77DFF'];

  // Grundform in einem n×n-Kästchen, Drehung im Uhrzeigersinn: (x, y) -> (n-1-y, x)
  const BASE = {
    I: { n: 4, c: [[0, 1], [1, 1], [2, 1], [3, 1]] },
    O: { n: 2, c: [[0, 0], [1, 0], [0, 1], [1, 1]] },
    T: { n: 3, c: [[1, 0], [0, 1], [1, 1], [2, 1]] },
    S: { n: 3, c: [[1, 0], [2, 0], [0, 1], [1, 1]] },
    Z: { n: 3, c: [[0, 0], [1, 0], [1, 1], [2, 1]] },
    J: { n: 3, c: [[0, 0], [0, 1], [1, 1], [2, 1]] },
    L: { n: 3, c: [[2, 0], [0, 1], [1, 1], [2, 1]] }
  };
  const SHAPES = {};
  for (const t of TYPES) {
    const { n, c } = BASE[t];
    const rots = [c];
    for (let r = 1; r < 4; r++) rots.push(rots[r - 1].map(([x, y]) => [n - 1 - y, x]));
    SHAPES[t] = rots;
  }
  // Wandtritte beim Drehen: erst am Platz, dann seitlich, zuletzt eine Zeile hoch (Boden)
  const KICKS = [[0, 0], [-1, 0], [1, 0], [-2, 0], [2, 0], [0, -1], [-1, -1], [1, -1]];

  const intervalFor = (level) => Math.max(MIN_MS, Math.round(START_MS * Math.pow(SPEEDUP, level - 1)));
  const levelFor = (lines) => 1 + Math.floor(lines / LINES_PER_LEVEL);

  class Game {
    constructor(rng) {
      this.rng = typeof rng === 'function' ? rng : Math.random;
      this.reset();
    }

    reset() {
      this.board = Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
      this.bag = [];
      this.score = 0; this.lines = 0; this.level = 1;
      this.over = false; this.clearing = null; this.events = [];
      this.piece = null; this.acc = 0; this.lockAcc = 0; this.lockResets = 0; this.lowestY = 0;
      this.nextType = this.draw();
      this.spawn();
    }

    // 7er-Beutel: jedes Teil kommt in jeder Runde von sieben genau einmal, das hält die Folge fair
    draw() {
      if (!this.bag.length) {
        const b = TYPES.slice();
        for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(this.rng() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; }
        this.bag = b;
      }
      return this.bag.pop();
    }

    interval() { return intervalFor(this.level); }

    cells(p, r, x, y) {
      return SHAPES[p.t][r === undefined ? p.r : r].map(([cx, cy]) => [(x === undefined ? p.x : x) + cx, (y === undefined ? p.y : y) + cy]);
    }

    collides(t, r, x, y) {
      for (const [cx, cy] of SHAPES[t][r]) {
        const gx = x + cx, gy = y + cy;
        if (gx < 0 || gx >= COLS || gy >= ROWS) return true;
        if (gy >= 0 && this.board[gy][gx]) return true;
      }
      return false;
    }

    fits(dx, dy, r) {
      const p = this.piece;
      return !this.collides(p.t, r === undefined ? p.r : r, p.x + dx, p.y + dy);
    }

    spawn() {
      const t = this.nextType;
      this.nextType = this.draw();
      const shape = SHAPES[t][0];
      const minY = Math.min(...shape.map((c) => c[1]));
      const p = { t, r: 0, x: Math.floor((COLS - BASE[t].n) / 2), y: -minY };
      this.acc = 0; this.lockAcc = 0; this.lockResets = 0; this.lowestY = p.y;
      if (this.collides(t, 0, p.x, p.y)) { this.piece = null; this.end(); return; }
      this.piece = p;
    }

    end() { this.over = true; this.piece = null; this.events.push({ type: 'over' }); }

    canAct() { return !this.over && !this.clearing && !!this.piece; }
    grounded() { return !!this.piece && !this.fits(0, 1); }

    // Nach einer gelungenen Bewegung: aufliegendes Teil bekommt etwas mehr Zeit
    touched() {
      const p = this.piece;
      if (p.y > this.lowestY) { this.lowestY = p.y; this.lockResets = 0; }
      if (this.grounded()) { if (this.lockResets < MAX_LOCK_RESETS) { this.lockResets++; this.lockAcc = 0; } }
      else this.lockAcc = 0;
    }

    move(dx) {
      if (!this.canAct() || !this.fits(dx, 0)) return false;
      this.piece.x += dx; this.touched(); this.events.push({ type: 'move' });
      return true;
    }

    rotate(dir) {
      if (!this.canAct()) return false;
      const p = this.piece, r = (p.r + (dir < 0 ? 3 : 1)) % 4;
      for (const [kx, ky] of KICKS) {
        if (this.fits(kx, ky, r)) {
          p.r = r; p.x += kx; p.y += ky; this.touched(); this.events.push({ type: 'rotate' });
          return true;
        }
      }
      return false;
    }

    softDrop() {
      if (!this.canAct() || !this.fits(0, 1)) return false;
      this.piece.y++; this.score++; this.acc = 0; this.touched();
      return true;
    }

    ghostDistance() {
      if (!this.piece) return 0;
      let d = 0;
      while (this.fits(0, d + 1)) d++;
      return d;
    }

    hardDrop() {
      if (!this.canAct()) return 0;
      const d = this.ghostDistance();
      this.piece.y += d; this.score += 2 * d;
      this.events.push({ type: 'hard', distance: d });
      this.lock();
      return d;
    }

    lock() {
      const p = this.piece;
      let outside = false;
      for (const [gx, gy] of this.cells(p)) {
        if (gy < 0) outside = true; else this.board[gy][gx] = TYPES.indexOf(p.t) + 1;
      }
      this.piece = null;
      this.events.push({ type: 'lock' });
      if (outside) { this.end(); return; }
      const rows = [];
      for (let y = 0; y < ROWS; y++) if (this.board[y].every((v) => v)) rows.push(y);
      if (!rows.length) { this.spawn(); return; }
      // Punkte und Reihen zählen sofort, das Entfernen folgt nach dem Blitz
      this.score += POINTS[rows.length] * this.level;
      this.lines += rows.length;
      const level = levelFor(this.lines);
      this.events.push({ type: 'clear', count: rows.length, rows: rows.slice() });
      if (level > this.level) { this.level = level; this.events.push({ type: 'level', level }); }
      this.clearing = { rows, t: CLEAR_MS };
    }

    finishClear() {
      const gone = new Set(this.clearing.rows);
      const rest = this.board.filter((_, y) => !gone.has(y));
      while (rest.length < ROWS) rest.unshift(new Array(COLS).fill(0));
      this.board = rest;
      this.clearing = null;
      this.spawn();
    }

    // Zeit weiterlaufen lassen (dt in Millisekunden)
    update(dt) {
      if (this.over) return;
      if (this.clearing) { this.clearing.t -= dt; if (this.clearing.t <= 0) this.finishClear(); return; }
      if (!this.piece) return;
      if (!this.grounded()) {
        this.acc += dt;
        const g = this.interval();
        while (this.acc >= g) {
          this.acc -= g;
          if (!this.fits(0, 1)) break;
          this.piece.y++;
          if (this.piece.y > this.lowestY) { this.lowestY = this.piece.y; this.lockResets = 0; }
        }
      }
      if (this.grounded()) {
        this.lockAcc += dt;
        if (this.lockAcc >= LOCK_MS) this.lock();
      } else this.lockAcc = 0;
    }

    drainEvents() { const e = this.events; this.events = []; return e; }
  }

  // ---------- Herausforderung und Teilen ----------
  // ?c=42 -> 42, alles andere (0, 007, 1000, abc, 4.2) -> 0 = keine Herausforderung
  function parseChallenge(search) {
    let v = null;
    try { v = new URLSearchParams(search || '').get('c'); } catch (e) { return 0; }
    if (!v || !/^[1-9]\d{0,2}$/.test(v)) return 0;
    const n = parseInt(v, 10);
    return n >= 1 && n <= MAX_CHALLENGE ? n : 0;
  }
  const rowsText = (n) => n + (n === 1 ? ' Reihe' : ' Reihen');
  const clampRows = (n) => Math.max(0, Math.min(MAX_CHALLENGE, Math.floor(Number(n) || 0)));
  function challengeUrl(base, rows) {
    const n = clampRows(rows);
    return n >= 1 ? base + '?c=' + n : base;
  }
  function shareText(rows, url) {
    const n = clampRows(rows);
    return n >= 1
      ? '🧱 Ich habe ' + rowsText(n) + ' bei BlockSaal geschafft! Schlägst du mich? 🎮 ' + url
      : '🧱 BlockSaal auf PlaySaal: Schaffst du eine volle Reihe? 🎮 ' + url;
  }
  const previewTitle = (n) => rowsText(n) + ' geschafft – schlägst du mich?';
  const PREVIEW_DESCRIPTION = 'Spiele BlockSaal kostenlos auf PlaySaal.';

  return {
    COLS, ROWS, TYPES, COLORS, SHAPES, BASE, POINTS, LOCK_MS, CLEAR_MS, MAX_LOCK_RESETS, MAX_CHALLENGE, LINES_PER_LEVEL,
    Game, intervalFor, levelFor,
    parseChallenge, rowsText, challengeUrl, shareText, previewTitle, PREVIEW_DESCRIPTION
  };
});
