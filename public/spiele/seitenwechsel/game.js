// SEITENWECHSEL: Darstellung, Steuerung, Ton, Speicherstand, Tageslauf und Rangliste. Regeln stehen in sim.js.
import { SIM_VERSION, W, PL, V, SPIKE, MARGIN, neuerLauf, kodiere } from './sim.js';

const $ = (id) => document.getElementById(id);
const CFG = () => window.PLAYSAAL_CFG || {};
const PS = () => window.PlaySaal || null;
const KEY = 'seitenwechsel.v1';
const TAKT = 1000 / 60;

// ---------- Speicherstand ----------
let store = { v: 1, best: 0, runs: 0, tage: {}, sound: true };
function laden() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (d && typeof d === 'object') {
      store.best = Math.max(0, Math.min(1e6, Math.floor(Number(d.best) || 0)));
      store.runs = Math.max(0, Math.min(1e9, Math.floor(Number(d.runs) || 0)));
      store.sound = d.sound !== false;
      store.tage = {};
      if (d.tage && typeof d.tage === 'object') for (const k of Object.keys(d.tage).slice(-60)) if (/^\d{8}$/.test(k)) store.tage[k] = Math.max(0, Math.min(1e6, Math.floor(Number(d.tage[k]) || 0)));
    }
  } catch (e) {}
}
function speichern() {
  const keys = Object.keys(store.tage).sort(); while (keys.length > 60) delete store.tage[keys.shift()];
  try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) {}
}

// Kurs des Tages: Datum in Berlin als Zahl (JJJJMMTT). Alle Spieler fahren am selben Tag denselben Kurs.
function heute() {
  try {
    const p = new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
    const g = (t) => p.find((x) => x.type === t).value; return Number(g('year') + g('month') + g('day'));
  } catch (e) { const d = new Date(); return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate(); }
}
const tagText = (n) => { const s = String(n); return s.slice(6, 8) + '.' + s.slice(4, 6) + '.'; };

// ---------- Ton ----------
const ton = {
  ctx: null,
  start() { if (this.ctx || !(window.AudioContext || window.webkitAudioContext)) return; try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} },
  piep(f0, f1, dauer, typ, lautst) {
    if (!store.sound || !this.ctx) return; try {
      const c = this.ctx, o = c.createOscillator(), g = c.createGain(), t = c.currentTime;
      o.type = typ || 'sine'; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dauer);
      g.gain.setValueAtTime(lautst || 0.12, t); g.gain.exponentialRampToValueAtTime(0.001, t + dauer); o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + dauer + 0.02);
    } catch (e) {}
  },
  tipp() { this.piep(420, 760, 0.07, 'triangle', 0.1); },
  tot() { this.piep(220, 50, 0.35, 'sawtooth', 0.13); },
  rekord() { [0, 90, 180].forEach((ms, i) => setTimeout(() => this.piep(520 * (1 + i * 0.25), 520 * (1 + i * 0.25), 0.16, 'square', 0.07), ms)); }
};

// ---------- Zustand ----------
const cv = $('c'), cx = cv.getContext('2d');
let zustand = 'titel';           // titel | bereit | spiel | tot | ende | rang
let modus = 'tag';               // tag (Rangliste) | ueben
let seed = 0, lauf = null, tipps = [], tippOffen = false, letzterAnzeige = 0;
let ansicht = { w: 0, h: 0, dpr: 1, sw: 0, ox: 0, s: 1, py: 0 };
let partikel = [], schuettel = 0, tod = null, flashT = 0, vorX = 0, vorT = 0;
let status = null;               // Ergebnis der Server-Prüfung

function gr() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2), w = window.innerWidth, h = window.innerHeight;
  cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
  const sw = Math.min(w, h * 0.62, 520);
  ansicht = { w, h, dpr, sw, ox: (w - sw) / 2, s: sw / W, py: h * 0.7 };
}
addEventListener('resize', gr);

function zeige(id) { for (const s of ['sTitel', 'sEnde', 'sRang']) $(s).hidden = s !== id; $('hud').hidden = !(zustand === 'bereit' || zustand === 'spiel' || zustand === 'tot'); }

// ---------- Lauf ----------
function startLauf(m) {
  modus = m; ton.start();
  seed = m === 'tag' ? heute() : 20200101 + Math.floor(Math.random() * 7e6);
  lauf = neuerLauf(seed); tipps = []; tippOffen = false; partikel = []; schuettel = 0; tod = null; status = null; vorX = 0; vorT = 0;
  zustand = 'bereit'; zeige(null);
  $('hP').textContent = '0'; $('hB').textContent = String(m === 'tag' ? (store.tage[seed] || 0) : store.best);
  $('hMod').textContent = m === 'tag' ? 'Tageslauf ' + tagText(seed) : 'Üben';
  $('hint').hidden = false;
}
function tippen() {
  if (zustand === 'bereit') { zustand = 'spiel'; $('hint').hidden = true; letzterAnzeige = performance.now(); acc = 0; }
  if (zustand !== 'spiel') return;
  tippOffen = true; ton.tipp();
}
function ende() {
  zustand = 'tot'; ton.tot(); schuettel = 14; store.runs++;
  const p = lauf.punkte(), t = lauf.s.t;
  tod = { x: lauf.s.x, t, p };
  for (let i = 0; i < 26; i++) partikel.push({ x: lauf.s.x + PL / 2, d: t * V + PL / 2, vx: (Math.random() - 0.5) * 9, vd: (Math.random() - 0.3) * 9, l: 28 + Math.random() * 20 });
  const tagBest = store.tage[seed] || 0; let rekord = false, tagRekord = false;
  if (p > store.best) { store.best = p; rekord = modus === 'ueben' || modus === 'tag'; }
  if (modus === 'tag' && p > tagBest) { store.tage[seed] = p; tagRekord = true; }
  speichern();
  const lauf2 = { v: SIM_VERSION, seed, inputs: kodiere(tipps), ticks: t, score: p };
  setTimeout(() => ergebnis(p, rekord, tagRekord, lauf2, tagBest), 750);
}
async function melden(l) {
  const p = PS(); if (!p || !p.online) return { status: 'lokal' };
  if (!(p.hatSitzung && p.hatSitzung())) return { status: 'gast' };
  try {
    const t = p.token && p.token(); if (!t) return { status: 'gast' };
    const r = await fetch(CFG().url + '/functions/v1/seitenwechsel-lauf', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + t, apikey: CFG().key || '' }, body: JSON.stringify(l) });
    if (r.status === 404) return { status: 'lokal' };
    const j = await r.json().catch(() => ({}));
    if (r.ok && j.verifiziert) return { status: 'verifiziert', platz: j.platz_heute || null, von: j.spieler_heute || null };
    if (r.ok) return { status: 'abgelehnt', grund: j.grund || '' };
    return { status: 'fehler' };
  } catch (e) { return { status: 'fehler' }; }
}
function ergebnis(p, rekord, tagRekord, l, tagBestVorher) {
  zustand = 'ende'; zeige('sEnde');
  $('ePunkte').textContent = String(p);
  $('eModus').textContent = modus === 'tag' ? 'Tageslauf ' + tagText(seed) : 'Üben (zählt nicht für die Rangliste)';
  $('eBest').textContent = modus === 'tag' ? 'Heute: ' + (store.tage[seed] || 0) + ' · Bestwert: ' + store.best : 'Bestwert: ' + store.best;
  const k = $('eKopf'); k.textContent = rekord ? 'Neuer Bestwert!' : tagRekord && tagBestVorher ? 'Neue Tagesbestleistung!' : 'Berührt!'; k.className = rekord || tagRekord ? 'rek' : '';
  if (rekord || tagRekord) ton.rekord();
  const s = $('eStatus'); s.className = 'status'; s.textContent = '';
  if (modus === 'tag' && tagRekord) {
    s.textContent = 'Wird geprüft …'; $('bNochmal').focus();
    melden(l).then((r) => {
      status = r; if (zustand !== 'ende') return;
      if (r.status === 'verifiziert') { s.className = 'status ok'; s.textContent = '✓ Vom Server nachgefahren und verifiziert' + (r.platz ? ' · Platz ' + r.platz + (r.von ? ' von ' + r.von : '') + ' heute' : ''); }
      else if (r.status === 'gast') s.textContent = 'Melde dich an (Reiter links am Rand), dann kommst du in die Rangliste.';
      else if (r.status === 'abgelehnt') s.textContent = r.grund === 'zu_oft' ? 'Zu viele Meldungen. Gleich wieder versuchen.' : r.grund === 'kein_profil' ? 'Lege zuerst einen Spielernamen an (Konto).' : 'Nicht in die Rangliste übernommen.';
      else if (r.status === 'fehler') s.textContent = 'Rangliste gerade nicht erreichbar. Dein Ergebnis bleibt auf diesem Gerät.';
      else s.textContent = 'Nur auf diesem Gerät gespeichert.';
    });
  } else if (modus === 'tag') s.textContent = 'Dein Tagesbestwert (' + (store.tage[seed] || 0) + ') ist noch nicht geschlagen.';
}

// ---------- Schleife ----------
let acc = 0, last = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(100, now - (last || now)); last = now;
  if (zustand === 'spiel') {
    acc += dt; let n = 0;
    while (acc >= TAKT && n++ < 6) {
      acc -= TAKT; vorX = lauf.s.x; vorT = lauf.s.t;
      const tipp = tippOffen; tippOffen = false; if (tipp) tipps.push(lauf.s.t);
      const weiter = lauf.schritt(tipp);
      if (weiter && lauf.s.t % 6 === 0) $('hP').textContent = String(lauf.punkte());
      if (!weiter) { $('hP').textContent = String(lauf.punkte()); ende(); break; }
      if (lauf.s.t % 2 === 0) partikel.push({ x: lauf.s.x + PL / 2, d: lauf.s.t * V, vx: -lauf.s.dir * 0.6, vd: -1.5, l: 14 });
    }
    if (acc > TAKT * 6) acc = 0;
  } else if (zustand === 'tot' || zustand === 'ende') { acc = 0; }
  if (schuettel > 0) schuettel -= 1;
  for (const q of partikel) { q.x += q.vx; q.d += q.vd; q.l -= 1; }
  partikel = partikel.filter((q) => q.l > 0);
  zeichne(zustand === 'spiel' ? acc / TAKT : 0);
}

// ---------- Zeichnen ----------
function zeichne(alpha) {
  const { w, h, dpr, sw, ox, s, py } = ansicht;
  cx.setTransform(dpr, 0, 0, dpr, 0, 0);
  cx.fillStyle = '#0d0e15'; cx.fillRect(0, 0, w, h);
  const l = lauf; const t = l ? l.s.t : 0;
  const x = l ? vorX + (l.s.x - vorX) * alpha : 0;
  const tiefe = (l ? t + (zustand === 'spiel' ? alpha : 0) : 0) * V;     // Tiefe der Figur
  const sy = (d) => py - (d - tiefe) * s;
  const sx = (px) => ox + px * s;
  let sx0 = 0, sy0 = 0; if (schuettel > 0) { sx0 = (Math.random() - 0.5) * schuettel * 0.6; sy0 = (Math.random() - 0.5) * schuettel * 0.6; }
  cx.save(); cx.translate(sx0, sy0);
  // Schacht
  const g = cx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#1b1d2e'); g.addColorStop(1, '#232640');
  cx.fillStyle = g; cx.fillRect(ox, -20, sw, h + 40);
  // laufende Streifen für das Tempogefühl
  cx.fillStyle = 'rgba(246,247,249,.045)';
  const ab = 160; const off = ((tiefe % ab) + ab) % ab;
  for (let d = -ab; d < h / s + ab; d += ab) { const y = py + (off - d) * s; cx.fillRect(ox, y, sw, 36 * s); }
  // Stachelblöcke
  if (l) {
    for (let i = l.s.naechster; i < l.s.naechster + 14; i++) {
      const b = l.kurs.block(i); const yTop = sy(b.d1), yBot = sy(b.d0);
      if (yTop > h + 60) continue; if (yBot < -60) break;
      const bw = SPIKE * s, x0 = b.seite === 0 ? ox : ox + sw - bw;
      cx.fillStyle = '#7a1e0e'; cx.fillRect(x0, yTop, bw, yBot - yTop);
      cx.fillStyle = '#c8321a'; cx.fillRect(b.seite === 0 ? x0 : x0 + 8 * s, yTop, bw - 8 * s, yBot - yTop);
      // Zacken zur Mitte hin
      const zack = 22 * s, edge = b.seite === 0 ? x0 + bw : x0; cx.fillStyle = '#FF4A13';
      for (let y = yTop; y < yBot - 1; y += zack) {
        const y2 = Math.min(y + zack, yBot);
        cx.beginPath(); cx.moveTo(edge, y); cx.lineTo(edge + (b.seite === 0 ? 16 : -16) * s, (y + y2) / 2); cx.lineTo(edge, y2); cx.closePath(); cx.fill();
      }
    }
  }
  // Wände
  cx.fillStyle = '#FFD21C'; cx.fillRect(ox - 4, -20, 4, h + 40); cx.fillRect(ox + sw, -20, 4, h + 40);
  // Partikel
  for (const q of partikel) { cx.globalAlpha = Math.max(0, q.l / 40); cx.fillStyle = '#FFD21C'; cx.fillRect(sx(q.x) - 2, sy(q.d) - 2, 4 + 2 * s, 4 + 2 * s); } cx.globalAlpha = 1;
  // Figur
  if (l && zustand !== 'tot' && zustand !== 'ende') {
    const px = sx(x), pyy = sy(tiefe + PL), sz = PL * s;
    cx.fillStyle = '#FFD21C'; rr(px, pyy, sz, sz, 7 * s); cx.fill();
    cx.fillStyle = '#11121A'; const ez = sz * 0.15, ex = l.s.dir > 0 ? sz * 0.55 : sz * 0.22;
    cx.fillRect(px + ex, pyy + sz * 0.3, ez, ez * 1.5); cx.fillRect(px + ex + sz * 0.28, pyy + sz * 0.3, ez, ez * 1.5);
  }
  cx.restore();
}
function rr(x, y, w, h, r) { cx.beginPath(); cx.moveTo(x + r, y); cx.arcTo(x + w, y, x + w, y + h, r); cx.arcTo(x + w, y + h, x, y + h, r); cx.arcTo(x, y + h, x, y, r); cx.arcTo(x, y, x + w, y, r); cx.closePath(); }

// ---------- Bedienung ----------
function ansichtWechsel(z) { zustand = z; zeige(z === 'titel' ? 'sTitel' : z === 'ende' ? 'sEnde' : z === 'rang' ? 'sRang' : null); }
function titel() {
  ansichtWechsel('titel'); lauf = null; partikel = [];
  const t = heute(); $('tTag').textContent = tagText(t);
  $('tBest').textContent = (store.tage[t] ? 'Heute: ' + store.tage[t] + ' · ' : '') + 'Bestwert: ' + store.best;
}
cv.addEventListener('pointerdown', (e) => { e.preventDefault(); if (zustand === 'bereit' || zustand === 'spiel') tippen(); });
addEventListener('keydown', (e) => {
  if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
  const k = e.key;
  if (zustand === 'bereit' || zustand === 'spiel') { if (k === ' ' || k === 'ArrowLeft' || k === 'ArrowRight' || k === 'ArrowUp' || k === 'ArrowDown' || k === 'Enter') { e.preventDefault(); tippen(); } }
  else if (zustand === 'ende' && (k === ' ' || k === 'Enter') && document.activeElement === document.body) { e.preventDefault(); startLauf(modus); }
});
$('bTag').addEventListener('click', () => startLauf('tag'));
$('bUeben').addEventListener('click', () => startLauf('ueben'));
$('bNochmal').addEventListener('click', () => startLauf(modus));
$('bMenue').addEventListener('click', titel);
$('bTeilen').addEventListener('click', async () => {
  const url = location.origin + location.pathname.replace(/\/$/, '');
  const text = 'Ich habe ' + $('ePunkte').textContent + ' Punkte bei Seitenwechsel geschafft. Schaffst du mehr?';
  try { if (navigator.share) { await navigator.share({ title: 'Seitenwechsel', text, url }); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
  const b = $('bTeilen');
  try { await navigator.clipboard.writeText(text + ' ' + url); b.textContent = 'Link kopiert ✓'; } catch (e) { b.textContent = url; }
  setTimeout(() => { b.textContent = 'Teilen'; }, 2500);
});
$('bTon').addEventListener('click', () => { store.sound = !store.sound; speichern(); $('bTon').setAttribute('aria-pressed', String(store.sound)); $('bTon').textContent = store.sound ? 'Ton an' : 'Ton aus'; ton.start(); });
for (const id of ['bRang', 'bRang2']) $(id).addEventListener('click', () => rangliste('heute'));
$('bRangZu').addEventListener('click', () => ($('sRang').dataset.von === 'ende' && lauf ? ansichtWechsel('ende') : titel()));

// ---------- Rangliste ----------
let rangZeit = 'heute';
async function rangliste(zeit) {
  rangZeit = zeit; const vorher = zustand === 'ende' ? 'ende' : 'titel'; ansichtWechsel('rang'); $('sRang').dataset.von = vorher;
  for (const b of document.querySelectorAll('#rTabs button')) b.setAttribute('aria-pressed', String(b.dataset.z === zeit));
  const liste = $('rListe'); liste.textContent = 'Lädt …';
  const p = PS();
  if (!p || !p.online || !p.rpc) { liste.textContent = 'Die Rangliste ist gerade nicht verfügbar.'; return; }
  const res = await p.rpc('seitenwechsel_rangliste', { p_zeitraum: zeit, p_anzahl: 50 });
  if (!res || res.fehler) { liste.textContent = 'Rangliste gerade nicht erreichbar.'; return; }
  const rows = res.daten || [];
  if (zeit !== rangZeit) return;
  liste.textContent = '';
  if (!rows.length) { liste.textContent = zeit === 'heute' ? 'Heute noch kein Eintrag. Sei der Erste!' : 'Noch keine Einträge.'; return; }
  const av = (p.avatare || []);
  for (const r of rows) {
    const li = document.createElement('li'); if (r.ich) li.className = 'ich';
    const emo = av[(parseInt(String(r.avatar || 'a1').slice(1), 10) || 1) - 1] || '🙂';
    const a = document.createElement('span'); a.className = 'pl'; a.textContent = String(r.platz);
    const b = document.createElement('span'); b.className = 'av'; b.textContent = emo;
    const c = document.createElement('span'); c.className = 'nm'; c.textContent = r.name + (r.ich ? ' (du)' : '');
    const d = document.createElement('b'); d.textContent = String(r.punkte);
    li.append(a, b, c, d); liste.appendChild(li);
  }
}
for (const b of document.querySelectorAll('#rTabs button')) b.addEventListener('click', () => rangliste(b.dataset.z));

// ---------- Start ----------
laden(); gr(); titel(); requestAnimationFrame(frame);
$('bTon').setAttribute('aria-pressed', String(store.sound)); $('bTon').textContent = store.sound ? 'Ton an' : 'Ton aus';
window.__sw = { get zustand() { return zustand; }, get lauf() { return lauf; }, get tipps() { return tipps; }, get seed() { return seed; }, heute, store: () => store };
