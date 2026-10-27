# Sternenpups – Hoch zu den Feen · Übergabenotiz

Einhorn-Kletterspiel für Kinder ab 4, Handy hochkant, Finger oder Maus. 20 feste Level in 4 Welten (Wolkenwiese 1–5, Rankenhimmel 6–10, Regenbogenland 11–15, Feenschloss 16–20).
Route: `/spiele/sternenpups`. Veröffentlicht am 27.10.2026 (Startseite unter „Neu“, Sitemap). Grafiken von ChatGPT; Regenbogen noch gezeichnet, Teilen-Vorschau vorläufig aus Kachel + Himmel gebaut.

## Spielprinzip
Eine leuchtend markierte Wolke antippen → das Einhorn dreht sich, geht kurz in die Hocke und pupst sich mit einer bunten Sternenstaubwolke hinüber. Flugbahn und Landung macht das Spiel.

- Ein Pups schafft die gleiche Etage oder eine Etage hoch/runter, mit höchstens 2 leeren Spalten Abstand (`MAX_GAP` in `engine.js`). Erreichbare Wolken haben einen gestrichelten Goldring.
- Nicht erreichbare Wolke angetippt: Sie wackelt kurz, die erreichbaren Ringe leuchten auf, sonst passiert nichts. Kein Absturz, kein Scheitern, keine Zeit.
- Während Flug, Zauber oder Kamerafahrt werden keine Eingaben angenommen (kein Ketten-Springen).
- Getippte Figuren (Fee, Elf, Zauberstab) zählen als Tippen auf ihre Wolke.
- Ranke (ab Level 6): obere oder untere Wolke antippen → das Einhorn klettert. Geht hoch und runter.
- Zauberstab (ab Level 8): wird beim Landen eingesammelt (steckt dann am Horn). Bei der Fee abgegeben → sie zaubert die gestrichelten Zauberwolken herbei. Fee ohne Stab besucht: Gedankenblase mit Stab.
- Regenbogen (ab Level 11): ist blass; landet das Einhorn an einem Ende, dreht es den Po hin, pupst – der Bogen wird bunt und begehbar (beide Richtungen).
- Elf (ab Level 13): Ankunft beim Elf → Einhorn pupst auf den Spross, die Ranke wächst nach oben.
- Ruhewolke (ab Level 13, in langen Leveln etwa alle 5 Etagen): Laterne leuchtet auf, kleine Fanfare.
- Je Level genau 3 Sterne auf Wolken (meist auf dem Weg oder einen kleinen Umweg entfernt); jeder eingesammelte zählt als Belohnungsstern. Ziel erreichen beendet das Level, auch ohne Sterne.
- Hilfe-Finger: in Einführungsleveln (`hintNow`) nach 1,2 s, in Level 1 nach 2,5 s, sonst nach 8 s ohne Eingabe; zeigt den nächsten Schritt laut Löser.
- Kamera folgt sanft, das Einhorn steht bei etwa zwei Dritteln der Bildhöhe; kein Überflug am Levelanfang. Ist das Ziel außer Sicht, zeigt oben rechts ein Schloss-Porträt mit Pfeil nach oben; ab 6 Etagen eine schmale Fortschrittsleiste am rechten Rand (Ruhewolken als Punkte).
- Begonnene Level werden nach jedem Zug gespeichert (`run`) und beim nächsten Start fortgesetzt; „Von vorn“ im Pausenmenü startet neu.
- Teilen: `?l=Level&s=Sterne` lädt zu diesem Level ein (schaltet nichts außer der Reihe frei).

## Level
| Nr | Name | Etagen | Neu / vertieft | Aufgabe | ca. Dauer |
|---|---|---|---|---|---|
| 1 | Hallo, Wolke! | 1 | Pupsen | eine Wolke antippen, Sterne liegen am Ziel | 20 s |
| 2 | Noch höher | 2 | Pupsen in Folge | zwei Wolken nach oben | 30 s |
| 3 | Links oder rechts? | 2 | Wahl | zwei erreichbare Wolken, Sterne auf beiden Seiten | 40 s |
| 4 | Sternchen-Umweg | 2 | freiwillige Sterne | kleiner Umweg zu einer Einzelwolke | 45 s |
| 5 | Wolkentreppe | 3 | Wiederholung | Zickzack-Treppe | 50 s |
| 6 | Die Ranke | 3 | Ranke | Lücke nur über die Ranke | 45 s |
| 7 | Rankenwald | 4 | zwei Ranken | zwei Wege nach oben | 1 min |
| 8 | Der verlorene Zauberstab | 4 | Zauberstab → Fee | Stab holen, Fee zaubert Wolken | 1,5 min |
| 9 | Stab und Ranke | 5 | Stab + Ranke | Stab unten, Fee oben | 1,5 min |
| 10 | Wolkenzickzack | 6 | Wahl Ranke oder Umweg | hin und her nach oben | 1,5 min |
| 11 | Blasser Regenbogen | 6 | Regenbogen | Bogen bunt pupsen, drüber, Ranke hoch | 1,5 min |
| 12 | Über den Bogen | 7 | Regenbogen + Ranke | | 2 min |
| 13 | Der kleine Elf | 8 | Elf, Ruhewolke | Elf helfen, Ranke wächst 3 Etagen | 2 min |
| 14 | Elf und Fee | 9 | Stab, Elf, Fee | | 2,5 min |
| 15 | Großes Wolkenfest | 10 | alles | Elf, Stab, Ranke, Regenbogen, Fee | 3 min |
| 16 | Hoch hinaus | 12 | alles, Ziel anfangs unsichtbar | | 3 min |
| 17 | Regenbogenturm | 14 | Ranken, Bogen, Elf | | 3,5 min |
| 18 | Sternenleiter | 16 | alles | | 4 min |
| 19 | Wolkenwunder | 18 | alles | | 4,5 min |
| 20 | Das große Feenfest | 20 | alles | | 5 min |

Level stehen als 6-Spalten-Raster in `levels.js` (Legende im Dateikopf).

## Dateien
- `public/spiele/sternenpups.html` – Seite, HUD, Menüs (DOM)
- `public/spiele/sternenpups/engine.js` – Wolken-Graph, Züge, Ereignisse, Löser, Spielstand (ohne DOM)
- `public/spiele/sternenpups/levels.js` – 20 Level
- `public/spiele/sternenpups/game.js` – Canvas-2D-Grafik, Kamera, Animationen, Ton, Menüs
- `public/spiele/sternenpups/img/` – WebP-Bilder + `manifest.json` (fehlt ein Bild, zeichnet das Spiel einen Platzhalter)
- `design/sternenpups/PROMPTS.md` – alle ChatGPT-Bildprompts; Originale als `design/sternenpups/<name>.png`, dann `python3 tools/sternenpups-assets.py`
- `design/sternenpups/sound/` – gelieferte Original-Sounds (Pixabay)
- `public/spiele/sternenpups/*.mp3` – zugeschnitten, mono, 64 kbit/s: `pups-1…4` (Pupse, zufällig, leicht verschiedene Tonhöhe), `funkel` (Stern, Zauberstab), `zauber` (Fee, Ranke wächst, Regenbogen), `musik` (Hintergrundlied, Schleife, Lautstärke 0,28, nur im Spiel, folgt dem Ton-Knopf). Fehlt eine Datei, wird der Ton per WebAudio nachgebaut. Der „Trompeten-Pups“ wurde nicht verwendet (zu lang und zu „eklig“ für ab 4).
- `tests/sternenpups-sim.test.mjs` – Raster, Etagen-Lernkurve, Einführungsreihenfolge, Lösbarkeit, Pflichtaufgaben nötig, keine Sackgassen, Sterne erreichbar, Spielstand, Einladungslink
- `supabase/migrations/20261027190000_sternenpups.sql` – Katalog-Eintrag (`listed = false` bis zur Veröffentlichung)

Speicherschlüssel `sternenpups.v1` (in `public/assets/umzug.js` und `playsaal-config.js` eingetragen).

## Bilder (Namen in `img/`, Platzierung im Code)
`einhorn`, `einhorn-flug`, `einhorn-jubel` (optional), `fee`, `fee-traurig`, `elf`, `wolke-1`, `wolke-2`, `wolke-3`, `ziel`, `boden`, `ranke`, `regenbogen`, `zauberstab`, `stern`, `hintergrund`; Kachel `public/bilder/sternenpups.webp`, Vorschau `public/bilder/sternenpups-og.jpg`.
Standfläche in den Wolkenbildern: Tabelle `SURF` in `game.js` (Anteil der Bildhöhe von oben) – nach Lieferung der Bilder einmal prüfen und ggf. anpassen.
Per Code: Pups-Wolke, Funkel, Flugbahn, Wolkenwippen, Landedelle, Markierungsringe, Gedankenblase, Laterne, Spross, blasser Regenbogen (Graustufen), Zauberwolken (durchscheinend), Konfetti.

## Zur Veröffentlichung
1. Bilder liefern, Werkzeug laufen lassen, `SURF` prüfen.
2. In `sternenpups.html` die Zeile `<meta name="robots" content="noindex">` entfernen.
3. Kachel in `public/index.html` (Block „Neu“, `data-kategorien="abenteuer,kinder"`, `data-rec="sternenpups"`) und Fortschrittsanzeige (`read('sternenpups.v1')`) ergänzen, Eintrag in `public/sitemap.xml`.
4. Migration ausführen und `listed` auf `true` setzen.

## Offen
- Nicht geprüft: echte Touch-Geräte, Ton hörbar (im Headless-Browser alle 20 Level per Antippen durchgespielt).
