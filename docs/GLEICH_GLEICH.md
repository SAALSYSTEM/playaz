# Gleich, gleich!

Paare-Suchspiel für Kinder ab 4 (`/spiele/gleich-gleich`). Handy im Hochformat, auch Tablet und Rechner. Ohne Anmeldung, ohne Zeitdruck, kein Scheitern. Name bewusst nicht „Memory“ (Marke von Ravensburger).

## Spielweise

- Zwei Karten antippen. Gleiches Bild = Paar, bleibt aufgedeckt liegen (blass, mit Ring in der Farbe des Finders), man ist nochmal dran. Sonst drehen sich beide nach kurzer Pause wieder um.
- Drei Arten (im Menü, gemerkt): **Allein** (Sterne nach Fehlversuchen: höchstens so viele wie Paare = 3, bis doppelt so viele = 2, sonst 1), **Gegen Fiete** (gewonnen 3, unentschieden 2, verloren 1 Stern), **Zu zweit** an einem Gerät (Spieler 1 orange, Spieler 2 blau, keine Sterne).
- 21 Level in 7 Welten: Bauernhof (3/4/6 Paare), Tierfreunde (4/6/6), Krümels Küche (4/6/8), Dino-Dschungel (6/6/8), Hexenküche, Feuerwehr, Feenwelt (je 6/8/8). Motive je Partie zufällig aus der Welt, Karten gemischt.
- Ein Level ist frei, sobald das vorige mindestens einen Stern hat (allein oder gegen Fiete).

## Fuchs Fiete

- Sieht jede aufgedeckte Karte, merkt sie sich aber nur mit einer festen Wahrscheinlichkeit je Welt (20 % im Bauernhof bis 50 % in der Feenwelt). Er nutzt nur sein Gedächtnis und offen liegende Karten (Test: verdeckte, ungesehene Motive tauschen ändert seinen Zug nicht).
- Abgestimmt mit einem Kind-Modell, das sich die Hälfte merkt: Das Kind gewinnt in allen Welten öfter als Fiete, Fiete gewinnt aber regelmäßig (`tests/gleich-gleich-sim.test.mjs`).

## Bedienung

- Vorlesen (Standard an): Name jeder aufgedeckten Karte, „Gleich, gleich!“ beim Paar, wer dran ist. Browser-Sprachausgabe auf Deutsch; ohne deutsche Stimme bleibt das Spiel stumm, ohne Sprach-API ist der Knopf ausgeblendet.
- Ton: kleine selbst erzeugte Klänge (WebAudio), Schalter oben (`gleichgleich.muted`).
- Kartengröße und Spaltenzahl rechnet `raster()` aus dem freien Platz (3:4-Karten, keine leere Reihe). Geprüft: 16 Karten ohne Scrollen von 320×568 bis 1280×720, Karten mindestens 58 px breit.
- Bewegung reduzieren: keine Dreh- und Sternanimationen.

## Speichern

- `gleichgleich.v1` = `{ v: 1, best: { level: sterne }, modus, voice }`, beim Laden streng geprüft. Runden sind kurz, eine laufende Runde wird nicht gespeichert.
- Mit PlaySaal-Konto synchronisiert `playsaal.js` den Präfix `gleichgleich.` (Katalog: `supabase/migrations/20261107090000_gleich_gleich.sql`, vom Betreiber auszuführen). Ohne Anmeldung erscheint ab 2 geschafften Leveln im Menü (und nach Level 2, 5, 10, 15, 21) der Hinweis „Sterne sichern“.

## Grafik

- Alle Motive stammen aus vorhandenen PlaySaal-Spielen (Ab in den Stall, Tiertrumpf, Krümel, Dino-Leiterhelden, Hexis Zaubersuppe, Wasser Marsch!, Sternenpups), Fiete aus Tiertrumpf. `python3 tools/gleich-gleich-assets.py` schneidet sie zu (Sprite-Blätter: erstes Bild), stellt sehr schmale Motive schräg und schreibt `public/spiele/gleich-gleich/img/*.webp`.
- Neu von ChatGPT (geliefert 07.11.2026, in `design/gleich-gleich/`): Kartenrückseite, Kachel (`public/bilder/gleich-gleich.webp`), Teilen-Vorschau (`public/bilder/gleich-gleich-og.jpg`). Dasselbe Skript wandelt sie um.

## Dateien und Prüfung

- `engine.js`: Welten, Level, Regeln, Fiete, Sterne, Raster, Laden. Kein DOM.
- `game.js`, `style.css`: Oberfläche, Vorlesen, Ton, Speichern, Konto-Hinweis.
- `node --test tests/gleich-gleich-sim.test.mjs && node --test --test-concurrency=1 tests/gleich-gleich-browser.test.mjs`
