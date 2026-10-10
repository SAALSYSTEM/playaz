# playaz.fun

Browserspiele ohne Anmeldung: **Linke Spur**, **Schwindelfrei**, **Hochstapler** und **Richtfest**.

- `public/` – die komplette Website (statisch, keine Build-Schritte)
- `public/spiele/` – die vier Spiele, je eine HTML-Datei
- `public/assets/` – selbst gehostete Schriften und three.js (keine externen CDNs, keine Google Fonts)
- `wrangler.jsonc` – Cloudflare Worker `playaz`, liefert `public/` als Static Assets aus

## Deployment

Cloudflare Workers Builds ist mit diesem Repo verbunden. Jeder Push auf `main` wird automatisch mit `npx wrangler deploy` veröffentlicht.

## Spielstände

Alle Rekorde liegen nur im `localStorage` des Browsers (Schlüssel `linkespur.v1`, `schwindelfrei.*`, `hochstapler.*`, `richtfest.*`). Kein Backend, keine Cookies, kein Tracking.

## Vor dem Livegang

`public/impressum.html` und `public/datenschutz.html` sind Vorlagen mit markierten Platzhaltern.
