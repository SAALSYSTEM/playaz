# NEUNMALKLUG

Sudoku im Hochformat: Tages-Sudoku für alle mit geprüfter Tagesrangliste und endlos freie Rätsel in vier Stufen (Leicht, Mittel, Schwer, Experte). Notizen, Rückgängig, Löschen, Konfliktanzeige; im freien Spiel zusätzlich Tipps und „Fehler sofort zeigen“. Veröffentlicht auf `main` am 05.11.2026 (Startseite, Sitemap, `listed = true`, Freigabe „Push direkt Main“).

Dateien: `public/spiele/neunmalklug.html`, `public/spiele/neunmalklug/{sim,game}.js`, Migration `supabase/migrations/20261105080000_neunmalklug.sql`, Edge Function `supabase/functions/neunmalklug-lauf/`, Kachel/Teilen-Bild `tools/neunmalklug-cover.mjs`.

## 1. Rätselbau (Konfigurationsversion 1)

`baueRaetsel(seed, stufe)` in `sim.js`, ganzzahlig (mulberry32) und deterministisch, damit Browser und Edge Function dasselbe Rätsel bauen:

1. Volle Lösung per Rücksetzsuche mit gemischter Ziffernfolge.
2. Felder paarweise punktsymmetrisch leeren, danach einzeln, bis die Zielzahl der Vorgaben erreicht ist – aber nur, solange ein **logischer Löser** das Rätsel mit den erlaubten Techniken schafft. Damit ist jedes Rätsel eindeutig und ohne Raten lösbar.
3. Schwer und Experte müssen die zweite Technikstufe wirklich brauchen (sonst neues Raster, bis zu 40 Versuche aus demselben Zufallsstrom).

| Stufe | Ziel Vorgaben | Techniken | gemessen (Median) |
|---|---|---|---|
| Leicht | 38 | nackte und versteckte Einzelne | 38 |
| Mittel | 30 | nackte und versteckte Einzelne | 30 |
| Schwer | 26 | + Block-Zeilen-Wechselwirkung, nackte Paare | 26 |
| Experte | 23 | + Block-Zeilen-Wechselwirkung, nackte Paare | 24 |

Bau dauert im Mittel unter 30 ms (höchstens ~120 ms).

Tagesrätsel: Stufe nach Wochentag des Berliner Datums – Mo leicht, Di/Mi/Fr mittel, Do/Sa schwer, So Experte (`KONFIG[1].woche`).

## 2. Tagesrätsel und Rangliste

Gleicher Ablauf wie Leitungschaos (`docs/LEITUNGSCHAOS.md`, Abschnitt 3):

1. `neunmalklug_tag()` (auch Gäste) liefert Datum, Seed, Version. Seed wird beim ersten Abruf des Tages zufällig festgelegt.
2. Angemeldet: „Los“ ruft `neunmalklug_start()`. Je Konto und Tag **genau eine** Runde; die Uhr läuft ab der ersten Ausgabe, Neuladen setzt fort.
3. Gelöst: `{run_id, loesung}` (81 Ziffern) an `neunmalklug-lauf`. Seed, Version und Tag holt die Funktion aus der Datenbank, baut das Rätsel nach und vergleicht (Vorgaben unverändert, Lösung richtig).
4. `neunmalklug_abschliessen` misst die Zeit mit der Datenbankuhr. Abgelehnt: älter als 12 Stunden, schneller als 10 s oder 0,4 s je auszufüllendem Feld. Höchstens 5 Prüfversuche je Run-ID.
5. Wertung: Zeit aufsteigend; gleiche Zeit = gleicher Platz. Archiv über `neunmalklug_tage_liste` / `neunmalklug_rangliste(tag)`.

**Bewusste Abweichung vom ursprünglichen Konzept:** Im Tagesrätsel gibt es keine Tipps (statt „Tipps mit Strafsekunden“). Ob jemand einen Tipp benutzt hat, könnte der Server nicht prüfen – wer schummeln will, würde ihn einfach verschweigen. Konflikte (doppelte Ziffer in Zeile/Spalte/Block) werden trotzdem angezeigt, weil sie aus den Regeln folgen und nichts über die Lösung verraten.

**Ehrliche Grenzen:** Der Browser baut das Rätsel selbst, kennt also die Lösung; ein Lösungsprogramm ist nicht erkennbar. Die Mindestzeit filtert nur das Gröbste. Gefälschte Zeiten und falsche Lösungen kommen nicht in die Rangliste.

## 3. Bilder

Das Spiel braucht keine Bilder. Optional:

- `public/spiele/neunmalklug/img/nk-hintergrund.webp` (Hochformat, darf animiert sein): wird geladen, wenn vorhanden, und abgedunkelt. Bei „weniger Bewegung“ bleibt nur der Verlauf. Ein GIF vorher in animiertes WebP umwandeln (viel kleiner, mehr Farben), z. B. `python3 -c "from PIL import Image; Image.open('in.gif').save('nk-hintergrund.webp', save_all=True, quality=70, method=6)"`.
- Kachel und Teilen-Bild: ChatGPT-Bilder **ohne Schrift** als `design/neunmalklug/nk-kachel.png` (1:1) und `design/neunmalklug/nk-social.png` (Querformat, Motiv links, rechts Platz für den Schriftzug), dann `node tools/neunmalklug-cover.mjs`. Ohne diese Dateien zeichnet das Skript ein Sudoku-Brett in den PlaySaal-Farben (Stand 05.11.: gezeichnete Fassung).

## 4. Tests

```sh
node --test tests/neunmalklug-sim.test.mjs tests/neunmalklug-pruefung.test.mjs
node --test --test-concurrency=1 tests/neunmalklug-browser.test.mjs
PGLITE_PATH=… node --test --test-name-pattern=NEUNMALKLUG tests/db.test.mjs
```

Geprüft: je Stufe 60 Rätsel eindeutig, ohne Raten lösbar, Schwer/Experte brauchen mehr als Einzelne, Stufen werden schwerer, deterministisch, Wochentag-Stufen; Prüfung (falsche Lösung, geänderte Vorgaben, fremdes Rätsel, anderer Tag); Edge Function (Sitzung, CORS, keine Zeit vom Browser); Datenbank (ein Versuch je Tag, Fortsetzen mit laufender Uhr, Zeit von der Datenbank, zu schnell, abgelaufen, Gleichstand, Archiv, Rechte, Aufräumen, Kontolöschung). Browser (390×844, 360×640, 430×932): freies Spiel per Fingertipp lösen, Notizen/Konflikt/Rückgängig/Tipp, Fortsetzen nach Neuladen, Tagesrätsel mit nachgebautem Server und Meldung, „schon gelöst“, Herausforderungslink, Layout.

## 5. Einrichtung

1. SQL aus `supabase/migrations/20261105080000_neunmalklug.sql` im Supabase-SQL-Editor ausführen (nach `20261102220000_putt_profi.sql`).
2. Edge Function `neunmalklug-lauf` deployen, verify_jwt aus: `npx supabase functions deploy neunmalklug-lauf --project-ref cphwxikfrxgejiqghlwn --no-verify-jwt`.
3. Kachel auf der Startseite (`data-rec="neunmalklug"`), Sitemap, `playsaal-config.js` (spiele, namen, praefixe) und `umzug.js` sind eingetragen.
