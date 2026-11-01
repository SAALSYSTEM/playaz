// Rocket Reels – Oberfläche und Ablauf. Regeln: engine.js. Speicher/Server: speicher.js. Grafik: grafik.js. Ton: ton.js.
// Grundsatz: Erst steht das Ergebnis fest (Browser-Engine bzw. Server), dann laufen die Walzen dorthin. Animationen ändern nie etwas.
import * as E from './engine.js';
import * as G from './grafik.js';
import * as T from './ton.js';
import * as S from './speicher.js';

const $ = (s) => document.querySelector(s);
const fmt = (n) => Math.floor(n).toLocaleString('de-DE');
const Q = location.search;
const TEST = /[?&]test\b/.test(Q);
const TT = TEST && !/[?&]zeitlupe\b/.test(Q); // Tests: Animationen im Zeitraffer
const REDUZIERT = matchMedia('(prefers-reduced-motion: reduce)').matches;
const jetzt = () => performance.now() / 1000;
const ls = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };
const LINIENFARBEN = ['#3be8ff', '#ffc93c', '#ff5bd2', '#7dff6a', '#b07bff', '#ff8a3c', '#5fa8ff', '#fff36b', '#ff6b8a', '#6bffe0'];

// ------------------------------------------------------------------ Zustand der Oberfläche
let backend = null;         // speicher.lokal() oder speicher.konto()
let z = E.neuerZustand();   // letzter bestätigter Spielstand
let einsatz = 10;           // gewählter Einsatz (geht mit dem nächsten Dreh mit)
let beschaeftigt = false;   // Sperre gegen doppelte Auslösung
let ueberspringen = false;  // Tipp während einer Präsentation: Rest im Zeitraffer
let turbo = ls.get('rocketreels.turbo') === '1' || /[?&]schnell\b/.test(Q);
let angezeigteCoins = 0;
let sitzungsRunden = 0;
const tempo = () => (TT ? 0.05 : turbo ? 0.5 : 1);
function warte(ms) {
  const ende = jetzt() + (ms / 1000) * tempo();
  return new Promise((ok) => { const f = () => (ueberspringen || jetzt() >= ende ? ok() : setTimeout(f, 30)); f(); });
}

// ------------------------------------------------------------------ Walzen
const rollen = $('#rollen');
const rg = rollen.getContext('2d');
let zelle = 80, dpr = 1;
const W = E.BAENDER.map((b, i) => ({ pos: z.letzte[i], v: 0, modus: 'steht', plan: null, bremse: null, len: b.length }));
const anzeigeHL = { linien: [], scatter: [], spezial: null, spezialT: 0, index: -1, bis: 0, fokusW: false };
let animBis = 0, loopLaeuft = false;

function walzenParam() {
  if (TT) return { V: 60, dStop: 1.2, stagger: 0.01, min: 0.02 };
  return turbo ? { V: 26, dStop: 3, stagger: 0.07, min: 0.22 } : { V: 18, dStop: 5, stagger: 0.17, min: 0.55 };
}
function spinStart() {
  const t = jetzt();
  W.forEach((w, i) => { w.modus = 'frei'; w.t0 = t + i * (TT ? 0 : 0.04); w.plan = null; w.bremse = null; });
  anzeigeHL.linien = []; anzeigeHL.scatter = []; anzeigeHL.spezial = null; anzeigeHL.index = -1; anzeigeHL.fokusW = false;
  anstossen();
}
let landeOk = null, gelandet = 0;
function landen(stopps, eilig = false) {
  const p = walzenParam(); const t = jetzt();
  const start = W.reduce((m, w) => Math.max(m, w.t0 || t), t);
  gelandet = 0;
  W.forEach((w, i) => { w.plan = { ziel: stopps[i], zeit: eilig ? t + i * 0.04 : Math.max(t, start + p.min) + i * p.stagger }; if (w.modus === 'steht') { w.pos = stopps[i]; gelandet++; } });
  anstossen();
  return new Promise((ok) => { landeOk = ok; if (gelandet >= 5) { landeOk = null; ok(); } });
}
function eilen() { const t = jetzt(); W.forEach((w, i) => { if (w.plan && w.modus === 'frei') w.plan.zeit = Math.min(w.plan.zeit, t + i * 0.04); }); }
const hermite = (p0, v0, p1, D, s) => { const s2 = s * s, s3 = s2 * s; return (2 * s3 - 3 * s2 + 1) * p0 + (s3 - 2 * s2 + s) * D * v0 + (-2 * s3 + 3 * s2) * p1; };
function walzenSchritt(t) {
  const p = walzenParam();
  W.forEach((w, i) => {
    if (w.modus === 'frei') {
      const a = Math.max(0, Math.min(1, (t - (w.t0 || t)) / 0.18));
      w.v = p.V * a;
      w.pos -= w.v * (1 / 60) * (t - (w.lt || t)) * 60;
      if (w.plan && t >= w.plan.zeit) {
        const frac = w.pos - Math.floor(w.pos);
        const p0 = w.plan.ziel + p.dStop + frac;
        w.bremse = { p0, p1: w.plan.ziel - 0.14, t0: t, D: (2 * (p0 - w.plan.ziel)) / p.V };
        w.pos = p0; w.modus = 'bremst';
      }
    } else if (w.modus === 'bremst') {
      const b = w.bremse; const s = (t - b.t0) / b.D;
      if (s < 1) w.pos = hermite(b.p0, -p.V, b.p1, b.D, s);
      else {
        const s2 = (t - b.t0 - b.D) / 0.14;
        if (s2 < 1) w.pos = b.p1 + (w.plan.ziel - b.p1) * (1 - (1 - s2) * (1 - s2));
        else { w.pos = w.plan.ziel; w.modus = 'steht'; w.v = 0; T.sfx.stopp(i); gelandet++; if (gelandet >= 5 && landeOk) { const ok = landeOk; landeOk = null; ok(); } }
      }
    }
    w.lt = t;
  });
}
const dreht = () => W.some((w) => w.modus !== 'steht');
function anstossen(bis = 0) {
  animBis = Math.max(animBis, bis);
  if (loopLaeuft) return;
  loopLaeuft = true;
  const f = () => {
    const t = jetzt();
    walzenSchritt(t);
    zeichneWalzen(t);
    zeichneRaketeKlein(t);
    if (dreht() || t < animBis) requestAnimationFrame(f); else { loopLaeuft = false; zeichneWalzen(t); }
  };
  requestAnimationFrame(f);
}

function zeichneWalzen(t) {
  const c = zelle, g = rg;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, c * 5, c * 3);
  for (let w = 0; w < 5; w++) {
    const x = w * c;
    const bg = g.createLinearGradient(0, 0, 0, c * 3); bg.addColorStop(0, 'rgba(20,28,80,.55)'); bg.addColorStop(.5, 'rgba(8,12,40,.25)'); bg.addColorStop(1, 'rgba(20,28,80,.55)');
    g.fillStyle = bg; g.fillRect(x + 1, 0, c - 2, c * 3);
    if (w) { g.fillStyle = 'rgba(59,232,255,.18)'; g.fillRect(x - 0.5, 0, 1, c * 3); }
  }
  const s = Math.round(c * 0.86);
  W.forEach((wa, w) => {
    const L = wa.len, i0 = Math.floor(wa.pos), f = wa.pos - i0;
    const schnell = wa.modus !== 'steht' && (wa.modus === 'frei' ? wa.v > 6 : true);
    g.save(); g.beginPath(); g.rect(w * c, 0, c, c * 3); g.clip();
    for (let r = -1; r <= 3; r++) {
      const idx = (((i0 + r) % L) + L) % L;
      const sym = E.BAENDER[w][idx];
      const y = (r - f) * c;
      if (y > c * 3 || y < -c) continue;
      const bild = G.symbolCanvas(sym, Math.round(s * dpr));
      if (schnell) { g.globalAlpha = 0.28; g.drawImage(bild, w * c + (c - s) / 2, y + (c - s) / 2 - c * 0.18, s, s); g.globalAlpha = 0.9; }
      g.drawImage(bild, w * c + (c - s) / 2, y + (c - s) / 2, s, s);
      g.globalAlpha = 1;
    }
    g.restore();
  });
  // Abschattung oben/unten (Walzen-Wölbung)
  const sh = g.createLinearGradient(0, 0, 0, c * 3);
  sh.addColorStop(0, 'rgba(0,0,10,.45)'); sh.addColorStop(.12, 'rgba(0,0,10,0)'); sh.addColorStop(.88, 'rgba(0,0,10,0)'); sh.addColorStop(1, 'rgba(0,0,10,.45)');
  g.fillStyle = sh; g.fillRect(0, 0, c * 5, c * 3);
  if (!dreht()) zeichneHervorhebung(t);
}

function zelleRahmen(g, w, r, farbe, staerke) {
  const c = zelle, m = c * 0.06;
  g.save(); g.strokeStyle = farbe; g.lineWidth = Math.max(2, c * 0.045); g.shadowColor = farbe; g.shadowBlur = c * 0.25 * staerke;
  g.beginPath(); g.roundRect ? g.roundRect(w * c + m, r * c + m, c - 2 * m, c - 2 * m, c * 0.14) : g.rect(w * c + m, r * c + m, c - 2 * m, c - 2 * m); g.stroke(); g.restore();
}
function zeichneHervorhebung(t) {
  const g = rg, c = zelle, h = anzeigeHL;
  const puls = REDUZIERT ? 1 : 0.65 + 0.35 * Math.sin(t * 6);
  // Fokus auf Stargates (vor dem Raketenstart): alles andere abdunkeln
  if (h.fokusW) {
    g.fillStyle = 'rgba(0,0,8,.72)';
    for (let w = 0; w < 5; w++) for (let r = 0; r < 3; r++) if (sichtbar(w, r) !== E.WILD) g.fillRect(w * c, r * c, c, c);
  }
  // Spezial-Symbol ausgedehnt
  if (h.spezial) {
    const anteil = Math.min(1, (t - h.spezialT) / (0.45 * Math.max(0.1, tempo())));
    const s = Math.round(c * 0.86);
    h.spezial.walzen.forEach((w) => {
      g.save();
      g.fillStyle = 'rgba(40,10,80,' + 0.75 * anteil + ')'; g.fillRect(w * c + 2, 0, c - 4, c * 3);
      const bild = G.symbolCanvas(h.spezial.sym, Math.round(s * dpr));
      for (let r = 0; r < 3; r++) { g.globalAlpha = anteil; g.drawImage(bild, w * c + (c - s) / 2, r * c + (c - s) / 2, s, s); }
      g.globalAlpha = 1; g.strokeStyle = '#ffc93c'; g.lineWidth = 3; g.shadowColor = '#ffc93c'; g.shadowBlur = 16 * puls; g.strokeRect(w * c + 3, 3, c - 6, c * 3 - 6);
      g.restore();
    });
  }
  // Stargates: Wirbel-Animation
  for (let w = 0; w < 5; w++) for (let r = 0; r < 3; r++) if (sichtbar(w, r) === E.WILD) G.stargateWirbel(g, w * c + c * 0.07, r * c + c * 0.07, c * 0.86, REDUZIERT ? 0 : t, h.fokusW ? 1.6 : 1);
  // Gewinnlinien
  const zeige = h.index >= 0 ? [h.linien[h.index]].filter(Boolean) : h.linien;
  zeige.forEach((l) => {
    const farbe = LINIENFARBEN[(l.nr - 1) % 10];
    g.save(); g.strokeStyle = farbe; g.globalAlpha = h.index >= 0 ? 0.95 : 0.7; g.lineWidth = Math.max(2, c * (h.index >= 0 ? 0.055 : 0.035)); g.lineJoin = 'round';
    g.shadowColor = farbe; g.shadowBlur = c * 0.2;
    g.beginPath(); E.LINIEN[l.nr - 1].forEach((r, w) => { const x = w * c + c / 2, y = r * c + c / 2; w ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke(); g.restore();
    if (h.index >= 0) l.felder.forEach(([w, r]) => zelleRahmen(g, w, r, farbe, puls));
  });
  if (h.index < 0 && h.scatter.length >= 3) h.scatter.forEach(([w, r]) => zelleRahmen(g, w, r, '#9ff6ff', puls));
}
function sichtbar(w, r) { const wa = W[w]; return E.BAENDER[w][(((Math.round(wa.pos) + r) % wa.len) + wa.len) % wa.len]; }

// ------------------------------------------------------------------ kleine Rakete über den Walzen
const rk = $('#raketeKlein'); const rkg = rk.getContext('2d');
let raketeGlut = 0;
function zeichneRaketeKlein(t) {
  const w = rk.clientWidth, h = rk.clientHeight; if (!w || !h) return;
  rkg.setTransform(dpr, 0, 0, dpr, 0, 0); rkg.clearRect(0, 0, w, h);
  if (z.phase === 'bonus') return;
  const hh = h * 0.86, x = w / 2, y = h * 0.47 + (REDUZIERT ? 0 : Math.sin(t * 1.6) * h * 0.02);
  rkg.fillStyle = 'rgba(59,232,255,.18)'; rkg.beginPath(); rkg.ellipse(x, h * 0.95, hh * 0.32, h * 0.06, 0, 0, Math.PI * 2); rkg.fill();
  G.zeichneRakete(rkg, x, y, hh, 0.15 + raketeGlut * 0.8, t);
}

// ------------------------------------------------------------------ Layout
function layout() {
  dpr = Math.min(2.5, window.devicePixelRatio || 1);
  const b = $('.buehne'), ob = $('.oben'), an = $('#anzeige');
  const breite = b.clientWidth - 8;
  const hoehe = b.clientHeight - Math.max(54, Math.min(90, b.clientHeight * 0.12)) - an.offsetHeight - 22;
  zelle = Math.max(40, Math.floor(Math.min(breite / 5, hoehe / 3)));
  const box = $('#walzen'); box.style.width = zelle * 5 + 4 + 'px'; box.style.height = zelle * 3 + 4 + 'px';
  rollen.width = zelle * 5 * dpr; rollen.height = zelle * 3 * dpr;
  rk.width = rk.clientWidth * dpr; rk.height = rk.clientHeight * dpr;
  G.cacheLeeren();
  G.zeichneHimmel($('#himmel'));
  zeichneWalzen(jetzt()); zeichneRaketeKlein(jetzt());
}
addEventListener('resize', () => { clearTimeout(layout.t); layout.t = setTimeout(layout, 80); });
addEventListener('orientationchange', () => setTimeout(layout, 250));

// ------------------------------------------------------------------ Anzeige & Knöpfe
function zeigeCoins(ziel, puls = false) {
  const el = $('#hCoins');
  if (puls) { $('#bCoins').classList.remove('puls'); void $('#bCoins').offsetWidth; $('#bCoins').classList.add('puls'); }
  const von = angezeigteCoins; angezeigteCoins = ziel;
  if (von === ziel || TT || REDUZIERT) { el.textContent = fmt(ziel); return; }
  const t0 = jetzt(), d = Math.min(0.9, 0.25 + Math.abs(ziel - von) / 4000);
  const f = () => { const s = Math.min(1, (jetzt() - t0) / d); el.textContent = fmt(von + (ziel - von) * (1 - (1 - s) * (1 - s))); if (s < 1 && angezeigteCoins === ziel) requestAnimationFrame(f); };
  f();
}
function text(html, gross = false) { const a = $('#anzeige'); $('#aText').innerHTML = html; a.classList.toggle('gross', gross); }
function aktualisieren() {
  const frei = z.phase === 'bonus';
  document.body.classList.toggle('frei', frei);
  $('#bonusHud').hidden = !frei;
  if (frei) { $('#bRest').textContent = z.bonus.rest; $('#bSumme').textContent = fmt(z.bonus.summe); zeichneSpezialHud(z.bonus.sym); }
  const verfuegbar = z.coins + (z.phase === 'gewinn' ? z.offen : 0);
  document.querySelectorAll('.einsatz button').forEach((b) => {
    const e = Number(b.dataset.e);
    b.setAttribute('aria-checked', String(e === einsatz));
    b.disabled = beschaeftigt || frei || z.phase === 'risiko' || e > Math.max(verfuegbar, E.EINSAETZE[0]);
  });
  const st = $('#bStart'); st.classList.remove('tanken', 'frei', 'stopp');
  const tanken = E.darfNachfuellen(z);
  if (beschaeftigt && dreht()) { st.classList.add('stopp'); $('#startText').textContent = 'Stopp'; $('#startUnter').textContent = ''; }
  else if (beschaeftigt) { if (frei) st.classList.add('frei'); $('#startText').textContent = 'Weiter'; $('#startUnter').textContent = 'schneller'; }
  else if (frei) { st.classList.add('frei'); $('#startText').textContent = 'Frei'; $('#startUnter').textContent = z.bonus.rest + ' übrig'; }
  else if (tanken) { st.classList.add('tanken'); $('#startText').textContent = 'Tanken'; $('#startUnter').textContent = '+' + fmt(E.NACHFUELLEN - z.coins) + ' gratis'; }
  else { $('#startText').textContent = 'Start'; $('#startUnter').textContent = einsatz + ' Coins'; }
  st.disabled = z.phase === 'risiko';
  st.setAttribute('aria-label', $('#startText').textContent + ' ' + $('#startUnter').textContent);
  const wahl = z.phase === 'gewinn' && !beschaeftigt;
  $('#wahl').hidden = !wahl;
  if (wahl) {
    $('#bSichern').textContent = 'Gewinn sichern · ' + fmt(z.offen);
    $('#bRisiko').hidden = !E.risikoMoeglich(z);
    $('#wahl').style.gridTemplateColumns = E.risikoMoeglich(z) ? '1fr 1fr' : '1fr';
  }
  $('#bTages').hidden = beschaeftigt || frei || z.tagesbonus === S.berlinTag();
  if (!beschaeftigt) zeigeCoins(z.coins);
}
function zeichneSpezialHud(sym) {
  const c = $('#bSym'); const g = c.getContext('2d'); g.clearRect(0, 0, c.width, c.height);
  g.drawImage(G.symbolCanvas(sym, c.width), 0, 0); $('#bSymName').textContent = E.SYMBOLE[sym].name;
}
let toastT = 0;
function toast(t, ms = 2600) { const el = $('#toast'); el.textContent = t; el.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { el.hidden = true; }, ms); }
const FEHLER = { netz: 'Keine Verbindung zum Server. Dein Stand ist sicher – bitte gleich noch einmal.', konflikt: 'Dein Spielstand wurde auf einem anderen Gerät geändert. Er ist jetzt aktualisiert.',
  zu_oft: 'Etwas langsamer, Pilot – zu viele Anfragen.', nicht_angemeldet: 'Deine Anmeldung ist abgelaufen. Bitte neu anmelden.', zu_wenig: 'Zu wenig Coins für diesen Einsatz.', schon_abgeholt: 'Heute schon abgeholt.' };
const fehlerText = (f) => FEHLER[f] || 'Das hat nicht geklappt (' + f + ').';

// ------------------------------------------------------------------ Spielzüge
async function ausfuehren(a) {
  const r = await backend.ausfuehren(a);
  if (r.fehler && backend.zustand()) z = backend.zustand();
  return r;
}
function grundMusik() { if (G.TOENE.includes('musik') && z.phase !== 'bonus') T.musikStart('musik'); }
async function startTipp() {
  T.entsperren(); grundMusik();
  if (beschaeftigt) { ueberspringen = true; if (dreht()) eilen(); return; }
  if (z.phase === 'risiko') return;
  if (E.darfNachfuellen(z)) return tanken();
  if (z.phase === 'bonus') return freispiele();
  return drehen();
}
async function drehen() {
  beschaeftigt = true; ueberspringen = false;
  const vor = z;
  const kostet = einsatz;
  if (vor.phase === 'gewinn') zeigeCoins(vor.coins + vor.offen, true);
  zeigeCoins((vor.phase === 'gewinn' ? vor.coins + vor.offen : vor.coins) - kostet);
  text('&nbsp;');
  T.sfx.spin();
  spinStart(); aktualisieren();
  const r = await ausfuehren({ typ: 'dreh', einsatz: kostet });
  if (r.fehler) {
    await landen(z.letzte, true);
    beschaeftigt = false; aktualisieren(); text(fehlerText(r.fehler)); return;
  }
  await landen(r.ergebnis.stopps);
  z = r.zustand; sitzungsRunden++; aktualisieren();
  await praesentieren(r.ergebnis, kostet);
  if (r.ergebnis.freispielStart) { await raketenstart(r.ergebnis.freispielStart.sym); beschaeftigt = false; aktualisieren(); return freispiele(); }
  beschaeftigt = false; ueberspringen = false; aktualisieren();
  hinweisPruefen(r.ergebnis, kostet);
}
async function praesentieren(e, kostet) {
  const w = e.wertung;
  anzeigeHL.linien = w.linien; anzeigeHL.scatter = w.scatter.felder; anzeigeHL.index = -1;
  if (w.scatter.anzahl >= 3) { T.sfx.stargate(); raketeGlut = 1; }
  if (w.spezial) {
    await warte(350);
    anzeigeHL.spezial = w.spezial; anzeigeHL.spezialT = jetzt(); T.sfx.warp();
    text('Spezial-Symbol dehnt sich aus! <b>+' + fmt(w.spezial.gewinn) + '</b>');
    anstossen(jetzt() + 1.2);
    await warte(1100);
  }
  if (e.gewinn <= 0) { anstossen(jetzt() + (w.scatter.anzahl ? 1.5 : 0.05)); text(e.frei ? 'Kein Gewinn in diesem Freispiel' : 'Kein Gewinn'); return; }
  const gross = e.gewinn >= kostet * 15;
  (gross ? T.sfx.gross : T.sfx.klein)();
  anstossen(jetzt() + 8);
  // Gewinn hochzählen
  const d = TT ? 0 : Math.min(2.2, 0.4 + e.gewinn / kostet / 25) * tempo();
  const t0 = jetzt();
  await new Promise((ok) => {
    const f = () => { const s = d ? Math.min(1, (jetzt() - t0) / d) : 1; text('Gewinn <b>' + fmt(e.gewinn * (ueberspringen ? 1 : s)) + '</b>', gross); if (s >= 1 || ueberspringen) ok(); else requestAnimationFrame(f); };
    f();
  });
  text((e.frei ? 'Freispiel-Gewinn' : 'Gewinn') + ' <b>' + fmt(e.gewinn) + '</b>', gross);
  // Linien einzeln zeigen (nur kurz, Tipp überspringt)
  for (let k = 0; k < w.linien.length && !ueberspringen && w.linien.length > 1; k++) {
    anzeigeHL.index = k; anstossen(jetzt() + 2);
    const l = w.linien[k];
    text('Linie ' + l.nr + ': ' + l.anzahl + '× ' + E.SYMBOLE[l.sym].name + ' <b>' + fmt(l.gewinn) + '</b>');
    await warte(750);
  }
  anzeigeHL.index = -1; anstossen(jetzt() + 4);
  text((e.frei ? 'Freispiel-Gewinn' : 'Gewinn') + ' <b>' + fmt(e.gewinn) + '</b>', gross);
  raketeGlut = 0;
}

async function freispiele() {
  if (z.phase !== 'bonus') return;
  beschaeftigt = true; ueberspringen = false; aktualisieren();
  T.musikStart('freispiele');
  while (z.phase === 'bonus') {
    ueberspringen = false;
    const bonusEinsatz = z.bonus.einsatz;
    spinStart(); T.sfx.spin(); aktualisieren();
    text('Freispiel ' + (z.bonus.gespielt + 1) + ' von ' + z.bonus.gesamt);
    const r = await ausfuehren({ typ: 'dreh' });
    if (r.fehler) { await landen(z.letzte, true); toast(fehlerText(r.fehler)); break; }
    await landen(r.ergebnis.stopps);
    z = r.zustand; aktualisieren();
    const b = r.ergebnis.bonus;
    $('#bRest').textContent = b.rest; $('#bSumme').textContent = fmt(b.summe);
    await praesentieren(r.ergebnis, bonusEinsatz);
    if (b.neu) { toast('+' + b.neu + ' Freispiele! Das Stargate öffnet sich erneut.'); T.sfx.stargate(); await warte(900); }
    if (r.ergebnis.bonusEnde) { await rueckflug(r.ergebnis.bonusEnde); break; }
    await warte(650);
  }
  T.musikStop(); grundMusik();
  beschaeftigt = false; ueberspringen = false; anzeigeHL.spezial = null; aktualisieren(); anstossen(jetzt() + 0.1);
  if (z.phase === 'bereit') hinweisPruefen({ gewinn: 0, bonusEnde: true }, einsatz);
}
async function sichern() {
  if (beschaeftigt || z.phase !== 'gewinn') return;
  beschaeftigt = true; T.entsperren();
  const r = await ausfuehren({ typ: 'sichern' });
  beschaeftigt = false;
  if (r.fehler) { toast(fehlerText(r.fehler)); aktualisieren(); return; }
  z = r.zustand; T.sfx.sichern();
  text('Gesichert <b>' + fmt(r.ergebnis.betrag) + '</b>');
  zeigeCoins(z.coins, true); aktualisieren();
}
async function tanken() {
  beschaeftigt = true;
  const r = await ausfuehren({ typ: 'nachfuellen' });
  beschaeftigt = false;
  if (r.fehler) { toast(fehlerText(r.fehler)); aktualisieren(); return; }
  z = r.zustand; T.sfx.tanken(); einsatz = Math.min(einsatz, z.coins);
  text('Treibstoff nachgefüllt: <b>' + fmt(z.coins) + '</b>');
  zeigeCoins(z.coins, true); aktualisieren();
}
async function tagesbonus() {
  if (beschaeftigt) return;
  T.entsperren(); beschaeftigt = true;
  const r = await ausfuehren({ typ: 'tagesbonus' });
  beschaeftigt = false;
  if (r.fehler) { toast(fehlerText(r.fehler)); aktualisieren(); return; }
  z = r.zustand; T.sfx.sichern(); toast('Tagesbonus: +' + E.TAGESBONUS + ' Space Coins');
  zeigeCoins(z.coins, true); aktualisieren();
}

// ------------------------------------------------------------------ Rocket Launch (Freispiele beginnen) und Rückflug
const sz = $('#szeneCanvas'); const szg = sz.getContext('2d');
function szeneGroesse() { const d = Math.min(2, window.devicePixelRatio || 1); sz.width = sz.clientWidth * d; sz.height = sz.clientHeight * d; szg.setTransform(d, 0, 0, d, 0, 0); return [sz.clientWidth, sz.clientHeight]; }
const sterne = Array.from({ length: 160 }, (_, i) => ({ a: (i * 2.399) % (Math.PI * 2), r: ((i * 0.618) % 1), s: 0.5 + ((i * 0.37) % 1) }));
function warpBild(g, w, h, t, staerke, farbe) {
  const cx = w / 2, cy = h * 0.42;
  g.fillStyle = '#02020a'; g.fillRect(0, 0, w, h);
  const neb = g.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * 0.7); neb.addColorStop(0, farbe[0]); neb.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = neb; g.fillRect(0, 0, w, h);
  g.save(); g.globalCompositeOperation = 'lighter'; g.lineCap = 'round';
  sterne.forEach((st) => {
    const r0 = ((st.r + t * (0.15 + staerke * 1.4) * st.s) % 1);
    const r = r0 * r0 * Math.max(w, h) * 0.8;
    const len = staerke * r * 0.35 + 1;
    const x = cx + Math.cos(st.a) * r, y = cy + Math.sin(st.a) * r;
    g.strokeStyle = 'rgba(200,230,255,' + Math.min(1, r0 * 1.6) + ')'; g.lineWidth = 0.6 + r0 * 2;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x - Math.cos(st.a) * len, y - Math.sin(st.a) * len); g.stroke();
  });
  g.restore();
}
function zeichnePlanet(g, x, y, r, t) {
  const bild = G.BILDER['bonus-hintergrund'];
  if (bild) { g.save(); g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.clip(); const f = (2 * r) / Math.min(bild.width, bild.height) * 1.6; g.drawImage(bild, x - bild.width * f / 2, y - bild.height * f * 0.62, bild.width * f, bild.height * f); g.restore(); }
  else {
    const p = g.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.05, x, y, r); p.addColorStop(0, '#b8fff4'); p.addColorStop(.4, '#18a9b8'); p.addColorStop(.8, '#0b3a6b'); p.addColorStop(1, '#061433');
    g.fillStyle = p; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(255,201,60,.5)'; g.lineWidth = r * 0.03; g.beginPath(); g.arc(x, y, r * 1.01, Math.PI * 1.05, Math.PI * 1.75); g.stroke();
  }
  const atm = g.createRadialGradient(x, y, r * 0.95, x, y, r * 1.18); atm.addColorStop(0, 'rgba(120,240,255,.45)'); atm.addColorStop(1, 'rgba(120,240,255,0)');
  g.fillStyle = atm; g.beginPath(); g.arc(x, y, r * 1.18, 0, Math.PI * 2); g.fill();
  void t;
}
// Spielt eine Szene ab. teile: [{ d: Sekunden, f(g, w, h, s, tGesamt) }]. Tippen springt zum Ende. Rückgabe, wenn fertig.
function szene(teile, ende) {
  return new Promise((fertig) => {
    const el = $('#szene'); el.hidden = false; $('#szWeiter').hidden = true; $('#szTitel').textContent = ''; $('#szUnter').textContent = '';
    const [w, h] = szeneGroesse();
    const faktor = TT ? 0.02 : REDUZIERT ? 0.5 : 1;
    const gesamt = teile.reduce((a, p) => a + p.d * faktor, 0);
    const t0 = jetzt(); let vorbei = false;
    const springe = () => { vorbei = true; };
    el.addEventListener('pointerdown', springe, { once: true });
    const f = () => {
      const t = vorbei ? gesamt : jetzt() - t0;
      let rest = t;
      for (const p of teile) { const d = p.d * faktor; if (rest <= d || p === teile[teile.length - 1]) { p.f(szg, w, h, Math.min(1, rest / d), t); break; } rest -= d; }
      if (t < gesamt) requestAnimationFrame(f);
      else { el.removeEventListener('pointerdown', springe); ende(fertig, () => { el.hidden = true; }); }
    };
    f();
  });
}
async function raketenstart(sym) {
  // 1. Walzen dunkel, Stargates leuchten
  anzeigeHL.fokusW = true; anzeigeHL.linien = []; anzeigeHL.index = -1;
  T.sfx.stargate(); text('Das Stargate öffnet sich …'); anstossen(jetzt() + 2);
  await warte(1300);
  anzeigeHL.fokusW = false;
  T.sfx.start();
  const himmelFarbe = ['rgba(40,60,160,.35)'], lila = ['rgba(120,40,200,.45)'];
  await szene([
    { d: 1.3, f(g, w, h, s, t) { warpBild(g, w, h, t, 0.05, himmelFarbe); const y = h * 0.82 - s * s * h * 0.9; const wack = (1 - s) * 3 * Math.sin(t * 60);
      g.fillStyle = 'rgba(200,200,220,' + 0.35 * (1 - s) + ')'; for (let i = 0; i < 6; i++) { g.beginPath(); g.arc(w / 2 + (i - 2.5) * 18 * (1 + s * 3), h * 0.9, 20 + s * 50, 0, Math.PI * 2); g.fill(); }
      G.zeichneRakete(g, w / 2 + wack, y, Math.min(w, h) * 0.32, 1, t); } },
    { d: 1.8, f(g, w, h, s, t) { warpBild(g, w, h, t, 0.3 + s * 0.9, [s < 0.5 ? himmelFarbe[0] : lila[0]]); G.zeichneRakete(g, w / 2, h * 0.5, Math.min(w, h) * 0.12, 1, t); } },
    { d: 1.3, f(g, w, h, s, t) { warpBild(g, w, h, t, 1.2 * (1 - s), lila); zeichnePlanet(g, w / 2, h * 1.05 - s * h * 0.25, Math.min(w, h) * (0.15 + s * 0.45), t); G.zeichneRakete(g, w / 2, h * 0.45 + s * h * 0.12, Math.min(w, h) * (0.12 - s * 0.05), 1 - s * 0.7, t); } },
    { d: 0.1, f(g, w, h, s, t) { warpBild(g, w, h, t, 0, lila); zeichnePlanet(g, w / 2, h * 0.8, Math.min(w, h) * 0.6, t); } }
  ], async (fertig, zu) => {
    $('#szTitel').textContent = E.FREISPIELE + ' Freispiele!';
    $('#szUnter').textContent = 'Neue Galaxie erreicht. Spezial-Symbol wird gewählt …';
    // Spezial-Symbol "auswürfeln" (rein optisch, das Symbol steht schon fest)
    const [w, h] = [sz.clientWidth, sz.clientHeight];
    const box = Math.min(w, h) * 0.3;
    const zeigeSym = (i, glanz) => { warpBild(szg, w, h, jetzt(), 0, lila); zeichnePlanet(szg, w / 2, h * 0.8, Math.min(w, h) * 0.6, 0);
      szg.save(); szg.shadowColor = '#ffc93c'; szg.shadowBlur = glanz ? 40 : 10; szg.fillStyle = 'rgba(20,10,50,.85)'; szg.fillRect(w / 2 - box / 2 - 8, h * 0.5 - box / 2 - 8, box + 16, box + 16); szg.restore();
      szg.drawImage(G.symbolCanvas(i, Math.round(box * 2)), w / 2 - box / 2, h * 0.5 - box / 2, box, box); };
    const schritte = TT ? 1 : 14;
    for (let k = 0; k < schritte; k++) { zeigeSym(E.REGULAER[(sym + k + 5) % 12], false); T.sfx.klick(); await new Promise((r) => setTimeout(r, 50 + k * 9)); }
    zeigeSym(sym, true); T.sfx.sichern();
    $('#szUnter').textContent = 'Spezial-Symbol: ' + E.SYMBOLE[sym].name + ' – erscheint es auf 3 oder mehr Walzen, dehnt es sich aus.';
    const knopf = $('#szWeiter'); knopf.textContent = "Los geht's"; knopf.hidden = false; knopf.focus();
    const weiter = () => { knopf.removeEventListener('click', weiter); zu(); fertig(); };
    knopf.addEventListener('click', weiter);
    if (TT) weiter(); else setTimeout(() => { if (!knopf.hidden && !$('#szene').hidden) weiter(); }, 6000);
  });
  aktualisieren(); layout();
}
async function rueckflug(ende) {
  await warte(500);
  T.sfx.start();
  const lila = ['rgba(120,40,200,.45)'], blau = ['rgba(40,60,160,.35)'];
  await szene([
    { d: 1.0, f(g, w, h, s, t) { warpBild(g, w, h, t, s * 1.2, lila); zeichnePlanet(g, w / 2, h * 0.8 + s * h * 0.3, Math.min(w, h) * (0.6 - s * 0.45), t); G.zeichneRakete(g, w / 2, h * 0.5, Math.min(w, h) * 0.14, 1, t); } },
    { d: 1.0, f(g, w, h, s, t) { warpBild(g, w, h, t, 1.2 * (1 - s), [s < 0.5 ? lila[0] : blau[0]]); G.zeichneRakete(g, w / 2, h * 0.5 + s * h * 0.3, Math.min(w, h) * (0.14 + s * 0.12), 1 - s * 0.6, t); } }
  ], async (fertig, zu) => {
    $('#szTitel').textContent = 'Bonusgewinn';
    const ziel = ende.summe; const t0 = jetzt(); const d = TT ? 0 : 1.6;
    if (ziel > 0) T.sfx.gross();
    await new Promise((ok) => { const f = () => { const s = d ? Math.min(1, (jetzt() - t0) / d) : 1; $('#szUnter').textContent = fmt(ziel * s) + ' Space Coins aus ' + ende.gespielt + ' Freispielen'; if (s < 1) requestAnimationFrame(f); else ok(); }; f(); });
    const knopf = $('#szWeiter'); knopf.textContent = 'Gutschreiben'; knopf.hidden = false; knopf.focus();
    const weiter = () => { knopf.removeEventListener('click', weiter); zu(); fertig(); };
    knopf.addEventListener('click', weiter);
    if (TT) weiter();
  });
  text('Bonusgewinn gutgeschrieben <b>' + fmt(ende.summe) + '</b>', ende.summe > 0);
  zeigeCoins(z.coins, true);
}

// ------------------------------------------------------------------ Hyperjump
const rc = $('#risikoCanvas'); const rcg = rc.getContext('2d');
let rLeiter = [], rStufe = 0, rAnim = null, rLaeuft = false;
function risikoGroesse() { const d = Math.min(2, window.devicePixelRatio || 1); rc.width = rc.clientWidth * d; rc.height = rc.clientHeight * d; rcg.setTransform(d, 0, 0, d, 0, 0); }
function stationY(i, h) { const n = Math.max(2, rLeiter.length); const unten = h * 0.74, oben = h * 0.22; return unten - (unten - oben) * (i / (n - 1)); }
function zeichneRisiko(t) {
  const w = rc.clientWidth, h = rc.clientHeight, g = rcg;
  const bild = G.BILDER['risiko-hintergrund'];
  if (bild) { const f = Math.max(w / bild.width, h / bild.height); g.drawImage(bild, (w - bild.width * f) / 2, (h - bild.height * f) / 2, bild.width * f, bild.height * f); g.fillStyle = 'rgba(0,0,10,.35)'; g.fillRect(0, 0, w, h); }
  else {
    const bg = g.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, '#1a0b3f'); bg.addColorStop(.5, '#07082a'); bg.addColorStop(1, '#02020c'); g.fillStyle = bg; g.fillRect(0, 0, w, h);
    const gl = g.createRadialGradient(w / 2, h * 0.12, 0, w / 2, h * 0.12, w * 0.6); gl.addColorStop(0, 'rgba(255,201,60,.45)'); gl.addColorStop(1, 'rgba(255,201,60,0)'); g.fillStyle = gl; g.fillRect(0, 0, w, h);
    g.save(); g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 14; i++) { const x0 = (i / 13) * w; const ph = (t * 0.6 + i * 0.13) % 1; g.strokeStyle = i % 2 ? 'rgba(59,232,255,.18)' : 'rgba(155,92,255,.2)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x0, h); g.lineTo(w / 2 + (x0 - w / 2) * 0.12, h * 0.1); g.stroke();
      g.fillStyle = 'rgba(200,240,255,.5)'; const yy = h - ph * h * 0.9; const xx = x0 + (w / 2 + (x0 - w / 2) * 0.12 - x0) * (ph * 0.9); g.fillRect(xx - 1, yy, 2, 6); }
    g.restore();
  }
  // Stationen
  rLeiter.forEach((wert, i) => {
    const y = stationY(i, h), breit = w * (0.5 - i * 0.05);
    const erreicht = i <= rStufe, aktuell = i === rStufe;
    g.save(); g.lineWidth = aktuell ? 5 : 3;
    g.strokeStyle = aktuell ? '#ffc93c' : erreicht ? '#3be8ff' : 'rgba(155,92,255,.85)'; g.shadowColor = g.strokeStyle; g.shadowBlur = aktuell ? 22 : 10;
    g.beginPath(); g.ellipse(w / 2, y, breit / 2, breit * 0.09, 0, 0, Math.PI * 2); g.stroke(); g.restore();
    g.font = '400 ' + Math.round(Math.min(26, w * 0.06) - i) + 'px Bungee, sans-serif'; g.textAlign = 'left'; g.textBaseline = 'middle';
    g.fillStyle = aktuell ? '#ffc93c' : erreicht ? '#bff6ff' : '#d9c8ff';
    g.fillText(fmt(wert), w / 2 + breit / 2 + 10, y);
    g.font = '600 12px "Barlow Semi Condensed", sans-serif'; g.textAlign = 'right'; g.fillStyle = 'rgba(220,225,255,.7)';
    g.fillText(i === 0 ? 'Start' : 'Stufe ' + i, w / 2 - breit / 2 - 10, y);
  });
  // Rakete
  let x = w / 2, y = stationY(rStufe, h) - 34, alpha = 1, groesse = Math.min(w, h) * 0.16, flamme = 0.2;
  if (rAnim) {
    const s = Math.min(1, (t - rAnim.t0) / rAnim.d), seite = rAnim.route ? 1 : -1;
    if (rAnim.erfolg) {
      const s1 = Math.min(1, s / 0.3), s2 = Math.max(0, (s - 0.3) / 0.7);
      x = w / 2 + seite * w * 0.2 * Math.sin(s1 * Math.PI / 2) * (1 - s2);
      y = stationY(rAnim.von, h) - 34 + (stationY(rAnim.von + 1, h) - stationY(rAnim.von, h)) * (s2 * s2 * (3 - 2 * s2));
      flamme = 1;
      if (s2 > 0) { g.save(); g.globalCompositeOperation = 'lighter'; g.strokeStyle = 'rgba(160,240,255,.55)'; g.lineWidth = 2; for (let i = 0; i < 12; i++) { const xx = x + (i - 6) * 9; g.beginPath(); g.moveTo(xx, y + 40); g.lineTo(xx, y + 40 + 120 * (1 - s2)); g.stroke(); } g.restore(); }
    } else {
      x = w / 2 + seite * w * 0.2 * Math.min(1, s / 0.3) + (s > 0.3 ? Math.sin(t * 70) * 6 * (1 - s) : 0);
      y = stationY(rAnim.von, h) - 34 - Math.min(1, s / 0.3) * 30;
      flamme = s < 0.5 ? 0.8 : 0;
      alpha = s < 0.55 ? 1 : Math.max(0, 1 - (s - 0.55) / 0.3);
      // Asteroiden
      for (let i = 0; i < 9; i++) {
        const q = (s * 1.6 + i * 0.11) % 1; const ax = (rAnim.route ? w * 1.1 : -w * 0.1) + (rAnim.route ? -1 : 1) * q * w * 1.2; const ay = y - 120 + i * 32 + Math.sin(i) * 20;
        g.fillStyle = '#5a4436'; g.strokeStyle = '#ff8a3c'; g.lineWidth = 1.5; g.beginPath();
        for (let k = 0; k < 7; k++) { const a = k / 7 * Math.PI * 2 + i; const rr = (10 + (i % 3) * 7) * (0.8 + 0.3 * Math.sin(k * 2.3 + i)); g[k ? 'lineTo' : 'moveTo'](ax + Math.cos(a) * rr, ay + Math.sin(a) * rr); }
        g.closePath(); g.fill(); g.stroke();
      }
      if (s > 0.5) { g.save(); g.globalCompositeOperation = 'lighter'; const e = (s - 0.5) * 2; const ex = g.createRadialGradient(x, y, 0, x, y, 30 + e * 90); ex.addColorStop(0, 'rgba(255,240,180,' + (1 - e) + ')'); ex.addColorStop(.4, 'rgba(255,120,30,' + 0.7 * (1 - e) + ')'); ex.addColorStop(1, 'rgba(255,40,0,0)'); g.fillStyle = ex; g.beginPath(); g.arc(x, y, 30 + e * 90, 0, Math.PI * 2); g.fill(); g.restore(); }
    }
  }
  g.save(); g.globalAlpha = alpha; G.zeichneRakete(g, x, y, groesse, flamme, t); g.restore();
}
function risikoLoop() {
  if (rLaeuft) return; rLaeuft = true;
  const f = () => { if ($('#risiko').hidden) { rLaeuft = false; return; } zeichneRisiko(jetzt()); requestAnimationFrame(f); };
  requestAnimationFrame(f);
}
function risikoKnoepfe() {
  const darf = E.risikoMoeglich(z) && !rAnim && !beschaeftigt;
  $('#rLinks').disabled = !darf; $('#rRechts').disabled = !darf;
  $('#rSichern').disabled = !!rAnim || beschaeftigt;
  $('#rSichern').textContent = 'Gewinn sichern · ' + fmt(z.offen);
  if (rAnim || beschaeftigt) { $('#rInfo').textContent = 'Hyperraum-Sprung läuft …'; return; }
  $('#rInfo').textContent = darf ? 'Stufe ' + rStufe + ' von ' + (rLeiter.length - 1) + ' · Jede Route: 50 % Chance auf ' + fmt(z.offen * 2) : 'Oberste Station erreicht.';
}
function risikoOeffnen() {
  rLeiter = E.leiter(z.risiko.start); rStufe = z.risiko.stufe; rAnim = null;
  $('#risiko').hidden = false; risikoGroesse(); risikoKnoepfe(); risikoLoop();
}
async function risikoStarten() {
  if (beschaeftigt || z.phase !== 'gewinn') return;
  beschaeftigt = true; T.entsperren();
  const r = await ausfuehren({ typ: 'risiko' });
  beschaeftigt = false;
  if (r.fehler) { toast(fehlerText(r.fehler)); aktualisieren(); return; }
  z = r.zustand; aktualisieren(); risikoOeffnen();
}
async function springen(route) {
  if (beschaeftigt || z.phase !== 'risiko' || rAnim) return;
  beschaeftigt = true; risikoKnoepfe();
  const von = z.risiko.stufe;
  const r = await ausfuehren({ typ: 'sprung', route });
  if (r.fehler) { beschaeftigt = false; toast(fehlerText(r.fehler)); if (z.phase !== 'risiko') { $('#risiko').hidden = true; aktualisieren(); } else risikoKnoepfe(); return; }
  z = r.zustand; const e = r.ergebnis;
  rAnim = { t0: jetzt(), d: (TT ? 0.05 : 1.1) * (turbo ? 0.7 : 1), route, erfolg: e.erfolg, von };
  (e.erfolg ? T.sfx.warp : T.sfx.verloren)();
  await new Promise((ok) => setTimeout(ok, rAnim.d * 1000 + 50));
  rAnim = null;
  if (e.erfolg) {
    rStufe = e.stufe;
    if (e.gesichert) { T.sfx.gross(); $('#rInfo').textContent = 'Ziel erreicht! ' + fmt(e.gesichert) + ' Coins gesichert.'; await new Promise((ok) => setTimeout(ok, TT ? 10 : 1400)); schliesseRisiko('Hyperjump-Gewinn <b>' + fmt(e.gesichert) + '</b>'); }
  } else {
    $('#rInfo').textContent = 'Asteroidensturm! ' + fmt(e.verloren) + ' Coins verloren.';
    await new Promise((ok) => setTimeout(ok, TT ? 10 : 1300));
    schliesseRisiko('Asteroidensturm – Gewinn verloren');
  }
  beschaeftigt = false; if (!$('#risiko').hidden) risikoKnoepfe();
}
async function risikoSichern() {
  if (beschaeftigt || z.phase !== 'risiko' || rAnim) return;
  beschaeftigt = true;
  const r = await ausfuehren({ typ: 'sichern' });
  beschaeftigt = false;
  if (r.fehler) { toast(fehlerText(r.fehler)); risikoKnoepfe(); return; }
  z = r.zustand; T.sfx.sichern();
  schliesseRisiko('Gesichert <b>' + fmt(r.ergebnis.betrag) + '</b>');
}
function schliesseRisiko(msg) {
  $('#risiko').hidden = true; beschaeftigt = false; text(msg); zeigeCoins(z.coins, true); aktualisieren();
  hinweisPruefen({ gewinn: 0 }, einsatz);
}

// ------------------------------------------------------------------ Gewinnübersicht
function infoBauen() {
  const lb = einsatz / 10;
  $('#iEinsatz').textContent = einsatz; $('#iLinie').textContent = lb;
  const tab = $('#iTabelle'); tab.replaceChildren();
  E.REGULAER.forEach((i) => {
    const d = document.createElement('div'); d.className = 'zeile';
    const c = document.createElement('canvas'); c.width = c.height = 104; c.getContext('2d').drawImage(G.symbolCanvas(i, 104), 0, 0);
    const ol = document.createElement('ol');
    [5, 4, 3].forEach((n) => { const li = document.createElement('li'); li.innerHTML = n + '× <b>' + fmt(E.AUSZAHLUNG[i][n - 3] * lb) + '</b>'; ol.append(li); });
    const name = document.createElement('span'); name.className = 'sr'; name.textContent = E.SYMBOLE[i].name;
    d.append(c, name, ol); tab.append(d);
  });
  const sg = $('#iStargate'); sg.replaceChildren();
  const c = document.createElement('canvas'); c.width = c.height = 128; c.getContext('2d').drawImage(G.symbolCanvas(E.WILD, 128), 0, 0);
  const p = document.createElement('p');
  p.innerHTML = 'Ersetzt jedes andere Symbol auf einer Gewinnlinie. Zugleich Scatter: zahlt überall auf den Walzen – ' +
    [3, 4, 5].map((n) => n + '× = <b>' + fmt(E.SCATTER[n - 3] * einsatz) + '</b>').join(', ') + ' (Vielfaches des Gesamteinsatzes). Ab 3 Stargates starten ' + E.FREISPIELE + ' Freispiele.';
  sg.append(c, p);
  const li = $('#iLinien'); li.replaceChildren();
  E.LINIEN.forEach((l, k) => {
    const d = document.createElement('div'); d.className = 'linie';
    const g = document.createElement('i'); g.style.setProperty('--c', LINIENFARBEN[k]);
    for (let r = 0; r < 3; r++) for (let w = 0; w < 5; w++) { const e = document.createElement('em'); if (l[w] === r) e.className = 'an'; g.append(e); }
    d.append(g, document.createTextNode('Linie ' + (k + 1))); li.append(d);
  });
  const liste = (sel, punkte) => { const u = $(sel); u.replaceChildren(...punkte.map((t) => { const x = document.createElement('li'); x.innerHTML = t; return x; })); };
  liste('#iRegeln', [
    'Gewonnen wird mit 3, 4 oder 5 gleichen Symbolen auf einer der 10 Linien, immer von der linken Walze aus ohne Lücke.',
    'Je Linie zählt nur der höchste Treffer. Gewinne mehrerer Linien und der Scatter-Gewinn werden addiert.',
    'Werte oben = Vielfaches des Linieneinsatzes (Gesamteinsatz ÷ 10). Fünf Stargates auf einer Linie zahlen als Scatter, nicht als Linie.',
    'Jede Walze stoppt auf einer zufälligen Position (Zufallszahlen aus dem Kryptografie-Generator des Browsers bzw. Servers). Das Ergebnis steht fest, bevor die Walzen anhalten – die Animation ändert nichts.',
    'Theoretische Auszahlungsquote: ca. ' + (E.QUOTE * 100).toLocaleString('de-DE', { maximumFractionDigits: 1 }) + ' % der Einsätze (exakt berechnet, langfristiger Mittelwert). Es gibt keine gesteuerten Gewinne oder „Beinahe-Treffer“.'
  ]);
  liste('#iBonus', [
    '3 oder mehr Stargates irgendwo: Die Rakete startet, es gibt ' + E.FREISPIELE + ' Freispiele mit dem Einsatz der auslösenden Runde. Der Gewinn dieser Runde wird sofort gutgeschrieben.',
    'Zu Beginn wird zufällig eines der 12 regulären Symbole zum Spezial-Symbol.',
    'Liegt das Spezial-Symbol in einem Freispiel auf mindestens 3 Walzen (egal welche, auch nicht nebeneinander), füllt es diese Walzen ganz aus und zahlt zusätzlich auf allen 10 Linien den Wert für so viele Treffer, wie Walzen gefüllt sind.',
    '3 oder mehr Stargates während der Freispiele bringen +' + E.FREISPIELE + ' Freispiele (höchstens ' + E.FREISPIELE_MAX + ' je Bonus).',
    'Der gesamte Bonusgewinn wird am Ende einmal gutgeschrieben.'
  ]);
  liste('#iRisiko', [
    'Nach einem normalen Gewinn kannst du ihn sichern oder im Hyperjump riskieren. Risiko ist freiwillig – „Gewinn sichern“ ist immer gleichwertig daneben.',
    'Jeder Sprung: genau 50 % Chance. Erfolg verdoppelt den Gewinn, ein Asteroidensturm kostet den noch nicht gesicherten Gewinn. Dein Kontostand ist nie betroffen.',
    'Höchstens ' + E.RISIKO_SPRUENGE + ' Sprünge; ein Sprung wird nur angeboten, solange das Doppelte höchstens ' + fmt(E.RISIKO_GRENZE) + ' Coins beträgt. Nach jedem Sprung kannst du sichern.',
    'Freispiel-Gewinne können nicht riskiert werden. „Start“ bei offenem Gewinn sichert ihn automatisch.'
  ]);
  liste('#iCoins', [
    'Neue Piloten starten mit ' + fmt(E.START_COINS) + ' Space Coins. Reicht es nicht mehr für einen Einsatz, tankst du kostenlos auf ' + fmt(E.NACHFUELLEN) + ' auf – ohne Werbung, ohne Konto.',
    'Einmal am Tag gibt es einen kleinen Tagesbonus (+' + E.TAGESBONUS + ').',
    'Als Gast bleibt alles nur auf diesem Gerät (geht beim Löschen der Browserdaten verloren). Mit einem kostenlosen PlaySaal-Konto liegen Coins und Statistik sicher im Konto und du spielst auf jedem Gerät weiter. Beim ersten Anmelden kannst du deinen Gast-Stand einmalig übernehmen.'
  ]);
  $('#iFair').innerHTML = '<b>Nur Spielgeld.</b> Space Coins haben keinen Geldwert. Sie können nicht gekauft, ausgezahlt, getauscht oder gegen Preise eingelöst werden. Rocket Reels ist eine reine Unterhaltungssimulation und kein Glücksspiel um Geld. Nicht für Kinder gedacht: PlaySaal empfiehlt das Spiel ab 18 Jahren (keine offizielle Altersfreigabe).';
}

// ------------------------------------------------------------------ Profil
function profilZeigen() {
  const s = z.stats;
  const zeilen = [['Kontostand', fmt(z.coins) + ' Coins'], ['Gespielte Runden', fmt(s.runden)], ['Virtuelle Einsätze', fmt(s.einsatz)], ['Virtuelle Gewinne', fmt(s.gewinn)],
    ['Höchster Einzelgewinn', fmt(s.hoechster)], ['Gestartete Freispiele', fmt(s.freispiele)], ['Erfolgreiche Hyperjumps', fmt(s.spruenge)], ['Kostenlos nachgetankt', fmt(s.nachgefuellt)]];
  const dl = $('#pStats'); dl.replaceChildren();
  zeilen.forEach(([a, b]) => { const dt = document.createElement('dt'); dt.textContent = a; const dd = document.createElement('dd'); dd.textContent = b; dl.append(dt, dd); });
  const P = window.PlaySaal;
  if (backend.art === 'konto') { $('#pModus').textContent = 'Gespeichert in deinem PlaySaal-Konto – auf allen Geräten.'; $('#pKonto').hidden = true; $('#pHinweis').textContent = ''; }
  else {
    $('#pModus').textContent = 'Gast · Spielstand nur auf diesem Gerät.';
    const kannKonto = !!(P && P.hostOk && !P.user());
    $('#pKonto').hidden = !kannKonto;
    $('#pHinweis').textContent = P && P.user() ? 'Konto-Speicherung für Rocket Reels wird gerade eingerichtet. Bis dahin bleibt der Stand auf diesem Gerät.' : 'Mit einem kostenlosen PlaySaal-Konto (ab 16) sicherst du Coins und Statistik.';
  }
  oeffne('#profil');
}

// ------------------------------------------------------------------ Dialoge
function oeffne(sel) { $(sel).hidden = false; const k = $(sel + ' [data-zu]') || $(sel + ' button'); k && k.focus(); }
document.querySelectorAll('[data-zu]').forEach((b) => b.addEventListener('click', () => { b.closest('.schicht').hidden = true; }));
document.querySelectorAll('.dialog').forEach((d) => d.addEventListener('pointerdown', (e) => { if (e.target === d && d.querySelector('[data-zu]')) d.hidden = true; }));
addEventListener('keydown', (e) => {
  if (e.key === 'Escape') document.querySelectorAll('.dialog:not([hidden])').forEach((d) => { if (d.querySelector('[data-zu]')) d.hidden = true; });
  if ((e.key === ' ' || e.key === 'Enter') && e.target === document.body && document.querySelectorAll('.schicht:not([hidden]):not(.blatt)').length === 0) { e.preventDefault(); startTipp(); }
});

// ------------------------------------------------------------------ Konto-Hinweise (dezent, max. 2 je Sitzung, nach Ablehnung 24 h Ruhe)
const HKEY = 'rocketreels-hinweis';
function hinweisDaten() { let d = null; try { d = JSON.parse(ls.get(HKEY)); } catch (e) {} return d && typeof d === 'object' ? d : { nein: 0, zehn: false, gross: false, rekord: 0 }; }
let hinweiseSitzung = 0;
async function hinweisPruefen(e, kostet) {
  const P = window.PlaySaal;
  if (!P || !P.hostOk || P.user() || backend.art !== 'gast' || hinweiseSitzung >= 2) return;
  if (beschaeftigt || z.phase === 'risiko' || z.phase === 'bonus') return;
  const d = hinweisDaten();
  if (Date.now() - (d.nein || 0) < 24 * 3600 * 1000) return;
  let grund = null;
  if (!d.zehn && z.stats.runden >= 10) { d.zehn = true; grund = 'zehn'; }
  else if (z.stats.runden >= 3 && ((e.gewinn >= kostet * 20 && !d.gross) || (z.stats.hoechster > (d.rekord || 0) && z.stats.hoechster >= 200 && d.rekord))) { d.gross = true; grund = 'gross'; }
  if (z.stats.hoechster > (d.rekord || 0)) d.rekord = z.stats.hoechster;
  ls.set(HKEY, JSON.stringify(d));
  if (!grund) return;
  let a = null; try { a = await P.anbieter(); } catch (x) {}
  if (!a || !(a.email || a.google || a.apple)) return;
  hinweiseSitzung++;
  $('#werbung').hidden = false;
}
$('#wJa').addEventListener('click', () => { $('#werbung').hidden = true; const P = window.PlaySaal; if (P) P.anmelden({}); });
$('#wNein').addEventListener('click', () => { $('#werbung').hidden = true; const d = hinweisDaten(); d.nein = Date.now(); ls.set(HKEY, JSON.stringify(d)); });
$('#pKonto').addEventListener('click', () => { $('#profil').hidden = true; const P = window.PlaySaal; if (P) P.anmelden({}); });

// ------------------------------------------------------------------ Backend wählen (Gast oder Konto)
async function backendWaehlen() {
  const P = window.PlaySaal;
  const konto = !!(P && P.user && P.user() && P.cfg && P.cfg.rocketReels === true);
  if (konto) {
    const k = S.konto(P);
    const geladen = await k.laden();
    if (geladen) {
      backend = k; z = geladen; einsatz = z.einsatz;
      await gastAngebot(P);
      return;
    }
    toast('Konto-Spielstand gerade nicht erreichbar – du spielst vorerst als Gast.', 4000);
  }
  backend = S.lokal(testZufall()); z = backend.zustand(); einsatz = z.einsatz;
}
// Nur mit ?test: Zufall kontrolliert ersetzen (?seed=Zahl, ?folge=Werte,komma,getrennt – danach Seed). Wirkt nur im Gast-Modus.
function testZufall() {
  if (!TEST) return null;
  const seed = Number((Q.match(/[?&]seed=(\d+)/) || [])[1] || 1);
  const basis = E.seedZufall(seed);
  const folge = ((Q.match(/[?&]folge=([\d,]+)/) || [])[1] || '').split(',').filter(Boolean).map(Number);
  return (n) => { while (folge.length) { const v = folge.shift(); if (v < n) return v; } return basis(n); };
}
async function gastAngebot(P) {
  if (z.gastUebernommen) return;
  const gast = S.gastLaden();
  if (!gast || (gast.stats.runden === 0 && gast.coins === E.START_COINS)) return;
  const uid = (P.user() || {}).id || '';
  const nein = (ls.get('rocketreels-gast-nein') || '').split(',');
  if (nein.includes(uid)) return;
  const neu = Math.max(z.coins, Math.min(gast.coins, E.GAST_IMPORT_MAX));
  $('#gText').textContent = 'Auf diesem Gerät hast du als Gast ' + fmt(gast.coins) + ' Space Coins (' + fmt(gast.stats.runden) + ' Runden). In deinem Konto sind es ' + fmt(z.coins) + '. ' +
    'Übernommen wird der höhere Stand (höchstens ' + fmt(E.GAST_IMPORT_MAX) + ', also ' + fmt(neu) + ') und deine Statistik – einmalig je Konto, nichts wird doppelt gutgeschrieben.';
  oeffne('#gast');
  await new Promise((ok) => {
    const ja = async () => { aus(); $('#gJa').disabled = true; const r = await backend.gastUebernehmen(gast); $('#gJa').disabled = false;
      if (r.fehler) toast(r.fehler === 'schon_uebernommen' ? 'Für dieses Konto wurde schon ein Gast-Stand übernommen.' : fehlerText(r.fehler)); else { z = r.zustand; toast('Gast-Stand übernommen: ' + fmt(z.coins) + ' Space Coins'); }
      ok(); };
    const nee = () => { aus(); ls.set('rocketreels-gast-nein', [...nein.filter(Boolean), uid].slice(-10).join(',')); ok(); };
    const aus = () => { $('#gast').hidden = true; $('#gJa').removeEventListener('click', ja); $('#gNein').removeEventListener('click', nee); };
    $('#gJa').addEventListener('click', ja); $('#gNein').addEventListener('click', nee);
  });
}
let wechselAusstehend = false;
async function kontoWechsel() {
  if (beschaeftigt || z.phase === 'risiko') { wechselAusstehend = true; return; }
  wechselAusstehend = false;
  const vorher = backend && backend.art;
  await backendWaehlen();
  W.forEach((w, i) => { w.pos = z.letzte[i]; });
  angezeigteCoins = z.coins; aktualisieren(); zeichneWalzen(jetzt());
  if (backend.art !== vorher) toast(backend.art === 'konto' ? 'Spielstand aus deinem PlaySaal-Konto geladen.' : 'Abgemeldet – du spielst als Gast auf diesem Gerät.');
  if (z.phase === 'risiko') risikoOeffnen();
}
setInterval(() => { if (wechselAusstehend && !beschaeftigt && z.phase !== 'risiko') kontoWechsel(); }, 1500);

// ------------------------------------------------------------------ Bedienung
$('#bStart').addEventListener('click', startTipp);
$('#bSichern').addEventListener('click', sichern);
$('#bRisiko').addEventListener('click', risikoStarten);
$('#rLinks').addEventListener('click', () => springen(0));
$('#rRechts').addEventListener('click', () => springen(1));
$('#rSichern').addEventListener('click', risikoSichern);
$('#bTages').addEventListener('click', tagesbonus);
$('#walzen').addEventListener('pointerdown', () => { if (beschaeftigt) { ueberspringen = true; if (dreht()) eilen(); } });
document.querySelectorAll('.einsatz button').forEach((b) => b.addEventListener('click', () => {
  if (beschaeftigt) return; T.entsperren(); T.sfx.klick(); einsatz = Number(b.dataset.e); ls.set('rocketreels.einsatz', String(einsatz)); aktualisieren();
}));
$('#bInfo').addEventListener('click', () => { T.entsperren(); infoBauen(); oeffne('#info'); });
$('#bProfil').addEventListener('click', () => { T.entsperren(); profilZeigen(); });
$('#bCoins').addEventListener('click', () => { T.entsperren(); profilZeigen(); });
$('#bTon').addEventListener('click', () => { T.entsperren(); $('#eEffekte').checked = T.einst.effekte; $('#eMusik').checked = T.einst.musik; $('#eLaut').value = T.einst.laut; oeffne('#einst'); });
$('#eEffekte').addEventListener('change', (e) => { T.einst.effekte = e.target.checked; T.speichern(); tonSymbol(); T.sfx.klick(); });
$('#eMusik').addEventListener('change', (e) => { T.einst.musik = e.target.checked; T.speichern(); tonSymbol(); });
$('#eLaut').addEventListener('input', (e) => { T.einst.laut = Number(e.target.value); T.speichern(); });
$('#eLaut').addEventListener('change', () => T.sfx.klick());
const tonSymbol = () => document.body.classList.toggle('stumm', !T.einst.effekte && !T.einst.musik);
$('#bTurbo').addEventListener('click', () => { turbo = !turbo; ls.set('rocketreels.turbo', turbo ? '1' : '0'); $('#bTurbo').setAttribute('aria-pressed', String(turbo)); toast(turbo ? 'Schnelle Walzen an' : 'Schnelle Walzen aus', 1400); });
addEventListener('pointerdown', () => T.entsperren(), { capture: true, passive: true });
addEventListener('resize', () => { if (!$('#risiko').hidden) risikoGroesse(); });

// ------------------------------------------------------------------ Start
async function start() {
  $('#bTurbo').setAttribute('aria-pressed', String(turbo)); tonSymbol();
  layout();
  await G.ladeBilder((p) => { $('#ladeText').textContent = 'Countdown läuft … ' + Math.round(p * 100) + ' %'; });
  bilderAnwenden();
  // PlaySaal-Skripte laden mit "defer" nach diesem Modul: kurz auf sie warten
  for (let i = 0; i < 40 && !(window.PlaySaal && window.PlaySaal.bereit && window.PlaySaal.bereit()); i++) {
    if (i > 4 && !window.PLAYSAAL_CFG) break; // Plattform-Skripte fehlen (z. B. Test) – als Gast spielen
    await new Promise((r) => setTimeout(r, 50));
  }
  await backendWaehlen();
  const gew = Number(ls.get('rocketreels.einsatz'));
  if (z.phase === 'bereit' && E.EINSAETZE.includes(gew) && gew <= Math.max(10, z.coins)) einsatz = gew;
  W.forEach((w, i) => { w.pos = z.letzte[i]; });
  angezeigteCoins = z.coins; $('#hCoins').textContent = fmt(z.coins);
  layout(); aktualisieren();
  $('#laden').hidden = true;
  if (z.phase === 'gewinn') text('Offener Gewinn <b>' + fmt(z.offen) + '</b>');
  if (z.phase === 'risiko') risikoOeffnen();
  if (z.phase === 'bonus') text('Freispiele laufen noch – <b>' + z.bonus.rest + '</b> übrig. Tippe auf Frei.');
  const P = window.PlaySaal;
  if (P && P.on) P.on('auth', () => kontoWechsel());
}
function bilderAnwenden() {
  const B = G.BILDER;
  if (B.hintergrund) { document.body.style.setProperty('--bg', 'url(' + B.hintergrund.src + ')'); document.body.classList.add('bild'); }
  if (B['bonus-hintergrund']) document.body.style.setProperty('--bg2', 'url(' + B['bonus-hintergrund'].src + ')');
  if (B.rahmen) { $('#rahmen').style.setProperty('--rahmen', 'url(' + B.rahmen.src + ')'); document.body.classList.add('mit-rahmen'); }
  T.musikDateien(G.TOENE);
}

// Für automatische Tests (Playwright): Zustand lesbar, nichts veränderbar
Object.defineProperty(window, '__rocket', { value: Object.freeze({ get zustand() { return JSON.parse(JSON.stringify(z)); }, get beschaeftigt() { return beschaeftigt; }, get art() { return backend && backend.art; }, get einsatz() { return einsatz; }, get zelle() { return zelle; } }) });
start();
