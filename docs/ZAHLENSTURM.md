# ZAHLENSTURM – 3D-Mathe-Läufer

Stand: 15.10.2026 · Branch `zahlensturm` · **nicht live** (kein Deployment ohne Freigabe; `main` unverändert, Vorschau über Cloudflare Workers Builds)

Eigenständiges Lauf-Spiel: Eine Gruppe läuft automatisch eine Strecke entlang, der Spieler steuert nur seitlich und wählt Rechentore (+, −, ×, ÷), weicht Hindernissen und Gegnern aus, sammelt Münzen, besiegt am Ende einen Boss und läuft in einen eigenen Bonusabschnitt. Figuren, Tore, Welten, Boss, Töne, Level und Namen sind eigene Arbeit. „Zahlentore im Laufspiel“ ist ein allgemeines Genre; es wurden keine Assets, Level, Figuren, Namen oder Grafiken aus anderen Spielen übernommen.

Adresse: `/spiele/zahlensturm` · Spielstand: `localStorage` → `zahlensturm.v1` · Kategorie: 3D, Rechnen, Laufspiel · **komplett werbefrei**

## Aufbau

| Datei | Inhalt |
|---|---|
| `public/spiele/zahlensturm.html` | Seite, Oberfläche (HUD, Menüs, Dialoge), CSS, SEO, JSON-LD |
| `public/spiele/zahlensturm/sim.js` | Regeln ohne DOM und ohne Zufall: Rechnen, Tore, Hindernisse, Kämpfe, Boss, Bonus, Münzen, Sterne, Replays |
| `public/spiele/zahlensturm/levels.js` | 20 Level als Daten (kleiner Baukasten `Bau`), vier Welten |
| `public/spiele/zahlensturm/par.js` | Par je Level (3. Stern), **erzeugt** vom Bot |
| `public/spiele/zahlensturm/render.js` | three.js-Darstellung: Strecke, Tore, Figuren (InstancedMesh), Gegner, Boss, Partikel, Kamera |
| `public/spiele/zahlensturm/game.js` | Steuerung, Schleife, HUD, Ton (WebAudio), Speicherstand, Bildschirme, Awards, Teilen, Herausforderung |
| `public/spiele/zahlensturm/awards.js` | 17 Auszeichnungen, Medaillen-Zeichnung, 1080×1080-Teilen-Grafik |
| `tools/zahlensturm-bot.mjs` | Lösungs-Bot (Beam-Suche auf der echten Sim): Lösbarkeit, Par, Münzrouten, Torvielfalt |
| `tests/zahlensturm-sim.test.mjs` | 21 Tests ohne Browser |
| `tests/zahlensturm.test.mjs` | 18 Browser-Tests (Playwright gegen `wrangler dev`) |
| `tests/zahlensturm-loesungen.json` | Bot-Lösungen aller 20 Level (Regressionstest) |
| `public/bilder/zahlensturm.jpg` | Kachelbild 960×600 (Screenshot aus dem Spiel) |

Kein Build-Schritt. Die Module werden direkt als `type="module"` geladen. three.js r128 kommt wie bei den anderen 3D-Spielen aus `public/assets/three.min.js`. Die Sim läuft identisch im Browser, im Test-Bot und in den Tests.

## Spielregeln

- Die Gruppe läuft mit 9 m/s bei festem 60-Hz-Takt, die Darstellung interpoliert (ruckelfrei auch bei 120 Hz). Die Seitenbewegung folgt dem Ziel weich. Steuerung: Finger oder Maus ziehen, Pfeiltasten oder A/D.
- **Tore:** Wer mit der Gruppenmitte in einem Torfeld steht, bekommt genau dieses Tor, und zwar genau einmal. `+`, `−`, `×`, `÷` rechnen mit ganzen Figuren. Division rundet ab, die Zahl wird nie negativ, Obergrenze 9999. Fällt die Gruppe durch ein Tor auf 0, ist der Lauf verloren.
- **Hindernisse:** feste Wände, Engstellen, Stacheln (fester Verlust), Gruben, bewegliche Balken, Drehbalken, wandernde Plattformen (alles außerhalb fällt). Ein Treffer kostet den überdeckten Anteil der Gruppe. Ausweichen kostet nichts.
- **Gegnergruppen:** ausweichen oder kämpfen. Figuren werden gegeneinander gelegt: Die Zahl am Gegner ist seine Figurenzahl. Wer mehr Figuren hat, gewinnt und behält die Differenz (150 gegen 100 → 50 bleiben), bei Gleichstand gewinnt der Gegner. Der Boss steht immer im Weg und funktioniert genauso. Im Spiel sieht man die Figuren wirklich (bis 300 pro Trupp, bis 1000 eigene).
- **Münzen:** liegen auf Routen, die Entscheidungen belohnen. Eingesammelt wird, was die Gruppenbreite trifft. Jede Münze bringt eine Figur mehr.
- **Bonus „Zahlenleiter“** (nach dem Boss, als gelb-orange Treppe mit 0,9 m hohen Stufen): Sprossen mit Bahnen ×1 … ×8, die Bahn wechselt man je Sprosse. Münzen je Sprosse = ⌈min(n, 300)·Faktor / 15⌉. Die Deckelung bei 300 verhindert, dass riesige Gruppen unbegrenzt Münzen erzeugen.
- **Sterne:** 1 = geschafft, 2 = alle Münzen, 3 = Figurenzahl ≥ Par (85 % der besten Bot-Zahl).
- **Münzen und Anti-Farming:** Es wird nur die Verbesserung gegenüber dem bisherigen Bestwert eines Levels gutgeschrieben. Wiederholen mit gleicher Leistung bringt 0.
- Münzen kaufen Figurenfarben (reine Optik, keine Vorteile, keine Wartezeiten, kein Bezahlen).

## Die 20 Level

Werte stammen aus `tools/zahlensturm-bot.mjs` (Stand dieser Version). „Bot“ ist die beste vom Bot gefundene Figurenzahl nach dem Boss; „Hindernisse“ zählt Wände, Stacheln, Gruben, Balken, Drehbalken und Plattformen.

| # | Name | Welt | Tore | Hindernisse | Gegner | Münzen | Bot (Figuren am Ziel) | Par (3. Stern) |
|---|---|---|---|---|---|---|---|---|
| 1 | Erste Schritte | Sonnenwiese | 5 (+ ×) | 1 | 0+Boss | 26 | 76 | 64 |
| 2 | Rechenwege | Sonnenwiese | 5 (+ ×) | 2 | 0+Boss | 32 | 87 | 73 |
| 3 | Minus ist gemein | Sonnenwiese | 6 (+ − ×) | 2 | 0+Boss | 30 | 70 | 59 |
| 4 | Der erste Gegner | Sonnenwiese | 5 (× + −) | 1 | 2+Boss | 34 | 60 | 51 |
| 5 | Wackelwand | Sonnenwiese | 5 (+ × −) | 4 | 0+Boss | 31 | 67 | 56 |
| 6 | Sägeblätter | Zuckerwüste | 5 (+ × −) | 4 | 1+Boss | 32 | 54 | 45 |
| 7 | Geteilt | Zuckerwüste | 7 (+ × ÷) | 2 | 1+Boss | 31 | 120 | 102 |
| 8 | Stachelfeld | Zuckerwüste | 6 (× + − ÷) | 4 | 1+Boss | 31 | 162 | 137 |
| 9 | Schmaler Grat | Zuckerwüste | 6 (+ × − ÷) | 7 | 1+Boss | 37 | 106 | 90 |
| 10 | Wanderplattform | Zuckerwüste | 6 (× + − ÷) | 4 | 1+Boss | 31 | 172 | 146 |
| 11 | Glatteis | Eiskristall | 7 (+ ÷ × −) | 5 | 1+Boss | 31 | 111 | 94 |
| 12 | Entscheidung | Eiskristall | 8 (+ × ÷ −) | 4 | 1+Boss | 36 | 225 | 191 |
| 13 | Doppelkopf | Eiskristall | 7 (+ − ÷ ×) | 6 | 2+Boss | 33 | 220 | 187 |
| 14 | Lawine | Eiskristall | 9 (+ ÷ − ×) | 5 | 1+Boss | 30 | 157 | 133 |
| 15 | Kristallhöhle | Eiskristall | 7 (+ − ÷) | 7 | 1+Boss | 41 | 230 | 195 |
| 16 | Torschuss | Sternenzirkus | 11 (+ ÷ −) | 3 | 1+Boss | 29 | 276 | 234 |
| 17 | Manege | Sternenzirkus | 8 (+ ÷ −) | 6 | 1+Boss | 39 | 293 | 249 |
| 18 | Seiltanz | Sternenzirkus | 8 (+ − ÷) | 7 | 1+Boss | 35 | 271 | 230 |
| 19 | Feuerwerk | Sternenzirkus | 10 (+ ÷ −) | 7 | 2+Boss | 34 | 344 | 292 |
| 20 | Das große Finale | Sternenzirkus | 9 (+ ÷ −) | 7 | 1+Boss | 34 | 214 | 181 |

Aufbau der Welten: Welt 1 führt Plus, Mal und Minus ein, dazu den ersten Gegner und einen wackelnden Balken. Welt 2 bringt Division, Drehbalken, Stacheln, den schmalen Grat und die wandernde Plattform. Welt 3 (Eiswelt) bringt Doppelentscheidungen und Ketten aus bis zu 9 Toren. Welt 4 hat die meisten Tore (bis 11), die schmalste Strecke (Seiltanz) und das Finale.

**Level 21–100 ergänzen:** In `levels.js` einen Eintrag `level(21, 'Name', 'welt', halbe Breite, Start, Länge, new Bau()…, [Bonus-Sprossen], { hint })` anhängen, dann `node tools/zahlensturm-bot.mjs --schreiben` ausführen (löst alle Level, schreibt `par.js` und die Lösungsdatei) und `node --test tests/zahlensturm-sim.test.mjs`. Die Level-Zahl im Spiel kommt aus `LEVELS.length`. **Fest eingetragen** und mitzuziehen sind: die Zahl 20 im Test `Levels: 20 Stück`, der Award „20 Level“ (`awards.js`), der Text „x von 20 Level“ in `public/index.html` und `public/assets/umzug.js` sowie die Welt-Aufteilung 5/5/5/5 im Test „Torentscheidungen…“.

## Torentscheidungen

Der Auftrag verlangt abwechslungsreiche Tore statt „immer rechts“. Das ist als Test festgeschrieben:

- Für jedes Level wird die Dauerlinie links, Mitte und rechts simuliert. Keine darf Par erreichen.
- Die gute Lösung muss in jeder 5er-Welt mindestens 3-mal links und 3-mal rechts durch ein Tor gehen und darf nicht mehr als 75 % einer Seite verwenden.

Beim Bauen ist Level 6 durchgefallen (Dauerlinie links reichte aus) und wurde umgebaut. Wie lohnend die Entscheidungen sich *anfühlen*, belegt das nicht; das ist ohne Spieltest offen.

## Awards (17)

Erster Sieg · 5 / 10 / 20 Level · 100 / 500 Figuren gleichzeitig · Level ohne Verlust · alle Münzen · Boss mit ≥ 300 Figuren · perfekter Lauf (3 Sterne, unversehrt, alle Münzen) · 30 Sterne · 1000 Münzen gesammelt · knapp geschafft (≤ 5 Figuren) · Comeback (Level ≥ 10 nach ≥ 5 Fehlversuchen) · Figurenfarbe gekauft · Herausforderung verschickt · Herausforderung angenommen. Jede Auszeichnung wird einmal mit Datum vergeben und kann geteilt werden.

## Teilen

- Text: „Ich habe Level 15 mit 348 Figuren geschafft. Kannst du mich schlagen?“ plus Link.
- Web Share API (mit Bild, wo der Browser Dateien teilen kann); sonst Link kopieren und PNG herunterladen.
- Link `…/spiele/zahlensturm?level=15&n=348&von=Name`: Empfänger spielen sofort, ohne Anmeldung. Die Parameter werden geprüft (Level muss existieren, n zwischen 1 und 9999, Name gesäubert), sonst landet man im Menü.
- Das Bild trägt den Hinweis „Auf meinem Gerät erspielt (nicht serverseitig geprüft)“.

## Ranglisten und Prüfung – ehrlich

**ZAHLENSTURM ist an keine globale Rangliste angeschlossen.** Es gibt keinen Server-Endpunkt, kein Konto und keine Übertragung von Ergebnissen. Alle Zahlen (Figuren, Sterne, Münzen, Awards) entstehen auf dem Gerät und sind **nicht verifiziert**. Die Herausforderungslinks sind ein freundschaftlicher Vergleich, kein Beweis.

Die Sim ist rein deterministisch (feste Schrittweite, kein Zufall), und `encodeInputs`/`decodeInputs`/`replay` in `sim.js` können Eingabeverläufe wiedergeben. Damit wäre später eine Prüfung auf dem Server möglich (Eingaben abspielen → gleiches Ergebnis). Das ist **nicht gebaut**. Bis dahin darf keine Client-Zahl als geprüft gelten und in keine globale Liste als geprüft einfließen.

## Werbefreiheit

Keine Werbung, keine Werbe- oder Tracking-SDKs, keine Wartezeiten vor dem Start, keine Pay-to-win-Mechanik, keine Cookies. Der Browser-Test „Werbefrei“ prüft, dass nur Anfragen an die eigene Adresse gehen, und sucht im Code nach bekannten Werbe-Bezeichnern.

## Portal-Einbindung

- Eigene Seite `/spiele/zahlensturm` mit Titel, Beschreibung, Canonical, Open Graph, JSON-LD (`VideoGame`), Anleitung („So geht's“ im Spiel), Vollbild und Pause.
- Startseite: Kachel im Block „Neu“ (vorn), JSON-LD-`ItemList`, Beschreibung („Elf Browserspiele“), „Weiter spielen“-Zeile („x von 20 Level · y Sterne“), Suche über `data-name`/`data-arten`. Damit das 5er-Raster im Block „Neu“ unverändert bleibt, wurde dort die doppelte Stellwerk-Kachel entfernt (Stellwerk bleibt in „Hot“).
- `sitemap.xml`, `public/assets/umzug.js` (Präfix `zahlensturm.`, Schlüssel `zahlensturm.v1`), README.
- Bestehende Spiele wurden nicht verändert.

## Qualitätssicherung

| Prüfung | Ergebnis | Stand |
|---|---|---|
| Rechnen (+ − × ÷, abrunden, nie negativ, Obergrenze) | grün (21 Sim-Tests) | gelaufen |
| Tore genau einmal, richtige Seite, Wechsel über dem Tor | grün | gelaufen |
| Hindernisse, Gegner (Schwelle), Boss, Bonus, Münzen, Awards | grün | gelaufen |
| Alle 20 Level lösbar (Bot-Lösungen in der Sim **und** im Browser-Spiel) | grün | gelaufen |
| Torvielfalt, Dauerlinien erreichen kein Par | grün | gelaufen |
| Browser: Laden, SEO, Menü, Pause, Steuerung per Tastatur, Maus und Touch-Ereignissen | grün (18 Browser-Tests) | gelaufen (Chromium, SwiftShader) |
| Browser: Sieg, Speicherstand, Neuladen, Awards, Anti-Farming, Niederlage | grün | gelaufen |
| Browser: Teilen (Link, PNG 1080×1080, ohne Web-Share-API), Herausforderungslink, kaputter/gesperrter Speicher | grün | gelaufen |
| Viewports 375×667, 390×844, 768×1024, 1440×900 (kein Seiten-Scrollen, HUD im Bild, Bild nicht leer) | grün | gelaufen |
| Keine Fremdanfragen, keine Werbe-Bezeichner | grün | gelaufen |
| Bestehende Tests (`playsaal`, `schraeglage*`) | grün (komplette Suite: 84 Tests). Eine Zeile in `tests/schraeglage.test.mjs` angepasst: Schräglage muss unter „Neu“ stehen, nicht mehr zwingend an erster Stelle | gelaufen |
| **Echte Geräte** (iPhone/Android, Safari, Firefox) | – | **nicht getestet** |
| **60 FPS auf Handys** | – | **nicht gemessen.** Software-WebGL (SwiftShader) sagt nichts über echte GPUs. Gemessen wurde nur die Last: ca. 90 Zeichenaufrufe und ca. 45 000 Dreiecke in Level 1; Figuren, Gegner, Münzen und Partikel sind instanziert. |
| **Echter Touch mit dem Finger** | – | **nicht getestet.** Der Test sendet Pointer-Ereignisse vom Typ „touch“, ersetzt aber kein Gerät. |
| **Spieltest durch Menschen** (Schwierigkeit, Spaß, Verständlichkeit) | – | **nicht erfolgt.** Der Bot beweist Lösbarkeit, nicht Spielgefühl. Par-Werte und Kurve sollten nach echten Spielrunden nachgezogen werden. |
| Barrierefreiheit (Screenreader, Kontrast) | – | nur Grundlagen (Beschriftungen, Fokus, Tastatur), nicht geprüft |
| Ranglisten / Server-Prüfung | – | nicht vorhanden |

## Bekannte Grenzen

- Gezeichnet werden höchstens 420 Figuren; die angezeigte Zahl kann bis 9999 gehen. Große Gruppen werden dichter statt breiter (Breitenkappe 3,2 m).
- Münzen sind lokal. Wer den Spielstand löscht, verliert sie.
- Töne sind synthetisch (WebAudio), keine Audiodateien.
- Die Strecke ist optisch hell gehalten (viel Weiß); ein dunkler Modus oder mehr Bodenstruktur wäre ein möglicher Feinschliff.
