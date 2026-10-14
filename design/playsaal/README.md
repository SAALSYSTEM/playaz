# PlaySaal — finales Branding-Paket

**Status:** Zur Integration in das bestehende PlayAZ-Projekt durch Claude. Dieses ZIP enthält Dateien und Arbeitsanweisungen, nimmt aber selbst keine Änderungen an GitHub, Cloudflare, STRATO oder Supabase vor.

## Markenfestlegung

- Offizieller Markenname: **PlaySaal** (großes P, großes S).
- Finale Hauptdomain laut Auftrag: **playsaal.com** (bei STRATO erworben).
- Grafische Wortmarke: **playsaal** kleingeschrieben, bewusst wie die freigegebene Variante 1 der letzten 8er-Auswahl.
- Bildzeichen: warmes gelb–orange–rotes 3D-/Impossible-Play-Dreieck. Die SVG-Assets sind eine technisch saubere Vektor-Neuzeichnung des freigegebenen Motivs, keine pixelgenaue Vektorisierung des KI-Bildes.
- Bisherige Marke: PlayAZ. Bisher bekannte URL: `https://playaz.cf-922.workers.dev`.

## Wichtigste Dateien

- `CLAUDE_AUFTRAG.md` — **diesen Inhalt Claude geben**, ZIP zusätzlich bereitstellen.
- `docs/DOMAIN_UMSTELLUNG.md` — zweite Phase, erst nach Freigabe des Domain-Cutovers.
- `docs/QA_CHECKLIST.md` — Tests für alle Spiele, SEO, Auth, Mail, Datenschutz.
- `docs/INTEGRATION.md` — Asset-Referenzen und HTML-Beispiele.
- `public/` — direkt in den bestehenden Public-/Static-Assets-Ordner des Repos übertragbar; bestehende PWA-Dateien bewusst prüfen und zusammenführen, nicht blind überschreiben.
- `brand-tokens.json` — Farbwerte und verbindliche Namen.
- `VORSCHAU_PLAYSAAL.png` — Übersicht der einsatzfähigen Assets.

## GitHub / Supabase / Domain

GitHub bleibt die Quelle des Codes, Cloudflare betreibt das bestehende Portal. Ein optionales Supabase-Projekt wird nur genutzt, falls im aktuellen Repo tatsächlich angebunden bzw. angelegt. **Kein neues Supabase-Projekt erstellen und keine Datenbank migrieren, nur weil sich die Marke ändert.**

**Domain bereits gekauft bedeutet nicht bereits live geschaltet.** STRATO vorerst als Registrar behalten. Die Cloudflare-Nameserver erst nach kompletter DNS/Mail-Inventur und erfolgreichen Tests eintragen.

## Brandingregel

Keine fremden Marken-/Logos übernehmen. Die bestehende Spielelogik, URLs unter `/spiele/...`, Münzen, lokalen Saves, Ranglisten und Anmeldeprozesse unverändert lassen, sofern nicht zwingend durch die Umbenennung betroffen.

## Besonders kritisch: Lokale Spielstände

Ein Wechsel von der alten `workers.dev`-URL zu `playsaal.com` wechselt die Web-Origin. Daher erscheinen bisher nur im Browser gespeicherte Daten ohne einen Transfer auf der neuen Domain als leer. **Vor dem Setzen pauschaler Redirects** muss Claude die Save-Technik prüfen und eine sichere Migration anbieten. Dieser Punkt ist im Claude-Auftrag verbindlich.
