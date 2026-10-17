// 30 handgebaute Level. Etage 0 ist unten. x läuft von 0 (links) bis 900 (rechts).
// floors: Plattform-Stücke je Etage · ladders: {f, x} verbindet Etage f mit f+1 (hidden: erst nach Hebel)
// friends: genau 3 · door: Baumhaustür auf der obersten Etage · monsters/fruits/levers/nuts: Hindernisse
// tip: wird vor jedem Level gezeigt (Symbol + kurzer Satz)
const F = [[40, 860]];
const fl = (n, gaps = {}) => Array.from({ length: n }, (_, i) => gaps[i] || F);
const nut = (f, x, period = 150, offset = 0) => ({ f, x, period, offset });

export const LEVELS = [
  { name: 'Hallo, Freunde!', tip: { icon: '👆', text: 'Finger auflegen und ziehen' },
    floors: fl(1), start: { f: 0, x: 90 }, door: { x: 705 }, ladders: [],
    friends: [{ f: 0, x: 280 }, { f: 0, x: 440 }, { f: 0, x: 580 }] },

  { name: 'Die erste Leiter', tip: { icon: '🪜', text: 'An der Leiter nach oben ziehen' },
    floors: fl(2), start: { f: 0, x: 90 }, door: { x: 195 }, ladders: [{ f: 0, x: 760 }],
    friends: [{ f: 0, x: 420 }, { f: 1, x: 620 }, { f: 1, x: 330 }] },

  { name: 'Auch mal runter', tip: { icon: '⬇️', text: 'Leitern gehen auch nach unten' },
    floors: fl(3), start: { f: 1, x: 450 }, door: { x: 195 }, ladders: [{ f: 0, x: 140 }, { f: 1, x: 780 }],
    friends: [{ f: 0, x: 620 }, { f: 1, x: 610 }, { f: 2, x: 450 }] },

  { name: 'Zickzack', tip: { icon: '↔️', text: 'Hoch, rüber, wieder hoch!' },
    floors: fl(4), start: { f: 0, x: 100 }, door: { x: 195 }, ladders: [{ f: 0, x: 780 }, { f: 1, x: 120 }, { f: 2, x: 780 }],
    friends: [{ f: 1, x: 450 }, { f: 2, x: 620 }, { f: 3, x: 420 }] },

  { name: 'Die Lücke', tip: { icon: '🕳️', text: 'Lücke im Boden? Nimm einen anderen Weg' },
    floors: fl(4, { 1: [[40, 420], [520, 860]] }), start: { f: 0, x: 100 }, door: { x: 195 },
    ladders: [{ f: 0, x: 300 }, { f: 0, x: 700 }, { f: 1, x: 150 }, { f: 2, x: 760 }],
    friends: [{ f: 1, x: 800 }, { f: 2, x: 450 }, { f: 3, x: 300 }] },

  { name: 'Psst, Schlafmonster', tip: { icon: '🍊', text: 'Bring dem Monster eine Frucht' },
    floors: fl(3), start: { f: 0, x: 100 }, door: { x: 195 }, ladders: [{ f: 0, x: 200 }, { f: 1, x: 780 }],
    monsters: [{ f: 1, x: 470 }], fruits: [{ f: 0, x: 760 }],
    friends: [{ f: 0, x: 480 }, { f: 1, x: 300 }, { f: 2, x: 450 }] },

  { name: 'Kokosnuss!', tip: { icon: '🥥', text: 'Schatten am Boden? Kurz warten!' },
    floors: fl(3), start: { f: 0, x: 100 }, door: { x: 705 }, ladders: [{ f: 0, x: 800 }, { f: 1, x: 100 }],
    nuts: [nut(1, 450)], friends: [{ f: 0, x: 420 }, { f: 1, x: 260 }, { f: 2, x: 600 }] },

  { name: 'Der Hebel', tip: { icon: '🎚️', text: 'Hebel umlegen – eine Leiter erscheint' },
    floors: fl(3), start: { f: 0, x: 450 }, door: { x: 195 }, ladders: [{ f: 0, x: 100 }, { f: 1, x: 800, hidden: true }],
    levers: [{ f: 0, x: 800, ladder: 1 }], friends: [{ f: 0, x: 640 }, { f: 1, x: 300 }, { f: 2, x: 500 }] },

  { name: 'Erst die Frucht', tip: { icon: '🍊', text: 'Erst die Frucht, dann am Monster vorbei' },
    floors: fl(4, { 2: [[40, 380], [480, 860]] }), start: { f: 0, x: 100 }, door: { x: 195 },
    ladders: [{ f: 0, x: 150 }, { f: 1, x: 300 }, { f: 1, x: 780 }, { f: 2, x: 600 }],
    monsters: [{ f: 1, x: 520 }], fruits: [{ f: 2, x: 100 }],
    friends: [{ f: 0, x: 600 }, { f: 2, x: 220 }, { f: 3, x: 450 }] },

  { name: 'Zwei Kokosnüsse', tip: { icon: '🥥', text: 'Immer auf den Schatten achten' },
    floors: fl(4), start: { f: 0, x: 100 }, door: { x: 195 }, ladders: [{ f: 0, x: 800 }, { f: 1, x: 100 }, { f: 2, x: 800 }],
    nuts: [nut(1, 330, 160, 0), nut(1, 600, 160, 80), nut(3, 450, 150, 30)],
    friends: [{ f: 1, x: 470 }, { f: 2, x: 450 }, { f: 3, x: 650 }] },

  { name: 'Hebel ganz unten', tip: { icon: '🎚️', text: 'Der Hebel liegt ganz unten' },
    floors: fl(5), start: { f: 2, x: 450 }, door: { x: 705 },
    ladders: [{ f: 1, x: 120 }, { f: 0, x: 780 }, { f: 2, x: 780 }, { f: 3, x: 450, hidden: true }],
    levers: [{ f: 0, x: 150, ladder: 3 }], friends: [{ f: 1, x: 450 }, { f: 3, x: 640 }, { f: 4, x: 200 }] },

  { name: 'Zwei Monster', tip: { icon: '😴', text: 'Jedes Monster will eine Frucht' },
    floors: fl(5), start: { f: 0, x: 100 }, door: { x: 705 },
    ladders: [{ f: 0, x: 820 }, { f: 1, x: 100 }, { f: 2, x: 820 }, { f: 3, x: 100 }],
    monsters: [{ f: 1, x: 450 }, { f: 3, x: 450 }], fruits: [{ f: 0, x: 520 }, { f: 2, x: 480 }],
    friends: [{ f: 0, x: 300 }, { f: 2, x: 250 }, { f: 4, x: 600 }] },

  { name: 'Sackgassen', tip: { icon: '🔍', text: 'Freunde warten auch in Sackgassen' },
    floors: fl(5, { 1: [[40, 400], [500, 860]], 3: [[40, 400], [500, 860]] }), start: { f: 0, x: 100 }, door: { x: 195 },
    ladders: [{ f: 0, x: 250 }, { f: 1, x: 120 }, { f: 2, x: 700 }, { f: 3, x: 800 }, { f: 0, x: 700 }, { f: 2, x: 300 }],
    friends: [{ f: 1, x: 780 }, { f: 3, x: 150 }, { f: 4, x: 450 }] },

  { name: 'Kokosregen', tip: { icon: '⏳', text: 'Warte, bis die Nuss gefallen ist' },
    floors: fl(5), start: { f: 0, x: 450 }, door: { x: 195 },
    ladders: [{ f: 0, x: 100 }, { f: 1, x: 800 }, { f: 2, x: 100 }, { f: 3, x: 800 }],
    nuts: [nut(0, 260, 150, 0), nut(1, 450, 140, 40), nut(2, 450, 140, 100), nut(3, 300, 150, 20), nut(3, 600, 150, 95)],
    friends: [{ f: 1, x: 620 }, { f: 2, x: 250 }, { f: 4, x: 450 }] },

  { name: 'Erst nach unten', tip: { icon: '⬇️', text: 'Diesmal geht es erst nach unten' },
    floors: fl(5), start: { f: 4, x: 120 }, door: { x: 705 },
    ladders: [{ f: 3, x: 450 }, { f: 2, x: 120 }, { f: 1, x: 780, hidden: true }, { f: 0, x: 450 }],
    levers: [{ f: 2, x: 620, ladder: 2 }], monsters: [{ f: 1, x: 620 }], fruits: [{ f: 3, x: 800 }],
    friends: [{ f: 2, x: 800 }, { f: 1, x: 250 }, { f: 0, x: 800 }] },

  { name: 'Lange Wege', tip: { icon: '🗺️', text: 'Schau erst, dann lauf los' },
    floors: fl(5, { 2: [[40, 330], [430, 860]], 4: [[40, 500]] }), start: { f: 0, x: 100 }, door: { x: 195 },
    ladders: [{ f: 0, x: 700 }, { f: 1, x: 200 }, { f: 2, x: 780 }, { f: 3, x: 300 }, { f: 1, x: 600 }],
    monsters: [{ f: 3, x: 540 }], fruits: [{ f: 2, x: 100 }],
    friends: [{ f: 0, x: 300 }, { f: 2, x: 500 }, { f: 4, x: 420 }] },

  { name: 'Hebel in der Sackgasse', tip: { icon: '🎚️', text: 'Der Hebel versteckt sich in einer Sackgasse' },
    floors: fl(5, { 1: [[40, 480], [580, 860]] }), start: { f: 0, x: 450 }, door: { x: 195 },
    ladders: [{ f: 0, x: 120 }, { f: 0, x: 760 }, { f: 1, x: 800 }, { f: 2, x: 120 }, { f: 3, x: 780, hidden: true }],
    levers: [{ f: 1, x: 300, ladder: 4 }], friends: [{ f: 1, x: 420 }, { f: 2, x: 600 }, { f: 4, x: 450 }] },

  { name: 'Monster-Wache', tip: { icon: '🛡️', text: 'Ein Freund wird bewacht' },
    floors: fl(5), start: { f: 0, x: 100 }, door: { x: 705 },
    ladders: [{ f: 0, x: 800 }, { f: 1, x: 450 }, { f: 2, x: 800 }, { f: 3, x: 100 }],
    monsters: [{ f: 1, x: 280 }], fruits: [{ f: 3, x: 650 }],
    friends: [{ f: 1, x: 100 }, { f: 2, x: 300 }, { f: 4, x: 600 }] },

  { name: 'Hebel und Nüsse', tip: { icon: '🎚️', text: 'Erst Hebel, dann Leiter' },
    floors: fl(5), start: { f: 0, x: 100 }, door: { x: 705 },
    ladders: [{ f: 0, x: 450 }, { f: 1, x: 120 }, { f: 1, x: 800 }, { f: 2, x: 450, hidden: true }, { f: 3, x: 120 }, { f: 3, x: 800 }],
    levers: [{ f: 0, x: 820, ladder: 3 }], nuts: [nut(2, 280, 150, 0), nut(2, 640, 150, 75), nut(4, 450, 140, 20)],
    friends: [{ f: 1, x: 650 }, { f: 2, x: 790 }, { f: 4, x: 300 }] },

  { name: 'Alles zusammen', tip: { icon: '⭐', text: 'Frucht, Hebel, Nuss – du kennst alles!' },
    floors: fl(5, { 1: [[40, 420], [520, 860]] }), start: { f: 2, x: 400 }, door: { x: 705 },
    ladders: [{ f: 1, x: 120 }, { f: 0, x: 300 }, { f: 0, x: 760 }, { f: 1, x: 560 }, { f: 2, x: 835 }, { f: 3, x: 120, hidden: true }],
    levers: [{ f: 1, x: 720, ladder: 5 }], monsters: [{ f: 2, x: 705 }], fruits: [{ f: 0, x: 500 }], nuts: [nut(3, 450, 150, 40)],
    friends: [{ f: 1, x: 250 }, { f: 0, x: 640 }, { f: 4, x: 600 }] },

  { name: 'Sechs Etagen', tip: { icon: '🌳', text: 'Ganz nach oben!' },
    floors: fl(6), start: { f: 0, x: 100 }, door: { x: 195 },
    ladders: [{ f: 0, x: 800 }, { f: 1, x: 100 }, { f: 2, x: 800 }, { f: 3, x: 100 }, { f: 4, x: 800 }],
    nuts: [nut(1, 450, 150, 0), nut(3, 450, 150, 60)],
    friends: [{ f: 1, x: 250 }, { f: 3, x: 650 }, { f: 5, x: 450 }] },

  { name: 'Eine Frucht zur Zeit', tip: { icon: '✋', text: 'Du kannst nur eine Frucht tragen' },
    floors: fl(6), start: { f: 0, x: 450 }, door: { x: 705 },
    ladders: [{ f: 0, x: 120 }, { f: 1, x: 800 }, { f: 2, x: 120 }, { f: 3, x: 800 }, { f: 4, x: 120 }, { f: 0, x: 800 }],
    monsters: [{ f: 2, x: 460 }, { f: 4, x: 460 }], fruits: [{ f: 1, x: 450 }, { f: 0, x: 640 }],
    friends: [{ f: 1, x: 650 }, { f: 3, x: 300 }, { f: 5, x: 600 }] },

  { name: 'Hebel-Kette', tip: { icon: '🔗', text: 'Ein Hebel öffnet den Weg zum nächsten' },
    floors: fl(6, { 2: [[40, 400], [500, 860]] }), start: { f: 0, x: 450 }, door: { x: 195 },
    ladders: [{ f: 0, x: 120 }, { f: 1, x: 800 }, { f: 1, x: 300, hidden: true }, { f: 2, x: 780 }, { f: 3, x: 450 }, { f: 4, x: 800, hidden: true }],
    levers: [{ f: 2, x: 620, ladder: 2 }, { f: 3, x: 100, ladder: 5 }],
    friends: [{ f: 2, x: 280 }, { f: 4, x: 600 }, { f: 5, x: 450 }] },

  { name: 'Nussallee', tip: { icon: '🥁', text: 'Achte auf den Rhythmus' },
    floors: fl(6), start: { f: 0, x: 100 }, door: { x: 195 },
    ladders: [{ f: 0, x: 800 }, { f: 1, x: 120 }, { f: 2, x: 800 }, { f: 3, x: 120 }, { f: 4, x: 800 }],
    nuts: [nut(0, 450, 140, 0), nut(1, 330, 160, 40), nut(1, 600, 160, 120), nut(2, 450, 120, 30), nut(3, 300, 150, 0), nut(3, 600, 150, 75), nut(4, 450, 130, 60)],
    friends: [{ f: 1, x: 465 }, { f: 3, x: 450 }, { f: 5, x: 600 }] },

  { name: 'Frucht im Keller', tip: { icon: '🍊', text: 'Die Frucht liegt ganz unten' },
    floors: fl(6), start: { f: 5, x: 120 }, door: { x: 705 },
    ladders: [{ f: 4, x: 300 }, { f: 3, x: 800 }, { f: 2, x: 120 }, { f: 1, x: 800 }, { f: 0, x: 450 }],
    monsters: [{ f: 5, x: 540 }], fruits: [{ f: 0, x: 800 }], nuts: [nut(2, 450, 150, 0)],
    friends: [{ f: 3, x: 450 }, { f: 1, x: 280 }, { f: 0, x: 120 }] },

  { name: 'Labyrinth', tip: { icon: '🧭', text: 'Viele Wege – finde den richtigen' },
    floors: [F, [[40, 380], [480, 860]], [[40, 560], [660, 860]], [[40, 300], [400, 860]], [[40, 600], [700, 860]], F],
    start: { f: 0, x: 450 }, door: { x: 450 },
    ladders: [{ f: 0, x: 200 }, { f: 0, x: 780 }, { f: 1, x: 100 }, { f: 1, x: 520 }, { f: 2, x: 760 }, { f: 2, x: 200 },
      { f: 3, x: 500 }, { f: 3, x: 780 }, { f: 4, x: 100 }, { f: 4, x: 800 }, { f: 2, x: 440 }],
    nuts: [nut(5, 250, 150, 0)],
    friends: [{ f: 3, x: 110 }, { f: 2, x: 820 }, { f: 1, x: 800 }] },

  { name: 'Wache am Baumhaus', tip: { icon: '🏠', text: 'Spar dir die Frucht für ganz oben auf' },
    floors: fl(6, { 3: [[40, 420], [520, 860]] }), start: { f: 0, x: 450 }, door: { x: 705 },
    ladders: [{ f: 0, x: 120 }, { f: 1, x: 800 }, { f: 2, x: 200 }, { f: 2, x: 700, hidden: true }, { f: 3, x: 780 }, { f: 4, x: 120 }],
    levers: [{ f: 3, x: 80, ladder: 3 }], monsters: [{ f: 5, x: 450 }], fruits: [{ f: 3, x: 350 }],
    nuts: [nut(2, 450, 150, 0), nut(4, 300, 140, 50)],
    friends: [{ f: 1, x: 450 }, { f: 3, x: 640 }, { f: 4, x: 520 }] },

  { name: 'Pendelweg', tip: { icon: '🔁', text: 'Zwei Monster, zwei Früchte – hin und her' },
    floors: fl(6), start: { f: 2, x: 450 }, door: { x: 705 },
    ladders: [{ f: 2, x: 120 }, { f: 3, x: 800 }, { f: 4, x: 120 }, { f: 1, x: 800 }, { f: 0, x: 120 }],
    monsters: [{ f: 3, x: 450 }, { f: 5, x: 470 }], fruits: [{ f: 0, x: 800 }, { f: 1, x: 320 }], nuts: [nut(4, 450, 150, 0)],
    friends: [{ f: 0, x: 450 }, { f: 4, x: 650 }, { f: 5, x: 250 }] },

  { name: 'Kokos-Kaskade', tip: { icon: '🌧️', text: 'Hebel, Nüsse, Lücken – du schaffst das!' },
    floors: fl(6, { 2: [[40, 380], [480, 860]], 4: [[40, 420], [520, 860]] }), start: { f: 0, x: 120 }, door: { x: 705 },
    ladders: [{ f: 0, x: 800 }, { f: 1, x: 200 }, { f: 1, x: 700, hidden: true }, { f: 2, x: 780 }, { f: 3, x: 120 }, { f: 4, x: 300 }, { f: 3, x: 780 }],
    levers: [{ f: 2, x: 80, ladder: 2 }], nuts: [nut(1, 450, 150, 0), nut(3, 450, 140, 50), nut(5, 460, 130, 40)],
    friends: [{ f: 2, x: 330 }, { f: 4, x: 700 }, { f: 5, x: 650 }] },

  { name: 'Das große Finale', tip: { icon: '🏆', text: 'Das große Finale!' },
    floors: fl(6, { 1: [[40, 420], [520, 860]], 4: [[40, 380], [480, 860]] }), start: { f: 0, x: 450 }, door: { x: 705 },
    ladders: [{ f: 0, x: 120 }, { f: 0, x: 780 }, { f: 1, x: 300 }, { f: 2, x: 800 }, { f: 3, x: 120 }, { f: 4, x: 250, hidden: true }, { f: 3, x: 700 }],
    levers: [{ f: 4, x: 820, ladder: 5 }], monsters: [{ f: 2, x: 550 }, { f: 5, x: 560 }], fruits: [{ f: 1, x: 680 }, { f: 3, x: 420 }],
    nuts: [nut(3, 270, 150, 0), nut(5, 380, 140, 40)],
    friends: [{ f: 1, x: 800 }, { f: 4, x: 640 }, { f: 5, x: 740 }] }
];
export const LEVEL_COUNT = LEVELS.length;
