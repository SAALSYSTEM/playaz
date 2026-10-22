# PAPIERPILOT

Papierflieger-Spiel im Hochformat (auch am Rechner spielbar). Stand: V1, feste Teststrecke, noch `noindex` und nicht auf der Startseite. Test über `/spiele/papierpilot`.

## Spielablauf
- Kraftanzeige pendelt, Tippen (Leertaste) wirft. Weiter rechts = schneller und etwas Steigen am Anfang.
- Linke/rechte Bildschirmhälfte halten (Pfeiltasten, A/D) neigt den Flieger in die Kurve. Kurven kosten etwas Höhe.
- Türkise Aufwinde heben (in der Mitte am stärksten), goldene Ringe geben Schwung.
- Boden oder Hindernis beendet den Flug. „Nochmal“ bzw. Leertaste startet sofort neu.
- Bestflug: Distanz, bei Gleichstand die kürzere Flugzeit. Gespeichert in `papierpilot.v1` (inkl. Eingabefolge für den späteren Geisterflieger).

## Aufbau
| Teil | Datei |
|---|---|
| Regeln (ganzzahlig, 60-Hz-Takt, bitgleich nachrechenbar) | `public/spiele/papierpilot/sim.js` |
| Hindernistypen, Abschnitte, Teststrecke | `public/spiele/papierpilot/strecke.js` |
| Darstellung (three.js), Steuerung, Ton, Oberfläche | `public/spiele/papierpilot/game.js`, `public/spiele/papierpilot.html` |
| Bilder | Originale `design/papierpilot/`, Laufzeit `img/*.webp` per `python3 tools/papierpilot-assets.py` |
| Flug-Bot (Fliegbarkeit, Rundenlängen) | `tools/papierpilot-bot.mjs` |
| Test | `node --test tests/papierpilot-sim.test.mjs` |

Darstellung: Boden ist eine echte 3D-Fläche (gekachelte Parktextur), alle Objekte sind senkrechte Bildflächen („Aufsteller“) mit Fußpunkt unten in der Mitte. Ferne Aufsteller werden gerastert ausgeblendet, der Boden läuft in das Panorama aus. Aufwinde, Ringe, Flugspuren und Schatten entstehen im Code.
Kollisionen hängen an einfachen Formen in `TYPEN` (Säule bzw. Quader mit Höhe), bewusst etwas kleiner als das Bild.

## Bilder (Charge 1, ChatGPT)
Flieger gerade/Kurve (Rechtskurve = gespiegelt), Boden Park, Panorama, Baum rund, Zypresse, Haus, Turm. Charge 2: schmales hohes Haus (`hausHoch`, kaum zu überfliegen) und flaches breites Landhaus (`hausFlach`, mit etwas Höhe überfliegbar). Zweitversionen von Zypresse und Turm liegen als `*-alt.png` bei (ungenutzt).

## Als Nächstes (V2)
Tagesstrecke aus geprüften Abschnitten (Startwert = Datum in Europe/Berlin, wie Seitenwechsel/Punktlandung), Geisterflieger aus der gespeicherten Eingabefolge, geprüfte Tagesrangliste (Migration + Edge Function `papierpilot-lauf`, Eintrag in `tools/edge-sync.mjs`), danach Registrierung in `playsaal-config.js`, `umzug.js`, `public.games` und Startseite.
