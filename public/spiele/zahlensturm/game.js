// ZAHLENSTURM: Spiel im Browser – Steuerung, Menüs, Ton, Speicherstand, Awards, Teilen.
// Regeln stehen in sim.js (fester 60-Hz-Takt), die Level in levels.js, die 3D-Darstellung in render.js.
import { createSim, step, result, DT, SPEED, applyOp, opText, prepare, crowdHalfWidth } from './sim.js';
import { LEVELS, LEVEL_BY_ID, THEMES } from './levels.js';
import { AWARDS, AWARD_BY_ID, RARITY, evaluateAwards, progressOf, drawAwardIcon, drawShareImage } from './awards.js';
import { createRenderer } from './render.js';

const $ = (s) => document.querySelector(s);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const PARAMS = new URLSearchParams(location.search);
const TEST = PARAMS.has('test');
const N = LEVELS.length;
const SAVE_KEY = 'zahlensturm.v1';
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ====================================================================== Figurenfarben (nur Optik, Münzen als Preis)
const SKINS = [
  { id: 'blau', name: 'Himmelblau', color: 0x3b82f6, preis: 0 },
  { id: 'orange', name: 'Mandarine', color: 0xf97316, preis: 120 },
  { id: 'gruen', name: 'Minze', color: 0x22c55e, preis: 200 },
  { id: 'pink', name: 'Zuckerwatte', color: 0xec4899, preis: 320 },
  { id: 'lila', name: 'Traube', color: 0x8b5cf6, preis: 480 },
  { id: 'gold', name: 'Goldjunge', color: 0xf5b81f, preis: 900 }
];
const SKIN_BY_ID = Object.fromEntries(SKINS.map((s) => [s.id, s]));
const css = (c) => '#' + c.toString(16).padStart(6, '0');

// ====================================================================== Speicherstand
function leerStand() {
  return { v: 1, levels: {}, awards: {}, coins: 0, skins: { owned: ['blau'], sel: 'blau' },
    stats: { maxN: 0, coinsTotal: 0, shared: 0, challengesWon: 0, runs: 0 }, settings: { sound: true, name: '' }, last: 1 };
}
function ladeStand() {
  const s = leerStand();
  try {
    const roh = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (roh && typeof roh === 'object' && roh.v === 1) {
      if (roh.levels && typeof roh.levels === 'object') for (const k of Object.keys(roh.levels)) {
        const id = +k, l = roh.levels[k];
        if (!LEVEL_BY_ID[id] || !l || typeof l !== 'object') continue;
        const z = (v, max = 1e7) => (Number.isFinite(v) && v >= 0 ? Math.min(Math.round(v), max) : 0);
        s.levels[id] = { done: !!l.done, stars: clamp(z(l.stars), 0, 3), bestN: z(l.bestN, 9999), bestPunkte: z(l.bestPunkte), bestReward: z(l.bestReward),
          bestCoins: z(l.bestCoins), alle: !!l.alle, fails: z(l.fails), tries: z(l.tries), wins: z(l.wins) };
      }
      if (roh.awards && typeof roh.awards === 'object') for (const k of Object.keys(roh.awards)) if (AWARD_BY_ID[k] && roh.awards[k] && typeof roh.awards[k].at === 'string') s.awards[k] = { at: roh.awards[k].at, level: roh.awards[k].level | 0 || null, n: roh.awards[k].n | 0 || null };
      if (Number.isFinite(roh.coins) && roh.coins >= 0) s.coins = Math.min(Math.round(roh.coins), 1e8);
      if (roh.skins && Array.isArray(roh.skins.owned)) {
        const own = roh.skins.owned.filter((id) => SKIN_BY_ID[id]);
        if (!own.includes('blau')) own.unshift('blau');
        s.skins.owned = [...new Set(own)];
        s.skins.sel = SKIN_BY_ID[roh.skins.sel] && own.includes(roh.skins.sel) ? roh.skins.sel : 'blau';
      }
      const st = roh.stats || {};
      for (const k of Object.keys(s.stats)) if (Number.isFinite(st[k]) && st[k] >= 0) s.stats[k] = Math.round(st[k]);
      const se = roh.settings || {};
      if (typeof se.sound === 'boolean') s.settings.sound = se.sound;
      if (typeof se.name === 'string') s.settings.name = saubererName(se.name);
      if (LEVEL_BY_ID[roh.last]) s.last = roh.last;
    }
  } catch (e) { /* kaputt oder gesperrt: frisch starten */ }
  return s;
}
let speicherFehler = false;
function speichern() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(stand)); speicherFehler = false; }
  catch (e) { if (!speicherFehler) toast('Speichern nicht möglich (privater Modus?)'); speicherFehler = true; }
}
function saubererName(n) {
  n = String(n || '').replace(/[^A-Za-z0-9ÄÖÜäöüß_. -]/g, '').replace(/\s+/g, ' ').trim().slice(0, 16);
  return n.length >= 3 ? n : '';
}
let stand = ladeStand();
const levelDaten = (id) => (stand.levels[id] = stand.levels[id] || { done: false, stars: 0, bestN: 0, bestPunkte: 0, bestReward: 0, bestCoins: 0, alle: false, fails: 0, tries: 0, wins: 0 });
const geschafft = (id) => !!(stand.levels[id] && stand.levels[id].done);
const freigeschaltet = (id) => id === 1 || geschafft(id) || geschafft(id - 1);
const naechstesOffenes = () => { for (const l of LEVELS) if (!geschafft(l.id)) return freigeschaltet(l.id) ? l.id : 1; return 1; };
const sterneGesamt = () => LEVELS.reduce((a, l) => a + ((stand.levels[l.id] && stand.levels[l.id].stars) || 0), 0);

// ====================================================================== Ton (WebAudio, alles synthetisch)
const ton = {
  ctx: null, master: null, noise: null, letzter: {},
  init() {
    if (this.ctx || !window.AudioContext && !window.webkitAudioContext) return;
    try {
      const C = window.AudioContext || window.webkitAudioContext;
      const ctx = this.ctx = new C();
      this.master = ctx.createGain(); this.master.gain.value = stand.settings.sound ? 0.7 : 0; this.master.connect(ctx.destination);
      const len = ctx.sampleRate * 1.2, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.noise = buf;
    } catch (e) { this.ctx = null; }
  },
  resume() { this.init(); if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {}); },
  setOn(on) { if (this.master) this.master.gain.setTargetAtTime(on ? 0.7 : 0, this.ctx.currentTime, 0.05); },
  drossel(name, ms) { const t = performance.now(); if (t - (this.letzter[name] || 0) < ms) return false; this.letzter[name] = t; return true; },
  rauschen(dauer, typ, f0, f1, vol, q) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = this.noise; f.type = typ; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dauer); f.Q.value = q || 1;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dauer);
    s.connect(f); f.connect(g); g.connect(this.master); s.start(t); s.stop(t + dauer + 0.05);
  },
  klang(freq, dauer, typ, vol, wann, bis) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime + (wann || 0), o = ctx.createOscillator(), g = ctx.createGain();
    o.type = typ || 'triangle'; o.frequency.setValueAtTime(freq, t); if (bis) o.frequency.exponentialRampToValueAtTime(bis, t + dauer);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dauer);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dauer + 0.05);
  },
  klick() { this.klang(880, 0.05, 'square', 0.05); },
  tor(gut) { if (gut) { this.klang(520, 0.12, 'triangle', 0.16); this.klang(780, 0.18, 'triangle', 0.16, 0.07); } else { this.klang(330, 0.3, 'sawtooth', 0.1, 0, 140); } },
  muenze() { if (this.drossel('m', 45)) { this.klang(1320, 0.09, 'square', 0.04); this.klang(1760, 0.12, 'triangle', 0.05, 0.05); } },
  treffer() { this.rauschen(0.35, 'lowpass', 1800, 150, 0.4); this.klang(110, 0.25, 'sine', 0.4, 0, 45); },
  kampf() { if (this.drossel('k', 170)) { this.rauschen(0.14, 'bandpass', 900, 300, 0.12, 2); this.klang(90, 0.12, 'sine', 0.12, 0, 60); } },
  sieg() { [392, 523, 659].forEach((f, i) => this.klang(f, 0.2, 'square', 0.08, i * 0.08)); this.rauschen(0.4, 'highpass', 2500, 7000, 0.1); },
  ziel() { [523, 659, 784, 1046].forEach((f, i) => this.klang(f, 0.22, 'square', 0.08, i * 0.09)); this.klang(1046, 0.6, 'triangle', 0.12, 0.36); },
  verloren() { [392, 330, 262, 196].forEach((f, i) => this.klang(f, 0.28, 'triangle', 0.14, i * 0.12)); },
  award() { [784, 988, 1175, 1568, 1976].forEach((f, i) => this.klang(f, 0.3, 'triangle', 0.13, i * 0.07)); },
  kauf() { this.klang(660, 0.1, 'square', 0.07); this.klang(990, 0.18, 'square', 0.07, 0.08); }
};

// ====================================================================== 3D
const canvas = $('#c');
let R = null;
try { R = createRenderer(canvas, { aa: !(navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4 && matchMedia('(pointer: coarse)').matches) }); }
catch (e) { R = null; }
function groesse() { const g = $('#game'); if (R) R.resize(g.clientWidth, g.clientHeight); }
new ResizeObserver(groesse).observe($('#game'));
addEventListener('resize', groesse);

// ====================================================================== Spielzustand
let zustand = 'start';          // start | menu | bereit | play | ende | pause
let sim = null, level = null, demo = null;
let tx = 0, px = 0, pz = 0, akku = 0, letzteZeit = 0, endeZeit = 0, versuchGezaehlt = false;
let herausforderung = null;     // { level, n, von } bzw. { award, von }
let ergebnis = null;
let zeitGesamt = 0;
const tasten = { l: false, r: false };
let drag = null;

function starteLevel(id, opts = {}) {
  if (!R) return;
  level = LEVEL_BY_ID[id]; if (!level) return;
  demo = null;
  zeigeNur(null);
  if (!R.lvl || R.lvl !== level) { R.setLevel(level); R.lvl = level; } else R.reset();
  R.setFarbe(SKIN_BY_ID[stand.skins.sel].color);
  sim = createSim(level); tx = 0; px = 0; pz = 0; akku = 0; endeZeit = 0; versuchGezaehlt = false;
  zustand = 'bereit';
  stand.last = id; speichern();
  $('#hud').hidden = false; $('#hud2').hidden = false; $('#kampf').hidden = true; $('#zielText').hidden = true; $('#banner').hidden = true;
  $('#toasts').textContent = ''; $('#pops').textContent = '';
  $('#hLevel').textContent = id; $('#hName').textContent = level.name;
  $('#hilfe').hidden = false; $('#zahl').hidden = false;
  const tp = $('#tipp'); tp.hidden = !level.hint; tp.textContent = level.hint || '';
  if (level.hint) setTimeout(() => { if (tp.textContent === level.hint) tp.hidden = true; }, 6500);
  hudBumpen(true);
  if (herausforderung && herausforderung.level === id && herausforderung.n) banner((herausforderung.von || 'Jemand') + ' hat Level ' + id + ' mit ' + herausforderung.n + ' Figuren geschafft. Schlag das!');
}
function banner(t) { const b = $('#banner'); $('#bannerText').textContent = t; b.hidden = false; setTimeout(() => { b.hidden = true; }, 6000); }

function beginneLauf() {
  if (zustand !== 'bereit') return;
  zustand = 'play'; $('#hilfe').hidden = true; $('#tipp').hidden = true; letzteZeit = 0;
  if (!versuchGezaehlt) { versuchGezaehlt = true; levelDaten(level.id).tries++; }
}
function neustart() { if (!level) return; if (zustand === 'play' && sim.s.phase !== 'won' && sim.s.phase !== 'lost' && sim.s.t > 30) { /* Abbruch zählt nicht als Niederlage */ } starteLevel(level.id); }

// ---- ein Simulationsschritt
function tick() {
  px = sim.s.x; pz = sim.s.z;
  if (zustand === 'play' || zustand === 'ende' && sim.s.phase !== 'won' && sim.s.phase !== 'lost') {
    if (zustand === 'play') {
      const dir = (tasten.r ? 1 : 0) - (tasten.l ? 1 : 0);
      if (dir) tx = clamp(tx + dir * 13 * DT, -level.hw, level.hw);
    }
    step(sim, tx);
    ereignisse(sim.s.log, false);
    sim.s.log.length = 0;
    const f = sim.s.fight;
    if (f) { R.fx.kampf(f); ton.kampf(); }
  }
}

const GRUND = { tor: 'Ein Tor hat alle Figuren gekostet', wall: 'Gegen eine Wand gelaufen', spikes: 'In die Stacheln gelaufen', pit: 'In die Grube gefallen', mover: 'Von der Wand erwischt',
  rotor: 'Von der Säge erwischt', plat: 'Von der Plattform gefallen', gegner: 'Der Gegnertrupp war stärker', boss: 'Der Boss war zu stark' };
const TIPP = { tor: 'Rechne vor jedem Tor: Welches Ergebnis ist am größten?', wall: 'Weich der Wand aus, ein Treffer kostet den überdeckten Teil der Gruppe.', spikes: 'Stacheln kosten feste Figuren. Lauf drumherum.',
  pit: 'Gruben kosten alle Figuren darüber. Bleib auf der Strecke.', mover: 'Beobachte die Wand und lauf durch die Lücke.', rotor: 'Warte auf die Lücke zwischen den Sägeblättern.',
  plat: 'Bleib auf der Plattform, sie wandert hin und her.', gegner: 'Sammle vorher mehr Figuren oder weich dem Trupp aus.', boss: 'Je größer deine Gruppe, desto weniger verlierst du im Kampf. Hol dir vorher die besten Tore.' };

function ereignisse(log, still) {
  for (const e of log) {
    switch (e.e) {
      case 'coin': R.fx.coin(e.x, e.z); if (!still) { ton.muenze(); hudMuenzen(); } break;
      case 'gate': {
        R.fx.gate(e.z, e.panel, e.vor, e.nach);
        if (!still) { const gut = e.nach >= e.vor; ton.tor(gut); pop(opText(e.op, e.v), gut ? 'gut' : 'schlecht'); hudBumpen(); }
        break;
      }
      case 'hit': R.fx.hit(e.type, sim.s.x, e.z, e.loss); if (!still) { ton.treffer(); pop('−' + e.loss, 'schlecht'); hudBumpen(); } break;
      case 'fight': if (!still) { $('#kampf').hidden = false; } R.fx.kampfStart(sim.s.fight); break;
      case 'sieg': R.fx.sieg(e.boss, e.z); if (!still) { ton.sieg(); pop(e.boss ? 'Boss besiegt!' : 'Sieg!', 'gold'); $('#kampf').hidden = true; hudBumpen(); } break;
      case 'rung': R.fx.sprosse(e.z, e.m); if (!still) { ton.muenze(); pop('×' + e.m + '  +' + e.coins, 'gold'); } break;
      case 'won': if (!still) { R.fx.konfetti(); ton.ziel(); zustand = 'ende'; endeZeit = zeitGesamt; $('#zielText').hidden = false; $('#zielText').classList.remove('aus'); $('#zielText').textContent = 'GESCHAFFT!'; } break;
      case 'lost': if (!still) { R.fx.verloren(); ton.verloren(); zustand = 'ende'; endeZeit = zeitGesamt; $('#kampf').hidden = true; $('#zielText').hidden = false; $('#zielText').classList.add('aus'); $('#zielText').textContent = 'VERLOREN'; } break;
    }
  }
}

// ---- Ende eines Laufs
function auswerten() {
  const s = sim.s, l = level, ld = levelDaten(l.id);
  stand.stats.maxN = Math.max(stand.stats.maxN, s.stats.maxN);
  stand.stats.runs++;
  $('#zielText').hidden = true;
  if (s.phase === 'lost') {
    ld.fails++;
    speichern();
    zeigeVerloren(s.why);
    return;
  }
  const r = result(sim);
  const erster = !ld.done;
  const reward = r.coins + r.bonusCoins;
  const gutschrift = Math.max(0, reward - ld.bestReward);
  ld.done = true; ld.wins++; ld.stars = Math.max(ld.stars, r.sterne);
  const neuBestN = r.n > ld.bestN; ld.bestN = Math.max(ld.bestN, r.n);
  ld.bestPunkte = Math.max(ld.bestPunkte, r.punkte); ld.bestReward = Math.max(ld.bestReward, reward); ld.bestCoins = Math.max(ld.bestCoins, r.coins);
  if (r.alleMuenzen) ld.alle = true;
  stand.coins += gutschrift; stand.stats.coinsTotal += gutschrift;
  let geschlagen = false;
  if (herausforderung && herausforderung.level === l.id && herausforderung.n && r.n > herausforderung.n) { stand.stats.challengesWon++; geschlagen = true; }
  const lauf = { level: l.id, gewonnen: true, n: r.n, maxN: s.stats.maxN, bossN: r.bossN, unversehrt: r.unversehrt, alleMuenzen: r.alleMuenzen, sterne: r.sterne, fails: ld.fails, ersterSieg: erster };
  const neu = evaluateAwards(stand, N, lauf);
  speichern();
  ergebnis = { level: l.id, r, erster, neuBestN, gutschrift, neu, geschlagen };
  awardWarteschlange.push(...neu);
  zeigeErgebnis();
}

// ====================================================================== HUD
let hudN = -1, hudM = -1;
function hudMuenzen() { const v = sim ? sim.s.coins : 0; if (v !== hudM) { hudM = v; $('#hMuenzen').textContent = v; } }
function hudBumpen(reset) {
  const el = $('#zahl');
  if (reset) { hudN = -1; hudM = -1; }
  if (!sim) return;
  if (sim.s.n !== hudN) {
    const erst = hudN < 0; hudN = sim.s.n;
    $('#hAnzahl').textContent = hudN; el.textContent = hudN;
    if (!erst && !reduceMotion) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
  }
  hudMuenzen();
}
function pop(text, art) {
  if (!R || !sim) return;
  const p = R.project(R.view.cx, 2.6, R.view.cz);
  const d = document.createElement('div'); d.className = 'pop ' + (art || ''); d.textContent = text;
  d.style.left = p.x + 'px'; d.style.top = (p.y - 20) + 'px';
  $('#pops').appendChild(d); setTimeout(() => d.remove(), 1000);
}
function aktualisiereHud(st) {
  const s = sim.s, bossZ = level.boss.z;
  const p = clamp(st.z / (bossZ + 4), 0, 1);
  $('#fBar').style.width = (p * 100) + '%';
  hudBumpen();
  // Zahl über der Gruppe
  const el = $('#zahl');
  const pr = R.project(R.view.cx, 1.7 + (R.view.w > 2 ? 0.5 : 0), R.view.cz + 0.2);
  el.style.transform = `translate(${pr.x.toFixed(1)}px,${pr.y.toFixed(1)}px) translate(-50%,-100%)`;
  el.style.background = css(SKIN_BY_ID[stand.skins.sel].color);
  el.hidden = !(zustand === 'bereit' || zustand === 'play' || zustand === 'ende' || zustand === 'pause') || s.n <= 0;
  // Kampf-Anzeige und Vorschau auf den nächsten Gegner
  const k = $('#kampf');
  let e = null, hp = 0, voll = 1;
  if (s.fight) { e = s.fight.ev; hp = s.fight.hp; voll = s.fight.hp0; }
  else if (zustand === 'play' && s.phase === 'run') {
    const ev = sim.p.ev;
    for (let i = s.ei; i < ev.length; i++) if (ev[i].k === 'enemy') { if (ev[i].z - s.z < 36) { e = ev[i].e; hp = e.hp; voll = e.hp; } break; }
  }
  if (e && zustand !== 'ende') {
    k.hidden = false;
    $('#kDu').textContent = 'Du ' + s.n;
    $('#kGegner').textContent = (e.boss ? (level.boss.name || 'Boss') : 'Gegner') + ' ' + Math.max(0, Math.ceil(hp));
    $('#kBar').style.width = clamp(hp / voll, 0, 1) * 100 + '%';
    $('#kText').textContent = s.fight ? 'Kampf!' : (e.boss ? 'Boss voraus' : 'Gegnertrupp voraus');
  } else k.hidden = true;
}

// ====================================================================== Hauptschleife
let fpsMess = { n: 0, sum: 0, stufe: 0 };
function adaptiv(dt) {
  if (zustand !== 'play') return;
  fpsMess.n++; fpsMess.sum += dt;
  if (fpsMess.n < 80) return;
  const mittel = fpsMess.sum / fpsMess.n; fpsMess.n = 0; fpsMess.sum = 0;
  const q = R.quality;
  if (mittel > 0.026 && q.pr > 0.8) { R.setQuality(Math.max(0.75, q.pr - 0.25)); fpsMess.stufe++; }
  else if (mittel > 0.034 && q.deco) { R.deco = false; }
}
function frame(now) {
  requestAnimationFrame(frame);
  if (!R) return;
  const dt = Math.min(0.1, letzteZeit ? (now - letzteZeit) / 1000 : 0.016); letzteZeit = now; zeitGesamt += dt;
  if (!sim) return;
  const lauf = zustand === 'play' || zustand === 'ende' || (zustand === 'menu' && demo);
  if (lauf) {
    akku += dt;
    let n = 0;
    while (akku >= DT && n < 5) {
      if (zustand === 'menu') demoTakt(); else tick();
      akku -= DT; n++;
    }
    if (n === 5) akku = 0;
  }
  adaptiv(dt);
  const a = lauf ? clamp(akku / DT, 0, 1) : 1;
  const s = sim.s;
  const st = { x: lauf ? px + (s.x - px) * a : s.x, z: lauf ? pz + (s.z - pz) * a : s.z, n: s.n, phase: s.phase, t: s.t };
  R.setLaufend(zustand === 'play' || zustand === 'menu');
  R.frame(st, dt);
  if (zustand !== 'menu' && zustand !== 'start') aktualisiereHud(st); else { $('#zahl').hidden = true; $('#kampf').hidden = true; }
  if (zustand === 'ende' && zeitGesamt - endeZeit > (sim.s.phase === 'won' ? 1.15 : 0.8) && !ergebnisOffen()) { auswerten(); }
}
const ergebnisOffen = () => !$('#oErgebnis').hidden || !$('#oVerloren').hidden || !$('#oAward').hidden;

// ---- Menü-Hintergrund: ein Lauf, der sich von selbst spielt (Tore mit dem besten Ergebnis)
function starteDemo() {
  if (!R) return;
  const l = LEVEL_BY_ID[demoLevel];
  if (!R.lvl || R.lvl !== l) { R.setLevel(l); R.lvl = l; } else R.reset();
  R.setFarbe(SKIN_BY_ID[stand.skins.sel].color);
  level = l; sim = createSim(l); demo = { }; px = 0; pz = 0; akku = 0; tx = 0;
}
let demoLevel = 3;
function demoTakt() {
  px = sim.s.x; pz = sim.s.z;
  const s = sim.s;
  if (s.phase === 'won' || s.phase === 'lost' || s.z > level.boss.z + 14) { starteDemo(); return; }
  // nächstes Tor mit dem besten Ergebnis ansteuern
  const ev = sim.p.ev; let ziel = 0;
  for (let i = s.ei; i < ev.length; i++) {
    if (ev[i].k === 'gate') {
      const g = ev[i].g; let best = -1, bx = 0;
      for (const q of g.panels) { const r = applyOp(s.n, q.op, q.v); if (r > best) { best = r; bx = (q.x0 + q.x1) / 2; } }
      if (ev[i].z - s.z < 30) ziel = bx; break;
    } else if (ev[i].k === 'obs' && ev[i].z - s.z < 14) {
      const o = ev[i].o; if (o.x0 !== undefined) ziel = (o.x0 + o.x1) / 2 > 0 ? -2.2 : 2.2;
    }
  }
  tx += (ziel - tx) * 0.2;
  step(sim, tx); ereignisse(sim.s.log, true); sim.s.log.length = 0;
  if (sim.s.fight) R.fx.kampf(sim.s.fight);
}

// ====================================================================== Bildschirme
const SCREENS = ['#sMenu', '#sLevels', '#sAwards', '#sGarage', '#oHilfe', '#oPause', '#oErgebnis', '#oVerloren', '#oAward'];
function zeigeNur(sel) {
  for (const s of SCREENS) $(s).hidden = s !== sel;
  // Klicksperre: Panels blenden ein, ein früher Klick soll keinen frisch erscheinenden Button treffen
  if (sel) { const el = $(sel); el.classList.add('sperre'); setTimeout(() => el.classList.remove('sperre'), 450); }
}
function zumMenu() {
  zustand = 'menu';
  $('#hud').hidden = true; $('#hud2').hidden = true; $('#hilfe').hidden = true; $('#tipp').hidden = true; $('#zielText').hidden = true; $('#banner').hidden = true; $('#kampf').hidden = true; $('#pops').textContent = '';
  zeigeNur('#sMenu');
  baueMenu();
  starteDemo();
  if (herausforderung && herausforderung.award) zeigeAwardBanner();
}
function baueMenu() {
  const n = naechstesOffenes(), g = LEVELS.filter((l) => geschafft(l.id)).length;
  $('#mSpielenText').textContent = g ? (g >= N ? 'Spielen' : 'Weiter: Level ' + n) : 'Spielen';
  $('#mLevelZahl').textContent = g + ' / ' + N;
  $('#mAwardsZahl').textContent = Object.keys(stand.awards).length + ' / ' + AWARDS.length;
  $('#mMuenzen').textContent = stand.coins;
  tonKnopf();
}
function tonKnopf() {
  const an = stand.settings.sound;
  $('#mTon').innerHTML = an
    ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>'
    : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16 9l5 6M21 9l-5 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  $('#mTon').setAttribute('aria-label', an ? 'Ton aus' : 'Ton an');
  $('#pTon').textContent = an ? 'Ton aus' : 'Ton an';
}
function tonUmschalten() { stand.settings.sound = !stand.settings.sound; speichern(); ton.resume(); ton.setOn(stand.settings.sound); tonKnopf(); }

const STERN = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4 6.1 20.5l1.2-6.5L2.5 9.4l6.6-.9z" fill="currentColor"/></svg>';
const sterneHtml = (n, gross) => Array.from({ length: 3 }, (_, i) => `<span style="color:${i < n ? '#ffc928' : 'rgba(246,247,249,.22)'};display:inline-flex">${STERN}</span>`).join('');

function zeigeLevels() {
  zeigeNur('#sLevels');
  const liste = $('#lListe'); liste.textContent = '';
  const g = LEVELS.filter((l) => geschafft(l.id)).length;
  $('#lZahl').textContent = g + '/' + N + ' · ' + sterneGesamt() + ' ★';
  const gruppen = {};
  for (const l of LEVELS) (gruppen[l.theme] = gruppen[l.theme] || []).push(l);
  for (const th of Object.keys(gruppen)) {
    const sec = document.createElement('section'); sec.className = 'gruppe';
    const h = document.createElement('h3'); h.textContent = THEMES[th].name + ' · Level ' + gruppen[th][0].id + '–' + gruppen[th][gruppen[th].length - 1].id;
    const grid = document.createElement('div'); grid.className = 'lgrid';
    for (const l of gruppen[th]) {
      const ld = stand.levels[l.id], frei = freigeschaltet(l.id);
      const b = document.createElement('button');
      b.className = 'ltile' + (ld && ld.done ? ' geschafft' : frei ? ' offen' : ' zu');
      b.disabled = !frei;
      b.setAttribute('aria-label', 'Level ' + l.id + ' ' + l.name + (ld && ld.done ? ', geschafft, ' + ld.stars + ' Sterne' : frei ? ', offen' : ', gesperrt'));
      b.innerHTML = '<b>' + l.id + '</b>';
      b.title = l.name;
      if (ld && ld.done) { const st = document.createElement('span'); st.className = 'sterne'; st.innerHTML = sterneHtml(ld.stars); b.appendChild(st); }
      else if (!frei) { const sm = document.createElement('small'); sm.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2" fill="currentColor"/><path d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" stroke-width="2"/></svg>'; b.appendChild(sm); }
      b.addEventListener('click', () => { ton.resume(); ton.klick(); starteLevel(l.id); });
      grid.appendChild(b);
    }
    sec.append(h, grid); liste.appendChild(sec);
  }
}

function zeigeAwards() {
  zeigeNur('#sAwards');
  const liste = $('#aListe'); liste.textContent = '';
  const p = progressOf(stand, N);
  $('#aZahl').textContent = Object.keys(stand.awards).length + ' / ' + AWARDS.length;
  const sortiert = [...AWARDS].sort((a, b) => (!!stand.awards[b.id] - !!stand.awards[a.id]));
  for (const a of sortiert) {
    const da = stand.awards[a.id];
    const k = document.createElement('button'); k.type = 'button'; k.className = 'akarte' + (da ? ' da' : '');
    const cv = document.createElement('canvas'); cv.width = 128; cv.height = 128;
    drawAwardIcon(cv.getContext('2d'), a, 64, 64, 120, !da);
    const t = document.createElement('div');
    const r = RARITY[a.rarity];
    t.innerHTML = '<b></b><span class="r"></span><p></p>';
    t.querySelector('b').textContent = a.name;
    const rs = t.querySelector('.r'); rs.textContent = r.name; rs.style.color = r.color;
    t.querySelector('p').textContent = a.desc;
    if (da) { const tm = document.createElement('time'); tm.dateTime = da.at; tm.textContent = 'Freigeschaltet am ' + new Date(da.at).toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' }); t.appendChild(tm); }
    else if (a.prog) {
      const [ist, soll] = a.prog(p, N);
      const bar = document.createElement('div'); bar.className = 'bar'; bar.innerHTML = '<i></i>'; bar.firstChild.style.width = clamp(ist / soll * 100, 0, 100) + '%'; bar.title = ist + ' / ' + soll;
      const z = document.createElement('small'); z.textContent = ist + ' / ' + soll; t.append(bar, z);
    }
    k.append(cv, t);
    if (da) k.addEventListener('click', () => awardPopup({ award: a, alt: true }, () => zeigeAwards()));
    else k.disabled = true;
    liste.appendChild(k);
  }
}

function skinBild(cv, farbe) {
  const c = cv.getContext('2d'); c.clearRect(0, 0, cv.width, cv.height);
  const w = cv.width, h = cv.height, col = css(farbe);
  c.fillStyle = 'rgba(0,0,0,.22)'; c.beginPath(); c.ellipse(w / 2, h * 0.9, w * 0.26, h * 0.06, 0, 0, 7); c.fill();
  c.fillStyle = col;
  c.beginPath(); c.moveTo(w * 0.3, h * 0.9); c.quadraticCurveTo(w * 0.28, h * 0.52, w * 0.4, h * 0.46); c.lineTo(w * 0.6, h * 0.46); c.quadraticCurveTo(w * 0.72, h * 0.52, w * 0.7, h * 0.9); c.closePath(); c.fill();
  c.beginPath(); c.arc(w / 2, h * 0.32, w * 0.2, 0, 7); c.fill();
  c.fillStyle = 'rgba(255,255,255,.35)'; c.beginPath(); c.ellipse(w * 0.43, h * 0.27, w * 0.06, h * 0.05, -0.5, 0, 7); c.fill();
  c.fillStyle = '#14182e'; c.beginPath(); c.arc(w * 0.44, h * 0.33, w * 0.028, 0, 7); c.arc(w * 0.58, h * 0.33, w * 0.028, 0, 7); c.fill();
}
function zeigeGarage() {
  zeigeNur('#sGarage');
  $('#gMuenzen').textContent = stand.coins + ' Münzen';
  $('#gName').value = stand.settings.name;
  const liste = $('#gListe'); liste.textContent = '';
  for (const s of SKINS) {
    const hat = stand.skins.owned.includes(s.id), aktiv = stand.skins.sel === s.id;
    const k = document.createElement('div'); k.className = 'skin' + (aktiv ? ' aktiv' : '');
    const cv = document.createElement('canvas'); cv.width = 160; cv.height = 160; skinBild(cv, s.color);
    const b = document.createElement('button'); b.type = 'button'; b.className = 'btn2';
    if (aktiv) { b.textContent = 'Gewählt'; b.disabled = true; }
    else if (hat) { b.textContent = 'Wählen'; b.addEventListener('click', () => { stand.skins.sel = s.id; speichern(); ton.klick(); zeigeGarage(); }); }
    else {
      b.textContent = s.preis + ' Münzen'; b.disabled = stand.coins < s.preis;
      b.addEventListener('click', () => {
        if (stand.coins < s.preis || stand.skins.owned.includes(s.id)) return;
        stand.coins -= s.preis; stand.skins.owned.push(s.id); stand.skins.sel = s.id; ton.kauf();
        const neu = evaluateAwards(stand, N, null); speichern();
        zeigeGarage();
        if (neu.length) { awardWarteschlange.push(...neu); zeigeNaechstenAward(() => zeigeGarage()); }
      });
    }
    const sm = document.createElement('small'); sm.textContent = hat ? 'Freigeschaltet' : (stand.coins < s.preis ? 'Noch ' + (s.preis - stand.coins) + ' Münzen' : ' ');
    const nm = document.createElement('b'); nm.textContent = s.name;
    k.append(cv, nm, sm, b); liste.appendChild(k);
  }
}

function pause() {
  if (zustand !== 'play') return;
  zustand = 'pause'; tasten.l = tasten.r = false; drag = null;
  zeigeNur('#oPause');
  setTimeout(() => $('#pWeiter').focus(), 30);
}
function weiter() { if (zustand !== 'pause') return; zustand = 'play'; zeigeNur(null); letzteZeit = 0; }

// ---------- Ergebnis ----------
const fmt = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
function zeigeErgebnis() {
  const e = ergebnis, l = LEVEL_BY_ID[e.level], r = e.r;
  zustand = 'ergebnis';
  $('#hErgebnis').textContent = e.neuBestN && !e.erster ? 'Neue Bestmarke!' : e.erster ? 'Geschafft!' : 'Im Ziel!';
  $('#eLevel').textContent = 'Level ' + l.id + ' · ' + l.name;
  const sv = $('#eSterne'); sv.innerHTML = '';
  for (let i = 0; i < 3; i++) { const sp = document.createElement('span'); sp.style.cssText = 'display:inline-flex;color:' + (i < r.sterne ? '#ffc928' : 'rgba(246,247,249,.22)'); sp.innerHTML = STERN; sv.appendChild(sp); }
  sv.setAttribute('aria-label', r.sterne + ' von 3 Sternen');
  $('#eFiguren').textContent = fmt(r.n); $('#eMuenzen').textContent = r.coins + '/' + r.coinsGesamt; $('#ePunkte').textContent = fmt(r.punkte);
  const ms = [];
  ms.push(r.sterne >= 3 ? 'Alle drei Sterne!' : r.sterne === 2 ? (r.n < l.par ? 'Dritter Stern ab ' + l.par + ' Figuren' : '') : 'Zweiter Stern: alle Münzen');
  if (r.bonusCoins) ms.push('Bonus +' + r.bonusCoins);
  if (r.unversehrt) ms.push('Unversehrt');
  if (e.geschlagen) ms.unshift('Herausforderung geschlagen!');
  $('#eStats').textContent = ms.filter(Boolean).join(' · ');
  const ar = $('#eAwards'); ar.textContent = '';
  for (const a of e.neu) {
    const b = document.createElement('button'); b.type = 'button';
    const cv = document.createElement('canvas'); cv.width = 64; cv.height = 64; drawAwardIcon(cv.getContext('2d'), a, 32, 32, 60, false);
    b.append(cv, document.createTextNode(a.name));
    b.addEventListener('click', () => awardPopup({ award: a, alt: true }, () => { zeigeNur('#oErgebnis'); }));
    ar.appendChild(b);
  }
  const naechstes = LEVEL_BY_ID[e.level + 1];
  $('#eWeiter').hidden = !naechstes;
  const st = $('#eStatus');
  st.textContent = e.gutschrift ? '+' + e.gutschrift + ' Münzen gutgeschrieben' : 'Münzen gibt es nur für neue Bestwerte · Spielstand auf diesem Gerät gespeichert';
  st.className = 'status' + (e.gutschrift ? ' ok' : '');
  const danach = () => { zeigeNur('#oErgebnis'); setTimeout(() => (naechstes ? $('#eWeiter') : $('#eNochmal')).focus(), 30); };
  if (awardWarteschlange.length) zeigeNaechstenAward(danach); else danach();
}
function zeigeVerloren(why) {
  zustand = 'ergebnis';
  const b = level.boss;
  $('#vGrund').textContent = GRUND[why] || 'Alle Figuren sind weg';
  let tipp = TIPP[why] || '';
  if (why === 'boss') tipp = 'Der Boss hatte Stärke ' + b.hp + '. ' + TIPP.boss;
  $('#vTipp').textContent = tipp;
  zeigeNur('#oVerloren');
  setTimeout(() => $('#vNochmal').focus(), 30);
}

// ---------- Awards: Popup & Teilen ----------
const awardWarteschlange = [];
let popupZurueck = null, popupInfo = null;
function zeigeNaechstenAward(fertig) {
  const a = awardWarteschlange.shift();
  if (!a) { fertig(); return; }
  awardPopup({ award: a }, () => zeigeNaechstenAward(fertig));
}
function awardPopup(info, zurueck) {
  popupZurueck = zurueck; popupInfo = info;
  zeigeNur('#oAward');
  const cv = $('#awIcon'), c = cv.getContext('2d');
  c.clearRect(0, 0, 400, 400);
  $('#awStatus').textContent = '';
  if (info.award) {
    const a = info.award, r = RARITY[a.rarity];
    drawAwardIcon(c, a, 200, 200, 380, false);
    $('#awArt').textContent = 'Award · ' + r.name; $('#awArt').style.color = r.color;
    $('#hAward').textContent = a.name;
    $('#awZitat').textContent = a.share;
    $('#awFrage').textContent = 'Kannst du mich schlagen?';
    if (!info.alt) ton.award();
  } else {
    const l = LEVEL_BY_ID[info.level];
    c.save(); c.translate(100, 110); c.scale(1.2, 1.2); skinBild({ getContext: () => c, width: 160, height: 160 }, SKIN_BY_ID[stand.skins.sel].color); c.restore();
    c.fillStyle = '#fff'; c.font = '800 120px "Barlow Condensed", Arial Narrow, sans-serif'; c.textAlign = 'center'; c.fillText(String(info.n), 200, 120);
    $('#awArt').textContent = 'Herausforderung'; $('#awArt').style.color = '#FF9200';
    $('#hAward').textContent = 'Level ' + l.id + ' mit ' + fmt(info.n) + ' Figuren';
    $('#awZitat').textContent = 'Ich habe Level ' + l.id + ' („' + l.name + '“) mit ' + fmt(info.n) + ' Figuren geschafft.';
    $('#awFrage').textContent = 'Kannst du mich schlagen?';
  }
  setTimeout(() => $('#awTeilen').focus(), 40);
}
function teilenLink(info) {
  const base = (document.querySelector('link[rel=canonical]') || location).href.split('?')[0];
  const u = new URL(base);
  if (info.award) u.searchParams.set('award', info.award.id);
  else { u.searchParams.set('level', info.level); u.searchParams.set('n', String(info.n)); }
  if (stand.settings.name) u.searchParams.set('von', stand.settings.name);
  return u.toString();
}
function teilenText(info) {
  if (info.award) return info.award.share + ' Kannst du mich schlagen? ZAHLENSTURM auf PlaySaal:';
  const l = LEVEL_BY_ID[info.level];
  return 'Ich habe Level ' + l.id + ' mit ' + fmt(info.n) + ' Figuren geschafft. Kannst du mich schlagen? ZAHLENSTURM auf PlaySaal:';
}
let logoBild = null;
function logo() {
  if (!logoBild) { logoBild = new Image(); logoBild.src = '../brand/playsaal-logo-horizontal-dark.svg'; }
  return logoBild;
}
async function teilenBild(info) {
  const lg = logo();
  if (!lg.complete) await new Promise((r) => { lg.onload = lg.onerror = r; setTimeout(r, 1500); });
  try { await Promise.all(['400 54px "Dela Gothic One"', '700 40px "Barlow"', '600 42px "Barlow"', '500 34px "Barlow"', '700 190px "Barlow Condensed"'].map((f) => document.fonts.load(f))); } catch (e) { /* Schriften optional */ }
  const cv = document.createElement('canvas');
  const name = stand.settings.name || '';
  if (info.award) {
    const a = info.award, da = stand.awards[a.id];
    drawShareImage(cv, { award: a, kicker: 'AWARD · ' + RARITY[a.rarity].name.toUpperCase(), titel: a.name, zeile: '„' + a.share + '“', name, logo: lg, url: urlKurz(),
      hinweis: da ? 'Freigeschaltet am ' + new Date(da.at).toLocaleDateString('de-DE') : '' });
  } else {
    const l = LEVEL_BY_ID[info.level], ld = stand.levels[l.id] || {};
    drawShareImage(cv, { zeitGross: fmt(info.n), unterZeit: 'Figuren · Level ' + l.id + ' · ' + l.name, kicker: 'HERAUSFORDERUNG', titel: 'Kannst du das schlagen?',
      zeile: (ld.stars ? '★'.repeat(ld.stars) + ' ' : '') + 'Level ' + l.id + ' geschafft', name, logo: lg, url: urlKurz(),
      hinweis: 'Auf meinem Gerät erspielt (nicht serverseitig geprüft)', einladung: 'Spiel gegen mich – ohne Anmeldung!' });
  }
  return new Promise((ok) => cv.toBlob((b) => ok(b), 'image/png'));
}
function urlKurz() { const c = (document.querySelector('link[rel=canonical]') || location).href.split('?')[0]; return c.replace(/^https?:\/\//, ''); }
function geteilt() {
  stand.stats.shared = (stand.stats.shared || 0) + 1;
  const neu = evaluateAwards(stand, N, null); speichern();
  if (neu.length) { awardWarteschlange.push(...neu); toast('Award: ' + neu.map((a) => a.name).join(', ')); }
}
const dateiName = (info) => 'zahlensturm-' + (info.award ? info.award.id : 'level-' + info.level) + '.png';
async function aktionTeilen() {
  const info = popupInfo, st = $('#awStatus');
  const url = teilenLink(info), text = teilenText(info);
  st.textContent = 'Bild wird erstellt …';
  let blob = null;
  try { blob = await teilenBild(info); } catch (e) { blob = null; }
  const datei = blob ? new File([blob], dateiName(info), { type: 'image/png' }) : null;
  try {
    if (navigator.share) {
      const mitBild = datei && navigator.canShare && navigator.canShare({ files: [datei] });
      await navigator.share(mitBild ? { files: [datei], title: 'ZAHLENSTURM', text: text + ' ' + url } : { title: 'ZAHLENSTURM', text, url });
      st.textContent = 'Geteilt!'; geteilt(); return;
    }
  } catch (e) { if (e && e.name === 'AbortError') { st.textContent = ''; return; } }
  // Desktop: Link kopieren und Bild herunterladen
  const kopiert = await kopieren(text + ' ' + url);
  if (blob) herunterladen(blob, datei.name);
  st.textContent = (kopiert ? 'Link kopiert' : 'Link: ' + url) + (blob ? ' · Bild gespeichert' : '');
  geteilt();
}
async function aktionBild() {
  const st = $('#awStatus'); st.textContent = 'Bild wird erstellt …';
  const blob = await teilenBild(popupInfo).catch(() => null);
  if (!blob) { st.textContent = 'Bild konnte nicht erstellt werden.'; return; }
  herunterladen(blob, dateiName(popupInfo));
  st.textContent = 'Bild gespeichert.';
}
async function aktionLink() {
  const info = popupInfo, url = teilenLink(info);
  const ok = await kopieren(teilenText(info) + ' ' + url);
  $('#awStatus').textContent = ok ? 'Link kopiert – ab damit in den Gruppenchat!' : url;
  if (ok) geteilt();
}
async function kopieren(t) {
  try { await navigator.clipboard.writeText(t); return true; } catch (e) { /* Fallback */ }
  try {
    const ta = document.createElement('textarea'); ta.value = t; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select(); const ok = document.execCommand('copy'); ta.remove(); return ok;
  } catch (e) { return false; }
}
function herunterladen(blob, name) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
}
function popupSchliessen() { const z = popupZurueck; popupZurueck = null; if (z) z(); }
function zeigeAwardBanner() {
  const a = AWARD_BY_ID[herausforderung.award]; if (!a) return;
  toast((herausforderung.von || 'Jemand') + ' hat „' + a.name + '“ geholt. Schaffst du das auch?', 6000);
}
function toast(t, ms = 2400) {
  const el = document.createElement('div'); el.textContent = t;
  $('#toasts').appendChild(el); setTimeout(() => el.remove(), ms);
}

// ====================================================================== Eingabe
const istTaste = (e, codes, keys) => codes.includes(e.code) || keys.includes(e.key);
addEventListener('keydown', (e) => {
  if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
  ton.resume();
  const li = istTaste(e, ['ArrowLeft', 'KeyA'], ['ArrowLeft', 'a', 'A']), re = istTaste(e, ['ArrowRight', 'KeyD'], ['ArrowRight', 'd', 'D']);
  if (li || re) {
    if (zustand === 'bereit' || zustand === 'play') { e.preventDefault(); if (zustand === 'bereit') beginneLauf(); if (li) tasten.l = true; if (re) tasten.r = true; }
    return;
  }
  if (e.code === 'KeyR' || e.key === 'r' || e.key === 'R') {
    if (zustand === 'play' || zustand === 'bereit' || zustand === 'pause' || zustand === 'ende' || !$('#oVerloren').hidden || (!$('#oErgebnis').hidden)) { e.preventDefault(); starteLevel(level.id); }
    return;
  }
  if (e.key === 'Escape') {
    if (zustand === 'play') { e.preventDefault(); pause(); }
    else if (zustand === 'pause') { e.preventDefault(); weiter(); }
    else if (!$('#oAward').hidden) { e.preventDefault(); popupSchliessen(); }
    else if (!$('#oHilfe').hidden) { e.preventDefault(); zumMenu(); }
    else if (['#sLevels', '#sAwards', '#sGarage'].some((s) => !$(s).hidden)) { e.preventDefault(); zumMenu(); }
    return;
  }
  if ((e.key === 'p' || e.key === 'P') && zustand === 'play') { pause(); return; }
  if (e.key === 'Enter' && !$('#oVerloren').hidden && document.activeElement === document.body) { e.preventDefault(); starteLevel(level.id); }
  else if (e.key === 'Enter' && !$('#oErgebnis').hidden && document.activeElement === document.body) { e.preventDefault(); $('#eWeiter').hidden ? starteLevel(level.id) : $('#eWeiter').click(); }
});
addEventListener('keyup', (e) => {
  if (istTaste(e, ['ArrowLeft', 'KeyA'], ['ArrowLeft', 'a', 'A'])) tasten.l = false;
  if (istTaste(e, ['ArrowRight', 'KeyD'], ['ArrowRight', 'd', 'D'])) tasten.r = false;
});
function touchModus() { if (!document.body.classList.contains('touch')) document.body.classList.add('touch'); }
if (matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window && navigator.maxTouchPoints > 0) document.body.classList.add('touch');
addEventListener('touchstart', touchModus, { passive: true, once: true });

// Ziehen: relative Bewegung. Eine Fingerbreite entspricht einem Anteil der Streckenbreite.
const zone = $('#game');
function ziehFaktor() { const ref = Math.min(zone.clientWidth, 560); return (level.hw * 2 * 1.05) / (ref * 0.8); }
canvas.addEventListener('pointerdown', (e) => {
  ton.resume();
  if (e.pointerType === 'touch') touchModus();
  if (zustand === 'bereit') beginneLauf();
  if (zustand !== 'play') return;
  e.preventDefault();
  drag = { id: e.pointerId, x0: e.clientX, tx0: tx };
  try { canvas.setPointerCapture(e.pointerId); } catch (x) { /* egal */ }
});
canvas.addEventListener('pointermove', (e) => {
  if (!drag || drag.id !== e.pointerId || zustand !== 'play') return;
  tx = clamp(drag.tx0 + (e.clientX - drag.x0) * ziehFaktor(), -level.hw, level.hw);
});
const ziehEnde = (e) => { if (drag && drag.id === e.pointerId) drag = null; };
canvas.addEventListener('pointerup', ziehEnde); canvas.addEventListener('pointercancel', ziehEnde); canvas.addEventListener('lostpointercapture', ziehEnde);
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
addEventListener('blur', () => { tasten.l = tasten.r = false; drag = null; if (zustand === 'play') pause(); });
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { tasten.l = tasten.r = false; drag = null; if (zustand === 'play') pause(); if (ton.ctx) ton.ctx.suspend().catch(() => {}); }
  else if (ton.ctx && stand.settings.sound) ton.ctx.resume().catch(() => {});
  letzteZeit = 0;
});

// ---------- Vollbild ----------
function vollbildMoeglich() { const d = document.documentElement; return !!(d.requestFullscreen || d.webkitRequestFullscreen); }
async function vollbild() {
  const d = document.documentElement;
  try {
    if (document.fullscreenElement || document.webkitFullscreenElement) { (document.exitFullscreen || document.webkitExitFullscreen).call(document); return; }
    await (d.requestFullscreen ? d.requestFullscreen({ navigationUI: 'hide' }) : d.webkitRequestFullscreen());
    try { if (screen.orientation && screen.orientation.lock && matchMedia('(pointer: coarse)').matches) screen.orientation.lock('portrait').catch(() => {}); } catch (e) { /* optional */ }
  } catch (e) { toast('Vollbild wird hier nicht unterstützt'); }
}
if (!vollbildMoeglich()) { $('#mVoll').hidden = true; $('#pVoll').hidden = true; }

// ---------- Knöpfe ----------
const klick = (sel, fn) => $(sel).addEventListener('click', (e) => { ton.resume(); ton.klick(); fn(e); });
klick('#mSpielen', () => starteLevel(naechstesOffenes()));
klick('#mLevel', zeigeLevels);
klick('#mAwards', zeigeAwards);
klick('#mGarage', zeigeGarage);
klick('#mHilfe', () => zeigeNur('#oHilfe'));
klick('#hZu', () => zumMenu());
klick('#mTon', tonUmschalten);
klick('#mVoll', vollbild);
document.querySelectorAll('[data-zurueck]').forEach((b) => b.addEventListener('click', () => { ton.klick(); zumMenu(); }));
klick('#bNeu', () => neustart());
klick('#bPause', () => (zustand === 'pause' ? weiter() : pause()));
klick('#pWeiter', weiter);
klick('#pNeu', () => starteLevel(level.id));
klick('#pLevel', () => { zustand = 'menu'; zumMenuLevels(); });
klick('#pTon', tonUmschalten);
klick('#pVoll', vollbild);
klick('#pMenu', zumMenu);
function zumMenuLevels() { zumMenu(); zeigeLevels(); }
klick('#eWeiter', () => { const n = LEVEL_BY_ID[ergebnis.level + 1]; if (n) starteLevel(n.id); });
klick('#eNochmal', () => starteLevel(ergebnis.level));
klick('#eTeilen', () => awardPopup({ level: ergebnis.level, n: stand.levels[ergebnis.level].bestN > ergebnis.r.n ? stand.levels[ergebnis.level].bestN : ergebnis.r.n }, () => zeigeNur('#oErgebnis')));
klick('#eLevels', zumMenuLevels);
klick('#eMenu', zumMenu);
klick('#vNochmal', () => starteLevel(level.id));
klick('#vLevels', zumMenuLevels);
klick('#vMenu', zumMenu);
$('#awTeilen').addEventListener('click', () => { ton.resume(); aktionTeilen(); });
$('#awBild').addEventListener('click', () => { ton.klick(); aktionBild(); });
$('#awLink').addEventListener('click', () => { ton.klick(); aktionLink(); });
klick('#awWeiter', popupSchliessen);
$('#gName').addEventListener('change', (e) => { const n = saubererName(e.target.value); stand.settings.name = n; e.target.value = n; speichern(); });
$('#oPause').addEventListener('click', (e) => { if (e.target === e.currentTarget) weiter(); });

// ====================================================================== Start
function startParameter() {
  const lv = +PARAMS.get('level'), n = +PARAMS.get('n'), von = saubererName(PARAMS.get('von') || ''), award = PARAMS.get('award');
  if (LEVEL_BY_ID[lv]) {
    const nn = Number.isFinite(n) && n >= 1 && n <= 9999 ? Math.round(n) : null;
    if (nn) herausforderung = { level: lv, n: nn, von };
    return lv;
  }
  if (award && AWARD_BY_ID[award]) herausforderung = { award, von };
  return null;
}
async function init() {
  if (!R) {
    $('#sMenu').hidden = false; $('#sMenu').querySelector('.menu-in').innerHTML = '<h1 class="titel"><span>ZAHLEN</span><span>STURM</span></h1><p class="unter">Dein Browser kann leider kein WebGL. Probier einen aktuellen Browser oder ein anderes Gerät.</p><a class="btn" href="../">Andere Spiele</a>';
    return;
  }
  groesse();
  try { await Promise.race([Promise.all(['800 100px "Barlow Condensed"', '700 20px "Barlow"'].map((f) => document.fonts.load(f))), new Promise((r) => setTimeout(r, 1500))]); } catch (e) { /* Schriften optional */ }
  setTimeout(logo, 2500);
  const direkt = startParameter();
  if (direkt) starteLevel(direkt); else zumMenu();
  requestAnimationFrame(frame);
}

// Test-Schnittstelle (nur mit ?test)
if (TEST) {
  window.__zs = {
    get zustand() { return zustand; }, get sim() { return sim; }, get stand() { return stand; }, get level() { return level; }, get ergebnis() { return ergebnis; }, get tx() { return tx; },
    LEVELS, SKINS, R, starteLevel, zumMenu, pause, weiter, speichern, laden() { stand = ladeStand(); }, awardWarteschlange, awardPopup, teilenBild, teilenLink, aktionTeilen,
    setTx(v) { tx = v; }, beginne: beginneLauf,
    // Eingaben aus dem Lösungs-Bot abspielen (schnell, ohne Echtzeit): list = [[tick, tx], ...]
    spiele(list, maxTicks = 60 * 200) {
      beginneLauf(); let i = 0;
      for (let k = 0; k < maxTicks && (zustand === 'play' || zustand === 'ende') && sim.s.phase !== 'won' && sim.s.phase !== 'lost'; k++) {
        while (i < list.length && list[i][0] <= sim.s.t) tx = list[i++][1];
        tick();
      }
      return sim.s.phase;
    },
    schnell(n) { for (let k = 0; k < n && sim.s.phase !== 'won' && sim.s.phase !== 'lost'; k++) tick(); },
    auswerten, info() { return R.info(); }
  };
}
init();
