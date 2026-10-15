// HAU DIE KAKERLAKE! – Darstellung: Ansicht (Skalierung, Letterbox), Saal-Zwischenspeicher, Effekte.
// Liest nur den Spielzustand und die Ereignisse der Simulation, ändert nichts daran.
// Reihenfolge der Ebenen: Saal → besetzte Sitze → Texte/Blasen/Gefallene → Warnschilder → Gegner (nach y) →
// Hammer, Funken, Kleinteile. So liegen Schrift und Sprechblasen immer UNTER den Gegnern.

import { getLayout } from './layout.js';
import { TYPES, BOSSES } from './levels.js';
import { drawHall, drawRoach, drawToyHammer, drawWarnSign, drawHelmetDebris, drawBriefcase, COL, TAU, star, rr } from './art.js';

const MAX_PARTICLES = 260;
const MAX_DEBRIS = 40;
const FONT = '"Barlow Condensed","Arial Narrow",system-ui,sans-serif';
const TEXT = {
  kill: 'Ich habe noch Redezeit!',
  escape: 'Mein Sitz ist sicher!',
  wave: 'Die nächste kommt bestimmt.',
  nachr: 'Ich bin nur die Vertretung!',
  over: 'Die Sitzung wird vertagt!'
};
const BOSS_BLA = ['Bla bla …', '… und außerdem …', 'Redezeit!', 'Zur Geschäftsordnung!', 'Ähm …'];
const TIE_COL = { standard: '#d62839', flitzer: '#ff7a1a', helm: '#2b6fd6', zickzack: '#8e44ad', koffer: '#1d8a5a', nachr: '#d62839', boss: '#ff8a1f' };

export class Renderer {
  constructor(canvas) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.layoutName = 'land'; this.L = getLayout('land');
    this.open = new Set(['C']);
    this.cssW = 1; this.cssH = 1; this.dpr = 1;
    this.s = 1; this.ox = 0; this.oy = 0; this.fw = 1; this.fh = 1;
    this.top = 0; this.bottom = 0;
    this.bg = null; this.bgKey = '';
    this.time = 0;
    this.hover = null;
    let rm = false;
    try { rm = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { /* egal */ }
    this.reduced = rm;
    this.reset();
  }

  reset() {
    this.particles = []; this.debris = []; this.floaters = []; this.bubbles = []; this.rings = []; this.corpses = [];
    this.marks = new Map();           // Sitz-ID → Zeit seit Besetzung
    this.hammer = null; this.shake = 0; this.lastBubble = -99; this.bossBla = 0;
    this.warnT = 0;
  }

  // ------------------------------------------------------------------ Ansicht
  setLayout(name) {
    this.layoutName = name === 'port' ? 'port' : 'land';
    this.L = getLayout(this.layoutName);
    this._view();
  }
  setOpen(list) { this.open = new Set(list); this.bgKey = ''; }
  resize(w, h, dpr, top = 0, bottom = 0) {
    this.cssW = Math.max(1, w); this.cssH = Math.max(1, h);
    this.dpr = Math.min(2, Math.max(1, dpr || 1));
    this.top = top; this.bottom = bottom;
    this.cv.width = Math.round(this.cssW * this.dpr); this.cv.height = Math.round(this.cssH * this.dpr);
    return this._view();
  }
  _view() {
    const L = this.L;
    const availH = Math.max(50, this.cssH - this.top - this.bottom);
    this.s = Math.min(this.cssW / L.W, availH / L.H);
    this.fw = L.W * this.s; this.fh = L.H * this.s;
    this.ox = (this.cssW - this.fw) / 2;
    const free = this.cssH - this.top - this.bottom - this.fh;
    this.oy = this.top + free * (this.top > 0 ? 0.3 : 0.5);
    this.bgKey = '';
    return { s: this.s, ox: this.ox, oy: this.oy, fw: this.fw, fh: this.fh, freeBottom: this.cssH - this.oy - this.fh };
  }
  toLogical(clientX, clientY) {
    const r = this.cv.getBoundingClientRect();
    return { x: (clientX - r.left - this.ox) / this.s, y: (clientY - r.top - this.oy) / this.s };
  }
  cssToUnits(px) { return px / this.s; }
  setHover(x, y) { this.hover = x == null ? null : { x, y }; }

  _cache() {
    const k = this.layoutName + '|' + Math.round(this.s * this.dpr * 100) + '|' + [...this.open].sort().join();
    if (k === this.bgKey && this.bg) return;
    const L = this.L, f = this.s * this.dpr;
    const c = this.bg || document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(L.W * f)); c.height = Math.max(1, Math.ceil(L.H * f));
    const g = c.getContext('2d');
    g.setTransform(f, 0, 0, f, 0, 0);
    drawHall(g, L, this.open);
    this.bg = c; this.bgKey = k;
  }

  // ------------------------------------------------------------------ Ereignisse → Effekte
  handle(events, game) {
    const L = this.L, u = L.unit;
    for (const ev of events) {
      switch (ev.type) {
        case 'warn': {
          if (ev.kind === 'nachr') this._bubbleAtDoor(ev.ent, TEXT.nachr, game);
          break;
        }
        case 'spawn': {
          this._dust(ev.x, ev.y, ev.kind === 'boss' ? 14 : 6, 1.0);
          if (ev.kind === 'boss') this.shake = Math.max(this.shake, 8);
          break;
        }
        case 'strike': {
          this.hammer = { x: ev.x, y: ev.y, t: 0, power: !!ev.power, hit: ev.hit };
          if (!ev.hit) this._dust(ev.x, ev.y, 5, 0.8);
          break;
        }
        case 'kill': {
          this._kill(ev, game);
          break;
        }
        case 'helm': {
          this._debris('helmet', ev.x, ev.y, ev.heading);
          this._sparks(ev.x, ev.y, 7);
          this.shake = Math.max(this.shake, 4);
          break;
        }
        case 'bosshit': {
          this._sparks(ev.x, ev.y, 9);
          this._debris('paper', ev.x, ev.y, 0);
          this.shake = Math.max(this.shake, 5);
          break;
        }
        case 'escape': {
          this.marks.set(ev.seat, 0);
          this._floater(ev.x, ev.y - 40 * u, 'Sitz besetzt!', '#ff6b5a', 1.2, 34);
          this.shake = Math.max(this.shake, 6);
          this._debris('paper', ev.x, ev.y, 0); this._debris('paper', ev.x, ev.y, 0);
          this._bubble(TEXT.escape, ev.x, ev.y, game, 0.55);
          break;
        }
        case 'slam': {
          this.rings.push({ x: ev.x, y: ev.y, r: ev.radius, t: 0, max: 0.5 });
          this._floater(ev.x, ev.y - ev.radius * 0.55, 'DIE GROSSE KLATSCHE!', '#ffd21c', 1.1, 48);
          this.shake = Math.max(this.shake, 12);
          for (let i = 0; i < 18; i++) this._dust(ev.x + (Math.random() - 0.5) * ev.radius, ev.y + (Math.random() - 0.5) * ev.radius * 0.8, 1, 1.4);
          break;
        }
        case 'combo': {
          if ((ev.streak === 5 || ev.streak === 10) && this.hammer) {
            this._floater(this.hammer.x, this.hammer.y - 90 * u, 'KOMBO ×' + ev.mult + '!', '#ff9200', 1.0, 44);
          }
          break;
        }
        case 'wave': if (ev.wave > 1 && Math.random() < 0.5) this._bubbleAtDoor('C', TEXT.wave, game); break;
        case 'won': this._confetti(L.W / 2, L.H * 0.35, 60); break;
        case 'lost': this.shake = Math.max(this.shake, 14); break;
        default: break;
      }
    }
  }

  _kill(ev, game) {
    const u = this.L.unit;
    this.corpses.push({ x: ev.x, y: ev.y, heading: ev.heading, kind: ev.kind, boss: ev.boss, t: 0, seed: Math.random(), big: ev.kind === 'boss' });
    const col = ev.mult >= 3 ? '#ff9200' : ev.mult === 2 ? '#ffd21c' : '#ffffff';
    this._floater(ev.x, ev.y - 30 * u, '+' + ev.points + (ev.mult > 1 ? ' ×' + ev.mult : ''), col, 0.95, ev.kind === 'boss' ? 56 : 36);
    this._sparks(ev.x, ev.y, ev.kind === 'boss' ? 24 : 10);
    // Krawatte, Papier oder Aktenkoffer fliegen durch die Luft
    if (ev.kind === 'koffer') { this._debris('case', ev.x, ev.y, 0); for (let i = 0; i < 4; i++) this._debris('paper', ev.x, ev.y, 0); }
    else { this._debris('tie', ev.x, ev.y, ev.heading, TIE_COL[ev.kind]); if (Math.random() < 0.6) this._debris('paper', ev.x, ev.y, 0); }
    if (ev.kind === 'boss') {
      this._confetti(ev.x, ev.y, 50);
      this.shake = Math.max(this.shake, 14);
      for (let i = 0; i < 5; i++) this._debris('paper', ev.x, ev.y, 0);
      this._bubble(TEXT.over, ev.x, ev.y, game, 1);
    } else if (Math.random() < 0.1) {
      this._bubble(TEXT.kill, ev.x, ev.y, game, 1);
    }
  }

  // ------------------------------------------------------------------ Effekt-Bausteine
  _addP(p) { if (this.particles.length >= MAX_PARTICLES) this.particles.shift(); this.particles.push(p); }
  _sparks(x, y, n) {
    const u = this.L.unit;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, v = (120 + Math.random() * 260) * u;
      this._addP({ k: 'star', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 80 * u, g: 500 * u, life: 0, max: 0.45 + Math.random() * 0.3, size: (7 + Math.random() * 8) * u, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 12, c: ['#ffd21c', '#fff', '#ff9200'][i % 3] });
    }
  }
  _dust(x, y, n, k) {
    const u = this.L.unit;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, v = (30 + Math.random() * 90) * u * k;
      this._addP({ k: 'dust', x: x + Math.cos(a) * 8, y: y + Math.sin(a) * 6 + 10, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.5 - 10, g: 0, life: 0, max: 0.4 + Math.random() * 0.3, size: (9 + Math.random() * 9) * u, rot: 0, vr: 0, c: '#e8dcc0' });
    }
  }
  _confetti(x, y, n) {
    const u = this.L.unit, cols = ['#ff4a13', '#ffd21c', '#3fa7ad', '#fff', '#8e44ad', '#3cc46a'];
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, v = (80 + Math.random() * 380) * u;
      this._addP({ k: 'conf', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 220 * u, g: 600 * u, life: 0, max: 1.0 + Math.random() * 0.8, size: (6 + Math.random() * 6) * u, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 16, c: cols[i % cols.length] });
    }
  }
  _debris(kind, x, y, heading, col) {
    if (this.debris.length >= MAX_DEBRIS) this.debris.shift();
    const u = this.L.unit, a = Math.random() * TAU, v = (80 + Math.random() * 190) * u;
    this.debris.push({
      kind, x, y, z: 14 * u, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.6, vz: (320 + Math.random() * 260) * u,
      rot: Math.random() * 6, vr: (Math.random() - 0.5) * 14, t: 0, max: 1.15, col: col || '#d62839', ph: Math.random() * 6
    });
  }
  _floater(x, y, text, col, max, size) {
    const u = this.L.unit;
    if (this.floaters.length > 14) this.floaters.shift();
    this.floaters.push({ x, y, text, col, t: 0, max, size: Math.max(size * u * 0.9, 13 / this.s) });
  }

  // Sprechblase: nur wenn selten genug und wenn sie keinen Gegner verdeckt
  _bubble(text, x, y, game, chance) {
    if (this.time - this.lastBubble < 5 || this.bubbles.length >= 1 || Math.random() > chance) return;
    const ctx = this.ctx, u = this.L.unit, size = Math.max(26 * u, 13 / this.s);
    ctx.font = '700 ' + size + 'px ' + FONT;
    const w = ctx.measureText(text).width + size * 1.1, h = size * 1.7;
    const R = 120 * u;
    const cands = [[0, -R], [R, -R * 0.8], [-R, -R * 0.8], [0, R * 0.9], [R * 1.1, 0], [-R * 1.1, 0], [0, -R * 1.8]];
    const L = this.L, minY = 70 / this.s + h * 0.5;
    for (const [dx, dy] of cands) {
      const cx = Math.min(L.W - w / 2 - 12, Math.max(w / 2 + 12, x + dx));
      const cy = Math.min(L.H - h / 2 - 12, Math.max(minY, y + dy));
      if (this._bubbleFree(cx, cy, w, h, game)) {
        this.lastBubble = this.time;
        this.bubbles.push({ text, x: cx, y: cy, w, h, size, sx: x, sy: y, t: 0, max: 2.1 });
        return;
      }
    }
  }
  _bubbleAtDoor(ent, text, game) {
    const A = this.L.aisles[ent];
    if (!A) return;
    this._bubble(text, A.start.x - A.dirX * 40 * this.L.unit, A.start.y - A.dirY * 40 * this.L.unit, game, 1);
  }
  _bubbleFree(cx, cy, w, h, game) {
    if (!game) return true;
    const u = this.L.unit, m = 14 * u;
    const hit = (px, py, r) => {
      const nx = Math.max(cx - w / 2, Math.min(px, cx + w / 2)), ny = Math.max(cy - h / 2, Math.min(py, cy + h / 2));
      return Math.hypot(px - nx, py - ny) < r + m;
    };
    for (const e of game.enemies) {
      if (hit(e.x, e.y, e.def.bodyR * u * 1.3)) return false;
      const t = this.L.targetById[e.seatId];
      if (t && e.state === 'walk' && hit(t.x, t.y, 40 * u)) return false;
    }
    for (const w2 of game.warnings) {
      const A = this.L.aisles[w2.ent];
      if (A && hit(A.start.x, A.start.y, 70 * u)) return false;
    }
    return true;
  }

  // ------------------------------------------------------------------ Zeichnen
  update(dt) {
    dt = Math.min(0.05, Math.max(0, dt));
    if (dt <= 0) return;
    this.time += dt;
    for (const p of this.particles) { p.life += dt; p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt; if (p.k === 'dust') { p.vx *= 0.94; p.vy *= 0.94; } }
    this.particles = this.particles.filter((p) => p.life < p.max);
    for (const d of this.debris) {
      d.t += dt;
      if (d.z > 0 || d.vz > 0) { d.vz -= 900 * this.L.unit * dt; d.z += d.vz * dt; d.x += d.vx * dt; d.y += d.vy * dt; d.rot += d.vr * dt; if (d.z <= 0) { d.z = 0; d.vz = 0; d.vx = d.vy = 0; d.vr = 0; } }
    }
    this.debris = this.debris.filter((d) => d.t < d.max);
    for (const f of this.floaters) f.t += dt;
    this.floaters = this.floaters.filter((f) => f.t < f.max);
    for (const b of this.bubbles) b.t += dt;
    this.bubbles = this.bubbles.filter((b) => b.t < b.max);
    for (const r of this.rings) r.t += dt;
    this.rings = this.rings.filter((r) => r.t < r.max);
    for (const c of this.corpses) c.t += dt;
    this.corpses = this.corpses.filter((c) => c.t < 0.85);
    for (const [k, v] of this.marks) this.marks.set(k, v + dt);
    if (this.hammer) { this.hammer.t += dt; if (this.hammer.t > 0.32) this.hammer = null; }
    this.shake = Math.max(0, this.shake - dt * 40);
  }

  draw(game, dt) {
    this.update(dt);
    const ctx = this.ctx, dpr = this.dpr, s = this.s, L = this.L, u = L.unit, time = this.time;
    this._cache();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#11121A'; ctx.fillRect(0, 0, this.cv.width, this.cv.height);
    let shx = 0, shy = 0;
    if (!this.reduced && this.shake > 0.1) { shx = (Math.random() - 0.5) * this.shake; shy = (Math.random() - 0.5) * this.shake; }
    ctx.drawImage(this.bg, (this.ox + shx) * dpr, (this.oy + shy) * dpr, L.W * s * dpr, L.H * s * dpr);
    ctx.setTransform(dpr * s, 0, 0, dpr * s, (this.ox + shx) * dpr, (this.oy + shy) * dpr);
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, L.W, L.H); ctx.clip();
    if (!game) { ctx.restore(); return; }

    // besetzte Sitze: aufgeklappter Aktenkoffer mit Papieren
    for (const id of game.occupied) {
      const t = L.targetById[id];
      if (!t) continue;
      const age = this.marks.has(id) ? this.marks.get(id) : 9;
      this._drawOccupied(ctx, t, age, u);
    }
    // Gefallene (flach gedrückt, dann ausgeblendet)
    for (const c of this.corpses) this._drawCorpse(ctx, c, time, u);
    // Texte
    for (const f of this.floaters) this._drawFloater(ctx, f);
    for (const b of this.bubbles) this._drawBubble(ctx, b);
    this._decorBubbles(ctx, game, u, time);
    // Warnschilder an den Eingängen
    for (const w of game.warnings) {
      const A = L.aisles[w.ent];
      if (!A) continue;
      const shake = this.reduced ? 0 : Math.sin(time * 40) * 2 * u;
      const px = A.start.x - A.dirX * 6 * u + shake, py = A.start.y - A.dirY * 6 * u;
      const k = 1 - w.left / w.dur;
      ctx.save(); ctx.translate(px, py - 36 * u);
      ctx.fillStyle = 'rgba(255,60,40,' + (0.15 + 0.15 * Math.sin(time * 12)) + ')';
      ctx.beginPath(); ctx.ellipse(0, 36 * u, 62 * u, 40 * u, 0, 0, TAU); ctx.fill();
      drawWarnSign(ctx, w.type === 'boss' || w.type === 'flitzer' ? w.type : 'std', time + k, u * (w.type === 'boss' ? 1.35 : 1));
      ctx.restore();
    }
    // Gegner, hinten zuerst
    const list = game.enemies.slice().sort((a, b) => a.y - b.y);
    for (const e of list) {
      if (e.state === 'sit') { const t = L.targetById[e.seatId]; if (t) e.seatRot = t.rot; }
      drawRoach(ctx, e, time, u);
    }
    for (const e of list) if (e.type === 'boss' && e.state === 'walk') this._drawBossBar(ctx, e, u);

    // Schlagradius (nur Maus) und großer Hammer
    if (this.hover && game.status === 'running') {
      ctx.save(); ctx.translate(this.hover.x, this.hover.y);
      if (game.armed) {
        ctx.strokeStyle = 'rgba(255,210,28,.85)'; ctx.lineWidth = 5 * u; ctx.setLineDash([18 * u, 12 * u]); ctx.lineDashOffset = -time * 60;
        ctx.beginPath(); ctx.arc(0, 0, game.powerRadius, 0, TAU); ctx.stroke();
        ctx.fillStyle = 'rgba(255,210,28,.12)'; ctx.fill();
      } else {
        ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 3 * u;
        ctx.beginPath(); ctx.arc(0, 0, 34 * u, 0, TAU); ctx.stroke();
      }
      ctx.restore();
    }
    for (const r of this.rings) {
      const k = r.t / r.max, a = 1 - k;
      ctx.strokeStyle = 'rgba(255,210,28,' + a + ')'; ctx.lineWidth = 12 * u * a + 2;
      ctx.beginPath(); ctx.arc(r.x, r.y, r.r * (0.3 + 0.7 * k), 0, TAU); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,' + a * 0.18 + ')'; ctx.fill();
    }
    this._drawDebris(ctx, u);
    this._drawParticles(ctx);
    if (this.hammer) this._drawHammer(ctx, this.hammer, u);
    ctx.restore();
  }

  _drawOccupied(ctx, t, age, u) {
    const pop = age < 0.5 ? Math.min(1, age / 0.5) : 1;
    ctx.save(); ctx.translate(t.x, t.y);
    ctx.fillStyle = 'rgba(179,25,18,' + (0.38 * pop) + ')';
    ctx.beginPath(); ctx.arc(0, 0, this.L.seatW * 0.62, 0, TAU); ctx.fill();
    ctx.rotate(t.rot + Math.PI / 2);
    ctx.scale(u * (0.6 + 0.4 * pop), u * (0.6 + 0.4 * pop));
    // Papiere ragen heraus
    ctx.fillStyle = '#fff'; ctx.strokeStyle = COL.ink; ctx.lineWidth = 2;
    ctx.save(); ctx.rotate(-0.25); ctx.fillRect(-12, -22, 16, 18); ctx.strokeRect(-12, -22, 16, 18); ctx.restore();
    ctx.save(); ctx.rotate(0.2); ctx.fillRect(-2, -24, 16, 18); ctx.strokeRect(-2, -24, 16, 18); ctx.restore();
    drawBriefcase(ctx, 36, 24, true, age);
    ctx.restore();
  }

  _drawCorpse(ctx, c, time, u) {
    const t = c.t;
    const flat = Math.min(1, t / 0.12);
    const alpha = t < 0.45 ? 1 : Math.max(0, 1 - (t - 0.45) / 0.4);
    const fake = {
      x: c.x, y: c.y, heading: c.heading, type: c.kind, def: this._def(c.kind), state: 'walk', age: 1, hp: 0, hpMax: 1,
      helmet: false, flash: Math.max(0, 0.14 - t), seed: c.seed, flinch: 1, accessory: c.boss ? this._acc(c.boss) : null, zig: null, sitT: 0
    };
    ctx.save();
    ctx.translate(c.x, c.y); ctx.scale(1 + 0.18 * flat, 1 - 0.55 * flat); ctx.translate(-c.x, -c.y);
    drawRoach(ctx, fake, time, u, { alpha });
    ctx.restore();
    // Sternchen kreisen
    if (t > 0.08) {
      const n = c.big ? 5 : 3, r = (c.big ? 70 : 34) * u;
      ctx.fillStyle = '#ffd21c'; ctx.strokeStyle = COL.ink; ctx.lineWidth = 1.5;
      ctx.globalAlpha = alpha;
      for (let i = 0; i < n; i++) {
        const a = time * 7 + (i * TAU) / n;
        star(ctx, c.x + Math.cos(a) * r, c.y - 18 * u + Math.sin(a) * r * 0.35, 8 * u, a); ctx.fill(); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
  }
  _def(kind) { return TYPES[kind]; }
  _acc(boss) { return BOSSES[boss] ? BOSSES[boss].accessory : null; }

  _drawFloater(ctx, f) {
    const k = f.t / f.max, a = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
    const pop = k < 0.12 ? 0.6 + (k / 0.12) * 0.55 : 1.15 - Math.min(0.15, (k - 0.12) * 0.5);
    const y = f.y - 54 * this.L.unit * Math.min(1, k * 1.4);
    ctx.save(); ctx.globalAlpha = a; ctx.translate(f.x, y); ctx.scale(pop, pop);
    ctx.font = '800 ' + f.size + 'px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round'; ctx.lineWidth = f.size * 0.22; ctx.strokeStyle = COL.ink; ctx.strokeText(f.text, 0, 0);
    ctx.fillStyle = f.col; ctx.fillText(f.text, 0, 0);
    ctx.restore();
  }

  _drawBubble(ctx, b) {
    const k = b.t / b.max, a = k < 0.12 ? k / 0.12 : k > 0.85 ? (1 - k) / 0.15 : 1;
    this._bubbleShape(ctx, b.text, b.x, b.y, b.w, b.h, b.size, b.sx, b.sy, a);
  }
  _bubbleShape(ctx, text, x, y, w, h, size, sx, sy, a) {
    ctx.save(); ctx.globalAlpha = a;
    ctx.fillStyle = '#fff'; ctx.strokeStyle = COL.ink; ctx.lineWidth = size * 0.12; ctx.lineJoin = 'round';
    rr(ctx, x - w / 2, y - h / 2, w, h, h * 0.45); ctx.fill(); ctx.stroke();
    // Zipfel zum Sprecher
    const dx = sx - x, dy = sy - y, l = Math.hypot(dx, dy) || 1;
    const bx = x + Math.max(-w / 2 + h * 0.6, Math.min(w / 2 - h * 0.6, dx * 0.3)), by = y + (dy > 0 ? h / 2 : -h / 2);
    const tx = bx + (dx / l) * h * 0.55, ty = by + (dy > 0 ? 1 : -1) * h * 0.5;
    ctx.beginPath(); ctx.moveTo(bx - h * 0.18, by); ctx.lineTo(tx, ty); ctx.lineTo(bx + h * 0.18, by); ctx.closePath();
    ctx.fillStyle = '#fff'; ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.fillRect(bx - h * 0.16, by - 2, h * 0.32, 4);
    ctx.fillStyle = COL.ink; ctx.font = '700 ' + size + 'px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y + size * 0.03);
    ctx.restore();
  }
  // Der Dauerredner plappert: kleine, rein dekorative Blasen, die dem Boss folgen (liegen unter den Gegnern)
  _decorBubbles(ctx, game, u, time) {
    for (const e of game.enemies) {
      if (e.type !== 'boss' || e.accessory !== 'megaphone' || e.state !== 'walk') continue;
      const cyc = 1.5, ph = (time + e.seed * 3) % cyc, idx = Math.floor((time + e.seed * 3) / cyc);
      if (ph > 1.15) continue;
      const a = ph < 0.15 ? ph / 0.15 : ph > 0.9 ? (1.15 - ph) / 0.25 : 1;
      const text = BOSS_BLA[idx % BOSS_BLA.length];
      const size = Math.max(20 * u, 11 / this.s);
      ctx.font = '700 ' + size + 'px ' + FONT;
      const w = ctx.measureText(text).width + size, h = size * 1.6;
      const side = (idx % 2) ? 1 : -1;
      const x = Math.min(this.L.W - w / 2 - 6, Math.max(w / 2 + 6, e.x + side * 150 * u)), y = Math.max(70 / this.s + h, e.y - 120 * u);
      this._bubbleShape(ctx, text, x, y, w, h, size, e.x, e.y - 40 * u, a);
    }
  }

  _drawBossBar(ctx, e, u) {
    const w = 130 * u, h = 15 * u, x = e.x - w / 2, y = e.y - 98 * u;
    ctx.save();
    ctx.fillStyle = 'rgba(17,18,26,.85)'; rr(ctx, x - 3 * u, y - 3 * u, w + 6 * u, h + 6 * u, 6 * u); ctx.fill();
    const f = Math.max(0, e.hp / e.hpMax);
    ctx.fillStyle = f > 0.5 ? '#3cc46a' : f > 0.25 ? '#ffd21c' : '#ff4a13';
    rr(ctx, x, y, w * f, h, 4 * u); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.lineWidth = 1.5 * u;
    for (let i = 1; i < e.hpMax; i++) { ctx.beginPath(); ctx.moveTo(x + (w * i) / e.hpMax, y); ctx.lineTo(x + (w * i) / e.hpMax, y + h); ctx.stroke(); }
    ctx.restore();
  }

  _drawDebris(ctx, u) {
    for (const d of this.debris) {
      const a = d.t > d.max - 0.35 ? Math.max(0, (d.max - d.t) / 0.35) : 1;
      ctx.save(); ctx.globalAlpha = a;
      ctx.translate(d.x + (d.kind === 'paper' && d.z > 0 ? Math.sin(d.t * 9 + d.ph) * 8 * u : 0), d.y - d.z);
      ctx.rotate(d.rot); ctx.scale(u, u);
      if (d.z > 0) { /* Schatten wird separat gezeichnet */ }
      if (d.kind === 'helmet') drawHelmetDebris(ctx);
      else if (d.kind === 'case') drawBriefcase(ctx, 32, 22, false);
      else if (d.kind === 'paper') {
        ctx.fillStyle = '#fff'; ctx.strokeStyle = COL.ink; ctx.lineWidth = 2;
        ctx.fillRect(-9, -12, 18, 24); ctx.strokeRect(-9, -12, 18, 24);
        ctx.strokeStyle = '#8a97ad'; ctx.lineWidth = 1.6;
        for (let y = -6; y <= 6; y += 5) { ctx.beginPath(); ctx.moveTo(-5, y); ctx.lineTo(5, y); ctx.stroke(); }
      } else {
        ctx.fillStyle = d.col; ctx.strokeStyle = COL.ink; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(-4, -8); ctx.lineTo(4, -8); ctx.lineTo(7, 14); ctx.lineTo(0, 19); ctx.lineTo(-7, 14); ctx.closePath(); ctx.fill(); ctx.stroke();
      }
      ctx.restore();
    }
  }

  _drawParticles(ctx) {
    for (const p of this.particles) {
      const k = p.life / p.max, a = 1 - k;
      ctx.save(); ctx.globalAlpha = Math.max(0, a);
      if (p.k === 'star') { ctx.fillStyle = p.c; ctx.strokeStyle = COL.ink; ctx.lineWidth = 1.5; star(ctx, p.x, p.y, p.size * (1 - k * 0.4), p.rot); ctx.fill(); ctx.stroke(); }
      else if (p.k === 'conf') { ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillStyle = p.c; ctx.fillRect(-p.size, -p.size * 0.5, p.size * 2, p.size); }
      else { ctx.fillStyle = 'rgba(232,220,192,.55)'; ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (0.5 + k * 0.8), 0, TAU); ctx.fill(); }
      ctx.restore();
    }
  }

  _drawHammer(ctx, h, u) {
    const t = h.t;
    const down = Math.min(1, t / 0.07);                 // schnelles Herabsausen
    const ease = 1 - (1 - down) * (1 - down);
    const hold = t < 0.16 ? 1 : Math.max(0, 1 - (t - 0.16) / 0.16);
    const sc = (0.95 + (1 - ease) * 0.45) * u * (h.power ? 1.8 : 1);
    ctx.save();
    ctx.globalAlpha = hold;
    ctx.translate(h.x, h.y - (1 - ease) * 60 * u);
    ctx.rotate(-0.55 * (1 - ease));
    if (t > 0.07 && t < 0.15) ctx.scale(1.12, 0.88);       // Quetschen beim Aufprall
    // Aufprallstern
    if (h.hit && t > 0.05 && t < 0.2) {
      ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.strokeStyle = '#ff9200'; ctx.lineWidth = 4;
      star(ctx, 0, 0, (46 + (t - 0.05) * 160) * u * (h.power ? 2 : 1), t * 6); ctx.fill(); ctx.stroke();
    }
    drawToyHammer(ctx, sc);
    ctx.restore();
  }
}
