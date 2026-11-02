# Putt-Profi

3D-Minigolf im Hochformat, `/spiele/putt-profi`. Finger aufs Grün, zurückziehen (Richtung und Stärke), loslassen – die Kugel rollt in die Gegenrichtung. 18 Bahnen in 3 Welten und eine Tagesrunde mit geprüfter Rangliste. Kein Konto nötig, keine Werbung, keine Käufe.

Stand 02.11.2026: veröffentlicht auf `main`. Katalog und Rangliste: `supabase/migrations/20261102220000_putt_profi.sql` (noch nicht ausgeführt).

## Regeln

| Was | Wirkung |
|---|---|
| Schlag | Zurückziehen = Stärke (0–100 %), Richtung = Gegenrichtung des Zugs |
| Loch | Kugel fällt, wenn sie langsam genug über das Loch rollt (zu schnell = drüber) |
| Graben (Burggraben) | Kugel fällt ins Aus: 1 Strafschlag, zurück an die alte Stelle |
| Windmühle | Ein Flügel sperrt die Tür, solange er unten steht (Timing) |
| Höchstens 6 Schläge | danach zählt die Bahn 7 (Bahnengolf-Regel) |
| Sterne (Bahnen) | ★ eingelocht · ★★ Par oder besser · ★★★ unter Par |

Bälle: Rot (frei), Blau ab 10, Grün ab 22, Gold ab 40 Sternen (höchstens 54).

## Bahnen

`public/spiele/putt-profi/bahnen.js`: Jede Bahn ist ein kleines Zeichenraster (oben = vom Spieler weg). Die passenden Kenney-Kacheln und Banden sucht `logik.js` selbst aus: Wo kein Nachbarfeld ist, steht eine Bande. Zeichen: `#` Bahn, `T` Abschlag, `H` Loch, `r` runde Kurve; in geraden Stücken `k` Block, `n/m/v` Engstellen, `C` Burg, `W` Windmühle, `U/V/D` Tunnel, `g` Graben, `s` Trennwand, `b/h/q` Buckel/Hügel/Plateau; auf freien Flächen `x` Raute, `y` Dreiecke, `o` Kuppe, `u` Mulde.

Welten: Sommerwiese (1–6), Burgberg (7–12), Mühlental (13–18, Abendlicht). Par 2–4.

## Physik (deterministisch)

- Feste Takte von 1/240 s, nur `+ − × ÷` und Wurzel (keine Winkelfunktionen) – Browser und Server rechnen Bit für Bit gleich.
- Boden: Höhenraster (40 Punkte je Feld) aus den grünen Boden-Dreiecken der Modelle, bilinear mit Gefälle; Hügel, Mulden und Lochmulde wirken echt.
- Banden und Hindernisse: genau die steilen Dreiecke der Modelle (`teile.js`), Kugel gegen Dreieck. Abprall nur waagerecht, Banden gelten als beliebig hoch – die Kugel kann nie über eine Bande springen.
- Windmühle: Flügelstellung aus dem Takt; der Mühlentakt beim Schlag wird mit aufgezeichnet.
- Kugelradius 0,04 Feld (etwas größer als im Kit, damit man sie auf dem Handy gut sieht), Lochradius 0,067 aus dem Modell.

## Tagesrunde und geprüfte Rangliste

- **Tagesrunde:** 5 Bahnen (aus jeder Welt mindestens eine, manche gespiegelt), Startwert = Datum in Europe/Berlin (JJJJMMTT).
- **Aufzeichnung:** je Schlag `dx,dz,Stärke,Mühlentakt`, Schläge mit `;`, Bahnen mit `|` getrennt.
- **Rangliste:** Nur mit Konto. Gemeldet wird nur ein neuer Tagesbestwert. Die Edge Function `putt-profi-runde` spielt alle 5 Bahnen mit `logik.js` nach (`pruefeRunde`) und trägt nur bestätigte Runden ein. Wertung: weniger Schläge, bei Gleichstand wer zuerst da war. Monat/Gesamt: beste Runde im Verhältnis zu Par.
- **Einrichtung (einmalig, nur du):** 1. SQL aus `supabase/migrations/20261102220000_putt_profi.sql` im SQL Editor ausführen. 2. `npx supabase functions deploy putt-profi-runde --project-ref cphwxikfrxgejiqghlwn --no-verify-jwt`. Ohne diese Schritte läuft das Spiel normal, Runden bleiben dann nur auf dem Gerät.
- **Regel- oder Bahnänderungen:** `SIM_VERSION` in `logik.js` erhöhen, `node tools/putt-profi-bot.mjs` (neue Lösungen) und `node tools/edge-sync.mjs` ausführen.

## Dateien

| Datei | Inhalt |
|---|---|
| `public/spiele/putt-profi.html` | Seite, Menü, HUD, Dialoge |
| `public/spiele/putt-profi/logik.js` | Bahn bauen, Physik, Regeln, Tagesrunde, Nachspielen, Spielstand (ohne Darstellung) |
| `public/spiele/putt-profi/bahnen.js` | 18 Bahnen, 3 Welten |
| `public/spiele/putt-profi/teile.js` | Kollisionsdreiecke der Kacheln (erzeugt) |
| `public/spiele/putt-profi/game.js` | three.js-Darstellung, Zielen, Kamera, Menüs, Ton |
| `public/spiele/putt-profi/modelle/` | Kenney-Modelle (GLB) + Farbtextur |
| `public/spiele/putt-profi/sound/` | Sounds (aufbereitet) |
| `design/putt-profi/` | Originale: Kenney Minigolf Kit (Auszug + Lizenz), Sounds, Kachel und Social Preview von ChatGPT |
| `tools/putt-profi-assets.py` | Modelle kopieren und `teile.js` erzeugen (Boden/Wand nach Texturfarbe) |
| `tools/putt-profi-sound.py` | Sounds schneiden und angleichen (ffmpeg) |
| `tools/putt-profi-bot.mjs` | Prüf-Bot: löst jede Bahn (normal und gespiegelt), schreibt `tests/putt-profi-loesungen.json` |
| `supabase/functions/putt-profi-runde/` | Prüf-Funktion (Kopien von `logik.js`, `bahnen.js`, `teile.js`) |

## Modelle, Bilder, Ton

Kenney Minigolf Kit 3.1 (www.kenney.nl), Lizenz CC0. Kachel und Social Preview: ChatGPT (Lieferung Auftraggeber). Sounds von Pixabay (Lieferung Auftraggeber): Musik „Sun, Sea and Surf“ (kaazoom), Schlag (freesound_community „golf 14“ und „golf club hit series“), Bande („small ball“, spinopel), Einlochen (freesound_community „minigolf putt right into the hole“), Bahn geschafft (universfield „level complete“), Fanfare (freesound_community „success fanfare trumpets“). Rollgeräusch und Klicks werden im Spiel erzeugt.

## Spielstand

`localStorage` `puttprofi.v1`: `{ v, ton, ball, bahnen: { Nr: bestes Ergebnis }, hio, tag, tagBest }`. Eingetragen in `umzug.js` (Präfix `puttprofi.`), `playsaal-config.js` und „Weiter spielen“ auf der Startseite.

## Tests

```sh
node --test tests/putt-profi-sim.test.mjs                           # Bahnen, Physik (Banden halten, Graben, Mühle), Par mit Bot, Tagesrunde, Nachspielen, Spielstand
node --test tests/putt-profi-pruefung.test.mjs                      # Prüf-Funktion: echte Runde bestätigt, Manipulationen abgelehnt, Tage, CORS
node --test --test-concurrency=1 tests/putt-profi-browser.test.mjs  # Laden, Zielen per Finger, Einlochen, Neuladen, ganze Tagesrunde, Herausforderung, Querformat
```
