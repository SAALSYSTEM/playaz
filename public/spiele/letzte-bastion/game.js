// Letzte Bastion – Darstellung (three.js r128), Tippen zum Zuschlagen, Upgrades, Menüs, Ton, Rangliste.
// Regeln (deterministisch, vom Server nachspielbar) stehen in logik.js.
// Modelle: KayKit (CC0, Kay Lousberg). Helden, Diener/Krieger und Grund-Animationen kommen aus /spiele/kerkerlauf/modelle/
// (gemeinsam genutzt), Magier/Schurke-Skelett, Zusatz-Animationen und der Raum aus ./modelle/ (tools/bastion-assets.mjs).
// Sounds und Musik ebenfalls aus /spiele/kerkerlauf/sound/.
import * as L from './logik.js?v=1';

const THREE = window.THREE;
const $ = (id) => document.getElementById(id);
const Q = new URLSearchParams(location.search);
const TEST = Q.has('test');
const col = (hex) => new THREE.Color(hex).convertSRGBToLinear();
const HANDY = matchMedia('(pointer: coarse)').matches;
const GRAD = 180 / Math.PI;

// ---------- Spielstand ----------
let stand = ladeStand();
function ladeStand() { try { return L.pruefeStand(JSON.parse(localStorage.getItem(L.SCHLUESSEL))); } catch (e) { return L.leerStand(); } }
function speichere() { try { localStorage.setItem(L.SCHLUESSEL, JSON.stringify(stand)); } catch (e) {} }

// ---------- Renderer, Szene, Licht ----------
const canvas = $('c');
let renderer;
try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' }); }
catch (e) { $('ladeText').textContent = 'Dein Browser kann leider kein 3D (WebGL) anzeigen.'; throw e; }
let pixel = Math.min(window.devicePixelRatio || 1, 2);
renderer.setPixelRatio(pixel);
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.setClearColor(new THREE.Color('#16131d'), 1);
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(col('#16131d'), 30, 60);
const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 200);
scene.add(new THREE.HemisphereLight(col('#b9a8f0'), col('#2e2420'), 0.6));
const sonne = new THREE.DirectionalLight(col('#ffe2b8'), 0.7); sonne.position.set(-4, 14, 8); scene.add(sonne);
const glut = new THREE.PointLight(col('#ffab52'), 1.3, 14, 1.6); glut.position.set(0, 4.5, 0.5); scene.add(glut);

// ---------- Laden ----------
const loader = new THREE.GLTFLoader();
const ort = (n) => (n.startsWith('kl:') ? `../kerkerlauf/modelle/${n.slice(3)}.glb?v=1` : `./modelle/${n}.glb?v=1`);
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
// Raum-Teil in eine Geometrie backen (mit Kind-Knoten), Transformation anwenden
let raumMat = null;
function backe(node, matrix) {
  node.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(node.matrixWorld).invert(), geos = [];
  node.traverse((o) => {
    if (!o.isMesh || /_door$/.test(o.name)) return;   // Tore stehen offen: die Skelette kommen durch
    raumMat = raumMat || new THREE.MeshLambertMaterial({ map: o.material.map });
    const g = entflechte(o.geometry.clone(), ['position', 'normal', 'uv']);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(matrix, new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld)));
    geos.push(g.index ? g.toNonIndexed() : g);
  });
  return geos;
}

const CLIPS = {};
const ANGRIFF_CLIP = { ritter: 'Melee_1H_Attack_Slice_Horizontal', barbar: 'Melee_1H_Attack_Chop', waldlaeufer: 'Melee_1H_Attack_Slice_Horizontal', schurke: 'Melee_Dualwield_Attack_Slice', magier: 'Ranged_Magic_Shoot' };

// ---------- Held ----------
const FIGUR = 1.3;   // Figuren etwas größer zeigen als im Kerkerlauf, damit man sie von oben gut erkennt
const heldGruppe = new THREE.Group(); scene.add(heldGruppe);
const heldModelle = {}, heldLaedt = {};
let held = null;
function richteHeldEin(name, gltf) {
  const root = bereiteFigur(gltf); root.visible = false; heldGruppe.add(root);
  const mixer = new THREE.AnimationMixer(root), a = {};
  for (const [n, c] of Object.entries(CLIPS)) a[n] = mixer.clipAction(c);
  for (const n of ['Death_A', 'Cheering', 'Hit_B', 'Melee_2H_Attack_Spin', ANGRIFF_CLIP[name]]) { a[n].setLoop(THREE.LoopOnce, 1); a[n].clampWhenFinished = true; }
  const h = { name, root, mixer, a, pose: null };
  mixer.addEventListener('finished', (e) => {
    if (h !== held || e.action === a.Death_A) return;
    zeigePose(zustand === 'menu' ? 'Idle_A' : 'Melee_2H_Idle', 0.2);
  });
  heldModelle[name] = h; return h;
}
function ladeHeld(name) {
  if (heldModelle[name]) return Promise.resolve(heldModelle[name]);
  return (heldLaedt[name] = heldLaedt[name] || ladeGlb('kl:held-' + name).then((g) => richteHeldEin(name, g)));
}
function waehleHeld(name) {
  for (const h of Object.values(heldModelle)) h.root.visible = false;
  held = heldModelle[name]; held.root.visible = true; held.pose = null; held.mixer.stopAllAction();
  zeigePose(zustand === 'menu' ? 'Idle_A' : 'Melee_2H_Idle', 0);
}
function zeigePose(name, fade = 0.12, tempo = 1) {
  if (!held) return;
  const neu = held.a[name]; if (!neu) return;
  const alt = held.pose && held.a[held.pose];
  neu.reset(); neu.setEffectiveTimeScale(tempo); neu.setEffectiveWeight(1); neu.play();
  if (alt && alt !== neu && fade > 0) neu.crossFadeFrom(alt, fade, false); else if (alt && alt !== neu) alt.stop();
  held.pose = name;
}

// ---------- Skelette (Pool je Art) ----------
const POOL = 10;
const pool = { diener: [], krieger: [], schurke: [], magier: [] };
const SK_EINMAL = ['Skeletons_Death', 'Skeletons_Awaken_Floor', 'Melee_1H_Attack_Chop', 'Hit_B', 'Ranged_Magic_Shoot', 'Skeletons_Taunt'];
function baueSkelette(vorlagen) {
  for (const art of Object.keys(pool)) for (let i = 0; i < POOL; i++) {
    const root = THREE.SkeletonUtils.clone(vorlagen[art]); root.visible = false; scene.add(root);
    const mixer = new THREE.AnimationMixer(root), a = {};
    for (const n of ['Skeletons_Idle', 'Skeletons_Walking', ...SK_EINMAL]) { a[n] = mixer.clipAction(CLIPS[n]); }
    for (const n of SK_EINMAL) { a[n].setLoop(THREE.LoopOnce, 1); a[n].clampWhenFinished = true; }
    const s = { root, mixer, a, e: null, pose: null };
    mixer.addEventListener('finished', (ev) => { if (s.e && !s.e.tot && ev.action !== a.Skeletons_Death) s.pose = null; });
    pool[art].push(s);
  }
}
function skPose(s, name, fade = 0.15, tempo = 1) {
  if (s.pose === name) return;
  const neu = s.a[name], alt = s.pose && s.a[s.pose];
  neu.reset(); neu.setEffectiveTimeScale(tempo); neu.play();
  if (alt && alt !== neu && fade > 0) neu.crossFadeFrom(alt, fade, false); else if (alt && alt !== neu) alt.stop();
  s.pose = name;
}

// ---------- Raum bauen (statisch, alles in einer Geometrie) ----------
function baueRaum(raum) {
  const teil = (n) => raum.getObjectByName(n);
  const geos = [], M = new THREE.Matrix4(), Qn = new THREE.Quaternion(), E = new THREE.Euler(), V = new THREE.Vector3(), S = new THREE.Vector3();
  const setze = (n, x, y, z, ry = 0, s = 1, sy = s) => { E.set(0, ry, 0); Qn.setFromEuler(E); V.set(x, y, z); S.set(s, sy, s); M.compose(V, Qn, S); geos.push(...backe(teil(n), M)); };
  // Raum 12 × 20 m (x −6…6, z −12…8): passt hochkant aufs Handy. Tore: hinten Mitte, links/rechts bei z = −6 (wie L.TUEREN)
  for (let i = 0; i < 3; i++) for (let k = 0; k < 5; k++) setze('floor_tile_large', -4 + i * 4, 0, -10 + k * 4, ((i * 7 + k * 3) % 4) * Math.PI / 2);
  setze('wall', -4, 0, -12); setze('wall_doorway', 0, 0, -12); setze('wall', 4, 0, -12);
  for (const z of [-10, -6, -2, 2, 6]) {
    const n = z === -6 ? 'wall_doorway' : 'wall';
    setze(n, -6, 0, z, Math.PI / 2); setze(n, 6, 0, z, -Math.PI / 2);
  }
  for (const [x, z] of [[-6, -12], [6, -12], [-2, -12], [2, -12], [-6, -8], [6, -8], [-6, -4], [6, -4], [-6, 8], [6, 8]]) setze('pillar', x, 0, z, 0, 0.7);
  // Fackeln, Banner, Kisten, Fässer, Kerzen an den Wänden
  for (const [x, z, r] of [[-5.6, -2, Math.PI / 2], [5.6, -2, -Math.PI / 2], [-5.6, 4, Math.PI / 2], [5.6, 4, -Math.PI / 2], [-5.6, -10, Math.PI / 2], [5.6, -10, -Math.PI / 2]]) setze('torch_mounted', x, 2.7, z, r, 1.3);
  setze('banner_shield_red', -4, 0.2, -11.6, 0); setze('banner_shield_red', 4, 0.2, -11.6, 0);
  setze('banner_patternC_blue', -5.6, 0.2, 1, Math.PI / 2); setze('banner_patternC_blue', 5.6, 0.2, 1, -Math.PI / 2);
  setze('crates_stacked', -4.9, 0, -10.9, 0.3, 0.75); setze('barrel_small_stack', 4.8, 0, -10.9, 0, 0.75);
  setze('keg', -5, 0, 7, 0.5, 0.7); setze('chest_gold', 4.9, 0, 7, -0.6, 0.85);
  for (const [x, z] of [[-5.1, -7.6], [5.1, -4.4], [-5.1, 5], [5.1, -1.2]]) setze('candle_triple', x, 0, z, 0, 1.2);
  const geo = THREE.BufferGeometryUtils.mergeBufferGeometries(geos);
  scene.add(new THREE.Mesh(geo, raumMat));
  return [[-5.5, -2], [5.5, -2], [-5.5, 4], [5.5, 4], [-5.5, -10], [5.5, -10]];
}
// Fackelschein
function glutTextur() {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 1, 32, 32, 31); gr.addColorStop(0, 'rgba(255,220,150,1)'); gr.addColorStop(0.25, 'rgba(255,150,60,.55)'); gr.addColorStop(1, 'rgba(255,120,30,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c);
}
const glutMat = new THREE.PointsMaterial({ map: glutTextur(), size: 2.4, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
function baueGlut(fackeln) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(fackeln.flatMap(([x, z]) => [x * 0.96, 3.4, z]), 3));
  const p = new THREE.Points(g, glutMat); p.frustumCulled = false; scene.add(p);
}

// Hieb-Fächer am Boden: zeigt Richtung, Breite und Reichweite des Schlags
const hiebMat = new THREE.MeshBasicMaterial({ color: col('#ffd21c'), transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
const hiebMesh = new THREE.Mesh(new THREE.BufferGeometry(), hiebMat); hiebMesh.renderOrder = 2; scene.add(hiebMesh);
function zeigeHieb(g, rund) {
  const rw = L.reichweite(lauf), breite = rund ? 360 : L.kegel(lauf);
  hiebMesh.geometry.dispose();
  // RingGeometry liegt in der xy-Ebene; nach dem Kippen zeigt Winkel 0 nach −z (vorn), Winkel steigt im Uhrzeigersinn
  const geo = new THREE.RingGeometry(0.5, rw, 32, 1, (90 - breite / 2) * Math.PI / 180, breite * Math.PI / 180);
  geo.rotateX(-Math.PI / 2); geo.rotateY(-g * Math.PI / 180);
  hiebMesh.geometry = geo; hiebMesh.position.set(0, 0.06, 0); hiebMat.opacity = rund ? 0.5 : 0.42; hiebMat.color = col(rund ? '#ff9200' : '#ffd21c');
}

// Zauberkugeln
const kugelMat = new THREE.MeshBasicMaterial({ color: col('#b46bff') });
const kugelGeo = new THREE.SphereGeometry(0.28, 12, 8);
const kugelGlut = new THREE.PointsMaterial({ map: glutTextur(), size: 1.6, color: col('#c690ff'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
const kugeln = new Map();
function zeichneKugeln() {
  const da = new Set();
  for (const k of lauf.kugeln) {
    if (k.weg) continue; da.add(k.id);
    let m = kugeln.get(k.id);
    if (!m) { m = new THREE.Mesh(kugelGeo, kugelMat); const p = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0], 3)), kugelGlut); m.add(p); scene.add(m); kugeln.set(k.id, m); }
    m.position.set(k.x, 1.2, k.z);
  }
  for (const [id, m] of kugeln) if (!da.has(id)) { scene.remove(m); kugeln.delete(id); }
}

// Funken
function punktTextur() {
  const c = document.createElement('canvas'); c.width = c.height = 32; const g = c.getContext('2d');
  const gr = g.createRadialGradient(16, 16, 1, 16, 16, 15); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 32, 32); return new THREE.CanvasTexture(c);
}
const FUNKEN = 200;
const fGeo = new THREE.BufferGeometry(), fPos = new Float32Array(FUNKEN * 3).fill(-999), fFarbe = new Float32Array(FUNKEN * 3), fVel = new Float32Array(FUNKEN * 3), fLeben = new Float32Array(FUNKEN);
fGeo.setAttribute('position', new THREE.BufferAttribute(fPos, 3)); fGeo.setAttribute('color', new THREE.BufferAttribute(fFarbe, 3));
const funken = new THREE.Points(fGeo, new THREE.PointsMaterial({ map: punktTextur(), size: 0.35, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
funken.frustumCulled = false; scene.add(funken);
let fNext = 0;
function funke(x, y, z, n, farbe, kraft = 1) {
  const c = col(farbe);
  for (let k = 0; k < n; k++) {
    const i = fNext; fNext = (fNext + 1) % FUNKEN;
    fPos.set([x + (Math.random() - 0.5) * 0.5, y + Math.random() * 0.4, z + (Math.random() - 0.5) * 0.5], i * 3);
    fVel.set([(Math.random() - 0.5) * 5 * kraft, (1 + Math.random() * 4) * kraft, (Math.random() - 0.5) * 5 * kraft], i * 3);
    fFarbe.set([c.r, c.g, c.b], i * 3); fLeben[i] = 0.4 + Math.random() * 0.4;
  }
}
function bewegeFunken(dt) {
  for (let i = 0; i < FUNKEN; i++) {
    if (fLeben[i] <= 0) continue;
    fLeben[i] -= dt; if (fLeben[i] <= 0) { fPos[i * 3 + 1] = -999; continue; }
    fVel[i * 3 + 1] -= 9 * dt;
    fPos[i * 3] += fVel[i * 3] * dt; fPos[i * 3 + 1] = Math.max(0.03, fPos[i * 3 + 1] + fVel[i * 3 + 1] * dt); fPos[i * 3 + 2] += fVel[i * 3 + 2] * dt;
  }
  fGeo.attributes.position.needsUpdate = true; fGeo.attributes.color.needsUpdate = true;
}

// ---------- Ton (eigene Dateien in ./sound/, der Rest aus /spiele/kerkerlauf/sound/) ----------
const SOUNDS = ['musik', 'fackel', 'kill', 'schwert', 'sturz', 'kombo', 'rekord', 'freischalten', 'truhe', 'landung'];
const EIGENE = ['kampf', 'zauber', 'kugel', 'au', 'schrei', 'horn'];   // tools/bastion-sound.py
const LAUT = { kill: 0.6, schwert: 0.45, sturz: 0.75, kombo: 0.65, rekord: 0.75, freischalten: 0.75, truhe: 0.7, landung: 0.35, zauber: 0.4, kugel: 0.5, au: 0.85, schrei: 0.5, horn: 0.45 };
// Menü/Ende: Kerker-Musik; im Kampf (auch Karten-Wahl und Pause) die eigene Kampfmusik – beide laufen durch und werden überblendet
const MUSIK = { menu: ['musik', 0.3], kampf: ['kampf', 0.5], wahl: ['kampf', 0.3], pause: ['kampf', 0.14], ende: ['musik', 0.22], rang: ['musik', 0.22] };
let audio = null, master = null, musikBus = null, fxBus = null, schleifenLaufen = false, kampfLaeuft = false;
const musikGain = {};
const puffer = {};
function audioStart() {
  try {
    if (!audio) {
      audio = new (window.AudioContext || window.webkitAudioContext)();
      master = audio.createGain(); master.connect(audio.destination);
      musikBus = audio.createGain(); musikBus.gain.value = 0; musikBus.connect(master);
      fxBus = audio.createGain(); fxBus.connect(master);
      for (const n of [...SOUNDS, ...EIGENE]) {
        fetch(new URL(EIGENE.includes(n) ? `./sound/${n}.mp3?v=1` : `../kerkerlauf/sound/${n}.mp3?v=3`, import.meta.url)).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(r.status)))
          .then((b) => new Promise((ok, err) => audio.decodeAudioData(b, ok, err)))
          .then((buf) => { puffer[n] = buf; if (n === 'musik' || n === 'fackel' || n === 'kampf') starteSchleifen(); }).catch(() => {});
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
  return g;
}
function starteSchleifen() {
  if (!schleifenLaufen && puffer.musik && puffer.fackel) { schleifenLaufen = true; musikGain.musik = schleife(puffer.musik, musikBus, 0); schleife(puffer.fackel, master, 0.3); }
  if (!kampfLaeuft && puffer.kampf) { kampfLaeuft = true; musikGain.kampf = schleife(puffer.kampf, musikBus, 0); }
  musikLautstaerke();
}
function musikLautstaerke() {
  if (!musikBus) return;
  const z = zustand === 'lauf' ? (lauf.phase === 'wahl' ? 'wahl' : 'kampf') : zustand;
  let [stueck, laut] = MUSIK[z] || MUSIK.menu;
  if (!musikGain[stueck]) stueck = 'musik';   // Kampfmusik noch nicht geladen
  musikBus.gain.value = 1;
  for (const [n, g] of Object.entries(musikGain)) g.gain.setTargetAtTime(n === stueck ? laut : 0, audio.currentTime, 0.35);
}
addEventListener('pointerdown', audioStart, { capture: true });
addEventListener('keydown', audioStart, { capture: true });
document.addEventListener('visibilitychange', () => { if (!audio) return; if (document.hidden) audio.suspend(); else if (stand.ton) audio.resume(); });
function ton(art, hoehe = 1) {
  if (!stand.ton) return;
  try {
    audioStart();
    const datei = art === 'kauf' ? 'freischalten' : art;
    if (puffer[datei]) {
      const s = audio.createBufferSource(), g = audio.createGain();
      s.buffer = puffer[datei]; g.gain.value = LAUT[datei] ?? 0.6; s.playbackRate.value = hoehe;
      s.connect(g).connect(fxBus); s.start(); return;
    }
    const t = audio.currentTime, o = audio.createOscillator(), g = audio.createGain();
    o.type = 'sine'; o.frequency.value = art === 'klick' ? 620 : 300;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.06, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
    o.connect(g).connect(fxBus); o.start(t); o.stop(t + 0.1);
  } catch (e) {}
}

// ---------- Zustand ----------
let zustand = 'laden';       // laden | menu | lauf | pause | ende | rang
let lauf = L.neuerLauf(1);
let auswahl = stand.held;
let neuerRekord = false, sturzZeit = 0, hinweisBis = 0, wackeln = 0, menuMix = 1;
let takt = 0, rest = 0, aufnahme = [], tagSeed = 0, geprueft = true;
const ein = { angriff: -1, wahl: -1 };
const CFG = () => window.PLAYSAAL_CFG || {};
const PS = () => window.PlaySaal || null;

// ---------- Eingabe: Tippen = Hieb in diese Richtung ----------
const fang = $('fang');
const ray = new THREE.Raycaster(), boden = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), treffer = new THREE.Vector3(), ndc = new THREE.Vector2();
function richtungAus(px, py) {
  ndc.set(px / innerWidth * 2 - 1, -(py / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  if (!ray.ray.intersectPlane(boden, treffer)) return -1;
  let g = Math.round(Math.atan2(treffer.x, -treffer.z) * GRAD);
  return (g + 360) % 360;
}
function ring(x, y) { const r = document.createElement('i'); r.className = 'spur'; r.style.left = x + 'px'; r.style.top = y + 'px'; fang.appendChild(r); setTimeout(() => r.remove(), 380); }
fang.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  if (zustand !== 'lauf' || lauf.phase !== 'kampf') return;
  const g = richtungAus(e.clientX, e.clientY); if (g < 0) return;
  ein.angriff = g; ring(e.clientX, e.clientY);
});
fang.addEventListener('contextmenu', (e) => e.preventDefault());
const RICHTUNG = { ArrowUp: 0, KeyW: 0, ArrowRight: 90, KeyD: 90, ArrowDown: 180, KeyS: 180, ArrowLeft: 270, KeyA: 270 };
const gedrueckt = new Set();
addEventListener('keydown', (e) => {
  if (zustand === 'lauf') {
    if (RICHTUNG[e.code] !== undefined) {
      e.preventDefault(); gedrueckt.add(e.code);
      // Zwei Pfeile gleichzeitig = schräg
      const v = [...gedrueckt].map((c) => RICHTUNG[c]).filter((x) => x !== undefined);
      let g = v[0]; if (v.length > 1) { const a = v[0], b = v[1]; g = Math.abs(a - b) > 180 ? ((a + b + 360) / 2) % 360 : (a + b) / 2; }
      if (lauf.phase === 'kampf') ein.angriff = Math.round(g) % 360;
    }
    if (lauf.phase === 'wahl' && ['Digit1', 'Digit2', 'Digit3'].includes(e.code)) ein.wahl = Number(e.code.slice(-1)) - 1;
  }
  if (e.code === 'Escape' || e.code === 'KeyP') { if (zustand === 'lauf') pausiere(); else if (zustand === 'pause') weiter(); else if (zustand === 'rang') rangZu(); }
  if (zustand === 'menu' && !e.repeat) { if (e.code === 'ArrowLeft') blaettere(-1); if (e.code === 'ArrowRight') blaettere(1); }
});
addEventListener('keyup', (e) => gedrueckt.delete(e.code));
addEventListener('blur', () => gedrueckt.clear());
document.addEventListener('visibilitychange', () => { if (document.hidden && zustand === 'lauf') pausiere(); });
for (const ev of ['gesturestart', 'dblclick']) document.addEventListener(ev, (e) => e.preventDefault());
document.addEventListener('touchmove', (e) => { if (e.touches.length > 1 || zustand === 'lauf') e.preventDefault(); }, { passive: false });

// ---------- Oberfläche ----------
function zeige(id) {
  for (const s of ['menu', 'pause', 'ende', 'laden', 'rang', 'wahl']) $(s).hidden = s !== id;
  const laufend = id === null || id === 'pause' || id === 'wahl';
  $('hud').hidden = !laufend;
  document.body.classList.toggle('im-lauf', id === null || id === 'wahl');
  document.body.classList.toggle('im-menu', id === 'menu');
  if (!laufend) $('kombo').hidden = true;
  setTimeout(musikLautstaerke, 0);
}
function tonKnoepfe() { for (const id of ['mTon', 'pTon']) { $(id).textContent = 'Ton: ' + (stand.ton ? 'an' : 'aus'); $(id).setAttribute('aria-pressed', String(stand.ton)); } }
async function zeigeMenu() {
  zustand = 'menu'; zeige('menu');
  lauf = L.neuerLauf(1); raeumeAuf();
  await ladeHeld(auswahl); waehleHeld(auswahl);
  aktualisiereMenu();
}
function aktualisiereMenu() {
  const frei = stand.helden.includes(auswahl), preis = L.PREISE[auswahl];
  $('mGold').textContent = stand.gold.toLocaleString('de-DE');
  $('mName').textContent = L.NAMEN[auswahl];
  const info = $('mInfo'); info.classList.toggle('zu', !frei);
  info.textContent = frei ? (auswahl === stand.held ? 'Dein Held' : 'Freigeschaltet') : `🔒 ${preis.toLocaleString('de-DE')} Gold`;
  $('mStart').hidden = !frei;
  const k = $('mKaufen'); k.hidden = frei;
  if (!frei) { const fehlt = preis - stand.gold; k.disabled = fehlt > 0; k.textContent = fehlt > 0 ? `Noch ${fehlt.toLocaleString('de-DE')} Gold sammeln` : `Freischalten für ${preis.toLocaleString('de-DE')} Gold`; }
  $('mPunkte').innerHTML = L.HELDEN.map((h) => `<i class="${h === auswahl ? 'an' : ''}"></i>`).join('');
  const heute = stand.tag === L.berlinTag() ? stand.tagBest : 0;
  $('mRekord').textContent = stand.rekord ? `Heute: ${heute.toLocaleString('de-DE')} · Rekord: ${stand.rekord.toLocaleString('de-DE')} Punkte` : 'Tippe in die Richtung eines Skeletts, um zuzuschlagen!';
  tonKnoepfe();
}
let blaetterNr = 0;
async function blaettere(r) {
  const i = (L.HELDEN.indexOf(auswahl) + r + L.HELDEN.length) % L.HELDEN.length;
  auswahl = L.HELDEN[i]; ton('klick'); aktualisiereMenu();
  if (stand.helden.includes(auswahl)) { stand.held = auswahl; speichere(); }
  const nr = ++blaetterNr; await ladeHeld(auswahl);
  if (nr === blaetterNr && zustand === 'menu') waehleHeld(auswahl);
}
$('mLinks').addEventListener('click', () => blaettere(-1));
$('mRechts').addEventListener('click', () => blaettere(1));
$('mKaufen').addEventListener('click', () => { if (L.freischalten(stand, auswahl)) { speichere(); ton('kauf'); zeigePose('Cheering', 0.2); aktualisiereMenu(); popup('Freigeschaltet!', 'gold'); } });
$('mStart').addEventListener('click', starte);
for (const id of ['mTon', 'pTon']) $(id).addEventListener('click', () => { stand.ton = !stand.ton; speichere(); tonKnoepfe(); audioStart(); ton('klick'); });
$('bPause').addEventListener('click', pausiere);
$('pWeiter').addEventListener('click', weiter);
$('pNeu').addEventListener('click', starte);
$('pMenu').addEventListener('click', zeigeMenu);
$('eNochmal').addEventListener('click', starte);
$('eHelden').addEventListener('click', zeigeMenu);
// ---------- Teilen (Handy: Teilen-Menü, sonst Link in die Zwischenablage) ----------
function meldung(text) { const t = $('toast'); t.textContent = text; t.hidden = false; clearTimeout(meldung.h); meldung.h = setTimeout(() => { t.hidden = true; }, 3000); }
async function teilen() {
  const url = location.origin + location.pathname, text = `Ich habe die Letzte Bastion ${lauf.welle} ${lauf.welle === 1 ? 'Welle' : 'Wellen'} lang gehalten – ${lauf.punkte.toLocaleString('de-DE')} Punkte! Wie lange hältst du durch?`;
  if (navigator.share) { try { await navigator.share({ title: 'Letzte Bastion', text, url }); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
  try { await navigator.clipboard.writeText(text + ' ' + url); meldung('Link kopiert – schick ihn deinen Freunden!'); } catch (e) { meldung(url); }
}
$('eTeilen').addEventListener('click', () => { ton('klick'); teilen(); });


function raeumeAuf() {
  for (const p of Object.values(pool)) for (const s of p) { s.e = null; s.root.visible = false; }
  for (const [, m] of kugeln) scene.remove(m); kugeln.clear();
  hiebMat.opacity = 0;
}
async function starte() {
  if (!stand.helden.includes(auswahl)) auswahl = stand.held;
  stand.held = auswahl; speichere();
  await ladeHeld(auswahl);
  tagSeed = TEST && Q.get('seed') ? Number(Q.get('seed')) : L.berlinTag();
  lauf = L.neuerLauf(tagSeed); takt = 0; rest = 0; aufnahme = []; geprueft = true;
  raeumeAuf();
  zustand = 'lauf'; zeige(null); waehleHeld(auswahl);
  neuerRekord = false; sturzZeit = 0; ein.angriff = -1; ein.wahl = -1;
  zeigeHinweis(HANDY ? '<b>Tippe</b> in die Richtung eines Skeletts – dein Held schlägt dorthin.' : '<b>Klicke</b> in die Richtung eines Skeletts oder nutze die <b>Pfeiltasten</b>.');
  hinweisBis = performance.now() + 5000;
  hud(true); ton('klick');
}
function pausiere() { if (zustand !== 'lauf') return; zustand = 'pause'; zeige('pause'); tonKnoepfe(); }
function weiter() { if (zustand !== 'pause') return; zustand = 'lauf'; zeige(lauf.phase === 'wahl' ? 'wahl' : null); }
function zeigeHinweis(html) { const h = $('hinweis'); h.innerHTML = html; h.hidden = !html; }
function popup(text, klasse = '') {
  const s = document.createElement('span'); s.textContent = text; if (klasse) s.className = klasse;
  const p = $('pop'); p.appendChild(s); setTimeout(() => s.remove(), 1100);
  while (p.children.length > 3) p.firstChild.remove();
}
function banner(text, klein = '') {
  const b = $('banner'); b.hidden = false; b.innerHTML = text + (klein ? `<small>${klein}</small>` : '');
  b.style.animation = 'none'; void b.offsetWidth; b.style.animation = '';
}
const SYMBOL = { reichweite: '🗡️', kegel: '🌀', tempo: '⚡', herz: '❤️', wirbel: '🌪️', heilen: '🧪' };
function zeigeWahl() {
  $('wTitel').textContent = `Welle ${lauf.welle} geschafft!`;
  const k = $('wKarten'); k.textContent = '';
  lauf.wahl.forEach((u, i) => {
    const d = L.UPGRADES[u], b = document.createElement('button'); b.type = 'button';
    const stufe = u === 'heilen' ? '' : ` <span class="stufe">${lauf.up[u] + 1}/${d.max}</span>`;
    b.innerHTML = `<span class="sym" aria-hidden="true">${SYMBOL[u]}</span><span><b>${d.name}${stufe}</b><small>${d.text}</small></span>`;
    b.addEventListener('click', () => { ein.wahl = i; });
    k.appendChild(b);
  });
  zeige('wahl');
}
const GRUND = { diener: 'Ein Skelett-Diener hat dich erwischt.', krieger: 'Der Skelett-Krieger war zu stark.', schurke: 'Der flinke Skelett-Schurke war schneller.', magier: 'Der Skelett-Magier hat dich erwischt.', kugel: 'Eine Zauberkugel hat dich getroffen – schlag sie weg!' };
function zeigeEnde() {
  zustand = 'ende'; zeige('ende');
  $('eGrund').textContent = GRUND[lauf.getroffenVon] || '';
  $('eWelle').textContent = String(lauf.welle);
  $('ePunkte').textContent = lauf.punkte.toLocaleString('de-DE');
  $('eGold').textContent = '+' + lauf.gold;
  $('eExtra').textContent = `${lauf.kills} Skelette besiegt${lauf.besteSerie >= 8 ? ` · beste Kombo ×${L.kombo(lauf.besteSerie - 1)}` : ''}`;
  const r = $('eRekord'); r.classList.toggle('neu', neuerRekord);
  r.textContent = neuerRekord ? '★ Neuer Rekord! ★' : `Rekord: ${stand.rekord.toLocaleString('de-DE')} Punkte`;
  if (neuerRekord) ton('rekord');
  setTimeout(() => { if (zustand === 'ende') $('eNochmal').focus({ preventScroll: true }); }, 50);
}

// ---------- Tagesrangliste (geprüft) ----------
function zeigeStatus(text, ok = false) { const st = $('eStatus'); st.textContent = text; st.className = 'status' + (ok ? ' ok' : ''); }
async function melden(l) {
  const p = PS(); if (!p || !p.online) return { status: 'lokal' };
  if (!(p.hatSitzung && p.hatSitzung())) return { status: 'gast' };
  try {
    const tk = p.token && p.token(); if (!tk) return { status: 'gast' };
    const r = await fetch(CFG().url + '/functions/v1/bastion-lauf', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + tk, apikey: CFG().key || '' }, body: JSON.stringify(l) });
    if (r.status === 404) return { status: 'lokal' };
    const j = await r.json().catch(() => ({}));
    if (r.ok && j.verifiziert) return { status: 'verifiziert', platz: j.platz_heute || null, von: j.spieler_heute || null };
    if (r.ok) return { status: 'abgelehnt', grund: j.grund || '' };
    return { status: 'fehler' };
  } catch (e) { return { status: 'fehler' }; }
}
function meldeLauf(l) {
  zeigeStatus('Wird geprüft …');
  melden(l).then((r) => {
    if (r.status === 'verifiziert') zeigeStatus('✓ Vom Server nachgespielt' + (r.platz ? ` · Platz ${r.platz}${r.von ? ' von ' + r.von : ''} heute` : ''), true);
    else if (r.status === 'gast') zeigeStatus('Melde dich an (Reiter am Rand), dann kommst du in die Tagesrangliste.');
    else if (r.status === 'abgelehnt') zeigeStatus(r.grund === 'zu_oft' ? 'Zu viele Meldungen. Gleich wieder versuchen.' : r.grund === 'kein_profil' ? 'Lege zuerst einen Spielernamen an (Konto).' : 'Nicht in die Rangliste übernommen.');
    else if (r.status === 'fehler') zeigeStatus('Rangliste gerade nicht erreichbar. Dein Kampf bleibt auf diesem Gerät.');
    else zeigeStatus('Neuer Tagesbestwert – gespeichert auf diesem Gerät.');
  });
}
const avatar = (p, a) => ((p && p.avatare) || [])[(parseInt(String(a || 'a1').slice(1), 10) || 1) - 1] || '🙂';
let rangZeit = 'heute', rangVon = 'menu';
async function rangliste(zeit) {
  rangZeit = zeit;
  if (zustand !== 'rang') { rangVon = zustand; zustand = 'rang'; musikLautstaerke(); }
  for (const s of ['menu', 'ende']) $(s).hidden = true;
  $('rang').hidden = false;
  for (const b of document.querySelectorAll('#rTabs button')) b.setAttribute('aria-pressed', String(b.dataset.z === zeit));
  const liste = $('rListe'); liste.textContent = 'Lädt …';
  const p = PS();
  const res = p && p.online && p.rpc ? await p.rpc('bastion_rangliste', { p_zeitraum: zeit, p_anzahl: 50 }).catch(() => null) : null;
  if (zeit !== rangZeit || zustand !== 'rang') return;
  if (!res || res.fehler) { liste.textContent = 'Die Rangliste ist gerade nicht erreichbar.'; return; }
  const rows = res.daten || [];
  liste.textContent = '';
  if (!rows.length) { liste.textContent = zeit === 'heute' ? 'Heute noch kein Eintrag. Verteidige als Erster!' : 'Noch keine Einträge.'; return; }
  for (const r of rows) {
    const li = document.createElement('li'); if (r.ich) li.className = 'ich';
    const a = document.createElement('span'); a.className = 'pl'; a.textContent = String(r.platz);
    const b = document.createElement('span'); b.className = 'av'; b.textContent = avatar(p, r.avatar);
    const c = document.createElement('span'); c.className = 'nm'; c.textContent = r.name + (r.ich ? ' (du)' : '');
    const d = document.createElement('b'); d.textContent = Number(r.punkte).toLocaleString('de-DE');
    const e = document.createElement('small'); e.textContent = 'Welle ' + r.welle;
    li.append(a, b, c, d, e); liste.appendChild(li);
  }
}
function rangZu() { $('rang').hidden = true; zustand = rangVon; $(rangVon === 'ende' ? 'ende' : 'menu').hidden = false; musikLautstaerke(); }
for (const id of ['mRang', 'eRang']) $(id).addEventListener('click', () => { ton('klick'); rangliste('heute'); });
for (const b of document.querySelectorAll('#rTabs button')) b.addEventListener('click', () => rangliste(b.dataset.z));
$('rZu').addEventListener('click', rangZu);

// ---------- Ereignisse ----------
function behandle(evs) {
  for (const e of evs) {
    if (e === 'tot') {
      sturzZeit = performance.now(); zeigePose('Death_A', 0.1); ton('sturz', 0.9);
      neuerRekord = L.verbuche(stand, lauf, tagSeed); speichere();
      zeigeStatus('');
      if (lauf.tagesBest && geprueft && lauf.punkte > 0) meldeLauf({ v: L.SIM_VERSION, seed: tagSeed, inputs: L.kodiere(aufnahme), takte: takt, punkte: lauf.punkte, gold: lauf.gold, kills: lauf.kills, welle: lauf.welle });
      else if (stand.tagBest && stand.tag === tagSeed) zeigeStatus(`Dein Tagesbestwert (${stand.tagBest.toLocaleString('de-DE')} Punkte) steht noch.`);
      continue;
    }
    if (e === 'daneben') continue;
    switch (e.typ) {
      case 'hieb': {
        held.root.rotation.y = 0;
        heldGruppe.rotation.y = Math.PI - e.g / GRAD;
        if (e.rund) zeigePose('Melee_2H_Attack_Spin', 0.05, held.a.Melee_2H_Attack_Spin.getClip().duration / 0.45);
        else { const c = held.a[ANGRIFF_CLIP[held.name]]; zeigePose(ANGRIFF_CLIP[held.name], 0.04, c.getClip().duration / 0.36); }
        zeigeHieb(e.g, e.rund); ton('schwert', 0.95 + Math.random() * 0.1);
        if (e.rund) ton('schrei', 0.95 + Math.random() * 0.1);
        break;
      }
      case 'kill': {
        const g = lauf.gegner.find((x) => x.id === e.id);
        if (g) funke(g.x, 1.2, g.z, 20, '#e8e2d0', 1.2);
        ton('kill', 0.92 + Math.random() * 0.16);
        popup(e.mal > 1 ? `+${e.punkte} ×${e.mal}` : `+${e.punkte}`, e.mal > 1 ? 'orange' : '');
        const m = L.kombo(lauf.serie);
        if (m > 1) { const k = $('kombo'); const neu = $('kMal').textContent !== '×' + m || k.hidden; $('kMal').textContent = '×' + m; if (neu) { k.hidden = false; k.style.animation = 'none'; void k.offsetWidth; k.style.animation = ''; if (L.kombo(lauf.serie - 1) < m) ton('kombo'); } }
        break;
      }
      case 'schlag': { const g = lauf.gegner.find((x) => x.id === e.id); if (g) funke(g.x, 1.3, g.z, 8, '#ffd21c', 0.8); ton('landung', 1.3); break; }
      case 'kugelWeg': { const k = lauf.kugeln.find((x) => x.id === e.id); if (k) funke(k.x, 1.2, k.z, 12, '#c690ff', 1); ton('kugel', 1.1); break; }
      case 'zauber': { ton('zauber', 0.95 + Math.random() * 0.1); const s = Object.values(pool).flat().find((p) => p.e && p.e.id === e.id); if (s) skPose(s, 'Ranged_Magic_Shoot', 0.08); break; }
      case 'treffer': {
        ton('au', 0.95 + Math.random() * 0.1); $('kombo').hidden = true; wackeln = 0.35;
        const h = $('hHerzen'); h.classList.remove('au'); void h.offsetWidth; h.classList.add('au');
        if (!lauf.tot) zeigePose('Hit_B', 0.05, 1.4);
        break;
      }
      case 'neu': if (e.boden) ton('landung', 0.7); break;
      case 'welle': ton('horn'); banner(`Welle ${e.n}`, e.n === 1 ? 'Halte die Bastion!' : ''); zeige(null); break;
      case 'geschafft': ton('truhe'); popup(`Welle geschafft! +${e.bonus}`, 'gold'); zeigePose('Cheering', 0.2); if (lauf.phase === 'wahl') setTimeout(() => { if (zustand === 'lauf' && lauf.phase === 'wahl') zeigeWahl(); }, 700); break;
      case 'upgrade': ton('kombo'); popup(L.UPGRADES[e.u].name + '!', 'gold'); zeige(null); break;
    }
  }
}

// ---------- Zeichnen ----------
function zeichneGegner() {
  const sichtbar = new Set(lauf.gegner.filter((e) => !e.tot || lauf.t - e.totSeit < 1.8).map((e) => e.id));
  for (const art of Object.keys(pool)) for (const s of pool[art]) if (s.e && !sichtbar.has(s.e.id)) { s.e = null; s.root.visible = false; }
  const vergeben = new Set(Object.values(pool).flat().filter((s) => s.e).map((s) => s.e.id));
  for (const e of lauf.gegner) {
    if (!sichtbar.has(e.id) || vergeben.has(e.id)) continue;
    const s = pool[e.art].find((p) => !p.e); if (!s) continue;
    s.e = e; s.root.visible = true; s.pose = null; s.mixer.stopAllAction(); s.hp = e.hp; s.aus = 0;
    skPose(s, e.aufstehen > 0 ? 'Skeletons_Awaken_Floor' : 'Skeletons_Walking', 0, e.aufstehen > 0 ? s.a.Skeletons_Awaken_Floor.getClip().duration / 1.3 : 1);
  }
  const tf = L.tempoFaktor(lauf.welle);
  for (const art of Object.keys(pool)) for (const s of pool[art]) {
    const e = s.e; if (!e) continue;
    let y = 0;
    if (e.tot) { skPose(s, 'Skeletons_Death', 0.06); const seit = lauf.t - e.totSeit; if (seit > 1.0) y = -(seit - 1.0) * 2; }
    else if (e.aufstehen > 0) { /* steigt aus dem Boden */ }
    else if (e.hp < s.hp) { s.hp = e.hp; skPose(s, 'Hit_B', 0.05, 1.5); }
    else if (e.ausholen > 0 && e.ausholen - 1 / 60 <= 0) skPose(s, 'Melee_1H_Attack_Chop', 0.06, s.a.Melee_1H_Attack_Chop.getClip().duration / L.ausholZeit(lauf.welle) * 0.9);
    else if (!s.pose || s.pose === 'Skeletons_Awaken_Floor') {
      const l = Math.sqrt(e.x * e.x + e.z * e.z), steht = (e.art === 'magier' && l <= e.abstand) || l <= L.NAH.start + 0.02 || e.rueck > 0;
      skPose(s, steht ? 'Skeletons_Idle' : 'Skeletons_Walking', 0.2, steht ? 1 : 0.8 * L.ARTEN[e.art].v * tf);
    } else if (s.pose === 'Skeletons_Walking' || s.pose === 'Skeletons_Idle') {
      const l = Math.sqrt(e.x * e.x + e.z * e.z), steht = (e.art === 'magier' && l <= e.abstand) || l <= L.NAH.start + 0.02 || e.rueck > 0;
      const soll = steht ? 'Skeletons_Idle' : 'Skeletons_Walking';
      if (s.pose !== soll) skPose(s, soll, 0.2, steht ? 1 : 0.8 * L.ARTEN[e.art].v * tf);
    }
    s.root.position.set(e.x, y, e.z);
    s.root.rotation.y = Math.atan2(-e.x, -e.z);
    s.root.scale.setScalar(FIGUR * (e.art === 'krieger' ? 1.12 : e.art === 'schurke' ? 0.95 : 1));
  }
}
function hud(sofort = false) {
  const h = $('hHerzen'), soll = lauf.maxHerzen * 10 + lauf.herzen;
  if (sofort || h.dataset.w !== String(soll)) { h.dataset.w = String(soll); h.innerHTML = Array.from({ length: lauf.maxHerzen }, (_, i) => `<i class="${i < lauf.herzen ? '' : 'leer'}"></i>`).join(''); }
  $('hWelle').textContent = String(Math.max(1, lauf.welle));
  $('hPunkte').textContent = lauf.punkte.toLocaleString('de-DE');
}

// ---------- Kamera ----------
const blick = new THREE.Vector3(), ziel = new THREE.Vector3(), tA = new THREE.Vector3(), tB = new THREE.Vector3();
let foto = false;
function kamera(dt) {
  const hoch = camera.aspect < 0.75;
  tA.set(0, hoch ? 19 : 14, hoch ? 7.6 : 9.5);
  tB.set(0, 0, hoch ? -3.3 : -2.8);
  if (foto) { ziel.set(0, camera.aspect < 1.3 ? 6.2 : 5.4, 8.5); blick.set(0, 1.0, -2); }
  else { ziel.set(0.8, 2.6, 5.6); blick.set(0, 1.25, 0); }
  ziel.lerp(tA, 1 - menuMix); blick.lerp(tB, 1 - menuMix);
  if (wackeln > 0) { wackeln = Math.max(0, wackeln - dt); ziel.x += (Math.random() - 0.5) * wackeln; ziel.y += (Math.random() - 0.5) * wackeln; }
  camera.position.copy(ziel); camera.lookAt(blick);
}

// ---------- Hauptschleife ----------
let letzte = performance.now(), lastSumme = 0, lastZahl = 0;
function frame(jetzt) {
  requestAnimationFrame(frame);
  const dtEcht = Math.min(0.1, (jetzt - letzte) / 1000); letzte = jetzt;
  const dt = Math.min(0.05, dtEcht);
  if (zustand === 'laden') return;
  if (zustand === 'lauf') {
    rest = Math.min(rest + dtEcht, 0.1);
    while (rest >= L.DT && !lauf.tot) {
      rest -= L.DT;
      const c = ein.wahl >= 0 ? 400 + ein.wahl : ein.angriff >= 0 ? ein.angriff : -1;
      if (c >= 0) aufnahme.push([takt, c]);
      ein.angriff = -1; ein.wahl = -1;
      const evs = L.schritt(lauf, L.DT, L.eingabe(c));
      takt++;
      if (evs.length) behandle(evs);
    }
    if (lauf.tot && performance.now() - sturzZeit > 1600) zeigeEnde();
    if (hinweisBis && performance.now() > hinweisBis) { hinweisBis = 0; zeigeHinweis(''); }
    hud();
  }
  menuMix += ((zustand === 'menu' ? 1 : 0) - menuMix) * Math.min(1, dt * 3);
  if (Math.abs(menuMix - (zustand === 'menu' ? 1 : 0)) < 0.002) menuMix = zustand === 'menu' ? 1 : 0;
  if (!foto) heldGruppe.scale.setScalar(FIGUR + (1 - FIGUR) * menuMix);
  if (zustand !== 'pause') {
    if (zustand === 'menu' && !foto) heldGruppe.rotation.y = Math.sin(jetzt / 1600) * 0.3;
    if (held) held.mixer.update(dt);
    for (const p of Object.values(pool)) for (const s of p) if (s.e) s.mixer.update(dt);
    if (foto) for (const h of Object.values(heldModelle)) h.mixer.update(dt);
    bewegeFunken(dt);
    hiebMat.opacity = Math.max(0, hiebMat.opacity - dt * 2.2);
  }
  if (zustand === 'lauf' || zustand === 'pause' || zustand === 'ende') { zeichneGegner(); zeichneKugeln(); }
  glut.intensity = 1.2 + Math.sin(jetzt / 90) * 0.06 + Math.sin(jetzt / 37) * 0.04;
  kamera(dt);
  renderer.render(scene, camera);
  if (zustand === 'lauf') {
    lastSumme += dtEcht; lastZahl++;
    if (lastZahl >= 120) { if (lastSumme / lastZahl > 0.026 && pixel > 1) { pixel = Math.max(1, pixel - 0.35); renderer.setPixelRatio(pixel); groesse(); } lastSumme = 0; lastZahl = 0; }
  }
}
function groesse() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.fov = camera.aspect < 0.75 ? 62 : 50; camera.updateProjectionMatrix();
}
addEventListener('resize', groesse);

// Foto-Modus für Kachel/Teilen-Vorschau (nur mit ?test)
async function fotoModus() {
  for (const h of L.HELDEN) await ladeHeld(h);
  foto = true; menuMix = 1; zustand = 'menu'; zeige('menu');
  heldGruppe.rotation.set(0, 0, 0); held = null;
  const plaetze = { ritter: [0, 1.2, 'Melee_2H_Idle'], barbar: [-2.2, 1.8, 'Melee_2H_Idle'], schurke: [2.2, 1.8, 'Melee_2H_Idle'] };
  for (const [n, [x, z, pose]] of Object.entries(plaetze)) {
    const h = heldModelle[n]; h.root.visible = true; h.root.position.set(x, 0, z); h.root.rotation.y = Math.PI + x * 0.15;
    h.mixer.stopAllAction(); h.a[pose].reset().play(); h.a[pose].time = 0.3;
  }
  // Skelette stürmen von hinten heran
  lauf = L.neuerLauf(9); lauf.welle = 5; lauf.t = 1;
  lauf.gegner = [['krieger', -3.5, -4.5], ['diener', 0, -5.5], ['schurke', 3.4, -4.2], ['magier', -1.6, -8], ['diener', 2, -8.5], ['krieger', 5.5, -7]].map(([art, x, z], i) => ({ id: i, art, x, z, hp: 2, tot: false, aufstehen: 0, ausholen: 0, rueck: 0, abstand: 0 }));
  lauf.kugeln = [{ id: 50, x: -1, z: -6.4, vx: 0, vz: 0, weg: false }];
  zustand = 'ende'; zeichneGegner(); zeichneKugeln(); zustand = 'menu';
  for (const p of Object.values(pool)) for (const s of p) if (s.e) { skPose(s, 'Skeletons_Walking', 0); s.a.Skeletons_Walking.time = s.e.id * 0.17; }
  document.body.classList.add('foto');
}

async function start() {
  groesse();
  const namen = ['raum', 'kl:skelett-diener', 'kl:skelett-krieger', 'skelett-schurke', 'skelett-magier', 'kl:anim-basis', 'kl:anim-allgemein', 'kl:anim-kampf', 'kl:anim-magie', 'kl:anim-skelett', 'kl:anim-jubel', 'anim-special', 'anim-combatmelee', 'anim-general', 'kl:held-' + auswahl];
  let fertig = 0; const balken = $('ladeBalken');
  try {
    const g = await Promise.all(namen.map((n) => ladeGlb(n).then((x) => { fertig++; balken.style.width = (fertig / namen.length * 100) + '%'; return x; })));
    for (const a of g.slice(5, 14)) for (const c of a.animations) CLIPS[c.name] = c;
    const fackeln = baueRaum(g[0].scene); baueGlut(fackeln);
    baueSkelette({ diener: bereiteFigur(g[1]), krieger: bereiteFigur(g[2]), schurke: bereiteFigur(g[3]), magier: bereiteFigur(g[4]) });
    richteHeldEin(auswahl, g[14]);
  } catch (e) {
    $('ladeText').textContent = 'Die Bastion konnte nicht geladen werden. Bitte Seite neu laden.';
    console.error(e); return;
  }
  await zeigeMenu();
  requestAnimationFrame(frame);
}
requestAnimationFrame(() => { letzte = performance.now(); });
start();

// Für die Browserprüfung (tests/bastion-browser.test.mjs)
window.__bastion = {
  get zustand() { return zustand; }, get lauf() { return lauf; }, get stand() { return stand; },
  get held() { return held && { name: held.name, pose: held.pose, sichtbar: held.root.visible }; },
  get skelette() { return Object.values(pool).flat().filter((s) => s.e).map((s) => ({ id: s.e.id, art: s.e.art, pose: s.pose, sichtbar: s.root.visible })); },
  get zeichnungen() { return renderer.info.render.calls; }, get clips() { return Object.keys(CLIPS); },
  get ton() { return { geladen: Object.keys(puffer).sort(), schleifen: schleifenLaufen }; },
  get aufnahme() { return { seed: tagSeed, takte: takt, inputs: L.kodiere(aufnahme) }; },
  bildschirm(x, z) { const v = new THREE.Vector3(x, 1, z).project(camera); return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight }; },
  ...(TEST ? { foto: fotoModus, gegner(liste) { geprueft = false; lauf.welle = Math.max(1, lauf.welle); lauf.phase = 'kampf'; lauf.plan = []; lauf.gegner = liste.map((g, i) => ({ id: 9000 + i, hp: L.ARTEN[g.art || 'diener'].hp, tot: false, aufstehen: 0, ausholen: 0, rueck: 0, zauber: 1.5, abstand: L.ARTEN[g.art || 'diener'].abstand || 0, art: 'diener', ...g })); } } : {}),
};
