// Schattenschritt – 24 Level in 3 Kapiteln (Karte nur Innenraum; der Rand wird automatisch ummauert).
// Zeichen: # Mauer, . Boden, , Schatten, S Start, Z Ausgang, o Münze, q Münze im Schatten, k Schlüssel, T Gittertor
// Wächter: a = d Wache | s Späher | k Krieger | m Magier, p = [x, y], b = Blick (N/O/S/W; mehrere = dreht sich jeden Zug),
//          r = Rundgang als Schritte ab p (läuft hin und zurück; endet er auf p, im Kreis).
// zuege = kürzester Weg zum Ausgang (3. Stern), geprüft vom Löser in tests/schattenschritt-sim.test.mjs.
// Entwürfe aus tools/schattenschritt-generator.mjs, ausgesucht und benannt von Hand.
export const LEVEL = [
  // ---------- Kapitel 1: Kerker ----------
  { name: 'Erste Schritte', zuege: 9, tipp: '<b>Wische</b> (oder Pfeiltasten), um ein Feld weit zu schleichen. Sammle die Münzen und erreiche die <b>leuchtende Luke</b>.',
    karte: ['.o#Z.', '...#.', '#.#..', '...#o', '.#...', 'o..#.', '#.S..'] },
  { name: 'Die Wache', zuege: 12, tipp: '<b>Rote Felder</b> sieht die Wache. Tritt nie hinein – geh außen herum.',
    karte: ['##Z.#', '..o..', '..#..', '.#..#', '...o#', '..#..', '....S'], w: [{ a: 'd', p: [3, 2], b: 'S' }] },
  { name: 'Von hinten', zuege: 10, tipp: 'Von hinten oder von der Seite kannst du eine Wache <b>ausschalten</b>: Geh einfach auf ihr Feld.',
    karte: ['...Z.', '#....', '#....', '#.#..', '#.#..', '.o#.#', 'o.#S#'], w: [{ a: 'd', p: [2, 1], b: 'O' }, { a: 'd', p: [4, 3], b: 'W' }] },
  { name: 'Wachwechsel', zuege: 13, tipp: 'Diese Wache <b>dreht sich</b> jeden Zug (gelber Pfeil). Pass den Moment ab, in dem sie wegschaut – notfalls mit <b>Warten</b>.',
    karte: ['.Z#..', '..##.', '..#.o', '.....', 'o..#.', '.##..', 'S....'], w: [{ a: 'd', p: [2, 4], b: 'OW' }] },
  { name: 'Rundgang', zuege: 17, tipp: 'Die Punkte zeigen den <b>Weg der Wache</b>: Sie geht jeden Zug ein Feld und schaut in Laufrichtung.',
    karte: ['###Z.', '...#.', 'o..#.', '.o...', '..##.', '.....', '..#..', '..#.S'], w: [{ a: 'd', p: [4, 3], r: 'NNN' }] },
  { name: 'Zwei Wachen', zuege: 14,
    karte: ['###.Z', '.....', '..#..', '..#.o', '.o.#.', '...#.', '.#...', '#...S'], w: [{ a: 'd', p: [4, 2], r: 'SS' }, { a: 'd', p: [2, 4], b: 'NOSW' }] },
  { name: 'Geduld', zuege: 18,
    karte: ['#..#Z', '##.#.', '#..#o', '#.#..', '.....', 'o.#..', '...#.', '...S.'], w: [{ a: 'd', p: [4, 5], r: 'NNNN' }, { a: 'd', p: [4, 4], r: 'SS' }] },
  { name: 'Kerkermeister', zuege: 19,
    karte: ['###.Z.', '..#...', '...##.', '##o...', 'o..#..', '...#..', 'o...#.', '......', '#..#.S'], w: [{ a: 'd', p: [2, 8], r: 'NNNN' }, { a: 'd', p: [5, 4], b: 'NSO' }, { a: 'd', p: [1, 5], b: 'S' }] },

  // ---------- Kapitel 2: Gruft ----------
  { name: 'Im Schatten', zuege: 16, tipp: 'Auf <b>dunklen Feldern</b> sieht man dich nur aus nächster Nähe – ein Feld weit.',
    karte: ['...Z.', '...o.', '.....', ',##..', ',o#..', '.##..', ',,#.#', '...S.'], w: [{ a: 'd', p: [1, 2], b: 'O' }, { a: 'd', p: [0, 2], b: 'WOS' }] },
  { name: 'Dunkle Ecken', zuege: 14,
    karte: ['##..Z.', '..,...', '##,,..', '.#..#.', '....o#', '.##,.#', '.o.,..', '.S..o,'], w: [{ a: 'd', p: [3, 0], r: 'SS' }, { a: 'd', p: [3, 4], b: 'O' }, { a: 'd', p: [2, 0], b: 'WOS' }] },
  { name: 'Der Schlüssel', zuege: 16, tipp: 'Hol den <b>Schlüssel</b> – dann öffnet sich das Gittertor.',
    karte: ['..Z.#', '....#', '.#...', '.#o..', '.#.##', '..T..', '.#...', 'o#kS.'], w: [{ a: 'd', p: [2, 1], r: 'SS' }, { a: 'd', p: [4, 5], b: 'W' }] },
  { name: 'Gepanzert', zuege: 13, tipp: '<b>Skelett-Krieger</b> tragen Rüstung: Ausschalten geht nicht. Dafür sehen sie nur 2 Felder weit.',
    karte: ['#Z...', '#....', '#....', '.....', '.....', '...#.', '..###', 'oS.o#'], w: [{ a: 'k', p: [0, 3], r: 'OOOO' }, { a: 'd', p: [4, 2], b: 'W' }] },
  { name: 'Eiserne Runde', zuege: 15,
    karte: ['Z....', 'o....', '....#', '.....', '...#.', '#.##.', '#o...', '#S..#'], w: [{ a: 'k', p: [3, 2], r: 'NN' }, { a: 'd', p: [1, 3], b: 'S' }] },
  { name: 'Gittergang', zuege: 22,
    karte: ['.Z#.o', 'o.#..', '...#.', '.#.#k', 'T#...', '..#..', '#....', '#.S..'], w: [{ a: 'd', p: [4, 2], r: 'SS' }, { a: 'd', p: [1, 1], b: 'S' }] },
  { name: 'Doppelwache', zuege: 22,
    karte: ['Z#...o', '.#..##', ',,..##', ',...,o', '...#..', 'o.....', ',.##..', ',..#..', ',..S.#'], w: [{ a: 'k', p: [4, 6], b: 'NSO' }, { a: 'k', p: [2, 3], r: 'SS' }, { a: 'd', p: [2, 4], b: 'W' }] },
  { name: 'Knochenhalle', zuege: 22,
    karte: ['..Z#.#', '.o.#..', '......', '.###.o', '..##.k', '.T....', ',..#..', ',..#.o', '#..S#,'], w: [{ a: 'k', p: [4, 2], r: 'WWW' }, { a: 'd', p: [1, 2], r: 'NN' }, { a: 'd', p: [1, 4], b: 'OW' }] },

  // ---------- Kapitel 3: Turm ----------
  { name: 'Der Späher', zuege: 16, tipp: '<b>Späher</b> sehen 5 Felder weit. Von hinten schaltest du sie trotzdem aus.',
    karte: ['Z.##.', '.....', '.....', 'o#...', '.#...', '....#', '..#..', '.#o..', 'S#...'], w: [{ a: 's', p: [4, 1], b: 'W' }, { a: 's', p: [1, 0], b: 'SWNO' }] },
  { name: 'Weitblick', zuege: 18,
    karte: ['.oZo.', '.....', '...##', '..#..', '..#..', '.##..', '.....', '.....', '#S..#'], w: [{ a: 's', p: [4, 6], b: 'W' }, { a: 's', p: [2, 2], b: 'SWNO' }] },
  { name: 'Der Magier', zuege: 15, tipp: '<b>Magier</b> sehen in alle vier Richtungen (2 Felder) und lassen sich nicht ausschalten. Schräg daneben bist du sicher.',
    karte: [',,..Z', '.,...', '.....', '.###.', '.....', '.,..o', '.##..', 'o##.S'], w: [{ a: 'm', p: [4, 1], b: 'S' }, { a: 'd', p: [4, 2], r: 'SSS' }] },
  { name: 'Zauberstube', zuege: 18,
    karte: ['Z..o.', '.....', '..,#.', '#....', '..#..', '..#..', '.,o#.', 'S,.##'], w: [{ a: 'm', p: [0, 1], b: 'W' }, { a: 'd', p: [4, 3], r: 'WWW' }] },
  { name: 'Turmtreppe', zuege: 20,
    karte: ['o#.#Z.', '.#,,,#', '..o..#', '.#...#', '......', '.##.,.', '.,,.,.', 'o#,.,.', '..#..S'], w: [{ a: 'm', p: [4, 3], b: 'O' }, { a: 's', p: [0, 4], b: 'SWNO' }, { a: 'k', p: [3, 4], r: 'WW' }] },
  { name: 'Sternwarte', zuege: 23,
    karte: ['..Z.oo', '.#.#.#', ',.....', '.,,#..', ',#,#.#', '.#...#', '..#...', 'o...#.', '....S.'], w: [{ a: 'm', p: [0, 1], b: 'O' }, { a: 's', p: [1, 2], b: 'OW' }, { a: 'k', p: [2, 1], r: 'SS' }] },
  { name: 'Turmspitze', zuege: 19,
    karte: [',o..TZ', '..#.#.', '##.k##', '#....#', '..o,,,', '..#...', '...#..', '....,.', '#..#,,', '...So.'], w: [{ a: 'm', p: [4, 6], b: 'S' }, { a: 's', p: [3, 0], r: 'WW' }, { a: 'k', p: [1, 6], b: 'NOSW' }, { a: 'd', p: [4, 3], r: 'SS' }] },
  { name: 'Meisterdieb', zuege: 22,
    karte: ['o,Z..o', '#o#..#', '....,.', '..##,,', '...##T', '...#..', ',.....', ',.#.##', 'k.....', 'S##...'], w: [{ a: 'm', p: [2, 5], b: 'S' }, { a: 's', p: [4, 6], r: 'WW' }, { a: 'k', p: [5, 6], b: 'NOSW' }, { a: 'd', p: [1, 5], r: 'NNN' }] },
];
