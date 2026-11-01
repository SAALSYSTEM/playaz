# Schattenschritt

3D-Schleich-Rätsel im Kerker, Hochformat, `/spiele/schattenschritt`. Rundenbasiert auf einem Raster: Der Schurke zieht ein Feld (wischen, aufs Nachbarfeld tippen oder Pfeiltasten) oder wartet; danach handeln alle Skelett-Wachen. Ziel ist die leuchtende Luke. Kein Konto nötig, keine Werbung, keine Käufe.

Stand 01.11.2026: auf dem Branch `schattenschritt`, noch nicht auf `main`. Katalog-SQL: `supabase/migrations/20261101160000_schattenschritt.sql` (noch nicht ausgeführt). Keine Rangliste (Rätsel mit fester Lösung).

## Regeln

| Wache | Sicht | Ausschalten | Modell |
|---|---|---|---|
| Skelett-Wache | 3 Felder geradeaus | ja, von hinten/der Seite | Skelett-Diener |
| Skelett-Späher | 5 Felder geradeaus | ja | Skelett-Schurke |
| Skelett-Krieger | 2 Felder geradeaus | nein (blockiert) | Skelett-Krieger |
| Skelett-Magier | 2 Felder in alle 4 Richtungen | nein (blockiert) | Skelett-Magier |

- Wachen stehen, drehen sich jeden Zug (gelber Pfeil) oder laufen einen Rundgang (Punkte am Boden; hin und zurück oder im Kreis), Blick in Laufrichtung.
- Rote Felder = Sicht. Mauern, Kisten, geschlossene Tore und andere Wachen verdecken. Erwischt wird man, wenn man nach dem eigenen Zug oder nach dem Zug der Wachen in einer Sicht steht.
- Schattenfelder (dunkel): dort sieht man den Schurken nur aus einem Feld Entfernung.
- Ausschalten: aufs Feld einer Wache gehen, die einen nicht sieht.
- Schlüssel öffnet das Gittertor. Münzen sind freiwillig.
- Sterne: Ausgang erreicht · alle Münzen · höchstens so viele Züge wie der kürzeste Weg (meist nicht in einem Lauf zusammen – zweiter Anlauf lohnt).
- „Zurück“ nimmt beliebig viele Züge zurück, auch nach dem Erwischtwerden. Level werden der Reihe nach frei.

## Level

24 Level in 3 Kapiteln (Kerker, Gruft, Turm), neue Mechanik jeweils mit Hinweis: Wache umgehen (2), Ausschalten (3), Drehen (4), Rundgang (5), Schatten (9), Schlüssel/Tor (11), Krieger (12), Späher (17), Magier (19).
Entwürfe aus `tools/schattenschritt-generator.mjs` (würfelt Karten und Wachen, prüft mit dem Löser, ob es lösbar ist und die Mechaniken gebraucht werden), ausgesucht und benannt von Hand. `zuege` in `level.js` = kürzester Weg laut Löser (Test prüft das).

## Steuerung

- Handy: wischen = ein Feld in die Richtung, Tippen aufs Nachbarfeld = dorthin, Tippen aufs eigene Feld = warten. Knöpfe: Zurück, Warten, Neu.
- Rechner: Pfeile/WASD, Leertaste/Enter warten, Z/Rücktaste zurück, R neu, Esc/P Pause.

## Dateien

| Datei | Inhalt |
|---|---|
| `public/spiele/schattenschritt.html` | Seite, Levelauswahl, HUD, Dialoge |
| `public/spiele/schattenschritt/logik.js` | Raster, Wachen, Sicht, Züge, Sterne, Löser (Breitensuche), Spielstand |
| `public/spiele/schattenschritt/level.js` | die 24 Level |
| `public/spiele/schattenschritt/game.js` | three.js-Darstellung, Eingabe, Oberfläche, Ton |
| `public/spiele/schattenschritt/modelle/` | Raum-Teile (2 × 2 m je Feld) und Schleich-Animationen (`tools/schattenschritt-assets.mjs`) |
| `/spiele/kerkerlauf/…`, `/spiele/letzte-bastion/…` | gemeinsam genutzt: Schurke, Skelette, Grund-Animationen, Sounds |
| `tools/schattenschritt-bilder.mjs` | Kachel und Teilen-Bild aus dem Spiel gerendert (Platzhalter, bis Bilder von ChatGPT kommen) |

Modelle: KayKit (CC0, Kay Lousberg), wie im Kerkerlauf. Ton: Kerkerlauf-Musik und -Effekte, „au“ und „zauber“ aus Letzte Bastion.

## Spielstand

`localStorage` `schattenschritt.v1`: `{ v, sterne[24], ton }`. Eingetragen in `umzug.js` (Präfix `schattenschritt.`), `playsaal-config.js` und „Weiter spielen“ auf der Startseite.

## Tests

```sh
node --test tests/schattenschritt-sim.test.mjs                            # Regeln, Sicht, Schatten, Rundgänge, Tor, Sterne, alle 24 Level per Löser
node --test --test-concurrency=1 tests/schattenschritt-browser.test.mjs   # Laden, Levelauswahl, Wischen/Tippen/Tasten, Erwischt/Zurück, Ausschalten, Tor, Pause, Handy-Layout
```
