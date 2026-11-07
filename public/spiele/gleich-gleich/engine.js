// Gleich, gleich! – Regeln, Welten, Level und Fuchs Fiete (ohne DOM, auch in Node testbar).

// Welten: Motiv-IDs = Bilddateien in img/, Name = das, was vorgelesen wird
export const WELTEN = [
  { id: 'bauernhof', name: 'Bauernhof', farbe: ['#d9f2c4', '#9fd27f'], motive: [
    ['kueken', 'Küken'], ['ferkel', 'Ferkel'], ['kalb', 'Kälbchen'], ['lamm', 'Lämmchen'],
    ['ente', 'Entchen'], ['fohlen', 'Fohlen'], ['heuballen', 'Heuballen'], ['apfelbaum', 'Apfelbaum']] },
  { id: 'tierfreunde', name: 'Tierfreunde', farbe: ['#cfe9ff', '#a6d7a0'], motive: [
    ['elefant', 'Elefant'], ['panda', 'Panda'], ['frosch', 'Frosch'], ['katze', 'Katze'],
    ['loewe', 'Löwe'], ['hase', 'Hase'], ['fuchs', 'Fuchs']] },
  { id: 'kueche', name: 'Krümels Küche', farbe: ['#fff1d6', '#f6c98a'], motive: [
    ['maus', 'Maus'], ['kaese', 'Käse'], ['keks', 'Keks'], ['toast', 'Toast'],
    ['wolle', 'Wollknäuel'], ['kaetzchen', 'Kätzchen'], ['quietscheente', 'Quietscheente'], ['kuchen', 'Kuchen']] },
  { id: 'dschungel', name: 'Dino-Dschungel', farbe: ['#dff5c9', '#7cc46a'], motive: [
    ['dino', 'Dino'], ['langhals', 'Langhals'], ['dinofreund', 'Dino-Freundin'], ['blatt', 'Blatt'],
    ['mango', 'Mango'], ['kokosnuss', 'Kokosnuss'], ['baumhaus', 'Baumhaus'], ['ballon', 'Heißluftballon']] },
  { id: 'hexe', name: 'Hexenküche', farbe: ['#e7dcff', '#b49be6'], motive: [
    ['hexe', 'Hexe'], ['kater', 'Kater'], ['kuerbis', 'Kürbis'], ['pilz', 'Pilz'],
    ['fledermaus', 'Fledermaus'], ['mond', 'Mond'], ['bonbon', 'Bonbon'], ['kessel', 'Kessel']] },
  { id: 'feuerwehr', name: 'Feuerwehr', farbe: ['#ffe3d6', '#f7a98a'], motive: [
    ['feuerwehrauto', 'Feuerwehrauto'], ['feuerwehrmann', 'Feuerwehrmann'], ['katze-rot', 'Katze'], ['feuer', 'Feuer'],
    ['haus', 'Haus'], ['baum', 'Baum'], ['leiter', 'Leiter'], ['laterne', 'Laterne']] },
  { id: 'feen', name: 'Feenwelt', farbe: ['#ffe4f3', '#d9b8f0'], motive: [
    ['einhorn', 'Einhorn'], ['fee', 'Fee'], ['elf', 'Elf'], ['schmetterling', 'Schmetterling'],
    ['regenbogen', 'Regenbogen'], ['stern', 'Stern'], ['zauberstab', 'Zauberstab'], ['schloss', 'Wolkenschloss']] },
];

// Paare je Level (3 Level pro Welt). Fietes Gedächtnis: Wahrscheinlichkeit, sich eine aufgedeckte Karte zu merken.
const PAARE = [[3, 4, 6], [4, 6, 6], [4, 6, 8], [6, 6, 8], [6, 8, 8], [6, 8, 8], [6, 8, 8]];
const MERKEN = [0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5];

export const LEVELS = [];
WELTEN.forEach((w, wi) => PAARE[wi].forEach((p, k) => LEVELS.push({ nr: LEVELS.length + 1, welt: wi, stufe: k + 1, paare: Math.min(p, w.motive.length), merken: MERKEN[wi] })));

export const MODI = ['allein', 'fiete', 'zwei'];
export const NAMEN = Object.fromEntries(WELTEN.flatMap((w) => w.motive));

// Kleiner fester Zufall (für Tests reproduzierbar)
export function rng(seed) {
  let a = (seed >>> 0) || 1;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function mischen(arr, r) { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; }

// Neues Spiel. spieler: 0 = Kind (bzw. Spieler 1), 1 = Fiete (bzw. Spieler 2)
export function neu(levelNr, modus = 'allein', seed = Date.now()) {
  const lv = LEVELS[levelNr - 1]; if (!lv) throw new Error('Level fehlt: ' + levelNr);
  if (!MODI.includes(modus)) modus = 'allein';
  const r = rng(seed);
  const motive = mischen(WELTEN[lv.welt].motive.map((m) => m[0]), r).slice(0, lv.paare);
  const karten = mischen(motive.flatMap((m) => [m, m]), r).map((m) => ({ m, offen: false, weg: -1 }));
  return { level: levelNr, modus, karten, dran: 0, auf: [], paare: [0, 0], fehl: [0, 0], zuege: 0, gedaechtnis: {}, ende: false, seed: seed >>> 0 };
}

export const verdeckt = (s) => s.karten.map((k, i) => (!k.offen && k.weg < 0 ? i : -1)).filter((i) => i >= 0);
export const darf = (s, i) => !s.ende && s.auf.length < 2 && !!s.karten[i] && !s.karten[i].offen && s.karten[i].weg < 0;

// Eine Karte aufdecken. Ergebnis: 'erste' | 'paar' | 'daneben' | null (nicht erlaubt)
export function aufdecken(s, i, merkZufall = Math.random) {
  if (!darf(s, i)) return null;
  const k = s.karten[i]; k.offen = true; s.auf.push(i);
  // Fiete sieht jede aufgedeckte Karte, merkt sie sich aber nur manchmal (wie ein Kind)
  if (s.modus === 'fiete' && merkZufall() < LEVELS[s.level - 1].merken) s.gedaechtnis[i] = k.m;
  if (s.auf.length < 2) return 'erste';
  s.zuege++;
  const [a, b] = s.auf;
  if (s.karten[a].m === s.karten[b].m) {
    s.karten[a].weg = s.karten[b].weg = s.dran; s.paare[s.dran]++; s.auf = [];
    delete s.gedaechtnis[a]; delete s.gedaechtnis[b];
    if (s.karten.every((x) => x.weg >= 0)) s.ende = true;
    return 'paar';
  }
  s.fehl[s.dran]++;
  return 'daneben';
}

// Nach „daneben“: Karten wieder umdrehen, der andere ist dran (allein bleibt man dran)
export function zudecken(s) {
  for (const i of s.auf) s.karten[i].offen = false;
  s.auf = [];
  if (s.modus !== 'allein') s.dran = 1 - s.dran;
}

// Fiete wählt die nächste Karte – nur aus seinem Gedächtnis und den offen liegenden Karten
export function fieteWahl(s, r = Math.random) {
  const zu = verdeckt(s); if (!zu.length) return -1;
  const g = s.gedaechtnis, bekannt = (i) => Object.prototype.hasOwnProperty.call(g, i) && zu.includes(i);
  const unbekannt = zu.filter((i) => !bekannt(i));
  const zufall = (arr) => arr[Math.floor(r() * arr.length)];
  if (s.auf.length === 0) {
    // ein bekanntes Paar?
    const gesehen = {};
    for (const i of zu) if (bekannt(i)) { if (gesehen[g[i]] !== undefined) return gesehen[g[i]]; gesehen[g[i]] = i; }
    return unbekannt.length ? zufall(unbekannt) : zufall(zu);
  }
  const erste = s.auf[0], m = s.karten[erste].m;   // offen sichtbar
  const treffer = zu.find((i) => i !== erste && bekannt(i) && g[i] === m);
  if (treffer !== undefined) return treffer;
  const frei = unbekannt.filter((i) => i !== erste);
  return frei.length ? zufall(frei) : zufall(zu.filter((i) => i !== erste));
}

// Sterne: allein nach Fehlversuchen, gegen Fiete nach Ergebnis. Zu zweit gibt es keine Sterne.
export function sterne(s) {
  if (!s.ende) return 0;
  if (s.modus === 'allein') { const p = LEVELS[s.level - 1].paare, f = s.fehl[0]; return f <= p ? 3 : f <= 2 * p ? 2 : 1; }
  if (s.modus === 'fiete') return s.paare[0] > s.paare[1] ? 3 : s.paare[0] === s.paare[1] ? 2 : 1;
  return 0;
}

// Raster für n Karten im Hochformat: Spaltenzahl, die die größte Karte (3:4) ergibt
export function raster(n, breite, hoehe, luecke = 8) {
  let best = { spalten: 2, w: 0 };
  for (let sp = 2; sp <= 5; sp++) {
    const z = Math.ceil(n / sp);
    if (sp * z - n >= sp) continue;
    const w = Math.min((breite - luecke * (sp - 1)) / sp, ((hoehe - luecke * (z - 1)) / z) * 0.75);
    if (w > best.w + 0.5) best = { spalten: sp, zeilen: z, w: Math.floor(w) };
  }
  return best;
}

// Spielstand prüfen (localStorage kann alles enthalten)
export function ladeStand(roh) {
  const leer = { v: 1, best: {}, modus: 'allein', voice: true };
  let d; try { d = typeof roh === 'string' ? JSON.parse(roh) : roh; } catch { return leer; }
  if (!d || typeof d !== 'object') return leer;
  const best = {};
  if (d.best && typeof d.best === 'object') for (const [k, v] of Object.entries(d.best)) { const n = Number(k), st = Number(v); if (Number.isInteger(n) && n >= 1 && n <= LEVELS.length && st >= 1 && st <= 3) best[n] = Math.floor(st); }
  return { v: 1, best, modus: MODI.includes(d.modus) ? d.modus : 'allein', voice: d.voice !== false };
}
export const offenBis = (best) => { let n = 1; while (n < LEVELS.length && best[n]) n++; return n; };
