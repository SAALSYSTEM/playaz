// 30 handgebaute Level. Etage 0 ist unten. x läuft von 0 (links) bis 900 (rechts).
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
    friends: [{ f: 3, x: 200 }, { f: 4, x: 200 }, { f: 5, x: 230 }] }
];
export const LEVEL_COUNT = LEVELS.length;
