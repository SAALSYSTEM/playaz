# DARTFIEBER

Dart-Geschicklichkeitsspiel mit Tageschallenge und geprüfter Tagesrangliste. Stand: in Entwicklung auf Branch `dartfieber` (nicht auf `main`). Stilreferenz: `design/dartfieber/vorschau-stilreferenz.png`.

## 1. Bestandsaufnahme PlaySaal (22.10.2026)

| Thema | Vorhanden | Folge für Dartfieber |
|---|---|---|
| Technik | Statische Seite in `public/`, kein Build, Cloudflare Worker `playaz` (Static Assets), Spiele als ES-Module | Keine Framework-Wechsel: `dartfieber.html` + `dartfieber/{sim,game}.js` |
| Spieleseite | je Spiel eine HTML-Datei, Kopf/Schriften/`pz-home`-Knopf, `playsaal-config.js` + `playsaal.js` (Konten, Randreiter, Fehler melden, Statistik) | gleiches Gerüst wie PUNKTLANDUNG/PAPIERPILOT |
| Navigation / Übersicht | Kacheln in `public/index.html`, Katalog aus `public.games` (`listed`), `playsaal-config.js` (`spiele`, `namen`, `praefixe`), `assets/umzug.js`, `sitemap.xml` | Eintrag in Config und Umzug; Kachel/Sitemap erst bei Freigabe (wie PAPIERPILOT) |
| Anmeldung | Supabase Auth (E-Mail-Code), Profil mit Spielername und Avatar, `window.PlaySaal` (`hatSitzung`, `token`, `rpc`) | **keine zweite Anmeldung**; Gäste spielen ohne Konto |
| Ranglisten | geprüfte Ranglisten für SCHRÄGLAGE, SEITENWECHSEL, PUNKTLANDUNG, PAPIERPILOT: Browser meldet Eingaben, Edge Function rechnet mit derselben `sim.js` nach, nur `service_role` schreibt | gleiches Prinzip (Eingaben nachrechnen), aber mit serverseitigem Tages-Seed und einmaliger Run-ID (siehe unten) |
| Tageskurs bisher | Seed = Datum (JJJJMMTT), im Browser berechnet | **neu:** Seed wird vom Server ausgewürfelt und gespeichert (nicht aus dem Datum ableitbar) |
| Zeitzone | `private.berlin_heute()` (Europe/Berlin) | wiederverwendet |
| Rate Limit | `private.rate_ok(bucket, key, fenster, max)` | wiederverwendet |

Fehlt und wird ergänzt (Migration `20261022170000_dartfieber.sql`): Tabelle der Tages-Challenges (Seed + Konfigurationsversion), Tabelle der ausgegebenen Runden (Run-ID, einmal abschließbar), geprüfte Tageswertung mit Archiv, die Funktionen `dartfieber_tag`, `dartfieber_start`, `dartfieber_run_lesen`, `dartfieber_abschliessen`, `dartfieber_rangliste`, `dartfieber_tage_liste` und die Edge Function `dartfieber-lauf`.

## 2. Implementierungsplan

1. `sim.js`: ganzzahlige, deterministische Regeln (60-Hz-Takt, keine Fließkommafunktionen), Dartscheiben-Geometrie, Wertung, Challenge aus Seed + Konfigurationsversion, Wind, Bonusziele, Nachfahren und Prüfung. Dieselbe Datei läuft im Browser und in der Edge Function.
2. Tests: Wertung inkl. Grenztreffer und Abgleich mit der gezeichneten Geometrie, Bonus und Pfeilverbrauch, gleiche Challenge bei gleichem Seed, Wind, Prüfung/Ablehnung.
3. Datenbank + Edge Function `dartfieber-lauf`.
4. `dartfieber.html` + `game.js`: Canvas (Scheibe, Linien, Pfeil, Effekte), Oberfläche nach Vorschau, Gast-/Konto-Ablauf, Rangliste.
5. Integration (Config, Umzug, Spielstand-Sync), Doku, Bilder einsetzen, Platzhalter entfernen.

## 3. Regeln (Stand Konfigurationsversion 1)

- 5 Pfeile, höchstens 30 Würfe je Runde. Jeder Wurf kostet einen Pfeil. Ohne Pfeile endet die Runde; ein Bonustreffer auf dem letzten Pfeil verlängert sie.
- Wurf = zwei Stopps: senkrechte Linie (Seite), dann waagerechte Linie (Höhe). Keine Stärke, keine Streuung.
- Wertung wie Darts: einfach, Doppel ×2, Triple ×3, äußeres Bull 25, inneres Bull 50. Außerhalb des Doppelrings (auch auf dem Zahlenring) 0 Punkte.
- Grenzen: Ringgrenze gehört zum innen liegenden Feld (Abstand ≤ Radius). Sektorgrenze gehört zum im Uhrzeigersinn folgenden Sektor.
- Wind verschiebt den Trefferpunkt um Stärke × 3 mm in Windrichtung (8 Richtungen). Er gilt für alle Würfe eines Blocks von 5 Würfen und ist für alle Spieler gleich.
- Bonusziel: goldener Kreis auf der Scheibe, vor dem Wurf sichtbar, wird mit der Zeit kleiner. Treffer (Trefferpunkt inkl. Wind liegt im Kreis) = normale Punkte + 3 Pfeile.
- Tageschallenge: Seed und Konfigurationsversion legt der Server pro Berliner Kalendertag fest. Daraus entstehen Position und Größe der Scheibe, Linientempo, Wind und Bonusfolge. Eine begonnene Runde bleibt ihrem Tag zugeordnet.

## 4. Bildanforderungen an ChatGPT

Gemeinsam für alle Bilder: Das angehängte Vorschaubild (`design/dartfieber/vorschau-stilreferenz.png`) ist die verbindliche Stilreferenz. Ein Bild pro Antwort, keine Collage, kein Rahmen, kein Wasserzeichen. Freigestellte Bilder als PNG mit echtem Alphakanal (kein Schachbrettmuster, kein Schatten außerhalb des Motivs). Ablage: `design/dartfieber/<Dateiname>`. Alle Texte, Zahlen, Linien, Knöpfe und die Dartscheibe selbst entstehen im Code.

| Datei | Zweck | Maße | Hintergrund |
|---|---|---|---|
| `df-hintergrund.jpg` | Terrassen-Kulisse hinter allem | 1024 × 1536 (2:3) | deckend |
| `df-holzfassung.webp` | runde Holzrückwand der Scheibe | 1024 × 1024 (1:1) | transparent |
| `df-pfeil-bereit.png` | Pfeil in Ich-Perspektive, Wurf-Ausgangslage und Flug | 768 × 1024 (3:4) | transparent |
| `df-pfeil-treffer.png` | Pfeil steckt in der Scheibe | 512 × 512 (1:1) | transparent |
| `df-pfeil-icon.png` | Symbol für die Pfeile-Anzeige | 256 × 256 (1:1) | transparent |
| `df-kachel.png` | quadratische Kachel der Spieleübersicht (ohne Schrift) | 1024 × 1024 (1:1) | deckend |
| `df-social.png` | Social Preview (wird auf 1200 × 630 zugeschnitten, Schrift setzt ein Skript) | 1536 × 1024 (3:2) | deckend |

Effekte (Funken, „+3 PFEILE“, Bonuskreis, Aufprall) und Linien entstehen im Code und werden nicht angefordert.

### df-hintergrund.jpg

```
Erstelle den Hintergrund für ein mobiles Dart-Browserspiel im Hochformat, 1024 × 1536 Pixel (2:3), deckend, ohne Alphakanal.

Stilreferenz ist das angehängte Vorschaubild: dieselbe warme Outdoor-Terrasse im goldenen Abendlicht, dieselben Lichterketten, Pergola mit Weinlaub, See mit Bergen und Kirchturm im Hintergrund, dieselbe hochwertige, leicht stilisierte Spielgrafik mit weicher Tiefenunschärfe.

Zeige genau diese Szene OHNE Dartscheibe, OHNE Holzrückwand der Scheibe, OHNE Pfeil, OHNE Text, OHNE Logo, OHNE Zahlen, OHNE Bedienelemente, OHNE Personen.

Komposition, frontal, leicht erhöhte Augenhöhe:
- Obere 12 %: Himmel, Lichterkette, Weinlaub.
- Mitte (etwa 15 % bis 72 % der Höhe, 6 % bis 94 % der Breite): eine ruhige, nur weich unscharfe, möglichst gleichmäßige Fläche (verwitterte Holzbretterwand der Pergola, Ranken nur am Rand). Dort wird später per Programm eine runde Dartscheibe mit Holzfassung eingesetzt. Keine markanten Linien, Details oder hellen Lichtpunkte in der Mitte.
- Untere 28 %: Holztischplatte der Terrasse im Vordergrund mit Maserung, links und rechts leicht unscharfe Blumentöpfe und eine Kerzenlaterne. Die Mitte unten bleibt frei (dort wird später ein Pfeil eingeblendet).
Wichtige Motive an die Ränder legen, aber nicht abschneiden; auf schmalen Handys wird das Bild seitlich beschnitten.
```

### df-holzfassung.webp

```
Erstelle eine runde Holzfassung (Holzscheibe) für eine Dartscheibe, streng frontal in Draufsicht (orthografisch, keine Perspektive, keine Schrägansicht). Freigestellt auf echtem transparentem Hintergrund (PNG mit Alphakanal, kein Schachbrettmuster, kein Schlagschatten außerhalb der Scheibe). Quadrat 1024 × 1024 Pixel (1:1). Die Scheibe ist ein exakter Kreis, zentriert, Durchmesser etwa 96 % der Bildbreite.

Material und Stil wie die Holzrückwand hinter der Dartscheibe im angehängten Vorschaubild: warmes, verwittertes Holz aus senkrechten Brettern mit Maserung, dunkle Fugen, leichte Kantenabnutzung, vier dunkle Metallschrauben mit kleinen Winkelbeschlägen diagonal bei 45°, 135°, 225° und 315° im Randbereich (zwischen 82 % und 95 % des Radius).

WICHTIG: In der Mitte (innerhalb von 80 % des Radius) ruhiges, gleichmäßiges Holz ohne Löcher, Ringe, Zahlen und ohne Dartscheibe, weil dort per Programm die Dartscheibe darübergelegt wird. Kein Text, keine Zahlen, kein Pfeil.
```

### df-pfeil-bereit.png

```
Erstelle einen einzelnen Dartpfeil aus der Ich-Perspektive des Spielers, freigestellt auf echtem transparentem Hintergrund (PNG mit Alphakanal, kein Schachbrettmuster, kein Schlagschatten). Hochformat 768 × 1024 Pixel (3:4).

Perspektive wie der Pfeil unten in der Mitte des angehängten Vorschaubilds: Blick von hinten, leicht von unten auf den Pfeil. Der Pfeil ist exakt senkrecht ausgerichtet, die Spitze zeigt nach oben und liegt genau auf der vertikalen Bildmittelachse, etwa 4 % unter dem oberen Bildrand. Das Ende der Flights liegt etwa 4 % über dem unteren Bildrand.

Details: Messing-Barrel mit feiner Rillung, schlanker Schaft, vier Flights in Türkisgrün mit goldenen Kantenlinien (wie im Vorschaubild), leicht perspektivisch verkürzt. Hochwertige, leicht stilisierte Spielgrafik, warmes Abendlicht von links oben, saubere Kanten. Der Pfeil füllt fast die ganze Höhe, die größte Breite (Flights) beträgt etwa 55 % der Bildbreite.

Keine Hand, keine Dartscheibe, kein Hintergrund, kein Text.
```

### df-pfeil-treffer.png

```
Erstelle einen Dartpfeil, der in einer Dartscheibe steckt, aus der Spielerperspektive: frontal, der Pfeil ragt dem Betrachter entgegen. Freigestellt auf echtem transparentem Hintergrund (PNG mit Alphakanal, kein Schachbrettmuster, kein Schatten). Die Dartscheibe selbst ist NICHT zu sehen. Quadrat 512 × 512 Pixel (1:1).

Die Stahlspitze liegt GENAU im Mittelpunkt des Bildes (Pixel 256 / 256), dieser Punkt ist später der Trefferpunkt. Von dort ragt der Pfeil leicht schräg nach oben rechts (etwa 25° zur Blickrichtung geneigt) auf den Betrachter zu und ist perspektivisch stark verkürzt: zuerst ein kurzes Stück Messing-Barrel, dahinter vier türkisgrüne Flights mit goldenen Kantenlinien als größte Fläche. Gleicher Stil, gleiche Farben und gleiches Abendlicht wie der Pfeil im angehängten Vorschaubild.

Der ganze Pfeil bleibt innerhalb von 85 % des Bildes; links und unterhalb der Spitze bleibt das Bild leer. Kein Text.
```

### df-pfeil-icon.png

```
Erstelle ein kleines Symbol eines Dartpfeils für eine Pfeile-Anzeige, wie die orangefarbenen Pfeil-Symbole im Feld „PFEILE“ des angehängten Vorschaubilds. Seitenansicht, diagonal von unten links (Flights) nach oben rechts (Spitze), 45°. Messing-Barrel, orangefarbene Flights mit hellerem Rand, saubere Kanten, hochwertig und leicht stilisiert, gut lesbar auf dunkelblauem Hintergrund (#101E2B). Freigestellt auf echtem transparentem Hintergrund (PNG mit Alphakanal), 256 × 256 Pixel (1:1), das Motiv füllt etwa 90 % der Fläche. Kein Text, kein Schatten.
```

### df-kachel.png

```
Erstelle eine quadratische Spielkachel, 1024 × 1024 Pixel (1:1), deckend, im Stil des angehängten Vorschaubilds (warme Terrasse im Abendlicht, hochwertige leicht stilisierte Spielgrafik).

Motiv: Nahaufnahme von drei Dartpfeilen mit türkisgrünen Flights und goldenen Linien, die dicht beieinander in einer klassischen Dartscheibe (rot, grün, schwarz, creme) stecken, nahe Triple 20 und Bull. Im Hintergrund weiche Lichterketten als Bokeh und goldener Glanz.

KEIN Text, KEIN Logo, KEINE Zahlen und keine Schrift irgendwo (den Zahlenring der Scheibe weglassen oder unlesbar unscharf lassen). Das Hauptmotiv ist zentriert, rundum 10 % Rand frei, weil die Kachel mit abgerundeten Ecken beschnitten wird.
```

### df-social.png

```
Erstelle ein Social-Preview-Motiv im Breitformat 1536 × 1024 Pixel (3:2), deckend, im Stil des angehängten Vorschaubilds. Es wird später auf 1200 × 630 zugeschnitten (oben und unten fallen je etwa 17 % weg), deshalb liegt alles Wichtige im mittleren Band (22 % bis 78 % der Höhe).

Komposition: Die linken 40 % sind eine ruhige Fläche (weicher Terrassen-Hintergrund im Abendlicht mit Bokeh), dort setzt ein Skript später den Schriftzug. Rechts (etwa 55 %) die Dartscheibe schräg von vorn, ein Pfeil mit türkisgrünen Flights steckt im Triple 20, dazu ein kleiner goldener Kreis mit Glühen und Funken (Bonusziel).

KEIN Text, KEIN Logo, KEINE Zahlen und keine Schrift irgendwo (den Zahlenring der Scheibe weglassen oder unlesbar unscharf lassen).
```

## 5. Dateien (im Aufbau)

Wird mit dem Fortschritt der Umsetzung ergänzt.
