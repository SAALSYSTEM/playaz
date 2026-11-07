// Leuchtpfad – 30 Level in 3 Welten. Die Wege selbst entstehen beim Laden aus dem festen Startwert (seed) in engine.js,
// sind also auf jedem Gerät gleich. Der Test (tests/leuchtpfad-sim.test.mjs) prüft jeden Weg.
//   c × r   Spielfeld (Spalten × Reihen, Hochformat)
//   len     Steine im Weg inklusive Start und Pilzhaus
//   step    ms, bis Lumi zum nächsten Stein fliegt
//   hold    ms, die der ganze Weg nach dem letzten Stein noch leuchtet
//   spur    0 = alle Steine leuchten bis zum Schluss; n = nur die letzten n Steine hinter Lumi leuchten
//   irr     blaue Irrlichter (falsche Abzweigungen), die beim Zeigen kurz neben dem Weg aufflackern

export const WELTEN = [
  { id: 1, name: 'Blumenwiese', von: 1, bis: 10 },
  { id: 2, name: 'Zauberwald', von: 11, bis: 20 },
  { id: 3, name: 'Mondsee', von: 21, bis: 30 }
];

const T = (c, r, len, step, hold, spur = 0, irr = 0) => ({ c, r, len, step, hold, spur, irr });
const ROH = [
  // Blumenwiese: kleine Felder, kurze Wege, alles leuchtet lange
  T(3, 4, 3, 700, 2200), T(3, 4, 3, 650, 2000), T(3, 4, 4, 650, 1900), T(3, 4, 4, 600, 1800), T(4, 5, 4, 600, 1700),
  T(4, 5, 5, 600, 1600), T(4, 5, 5, 560, 1500), T(4, 5, 5, 540, 1400), T(4, 5, 6, 540, 1400), T(4, 5, 6, 520, 1300),
  // Zauberwald: größere Felder, längere Wege; ab 16 verblasst die Spur hinter Lumi
  T(4, 6, 6, 500, 1200), T(4, 6, 7, 500, 1150), T(5, 6, 7, 480, 1100), T(5, 6, 7, 460, 1000), T(5, 6, 8, 460, 1000),
  T(5, 6, 6, 520, 1100, 3), T(5, 7, 7, 500, 1000, 3), T(5, 7, 7, 480, 950, 3), T(5, 7, 8, 460, 900, 3), T(5, 7, 8, 440, 850, 3),
  // Mondsee: blaue Irrlichter als falsche Abzweigungen; ab 26 zusätzlich verblassende Spur
  T(5, 7, 8, 440, 1000, 0, 1), T(5, 7, 9, 420, 950, 0, 1), T(5, 7, 9, 420, 900, 0, 2), T(5, 7, 10, 400, 850, 0, 2), T(5, 7, 10, 380, 800, 0, 2),
  T(5, 7, 8, 440, 900, 4, 2), T(5, 7, 9, 420, 850, 4, 2), T(5, 7, 10, 400, 800, 4, 3), T(5, 7, 11, 380, 750, 4, 3), T(5, 7, 12, 360, 700, 4, 3)
];

// Hinweis zu Beginn eines Levels, wenn etwas Neues dazukommt
const TIPPS = {
  1: 'Schau genau: Lumi zeigt dir den Weg nach Hause!',
  2: 'Merk dir die leuchtenden Steine – dann tippe sie nacheinander an.',
  5: 'Das Feld wird größer. Du schaffst das!',
  11: 'Willkommen im Zauberwald! Die Wege werden länger.',
  16: 'Achtung: Hinter Lumi verblasst die Spur schnell wieder!',
  21: 'Blaue Irrlichter wollen dich austricksen. Lauf nur über goldene Steine!',
  26: 'Jetzt verblasst die Spur – und die Irrlichter sind auch da!'
};

export const LEVELS = ROH.map((t, i) => {
  const id = i + 1, welt = WELTEN.find((w) => id >= w.von && id <= w.bis);
  return { id, welt: welt.id, seed: id * 7919 + 13, tipp: TIPPS[id] || '', ...t };
});
export const LEVEL_COUNT = LEVELS.length;
