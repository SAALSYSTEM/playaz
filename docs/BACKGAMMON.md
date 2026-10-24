# Backgammon

Drittes Spiel der Kategorie **Brettspiele**, Aufbau wie [Mühle](MUEHLE.md) und [Dame](DAME.md): dieselben drei Computergegner,
zu zweit an einem Gerät, Zug zurück, Weiterspielen nach dem Neuladen (auch mitten im Zug, der Wurf wird mitgespeichert), Bilanz, Teilen.
Veröffentlicht am 24.10.2026 direkt auf main (Auftrag „Direkt auf Main“).

## Regeln (wie in `engine.js`)

15 Steine je Seite, Standard-Aufstellung, Hell beginnt. Pasch = viermal. So viele Würfel wie möglich nutzen, geht nur einer, dann der höhere.
Bande zuerst einsetzen, Punkte mit 2+ gegnerischen Steinen gesperrt, Einzelsteine werden geschlagen. Abtragen, wenn alle 15 im Heimfeld sind;
höherer Würfel nur ohne Steine auf höheren Punkten. Gammon/Backgammon werden angezeigt und gezählt. Kein Verdopplungswürfel.

## Computergegner

Gemütlich: einfache Bewertung mit Rauschen und 25 % Zufallszügen · Geübt: bester Zug nach Bewertung (Augenzahl, gebaute Punkte, Blockaden,
Gefahr für Einzelsteine, Bande) · Meister: die 10 besten Kandidaten werden über alle 21 gegnerischen Würfe weitergerechnet (Gegner antwortet
mit seinem besten Zug). Testlauf über 60 Partien: Geübt schlägt Gemütlich 49:11, Meister schlägt Geübt 40:20 (Würfelglück bleibt).

## Darstellung

Brett quer im Hochformat: links oben 11…6, unten 5…0 (Heimfeld Hell), rechts oben 12…17, unten 18…23 (Heimfeld Dunkel). Mittelreihe =
Bande und Würfel, darunter „Raus“. Spielt der Mensch Dunkel, werden die Spalten gespiegelt. Brett und Würfel im Code auf dem Mühle-Holz,
Steine und Gegner aus `muehle/img/`, Kachel und Social Preview per `python3 tools/backgammon-assets.py` aus `design/backgammon/`.

## Test

`node --test tests/backgammon-sim.test.mjs` – Aufstellung, Eröffnung, Pasch, Sperren/Schlagen/Einsetzen, Höherer-Würfel-Regel,
Abtragen, Zufallspartien (Steinzahl bleibt 15, Kodierung hin und zurück), Gammon, Stufen-Turniere.
