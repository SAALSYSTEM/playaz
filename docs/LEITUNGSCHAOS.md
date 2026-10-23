# LEITUNGSCHAOS

Rohr-Rätsel im Hochformat: Rohrstücke antippen (Vierteldrehung im Uhrzeigersinn), bis das Wasser vom Hydranten durch alle Rohre zu allen Häusern fließt. Tagesrätsel mit geprüfter Tagesrangliste und 30 feste Level mit Sternen. Stand: veröffentlicht auf `main` am 23.10.2026 (Startseite, Sitemap, `listed = true`). Edge Function `leitungschaos-lauf` deployt.

Dateien: `public/spiele/leitungschaos.html`, `public/spiele/leitungschaos/{sim,game}.js`, Migration `supabase/migrations/20261023200000_leitungschaos.sql`, Edge Function `supabase/functions/leitungschaos-lauf/`.

## 1. Regeln (Konfigurationsversion 1)

- Raster aus Rohrstücken: Endstück (Haus), Gerade, Kurve, T-Stück, Kreuz. Ein Feld ist eine 4-Bit-Maske (oben, rechts, unten, links).
- Gelöst = jede Öffnung trifft auf eine passende Öffnung des Nachbarn (kein offenes Ende, nichts zeigt über den Rand) **und** alle Felder hängen am Hydranten. Damit sind alle Häuser versorgt.
- Nasse Rohre (am Hydranten angeschlossen) werden blau; offene Enden im nassen Bereich spritzen. Das ist die Rückmeldung, wie weit man ist.
- Hydrant und Häuser sind fest. Ab Level 11 drehen sich die Hausanschlüsse mit (Level 11–17, 25–30). Verschweißte Rohre (vier Schrauben) stehen schon richtig und sind nicht drehbar (Level 18–30).
- „Ideal“ = Mindestzahl Drehungen bis zur gebauten Lösung. Sterne im Levelmodus: ★★★ ≤ Ideal, ★★ ≤ 1,5 × Ideal, ★ gelöst.

## 2. Rätselbau

`baueRaetsel(seed, K)` in `sim.js`, ganzzahlig (mulberry32) und deterministisch, damit Browser und Edge Function dasselbe Rätsel bauen:

1. Hydrant auf ein Innenfeld.
2. Wachsender Baum über **alle** Felder: meist an der neuesten Stelle weiter (lange Leitungen), mit Wahrscheinlichkeit `zweig` an einer zufälligen (Abzweige). Die Enden des Baums sind die Häuser.
3. Verworfen und neu gebaut, wenn die Häuserzahl außerhalb `haeuser` liegt oder ein Haus direkt am Hydranten hängt.
4. Verschweißte Rohre auswählen (`fix`), dann alle drehbaren Stücke zufällig verdrehen, bis mindestens 80 % falsch stehen und das Rätsel nicht schon gelöst ist.

Lösbarkeit ist durch den Bau garantiert (die gebaute Lösung ist gültig). Es kann weitere gültige Lösungen geben; geprüft wird nach den Regeln, nicht gegen die gebaute Lösung.

| Level | Größe | Neu |
|---|---|---|
| 1–5 | 3×3 bis 4×5 | Grundlagen |
| 6–10 | 4×5 bis 5×6 | mehr Abzweige, mehr Häuser |
| 11–17 | 4×5 bis 6×7 | Hausanschlüsse drehen sich mit |
| 18–24 | 6×8 bis 7×9 | verschweißte Rohre |
| 25–30 | 6×8 bis 7×9 | Meister: drehbare Häuser, kaum Halt |

Tagesrätsel: 6×8, 6–11 Häuser, keine verschweißten Rohre, Häuser fest. Im Mittel 52 Drehungen ideal (gemessen über 300 Seeds).

## 3. Tagesrätsel und Rangliste

1. `leitungschaos_tag()` (auch Gäste) liefert Datum, Seed, Version. Der Seed wird beim ersten Abruf des Berliner Tages zufällig festgelegt (wie bei Dartfieber), ist also nicht vorab berechenbar.
2. Angemeldet: „Los“ ruft `leitungschaos_start()`. Je Konto und Tag gibt es **genau eine** Runde (`unique (user_id, tag)`). Die Uhr läuft ab der ersten Ausgabe (`issued_at`); ein späterer Start setzt dieselbe Runde fort und meldet die schon gelaufenen Sekunden. Ist der Tag gelöst, kommt nur das Ergebnis zurück.
3. Der Browser speichert die Drehungen mit (`offen` im Speicherstand), damit Neuladen dort weitermacht.
4. Gelöst: `{run_id, inputs, drehungen}` an `leitungschaos-lauf`. Seed und Version holt die Funktion aus der Datenbank, spielt den Lösungsweg nach (jeder Tipp ein drehbares Feld, gelöst erst nach dem letzten Tipp, Drehzahl stimmt).
5. `leitungschaos_abschliessen` misst die Zeit mit der Datenbankuhr (`now() - issued_at`, in Hundertsteln). Abgelehnt: älter als 12 Stunden, schneller als 2 s oder als 0,08 s je Drehung. Die Run-ID schließt genau einmal, höchstens 5 Prüfversuche.
6. Wertung: Zeit aufsteigend, dann Drehungen. Gleiche Zeit und Drehungen = gleicher Platz. Archiv über `leitungschaos_tage_liste` / `leitungschaos_rangliste(tag)`.

**Ehrliche Grenzen:** Gefälschte Zeiten, erfundene Lösungen und zweite Versuche kommen nicht in die Rangliste. Nicht erkennbar ist, wer das Rätsel vorher als Gast oder mit einem zweiten Konto gelöst hat, und ein Bot, der das Rätsel nach dem Start sofort löst und dabei die Mindestzeit einhält.

## 4. Abweichungen von Dartfieber (bewusst)

- **Ein Versuch je Tag statt bester von vielen:** Bei einem Rätsel kennt man nach dem ersten Lösen die Lösung; ein zweiter Versuch wäre nur noch Tippgeschwindigkeit.
- **Zeit von der Datenbank statt Takte vom Browser:** Gewertet wird die Lösungszeit; die kann der Browser nicht glaubwürdig melden. Darum gibt es keine Takte und keine „zu schnell“-Prüfung über Takte, sondern die Mindestzeit je Drehung.
- **Fortsetzen:** gleiche Run-ID nach Neuladen statt neuer Runde.
- Sonst gleich: Server-Seed je Tag, Run-ID, `service_role`-Eintrag, Archiv, Anzeige über `window.PlaySaal`, Rate-Limits.

## 5. Bilder (ChatGPT)

Die Rohre zeichnet das Spiel selbst. Von ChatGPT kommen nur: `lc-hintergrund` (1024×1536), `lc-hydrant`, `lc-haus-{a,b,c}` und `lc-haus-{a,b,c}-licht` (je 1024×1024, transparent), `lc-kachel` (1:1, ohne Text), `lc-social` (1536×1024, ohne Text; Schriftzug kommt im Code dazu). Originale nach `design/leitungschaos/`, ins Spiel als WebP nach `public/spiele/leitungschaos/img/` (Liste `IMAGES` in `game.js`). Fehlt ein Bild, zeichnet das Spiel einen Platzhalter und zeigt den Hinweis „Platzhalter-Grafik“. Stand 23.10.: alle Bilder da (Hintergrund, Hydrant, Häuser a–c je trocken/versorgt, Kachel, Social-Bild). Häuser b und c sind technisch optional. Umwandeln: `python3 tools/leitungschaos-assets.py`, Teilen-Vorschau: `node tools/leitungschaos-cover.mjs`.

## 6. Tests

```sh
node --test tests/leitungschaos-sim.test.mjs tests/leitungschaos-pruefung.test.mjs
PGLITE_PATH=… node --test --test-name-pattern=LEITUNGSCHAOS tests/db.test.mjs
```

Geprüft: 30 Level und 200 Tagesrätsel gültig, lösbar und deterministisch; Fluss und Lecks; feste Teile; Kodierung; Prüfung (falsche Drehzahl, ungelöst, Tipps nach dem Lösen, anderer Seed); Edge Function (Sitzung, CORS, keine Zeit vom Browser); Datenbank (ein Versuch je Tag, Fortsetzen mit laufender Uhr, Zeit von der Datenbank, zu schnell, abgelaufen, Gleichstand, Archiv, Rechte, Aufräumen, Kontolöschung). Oberfläche im Browser (390×844 und 360×620): Level lösen, Tagesrätsel mit Fortsetzen nach Neuladen, Meldung, Rangliste, „schon gelöst“.

## 7. Einrichtung und Freigabe

1. SQL aus `supabase/migrations/20261023200000_leitungschaos.sql` im Supabase-SQL-Editor ausführen (nach den Migrationen bis `20261022170000`).
2. `npx supabase functions deploy leitungschaos-lauf --project-ref cphwxikfrxgejiqghlwn --no-verify-jwt` (temporärer Access Token, danach löschen).
3. Auf der Branch-Vorschau mit Testkonto spielen: Tagesrätsel, Rang, Archiv. Achtung: Der Testversuch ist dann der gewertete Versuch des Tages.
4. Freigabe (erst nach deinem Okay): `update public.games set listed = true where slug = 'leitungschaos';`, in `public/spiele/leitungschaos.html` die Zeile `<meta name="robots" content="noindex">` entfernen, Kachel in `public/index.html` (Vorlage unten) samt Bestwert-Zeile, `public/sitemap.xml` ergänzen, dann Merge nach `main`.

```html
<li class="kachel" data-slug="leitungschaos" data-kategorien="raetsel" data-rec="leitungschaos" data-name="Leitungschaos" data-arten="Rätsel,Logik,Tagesrangliste" data-kat="neu"><a href="/spiele/leitungschaos"><img src="/bilder/leitungschaos.webp" width="720" height="720" alt="" decoding="async" loading="lazy"><span class="name">Leitungschaos</span></a></li>
```
