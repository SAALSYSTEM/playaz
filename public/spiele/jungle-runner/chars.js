// JUNGLE RUNNER: Spielfiguren (Junge/Mädchen auf demselben Skelett), Tiere und Spielobjekte als prozedurale Low-Poly-Modelle.
// WICHTIG: Das sind vorläufige Platzhalter-Modelle aus Grundkörpern (siehe docs/JUNGLE_RUNNER.md, Asset-Tabelle). Sie halten die
// Maße der Trefferflächen ein (Spielfigur 1,5 m, beide Figuren identisch), ersetzen aber keine fertigen GLB-Modelle.
// Alle Modelle blicken nach −z (Laufrichtung der Kamera); wer entgegenkommt, wird um 180° gedreht.
const T = window.THREE;

const matCache = new Map();
export const lam = (hex, o) => { const k = hex + (o ? JSON.stringify(o) : ''); let m = matCache.get(k); if (!m) { m = new T.MeshLambertMaterial({ color: hex, ...o }); matCache.set(k, m); } return m; };
const geo = {
  box: new T.BoxGeometry(1, 1, 1), sph: new T.SphereGeometry(0.5, 14, 10), sphL: new T.SphereGeometry(0.5, 9, 7), cyl: new T.CylinderGeometry(0.5, 0.5, 1, 12), cylL: new T.CylinderGeometry(0.5, 0.5, 1, 8),
  cone: new T.ConeGeometry(0.5, 1, 10), ico: new T.IcosahedronGeometry(0.5, 1), disc: new T.CylinderGeometry(0.5, 0.5, 1, 18),
  cap: new T.SphereGeometry(0.5, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.5)
};
const part = (g, m, x, y, z, sx, sy, sz, rx = 0, ry = 0, rz = 0) => { const o = new T.Mesh(g, m); o.position.set(x, y, z); o.scale.set(sx, sy, sz); o.rotation.set(rx, ry, rz); return o; };
const grp = (x = 0, y = 0, z = 0) => { const g = new T.Group(); g.position.set(x, y, z); return g; };
// Gesichter (Paket C): transparente PNGs, als Abziehbild auf ein Kugelstück vor dem Kopf gelegt (Nase und Ohren bleiben Körper)
const FACE_FILE = { boy: 'gesicht-junge.png', girl: 'gesicht-maedchen.png' };
const faceTex = {};
export const faceReady = Promise.all(Object.keys(FACE_FILE).map((k) => new Promise((ok) => {
  const img = new Image(), t = new T.Texture(img); t.anisotropy = 4; faceTex[k] = t;
  img.onload = () => { t.needsUpdate = true; ok(); }; img.onerror = () => ok();
  img.src = new URL('assets/' + FACE_FILE[k], import.meta.url).href;
})));
const FACE_SPAN = 2.2;                                  // Bogenmaß, das das 256-px-Bild auf dem Kopf abdeckt (Augenabstand ≈ 0,16 m)
const faceGeo = new T.SphereGeometry(0.5, 20, 14, Math.PI * 1.5 - FACE_SPAN / 2, FACE_SPAN, Math.PI / 2 - 0.1 - FACE_SPAN / 2, FACE_SPAN);
const faceMats = {};
const faceMat = (k) => faceMats[k] || (faceMats[k] = new T.MeshLambertMaterial({ map: faceTex[k], transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
const approach = (a, b, k) => a + (b - a) * Math.min(1, k);

// ====================================================================== Kleidung (nur Optik, kein Spielvorteil)
// shirt: [Junge, Mädchen] oder eine Farbe
export const OUTFITS = [
  // Entdecker = Palette des Keyarts: heller Safarihut mit dunklem Band, olivgrünes Shirt, rote Rucksack-Tasche, braune Stiefel
  { id: 'entdecker', name: 'Entdecker', preis: 0, shirt: [0x9db35e, 0xe9806b], shirt2: 0x6f8040, pants: [0x6f7d3a, 0x7a6a4c], shoes: 0x6b4a2a, hat: 'safari', hatC: 0xb98c4e, hatBand: 0x4a3322, pack: 0xc9382f },
  { id: 'blau', name: 'Flussläufer', preis: 150, shirt: 0x2f9be8, shirt2: 0x1b6fb0, pants: 0xc9b27a, shoes: 0xf2f2f2, hat: 'cap', hatC: 0xffd23f, pack: 0xff8a3d },
  // Safari: helles Cremeweiß statt Braun/Olive des Entdeckers (Hut, Shirt, Hose, Tasche), damit beide sofort unterscheidbar sind
  { id: 'safari', name: 'Safari', preis: 300, shirt: 0xf3e6b8, shirt2: 0xc9862f, pants: 0x6a4e33, shoes: 0x3a2918, hat: 'safari', hatC: 0xf4ecd6, hatBand: 0x9a5f2a, pack: 0x2f6b3c },
  { id: 'schatz', name: 'Schatzsucher', preis: 500, shirt: 0x1f8a8a, shirt2: 0xf2f2f2, pants: 0x3a3f5c, shoes: 0x2b2b35, hat: 'band', hatC: 0xe53935, pack: 0x8d5a2b },
  { id: 'tempel', name: 'Tempelwächter', preis: 800, shirt: 0x7e57c2, shirt2: 0xffd23f, pants: 0x4a3a6b, shoes: 0xffd23f, hat: 'band', hatC: 0xffd23f, pack: 0x2e7d32 },
  { id: 'gold', name: 'Goldener Held', preis: 1200, shirt: 0xf5b81f, shirt2: 0xfff1a8, pants: 0xfff6dc, shoes: 0xf5b81f, hat: 'cap', hatC: 0xf5b81f, pack: 0xe53935 }
];
export const OUTFIT_BY_ID = Object.fromEntries(OUTFITS.map((o) => [o.id, o]));
const pick = (v, girl) => (Array.isArray(v) ? v[girl ? 1 : 0] : v);

// ====================================================================== Spielfigur
export function buildChar(kind, outfit) {
  const girl = kind === 'girl', O = outfit || OUTFITS[0];
  const skin = 0xf2b78c, hairC = girl ? 0x5b2f1b : 0x70401f, shirt = pick(O.shirt, girl), pants = pick(O.pants, girl);
  const root = grp(), tilt = grp(), pivot = grp(0, 0.62, 0);
  root.add(tilt); tilt.add(pivot);
  // Torso
  const torso = grp(0, 0, 0); pivot.add(torso);
  torso.add(part(geo.box, lam(shirt), 0, 0.23, 0, 0.40, 0.42, 0.26));
  torso.add(part(geo.box, lam(O.shirt2), 0, 0.40, -0.01, 0.30, 0.06, 0.28));              // Kragen/Träger
  torso.add(part(geo.box, lam(pants), 0, -0.01, 0, 0.41, 0.14, 0.27));                   // Hosenbund
  torso.add(part(geo.box, lam(0xc9a66b), 0, 0.045, -0.002, 0.42, 0.04, 0.275));          // Gürtel
  // Rucksack mit Trägern (gut von hinten zu sehen)
  const pack = grp(0, 0.25, 0.2); torso.add(pack);
  pack.add(part(geo.box, lam(O.pack), 0, 0, 0, 0.30, 0.34, 0.15));
  pack.add(part(geo.box, lam(0x2b2b35), 0, 0.12, 0.02, 0.32, 0.06, 0.17));
  pack.add(part(geo.box, lam(O.shirt2), 0, -0.08, 0.09, 0.2, 0.12, 0.05));
  for (const sx of [-1, 1]) torso.add(part(geo.box, lam(0x2b2b35), sx * 0.11, 0.3, -0.11, 0.05, 0.3, 0.03));
  // Kopf
  const head = grp(0, 0.5, 0); torso.add(head);
  head.add(part(geo.sph, lam(skin), 0, 0.08, 0, 0.5, 0.5, 0.5));
  head.add(part(geo.sph, lam(skin), 0, 0.02, -0.255, 0.07, 0.065, 0.06));                // Nase
  for (const sx of [-1, 1]) head.add(part(geo.sph, lam(skin), sx * 0.25, 0.07, 0.0, 0.07, 0.11, 0.07));   // Ohren
  head.add(part(faceGeo, faceMat(girl ? 'girl' : 'boy'), 0, 0.08, 0, 0.51, 0.51, 0.51));                    // Gesicht (Augen, Brauen, Mund, Wangen)
  // Haare: Kappe, nach hinten gekippt, damit das Gesicht frei bleibt
  const hair = grp(0, 0.1, 0.035); head.add(hair);
  hair.add(part(geo.cap, lam(hairC), 0, 0, 0, 0.56, 0.56, 0.56, 0.62, 0, 0));
  hair.add(part(geo.sph, lam(hairC), 0, -0.03, 0.14, 0.5, 0.42, 0.34));                  // Hinterkopf
  const tufts = girl ? [] : [[-0.1, 0.27, -0.05, 0.35], [0.06, 0.29, -0.09, -0.25], [0.14, 0.24, 0.02, -0.7], [-0.17, 0.2, 0.05, 0.8], [0, 0.3, 0.07, 0.1]];
  for (const [x, y, z, rz] of tufts) hair.add(part(geo.cone, lam(hairC), x, y, z, 0.12, 0.2, 0.12, -0.35, 0, rz));
  let tail = null;
  if (girl) {
    tail = grp(0, 0.14, 0.23); head.add(tail);
    tail.add(part(geo.box, lam(0xe53935), 0, 0.02, -0.02, 0.1, 0.07, 0.1));
    const seg1 = grp(0, 0, 0.04); tail.add(seg1); seg1.add(part(geo.sph, lam(hairC), 0, -0.08, 0.08, 0.17, 0.26, 0.17));
    const seg2 = grp(0, -0.18, 0.1); seg1.add(seg2); seg2.add(part(geo.sph, lam(hairC), 0, -0.09, 0.02, 0.15, 0.28, 0.15));
    tail.userData.s1 = seg1; tail.userData.s2 = seg2;
    hair.add(part(geo.box, lam(hairC), 0.09, 0.1, -0.2, 0.26, 0.08, 0.08, 0.2, 0, -0.5)); // Pony
  }
  // Kopfbedeckung
  if (O.hat === 'cap') {
    head.add(part(geo.cap, lam(O.hatC), 0, 0.17, 0.0, 0.54, 0.54, 0.54, 0.3, 0, 0));
    head.add(part(geo.box, lam(O.hatC), 0, 0.2, -0.27, 0.34, 0.035, 0.22, 0.2, 0, 0));
  } else if (O.hat === 'safari') {
    head.add(part(geo.disc, lam(O.hatC), 0, 0.26, 0, 0.78, 0.03, 0.78));
    head.add(part(geo.cap, lam(O.hatC), 0, 0.26, 0, 0.5, 0.5, 0.5));
    head.add(part(geo.cyl, lam(O.hatBand || 0x6b4a2a), 0, 0.3, 0, 0.51, 0.05, 0.51));
  } else if (O.hat === 'band') {
    head.add(part(geo.cyl, lam(O.hatC), 0, 0.18, 0.005, 0.54, 0.07, 0.54));
    head.add(part(geo.box, lam(O.hatC), 0.0, 0.17, 0.27, 0.07, 0.16, 0.04, 0, 0, 0.4));  // Knoten hinten
  }
  // Arme
  const arm = (sx) => {
    const a = grp(sx * 0.26, 0.4, 0); torso.add(a);
    a.add(part(geo.sph, lam(shirt), 0, 0, 0, 0.17, 0.17, 0.17));
    a.add(part(geo.cylL, lam(shirt), 0, -0.1, 0, 0.115, 0.2, 0.115));
    const el = grp(0, -0.2, 0); a.add(el);
    el.add(part(geo.cylL, lam(skin), 0, -0.09, 0, 0.09, 0.18, 0.09));
    el.add(part(geo.sphL, lam(skin), 0, -0.2, 0, 0.12, 0.12, 0.12));
    return { a, el };
  };
  const armL = arm(-1), armR = arm(1);
  // Beine
  const leg = (sx) => {
    const l = grp(sx * 0.1, -0.03, 0); pivot.add(l);
    l.add(part(geo.cylL, lam(pants), 0, -0.1, 0, 0.19, 0.2, 0.19));
    l.add(part(geo.cylL, lam(skin), 0, -0.22, 0, 0.1, 0.12, 0.1));
    const kn = grp(0, -0.27, 0); l.add(kn);
    kn.add(part(geo.cylL, lam(skin), 0, -0.07, 0, 0.09, 0.14, 0.09));
    kn.add(part(geo.cylL, lam(0xffffff), 0, -0.17, 0, 0.11, 0.08, 0.11));
    kn.add(part(geo.box, lam(O.shoes), 0, -0.235, -0.04, 0.15, 0.1, 0.28));
    kn.add(part(geo.box, lam(0xffffff), 0, -0.275, -0.04, 0.155, 0.03, 0.285));
    return { l, kn };
  };
  const legL = leg(-1), legR = leg(1);
  const shadow = part(new T.CircleGeometry(0.5, 16), new T.MeshBasicMaterial({ color: 0x0b2a10, transparent: true, opacity: 0.28, depthWrite: false }), 0, 0.02, 0, 0.8, 0.8, 0.8, -Math.PI / 2);
  const c = { kind, root, tilt, pivot, torso, head, armL, armR, legL, legR, tail, shadow, J: {}, ph: 0, outfit: O, girl };
  return c;
}

// Gelenkwinkel weich auf das Ziel zuführen. tgt: { thL, thR, shL, shR, aL, aR, elL, elR, azL, azR, lean, roll, hx, hy, py, tilt }
export function poseChar(c, tgt, dt, hart) {
  const J = c.J, k = hart ? 1 : dt * 24;
  for (const key of Object.keys(tgt)) J[key] = J[key] === undefined ? tgt[key] : approach(J[key], tgt[key], key === 'py' ? Math.min(1, dt * 40) : k);
  c.legL.l.rotation.x = J.thL; c.legR.l.rotation.x = J.thR;
  c.legL.kn.rotation.x = -J.shL; c.legR.kn.rotation.x = -J.shR;
  c.armL.a.rotation.x = J.aL; c.armR.a.rotation.x = J.aR;
  c.armL.a.rotation.z = J.azL; c.armR.a.rotation.z = J.azR;
  c.armL.el.rotation.x = J.elL; c.armR.el.rotation.x = J.elR;
  c.pivot.rotation.x = J.lean; c.pivot.rotation.z = J.roll;
  c.pivot.position.y = 0.62 + J.py;
  c.head.rotation.x = J.hx; c.head.rotation.y = J.hy;
}

// Zielwinkel je Zustand. m: { mode, ph (Laufphase), grounded, vy, lane (−1/0/1 Richtung des Spurwechsels, weich), slide (0..1), stun (0..1), t (Zeit) }
export function poseTarget(m) {
  const s = Math.sin(m.ph), s2 = Math.sin(m.ph + Math.PI);
  const run = {
    thL: s * 0.95, thR: s2 * 0.95,
    shL: 0.25 + Math.max(0, Math.sin(m.ph - 1.0)) * 1.15, shR: 0.25 + Math.max(0, Math.sin(m.ph + Math.PI - 1.0)) * 1.15,
    aL: s2 * 0.9, aR: s * 0.9, elL: 1.15 - s2 * 0.3, elR: 1.15 - s * 0.3, azL: -0.1, azR: 0.1,
    lean: 0.2, roll: -m.lane * 0.28, hx: -0.12, hy: m.lane * 0.2, py: Math.abs(Math.cos(m.ph)) * 0.05 - 0.02
  };
  switch (m.mode) {
    case 'jump': return { thL: 0.95, thR: -0.35, shL: 1.15, shR: 0.55, aL: 2.5, aR: 2.3, elL: 0.35, elR: 0.5, azL: -0.25, azR: 0.25, lean: 0.12, roll: -m.lane * 0.2, hx: -0.18, hy: 0, py: 0.0 };
    case 'fall': return { thL: 0.45, thR: -0.15, shL: 0.5, shR: 0.3, aL: 0.6, aR: 0.5, elL: 0.3, elR: 0.3, azL: -1.25, azR: 1.25, lean: 0.1, roll: -m.lane * 0.18, hx: -0.1, hy: 0, py: 0.0 };
    case 'slide': return { thL: 1.45, thR: 1.2, shL: 0.1, shR: 0.15, aL: -0.9, aR: -0.8, elL: 0.3, elR: 0.3, azL: -0.35, azR: 0.35, lean: 1.28, roll: 0, hx: 0.5, hy: 0, py: -0.31 };
    case 'stun': return { thL: 0.5, thR: -0.2, shL: 0.7, shR: 0.5, aL: 2.1, aR: 1.8, elL: 0.9, elR: 0.9, azL: -0.5, azR: 0.5, lean: -0.38, roll: Math.sin(m.t * 38) * 0.14, hx: 0.25, hy: Math.sin(m.t * 30) * 0.4, py: -0.02 };
    case 'cheer': { const j = Math.abs(Math.sin(m.t * 6.5)); return { thL: 0.5 * Math.sin(m.t * 13), thR: -0.5 * Math.sin(m.t * 13), shL: 0.5, shR: 0.5, aL: 2.8, aR: 2.8, elL: 0.2, elR: 0.2, azL: -0.45, azR: 0.45, lean: 0.0, roll: Math.sin(m.t * 6.5) * 0.12, hx: -0.15, hy: Math.sin(m.t * 3.2) * 0.35, py: j * 0.26 }; }
    case 'lose': return { thL: 0.9, thR: 0.7, shL: 1.5, shR: 1.5, aL: 0.5, aR: 0.4, elL: 0.3, elR: 0.3, azL: -0.15, azR: 0.15, lean: 0.7, roll: 0, hx: 0.55, hy: 0, py: -0.28 };
    case 'idle': return { thL: 0.05 * s, thR: -0.05 * s, shL: 0.1, shR: 0.1, aL: -0.05 + 0.08 * Math.sin(m.t * 2), aR: 0.1 - 0.08 * Math.sin(m.t * 2), elL: 0.2, elR: 0.2, azL: -0.1, azR: 0.1, lean: 0.03, roll: 0, hx: -0.04, hy: Math.sin(m.t * 0.9) * 0.15, py: Math.sin(m.t * 2) * 0.008 };
    case 'wave': return { thL: 0, thR: 0, shL: 0.05, shR: 0.05, aL: -0.05, aR: 2.9 + Math.sin(m.t * 7) * 0.2, elL: 0.2, elR: 0.5 + Math.sin(m.t * 7) * 0.5, azL: -0.1, azR: 0.2, lean: 0.0, roll: 0, hx: -0.05, hy: 0.2, py: Math.sin(m.t * 2) * 0.008 };
    default: return run;
  }
}
export function animateExtras(c, t, v) {                // Pferdeschwanz schwingt mit
  if (c.tail) { const s1 = c.tail.userData.s1, s2 = c.tail.userData.s2; s1.rotation.x = 0.45 + Math.sin(t * 11) * 0.28 * Math.min(1, v / 8); s2.rotation.x = 0.25 + Math.sin(t * 11 - 1.2) * 0.38 * Math.min(1, v / 8); s1.rotation.z = Math.sin(t * 7) * 0.1; }
}

// ====================================================================== Tiere
const grey = 0x8b97ae, greyD = 0x6c7890, greyL = 0xbcc6d8;        // Elefant (noch ohne Entwurf)
const rGrey = 0x918c9f, rGreyD = 0x6f6a80, rGreyL = 0xbdb8ca;     // Nashorn: wärmeres Violettgrau wie im Keyart

export function buildRhino() {
  const g = grp(), body = grp(0, 0, 0); g.add(body);
  body.add(part(geo.ico, lam(rGrey), 0, 1.0, 0.45, 1.5, 1.35, 2.2));
  body.add(part(geo.sph, lam(rGreyD), 0, 1.35, -0.25, 1.1, 0.9, 1.0));                 // Schulterbuckel
  body.add(part(geo.sph, lam(rGreyL), 0, 0.62, 0.35, 1.2, 0.6, 1.6));                  // Bauch
  const head = grp(0, 0.88, -0.95); body.add(head);
  head.add(part(geo.sph, lam(rGrey), 0, 0, 0, 0.85, 0.8, 1.05));
  head.add(part(geo.sph, lam(rGreyL), 0, -0.2, -0.38, 0.65, 0.4, 0.5));                // Schnauze
  head.add(part(geo.cone, lam(0xe9d5a8), 0, 0.28, -0.52, 0.22, 0.62, 0.22, -0.55, 0, 0));    // Horn
  head.add(part(geo.cone, lam(0xdcc490), 0, 0.2, -0.22, 0.14, 0.3, 0.14, -0.35, 0, 0));
  for (const sx of [-1, 1]) {
    head.add(part(geo.cone, lam(rGreyD), sx * 0.3, 0.42, 0.18, 0.2, 0.3, 0.12, 0.2, 0, sx * -0.35));  // Ohren
    head.add(part(geo.sphL, lam(0x20212b), sx * 0.36, 0.1, -0.22, 0.1, 0.12, 0.08));
    head.add(part(geo.sphL, lam(0xffffff), sx * 0.375, 0.14, -0.26, 0.04, 0.04, 0.03));
  }
  body.add(part(geo.cylL, lam(rGreyD), 0, 1.05, 1.52, 0.09, 0.6, 0.09, -0.9, 0, 0));    // Schwanz
  const legs = [];
  for (const [x, z] of [[-0.45, -0.35], [0.45, -0.35], [-0.45, 1.05], [0.45, 1.05]]) {
    const l = grp(x, 0.7, z); g.add(l);
    l.add(part(geo.cylL, lam(rGreyD), 0, -0.3, 0, 0.3, 0.62, 0.3)); l.add(part(geo.box, lam(0x5a5568), 0, -0.62, -0.04, 0.34, 0.14, 0.4));
    legs.push(l);
  }
  g.userData = { body, head, legs, kind: 'rhino' };
  return g;
}
export function animRhino(g, t, run) {                                          // run: 0 = steht (scharrt), 1 = galoppiert
  const u = g.userData, w = t * (run ? 15 : 3.5);
  u.legs.forEach((l, i) => { const ph = w + (i < 2 ? 0 : 2.4) + (i % 2) * 0.5; l.rotation.x = run ? Math.sin(ph) * 0.8 : (i === 0 ? Math.max(0, Math.sin(w * 1.2)) * 0.7 : 0); });
  u.body.position.y = run ? Math.abs(Math.sin(w)) * 0.13 : 0; u.body.rotation.x = run ? Math.sin(w) * 0.04 : 0;
  u.head.rotation.x = run ? -0.12 + Math.sin(w) * 0.06 : 0.3 + Math.sin(t * 2) * 0.08;
}

export function buildElephant() {
  const g = grp(), body = grp(); g.add(body);
  body.add(part(geo.ico, lam(grey), 0, 1.6, 0.1, 1.8, 1.7, 2.6));
  body.add(part(geo.sph, lam(greyD), 0, 1.35, 0.9, 1.5, 1.2, 1.2));
  const head = grp(0, 1.85, -1.3); body.add(head);
  head.add(part(geo.sph, lam(grey), 0, 0, 0, 1.15, 1.1, 1.1));
  const trunk = grp(0, -0.2, -0.5); head.add(trunk);
  trunk.add(part(geo.cylL, lam(grey), 0, -0.3, 0, 0.42, 0.7, 0.42, 0.1, 0, 0));
  const t2 = grp(0, -0.62, 0.02); trunk.add(t2); t2.add(part(geo.cylL, lam(grey), 0, -0.3, -0.05, 0.32, 0.65, 0.32, -0.45, 0, 0));
  const t3 = grp(0, -0.58, -0.28); t2.add(t3); t3.add(part(geo.cylL, lam(greyD), 0, -0.14, -0.05, 0.24, 0.35, 0.24, -0.9, 0, 0));
  for (const sx of [-1, 1]) {
    const ear = grp(sx * 0.5, 0.15, 0.2); head.add(ear);
    ear.add(part(geo.disc, lam(greyD), sx * 0.38, 0, 0.0, 0.1, 1.0, 1.0, 0, 0, 0)); ear.rotation.y = sx * -0.25;
    ear.add(part(geo.disc, lam(0xc9a2a2), sx * 0.34, 0, -0.02, 0.06, 0.75, 0.75));
    ear.userData.sx = sx;
    head.userData['ear' + sx] = ear;
    head.add(part(geo.cone, lam(0xf4efe0), sx * 0.3, -0.35, -0.5, 0.16, 0.6, 0.16, -1.2, 0, sx * 0.25));  // Stoßzähne
    head.add(part(geo.sphL, lam(0x20212b), sx * 0.3, 0.12, -0.46, 0.1, 0.12, 0.08));
  }
  body.add(part(geo.cylL, lam(greyD), 0, 1.5, 1.55, 0.1, 0.9, 0.1, -0.25, 0, 0));
  const legs = [];
  for (const [x, z] of [[-0.55, -0.7], [0.55, -0.7], [-0.55, 0.95], [0.55, 0.95]]) {
    const l = grp(x, 1.0, z); g.add(l);
    l.add(part(geo.cylL, lam(greyD), 0, -0.45, 0, 0.55, 0.95, 0.55)); l.add(part(geo.cyl, lam(0xb7a4a4), 0, -0.92, 0, 0.5, 0.1, 0.5));
    legs.push(l);
  }
  g.userData = { body, head, trunk, t2, legs, kind: 'elephant' };
  return g;
}
export function animElephant(g, t, ph = 0) {
  const u = g.userData, w = t * 2.6 + ph;
  u.legs.forEach((l, i) => { l.rotation.x = Math.sin(w + (i % 2 ? Math.PI : 0) + (i > 1 ? 1.6 : 0)) * 0.28; });
  u.body.position.y = Math.abs(Math.sin(w)) * 0.05; u.body.rotation.z = Math.sin(w) * 0.025;
  u.trunk.rotation.x = Math.sin(w * 0.9) * 0.18; u.t2.rotation.x = Math.sin(w * 0.9 - 0.6) * 0.15;
  const f = Math.sin(t * 3 + ph) * 0.12; u.head.userData['ear-1'].rotation.y = 0.25 + f; u.head.userData['ear1'].rotation.y = -0.25 - f;
}

export function buildMonkey() {
  const g = grp(), body = grp(0, 0, 0); g.add(body);
  const fur = 0xa65f2e, furL = 0xf2c598, furD = 0x6e3d1c;
  body.add(part(geo.sph, lam(fur), 0, 0, 0, 0.55, 0.75, 0.45));                           // Rumpf
  body.add(part(geo.sph, lam(furL), 0, -0.02, -0.12, 0.38, 0.5, 0.25));                   // Bauch
  const head = grp(0, 0.5, -0.02); body.add(head);
  head.add(part(geo.sph, lam(fur), 0, 0, 0, 0.5, 0.45, 0.46));
  head.add(part(geo.sph, lam(furL), 0, -0.05, -0.12, 0.34, 0.3, 0.22));                   // Gesicht
  head.add(part(geo.sphL, lam(furL), 0, -0.1, -0.24, 0.16, 0.1, 0.07));
  for (const sx of [-1, 1]) {
    head.add(part(geo.sph, lam(furL), sx * 0.28, 0.02, 0, 0.2, 0.2, 0.08));
    head.add(part(geo.sphL, lam(0x20212b), sx * 0.085, 0.03, -0.235, 0.07, 0.09, 0.04));
    head.add(part(geo.sphL, lam(0xffffff), sx * 0.075, 0.055, -0.25, 0.03, 0.03, 0.02));
  }
  head.add(part(geo.box, lam(0x6e2a2a), 0, -0.13, -0.25, 0.1, 0.02, 0.03));
  const arm = (sx) => { const a = grp(sx * 0.3, 0.28, 0); body.add(a); a.add(part(geo.cylL, lam(fur), 0, -0.2, 0, 0.12, 0.5, 0.12)); a.add(part(geo.sphL, lam(furL), 0, -0.47, 0, 0.14, 0.14, 0.14)); return a; };
  const aL = arm(-1), aR = arm(1);
  const leg = (sx) => { const l = grp(sx * 0.15, -0.3, 0); body.add(l); l.add(part(geo.cylL, lam(fur), 0, -0.2, 0, 0.13, 0.45, 0.13)); l.add(part(geo.sphL, lam(furL), 0, -0.45, -0.03, 0.16, 0.1, 0.2)); return l; };
  const lL = leg(-1), lR = leg(1);
  const tail = grp(0, -0.25, 0.2); body.add(tail);
  const segs = [];
  let parent = tail;
  for (let i = 0; i < 4; i++) { const s = grp(0, -0.12, 0.04); parent.add(s); s.add(part(geo.sphL, lam(furD), 0, 0, 0.0, 0.1, 0.22, 0.1)); segs.push(s); parent = s; }
  g.userData = { body, head, aL, aR, lL, lR, segs, kind: 'monkey' };
  return g;
}
export function animMonkey(g, t, swing) {
  const u = g.userData, w = t * 5;
  u.body.rotation.z = -swing * 0.35;
  u.aL.rotation.x = 2.9; u.aL.rotation.z = -0.15;                                    // eine Hand hält die Liane
  u.aR.rotation.x = Math.sin(w) * 0.5 + 0.5; u.aR.rotation.z = 0.5 + Math.sin(w * 1.3) * 0.3;
  u.lL.rotation.x = Math.sin(w * 0.9) * 0.5 + 0.2; u.lR.rotation.x = Math.sin(w * 0.9 + 2) * 0.5 + 0.2;
  u.segs.forEach((s, i) => { s.rotation.x = 0.55 + Math.sin(w * 0.8 - i * 0.7) * 0.2; });
  u.head.rotation.y = Math.sin(w * 0.5) * 0.3;
}

export function buildBoulder() {
  const g = grp(), r = grp(0, 1.3, 0); g.add(r);
  r.add(part(geo.ico, lam(0x8b8578), 0, 0, 0, 2.6, 2.6, 2.6));
  for (const [x, y, z, s] of [[0.5, 0.95, 0.4, 0.8], [-0.6, 0.5, 0.9, 0.7], [0.9, -0.5, -0.5, 0.65], [-0.3, -0.9, 0.5, 0.7]]) r.add(part(geo.ico, lam(0x5fa655), x, y, z, s, s * 0.45, s));
  r.add(part(geo.ico, lam(0x6e685c), -0.9, 0.2, -0.7, 0.9, 0.9, 0.9));
  r.add(part(geo.box, lam(0x4b4639), 0.1, 1.28, 0.2, 0.07, 0.5, 0.05, 0.4, 0, 0.3));
  g.userData = { rot: r, kind: 'boulder' };
  return g;
}

export function buildCoconut() {
  const g = grp();
  g.add(part(geo.sph, lam(0x6b4423), 0, 0, 0, 0.55, 0.55, 0.55));
  g.add(part(geo.sphL, lam(0x3a2412), 0.12, 0.12, -0.2, 0.07, 0.07, 0.07)); g.add(part(geo.sphL, lam(0x3a2412), -0.08, 0.16, -0.2, 0.07, 0.07, 0.07));
  return g;
}

// ====================================================================== Symbole (Power-ups, HUD): Bilder aus assets/ (Paket A1)
export const POWER_COL = { magnet: '#ef4444', shield: '#38bdf8', boost: '#f97316', x2: '#fbbf24' };
export const POWER_NAME = { magnet: 'Magnet', shield: 'Schild', boost: 'Super-Sprung', x2: 'Doppelte Punkte' };
const ICON_FILE = { magnet: 'icon-magnet.webp', shield: 'icon-schild.webp', boost: 'icon-fluegelschuh.webp', x2: 'icon-x2.webp', coin: 'icon-muenze.webp',
  heart: 'icon-herz.png', star: 'icon-stern.png', starOff: 'icon-stern-leer.png', pause: 'icon-pause.png', soundOn: 'icon-ton-an.png', soundOff: 'icon-ton-aus.png' };
export const iconUrl = (kind) => new URL('assets/' + ICON_FILE[kind], import.meta.url).href;
export function iconImg(kind, px) {                      // <img> für HUD und Meldungen, feste Größe, nie verzerrt
  const i = new Image(); i.src = iconUrl(kind); i.alt = ''; i.width = i.height = px; i.decoding = 'async'; i.draggable = false; i.setAttribute('aria-hidden', 'true'); return i;
}
const iconTex = new Map();
export function powerTexture(kind) {                     // Textur für den 3D-Pickup; füllt sich, sobald das Bild geladen ist
  if (iconTex.has(kind)) return iconTex.get(kind);
  const img = new Image(), t = new T.Texture(img);
  t.generateMipmaps = false; t.minFilter = T.LinearFilter; t.magFilter = T.LinearFilter;
  img.onload = () => { t.needsUpdate = true; };
  img.src = iconUrl(kind);
  iconTex.set(kind, t); return t;
}
