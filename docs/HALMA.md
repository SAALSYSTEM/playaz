# Halma

Viertes Spiel der Kategorie **Brettspiele**, Aufbau wie [Dame](DAME.md): dieselben drei Computergegner
(Opa Willi · Gemütlich, Tante Gisela · Geübt, Professor Mühlberg · Meister), zu zweit an einem Gerät,
Zug zurück (nicht gegen den Meister), Weiterspielen nach dem Neuladen, Bilanz je Gegner, Teilen.

## Regeln (wie in `engine.js`)

16×16 Felder, je 19 Steine in einer Ecke (Reihen zu 5, 5, 4, 3, 2). Hell steht unten links und beginnt, Dunkel oben rechts.
Ein Stein zieht ein Feld in jede der acht Richtungen auf ein freies Feld oder springt über einen benachbarten Stein (eigen oder fremd)
auf das freie Feld dahinter, beliebig oft hintereinander und in jede Richtung. Es wird nichts geschlagen. Alle über Sprungketten
erreichbaren Felder zählen als ein Zug.
Gewonnen hat, wer alle 19 Steine im gegenüberliegenden Lager hat. Gegen Blockieren mit einzelnen Steinen im eigenen Lager gilt auch:
Zielfeld voll und mindestens 17 eigene Steine darin. Remis nach 200 Zügen je Seite (`MAX_ZUEGE`).

## Computergegner

Bewertung: Summe der Fortschritte aller eigenen Steine (Weg zur Zielecke, leicht gewölbt, damit Nachzügler zählen) minus die des Gegners.
Es werden nur die besten Kandidaten nach Sofortgewinn weiterverfolgt, darunter Alpha-Beta.
Gemütlich: nur der Sofortwert plus kräftiges Rauschen, 8 % Fehlgriffe · Geübt: 3 Halbzüge, 10 Kandidaten · Meister: ca. 0,9 s, 12 Kandidaten je Stufe, iterative Vertiefung.

## Bedienung

Stein antippen, dann ein gelbes Zielfeld (Schritte und ganze Sprungketten sind gleich markiert). Trifft der Finger knapp daneben, gilt das nächste gelbe Feld in Reichweite.
Spielt der Mensch Dunkel (Computer beginnt), wird das Brett um 180° gedreht, damit die eigenen Steine unten links stehen.

## Dateien

- `public/spiele/halma.html`, `halma/engine.js`, `halma/ki.js` (Web Worker), `halma/game.js`, Speicherstand `halma.v1`
- Bilder: Brett und zwei Steine in `halma/img/` (Originale in `design/halma/`, `python3 tools/halma-assets.py`, das auch das Raster des Brettbilds ausmisst: `GX/GY/GS` in `game.js`); Gegner-Avatare aus `muehle/img/`
- `supabase/migrations/20261025000500_halma.sql` – Katalogeintrag, beim Veröffentlichen ausführen

## Test

`node --test tests/halma-sim.test.mjs` – Startstellung, Schritte, Sprünge und Ketten, Weg, Zug exakt zurücknehmbar, Kodierung, Sieg und Blockierregel,
Remis, Stufen-Turniere, Zeitlimit des Meisters.
