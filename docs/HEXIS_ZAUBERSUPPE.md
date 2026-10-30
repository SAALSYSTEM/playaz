# Hexis Zaubersuppe – Übergabenotiz

Halloween-Spiel für Kinder ab 5, Handy hochkant, Finger oder Maus. 15 feste Level.
Route: `/spiele/hexis-zaubersuppe`. Grafiken und Lied vom Auftraggeber (ChatGPT bzw. Pixabay).

## Spielprinzip
Oben steht das Rezept als Bildkarte (Zutat + Punkte zum Zählen). Unten im Regal stehen die Zutaten.
Zutat **antippen** → sie fliegt in den Kessel. Oder **in den Kessel ziehen** (goldener Ring zeigt, dass sie trifft).

- Passt die Zutat: Platsch, Punkt wird gelb, die Suppe färbt sich (Mischfarbe aller Zutaten).
- Falsche Zutat oder schon genug davon: „Puff!“-Wolke, Hexi schaut erschrocken, die Zutat springt zurück ins Regal. Kein Verlieren, keine Zeit.
- Rezept fertig: Hexi jubelt, Funkelstrom zum Kater, Puff – Kasimir ist verzaubert. Neue Verwandlungen kommen ins **Zauberbuch** (6 Stück, alle spätestens bis Level 10).
- Level 15 („Das große Zauberfest“): Kasimir wirbelt durch alle Verwandlungen und bleibt beim Regenbogen-Kater.
- Sterne: ohne Puff 3, mit 1–2 Puffs 2, sonst 1.
- Hilfe-Finger: in Level 1 nach 1,2 s, Level 2–3 nach 5 s, sonst nach 9 s ohne Eingabe; zeigt auf die nächste fehlende Zutat.
- Kasimir antippen → maunzt; Hexi antippen → kichert.
- Teilen: `?l=Level` lädt zu diesem Level ein (schaltet nichts außer der Reihe frei).

## Level
1–3 eine Zutat (1, 2, 3 Stück), 4–6 zwei Zutaten, 7–10 drei Zutaten (neu: Bonbon, Feder, Beeren, Mond), 11–15 drei bis fünf Zutaten; das Regal wächst von 2 auf 10 Zutaten. Daten in `levels.js`.

## Dateien
- `public/spiele/hexis-zaubersuppe.html` – Seite, HUD, Menüs, Zauberbuch (DOM)
- `public/spiele/hexis-zaubersuppe/engine.js` – Rezept, Zugeben, Sterne, Suppenfarbe, Spielstand (ohne DOM)
- `public/spiele/hexis-zaubersuppe/levels.js` – 15 Level
- `public/spiele/hexis-zaubersuppe/game.js` – Canvas-2D-Szene, Wurf/Ziehen, Verzaubern, Ton (WebAudio), Menüs
- `public/spiele/hexis-zaubersuppe/img/` – WebP + `manifest.json`; `kessel-suppe.webp` ist nur die graue Suppe aus dem Kesselbild (wird per `multiply` eingefärbt)
- `public/spiele/hexis-zaubersuppe/musik.mp3` – Hintergrundlied (mono, 64 kbit/s, 65 s, Schleife, Lautstärke 0,28, nur im Spiel, folgt dem Ton-Knopf)
- `design/hexis-zaubersuppe/` – Originale + `PROMPTS.md`; `tools/hexis-zaubersuppe-assets.py` erzeugt alles neu (Pillow, numpy, scipy, ffmpeg)
- `public/bilder/hexis-zaubersuppe.webp` (Kachel), `public/bilder/hexis-zaubersuppe-og.jpg` (Teilen-Vorschau)
- `tests/hexis-zaubersuppe-sim.test.mjs` – Level, Lernkurve, Bilder vorhanden, Zugeben/Puff, Sterne, Bot spielt alle Level, Spielstand, Einladung
- `supabase/migrations/20261030200000_hexis_zaubersuppe.sql` – Katalog-Eintrag (Cloud-Spielstände)

Speicherschlüssel `zaubersuppe.v1` (in `public/assets/umzug.js` und `playsaal-config.js` eingetragen). Startseite: Kachel ganz vorn unter „Neu“, Sitemap.

## Offen
- Nicht geprüft: echte Touch-Geräte, Ton hörbar (im Headless-Browser alle 15 Level per Antippen und Ziehen durchgespielt, 360×640 bis 412×915).
