// Krümel – Level. Koordinaten in Kacheln (32 px), y = 0 oben. Boden-Oberkante in Level 1: Reihe 21.
// Regeln für alle Level (werden in tests/kruemel-sim.test.mjs geprüft):
// - Stufen ohne Leiter/Aufzug höchstens 2 Kacheln hoch, Lücken höchstens 2 Kacheln breit
// - Fallwege höchstens 4 Kacheln tief (sonst Leiter, Aufzug oder Zwischenbrett)
// - Von jedem Fähnchen aus ist das Ziel erreichbar, jeder Goldkäse ist erreichbar
// - Käse-Stationen haben 2 Kacheln Platz nach oben (sonst kann Krümel nicht wachsen)
// Elemente: Krümel (1 Punkt), Schokolinsen (5 Punkte), Goldkäse (Sterne), Fähnchen, Kochlöffel-Leiter, Regalbrett,
// Schublade (fester Ablauf), Crispy-Cookie (bröselt, wächst nach), Käse (groß) / Minze (klein), Zuckerwürfel (groß zerbricht sie),
// Waage (groß draufstellen, andere Schale hebt sich und bleibt oben), Kätzchen, Schlafkater (Springen in der Nähe weckt ihn)

export const LEVELS = [
  {
    name: 'Laufen lernen',
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
      L.chocs(52, 54, 10);               // Schokolinsen über dem Kätzchen
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
  // ------------------------------------------------------------ 2: Schokolinsen und Crispy-Cookies
  {
    name: 'Schoko & Crispy-Cookies',
    w: 92, h: 24, floor: 21,
    build(L) {
      L.solid(0, 21, 13, 23); L.solid(18, 21, 65, 23); L.solid(73, 21, 91, 23);
      L.start(2, 20);
      L.tip(1, 'Schokolinsen bringen 5 Punkte!', '🍫');
      L.crumbs(4, 8, 20); L.chocs(5, 7, 18);
      L.flag(10, 20);
      L.tip(11, 'Crispy-Cookies bröseln – schnell weiter!', '🍪');
      L.cookie(15, 20, 2); L.chocs(15, 16, 18);           // Trittstein über der Lücke
      L.crumbs(19, 24, 20);
      L.flag(27, 20);
      // Cookie-Treppe; darunter ist Boden – wer fällt, versucht es einfach nochmal (Cookies wachsen nach)
      L.cookie(30, 19, 2); L.choc(30, 18);
      L.cookie(33, 17, 2); L.choc(33, 16);
      L.cookie(36, 15, 3); L.choc(37, 14);
      L.shelf(39, 46, 15); L.crumbs(40, 45, 14);
      L.cookie(42, 13, 2); L.gold(43, 10);                // Goldkäse 1: vom Cookie hochspringen
      L.shelf(47, 50, 18); L.crumbs(48, 49, 17);
      L.flag(53, 20);
      L.cat(59, 20, 55, 63); L.chocs(58, 60, 17);
      // Lücke mit zwei Cookies
      L.cookie(67, 20, 2); L.cookie(70, 19, 2);
      L.gold(69, 17);                                     // Goldkäse 2: über der Lücke
      L.flag(74, 20);
      L.ladder(76, 17, 20); L.solid(77, 17, 91, 20);
      L.crumbs(78, 80, 16);
      L.cookie(80, 15, 2); L.gold(81, 12);                // Goldkäse 3
      L.chocs(84, 86, 16);
      L.goal(89, 16);
    },
  },

  // ------------------------------------------------------------ 3: Käse macht groß
  {
    name: 'Käse macht groß',
    w: 80, h: 24, floor: 21,
    build(L) {
      L.solid(0, 21, 79, 23);
      L.start(2, 20);
      L.tip(3, 'Käse essen = groß!', '🧀');
      L.cheese(6, 20);
      L.tip(8, 'Groß zerbricht Zuckerwürfel', '🧊');
      L.sugar(11, 18, 11, 20);
      L.crumbs(13, 15, 20); L.flag(14, 20);
      L.ladder(17, 18, 20); L.solid(18, 18, 30, 20);
      L.cheese(20, 17);
      L.sugar(24, 15, 24, 17);
      L.crumbs(25, 26, 17); L.chocs(21, 23, 14);
      L.shelf(27, 29, 16); L.gold(28, 13);                // Goldkäse 1: Brett hinter der Zuckerwand
      L.flag(33, 20); L.cheese(34, 20);
      // Zuckerwürfel-Käfig mit Goldkäse
      L.sugar(36, 18, 38, 20); L.clear(37, 19, 37, 19); L.gold(37, 19);
      L.crumbs(40, 42, 20);
      L.tip(43, 'Groß + Kätzchen = wieder klein (kein Zurück!)', '🐱');
      L.cat(47, 20, 42, 51); L.chocs(46, 48, 17);
      L.cheese(53, 20);
      L.sugar(56, 18, 56, 20);
      L.shelf(58, 61, 19); L.crumb(59, 18);
      L.shelf(62, 65, 17); L.crumb(63, 16);
      L.solid(66, 15, 79, 20);
      L.cheese(68, 14);
      L.sugar(71, 12, 73, 12); L.gold(72, 11);            // Goldkäse 3: groß von unten durch die Zuckerdecke
      L.chocs(70, 74, 14);
      L.goal(77, 14);
    },
  },

  // ------------------------------------------------------------ 4: Minze macht klein
  {
    name: 'Minze macht klein',
    w: 84, h: 24, floor: 21,
    build(L) {
      L.solid(0, 21, 83, 23);
      L.start(2, 20);
      L.cheese(5, 20); L.sugar(9, 18, 9, 20);
      L.flag(11, 20);
      L.tip(12, 'Minze = wieder klein. Klein passt durch Spalten!', '🌿');
      L.mint(13, 20);
      L.solid(16, 0, 24, 19); L.crumbs(17, 19, 20); L.gold(20, 20); L.crumbs(21, 23, 20);   // Spalt mit Goldkäse 1
      L.flag(26, 20); L.cheese(28, 20);
      L.sugar(31, 17, 31, 20);
      L.chocs(32, 34, 18);
      L.mint(35, 20);
      L.solid(37, 0, 45, 19); L.crumbs(38, 44, 20);      // zweiter Spalt
      L.flag(47, 20);
      L.ladder(49, 17, 20); L.solid(50, 17, 83, 20);
      L.cheese(52, 16); L.sugar(55, 14, 55, 16);
      L.mint(58, 16);
      L.solid(61, 0, 68, 15); L.gold(64, 16); L.crumbs(62, 63, 16); L.crumbs(65, 67, 16);    // Spalt oben mit Goldkäse 2
      L.chocs(70, 72, 14);
      L.shelf(73, 75, 15); L.gold(74, 12);                // Goldkäse 3
      L.goal(80, 16);
    },
  },

  // ------------------------------------------------------------ 5: Die Waage
  {
    name: 'Die Waage',
    w: 86, h: 24, floor: 21,
    build(L) {
      L.solid(0, 21, 85, 23);
      L.start(2, 20);
      L.cheese(5, 20);
      L.tip(7, 'Groß auf die Waage – die andere Schale hebt sich!', '⚖️');
      L.clear(10, 21, 11, 22); L.clear(14, 21, 15, 22);
      L.scale(10, 21, 14, 21, 2);
      L.solid(16, 17, 40, 20);
      L.flag(18, 16); L.crumbs(19, 22, 16);
      // zweite Waage oben auf der Arbeitsplatte: hebt eine Stufe zum Goldkäse
      L.clear(24, 17, 25, 18); L.clear(29, 17, 30, 18);
      L.scale(24, 17, 29, 17, 2);
      L.gold(30, 12);
      L.shelf(32, 36, 13); L.chocs(33, 35, 12);
      L.crumbs(37, 39, 16);
      L.flag(43, 20);
      L.cat(49, 20, 45, 53); L.chocs(46, 48, 17); L.gold(51, 17);   // Goldkäse 2: Sprung über dem Kätzchen
      L.cheese(55, 20);
      L.clear(58, 21, 59, 22); L.clear(64, 21, 65, 22);
      L.scale(58, 21, 64, 21, 2);
      L.solid(66, 17, 85, 20);
      L.flag(67, 16);
      L.mint(69, 16);
      L.solid(72, 0, 78, 15); L.gold(75, 16); L.crumbs(73, 74, 16); L.crumbs(76, 77, 16);
      L.goal(83, 16);
    },
  },
  // ------------------------------------------------------------ 6: Speisekammer – der Schlafkater
  {
    name: 'Pssst, der Kater schläft',
    theme: 'kammer',
    w: 90, h: 24, floor: 21,
    build(L) {
      L.solid(0, 21, 89, 23);
      L.start(2, 20);
      L.tip(3, 'Pssst! Laufen ist leise – Springen weckt den Kater', '😴');
      L.crumbs(4, 7, 20);
      L.sleeper(10, 20); L.chocs(9, 11, 17);              // Schokolinsen locken zum Springen …
      L.crumbs(13, 15, 20); L.flag(14, 20);
      // Konservendosen-Treppe
      L.solid(16, 19, 17, 20); L.solid(18, 17, 19, 20); L.solid(20, 15, 21, 20);
      L.crumb(17, 18); L.crumb(19, 16);
      L.shelf(22, 31, 15); L.ladder(32, 15, 20);         // Löffel zurück aufs Brett, falls man unten landet
      L.sleeper(27, 14); L.gold(27, 12);                  // Goldkäse 1 – nur mit Sprung neben dem Kater
      L.solid(33, 13, 34, 20); L.shelf(35, 40, 13); L.crumbs(35, 39, 12);
      L.shelf(41, 44, 17); L.crumb(42, 16);
      L.flag(46, 20);
      L.lift(50, 2, 19, 13, { speed: 1.5, wait: 80 }); L.gold(51, 10);   // Goldkäse 2: auf der Fahrt hochspringen
      L.solid(52, 13, 60, 20);
      L.flag(53, 12);
      L.sleeper(56, 12);
      // Cookie-Brücke; wer fällt, klettert am Löffel wieder hoch
      L.ladder(61, 13, 20);
      L.cookie(62, 13, 2); L.choc(62, 12);
      L.cookie(66, 12, 2); L.gold(66, 9);                 // Goldkäse 3
      L.solid(68, 13, 89, 20);
      L.crumbs(71, 75, 12); L.chocs(78, 82, 10);
      L.goal(86, 12);
    },
  },

  // ------------------------------------------------------------ 7: Kätzchen-Kommando
  {
    name: 'Kätzchen-Kommando',
    theme: 'kammer',
    w: 96, h: 24, floor: 21,
    build(L) {
      L.solid(0, 21, 95, 23); L.clear(30, 21, 34, 23);
      L.start(2, 20);
      L.cheese(4, 20);
      L.tip(5, 'Groß hält einen Treffer mehr aus', '🧀');
      L.cat(12, 20, 8, 16); L.chocs(11, 13, 17);
      L.cat(22, 20, 18, 26); L.chocs(21, 23, 17);
      L.flag(28, 20);
      L.cookie(31, 20, 2); L.gold(33, 17);                // Goldkäse 1 über der Lücke
      L.crumbs(36, 37, 20);
      L.shelf(38, 44, 19); L.cat(41, 18, 38, 44);
      L.shelf(46, 54, 17); L.cat(50, 16, 46, 54); L.gold(50, 14);   // Goldkäse 2
      L.flag(57, 20); L.cheese(59, 20);
      L.lift(62, 2, 19, 12, { speed: 1.6, wait: 70 });
      L.solid(64, 12, 95, 20);
      L.flag(65, 11);
      L.cat(70, 11, 66, 74); L.chocs(69, 71, 8);
      L.cheese(74, 11); L.sugar(76, 9, 76, 11); L.crumbs(77, 78, 11);
      L.cat(81, 11, 79, 85);
      L.shelf(86, 88, 10); L.gold(87, 7);                 // Goldkäse 3
      L.goal(93, 11);
    },
  },

  // ------------------------------------------------------------ 8: Groß und klein
  {
    name: 'Groß und klein',
    theme: 'kammer',
    w: 96, h: 24, floor: 21,
    build(L) {
      L.solid(0, 21, 95, 23);
      L.start(2, 20);
      L.cheese(5, 20); L.sugar(8, 18, 8, 20);
      L.mint(11, 20);
      L.solid(13, 0, 19, 19); L.gold(16, 20); L.crumbs(14, 15, 20); L.crumbs(17, 18, 20);   // Goldkäse 1 im Spalt
      L.flag(21, 20); L.cheese(23, 20);
      L.clear(25, 21, 26, 22); L.clear(30, 21, 31, 22);
      L.scale(25, 21, 30, 21, 2); L.gold(31, 16);         // Goldkäse 2 über der gehobenen Schale
      L.solid(32, 17, 50, 20);
      L.flag(33, 16); L.mint(36, 16);
      L.solid(38, 0, 44, 15); L.crumbs(39, 43, 16);
      L.cheese(47, 16); L.sugar(49, 14, 49, 16);
      L.flag(53, 20); L.cheese(54, 20);
      L.clear(56, 21, 57, 22); L.clear(61, 21, 62, 22);
      L.scale(56, 21, 61, 21, 2);
      L.solid(63, 17, 95, 20);
      L.flag(64, 16); L.mint(66, 16);
      L.solid(68, 0, 75, 15); L.gold(72, 16); L.crumbs(69, 71, 16); L.crumbs(73, 74, 16);   // Goldkäse 3
      L.cheese(78, 16); L.sugar(81, 14, 81, 16);
      L.chocs(84, 88, 14);
      L.goal(92, 16);
    },
  },

  // ------------------------------------------------------------ 9: Hoch hinaus (Turm)
  {
    name: 'Hoch hinaus',
    theme: 'kammer',
    w: 70, h: 34, floor: 31,
    build(L) {
      L.solid(0, 31, 69, 33);
      L.start(2, 30);
      L.tip(2, 'Heute geht es hoch hinaus!', '⬆️');
      L.ladder(5, 27, 30); L.solid(6, 27, 12, 30);
      L.sleeper(9, 26);
      L.solid(13, 25, 19, 30); L.flag(14, 24); L.gold(14, 22);   // Goldkäse 1
      L.shelf(16, 18, 21);
      L.ladder(19, 19, 24); L.solid(20, 19, 24, 30);
      L.crumbs(20, 23, 18);
      // Cookie-Treppe; unten wartet ein Löffel zurück nach oben
      L.ladder(25, 19, 30);
      L.cookie(26, 17, 2); L.cookie(29, 15, 2); L.cookie(31, 13, 2);
      L.chocs(26, 27, 16); L.choc(29, 14);
      L.gold(29, 29);                                     // Goldkäse 2 unten in der Cookie-Grube
      L.solid(33, 13, 40, 30);
      L.flag(34, 12); L.crumbs(36, 39, 12);
      L.solid(41, 14, 42, 30);
      L.lift(41, 2, 13, 5, { speed: 1.4, wait: 80 }); L.gold(42, 2);   // Goldkäse 3: oben vom Aufzug springen
      L.solid(43, 5, 69, 30);
      L.flag(45, 4);
      L.sleeper(50, 4); L.chocs(49, 51, 1);
      L.cat(58, 4, 54, 62);
      L.goal(67, 4);
    },
  },

  // ------------------------------------------------------------ 10: Großes Finale
  {
    name: 'Das große Käse-Finale',
    theme: 'kammer',
    w: 120, h: 24, floor: 21,
    build(L) {
      L.solid(0, 21, 119, 23); L.clear(24, 21, 30, 23);
      L.start(2, 20);
      L.tip(2, 'Finale! Alles, was du gelernt hast.', '🏆');
      L.cheese(5, 20);
      L.cat(12, 20, 8, 17); L.chocs(11, 13, 17);
      L.sugar(19, 18, 19, 20);
      L.flag(21, 20);
      L.cookie(25, 20, 2); L.cookie(28, 19, 2); L.gold(27, 16);       // Goldkäse 1
      L.crumbs(31, 33, 20);
      L.sleeper(35, 20); L.chocs(34, 36, 17);
      L.flag(38, 20); L.cheese(40, 20);
      L.clear(43, 21, 44, 22); L.clear(48, 21, 49, 22);
      L.scale(43, 21, 48, 21, 2);
      L.solid(50, 17, 70, 20);
      L.flag(52, 16); L.mint(55, 16);
      L.solid(58, 0, 64, 15); L.gold(61, 16); L.crumbs(59, 60, 16); L.crumbs(62, 63, 16);   // Goldkäse 2
      L.crumbs(66, 69, 16);
      L.flag(73, 20);
      L.lift(77, 2, 19, 12, { speed: 1.6, wait: 70 });
      L.solid(79, 12, 119, 20);
      L.flag(81, 11);
      L.cat(85, 11, 82, 89);
      L.cheese(91, 11); L.sugar(94, 9, 94, 11);
      L.sleeper(100, 11); L.chocs(99, 101, 8);
      L.shelf(104, 107, 10); L.gold(105, 7);              // Goldkäse 3
      L.chocs(109, 113, 10);
      L.goal(116, 11);
    },
  },
];

// ================================================================ Level 11–30: aus geprüften Bausteinen zusammengesetzt
// Jeder Baustein kennt die Bodenhöhe g (Oberkante in Reihen) und füllt den Boden darunter bis ganz unten auf –
// so entstehen keine Hohlräume, in denen man festsitzen kann. Höhenwechsel: 2 hoch per Sprung, 4 per Löffel/Waage,
// 6 per Schublade, runter höchstens 4. Welche Bausteine ein Level bekommt, steht in PLAN (fest, kein Zufall beim Spielen).
// tests/kruemel-sim.test.mjs prüft jedes Level mit dem Löser.
const H = 24, GMIN = 11, GMAX = 21;

const B = {
  flat(L, x, g, o) { fill(L, x, x + 3, g); L.crumbs(x + 1, x + 2, g - 1); return [x + 4, g]; },
  up(L, x, g, o) { if (g - 2 < GMIN) return B.down(L, x, g, { d: 2 }); fill(L, x, x + 2, g); fill(L, x + 3, x + 5, g - 2); L.crumb(x + 4, g - 3); o.spots.push([x + 4, g - 5]); return [x + 6, g - 2]; },
  down(L, x, g, o = {}) { const d = Math.min(o.d || 3, GMAX - g); if (d < 2) return B.up(L, x, g); fill(L, x, x + 2, g); fill(L, x + 3, x + 5, g + d); L.crumbs(x + 3, x + 4, g + d - 1); return [x + 6, g + d]; },
  gap(L, x, g, o) {
    fill(L, x, x + 2, g); fill(L, x + 5, x + 7, g);
    L.crumb(x + 3, g - 2); L.crumb(x + 4, g - 2);
    o.spots.push([x + 3, g - 4]);
    return [x + 8, g];
  },
  cookieGap(L, x, g, o) {
    fill(L, x, x + 1, g); L.cookie(x + 3, g - 1, 2); fill(L, x + 7, x + 9, g);
    L.chocs(x + 3, x + 4, g - 3); o.spots.push([x + 5, g - 4]);
    return [x + 10, g];
  },
  shelves(L, x, g, o) {
    if (g - 6 < 3) return B.flat(L, x, g, o);
    fill(L, x, x + 10, g);
    L.shelf(x + 1, x + 3, g - 2); L.shelf(x + 4, x + 6, g - 4); L.shelf(x + 7, x + 9, g - 2);
    L.crumb(x + 2, g - 3); L.chocs(x + 4, x + 6, g - 5); L.crumb(x + 8, g - 3);
    o.spots.push([x + 5, g - 7]);
    return [x + 11, g];
  },
  ladder(L, x, g, o) {
    if (g - 4 < GMIN) return B.down(L, x, g, { d: 4 });
    fill(L, x, x + 2, g); L.ladder(x + 3, g - 4, g - 1); fill(L, x + 4, x + 7, g - 4);
    L.crumb(x + 3, g - 3); L.crumb(x + 3, g - 5); o.spots.push([x + 6, g - 7]);
    return [x + 8, g - 4];
  },
  lift(L, x, g, o) {
    if (g - 6 < GMIN) return B.down(L, x, g, { d: 4 });
    fill(L, x, x + 5, g); L.lift(x + 4, 2, g - 2, g - 6, { speed: 1.5, wait: 70 }); fill(L, x + 6, x + 9, g - 6);
    L.crumb(x + 2, g - 1); o.spots.push([x + 5, g - 9]);
    return [x + 10, g - 6];
  },
  kitten(L, x, g, o) {
    fill(L, x, x + 8, g); L.cat(x + 5, g - 1, x + 2, x + 7); L.chocs(x + 3, x + 4, g - 4); L.choc(x + 6, g - 4); o.spots.push([x + 5, g - 4]);
    return [x + 9, g];
  },
  sleeper(L, x, g, o) {
    fill(L, x, x + 9, g); L.sleeper(x + 4, g - 1); L.choc(x + 3, g - 4); L.choc(x + 5, g - 4); L.crumbs(x + 7, x + 8, g - 1); o.spots.push([x + 4, g - 4]);
    return [x + 10, g];
  },
  sugar(L, x, g, o) {
    fill(L, x, x + 7, g); L.cheese(x + 1, g - 1); L.sugar(x + 4, g - 3, x + 4, g - 1); L.crumbs(x + 5, x + 6, g - 1); o.spots.push([x + 6, g - 4]);
    return [x + 8, g];
  },
  tunnel(L, x, g, o) {
    fill(L, x, x + 11, g); L.mint(x + 1, g - 1); L.solid(x + 3, 0, x + 9, g - 2);
    L.crumbs(x + 3, x + 5, g - 1); L.crumbs(x + 7, x + 9, g - 1); o.spots.push([x + 6, g - 1]);
    return [x + 12, g];
  },
  hole(L, x, g, o) {
    if (o.intro && !o.holeTip) { o.holeTip = true; L.tip(x, 'Mauseloch! Nur klein passt hinein – reinlaufen, drüben kommst du raus', '🕳️'); }
    fill(L, x, x + 12, g); L.mint(x + 1, g - 1); L.solid(x + 4, 0, x + 8, g - 1);
    L.hole(x + 3, g - 1, x + 9, g - 1); L.crumbs(x + 10, x + 11, g - 1); o.spots.push([x + 11, g - 4]);
    return [x + 13, g];
  },
  scale(L, x, g, o) {
    if (g - 4 < GMIN || g + 2 > H - 1) return B.ladder(L, x, g, o);
    fill(L, x, x + 3, g); L.cheese(x + 1, g - 1);
    fill(L, x + 4, x + 5, g + 2); fill(L, x + 6, x + 7, g); fill(L, x + 8, x + 9, g + 2);
    L.scale(x + 4, g, x + 8, g, 2); o.spots.push([x + 9, g - 5]);
    fill(L, x + 10, x + 13, g - 4);
    return [x + 14, g - 4];
  },
  // ---- ab Level 31
  drip(L, x, g, o) {
    fill(L, x, x + 8, g); L.drip(x + 4, g - 6, 110, (x * 37) % 110); L.crumbs(x + 3, x + 5, g - 1);
    return [x + 9, g];
  },
  toaster(L, x, g, o) {
    if (g - 4 < GMIN) return B.down(L, x, g, { d: 4 });
    fill(L, x, x + 5, g); L.lift(x + 4, 2, g - 1, g - 5, { speed: 4, wait: 45, toast: true }); fill(L, x + 6, x + 9, g - 4);
    o.spots.push([x + 5, g - 8]);
    return [x + 10, g - 4];
  },
  belt(L, x, g, o) {
    fill(L, x, x + 9, g); L.belt(x + 1, x + 8, g, -1); L.crumbs(x + 2, x + 7, g - 1); L.choc(x + 5, g - 3);
    return [x + 10, g];
  },
  powder(L, x, g, o) {
    fill(L, x, x + 9, g); L.powder(x + 2, x + 3, g - 1); L.crumbs(x + 5, x + 8, g - 1); o.spots.push([x + 7, g - 4]);
    return [x + 10, g];
  },
  sponge(L, x, g, o) {
    if (g - 4 < GMIN) return B.down(L, x, g, { d: 4 });
    fill(L, x, x + 3, g); L.sponge(x + 3, g); fill(L, x + 4, x + 7, g - 4); L.chocs(x + 3, x + 3, g - 3);
    o.spots.push([x + 3, g - 7]);
    return [x + 8, g - 4];
  },
  balloonUp(L, x, g, o) {
    if (g - 6 < GMIN) return B.down(L, x, g, { d: 4 });
    fill(L, x, x + 7, g); L.balloon(x + 4, g - 1, x + 8, g - 8); fill(L, x + 8, x + 11, g - 6);
    L.crumbs(x + 2, x + 3, g - 1); o.spots.push([x + 6, g - 6]);
    return [x + 12, g - 6];
  },
  balloonDown(L, x, g, o) {
    if (g + 3 > GMAX) return B.balloonUp(L, x, g, o);
    fill(L, x, x + 2, g); L.balloon(x + 2, g - 1, x + 11, g + 2, true); fill(L, x + 11, x + 14, g + 3);
    L.chocs(x + 6, x + 7, g); o.spots.push([x + 9, g + 1]);
    return [x + 15, g + 3];
  },
  wild(L, x, g, o) {
    fill(L, x, x + 10, g); L.yarn(x + 1, g - 1); L.wild(x + 7, g - 1); L.crumbs(x + 3, x + 4, g - 1); o.spots.push([x + 4, g - 4]);
    return [x + 11, g];
  },
  hose(L, x, g, o) {
    fill(L, x, x + 10, g); L.tap(x + 1, g - 1); L.wild(x + 5, g - 1); L.crumbs(x + 7, x + 9, g - 1);   // Katze nah genug, dass man sie beim Spritzen sieht
    return [x + 11, g];
  },
  cage(L, x, g, o) {
    fill(L, x, x + 6, g); L.cage(x + 4, g - 1, x + 2, g - 1); o.cages = (o.cages || 0) + 1; L.crumb(x + 5, g - 3); o.spots.push([x + 2, g - 4]);
    return [x + 7, g];
  },
  cake(L, x, g, o) {
    const need = Math.max(1, o.cages || 0);
    fill(L, x, x + 11, g); L.cake(x + 3, g - 6, x + 8, g - 1, need, g - 2, g - 1); L.chocs(x + 4, x + 7, g - 1);   // Linsen stecken im Kuchen und tauchen beim Futtern auf
    return [x + 12, g];
  },
  sugarCage(L, x, g, o) {
    if (g - 6 < 3) return B.flat(L, x, g, o);
    fill(L, x, x + 9, g); L.cheese(x + 1, g - 1);
    L.shelf(x + 3, x + 8, g - 2); L.sugar(x + 5, g - 5, x + 7, g - 3); L.clear(x + 6, g - 4, x + 6, g - 4);
    o.cage = [x + 6, g - 4];
    return [x + 10, g];
  },
};
// Hinweise beim ersten Auftauchen eines neuen Bausteins (ab Level 31)
const INTRO = {
  drip: ['Kaffeetropfen! Warten, bis er gefallen ist – dann schnell durch', '☕'],
  toaster: ['Der Toast springt hoch – mitfahren!', '🍞'],
  belt: ['Förderband: dagegen anlaufen!', '⚙️'],
  powder: ['Backpulver macht weiße Pfoten – kurz langsamer', '🧁'],
  sponge: ['Spülschwamm federt – Springen halten für ganz hoch', '🧽'],
  balloonUp: ['Ballon: hochspringen und an der Schnur festhalten', '🎈'],
  balloonDown: ['Schlaffer Ballon: festhalten und hinüberschweben', '🎈'],
  wild: ['Wilde Katze! Erst das Wollknäuel holen', '🧶'],
  hose: ['Wasserhahn antreten – der Schlauch verjagt die Katze', '💦'],
  cage: ['Hebel antippen und den Mäusefreund befreien', '🐭'],
  cake: ['Riesenkuchen! Mit allen Freunden einen Tunnel futtern', '🎂'],
};
function fill(L, x0, x1, g) { L.solid(x0, g, x1, H - 1); }

// Ein Eintrag je Level: Welt und Bausteine von links nach rechts (Fähnchen kommen automatisch alle 2–3 Bausteine)
const PLAN = [
  // Keller – neu: Mauselöcher
  ['keller', 'Ab in den Keller', ['flat', 'hole', 'up', 'gap', 'flat', 'hole', 'down', 'shelves', 'flat']],
  ['keller', 'Geheime Gänge', ['flat', 'sugar', 'hole', 'up', 'kitten', 'tunnel', 'gap', 'shelves', 'down']],
  ['keller', 'Kellerkatzen', ['flat', 'kitten', 'up', 'hole', 'kitten', 'gap', 'ladder', 'kitten', 'down', 'flat']],
  ['keller', 'Leise im Dunkeln', ['flat', 'sleeper', 'up', 'cookieGap', 'hole', 'sleeper', 'down', 'shelves', 'flat']],
  ['keller', 'Rauf und runter', ['flat', 'ladder', 'gap', 'down', 'lift', 'shelves', 'down', 'gap', 'flat']],
  ['keller', 'Zuckerlager', ['flat', 'sugar', 'sugarCage', 'hole', 'sugar', 'up', 'gap', 'kitten', 'down']],
  ['keller', 'Die Kellerwaage', ['flat', 'scale', 'down', 'hole', 'scale', 'shelves', 'down', 'cookieGap', 'flat']],
  ['keller', 'Bröselbrücke', ['flat', 'cookieGap', 'up', 'cookieGap', 'sleeper', 'cookieGap', 'down', 'shelves', 'gap', 'flat']],
  ['keller', 'Groß, klein, groß', ['flat', 'sugar', 'tunnel', 'sugar', 'hole', 'scale', 'down', 'sugarCage', 'flat']],
  ['keller', 'Kellerfinale', ['flat', 'kitten', 'hole', 'lift', 'sleeper', 'down', 'sugar', 'cookieGap', 'tunnel', 'shelves', 'flat']],
  // Garten – alles gemischt, länger
  ['garten', 'Raus in den Garten', ['flat', 'gap', 'up', 'shelves', 'kitten', 'down', 'cookieGap', 'gap', 'flat']],
  ['garten', 'Blumenbeet', ['flat', 'ladder', 'kitten', 'gap', 'down', 'sugar', 'sugarCage', 'up', 'shelves', 'flat']],
  ['garten', 'Katzenwiese', ['flat', 'kitten', 'gap', 'kitten', 'up', 'sleeper', 'kitten', 'down', 'cookieGap', 'flat']],
  ['garten', 'Unter dem Zaun', ['flat', 'hole', 'gap', 'tunnel', 'up', 'hole', 'shelves', 'down', 'kitten', 'flat']],
  ['garten', 'Gießkannen-Hügel', ['flat', 'up', 'up', 'gap', 'down', 'lift', 'shelves', 'down', 'down', 'cookieGap', 'flat']],
  ['garten', 'Waage am Gartenhaus', ['flat', 'scale', 'kitten', 'down', 'scale', 'sugarCage', 'down', 'gap', 'sleeper', 'flat']],
  ['garten', 'Krümelpfad', ['flat', 'cookieGap', 'kitten', 'cookieGap', 'up', 'shelves', 'cookieGap', 'down', 'gap', 'cookieGap', 'flat']],
  ['garten', 'Mäusetunnel', ['flat', 'sugar', 'hole', 'tunnel', 'sugar', 'hole', 'ladder', 'kitten', 'down', 'tunnel', 'flat']],
  ['garten', 'Großer Kater, kleine Maus', ['flat', 'sleeper', 'kitten', 'up', 'sleeper', 'gap', 'scale', 'sleeper', 'down', 'cookieGap', 'kitten', 'flat']],
  ['garten', 'Der goldene Käse', ['flat', 'kitten', 'sugar', 'hole', 'lift', 'cookieGap', 'down', 'scale', 'tunnel', 'sugarCage', 'sleeper', 'down', 'gap', 'flat']],
  // Backstube – Kaffeetropfen, Toaster, Förderband, Backpulver, Schwamm, erste Mäusefreunde
  ['backstube', 'Frühstück in der Backstube', ['flat', 'drip', 'up', 'gap', 'drip', 'down', 'shelves', 'flat']],
  ['backstube', 'Toast-Express', ['flat', 'toaster', 'gap', 'down', 'drip', 'toaster', 'shelves', 'down', 'flat']],
  ['backstube', 'Am Fließband', ['flat', 'belt', 'up', 'drip', 'belt', 'gap', 'down', 'cookieGap', 'flat']],
  ['backstube', 'Weiße Pfoten', ['flat', 'powder', 'drip', 'up', 'powder', 'kitten', 'gap', 'down', 'shelves', 'flat']],
  ['backstube', 'Mäusefreunde', ['flat', 'cage', 'gap', 'up', 'cage', 'drip', 'down', 'cage', 'cake', 'flat']],
  ['backstube', 'Boing!', ['flat', 'sponge', 'gap', 'down', 'sponge', 'shelves', 'down', 'toaster', 'flat']],
  ['backstube', 'Café-Chaos', ['flat', 'kitten', 'drip', 'belt', 'sleeper', 'toaster', 'down', 'powder', 'drip', 'flat']],
  ['backstube', 'Sahnehäubchen', ['flat', 'sugar', 'cage', 'tunnel', 'cage', 'hole', 'sponge', 'cake', 'down', 'flat']],
  ['backstube', 'Ofenhitze', ['flat', 'drip', 'drip', 'up', 'belt', 'gap', 'toaster', 'down', 'cookieGap', 'shelves', 'flat']],
  ['backstube', 'Die Riesentorte', ['flat', 'cage', 'toaster', 'drip', 'cage', 'sponge', 'down', 'powder', 'cage', 'belt', 'cake', 'flat']],
  // Dachboden – Ballons hoch und runter
  ['dachboden', 'Ab unters Dach', ['flat', 'balloonUp', 'shelves', 'balloonDown', 'flat', 'balloonUp', 'down', 'flat']],
  ['dachboden', 'Staubige Kisten', ['flat', 'up', 'sponge', 'gap', 'balloonDown', 'kitten', 'down', 'shelves', 'flat']],
  ['dachboden', 'Spinnweben', ['flat', 'sleeper', 'balloonUp', 'cookieGap', 'sleeper', 'balloonDown', 'gap', 'flat']],
  ['dachboden', 'Kofferberge', ['flat', 'ladder', 'gap', 'up', 'balloonDown', 'sponge', 'shelves', 'down', 'flat']],
  ['dachboden', 'Freunde unterm Dach', ['flat', 'cage', 'balloonUp', 'cage', 'balloonDown', 'cage', 'cake', 'flat']],
  ['dachboden', 'Luftpost', ['flat', 'balloonUp', 'gap', 'balloonDown', 'balloonUp', 'cookieGap', 'balloonDown', 'flat']],
  ['dachboden', 'Löcher im Gebälk', ['flat', 'hole', 'sponge', 'hole', 'down', 'balloonUp', 'tunnel', 'down', 'flat']],
  ['dachboden', 'Schaukelpferd', ['flat', 'kitten', 'sponge', 'kitten', 'down', 'lift', 'balloonDown', 'shelves', 'flat']],
  ['dachboden', 'Leise unterm Dach', ['flat', 'sleeper', 'sponge', 'sleeper', 'balloonUp', 'sleeper', 'balloonDown', 'cookieGap', 'flat']],
  ['dachboden', 'Dachbodenfinale', ['flat', 'cage', 'balloonUp', 'sugar', 'cage', 'balloonDown', 'sponge', 'cage', 'cake', 'flat']],
  // Gartenfest am Abend – wilde Katzen, Wollknäuel, Gartenschlauch, Fürst Fauch
  ['gartenfest', 'Wilde Katzen', ['flat', 'wild', 'gap', 'up', 'wild', 'down', 'shelves', 'flat']],
  ['gartenfest', 'Wasser marsch', ['flat', 'hose', 'cookieGap', 'hose', 'up', 'gap', 'down', 'flat']],
  ['gartenfest', 'Lichterkette', ['flat', 'wild', 'balloonUp', 'gap', 'balloonDown', 'hose', 'shelves', 'flat']],
  ['gartenfest', 'Geschenkeberg', ['flat', 'sponge', 'wild', 'down', 'cage', 'hose', 'cage', 'cake', 'flat']],
  ['gartenfest', 'Lampions', ['flat', 'kitten', 'wild', 'sleeper', 'hose', 'cookieGap', 'up', 'balloonDown', 'flat']],
  ['gartenfest', 'Fauchs Vorhut', ['flat', 'gap', 'up', 'cookieGap', 'down', 'gap', 'shelves', 'flat'], { chase: true }],
  ['gartenfest', 'Partyspiele', ['flat', 'wild', 'sponge', 'hole', 'hose', 'tunnel', 'balloonUp', 'down', 'flat']],
  ['gartenfest', 'Tortenbuffet', ['flat', 'cage', 'wild', 'cage', 'powder', 'hose', 'cage', 'cake', 'flat']],
  ['gartenfest', 'Großes Gartenfest', ['flat', 'wild', 'balloonUp', 'hose', 'balloonDown', 'sleeper', 'kitten', 'sponge', 'cookieGap', 'down', 'flat']],
  ['gartenfest', 'Fürst Fauchs Jagd', ['flat', 'gap', 'up', 'cookieGap', 'down', 'gap', 'up', 'shelves', 'down', 'cookieGap', 'gap', 'flat'], { chase: true }],
];

const SEEN = new Set(['flat', 'up', 'down', 'gap', 'cookieGap', 'shelves', 'ladder', 'lift', 'kitten', 'sleeper', 'sugar', 'tunnel', 'hole', 'scale', 'sugarCage']);
function planned(theme, name, parts, intro, opt = {}) {
  const firsts = new Set(parts.filter((k) => !SEEN.has(k)));
  firsts.forEach((k) => SEEN.add(k));
  const def = {
    name, theme, w: 0, h: H, floor: H,
    build(L) {
      let x = 0, g = GMAX;
      const o = { spots: [], cage: null, intro };
      // Start
      fill(L, 0, 4, g); L.start(1, g - 1); x = 5;
      if (intro === 'keller') L.tip(0, 'Willkommen im Keller!', '🕯️');
      if (intro === 'garten') L.tip(0, 'Endlich frische Luft – ab in den Garten!', '🌻');
      if (intro === 'backstube') L.tip(0, 'Hmm, hier duftet es nach Kuchen – die Backstube!', '🥐');
      if (intro === 'dachboden') L.tip(0, 'Ganz nach oben – auf den Dachboden!', '🎈');
      if (intro === 'gartenfest') L.tip(0, 'Gartenfest! Aber Vorsicht vor den wilden Katzen', '🏮');
      if (opt.chase) { L.chase({ delay: 150 }); L.tip(0, 'Fürst Fauch ist hinter dir her – lauf!', '👑'); }
      const shown = new Set();
      parts.forEach((kind, i) => {
        if (i > 0 && i % 2 === 0) { fill(L, x, x + 1, g); L.flag(x, g - 1); x += 2; }
        if (firsts.has(kind) && !shown.has(kind) && INTRO[kind]) { shown.add(kind); L.tip(x, INTRO[kind][0], INTRO[kind][1]); }
        [x, g] = B[kind](L, x, g, o);
      });
      // Ziel
      fill(L, x, x + 5, g); L.goal(x + 3, g - 1);
      // Goldkäse: Käfig zuerst, sonst gleichmäßig über die markierten Stellen verteilt
      const spots = o.spots.slice();
      const pick = [];
      if (o.cage) pick.push(o.cage);
      const need = 3 - pick.length;
      const step = spots.length / need;
      for (let k = 0; k < need && k < spots.length; k++) pick.push(spots[Math.min(spots.length - 1, Math.floor((k + 0.5) * step))]);
      pick.forEach(([gx, gy]) => L.gold(gx, gy));
      return x + 6;
    },
  };
  // Breite vorab mit einem Leerlauf bestimmen (alle Befehle tun nichts)
  def.w = def.build(new Proxy({}, { get: () => () => {} }));
  return def;
}

const WELT_START = { 0: 'keller', 10: 'garten', 20: 'backstube', 30: 'dachboden', 40: 'gartenfest' };
PLAN.forEach(([theme, name, parts, opt], i) => LEVELS.push(planned(theme, name, parts, WELT_START[i] || null, opt)));
export const LEVEL_COUNT = LEVELS.length;
