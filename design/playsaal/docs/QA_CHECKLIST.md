# QA-Checkliste für Claude — PlaySaal-Rebranding

- [ ] Repository-Version sichern, `git status` und aktuellen Deploy identifizieren.
- [ ] In UI **PlaySaal** statt **PlayAZ**; Logo unverfälscht übernommen; Wordmark-SVG heißt optisch `playsaal`.
- [ ] Mobile + Desktop, Hell + Dunkel, Startseite + Unterseiten.
- [ ] Browser-Tab-Title, Meta-Description, OpenGraph, Twitter Card, Social Image, Favicon / Apple Touch, PWA.
- [ ] Mit Suchlauf alte Markenstrings finden; Ausnahmen technischer IDs explizit dokumentieren.
- [ ] Datenmigration über Originwechsel für localStorage/IndexedDB definiert und auf Mobile mit vorhandenen Saves getestet; alter Worker als Migrationsstart erreichbar.
- [ ] Spiele-URLs beibehalten, insbesondere `/spiele/linke-spur`; Browser-Neuladen / Deep-Link funktioniert.
- [ ] Spielverhalten, Münzen, lokale Saves, Highscores, Fortschritt, Sprache DE/EN unverändert.
- [ ] Navigation, Footer, 404, 500, Sharing und Impressum/Kontakt/Datenschutz prüfen, keine Rechtsangaben erfinden.
- [ ] Keine Secrets, Tokens oder Passwörter im Repository oder Artefakt.
- [ ] CSS Farben, Kontrast (WCAG), Logo bei 16x16 / 32x32, transparente PNGs testen.
- [ ] Typecheck / Tests / Lint / Build grün, bestehende E2E/Browserprüfungen ausführen.
- [ ] Domain-/DNS-Phase getrennt, ausdrücklich nicht automatisch live.
- [ ] DNS-Zone enthält vor Nameserverwechsel alle STRATO-Mail-Records, oder dokumentiert, dass keine E-Mail genutzt wird.
- [ ] Supabase/Auth erst ändern, wenn es wirklich existiert; OAuth Redirects, CORS, CSP und Cookie-Domains testen.
- [ ] Nach GO-LIVE SSL, Apex, www-Redirect, Canonical, Sitemap, OG, Login, E-Mail, alte Links getestet.
- [ ] Historische Google-/Apple-Logins und vorhandene User-IDs bleiben erhalten.
- [ ] Abschlussbericht mit konkreten URLs, Testergebnissen, offenen Risiken und GO-LIVE-Frage.
