// JUNGLE RUNNER: Spielregeln ohne Darstellung (läuft im Browser, in Node-Tests und im Streckenprüfer identisch).
// Fester Takt (60 Hz), keine Zufallszahlen im Ablauf: gleiche Eingaben ergeben immer dasselbe Ergebnis,
// auch bei niedriger Bildrate (die Darstellung interpoliert nur).
//
// Koordinaten: x quer (Spur 0/1/2 = links/Mitte/rechts, Abstand LANE_W), z = Meter in Laufrichtung, y = Höhe über dem Boden.
// Eingaben: 'L' 'R' 'U' 'D' (Spur links/rechts, Sprung, Rutschen) über step(sim, cmd) – höchstens ein Befehl je Schritt,
// ein kleiner Puffer (QUEUE_MAX, QUEUE_AGE) verhindert verlorene und doppelte Eingaben.

export const SIM_VERSION = 1;
export const HZ = 60;
export const DT = 1 / HZ;
export const LANE_W = 2.2;
export const laneX = (i) => (i - 1) * LANE_W;

export const GRAV = 24;            // m/s²
export const JUMP_V = 9.2;         // Absprunggeschwindigkeit → Scheitel 1,76 m, Flugzeit 0,77 s
export const BOOST_V = 12.4;       // mit Sprungverstärkung → Scheitel 3,2 m
export const FASTFALL_V = -17;     // „runter“ in der Luft
export const H_STAND = 1.5;        // Höhe der Spielfigur (Trefferfläche)
export const H_SLIDE = 0.55;       // Höhe beim Rutschen
export const SLIDE_T = 0.75;       // Dauer des Rutschens
export const LANE_T = 0.12;        // Dauer eines Spurwechsels (weitere Spurbefehle warten so lange)
export const PW = 0.33;            // halbe Breite der Figur
export const PD = 0.35;            // halbe Tiefe der Figur
export const HALF_OB = 0.95;       // halbe Breite eines Hindernisses (Spur ist 2,2 breit)
export const COYOTE = 0.1;         // Sprung noch kurz nach dem Verlassen des Bodens erlaubt
export const QUEUE_MAX = 2;
export const QUEUE_AGE = 0.2;      // Sekunden, die ein Befehl warten darf
export const INVUL_HIT = 1.8;      // Unverwundbarkeit nach Treffer
export const INVUL_FALL = 2.5;     // … nach Absturz und Respawn
export const STUN_T = 0.5;         // Dauer der Trefferanimation (kein Einfluss auf die Bewegung)
export const FALL_Y = -1.3;        // darunter ist die Figur im Wasser
export const STEP_UP = 0.5;        // höhere Kanten (z. B. Baumstamm von der Seite) blockieren den Spurwechsel
export const COCO_FALL = 0.7;      // Fallzeit der Kokosnuss
export const MAGNET_T = 9, SHIELD_T = 15, BOOST_T = 10, X2_T = 10;
export const FINISH_RUN = 14;      // so viele Meter läuft die Figur nach dem Ziel noch aus

// Höhen der Hindernisse [unten, oben]
export const OB = {
  log:  { y0: 0, y1: 0.85, len: 1.2 },   // Bodenstamm: springen
  hang: { y0: 1.05, y1: 2.6, len: 1.2 }, // Überhangstamm: rutschen
  rock: { y0: 0, y1: 1.6, len: 1.6 },    // Fels: Spur wechseln
  root: { y0: 0, y1: 0.4, len: 1.0 }     // Wurzel: niedrig, springen
};

export const POWER = { magnet: MAGNET_T, shield: SHIELD_T, boost: BOOST_T, x2: X2_T };

// ---------------------------------------------------------------- Strecke vorbereiten
const lowerBound = (arr, z) => { let a = 0, b = arr.length; while (a < b) { const m = (a + b) >> 1; if (arr[m].z < z) a = m + 1; else b = m; } return a; };

export function prepare(level) {
  if (level._p) return level._p;
  const byZ = (a, b) => a.z - b.z;
  if (!level.endless) { level.obs.sort(byZ); level.coins.sort(byZ); level.pups.sort(byZ); level.dyn.sort(byZ); for (const g of level.ground) g.sort((a, b) => a.z0 - b.z0); }
  return (level._p = { gi: [0, 0, 0] });
}

// Endlosmodus: die Strecke wächst mit dem Spieler (feste Bausteine aus levels.js, reproduzierbar per Seed)
function ensure(level, s) {
  if (!level.endless) return;
  while (level.genZ < s.z + 260) level.extend(level);
  if (s.got.length < level.coins.length) { const n = new Uint8Array(Math.max(level.coins.length, s.got.length * 2)); n.set(s.got); s.got = n; }
  if (s.pgot.length < level.pups.length) { const n = new Uint8Array(Math.max(level.pups.length, s.pgot.length * 2)); n.set(s.pgot); s.pgot = n; }
  while (s.dt0.length < level.dyn.length) { s.dt0.push(-1); s.dph.push(0); }
  if (s.ost.length < level.obs.length + 1) { const n = new Uint8Array(Math.max(level.obs.length + 1, s.ost.length * 2)); n.set(s.ost); s.ost = n; }
}

export const speedAt = (level, z) => (level.endless ? Math.min(level.vmax, level.speed + z * level.accel) : level.speed);

export function createSim(level, opts = {}) {
  const p = prepare(level);
  const s = {
    t: 0, z: 0, x: 0, lane: 1, laneT: 0, y: 0, vy: 0, grounded: true, coyote: 0, slideT: 0, hearts: 3, invul: 0, stun: 0,
    phase: 'run', why: null, cause: null, q: [], cp: 0, cpHit: 0,
    coins: 0, points: 0, got: new Uint8Array(level.coins.length), pgot: new Uint8Array(level.pups.length),
    pw: { magnet: 0, shield: 0, boost: 0, x2: 0 },
    dt0: level.dyn.map(() => -1), dph: level.dyn.map(() => 0), ost: new Uint8Array(level.obs.length + 1),
    mudT: 0, tutI: 0, tutNow: null, tutOn: opts.tut || null, nextTut: 0, finishZ: 0,
    stats: { hits: 0, falls: 0, dodge: { rhino: 0, elephant: 0, monkey: 0, coco: 0, boulder: 0, gate: 0 }, logs: 0, slides: 0, jumps: 0, lanes: 0, maxZ: 0, combo: 0 },
    log: []
  };
  const sim = { level, p, s, opts };
  ensure(level, s);
  return sim;
}
export function cloneSim(sim) {
  const s = sim.s;
  const c = { ...s };                                   // tutOn/tutNow sind nur gelesene Verweise: dürfen geteilt werden
  c.q = s.q.map((q) => ({ c: q.c, a: q.a })); c.pw = { ...s.pw }; c.stats = { ...s.stats, dodge: { ...s.stats.dodge } };
  c.got = s.got.slice(); c.pgot = s.pgot.slice(); c.ost = s.ost.slice(); c.dt0 = s.dt0.slice(); c.dph = s.dph.slice(); c.log = [];
  return { level: sim.level, p: sim.p, opts: sim.opts, s: c };
}

// ---------------------------------------------------------------- Boden (Höhe unter der Figur)
// Gibt die Bodenhöhe in der Spur an der Stelle z zurück oder null, wenn dort kein Boden ist (Wasser/Lücke).
export function groundH(level, lane, z) {
  const segs = level.ground[lane];
  let water = false, h = 0;
  for (let i = 0; i < segs.length; i++) {
    const g = segs[i];
    if (g.z0 > z) break;
    if (z > g.z1) continue;
    if (g.t === 'water') water = true;
    else if (g.t === 'log') {   // begehbarer Stamm: Rampe hoch, Plateau, Rampe runter
      const r = g.ramp, up = (z - g.z0) / r, dn = (g.z1 - z) / r;
      h = Math.max(h, g.h * Math.max(0, Math.min(1, up, dn)));
      water = false; // der Stamm trägt auch über Wasser
      return h;
    }
  }
  return water ? null : h;
}

// ---------------------------------------------------------------- dynamische Hindernisse
export function dynPos(d, t0, t) {
  // Position (z) eines laufenden Hindernisses. t0 = Startzeit in Sekunden oder -1 (noch nicht gestartet)
  switch (d.k) {
    case 'rhino': case 'boulder': return t0 < 0 ? d.z : d.z - d.v * (t - t0);
    case 'elephant': return t0 < 0 ? d.z : d.z + d.v * (t - t0);
    default: return d.z;
  }
}
export function monkeyX(d, t) { return laneX(1) + d.amp * Math.sin((2 * Math.PI * t) / d.per + d.ph); }
// Tor: Tür fährt in GATE_MOVE Sekunden herunter bzw. hoch; d.per = Periode, d.open = offener Anteil, d.ph = Zeitversatz
export const GATE_MOVE = 0.45;
// Türhöhe über dem Boden (Unterkante): 2,6 = offen, 0 = zu
export function gateBottom(d, t) {
  const ph = (((t + d.ph) % d.per) + d.per) % d.per, open = d.open * d.per;
  if (ph < GATE_MOVE) return 2.6 * Math.min(1, ph / GATE_MOVE);                    // öffnet
  if (ph < open) return 2.6;                                                       // offen
  if (ph < open + GATE_MOVE) return 2.6 * (1 - (ph - open) / GATE_MOVE);            // schließt
  return 0;                                                                        // zu
}

// ---------------------------------------------------------------- Schritt
function lose(sim, why, cause) { const s = sim.s; s.phase = 'lost'; s.why = why; s.cause = cause || why; s.hearts = 0; s.log.push({ e: 'lost', why, cause: s.cause }); }

function respawn(sim) {
  const { s, level } = sim;
  const z = Math.max(0, s.cp);
  s.z = z; s.lane = 1; s.x = laneX(1); s.vy = 0; s.grounded = true; s.slideT = 0; s.laneT = 0; s.q.length = 0; s.invul = INVUL_FALL; s.stun = 0; s.mudT = 0;
  s.y = groundH(level, 1, z) || 0;
  // Tiere und Kokosnüsse ab dem Checkpoint starten neu (Münzen bleiben eingesammelt)
  for (let i = 0; i < level.dyn.length; i++) if (level.dyn[i].z > z - 3) { s.dt0[i] = -1; s.dph[i] = 0; }
  s.log.push({ e: 'respawn', z });
}

function damage(sim, cause) {
  const s = sim.s;
  if (s.invul > 0 || s.phase !== 'run') return false;
  if (s.pw.shield > 0) { s.pw.shield = 0; s.invul = 1.0; s.log.push({ e: 'shield', cause }); return false; }
  s.hearts--; s.stats.hits++; s.stats.combo = 0; s.invul = INVUL_HIT; s.stun = STUN_T;
  s.log.push({ e: 'hit', cause, z: s.z, lane: s.lane, hearts: s.hearts });
  if (s.hearts <= 0) lose(sim, 'hearts', cause);
  return true;
}

// Befehl aus dem Puffer ausführen, wenn möglich. Gibt true zurück, wenn verbraucht (ausgeführt oder verworfen).
function runCmd(sim, c) {
  const { s, level } = sim;
  if (c === 'L' || c === 'R') {
    if (s.laneT > 0) return false;                      // vorheriger Wechsel läuft noch: warten
    const to = s.lane + (c === 'L' ? -1 : 1);
    if (to < 0 || to > 2) { s.log.push({ e: 'bump', dir: c, why: 'rand' }); return true; }
    const gh = groundH(level, to, s.z + 0.6);
    if (gh !== null && gh > s.y + STEP_UP) { s.log.push({ e: 'bump', dir: c, why: 'stamm' }); return true; }
    s.lane = to; s.laneT = LANE_T; s.stats.lanes++;
    s.log.push({ e: 'lane', dir: c });
    tutDone(sim, 'lane');
    return true;
  }
  if (c === 'U') {
    if (s.grounded || s.coyote > 0) {
      s.vy = s.pw.boost > 0 ? BOOST_V : JUMP_V; s.grounded = false; s.coyote = 0; s.slideT = 0; s.stats.jumps++;
      s.log.push({ e: 'jump', boost: s.pw.boost > 0 });
      tutDone(sim, 'jump');
      return true;
    }
    return false;                                       // in der Luft: kurz puffern
  }
  if (c === 'D') {
    if (!s.grounded) { s.vy = Math.min(s.vy, FASTFALL_V); s.log.push({ e: 'fastfall' }); return true; }
    if (s.slideT > 0) return true;
    s.slideT = SLIDE_T; s.log.push({ e: 'slide' });
    tutDone(sim, 'slide');
    return true;
  }
  return true;
}
function tutDone(sim, kind) {
  const s = sim.s;
  if (s.tutNow && s.tutNow.need === kind) { s.log.push({ e: 'tutdone', kind, id: s.tutNow.id }); s.tutNow = null; }
}

export function step(sim, cmd) {
  const { s, level } = sim;
  if (s.phase === 'lost') return;
  s.t++;
  const sek = s.t * DT;
  ensure(level, s);

  if (s.phase === 'won') {                               // auslaufen
    s.z += level.speed * 0.6 * DT * Math.max(0, 1 - (s.z - s.finishZ) / FINISH_RUN);
    s.x += (laneX(s.lane) - s.x) * Math.min(1, 12 * DT);
    return;
  }

  // ---- Eingaben
  if (cmd) { if (s.q.length < QUEUE_MAX) s.q.push({ c: cmd, a: 0 }); else s.log.push({ e: 'drop', c: cmd }); }
  if (s.q.length) {
    if (runCmd(sim, s.q[0].c)) s.q.shift();
    else { for (const q of s.q) q.a += DT; if (s.q[0].a > QUEUE_AGE) s.q.shift(); }
  }

  // ---- Tutorial
  if (s.tutOn && !s.tutNow && level.tut && s.tutI < level.tut.length && s.z >= level.tut[s.tutI].z) {
    const tt = level.tut[s.tutI++];
    if (s.tutOn[tt.need]) { s.tutNow = tt; s.log.push({ e: 'tut', id: tt.id, need: tt.need }); }
  }

  // ---- Tempo
  let v = speedAt(level, s.z);
  const px = s.x;
  let slow = 1;
  const i0 = lowerBound(level.obs, s.z - 8);
  for (let i = i0; i < level.obs.length && level.obs[i].z < s.z + 8; i++) {
    const o = level.obs[i];
    if (o.k !== 'mud' && o.k !== 'wind') continue;
    if (Math.abs(s.z - o.z) > o.len / 2) continue;
    if (o.k === 'mud' && (s.y > 0.45 || (o.lane >= 0 && Math.abs(px - laneX(o.lane)) > HALF_OB + PW))) continue;
    slow = Math.min(slow, o.k === 'mud' ? 0.6 : 0.78);
  }
  if (slow < 1 && !s.mudT) s.log.push({ e: 'slow' });
  s.mudT = slow < 1 ? 1 : 0;
  v *= slow;
  if (s.tutNow) v *= s.z >= (s.tutNow.hold === undefined ? 1e9 : s.tutNow.hold) ? 0 : 0.3;

  // ---- Bewegung vorwärts und seitlich
  s.z += v * DT;
  if (s.z > s.stats.maxZ) s.stats.maxZ = s.z;
  if (s.laneT > 0) s.laneT = Math.max(0, s.laneT - DT);
  const tx = laneX(s.lane), dx = tx - s.x;
  s.x += Math.max(-LANE_W / LANE_T * DT * 1.15, Math.min(LANE_W / LANE_T * DT * 1.15, dx * 22 * DT));
  if (s.laneT === 0 && Math.abs(tx - s.x) < 0.02) s.x = tx;

  // ---- Senkrecht: Boden, Sprung, Absturz
  const gh = groundH(level, s.lane, s.z);
  const vorher = s.grounded;
  if (s.grounded) {
    if (gh === null || gh < s.y - 0.12) { s.grounded = false; s.coyote = COYOTE; }   // über der Kante: fällt (kurzer Sprung-Spielraum)
    else s.y = gh;                                                                      // folgt Rampen und Plateaus
  }
  if (!s.grounded) {
    s.coyote = Math.max(0, s.coyote - DT);
    s.vy -= GRAV * DT;
    const ny = s.y + s.vy * DT;
    if (gh !== null && s.vy <= 0 && ny <= gh && s.y >= gh - 0.35) {       // gelandet
      s.y = gh; s.vy = 0; s.grounded = true;
      s.log.push({ e: 'land', fall: vorher ? 0 : 1 });
      // gepufferten Sprung sofort auslösen
      if (s.q.length && s.q[0].c === 'U') { /* wird im nächsten Schritt ausgeführt */ }
    } else s.y = ny;
    if (s.y < FALL_Y) {
      s.stats.falls++; s.stats.combo = 0;
      s.hearts--;
      s.log.push({ e: 'splash', z: s.z, lane: s.lane, hearts: s.hearts });
      if (s.hearts <= 0) { lose(sim, 'water', 'water'); return; }
      respawn(sim);
      return;
    }
  }
  if (s.slideT > 0) { s.slideT = Math.max(0, s.slideT - DT); if (!s.grounded) s.slideT = 0; }
  if (s.invul > 0) s.invul = Math.max(0, s.invul - DT);
  if (s.stun > 0) s.stun = Math.max(0, s.stun - DT);
  for (const k of ['magnet', 'shield', 'boost', 'x2']) if (s.pw[k] > 0) { s.pw[k] = Math.max(0, s.pw[k] - DT); if (s.pw[k] === 0) s.log.push({ e: 'pwend', k }); }
  // Checkpoints
  while (s.cpHit < level.cps.length && s.z >= level.cps[s.cpHit]) { s.cp = level.cps[s.cpHit]; s.cpHit++; s.log.push({ e: 'checkpoint', z: s.cp }); }

  // ---- Münzen und Power-ups
  const top = s.y + (s.slideT > 0 ? H_SLIDE : H_STAND);
  const mag = s.pw.magnet > 0, mult = s.pw.x2 > 0 ? 2 : 1;
  for (let i = lowerBound(level.coins, s.z - 1.2); i < level.coins.length && level.coins[i].z < s.z + (mag ? 5 : 1); i++) {
    if (s.got[i]) continue;
    const c = level.coins[i], cx = laneX(c.lane);
    const ok = mag ? Math.abs(cx - s.x) < 3.1 && Math.abs(c.z - s.z) < 5 : Math.abs(cx - s.x) < 0.78 && Math.abs(c.z - s.z) < 0.7 && c.y >= s.y - 0.25 && c.y <= top + 0.25;
    if (!ok) continue;
    s.got[i] = 1; s.coins++; s.points += 10 * mult; s.stats.combo++;
    s.log.push({ e: 'coin', i, lane: c.lane, z: c.z, y: c.y });
  }
  for (let i = lowerBound(level.pups, s.z - 1.2); i < level.pups.length && level.pups[i].z < s.z + 1; i++) {
    if (s.pgot[i]) continue;
    const c = level.pups[i];
    if (Math.abs(laneX(c.lane) - s.x) < 0.9 && Math.abs(c.z - s.z) < 0.9 && (c.y === undefined || (c.y >= s.y - 0.3 && c.y <= top + 0.3))) {
      s.pgot[i] = 1; s.pw[c.k] = POWER[c.k]; s.log.push({ e: 'power', k: c.k });
    }
  }

  // ---- statische Hindernisse
  const bot = s.y;
  for (let i = lowerBound(level.obs, s.z - 4); i < level.obs.length && level.obs[i].z < s.z + 4; i++) {
    const o = level.obs[i], d = OB[o.k];
    if (!d) continue;
    if (Math.abs(px - laneX(o.lane)) >= HALF_OB + PW) continue;
    const dz = Math.abs(s.z - o.z);
    // Erfolgreich überwunden? (für Statistik/Awards), einmal je Hindernis, wenn die Figur die Mitte passiert
    if (!s.ost[i] && s.z >= o.z && Math.abs(px - laneX(o.lane)) < HALF_OB) {
      if (o.k === 'log' && bot >= d.y1 - 0.02) { s.ost[i] = 1; s.stats.logs++; s.log.push({ e: 'ok', k: 'log' }); }
      else if (o.k === 'hang' && s.slideT > 0 && s.invul === 0) { s.ost[i] = 1; s.stats.slides++; s.log.push({ e: 'ok', k: 'hang' }); }
    }
    if (dz >= d.len / 2 + PD) continue;
    if (bot < d.y1 && top > d.y0) { if (damage(sim, o.k)) { s.ost[i] = 2; if (s.phase === 'lost') return; } }
  }

  // ---- dynamische Hindernisse und Tiere
  for (let i = 0; i < level.dyn.length; i++) {
    const d = level.dyn[i];
    if (d.z > s.z + 140 || (d.k !== 'rhino' && d.k !== 'boulder' && d.k !== 'elephant' && d.z < s.z - 12)) continue;
    let t0 = s.dt0[i];
    if (t0 < 0) {
      let go = false;
      if (d.k === 'rhino' || d.k === 'boulder' || d.k === 'elephant') go = s.z >= d.trig;
      else if (d.k === 'coco') go = s.z >= d.z - v * COCO_FALL;
      if (go) { s.dt0[i] = t0 = sek; s.dph[i] = 1; s.log.push({ e: 'start', k: d.k, i, lane: d.lane }); }
    }
    const nz = dynPos(d, t0, sek);
    switch (d.k) {
      case 'rhino': case 'boulder': {
        if (s.dph[i] === 1 && nz < s.z - 2.2) { s.dph[i] = 2; if (d.k === 'rhino') s.stats.dodge.rhino++; else s.stats.dodge.boulder++; s.log.push({ e: 'ok', k: d.k }); }
        if (s.dph[i] === 3 || t0 < 0) break;
        const hw = d.k === 'rhino' ? 0.85 : 1.05, hd = d.k === 'rhino' ? 1.5 : 1.3, h = d.k === 'rhino' ? 1.7 : 2.6;
        if (Math.abs(px - laneX(d.lane)) < hw + PW && Math.abs(s.z - nz) < hd + PD && bot < h) { if (damage(sim, d.k)) { s.dph[i] = 3; if (s.phase === 'lost') return; } }
        break;
      }
      case 'elephant': {
        if (s.dph[i] < 2 && s.z > nz + 3) { s.dph[i] = 2; s.stats.dodge.elephant++; s.log.push({ e: 'ok', k: 'elephant' }); }
        if (s.dph[i] === 3) break;
        const x0 = laneX(Math.min(...d.lanes)) - HALF_OB, x1 = laneX(Math.max(...d.lanes)) + HALF_OB;
        if (px + PW > x0 && px - PW < x1 && Math.abs(s.z - nz) < 1.55 + PD && bot < 3) { if (damage(sim, 'elephant')) { s.dph[i] = 3; if (s.phase === 'lost') return; } }
        break;
      }
      case 'monkey': {
        const mx = monkeyX(d, sek);
        if (s.dph[i] === 0 && s.z > d.z + 1.2) { s.dph[i] = 2; s.stats.dodge.monkey++; s.log.push({ e: 'ok', k: 'monkey' }); }
        if (Math.abs(s.z - d.z) < 0.6 + PD && Math.abs(px - mx) < 0.55 + PW && bot < 2.2 && top > 1.0) { if (damage(sim, 'monkey')) { s.dph[i] = 3; if (s.phase === 'lost') return; } }
        break;
      }
      case 'coco': {
        if (s.dph[i] === 1 && sek - t0 >= COCO_FALL) {
          s.dph[i] = 2;
          if (Math.abs(px - laneX(d.lane)) < HALF_OB + PW && Math.abs(s.z - d.z) < 0.9 + PD) { if (damage(sim, 'coco')) { s.dph[i] = 3; if (s.phase === 'lost') return; } }
          else s.stats.dodge.coco++;
          s.log.push({ e: 'crack', i });
        }
        break;
      }
      case 'gate': {
        if (Math.abs(s.z - d.z) < 0.5 + PD && Math.abs(px - laneX(d.lane)) < HALF_OB + PW) {
          const b = gateBottom(d, sek);
          if (b < top) { if (damage(sim, 'gate')) { if (s.phase === 'lost') return; } }
        }
        if (s.dph[i] === 0 && s.z > d.z + 1.2) { s.dph[i] = 2; if (Math.abs(px - laneX(d.lane)) < HALF_OB) { s.stats.dodge.gate++; s.log.push({ e: 'ok', k: 'gate' }); } }
        break;
      }
      default: break;
    }
  }

  // ---- Ziel
  if (s.z >= level.len) { s.phase = 'won'; s.finishZ = s.z; s.log.push({ e: 'won' }); }
}

// ---------------------------------------------------------------- Ergebnis
export function result(sim) {
  const { s, level } = sim;
  const total = level.coins.length;
  const sterne = stars(level, s);
  return {
    gewonnen: s.phase === 'won', coins: s.coins, coinsGesamt: total, hearts: s.hearts, punkte: s.points + (s.phase === 'won' ? 200 * s.hearts : 0),
    sek: s.t * DT, unversehrt: s.stats.hits === 0 && s.stats.falls === 0, sterne, hits: s.stats.hits, falls: s.stats.falls,
    dodge: s.stats.dodge, logs: s.stats.logs, slides: s.stats.slides, dist: Math.floor(s.stats.maxZ)
  };
}
// Sterne (je Level konfigurierbar): ★1 Ziel erreicht, ★2 mindestens starCoins Münzen, ★3 mit mindestens starHearts Herzen im Ziel
export function starFlags(level, s) {
  return [s.phase === 'won', s.phase === 'won' && s.coins >= level.starCoins, s.phase === 'won' && s.hearts >= (level.starHearts || 2)];
}
export function stars(level, s) { return starFlags(level, s).filter(Boolean).length; }

// ---------------------------------------------------------------- Hilfen für Tests und Prüfer
export function encodeInputs(list) { return list.map(([t, c]) => t.toString(36) + c).join('.'); }
export function decodeInputs(str) { if (!str) return []; return str.split('.').map((q) => { const m = /^([0-9a-z]+)([LRUD])$/.exec(q); if (!m) throw new Error('Eingabe ' + q); return [parseInt(m[1], 36), m[2]]; }); }
// Eingaben [tick, cmd] bis zum Ende abspielen
export function replay(level, inputs, opts = {}) {
  const sim = createSim(level, opts.sim);
  let i = 0; const max = opts.maxTicks || HZ * 400;
  while (sim.s.phase === 'run' && sim.s.t < max) {
    let cmd = null;
    if (i < inputs.length && inputs[i][0] <= sim.s.t) cmd = inputs[i++][1];
    step(sim, cmd); sim.s.log.length = 0;
  }
  while (sim.s.phase === 'won' && sim.s.z < sim.s.finishZ + 1 && sim.s.t < max) step(sim, null);
  return sim;
}
