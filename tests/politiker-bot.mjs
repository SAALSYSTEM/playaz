// Spielbots für HAU DIE „POLITIKER“: spielen ein Level mit festgelegter Reaktionszeit, Schlagtempo und Trefferquote
// durch. Sie nutzen nur die öffentliche Schnittstelle (strike/arm), wie ein Mensch am Bildschirm.
import { Game, STEP } from '../public/spiele/hau-die-politiker/sim.js';
import { mulberry32 } from '../public/spiele/hau-die-politiker/levels.js';

// reaction: Sekunden, bis ein neuer Gegner bemerkt wird. base + perUnit·Entfernung: Zeit für die Zeigerbewegung zum
// nächsten Ziel (Layout-Einheiten). accuracy: Anteil der Schläge, die zielen wie vorgesehen (Rest geht daneben).
export const SKILLS = {
  perfekt: { reaction: 0.12, base: 0.22, perUnit: 0.0001, accuracy: 1.0 },
  gut:     { reaction: 0.40, base: 0.24, perUnit: 0.00035, accuracy: 0.90 },
  locker:  { reaction: 0.65, base: 0.32, perUnit: 0.0005, accuracy: 0.78 }
};

const layoutCenter = (name) => (name === 'port' ? { x: 450, y: 800 } : { x: 800, y: 500 });

export function playBot(level, opts = {}) {
  const { layout = 'land', skill = 'gut', sizeFactor = 1, seed = 1, limit = 900, minHit = 0, usePower = true } = opts;
  const S = typeof skill === 'string' ? SKILLS[skill] : skill;
  const g = new Game({ level, layout, sizeFactor, seed, minHit });
  const rng = mulberry32(seed * 977 + (typeof level === 'number' ? level : 99));
  const seen = new Map();
  let next = 0.5;
  let cx = layoutCenter(layout).x, cy = layoutCenter(layout).y;
  let maxActive = 0;
  while (!g.done && g.t < limit) {
    g.advance(STEP);
    for (const e of g.enemies) if (e.state === 'walk' && !seen.has(e.id)) seen.set(e.id, g.t);
    const act = g.activeCount; if (act > maxActive) maxActive = act;
    if (g.t < next) continue;
    const cands = g.enemies.filter((e) => e.state === 'walk' && g.t - seen.get(e.id) >= S.reaction);
    if (!cands.length) continue;
    // dringendster zuerst: kleinste Restzeit bis zum Sitz
    cands.sort((a, b) => (1 - a.p) * a.dur - (1 - b.p) * b.dur);
    const t = cands[0];
    if (usePower && g.charge > 0 && g.powerEnabled) {
      const R = g.layout.powerR;
      const near = g.enemies.filter((e) => e.state === 'walk' && Math.hypot(e.x - t.x, e.y - t.y) < R * 0.8).length;
      if (near >= 3 && !g.armed) g.arm(true);
    }
    let x = t.x, y = t.y;
    if (rng() > S.accuracy) { const a = rng() * Math.PI * 2; x += Math.cos(a) * 150; y += Math.sin(a) * 150; }
    g.strike(x, y);
    const dist = Math.hypot(x - cx, y - cy);
    cx = x; cy = y;
    next = g.t + Math.max(0.2, S.base + S.perUnit * dist);
  }
  return { g, summary: g.summary(), maxActive };
}
