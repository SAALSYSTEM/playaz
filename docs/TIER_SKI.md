# Tier-Ski

3D-Endlos-Skispiel für Kinder ab etwa 5, Hochformat, `/spiele/tier-ski`. Ein Tier fährt von selbst bergab; das Kind lenkt, duckt sich unter Ästen, springt über Schanzen (automatisch), macht in der Luft einen Trick und sammelt Münzen. Mit Münzen werden weitere Tiere freigeschaltet. Kein Konto nötig, keine Werbung, keine Käufe.

Stand 01.11.2026: veröffentlicht auf `main` inkl. Comic-Look (Kachel unter „Neu“, sobald der Katalog-Eintrag ausgeführt ist).

## Regeln

| Was | Wirkung |
|---|---|
| Tanne, Felsen, Schneemann | Sturz („Oje, Schnee gefuttert!“) |
| Tief hängender Ast | nur geduckt passierbar (oder außen herum) |
| Schanze | automatischer Sprung; in der Luft einmal Trick → +100 bei der Landung |
| Münze | +1 Münze (dauerhaft), +5 Punkte |
| Schneeflocke | +50 Punkte |
| Strecke | 1 Punkt pro Meter |

Tempo: 8,5 m/s am Start, gleichmäßig bis 21 m/s nach 2000 m, dann fest. Reihenabstand 15 m → 11 m.

Tiere: Hase (frei), Fuchs (50), Pinguin (120), Bär (220 Münzen).

## Faire Strecke

`logik.js` erzeugt Hindernisse in Reihen auf fünf Spuren (−4, −2, 0, 2, 4 m). Jede Reihe lässt zwei benachbarte Spuren frei (alte und neue Pfad-Spur); der Pfad wandert höchstens eine Spur pro Reihe. Nach jeder Schanze bleibt die ganze Landezone frei. Die ersten 45 m sind leer, neue Objekte entstehen 140 m voraus (im Nebel). Münzreihen zeigen den Weg. Geprüft in `tests/tier-ski-sim.test.mjs` (40 Strecken à 6000 m, Bot fährt 25 Strecken à 4000 m ohne Sturz).

## Steuerung

- Handy: drei große Tasten unten – links / Mitte (Ducken, in der Luft: Trick) / rechts. Gedrückt halten lenkt weich; Mehrfach-Touch ist abgesichert.
- Rechner: A/←, D/→, ↓ ducken, Leertaste = Trick, Esc/P = Pause.

## Dateien

| Datei | Inhalt |
|---|---|
| `public/spiele/tier-ski.html` | Seite, Menü, HUD, Dialoge |
| `public/spiele/tier-ski/logik.js` | Strecke, Fahrphysik, Kollision, Punkte, Spielstand (ohne Darstellung, testbar) |
| `public/spiele/tier-ski/game.js` | three.js-Darstellung, Animationen, Eingabe, Oberfläche |
| `public/spiele/tier-ski/GLTFLoader.js` | GLTFLoader aus three@0.128.0 (`examples/js`), passend zu `/assets/three.min.js` (r128) |
| `public/spiele/tier-ski/modelle/*.glb` | `hase`, `fuchs`, `pinguin`, `baer` (je ~110 KB, 7 Clips), `welt` (~118 KB) |
| `design/tier-ski/tier-ski.blend` | Blender-Quelle (Szene `TierSki`) |
| `tools/tier-ski-bilder.mjs` | Kachel `public/bilder/tier-ski.webp` und Teilen-Vorschau `public/bilder/tier-ski-og.jpg` aus dem Spiel rendern |

## Modelle und Animation

In Blender (5.2) per Python gebaut: Low-Poly-Formen (Ikosphären, Kegel, Quader), flache Schattierung, nur Grundfarben. Jedes Tier hat die Gelenke `Rig` (ganzes Tier mit Skiern), `Koerper`, `Kopf`, `Ski_L`, `Ski_R`. Die Clips `fahren`, `links`, `rechts`, `ducken`, `sprung`, `trick`, `sturz` sind Objekt-Animationen, als NLA-Spuren exportiert (`export_animation_mode='NLA_TRACKS'`, ohne Animations-Optimierung, damit jeder Clip alle 15 Kanäle enthält). Im Spiel blendet ein `AnimationMixer` per `crossFadeFrom` weich zwischen den Clips über.

Darstellung im Spiel (Comic-Look, alles in `game.js`, ohne neue Modelle): `MeshToonMaterial` mit drei harten Helligkeitsstufen; Normalen werden beim Laden über flache Knicke geglättet (wie Blenders „Auto Smooth“, 48°), dadurch sind Köpfe und Körper rund und Kanten bleiben scharf. Dunkle Umrisslinien entstehen aus nach außen geschobenen Rückseiten (Attribut `kontur`, Linienbreite bildschirmkonstant); bei den Tieren je animiertem Gelenk zu einem Mesh zusammengelegt, bei Strecken-Objekten als zweites `InstancedMesh` mit derselben Instanz-Matrix. Berge werden aus dem Blender-Berg in Höhenringe unterteilt und bekommen eine weiße Schneekappe. Hinter dem Tier entstehen Skispuren (zwei Rillen, Lücken beim Sprung). Rund 60 Zeichenaufrufe pro Bild.

Strecken-Objekte (`welt.glb`: Tanne, Fels, Schneemann, Schanze, Ast, Muenze, Flocke, Huegel, Stange, Berg) werden beim Laden je zu einer Geometrie mit Vertex-Farben verschmolzen und als `InstancedMesh` gezeichnet: rund 45 Zeichenaufrufe pro Bild. Schatten sind weiche Flecken, keine Schattenberechnung. Bei langsamen Geräten senkt das Spiel die Pixeldichte.

Neu exportieren: `design/tier-ski/tier-ski.blend` öffnen, Szene `TierSki`, jedes Tier bzw. die Weltobjekte auswählen und als glTF Binary mit den genannten Einstellungen exportieren (Tiere an den Ursprung, +Y = Fahrtrichtung in Blender).

## Spielstand

`localStorage` `tierski.v1`: `{ v, muenzen, rekord, meter, tiere[], tier, ton }`. Eingetragen in `umzug.js` (Präfix `tierski.`), `playsaal-config.js` und „Weiter spielen“ auf der Startseite. Katalog-Eintrag für Cloud-Spielstände: `supabase/migrations/20261031220000_tier_ski.sql` (noch nicht ausgeführt).

## Tests

```sh
node --test tests/tier-ski-sim.test.mjs                                  # Regeln, faire Strecke, Bot, Spielstand (ohne Browser)
node --test --test-concurrency=1 tests/tier-ski-browser.test.mjs         # Laden, Clips, Steuerung, Sturz, Schanze, Ducken, Münzen, Speichern, Freischalten, Pause, Dauerfahrt, Handy-Layout
```

Der Browser-Test nutzt Software-Grafik (SwiftShader); dort laufen nur wenige Bilder pro Sekunde, deshalb warten die Tests auf Ergebnisse statt auf feste Zeiten.
