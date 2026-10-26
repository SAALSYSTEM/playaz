// Wasser Marsch! – 25 feste Level in 6 Szenen. Level 1–20: Leiter fährt automatisch (Katze antippen).
// Level 21–25 ("ladder":"manual"): das Kind zieht den Rettungskorb selbst zum Katzenfenster; Feuer, Katzen und Szenen von Hand festgelegt.
// Feuer, Wassermengen und Katzen 1:1 aus design/wasser-marsch/briefing/levels.json (schemaVersion 1).
// Fenster-IDs: b{Haus}-r{Reihe von oben}-c{Spalte}, nullbasiert. Gebäudeanordnung je Szene: SCENE_LAYOUT in engine.js.
export const SCENES = [
  {"id":1,"name":"Das kleine Haus","profiles":["small"]},
  {"id":2,"name":"Zwei kleine Nachbarn","profiles":["small","small"]},
  {"id":3,"name":"Das Wohnhaus","profiles":["row"]},
  {"id":4,"name":"Der Innenhof","profiles":["row","row"]},
  {"id":5,"name":"Die hohen Häuser","profiles":["tower4","tower3"]},
  {"id":6,"name":"Die große Stadtstraße","profiles":["tower3","tower5","tower4"]}
];

export const LEVELS = [
  {"id":1,"scene":1,"title":"Wasser marsch","fires":[{"window":"b0-r0-c0","waterSeconds":1.9}],"cats":[],"hint":"holdToSpray"},
  {"id":2,"scene":1,"title":"Die andere Seite","fires":[{"window":"b0-r1-c1","waterSeconds":2}],"cats":[],"hint":null},
  {"id":3,"scene":1,"title":"Zwei Fenster","fires":[{"window":"b0-r0-c1","waterSeconds":2.1},{"window":"b0-r1-c0","waterSeconds":2.6}],"cats":[],"hint":null},
  {"id":4,"scene":2,"title":"Hallo Nachbar","fires":[{"window":"b0-r0-c0","waterSeconds":2.2},{"window":"b1-r0-c1","waterSeconds":2.7}],"cats":[],"hint":null},
  {"id":5,"scene":2,"title":"Links und rechts","fires":[{"window":"b0-r1-c1","waterSeconds":2.3},{"window":"b1-r0-c0","waterSeconds":2.8},{"window":"b1-r1-c1","waterSeconds":2.3}],"cats":[],"hint":null},
  {"id":6,"scene":2,"title":"Die kleine Straße","fires":[{"window":"b0-r0-c1","waterSeconds":2.4},{"window":"b0-r1-c0","waterSeconds":2.9},{"window":"b1-r0-c0","waterSeconds":2.4},{"window":"b1-r1-c1","waterSeconds":2.9}],"cats":[],"hint":null},
  {"id":7,"scene":3,"title":"Die erste Katze","fires":[{"window":"b0-r2-c0","waterSeconds":2.5}],"cats":[{"window":"b0-r0-c1","unlock":"buildingFiresCleared"}],"hint":"tapCatAfterClearingHouse"},
  {"id":8,"scene":3,"title":"Ein Stockwerk höher","fires":[{"window":"b0-r0-c0","waterSeconds":2.6},{"window":"b0-r1-c1","waterSeconds":3.1}],"cats":[{"window":"b0-r2-c1","unlock":"buildingFiresCleared"}],"hint":null},
  {"id":9,"scene":3,"title":"Freier Weg zum Korb","fires":[{"window":"b0-r0-c1","waterSeconds":2.7},{"window":"b0-r1-c0","waterSeconds":3.2},{"window":"b0-r2-c1","waterSeconds":2.7}],"cats":[{"window":"b0-r1-c1","unlock":"buildingFiresCleared"}],"hint":null},
  {"id":10,"scene":3,"title":"Zwei kleine Freunde","fires":[{"window":"b0-r1-c0","waterSeconds":2.8},{"window":"b0-r2-c1","waterSeconds":3.3}],"cats":[{"window":"b0-r0-c0","unlock":"buildingFiresCleared"},{"window":"b0-r0-c1","unlock":"buildingFiresCleared"}],"hint":null},
  {"id":11,"scene":4,"title":"Rettung im Innenhof","fires":[{"window":"b0-r0-c0","waterSeconds":2.9},{"window":"b1-r1-c1","waterSeconds":3.4},{"window":"b1-r2-c0","waterSeconds":2.9}],"cats":[{"window":"b0-r1-c1","unlock":"buildingFiresCleared"}],"hint":null},
  {"id":12,"scene":4,"title":"Wer wartet wo","fires":[{"window":"b0-r2-c0","waterSeconds":3},{"window":"b1-r0-c1","waterSeconds":3.5}],"cats":[{"window":"b0-r0-c1","unlock":"buildingFiresCleared"},{"window":"b1-r2-c1","unlock":"buildingFiresCleared"}],"hint":null},
  {"id":13,"scene":4,"title":"Über Kreuz","fires":[{"window":"b0-r0-c1","waterSeconds":3},{"window":"b0-r2-c1","waterSeconds":3.5},{"window":"b1-r0-c0","waterSeconds":3},{"window":"b1-r2-c0","waterSeconds":3.5}],"cats":[{"window":"b0-r1-c0","unlock":"buildingFiresCleared"},{"window":"b1-r1-c1","unlock":"buildingFiresCleared"}],"hint":null},
  {"id":14,"scene":5,"title":"Hoch hinaus","fires":[{"window":"b0-r0-c0","waterSeconds":3},{"window":"b0-r3-c1","waterSeconds":3.5},{"window":"b1-r1-c0","waterSeconds":3}],"cats":[{"window":"b0-r2-c1","unlock":"buildingFiresCleared"}],"hint":null},
  {"id":15,"scene":5,"title":"Ganz oben wartet jemand","fires":[{"window":"b0-r1-c0","waterSeconds":3},{"window":"b1-r0-c1","waterSeconds":3.5},{"window":"b1-r2-c0","waterSeconds":3}],"cats":[{"window":"b0-r0-c1","unlock":"buildingFiresCleared"},{"window":"b1-r1-c1","unlock":"buildingFiresCleared"}],"hint":null},
  {"id":16,"scene":5,"title":"Große Fenster kleine Feuer","fires":[{"window":"b0-r0-c0","waterSeconds":3},{"window":"b0-r2-c1","waterSeconds":3.5},{"window":"b0-r3-c0","waterSeconds":3},{"window":"b1-r0-c1","waterSeconds":3.5},{"window":"b1-r2-c1","waterSeconds":3}],"cats":[{"window":"b0-r1-c1","unlock":"buildingFiresCleared"},{"window":"b1-r1-c0","unlock":"buildingFiresCleared"}],"hint":null},
  {"id":17,"scene":6,"title":"Drei Häuser","fires":[{"window":"b0-r0-c0","waterSeconds":3},{"window":"b1-r2-c1","waterSeconds":3.5},{"window":"b2-r3-c0","waterSeconds":3}],"cats":[{"window":"b1-r0-c1","unlock":"buildingFiresCleared"}],"hint":null},
  {"id":18,"scene":6,"title":"Freunde über der Stadt","fires":[{"window":"b0-r1-c0","waterSeconds":3},{"window":"b1-r4-c1","waterSeconds":3.5},{"window":"b2-r0-c0","waterSeconds":3},{"window":"b2-r2-c1","waterSeconds":3.5}],"cats":[{"window":"b0-r0-c1","unlock":"buildingFiresCleared"},{"window":"b2-r1-c1","unlock":"buildingFiresCleared"}],"hint":null},
  {"id":19,"scene":6,"title":"Die große Rettungsrunde","fires":[{"window":"b0-r0-c0","waterSeconds":3},{"window":"b0-r2-c1","waterSeconds":3.5},{"window":"b1-r1-c1","waterSeconds":3},{"window":"b1-r3-c0","waterSeconds":3.5},{"window":"b2-r2-c0","waterSeconds":3}],"cats":[{"window":"b0-r1-c1","unlock":"buildingFiresCleared"},{"window":"b1-r0-c0","unlock":"buildingFiresCleared"},{"window":"b2-r0-c1","unlock":"buildingFiresCleared"}],"hint":null},
  {"id":20,"scene":6,"title":"Unsere Feuerwehr schafft das","fires":[{"window":"b0-r0-c1","waterSeconds":3},{"window":"b0-r2-c0","waterSeconds":3.5},{"window":"b1-r1-c0","waterSeconds":3},{"window":"b1-r4-c1","waterSeconds":3.5},{"window":"b2-r1-c1","waterSeconds":3},{"window":"b2-r3-c0","waterSeconds":3.5}],"cats":[{"window":"b0-r1-c0","unlock":"buildingFiresCleared"},{"window":"b1-r0-c1","unlock":"buildingFiresCleared"},{"window":"b2-r0-c0","unlock":"buildingFiresCleared"}],"hint":null},
  {"id":21,"scene":3,"title":"Leiter lenken","fires":[{"window":"b0-r1-c1","waterSeconds":1.8}],"cats":[{"window":"b0-r2-c0","unlock":"buildingFiresCleared"}],"hint":"dragBasket","ladder":"manual"},
  {"id":22,"scene":3,"title":"Etwas höher","fires":[{"window":"b0-r2-c1","waterSeconds":2.0}],"cats":[{"window":"b0-r1-c0","unlock":"buildingFiresCleared"}],"hint":null,"ladder":"manual"},
  {"id":23,"scene":4,"title":"Zwei Katzen nacheinander","fires":[{"window":"b0-r1-c0","waterSeconds":2.2},{"window":"b1-r1-c1","waterSeconds":2.2}],"cats":[{"window":"b0-r2-c1","unlock":"buildingFiresCleared"},{"window":"b1-r1-c0","unlock":"buildingFiresCleared"}],"hint":null,"ladder":"manual"},
  {"id":24,"scene":5,"title":"Ganz weit oben","fires":[{"window":"b0-r3-c0","waterSeconds":2.4},{"window":"b1-r2-c1","waterSeconds":2.4}],"cats":[{"window":"b0-r0-c1","unlock":"buildingFiresCleared"},{"window":"b1-r1-c0","unlock":"buildingFiresCleared"}],"hint":null,"ladder":"manual"},
  {"id":25,"scene":6,"title":"Die große Leiterrettung","fires":[{"window":"b0-r2-c0","waterSeconds":2.5},{"window":"b1-r4-c1","waterSeconds":2.5},{"window":"b2-r3-c0","waterSeconds":2.5}],"cats":[{"window":"b0-r1-c1","unlock":"buildingFiresCleared"},{"window":"b1-r0-c0","unlock":"buildingFiresCleared"},{"window":"b2-r1-c1","unlock":"buildingFiresCleared"}],"hint":null,"ladder":"manual"}
];

export const LEVEL_COUNT = LEVELS.length;
