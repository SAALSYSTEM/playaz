// Neon Coast – Tagesnacht: jeden Tag dieselbe Nacht für alle (gleiche Koffer, gleicher Verkehr, gleiche Ereignisse,
// gleiches Auto). Sie dauert 2:30 Minuten, gewertet wird die gesicherte Beute. Der Browser zeichnet die Eingaben je Takt
// auf; der Server (Edge Function "neon-coast-lauf") spielt die Nacht damit nach und trägt nur bestätigte Nächte ein.
// Läuft ohne DOM (Browser, Node, Deno).
import { neueFahrt, schritt, feierabend } from './engine.js';
import { AUTOS } from './daten.js';

export const SIM_VERSION = 1;     // erhöhen, sobald sich engine.js, welt.js, daten.js oder diese Datei spielwirksam ändern
export const TAG = { dauer: 150, sichtweite: 78, maxTakte: 150 * 60 + 3600 };   // Takte: Fahrzeit + Pausen in Versteck und Werkstatt

// Datum in Berlin als Zahl JJJJMMTT – der Zufallskeim der Nacht
export function berlinTag(jetzt = new Date(), tage = 0) {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(jetzt.getTime() + tage * 86400000));
  return Number(p.replace(/-/g, ''));
}
// Auto des Tages: reihum alle acht, damit jeder jedes einmal fährt (und niemand sich einen Vorteil kaufen kann)
export function tagesAuto(seed) {
  const tage = Math.round(Date.UTC(Math.floor(seed / 10000), Math.floor(seed / 100) % 100 - 1, seed % 100) / 86400000);
  return AUTOS[((tage % AUTOS.length) + AUTOS.length) % AUTOS.length];
}
// erledigt: nur für die Aufträge, die der Spieler nebenbei erfüllt – auf den Ablauf der Nacht hat das keinen Einfluss
export function tagFahrt(seed, erledigt = []) {
  return neueFahrt({ auto: tagesAuto(seed).id, stat: { naechte: 1 }, erledigt }, seed, { dauer: TAG.dauer, sichtweite: TAG.sichtweite, tag: seed });
}

// ---------- Eingaben: eine Zahl je Takt. Lenkung in 31 Stufen (0..30, Mitte 15), dazu Gas 32, Bremse 64, Handbremse 128, Nitro 256.
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export function kodiere(e) {
  return (Math.round(clamp(e.lenk || 0, -1, 1) * 15) + 15) | (e.gas ? 32 : 0) | (e.bremse ? 64 : 0) | (e.hand ? 128 : 0) | (e.nitro ? 256 : 0);
}
export function dekodiere(c) {
  return { lenk: ((c & 31) - 15) / 15, gas: (c & 32) !== 0, bremse: (c & 64) !== 0, hand: (c & 128) !== 0, nitro: (c & 256) !== 0 };
}
// Ein Schritt der Tagesnacht: gerechnet wird mit der gerundeten Eingabe, genau die wird auch aufgezeichnet.
// Takte, in denen die Nacht auf die erste Eingabe wartet, zählen nicht.
export function tagSchritt(S, codes, e) {
  if (S.ende) return;
  const c = kodiere(e), w = S.wartet;
  schritt(S, dekodiere(c));
  if (!(w && S.wartet)) codes.push(c);
}
// Lauflängen als Text: "Zahl" oder "Zahl*Anzahl" (beides zur Basis 36), durch Leerzeichen getrennt
export function packe(codes) {
  const teile = [];
  for (let i = 0; i < codes.length;) {
    let n = 1; while (i + n < codes.length && codes[i + n] === codes[i]) n++;
    teile.push(n > 1 ? codes[i].toString(36) + '*' + n.toString(36) : codes[i].toString(36));
    i += n;
  }
  return teile.join(' ');
}
export function entpacke(text, max = TAG.maxTakte) {
  if (typeof text !== 'string' || !text.length || text.length > 150000) return null;
  const aus = [];
  for (const teil of text.split(' ')) {
    const m = /^([0-9a-z]{1,2})(?:\*([0-9a-z]{1,4}))?$/.exec(teil); if (!m) return null;
    const c = parseInt(m[1], 36), n = m[2] ? parseInt(m[2], 36) : 1;
    if (c > 511 || (c & 31) > 30 || n < 1 || aus.length + n > max) return null;
    for (let k = 0; k < n; k++) aus.push(c);
  }
  return aus;
}

// ---------- Prüfung (Server): Nacht mit den gemeldeten Eingaben nachspielen
// l: { v, seed, takte, sicher, koffer, inputs, aus }   (aus: Nacht über das Pausenmenü beendet)
export function pruefeLauf(l) {
  if (!l || l.v !== SIM_VERSION || !Number.isInteger(l.seed) || !Number.isInteger(l.takte) || l.takte < 1 || l.takte > TAG.maxTakte) return { ok: false, grund: 'ungueltig' };
  const ein = entpacke(l.inputs);
  if (!ein || ein.length !== l.takte) return { ok: false, grund: 'eingaben' };
  const S = tagFahrt(l.seed);
  for (let i = 0; i < ein.length; i++) {
    if (S.ende) return { ok: false, grund: 'zu_lang' };
    const w = S.wartet;
    schritt(S, dekodiere(ein[i]));
    if (w && S.wartet) return { ok: false, grund: 'eingaben' };   // ein gemeldeter Takt, in dem nichts geschah
    S.ev.length = 0;
  }
  if (!S.ende && l.aus === true) feierabend(S);
  if (!S.ende) return { ok: false, grund: 'kein_ende' };
  if (S.sicher !== l.sicher || S.stat.koffer !== l.koffer) return { ok: false, grund: 'abweichung' };
  return { ok: true, sicher: S.sicher, koffer: S.stat.koffer, takte: l.takte, sterne: S.stat.maxSterne, grund: S.ende.grund };
}
// Meldung für den Server aus einer beendeten Tagesnacht
export function lauf(S, codes, aus = false) {
  return { v: SIM_VERSION, seed: S.tag, takte: codes.length, sicher: S.sicher, koffer: S.stat.koffer, inputs: packe(codes), aus };
}
