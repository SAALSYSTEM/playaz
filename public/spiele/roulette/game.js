// Roulette – Oberfläche und Ablauf. Regeln: roulette.js. Tisch: tisch.js. Kessel/Kugel: kessel.js. Ton: ton.js. Speicher/Server: speicher.js.
// Grundsatz wie Rocket Reels: Erst steht die Zahl fest (Browser bzw. Server), dann rollt die Kugel genau dorthin. Animationen ändern nichts.
// Coins sind dieselben wie in Rocket Reels (gemeinsamer Stand).
import * as R from './roulette.js';
import * as E from '../rocket-reels/engine.js';
import * as T from './tisch.js';
import * as K from './kessel.js';
import * as A from './ton.js';
import * as S from './speicher.js';

const $ = (s) => document.querySelector(s);
const fmt = (n) => Math.floor(n).toLocaleString('de-DE');
const Q = location.search;
const TEST = /[?&]test\b/.test(Q);
const TT = TEST && !/[?&]zeitlupe\b/.test(Q);
const REDUZIERT = matchMedia('(prefers-reduced-motion: reduce)').matches;
const jetzt = () => performance.now() / 1000;
const ls = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };
const FARBNAME = { rot: 'Rot', schwarz: 'Schwarz', gruen: 'Zéro' };

// ------------------------------------------------------------------ Zustand
let backend = null;
let z = E.neuerZustand();
let wetten = {};            // aktuelle Einsätze auf dem Tisch (noch nicht gebucht)
let verlauf = [];           // für „Zurück“: Gruppen von { key, delta }
let phase = 'setzen';       // setzen | laeuft | ergebnis
let anzeige = null;         // Ergebnis auf dem Tisch: { zahl, wetten, treffer:Map, t0 }
let beschaeftigt = false, ueberspringen = false;
let jeton = (() => { const j = Number(ls.get('roulette-jeton')); return R.JETONS.includes(j) ? j : 5; })();
let letzte = (() => { let w = null; try { w = JSON.parse(ls.get('roulette-letzte')); } catch (e) {} return w && !R.pruefeWetten(w).fehler ? w : null; })();
let angezeigteCoins = 0;
const summe = (w) => Object.values(w).reduce((s, b) => s + b, 0);
const tempo = () => (TT ? 0.04 : 1);
function warte(ms) {
  const ende = jetzt() + (ms / 1000) * tempo();
  return new Promise((ok) => { const f = () => (ueberspringen || jetzt() >= ende ? ok() : setTimeout(f, 25)); f(); });
}

// ------------------------------------------------------------------ Tisch
const tisch = $('#tisch'); const tg = tisch.getContext('2d');
let L = T.aufteilen(300, 420), dpr = 1, grund = null;
const pops = new Map();     // key → Zeitpunkt des Setzens (kleiner Hüpfer)
let finger = null;          // { id, x, y, key, t0, erledigt }

function tischGroesse() {
  const box = $('.tisch-box');
  let W = box.clientWidth, H = box.clientHeight;
  if (H > W * 1.95) H = Math.round(W * 1.95);
  if (H < W * 1.25) W = Math.round(H / 1.25);
  W = Math.max(200, W); H = Math.max(260, H);
  dpr = Math.min(3, window.devicePixelRatio || 1);
  tisch.style.width = W + 'px'; tisch.style.height = H + 'px';
  tisch.width = Math.round(W * dpr); tisch.height = Math.round(H * dpr);
  L = T.aufteilen(W, H);
  grund = document.createElement('canvas'); grund.width = tisch.width; grund.height = tisch.height;
  const g = grund.getContext('2d'); g.scale(dpr, dpr); T.zeichneGrund(g, L);
}

function zeichneTisch(t) {
  const g = tg;
  g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, tisch.width, tisch.height);
  if (grund) g.drawImage(grund, 0, 0);
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const rj = T.jetonRadius(L);
  if (anzeige) {
    const dt = t - anzeige.t0;
    for (const k of anzeige.treffer.keys()) T.zeichneLeuchten(g, L, k, 'rgba(255,215,90,.22)');
    for (const [k, b] of Object.entries(anzeige.wetten)) {
      const p = T.ort(L, k); const gewonnen = anzeige.treffer.has(k);
      const a = gewonnen ? 1 : Math.max(0, 1 - Math.max(0, dt - 0.5) / 0.6);
      if (a > 0) T.zeichneJeton(g, p.x, p.y - (gewonnen ? 0 : (1 - a) * 12), rj, b, T.kurz(b), a, gewonnen);
    }
    T.zeichneDolly(g, L, anzeige.zahl, t);
    for (const [k, rueck] of anzeige.treffer) {
      const p = T.ort(L, k); const s = Math.min(1, dt / 0.5);
      g.save(); g.globalAlpha = Math.min(1, dt * 3);
      g.font = '800 ' + Math.round(rj * 1.15) + 'px "Barlow Condensed",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'bottom';
      g.lineWidth = 4; g.strokeStyle = 'rgba(0,0,0,.75)'; const tx = '+' + fmt(rueck);
      g.strokeText(tx, p.x, p.y - rj - 2 - s * 6); g.fillStyle = '#FFD21C'; g.fillText(tx, p.x, p.y - rj - 2 - s * 6);
      g.restore();
    }
  } else {
    if (finger && finger.key && !finger.erledigt) T.zeichneLeuchten(g, L, finger.key);
    for (const [k, b] of Object.entries(wetten)) {
      const p = T.ort(L, k); const p0 = pops.get(k);
      const sc = p0 ? 1 + 0.28 * Math.max(0, 1 - (t - p0) / 0.18) : 1;
      T.zeichneJeton(g, p.x, p.y, rj * sc, b);
    }
  }
}

// Antippen: Vorschau beim Halten, Setzen beim Loslassen, langes Drücken nimmt den Stapel weg
function tischPunkt(e) { const r = tisch.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
tisch.addEventListener('pointerdown', (e) => {
  A.entsperren();
  if (beschaeftigt) { ueberspringen = true; return; }
  if (finger) return;
  const p = tischPunkt(e);
  if (phase === 'ergebnis') neueRunde();
  finger = { id: e.pointerId, x: p.x, y: p.y, key: T.treffer(L, p.x, p.y), t0: jetzt(), erledigt: false };
  try { tisch.setPointerCapture(e.pointerId); } catch (x) {}
  finger.timer = setTimeout(() => {
    if (!finger || finger.erledigt || !finger.key || !wetten[finger.key]) return;
    const k = finger.key, b = wetten[k];
    delete wetten[k]; verlauf.push([{ key: k, delta: -b }]); finger.erledigt = true;
    A.sfx.weg(); if (navigator.vibrate) try { navigator.vibrate(25); } catch (x) {}
    toast(fmt(b) + ' Coins von ' + wettName(k) + ' zurückgenommen', 1600);
    aktualisieren();
  }, 520);
  vorschau(); anstossen(0.3);
});
tisch.addEventListener('pointermove', (e) => {
  if (!finger || e.pointerId !== finger.id) return;
  const p = tischPunkt(e);
  const k = T.treffer(L, p.x, p.y);
  if (Math.hypot(p.x - finger.x, p.y - finger.y) > 9) clearTimeout(finger.timer);
  if (k !== finger.key) { finger.key = k; vorschau(); anstossen(0.1); }
});
function fingerEnde(e, setzenOk) {
  if (!finger || e.pointerId !== finger.id) return;
  clearTimeout(finger.timer);
  const f = finger; finger = null;
  if (setzenOk && !f.erledigt && f.key) setzen(f.key, jeton);
  aktualisieren(); anstossen(0.3);
}
tisch.addEventListener('pointerup', (e) => fingerEnde(e, true));
tisch.addEventListener('pointercancel', (e) => fingerEnde(e, false));
tisch.addEventListener('contextmenu', (e) => e.preventDefault());

const wettName = (k) => { const d = R.WETTEN.get(k); return d ? (d.art === 'dutzend' || d.art === 'kolonne' || d.art === 'einfach' ? d.name : R.artName(d.art) + ' ' + d.name) : k; };
const quote = (k) => R.WETTEN.get(k).faktor + ' : 1';
function vorschau() {
  if (!finger || !finger.key) return ansageStandard();
  const b = wetten[finger.key];
  ansage(wettName(finger.key) + ' · ' + quote(finger.key) + (b ? ' · <b>' + fmt(b) + '</b> gesetzt' : ''));
}

// ------------------------------------------------------------------ Setzen
function pruefeNeu(neu) {
  const p = R.pruefeWetten(neu);
  if (p.fehler === 'feld_limit') return 'Tischlimit: höchstens ' + R.FELD_MAX + ' je Feld.';
  if (p.fehler === 'runde_limit') return 'Tischlimit: höchstens ' + fmt(R.RUNDE_MAX) + ' Coins je Runde.';
  if (p.fehler === 'zu_viele') return 'Mehr Felder gehen nicht auf einmal.';
  if (p.fehler) return 'Das geht nicht.';
  if (p.summe > z.coins) return 'Nicht genug Coins für diesen Einsatz.';
  return null;
}
function setzen(key, betrag) {
  if (phase === 'ergebnis') neueRunde();
  const alt = wetten[key] || 0;
  let b = Math.min(betrag, R.FELD_MAX - alt);
  if (b <= 0) { toast('Tischlimit: höchstens ' + R.FELD_MAX + ' je Feld.'); return false; }
  const frei = z.coins - summe(wetten);
  if (b > frei) { if (frei >= 1 && frei < betrag) b = frei; else { toast(frei < 1 ? 'Keine Coins mehr frei.' : 'Nicht genug Coins.'); return false; } }
  const neu = { ...wetten, [key]: alt + b };
  const f = pruefeNeu(neu); if (f) { toast(f); return false; }
  wetten = neu; verlauf.push([{ key, delta: b }]); pops.set(key, jetzt());
  A.sfx.jeton(); aktualisieren(); anstossen(0.3);
  return true;
}
// mehrere Felder auf einmal (Kesselwetten, Nochmal, Doppelt): ganz oder gar nicht
function mehrereSetzen(liste, wasText) {
  if (phase === 'ergebnis') neueRunde();
  const neu = { ...wetten }; const gruppe = [];
  for (const [k, b] of liste) { neu[k] = (neu[k] || 0) + b; gruppe.push({ key: k, delta: b }); }
  const f = pruefeNeu(neu); if (f) { toast(f); return false; }
  wetten = neu; verlauf.push(gruppe); const t = jetzt(); for (const [k] of liste) pops.set(k, t);
  A.sfx.jeton(); setTimeout(() => A.sfx.jeton(), 60);
  if (wasText) toast(wasText, 1500);
  aktualisieren(); anstossen(0.3);
  return true;
}
function zurueck() {
  if (beschaeftigt) return;
  if (phase === 'ergebnis') { neueRunde(); return; }
  const g = verlauf.pop(); if (!g) return;
  for (const { key, delta } of [...g].reverse()) { const n = (wetten[key] || 0) - delta; if (n > 0) wetten[key] = n; else delete wetten[key]; }
  A.sfx.weg(); aktualisieren(); anstossen(0.1);
}
function leeren() { if (beschaeftigt) return; if (phase === 'ergebnis') neueRunde(); if (!Object.keys(wetten).length) return; verlauf.push(Object.entries(wetten).map(([key, b]) => ({ key, delta: -b }))); wetten = {}; A.sfx.weg(); aktualisieren(); anstossen(0.1); }
function nochmal(faktor = 1) {
  if (beschaeftigt || !letzte) return false;
  return mehrereSetzen(Object.entries(letzte).map(([k, b]) => [k, b * faktor]), faktor > 1 ? 'Letzte Einsätze doppelt gesetzt' : null);
}
function doppelt() {
  if (beschaeftigt) return;
  if (phase === 'ergebnis' || !Object.keys(wetten).length) { if (letzte) nochmal(2); else toast('Setze zuerst Jetons.'); return; }
  mehrereSetzen(Object.entries(wetten), 'Alle Einsätze verdoppelt');
}
function neueRunde() { phase = 'setzen'; anzeige = null; wetten = {}; verlauf = []; aktualisieren(); anstossen(0.1); }

// ------------------------------------------------------------------ Kessel
const kesselBox = $('#kesselBox'), kc = $('#kessel'), kg = kc.getContext('2d');
let B = 300, kdpr = 1, gross = false;
let bew = K.stehend(-(Math.random() * Math.PI * 2));
let kugel = null;           // (t) → { w, r }
function kesselGroesse() {
  const vw = innerWidth, vh = innerHeight;
  B = Math.round(Math.max(200, Math.min(vw - 28, vh * 0.56, 460)));
  kdpr = Math.min(2.5, window.devicePixelRatio || 1);
  kesselBox.style.width = B + 'px'; kesselBox.style.height = B + 'px';
  const px = Math.round(B * kdpr);
  if (kc.width !== px) { kc.width = kc.height = px; K.cacheLeeren(); }
  kesselLage();
}
function kesselLage() {
  const vw = innerWidth, vh = innerHeight;
  const oben = Math.max(56, Math.round((vh - B) / 2 - 50));
  if (gross) kesselBox.style.transform = 'translate(' + Math.round((vw - B) / 2) + 'px,' + oben + 'px) scale(1)';
  else { const r = $('#kesselPlatz').getBoundingClientRect(); kesselBox.style.transform = 'translate(' + r.left + 'px,' + r.top + 'px) scale(' + (r.width / B) + ')'; }
  $('#ergebnis').style.top = (oben + B + 12) + 'px';
}
function kesselGross(an) { gross = an; $('#dunkel').hidden = !an; kesselLage(); }
function zeichneKessel(t) { const k = kugel ? kugel(t) : null; K.zeichne(kg, kc.width, K.kesselWinkel(bew, t), k); }

// ------------------------------------------------------------------ Zeichen-Schleife (läuft nur, solange sich etwas bewegt)
let aktivBis = 0, laeuft = false;
function anstossen(sek) { aktivBis = Math.max(aktivBis, jetzt() + sek); if (!laeuft) { laeuft = true; requestAnimationFrame(schritt); } }
function schritt() {
  const t = jetzt();
  zeichneTisch(t); zeichneKessel(t);
  if (t < aktivBis || beschaeftigt || anzeige && t - anzeige.t0 < 1.5 || finger) requestAnimationFrame(schritt); else laeuft = false;
}

// ------------------------------------------------------------------ Anzeige
function ansage(html) { $('#ansage').innerHTML = html; }
function ansageStandard() {
  if (phase === 'laeuft') return ansage('Rien ne va plus');
  if (phase === 'ergebnis' && anzeige) return ansage(anzeige.text);
  const s = summe(wetten), n = Object.keys(wetten).length;
  ansage(n ? 'Einsatz <b>' + fmt(s) + '</b> · ' + n + (n === 1 ? ' Feld' : ' Felder') : 'Faites vos jeux!');
}
function zeigeCoins(ziel, puls = false) {
  const el = $('#hCoins');
  if (puls) { $('#bCoins').classList.remove('puls'); void $('#bCoins').offsetWidth; $('#bCoins').classList.add('puls'); }
  const von = angezeigteCoins; angezeigteCoins = ziel;
  if (von === ziel || TT || REDUZIERT) { el.textContent = fmt(ziel); return; }
  const t0 = jetzt(), d = Math.min(0.8, 0.2 + Math.abs(ziel - von) / 4000);
  const f = () => { const s = Math.min(1, (jetzt() - t0) / d); el.textContent = fmt(von + (ziel - von) * (1 - (1 - s) * (1 - s))); if (s < 1 && angezeigteCoins === ziel) requestAnimationFrame(f); };
  f();
}
function permanenz() {
  const ol = $('#perm'); ol.replaceChildren();
  const t = R.teil(z); if (!t) return;
  t.perm.slice(0, 12).forEach((n) => { const li = document.createElement('li'); li.className = R.farbe(n); li.textContent = n; li.setAttribute('aria-label', n + ' ' + FARBNAME[R.farbe(n)]); ol.append(li); });
}
function aktualisieren() {
  const s = summe(wetten), leer = !Object.keys(wetten).length;
  document.querySelectorAll('.jetons button').forEach((b) => { const j = Number(b.dataset.j); b.setAttribute('aria-checked', String(j === jeton)); b.disabled = beschaeftigt; });
  const d = $('#bDreh'); d.classList.remove('tanken', 'laeuft');
  const tanken = (leer || phase === 'ergebnis') && E.darfNachfuellen(z);
  const letzteSumme = letzte ? summe(letzte) : 0;
  if (beschaeftigt) { d.classList.add('laeuft'); $('#drehText').textContent = 'Rollt …'; $('#drehUnter').textContent = 'Tippen: schneller'; d.disabled = false; }
  else if (tanken) { d.classList.add('tanken'); $('#drehText').textContent = 'Auffüllen'; $('#drehUnter').textContent = '+' + fmt(E.NACHFUELLEN - z.coins) + ' gratis'; d.disabled = false; }
  else if ((leer || phase === 'ergebnis') && letzte && letzteSumme <= z.coins) { $('#drehText').textContent = 'Nochmal'; $('#drehUnter').textContent = fmt(letzteSumme) + ' Coins'; d.disabled = false; }
  else if (leer || phase === 'ergebnis') { $('#drehText').textContent = 'Drehen'; $('#drehUnter').textContent = 'Setze Jetons'; d.disabled = true; }
  else { $('#drehText').textContent = 'Drehen'; $('#drehUnter').textContent = fmt(s) + ' Coins'; d.disabled = s > z.coins; }
  d.setAttribute('aria-label', $('#drehText').textContent + ', ' + $('#drehUnter').textContent);
  $('#bZurueck').disabled = beschaeftigt || (!verlauf.length && phase !== 'ergebnis');
  $('#bLeeren').disabled = beschaeftigt || leer;
  $('#bNochmal').disabled = beschaeftigt || !letzte;
  $('#bDoppelt').disabled = beschaeftigt || (leer && !letzte) && phase !== 'ergebnis';
  $('#bKessel').disabled = beschaeftigt;
  $('#bTages').hidden = beschaeftigt || z.tagesbonus === S.berlinTag();
  rrHinweis();
  if (!finger) ansageStandard();
  if (!beschaeftigt) zeigeCoins(phase === 'setzen' ? z.coins - s : z.coins);
}
// Rocket Reels teilt die Coins: offene Dinge dort hier sichtbar machen
function rrHinweis() {
  const el = $('#rrHinweis');
  if (beschaeftigt || z.phase === 'bereit') { el.hidden = true; return; }
  el.replaceChildren(); const sp = document.createElement('span');
  if (z.phase === 'gewinn') {
    sp.textContent = 'Offener Gewinn aus Rocket Reels: ' + fmt(z.offen) + ' Coins';
    const b = document.createElement('button'); b.type = 'button'; b.textContent = 'Gutschreiben'; b.addEventListener('click', rrSichern);
    el.append(sp, b);
  } else {
    sp.textContent = z.phase === 'risiko' ? 'In Rocket Reels läuft noch ein Hyperjump.' : 'In Rocket Reels warten noch Freispiele.';
    const a = document.createElement('a'); a.href = '/spiele/rocket-reels'; a.textContent = 'Weiter';
    el.append(sp, a);
  }
  el.hidden = false;
}
async function rrSichern() {
  if (beschaeftigt) return;
  beschaeftigt = true; aktualisieren();
  const r = await ausfuehren({ typ: 'sichern' });
  beschaeftigt = false;
  if (r.fehler) toast(fehlerText(r.fehler)); else { z = r.zustand; toast('+' + fmt(r.ergebnis.betrag) + ' Coins gutgeschrieben'); zeigeCoins(z.coins, true); }
  aktualisieren();
}
let toastT = 0;
function toast(t, ms = 2600) { const el = $('#toast'); el.textContent = t; el.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { el.hidden = true; }, ms); }
const FEHLER = { netz: 'Keine Verbindung zum Server. Dein Stand ist sicher – bitte gleich noch einmal.', konflikt: 'Dein Stand wurde gerade woanders geändert (z. B. in Rocket Reels). Er ist jetzt aktualisiert – bitte noch einmal.',
  zu_oft: 'Etwas langsamer – zu viele Anfragen.', nicht_angemeldet: 'Deine Anmeldung ist abgelaufen. Bitte neu anmelden.', zu_wenig: 'Nicht genug Coins für diesen Einsatz.', schon_abgeholt: 'Heute schon abgeholt.',
  feld_limit: 'Tischlimit: höchstens ' + R.FELD_MAX + ' je Feld.', runde_limit: 'Tischlimit: höchstens ' + fmt(R.RUNDE_MAX) + ' je Runde.', ungueltig: 'Roulette wird für Konten gerade eingerichtet. Bitte später noch einmal.' };
const fehlerText = (f) => FEHLER[f] || 'Das hat nicht geklappt (' + f + ').';
async function ausfuehren(a) {
  const r = await backend.ausfuehren(a);
  if (r.fehler && backend.zustand()) z = backend.zustand();
  return r;
}

// ------------------------------------------------------------------ Drehen
async function drehTipp() {
  A.entsperren();
  if (beschaeftigt) { ueberspringen = true; return; }
  const leer = !Object.keys(wetten).length || phase === 'ergebnis';
  if (leer && E.darfNachfuellen(z)) return tanken();
  if (leer) { if (!letzte) return; if (!nochmal()) return; }
  return drehen();
}
async function drehen() {
  const gesetzt = { ...wetten }; const einsatz = summe(gesetzt);
  if (!einsatz) return;
  if (einsatz > z.coins) { toast(fehlerText('zu_wenig')); return; }
  beschaeftigt = true; ueberspringen = false; phase = 'laeuft';
  ansage('Rien ne va plus'); zeigeCoins(z.coins - einsatz);
  const t0 = jetzt();
  bew = K.anschub(K.kesselWinkel(bew, t0), t0, 1);
  kesselGross(true); A.sfx.kessel(); aktualisieren(); anstossen(1);
  const r = await ausfuehren({ typ: 'roulette', wetten: gesetzt });
  if (r.fehler) {
    bew = K.auslaufen(bew, jetzt());
    await warte(500); kesselGross(false);
    beschaeftigt = false; phase = 'setzen'; aktualisieren(); toast(fehlerText(r.fehler), 3600); return;
  }
  const e = r.ergebnis;
  if (!TT) await warte(Math.max(0, 450 - (jetzt() - t0) * 1000)); // Kessel kurz anlaufen lassen
  const dauer = TT ? 0.2 : REDUZIERT ? 1.6 : 5.4;
  const ts = jetzt();
  kugel = K.plan(bew, ts, dauer, e.zahl, K.kesselWinkel(bew, ts) + Math.random() * Math.PI * 2);
  A.sfx.rollen(dauer * 0.92);
  const klacks = [0.6, 0.6 + 0.4 * 0.13, 0.6 + 0.4 * 0.35, 0.6 + 0.4 * 0.7].map((x) => ts + x * dauer);
  let ki = 0;
  await new Promise((ok) => {
    const f = () => {
      const t = jetzt();
      while (ki < klacks.length && t >= klacks[ki]) { A.sfx.klack(1 - ki * 0.2); ki++; }
      if (t >= ts + dauer) return ok();
      if (ueberspringen) { const zahl = e.zahl; kugel = (tt) => K.imFach(bew, tt, zahl); A.sfx.rollenStopp(); A.sfx.klack(0.6); return ok(); }
      setTimeout(f, 16);
    };
    f();
  });
  const zahl = e.zahl;
  kugel = (tt) => K.imFach(bew, tt, zahl);
  bew = K.auslaufen(bew, jetzt());
  // Ergebnis zeigen
  z = r.zustand;
  letzte = gesetzt; ls.set('roulette-letzte', JSON.stringify(letzte));
  const ziel = $('#ergebnis');
  ziel.className = 'ergebnis ' + e.farbe;
  $('#eZahl').textContent = zahl;
  $('#eText').textContent = zahlText(zahl);
  const g = $('#eGewinn');
  if (e.rueck > 0) { g.textContent = 'Gewinn ' + fmt(e.rueck); g.className = ''; } else { g.textContent = 'Kein Treffer'; g.className = 'nichts'; }
  ziel.hidden = false;
  permanenz();
  if (e.netto >= einsatz * 10 && e.rueck >= 200) A.sfx.gross(); else if (e.rueck > 0) A.sfx.gewinn();
  ueberspringen = false;
  await warte(TT ? 50 : 1700);
  ziel.hidden = true; kesselGross(false);
  phase = 'ergebnis';
  anzeige = { zahl, wetten: gesetzt, treffer: new Map(e.treffer.map((x) => [x.key, x.rueck])), t0: jetzt(),
    text: '<b>' + zahl + '</b> ' + FARBNAME[e.farbe] + ' · ' + (e.rueck > 0 ? 'Gewinn <b>+' + fmt(e.rueck) + '</b>' : 'leider kein Treffer') };
  wetten = {}; verlauf = [];
  beschaeftigt = false; ueberspringen = false;
  zeigeCoins(z.coins, e.rueck > 0);
  aktualisieren(); anstossen(2);
  hinweisPruefen(e);
}
function zahlText(n) {
  if (n === 0) return 'Zéro';
  return [FARBNAME[R.farbe(n)], n % 2 ? 'Ungerade' : 'Gerade', n <= 18 ? '1–18' : '19–36', Math.ceil(n / 12) + '. Dutzend'].join(' · ');
}
async function tanken() {
  beschaeftigt = true; aktualisieren();
  const r = await ausfuehren({ typ: 'nachfuellen' });
  beschaeftigt = false;
  if (r.fehler) toast(fehlerText(r.fehler)); else { z = r.zustand; toast('+' + fmt(r.ergebnis.plus) + ' Coins gratis aufgefüllt'); zeigeCoins(z.coins, true); }
  if (phase === 'ergebnis') neueRunde(); else aktualisieren();
}
async function tagesbonus() {
  if (beschaeftigt) return;
  A.entsperren();
  const r = await ausfuehren({ typ: 'tagesbonus' });
  if (r.fehler) { toast(fehlerText(r.fehler)); aktualisieren(); return; }
  z = r.zustand; A.sfx.gewinn(); toast('Tagesbonus: +' + E.TAGESBONUS + ' Coins (gilt auch für Rocket Reels)');
  zeigeCoins(z.coins - (phase === 'setzen' ? summe(wetten) : 0), true); aktualisieren();
}

// ------------------------------------------------------------------ Dialoge
function oeffne(sel) { $(sel).hidden = false; const k = $(sel + ' [data-zu]') || $(sel + ' button'); k && k.focus(); }
document.querySelectorAll('[data-zu]').forEach((b) => b.addEventListener('click', () => { b.closest('.schicht').hidden = true; }));
document.querySelectorAll('.dialog').forEach((d) => d.addEventListener('pointerdown', (e) => { if (e.target === d && d.querySelector('[data-zu]')) d.hidden = true; }));
addEventListener('keydown', (e) => {
  if (e.key === 'Escape') document.querySelectorAll('.dialog:not([hidden])').forEach((d) => { if (d.querySelector('[data-zu]')) d.hidden = true; });
  if ((e.key === ' ' || e.key === 'Enter') && e.target === document.body && document.querySelectorAll('.schicht:not([hidden]):not(.blatt)').length === 0) { e.preventDefault(); drehTipp(); }
  if ((e.key === 'Backspace' || (e.key === 'z' && (e.ctrlKey || e.metaKey))) && e.target === document.body) { e.preventDefault(); zurueck(); }
});

function infoBauen() {
  const q = [['Plein', '1 Zahl', 35], ['Cheval', '2 Zahlen nebeneinander', 17], ['Transversale', '3 Zahlen einer Reihe (auch 0/1/2, 0/2/3)', 11], ['Carré', '4 Zahlen im Quadrat (auch 0/1/2/3)', 8],
    ['Sixain', '6 Zahlen aus zwei Reihen', 5], ['Dutzend · Kolonne', '12 Zahlen', 2], ['Einfache Chancen', 'Rot/Schwarz, Gerade/Ungerade, 1–18/19–36', 1]];
  $('#iQuoten').innerHTML = q.map(([a, b, f]) => '<tr><td>' + a + '<small>' + b + '</small></td><td>' + f + ' : 1</td></tr>').join('');
  const li = (arr) => arr.map((t) => '<li>' + t + '</li>').join('');
  $('#iSetzen').innerHTML = li([
    'Jeton-Wert unten wählen, dann aufs Feld tippen. Beim Halten leuchtet die Wette auf und oben steht, was du setzt.',
    '<b>Feldmitte</b> = Plein, <b>Linie</b> zwischen zwei Zahlen = Cheval, <b>Kreuzung</b> = Carré.',
    '<b>Linker Rand</b> der Zahlen = Transversale (Reihe), linker Rand <b>auf einer Linie</b> = Sixain (zwei Reihen).',
    'Linie zur <b>Null</b> = Wetten mit der Null. <b>Lange drücken</b> nimmt einen Stapel wieder weg.',
    '<b>Kessel</b>: Voisins du Zéro, Tiers, Orphelins, Jeu Zéro und Nachbarn mit einem Tipp.',
    'Fällt die <b>Null</b>, verlieren alle Wetten, die sie nicht enthalten – auch die einfachen Chancen.',
    'Tischlimit: 1 bis ' + R.FELD_MAX + ' Coins je Feld, höchstens ' + fmt(R.RUNDE_MAX) + ' je Runde.']);
  $('#iCoins').innerHTML = li([
    '<b>Gemeinsame Coins mit Rocket Reels:</b> Was du hier gewinnst, kannst du dort spielen – und umgekehrt.',
    'Start mit ' + fmt(E.START_COINS) + ' Coins. Sind es weniger als ' + E.EINSAETZE[0] + ', füllst du gratis auf ' + fmt(E.NACHFUELLEN) + ' auf – ohne Werbung, ohne Konto.',
    'Tagesbonus +' + E.TAGESBONUS + ' einmal am Tag (für beide Spiele zusammen).',
    'Als Gast bleibt alles auf diesem Gerät. Mit einem kostenlosen PlaySaal-Konto liegen Coins und Statistik sicher im Konto; dann rechnet der Server jede Runde selbst.']);
  $('#iFair').innerHTML = '<b>Nur Spielgeld.</b> Coins haben keinen Geldwert. Sie können nicht gekauft, ausgezahlt, getauscht oder gegen Preise eingelöst werden. Roulette ist eine reine Unterhaltungssimulation und kein Glücksspiel um Geld. ' +
    'Jede Zahl kommt mit genau 1 zu 37 (Krypto-Zufall, die Zahl steht vor dem Rollen der Kugel fest); jede Wette zahlt auf Dauer 97,3 % zurück. Nicht für Kinder gedacht: PlaySaal empfiehlt das Spiel ab 18 Jahren (keine offizielle Altersfreigabe).';
}

function profilZeigen() {
  const t = R.teil(z) || R.neuerTeil(); const s = t.stats;
  const zeilen = [['Coins', fmt(z.coins)], ['Gespielte Runden', fmt(s.runden)], ['Virtuelle Einsätze', fmt(s.einsatz)], ['Ausgezahlt', fmt(s.gewinn)],
    ['Höchster Gewinn einer Runde', fmt(s.hoechster)], ['Plein-Treffer', fmt(s.plein)]];
  const dl = $('#pStats'); dl.replaceChildren();
  zeilen.forEach(([a, b]) => { const dt = document.createElement('dt'); dt.textContent = a; const dd = document.createElement('dd'); dd.textContent = b; dl.append(dt, dd); });
  const p = t.perm; $('#pAnzahl').textContent = p.length;
  const box = $('#pPerm'); box.replaceChildren();
  if (p.length) {
    const n = { rot: 0, schwarz: 0, gruen: 0 }; p.forEach((x) => n[R.farbe(x)]++);
    const bal = document.createElement('div'); bal.className = 'balken';
    for (const f of ['rot', 'schwarz', 'gruen']) if (n[f]) { const i = document.createElement('i'); i.className = f; i.style.flex = String(n[f]); i.textContent = n[f]; bal.append(i); }
    const zaehl = new Map(); p.forEach((x) => zaehl.set(x, (zaehl.get(x) || 0) + 1));
    const heiss = [...zaehl].filter(([, c]) => c >= 2).sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, 6);
    const kalt = R.KESSEL.filter((x) => !zaehl.has(x)).sort((a, b) => a - b).slice(0, p.length >= 37 ? 12 : 0);
    const reihe = (titel, liste) => { const d = document.createElement('div'); d.className = 'zahlen'; d.append(titel); liste.forEach((x) => { const em = document.createElement('em'); em.className = R.farbe(x); em.textContent = x; d.append(em); }); return d; };
    box.append(bal);
    if (heiss.length) box.append(reihe('Öfter: ', heiss.map(([x]) => x)));
    if (kalt.length) box.append(reihe('Noch nicht: ', kalt));
    const k = document.createElement('p'); k.className = 'klein'; k.textContent = 'Nur zur Unterhaltung: Jede Runde ist unabhängig, frühere Zahlen sagen nichts über die nächste.'; box.append(k);
  } else { const k = document.createElement('p'); k.className = 'klein'; k.textContent = 'Noch keine Runde gespielt.'; box.append(k); }
  const P = window.PlaySaal;
  if (backend.art === 'konto') { $('#pModus').textContent = 'Gespeichert in deinem PlaySaal-Konto – Coins gemeinsam mit Rocket Reels.'; $('#pKonto').hidden = true; $('#pHinweis').textContent = ''; }
  else {
    $('#pModus').textContent = 'Gast · Stand nur auf diesem Gerät · Coins gemeinsam mit Rocket Reels.';
    $('#pKonto').hidden = !(P && P.hostOk && !P.user());
    $('#pHinweis').textContent = P && P.user() ? 'Konto-Speicherung für die Coins wird gerade eingerichtet. Bis dahin bleibt der Stand auf diesem Gerät.' : 'Mit einem kostenlosen PlaySaal-Konto (ab 16) sicherst du Coins und Statistik.';
  }
  oeffne('#profil');
}

function annoncenBauen() {
  const box = $('#nachbarn'); box.replaceChildren();
  for (let n = 0; n <= 36; n++) {
    const b = document.createElement('button'); b.type = 'button'; b.className = R.farbe(n); b.textContent = n; b.setAttribute('aria-label', 'Nachbarn von ' + n);
    b.addEventListener('click', () => { $('#annoncen').hidden = true; mehrereSetzen(R.nachbarn(n).map((x) => [String(x), jeton]), 'Nachbarn von ' + n + ': ' + R.nachbarn(n).join(' · ')); });
    box.append(b);
  }
  document.querySelectorAll('.ann').forEach((b) => b.addEventListener('click', () => {
    const a = R.ANNONCEN[b.dataset.a]; $('#annoncen').hidden = true;
    mehrereSetzen(a.felder.map(([k, st]) => [k, st * jeton]), a.name + ' gesetzt');
  }));
}

// ------------------------------------------------------------------ Konto-Hinweise (dezent, max. 2 je Sitzung, nach Ablehnung 24 h Ruhe)
const HKEY = 'roulette-hinweis';
function hinweisDaten() { let d = null; try { d = JSON.parse(ls.get(HKEY)); } catch (e) {} return d && typeof d === 'object' ? d : { nein: 0, zehn: false, gross: false }; }
let hinweiseSitzung = 0;
async function hinweisPruefen(e) {
  const P = window.PlaySaal;
  if (!P || !P.hostOk || P.user() || backend.art !== 'gast' || hinweiseSitzung >= 2) return;
  const d = hinweisDaten(); if (Date.now() - (d.nein || 0) < 24 * 3600 * 1000) return;
  const t = R.teil(z); if (!t) return;
  let grund = null;
  if (!d.zehn && t.stats.runden >= 10) { d.zehn = true; grund = 'zehn'; }
  else if (!d.gross && t.stats.runden >= 3 && e.netto >= 300) { d.gross = true; grund = 'gross'; }
  ls.set(HKEY, JSON.stringify(d));
  if (!grund) return;
  let a = null; try { a = await P.anbieter(); } catch (x) {}
  if (!a || !(a.email || a.google || a.apple)) return;
  hinweiseSitzung++; $('#werbung').hidden = false;
}
$('#wJa').addEventListener('click', () => { $('#werbung').hidden = true; const P = window.PlaySaal; if (P) P.anmelden({}); });
$('#wNein').addEventListener('click', () => { $('#werbung').hidden = true; const d = hinweisDaten(); d.nein = Date.now(); ls.set(HKEY, JSON.stringify(d)); });
$('#pKonto').addEventListener('click', () => { $('#profil').hidden = true; const P = window.PlaySaal; if (P) P.anmelden({}); });

// ------------------------------------------------------------------ Gast oder Konto (gleicher Schalter wie Rocket Reels: gemeinsame Coins)
async function backendWaehlen() {
  const P = window.PlaySaal;
  const konto = !!(P && P.user && P.user() && P.cfg && P.cfg.rocketReels === true);
  if (konto) {
    const k = S.konto(P); const geladen = await k.laden();
    if (geladen) { backend = k; z = geladen; return; }
    toast('Konto-Stand gerade nicht erreichbar – du spielst vorerst als Gast.', 4000);
  }
  backend = S.lokal(testZufall()); z = backend.zustand();
}
// Nur mit ?test: Zufall ersetzen (?folge=17,0,… dann Krypto). Wirkt nur im Gast-Modus.
function testZufall() {
  if (!TEST) return null;
  const folge = ((Q.match(/[?&]folge=([\d,]+)/) || [])[1] || '').split(',').filter(Boolean).map(Number);
  const basis = R.kryptoZufall();
  return (n) => { while (folge.length) { const v = folge.shift(); if (v < n) return v; } return basis(n); };
}
async function gastAngebot(P) {
  if (z.gastUebernommen) return;
  const gast = S.gastLaden();
  const gr = gast && R.teil(gast);
  if (!gast || (gast.stats.runden === 0 && (!gr || gr.stats.runden === 0) && gast.coins === E.START_COINS)) return;
  const uid = (P.user() || {}).id || '';
  const nein = (ls.get('rocketreels-gast-nein') || '').split(',');
  if (nein.includes(uid)) return;
  const neu = Math.max(z.coins, Math.min(gast.coins, E.GAST_IMPORT_MAX));
  $('#gText').textContent = 'Auf diesem Gerät hast du als Gast ' + fmt(gast.coins) + ' Coins (Roulette und Rocket Reels). In deinem Konto sind es ' + fmt(z.coins) + '. ' +
    'Übernommen wird der höhere Stand (höchstens ' + fmt(E.GAST_IMPORT_MAX) + ', also ' + fmt(neu) + ') und deine Statistik – einmalig je Konto, nichts wird doppelt gutgeschrieben.';
  oeffne('#gast');
  await new Promise((ok) => {
    const ja = async () => { aus(); const r = await backend.gastUebernehmen(gast);
      if (r.fehler) toast(r.fehler === 'schon_uebernommen' ? 'Für dieses Konto wurde schon ein Gast-Stand übernommen.' : fehlerText(r.fehler)); else { z = r.zustand; toast('Gast-Stand übernommen: ' + fmt(z.coins) + ' Coins'); }
      ok(); };
    const nee = () => { aus(); ls.set('rocketreels-gast-nein', [...nein.filter(Boolean), uid].slice(-10).join(',')); ok(); };
    const aus = () => { $('#gast').hidden = true; $('#gJa').removeEventListener('click', ja); $('#gNein').removeEventListener('click', nee); };
    $('#gJa').addEventListener('click', ja); $('#gNein').addEventListener('click', nee);
  });
}
let wechselAusstehend = false;
async function kontoWechsel() {
  if (beschaeftigt) { wechselAusstehend = true; return; }
  wechselAusstehend = false;
  const vorher = backend && backend.art;
  await backendWaehlen();
  wetten = {}; verlauf = []; phase = 'setzen'; anzeige = null;
  angezeigteCoins = z.coins; permanenz(); aktualisieren(); anstossen(0.1);
  if (backend.art === 'konto') { await gastAngebot(window.PlaySaal); permanenz(); aktualisieren(); }
  if (backend.art !== vorher) toast(backend.art === 'konto' ? 'Coins aus deinem PlaySaal-Konto geladen.' : 'Abgemeldet – du spielst als Gast auf diesem Gerät.');
}
setInterval(() => { if (wechselAusstehend && !beschaeftigt) kontoWechsel(); }, 1500);
// Zurück aus Rocket Reels (anderer Tab): aktuellen Stand holen
document.addEventListener('visibilitychange', async () => {
  if (document.hidden || !backend || beschaeftigt) return;
  const neu = await backend.laden();
  if (neu && !beschaeftigt) {
    z = neu;
    // gesetzte Jetons, die nicht mehr gedeckt sind, kommen vom Tisch
    if (summe(wetten) > z.coins) { wetten = {}; verlauf = []; toast('Dein Stand hat sich geändert – Jetons wurden zurückgenommen.'); }
    permanenz(); aktualisieren(); anstossen(0.1);
  }
});

// ------------------------------------------------------------------ Bedienung
$('#bDreh').addEventListener('click', drehTipp);
$('#bZurueck').addEventListener('click', zurueck);
$('#bLeeren').addEventListener('click', leeren);
$('#bNochmal').addEventListener('click', () => { A.entsperren(); nochmal(); });
$('#bDoppelt').addEventListener('click', () => { A.entsperren(); doppelt(); });
$('#bKessel').addEventListener('click', () => { A.entsperren(); document.querySelectorAll('.aJeton').forEach((e) => { e.textContent = jeton; }); oeffne('#annoncen'); });
$('#bTages').addEventListener('click', tagesbonus);
$('#bInfo').addEventListener('click', () => { A.entsperren(); infoBauen(); oeffne('#info'); });
$('#bCoins').addEventListener('click', () => { A.entsperren(); profilZeigen(); });
$('#bTon').addEventListener('click', () => { A.entsperren(); A.einst.an = !A.einst.an; A.speichern(); tonSymbol(); if (A.einst.an) A.sfx.klick(); toast(A.einst.an ? 'Ton an' : 'Ton aus', 1200); });
const tonSymbol = () => document.body.classList.toggle('stumm', !A.einst.an);
document.querySelectorAll('.jetons button').forEach((b) => b.addEventListener('click', () => {
  if (beschaeftigt) return; A.entsperren(); A.sfx.klick(); jeton = Number(b.dataset.j); ls.set('roulette-jeton', String(jeton)); aktualisieren();
}));
$('#dunkel').addEventListener('pointerdown', () => { if (beschaeftigt) ueberspringen = true; });
addEventListener('pointerdown', () => A.entsperren(), { capture: true, passive: true });
function layout() { tischGroesse(); kesselGroesse(); anstossen(0.1); }
addEventListener('resize', () => { clearTimeout(layout.t); layout.t = setTimeout(layout, 80); });
addEventListener('orientationchange', () => setTimeout(layout, 250));

// ------------------------------------------------------------------ Start
async function start() {
  tonSymbol(); annoncenBauen();
  if (REDUZIERT) document.body.classList.add('ruhe');
  layout();
  if (document.fonts && document.fonts.load) { try { await Promise.race([document.fonts.load('700 16px "Barlow Condensed"'), new Promise((r) => setTimeout(r, 1200))]); } catch (e) {} }
  for (let i = 0; i < 40 && !(window.PlaySaal && window.PlaySaal.bereit && window.PlaySaal.bereit()); i++) {
    if (i > 4 && !window.PLAYSAAL_CFG) break;
    await new Promise((r) => setTimeout(r, 50));
  }
  await backendWaehlen();
  const t = R.teil(z);
  if (t && t.perm.length) { const n = t.perm[0]; bew = K.stehend(-R.KESSEL.indexOf(n) * Math.PI * 2 / 37 + (Math.random() - 0.5) * 2); kugel = (tt) => K.imFach(bew, tt, n); }
  angezeigteCoins = z.coins; $('#hCoins').textContent = fmt(z.coins);
  layout(); permanenz(); aktualisieren();
  $('#laden').hidden = true;
  requestAnimationFrame(() => { document.body.classList.add('bereit'); kesselLage(); });
  if (!t) toast('Die Roulette-Daten in deinem Stand sind beschädigt – bitte melde das über „Fehler melden“.', 6000);
  if (backend.art === 'konto') { await gastAngebot(window.PlaySaal); permanenz(); aktualisieren(); }
  const P = window.PlaySaal;
  if (P && P.on) P.on('auth', () => kontoWechsel());
}

// Für automatische Tests (Playwright): Zustand lesbar, Punkte auf dem Tisch berechenbar, nichts veränderbar
Object.defineProperty(window, '__roulette', { value: Object.freeze({
  get zustand() { return JSON.parse(JSON.stringify(z)); }, get wetten() { return { ...wetten }; }, get phase() { return phase; },
  get beschaeftigt() { return beschaeftigt; }, get art() { return backend && backend.art; }, get jeton() { return jeton; },
  punkt(key) { const p = T.ort(L, key); const r = tisch.getBoundingClientRect(); return p && { x: r.left + p.x, y: r.top + p.y }; },
  treffer(x, y) { const r = tisch.getBoundingClientRect(); return T.treffer(L, x - r.left, y - r.top); }
}) });
start();
