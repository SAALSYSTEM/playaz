// Neon Coast – Sternenfahrt: 30 handgebaute Level aus Bausteinen (21–30 mit 4 Spuren).
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

// Teil 3: vierspurige Straßen. Zeilen mit 4 Zeichen (Spuren von links nach rechts), sonst wie oben.
const E = '....';
const leer = (n) => Array(n).fill(E);
const C4 = {
  // Sternenspuren
  s1: ['*...', '*...', '*...', '*...'],
  s2: ['.*..', '.*..', '.*..', '.*..'],
  s3: ['..*.', '..*.', '..*.', '..*.'],
  s4: ['...*', '...*', '...*', '...*'],
  s12: ['.*..', '.*..', E, '*...', '*...'],
  s21: ['*...', '*...', E, '.*..', '.*..'],
  s23: ['..*.', '..*.', E, '.*..', '.*..'],
  s32: ['.*..', '.*..', E, '..*.', '..*.'],
  s34: ['...*', '...*', E, '..*.', '..*.'],
  s43: ['..*.', '..*.', E, '...*', '...*'],
  sWL: ['*...', E, '.*..', E, '..*.', E, '...*'],          // Sternenwelle von rechts nach links
  sWR: ['...*', E, '..*.', E, '.*..', E, '*...'],          // … und von links nach rechts
  sBo: ['.*..', E, '*...', E, '.*..', E, '..*.', E, '...*', E, '..*.'],   // Bogen einmal quer
  // ein Hindernis, Belohnung daneben
  k1: ['.*..', E, E, 'k...'],
  k2: ['..*.', E, E, '.k..'],
  k3: ['.*..', E, E, '..k.'],
  k4: ['..*.', E, E, '...k'],
  b2: ['*...', E, E, '.b..'],
  b3: ['...*', E, E, '..b.'],
  a1: ['.*..', E, E, 'a...'],
  a4: ['..*.', E, E, '...a'],
  // zwei Spuren zu (Hinweis-Sterne in der freien Spur davor und danach)
  zu12: ['..*.', '..*.', 'aa..', E, '..*.', '..*.'],
  zu34: ['.*..', '.*..', '..aa', E, '.*..', '.*..'],
  zu23: ['*...', '*...', '.aa.', E, '...*', '...*'],
  zu14: ['.*..', '.*..', 'a..a', E, '..*.', '..*.'],
  ku12: ['...*', '...*', 'kk..', E, '...*', '...*'],
  ku34: ['*...', '*...', '..kk', E, '*...', '*...'],
  // drei Spuren zu: nur eine Lücke, die Sterne davor zeigen sie früh
  tor1: ['*...', '*...', '.kkk', E, '*...', '*...', '*...'],
  tor2: ['.*..', '.*..', 'k.kk', E, '.*..', '.*..', '.*..'],
  tor3: ['..*.', '..*.', 'kk.k', E, '..*.', '..*.', '..*.'],
  tor4: ['...*', '...*', 'kkk.', E, '...*', '...*', '...*'],
  // Baustellen über mehrere Zeilen
  bau1: ['..*.', 'k...', E, 'k...', E, 'k...', '..*.'],
  bau4: ['.*..', '...k', E, '...k', E, '...k', '.*..'],
  bau12: ['...*', 'kk..', E, 'kk..', E, 'kk..', '...*'],
  bau34: ['*...', '..kk', E, '..kk', E, '..kk', '*...'],
  // Verschwenkung: erst rechts zu, dann links zu (und umgekehrt)
  vers: ['..*.', E, 'aa..', E, E, E, E, '..aa', E, '.*..'],
  versR: ['.*..', E, '..aa', E, E, E, E, 'aa..', E, '..*.'],
  // Sternengasse zwischen Absperrungen
  gasse: ['..*.', '..*.', '.a*a', E, '..*.'],
  gasseL: ['.*..', '.*..', 'a*a.', E, '.*..'],
  // Doppel-Hütchen: außen zu, dann innen zu
  dop: ['.*..', E, 'k..k', ...leer(5), '.kk.'],
  // Slalom über alle vier Spuren
  sla: ['k...', ...leer(5), '.k..', ...leer(5), '..k.', ...leer(5), '...k'],
  slaR: ['...k', ...leer(5), '..k.', ...leer(5), '.k..', ...leer(5), 'k...'],
  // langsame Autos (10 Zeilen: Autospur frei)
  c1: ['c...', E, '.*..', '.*..', '.*..', ...leer(5)],
  c2: ['.c..', E, '..*.', '..*.', '..*.', ...leer(5)],
  c3: ['..c.', E, '.*..', '.*..', '.*..', ...leer(5)],
  c3r: ['..c.', E, '...*', '...*', '...*', ...leer(5)],
  c2l: ['.c..', E, '*...', '*...', '*...', ...leer(5)],
  c4: ['...c', E, '..*.', '..*.', '..*.', ...leer(5)],
  c14: ['c..c', E, '.*..', '.*..', '.*..', ...leer(5)],
  c23: ['.cc.', E, '*...', '*...', '*...', ...leer(5)],
  c12: ['cc..', E, '..*.', '..*.', '..*.', ...leer(5)],
  c34: ['..cc', E, '.*..', '.*..', '.*..', ...leer(5)],
  kol: ['cc.c', E, '..*.', '..*.', '..*.', ...leer(5)],     // Kolonne: nur eine Spur frei
  kolL: ['c.cc', E, '.*..', '.*..', '.*..', ...leer(5)],
  cK: ['.c..', '*...', '*...', E, E, E, '...k', E, E, E],
  // Teil 4: Lastwagen (r Raketentransporter, t Tankwagen, m Müllwagen) – lang und langsam, 10 Zeilen wie Autos
  r1: ['r...', E, '.*..', '.*..', '.*..', ...leer(5)],
  r2: ['.r..', E, '*...', '*...', '*...', ...leer(5)],
  r3: ['..r.', E, '...*', '...*', '...*', ...leer(5)],
  r4: ['...r', E, '..*.', '..*.', '..*.', ...leer(5)],
  t1: ['t...', E, '.*..', '.*..', '.*..', ...leer(5)],
  t2: ['.t..', E, '..*.', '..*.', '..*.', ...leer(5)],
  t3: ['..t.', E, '.*..', '.*..', '.*..', ...leer(5)],
  t4: ['...t', E, '..*.', '..*.', '..*.', ...leer(5)],
  m1: ['m...', E, '.*..', '.*..', '.*..', ...leer(5)],
  m2: ['.m..', E, '*...', '*...', '*...', ...leer(5)],
  m3: ['..m.', E, '...*', '...*', '...*', ...leer(5)],
  m4: ['...m', E, '..*.', '..*.', '..*.', ...leer(5)],
  // zwei Laster nebeneinander, Sterne zeigen die freie Seite
  tm12: ['tm..', E, '..*.', '..*.', '..*.', ...leer(5)],
  mt34: ['..mt', E, '.*..', '.*..', '.*..', ...leer(5)],
  rt14: ['r..t', E, '.*..', '.*..', '.*..', ...leer(5)],
  // Laster und Auto gemischt
  rc: ['.r.c', E, '..*.', '..*.', '..*.', ...leer(5)],
  cm: ['c.m.', E, '.*..', '.*..', '.*..', ...leer(5)],
  // Laster und Hütchen: Hütchen in einer anderen Spur weit vorher
  tk: ['..t.', E, '.*..', '.*..', E, E, '...k', E, E, E],
  mk: ['.m..', E, '..*.', '..*.', E, E, 'k...', E, E, E]
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
          cL _6 gasse _7 kuLM _8 cMk _6 tor _8 sZ _5 sM _4` },
  // Teil 3: vier Spuren – Stadtautobahn (Tag), Küstenstraße (Abendrot), Hafenring (Nacht)
  { id: 21, name: 'Vier Spuren!', welt: 'stadt', spuren: 4, speed: 3.0,
    tip: { icon: '🛣️', text: 'Jetzt 4 Spuren! Mehr Platz zum Ausweichen.' },
    seq: `_4 s3 _3 s34 _3 s4 _2 s43 _2 s32 _2 s21 _2 s1 _4 sWR _4 k1 _7 s12 _3 k3 _7 sWL _4
          k2 _7 s23 _3 k4 _7 s3 _3 b2 _7 sBo _4 a1 _7 sWL _4 s2 _4` },
  { id: 22, name: 'Stadtautobahn', welt: 'stadt', spuren: 4, speed: 3.05,
    tip: { icon: '🚧', text: 'Zwei Spuren zu? Nimm eine freie!' },
    seq: `_4 sWR _4 k2 _7 zu12 _8 s34 _3 k4 _7 zu34 _8 sWL _4 bau1 _7 s21 _3 ku34 _8 s23 _3
          zu23 _8 sBo _4 bau4 _7 zu14 _8 sWR _4 s3 _4` },
  { id: 23, name: 'Rushhour', welt: 'stadt', spuren: 4, speed: 3.1,
    tip: { icon: '🚗', text: 'Viel Verkehr! Überhol die Autos.' },
    seq: `_4 s2 _4 c1 _6 s34 _3 c3r _6 c1 _6 sWL _4 c14 _6 zu34 _8 c2l _6 s23 _3
          c23 _6 bau12 _7 c12 _6 sWR _4 c34 _6 s2 _4` },
  { id: 24, name: 'Küstenstraße', welt: 'strand', licht: 'abend', spuren: 4, speed: 3.15,
    tip: { icon: '🌅', text: 'Vierspurig am Meer entlang!' },
    seq: `_4 sWR _4 vers _8 c1 _6 s34 _3 versR _8 c4 _6 sBo _4 gasse _7 zu12 _8 c23 _6
          s21 _3 dop _8 c3 _6 gasseL _7 sWL _4 s3 _4` },
  { id: 25, name: 'Surferbucht', welt: 'strand', licht: 'abend', spuren: 4, speed: 3.2,
    tip: { icon: '🏄', text: 'Nur eine Lücke? Folge den Sternen!' },
    seq: `_4 s3 _4 tor3 _8 s32 _3 tor2 _8 c14 _6 sWR _4 tor4 _8 c2 _6 s21 _3 tor1 _8 sla _8
          c34 _6 dop _8 s3 _3 tor3 _8 s2 _4` },
  { id: 26, name: 'Palmenring', welt: 'strand', licht: 'abend', spuren: 4, speed: 3.3,
    tip: { icon: '🌴', text: 'Slalom durch die Hütchen!' },
    seq: `_4 sWL _4 sla _8 c2 _6 sBo _4 slaR _8 kol _6 s3 _3 zu14 _8 c1 _6 vers _8
          c4 _6 sla _8 s3 _4` },
  { id: 27, name: 'Sonnenfinale', welt: 'strand', licht: 'abend', spuren: 4, speed: 3.35,
    tip: { icon: '🌞', text: 'Gleich wird es Nacht!' },
    seq: `_4 s2 _4 kolL _6 sWR _4 tor4 _8 c12 _6 gasse _7 versR _8 cK _6 dop _8
          kol _6 slaR _8 c14 _6 zu23 _8 tor1 _8 s1 _4` },
  { id: 28, name: 'Hafenring', welt: 'hafen', licht: 'nacht', spuren: 4, speed: 3.4,
    tip: { icon: '⚓', text: 'Vier Spuren durch den Hafen!' },
    seq: `_4 sWR _4 c4 _6 bau1 _7 s34 _3 kol _6 zu34 _8 sWL _4 tor2 _8 c3 _6 gasse _7
          vers _8 c14 _6 sla _8 s3 _3 dop _8 s2 _4` },
  { id: 29, name: 'Kranbahn', welt: 'hafen', licht: 'nacht', spuren: 4, speed: 3.5,
    tip: { icon: '🏗️', text: 'Kisten, Kegel und Kolonnen!' },
    seq: `_4 s2 _4 kolL _6 tor1 _8 sBo _4 c23 _6 bau34 _7 slaR _8 c1 _6 s34 _3 zu12 _8
          kol _6 versR _8 gasseL _7 cK _6 tor4 _8 s4 _4` },
  { id: 30, name: 'Große Hafenrunde', welt: 'hafen', licht: 'nacht', spuren: 4, speed: 3.6,
    tip: { icon: '🏆', text: 'Die allergrößte Sternenfahrt!' },
    seq: `_4 sWR _4 kol _6 dop _8 c14 _6 tor3 _8 sla _8 kolL _6 gasse _7 c4 _6
          vers _8 tor2 _8 c23 _6 slaR _8 zu14 _8 s2 _4` },
  // Teil 4: Schwertransport – lange Laster auf vier Spuren (Strand am Tag, Containerhafen, Neonstadt bei Nacht)
  { id: 31, name: 'Schwertransport', welt: 'strand', spuren: 4, speed: 3.1,
    tip: { icon: '🚚', text: 'Lange Laster! Fahr gemütlich vorbei.' },
    seq: `_4 s2 _4 t1 _8 s34 _3 m4 _8 sWL _4 r1 _8 k2 _7 s12 _3 t4 _8 sBo _4 m1 _8 zu34 _8
          s21 _3 r4 _8 s3 _4` },
  { id: 32, name: 'Tankwagen', welt: 'strand', spuren: 4, speed: 3.15,
    tip: { icon: '⛽', text: 'Der Tankwagen fährt langsam!' },
    seq: `_4 sWR _4 t2 _8 s43 _3 t3 _8 k1 _7 m2 _8 sWL _4 tk _8 zu12 _8 c1 _6 t4 _8 s34 _3
          gasse _7 m3 _8 s2 _4` },
  { id: 33, name: 'Strandallee', welt: 'strand', spuren: 4, speed: 3.2,
    tip: { icon: '🏖️', text: 'Zwei Laster nebeneinander? Nimm die freie Seite!' },
    seq: `_4 s3 _4 tm12 _8 s34 _3 r1 _8 sBo _4 mt34 _8 c2 _6 vers _8 rt14 _8 s21 _3
          m4 _8 dop _8 tm12 _8 s3 _4` },
  { id: 34, name: 'Containerhafen', welt: 'hafen', spuren: 4, speed: 3.25,
    tip: { icon: '📦', text: 'Im Hafen fahren viele Laster!' },
    seq: `_4 sWR _4 m1 _8 bau4 _7 t3 _8 s21 _3 rc _8 zu34 _8 mk _8 sWL _4 tor2 _8 r4 _8
          s34 _3 cm _8 gasseL _7 s2 _4` },
  { id: 35, name: 'Raketenfracht', welt: 'hafen', spuren: 4, speed: 3.3,
    tip: { icon: '🚀', text: 'Eine Rakete auf dem Laster!' },
    seq: `_4 s2 _4 r1 _8 r4 _8 sWL _4 r2 _8 k4 _7 r3 _8 s32 _3 rt14 _8 sla _8 c4 _6
          s21 _3 r2 _8 tor3 _8 s3 _4` },
  { id: 36, name: 'Ladekai', welt: 'hafen', spuren: 4, speed: 3.35,
    tip: { icon: '🏗️', text: 'Laster, Kisten, Kegel!' },
    seq: `_4 sWR _4 mt34 _8 bau12 _7 t2 _8 sBo _4 tk _8 zu14 _8 kol _6 s34 _3 rc _8
          versR _8 tm12 _8 dop _8 s2 _4` },
  { id: 37, name: 'Frühschicht', welt: 'hafen', spuren: 4, speed: 3.4,
    tip: { icon: '🚛', text: 'Die Müllabfuhr ist unterwegs!' },
    seq: `_4 s1 _4 m2 _8 sWR _4 m3 _8 mk _8 tor4 _8 cm _8 s12 _3 m1 _8 gasse _7 m4 _8
          slaR _8 rt14 _8 s3 _4` },
  { id: 38, name: 'Neonnacht', welt: 'stadt', licht: 'nacht', spuren: 4, speed: 3.45,
    tip: { icon: '🌃', text: 'Nachts sind Laster unterwegs!' },
    seq: `_4 sWL _4 t1 _8 s34 _3 rc _8 tor2 _8 mt34 _8 sWR _4 kolL _6 vers _8 r4 _8
          s12 _3 tk _8 dop _8 s2 _4` },
  { id: 39, name: 'Nachtkonvoi', welt: 'stadt', licht: 'nacht', spuren: 4, speed: 3.5,
    tip: { icon: '🚚', text: 'Ein ganzer Konvoi!' },
    seq: `_4 s2 _4 tm12 _8 mt34 _8 sBo _4 rt14 _8 gasseL _7 cm _8 sla _8 r1 _8 s34 _3
          kol _6 tor3 _8 m4 _8 s2 _4` },
  { id: 40, name: 'Großer Schwertransport', welt: 'stadt', licht: 'nacht', spuren: 4, speed: 3.6,
    tip: { icon: '🏆', text: 'Die allergrößte Laster-Fahrt!' },
    seq: `_4 sWR _4 r1 _8 tm12 _8 dop _8 rc _8 sWL _4 mt34 _8 tor2 _8 r4 _8 versR _8
          rt14 _8 gasse _7 kolL _6 s2 _4` }
];

export const LEVELS = DEFS.map((d) => buildLevel({ vorlauf: 6, auslauf: 6, ...d }, d.spuren === 4 ? C4 : C));
export const LEVEL_COUNT = LEVELS.length;
export const CHUNKS = C;
export const CHUNKS4 = C4;
