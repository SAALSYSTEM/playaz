# Schach

Fünftes Spiel der Kategorie **Brettspiele**, Aufbau wie [Dame](DAME.md): dieselben drei Computergegner
(Opa Willi · Gemütlich, Tante Gisela · Geübt, Professor Mühlberg · Meister), zu zweit an einem Gerät,
Zug zurück (nicht gegen den Meister), Aufgeben, Weiterspielen nach dem Neuladen, Bilanz je Gegner, Teilen.

## Regeln (wie in `engine.js`)

Alle FIDE-Regeln: Rochade (nicht aus, durch oder ins Schach), en passant, Umwandlung mit Wahl, Matt, Patt,
dreifache Wiederholung, 50-Züge-Regel, zu wenig Material (nur Könige, ein Leichtfigur, nur Läufer auf gleicher Feldfarbe).
Der Zuggenerator ist mit Perft gegen die bekannten Zahlen von sechs Teststellungen geprüft.

## Computergegner

Alpha-Beta mit Transpositionstabelle (Zobrist), Ruhesuche (Schläge und Umwandlungen), Schachverlängerung, Nullzug,
Killer- und History-Ordnung, iterative Vertiefung. Bewertung: Material, Figurentabellen (Mittel-/Endspiel für den König), Läuferpaar.
Kleines Eröffnungsbuch für die ersten Züge.
Gemütlich: 1 Halbzug plus Ruhesuche, wählt unter Zügen bis 0,9 Bauern schlechter, 12 % Zufallszüge · Geübt: 3 Halbzüge, 2 % Zufallszüge · Meister: 1 s (am Rechner 6–8 Halbzüge).

## Bedienung

Figur antippen, dann Ziel: Punkte für freie Felder, Ringe für Schlagzüge. Rochade: König zwei Felder zur Seite.
Umwandlung über eine Auswahl. König im Schach leuchtet rot. Spielt der Mensch Schwarz, wird das Brett gedreht.
Hinweiszeile zeigt den letzten Zug des Gegners in deutscher Notation (K, D, T, L, S).

## Dateien

- `public/spiele/schach.html`, `schach/engine.js`, `schach/ki.js` (Web Worker), `schach/game.js`, Speicherstand `schach.v1`
- Bilder: Figuren in `schach/img/` (`w`/`s` + `k d t l s b`, Originale in `design/schach/`, `python3 tools/schach-assets.py`); Brett von Dame, Gegner aus `muehle/img/`
- `supabase/migrations/20261028220000_schach.sql` – Katalogeintrag, beim Veröffentlichen ausführen

## Test

`node --test tests/schach-sim.test.mjs` – Perft, Zugrücknahme, Matt, Patt, en passant, Rochade, Umwandlung, Notation, Remisregeln,
Kodierung, Matt in eins, Stufen-Turniere, Zeitlimit des Meisters.
