// JUNGLE RUNNER: Spiel im Browser – Steuerung, Menüs, HUD, Speicherstand, Awards, Teilen, Endlosmodus.
// Regeln stehen in sim.js (fester 60-Hz-Takt), die Level in levels.js, die 3D-Darstellung in render.js.
import { createSim, step, result, starFlags, DT, POWER } from './sim.js';
import { LEVELS, LEVEL_BY_ID, WORLDS, endlessLevel } from './levels.js';
import { AWARDS, AWARD_BY_ID, RARITY, evaluateAwards, progressOf, drawAwardIcon, drawShareImage, drawKid, kidReady } from './awards.js';
import { createRenderer } from './render.js';
import { createAudio } from './audio.js';
import { OUTFITS, OUTFIT_BY_ID, POWER_COL, POWER_NAME, iconImg, iconUrl } from './chars.js';
import { SAVE_KEY, ladeAusRoh, migriere, saubererName, tagesSeed, heute } from './save.js';

const $ = (s) => document.querySelector(s);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const PARAMS = new URLSearchParams(location.search);
const TEST = PARAMS.has('test');
const N = LEVELS.length;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const fmt = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const fmtZeit = (s) => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');

// ====================================================================== Speicherstand
const IDS = { levels: LEVELS.map((l) => l.id), outfits: OUTFITS.map((o) => o.id), awards: AWARDS.map((a) => a.id) };
function ladeStand() {
  let roh = null;
  try { roh = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) { roh = null; }
  return ladeAusRoh(roh, IDS);
}
let speicherFehler = false;
function speichern() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(stand)); speicherFehler = false; }
  catch (e) { if (!speicherFehler) toast('Speichern nicht möglich (privater Modus?)'); speicherFehler = true; }
}
let stand = ladeStand();
const levelDaten = (id) => (stand.levels[id] = stand.levels[id] || { done: false, stars: 0, bestCoins: 0, bestHearts: 0, bestSek: 0, bestPunkte: 0, fails: 0, tries: 0, wins: 0 });
const geschafft = (id) => !!(stand.levels[id] && stand.levels[id].done);
const freigeschaltet = (id) => id === 1 || geschafft(id) || geschafft(id - 1);
const naechstesOffenes = () => { for (const l of LEVELS) if (!geschafft(l.id)) return freigeschaltet(l.id) ? l.id : 1; return N; };
const sterneGesamt = () => LEVELS.reduce((a, l) => a + ((stand.levels[l.id] && stand.levels[l.id].stars) || 0), 0);
const endlosFrei = () => geschafft(N);
const figur = () => stand.char.kind || 'boy';

// ====================================================================== Ton
const A = createAudio(() => stand.settings.sound);
function tonStart() { A.resume(); }

// ====================================================================== 3D
const canvas = $('#c');
let R = null;
try { R = createRenderer(canvas, { aa: !(navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4 && matchMedia('(pointer: coarse)').matches) }); }
catch (e) { R = null; }
function groesse() { const g = $('#game'); if (R) R.resize(g.clientWidth, g.clientHeight); }
new ResizeObserver(groesse).observe($('#game'));
addEventListener('resize', groesse);

// ====================================================================== Spielzustand
// start | menu | wahl | karte | awards | garage | bereit | play | pause | ende | ergebnis
let zustand = 'start';
let sim = null, level = null, run = null, menuLevelId = 1;
const prev = { x: 0, y: 0, z: 0, t: 0 };
let akku = 0, letzteZeit = 0, zeitGesamt = 0, endeZeit = 0;
let herausforderung = null;
let ergebnis = null;
const cmdQueue = [];
let wahlSel = 'boy', gKind = 'boy';
const awardWarteschlange = [];

const HINT = {
  rock: 'Fels voraus: wechsle die Spur.', mud: 'Schlamm bremst dich ab.',
  rhino: 'Achtung Nashorn! Es rennt in der markierten Spur auf dich zu. Wechsle die Spur.',
  monkey: 'Der Affe schwingt hin und her: rutsch unter ihm durch oder weich in die freie Spur aus.',
  gate: 'Grünes Licht heißt: Tor offen. Bei Rot warten oder eine andere Spur nehmen.',
  boulder: 'Ein Fels rollt in der markierten Spur auf dich zu. Wechsle die Spur.',
  water: 'Wasser! Bleib auf dem Weg und spring über Lücken.',
  walklog: 'Lauf die Rampe hoch: auf dem dicken Stamm kommst du über das Wasser.',
  wind: 'Windzone: Du bist hier etwas langsamer. Die Hindernisse bleiben, wo sie sind.',
  elephant: 'Elefanten sind langsam, aber riesig. Such die freie Spur.',
  coco: 'Roter Kreis am Boden: Hier fällt gleich eine Kokosnuss.'
};
const URSACHE = {
  log: ['Über einen Baumstamm gestolpert', 'Wische kurz vor dem Stamm nach oben, um zu springen.'],
  hang: ['Am Ast angestoßen', 'Wische nach unten und rutsche unter dem Ast durch.'],
  rock: ['Gegen einen Felsen gelaufen', 'Felsen sind zu hoch zum Springen: wechsle die Spur.'],
  root: ['Über eine Wurzel gestolpert', 'Spring über die Wurzel oder wechsle die Spur.'],
  rhino: ['Vom Nashorn erwischt', 'Das Nashorn rennt in der markierten Spur. Wechsle sie rechtzeitig.'],
  boulder: ['Vom rollenden Fels erwischt', 'Der Fels rollt in einer Spur. Weich seitlich aus.'],
  elephant: ['Gegen einen Elefanten gelaufen', 'Elefanten sind langsam. Such die freie Spur.'],
  monkey: ['Mit dem Affen zusammengestoßen', 'Rutsche unter dem Affen durch oder lauf in die freie Spur.'],
  coco: ['Von einer Kokosnuss getroffen', 'Der rote Kreis zeigt, wo sie landet. Weich aus.'],
  gate: ['Am Steintor angestoßen', 'Grünes Licht heißt offen. Warte oder nimm eine andere Spur.'],
  water: ['Ins Wasser gefallen', 'Bleib auf dem Weg, springe über Lücken oder nutze die dicken Stämme.']
};

// ---------------------------------------------------------------- Lauf starten
function szeneVorbereiten(lv) {
  if (!R) return;
  R.leaveStage();
  R.setChar(figur(), stand.char.outfit);
  if (R.lvl === lv && !lv.endless) R.reset(); else { R.setLevel(lv); R.lvl = lv; }
}

// opts: { quick: Neustart ohne Zählen, endless: true, seed, daily }
function starteLauf(lv, opts = {}) {
  if (!R || !lv) return;
  if (run) flushStats();
  cmdQueue.length = 0;
  level = lv;
  const ld = lv.endless ? null : levelDaten(lv.id);
  const tut = ld && !ld.done && ld.fails === 0 && lv.tut && lv.tut.length ? { lane: true, jump: true, slide: true } : null;
  szeneVorbereiten(lv);
  sim = createSim(lv, { tut });
  prev.x = 0; prev.y = 0; prev.z = 0; prev.t = 0; akku = 0; letzteZeit = 0; endeZeit = 0;
  run = { id: lv.id, endless: !!lv.endless, seed: opts.seed || 0, daily: !!opts.daily, f: { rhino: 0, logs: 0, slides: 0 }, hintI: 0, cd: 0, cdMax: 0, cdText: '', tutOff: false, startet: false, counted: false, kombo: 0 };
  zustand = 'bereit';
  zeigeNur(null);
  if (!lv.endless) { stand.last = lv.id; menuLevelId = lv.id; speichern(); }
  hudZuruecksetzen();
  const erst = !opts.quick && !(ld && ld.tries > 0 && ld.done);
  zaehlerStart(opts.quick ? 0 : 3, erst ? 0.4 : 0.3);
  // Hinweis zum Level (nur solange nicht geschafft)
  if (ld && !ld.done && lv.tip && !tut) tipp(lv.tip, 6000);
  if (herausforderung && ((herausforderung.level === lv.id && !lv.endless) || (herausforderung.endless && lv.endless))) {
    const von = herausforderung.von || 'Jemand';
    banner(lv.endless ? von + ' ist ' + fmt(herausforderung.m) + ' m weit gekommen. Schaffst du mehr?' : von + ' hat Level ' + lv.id + ' mit ' + fmt(herausforderung.p) + ' Punkten geschafft. Schlag das!');
  }
}
function starteLevel(id, opts) { const lv = LEVEL_BY_ID[id]; if (lv) starteLauf(lv, opts); }
function starteEndlos(daily) {
  const datum = heute(), seed = daily ? tagesSeed(datum) : 1 + Math.floor(Math.random() * 899999);
  starteLauf(endlessLevel(seed), { endless: true, seed, daily, quick: false });
}
function neustart() { if (!level) return; if (level.endless) starteLauf(endlessLevel(run.seed), { endless: true, seed: run.seed, daily: run.daily, quick: true }); else starteLauf(level, { quick: true }); }

// Zähler vor dem Start und nach der Pause: n Zahlen im Abstand schritt, dann „Los!“. n = 0: nur kurzes „Los!“ (schneller Neustart)
function zaehlerStart(n, schritt) {
  run.cdN = n; run.cdS = schritt; run.cd = n > 0 ? n * schritt : 0.45; run.cdText = '';
}
function grossText(txt, klein) {
  const g = $('#gross'); g.hidden = false; g.textContent = txt; g.classList.remove('aus'); g.classList.toggle('klein', !!klein);
  g.style.animation = 'none'; void g.offsetWidth; g.style.animation = '';
}
let losTimer = 0;
function zaehlerTakt(dt) {
  if (zustand !== 'bereit') return;
  run.cd -= dt;
  const txt = run.cdN === 0 ? 'Los!' : String(Math.max(1, Math.ceil(run.cd / run.cdS - 1e-6)));
  if (txt !== run.cdText) { run.cdText = txt; grossText(txt, txt === 'Los!'); if (txt !== 'Los!') A.zaehler(false); }
  if (run.cd <= 0) beginneLauf();
}
function beginneLauf() {
  if (zustand !== 'bereit') return;
  zustand = 'play'; akku = 0; letzteZeit = 0;
  A.zaehler(true);
  grossText('Los!', true); clearTimeout(losTimer); losTimer = setTimeout(() => { if (zustand === 'play') $('#gross').hidden = true; }, 550);
  if (!run.counted && !run.endless) { run.counted = true; levelDaten(run.id).tries++; }
  if (!run.startet) { run.startet = true; }
  if (stand.settings.music) A.musikStart();
  cmdQueue.length = 0;
}

// ---------------------------------------------------------------- Ein Simulationsschritt
function tick() {
  const s = sim.s;
  if (s.phase === 'lost') return;
  prev.x = s.x; prev.y = s.y; prev.z = s.z; prev.t = s.t;
  const cmd = zustand === 'play' ? cmdQueue.shift() || null : null;
  step(sim, cmd);
  ereignisse(s.log);
  s.log.length = 0;
  if (zustand === 'play') hinweise();
}
const stJetzt = () => { const s = sim.s; return { x: s.x, y: s.y, z: s.z, s, sek: s.t * DT }; };

function ereignisse(log) {
  const st = stJetzt(), s = sim.s;
  for (const e of log) {
    R.event(e, st);
    switch (e.e) {
      case 'lane': A.spur(); break;
      case 'jump': A.sprung(); break;
      case 'land': if (e.fall) A.landen(); break;
      case 'slide': A.rutschen(); break;
      case 'bump': A.anstoss(); break;
      case 'coin': run.kombo++; A.muenze(run.kombo % 9); hudMuenzen(); break;
      case 'hit': A.treffer(); herzen(true); blitz(false); vibrieren(40); pop('−1 Herz', 'schlecht'); break;
      case 'shield': A.schild(); pop('Schild gerettet!', 'gut'); vibrieren(15); break;
      case 'splash': A.platsch(); herzen(true); blitz(true); vibrieren(40); pop('Platsch! −1 Herz', 'schlecht'); break;
      case 'respawn': A.respawn(); prev.x = s.x; prev.y = s.y; prev.z = s.z; prev.t = s.t; break;
      case 'checkpoint': A.checkpoint(); pop('Checkpoint!', 'gold'); break;
      case 'power': A.power(e.k); pop(POWER_NAME[e.k] + '!', 'gold', e.k); break;
      case 'pwend': A.powerEnde(); break;
      case 'start': if (e.k === 'rhino') A.nashorn(); else if (e.k === 'boulder') A.fels(); else if (e.k === 'elephant') A.elefant(); break;
      case 'crack': A.kokos(); break;
      case 'ok': if (e.k === 'rhino' || e.k === 'boulder') run.kombo += 0; break;
      case 'tut': lehreZeigen(e.need); break;
      case 'tutdone': lehreVerstecken(true); break;
      case 'won': {
        zustand = 'ende'; endeZeit = zeitGesamt; A.musikStop(); A.sieg();
        grossText('GESCHAFFT!', false);
        break;
      }
      case 'lost': {
        zustand = 'ende'; endeZeit = zeitGesamt; A.musikStop(); A.verloren();
        grossText('AUS!', true); $('#gross').classList.add('aus');
        break;
      }
      default: break;
    }
  }
}

// Hinweise im Lauf (Tipps ohne Eingabe-Pause)
function hinweise() {
  const ld = level.endless ? null : levelDaten(level.id);
  if (!ld || ld.done || ld.fails >= 2) return;
  const tut = level.tut, s = sim.s;
  while (run.hintI < tut.length && s.z >= tut[run.hintI].z) {
    const t = tut[run.hintI++];
    if (!t.need && HINT[t.kind]) tipp(HINT[t.kind], 5200);
  }
}

// ---------------------------------------------------------------- Ende eines Laufs
function flushStats() {
  if (!run || !sim || run.flushed) return;
  const st = sim.s.stats;
  stand.stats.rhino += Math.max(0, st.dodge.rhino - run.f.rhino); stand.stats.logs += Math.max(0, st.logs - run.f.logs); stand.stats.slides += Math.max(0, st.slides - run.f.slides);
  run.f.rhino = st.dodge.rhino; run.f.logs = st.logs; run.f.slides = st.slides;
  speichern();
}
function auswerten() {
  const s = sim.s, lv = level, r = result(sim);
  stand.stats.runs++;
  flushStats();
  $('#gross').hidden = true;
  const gewonnen = s.phase === 'won';
  stand.coins += r.coins; stand.stats.coinsTotal += r.coins;
  if (lv.endless) return auswertenEndlos(r);
  const ld = levelDaten(lv.id);
  if (!gewonnen) {
    ld.fails++;
    const neu = evaluateAwards(stand, N, { level: lv.id, gewonnen: false, endless: false, dist: r.dist, unversehrt: false, sterne: 0, fails: ld.fails }, new Date());
    awardWarteschlange.push(...neu);
    speichern();
    ergebnis = { level: lv.id, r, gewonnen: false, why: s.cause || 'hearts', neu };
    return zeigeVerloren();
  }
  const erster = !ld.done;
  ld.done = true; ld.wins++; ld.stars = Math.max(ld.stars, r.sterne);
  ld.bestCoins = Math.max(ld.bestCoins, r.coins); ld.bestHearts = Math.max(ld.bestHearts, r.hearts); ld.bestPunkte = Math.max(ld.bestPunkte, r.punkte);
  ld.bestSek = ld.bestSek ? Math.min(ld.bestSek, Math.round(r.sek)) : Math.round(r.sek);
  let geschlagen = false;
  if (herausforderung && herausforderung.level === lv.id && !herausforderung.erledigt && r.punkte > herausforderung.p) { stand.stats.challengesWon++; herausforderung.erledigt = true; geschlagen = true; }
  const neu = evaluateAwards(stand, N, { level: lv.id, gewonnen: true, endless: false, dist: r.dist, unversehrt: r.unversehrt, sterne: r.sterne, fails: ld.fails, ersterSieg: erster }, new Date());
  speichern();
  ergebnis = { level: lv.id, r, gewonnen: true, erster, neu, geschlagen };
  awardWarteschlange.push(...neu);
  zeigeErgebnis();
}
function auswertenEndlos(r) {
  const dist = r.dist, neuRekord = dist > stand.endless.best;
  stand.endless.best = Math.max(stand.endless.best, dist);
  if (run.daily) { const d = heute(); if (stand.endless.tag.datum !== d) stand.endless.tag = { datum: d, best: 0 }; stand.endless.tag.best = Math.max(stand.endless.tag.best, dist); }
  let geschlagen = false;
  if (herausforderung && herausforderung.endless && !herausforderung.erledigt && dist > herausforderung.m) { stand.stats.challengesWon++; herausforderung.erledigt = true; geschlagen = true; }
  const neu = evaluateAwards(stand, N, { level: 0, gewonnen: false, endless: true, dist, unversehrt: false, sterne: 0, fails: 0 }, new Date());
  awardWarteschlange.push(...neu);
  speichern();
  ergebnis = { level: 0, endless: true, r, gewonnen: false, dist, neuRekord, geschlagen, neu, daily: run.daily };
  zeigeVerloren();
}

// ====================================================================== HUD
let hudHerzen = -1, hudM = -1;
function hudZuruecksetzen() {
  hudHerzen = -1; hudM = -1;
  const lv = level;
  $('#hud').hidden = false; $('#hud2').hidden = false;
  $('#gross').hidden = true; $('#pops').textContent = ''; $('#toasts').textContent = ''; $('#banner').hidden = true; $('#tipp').hidden = true;
  lehreVerstecken(false);
  $('#hLevel').textContent = lv.endless ? '∞' : lv.id; $('#hName').textContent = lv.endless ? (run.daily ? 'Tagesstrecke' : 'Endlos') : lv.name;
  $('#fort').hidden = !!lv.endless; $('#hDist').hidden = !lv.endless;
  $('#kraefte').textContent = ''; kraftEl = {};
  herzen(false); hudMuenzen();
}
function herzen(wackeln) {
  const h = sim ? sim.s.hearts : 3;
  if (h === hudHerzen && !wackeln) return;
  const box = $('#hHerzen');
  if (box.childElementCount !== 3) {
    box.textContent = '';
    for (let i = 0; i < 3; i++) box.appendChild(iconImg('heart', 24));
  }
  for (let i = 0; i < 3; i++) {
    const sp = box.children[i], voll = i < h;
    sp.setAttribute('class', voll ? 'voll' : 'leer');
    if (wackeln && !voll && i === h && !reduceMotion) { sp.classList.add('weg'); }
  }
  box.setAttribute('aria-label', h + ' von 3 Herzen');
  hudHerzen = h;
}
function hudMuenzen() { const v = sim ? sim.s.coins : 0; if (v !== hudM) { hudM = v; $('#hMuenzen').textContent = v; } }
let kraftEl = {};
function kraefteHud() {
  const s = sim.s, box = $('#kraefte');
  for (const k of Object.keys(POWER)) {
    const t = s.pw[k];
    if (t > 0) {
      let el = kraftEl[k];
      if (!el) {
        el = kraftEl[k] = document.createElement('div'); el.className = 'kraft'; el.style.color = POWER_COL[k];
        const cv = iconImg(k, 28);
        const nm = document.createElement('span'); nm.textContent = POWER_NAME[k]; nm.className = 'sr'; el.title = POWER_NAME[k];
        const bar = document.createElement('i'); bar.innerHTML = '<b></b>';
        el.append(cv, nm, bar); box.appendChild(el);
      }
      el.firstChild.nextSibling.nextSibling.firstChild.style.width = (t / POWER[k] * 100).toFixed(1) + '%';
      el.classList.toggle('knapp', t < 2.2);
    } else if (kraftEl[k]) { kraftEl[k].remove(); delete kraftEl[k]; }
  }
}
function pop(text, art, icon) {
  const d = document.createElement('div'); d.className = 'pop ' + (art || ''); if (icon) d.appendChild(iconImg(icon, 36)); d.append(text);
  $('#pops').appendChild(d); setTimeout(() => d.remove(), 1000);
}
function blitz(wasser) { if (reduceMotion) return; const f = $('#flash'); f.classList.toggle('wasser', !!wasser); f.classList.add('an'); requestAnimationFrame(() => requestAnimationFrame(() => f.classList.remove('an'))); }
function vibrieren(ms) { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) { /* optional */ } }
function toast(t, ms = 2400) { const el = document.createElement('div'); el.textContent = t; $('#toasts').appendChild(el); setTimeout(() => el.remove(), ms); }
let tippTimer = 0;
function tipp(t, ms) { const el = $('#tipp'); el.textContent = t; el.hidden = false; clearTimeout(tippTimer); tippTimer = setTimeout(() => { el.hidden = true; }, ms); }
function banner(t) { const b = $('#banner'); b.textContent = t; b.hidden = false; setTimeout(() => { b.hidden = true; }, 6500); }

// Einführung: erste Spurwechsel / Sprünge / Rutschen werden mit Verlangsamung geführt
const PF = {
  l: '<svg class="pl" viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  r: '<svg class="pr" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  o: '<svg class="po" viewBox="0 0 24 24"><path d="M5 15l7-7 7 7" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  u: '<svg class="pu" viewBox="0 0 24 24"><path d="M5 9l7 7 7-7" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>'
};
function lehreZeigen(need) {
  if (run.tutOff) { sim.s.tutNow = null; return; }
  const T = {
    lane: [PF.l + PF.r, 'Wische nach links oder rechts', '<kbd>←</kbd><kbd>→</kbd> oder <kbd>A</kbd><kbd>D</kbd>'],
    jump: [PF.o, 'Wische nach oben: Springen!', '<kbd>↑</kbd> oder <kbd>W</kbd> oder <kbd>Leertaste</kbd>'],
    slide: [PF.u, 'Wische nach unten: Rutschen!', '<kbd>↓</kbd> oder <kbd>S</kbd>']
  }[need];
  if (!T) return;
  $('#lehrePfeile').innerHTML = T[0];
  $('#lehreText').innerHTML = '<span class="touch">' + T[1] + '</span><span class="tasten">' + T[2] + '</span>';
  $('#lehre').hidden = false;
}
function lehreVerstecken(lob) {
  const el = $('#lehre'); if (!el.hidden && lob) { pop('Super!', 'gut'); }
  el.hidden = true;
}
$('#lehreSkip').addEventListener('click', () => { if (!sim) return; run.tutOff = true; sim.s.tutOn = null; sim.s.tutNow = null; lehreVerstecken(false); });

function aktualisiereHud(st) {
  const s = sim.s;
  herzen(false); hudMuenzen(); kraefteHud();
  if (level.endless) { $('#hMeter').textContent = Math.floor(st.z); }
  else { $('#fBar').style.width = (clamp(st.z / level.len, 0, 1) * 100).toFixed(1) + '%'; }
  void s;
}

// ====================================================================== Hauptschleife
const fpsMess = { n: 0, sum: 0 };
function adaptiv(dt) {
  if (zustand !== 'play') return;
  fpsMess.n++; fpsMess.sum += dt;
  if (fpsMess.n < 80) return;
  const mittel = fpsMess.sum / fpsMess.n; fpsMess.n = 0; fpsMess.sum = 0;
  const q = R.quality;
  if (mittel > 0.026 && q.pr > 0.8) R.setQuality(Math.max(0.75, q.pr - 0.25));
  else if (mittel > 0.034 && q.deco) R.setQuality(undefined, 0);
}
const BUEHNE = new Set(['menu', 'wahl', 'garage']);
function frame(now) {
  requestAnimationFrame(frame);
  if (!R) return;
  const dt = Math.min(0.1, letzteZeit ? (now - letzteZeit) / 1000 : 0.016); letzteZeit = now; zeitGesamt += dt;
  if (BUEHNE.has(zustand)) {
    R.stageFrame({ mode: zustand === 'wahl' ? 'choose' : zustand === 'garage' ? 'garage' : 'menu', sel: zustand === 'wahl' ? wahlSel : zustand === 'garage' ? gKind : figur() }, dt);
    return;
  }
  if (zustand === 'karte' || zustand === 'awards' || !sim) return;
  if (zustand === 'bereit') zaehlerTakt(dt);
  if (zustand === 'play' || zustand === 'ende') {
    akku += dt;
    let n = 0;
    while (akku >= DT && n < 5) { tick(); akku -= DT; n++; if (zustand !== 'play' && zustand !== 'ende') break; }
    if (n === 5) akku = 0;
  }
  adaptiv(dt);
  const s = sim.s, a = zustand === 'play' || zustand === 'ende' || zustand === 'pause' ? clamp(akku / DT, 0, 1) : 1;
  const st = { x: prev.x + (s.x - prev.x) * a, y: prev.y + (s.y - prev.y) * a, z: prev.z + (s.z - prev.z) * a, s, sek: (prev.t + (s.t - prev.t) * a) * DT };
  R.frame(st, dt);
  if (zustand === 'play' || zustand === 'ende' || zustand === 'bereit') aktualisiereHud(st);
  if (zustand === 'ende' && zeitGesamt - endeZeit > (sim.s.phase === 'won' ? 1.5 : 0.85) && !ergebnisOffen()) auswerten();
}
const ergebnisOffen = () => ['#oErgebnis', '#oVerloren', '#oAward'].some((s) => !$(s).hidden);

// ====================================================================== Bildschirme
const SCREENS = ['#sMenu', '#sWahl', '#sKarte', '#sAwards', '#sGarage', '#oHilfe', '#oPause', '#oErgebnis', '#oVerloren', '#oAward', '#oEndlos'];
function zeigeNur(sel) {
  for (const s of SCREENS) $(s).hidden = s !== sel;
  if (sel) { const el = $(sel); el.classList.add('sperre'); setTimeout(() => el.classList.remove('sperre'), 400); }
}
function hudAus() {
  $('#hud').hidden = true; $('#hud2').hidden = true; $('#gross').hidden = true; $('#tipp').hidden = true; $('#banner').hidden = true; $('#kraefte').textContent = ''; kraftEl = {}; lehreVerstecken(false); $('#pops').textContent = '';
}
function zumMenu() {
  if (run && (zustand === 'play' || zustand === 'pause' || zustand === 'bereit' || zustand === 'ende')) flushStats();
  A.musikStop(); cmdQueue.length = 0;
  hudAus();
  if (R) {
    const lv = LEVEL_BY_ID[menuLevelId] || LEVEL_BY_ID[1];
    if (R.lvl !== lv) { R.setLevel(lv); R.lvl = lv; }
    R.setChar(figur(), stand.char.outfit);
  }
  sim = null; run = null;
  zustand = 'menu';
  zeigeNur('#sMenu');
  baueMenu();
  if (herausforderung && herausforderung.award) { const a = AWARD_BY_ID[herausforderung.award]; if (a) { toast((herausforderung.von || 'Jemand') + ' hat „' + a.name + '“ geholt. Schaffst du das auch?', 6000); herausforderung.award = null; } }
}
function baueMenu() {
  const n = naechstesOffenes(), g = LEVELS.filter((l) => geschafft(l.id)).length;
  $('#mSpielenText').textContent = g ? (g >= N ? 'Spielen: Level ' + N : 'Weiter: Level ' + n) : 'Spielen';
  $('#mLevelZahl').textContent = g + ' / ' + N;
  $('#mAwardsZahl').textContent = Object.keys(stand.awards).length + ' / ' + AWARDS.length;
  $('#mMuenzen').textContent = stand.coins;
  $('#mEndlosZahl').textContent = endlosFrei() ? (stand.endless.best ? stand.endless.best + ' m' : '') : 'ab L' + N;
  $('#mEndlos').setAttribute('aria-disabled', endlosFrei() ? 'false' : 'true'); $('#mEndlos').style.opacity = endlosFrei() ? '' : '.6';
  tonKnoepfe();
}
function tonKnoepfe() {
  const an = stand.settings.sound, mu = stand.settings.music;
  $('#mTon').innerHTML = `<img src="${iconUrl(an ? 'soundOn' : 'soundOff')}" width="46" height="46" alt="" draggable="false">`;
  $('#mTon').setAttribute('aria-label', an ? 'Ton aus' : 'Ton an');
  $('#mMusik').innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18V6l10-2v12" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><circle cx="6.5" cy="18" r="2.6" fill="currentColor"/><circle cx="16.5" cy="16" r="2.6" fill="currentColor"/>' + (mu ? '' : '<path d="M3 3l18 18" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>') + '</svg>';
  $('#mMusik').setAttribute('aria-label', mu ? 'Musik aus' : 'Musik an');
  $('#pTon').textContent = an ? 'Ton aus' : 'Ton an'; $('#pMusik').textContent = mu ? 'Musik aus' : 'Musik an';
}
function tonUmschalten() { stand.settings.sound = !stand.settings.sound; speichern(); tonStart(); A.setOn(stand.settings.sound); tonKnoepfe(); }
function musikUmschalten() {
  stand.settings.music = !stand.settings.music; speichern(); tonKnoepfe();
  if (stand.settings.music && (zustand === 'play' || zustand === 'pause')) { if (zustand === 'play') A.musikStart(); } else A.musikStop();
}

// ---------- Figurenwahl
function zeigeWahl(danach) {
  wahlSel = stand.char.kind || 'boy';
  zustand = 'wahl'; hudAus(); zeigeNur('#sWahl');
  wahlKnoepfe();
  wahlDanach = danach;
}
let wahlDanach = null;
function wahlKnoepfe() { $('#wJunge').setAttribute('aria-pressed', wahlSel === 'boy'); $('#wMaedchen').setAttribute('aria-pressed', wahlSel === 'girl'); }
function wahlBestaetigen() {
  stand.char.kind = wahlSel; speichern();
  const f = wahlDanach; wahlDanach = null;
  if (f) f(); else zumMenu();
}

// ---------- Levelkarte
const stern = (an) => `<img class="ico" src="${iconUrl(an ? 'star' : 'starOff')}" width="24" height="24" alt="" draggable="false">`;
const sterneHtml = (n) => Array.from({ length: 3 }, (_, i) => stern(i < n)).join('');
const HEX = (n) => '#' + n.toString(16).padStart(6, '0');
function zeigeKarte() {
  zustand = 'karte'; hudAus(); zeigeNur('#sKarte');
  const liste = $('#kListe'); liste.textContent = '';
  const g = LEVELS.filter((l) => geschafft(l.id)).length;
  $('#kZahl').textContent = g + '/' + N + ' · ' + sterneGesamt() + ' ★';
  WORLDS.forEach((w, wi) => {
    const sec = document.createElement('section'); sec.className = 'welt';
    const sub = w.sub || '';
    const ws = LEVELS.filter((l) => l.world === wi).reduce((a, l) => a + ((stand.levels[l.id] && stand.levels[l.id].stars) || 0), 0);
    sec.innerHTML = '<h3><span class="k" style="background:' + HEX(w.ground) + '"></span>Welt ' + (wi + 1) + ': ' + w.name + '</h3><p>' + sub + ' · ' + ws + ' von 18 Sternen</p>';
    const grid = document.createElement('div'); grid.className = 'lgrid';
    for (const l of LEVELS.filter((x) => x.world === wi)) {
      const ld = stand.levels[l.id], frei = freigeschaltet(l.id);
      const b = document.createElement('button'); b.type = 'button';
      b.className = 'ltile' + (ld && ld.done ? ' geschafft' : frei ? ' offen' : ' zu');
      b.disabled = !frei;
      b.setAttribute('aria-label', 'Level ' + l.id + ' ' + l.name + (ld && ld.done ? ', geschafft, ' + ld.stars + ' Sterne' : frei ? ', offen' : ', gesperrt'));
      b.innerHTML = '<b>' + l.id + '</b><small>' + l.name + '</small>';
      if (ld && ld.done) { const st = document.createElement('span'); st.className = 'sterne'; st.innerHTML = sterneHtml(ld.stars); b.appendChild(st); }
      else if (!frei) { const sm = document.createElement('span'); sm.innerHTML = '<svg class="lock" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2" fill="currentColor"/><path d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" stroke-width="2"/></svg>'; b.appendChild(sm); }
      b.addEventListener('click', () => { tonStart(); A.klick(); starteLevel(l.id); });
      grid.appendChild(b);
    }
    sec.appendChild(grid); liste.appendChild(sec);
  });
  const ek = document.createElement('section'); ek.className = 'endkarte';
  ek.innerHTML = '<div><h3>Endlosmodus</h3><p></p></div>';
  ek.querySelector('p').textContent = endlosFrei() ? 'Immer weiter laufen. Rekord: ' + stand.endless.best + ' m' : 'Wird nach Level ' + N + ' freigeschaltet.';
  const eb = document.createElement('button'); eb.type = 'button'; eb.className = 'btn'; eb.textContent = endlosFrei() ? 'Starten' : 'Gesperrt'; eb.disabled = !endlosFrei();
  eb.addEventListener('click', () => { tonStart(); A.klick(); zeigeEndlos(); });
  ek.appendChild(eb); liste.appendChild(ek);
}
function zeigeEndlos() {
  if (!endlosFrei()) { toast('Der Endlosmodus wird nach Level ' + N + ' freigeschaltet.'); return; }
  zustand = 'menu'; zeigeNur('#oEndlos');
  $('#endSub').textContent = 'Rekord: ' + stand.endless.best + ' m. Das Tempo steigt langsam.';
  const heuteBest = stand.endless.tag.datum === heute() ? stand.endless.tag.best : 0;
  $('#endTagRekord').textContent = heuteBest ? 'Heute: ' + heuteBest + ' m' : 'Für alle gleich';
}

// ---------- Awards
function zeigeAwards() {
  zustand = 'awards'; hudAus(); zeigeNur('#sAwards');
  const liste = $('#aListe'); liste.textContent = '';
  const p = progressOf(stand, N);
  $('#aZahl').textContent = Object.keys(stand.awards).length + ' / ' + AWARDS.length;
  const sortiert = [...AWARDS].sort((a, b) => (!!stand.awards[b.id] - !!stand.awards[a.id]));
  for (const a of sortiert) {
    const da = stand.awards[a.id];
    const k = document.createElement('button'); k.type = 'button'; k.className = 'akarte' + (da ? ' da' : '');
    const cv = document.createElement('canvas'); cv.width = 128; cv.height = 128;
    drawAwardIcon(cv.getContext('2d'), a, 64, 64, 120, !da);
    const t = document.createElement('div'), r = RARITY[a.rarity];
    t.innerHTML = '<b></b><span class="r"></span><p></p>';
    t.querySelector('b').textContent = a.name;
    const rs = t.querySelector('.r'); rs.textContent = r.name; rs.style.color = r.color;
    t.querySelector('p').textContent = a.desc;
    if (da) { const tm = document.createElement('time'); tm.dateTime = da.at; tm.textContent = 'Freigeschaltet am ' + new Date(da.at).toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' }); t.appendChild(tm); }
    else if (a.prog) {
      const [ist, soll] = a.prog(p, N);
      const bar = document.createElement('div'); bar.className = 'bar'; bar.innerHTML = '<i></i>'; bar.firstChild.style.width = clamp(ist / soll * 100, 0, 100) + '%';
      const z = document.createElement('small'); z.textContent = ist + ' / ' + soll; t.append(bar, z);
    }
    k.append(cv, t);
    if (da) k.addEventListener('click', () => awardPopup({ award: a, alt: true }, () => zeigeAwards())); else k.disabled = true;
    liste.appendChild(k);
  }
}

// ---------- Kleiderschrank
function zeigeGarage() {
  if (zustand !== 'garage') gKind = figur();
  zustand = 'garage'; hudAus(); zeigeNur('#sGarage');
  garageBauen();
}
function garageBauen() {
  $('#gName').value = stand.settings.name;
  $('#gJunge').setAttribute('aria-pressed', gKind === 'boy'); $('#gMaedchen').setAttribute('aria-pressed', gKind === 'girl');
}

// ---------- Pause
function pause() {
  if (zustand !== 'play' && zustand !== 'bereit') return;
  if (zustand === 'bereit' && !run.startet) { /* vor dem ersten Start: Pause ist trotzdem erlaubt */ }
  zustand = 'pause'; cmdQueue.length = 0; drag = null;
  A.musikStop();
  zeigeNur('#oPause');
  setTimeout(() => $('#pWeiter').focus(), 30);
}
function weiter() {
  if (zustand !== 'pause') return;
  zeigeNur(null); akku = 0; letzteZeit = 0;
  zustand = 'bereit'; zaehlerStart(3, 0.3);
  if (stand.settings.music) A.musikStart();
}

// ---------- Ergebnis
function zeigeErgebnis() {
  const e = ergebnis, l = LEVEL_BY_ID[e.level], r = e.r;
  zustand = 'ergebnis'; A.musikStop();
  $('#hErgebnis').textContent = e.erster ? 'Geschafft!' : 'Im Ziel!';
  $('#eLevel').textContent = 'Level ' + l.id + ' · ' + l.name;
  const sv = $('#eSterne'); sv.textContent = '';
  for (let i = 0; i < 3; i++) { const sp = document.createElement('span'); sp.innerHTML = stern(i < r.sterne); sv.appendChild(sp); }
  sv.setAttribute('aria-label', r.sterne + ' von 3 Sternen');
  const fl = starFlags(l, sim.s);
  const kr = $('#eKriterien'); kr.textContent = '';
  [['Ziel erreicht', true], ['Mindestens ' + l.starCoins + ' Münzen (' + r.coins + '/' + r.coinsGesamt + ')', fl[1]], ['Mit mindestens ' + (l.starHearts || 2) + ' Herzen im Ziel', fl[2]]].forEach(([t, ok], i) => {
    const d = document.createElement('div'); d.className = ok ? 'ja' : ''; d.innerHTML = stern(ok); d.append(document.createTextNode(t)); kr.appendChild(d); void i;
  });
  $('#eHerzen').textContent = r.hearts; $('#eMuenzen').textContent = r.coins; $('#eZeit').textContent = fmtZeit(r.sek);
  const ms = [];
  if (e.geschlagen) ms.push('Herausforderung geschlagen!');
  if (r.unversehrt) ms.push('Ohne Treffer');
  ms.push(fmt(r.punkte) + ' Punkte');
  ms.push('+' + r.coins + ' Münzen');
  $('#eStats').textContent = ms.join(' · ');
  const ar = $('#eAwards'); ar.textContent = '';
  for (const a of e.neu) {
    const b = document.createElement('button'); b.type = 'button';
    const cv = document.createElement('canvas'); cv.width = 64; cv.height = 64; drawAwardIcon(cv.getContext('2d'), a, 32, 32, 60, false);
    b.append(cv, document.createTextNode(a.name));
    b.addEventListener('click', () => awardPopup({ award: a, alt: true }, () => zeigeNur('#oErgebnis')));
    ar.appendChild(b);
  }
  const naechstes = LEVEL_BY_ID[e.level + 1];
  const wb = $('#eWeiter'); wb.hidden = !naechstes;
  $('#eStatus').textContent = 'Spielstand auf diesem Gerät gespeichert';
  const danach = () => { zeigeNur('#oErgebnis'); setTimeout(() => (naechstes ? $('#eWeiter') : $('#eNochmal')).focus(), 30); };
  if (awardWarteschlange.length) zeigeNaechstenAward(danach); else danach();
}
function zeigeVerloren() {
  const e = ergebnis, r = e.r;
  zustand = 'ergebnis'; A.musikStop();
  const [grund, tippText] = URSACHE[e.why || (sim.s.cause)] || ['Keine Herzen mehr', 'Versuch es noch einmal. Du wirst jedes Mal besser!'];
  $('#hVerloren').textContent = e.endless ? 'Lauf beendet' : 'Keine Herzen mehr';
  $('#vGrund').textContent = grund;
  $('#vTipp').textContent = e.endless ? '' : tippText;
  const zw = $('#vZahlen'); zw.hidden = !e.endless;
  if (e.endless) { $('#vMeter').textContent = e.dist; $('#vMuenzen').textContent = r.coins; $('#vRekord').textContent = stand.endless.best; $('#vTipp').textContent = e.neuRekord ? 'Neuer Rekord!' : (e.geschlagen ? 'Herausforderung geschlagen!' : ''); }
  const ld = e.endless ? null : levelDaten(e.level);
  const tb = $('#vTipp2'); tb.hidden = !(ld && ld.fails >= 10 && LEVEL_BY_ID[e.level].tip);
  tb.onclick = () => { $('#vTipp').textContent = LEVEL_BY_ID[e.level].tip; tb.hidden = true; };
  $('#vTeilen').hidden = !e.endless; $('#vStatus').textContent = '';
  const danach = () => { zeigeNur('#oVerloren'); setTimeout(() => $('#vNochmal').focus(), 30); };
  if (awardWarteschlange.length) zeigeNaechstenAward(danach); else danach();
}

// ---------- Awards: Popup & Teilen
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
    $('#hAward').textContent = a.name; $('#awZitat').textContent = a.share; $('#awFrage').textContent = 'Kannst du mich schlagen?';
    if (!info.alt) A.award();
  } else if (info.endless) {
    drawKid(c, figur(), OUTFIT_BY_ID[stand.char.outfit], 110, 330, 300);
    c.fillStyle = '#fff'; c.font = '800 110px "Barlow Condensed", Arial Narrow, sans-serif'; c.textAlign = 'center'; c.fillText(String(info.m), 290, 200);
    c.font = '700 40px "Barlow", sans-serif'; c.fillText('Meter', 290, 250);
    $('#awArt').textContent = 'Herausforderung'; $('#awArt').style.color = '#FF9200';
    $('#hAward').textContent = fmt(info.m) + ' m im Endlosmodus'; $('#awZitat').textContent = 'Ich bin im Endlosmodus ' + fmt(info.m) + ' Meter weit gekommen.'; $('#awFrage').textContent = 'Kannst du mich schlagen?';
  } else {
    const l = LEVEL_BY_ID[info.level];
    drawKid(c, figur(), OUTFIT_BY_ID[stand.char.outfit], 110, 330, 300);
    c.fillStyle = '#fff'; c.font = '800 100px "Barlow Condensed", Arial Narrow, sans-serif'; c.textAlign = 'center'; c.fillText(fmt(info.p), 290, 190);
    c.font = '700 38px "Barlow", sans-serif'; c.fillText('Punkte', 290, 236);
    $('#awArt').textContent = 'Herausforderung'; $('#awArt').style.color = '#FF9200';
    $('#hAward').textContent = 'Level ' + l.id + ' mit ' + fmt(info.p) + ' Punkten';
    $('#awZitat').textContent = 'Ich habe Level ' + l.id + ' („' + l.name + '“) mit ' + info.s + ' von 3 Sternen geschafft.'; $('#awFrage').textContent = 'Kannst du mich schlagen?';
  }
  setTimeout(() => $('#awTeilen').focus(), 40);
}
function teilenLink(info) {
  const base = (document.querySelector('link[rel=canonical]') || location).href.split('?')[0];
  const u = new URL(base);
  if (info.award) u.searchParams.set('award', info.award.id);
  else if (info.endless) { u.searchParams.set('endless', '1'); u.searchParams.set('m', String(info.m)); }
  else { u.searchParams.set('level', info.level); u.searchParams.set('p', String(info.p)); u.searchParams.set('s', String(info.s)); }
  if (stand.settings.name) u.searchParams.set('von', stand.settings.name);
  return u.toString();
}
function teilenText(info) {
  if (info.award) return info.award.share + ' Kannst du mich schlagen? JUNGLE RUNNER auf PlaySaal:';
  if (info.endless) return 'Ich bin im Endlosmodus ' + fmt(info.m) + ' Meter weit gekommen. Kannst du mich schlagen? JUNGLE RUNNER auf PlaySaal:';
  const l = LEVEL_BY_ID[info.level];
  return 'Ich habe Level ' + l.id + ' („' + l.name + '“) mit ' + fmt(info.p) + ' Punkten geschafft. Kannst du mich schlagen? JUNGLE RUNNER auf PlaySaal:';
}
let logoBild = null;
function logo() { if (!logoBild) { logoBild = new Image(); logoBild.src = '../brand/playsaal-logo-horizontal-dark.svg'; } return logoBild; }
const urlKurz = () => (document.querySelector('link[rel=canonical]') || location).href.split('?')[0].replace(/^https?:\/\//, '');
async function teilenBild(info) {
  await kidReady(figur());
  const lg = logo();
  if (!lg.complete) await new Promise((r) => { lg.onload = lg.onerror = r; setTimeout(r, 1500); });
  try { await Promise.all(['400 54px "Dela Gothic One"', '700 40px "Barlow"', '600 42px "Barlow"', '500 34px "Barlow"', '700 190px "Barlow Condensed"'].map((f) => document.fonts.load(f))); } catch (e) { /* Schriften optional */ }
  const cv = document.createElement('canvas'), name = stand.settings.name || '';
  const kid = { kind: figur(), outfit: OUTFIT_BY_ID[stand.char.outfit] };
  if (info.award) {
    const a = info.award, da = stand.awards[a.id];
    drawShareImage(cv, { award: a, kid, kicker: 'AWARD · ' + RARITY[a.rarity].name.toUpperCase(), titel: a.name, zeile: '„' + a.share + '“', name, logo: lg, url: urlKurz(), hinweis: da ? 'Freigeschaltet am ' + new Date(da.at).toLocaleDateString('de-DE') : '' });
  } else if (info.endless) {
    drawShareImage(cv, { zeitGross: fmt(info.m), unterZeit: 'Meter im Endlosmodus', kid, kicker: 'HERAUSFORDERUNG', titel: 'Kannst du weiter laufen?', zeile: 'Jungle Runner · Endlosmodus', name, logo: lg, url: urlKurz(), hinweis: 'Auf meinem Gerät erspielt (nicht serverseitig geprüft)', einladung: 'Spiel gegen mich – ohne Anmeldung!' });
  } else {
    const l = LEVEL_BY_ID[info.level];
    drawShareImage(cv, { zeitGross: fmt(info.p), unterZeit: 'Punkte · Level ' + l.id + ' · ' + l.name, kid, kicker: 'HERAUSFORDERUNG', titel: 'Kannst du das schlagen?', zeile: '★'.repeat(info.s) + '☆'.repeat(3 - info.s) + '  Level ' + l.id + ' geschafft', name, logo: lg, url: urlKurz(), hinweis: 'Auf meinem Gerät erspielt (nicht serverseitig geprüft)', einladung: 'Spiel gegen mich – ohne Anmeldung!' });
  }
  return new Promise((ok) => cv.toBlob((b) => ok(b), 'image/png'));
}
function geteilt() {
  stand.stats.shared = (stand.stats.shared || 0) + 1;
  const neu = evaluateAwards(stand, N, null, new Date()); speichern();
  if (neu.length) { awardWarteschlange.push(...neu); toast('Award: ' + neu.map((a) => a.name).join(', ')); }
}
const dateiName = (info) => 'jungle-runner-' + (info.award ? info.award.id : info.endless ? 'endlos' : 'level-' + info.level) + '.png';
async function aktionTeilen(statusSel = '#awStatus') {
  const info = popupInfo, st = $(statusSel), url = teilenLink(info), text = teilenText(info);
  st.textContent = 'Bild wird erstellt …';
  let blob = null;
  try { blob = await teilenBild(info); } catch (e) { blob = null; }
  const datei = blob ? new File([blob], dateiName(info), { type: 'image/png' }) : null;
  try {
    if (navigator.share) {
      const mitBild = datei && navigator.canShare && navigator.canShare({ files: [datei] });
      await navigator.share(mitBild ? { files: [datei], title: 'JUNGLE RUNNER', text: text + ' ' + url } : { title: 'JUNGLE RUNNER', text, url });
      st.textContent = 'Geteilt!'; geteilt(); return;
    }
  } catch (e) { if (e && e.name === 'AbortError') { st.textContent = ''; return; } }
  const kopiert = await kopieren(text + ' ' + url);
  if (blob) herunterladen(blob, datei.name);
  st.textContent = (kopiert ? 'Link kopiert' : 'Link: ' + url) + (blob ? ' · Bild gespeichert' : '');
  geteilt();
}
async function aktionBild() {
  const st = $('#awStatus'); st.textContent = 'Bild wird erstellt …';
  const blob = await teilenBild(popupInfo).catch(() => null);
  if (!blob) { st.textContent = 'Bild konnte nicht erstellt werden.'; return; }
  herunterladen(blob, dateiName(popupInfo)); st.textContent = 'Bild gespeichert.';
}
async function aktionLink() {
  const info = popupInfo, url = teilenLink(info);
  const ok = await kopieren(teilenText(info) + ' ' + url);
  $('#awStatus').textContent = ok ? 'Link kopiert – ab damit in den Gruppenchat!' : url;
  if (ok) geteilt();
}
async function kopieren(t) {
  try { await navigator.clipboard.writeText(t); return true; } catch (e) { /* Fallback */ }
  try { const ta = document.createElement('textarea'); ta.value = t; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); const ok = document.execCommand('copy'); ta.remove(); return ok; } catch (e) { return false; }
}
function herunterladen(blob, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000); }
function popupSchliessen() { const z = popupZurueck; popupZurueck = null; if (z) z(); }

// ====================================================================== Eingabe
let drag = null;
function befehl(c) { if (zustand === 'play' && cmdQueue.length < 4) cmdQueue.push(c); }
const KEYMAP = { ArrowLeft: 'L', KeyA: 'L', ArrowRight: 'R', KeyD: 'R', ArrowUp: 'U', KeyW: 'U', Space: 'U', ArrowDown: 'D', KeyS: 'D' };
addEventListener('keydown', (e) => {
  if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  tonStart();
  const c = KEYMAP[e.code];
  if (c && (zustand === 'play' || zustand === 'bereit' || zustand === 'pause' || zustand === 'ende')) {
    if (zustand === 'play') { e.preventDefault(); if (!e.repeat) befehl(c); }
    else if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
    return;
  }
  if (e.code === 'KeyR') {
    if (level && (zustand === 'play' || zustand === 'bereit' || zustand === 'pause' || zustand === 'ende' || !$('#oVerloren').hidden || !$('#oErgebnis').hidden)) { e.preventDefault(); neustart(); }
    return;
  }
  if (e.key === 'Escape') {
    if (zustand === 'play') { e.preventDefault(); pause(); }
    else if (zustand === 'pause') { e.preventDefault(); weiter(); }
    else if (!$('#oAward').hidden) { e.preventDefault(); popupSchliessen(); }
    else if (!$('#oEndlos').hidden) { e.preventDefault(); zumMenu(); }
    else if (!$('#oHilfe').hidden) { e.preventDefault(); zumMenu(); }
    else if (['#sKarte', '#sAwards', '#sGarage'].some((s) => !$(s).hidden)) { e.preventDefault(); zumMenu(); }
    return;
  }
  if (e.code === 'KeyP' && (zustand === 'play' || zustand === 'bereit')) { pause(); return; }
  if ((e.key === 'Enter' || e.code === 'Space') && document.activeElement === document.body) {
    if (!$('#oVerloren').hidden) { e.preventDefault(); neustart(); }
    else if (!$('#oErgebnis').hidden) { e.preventDefault(); if ($('#eWeiter').hidden) neustart(); else $('#eWeiter').click(); }
  }
});
function touchModus() { if (!document.body.classList.contains('touch')) document.body.classList.add('touch'); }
if (matchMedia('(pointer: coarse)').matches || ('ontouchstart' in window && navigator.maxTouchPoints > 0)) document.body.classList.add('touch');
addEventListener('touchstart', touchModus, { passive: true, once: true });

// Wischen: sobald der Finger weit genug gezogen ist, wird sofort ausgelöst (kein Warten auf das Loslassen).
// Ein langer Wisch löst nur einen Befehl aus: weiteres Ziehen in dieselbe Richtung wird ignoriert (der Startpunkt läuft mit dem Finger mit).
// Erst eine andere Richtung (auch die Gegenrichtung oder ein Knick nach oben/unten) löst den nächsten Befehl aus.
const SWIPE_MIN = 22, SWIPE_MAX = 46;
function schwelle() { return clamp(Math.min(innerWidth, innerHeight) * 0.055, SWIPE_MIN, SWIPE_MAX); }
canvas.addEventListener('pointerdown', (e) => {
  tonStart();
  if (e.pointerType === 'touch') touchModus();
  if (zustand !== 'play' && zustand !== 'bereit') return;
  e.preventDefault();
  if (drag) return;
  drag = { id: e.pointerId, x: e.clientX, y: e.clientY, last: null };
  try { canvas.setPointerCapture(e.pointerId); } catch (x) { /* egal */ }
});
canvas.addEventListener('pointermove', (e) => {
  if (!drag || drag.id !== e.pointerId) return;
  if (zustand !== 'play') { drag.x = e.clientX; drag.y = e.clientY; drag.last = null; return; }
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y, ax = Math.abs(dx), ay = Math.abs(dy), th = schwelle();
  if (Math.max(ax, ay) < th) return;
  let c = null;
  if (ax > ay * 1.15) c = dx < 0 ? 'L' : 'R'; else if (ay > ax * 1.15) c = dy < 0 ? 'U' : 'D';
  if (!c) return;                                       // diagonal: weiter warten, bis die Richtung klar ist
  if (c !== drag.last) { befehl(c); drag.last = c; }
  drag.x = e.clientX; drag.y = e.clientY;
});
const ziehEnde = (e) => { if (drag && drag.id === e.pointerId) drag = null; };
canvas.addEventListener('pointerup', ziehEnde); canvas.addEventListener('pointercancel', ziehEnde); canvas.addEventListener('lostpointercapture', ziehEnde);
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('touchmove', (e) => { if (e.cancelable) e.preventDefault(); }, { passive: false });
addEventListener('blur', () => { drag = null; if (zustand === 'play') pause(); });
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { drag = null; if (zustand === 'play' || zustand === 'bereit') pause(); A.suspend(); }
  else if (stand.settings.sound && A.ctx) A.ctx.resume().catch(() => {});
  letzteZeit = 0;
});

// ---------- Vollbild
function vollbildMoeglich() { const d = document.documentElement; return !!(d.requestFullscreen || d.webkitRequestFullscreen); }
async function vollbild() {
  const d = document.documentElement;
  try {
    if (document.fullscreenElement || document.webkitFullscreenElement) { (document.exitFullscreen || document.webkitExitFullscreen).call(document); return; }
    await (d.requestFullscreen ? d.requestFullscreen({ navigationUI: 'hide' }) : d.webkitRequestFullscreen());
  } catch (e) { toast('Vollbild wird hier nicht unterstützt'); }
}
if (!vollbildMoeglich()) { $('#mVoll').hidden = true; $('#pVoll').hidden = true; }

// ---------- Knöpfe
const klick = (sel, fn) => $(sel).addEventListener('click', (e) => { tonStart(); A.klick(); fn(e); });
klick('#mSpielen', () => starteLevel(naechstesOffenes()));
klick('#mLevel', zeigeKarte);
klick('#mEndlos', zeigeEndlos);
klick('#mAwards', zeigeAwards);
klick('#mGarage', zeigeGarage);
klick('#mHilfe', () => { zustand = 'menu'; zeigeNur('#oHilfe'); });
klick('#hZu', zumMenu);
klick('#mTon', tonUmschalten);
klick('#mMusik', musikUmschalten);
klick('#mVoll', vollbild);
document.querySelectorAll('[data-zurueck]').forEach((b) => b.addEventListener('click', () => { A.klick(); zumMenu(); }));
klick('#wJunge', () => { wahlSel = 'boy'; wahlKnoepfe(); });
klick('#wMaedchen', () => { wahlSel = 'girl'; wahlKnoepfe(); });
klick('#wLos', wahlBestaetigen);
klick('#gJunge', () => { gKind = 'boy'; stand.char.kind = 'boy'; speichern(); garageBauen(); });
klick('#gMaedchen', () => { gKind = 'girl'; stand.char.kind = 'girl'; speichern(); garageBauen(); });
klick('#bNeu', () => neustart());
klick('#bPause', () => (zustand === 'pause' ? weiter() : pause()));
klick('#pWeiter', weiter);
klick('#pNeu', () => neustart());
klick('#pLevel', () => { if (run) flushStats(); A.musikStop(); zeigeKarte(); });
klick('#pTon', tonUmschalten);
klick('#pMusik', musikUmschalten);
klick('#pVoll', vollbild);
klick('#pMenu', zumMenu);
klick('#eWeiter', () => { const n = LEVEL_BY_ID[ergebnis.level + 1]; if (n) starteLevel(n.id); });
klick('#eNochmal', () => starteLevel(ergebnis.level));
klick('#eTeilen', () => { const r = ergebnis.r; awardPopup({ level: ergebnis.level, p: r.punkte, s: r.sterne }, () => zeigeNur('#oErgebnis')); });
klick('#eLevels', zeigeKarte);
klick('#eMenu', zumMenu);
klick('#vNochmal', () => neustart());
klick('#vTeilen', () => { awardPopup({ endless: true, m: ergebnis.dist }, () => zeigeNur('#oVerloren')); });
klick('#vLevels', zeigeKarte);
klick('#vMenu', zumMenu);
klick('#endZufall', () => starteEndlos(false));
klick('#endTag', () => starteEndlos(true));
klick('#endZu', zumMenu);
$('#awTeilen').addEventListener('click', () => { tonStart(); aktionTeilen(); });
$('#awBild').addEventListener('click', () => { A.klick(); aktionBild(); });
$('#awLink').addEventListener('click', () => { A.klick(); aktionLink(); });
klick('#awWeiter', popupSchliessen);
$('#gName').addEventListener('change', (e) => { const n = saubererName(e.target.value); stand.settings.name = n; e.target.value = n; speichern(); });
$('#oPause').addEventListener('click', (e) => { if (e.target === e.currentTarget) weiter(); });

// ====================================================================== Start
function startParameter() {
  const von = saubererName(PARAMS.get('von') || ''), zahlP = (k, max) => { const v = +PARAMS.get(k); return Number.isFinite(v) && v >= 1 && v <= max ? Math.round(v) : null; };
  const lv = +PARAMS.get('level'), award = PARAMS.get('award');
  if (LEVEL_BY_ID[lv]) {
    const p = zahlP('p', 99999);
    if (p) herausforderung = { level: lv, p, s: clamp(+PARAMS.get('s') | 0, 0, 3), von };
    return { level: lv };
  }
  if (PARAMS.get('endless') === '1') { const m = zahlP('m', 999999); if (m) herausforderung = { endless: true, m, von }; return { endless: true }; }
  if (award && AWARD_BY_ID[award]) herausforderung = { award, von };
  return null;
}
function weiterMitZiel(ziel) {
  if (ziel && ziel.level && freigeschaltet(ziel.level)) { starteLevel(ziel.level); return; }
  zumMenu();
  if (ziel && ziel.level) toast('Level ' + ziel.level + ' wird freigeschaltet, wenn du die Level davor geschafft hast.', 4500);
  else if (ziel && ziel.endless) { if (endlosFrei()) zeigeEndlos(); else toast('Der Endlosmodus wird nach Level ' + N + ' freigeschaltet.', 4500); }
}
// Ladebildschirm (steht im HTML, damit er sofort sichtbar ist) ausblenden, sobald Menü oder Figurenwahl dran ist.
function ladeEnde() {
  const el = $('#sLade'); if (!el || el.hidden) return;
  el.classList.add('weg'); setTimeout(() => { el.hidden = true; }, reduceMotion ? 0 : 450);
}
async function init() {
  if (!R) {
    $('#sMenu').hidden = false; ladeEnde(); $('#sMenu').querySelector('.menu-in').innerHTML = '<h1 class="titel"><img src="jungle-runner/assets/logo.webp" width="891" height="297" alt="JUNGLE RUNNER"></h1><p class="unter">Dein Browser kann leider kein WebGL. Probier einen aktuellen Browser oder ein anderes Gerät.</p><a class="btn" href="../">Andere Spiele</a>';
    return;
  }
  groesse();
  try { await Promise.race([Promise.all(['800 100px "Barlow Condensed"', '700 20px "Barlow"'].map((f) => document.fonts.load(f))), new Promise((r) => setTimeout(r, 1500))]); } catch (e) { /* Schriften optional */ }
  try { await Promise.race([R.texReady, new Promise((r) => setTimeout(r, 3000))]); } catch (e) { /* Texturen optional */ }
  setTimeout(logo, 2500);
  menuLevelId = stand.last && LEVEL_BY_ID[stand.last] ? stand.last : 1;
  const l0 = LEVEL_BY_ID[menuLevelId]; R.setLevel(l0); R.lvl = l0;
  kidReady('boy'); kidReady('girl');
  tonKnoepfe();
  const ziel = startParameter();
  requestAnimationFrame(frame);
  if (!stand.char.kind) zeigeWahl(() => weiterMitZiel(ziel)); else weiterMitZiel(ziel);
  ladeEnde();
}
init();

// ---------------------------------------------------------------- Testschnittstelle (nur mit ?test)
if (TEST) {
  window.__jr = {
    get zustand() { return zustand; }, get sim() { return sim; }, get stand() { return stand; }, get level() { return level; }, get run() { return run; }, get ergebnis() { return ergebnis; },
    get queue() { return cmdQueue; }, get herausforderung() { return herausforderung; },
    LEVELS, OUTFITS, AWARDS, R, A, starteLevel, starteLauf, starteEndlos, zumMenu, zeigeKarte, zeigeAwards, zeigeGarage, zeigeEndlos, zeigeWahl, pause, weiter, neustart, speichern,
    laden() { stand = ladeStand(); }, ladeAusRoh: (roh) => ladeAusRoh(roh, IDS), migriere, befehl, auswerten, awardPopup, teilenBild, teilenLink, aktionTeilen, awardWarteschlange, tick,
    beginne() { if (zustand === 'bereit') beginneLauf(); $('#gross').hidden = true; },
    // Eingaben [[tick, 'L'|'R'|'U'|'D'], …] schnell (ohne Echtzeit) abspielen
    spiele(inputs, maxTicks = 60 * 260) {
      if (zustand === 'bereit') this.beginne();
      let i = 0;
      for (let k = 0; k < maxTicks && (zustand === 'play' || zustand === 'ende') && sim.s.phase === 'run'; k++) {
        if (i < inputs.length && inputs[i][0] <= sim.s.t) { cmdQueue.push(inputs[i++][1]); }
        tick();
      }
      for (let k = 0; k < 400 && sim.s.phase === 'won' && sim.s.z < sim.s.finishZ + 1; k++) tick();
      return sim.s.phase;
    },
    schnell(n) { for (let k = 0; k < n && sim.s.phase === 'run'; k++) tick(); },
    info() { return R.info(); }
  };
}
