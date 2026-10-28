// SCHACH: Darstellung, Bedienung, Ton, Spielstand, Computergegner (im Web Worker) und Zu-zweit-Modus.
// Regeln und Suche stehen in engine.js. Aufbau wie DAME; Brett aus ../dame/img/, Gegner-Bilder aus ../muehle/img/,
// Figuren aus img/ (w = Weiß, s = Schwarz; k d t l s b). Fehlt ein Bild, zeichnet das Spiel einen Platzhalter.
import * as E from './engine.js?v=1';

const $ = (id) => document.getElementById(id);
const KEY = 'schach.v1';
const WENIG_BEWEGUNG = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
const URL_SPIEL = 'https://playsaal.com/spiele/schach';

export const GEGNER = {
  gemuetlich: { name: 'Opa Willi', stufe: 'Gemütlich', text: 'Spielt gern drauflos und lässt auch mal eine Figur hängen.', bild: 'gegner-gemuetlich', kurz: 'W', pause: 650 },
  geuebt: { name: 'Tante Gisela', stufe: 'Geübt', text: 'Spielt solide und nutzt deine Fehler aus.', bild: 'gegner-geuebt', kurz: 'G', pause: 500 },
  meister: { name: 'Professor Mühlberg', stufe: 'Meister', text: 'Rechnet tief voraus. Kein Zug zurück.', bild: 'gegner-meister', kurz: 'M', pause: 200 }
};
const STUFEN = Object.keys(GEGNER);
const FIG = ' bsltdk';            // Bildnamen je Figurentyp: Bauer, Springer, Läufer, Turm, Dame, König
const FIG_NAME = ['', 'Bauer', 'Springer', 'Läufer', 'Turm', 'Dame', 'König'];

// ---------- Speicherstand ----------
let store = { v: 1, sound: true, ichZuerst: true, stats: {}, zwei: 0, offen: null };
const ganz = (x, max) => Math.max(0, Math.min(max, Math.floor(Number(x) || 0)));
function laden() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!d || typeof d !== 'object') return;
    store.sound = d.sound !== false;
    store.ichZuerst = d.ichZuerst !== false;
    store.zwei = ganz(d.zwei, 1e6);
    for (const k of STUFEN) { const x = d.stats && d.stats[k]; if (x && typeof x === 'object') store.stats[k] = { s: ganz(x.s, 1e6), u: ganz(x.u, 1e6), n: ganz(x.n, 1e6) }; }
    const o = d.offen;
    if (o && typeof o === 'object' && (o.modus === 'ki' || o.modus === 'zwei') && typeof o.z === 'string' && E.partieAus(o.z)) {
      store.offen = { modus: o.modus, stufe: STUFEN.includes(o.stufe) ? o.stufe : 'gemuetlich', mensch: o.mensch === 2 ? 2 : 1, z: o.z };
    }
  } catch (e) {}
}
function speichern() { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) {} }
const stat = (k) => store.stats[k] || (store.stats[k] = { s: 0, u: 0, n: 0 });

// ---------- Bilder ----------
const BILDER = { 'brett': 'dame/img/brett.webp', 'gegner-gemuetlich': 'muehle/img/gegner-gemuetlich.webp', 'gegner-geuebt': 'muehle/img/gegner-geuebt.webp', 'gegner-meister': 'muehle/img/gegner-meister.webp' };
for (const f of 'ws') for (const t of 'kdtlsb') BILDER[f + t] = 'schach/img/' + f + t + '.webp';
const img = {};
for (const [n, src] of Object.entries(BILDER)) {
  const b = new Image(); b.decoding = 'async';
  b.onload = () => { img[n] = b; avatareAktualisieren(); };
  b.src = src;
}
const figBild = (v) => (v > 0 ? 'w' : 's') + FIG[Math.abs(v)];
function avatar(el, stufe) {
  const g = GEGNER[stufe];
  el.className = 'av'; el.style.backgroundImage = ''; el.style.backgroundSize = ''; el.textContent = g.kurz;
  if (img[g.bild]) { el.classList.add('bild'); el.style.backgroundImage = 'url(' + BILDER[g.bild] + ')'; }
}
function figurAvatar(el, p) {
  const n = p === 1 ? 'wk' : 'sk';
  el.className = 'av stein'; el.textContent = img[n] ? '' : (p === 1 ? '♔' : '♚'); el.style.backgroundSize = 'contain';
  el.style.backgroundImage = img[n] ? 'url(' + BILDER[n] + ')' : '';
}
const avatareAktualisieren = () => { if (partie) panels(); stufenListe(); };

// ---------- Ton ----------
const ton = (() => {
  let ac = null;
  const an = () => store.sound && ac;
  const piep = (f, d, typ = 'sine', vol = 0.12, gleit = 0, nach = 0) => {
    if (!an()) return; const t = ac.currentTime + nach, o = ac.createOscillator(), g = ac.createGain();
    o.type = typ; o.frequency.setValueAtTime(f, t); if (gleit) o.frequency.exponentialRampToValueAtTime(gleit, t + d);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g).connect(ac.destination); o.start(t); o.stop(t + d + 0.03);
  };
  return {
    start() { try { if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)(); if (ac.state === 'suspended') ac.resume(); } catch (e) {} },
    tock() { piep(210, 0.09, 'triangle', 0.16, 120); piep(900, 0.025, 'square', 0.02); },
    wahl() { piep(660, 0.05, 'sine', 0.05); },
    schlag() { piep(300, 0.12, 'triangle', 0.16, 140); piep(1200, 0.03, 'square', 0.03); },
    schach() { piep(880, 0.09, 'square', 0.04); piep(660, 0.12, 'square', 0.04, 0, 0.1); },
    nein() { piep(160, 0.1, 'square', 0.03); },
    sieg() { [523, 659, 784, 1047].forEach((f, i) => piep(f, 0.24, 'triangle', 0.1, 0, i * 0.11)); },
    verloren() { [440, 392, 330].forEach((f, i) => piep(f, 0.28, 'triangle', 0.08, 0, i * 0.16)); }
  };
})();

// ---------- Zustand ----------
let partie = null, modus = 'ki', stufe = 'gemuetlich', mensch = 1;
let wahl = -1, wahlZuege = [];   // angetipptes Feld und seine erlaubten Züge
let denkt = false, kiNr = 0, sperre = 0, vorbei = null, wackel = null;
let anim = null;                 // { v, von:[x,y], nach:[x,y], t0, dauer, feld }
let letzter = 0, letzterText = '', wartetUmw = null;

// ---------- Darstellung ----------
const cv = $('c'), cx = cv.getContext('2d');
let lay = { W: 0, H: 0, dpr: 1, x0: 0, y0: 0, gr: 0, f: 0, rand: 0 };
function groesse() {
  const b = $('brett').getBoundingClientRect(), dpr = Math.min(2.5, window.devicePixelRatio || 1);
  cv.width = Math.round(b.width * dpr); cv.height = Math.round(b.height * dpr);
  const rand = Math.max(6, Math.min(b.width, b.height) * 0.022);
  const gr = Math.max(120, Math.floor((Math.min(b.width, b.height) - rand * 2) / 8) * 8);
  lay = { W: b.width, H: b.height, dpr, gr, f: gr / 8, rand, x0: Math.round((b.width - gr) / 2), y0: Math.round((b.height - gr) / 2) };
}
addEventListener('resize', groesse);
const gedreht = () => modus === 'ki' && mensch === 2;
const ansicht = (i) => (gedreht() ? 63 - i : i);
const pos = (i) => { const j = ansicht(i); return [lay.x0 + ((j & 7) + 0.5) * lay.f, lay.y0 + ((j >> 3) + 0.5) * lay.f]; };

function feld(i, farbe, alpha) {
  const j = ansicht(i);
  cx.save(); cx.globalAlpha = alpha; cx.fillStyle = farbe; cx.fillRect(lay.x0 + (j & 7) * lay.f, lay.y0 + (j >> 3) * lay.f, lay.f, lay.f); cx.restore();
}
function brett() {
  const { x0, y0, gr, f, rand } = lay;
  cx.save();
  cx.shadowColor = 'rgba(0,0,0,.55)'; cx.shadowBlur = gr * 0.05; cx.shadowOffsetY = gr * 0.018;
  cx.fillStyle = '#5a361d'; cx.beginPath(); cx.roundRect ? cx.roundRect(x0 - rand, y0 - rand, gr + rand * 2, gr + rand * 2, rand) : cx.rect(x0 - rand, y0 - rand, gr + rand * 2, gr + rand * 2); cx.fill();
  cx.restore();
  // Das Dame-Brett ist oben links hell, wie beim Schach (a8 hell); gedreht gilt dasselbe (63 - i hat dieselbe Farbe)
  if (img.brett) cx.drawImage(img.brett, x0, y0, gr, gr);
  else for (let i = 0; i < 64; i++) { cx.fillStyle = ((i >> 3) + (i & 7)) & 1 ? '#6b4226' : '#e9cf9f'; cx.fillRect(x0 + (i & 7) * f, y0 + (i >> 3) * f, f, f); }
  cx.strokeStyle = 'rgba(40,20,5,.6)'; cx.lineWidth = 1; cx.strokeRect(x0 + 0.5, y0 + 0.5, gr - 1, gr - 1);
  // Koordinaten klein in den Randfeldern
  cx.save(); cx.font = '600 ' + Math.max(8, f * 0.2) + 'px "Barlow Condensed", system-ui, sans-serif';
  for (let k = 0; k < 8; k++) {
    const linieI = gedreht() ? 7 - k : k, reiheI = gedreht() ? k : 7 - k;   // Spalte k von links, Zeile k von oben
    cx.fillStyle = (7 + k) & 1 ? 'rgba(240,220,180,.85)' : 'rgba(80,45,20,.8)';
    cx.textAlign = 'right'; cx.textBaseline = 'bottom'; cx.fillText('abcdefgh'[linieI], x0 + (k + 1) * f - f * 0.06, y0 + gr - f * 0.03);
    cx.fillStyle = k & 1 ? 'rgba(240,220,180,.85)' : 'rgba(80,45,20,.8)';
    cx.textAlign = 'left'; cx.textBaseline = 'top'; cx.fillText(String(reiheI + 1), x0 + f * 0.06, y0 + k * f + f * 0.04);
  }
  cx.restore();
}
function figur(x, y, v, alpha = 1, skala = 1) {
  const f = lay.f * skala, n = figBild(v), im = img[n];
  cx.save(); cx.globalAlpha = alpha;
  if (im) {
    const h = f * 0.94, w = h * im.width / im.height;
    cx.beginPath(); cx.ellipse(x, y + f * 0.38, f * 0.3, f * 0.08, 0, 0, 7); cx.fillStyle = 'rgba(0,0,0,.28)'; cx.fill();
    cx.drawImage(im, x - w / 2, y + f * 0.42 - h, w, h);
  } else {
    cx.font = f * 0.8 + 'px serif'; cx.textAlign = 'center'; cx.textBaseline = 'middle';
    cx.fillStyle = v > 0 ? '#fff' : '#111'; cx.strokeStyle = v > 0 ? '#000' : '#fff'; cx.lineWidth = 1;
    const ch = ' ♙♘♗♖♕♔'[Math.abs(v)]; cx.fillText(ch, x, y); cx.strokeText(ch, x, y);
  }
  cx.restore();
}
const menschAmZug = () => partie && !vorbei && !denkt && !wartetUmw && (modus === 'zwei' || partie.s.am === mensch);

function zeichne(jetzt) {
  cx.setTransform(lay.dpr, 0, 0, lay.dpr, 0, 0);
  cx.clearRect(0, 0, lay.W, lay.H);
  if (!lay.gr) return;
  brett();
  if (!partie) return;
  const s = partie.s, b = s.b, puls = WENIG_BEWEGUNG ? 0.85 : 0.7 + 0.3 * Math.sin(jetzt / 180);
  if (letzter && !anim) { feld(E.von(letzter), '#FF9200', 0.25); feld(E.nach(letzter), '#FF9200', 0.38); }
  const hilfe = menschAmZug() && !anim;
  if (hilfe && wahl >= 0) feld(wahl, '#FFD21C', 0.45);
  // König im Schach: roter Schein
  if (!anim && E.imSchach(s)) {
    const [x, y] = pos(s.k[s.am]);
    const g = cx.createRadialGradient(x, y, lay.f * 0.05, x, y, lay.f * 0.62);
    g.addColorStop(0, 'rgba(255,40,30,.95)'); g.addColorStop(1, 'rgba(255,40,30,0)');
    cx.fillStyle = g; cx.fillRect(x - lay.f / 2, y - lay.f / 2, lay.f, lay.f);
  }
  // Figuren von oben nach unten (untere überdecken obere ein wenig)
  const reihe = [];
  for (let i = 0; i < 64; i++) if (b[i] && !(anim && i === anim.feld)) reihe.push(i);
  reihe.sort((a, c) => (ansicht(a) >> 3) - (ansicht(c) >> 3));
  for (const i of reihe) {
    const [x, y] = pos(i);
    let dx = 0; if (wackel && wackel.i === i) { const t = (jetzt - wackel.t0) / 300; if (t < 1) dx = Math.sin(t * 25) * lay.f * 0.06 * (1 - t); else wackel = null; }
    figur(x + dx, y, b[i]);
  }
  if (hilfe && wahl >= 0) for (const m of wahlZuege) {
    const t = E.nach(m), [x, y] = pos(t);
    cx.save(); cx.globalAlpha = 0.55 + puls * 0.4;
    if (b[t] || (E.art(m) & 1)) { cx.beginPath(); cx.arc(x, y, lay.f * 0.44, 0, 7); cx.strokeStyle = '#FFD21C'; cx.lineWidth = Math.max(2, lay.f * 0.08); cx.stroke(); }
    else { cx.beginPath(); cx.arc(x, y, lay.f * 0.15, 0, 7); cx.fillStyle = '#FFD21C'; cx.fill(); cx.strokeStyle = 'rgba(60,30,0,.6)'; cx.lineWidth = 1; cx.stroke(); }
    cx.restore();
  }
  if (anim) {
    const t = Math.max(0, Math.min(1, (jetzt - anim.t0) / anim.dauer)), e = 1 - Math.pow(1 - t, 3);
    figur(anim.von[0] + (anim.nach[0] - anim.von[0]) * e, anim.von[1] + (anim.nach[1] - anim.von[1]) * e - Math.sin(t * Math.PI) * lay.f * 0.12, anim.v, 1, 1 + Math.sin(t * Math.PI) * 0.06);
  }
}
function schleife(t) { zeichne(t); requestAnimationFrame(schleife); }

// ---------- Anzeige um das Brett ----------
function geschlagen(s, p) {   // von Spieler p geschlagene gegnerische Figuren (Typen), aus dem Startbestand berechnet
  const start = [0, 8, 2, 2, 2, 1, 0], da = [0, 0, 0, 0, 0, 0, 0], g = p === 1 ? -1 : 1;
  for (let i = 0; i < 64; i++) if (s.b[i] * g > 0) da[s.b[i] * g]++;
  const out = [];
  // Umwandlungen: zusätzliche Figuren gelten als „fehlender“ Bauer
  for (let t = 5; t >= 1; t--) { const fehlt = start[t] - da[t]; for (let k = 0; k < fehlt; k++) out.push(t); }
  return out;
}
function material(s, p) { let w = 0; for (let i = 0; i < 64; i++) { const v = s.b[i]; if (v && Math.abs(v) !== 6) w += (v > 0) === (p === 1) ? [0, 1, 3, 3, 5, 9][Math.abs(v)] : -[0, 1, 3, 3, 5, 9][Math.abs(v)]; } return w; }
function panels() {
  if (!partie) return;
  const s = partie.s;
  for (const ort of ['Oben', 'Unten']) {
    const p = ort === 'Unten' ? (modus === 'ki' ? mensch : 1) : (modus === 'ki' ? 3 - mensch : 2);
    const istKi = modus === 'ki' && p !== mensch;
    if (istKi) avatar($('av' + ort), stufe); else figurAvatar($('av' + ort), p);
    $('n' + ort).textContent = istKi ? GEGNER[stufe].name : modus === 'ki' ? 'Du' : (p === 1 ? 'Spieler Weiß' : 'Spieler Schwarz');
    const info = $('i' + ort);
    if (istKi && denkt) { info.textContent = 'überlegt …'; info.classList.add('denkt'); }
    else {
      const w = material(s, p);
      info.textContent = (istKi ? GEGNER[stufe].stufe + ' · ' : '') + (p === 1 ? 'Weiß' : 'Schwarz') + (w > 0 ? ' · +' + w : '') + (!vorbei && s.am === p && E.imSchach(s) ? ' · Schach!' : '');
      info.classList.remove('denkt');
    }
    $('sp' + ort).classList.toggle('dran', !vorbei && s.am === p);
    const v = $('v' + ort), weg = geschlagen(s, p);
    v.replaceChildren(...weg.map((t) => { const i = document.createElement('i'); const n = (p === 1 ? 's' : 'w') + FIG[t]; if (img[n]) i.style.backgroundImage = 'url(' + BILDER[n] + ')'; return i; }));
    v.hidden = !weg.length;
  }
  $('bZurueck').disabled = !(partie && !vorbei && !denkt && !anim && (rueckSchritte() > 0 || wahl >= 0));
  $('bZurueck').hidden = modus === 'ki' && stufe === 'meister';
}
function hinweis(text) { $('hinweis').innerHTML = text; }
function standardHinweis() {
  if (!partie) return;
  if (vorbei) { hinweis('Partie vorbei. <b>Menü</b> für eine neue Partie.'); return; }
  const p = partie.s.am, wer = modus === 'zwei' ? (p === 1 ? 'Weiß: ' : 'Schwarz: ') : '';
  if (modus === 'ki' && p !== mensch) { hinweis(GEGNER[stufe].name + ' ist am Zug …'); return; }
  const vorher = letzterText ? letzterText + ' ' : '';
  if (wahl >= 0) { hinweis(vorher + wer + 'Wohin? Tippe ein <b>gelb markiertes</b> Feld an.'); return; }
  hinweis(vorher + wer + (E.imSchach(partie.s) ? '<b>Schach!</b> Schütze deinen König.' : 'Tippe eine deiner Figuren an.'));
}

// ---------- Partie ----------
function neuePartie(m, st, mn) {
  modus = m; stufe = st; mensch = mn;
  partie = E.neuePartie(); wahl = -1; wahlZuege = []; vorbei = null; letzter = 0; letzterText = ''; anim = null; denkt = false; wartetUmw = null; kiNr++;
  merken(); zeige(null); panels(); standardHinweis(); weiter();
}
function fortsetzen() {
  const o = store.offen; if (!o) return;
  const p = E.partieAus(o.z); if (!p) { store.offen = null; speichern(); return; }
  modus = o.modus; stufe = o.stufe; mensch = o.mensch;
  partie = p; wahl = -1; wahlZuege = []; vorbei = null; anim = null; denkt = false; wartetUmw = null; kiNr++;
  letzter = p.zuege.length ? p.zuege[p.zuege.length - 1] : 0; letzterText = '';
  zeige(null); panels(); standardHinweis(); weiter();
}
function merken() { store.offen = partie && !vorbei ? { modus, stufe, mensch, z: E.partieText(partie) } : null; speichern(); }

function ausfuehren(m) {
  const s = partie.s, f = E.von(m), t = E.nach(m), v = s.b[f], schlag = !!s.b[t] || (E.art(m) & 1), wer = s.am;
  const text = E.notation(s, m);
  if (!E.spiele(partie, m)) return;
  const jetzt = performance.now(), dauer = WENIG_BEWEGUNG ? 0 : 260;
  wahl = -1; wahlZuege = []; letzter = m;
  letzterText = modus === 'ki' && wer !== mensch ? GEGNER[stufe].name.split(' ').pop() + ' zog <b>' + text + '</b>.' : modus === 'zwei' ? (wer === 1 ? 'Weiß' : 'Schwarz') + ' zog <b>' + text + '</b>.' : '';
  if (dauer) anim = { v: E.umw(m) ? v : partie.s.b[t], von: pos(f), nach: pos(t), t0: jetzt, dauer, feld: t };
  sperre = jetzt + dauer + 60;
  setTimeout(() => { anim = null; if (E.imSchach(partie.s)) ton.schach(); else if (schlag) ton.schlag(); else ton.tock(); }, dauer);
  merken(); panels(); standardHinweis();
  setTimeout(weiter, Math.max(0, sperre - jetzt));
}
function weiter() {
  if (!partie || vorbei) return;
  const st = E.status(partie);
  if (st.ende) { ende(st); return; }
  panels(); standardHinweis();
  if (modus === 'ki' && partie.s.am !== mensch) kiZiehen();
}

// ---------- Computergegner ----------
let worker = null, workerKaputt = false, wartet = null;
function holeWorker() {
  if (worker || workerKaputt) return worker;
  try {
    worker = new Worker(new URL('./ki.js?v=1', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => antwort(e.data);
    worker.onerror = () => { workerKaputt = true; worker = null; if (denkt) direktRechnen(kiNr); };
  } catch (e) { workerKaputt = true; worker = null; }
  return worker;
}
function kiZiehen() {
  denkt = true; panels(); standardHinweis();
  const nr = ++kiNr; wartet = { nr, start: performance.now() };
  const w = holeWorker(), seed = (Math.random() * 4294967296) >>> 0;
  if (w) w.postMessage({ id: nr, z: E.partieText(partie), stufe, seed });
  else setTimeout(() => direktRechnen(nr), 30);
}
function direktRechnen(nr) { if (!partie || nr !== kiNr) return; antwort({ id: nr, m: E.kiZug(partie.s, stufe, { gesehen: partie.wdh, verlauf: E.partieText(partie) }) }); }
function antwort(d) {
  if (!d || !wartet || d.id !== wartet.nr || d.id !== kiNr || !partie || vorbei) return;
  const rest = Math.max(0, GEGNER[stufe].pause - (performance.now() - wartet.start)), m = d.m; wartet = null;
  setTimeout(() => {
    if (d.id !== kiNr || !partie) return;
    denkt = false;
    ausfuehren(m != null && E.zuege(partie.s).includes(m) ? m : E.kiZug(partie.s, 'gemuetlich', { gesehen: partie.wdh }));
  }, rest);
}

// ---------- Bedienung ----------
function feldBei(x, y) {
  const c = Math.floor((x - lay.x0) / lay.f), r = Math.floor((y - lay.y0) / lay.f);
  if (c < 0 || c > 7 || r < 0 || r > 7) return -1;
  const j = r * 8 + c; return gedreht() ? 63 - j : j;
}
function tippe(i) {
  if (!menschAmZug() || anim || performance.now() < sperre || i < 0) return;
  const s = partie.s, g = s.am === 1 ? 1 : -1, v = s.b[i];
  if (wahl >= 0) {
    const passend = wahlZuege.filter((m) => E.nach(m) === i);
    if (passend.length === 1) return ausfuehren(passend[0]);
    if (passend.length > 1) return umwandlungWaehlen(passend);   // Bauer erreicht die letzte Reihe
  }
  if (v * g > 0) {
    if (wahl === i) { wahl = -1; wahlZuege = []; standardHinweis(); panels(); return; }
    const z = E.zuege(s).filter((m) => E.von(m) === i);
    if (!z.length) {
      wackel = { i, t0: performance.now() }; ton.nein(); wahl = -1; wahlZuege = [];
      hinweis(E.imSchach(s) ? '<b>Schach!</b> Dieser Zug hilft deinem König nicht.' : 'Dieser ' + FIG_NAME[v * g] + ' kann gerade nicht ziehen.');
      return;
    }
    wahl = i; wahlZuege = z; ton.wahl(); standardHinweis(); panels(); return;
  }
  if (wahl >= 0) { ton.nein(); hinweis(E.imSchach(s) ? '<b>Schach!</b> Nur gelb markierte Felder sind erlaubt.' : 'Dorthin geht es nicht. Tippe ein <b>gelb markiertes</b> Feld an.'); }
}
function umwandlungWaehlen(liste) {
  wartetUmw = liste;
  const box = $('umwKnoepfe'), farbe = partie.s.am === 1 ? 'w' : 's';
  box.replaceChildren(...[E.DAME, E.TURM, E.LAEUFER, E.SPRINGER].map((t) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'umw';
    b.setAttribute('aria-label', FIG_NAME[t]);
    if (img[farbe + FIG[t]]) b.style.backgroundImage = 'url(' + BILDER[farbe + FIG[t]] + ')'; else b.textContent = FIG_NAME[t];
    b.addEventListener('click', () => { const m = liste.find((x) => E.umw(x) === t); wartetUmw = null; zeige(null); if (m) ausfuehren(m); });
    return b;
  }));
  zeige('sUmw');
}
$('bUmwZu').addEventListener('click', () => { wartetUmw = null; zeige(null); standardHinweis(); });
cv.addEventListener('pointerdown', (e) => {
  ton.start();
  const r = cv.getBoundingClientRect();
  tippe(feldBei(e.clientX - r.left, e.clientY - r.top));
});

function rueckSchritte() {
  if (!partie || (modus === 'ki' && stufe === 'meister')) return 0;
  const n = partie.zuege.length;
  if (modus === 'zwei') return n > 0 ? 1 : 0;
  for (let k = n - 1; k >= 0; k--) if ((k % 2 === 0 ? 1 : 2) === mensch) return n - k;
  return 0;
}
$('bZurueck').addEventListener('click', () => {
  if (wahl >= 0) { wahl = -1; wahlZuege = []; standardHinweis(); panels(); return; }
  const k = rueckSchritte(); if (!k || denkt || anim) return;
  const p = E.partieAus(partie.zuege.slice(0, partie.zuege.length - k).map(E.zugText).join(' ')); if (!p) return;
  partie = p; wahl = -1; wahlZuege = []; kiNr++; letzterText = '';
  letzter = p.zuege.length ? p.zuege[p.zuege.length - 1] : 0;
  ton.wahl(); merken(); panels(); standardHinweis(); weiter();
});
$('bAufgeben').addEventListener('click', () => {
  if (!partie || vorbei || denkt || anim) return;
  if (modus === 'ki') ende({ ende: true, sieger: 3 - mensch, grund: 'aufgabe' });
  else ende({ ende: true, sieger: 3 - partie.s.am, grund: 'aufgabe' });
});

// ---------- Ende ----------
let ergebnisText = '';
const GRUND = { matt: 'Schachmatt', patt: 'Patt', wiederholung: 'dreimal dieselbe Stellung', fuenfzig: '50 Züge ohne Schlagen und Bauernzug', material: 'zu wenig Material zum Mattsetzen', aufgabe: 'Aufgabe' };
function ende(st) {
  vorbei = st; denkt = false; store.offen = null; kiNr++;
  const grund = GRUND[st.grund] || '';
  let titel, text, sieg = false;
  if (modus === 'ki') {
    const g = GEGNER[stufe], x = stat(stufe);
    if (st.sieger === 0) { x.u++; titel = 'Remis'; text = 'Unentschieden gegen ' + g.name + ': ' + grund + '.'; ergebnisText = 'Remis gegen ' + g.name + ' (' + g.stufe + ') im Schach!'; }
    else if (st.sieger === mensch) { x.s++; sieg = true; titel = 'Schachmatt!'; text = 'Du hast ' + g.name + ' mattgesetzt. ' + (stufe === 'meister' ? 'Respekt, der Professor ist geschlagen!' : 'Stark gespielt!'); ergebnisText = 'Ich habe ' + g.name + ' (' + g.stufe + ') im Schach mattgesetzt! Schaffst du das auch?'; }
    else { x.n++; titel = 'Verloren'; text = st.grund === 'aufgabe' ? 'Du hast aufgegeben. Revanche?' : g.name + ' hat dich mattgesetzt. Revanche?'; ergebnisText = g.name + ' (' + g.stufe + ') war im Schach zu stark für mich. Schaffst du es?'; }
    avatar($('eAv'), stufe);
    $('eZahlen').hidden = false; $('eS').textContent = x.s; $('eU').textContent = x.u; $('eN').textContent = x.n;
  } else {
    store.zwei++;
    titel = st.sieger === 0 ? 'Remis' : (st.sieger === 1 ? 'Weiß' : 'Schwarz') + ' gewinnt!'; sieg = st.sieger !== 0;
    text = st.sieger === 0 ? 'Unentschieden: ' + grund + '.' : grund + '.';
    figurAvatar($('eAv'), st.sieger || 1);
    $('eZahlen').hidden = true; ergebnisText = 'Wir haben gerade Schach auf PlaySaal gespielt. Spielst du mit?';
  }
  speichern(); panels(); standardHinweis();
  setTimeout(() => {
    $('eTitel').textContent = titel; $('eTitel').className = 'ergebnis' + (sieg ? ' sieg' : '');
    $('eText').textContent = text;
    $('bRevanche').textContent = modus === 'ki' ? 'Revanche' : 'Neue Partie';
    if (sieg || st.sieger === 0) ton.sieg(); else ton.verloren();
    zeige('sEnde');
  }, st.grund === 'aufgabe' ? 150 : 900);
}
async function teilen() {
  const b = $('bTeilen'), text = ergebnisText || 'Schach auf PlaySaal';
  try { if (navigator.share) { await navigator.share({ title: 'Schach · PlaySaal', text, url: URL_SPIEL }); return; } } catch (err) { if (err && err.name === 'AbortError') return; }
  try { await navigator.clipboard.writeText(text + ' ' + URL_SPIEL); b.textContent = 'Kopiert!'; setTimeout(() => (b.textContent = 'Teilen'), 1600); } catch (e) { b.textContent = 'Teilen'; }
}

// ---------- Schirme ----------
function zeige(id) { for (const x of ['sTitel', 'sStufe', 'sRegeln', 'sEnde', 'sUmw']) $(x).hidden = x !== id; }
function titel() {
  kiNr++; denkt = false; wahl = -1; wahlZuege = []; wartetUmw = null;
  if (partie && !vorbei) merken();
  $('bWeiter').hidden = !store.offen;
  if (store.offen) { const o = store.offen; $('bWeiter').textContent = 'Weiterspielen · ' + (o.modus === 'ki' ? GEGNER[o.stufe].name : 'zu zweit'); }
  zeige('sTitel');
}
function stufenListe() {
  const box = $('stufen'); if (!box) return;
  box.replaceChildren(...STUFEN.map((k) => {
    const g = GEGNER[k], x = stat(k), b = document.createElement('button');
    b.type = 'button'; b.className = 'stufe';
    const av = document.createElement('div'); avatar(av, k);
    const t = document.createElement('div');
    const bilanz = x.s + x.u + x.n ? x.s + (x.s === 1 ? ' Sieg' : ' Siege') + ' · ' + x.u + ' Remis · ' + x.n + (x.n === 1 ? ' Niederlage' : ' Niederlagen') : 'Noch nicht gespielt';
    t.innerHTML = '<b></b><span></span><small></small>';
    t.children[0].textContent = g.name + ' · ' + g.stufe; t.children[1].textContent = g.text; t.children[2].textContent = bilanz;
    b.append(av, t);
    b.addEventListener('click', () => { ton.start(); neuePartie('ki', k, store.ichZuerst ? 1 : 2); });
    return b;
  }));
}
function wahlAnzeige() { $('wIch').setAttribute('aria-pressed', String(store.ichZuerst)); $('wKi').setAttribute('aria-pressed', String(!store.ichZuerst)); }
$('wIch').addEventListener('click', () => { store.ichZuerst = true; speichern(); wahlAnzeige(); });
$('wKi').addEventListener('click', () => { store.ichZuerst = false; speichern(); wahlAnzeige(); });
$('bComputer').addEventListener('click', () => { ton.start(); stufenListe(); wahlAnzeige(); zeige('sStufe'); });
$('bStufeZu').addEventListener('click', titel);
$('bZwei').addEventListener('click', () => { ton.start(); neuePartie('zwei', stufe, 1); });
$('bWeiter').addEventListener('click', () => { ton.start(); fortsetzen(); });
$('bRegeln').addEventListener('click', () => zeige('sRegeln'));
$('bRegelnZu').addEventListener('click', titel);
$('bMenue').addEventListener('click', titel);
$('bEndeMenue').addEventListener('click', titel);
$('bTeilen').addEventListener('click', teilen);
$('bBrett').addEventListener('click', () => zeige(null));
$('bRevanche').addEventListener('click', () => { ton.start(); if (modus === 'ki') { store.ichZuerst = mensch !== 1; speichern(); neuePartie('ki', stufe, 3 - mensch); } else neuePartie('zwei', stufe, 1); });
const tonKnopf = () => $('bTon').setAttribute('aria-pressed', String(store.sound));
$('bTon').addEventListener('click', () => { store.sound = !store.sound; speichern(); tonKnopf(); if (store.sound) { ton.start(); ton.wahl(); } });

// ---------- Start ----------
laden(); tonKnopf(); groesse();
titel();
requestAnimationFrame(schleife);
window.__schach = { E, get partie() { return partie; }, get denkt() { return denkt; }, get vorbei() { return vorbei; }, get wartetUmw() { return wartetUmw; }, tippe, pos, get mensch() { return mensch; } };
