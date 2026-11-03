// Putt-Profi – Darstellung (three.js r128), Steuerung (zurückziehen, zielen, loslassen), Kamera, Menüs, Ton.
// Regeln und Physik stehen in logik.js, die Bahnen in bahnen.js, die Kollisionsdaten in teile.js.
// Modelle: Kenney Minigolf Kit (CC0, www.kenney.nl), aufbereitet mit tools/putt-profi-assets.py.
import * as L from './logik.js?v=2';

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
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 120);
const himmel = new THREE.HemisphereLight(col('#dff1ff'), col('#5d7a46'), 0.8);
scene.add(himmel);
const sonne = new THREE.DirectionalLight(col('#fff4e0'), 0.85);
sonne.castShadow = true; sonne.shadow.mapSize.set(2048, 2048); sonne.shadow.bias = -0.0006; sonne.shadow.normalBias = 0.01;
scene.add(sonne); scene.add(sonne.target);
function himmelTextur(oben, unten) {
  const c = document.createElement('canvas'); c.width = 4; c.height = 256; const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, oben); gr.addColorStop(1, unten); g.fillStyle = gr; g.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; return t;
}

// ---------- Laden ----------
const TEILE = ['straight', 'end', 'corner', 'round-corner-c', 'side', 'open', 'hole-round', 'hole-open', 'obstacle-block', 'obstacle-diamond', 'obstacle-triangle',
  'narrow-block', 'narrow-round', 'narrow-square', 'castle', 'windmill', 'tunnel-narrow', 'tunnel-wide', 'tunnel-double', 'gap', 'split', 'bump', 'bump-down', 'bump-walls', 'hill-round', 'hill-square',
  'skew-corner', 'bump-down-walls', 'crest'];
const DEKO = ['ball-red', 'ball-blue', 'ball-green', 'club-red', 'club-blue', 'club-green', 'flag-red'];
const loader = new THREE.GLTFLoader();
const url = (n) => new URL(`./modelle/${n}.glb?v=1`, import.meta.url).href;
const ladeGlb = (n) => new Promise((ok, err) => loader.load(url(n), ok, undefined, err));
const vorlage = {};
const MAT = {};       // je Textur ein Material für die Bahn
async function ladeAlles() {
  const namen = [...TEILE, ...DEKO];
  let fertig = 0;
  const tex = new Promise((ok) => new THREE.TextureLoader().load(new URL('./modelle/Textures/variation-a.png?v=1', import.meta.url).href, ok, undefined, () => ok(null)));
  await Promise.all(namen.map((n) => ladeGlb(n).then((g) => { vorlage[n] = g.scene; fertig++; $('ladeBalken').style.width = Math.round(fertig / namen.length * 100) + '%'; })));
  let std = null;
  vorlage.straight.traverse((o) => { if (o.isMesh && !std) std = o.material.map; });
  MAT.colormap = new THREE.MeshLambertMaterial({ map: std });
  const lila = await tex;
  if (lila) { lila.flipY = false; lila.encoding = THREE.sRGBEncoding; lila.magFilter = std.magFilter; lila.minFilter = std.minFilter; }
  MAT['variation-a'] = new THREE.MeshLambertMaterial({ map: lila || std });
  MAT.deko = new THREE.MeshLambertMaterial({ map: std });
}

// ---------- Bahn in der Szene ----------
const bahnGruppe = new THREE.Group(); scene.add(bahnGruppe);
let muehlenObj = [], fahne = null;
const deko = {
  stamm: new THREE.MeshLambertMaterial({ color: col('#8a5a3b') }),
  krone: [new THREE.MeshPhongMaterial({ color: col('#7cbf4a'), flatShading: true, shininess: 0, specular: 0 }), new THREE.MeshPhongMaterial({ color: col('#5ea640'), flatShading: true, shininess: 0, specular: 0 })],
  stein: new THREE.MeshPhongMaterial({ color: col('#b9b4ad'), flatShading: true, shininess: 0, specular: 0 }),
};
const GEO = { stamm: new THREE.CylinderGeometry(0.06, 0.09, 0.5, 6), krone: new THREE.IcosahedronGeometry(0.42, 0), busch: new THREE.IcosahedronGeometry(0.28, 0), stein: new THREE.DodecahedronGeometry(0.18, 0) };
function leere(g) { while (g.children.length) g.remove(g.children[0]); }
function baueSzene(b) {
  leere(bahnGruppe); muehlenObj = [];
  const welt = L.WELTEN[b.welt], mat = MAT[welt.textur] || MAT.colormap;
  scene.background = himmelTextur(welt.himmel[0], welt.himmel[1]);
  himmel.color.copy(col(welt.himmel[1])); sonne.color.setHex(welt.licht).convertSRGBToLinear();
  for (const f of b.felder) {
    const o = vorlage[f.teil].clone(true);
    o.position.set(f.x, 0, f.z); o.rotation.y = f.r * Math.PI / 2;
    o.traverse((m) => { if (m.isMesh) { m.material = mat; m.castShadow = true; m.receiveShadow = true; } });
    if (f.teil === 'windmill') { const fl = o.getObjectByName('blades'); if (fl) { fl.scale.setScalar(1.15); muehlenObj.push(fl); } }
    bahnGruppe.add(o);
  }
  // Rasen rundherum
  const rasen = new THREE.Mesh(new THREE.PlaneGeometry(b.w + 40, b.h + 40), new THREE.MeshLambertMaterial({ color: col(welt.boden) }));
  rasen.rotation.x = -Math.PI / 2; rasen.position.set((b.w - 1) / 2, -0.002, (b.h - 1) / 2); rasen.receiveShadow = true; bahnGruppe.add(rasen);
  // Bäume, Büsche, Steine: fest aus der Bahnnummer, nie auf der Bahn
  const r = L.zufall(1000 + b.nr * 31 + (b.spiegel ? 7 : 0));
  const belegt = new Set(b.felder.map((f) => f.x + ',' + f.z));
  const frei = (x, z, abst) => { for (const f of b.felder) if (Math.abs(f.x - x) < 0.5 + abst && Math.abs(f.z - z) < 0.5 + abst) return false; return true; };
  let n = 0;
  for (let v = 0; v < 400 && n < 34; v++) {
    const x = -2.5 + r() * (b.w + 4), z = -2.5 + r() * (b.h + 4), art = r();
    if (!frei(x, z, art < 0.45 ? 1.1 : 0.45) || belegt.has(Math.round(x) + ',' + Math.round(z))) continue;
    const gr = new THREE.Group(); gr.position.set(x, 0, z); gr.rotation.y = r() * 6.28; const s = 0.55 + r() * 0.45; gr.scale.setScalar(s);
    if (art < 0.45) { const st = new THREE.Mesh(GEO.stamm, deko.stamm); st.position.y = 0.25; const kr = new THREE.Mesh(GEO.krone, deko.krone[n % 2]); kr.position.y = 0.72; gr.add(st, kr); }
    else if (art < 0.8) { const bu = new THREE.Mesh(GEO.busch, deko.krone[(n + 1) % 2]); bu.position.y = 0.16; bu.scale.y = 0.75; gr.add(bu); }
    else { const sn = new THREE.Mesh(GEO.stein, deko.stein); sn.position.y = 0.07; sn.scale.set(1, 0.7, 1.2); gr.add(sn); }
    gr.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
    bahnGruppe.add(gr); n++;
  }
  // Abschlag-Markierung und Fahne
  const tee = new THREE.Mesh(new THREE.CircleGeometry(0.11, 24), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false }));
  tee.rotation.x = -Math.PI / 2; tee.position.set(b.tee.x, b.tee.y - L.R + 0.002, b.tee.z); bahnGruppe.add(tee);
  fahne = vorlage['flag-red'].clone(true);
  fahne.traverse((m) => { if (m.isMesh) { m.material = new THREE.MeshLambertMaterial({ map: MAT.deko.map, transparent: true }); m.castShadow = true; } });
  fahne.position.set(b.loch.x, b.loch.y, b.loch.z); fahne.scale.setScalar(0.8); bahnGruppe.add(fahne);
  // Schatten nur über der Bahn
  const cx = (b.w - 1) / 2, cz = (b.h - 1) / 2, rad = Math.max(b.w, b.h) / 2 + 2.5;
  sonne.position.set(cx - 3, 8, cz + 4); sonne.target.position.set(cx, 0, cz);
  Object.assign(sonne.shadow.camera, { left: -rad, right: rad, top: rad, bottom: -rad, near: 1, far: 25 }); sonne.shadow.camera.updateProjectionMatrix();
  stelleMuehlen(muehleTakt);
}
// Das Flügeltuch sitzt seitlich am Arm: +0,18 rad, damit es genau dann unten steht, wenn logik.js die Tür sperrt
function stelleMuehlen(t) { for (const f of muehlenObj) f.rotation.z = t * (Math.PI / 2) / L.MUEHLE.periode - 0.18; }

// ---------- Kugel, Schläger, Zielhilfe ----------
const kugel = new THREE.Group(); scene.add(kugel);
let kugelMesh = null;
const FARBE = { rot: 'red', blau: 'blue', gruen: 'green', gold: 'red' };
function setzeKugel(id) {
  if (kugelMesh) kugel.remove(kugelMesh);
  kugelMesh = vorlage['ball-' + FARBE[id]].clone(true);
  kugelMesh.scale.setScalar(L.R / 0.03);
  kugelMesh.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.material = id === 'gold' ? new THREE.MeshPhongMaterial({ color: col('#ffd21c'), emissive: col('#5a3b00'), shininess: 90, specular: col('#fff3b0') }) : new THREE.MeshLambertMaterial({ map: MAT.deko.map }); } });
  kugel.add(kugelMesh);
  setzeSchlaeger(id);
}
const ring = new THREE.Mesh(new THREE.RingGeometry(0.07, 0.088, 32), new THREE.MeshBasicMaterial({ color: col('#ffd21c'), transparent: true, opacity: 0.9, depthWrite: false }));
ring.rotation.x = -Math.PI / 2; ring.renderOrder = 2; scene.add(ring);
const schlaeger = new THREE.Group(), kipp = new THREE.Group(); kipp.rotation.x = -0.35; schlaeger.add(kipp); scene.add(schlaeger);
let schlaegerMesh = null;
function setzeSchlaeger(id) {
  if (schlaegerMesh) kipp.remove(schlaegerMesh);
  schlaegerMesh = vorlage['club-' + FARBE[id]].clone(true);
  schlaegerMesh.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.material = MAT.deko; } });
  schlaegerMesh.scale.setScalar(0.62);
  schlaegerMesh.position.y = 0.77 * 0.62;          // Schlägerkopf auf dem Boden
  schlaegerMesh.rotation.y = Math.PI / 2;          // Schlagfläche quer zur Schlagrichtung
  kipp.add(schlaegerMesh);
}
const PUNKTE = 14;
const zielPunkte = [];
const punktMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, depthWrite: false });
for (let i = 0; i < PUNKTE; i++) { const m = new THREE.Mesh(new THREE.CircleGeometry(0.022, 12), punktMat); m.rotation.x = -Math.PI / 2; m.renderOrder = 3; m.visible = false; scene.add(m); zielPunkte.push(m); }
const pfeil = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.13, 3), new THREE.MeshBasicMaterial({ color: col('#ffd21c'), depthWrite: false }));
pfeil.renderOrder = 3; pfeil.visible = false; scene.add(pfeil);

// Konfetti beim Einlochen
const KONF = 90;
const kGeo = new THREE.BufferGeometry(), kPos = new Float32Array(KONF * 3).fill(-99), kCol = new Float32Array(KONF * 3), kVel = new Float32Array(KONF * 3), kLeben = new Float32Array(KONF);
kGeo.setAttribute('position', new THREE.BufferAttribute(kPos, 3)); kGeo.setAttribute('color', new THREE.BufferAttribute(kCol, 3));
const konfetti = new THREE.Points(kGeo, new THREE.PointsMaterial({ size: 0.05, vertexColors: true }));
konfetti.frustumCulled = false; scene.add(konfetti);
const KFARBEN = ['#ff9200', '#ffd21c', '#ff4a13', '#ffffff', '#5fd36b', '#6ec6ff'].map((c) => col(c));
function konfettiStart(x, y, z, n = 60) {
  for (let k = 0, i = 0; i < KONF && k < n; i++) {
    if (kLeben[i] > 0) continue;
    kLeben[i] = 1.4 + Math.random() * 0.6; kPos.set([x, y + 0.05, z], i * 3);
    const a = Math.random() * 6.28, v = 0.6 + Math.random() * 1.2;
    kVel.set([Math.cos(a) * v * 0.6, 2 + Math.random() * 1.6, Math.sin(a) * v * 0.6], i * 3);
    const c = KFARBEN[i % KFARBEN.length]; kCol.set([c.r, c.g, c.b], i * 3); k++;
  }
  kGeo.attributes.color.needsUpdate = true;
}
function konfettiTakt(dt) {
  for (let i = 0; i < KONF; i++) {
    if (kLeben[i] <= 0) continue;
    kLeben[i] -= dt; if (kLeben[i] <= 0) { kPos[i * 3 + 1] = -99; continue; }
    kVel[i * 3 + 1] -= 5 * dt; kVel[i * 3] *= 0.985; kVel[i * 3 + 2] *= 0.985;
    for (let k = 0; k < 3; k++) kPos[i * 3 + k] += kVel[i * 3 + k] * dt;
  }
  kGeo.attributes.position.needsUpdate = true;
}

// ---------- Ton (WebAudio): Dateien aus tools/putt-profi-sound.py, Rollgeräusch erzeugt ----------
const SOUNDS = ['musik', 'schlag', 'schlag-stark', 'bande', 'loch', 'geschafft', 'fanfare'];
const LAUT = { schlag: 0.8, 'schlag-stark': 0.8, bande: 0.55, loch: 0.9, geschafft: 0.7, fanfare: 0.65 };
const MUSIK = { menu: 0.32, spiel: 0.22, pause: 0.1, ende: 0.2 };
let audio = null, master = null, musikBus = null, fxBus = null, rollGain = null, rollFilter = null, musikLaeuft = false;
const puffer = {};
function audioStart() {
  try {
    if (!audio) {
      audio = new (window.AudioContext || window.webkitAudioContext)();
      master = audio.createGain(); master.connect(audio.destination);
      musikBus = audio.createGain(); musikBus.gain.value = 0; musikBus.connect(master);
      fxBus = audio.createGain(); fxBus.connect(master);
      for (const n of SOUNDS) {
        fetch(new URL(`./sound/${n}.mp3?v=1`, import.meta.url)).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(r.status)))
          .then((b) => new Promise((ok, err) => audio.decodeAudioData(b, ok, err)))
          .then((buf) => { puffer[n] = buf; if (n === 'musik') starteMusik(); }).catch(() => {});
      }
      // Rollgeräusch: gefiltertes Rauschen, Lautstärke folgt der Geschwindigkeit
      const n = audio.sampleRate * 2, rb = audio.createBuffer(1, n, audio.sampleRate), d = rb.getChannelData(0);
      let last = 0; for (let i = 0; i < n; i++) { last = last * 0.97 + (Math.random() * 2 - 1) * 0.03; d[i] = last * 6; }
      const src = audio.createBufferSource(); src.buffer = rb; src.loop = true;
      rollFilter = audio.createBiquadFilter(); rollFilter.type = 'lowpass'; rollFilter.frequency.value = 500;
      rollGain = audio.createGain(); rollGain.gain.value = 0;
      src.connect(rollFilter).connect(rollGain).connect(fxBus); src.start();
    }
    if (audio.state === 'suspended' && !document.hidden) audio.resume();
    master.gain.value = stand.ton ? 1 : 0;
    musikLautstaerke();
  } catch (e) {}
}
function grenzen(buf) {
  const d = buf.getChannelData(0); let a = 0, e = d.length - 1;
  while (a < d.length && Math.abs(d[a]) < 0.0015) a++;
  while (e > a && Math.abs(d[e]) < 0.0015) e--;
  return [a / buf.sampleRate, (e + 1) / buf.sampleRate];
}
function starteMusik() {
  if (musikLaeuft || !puffer.musik) return; musikLaeuft = true;
  const s = audio.createBufferSource(); s.buffer = puffer.musik; s.loop = true; [s.loopStart, s.loopEnd] = grenzen(puffer.musik);
  s.connect(musikBus); s.start(0, s.loopStart); musikLautstaerke();
}
function musikLautstaerke() {
  if (!musikBus) return;
  const z = zustand === 'menu' || zustand === 'bahnen' || zustand === 'rang' ? 'menu' : zustand === 'pause' ? 'pause' : zustand === 'ende' ? 'ende' : 'spiel';
  musikBus.gain.setTargetAtTime(MUSIK[z], audio.currentTime, 0.4);
}
addEventListener('pointerdown', audioStart, { capture: true });
addEventListener('keydown', audioStart, { capture: true });
document.addEventListener('visibilitychange', () => { if (!audio) return; if (document.hidden) audio.suspend(); else if (stand.ton) audio.resume(); });
function ton(art, laut = 1, rate = 1) {
  if (!stand.ton) return;
  try {
    audioStart();
    if (puffer[art]) {
      const s = audio.createBufferSource(), g = audio.createGain();
      s.buffer = puffer[art]; s.playbackRate.value = rate; g.gain.value = (LAUT[art] ?? 0.6) * laut;
      s.connect(g).connect(fxBus); s.start(); return;
    }
    const t = audio.currentTime;
    const note = (f, st, dauer, typ = 'sine', l = 0.12, f2) => {
      const o = audio.createOscillator(), g = audio.createGain();
      o.type = typ; o.frequency.setValueAtTime(f, t + st); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + st + dauer);
      g.gain.setValueAtTime(0.0001, t + st); g.gain.exponentialRampToValueAtTime(l, t + st + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + st + dauer);
      o.connect(g).connect(fxBus); o.start(t + st); o.stop(t + st + dauer + 0.02);
    };
    if (art === 'klick') note(620, 0, 0.06, 'sine', 0.06);
    else if (art === 'aus') { note(520, 0, 0.45, 'triangle', 0.12, 120); }
    else if (art === 'plopp') note(180, 0, 0.12, 'sine', 0.14 * laut, 90);
    else if (art === 'schlag' || art === 'schlag-stark') note(900, 0, 0.05, 'square', 0.05);
    else if (art === 'bande') note(240, 0, 0.08, 'triangle', 0.1 * laut, 160);
    else if (art === 'loch') { note(300, 0, 0.1, 'sine', 0.15); note(220, 0.1, 0.12, 'sine', 0.12); }
    else if (art === 'geschafft') { note(660, 0, 0.12, 'triangle', 0.1); note(880, 0.12, 0.2, 'triangle', 0.1); }
    else if (art === 'fanfare') { [523, 659, 784, 1047].forEach((f, i) => note(f, i * 0.12, 0.3, 'square', 0.05)); }
  } catch (e) {}
}
function rollTon(v, amBoden) {
  if (!rollGain) return;
  const ziel = stand.ton && amBoden ? Math.min(0.5, v * 0.16) : 0;
  rollGain.gain.setTargetAtTime(ziel, audio.currentTime, 0.04);
  rollFilter.frequency.setTargetAtTime(300 + v * 260, audio.currentTime, 0.05);
}

// ---------- Zustand ----------
let zustand = 'laden';     // laden | menu | bahnen | intro | zielen | rollen | loch | pause | ende | rang
let modus = 'uebung';      // uebung | runde
let bahn = null, ball = null, schuss = null, aufnahme = [], bahnNr = 0, bahnSpiegel = false;
let runde = null;          // { seed, plan, i, eingaben: [[…]], erg: [] }
let muehleTakt = 0, rest = 0, karte = false, introBis = 0, zustandVor = 'zielen', lochZeit = 0;
const CFG = () => window.PLAYSAAL_CFG || {};
const PS = () => window.PlaySaal || null;

function zeige(id) {
  for (const s of ['menu', 'bahnen', 'pause', 'loch', 'ende', 'laden', 'rang']) $(s).hidden = s !== id;
  const spiel = id === null || id === 'pause' || id === 'loch';
  $('hud').hidden = !spiel; $('bKarte').hidden = id !== null;
  document.body.classList.toggle('im-lauf', id === null);
  document.body.classList.toggle('im-spiel', spiel);
  document.body.classList.toggle('im-menu', id === 'menu');
  if (id !== null) { $('staerke').hidden = true; zielen(null); }
  setTimeout(musikLautstaerke, 0);
}
function meldung(text) { const t = $('toast'); t.textContent = text; t.hidden = false; clearTimeout(meldung.h); meldung.h = setTimeout(() => { t.hidden = true; }, 2600); }
function popup(text, klasse = '') {
  const s = document.createElement('span'); s.textContent = text; if (klasse) s.className = klasse;
  const p = $('pop'); p.appendChild(s); setTimeout(() => s.remove(), 1100);
  while (p.children.length > 2) p.firstChild.remove();
}
function hinweis(html) { const h = $('hinweis'); h.innerHTML = html || ''; h.hidden = !html; }
const vorzeichen = (d) => (d > 0 ? '+' + d : d < 0 ? '−' + -d : '±0');
function golfName(schlaege, par, drin) {
  if (!drin) return 'Nicht eingelocht';
  if (schlaege === 1) return 'Hole-in-one!';
  const d = schlaege - par;
  return d <= -3 ? 'Albatros!' : d === -2 ? 'Eagle!' : d === -1 ? 'Birdie!' : d === 0 ? 'Par' : d === 1 ? 'Bogey' : d === 2 ? 'Doppel-Bogey' : 'Eingelocht';
}

// ---------- Menü ----------
function tonKnoepfe() { for (const id of ['mTon', 'pTon']) { $(id).textContent = 'Ton: ' + (stand.ton ? 'an' : 'aus'); $(id).setAttribute('aria-pressed', String(stand.ton)); } }
const BALLFARBE = { rot: '#e8453c', blau: '#3d7be0', gruen: '#3fb65f', gold: '#ffd21c' };
function aktualisiereMenu() {
  $('mSterne').textContent = L.gesamtSterne(stand); $('mMax').textContent = '/ ' + L.MAX_STERNE;
  const tag = L.berlinTag();
  $('mRekord').textContent = stand.tag === tag && stand.tagBest ? `Deine beste Runde heute: ${stand.tagBest} Schläge` : 'Heute noch keine Runde gespielt.';
  const box = $('mBaelle'); box.textContent = '';
  for (const b of L.BAELLE) {
    const k = document.createElement('button'); k.type = 'button'; k.style.background = `radial-gradient(circle at 35% 30%, #fff8 0 12%, ${BALLFARBE[b.id]} 13%)`;
    const frei = L.ballFrei(stand, b.id); k.disabled = !frei; k.setAttribute('aria-pressed', String(stand.ball === b.id));
    k.setAttribute('aria-label', 'Ball ' + b.name + (frei ? '' : `, ab ${b.sterne} Sternen`));
    if (!frei) { const s = document.createElement('small'); s.textContent = '★' + b.sterne; k.appendChild(s); }
    k.addEventListener('click', () => { stand.ball = b.id; speichere(); setzeKugel(b.id); ton('klick'); aktualisiereMenu(); });
    box.appendChild(k);
  }
  tonKnoepfe();
  // Herausforderung per Link (?b=Bahn&s=Schläge)
  const hb = Number(Q.get('b')), hs = Number(Q.get('s'));
  const h = $('mHerausforderung');
  if (Number.isInteger(hb) && hb >= 1 && hb <= L.BAHNEN.length && Number.isInteger(hs) && hs >= 1 && hs <= L.MAX_SCHLAEGE) {
    h.hidden = false; $('mHText').textContent = `Herausforderung: Schaffst du Bahn ${hb} „${L.BAHNEN[hb - 1].name}“ in ${hs} ${hs === 1 ? 'Schlag' : 'Schlägen'}?`;
  } else h.hidden = true;
}
function zeigeMenu() {
  zustand = 'menu'; modus = 'uebung'; runde = null; zeige('menu'); aktualisiereMenu();
  const plan = L.tagesRunde(L.berlinTag());
  ladeBahn(plan[0].nr, plan[0].spiegel);
  kugel.visible = false; ring.visible = false; schlaeger.visible = false;
}
let platzWahl = 0;
function zeigeBahnen(platz) {
  zustand = 'bahnen'; zeige('bahnen');
  if (platz !== undefined) platzWahl = platz;
  const tabs = $('bPlaetze'); tabs.textContent = '';
  L.PLAETZE.forEach((pl, pi) => {
    const k = document.createElement('button'); k.type = 'button'; k.setAttribute('aria-pressed', String(pi === platzWahl));
    k.textContent = pl.name + (L.platzFrei(stand, pi) ? '' : ` 🔒 ★${pl.sterne}`);
    k.addEventListener('click', () => { ton('klick'); zeigeBahnen(pi); });
    tabs.appendChild(k);
  });
  const liste = $('bListe'); liste.textContent = '';
  if (!L.platzFrei(stand, platzWahl)) {
    const p = document.createElement('p'); p.className = 'gesperrt';
    p.textContent = `${L.PLAETZE[platzWahl].name} öffnet sich ab ${L.PLAETZE[platzWahl].sterne} Sternen. Du hast ${L.gesamtSterne(stand)}.`;
    liste.appendChild(p);
  }
  L.WELTEN.forEach((w, wi) => {
    if (w.platz !== platzWahl) return;
    const sek = document.createElement('section'), h = document.createElement('h3'); h.textContent = w.name;
    const gitter = document.createElement('div'); gitter.className = 'welt-gitter';
    L.BAHNEN.forEach((bd, nr) => {
      if (bd.welt !== wi) return;
      const k = document.createElement('button'); k.type = 'button';
      const frei = L.frei(stand, nr), best = stand.bahnen[nr], st = best ? L.sterne(nr, best) : 0;
      k.disabled = !frei;
      k.innerHTML = `<b>${frei ? nr + 1 : '🔒'}</b><span></span><i>${'★'.repeat(st)}${'☆'.repeat(3 - st)}</i>`;
      k.querySelector('span').textContent = bd.name + (best ? ` · ${best <= L.MAX_SCHLAEGE ? best : '–'}` : '');
      k.setAttribute('aria-label', `Bahn ${nr + 1}: ${bd.name}, Par ${bd.par}${best ? ', ' + st + ' Sterne' : ''}${frei ? '' : ', gesperrt'}`);
      k.addEventListener('click', () => { ton('klick'); starteUebung(nr); });
      gitter.appendChild(k);
    });
    sek.append(h, gitter); liste.appendChild(sek);
  });
}

// ---------- Spielablauf ----------
function ladeBahn(nr, spiegel) {
  bahnNr = nr; bahnSpiegel = spiegel;
  bahn = L.baueBahn(nr, spiegel); ball = L.neuerBall(bahn); schuss = null; aufnahme = [];
  baueSzene(bahn);
  setzeKugelPos(ball.x, ball.y, ball.z);
}
function starteUebung(nr) {
  modus = 'uebung'; runde = null;
  spieleBahn(nr, false);
}
function starteRunde() {
  const seed = TEST && Q.get('seed') ? Number(Q.get('seed')) : L.berlinTag();
  runde = { seed, plan: L.tagesRunde(seed), i: 0, eingaben: [], erg: [] };
  modus = 'runde';
  spieleBahn(runde.plan[0].nr, runde.plan[0].spiegel);
}
function spieleBahn(nr, spiegel) {
  ladeBahn(nr, spiegel);
  kugel.visible = true; kugel.scale.setScalar(1);
  zeige(null); zustand = 'intro'; karte = false; $('bKarte').setAttribute('aria-pressed', 'false');
  introBis = performance.now() + 1700;
  kamera.sofort = true; kamera.modus = 'karte';
  hud();
  const erst = !stand.bahnen[0] && nr === 0 && modus === 'uebung';
  hinweis(erst || (modus === 'runde' && runde.i === 0 && !stand.tagBest)
    ? (HANDY ? 'Finger aufs Grün, <b>zurückziehen</b>, loslassen' : 'Maus drücken, <b>zurückziehen</b>, loslassen') : '');
  ton('klick');
}
function hud() {
  $('hBahn').textContent = modus === 'runde' ? `Bahn ${runde.i + 1}/${L.RUNDE}` : `Bahn ${bahnNr + 1}`;
  $('hName').textContent = bahn.name + (bahnSpiegel ? ' (gespiegelt)' : '');
  $('hPar').textContent = bahn.par;
  $('hSchlag').textContent = ball.schlaege;
  $('hGesamtBox').hidden = modus !== 'runde';
  if (modus === 'runde') {
    let d = 0; runde.erg.forEach((e, i) => { d += e - L.BAHNEN[runde.plan[i].nr].par; });
    $('hGesamt').textContent = vorzeichen(d);
  }
}
function schiesse(e) {
  if (zustand !== 'zielen' || ball.fertig) return;
  aufnahme.push(e);
  schuss = L.starteSchlag(bahn, ball, e);
  zustand = 'rollen'; rest = 0; hinweis('');
  schwung = 0.12;
  ton(e.p > 550 ? 'schlag-stark' : 'schlag', 0.5 + e.p / 2000);
}
function nachSchlag() {
  const ende = schuss.ende;
  L.beende(bahn, ball, schuss);
  muehleTakt = schuss.ph + schuss.k;
  hud();
  if (ende === 'loch') {
    lochZeit = performance.now();
    ton('loch'); konfettiStart(bahn.loch.x, bahn.loch.y, bahn.loch.z, ball.schlaege === 1 ? 90 : 40);
    popup(golfName(ball.schlaege, bahn.par, true), ball.schlaege <= bahn.par ? 'gold' : '');
    if (ball.schlaege === 1 || ball.schlaege < bahn.par) setTimeout(() => ton('fanfare'), 500);
    zustand = 'loch'; setTimeout(bahnFertig, 1500); return;
  }
  if (ende === 'aus') { ton('aus'); popup('Aus! +1', 'orange'); meldung('Die Kugel ist im Aus – 1 Strafschlag, zurück an die alte Stelle.'); }
  setzeKugelPos(ball.x, ball.y, ball.z);
  if (ball.fertig) { zustand = 'loch'; setTimeout(bahnFertig, 900); return; }
  zustand = 'zielen';
}
function bahnFertig() {
  const e = L.ergebnis(ball), drin = ball.eingelocht;
  zustand = 'loch'; zeige('loch');
  $('lTitel').textContent = golfName(ball.schlaege, bahn.par, drin);
  $('lText').textContent = drin ? `${ball.schlaege} ${ball.schlaege === 1 ? 'Schlag' : 'Schläge'} · Par ${bahn.par}${ball.aus ? ` · ${ball.aus}× im Aus` : ''}` : `Nach ${L.MAX_SCHLAEGE} Schlägen zählt die Bahn ${L.MAX_SCHLAEGE + 1}.`;
  const sterneBox = $('lSterne'); sterneBox.textContent = '';
  if (modus === 'runde') {
    runde.erg.push(e); runde.eingaben.push(aufnahme.slice());
    const letzte = runde.i === L.RUNDE - 1;
    $('lWeiter').textContent = letzte ? 'Zur Auswertung' : 'Nächste Bahn';
    $('lZwei').hidden = true; sterneBox.hidden = true;
    let d = 0; runde.erg.forEach((x, i) => { d += x - L.BAHNEN[runde.plan[i].nr].par; });
    $('lExtra').textContent = `Runde bisher: ${vorzeichen(d)}`;
    if (drin && ball.schlaege === 1) stand.hio++, speichere();
  } else {
    const vorher = L.gesamtSterne(stand);
    const neu = L.verbucheBahn(stand, bahnNr, ball); speichere();
    const st = L.sterne(bahnNr, e);
    sterneBox.hidden = false;
    for (let i = 0; i < 3; i++) { const s = document.createElement('span'); s.textContent = '★'; if (i < st) s.className = 'an'; sterneBox.appendChild(s); }
    const nachher = L.gesamtSterne(stand);
    const freiBall = L.BAELLE.find((b) => b.sterne > vorher && b.sterne <= nachher);
    $('lExtra').textContent = freiBall ? `Neuer Ball freigeschaltet: ${freiBall.name}!` : neu && stand.bahnen[bahnNr] !== undefined && drin ? 'Neue Bestleistung!' : '';
    const naechste = bahnNr + 1 < L.BAHNEN.length && L.frei(stand, bahnNr + 1) ? bahnNr + 1 : null;
    const neuerPlatz = bahnNr + 1 < L.BAHNEN.length && L.platzVon(bahnNr + 1) !== L.platzVon(bahnNr);
    $('lWeiter').textContent = naechste === null ? 'Alle Bahnen' : neuerPlatz ? 'Weiter auf Platz 2' : 'Nächste Bahn';
    if (neuerPlatz && naechste === null) $('lExtra').textContent = `Platz 2 öffnet sich ab ${L.PLAETZE[1].sterne} Sternen (du hast ${L.gesamtSterne(stand)}).`;
    $('lZwei').hidden = false;
    if (drin && ball.schlaege <= bahn.par) ton('geschafft');
  }
  if (modus === 'runde' && drin && ball.schlaege <= bahn.par) ton('geschafft', 0.8);
  setTimeout(() => { if (zustand === 'loch') $('lWeiter').focus({ preventScroll: true }); }, 50);
}
function weiterNachLoch() {
  if (modus === 'runde') {
    if (runde.i < L.RUNDE - 1) { runde.i++; spieleBahn(runde.plan[runde.i].nr, runde.plan[runde.i].spiegel); }
    else rundeEnde();
    return;
  }
  const n = bahnNr + 1;
  if (n < L.BAHNEN.length && L.frei(stand, n)) spieleBahn(n, false); else zeigeBahnen(L.platzVon(Math.min(n, L.BAHNEN.length - 1)));
}
function rundeEnde() {
  zustand = 'ende'; zeige('ende');
  const summe = runde.erg.reduce((a, b) => a + b, 0), par = runde.plan.reduce((a, p) => a + L.BAHNEN[p.nr].par, 0), d = summe - par;
  $('eTitel').textContent = d < 0 ? 'Unter Par – stark!' : d === 0 ? 'Genau Par!' : 'Runde geschafft!';
  $('eUnter').textContent = 'Tagesrunde vom ' + String(runde.seed).replace(/^(\d{4})(\d\d)(\d\d)$/, '$3.$2.$1');
  const zeile = $('eBahnen'); zeile.textContent = '';
  runde.erg.forEach((e, i) => {
    const p = L.BAHNEN[runde.plan[i].nr].par, dv = document.createElement('div');
    dv.innerHTML = `<small>Bahn ${i + 1}</small><b></b>`; dv.querySelector('b').textContent = e > L.MAX_SCHLAEGE ? '7' : e;
    if (e < p) dv.querySelector('b').className = 'unter-par'; else if (e > p) dv.querySelector('b').className = 'ueber-par';
    zeile.appendChild(dv);
  });
  $('eSchlaege').textContent = summe; $('ePar').textContent = par; $('eDiff').textContent = vorzeichen(d);
  const tag = runde.seed;
  const neu = L.verbucheRunde(stand, tag, summe); speichere();
  const r = $('eRekord'); r.classList.toggle('neu', neu);
  r.textContent = neu ? '★ Neuer Tagesbestwert! ★' : `Dein Tagesbestwert: ${stand.tagBest} Schläge`;
  $('eStatus').textContent = ''; $('eStatus').className = 'status';
  if (neu) { ton('fanfare'); meldeRunde({ v: L.SIM_VERSION, seed: tag, inputs: L.kodiere(runde.eingaben), schlaege: summe }); }
}

// ---------- Tagesrangliste (geprüft) ----------
function zeigeStatus(text, ok = false) { const st = $('eStatus'); st.textContent = text; st.className = 'status' + (ok ? ' ok' : ''); }
async function melden(l) {
  const p = PS(); if (!p || !p.online) return { status: 'lokal' };
  if (!(p.hatSitzung && p.hatSitzung())) return { status: 'gast' };
  try {
    const tk = p.token && p.token(); if (!tk) return { status: 'gast' };
    const r = await fetch(CFG().url + '/functions/v1/putt-profi-runde', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + tk, apikey: CFG().key || '' }, body: JSON.stringify(l) });
    if (r.status === 404) return { status: 'lokal' };
    const j = await r.json().catch(() => ({}));
    if (r.ok && j.verifiziert) return { status: 'verifiziert', platz: j.platz_heute || null, von: j.spieler_heute || null };
    if (r.ok) return { status: 'abgelehnt', grund: j.grund || '' };
    return { status: 'fehler' };
  } catch (e) { return { status: 'fehler' }; }
}
function meldeRunde(l) {
  zeigeStatus('Wird geprüft …');
  melden(l).then((r) => {
    if (r.status === 'verifiziert') zeigeStatus('✓ Vom Server nachgespielt' + (r.platz ? ` · Platz ${r.platz}${r.von ? ' von ' + r.von : ''} heute` : ''), true);
    else if (r.status === 'gast') zeigeStatus('Melde dich an (Reiter am Rand), dann kommst du in die Tagesrangliste.');
    else if (r.status === 'abgelehnt') zeigeStatus(r.grund === 'zu_oft' ? 'Zu viele Meldungen. Gleich wieder versuchen.' : r.grund === 'kein_profil' ? 'Lege zuerst einen Spielernamen an (Konto).' : r.grund === 'tag' ? 'Diese Tagesrunde ist schon vorbei.' : 'Nicht in die Rangliste übernommen.');
    else if (r.status === 'fehler') zeigeStatus('Rangliste gerade nicht erreichbar. Deine Runde bleibt auf diesem Gerät.');
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
  const res = p && p.online && p.rpc ? await p.rpc('putt_rangliste', { p_zeitraum: zeit, p_anzahl: 50 }).catch(() => null) : null;
  if (zeit !== rangZeit || zustand !== 'rang') return;
  if (!res || res.fehler) { liste.textContent = 'Die Rangliste ist gerade nicht erreichbar.'; return; }
  const rows = res.daten || [];
  liste.textContent = '';
  if (!rows.length) { liste.textContent = zeit === 'heute' ? 'Heute noch kein Eintrag. Leg los!' : 'Noch keine Einträge.'; return; }
  for (const r of rows) {
    const li = document.createElement('li'); if (r.ich) li.className = 'ich';
    const a = document.createElement('span'); a.className = 'pl'; a.textContent = String(r.platz);
    const b = document.createElement('span'); b.className = 'av'; b.textContent = avatar(p, r.avatar);
    const c = document.createElement('span'); c.className = 'nm'; c.textContent = r.name + (r.ich ? ' (du)' : '');
    const d = document.createElement('b'); d.textContent = r.schlaege + ' Schläge';
    const e = document.createElement('small'); e.textContent = vorzeichen(r.schlaege - r.par) + ' zu Par';
    li.append(a, b, c, d, e); liste.appendChild(li);
  }
}
function rangZu() { $('rang').hidden = true; zustand = rangVon; $(rangVon === 'ende' ? 'ende' : 'menu').hidden = false; musikLautstaerke(); }

// ---------- Teilen ----------
async function teile(text, url) {
  if (navigator.share) { try { await navigator.share({ title: 'Putt-Profi', text, url }); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
  try { await navigator.clipboard.writeText(text + ' ' + url); meldung('Link kopiert – schick ihn deinen Freunden!'); } catch (e) { meldung(url); }
}
function teileBahn() {
  const n = ball.eingelocht ? ball.schlaege : L.MAX_SCHLAEGE;
  const url = `${location.origin}${location.pathname}?b=${bahnNr + 1}&s=${n}`;
  teile(ball.eingelocht && ball.schlaege === 1
    ? `Hole-in-one auf Bahn ${bahnNr + 1} „${bahn.name}“ bei Putt-Profi! Schaffst du das auch?`
    : `Ich habe Bahn ${bahnNr + 1} „${bahn.name}“ bei Putt-Profi in ${n} ${n === 1 ? 'Schlag' : 'Schlägen'} geschafft. Schaffst du es besser?`, url);
}
function teileRunde() {
  const summe = runde.erg.reduce((a, b) => a + b, 0), par = runde.plan.reduce((a, p) => a + L.BAHNEN[p.nr].par, 0);
  teile(`Ich habe die Putt-Profi-Tagesrunde in ${summe} Schlägen (${vorzeichen(summe - par)}) gespielt. Schaffst du es besser?`, location.origin + location.pathname);
}

// ---------- Eingabe: zurückziehen, zielen, loslassen ----------
const ray = new THREE.Raycaster(), ebene = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), V1 = new THREE.Vector3(), V2 = new THREE.Vector3();
let zug = null;   // { id, sx, sy, x, y }
function bodenPunkt(cx, cy, ziel) {
  const r = canvas.getBoundingClientRect();
  ray.setFromCamera({ x: ((cx - r.left) / r.width) * 2 - 1, y: -((cy - r.top) / r.height) * 2 + 1 }, camera);
  ebene.constant = -ball.y;
  return ray.ray.intersectPlane(ebene, ziel);
}
const vollerZug = () => Math.max(140, Math.min(320, innerHeight * 0.3));
function zugWerte() {
  if (!zug) return null;
  const px = zug.x - zug.sx, py = zug.y - zug.sy, laenge = Math.sqrt(px * px + py * py);
  const staerke = Math.min(1, laenge / vollerZug());
  if (!bodenPunkt(zug.sx, zug.sy, V1) || !bodenPunkt(zug.x, zug.y, V2)) return null;
  let dx = V1.x - V2.x, dz = V1.z - V2.z; const l = Math.sqrt(dx * dx + dz * dz);
  if (l < 1e-6) return null;
  dx /= l; dz /= l;
  return { dx, dz, staerke };
}
function zielen(w) {
  if (!w || w.staerke < 0.04) { for (const p of zielPunkte) p.visible = false; pfeil.visible = false; return; }
  const len = 0.3 + w.staerke * 2.4;
  for (let i = 0; i < PUNKTE; i++) {
    const t = (i + 1) / (PUNKTE + 1), p = zielPunkte[i];
    p.visible = true; p.position.set(ball.x + w.dx * len * t, ball.y - L.R + 0.012, ball.z + w.dz * len * t);
    p.scale.setScalar(0.7 + t * 0.6);
  }
  punktMat.color.setHSL(0.33 - w.staerke * 0.33, 1, 0.55).convertSRGBToLinear();
  pfeil.visible = true; pfeil.position.set(ball.x + w.dx * (len + 0.05), ball.y - L.R + 0.02, ball.z + w.dz * (len + 0.05));
  pfeil.lookAt(pfeil.position.x + w.dx, pfeil.position.y, pfeil.position.z + w.dz); pfeil.rotateX(Math.PI / 2);
  $('staerkeBalken').style.width = Math.round(w.staerke * 100) + '%';
  $('staerkeText').textContent = Math.round(w.staerke * 100) + ' %';
}
canvas.addEventListener('pointerdown', (e) => {
  if (zustand === 'intro') { introBis = 0; return; }
  if (zustand !== 'zielen' || zug) return;
  e.preventDefault(); try { canvas.setPointerCapture(e.pointerId); } catch (x) {}
  zug = { id: e.pointerId, sx: e.clientX, sy: e.clientY, x: e.clientX, y: e.clientY };
  if (karte) setzeKarte(false);
});
canvas.addEventListener('pointermove', (e) => {
  if (!zug || e.pointerId !== zug.id) return;
  zug.x = e.clientX; zug.y = e.clientY;
  const w = zugWerte(); zielen(w);
  $('staerke').hidden = !w || w.staerke < 0.04;
  hinweis('');
});
function zugEnde(e, abbrechen) {
  if (!zug || e.pointerId !== zug.id) return;
  const w = abbrechen ? null : zugWerte();
  zug = null; zielen(null); $('staerke').hidden = true;
  if (!w || w.staerke < 0.04 || zustand !== 'zielen') return;
  schiesse({ dx: Math.round(w.dx * 10000), dz: Math.round(w.dz * 10000), p: Math.max(1, Math.round(w.staerke * 1000)), ph: Math.floor(muehleTakt) % L.MUEHLE.periode });
}
canvas.addEventListener('pointerup', (e) => zugEnde(e, false));
canvas.addEventListener('pointercancel', (e) => zugEnde(e, true));
function setzeKarte(an) { karte = an; $('bKarte').setAttribute('aria-pressed', String(an)); }
addEventListener('keydown', (e) => {
  if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') { if (['zielen', 'rollen', 'intro'].includes(zustand)) pausiere(); else if (zustand === 'pause') weiter(); }
  else if (e.key === ' ' && zustand === 'zielen') { e.preventDefault(); setzeKarte(!karte); }
});

function pausiere() { zustandVor = zustand; zustand = 'pause'; zeige('pause'); tonKnoepfe(); rollTon(0, false); }
function weiter() { if (zustand !== 'pause') return; zustand = zustandVor === 'intro' ? 'zielen' : zustandVor; zeige(null); }

// ---------- Kamera ----------
const kamera = { pos: new THREE.Vector3(0, 8, 8), ziel: new THREE.Vector3(), sofort: true, modus: 'folgen', winkel: 0 };
const NEIGUNG = 58 * Math.PI / 180;
function abstandFuer(breite, tiefe) {
  const vf = camera.fov * Math.PI / 180, tv = Math.tan(vf / 2), th = tv * camera.aspect;
  return Math.max(breite / (2 * th), tiefe * Math.sin(NEIGUNG) / (2 * tv));
}
function kameraTakt(dt) {
  if (!bahn) return;
  if (kamera.fest) { camera.position.set(...kamera.fest.slice(0, 3)); camera.lookAt(...kamera.fest.slice(3)); return; }
  const ziel = new THREE.Vector3(), cx = (bahn.w - 1) / 2, cz = (bahn.h - 1) / 2;
  let d, neig = NEIGUNG;
  if (zustand === 'menu' || zustand === 'bahnen' || zustand === 'rang' || (zustand === 'ende' && !bahn)) {
    kamera.winkel += dt * 0.12;
    d = abstandFuer(bahn.w + 1.5, bahn.h + 1.5) * 0.95;
    ziel.set(cx, 0, cz + 0.3);
    const p = new THREE.Vector3(cx + Math.sin(kamera.winkel) * d * Math.cos(NEIGUNG), d * Math.sin(NEIGUNG), cz + Math.cos(kamera.winkel) * d * Math.cos(NEIGUNG));
    kamera.pos.lerp(p, kamera.sofort ? 1 : 1 - Math.exp(-dt * 2)); kamera.ziel.lerp(ziel, kamera.sofort ? 1 : 1 - Math.exp(-dt * 2));
    kamera.sofort = false;
    camera.position.copy(kamera.pos); camera.lookAt(kamera.ziel); return;
  }
  const ganz = karte || zustand === 'intro';
  if (ganz) { ziel.set(cx, 0, cz); d = abstandFuer(bahn.w + 1, bahn.h + 1.2); }
  else {
    const bx = schuss && zustand === 'rollen' ? schuss.x : ball.x, bz = schuss && zustand === 'rollen' ? schuss.z : ball.z;
    // beim Zielen etwas Richtung Loch schauen
    let lx = bahn.loch.x - bx, lz = bahn.loch.z - bz; const l = Math.sqrt(lx * lx + lz * lz), m = zustand === 'zielen' ? Math.min(1.1, l * 0.35) : 0;
    if (l > 0) { lx = lx / l * m; lz = lz / l * m; }
    ziel.set(bx + lx, 0.1, bz + lz);
    d = abstandFuer(Math.min(5.4, Math.max(3.4, bahn.w + 0.5)), camera.aspect > 1 ? 7 : 4.6);   // schmale Bahnen nah, bis 5 Felder Breite ganz
    // Bahn nicht größer zeigen als nötig
    d = Math.min(d, abstandFuer(bahn.w + 1, bahn.h + 1.2));
  }
  const p = new THREE.Vector3(ziel.x, ziel.y + d * Math.sin(neig), ziel.z + d * Math.cos(neig));
  const k = kamera.sofort ? 1 : 1 - Math.exp(-dt * (zustand === 'rollen' ? 3.5 : 2.4));
  kamera.pos.lerp(p, k); kamera.ziel.lerp(ziel, k); kamera.sofort = false;
  camera.position.copy(kamera.pos); camera.lookAt(kamera.ziel);
}

// ---------- Darstellung der Kugel ----------
const ROLL_ACHSE = new THREE.Vector3(), ROLL_Q = new THREE.Quaternion();
let schwung = 0, letzteRichtung = { dx: 0, dz: -1 };
function setzeKugelPos(x, y, z) { kugel.position.set(x, y, z); }
function kugelTakt(dt, zeit) {
  if (!bahn) return;
  if (zustand === 'rollen' && schuss) {
    const vx = schuss.vx, vz = schuss.vz, v = Math.sqrt(vx * vx + vz * vz);
    if (v > 1e-4) { ROLL_ACHSE.set(vz, 0, -vx).normalize(); ROLL_Q.setFromAxisAngle(ROLL_ACHSE, v * dt / L.R); kugel.quaternion.premultiply(ROLL_Q); }
    setzeKugelPos(schuss.x, schuss.y, schuss.z);
    rollTon(Math.sqrt(vx * vx + schuss.vy * schuss.vy + vz * vz), schuss.amBoden);
  } else rollTon(0, false);
  if (zustand === 'loch' && ball.eingelocht) {   // Kugel sinkt ins Loch
    const t = Math.min(1, (performance.now() - lochZeit) / 260);
    kugel.position.set(kugel.position.x + (bahn.loch.x - kugel.position.x) * t, bahn.loch.y + L.R - t * 0.09, kugel.position.z + (bahn.loch.z - kugel.position.z) * t);
  }
  // Ring um die ruhende Kugel
  ring.visible = zustand === 'zielen' && !zug;
  if (ring.visible) { ring.position.set(ball.x, ball.y - L.R + 0.004, ball.z); const s = 1 + Math.sin(zeit * 4) * 0.12; ring.scale.set(s, s, s); }
  // Schläger hinter der Kugel (zeigt die Richtung)
  const w = zug ? zugWerte() : null;
  if (w && w.staerke >= 0.04) letzteRichtung = w;
  schlaeger.visible = (zustand === 'zielen' && w && w.staerke >= 0.04) || schwung > 0;
  if (schlaeger.visible) {
    const r = letzteRichtung, st = w ? w.staerke : 0;
    if (schwung > 0) schwung = Math.max(0, schwung - dt);
    const aus = schwung > 0 ? -0.05 + schwung * 0.6 : 0.06 + st * 0.22;
    schlaeger.position.set(ball.x - r.dx * aus, ball.y - L.R, ball.z - r.dz * aus);
    schlaeger.rotation.set(0, Math.atan2(r.dx, r.dz), 0);
  }
  // Fahne wird durchsichtig, wenn die Kugel nah ist
  if (fahne) {
    const dx = kugel.position.x - bahn.loch.x, dz = kugel.position.z - bahn.loch.z, nah = Math.sqrt(dx * dx + dz * dz) < 0.9;
    fahne.traverse((m) => { if (m.isMesh) m.material.opacity += ((nah ? 0.3 : 1) - m.material.opacity) * Math.min(1, dt * 6); });
  }
}

// ---------- Hauptschleife ----------
function groesse() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
}
addEventListener('resize', groesse); groesse();
let alt = performance.now();
const EV = [];
function bild(jetzt) {
  requestAnimationFrame(bild);
  const dt = Math.min(0.1, (jetzt - alt) / 1000); alt = jetzt;
  if (zustand !== 'pause' && zustand !== 'laden') {
    if (zustand === 'rollen' && schuss) {
      rest += dt * L.HZ;
      let n = 0;
      while (rest >= 1 && n < 60 && !schuss.ende) {
        EV.length = 0; L.takt(bahn, schuss, EV); rest--; n++;
        for (const e of EV) {
          if (e.typ === 'bande') ton('bande', Math.min(1, e.st / 2.2), 0.9 + Math.random() * 0.2);
          else if (e.typ === 'muehle') { ton('bande', Math.min(1, e.st / 2), 0.7); popup('Mühle!', 'orange'); }
          else if (e.typ === 'aufprall') ton('plopp', Math.min(1, e.st / 1.5));
        }
      }
      stelleMuehlen(schuss.ph + schuss.k);
      if (schuss.ende) nachSchlag();
    } else { muehleTakt += dt * L.HZ; stelleMuehlen(muehleTakt); }
    if (zustand === 'intro' && performance.now() > introBis) zustand = 'zielen';
  }
  kugelTakt(dt, jetzt / 1000);
  konfettiTakt(dt);
  kameraTakt(dt);
  renderer.render(scene, camera);
}

// ---------- Knöpfe ----------
$('mRunde').addEventListener('click', () => { ton('klick'); starteRunde(); });
$('mBahnen').addEventListener('click', () => { ton('klick'); zeigeBahnen(); });
$('bZu').addEventListener('click', () => { ton('klick'); zeigeMenu(); });
$('mHLos').addEventListener('click', () => { ton('klick'); const nr = Number(Q.get('b')) - 1; history.replaceState(null, '', location.pathname); starteUebung(nr); });
for (const id of ['mTon', 'pTon']) $(id).addEventListener('click', () => { stand.ton = !stand.ton; speichere(); tonKnoepfe(); audioStart(); ton('klick'); });
$('bPause').addEventListener('click', pausiere);
$('bKarte').addEventListener('click', () => { ton('klick'); setzeKarte(!karte); });
$('pWeiter').addEventListener('click', weiter);
$('pNeu').addEventListener('click', () => {
  ton('klick');
  if (modus === 'runde') { spieleBahn(bahnNr, bahnSpiegel); } else spieleBahn(bahnNr, false);
});
$('pMenu').addEventListener('click', () => { ton('klick'); zeigeMenu(); });
$('lWeiter').addEventListener('click', () => { ton('klick'); weiterNachLoch(); });
$('lNochmal').addEventListener('click', () => { ton('klick'); spieleBahn(bahnNr, false); });
$('lBahnen').addEventListener('click', () => { ton('klick'); zeigeBahnen(L.platzVon(bahnNr)); });
$('lTeilen').addEventListener('click', () => { ton('klick'); teileBahn(); });
$('eNochmal').addEventListener('click', () => { ton('klick'); starteRunde(); });
$('eMenu').addEventListener('click', () => { ton('klick'); zeigeMenu(); });
$('eTeilen').addEventListener('click', () => { ton('klick'); teileRunde(); });
for (const id of ['mRang', 'eRang']) $(id).addEventListener('click', () => { ton('klick'); rangliste('heute'); });
for (const b of document.querySelectorAll('#rTabs button')) b.addEventListener('click', () => rangliste(b.dataset.z));
$('rZu').addEventListener('click', rangZu);

// ---------- Start ----------
window.__putt = {
  zustand: () => zustand,
  ...(TEST ? {
    bahn: () => bahn, ball: () => ball, runde: () => runde, stand: () => stand, schuss: () => schuss,
    schiesse, starteUebung, starteRunde, zeigeMenu, weiterNachLoch,
    muehle(t) { muehleTakt = t; }, blick(...a) { kamera.fest = a.length ? a : null; },
    foto(an = true) { document.body.classList.toggle('foto', an); },
  } : {}),
};
ladeAlles().then(() => {
  setzeKugel(L.ballFrei(stand, stand.ball) ? stand.ball : 'rot');
  zeige(null);
  zeigeMenu();
  requestAnimationFrame(bild);
}).catch((e) => { console.error(e); $('ladeText').textContent = 'Die Bahnen konnten nicht geladen werden. Bitte neu laden.'; });
