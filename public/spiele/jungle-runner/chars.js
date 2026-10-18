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

// ====================================================================== Spielfigur (Sprites)
// Junge und Mädchen sind flache Bilder (je 6 Posen), die zur Kamera zeigen: im Lauf von hinten, in Menü/Figurenwahl/Garage von vorn.
// Kein Skelett, keine Outfits. Der Fußpunkt der Bilder liegt bei y = 496 von 512 und wird auf y = 0 gesetzt, damit die Trefferflächen passen.
const SPR_NAME = { boy: 'junge', girl: 'maedchen' };
const SPR_POSEN = ['hinten-lauf-a', 'hinten-lauf-b', 'hinten-sprung', 'hinten-ducken', 'hinten-getroffen', 'vorn-jubel'];
const SPR_H = 1.92, SPR_FUSS = (16 / 512) * SPR_H;          // Kantenlänge des Bildes in m (Figur ≈ 1,5 m hoch) und Abstand Fuß–Unterkante
export const spriteUrl = (kind, pose) => new URL('assets/sprites/' + SPR_NAME[kind] + '-' + pose + '.png', import.meta.url).href;
const sprMat = new Map();
const spriteMat = (kind, pose) => {
  const k = kind + pose; if (sprMat.has(k)) return sprMat.get(k);
  const img = new Image(), t = new T.Texture(img); t.anisotropy = 4;
  const p = new Promise((ok) => { img.onload = () => { t.needsUpdate = true; ok(); }; img.onerror = () => ok(); });
  img.src = spriteUrl(kind, pose);
  const m = { mat: new T.MeshBasicMaterial({ map: t, alphaTest: 0.5 }), p }; sprMat.set(k, m); return m;
};
export const spritesReady = () => Promise.all(['boy', 'girl'].flatMap((k) => SPR_POSEN.map((p) => spriteMat(k, p).p)));
const sprGeo = new T.PlaneGeometry(SPR_H, SPR_H).translate(0, SPR_H / 2 - SPR_FUSS, 0);
export function buildChar(kind) {
  const girl = kind === 'girl', root = grp(), tilt = grp(); root.add(tilt);
  const mesh = new T.Mesh(sprGeo, spriteMat(kind, 'hinten-lauf-a').mat); tilt.add(mesh);
  const shadow = part(new T.CircleGeometry(0.5, 16), new T.MeshBasicMaterial({ color: 0x0b2a10, transparent: true, opacity: 0.28, depthWrite: false }), 0, 0.02, 0, 0.8, 0.8, 0.8, -Math.PI / 2);
  return { kind, root, tilt, mesh, shadow, girl };
}
// m: { mode, ph (Laufphase), lane (−1…1, Richtung des Spurwechsels), t (Zeit), view: 'play' | 'stage' }
export function poseChar(c, m) {
  const stage = m.view === 'stage', s = Math.sin(m.ph);
  let pose = 'hinten-lauf-a', bob = 0, roll = 0;
  switch (m.mode) {
    case 'jump': case 'fall': pose = 'hinten-sprung'; roll = -m.lane * 0.15; break;
    case 'slide': case 'lose': pose = 'hinten-ducken'; break;
    case 'stun': pose = 'hinten-getroffen'; roll = Math.sin(m.t * 38) * 0.1; break;
    case 'cheer': pose = 'vorn-jubel'; bob = Math.abs(Math.sin(m.t * 6.5)) * 0.16; roll = Math.sin(m.t * 6.5) * 0.05; break;
    case 'idle': case 'wave': pose = stage ? 'vorn-jubel' : 'hinten-lauf-a'; bob = Math.sin(m.t * 2) * 0.01; roll = Math.sin(m.t * 1.4) * 0.03; break;
    default: pose = s >= 0 ? 'hinten-lauf-a' : 'hinten-lauf-b'; bob = Math.abs(Math.cos(m.ph)) * 0.07; roll = -m.lane * 0.2 + s * 0.04;
  }
  if (stage) pose = 'vorn-jubel';
  c.mesh.material = spriteMat(c.kind, pose).mat;
  c.mesh.rotation.y = stage && pose === 'vorn-jubel' ? Math.PI : 0;        // von vorn gezeigt: Bild zur −z-Seite drehen (Kamera der Bühne steht dort)
  c.tilt.position.y = bob; c.tilt.rotation.z = roll;
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
