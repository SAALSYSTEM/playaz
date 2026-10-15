// ZAHLENSTURM: 3D-Darstellung mit der gemeinsamen three.js (assets/three.min.js, global THREE).
// Viele gleiche Figuren laufen über InstancedMesh (ein Zeichenaufruf), Schatten sind weiche Flecken statt Shadow-Maps.
// Das Rendering liest nur Zustand aus sim.js; Spielregeln stehen ausschließlich dort.
import { crowdHalfWidth, obstacleState, BONUS_START, BONUS_GAP, prepare } from './sim.js';
import { THEMES } from './levels.js';

const T = window.THREE;
const STUFE = 0.9;      // Höhe einer Bonus-Stufe in Metern
const CAP = 1000;       // so viele Figuren werden höchstens gezeichnet (darüber zeigt die Zahl mehr, als zu sehen ist)
const PCAP = 320;       // Partikel
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const hex = (n) => '#' + n.toString(16).padStart(6, '0');

const OP_COL = { '+': 0x2dc7ff, '×': 0x3ddc84, '-': 0xff5a5f, '÷': 0xff9f43 };

export function createRenderer(canvas, opts = {}) {
  let q = { pr: Math.min(window.devicePixelRatio || 1, 2), deco: true };
  const renderer = new T.WebGLRenderer({ canvas, antialias: opts.aa !== false, alpha: true, powerPreference: 'high-performance' });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(q.pr);
  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(58, 1, 0.3, 260);
  scene.add(new T.HemisphereLight(0xffffff, 0xb8c4d6, 0.95));
  const sun = new T.DirectionalLight(0xffffff, 0.75); sun.position.set(-4, 10, 6); scene.add(sun);

  // ------------------------------------------------------------ gemeinsame Geometrien
  const box = new T.BoxGeometry(1, 1, 1);
  const cyl = new T.CylinderGeometry(0.5, 0.5, 1, 16);
  const kegel = new T.ConeGeometry(0.5, 1, 10);
  const kugel = new T.SphereGeometry(0.5, 16, 12);
  const scheibe = new T.CircleGeometry(0.5, 14); scheibe.rotateX(-Math.PI / 2);
  const profil = [[0, 0], [0.2, 0], [0.26, 0.06], [0.27, 0.22], [0.22, 0.42], [0.16, 0.52], [0.13, 0.58], [0.2, 0.64], [0.23, 0.74], [0.2, 0.86], [0.12, 0.94], [0, 0.97]].map((p) => new T.Vector2(p[0], p[1]));
  const figGeo = new T.LatheGeometry(profil, 10);
  const matCache = new Map();
  const mat = (c, o = {}) => { const k = c + JSON.stringify(o); if (!matCache.has(k)) matCache.set(k, new T.MeshLambertMaterial({ color: c, ...o })); return matCache.get(k); };
  const basic = (c, o = {}) => new T.MeshBasicMaterial({ color: c, ...o });

  // ------------------------------------------------------------ Texturen (klein, einmal erzeugt)
  const texCache = new Map();
  function labelTex(text, farbe) {
    const k = text + '|' + farbe;
    if (texCache.has(k)) return texCache.get(k);
    const c = document.createElement('canvas'); c.width = 256; c.height = 128;
    const x = c.getContext('2d');
    x.textAlign = 'center'; x.textBaseline = 'middle';
    const gross = text.length > 4 ? 78 : text.length > 3 ? 92 : 108;
    x.font = `800 ${gross}px "Barlow Condensed","Arial Narrow",Arial,sans-serif`;
    x.lineJoin = 'round'; x.lineWidth = 14; x.strokeStyle = 'rgba(20,24,50,.55)'; x.strokeText(text, 128, 70);
    x.fillStyle = farbe || '#fff'; x.fillText(text, 128, 70);
    const t = new T.CanvasTexture(c); t.anisotropy = 4;
    texCache.set(k, t); return t;
  }
  // Zahl, die sich ändern kann (Gegner-/Boss-Zahl zählt im Kampf runter)
  function zahlTafel(w, h, farbe) {
    const c = document.createElement('canvas'); c.width = 256; c.height = Math.round(256 * h / w);
    const x = c.getContext('2d'), t = new T.CanvasTexture(c); t.anisotropy = 4;
    const m = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false }));
    let alt = null;
    m.userData.setze = (text) => {
      if (text === alt) return; alt = text;
      x.clearRect(0, 0, c.width, c.height);
      x.textAlign = 'center'; x.textBaseline = 'middle';
      x.font = `800 ${text.length > 3 ? 92 : 110}px "Barlow Condensed","Arial Narrow",Arial,sans-serif`;
      x.lineJoin = 'round'; x.lineWidth = 16; x.strokeStyle = 'rgba(20,24,50,.7)'; x.strokeText(text, c.width / 2, c.height * 0.55);
      x.fillStyle = farbe; x.fillText(text, c.width / 2, c.height * 0.55);
      t.needsUpdate = true;
    };
    keep(m.geometry); keep(m.material); keep(t);
    return m;
  }
  function gradTex(col) {
    const k = 'g' + col; if (texCache.has(k)) return texCache.get(k);
    const c = document.createElement('canvas'); c.width = 4; c.height = 64;
    const x = c.getContext('2d'), g = x.createLinearGradient(0, 0, 0, 64);
    const r = (col >> 16) & 255, gg = (col >> 8) & 255, b = col & 255;
    g.addColorStop(0, `rgba(${r},${gg},${b},.95)`); g.addColorStop(0.22, `rgba(${r},${gg},${b},.62)`); g.addColorStop(1, `rgba(${r},${gg},${b},.22)`);
    x.fillStyle = g; x.fillRect(0, 0, 4, 64);
    const t = new T.CanvasTexture(c); texCache.set(k, t); return t;
  }
  const streifen = (() => {
    const c = document.createElement('canvas'); c.width = 8; c.height = 64;
    const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, 8, 64); x.fillStyle = 'rgba(0,0,0,.075)'; x.fillRect(0, 32, 8, 32);
    const t = new T.CanvasTexture(c); t.wrapS = t.wrapT = T.RepeatWrapping; t.anisotropy = 4; return t;
  })();
  const ziel = (() => {
    const c = document.createElement('canvas'); c.width = 128; c.height = 32;
    const x = c.getContext('2d');
    for (let i = 0; i < 16; i++) for (let j = 0; j < 4; j++) { x.fillStyle = (i + j) % 2 ? '#14182e' : '#ffffff'; x.fillRect(i * 8, j * 8, 8, 8); }
    const t = new T.CanvasTexture(c); t.magFilter = T.NearestFilter; return t;
  })();

  // ------------------------------------------------------------ Level-Aufbau
  let lvl = null, th = null, grp = null, own = [];
  const gateObj = [], rungObj = [];
  let coinMesh = null, coinList = [], coinGot = [];
  let obsAnim = [];
  let squads = [], boss = null, deco = null, podium = null;
  let figMesh = null, figShadow = null, enMesh = null, enShadow = null;
  const fig = { lx: new Float32Array(CAP), lz: new Float32Array(CAP), sc: new Float32Array(CAP), vn: 0 };
  const col = new T.Color();
  let friendCol = 0x3b82f6;

  function disposeAll() {
    if (grp) scene.remove(grp);
    for (const o of own) { if (o.dispose) o.dispose(); }
    own = []; gateObj.length = 0; rungObj.length = 0; obsAnim = []; squads = []; boss = null; coinMesh = null; deco = null; podium = null;
  }
  const keep = (o) => { own.push(o); return o; };
  function add(m) { grp.add(m); return m; }
  function mesh(geo, material, x, y, z, sx, sy, sz) {
    const m = new T.Mesh(geo, material); m.position.set(x, y, z); m.scale.set(sx, sy, sz); grp.add(m); return m;
  }
  const w3 = (z) => -z;   // Sim-z → three-z

  function setLevel(level) {
    disposeAll();
    lvl = level; th = THEMES[level.theme];
    grp = new T.Group(); scene.add(grp);
    const p = prepare(level);
    const hw = level.hw, zEnd = p.ende + 40, zStart = -26;
    const len = zEnd - zStart, zMid = (zEnd + zStart) / 2;
    scene.fog = new T.Fog(th.fog, 38, 150);
    // Boden und Strecke
    const boden = mesh(box, mat(th.ground), 0, -0.9, w3(zMid), 220, 0.4, len + 80);
    const bandTex = streifen.clone(); bandTex.needsUpdate = true; bandTex.repeat.set(1, len / 5); keep(bandTex);
    const strecke = mesh(box, new T.MeshLambertMaterial({ color: th.track, map: bandTex }), 0, -0.3, w3(zMid), hw * 2 + 0.5, 0.6, len);
    keep(strecke.material);
    for (const sgn of [-1, 1]) {
      mesh(box, mat(th.rail), sgn * (hw + 0.55), 0.12, w3(zMid), 0.7, 0.8, len);
      mesh(box, mat(th.stripe), sgn * (hw + 1.6), -0.45, w3(zMid), 1.7, 0.2, len);
    }
    // Start- und Ziellinie
    mesh(box, mat(0xffffff), 0, 0.02, w3(0), hw * 2, 0.04, 0.5);
    // Dekoration links und rechts
    if (q.deco) baueDeko(level, zStart, zEnd);
    // Münzen (instanziert, drehen sich)
    coinList = p.coins; coinGot = new Uint8Array(coinList.length);
    if (coinList.length) {
      const g = new T.CylinderGeometry(0.32, 0.32, 0.1, 14); g.rotateX(Math.PI / 2);
      coinMesh = new T.InstancedMesh(g, new T.MeshLambertMaterial({ color: 0xffc928, emissive: 0x6b4a00 }), coinList.length);
      coinMesh.frustumCulled = false; coinMesh.instanceMatrix.setUsage(T.DynamicDrawUsage); grp.add(coinMesh); keep(g); keep(coinMesh.material);
    }
    // Tore
    for (const g of level.gates) baueTor(g, hw);
    // Hindernisse
    for (const o of level.obs) baueHindernis(o, hw);
    // Gegnertrupps
    let enN = 0;
    for (const e of level.enemies) { const zeig = Math.min(300, e.hp); squads.push({ e, first: enN, zeig, hp: e.hp, zs: 0.85 }); enN += zeig; }
    const bossEv = p.ev.find((v) => v.e && v.e.boss);
    if (bossEv) { const e = bossEv.e, zeig = Math.min(300, e.hp); squads.push({ e, first: enN, zeig, hp: e.hp, zs: 0.4, boss: true }); enN += zeig; }
    enMesh = new T.InstancedMesh(figGeo, new T.MeshLambertMaterial({ color: 0xffffff }), Math.max(1, enN));
    enMesh.frustumCulled = false; enMesh.instanceMatrix.setUsage(T.DynamicDrawUsage); grp.add(enMesh); keep(enMesh.material);
    for (let i = 0; i < enN; i++) { col.setHSL(0.0 + (i % 5) * 0.006, 0.72, 0.52 + (i % 3) * 0.03); enMesh.setColorAt(i, col); }
    enMesh.count = enN;
    enShadow = new T.InstancedMesh(scheibe, new T.MeshBasicMaterial({ color: 0x1c2038, transparent: true, opacity: 0.2, depthWrite: false }), Math.max(1, enN));
    enShadow.frustumCulled = false; enShadow.instanceMatrix.setUsage(T.DynamicDrawUsage); grp.add(enShadow); keep(enShadow.material); enShadow.count = enN;
    for (const s of squads) {
      const cx = (s.e.x0 + s.e.x1) / 2;
      s.cx = cx; s.cz = s.e.z + (s.boss ? 3 : 1.6); s.r = s.boss ? level.hw - 0.4 : Math.max(0.8, (s.e.x1 - s.e.x0) / 2 - 0.3);
      s.label = zahlTafel(s.boss ? 3.6 : 1.7, s.boss ? 1.8 : 0.85, s.boss ? '#ffe08a' : '#ffffff');
      s.label.position.set(cx, s.boss ? 8.6 : 2.4, w3(s.boss ? s.e.z + 7 : s.cz)); grp.add(s.label); s.label.userData.setze(String(s.e.hp));
    }
    // Boss
    baueBoss(level);
    // Bonus-Treppe und Podest
    baueBonus(level, p);
    // eigene Spielfigur-Meshes (einmal je Level, damit Farbe/Kapazität stimmen)
    if (!figMesh) {
      figMesh = new T.InstancedMesh(figGeo, new T.MeshLambertMaterial({ color: 0xffffff }), CAP);
      figMesh.frustumCulled = false; figMesh.instanceMatrix.setUsage(T.DynamicDrawUsage); scene.add(figMesh);
      figShadow = new T.InstancedMesh(scheibe, new T.MeshBasicMaterial({ color: 0x1c2038, transparent: true, opacity: 0.22, depthWrite: false }), CAP);
      figShadow.frustumCulled = false; figShadow.instanceMatrix.setUsage(T.DynamicDrawUsage); scene.add(figShadow);
      faerbeFiguren();
    }
    fig.vn = 0; fig.sc.fill(0);
    kamera.t = 0;
    document.body.style.setProperty('--himmel0', hex(th.sky[0])); document.body.style.setProperty('--himmel1', hex(th.sky[1]));
  }

  function baueDeko(level, zStart, zEnd) {
    const hw = level.hw, n = 90;
    const rnd = (() => { let s = 1234 + level.id * 77; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); })();
    const stamm = new T.InstancedMesh(cyl, mat(0xffffff), n), kopf = new T.InstancedMesh(level.theme === 'eis' ? kegel : kugel, mat(0xffffff), n);
    const m = new T.Matrix4(), c = new T.Color(); const pal = {
      wiese: [[0x8b5a2b, 0x3fae49], [0x8b5a2b, 0x57c75a], [0x8b5a2b, 0x2f9a58]],
      wueste: [[0xfff4e0, 0xff7aa8], [0xfff4e0, 0xffd34d], [0xfff4e0, 0x63d6c5]],
      eis: [[0xcdeefa, 0x8fdcff], [0xcdeefa, 0xb6e8ff], [0xcdeefa, 0x6cc7f0]],
      zirkus: [[0xfff4e0, 0xff5db1], [0xfff4e0, 0xffd34d], [0xfff4e0, 0x5ee0ff]]
    }[level.theme];
    for (let i = 0; i < n; i++) {
      const sgn = i % 2 ? 1 : -1, x = sgn * (hw + 3.2 + rnd() * 14), z = zStart + rnd() * (zEnd - zStart), h = 1.6 + rnd() * 2.4, r = 0.9 + rnd() * 0.8;
      const pc = pal[(rnd() * pal.length) | 0];
      m.makeScale(0.22, h, 0.22); m.setPosition(x, h / 2 - 0.7, w3(z)); stamm.setMatrixAt(i, m); stamm.setColorAt(i, c.setHex(pc[0]));
      if (level.theme === 'eis') { m.makeScale(r * 0.9, h * 1.3, r * 0.9); m.setPosition(x, h * 1.0 - 0.7, w3(z)); }
      else { m.makeScale(r * 1.7, r * 1.5, r * 1.7); m.setPosition(x, h - 0.2, w3(z)); }
      kopf.setMatrixAt(i, m); kopf.setColorAt(i, c.setHex(pc[1]));
    }
    stamm.frustumCulled = kopf.frustumCulled = false;
    if (level.theme === 'eis') stamm.visible = false;
    grp.add(stamm, kopf); deco = { stamm, kopf };
  }

  function label(text, x, y, z, w, h, farbe) {
    const m = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({ map: labelTex(text, farbe), transparent: true, depthWrite: false }));
    m.position.set(x, y, z); grp.add(m); keep(m.geometry); keep(m.material); return m;
  }

  function baueTor(g, hw) {
    const row = { z: g.z, panels: [], t: 99 };
    for (const q2 of g.panels) {
      const w = q2.x1 - q2.x0, cx = (q2.x0 + q2.x1) / 2, c = OP_COL[q2.op] || 0xffffff;
      const planeGeo = new T.PlaneGeometry(w - 0.12, 3.2);
      const planeMat = new T.MeshBasicMaterial({ map: gradTex(c), transparent: true, depthWrite: false, side: T.DoubleSide });
      const pl = new T.Mesh(planeGeo, planeMat); pl.position.set(cx, 1.6, w3(g.z)); grp.add(pl); keep(planeGeo); keep(planeMat);
      const bar = mesh(box, basic(c), cx, 3.22, w3(g.z), w - 0.12, 0.14, 0.14);
      const txt = (q2.op === '-' ? '−' : q2.op) + q2.v;
      const lb = label(txt, cx, 1.75, w3(g.z) + 0.05, Math.min(w - 0.5, 2.6), Math.min(w - 0.5, 2.6) / 2, '#ffffff');
      row.panels.push({ pl, bar, lb, base: lb.scale.x, cx });
    }
    const x0 = g.panels[0].x0, x1 = g.panels[g.panels.length - 1].x1;
    for (const xs of g.panels.map((q2) => q2.x0).concat([x1])) mesh(cyl, mat(0x4a4f7a), xs, 1.7, w3(g.z), 0.16, 3.4, 0.16);
    gateObj.push(row);
  }

  function baueHindernis(o, hw) {
    const z = w3(o.z), rot = 0xff5d73, dunkel = 0x2b2748;
    switch (o.type) {
      case 'wall': {
        const w = o.x1 - o.x0;
        const m = mesh(box, mat(rot), (o.x0 + o.x1) / 2, 0.8, z, w, 1.6, 0.9);
        mesh(box, mat(0xffe08a), (o.x0 + o.x1) / 2, 1.66, z, w, 0.14, 0.95);
        break;
      }
      case 'spikes': {
        const w = o.x1 - o.x0, nx = Math.max(2, Math.round(w / 0.8)), nz = 2;
        const im = new T.InstancedMesh(kegel, mat(0xc9ced9), nx * nz); im.frustumCulled = false; const mm = new T.Matrix4();
        let k = 0; for (let a = 0; a < nx; a++) for (let b = 0; b < nz; b++) { mm.makeScale(0.5, 0.9, 0.5); mm.setPosition(o.x0 + (a + 0.5) * (w / nx), 0.45, z + (b - 0.5) * 0.7); im.setMatrixAt(k++, mm); }
        grp.add(im); mesh(box, mat(dunkel), (o.x0 + o.x1) / 2, 0.04, z, w + 0.2, 0.08, 1.8); break;
      }
      case 'pit': {
        const w = o.x1 - o.x0;
        mesh(box, mat(dunkel), (o.x0 + o.x1) / 2, 0.03, z, w, 0.08, 2.8);
        mesh(box, mat(0x14122a), (o.x0 + o.x1) / 2, 0.08, z, w - 0.5, 0.04, 2.3);
        break;
      }
      case 'mover': {
        const m = mesh(box, mat(rot), o.cx, 0.9, z, o.half * 2, 1.8, 0.9);
        const top = mesh(box, mat(0xffe08a), o.cx, 1.86, z, o.half * 2, 0.14, 0.95);
        obsAnim.push({ o, m, top }); break;
      }
      case 'rotor': {
        const g = new T.Group(); g.position.set(o.cx, 0, z);
        const stange = new T.Mesh(cyl, mat(0x4a4f7a)); stange.scale.set(0.5, 1.5, 0.5); stange.position.y = 0.75;
        const arm = new T.Mesh(box, mat(rot)); arm.scale.set(o.len, 0.5, 0.5); arm.position.y = 1.05;
        const spitzeL = new T.Mesh(kugel, mat(0xffe08a)); spitzeL.scale.set(0.9, 0.9, 0.9); spitzeL.position.set(-o.len / 2, 1.05, 0);
        const spitzeR = spitzeL.clone(); spitzeR.position.x = o.len / 2;
        const piv = new T.Group(); piv.add(arm, spitzeL, spitzeR); g.add(stange, piv); grp.add(g); obsAnim.push({ o, g, arm: piv }); break;
      }
      case 'plat': {
        mesh(box, mat(dunkel), 0, 0.03, z, hw * 2, 0.08, 3.2);
        mesh(box, mat(0x14122a), 0, 0.08, z, hw * 2 - 0.4, 0.04, 2.7);
        const m = mesh(box, mat(0x5ee0a0), o.cx, 0.12, z, o.pw * 2, 0.3, 2.6);
        mesh(box, mat(0xffffff), o.cx, 0.3, z, o.pw * 2 - 0.4, 0.04, 2.2);
        obsAnim.push({ o, m, mm: grp.children[grp.children.length - 1] }); break;
      }
    }
  }

  function baueBoss(level) {
    const b = level.boss, z = w3(b.z + 7);
    const g = new T.Group(); g.position.set(0, 0, z);
    const farbe = [0x7c3aed, 0xdb2777, 0x0ea5e9, 0xf59e0b][['wiese', 'wueste', 'eis', 'zirkus'].indexOf(level.theme)];
    const koerper = new T.Mesh(kugel, mat(farbe)); koerper.scale.set(4.6, 4.2, 4.2); koerper.position.y = 2.1;
    const bauch = new T.Mesh(kugel, mat(0xffffff)); bauch.scale.set(2.6, 2.2, 1); bauch.position.set(0, 1.7, 1.75);
    const augeL = new T.Mesh(kugel, mat(0xffffff)), augeR = new T.Mesh(kugel, mat(0xffffff));
    augeL.scale.set(0.95, 1.15, 0.5); augeR.scale.copy(augeL.scale); augeL.position.set(-0.9, 3.0, 1.95); augeR.position.set(0.9, 3.0, 1.95);
    const pupL = new T.Mesh(kugel, mat(0x14182e)), pupR = new T.Mesh(kugel, mat(0x14182e)); pupL.scale.set(0.45, 0.55, 0.3); pupR.scale.copy(pupL.scale);
    pupL.position.set(-0.9, 2.95, 2.25); pupR.position.set(0.9, 2.95, 2.25);
    const hornL = new T.Mesh(kegel, mat(0xffe08a)), hornR = new T.Mesh(kegel, mat(0xffe08a)); hornL.scale.set(0.9, 1.7, 0.9); hornR.scale.copy(hornL.scale);
    hornL.position.set(-1.6, 4.5, 0); hornR.position.set(1.6, 4.5, 0); hornL.rotation.z = 0.35; hornR.rotation.z = -0.35;
    const mund = new T.Mesh(box, mat(0x14182e)); mund.scale.set(1.6, 0.3, 0.2); mund.position.set(0, 1.75, 2.1);
    g.add(koerper, bauch, augeL, augeR, pupL, pupR, hornL, hornR, mund);
    grp.add(g);
    const sh = new T.Mesh(scheibe, new T.MeshBasicMaterial({ color: 0x1c2038, transparent: true, opacity: 0.25, depthWrite: false })); sh.scale.set(6, 1, 5.5); sh.position.set(0, 0.03, 0); g.add(sh);
    keep(sh.material);
    boss = { g, koerper, pupL, pupR, baseY: 0, z: b.z + 7, hp0: b.hp, tot: 0 };
    // Zielbogen
    mesh(box, mat(0x14182e), -level.hw - 0.6, 3, w3(b.z + 12), 0.5, 6, 0.5);
    mesh(box, mat(0x14182e), level.hw + 0.6, 3, w3(b.z + 12), 0.5, 6, 0.5);
    const banner = new T.Mesh(new T.PlaneGeometry(level.hw * 2 + 1.7, 1.2), new T.MeshBasicMaterial({ map: ziel, side: T.DoubleSide }));
    banner.position.set(0, 5.9, w3(b.z + 12)); grp.add(banner); keep(banner.geometry); keep(banner.material);
  }

  function hoeheBonus(z) {
    if (!lvl || !lvl.bonus || !lvl.bonus.length) return 0;
    const z0 = lvl.boss.z + BONUS_START;
    let h = 0;
    for (let i = 0; i < lvl.bonus.length; i++) {
      const zr = z0 + i * BONUS_GAP, hi = STUFE * (i + 1);
      if (z >= zr - 2) h = hi; else if (z > zr - 3.2) { h = lerp(STUFE * i, hi, (z - (zr - 3.2)) / 1.2); break; } else break;
    }
    return h;
  }

  function baueBonus(level, p) {
    const hw = level.hw;
    p.rungs.forEach((r, i) => {
      const hi = STUFE * (i + 1), zs = r.z - 2, ze = i === p.rungs.length - 1 ? p.ende + 30 : p.rungs[i + 1].z - 2;
      const stufe = mesh(box, mat(i % 2 ? 0xffa63d : 0xffd23f), 0, hi / 2 - 0.02, w3((zs + ze) / 2), hw * 2 + 0.4, hi, ze - zs);
      const row = [];
      for (const l of r.lanes) {
        const w = l.x1 - l.x0, cx = (l.x0 + l.x1) / 2;
        const c = l.m >= 8 ? 0xffc928 : l.m >= 5 ? 0xff9f43 : l.m >= 3 ? 0x3ddc84 : 0x2dc7ff;
        const gm = new T.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.5 });
        const flach = new T.Mesh(new T.PlaneGeometry(w - 0.1, 3.4), gm); flach.rotation.x = -Math.PI / 2; flach.position.set(cx, hi + 0.03, w3(r.z)); grp.add(flach); keep(flach.geometry); keep(gm);
        const lb = label('×' + l.m, cx, hi + 1.5, w3(r.z) - 1.2, Math.min(w - 0.4, 2.4), Math.min(w - 0.4, 2.4) / 2, '#ffffff');
        row.push({ flach, lb });
      }
      rungObj.push({ z: r.z, row });
    });
    // Podest am Ende
    if (p.rungs.length) {
      const hTop = STUFE * p.rungs.length, zp = p.ende - 6;
      const g = new T.Group(); g.position.set(0, hTop, w3(zp));
      const sockel = new T.Mesh(cyl, mat(0xffc928)); sockel.scale.set(5, 1.2, 5); sockel.position.y = 0.6;
      const stern = new T.Mesh(new T.OctahedronGeometry(0.8), mat(0xffd84d, { emissive: 0x7a5200 })); stern.position.y = 2.6; keep(stern.geometry);
      g.add(sockel, stern); grp.add(g); podium = { g, stern };
    }
  }

  // ------------------------------------------------------------ Figuren / Partikel / Kamera
  function faerbeFiguren() {
    if (!figMesh) return;
    for (let i = 0; i < CAP; i++) { col.setHex(friendCol); col.offsetHSL(((i * 37) % 11 - 5) * 0.004, 0, ((i * 53) % 7 - 3) * 0.012); figMesh.setColorAt(i, col); }
    figMesh.instanceColor.needsUpdate = true;
  }
  function setFarbe(c) { friendCol = c; faerbeFiguren(); }

  const par = { x: new Float32Array(PCAP * 3), v: new Float32Array(PCAP * 3), l: new Float32Array(PCAP), s: new Float32Array(PCAP), n: 0 };
  const parMesh = new T.InstancedMesh(new T.OctahedronGeometry(0.13), new T.MeshBasicMaterial({ color: 0xffffff }), PCAP);
  parMesh.frustumCulled = false; parMesh.instanceMatrix.setUsage(T.DynamicDrawUsage); scene.add(parMesh);
  for (let i = 0; i < PCAP; i++) parMesh.setColorAt(i, col.setHex(0xffffff));
  parMesh.count = 0;
  let pNext = 0;
  function burst(x, y, z, n, c, kraft = 3, hoch = 3, gr = 1) {
    col.setHex(c);
    for (let i = 0; i < n; i++) {
      const k = pNext; pNext = (pNext + 1) % PCAP;
      par.x[k * 3] = x; par.x[k * 3 + 1] = y; par.x[k * 3 + 2] = z;
      const a = Math.random() * Math.PI * 2, r = Math.random() * kraft;
      par.v[k * 3] = Math.cos(a) * r; par.v[k * 3 + 1] = hoch * (0.5 + Math.random()); par.v[k * 3 + 2] = Math.sin(a) * r;
      par.l[k] = 0.5 + Math.random() * 0.5; par.s[k] = gr * (0.7 + Math.random() * 0.8);
      parMesh.setColorAt(k, col);
    }
    parMesh.instanceColor.needsUpdate = true; par.n = PCAP;
  }

  const kamera = { t: 0, x: 0, shake: 0, zoom: 0, y: 0 };
  const view = { cx: 0, cz: 0, n: 1, w: 0.7 };
  let fightRef = null, tSek = 0, laufend = true;

  function resize(w, h) {
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.userData.hoch = h > w;
    camera.updateProjectionMatrix();
  }
  function setQuality(pr) { q.pr = pr; renderer.setPixelRatio(pr); resize(canvas.clientWidth || 1, canvas.clientHeight || 1); }

  const _m = new T.Matrix4(), _id = { s: new T.Vector3(), p: new T.Vector3() };
  function setMat(arr, i, x, y, z, sx, sy, sz) {
    const o = i * 16;
    arr[o] = sx; arr[o + 1] = 0; arr[o + 2] = 0; arr[o + 3] = 0;
    arr[o + 4] = 0; arr[o + 5] = sy; arr[o + 6] = 0; arr[o + 7] = 0;
    arr[o + 8] = 0; arr[o + 9] = 0; arr[o + 10] = sz; arr[o + 11] = 0;
    arr[o + 12] = x; arr[o + 13] = y; arr[o + 14] = z; arr[o + 15] = 1;
  }

  // Zustand zeichnen. st = Sim-Zustand (mit interpolierter Position x, z), dt in Sekunden
  function frame(st, dt) {
    tSek += dt;
    const hw = lvl.hw, n = st.n;
    const w = crowdHalfWidth(Math.max(1, n));
    view.cx = st.x; view.cz = st.z; view.n = n; view.w = w;
    const yy = hoeheBonus(st.z);
    // ---- Gruppe
    const vn = Math.min(n, CAP);
    const arr = figMesh.instanceMatrix.array, sarr = figShadow.instanceMatrix.array;
    if (vn > fig.vn) for (let j = fig.vn; j < vn; j++) { fig.lx[j] = (Math.random() - 0.5) * 0.4; fig.lz[j] = (Math.random() - 0.5) * 0.4; fig.sc[j] = 0; }
    else if (vn < fig.vn) {
      const weg = fig.vn - vn, puffs = Math.min(18, weg);
      for (let k = 0; k < puffs; k++) { const j = vn + Math.floor((k / puffs) * weg); burst(st.x + fig.lx[j], yy + 0.4, w3(st.z) + fig.lz[j], 2, friendCol, 1.6, 2.6, 0.9); }
    }
    fig.vn = vn;
    const GOLD = 2.399963, rad = Math.max(0.2, w - 0.22), dichte = n > CAP ? 0.62 : clamp(1 - (n / 260) * 0.28, 0.7, 1);
    const rate = Math.min(1, dt * 11), run = laufend && st.phase !== 'fight' && st.phase !== 'won' && st.phase !== 'lost';
    for (let j = 0; j < vn; j++) {
      const r = rad * Math.sqrt((j + 0.5) / vn), a = j * GOLD;
      const tx = Math.cos(a) * r, tz = Math.sin(a) * r * 0.85;
      fig.lx[j] += (tx - fig.lx[j]) * rate; fig.lz[j] += (tz - fig.lz[j]) * rate;
      fig.sc[j] = Math.min(1, fig.sc[j] + dt * 5);
      const bob = run ? Math.abs(Math.sin(tSek * 13 + j * 0.9)) * 0.16 : (st.phase === 'fight' ? Math.abs(Math.sin(tSek * 22 + j)) * 0.12 : 0);
      const e = fig.sc[j], s = 0.62 * dichte * e;
      const X = st.x + fig.lx[j], Z = w3(st.z) + fig.lz[j];
      setMat(arr, j, X, yy + bob, Z, s, s * (1 + bob * 0.5), s);
      setMat(sarr, j, X, yy + 0.03, Z, 0.46 * dichte * e * (1 - bob * 1.2), 1, 0.46 * dichte * e * (1 - bob * 1.2));
    }
    figMesh.count = vn; figShadow.count = vn;
    figMesh.instanceMatrix.needsUpdate = true; figShadow.instanceMatrix.needsUpdate = true;
    if (figMesh.instanceColor) figMesh.instanceColor.needsUpdate = false;

    // ---- Münzen
    if (coinMesh) {
      const a = coinMesh.instanceMatrix.array;
      for (let i = 0; i < coinList.length; i++) {
        const c = coinList[i], s = coinGot[i] ? 0.0001 : 1, rot = tSek * 3 + i, bob = Math.sin(tSek * 4 + i) * 0.1;
        const cs = Math.cos(rot) * s, sn = Math.sin(rot) * s, o = i * 16;
        a[o] = cs; a[o + 1] = 0; a[o + 2] = -sn; a[o + 3] = 0; a[o + 4] = 0; a[o + 5] = s; a[o + 6] = 0; a[o + 7] = 0;
        a[o + 8] = sn; a[o + 9] = 0; a[o + 10] = cs; a[o + 11] = 0; a[o + 12] = c.x; a[o + 13] = 0.75 + bob; a[o + 14] = w3(c.z); a[o + 15] = 1;
      }
      coinMesh.instanceMatrix.needsUpdate = true;
    }
    // ---- bewegliche Hindernisse
    for (const a of obsAnim) {
      const s = obstacleState(a.o, st.t * (1 / 60));
      if (a.o.type === 'mover') { a.m.position.x = s.x; a.top.position.x = s.x; }
      else if (a.o.type === 'rotor') { a.arm.rotation.y = -s.winkel; }
      else if (a.o.type === 'plat') { a.m.position.x = s.x; if (a.mm) a.mm.position.x = s.x; }
    }
    // ---- Tore: Aufleuchten abklingen lassen
    for (const row of gateObj) {
      if (row.t < 1) {
        row.t = Math.min(1, row.t + dt * 2.6);
        for (const p of row.panels) {
          const hit = p === row.gewaehlt, k = row.t;
          p.lb.scale.setScalar(hit ? p.base ? 1 + Math.sin(k * Math.PI) * 0.35 : 1 : 1);
          p.pl.material.opacity = hit ? 1 - k * 0.7 : 1 - k * 0.6; p.lb.material.opacity = 1 - k * 0.8; p.bar.material.opacity = 1;
        }
      }
    }
    for (const sq of squads) {
      const vis = fightRef && fightRef.ev === sq.e ? Math.max(0, Math.ceil((fightRef.hp / sq.e.hp) * sq.zeig)) : sq.gebesiegt ? 0 : sq.zeig;
      sq.vis = vis;
      const zahl = fightRef && fightRef.ev === sq.e ? Math.max(0, Math.ceil(fightRef.hp)) : sq.gebesiegt ? 0 : sq.e.hp;
      if (sq.label) { sq.label.visible = zahl > 0; sq.label.userData.setze(String(zahl)); }
    }
    // ---- Gegner
    if (enMesh && squads.length) {
      const a = enMesh.instanceMatrix.array, sa = enShadow.instanceMatrix.array;
      for (const sq of squads) {
        const nahe = Math.abs(sq.cz - st.z) < 40, kampf = fightRef && fightRef.ev === sq.e;
        for (let i = 0; i < sq.zeig; i++) {
          const o = sq.first + i;
          if (i >= sq.vis) { setMat(a, o, 0, -5, 0, 0.0001, 0.0001, 0.0001); setMat(sa, o, 0, -5, 0, 0.0001, 1, 0.0001); continue; }
          const r = sq.r * Math.sqrt((i + 0.5) / Math.max(1, sq.zeig)), ang = i * 2.399963;
          let X = sq.cx + Math.cos(ang) * r, Z = w3(sq.cz) + Math.sin(ang) * r * sq.zs;
          const bob = nahe ? Math.abs(Math.sin(tSek * (kampf ? 20 : 8) + i)) * (kampf ? 0.2 : 0.1) : 0;
          if (kampf) Z += 1.6 - Math.sin(tSek * 12 + i) * 0.35 - (1 - 1) * 0;
          setMat(a, o, X, bob, Z, 0.66, 0.66, 0.66); setMat(sa, o, X, 0.03, Z, 0.5, 1, 0.5);
        }
      }
      enMesh.instanceMatrix.needsUpdate = true; enShadow.instanceMatrix.needsUpdate = true;
    }
    // ---- Boss
    if (boss) {
      const kampf = fightRef && fightRef.ev && fightRef.ev.boss;
      const bz = boss.z;
      boss.g.position.y = boss.verloren ? Math.max(-6, boss.g.position.y - dt * 6) : (kampf ? Math.sin(tSek * 14) * 0.12 : Math.sin(tSek * 2.4) * 0.12);
      const sc = boss.verloren ? Math.max(0.01, boss.g.scale.x - dt * 1.6) : 1;
      boss.g.scale.setScalar(sc);
      boss.g.rotation.y = Math.sin(tSek * 1.4) * 0.12;
      const px = clamp(st.x * 0.12, -0.18, 0.18); boss.pupL.position.x = -0.9 + px; boss.pupR.position.x = 0.9 + px;
      if (kampf) boss.g.position.z = w3(bz) + Math.sin(tSek * 10) * 0.12; else boss.g.position.z = w3(bz);
    }
    if (podium) { podium.stern.rotation.y += dt * 2; podium.stern.position.y = 2.6 + Math.sin(tSek * 3) * 0.2; }
    // ---- Partikel
    if (par.n) {
      const a = parMesh.instanceMatrix.array; let lebend = 0;
      for (let k = 0; k < PCAP; k++) {
        if (par.l[k] > 0) {
          par.l[k] -= dt; par.v[k * 3 + 1] -= 9 * dt;
          par.x[k * 3] += par.v[k * 3] * dt; par.x[k * 3 + 1] = Math.max(0.05, par.x[k * 3 + 1] + par.v[k * 3 + 1] * dt); par.x[k * 3 + 2] += par.v[k * 3 + 2] * dt;
          const s = Math.max(0.001, par.l[k] > 0.15 ? par.s[k] : par.s[k] * par.l[k] / 0.15);
          setMat(a, k, par.x[k * 3], par.x[k * 3 + 1], par.x[k * 3 + 2], s, s, s); lebend++;
        } else setMat(a, k, 0, -9, 0, 0.0001, 0.0001, 0.0001);
      }
      parMesh.instanceMatrix.needsUpdate = true; parMesh.count = PCAP; if (!lebend) par.n = 0;
    }
    // ---- Kamera
    kameraSetzen(st, dt, yy);
    renderer.render(scene, camera);
  }

  function kameraSetzen(st, dt, yy) {
    const hoch = camera.userData.hoch, hw = lvl.hw;
    const w = view.w, z3 = w3(st.z);
    kamera.t += dt;
    const ein = 1 - Math.pow(1 - Math.min(1, kamera.t / 1.1), 3);          // Anflug beim Levelstart
    const bossNah = lvl.boss ? clamp((st.z - (lvl.boss.z - 40)) / 26, 0, 1) : 0;
    const kampf = fightRef && fightRef.ev && fightRef.ev.boss ? 1 : 0;
    const bonus = st.phase === 'bonus' || st.phase === 'won' ? 1 : 0;
    kamera.zoom += ((bossNah * 0.5 + kampf * 0.6 + bonus * 0.3) - kamera.zoom) * Math.min(1, dt * 3);
    const dist = (hoch ? 12.5 : 10) + w * 1.6 - kamera.zoom * 2.2 + (1 - ein) * 7;
    const hohe = (hoch ? 10.2 : 8.2) + w * 0.9 - kamera.zoom * 1.4 + (1 - ein) * 6;
    const fov = hoch ? 62 : 52;
    if (camera.fov !== fov) { camera.fov = fov; camera.updateProjectionMatrix(); }
    kamera.x += (st.x * 0.55 - kamera.x) * Math.min(1, dt * 6);
    kamera.y += (yy - kamera.y) * Math.min(1, dt * 5);
    const sh = kamera.shake; kamera.shake = Math.max(0, kamera.shake - dt * 2.2);
    const jx = (Math.random() - 0.5) * sh * 0.6, jy = (Math.random() - 0.5) * sh * 0.4;
    camera.position.set(kamera.x + jx, hohe + kamera.y + jy, z3 + dist);
    camera.lookAt(kamera.x * 0.7, kamera.y + 0.2, z3 - (hoch ? 12 : 14) + kamera.zoom * 3);
    camera.updateMatrixWorld();
  }

  const _v = new T.Vector3();
  function project(x, y, z) {
    _v.set(x, y, w3(z)).project(camera);
    return { x: (_v.x * 0.5 + 0.5) * (canvas.clientWidth || 1), y: (-_v.y * 0.5 + 0.5) * (canvas.clientHeight || 1), ok: _v.z < 1 };
  }

  // ---------- Ereignisse aus der Simulation
  const fx = {
    coin(x, z) { for (let i = 0; i < coinList.length; i++) if (!coinGot[i] && coinList[i].x === x && coinList[i].z === z) { coinGot[i] = 1; break; } burst(x, 1, w3(z), 6, 0xffd84d, 1.8, 3.2, 0.9); },
    gate(z, panel, vor, nach) {
      const row = gateObj.find((r) => r.z === z); if (!row) return;
      row.t = 0; row.gewaehlt = row.panels[panel];
      const c = nach >= vor ? 0x7dffb0 : 0xff6b6b;
      burst(row.panels[panel].cx, 1.6, w3(z), nach >= vor ? 14 : 10, c, 2.6, 3.4, 1);
      if (nach < vor) kamera.shake = Math.max(kamera.shake, 0.5);
    },
    hit(type, x, z, loss) { burst(x, 0.7, w3(z), clamp(Math.round(loss / 3) + 4, 4, 22), 0xff5d73, 2.4, 3, 1); kamera.shake = Math.max(kamera.shake, clamp(loss / 40, 0.35, 1.1)); },
    kampfStart(f) { fightRef = f; },
    kampf(f) { fightRef = f; if (Math.random() < 0.4) burst(view.cx + (Math.random() - 0.5) * 2, 0.9, w3(view.cz) - 1.2, 2, 0xffffff, 1.6, 2.2, 0.8); kamera.shake = Math.max(kamera.shake, 0.18); },
    sieg(boss2, z) {
      const f = fightRef; fightRef = null;
      if (f) for (const sq of squads) if (sq.e === f.ev) sq.gebesiegt = true;
      for (let k = 0; k < 5; k++) burst(view.cx + (Math.random() - 0.5) * 3, 1.5, w3(z) - 2, 14, [0xffd84d, 0xff5d73, 0x5ee0ff, 0x7dffb0][k % 4], 4, 5, 1.2);
      if (boss2 && boss) boss.verloren = true;
      kamera.shake = 0.6;
    },
    sprosse(z, m) { burst(view.cx, hoeheBonus(z) + 1, w3(z), 12, m >= 5 ? 0xffd84d : 0x5ee0ff, 2.6, 3.6, 1); },
    konfetti() { for (let k = 0; k < 12; k++) burst(view.cx + (Math.random() - 0.5) * 6, hoeheBonus(view.cz) + 3, w3(view.cz) - 3, 14, [0xffd84d, 0xff5d73, 0x5ee0ff, 0x7dffb0, 0xff9f43][k % 5], 5, 7, 1.3); },
    verloren() { burst(view.cx, 1, w3(view.cz), 24, friendCol, 3, 4, 1.2); kamera.shake = 1; }
  };
  const getFightRef = () => fightRef;

  function setLaufend(b) { laufend = b; }
  function reset() { fightRef = null; kamera.t = 0; kamera.shake = 0; kamera.zoom = 0; kamera.x = 0; kamera.y = 0; if (boss) { boss.verloren = false; boss.g.scale.setScalar(1); boss.g.position.y = 0; } for (const s of squads) s.gebesiegt = false; for (const r of gateObj) r.t = 99; if (coinGot) coinGot.fill(0); fig.vn = 0; fig.sc.fill(0); for (const r of gateObj) for (const p of r.panels) { p.pl.material.opacity = 1; p.lb.material.opacity = 1; p.lb.scale.setScalar(1); } par.l.fill(0); }
  function bossPos() { return boss ? boss.z : 0; }
  function info() { const i = renderer.info; return { calls: i.render.calls, tris: i.render.triangles, geos: i.memory.geometries, tex: i.memory.textures }; }
  function dispose() { disposeAll(); renderer.dispose(); }

  return { setLevel, frame, resize, setQuality, project, fx, setFarbe, setLaufend, reset, info, dispose, getFightRef, bossPos, camera, scene, view,
    get quality() { return q; }, set deco(v) { q.deco = v; }, labelTex };
}
