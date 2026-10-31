# Kerkerlauf

3D-Endlos-Runner durch einen Kerker, Hochformat, `/spiele/kerkerlauf`. Der Held rennt von selbst; der Spieler wischt zum Ausweichen (◀ ▶), springt über Stachelfallen (▲) und besiegt Skelette mit einem Tipp. Gold sammeln, Kombos aufbauen, neue Helden freischalten. Kein Konto nötig, keine Werbung, keine Käufe.

Stand 31.10.2026: Branch `kerkerlauf`, noch nicht auf `main`. Katalog-Eintrag: `supabase/migrations/20261031230000_kerkerlauf.sql` (noch nicht ausgeführt).

## Regeln

| Was | Wirkung |
|---|---|
| Kiste, Fass, Kistenstapel | Sturz – ausweichen (Spur wechseln) |
| Stachelfalle | nur im Sprung passierbar |
| Skelett (Diener, Krieger) | Tipp/Leertaste in Reichweite (6,5 m) besiegt es (+50 × Kombo), sonst Sturz |
| Gold-Münze | +1 Gold (dauerhaft), +10 Punkte |
| Goldtruhe | +10 Gold, +100 Punkte |
| Strecke | 1 Punkt pro Meter |

Kombo: jedes dritte besiegte Skelett in Folge erhöht den Faktor (×2 … ×5). Ein Skelett, das man ungeschlagen passiert, beendet die Serie.

Tempo: 9 m/s am Start, gleichmäßig bis 22 m/s nach ~2,5 km. Reihenabstand ≥ 13 m bzw. ≈ 1,1–1,35 s.

Helden: Ritter Rudi (frei), Barbarin Bruni (100), Schurke Schatten (250), Waldläuferin Wilma (500), Magier Merlin (800 Gold). Unterschied nur im Aussehen und Angriff (Magier zaubert).

## Faire Strecke

`logik.js` erzeugt Reihen auf drei Spuren (x = −3, 0, 3). Jede Reihe lässt die alte und die neue Pfad-Spur ohne Kiste/Fass/Stapel; der Pfad wandert höchstens eine Spur pro Reihe. Auf dem Pfad liegen Münzen, eine Truhe, eine Stachelfalle (springen) oder ein Skelett (angreifen). Seitlich vorbeistreifen an schon passierten Hindernissen zählt nicht. Geprüft in `tests/kerkerlauf-sim.test.mjs` (60 Strecken à 6 km, Bot läuft 30 Strecken à 4 km ohne Sturz).

## Steuerung

- Handy: wischen links/rechts = Spur wechseln, nach oben = springen, Tippen (oder nach unten wischen) = Angriff.
- Rechner: ←/A, →/D, ↑/W springen, Leertaste/F/J/Enter/↓ Angriff, Esc/P Pause.

## Dateien

| Datei | Inhalt |
|---|---|
| `public/spiele/kerkerlauf.html` | Seite, Menü, HUD, Dialoge |
| `public/spiele/kerkerlauf/logik.js` | Strecke, Laufen/Springen/Angriff, Kollision, Punkte, Spielstand (ohne Darstellung, testbar) |
| `public/spiele/kerkerlauf/game.js` | three.js-Darstellung, Animationen, Wischen/Tastatur, Oberfläche |
| `public/spiele/kerkerlauf/GLTFLoader.js`, `SkeletonUtils.js`, `BufferGeometryUtils.js` | aus three@0.128.0 (`examples/js`), passend zu `/assets/three.min.js` |
| `public/spiele/kerkerlauf/modelle/*.glb` | 5 Helden, 2 Skelette, 7 Animationsdateien, Welt (zusammen ~3,7 MB; beim Start ~2,1 MB, weitere Helden erst beim Blättern) |
| `design/kerkerlauf/kaykit/` | genutzte Original-Dateien aus den KayKit-Paketen + Lizenztexte |
| `tools/kerkerlauf-assets.mjs` | erzeugt die GLBs (gltf-transform): Waffen an `handslot.r/l`, nur benötigte Clips, Welt-Teile in einer Datei |
| `tools/kerkerlauf-bilder.mjs` | Kachel `public/bilder/kerkerlauf.webp` und Teilen-Vorschau `public/bilder/kerkerlauf-og.jpg` aus dem Spiel rendern |

## Modelle und Lizenz

KayKit Adventurers 2.0, Skeletons 1.1, Character Animations 1.1 und Dungeon Pack 1.1 (jeweils FREE) von Kay Lousberg, www.kaylousberg.com – Lizenz CC0 (Namensnennung freiwillig). Alle Figuren nutzen das Skelett `Rig_Medium`, deshalb passen die Clips aus `anim-*.glb` auf Helden und Skelette.

Im Spiel: Hautteile jeder Figur werden beim Laden zu einem `SkinnedMesh` verschmolzen; Skelette sind ein Pool aus je 7 Klonen (`SkeletonUtils.clone`); Kerker-Teile werden gebacken und als `InstancedMesh` gezeichnet. Rund 25–40 Zeichenaufrufe pro Bild. Licht: Halbkugel + Richtungslicht + ein mitwanderndes Fackel-Punktlicht; Fackelschein als Punkt-Sprites.

## Spielstand

`localStorage` `kerkerlauf.v1`: `{ v, gold, rekord, meter, kills, helden[], held, ton }`. Eingetragen in `umzug.js` (Präfix `kerkerlauf.`), `playsaal-config.js` und „Weiter spielen“ auf der Startseite.

## Tests

```sh
node --test tests/kerkerlauf-sim.test.mjs                                # Regeln, faire Strecke, Bot, Spielstand (ohne Browser)
node --test --test-concurrency=1 tests/kerkerlauf-browser.test.mjs       # Laden, Clips, Wischen/Tippen, Sprung, Kampf, Sturz, Speichern, Freischalten, Pause, Dauerlauf, Handy-Layout
```

## Mögliche nächste Schritte

Tagesrangliste über die vorhandenen Konten (wie Papierpilot), tägliche Aufgaben („besiege 20 Skelette“), Magier-Zauber als sichtbares Geschoss, weitere Gegner (Skelett-Magier, -Schurke aus dem Paket).
