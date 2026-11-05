// NEUNMALKLUG: Oberfläche, Bedienung, Ton, Speicherstand, freies Spiel, Tagesrätsel und Rangliste.
// Regeln und Rätselbau stehen in sim.js (dieselbe Datei prüft auf dem Server die Lösung des Tagesrätsels).
// Das Brett ist reines HTML (Knöpfe im Raster), Bilder braucht das Spiel nicht. Ein optionaler Hintergrund
// (img/nk-hintergrund.webp, darf animiert sein) wird geladen, wenn es die Datei gibt.
import { KONFIG, STUFEN, STUFEN_LISTE, NACHBARN, BLOCK, baueRaetsel, tagesRaetsel, tagesStufe, kodiere, dekodiere, konflikte } from './sim.js';

const $ = (id) => document.getElementById(id);
const CFG = () => window.PLAYSAAL_CFG || {};
const PS = () => window.PlaySaal || null;
const KEY = 'neunmalklug.v1';
const WENIG_BEWEGUNG = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);

// ---------- Speicherstand ----------
// stats[stufe] = { n: gelöst, z: Bestzeit in Hundertsteln }; tage[JJJJMMTT] = { z }; frei = laufende freie Partie;
// offen = angefangenes Tagesrätsel (Fortsetzen nach Neuladen); fehler = Fehler im freien Spiel sofort zeigen
let store = { v: 1, sound: true, fehler: true, stats: {}, tage: {}, frei: null, offen: null };
const ganz = (x, max) => Math.max(0, Math.min(max, Math.floor(Number(x) || 0)));
const notizenOk = (a) => Array.isArray(a) && a.length === 81 && a.every((m) => Number.isInteger(m) && m >= 0 && m <= 0x3FE);
function laden() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!d || typeof d !== 'object') return;
    store.sound = d.sound !== false; store.fehler = d.fehler !== false;
    if (d.stats && typeof d.stats === 'object') for (const s of STUFEN_LISTE) { const x = d.stats[s]; if (x && typeof x === 'object') store.stats[s] = { n: ganz(x.n, 1e6), z: ganz(x.z, 1e8) }; }
    if (d.tage && typeof d.tage === 'object') for (const k of Object.keys(d.tage).slice(-400)) { const t = d.tage[k]; if (/^\d{8}$/.test(k) && t && typeof t === 'object') store.tage[k] = { z: ganz(t.z, 1e8) }; }
    const f = d.frei;
    if (f && typeof f === 'object' && STUFEN[f.stufe] && Number.isInteger(f.seed) && dekodiere(f.g) && notizenOk(f.n))
      store.frei = { stufe: f.stufe, seed: f.seed, g: f.g, n: f.n, cs: ganz(f.cs, 1e8), hilfe: ganz(f.hilfe, 81) };
    const o = d.offen;
    if (o && typeof o === 'object' && /^\d{8}$/.test(String(o.tag)) && Number.isInteger(o.seed) && Number.isInteger(o.version) && dekodiere(o.g) && notizenOk(o.n))
      store.offen = { tag: String(o.tag), seed: o.seed, version: o.version, run: typeof o.run === 'string' ? o.run : null, t0: Number(o.t0) || 0, g: o.g, n: o.n };
  } catch (e) {}
}
function speichern() {
  const keys = Object.keys(store.tage).sort(); while (keys.length > 400) delete store.tage[keys.shift()];
  try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) {}
}
const tagText = (n) => { const s = String(n); return s.slice(6, 8) + '.' + s.slice(4, 6) + '.'; };
const tagVoll = (n) => tagText(n) + String(n).slice(0, 4);
const zeitText = (cs) => { cs = Math.max(0, Math.floor(cs)); const s = Math.floor(cs / 100), m = Math.floor(s / 60), h = Math.floor(m / 60); return (h ? h + ':' + String(m % 60).padStart(2, '0') : m) + ':' + String(s % 60).padStart(2, '0'); };
const zeitGenau = (cs) => zeitText(cs) + ',' + String(Math.floor(cs % 100)).padStart(2, '0');
const zeitGenauKurz = (cs) => (cs >= 6000 ? zeitText(cs) + ' min' : (cs / 100).toFixed(2).replace('.', ',') + ' s');
function heuteLokal() {
  try { const p = new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()); const g = (t) => p.find((x) => x.type === t).value; return g('year') + g('month') + g('day'); }
  catch (e) { const d = new Date(); return String(d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate()); }
}
function vortag(t) { const d = new Date(Date.UTC(+t.slice(0, 4), +t.slice(4, 6) - 1, +t.slice(6, 8) - 1)); return d.getUTCFullYear() + String(d.getUTCMonth() + 1).padStart(2, '0') + String(d.getUTCDate()).padStart(2, '0'); }
// Serie: Tage in Folge mit gelöstem Tagesrätsel (bis heute oder gestern)
function serie() { let t = heuteLokal(); if (!store.tage[t]) t = vortag(t); let n = 0; while (store.tage[t]) { n++; t = vortag(t); } return n; }

// ---------- Optionaler Hintergrund ----------
(() => { const b = new Image(); b.onload = () => { document.body.classList.add('bild'); document.body.style.backgroundImage = 'url(neunmalklug/img/nk-hintergrund.webp)'; }; b.src = 'neunmalklug/img/nk-hintergrund.webp'; })();

// ---------- Ton ----------
const ton = (() => {
  let ac = null;
  const piep = (f, d, typ = 'sine', vol = 0.1, gleit = 0) => {
    if (!store.sound || !ac) return; const t = ac.currentTime, o = ac.createOscillator(), g = ac.createGain();
    o.type = typ; o.frequency.setValueAtTime(f, t); if (gleit) o.frequency.exponentialRampToValueAtTime(gleit, t + d);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d); o.connect(g).connect(ac.destination); o.start(t); o.stop(t + d + 0.02);
  };
  return {
    start() { try { if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)(); if (ac.state === 'suspended') ac.resume(); } catch (e) {} },
    setz() { piep(660, 0.06, 'triangle', 0.07); },
    notiz() { piep(980, 0.03, 'sine', 0.04); },
    fehler() { piep(180, 0.14, 'square', 0.05, 120); },
    einheit() { [784, 988].forEach((f, i) => setTimeout(() => piep(f, 0.12, 'triangle', 0.06), i * 70)); },
    geschafft() { [523, 659, 784, 1047, 1319].forEach((f, i) => setTimeout(() => piep(f, 0.24, 'triangle', 0.09), i * 100)); }
  };
})();

// ---------- Zustand ----------
let zustand = 'titel';      // titel | bereit | laedt | spiel | fertig | ende | stufe | rang | regeln
let modus = null;           // 'frei' | 'tag'
let r = null;               // Rätsel aus sim.js
let g = null, n = null;     // Ziffern (0 = leer) und Notizen (Bitmasken) je Feld
let sel = -1, notizModus = false, verlauf = [], hilfe = 0;
let tagKey = null, runId = null, gastGrund = '', t0 = 0, csVorher = 0, endeCs = 0, letzteMeldung = null, letzteErgebnisse = null, herausforderung = null;

// ---------- Brett aufbauen ----------
const feld = $('feld'), zellen = [];
for (let i = 0; i < 81; i++) {
  const b = document.createElement('button'); b.type = 'button'; b.className = 'z';
  const r0 = Math.floor(i / 9), c0 = i % 9;
  if (c0 % 3 === 2 && c0 < 8) b.classList.add('rr'); if (r0 % 3 === 2 && r0 < 8) b.classList.add('ru');
  const v = document.createElement('span'); v.className = 'v'; const no = document.createElement('span'); no.className = 'no';
  for (let k = 1; k <= 9; k++) { const s = document.createElement('i'); s.textContent = String(k); no.appendChild(s); }
  b.append(v, no); b.addEventListener('pointerdown', (e) => { e.preventDefault(); waehle(i); });
  b.addEventListener('click', (e) => { if (e.detail === 0) waehle(i); });   // Tastatur (Enter/Leertaste)
  feld.appendChild(b); zellen.push(b);
}
const pad = $('pad'), padKnoepfe = [];
for (let k = 1; k <= 9; k++) {
  const b = document.createElement('button'); b.type = 'button'; b.className = 'p';
  const v = document.createElement('b'); v.textContent = String(k); const s = document.createElement('small');
  b.append(v, s); b.setAttribute('aria-label', 'Ziffer ' + k);
  b.addEventListener('pointerdown', (e) => { e.preventDefault(); eingabe(k); });
  b.addEventListener('click', (e) => { if (e.detail === 0) eingabe(k); });
  pad.appendChild(b); padKnoepfe.push(b);
}
function groesse() {
  const b = $('brett').getBoundingClientRect();
  const z = Math.max(24, Math.floor(Math.min(b.width - 4, b.height - 4) / 9));
  feld.style.width = feld.style.height = z * 9 + 'px'; feld.style.setProperty('--z', z + 'px');
}
addEventListener('resize', groesse);

// ---------- Darstellung ----------
let wackelt = -1;
function zeichne() {
  if (!r) { for (const b of zellen) { b.classList.remove('vg', 'ich', 'sel', 'nb', 'gl', 'kf', 'fx'); b.querySelector('.v').textContent = ''; b.querySelector('.no').classList.remove('an'); } hud(); return; }
  const kf = konflikte(g), selV = sel >= 0 ? g[sel] : 0, nb = sel >= 0 ? new Set(NACHBARN[sel]) : null;
  const zeigFehler = modus === 'frei' && store.fehler;
  for (let i = 0; i < 81; i++) {
    const b = zellen[i], v = g[i], cl = b.classList;
    cl.toggle('vg', !!r.raetsel[i]); cl.toggle('ich', !r.raetsel[i] && !!v);
    cl.toggle('sel', i === sel); cl.toggle('nb', !!nb && nb.has(i) && i !== sel);
    cl.toggle('gl', !!selV && v === selV && i !== sel);
    cl.toggle('kf', !!v && kf[i] && !r.raetsel[i]);
    cl.toggle('fx', zeigFehler && !!v && !r.raetsel[i] && v !== r.loesung[i]);
    b.querySelector('.v').textContent = v ? String(v) : '';
    const no = b.querySelector('.no'); no.classList.toggle('an', !v && !!n[i]);
    if (!v && n[i]) { const s = no.children; for (let k = 1; k <= 9; k++) { const da = !!(n[i] & (1 << k)); s[k - 1].classList.toggle('x', da); s[k - 1].classList.toggle('gl', da && k === selV); } }
    const zeile = Math.floor(i / 9) + 1, spalte = i % 9 + 1;
    b.setAttribute('aria-label', 'Zeile ' + zeile + ', Spalte ' + spalte + ': ' + (v ? v + (r.raetsel[i] ? ' (vorgegeben)' : '') : n[i] ? 'Notizen ' + [1, 2, 3, 4, 5, 6, 7, 8, 9].filter((k) => n[i] & (1 << k)).join(' ') : 'leer'));
  }
  // Ziffernleiste: wie oft jede Ziffer noch fehlt
  const zahl = new Array(10).fill(0); for (let i = 0; i < 81; i++) if (g[i]) zahl[g[i]]++;
  for (let k = 1; k <= 9; k++) { const b = padKnoepfe[k - 1], rest = 9 - zahl[k]; b.querySelector('small').textContent = rest > 0 ? String(rest) : '✓'; b.classList.toggle('voll', rest <= 0); b.classList.toggle('gl', k === selV); }
  $('bNotiz').setAttribute('aria-pressed', String(notizModus)); $('bNotiz').classList.toggle('an', notizModus);
  $('bZurueck').disabled = !verlauf.length;
  hud();
}
function hud() {
  if (!r) { $('hOffen').textContent = '–'; $('hStufe').textContent = '–'; return; }
  let offen = 0; for (let i = 0; i < 81; i++) if (!g[i]) offen++;
  $('hOffen').textContent = String(offen); $('hStufe').textContent = STUFEN[r.stufe].name;
}
function blitz(i, kl) { const b = zellen[i]; b.classList.remove(kl); void b.offsetWidth; b.classList.add(kl); setTimeout(() => b.classList.remove(kl), 700); }
function hinweis(text, fett) { const e = $('hinweis'); e.textContent = text || ''; if (fett) { const b = document.createElement('b'); b.textContent = fett; e.appendChild(b); } }
function standardHinweis() {
  if (!r) return hinweis('');
  if (modus === 'tag') return hinweis('Tagesrätsel ' + tagText(tagKey) + ' · ' + STUFEN[r.stufe].name + ' · ', runId ? 'erster Versuch zählt' : 'ohne Konto nur auf diesem Gerät');
  if (herausforderung) return hinweis('Herausforderung: schneller als ', zeitText(herausforderung.t));
  hinweis(notizModus ? 'Notizen an: Ziffern werden klein notiert' : 'Feld antippen, dann Ziffer wählen');
}

// ---------- Eingabe ----------
function waehle(i) {
  if (zustand !== 'spiel') return;
  ton.start(); sel = i; zeichne();
}
function merke() { verlauf.push({ g: g.slice(), n: n.slice() }); if (verlauf.length > 300) verlauf.shift(); }
function eingabe(k) {
  if (zustand !== 'spiel' || sel < 0) return;
  ton.start();
  if (r.raetsel[sel]) { ton.fehler(); blitz(sel, 'wack'); return; }
  if (notizModus) {
    if (g[sel]) return;
    merke(); n[sel] ^= 1 << k; ton.notiz();
  } else {
    if (g[sel] === k) { merke(); g[sel] = 0; }
    else {
      merke(); g[sel] = k; n[sel] = 0;
      for (const j of NACHBARN[sel]) n[j] &= ~(1 << k);   // Notiz der Ziffer bei Nachbarn wegnehmen
      const kf = konflikte(g);
      if (kf[sel] || (modus === 'frei' && store.fehler && k !== r.loesung[sel])) ton.fehler();
      else if (einheitVoll(sel)) { ton.einheit(); if (!WENIG_BEWEGUNG) for (const j of einheitVoll(sel)) blitz(j, 'welle'); }
      else ton.setz();
    }
  }
  nachZug();
}
function einheitVoll(i) {
  // gibt die Felder einer gerade vollständig und richtig gefüllten Zeile/Spalte/Block zurück
  const r0 = Math.floor(i / 9), c0 = i % 9, b0 = BLOCK[i], fertig = [];
  const gruppen = [[...Array(9)].map((_, m) => r0 * 9 + m), [...Array(9)].map((_, m) => m * 9 + c0), [...Array(81).keys()].filter((j) => BLOCK[j] === b0)];
  for (const gr of gruppen) if (gr.every((j) => g[j] === r.loesung[j])) fertig.push(...gr);
  return fertig.length ? fertig : null;
}
function loeschen() {
  if (zustand !== 'spiel' || sel < 0 || r.raetsel[sel]) return;
  if (!g[sel] && !n[sel]) return;
  merke(); g[sel] = 0; n[sel] = 0; nachZug();
}
function zurueck() {
  if (zustand !== 'spiel' || !verlauf.length) return;
  const v = verlauf.pop(); g = v.g; n = v.n; nachZug(true);
}
function tipp() {
  if (zustand !== 'spiel' || modus !== 'frei') return;
  ton.start();
  // Erst einen Fehler zeigen, sonst ein leeres Feld lösen (das gewählte oder das mit den wenigsten Möglichkeiten)
  let i = -1;
  for (let j = 0; j < 81; j++) if (g[j] && g[j] !== r.loesung[j]) { i = j; break; }
  if (i >= 0) { sel = i; zeichne(); blitz(i, 'wack'); ton.fehler(); return hinweis('Hier stimmt etwas nicht: ', 'Zeile ' + (Math.floor(i / 9) + 1) + ', Spalte ' + (i % 9 + 1)); }
  if (sel >= 0 && !g[sel]) i = sel;
  else {
    let best = 10;
    for (let j = 0; j < 81; j++) if (!g[j]) { let m = 0x3FE; for (const x of NACHBARN[j]) if (g[x]) m &= ~(1 << g[x]); let c = 0; for (let k = 1; k <= 9; k++) if (m & (1 << k)) c++; if (c < best) { best = c; i = j; } }
  }
  if (i < 0) return;
  merke(); g[i] = r.loesung[i]; n[i] = 0; for (const j of NACHBARN[i]) n[j] &= ~(1 << g[i]);
  hilfe++; sel = i; ton.setz(); blitz(i, 'welle'); nachZug();
}
function nachZug(still) {
  speichereLauf(); zeichne();
  if (!still) standardHinweis();
  if (g.every((v, i) => v === r.loesung[i])) geloest();
}
function speichereLauf() {
  if (modus === 'frei' && r) store.frei = { stufe: r.stufe, seed: r.seed, g: kodiere(g), n: n.slice(), cs: laufCs(), hilfe };
  else if (modus === 'tag' && store.offen) { store.offen.g = kodiere(g); store.offen.n = n.slice(); }
  speichern();
}
addEventListener('keydown', (e) => {
  if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
  if (zustand !== 'spiel' || !r) return;
  const k = e.key;
  if (/^[1-9]$/.test(k)) { e.preventDefault(); if (sel < 0) sel = 0; eingabe(Number(k)); return; }
  const pf = { ArrowUp: -9, ArrowDown: 9, ArrowLeft: -1, ArrowRight: 1 }[k];
  if (pf) { e.preventDefault(); if (sel < 0) sel = 40; else { const x = sel % 9, y = Math.floor(sel / 9); const nx = Math.max(0, Math.min(8, x + (pf === 1 ? 1 : pf === -1 ? -1 : 0))), ny = Math.max(0, Math.min(8, y + (pf === 9 ? 1 : pf === -9 ? -1 : 0))); sel = ny * 9 + nx; } zeichne(); return; }
  if (k === 'Backspace' || k === 'Delete' || k === '0') { e.preventDefault(); loeschen(); return; }
  if (k === 'n' || k === 'N') { notizModus = !notizModus; zeichne(); standardHinweis(); return; }
  if ((k === 'z' || k === 'Z') && (e.ctrlKey || e.metaKey)) { e.preventDefault(); zurueck(); }
});
$('bNotiz').addEventListener('click', () => { notizModus = !notizModus; ton.start(); zeichne(); standardHinweis(); });
$('bLoesch').addEventListener('click', loeschen);
$('bZurueck').addEventListener('click', zurueck);
$('bTipp').addEventListener('click', tipp);
for (const id of ['bNotiz', 'bLoesch', 'bZurueck', 'bTipp']) $(id).addEventListener('pointerdown', (e) => e.preventDefault());

// ---------- Uhr ----------
function laufCs() { return zustand === 'spiel' ? csVorher + Math.floor((Date.now() - t0) / 10) : endeCs; }
// Im freien Spiel hält die Uhr an, solange die Seite verdeckt ist. Beim Tagesrätsel läuft sie weiter (Server misst).
document.addEventListener('visibilitychange', () => {
  if (modus !== 'frei' || zustand !== 'spiel') return;
  if (document.hidden) { csVorher = laufCs(); t0 = Date.now(); speichereLauf(); pausiert = true; }
  else if (pausiert) { t0 = Date.now(); pausiert = false; }
});
let pausiert = false;

// ---------- Spiel starten ----------
function starte(raetsel, gText, notizen) {
  r = raetsel; g = (gText && dekodiere(gText)) || r.raetsel.slice(); n = notizen ? notizen.slice() : new Array(81).fill(0);
  for (let i = 0; i < 81; i++) if (r.raetsel[i]) { g[i] = r.raetsel[i]; n[i] = 0; }
  sel = -1; verlauf = []; notizModus = false; pausiert = false;
  zustand = 'spiel'; zeige(null); groesse(); zeichne(); standardHinweis();
  $('bTipp').hidden = modus !== 'frei';
  if (g.every((v, i) => v === r.loesung[i])) geloest();
}
function starteFrei(stufe, seed, weiter) {
  ton.start(); modus = 'frei'; runId = null; tagKey = null;
  const rr = baueRaetsel(seed, stufe);
  $('titelzeile').textContent = 'Freies Spiel · ' + STUFEN[stufe].name;
  csVorher = weiter ? weiter.cs : 0; hilfe = weiter ? weiter.hilfe : 0; t0 = Date.now();
  starte(rr, weiter ? weiter.g : null, weiter ? weiter.n : null);
  speichereLauf();
}
const neuerSeed = () => { try { const a = new Uint32Array(1); crypto.getRandomValues(a); return 1 + (a[0] % 2147483646); } catch (e) { return 1 + Math.floor(Math.random() * 2147483646); } };

// ---------- Tagesrätsel: Server ----------
const angemeldet = () => { const p = PS(); return !!(p && p.hatSitzung && p.hatSitzung() && p.token && p.token()); };
async function besorgeTag() {
  const p = PS(); if (!p || !p.online || !p.rpc) return { ok: false, grund: 'offline' };
  gastGrund = '';
  if (angemeldet()) {
    const r1 = await p.rpc('neunmalklug_start', {});
    const d = r1 && !r1.fehler ? r1.daten : null;
    if (d && d.ok) return pruefeInfo(d, d.run_id);
    if (d && d.grund === 'schon_geloest') return { ok: false, grund: 'schon_geloest', ergebnis: d };
    if (d && d.grund === 'zu_oft') return { ok: false, grund: 'zu_oft' };
    if (d && d.grund === 'kein_profil') gastGrund = 'kein_profil';
    else if (r1 && r1.status === 401) gastGrund = 'abgelaufen';
    else return { ok: false, grund: 'netz' };
  }
  const r2 = await p.rpc('neunmalklug_tag', {});
  if (!r2 || r2.fehler || !r2.daten || !r2.daten.seed) return { ok: false, grund: 'netz' };
  return pruefeInfo(r2.daten, null);
}
function pruefeInfo(d, run) {
  if (!KONFIG[d.version] || !Number.isInteger(d.seed) || !/^\d{8}$/.test(String(d.tag))) return { ok: false, grund: 'version' };
  return { ok: true, seed: d.seed, version: d.version, tag: String(d.tag), runId: run || null, sek: Number(d.sek) || 0 };
}
const FEHLERTEXT = {
  offline: 'Das Tagesrätsel braucht eine Verbindung zum Server. Freies Spiel geht auch offline.',
  netz: 'Der Server ist gerade nicht erreichbar. Freies Spiel geht trotzdem.',
  zu_oft: 'Zu viele Versuche in kurzer Zeit. Gleich noch einmal.',
  version: 'Das heutige Rätsel braucht eine neuere Version des Spiels. Seite neu laden.'
};
function bereit() {
  zustand = 'bereit'; zeige('sBereit'); $('bStatus').textContent = ''; $('bStatus').className = 'status';
  const t = heuteLokal(), st = tagesStufe(t);
  $('bTagText').textContent = tagText(t);
  $('bStufe').textContent = st ? 'Heute: ' + STUFEN[st].name : '';
  const offen = store.offen && store.offen.tag === t && store.offen.run;
  $('bText').textContent = angemeldet()
    ? (offen ? 'Du hast das heutige Rätsel schon angefangen. Die Uhr läuft seitdem weiter – weiter geht es da, wo du aufgehört hast.'
      : 'Mit deinem Konto zählt nur dein erster Versuch. Die Uhr startet beim Tippen auf „Los“ und läuft weiter, auch wenn du die Seite schließt. Tipps gibt es im Tagesrätsel nicht.')
    : 'Ohne Konto bleibt deine Zeit auf diesem Gerät. Mit PlaySaal-Konto kommst du in die Tagesrangliste.';
  $('bLos').textContent = offen ? 'Weiterspielen' : 'Los – Uhr starten';
}
async function starteTag() {
  if (zustand === 'laedt') return;
  ton.start(); zustand = 'laedt'; $('bLos').disabled = true; $('bStatus').textContent = 'Rätsel wird geholt …'; $('bStatus').className = 'status';
  const info = await besorgeTag();
  $('bLos').disabled = false;
  if (!info.ok) {
    zustand = 'bereit';
    if (info.grund === 'schon_geloest') { zeigeSchonGeloest(info.ergebnis); return; }
    $('bStatus').className = 'status fehler'; $('bStatus').textContent = FEHLERTEXT[info.grund] || FEHLERTEXT.netz; return;
  }
  const rr = tagesRaetsel(info.seed, info.version, info.tag);
  if (!rr) { zustand = 'bereit'; $('bStatus').className = 'status fehler'; $('bStatus').textContent = FEHLERTEXT.version; return; }
  modus = 'tag'; tagKey = info.tag; runId = info.runId; letzteMeldung = null; herausforderung = null; hilfe = 0;
  $('titelzeile').textContent = 'Tagesrätsel ' + tagText(tagKey);
  const o = store.offen;
  const weiter = o && o.tag === tagKey && o.seed === info.seed && o.version === info.version && (runId ? o.run === runId : !o.run) ? o : null;
  csVorher = 0;
  t0 = runId ? Date.now() - Math.round(info.sek * 1000) : (weiter && weiter.t0 ? weiter.t0 : Date.now());
  store.offen = { tag: tagKey, seed: info.seed, version: info.version, run: runId, t0, g: weiter ? weiter.g : kodiere(rr.raetsel), n: weiter ? weiter.n : new Array(81).fill(0) };
  speichern();
  starte(rr, store.offen.g, store.offen.n);
}
function zeigeSchonGeloest(e) {
  modus = 'tag'; tagKey = String(e.tag || heuteLokal()); r = null; runId = null;
  zustand = 'ende'; zeige('sEnde'); zeichne();
  $('eKopf').textContent = 'Heute schon gelöst'; $('eKopf').className = '';
  $('eZeit').textContent = zeitGenau(e.zeit_cs || 0);
  $('eModus').textContent = 'Tagesrätsel ' + tagText(tagKey) + ' · dein gewerteter Versuch';
  $('eK1T').textContent = 'Platz'; $('eK1').textContent = e.rang ? e.rang.platz + '/' + e.rang.spieler : '–';
  $('eK2T').textContent = 'Serie'; $('eK2').textContent = String(serie());
  $('eStatus').className = 'status'; $('eStatus').textContent = 'Morgen gibt es ein neues Rätsel. Freies Spiel geht jederzeit.';
  $('bWeiter').hidden = false; $('bWeiter').textContent = 'Freies Spiel'; $('bErneut').hidden = true; $('bAnmelden').hidden = true;
  letzteErgebnisse = { tag: tagKey, z: e.zeit_cs || 0, stufe: tagesStufe(tagKey) };
}

// ---------- Gelöst ----------
function geloest() {
  endeCs = laufCs(); zustand = 'fertig'; sel = -1; zeichne(); ton.geschafft();
  hinweis('Neunmalklug! ', 'Alles richtig');
  if (!WENIG_BEWEGUNG) zellen.forEach((b, i) => setTimeout(() => blitz(i, 'welle'), (Math.floor(i / 9) + (i % 9)) * 35));
  setTimeout(ergebnis, WENIG_BEWEGUNG ? 200 : 1300);
}
function ergebnis() {
  zustand = 'ende'; zeige('sEnde');
  const z = endeCs, st = r.stufe;
  $('eZeit').textContent = zeitGenau(z);
  for (const id of ['bErneut', 'bAnmelden']) $(id).hidden = true;
  const s = $('eStatus'); s.className = 'status'; s.textContent = '';
  const k = $('eKopf'); k.className = '';
  letzteErgebnisse = { tag: tagKey, z, stufe: st, seed: modus === 'frei' ? r.seed : null, hilfe };
  if (modus === 'frei') {
    store.frei = null;
    const alt = store.stats[st] || { n: 0, z: 0 };
    const rekord = !hilfe && (!alt.z || z < alt.z);
    store.stats[st] = { n: alt.n + 1, z: rekord ? z : alt.z };
    speichern();
    k.textContent = rekord && alt.z ? 'Neue Bestzeit!' : 'Neunmalklug!'; if (rekord && alt.z) k.className = 'rek';
    $('eModus').textContent = 'Freies Spiel · ' + STUFEN[st].name + (hilfe ? ' · ' + hilfe + (hilfe === 1 ? ' Tipp' : ' Tipps') : '');
    $('eK1T').textContent = 'Bestzeit'; $('eK1').textContent = store.stats[st].z ? zeitText(store.stats[st].z) : '–';
    $('eK2T').textContent = 'Gelöst'; $('eK2').textContent = String(store.stats[st].n);
    if (hilfe) s.textContent = 'Mit Tipps zählt die Zeit nicht als Bestzeit.';
    if (herausforderung) {
      const besser = !hilfe && z < herausforderung.t;
      s.className = 'status' + (besser ? ' ok' : ''); s.textContent = besser ? 'Herausforderung geschafft!' : 'Herausforderung: ' + zeitText(herausforderung.t) + (hilfe ? ' ohne Tipps' : '') + '. Noch ein Rätsel?';
      herausforderung = null;
    }
    $('bWeiter').hidden = false; $('bWeiter').textContent = 'Neues Rätsel';
    return;
  }
  // Tagesrätsel
  const vor = store.tage[tagKey];
  if (!vor || z < vor.z) store.tage[tagKey] = { z };
  store.offen = null; speichern();
  k.textContent = 'Neunmalklug!';
  $('eModus').textContent = 'Tagesrätsel ' + tagText(tagKey) + ' · ' + STUFEN[st].name;
  $('eK1T').textContent = 'Platz'; $('eK1').textContent = '–';
  $('eK2T').textContent = 'Serie'; $('eK2').textContent = serie() + (serie() === 1 ? ' Tag' : ' Tage');
  $('bWeiter').hidden = false; $('bWeiter').textContent = 'Freies Spiel';
  if (runId) { letzteMeldung = { run_id: runId, loesung: kodiere(g) }; sende(); }
  else {
    s.textContent = gastGrund === 'kein_profil' ? 'Ohne Spielernamen zählt das Rätsel nur auf diesem Gerät. Lege im Konto einen Namen an.' : gastGrund === 'abgelaufen' ? 'Deine Anmeldung ist abgelaufen. Melde dich neu an, um morgen in die Rangliste zu kommen.' : 'Nur auf diesem Gerät gespeichert. Mit PlaySaal-Konto kommst du in die Tagesrangliste.';
    $('bAnmelden').hidden = false; $('bAnmelden').textContent = gastGrund === 'kein_profil' ? 'Namen anlegen' : 'Anmelden';
  }
}
async function sende() {
  const s = $('eStatus'); s.className = 'status'; s.textContent = 'Wird vom Server geprüft …'; $('bErneut').hidden = true;
  const m = letzteMeldung;
  const e = await melden(m);
  if (m !== letzteMeldung) return;
  if (e.status === 'verifiziert') {
    runId = null; letzteMeldung = null;
    if (Number.isInteger(e.zeit_cs)) { $('eZeit').textContent = zeitGenau(e.zeit_cs); letzteErgebnisse.z = e.zeit_cs; store.tage[tagKey] = { z: e.zeit_cs }; speichern(); }
    const gg = e.rang; let t = '✓ Vom Server geprüft und gewertet.';
    if (gg) { $('eK1').textContent = gg.platz + '/' + gg.spieler; t += ' Heute Platz ' + gg.platz + ' von ' + gg.spieler + '.'; if (gg.luecke) t += ' ' + zeitGenauKurz(gg.luecke) + ' fehlen bis Platz ' + gg.naechster_platz + '.'; else if (gg.platz === 1) t += ' Du führst.'; hinweis('Heute: Platz ', gg.platz + ' von ' + gg.spieler); }
    s.className = 'status ok'; s.textContent = t;
  } else if (e.status === 'abgelehnt') {
    runId = null; letzteMeldung = null; s.className = 'status fehler';
    s.textContent = e.grund === 'abgelaufen' ? 'Das Rätsel war zu lange offen und wird nicht gewertet.' : e.grund === 'schon_abgeschlossen' ? 'Dieser Versuch wurde schon gewertet.' : e.grund === 'zu_schnell' ? 'So schnell löst niemand ein Sudoku. Das Ergebnis wird nicht gewertet.' : 'Der Server hat dieses Ergebnis nicht bestätigt. Es steht nicht in der Rangliste.';
  } else { s.className = 'status fehler'; s.textContent = 'Der Server ist gerade nicht erreichbar. Das Ergebnis ist noch nicht gewertet.'; $('bErneut').hidden = false; }
}
async function melden(m) {
  const p = PS(); if (!p || !angemeldet()) return { status: 'fehler' };
  const ctl = typeof AbortController === 'function' ? new AbortController() : null, t = setTimeout(() => ctl && ctl.abort(), 15000);
  try {
    const res = await fetch(CFG().url + '/functions/v1/neunmalklug-lauf', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + p.token(), apikey: CFG().key || '' }, body: JSON.stringify(m), signal: ctl ? ctl.signal : undefined });
    const j = await res.json().catch(() => ({}));
    if (res.ok && j.verifiziert) return { status: 'verifiziert', rang: j.rang || null, zeit_cs: j.zeit_cs };
    if (res.ok) return { status: 'abgelehnt', grund: j.grund || '' };
    return { status: 'fehler' };
  } catch (e) { return { status: 'fehler' }; } finally { clearTimeout(t); }
}

// ---------- Teilen ----------
$('bTeilen').addEventListener('click', async () => {
  const b = $('bTeilen'), e = letzteErgebnisse; if (!e) return;
  let url = location.origin + location.pathname.replace(/\/$/, ''), text;
  if (e.seed) {
    text = '🔢 Neunmalklug · ' + STUFEN[e.stufe].name + '\n⏱ ' + zeitText(e.z) + (e.hilfe ? ' (mit Tipps)' : '') + '\nGleiches Sudoku, schaffst du es schneller?';
    url += '?s=' + e.stufe + '&n=' + e.seed + '&t=' + e.z;
  } else text = '🔢 Neunmalklug · Tagesrätsel ' + tagText(e.tag) + (e.stufe ? ' (' + STUFEN[e.stufe].name + ')' : '') + '\n⏱ ' + zeitText(e.z) + '\nSchaffst du es schneller?';
  const fertig = (msg) => { b.textContent = msg; setTimeout(() => { b.textContent = 'Teilen'; }, 2500); };
  b.textContent = 'Teilen …';
  try { if (navigator.share) { await navigator.share({ title: 'Neunmalklug', text, url }); b.textContent = 'Teilen'; return; } } catch (err) { if (err && err.name === 'AbortError') { b.textContent = 'Teilen'; return; } }
  try { await navigator.clipboard.writeText(text + '\n' + url); fertig('Kopiert ✓'); } catch (err) { fertig(url); }
});

// ---------- Menüs ----------
function zeige(id) { for (const x of ['sTitel', 'sBereit', 'sStufe', 'sEnde', 'sRang', 'sRegeln']) $(x).hidden = x !== id; }
function titel() {
  if (zustand === 'spiel' && modus === 'frei') speichereLauf();
  zustand = 'titel'; zeige('sTitel'); $('tStatus').textContent = ''; $('tStatus').className = 'status';
  const t = heuteLokal(), st = tagesStufe(t);
  $('tTag').textContent = tagText(t) + (st ? ' · ' + STUFEN[st].name : '');
  const heute = store.tage[t], se = serie(), gel = STUFEN_LISTE.reduce((a, s) => a + ((store.stats[s] && store.stats[s].n) || 0), 0);
  const teile = []; if (heute) teile.push('Heute: ' + zeitText(heute.z)); if (se > 1) teile.push('Serie ' + se + ' Tage'); if (gel) teile.push(gel + ' frei gelöst');
  $('tInfo').textContent = teile.join(' · ');
  $('bTag').firstChild.textContent = store.offen && store.offen.tag === t ? 'Tagesrätsel fortsetzen ' : 'Tagesrätsel ';
  $('bFrei').textContent = store.frei ? 'Weiterspielen · ' + STUFEN[store.frei.stufe].name : 'Freies Spiel';
  $('bNeuFrei').hidden = !store.frei;
  r = null; g = null; n = null; sel = -1; $('titelzeile').textContent = ''; hinweis(''); zeichne();
}
function stufenMenue() {
  zustand = 'stufe'; zeige('sStufe');
  const box = $('sGitter'); box.textContent = '';
  for (const s of STUFEN_LISTE) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'btn stufe';
    const x = store.stats[s]; const nm = document.createElement('span'); nm.textContent = STUFEN[s].name;
    const info = document.createElement('small'); info.textContent = x && x.n ? x.n + ' gelöst · best ' + (x.z ? zeitText(x.z) : '–') : 'noch nicht gelöst';
    b.append(nm, info); b.addEventListener('click', () => { herausforderung = null; starteFrei(s, neuerSeed()); }); box.appendChild(b);
  }
  $('cFehler').checked = store.fehler;
}
$('bTag').addEventListener('click', bereit);
$('bLos').addEventListener('click', starteTag);
$('bBereitZu').addEventListener('click', titel);
$('bFrei').addEventListener('click', () => { if (store.frei) { herausforderung = null; starteFrei(store.frei.stufe, store.frei.seed, store.frei); } else stufenMenue(); });
$('bNeuFrei').addEventListener('click', stufenMenue);
$('bStufeZu').addEventListener('click', titel);
$('cFehler').addEventListener('change', (e) => { store.fehler = !!e.target.checked; speichern(); });
$('bRegeln').addEventListener('click', () => { zustand = 'regeln'; zeige('sRegeln'); });
$('bRegelnZu').addEventListener('click', titel);
$('bMenue').addEventListener('click', titel);
$('bPause').addEventListener('click', titel);
$('bWeiter').addEventListener('click', stufenMenue);
$('bErneut').addEventListener('click', () => { if (letzteMeldung) sende(); });
$('bAnmelden').addEventListener('click', () => { const p = PS(); if (!p) return; if (gastGrund === 'kein_profil' && p.profilBearbeiten) p.profilBearbeiten(); else if (p.anmelden) p.anmelden({}); });
function tonKnopf() { $('bTon').setAttribute('aria-pressed', String(store.sound)); $('bTon').setAttribute('aria-label', store.sound ? 'Ton ausschalten' : 'Ton einschalten'); }
$('bTon').addEventListener('click', () => { store.sound = !store.sound; speichern(); tonKnopf(); ton.start(); });

// ---------- Rangliste ----------
let rTage = [], rTag = null, rHeute = null, rVon = 'titel';
for (const id of ['bRang', 'bRang2']) $(id).addEventListener('click', () => oeffneRang(null));
$('bRangZu').addEventListener('click', () => (rVon === 'ende' ? (zustand = 'ende', zeige('sEnde')) : titel()));
$('rZurueck').addEventListener('click', () => blaettere(1));
$('rVor').addEventListener('click', () => blaettere(-1));
function blaettere(d) { const i = rTage.indexOf(rTag) + d; if (i >= 0 && i < rTage.length) ladeRang(rTage[i]); }
async function oeffneRang(tag) {
  rVon = zustand === 'ende' ? 'ende' : 'titel'; zustand = 'rang'; zeige('sRang');
  await ladeRang(tag);
  const p = PS();
  if (p && p.rpc && rHeute) {
    const x = await p.rpc('neunmalklug_tage_liste', { p_anzahl: 60 });
    const alle = new Set([rHeute]); if (x && !x.fehler && Array.isArray(x.daten)) for (const t of x.daten) if (/^\d{8}$/.test(t)) alle.add(t);
    rTage = [...alle].sort().reverse(); knoepfe();
  }
}
function knoepfe() { const i = rTage.indexOf(rTag); $('rZurueck').disabled = i < 0 || i >= rTage.length - 1; $('rVor').disabled = i <= 0; }
async function ladeRang(tag) {
  const liste = $('rListe'), p = PS();
  liste.textContent = 'Lädt …'; $('rTag').textContent = tag ? tagText(tag) : 'Heute';
  if (!p || !p.online || !p.rpc) { liste.textContent = 'Die Rangliste ist gerade nicht verfügbar.'; return; }
  const gewuenscht = tag; rTag = tag;
  const res = await p.rpc('neunmalklug_rangliste', { p_tag: tag, p_anzahl: 10 });
  if (rTag !== gewuenscht) return;
  if (!res || res.fehler || !res.daten) { liste.textContent = 'Rangliste gerade nicht erreichbar.'; return; }
  const d = res.daten; rTag = d.tag; if (!tag) { rHeute = d.tag; if (!rTage.includes(d.tag)) rTage = [d.tag, ...rTage]; }
  const st = tagesStufe(d.tag);
  $('rTag').textContent = (d.tag === rHeute ? 'Heute · ' + tagText(d.tag) : tagVoll(d.tag)) + (st ? ' · ' + STUFEN[st].name : ''); knoepfe();
  liste.textContent = '';
  if (!d.zeilen.length) { liste.textContent = d.tag === rHeute ? 'Heute noch kein Eintrag. Sei der Erste!' : 'An diesem Tag gab es keine Einträge.'; return; }
  const av = p.avatare || []; let vorPos = 0;
  for (const z of d.zeilen) {
    if (vorPos && z.pos > vorPos + 1) { const l = document.createElement('li'); l.className = 'luecke'; l.textContent = '…'; liste.appendChild(l); }
    vorPos = z.pos;
    const li = document.createElement('li'); if (z.ich) li.className = 'ich';
    const emo = av[(parseInt(String(z.avatar || 'a1').slice(1), 10) || 1) - 1] || '🙂';
    const a = document.createElement('span'); a.className = 'pl'; a.textContent = String(z.platz);
    const b = document.createElement('span'); b.className = 'av'; b.textContent = emo;
    const c = document.createElement('span'); c.className = 'nm'; c.textContent = z.name + (z.ich ? ' (du)' : '');
    const e = document.createElement('b'); e.textContent = zeitGenau(z.zeit_cs);
    li.append(a, b, c, e); liste.appendChild(li);
  }
  $('rHinweis').textContent = d.ich && d.ich.luecke ? 'Dir fehlen ' + zeitGenauKurz(d.ich.luecke) + ' bis Platz ' + d.ich.naechster_platz + '.' : 'Erster Versuch je Konto. Schnellste Zeit vorn.';
}

// ---------- Schleife (nur Uhr) ----------
let letzteSek = -1;
function frame() {
  requestAnimationFrame(frame);
  if (zustand === 'spiel' || zustand === 'fertig') {
    const cs = laufCs(), sek = Math.floor(cs / 100);
    if (sek !== letzteSek) { letzteSek = sek; $('hZeit').textContent = zeitText(cs); if (modus === 'frei' && sek % 10 === 0) speichereLauf(); }
  } else if (letzteSek !== -1) { letzteSek = -1; $('hZeit').textContent = '0:00'; }
}

// ---------- Start ----------
laden(); tonKnopf(); groesse(); titel();
(() => {   // Herausforderungs-Link: ?s=Stufe&n=Seed&t=Hundertstel → dasselbe Rätsel
  const q = new URLSearchParams(location.search), s = q.get('s'), sd = Number(q.get('n')), t = Number(q.get('t'));
  if (STUFEN[s] && Number.isInteger(sd) && sd >= 1 && sd < 2147483647) {
    herausforderung = Number.isInteger(t) && t > 0 && t < 1e8 ? { t } : null;
    starteFrei(s, sd);
  }
})();
requestAnimationFrame(frame);
window.__nk = {
  get zustand() { return zustand; }, get raetsel() { return r; }, get gitter() { return g; }, get runId() { return runId; }, get modus() { return modus; },
  store: () => store, waehle, eingabe, starteFrei
};
