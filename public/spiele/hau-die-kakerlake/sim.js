// HAU DIE KAKERLAKE! – Kakerlaken im Parlament: Spiellogik.
// Kein DOM, kein Zufall außerhalb des gesetzten Startwerts: läuft im Browser und in Node (Tests, Bots).
// Feste Schrittweite von 1/60 s, die Bildrate spielt keine Rolle. Zeit ist reine Simulationszeit:
// wird nicht aktualisiert (Pause, verborgener Tab), springt nichts nach vorn.
//
// Ein Gegner ist über (Eingang/Gang, Zielsitz, Fortschritt p) beschrieben. Die Bildschirmposition kommt aus
// dem aktuellen Layout (Quer- oder Hochformat). Dadurch bleibt beim Drehen des Geräts alles erhalten.

import { getLayout, sampleRoute, depthFraction, AISLE_IDS } from './layout.js';
import {
  TYPES, BOSSES, FOLLOWUP_LEAD, LEVELS, ENDLESS, buildPlan, buildEndlessWave, endlessParams, mulberry32, POWER_FROM_LEVEL
} from './levels.js';

export const STEP = 1 / 60;
export const STRIKE_COOLDOWN = 0.2;     // Schlagabklingzeit
export const COMBO_WINDOW = 2.5;        // Kombozeitfenster, wird mit jedem Treffer zurückgesetzt
export const POWER_EVERY = 10;          // vollständig besiegte Gegner je Ladung der „Großen Klatsche“
export const SIT_TIME = 1.2;            // Dauer der Sitz-Animation
export const EMERGE_TIME = 0.4;         // Auftauchen aus der Tür
export const DEFENSE_MAX = 5;
export const MIN_DUR = 2.2;             // kein Gegner (außer Boss) ist schneller am Sitz als das
export const FLINCH = 0.3;              // Zurückzucken des Helmträgers nach dem ersten Treffer
export const MIN_WARN_GAP = 0.35;       // Mindestabstand zwischen zwei Warnungen
export const MAX_CHUNK = 0.25;          // größter Zeitsprung, den update() verarbeitet

export const comboMult = (streak) => (streak >= 10 ? 3 : streak >= 5 ? 2 : 1);
export const starsFor = (escaped) => (escaped === 0 ? 3 : escaped <= 2 ? 2 : escaped <= 4 ? 1 : 0);

// Zielsitze, die in beiden Layouts existieren (damit ein Wechsel Hoch ↔ Quer nichts verliert)
let COMMON = null;
function commonTargets() {
  if (COMMON) return COMMON;
  const a = getLayout('land'), b = getLayout('port');
  const ids = new Set(b.targets.map((t) => t.id));
  COMMON = {};
  for (const id of AISLE_IDS) COMMON[id] = a.targets.filter((t) => t.aisle === id && ids.has(t.id));
  return COMMON;
}

const TAU = Math.PI * 2;
const angDiff = (a, b) => { let d = b - a; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; return d; };

export class Game {
  // opts: { level: 1…30 | 'endless', layout: 'land'|'port', sizeFactor, seed, minHit }
  constructor(opts = {}) {
    this.mode = opts.level === 'endless' ? 'endless' : 'level';
    this.L = this.mode === 'endless' ? ENDLESS : LEVELS[opts.level - 1];
    if (!this.L) throw new Error('Unbekanntes Level ' + opts.level);
    this.levelId = this.mode === 'endless' ? 'endless' : this.L.id;
    this.sizeFactor = opts.sizeFactor || 1;
    this.seed = opts.seed || 1;
    this.rng = mulberry32((this.seed * 2654435761 + (this.mode === 'endless' ? 77 : this.L.id)) >>> 0);
    this.minHit = opts.minHit || 0;
    this.setLayout(opts.layout || 'land');

    this.t = 0;
    this.acc = 0;
    this.status = 'running';          // 'running' | 'won' | 'lost'
    this.score = 0;
    this.streak = 0; this.maxStreak = 0; this.comboT = 0;
    this.defense = DEFENSE_MAX;
    this.enemies = []; this.warnings = []; this.followups = [];
    this.occupied = new Set();
    this.kills = 0; this.escaped = 0; this.resolved = 0;
    this.strikes = 0; this.hitStrikes = 0;
    this.charge = 0; this.chargeProg = 0; this.armed = false;
    this.lastStrike = -1e9; this.lastWarn = -1e9;
    this.nextId = 1;
    this.events = [];
    this.powerEnabled = this.mode === 'endless' || this.L.id >= POWER_FROM_LEVEL;

    if (this.mode === 'level') {
      const plan = buildPlan(this.L);
      this.plan = plan;
      this.queue = plan.events.map((e) => Object.assign({}, e));
      this.total = this.L.total;
      this.speedMul = this.L.speed;
      this.capBase = this.L.cap;
    } else {
      this.queue = [];
      this.total = Infinity;
      this.wave = 0;
      this.waveRows = [0, 2];
      this.speedMul = 0.85; this.capBase = 4;
      this.nextWaveAt = 0;              // Zeitpunkt, ab dem die nächste Welle geplant werden darf
    }
  }

  get cap() { return Math.max(3, Math.round(this.capBase * this.sizeFactor)); }
  get remaining() { return this.mode === 'endless' ? Infinity : this.total - this.resolved; }
  get activeCount() { let n = 0; for (const e of this.enemies) if (e.state === 'walk') n++; return n; }
  get comboMultiplier() { return comboMult(this.streak); }
  get done() { return this.status !== 'running'; }

  setLayout(name) {
    this.layoutName = name === 'port' ? 'port' : 'land';
    this.layout = getLayout(this.layoutName);
    if (this.enemies) for (const e of this.enemies) this._place(e, false);
  }
  setMinHit(units) { this.minHit = units; }

  // ------------------------------------------------------------------ Zeitfortschritt
  update(dt) {
    if (!(dt > 0)) return;
    this.acc += Math.min(dt, MAX_CHUNK);
    while (this.acc >= STEP) { this._step(); this.acc -= STEP; }
  }
  // exakt n Sekunden (Tests, Bots)
  advance(sec) { const n = Math.round(sec / STEP); for (let i = 0; i < n; i++) this._step(); }

  _step() {
    this.t += STEP;
    if (this.status === 'running') {
      if (this.comboT > 0) {
        this.comboT -= STEP;
        if (this.comboT <= 0) this._breakCombo('timeout');
      }
      this._planEndless();
      this._processSpawns();
    }
    this._updateEnemies();
    if (this.status === 'running') this._checkEnd();
  }

  _breakCombo(why) {
    if (this.streak > 0) this.events.push({ type: 'comboBreak', why, streak: this.streak });
    this.streak = 0; this.comboT = 0;
  }

  // ------------------------------------------------------------------ Endlosmodus: nächste Welle planen
  _planEndless() {
    if (this.mode !== 'endless') return;
    if (this.queue.length || this.warnings.length || this.followups.length) return;
    if (this.t < this.nextWaveAt) return;
    this.wave++;
    const { events, params } = buildEndlessWave(this.wave, this.seed);
    const base = this.t + (this.wave === 1 ? 2.2 : 0.6);
    this.queue = events.map((e) => Object.assign({}, e, { at: base + e.at }));
    this.speedMul = params.speed; this.capBase = params.cap; this.waveRows = params.rows;
    // nach der Welle: Entlastungsphase, bevor die nächste geplant wird
    const lastAt = this.queue.length ? this.queue[this.queue.length - 1].at : this.t;
    this.nextWaveAt = lastAt + params.relief;
    this.events.push({ type: 'wave', wave: this.wave });
  }

  // ------------------------------------------------------------------ Spawns
  _capacityOk(type) {
    let n = this.warnings.length;
    let same = 0;
    for (const e of this.enemies) if (e.state === 'walk') { n++; if (e.type === type) same++; }
    for (const w of this.warnings) if (w.type === type) same++;
    if (n >= this.cap) return false;
    const lim = this.L.limits && this.L.limits[type];
    if (lim && same >= lim) return false;
    return true;
  }

  _processSpawns() {
    // Folgegegner der Nachrücker haben Vorrang
    if (this.followups.length && this._capacityOk('standard')) {
      const f = this.followups.shift();
      this._startWarning({
        at: this.t, type: 'standard', ent: f.ent, d: this._pickDepth(), r1: this.rng(), r2: this.rng(), hp: 1, boss: null, follow: true
      }, FOLLOWUP_LEAD);
    }
    const next = this.queue[0];
    if (next) {
      const lead = TYPES[next.type].lead;
      if (this.t >= next.at - lead && this.t - this.lastWarn >= MIN_WARN_GAP && this._capacityOk(next.type)) {
        this.queue.shift();
        this._startWarning(next, lead);
      }
    }
    for (let i = this.warnings.length - 1; i >= 0; i--) {
      const w = this.warnings[i];
      w.left -= STEP;
      if (w.left <= 0) { this.warnings.splice(i, 1); this._spawn(w.ev); }
    }
  }

  _pickDepth() {
    const r = this.mode === 'endless' ? this.waveRows : this.L.rows;
    return r[0] + Math.floor(this.rng() * (r[1] - r[0] + 1));
  }

  _startWarning(ev, lead) {
    this.lastWarn = this.t;
    const w = { id: this.nextId++, ev, ent: ev.ent, type: ev.type, left: lead, dur: lead, follow: !!ev.follow, boss: ev.boss };
    this.warnings.push(w);
    this.events.push({ type: 'warn', id: w.id, ent: ev.ent, kind: ev.type, follow: w.follow, dur: lead });
  }

  _pickSeat(ev) {
    const seats = commonTargets()[ev.ent];
    const taken = new Set(this.occupied);
    const targeted = new Set();
    for (const e of this.enemies) if (e.state === 'walk') targeted.add(e.seatId);
    const rows = this.mode === 'endless' ? this.waveRows : this.L.rows;
    let cand = seats.filter((s) => s.depth >= rows[0] && s.depth <= rows[1]);
    if (!cand.length) cand = seats;
    const pref = ev.r2 < 0.5 ? 'a' : 'b';
    const order = (list) => list.slice().sort((p, q) =>
      Math.abs(p.depth - ev.d) - Math.abs(q.depth - ev.d) ||
      (p.side === pref ? 0 : 1) - (q.side === pref ? 0 : 1) || (p.id < q.id ? -1 : 1));
    for (const list of [cand, seats]) {
      const o = order(list);
      const free = o.find((s) => !taken.has(s.id) && !targeted.has(s.id));
      if (free) return free;
    }
    const o = order(seats);
    return o.find((s) => !taken.has(s.id)) || o[0];
  }

  _spawn(ev) {
    const def = TYPES[ev.type];
    const seat = this._pickSeat(ev);
    const boss = ev.type === 'boss' ? BOSSES[ev.boss] : null;
    const f = depthFraction(seat.depth);
    const speed = boss ? boss.speed : def.speed * this.speedMul;
    let dur = (1.0 + 3.2 * f) / speed;
    if (!boss) dur = Math.max(MIN_DUR, dur);
    const e = {
      id: this.nextId++, type: ev.type, def, boss: ev.boss || null, bossName: boss ? boss.name : null,
      accessory: boss ? boss.accessory : null,
      hp: ev.hp, hpMax: ev.hp, ent: ev.ent, seatId: seat.id, depth: seat.depth, dur, p: 0, age: 0,
      state: 'walk', x: 0, y: 0, heading: 0, flinch: 0, flash: 0, sitT: 0, follow: !!ev.follow,
      helmet: ev.type === 'helm', seed: this.rng(),
      zig: def.zig ? { amp: this.layout.aisleHalf * 0.5, freq: 1.4 + this.rng() * 0.4, phase: this.rng() * TAU } : null
    };
    this._place(e, true);
    this.enemies.push(e);
    this.events.push({ type: 'spawn', id: e.id, kind: e.type, ent: e.ent, x: e.x, y: e.y });
  }

  // Position und Blickrichtung aus dem aktuellen Layout
  _place(e, first) {
    let route;
    try { route = this.layout.route(e.ent, e.seatId); } catch (err) { return; }
    const pos = sampleRoute(route, e.p, e.zig);
    const atEnd = e.p >= 0.994;
    const ahead = sampleRoute(route, atEnd ? e.p - 0.006 : e.p + 0.006, e.zig);
    const h = atEnd ? Math.atan2(pos.y - ahead.y, pos.x - ahead.x) : Math.atan2(ahead.y - pos.y, ahead.x - pos.x);
    e.x = pos.x; e.y = pos.y;
    e.heading = first ? h : e.heading + angDiff(e.heading, h) * 0.3;
    e.route = route;
  }

  // ------------------------------------------------------------------ Gegner bewegen
  _updateEnemies() {
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      e.age += STEP;
      if (e.flash > 0) e.flash -= STEP;
      if (e.state === 'sit') {
        e.sitT += STEP;
        if (e.sitT >= SIT_TIME) this.enemies.splice(i, 1);
        continue;
      }
      if (this.status !== 'running') continue;
      if (e.flinch > 0) { e.flinch -= STEP; }
      else {
        const ramp = e.age < EMERGE_TIME ? 0.4 + 0.6 * (e.age / EMERGE_TIME) : 1;
        e.p += (STEP * ramp) / e.dur;
      }
      if (e.p >= 1) { e.p = 1; this._arrive(e); }
      this._place(e, false);
    }
  }

  _arrive(e) {
    e.state = 'sit'; e.sitT = 0;
    this.escaped++; this.resolved++;
    this.defense--;
    this.occupied.add(e.seatId);
    this._breakCombo('escape');
    this.events.push({ type: 'escape', id: e.id, kind: e.type, x: e.x, y: e.y, seat: e.seatId, defense: this.defense, heading: e.heading });
    if (e.type === 'nachr') this.followups.push({ ent: e.ent });
    if (this.defense <= 0) { this.status = 'lost'; this.events.push({ type: 'lost' }); }
  }

  _checkEnd() {
    if (this.mode !== 'level') return;
    if (this.queue.length || this.warnings.length || this.followups.length) return;
    for (const e of this.enemies) if (e.state === 'walk') return;
    this.status = 'won';
    this.events.push({ type: 'won', stars: starsFor(this.escaped) });
  }

  // ------------------------------------------------------------------ Power-up
  arm(on = true) {
    if (!on) { this.armed = false; return false; }
    if (!this.powerEnabled || this.charge < 1 || this.status !== 'running') return false;
    this.armed = true;
    this.events.push({ type: 'armed' });
    return true;
  }
  get powerRadius() { return this.layout.powerR; }

  // ------------------------------------------------------------------ Schlag
  // Rückgabe: { ignored } oder { hits: [...], miss, power, mult }
  strike(x, y) {
    if (this.status !== 'running') return { ignored: true, reason: 'ended' };
    if (this.t - this.lastStrike < STRIKE_COOLDOWN - 1e-9) return { ignored: true, reason: 'cooldown' };
    const unit = this.layout.unit;
    const live = this.enemies.filter((e) => e.state === 'walk');
    let power = this.armed && this.charge > 0;
    let targets = [];

    if (power) {
      const R = Math.max(this.layout.powerR, this.minHit * 2.2);
      // Der Rand des Gegners reicht: Mittelpunkt innerhalb Radius + Körperanteil
      targets = live.map((e) => ({ e, d: Math.hypot(e.x - x, e.y - y) }))
        .filter((c) => c.d <= R + c.e.def.bodyR * unit * 0.6).sort((p, q) => p.d - q.d).map((c) => c.e);
      if (!targets.length) power = false;        // ins Leere: Ladung bleibt, Schlag zählt als Fehlschlag
    } else {
      const c = live.map((e) => ({ e, d: Math.hypot(e.x - x, e.y - y) }))
        .filter((q) => q.d <= Math.max(q.e.def.hitR * unit, this.minHit)).sort((p, q) => p.d - q.d);
      if (c.length) {
        targets.push(c[0].e);
        const second = c.find((q, i) => i > 0 && Math.hypot(q.e.x - c[0].e.x, q.e.y - c[0].e.y) <= (q.e.def.bodyR + c[0].e.def.bodyR) * unit);
        if (second) targets.push(second.e);
      }
    }

    this.lastStrike = this.t;
    this.strikes++;
    const mult = comboMult(this.streak);
    const hits = [];
    if (!targets.length) {
      this._breakCombo('miss');
      this.events.push({ type: 'strike', x, y, hit: false, power: this.armed && this.charge > 0 });
      return { hits, miss: true, power: false, mult };
    }
    this.hitStrikes++;
    if (power) { this.charge = 0; this.armed = false; this.events.push({ type: 'slam', x, y, radius: Math.max(this.layout.powerR, this.minHit * 2.2) }); }
    this.events.push({ type: 'strike', x, y, hit: true, power });
    for (const e of targets) hits.push(this._damage(e, mult));
    this.streak++;
    if (this.streak > this.maxStreak) this.maxStreak = this.streak;
    this.comboT = COMBO_WINDOW;
    this.events.push({ type: 'combo', streak: this.streak, mult: comboMult(this.streak) });
    return { hits, miss: false, power, mult };
  }

  _damage(e, mult) {
    e.hp--;
    e.flash = 0.14;
    const info = { id: e.id, kind: e.type, x: e.x, y: e.y, killed: false, points: 0 };
    if (e.hp <= 0) {
      e.state = 'dead';
      const i = this.enemies.indexOf(e);
      if (i >= 0) this.enemies.splice(i, 1);
      const pts = e.def.pts * mult;
      this.score += pts; this.kills++; this.resolved++;
      info.killed = true; info.points = pts;
      this.events.push({ type: 'kill', id: e.id, kind: e.type, x: e.x, y: e.y, heading: e.heading, points: pts, mult, boss: e.boss, follow: e.follow });
      if (e.type === 'nachr') this.followups.push({ ent: e.ent });
      if (this.powerEnabled && this.charge === 0) {
        this.chargeProg++;
        if (this.chargeProg >= POWER_EVERY) { this.charge = 1; this.chargeProg = 0; this.events.push({ type: 'charged' }); }
      }
    } else if (e.type === 'helm') {
      e.helmet = false;
      e.flinch = FLINCH; e.p = Math.max(0, e.p - 0.012);
      this.events.push({ type: 'helm', id: e.id, x: e.x, y: e.y, heading: e.heading });
    } else {
      e.flinch = 0.12; e.p = Math.max(0, e.p - 0.004);
      this.events.push({ type: 'bosshit', id: e.id, x: e.x, y: e.y, hp: e.hp, hpMax: e.hpMax });
    }
    return info;
  }

  drainEvents() { const ev = this.events; this.events = []; return ev; }

  // ------------------------------------------------------------------ Ergebnis
  summary() {
    return {
      mode: this.mode, level: this.levelId, won: this.status === 'won', lost: this.status === 'lost',
      total: this.total, hit: this.kills, escaped: this.escaped, resolved: this.resolved,
      strikes: this.strikes, hitStrikes: this.hitStrikes,
      accuracy: this.strikes > 0 ? Math.round((this.hitStrikes / this.strikes) * 100) : null,
      maxCombo: this.maxStreak, score: this.score, stars: this.status === 'won' ? starsFor(this.escaped) : 0,
      wave: this.mode === 'endless' ? this.wave : null, time: this.t
    };
  }
}

export { LEVELS, AISLE_IDS };
