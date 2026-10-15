// ZAHLENSTURM: Spielregeln ohne Darstellung (läuft im Browser, in Node-Tests und im Lösungs-Bot identisch).
// Feste Schritte (60 Hz), keine Zufallszahlen: gleiche Eingaben ergeben immer dasselbe Ergebnis.
//
// Koordinaten: x = quer zur Strecke (−hw … +hw), z = Meter in Laufrichtung. Die Gruppe wird als Mitte (x) + Breite (w) geführt,
// Tore und Hindernisse reagieren auf die Mitte bzw. auf den überdeckten Teil der Gruppe.

export const SIM_VERSION = 1;
export const HZ = 60;
export const DT = 1 / HZ;
export const SPEED = 9;          // m/s Laufgeschwindigkeit
export const LAT_SPEED = 16;     // m/s maximale Seitenbewegung
export const FOLLOW = 14;        // 1/s weiche Nachführung zum Zielpunkt
export const MAX_N = 9999;       // technische Obergrenze der Gruppe (Anzeige „9999“)
export const DPS = 1;            // Schaden pro Figur und Sekunde im Kampf
export const BONUS_CAP = 300;    // höchstens so viele Figuren zählen für die Bonus-Münzen
export const BONUS_DIV = 15;     // Münzen je Sprosse = ceil(min(n, BONUS_CAP) × Faktor / BONUS_DIV)
export const BONUS_GAP = 11;     // Abstand der Bonus-Sprossen in Metern
export const BONUS_START = 16;   // erste Sprosse so viele Meter hinter dem Boss

export const OPS = ['+', '-', '×', '÷'];

// Breite der Gruppe (Halbbreite) in Metern. Wächst mit der Wurzel der Figurenzahl, bis MAX_W.
export const MAX_W = 3.2;   // ab hier wird die Gruppe nur noch dichter, nicht breiter
export const crowdHalfWidth = (n) => (n <= 0 ? 0 : Math.min(MAX_W, 0.35 + 0.14 * Math.sqrt(n)));

// Rechenoperation. Immer ganze Figuren, nie negativ, nie über MAX_N.
export function applyOp(n, op, v) {
  let r;
  switch (op) {
    case '+': r = n + v; break;
    case '-': r = n - v; break;
    case '×': r = n * v; break;
    case '÷': r = Math.floor(n / v); break;
    default: r = n;
  }
  r = Math.floor(r);
  return r < 0 ? 0 : r > MAX_N ? MAX_N : r;
}
export const opText = (op, v) => (op === '-' ? '−' : op) + v;

// Begehbare Mitte der Gruppe: große Gruppen haben weniger Spielraum
export function xLimit(hw, n) {
  const w = Math.min(crowdHalfWidth(n), hw * 0.8);
  return hw - w;
}

// Zustand eines beweglichen Hindernisses zur Zeit t (Sekunden). Wird auch vom Rendering benutzt.
export function obstacleState(o, t) {
  const ph = (o.ph || 0) + (o.period ? (2 * Math.PI * t) / o.period : 0);
  switch (o.type) {
    case 'mover': return { x: o.cx + o.amp * Math.sin(ph), half: o.half };
    case 'rotor': return { x: o.cx, half: Math.max(0.35, (o.len / 2) * Math.abs(Math.cos(ph))), winkel: ph };
    case 'plat': return { x: o.cx + o.amp * Math.sin(ph), half: o.pw };
    default: return { x: (o.x0 + o.x1) / 2, half: (o.x1 - o.x0) / 2 };
  }
}

// Überdeckung der Gruppe [x−w, x+w] mit dem Intervall [a, b]: Anteil an der Gruppenbreite (0…1)
function anteil(x, w, a, b) {
  const ww = Math.max(w - 0.12, 0.05);   // kleine Toleranz an den Rändern
  const ov = Math.min(b, x + ww) - Math.max(a, x - ww);
  return ov > 0 ? Math.min(1, ov / (2 * ww)) : 0;
}

// Verlust durch ein Hindernis bei Gruppenmitte x, Breite w, Gruppengröße n, Zeit t
export function obstacleLoss(o, x, n, t, hw) {
  const w = crowdHalfWidth(n);
  const st = obstacleState(o, t);
  let f;
  if (o.type === 'plat') f = 1 - anteil(x, w, st.x - st.half, st.x + st.half);     // alles außerhalb der Plattform fällt
  else f = anteil(x, w, st.x - st.half, st.x + st.half);
  if (f <= 1e-9) return 0;
  if (o.type === 'spikes') return Math.min(n, o.cost);
  return Math.min(n, Math.ceil(n * f - 1e-9));
}

// Level für die Simulation vorbereiten (Ereignisse nach z sortieren)
export function prepare(level) {
  if (level._p) return level._p;
  const ev = [];
  for (const g of level.gates || []) ev.push({ k: 'gate', z: g.z, g, o: 0 });
  for (const o of level.obs || []) ev.push({ k: 'obs', z: o.z, o, o2: 1 });
  for (const e of level.enemies || []) ev.push({ k: 'enemy', z: e.z, e, o2: 2 });
  if (level.boss) ev.push({ k: 'enemy', z: level.boss.z, e: { ...level.boss, boss: true, x0: -level.hw, x1: level.hw }, o2: 3 });
  ev.sort((a, b) => a.z - b.z || (a.o2 || 0) - (b.o2 || 0));
  const coins = [...(level.coins || [])].map((c) => ({ x: c[0], z: c[1] })).sort((a, b) => a.z - b.z);
  const rungs = (level.bonus || []).map((r, i) => ({ z: (level.boss ? level.boss.z : level.len) + BONUS_START + i * BONUS_GAP, lanes: r }));
  const ende = rungs.length ? rungs[rungs.length - 1].z + 14 : (level.boss ? level.boss.z : level.len) + 8;
  return (level._p = { ev, coins, rungs, ende });
}

export function createSim(level, opts = {}) {
  const p = prepare(level);
  const s = {
    t: 0, x: 0, z: 0, tx: 0, n: level.start, phase: 'run',   // run | fight | bonus | won | lost
    ei: 0, ci: 0, ri: 0, coins: 0, bonusCoins: 0, mults: [], fight: null, why: null,
    stats: { maxN: level.start, hazardLoss: 0, gateLoss: 0, fightLoss: 0, bossN: 0, gates: 0, hits: 0, fights: 0, avoided: 0 },
    log: []                                    // Ereignisse seit dem letzten Abholen (für Darstellung und Ton)
  };
  return { level, p, s };
}

export function cloneSim(sim) { return { level: sim.level, p: sim.p, s: structuredClone(sim.s) }; }

function lose(s, why) { s.n = 0; s.phase = 'lost'; s.why = why; s.log.push({ e: 'lost', why }); }
function setN(s, n) { s.n = n; if (n > s.stats.maxN) s.stats.maxN = n; }

// Ein Simulationsschritt. tx = gewünschte Quer-Position (wird in die Strecke geklemmt).
export function step(sim, tx) {
  const { level, p, s } = sim;
  if (s.phase === 'won' || s.phase === 'lost') return;
  const hw = level.hw;
  s.t++;
  const sek = s.t * DT;
  const lim = xLimit(hw, s.n);
  s.tx = Math.max(-lim, Math.min(lim, tx));
  // Seitenbewegung (auch im Kampf, damit die Gruppe nicht einfriert)
  const dx = s.tx - s.x;
  s.x += Math.max(-LAT_SPEED * DT, Math.min(LAT_SPEED * DT, dx * FOLLOW * DT));
  s.x = Math.max(-lim, Math.min(lim, s.x));

  if (s.phase === 'fight') { kampf(sim); return; }

  const z0 = s.z;
  s.z += SPEED * DT;
  // Münzen
  while (s.ci < p.coins.length && p.coins[s.ci].z <= s.z) {
    const c = p.coins[s.ci++];
    if (Math.abs(c.x - s.x) <= crowdHalfWidth(s.n) + 0.45) { s.coins++; s.log.push({ e: 'coin', x: c.x, z: c.z }); }
  }
  if (s.phase === 'run') {
    while (s.ei < p.ev.length && p.ev[s.ei].z <= s.z) {
      const ev = p.ev[s.ei++];
      if (ev.k === 'gate') {
        const g = ev.g;
        const idx = g.panels.findIndex((q) => s.x >= q.x0 && s.x < q.x1);
        const pi = idx >= 0 ? idx : (s.x < g.panels[0].x0 ? 0 : g.panels.length - 1);
        const q = g.panels[pi];
        if (s.x >= q.x0 - 1e-9 && s.x <= q.x1 + 1e-9) {
          const vor = s.n, nach = applyOp(vor, q.op, q.v);
          s.stats.gates++;
          if (nach < vor) s.stats.gateLoss += vor - nach;
          setN(s, nach);
          s.log.push({ e: 'gate', z: g.z, panel: pi, vor, nach, op: q.op, v: q.v });
          if (nach <= 0) { lose(s, 'tor'); return; }
        }
      } else if (ev.k === 'obs') {
        const loss = obstacleLoss(ev.o, s.x, s.n, sek, hw);
        if (loss > 0) {
          s.stats.hazardLoss += loss; s.stats.hits++;
          s.log.push({ e: 'hit', type: ev.o.type, z: ev.o.z, loss, vor: s.n });
          setN(s, s.n - loss);
          if (s.n <= 0) { lose(s, ev.o.type); return; }
        } else s.log.push({ e: 'dodge', type: ev.o.type, z: ev.o.z });
      } else if (ev.k === 'enemy') {
        const e = ev.e;
        const w = crowdHalfWidth(s.n);
        const trifft = e.boss || anteil(s.x, w, e.x0, e.x1) > 0;
        if (!trifft) { s.stats.avoided++; s.log.push({ e: 'avoid', z: e.z }); continue; }
        s.z = e.z;
        s.phase = 'fight';
        s.fight = { ev: e, hp: e.hp, acc: 0, t: 0, n0: s.n, hp0: e.hp };
        s.stats.fights++;
        if (e.boss) s.stats.bossN = s.n;
        s.log.push({ e: 'fight', boss: !!e.boss, z: e.z, hp: e.hp, n: s.n });
        return;
      }
    }
    if (s.phase === 'run' && s.ei >= p.ev.length && !level.boss && s.z >= level.len) beginBonus(sim);
  }
  if (s.phase === 'bonus') {
    while (s.ri < p.rungs.length && p.rungs[s.ri].z <= s.z) {
      const r = p.rungs[s.ri++];
      const lane = r.lanes.find((l) => s.x >= l.x0 && s.x < l.x1) || r.lanes[s.x < r.lanes[0].x0 ? 0 : r.lanes.length - 1];
      const m = lane ? lane.m : 0;
      const coins = Math.ceil((Math.min(s.n, BONUS_CAP) * m) / BONUS_DIV);
      s.mults.push(m); s.bonusCoins += coins;
      s.log.push({ e: 'rung', z: r.z, m, coins });
    }
    if (s.z >= p.ende) { s.phase = 'won'; s.log.push({ e: 'won' }); }
  }
}

function beginBonus(sim) {
  const { s, p } = sim;
  if (p.rungs.length) s.phase = 'bonus';
  else { s.phase = 'won'; s.log.push({ e: 'won' }); }
}

function kampf(sim) {
  const { s } = sim, f = s.fight, e = f.ev;
  f.t += DT;
  f.hp -= s.n * DPS * DT;
  f.acc += e.atk * DT;
  while (f.acc >= 1 && s.n > 0) { f.acc -= 1; s.n--; s.stats.fightLoss++; }
  if (s.n <= 0) { f.hp = Math.max(f.hp, 0.0001); lose(s, e.boss ? 'boss' : 'gegner'); return; }
  if (f.hp <= 0) {
    f.hp = 0;
    s.log.push({ e: 'sieg', boss: !!e.boss, z: e.z, n: s.n, verlust: f.n0 - s.n });
    s.fight = null;
    if (e.boss) { s.z = e.z; s.phase = 'run'; beginBonus(sim); if (s.phase === 'run') { s.phase = 'won'; s.log.push({ e: 'won' }); } }
    else s.phase = 'run';
  }
}

// Gesamtergebnis eines gewonnenen Laufs
export function result(sim) {
  const { s, level, p } = sim;
  const gesamt = p.coins.length;
  const unversehrt = s.stats.hazardLoss === 0 && s.stats.gateLoss === 0;
  const alle = s.coins >= gesamt;
  return {
    gewonnen: s.phase === 'won', n: s.n, coins: s.coins, coinsGesamt: gesamt, alleMuenzen: alle, bonusCoins: s.bonusCoins, mults: s.mults,
    unversehrt, maxN: s.stats.maxN, bossN: s.stats.bossN, hazardLoss: s.stats.hazardLoss, gateLoss: s.stats.gateLoss, fightLoss: s.stats.fightLoss,
    sek: s.t * DT,
    punkte: s.coins * 10 + s.n * 5 + s.bonusCoins * 2,
    sterne: stars(level, s)
  };
}
export function stars(level, s) {
  if (s.phase !== 'won') return 0;
  let st = 1;
  if (s.coins >= prepare(level).coins.length) st++;
  if (level.par && s.n >= level.par) st++;
  return st;
}

// Eingabe-Aufzeichnung: Liste [tick, tx*10 gerundet] → kompakter String (für Lösungen/Tests)
export function encodeInputs(list) { return list.map(([t, x]) => t.toString(36) + (x < 0 ? 'n' : 'p') + Math.round(Math.abs(x) * 10).toString(36)).join('.'); }
export function decodeInputs(str) {
  if (!str) return [];
  return str.split('.').map((q) => { const m = /^([0-9a-z]+)([np])([0-9a-z]+)$/.exec(q); if (!m) throw new Error('Eingabe ' + q); return [parseInt(m[1], 36), (m[2] === 'n' ? -1 : 1) * parseInt(m[3], 36) / 10]; });
}

// Wiedergabe einer Eingabeliste bis zum Ende (oder maxTicks). Gibt die Simulation zurück.
export function replay(level, inputs, maxTicks = 60 * 240) {
  const sim = createSim(level);
  let i = 0, tx = 0;
  while (sim.s.phase !== 'won' && sim.s.phase !== 'lost' && sim.s.t < maxTicks) {
    while (i < inputs.length && inputs[i][0] <= sim.s.t) tx = inputs[i++][1];
    step(sim, tx);
  }
  return sim;
}
