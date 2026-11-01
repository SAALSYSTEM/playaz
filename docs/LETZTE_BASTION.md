# Letzte Bastion

3D-Wellenverteidigung im Kerkersaal, Hochformat, `/spiele/letzte-bastion`. Der Held steht in der Mitte des Saals; Skelette strömen durch drei Tore herein oder steigen aus dem Boden. Ein Tipp in eine Richtung lässt den Held dorthin zuschlagen. Nach jeder Welle wählt man eine von drei Verstärkungen. Gold kaufen dieselben Helden frei wie im Kerkerlauf (eigener Spielstand). Kein Konto nötig, keine Werbung, keine Käufe.

Stand 01.11.2026: auf dem Branch `letzte-bastion`, noch nicht auf `main`. SQL: `supabase/migrations/20261101120000_letzte_bastion.sql` (Katalog + Rangliste, noch nicht ausgeführt).

## Regeln

| Gegner | Leben | Tempo | Punkte | Besonderheit |
|---|---|---|---|---|
| Skelett-Diener | 1 | 1,5 m/s | 10 | ab Welle 18 ein Leben mehr |
| Skelett-Schurke | 1 | 2,6 m/s | 15 | ab Welle 2, schnell |
| Skelett-Krieger | 2 | 1,15 m/s | 20 | ab Welle 3; ab Welle 10, 20 … je ein Leben mehr |
| Skelett-Magier | 1 | 1,3 m/s | 25 | ab Welle 4; bleibt auf Abstand und schießt Zauberkugeln (wegschlagen: +2), rückt nach jedem Zauber 1,4 m näher |

- Hieb: Reichweite 2,8 m, Breite 100°, alle 0,38 s. Trifft alles im Fächer gleichzeitig.
- Nahkampf: Ein Skelett am Held holt 0,7 s aus (später bis 0,4 s) und trifft – ein Herz weg. Danach wird es zurückgestoßen, der Held ist 1 s geschützt. 3 Herzen; bei 0 fällt die Bastion.
- Welle n: 3 + 2n Skelette; ab Welle 5/10/16 kommen 2/3/4 gleichzeitig. Tempo +6 % je Welle (max. ×2,3). Ab Welle 2 steigen manche aus dem Boden (1,3 s Vorwarnung).
- Kombo: alle 8 Treffer in Folge +1 (×2 … ×5), ein Treffer am Held setzt zurück.
- Welle geschafft: +50 × n Punkte, +n Gold.
- Verstärkungen (je Welle eine aus drei): Lange Klinge (+0,4 m, 2×), Breiter Hieb (+20°, 2×), Flinke Hand (−15 % Abklingzeit, 2×), Zähes Herz (+1 Herz, 2×), Wirbelhieb (jeder 6./4. Hieb rundum, 2×), Heiltrank (alle Herzen).
- Gold beim Ende: alle Kills + Wellenbonus. Helden: Ritter (frei), Barbarin 500, Schurke 1.500, Waldläuferin 3.500, Magier 7.500.

Balance (Bot, `tests/bastion-sim.test.mjs`): guter Spieler Welle ~20–30 (6–8 min), durchschnittlich Welle 5–20, langsamer Spieler Welle 4–8.

## Steuerung

- Handy: in die Richtung eines Skeletts tippen (Hieb dorthin). Upgrade-Karte antippen.
- Rechner: Klick in die Richtung oder Pfeiltasten/WASD (zwei gleichzeitig = schräg), 1–3 wählt die Karte, Esc/P Pause.

## Dateien

| Datei | Inhalt |
|---|---|
| `public/spiele/letzte-bastion.html` | Seite, Menü, HUD, Upgrade-Karten, Dialoge |
| `public/spiele/letzte-bastion/logik.js` | Wellen, Gegner, Hieb, Upgrades, Punkte, Spielstand, Aufzeichnung/Nachspielen (ohne Darstellung, testbar; nur + − × ÷, sqrt, feste Sinustabelle) |
| `public/spiele/letzte-bastion/game.js` | three.js-Darstellung, Tippen → Richtung, Animationen, Oberfläche, Ton, Rangliste |
| `public/spiele/letzte-bastion/style.css` | Kerkerlauf-Stil + Herzen, Banner, Karten |
| `public/spiele/letzte-bastion/modelle/` | Raum, Skelett-Magier, Skelett-Schurke, Zusatz-Animationen (`node tools/bastion-assets.mjs`) |
| `/spiele/kerkerlauf/modelle/`, `/spiele/kerkerlauf/sound/` | gemeinsam genutzt: Helden, Diener, Krieger, Grund-Animationen, alle Sounds |
| `tools/bastion-bot.mjs` | Bot für Balance-Tests |
| `tools/bastion-bilder.mjs` | Kachel `public/bilder/letzte-bastion.webp` und Teilen-Bild `letzte-bastion-og.jpg` aus dem Spiel gerendert |
| `supabase/functions/bastion-lauf/` | Prüf-Funktion (Edge Function), `logik.js` ist eine Kopie (`node tools/edge-sync.mjs`) |

## Modelle, Ton, Lizenz

KayKit Adventurers, Skeletons, Character Animations und Dungeon Pack (FREE, CC0) von Kay Lousberg – wie im Kerkerlauf (`design/kerkerlauf/kaykit/`). Der Saal ist 12 × 20 m (Tore hinten und links/rechts), statisch in eine Geometrie gebacken. Figuren werden 1,3-fach gezeigt; Skelette sind ein Pool aus je 10 Klonen pro Art. Rund 65–95 Zeichenaufrufe pro Bild. Ton: dieselben Dateien wie im Kerkerlauf (siehe `docs/KERKERLAUF.md`).

## Spielstand

`localStorage` `bastion.v1`: `{ v, gold, rekord, welle, kills, helden[], held, ton, tag, tagBest }`. Eingetragen in `umzug.js` (Präfix `bastion.`), `playsaal-config.js` und „Weiter spielen“ auf der Startseite.

## Tagesrangliste

- Alle kämpfen am selben Tag gegen dieselben Wellen (Seed = Datum in Berlin). Feste Takte 1/60 s; aufgezeichnet wird je Takt `Abstand:Code` (0–359 = Hieb-Richtung in Grad, 400–402 = Upgrade-Wahl).
- Gemeldet wird nur ein neuer Tagesbestwert. Die Edge Function `bastion-lauf` spielt den Kampf nach (`pruefeLauf`) und trägt nur bestätigte Kämpfe ein. Wertung: Punkte, bei Gleichstand weniger Takte.
- **Einrichtung (einmalig, nur du):** 1. SQL aus `supabase/migrations/20261101120000_letzte_bastion.sql` im SQL Editor ausführen (enthält auch die Kerkerlauf-Aufräumregel – die Kerkerlauf-SQL muss vorher gelaufen sein). 2. `npx supabase functions deploy bastion-lauf --project-ref cphwxikfrxgejiqghlwn --no-verify-jwt`. Ohne diese Schritte läuft das Spiel normal, Kämpfe bleiben nur auf dem Gerät.
- Regeländerungen: `SIM_VERSION` erhöhen und `node tools/edge-sync.mjs`.

## Tests

```sh
node --test tests/bastion-sim.test.mjs                              # Regeln, Upgrades, Kombo, Nachspielen, Balance per Bot, Spielstand
node --test tests/bastion-pruefung.test.mjs                         # Prüf-Funktion: echter Kampf bestätigt, Manipulationen abgelehnt, Tage, CORS
node --test --test-concurrency=1 tests/bastion-browser.test.mjs     # Laden, Tippen/Richtung, Herzen, Upgrade-Karten, Ende, Freischalten, Pause/Tasten, Browser-Kampf in Node nachgespielt, Handy-Layout
node --test tests/db.test.mjs                                       # u. a. LETZTE-BASTION-Rangliste (PGlite)
```
