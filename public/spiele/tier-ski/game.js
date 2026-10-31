// Tier-Ski – Darstellung (three.js r128 + GLTFLoader), Steuerung, Menüs. Regeln stehen in logik.js.
// Alle Modelle kommen als GLB aus Blender (design/tier-ski/tier-ski.blend). Tiere: echte Knoten-Hierarchie mit
// Animationsclips (fahren, links, rechts, ducken, sprung, trick, sturz) über AnimationMixer.
// Strecken-Objekte werden beim Laden zu je einer Geometrie mit Vertex-Farben verschmolzen und als InstancedMesh gezeichnet.
import * as L from './logik.js';

const THREE = window.THREE;
const $ = (id) => document.getElementById(id);
const Q = new URLSearchParams(location.search);
const TEST = Q.has('test');
const col = (hex) => new THREE.Color(hex).convertSRGBToLinear();

// ---------- Spielstand ----------
let stand = ladeStand();
function ladeStand() { try { return L.pruefeStand(JSON.parse(localStorage.getItem(L.SCHLUESSEL))); } catch (e) { return L.leerStand(); } }
function speichere() { try { localStorage.setItem(L.SCHLUESSEL, JSON.stringify(stand)); } catch (e) {} }

// ---------- Renderer, Szene ----------
const canvas = $('c');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
} catch (e) {
  $('ladeText').textContent = 'Dein Browser kann leider kein 3D (WebGL) anzeigen.';
  throw e;
}
let pixel = Math.min(window.devicePixelRatio || 1, 2);
renderer.setPixelRatio(pixel);
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.setClearColor(0x000000, 0);

const scene = new THREE.Scene();
const NEBEL = col('#d8ecff');
scene.fog = new THREE.Fog(NEBEL, 42, 118);
const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 500);
scene.add(new THREE.HemisphereLight(col('#eaf6ff'), col('#8fa6cc'), 0.95));
const sonne = new THREE.DirectionalLight(col('#fff6e8'), 0.85);
sonne.position.set(-4, 10, 6); scene.add(sonne);

const NEIGUNG = -0.17;                      // der Hang fällt in Fahrtrichtung ab
const hang = new THREE.Group(); hang.rotation.x = NEIGUNG; scene.add(hang);
hang.updateMatrixWorld();

// ---------- Boden: Piste (gewalzt, mit Spuren) und Tiefschnee daneben ----------
function schneeTextur(spuren) {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = spuren ? '#f7faff' : '#eef5ff'; g.fillRect(0, 0, 256, 256);
  let s = spuren ? 11 : 29; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(150,185,230,${0.05 + r() * 0.08})`; g.beginPath(); g.ellipse(r() * 256, r() * 256, 2 + r() * 7, 1 + r() * 3, 0, 0, 7); g.fill(); }
  if (spuren) {
    for (let i = 0; i < 7; i++) {
      const x = 14 + r() * 228; g.strokeStyle = `rgba(140,175,225,${0.18 + r() * 0.12})`; g.lineWidth = 2;
      for (const o of [-4, 4]) { g.beginPath(); g.moveTo(x + o, 0); g.bezierCurveTo(x + o + 10, 90, x + o - 10, 170, x + o, 256); g.stroke(); }
    }
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.encoding = THREE.sRGBEncoding;
  t.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  return t;
}
const BODEN_LAENGE = 240;
const pistenTex = schneeTextur(true); pistenTex.repeat.set(2.5, BODEN_LAENGE / 6);
const tiefTex = schneeTextur(false); tiefTex.repeat.set(16, BODEN_LAENGE / 8);
const piste = new THREE.Mesh(new THREE.PlaneGeometry(L.PISTE * 2 + 1.6, BODEN_LAENGE), new THREE.MeshLambertMaterial({ map: pistenTex }));
piste.rotation.x = -Math.PI / 2; hang.add(piste);
const tiefschnee = new THREE.Mesh(new THREE.PlaneGeometry(140, BODEN_LAENGE), new THREE.MeshLambertMaterial({ map: tiefTex, color: col('#e3efff') }));
tiefschnee.rotation.x = -Math.PI / 2; tiefschnee.position.y = -0.03; hang.add(tiefschnee);

// ---------- Schatten (weiche Flecken statt teurer Schattenberechnung) ----------
function fleckTextur() {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 2, 32, 32, 31); gr.addColorStop(0, 'rgba(60,90,150,.42)'); gr.addColorStop(1, 'rgba(60,90,150,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c);
}
const fleckMat = new THREE.MeshBasicMaterial({ map: fleckTextur(), transparent: true, depthWrite: false });
const fleckGeo = new THREE.PlaneGeometry(1, 1); fleckGeo.rotateX(-Math.PI / 2);

// ---------- Modelle ----------
const loader = new THREE.GLTFLoader();
const url = (n) => new URL(`./modelle/${n}.glb?v=1`, import.meta.url).href;
const ladeGlb = (n) => new Promise((ok, err) => loader.load(url(n), ok, undefined, err));

const weltMat = new THREE.MeshLambertMaterial({ vertexColors: true });
const glanzMat = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: col('#4a3300') });
const bergMat = new THREE.MeshLambertMaterial({ vertexColors: true, fog: false });

// Alle Teile eines Objekts zu einer Geometrie mit Vertex-Farben verschmelzen (ein Zeichenaufruf pro Objektart)
function backe(root) {
  root.position.set(0, 0, 0); root.rotation.set(0, 0, 0); root.updateMatrixWorld(true);
  const pos = [], nor = [], farbe = [];
  const v = new THREE.Vector3(), n = new THREE.Vector3(), nm = new THREE.Matrix3();
  root.traverse((o) => {
    if (!o.isMesh) return;
    const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry;
    nm.getNormalMatrix(o.matrixWorld);
    const c = o.material.color.clone();
    if (o.material.emissive) c.add(o.material.emissive.clone().multiplyScalar(0.5));
    const P = g.attributes.position, N = g.attributes.normal;
    for (let i = 0; i < P.count; i++) {
      v.fromBufferAttribute(P, i).applyMatrix4(o.matrixWorld); pos.push(v.x, v.y, v.z);
      n.fromBufferAttribute(N, i).applyMatrix3(nm).normalize(); nor.push(n.x, n.y, n.z);
      farbe.push(Math.min(1, c.r), Math.min(1, c.g), Math.min(1, c.b));
    }
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(farbe, 3));
  geo.computeBoundingSphere();
  return geo;
}

const MENGE = { tanne: 170, fels: 30, schneemann: 20, schanze: 6, ast: 6, muenze: 70, flocke: 10, huegel: 70, stange: 60, berg: 14, fleck: 260 };
const inst = {};
function instanzen(typ, geo, mat, eltern = hang) {
  const m = new THREE.InstancedMesh(geo, mat, MENGE[typ]);
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.count = 0; m.frustumCulled = false;
  eltern.add(m); inst[typ] = m; return m;
}

// Tiere: Materialien auf das günstigere Lambert umstellen, Clips vorbereiten
const tiere = {};
function richteTierEin(name, gltf) {
  const root = gltf.scene;
  const cache = new Map();
  root.traverse((o) => {
    if (!o.isMesh) return;
    const m = o.material;
    if (!cache.has(m)) cache.set(m, new THREE.MeshLambertMaterial({ color: m.color, emissive: m.emissive || new THREE.Color(0) }));
    o.material = cache.get(m);
  });
  const mixer = new THREE.AnimationMixer(root);
  const a = {};
  for (const clip of gltf.animations) {
    const act = mixer.clipAction(clip);
    if (['sprung', 'trick', 'sturz'].includes(clip.name)) { act.setLoop(THREE.LoopOnce, 1); act.clampWhenFinished = true; }
    a[clip.name] = act;
  }
  root.visible = false;
  figur.add(root);
  tiere[name] = { root, mixer, a, pose: null, clips: gltf.animations.map((c) => c.name) };
}

// ---------- Spielfigur ----------
const figur = new THREE.Group(); hang.add(figur);
const figurFleck = new THREE.Mesh(fleckGeo, fleckMat); figurFleck.scale.set(1.5, 1, 2.1); figurFleck.renderOrder = 1; hang.add(figurFleck);
let tier = null;
function waehleTier(name) {
  for (const t of Object.values(tiere)) t.root.visible = false;
  tier = tiere[name]; tier.root.visible = true;
  tier.pose = null; tier.mixer.stopAllAction(); setzePose('fahren', 0);
}
function setzePose(name, fade = 0.16) {
  if (!tier || tier.pose === name) return;
  const neu = tier.a[name], alt = tier.pose && tier.a[tier.pose];
  if (!neu) return;
  neu.reset(); neu.setEffectiveTimeScale(1); neu.setEffectiveWeight(1); neu.play();
  if (alt && fade > 0) neu.crossFadeFrom(alt, fade, false); else if (alt) alt.stop();
  tier.pose = name;
}

// ---------- Schneeflocken (Wetter) und Schneespritzer ----------
function punktTextur() {
  const c = document.createElement('canvas'); c.width = c.height = 32; const g = c.getContext('2d');
  const gr = g.createRadialGradient(16, 16, 1, 16, 16, 15); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.6, 'rgba(255,255,255,.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 32, 32); return new THREE.CanvasTexture(c);
}
const punkt = punktTextur();
const FLOCKEN = 220;
const flockenGeo = new THREE.BufferGeometry();
const fp = new Float32Array(FLOCKEN * 3);
for (let i = 0; i < FLOCKEN; i++) { fp[i * 3] = (Math.random() - 0.5) * 40; fp[i * 3 + 1] = Math.random() * 18; fp[i * 3 + 2] = -9 - Math.random() * 55; }
flockenGeo.setAttribute('position', new THREE.BufferAttribute(fp, 3));
const wetter = new THREE.Points(flockenGeo, new THREE.PointsMaterial({ color: 0xffffff, map: punkt, size: 0.2, transparent: true, opacity: 0.9, depthWrite: false }));
wetter.frustumCulled = false; scene.add(wetter);

const SPRITZER = 140;
const spGeo = new THREE.BufferGeometry();
const spPos = new Float32Array(SPRITZER * 3).fill(-999);
const spVel = new Float32Array(SPRITZER * 3), spLeben = new Float32Array(SPRITZER);
spGeo.setAttribute('position', new THREE.BufferAttribute(spPos, 3));
const spritzer = new THREE.Points(spGeo, new THREE.PointsMaterial({ color: col('#ffffff'), map: punkt, size: 0.28, transparent: true, opacity: 0.95, depthWrite: false }));
spritzer.frustumCulled = false; hang.add(spritzer);
let spNext = 0;
function spritze(x, y, z, n, kraft = 1) {
  for (let k = 0; k < n; k++) {
    const i = spNext; spNext = (spNext + 1) % SPRITZER;
    spPos[i * 3] = x + (Math.random() - 0.5) * 0.6; spPos[i * 3 + 1] = y + 0.1; spPos[i * 3 + 2] = z + (Math.random() - 0.3) * 0.6;
    spVel[i * 3] = (Math.random() - 0.5) * 4 * kraft; spVel[i * 3 + 1] = (1.5 + Math.random() * 3) * kraft; spVel[i * 3 + 2] = (0.5 + Math.random() * 3) * kraft;
    spLeben[i] = 0.5 + Math.random() * 0.4;
  }
}
function bewegeSpritzer(dt) {
  for (let i = 0; i < SPRITZER; i++) {
    if (spLeben[i] <= 0) continue;
    spLeben[i] -= dt;
    if (spLeben[i] <= 0) { spPos[i * 3 + 1] = -999; continue; }
    spVel[i * 3 + 1] -= 9 * dt;
    spPos[i * 3] += spVel[i * 3] * dt; spPos[i * 3 + 1] = Math.max(0.02, spPos[i * 3 + 1] + spVel[i * 3 + 1] * dt); spPos[i * 3 + 2] += spVel[i * 3 + 2] * dt;
  }
  spGeo.attributes.position.needsUpdate = true;
}

// ---------- Berge am Horizont ----------
const bergGruppe = new THREE.Group(); scene.add(bergGruppe);
const BERGE = [[-150, -250, 5.2, 0.3], [-70, -270, 4.2, 1.2], [10, -265, 5.8, 2.0], [85, -275, 4.6, 0.7], [160, -245, 5.4, 2.6], [-230, -200, 4.4, 1.7], [235, -200, 4.6, 0.4], [-20, -320, 7, 1.1], [130, -330, 6.4, 2.2], [-120, -335, 7.2, 0.2]];

// ---------- Ton ----------
let audio = null;
function ton(art) {
  if (!stand.ton) return;
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume();
    const t = audio.currentTime;
    const note = (f, start, dauer, typ = 'sine', laut = 0.13, f2) => {
      const o = audio.createOscillator(), g = audio.createGain();
      o.type = typ; o.frequency.setValueAtTime(f, t + start); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + start + dauer);
      g.gain.setValueAtTime(0.0001, t + start); g.gain.exponentialRampToValueAtTime(laut, t + start + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + start + dauer);
      o.connect(g).connect(audio.destination); o.start(t + start); o.stop(t + start + dauer + 0.02);
    };
    if (art === 'muenze') { note(988, 0, 0.08, 'square', 0.05); note(1319, 0.06, 0.16, 'square', 0.05); }
    else if (art === 'flocke') { note(1568, 0, 0.12); note(2093, 0.08, 0.12); note(2637, 0.16, 0.2); }
    else if (art === 'sprung') note(300, 0, 0.3, 'triangle', 0.12, 700);
    else if (art === 'trick') { note(784, 0, 0.12, 'triangle'); note(988, 0.1, 0.12, 'triangle'); note(1175, 0.2, 0.25, 'triangle'); }
    else if (art === 'landung') note(160, 0, 0.12, 'sine', 0.12, 90);
    else if (art === 'sturz') { note(420, 0, 0.45, 'triangle', 0.14, 110); note(200, 0.25, 0.3, 'sine', 0.1, 80); }
    else if (art === 'klick') note(660, 0, 0.06, 'sine', 0.06);
    else if (art === 'kauf') { note(659, 0, 0.12); note(880, 0.1, 0.12); note(1319, 0.2, 0.3); }
  } catch (e) {}
}

// ---------- Zustand ----------
let zustand = 'laden';           // laden | menu | fahrt | pause | ende
let fahrt = L.neueFahrt(1);
let auswahl = stand.tier;
let menuMix = 1;                 // 1 = Menü-Kamera, 0 = Verfolger-Kamera
let camX = 0, camY = 0, sturzZeit = 0, hinweisBis = 0, ersteSchanze = true;
let neuerRekord = false;

// ---------- Eingabe ----------
const taste = { links: false, rechts: false, duck: false, trick: false };
const finger = { tLinks: new Set(), tRechts: new Set(), tMitte: new Set() };
for (const id of Object.keys(finger)) {
  const b = $(id);
  const los = (e) => { finger[id].delete(e.pointerId); b.classList.toggle('an', finger[id].size > 0); };
  b.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    try { b.setPointerCapture(e.pointerId); } catch (x) {}
    finger[id].add(e.pointerId); b.classList.add('an');
    if (id === 'tMitte' && fahrt.luft) taste.trick = true;
  });
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(ev, los);
  b.addEventListener('contextmenu', (e) => e.preventDefault());
}
const eingabe = () => ({
  links: taste.links || finger.tLinks.size > 0,
  rechts: taste.rechts || finger.tRechts.size > 0,
  duck: taste.duck || finger.tMitte.size > 0,
  trick: taste.trick,
});
const TASTEN = { ArrowLeft: 'links', KeyA: 'links', ArrowRight: 'rechts', KeyD: 'rechts', ArrowDown: 'duck', KeyS: 'duck' };
addEventListener('keydown', (e) => {
  if (TASTEN[e.code]) { taste[TASTEN[e.code]] = true; if (zustand === 'fahrt') e.preventDefault(); }
  if (e.code === 'Space' && zustand === 'fahrt') { e.preventDefault(); if (!e.repeat && fahrt.luft) taste.trick = true; }
  if (e.code === 'Escape' || e.code === 'KeyP') { if (zustand === 'fahrt') pausiere(); else if (zustand === 'pause') weiter(); }
  if (zustand === 'menu' && !e.repeat) {
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') blaettere(-1);
    if (e.code === 'ArrowRight' || e.code === 'KeyD') blaettere(1);
  }
});
addEventListener('keyup', (e) => { if (TASTEN[e.code]) taste[TASTEN[e.code]] = false; });
addEventListener('blur', () => { taste.links = taste.rechts = taste.duck = false; for (const s of Object.values(finger)) s.clear(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && zustand === 'fahrt') pausiere(); });
// Kein Zoomen/Scrollen über Gesten
for (const ev of ['gesturestart', 'dblclick']) document.addEventListener(ev, (e) => e.preventDefault());
document.addEventListener('touchmove', (e) => { if (e.touches.length > 1 || zustand === 'fahrt') e.preventDefault(); }, { passive: false });

// ---------- Oberfläche ----------
function zeige(id) {
  for (const s of ['menu', 'pause', 'ende', 'laden']) $(s).hidden = s !== id;
  const fahrend = id === null || id === 'pause';
  $('hud').hidden = !fahrend; $('steuer').hidden = !fahrend;
  document.body.classList.toggle('in-fahrt', fahrend);
  document.body.classList.toggle('im-menu', id === 'menu');
}
function tonKnoepfe() {
  for (const id of ['mTon', 'pTon']) { $(id).textContent = 'Ton: ' + (stand.ton ? 'an' : 'aus'); $(id).setAttribute('aria-pressed', String(stand.ton)); }
}
function zeigeMenu() {
  zustand = 'menu'; zeige('menu');
  fahrt = L.neueFahrt(1); fahrt.strecke.items = []; fahrt.strecke.next = 1e9;
  if (!tiere[auswahl]) auswahl = 'hase';
  waehleTier(auswahl);
  aktualisiereMenu();
}
function aktualisiereMenu() {
  const frei = stand.tiere.includes(auswahl), preis = L.PREISE[auswahl];
  $('mMuenzen').textContent = stand.muenzen;
  $('mName').textContent = L.NAMEN[auswahl];
  const info = $('mInfo'); info.classList.toggle('zu', !frei);
  info.textContent = frei ? (auswahl === stand.tier ? 'Dein Tier' : 'Freigeschaltet') : `🔒 ${preis} Münzen`;
  $('mStart').hidden = !frei;
  const k = $('mKaufen'); k.hidden = frei;
  if (!frei) {
    const fehlt = preis - stand.muenzen;
    k.disabled = fehlt > 0;
    k.textContent = fehlt > 0 ? `Noch ${fehlt} Münzen sammeln` : `Freischalten für ${preis}`;
  }
  $('mPunkte').innerHTML = L.TIERE.map((t) => `<i class="${t === auswahl ? 'an' : ''}"></i>`).join('');
  $('mRekord').textContent = stand.rekord ? `Rekord: ${stand.rekord.toLocaleString('de-DE')} Punkte` : 'Lenke, ducke dich und spring über Schanzen!';
  tonKnoepfe();
}
function blaettere(r) {
  const i = (L.TIERE.indexOf(auswahl) + r + L.TIERE.length) % L.TIERE.length;
  auswahl = L.TIERE[i]; ton('klick');
  if (stand.tiere.includes(auswahl)) { stand.tier = auswahl; speichere(); }
  waehleTier(auswahl); setzePose('sprung', 0); aktualisiereMenu();
}
$('mLinks').addEventListener('click', () => blaettere(-1));
$('mRechts').addEventListener('click', () => blaettere(1));
$('mKaufen').addEventListener('click', () => {
  if (L.freischalten(stand, auswahl)) { speichere(); ton('kauf'); setzePose('trick', 0); aktualisiereMenu(); popup('Freigeschaltet!', 'gold'); }
});
$('mStart').addEventListener('click', starte);
for (const id of ['mTon', 'pTon']) $(id).addEventListener('click', () => { stand.ton = !stand.ton; speichere(); tonKnoepfe(); ton('klick'); });
$('bPause').addEventListener('click', pausiere);
$('pWeiter').addEventListener('click', weiter);
$('pNeu').addEventListener('click', starte);
$('pMenu').addEventListener('click', zeigeMenu);
$('eNochmal').addEventListener('click', starte);
$('eTiere').addEventListener('click', zeigeMenu);

function starte() {
  if (!stand.tiere.includes(auswahl)) auswahl = stand.tier;
  stand.tier = auswahl; speichere();
  const seed = TEST && Q.get('seed') ? Number(Q.get('seed')) : (Date.now() % 1e9);
  fahrt = L.neueFahrt(seed);
  waehleTier(auswahl);
  zustand = 'fahrt'; zeige(null);
  sturzZeit = 0; neuerRekord = false;
  for (const k of Object.keys(taste)) taste[k] = false;
  hinweisBis = performance.now() + 4200;
  zeigeHinweis('◀ ▶ halten zum Lenken · ⬇ zum Ducken');
  document.body.classList.remove('luft', 'trick-weg');
  ton('klick');
}
function pausiere() { if (zustand !== 'fahrt') return; zustand = 'pause'; zeige('pause'); tonKnoepfe(); }
function weiter() { if (zustand !== 'pause') return; zustand = 'fahrt'; zeige(null); }
function zeigeHinweis(t) { const h = $('hinweis'); h.textContent = t; h.hidden = !t; }
function popup(text, klasse = '') {
  const s = document.createElement('span'); s.textContent = text; if (klasse) s.className = klasse;
  const p = $('pop'); p.appendChild(s); setTimeout(() => s.remove(), 1100);
  while (p.children.length > 3) p.firstChild.remove();
}
const GRUND = { tanne: 'Die Tanne war schneller.', fels: 'Der Felsen hat nicht Platz gemacht.', schneemann: 'Der Schneemann wollte kuscheln.', ast: 'Beim Ast hilft Ducken!' };
function zeigeEnde() {
  zustand = 'ende'; zeige('ende');
  $('eGrund').textContent = GRUND[fahrt.getroffen] || '';
  $('eMeter').textContent = Math.floor(fahrt.d).toLocaleString('de-DE');
  $('ePunkte').textContent = L.punkte(fahrt).toLocaleString('de-DE');
  $('eMuenzen').textContent = '+' + fahrt.muenzen;
  const r = $('eRekord'); r.classList.toggle('neu', neuerRekord);
  r.textContent = neuerRekord ? '★ Neuer Rekord! ★' : `Rekord: ${stand.rekord.toLocaleString('de-DE')} Punkte`;
  setTimeout(() => { if (zustand === 'ende') $('eNochmal').focus({ preventScroll: true }); }, 50);
}

function behandle(ev) {
  for (const e of ev) {
    if (e === 'muenze') { ton('muenze'); }
    else if (e === 'flocke') { ton('flocke'); popup('+50 ❄', 'blau'); }
    else if (e === 'sprung') {
      ton('sprung'); document.body.classList.add('luft'); document.body.classList.remove('trick-weg');
      if (ersteSchanze) { zeigeHinweis('In der Luft: ★ drücken für einen Trick!'); hinweisBis = performance.now() + 1600; ersteSchanze = false; }
    }
    else if (e === 'trickStart') { document.body.classList.add('trick-weg'); }
    else if (e === 'landung') { ton('landung'); document.body.classList.remove('luft', 'trick-weg'); spritze(fahrt.x, 0, -fahrt.d, 22, 1.1); }
    else if (e === 'trick') { ton('trick'); popup('Trick! +100', 'gold'); }
    else if (e === 'sturz') {
      ton('sturz'); document.body.classList.remove('luft', 'trick-weg'); sturzZeit = performance.now();
      spritze(fahrt.x, 0.4, -fahrt.d, 45, 1.4);
      neuerRekord = L.verbuche(stand, fahrt); speichere();
    }
  }
}

// ---------- Welt zeichnen ----------
const M = new THREE.Matrix4(), Qn = new THREE.Quaternion(), E = new THREE.Euler(), V = new THREE.Vector3(), S = new THREE.Vector3();
const zaehler = {};
function setze(typ, x, y, z, rotY = 0, s = 1, sy = s) {
  const m = inst[typ]; if (!m) return;
  const n = zaehler[typ] || 0; if (n >= MENGE[typ]) return;
  E.set(0, rotY, 0); Qn.setFromEuler(E); V.set(x, y, z); S.set(s, sy, s);
  M.compose(V, Qn, S); m.setMatrixAt(n, M); zaehler[typ] = n + 1;
}
function fleck(x, z, b, t) {
  const m = inst.fleck, n = zaehler.fleck || 0; if (!m || n >= MENGE.fleck) return;
  M.makeScale(b, 1, t); M.setPosition(x, 0.03, z); m.setMatrixAt(n, M); zaehler.fleck = n + 1;
}
const hash = (i, k) => { let h = Math.imul(i ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(k + 7, 0xc2b2ae35); h ^= h >>> 13; h = Math.imul(h, 0x27d4eb2f); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
const RF = { tanne: 1.4, fels: 1.6, schneemann: 1.2 };

function zeichneWelt(zeit) {
  for (const k in zaehler) zaehler[k] = 0;
  const d = fahrt.d;
  // Boden wandert mit, die Textur verschiebt sich → durchgehende Piste ohne Lücken
  piste.position.set(0, 0, -d - BODEN_LAENGE / 2 + 40);
  tiefschnee.position.set(0, -0.03, -d - BODEN_LAENGE / 2 + 40);
  pistenTex.offset.y = (d / 6) % 1; tiefTex.offset.y = (d / 8) % 1;
  // Deko neben der Piste: alle 6 m eine Reihe, fest aus der Reihennummer abgeleitet
  const von = Math.floor((d - 14) / 6), bis = Math.floor((d + 122) / 6);
  for (let i = von; i <= bis; i++) {
    const z = -i * 6;
    for (const seite of [-1, 1]) {
      const k = seite > 0 ? 1 : 0;
      const a = hash(i, k), b = hash(i, k + 10), c = hash(i, k + 20), e = hash(i, k + 30);
      if (i % 2 === 0) setze('stange', seite * (L.PISTE + 0.65), 0, z, 0, 1.1);
      const x1 = seite * (L.PISTE + 2.2 + a * 9), s1 = 0.75 + b * 0.75;
      setze('tanne', x1, 0, z + c * 4, e * 6, s1); fleck(x1, z + c * 4, 3.2 * s1, 3.2 * s1);
      if (b > 0.35) setze('tanne', seite * (L.PISTE + 9 + e * 20), 0, z + a * 5, c * 6, 0.9 + a * 0.9);
      if (c > 0.55) setze('huegel', seite * (L.PISTE + 1.6 + e * 2.5), -0.1, z + b * 4, a * 6, 0.55 + c * 0.5, 0.5 + b * 0.4);
      if (e > 0.6) setze('tanne', seite * (L.PISTE + 18 + b * 30), 0, z + e * 3, a * 6, 1.1 + c);
    }
  }
  // Strecken-Objekte
  for (const it of fahrt.strecke.items) {
    if (it.weg || it.d > d + 125) continue;
    const z = -it.d;
    if (it.typ === 'muenze') setze('muenze', it.x, it.y, z, zeit * 3 + it.id, 0.9);
    else if (it.typ === 'flocke') setze('flocke', it.x, it.y + Math.sin(zeit * 3 + it.id) * 0.15, z, zeit * 1.5, 1);
    else if (it.typ === 'schanze') { setze('schanze', it.x, 0, z, 0, 1); fleck(it.x, z - 0.4, 3.6, 4); }
    else if (it.typ === 'ast') setze('ast', it.x, 0, z, 0, 1);
    else { setze(it.typ, it.x, 0, z, (it.id * 1.7) % 6.28, 1); fleck(it.x, z, 2 * RF[it.typ], 2 * RF[it.typ]); }
  }
  for (const typ in inst) {
    if (typ === 'berg') continue;
    inst[typ].count = zaehler[typ] || 0; inst[typ].instanceMatrix.needsUpdate = true;
  }
}

// ---------- Kamera ----------
const kamZiel = new THREE.Vector3(), kamBlick = new THREE.Vector3(), tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3();
function kamera(dt) {
  const d = fahrt.d;
  const hoch = camera.aspect < 0.75;
  camX += (fahrt.x * (hoch ? 0.88 : 0.6) - camX) * Math.min(1, dt * 6);
  camY += (fahrt.y * 0.35 - camY) * Math.min(1, dt * 5);
  // Verfolger: hinten, leicht erhöht; das Tier sitzt im unteren Drittel
  tmpA.set(camX, (hoch ? 4.1 : 3.7) + camY, -d + (hoch ? 7.4 : 7.0));
  tmpB.set(camX * 0.85, 0.6 + camY * 1.2, -d - 10);
  // Menü: vor dem Tier, schaut es an
  if (foto) { kamZiel.set(0.6, 1.75, -d - 6.1); kamBlick.set(0.75, 1.05, -d + 0.6); }
  else if (hoch) { kamZiel.set(0.9, 1.55, -d - 5.6); kamBlick.set(0, 1.15, -d); }
  else { kamZiel.set(2.0, 1.35, -d - 5.4); kamBlick.set(0.8, 0.5, -d); }
  kamZiel.lerp(tmpA, 1 - menuMix); kamBlick.lerp(tmpB, 1 - menuMix);
  hang.localToWorld(kamZiel); hang.localToWorld(kamBlick);
  camera.position.copy(kamZiel);
  camera.lookAt(kamBlick);
  // Berge und Wetter bleiben beim Betrachter
  bergGruppe.position.set(camera.position.x * 0.9, camera.position.y - 46, camera.position.z);
  wetter.position.set(camera.position.x, camera.position.y - 6, camera.position.z);
}

function bewegeWetter(dt, v) {
  const p = flockenGeo.attributes.position.array;
  for (let i = 0; i < FLOCKEN; i++) {
    p[i * 3 + 1] -= dt * (1.2 + (i % 5) * 0.25);
    p[i * 3 + 2] += dt * v * 0.9;
    p[i * 3] += Math.sin(performance.now() / 900 + i) * dt * 0.3;
    if (p[i * 3 + 1] < -2 || p[i * 3 + 2] > -3) { p[i * 3 + 1] = 4 + Math.random() * 14; p[i * 3 + 2] = -12 - Math.random() * 52; p[i * 3] = (Math.random() - 0.5) * 40; }
  }
  flockenGeo.attributes.position.needsUpdate = true;
}

// ---------- Figur ----------
let foto = false;
const FOTO = { hase: [-0.3, 0, 'fahren', 0.25], fuchs: [-2.3, 1.4, 'links', 0.15], pinguin: [1.9, 1.1, 'sprung', -0.2], baer: [3.9, 2.8, 'rechts', -0.3] };
function fotoModus() {
  foto = true;
  for (const [n, t] of Object.entries(tiere)) {
    const [x, z, pose, ry] = FOTO[n]; t.root.visible = true; t.root.position.set(x, n === 'pinguin' ? 0.35 : 0, z); t.root.rotation.y = ry;
    t.mixer.stopAllAction(); t.a[pose].reset().play(); t.pose = pose;
  }
  document.body.classList.add('foto');
}
function bewegeFigur(dt, zeit) {
  if (foto) { figur.position.set(0, 0, -fahrt.d); figur.rotation.set(0, 0, 0); figurFleck.visible = false; for (const t of Object.values(tiere)) t.mixer.update(dt); return; }
  figur.position.set(fahrt.x, fahrt.y, -fahrt.d);
  figurFleck.position.set(fahrt.x, 0.03 + (fahrt.schanze ? fahrt.y : 0), -fahrt.d + 0.1);
  const fs = Math.max(0.35, 1 - fahrt.y * 0.18); figurFleck.scale.set(1.5 * fs, 1, 2.1 * fs);
  if (zustand === 'menu') {
    figur.rotation.set(0, Math.sin(zeit * 0.7) * 0.35, 0);
    if (tier && ['sprung', 'trick'].includes(tier.pose) && !tier.a[tier.pose].isRunning()) setzePose('fahren', 0.3);
    return;
  }
  // Auf der Schanze kippt die Figur mit der Rampe
  figur.rotation.set(fahrt.schanze ? Math.atan2(L.SCHANZE.h, L.SCHANZE.l) : 0, -fahrt.lenk * 0.32, 0);
  let pose = 'fahren';
  if (fahrt.tot) pose = 'sturz';
  else if (fahrt.luft) pose = fahrt.trick ? 'trick' : 'sprung';
  else if (fahrt.duck) pose = 'ducken';
  else if (fahrt.lenk < -0.35) pose = 'links';
  else if (fahrt.lenk > 0.35) pose = 'rechts';
  setzePose(pose, pose === 'trick' ? 0.06 : 0.16);
  // Schnee spritzt in Kurven und bei hohem Tempo
  if (!fahrt.luft && !fahrt.tot && zustand === 'fahrt') {
    const menge = Math.abs(fahrt.lenk) > 0.45 ? 2 : (Math.random() < L.tempo(fahrt.d) / 60 ? 1 : 0);
    if (menge) spritze(fahrt.x + Math.sign(fahrt.lenk) * 0.3, 0, -fahrt.d + 0.6, menge, 0.6);
  }
}

// ---------- Hauptschleife ----------
let letzte = performance.now(), hudPunkte = -1, hudMeter = -1, hudMuenzen = -1;
let lastSumme = 0, lastZahl = 0;
function hud() {
  const p = L.punkte(fahrt), m = Math.floor(fahrt.d);
  if (p !== hudPunkte) { hudPunkte = p; $('hPunkte').textContent = p.toLocaleString('de-DE'); }
  if (m !== hudMeter) { hudMeter = m; $('hMeter').textContent = m.toLocaleString('de-DE'); }
  if (fahrt.muenzen !== hudMuenzen) { hudMuenzen = fahrt.muenzen; $('hMuenzen').textContent = fahrt.muenzen; }
}
function frame(jetzt) {
  requestAnimationFrame(frame);
  const dtEcht = Math.min(0.1, (jetzt - letzte) / 1000); letzte = jetzt;
  const dt = Math.min(0.05, dtEcht);
  const zeit = jetzt / 1000;
  if (zustand === 'laden') return;
  if (zustand === 'fahrt') {
    const ev = L.schritt(fahrt, dt, eingabe());
    taste.trick = false;
    if (ev.length) behandle(ev);
    if (fahrt.tot && performance.now() - sturzZeit > 1300) zeigeEnde();
    if (hinweisBis && performance.now() > hinweisBis) { hinweisBis = 0; zeigeHinweis(''); }
    hud();
  }
  menuMix += ((zustand === 'menu' ? 1 : 0) - menuMix) * Math.min(1, dt * 3.2);
  if (Math.abs(menuMix - (zustand === 'menu' ? 1 : 0)) < 0.002) menuMix = zustand === 'menu' ? 1 : 0;
  const lauf = zustand !== 'pause';
  if (lauf) {
    bewegeFigur(dt, zeit);
    if (tier) tier.mixer.update(dt * (zustand === 'fahrt' && !fahrt.tot && tier.pose === 'fahren' ? 0.6 + L.tempo(fahrt.d) / 20 : 1));
    bewegeSpritzer(dt);
    bewegeWetter(dt, zustand === 'fahrt' && !fahrt.tot ? L.tempo(fahrt.d) : 1.5);
  }
  zeichneWelt(zeit);
  kamera(dt);
  renderer.render(scene, camera);
  // Bei zu langsamen Bildern die Auflösung etwas senken
  if (zustand === 'fahrt') {
    lastSumme += dtEcht; lastZahl++;
    if (lastZahl >= 120) {
      if (lastSumme / lastZahl > 0.026 && pixel > 1) { pixel = Math.max(1, pixel - 0.35); renderer.setPixelRatio(pixel); groesse(); }
      lastSumme = 0; lastZahl = 0;
    }
  }
}

function groesse() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.fov = camera.aspect < 0.75 ? 70 : 58;
  camera.updateProjectionMatrix();
}
addEventListener('resize', groesse);

// ---------- Laden ----------
async function start() {
  groesse();
  const namen = ['welt', ...L.TIERE];
  let fertig = 0;
  const balken = $('ladeBalken');
  try {
    const glbs = await Promise.all(namen.map((n) => ladeGlb(n).then((g) => { fertig++; balken.style.width = (fertig / namen.length * 100) + '%'; return g; })));
    const welt = glbs[0].scene;
    const teil = (n) => welt.children.find((c) => c.name === n);
    for (const typ of ['tanne', 'fels', 'schneemann', 'schanze', 'ast', 'huegel', 'stange']) {
      instanzen(typ, backe(teil(typ[0].toUpperCase() + typ.slice(1))), weltMat);
    }
    instanzen('muenze', backe(teil('Muenze')), glanzMat);
    instanzen('flocke', backe(teil('Flocke')), glanzMat);
    const berg = instanzen('berg', backe(teil('Berg')), bergMat, bergGruppe);
    BERGE.forEach(([x, z, s, r], i) => { E.set(0, r, 0); Qn.setFromEuler(E); V.set(x, 0, z); S.set(s, s * 0.9, s); M.compose(V, Qn, S); berg.setMatrixAt(i, M); });
    berg.count = BERGE.length; berg.instanceMatrix.needsUpdate = true;
    instanzen('fleck', fleckGeo, fleckMat).renderOrder = 1;
    L.TIERE.forEach((t, i) => richteTierEin(t, glbs[i + 1]));
  } catch (e) {
    $('ladeText').textContent = 'Die Piste konnte nicht geladen werden. Bitte Seite neu laden.';
    console.error(e);
    return;
  }
  zeigeMenu();
  requestAnimationFrame(frame);
}
requestAnimationFrame(() => { letzte = performance.now(); });
start();

// Für die Browserprüfung (tests/tier-ski-browser.test.mjs)
window.__tierski = {
  get zustand() { return zustand; }, get fahrt() { return fahrt; }, get stand() { return stand; },
  get tier() { return tier && { pose: tier.pose, clips: tier.clips, sichtbar: tier.root.visible }; },
  get geladen() { return Object.keys(tiere); }, get zeichnungen() { return renderer.info.render.calls; },
  get instanzen() { const o = {}; for (const k in inst) o[k] = inst[k].count; return o; },
  ...(TEST ? { foto: fotoModus, strecke(items) { fahrt.strecke.items = items.map((it, i) => ({ id: 9000 + i, y: 0.9, ...it })); fahrt.strecke.next = 1e9; fahrt.strecke.reihen = []; } } : {}),
};
