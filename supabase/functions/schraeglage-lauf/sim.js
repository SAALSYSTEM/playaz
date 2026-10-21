// SCHRÄGLAGE: Physik und Spielregeln. Kein DOM, läuft gleich im Browser, in Node (Tests, Lösungs-Bot)
// und in einem Cloudflare Worker (spätere Prüfung gemeldeter Bestzeiten).
// Feste Schrittweite 1/60 s, unabhängig von der Bildrate. Eingabe je Schritt: -1 Bremse/Rückwärts, 0 nichts, 1 Gas.
import { World, Vec2, Polygon, Circle, Chain, WheelJoint, RevoluteJoint, RopeJoint, DistanceJoint } from './planck.js';
import { dsin, dcos, datan2, PI } from './det.js';

export const SIM_VERSION = 1;          // bei jeder Änderung an Physik, Fahrzeugen oder Leveln erhöhen (Replays!)
export const HZ = 60;
export const DT = 1 / HZ;
const GRAVITY = -13;
const TAU = 2 * PI;

const CAT_GROUND = 1, CAT_CAR = 2, CAT_OBJ = 4;

// ---------------------------------------------------------------- Untergründe
export const SURFACES = {
  gras:      { name: 'Gras', friction: 0.95 },
  erde:      { name: 'Erde', friction: 0.9 },
  asphalt:   { name: 'Asphalt', friction: 1.0 },
  holz:      { name: 'Holz', friction: 0.85 },
  stein:     { name: 'Fels', friction: 0.9 },
  metall:    { name: 'Stahl', friction: 0.65 },
  strand:    { name: 'Strand', friction: 0.85 },
  sand:      { name: 'Tiefsand', friction: 0.8, drag: 1.6 },
  schlamm:   { name: 'Schlamm', friction: 0.7, drag: 3.2 },
  schnee:    { name: 'Schnee', friction: 0.45 },
  eis:       { name: 'Eis', friction: 0.03 },
  boost:     { name: 'Turbo', friction: 1.0, boost: 26 },
  trampolin: { name: 'Trampolin', friction: 0.9, restitution: 0.9 },
  feder:     { name: 'Sprungfeder', friction: 0.9, jump: 10.5 },
  lava:      { name: 'Lava', friction: 0.9, deadly: true }
};

// ---------------------------------------------------------------- Fahrzeuge
// Koordinaten in Metern, x nach vorn, y nach oben, Ursprung = Fahrzeugmitte.
// parts: konvexe Teile der Karosserie (max. 8 Ecken). head: [x, y, r] Fahrerkopf = Crash-Sensor.
// wheels: [x, y, r, angetrieben]. speed in rad/s am Rad, torque/brake in Nm je Rad.
// air: Drehbeschleunigung in der Luft (rad/s²), spin: maximale Drehrate in der Luft.
export const VEHICLES = {
  kraxler: {
    name: 'Kraxler', art: 'Kleiner Geländewagen', text: 'Allrad, kurz und wendig. Klettert fast überall hoch.',
    parts: [[[-1.3, -0.12], [1.32, -0.12], [1.42, 0.22], [1.05, 0.44], [-1.22, 0.44], [-1.34, 0.18]],
            [[-1.0, 0.44], [0.32, 0.44], [0.02, 0.8], [-0.9, 0.8]]],
    density: 60, com: [0.05, -0.12], head: [-0.42, 1.13, 0.25],
    wheels: [[-0.9, -0.36, 0.46, 1], [0.92, -0.36, 0.46, 1]],
    wheelDensity: 14, grip: 1.05, hz: 4.2, zeta: 0.7, travel: 0.26,
    speed: 32, torque: 340, brake: 700, reverse: 12, air: 7, spin: 4.2, color: '#2f9e5b'
  },
  strandfloh: {
    name: 'Strandfloh', art: 'Strandbuggy', text: 'Leicht und spritzig. Hebt gern ab, braucht Gefühl.',
    parts: [[[-1.25, -0.08], [1.25, -0.08], [1.4, 0.12], [0.6, 0.38], [-1.15, 0.38], [-1.32, 0.12]],
            [[-0.95, 0.38], [0.15, 0.38], [-0.2, 0.62], [-0.85, 0.62]]],
    density: 42, com: [0, -0.1], head: [-0.48, 0.98, 0.24],
    wheels: [[-0.95, -0.3, 0.52, 1], [1.0, -0.32, 0.4, 0]],
    wheelDensity: 11, grip: 0.95, hz: 3.6, zeta: 0.55, travel: 0.3,
    speed: 36, torque: 280, brake: 520, reverse: 13, air: 9, spin: 5, color: '#ff7a1a'
  },
  pritsche: {
    name: 'Pritsche', art: 'Pickup', text: 'Langer Radstand, hohes Tempo. Ruhig in der Luft.',
    parts: [[[-1.75, -0.12], [1.7, -0.12], [1.78, 0.25], [1.2, 0.45], [-1.75, 0.45]],
            [[-0.2, 0.45], [0.95, 0.45], [0.6, 0.95], [-0.2, 0.95]]],
    density: 52, com: [-0.1, -0.12], head: [0.18, 1.2, 0.25],
    wheels: [[-1.18, -0.38, 0.48, 1], [1.15, -0.38, 0.48, 0]],
    wheelDensity: 13, grip: 1.0, hz: 3.8, zeta: 0.7, travel: 0.28,
    speed: 38, torque: 520, brake: 800, reverse: 12, air: 6, spin: 3.8, color: '#2c6fd6'
  },
  wummser: {
    name: 'Wummser', art: 'Monstertruck', text: 'Riesige Räder, weiche Federn. Rollt über alles, kippt aber gern.',
    parts: [[[-1.45, 0.25], [1.45, 0.25], [1.55, 0.6], [1.05, 0.82], [-1.45, 0.82]],
            [[-0.85, 0.82], [0.45, 0.82], [0.2, 1.22], [-0.75, 1.22]]],
    density: 46, com: [0, -0.7], head: [-0.32, 1.5, 0.25],
    wheels: [[-1.05, -0.38, 0.9, 1], [1.05, -0.38, 0.9, 1]],
    wheelDensity: 9, grip: 1.1, hz: 2.6, zeta: 0.5, travel: 0.45,
    speed: 19, torque: 520, brake: 650, reverse: 9, air: 6, spin: 4, color: '#8b3fd9'
  },
  brummi: {
    name: 'Brummi', art: 'Schwerer LKW', text: 'Bärenstark und kaum umzuwerfen. Dafür gemütlich unterwegs.',
    parts: [[[-2.4, -0.15], [2.25, -0.15], [2.35, 0.3], [-2.4, 0.3]],
            [[1.0, 0.3], [2.3, 0.3], [2.3, 1.15], [2.05, 1.5], [1.0, 1.5]],
            [[-2.4, 0.3], [0.85, 0.3], [0.85, 1.25], [-2.4, 1.25]]],
    density: 70, com: [0, -0.45], head: [1.55, 1.78, 0.25],
    wheels: [[-1.85, -0.42, 0.5, 1], [-0.85, -0.42, 0.5, 1], [1.6, -0.42, 0.5, 1]],
    wheelDensity: 18, grip: 1.05, hz: 4.5, zeta: 0.8, travel: 0.2,
    speed: 30, torque: 1500, brake: 2600, reverse: 9, air: 3, spin: 2.5, color: '#e0a100'
  }
};
export const VEHICLE_ORDER = ['kraxler', 'strandfloh', 'pritsche', 'wummser', 'brummi'];

// ---------------------------------------------------------------- Helfer
const V = (p) => Vec2(p[0], p[1]);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export function normAngle(a) { return a - TAU * Math.round(a / TAU); }
// weiche Pendelbewegung 0..1..0 über eine Periode
// mit wait > 0 bleibt die Plattform an beiden Enden kurz stehen (Aufzüge, Fähren)
function pingpong(t, period, phase, wait) {
  if (!wait) return 0.5 - 0.5 * dcos(TAU * (t / period + (phase || 0)));
  const x = t / period + (phase || 0), u = x - Math.floor(x);
  if (u < wait) return 0;
  if (u < 0.5) return 0.5 - 0.5 * dcos(PI * (u - wait) / (0.5 - wait));
  if (u < 0.5 + wait) return 1;
  return 0.5 + 0.5 * dcos(PI * (u - 0.5 - wait) / (0.5 - wait));
}

function surfOf(fixture, child) {
  const u = fixture.getUserData();
  if (!u) return null;
  if (u.surfaces) return SURFACES[u.surfaces[child] || u.surface || 'erde'];
  return u.surface ? SURFACES[u.surface] : null;
}

// ---------------------------------------------------------------- Simulation
export function createSim(level, opts = {}) {
  const world = new World({ gravity: Vec2(0, GRAVITY), allowSleep: false });
  const sim = {
    level, world, tick: 0, started: false,
    finished: false, finishTick: 0, finishMs: 0,
    crashed: null, crashTick: 0,
    car: null, vehicleId: opts.vehicle || level.vehicle || 'kraxler',
    input: 0, events: [],
    movers: [], fallers: [], killzones: [], swaps: (level.swaps || []).map((s) => ({ ...s, done: false })),
    stats: { airTicks: 0, jumps: 0, flips: 0, chassisHit: false, maxTilt: 0, brake: false, wheelieMax: 0, dist: 0, vehicles: [] },
    startX: level.start[0], finishX: level.finish, killY: level.killY
  };
  let air = 0, airRot = 0, landCheck = null, wheelie = 0, upsideTicks = 0, stuckTicks = 0, frozen = true, federPause = 0, vorher = 0;

  // Untergrund-Reibung je Kontakt (eine Bodenkette kann viele Beläge haben)
  world.on('pre-solve', (contact) => {
    const fa = contact.getFixtureA(), fb = contact.getFixtureB();
    const sa = surfOf(fa, contact.getChildIndexA()), sb = surfOf(fb, contact.getChildIndexB());
    const s = sa || sb; if (!s) return;
    const other = sa ? fb : fa;
    contact.setFriction(Math.sqrt(s.friction * other.getFriction()));
    if (s.restitution) contact.setRestitution(s.restitution);
  });

  // ---------- Boden ----------
  for (const g of level.ground) {
    const pts = g.pts, n = pts.length;
    const bottom = g.bottom;
    const loop = pts.map(V);
    loop.push(Vec2(pts[n - 1][0], bottom), Vec2(pts[0][0], bottom));
    const b = world.createBody({ type: 'static' });
    b.setUserData({ kind: 'ground', g });
    const surfaces = g.surf.slice();
    surfaces.push('erde', 'erde', 'erde');
    b.createFixture(new Chain(loop, true), { friction: 0.9, filterCategoryBits: CAT_GROUND, userData: { surfaces, ground: true } });
  }

  // ---------- Objekte ----------
  const objFix = (body, shape, o, extra) => body.createFixture(shape, Object.assign({
    density: o.density || 1, friction: 0.8, restitution: o.bouncy || 0,
    filterCategoryBits: o.dyn ? CAT_OBJ : CAT_GROUND,
    userData: { surface: o.surface || null, obj: o }
  }, extra || {}));
  const boxShape = (w, h, cx, cy, a) => new Polygon([[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]].map((p) => {
    const c = dcos(a || 0), s = dsin(a || 0);
    return Vec2((cx || 0) + p[0] * c - p[1] * s, (cy || 0) + p[0] * s + p[1] * c);
  }));
  const anchorBody = world.createBody({ type: 'static' });

  for (const o of level.objects || []) {
    switch (o.type) {
      case 'box': case 'crate': {
        const dyn = o.type === 'crate' || o.dyn;
        const b = world.createBody({ type: dyn ? 'dynamic' : 'static', position: Vec2(o.x, o.y), angle: o.angle || 0 });
        b.setUserData({ kind: o.type, o });
        objFix(b, boxShape(o.w, o.h), Object.assign({ dyn, density: o.density || (dyn ? 8 : 1) }, o));
        break;
      }
      case 'barrel': case 'ball': {
        const b = world.createBody({ type: 'dynamic', position: Vec2(o.x, o.y), angularDamping: 0.2 });
        b.setUserData({ kind: o.type, o });
        objFix(b, new Circle(o.r), Object.assign({ dyn: true, density: o.density || (o.type === 'ball' ? 1.2 : 5), bouncy: o.type === 'ball' ? 0.4 : 0.05 }, o));
        break;
      }
      case 'rock': {
        const b = world.createBody({ type: 'static', position: Vec2(o.x, o.y) });
        b.setUserData({ kind: 'rock', o });
        objFix(b, new Circle(o.r), Object.assign({ surface: o.surface || 'stein' }, o));
        break;
      }
      case 'poly': {
        const b = world.createBody({ type: 'static' });
        b.setUserData({ kind: 'poly', o });
        objFix(b, new Polygon(o.pts.map(V)), o);
        break;
      }
      case 'mover': {
        const b = world.createBody({ type: 'kinematic', position: Vec2(o.x, o.y) });
        b.setUserData({ kind: 'mover', o });
        objFix(b, boxShape(o.w, o.h), Object.assign({ surface: o.surface || 'metall' }, o));
        sim.movers.push({ b, o });
        break;
      }
      case 'rotor': {
        const b = world.createBody({ type: 'kinematic', position: Vec2(o.x, o.y), angle: o.angle || 0 });
        b.setUserData({ kind: 'rotor', o });
        for (let i = 0; i < (o.arms || 1); i++) objFix(b, boxShape(o.w, o.h, 0, 0, (i * PI) / (o.arms || 1)), Object.assign({ surface: o.surface || 'metall' }, o));
        sim.movers.push({ b, o });
        break;
      }
      case 'seesaw': {
        const b = world.createBody({ type: 'dynamic', position: Vec2(o.x, o.y + (o.h || 0.35) / 2 + 0.02), angle: o.angle || 0, angularDamping: o.damp || 0.2 });
        b.setUserData({ kind: 'seesaw', o });
        objFix(b, boxShape(o.w, o.h || 0.35), Object.assign({ dyn: true, density: o.density || 4, surface: o.surface || 'holz' }, o), { filterCategoryBits: CAT_GROUND });
        const lim = ((o.limit || 22) * PI) / 180;
        world.createJoint(new RevoluteJoint({ enableLimit: true, lowerAngle: -lim - (o.angle || 0), upperAngle: lim - (o.angle || 0) }, anchorBody, b, Vec2(o.x, o.y)));
        break;
      }
      case 'bridge': {
        // Planken zwischen zwei Ankern, verbunden mit Gelenken (hängt durch, schaukelt)
        const span = Math.sqrt((o.x1 - o.x0) * (o.x1 - o.x0) + (o.y1 - o.y0) * (o.y1 - o.y0));
        const n = o.n || Math.max(4, Math.round(span / 1.3));
        const dx = (o.x1 - o.x0) / n, dy = (o.y1 - o.y0) / n, len = Math.sqrt(dx * dx + dy * dy);
        const ang = datan2(dy, dx), th = o.h || 0.28;
        let prev = anchorBody;
        for (let i = 0; i < n; i++) {
          const cx = o.x0 + dx * (i + 0.5), cy = o.y0 + dy * (i + 0.5);
          const b = world.createBody({ type: 'dynamic', position: Vec2(cx, cy - th / 2), angle: ang, angularDamping: 0.6, linearDamping: 0.1 });
          b.setUserData({ kind: 'plank', o, w: len - 0.04, h: th });
          objFix(b, boxShape(len - 0.04, th), Object.assign({ dyn: true, density: o.density || 40, surface: o.surface || 'holz' }, o), { filterCategoryBits: CAT_GROUND, filterGroupIndex: -2 });
          world.createJoint(new RevoluteJoint({}, prev, b, Vec2(o.x0 + dx * i, o.y0 + dy * i - th / 2)));
          prev = b;
        }
        world.createJoint(new RevoluteJoint({}, prev, anchorBody, Vec2(o.x1, o.y1 - th / 2)));
        break;
      }
      case 'swing': {
        // Plattform an zwei Seilen
        const b = world.createBody({ type: 'dynamic', position: Vec2(o.x, o.y), angularDamping: 0.8, linearDamping: 0.15 });
        b.setUserData({ kind: 'swing', o });
        objFix(b, boxShape(o.w, o.h || 0.4), Object.assign({ dyn: true, density: o.density || 5, surface: o.surface || 'holz' }, o), { filterCategoryBits: CAT_GROUND });
        for (const sx of [-o.w / 2 + 0.2, o.w / 2 - 0.2]) {
          world.createJoint(new DistanceJoint({ frequencyHz: 0, dampingRatio: 0 }, anchorBody, b, Vec2(o.x + sx, o.top), Vec2(o.x + sx, o.y)));
        }
        break;
      }
      case 'fall': {
        const b = world.createBody({ type: 'static', position: Vec2(o.x, o.y) });
        b.setUserData({ kind: 'fall', o, armed: -1 });
        objFix(b, boxShape(o.w, o.h), Object.assign({ density: 4, surface: o.surface || 'holz' }, o), { filterCategoryBits: CAT_GROUND });
        sim.fallers.push({ b, o, t: -1 });
        break;
      }
      case 'kill': {
        const b = world.createBody({ type: 'static' });
        b.setUserData({ kind: 'kill', o });
        b.createFixture(boxShape(o.x1 - o.x0, o.y1 - o.y0, (o.x0 + o.x1) / 2, (o.y0 + o.y1) / 2), { isSensor: true, filterCategoryBits: CAT_GROUND, userData: { kill: o.kind || 'wasser' } });
        sim.killzones.push(o);
        break;
      }
      default: break;
    }
  }

  // ---------- Fahrzeug ----------
  function buildCar(id, x, y, angle, vel, angVel) {
    const d = VEHICLES[id];
    const chassis = world.createBody({ type: 'dynamic', position: Vec2(x, y), angle: angle || 0, angularDamping: 0.05 });
    chassis.setUserData({ kind: 'chassis', vehicle: id });
    for (const p of d.parts) {
      chassis.createFixture(new Polygon(p.map(V)), { density: d.density, friction: 0.5, filterGroupIndex: -1, filterCategoryBits: CAT_CAR, filterMaskBits: CAT_GROUND | CAT_OBJ, userData: { part: 'body' } });
    }
    chassis.createFixture(new Circle(Vec2(d.head[0], d.head[1]), d.head[2]), { isSensor: true, density: 0, filterGroupIndex: -1, filterCategoryBits: CAT_CAR, filterMaskBits: CAT_GROUND | CAT_OBJ, userData: { part: 'head' } });
    // Schwerpunkt absenken/verschieben, Trägheit um den neuen Schwerpunkt beibehalten
    const md = { mass: 0, center: Vec2(0, 0), I: 0 };
    chassis.getMassData(md);
    const c0 = md.center, Ic = md.I - md.mass * (c0.x * c0.x + c0.y * c0.y);
    const c1 = Vec2(c0.x + d.com[0], c0.y + d.com[1]);
    chassis.setMassData({ mass: md.mass, center: c1, I: Ic + md.mass * (c1.x * c1.x + c1.y * c1.y) });
    const ca = dcos(angle || 0), sa = dsin(angle || 0);
    const wheels = d.wheels.map((w) => {
      const wx = x + w[0] * ca - w[1] * sa, wy = y + w[0] * sa + w[1] * ca;
      const wb = world.createBody({ type: 'dynamic', position: Vec2(wx, wy), angularDamping: 0.02 });
      wb.setUserData({ kind: 'wheel', vehicle: id, r: w[2] });
      wb.createFixture(new Circle(w[2]), { density: d.wheelDensity, friction: d.grip, restitution: 0.08, filterGroupIndex: -1, filterCategoryBits: CAT_CAR, filterMaskBits: CAT_GROUND | CAT_OBJ, userData: { part: 'wheel' } });
      const joint = world.createJoint(new WheelJoint({ enableMotor: true, maxMotorTorque: 0, motorSpeed: 0, frequencyHz: d.hz, dampingRatio: d.zeta }, chassis, wb, Vec2(wx, wy), Vec2(-sa, ca)));
      const rope = world.createJoint(new RopeJoint({ maxLength: d.travel, localAnchorA: Vec2(w[0], w[1]), localAnchorB: Vec2(0, 0) }, chassis, wb));
      if (vel) { wb.setLinearVelocity(Vec2(vel.x, vel.y)); wb.setAngularVelocity(-vel.x / w[2]); }
      return { body: wb, joint, rope, r: w[2], drive: !!w[3], x: w[0], y: w[1], touch: false, surf: null };
    });
    if (vel) chassis.setLinearVelocity(Vec2(vel.x, vel.y));
    if (angVel) chassis.setAngularVelocity(angVel);
    if (!sim.stats.vehicles.includes(id)) sim.stats.vehicles.push(id);
    return { id, d, chassis, wheels, detached: false };
  }
  function removeCar(car) {
    for (const w of car.wheels) world.destroyBody(w.body);
    world.destroyBody(car.chassis);
  }
  // Startposition: Räder stehen auf der Startlinie
  {
    const d = VEHICLES[sim.vehicleId];
    const low = Math.min(...d.wheels.map((w) => w[1] - w[2]));
    sim.car = buildCar(sim.vehicleId, level.start[0], level.start[1] - low + 0.02, 0);
  }

  // ---------- Schritt ----------
  function updateMovers(t) {
    for (const m of sim.movers) {
      const o = m.o, b = m.b;
      if (o.type === 'rotor') { b.setAngularVelocity(frozen ? 0 : o.speed); continue; }
      if (frozen) { b.setLinearVelocity(Vec2(0, 0)); continue; }
      const f = pingpong(t + DT, o.period, o.phase, o.wait);
      const tx = o.x + (o.dx || 0) * f, ty = o.y + (o.dy || 0) * f;
      const p = b.getPosition();
      b.setLinearVelocity(Vec2((tx - p.x) * HZ, (ty - p.y) * HZ));
    }
  }

  function contactsOf(body, fn) {
    for (let ce = body.getContactList(); ce; ce = ce.next) {
      const c = ce.contact;
      if (!c.isTouching()) continue;
      const fa = c.getFixtureA(), mineA = fa.getBody() === body;
      const mine = mineA ? fa : c.getFixtureB(), other = mineA ? c.getFixtureB() : fa;
      const child = mineA ? c.getChildIndexB() : c.getChildIndexA();
      fn(mine, other, child, c);
    }
  }

  function crash(reason) {
    if (sim.crashed || sim.finished) return;
    sim.crashed = reason; sim.crashTick = sim.tick;
    sim.events.push({ t: 'crash', reason });
    // Räder lösen sich: Crash-Animation
    for (const w of sim.car.wheels) {
      world.destroyJoint(w.joint); world.destroyJoint(w.rope);
      const v = w.body.getLinearVelocity();
      w.body.setLinearVelocity(Vec2(v.x + (w.x > 0 ? 2.5 : -2.5), v.y + 4));
    }
    sim.car.detached = true;
  }

  function drive(input) {
    const car = sim.car, d = car.d, ch = car.chassis;
    if (car.detached) return;
    const a = ch.getAngle(), fx = dcos(a), fy = dsin(a);
    const v = ch.getLinearVelocity();
    const fwd = v.x * fx + v.y * fy;
    for (const w of car.wheels) {
      const j = w.joint;
      if (sim.finished) { j.setMotorSpeed(0); j.setMaxMotorTorque(d.brake); continue; }
      if (input > 0) {
        if (w.drive) { j.setMotorSpeed(-d.speed); j.setMaxMotorTorque(d.torque); } else { j.setMotorSpeed(0); j.setMaxMotorTorque(4); }
      } else if (input < 0) {
        if (fwd > 1.2) { j.setMotorSpeed(0); j.setMaxMotorTorque(sim.inAir ? d.brake * 0.12 : d.brake); }
        else if (w.drive) { j.setMotorSpeed(d.reverse); j.setMaxMotorTorque(d.torque * 0.8); }
        else { j.setMotorSpeed(0); j.setMaxMotorTorque(4); }
      } else { j.setMotorSpeed(0); j.setMaxMotorTorque(d.torque * 0.04); }
    }
  }

  function step(input) {
    input = input > 0 ? 1 : input < 0 ? -1 : 0;
    sim.events.length = 0;
    if (!sim.started) {
      if (input === 0 || sim.finished) return; // Uhr läuft erst mit der ersten Eingabe
      sim.started = true;
    }
    sim.input = input;
    if (federPause > 0) federPause--;
    const car = sim.car, d = car.d, ch = car.chassis;
    const t = sim.tick * DT;
    updateMovers(t);
    drive(input);
    if (input < 0 && !sim.finished && !sim.crashed) sim.stats.brake = true;

    // Bodenkontakt der Räder aus dem letzten Schritt
    let anyWheel = false, rearOnly = true, frontTouch = false;
    for (let i = 0; i < car.wheels.length; i++) {
      const w = car.wheels[i];
      w.touch = false; w.surf = null;
      contactsOf(w.body, (mine, other, child) => {
        if (other.isSensor()) return;
        w.touch = true; w.surf = surfOf(other, child) || w.surf;
      });
      if (w.touch) { anyWheel = true; if (w.x > 0) frontTouch = true; }
      // Untergrund: Sand/Schlamm bremsen, Turbo schiebt
      if (w.touch && w.surf && !car.detached) {
        const s = w.surf;
        if (s.drag) {
          const wv = w.body.getLinearVelocity(), m = ch.getMass() / car.wheels.length;
          w.body.applyForceToCenter(Vec2(-wv.x * s.drag * m, -wv.y * s.drag * m * 0.3), true);
        }
        if (s.boost && !sim.finished) {
          const a = ch.getAngle(), m = ch.getMass() / car.wheels.length;
          ch.applyForceToCenter(Vec2(dcos(a) * s.boost * m, dsin(a) * s.boost * m), true);
          if (sim.tick % 6 === 0) sim.events.push({ t: 'boost' });
        }
        if (s.restitution && w.body.getLinearVelocity().y > 3) sim.events.push({ t: 'bounce' });
        if (s.jump && federPause === 0 && !sim.finished) {
          // Sprungfeder: das ganze Fahrzeug bekommt einen Schub nach oben (senkrecht zur Feder-Fläche ≈ nach oben)
          federPause = 40;
          const cv = ch.getLinearVelocity();
          ch.setLinearVelocity(Vec2(cv.x, Math.max(cv.y, s.jump)));
          for (const ww of car.wheels) { const v2 = ww.body.getLinearVelocity(); ww.body.setLinearVelocity(Vec2(v2.x, Math.max(v2.y, s.jump))); }
          sim.events.push({ t: 'bounce' });
        }
        if (s.deadly) crash('lava');
      }
    }
    if (frontTouch) rearOnly = false;

    // Karosserie und Kopf
    let bodyTouch = false, headHit = false, killed = null;
    contactsOf(ch, (mine, other, child) => {
      const ou = other.getUserData();
      if (ou && ou.kill) { killed = ou.kill; return; }
      if (other.isSensor()) return;
      const part = mine.getUserData() && mine.getUserData().part;
      if (part === 'head') headHit = true;
      else if (part === 'body') { bodyTouch = true; const s = surfOf(other, child); if (s && s.deadly) killed = 'lava'; }
    });
    for (const w of car.wheels) contactsOf(w.body, (mine, other) => { const ou = other.getUserData(); if (ou && ou.kill) killed = ou.kill; });

    // Luftsteuerung: Gas hebt die Nase, Bremse senkt sie
    const airborne = !anyWheel && !bodyTouch;
    sim.inAir = airborne;
    if (airborne && air >= 6 && !car.detached && !sim.finished) {
      const I = ch.getInertia();
      const w0 = ch.getAngularVelocity();
      if (input !== 0 && Math.abs(w0) < d.spin || input * w0 < 0) ch.applyTorque(input * d.air * I, true);
    }

    world.step(DT, 8, 4);
    sim.tick++;
    if (sim.crashed || sim.finished) { postFinish(); return; }

    // ---------- Regeln nach dem Schritt ----------
    const p = ch.getPosition(), ang = normAngle(ch.getAngle()), tilt = Math.abs(ang);
    const vel = ch.getLinearVelocity(), speed = Math.sqrt(vel.x * vel.x + vel.y * vel.y);
    sim.stats.dist += speed * DT;
    if (tilt > sim.stats.maxTilt) sim.stats.maxTilt = tilt;
    if (bodyTouch) sim.stats.chassisHit = true;

    // Sprünge: Luftzeit, Drehung, saubere Landung
    if (airborne) {
      air++; airRot += ch.getAngularVelocity() * DT; sim.stats.airTicks++;
    } else {
      if (air >= 30) {
        sim.events.push({ t: 'land', air, v: -vel.y });
        landCheck = { at: sim.tick, air, rot: airRot, clean: !bodyTouch && tilt < 1.2 };
      } else if (air >= 8) sim.events.push({ t: 'land', air, v: -vel.y, small: true });
      air = 0; airRot = 0;
    }
    if (landCheck) {
      if (bodyTouch) landCheck.clean = false;
      if (sim.tick - landCheck.at >= 30) {
        if (landCheck.clean) {
          sim.stats.jumps++;
          const flips = Math.floor((Math.abs(landCheck.rot) + 0.6) / TAU);
          if (flips > sim.stats.flips) sim.stats.flips = flips;
          sim.events.push({ t: 'jump', air: landCheck.air, flips });
        }
        landCheck = null;
      }
    }
    // Wheelie: nur Hinterräder am Boden
    if (anyWheel && rearOnly && !bodyTouch && speed > 2) { wheelie++; if (wheelie > sim.stats.wheelieMax) sim.stats.wheelieMax = wheelie; } else wheelie = 0;

    // Fahrerwechsel an Umsteige-Toren
    for (const s of sim.swaps) {
      if (!s.done && p.x >= s.x) {
        s.done = true;
        if (s.vehicle !== car.id) {
          const nd = VEHICLES[s.vehicle];
          const low = Math.min(...nd.wheels.map((w) => w[1] - w[2]));
          const oldLow = Math.min(...car.d.wheels.map((w) => w[1] - w[2]));
          const v0 = { x: vel.x, y: Math.max(vel.y, 0) };
          removeCar(car);
          sim.car = buildCar(s.vehicle, p.x, p.y + (oldLow - low) + 0.3, 0, v0, 0);
          sim.vehicleId = s.vehicle;
          sim.events.push({ t: 'swap', vehicle: s.vehicle });
          landCheck = null; air = 0; airRot = 0; vorher = Math.sqrt(v0.x * v0.x + v0.y * v0.y);
          return;
        }
      }
    }

    // Bröckelplatten: fallen kurz nach dem ersten Kontakt
    for (const f of sim.fallers) {
      if (f.t < 0) {
        let hit = false;
        contactsOf(f.b, (mine, other) => { if (other.getFilterCategoryBits && (other.getFilterCategoryBits() & CAT_CAR)) hit = true; });
        if (hit) f.t = f.o.delay || 24;
      } else if (f.t > 0) {
        f.t--;
        if (f.t === 0) { f.b.setType('dynamic'); f.b.setAngularVelocity(0.3); sim.events.push({ t: 'fall' }); }
      }
    }

    // Ziel (zählt vor allen Crash-Regeln): Zeit zwischen zwei Schritten genau interpolieren
    if (p.x >= sim.finishX && !killed) {
      const px = p.x - vel.x * DT;
      const frac = vel.x > 0 ? clamp((sim.finishX - px) / (p.x - px), 0, 1) : 1;
      sim.finished = true; sim.finishTick = sim.tick;
      sim.finishMs = Math.round((sim.tick - 1 + frac) * DT * 1000);
      sim.events.push({ t: 'finish', ms: sim.finishMs });
      return;
    }

    // Eingeklemmt: Plattform drückt das Fahrzeug gegen eine Wand -> unnatürlicher Geschwindigkeitssprung
    const sprung = speed - vorher;
    vorher = speed;
    if (sprung > 6 && federPause < 39) return crash('eingeklemmt');

    // Crash-Regeln
    if (headHit) return crash('kopf');
    if (killed) return crash(killed);
    if (p.y < sim.killY) return crash('absturz');
    if (tilt > 1.9 && bodyTouch) { if (++upsideTicks > 20) return crash('dach'); } else upsideTicks = 0;
    if (tilt > 1.15 && speed < 0.4 && Math.abs(ch.getAngularVelocity()) < 0.3) { if (++stuckTicks > 90) return crash('seite'); } else stuckTicks = 0;

  }

  function postFinish() {
    if (sim.crashed && sim.tick - sim.crashTick < 4) sim.events.push({ t: 'debris' });
  }

  // Einschwingen: Federn, Brücken und Kisten kommen zur Ruhe, bevor die Uhr startet
  for (let i = 0; i < 45; i++) { updateMovers(0); drive(0); world.step(DT, 8, 4); }
  frozen = false;
  sim.tick = 0;

  sim.step = step;
  sim.progress = () => clamp((sim.car.chassis.getPosition().x - sim.startX) / (sim.finishX - sim.startX), 0, 1);
  sim.timeMs = () => (sim.finished ? sim.finishMs : Math.round(sim.tick * DT * 1000));
  sim.hash = () => {
    const ch = sim.car.chassis, p = ch.getPosition(), v = ch.getLinearVelocity();
    return [sim.tick, p.x, p.y, ch.getAngle(), v.x, v.y, ch.getAngularVelocity()].join('|');
  };
  return sim;
}

// ---------------------------------------------------------------- Replays
// Ein Lauf wird als Liste von Eingabewechseln [tick, eingabe] gespeichert.
export function encodeInputs(changes) { return changes.map((c) => c[0].toString(36) + (c[1] > 0 ? 'g' : c[1] < 0 ? 'b' : 'n')).join('.'); }
export function decodeInputs(s) {
  if (typeof s !== 'string' || !s) return [];
  return s.split('.').map((part) => {
    const m = /^([0-9a-z]+)([gbn])$/.exec(part);
    if (!m) throw new Error('kaputte Eingabe');
    return [parseInt(m[1], 36), m[2] === 'g' ? 1 : m[2] === 'b' ? -1 : 0];
  });
}

// Spielt einen Lauf exakt nach. Gibt Zielzeit oder Abbruchgrund zurück.
export function replay(level, changes, opts = {}) {
  const sim = createSim(level);
  const max = opts.maxTicks || 60 * 60 * 5;
  let i = 0, input = 0;
  // Tick 0 = erste Eingabe; die Simulation startet erst, wenn eine Eingabe != 0 kommt
  while (!sim.finished && !sim.crashed && sim.tick < max) {
    while (i < changes.length && changes[i][0] <= sim.tick) { input = changes[i][1]; i++; }
    if (!sim.started && input === 0) { if (i >= changes.length) break; input = changes[i][1]; i++; }
    sim.step(input);
    if (opts.onStep) opts.onStep(sim);
  }
  return { finished: sim.finished, ms: sim.finishMs, ticks: sim.tick, crashed: sim.crashed, stats: sim.stats, hash: sim.hash() };
}

// Serverseitige Prüfung einer gemeldeten Zeit (siehe docs/SCHRAEGLAGE.md).
export function verifyRun(level, run) {
  try {
    if (!run || run.v !== SIM_VERSION) return { ok: false, grund: 'version' };
    if (run.level !== level.id) return { ok: false, grund: 'level' };
    const changes = decodeInputs(run.inputs);
    if (changes.length > 20000) return { ok: false, grund: 'zu_viele_eingaben' };
    for (let k = 1; k < changes.length; k++) if (changes[k][0] < changes[k - 1][0]) return { ok: false, grund: 'reihenfolge' };
    const r = replay(level, changes, { maxTicks: Math.min(60 * 60 * 5, (run.ms / 1000) * 60 + 120) });
    if (!r.finished) return { ok: false, grund: r.crashed ? 'crash_' + r.crashed : 'kein_ziel' };
    if (r.ms !== run.ms) return { ok: false, grund: 'zeit_weicht_ab', ms: r.ms };
    return { ok: true, ms: r.ms, stats: r.stats };
  } catch (e) {
    return { ok: false, grund: 'fehler' };
  }
}
