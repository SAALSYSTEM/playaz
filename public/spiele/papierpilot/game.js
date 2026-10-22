// PAPIERPILOT: Darstellung (three.js, global THREE), Steuerung, Ton, Speicherstand.
// Spielregeln stehen ausschließlich in sim.js; hier wird nur gezeigt und eingegeben.
import { neuerFlug, vorbereiteteStrecke, kraftBei, kodiere, M, TAKT_HZ, LINKS, RECHTS, TIPP, AUF_R, RING_R, START_Y } from './sim.js';
import { TYPEN, TESTSTRECKE, baueStrecke } from './strecke.js';

const T = window.THREE;
const $ = (id) => document.getElementById(id);
const KEY = 'papierpilot.v1';
const TAKT = 1000 / TAKT_HZ;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;

// ---------- Speicherstand ----------
const store = { v: 1, best: 0, bestT: 0, bestIn: '', fluege: 0, sound: true };
try {
  const d = JSON.parse(localStorage.getItem(KEY) || 'null');
  if (d && typeof d === 'object') {
    store.best = clamp(Math.floor(Number(d.best) || 0), 0, 1e8);
    store.bestT = clamp(Math.floor(Number(d.bestT) || 0), 0, 1e6);
    store.bestIn = typeof d.bestIn === 'string' && d.bestIn.length < 60000 ? d.bestIn : '';
    store.fluege = clamp(Math.floor(Number(d.fluege) || 0), 0, 1e9);
    store.sound = d.sound !== false;
  }
} catch (e) {}
const speichern = () => { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) {} };
const meter = (cm) => Math.floor(cm / 100);

// ---------- Ton ----------
const ton = {
  ctx: null,
  start() { if (this.ctx || !(window.AudioContext || window.webkitAudioContext)) return; try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} },
  piep(f0, f1, dauer, typ, laut, verz = 0) {
    if (!store.sound || !this.ctx) return; try {
      const c = this.ctx, o = c.createOscillator(), g = c.createGain(), t = c.currentTime + verz;
      o.type = typ || 'sine'; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dauer);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(laut || 0.1, t + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t + dauer);
      o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + dauer + 0.03);
    } catch (e) {}
  },
  rauschen(dauer, laut, f0, f1) {
    if (!store.sound || !this.ctx) return; try {
      const c = this.ctx, n = Math.floor(c.sampleRate * dauer), b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
      const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(), t = c.currentTime;
      f.type = 'bandpass'; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dauer); f.Q.value = 0.8;
      g.gain.value = laut; s.buffer = b; s.connect(f); f.connect(g); g.connect(c.destination); s.start();
    } catch (e) {}
  },
  wurf() { this.rauschen(0.45, 0.35, 600, 2400); },
  ring(n) { const f = 660 * Math.pow(2, Math.min(n, 12) / 12); this.piep(f, f, 0.12, 'triangle', 0.09); this.piep(f * 1.5, f * 1.5, 0.18, 'triangle', 0.07, 0.07); },
  auf() { this.piep(330, 520, 0.5, 'sine', 0.05); },
  crash() { this.rauschen(0.3, 0.5, 900, 200); this.piep(160, 60, 0.25, 'triangle', 0.12); },
  landung() { this.rauschen(0.35, 0.25, 1200, 300); },
  rekord() { [0, 0.1, 0.2].forEach((d, i) => this.piep(520 * (1 + i * 0.26), 520 * (1 + i * 0.26), 0.16, 'square', 0.05, d)); }
};

// ---------- Strecke ----------
const NAMEN = TESTSTRECKE;
const STRECKE = vorbereiteteStrecke(NAMEN);      // ganzzahlig, für die Regeln
const WELT = baueStrecke(NAMEN);                  // in Metern, für die Darstellung

// ---------- three.js ----------
const cv = $('c');
const renderer = new T.WebGLRenderer({ canvas: cv, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
const scene = new T.Scene();
scene.background = new T.Color(0x5ea8ee);
const camera = new T.PerspectiveCamera(62, 1, 0.3, 420);
const SICHT = 185;                                 // so weit reicht der Boden, danach Panorama
let DUNST = new T.Color(0xb5c5a1);
scene.fog = new T.Fog(DUNST, 60, SICHT + 60);

const IMG = (n) => new URL('img/' + n + '.webp', import.meta.url).href;
let ASP = { 'baum-rund': 0.967, 'baum-zypresse': 0.208, haus: 1.032, turm: 0.247, 'flieger-gerade': 1.365, panorama: 1.5 };
const ladeTex = (n, fn) => new T.TextureLoader().load(IMG(n), (t) => { t.needsUpdate = true; fn && fn(t); }, undefined, () => {});
const canvasTex = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); return new T.CanvasTexture(c); };

// Boden: eine Kachel = 16 m, die Fläche wandert in Kachelschritten mit der Kamera
const KACHEL = 16;
const bodenTex = ladeTex('boden-park'); bodenTex.wrapS = bodenTex.wrapT = T.RepeatWrapping; bodenTex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
const BODEN_B = 256, BODEN_L = SICHT + 48;
bodenTex.repeat.set(BODEN_B / KACHEL, BODEN_L / KACHEL);
// Der Boden läuft in der Ferne weich aus und gibt den Blick auf die Parkkronen des Panoramas frei (keine harte Kante).
const bodenMat = new T.MeshBasicMaterial({ map: bodenTex, color: 0xe8f2dc, transparent: true });
bodenMat.onBeforeCompile = (sh) => {
  sh.vertexShader = 'varying float vPpD;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\nvPpD = -mvPosition.z;');
  sh.fragmentShader = 'varying float vPpD;\n' + sh.fragmentShader.replace('#include <fog_fragment>', '#include <fog_fragment>\ngl_FragColor.a *= clamp((' + (SICHT - 8).toFixed(1) + ' - vPpD) / 70.0, 0.0, 1.0);');
};
const boden = new T.Mesh(new T.PlaneGeometry(BODEN_B, BODEN_L), bodenMat);
boden.rotation.x = -Math.PI / 2; boden.renderOrder = -1; scene.add(boden);   // zuerst unter den durchsichtigen Teilen

// Panorama: weit hinten, folgt der Kamera, Horizontlinie auf Augenhöhe
const PANO_D = 320, PANO_B = 640;
const panoMat = new T.MeshBasicMaterial({ map: ladeTex('panorama'), fog: false, depthWrite: false });
const pano = new T.Mesh(new T.PlaneGeometry(PANO_B, PANO_B / 1.5), panoMat);
pano.renderOrder = -1; scene.add(pano);
let panoHorizont = 0.56;

// Schatten (weicher Fleck)
const schattenTex = canvasTex(64, 64, (x, w, h) => { const g = x.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w / 2); g.addColorStop(0, 'rgba(20,40,10,.55)'); g.addColorStop(1, 'rgba(20,40,10,0)'); x.fillStyle = g; x.fillRect(0, 0, w, h); });
const schattenGeo = new T.PlaneGeometry(1, 1);
const schattenMat = new T.MeshBasicMaterial({ map: schattenTex, transparent: true, depthWrite: false });
function schatten(x, z, b, l, op = 1) {
  const m = new T.Mesh(schattenGeo, op === 1 ? schattenMat : schattenMat.clone()); m.rotation.x = -Math.PI / 2; m.position.set(x, 0.03, -z); m.scale.set(b, l, 1);
  if (op !== 1) m.material.opacity = op; m.renderOrder = 1; scene.add(m); return m;
}

// Aufsteller (Hindernisse und Kulisse): senkrechte Bildfläche, Fußpunkt unten in der Mitte
const spriteMats = {};
const spriteGeo = new T.PlaneGeometry(1, 1); spriteGeo.translate(0, 0.5, 0);
// Ferne Aufsteller werden gerastert ausgeblendet statt im Nebel zu verschwinden (sonst bleiben nebelfarbene
// Umrisse vor dem ungenebelten Panorama stehen); ganz nahe an der Kamera ebenso, damit nichts den Blick verdeckt.
const AUSBLENDEN_AB = 118, AUSBLENDEN_BIS = 152;
function ausblenden(mat) {
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = 'varying float vPpD;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\nvPpD = -mvPosition.z;');
    sh.fragmentShader = 'varying float vPpD;\n' + sh.fragmentShader.replace('#include <alphatest_fragment>',
      'float ppF = clamp((' + AUSBLENDEN_BIS.toFixed(1) + ' - vPpD) / ' + (AUSBLENDEN_BIS - AUSBLENDEN_AB).toFixed(1) + ', 0.0, 1.0) * clamp((vPpD - 1.2) / 2.3, 0.0, 1.0);\n' +
      'float ppN = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));\nif (ppF < ppN) discard;\n#include <alphatest_fragment>');
  };
  return mat;
}
function spriteMat(n) {
  if (!spriteMats[n]) spriteMats[n] = ausblenden(new T.MeshBasicMaterial({ map: ladeTex(n), alphaTest: 0.5, side: T.DoubleSide }));
  return spriteMats[n];
}
const aufsteller = [];
function stelle(typ, x, z, faktor = 1) {
  const D = TYPEN[typ], h = D.bildH * faktor, w = h * (ASP[D.bild] || 1);
  const m = new T.Mesh(spriteGeo, spriteMat(D.bild)); m.position.set(x, 0, -z); m.scale.set(w, h, 1); scene.add(m);
  schatten(x + h * 0.08, z - 0.4, w * 1.05, Math.max(2, w * 0.55));
  aufsteller.push({ m, typ, faktor });
  return m;
}

// Aufwinde: leuchtende, elliptische Säule mit aufsteigenden Bändern (Shader, kein Bild nötig)
const aufMat = new T.ShaderMaterial({
  transparent: true, depthWrite: false, side: T.DoubleSide, blending: T.AdditiveBlending,
  uniforms: { t: { value: 0 }, c: { value: new T.Color(0x3fe3dc) } },
  vertexShader: 'varying vec2 vUv;varying float vD;varying float vR;void main(){vUv=uv;vec4 mv=modelViewMatrix*vec4(position,1.0);vD=-mv.z;vec3 n=normalize(normalMatrix*normal);vR=1.0-abs(dot(n,normalize(-mv.xyz)));gl_Position=projectionMatrix*mv;}',
  fragmentShader: 'uniform float t;uniform vec3 c;varying vec2 vUv;varying float vD;varying float vR;void main(){float y=vUv.y*36.0;float band=smoothstep(0.78,1.0,fract(y*0.22-t*0.9));float hoch=pow(1.0-vUv.y,1.4);float a=(0.08+0.5*vR*vR+band*0.22)*hoch;a*=clamp(1.0-(vD-70.0)/100.0,0.0,1.0);a*=clamp((vD-2.5)/6.0,0.0,1.0);gl_FragColor=vec4(c*a,a);}'
});
const AUF_H = 36;
for (const a of WELT.a) {
  const g = new T.CylinderGeometry(1, 1, AUF_H, 28, 1, true); g.translate(0, AUF_H / 2, 0);
  const m = new T.Mesh(g, aufMat); m.renderOrder = 2; m.position.set(a.x, 0, -(a.z + a.l / 2)); m.scale.set(AUF_R / M, 1, a.l / 2); scene.add(m);
  const fleck = schatten(a.x, a.z + a.l / 2, AUF_R / M * 2.4, a.l * 1.1, 1); fleck.material = new T.MeshBasicMaterial({ map: schattenTex, color: 0x3fe3dc, transparent: true, opacity: 0.55, depthWrite: false, blending: T.AdditiveBlending });
}

// Ringe: goldener Torus mit Schein
const ringe = WELT.r.map((r) => {
  const grp = new T.Group(); grp.position.set(r.x, r.y, -r.z);
  const rr = RING_R / M;
  grp.add(new T.Mesh(new T.TorusGeometry(rr, 0.13, 10, 48), new T.MeshBasicMaterial({ color: 0xffcf3a })));
  const schein = new T.Mesh(new T.TorusGeometry(rr, 0.42, 8, 48), new T.MeshBasicMaterial({ color: 0xffb800, transparent: true, opacity: 0.28, blending: T.AdditiveBlending, depthWrite: false }));
  schein.renderOrder = 2; grp.add(schein); scene.add(grp);
  return { grp, schein, weg: -1 };
});

// Kulisse (nur Optik, außerhalb des Korridors) – fester Zufall, damit die Strecke immer gleich aussieht
function kulisse() {
  let r = 0x2f6b9a1; const zz = () => { r = (Math.imul(r, 1664525) + 1013904223) >>> 0; return r / 4294967296; };
  const ende = WELT.laenge + SICHT + 40;
  for (const seite of [-1, 1]) {
    for (let z = -20; z < ende; z += 5 + zz() * 6) {
      const x = seite * (15.5 + zz() * 4), w = zz();
      stelle(w < 0.62 ? 'baum' : w < 0.92 ? 'zypresse' : 'haus', x, z, 0.85 + zz() * 0.35);
      if (zz() < 0.55) stelle(zz() < 0.7 ? 'baum' : 'zypresse', seite * (22 + zz() * 30), z + zz() * 5, 0.9 + zz() * 0.5);
    }
  }
  // Dächer am Abwurfpunkt
  stelle('haus', -4.2, 2, 1); stelle('haus', 4.6, 4, 1.05); stelle('haus', -9.5, -6, 1); stelle('haus', 9.5, -2, 1);
}
for (const o of WELT.o) stelle(o.t, o.x, o.z);
kulisse();

// Flieger: Bildfläche, die zur Kamera zeigt
const fliegerTex = { g: ladeTex('flieger-gerade'), k: ladeTex('flieger-kurve') };
const fliegerMat = new T.MeshBasicMaterial({ map: fliegerTex.g, alphaTest: 0.4, transparent: false });
const FLIEGER_B = 1.35;
const flieger = new T.Mesh(new T.PlaneGeometry(1, 1), fliegerMat); flieger.renderOrder = 5; scene.add(flieger);
const fliegerSchatten = schatten(0, 0, 1.4, 1.1, 0.8);

// Flugspuren: zwei Bänder hinter den Flügelspitzen
const SPUR_N = 34;
const spurMat = new T.ShaderMaterial({
  transparent: true, depthWrite: false, side: T.DoubleSide,
  vertexShader: 'attribute float a;varying float va;void main(){va=a;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
  fragmentShader: 'varying float va;void main(){gl_FragColor=vec4(1.0,1.0,1.0,va);}'
});
function neueSpur() {
  const g = new T.BufferGeometry(), pos = new Float32Array(SPUR_N * 2 * 3), al = new Float32Array(SPUR_N * 2), idx = [];
  for (let i = 0; i < SPUR_N - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  g.setIndex(idx); g.setAttribute('position', new T.BufferAttribute(pos, 3)); g.setAttribute('a', new T.BufferAttribute(al, 1));
  const m = new T.Mesh(g, spurMat); m.frustumCulled = false; m.renderOrder = 3; scene.add(m); return { m, pts: [] };
}
const spuren = [neueSpur(), neueSpur()];
function spurZeichnen(sp, kopf) {
  const p = sp.m.geometry.attributes.position.array, a = sp.m.geometry.attributes.a.array, pts = [kopf, ...sp.pts];
  for (let i = 0; i < SPUR_N; i++) {
    const q = pts[Math.min(i, pts.length - 1)], f = 1 - i / (SPUR_N - 1), w = 0.02 + 0.2 * (1 - f);
    p.set([q.x - w, q.y, q.z, q.x + w, q.y, q.z], i * 6);
    const al = i < pts.length ? 0.62 * f : 0; a[i * 2] = a[i * 2 + 1] = al;
  }
  sp.m.geometry.attributes.position.needsUpdate = true; sp.m.geometry.attributes.a.needsUpdate = true;
}

// Bildmaße und Dunstfarbe aus manifest.json (Fallback: Werte oben)
fetch(new URL('img/manifest.json', import.meta.url).href).then((r) => r.json()).then((mf) => {
  for (const k of Object.keys(mf)) if (mf[k].w && mf[k].h) ASP[k] = mf[k].w / mf[k].h;
  for (const s of aufsteller) { const D = TYPEN[s.typ]; s.m.scale.x = D.bildH * s.faktor * ASP[D.bild]; }
  if (mf.panorama) { panoHorizont = mf.panorama.horizont || panoHorizont; pano.scale.y = 1.5 / ASP.panorama; if (mf.panorama.dunst) { DUNST = new T.Color(mf.panorama.dunst); scene.fog.color.copy(DUNST); } }
}).catch(() => {});

// ---------- Größe ----------
let W = 1, H = 1;
function groesse() {
  W = window.innerWidth; H = window.innerHeight;
  renderer.setSize(W, H, false); camera.aspect = W / H;
  camera.fov = W > H ? 54 : 62;                       // Querformat: etwas enger, damit der Flieger groß bleibt
  camera.updateProjectionMatrix();
}
addEventListener('resize', groesse); groesse();

// ---------- Spielzustand ----------
let zustand = 'titel';          // titel | wurf | flug | aus | ende
let flug = null, eingaben = [], vorher = null, jetzt = null, akku = 0, endeZeit = 0;
let tippOffen = false, warImAuf = false;
const halten = new Map();       // Pointer-ID -> Seite (-1 / 1)
const tasten = { l: false, r: false };
const kam = { x: 0, y: START_Y / M + 3, ruck: 0 };

function zustandKopie(s) { return { x: s.x / M, y: s.y / M, z: s.z / M, neig: s.neig / 1000 }; }

function zeige(id) { for (const s of ['sTitel', 'sEnde']) $(s).hidden = s !== id; $('hud').hidden = !(zustand === 'wurf' || zustand === 'flug' || zustand === 'aus'); }

function titel() {
  zustand = 'titel'; flug = neuerFlug(STRECKE); jetzt = vorher = zustandKopie(flug.s);
  $('tBest').textContent = store.best ? 'Dein Bestflug: ' + meter(store.best) + ' m' : '';
  zeige('sTitel');
}

function start() {
  ton.start();
  flug = neuerFlug(STRECKE); eingaben = []; akku = 0; tippOffen = false; warImAuf = false;
  jetzt = vorher = zustandKopie(flug.s); spuren.forEach((s) => (s.pts = []));
  for (const r of ringe) { r.weg = -1; r.grp.visible = true; r.grp.scale.setScalar(1); r.schein.material.opacity = 0.28; }
  zustand = 'wurf'; zeige(null); $('wurf').hidden = false;
  $('hBest').textContent = 'Beste: ' + meter(store.best) + ' m';
  halten.clear();
}

function eingabe() {
  if (zustand === 'wurf') { const e = tippOffen ? TIPP : 0; tippOffen = false; return e; }
  let l = tasten.l, r = tasten.r;
  for (const s of halten.values()) { if (s < 0) l = true; else r = true; }
  return (l && !r ? LINKS : 0) | (r && !l ? RECHTS : 0);
}

function takt() {
  const s = flug.s, phase = s.phase, e = eingabe();
  eingaben.push(e); flug.schritt(e);
  vorher = jetzt; jetzt = zustandKopie(s);
  if (phase === 'wurf' && s.phase === 'flug') { zustand = 'flug'; $('wurf').hidden = true; ton.wurf(); }
  if (s.ringNeu >= 0) { ringe[s.ringNeu].weg = performance.now(); ton.ring(s.ringe); }
  const imAuf = s.lift > 60; if (imAuf && !warImAuf) ton.auf(); warImAuf = imAuf;
  if (s.phase === 'flug' || s.phase === 'ende') {
    // Spurpunkte je Takt
    const sp = spitzen(jetzt);
    spuren[0].pts.unshift(sp[0]); spuren[1].pts.unshift(sp[1]);
    for (const q of spuren) if (q.pts.length > SPUR_N) q.pts.length = SPUR_N;
  }
  if (s.phase === 'ende') ende();
}

function spitzen(p) {
  const w = FLIEGER_B * 0.42, a = -p.neig * 0.45, c = Math.cos(a), sn = Math.sin(a);
  return [{ x: p.x - w * c, y: p.y - 0.12 - w * sn, z: -p.z + 0.25 }, { x: p.x + w * c, y: p.y - 0.12 + w * sn, z: -p.z + 0.25 }];
}

function ende() {
  const s = flug.s, cm = flug.distanzCm();
  zustand = 'aus'; endeZeit = performance.now();
  if (s.grund === 'hindernis') { ton.crash(); kam.ruck = 1; } else ton.landung();
  const rekord = cm > store.best || (cm === store.best && s.ft < store.bestT);
  store.fluege++;
  if (rekord) { store.best = cm; store.bestT = s.ft; store.bestIn = kodiere(eingaben); }
  speichern();
  const namen = { baum: 'Baum', zypresse: 'Zypresse', haus: 'Haus', turm: 'Turm' };
  $('eKopf').textContent = rekord && cm > 0 ? 'Neuer Bestflug!' : s.grund === 'hindernis' ? 'Gegen ' + (s.treffer >= 0 ? (s.treffer >= 0 && namen[STRECKE.o[s.treffer].t]) : 'Hindernis') + '!' : 'Gelandet';
  $('eKopf').className = rekord && cm > 0 ? 'rek' : '';
  $('eDist').innerHTML = meter(cm) + '<small> m</small>';
  $('eZeit').textContent = (s.ft / TAKT_HZ).toFixed(1).replace('.', ',') + ' s';
  $('eRinge').textContent = String(s.ringe);
  $('eBest').textContent = meter(store.best) + ' m';
  setTimeout(() => { if (zustand === 'aus') { zustand = 'ende'; zeige('sEnde'); if (rekord && cm > 0) ton.rekord(); $('bNochmal').focus({ preventScroll: true }); } }, s.grund === 'hindernis' ? 650 : 900);
}

// ---------- Eingabe ----------
const game = $('game');
game.addEventListener('pointerdown', (ev) => {
  if (ev.target.closest('button,.schirm,a')) return;
  ton.start();
  if (zustand === 'wurf') { tippOffen = true; ev.preventDefault(); return; }
  if (zustand === 'flug') { halten.set(ev.pointerId, ev.clientX < W / 2 ? -1 : 1); ev.preventDefault(); }
});
const loslassen = (ev) => halten.delete(ev.pointerId);
addEventListener('pointerup', loslassen); addEventListener('pointercancel', loslassen);
addEventListener('pointermove', (ev) => { if (halten.has(ev.pointerId)) halten.set(ev.pointerId, ev.clientX < W / 2 ? -1 : 1); });
addEventListener('blur', () => { halten.clear(); tasten.l = tasten.r = false; });
addEventListener('keydown', (ev) => {
  const k = ev.key;
  if (k === 'ArrowLeft' || k === 'a' || k === 'A') { tasten.l = true; ev.preventDefault(); }
  else if (k === 'ArrowRight' || k === 'd' || k === 'D') { tasten.r = true; ev.preventDefault(); }
  else if (k === ' ' || k === 'Enter' || k === 'ArrowUp') {
    if (ev.repeat) return;
    if (zustand === 'wurf') { ton.start(); tippOffen = true; ev.preventDefault(); }
    else if (zustand === 'ende' || zustand === 'titel') { if (document.activeElement && document.activeElement.tagName === 'BUTTON' && k !== ' ') return; start(); ev.preventDefault(); }
  }
});
addEventListener('keyup', (ev) => { const k = ev.key; if (k === 'ArrowLeft' || k === 'a' || k === 'A') tasten.l = false; if (k === 'ArrowRight' || k === 'd' || k === 'D') tasten.r = false; });
$('bStart').addEventListener('click', start);
$('bNochmal').addEventListener('click', start);
$('bMenue').addEventListener('click', titel);
function tonText() { $('bTon').textContent = store.sound ? 'Ton an' : 'Ton aus'; $('bTon').setAttribute('aria-pressed', String(store.sound)); }
$('bTon').addEventListener('click', () => { store.sound = !store.sound; speichern(); tonText(); ton.start(); });
tonText();

// ---------- Zeichnen ----------
let letzte = performance.now(), zeit = 0;
function bild(now) {
  requestAnimationFrame(bild);
  let dt = now - letzte; letzte = now; if (dt > 250) dt = 250; zeit += dt / 1000;
  if (zustand === 'wurf' || zustand === 'flug') { akku += dt; while (akku >= TAKT && (zustand === 'wurf' || zustand === 'flug')) { takt(); akku -= TAKT; } }
  const f = zustand === 'flug' ? clamp(akku / TAKT, 0, 1) : 1;
  const p = { x: lerp(vorher.x, jetzt.x, f), y: lerp(vorher.y, jetzt.y, f), z: lerp(vorher.z, jetzt.z, f), neig: lerp(vorher.neig, jetzt.neig, f) };
  const s = flug.s;

  // Kamera: hinter und über dem Flieger, schaut schräg nach unten
  const k = 1 - Math.pow(0.0025, dt / 1000);
  kam.x = lerp(kam.x, p.x * 0.94, k); kam.y = lerp(kam.y, Math.max(2.6, p.y + 3.1), k);
  const ruck = kam.ruck > 0 ? (kam.ruck -= dt / 450, Math.max(0, kam.ruck)) : 0;
  const rx = ruck ? (Math.random() - 0.5) * 0.35 * ruck : 0, ry = ruck ? (Math.random() - 0.5) * 0.35 * ruck : 0;
  camera.position.set(kam.x + rx, kam.y + ry, -(p.z - 6.6));
  camera.lookAt(p.x * 0.96, p.y - 1.4, -(p.z + 13));
  camera.rotation.z += -p.neig * 0.035;

  // Boden in Kachelschritten nachziehen, Panorama mitführen
  boden.position.set(Math.round(camera.position.x / KACHEL) * KACHEL, 0, -(Math.floor((p.z - 30) / KACHEL) * KACHEL + BODEN_L / 2));
  const ph = PANO_B / 1.5 * pano.scale.y;
  pano.position.set(camera.position.x * 0.97, camera.position.y + ph * (panoHorizont - 0.5), camera.position.z - PANO_D);

  // Flieger: zur Kamera gedreht, Kurvenbild je nach Schräglage (Rechtskurve = gespiegelt)
  const kurve = Math.abs(p.neig) > 0.38;
  const tex = kurve ? fliegerTex.k : fliegerTex.g;
  if (fliegerMat.map !== tex) { fliegerMat.map = tex; fliegerMat.needsUpdate = true; }
  flieger.position.set(p.x, p.y, -p.z);
  flieger.quaternion.copy(camera.quaternion);
  const spiegel = kurve && p.neig > 0 ? -1 : 1;
  const wackeln = zustand === 'wurf' ? Math.sin(zeit * 3) * 0.04 : 0;
  flieger.rotateZ((kurve ? -p.neig * 0.18 + Math.sign(p.neig) * 0.06 : -p.neig * 0.35) + wackeln);
  flieger.scale.set(FLIEGER_B * spiegel, FLIEGER_B / (ASP['flieger-gerade'] || 1.365), 1);
  fliegerSchatten.position.set(p.x + p.y * 0.08, 0.04, -p.z + 0.2);
  const sh = 1 + p.y * 0.05; fliegerSchatten.scale.set(1.3 * sh, 1.0 * sh, 1); fliegerSchatten.material.opacity = clamp(0.95 - p.y * 0.025, 0.2, 0.9);

  // Spuren
  const sp = spitzen(p);
  spuren.forEach((q, i) => { q.m.visible = zustand !== 'wurf' && zustand !== 'titel'; if (q.m.visible) spurZeichnen(q, sp[i]); });

  // Aufwind-Animation und Ringe
  aufMat.uniforms.t.value = zeit;
  for (const r of ringe) {
    if (r.weg < 0) { r.schein.material.opacity = 0.22 + Math.sin(zeit * 4) * 0.08; continue; }
    const a = (now - r.weg) / 380; if (a >= 1) { r.grp.visible = false; continue; }
    r.grp.scale.setScalar(1 + a * 0.9); r.schein.material.opacity = 0.6 * (1 - a);
  }

  hud(p, s);
  renderer.render(scene, camera);
}

let hudAlt = '';
function hud(p, s) {
  if ($('hud').hidden) return;
  const m = Math.floor(Math.max(0, p.z));
  const txt = m + '|' + Math.round(p.y * 4);
  if (zustand === 'wurf') { const kr = kraftBei(s.t + 1) / 1000; $('wZeiger').style.left = (kr * 100).toFixed(1) + '%'; }
  $('pL').classList.toggle('an', eingabe_links()); $('pR').classList.toggle('an', eingabe_rechts());
  if (txt === hudAlt) return; hudAlt = txt;
  $('hDist').innerHTML = m + '<small>m</small>';
  const hoehe = clamp(p.y / 30, 0, 1), hb = $('hHb'); hb.style.width = (hoehe * 100).toFixed(1) + '%'; hb.classList.toggle('tief', p.y < 4);
  const bm = meter(store.best);
  $('hZiel').textContent = bm > 0 && m < bm ? 'Noch ' + (bm - m) + ' m bis zum Bestflug' : bm > 0 && zustand === 'flug' ? 'Neuer Bestflug!' : '';
}
const eingabe_links = () => zustand === 'flug' && (tasten.l || [...halten.values()].some((v) => v < 0));
const eingabe_rechts = () => zustand === 'flug' && (tasten.r || [...halten.values()].some((v) => v > 0));

// ---------- Start ----------
titel();
$('laden').hidden = true;
requestAnimationFrame((t) => { letzte = t; bild(t); });
