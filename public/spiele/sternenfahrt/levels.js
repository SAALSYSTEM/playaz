// Neon Coast – Sternenfahrt: 10 handgebaute Level aus Bausteinen.
// Baustein = Zeilen von oben nach unten wie auf dem Bildschirm, je Zeile 3 Spuren (links, Mitte, rechts).
// '.' frei, '*' Stern, 'k' Leitkegel, 'b' Bake, 'a' Absperrung, 'c' langsames Auto (Zeile = wo man es einholt;
// das Auto fährt vorher CAR_RUN ≈ 10 Zeilen in seiner Spur, die bleibt im Baustein frei).
// In `seq` steht die Fahrtreihenfolge (erster Baustein zuerst), `_n` = n leere Zeilen. 1 Zeile = 1 Spurbreite.
import { buildLevel } from './engine.js';

const C = {
  // Sternenspuren
  sM: ['.*.', '.*.', '.*.', '.*.'],
  sL: ['*..', '*..', '*..', '*..'],
  sR: ['..*', '..*', '..*', '..*'],
  sLM: ['.*.', '.*.', '...', '*..', '*..'],
  sML: ['*..', '*..', '...', '.*.', '.*.'],
  sMR: ['..*', '..*', '...', '.*.', '.*.'],
  sRM: ['.*.', '.*.', '...', '..*', '..*'],
  sZ: ['*..', '...', '.*.', '...', '..*', '...', '.*.', '...', '*..'],
  sZR: ['..*', '...', '.*.', '...', '*..', '...', '.*.', '...', '..*'],
  s2: ['.*.', '...', '.*.'],
  s2L: ['*..', '...', '*..'],
  s2R: ['..*', '...', '..*'],
  // ein Hindernis, Belohnung danach
  kM: ['*.*', '...', '...', '.k.'],
  kL: ['.*.', '...', '...', 'k..'],
  kR: ['.*.', '...', '...', '..k'],
  bM: ['*.*', '...', '...', '.b.'],
  bL: ['.*.', '...', '...', 'b..'],
  bR: ['.*.', '...', '...', '..b'],
  aM: ['*.*', '...', '...', '.a.'],
  aL: ['.*.', '...', '...', 'a..'],
  aR: ['.*.', '...', '...', '..a'],
  // Hinweis-Sterne zeigen die freie Spur schon vor dem Hindernis
  kMh: ['*..', '...', '.k.', '...', '*..', '*..'],
  aLh: ['.*.', '...', 'a..', '...', '.*.', '.*.'],
  aRh: ['.*.', '...', '..a', '...', '.*.', '.*.'],
  // zwei Spuren zu: nur eine bleibt frei
  tor: ['.*.', '.*.', 'k.k', '...', '.*.'],
  torB: ['.*.', '.*.', 'b.b', '...', '.*.'],
  zuLM: ['..*', '..*', 'aa.', '...', '..*'],
  zuMR: ['*..', '*..', '.aa', '...', '*..'],
  zuLR: ['.*.', '.*.', 'a.a', '...', '.*.'],
  kuLM: ['..*', '..*', 'kk.', '...', '..*'],
  kuMR: ['*..', '*..', '.kk', '...', '*..'],
  // Baustelle: mehrere Kegel hintereinander in einer Spur
  bauL: ['.*.', 'k..', '...', 'k..', '...', 'k..', '.*.'],
  bauR: ['.*.', '..k', '...', '..k', '...', '..k', '.*.'],
  bauM: ['*..', '.k.', '...', '.k.', '...', '.k.', '*..'],
  // langsame Autos (10 Zeilen: Autospur frei)
  cM: ['.c.', '*.*', '*.*', '...', '...', '...', '...', '...', '...', '...'],
  cL: ['c..', '.*.', '.*.', '.*.', '...', '...', '...', '...', '...', '...'],
  cR: ['..c', '.*.', '.*.', '.*.', '...', '...', '...', '...', '...', '...'],
  cLR: ['c.c', '.*.', '.*.', '.*.', '...', '...', '...', '...', '...', '...'],
  cLM: ['cc.', '..*', '..*', '..*', '...', '...', '...', '...', '...', '...'],
  cMR: ['.cc', '*..', '*..', '*..', '...', '...', '...', '...', '...', '...'],
  // Auto und Kegel kombiniert: Kegel in der freien Spur weit vorher
  cMk: ['.c.', '*..', '*..', '...', '...', '...', '..k', '...', '...', '...']
};

const DEFS = [
  { id: 1, name: 'Erste Fahrt', welt: 'stadt', speed: 2.2, tutorial: true,
    tip: { icon: '⭐', text: 'Sammle die Sterne!' },
    seq: `_4 sR _2 sRM _2 sM _2 sML _2 sL _3 sLM _4 sM _6
          kM _8 s2 _6 kL _8 sZR _6 kR _8 sM _4` },
  { id: 2, name: 'Hütchen-Allee', welt: 'stadt', speed: 2.35,
    tip: { icon: '🔶', text: 'Fahr um die Hütchen herum!' },
    seq: `_4 sM _3 sML _6 kL _8 sLM _6 kM _7 s2R _5 kR _7 sRM _4 kMh _7 sZ _5
          kL _7 kR _7 sM _4` },
  { id: 3, name: 'Baustelle', welt: 'stadt', speed: 2.5,
    tip: { icon: '🚧', text: 'Absperrungen! Wechsle die Spur.' },
    seq: `_4 sM _4 aL _7 sZ _5 aRh _7 bM _7 sML _5 bauM _6 sLM _4 aLh _7
          kM _7 bR _7 sZR _5 aM _7 sM _4` },
  { id: 4, name: 'Strandpromenade', welt: 'strand', speed: 2.6,
    tip: { icon: '🚗', text: 'Langsame Autos überholen!' },
    seq: `_4 sM _4 cL _6 sZ _5 cM _6 kL _7 cR _6 sRM _4 bM _7
          cL _6 aR _7 sM _4` },
  { id: 5, name: 'Sonnenstrand', welt: 'strand', speed: 2.7,
    tip: { icon: '🏖️', text: 'Nur eine Lücke ist frei!' },
    seq: `_4 sM _4 tor _7 sZ _5 kuLM _8 sRM _4 cL _6 kuMR _8 sLM _4 aM _7 torB _7
          cR _6 zuLR _7 sM _4` },
  { id: 6, name: 'Palmenweg', welt: 'strand', speed: 2.8,
    tip: { icon: '🌴', text: 'Schau weit nach vorn!' },
    seq: `_4 sZ _5 cMk _6 kL _6 kR _6 zuLM _8 cLM _6 s2R _4 aR _7 bauL _6
          cMR _6 sLM _4 tor _7 kuMR _8 sML _4` },
  { id: 7, name: 'Strandfest', welt: 'strand', speed: 3.0,
    tip: { icon: '🎉', text: 'Jetzt etwas schneller!' },
    seq: `_4 sM _5 kM _7 sZR _5 zuMR _8 cR _6 bauR _6 kuLM _8 cL _6 sRM _4
          aM _7 torB _7 cLR _6 kL _7 zuLM _8 sMR _4` },
  { id: 8, name: 'Hafeneinfahrt', welt: 'hafen', speed: 3.1,
    tip: { icon: '⚓', text: 'Willkommen im Hafen!' },
    seq: `_4 sM _5 cM _6 aL _7 sZ _5 kuMR _8 cL _6 bauM _6 zuLR _8 sZR _5
          cMR _6 bR _7 aL _7 tor _8 cLM _6 aR _7 sM _4` },
  { id: 9, name: 'Containerhafen', welt: 'hafen', speed: 3.25,
    tip: { icon: '📦', text: 'Viele Sterne zwischen den Kisten!' },
    seq: `_4 sZ _5 kuLM _8 cR _6 sZR _5 bauL _6 zuMR _8 cLM _6 aM _7 kL _7
          kR _7 cLR _6 torB _8 kuMR _8 sML _4 cMk _6 zuLM _8 sM _4` },
  { id: 10, name: 'Großer Hafen', welt: 'hafen', speed: 3.4,
    tip: { icon: '🏆', text: 'Die große Sternenfahrt!' },
    seq: `_4 sZ _5 cM _6 kuMR _8 sLM _4 bauM _6 cR _6 zuLR _8
          tor _8 cLM _6 kuLM _8 sZR _5 cMk _6 bauR _6 zuMR _8
          torB _8 sZ _5 sM _4` }
];

export const LEVELS = DEFS.map((d) => buildLevel({ vorlauf: 6, auslauf: 6, ...d }, C));
export const LEVEL_COUNT = LEVELS.length;
export const CHUNKS = C;
