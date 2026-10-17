// Die 6 handgebauten Einführungslevel von Turmschicht (vom Generator übernommen)
export const F = [[4, 176]];
export const TUTORIAL = [
  { name: 'Frühschicht', tip: 'Finger auflegen und ziehen. Hoch/runter an Leitern.',
    floors: [F, F, F, F, F], start: { x: 20 }, exit: { x: 160 },
    ladders: [{ f: 0, x: 120 }, { f: 1, x: 60 }, { f: 2, x: 120 }, { f: 3, x: 60 }],
    stars: [{ f: 1, x: 165 }, { f: 2, x: 15 }, { f: 3, x: 165 }] },
  { name: 'Rundgang', tip: 'Monster? Kurz auf eine Leiter ausweichen.',
    floors: [F, F, F, F, F], start: { x: 20 }, exit: { x: 160 },
    ladders: [{ f: 0, x: 150 }, { f: 1, x: 30 }, { f: 2, x: 150 }, { f: 3, x: 90 }],
    monsters: [{ f: 2, x: 90, a: 50, b: 130, dir: -1 }],
    stars: [{ f: 1, x: 165 }, { f: 3, x: 20 }, { f: 4, x: 20 }] },
  { name: 'Entdeckt!', tip: '„!“ heißt: entdeckt. Lauf – Jäger sind langsamer als du.',
    floors: [F, F, F, F, F], start: { x: 20 }, exit: { x: 160 },
    ladders: [{ f: 0, x: 160 }, { f: 1, x: 20 }, { f: 2, x: 160 }, { f: 3, x: 20 }],
    monsters: [{ f: 2, x: 100, a: 70, b: 120, hunt: true }],
    stars: [{ f: 1, x: 170 }, { f: 3, x: 170 }, { f: 4, x: 10 }] },
  { name: 'Umwege', tip: 'Alle 3 ★ und raus: das ist der Perfekte Lauf.',
    floors: [F, [[4, 84], [100, 176]], F, F, F], start: { x: 100 }, exit: { x: 160 },
    ladders: [{ f: 0, x: 40 }, { f: 0, x: 140 }, { f: 1, x: 60 }, { f: 2, x: 150 }, { f: 3, x: 30 }],
    stars: [{ f: 1, x: 165 }, { f: 2, x: 15 }, { f: 3, x: 165 }] },
  { name: 'Weichensteller', tip: 'Am Hebel erscheint die Aktionstaste. Die Leiter springt zur gestrichelten Stelle.',
    floors: [F, F, F, [[4, 84], [100, 176]], F], start: { x: 20 }, exit: { x: 160 },
    ladders: [{ f: 0, x: 150 }, { f: 1, x: 30 }, { f: 2, xs: [60, 150], lever: 0 }, { f: 3, x: 124 }],
    levers: [{ f: 2, x: 100 }],
    stars: [{ f: 3, x: 20 }, { f: 1, x: 165 }, { f: 4, x: 20 }] },
  { name: 'Abgehängt', tip: 'Oben den Hebel umlegen – dann findet der Jäger keinen Weg mehr.',
    floors: [F, F, F, [[4, 60], [76, 176]], F], start: { x: 20 }, exit: { x: 165 },
    ladders: [{ f: 0, x: 150 }, { f: 1, x: 30 }, { f: 2, x: 150 }, { f: 3, xs: [120, 30], lever: 0 }],
    levers: [{ f: 4, x: 140 }], monsters: [{ f: 3, x: 100, a: 90, b: 130, hunt: true }],
    stars: [{ f: 3, x: 15 }, { f: 1, x: 165 }, { f: 2, x: 20 }] }
];

