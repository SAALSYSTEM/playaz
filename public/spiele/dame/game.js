// DAME: Darstellung, Bedienung, Ton, Spielstand, Computergegner (im Web Worker) und Zu-zweit-Modus.
// Regeln und Suche stehen in engine.js. Aufbau wie MÜHLE; Steine und Gegner-Bilder kommen aus ../muehle/img/,
// Brett und Krone aus img/. Fehlt ein Bild, zeichnet das Spiel einen Platzhalter.
import * as E from './engine.js';

const $ = (id) => document.getElementById(id);
const KEY = 'dame.v1';
const WENIG_BEWEGUNG = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
const URL_SPIEL = 'https://playsaal.com/spiele/dame';

export const GEGNER = {
  gemuetlich: { name: 'Opa Willi', stufe: 'Gemütlich', text: 'Spielt entspannt und lässt auch mal einen Stein stehen.', bild: 'gegner-gemuetlich', kurz: 'W', pause: 650 },
  geuebt: { name: 'Tante Gisela', stufe: 'Geübt', text: 'Passt gut auf und lauert auf Doppelsprünge.', bild: 'gegner-geuebt', kurz: 'G', pause: 550 },
  meister: { name: 'Professor Mühlberg', stufe: 'Meister', text: 'Rechnet viele Züge voraus. Kein Zug zurück.', bild: 'gegner-meister', kurz: 'M', pause: 250 }
};
const STUFEN = Object.keys(GEGNER);

// ---------- Speicherstand (nur dieses Gerät; mit Konto wird er wie bei allen Spielen synchronisiert) ----------
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
const BILDER = { 'brett': 'dame/img/brett.webp', 'krone': 'dame/img/krone.webp', 'stein-hell': 'muehle/img/stein-hell.webp', 'stein-dunkel': 'muehle/img/stein-dunkel.webp', 'gegner-gemuetlich': 'muehle/img/gegner-gemuetlich.webp', 'gegner-geuebt': 'muehle/img/gegner-geuebt.webp', 'gegner-meister': 'muehle/img/gegner-meister.webp' };
const img = {};
for (const [n, src] of Object.entries(BILDER)) {
  const b = new Image(); b.decoding = 'async';
  b.onload = () => { img[n] = b; avatareAktualisieren(); };
  b.src = src;
}
function avatar(el, stufe) {
  const g = GEGNER[stufe];
  el.className = 'av'; el.style.backgroundImage = ''; el.textContent = g.kurz;
  if (img[g.bild]) { el.classList.add('bild'); el.style.backgroundImage = 'url(' + BILDER[g.bild] + ')'; }
}
function steinAvatar(el, p) {
  const n = p === 1 ? 'stein-hell' : 'stein-dunkel';
  el.className = 'av stein'; el.textContent = '';
  el.style.backgroundImage = img[n] ? 'url(' + BILDER[n] + ')' : (p === 1 ? 'radial-gradient(circle at 40% 35%,#f6ead0,#c8a46a)' : 'radial-gradient(circle at 40% 35%,#7a5238,#2a170b)');
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
    sprung(n) { piep(420 + n * 90, 0.12, 'triangle', 0.09, 760 + n * 90); },
    weg() { piep(520, 0.16, 'sine', 0.1, 130); },
    dame() { [784, 988, 1175, 1568].forEach((f, i) => piep(f, 0.2, 'triangle', 0.08, 0, i * 0.07)); },
    nein() { piep(160, 0.1, 'square', 0.03); },
    sieg() { [523, 659, 784, 1047].forEach((f, i) => piep(f, 0.24, 'triangle', 0.1, 0, i * 0.11)); },
    verloren() { [440, 392, 330].forEach((f, i) => piep(f, 0.28, 'triangle', 0.08, 0, i * 0.16)); }
  };
})();

// ---------- Zustand ----------
let partie = null, modus = 'ki', stufe = 'gemuetlich', mensch = 1;
let teil = null;           // angefangener Zug des Menschen: Pfad [Start, Landefeld …]
let denkt = false, kiNr = 0, sperre = 0, vorbei = null, wackel = null;
let anim = null;           // { v, pfad: [[x,y]…], t0, dauer, nach }
let weg = [];              // { i, v, t0 }
let letzter = null;

// ---------- Darstellung ----------
const cv = $('c'), cx = cv.getContext('2d');
let lay = { W: 0, H: 0, dpr: 1, x0: 0, y0: 0, gr: 0, f: 0, R: 0 };
function groesse() {
  const b = $('brett').getBoundingClientRect(), dpr = Math.min(2.5, window.devicePixelRatio || 1);
  cv.width = Math.round(b.width * dpr); cv.height = Math.round(b.height * dpr);
  const rand = Math.max(6, Math.min(b.width, b.height) * 0.022);   // Platz für den Holzrahmen
  const gr = Math.max(120, Math.floor((Math.min(b.width, b.height) - rand * 2) / 8) * 8);
  lay = { W: b.width, H: b.height, dpr, gr, f: gr / 8, R: gr / 8 * 0.4, x0: Math.round((b.width - gr) / 2), y0: Math.round((b.height - gr) / 2) };
}
addEventListener('resize', groesse);
const gedreht = () => modus === 'ki' && mensch === 2;           // Brett so drehen, dass der Mensch unten spielt
const ansicht = (i) => (gedreht() ? 63 - i : i);
const pos = (i) => { const j = ansicht(i); return [lay.x0 + ((j & 7) + 0.5) * lay.f, lay.y0 + ((j >> 3) + 0.5) * lay.f]; };

function brett() {
  const { x0, y0, gr, f } = lay;
  cx.save();
  cx.shadowColor = 'rgba(0,0,0,.55)'; cx.shadowBlur = gr * 0.05; cx.shadowOffsetY = gr * 0.018;
  // Rahmen
  const rand = Math.max(6, Math.min(lay.W, lay.H) * 0.022);
  cx.fillStyle = '#5a361d'; cx.beginPath(); cx.roundRect ? cx.roundRect(x0 - rand, y0 - rand, gr + rand * 2, gr + rand * 2, rand) : cx.rect(x0 - rand, y0 - rand, gr + rand * 2, gr + rand * 2); cx.fill();
  cx.restore();
  // Felder: das Bild ist ungedreht oben links hell; gedreht passt es genauso (63 - i hat dieselbe Farbe)
  if (img.brett) cx.drawImage(img.brett, x0, y0, gr, gr);
  else for (let i = 0; i < 64; i++) { cx.fillStyle = E.spielbar(i) ? '#6b4226' : '#e9cf9f'; cx.fillRect(x0 + (i & 7) * f, y0 + (i >> 3) * f, f, f); }
  cx.strokeStyle = 'rgba(40,20,5,.6)'; cx.lineWidth = 1; cx.strokeRect(x0 + 0.5, y0 + 0.5, gr - 1, gr - 1);
}
function stein(x, y, v, alpha = 1, skala = 1) {
  const R = lay.R * skala, p = E.farbe(v);
  cx.save(); cx.globalAlpha = alpha;
  cx.beginPath(); cx.ellipse(x + R * 0.08, y + R * 0.2, R * 0.98, R * 0.9, 0, 0, 7); cx.fillStyle = 'rgba(0,0,0,.4)'; cx.fill();
  const n = p === 1 ? 'stein-hell' : 'stein-dunkel';
  if (img[n]) cx.drawImage(img[n], x - R, y - R, R * 2, R * 2);
  else {
    const g = cx.createRadialGradient(x - R * 0.3, y - R * 0.35, R * 0.1, x, y, R);
    if (p === 1) { g.addColorStop(0, '#fbf1da'); g.addColorStop(1, '#c6a066'); } else { g.addColorStop(0, '#80583c'); g.addColorStop(1, '#25140a'); }
    cx.beginPath(); cx.arc(x, y, R, 0, 7); cx.fillStyle = g; cx.fill();
  }
  if (E.istDame(v)) {
    const k = R * 1.15;
    if (img.krone) cx.drawImage(img.krone, x - k / 2, y - k / 2 - R * 0.05, k, k);
    else { cx.fillStyle = '#e8b623'; cx.beginPath(); cx.moveTo(x - k * 0.4, y + k * 0.2); cx.lineTo(x - k * 0.4, y - k * 0.2); cx.lineTo(x - k * 0.2, y); cx.lineTo(x, y - k * 0.3); cx.lineTo(x + k * 0.2, y); cx.lineTo(x + k * 0.4, y - k * 0.2); cx.lineTo(x + k * 0.4, y + k * 0.2); cx.closePath(); cx.fill(); }
  }
  cx.restore();
}
function ring(x, y, farbe, breite, r = lay.R * 1.1, alpha = 1) {
  cx.save(); cx.globalAlpha = alpha; cx.beginPath(); cx.arc(x, y, r, 0, 7); cx.strokeStyle = farbe; cx.lineWidth = breite; cx.stroke(); cx.restore();
}
function feld(i, farbe, alpha) {
  const j = ansicht(i);
  cx.save(); cx.globalAlpha = alpha; cx.fillStyle = farbe; cx.fillRect(lay.x0 + (j & 7) * lay.f, lay.y0 + (j >> 3) * lay.f, lay.f, lay.f); cx.restore();
}
const menschAmZug = () => partie && !vorbei && !denkt && (modus === 'zwei' || partie.s.am === mensch);
function passende() { return teil ? E.zuege(partie.s).filter((m) => teil.every((x, k) => m.p[k] === x)) : []; }
function schlagende() { const z = E.zuege(partie.s); return z.length && z[0].x.length ? new Set(z.map((m) => m.p[0])) : null; }

function zeichne(jetzt) {
  cx.setTransform(lay.dpr, 0, 0, lay.dpr, 0, 0);
  cx.clearRect(0, 0, lay.W, lay.H);
  if (!lay.gr) return;
  brett();
  if (!partie) return;
  const s = partie.s, b = s.b, puls = WENIG_BEWEGUNG ? 0.85 : 0.7 + 0.3 * Math.sin(jetzt / 180);
  // letzter Zug: Start- und Zielfeld getönt
  if (letzter && !anim) { feld(letzter.p[0], '#FF9200', 0.22); feld(letzter.p[letzter.p.length - 1], '#FF9200', 0.3); }
  const hilfe = menschAmZug() && !anim;
  let ziele = [], teilGeschl = [];
  if (hilfe && teil) {
    const pm = passende();
    ziele = [...new Set(pm.map((m) => m.p[teil.length]).filter((x) => x !== undefined))];
    if (pm.length) teilGeschl = pm[0].x.slice(0, teil.length - 1);
  }
  // Steine
  for (let i = 0; i < 64; i++) {
    let v = b[i]; if (!v) continue;
    if (anim && (i === anim.nach)) continue;
    if (teil && i === teil[0] && teil.length > 1) continue;
    const [x, y] = pos(i);
    let dx = 0; if (wackel && wackel.i === i) { const t = (jetzt - wackel.t0) / 300; if (t < 1) dx = Math.sin(t * 25) * lay.R * 0.15 * (1 - t); else wackel = null; }
    stein(x + dx, y, v, teilGeschl.includes(i) ? 0.35 : 1);
  }
  if (teil && teil.length > 1) { const [x, y] = pos(teil[teil.length - 1]); stein(x, y, b[teil[0]]); }
  weg = weg.filter((x) => jetzt - x.t0 < 450);
  for (const x of weg) { const t = Math.max(0, (jetzt - x.t0) / 450); const [px, py] = pos(x.i); stein(px, py - t * lay.R * 0.6, x.v, 1 - t, 1 + t * 0.25); }
  if (anim) {
    const n = anim.pfad.length - 1;
    let t = Math.max(0, Math.min(1, (jetzt - anim.t0) / anim.dauer)) * n; const k = Math.min(n - 1, Math.floor(t)); t -= k;
    const e = 1 - Math.pow(1 - t, 2), a = anim.pfad[k], z = anim.pfad[k + 1];
    const huepf = anim.sprung ? Math.sin(t * Math.PI) * lay.R * 0.9 : Math.sin(t * Math.PI) * lay.R * 0.3;
    stein(a[0] + (z[0] - a[0]) * e, a[1] + (z[1] - a[1]) * e - huepf, anim.v, 1, 1 + Math.sin(t * Math.PI) * (anim.sprung ? 0.18 : 0.08));
  }
  if (hilfe) {
    if (!teil) { const sch = schlagende(); if (sch) for (const i of sch) { const [x, y] = pos(i); ring(x, y, '#FF9200', lay.f * 0.07, lay.R * 1.12, puls); } }
    else {
      const [x, y] = pos(teil[teil.length - 1]); ring(x, y, '#FFD21C', lay.f * 0.08);
      for (const t of ziele) { const [tx, ty] = pos(t); cx.save(); cx.globalAlpha = 0.5 + puls * 0.5; cx.beginPath(); cx.arc(tx, ty, lay.f * 0.15, 0, 7); cx.fillStyle = '#FFD21C'; cx.fill(); cx.restore(); }
    }
  }
}
function schleife(t) { zeichne(t); requestAnimationFrame(schleife); }

// ---------- Anzeige um das Brett ----------
function seiteInfo(p) {
  const z = E.zaehle(partie.s, p);
  const teile = [modus === 'ki' && p !== mensch ? GEGNER[stufe].stufe : (p === 1 ? 'Hell' : 'Dunkel')];
  teile.push(z.st + (z.st === 1 ? ' Stein' : ' Steine') + (z.da ? ' · ' + z.da + (z.da === 1 ? ' Dame' : ' Damen') : ''));
  return teile.join(' · ');
}
function panels() {
  if (!partie) return;
  const s = partie.s;
  for (const ort of ['Oben', 'Unten']) {
    const p = ort === 'Unten' ? (modus === 'ki' ? mensch : 1) : (modus === 'ki' ? 3 - mensch : 2);
    const istKi = modus === 'ki' && p !== mensch;
    if (istKi) avatar($('av' + ort), stufe); else steinAvatar($('av' + ort), p);
    $('n' + ort).textContent = istKi ? GEGNER[stufe].name : modus === 'ki' ? 'Du' : (p === 1 ? 'Spieler Hell' : 'Spieler Dunkel');
    const info = $('i' + ort);
    if (istKi && denkt) { info.textContent = 'überlegt …'; info.classList.add('denkt'); } else { info.textContent = seiteInfo(p); info.classList.remove('denkt'); }
    $('sp' + ort).classList.toggle('dran', !vorbei && s.am === p);
    // geschlagene gegnerische Steine als Punkte
    const v = $('v' + ort), weg = E.STEINE - E.zaehle(s, 3 - p).alle;
    v.className = 'vorrat' + (p === 1 ? ' dunkel' : '');
    v.hidden = weg === 0;
    v.replaceChildren(...Array.from({ length: weg }, () => document.createElement('i')));
  }
  $('bZurueck').disabled = !(partie && !vorbei && !denkt && !anim && (rueckSchritte() > 0 || teil));
  $('bZurueck').hidden = modus === 'ki' && stufe === 'meister';
}
function hinweis(text) { $('hinweis').innerHTML = text; }
function standardHinweis() {
  if (!partie) return;
  if (vorbei) { hinweis('Partie vorbei. <b>Menü</b> für eine neue Partie.'); return; }
  const p = partie.s.am, wer = modus === 'zwei' ? (p === 1 ? 'Hell: ' : 'Dunkel: ') : '';
  if (modus === 'ki' && p !== mensch) { hinweis(GEGNER[stufe].name + ' ist am Zug …'); return; }
  if (teil && teil.length > 1) { hinweis(wer + '<b>Weiterspringen!</b> Tippe das nächste gelbe Feld an.'); return; }
  const sch = schlagende();
  if (teil) { hinweis(wer + (sch ? '<b>Schlagen:</b> Tippe das Landefeld hinter dem gegnerischen Stein an.' : 'Wohin? Tippe ein <b>gelb markiertes</b> Feld an.')); return; }
  hinweis(wer + (sch ? '<b>Schlagpflicht!</b> Tippe einen orange markierten Stein an.' : 'Tippe einen deiner Steine an, den du ziehen willst.'));
}

// ---------- Partie ----------
function neuePartie(m, st, mn) {
  modus = m; stufe = st; mensch = mn;
  partie = E.neuePartie(); teil = null; vorbei = null; letzter = null; anim = null; weg = []; denkt = false; kiNr++;
  merken(); zeige(null); panels(); standardHinweis(); weiter();
}
function fortsetzen() {
  const o = store.offen; if (!o) return;
  const p = E.partieAus(o.z); if (!p) { store.offen = null; speichern(); return; }
  modus = o.modus; stufe = o.stufe; mensch = o.mensch;
  partie = p; teil = null; vorbei = null; anim = null; weg = []; denkt = false; kiNr++;
  letzter = p.zuege.length ? p.zuege[p.zuege.length - 1] : null;
  zeige(null); panels(); standardHinweis(); weiter();
}
function merken() { store.offen = partie && !vorbei ? { modus, stufe, mensch, z: E.partieText(partie) } : null; speichern(); }

function ausfuehren(m, abSchritt = 0) {
  const s = partie.s, v = s.b[m.p[0]], dame = E.wirdDame(s, m), xs = m.x.map((i) => ({ i, v: s.b[i] }));
  if (!E.spiele(partie, m)) return;
  const jetzt = performance.now(), schritte = m.p.length - 1 - abSchritt;
  const proSchritt = m.x.length ? 260 : 220, dauer = WENIG_BEWEGUNG || schritte <= 0 ? 0 : schritte * proSchritt;
  teil = null; letzter = m;
  if (dauer) anim = { v, pfad: m.p.slice(abSchritt).map(pos), t0: jetzt, dauer, nach: m.p[m.p.length - 1], sprung: m.x.length > 0 };
  sperre = jetzt + dauer + (m.x.length ? 250 : 60) + (dame ? 250 : 0);
  if (dauer) for (let k = 0; k < schritte; k++) setTimeout(() => { if (m.x.length) ton.sprung(k); else ton.tock(); }, (k + 1) * proSchritt - 30);
  setTimeout(() => {
    anim = null;
    const t = performance.now();
    xs.forEach((x, k) => weg.push({ i: x.i, v: x.v, t0: t + k * 70 }));
    if (xs.length) ton.weg(); else if (!dauer) ton.tock();
    if (dame) setTimeout(() => ton.dame(), 120);
  }, dauer);
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
    worker = new Worker(new URL('./ki.js', import.meta.url), { type: 'module' });
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
function direktRechnen(nr) { if (!partie || nr !== kiNr) return; antwort({ id: nr, m: E.kiZug(partie.s, stufe, { gesehen: partie.wdh }) }); }
function antwort(d) {
  if (!d || !wartet || d.id !== wartet.nr || d.id !== kiNr || !partie || vorbei) return;
  const rest = Math.max(0, GEGNER[stufe].pause - (performance.now() - wartet.start)), m = d.m; wartet = null;
  setTimeout(() => {
    if (d.id !== kiNr || !partie) return;
    denkt = false;
    const gueltig = m && E.zuege(partie.s).find((x) => E.gleich(x, m));
    ausfuehren(gueltig || E.kiZug(partie.s, 'gemuetlich', { gesehen: partie.wdh }));
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
  const s = partie.s, p = s.am, b = s.b, alle = E.zuege(s);
  // Mitten im Mehrfachsprung: nur Landefelder zählen
  if (teil && teil.length > 1) {
    const pm = passende().filter((m) => m.p[teil.length] === i);
    if (pm.length) return weiterTeil(i, pm);
    if (i === teil[teil.length - 1]) return;
    ton.nein(); hinweis('Du musst weiterspringen: Tippe ein <b>gelbes</b> Feld an.'); return;
  }
  if (E.farbe(b[i]) === p) {
    if (teil && teil[0] === i) { teil = null; standardHinweis(); panels(); return; }
    if (alle.some((m) => m.p[0] === i)) { teil = [i]; ton.wahl(); standardHinweis(); panels(); return; }
    wackel = { i, t0: performance.now() }; ton.nein();
    hinweis(alle[0] && alle[0].x.length ? '<b>Schlagpflicht!</b> Ein anderer Stein muss schlagen (orange markiert).' : 'Dieser Stein kann gerade nicht ziehen.');
    return;
  }
  if (teil && !b[i]) {
    const pm = passende().filter((m) => m.p[1] === i);
    if (pm.length) return weiterTeil(i, pm);
    ton.nein(); hinweis(E.istDame(b[teil[0]]) ? 'Damen ziehen schräg, so weit der Weg frei ist.' : 'Steine ziehen ein Feld <b>schräg nach vorn</b>.');
  }
}
function weiterTeil(i, pm) {
  teil = [...teil, i];
  const fertig = pm.find((m) => m.p.length === teil.length);
  // Endet ein erlaubter Zug hier, ist er vollständig (ginge es weiter, wäre der kürzere nicht erlaubt).
  // Nur den letzten Sprung animieren, die Sprünge davor hat der Spieler schon gesehen.
  if (fertig) { ausfuehren(fertig, teil.length - 2); return; }
  ton.sprung(teil.length - 2); standardHinweis(); panels();
}
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
  if (teil) { teil = null; standardHinweis(); panels(); return; }
  const k = rueckSchritte(); if (!k || denkt || anim) return;
  const text = partie.zuege.slice(0, partie.zuege.length - k).map(E.kodiere).join('.');
  const p = E.partieAus(text); if (!p) return;
  partie = p; teil = null; kiNr++;
  letzter = p.zuege.length ? p.zuege[p.zuege.length - 1] : null;
  ton.wahl(); merken(); panels(); standardHinweis(); weiter();
});

// ---------- Ende ----------
let ergebnisText = '';
function ende(st) {
  vorbei = st; denkt = false; store.offen = null;
  const grund = { keine: 'keinen Stein mehr', blockiert: 'keinen Zug mehr', wiederholung: 'dreimal dieselbe Stellung', ruhig: '25 Züge ohne Schlagen' }[st.grund] || '';
  let titel, text, sieg = false;
  if (modus === 'ki') {
    const g = GEGNER[stufe], x = stat(stufe);
    if (st.sieger === 0) { x.u++; titel = 'Remis'; text = 'Unentschieden gegen ' + g.name + ' (' + grund + ').'; ergebnisText = 'Remis gegen ' + g.name + ' (' + g.stufe + ') in Dame!'; }
    else if (st.sieger === mensch) { x.s++; sieg = true; titel = 'Gewonnen!'; text = g.name + ' hat ' + grund + '. ' + (stufe === 'meister' ? 'Respekt, der Professor ist geschlagen!' : 'Stark gespielt!'); ergebnisText = 'Ich habe ' + g.name + ' (' + g.stufe + ') in Dame geschlagen! Schaffst du das auch?'; }
    else { x.n++; titel = 'Verloren'; text = 'Du hast ' + grund + '. Revanche?'; ergebnisText = g.name + ' (' + g.stufe + ') war in Dame zu stark für mich. Schaffst du es?'; }
    avatar($('eAv'), stufe);
    $('eZahlen').hidden = false; $('eS').textContent = x.s; $('eU').textContent = x.u; $('eN').textContent = x.n;
  } else {
    store.zwei++;
    titel = st.sieger === 0 ? 'Remis' : (st.sieger === 1 ? 'Hell' : 'Dunkel') + ' gewinnt!'; sieg = st.sieger !== 0;
    text = st.sieger === 0 ? 'Unentschieden: ' + grund + '.' : (st.sieger === 1 ? 'Dunkel' : 'Hell') + ' hat ' + grund + '.';
    steinAvatar($('eAv'), st.sieger || 1);
    $('eZahlen').hidden = true; ergebnisText = 'Wir haben gerade Dame auf PlaySaal gespielt. Spielst du mit?';
  }
  speichern(); panels(); standardHinweis();
  setTimeout(() => {
    $('eTitel').textContent = titel; $('eTitel').className = 'ergebnis' + (sieg ? ' sieg' : '');
    $('eText').textContent = text;
    $('bRevanche').textContent = modus === 'ki' ? 'Revanche' : 'Neue Partie';
    if (sieg || st.sieger === 0) ton.sieg(); else ton.verloren();
    zeige('sEnde');
  }, 900);
}
async function teilen() {
  const b = $('bTeilen'), text = ergebnisText || 'Dame auf PlaySaal';
  try { if (navigator.share) { await navigator.share({ title: 'Dame · PlaySaal', text, url: URL_SPIEL }); return; } } catch (err) { if (err && err.name === 'AbortError') return; }
  try { await navigator.clipboard.writeText(text + ' ' + URL_SPIEL); b.textContent = 'Kopiert!'; setTimeout(() => (b.textContent = 'Teilen'), 1600); } catch (e) { b.textContent = 'Teilen'; }
}

// ---------- Schirme ----------
function zeige(id) { for (const x of ['sTitel', 'sStufe', 'sRegeln', 'sEnde']) $(x).hidden = x !== id; }
function titel() {
  kiNr++; denkt = false; teil = null;
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
function wahl() { $('wIch').setAttribute('aria-pressed', String(store.ichZuerst)); $('wKi').setAttribute('aria-pressed', String(!store.ichZuerst)); }
$('wIch').addEventListener('click', () => { store.ichZuerst = true; speichern(); wahl(); });
$('wKi').addEventListener('click', () => { store.ichZuerst = false; speichern(); wahl(); });
$('bComputer').addEventListener('click', () => { ton.start(); stufenListe(); wahl(); zeige('sStufe'); });
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
window.__dame = { E, get partie() { return partie; }, get denkt() { return denkt; }, get vorbei() { return vorbei; }, tippe, pos, get mensch() { return mensch; } };
