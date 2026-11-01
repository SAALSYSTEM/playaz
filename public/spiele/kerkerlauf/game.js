// Kerkerlauf – Darstellung (three.js r128), Animationen, Wischen/Tippen, Menüs. Regeln stehen in logik.js.
// Modelle: KayKit Adventurers / Skeletons / Character Animations / Dungeon Pack (CC0, Kay Lousberg),
// aufbereitet mit tools/kerkerlauf-assets.mjs. Alle Figuren nutzen dasselbe Skelett (Rig_Medium),
// deshalb passen die Animations-Clips aus den anim-*.glb auf Helden und Skelette.
import * as L from './logik.js?v=3';

const THREE = window.THREE;
const $ = (id) => document.getElementById(id);
const Q = new URLSearchParams(location.search);
const TEST = Q.has('test');
const col = (hex) => new THREE.Color(hex).convertSRGBToLinear();
const HANDY = matchMedia('(pointer: coarse)').matches;

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
const DUNKEL = col('#16131d');
renderer.setClearColor(new THREE.Color('#16131d'), 1); // Löschfarbe wird nicht umgerechnet → sRGB-Wert direkt
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(DUNKEL, 22, 74);
const camera = new THREE.PerspectiveCamera(64, 1, 0.1, 200);
scene.add(new THREE.HemisphereLight(col('#b9a8f0'), col('#2e2420'), 0.55));
const mond = new THREE.DirectionalLight(col('#ffe2b8'), 0.75); mond.position.set(-3, 10, 5); scene.add(mond); scene.add(mond.target);
const fackel = new THREE.PointLight(col('#ffab52'), 1.15, 15, 1.6); scene.add(fackel); // wandert mit dem Helden

// ---------- Laden ----------
const loader = new THREE.GLTFLoader();
const url = (n) => new URL(`./modelle/${n}.glb?v=1`, import.meta.url).href;
const ladeGlb = (n) => new Promise((ok, err) => loader.load(url(n), ok, undefined, err));

// glTF liefert oft verschachtelte (interleaved) Attribute – zum Zusammenlegen braucht es einfache Arrays
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
// Figur: alle Hautteile (Kopf, Körper, Arme …) zu einem SkinnedMesh verschmelzen → wenige Zeichenaufrufe
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

const CLIPS = {};
const ANGRIFF_CLIP = { ritter: 'Melee_1H_Attack_Slice_Horizontal', barbar: 'Melee_1H_Attack_Slice_Horizontal', waldlaeufer: 'Melee_1H_Attack_Slice_Horizontal', schurke: 'Melee_Dualwield_Attack_Slice', magier: 'Ranged_Magic_Shoot' };

// ---------- Held ----------
const heldGruppe = new THREE.Group(); scene.add(heldGruppe);
const heldModelle = {};            // name → { root, mixer, a, pose }
let held = null;
const heldLaedt = {};
function richteHeldEin(name, gltf) {
  const root = bereiteFigur(gltf); root.visible = false; heldGruppe.add(root);
  const mixer = new THREE.AnimationMixer(root), a = {};
  for (const [n, c] of Object.entries(CLIPS)) a[n] = mixer.clipAction(c);
  for (const n of ['Jump_Full_Short', 'Death_A', 'Cheering', ANGRIFF_CLIP[name]]) { a[n].setLoop(THREE.LoopOnce, 1); a[n].clampWhenFinished = true; }
  const h = { name, root, mixer, a, pose: null };
  mixer.addEventListener('finished', (e) => {
    if (h !== held) return;
    if (e.action === a[ANGRIFF_CLIP[name]] && zustand === 'lauf' && !lauf.tot) zeigePose(lauf.luft ? 'Jump_Idle' : 'Running_A', 0.12);
    if (e.action === a.Cheering) zeigePose('Idle_A', 0.3);
  });
  heldModelle[name] = h; return h;
}
function ladeHeld(name) {
  if (heldModelle[name]) return Promise.resolve(heldModelle[name]);
  return (heldLaedt[name] = heldLaedt[name] || ladeGlb('held-' + name).then((g) => richteHeldEin(name, g)));
}
function waehleHeld(name) {
  for (const h of Object.values(heldModelle)) h.root.visible = false;
  held = heldModelle[name]; held.root.visible = true;
  held.pose = null; held.mixer.stopAllAction();
  zeigePose(zustand === 'menu' ? 'Idle_A' : 'Running_A', 0);
}
function zeigePose(name, fade = 0.15, tempo = 1) {
  if (!held) return;
  const neu = held.a[name]; if (!neu) return;
  if (held.pose === name && neu.isRunning()) { neu.setEffectiveTimeScale(tempo); return; }
  const alt = held.pose && held.a[held.pose];
  neu.reset(); neu.setEffectiveTimeScale(tempo); neu.setEffectiveWeight(1); neu.play();
  if (alt && alt !== neu && fade > 0) neu.crossFadeFrom(alt, fade, false); else if (alt && alt !== neu) alt.stop();
  held.pose = name;
}

// ---------- Skelette (Pool, geklont) ----------
const SKELETT_POOL = 7;
const pool = { diener: [], krieger: [] };
function baueSkelette(vorlagen) {
  for (const art of ['diener', 'krieger']) {
    for (let i = 0; i < SKELETT_POOL; i++) {
      const root = THREE.SkeletonUtils.clone(vorlagen[art]); root.visible = false; scene.add(root);
      const mixer = new THREE.AnimationMixer(root), a = {};
      for (const n of ['Skeletons_Idle', 'Skeletons_Taunt', 'Skeletons_Death', 'Skeletons_Awaken_Standing']) a[n] = mixer.clipAction(CLIPS[n]);
      for (const n of ['Skeletons_Taunt', 'Skeletons_Death', 'Skeletons_Awaken_Standing']) { a[n].setLoop(THREE.LoopOnce, 1); a[n].clampWhenFinished = true; }
      const s = { root, mixer, a, item: null, pose: null };
      mixer.addEventListener('finished', (e) => { if (e.action === a.Skeletons_Taunt && s.item && !s.item.besiegt) skPose(s, 'Skeletons_Idle', 0.25); });
      pool[art].push(s);
    }
  }
}
function skPose(s, name, fade = 0.2) {
  const neu = s.a[name], alt = s.pose && s.a[s.pose];
  neu.reset(); neu.play();
  if (alt && alt !== neu && fade > 0) neu.crossFadeFrom(alt, fade, false); else if (alt && alt !== neu) alt.stop();
  s.pose = name;
}

// ---------- Welt: Teile zu je einer Geometrie backen, als InstancedMesh zeichnen ----------
let weltMat = null, muenzMat = null;
function backe(node) {
  node.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(node.matrixWorld).invert(), geos = [];
  node.traverse((o) => {
    if (!o.isMesh) return;
    weltMat = weltMat || new THREE.MeshLambertMaterial({ map: o.material.map });
    const g = entflechte(o.geometry.clone(), ['position', 'normal', 'uv']);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld)); geos.push(g.index ? g.toNonIndexed() : g);
  });
  return THREE.BufferGeometryUtils.mergeBufferGeometries(geos);
}
const MENGE = { boden: 90, wand: 60, saeule: 16, fackel: 16, banner_rot: 8, banner_blau: 8, kiste: 14, fass: 14, stapel: 14, stachel: 14, muenze: 90, truhe: 4, schutt: 10, kegel: 10 };
const TEIL = { boden: 'floor_tile_large', wand: 'wall', saeule: 'pillar', fackel: 'torch_mounted', banner_rot: 'banner_patternA_red', banner_blau: 'banner_patternC_blue', kiste: 'box_large', fass: 'barrel_large', stapel: 'crates_stacked', stachel: 'floor_tile_big_spikes', muenze: 'coin', truhe: 'chest_gold', schutt: 'rubble_half', kegel: 'keg' };
const inst = {};
function instanzen(typ, geo, mat) {
  const m = new THREE.InstancedMesh(geo, mat, MENGE[typ]);
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.count = 0; m.frustumCulled = false; scene.add(m); inst[typ] = m;
}

// Fackelschein: ein Punkt-Sprite pro Fackel, flackert
function glutTextur() {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 1, 32, 32, 31); gr.addColorStop(0, 'rgba(255,220,150,1)'); gr.addColorStop(0.25, 'rgba(255,150,60,.55)'); gr.addColorStop(1, 'rgba(255,120,30,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c);
}
const GLUT = 16;
const glutGeo = new THREE.BufferGeometry(); const glutPos = new Float32Array(GLUT * 3).fill(-999);
glutGeo.setAttribute('position', new THREE.BufferAttribute(glutPos, 3));
const glutMat = new THREE.PointsMaterial({ map: glutTextur(), size: 2.6, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: true });
const glut = new THREE.Points(glutGeo, glutMat); glut.frustumCulled = false; scene.add(glut);

// Funken (Gold, Knochenstaub, Treffer)
function punktTextur() {
  const c = document.createElement('canvas'); c.width = c.height = 32; const g = c.getContext('2d');
  const gr = g.createRadialGradient(16, 16, 1, 16, 16, 15); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 32, 32); return new THREE.CanvasTexture(c);
}
const FUNKEN = 160;
const fGeo = new THREE.BufferGeometry(), fPos = new Float32Array(FUNKEN * 3).fill(-999), fFarbe = new Float32Array(FUNKEN * 3), fVel = new Float32Array(FUNKEN * 3), fLeben = new Float32Array(FUNKEN);
fGeo.setAttribute('position', new THREE.BufferAttribute(fPos, 3)); fGeo.setAttribute('color', new THREE.BufferAttribute(fFarbe, 3));
const funken = new THREE.Points(fGeo, new THREE.PointsMaterial({ map: punktTextur(), size: 0.32, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
funken.frustumCulled = false; scene.add(funken);
let fNext = 0;
function funke(x, y, z, n, farbe, kraft = 1) {
  const c = col(farbe);
  for (let k = 0; k < n; k++) {
    const i = fNext; fNext = (fNext + 1) % FUNKEN;
    fPos.set([x + (Math.random() - 0.5) * 0.5, y + Math.random() * 0.4, z + (Math.random() - 0.5) * 0.5], i * 3);
    fVel.set([(Math.random() - 0.5) * 5 * kraft, (1 + Math.random() * 4) * kraft, (Math.random() - 0.3) * 4 * kraft], i * 3);
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

// Schattenfleck unter dem Helden
const fleck = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 2, 32, 32, 31); gr.addColorStop(0, 'rgba(0,0,0,.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.renderOrder = 1; scene.add(m); return m;
})();

// ---------- Ton ----------
let audio = null;
function ton(art) {
  if (!stand.ton) return;
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume();
    const t = audio.currentTime;
    const note = (f, start, dauer, typ = 'sine', laut = 0.12, f2) => {
      const o = audio.createOscillator(), g = audio.createGain();
      o.type = typ; o.frequency.setValueAtTime(f, t + start); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + start + dauer);
      g.gain.setValueAtTime(0.0001, t + start); g.gain.exponentialRampToValueAtTime(laut, t + start + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + start + dauer);
      o.connect(g).connect(audio.destination); o.start(t + start); o.stop(t + start + dauer + 0.02);
    };
    const rauschen = (dauer, laut, von, bis) => {
      const n = Math.floor(audio.sampleRate * dauer), b = audio.createBuffer(1, n, audio.sampleRate), d = b.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
      const s = audio.createBufferSource(), f = audio.createBiquadFilter(), g = audio.createGain();
      s.buffer = b; f.type = 'bandpass'; f.frequency.setValueAtTime(von, t); f.frequency.exponentialRampToValueAtTime(bis, t + dauer); g.gain.value = laut;
      s.connect(f).connect(g).connect(audio.destination); s.start(t);
    };
    if (art === 'muenze') { note(988, 0, 0.07, 'square', 0.04); note(1319, 0.05, 0.14, 'square', 0.04); }
    else if (art === 'sprung') note(260, 0, 0.25, 'triangle', 0.1, 560);
    else if (art === 'schwert') rauschen(0.18, 0.5, 2400, 600);
    else if (art === 'kill') { note(180, 0, 0.12, 'square', 0.06, 90); rauschen(0.12, 0.35, 900, 300); }
    else if (art === 'kombo') { note(660, 0, 0.1, 'triangle'); note(880, 0.08, 0.1, 'triangle'); note(1175, 0.16, 0.2, 'triangle'); }
    else if (art === 'truhe') { note(523, 0, 0.1); note(659, 0.08, 0.1); note(784, 0.16, 0.1); note(1047, 0.24, 0.3); }
    else if (art === 'wechsel') rauschen(0.08, 0.15, 1200, 700);
    else if (art === 'landung') note(140, 0, 0.1, 'sine', 0.1, 80);
    else if (art === 'sturz') { note(330, 0, 0.4, 'sawtooth', 0.07, 90); rauschen(0.3, 0.4, 500, 120); }
    else if (art === 'klick') note(620, 0, 0.06, 'sine', 0.06);
    else if (art === 'kauf') { note(659, 0, 0.12); note(880, 0.1, 0.12); note(1319, 0.2, 0.3); }
  } catch (e) {}
}

// ---------- Zustand ----------
let zustand = 'laden';           // laden | menu | lauf | pause | ende
let lauf = L.neuerLauf(1);
let auswahl = stand.held;
let menuMix = 1, camX = 0, camY = 0, sturzZeit = 0, hinweisBis = 0, neuerRekord = false, ersterSkelett = true;
// Feste Takte (1/60 s) und Aufzeichnung der Eingaben: so kann der Server den Lauf exakt nachspielen
let takt = 0, rest = 0, aufnahme = [], tagSeed = 0, geprueft = true;
const CFG = () => window.PLAYSAAL_CFG || {};
const PS = () => window.PlaySaal || null;

// ---------- Eingabe: Wischen und Tippen, Tastatur ----------
const ein = { links: false, rechts: false, sprung: false, angriff: false };
const finger = new Map();
const fang = $('fang');
function ring(x, y) { const r = document.createElement('i'); r.className = 'spur'; r.style.left = x + 'px'; r.style.top = y + 'px'; fang.appendChild(r); setTimeout(() => r.remove(), 380); }
fang.addEventListener('pointerdown', (e) => {
  e.preventDefault(); try { fang.setPointerCapture(e.pointerId); } catch (x) {}
  finger.set(e.pointerId, { x: e.clientX, y: e.clientY, t: performance.now(), fertig: false });
});
fang.addEventListener('pointermove', (e) => {
  const f = finger.get(e.pointerId); if (!f || f.fertig) return;
  const dx = e.clientX - f.x, dy = e.clientY - f.y;
  if (Math.hypot(dx, dy) < 26) return;
  f.fertig = true;
  if (Math.abs(dx) > Math.abs(dy)) ein[dx < 0 ? 'links' : 'rechts'] = true; else if (dy < 0) ein.sprung = true; else ein.angriff = true;
});
const los = (e) => {
  const f = finger.get(e.pointerId); finger.delete(e.pointerId);
  if (f && !f.fertig && e.type === 'pointerup' && performance.now() - f.t < 400) { ein.angriff = true; ring(e.clientX, e.clientY); }
};
for (const ev of ['pointerup', 'pointercancel']) fang.addEventListener(ev, los);
fang.addEventListener('contextmenu', (e) => e.preventDefault());
const TASTEN = { ArrowLeft: 'links', KeyA: 'links', ArrowRight: 'rechts', KeyD: 'rechts', ArrowUp: 'sprung', KeyW: 'sprung', Space: 'angriff', KeyF: 'angriff', KeyJ: 'angriff', Enter: 'angriff', ArrowDown: 'angriff', KeyS: 'angriff' };
addEventListener('keydown', (e) => {
  if (zustand === 'lauf' && TASTEN[e.code]) { e.preventDefault(); if (!e.repeat) ein[TASTEN[e.code]] = true; }
  if (e.code === 'Escape' || e.code === 'KeyP') { if (zustand === 'lauf') pausiere(); else if (zustand === 'pause') weiter(); else if (zustand === 'rang') rangZu(); }
  if (zustand === 'menu' && !e.repeat) {
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') blaettere(-1);
    if (e.code === 'ArrowRight' || e.code === 'KeyD') blaettere(1);
  }
});
addEventListener('blur', () => finger.clear());
document.addEventListener('visibilitychange', () => { if (document.hidden && zustand === 'lauf') pausiere(); });
for (const ev of ['gesturestart', 'dblclick']) document.addEventListener(ev, (e) => e.preventDefault());
document.addEventListener('touchmove', (e) => { if (e.touches.length > 1 || zustand === 'lauf') e.preventDefault(); }, { passive: false });

// ---------- Oberfläche ----------
function zeige(id) {
  for (const s of ['menu', 'pause', 'ende', 'laden', 'rang']) $(s).hidden = s !== id;
  const laufend = id === null || id === 'pause';
  $('hud').hidden = !laufend;
  document.body.classList.toggle('im-lauf', id === null);
  document.body.classList.toggle('im-menu', id === 'menu');
  if (!laufend) $('kombo').hidden = true;
}
function tonKnoepfe() { for (const id of ['mTon', 'pTon']) { $(id).textContent = 'Ton: ' + (stand.ton ? 'an' : 'aus'); $(id).setAttribute('aria-pressed', String(stand.ton)); } }
async function zeigeMenu() {
  zustand = 'menu'; zeige('menu');
  lauf = L.neuerLauf(1); lauf.strecke.items = []; lauf.strecke.next = 1e9;
  for (const p of Object.values(pool)) for (const s of p) { s.item = null; s.root.visible = false; }
  await ladeHeld(auswahl); waehleHeld(auswahl);
  aktualisiereMenu();
}
function aktualisiereMenu() {
  const frei = stand.helden.includes(auswahl), preis = L.PREISE[auswahl];
  $('mGold').textContent = stand.gold.toLocaleString('de-DE');
  $('mName').textContent = L.NAMEN[auswahl];
  const info = $('mInfo'); info.classList.toggle('zu', !frei);
  info.textContent = frei ? (auswahl === stand.held ? 'Dein Held' : 'Freigeschaltet') : `🔒 ${preis} Gold`;
  $('mStart').hidden = !frei;
  const k = $('mKaufen'); k.hidden = frei;
  if (!frei) { const fehlt = preis - stand.gold; k.disabled = fehlt > 0; k.textContent = fehlt > 0 ? `Noch ${fehlt} Gold sammeln` : `Freischalten für ${preis} Gold`; }
  $('mPunkte').innerHTML = L.HELDEN.map((h) => `<i class="${h === auswahl ? 'an' : ''}"></i>`).join('');
  const heute = stand.tag === L.berlinTag() ? stand.tagBest : 0;
  $('mRekord').textContent = stand.rekord ? `Heute: ${heute.toLocaleString('de-DE')} · Rekord: ${stand.rekord.toLocaleString('de-DE')} Punkte` : 'Weiche aus, spring und besiege die Skelette!';
  tonKnoepfe();
}
let blaetterNr = 0;
async function blaettere(r) {
  const i = (L.HELDEN.indexOf(auswahl) + r + L.HELDEN.length) % L.HELDEN.length;
  auswahl = L.HELDEN[i]; ton('klick'); aktualisiereMenu();
  if (stand.helden.includes(auswahl)) { stand.held = auswahl; speichere(); }
  const nr = ++blaetterNr;
  await ladeHeld(auswahl);
  if (nr === blaetterNr && zustand === 'menu') waehleHeld(auswahl);
}
$('mLinks').addEventListener('click', () => blaettere(-1));
$('mRechts').addEventListener('click', () => blaettere(1));
$('mKaufen').addEventListener('click', () => {
  if (L.freischalten(stand, auswahl)) { speichere(); ton('kauf'); zeigePose('Cheering', 0.2); aktualisiereMenu(); popup('Freigeschaltet!', 'gold'); }
});
$('mStart').addEventListener('click', starte);
for (const id of ['mTon', 'pTon']) $(id).addEventListener('click', () => { stand.ton = !stand.ton; speichere(); tonKnoepfe(); ton('klick'); });
$('bPause').addEventListener('click', pausiere);
$('pWeiter').addEventListener('click', weiter);
$('pNeu').addEventListener('click', starte);
$('pMenu').addEventListener('click', zeigeMenu);
$('eNochmal').addEventListener('click', starte);
$('eHelden').addEventListener('click', zeigeMenu);

async function starte() {
  if (!stand.helden.includes(auswahl)) auswahl = stand.held;
  stand.held = auswahl; speichere();
  await ladeHeld(auswahl);
  // Alle spielen heute dieselbe Strecke (Tagesstrecke, Datum in Berlin)
  tagSeed = TEST && Q.get('seed') ? Number(Q.get('seed')) : L.berlinTag();
  lauf = L.neuerLauf(tagSeed); takt = 0; rest = 0; aufnahme = []; geprueft = true;
  for (const p of Object.values(pool)) for (const s of p) { s.item = null; s.root.visible = false; }
  zustand = 'lauf'; zeige(null);
  waehleHeld(auswahl);
  sturzZeit = 0; neuerRekord = false; ersterSkelett = true;
  for (const k of Object.keys(ein)) ein[k] = false;
  zeigeHinweis(HANDY ? 'Wischen <b>◀ ▶</b> ausweichen · <b>▲</b> springen<br><b>Tippen</b> = Angriff' : '<b>◀ ▶</b> ausweichen · <b>▲</b> springen · <b>Leertaste</b> = Angriff');
  hinweisBis = performance.now() + 4500;
  $('kombo').hidden = true;
  ton('klick');
}
function pausiere() { if (zustand !== 'lauf') return; zustand = 'pause'; zeige('pause'); tonKnoepfe(); }
function weiter() { if (zustand !== 'pause') return; zustand = 'lauf'; zeige(null); }
function zeigeHinweis(html) { const h = $('hinweis'); h.innerHTML = html; h.hidden = !html; }
function popup(text, klasse = '') {
  const s = document.createElement('span'); s.textContent = text; if (klasse) s.className = klasse;
  const p = $('pop'); p.appendChild(s); setTimeout(() => s.remove(), 1100);
  while (p.children.length > 3) p.firstChild.remove();
}
const TITEL = { kiste: 'Rumms – Kiste!', fass: 'Rumms – Fass!', stapel: 'Rumms – Kistenstapel!', stachel: 'Autsch, Stacheln!', diener: 'Erwischt!', krieger: 'Erwischt!' };
const GRUND = { kiste: 'Wische zur Seite, um auszuweichen.', fass: 'Wische zur Seite, um auszuweichen.', stapel: 'Wische zur Seite, um auszuweichen.', stachel: 'Über Stacheln springst du mit ▲.', diener: 'Skelette besiegst du mit einem Tipp.', krieger: 'Skelette besiegst du mit einem Tipp.' };
function zeigeEnde() {
  zustand = 'ende'; zeige('ende');
  $('eTitel').textContent = TITEL[lauf.getroffen] || 'Erwischt!';
  $('eGrund').textContent = HANDY ? GRUND[lauf.getroffen] || '' : (GRUND[lauf.getroffen] || '').replace('mit einem Tipp', 'mit der Leertaste').replace('Wische zur Seite', 'Drücke ◀ oder ▶');
  $('eMeter').textContent = Math.floor(lauf.d).toLocaleString('de-DE');
  $('ePunkte').textContent = L.punkte(lauf).toLocaleString('de-DE');
  $('eGold').textContent = '+' + lauf.muenzen;
  $('eExtra').textContent = lauf.kills ? `${lauf.kills} ${lauf.kills === 1 ? 'Skelett' : 'Skelette'} besiegt${lauf.besteSerie >= 3 ? ` · beste Kombo ×${L.kombo(lauf.besteSerie - 1)}` : ''}` : '';
  const r = $('eRekord'); r.classList.toggle('neu', neuerRekord);
  r.textContent = neuerRekord ? '★ Neuer Rekord! ★' : `Rekord: ${stand.rekord.toLocaleString('de-DE')} Punkte`;
  setTimeout(() => { if (zustand === 'ende') $('eNochmal').focus({ preventScroll: true }); }, 50);
}

// ---------- Tagesrangliste (geprüft) ----------
function zeigeStatus(text, ok = false) { const st = $('eStatus'); st.textContent = text; st.className = 'status' + (ok ? ' ok' : ''); }
async function melden(l) {
  const p = PS(); if (!p || !p.online) return { status: 'lokal' };
  if (!(p.hatSitzung && p.hatSitzung())) return { status: 'gast' };
  try {
    const tk = p.token && p.token(); if (!tk) return { status: 'gast' };
    const r = await fetch(CFG().url + '/functions/v1/kerkerlauf-lauf', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + tk, apikey: CFG().key || '' }, body: JSON.stringify(l) });
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
    else if (r.status === 'fehler') zeigeStatus('Rangliste gerade nicht erreichbar. Dein Lauf bleibt auf diesem Gerät.');
    else zeigeStatus('Neuer Tagesbestwert – gespeichert auf diesem Gerät.');
  });
}
const avatar = (p, a) => ((p && p.avatare) || [])[(parseInt(String(a || 'a1').slice(1), 10) || 1) - 1] || '🙂';
let rangZeit = 'heute', rangVon = 'menu';
async function rangliste(zeit) {
  rangZeit = zeit;
  if (zustand !== 'rang') { rangVon = zustand; zustand = 'rang'; }
  for (const s of ['menu', 'ende']) $(s).hidden = true;
  $('rang').hidden = false;
  for (const b of document.querySelectorAll('#rTabs button')) b.setAttribute('aria-pressed', String(b.dataset.z === zeit));
  const liste = $('rListe'); liste.textContent = 'Lädt …';
  const p = PS();
  const res = p && p.online && p.rpc ? await p.rpc('kerkerlauf_rangliste', { p_zeitraum: zeit, p_anzahl: 50 }).catch(() => null) : null;
  if (zeit !== rangZeit || zustand !== 'rang') return;
  if (!res || res.fehler) { liste.textContent = 'Die Rangliste ist gerade nicht erreichbar.'; return; }
  const rows = res.daten || [];
  liste.textContent = '';
  if (!rows.length) { liste.textContent = zeit === 'heute' ? 'Heute noch kein Eintrag. Lauf vor!' : 'Noch keine Einträge.'; return; }
  for (const r of rows) {
    const li = document.createElement('li'); if (r.ich) li.className = 'ich';
    const a = document.createElement('span'); a.className = 'pl'; a.textContent = String(r.platz);
    const b = document.createElement('span'); b.className = 'av'; b.textContent = avatar(p, r.avatar);
    const c = document.createElement('span'); c.className = 'nm'; c.textContent = r.name + (r.ich ? ' (du)' : '');
    const d = document.createElement('b'); d.textContent = Number(r.punkte).toLocaleString('de-DE');
    const e = document.createElement('small'); e.textContent = Number(r.meter).toLocaleString('de-DE') + ' m';
    li.append(a, b, c, d, e); liste.appendChild(li);
  }
}
function rangZu() { $('rang').hidden = true; zustand = rangVon; $(rangVon === 'ende' ? 'ende' : 'menu').hidden = false; }
for (const id of ['mRang', 'eRang']) $(id).addEventListener('click', () => { ton('klick'); rangliste('heute'); });
for (const b of document.querySelectorAll('#rTabs button')) b.addEventListener('click', () => rangliste(b.dataset.z));
$('rZu').addEventListener('click', rangZu);

function behandle(evs) {
  for (const e of evs) {
    if (e === 'muenze') { ton('muenze'); funke(lauf.x, 1.2 + lauf.y, -lauf.d - 0.5, 4, '#ffd84a', 0.6); }
    else if (e === 'sprung') { ton('sprung'); zeigePose('Jump_Full_Short', 0.08, held.a.Jump_Full_Short.getClip().duration / 0.78); }
    else if (e === 'landung') { ton('landung'); if (held.pose === 'Jump_Full_Short' || held.pose === 'Jump_Idle') zeigePose('Running_A', 0.12); funke(lauf.x, 0.1, -lauf.d, 8, '#8a7f99', 0.5); }
    else if (e === 'wechsel') ton('wechsel');
    else if (e === 'angriff') { ton('schwert'); const c = held.a[ANGRIFF_CLIP[held.name]]; zeigePose(ANGRIFF_CLIP[held.name], 0.06, c.getClip().duration / 0.5); }
    else if (e === 'truhe') { ton('truhe'); popup('+10 Gold', 'gold'); funke(lauf.x, 1, -lauf.d - 0.8, 24, '#ffd84a', 1.2); }
    else if (e === 'serieWeg') $('kombo').hidden = true;
    else if (e === 'sturz') {
      ton('sturz'); sturzZeit = performance.now(); zeigePose('Death_A', 0.1);
      funke(lauf.x, 1, -lauf.d - 0.6, 30, '#ff9a3d', 1.2);
      neuerRekord = L.verbuche(stand, lauf, tagSeed); speichere();
      $('eStatus').textContent = ''; $('eStatus').className = 'status';
      if (lauf.tagesBest && geprueft && L.punkte(lauf) > 0) meldeLauf({ v: L.SIM_VERSION, seed: tagSeed, inputs: L.kodiere(aufnahme), takte: takt, punkte: L.punkte(lauf), gold: lauf.muenzen, kills: lauf.kills });
      else if (stand.tagBest && stand.tag === tagSeed) $('eStatus').textContent = `Dein Tagesbestwert (${stand.tagBest.toLocaleString('de-DE')} Punkte) steht noch.`;
    } else if (e && e.typ === 'kill') {
      ton('kill');
      popup(e.mal > 1 ? `+${e.punkte} ×${e.mal}` : `+${e.punkte}`, e.mal > 1 ? 'orange' : '');
      const it = lauf.strecke.items.find((i) => i.id === e.id);
      if (it) funke(L.SPUREN[it.spur], 1.3, -it.d, 26, '#e8e2d0', 1.3);
      const m = L.kombo(lauf.serie);
      if (m > 1) { const k = $('kombo'); const neu = $('kMal').textContent !== '×' + m || k.hidden; $('kMal').textContent = '×' + m; if (neu) { k.hidden = false; k.style.animation = 'none'; void k.offsetWidth; k.style.animation = ''; if (L.kombo(lauf.serie - 1) < m) ton('kombo'); } }
    }
  }
}

// ---------- Welt zeichnen ----------
const M = new THREE.Matrix4(), Qn = new THREE.Quaternion(), E = new THREE.Euler(), V = new THREE.Vector3(), S = new THREE.Vector3();
const zaehler = {};
function setze(typ, x, y, z, rx = 0, ry = 0, s = 1, sy = s) {
  const m = inst[typ]; if (!m) return;
  const n = zaehler[typ] || 0; if (n >= MENGE[typ]) return;
  E.set(rx, ry, 0); Qn.setFromEuler(E); V.set(x, y, z); S.set(s, sy, s); M.compose(V, Qn, S); m.setMatrixAt(n, M); zaehler[typ] = n + 1;
}
const hash = (i, k) => { let h = Math.imul(i ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(k + 7, 0xc2b2ae35); h ^= h >>> 13; h = Math.imul(h, 0x27d4eb2f); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
const WAND_X = 6.5;
let glutN = 0;
function zeichneWelt(zeit) {
  for (const k in zaehler) zaehler[k] = 0;
  const d = lauf.d;
  glutN = 0; glutPos.fill(-999);
  // Gang: Boden (3 Platten), Wände, Säulen, Fackeln, Banner – fest aus der Reihennummer abgeleitet
  const von = Math.floor((d - 12) / 4), bis = Math.floor((d + 78) / 4);
  for (let i = von; i <= bis; i++) {
    const z = -i * 4 - 2;
    for (const x of [-4, 0, 4]) setze('boden', x, 0, z, 0, (hash(i, x + 9) * 4 | 0) * Math.PI / 2);
    setze('wand', -WAND_X, 0, z, 0, Math.PI / 2, 1, 1.6); setze('wand', WAND_X, 0, z, 0, -Math.PI / 2, 1, 1.6);
    if (i % 3 === 0) { setze('saeule', -WAND_X + 0.5, 0, z - 2, 0, 0, 0.8, 1.6); setze('saeule', WAND_X - 0.5, 0, z - 2, 0, 0, 0.8, 1.6); }
    if (i % 3 === 1) {
      const seite = i % 2 ? 1 : -1, x = seite * (WAND_X - 0.5);
      setze('fackel', x, 2.6, z, 0, -seite * Math.PI / 2, 1.3);
      if (glutN < GLUT) { glutPos.set([x - seite * 0.55, 3.25, z], glutN * 3); glutN++; }
    }
    const h = hash(i, 3);
    if (i % 3 === 2 && h < 0.55) setze(h < 0.27 ? 'banner_rot' : 'banner_blau', (i % 2 ? -1 : 1) * (WAND_X - 0.5), 0.2, z, 0, (i % 2 ? 1 : -1) * Math.PI / 2);
    if (i % 5 === 3) { const s = i % 2 ? 1 : -1; setze(hash(i, 5) < 0.5 ? 'kegel' : 'schutt', s * (WAND_X - 1.6), 0, z, 0, s > 0 ? Math.PI : 0, 0.55); }
  }
  glutMat.size = 2.5 + Math.sin(zeit * 13) * 0.12 + Math.sin(zeit * 7.3) * 0.1;
  glutGeo.attributes.position.needsUpdate = true;
  // Strecke
  const benutzt = new Set();
  for (const it of lauf.strecke.items) {
    if (it.weg || it.d > d + 76 || it.d < d - 10) continue;
    const x = L.SPUREN[it.spur], z = -it.d;
    if (it.typ === 'muenze') setze('muenze', x, it.y ?? 0.9, z, Math.PI / 2, zeit * 3 + it.id, 2.6);
    else if (it.typ === 'stachel') setze('stachel', x, 0.03, z, 0, 0, 0.74, 0.7);
    else if (it.typ === 'truhe') setze('truhe', x, 0, z, 0, Math.PI, 1);
    else if (it.typ === 'kiste') setze('kiste', x, 0, z, 0, (it.id % 4) * 0.4, 1.05);
    else if (it.typ === 'fass') setze('fass', x, 0, z, 0, it.id, 0.85);
    else if (it.typ === 'stapel') setze('stapel', x, 0, z, 0, (it.id % 2) * Math.PI, 0.95);
    else if (it.typ === 'skelett') benutzt.add(it.id);
  }
  for (const typ in inst) { inst[typ].count = zaehler[typ] || 0; inst[typ].instanceMatrix.needsUpdate = true; }
  zeichneSkelette(benutzt);
}
function zeichneSkelette(ids) {
  // freie Pool-Plätze für sichtbare Skelette vergeben, nicht mehr sichtbare zurückgeben
  for (const art of ['diener', 'krieger']) for (const s of pool[art]) if (s.item && !ids.has(s.item.id)) { s.item = null; s.root.visible = false; }
  const vergeben = new Set(Object.values(pool).flat().filter((s) => s.item).map((s) => s.item.id));
  for (const it of lauf.strecke.items) {
    if (!ids.has(it.id) || vergeben.has(it.id)) continue;
    const s = pool[it.art].find((p) => !p.item); if (!s) continue;
    s.item = it; s.root.visible = true; s.getauntet = false; s.pose = null; s.mixer.stopAllAction();
    skPose(s, it.besiegt ? 'Skeletons_Death' : 'Skeletons_Idle', 0); s.a.Skeletons_Idle.time = (it.id * 0.37) % 1.5;
  }
  for (const art of ['diener', 'krieger']) for (const s of pool[art]) {
    const it = s.item; if (!it) continue;
    const vor = it.d - lauf.d;
    let y = 0;
    if (it.besiegt) {
      if (s.pose !== 'Skeletons_Death') skPose(s, 'Skeletons_Death', 0.08);
      const seit = lauf.t - it.besiegt; if (seit > 0.9) y = -Math.min(2.4, (seit - 0.9) * 2.2);
    } else if (!s.getauntet && vor < 15 && vor > 3) { s.getauntet = true; skPose(s, 'Skeletons_Taunt', 0.2); }
    s.root.position.set(L.SPUREN[it.spur], y, -it.d);
    s.root.rotation.y = 0; // schaut dem Helden entgegen
    s.root.scale.setScalar(it.art === 'krieger' ? 1.08 : 1);
  }
}

// ---------- Kamera ----------
const kamZiel = new THREE.Vector3(), kamBlick = new THREE.Vector3(), tA = new THREE.Vector3(), tB = new THREE.Vector3();
let foto = false;
function kamera(dt) {
  const d = lauf.d, hoch = camera.aspect < 0.75;
  camX += (lauf.x * 0.55 - camX) * Math.min(1, dt * 7);
  camY += (lauf.y * 0.3 - camY) * Math.min(1, dt * 5);
  tA.set(camX, (hoch ? 6.3 : 5.0) + camY, -d + (hoch ? 7.0 : 7.0));
  tB.set(camX * 0.6, (hoch ? 0.2 : 0.8) + camY, -d - 10);
  if (foto) { const q = camera.aspect < 1.3; kamZiel.set(0, q ? 2.0 : 2.1, -d + (q ? 7.2 : 8.2)); kamBlick.set(0, q ? 1.05 : 1.25, -d - 1.5); }
  else if (hoch) { kamZiel.set(0.8, 2.3, -d + 6.2); kamBlick.set(0, 1.25, -d); }
  else { kamZiel.set(1.6, 1.8, -d + 4.6); kamBlick.set(0.5, 1.1, -d); }
  kamZiel.lerp(tA, 1 - menuMix); kamBlick.lerp(tB, 1 - menuMix);
  camera.position.copy(kamZiel); camera.lookAt(kamBlick);
  fackel.position.set(lauf.x * 0.6, 4.2, -d - 2.5);
  mond.position.set(-3, 10, -d + 5); mond.target.position.set(0, 0, -d - 6);
}

// ---------- Held bewegen ----------
function bewegeHeld(dt, zeit) {
  if (!held || foto) return;
  heldGruppe.position.set(lauf.x, lauf.y, -lauf.d);
  fleck.position.set(lauf.x, 0.03, -lauf.d); const fs = Math.max(0.4, 1 - lauf.y * 0.25); fleck.scale.set(fs, fs, fs);
  if (zustand === 'menu') { heldGruppe.rotation.set(0, Math.sin(zeit * 0.6) * 0.3, 0); return; }
  // Blickrichtung nach vorn (−z); beim Spurwechsel leicht in die Kurve
  const ziel = L.SPUREN[lauf.spur] - lauf.x;
  heldGruppe.rotation.set(0, Math.PI + Math.max(-0.5, Math.min(0.5, -ziel * 0.25)), Math.max(-0.2, Math.min(0.2, ziel * 0.07)));
  if (zustand === 'lauf' && !lauf.tot) {
    const p = held.pose;
    if (!lauf.luft && (p === 'Jump_Idle' || (p === 'Jump_Full_Short' && !held.a[p].isRunning()))) zeigePose('Running_A', 0.12);
    if (p === 'Running_A') held.a.Running_A.setEffectiveTimeScale(0.85 + L.tempo(lauf.d) / 22);
  }
}

// ---------- Hauptschleife ----------
let letzte = performance.now(), hP = -1, hM = -1, hG = -1, lastSumme = 0, lastZahl = 0;
function hud() {
  const p = L.punkte(lauf), m = Math.floor(lauf.d);
  if (p !== hP) { hP = p; $('hPunkte').textContent = p.toLocaleString('de-DE'); }
  if (m !== hM) { hM = m; $('hMeter').textContent = m.toLocaleString('de-DE'); }
  if (lauf.muenzen !== hG) { hG = lauf.muenzen; $('hGold').textContent = lauf.muenzen; }
}
function frame(jetzt) {
  requestAnimationFrame(frame);
  const dtEcht = Math.min(0.1, (jetzt - letzte) / 1000); letzte = jetzt;
  const dt = Math.min(0.05, dtEcht), zeit = jetzt / 1000;
  if (zustand === 'laden') return;
  if (zustand === 'lauf') {
    rest = Math.min(rest + dtEcht, 0.1);   // bei Rucklern lieber kurz langsamer als ein Sprung nach vorn
    while (rest >= L.DT && !lauf.tot) {
      rest -= L.DT;
      const m = L.maske(ein);
      if (m) aufnahme.push([takt, m]);
      for (const k of Object.keys(ein)) ein[k] = false;
      const evs = L.schritt(lauf, L.DT, { links: !!(m & 1), rechts: !!(m & 2), sprung: !!(m & 4), angriff: !!(m & 8) });
      takt++;
      if (evs.length) behandle(evs);
    }
    if (lauf.tot && performance.now() - sturzZeit > 1500) zeigeEnde();
    if (hinweisBis && performance.now() > hinweisBis) { hinweisBis = 0; zeigeHinweis(''); }
    if (ersterSkelett && !hinweisBis && lauf.strecke.items.some((it) => it.typ === 'skelett' && !it.besiegt && Math.abs(L.SPUREN[it.spur] - lauf.x) < 1 && it.d - lauf.d < 16 && it.d > lauf.d)) {
      ersterSkelett = false; zeigeHinweis(HANDY ? '<b>Tippen</b> = Skelett besiegen!' : '<b>Leertaste</b> = Skelett besiegen!'); hinweisBis = performance.now() + 1800;
    }
    hud();
  }
  menuMix += ((zustand === 'menu' ? 1 : 0) - menuMix) * Math.min(1, dt * 3);
  if (Math.abs(menuMix - (zustand === 'menu' ? 1 : 0)) < 0.002) menuMix = zustand === 'menu' ? 1 : 0;
  if (zustand !== 'pause') {
    bewegeHeld(dt, zeit);
    if (held) held.mixer.update(dt);
    for (const p of Object.values(pool)) for (const s of p) if (s.item) s.mixer.update(dt);
    bewegeFunken(dt);
    if (foto) for (const h of Object.values(heldModelle)) h.mixer.update(dt);
  }
  zeichneWelt(zeit);
  kamera(dt);
  renderer.render(scene, camera);
  if (zustand === 'lauf') {
    lastSumme += dtEcht; lastZahl++;
    if (lastZahl >= 120) { if (lastSumme / lastZahl > 0.026 && pixel > 1) { pixel = Math.max(1, pixel - 0.35); renderer.setPixelRatio(pixel); groesse(); } lastSumme = 0; lastZahl = 0; }
  }
}
function groesse() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.fov = camera.aspect < 0.75 ? 68 : 56; camera.updateProjectionMatrix();
}
addEventListener('resize', groesse);

// Foto-Modus für Kachel/Teilen-Vorschau (nur mit ?test)
async function fotoModus() {
  for (const h of L.HELDEN) await ladeHeld(h);
  foto = true; menuMix = 1; zustand = 'menu'; zeige('menu');
  lauf = L.neuerLauf(5); lauf.d = 20; lauf.strecke.items = [
    { id: 1, typ: 'skelett', art: 'krieger', spur: 0, d: 27 }, { id: 2, typ: 'skelett', art: 'diener', spur: 2, d: 28 }, { id: 3, typ: 'skelett', art: 'diener', spur: 1, d: 33 },
    { id: 4, typ: 'muenze', spur: 1, d: 30, y: 1.6 }, { id: 5, typ: 'muenze', spur: 1, d: 31.6, y: 1.6 }, { id: 6, typ: 'muenze', spur: 1, d: 29.5, y: 1.6 }, { id: 7, typ: 'truhe', spur: 1, d: 26.5 }];
  lauf.strecke.next = 1e9;
  const plaetze = { ritter: [0, 0, 'Idle_A'], barbar: [-2.1, 0.7, 'Melee_2H_Idle'], schurke: [2.1, 0.7, 'Idle_A'], waldlaeufer: [-4.0, 1.6, 'Cheering'], magier: [4.0, 1.6, 'Idle_A'] };
  heldGruppe.position.set(0, 0, -lauf.d); heldGruppe.rotation.set(0, 0, 0); fleck.visible = false;
  for (const [n, [x, z, pose]] of Object.entries(plaetze)) {
    const q = camera.aspect < 1.3, hx = x * (q ? 0.74 : 1);
    const h = heldModelle[n]; h.root.visible = true; h.root.position.set(hx, 0, z); h.root.rotation.y = -hx * 0.08;
    h.mixer.stopAllAction(); h.a[pose].reset().play(); h.a[pose].time = 0.4;
  }
  held = null;
  document.body.classList.add('foto');
}

async function start() {
  groesse();
  const namen = ['welt', 'skelett-diener', 'skelett-krieger', 'anim-basis', 'anim-allgemein', 'anim-kampf', 'anim-magie', 'anim-skelett', 'anim-jubel', 'held-' + auswahl];
  let fertig = 0; const balken = $('ladeBalken');
  try {
    const g = await Promise.all(namen.map((n) => ladeGlb(n).then((x) => { fertig++; balken.style.width = (fertig / namen.length * 100) + '%'; return x; })));
    for (const a of g.slice(3, 9)) for (const c of a.animations) CLIPS[c.name] = c;
    const welt = g[0].scene, teil = (n) => welt.getObjectByName(n);
    for (const [typ, name] of Object.entries(TEIL)) {
      const node = teil(name);
      const geo = backe(node);
      if (typ === 'muenze') { muenzMat = new THREE.MeshLambertMaterial({ map: weltMat.map, emissive: col('#6a4500') }); instanzen(typ, geo, muenzMat); }
      else instanzen(typ, geo, weltMat);
    }
    baueSkelette({ diener: bereiteFigur(g[1]), krieger: bereiteFigur(g[2]) });
    richteHeldEin(auswahl, g[9]);
  } catch (e) {
    $('ladeText').textContent = 'Der Kerker konnte nicht geladen werden. Bitte Seite neu laden.';
    console.error(e); return;
  }
  await zeigeMenu();
  requestAnimationFrame(frame);
}
requestAnimationFrame(() => { letzte = performance.now(); });
start();

// Für die Browserprüfung (tests/kerkerlauf-browser.test.mjs)
window.__kerker = {
  get zustand() { return zustand; }, get lauf() { return lauf; }, get stand() { return stand; },
  get held() { return held && { name: held.name, pose: held.pose, sichtbar: held.root.visible, clips: Object.keys(held.a).length }; },
  get skelette() { return Object.values(pool).flat().filter((s) => s.item).map((s) => ({ id: s.item.id, pose: s.pose, sichtbar: s.root.visible })); },
  get zeichnungen() { return renderer.info.render.calls; }, get clips() { return Object.keys(CLIPS); },
  get instanzen() { const o = {}; for (const k in inst) o[k] = inst[k].count; return o; },
  get aufnahme() { return { seed: tagSeed, takte: takt, inputs: L.kodiere(aufnahme) }; },
  ...(TEST ? { foto: fotoModus, strecke(items) { geprueft = false; lauf.strecke.items = items.map((it, i) => ({ id: 9000 + i, ...it })); lauf.strecke.next = 1e9; } } : {}),
};
