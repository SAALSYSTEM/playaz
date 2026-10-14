# Domainwechsel STRATO → Cloudflare (NICHT sofort durchführen)

**Eigentum/Registrar:** `playsaal.com` bei STRATO, laut Projektentscheidung bereits gekauft.
**Ziel:** `https://playsaal.com` (Apex), `https://www.playsaal.com` 301 → Apex.
**Website:** bestehender Cloudflare Worker/Pages-Deployment; keine Servermigration nötig.

## Reihenfolge

1. Website auf alter `workers.dev`-Adresse unter neuer Marke vollständig testen. Alle Spielrouten, lokale Saves, eventuelle Accounts und SSO bleiben funktionsfähig. **Vorbereitung eines Save-Transfers zwischen Origins ist Pflicht, bevor Redirects gesetzt werden.**
2. STRATO-DNS IST-Zustand dokumentieren: NS, A, AAAA, CNAME, MX, TXT, CAA, SPF, DKIM, DMARC, SRV/Autodiscover, Subdomains, Domainverifikationen. Falls noch kein E-Mail-Postfach eingerichtet ist, dies separat festhalten. STRATO-Webhosting ist nicht zwingend erforderlich, aber ein STRATO-Postfach kann mit Cloudflare-DNS weiterlaufen.
3. Cloudflare-Dashboard im **richtigen Account** öffnen, Zone `playsaal.com` hinzufügen. Cloudflare weist zwei individuelle Nameserver zu. Nur diese verwenden. Alle benötigten DNS-Records vor Delegation vervollständigen. **Vorhandene STRATO-Mail-Records exakt übertragen, nicht raten.**
4. Falls Registrar DNSSEC-DS-Einträge vorhanden sind, Delegationsplan/Cloudflare-Dokumentation befolgen. Veraltete DS-Einträge bei der Nameserver-Umstellung können Domainauflösung verhindern. Vor dem Umstellen Alt-DNSSEC sachgerecht deaktivieren/entfernen, dann nach Aktivierung bei Cloudflare neu einrichten.
5. Custom Domain des **bestehenden Workers** für `playsaal.com` anlegen (`Settings → Domains & Routes → Custom Domain`), sofern tatsächlich Workers als Origin betrieben wird. Bei Cloudflare Pages stattdessen Pages Custom Domains verwenden. `www` separat auf Apex weiterleiten; auf DNS-/Redirect-Konflikte prüfen. TLS/HTTPS abwarten.
6. Google-/Apple-Login und Supabase (falls vorhanden) für neue Seiten-Origin vorbereiten: Site URL / Allow-Lists / zulässige Redirects und OAuth Provider Domainsettings. **Supabase-Projekt-URL und Provider-Callback-URLs nur gemäß echter Konfiguration übernehmen, nicht blind durch Marken-URL ersetzen.**
7. **Erst nach expliziter Freigabe** Nameserver bei STRATO auf die Cloudflare-Werte umstellen. Die Domain bleibt bei STRATO registriert. DNS-Propagation und SSL beobachten.
8. Testen: `https://playsaal.com`, `https://www.playsaal.com`, jedes Spiel, mobile PWA, Assets, Favicon, Shares, OG/Twitter, sitemap.xml, robots.txt, Canonical, Google/Apple Login, Mail-Empfang, Mail-Versand, SPF/DKIM/DMARC, Website-Formulare.
9. Alte erreichbare PlayAZ-URLs **nicht sofort pauschal weiterleiten**: Vorher getestete, nutzerinitiierte Übertragung von localStorage-/IndexedDB-Daten (z. B. Export/Import oder autorisierter Alt-Origin-Fenster-Transfer via postMessage) ermöglichen. Erst danach bzw. für nicht betroffene Pfade Pfad-identische Redirects einrichten, soweit Zugriff auf die Hosts besteht. Keine Annahme, dass `playaz.fun` überhaupt erworben wurde.
10. Erst nach erfolgreicher Prüfung neue Domain als einzige kanonische URL nutzen; interne Links/OG/Sitemaps endgültig prüfen.

## Wichtige Cloudflare-Quellen

- https://developers.cloudflare.com/learning-paths/get-started/add-domain-to-cf/
- https://developers.cloudflare.com/workers/configuration/routing/custom-domains/
- https://developers.cloudflare.com/pages/configuration/custom-domains/
- https://developers.cloudflare.com/dns/nameservers/update-nameservers/

## Rückfragen, bevor Claude DNS live umstellt

- STRATO-Postfach für `@playsaal.com` bereits eingerichtet? Wenn ja: MX, SPF, DKIM und DMARC vom vorhandenen Anbieter übernehmen.
- Cloudflare-Projekt ist Workers oder Pages? Bestehende Konfiguration prüfen.
- Supabase Auth tatsächlich produktiv? Welche Google-/Apple-Provider sind schon live?
- Domain bei STRATO bereits auf anderen Webspace geroutet? Bereits genutzte Einträge nicht übersehen.

**Keinerlei Zugangsdaten oder API-Keys in öffentlichen Commits ablegen.**

## KRITISCH: Lokale Spielstände überleben Domainwechsel nicht automatisch

`localStorage`, `IndexedDB`, Service-Worker-Caches und Cookies sind origin-gebunden. Eine neue Domain kann die Saves einer alten Domain nicht direkt lesen. Das ist bei anonymen Spielern ohne Account besonders relevant. Claude muss vor dem Cutover die tatsächlichen Speicherstellen im Code finden und testen. Ziel: Legacy-Origin bleibt erreichbar, Nutzer können bewusst exportieren/importieren oder einen überprüften, origin-validierten Transfer starten. Keine Login-Tokens oder sensiblen Browserdaten übertragen. Alte Worker-Domain erst abschalten, wenn das Problem gelöst oder der Datenverlust bewusst akzeptiert wurde.
