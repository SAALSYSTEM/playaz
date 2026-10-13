# playaz.fun

Browserspiele ohne Anmeldung: **Anbiss**, **Eiszeit**, **Linke Spur**, **Schwindelfrei**, **Hochstapler** und **Richtfest**.

- `public/` – die komplette Website (statisch, keine Build-Schritte)
- `public/spiele/` – die Spiele, je eine HTML-Datei (EISZEIT lädt zusätzlich seine Bilder aus `public/spiele/eiszeit/`)
- `public/assets/` – selbst gehostete Schriften und three.js (keine externen CDNs, keine Google Fonts)
- `design/` – Bildvorlagen in Originalgröße (wird nicht ausgeliefert)
- `wrangler.jsonc` – Cloudflare Worker `playaz`, liefert `public/` als Static Assets aus

## Deployment

Cloudflare Workers Builds ist mit diesem Repo verbunden. Jeder Push auf `main` wird automatisch mit `npx wrangler deploy` veröffentlicht.

Pushes auf andere Branches erzeugen eine Vorschau (`npx wrangler preview`, braucht den `previews`-Block in `wrangler.jsonc`). Die Vorschau-Adresse steht im Cloudflare-Dashboard unter **Previews**.

## Spielstände

Alle Rekorde liegen nur im `localStorage` des Browsers (Schlüssel `anbiss.v1`, `eiszeit.v1`, `linkespur.v1`, `schwindelfrei.*`, `hochstapler.*`, `richtfest.*`). Kein Backend, keine Cookies, kein Tracking.

## Vor dem Livegang

`public/impressum.html` und `public/datenschutz.html` sind Vorlagen mit markierten Platzhaltern.
