# Mühle

Brettspiel-Klassiker (Neunmühle) im Hochformat, erstes Spiel der geplanten Kategorie **Brettspiele**.

## Stand

- Gegen den Computer in drei Stufen, jeweils mit eigener Figur:
  - **Opa Willi · Gemütlich**: rechnet 1 Halbzug voraus, macht in 20 % der Züge einen zufälligen Zug
  - **Tante Gisela · Geübt**: rechnet 3 Halbzüge voraus, wählt unter fast gleich guten Zügen zufällig
  - **Professor Mühlberg · Meister**: Alpha-Beta mit Transpositionstabelle, iterative Vertiefung, ca. 0,9 s Bedenkzeit (am Rechner 9–12 Halbzüge tief); kein „Zug zurück“
- Wahl „Ich beginne (hell)“ / „Computer beginnt“; Revanche tauscht die Farben
- **Zu zweit an einem Gerät** (Hell unten, Dunkel oben)
- „Zug zurück“ (nicht gegen den Meister), laufende Partie wird gespeichert und lässt sich nach dem Neuladen fortsetzen
- Bilanz je Gegner (Siege/Remis/Niederlagen), Teilen-Knopf nach der Partie
- Noch `noindex`, nicht auf der Startseite und nicht in der Sitemap

## Regeln (wie in `engine.js`)

9 Steine je Seite, Hell beginnt. Setzen, dann Ziehen auf Nachbarpunkte, mit 3 Steinen Springen. Mühle → einen gegnerischen Stein nehmen, der in keiner Mühle steht (stehen alle in Mühlen, darf jeder genommen werden; zwei Mühlen auf einmal = ein Stein). Verloren: weniger als 3 Steine oder kein Zug möglich. Remis: dritte Wiederholung derselben Stellung oder 50 Züge je Seite ohne Schlagen (beides nur in der Zugphase).

## Dateien

- `public/spiele/muehle.html` – Seite, Schirme, Stil
- `public/spiele/muehle/engine.js` – Regeln, Partie-Kodierung (3 Zeichen je Zug), Bewertung, Suche
- `public/spiele/muehle/ki.js` – Web Worker für den Computergegner (Rückfall: Rechnen im Hauptthread)
- `public/spiele/muehle/game.js` – Zeichnen (Brett-Linien und Punkte im Code), Bedienung, Ton, Speicherstand `muehle.v1`
- Bilder: Originale von ChatGPT in `design/muehle/`, umgewandelt mit `python3 tools/muehle-assets.py`
  - vorhanden: Holz, heller und dunkler Stein, Opa Willi, Kachel, Social Preview
  - fehlen noch: `gegner-geuebt.png` (Tante Gisela) und `gegner-meister.png` (Professor Mühlberg); bis dahin Buchstaben-Platzhalter
- `supabase/migrations/20261024210000_muehle.sql` – Kategorie „Brettspiele“ und Katalogeintrag; **erst beim Veröffentlichen ausführen**

## Test

`node --test tests/muehle-sim.test.mjs` – Brettgeometrie, Setzen/Ziehen/Springen, geschützte Steine, Blockade, Wiederholung, Zugrücknahme exakt, Kodierung, Stufen-Turniere (Gemütlich schlägt Zufall, Geübt schlägt Gemütlich, Meister schlägt Geübt), Zeitlimit des Meisters.

## Veröffentlichen (Checkliste)

1. `noindex` aus `muehle.html` entfernen, Seite in `sitemap.xml`
2. Kachel auf der Startseite (`data-kategorien="brettspiele,raetsel"`, Bild `/bilder/muehle.webp`), „Weiterspielen“-Eintrag
3. `['brettspiele', 'Brettspiele']` in `kategorien` von `playsaal-config.js`
4. Migration ausführen

## Ideen für später

Einladungslink für Partien gegen Freunde (Räume wie bei Murmelrausch), „Mühle-Aufgabe des Tages“ mit geprüfter Tagesrangliste.
