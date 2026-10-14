# PlaySaal

Browserspiele ohne Anmeldung: **Anbiss**, **Stellwerk**, **Eiszeit**, **Linke Spur**, **Schwindelfrei**, **Hochstapler** und **Richtfest**.
Früher PlayAZ; Umstellung siehe [`docs/PLAYSAAL_UMSTELLUNG.md`](docs/PLAYSAAL_UMSTELLUNG.md).

- `public/` – die komplette Website (statisch, keine Build-Schritte)
- `public/spiele/` – die Spiele, je eine HTML-Datei (EISZEIT lädt zusätzlich seine Bilder aus `public/spiele/eiszeit/`)
- `public/brand/`, `public/favicon*`, `public/icon-*`, `public/og-*`, `public/twitter-*` – PlaySaal-Branding
- `public/umzug.html` + `public/assets/umzug*.js` – Spielstände von der alten auf die neue Adresse übertragen
- `public/assets/` – selbst gehostete Schriften und three.js (keine externen CDNs, keine Google Fonts)
- `design/` – Bildvorlagen in Originalgröße, `design/playsaal/` das Branding-Paket (wird nicht ausgeliefert)
- `tools/domain.mjs` – kanonische Adresse prüfen bzw. beim Domainwechsel in einem Schritt umstellen
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
node tools/domain.mjs                                   # Canonical/Sitemap/robots konsistent?
```

## Spielstände

Alle Rekorde liegen nur im `localStorage` des Browsers (Schlüssel `anbiss.v1`, `stellwerk.v1`, `eiszeit.*`, `linkespur.v1`, `schwindelfrei.*`, `hochstapler.*`, `richtfest.*`). Kein Backend, keine Cookies, kein Tracking.
`localStorage` hängt an der Adresse: Ein neues Spiel mit eigenem Schlüssel-Präfix muss in `public/assets/umzug.js` (Liste `SPIELE`) eingetragen werden, sonst wird es beim Umzug nicht mitgenommen.

## Vor dem Livegang

`public/impressum.html` und `public/datenschutz.html` sind Vorlagen mit markierten Platzhaltern.
