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
  cMk: ['.c.', '*..', '*..', '...', '...', '...', '..k', '...', '...', '...'],
  // ab Level 11: Slalom, Doppel-Hütchen, Sternengasse
  sla: ['k..', '...', '...', '...', '...', '...', '.k.', '...', '...', '...', '...', '...', '..k'],
  slaR: ['..k', '...', '...', '...', '...', '...', '.k.', '...', '...', '...', '...', '...', 'k..'],
  dop: ['.*.', '...', 'k.k', '...', '...', '...', '...', '...', '.k.'],
  gasse: ['.*.', '.*.', 'a*a', '...', '.*.']
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
          torB _8 sZ _5 sM _4` },
  // Teil 2: dieselben Welten bei Nacht und im Abendrot
  { id: 11, name: 'Neonstadt', welt: 'stadt', licht: 'nacht', speed: 3.0,
    tip: { icon: '🌙', text: 'Nachtfahrt! Die Sterne leuchten.' },
    seq: `_4 sM _5 sZ _5 kL _7 kR _7 sRM _4 sla _7 sMR _4 aM _7 bauL _6 sZR _5
          dop _7 sML _4 aRh _7 kuMR _8 sM _4` },
  { id: 12, name: 'Lichterallee', welt: 'stadt', licht: 'nacht', speed: 3.1,
    tip: { icon: '💡', text: 'Folge den Lichtern!' },
    seq: `_4 sZ _5 gasse _7 slaR _7 sLM _4 bauR _6 kuLM _8 sZR _5 dop _7 aL _7
          bM _7 sMR _4 tor _8 sla _7 sM _4` },
  { id: 13, name: 'Mitternacht', welt: 'stadt', licht: 'nacht', speed: 3.2,
    tip: { icon: '✨', text: 'Durch die Sternengasse!' },
    seq: `_4 sM _5 gasse _7 sla _7 zuMR _8 sZ _5 dop _7 kuLM _8 sRM _4 bauM _6
          slaR _7 torB _8 aR _7 gasse _7 sZR _5 sM _4` },
  { id: 14, name: 'Abendrot', welt: 'strand', licht: 'abend', speed: 3.2,
    tip: { icon: '🌅', text: 'Sonnenuntergang am Strand!' },
    seq: `_4 sZ _5 cL _6 sla _7 cR _6 sZR _5 dop _7 cM _6 kuMR _8 sLM _4 gasse _7
          cLM _6 aR _7 sM _4` },
  { id: 15, name: 'Goldene Bucht', welt: 'strand', licht: 'abend', speed: 3.3,
    tip: { icon: '🐚', text: 'Viele Autos am Abend!' },
    seq: `_4 sM _5 cLR _6 slaR _7 cMR _6 sZ _5 zuLR _8 cL _6 dop _7 sZR _5 cMk _6
          gasse _7 kuLM _8 cR _6 sM _4` },
  { id: 16, name: 'Strandlaternen', welt: 'strand', licht: 'abend', speed: 3.35,
    tip: { icon: '🏮', text: 'Weiter so!' },
    seq: `_4 sZ _5 sla _7 cM _6 gasse _7 zuMR _8 cLM _6 sRM _4 bauR _6 dop _7
          cMR _6 tor _8 slaR _7 sZ _5 cL _6 sM _4` },
  { id: 17, name: 'Letzte Welle', welt: 'strand', licht: 'abend', speed: 3.4,
    tip: { icon: '🌊', text: 'Bald wird es dunkel!' },
    seq: `_4 sM _5 dop _7 cR _6 sla _7 kuLM _8 cLR _6 gasse _7 sZR _5 zuLM _8
          cMk _6 slaR _7 torB _8 cM _6 sM _4` },
  { id: 18, name: 'Leuchtturmhafen', welt: 'hafen', licht: 'nacht', speed: 3.45,
    tip: { icon: '🗼', text: 'Nachts im Hafen!' },
    seq: `_4 sZ _5 cM _6 sla _7 gasse _7 cLM _6 dop _7 zuMR _8 sZR _5 cR _6
          bauL _6 slaR _7 tor _8 cL _6 sM _4` },
  { id: 19, name: 'Nachtschicht', welt: 'hafen', licht: 'nacht', speed: 3.5,
    tip: { icon: '📦', text: 'Kisten, Kegel, Sterne!' },
    seq: `_4 sM _5 dop _7 cMR _6 slaR _7 zuLR _8 cL _6 gasse _7 sZ _5 kuMR _8
          cM _6 sla _7 aL _7 cLR _6 torB _8 sM _4` },
  { id: 20, name: 'Sternenfinale', welt: 'hafen', licht: 'nacht', speed: 3.6,
    tip: { icon: '🏆', text: 'Das große Sternenfinale!' },
    seq: `_4 sZ _5 sZR _5 gasse _7 cM _6 sla _7 dop _7 cLR _6 slaR _7 zuMR _8
          cL _6 gasse _7 kuLM _8 cMk _6 tor _8 sZ _5 sM _4` }
];

export const LEVELS = DEFS.map((d) => buildLevel({ vorlauf: 6, auslauf: 6, ...d }, C));
export const LEVEL_COUNT = LEVELS.length;
export const CHUNKS = C;
