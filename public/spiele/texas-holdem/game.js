// Texas Hold'em – Oberfläche und Ablauf. Regeln + Computergegner: poker.js. Speicher/Server: speicher.js. Ton: ton.js.
// Jede Aktion wird vollständig ausgewertet (Browser bzw. Server); hier werden nur die Ereignisse nacheinander gezeigt.
// Die Oberfläche bekommt nur die Ansicht (keine verdeckten Gegnerkarten, kein Stapel). Coins = dieselben wie Roulette/Rocket Reels.
import * as P from './poker.js';
import * as E from '../rocket-reels/engine.js';
import * as A from './ton.js';
import * as S from './speicher.js';

const $ = (s) => document.querySelector(s);
const fmt = (n) => Math.floor(n).toLocaleString('de-DE');
const Q = location.search;
const TEST = /[?&]test\b/.test(Q);
const TT = TEST && !/[?&]zeitlupe\b/.test(Q);
const REDUZIERT = matchMedia('(prefers-reduced-motion: reduce)').matches;
const ls = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };
const LAEUFT = ['preflop', 'flop', 'turn', 'river'];
const FARBEN_AV = { kalle: '#b0552a', vera: '#3b2b5a', bruno: '#8a1f2b', hilde: '#6a4c8c', lindqvist: '#2c5a6b' };
const POS = [[50, 73], [11, 62], [11, 27], [50, 7], [89, 27], [89, 62]];
const MITTE = [50, 44];

let backend = null;
let z = E.neuerZustand();
let beschaeftigt = false, schnell = false;
let bilder = new Set();
let vm = null;           // was gerade gezeigt wird
const tempo = () => (TT ? 0.02 : schnell ? 0.25 : REDUZIERT ? 0.5 : 1);
const warte = (ms) => new Promise((ok) => setTimeout(ok, ms * tempo()));

// ------------------------------------------------------------------ Karten und Avatare
function karteEl(k, extra = '') {
  const d = document.createElement('div');
  if (k === null || k === undefined || k < 0) { d.className = 'karte-x ruecken ' + extra; return d; }
  const rot = (k & 3) === 1 || (k & 3) === 2;
  d.className = 'karte-x ' + (rot ? 'r ' : '') + extra; d.dataset.k = k;
  const r = P.RANG[k >> 2] === 'T' ? '10' : P.RANG[k >> 2]; const f = P.FARBE[k & 3];
  d.innerHTML = '<span class="ra">' + r + '</span><span class="fa">' + f + '</span><span class="gr">' + f + '</span>';
  d.setAttribute('aria-label', kartenName(k));
  return d;
}
const RANGNAME = ['Zwei', 'Drei', 'Vier', 'Fünf', 'Sechs', 'Sieben', 'Acht', 'Neun', 'Zehn', 'Bube', 'Dame', 'König', 'Ass'];
const FARBNAME = ['Pik', 'Herz', 'Karo', 'Kreuz'];
const kartenName = (k) => FARBNAME[k & 3] + ' ' + RANGNAME[k >> 2];
function avatarEl(id, klein = false) {
  const d = document.createElement('div'); d.className = 'avatar' + (klein ? ' klein' : '');
  const b = P.BOTS[id];
  d.style.setProperty('--av', 'radial-gradient(circle at 35% 30%,' + FARBEN_AV[id] + ',#111)');
  d.textContent = b.name.replace('Prof. ', '').replace('Oma ', '')[0];
  if (bilder.has(id)) { const i = document.createElement('img'); i.src = '/spiele/texas-holdem/img/' + id + '.webp?v=1'; i.alt = ''; i.onerror = () => i.remove(); d.append(i); }
  return d;
}

// ------------------------------------------------------------------ Sitze
const sitzEls = [];
function sitzeBauen() {
  const box = $('#sitze'); box.replaceChildren(); sitzEls.length = 0;
  for (let i = 0; i < P.PLAETZE; i++) {
    const [x, y] = POS[i];
    const s = document.createElement('div'); s.className = 'sitz ' + (i === 0 ? 'ich-sitz' : x < 50 ? 'links' : x > 50 ? 'rechts' : 'oben');
    s.style.left = x + '%'; s.style.top = y + '%';
    const name = document.createElement('div'); name.className = 'name';
    const chips = document.createElement('div'); chips.className = 'chips';
    const hk = document.createElement('div'); hk.className = 'hk';
    const blase = document.createElement('div'); blase.className = 'blase'; blase.hidden = true;
    let av = null;
    if (i > 0) { av = document.createElement('div'); s.append(av, name, chips, hk, blase); } else s.append(name, chips, blase);
    const einsatz = document.createElement('div'); einsatz.className = 'einsatz'; einsatz.hidden = true; einsatz.innerHTML = '<i></i><b></b>';
    const ex = x + (MITTE[0] - x) * (i === 0 ? 0 : 0.42), ey = y + (MITTE[1] - y) * (i === 0 ? 0.42 : 0.42);
    einsatz.style.left = ex + '%'; einsatz.style.top = ey + '%';
    box.append(s, einsatz);
    sitzEls.push({ s, av, name, chips, hk, blase, einsatz, ex, ey, id: null, kartenKey: '' });
  }
  const d = document.createElement('div'); d.className = 'dealer'; d.id = 'dealer'; d.textContent = 'D'; d.hidden = true; box.append(d);
}
function dealerOrt(i) {
  const [x, y] = POS[i];
  const dx = i === 0 ? x + 16 : i === 3 ? x - 14 : x + (MITTE[0] - x) * 0.3, dy = i === 0 ? y - 4 : i === 3 ? y + 9 : y + 10;
  return [dx, dy];
}

// ------------------------------------------------------------------ Anzeige-Modell
function vmAus(st) {
  const t = st.poker && st.poker.t; if (!t) return null;
  const laeuft = LAEUFT.includes(t.phase);
  return {
    s: t.s.map((x) => ({ id: x.b, c: x.c, e: laeuft ? x.e : 0, k: x.k, f: x.f, a: x.a, r: x.r, o: x.o, blase: null, w: null })),
    board: t.board.slice(), pot: laeuft ? t.s.reduce((s, x) => s + x.g - x.e, 0) : 0, dealer: t.dealer, zug: laeuft ? t.zug : -1,
    top: null, gewinner: [], neu: new Set()
  };
}
function render() {
  if (!vm) return;
  const t = z.poker.t;
  vm.s.forEach((x, i) => {
    const el = sitzEls[i];
    if (i > 0 && el.id !== x.id) { el.av.replaceWith(el.av = avatarEl(x.id)); el.id = x.id; }
    el.name.textContent = i === 0 ? 'Du' : P.BOTS[x.id].name;
    el.chips.textContent = x.r ? 'raus' : x.a && LAEUFT.includes(t ? t.phase : '') && x.c === 0 ? 'All-in' : fmt(x.c);
    el.s.classList.toggle('dran', vm.zug === i);
    el.s.classList.toggle('passiv', !!x.f);
    el.s.classList.toggle('raus', !!x.r);
    el.s.classList.toggle('offen', !!(x.o && x.k));
    if (x.blase) { el.blase.hidden = false; el.blase.textContent = x.blase.t; el.blase.className = 'blase ' + x.blase.c; } else el.blase.hidden = true;
    el.einsatz.hidden = !(x.e > 0); el.einsatz.querySelector('b').textContent = fmt(x.e);
    if (i > 0) {
      const key = x.k ? x.k.join() + (x.f ? 'f' : '') : '';
      if (key !== el.kartenKey || vm.top) {
        const neu = !el.kartenKey && x.k;
        el.hk.replaceChildren(); el.kartenKey = key;
        if (x.k && !x.f) x.k.forEach((k) => el.hk.append(karteEl(k, (neu ? 'neu' : x.o && k >= 0 ? 'dreh' : '') + topKlasse(k, i))));
      }
    }
  });
  // eigene Karten
  const ich = vm.s[0]; const mk = $('#meineKarten');
  const key = ich.k ? ich.k.join() + (ich.f ? 'f' : '') + (vm.top ? 't' : '') : '';
  if (mk.dataset.key !== key) {
    const neu = !mk.dataset.key && ich.k;
    mk.replaceChildren(); mk.dataset.key = key;
    if (ich.k) ich.k.forEach((k) => mk.append(karteEl(k, (neu ? 'neu' : '') + (ich.f ? ' matt' : '') + topKlasse(k, 0))));
  }
  $('#meineHand').textContent = ich.k && !ich.f && vm.board.length >= 3 ? P.handName(P.wert([...ich.k, ...vm.board])) : '';
  // Board
  const b = $('#board');
  const bk = vm.board.join() + (vm.top ? 't' : '');
  if (b.dataset.key !== bk) {
    const alt = b.dataset.key ? b.dataset.key.replace('t', '').split(',').filter(Boolean).length : 0;
    b.replaceChildren(); b.dataset.key = bk;
    vm.board.forEach((k, n) => b.append(karteEl(k, (n >= alt && !vm.top ? 'neu' : '') + topKlasse(k, -1))));
  }
  $('#pot').textContent = vm.pot > 0 ? 'Pot ' + fmt(vm.pot) : '';
  const d = $('#dealer');
  if (vm.dealer >= 0) { const [dx, dy] = dealerOrt(vm.dealer); d.style.left = dx + '%'; d.style.top = dy + '%'; d.hidden = false; }
  tischInfo();
}
function topKlasse(k, sitz) {
  if (!vm.top) return '';
  if (vm.top.has(k) && (sitz < 0 || vm.gewinner.includes(sitz))) return ' top';
  return sitz >= 0 && !vm.gewinner.includes(sitz) ? '' : (sitz < 0 ? ' matt' : '');
}
function tischInfo() {
  const t = z.poker && z.poker.t;
  if (!t) { $('#tischInfo').textContent = 'Poker-Lobby'; return; }
  if (t.art === 'cash') $('#tischInfo').textContent = P.CASH[t.stufe].name + ' · Blinds ' + t.sb + '/' + t.bb + (t.nr ? ' · Hand ' + t.nr : '');
  else $('#tischInfo').textContent = 'Sit & Go · Blinds ' + t.sb + '/' + t.bb + ' · noch ' + t.sng.lebend + ' im Spiel';
}

// ------------------------------------------------------------------ Ereignisse abspielen
const ZUGTEXT = { fold: 'Passt', check: 'Check', call: 'Geht mit', bet: 'Setzt', raise: 'Erhöht', allin: 'All-in' };
function blase(i, t, c, ms = 0) { vm.s[i].blase = { t, c }; render(); if (ms) setTimeout(() => { if (vm && vm.s[i].blase && vm.s[i].blase.t === t) { vm.s[i].blase = null; render(); } }, ms * tempo()); }
async function abspielen(ev) {
  for (const e of ev) {
    if (!vm && e.t !== 'aufstehen' && e.t !== 'sngEnde') vm = vmAus(z);
    switch (e.t) {
      case 'nachkauf':
        if (e.s > 0) { vm.s[e.s].c = e.c; blase(e.s, 'kauft nach', 'call', 1500); await warte(300); }
        else { vm.s[0].c = e.c; render(); }
        break;
      case 'level': toast('Blinds steigen auf ' + e.sb + '/' + e.bb); await warte(700); break;
      case 'neu': {
        vm.board = []; vm.pot = 0; vm.top = null; vm.gewinner = []; vm.dealer = e.dealer;
        vm.s.forEach((x, i) => { x.e = 0; x.k = null; x.f = false; x.a = false; x.o = false; x.blase = null; x.c = e.c[i]; });
        $('#ansage').textContent = '';
        sitzEls.forEach((el) => { el.kartenKey = ''; }); $('#meineKarten').dataset.key = '';
        render(); await warte(250);
        const [sb, bsb] = e.sb, [bb, bbb] = e.bb;
        vm.s[sb].c -= bsb; vm.s[sb].e = bsb; vm.s[bb].c -= bbb; vm.s[bb].e = bbb;
        A.sfx.chips(); render(); await warte(250);
        vm.s.forEach((x, i) => { if (!x.r && (x.c > 0 || x.e > 0)) x.k = i === 0 ? e.karten : [-1, -1]; });
        A.sfx.karte(); render(); await warte(450);
        break;
      }
      case 'akt': {
        const x = vm.s[e.s];
        vm.zug = e.s; render();
        if (e.s > 0) await warte(420 + Math.random() * 380);
        x.e = e.e; x.c = e.c; if (e.z === 'fold') x.f = true; if (e.z === 'allin') x.a = true;
        const txt = ZUGTEXT[e.z] + (['call', 'bet', 'raise'].includes(e.z) ? ' ' + fmt(e.z === 'call' ? e.b : e.e) : '');
        if (e.z === 'fold') A.sfx.fold(); else if (e.z === 'check') A.sfx.check(); else A.sfx.chips();
        blase(e.s, txt, e.z, 1800);
        vm.zug = -1; render(); await warte(e.s > 0 ? 260 : 120);
        break;
      }
      case 'strasse': {
        const gesamt = vm.s.reduce((s, x) => s + x.e, 0);
        if (gesamt) { await chipsZurMitte(); vm.pot += gesamt; vm.s.forEach((x) => { x.e = 0; }); render(); }
        vm.s.forEach((x) => { if (x.blase && x.blase.c !== 'allin') x.blase = null; });
        await warte(250);
        for (const k of e.k) { vm.board.push(k); A.sfx.karte(); render(); await warte(e.k.length > 1 ? 180 : 300); }
        await warte(350);
        break;
      }
      case 'zeigen': {
        const gesamt = vm.s.reduce((s, x) => s + x.e, 0);
        if (gesamt) { await chipsZurMitte(); vm.pot += gesamt; vm.s.forEach((x) => { x.e = 0; }); }
        vm.s[e.s].k = e.k; vm.s[e.s].o = true; vm.s[e.s].blase = { t: e.w, c: 'zeigen' };
        A.sfx.karte(); render(); await warte(550);
        break;
      }
      case 'pot': {
        const gesamt = vm.s.reduce((s, x) => s + x.e, 0);
        if (gesamt) { await chipsZurMitte(); vm.pot += gesamt; vm.s.forEach((x) => { x.e = 0; }); render(); }
        vm.zug = -1;
        if (e.name) {
          const s0 = e.s[0]; const k = vm.s[s0].k;
          if (k && k[0] >= 0 && vm.board.length === 5) { vm.top = new Set(P.besteFuenf([...k, ...vm.board])); vm.gewinner = e.s.slice(); }
          $('#ansage').textContent = (e.s.length > 1 ? 'Geteilt' : nameVon(s0)) + ' · ' + e.name;
        } else $('#ansage').textContent = nameVon(e.s[0]) + ' gewinnt';
        vm.pot = Math.max(0, vm.pot - e.b);
        e.s.forEach((i, n) => { vm.s[i].c += e.je[n]; vm.s[i].blase = { t: '+' + fmt(e.je[n]), c: 'gewinn' }; });
        if (e.s.includes(0)) { const g = e.je[e.s.indexOf(0)]; if (g >= (z.poker.t ? z.poker.t.bb : 20) * 25) A.sfx.gross(); else A.sfx.gewinn(); }
        else A.sfx.chips();
        render(); await warte(1300);
        break;
      }
      case 'raus': vm.s[e.s].r = true; blase(e.s, e.s === 0 ? 'Ausgeschieden' : 'Platz ' + e.platz, 'fold'); await warte(500); break;
      case 'aufstehen': case 'sngEnde': break;
    }
  }
}
const nameVon = (i) => (i === 0 ? 'Du' : P.BOTS[vm.s[i].id].name);
async function chipsZurMitte() {
  sitzEls.forEach((el, i) => { if (vm.s[i].e > 0) { el.einsatz.style.left = MITTE[0] + '%'; el.einsatz.style.top = (MITTE[1] - 6) + '%'; el.einsatz.style.opacity = '0'; } });
  A.sfx.chips(); await warte(380);
  sitzEls.forEach((el) => { el.einsatz.style.left = el.ex + '%'; el.einsatz.style.top = el.ey + '%'; el.einsatz.style.opacity = ''; });
}

// ------------------------------------------------------------------ Steuerung
function steuerung() {
  const t = z.poker && z.poker.t;
  $('#zugKnoepfe').hidden = true; $('#raisePanel').hidden = true; $('#nachHand').hidden = true; $('#warten').hidden = false;
  clearTimeout(autoT);
  if (!t) return;
  vm && (vm.zug = LAEUFT.includes(t.phase) ? t.zug : -1); render();
  if (beschaeftigt) { $('#wartenText').textContent = ''; return; }
  const m = P.moeglich(t);
  if (m) {
    $('#warten').hidden = true; $('#zugKnoepfe').hidden = false;
    $('#bCall').innerHTML = m.kannCheck ? 'Check' : (m.zuZahlen >= t.s[0].c ? 'All-in' : 'Mitgehen') + '<small>' + fmt(m.zuZahlen) + '</small>';
    $('#bFold').textContent = 'Passen';
    $('#bRaise').disabled = !m.kannRaise;
    $('#bRaise').innerHTML = (m.hoch === 0 ? 'Setzen' : 'Erhöhen') + '<small>ab ' + fmt(m.minZiel) + '</small>';
    A.sfx.dran();
    return;
  }
  if (t.phase === 'ende') {
    $('#warten').hidden = true; $('#nachHand').hidden = false;
    $('#bAufstehen').textContent = t.art === 'cash' ? 'Aufstehen' : 'Aufgeben';
    autoWeiter(4);
    return;
  }
  if (t.phase === 'leer') { $('#wartenText').textContent = 'Keine Chips mehr'; leerDialog(); return; }
  $('#wartenText').textContent = '';
}
let autoT = 0;
function autoWeiter(sek) {
  const b = $('#bWeiter');
  const f = () => { if (sek <= 0 || document.hidden) { b.textContent = 'Nächste Hand'; if (sek <= 0 && !document.hidden && !TEST) weiter(); return; } b.textContent = 'Nächste Hand (' + sek + ')'; sek--; autoT = setTimeout(f, 1000); };
  if (TEST || document.querySelector('.dialog:not([hidden])')) { b.textContent = 'Nächste Hand'; return; }
  f();
}

async function ausfuehren(a) {
  const r = await backend.ausfuehren(a);
  if (r.fehler && backend.zustand()) z = backend.zustand();
  return r;
}
async function poker(a, { abspielenOk = true } = {}) {
  if (beschaeftigt) return null;
  beschaeftigt = true; schnell = false; clearTimeout(autoT); steuerung();
  const r = await ausfuehren({ typ: 'poker', ...a });
  if (r.fehler) { beschaeftigt = false; toast(fehlerText(r.fehler)); ansicht(); return r; }
  const vorher = z; z = r.zustand;
  if (abspielenOk && ((vorher.poker && vorher.poker.t) || a.p === 'start')) {
    if (a.p === 'start') { zeigeTisch(); vm = vmAus(z); vm.s.forEach((x) => { x.k = null; }); vm.board = []; render(); }
    const kopie = z; z = { ...kopie, poker: { ...kopie.poker, t: kopie.poker.t || vorher.poker.t } };
    await abspielen(r.ergebnis.ev);
    z = kopie;
  }
  beschaeftigt = false; schnell = false;
  zeigeCoins(z.coins);
  const ende = r.ergebnis.ev.find((e) => e.t === 'sngEnde');
  const auf = r.ergebnis.ev.find((e) => e.t === 'aufstehen');
  if (ende) sngEndeDialog(ende);
  else if (auf) toast(fmt(auf.c) + ' Coins zurück aufs Guthaben');
  ansicht();
  hinweisPruefen(r.ergebnis.ev);
  return r;
}
function zug(zugArt, betrag) { A.entsperren(); $('#raisePanel').hidden = true; return poker({ p: 'zug', zug: zugArt, betrag }); }
function weiter() { A.entsperren(); return poker({ p: 'weiter' }); }

// Raise-Regler
let raiseZiele = [];
function raiseOeffnen() {
  const t = z.poker.t; const m = P.moeglich(t); if (!m || !m.kannRaise) return;
  raiseZiele = [];
  for (let v = m.minZiel; v < m.maxZiel; v += t.bb) raiseZiele.push(v);
  raiseZiele.push(m.maxZiel);
  const r = $('#raiseRegler'); r.min = 0; r.max = raiseZiele.length - 1; r.value = 0;
  raiseAnzeigen();
  $('#zugKnoepfe').hidden = true; $('#raisePanel').hidden = false;
}
function raiseAnzeigen() {
  const v = raiseZiele[Number($('#raiseRegler').value)] || 0; const t = z.poker.t;
  $('#raiseBetrag').textContent = fmt(v);
  $('#bRaiseOk').textContent = v >= t.s[0].c + t.s[0].e ? 'All-in ' + fmt(v) : (t.hoch === 0 ? 'Setzen ' : 'Erhöhen auf ') + fmt(v);
}
function raisePreset(r) {
  const t = z.poker.t; const m = P.moeglich(t);
  let ziel;
  if (r === 'min') ziel = m.minZiel; else if (r === 'allin') ziel = m.maxZiel;
  else ziel = t.hoch + Math.round(Number(r) * (m.pot + m.zuZahlen));
  let best = 0; raiseZiele.forEach((v, i) => { if (Math.abs(v - ziel) < Math.abs(raiseZiele[best] - ziel)) best = i; });
  $('#raiseRegler').value = best; raiseAnzeigen(); A.sfx.klick();
}

// ------------------------------------------------------------------ Lobby / Tisch umschalten
function ansicht() {
  const t = z.poker && z.poker.t;
  if (!t) { zeigeLobby(); return; }
  zeigeTisch();
  if (!beschaeftigt) {
    const alt = vm; vm = vmAus(z);
    // nach der Hand: Gewinnerkarten, Ansage und Blasen stehen lassen, bis die nächste Hand beginnt
    if (t.phase === 'ende' && alt) { vm.top = alt.top; vm.gewinner = alt.gewinner; vm.s.forEach((x, i) => { if (alt.s[i]) x.blase = alt.s[i].blase; }); }
    render();
  }
  steuerung();
}
function zeigeTisch() { $('#lobby').hidden = true; $('#tisch').hidden = false; $('#steuer').hidden = false; $('#iAufstehen').hidden = false; }
function zeigeLobby() {
  vm = null; $('#tisch').hidden = true; $('#steuer').hidden = true; $('#lobby').hidden = false; $('#iAufstehen').hidden = true;
  $('#ansage').textContent = ''; tischInfo();
  const c = z.coins;
  $('#bTages').hidden = z.tagesbonus === S.berlinTag();
  $('#bTanken').hidden = !E.darfNachfuellen(z);
  $('#bTanken').textContent = 'Gratis auffüllen (+' + fmt(Math.max(0, E.NACHFUELLEN - c)) + ')';
  const cl = $('#cashListe'); cl.replaceChildren();
  P.CASH.forEach((t, i) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'tisch-wahl'; b.dataset.cash = i;
    b.innerHTML = '<b>' + t.name + '</b><small>Blinds ' + t.sb + '/' + t.bb + ' · Buy-in ' + fmt(t.min) + '–' + fmt(t.max) + '</small><span>' + (c >= t.min ? 'Hinsetzen' : 'ab ' + fmt(t.min)) + '</span>';
    b.disabled = c < t.min; b.addEventListener('click', () => buyinOeffnen(i)); cl.append(b);
  });
  const sl = $('#sngListe'); sl.replaceChildren();
  P.SNG.forEach((g, i) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'tisch-wahl'; b.dataset.sng = i;
    b.innerHTML = '<b>Buy-in ' + fmt(g.buyin) + '</b><small>1. Platz ' + fmt(g.buyin * P.SNG_PREIS[0]) + ' · 2. Platz ' + fmt(g.buyin * P.SNG_PREIS[1]) + '</small><span>' + (c >= g.buyin ? 'Starten' : 'ab ' + fmt(g.buyin)) + '</span>';
    b.disabled = c < g.buyin;
    b.addEventListener('click', () => { A.entsperren(); poker({ p: 'start', art: 'sng', stufe: i }); });
    sl.append(b);
  });
}

// Buy-in
let buyinStufe = 0, buyinWerte = [];
function buyinOeffnen(i, nachkauf = false) {
  A.entsperren();
  const t = P.CASH[i]; buyinStufe = i;
  const max = nachkauf ? Math.min(t.max - z.poker.t.s[0].c, z.coins) : Math.min(t.max, z.coins);
  const min = nachkauf ? t.bb : t.min;
  buyinWerte = []; for (let v = min; v <= max; v += nachkauf ? t.bb : t.bb * 10) buyinWerte.push(v);
  if (buyinWerte[buyinWerte.length - 1] !== Math.floor(max / t.bb) * t.bb) buyinWerte.push(Math.floor(max / t.bb) * t.bb);
  if (!buyinWerte.length || buyinWerte[0] > max) { toast('Nicht genug Coins.'); return; }
  const r = $('#bRegler'); r.min = 0; r.max = buyinWerte.length - 1; r.value = buyinWerte.length - 1;
  $('#bTitel').textContent = nachkauf ? 'Chips nachkaufen' : t.name;
  $('#bText').textContent = 'Blinds ' + t.sb + '/' + t.bb + '. ' + (nachkauf ? 'Höchstens ' + fmt(t.max) + ' Chips am Tisch.' : 'Deine Chips gehen beim Aufstehen zurück aufs Guthaben.');
  $('#bOk').textContent = nachkauf ? 'Nachkaufen' : 'Hinsetzen';
  $('#bOk').dataset.nachkauf = nachkauf ? '1' : '';
  buyinAnzeigen(); oeffne('#buyin');
}
function buyinAnzeigen() { $('#bBetrag').textContent = fmt(buyinWerte[Number($('#bRegler').value)] || 0); }
$('#bRegler').addEventListener('input', buyinAnzeigen);
$('#bOk').addEventListener('click', async () => {
  const v = buyinWerte[Number($('#bRegler').value)]; $('#buyin').hidden = true;
  if ($('#bOk').dataset.nachkauf) { const r = await poker({ p: 'nachkauf', buyin: v }); if (r && !r.fehler) { $('#meldung').hidden = true; weiter(); } }
  else poker({ p: 'start', art: 'cash', stufe: buyinStufe, buyin: v });
});

// Meldungen
function meldung(titel, text, knoepfe) {
  $('#mTitel').textContent = titel; $('#mText').textContent = text;
  const box = $('#mKnoepfe'); box.replaceChildren();
  knoepfe.forEach(([t, f, haupt]) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'knopf' + (haupt ? ' haupt' : ''); b.textContent = t; b.addEventListener('click', () => { $('#meldung').hidden = true; f && f(); }); box.append(b); });
  oeffne('#meldung');
}
function leerDialog() {
  const t = z.poker.t;
  meldung('Keine Chips mehr', 'Kauf Chips nach oder steh auf.', [
    ...(z.coins >= t.bb ? [['Nachkaufen', () => buyinOeffnen(t.stufe, true), true]] : []),
    ['Aufstehen', () => poker({ p: 'aufstehen' })]]);
}
function sngEndeDialog(e) {
  const titel = e.platz === 1 ? 'Turniersieg!' : 'Platz ' + e.platz;
  const text = e.preis ? 'Du gewinnst ' + fmt(e.preis) + ' Coins.' : 'Diesmal kein Preis – nur Platz 1 und 2 werden bezahlt.';
  if (e.preis) A.sfx.gross();
  meldung(titel, text, [['Zur Lobby', null, true]]);
}
async function aufstehen() {
  const t = z.poker && z.poker.t; if (!t || beschaeftigt) return;
  $('#info').hidden = true;
  const drin = LAEUFT.includes(t.phase) && !t.s[0].f;
  if (t.art === 'sng') {
    meldung('Turnier aufgeben?', 'Du bekommst den Platz, auf dem du gerade stehst (' + t.sng.lebend + '.).' + (t.sng.lebend <= 2 ? ' Das ist noch ein Preisplatz.' : ''), [
      ['Aufgeben', async () => { if (drin) await zug('fold'); poker({ p: 'aufstehen' }); }, true], ['Weiterspielen', null]]);
    return;
  }
  if (drin) { meldung('Noch in der Hand', 'Du passt diese Hand und stehst dann auf.', [['Passen und aufstehen', async () => { await zug('fold'); poker({ p: 'aufstehen' }); }, true], ['Weiterspielen', null]]); return; }
  poker({ p: 'aufstehen' });
}

// ------------------------------------------------------------------ Kopfzeile, Dialoge, Bilanz
let angezeigt = 0;
function zeigeCoins(ziel) {
  const el = $('#hCoins'); if (ziel !== angezeigt && ziel > angezeigt) { $('#bCoins').classList.remove('puls'); void $('#bCoins').offsetWidth; $('#bCoins').classList.add('puls'); }
  angezeigt = ziel; el.textContent = fmt(ziel);
}
let toastT = 0;
function toast(t, ms = 2600) { const el = $('#toast'); el.textContent = t; el.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { el.hidden = true; }, ms); }
const FEHLER = { netz: 'Keine Verbindung zum Server. Dein Stand ist sicher – bitte gleich noch einmal.', konflikt: 'Dein Stand wurde gerade woanders geändert (z. B. in Roulette). Er ist jetzt aktualisiert.',
  zu_oft: 'Etwas langsamer – zu viele Anfragen.', nicht_angemeldet: 'Deine Anmeldung ist abgelaufen. Bitte neu anmelden.', zu_wenig: 'Nicht genug Coins.', schon_abgeholt: 'Heute schon abgeholt.',
  schon_am_tisch: 'Du sitzt schon an einem Tisch.', ungueltig: 'Poker wird für Konten gerade eingerichtet. Bitte später noch einmal.', nicht_dran: 'Du bist gerade nicht dran.' };
const fehlerText = (f) => FEHLER[f] || 'Das hat nicht geklappt (' + f + ').';
function oeffne(sel) { $(sel).hidden = false; const k = $(sel + ' [data-zu]') || $(sel + ' button'); k && k.focus(); clearTimeout(autoT); }
document.querySelectorAll('[data-zu]').forEach((b) => b.addEventListener('click', () => { b.closest('.schicht').hidden = true; }));
document.querySelectorAll('.dialog').forEach((d) => d.addEventListener('pointerdown', (e) => { if (e.target === d && d.querySelector('[data-zu]')) d.hidden = true; }));
addEventListener('keydown', (e) => { if (e.key === 'Escape') document.querySelectorAll('.dialog:not([hidden])').forEach((d) => { if (d.querySelector('[data-zu]')) d.hidden = true; }); });

function infoBauen() {
  const li = (arr) => arr.map((t) => '<li>' + t + '</li>').join('');
  $('#iAblauf').innerHTML = li([
    'Der Dealer-Knopf wandert jede Hand einen Platz weiter. Die zwei Spieler links davon setzen Small und Big Blind.',
    'Vier Setzrunden: vor dem Flop, nach dem Flop (3 Karten), nach dem Turn (4.) und dem River (5.).',
    '<b>Passen</b> gibt die Hand auf, <b>Check</b> schiebt weiter, <b>Mitgehen</b> zahlt den höchsten Einsatz, <b>Erhöhen</b> legt nach (mindestens um die letzte Erhöhung). No Limit: All-in geht immer.',
    'Am Ende zeigen alle übrigen Spieler ihre Karten. Wer weniger Chips hat, kann nur so viel gewinnen, wie er selbst gesetzt hat (Side-Pot).']);
  const bsp = [['Royal Flush', 'A♠ K♠ Q♠ J♠ T♠'], ['Straight Flush', '9♥ 8♥ 7♥ 6♥ 5♥'], ['Vierling', 'Q♠ Q♥ Q♦ Q♣ 7♠'], ['Full House', 'K♠ K♥ K♦ 4♣ 4♠'], ['Flush', 'A♦ J♦ 8♦ 6♦ 2♦'],
    ['Straße', 'T♣ 9♦ 8♠ 7♥ 6♣'], ['Drilling', '7♠ 7♥ 7♦ K♣ 2♠'], ['Zwei Paare', 'J♠ J♥ 5♦ 5♣ A♠'], ['Ein Paar', 'T♠ T♥ A♦ 8♣ 4♠'], ['Höchste Karte', 'A♠ Q♥ 9♦ 6♣ 3♠']];
  const box = $('#iHaende'); box.replaceChildren();
  bsp.forEach(([n, s]) => { const d = document.createElement('div'); const b = document.createElement('b'); b.textContent = n; const sp = document.createElement('span');
    s.split(' ').forEach((c) => sp.append(karteEl(P.RANG.indexOf(c[0]) * 4 + '♠♥♦♣'.indexOf(c[1])))); d.append(b, sp); box.append(d); });
  const g = $('#iGegner'); g.replaceChildren();
  P.BOT_IDS.forEach((id) => { const d = document.createElement('div'); const t = document.createElement('p'); t.innerHTML = '<b>' + P.BOTS[id].name + '</b>' + P.BOTS[id].stil; d.append(avatarEl(id, true), t); g.append(d); });
  $('#iCoins').innerHTML = li([
    '<b>Dieselben Coins wie Roulette und Rocket Reels.</b> Beim Hinsetzen wird das Buy-in abgebucht, beim Aufstehen gehen deine Chips zurück.',
    'Solange du an einem Tisch sitzt, gibt es kein Gratis-Auffüllen.',
    'Cash-Game: Blinds 5/10, 25/50 oder 100/200. Sit & Go: Buy-in 100, 500 oder 2.000; Platz 1 bekommt 4×, Platz 2 bekommt 2× das Buy-in.',
    'Mit PlaySaal-Konto mischt und spielt der Server – auch die Computergegner. Sie sehen deine Karten nie und schummeln nicht.']);
  $('#iFair').innerHTML = '<b>Nur Spielgeld.</b> Coins haben keinen Geldwert. Sie können nicht gekauft, ausgezahlt, getauscht oder gegen Preise eingelöst werden. Texas Hold\'em ist hier eine reine Unterhaltungssimulation gegen Computergegner und kein Glücksspiel um Geld. Nicht für Kinder gedacht: PlaySaal empfiehlt das Spiel ab 18 Jahren (keine offizielle Altersfreigabe).';
}
function profilZeigen() {
  const p = P.teil(z) || P.neuerTeil(); const s = p.stats;
  const zeilen = [['Coins (Guthaben)', fmt(z.coins)], ...(z.poker && z.poker.t && z.poker.t.art === 'cash' ? [['Chips am Tisch', fmt(z.poker.t.s[0].c)]] : []),
    ['Gespielte Hände', fmt(s.haende)], ['Gewonnene Hände', fmt(s.gewonnen)], ['Größter gewonnener Pot', fmt(s.groessterPot)],
    ['Cash-Game: Buy-ins', fmt(s.cashEin)], ['Cash-Game: mitgenommen', fmt(s.cashAus)], ['Sit & Go gespielt', fmt(s.sng)], ['Sit & Go gewonnen', fmt(s.sngSieg)], ['Sit & Go Platz 2', fmt(s.sngZweiter)]];
  const dl = $('#pStats'); dl.replaceChildren();
  zeilen.forEach(([a, b]) => { const dt = document.createElement('dt'); dt.textContent = a; const dd = document.createElement('dd'); dd.textContent = b; dl.append(dt, dd); });
  const PS = window.PlaySaal;
  if (backend.art === 'konto') { $('#pModus').textContent = 'Gespeichert in deinem PlaySaal-Konto – Coins gemeinsam mit Roulette und Rocket Reels.'; $('#pKonto').hidden = true; $('#pHinweis').textContent = ''; }
  else {
    $('#pModus').textContent = 'Gast · Stand nur auf diesem Gerät · Coins gemeinsam mit Roulette und Rocket Reels.';
    $('#pKonto').hidden = !(PS && PS.hostOk && !PS.user());
    $('#pHinweis').textContent = PS && PS.user() ? 'Konto-Speicherung für die Coins wird gerade eingerichtet.' : 'Mit einem kostenlosen PlaySaal-Konto (ab 16) sicherst du Coins und Bilanz.';
  }
  oeffne('#profil');
}

// ------------------------------------------------------------------ Konto (gleicher Schalter wie Rocket Reels: gemeinsame Coins)
const HKEY = 'holdem-hinweis';
let hinweiseSitzung = 0;
async function hinweisPruefen(ev) {
  const PS = window.PlaySaal;
  if (!PS || !PS.hostOk || PS.user() || backend.art !== 'gast' || hinweiseSitzung >= 1) return;
  let d = null; try { d = JSON.parse(ls.get(HKEY)); } catch (e) {} d = d && typeof d === 'object' ? d : { nein: 0, zehn: false };
  if (Date.now() - (d.nein || 0) < 24 * 3600 * 1000 || d.zehn) return;
  const p = P.teil(z); if (!p || p.stats.haende < 10 || !ev.some((e) => e.t === 'pot' && e.s.includes(0))) return;
  d.zehn = true; ls.set(HKEY, JSON.stringify(d));
  let a = null; try { a = await PS.anbieter(); } catch (x) {}
  if (!a || !(a.email || a.google || a.apple)) return;
  hinweiseSitzung++; $('#werbung').hidden = false;
}
$('#wJa').addEventListener('click', () => { $('#werbung').hidden = true; const PS = window.PlaySaal; if (PS) PS.anmelden({}); });
$('#wNein').addEventListener('click', () => { $('#werbung').hidden = true; ls.set(HKEY, JSON.stringify({ nein: Date.now(), zehn: true })); });
$('#pKonto').addEventListener('click', () => { $('#profil').hidden = true; const PS = window.PlaySaal; if (PS) PS.anmelden({}); });

async function backendWaehlen() {
  const PS = window.PlaySaal;
  const konto = !!(PS && PS.user && PS.user() && PS.cfg && PS.cfg.rocketReels === true);
  if (konto) {
    const k = S.konto(PS); const geladen = await k.laden();
    if (geladen) { backend = k; z = geladen; return; }
    toast('Konto-Stand gerade nicht erreichbar – du spielst vorerst als Gast.', 4000);
  }
  backend = S.lokal(TEST ? P.seedZufall(Number((Q.match(/[?&]seed=(\d+)/) || [])[1] || 1)) : null); z = backend.zustand();
}
async function gastAngebot(PS) {
  if (z.gastUebernommen) return;
  const gast = S.gastLaden();
  if (!gast || (gast.stats.runden === 0 && gast.coins === E.START_COINS && !gast.roulette && !gast.poker)) return;
  const uid = (PS.user() || {}).id || '';
  const nein = (ls.get('rocketreels-gast-nein') || '').split(',');
  if (nein.includes(uid)) return;
  const neu = Math.max(z.coins, Math.min(gast.coins, E.GAST_IMPORT_MAX));
  $('#gText').textContent = 'Auf diesem Gerät hast du als Gast ' + fmt(gast.coins) + ' Coins. In deinem Konto sind es ' + fmt(z.coins) + '. Übernommen wird der höhere Stand (höchstens ' + fmt(E.GAST_IMPORT_MAX) + ', also ' + fmt(neu) + ') – einmalig je Konto. Chips an einem offenen Gast-Tisch zählen nicht mit.';
  oeffne('#gast');
  await new Promise((ok) => {
    const ja = async () => { aus(); const r = await backend.gastUebernehmen(gast); if (r.fehler) toast(r.fehler === 'schon_uebernommen' ? 'Für dieses Konto wurde schon ein Gast-Stand übernommen.' : fehlerText(r.fehler)); else { z = r.zustand; toast('Gast-Stand übernommen: ' + fmt(z.coins) + ' Coins'); } ok(); };
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
  await backendWaehlen(); zeigeCoins(z.coins); ansicht();
  if (backend.art === 'konto') { await gastAngebot(window.PlaySaal); zeigeCoins(z.coins); ansicht(); }
  if (backend.art !== vorher) toast(backend.art === 'konto' ? 'Coins aus deinem PlaySaal-Konto geladen.' : 'Abgemeldet – du spielst als Gast auf diesem Gerät.');
}
setInterval(() => { if (wechselAusstehend && !beschaeftigt) kontoWechsel(); }, 1500);
document.addEventListener('visibilitychange', async () => {
  if (document.hidden || !backend || beschaeftigt) return;
  const neu = await backend.laden();
  if (neu && !beschaeftigt) { z = neu; zeigeCoins(z.coins); ansicht(); }
});

// ------------------------------------------------------------------ Bedienung
$('#bFold').addEventListener('click', () => zug('fold'));
$('#bCall').addEventListener('click', () => { const m = P.moeglich(z.poker.t); zug(m && m.kannCheck ? 'check' : 'call'); });
$('#bRaise').addEventListener('click', () => { A.entsperren(); raiseOeffnen(); });
$('#raiseRegler').addEventListener('input', raiseAnzeigen);
$('#raisePreset').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) raisePreset(b.dataset.r); });
$('#bRaiseAb').addEventListener('click', () => { $('#raisePanel').hidden = true; $('#zugKnoepfe').hidden = false; });
$('#bRaiseOk').addEventListener('click', () => { const v = raiseZiele[Number($('#raiseRegler').value)]; const t = z.poker.t; zug(v >= t.s[0].c + t.s[0].e ? 'allin' : 'raise', v); });
$('#bWeiter').addEventListener('click', weiter);
$('#bAufstehen').addEventListener('click', aufstehen);
$('#iAufstehen').addEventListener('click', aufstehen);
$('#tisch').addEventListener('pointerdown', () => { if (beschaeftigt) schnell = true; });
$('#bInfo').addEventListener('click', () => { A.entsperren(); infoBauen(); oeffne('#info'); });
$('#bCoins').addEventListener('click', () => { A.entsperren(); profilZeigen(); });
$('#bTon').addEventListener('click', () => { A.entsperren(); A.einst.an = !A.einst.an; A.speichern(); document.body.classList.toggle('stumm', !A.einst.an); toast(A.einst.an ? 'Ton an' : 'Ton aus', 1200); });
$('#bTages').addEventListener('click', async () => { const r = await ausfuehren({ typ: 'tagesbonus' }); if (r.fehler) toast(fehlerText(r.fehler)); else { z = r.zustand; toast('Tagesbonus: +' + E.TAGESBONUS + ' Coins'); zeigeCoins(z.coins); } zeigeLobby(); });
$('#bTanken').addEventListener('click', async () => { const r = await ausfuehren({ typ: 'nachfuellen' }); if (r.fehler) toast(fehlerText(r.fehler)); else { z = r.zustand; toast('+' + fmt(r.ergebnis.plus) + ' Coins gratis aufgefüllt'); zeigeCoins(z.coins); } zeigeLobby(); });
addEventListener('pointerdown', () => A.entsperren(), { capture: true, passive: true });

// ------------------------------------------------------------------ Start
async function start() {
  document.body.classList.toggle('stumm', !A.einst.an);
  try { const r = await fetch('/spiele/texas-holdem/img/manifest.json'); if (r.ok) bilder = new Set(await r.json()); } catch (e) {}
  sitzeBauen();
  const reihe = $('#gegnerReihe');
  P.BOT_IDS.forEach((id) => { const f = document.createElement('figure'); const c = document.createElement('figcaption'); c.textContent = P.BOTS[id].name.replace('Prof. ', 'Prof. '); f.append(avatarEl(id, true), c); reihe.append(f); });
  for (let i = 0; i < 40 && !(window.PlaySaal && window.PlaySaal.bereit && window.PlaySaal.bereit()); i++) {
    if (i > 4 && !window.PLAYSAAL_CFG) break;
    await new Promise((r) => setTimeout(r, 50));
  }
  await backendWaehlen();
  if (!P.teil(z)) toast('Die Poker-Daten in deinem Stand sind beschädigt – bitte melde das über „Fehler melden“.', 6000);
  zeigeCoins(z.coins); ansicht();
  $('#laden').hidden = true;
  if (backend.art === 'konto') { await gastAngebot(window.PlaySaal); zeigeCoins(z.coins); ansicht(); }
  const PS = window.PlaySaal;
  if (PS && PS.on) PS.on('auth', () => kontoWechsel());
}

// Für automatische Tests (Playwright): Zustand (Ansicht) lesbar, nichts veränderbar
Object.defineProperty(window, '__holdem', { value: Object.freeze({
  get zustand() { return JSON.parse(JSON.stringify(z)); }, get beschaeftigt() { return beschaeftigt; }, get art() { return backend && backend.art; }
}) });
start();
