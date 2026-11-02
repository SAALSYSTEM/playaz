# Tuff-Tuff-Land

3D-Eisenbahnwelt für Kinder ab 4, Hochformat, `/spiele/tuff-tuff-land`. Das Kind malt mit dem Finger Gleise über ein Raster, setzt Bahnhöfe, Bäume und Häuser, und ein Zug fährt von selbst von Bahnhof zu Bahnhof. Kein Game-over, keine Level, kein Konto nötig, keine Werbung, keine Käufe.

Stand 02.11.2026: Testversion auf Branch `tuff-tuff-land` (nicht auf `main`). Zwei Gebiete.

## Spielprinzip

| Was | Wirkung |
|---|---|
| Gleis malen (Finger ziehen) | Gerade und Kurven entstehen automatisch; an ein offenes Gleisende wird angeschlossen, mitten aus einer Strecke heraus entsteht eine Weiche |
| Weiche antippen | stellt um (gelber Pfeil zeigt den aktiven Zweig) |
| Gleisende | Prellbock; der Zug hält kurz und fährt zurück (Pendelzug) |
| Bahnhof | nur auf einem geraden Gleis; Zug hält 3,2 s, Fahrgäste steigen um |
| Fahrgäste | kommen nach und nach an die Bahnsteige (max. 3), fahren zum nächsten *anderen* Bahnhof und zählen dort als angekommen |
| Gebiete | Gebiet 1 „Wiesenhausen“ ist offen. Bei 6 angekommenen Fahrgästen verschwinden die Wolken über Gebiet 2 „Tannenwald“, dazu gibt es den Schnellzug |

Werkzeuge unten: Gleis, Bahnhof, Baum (Antippen desselben Feldes wechselt Baum → Blume → Busch …), Haus, Wegräumen, Hand (Welt verschieben). Zwei Finger verschieben und zoomen immer. Beim Malen am Bildschirmrand schiebt die Welt mit. Oben: Fahrgäste-Zähler, Zug wählen, Mitfahren (Kamera folgt dem Zug), Menü. Links unten Halt/Los, rechts unten Tuten.

Züge: Blaue Dampflok (rot/gelber Wagen), Rote Dampflok (Personenwagen), Grüne Dampflok (bunte Güterwagen), Straßenbahn, Schnellzug (ab Gebiet 2).

## Welt

Raster 9 × 24 Felder, ein Feld = 4 Einheiten. Jedes Gebiet ist 9 × 12 Felder; Gebiet 1 liegt unten, weitere oben. Neue Gebiete: Eintrag in `GEBIETE` (logik.js) mit `ziel` (Fahrgäste) und Vorbelegung in `neueWelt()`.

Ein Feld hat bis zu zwei Gleisverbindungen zwischen seinen Kanten (N=0, O=1, S=2, W=3). Gerade = Kenney `railroad-straight` (4 lang), Kurve = `railroad-corner-small` (Viertelkreis, Radius 2) – beide passen exakt von Kantenmitte zu Kantenmitte. Der Zug fährt schrittweise durch die Felder; die Wagen folgen dem gespeicherten Weg des Kopfes. An Prellböcken wird der Weg umgedreht (Ende wird Kopf).

## Dateien

| Datei | Inhalt |
|---|---|
| `public/spiele/tuff-tuff-land.html` | Seite, Oberfläche, Menüs |
| `public/spiele/tuff-tuff-land/logik.js` | Raster, Gleise malen, Weichen, Zugfahrt, Bahnhöfe, Gebiete, Spielstand (ohne Darstellung, testbar) |
| `public/spiele/tuff-tuff-land/game.js` | three.js-Darstellung (r128), Eingabe, Kamera, Ton |
| `public/spiele/tuff-tuff-land/modelle.bin` | 54 Kenney-Modelle als Vertex-Farben-Geometrie (ein Material, alles instanziert) |
| `public/spiele/tuff-tuff-land/sound/*.mp3` | Musik, Fahrgeräusch, Pfeife, Bahnhofsglocke (Pixabay, von Matthias geliefert) |
| `tools/tuff-tuff-land-assets.py` | backt `modelle.bin` aus Train Kit, Nature Kit, City Kit Suburban (Kenney, CC0); passt Laub-, Dach- und Wandfarben an und färbt Kastenwagen bunt |
| `public/bilder/tuff-tuff-land.webp`, `tuff-tuff-land-og.jpg` | Kachel und Teilen-Vorschau (ChatGPT) |

Bahnhof, Prellbock, Weichenpfeil, Fahrgäste und Wolken entstehen im Code (`game.js`). `BufferGeometryUtils` kommt aus `/spiele/kerkerlauf/`.

Modelle neu backen:

```sh
python3 tools/tuff-tuff-land-assets.py "<Train Kit>/Models/GLB format" "<Nature Kit>/Models/GLTF format" "<City Kit Suburban>/Models/GLTF format"
```

## Spielstand

`localStorage` `tufftuff.v1`: `{ v, z: { feldIndex: { l: [[a,b]…], w, st, fest, w8, d: [modell, drehung] } }, offen, fahrgaeste, zug, zuege[], ton, musik, naechste, tipp }`. Eingetragen in `umzug.js` (Präfix `tufftuff.`), `playsaal-config.js` und „Weiter spielen“ auf der Startseite. Katalog-Eintrag für Cloud-Spielstände: `supabase/migrations/20261102220000_tuff_tuff_land.sql` (noch nicht ausgeführt).

## Tests

```sh
node --test tests/tuff-tuff-land-sim.test.mjs                                    # Geometrie, Malen, Weichen, Pendeln, Rundkurs, Freischalten, Spielstand
node --test --test-concurrency=1 tests/tuff-tuff-land-browser.test.mjs           # echtes Malen per Zeiger, Werkzeuge, Zugwahl, Freischalten, Neuladen, Handy-Layout
```
