# JUNGLE RUNNER – Das Dschungel-Abenteuer

Stand: 18.10.2026 · Branch `jungle-runner` · **nicht live** (kein Commit/Push auf `main`, kein Deployment ohne ausdrückliche Zustimmung; Vorschau über Cloudflare Workers Builds des Branches)

3D-Endlos-Läufer im Stil bekannter Runner, aber mit eigener Spielwelt: Junge **oder** Mädchen (identische Fähigkeiten, gleicher Rig, gleiche Trefferbox, gleiches Tempo) läuft automatisch durch den Dschungel, drei Spuren, Spurwechsel, Springen, Rutschen. 30 feste Level in 5 Welten, danach Endlosmodus.

Adresse: `/spiele/jungle-runner` · Spielstand: `localStorage` → `jungle.v1` (Schema-Version 1) · Kategorie: 3D, Laufspiel, Abenteuer · **werbefrei, ohne Login, ohne Echtgeld** (Münzen nur im Spiel, nur für Outfits)

## Aufbau

| Datei | Inhalt |
|---|---|
| `public/spiele/jungle-runner.html` | Seite, Oberfläche (HUD, Menü, Figurenwahl, Levelkarte, Awards, Garage, Dialoge), CSS, SEO, JSON-LD |
| `public/spiele/jungle-runner/sim.js` | Regeln ohne DOM und ohne Zufall (fester 60-Hz-Takt): Spuren, Sprung, Rutschen, Hindernisse, Tiere, Herzen, Wasser/Checkpoints, Power-ups, Sterne, Replays |
| `public/spiele/jungle-runner/levels.js` | 30 Level als Daten (Baukasten `Bau` + Bausteintabelle `MOT`), 5 Welten, Endlos-Erzeuger (`endlessLevel`) |
| `public/spiele/jungle-runner/world.js`, `geo.js` | Welt: Chunks mit zusammengeführter Vertex-Farb-Geometrie, Instancing für Münzen, Dekoration |
| `public/spiele/jungle-runner/chars.js` | Figuren (Junge/Mädchen, 6 Outfits), Tiere (Nashorn, Elefant, Affe), Power-up-Symbole |
| `public/spiele/jungle-runner/render.js` | three.js-Darstellung: Kamera, Pooling der beweglichen Objekte, Partikel, Bühne für Menü/Wahl/Garage, adaptive Qualität |
| `public/spiele/jungle-runner/game.js` | Zustände, Eingabe (Tastatur, Touch-Wischen mit Eingabepuffer), HUD, Tutorial, Ergebnisse, Awards, Teilen, Herausforderungs-Links, Endlosmodus, Testschnittstelle `__jr` (nur mit `?test`) |
| `public/spiele/jungle-runner/awards.js` | 18 Auszeichnungen, Medaillen-Zeichnung, 1080×1080-Teilen-Bild |
| `public/spiele/jungle-runner/save.js` | Speicherstand: Schema-Version, Migration, Bereinigung manipulierter/kaputter Daten, Tagesstrecke |
| `public/spiele/jungle-runner/audio.js` | Ton komplett synthetisch (WebAudio), Marimba/Bongo-Schleife, Ein/Aus im Spielstand |
| `tools/jungle-pruefer.mjs` | **Streckenprüfer**: sucht auf der echten Sim eine kollisionsfreie Route und prüft Reaktionszeiten |
| `tests/jungle-sim.test.mjs` | 18 Tests ohne Browser |
| `tests/jungle.test.mjs` | 25 Browser-Tests (Playwright gegen `wrangler dev`) |
| `tests/jungle-loesungen.json` | Prüfer-Lösungen aller 30 Level (Regressionstest) |
| `public/spiele/jungle-runner/assets/` | Grafikpaket A1 von ChatGPT, Laufzeit-Dateien als WebP: `logo.webp` (zugeschnitten), `keyart.webp`, `icon-muenze/magnet/schild/fluegelschuh/x2.webp` (256², optisch gleich groß zentriert). `design/jungle-runner/a1/` hält die unveränderten Lieferdateien (PNG/WebP) als Quelle |
| `public/bilder/jungle-runner.jpg` | Kachelbild der Startseite 960×600, zugeschnitten aus dem Keyart |
| `public/bilder/jungle-runner-og.jpg` | Social-Preview 1200×630 (`og:image`), Keyart mit Logo |

Kein Build-Schritt. three.js r128 kommt wie bei den anderen 3D-Spielen aus `public/assets/three.min.js`.

## Integration in PlaySaal

- Startseite: Kachel im Block „Neu“ (jetzt 7 Kacheln; Raster in `public/index.html` angepasst, auf 320/375/390/430/768/1440 px ohne Lücken getestet), `ItemList` und Beschreibung (13 Spiele), Bestwert-Anzeige aus `jungle.v1`.
- `public/sitemap.xml` (`/spiele/jungle-runner`), `public/assets/umzug.js` (Präfix `jungle.`, Hauptschlüssel `jungle.v1`), `README.md`.
- Seite: Titel/Beschreibung, `canonical` = `og:url`, `og:image`, JSON-LD `VideoGame`, `playsaal.zuletzt` für „Weiter spielen“, `.pz-home`-Link, Vollbild, Pause bei Fensterwechsel, Ton-Ein/Aus bleibt gespeichert.
- Veröffentlichung: nur durch Push auf `main` – **dafür fehlt die Freigabe**. Bis dahin liegt alles auf dem Branch `jungle-runner`.

## Spielregeln (Kurzfassung)

- Tempo je Level 8–15,5 m/s, Dauer je Level 77–173 s (Ziel war 60–180 s). Spurwechsel 0,12 s, Sprung (Scheitel ≈ 1,8 m), Rutschen 0,75 s, Eingabepuffer (max. 2 Befehle, 0,2 s) in der Sim, zusätzlich Warteschlange in der Eingabeschicht (max. 4, einer pro Takt).
- Hindernisse: Bodenstamm (springen), Überhang (rutschen), begehbarer Stamm mit Rampe, Fels, Lücke/Wasser, Schlamm, Wurzeln, tiefe Äste, Brückenlücken, fallende Kokosnüsse, bewegliche Tempeltore, rollender Fels.
- Tiere (nur Hindernisse, nie sichtbar verletzt): Nashorn (kündigt die Spur an, ≥ 1,75 s Vorwarnung), Elefant (langsam, blockiert nie alle 3 Spuren), Affe (schwingt).
- 3 Herzen, **genau ein Herz pro Treffer**, danach 1,8 s Unverwundbarkeit. Wassersturz: zurück zum letzten sicheren Checkpoint, −1 Herz, 2,5 s Schutz. 0 Herzen = „Keine Herzen mehr“ mit schnellem Neustart.
- Power-ups: Magnet, Schild, Super-Sprung, ×2 Münzen.
- Sterne je Level (konfigurierbar, deterministisch): Ziel erreicht = 1, Mindest-Münzen (`starCoins`) = 2, Ziel mit ≥ 2 Herzen (`starHearts`) = 3.
- Tutorial: Level 1 (Spurwechsel, geführt, verlangsamt/wartend), Level 2 (Sprung), Level 3 (Rutschen); weitere kurze Hinweise bei neuen Mechaniken (Nashorn L5, Wasser L7, begehbarer Stamm L8, Affe L10, Elefant L13, Kokosnuss L17, Tor L19, Fels L21, Wind L25), je einmal, bei Wiederholung übersprungen; „Tipp anzeigen“ nach 10 Fehlversuchen.
- Endlosmodus nach Level 30: geprüfte Bausteine, Tempo steigt bis 17 m/s, optionale Tagesstrecke (gleicher Startwert für alle am selben Kalendertag).

## Streckenprüfer

`node tools/jungle-pruefer.mjs [ids] [--schnell] [--schreiben] [--endlos SEED]` – Beam-Suche über Klone der echten Simulation. Pro Level geprüft: (1) fehlerfreie Route (kein Treffer, kein Absturz) existiert, (2) sie bleibt gültig, wenn jede Eingabe um 0,2 s früher/später kommt (robuste Route), (3) mit verzögerten Eingaben nachgespielt, (4) Respawn an jedem Checkpoint ist wieder lösbar, (5) Warnzeit der Tiere ≥ 1,75 s, (6) Elefanten blockieren nie drei Spuren, (7) die Münzroute erreicht `starCoins`. `--schreiben` legt `tests/jungle-loesungen.json` an.

Letzter Lauf (18.10.2026, 30 Level): alle 30 `OK` (fein = ja, robust = ja/ja/ja, verzögert = ja, Checkpoints ok). Endlos Seed 3: fehlerfreie Route bis 1500 m. Die Lösungen sind **keine Spielerbots**: Sie belegen nur, dass jedes Level mit exakten Eingaben schaffbar ist und dass die Zeitfenster fair sind.

## Grafikpaket A1 (eingebaut)

- **Logo** im Hauptmenü (Hochformat zentriert über den Knöpfen, sonst links oben) und auf dem Ladebildschirm; bei fehlendem WebGL ebenfalls.
- **Keyart** als Menü-Titelbild (Hochformat: Banner oben mit Übergang, sonst vollflächig mit dunklem Verlauf links), als Ladebildschirm (`#sLade` im HTML, sichtbar bevor das Skript läuft, blendet aus, sobald Menü oder Figurenwahl dran ist), als Kachelbild und als Social-Preview.
- **Icons**: Münze im HUD, in Menü/Garage-Kontostand und in den Ergebnis-/Verloren-Zahlen; Magnet, Schild, Flügelschuh (= Super-Sprung), ×2 als 3D-Pickup, im HUD-Balken der aktiven Kräfte, in der Meldung beim Einsammeln und als Legende in „So geht's“. Die 3D-Münzen im Lauf bleiben Zylinder, nur in der Farbe ans Keyart angepasst.
- **Figuren/Tiere nur farblich** ans Keyart angepasst, Modelle unverändert: Outfit „Entdecker“ trägt jetzt den Safarihut mit dunklem Band, olivgrünes Shirt, rote Rucksacktasche und braune Stiefel; Nashorn mit wärmerem Violettgrau und Horn in Creme; Affe etwas wärmer. Elefant unverändert (kein Entwurf geliefert). Das gekaufte Outfit „Safari“ ist cremeweiß mit weißem Hut, braunen Hosen und grüner Tasche und damit klar vom Entdecker zu unterscheiden.
- **Alle Pakete (A1, A2, B, C) sind eingebaut.**

## Grafikpakete A2, B und C (eingebaut)

- **A2**: `icon-herz/stern/stern-leer/pause/ton-an/ton-aus.png` ersetzen die Inline-SVGs (Leben-Anzeige, Level- und Ergebnissterne, Kriterien, Pause- und Ton-Knopf). Das leere Herz ist per CSS abgedunkelt. Pause/Ton sind Bild-Knöpfe ohne eigenen Rahmen (orange); Neustart und Musik bleiben dunkle Rahmen-Knöpfe, weil dafür keine Bilder geliefert wurden.
- **B**: `tex-*.webp/png` als Kacheln. `geo.js` (`MB.tex(name)`, `LAYERS`, `LAYER_DEF`) schreibt Körper in Texturschichten derselben Chunk-Geometrie (Gruppen + Materialarray, UVs aus Weltkoordinaten nach Flächenrichtung; Zylinder: eigene UV; Stammenden: lokale UV). Zugeordnet in `world.js`: Wiese = Gras, Wegplatten/Säulen/Ruinen = Tempelstein, Brücke/Rampen = Holzbohlen, Stämme/Baumstämme = Rinde (+ Stammschnitt an den Enden, alphaTest), Schlamm, Felsen = Stein-Moos; Wasser = `tex-wasser` (Farbton je Welt über `waterMat.color`). Die Vertexfarbe der Welt bleibt als Tönung erhalten (`tint`/`gain`). Texturen werden beim Start geladen und auf höchstens 512 px verkleinert (Grafikspeicher ca. 10 MB statt 40 MB); der Ladebildschirm wartet bis zu 3 s darauf.
- **C** (inzwischen durch die Sprite-Figuren ersetzt, siehe unten): `gesicht-junge/maedchen.png` (transparent, nur Augen, Brauen, Mund, beim Mädchen Wangen) liegen als Abziehbild auf einem Kugelstück vor dem Kopf (`faceGeo` in `chars.js`, Bild deckt 2,2 rad ab, transparent, kein Tiefenschreiben, Polygon-Offset). Die alten Augen-, Wangen- und Mund-Körper entfallen; Nase und Ohren bleiben Körper. Die Garderoben-Kärtchen zeigen weiterhin ihre eigenen Vorschaubilder.
- Kosten: Zeichenaufrufe von 62 auf ca. 90 (Grenze 160), Dreiecke unverändert; das Savannen-Gras (Welt 3) wirkt durch die grüne Textur grüner als vorher.

## Sprite-Figuren (ersetzen die 3D-Figur und Paket C)

- Abweichung vom ursprünglichen Plan („ChatGPT liefert nur 2D-Assets, 3D-Figuren bleiben Code“): Die Code-Figur aus Grundkörpern kam nicht an das Keyart heran, daher sind Junge und Mädchen jetzt Bilder (12 PNGs, 512², transparent, `assets/sprites/{junge,maedchen}-{hinten-lauf-a,hinten-lauf-b,hinten-sprung,hinten-ducken,hinten-getroffen,vorn-jubel}.png`).
- `chars.js`: `buildChar(kind)` = Ebene mit dem Bild (Fußpunkt bei y = 496/512 auf y = 0, 1,92 m Kantenlänge ≈ 1,5 m Figur), `poseChar(c, {mode, ph, lane, t, view})` wählt die Pose: Lauf wechselt A/B mit der Laufphase (plus Wippen und leichtes Kippen), Sprung/Fall, Ducken (auch bei „verloren“), Treffer (mit Zittern), Jubel (im Lauf beim Sieg: dreht sich zur Kamera). `view: 'stage'` (Menü, Figurenwahl, Garage) zeigt immer `vorn-jubel`, zur Kamera der Bühne gedreht.
- Im Lauf ist die Figur um 20 % größer als die Trefferfläche (`render.js`, `tilt.scale`), damit sie auf dem Handy gut sichtbar ist. Die Trefferflächen der Simulation sind unverändert.
- Teilen-Bild und Ergebniskarten: `drawKid` (`awards.js`) zeichnet `vorn-jubel`.
- Outfits entfallen: Garage zeigt nur noch Junge/Mädchen und das Namensfeld. Daten (`owned`, `outfit`) und der Award „Neues Outfit“ bleiben im Code, der Award ist aber nicht mehr erreichbar (Entscheidung offen). Paket C (`gesicht-*.png`) und der alte Skelett-Code sind entfernt bzw. ungenutzt; die Dateien liegen noch in `assets/`.

## Temporäre Grafik – ehrliche Einordnung

Alle 3D-Figuren, Tiere, Hindernisse, Bäume und Symbole sind **prozedurale Low-Poly-Platzhalter**, im Code aus Würfeln, Kugeln und Zylindern gebaut, mit weich animierten Gelenken. Sie machen die Spiellogik und die Fairness prüfbar, sind aber **nicht die finale Optik**. Die mitgelieferten PNG-Konzepte sind Moodboards und wurden nicht als 3D-Modelle verwendet oder ausgegeben. Vor einer Freigabe sollte die Optik gesondert abgenommen werden.

### Anforderungsliste für finale Assets

| Priorität | Datei (Vorschlag) | Motiv | Maße / Format | Ansichten / Animationen |
|---|---|---|---|---|
| P0 | `assets/jungle/boy.glb` | Junge, Dschungel-Entdecker | gerigged GLB, 1,3–1,6 m, ≤ 6 k Dreiecke, 1 Material-Atlas ≤ 1024² | Idle, Run, LaneChange L/R, Jump, Land, Slide, Hit, Victory |
| P0 | `assets/jungle/girl.glb` | Mädchen, gleicher Rig und gleiche Maße wie Junge | wie oben, **identisches Skelett** | wie oben |
| P0 | `assets/jungle/outfits/*.png` | 6 Outfit-Texturen/Varianten (Entdecker, Blau, Safari, Schatz, Tempel, Gold) | 1024², sRGB | Basis-Farbe je Rig |
| P0 | `assets/jungle/rhino.glb` | Nashorn (Angriff in angekündigter Spur) | ≤ 4 k Dreiecke | Idle, Scharren (Warnung), Rennen |
| P0 | `assets/jungle/elephant.glb` | Elefant | ≤ 5 k Dreiecke | Idle, Gehen, Ohrenwackeln |
| P0 | `assets/jungle/monkey.glb` | Affe an Liane | ≤ 3 k Dreiecke | Schwingen, Greifen |
| P1 | `assets/jungle/obstacles.glb` | Bodenstamm, Überhang, begehbarer Stamm + Rampe, Fels, Wurzel, Brücke, Kokosnuss, Tempeltor, rollender Fels | modular, ≤ 1 k Dreiecke je Teil | Tor: Auf/Zu, Fels: Rollen |
| P1 | `assets/jungle/props-w1..w5.glb` | Bäume, Büsche, Palmen, Ruinen je Welt | Instancing-tauglich, ≤ 800 Dreiecke | – |
| P1 | ~~`assets/jungle/powerups/*.svg`~~ | Magnet, Schild, Super-Sprung, ×2 – **geliefert (A1) und eingebaut** (`assets/icon-*.webp`) | 256², transparent | HUD-Symbol und 3D-Pickup |
| P2 | ~~`assets/jungle/sky-w1..w5.jpg`~~ | Himmel/Horizont je Welt – **geliefert und eingebaut** (`public/spiele/jungle-runner/img/pano-1..5.jpg`, 2048×1024: unten das ChatGPT-Panorama, oben weiche Himmelsfortsetzung; als gebogenes Band hinter der Strecke, je Welt geladen, Nebelfarben darauf abgestimmt) | 2000×500 | – |
| P2 | `assets/jungle/sfx/*.ogg`, `music.ogg` | Klänge und Schleife (optional, derzeit synthetisch) | OGG/AAC | – |

Falls die Bilder von ChatGPT erzeugt werden sollen: je Motiv ein eigenes Briefing mit Dateiname, Ansichten (Front, Seite, 3/4, Rücken), Maßstab und transparentem Hintergrund. Das ergibt Referenzbilder, **keine** fertigen 3D-Modelle; 3D-Modelle müssen als GLB modelliert/gerigged werden.

## Teststand

Befehle: `node --test tests/jungle-sim.test.mjs`, `node --test --test-concurrency=1 tests/jungle.test.mjs`, `node --test --test-concurrency=1 tests/playsaal.test.mjs`, `node tools/jungle-pruefer.mjs`, `node tools/domain.mjs`.

| Testfall | Art | Ausgeführt | Ergebnis | Offener Fehler |
|---|---|---|---|---|
| 30 Level, 5 Welten à 6, Dauer, eindeutige Namen | automatisch (Sim) | ja | bestanden | – |
| Alle 30 Prüfer-Lösungen laufen fehlerfrei durchs Ziel | automatisch (Sim) | ja | bestanden | – |
| Münzroute erreicht Münz-Stern in allen 30 Leveln | automatisch (Sim) | ja | bestanden | – |
| Sterne 1/2/3 nach Ziel, Münzen, Herzen | automatisch (Sim) | ja | bestanden | – |
| Ein Herz pro Treffer, Schutzzeit ≥ 1,8 s | automatisch (Sim) | ja | bestanden | – |
| Wassersturz → letzter Checkpoint, −1 Herz | automatisch (Sim) | ja | bestanden | – |
| Determinismus, Klonen, Encode/Decode | automatisch (Sim) | ja | bestanden | – |
| Endlos: gleiche Zahl = gleiche Strecke | automatisch (Sim) | ja | bestanden | – |
| Awards (≥ 12, Schwellen, keine Doppelvergabe) | automatisch (Sim) | ja | bestanden | – |
| Speicherstand: leer/kaputt/neuer/alt/manipuliert | automatisch (Sim) | ja | bestanden | – |
| Streckenprüfer, alle 30 Level (fein, robust, verzögert, Checkpoints) | automatisch (Werkzeug) | ja | 30/30 OK | – |
| Streckenprüfer Endlos Seed 3 bis 1500 m | automatisch (Werkzeug) | ja | OK | – |
| Seite lädt ohne Fehler, SEO, 200 | Browser | ja | bestanden | – |
| Werbefrei, keine Fremdanfragen | Browser | ja | bestanden | – |
| Figurenwahl Junge/Mädchen, gespeichert | Browser | ja | bestanden | – |
| Tastatur: Pfeile/A/D, Leertaste, Pfeil runter, Esc | Browser | ja | bestanden | – |
| Touch: ein Wisch = ein Befehl, im Zähler ignoriert, kein Scrollen | Browser (CDP-Touch) | ja | bestanden | – |
| Tutorial Level 1 wartet auf Spurwechsel | Browser | ja | bestanden | – |
| Sieg, 3 Sterne, Award „erster“, Neuladen | Browser | ja | bestanden | – |
| Level-Sperre auf der Karte | Browser | ja | bestanden | – |
| Herzen/Verloren-Dialog/schneller Neustart | Browser | ja | bestanden | – |
| Alle 30 Level per Lösung im Browser gewinnbar | Browser | ja | bestanden | – |
| Endlosmodus gesperrt, danach spielbar, Rekord gespeichert | Browser | ja | bestanden | – |
| Teilen: PNG 1080×1080, Link mit Level/Punkten | Browser | ja | bestanden (Bild zusätzlich angesehen) | Figur überdeckt im Level-Bild knapp den Anfang der Zeile „Punkte · Level …“ |
| Herausforderungs-Link (gültig, gesperrt, manipuliert) | Browser | ja | bestanden | – |
| Garage: Outfit kaufen, Kontostand, gespeichert | Browser | ja | bestanden | – |
| Kaputter/gesperrter Speicher, Migration alt → v1 | Browser | ja | bestanden | – |
| Pause bei Fensterwechsel | Browser | ja | bestanden | – |
| Auflösungen 390×800, 800×390, 768×1024, 1440×900 | Browser | ja | bestanden | – |
| Performance-Richtwert (Zeichenaufrufe, Dreiecke) | Browser (Software-GL) | ja | bestanden | Bildrate auf echten Geräten **nicht** gemessen |
| PlaySaal-Gesamttest (Routen, Startseite 320–1440 px, Umzug, …) | Browser | ja | 23/23 bestanden | – |
| Echte Geräte (iPhone/Android), echter Touch, Haptik | manuell | **nein** | – | Muss vor Freigabe jemand am Handy spielen |
| Ton hörbar/Lautstärke, Autoplay-Regeln auf iOS | manuell | **nein** | – | offen |
| Web Share API mit Bild auf echtem Handy | manuell | **nein** | – | nur der Fallback (Link kopieren + Bild speichern) ist automatisch geprüft |
| Grafikpaket A1: Bilder laden unverzerrt, Ladebildschirm weg, Power-up-Symbole im HUD | Browser | ja | bestanden | – |
| Grafikpaket A2: Herzen, Pause, Ton als Bilder, kein Inline-SVG | Browser | ja | bestanden | – |
| Grafikpaket B: Texturen geladen, Texturgruppen in den Stücken | Browser | ja | bestanden | – |
| Sprite-Figuren: 12 Posen geladen, Laufpose wechselt | Browser | ja | bestanden | – |
| Garage: nur Figurwahl, ohne Outfit-Liste | Browser | ja | bestanden | – |
| Menü, Lauf, Levelkarte, Hilfe, Garage, Ergebnis bei 375/390 px sowie 800×390 und 1440×900 | manuell (Screenshots) | ja | gesichtet | – |
| Ladezeit Menü (4 Mbit/s, 60 ms, Software-GL) | manuell | ja | 2,5 s statt 2,1 s auf main, +190 KB | – |
| Optik der Platzhalter-Modelle aus der Nähe, Qualitätsstufen | manuell | teilweise | Screenshots gesichtet | finale Assets stehen aus (siehe Tabelle oben) |

## Offene Punkte

- Finale 3D-Assets (siehe Anforderungsliste); bis dahin sind Figuren und Tiere Platzhalter.
- Spiel am echten Handy und in Safari testen (Touch-Gefühl, Ton, Bildrate); die Tests laufen mit Software-GL.
- Die Levelschwierigkeit ist rechnerisch fair (Prüfer), aber nicht mit Spielern erprobt; Tempo/Abstände sind je Level in `levels.js` einstellbar.
- Rangliste/Server gibt es bewusst nicht: Herausforderungs-Ergebnisse stammen vom Gerät und sind nicht serverseitig geprüft (steht so auch im Teilen-Bild).
