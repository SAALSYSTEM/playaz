// PUNKTLANDUNG: Darstellung, Steuerung, Ton, Speicherstand, Tageslauf und Rangliste. Regeln stehen in sim.js.
import { SIM_VERSION, VOLL, tempo, breite, neuerLauf, kodiere } from './sim.js';

const $ = (id) => document.getElementById(id);
const CFG = () => window.PLAYSAAL_CFG || {};
const PS = () => window.PlaySaal || null;
const KEY = 'punktlandung.v1';
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
  treffer(n) { const f = 440 * Math.pow(2, Math.min(n, 36) / 12); this.piep(f, f * 1.5, 0.11, 'triangle', 0.12); },
  tot() { this.piep(220, 50, 0.35, 'sawtooth', 0.13); },
  rekord() { [0, 90, 180].forEach((ms, i) => setTimeout(() => this.piep(520 * (1 + i * 0.25), 520 * (1 + i * 0.25), 0.16, 'square', 0.07), ms)); }
};

// ---------- Zustand ----------
const cv = $('c'), cx = cv.getContext('2d');
let zustand = 'titel';           // titel | bereit | spiel | tot | ende | rang
let modus = 'tag';               // tag (Rangliste) | ueben
let seed = 0, lauf = null, tipps = [], tippOffen = false;
let ansicht = { w: 0, h: 0, dpr: 1, mx: 0, my: 0, r: 0 };
let partikel = [], schuettel = 0, blitz = 0, puls = 0, tod = null;
let status = null;               // Ergebnis der Server-Prüfung

function gr() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2), w = window.innerWidth, h = window.innerHeight;
  cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
  ansicht = { w, h, dpr, mx: w / 2, my: h * 0.47, r: Math.max(80, Math.min(w * 0.4, h * 0.3, 260)) };
}
addEventListener('resize', gr);

function zeige(id) { for (const s of ['sTitel', 'sEnde', 'sRang']) $(s).hidden = s !== id; $('hud').hidden = !(zustand === 'bereit' || zustand === 'spiel' || zustand === 'tot'); }

// ---------- Lauf ----------
function startLauf(m) {
  modus = m; ton.start();
  seed = m === 'tag' ? heute() : 20200101 + Math.floor(Math.random() * 7e6);
  lauf = neuerLauf(seed); tipps = []; tippOffen = false; partikel = []; schuettel = 0; blitz = 0; puls = 0; tod = null; status = null;
  zustand = 'bereit'; zeige(null);
  $('hP').textContent = '0'; $('hB').textContent = String(m === 'tag' ? (store.tage[seed] || 0) : store.best);
  $('hMod').textContent = m === 'tag' ? 'Tageslauf ' + tagText(seed) : 'Üben';
  $('hint').hidden = false;
}
function tippen() {
  if (zustand === 'bereit') { zustand = 'spiel'; $('hint').hidden = true; acc = 0; return; }   // der erste Tipp startet nur
  if (zustand !== 'spiel') return;
  tippOffen = true;
}
function treffer() {
  const n = lauf.s.n; ton.treffer(n); puls = 14; $('hP').textContent = String(n);
  const { mx, my, r } = ansicht, th = zielWinkel();
  for (let i = 0; i < 14; i++) { const ang = Math.random() * 6.283, sp = 1.5 + Math.random() * 3.5; partikel.push({ x: mx + Math.cos(th) * r, y: my + Math.sin(th) * r, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, l: 20 + Math.random() * 14 }); }
}
function ende() {
  zustand = 'tot'; ton.tot(); schuettel = 14; blitz = 18; store.runs++;
  const p = lauf.punkte(), t = lauf.s.t;
  tod = { p };
  const { mx, my, r } = ansicht;
  for (let i = 0; i < 26; i++) { const ang = Math.random() * 6.283, sp = 1 + Math.random() * 5; partikel.push({ x: mx + Math.cos(winkel(lauf.s.a)) * r, y: my + Math.sin(winkel(lauf.s.a)) * r, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, l: 26 + Math.random() * 20 }); }
  const tagBest = store.tage[seed] || 0; let rekord = false, tagRekord = false;
  if (p > store.best) { store.best = p; rekord = true; }
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
    const r = await fetch(CFG().url + '/functions/v1/punktlandung-lauf', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + t, apikey: CFG().key || '' }, body: JSON.stringify(l) });
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
  const k = $('eKopf'); k.textContent = rekord ? 'Neuer Bestwert!' : tagRekord && tagBestVorher ? 'Neue Tagesbestleistung!' : 'Verfehlt!'; k.className = rekord || tagRekord ? 'rek' : '';
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
      acc -= TAKT;
      const tipp = tippOffen; tippOffen = false; if (tipp) tipps.push(lauf.s.t);
      const vorher = lauf.s.n, weiter = lauf.schritt(tipp);
      if (lauf.s.n > vorher) treffer();
      if (!weiter) { ende(); break; }
    }
    if (acc > TAKT * 6) acc = 0;
  } else if (zustand === 'tot' || zustand === 'ende') { acc = 0; }
  if (schuettel > 0) schuettel -= 1;
  if (blitz > 0) blitz -= 1;
  if (puls > 0) puls -= 1;
  for (const q of partikel) { q.x += q.vx; q.y += q.vy; q.vy += 0.08; q.l -= 1; }
  partikel = partikel.filter((q) => q.l > 0);
  zeichne(zustand === 'spiel' ? acc / TAKT : 0);
}

// ---------- Zeichnen ----------
// Winkel: 0 = oben, im Uhrzeigersinn; Tausendstelgrad -> Bogenmaß für Canvas
const winkel = (a) => (a / VOLL) * 2 * Math.PI - Math.PI / 2;
function zielWinkel() { return winkel(lauf.ziel()); }
function zeichne(alpha) {
  const { w, h, dpr, mx, my, r } = ansicht;
  cx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const g = cx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#171829'); g.addColorStop(1, '#0d0e15');
  cx.fillStyle = g; cx.fillRect(0, 0, w, h);
  let sx0 = 0, sy0 = 0; if (schuettel > 0) { sx0 = (Math.random() - 0.5) * schuettel * 0.8; sy0 = (Math.random() - 0.5) * schuettel * 0.8; }
  cx.save(); cx.translate(sx0, sy0);
  const l = lauf, n = l ? l.s.n : 0, wd = l ? breite(n) : 16000, v = l ? tempo(n) : 2400;
  const breit = Math.max(10, r * 0.2);
  // Ring
  cx.lineCap = 'round';
  cx.lineWidth = breit; cx.strokeStyle = '#232640'; cx.beginPath(); cx.arc(mx, my, r, 0, 7); cx.stroke();
  if (puls > 0) { cx.lineWidth = 3; cx.strokeStyle = 'rgba(255,210,28,' + (puls / 14 * 0.7) + ')'; cx.beginPath(); cx.arc(mx, my, r + breit * 0.5 + (14 - puls) * 2.5, 0, 7); cx.stroke(); }
  if (l) {
    const a = l.s.a + (zustand === 'spiel' ? l.s.dir * v * alpha : 0);
    // Zielfeld
    const z = l.ziel(), z0 = winkel(z - wd), z1 = winkel(z + wd);
    cx.lineWidth = breit; cx.strokeStyle = blitz > 0 && zustand !== 'spiel' ? '#FF4A13' : '#FFD21C';
    cx.beginPath(); cx.arc(mx, my, r, z0, z1); cx.stroke();
    cx.lineWidth = breit * 0.34; cx.strokeStyle = 'rgba(17,18,26,.55)'; cx.beginPath(); cx.arc(mx, my, r, winkel(z - 1500), winkel(z + 1500)); cx.stroke();
    // Spur hinter dem Zeiger
    const sp = 38000 * l.s.dir;
    for (let i = 0; i < 6; i++) { cx.lineWidth = breit * (0.5 - i * 0.07); cx.strokeStyle = 'rgba(255,146,0,' + (0.38 - i * 0.06) + ')'; cx.beginPath(); const a1 = winkel(a - sp * i / 6), a2 = winkel(a - sp * (i + 1) / 6); if (l.s.dir > 0) cx.arc(mx, my, r, a2, a1); else cx.arc(mx, my, r, a1, a2); cx.stroke(); }
    // Zeiger
    const wa = winkel(a), px = mx + Math.cos(wa) * r, py = my + Math.sin(wa) * r;
    cx.lineWidth = 3; cx.strokeStyle = 'rgba(246,247,249,.35)'; cx.beginPath(); cx.moveTo(mx + Math.cos(wa) * r * 0.2, my + Math.sin(wa) * r * 0.2); cx.lineTo(px, py); cx.stroke();
    cx.fillStyle = '#FF9200'; cx.beginPath(); cx.arc(px, py, breit * 0.46, 0, 7); cx.fill();
    cx.fillStyle = '#fff'; cx.beginPath(); cx.arc(px, py, breit * 0.2, 0, 7); cx.fill();
  }
  // Punkte in der Mitte
  cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.fillStyle = '#f6f7f9';
  cx.font = '700 ' + Math.round(r * 0.78) + 'px "Barlow Condensed","Arial Narrow",system-ui,sans-serif'; cx.fillText(String(n), mx, my + r * 0.04);
  for (const q of partikel) { cx.globalAlpha = Math.max(0, q.l / 30); cx.fillStyle = '#FFD21C'; cx.fillRect(q.x - 2, q.y - 2, 4, 4); } cx.globalAlpha = 1;
  cx.restore();
}

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
  const b = $('bTeilen');
  const url = location.origin + location.pathname.replace(/\/$/, '');
  const text = 'Ich habe ' + $('ePunkte').textContent + ' Punkte bei Punktlandung geschafft. Schaffst du mehr?';
  const fertig = (msg) => { b.textContent = msg; setTimeout(() => { b.textContent = 'Teilen'; }, 2500); };
  b.textContent = 'Teilen …';
  try {
    if (navigator.share) { await navigator.share({ title: 'Punktlandung', text, url }); b.textContent = 'Teilen'; return; }
  } catch (e) { if (e && e.name === 'AbortError') { b.textContent = 'Teilen'; return; } }
  try { await navigator.clipboard.writeText(text + ' ' + url); fertig('Link kopiert ✓'); }
  catch (e) { try { const ta = document.createElement('textarea'); ta.value = text + ' ' + url; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); fertig('Link kopiert ✓'); } catch (e2) { fertig(url); } }
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
  const res = await p.rpc('punktlandung_rangliste', { p_zeitraum: zeit, p_anzahl: 50 });
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
window.__pl = { get zustand() { return zustand; }, get lauf() { return lauf; }, get tipps() { return tipps; }, get seed() { return seed; }, heute, store: () => store };
