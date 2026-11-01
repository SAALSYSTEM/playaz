// Schattenschritt – Darstellung (three.js r128), Wischen/Tippen/Tasten, Levelauswahl, Ton.
// Regeln und Level stehen in logik.js / level.js. Modelle: KayKit (CC0, Kay Lousberg).
// Schurke, Skelette und Grund-Animationen kommen aus /spiele/kerkerlauf/ und /spiele/letzte-bastion/ (gemeinsam genutzt),
// Raum-Teile und Schleich-Animationen aus ./modelle/ (tools/schattenschritt-assets.mjs). Sounds aus /spiele/kerkerlauf/ und /spiele/letzte-bastion/.
import * as L from './logik.js?v=1';

const THREE = window.THREE;
const $ = (id) => document.getElementById(id);
const Q = new URLSearchParams(location.search);
const TEST = Q.has('test');
const col = (hex) => new THREE.Color(hex).convertSRGBToLinear();
const HANDY = matchMedia('(pointer: coarse)').matches;
const ZELLE = 2;                       // ein Feld = 2 × 2 m
const ROT = [Math.PI, Math.PI / 2, 0, -Math.PI / 2];   // Blickrichtung N/O/S/W → Drehung (Figuren schauen nach +z)
const KAPITEL = ['Kerker', 'Gruft', 'Turm'];
const DAUER = 0.24;                    // Dauer eines Zuges in Sekunden

// ---------- Spielstand ----------
let stand = ladeStand();
function ladeStand() { try { return L.pruefeStand(JSON.parse(localStorage.getItem(L.SCHLUESSEL))); } catch (e) { return L.leerStand(); } }
function speichere() { try { localStorage.setItem(L.SCHLUESSEL, JSON.stringify(stand)); } catch (e) {} }
const LEVEL = L.LEVEL.map((d) => L.baue(d));

// ---------- Renderer, Szene, Licht ----------
const canvas = $('c');
let renderer;
try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' }); }
catch (e) { $('ladeText').textContent = 'Dein Browser kann leider kein 3D (WebGL) anzeigen.'; throw e; }
let pixel = Math.min(window.devicePixelRatio || 1, 2);
renderer.setPixelRatio(pixel);
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.setClearColor(new THREE.Color('#121019'), 1);
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(col('#121019'), 40, 80);
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
scene.add(new THREE.HemisphereLight(col('#b9a8f0'), col('#2e2420'), 0.62));
const sonne = new THREE.DirectionalLight(col('#ffe2b8'), 0.62); sonne.position.set(-5, 16, 9); scene.add(sonne);
const laterne = new THREE.PointLight(col('#ffb066'), 1.0, 9, 1.6); scene.add(laterne);   // wandert mit dem Schurken

// ---------- Laden ----------
const loader = new THREE.GLTFLoader();
const ort = (n) => (n.startsWith('kl:') ? `../kerkerlauf/modelle/${n.slice(3)}.glb?v=1` : n.startsWith('lb:') ? `../letzte-bastion/modelle/${n.slice(3)}.glb?v=1` : `./modelle/${n}.glb?v=1`);
const ladeGlb = (n) => new Promise((ok, err) => loader.load(new URL(ort(n), import.meta.url).href, ok, undefined, err));

function entflechte(g, behalten) {
  for (const k of Object.keys(g.attributes)) {
    if (!behalten.includes(k)) { g.deleteAttribute(k); continue; }
    const a = g.attributes[k]; if (a.isInterleavedBufferAttribute) g.setAttribute(k, a.clone());
  }
  return g;
}
const matCache = new Map();
function lambert(m, skin) {
  const k = m.uuid + (skin ? 's' : '');
  if (!matCache.has(k)) matCache.set(k, new THREE.MeshLambertMaterial({ map: m.map || null, color: m.color, skinning: skin }));
  return matCache.get(k);
}
function bereiteFigur(gltf) {
  const root = gltf.scene, haut = [];
  root.traverse((o) => { if (o.isSkinnedMesh) haut.push(o); else if (o.isMesh) o.material = lambert(o.material, false); });
  if (haut.length > 1) {
    const geos = haut.map((m) => {
      const g = entflechte(m.geometry.clone(), ['position', 'normal', 'uv', 'skinIndex', 'skinWeight']);
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      return g.index ? g : g.setIndex([...Array(g.attributes.position.count).keys()]);
    });
    const mats = [...new Set(haut.map((m) => m.material))];
    const geo = THREE.BufferGeometryUtils.mergeBufferGeometries(geos, true);
    if (geo) {
      geo.groups.forEach((gr, i) => { gr.materialIndex = mats.indexOf(haut[i].material); });
      const sm = new THREE.SkinnedMesh(geo, mats.map((m) => lambert(m, true)));
      sm.name = 'Haut'; sm.frustumCulled = false;
      haut[0].parent.add(sm); sm.bind(haut[0].skeleton, haut[0].bindMatrix);
      haut.forEach((m) => m.parent.remove(m));
      return root;
    }
  }
  haut.forEach((m) => { m.material = lambert(m.material, true); m.frustumCulled = false; });
  return root;
}
// Raum-Teil (mit Kindern) als Geometrien mit Transformation
let raumMat = null, raum = null;
function backe(name, matrix) {
  const node = raum.getObjectByName(name);
  node.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(node.matrixWorld).invert(), geos = [];
  node.traverse((o) => {
    if (!o.isMesh) return;
    raumMat = raumMat || new THREE.MeshLambertMaterial({ map: o.material.map });
    const g = entflechte(o.geometry.clone(), ['position', 'normal', 'uv']);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(matrix, new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld)));
    geos.push(g.index ? g.toNonIndexed() : g);
  });
  return geos;
}
const M4 = new THREE.Matrix4(), QT = new THREE.Quaternion(), EU = new THREE.Euler(), V3 = new THREE.Vector3(), S3 = new THREE.Vector3();
const matrix = (x, y, z, ry = 0, sx = 1, sy = sx, sz = sx) => { EU.set(0, ry, 0); QT.setFromEuler(EU); V3.set(x, y, z); S3.set(sx, sy, sz); return M4.clone().compose(V3, QT, S3); };
const einzeln = (name, mat) => { const g = THREE.BufferGeometryUtils.mergeBufferGeometries(backe(name, mat)); return new THREE.Mesh(g, raumMat); };

const CLIPS = {};
// ---------- Leuchten (Fackeln, Ausgang, Schlüssel) ----------
function glutTextur() {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 1, 32, 32, 31); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,255,255,.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c);
}
const GLUT = glutTextur();
const leuchte = (farbe, groesse) => new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0], 3)),
  new THREE.PointsMaterial({ map: GLUT, size: groesse, color: col(farbe), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));

// ---------- Ton (Dateien aus /spiele/kerkerlauf/sound/ und /spiele/letzte-bastion/sound/) ----------
const SOUNDS = { musik: 'kl', fackel: 'kl', kill: 'kl', schwert: 'kl', muenze: 'kl', truhe: 'kl', sturz: 'kl', kombo: 'kl', rekord: 'kl', freischalten: 'kl', landung: 'kl', au: 'lb', zauber: 'lb' };
const LAUT = { kill: 0.6, schwert: 0.4, muenze: 0.55, truhe: 0.7, sturz: 0.6, kombo: 0.6, rekord: 0.7, freischalten: 0.7, landung: 0.16, au: 0.8, zauber: 0.4 };
const MUSIK = { menu: 0.26, spiel: 0.3, pause: 0.12, ende: 0.2, erwischt: 0.14 };
let audio = null, master = null, musikBus = null, fxBus = null, schleifenLaufen = false;
const puffer = {};
function audioStart() {
  try {
    if (!audio) {
      audio = new (window.AudioContext || window.webkitAudioContext)();
      master = audio.createGain(); master.connect(audio.destination);
      musikBus = audio.createGain(); musikBus.gain.value = 0; musikBus.connect(master);
      fxBus = audio.createGain(); fxBus.connect(master);
      for (const [n, wo] of Object.entries(SOUNDS)) {
        fetch(new URL(wo === 'kl' ? `../kerkerlauf/sound/${n}.mp3?v=3` : `../letzte-bastion/sound/${n}.mp3?v=1`, import.meta.url)).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(r.status)))
          .then((b) => new Promise((ok, err) => audio.decodeAudioData(b, ok, err)))
          .then((buf) => { puffer[n] = buf; if (n === 'musik' || n === 'fackel') starteSchleifen(); }).catch(() => {});
      }
    }
    if (audio.state === 'suspended' && !document.hidden) audio.resume();
    master.gain.value = stand.ton ? 1 : 0;
    musikLautstaerke();
  } catch (e) {}
}
function schleifenGrenzen(buf) {
  const d = buf.getChannelData(0); let a = 0, e = d.length - 1;
  while (a < d.length && Math.abs(d[a]) < 0.0015) a++;
  while (e > a && Math.abs(d[e]) < 0.0015) e--;
  return [a / buf.sampleRate, (e + 1) / buf.sampleRate];
}
function schleife(buf, ziel, laut) {
  const s = audio.createBufferSource(), g = audio.createGain();
  s.buffer = buf; s.loop = true; [s.loopStart, s.loopEnd] = schleifenGrenzen(buf);
  g.gain.value = laut; s.connect(g).connect(ziel); s.start(0, s.loopStart);
}
function starteSchleifen() {
  if (schleifenLaufen || !puffer.musik || !puffer.fackel) return;
  schleifenLaufen = true; schleife(puffer.musik, musikBus, 1); schleife(puffer.fackel, master, 0.3); musikLautstaerke();
}
function musikLautstaerke() { if (musikBus) musikBus.gain.setTargetAtTime(MUSIK[zustand] ?? 0.25, audio.currentTime, 0.35); }
addEventListener('pointerdown', audioStart, { capture: true });
addEventListener('keydown', audioStart, { capture: true });
document.addEventListener('visibilitychange', () => { if (!audio) return; if (document.hidden) audio.suspend(); else if (stand.ton) audio.resume(); });
function ton(art, hoehe = 1) {
  if (!stand.ton) return;
  try {
    audioStart();
    if (puffer[art]) {
      const s = audio.createBufferSource(), g = audio.createGain();
      s.buffer = puffer[art]; g.gain.value = LAUT[art] ?? 0.6; s.playbackRate.value = hoehe;
      s.connect(g).connect(fxBus); s.start(); return;
    }
    const t = audio.currentTime, o = audio.createOscillator(), g = audio.createGain();
    o.type = 'sine'; o.frequency.value = art === 'klick' ? 620 : art === 'stoss' ? 140 : 300;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.06, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
    o.connect(g).connect(fxBus); o.start(t); o.stop(t + 0.1);
  } catch (e) {}
}

// ---------- Zustand ----------
let zustand = 'laden';     // laden | menu | spiel | pause | erwischt | ende
let nr = 0, lv = null, lauf = null, verlauf = [];
let anim = null, warteschlange = null, hinweisBis = 0;
const CFG = () => window.PLAYSAAL_CFG || {};

// ---------- Figuren ----------
let heldVorlage = null, held = null;
const wachVorlagen = {};
const WACH_MODELL = { diener: 'kl:skelett-diener', krieger: 'kl:skelett-krieger', spaeher: 'lb:skelett-schurke', magier: 'lb:skelett-magier' };
function richteHeldEin(gltf) {
  const root = bereiteFigur(gltf); scene.add(root);
  const mixer = new THREE.AnimationMixer(root), a = {};
  for (const n of ['Crouching', 'Sneaking', 'Idle_A', 'Melee_Dualwield_Attack_Stab', 'Hit_A', 'Death_A', 'Cheering', 'PickUp']) a[n] = mixer.clipAction(CLIPS[n]);
  for (const n of ['Melee_Dualwield_Attack_Stab', 'Hit_A', 'Death_A', 'Cheering', 'PickUp']) { a[n].setLoop(THREE.LoopOnce, 1); a[n].clampWhenFinished = true; }
  held = { root, mixer, a, pose: null };
  mixer.addEventListener('finished', (e) => { if (e.action === a.Death_A || e.action === a.Cheering) return; heldPose('Crouching', 0.2); });
}
function heldPose(name, fade = 0.12, tempo = 1) {
  const neu = held.a[name], alt = held.pose && held.a[held.pose];
  if (held.pose === name && neu.isRunning() && name !== 'Melee_Dualwield_Attack_Stab') { neu.setEffectiveTimeScale(tempo); return; }
  neu.reset(); neu.setEffectiveTimeScale(tempo); neu.setEffectiveWeight(1); neu.play();
  if (alt && alt !== neu && fade > 0) neu.crossFadeFrom(alt, fade, false); else if (alt && alt !== neu) alt.stop();
  held.pose = name;
}
let wachen = [];   // je Wächter: { root, mixer, a, pose, art, ko }
const W_EINMAL = ['Skeletons_Death', 'Melee_1H_Attack_Chop', 'Ranged_Magic_Shoot', 'Skeletons_Taunt'];
function neueWache(art) {
  const root = THREE.SkeletonUtils.clone(wachVorlagen[art]);
  const mixer = new THREE.AnimationMixer(root), a = {};
  for (const n of ['Skeletons_Idle', 'Skeletons_Walking', ...W_EINMAL]) a[n] = mixer.clipAction(CLIPS[n]);
  for (const n of W_EINMAL) { a[n].setLoop(THREE.LoopOnce, 1); a[n].clampWhenFinished = true; }
  const w = { root, mixer, a, pose: null, art };
  mixer.addEventListener('finished', (e) => { if (e.action !== a.Skeletons_Death && w.pose !== 'Skeletons_Death') wPose(w, 'Skeletons_Idle', 0.2); });
  return w;
}
function wPose(w, name, fade = 0.15, tempo = 1) {
  if (w.pose === name && name !== 'Skeletons_Death') { w.a[name].setEffectiveTimeScale(tempo); return; }
  const neu = w.a[name], alt = w.pose && w.a[w.pose];
  neu.reset(); neu.setEffectiveTimeScale(tempo); neu.play();
  if (alt && alt !== neu && fade > 0) neu.crossFadeFrom(alt, fade, false); else if (alt && alt !== neu) alt.stop();
  w.pose = name;
}

// ---------- Level aufbauen ----------
let levelGruppe = null, tor = null, schluessel = null, muenzen = [], sichtHell = null, sichtSchwach = null, wegPunkte = null, drehZeichen = [];
const welt = (x, y, h = 0) => new THREE.Vector3((x - (lv.w - 1) / 2) * ZELLE, h, (y - (lv.h - 1) / 2) * ZELLE);
const hash = (x, y) => ((x * 73856093) ^ (y * 19349663) ^ (nr * 83492791)) >>> 0;

function feldTyp(x, y) { if (x < 0 || y < 0 || x >= lv.w || y >= lv.h) return '#'; return lv.feld[y * lv.w + x]; }
function baueLevel(n) {
  if (levelGruppe) { scene.remove(levelGruppe); levelGruppe.traverse((o) => { if (o.geometry && o.geometry !== kachelGeo) o.geometry.dispose(); }); }
  for (const w of wachen) scene.remove(w.root);
  nr = n; lv = LEVEL[n];
  levelGruppe = new THREE.Group(); scene.add(levelGruppe);
  const geos = [], fackeln = [];
  const p = (x, y) => welt(x, y);
  // Boden (mit Abwechslung), Mauerblöcke und Kisten, Rand ringsum
  for (let y = -1; y <= lv.h; y++) for (let x = -1; x <= lv.w; x++) {
    const c = feldTyp(x, y), v = p(x, y), h = hash(x + 5, y + 5);
    if (c === '#') {
      const rand = x < 0 || y < 0 || x >= lv.w || y >= lv.h;
      if (!rand && h % 10 < 3) {
        geos.push(...backe('floor_tile_small', matrix(v.x, 0, v.z)));
        const teil = ['crates_stacked', 'barrel_large', 'box_large'][h % 3];
        geos.push(...backe(teil, matrix(v.x, 0, v.z, (h % 4) * Math.PI / 2, teil === 'box_large' ? 1.25 : 0.95)));
      } else geos.push(...backe('floor_foundation_allsides', matrix(v.x, 0, v.z, 0, 0.92, rand ? 0.9 : 0.75, 0.92)));
      continue;
    }
    const boden = h % 9 === 0 ? 'floor_tile_small_broken_A' : h % 13 === 0 ? 'floor_tile_small_weeds_A' : 'floor_tile_small';
    geos.push(...backe(boden, matrix(v.x, 0, v.z, (h % 4) * Math.PI / 2)));
  }
  // Rückwand hinter dem Rand mit Fackeln und Bannern
  const breite = (lv.w + 2) * ZELLE, hinten = p(0, -2).z + 0.6;
  for (let i = 0; i < Math.ceil(breite / 4); i++) {
    const x = -breite / 2 + 2 + i * 4;
    geos.push(...backe('wall', matrix(x, 0, hinten)));
    if (i % 2 === 0) { geos.push(...backe('torch_mounted', matrix(x, 2.7, hinten + 0.5, 0, 1.3))); fackeln.push([x, 3.4, hinten + 0.9]); }
    else geos.push(...backe(i % 4 === 1 ? 'banner_shield_red' : 'banner_patternA_red', matrix(x, 0.4, hinten + 0.5)));
  }
  // Ausgang: offene Bodenluke mit Licht
  const z = p(lv.ziel[0], lv.ziel[1]);
  geos.push(...backe('floor_tile_grate_open', matrix(z.x, 0.02, z.z, 0, 0.5, 1, 1)));
  levelGruppe.add(new THREE.Mesh(THREE.BufferGeometryUtils.mergeBufferGeometries(geos), raumMat));
  const zl = leuchte('#ffd36b', 3.2); zl.position.set(z.x, 0.6, z.z); levelGruppe.add(zl);
  const zLicht = new THREE.PointLight(col('#ffcf6b'), 1.2, 6, 1.8); zLicht.position.set(z.x, 1.5, z.z); levelGruppe.add(zLicht);
  const zSaeule = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.9, 3, 16, 1, true), new THREE.MeshBasicMaterial({ color: col('#ffd36b'), transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
  zSaeule.position.set(z.x, 1.5, z.z); levelGruppe.add(zSaeule);
  for (const [x, y, zz] of fackeln) { const l = leuchte('#ffb15e', 2.4); l.position.set(x, y, zz); levelGruppe.add(l); }
  // Schattenfelder: dunkle Flächen am Boden
  const schatten = [];
  for (let y = 0; y < lv.h; y++) for (let x = 0; x < lv.w; x++) if (feldTyp(x, y) === ',') schatten.push(p(x, y));
  if (schatten.length) {
    const m = new THREE.InstancedMesh(kachelGeo, new THREE.MeshBasicMaterial({ color: 0x05040a, transparent: true, opacity: 0.62, depthWrite: false }), schatten.length);
    schatten.forEach((v, i) => m.setMatrixAt(i, matrix(v.x, 0.07, v.z, 0, 1.0)));
    m.renderOrder = 1; levelGruppe.add(m);
  }
  // Gittertor (fährt nach dem Schlüssel in den Boden), Schlüssel, Münzen
  tor = null; schluessel = null; muenzen = [];
  for (let y = 0; y < lv.h; y++) for (let x = 0; x < lv.w; x++) if (feldTyp(x, y) === 'T') {
    const v = p(x, y), quer = feldTyp(x - 1, y) === '#' || feldTyp(x + 1, y) === '#';
    tor = einzeln('wall_gated', matrix(0, 0, 0, quer ? 0 : Math.PI / 2, 0.5, 0.6, 0.6)); tor.position.copy(v); levelGruppe.add(tor);
  }
  if (lv.schluessel) {
    const v = p(...lv.schluessel); schluessel = einzeln('key', matrix(0, 0, 0, 0, 2.2)); schluessel.position.set(v.x, 1.0, v.z);
    const l = leuchte('#9fd8ff', 2.2); schluessel.add(l); levelGruppe.add(schluessel);
  }
  for (const [x, y] of lv.muenzen) {
    const v = p(x, y), m = einzeln('coin', new THREE.Matrix4().makeScale(3.2, 3.2, 3.2));
    m.position.set(v.x, 0.9, v.z); levelGruppe.add(m); muenzen.push(m);
  }
  // Sicht der Wachen (rot), Patrouillen-Wege (Punkte), Dreh-Zeichen
  sichtHell = new THREE.InstancedMesh(kachelGeo, new THREE.MeshBasicMaterial({ color: col('#ff3b30'), transparent: true, opacity: 0.4, depthWrite: false }), 120);
  sichtSchwach = new THREE.InstancedMesh(kachelGeo, new THREE.MeshBasicMaterial({ color: col('#ff3b30'), transparent: true, opacity: 0.14, depthWrite: false }), 120);
  sichtHell.renderOrder = sichtSchwach.renderOrder = 2; sichtHell.count = sichtSchwach.count = 0;
  levelGruppe.add(sichtHell, sichtSchwach);
  wegPunkte = new THREE.InstancedMesh(new THREE.CircleGeometry(0.16, 12).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: col('#ffe2a8'), transparent: true, opacity: 0.55, depthWrite: false }), 80);
  wegPunkte.count = 0; wegPunkte.renderOrder = 3; levelGruppe.add(wegPunkte);
  wachen = lv.waechter.map((g) => { const w = neueWache(g.art); scene.add(w.root); w.root.scale.setScalar(g.art === 'krieger' ? 1.1 : 1); return w; });
  drehZeichen = lv.waechter.map((g) => { if (g.weg.length > 1 || g.blicke.length < 2) return null; const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: drehTextur, transparent: true, depthWrite: false })); s.scale.setScalar(0.9); levelGruppe.add(s); return s; });
  passeKameraAn();
}
const kachelGeo = new THREE.PlaneGeometry(ZELLE * 0.94, ZELLE * 0.94).rotateX(-Math.PI / 2);
const drehTextur = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  g.strokeStyle = '#ffd21c'; g.lineWidth = 7; g.lineCap = 'round'; g.beginPath(); g.arc(32, 32, 20, -2.6, 1.6); g.stroke();
  g.fillStyle = '#ffd21c'; g.beginPath(); g.moveTo(32 + 20 * Math.cos(1.6) - 10, 32 + 20 * Math.sin(1.6) - 2); g.lineTo(32 + 20 * Math.cos(1.6) + 6, 32 + 20 * Math.sin(1.6) - 10); g.lineTo(32 + 20 * Math.cos(1.6) + 4, 32 + 20 * Math.sin(1.6) + 8); g.fill();
  return new THREE.CanvasTexture(c);
})();

// Kamera so, dass das ganze Level (mit Rand) zwischen HUD oben und Knöpfen unten passt
const kZiel = new THREE.Vector3(), kPos = new THREE.Vector3();
function passeKameraAn() {
  if (!lv) return;
  const hoch = camera.aspect < 0.8, winkel = hoch ? 1.2 : 1.0;   // Neigung (Bogenmaß über dem Boden)
  const ecken = [];
  for (const [x, y] of [[-1, -1.3], [lv.w, -1.3], [-1, lv.h], [lv.w, lv.h]]) for (const hgt of [0, 1.6]) ecken.push(welt(x, y, hgt).add(new THREE.Vector3(x < 0 ? -1 : 1, 0, y < 0 ? -1 : 1)));
  const oben = 1 - (hoch ? 150 : 110) / innerHeight * 2, unten = -1 + (hoch ? 100 : 90) / innerHeight * 2;
  let dz = 0, abstand = 20;
  for (let runde = 0; runde < 3; runde++) {
    let lo = 4, hi = 120;
    for (let i = 0; i < 26; i++) {
      const d = (lo + hi) / 2; setzeKamera(d, dz, winkel);
      let ok = true; for (const e of ecken) { const q = e.clone().project(camera); if (Math.abs(q.x) > 0.96 || q.y > oben || q.y < unten) { ok = false; break; } }
      if (ok) hi = d; else lo = d;
    }
    abstand = hi; setzeKamera(abstand, dz, winkel);
    let ymin = 9, ymax = -9; for (const e of ecken) { const q = e.clone().project(camera); ymin = Math.min(ymin, q.y); ymax = Math.max(ymax, q.y); }
    dz -= ((ymin + ymax) / 2 - (oben + unten) / 2) * abstand * 0.35;
  }
  kZiel.copy(camera.userData.ziel); kPos.copy(camera.position);
}
function setzeKamera(d, dz, winkel) {
  const ziel = new THREE.Vector3(0, 0, dz);
  camera.position.set(0, Math.sin(winkel) * d, dz + Math.cos(winkel) * d);
  camera.lookAt(ziel); camera.updateMatrixWorld(); camera.userData.ziel = ziel;
}

// ---------- Darstellung des Zustands ----------
function zeigeSicht() {
  const m = new THREE.Matrix4(); let h = 0, s = 0, wp = 0;
  if (lauf.status === 'spiel' || lauf.status === 'erwischt') for (let i = 0; i < lv.waechter.length; i++) for (const f of L.sichtfeld(lauf, i)) {
    const v = welt(f.x, f.y), schwach = feldTyp(f.x, f.y) === ',' && f.d > 1;
    m.makeTranslation(v.x, 0.09, v.z);
    if (schwach) sichtSchwach.setMatrixAt(s++, m); else sichtHell.setMatrixAt(h++, m);
  }
  sichtHell.count = h; sichtSchwach.count = s; sichtHell.instanceMatrix.needsUpdate = true; sichtSchwach.instanceMatrix.needsUpdate = true;
  lv.waechter.forEach((g, i) => {
    if (lauf.ko[i] || g.weg.length < 2) return;
    const zellen = new Set(g.weg.map((c) => c.join()));
    for (const c of zellen) { const [x, y] = c.split(',').map(Number), v = welt(x, y); m.makeTranslation(v.x, 0.1, v.z); wegPunkte.setMatrixAt(wp++, m); }
  });
  wegPunkte.count = wp; wegPunkte.instanceMatrix.needsUpdate = true;
}
// Alles sofort auf den Zustand setzen (Levelstart, Zurück, Neustart)
function stelleDar() {
  const v = welt(lauf.x, lauf.y); held.root.position.copy(v); held.root.rotation.y = ROT[lauf.blick] ?? 0;
  held.mixer.stopAllAction(); held.pose = null; heldPose('Crouching', 0);
  lv.waechter.forEach((g, i) => {
    const w = wachen[i], s = L.wache(lv, i, lauf.t), p = welt(s.x, s.y);
    w.root.position.copy(p); w.root.rotation.y = ROT[s.b]; w.mixer.stopAllAction(); w.pose = null;
    w.root.visible = !lauf.ko[i]; w.weg = 0;
    if (!lauf.ko[i]) wPose(w, 'Skeletons_Idle', 0);
  });
  muenzen.forEach((m, i) => { m.visible = !lauf.muenzen[i]; m.userData.weg = 0; m.scale.setScalar(1); });
  if (schluessel) { schluessel.visible = !lauf.schluessel; schluessel.userData.weg = 0; schluessel.scale.setScalar(1); }
  if (tor) tor.position.y = lauf.schluessel ? -2.6 : 0;
  anim = null; zeigeSicht(); hud();
}
function hud() {
  $('hLevel').textContent = `Level ${nr + 1}`;
  $('hName').textContent = lv.name;
  const z = $('hZuege'); z.innerHTML = `${lauf.zuege}<small class="par"> / ${lv.zuege}</small>`; z.classList.toggle('drueber', lauf.zuege > lv.zuege);
  $('hMuenzen').textContent = `${lauf.muenzen.filter(Boolean).length}/${lv.muenzen.length}`;
  $('bZurueck').disabled = !verlauf.length;
}

// ---------- Züge ----------
function versuche(r) {
  if (zustand !== 'spiel') return;
  if (anim) { warteschlange = r; return; }
  const vorher = L.kopie(lauf), ev = L.zug(lauf, r);
  if (ev[0] && ev[0].typ === 'blockiert') {
    held.root.rotation.y = ROT[r]; ton('stoss');
    stoss = { r, t: 0 };
    return;
  }
  verlauf.push(vorher);
  if (hinweisBis && performance.now() > hinweisBis - 3500) { hinweisBis = 0; zeigeHinweis(''); }
  // Bewegung von vorher → jetzt über DAUER Sekunden
  anim = { t: 0, von: welt(vorher.x, vorher.y), nach: welt(lauf.x, lauf.y), drehVon: held.root.rotation.y, drehNach: r < 4 ? ROT[r] : held.root.rotation.y,
    wachen: lv.waechter.map((g, i) => { const a = L.wache(lv, i, vorher.t), b = L.wache(lv, i, lauf.t); return { von: welt(a.x, a.y), nach: welt(b.x, b.y), drehVon: wachen[i].root.rotation.y, drehNach: ROT[b.b], geht: a.x !== b.x || a.y !== b.y }; }),
    ev };
  if (r < 4) { heldPose('Sneaking', 0.08, 1.5); ton('landung', 1.5 + Math.random() * 0.2); }
  anim.wachen.forEach((a, i) => { if (a.geht && !lauf.ko[i]) wPose(wachen[i], 'Skeletons_Walking', 0.1, 1.4); });
  for (const e of ev) {
    if (e.typ === 'ko') {
      heldPose('Melee_Dualwield_Attack_Stab', 0.05, 1.6); ton('schwert'); setTimeout(() => ton('kill'), 120);
      const w = wachen[e.i]; w.weg = 0.001; wPose(w, 'Skeletons_Death', 0.05, 1.3);
      // fällt vom Schurken weg
      w.root.rotation.y = Math.atan2(held.root.position.x - w.root.position.x, held.root.position.z - w.root.position.z);
    }
    if (e.typ === 'muenze') { ton('muenze'); popup('+1 Münze', 'gold'); weg(muenzen[e.i]); }
    if (e.typ === 'schluessel') { ton('kombo'); popup('Schlüssel! Das Tor ist offen', 'gold'); setTimeout(() => ton('truhe'), 250); weg(schluessel); }
  }
  zeigeSicht(); hud();
}
// Eingesammeltes kurz hochschweben lassen, dann ausblenden
function weg(m) { if (!m) return; m.userData.weg = 0.0001; }
function zugFertig() {
  const ev = anim.ev; anim = null;
  for (let i = 0; i < wachen.length; i++) if (!lauf.ko[i] && wachen[i].pose === 'Skeletons_Walking') wPose(wachen[i], 'Skeletons_Idle', 0.15);
  if (held.pose === 'Sneaking') heldPose('Crouching', 0.15);
  const e = ev.find((x) => x.typ === 'erwischt' || x.typ === 'geschafft');
  if (e && e.typ === 'erwischt') return erwischt(e.i);
  if (e && e.typ === 'geschafft') return geschafft();
  if (warteschlange !== null) { const r = warteschlange; warteschlange = null; versuche(r); }
}
function zurueck() {
  if (!verlauf.length || (zustand !== 'spiel' && zustand !== 'erwischt')) return;
  lauf = verlauf.pop(); warteschlange = null; zustand = 'spiel'; zeige(null); stelleDar(); ton('klick');
}
function neustart() { lauf = L.neuerLauf(lv); verlauf = []; warteschlange = null; zustand = 'spiel'; zeige(null); stelleDar(); }
function erwischt(i) {
  zustand = 'erwischt';
  const w = wachen[i], g = lv.waechter[i];
  const zu = new THREE.Vector3().subVectors(held.root.position, w.root.position);
  w.root.rotation.y = Math.atan2(zu.x, zu.z);
  wPose(w, g.art === 'magier' ? 'Ranged_Magic_Shoot' : 'Melee_1H_Attack_Chop', 0.05, 1.2);
  held.root.rotation.y = Math.atan2(-zu.x, -zu.z);
  ton(g.art === 'magier' ? 'zauber' : 'schwert');
  setTimeout(() => { ton('au'); heldPose('Death_A', 0.08, 1.2); }, 320);
  $('xGrund').textContent = `${L.ARTEN[g.art].name} hat dich gesehen.`;
  setTimeout(() => { if (zustand === 'erwischt') { zeige('erwischt'); musikLautstaerke(); } }, 1000);
}
function geschafft() {
  zustand = 'ende';
  const s = L.sterne(lauf), alt = stand.sterne[nr] || 0, neu = L.verbuche(stand, nr, s); speichere();
  heldPose('Cheering', 0.15);
  ton(s === 3 ? 'rekord' : 'kombo');
  const st = $('eSterne').children; for (let i = 0; i < 3; i++) st[i].className = 'stern' + (i < s ? ' an' : '');
  const alle = L.alleMuenzen(lauf), schnell = lauf.zuege <= lv.zuege;
  $('eZiele').innerHTML = [['Ausgang erreicht', true], [lv.muenzen.length ? `Alle Münzen (${lauf.muenzen.filter(Boolean).length}/${lv.muenzen.length})` : 'Alle Münzen (keine im Level)', alle], [`Höchstens ${lv.zuege} Züge (du: ${lauf.zuege})`, schnell]]
    .map(([t, ok]) => `<li class="${ok ? '' : 'nein'}"><span class="stern${ok ? ' an' : ''}"></span>${t}</li>`).join('');
  $('eTitel').textContent = s === 3 ? 'Meisterdieb!' : 'Geschafft!';
  $('eRekord').textContent = neu && alt ? `Neuer Bestwert: ${s} Sterne` : !neu && alt > s ? `Dein Bestwert: ${alt} Sterne` : '';
  const weiter = nr + 1 < LEVEL.length;
  $('eWeiter').hidden = !weiter;
  setTimeout(() => { if (zustand === 'ende') { zeige('ende'); musikLautstaerke(); if (neu && s > alt) ton('freischalten'); (weiter ? $('eWeiter') : $('eMenu')).focus({ preventScroll: true }); } }, 900);
}

// ---------- Oberfläche ----------
function zeige(id) {
  for (const s of ['menu', 'pause', 'ende', 'laden', 'erwischt']) $(s).hidden = s !== id;
  const spiel = id === null || id === 'pause' || id === 'erwischt';
  $('hud').hidden = !spiel; $('steuer').hidden = id !== null;
  document.body.classList.toggle('im-lauf', id === null || id === 'erwischt');
  document.body.classList.toggle('im-menu', id === 'menu');
  setTimeout(musikLautstaerke, 0);
}
function tonKnoepfe() { for (const id of ['mTon', 'pTon']) { $(id).textContent = 'Ton: ' + (stand.ton ? 'an' : 'aus'); $(id).setAttribute('aria-pressed', String(stand.ton)); } }
function naechstesOffenes() { for (let i = 0; i < LEVEL.length; i++) if (!stand.sterne[i]) return L.offen(stand, i) ? i : Math.max(0, i - 1); return LEVEL.length - 1; }
function zeigeMenu() {
  zustand = 'menu'; zeige('menu');
  const jetzt = naechstesOffenes();
  if (!lv || nr !== jetzt) { baueLevel(jetzt); lauf = L.neuerLauf(lv); verlauf = []; }
  stelleDar(); sichtHell.count = sichtSchwach.count = 0;
  $('mSterne').textContent = String(L.sterneGesamt(stand)); $('mMax').textContent = String(LEVEL.length * 3);
  const box = $('mLevel'); box.textContent = '';
  for (let k = 0; k < KAPITEL.length; k++) {
    const von = k * 8, bis = Math.min(LEVEL.length, von + 8); if (von >= LEVEL.length) break;
    const sek = document.createElement('section'); sek.className = 'kapitel';
    const summe = stand.sterne.slice(von, bis).reduce((a, b) => a + (b || 0), 0);
    sek.innerHTML = `<h3>Kapitel ${k + 1}: ${KAPITEL[k]}<small>${summe}/${(bis - von) * 3} ★</small></h3>`;
    const r = document.createElement('div'); r.className = 'raster';
    for (let i = von; i < bis; i++) {
      const b = document.createElement('button'); b.type = 'button'; const s = stand.sterne[i] || 0;
      b.disabled = !L.offen(stand, i); if (i === jetzt) b.className = 'jetzt';
      b.innerHTML = b.disabled ? '<b>🔒</b>' : `<b>${i + 1}</b><span class="s">${[0, 1, 2].map((j) => `<span class="stern${j < s ? ' an' : ''}"></span>`).join('')}</span>`;
      b.setAttribute('aria-label', `Level ${i + 1}: ${LEVEL[i].name}${b.disabled ? ' (gesperrt)' : `, ${s} Sterne`}`);
      b.addEventListener('click', () => { ton('klick'); starte(i); });
      r.appendChild(b);
    }
    sek.appendChild(r); box.appendChild(sek);
  }
  $('mStart').textContent = L.sterneGesamt(stand) ? `Weiter: Level ${jetzt + 1}` : 'Los geht\'s!';
  tonKnoepfe();
  const aktiv = box.querySelector('.jetzt'); if (aktiv) aktiv.scrollIntoView({ block: 'center' });
}
function starte(n) {
  if (n !== nr || !lv) baueLevel(n);
  lauf = L.neuerLauf(lv); verlauf = []; warteschlange = null;
  zustand = 'spiel'; zeige(null); stelleDar();
  if (lv.tipp && !(stand.sterne[n] > 0)) { zeigeHinweis(lv.tipp); hinweisBis = performance.now() + 9000; } else { zeigeHinweis(''); hinweisBis = 0; }
}
function pausiere() { if (zustand !== 'spiel') return; zustand = 'pause'; zeige('pause'); tonKnoepfe(); }
function weiter() { if (zustand !== 'pause') return; zustand = 'spiel'; zeige(null); }
function zeigeHinweis(html) { const h = $('hinweis'); h.innerHTML = html; h.hidden = !html; }
function popup(text, klasse = '') {
  const s = document.createElement('span'); s.textContent = text; if (klasse) s.className = klasse;
  const p = $('pop'); p.appendChild(s); setTimeout(() => s.remove(), 1100);
  while (p.children.length > 2) p.firstChild.remove();
}
$('mStart').addEventListener('click', () => { ton('klick'); starte(naechstesOffenes()); });
for (const id of ['mTon', 'pTon']) $(id).addEventListener('click', () => { stand.ton = !stand.ton; speichere(); tonKnoepfe(); audioStart(); ton('klick'); });
$('bPause').addEventListener('click', pausiere);
$('pWeiter').addEventListener('click', weiter);
$('pNeu').addEventListener('click', neustart);
$('pMenu').addEventListener('click', zeigeMenu);
$('bZurueck').addEventListener('click', zurueck);
$('bWarten').addEventListener('click', () => versuche(4));
$('bNeu').addEventListener('click', () => { ton('klick'); neustart(); });
$('xZurueck').addEventListener('click', zurueck);
$('xNeu').addEventListener('click', neustart);
$('eWeiter').addEventListener('click', () => { ton('klick'); starte(nr + 1); });
$('eNochmal').addEventListener('click', () => { ton('klick'); starte(nr); });
$('eMenu').addEventListener('click', zeigeMenu);

// ---------- Eingabe: Wischen, Tippen aufs Nachbarfeld, Tasten ----------
const fang = $('fang');
let druck = null;
const ray = new THREE.Raycaster(), boden = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), treffer = new THREE.Vector3(), ndc = new THREE.Vector2();
fang.addEventListener('pointerdown', (e) => { e.preventDefault(); druck = { x: e.clientX, y: e.clientY, id: e.pointerId }; });
fang.addEventListener('pointerup', (e) => {
  if (!druck || e.pointerId !== druck.id) return;
  const dx = e.clientX - druck.x, dy = e.clientY - druck.y; druck = null;
  if (Math.hypot(dx, dy) > 26) { versuche(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : (dy > 0 ? 2 : 0)); return; }
  // Tippen: aufs Nachbarfeld = dorthin gehen, aufs eigene Feld = warten
  ndc.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera); if (!ray.ray.intersectPlane(boden, treffer)) return;
  const x = Math.round(treffer.x / ZELLE + (lv.w - 1) / 2), y = Math.round(treffer.z / ZELLE + (lv.h - 1) / 2);
  const dxz = x - lauf.x, dyz = y - lauf.y;
  if (dxz === 0 && dyz === 0) versuche(4);
  else if (Math.abs(dxz) + Math.abs(dyz) === 1) versuche(dyz < 0 ? 0 : dxz > 0 ? 1 : dyz > 0 ? 2 : 3);
});
fang.addEventListener('pointercancel', () => { druck = null; });
fang.addEventListener('contextmenu', (e) => e.preventDefault());
const TASTE = { ArrowUp: 0, KeyW: 0, ArrowRight: 1, KeyD: 1, ArrowDown: 2, KeyS: 2, ArrowLeft: 3, KeyA: 3, Space: 4, Enter: 4 };
addEventListener('keydown', (e) => {
  if (zustand === 'spiel' && TASTE[e.code] !== undefined) { e.preventDefault(); versuche(TASTE[e.code]); return; }
  if ((zustand === 'spiel' || zustand === 'erwischt') && (e.code === 'KeyZ' || e.code === 'Backspace')) { e.preventDefault(); zurueck(); return; }
  if ((zustand === 'spiel' || zustand === 'erwischt') && e.code === 'KeyR') { neustart(); return; }
  if (e.code === 'Escape' || e.code === 'KeyP') { if (zustand === 'spiel') pausiere(); else if (zustand === 'pause') weiter(); }
});
document.addEventListener('visibilitychange', () => { if (document.hidden && zustand === 'spiel') pausiere(); });
for (const ev of ['gesturestart', 'dblclick']) document.addEventListener(ev, (e) => e.preventDefault());
document.addEventListener('touchmove', (e) => { if (e.touches.length > 1 || zustand === 'spiel') e.preventDefault(); }, { passive: false });

// ---------- Hauptschleife ----------
let letzte = performance.now(), stoss = null;
const lerpWinkel = (a, b, t) => { let d = ((b - a + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI; return a + d * t; };
function frame(jetzt) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (jetzt - letzte) / 1000); letzte = jetzt;
  if (zustand === 'laden') return;
  if (anim && zustand !== 'pause') {
    anim.t = Math.min(1, anim.t + dt / DAUER);
    const k = anim.t < 0.5 ? 2 * anim.t * anim.t : 1 - Math.pow(-2 * anim.t + 2, 2) / 2;
    held.root.position.lerpVectors(anim.von, anim.nach, k);
    held.root.rotation.y = lerpWinkel(anim.drehVon, anim.drehNach, Math.min(1, anim.t * 2.5));
    anim.wachen.forEach((a, i) => {
      if (lauf.ko[i]) return;
      wachen[i].root.position.lerpVectors(a.von, a.nach, k);
      wachen[i].root.rotation.y = lerpWinkel(a.drehVon, a.drehNach, Math.min(1, anim.t * 2));
    });
    if (anim.t >= 1) zugFertig();
  }
  if (stoss) { stoss.t += dt; const s = Math.sin(Math.min(1, stoss.t / 0.18) * Math.PI) * 0.25, v = welt(lauf.x, lauf.y); held.root.position.set(v.x + L.DX[stoss.r] * s, 0, v.z + L.DY[stoss.r] * s); if (stoss.t > 0.18) stoss = null; }
  if (zustand !== 'pause') {
    held.mixer.update(dt);
    for (const w of wachen) {
      w.mixer.update(dt);
      // ausgeschaltet: nach dem Umfallen im Boden versinken
      if (w.weg > 0) { w.weg += dt; if (w.weg > 1.1) w.root.position.y = -(w.weg - 1.1) * 1.6; if (w.weg > 2) { w.root.visible = false; w.weg = 0; } }
    }
  }
  if (lv) {
    const t = jetzt / 1000;
    muenzen.forEach((m, i) => { m.rotation.set(0.5, t * 2 + i, 0); m.position.y = 0.7 + Math.sin(t * 3 + i) * 0.08; });
    if (schluessel) { schluessel.rotation.y = t * 1.6; schluessel.position.y = 1.0 + Math.sin(t * 2.4) * 0.1; }
    for (const m of [...muenzen, schluessel]) {
      if (!m || !m.userData.weg) continue;
      const w = (m.userData.weg += dt); m.position.y += w * 4; m.scale.setScalar(Math.max(0.01, 1 - w * 2.2));
      if (w > 0.45) { m.visible = false; m.userData.weg = 0; m.scale.setScalar(1); }
    }
    if (tor && lauf && lauf.schluessel && tor.position.y > -2.6) tor.position.y = Math.max(-2.6, tor.position.y - dt * 3.2);
    drehZeichen.forEach((s, i) => { if (!s) return; s.visible = !lauf.ko[i]; s.position.copy(wachen[i].root.position).setY(2.9); s.material.rotation = -t * 2; });
    laterne.position.copy(held.root.position).add(new THREE.Vector3(0, 2.6, 0.8));
  }
  if (hinweisBis && performance.now() > hinweisBis) { hinweisBis = 0; zeigeHinweis(''); }
  renderer.render(scene, camera);
}
function groesse() {
  renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.fov = camera.aspect < 0.8 ? 52 : 44; camera.updateProjectionMatrix();
  passeKameraAn();
}
addEventListener('resize', groesse);

async function start() {
  const namen = ['raum', 'kl:held-schurke', 'kl:skelett-diener', 'kl:skelett-krieger', 'lb:skelett-schurke', 'lb:skelett-magier',
    'anim-schleichen', 'kl:anim-allgemein', 'kl:anim-jubel', 'kl:anim-skelett', 'kl:anim-magie', 'lb:anim-special', 'lb:anim-combatmelee'];
  let fertig = 0; const balken = $('ladeBalken');
  try {
    const g = await Promise.all(namen.map((n) => ladeGlb(n).then((x) => { fertig++; balken.style.width = (fertig / namen.length * 100) + '%'; return x; })));
    for (const a of g.slice(6)) for (const c of a.animations) CLIPS[c.name] = c;
    raum = g[0].scene; raum.updateMatrixWorld(true);
    richteHeldEin(g[1]);
    Object.assign(wachVorlagen, { diener: bereiteFigur(g[2]), krieger: bereiteFigur(g[3]), spaeher: bereiteFigur(g[4]), magier: bereiteFigur(g[5]) });
  } catch (e) {
    $('ladeText').textContent = 'Der Kerker konnte nicht geladen werden. Bitte Seite neu laden.';
    console.error(e); return;
  }
  renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.fov = camera.aspect < 0.8 ? 52 : 44; camera.updateProjectionMatrix();
  const n = TEST && Q.get('level') ? Number(Q.get('level')) - 1 : -1;
  if (n >= 0) { baueLevel(n); starte(n); } else zeigeMenu();
  requestAnimationFrame(frame);
}
start();

// Für die Browserprüfung (tests/schattenschritt-browser.test.mjs)
window.__schatten = {
  get zustand() { return zustand; }, get nr() { return nr; }, get lauf() { return lauf; }, get stand() { return stand; }, get verlauf() { return verlauf.length; },
  get beschaeftigt() { return !!anim; },
  get held() { return held && { pose: held.pose, x: held.root.position.x, z: held.root.position.z }; },
  get wachen() { return wachen.map((w) => ({ art: w.art, pose: w.pose })); },
  get sicht() { return sichtHell ? sichtHell.count + sichtSchwach.count : 0; },
  get zeichnungen() { return renderer.info.render.calls; }, get clips() { return Object.keys(CLIPS); },
  get ton() { return { geladen: Object.keys(puffer).sort(), schleifen: schleifenLaufen }; },
  bildschirm(x, y) { const v = welt(x, y, 0).project(camera); return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight }; },
  ...(TEST ? {
    // Foto für Kachel/Teilen-Bild: Oberfläche aus, ein paar Züge im Level, Kamera etwas näher
    foto() { document.body.classList.add('foto'); zeigeHinweis(''); hinweisBis = 0; for (const c of 'www') { L.zug(lauf, 'NOSWw'.indexOf(c)); } stelleDar(); camera.position.lerp(camera.userData.ziel, 0.12); },
  } : {}),
};
