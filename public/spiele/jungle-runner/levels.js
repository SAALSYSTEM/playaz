// JUNGLE RUNNER: Level als reine Daten. 5 Welten × 6 Level (siehe docs/JUNGLE_RUNNER.md).
// Jedes Level wird aus einem „Rezept“ gebaut: eine feste Folge von Bausteinen (Stamm, Überhang, Fels, Nashorn, Brücke …).
// Die Bausteine halten selbst Abstände und Fluchtwege ein (Baukasten unten); tools/jungle-pruefer.mjs beweist je Level
// per Suche auf der echten Simulation, dass es eine schadensfreie Route gibt, und prüft die Reaktionszeiten.
// Nichts hier ist zufällig zur Laufzeit: der Zufall ist ein fester Seed je Level.

import { OB, laneX, speedAt } from './sim.js';

export const WORLDS = [
  { id: 'sonne', name: 'Sonniger Dschungel', sub: 'Level 1–6', sky: [0x6fd0ff, 0xeaf9ff], fog: 0xd2efe6, ground: 0x62c84a, ground2: 0x4fb53e, tile: [0xdcc590, 0xcdb27a], curb: 0x8c7a55, water: 0x2bbfd6,
    leaves: [0x2fbf4a, 0x49d35f, 0x1f9a3a, 0x7fd957], trunk: 0x8a5a2f, flowers: [0xff6b81, 0xffd23f, 0xffffff, 0xff9ad5], deco: 'dschungel', mount: 0x6fb98a },
  { id: 'fluss', name: 'Flüsse und Hängebrücken', sub: 'Level 7–12', sky: [0x62d9f0, 0xe8fcff], fog: 0xc9f1ee, ground: 0x4fbf7f, ground2: 0x3ea36a, tile: [0xb98250, 0xa97444], curb: 0x6b4a2a, water: 0x1fb6d4,
    leaves: [0x1fae8c, 0x2fcf9a, 0x178a6e, 0x66dba8], trunk: 0x7a4f2a, flowers: [0xffffff, 0xff8fb3, 0xffe066], deco: 'fluss', mount: 0x5fb3a3 },
  { id: 'tal', name: 'Wildtier-Tal', sub: 'Level 13–18', sky: [0xffcf7e, 0xfff3d4], fog: 0xf7e2b0, ground: 0xc9c050, ground2: 0xb8ae3f, tile: [0xdcb67e, 0xc9a066], curb: 0x8f6a3c, water: 0x3cc1c9,
    leaves: [0x86b03a, 0xa4c944, 0x6f9a2e, 0xd9a441], trunk: 0x8c5d33, flowers: [0xff8a3d, 0xffd23f, 0xff5d73], deco: 'tal', mount: 0xd9a86a },
  { id: 'tempel', name: 'Verlorener Tempel', sub: 'Level 19–24', sky: [0x74b6c8, 0xd6f0ee], fog: 0xb4d9d3, ground: 0x3f9570, ground2: 0x347f61, tile: [0xbcc3b2, 0xa5ad9b], curb: 0x6f776a, water: 0x2aa9b8,
    leaves: [0x2a8f5c, 0x3fae73, 0x1f7a4d, 0x6bd49a], trunk: 0x6f4a2a, flowers: [0xffd23f, 0x5ee0ff, 0xffffff], deco: 'tempel', mount: 0x6f9d93 },
  { id: 'gipfel', name: 'Großer Dschungel', sub: 'Level 25–30', sky: [0x8ec9ff, 0xf3f8ff], fog: 0xd0e1ee, ground: 0x4f9f5f, ground2: 0x438c52, tile: [0xc7ccd1, 0xb3b9c0], curb: 0x7c838c, water: 0x2eb4dc,
    leaves: [0x2e9d57, 0x45bd6d, 0x1f7f45, 0x8bdc7e], trunk: 0x6a4a2c, flowers: [0xffffff, 0xff9ad5, 0xffd23f], deco: 'gipfel', mount: 0x8fb0c4 }
];

// ---------------------------------------------------------------- Zufall (fester Seed)
export function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ---------------------------------------------------------------- Baukasten
const RHINO_V = 10.5, BOULDER_V = 13, ELE_V = 2.2, ELE_LEAD = 72;
const ARC = (n, i, base, peak) => base + (peak - base) * Math.sin((Math.PI * i) / (n - 1));

class Bau {
  constructor(v, seed, z0 = 0, opts = {}) {
    this.v = v; this.r = rng(seed); this.z = z0; this.lane = 1; this.lastZ = z0;
    this.ground = [[], [], []]; this.obs = []; this.dyn = []; this.coins = []; this.pups = []; this.cps = []; this.fx = []; this.tut = [];
    this.teach = new Set(opts.teach || []); this.seen = new Set(opts.seen || []);
    this.tj = opts.tj ?? 11;                       // wie viele Meter vor dem ersten Stamm/Überhang die Hilfe beginnt
    this.rhinoV = opts.rhinoV || RHINO_V;
    this.gate = { per: opts.gatePer || 4.2, open: opts.gateOpen || 0.62 };
    this.warn = opts.warn || 2.4;
  }
  m(sec) { return sec * this.v; }
  g(sec) { this.z += sec * this.v; return this; }
  pick(a) { return a[Math.floor(this.r() * a.length)]; }
  coin(lane, z, y = 0.8) { this.coins.push({ lane, z: +z.toFixed(2), y: +y.toFixed(2) }); }
  line(lane, n, step = 1.7, dz = 0, y = 0.8) { for (let i = 0; i < n; i++) this.coin(lane, this.z + dz + i * step, y); }
  arc(lane, n = 5, step = 1.6, base = 0.8, peak = 1.9) { const dz = -((n - 1) * step) / 2; for (let i = 0; i < n; i++) this.coin(lane, this.z + dz + i * step, ARC(n, i, base, peak)); }
  ob(k, lane, z = this.z, ex = {}) { this.obs.push({ k, lane, z: +z.toFixed(2), len: (OB[k] || {}).len || 1, ...ex }); }
  water(lane, z0, z1) { this.ground[lane].push({ z0: +z0.toFixed(2), z1: +z1.toFixed(2), t: 'water' }); }
  note(kind, zShow, need, hold) {                       // Hilfe beim ersten Auftreten (nur wenn das Level sie lehren soll)
    if (this.seen.has(kind)) return; this.seen.add(kind);
    if (!this.teach.has(kind)) return;
    this.tut.push({ id: kind, kind, need: need || null, z: +Math.max(2, zShow).toFixed(1), hold: hold === undefined ? undefined : +hold.toFixed(1) });
  }
  // zwei Nachbarspuren oder eine Spur frei lassen: gibt freie Spur zurück, die von b.lane aus erreichbar ist
  freeFrom(blocked) {
    const free = [0, 1, 2].filter((l) => !blocked.includes(l));
    free.sort((a, b) => Math.abs(a - this.lane) - Math.abs(b - this.lane) || Math.abs(a - 1) - Math.abs(b - 1));
    return free[0];
  }
  cp() { this.cps.push(+this.z.toFixed(1)); }
}

// ---------------------------------------------------------------- Bausteine: Funktion(b, arg) → Dauer in Sekunden, die der Baustein belegt
const lanesWith = (b, must, extra) => {   // Spurmenge, die „must“ enthält und optional noch eine Nachbarspur
  const s = [must]; if (extra) { const n = [0, 1, 2].filter((l) => Math.abs(l - must) === 1); s.push(b.pick(n)); }
  return s;
};
const MOT = {
  // ---- ruhige Münzstücke
  '_'(b) { b.line(b.lane, 5, 1.8); return (5 * 1.8) / b.v; },
  c(b) { b.line(b.lane, 8, 1.7); return (8 * 1.7) / b.v; },
  z(b) {                                                  // Zickzack: lehrt den Spurwechsel
    let L = b.lane, z = 0; const coin = (l) => { b.coin(l, b.z + z); z += 1.7; };
    for (let seg = 0; seg < 3; seg++) {
      for (let i = 0; i < 3; i++) coin(L);
      const opts = [L - 1, L + 1].filter((l) => l >= 0 && l <= 2);
      L = b.pick(opts);
    }
    for (let i = 0; i < 2; i++) coin(L);
    b.lane = L; return z / b.v;
  },
  // ---- Bodenhindernisse
  x(b) { const bl = lanesWith(b, b.lane, b.r() < 0.5); const fr = [0, 1, 2].filter((l) => !bl.includes(l)); for (const l of bl) b.ob('root', l); b.arc(b.lane, 5, 1.5, 0.8, 1.6); if (fr.length) b.line(fr[0], 4, 1.7, -3); return 3.4 / b.v; },
  j(b) { const bl = lanesWith(b, b.lane, true); for (const l of bl) b.ob('log', l); b.note('jump', b.z - b.tj, 'jump', b.z - 3.6); b.arc(b.lane, 5, 1.7, 0.8, 2.0); const fr = [0, 1, 2].filter((l) => !bl.includes(l)); if (fr.length) b.line(fr[0], 5, 1.7, -4); return 4.2 / b.v; },
  J(b) { for (const l of [0, 1, 2]) b.ob('log', l); b.note('jump', b.z - b.tj, 'jump', b.z - 3.6); b.arc(b.lane, 5, 1.7, 0.8, 2.0); return 4.2 / b.v; },
  h(b) { const bl = lanesWith(b, b.lane, true); for (const l of bl) b.ob('hang', l); b.note('slide', b.z - b.tj, 'slide', b.z - 3.2); b.line(b.lane, 5, 1.3, -2.6, 0.45); const fr = [0, 1, 2].filter((l) => !bl.includes(l)); if (fr.length) b.line(fr[0], 5, 1.7, -4); return 4.0 / b.v; },
  H(b) { for (const l of [0, 1, 2]) b.ob('hang', l); b.note('slide', b.z - b.tj, 'slide', b.z - 3.2); b.line(b.lane, 5, 1.3, -2.6, 0.45); return 4.0 / b.v; },
  R(b) {                                                  // Fels: Spur wechseln
    const side = b.lane === 0 ? [1] : b.lane === 2 ? [-1] : [b.pick([-1, 1])];
    const bl = [b.lane]; if (b.r() < 0.45) { const n = b.lane + (b.lane === 1 ? b.pick([-1, 1]) : (b.lane === 0 ? 1 : -1)); if (n >= 0 && n <= 2) bl.push(n); }
    void side;
    for (const l of bl) b.ob('rock', l);
    b.note('rock', b.z - 26);
    const fr = b.freeFrom(bl); b.line(fr, 7, 1.7, -4.5); b.lane = fr; return 4.0 / b.v;
  },
  M(b) {                                                  // gemischt: Stamm / Überhang / Fels nebeneinander
    const t = ['log', 'hang', 'rock']; for (let i = 2; i > 0; i--) { const k = Math.floor(b.r() * (i + 1)); [t[i], t[k]] = [t[k], t[i]]; }
    if (t[b.lane] === 'rock') { const o = [0, 1, 2].filter((l) => l !== b.lane && t[l] !== 'rock')[0]; [t[b.lane], t[o]] = [t[o], t[b.lane]]; }
    t.forEach((k, l) => b.ob(k, l));
    if (t.includes('log')) b.note('jump', b.z - b.tj, 'jump', b.z - 3.6);
    b.arc(t.indexOf('log'), 5, 1.7, 0.8, 2.0); b.line(t.indexOf('hang'), 5, 1.3, -2.6, 0.45);
    return 4.4 / b.v;
  },
  m(b) { b.ob('mud', b.lane, b.z + 3, { len: 9 }); if (b.r() < 0.6) b.ob('mud', b.pick([0, 1, 2].filter((l) => l !== b.lane)), b.z + 3, { len: 9 }); b.note('mud', b.z - 20); return 8 / (b.v * 0.7); },
  // ---- Tiere
  T(b, a) {                                               // Nashorn rennt entgegen; a = Vorwarnzeit in s
    const T = a || b.warn, v = b.v, zm = b.z + v * T;
    const lane = b.r() < 0.75 ? b.lane : b.pick([0, 1, 2]);
    b.dyn.push({ k: 'rhino', lane, z: +(zm + b.rhinoV * T).toFixed(2), trig: +b.z.toFixed(2), v: b.rhinoV });
    b.note('rhino', b.z - 30);
    const fr = b.freeFrom([lane]); const keep = lane === b.lane ? fr : b.lane;
    b.line(keep, 6, 1.7, v * T - 5); b.lane = keep; return T + 0.5;
  },
  E(b) { return ele(b, 2); },
  e(b) { return ele(b, 1); },
  K(b) {                                                  // Affe schwingt quer über die Strecke
    const ph = b.r() * 6.28; b.dyn.push({ k: 'monkey', z: +(b.z + 8).toFixed(2), amp: 1.9, per: 2.7, ph: +ph.toFixed(2) });
    b.note('monkey', b.z - 28); b.line(b.lane, 4, 1.4, 4, 0.45); return 9 / b.v + 0.4;
  },
  C(b) { return coco(b, 1); },
  CC(b) { return coco(b, 2); },
  G(b) {                                                  // Tempeltore, die sich abwechselnd öffnen
    const { per, open } = b.gate, o = b.r() * per, z = b.z + 9;
    [0, 1, 2].forEach((l, i) => b.dyn.push({ k: 'gate', lane: l, z: +z.toFixed(2), per, open, ph: +(o + (per * i) / 3).toFixed(2) }));
    b.note('gate', b.z - 24); b.line(b.lane, 4, 1.4, -2, 0.8); return 10 / b.v + 0.5;
  },
  F(b, a) {                                               // rollender Fels
    const T = a || 2.6, v = b.v, zm = b.z + v * T;
    b.dyn.push({ k: 'boulder', lane: b.lane, z: +(zm + BOULDER_V * T).toFixed(2), trig: +b.z.toFixed(2), v: BOULDER_V });
    b.note('boulder', b.z - 30);
    const fr = b.freeFrom([b.lane]); b.line(fr, 6, 1.7, v * T - 5); b.lane = fr; return T + 0.6;
  },
  D(b) {                                                  // Doppelte Gefahr: Nashorn in einer Spur, danach Stämme in den anderen
    const T = b.warn, v = b.v, zm = b.z + v * T, lane = b.lane;
    b.dyn.push({ k: 'rhino', lane, z: +(zm + b.rhinoV * T).toFixed(2), trig: +b.z.toFixed(2), v: b.rhinoV });
    const others = [0, 1, 2].filter((l) => l !== lane);
    for (const l of others) b.ob('log', l, zm + 1.1 * v);
    const fr = b.freeFrom([lane]); b.arc(fr, 5, 1.7, 0.8, 2.0); b.lane = fr;
    b.line(fr, 4, 1.7, v * T - 6);
    return T + 1.1 + 0.5;
  },
  // ---- Wasser, Brücken, Stämme
  g(b) {                                                  // Lücke in 1–2 Spuren (springen oder ausweichen)
    const len = Math.min(4.2, b.v * 0.34), bl = lanesWith(b, b.lane, b.r() < 0.5), z0 = b.z + 2;
    for (const l of bl) b.water(l, z0, z0 + len);
    b.note('water', b.z - 24);
    b.arc(b.lane, 5, 1.7, 0.8, 2.0); const fr = [0, 1, 2].filter((l) => !bl.includes(l)); if (fr.length) b.line(fr[0], 5, 1.7, -3);
    return (len + 5) / b.v;
  },
  Gr(b) {                                                 // Fluss quer über die ganze Strecke: springen
    const len = Math.min(4.6, b.v * 0.36), z0 = b.z + 2.5;
    for (const l of [0, 1, 2]) b.water(l, z0, z0 + len);
    b.note('water', b.z - 24); b.arc(b.lane, 5, 1.7, 0.8, 2.1); return (len + 5.5) / b.v;
  },
  Gb(b, a) {                                              // Brücke: außen fehlt der Boden (Seitenabgrund). a = '0' | '2' | '02'
    const code = a || '0', lens = 24, z0 = b.z + 3;
    const miss = []; if (code.includes('0')) miss.push(0); if (code.includes('2')) miss.push(2);
    for (const l of miss) b.water(l, z0, z0 + lens);
    b.note('water', b.z - 24);
    // Spur so wählen, dass sie ein Boden hat
    if (miss.includes(b.lane)) { b.lane = miss.includes(1) ? 1 : (miss.includes(0) && !miss.includes(2) ? 1 : miss.includes(2) && !miss.includes(0) ? 1 : 1); }
    b.line(b.lane, 12, 2, 1); return (lens + 6) / b.v;
  },
  W(b, a) {                                               // begehbarer Stamm mit Rampe; a = Länge in m, 'f' = Ufer fehlt (nur Stamm)
    const len = Math.max(18, +a || 26), ramp = 3.4, z0 = b.z + 4, z1 = z0 + len, L = b.lane;
    b.ground[L].push({ z0, z1, t: 'log', h: 1.0, ramp });
    b.water(L, z0 + ramp, z1 - ramp);
    b.note('walklog', b.z - 26);
    b.line(L, Math.floor((len - 2 * ramp) / 1.8), 1.8, 4 + ramp, 1.8);
    return (len + 6) / b.v;
  },
  W2(b) {                                                 // zwei Stämme hintereinander in Nachbarspuren (Höhenwechsel auf dem Stamm)
    const L = b.lane, L2 = L === 1 ? b.pick([0, 2]) : 1, ramp = 3.4, z0 = b.z + 4, len1 = 24, len2 = 24, z1 = z0 + len1, z2 = z1 - 10, z3 = z2 + len2;
    b.ground[L].push({ z0, z1, t: 'log', h: 1.0, ramp }); b.water(L, z0 + ramp, z1 - ramp);
    b.ground[L2].push({ z0: z2, z1: z3, t: 'log', h: 1.0, ramp }); b.water(L2, z2 + ramp, z3 - ramp);
    b.note('walklog', b.z - 26);
    b.line(L, 5, 1.8, 4 + ramp, 1.8); b.line(L2, 6, 1.8, len1 - 8 + 4, 1.8);
    b.lane = L2; return (z3 - b.z + 4) / b.v;
  },
  // ---- Umgebung, Fortschritt, Hilfen
  X(b) { b.g(0.8); b.cp(); b.line(b.lane, 6, 1.8); return (6 * 1.8) / b.v + 0.3; },
  P(b, a) { const k = a || 'magnet'; b.pups.push({ k, lane: b.lane, z: +(b.z + 2).toFixed(2), y: 0.9 }); b.arc(b.lane, 5, 1.7, 0.8, 1.2); return 4 / b.v; },
  Q(b) { b.fx.push({ k: 'mist', z0: +(b.z + 4).toFixed(1), z1: +(b.z + 64).toFixed(1) }); b.line(b.lane, 4, 1.8, 6); return 1.0; },
  N(b) { b.ob('wind', -1, b.z + 20, { len: 40 }); b.fx.push({ k: 'wind', z0: +(b.z).toFixed(1), z1: +(b.z + 40).toFixed(1) }); b.note('wind', b.z - 20); b.line(b.lane, 6, 2, 6); return 40 / (b.v * 0.78) + 0.3; },
  Y(b) {                                                  // Risikoroute: links viele Münzen über Stämme, rechts sicher mit wenigen
    const risk = b.lane === 2 ? 1 : 0, safe = risk === 0 ? 2 : 0;
    b.lane = 1;
    for (let i = 0; i < 3; i++) { b.ob('log', risk, b.z + 6 + i * 9); const zz = b.z; b.z += 6 + i * 9; b.arc(risk, 5, 1.7, 0.8, 2.0); b.z = zz; }
    b.line(safe, 4, 2.2, 4); b.line(1, 3, 1.8, 0);
    return 36 / b.v;
  }
};
function ele(b, nl) {
  const v = b.v, lanes = nl === 2 ? (b.lane === 2 ? [1, 2] : b.lane === 0 ? [0, 1] : b.pick([[0, 1], [1, 2]])) : [b.lane];
  const shift = (ELE_V * ELE_LEAD) / (v - ELE_V), zm = b.z + 8;
  b.dyn.push({ k: 'elephant', lanes, z: +(zm - shift).toFixed(2), trig: +(zm - shift - ELE_LEAD).toFixed(2), v: ELE_V });
  b.note('elephant', zm - shift - ELE_LEAD * 0.7);
  const fr = b.freeFrom(lanes); b.line(fr, 7, 1.8, 2); b.lane = fr; return 9 / v + 0.4;
}
function coco(b, n) {
  const v = b.v, z = b.z + 7;
  let lanes;
  if (n === 1) lanes = [b.lane]; else { const f = b.freeFrom([]); lanes = [0, 1, 2].filter((l) => l !== (b.lane === 1 ? b.pick([0, 2]) : 1)); void f; }
  lanes.forEach((l, i) => b.dyn.push({ k: 'coco', lane: l, z: +(z + i * 0.9 * v).toFixed(2) }));
  b.note('coco', z - 24);
  const fr = b.freeFrom(lanes); b.line(fr, 6, 1.8, 1); b.lane = fr; return (7 + (n - 1) * 0.9 * v) / v + 0.6;
}

// ---------------------------------------------------------------- Rezept lesen und Strecke bauen
// Zeichen: siehe MOT. „n*( … )“ wiederholt eine Gruppe; „+“ = längere Pause; „-“ = nächster Abstand kurz.
function expand(recipe) {
  return recipe.replace(/(\d+)\*\(([^)]*)\)/g, (m, n, inner) => Array.from({ length: +n }, () => inner).join(' ')).split(/\s+/).filter(Boolean);
}
function buildTrack(b, recipe, gap, minGap) {
  let short = false;
  for (const tok of expand(recipe)) {
    if (tok === '+') { b.g(1.6); continue; }
    if (tok === '-') { short = true; continue; }
    const [name, arg] = tok.split(':');
    const f = MOT[name]; if (!f) throw new Error('Baustein ' + tok);
    const dur = f(b, name === 'T' || name === 'F' ? +arg || undefined : arg);
    b.g(dur + (short ? Math.max(minGap, gap * 0.55) : gap)); short = false;
  }
}

const L = [];
const GOALS = {};
// o: { v Tempo m/s, gap Pause zwischen Bausteinen (s), teach Hilfen, warn Vorwarnzeit der Tiere, rhinoV, gatePer/gateOpen, stars Mindestmünzen-Anteil, tip }
function level(id, name, focus, o, recipe) {
  const world = Math.floor((id - 1) / 6), v = o.v;
  const b = new Bau(v, 9173 * id + 31, 0, { teach: o.teach, warn: o.warn, rhinoV: o.rhinoV, gatePer: o.gatePer, gateOpen: o.gateOpen });
  b.z = 3.0 * v;
  b.line(1, 6, 1.8, -b.z + 8);
  if (o.teach && o.teach.includes('lane')) b.tut.push({ id: 'lane', kind: 'lane', need: 'lane', z: 14, hold: undefined });
  b.seen.add('lane');
  buildTrack(b, recipe, o.gap ?? 1.4, 0.7);
  b.g(1.0); b.line(b.lane, 6, 1.8, 0);
  const len = +(b.z + 2.5 * v).toFixed(1);
  const total = b.coins.length;
  const lv = {
    id, name, focus, world, v, speed: v, len, time: Math.round(len / v), tip: o.tip || '',
    ground: b.ground, obs: b.obs, dyn: b.dyn, coins: b.coins, pups: b.pups, cps: b.cps, fx: b.fx, tut: b.tut,
    starCoins: Math.max(5, Math.round((total * (o.stars || 0.6)) / 5) * 5), starHearts: 2,
    gap: o.gap ?? 1.4
  };
  L.push(lv);
}

// ================================================================ Welt 1 – Sonniger Dschungel
level(1, 'Die erste Spur', 'Links/rechts wechseln, erste Münzlinie, Ziel', { v: 8, gap: 2.4, teach: ['lane'], tip: 'Wische nach links oder rechts, um die Spur zu wechseln.' },
  'c z R _ z c R z c x z R c _ z R c R z c');
level(2, 'Springender Entdecker', 'Kleiner Bodenstamm, gezielter Sprung', { v: 8.5, gap: 2.2, teach: ['jump'], tip: 'Wische nach oben, kurz bevor du den Stamm erreichst.' },
  'c z J _ c j z c J _ x j z J c R j _ J z j c J x c j');
level(3, 'Unter dem Ast', 'Überhangstamm, kontrolliertes Rutschen', { v: 9, gap: 2.1, teach: ['slide'], tip: 'Wische nach unten, um unter dem Ast durchzurutschen.' },
  'c z H _ c H z h c J H z j c _ h J z H c R h x j z H c J h _ c');
level(4, 'Drei Wege', 'Münzlinien in allen Spuren, Bodenstamm und Überhangstamm', { v: 9.5, gap: 2.0, tip: 'Springen, rutschen oder Spur wechseln: such dir den Weg mit den meisten Münzen.' },
  'z c j h z c M R z c h j c M z J H c R z M c j h _ H R c M z j R h c');
level(5, 'Nashornspur', 'Nashorn rennt entgegen: seitlich ausweichen', { v: 10, gap: 1.9, teach: ['rhino'], warn: 2.6, tip: 'Das Nashorn rennt in seiner Spur auf dich zu. Wechsle rechtzeitig die Spur.' },
  'c z R _ T:2.7 c z j T:2.6 z h c T:2.5 R z T:2.4 J c T:2.4 h z T:2.3 c j T');
level(6, 'Dschungelprüfung', 'Alle Mechaniken zusammen, erstes Sterne-Ziel', { v: 10.5, gap: 1.8, warn: 2.3, stars: 0.7, tip: 'Kombiniere Springen, Rutschen und Ausweichen. Wer alle Münzen holt, bekommt Sterne.' },
  'z c M T:2.4 j h R z c T:2.3 J H M c _ T:2.2 R z h j M c T:2.2 H J R z c M T:2.1 j h R c T:2.1 M z H J c');

// ================================================================ Welt 2 – Flüsse und Hängebrücken
level(7, 'Die Holzbrücke', 'Erste breite Brücke über Wasser, kleiner Seitenabgrund', { v: 10, gap: 1.8, teach: ['water'], tip: 'Neben der Brücke ist Wasser. Bleib auf den Brettern und spring über Lücken.' },
  'c z Gb:0 c z J Gb:2 c j Gr c z h Gb:0 c R z Gr j h Gb:2 c z J Gr c M');
level(8, 'Stamm-Pfad', 'Begehbarer erhöhter Baumstamm mit Rampe', { v: 10.5, gap: 1.8, teach: ['walklog'], tip: 'Lauf über die Rampe auf den dicken Stamm. Oben gibt es Extra-Münzen.' },
  'c W:30 c z j h W:34 c R z J W Gb:2 c M z W:30 j c h W:32 R c z W:36');
level(9, 'Zwei Ufer', 'Brückenlücke mit Sprung, Checkpoint vor der schwierigen Passage', { v: 11, gap: 1.7, tip: 'Nach einem Absturz startest du am letzten Checkpoint, kostet aber ein Herz.' },
  'c z Gr X c J Gr z h c Gr j Gb:0 c X z Gr R J Gr c z M Gr X h c g z j Gr h Gb:02 c Gr');
level(10, 'Affenalarm', 'Schwingender Affe: rutschen oder ausweichen', { v: 11.5, gap: 1.7, teach: ['monkey'], tip: 'Der Affe schwingt hin und her. Rutsch unter ihm durch oder lauf in die freie Spur.' },
  'c z K c j K h c z K R K J c X K z H K j c M K h c K z K c');
level(11, 'Wasserfallweg', 'Sprühnebel, wechselnde Münzlinien', { v: 11.5, gap: 1.7, tip: 'Der Sprühnebel nimmt dir nicht die Sicht auf die Hindernisse: es gibt immer ein Warnzeichen.' },
  'Q c z j Q z c W Q h c Gr z Q J c R z Q M c X Q T:2.2 z c Gb:0 Q j h Q c Gr z M Q c');
level(12, 'Brückenmeister', 'Uferwege, Bodenstamm, begehbarer Stamm und zwei Affen', { v: 12, gap: 1.6, stars: 0.65, warn: 2.2, tip: 'Das Finale der Flusswelt: Brücken, Stämme und Affen nacheinander.' },
  'c z Gb:02 W:30 K Gr X J h Gb:0 W K z Gr M R Gr z X W:36 K j h Gr J Gb:2 c K H Gr z W:30 c');

// ================================================================ Welt 3 – Wildtier-Tal
level(13, 'Elefantenpfad', 'Langsamer Elefant blockiert zwei Spuren, dritte Spur bleibt frei', { v: 11.5, gap: 1.8, teach: ['elephant'], tip: 'Elefanten sind langsam, aber riesig. Such die freie Spur.' },
  'c z E c z j E R c h E z c M E c X z E j h E c J E c z E');
level(14, 'Nashorn-Rennen', 'Zwei zeitlich versetzte Nashörner, feste Fluchtroute', { v: 12, gap: 1.7, warn: 2.3, tip: 'Zwei Nashörner kurz hintereinander. Die freie Spur siehst du an den Münzen.' },
  'c z T:2.4 - T:2.3 j c T:2.2 h z T:2.2 R - T:2.1 X M c T:2.1 - T:2.0 z J T:2.0 H c T:2.0 - T:1.9 R z');
level(15, 'Affen-Schaukel', 'Affe und Überhangstamm kombiniert', { v: 12.5, gap: 1.6, tip: 'Rutsch unter Affe und Ast durch, oder wechsle die Spur.' },
  'c z K h c K H z K h j c X K M z K J h c K R z H K c - K h z X K H c');
level(16, 'Familienherde', 'Mehrere langsame Elefanten, nie eine vollständige Sperre', { v: 12.5, gap: 1.6, tip: 'Die Elefantenherde sperrt nie alle Spuren. Bleib ruhig und lies die Lücke.' },
  'c z E e c E z e E c X e E z M c e E R z E e J c E h e c E z e');
level(17, 'Kokosregen', 'Fallende Kokosnüsse mit Bodenmarker', { v: 13, gap: 1.6, teach: ['coco'], tip: 'Der rote Kreis am Boden zeigt, wo die Kokosnuss landet. Weich aus.' },
  'c z C c C j z CC h C c X CC z R C c CC J z C H CC c C z CC h c');
level(18, 'Tierpfad-Profi', 'Nashorn, Affe, Elefant und Super-Sprung im Wechsel', { v: 13.5, gap: 1.5, warn: 2.1, stars: 0.65, tip: 'Der Super-Sprung (Flügelschuh) macht dich kurz zum Höhenflieger.' },
  'z c T:2.2 E K C P:boost J X T:2.0 e K H C R E T:2.0 K M CC z X E T:1.9 K j h C E T:1.9 K R CC z c');

// ================================================================ Welt 4 – Verlorener Tempel
level(19, 'Steintor', 'Bewegliches Tor mit sichtbarer Öffnungsphase', { v: 12.5, gap: 1.8, teach: ['gate'], gateOpen: 0.66, gatePer: 4.4, tip: 'Grün leuchtet das offene Tor. Lauf in die Spur, die offen ist.' },
  'c z G c z j G h c G z R c G X J G z c M G h c G z');
level(20, 'Ruinenstufen', 'Zwei Höhenebenen und Tempelsteine', { v: 13, gap: 1.7, tip: 'Die Steinplattformen sind begehbar. Du kannst von Plattform zu Plattform wechseln.' },
  'c z W:30 c j W2 h c X W:34 R z W2 J c W:30 M h W2 X c W:32 z G W2 c');
level(21, 'Rollender Fels', 'Große Kugel rollt in einer Spur, Vorwarnung', { v: 13.5, gap: 1.7, teach: ['boulder'], tip: 'Der Fels rollt in seiner Spur auf dich zu. Wechsle die Spur.' },
  'c z F:2.7 c j F:2.6 h z F:2.5 X R F:2.4 J c F:2.4 M z F:2.3 H F:2.2 c j F:2.2 z');
level(22, 'Geheimweg', 'Risikoroute mit vielen Münzen oder sichere Route', { v: 14, gap: 1.6, warn: 2.1, stars: 0.7, tip: 'Links gibt es mehr Münzen, aber mit Stämmen. Rechts bist du sicher.' },
  'Y c G R T:2.2 W:30 X G h J Y E T:2.0 G M R c W2 X Y G T:1.9 j h K G c');
level(23, 'Schattenbrücke', 'Abgründe, Tempeltore und bewegte Plattformen mit Checkpoint', { v: 14, gap: 1.6, warn: 2.1, gatePer: 4.0, gateOpen: 0.6, tip: 'Dunkle Abgründe: Springen oder über die Stämme laufen. Es gibt einen Checkpoint.' },
  'Gb:02 G Gr X W K Gb:0 G J Gr R X W2 G H Gr M K Gb:02 X G T:2.0 Gr c');
level(24, 'Tempelschlüssel', 'Längerer Kombinationslauf mit versteckter Bonusroute', { v: 14.5, gap: 1.5, warn: 2.0, gatePer: 4.0, gateOpen: 0.6, stars: 0.65, tip: 'Ein langer Lauf. Die Bonusroute ist riskant, aber nie Pflicht.' },
  'Y c z G T:2.1 W:30 K X E C J G R Gr M X T:2.0 Y H K G W2 X C Gr h T:1.9 E G Y R K X G j T:1.9 Gr');

// ================================================================ Welt 5 – Großer Dschungel
level(25, 'Sturm am Berg', 'Wind als klar gekennzeichnete Umgebung', { v: 13.5, gap: 1.7, teach: ['wind'], tip: 'In der Windzone bist du langsamer. Die Hindernisse bleiben, wo sie sind.' },
  'c z N c j N h c z N R J N M c X N T:2.2 N H c z N');
level(26, 'Doppelte Gefahr', 'Nashorn und Bodenstamm auf getrennten Spuren', { v: 14, gap: 1.6, warn: 2.0, tip: 'Erst das Nashorn ausweichen, dann gleich über den Stamm springen.' },
  'c z D c X J D R z D M D h z D X H D c z D j');
level(27, 'Gipfelbrücke', 'Mehrere begehbare Baumstämme, Höhenwechsel', { v: 14.5, gap: 1.6, warn: 2.0, tip: 'Zwischen den Stämmen kannst du die Spur wechseln, solange du oben bleibst.' },
  'c z W2 W:32 Gr W2 X h W2 J Gr W K W2 X M W:36 z W2 R Gr W2 T:2.0 W2 c');
level(28, 'Dschungelchaos', 'Tiere, Münzen und Tempeltore in kurzen Sequenzen', { v: 15, gap: 1.4, warn: 1.9, gatePer: 3.8, gateOpen: 0.58, stars: 0.65, tip: 'Kurze Abschnitte, dazwischen kleine Verschnaufpausen. Bleib ruhig.' },
  'z G K T:2.0 + C E J X H CC T:1.9 R F:2.1 + G K M e C J T:1.9 X H G K z + E Gr T:1.8 F:2.0 R CC G + M K');
level(29, 'Der letzte Pfad', 'Alle Grundmechaniken in gut gegliederten Abschnitten', { v: 15, gap: 1.4, warn: 1.9, gatePer: 3.8, gateOpen: 0.58, stars: 0.65, tip: 'Alles, was du gelernt hast, nacheinander. Schwer, aber nie unmöglich.' },
  '2*(J H j h c) + X M R T:2.0 E z + G K C Gr P:shield X W:30 T:1.9 D + F:2.0 CC G M X Gb:02 W2 K + E T:1.9 R Y H J G c X T:1.8 F:1.9 K');
level(30, 'Goldener Tempel', 'Großes Finale durch alle Mechaniken, goldene Zielpforte', { v: 15.5, gap: 1.35, warn: 1.9, gatePer: 3.8, gateOpen: 0.58, stars: 0.65, tip: 'Das große Finale. Alle Gefahren, ein goldenes Ziel.' },
  'z c J H j h M R + T:2.0 E K C X Gb:0 G W:30 F:2.1 + D CC M Gr X Y N T:1.9 E G K + 2*(J R H) W2 X Gr T:1.8 G CC F:2.0 + K E W:34 G Gr X M D C T:1.8 Y R + K G T:1.8 X Gr c');

export const LEVELS = L;
export const LEVEL_BY_ID = Object.fromEntries(L.map((l) => [l.id, l]));
export const worldOf = (l) => WORLDS[l.world];
void GOALS;

// ================================================================ Endlosmodus (fest reproduzierbar per Seed)
// Strecke wächst in Stücken von ca. 140 m aus geprüften Bausteinen. Tempo steigt mit der Strecke, bis vmax.
const POOLS = [
  { z: 0, t: ['c', 'z', 'j', 'h', 'R', 'J', 'H', 'x'] },
  { z: 250, t: ['j', 'h', 'R', 'M', 'J', 'H', 'x', 'T:2.6', 'z', 'm'] },
  { z: 600, t: ['M', 'T:2.4', 'E', 'e', 'K', 'C', 'j', 'h', 'R', 'g', 'z', 'W:28'] },
  { z: 1100, t: ['M', 'T:2.2', 'E', 'K', 'C', 'CC', 'G', 'g', 'Gr', 'W2', 'R', 'D', 'F:2.5', 'N', 'Gb:02'] },
  { z: 1800, t: ['M', 'T:2.0', 'E', 'K', 'CC', 'G', 'Gr', 'W2', 'D', 'F:2.2', 'Y', 'R', 'h', 'j'] }
];
export function endlessLevel(seed = 1) {
  const lv = {
    id: 0, name: 'Endlosmodus', focus: 'Immer weiter', world: 0, v: 9.5, speed: 9.5, vmax: 17, accel: 0.0036, len: 1e9, time: 0, endless: true, seed,
    ground: [[], [], []], obs: [], dyn: [], coins: [], pups: [], cps: [], fx: [], tut: [], starCoins: 1e9, starHearts: 2, gap: 1.5,
    genZ: 3.0 * 9.5, chunk: 0, lane: 1, tip: '', extend: extendEndless
  };
  // Starthilfe: Münzen auf der ersten Strecke
  for (let i = 0; i < 6; i++) lv.coins.push({ lane: 1, z: +(8 + i * 1.8).toFixed(2), y: 0.8 });
  return lv;
}
function extendEndless(lv) {
  const z0 = lv.genZ, v = speedAt(lv, z0 + 60), idx = lv.chunk++;
  const pool = [...POOLS].reverse().find((p) => z0 >= p.z).t;
  const b = new Bau(v, (lv.seed * 7919 + idx * 104729) >>> 0, z0, { warn: Math.max(1.8, 2.7 - z0 / 2600), rhinoV: 10.5, gatePer: 4.0, gateOpen: 0.6 });
  b.lane = lv.lane;
  b.seen = new Set(['lane', 'jump', 'slide', 'rock', 'rhino', 'water', 'walklog', 'monkey', 'elephant', 'coco', 'gate', 'boulder', 'wind', 'mud']);
  const gap = Math.max(1.05, 1.7 - z0 / 3200);
  while (b.z < z0 + 140) {
    const tok = b.pick(pool), [name, arg] = tok.split(':');
    const dur = MOT[name](b, name === 'T' || name === 'F' ? +arg : arg);
    b.g(dur + gap);
  }
  if (idx % 3 === 2) { MOT.X(b); b.g(0.6); }
  if (idx % 5 === 4) { MOT.P(b, b.pick(['magnet', 'shield', 'boost', 'x2'])); b.g(0.5); }
  for (let l = 0; l < 3; l++) lv.ground[l].push(...b.ground[l]);
  lv.obs.push(...b.obs.sort((a, c) => a.z - c.z)); lv.dyn.push(...b.dyn); lv.pups.push(...b.pups); lv.cps.push(...b.cps); lv.fx.push(...b.fx);
  lv.coins.push(...b.coins.sort((a, c) => a.z - c.z));
  // Reihenfolge nach z halten (dyn und ground sind nach Anfang sortiert)
  lv.dyn.sort((a, c) => a.z - c.z);
  for (const g of lv.ground) g.sort((a, c) => a.z0 - c.z0);
  lv.genZ = b.z; lv.lane = b.lane;
}
export { Bau, MOT, laneX, buildTrack };
