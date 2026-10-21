# Konten, Cloud-Speicherstände, Admin (Supabase)

Stand: 2026-10-20. Alles ist freiwillig: Spielen geht immer ohne Konto, die Spiele-Liste bleibt auch bei Supabase-Ausfall erreichbar.

## Aufbau in einem Satz
Statische Seite auf Cloudflare (unverändert) + ein Supabase-Projekt (`cphwxikfrxgejiqghlwn`, Region eu-west-1). Im Browser steht nur der öffentliche *publishable key*. Geschützt wird alles durch Row Level Security und geprüfte Datenbankfunktionen. **Es gibt keinen geheimen Schlüssel** im Repo, im Browser oder in Cloudflare.

| Teil | Datei |
|---|---|
| Datenbank (Tabellen, RLS, Funktionen) | `supabase/migrations/*.sql` (zwei Dateien, in Reihenfolge) |
| Einstellungen und Schalter | `public/assets/playsaal-config.js` |
| Anmeldung, Sync, Dialoge, Fehler melden, Statistik | `public/assets/playsaal.js` (+ `supabase.min.js`, selbst gehostet) |
| Konto-Seite / Admin-Seite | `public/konto.html`, `public/admin.html` |
| Kategorien, Favoriten auf der Startseite | `public/assets/katalog.js` |
| Tests | `tests/db.test.mjs` (Datenbank lokal), `tests/konten.test.mjs` (Browser) |

## Schalter (`playsaal-config.js`)
Alle Wege sind **aus**, bis du sie freigibst. Ein Anmeldeweg erscheint nur, wenn der Schalter `true` ist **und** Supabase ihn als aktiv meldet.

- `anmelden.email`: an (Versand über Brevo-SMTP, Absender noreply@playsaal.com).
- `anmelden.google` / `anmelden.apple`: erst `true`, wenn der Anbieter eingerichtet und getestet ist.
- `fehlermelden`: an. Knopf „Fehler melden“ auf jeder Spielseite.
- `statistik`: **an** (anonyme Tageswerte, Do-Not-Track wird respektiert; Datenschutztext beschreibt sie).

## Deine Schritte (in dieser Reihenfolge)
1. **Zweite Migration einspielen** (die erste ist schon drin): Supabase Dashboard → SQL Editor → Inhalt von `supabase/migrations/20261019200000_spielstand_pruefung.sql` einfügen → „Run“ (mit „Run and enable RLS“, falls gefragt). Sie ersetzt nur eine Funktion und ändert keine Daten.
2. **URLs eintragen**: Authentication → URL Configuration → Site URL `https://playsaal.com`; Redirect URLs: `https://playsaal.com/konto` und `https://playsaal.com/*`.
3. **E-Mail-Code**: Der eingebaute Mailversand von Supabase liefert nur an Teammitglieder. Für echte Nutzer brauchst du einen eigenen SMTP-Zugang (Projekt Settings → Authentication → SMTP; Anbieter deiner Wahl, Absenderdomain per DNS bestätigen: SPF/DKIM). Dann Authentication → Email Templates → „Magic Link“ **und** „Confirm signup“ so ändern, dass der Code `{{ .Token }}` im Text steht (kein Link nötig). Danach in der Config `anmelden.email: true`.
4. **Konten verknüpfen**: Authentication → Sign In / Providers → „Allow manual linking“ einschalten (nötig, um Google/Apple/E-Mail an ein Konto zu hängen). Konten werden nie allein über die E-Mail-Adresse zusammengelegt.
5. **Google (optional)**: Google Cloud Console → OAuth-Client „Web“ anlegen, Redirect-URI aus dem Supabase-Dashboard (Providers → Google) eintragen, Client-ID und Secret **im Supabase-Dashboard** einfügen (nie hier im Chat oder im Repo). Danach `anmelden.google: true`.
6. **Apple (optional)**: braucht das kostenpflichtige Apple Developer Programm (ca. 99 USD/Jahr, **nur mit deiner Freigabe**), eine Services ID und einen .p8-Schlüssel. Der daraus erzeugte Client-Secret **läuft nach 6 Monaten ab** und muss dann neu erzeugt werden, sonst bricht der Apple-Login. Kalendereintrag setzen. Danach `anmelden.apple: true`.
7. **Admin-Zugang**: einmal auf `playsaal.com/konto` anmelden, dann `supabase/admin-freischalten.sql` im SQL Editor ausführen (deine Adresse eintragen). Das ist der einzige Weg; es gibt keine Selbst-Beförderung und kein „erster Nutzer wird Admin“.
8. **Rechtliches** (siehe unten) klären, bevor Statistik an geht oder Kinder gezielt angesprochen werden.
9. **Backup**: Free-Projekte haben keine automatischen Backups, die sich wiederherstellen lassen. Vor jeder größeren Datenänderung Dashboard → Database → Backups prüfen oder die Tabellen per `pg_dump`/CSV-Export sichern.

## Admin erreichen
`https://playsaal.com/admin`, angemeldet mit dem freigeschalteten Konto. Ohne Recht sieht man „Kein Zugriff“. Die Prüfung läuft in der Datenbank (`ist_admin()` in jeder Admin-Funktion), nicht nur in der Oberfläche. Tabs: Übersicht (Heute / 7 / 30 Tage, Europe/Berlin), Spiele, Kategorien und Startseite (Hot-Auswahl, Sichtbarkeit), Fehlermeldungen (offen / in Arbeit / erledigt).

## Was gemessen wird
Spielstarts (erste Spielaktion je Seitenaufruf), abgeschlossene Schritte (Spielstand-Wert steigt, grobe Heuristik), aktive Spielzeit (Sekunden mit Eingabe, sichtbarer Tab, 15 s Leerlaufgrenze), Fehler je Spiel. Keine Frame-Ereignisse, keine Fingerprints, keine Geräte-ID; die Sitzungs-ID lebt nur im Speicher der Seite. Testverkehr (`navigator.webdriver`, `?playsaal-test`) wird als Test markiert und nicht gezählt. **Eindeutige oder wiederkehrende Besucher werden bewusst nicht gemessen**, weil das ohne Kennung oder Cookie nicht zuverlässig geht. Aufbewahrung: Tageswerte 400 Tage, Sperr- und Dedup-Daten 2 Tage, erledigte Fehlermeldungen 180 Tage (Funktion `private.aufraeumen`, siehe unten).

## Spielstand-Sync, Regeln
- Gast: alles bleibt im Browser. Nach der Anmeldung wird vorhandener lokaler Fortschritt **angeboten**, nie still hochgeladen oder überschrieben.
- Abweichende Stände auf zwei Geräten: Dialog mit Fortschritt und Zeit, der Verlierer wird als Sicherung (`playsaal.sicherung.*`) lokal behalten. Gleichzeitige Änderungen erkennt der Server über die Revision.
- Offline spielen geht; der Status zeigt „Offline · wird später gespeichert“ / „Synchronisierung ausstehend“ / „Gespeichert“ / „Nur auf diesem Gerät“.
- Kontowechsel am selben Gerät: Stände des alten Kontos wandern in eine unsichtbare Sicherung und erscheinen nie im neuen Konto. Beim Abmelden werden gesyncte lokale Stände entfernt (mit Rückfrage, falls etwas nicht gesichert ist).
- Gesicherte Stände sind **keine verifizierten Bestenlistenrekorde**.

## Kosten und Grenzen (Stand der Einrichtung; vor dem Verlass auf Zahlen im Dashboard gegenprüfen)
- Supabase **Free**: 0 EUR. Grenzen u. a. 500 MB Datenbank, 50.000 monatlich aktive Nutzer, Projekt wird nach längerer Inaktivität **pausiert** (bei einer Spiele-Seite mit Besuchern unwahrscheinlich, aber möglich; Spiele laufen dann weiter, nur Konten pausieren). Kein Backup-Restore. Upgrade auf Pro (ca. 25 USD/Monat) **nur mit deiner Freigabe**.
- Eigener E-Mail-Versand: viele Anbieter haben einen Gratis-Bereich (einige tausend Mails/Monat), danach Bezahltarif. Auch hier nichts ohne deine Freigabe.
- Apple Developer: ca. 99 USD/Jahr, nur falls Apple-Login gewünscht.
- Cloudflare: unverändert.

## Wartung
- Alle 6 Monate Apple-Client-Secret erneuern (falls Apple aktiv).
- Gelegentlich Supabase-Dashboard → Advisors (Security) ansehen.
- Aufräumen: `private.aufraeumen()` läuft von selbst gelegentlich mit (bei Fehlermeldungen und Statistik-Meldungen, zufällig 1 bis 5 %). Bei sehr wenig Verkehr bleibt Altes länger liegen; optional zusätzlich täglich per Dashboard → Integrations → Cron: `select private.aufraeumen();`.
- Neue Spiele: Zeile in `public.games` (Seiten-Name, `save_id`, Präfix) **und** Einträge in `playsaal-config.js` (`spiele`, `namen`, `praefixe`) sowie in `assets/umzug.js` ergänzen.

## Rechtliches (Stand 2026-10-21)
- Impressum und Datenschutz sind mit den Angaben des Betreibers ausgefüllt (Cloudflare, Supabase, Brevo, Aufsicht NRW).
- Konten nur ab 16 Jahren: Pflicht-Häkchen im Anmeldedialog, Hinweis im Datenschutztext. Spielen geht ohne Konto in jedem Alter.
- Google und Apple werden nicht angeboten (Schalter aus). Nutzungsstatistik ist an und im Datenschutztext beschrieben (Art. 6 Abs. 1 lit. f). Kontaktadresse: hi@playsaal.com (Postfach muss Mails empfangen können).
- Supabase-AVV ist Teil der Nutzungsbedingungen; Brevo-AVV ist Teil der Brevo-Bedingungen.

## Tests
- `PGLITE_PATH=… node --test tests/db.test.mjs` bzw. `npm i --no-save @electric-sql/pglite` – prüft SQL lokal (RLS, Admin-Schutz, Revisionen, Namensregeln, Rate-Limits, Statistik, Kontolöschung). Ohne PGlite werden die Tests übersprungen.
- `node --test tests/konten.test.mjs` – Browser gegen einen Ersatz-Server im Speicher.
- **Nicht getestet** gegen das echte Supabase: tatsächlicher E-Mail-Versand, Google/Apple, die echten Auth-Antworten, das produktive Netz. Diese Punkte müssen nach der Einrichtung einmal von Hand geprüft werden (Testkonto, danach `supabase/test-aufraeumen.sql`).
