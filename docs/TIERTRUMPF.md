# Tiertrumpf

Eigenständiges, kindgerechtes Ablegespiel für PlaySaal (`/spiele/tiertrumpf`). Ab 4 Jahren, Handy im Hochformat, auch Tablet und Rechner. Allein gegen Fuchs Fiete, ohne Anmeldung, ohne Zeitdruck. Eigenes Kartenbild (Tierfenster, Formsymbole je Farbe); keine Logos, Originalgrafiken oder Layouts anderer Kartenspiele.

## Regeln

- Beide erhalten fünf Karten, das Kind beginnt. Die erste offene Karte ist immer eine Tierkarte.
- Eine Karte passt bei **gleicher Farbe** oder **gleichem Tier**. Jedes Tier hat eine feste Zahl: Elefant 1, Panda 2, Frosch 3, Katze 4, Löwe 5, Hase 6. Jede Farbe hat zusätzlich ein Formsymbol (Rot Kreis, Blau Raute, Grün Dreieck, Gelb Quadrat), damit Farben auch ohne Farbsehen unterscheidbar sind.
- Stufe 1 **Entdecken**: 48 Tierkarten (6 Tiere × 4 Farben × 2).
- Stufe 2 **Zaubern**: zusätzlich 4 Farbwechsel (52 Karten). Passt immer; Farbe wünschen.
- Stufe 3 **Abenteuer**: zusätzlich je Farbe eine Pause und eine +1 (60 Karten). Pause: der andere setzt aus. +1: der andere zieht genau eine Karte und setzt aus. Bei zwei Spielern ist der Ausspielende sofort wieder dran. Kein Stapeln. Pause passt auf Pause, +1 auf +1 (gleiches Motiv).
- Ziehen nur, wenn nichts passt. Passt die gezogene Karte, darf nur sie sofort gelegt oder behalten werden („Ablegen“ / „Behalten“). Sonst endet der Zug.
- Leere Hand gewinnt sofort, auch mit einer Sonderkarte als letzter Karte (Wirkung entfällt). Ein Farbwechsel als letzte Karte braucht keine Farbwahl. Kein Ruf, keine Strafkarten.
- Leerer Nachziehstapel: Ablage ohne oberste Karte neu mischen. Können beide bei erschöpftem Stapel weder ziehen noch legen, endet die Runde unentschieden.
- Fiete sieht nur seine eigene Hand und die offenen Karten (Test: gleiche Fiete-Hand und Ablage → gleicher Zug, egal wie Kinderhand und Stapel aussehen). Er legt bevorzugt seine häufigste Farbe, hebt Farbwechsel auf und wünscht sich seine häufigste Farbe. Keine manipulierten Ziehergebnisse.

## Bedienung

- Passende Karten leuchten gelb und heben sich, die anderen sind leicht abgeblendet, bleiben aber erkennbar. Die Hand ist nach Farbe und Zahl sortiert.
- Kartenhand ohne Scrollen: Die Kartengröße wird je nach Anzahl und Platz berechnet (`handLayout` in `game.js`, mehrere Reihen, Mindestbreite 58 px). Erst bei sehr vielen Karten überlappen sie; ein Streifen jeder Karte bleibt antippbar. Geprüft für 320×568 bis Tablet mit 5–22 Karten.
- Passt nichts, wippt ein Finger über dem Nachziehstapel. Tippt das Kind eine unpassende Karte oder den Stapel, obwohl etwas passt, wackelt die Karte und ein Hinweis erscheint (mit Vorlesen auch gesprochen).
- Farbwahl: vier große Farbfelder mit Formsymbol und Namen, „Zurück“ bricht ab.
- Sonderkarten zeigen ihre Wirkung: Mond mit „Zzz“ beim Aussetzen, eine Karte fliegt beim +1 zum anderen, das Farbfeld unter der Ablage springt bei neuer Farbe.
- Animationen sperren alle Eingaben, bis sie fertig sind (`busy`); Doppeltipps lösen keinen zweiten Zug aus. Bei „Bewegung reduzieren“ entfallen Animationen.
- Vorlesen (Knopf oben): Browser-Sprachausgabe auf Deutsch, sagt was gilt („Leg Rot oder einen Hasen“), was Fiete gelegt hat und wer dran ist. Gibt es keine deutsche Stimme, sagt das Spiel das und bleibt stumm. Ohne Sprach-API wird der Knopf ausgeblendet.
- Ton: kleine selbst erzeugte Klänge (WebAudio), Schalter oben und im Menü (`tiertrumpf.muted`).
- Tastatur: Karten, Stapel und Knöpfe sind echte Buttons; Fokus bleibt beim Neuzeichnen erhalten.

## Speichern

- `tiertrumpf.v1` = `{ v: 1, level, game, bilanz: { s, n, u }, voice }`. `game` ist der Engine-Zustand der laufenden Runde und wird beim Laden streng geprüft (jede Karte genau einmal, Identität unverändert, unbekannte Felder werden entfernt). Beschädigte Runden werden verworfen, die Bilanz bleibt.
- Gespeichert wird nach jedem Zug (vor der Animation), beim Verstecken der Seite und beim Verlassen. Nach dem Neuladen bietet das Menü „Weiterspielen“; „Neue Runde“ ersetzt die laufende Runde erst nach einem zweiten Tipp.
- Fiete spielt nicht, solange ein Dialog offen oder die Seite verdeckt ist.
- Ohne Konto bleibt alles auf dem Gerät. Mit PlaySaal-Konto synchronisiert `playsaal.js` den Präfix `tiertrumpf.` wie bei den anderen Spielen (Katalog-Eintrag: `supabase/migrations/20261031200000_tiertrumpf.sql`, vom Betreiber auszuführen). Nach 3 Runden zeigt das Ergebnis ohne Anmeldung den Hinweis „Bilanz sichern“.

## Grafik

- Zahlen, Formsymbole, Sonderkarten (Regenbogen, Mond, +1), Kartenrücken und Farbfelder zeichnet das Spiel selbst (scharf in jeder Größe).
- Tiere, Fiete (drei Posen), Hintergrund, Kachel und Teilen-Vorschau sind ChatGPT-Bilder (geliefert 31.10.2026). Fehlt ein Bild, zeigt das Spiel ein System-Emoji als Platzhalter. Prompts: `design/tiertrumpf/PROMPTS.md`. Fertige PNGs nach `design/tiertrumpf/` legen und `python3 tools/tiertrumpf-assets.py` ausführen: schreibt `public/spiele/tiertrumpf/img/*.webp` und `manifest.json`; das Spiel nutzt jedes vorhandene Bild, der Rest bleibt Platzhalter. Ein Tierbild gilt für alle vier Farben.
- Kachel `public/bilder/tiertrumpf.webp` und Teilen-Vorschau `public/bilder/tiertrumpf-og.jpg` erzeugt das Asset-Skript aus `kachel.png` / `social-preview.png`; `tools/tiertrumpf-platzhalter.mjs` zeichnet nur Ersatz, falls diese fehlen.

## Hosting und Pfade

- Seite `public/spiele/tiertrumpf.html`, Dateien in `public/spiele/tiertrumpf/`. Cloudflare (Static Assets, `html_handling` Standard) liefert `/spiele/tiertrumpf` aus der HTML-Datei; `/spiele/tiertrumpf.html` leitet dorthin um. Geprüft mit `wrangler dev`.
- Alle Pfade auf der Seite sind absolut (`/spiele/tiertrumpf/…`, `/assets/…`), damit sie auch bei `/spiele/tiertrumpf/` mit Schrägstrich stimmen; Bilder lädt `game.js` relativ zu sich selbst.

## Dateien und Prüfung

- `engine.js`: Regeln, Decks, KI, strenges Laden. Kein DOM.
- `game.js`, `style.css`: Oberfläche, Layout, Animation, Vorlesen, Ton, Speichern.
- `node --test tests/tiertrumpf-sim.test.mjs`: Grenzfälle, 900 KI-Partien, 300 Partien mit zufälligem Kind, Fairness der KI, Laden.
- `node --test tests/tiertrumpf-browser.test.mjs`: je Stufe drei ganze Runden über die Oberfläche (360×640), Doppeltipp, Fortsetzen, beschädigter Spielstand, verdeckte Seite, Kartenhand auf 320×568 bis 768×1024 mit 5–22 Karten, Pfade.

Nicht Teil dieser Version: Online-Mehrspieler, Ranglisten, Spielwährung. Keine echte iPhone-/Safari-Abnahme durch die Entwicklung.
