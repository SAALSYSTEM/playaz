// Neon Coast – Fluchtwagen: Oberfläche. Verbindet Regeln (engine.js), Zeichner, Ton, Steuerung, Menüs und Spielstand.
import { STORE, AUTOS, AUFTRAEGE, RAENGE, rang, frisch, saeubere, aktiveAuftraege, kaufen, abrechnen, parseEinladung, geld } from './daten.js';
import { neueFahrt, schritt, DT, feierabend, suchzeit, multi } from './engine.js';
import { ladeBilder, neuerZeichner, bildUrl } from './zeichner.js';
import { neuerTon } from './ton.js';
import { viertel, KOFFER } from './welt.js';

const $ = (id) => document.getElementById(id);
const cv = $('game');
const zahl = (n) => String(n).replace('.', ',');

// ---------- Spielstand
let save = frisch();
try { save = saeubere(JSON.parse(localStorage.getItem(STORE))); } catch { /* Privatmodus */ }
const sichern = () => { try { localStorage.setItem(STORE, JSON.stringify(save)); } catch { /* gesperrt */ } };
const einladung = parseEinladung(location.search);

const ton = neuerTon(() => save.mute);
const Zr = neuerZeichner(cv);
let mode = 'lade', S = null, acc = 0, letzte = 0, zurueck = 'start', schluss = 0, bilanz = null;
const eingabe = { lenk: 0, gas: false, bremse: false, hand: false, nitro: false };

// ---------- Bildschirme
const SCREENS = ['start', 'garage', 'auftraege', 'hilfe', 'pause', 'ende'];
function zeige(m) {
  mode = m; document.body.dataset.mode = m;
  for (const s of SCREENS) $(s).hidden = s !== m;
  const spiel = m === 'spiel' || m === 'schluss';
  $('hud').hidden = !spiel; $('ctl').hidden = m !== 'spiel'; $('tasten').hidden = m !== 'spiel';
  if (!spiel) { $('haft').hidden = true; $('hinweis').classList.add('weg'); $('viertel').classList.remove('an'); ton.still(); }
  if (m !== 'spiel') { tasten.clear(); zeiger.clear(); lies(); } else messen();
  if (m === 'start') malStart(); else if (m === 'garage') malGarage(); else if (m === 'auftraege') malAuftraege(); else if (m === 'pause') malPause();
}
function toast(text) { const t = $('toast'); t.textContent = text; t.hidden = false; clearTimeout(toast.h); toast.h = setTimeout(() => { t.hidden = true; }, 2600); }
function meldung(text, unter = '', farbe = '') {
  const box = $('meldung'), d = document.createElement('div');
  d.className = 'mld ' + farbe; d.textContent = text;
  if (unter) { const s = document.createElement('small'); s.textContent = unter; d.append(s); }
  box.append(d); while (box.children.length > 2) box.firstChild.remove();
  setTimeout(() => d.classList.add('raus'), 1700); setTimeout(() => d.remove(), 2100);
}
function hinweis(html, dauer = 5) { const h = $('hinweis'); h.innerHTML = html; h.classList.remove('weg'); clearTimeout(hinweis.h); if (dauer) hinweis.h = setTimeout(() => h.classList.add('weg'), dauer * 1000); }
const hinweisWeg = () => $('hinweis').classList.add('weg');

// ---------- Ton-Knopf
const LAUT = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9z" fill="currentColor"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>';
const LEISE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9z" fill="currentColor"/><path d="M16.5 9.5l5 5M21.5 9.5l-5 5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>';
function malTon() { document.querySelectorAll('[data-mute]').forEach((b) => { b.querySelector('.ico').innerHTML = save.mute ? LEISE : LAUT; b.setAttribute('aria-pressed', String(!save.mute)); b.setAttribute('aria-label', save.mute ? 'Ton an' : 'Ton aus'); }); }
document.querySelectorAll('[data-mute]').forEach((b) => b.addEventListener('click', () => { save.mute = !save.mute; sichern(); ton.wechselStumm(); if (!save.mute) ton.sfx('klick'); malTon(); }));

// ---------- Start, Garage, Aufträge
const konto = () => { try { return window.PlaySaal && window.PlaySaal.hostOk && !window.PlaySaal.user(); } catch { return false; } };
const leistbar = () => AUTOS.some((a) => !save.autos.includes(a.id) && save.geld >= a.preis);
function malStart() {
  $('sGeld').textContent = geld(save.geld); $('sRang').textContent = rang(save).name;
  $('sRek').hidden = !save.rekord; $('sRek').textContent = 'Rekord ' + geld(save.rekord);
  $('garagePunkt').hidden = !leistbar();
  const e = $('einladung');
  if (einladung) { e.hidden = false; e.innerHTML = save.rekord > einladung.r ? `Herausforderung geschafft: <b>${geld(einladung.r)}</b> in einer Nacht waren zu schlagen. Dein Rekord: <b>${geld(save.rekord)}</b>.` : `Jemand hat in einer Nacht <b>${geld(einladung.r)}</b> gesichert. Schaffst du mehr?`; }
  $('kontoStart').hidden = !(konto() && save.stat.naechte >= 2);
}
function malGarage() {
  $('gGeld').textContent = geld(save.geld);
  const L = $('gListe'); L.textContent = '';
  for (const a of AUTOS) {
    const hat = save.autos.includes(a.id), d = document.createElement('div');
    d.className = 'auto' + (save.auto === a.id ? ' gewaehlt' : '') + (hat ? '' : ' zu');
    const w = (n, v) => `<span>${n}</span><i style="--w:${Math.min(1, v).toFixed(2)}"></i>`;
    d.innerHTML = `<div class="bild"><img src="${bildUrl(a.bild)}" alt=""></div><h3></h3><p></p><div class="werte">${w('Tempo', a.vmax / 32)}${w('Antritt', a.acc / 19)}${w('Halt', a.grip / 31)}${w('Panzer', a.panzer / 2)}</div><div class="akt"><button type="button"></button></div>`;
    d.querySelector('h3').textContent = a.name; d.querySelector('p').textContent = a.text;
    const b = d.querySelector('button');
    if (save.auto === a.id) { b.textContent = 'Gewählt'; b.disabled = true; }
    else if (hat) { b.textContent = 'Nehmen'; b.className = 'wahl'; b.onclick = () => { save.auto = a.id; sichern(); ton.sfx('klick'); malGarage(); demo(); }; }
    else if (save.geld >= a.preis) { b.textContent = 'Kaufen · ' + geld(a.preis); b.onclick = () => { if (kaufen(save, a.id)) { sichern(); ton.sfx('kauf'); toast(a.name + ' gekauft!'); malGarage(); demo(); } }; }
    else { b.textContent = geld(a.preis) + ' · fehlen ' + geld(a.preis - save.geld); b.disabled = true; }
    L.append(d);
  }
}
function auftragZeile(a, nr, ok) {
  const d = document.createElement('div'); d.className = 'auftrag' + (ok ? ' ok' : '');
  const n = document.createElement('span'); n.className = 'nr'; n.textContent = ok ? '✓' : nr;
  const t = document.createElement('span'); t.textContent = a.text;
  const l = document.createElement('span'); l.className = 'lohn'; l.textContent = '+' + geld(a.lohn);
  d.append(n, t, l); return d;
}
function malAuftraege() {
  const L = $('aListe'); L.textContent = '';
  const akt = aktiveAuftraege(save);
  akt.forEach((a) => L.append(auftragZeile(a, AUFTRAEGE.indexOf(a) + 1, false)));
  if (!akt.length) { const p = document.createElement('p'); p.className = 'unter'; p.textContent = 'Alle Aufträge erledigt. Jetzt zählt nur noch dein Rekord.'; L.append(p); }
  $('aBalken').style.width = (save.erledigt.length / AUFTRAEGE.length * 100) + '%';
  $('aStand').textContent = save.erledigt.length + ' von ' + AUFTRAEGE.length + ' Aufträgen erledigt';
  const r = rang(save);
  $('aRang').textContent = 'Rang: ' + r.name + (r.naechster ? ' · noch ' + geld(r.bis - save.stat.sicher) + ' bis „' + r.naechster + '“' : ' · höchster Rang');
  $('aRangBalken').style.width = (r.bis ? Math.min(1, (save.stat.sicher - r.ab) / (r.bis - r.ab)) * 100 : 100) + '%';
}
function malPause() {
  Zr.plan($('karte'), S);
  const L = $('pAuftraege'); L.textContent = '';
  if (S) S.auftraege.forEach((a) => L.append(auftragZeile(a, AUFTRAEGE.indexOf(a) + 1, S.erledigt.includes(a.id))));
}

// ---------- Fahrt
function demo() { S = neueFahrt(save, 7, { sichtweite: Zr.sichtweite() }); merke(); Zr.neu(); }
function losfahren() {
  ton.entsperren();
  S = neueFahrt(save, Math.floor(Math.random() * 1e9) + 1, { sichtweite: Zr.sichtweite() });
  merke(); Zr.neu(); acc = 0; hudAlt = {}; letztesViertel = ''; nitroGesagt = false;
  $('meldung').textContent = '';
  zeige('spiel');
  ton.sfx('los'); ton.radio();
  hinweis(feinZeiger() ? '<b>W</b> oder <b>↑</b> gibt Gas, <b>A D</b> oder <b>← →</b> lenken. Hol dir den gelben Koffer!' : 'Rechts <b>Gas</b> halten, links <b>lenken</b>. Hol dir den gelben Koffer!', 0);
}
const feinZeiger = () => window.matchMedia && window.matchMedia('(hover:hover) and (pointer:fine)').matches;
const merke = () => { for (const c of S.autos) { c.px = c.x; c.py = c.y; c.pa = c.a; } };
const FUNK = ['', 'Zentrale: Kofferdiebstahl gemeldet.', 'Verstärkung ist unterwegs.', 'Alle Einheiten: Fluchtwagen stoppen!', 'Schwere Einheiten rücken aus!', 'Die ganze Stadt jagt dich!'];
let dingT = 0, nitroGesagt = false;
function ereignisse() {
  const sp = S.sp;
  for (const e of S.ev) {
    Zr.effekt(e, S);
    switch (e.t) {
      case 'los': hinweisWeg(); break;
      case 'koffer':
        ton.sfx('koffer', e.m);
        meldung('+' + geld(e.betrag), e.m > 1 ? 'Serie ×' + zahl(e.m) + ' · ' + KOFFER[e.art].name : KOFFER[e.art].name);
        $('hBeute').classList.remove('pop'); void $('hBeute').offsetWidth; $('hBeute').classList.add('pop');
        if (save.hilfe < 1) { save.hilfe = 1; hinweis('Die Polizei kommt! Bring die Beute ins <b>Versteck</b> (grüner Pfeil) – oder riskier noch einen Koffer.', 7); }
        break;
      case 'stern': ton.sfx('stern', e.n); meldung('FAHNDUNG ' + '★'.repeat(e.n), FUNK[e.n], 'rot'); sternNeu = e.n; break;
      case 'alarm': meldung(e.grund.toUpperCase() + '!', '', 'rot'); break;
      case 'entdeckt': ton.sfx('alarm'); meldung('ENTDECKT!', '', 'rot'); break;
      case 'entkommen': ton.sfx('entkommen'); meldung('ENTKOMMEN!', '+' + geld(e.bonus) + ' Bonus', 'cyan'); break;
      case 'gesichert':
        ton.sfx('gesichert'); ton.still();
        ortZeigen(e.betrag > 0 ? 'Beute gesichert' : 'Im Versteck', e.betrag > 0 ? '+' + geld(e.betrag) + ' · insgesamt ' + geld(S.sicher) : 'Fahndung weg, Auto repariert', '');
        if (save.hilfe < 2) save.hilfe = 2;
        break;
      case 'werkstatt': ton.sfx('kauf'); ton.still(); ortZeigen('Neu lackiert', (e.kosten ? 'Kostet ' + geld(e.kosten) + ' · ' : '') + 'Fahndung weg, Auto wie neu', 'cyan'); break;
      case 'raus': $('ort').hidden = true; hinweis(save.hilfe < 3 ? 'Sauber! Jeder weitere Koffer <b>ohne Sichern</b> ist mehr wert. Gas geben und weiter.' : 'Gas geben und weiter.', 0); if (save.hilfe < 3) save.hilfe = 3; break;
      case 'tor':
        ton.sfx('tor');
        if (e.grund === 'gesehen') hinweis('Das Tor bleibt zu, solange dich ein <b>Streifenwagen sieht</b>. Erst abhängen!', 4);
        else if (e.grund === 'trocknet') hinweis('Der Lack trocknet noch ' + e.s + ' Sekunden.', 3);
        else if (e.grund === 'leer') hinweis(e.typ === 'versteck' ? 'Dein Versteck. Komm mit Beute wieder.' : 'Lack &amp; Fix: hilft bei Fahndung oder Schaden.', 3);
        break;
      case 'krach': if (e.mit === 'fern') ton.sfx('fern'); else ton.sfx('krach', e.s); break;
      case 'ding': if (e.eigen && S.t - dingT > 0.07) { dingT = S.t; ton.sfx('ding'); } break;
      case 'haarscharf': ton.sfx('haarscharf'); break;
      case 'nitro': ton.sfx('nitro'); break;
      case 'schrott': ton.sfx('schrott'); break;
      case 'platsch': ton.sfx('platsch'); break;
      case 'hupe': ton.sfx('hupe'); break;
      case 'auftrag': ton.sfx('auftrag'); meldung('AUFTRAG ERLEDIGT', e.text + ' · +' + geld(e.lohn), 'gruen'); break;
      case 'ende':
        ton.still(); ton.sfx(e.grund === 'feierabend' ? 'gesichert' : e.grund === 'wasser' ? 'platsch' : e.grund === 'schrott' ? 'schrott' : 'geschnappt');
        schluss = e.grund === 'feierabend' ? 0.2 : 1.5; zeige('schluss');
        meldung(TITEL[e.grund], '', e.grund === 'feierabend' ? 'gruen' : 'rot');
        break;
    }
  }
  S.ev.length = 0;
  if (!nitroGesagt && S.nitro >= 1 && save.stat.naechte < 3 && S.t > 8) { nitroGesagt = true; hinweis(feinZeiger() ? 'Nitro ist voll: <b>Shift</b> zündet!' : 'Nitro ist voll: <b>NITRO</b> über der Bremse zündet!', 4); }
  void sp;
}
function ortZeigen(titel, unter, farbe) { const t = $('ortText'); t.className = farbe; t.textContent = titel; const s = document.createElement('small'); s.textContent = unter; t.append(s); $('ort').hidden = false; }

// ---------- Abrechnung
const TITEL = { geschnappt: 'GESCHNAPPT!', schrott: 'TOTALSCHADEN!', wasser: 'ABGESOFFEN!', feierabend: 'FEIERABEND' };
function abrechnung() {
  const grund = S.ende.grund, R = abrechnen(save, S); bilanz = R; sichern();
  $('ende').className = 'screen ' + grund;
  $('eTitel').textContent = TITEL[grund];
  $('eUnter').textContent = R.verloren > 0 ? 'Die Beute im Auto ist weg. Was im Versteck liegt, gehört dir.' : R.sicher > 0 ? 'Alles Gesicherte gehört dir.' : 'Diesmal ohne Beute. Schnapp dir einen Koffer und bring ihn ins Versteck!';
  $('eRekord').hidden = !R.neuerRekord || R.sicher <= 0;
  const T = $('eRechnung'); T.textContent = '';
  const zeile = (name, wert, kl = '') => { const d = document.createElement('div'); d.className = kl; const a = document.createElement('span'); a.textContent = name; const b = document.createElement('b'); b.textContent = wert; d.append(a, b); T.append(d); };
  zeile('Gesichert', geld(R.sicher), 'plus');
  if (R.verloren > 0) zeile('Im Auto verloren', geld(R.verloren), 'weg');
  for (const a of R.fertig) zeile('Auftrag: ' + a.text, '+' + geld(a.lohn), 'plus');
  zeile('Aufs Konto', '+' + geld(R.summe), 'sum');
  const kl = document.createElement('small'); const st = S.stat;
  kl.textContent = `${st.koffer} Koffer · beste Serie ${st.serie} · ${st.schrott} Streifenwagen Schrott · ${st.entkommen}× entkommen · Kontostand ${geld(save.geld)}`;
  T.append(kl);
  // nächstes Ziel: das günstigste Auto, das noch fehlt
  const next = AUTOS.find((a) => !save.autos.includes(a.id));
  $('eZiel').hidden = !next;
  if (next) {
    $('eZielBild').src = bildUrl(next.bild);
    const fehlt = next.preis - save.geld;
    $('eZielText').innerHTML = fehlt > 0 ? `Noch <b>${geld(fehlt)}</b> bis: <b>${next.name}</b>` : `Genug Geld für: <b>${next.name}</b> – ab in die Garage!`;
    $('eZielBalken').style.width = Math.min(100, save.geld / next.preis * 100) + '%';
  }
  $('eGaragePunkt').hidden = !leistbar();
  const e = $('eEinladung'); e.hidden = !einladung;
  if (einladung) e.innerHTML = R.sicher > einladung.r ? `Herausforderung geschafft! <b>${geld(einladung.r)}</b> waren zu schlagen.` : `Zu schlagen: <b>${geld(einladung.r)}</b> in einer Nacht.`;
  $('kontoEnde').hidden = !(konto() && save.stat.naechte >= 2);
  zeige('ende');
}
async function teilen() {
  const r = Math.max(bilanz ? bilanz.sicher : 0, save.rekord), url = location.origin + location.pathname + (r >= 100 ? '?r=' + r : '');
  const text = r >= 100 ? `Ich habe in Neon Coast ${geld(r)} in einer Nacht gesichert. Schaffst du mehr?` : 'Neon Coast – Fluchtwagen: Koffer schnappen, Polizei abhängen!';
  try { if (navigator.share) { await navigator.share({ title: 'Neon Coast – Fluchtwagen', text, url }); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
  try { await navigator.clipboard.writeText(text + ' ' + url); toast('Link kopiert – einfach einfügen und verschicken.'); } catch { toast(url); }
}

// ---------- HUD
const STERN = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l2.9 6.3 6.9.7-5.2 4.6 1.5 6.8L12 17l-6.100 3.400 1.500-6.800L2.200 9l6.900-.700z"/></svg>';
$('hSterne').innerHTML = STERN.repeat(5);
let hudAlt = {}, sternNeu = 0, letztesViertel = '', viertelT = 0;
function hud() {
  const sp = S.sp, H = hudAlt;
  if (H.sterne !== S.sterne || sternNeu) {
    H.sterne = S.sterne; const k = $('hSterne').children;
    for (let i = 0; i < 5; i++) { k[i].classList.toggle('an', i < S.sterne); if (sternNeu && i === sternNeu - 1) { k[i].classList.remove('neu'); void k[i].getBoundingClientRect(); k[i].classList.add('neu'); } }
    sternNeu = 0; $('hSterne').setAttribute('aria-label', 'Fahndung: ' + S.sterne + ' von 5 Sternen');
  }
  const such = S.sterne > 0 && !S.gesehen && S.peil <= 0;
  if (H.such !== such) { H.such = such; $('hSterne').classList.toggle('such', such); $('hSuch').classList.toggle('an', such); }
  const st = S.sterne === 0 ? '' : S.gesehen ? 'Polizei sieht dich' : S.peil > 0 ? 'Peilsender ' + Math.ceil(S.peil) + ' s' : 'Abhängen …';
  if (H.st !== st) { H.st = st; const t = $('hSuchT'); t.textContent = st; t.classList.toggle('rot', S.gesehen); }
  if (such) $('hSuch').firstChild.style.width = Math.min(100, S.sucht / suchzeit(S.sterne) * 100) + '%';
  const hp = Math.round(sp.hp / sp.hpMax * 50);
  if (H.hp !== hp) { H.hp = hp; const b = $('hLeben').firstChild; b.style.width = hp * 2 + '%'; b.style.background = hp > 25 ? 'var(--gruen)' : hp > 12 ? 'var(--brand)' : 'var(--rot)'; }
  if (H.beute !== S.beute) { H.beute = S.beute; $('hBeuteZ').textContent = geld(S.beute); }
  const m = multi(S.serie + 1);
  if (H.m !== m) { H.m = m; $('hMal').hidden = m <= 1; $('hMal').textContent = 'nächster ×' + zahl(m); }
  if (H.sicher !== S.sicher) { H.sicher = S.sicher; $('hSicher').textContent = 'Sicher: ' + geld(S.sicher); }
  const n = Math.round(Math.min(1, S.nitro) * 40), nz = S.nitroT > 0 ? 'b' : S.nitro >= 1 ? 'v' : '';
  if (H.n !== n || H.nz !== nz) { H.n = n; H.nz = nz; const b = $('bNitro'); b.style.setProperty('--f', S.nitroT > 0 ? S.nitroT / 2.6 : n / 40); b.classList.toggle('voll', nz === 'v'); b.classList.toggle('brennt', nz === 'b'); }
  const haft = S.haft > 0.08 && !S.ende;
  if (H.haft !== haft) { H.haft = haft; $('haft').hidden = !haft; }
  const v = viertel(sp.x, sp.y);
  if (v !== letztesViertel) { letztesViertel = v; const e = $('viertel'); e.textContent = v; e.classList.add('an'); viertelT = 2.4; }
}

// ---------- Steuerung
// Handy: links die Lenkleiste (stufenlos: je weiter außen der Daumen, desto stärker), rechts Gas, Bremse (im Stand rückwärts),
// Handbremse und Nitro. Ein Daumen darf von Pedal zu Pedal rutschen. Rechner: W A S D oder Pfeiltasten, Leertaste, Shift.
const zeiger = new Map(), tasten = new Set();   // zeiger: Kennung -> { x, y, seite, pedal }
const PEDALE = ['gas', 'bremse', 'hand', 'nitro'], KNOPF = { gas: 'bGas', bremse: 'bBremse', hand: 'bHand', nitro: 'bNitro' };
let lage = null;
function messen() { lage = { lenk: $('lenk').getBoundingClientRect() }; for (const k of PEDALE) lage[k] = $(KNOPF[k]).getBoundingClientRect(); window.__ncUnten = lage.gas.height ? window.innerHeight - lage.nitro.top + 14 : 120; }
function pedalBei(x, y) {   // das Pedal unter dem Finger, sonst das nächste in Daumenweite
  let best = '', bd = 64;
  for (const k of PEDALE) { const q = lage[k]; if (!q.width) continue; const d = Math.hypot(Math.max(q.left - x, 0, x - q.right), Math.max(q.top - y, 0, y - q.bottom)); if (d < bd) { bd = d; best = k; } }
  return best;
}
function lenkBei(x) {   // −1..1: kleine Ruhezone in der Mitte, zum Rand hin feiner dosierbar, Vollausschlag kurz vor dem Rand
  const q = lage.lenk; if (!q.width) return x < window.innerWidth / 4 ? -1 : 1;
  const v = Math.max(-1, Math.min(1, (x - (q.left + q.right) / 2) / (q.width / 2 - 30))), a = Math.abs(v);
  return a < 0.1 ? 0 : Math.sign(v) * ((a - 0.1) / 0.9) * (0.6 + 0.4 * a);
}
function lies() {
  let lenk = 0, gas = false, bremse = false, hand = false, finger = false;
  if (lage) for (const p of zeiger.values()) {
    if (p.seite === 'L') { lenk = lenkBei(p.x); finger = true; continue; }
    const k = pedalBei(p.x, p.y);
    if (k === 'nitro' && p.pedal !== 'nitro') eingabe.nitro = true;
    p.pedal = k;
    if (k === 'gas') gas = true; else if (k === 'bremse') bremse = true; else if (k === 'hand') hand = true;
  }
  const tl = tasten.has('ArrowLeft') || tasten.has('KeyA'), tr = tasten.has('ArrowRight') || tasten.has('KeyD');
  if (tl !== tr) lenk = tl ? -1 : 1;
  eingabe.lenk = lenk;
  eingabe.gas = gas || tasten.has('ArrowUp') || tasten.has('KeyW');
  eingabe.bremse = bremse || tasten.has('ArrowDown') || tasten.has('KeyS');
  eingabe.hand = hand || tasten.has('Space');
  const L = $('lenk'); L.style.setProperty('--l', lenk.toFixed(2)); L.classList.toggle('an', finger);
  $('bGas').classList.toggle('an', gas); $('bBremse').classList.toggle('an', bremse); $('bHand').classList.toggle('an', hand);
}
cv.addEventListener('pointerdown', (e) => {
  if (mode !== 'spiel') return;
  e.preventDefault(); ton.entsperren();
  const unten = e.clientY > window.innerHeight * 0.38;
  if (e.pointerType === 'mouse') { if (lage && pedalBei(e.clientX, e.clientY) === 'nitro') eingabe.nitro = true; return; }   // Maus fährt nicht, darf aber Nitro anklicken
  if (!unten) return;
  zeiger.set(e.pointerId, { x: e.clientX, y: e.clientY, seite: e.clientX < window.innerWidth / 2 ? 'L' : 'R', pedal: '' }); lies();
  try { cv.setPointerCapture(e.pointerId); } catch { /* egal */ }
});
cv.addEventListener('pointermove', (e) => { const p = zeiger.get(e.pointerId); if (!p) return; p.x = e.clientX; p.y = e.clientY; lies(); });
const los = (e) => { if (zeiger.delete(e.pointerId)) lies(); };
cv.addEventListener('pointerup', los); cv.addEventListener('pointercancel', los); cv.addEventListener('lostpointercapture', los);
cv.addEventListener('contextmenu', (e) => e.preventDefault());
window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape' || e.code === 'KeyP') { if (mode === 'spiel') pause(); else if (mode === 'pause') weiter(); else if (['garage', 'auftraege', 'hilfe'].includes(mode)) zeige(zurueck); return; }
  if (mode !== 'spiel') { if ((e.code === 'Enter' || e.code === 'Space') && !e.repeat && !(e.target instanceof HTMLButtonElement)) { if (mode === 'start' || mode === 'ende') { e.preventDefault(); losfahren(); } } return; }
  if (['ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp', 'Space', 'KeyA', 'KeyD', 'KeyS', 'KeyW'].includes(e.code)) e.preventDefault();
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.code === 'KeyN' || e.code === 'KeyX') { if (!e.repeat) eingabe.nitro = true; return; }
  tasten.add(e.code); lies();
});
window.addEventListener('keyup', (e) => { tasten.delete(e.code); lies(); });
function pause() { if (mode !== 'spiel') return; zeige('pause'); }
function weiter() { if (mode !== 'pause') return; acc = 0; letzte = performance.now(); zeige('spiel'); ton.radio(); }
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
window.addEventListener('blur', () => pause());

// ---------- Knöpfe
const klick = (id, fn) => $(id).addEventListener('click', () => { ton.entsperren(); ton.sfx('klick'); fn(); });
klick('bLos', losfahren); klick('eNochmal', losfahren);
klick('bGarage', () => { zurueck = 'start'; zeige('garage'); }); klick('eGarage', () => { zurueck = 'ende'; zeige('garage'); });
klick('bAuftraege', () => { zurueck = 'start'; zeige('auftraege'); }); klick('bHilfe', () => { zurueck = 'start'; zeige('hilfe'); });
klick('eStart', () => { demo(); zeige('start'); }); klick('eTeilen', teilen);
klick('bPause', pause); klick('pWeiter', weiter); klick('pSender', () => ton.sender());
klick('pEnde', () => { if (S && !S.ende) { zeige('spiel'); feierabend(S); ereignisse(); } });
document.querySelectorAll('[data-zurueck]').forEach((b) => b.addEventListener('click', () => { ton.sfx('klick'); zeige(zurueck); }));
document.querySelectorAll('[data-konto]').forEach((b) => b.addEventListener('click', () => { try { window.PlaySaal && window.PlaySaal.anmelden({}); } catch { /* Konten nicht verfügbar */ } }));

// ---------- Schleife: Regeln in festen Schritten (1/60 s), Bild so oft der Bildschirm kann
let zeitSumme = 0, zeitN = 0;
function bild(jetzt) {
  const dt = Math.min(0.1, Math.max(0, (jetzt - letzte) / 1000 || 0)); letzte = jetzt;
  let al = 1;
  if (mode === 'spiel' && S) {
    acc += dt; let n = 0;
    while (acc >= DT && n < 4 && mode === 'spiel') { merke(); schritt(S, eingabe); eingabe.nitro = false; acc -= DT; n++; if (S.ev.length) ereignisse(); }
    if (acc > DT * 3) acc = 0;
    for (const c of S.autos) if (c.px === undefined) { c.px = c.x; c.py = c.y; c.pa = c.a; }
    al = S.wartet || S.pause > 0 || S.ende ? 1 : acc / DT;
    if (mode === 'spiel') {
      hud();
      const sp = S.sp, v = Math.hypot(sp.vx, sp.vy);
      let nah = 0; if (S.sterne > 0) for (const c of S.autos) if (c.art === 'polizei' && c.modus === 'jagd' && c.hp > 0) nah = Math.max(nah, 1 - Math.min(1, c.dist / 70));
      ton.laufend(dt, v, sp.vmax, Math.min(1, Math.max(0, sp.rutsch - 2) / 7), nah, sp.nitro, !S.wartet && S.pause <= 0);
      if (viertelT > 0) { viertelT -= dt; if (viertelT <= 0) $('viertel').classList.remove('an'); }
    }
  } else if (mode === 'schluss') { schluss -= dt; if (schluss <= 0) abrechnung(); }
  Zr.zeichne(S, al, mode === 'pause' ? 0 : dt, mode !== 'spiel' && mode !== 'schluss' && mode !== 'pause');
  // Zu langsam? Dann mit weniger Bildpunkten zeichnen.
  if (mode === 'spiel' && dt > 0) { zeitSumme += dt; if (++zeitN >= 150) { const m = zeitSumme / zeitN; zeitSumme = 0; zeitN = 0; if (m > 0.027 && Zr.schaerfe() > 1) Zr.groesse(Zr.schaerfe() - 0.5); } }
  requestAnimationFrame(bild);
}
function passe() { Zr.groesse(); if (S) S.sichtweite = Zr.sichtweite(); window.__ncOben = parseFloat(getComputedStyle($('hud')).paddingTop) - 10 || 0; if (mode === 'spiel') messen(); }
window.addEventListener('resize', passe); window.addEventListener('orientationchange', passe);

// ---------- Start
passe(); malTon();
ladeBilder().then(() => {
  passe(); demo(); zeige('start'); document.body.classList.add('ready');
  letzte = performance.now(); requestAnimationFrame(bild);
});
// Für Tests
window.__neoncoast = { get S() { return S; }, get mode() { return mode; }, get save() { return save; }, eingabe, los: losfahren, zeichner: Zr, pause, weiter };
