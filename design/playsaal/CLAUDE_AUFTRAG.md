# AUFTRAG AN CLAUDE — PLAYAZ → PLAYSAAL.COM

## Ausgangslage und Entscheidung

Wir benennen unser bestehendes Browsergame-Portal **vollständig von PlayAZ in PlaySaal** um. Die neue Domain **playsaal.com wurde bei STRATO gekauft**. Alle Spiele, Nutzer, Spielstände und die bestehende Cloudflare-/GitHub-Infrastruktur sollen erhalten bleiben.

**Branding-Entscheidung ist final:** Orange/gelbes 3D-Play-Dreieck im Impossible-/Endlosband-Stil, aus der zuletzt freigegebenen **Logo-Variante Nr. 1**. Die im ZIP vorhandenen Dateien sind die einzubauenden Produktionsassets. Bitte keine neuen Logos erfinden und die Markenfarben nicht eigenmächtig ändern.

Offizieller Name: **PlaySaal**. Sichtbare Bild-/Wortmarke: `playsaal` (SVG), Kommunikationsname: `PlaySaal`. Neue Haupt-URL: `https://playsaal.com`. Alte Marke: `PlayAZ`, `playaz`, `PLAYAZ`. Vorherige öffentliche Worker-URL: `https://playaz.cf-922.workers.dev`.

## Deine Aufgabe: bitte selbständig im bestehenden GitHub-Repository analysieren und umsetzen

### PHASE A — Sofort umsetzen: Rebranding im Code; neue Domain noch NICHT scharf schalten

1. Vor Änderungen den tatsächlichen Repo-Stand untersuchen: Framework, Worker-/Pages-Setup, Build, Routing, Navigation, PWA, bestehende Domains, bestehende E-Mail-Konfiguration, Supabase/D1, Auth-Anbieter, externe API-Callbacks, Redirects und SEO. Kein ungeprüftes Ersetzen.
2. Alle **sichtbaren** PlayAZ-Markennennungen konsistent zu **PlaySaal** ändern: Header, Footer, Menü, Startseite, Mobile Navigation, Game-Detailseiten, Spieltitel-Präfixe, Settings, Modaltexte, Ladebildschirme, Teilen-Dialoge, Social Sharing, 404/Fehlerseiten, ToS/Datenschutz/Impressum/Kontaktinformationen (rechtliche Daten nicht erfinden), README/Docs, Metadaten, OG/Twitter, Manifest, PWA-Name, Browser-Titel, Structured Data und statische Seiten. URL-Ziel überall nach Umstellung `https://playsaal.com`.
3. Assets aus `public/` integrieren und bestehende Logo-/Favicon-/Social-Images auf PlaySaal umstellen. Dateinamen und Pfade bei Bedarf an das vorhandene Framework anpassen. Nicht blind eine vorhandene `site.webmanifest` oder bestehende PWA-Konfiguration überschreiben: Start-/Scope-/SW-/Installationslogik erhalten.
4. Falls die Marke in benutzerseitigen Spieloberflächen angezeigt wird, diese Texte ersetzen; **Spielnamen** (z. B. „Linke Spur“) bleiben unverändert.
5. Alle Share-Links, Copy-Links, OpenGraph `og:url`, Canonical, Sitemap, robots, interne absoluten Links, OAuth Redirect-URLs, CORS-Origins, CSP-Hosts, E-Mail-Absender/Vorlagen und Supabase `Site URL` als Domainmigrations-Themen auflisten. Ziel-URLs im Code und in Env-Konfiguration vorbereiten, aber bis Phase B auf der tatsächlich erreichbaren Produktivdomain **keine unerreichbaren Canonicals/Share-Links ausliefern**. Erst beim Cutover die kanonische Adresse atomar umstellen.
6. Suchlauf für `PlayAZ`, `playaz`, `PLAYAZ`, `playaz.fun`, `cf-922.workers.dev`, harte alte Domains und alle alten Logos durchführen. Technische interne IDs/Worker-Namen/Tabellen/Keys **nicht automatisch umbenennen**: Breaking Changes vermeiden. Historische Datensätze dürfen alte Markenbezüge behalten, wenn Migration Daten gefährden würde.
7. Die funktionierenden Spielrouten (insbesondere `/spiele/linke-spur`) behalten. Keine Spiele, Münzen, Saves, Stats, Highscores, Coins, RLS, Sessions, Auth-Identitäten oder Nutzergruppen verlieren. Bestehende Datenbanken nicht neu anlegen oder zurücksetzen.
7a. **WICHTIG beim Domainwechsel: localStorage/IndexedDB sind an die alte Origin gebunden!** Daten unter `playaz.cf-922.workers.dev` sind auf `playsaal.com` nicht automatisch lesbar. Untersuche sämtliche browserlokalen Spielstände, Münzen, Einstellungen und Rekorde. Plane und teste eine sichere, nutzerinitiierte **Migration der Daten von der alten zur neuen Origin**, solange der alte Worker erreichbar bleibt, z. B. eine Legacy-Export-/Import-Seite oder nach Nutzerzustimmung einen geprüften `postMessage`-Transfer über ein Alt-Origin-Fenster mit strikter `event.origin`-Prüfung, erlaubten Datenfeldern, Versionierung, Merge-Strategie und Rückfalloption. Keine Secrets/Auth-Tokens übertragen. **Nicht einfach 301-Redirects aktivieren und damit den Zugriff auf alte lokale Saves unmöglich machen.** Keine Erfolgsgarantie geben, bevor der Ablauf auf Mobilgeräten/Privatmodus getestet ist.
8. Tooling durchlaufen lassen: Typprüfung, Lint, Tests, Build, gegebenenfalls Browser-/E2E-Tests. Screenshots der Startseite, mobilen Navigation, Spielseiten, Favicon und OG-Vorschau prüfen. SEO-Crawl und Linkcheck vorsehen.
9. Änderungen als nachvollziehbare Commits/PR in GitHub; vor produktivem Deploy Ergebnisse zusammenfassen. Keine Geheimnisse in Repo/Chat/Logs ausgeben.

### PHASE B — Domainumstellung vorbereiten, aber NUR nach meinem ausdrücklichen GO live schalten

1. Domain **playsaal.com bei STRATO** liegt bereits vor. STRATO bleibt Registrar. Cloudflare soll zukünftig **DNS, SSL und Web-Traffic** übernehmen, Cloudflare Workers weiterhin die Website betreiben.
2. In Cloudflare `playsaal.com` als Zone hinzufügen und die dort **tatsächlich zugewiesenen Nameserver** erfassen. Vor einer Änderung sämtliche aktuellen STRATO-DNS-Records als Tabelle sichern (MX, TXT/SPF, DKIM, DMARC, ggf. Autodiscover, Verifikationsrecords, Subdomains). Vorhandene E-Mail-Postfächer bei STRATO müssen weiterhin funktionieren. **Niemals MX-/TXT-Werte raten oder überschreiben.**
3. Mit mir abstimmen, ob `www.playsaal.com` auf Apex `playsaal.com` weiterleiten soll (Standardempfehlung: ja). Cloudflare Custom Domain korrekt am *bestehenden* Worker/Pages-Projekt konfigurieren. Keine unnötigen neuen Projekte.
4. Alte `workers.dev`-URL während der Umstellung **für die Übertragung lokaler Spielstände** erreichbar lassen. Erst nach belegbar abgeschlossenem oder bewusst abgelehntem Save-Transfer wo technisch möglich mit 301 auf den entsprechenden neuen Pfad umleiten; keine Weiterleitungs-Schleifen und keine Unterbrechung der Spiele. Alte PlayAZ-Domain nur dann weiterleiten, wenn sie uns wirklich gehört/konfiguriert ist.
5. OAuth Google/Apple und Supabase Auth (nur sofern im Projekt im Einsatz) korrekt auf die neue Domain konfigurieren: `Site URL`, erlaubte Redirect URLs, Authorized JavaScript origins und Callback URLs. Bestehende Supabase-Projekt-URLs sind eigene Hosts, diese NICHT durch `playsaal.com` ersetzen. Teste Login, Logout, Passwortlos/Callback und Session-Verhalten. Während des Übergangs alte + neue Web-Origin in Allow-Lists erlauben, wo erforderlich.
6. Cloudflare DNS-Records zuerst vollständig herstellen, ggf. DNSSEC/DS-Einträge am Registrar prüfen (Delegation muss funktionieren), dann erst mit meinem GO die von Cloudflare zugewiesenen Nameserver bei STRATO eintragen. HTTPS, Redirects, Homepage, Spiele, Login, Mail-Empfang/-Versand, Sozialvorschauen testen.
7. Nach Cutover SEO canonical/robots/Sitemap/OG/Schema auf `https://playsaal.com` schalten, Search Console Property für neue Domain einrichten und Weiterleitungen verifizieren. Alte URLs nicht einfach abschalten.

### Bitte NICHT

- Nicht eigenmächtig DNS-Nameserver oder Domain-Registrar ändern.
- Nicht Supabase-, D1-, GitHub- oder Cloudflare-Projekte löschen, neu anlegen oder migrationslos umbenennen.
- Keine Loginpflicht einbauen oder neue Ranglisten-/Coin-Features entwickeln: es geht hier um Branding und Domainvorbereitung.
- Keine anonymen Nutzer-Spielstände löschen oder durch Originwechsel unsichtbar machen; vorhandene Spielmechaniken nicht anrühren.
- Keine alten Domainnamen pauschal in geheimen Keys, Objekt-IDs, DB-Spaltennamen, Bucket-IDs oder deploy config ersetzen.
- Kein öffentliches Deployment mit kaputten Login-Redirects oder unerreichbarer Domain.

### Ergebnis, das ich von dir erwarte

1. Technische Bestandsaufnahme (kurz), betroffene Dateien und Risiken.
2. Vollständige Rebranding-Implementierung + Tests/Build-Ergebnis, welche Fehler vorhanden sind.
3. Liste jeder offenen externen Umstellung in STRATO, Cloudflare, Google/Apple und Supabase.
4. Separater **GO-LIVE-CHECKPOINT**: erst dann Nameserver/Domain wirklich aktivieren.
5. Bericht über den tatsächlich getesteten Save-Transfer zwischen alter und neuer Domain (oder explizite Warnung, falls technisch nicht implementiert).
6. Vorher-/Nachher-Screenshots und finaler Linktest für `/`, `/spiele/linke-spur` und die anderen gefundenen Spielrouten.

Das ZIP `PlaySaal_Branding_FINAL.zip` liegt als verbindliche Asset- und Markenquelle vor. Starte mit Phase A, zeige danach einen konkreten Plan für Phase B.
