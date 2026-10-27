# PlaySaal

**Sternenpups – Hoch zu den Feen:** Einhorn-Kletterspiel für Kinder ab 4 im Hochformat: erreichbare Wolke antippen, das Einhorn pupst sich mit Sternenstaub hinüber. 20 Level (1 bis 20 Etagen) mit Ranken, Zauberstab für die Fee (Zauberwolken), Regenbogen und Elf; kein Absturz, keine Zeit, je Level 3 freiwillige Sterne, begonnene Level werden fortgesetzt. Noch `noindex` im Branch `sternenpups`. Details: [`docs/STERNENPUPS.md`](docs/STERNENPUPS.md), Bildprompts: [`design/sternenpups/PROMPTS.md`](design/sternenpups/PROMPTS.md). Test: `node --test tests/sternenpups-sim.test.mjs`.

**Ab in den Stall!:** Bauernhofspiel für Kinder ab 4 im Hochformat: vom Tier mit dem Finger einen Weg zu seinem Zuhause malen (Küken, Ferkel, Kälbchen, Lämmchen, Entchen, Fohlen). 30 Level in 3 Welten mit Bach und Brücke, Gattern zum Antippen und Pfützen nur für Ferkel; kein Scheitern, Herausforderung per Link. Veröffentlicht am 26.10.2026 (`/spiele/ab-in-den-stall`). Grafiken: Originale von ChatGPT in `design/ab-in-den-stall/`, als WebP per `tools/ab-in-den-stall-assets.py`; Zaun, Bach und Brücke werden gezeichnet. Details: [`docs/AB_IN_DEN_STALL.md`](docs/AB_IN_DEN_STALL.md). Test: `node --test tests/ab-in-den-stall-sim.test.mjs`.

**Halma:** Springspiel auf 16×16 Feldern (19 Steine je Seite, Sprungketten) mit denselben drei Computergegnern oder zu zweit. Veröffentlicht am 25.10.2026. Details: [`docs/HALMA.md`](docs/HALMA.md). Test: `node --test tests/halma-sim.test.mjs`.

**Backgammon:** Würfel-Brettspiel im Hochformat (Brett quer, Bande und Würfel in der Mitte) mit denselben drei Computergegnern oder zu zweit. Veröffentlicht am 24.10.2026. Details: [`docs/BACKGAMMON.md`](docs/BACKGAMMON.md). Test: `node --test tests/backgammon-sim.test.mjs`.

**Dame:** Brettspiel-Klassiker (8×8, Schlagpflicht, Mehrfachsprung, fliegende Dame) mit denselben drei Computergegnern wie Mühle oder zu zweit. Veröffentlicht am 24.10.2026. Details: [`docs/DAME.md`](docs/DAME.md). Test: `node --test tests/dame-sim.test.mjs`.

**Mühle:** Brettspiel-Klassiker im Hochformat gegen den Computer (Opa Willi · Gemütlich, Tante Gisela · Geübt, Professor Mühlberg · Meister) oder zu zweit an einem Gerät; Zug zurück, Fortsetzen nach dem Neuladen, Bilanz je Gegner. Veröffentlicht am 24.10.2026, erstes Spiel der Kategorie Brettspiele. Details: [`docs/MUEHLE.md`](docs/MUEHLE.md). Test: `node --test tests/muehle-sim.test.mjs`.

**Krümel – Die große Käsejagd:** Jump'n'Run im Hochformat mit der Maus Krümel, 60 Level in 7 Welten: Küche (1–5), Speisekammer (6–10), Keller (11–20, Mauselöcher), Garten (21–30), Backstube (31–40: Kaffeetropfen im Takt, Toaster, Förderband, Backpulver macht kurz langsam, Spülschwamm, Mäusefreunde befreien und mit ihnen einen Tunnel durch den Riesenkuchen futtern), Dachboden (41–50: voller Ballon trägt hoch, schlaffer schwebt hinunter) und Gartenfest (51–60: wilde Katzen nur mit Wollknäuel oder Gartenschlauch, Verfolgungsjagd mit Fürst Fauch in 56 und 60). Grundelemente: Kochlöffel-Leitern, Regalbretter, Schubladen, Crispy-Cookies, Käse (groß) und Minze (klein), Zuckerwürfel, Waage, Kätzchen, Schlafkater. Krümel 1 Punkt, Schokolinsen 5 Punkte, 3 Goldkäse je Level. Treffer oder Sturz: zurück zum letzten Fähnchen. Level 1–10 von Hand, 11–60 aus Bausteinen (`PLAN` in `levels.js`; jeder Baustein füllt den Boden bis unten, dadurch keine Hohlräume). Veröffentlicht am 24.10.2026 (`/spiele/kruemel`), Level 11–60 am selben Tag. Alle Welten haben ChatGPT-Grafiken; nur die wilde Katze ist noch ein gezeichneter Platzhalter. Grafiken: Originale von ChatGPT in `design/kruemel/`, als WebP per `tools/kruemel-assets.py`; Ohne Konto erscheint ab 2 geschafften Leveln im Menü und nach jedem Level ein Hinweis „Spielstand sichern“ (öffnet die PlaySaal-Anmeldung). Regeln/Physik und Löser: `public/spiele/kruemel/engine.js`, Oberfläche: `game.js`. Test: `node --test tests/kruemel-sim.test.mjs` (je Level: Start → Fähnchen → Ziel lösbar, Goldkäse erreichbar, keine Sackgassen, Fallwege höchstens 4 Kacheln, Platz zum Wachsen an Käse-Stationen).

**Ausfahrt frei:** Schiebe-Rätsel im Hochformat (6×6-Bauhof, Fahrzeuge nur in Längsrichtung, der Betonmischer muss zur Ausfahrt). Tagesrätsel aus einem vorab geprüften Pool (ein gewerteter Versuch je Konto, wenigste Züge vor Zeit, geprüfte Tagesrangliste) und 30 Level. Veröffentlicht am 23.10.2026. Details: [`docs/AUSFAHRT_FREI.md`](docs/AUSFAHRT_FREI.md). Tests: `node --test tests/ausfahrt-sim.test.mjs tests/ausfahrt-pruefung.test.mjs`.

**Leitungschaos:** Rohr-Rätsel im Hochformat: Rohre antippen und drehen, bis das Wasser vom Hydranten zu allen Häusern fließt. Tagesrätsel (ein gewerteter Versuch je Konto, Zeit von der Datenbank, geprüfte Tagesrangliste mit Archiv) und 30 Level mit Sternen. Veröffentlicht am 23.10.2026. Details: [`docs/LEITUNGSCHAOS.md`](docs/LEITUNGSCHAOS.md). Tests: `node --test tests/ausfahrt-sim.test.mjs            # AUSFAHRT FREI: Regeln, Level und Tagespool mit Löser geprüft, Nachspielen
node --test tests/leitungschaos-sim.test.mjs tests/leitungschaos-pruefung.test.mjs`.

**Papierpilot:** Papierflieger-Spiel im Hochformat: vom Dach werfen, links/rechts steuern, Aufwinde und Ringe nutzen, Bäumen und Türmen ausweichen; Ziel ist die größte Flugweite. Täglich neue Strecke für alle, eigener Geisterflieger und geprüfte Tagesrangliste (Distanz, dann Zeit). Veröffentlicht am 22.10.2026. Details: [`docs/PAPIERPILOT.md`](docs/PAPIERPILOT.md). Tests: `node --test tests/papierpilot-sim.test.mjs tests/papierpilot-pruefung.test.mjs`.

**Dartfieber:** Dart-Geschicklichkeitsspiel (5 Pfeile, zwei Tipps pro Wurf, Wind, goldene Bonusziele) mit Tageschallenge und geprüfter Tagesrangliste samt Archiv. Veröffentlicht am 22.10.2026 (in der Übersicht sichtbar, sobald `listed = true` gesetzt ist). Details: [`docs/DARTFIEBER.md`](docs/DARTFIEBER.md). Tests: `node --test tests/dartfieber-sim.test.mjs tests/dartfieber-pruefung.test.mjs tests/dartfieber.test.mjs`.

**Wasser Marsch!:** Feuerwehrspiel für Kinder ab 4 im Hochformat: Finger halten = Wasser spritzt zum Finger, Feuer löschen, danach Katzen antippen – die Drehleiter holt sie herunter (ab Level 21 zieht das Kind den Korb selbst zum Fenster). 25 feste Level in 6 Szenen, kein Scheitern, keine Zeit. Noch `noindex` und nicht auf der Startseite (Test über `/spiele/wasser-marsch`). Regeln/Layout: `public/spiele/wasser-marsch/engine.js`, Level: `levels.js`, Oberfläche: `game.js`, Bilder aus `design/wasser-marsch/` per `tools/wasser-marsch-assets.py`. Details und Abweichungen: [`docs/WASSER_MARSCH.md`](docs/WASSER_MARSCH.md). Test: `node --test tests/wasser-marsch-sim.test.mjs`.

**Jungle Runner:** 3D-Dschungel-Läufer mit 30 festen Leveln in 5 Welten, Junge oder Mädchen, Tieren, Power-ups, Awards, Teilen und Endlosmodus; Figuren und Tiere sind deklarierte Platzhalter. Details, Asset-Liste und Teststand in [`docs/JUNGLE_RUNNER.md`](docs/JUNGLE_RUNNER.md); Module in `public/spiele/jungle-runner/`.

**Turmschicht:** Retro-Arcade für Erwachsene im Hochformat (Pixelgrafik): aus einem Stahlturm ausbrechen, Hebel schalten Leitern zwischen zwei festen Stellen um (gestrichelt = Zielposition), Patrouillen und Jäger mit „!“-Ankündigung und Wegsuche über nutzbare Leitern, 3 Herzen, Rückstoß und 1,5 s Schutz. Zwei Bestzeit-Modi (Schneller Ausbruch / Perfekter Lauf mit allen 3 Sternen), Herausforderung per Link `?l=Level&m=s|p&t=Hundertstel`. Regeln, Löser und Bot: `public/spiele/turmschicht/engine.js`; Level 1–6 von Hand (`tools/turmschicht-tutorial.mjs`), 7–30 vom Generator `tools/turmschicht-levels.mjs` geprüft und fest in `levels.js` gespeichert; Oberfläche `game.js`. Test: `node --test tests/turmschicht-sim.test.mjs`.

**Dino-Leiterhelden:** 2D-Kletterspiel im Hochformat für Kinder ab 4: 90 handgebaute Level, drei Dino-Freunde einsammeln und über Leitern ins Baumhaus bringen. Schlafmonster (Frucht bringen), Hebel (versteckte Leiter) und fallende Kokosnüsse (kurzer „Bonk“, zurück zum letzten Leiterende). Ab Level 31 kommen drei Elemente dazu: Rutsche (am Einstieg nach unten ziehen, rutscht von allein zur Etage darunter, nur abwärts), Fahr-Brücke (pendelt in festem Takt über eine Lücke, aufsteigen nur wenn sie anlegt) und Wechsel-Monster (schläft = passierbar, blinzelt = Warnung, wach = versperrt den Weg und schiebt sanft zurück, ohne Rücksetzer). Level 31–35 Aufwärmen, 36–42 Rutsche, 43–49 Brücke, 50–55 Wechsel-Monster, 56–60 Mischungen. Ab Level 61 kommen Heißluftballon (davor nach oben ziehen, fliegt ein oder zwei Etagen durch eine Lücke hoch und schwebt danach leer zurück, nur aufwärts) und Langhals dazu (will ein Blatt; satt legt er seinen Hals als Brücke über eine Lücke, der Dino läuft darüber; man trägt immer nur Frucht oder Blatt). Level 61–64 Aufwärmen, 65–71 Ballon, 72–78 Langhals, 79–84 beides, 85–90 Mischungen. Ballon und Langhals nur in Leveln mit höchstens 5 Etagen. Schwebender Joystick dort, wo der Finger aufsetzt; Pfeiltasten/WASD am Rechner. Fester 60-Hz-Takt, damit Herausforderungs-Links (`?l=Level&t=Hundertstel&r=Rücksetzer`) überall gleich zählen. Regeln, Level-Prüfung, Löser und Bot: `public/spiele/dino-leiterhelden/engine.js`, Level: `levels.js`, Oberfläche: `game.js`. Grafiken: Originale von ChatGPT in `design/dino-leiterhelden/`, als WebP in `dino-leiterhelden/img/` (Liste `IMAGES` in `game.js`; Hintergründe werden pro Level nachgeladen). Fehlt ein Bild, zeichnet das Spiel einen Platzhalter. Hintergrundlied `dino-leiterhelden/musik.mp3` (64 kbit/s, Schleife, nur während des Spielens, folgt dem Ton-Knopf). Test: `node --test tests/ab-in-den-stall-sim.test.mjs      # AB IN DEN STALL!: 30 Level lösbar (Löser + Bot), Wegmalen, Gatter, Pfützen, Spielstand, Herausforderung
node --test tests/dino-leiterhelden-sim.test.mjs`.

**Richtfest:** Baumonster-Rollenspiel im Gameboy-Stil (eine Datei: `public/spiele/richtfest.html`). Erweiterung vom 23.10.2026: Nach dem Richtfest öffnet sich das Osttor zum Steinbruch (zweites Gebiet) mit 6 neuen Baumonstern (jetzt 12), stärkeren Attacken bis Level 21, drei Trainern (Maurer Moritz, Zimmerin Zoe, Schweißer Sven), Imbiss Ilse (heilt, füllt auf) und der Baumeister-Arena: Bronze-, Silber- und Gold-Cup mit je 3 Runden und Trinkpause dazwischen, Preis: Ziegel-, Stahl- und Richtkranz-Orden (Menü „Orden“). Erfahrung wird zur Hälfte ans übrige Team verteilt. Alte Spielstände (`richtfest.save.v1`) laden weiter; neu sind `area` und `orden`.

**Geisterschloss:** 3D-Halloween-Spiel in Ich-Perspektive mit 20 festen Fluren, Knoblauchwürfen, drei Gegnertypen, Bossfluren, Punkte- und Serienwertung, lokalem Fortschritt und teilbaren Level-Ergebnissen. Regeln in `public/spiele/geisterschloss/engine.js`, Grafik und Steuerung in `game.js`.

**Kristallrausch:** eigenständiges Höhlen-Arcade mit 20 deterministischen und erreichbaren Höhlen, Kristallquote, fallenden und schiebbaren Felsen, Timer, Sternen, Handy-Wisch- und Steuerkreuzbedienung. Engine: `public/spiele/kristallrausch/engine.js`; Oberfläche: `public/spiele/kristallrausch/game.js`; Test: `node --test tests/kristallrausch-sim.test.mjs`.

**MySupermarkt:** echtes 3D-Aufbauspiel mit Laden- und Online-Warenkette, zwölf Produkten, Mitarbeitern und 20 Meilensteinen. Neue rundum modellierte Figuren mit separater 360°-Ansicht. Implementierung und offene Browserabnahme: [`docs/MYSUPERMARKT.md`](docs/MYSUPERMARKT.md). Veröffentlichung auf `main` am 17.10.2026 ausdrücklich vom Auftraggeber freigegeben.

Browserspiele ohne Anmeldung: **Jungle Runner**, **SprungSebi**, **Zahlensturm**, **Schräglage**, **Sondengänger**, **Stammvölker**, **Anbiss**, **Stellwerk**, **Eiszeit**, **Linke Spur**, **Schwindelfrei**, **Hochstapler** und **Richtfest**.
Früher PlayAZ; Umstellung siehe [`docs/PLAYSAAL_UMSTELLUNG.md`](docs/PLAYSAAL_UMSTELLUNG.md).

- `public/` – die komplette Website (statisch, keine Build-Schritte)
- `public/spiele/` – die Spiele, je eine HTML-Datei. SPRUNGSEBI ist eine Hochkant-Flucht vor steigendem Wasser mit 30 deterministischen Kletterstrecken in `sprungsebi/engine.js` und der Canvas-Oberfläche in `sprungsebi/game.js`. BLOCKSAAL bleibt als `noindex`-Prototyp direkt erreichbar, ist aber nicht mehr auf der Startseite oder in der Sitemap. EISZEIT lädt zusätzlich Bilder; SCHRÄGLAGE und ZAHLENSTURM sind in eigenen Unterordnern dokumentiert; HAU DIE KAKERLAKE! ist ebenfalls modular aufgebaut.
- `public/brand/`, `public/favicon*`, `public/icon-*`, `public/og-*`, `public/twitter-*` – PlaySaal-Branding
- `public/umzug.html` + `public/assets/umzug*.js` – Spielstände von der alten auf die neue Adresse übertragen
- `public/assets/` – selbst gehostete Schriften und three.js (keine externen CDNs, keine Google Fonts)
- `design/` – Bildvorlagen in Originalgröße, `design/playsaal/` das Branding-Paket (wird nicht ausgeliefert)
- `tools/domain.mjs` – kanonische Adresse prüfen bzw. beim Domainwechsel in einem Schritt umstellen
- `tools/schraeglage-bot.mjs` – Lösungs-Bot für die 60 SCHRÄGLAGE-Level (Lösbarkeit, Timing-Toleranz, Goldzeiten), `tools/planck-vendor.mjs` – Physik-Engine neu einbinden
- `tools/jungle-pruefer.mjs` – Streckenprüfer für die 30 JUNGLE-RUNNER-Level und den Endlosmodus (kollisionsfreie Route, Reaktionszeiten, Checkpoints, Sterne); schreibt `tests/jungle-loesungen.json`
- `tools/zahlensturm-bot.mjs` – Lösungs-Bot für die 20 ZAHLENSTURM-Level (Lösbarkeit, Par, Münzrouten, Torvielfalt); schreibt `public/spiele/zahlensturm/par.js` und `tests/zahlensturm-loesungen.json`
- `tests/` – Browser-Tests (Playwright gegen `wrangler dev`)
- `wrangler.jsonc` – Cloudflare Worker `playaz` (technischer Name bleibt), liefert `public/` als Static Assets aus

## Design-Regeln

Farbrollen und Tokens: `design/playsaal/brand-tokens.json` (`roles`, `rules`), umgesetzt als CSS-Variablen in `public/assets/site.css`. Kurz: Anthrazit = Bühne, Orange = Marke, Gelb = Aktionen, Rot-Orange nur im Logo.

## Deployment

Cloudflare Workers Builds ist mit diesem Repo verbunden. Jeder Push auf `main` wird automatisch mit `npx wrangler deploy` veröffentlicht.

Pushes auf andere Branches erzeugen eine Vorschau (`npx wrangler preview`, braucht den `previews`-Block in `wrangler.jsonc`). Die Vorschau-Adresse steht im Cloudflare-Dashboard unter **Previews**.

## Tests

```sh
npm i -g playwright && npx playwright install chromium   # einmalig
node --test --test-concurrency=1 tests/*.test.mjs       # startet wrangler dev selbst
node --test tests/schraeglage-sim.test.mjs              # nur SCHRÄGLAGE-Physik und Level, ohne Browser (schnell)
node --test tests/zahlensturm-sim.test.mjs              # nur ZAHLENSTURM-Rechnen, Tore, Kämpfe und alle 20 Level, ohne Browser (schnell)
node --test tests/jungle-sim.test.mjs                   # nur JUNGLE RUNNER: Regeln, Level, Speicherstand, Lösungsrouten, ohne Browser (schnell)
node --test tests/kakerlake-sim.test.mjs                # nur HAU DIE KAKERLAKE!: Level, Logik, Bot-Durchläufe, ohne Browser (schnell)
node --test tests/sprungsebi-sim.test.mjs           # SPRUNGSEBI: 30 Level, Fortschritt, Teilen-Text und Vorschau
node --test tests/turmschicht-sim.test.mjs          # TURMSCHICHT: 30 Level beide Modi lösbar (Löser + Bot), Hebel, Jäger, Herzen, Herausforderung
node --test tests/wasser-marsch-sim.test.mjs        # WASSER MARSCH!: 25 Level, Leitersteuerung, Layout 360×640, Rettung, Spielstand
node --test tests/leitungschaos-sim.test.mjs        # LEITUNGSCHAOS: 30 Level + 200 Tagesrätsel gültig und lösbar, Fluss, Prüfung
node --test tests/muehle-sim.test.mjs               # MÜHLE: Regeln, Remis, Kodierung, Stufen-Turniere, Zeitlimit Meister
node --test tests/kruemel-sim.test.mjs              # KRÜMEL: Sprunghöhe, Kanten-Toleranz, Puffer, Leiter, Schublade, Kätzchen, Level lösbar ohne Sackgassen
node --test tests/sternenpups-sim.test.mjs          # STERNENPUPS: 20 Level lösbar, Pflichtaufgaben nötig, keine Sackgassen, Sterne erreichbar, Spielstand
node --test tests/dino-leiterhelden-sim.test.mjs    # DINO-LEITERHELDEN: 90 Level lösbar (Löser + Bot), Regeln inkl. Rutsche/Brücke/Wechsel-Monster/Ballon/Langhals, Spielstand, Herausforderung
node tools/domain.mjs                                   # Canonical/Sitemap/robots konsistent?
```

## Spielstände

Alle Rekorde liegen nur im `localStorage` des Browsers (unter anderem `sternenpups.v1`, `leitungschaos.v1`, `stall.v1`, `wassermarsch.v1`, `jungle.v1`, `turmschicht.v1`, `dinoleiter.v1`, `sprungssebi.v1`, `zahlensturm.v1`, `kakerlake.v1`, `schraeglage.v1`, `anbiss.v1`, `stellwerk.v1`, `eiszeit.*`, `linkespur.v1`, `schwindelfrei.*`, `hochstapler.*`, `richtfest.*`). Ohne Konto bleibt alles auf dem Gerät. Optional gibt es Konten mit Cloud-Speicherständen (Supabase), siehe [docs/KONTEN.md](docs/KONTEN.md). Keine Cookies, keine Werbe- oder Analysedienste Dritter.
`localStorage` hängt an der Adresse: Ein neues Spiel mit eigenem Schlüssel-Präfix muss in `public/assets/umzug.js` (Liste `SPIELE`) eingetragen werden, sonst wird es beim Umzug nicht mitgenommen.

## Vor dem Livegang

`public/impressum.html` und `public/datenschutz.html` sind Vorlagen mit markierten Platzhaltern.

