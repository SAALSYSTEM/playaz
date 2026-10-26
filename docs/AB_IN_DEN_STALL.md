# Ab in den Stall! – Übergabenotiz

Bauernhofspiel für Kinder ab 4, Handy hochkant, Finger oder Maus. 30 feste Level in 3 Welten (Der Bauernhof 1–10, Am Bach 11–20, Schlammbad 21–30).
Route: `/spiele/ab-in-den-stall` (direkt erreichbar, `noindex`, noch nicht auf der Startseite und nicht in der Sitemap).

## Spielprinzip
Vom Tier aus mit dem Finger einen Weg zu seinem Zuhause malen. Sobald der Weg das richtige Haus erreicht, läuft das Tier los – Loslassen ist nicht nötig.
Kein Scheitern, keine Zeitnot: Ein Weg zum falschen Haus wird nicht angenommen (das Haus schüttelt sich), ein unfertiger Weg verblasst beim Loslassen.

- Tiere und Häuser: Küken → Hühnerstall, Ferkel → Schweinestall, Kälbchen → Kuhstall, Lämmchen → Schafstall, Entchen → Teich, Fohlen → Pferdestall
- Hindernisse: Baum, Heuballen, Zaun, Bach (nur über die Brücke)
- Gatter (ab Level 13): antippen, dann geht es auf und bleibt offen
- Pfütze (ab Level 21): nur Ferkel laufen hindurch
- Wartende Tiere versperren ihr Feld, laufende nicht. Reihenfolge-Rätsel in Level 9, 19, 26, 29
- Hilfe-Finger: in Level 1 sofort, sonst nach 7 s ohne Eingabe (zeigt den nächsten möglichen Weg oder das Gatter)
- Zeit läuft ab der ersten Berührung; Herausforderung per Link `?l=Level&t=Hundertstel` (schaltet nichts außer der Reihe frei)

## Dateien
- `public/spiele/ab-in-den-stall.html` – Seite, HUD, Menüs (DOM)
- `public/spiele/ab-in-den-stall/engine.js` – Regeln, Wegmalen, Laufen, Löser, Spielstand (ohne DOM)
- `public/spiele/ab-in-den-stall/levels.js` – 30 Level als 6×9-Zeichenraster (Legende im Kopf der Datei)
- `public/spiele/ab-in-den-stall/game.js` – Canvas-2D-Grafik, Eingabe, Ton (WebAudio), Menüs
- `public/spiele/ab-in-den-stall/img/manifest.json` – Liste der vorhandenen WebP-Bilder (derzeit leer → alles gezeichnet)
- `tests/ab-in-den-stall-sim.test.mjs` – Leveldaten, Lösbarkeit, Elemente, Wegmalen, Bot spielt alle 30 Level, Spielstand
- `supabase/migrations/20261026200000_ab_in_den_stall.sql` – Katalog-Eintrag (Cloud-Spielstände)

Speicherschlüssel `stall.v1` (in `public/assets/umzug.js` und `playsaal-config.js` eingetragen).

## Grafiken
Alles ist derzeit gezeichnet (Platzhalter). Sobald ein Bild in `img/` liegt und in `manifest.json` steht, wird es statt der Zeichnung verwendet.
Erwartete Namen (WebP, freigestellt, Unterkante = Standfläche): `tier-kueken`, `tier-ferkel`, `tier-kalb`, `tier-lamm`, `tier-ente`, `tier-fohlen`,
`haus-kueken`, `haus-ferkel`, `haus-kalb`, `haus-lamm`, `haus-fohlen`, `teich`, `baum`, `heuballen`, `pfuetze`, `gatter-zu`, `gatter-auf`.
Zaun, Bach und Brücke bleiben gezeichnet (sie setzen sich je nach Nachbarfeldern zusammen).

## Offen
- Grafiken von ChatGPT, Kachel und Social-Preview-Bild
- Freischaltung: `noindex` entfernen, Kachel in `public/index.html`, Sitemap per `node tools/domain.mjs https://playsaal.com --umzug-aus`
- SQL-Migration im Supabase-Projekt ausführen
- Nicht geprüft: echte Touch-Geräte, Ton hörbar
