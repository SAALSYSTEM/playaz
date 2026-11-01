// ROCKET REELS – Regeln, Gewinnlinien, Wild/Scatter, Freispiele mit Spezial-Symbol, Hyperjump, Coin-Buchhaltung,
// Zustandsprüfung, Gast-Übernahme und Auszahlungsquote (exakte Rechnung gegen große Simulation). Ohne Browser.
// node --test tests/rocket-reels-sim.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../public/spiele/rocket-reels/engine.js';
import { rechne } from '../tools/rocket-reels-mathe.mjs';

const W = E.WILD;
const sym = (id) => E.SYMBOLE.findIndex((s) => s.id === id);
// Zufall aus einer festen Folge (für gezielte Situationen)
function folge(werte) {
  const q = werte.slice();
  const f = (n) => { assert.ok(q.length, 'Zufallsfolge leer'); const v = q.shift(); assert.ok(v >= 0 && v < n, `Wert ${v} passt nicht zu n=${n}`); return v; };
  f.rest = () => q.length;
  return f;
}
// Stopp-Position, bei der Symbol s in Zeile r von Walze w liegt
function stoppFuer(w, s, r = 0) {
  const b = E.BAENDER[w];
  const i = b.findIndex((x) => x === s);
  assert.ok(i >= 0, 'Symbol nicht auf Walze');
  return (i - r + b.length) % b.length;
}
// Raster aus 5 Spalten bauen, Füllsymbole so wählen, dass keine zufälligen Linien entstehen
function rasterAus(spalten) { return spalten.map((s) => s.slice()); }
const leer = () => [[sym('a'), sym('k'), sym('q')], [sym('j'), sym('zehn'), sym('a')], [sym('k'), sym('q'), sym('j')], [sym('zehn'), sym('a'), sym('k')], [sym('q'), sym('j'), sym('zehn')]];

test('Walzenbänder: gültig, höchstens ein Stargate je sichtbarem Fenster, keine gleichen Nachbarn', () => {
  assert.equal(E.BAENDER.length, 5);
  for (const b of E.BAENDER) {
    assert.ok(b.length >= 20);
    for (let s = 0; s < b.length; s++) {
      assert.notEqual(b[s], b[(s + 1) % b.length], 'gleiche Symbole direkt untereinander');
      const n = [0, 1, 2].filter((r) => b[(s + r) % b.length] === W).length;
      assert.ok(n <= 1);
    }
    for (let x = 0; x < 13; x++) assert.ok(b.includes(x), 'jedes Symbol kommt auf jeder Walze vor: ' + E.SYMBOLE[x].id);
  }
  assert.equal(E.AUSZAHLUNG.length, 12);
  E.AUSZAHLUNG.forEach((p) => { assert.equal(p.length, 3); assert.ok(p[0] < p[1] && p[1] < p[2]); });
  assert.equal(E.LINIEN.length, 10);
  assert.equal(new Set(E.LINIEN.map((l) => l.join())).size, 10);
});

test('alle 10 Gewinnlinien werden einzeln richtig erkannt (3, 4 und 5 Treffer)', () => {
  const ziel = sym('kristall');
  E.LINIEN.forEach((l, i) => {
    for (const n of [3, 4, 5]) {
      const r = leer();
      // Leer-Raster verändern, damit keine andere Linie zufällig trifft: jede Zelle anders als ziel
      for (let w = 0; w < n; w++) r[w][l[w]] = ziel;
      const wert = E.auswerten(rasterAus(r), 100);
      const treffer = wert.linien.filter((t) => t.sym === ziel);
      const auf = treffer.find((t) => t.nr === i + 1);
      assert.ok(auf, `Linie ${i + 1} mit ${n} Treffern nicht erkannt`);
      assert.equal(auf.anzahl, n);
      assert.equal(auf.gewinn, E.AUSZAHLUNG[ziel][n - 3] * 10);
      assert.deepEqual(auf.felder, l.slice(0, n).map((z, w) => [w, z]));
      // Summe = alle Linien + Scatter
      assert.equal(wert.gesamt, wert.linien.reduce((a, t) => a + t.gewinn, 0) + wert.scatter.gewinn);
    }
  });
});

test('Linien zählen nur von links und nur zusammenhängend', () => {
  const r = leer(); const c = sym('meteor');
  r[1][1] = c; r[2][1] = c; r[3][1] = c; r[4][1] = c; // Walze 1 fehlt
  assert.equal(E.auswerten(r, 10).linien.filter((t) => t.sym === c).length, 0);
  const r2 = leer(); r2[0][1] = c; r2[1][1] = c; r2[3][1] = c; r2[4][1] = c; // Lücke auf Walze 3
  assert.equal(E.auswerten(r2, 10).linien.filter((t) => t.sym === c).length, 0);
});

test('Stargate ersetzt reguläre Symbole, auch am Anfang; fünf Stargates zahlen keine Linie', () => {
  const r = leer(); const c = sym('planet');
  r[0][1] = W; r[1][1] = c; r[2][1] = W; r[3][1] = c; // W c W c x -> 4 Planeten
  const t = E.auswerten(r, 10).linien.find((x) => x.nr === 1);
  assert.equal(t.sym, c); assert.equal(t.anzahl, 4);
  const r2 = leer(); r2[0][1] = W; r2[1][1] = W; r2[2][1] = c;
  const t2 = E.auswerten(r2, 10).linien.find((x) => x.nr === 1);
  assert.equal(t2.sym, c); assert.equal(t2.anzahl, 3);
  const r3 = leer(); for (let w = 0; w < 5; w++) r3[w][1] = W;
  const w3 = E.auswerten(r3, 10);
  assert.equal(w3.linien.filter((x) => x.nr === 1).length, 0);
  assert.equal(w3.scatter.anzahl, 5); assert.equal(w3.scatter.gewinn, E.SCATTER[2] * 10);
});

test('Scatter zahlt unabhängig von Linien auf den Gesamteinsatz und löst ab 3 Freispiele aus', () => {
  for (const n of [2, 3, 4, 5]) {
    const r = leer(); const zeilen = [0, 2, 1, 0, 2];
    for (let w = 0; w < n; w++) r[w][zeilen[w]] = W;
    const wert = E.auswerten(r, 50);
    assert.equal(wert.scatter.anzahl, n);
    assert.equal(wert.scatter.gewinn, n >= 3 ? E.SCATTER[n - 3] * 50 : 0);
    assert.equal(wert.ausloesung, n >= 3);
  }
  // nicht nebeneinander zählt auch
  const r = leer(); r[0][0] = W; r[2][2] = W; r[4][1] = W;
  assert.equal(E.auswerten(r, 10).ausloesung, true);
});

test('Gewinne mehrerer Linien werden addiert', () => {
  const r = leer(); const c = sym('satellit');
  for (let w = 0; w < 5; w++) { r[w][0] = c; r[w][1] = c; } // Zeilen 1 und 2 voll -> mehrere Linien
  const wert = E.auswerten(r, 20);
  assert.ok(wert.linien.length >= 3);
  assert.equal(wert.gesamt, wert.linien.reduce((a, t) => a + t.gewinn, 0));
});

test('Spezial-Symbol dehnt sich ab 3 Walzen aus (auch nicht nebeneinander) und zahlt zusätzlich auf allen 10 Linien', () => {
  const s = sym('k');
  const r = leer();
  // leer() enthält K auf Walze 0, 2 und 3 -> eigene Raster ohne K bauen
  const ohne = [[sym('a'), sym('q'), sym('j')], [sym('zehn'), sym('a'), sym('q')], [sym('j'), sym('zehn'), sym('a')], [sym('q'), sym('j'), sym('zehn')], [sym('a'), sym('q'), sym('j')]];
  const r1 = ohne.map((x) => x.slice()); r1[0][2] = s; r1[2][0] = s; r1[4][1] = s;
  const w1 = E.auswerten(r1, 100, s);
  assert.deepEqual(w1.spezial.walzen, [0, 2, 4]);
  assert.equal(w1.spezial.gewinn, E.AUSZAHLUNG[s][0] * 10 * 10);
  const normal = E.auswerten(r1, 100);
  assert.equal(w1.gesamt, normal.gesamt + w1.spezial.gewinn, 'Zusatzgewinn kommt zur normalen Wertung hinzu');
  const r2 = ohne.map((x) => x.slice()); r2[0][0] = s; r2[3][2] = s;
  assert.equal(E.auswerten(r2, 100, s).spezial, null, '2 Walzen reichen nicht');
  const r3 = ohne.map((x) => x.slice()); for (let w = 0; w < 5; w++) r3[w][w % 3] = s;
  assert.equal(E.auswerten(r3, 10, s).spezial.gewinn, E.AUSZAHLUNG[s][2] * 10);
  assert.equal(E.auswerten(r3, 10, W).spezial, null, 'Stargate ist nie Spezial-Symbol');
  void r;
});

test('Dreh: Einsatz wird abgezogen, Ergebnis steht fest, Gewinn wartet auf Sichern', () => {
  let z = E.neuerZustand();
  const zuf = E.seedZufall(5);
  let gefunden = false;
  for (let i = 0; i < 300 && !gefunden; i++) {
    const vor = z.coins;
    const r = E.aktion(z, { typ: 'dreh', einsatz: 10 }, zuf);
    if (r.fehler) { z = E.aktion(z, { typ: 'nachfuellen' }, zuf).zustand; continue; }
    assert.equal(r.zustand.coins, vor - 10 + (r.ergebnis.freispielStart ? r.ergebnis.gewinn : 0));
    assert.deepEqual(r.ergebnis.wertung, E.auswerten(E.raster(r.ergebnis.stopps), 10, null), 'Anzeige-Ergebnis = Regel-Ergebnis');
    z = r.zustand;
    if (z.phase === 'gewinn') {
      gefunden = true;
      assert.equal(z.offen, r.ergebnis.gewinn);
      const s = E.aktion(z, { typ: 'sichern' }, zuf);
      assert.equal(s.zustand.coins, z.coins + z.offen);
      assert.equal(s.zustand.phase, 'bereit');
      assert.equal(E.aktion(s.zustand, { typ: 'sichern' }, zuf).fehler, 'nichts_offen', 'kein zweites Sichern');
      assert.ok(E.aktion(s.zustand, { typ: 'risiko' }, zuf).fehler, 'nach dem Sichern kein Risiko mehr');
    } else if (z.phase === 'bonus') {
      z = E.neuerZustand();
    }
  }
  assert.ok(gefunden);
});

test('START nach Gewinn sichert zuerst genau einmal', () => {
  let z = E.neuerZustand();
  z = { ...z, phase: 'gewinn', offen: 70, coins: 500 };
  const zuf = folge([0, 0, 0, 0, 0, ...new Array(10).fill(0)]);
  const r = E.aktion(z, { typ: 'dreh', einsatz: 10 }, zuf);
  assert.equal(r.ergebnis.gesichert, 70);
  assert.equal(r.zustand.stats.gewinn >= 70, true);
  const erwartet = 500 + 70 - 10 + (r.ergebnis.freispielStart ? r.ergebnis.gewinn : 0);
  assert.equal(r.zustand.coins, erwartet);
});

test('Einsatz muss zur Coin-Menge passen; leer -> kostenlos nachfüllen', () => {
  let z = { ...E.neuerZustand(), coins: 40 };
  assert.equal(E.aktion(z, { typ: 'dreh', einsatz: 50 }, E.seedZufall(1)).fehler, 'zu_wenig');
  assert.equal(E.aktion(z, { typ: 'dreh', einsatz: 33 }, E.seedZufall(1)).fehler, 'einsatz');
  assert.equal(E.aktion(z, { typ: 'nachfuellen' }, E.seedZufall(1)).fehler, 'nicht_noetig');
  z = { ...z, coins: 5, einsatz: 100 };
  assert.equal(E.aktion(z, { typ: 'dreh' }, E.seedZufall(1)).fehler, 'leer');
  const n = E.aktion(z, { typ: 'nachfuellen' }, E.seedZufall(1));
  assert.equal(n.zustand.coins, E.NACHFUELLEN); assert.equal(n.zustand.stats.nachgefuellt, 1);
  assert.equal(n.zustand.einsatz, 100);
});

test('Tagesbonus genau einmal je Tag', () => {
  const z = E.neuerZustand();
  const a = E.aktion(z, { typ: 'tagesbonus' }, null, { tag: '2026-11-01' });
  assert.equal(a.zustand.coins, E.START_COINS + E.TAGESBONUS);
  assert.equal(E.aktion(a.zustand, { typ: 'tagesbonus' }, null, { tag: '2026-11-01' }).fehler, 'schon_abgeholt');
  assert.equal(E.aktion(a.zustand, { typ: 'tagesbonus' }, null, { tag: '2026-11-02' }).zustand.coins, E.START_COINS + 2 * E.TAGESBONUS);
  assert.equal(E.aktion(z, { typ: 'tagesbonus' }, null, { tag: 'morgen' }).fehler, 'tag');
});

test('Freispiele: Auslösung, Spezial-Symbol, 10 Runden, einmalige Gutschrift am Ende', () => {
  // drei Stargates oben auf Walze 1-3, Walze 4/5 beliebig ohne Stargate oben
  const s = [stoppFuer(0, W), stoppFuer(1, W), stoppFuer(2, W), stoppFuer(3, sym('a')), stoppFuer(4, sym('a'))];
  let z = { ...E.neuerZustand(), coins: 1000 };
  const spezialIndex = 9; // REGULAER[9] = Q
  const r = E.aktion(z, { typ: 'dreh', einsatz: 20 }, folge([...s, spezialIndex]));
  assert.ok(r.ergebnis.wertung.ausloesung);
  assert.equal(r.zustand.phase, 'bonus');
  assert.equal(r.zustand.bonus.sym, E.REGULAER[spezialIndex]);
  assert.equal(r.zustand.bonus.rest, 10);
  assert.equal(r.ergebnis.freispielStart.anzahl, 10);
  assert.equal(r.zustand.coins, 1000 - 20 + r.ergebnis.gewinn, 'Gewinn der auslösenden Runde sofort gutgeschrieben');
  assert.equal(r.zustand.stats.freispiele, 1);
  z = r.zustand;
  const coinsVorher = z.coins;
  const zuf = E.seedZufall(77);
  let summe = 0, runden = 0, ende = null;
  while (z.phase === 'bonus') {
    const f = E.aktion(z, { typ: 'dreh', einsatz: 100 }, zuf); // Einsatz-Angabe wird im Bonus ignoriert
    assert.ok(!f.fehler);
    assert.equal(f.ergebnis.frei, true);
    assert.deepEqual(f.ergebnis.wertung, E.auswerten(E.raster(f.ergebnis.stopps), 20, z.bonus.sym));
    summe += f.ergebnis.gewinn; runden++;
    if (f.zustand.phase === 'bonus') assert.equal(f.zustand.coins, coinsVorher, 'während der Freispiele keine Gutschrift');
    if (f.ergebnis.bonusEnde) ende = f.ergebnis.bonusEnde;
    z = f.zustand;
    assert.ok(runden <= E.FREISPIELE_MAX);
  }
  assert.ok(runden >= 10);
  assert.equal(ende.summe, summe);
  assert.equal(z.coins, coinsVorher + summe, 'Bonusgewinn genau einmal');
  assert.equal(z.stats.runden, 1, 'Freispiele zählen nicht als bezahlte Runden');
  assert.equal(z.stats.einsatz, 20);
});

test('Freispiele können erneut ausgelöst werden, höchstens FREISPIELE_MAX', () => {
  const s3 = [stoppFuer(0, W), stoppFuer(1, W), stoppFuer(2, W), stoppFuer(3, sym('a')), stoppFuer(4, sym('a'))];
  let z = E.aktion(E.neuerZustand(), { typ: 'dreh', einsatz: 10 }, folge([...s3, 0])).zustand;
  let gesamt = 0;
  for (let i = 0; i < 60 && z.phase === 'bonus'; i++) {
    const r = E.aktion(z, { typ: 'dreh' }, folge(s3));
    gesamt++;
    z = r.zustand;
  }
  assert.equal(gesamt, E.FREISPIELE_MAX);
  assert.equal(z.phase, 'bereit');
});

test('Hyperjump: exakt 50 % je Sprung, verdoppeln, verlieren, höchstens 4 Sprünge, Grenze', () => {
  const basis = { ...E.neuerZustand(), coins: 1000, phase: 'gewinn', offen: 100 };
  const r0 = E.aktion(basis, { typ: 'risiko' }, null);
  assert.deepEqual(r0.ergebnis.leiter, [100, 200, 400, 800, 1600]);
  let z = r0.zustand;
  // Erfolg
  let r = E.aktion(z, { typ: 'sprung', route: 0 }, folge([1]));
  assert.equal(r.ergebnis.erfolg, true); assert.equal(r.zustand.offen, 200); assert.equal(r.zustand.coins, 1000);
  // Verlust: offener Gewinn weg, Kontostand unberührt
  const v = E.aktion(r.zustand, { typ: 'sprung', route: 1 }, folge([0]));
  assert.equal(v.ergebnis.erfolg, false); assert.equal(v.ergebnis.verloren, 200);
  assert.equal(v.zustand.coins, 1000); assert.equal(v.zustand.phase, 'bereit'); assert.equal(v.zustand.offen, 0);
  assert.ok(E.aktion(v.zustand, { typ: 'sprung', route: 0 }, folge([1])).fehler, 'nach Verlust kein weiterer Sprung');
  assert.ok(E.aktion(v.zustand, { typ: 'sichern' }, null).fehler, 'nach Verlust nichts zu sichern');
  // 4 Erfolge -> automatisch gesichert
  z = r0.zustand;
  for (let i = 1; i <= 4; i++) {
    r = E.aktion(z, { typ: 'sprung', route: i % 2 }, folge([1]));
    z = r.zustand;
  }
  assert.equal(r.ergebnis.gesichert, 1600); assert.equal(z.coins, 2600); assert.equal(z.phase, 'bereit');
  assert.equal(z.stats.spruenge, 4); assert.equal(z.stats.hoechster, 1600);
  // Grenze: 15000 offen -> kein Risiko (30000 > Grenze)
  assert.ok(E.aktion({ ...basis, offen: 15000 }, { typ: 'risiko' }, null).fehler);
  assert.deepEqual(E.leiter(5000), [5000, 10000, 20000]);
  // Sichern nach einer Stufe
  const s1 = E.aktion(E.aktion(basis, { typ: 'risiko' }, null).zustand, { typ: 'sprung', route: 0 }, folge([1])).zustand;
  const g = E.aktion(s1, { typ: 'sichern' }, null);
  assert.equal(g.zustand.coins, 1200); assert.equal(g.ergebnis.betrag, 200);
  assert.ok(E.aktion(g.zustand, { typ: 'risiko' }, null).fehler, 'derselbe Gewinn kann nicht erneut riskiert werden');
  // Während des Risikos kein Dreh
  assert.equal(E.aktion(r0.zustand, { typ: 'dreh' }, E.seedZufall(1)).fehler, 'risiko_laeuft');
  // Wahrscheinlichkeit
  const zuf = E.kryptoZufall(globalThis.crypto); let ok = 0; const N = 200000;
  for (let i = 0; i < N; i++) ok += E.aktion(r0.zustand, { typ: 'sprung', route: 0 }, zuf).ergebnis.erfolg ? 1 : 0;
  assert.ok(Math.abs(ok / N - 0.5) < 0.006, 'Trefferquote ' + ok / N);
});

test('Jede Aktion verändert den übergebenen Zustand nicht (kein doppeltes Buchen bei Wiederholung)', () => {
  const z = { ...E.neuerZustand(), phase: 'gewinn', offen: 50 };
  const kopie = JSON.stringify(z);
  E.aktion(z, { typ: 'sichern' }, null); E.aktion(z, { typ: 'dreh' }, E.seedZufall(3)); E.aktion(z, { typ: 'risiko' }, null);
  assert.equal(JSON.stringify(z), kopie);
});

test('Zustandsprüfung lehnt kaputte oder manipulierte Stände ab', () => {
  const ok = E.neuerZustand();
  assert.ok(E.pruefeZustand(ok));
  const kaputt = [null, {}, { ...ok, v: 99 }, { ...ok, coins: -5 }, { ...ok, coins: 1.5 }, { ...ok, einsatz: 30 }, { ...ok, phase: 'gewinn', offen: 0 },
    { ...ok, phase: 'bereit', offen: 10 }, { ...ok, phase: 'bonus', bonus: null }, { ...ok, phase: 'risiko', offen: 10, risiko: { start: 10, stufe: 4 } },
    { ...ok, letzte: [0, 0, 0, 0, 999] }, { ...ok, stats: { ...ok.stats, runden: -1 } }, { ...ok, tagesbonus: 5 }];
  for (const k of kaputt) assert.equal(E.pruefeZustand(k), null, JSON.stringify(k));
  assert.equal(E.aktion({ ...ok, coins: -1 }, { typ: 'dreh' }, E.seedZufall(1)).fehler, 'zustand');
});

test('Gast-Übernahme: genau einmal, höherer Stand, gedeckelt, keine doppelte Gutschrift', () => {
  const konto = E.neuerZustand();
  const gast = { ...E.neuerZustand(), coins: 4321, stats: { ...E.neueStatistik(), runden: 12, einsatz: 300, gewinn: 280, hoechster: 90 } };
  const r = E.gastUebernehmen(konto, gast);
  assert.equal(r.zustand.coins, 4321); assert.equal(r.zustand.stats.runden, 12); assert.equal(r.zustand.gastUebernommen, true);
  assert.equal(E.gastUebernehmen(r.zustand, gast).fehler, 'schon_uebernommen');
  const reich = { ...E.neuerZustand(), coins: 999999999 };
  assert.equal(E.gastUebernehmen(konto, reich).zustand.coins, E.GAST_IMPORT_MAX);
  const arm = { ...E.neuerZustand(), coins: 3 };
  assert.equal(E.gastUebernehmen({ ...konto, coins: 7000 }, arm).zustand.coins, 7000, 'höherer Stand bleibt');
  assert.equal(E.gastUebernehmen(konto, { coins: 'viel' }).fehler, 'gast_ungueltig');
});

test('Coin-Buchhaltung über 150.000 zufällige Aktionen: nichts entsteht oder verschwindet', () => {
  const zuf = E.seedZufall(2026);
  let z = E.neuerZustand();
  let einsaetze = 0, gutschriften = 0, nachgefuellt = 0, verloren = 0;
  for (let i = 0; i < 150000; i++) {
    let a;
    if (z.phase === 'risiko') a = zuf(3) === 0 ? { typ: 'sichern' } : { typ: 'sprung', route: zuf(2) };
    else if (z.phase === 'gewinn') { const x = zuf(4); a = x === 0 ? { typ: 'sichern' } : x === 1 && E.risikoMoeglich(z) ? { typ: 'risiko' } : { typ: 'dreh', einsatz: E.EINSAETZE[zuf(4)] }; }
    else if (E.darfNachfuellen(z)) a = { typ: 'nachfuellen' };
    else a = { typ: 'dreh', einsatz: E.EINSAETZE[zuf(4)] };
    const r = E.aktion(z, a, zuf);
    if (r.fehler) { assert.ok(['zu_wenig'].includes(r.fehler), r.fehler); const k = E.aktion(z, { typ: 'dreh', einsatz: 10 }, zuf); if (k.fehler) continue; z = k.zustand; einsaetze += 10; gutschriften += k.ergebnis.gesichert + (k.ergebnis.freispielStart ? k.ergebnis.gewinn : 0) + (k.ergebnis.bonusEnde ? k.ergebnis.bonusEnde.summe : 0); continue; }
    const e = r.ergebnis;
    if (e.typ === 'dreh') {
      if (!e.frei) einsaetze += z.phase === 'bonus' ? 0 : (a.einsatz ?? z.einsatz);
      gutschriften += e.gesichert + (e.freispielStart ? e.gewinn : 0) + (e.bonusEnde ? e.bonusEnde.summe : 0);
    }
    if (e.typ === 'sichern') gutschriften += e.betrag;
    if (e.typ === 'sprung' && e.erfolg) gutschriften += e.gesichert;
    if (e.typ === 'sprung' && !e.erfolg) verloren += e.verloren;
    if (e.typ === 'nachfuellen') nachgefuellt += e.plus;
    z = r.zustand;
    assert.ok(E.pruefeZustand(z));
  }
  assert.equal(z.coins, E.START_COINS - einsaetze + gutschriften + nachgefuellt);
  assert.equal(z.stats.einsatz, einsaetze);
  assert.equal(z.stats.gewinn, gutschriften);
  assert.ok(verloren >= 0);
});

test('Exakte Rechnung = Simulation (2 Mio. Runden Grundspiel, 300.000 Freispiele je Spezial-Mittel)', () => {
  const m = rechne(E.BAENDER);
  assert.ok(m.rtp > 0.93 && m.rtp < 0.97, 'Auszahlungsquote ' + m.rtp);
  const zuf = E.seedZufall(42);
  const N = 2000000;
  let linien = 0, scatter = 0, ausl = 0, treffer = 0;
  for (let i = 0; i < N; i++) {
    const w = E.auswerten(E.raster(E.zufallsStopps(zuf)), 10);
    const l = w.gesamt - w.scatter.gewinn;
    linien += l; scatter += w.scatter.gewinn; if (w.ausloesung) ausl++; if (w.gesamt > 0) treffer++;
  }
  const relL = linien / (N * 10), relS = scatter / (N * 10), pA = ausl / N;
  assert.ok(Math.abs(relL - m.eLinien) < 0.012, `Linien: sim ${relL} / exakt ${m.eLinien}`);
  assert.ok(Math.abs(relS - m.eScatter) < 0.006, `Scatter: sim ${relS} / exakt ${m.eScatter}`);
  assert.ok(Math.abs(pA - m.pAusl) < 0.0006, `Auslösung: sim ${pA} / exakt ${m.pAusl}`);
  // Freispiel-Erwartung je Runde über alle Spezial-Symbole
  const M = 300000; let fs = 0;
  for (let i = 0; i < M; i++) { const s = E.REGULAER[i % 12]; fs += E.auswerten(E.raster(E.zufallsStopps(zuf)), 10, s).gesamt; }
  const relF = fs / (M * 10);
  assert.ok(Math.abs(relF - m.eFreispiel) / m.eFreispiel < 0.05, `Freispiel: sim ${relF} / exakt ${m.eFreispiel}`);
  console.log(`  Trefferquote ${(treffer / N * 100).toFixed(1)} %, Linien ${(relL * 100).toFixed(2)} %, Scatter ${(relS * 100).toFixed(2)} %, Auslösung 1 zu ${(1 / pA).toFixed(0)}, exakte Quote ${(m.rtp * 100).toFixed(2)} %`);
});

test('Gesamtquote mit echtem Spielablauf (aktion, inkl. Freispiele) passt zur Rechnung', () => {
  const m = rechne(E.BAENDER);
  const zuf = E.seedZufall(9);
  let z = { ...E.neuerZustand(), coins: 1e11 };
  const N = 500000; let gesetzt = 0, zurueck = 0;
  for (let i = 0; i < N;) {
    const r = E.aktion(z, { typ: 'dreh', einsatz: 10 }, zuf);
    const e = r.ergebnis;
    if (!e.frei) { gesetzt += 10; i++; }
    zurueck += e.gesichert;
    if (e.freispielStart) zurueck += e.gewinn;
    if (e.bonusEnde) zurueck += e.bonusEnde.summe;
    z = r.zustand;
    if (z.phase === 'gewinn') { zurueck += z.offen; z = { ...z, coins: z.coins + z.offen, offen: 0, phase: 'bereit' }; }
  }
  const q = zurueck / gesetzt;
  console.log(`  Simulierte Gesamtquote ${(q * 100).toFixed(2)} % (exakt ${(m.rtp * 100).toFixed(2)} %)`);
  assert.ok(Math.abs(q - m.rtp) < 0.05, 'Quote ' + q);
});

test('Angezeigte Auszahlungsquote (QUOTE) stimmt mit der exakten Rechnung überein', () => {
  assert.ok(Math.abs(rechne(E.BAENDER).rtp - E.QUOTE) < 0.0005);
});
