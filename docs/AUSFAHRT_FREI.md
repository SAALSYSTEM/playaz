# AUSFAHRT FREI

Schiebe-Rätsel im Hochformat: 6×6-Bauhof, Fahrzeuge fahren nur in ihrer Längsrichtung. Der Betonmischer muss rechts zur Ausfahrt. Tagesrätsel mit geprüfter Tagesrangliste (wenigste Züge, dann Zeit) und 30 Level mit Sternen. Stand: Branch `ausfahrt-frei`, `noindex`, nicht auf der Startseite, nicht auf `main`.

Dateien: `public/spiele/ausfahrt-frei.html`, `public/spiele/ausfahrt-frei/{sim,raetsel,game}.js`, Generator `tools/ausfahrt-raetsel.mjs`, Bilder `tools/ausfahrt-assets.py`, Migration `supabase/migrations/20261023220000_ausfahrt_frei.sql`, Edge Function `supabase/functions/ausfahrt-lauf/`.

## 1. Regeln (Konfigurationsversion 1)

- Fahrzeuge sind 2 oder 3 Felder lang, waagerecht oder senkrecht, und fahren beliebig weit in ihrer Längsrichtung, solange frei ist.
- Ein Zug = ein Fahrzeug einmal verschieben, egal wie weit. Gelöst, wenn der Betonmischer (Zeile 3) ganz rechts steht.
- „Zug zurück“ fährt den letzten Zug zurück und zählt selbst als Zug (der Server spielt genau die gemeldeten Züge nach). „Neustart“ nur im Levelmodus.
- Sterne: ★★★ = Mindestzahl Züge, ★★ ≤ 1,5 × Minimum, ★ gelöst.

## 2. Rätsel

Die Rätsel stehen fest in `raetsel.js`, gebaut von `node tools/ausfahrt-raetsel.mjs`: zufällige Aufstellung würfeln, den ganzen Zustandsraum durchsuchen, von allen gelösten Stellungen rückwärts die Mindestzugzahl jeder Stellung bestimmen und eine passende Stellung nehmen; schwere Rätsel per Bergsteigen. Jede Zugzahl ist vom Löser bewiesen (Breitensuche).

- 30 Level: Mindestzüge 2 bis 30 (Abschnitte Einfahren, Rangieren, Stau, Feierabendverkehr, Meister).
- Tagespool Version 1: 366 verschiedene Rätsel mit 14–24 Mindestzügen (Ø 19), gemischt. Das Tagesrätsel ist `POOLS[version][seed % 366]`.

**Abweichung von Leitungschaos:** Dort baut die Spiellogik das Tagesrätsel aus dem Seed. Hier würde das eine Suche über zehntausende Stellungen bedeuten – zu langsam und unsicher für die Edge Function. Darum ein fester, vorab geprüfter Pool; Browser und Server lesen dieselbe Datei.

## 3. Tagesrätsel und Rangliste

Wie Leitungschaos: Seed je Berliner Tag vom Server, genau eine Runde je Konto und Tag (Fortsetzen nach Neuladen, Uhr läuft ab „Los“), Zeit von der Datenbankuhr, Archiv.

- Wertung: **Züge aufsteigend, dann Zeit**. Gleiche Züge und Zeit = gleicher Platz.
- Prüfung: Die Edge Function `ausfahrt-lauf` spielt jeden Zug nach (jeder Zug erlaubt, gelöst erst nach dem letzten, Zugzahl stimmt). Die Datenbank lehnt ab: älter als 12 Stunden, schneller als 3 s oder 0,25 s je Zug.
- **Ehrliche Grenzen:** Der Pool liegt im Browser, und ein Löser findet jede Lösung in Millisekunden. Wer schummeln will und dabei die Mindestzeit einhält, wird nicht erkannt, ebenso wenig wer vorher als Gast oder mit zweitem Konto gespielt hat.

## 4. Bilder (ChatGPT)

Fahrzeuge genau von oben, liegend, Fahrtrichtung rechts, transparent: `af-mischer` (2), `af-pritsche`, `af-radlader`, `af-stapler` (je 2), `af-container`, `af-tieflader` (je 3); dazu `af-hintergrund` (1024×1536), `af-kachel`, `af-social`. Originale nach `design/ausfahrt-frei/`, dann `python3 tools/ausfahrt-assets.py` (schneidet zu und bringt jedes Fahrzeug unverzerrt auf sein Seitenverhältnis). Pflicht sind Hintergrund, Mischer, Pritsche, Container; die übrigen kommen dazu, wenn es sie gibt. Fehlt ein Pflichtbild, zeichnet das Spiel farbige Platzhalter.

## 5. Tests

```sh
node --test tests/ausfahrt-sim.test.mjs tests/ausfahrt-pruefung.test.mjs
PGLITE_PATH=… node --test --test-name-pattern=AUSFAHRT tests/db.test.mjs
```

Oberfläche im Browser geprüft (390×844): Ziehen mit der Maus, Level lösen, Tagesrätsel mit Server-Meldung (Attrappe).

## 6. Einrichtung und Freigabe

1. SQL aus `supabase/migrations/20261023220000_ausfahrt_frei.sql` im Supabase-SQL-Editor ausführen (nach `20261023200000_leitungschaos.sql`).
2. Edge Function `ausfahrt-lauf` deployen (Dateien `index.ts`, `handler.js`, `sim.js`, `raetsel.js`; `verify_jwt` aus).
3. Freigabe: `update public.games set listed = true where slug = 'ausfahrt-frei';`, `noindex` entfernen, Kachel in `public/index.html` (Vorlage unten) samt Bestwert-Zeile, `public/sitemap.xml`, Merge nach `main`.

```html
<li class="kachel" data-slug="ausfahrt-frei" data-kategorien="raetsel" data-rec="ausfahrt" data-name="Ausfahrt frei" data-arten="Rätsel,Logik,Tagesrangliste" data-kat="neu"><a href="/spiele/ausfahrt-frei"><img src="/bilder/ausfahrt-frei.webp" width="720" height="720" alt="" decoding="async" loading="lazy"><span class="name">Ausfahrt frei</span></a></li>
```
