// Krümel – Level. Koordinaten in Kacheln (32 px), y = 0 oben. Boden-Oberkante in Level 1: Reihe 21.
// Regeln für alle Level (werden in tests/kruemel-sim.test.mjs geprüft):
// - Stufen ohne Leiter/Aufzug höchstens 2 Kacheln hoch, Lücken höchstens 2 Kacheln breit
// - Fallwege höchstens 4 Kacheln tief (sonst Leiter, Aufzug oder Zwischenbrett)
// - Von jedem Fähnchen aus ist das Ziel erreichbar, jeder Goldkäse ist erreichbar

export const LEVELS = [
  {
    name: 'Küche · Laufen lernen',
    w: 88, h: 24, floor: 21,   // ab dieser Reihe werden feste Kacheln als Fliesenboden gezeichnet
    build(L) {
      // Boden mit Spülen-Schacht bei x 24–25
      L.solid(0, 21, 23, 23); L.solid(26, 21, 71, 23);
      L.start(2, 20);
      L.tip(1, 'Laufen mit ◀ ▶', '🐭');

      // A: kleine Stufe zum ersten Springen
      L.crumbs(4, 8, 20);
      L.tip(7, 'Springen! Lange drücken = hoch', '⬆️');
      L.solid(10, 19, 11, 20);
      L.crumbs(10, 11, 18);

      // B: Unterschrank (Oberkante Reihe 18) – Kochlöffel-Leiter hoch
      L.ladder(14, 18, 20);
      L.tip(12, 'Am Kochlöffel: Springen halten = klettern', '🥄');
      L.crumb(14, 19); L.crumb(14, 18);
      L.solid(15, 18, 23, 20); L.solid(26, 18, 31, 20);
      L.flag(16, 17);
      L.crumbs(17, 18, 17);
      L.solid(20, 16, 21, 17);           // Brotdose auf der Arbeitsplatte
      L.crumbs(20, 21, 15);
      L.crumbs(22, 23, 17);
      // Spüle (offener Schacht) – drüberspringen; Goldkäse 1 hängt über der Spüle
      L.tip(22, 'Über die Spüle springen!', '💧');
      L.gold(25, 15);
      L.crumbs(27, 30, 17);

      // C: runter auf den Boden (3 Kacheln), Fähnchen
      L.flag(34, 20);

      // D: Regal-Treppe nach oben (Bretter kann man von unten durchspringen)
      L.crumb(35, 20);
      L.shelf(36, 39, 19); L.crumb(37, 18);
      L.shelf(40, 43, 17); L.crumb(41, 16);
      L.shelf(44, 47, 15); L.crumb(45, 14);
      L.solid(48, 13, 48, 20);           // hoher Vorratsschrank: Treppe endet an einer Wand statt an einem Abgrund
      L.shelf(49, 58, 13);
      L.shelf(46, 47, 11); L.gold(47, 10);  // Goldkäse 2: kleines Brett links oben
      L.crumbs(50, 51, 12); L.crumbs(55, 56, 12);
      L.tip(47, 'Auf Kätzchen springen – oder drüber!', '🐱');
      L.cat(53, 12, 50, 57);

      // E: zwei Stufen hinunter (je 4 Kacheln), Fähnchen
      L.shelf(59, 62, 17); L.crumb(61, 16);
      L.crumb(63, 20);
      L.flag(64, 20);

      // F: Schublade fährt hoch auf die hohe Arbeitsplatte (Oberkante Reihe 13)
      L.tip(64, 'Ab in die Schublade – sie fährt hoch!', '🗄️');
      L.lift(67, 2, 19, 13, { speed: 1.5, wait: 70 });
      L.gold(68, 10);                      // Goldkäse 3: oben vom Aufzug abspringen
      L.solid(69, 13, 87, 23);
      L.crumbs(71, 73, 12);
      L.cat(77, 12, 75, 80);
      L.crumbs(82, 83, 12);
      L.goal(85, 12);
    },
  },
];
export const LEVEL_COUNT = LEVELS.length;
