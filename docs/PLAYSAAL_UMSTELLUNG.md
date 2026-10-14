# PlayAZ → PlaySaal: Umstellung

Stand: 14.10.2026 · Branch `playsaal-rebrand` · Phase A umgesetzt, Phase B vorbereitet, **nicht live**.

## 1. Bestandsaufnahme

| Thema | Befund |
|---|---|
| Framework/Build | Keins. Statisches HTML/JS in `public/`, kein `package.json`, kein Build-Schritt |
| Hosting | Cloudflare Worker `playaz` (nur Static Assets, kein Worker-Code), Workers Builds: Push auf `main` = Produktion |
| Erreichbare Produktivadresse | `https://playaz.cf-922.workers.dev` (geprüft) |
| `playaz.fun` | Bisher in allen Canonicals/OG eingetragen, liefert aber **nicht** diese Seite aus (Abruf scheitert an fremder robots.txt). Ob die Domain gehört, ist offen → wird nicht weitergeleitet und nicht als Umzugsquelle zugelassen |
| Routing | Worker-Assets mit `html_handling` Standard: `/spiele/linke-spur` = 200, `/spiele/linke-spur.html` → 307 auf die saubere URL, unbekannte Pfade → `404.html` |
| Accounts/Auth | Keine. Kein Supabase, kein D1, kein OAuth (Google/Apple), keine Cookies, keine E-Mail-Konfiguration im Code |
| PWA | `site.webmanifest`, **kein** Service Worker |
| Spielstände | Nur `localStorage`, 13 Schlüssel in 7 Präfixen: `anbiss.v1`, `stellwerk.v1`, `eiszeit.v1/.best/.muted`, `linkespur.v1`, `schwindelfrei.best/.muted`, `hochstapler.best/.bestFloors/.muted`, `richtfest.save.v1/.muted`. Kein IndexedDB |
| CSP/CORS/Redirects | Keine CSP, kein CORS, keine `_redirects`. `_headers` nur Sicherheits-/Cache-Header |
| Tests | Keine vorhanden → neu angelegt (siehe 4.) |

## 2. Änderungen (Phase A)

**Branding**
- Logos, Favicons (SVG/ICO/PNG), Apple-Touch, PWA-Icons inkl. maskable, OG- und Twitter-Bild aus dem ZIP übernommen (`public/brand/`, `public/*`).
- Alte Assets entfernt: `logo.png`, `social-preview-1200x630.png`, `social-preview-1200x1200.png`, `android-chrome-*.png`.
- `site.webmanifest` **zusammengeführt** statt überschrieben: `lang`, `start_url`, `scope`, `display` bleiben; Name/Icons/Farben neu. `id: "/"` entspricht der bisherigen impliziten ID → installierte PWAs bleiben dieselbe App.
- Startseite: neues Logo (Header), Footer, Titel, Farbwelt auf Markenfarben (`#11121A`, `#FFD21C`, `#FF9200`, `#FF4A13`), JSON-LD `WebSite` (mit `alternateName: PlayAZ`). Spielkarten-Akzente der einzelnen Spiele unverändert.
- 404, Impressum, Datenschutz: Logo, Titel, Farben. Rechtliche Platzhalter **unverändert** (nichts erfunden).
- Alle 7 Spiele: `og:site_name`, `og:title`, Titel (wo die Marke stand), Favicon-SVG, Theme-Farbe (nur wo es die Portalfarbe war), Home-Button-Label „Alle Spiele auf PlaySaal“ + Akzent in Markengelb. Spielnamen, Spiellogik, Saves: unverändert.
- **Korrektur am Logo-Asset:** In beiden horizontalen SVGs aus dem ZIP war die viewBox 218 px hoch, die Wortmarke reicht bis ~239 px → Unterlängen von „p“ und „y“ wurden abgeschnitten. viewBox auf 244 px erweitert, Pfade und Farben unverändert. **Die PNG-Varianten `playsaal-logo-horizontal-*.png` sind ebenfalls beschnitten** (werden auf der Seite nicht verwendet) → bitte vom Gestalter neu exportieren lassen.

**Domain-Vorbereitung**
- Canonical, `og:url`, OG/Twitter-Bilder, JSON-LD zeigen jetzt auf die **tatsächlich erreichbare** Adresse `https://playaz.cf-922.workers.dev` (vorher auf `playaz.fun`, die diese Seite nicht ausliefert). Canonicals ohne `.html` (die `.html`-Variante leitet per 307 um).
- Neu: `sitemap.xml`, `robots.txt` mit Sitemap-Verweis.
- Share-Links in Eiszeit und Stellwerk lesen jetzt den Canonical-Link statt einer festen URL → stellen sich beim Cutover automatisch mit um. Hochstapler nutzt weiter `location.hostname`.
- `tools/domain.mjs`: prüft Konsistenz bzw. stellt beim Cutover **alles in einem Schritt** um (Canonicals, OG, JSON-LD, Sitemap, robots, Umzug-Hinweis).
- `wrangler.jsonc`: `"workers_dev": true` ausdrücklich gesetzt. Grund: Laut Cloudflare-Doku wird `workers_dev` beim Hinzufügen von `routes` sonst automatisch `false` → alte Adresse und damit alle lokalen Spielstände wären weg.

**Bewusst NICHT umbenannt (technische IDs)**
- Worker-Name `playaz` (bestimmt die alte Adresse), Repo-Name, `localStorage`-Schlüssel, CSS-Klasse `pz-home`, Ordner `design/eiszeit`. Umbenennen würde Saves oder die alte Adresse brechen.

## 3. Spielstand-Umzug (alte → neue Adresse)

`localStorage` ist an die Origin gebunden; `playsaal.com` sieht die Daten von `playaz.cf-922.workers.dev` nicht. Umsetzung in `public/umzug.html`, `public/assets/umzug.js`, Adressen zentral in `public/assets/umzug-config.js`.

**Ablauf (Fenster-Transfer, nutzerinitiiert)**
1. Spieler öffnet `playsaal.com/umzug` → „Spielstände von playaz.cf-922.workers.dev holen“.
2. Es öffnet sich `playaz.cf-922.workers.dev/umzug#senden=<Einmal-Kennung>` → Spieler tippt „Übertragen“.
3. Alte Seite sendet per `postMessage` **nur an `https://playsaal.com`** (targetOrigin). Neue Seite akzeptiert nur: richtige Origin **und** das selbst geöffnete Fenster **und** passende 128-bit-Kennung.
4. Neue Seite zeigt Vergleich je Spiel (alt / hier), Vorauswahl = mehr Fortschritt; Spieler bestätigt.
5. Vor dem Schreiben Sicherung der überschriebenen Werte → „Umzug rückgängig machen“. Schreibfehler (Speicher voll/Privatmodus) → automatische Wiederherstellung, nichts halb geschrieben.
6. Alte Adresse behält ihre Daten (nichts wird gelöscht) und merkt sich den Umzug (`playsaal.umzug.gesendet`).

**Fallback:** „Als Datei sichern“ / „Als Text kopieren“ auf alt, „Aus Datei laden“ / „Text prüfen“ auf neu (für App-Browser, Pop-up-Blocker).

**Schutz:** Whitelist nach Spiel-Präfix + Schlüsselmuster, nur gültiges JSON, Größenlimits, Versionsfeld; Meta-Schlüssel `playsaal.*` und alle fremden Schlüssel (z. B. Tokens) werden nie übertragen. Keine Iframes (würden in Safari/Firefox wegen Speicher-Partitionierung leer lesen).

**Getestet (automatisiert, Chromium):** Desktop und Handy-Emulation (390 px, Touch); Merge mit Vorauswahl; Rückgängig; leere alte Adresse; Datei-Export/-Import; gefälschte Nachrichten von fremder Origin, aus der Seite selbst und mit falscher Kennung → ignoriert; Quota-Fehler → kein Teilzustand; Spiel liest den übernommenen Stand.

**⚠ Nicht getestet:** echtes iOS-Safari/Android-Chrome, Safari-Privatmodus, In-App-Browser (Instagram/WhatsApp). Grund: kein echtes Gerät hier, nur Chromium. Erst nach Test auf echten Geräten (Schritt B6) ist der Umzug als zuverlässig anzusehen. Neue Spiele mit neuem Präfix müssen in `SPIELE` in `umzug.js` eingetragen werden.

## 4. Tests & Prüfungen

`node --test --test-concurrency=1 tests/*.test.mjs` → **11/11 bestanden**: alle Routen inkl. `/spiele/linke-spur`, `.html`-Redirects, 404; keine alte Marke im sichtbaren Text/Titel/Meta auf allen Seiten; keine JS-Fehler; Canonical = og:url = echter Pfad; Manifest-Icons und alle lokal verlinkten Dateien erreichbar (Linkcheck); Umzug (siehe 3.); Umzug-Hinweis nur bei `aktiv: true`.
`node tools/domain.mjs` → konsistent. `wrangler deploy --dry-run` → ok. Testlauf des Cutover-Skripts auf einer Kopie → alle 33 URLs, Sitemap, robots, `aktiv: true` korrekt.
Nicht vorhanden/nicht anwendbar: Typecheck, Lint, Build (kein Tooling im Projekt).

## 5. Phase B – Plan (NICHTS davon ist ausgeführt)

Offene externe Umstellungen:

| Wo | Was |
|---|---|
| STRATO | DNS-IST-Zustand exportieren (NS, A/AAAA, CNAME, **MX, SPF, DKIM, DMARC**, SRV/Autodiscover, CAA, Verifikationen, Subdomains); DNSSEC-Status prüfen; später Nameserver eintragen |
| Cloudflare | Zone `playsaal.com` im **selben Account wie Worker `playaz`** anlegen, zugewiesene Nameserver notieren, alle Mail-Records 1:1 übertragen (DNS only, nicht proxied); Custom Domain `playsaal.com` am Worker `playaz`; `www` → Apex 301 |
| Google Search Console | Property `playsaal.com` (Domain-Property per TXT), Sitemap einreichen |
| Google/Apple OAuth, Supabase | **Entfällt** – im Projekt nicht vorhanden. Wenn Accounts später kommen: direkt mit `playsaal.com` als Site URL anlegen |

Schritte:
- **B1** STRATO-DNS als Tabelle sichern (Screenshot/Export) → mit dir abgleichen.
- **B2** Cloudflare-Zone anlegen, Records vollständig nachbauen, Nameserver notieren. Klären: STRATO-Postfach @playsaal.com vorhanden? DNSSEC aktiv?
- **B3** Branch `playsaal-cutover` vorbereiten: `node tools/domain.mjs https://playsaal.com` + in `wrangler.jsonc` `"routes": [{ "pattern": "playsaal.com", "custom_domain": true }]` (`workers_dev: true` bleibt!). Noch nicht mergen.
- **B4 ⛔ GO-LIVE-CHECKPOINT – nur nach deinem ausdrücklichen GO:**
  1. ggf. DNSSEC bei STRATO deaktivieren und Ablauf abwarten
  2. Nameserver bei STRATO auf die Cloudflare-Werte setzen
  3. Warten bis Zone „Active“, dann `playsaal-cutover` mergen (Custom Domain + Canonicals + Umzug-Hinweis gleichzeitig)
- **B5** Prüfen: `https://playsaal.com`, `www` → Apex, alle 7 Spiele + `.html`-Redirects, Favicon, OG-Vorschau (z. B. Teilen in WhatsApp), sitemap/robots, Mail **senden und empfangen**, SPF/DKIM/DMARC; alte Adresse weiterhin erreichbar.
- **B6** Umzug auf echten Geräten testen (iPhone Safari normal + privat, Android Chrome, ein In-App-Browser).
- **B7** Später, nach Umzugsphase (Vorschlag ≥ 3 Monate): alte Adresse pfadgleich per 301 auf `playsaal.com` – braucht ein kleines Worker-Skript (Host-Prüfung), da `workers.dev` keine Redirect-Regeln kennt; `/umzug` davon ausnehmen. Erst danach evtl. `workers_dev: false`.
- **B8** DNSSEC bei Cloudflare aktivieren, DS bei STRATO eintragen.

Rückfragen an dich: siehe Abschlussbericht / PR.
