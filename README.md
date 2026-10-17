# PlaySaal

**Geisterschloss:** 3D-Halloween-Spiel in Ich-Perspektive mit 20 festen Fluren, Knoblauchwürfen, drei Gegnertypen, Bossfluren, Punkte- und Serienwertung, lokalem Fortschritt und teilbaren Level-Ergebnissen. Regeln in `public/spiele/geisterschloss/engine.js`, Grafik und Steuerung in `game.js`.

**Kristallrausch:** eigenständiges Höhlen-Arcade mit 20 deterministischen und erreichbaren Höhlen, Kristallquote, fallenden und schiebbaren Felsen, Timer, Sternen, Handy-Wisch- und Steuerkreuzbedienung. Engine: `public/spiele/kristallrausch/engine.js`; Oberfläche: `public/spiele/kristallrausch/game.js`; Test: `node --test tests/kristallrausch-sim.test.mjs`.

**MySupermarkt:** echtes 3D-Aufbauspiel mit Laden- und Online-Warenkette, zwölf Produkten, Mitarbeitern und 20 Meilensteinen. Neue rundum modellierte Figuren mit separater 360°-Ansicht. Implementierung und offene Browserabnahme: [`docs/MYSUPERMARKT.md`](docs/MYSUPERMARKT.md). Veröffentlichung auf `main` am 17.10.2026 ausdrücklich vom Auftraggeber freigegeben.

Browserspiele ohne Anmeldung: **SprungSebi**, **BauSaal**, **Zahlensturm**, **Schräglage**, **Sondengänger**, **Stammvölker**, **Anbiss**, **Stellwerk**, **Eiszeit**, **Linke Spur**, **Schwindelfrei**, **Hochstapler** und **Richtfest**.
Früher PlayAZ; Umstellung siehe [`docs/PLAYSAAL_UMSTELLUNG.md`](docs/PLAYSAAL_UMSTELLUNG.md).

- `public/` – die komplette Website (statisch, keine Build-Schritte)
- `public/spiele/` – die Spiele, je eine HTML-Datei. SPRUNGSEBI ist eine Hochkant-Flucht vor steigendem Wasser mit 30 deterministischen Kletterstrecken in `sprungsebi/engine.js` und der Canvas-Oberfläche in `sprungsebi/game.js`. BAUSAAL trennt Regeln (`bausaal/engine.js`) und Oberfläche (`bausaal/game.js`). BLOCKSAAL bleibt als `noindex`-Prototyp direkt erreichbar, ist aber nicht mehr auf der Startseite oder in der Sitemap. EISZEIT lädt zusätzlich Bilder; SCHRÄGLAGE und ZAHLENSTURM sind in eigenen Unterordnern dokumentiert; HAU DIE KAKERLAKE! ist ebenfalls modular aufgebaut.
- `public/brand/`, `public/favicon*`, `public/icon-*`, `public/og-*`, `public/twitter-*` – PlaySaal-Branding
- `public/umzug.html` + `public/assets/umzug*.js` – Spielstände von der alten auf die neue Adresse übertragen
- `public/assets/` – selbst gehostete Schriften und three.js (keine externen CDNs, keine Google Fonts)
- `design/` – Bildvorlagen in Originalgröße, `design/playsaal/` das Branding-Paket (wird nicht ausgeliefert)
- `tools/domain.mjs` – kanonische Adresse prüfen bzw. beim Domainwechsel in einem Schritt umstellen
- `tools/schraeglage-bot.mjs` – Lösungs-Bot für die 30 SCHRÄGLAGE-Level (Lösbarkeit, Timing-Toleranz, Goldzeiten), `tools/planck-vendor.mjs` – Physik-Engine neu einbinden
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
node --test tests/kakerlake-sim.test.mjs                # nur HAU DIE KAKERLAKE!: Level, Logik, Bot-Durchläufe, ohne Browser (schnell)
node --test tests/sprungsebi-sim.test.mjs           # SPRUNGSEBI: 30 Level, Fortschritt, Teilen-Text und Vorschau
node --test tests/bausaal-sim.test.mjs             # BAUSAAL: 3D-Packregeln, Drehungen, Kollisionen, zufälliger Doppelstapel und Abfall
node tools/domain.mjs                                   # Canonical/Sitemap/robots konsistent?
```

## Spielstände

Alle Rekorde liegen nur im `localStorage` des Browsers (unter anderem `sprungssebi.v1`, `bausaal.v1`, `zahlensturm.v1`, `kakerlake.v1`, `schraeglage.v1`, `anbiss.v1`, `stellwerk.v1`, `eiszeit.*`, `linkespur.v1`, `schwindelfrei.*`, `hochstapler.*`, `richtfest.*`). Kein Backend, keine Cookies, kein Tracking.
`localStorage` hängt an der Adresse: Ein neues Spiel mit eigenem Schlüssel-Präfix muss in `public/assets/umzug.js` (Liste `SPIELE`) eingetragen werden, sonst wird es beim Umzug nicht mitgenommen.

## Vor dem Livegang

`public/impressum.html` und `public/datenschutz.html` sind Vorlagen mit markierten Platzhaltern.

BauSaal: Drei räumliche Baugruben (Schacht, Kamin, L-Zimmer), sechs Betonformen, jede zweimal pro zufälligem Lieferstapel. Keine Zeitautomatik, keine Löschung voller Ebenen. Drei Teile pro Runde aussortierbar. Regeln ohne DOM, perspektivische Canvas-Ansicht mit vier Blickwinkeln. Gelbe Zielhilfe standardmäßig an, abschaltbar. Zweireihige Steuerung mit einzelnen Pfeiltasten in der Mitte. Lokale Bestwerte je Baugrube.
