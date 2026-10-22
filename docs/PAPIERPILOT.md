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
Flieger gerade/Kurve (Rechtskurve = gespiegelt), Boden Park, Panorama, Baum rund, Zypresse, Haus, Turm. Charge 2: schmales hohes Haus (`hausHoch`, kaum zu überfliegen) und flaches breites Landhaus (`hausFlach`, mit etwas Höhe überfliegbar). Charge 3: Küstenpanorama (`pp-panorama-kueste.png`, Horizont = Meereslinie bei 46 %; das alte Parkpanorama bleibt als Original liegen), Fluss (`pp-fluss.png`, oben/unten per Überblendung nahtlos gemacht) und Steinbrücke (`bruecke`, niedrig: drüber oder seitlich vorbei). Abschnitt `fluss`: Fluss rechts entlang der Flugbahn, Brücken an beiden Enden verdecken die Wasserkanten. Möwen sind reine Optik und werden im Code gezeichnet. Zweitversionen von Zypresse und Turm liegen als `*-alt.png` bei (ungenutzt).

## Kachel und Teilen-Vorschau
Kachel für die Startseite: `public/bilder/papierpilot.webp` (720×720, ohne Schrift, aus `design/papierpilot/pp-kachel.png`). Teilen-Vorschau: `public/bilder/papierpilot-og.jpg` (1200×630) per `node tools/papierpilot-cover.mjs` aus `pp-social.png`; der Schriftzug wird dort in der PlaySaal-Schrift gesetzt, nicht von der Bild-KI. Die Kachel kommt erst mit der Freigabe auf die Startseite.

## Tagesflug, Geist und Rangliste (V2)
- **Tagesstrecke:** `tagesStrecke(seed)` in `strecke.js`, Startwert = Datum in Europe/Berlin (JJJJMMTT). Immer zuerst der Dachabschnitt, dann 25 geprüfte Abschnitte (zufällig gespiegelt, kein Abschnitt zweimal hintereinander, Fluss höchstens alle 4 Abschnitte), 1 040 m. Test: 365 Tage Regeln, 40 Tage per Bot fliegbar. Um Mitternacht lädt „Nochmal“ die neue Strecke.
- **Geisterflieger:** Der eigene Tagesbestflug wird als Eingabefolge gespeichert (`papierpilot.v1` → `tage`, die letzten 7 Tage) und beim nächsten Flug mit denselben Regeln mitgeflogen (türkis, halb durchsichtig).
- **Rangliste:** Nur mit Konto. Gemeldet wird die Eingabefolge; die Edge Function `papierpilot-lauf` fliegt sie mit `sim.js` + `strecke.js` nach (ca. 3 ms) und trägt nur bestätigte Flüge ein. Wertung: weiteste Distanz, bei Gleichstand kürzere Flugzeit. Zeiträume Heute/Monat/Gesamt. Im Flug zeigt eine kleine Tabelle „HEUTE“ die Top 3 (und dich) und unten „Noch X m bis Platz N“.
- **Einrichtung (einmalig, nur du):** 1. SQL aus `supabase/migrations/20261022130000_papierpilot.sql` im SQL Editor ausführen (das Spiel wird mit `listed = false` angelegt). 2. `npx supabase functions deploy papierpilot-lauf --project-ref cphwxikfrxgejiqghlwn --no-verify-jwt`. Ohne diese Schritte läuft das Spiel normal, Flüge bleiben dann nur auf dem Gerät.
- **Ehrliche Grenze:** wie bei den anderen Ranglisten. Der Server beweist, dass die Eingaben die Distanz ergeben, nicht dass ein Mensch geflogen ist.
- **Tests:** `node --test tests/papierpilot-pruefung.test.mjs` (Prüf-Funktion), `tests/db.test.mjs` (Datenbank, mit PGlite).

## Vor der Veröffentlichung
`noindex` entfernen, Kachel auf die Startseite, `listed = true` in `public.games`, Einträge in `playsaal-config.js` (`spiele`, `namen`, `praefixe`) und `assets/umzug.js`, Sitemap.
