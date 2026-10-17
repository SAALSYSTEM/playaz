// JUNGLE RUNNER: 3D-Darstellung mit der gemeinsamen three.js (assets/three.min.js, global THREE).
// Liest nur Zustand aus sim.js; Spielregeln stehen ausschließlich dort. Alle Modelle sind vorläufige prozedurale Low-Poly-Platzhalter.
import { laneX, groundH, dynPos, monkeyX, gateBottom, COCO_FALL, FALL_Y } from './sim.js';
import { WORLDS } from './levels.js';
import { buildChunk, CH, worldFor } from './world.js';
import { MB, G, hash3, shade, hexs } from './geo.js';
import * as C from './chars.js';

const T = window.THREE;
export const VIEW = 84;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const lowerZ = (arr, z) => { let a = 0, b = arr.length; while (a < b) { const m = (a + b) >> 1; if (arr[m].z < z) a = m + 1; else b = m; } return a; };

export function createRenderer(canvas, opts = {}) {
  const q = { pr: Math.min(window.devicePixelRatio || 1, 2), deco: 1 };
  const renderer = new T.WebGLRenderer({ canvas, antialias: opts.aa !== false, alpha: true, powerPreference: 'high-performance' });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(q.pr);
  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(62, 1, 0.3, 300);
  const hemi = new T.HemisphereLight(0xffffff, 0xa9c1a0, 0.95); scene.add(hemi);
  const sun = new T.DirectionalLight(0xfff2d6, 0.8); sun.position.set(-5, 11, 6); scene.add(sun);
  scene.fog = new T.Fog(0xd2efe6, 48, 138);

  const worldMat = new T.MeshLambertMaterial({ vertexColors: true });
  const worldGroup = new T.Group(); scene.add(worldGroup);
  const chunks = new Map();
  let level = null, W = WORLDS[0], worldIdx = 0, curSkyKey = '';
  let wmode = 'game';            // 'game' | 'stage'
  let size = { w: 1, h: 1 };

  // ------------------------------------------------------------ Texturen
  const canvasTex = (w, h, draw, rep) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new T.CanvasTexture(c); if (rep) { t.wrapS = t.wrapT = T.RepeatWrapping; } t.anisotropy = 2; return t; };
  const waterTex = canvasTex(128, 128, (x, w, h) => {
    x.fillStyle = '#fff'; x.fillRect(0, 0, w, h);
    x.strokeStyle = 'rgba(120,200,225,.55)'; x.lineWidth = 3; x.lineCap = 'round';
    for (let i = 0; i < 16; i++) { const px = (i * 53) % w, py = (i * 37) % h; x.beginPath(); x.moveTo(px - 14, py); x.quadraticCurveTo(px, py - 6, px + 14, py); x.stroke(); }
    x.strokeStyle = 'rgba(255,255,255,.9)'; x.lineWidth = 2;
    for (let i = 0; i < 10; i++) { const px = (i * 71 + 20) % w, py = (i * 29 + 9) % h; x.beginPath(); x.moveTo(px - 8, py); x.lineTo(px + 8, py); x.stroke(); }
  }, true);
  waterTex.repeat.set(70, 70);
  const warnTex = canvasTex(128, 128, (x, w, h) => {
    x.translate(w / 2, h / 2);
    x.fillStyle = 'rgba(255,60,60,.28)'; x.beginPath(); x.arc(0, 0, 60, 0, 7); x.fill();
    x.fillStyle = '#ff3b3b'; x.strokeStyle = '#fff'; x.lineWidth = 6;
    for (const dy of [14, -18]) { x.beginPath(); x.moveTo(-34, dy + 22); x.lineTo(0, dy - 10); x.lineTo(34, dy + 22); x.lineTo(34, dy + 6); x.lineTo(0, dy - 26); x.lineTo(-34, dy + 6); x.closePath(); x.fill(); x.stroke(); }
  });
  const ringTex = canvasTex(128, 128, (x, w, h) => {
    x.translate(w / 2, h / 2);
    x.fillStyle = 'rgba(255,60,60,.22)'; x.beginPath(); x.arc(0, 0, 58, 0, 7); x.fill();
    x.lineWidth = 9; x.strokeStyle = '#ff3b3b'; x.beginPath(); x.arc(0, 0, 54, 0, 7); x.stroke();
    x.lineWidth = 5; x.strokeStyle = '#fff'; x.beginPath(); x.arc(0, 0, 44, 0, 7); x.stroke();
    x.fillStyle = '#ff3b3b'; x.fillRect(-4, -20, 8, 24); x.fillRect(-4, 10, 8, 8);
  });
  const dotTex = canvasTex(64, 64, (x) => { const g = x.createRadialGradient(32, 32, 2, 32, 32, 30); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); });
  const textTex = (text, w, h, bg, fg) => canvasTex(w, h, (x) => { x.fillStyle = bg; x.fillRect(0, 0, w, h); x.fillStyle = fg; x.font = `400 ${Math.round(h * 0.62)}px "Dela Gothic One","Arial Black",sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, w / 2, h / 2 + 3); });

  // ------------------------------------------------------------ Wasser, Hintergrund
  const waterMat = new T.MeshBasicMaterial({ color: 0x2bbfd6, map: waterTex });
  const water = new T.Mesh(new T.PlaneGeometry(420, 420), waterMat); water.rotation.x = -Math.PI / 2; water.position.y = -1.0; scene.add(water);
  const backdrop = new T.Group(); scene.add(backdrop);
  let backdropMesh = null;
  const cloudMat = new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, fog: false });
  const clouds = [];
  for (let i = 0; i < 7; i++) { const c = new T.Mesh(G.ico(1), cloudMat); c.scale.set(26 + i * 3, 5, 12); c.position.set(-100 + i * 36, 52 + (i % 3) * 8, -150 + (i % 2) * 20); backdrop.add(c); clouds.push(c); }
  function buildBackdrop() {
    if (backdropMesh) { backdrop.remove(backdropMesh); backdropMesh.geometry.dispose(); }
    const b = new MB(); let s = 5;
    const rnd = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
    for (let i = 0; i < 16; i++) {
      const x = -190 + i * 25 + rnd() * 12, h = 28 + rnd() * 34, base = 20 + rnd() * 18;
      b.put(G.cone(6), x, h / 2 - 4, -150 - rnd() * 24, base * 2.2, h, base * 1.6, W.deco === 'gipfel' ? shade(W.mount, rnd() * 0.2) : shade(W.mount, -0.05 - rnd() * 0.15), 0, rnd() * 3, 0, 0.08);
      if (W.deco === 'gipfel' && h > 40) b.put(G.cone(6), x, h - 8, -150, base * 0.7, 12, base * 0.5, 0xf2f6fa, 0, 0, 0, 0.04);
    }
    const g = b.build(); backdropMesh = new T.Mesh(g, new T.MeshBasicMaterial({ vertexColors: true })); backdropMesh.frustumCulled = false; backdrop.add(backdropMesh);
  }
  function applyWorld(w, idx, now) {
    if (w === W && !now && curSkyKey) return;
    W = w; worldIdx = idx;
    waterMat.color.setHex(W.water);
    hemi.color.setHex(W.deco === 'tal' ? 0xfff3d6 : 0xffffff);
    document.body.style.setProperty('--himmel0', hexs(W.sky[0])); document.body.style.setProperty('--himmel1', hexs(W.sky[1]));
    scene.fog.color.setHex(W.fog);
    curSkyKey = String(idx);
    buildBackdrop();
  }

  // ------------------------------------------------------------ Münzen (instanziert), Power-ups
  const COIN_CAP = 260;
  const coinGeoA = new T.CylinderGeometry(0.34, 0.34, 0.1, 16); coinGeoA.rotateX(Math.PI / 2);
  const coinGeoB = new T.CylinderGeometry(0.22, 0.22, 0.13, 12); coinGeoB.rotateX(Math.PI / 2);
  const coinA = new T.InstancedMesh(coinGeoA, new T.MeshLambertMaterial({ color: 0xffc928, emissive: 0x7a5200 }), COIN_CAP);
  const coinB = new T.InstancedMesh(coinGeoB, new T.MeshLambertMaterial({ color: 0xffe9a0, emissive: 0x6b5a20 }), COIN_CAP);
  for (const m of [coinA, coinB]) { m.frustumCulled = false; m.instanceMatrix.setUsage(T.DynamicDrawUsage); m.count = 0; scene.add(m); }
  const dummy = new T.Object3D();
  const pupViews = new Map();
  const pupGlow = new T.MeshBasicMaterial({ map: dotTex, color: 0xffffff, transparent: true, depthWrite: false, blending: T.AdditiveBlending });

  // ------------------------------------------------------------ Partikel
  const PN = 520;
  const pPos = new Float32Array(PN * 3), pCol = new Float32Array(PN * 4), pSize = new Float32Array(PN);
  const pVel = new Float32Array(PN * 3), pLife = new Float32Array(PN), pMax = new Float32Array(PN), pS0 = new Float32Array(PN), pS1 = new Float32Array(PN), pGrav = new Float32Array(PN), pDrag = new Float32Array(PN);
  const pC0 = new Float32Array(PN * 3), pC1 = new Float32Array(PN * 3);
  let pNext = 0;
  const pGeo = new T.BufferGeometry();
  pGeo.setAttribute('position', new T.BufferAttribute(pPos, 3).setUsage(T.DynamicDrawUsage));
  pGeo.setAttribute('aColor', new T.BufferAttribute(pCol, 4).setUsage(T.DynamicDrawUsage));
  pGeo.setAttribute('aSize', new T.BufferAttribute(pSize, 1).setUsage(T.DynamicDrawUsage));
  const pMat = new T.ShaderMaterial({
    transparent: true, depthWrite: false, uniforms: { uScale: { value: 400 } },
    vertexShader: 'attribute float aSize; attribute vec4 aColor; varying vec4 vC; uniform float uScale; void main(){ vC=aColor; vec4 mv=modelViewMatrix*vec4(position,1.0); gl_PointSize=max(0.0,aSize*uScale/-mv.z); gl_Position=projectionMatrix*mv; }',
    fragmentShader: 'varying vec4 vC; void main(){ vec2 d=gl_PointCoord-0.5; float r=length(d); if(r>0.5) discard; float a=smoothstep(0.5,0.12,r); gl_FragColor=vec4(vC.rgb,vC.a*a); }'
  });
  const points = new T.Points(pGeo, pMat); points.frustumCulled = false; scene.add(points);
  const _c = new T.Color(), _c2 = new T.Color();
  function emit(n, x, y, z, o) {
    for (let k = 0; k < n; k++) {
      const i = pNext; pNext = (pNext + 1) % PN;
      const sp = o.spread || 0, rx = (Math.random() - 0.5) * 2, ry = Math.random(), rz = (Math.random() - 0.5) * 2;
      pPos[i * 3] = x + rx * (o.px || 0); pPos[i * 3 + 1] = y + ry * (o.py || 0); pPos[i * 3 + 2] = z + rz * (o.pz || 0);
      pVel[i * 3] = (o.vx || 0) + rx * sp; pVel[i * 3 + 1] = (o.vy || 0) + ry * (o.vyr || 0) + (Math.random() - 0.5) * (o.vys || 0); pVel[i * 3 + 2] = (o.vz || 0) + rz * sp;
      pLife[i] = pMax[i] = (o.life || 0.6) * (0.7 + Math.random() * 0.6); pS0[i] = o.s0 || 0.2; pS1[i] = o.s1 === undefined ? 0 : o.s1; pGrav[i] = o.grav === undefined ? 0 : o.grav; pDrag[i] = o.drag || 0;
      const c0 = Array.isArray(o.c) ? o.c[(Math.random() * o.c.length) | 0] : o.c, c1 = o.c1 === undefined ? c0 : o.c1;
      _c.setHex(c0); _c2.setHex(c1);
      pC0.set([_c.r, _c.g, _c.b], i * 3); pC1.set([_c2.r, _c2.g, _c2.b], i * 3);
    }
  }
  function updateParticles(dt) {
    for (let i = 0; i < PN; i++) {
      if (pLife[i] <= 0) { pCol[i * 4 + 3] = 0; pSize[i] = 0; continue; }
      pLife[i] -= dt; const t = 1 - Math.max(0, pLife[i]) / pMax[i];
      const dr = Math.max(0, 1 - pDrag[i] * dt);
      pVel[i * 3] *= dr; pVel[i * 3 + 1] = pVel[i * 3 + 1] * dr - pGrav[i] * dt; pVel[i * 3 + 2] *= dr;
      pPos[i * 3] += pVel[i * 3] * dt; pPos[i * 3 + 1] += pVel[i * 3 + 1] * dt; pPos[i * 3 + 2] += pVel[i * 3 + 2] * dt;
      pCol[i * 4] = lerp(pC0[i * 3], pC1[i * 3], t); pCol[i * 4 + 1] = lerp(pC0[i * 3 + 1], pC1[i * 3 + 1], t); pCol[i * 4 + 2] = lerp(pC0[i * 3 + 2], pC1[i * 3 + 2], t);
      pCol[i * 4 + 3] = Math.min(1, (1 - t) * 1.6) * (t < 0.08 ? t / 0.08 : 1);
      pSize[i] = lerp(pS0[i], pS1[i], t);
    }
    pGeo.attributes.position.needsUpdate = true; pGeo.attributes.aColor.needsUpdate = true; pGeo.attributes.aSize.needsUpdate = true;
  }

  // ------------------------------------------------------------ Spielfigur
  const playerGroup = new T.Group(); scene.add(playerGroup);
  const charCache = new Map();
  let charKind = 'boy', charOutfit = 'entdecker', player = null;
  const getChar = (kind, outfit) => {
    const k = kind + '|' + outfit;
    if (!charCache.has(k)) { const c = C.buildChar(kind, C.OUTFIT_BY_ID[outfit] || C.OUTFITS[0]); c.root.visible = false; scene.add(c.root); c.root.add(c.shadow); charCache.set(k, c); }
    return charCache.get(k);
  };
  const shield = new T.Mesh(new T.SphereGeometry(1.15, 18, 12), new T.MeshBasicMaterial({ color: 0x59c6ff, transparent: true, opacity: 0.26, depthWrite: false, blending: T.AdditiveBlending }));
  const shieldRing = new T.Mesh(new T.SphereGeometry(1.17, 12, 8), new T.MeshBasicMaterial({ color: 0xbdeaff, wireframe: true, transparent: true, opacity: 0.35, depthWrite: false }));
  shield.add(shieldRing); shield.visible = false; scene.add(shield);
  const magnetRing = new T.Mesh(new T.TorusGeometry(1.0, 0.05, 6, 28), new T.MeshBasicMaterial({ color: 0xff5d5d, transparent: true, opacity: 0.75 }));
  magnetRing.rotation.x = Math.PI / 2; magnetRing.visible = false; scene.add(magnetRing);
  const wings = new T.Group();
  for (const sx of [-1, 1]) { const w = new T.Mesh(G.cone(4), new T.MeshBasicMaterial({ color: 0xd9ff7a, transparent: true, opacity: 0.8 })); w.scale.set(0.22, 1.1, 0.5); w.position.set(sx * 0.5, 0, 0.1); w.rotation.z = sx * -1.2; wings.add(w); }
  wings.visible = false; scene.add(wings);
  function setChar(kind, outfit) {
    charKind = kind === 'girl' ? 'girl' : 'boy'; charOutfit = outfit || 'entdecker';
    player = getChar(charKind, charOutfit);
    for (const c of charCache.values()) c.root.visible = false;
  }

  // ------------------------------------------------------------ Warnzeichen, Tiere, Tore (gepoolt)
  const dynViews = new Map();    // Index in level.dyn → Ansicht
  const decalGeo = G.plane();
  function decal(tex, size) { const m = new T.Mesh(decalGeo, new T.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false })); m.scale.set(size, 1, size); m.position.y = 0.04; return m; }
  const pools = { rhino: [], elephant: [], monkey: [], boulder: [], coco: [], gate: [] };
  const mkDoor = () => {
    const g = new T.Group();
    const stone = new T.Mesh(G.box(), C.lam(0xb8bfae)); stone.scale.set(1.85, 2.6, 0.9); g.add(stone);
    const band = new T.Mesh(G.box(), C.lam(0xe8b82a)); band.scale.set(1.5, 0.22, 0.94); band.position.y = 0.55; g.add(band);
    const band2 = band.clone(); band2.position.y = -0.55; g.add(band2);
    const eye = new T.Mesh(G.cone(4), C.lam(0xe8b82a)); eye.scale.set(0.5, 0.6, 0.96); eye.rotation.y = Math.PI / 4; g.add(eye);
    const lamp = new T.Mesh(G.sph(8), new T.MeshBasicMaterial({ color: 0x2dbd5a })); lamp.scale.set(0.45, 0.45, 0.45); lamp.position.set(0, 3.05, -0.0); g.userData.lamp = lamp; g.add(lamp);
    return g;
  };
  const mkVine = () => {
    const g = new T.Group(); const sw = new T.Group(); g.add(sw);
    const rope = new T.Mesh(G.cyl(5), C.lam(0x4f8a3a)); rope.scale.set(0.09, 4.8, 0.09); rope.position.y = -2.4; sw.add(rope);
    const m = C.buildMonkey(); m.rotation.y = Math.PI; m.position.set(0, -4.35, 0); sw.add(m);
    const top = new T.Mesh(G.ico(0), C.lam(0x2f9a4a)); top.scale.set(1.8, 0.8, 1.8); g.add(top);
    g.userData = { sw, m };
    return g;
  };
  const mkCoco = () => {
    const g = new T.Group();
    const bough = new MB(); bough.cyl(0, 0, 0, 0.14, 2.0, 0.14, 0x6a4a2a, 0, 0, Math.PI / 2, 5);
    for (let i = 0; i < 4; i++) bough.box(-0.8 + i * 0.55, 0.0, 0.0, 0.3, 0.04, 1.4, 0x2f9a4a, 0.4, i * 0.8, 0, 0.1);
    const bm = new T.Mesh(bough.build(), new T.MeshLambertMaterial({ vertexColors: true })); bm.position.y = 7.0; g.add(bm);
    const nut = C.buildCoconut(); g.add(nut);
    const ring = decal(ringTex, 2.1); g.add(ring);
    g.userData = { nut, ring, bm };
    return g;
  };
  const makers = { rhino: () => { const m = C.buildRhino(); const g = new T.Group(); m.rotation.y = Math.PI; g.add(m); g.userData.m = m; g.userData.warn = decal(warnTex, 1.7); return g; }, elephant: C.buildElephant, monkey: mkVine, boulder: () => { const m = C.buildBoulder(); const g = new T.Group(); g.add(m); g.userData.m = m; g.userData.warn = decal(warnTex, 1.9); return g; }, coco: mkCoco, gate: mkDoor };
  function acquire(kind) {
    const p = pools[kind]; let o = p.pop();
    if (!o) { o = makers[kind](); scene.add(o); if (o.userData.warn) scene.add(o.userData.warn); }
    o.visible = true; return o;
  }
  function release(kind, o) { o.visible = false; if (o.userData.warn) o.userData.warn.visible = false; pools[kind].push(o); }

  // ------------------------------------------------------------ Strecke aufbauen
  function dropChunk(ci) { const c = chunks.get(ci); if (!c) return; worldGroup.remove(c); c.geometry.dispose(); chunks.delete(ci); }
  function clearWorld() { for (const ci of [...chunks.keys()]) dropChunk(ci); }
  function wantChunks(zf, force) {
    if (!level) return;
    const c0 = Math.floor((zf - 40) / CH), c1 = Math.floor((zf + VIEW + 54) / CH);
    for (const ci of [...chunks.keys()]) if (ci < c0 || ci > c1 + 1) dropChunk(ci);
    let budget = force ? 99 : 1;
    for (let ci = c0; ci <= c1 && budget > 0; ci++) {
      if (chunks.has(ci)) continue;
      const g = buildChunk(level, ci, { deco: q.deco }); budget--;
      if (!g) continue;
      const m = new T.Mesh(g, worldMat); m.matrixAutoUpdate = false; worldGroup.add(m); chunks.set(ci, m);
    }
  }
  function releaseView(v) { release(v.kind, v.o); if (v.kids) for (const k of v.kids) if (k.e !== v.o) release('elephant', k.e); }
  function releaseAllDyn() { for (const v of dynViews.values()) releaseView(v); dynViews.clear(); for (const v of pupViews.values()) scene.remove(v); pupViews.clear(); }

  function setLevel(lv) {
    level = lv; clearWorld(); releaseAllDyn();
    applyWorld(worldFor(lv, 0), lv.endless ? 0 : lv.world, true);
    wmode = 'game';
    wantChunks(0, true);
    camState.init = false; shakeT = 0; fxState.lastZ = 0;
    if (player) player.root.visible = true;
  }
  function reset() { releaseAllDyn(); emitClear(); camState.init = false; shakeT = 0; wantChunks(0, true); }
  function emitClear() { pLife.fill(0); }

  // ------------------------------------------------------------ Kamera
  const camState = { init: false, cx: 0, shake: 0, lean: 0, fov: 62 };
  let shakeT = 0;
  const fxState = { lastZ: 0, landT: 0, speed: 0, lane: 0, ph: 0, dustT: 0, t: 0, lastX: 0, windT: 0, mistT: 0, blink: 0, squash: 0 };
  function placeCamera(st, dt) {
    const aspect = size.w / size.h;
    const fov = 62 + Math.min(8, Math.max(0, fxState.speed - 10) * 0.9) + (st.s && st.s.pw.boost > 0 ? 3 : 0);
    camState.fov = lerp(camState.fov, fov, Math.min(1, dt * 3)); camera.fov = camState.fov;
    const th = Math.tan((camState.fov * Math.PI) / 360);
    const dist = clamp(3.6 / (aspect * th), 7.0, 14);
    const targetX = st.x * 0.62;
    camState.cx = camState.init ? lerp(camState.cx, targetX, Math.min(1, dt * 7)) : targetX;
    camState.init = true;
    const cy = 3.2 + dist * 0.27;
    let sx = 0, sy = 0;
    if (shakeT > 0) { shakeT = Math.max(0, shakeT - dt); const a = shakeT * 0.55; sx = (Math.random() - 0.5) * a; sy = (Math.random() - 0.5) * a; }
    camera.position.set(camState.cx + sx, cy + sy + Math.max(0, st.y) * 0.25, -st.z + dist);
    camera.lookAt(camState.cx * 0.9, 0.9 + Math.max(0, st.y) * 0.3, -st.z - 12);
    camera.aspect = aspect; camera.updateProjectionMatrix();
    pMat.uniforms.uScale.value = (size.h * q.pr) / (2 * th);
  }

  // ------------------------------------------------------------ Frame (Spiel)
  const tmpV = new T.Vector3();
  function updateCoins(st) {
    const s = st.s, L = level, pz = st.z, mag = s.pw.magnet > 0;
    let n = 0;
    const spin = fxState.t * 3.2;
    for (let i = lowerZ(L.coins, pz - 3); i < L.coins.length && L.coins[i].z < pz + VIEW && n < COIN_CAP; i++) {
      if (s.got[i]) continue;
      const c = L.coins[i];
      let x = laneX(c.lane), y = c.y, z = c.z;
      if (mag && Math.abs(c.z - pz) < 6 && Math.abs(x - st.x) < 3.4) { const k = clamp(1 - Math.abs(c.z - pz) / 6, 0, 1) ** 1.6; x = lerp(x, st.x, k); y = lerp(y, st.y + 0.9, k); z = lerp(z, pz, k); }
      dummy.position.set(x, y + Math.sin(fxState.t * 4 + i) * 0.05, -z); dummy.rotation.set(0, spin + i * 0.7, 0); dummy.scale.setScalar(1); dummy.updateMatrix();
      coinA.setMatrixAt(n, dummy.matrix); coinB.setMatrixAt(n, dummy.matrix); n++;
    }
    coinA.count = coinB.count = n; coinA.instanceMatrix.needsUpdate = true; coinB.instanceMatrix.needsUpdate = true;
  }
  function updatePups(st) {
    const s = st.s, L = level, seen = new Set();
    for (let i = lowerZ(L.pups, st.z - 3); i < L.pups.length && L.pups[i].z < st.z + VIEW; i++) {
      if (s.pgot[i]) continue;
      const p = L.pups[i]; seen.add(i);
      let v = pupViews.get(i);
      if (!v) {
        v = new T.Group();
        const icon = new T.Mesh(new T.PlaneGeometry(1.15, 1.15), new T.MeshBasicMaterial({ map: C.powerTexture(p.k), transparent: true, side: T.DoubleSide }));
        const glow = new T.Mesh(new T.PlaneGeometry(2.2, 2.2), pupGlow.clone()); glow.material.color.set(C.POWER_COL[p.k]); glow.position.z = -0.05;
        v.add(glow, icon); v.userData = { icon, glow }; scene.add(v); pupViews.set(i, v);
      }
      v.position.set(laneX(p.lane), (p.y || 0.9) + 0.35 + Math.sin(fxState.t * 3 + i) * 0.15, -p.z); v.rotation.y = Math.sin(fxState.t * 1.7 + i) * 0.5;
      v.userData.glow.scale.setScalar(1 + Math.sin(fxState.t * 5) * 0.12);
    }
    for (const [i, v] of pupViews) if (!seen.has(i)) { scene.remove(v); pupViews.delete(i); }
  }
  function updateDyn(st) {
    const s = st.s, L = level, sek = st.sek, pz = st.z, used = new Set();
    const lo = lowerZ(L.dyn, pz - 50);
    for (let i = lo; i < L.dyn.length && L.dyn[i].z < pz + VIEW + 280; i++) {
      const d = L.dyn[i], t0 = s.dt0[i], dph = s.dph[i];
      let kind = d.k; let nz = d.z;
      if (kind === 'rhino' || kind === 'boulder' || kind === 'elephant') nz = dynPos(d, t0, sek);
      const vis = kind === 'coco' ? (dph < 2 && d.z - pz < VIEW && d.z - pz > -4) : (kind === 'monkey' ? (d.z - pz < VIEW && d.z - pz > -8) : (nz - pz < VIEW + 4 && nz - pz > -9));
      if (!vis) continue;
      used.add(i);
      let v = dynViews.get(i);
      if (!v) { v = { kind, o: acquire(kind), t: 0 }; dynViews.set(i, v); }
      const o = v.o;
      switch (kind) {
        case 'rhino': {
          const run = t0 >= 0, hit = dph === 3;
          let x = laneX(d.lane), off = 0;
          if (hit) { v.hitT = (v.hitT || 0) + 1 / 60; off = Math.min(1, v.hitT * 3) * (d.lane === 2 ? 4.2 : d.lane === 0 ? -4.2 : 4.2); } else v.hitT = 0;
          o.position.set(x + off, hit ? Math.sin(Math.min(1, v.hitT * 3) * Math.PI) * 0.9 : 0, -nz);
          C.animRhino(o.userData.m, sek, run && !hit ? 1 : 0);
          const w = o.userData.warn; w.visible = run && dph === 1 && nz - pz > 3 && nz - pz < 64;
          if (w.visible) { w.position.set(laneX(d.lane), 0.05, -(pz + 15 + Math.sin(sek * 9) * 0.5)); w.material.opacity = 0.55 + 0.45 * Math.abs(Math.sin(sek * 8)); }
          break;
        }
        case 'boulder': {
          const run = t0 >= 0, hit = dph === 3;
          let off = 0; if (hit) { v.hitT = (v.hitT || 0) + 1 / 60; off = Math.min(1, v.hitT * 2.5) * (d.lane === 2 ? -5 : 5); } else v.hitT = 0;
          o.position.set(laneX(d.lane) + off, hit ? Math.min(1, v.hitT * 2.5) * 1.2 : 0, -nz);
          if (run) o.userData.m.userData.rot.rotation.x += 0.2;
          const w = o.userData.warn; w.visible = run && dph === 1 && nz - pz > 3 && nz - pz < 64;
          if (w.visible) { w.position.set(laneX(d.lane), 0.05, -(pz + 15 + Math.sin(sek * 9) * 0.5)); w.material.opacity = 0.55 + 0.45 * Math.abs(Math.sin(sek * 8)); }
          break;
        }
        case 'elephant': {
          if (!v.kids) { v.kids = d.lanes.map((l, k) => { const e = k === 0 ? o : acquire('elephant'); return { e, l, ph: k * 1.7 }; }); }
          for (const k of v.kids) { k.e.position.set(laneX(k.l), 0, -(nz + (k.ph > 0 ? 0.35 : 0))); C.animElephant(k.e, sek, k.ph); }
          break;
        }
        case 'monkey': {
          const mx = monkeyX(d, sek), len = 4.8, ang = Math.asin(clamp(mx / len, -0.95, 0.95));
          o.position.set(0, 6.45, -d.z); o.userData.sw.rotation.z = ang;
          C.animMonkey(o.userData.m, sek, Math.cos((2 * Math.PI * sek) / d.per + d.ph) * 0.9);
          o.userData.m.rotation.z = 0;
          break;
        }
        case 'coco': {
          const fall = dph === 1 ? clamp((sek - t0) / COCO_FALL, 0, 1) : 0, x = laneX(d.lane);
          o.position.set(x, 0, -d.z);
          const nut = o.userData.nut; nut.position.set(0, dph === 1 ? Math.max(0.3, 6.7 * (1 - fall * fall)) : 6.6, 0); nut.rotation.x = sek * 4;
          o.userData.bm.visible = dph === 0 || dph === 1;
          const ring = o.userData.ring; ring.visible = d.z - pz < 48;
          const pulse = 1 + (dph === 1 ? fall * 0.3 : Math.sin(sek * 6) * 0.06);
          ring.scale.set(2.0 * pulse, 1, 2.0 * pulse); ring.material.opacity = dph === 1 ? 0.7 + fall * 0.3 : 0.65;
          break;
        }
        case 'gate': {
          const b = gateBottom(d, sek);
          o.position.set(laneX(d.lane), b + 1.3, -d.z);
          const open = b > 1.0; o.userData.lamp.material.color.setHex(open ? 0x2dbd5a : 0xe0342f);
          break;
        }
        default: break;
      }
    }
    for (const [i, v] of dynViews) if (!used.has(i)) { releaseView(v); dynViews.delete(i); }
  }

  function updatePlayer(st, dt) {
    const c = player; if (!c) return;
    const s = st.s, t = fxState.t;
    c.root.visible = true; c.root.position.set(st.x, st.y, -st.z);
    // Geschwindigkeit/Laufphase aus der tatsächlichen Bewegung
    const dz = st.z - fxState.lastZ; fxState.lastZ = st.z;
    const sp = dt > 0 ? clamp(dz / dt, 0, 40) : 0; fxState.speed = lerp(fxState.speed, sp, Math.min(1, dt * 8));
    const dx = st.x - fxState.lastX; fxState.lastX = st.x;
    fxState.lane = lerp(fxState.lane, clamp(dx / Math.max(dt, 0.001) / 8, -1, 1), Math.min(1, dt * 14));
    const moving = fxState.speed > 0.8;
    if (moving) fxState.ph += dt * (12 + fxState.speed * 0.38);
    let mode = 'run';
    if (s.phase === 'lost') mode = 'lose';
    else if (s.phase === 'won') mode = moving && fxState.speed > 4 ? 'run' : 'cheer';
    else if (s.stun > 0) mode = 'stun';
    else if (!s.grounded) mode = s.vy > 0 ? 'jump' : 'fall';
    else if (s.slideT > 0) mode = 'slide';
    else if (!moving) mode = 'idle';
    C.poseChar(c, C.poseTarget({ mode, ph: fxState.ph, lane: fxState.lane, t }), dt);
    C.animateExtras(c, t, fxState.speed);
    c.root.rotation.y = -fxState.lane * 0.3;
    // Squash beim Landen
    fxState.squash = Math.max(0, fxState.squash - dt * 5);
    const sq = 1 - fxState.squash * 0.1;
    c.tilt.scale.set(1 + (1 - sq) * 0.6, sq, 1 + (1 - sq) * 0.6);
    // Blinken bei Unverwundbarkeit
    c.root.visible = !(s.invul > 0 && s.phase === 'run' && Math.floor(t * 14) % 2 === 0 && s.invul < 5);
    c.shadow.position.y = 0.03 - st.y + groundHere(st); const hs = Math.max(0.35, 1 - Math.abs(st.y - groundHere(st)) * 0.2); c.shadow.scale.set(0.85 * hs, 0.85 * hs, 0.85 * hs);
    // Hilfen
    shield.visible = s.pw.shield > 0 && (s.pw.shield > 2 || Math.floor(t * 8) % 2 === 0); shield.position.set(st.x, st.y + 0.75, -st.z); shield.scale.setScalar(1 + Math.sin(t * 6) * 0.03); shield.rotation.y += dt;
    magnetRing.visible = s.pw.magnet > 0; magnetRing.position.set(st.x, st.y + 0.8, -st.z); magnetRing.scale.setScalar(1 + (t * 1.5 % 1) * 1.6); magnetRing.material.opacity = 0.75 * (1 - (t * 1.5 % 1));
    wings.visible = s.pw.boost > 0; wings.position.set(st.x, st.y + 0.95, -st.z + 0.28); wings.rotation.z = Math.sin(t * 14) * 0.15;
    // Staub und Spuren
    fxState.dustT -= dt;
    const gh = groundHere(st);
    if (s.phase === 'run' && s.grounded && moving && fxState.dustT <= 0) {
      fxState.dustT = s.slideT > 0 ? 0.03 : 0.07;
      const water = false; void water;
      emit(s.slideT > 0 ? 2 : 1, st.x, gh + 0.05, -st.z + 0.3, { px: 0.2, pz: 0.1, vz: 1.5, spread: 0.6, vy: 0.5, vyr: 0.6, life: 0.5, s0: 0.2, s1: 0.5, c: s.mudT ? 0x7c583a : 0xe7dcc2, grav: -0.2 });
    }
    if (s.pw.boost > 0 && moving) emit(1, st.x, st.y + 0.2, -st.z + 0.4, { px: 0.15, vz: 2.5, spread: 0.3, vy: 0.2, life: 0.4, s0: 0.28, s1: 0, c: 0xd9ff7a, c1: 0x59c6ff });
  }
  const groundHere = (st) => { const g = groundH(level, st.s.lane, st.z); return g === null ? 0 : g; };

  function environmentFx(st, dt) {
    const L = level, pz = st.z;
    // Wind: Streifen, die quer durchs Bild ziehen
    let wind = false;
    for (let i = lowerZ(L.obs, pz - 24); i < L.obs.length && L.obs[i].z < pz + 70; i++) { const o = L.obs[i]; if (o.k === 'wind' && pz > o.z - o.len / 2 - 25 && pz < o.z + o.len / 2) { wind = true; break; } }
    fxState.windT -= dt;
    if (wind && fxState.windT <= 0) { fxState.windT = 0.035; emit(1, 7, 0.6, -(pz + 10 + Math.random() * 26), { py: 3.8, vx: -26, vz: 3, spread: 0.0, life: 0.5, s0: 0.1, s1: 0.1, c: 0xffffff, drag: 0 }); emit(1, st.x + 4, 0.2, -(pz + 3 + Math.random() * 12), { py: 2.5, vx: -22, spread: 0.0, life: 0.45, s0: 0.14, s1: 0.04, c: 0xffffff }); }
    // Sprühnebel
    let mist = false; for (const f of L.fx) if (f.k === 'mist' && pz > f.z0 - 20 && pz < f.z1) { mist = true; break; }
    fxState.mistT -= dt;
    if (mist && fxState.mistT <= 0) { fxState.mistT = 0.05; const sd = Math.random() < 0.5 ? -1 : 1; emit(1, sd * (4 + Math.random() * 2.5), 0.2, -(pz + 6 + Math.random() * 40), { py: 1.4, vy: 0.3, vx: -sd * 0.4, spread: 0.2, life: 1.8, s0: 1.4, s1: 3.2, c: 0xffffff, drag: 0.3 }); }
    // Wolken wandern langsam
    for (const c of clouds) { c.position.x += dt * 0.6; if (c.position.x > 150) c.position.x = -150; }
  }

  // ------------------------------------------------------------ Ereignisse aus der Simulation
  function event(e, st) {
    const s = st.s, L = level;
    switch (e.e) {
      case 'coin': emit(7, laneX(e.lane), e.y, -e.z, { spread: 1.8, vy: 1.6, vys: 1.8, life: 0.5, s0: 0.3, s1: 0, c: [0xffe27a, 0xffc928, 0xffffff], grav: 4 }); break;
      case 'jump': emit(5, st.x, st.y + 0.05, -st.z, { px: 0.3, spread: 1.4, vy: 0.4, vyr: 0.8, life: 0.45, s0: 0.25, s1: 0.5, c: 0xe7dcc2 }); break;
      case 'land': fxState.squash = 1; emit(9, st.x, st.y + 0.05, -st.z, { px: 0.3, spread: 2.2, vy: 0.3, vyr: 0.9, life: 0.5, s0: 0.28, s1: 0.65, c: 0xe7dcc2 }); break;
      case 'hit': shakeT = 0.35; emit(16, st.x, st.y + 1.0, -st.z, { spread: 3.2, vy: 1.5, vys: 3, life: 0.6, s0: 0.3, s1: 0, c: [0xff9f43, 0xffe27a, 0xff5d73], grav: 5 }); break;
      case 'shield': shakeT = 0.18; emit(20, st.x, st.y + 0.8, -st.z, { spread: 4, vy: 0.5, vys: 2, life: 0.6, s0: 0.35, s1: 0, c: [0x59c6ff, 0xbdeaff, 0xffffff] }); break;
      case 'splash': { const x = st.x, z = -st.z; emit(30, x, -0.8, z, { px: 0.3, spread: 2.2, vy: 4, vyr: 3, life: 0.9, s0: 0.3, s1: 0, c: [0xffffff, 0x8be3f2, 0x2bbfd6], grav: 11 }); shakeT = 0.25; break; }
      case 'respawn': emit(24, laneX(1), 0.9, -e.z, { spread: 3, vy: 1, vys: 2, life: 0.9, s0: 0.35, s1: 0, c: [0x7dffb0, 0xffffff, 0xffe27a] }); break;
      case 'checkpoint': emit(40, 0, 1.5, -e.z, { px: 3.5, py: 3, spread: 0.5, vy: 1.5, life: 1.1, s0: 0.3, s1: 0, c: [0x7dffb0, 0xffe27a, 0xffffff], grav: 2 }); break;
      case 'power': emit(26, st.x, st.y + 1, -st.z, { spread: 4.2, vy: 1.2, vys: 2.5, life: 0.8, s0: 0.35, s1: 0, c: [C.POWER_COL[e.k] ? parseInt(C.POWER_COL[e.k].slice(1), 16) : 0xffffff, 0xffffff] }); break;
      case 'start': {
        const d = L.dyn[e.i]; if (!d) break;
        if (d.k === 'rhino' || d.k === 'boulder') emit(14, laneX(d.lane), 0.4, -d.z, { px: 0.8, spread: 2.5, vy: 0.5, vyr: 1.3, life: 0.9, s0: 0.6, s1: 1.4, c: 0xe7dcc2 });
        break;
      }
      case 'crack': { const d = L.dyn[e.i]; if (d) { emit(12, laneX(d.lane), 0.3, -d.z, { spread: 2.8, vy: 1.8, vys: 2, life: 0.7, s0: 0.3, s1: 0, c: [0x6b4423, 0xf4efe0, 0xc9a66b], grav: 8 }); } break; }
      case 'bump': shakeT = 0.1; break;
      case 'won': confetti(st); break;
      default: break;
    }
  }
  function confetti(st) { emit(90, st.x, 3, -st.z - 4, { px: 4, py: 2, spread: 5, vy: 6, vys: 4, life: 2.2, s0: 0.28, s1: 0.2, c: [0xff5d73, 0xffd23f, 0x5ee0ff, 0x7dffb0, 0xff9ad5, 0xffffff], grav: 7, drag: 0.4 }); }

  // ------------------------------------------------------------ Frame
  let lastEndless = -1;
  function frame(st, dt) {
    fxState.t += dt;
    if (!level) return;
    const L = level;
    if (L.endless) { const idx = Math.floor(Math.max(0, st.z) / 700) % WORLDS.length; if (idx !== worldIdx) applyWorld(WORLDS[idx], idx, true); }
    wantChunks(st.z, false);
    updateCoins(st); updatePups(st); updateDyn(st); updatePlayer(st, dt); environmentFx(st, dt); updateParticles(dt);
    placeCamera(st, dt);
    backdrop.position.set(camera.position.x * 0.2, 0, camera.position.z);
    water.position.set(camera.position.x, -1.0, camera.position.z - 90);
    waterTex.offset.set(fxState.t * 0.01, -fxState.t * 0.06);
    // Münzen/Hindernis-Fortschritt: nichts weiter
    sun.position.set(camera.position.x - 5, 11, camera.position.z - 6 + 12); sun.target.position.set(camera.position.x, 0, camera.position.z - 12); sun.target.updateMatrixWorld();
    renderer.render(scene, camera);
    void lastEndless;
  }

  // ------------------------------------------------------------ Bühne (Menü, Figurenwahl, Kleiderschrank)
  // Beide Figuren stehen mitten auf der Strecke und schauen zur Kamera; dahinter das echte Level 1.
  function stageFrame(o, dt) {
    fxState.t += dt;
    if (!level) return;
    if (wmode !== 'stage') { wmode = 'stage'; releaseAllDyn(); for (const c of charCache.values()) c.root.visible = false; shield.visible = magnetRing.visible = wings.visible = false; }
    const zc = 58, t = fxState.t;
    wantChunks(zc, true);
    const mode = o.mode || 'menu';
    const boy = getChar('boy', o.outfit || charOutfit), girl = getChar('girl', o.outfit || charOutfit);
    const sel = o.sel || charKind;
    const place = (c, x, yaw, pose, bump) => { c.root.visible = true; c.root.position.set(x, bump, -zc); c.root.rotation.y = yaw; C.poseChar(c, C.poseTarget({ mode: pose, ph: t * 8, lane: 0, t }), dt); C.animateExtras(c, t, 0); c.tilt.scale.set(1, 1, 1); c.shadow.position.y = 0.03 - bump; };
    for (const c of charCache.values()) if (c !== boy && c !== girl) c.root.visible = false;
    let camX = 0, camY = 1.9, camD = 8, look = 1.0, shX = 0, shY = 0;
    const aspect = size.w / size.h, portrait = aspect < 0.85, TH = Math.tan((44 * Math.PI) / 360);
    if (mode === 'garage') {
      const c = sel === 'girl' ? girl : boy; (sel === 'girl' ? boy : girl).root.visible = false;
      place(c, 0, Math.sin(t * 0.6) * 0.7, 'idle', 0);
      camD = portrait ? 7.4 : clamp(1.1 / (aspect * TH), 4.2, 7); camY = 1.5; look = 0.95;
      if (portrait) shY = 0.25; else shX = 0.2;
    } else {
      const camDneed = (sp) => clamp((sp + 0.7) / (aspect * TH), 4.6, 11);
      let sp = clamp(camDneed(1.0) * TH * aspect * 0.5, 0.6, 1.25);
      camD = camDneed(sp); sp = clamp(camD * TH * aspect * 0.5, 0.6, 1.25);
      if (mode === 'menu' && !portrait) sp *= 0.72;
      const bumpB = sel === 'boy' && mode === 'choose' ? Math.abs(Math.sin(t * 5)) * 0.18 : 0, bumpG = sel === 'girl' && mode === 'choose' ? Math.abs(Math.sin(t * 5)) * 0.18 : 0;
      // Die Kamera blickt entgegen der Laufrichtung: +x erscheint links, daher steht der Junge bei +x (links im Bild)
      place(boy, sp, 0.25, mode === 'choose' && sel === 'boy' ? 'cheer' : 'wave', bumpB);
      place(girl, -sp, -0.25, mode === 'choose' && sel === 'girl' ? 'cheer' : 'wave', bumpG);
      camY = 1.5 + camD * 0.08; look = 0.95;
      if (mode === 'menu') camX = Math.sin(t * 0.25) * 0.5;
      if (portrait) shY = mode === 'choose' ? 0.2 : 0.24; else if (mode === 'menu') shX = -0.27;
    }
    camera.fov = 44; camera.aspect = aspect;
    camera.position.set(camX, camY, -zc - camD); camera.lookAt(camX * 0.4, look, -zc);
    if (shX || shY) camera.setViewOffset(size.w, size.h, shX * size.w, shY * size.h, size.w, size.h); else camera.updateProjectionMatrix();
    backdrop.position.set(0, 0, camera.position.z); backdrop.rotation.y = Math.PI;       // Blick geht in Gegenrichtung: Berge hinter die Figuren
    water.position.set(0, -1.0, -zc); waterTex.offset.set(t * 0.01, -t * 0.06);
    sun.position.set(-4, 10, -zc - 8); sun.target.position.set(0, 0, -zc); sun.target.updateMatrixWorld();
    updateParticles(dt);
    pMat.uniforms.uScale.value = (size.h * q.pr) / (2 * Math.tan((44 * Math.PI) / 360));
    renderer.render(scene, camera);
    if (shX || shY) camera.clearViewOffset();
    backdrop.rotation.y = 0;
  }
  function leaveStage() { if (wmode === 'stage') { wmode = 'game'; for (const c of charCache.values()) c.root.visible = false; sun.position.set(-5, 11, 6); } }

  function resize(w, h) { size = { w: Math.max(1, w), h: Math.max(1, h) }; renderer.setSize(size.w, size.h, false); canvas.style.width = '100%'; canvas.style.height = '100%'; camera.aspect = size.w / size.h; camera.updateProjectionMatrix(); }
  function setQuality(pr, deco) {
    if (pr !== undefined && Math.abs(pr - q.pr) > 0.01) { q.pr = pr; renderer.setPixelRatio(pr); renderer.setSize(size.w, size.h, false); }
    if (deco !== undefined && deco !== q.deco) { q.deco = deco; for (const ci of [...chunks.keys()]) dropChunk(ci); }
  }
  function project(x, y, zs) { tmpV.set(x, y, -zs).project(camera); return { x: (tmpV.x * 0.5 + 0.5) * size.w, y: (-tmpV.y * 0.5 + 0.5) * size.h, behind: tmpV.z > 1 }; }
  function info() { return { calls: renderer.info.render.calls, tris: renderer.info.render.triangles, chunks: chunks.size, geos: renderer.info.memory.geometries, textures: renderer.info.memory.textures, pr: q.pr, deco: q.deco }; }
  // Testhilfe: Pixel des Spielfelds lesen
  const dom = renderer.domElement;
  return { frame, stageFrame, leaveStage, setLevel, reset, setChar, resize, setQuality, project, info, event, camera, scene, renderer, emit, get quality() { return q; }, get W() { return W; }, get dom() { return dom; }, get charKind() { return charKind; }, getChar, textTex, confetti };
}
