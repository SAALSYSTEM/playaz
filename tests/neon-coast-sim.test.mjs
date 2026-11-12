// Neon Coast – Fluchtwagen: Regeln ohne Browser. Stadt erreichbar, Fahrphysik, Koffer und Faktor, Peilsender, Entkommen,
// Versteck/Werkstatt, Festnahme, Wasser, Totalschaden, Prüf-Fahrer über mehrere Nächte, Abrechnung und Spielstand.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { baueWelt, BODEN, bodenBei, NX, Z, viertel } from '../public/spiele/neon-coast/welt.js';
import { GROESSE, UMRISS } from '../public/spiele/neon-coast/bilder.js';
import { FAHRZEUG, AUTOS, AUFTRAEGE, frisch, saeubere, kaufen, abrechnen, aktiveAuftraege, rang, parseEinladung, geld } from '../public/spiele/neon-coast/daten.js';
import { neueFahrt, schritt, DT, neuerBot, botEingabe, probefahrt, neuesFeld, feldRechnen, multi, suchzeit, PEILZEIT, werkstattKosten, feierabend, POLIZEI } from '../public/spiele/neon-coast/engine.js';
import { existsSync } from 'node:fs';

const W = baueWelt();
const alt = () => { const s = frisch(); s.stat.naechte = 3; return s; };   // kein Erst-Nacht-Koffer
function fahrt(seed = 1, o = {}) { return neueFahrt(o.save || alt(), seed, { verkehr: o.verkehr ?? 0 }); }
const laufe = (S, sek, e = { los: true }, jeSchritt) => { for (let n = 0; n < Math.round(sek / DT) && !S.ende; n++) { schritt(S, typeof e === 'function' ? e(S) : e); if (jeSchritt) jeSchritt(S); } };
const steh = (S) => { S.sp.vmax = 0.0001; S.sp.vx = S.sp.vy = 0; };
const hat = (S, t) => S.ev.some((e) => e.t === t);
const aufKoffer = (S, i = 0) => { const k = S.koffer[i]; S.sp.x = k.x; S.sp.y = k.y; S.sp.vx = S.sp.vy = 0; return k; };

test('Stadt: Bilder vorhanden, Start frei, alle Koffer-Orte, Verstecke und Werkstätten vom Start aus erreichbar', () => {
  for (const k of Object.keys(GROESSE)) assert.ok(existsSync(new URL(`../public/spiele/neon-coast/img/${k}.webp`, import.meta.url)), 'Bild fehlt: ' + k);
  for (const k of Object.keys(FAHRZEUG)) assert.ok(GROESSE[k], 'Fahrzeugbild fehlt: ' + k);
  for (const g of W.gebaeude) assert.ok(UMRISS[g.bild] || g.bild === 'tank-dach', 'Umriss fehlt: ' + g.bild);
  assert.equal(bodenBei(W, W.start.x, W.start.y), BODEN.ASPHALT);
  assert.ok(W.koffer.length >= 60 && W.verstecke.length === 3 && W.werkstaetten.length === 2);
  const F = feldRechnen(W, neuesFeld(), W.start.x, W.start.y, NX);
  const d = (x, y) => F.d[Math.floor(y / Z) * NX + Math.floor(x / Z)];
  for (const k of W.koffer) assert.ok(d(k.x, k.y) < 1e8, `Koffer ${k.art} bei ${k.x},${k.y} nicht erreichbar`);
  for (const v of [...W.verstecke, ...W.werkstaetten]) assert.ok(d(v.x + Math.cos(v.raus) * 4, v.y + Math.sin(v.raus) * 4) < 1e8, 'Einfahrt nicht erreichbar');
  for (const p of W.parker) assert.ok(!W.hoch[Math.floor(p.y / Z) * NX + Math.floor(p.x / Z)], 'Parker steht in einem Gebäude');
  assert.deepEqual([viertel(100, 100), viertel(300, 400), viertel(300, 640), viertel(650, 300)], ['Palmenhügel', 'Neonstadt', 'Strandmeile', 'Hafen']);
});

test('Fahrphysik: zügig auf Tempo, bessere Autos sind schneller, Handbremse macht die Kurve enger, Rückwärtsgang', () => {
  let vor = 0;
  for (const A of AUTOS) {
    const w = { vmax: A.vmax, acc: A.acc, grip: A.grip };
    const g = probefahrt(A.bild, w, () => ({}), 3);
    const v = Math.hypot(g.c.vx, g.c.vy);
    assert.ok(v > A.vmax * 0.9 && v <= A.vmax + 0.01, `${A.id}: nach 3 s ${v.toFixed(1)} von ${A.vmax}`);
    assert.ok(Math.abs(g.c.y - 390) < 0.01, 'geradeaus bleibt geradeaus');
    if (A.id !== 'pickup') assert.ok(A.vmax >= vor - 2); vor = A.vmax;
    // 90°-Kurve aus vollem Tempo: mit kurzer Handbremse deutlich weniger Platz nach außen
    const kurve = (th) => { const r = probefahrt(A.bild, w, (t, c) => ({ lenk: Math.atan2(c.vy, c.vx) < Math.PI / 2 - 0.08 ? 1 : 0, hand: t < th }), 5, A.vmax).spur; const i = r.findIndex((p, n) => n > 0 && Math.atan2(r[n][1] - r[n - 1][1], r[n][0] - r[n - 1][0]) >= Math.PI / 2 - 0.1); return r[i]; };
    const ohne = kurve(0), mit = kurve(0.6);
    assert.ok(ohne && mit, A.id + ': Kurve wird geschafft');
    assert.ok(mit[1] < ohne[1] * 0.75, `${A.id}: Handbremse ${mit[1].toFixed(1)} m quer, ohne ${ohne[1].toFixed(1)} m`);
    for (const p of [ohne, mit]) assert.ok(p.every(Number.isFinite));
  }
  const r = probefahrt('auto-flitzer', { vmax: 20, acc: 10, grip: 23 }, () => ({ bremse: true }), 2);
  assert.ok(r.c.vx < -3 && r.c.vx >= -7.01, 'Bremse im Stand fährt rückwärts, höchstens 7 m/s');
});

test('Gas und Bremse: ohne Gas steht das Auto, vom Gas gehen bremst der Motor, Nitro schiebt von selbst', () => {
  const S = fahrt(2);
  laufe(S, 1, { los: true });
  assert.ok(Math.hypot(S.sp.vx, S.sp.vy) < 0.001 && Math.abs(S.sp.x - W.start.x) < 0.001, 'ohne Gas bewegt sich nichts');
  laufe(S, 1.5, { gas: true }); const v1 = Math.hypot(S.sp.vx, S.sp.vy);
  assert.ok(v1 > 10, 'mit Gas nach 1,5 s ' + v1.toFixed(1) + ' m/s');
  laufe(S, 1, {}); const v2 = Math.hypot(S.sp.vx, S.sp.vy);
  assert.ok(v2 < v1 - 2.5 && v2 > v1 - 5, 'Motorbremse: ' + v1.toFixed(1) + ' -> ' + v2.toFixed(1));
  laufe(S, 0.4, { bremse: true }); assert.ok(Math.hypot(S.sp.vx, S.sp.vy) < v2 - 6, 'Bremse greift kräftig');
  laufe(S, 2, { hand: true }); assert.ok(Math.hypot(S.sp.vx, S.sp.vy) < 0.05, 'Handbremse hält das Auto');
  S.nitro = 1; laufe(S, 0.1, { nitro: true }); assert.equal(S.stat.nitro, 1);
  laufe(S, 1, {}); assert.ok(Math.hypot(S.sp.vx, S.sp.vy) > 8, 'Nitro beschleunigt auch ohne Gas');
});

test('Koffer: Beute, Serie und Faktor, Fahndung, Peilsender; drei Koffer sind immer im Spiel', () => {
  assert.deepEqual([1, 2, 3, 4, 9, 20].map(multi), [1, 1.5, 2, 2.5, 5, 5]);
  const S = fahrt(3); steh(S);
  assert.equal(S.koffer.length, 3);
  const k1 = aufKoffer(S); laufe(S, 0.1);
  assert.equal(S.beute, k1.wert); assert.equal(S.serie, 1); assert.equal(S.sterne, 1); assert.ok(S.peil > PEILZEIT - 1);
  assert.ok(hat(S, 'koffer') && hat(S, 'stern')); assert.equal(S.koffer.length, 3);
  const k2 = aufKoffer(S); laufe(S, 0.1);
  assert.equal(S.beute, k1.wert + Math.round(k2.wert * 1.5 / 10) * 10); assert.equal(S.serie, 2);
  assert.ok(S.koffer.every((k) => Math.hypot(k.x - S.sp.x, k.y - S.sp.y) > 20), 'neue Koffer liegen nicht direkt daneben');
  // Erste Nacht: der erste Koffer liegt in der Nähe
  const E = neueFahrt(frisch(), 5);
  const d = Math.hypot(E.koffer[0].x - E.sp.x, E.koffer[0].y - E.sp.y);
  assert.ok(d > 90 && d < 230, 'erster Koffer der ersten Nacht ' + d.toFixed(0) + ' m');
});

test('Entkommen: erst sendet der Peilsender, danach zählt die Zeit ohne Sichtkontakt; Bonus und Zähler', () => {
  const S = fahrt(4); steh(S); aufKoffer(S); laufe(S, 0.1);
  const ohnePolizei = (S) => { for (let i = S.autos.length - 1; i > 0; i--) if (S.autos[i].art === 'polizei') S.autos.splice(i, 1); };
  laufe(S, PEILZEIT - 1, { los: true }, ohnePolizei);
  assert.equal(S.sterne, 1); assert.equal(S.sucht, 0, 'solange der Sender läuft, zählt die Suchuhr nicht');
  const beute = S.beute;
  laufe(S, suchzeit(1) + 1.5, { los: true }, ohnePolizei);
  assert.equal(S.sterne, 0); assert.ok(hat(S, 'entkommen')); assert.equal(S.stat.entkommen, 1); assert.equal(S.stat.entkommenSterne, 1);
  assert.equal(S.beute, beute + 100);
});

test('Polizei: kommt nach dem Alarm, findet den stehenden Wagen und nimmt ihn fest', () => {
  const S = fahrt(6); steh(S); aufKoffer(S); laufe(S, 0.1);
  let gesehen = false, maxPol = 0;
  laufe(S, 60, { los: true }, (S) => { gesehen ||= S.gesehen; if (S.n % 30 === 0) maxPol = Math.max(maxPol, S.autos.filter((c) => c.art === 'polizei' && c.modus === 'jagd').length); });
  assert.ok(gesehen, 'Streifenwagen hatten Sichtkontakt');
  assert.ok(maxPol >= 1 && maxPol <= POLIZEI[5].n);
  assert.ok(S.ende && S.ende.grund === 'geschnappt', 'festgenommen: ' + JSON.stringify(S.ende));
  assert.ok(S.ende.t < 45, 'Festnahme nach ' + S.ende.t.toFixed(0) + ' s');
});

test('Versteck und Werkstatt: Tor zu bei Sichtkontakt, sonst Beute sicher, Fahndung weg, Auto repariert', () => {
  const S = fahrt(7); S.wartet = false;
  const v = W.verstecke[0], rein = (S, v) => { S.ort = null; S.sp.x = v.x + Math.cos(v.raus) * 5; S.sp.y = v.y + Math.sin(v.raus) * 5; S.sp.a = v.raus + Math.PI; S.sp.vx = S.sp.vy = 0; };
  S.beute = 900; S.serie = 3; S.fahndung = 2.2; S.sterne = 2; S.gesehen = true; S.sp.hp = 40; S.n = 1;   // n ungerade: Sicht wird in diesem Schritt nicht neu geprüft
  rein(S, v); schritt(S, { los: true });
  assert.ok(S.ev.some((e) => e.t === 'tor' && e.grund === 'gesehen')); assert.equal(S.beute, 900); assert.equal(S.sicher, 0);
  S.gesehen = false; S.n = 1; rein(S, v); schritt(S, { los: true });
  assert.ok(hat(S, 'gesichert')); assert.equal(S.sicher, 900); assert.equal(S.beute, 0); assert.equal(S.serie, 0); assert.equal(S.sterne, 0); assert.equal(S.sp.hp, S.sp.hpMax);
  assert.ok(S.pause > 0); laufe(S, 2, {});
  assert.ok(hat(S, 'raus') && S.wartet, 'nach dem Versteck wartet das Auto auf die nächste Eingabe');
  assert.ok(Math.abs(Math.cos(S.sp.a - v.raus) - 1) < 1e-6, 'Auto steht in Ausfahrtrichtung');
  // Werkstatt: kostet 10 % der Beute (mindestens 100 $), Serie bleibt, danach trocknet der Lack
  const T = fahrt(8); T.wartet = false; const w = W.werkstaetten[0];
  T.beute = 2000; T.serie = 4; T.fahndung = 3.1; T.sterne = 3; T.sp.hp = 30; T.n = 1;
  assert.equal(werkstattKosten(T), 200);
  rein(T, w); schritt(T, { los: true });
  assert.ok(hat(T, 'werkstatt')); assert.equal(T.beute, 1800); assert.equal(T.serie, 4); assert.equal(T.sterne, 0); assert.equal(T.sp.hp, T.sp.hpMax); assert.equal(T.stat.werkstatt, 1); assert.equal(T.lack, 1);
  laufe(T, 2); T.fahndung = 1.5; T.sterne = 1; T.n = 1; rein(T, w); T.wartet = false; schritt(T, { los: true });
  assert.ok(T.ev.some((e) => e.t === 'tor' && e.grund === 'trocknet')); assert.equal(T.sterne, 1);
  const U = fahrt(9); U.beute = 60; assert.equal(werkstattKosten(U), 60); U.beute = 0; assert.equal(werkstattKosten(U), 0);
});

test('Ende der Nacht: Wasser, Totalschaden, Feierabend – Gesichertes bleibt, Beute im Auto ist weg', () => {
  const S = fahrt(10); S.wartet = false; S.sicher = 700; S.beute = 300; S.sp.x = 20; S.sp.y = 400; schritt(S, {});
  assert.equal(S.ende.grund, 'wasser');
  const save = alt(); const R = abrechnen(save, S);
  assert.deepEqual([R.sicher, R.verloren, R.summe, R.neuerRekord], [700, 300, 700, true]); assert.equal(save.geld, 700); assert.equal(save.rekord, 700);
  // frontal in ein Haus mit angeschlagenem Auto
  const T = fahrt(11); T.wartet = false; const g = W.gebaeude.find((b) => b.bild === 'haus-hotel' && b.rot === 0);
  T.sp.hp = 6; T.sp.x = g.x; T.sp.y = g.bb.y1 + 14; T.sp.a = -Math.PI / 2; T.sp.vy = -20;
  laufe(T, 2, {});
  assert.equal(T.ende && T.ende.grund, 'schrott');
  const U = fahrt(12); U.wartet = false; laufe(U, 0.5, {}); feierabend(U); assert.equal(U.ende.grund, 'feierabend'); schritt(U, {}); assert.ok(U.t < 0.6, 'nach dem Ende läuft nichts weiter');
});

test('Prüf-Fahrer: sechs Nächte ohne Rechenfehler, sammelt Koffer und sichert Beute; gleiche Nacht läuft gleich ab', () => {
  let koffer = 0, sicher = 0, gesichert = 0;
  const nacht = (seed) => {
    const S = neueFahrt(alt(), seed), B = neuerBot({ gier: 2 }); let minV = 1e9, sumV = 0, nV = 0;
    while (!S.ende && S.t < 200) {
      schritt(S, botEingabe(S, B));
      if (S.n % 20 === 0) {
        for (const c of S.autos) { assert.ok(Number.isFinite(c.x + c.y + c.a + c.vx + c.vy + c.w), 'Rechenfehler bei ' + c.art); assert.ok(c.x > -5 && c.x < 765 && c.y > -5 && c.y < 785, c.art + ' außerhalb der Karte'); }
        for (const c of S.autos) if (c.art === 'verkehr') { sumV += Math.hypot(c.vx, c.vy); nV++; }
        assert.ok(S.autos.length < 110, 'zu viele Autos: ' + S.autos.length);
        assert.ok(S.fahndung >= 0 && S.fahndung < 6 && S.nitro >= 0 && S.nitro <= 1 && S.haft >= 0 && S.haft <= 1);
      }
      S.ev.length = 0;
    }
    assert.ok(nV === 0 || sumV / nV > 3, 'Verkehr fließt (Schnitt ' + (sumV / nV).toFixed(1) + ' m/s)'); void minV;
    return S;
  };
  for (let seed = 1; seed <= 6; seed++) { const S = nacht(seed); koffer += S.stat.koffer; sicher += S.sicher; if (S.sicher > 0) gesichert++; assert.ok(S.stat.koffer >= 1, 'Nacht ' + seed + ': kein Koffer'); }
  assert.ok(koffer >= 12, 'Koffer gesamt ' + koffer); assert.ok(gesichert >= 3 && sicher >= 2000, `gesichert in ${gesichert} von 6 Nächten, zusammen ${sicher} $`);
  const a = nacht(3), b = nacht(3);
  assert.deepEqual([a.t, a.sicher, a.beute, a.sp.x, a.sp.y, a.stat.koffer], [b.t, b.sicher, b.beute, b.sp.x, b.sp.y, b.stat.koffer]);
});

test('Aufträge, Abrechnung, Kauf, Spielstand und Einladung', () => {
  const S0 = fahrt(1);
  for (const a of AUFTRAEGE) assert.ok(a.k in S0.stat, 'Auftrag ' + a.id + ' zählt etwas, das es nicht gibt: ' + a.k);
  assert.equal(new Set(AUFTRAEGE.map((a) => a.id)).size, AUFTRAEGE.length);
  // Auftrag 1 (500 $ sichern) wird in der Fahrt erkannt und am Ende bezahlt
  const save = frisch(); const S = neueFahrt(save, 2, { verkehr: 0 }); S.wartet = false;
  assert.deepEqual(S.auftraege.map((a) => a.id), ['a1', 'a2', 'a3']);
  S.sicher = S.stat.sicher = 600; S.sp.vmax = 0.0001; laufe(S, 0.5, {});
  assert.ok(S.erledigt.includes('a1') && hat(S, 'auftrag'));
  feierabend(S); const R = abrechnen(save, S);
  assert.equal(R.lohn, 200); assert.equal(save.geld, 800); assert.deepEqual(save.erledigt, ['a1']); assert.equal(save.stat.naechte, 1);
  assert.deepEqual(aktiveAuftraege(save).map((a) => a.id), ['a2', 'a3', 'a4']);
  assert.equal(rang(save).name, 'Kleiner Fisch'); save.stat.sicher = 9000; assert.equal(rang(save).name, 'Fluchtprofi');
  assert.equal(kaufen(save, 'taxi'), false); save.geld = 1600; assert.equal(kaufen(save, 'taxi'), true); assert.equal(save.geld, 100); assert.equal(save.auto, 'taxi'); assert.equal(kaufen(save, 'taxi'), false);
  // Spielstand: Unsinn wird abgefangen
  const s = saeubere({ geld: -5, rekord: 'x', autos: ['super', 'gibtsnicht', 'taxi'], auto: 'limo', erledigt: ['a1', 'zz'], stat: { naechte: 2.7, sicher: 1e99 }, mute: 1 });
  assert.deepEqual([s.geld, s.rekord, s.autos, s.auto, s.erledigt, s.stat.naechte, s.mute], [0, 0, ['flitzer', 'super', 'taxi'], 'flitzer', ['a1'], 2, true]);
  assert.deepEqual(saeubere(null), frisch()); assert.deepEqual(saeubere('kaputt'), frisch());
  assert.deepEqual(parseEinladung('?r=4250'), { r: 4250 }); assert.equal(parseEinladung('?r=5'), null); assert.equal(parseEinladung('?r=abc'), null);
  assert.equal(geld(12340), '12.340 $');
  // Preise steigen, das Startauto ist gratis
  assert.equal(AUTOS[0].preis, 0); for (let i = 1; i < AUTOS.length; i++) assert.ok(AUTOS[i].preis > AUTOS[i - 1].preis);
});
