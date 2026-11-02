// 150 handgebaute Level. Etage 0 ist unten. x läuft von 0 (links) bis 900 (rechts).
// floors: Plattform-Stücke je Etage · ladders: {f, x} verbindet Etage f mit f+1 (hidden: erst nach Hebel)
// friends: genau 3 · door: Baumhaustür auf der obersten Etage · monsters/fruits/levers/nuts: Hindernisse
// tip: wird vor jedem Level gezeigt (Symbol + kurzer Satz)
const F = [[40, 860]];
const fl = (n, gaps = {}) => Array.from({ length: n }, (_, i) => gaps[i] || F);
const nut = (f, x, period = 150, offset = 0) => ({ f, x, period, offset });
// Neu ab Level 31: gap = Etage mit Lücke von a bis b · bridge = Fahr-Brücke über diese Lücke · slide = Rutsche (Einstieg auf Etage f+1) · waker = Wechsel-Monster
const gap = (a, b) => [[40, a], [b, 860]];
const bridge = (f, a, b, period = 300, offset = 0) => ({ f, a, b, period, offset });
const slide = (f, x, dir = 1) => ({ f, x, dir });
const waker = (f, x, period = 300, offset = 0) => ({ f, x, period, offset });
// Neu ab Level 61: balloon = Heißluftballon (steigt von Etage f bei x up Etagen hoch, landet bei to) · neck = Langhals über der Lücke a–b (side 1: Körper rechts) · leaves = Blätter
const balloon = (f, x, up, to) => ({ f, x, up, to });
const neck = (f, a, b, side = 1) => ({ f, a, b, side });
// Neu ab Level 91: hole = Zauber-Baumhöhle (c: 0 blau, 1 rot, 2 gelb; je Farbe zwei) · rock = Felsbrocken · pit = Grube (Lücke, die ein Stein füllt)
// plate = Druckplatte (öffnet Tor gate) · gate = Rankentor · night: true + lamps = Nacht mit Laternen
const hole = (f, x, c) => ({ f, x, c });
const rock = (f, x) => ({ f, x });
const pit = (f, a, b) => ({ f, a, b });
const plate = (f, x, g = 0) => ({ f, x, gate: g });
const gate = (f, x) => ({ f, x });
const lamp = (f, x) => ({ f, x });
const P3 = (a1, b1, a2, b2) => [[40, a1], [b1, a2], [b2, 860]]; // Etage mit zwei Lücken

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
    friends: [{ f: 1, x: 800 }, { f: 4, x: 640 }, { f: 5, x: 740 }] },

  // ---------- Level 31–35: bekannte Dinge in neuen Wegen ----------
  { name: 'Neue Abenteuer', tip: { icon: '🌴', text: 'Neue Wege, neue Rätsel!' },
    floors: fl(4), start: { f: 0, x: 100 }, door: { x: 195 }, ladders: [{ f: 0, x: 780 }, { f: 1, x: 120 }, { f: 2, x: 780 }],
    friends: [{ f: 0, x: 450 }, { f: 1, x: 560 }, { f: 2, x: 330 }] },

  { name: 'Frucht für den Wächter', tip: { icon: '🍊', text: 'Frucht holen, dann am Monster vorbei' },
    floors: fl(4), start: { f: 0, x: 100 }, door: { x: 705 }, ladders: [{ f: 0, x: 800 }, { f: 1, x: 100 }, { f: 2, x: 800 }],
    monsters: [{ f: 1, x: 450 }], fruits: [{ f: 0, x: 300 }],
    friends: [{ f: 1, x: 280 }, { f: 2, x: 450 }, { f: 3, x: 300 }] },

  { name: 'Nüsse und Hebel', tip: { icon: '🎚️', text: 'Hebel umlegen, Nüsse austricksen' },
    floors: fl(5), start: { f: 0, x: 450 }, door: { x: 195 },
    ladders: [{ f: 0, x: 120 }, { f: 1, x: 800 }, { f: 2, x: 120, hidden: true }, { f: 3, x: 800 }],
    levers: [{ f: 2, x: 620, ladder: 2 }], nuts: [nut(1, 450, 150, 0), nut(3, 450, 140, 50)],
    friends: [{ f: 1, x: 620 }, { f: 2, x: 300 }, { f: 4, x: 450 }] },

  { name: 'Zwei Wächter', tip: { icon: '😴', text: 'Zwei Monster, zwei Früchte' },
    floors: fl(5), start: { f: 0, x: 450 }, door: { x: 195 },
    ladders: [{ f: 0, x: 100 }, { f: 1, x: 800 }, { f: 2, x: 100 }, { f: 3, x: 800 }],
    monsters: [{ f: 1, x: 450 }, { f: 3, x: 450 }], fruits: [{ f: 0, x: 700 }, { f: 2, x: 600 }],
    friends: [{ f: 0, x: 300 }, { f: 2, x: 250 }, { f: 4, x: 600 }] },

  { name: 'Inselhüpfen', tip: { icon: '🏝️', text: 'Der Hebel liegt auf einer Insel' },
    floors: fl(5, { 1: gap(400, 520), 3: gap(400, 520) }), start: { f: 0, x: 450 }, door: { x: 705 },
    ladders: [{ f: 0, x: 120 }, { f: 0, x: 780 }, { f: 1, x: 700, hidden: true }, { f: 2, x: 150 }, { f: 2, x: 780 }, { f: 3, x: 700 }],
    levers: [{ f: 1, x: 330, ladder: 2 }], monsters: [{ f: 4, x: 480 }], fruits: [{ f: 0, x: 300 }], nuts: [nut(2, 450, 150, 0)],
    friends: [{ f: 1, x: 220 }, { f: 3, x: 250 }, { f: 4, x: 250 }] },

  // ---------- Level 36–42: die Rutsche ----------
  { name: 'Die Rutsche', tip: { icon: '🛝', text: 'Am Rutschenanfang nach unten ziehen' },
    floors: [F, F, gap(420, 520)], start: { f: 2, x: 100 }, door: { x: 705 },
    ladders: [{ f: 0, x: 200 }, { f: 1, x: 780 }], slides: [slide(1, 330)],
    friends: [{ f: 2, x: 180 }, { f: 1, x: 450 }, { f: 0, x: 560 }] },

  { name: 'Rutsch-Kette', tip: { icon: '⛓️', text: 'Eine Rutsche führt zur nächsten' },
    floors: [F, F, F, gap(380, 480)], start: { f: 3, x: 100 }, door: { x: 705 },
    ladders: [{ f: 0, x: 700 }, { f: 1, x: 780 }, { f: 2, x: 600 }], slides: [slide(2, 300), slide(1, 560, -1)],
    friends: [{ f: 3, x: 180 }, { f: 1, x: 480 }, { f: 0, x: 300 }] },

  { name: 'Rutsche nach links', tip: { icon: '↙️', text: 'Rutschen gehen auch nach links' },
    floors: [F, F, F, gap(420, 520)], start: { f: 3, x: 800 }, door: { x: 195 },
    ladders: [{ f: 0, x: 700 }, { f: 1, x: 200 }, { f: 2, x: 120 }], slides: [slide(2, 800, -1)],
    friends: [{ f: 3, x: 640 }, { f: 1, x: 600 }, { f: 0, x: 300 }] },

  { name: 'Rutsche am Monster vorbei', tip: { icon: '🛝', text: 'Rutsche runter, Frucht für später' },
    floors: fl(4), start: { f: 3, x: 100 }, door: { x: 705 },
    ladders: [{ f: 0, x: 600 }, { f: 1, x: 800 }, { f: 2, x: 120 }], slides: [slide(2, 350)],
    monsters: [{ f: 3, x: 540 }], fruits: [{ f: 3, x: 200 }],
    friends: [{ f: 2, x: 450 }, { f: 1, x: 300 }, { f: 3, x: 780 }] },

  { name: 'Rutsche und Nüsse', tip: { icon: '🥥', text: 'Nach der Rutsche gut aufpassen' },
    floors: fl(5), start: { f: 4, x: 100 }, door: { x: 705 },
    ladders: [{ f: 0, x: 150 }, { f: 1, x: 100 }, { f: 2, x: 800 }, { f: 3, x: 800 }], slides: [slide(3, 300), slide(1, 700, -1)],
    nuts: [nut(3, 690, 150, 0), nut(2, 450, 140, 40)],
    friends: [{ f: 3, x: 420 }, { f: 1, x: 300 }, { f: 0, x: 450 }] },

  { name: 'Doppelrutsche', tip: { icon: '🎢', text: 'Rutsche, Rutsche, Rutsche!' },
    floors: fl(5), start: { f: 4, x: 100 }, door: { x: 705 },
    ladders: [{ f: 0, x: 120 }, { f: 1, x: 800 }, { f: 2, x: 120 }, { f: 3, x: 800 }],
    slides: [slide(3, 150), slide(2, 480), slide(1, 620, -1)],
    friends: [{ f: 3, x: 500 }, { f: 1, x: 300 }, { f: 0, x: 600 }] },

  { name: 'Rutschen-Labyrinth', tip: { icon: '🧭', text: 'Rutsche, Hebel und ein Monster' },
    floors: fl(6), start: { f: 5, x: 100 }, door: { x: 705 },
    ladders: [{ f: 0, x: 800 }, { f: 1, x: 120 }, { f: 2, x: 800 }, { f: 3, x: 120, hidden: true }, { f: 4, x: 800 }],
    slides: [slide(4, 300), slide(3, 640, -1)],
    levers: [{ f: 3, x: 250, ladder: 3 }], monsters: [{ f: 2, x: 450 }], fruits: [{ f: 3, x: 700 }],
    friends: [{ f: 3, x: 560 }, { f: 2, x: 250 }, { f: 1, x: 500 }] },

  // ---------- Level 43–49: die Fahr-Brücke ----------
  { name: 'Die Fahr-Brücke', tip: { icon: '🪵', text: 'Steig auf, wenn die Brücke anlegt' },
    floors: [gap(230, 550)], bridges: [bridge(0, 230, 550)], start: { f: 0, x: 100 }, door: { x: 800 }, ladders: [],
    friends: [{ f: 0, x: 150 }, { f: 0, x: 640 }, { f: 0, x: 730 }] },

  { name: 'Brücke und Leiter', tip: { icon: '🪵', text: 'Erst die Brücke, dann die Leiter' },
    floors: [gap(230, 550), F], bridges: [bridge(0, 230, 550)], start: { f: 0, x: 100 }, door: { x: 195 }, ladders: [{ f: 0, x: 780 }],
    friends: [{ f: 0, x: 160 }, { f: 0, x: 660 }, { f: 1, x: 450 }] },

  { name: 'Brücke nach oben', tip: { icon: '🪵', text: 'Die Brücke fährt auch im ersten Stock' },
    floors: [F, gap(230, 550), F], bridges: [bridge(1, 230, 550, 330, 40)], start: { f: 0, x: 100 }, door: { x: 195 },
    ladders: [{ f: 0, x: 150 }, { f: 1, x: 780 }],
    friends: [{ f: 0, x: 600 }, { f: 1, x: 700 }, { f: 2, x: 450 }] },

  { name: 'Brücke und Nuss', tip: { icon: '🥥', text: 'Auf der Brücke ist es ruhig' },
    floors: [F, gap(230, 550), F], bridges: [bridge(1, 230, 550)], start: { f: 0, x: 450 }, door: { x: 705 },
    ladders: [{ f: 0, x: 120 }, { f: 1, x: 800 }], nuts: [nut(1, 660, 150, 0), nut(2, 450, 140, 60)],
    friends: [{ f: 0, x: 700 }, { f: 1, x: 160 }, { f: 2, x: 250 }] },

  { name: 'Zwei Brücken', tip: { icon: '🪵', text: 'Zwei Brücken, zwei Takte' },
    floors: [gap(230, 550), F, gap(300, 620), F], bridges: [bridge(0, 230, 550, 300, 0), bridge(2, 300, 620, 360, 90)],
    start: { f: 0, x: 100 }, door: { x: 195 }, ladders: [{ f: 0, x: 780 }, { f: 1, x: 120 }, { f: 2, x: 780 }],
    friends: [{ f: 0, x: 660 }, { f: 1, x: 450 }, { f: 3, x: 480 }] },

  { name: 'Brücke mit Hebel', tip: { icon: '🎚️', text: 'Hinter der Brücke wartet ein Hebel' },
    floors: [F, gap(230, 550), F, F], bridges: [bridge(1, 230, 550, 300, 120)], start: { f: 0, x: 450 }, door: { x: 705 },
    ladders: [{ f: 0, x: 120 }, { f: 1, x: 780 }, { f: 2, x: 120, hidden: true }],
    levers: [{ f: 1, x: 640, ladder: 2 }],
    friends: [{ f: 0, x: 700 }, { f: 2, x: 500 }, { f: 3, x: 300 }] },

  { name: 'Brücke und Monster', tip: { icon: '🍊', text: 'Frucht über die Brücke tragen' },
    floors: [F, gap(230, 550), F, F, F], bridges: [bridge(1, 230, 550, 330, 0)], start: { f: 0, x: 450 }, door: { x: 195 },
    ladders: [{ f: 0, x: 120 }, { f: 1, x: 780 }, { f: 2, x: 800 }, { f: 3, x: 120 }],
    monsters: [{ f: 2, x: 450 }], fruits: [{ f: 1, x: 150 }],
    friends: [{ f: 0, x: 700 }, { f: 2, x: 250 }, { f: 4, x: 500 }] },

  // ---------- Level 50–55: das Wechsel-Monster ----------
  { name: 'Wach oder Schlaf?', tip: { icon: '😴', text: 'Schläft es? Dann schnell vorbei!' },
    floors: fl(2), start: { f: 0, x: 100 }, door: { x: 195 }, ladders: [{ f: 0, x: 780 }], wakers: [waker(0, 450)],
    friends: [{ f: 0, x: 280 }, { f: 0, x: 650 }, { f: 1, x: 450 }] },

  { name: 'Zwei Schläfer', tip: { icon: '😴', text: 'Jedes Monster hat seinen eigenen Takt' },
    floors: fl(3), start: { f: 0, x: 100 }, door: { x: 705 }, ladders: [{ f: 0, x: 800 }, { f: 1, x: 100 }],
    wakers: [waker(0, 450, 300, 0), waker(1, 450, 260, 100)],
    friends: [{ f: 0, x: 280 }, { f: 1, x: 620 }, { f: 2, x: 300 }] },

  { name: 'Blinzeln heißt: Achtung', tip: { icon: '👀', text: 'Blinzelt es? Gleich wacht es auf!' },
    floors: fl(4), start: { f: 0, x: 100 }, door: { x: 195 }, ladders: [{ f: 0, x: 800 }, { f: 1, x: 100 }, { f: 2, x: 800 }],
    wakers: [waker(0, 450, 280, 0), waker(2, 450, 320, 150)], nuts: [nut(1, 450, 150, 0)],
    friends: [{ f: 0, x: 280 }, { f: 1, x: 620 }, { f: 3, x: 500 }] },

  { name: 'Monster-Mix', tip: { icon: '🍊', text: 'Ein Monster will Frucht, eins schläft nur' },
    floors: fl(4), start: { f: 0, x: 100 }, door: { x: 705 }, ladders: [{ f: 0, x: 800 }, { f: 1, x: 100 }, { f: 2, x: 800 }],
    monsters: [{ f: 1, x: 450 }], fruits: [{ f: 0, x: 300 }], wakers: [waker(2, 450, 300, 60)],
    friends: [{ f: 1, x: 280 }, { f: 2, x: 650 }, { f: 3, x: 300 }] },

  { name: 'Nuss-Wecker', tip: { icon: '⏳', text: 'Nüsse und Schläfer – wer ist schneller?' },
    floors: fl(5), start: { f: 0, x: 450 }, door: { x: 195 },
    ladders: [{ f: 0, x: 100 }, { f: 1, x: 800 }, { f: 2, x: 100 }, { f: 3, x: 800 }],
    wakers: [waker(1, 450, 300, 0), waker(3, 450, 280, 100)], nuts: [nut(2, 450, 140, 30), nut(4, 450, 150, 80)],
    friends: [{ f: 0, x: 700 }, { f: 2, x: 650 }, { f: 4, x: 600 }] },

  { name: 'Schlafwandler', tip: { icon: '🌙', text: 'Geduld: Warten gehört dazu' },
    floors: fl(5), start: { f: 4, x: 100 }, door: { x: 705 },
    ladders: [{ f: 0, x: 450 }, { f: 1, x: 120 }, { f: 2, x: 800 }, { f: 3, x: 120 }],
    wakers: [waker(0, 250, 300, 0), waker(0, 700, 300, 140), waker(2, 450, 260, 60)],
    monsters: [{ f: 3, x: 480 }], fruits: [{ f: 4, x: 400 }],
    friends: [{ f: 0, x: 76 }, { f: 1, x: 500 }, { f: 3, x: 300 }] },

  // ---------- Level 56–60: alles zusammen ----------
  { name: 'Rutschen-Wecker', tip: { icon: '🛝', text: 'Rutsche, Schläfer und ein Hebel' },
    floors: fl(5), start: { f: 4, x: 100 }, door: { x: 705 },
    ladders: [{ f: 0, x: 120 }, { f: 1, x: 800 }, { f: 2, x: 120, hidden: true }, { f: 3, x: 800 }],
    slides: [slide(3, 150), slide(1, 640, -1)], wakers: [waker(1, 620, 280, 90), waker(3, 600, 300, 0)],
    levers: [{ f: 3, x: 200, ladder: 2 }],
    friends: [{ f: 3, x: 330 }, { f: 1, x: 250 }, { f: 4, x: 600 }] },

  { name: 'Brücke, Hebel, Nuss', tip: { icon: '🪵', text: 'Alles auf einmal – du schaffst das!' },
    floors: [F, gap(230, 550), F, F, F], bridges: [bridge(1, 230, 550, 330, 60)], start: { f: 0, x: 450 }, door: { x: 705 },
    ladders: [{ f: 0, x: 120 }, { f: 1, x: 780 }, { f: 2, x: 120, hidden: true }, { f: 3, x: 800 }],
    levers: [{ f: 1, x: 660, ladder: 2 }], nuts: [nut(2, 450, 150, 0), nut(3, 450, 140, 50)], wakers: [waker(4, 450, 300, 0)],
    friends: [{ f: 1, x: 150 }, { f: 3, x: 300 }, { f: 4, x: 250 }] },

  { name: 'Rutsche über die Brücke', tip: { icon: '🪵', text: 'Rutsche und Brücke arbeiten zusammen' },
    floors: [gap(230, 550), F, F, F, gap(300, 620), F], bridges: [bridge(0, 230, 550, 300, 0), bridge(4, 300, 620, 360, 120)],
    start: { f: 5, x: 100 }, door: { x: 705 },
    ladders: [{ f: 0, x: 780 }, { f: 1, x: 120 }, { f: 2, x: 780 }, { f: 3, x: 120 }, { f: 4, x: 780 }],
    slides: [slide(4, 450, -1), slide(2, 400, -1)],
    friends: [{ f: 0, x: 160 }, { f: 3, x: 600 }, { f: 5, x: 300 }] },

  { name: 'Die ganze Bande', tip: { icon: '🌟', text: 'Alle Monster, Nüsse und Rutschen' },
    floors: fl(6, { 4: gap(400, 520) }), start: { f: 0, x: 100 }, door: { x: 705 },
    ladders: [{ f: 0, x: 800 }, { f: 1, x: 120 }, { f: 2, x: 800, hidden: true }, { f: 3, x: 620 }, { f: 4, x: 800 }, { f: 4, x: 350 }],
    slides: [slide(4, 100)], levers: [{ f: 1, x: 640, ladder: 2 }], monsters: [{ f: 1, x: 450 }], fruits: [{ f: 0, x: 350 }],
    wakers: [waker(5, 520, 300, 0)],
    friends: [{ f: 1, x: 250 }, { f: 3, x: 300 }, { f: 4, x: 200 }] },

  { name: 'Das Dschungel-Finale', tip: { icon: '🏆', text: 'Das allergrößte Finale!' },
    floors: [F, gap(230, 550), F, gap(380, 500), F, F], bridges: [bridge(1, 230, 550, 300, 0)],
    start: { f: 0, x: 450 }, door: { x: 705 },
    ladders: [{ f: 0, x: 780 }, { f: 1, x: 150, hidden: true }, { f: 2, x: 620 }, { f: 3, x: 150 }, { f: 3, x: 740 }, { f: 4, x: 820 }],
    slides: [slide(3, 560, -1)], levers: [{ f: 1, x: 640, ladder: 1 }], monsters: [{ f: 4, x: 380 }], fruits: [{ f: 2, x: 300 }],
    wakers: [waker(5, 450, 300, 0)], nuts: [nut(2, 450, 150, 0)],
    friends: [{ f: 3, x: 200 }, { f: 4, x: 200 }, { f: 5, x: 230 }] },

  // ---------- Level 61–64: Wiedersehen mit bekannten Sachen ----------
  { name: 'Alte Bekannte', tip: { icon: '👋', text: 'Alles, was du schon kannst' },
    floors: fl(4), start: { f: 0, x: 100 }, door: { x: 705 }, ladders: [{ f: 0, x: 800 }, { f: 1, x: 120 }, { f: 2, x: 800 }],
    monsters: [{ f: 1, x: 450 }], fruits: [{ f: 0, x: 450 }], wakers: [waker(2, 450, 300, 0)],
    friends: [{ f: 0, x: 250 }, { f: 1, x: 650 }, { f: 3, x: 300 }] },

  { name: 'Rutschen-Brücke', tip: { icon: '🛝', text: 'Rutsche runter, Brücke rüber' },
    floors: [gap(230, 550), F, F], bridges: [bridge(0, 230, 550, 300, 0)], start: { f: 2, x: 100 }, door: { x: 705 },
    ladders: [{ f: 0, x: 800 }, { f: 1, x: 120 }], slides: [slide(1, 300)],
    friends: [{ f: 0, x: 120 }, { f: 1, x: 450 }, { f: 2, x: 600 }] },

  { name: 'Hebel, Nuss und Schläfer', tip: { icon: '🎚️', text: 'Hebel suchen, Nüssen ausweichen' },
    floors: fl(4), start: { f: 0, x: 450 }, door: { x: 705 },
    ladders: [{ f: 0, x: 120 }, { f: 1, x: 800 }, { f: 2, x: 120, hidden: true }],
    levers: [{ f: 1, x: 300, ladder: 2 }], nuts: [nut(1, 550, 150, 0)], wakers: [waker(3, 450, 300, 60)],
    friends: [{ f: 0, x: 700 }, { f: 2, x: 500 }, { f: 3, x: 250 }] },

  { name: 'Brücke zum Monster', tip: { icon: '🍊', text: 'Frucht holen, Brücke fahren' },
    floors: [F, gap(230, 550), F, F], bridges: [bridge(1, 230, 550, 300, 0)], start: { f: 0, x: 450 }, door: { x: 705 },
    ladders: [{ f: 0, x: 120 }, { f: 1, x: 780 }, { f: 2, x: 150 }], monsters: [{ f: 2, x: 500 }], fruits: [{ f: 1, x: 150 }],
    friends: [{ f: 0, x: 700 }, { f: 1, x: 650 }, { f: 3, x: 450 }] },

  // ---------- Level 65–71: der Heißluftballon ----------
  { name: 'Der Heißluftballon', tip: { icon: '🎈', text: 'Am Ballon nach oben ziehen' },
    floors: [F, gap(340, 560)], start: { f: 0, x: 100 }, door: { x: 705 }, ladders: [], balloons: [balloon(0, 450, 1, 600)],
    friends: [{ f: 0, x: 250 }, { f: 0, x: 700 }, { f: 1, x: 800 }] },

  { name: 'Zwei Etagen hoch', tip: { icon: '🎈', text: 'Der Ballon fliegt zwei Etagen hoch' },
    floors: [F, gap(340, 560), gap(340, 560)], start: { f: 0, x: 100 }, door: { x: 195 },
    ladders: [{ f: 0, x: 800 }], balloons: [balloon(0, 450, 2, 300)],
    friends: [{ f: 0, x: 220 }, { f: 1, x: 700 }, { f: 2, x: 90 }] },

  { name: 'Die Ballon-Insel', tip: { icon: '🏝️', text: 'Der Ballon bringt dich auf die Insel' },
    floors: [F, gap(250, 450), F, F], start: { f: 0, x: 100 }, door: { x: 195 },
    ladders: [{ f: 0, x: 780 }, { f: 1, x: 120 }, { f: 2, x: 780 }], balloons: [balloon(0, 350, 1, 200)],
    friends: [{ f: 1, x: 700 }, { f: 2, x: 450 }, { f: 3, x: 330 }] },

  { name: 'Ballon und Nüsse', tip: { icon: '🥥', text: 'Vor dem Ballon fallen Nüsse' },
    floors: [F, F, gap(340, 560), F], start: { f: 0, x: 100 }, door: { x: 705 },
    ladders: [{ f: 0, x: 800 }, { f: 2, x: 120 }], balloons: [balloon(1, 450, 1, 300)],
    nuts: [nut(1, 650, 150, 0), nut(3, 450, 140, 40)],
    friends: [{ f: 0, x: 300 }, { f: 1, x: 200 }, { f: 3, x: 600 }] },

  { name: 'Zwei Ballone', tip: { icon: '🎈', text: 'Ein Ballon nach dem anderen' },
    floors: [F, gap(340, 560), F, gap(340, 560), F], start: { f: 0, x: 100 }, door: { x: 705 },
    ladders: [{ f: 1, x: 780 }, { f: 3, x: 120 }], balloons: [balloon(0, 450, 1, 600), balloon(2, 450, 1, 300)],
    friends: [{ f: 0, x: 220 }, { f: 2, x: 250 }, { f: 4, x: 450 }] },

  { name: 'Ballon und Hebel', tip: { icon: '🎚️', text: 'Fliegen, Hebel ziehen, rutschen' },
    floors: [F, gap(340, 560), F], start: { f: 0, x: 200 }, door: { x: 705 },
    ladders: [{ f: 0, x: 100 }, { f: 1, x: 280, hidden: true }], balloons: [balloon(0, 450, 1, 600)], slides: [slide(0, 700, -1)],
    levers: [{ f: 1, x: 820, ladder: 1 }],
    friends: [{ f: 0, x: 700 }, { f: 1, x: 640 }, { f: 2, x: 300 }] },

  { name: 'Hoch hinaus', tip: { icon: '🍊', text: 'Frucht mitnehmen und hochfliegen' },
    floors: [F, gap(340, 560), gap(340, 560), F, F], start: { f: 0, x: 100 }, door: { x: 705 },
    ladders: [{ f: 0, x: 120 }, { f: 2, x: 780 }, { f: 3, x: 120 }], balloons: [balloon(0, 450, 2, 600)],
    monsters: [{ f: 3, x: 450 }], fruits: [{ f: 2, x: 700 }],
    friends: [{ f: 1, x: 250 }, { f: 3, x: 250 }, { f: 4, x: 450 }] },

  // ---------- Level 72–78: der Langhals ----------
  { name: 'Der Langhals', tip: { icon: '🍃', text: 'Bring dem Langhals ein Blatt' },
    floors: [F, gap(240, 440)], start: { f: 0, x: 100 }, door: { x: 90 }, ladders: [{ f: 0, x: 800 }],
    necks: [neck(1, 240, 440)], leaves: [{ f: 0, x: 450 }],
    friends: [{ f: 0, x: 300 }, { f: 0, x: 600 }, { f: 1, x: 700 }] },

  { name: 'Blatt von oben', tip: { icon: '🍃', text: 'Das Blatt liegt eine Etage höher' },
    floors: [gap(240, 440), F, F], start: { f: 0, x: 800 }, door: { x: 705 }, ladders: [{ f: 0, x: 760 }, { f: 1, x: 120 }],
    necks: [neck(0, 240, 440)], leaves: [{ f: 1, x: 600 }],
    friends: [{ f: 0, x: 80 }, { f: 1, x: 300 }, { f: 2, x: 450 }] },

  { name: 'Langhals nach rechts', tip: { icon: '🦕', text: 'Dieser Langhals schaut nach rechts' },
    floors: [F, gap(460, 660)], start: { f: 0, x: 450 }, door: { x: 810 }, ladders: [{ f: 0, x: 120 }],
    necks: [neck(1, 460, 660, -1)], leaves: [{ f: 0, x: 650 }],
    friends: [{ f: 0, x: 300 }, { f: 0, x: 800 }, { f: 1, x: 200 }] },

  { name: 'Blatt oder Frucht?', tip: { icon: '🍊', text: 'Du kannst immer nur eins tragen' },
    floors: [F, F, gap(240, 440)], start: { f: 0, x: 100 }, door: { x: 90 }, ladders: [{ f: 0, x: 800 }, { f: 1, x: 780 }],
    monsters: [{ f: 1, x: 450 }], fruits: [{ f: 0, x: 300 }], necks: [neck(2, 240, 440)], leaves: [{ f: 0, x: 600 }],
    friends: [{ f: 0, x: 450 }, { f: 1, x: 150 }, { f: 2, x: 720 }] },

  { name: 'Zwei Langhälse', tip: { icon: '🦕', text: 'Jeder Langhals will ein Blatt' },
    floors: [F, gap(240, 440), F, gap(460, 660)], start: { f: 0, x: 100 }, door: { x: 820 },
    ladders: [{ f: 0, x: 800 }, { f: 1, x: 80 }, { f: 2, x: 200 }],
    necks: [neck(1, 240, 440), neck(3, 460, 660, -1)], leaves: [{ f: 0, x: 450 }, { f: 2, x: 450 }],
    friends: [{ f: 0, x: 300 }, { f: 1, x: 720 }, { f: 2, x: 700 }] },

  { name: 'Langhals und Schläfer', tip: { icon: '😴', text: 'Mit dem Blatt leise vorbei' },
    floors: [F, F, gap(240, 440)], start: { f: 0, x: 250 }, door: { x: 90 }, ladders: [{ f: 0, x: 120 }, { f: 1, x: 780 }],
    wakers: [waker(1, 450, 300, 0)], necks: [neck(2, 240, 440)], leaves: [{ f: 0, x: 700 }],
    friends: [{ f: 0, x: 450 }, { f: 1, x: 640 }, { f: 2, x: 720 }] },

  { name: 'Langhals-Turm', tip: { icon: '🗼', text: 'Zwei Blätter für zwei Langhälse' },
    floors: [gap(240, 440), F, gap(460, 660), F, F], start: { f: 0, x: 800 }, door: { x: 705 },
    ladders: [{ f: 0, x: 760 }, { f: 1, x: 150 }, { f: 2, x: 820 }, { f: 3, x: 120 }],
    necks: [neck(0, 240, 440), neck(2, 460, 660, -1)], leaves: [{ f: 1, x: 450 }, { f: 1, x: 700 }],
    friends: [{ f: 0, x: 80 }, { f: 3, x: 450 }, { f: 4, x: 300 }] },

  // ---------- Level 79–84: Ballon und Langhals zusammen ----------
  { name: 'Ballon zum Langhals', tip: { icon: '🎈', text: 'Mit dem Ballon zum Langhals' },
    floors: [F, gap(340, 560), gap(240, 440)], start: { f: 0, x: 100 }, door: { x: 90 },
    ladders: [{ f: 1, x: 800 }], balloons: [balloon(0, 450, 1, 600)], necks: [neck(2, 240, 440)], leaves: [{ f: 1, x: 700 }],
    friends: [{ f: 0, x: 220 }, { f: 1, x: 620 }, { f: 2, x: 720 }] },

  { name: 'Blatt im Ballon', tip: { icon: '🍃', text: 'Nimm das Blatt mit in den Ballon' },
    floors: [F, F, gap(340, 560), gap(240, 440)], start: { f: 0, x: 100 }, door: { x: 90 },
    ladders: [{ f: 0, x: 120 }, { f: 2, x: 800 }], balloons: [balloon(1, 450, 1, 600)], necks: [neck(3, 240, 440)], leaves: [{ f: 0, x: 700 }],
    friends: [{ f: 1, x: 250 }, { f: 2, x: 700 }, { f: 3, x: 720 }] },

  { name: 'Erst Hals, dann hoch', tip: { icon: '🦕', text: 'Erst der Langhals, dann der Ballon' },
    floors: [gap(240, 440), [[220, 860]], F], start: { f: 0, x: 800 }, door: { x: 705 },
    ladders: [{ f: 1, x: 780 }], balloons: [balloon(0, 100, 1, 250)], necks: [neck(0, 240, 440)], leaves: [{ f: 0, x: 720 }],
    friends: [{ f: 0, x: 820 }, { f: 1, x: 500 }, { f: 2, x: 300 }] },

  { name: 'Hin und her', tip: { icon: '↔️', text: 'Ballon hoch, Langhals rüber' },
    floors: [F, gap(340, 560), F, gap(460, 660)], start: { f: 0, x: 100 }, door: { x: 810 },
    ladders: [{ f: 1, x: 80 }, { f: 2, x: 200 }], balloons: [balloon(0, 450, 1, 300)], necks: [neck(3, 460, 660, -1)], leaves: [{ f: 2, x: 600 }],
    friends: [{ f: 0, x: 700 }, { f: 1, x: 220 }, { f: 2, x: 800 }] },

  { name: 'Langhals und Nüsse', tip: { icon: '🥥', text: 'Kokosnüsse auf dem Weg' },
    floors: [F, gap(340, 560), F, gap(240, 440)], start: { f: 0, x: 100 }, door: { x: 90 },
    ladders: [{ f: 1, x: 620 }, { f: 2, x: 780 }], balloons: [balloon(0, 450, 1, 600)], necks: [neck(3, 240, 440)], leaves: [{ f: 1, x: 800 }],
    nuts: [nut(2, 450, 150, 0)],
    friends: [{ f: 0, x: 300 }, { f: 2, x: 150 }, { f: 3, x: 720 }] },

  { name: 'Großes Abheben', tip: { icon: '🎈', text: 'Zwei Ballone und ein Langhals' },
    floors: [F, gap(340, 560), F, gap(340, 560), gap(240, 440)], start: { f: 0, x: 100 }, door: { x: 90 },
    ladders: [{ f: 1, x: 780 }, { f: 3, x: 780 }], balloons: [balloon(0, 450, 1, 600), balloon(2, 450, 1, 600)],
    necks: [neck(4, 240, 440)], leaves: [{ f: 2, x: 700 }],
    friends: [{ f: 0, x: 300 }, { f: 2, x: 250 }, { f: 3, x: 680 }] },

  // ---------- Level 85–90: alles zusammen ----------
  { name: 'Rutsche und Ballon', tip: { icon: '🛝', text: 'Runter rutschen, hoch fliegen' },
    floors: [F, gap(340, 560), F], start: { f: 2, x: 100 }, door: { x: 705 },
    ladders: [{ f: 0, x: 200 }, { f: 1, x: 780 }], slides: [slide(1, 450, -1)], balloons: [balloon(0, 450, 1, 600)],
    friends: [{ f: 1, x: 250 }, { f: 0, x: 700 }, { f: 2, x: 300 }] },

  { name: 'Brücke und Langhals', tip: { icon: '🪵', text: 'Erst die Brücke, dann der Langhals' },
    floors: [gap(230, 550), F, gap(240, 440)], bridges: [bridge(0, 230, 550, 300, 0)], start: { f: 0, x: 100 }, door: { x: 90 },
    ladders: [{ f: 0, x: 800 }, { f: 1, x: 700 }], necks: [neck(2, 240, 440)], leaves: [{ f: 0, x: 700 }],
    friends: [{ f: 0, x: 620 }, { f: 1, x: 300 }, { f: 2, x: 780 }] },

  { name: 'Schläfer am Ballon', tip: { icon: '😴', text: 'Warte, bis es schläft' },
    floors: [F, gap(340, 560), F, F], start: { f: 0, x: 100 }, door: { x: 705 },
    ladders: [{ f: 1, x: 780 }, { f: 2, x: 120 }], balloons: [balloon(0, 450, 1, 600)],
    wakers: [waker(0, 290, 300, 0), waker(2, 450, 280, 120)],
    friends: [{ f: 0, x: 700 }, { f: 1, x: 820 }, { f: 3, x: 300 }] },

  { name: 'Rutsche zum Langhals', tip: { icon: '🛝', text: 'Rutsche runter zum Langhals' },
    floors: [gap(240, 440), F, F], start: { f: 2, x: 100 }, door: { x: 705 },
    ladders: [{ f: 0, x: 800 }, { f: 1, x: 120 }], slides: [slide(0, 400)], necks: [neck(0, 240, 440)], leaves: [{ f: 2, x: 300 }],
    friends: [{ f: 0, x: 80 }, { f: 1, x: 650 }, { f: 2, x: 500 }] },

  { name: 'Die große Reise', tip: { icon: '🌍', text: 'Brücke, Ballon, Schläfer, Langhals' },
    floors: [gap(230, 550), F, gap(340, 560), F, gap(240, 440)], bridges: [bridge(0, 230, 550, 300, 0)],
    start: { f: 0, x: 100 }, door: { x: 90 },
    ladders: [{ f: 0, x: 800 }, { f: 2, x: 780 }, { f: 3, x: 700 }], balloons: [balloon(1, 450, 1, 600)],
    wakers: [waker(3, 450, 300, 0)], necks: [neck(4, 240, 440)], leaves: [{ f: 0, x: 700 }],
    friends: [{ f: 0, x: 620 }, { f: 3, x: 250 }, { f: 4, x: 780 }] },

  { name: 'Das Himmels-Finale', tip: { icon: '🏆', text: 'Das allergrößte Abenteuer!' },
    floors: [F, gap(340, 560), F, gap(240, 440), F], start: { f: 0, x: 100 }, door: { x: 705 },
    ladders: [{ f: 1, x: 650 }, { f: 2, x: 780 }, { f: 3, x: 80, hidden: true }], balloons: [balloon(0, 450, 1, 600)],
    levers: [{ f: 2, x: 250, ladder: 2 }], monsters: [{ f: 2, x: 420 }], fruits: [{ f: 0, x: 250 }],
    necks: [neck(3, 240, 440)], leaves: [{ f: 1, x: 780 }], nuts: [nut(4, 500, 150, 0)],
    friends: [{ f: 2, x: 120 }, { f: 4, x: 300 }, { f: 0, x: 700 }] },
  // ---------- Level 91–94: Wiedersehen ----------
  { name: 'Wiedersehen', tip: { icon: '🌟', text: 'Alles, was du schon kennst' },
    floors: fl(4), start: { f: 0, x: 100 }, door: { x: 705 }, ladders: [{ f: 0, x: 800 }, { f: 1, x: 120 }, { f: 2, x: 800 }],
    monsters: [{ f: 2, x: 450 }], fruits: [{ f: 1, x: 450 }], nuts: [nut(1, 600, 150, 0)], wakers: [waker(3, 450, 300, 0)],
    friends: [{ f: 0, x: 450 }, { f: 2, x: 250 }, { f: 3, x: 250 }] },

  { name: 'Fahren und fliegen', tip: { icon: '🎈', text: 'Erst die Brücke, dann der Ballon' },
    floors: [gap(230, 550), F, gap(340, 560), F], bridges: [bridge(0, 230, 550, 300, 0)], start: { f: 0, x: 100 }, door: { x: 195 },
    ladders: [{ f: 0, x: 800 }, { f: 2, x: 780 }], balloons: [balloon(1, 450, 1, 600)],
    friends: [{ f: 0, x: 650 }, { f: 1, x: 200 }, { f: 3, x: 450 }] },

  { name: 'Blatt für rechts', tip: { icon: '🦕', text: 'Ein Blatt für den Langhals' },
    floors: [F, F, gap(460, 660)], start: { f: 0, x: 800 }, door: { x: 820 }, ladders: [{ f: 0, x: 700 }, { f: 1, x: 150 }],
    necks: [neck(2, 460, 660, -1)], leaves: [{ f: 0, x: 450 }], nuts: [nut(1, 450, 150, 0)],
    friends: [{ f: 0, x: 250 }, { f: 1, x: 300 }, { f: 2, x: 190 }] },

  { name: 'Hebel nach dem Flug', tip: { icon: '🎚️', text: 'Ballon, Hebel, Frucht' },
    floors: [F, gap(340, 560), F], start: { f: 0, x: 100 }, door: { x: 195 },
    ladders: [{ f: 1, x: 700, hidden: true }], levers: [{ f: 1, x: 800, ladder: 0 }], balloons: [balloon(0, 450, 1, 600)],
    monsters: [{ f: 2, x: 450 }], fruits: [{ f: 0, x: 250 }],
    friends: [{ f: 0, x: 700 }, { f: 1, x: 620 }, { f: 2, x: 300 }] },

  // ---------- Level 95–102: Zauber-Baumhöhlen ----------
  { name: 'Die Zauberhöhle', tip: { icon: '🌀', text: 'In die Höhle – und woanders raus' },
    floors: fl(2), start: { f: 0, x: 100 }, door: { x: 705 }, ladders: [], holes: [hole(0, 700, 0), hole(1, 200, 0)],
    friends: [{ f: 0, x: 300 }, { f: 0, x: 500 }, { f: 1, x: 450 }] },

  { name: 'Hin und zurück', tip: { icon: '↔️', text: 'Höhlen gehen in beide Richtungen' },
    floors: fl(2), start: { f: 1, x: 450 }, door: { x: 195 }, ladders: [], holes: [hole(1, 750, 0), hole(0, 150, 0)],
    friends: [{ f: 0, x: 450 }, { f: 0, x: 750 }, { f: 1, x: 300 }] },

  { name: 'Zwei Farben', tip: { icon: '🔵', text: 'Blau zu Blau, Rot zu Rot' },
    floors: fl(3), start: { f: 0, x: 100 }, door: { x: 705 }, ladders: [],
    holes: [hole(0, 750, 0), hole(1, 150, 0), hole(1, 750, 1), hole(2, 150, 1)],
    friends: [{ f: 0, x: 450 }, { f: 1, x: 450 }, { f: 2, x: 400 }] },

  { name: 'Welche Höhle?', tip: { icon: '🤔', text: 'Nicht jede Höhle führt nach oben' },
    floors: fl(3), start: { f: 0, x: 200 }, door: { x: 705 }, ladders: [{ f: 0, x: 100 }],
    holes: [hole(0, 330, 1), hole(1, 600, 1), hole(0, 750, 0), hole(2, 150, 0)],
    friends: [{ f: 0, x: 520 }, { f: 1, x: 300 }, { f: 2, x: 450 }] },

  { name: 'Höhle und Leiter', tip: { icon: '🪜', text: 'Mal Höhle, mal Leiter' },
    floors: fl(4), start: { f: 0, x: 100 }, door: { x: 195 }, ladders: [{ f: 0, x: 800 }, { f: 2, x: 300 }],
    holes: [hole(1, 150, 2), hole(3, 650, 2)],
    friends: [{ f: 1, x: 500 }, { f: 2, x: 650 }, { f: 3, x: 450 }] },

  { name: 'Frucht durch die Höhle', tip: { icon: '🍊', text: 'Die Frucht kommt mit durch die Höhle' },
    floors: fl(3), start: { f: 0, x: 100 }, door: { x: 705 }, ladders: [{ f: 1, x: 780 }],
    holes: [hole(0, 700, 1), hole(2, 150, 1)], monsters: [{ f: 2, x: 450 }], fruits: [{ f: 0, x: 300 }],
    friends: [{ f: 0, x: 500 }, { f: 1, x: 450 }, { f: 2, x: 300 }] },

  { name: 'Höhlen-Kette', tip: { icon: '🧭', text: 'Blau, Rot, Gelb – immer weiter' },
    floors: fl(4), start: { f: 0, x: 100 }, door: { x: 705 }, ladders: [],
    holes: [hole(0, 750, 0), hole(2, 150, 0), hole(2, 750, 1), hole(1, 150, 1), hole(1, 750, 2), hole(3, 150, 2)],
    friends: [{ f: 1, x: 450 }, { f: 2, x: 450 }, { f: 3, x: 450 }] },

  { name: 'Höhle zum Langhals', tip: { icon: '🌀', text: 'Fliegen, Blatt, Höhle, Langhals' },
    floors: [F, gap(340, 560), gap(240, 440)], start: { f: 0, x: 100 }, door: { x: 90 }, ladders: [],
    balloons: [balloon(0, 450, 1, 600)], holes: [hole(1, 800, 2), hole(2, 780, 2)], necks: [neck(2, 240, 440)], leaves: [{ f: 1, x: 690 }],
    friends: [{ f: 0, x: 250 }, { f: 1, x: 620 }, { f: 2, x: 720 }] },

  // ---------- Level 103–110: Felsbrocken ----------
  { name: 'Der Felsbrocken', tip: { icon: '🪨', text: 'Schieb den Stein in das Loch' },
    floors: [gap(400, 500)], start: { f: 0, x: 100 }, door: { x: 760 }, ladders: [], rocks: [rock(0, 250)], pits: [pit(0, 400, 500)],
    friends: [{ f: 0, x: 560 }, { f: 0, x: 660 }, { f: 0, x: 830 }] },

  { name: 'Die Druckplatte', tip: { icon: '🍃', text: 'Stein auf die Platte – das Tor geht auf' },
    floors: fl(1), start: { f: 0, x: 100 }, door: { x: 780 }, ladders: [], rocks: [rock(0, 300)], plates: [plate(0, 480)], gates: [gate(0, 620)],
    friends: [{ f: 0, x: 180 }, { f: 0, x: 700 }, { f: 0, x: 830 }] },

  { name: 'Stein oben', tip: { icon: '🪨', text: 'Oben wartet ein Stein' },
    floors: [F, gap(400, 500)], start: { f: 0, x: 100 }, door: { x: 700 }, ladders: [{ f: 0, x: 150 }],
    rocks: [rock(1, 280)], pits: [pit(1, 400, 500)],
    friends: [{ f: 0, x: 450 }, { f: 0, x: 700 }, { f: 1, x: 800 }] },

  { name: 'Tor zur Tür', tip: { icon: '🌿', text: 'Das Tor versperrt die Tür' },
    floors: fl(2), start: { f: 0, x: 100 }, door: { x: 800 }, ladders: [{ f: 0, x: 150 }],
    rocks: [rock(1, 300)], plates: [plate(1, 520)], gates: [gate(1, 700)],
    friends: [{ f: 0, x: 450 }, { f: 0, x: 700 }, { f: 1, x: 600 }] },

  { name: 'Zwei Steine', tip: { icon: '🪨', text: 'Ein Stein fürs Tor, einer fürs Loch' },
    floors: [F, gap(400, 500)], start: { f: 0, x: 100 }, door: { x: 750 }, ladders: [{ f: 0, x: 150 }],
    rocks: [rock(0, 300), rock(1, 250)], plates: [plate(0, 520)], gates: [gate(0, 700)], pits: [pit(1, 400, 500)],
    friends: [{ f: 0, x: 800 }, { f: 1, x: 330 }, { f: 1, x: 600 }] },

  { name: 'Stein-Brücke', tip: { icon: '🌉', text: 'Zwei Löcher, zwei Steine' },
    floors: [P3(300, 400, 600, 700), F], start: { f: 0, x: 100 }, door: { x: 195 }, ladders: [{ f: 0, x: 780 }],
    rocks: [rock(0, 200), rock(0, 520)], pits: [pit(0, 300, 400), pit(0, 600, 700)],
    friends: [{ f: 0, x: 440 }, { f: 0, x: 820 }, { f: 1, x: 450 }] },

  { name: 'Platte oben, Tor unten', tip: { icon: '🔼', text: 'Die Platte öffnet ein Tor woanders' },
    floors: fl(2), start: { f: 0, x: 100 }, door: { x: 705 }, ladders: [{ f: 0, x: 200 }],
    rocks: [rock(1, 300)], plates: [plate(1, 550)], gates: [gate(0, 600)],
    friends: [{ f: 0, x: 450 }, { f: 0, x: 780 }, { f: 1, x: 420 }] },

  { name: 'Steinrätsel', tip: { icon: '🧩', text: 'Welcher Stein kommt wohin?' },
    floors: [F, gap(400, 500), F], start: { f: 0, x: 100 }, door: { x: 195 }, ladders: [{ f: 0, x: 120 }, { f: 1, x: 780 }],
    rocks: [rock(0, 300), rock(1, 250)], plates: [plate(0, 550)], gates: [gate(2, 450)], pits: [pit(1, 400, 500)],
    friends: [{ f: 0, x: 700 }, { f: 1, x: 700 }, { f: 2, x: 300 }] },

  // ---------- Level 111–116: Nacht im Dschungel ----------
  { name: 'Gute Nacht, Dino', tip: { icon: '🌙', text: 'Laternen machen es hell' }, night: true,
    floors: fl(3), start: { f: 0, x: 100 }, door: { x: 705 }, ladders: [{ f: 0, x: 800 }, { f: 1, x: 120 }],
    lamps: [lamp(0, 300), lamp(1, 450), lamp(2, 450)],
    friends: [{ f: 0, x: 550 }, { f: 1, x: 700 }, { f: 2, x: 300 }] },

  { name: 'Nachtmonster', tip: { icon: '😴', text: 'Auch nachts will es eine Frucht' }, night: true,
    floors: fl(3), start: { f: 0, x: 100 }, door: { x: 705 }, ladders: [{ f: 0, x: 800 }, { f: 1, x: 120 }],
    monsters: [{ f: 1, x: 450 }], fruits: [{ f: 0, x: 450 }], lamps: [lamp(0, 250), lamp(1, 650), lamp(2, 450)],
    friends: [{ f: 0, x: 600 }, { f: 1, x: 250 }, { f: 2, x: 300 }] },

  { name: 'Nachtballon', tip: { icon: '🎈', text: 'Mit dem Ballon in die Nacht' }, night: true,
    floors: [F, gap(340, 560), F], start: { f: 0, x: 100 }, door: { x: 195 }, ladders: [{ f: 1, x: 780 }],
    balloons: [balloon(0, 450, 1, 600)], lamps: [lamp(0, 250), lamp(1, 700), lamp(2, 450)],
    friends: [{ f: 0, x: 700 }, { f: 1, x: 820 }, { f: 2, x: 300 }] },

  { name: 'Glühwürmchen-Höhle', tip: { icon: '🌀', text: 'Die Höhle leuchtet blau' }, night: true,
    floors: fl(3), start: { f: 0, x: 100 }, door: { x: 600 }, ladders: [{ f: 1, x: 780 }],
    holes: [hole(0, 750, 0), hole(2, 150, 0)], lamps: [lamp(0, 250), lamp(1, 250), lamp(2, 450)],
    friends: [{ f: 0, x: 450 }, { f: 1, x: 450 }, { f: 2, x: 300 }] },

  { name: 'Nachtstein', tip: { icon: '🪨', text: 'Auch nachts rollt der Stein' }, night: true,
    floors: [gap(400, 500), F], start: { f: 0, x: 100 }, door: { x: 195 }, ladders: [{ f: 0, x: 780 }],
    rocks: [rock(0, 250)], pits: [pit(0, 400, 500)], lamps: [lamp(0, 650), lamp(1, 450)],
    friends: [{ f: 0, x: 600 }, { f: 0, x: 820 }, { f: 1, x: 300 }] },

  { name: 'Mondschein-Langhals', tip: { icon: '🦕', text: 'Auch nachts hat er Hunger' }, night: true,
    floors: [F, gap(240, 440)], start: { f: 0, x: 100 }, door: { x: 90 }, ladders: [{ f: 0, x: 800 }],
    necks: [neck(1, 240, 440)], leaves: [{ f: 0, x: 450 }], lamps: [lamp(0, 250), lamp(1, 790)],
    friends: [{ f: 0, x: 300 }, { f: 0, x: 650 }, { f: 1, x: 720 }] },

  // ---------- Level 117–122: Höhlen und Felsbrocken ----------
  { name: 'Höhle zum Stein', tip: { icon: '🌀', text: 'Durch die Höhle zum Stein' },
    floors: [F, gap(400, 500)], start: { f: 0, x: 100 }, door: { x: 700 }, ladders: [],
    holes: [hole(0, 750, 0), hole(1, 150, 0)], rocks: [rock(1, 270)], pits: [pit(1, 400, 500)],
    friends: [{ f: 0, x: 450 }, { f: 1, x: 600 }, { f: 1, x: 820 }] },

  { name: 'Platte und Höhle', tip: { icon: '🍃', text: 'Unten die Platte, oben das Tor' },
    floors: fl(2), start: { f: 0, x: 100 }, door: { x: 705 }, ladders: [],
    rocks: [rock(0, 300)], plates: [plate(0, 550)], gates: [gate(1, 450)], holes: [hole(0, 800, 2), hole(1, 150, 2)],
    friends: [{ f: 0, x: 680 }, { f: 1, x: 300 }, { f: 1, x: 600 }] },

  { name: 'Zwei Höhlen, zwei Steine', tip: { icon: '🪨', text: 'Stein, Höhle, Stein' },
    floors: [gap(300, 400), F, gap(400, 500)], start: { f: 0, x: 100 }, door: { x: 700 }, ladders: [],
    rocks: [rock(0, 200), rock(2, 270)], pits: [pit(0, 300, 400), pit(2, 400, 500)],
    holes: [hole(0, 750, 1), hole(2, 150, 1), hole(2, 830, 0), hole(1, 450, 0)],
    friends: [{ f: 0, x: 500 }, { f: 1, x: 650 }, { f: 2, x: 600 }] },

  { name: 'Steinschlüssel', tip: { icon: '🔑', text: 'Der Stein öffnet den Weg zur Höhle' },
    floors: fl(3), start: { f: 0, x: 100 }, door: { x: 705 }, ladders: [{ f: 0, x: 120 }],
    rocks: [rock(0, 250)], plates: [plate(0, 500)], gates: [gate(0, 650)], holes: [hole(0, 800, 0), hole(2, 200, 0)],
    friends: [{ f: 0, x: 400 }, { f: 1, x: 600 }, { f: 2, x: 450 }] },

  { name: 'Höhlen-Steinbruch', tip: { icon: '⛏️', text: 'Oben schiebst du nach links' },
    floors: [gap(400, 500), F, gap(400, 500)], start: { f: 0, x: 100 }, door: { x: 195 }, ladders: [{ f: 0, x: 120 }],
    rocks: [rock(0, 250), rock(2, 650)], pits: [pit(0, 400, 500), pit(2, 400, 500)], holes: [hole(0, 780, 1), hole(2, 780, 1)],
    friends: [{ f: 0, x: 620 }, { f: 1, x: 450 }, { f: 2, x: 300 }] },

  { name: 'Großer Steinweg', tip: { icon: '🧭', text: 'Zwei Steine, zwei Höhlen' },
    floors: [F, gap(400, 500), F, F], start: { f: 0, x: 100 }, door: { x: 705 }, ladders: [{ f: 0, x: 120 }],
    rocks: [rock(0, 300), rock(1, 250)], plates: [plate(0, 550)], gates: [gate(3, 450)], pits: [pit(1, 400, 500)],
    holes: [hole(1, 800, 0), hole(3, 150, 0), hole(1, 620, 2), hole(2, 450, 2)],
    friends: [{ f: 0, x: 700 }, { f: 2, x: 700 }, { f: 3, x: 300 }] },

  // ---------- Level 123–130: Nacht mit Höhlen und Steinen ----------
  { name: 'Nachtwanderung', tip: { icon: '🌙', text: 'Höhlen und ein Schläfer im Dunkeln' }, night: true,
    floors: fl(3), start: { f: 0, x: 100 }, door: { x: 705 }, ladders: [],
    holes: [hole(0, 750, 0), hole(1, 150, 0), hole(1, 750, 1), hole(2, 150, 1)], wakers: [waker(1, 480, 300, 0)],
    lamps: [lamp(0, 300), lamp(1, 300), lamp(2, 500)],
    friends: [{ f: 0, x: 500 }, { f: 1, x: 300 }, { f: 2, x: 400 }] },

  { name: 'Steine im Mondlicht', tip: { icon: '🪨', text: 'Zwei Löcher im Dunkeln' }, night: true,
    floors: [F, P3(300, 400, 600, 700)], start: { f: 0, x: 100 }, door: { x: 770 }, ladders: [{ f: 0, x: 120 }],
    rocks: [rock(1, 200), rock(1, 500)], pits: [pit(1, 300, 400), pit(1, 600, 700)], lamps: [lamp(0, 600), lamp(1, 250)],
    friends: [{ f: 0, x: 450 }, { f: 0, x: 750 }, { f: 1, x: 830 }] },

  { name: 'Nachttor', tip: { icon: '🌿', text: 'Der Stein öffnet das Tor oben' }, night: true,
    floors: fl(3), start: { f: 0, x: 100 }, door: { x: 705 }, ladders: [{ f: 0, x: 120 }],
    rocks: [rock(1, 300)], plates: [plate(1, 550)], gates: [gate(2, 450)], holes: [hole(1, 800, 0), hole(2, 150, 0)],
    lamps: [lamp(0, 350), lamp(1, 450), lamp(2, 600)],
    friends: [{ f: 0, x: 600 }, { f: 1, x: 690 }, { f: 2, x: 300 }] },

  { name: 'Laternen-Labyrinth', tip: { icon: '🏮', text: 'Drei Höhlen und ein Monster' }, night: true,
    floors: fl(4), start: { f: 0, x: 100 }, door: { x: 705 }, ladders: [],
    holes: [hole(0, 750, 0), hole(2, 150, 0), hole(2, 750, 1), hole(1, 150, 1), hole(1, 750, 2), hole(3, 150, 2)],
    monsters: [{ f: 2, x: 450 }], fruits: [{ f: 0, x: 450 }], lamps: [lamp(0, 300), lamp(1, 300), lamp(2, 600), lamp(3, 600)],
    friends: [{ f: 1, x: 450 }, { f: 2, x: 250 }, { f: 3, x: 450 }] },

  { name: 'Ballon und Stein bei Nacht', tip: { icon: '🎈', text: 'Fliegen, klettern, schieben' }, night: true,
    floors: [F, gap(340, 560), gap(400, 500)], start: { f: 0, x: 100 }, door: { x: 195 }, ladders: [{ f: 1, x: 780 }],
    balloons: [balloon(0, 450, 1, 600)], rocks: [rock(2, 650)], pits: [pit(2, 400, 500)],
    lamps: [lamp(0, 700), lamp(1, 700), lamp(2, 300)],
    friends: [{ f: 0, x: 250 }, { f: 1, x: 820 }, { f: 2, x: 300 }] },

  { name: 'Langhals im Mondlicht', tip: { icon: '🦕', text: 'Das Blatt kommt durch die Höhle' }, night: true,
    floors: [F, F, gap(240, 440)], start: { f: 0, x: 200 }, door: { x: 90 }, ladders: [{ f: 0, x: 120 }],
    holes: [hole(0, 750, 2), hole(2, 780, 2)], necks: [neck(2, 240, 440)], leaves: [{ f: 0, x: 450 }],
    lamps: [lamp(0, 600), lamp(1, 300), lamp(2, 820)],
    friends: [{ f: 0, x: 300 }, { f: 1, x: 600 }, { f: 2, x: 700 }] },

  { name: 'Steine in der Nacht', tip: { icon: '🧩', text: 'Erst die Platte, dann das Loch' }, night: true,
    floors: [F, gap(400, 500), F], start: { f: 0, x: 100 }, door: { x: 195 }, ladders: [{ f: 0, x: 120 }],
    rocks: [rock(0, 300), rock(1, 250)], plates: [plate(0, 550)], gates: [gate(2, 450)], pits: [pit(1, 400, 500)],
    holes: [hole(1, 800, 1), hole(2, 800, 1)], lamps: [lamp(0, 450), lamp(1, 620), lamp(2, 600)],
    friends: [{ f: 0, x: 700 }, { f: 1, x: 650 }, { f: 2, x: 300 }] },

  { name: 'Nachtschwärmer', tip: { icon: '🌙', text: 'Höhle, Rutsche, Schläfer' }, night: true,
    floors: fl(4), start: { f: 0, x: 300 }, door: { x: 705 }, ladders: [{ f: 0, x: 120 }, { f: 2, x: 800 }],
    holes: [hole(0, 750, 0), hole(3, 150, 0)], slides: [slide(2, 600, -1)], wakers: [waker(2, 450, 300, 0)],
    lamps: [lamp(0, 500), lamp(1, 300), lamp(2, 150), lamp(3, 450)],
    friends: [{ f: 1, x: 500 }, { f: 2, x: 650 }, { f: 3, x: 300 }] },

  // ---------- Level 131–144: große Mischungen ----------
  { name: 'Alles im Dschungel', tip: { icon: '⭐', text: 'Ballon, Monster, Stein' },
    floors: [F, gap(340, 560), F, gap(400, 500), F], start: { f: 0, x: 100 }, door: { x: 450 },
    ladders: [{ f: 1, x: 780 }, { f: 2, x: 120 }, { f: 3, x: 780 }], balloons: [balloon(0, 450, 1, 600)],
    monsters: [{ f: 2, x: 450 }], fruits: [{ f: 0, x: 250 }], rocks: [rock(3, 250)], pits: [pit(3, 400, 500)],
    friends: [{ f: 0, x: 700 }, { f: 2, x: 200 }, { f: 4, x: 250 }] },

  { name: 'Höhle, Brücke, Hebel', tip: { icon: '🎚️', text: 'Über die Brücke zum Hebel' },
    floors: [gap(230, 550), F, F, F], bridges: [bridge(0, 230, 550, 300, 0)], start: { f: 0, x: 100 }, door: { x: 300 },
    ladders: [{ f: 1, x: 780 }, { f: 2, x: 600, hidden: true }], levers: [{ f: 0, x: 700, ladder: 1 }],
    holes: [hole(0, 820, 0), hole(2, 200, 0)],
    friends: [{ f: 0, x: 620 }, { f: 1, x: 450 }, { f: 3, x: 500 }] },

  { name: 'Langhals, Stein, Höhle', tip: { icon: '🦕', text: 'Stein ins Loch, Blatt zum Langhals' },
    floors: [gap(400, 500), F, gap(240, 440)], start: { f: 0, x: 100 }, door: { x: 90 }, ladders: [{ f: 0, x: 150 }],
    rocks: [rock(0, 250)], pits: [pit(0, 400, 500)], holes: [hole(0, 800, 1), hole(2, 780, 1)],
    necks: [neck(2, 240, 440)], leaves: [{ f: 0, x: 640 }],
    friends: [{ f: 0, x: 560 }, { f: 1, x: 500 }, { f: 2, x: 720 }] },

  { name: 'Nacht-Rutschen', tip: { icon: '🛝', text: 'Rutschen im Dunkeln' }, night: true,
    floors: fl(5), start: { f: 4, x: 100 }, door: { x: 705 },
    ladders: [{ f: 0, x: 780 }, { f: 1, x: 120 }, { f: 2, x: 800 }, { f: 3, x: 120 }], slides: [slide(3, 300), slide(1, 600, -1)],
    nuts: [nut(2, 450, 150, 0)], lamps: [lamp(0, 300), lamp(1, 600), lamp(2, 200), lamp(3, 450), lamp(4, 400)],
    friends: [{ f: 0, x: 450 }, { f: 2, x: 300 }, { f: 3, x: 700 }] },

  { name: 'Steinbruch-Höhlen', tip: { icon: '⛏️', text: 'Warte, bis es schläft' },
    floors: [F, gap(400, 500), F], start: { f: 0, x: 100 }, door: { x: 195 }, ladders: [{ f: 1, x: 780 }],
    wakers: [waker(0, 450, 300, 0)], holes: [hole(0, 800, 2), hole(1, 150, 2)], rocks: [rock(1, 270)], pits: [pit(1, 400, 500)],
    friends: [{ f: 0, x: 680 }, { f: 1, x: 620 }, { f: 2, x: 450 }] },

  { name: 'Zwei Langhälse, ein Ballon', tip: { icon: '🦕', text: 'Zwei Blätter, zwei Hälse' },
    floors: [F, gap(340, 560), gap(240, 440), gap(460, 660)], start: { f: 0, x: 100 }, door: { x: 810 },
    ladders: [{ f: 1, x: 800 }, { f: 2, x: 80 }], balloons: [balloon(0, 450, 1, 600)],
    necks: [neck(2, 240, 440), neck(3, 460, 660, -1)], leaves: [{ f: 1, x: 700 }, { f: 3, x: 150 }],
    friends: [{ f: 0, x: 250 }, { f: 0, x: 700 }, { f: 1, x: 620 }] },

  { name: 'Großes Tor', tip: { icon: '🌿', text: 'Stein, Hebel, Nuss und Tor' },
    floors: fl(4), start: { f: 0, x: 100 }, door: { x: 705 }, ladders: [{ f: 0, x: 120 }, { f: 1, x: 800 }, { f: 2, x: 120, hidden: true }],
    levers: [{ f: 1, x: 300, ladder: 2 }], nuts: [nut(1, 550, 150, 0)], rocks: [rock(0, 300)], plates: [plate(0, 550)], gates: [gate(2, 450)],
    friends: [{ f: 0, x: 700 }, { f: 2, x: 650 }, { f: 3, x: 300 }] },

  { name: 'Nacht der Höhlen', tip: { icon: '🌀', text: 'Drei Höhlen und ein Stein' }, night: true,
    floors: [F, gap(400, 500), F, F], start: { f: 0, x: 100 }, door: { x: 705 }, ladders: [],
    holes: [hole(0, 750, 0), hole(1, 150, 0), hole(1, 800, 1), hole(3, 200, 1), hole(3, 500, 2), hole(2, 450, 2)],
    rocks: [rock(1, 270)], pits: [pit(1, 400, 500)], lamps: [lamp(0, 300), lamp(1, 650), lamp(2, 200), lamp(3, 650)],
    friends: [{ f: 0, x: 450 }, { f: 2, x: 700 }, { f: 3, x: 350 }] },

  { name: 'Brücke, Stein, Langhals', tip: { icon: '🪵', text: 'Brücke, Stein, Blatt, Langhals' },
    floors: [gap(230, 550), gap(400, 500), gap(240, 440)], bridges: [bridge(0, 230, 550, 300, 0)], start: { f: 0, x: 100 }, door: { x: 90 },
    ladders: [{ f: 0, x: 700 }, { f: 1, x: 820 }], rocks: [rock(1, 580)], pits: [pit(1, 400, 500)],
    necks: [neck(2, 240, 440)], leaves: [{ f: 1, x: 250 }],
    friends: [{ f: 0, x: 620 }, { f: 1, x: 150 }, { f: 2, x: 720 }] },

  { name: 'Ballon über Steine', tip: { icon: '🎈', text: 'Erst der Stein, dann der Ballon' },
    floors: [gap(600, 700), gap(340, 560), F], start: { f: 0, x: 830 }, door: { x: 450 }, ladders: [{ f: 1, x: 780 }],
    rocks: [rock(0, 750)], pits: [pit(0, 600, 700)], balloons: [balloon(0, 450, 1, 600)],
    friends: [{ f: 0, x: 250 }, { f: 1, x: 700 }, { f: 2, x: 200 }] },

  { name: 'Monster-Höhlen', tip: { icon: '🍊', text: 'Frucht durch zwei Höhlen' },
    floors: fl(4), start: { f: 0, x: 100 }, door: { x: 705 }, ladders: [{ f: 0, x: 120 }],
    holes: [hole(0, 750, 0), hole(2, 150, 0), hole(2, 750, 1), hole(3, 150, 1)], monsters: [{ f: 3, x: 450 }], fruits: [{ f: 2, x: 450 }],
    wakers: [waker(0, 450, 300, 0)],
    friends: [{ f: 1, x: 600 }, { f: 2, x: 300 }, { f: 3, x: 250 }] },

  { name: 'Nachtsteine und Ballon', tip: { icon: '🪨', text: 'Zwei Steine bei Mondschein' }, night: true,
    floors: [F, gap(340, 560), P3(300, 400, 600, 700)], start: { f: 0, x: 100 }, door: { x: 790 }, ladders: [{ f: 1, x: 150 }],
    balloons: [balloon(0, 450, 1, 300)], rocks: [rock(2, 230), rock(2, 500)], pits: [pit(2, 300, 400), pit(2, 600, 700)],
    lamps: [lamp(0, 600), lamp(1, 200), lamp(2, 450), lamp(2, 830)],
    friends: [{ f: 0, x: 250 }, { f: 0, x: 700 }, { f: 1, x: 250 }] },

  { name: 'Doppeltor', tip: { icon: '🌿', text: 'Zwei Platten, zwei Tore, eine Nuss' },
    floors: fl(3), start: { f: 0, x: 100 }, door: { x: 195 }, ladders: [{ f: 0, x: 120 }, { f: 1, x: 780 }],
    rocks: [rock(0, 300), rock(1, 250)], plates: [plate(0, 520, 0), plate(1, 380, 1)], gates: [gate(1, 550), gate(2, 450)], nuts: [nut(2, 620, 150, 0)],
    friends: [{ f: 0, x: 700 }, { f: 1, x: 700 }, { f: 2, x: 300 }] },

  { name: 'Der lange Weg', tip: { icon: '🧭', text: 'Ballon, Hebel, Nuss, Schläfer' },
    floors: [F, gap(340, 560), F, F, F], start: { f: 0, x: 100 }, door: { x: 600 },
    ladders: [{ f: 1, x: 700 }, { f: 2, x: 300, hidden: true }, { f: 3, x: 780 }], levers: [{ f: 1, x: 800, ladder: 1 }],
    balloons: [balloon(0, 450, 1, 600)], nuts: [nut(2, 500, 150, 0)], wakers: [waker(3, 450, 300, 0)],
    friends: [{ f: 1, x: 620 }, { f: 3, x: 200 }, { f: 4, x: 300 }] },

  // ---------- Level 145–150: das Nacht-Finale ----------
  { name: 'Nacht-Finale 1', tip: { icon: '🌙', text: 'Höhle, Stein, Monster' }, night: true,
    floors: [F, gap(400, 500), F, F], start: { f: 0, x: 100 }, door: { x: 705 }, ladders: [{ f: 1, x: 780 }, { f: 2, x: 120 }],
    fruits: [{ f: 0, x: 300 }], holes: [hole(0, 750, 2), hole(1, 150, 2)], rocks: [rock(1, 270)], pits: [pit(1, 400, 500)],
    monsters: [{ f: 2, x: 450 }], lamps: [lamp(0, 600), lamp(1, 650), lamp(2, 600), lamp(3, 300)],
    friends: [{ f: 0, x: 500 }, { f: 2, x: 250 }, { f: 3, x: 450 }] },

  { name: 'Nacht-Finale 2', tip: { icon: '🌙', text: 'Ballon, Höhle, Langhals' }, night: true,
    floors: [F, gap(340, 560), F, gap(460, 660)], start: { f: 0, x: 100 }, door: { x: 810 }, ladders: [{ f: 1, x: 650 }],
    balloons: [balloon(0, 450, 1, 600)], holes: [hole(1, 820, 1), hole(3, 150, 1)], necks: [neck(3, 460, 660, -1)], leaves: [{ f: 1, x: 740 }],
    lamps: [lamp(0, 700), lamp(1, 750), lamp(2, 600), lamp(3, 100)],
    friends: [{ f: 0, x: 250 }, { f: 2, x: 300 }, { f: 3, x: 200 }] },

  { name: 'Nacht-Finale 3', tip: { icon: '🌙', text: 'Rutsche, zwei Steine, ein Tor' }, night: true,
    floors: [F, F, gap(400, 500), F], start: { f: 3, x: 100 }, door: { x: 195 }, ladders: [{ f: 1, x: 150 }, { f: 2, x: 780 }],
    slides: [slide(2, 300)], rocks: [rock(2, 560), rock(1, 300)], pits: [pit(2, 400, 500)], plates: [plate(1, 550)], gates: [gate(3, 450)],
    lamps: [lamp(1, 450), lamp(2, 250), lamp(3, 650)],
    friends: [{ f: 2, x: 250 }, { f: 1, x: 700 }, { f: 3, x: 600 }] },

  { name: 'Nacht-Finale 4', tip: { icon: '🌙', text: 'Brücke, Monster, Höhle, Stein' }, night: true,
    floors: [gap(230, 550), F, gap(340, 560), gap(400, 500), F], bridges: [bridge(0, 230, 550, 300, 0)], start: { f: 0, x: 100 }, door: { x: 705 },
    ladders: [{ f: 0, x: 780 }, { f: 1, x: 120 }, { f: 3, x: 150 }], fruits: [{ f: 0, x: 650 }], monsters: [{ f: 1, x: 450 }],
    holes: [hole(2, 270, 0), hole(3, 780, 0)], rocks: [rock(3, 650)], pits: [pit(3, 400, 500)],
    lamps: [lamp(0, 150), lamp(1, 700), lamp(2, 150), lamp(3, 700), lamp(4, 300)],
    friends: [{ f: 1, x: 250 }, { f: 3, x: 250 }, { f: 4, x: 450 }] },

  { name: 'Nacht-Finale 5', tip: { icon: '🌙', text: 'Fliegen, schieben, füttern' }, night: true,
    floors: [F, gap(340, 560), gap(400, 500), gap(240, 440)], start: { f: 0, x: 100 }, door: { x: 90 }, ladders: [{ f: 1, x: 800 }],
    balloons: [balloon(0, 450, 1, 600)], rocks: [rock(2, 650)], pits: [pit(2, 400, 500)], holes: [hole(2, 300, 1), hole(3, 780, 1)],
    necks: [neck(3, 240, 440)], leaves: [{ f: 2, x: 150 }], lamps: [lamp(0, 700), lamp(1, 700), lamp(2, 200), lamp(3, 820)],
    friends: [{ f: 0, x: 700 }, { f: 1, x: 700 }, { f: 3, x: 720 }] },

  { name: 'Das Nacht-Finale', tip: { icon: '🏆', text: 'Das allergrößte Abenteuer bei Nacht!' }, night: true,
    floors: [F, gap(340, 560), F, gap(400, 500), gap(240, 440)], start: { f: 0, x: 100 }, door: { x: 90 },
    ladders: [{ f: 1, x: 650, hidden: true }], levers: [{ f: 1, x: 800, ladder: 0 }], balloons: [balloon(0, 450, 1, 600)],
    fruits: [{ f: 0, x: 250 }], monsters: [{ f: 2, x: 400 }], nuts: [nut(2, 550, 150, 0)],
    holes: [hole(2, 780, 0), hole(3, 780, 0), hole(3, 120, 1), hole(4, 820, 1)], rocks: [rock(3, 620)], pits: [pit(3, 400, 500)],
    necks: [neck(4, 240, 440)], leaves: [{ f: 3, x: 250 }],
    lamps: [lamp(0, 600), lamp(1, 700), lamp(2, 250), lamp(3, 300)],
    friends: [{ f: 2, x: 150 }, { f: 1, x: 620 }, { f: 4, x: 720 }] }
];
export const LEVEL_COUNT = LEVELS.length;
