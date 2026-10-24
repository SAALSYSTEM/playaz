# Dame

Zweites Spiel der Kategorie **Brettspiele**, Aufbau wie [Mühle](MUEHLE.md): dieselben drei Computergegner
(Opa Willi · Gemütlich, Tante Gisela · Geübt, Professor Mühlberg · Meister), zu zweit an einem Gerät,
Zug zurück (nicht gegen den Meister), Weiterspielen nach dem Neuladen, Bilanz je Gegner, Teilen.

## Regeln (wie in `engine.js`)

8×8, je 12 Steine auf den dunklen Feldern, Hell beginnt. Steine ziehen ein Feld schräg vorwärts und schlagen vorwärts wie rückwärts.
Schlagpflicht (freie Wahl zwischen Schlägen, kein Mehrheitszwang), Mehrfachsprung muss zu Ende geführt werden, geschlagene Steine
verschwinden erst am Zugende. Dame nur, wenn der Zug auf der Grundreihe endet; sie zieht und schlägt beliebig weit (fliegende Dame).
Verloren: kein Zug mehr. Remis: dritte Wiederholung oder 25 Züge je Seite nur mit Damen ohne Schlagen.

## Computergegner

Alpha-Beta mit Transpositionstabelle; Schläge werden am Suchhorizont zu Ende gerechnet, Zwangszüge kosten keine Tiefe.
Gemütlich: 2 Halbzüge, 20 % Zufallszüge · Geübt: 4 Halbzüge · Meister: ca. 0,9 s (am Rechner 8–9 Halbzüge plus Schlagfolgen).

## Bedienung

Stein antippen, dann Ziel. Bei Schlagpflicht leuchten die Steine orange, die schlagen müssen. Mehrfachsprung: Landefelder nacheinander antippen.
Spielt der Mensch Dunkel (Computer beginnt), wird das Brett gedreht, damit die eigenen Steine unten stehen.

## Dateien

- `public/spiele/dame.html`, `dame/engine.js`, `dame/ki.js` (Web Worker), `dame/game.js`, Speicherstand `dame.v1`
- Bilder: Brett und Krone in `dame/img/` (Originale in `design/dame/`, `python3 tools/dame-assets.py`); Steine und Gegner aus `muehle/img/`
- `supabase/migrations/20261024230000_dame.sql` – Katalogeintrag, beim Veröffentlichen ausführen

## Test

`node --test tests/dame-sim.test.mjs` – Startstellung, Schlagpflicht, Rückwärtsschlagen, Mehrfachsprung, Umwandlung, fliegende Dame,
Weiterschlagen über die Grundreihe, Verlust, Wiederholung, Zugrücknahme exakt, Kodierung, Stufen-Turniere, Zeitlimit des Meisters.
