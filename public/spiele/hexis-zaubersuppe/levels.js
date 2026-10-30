// Hexis Zaubersuppe – 15 feste Level.
// rezept: Zutat -> Anzahl. regal: alle Zutaten im Regal (Rezept + Ablenker, feste Reihenfolge). kater: Verwandlung am Ende.
// Lernkurve: 1–3 eine Zutat (zählen bis 3), 4–6 zwei Zutaten, 7–10 drei Zutaten (neue Zutaten Bonbon, Feder, Beeren, Mond),
// 11–15 drei bis fünf Zutaten, Regal wird voller. Jede Verwandlung kommt spätestens in Level 10 zum ersten Mal.
// fest: Im letzten Level wirbelt Kasimir einmal durch alle Verwandlungen, bevor er bei „kater“ stehen bleibt.

export const LEVELS = [
  { id: 1, name: 'Ein Frosch, bitte!', rezept: { frosch: 1 }, regal: ['apfel', 'frosch'], kater: 'lila' },
  { id: 2, name: 'Kürbissuppe', rezept: { kuerbis: 2 }, regal: ['kuerbis', 'frosch', 'apfel'], kater: 'kuerbis' },
  { id: 3, name: 'Sternenglanz', rezept: { stern: 3 }, regal: ['apfel', 'kuerbis', 'stern'], kater: 'lila' },
  { id: 4, name: 'Pilz und Frosch', rezept: { pilz: 1, frosch: 1 }, regal: ['stern', 'pilz', 'apfel', 'frosch'], kater: 'hut' },
  { id: 5, name: 'Flatterbrei', rezept: { fledermaus: 2, stern: 1 }, regal: ['pilz', 'fledermaus', 'kuerbis', 'stern'], kater: 'fluegel' },
  { id: 6, name: 'Herbstsuppe', rezept: { apfel: 2, kuerbis: 2 }, regal: ['fledermaus', 'apfel', 'frosch', 'kuerbis'], kater: 'kuerbis' },
  { id: 7, name: 'Bonbon-Zauber', rezept: { bonbon: 2, frosch: 1, stern: 1 }, regal: ['frosch', 'apfel', 'bonbon', 'pilz', 'stern'], kater: 'regenbogen' },
  { id: 8, name: 'Hut ab!', rezept: { pilz: 2, feder: 1 }, regal: ['feder', 'kuerbis', 'pilz', 'fledermaus', 'apfel'], kater: 'hut' },
  { id: 9, name: 'Beerenblubber', rezept: { beeren: 3, fledermaus: 1 }, regal: ['stern', 'beeren', 'bonbon', 'feder', 'fledermaus'], kater: 'lila' },
  { id: 10, name: 'Mondschein', rezept: { mond: 1, feder: 2, stern: 1 }, regal: ['beeren', 'mond', 'frosch', 'feder', 'stern', 'pilz'], kater: 'winzig' },
  { id: 11, name: 'Flügelsuppe', rezept: { fledermaus: 2, frosch: 2, pilz: 1 }, regal: ['pilz', 'mond', 'fledermaus', 'apfel', 'frosch', 'bonbon'], kater: 'fluegel' },
  { id: 12, name: 'Kürbisfest', rezept: { kuerbis: 3, apfel: 1, bonbon: 1 }, regal: ['bonbon', 'feder', 'kuerbis', 'beeren', 'apfel', 'stern', 'frosch'], kater: 'kuerbis' },
  { id: 13, name: 'Schlaf, Kätzchen', rezept: { mond: 2, stern: 2, feder: 1, beeren: 1 }, regal: ['stern', 'pilz', 'mond', 'apfel', 'beeren', 'fledermaus', 'feder'], kater: 'winzig' },
  { id: 14, name: 'Bunter Regenbogen', rezept: { bonbon: 2, beeren: 2, apfel: 1, frosch: 1 }, regal: ['frosch', 'bonbon', 'mond', 'kuerbis', 'apfel', 'feder', 'beeren', 'pilz'], kater: 'regenbogen' },
  { id: 15, name: 'Das große Zauberfest', rezept: { frosch: 1, kuerbis: 1, stern: 2, fledermaus: 1, mond: 1 }, regal: ['stern', 'apfel', 'fledermaus', 'beeren', 'frosch', 'pilz', 'mond', 'bonbon', 'kuerbis', 'feder'], kater: 'regenbogen', fest: true }
];

export const LEVEL_COUNT = LEVELS.length;
