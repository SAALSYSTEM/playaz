# SCHRÄGLAGE – Physik-Fahrspiel

Stand: 15.10.2026 · Branch `schraeglage` · **nicht live** (Vorschau über Cloudflare Workers Builds, `main` unverändert)

Eigenständiges Fahrspiel nach dem Prinzip „Gas, Bremse, Gefühl“: Fahrzeug über Hindernisse ins Ziel bringen, ohne sich zu überschlagen. Eigene Fahrzeuge, Level, Namen, Grafik und Physikabstimmung. Keine Assets oder Leveldesigns aus anderen Spielen.

Adresse: `/spiele/schraeglage` · Spielstand: `localStorage` → `schraeglage.v1` · Kategorie: Fahren, Geschick

## Aufbau

| Datei | Inhalt |
|---|---|
| `public/spiele/schraeglage.html` | Seite, Oberfläche (HUD, Menüs, Pedale), CSS, SEO |
| `public/spiele/schraeglage/sim.js` | Physik und Regeln ohne DOM: Fahrzeuge, Untergründe, Crash/Ziel, Replays, `verifyRun()` |
| `public/spiele/schraeglage/levels.js` | 60 Level im Baukasten-Format (Stift läuft von links nach rechts) |
| `public/spiele/schraeglage/game.js` | Darstellung (Canvas 2D), Steuerung, Ton (WebAudio), Speicherstand, Bildschirme, Teilen |
| `public/spiele/schraeglage/awards.js` | Auszeichnungen (Bedingungen, Auswertung), Symbole, 1080×1080-Teilen-Grafik |
| `public/spiele/schraeglage/online.js` | Adapter zur PlaySaal-Infrastruktur (`window.PlaySaal` vom Branch `rangliste`) |
| `public/spiele/schraeglage/det.js` | deterministische sin/cos/atan2 |
| `public/spiele/schraeglage/planck.js` | planck.js 1.4.3 (MIT, Box2D-Portierung), minifiziert, mit `det.js` statt `Math.sin/cos/atan2` |
| `tools/schraeglage-bot.mjs` | Lösungs-Bot: prüft Lösbarkeit, Timing-Toleranz, liefert Goldzeit-Basis |
| `tools/planck-vendor.mjs` | erzeugt `planck.js` neu (nur bei planck-Update nötig) |
| `tests/schraeglage-sim.test.mjs` | Physik, Level, Determinismus, Prüfung, Awards (ohne Browser) |
| `tests/schraeglage.test.mjs` | Browser-Tests (Playwright gegen `wrangler dev`) |
| `tests/schraeglage-loesungen.json` | Bot-Lösungen aller 60 Level (Regressionstest) |

**Abweichung von den anderen Spielen:** Die bisherigen Spiele sind je eine einzelne HTML-Datei. SCHRÄGLAGE teilt sich in Module, weil dieselbe Physik im Browser, im Test-Bot und später im Prüfdienst des Servers laufen muss. Kein Build-Schritt: die Module werden direkt als `type="module"` geladen.

**Physik-Engine:** planck.js statt Matter.js. Gründe: echte Rad-Gelenke mit Federung und Motor (`WheelJoint`), stabile Gelenkketten für Brücken, kontinuierliche Kollision gegen Durchfallen. Matter.js hat weder Rad-Gelenk noch kontinuierliche Kollision.

## Physik

- Fester Takt 60 Hz (`DT = 1/60`), unabhängig von der Bildrate. Die Darstellung interpoliert zwischen zwei Takten (ruckelfrei auf 120-Hz-Displays), bei Lastspitzen max. 5 Takte pro Bild.
- Räder: eigene Körper (Kreis), `WheelJoint` mit Feder/Dämpfer je Fahrzeug, `RopeJoint` begrenzt den Federweg. Motor am Rad, Rückwirkung kippt die Karosserie beim Anfahren und Bremsen.
- Luftsteuerung: In der Luft hebt Gas die Nase, Bremse senkt sie (ab 0,1 s Flugzeit, gedeckelte Drehrate).
- Bremse: fährt rückwärts, sobald das Fahrzeug steht (wie gewohnt bei Zwei-Knopf-Fahrspielen).
- Crash: Fahrerkopf berührt Boden/Objekt, Absturz unter das Level, Lava/Wasser, Dach-Lage >⅓ s, Seitenlage >1,5 s. Danach lösen sich die Räder (Crash-Animation), Neustart nach 1,5 s oder sofort per Taste/Tippen.
- Ziel: Zeit wird zwischen zwei Takten interpoliert (Millisekunden).
- Untergründe je Kante: Gras, Erde, Asphalt, Holz, Fels, Stahl, Strand, Tiefsand (bremst), Schlamm, Schnee, Eis (kaum Grip), Turbo (schiebt), Sprungfeder, Lava (Crash).
- Objekte: Brücken (Gelenkketten), Wippen, Fähren und Aufzüge (mit Halt an den Enden), Schaukeln an Seilen, Bröckelplatten, Kisten, Fässer, Bälle, Felsen, Umsteige-Tore.
- Uhr startet mit der ersten Eingabe. Vorher schwingen Federn und Brücken 45 Takte ein.

### Fahrzeuge

| Fahrzeug | Art | Eigenschaften | erstes Level |
|---|---|---|---|
| Kraxler | Geländewagen | Allrad, wendig, mittlere Luftkontrolle | 1 |
| Strandfloh | Strandbuggy | leicht, schnell, starke Luftkontrolle, wenig Standfestigkeit | 5 |
| Pritsche | Pickup | Heckantrieb, langer Radstand, schnell, ruhig in der Luft | 8 |
| Brummi | Schwerer LKW | drei Achsen, sehr schwer, kaum umzuwerfen, langsam | 13 |
| Wummser | Monstertruck | riesige Räder, weiche Federn, klettert Stufen, kippt gern | 18 |

Fahrzeuge werden mit dem Level freigeschaltet, in dem sie zuerst vorkommen (Garage). Lackierungen gibt es für Auszeichnungen – nur Optik, kein Vorteil, nichts käuflich.

### Determinismus und Replays

Ein Lauf wird als Eingabewechsel gespeichert (`[Takt, Gas|Bremse|nichts]`, kodiert z. B. `0g.1kn.2ab`). `Math.sin/cos/atan2` rechnen je Browser minimal unterschiedlich; deshalb nutzen Physik, Level und planck.js ausschließlich `det.js` (nur `+ − × ÷`, `Math.sqrt`, `Math.round`). Damit liefert dieselbe Eingabefolge in Chrome, Safari, Firefox und im Worker bitgenau dieselbe Zeit. Der Test prüft, dass keine ungenauen Math-Funktionen in Physik/Level vorkommen.

**`SIM_VERSION` in `sim.js` erhöhen**, sobald Physik, Fahrzeuge oder Level geändert werden. Ältere Replays (Geist, gemeldete Läufe) werden dann nicht mehr gegen die neue Physik gewertet.

## Level

60 Level in zwölf Welten, je fünf: Wiese (1–5, Grundlagen), Canyon (6–10, Brücken/Rampen/Bremsen), Baustelle (11–15, bewegte Plattformen/Wippen/Schaukeln), Gletscher (16–20, Sprungkombinationen, Eis/Schnee/Turbo), Insel (21–25, Fahrzeugwechsel, große Räder, Balance), Vulkan (26–30, alles zusammen), Gipfel (31–35, Eis, Seilbrücken, Wippen, schwere Lasten, Fahrzeugwechsel-Finale), Wald (36–40, Schlamm, Baumstämme, Pilz-Trampoline, Baumwipfelpfad), Wüste (41–45, Tiefsand, Dünen, Oase, Sandsturm), Hafen (46–50, Container, Fähren, Drehbrücken, Ladekran), Bergwerk (51–55, niedrige Stollendecken, Aufzüge, Loren, Glutnest), Mitternacht (56–60, alles zusammen, Finale mit allen fünf Fahrzeugen). Level werden der Reihe nach freigeschaltet; Herausforderungs-Links öffnen ihr Level direkt.

**Lösbarkeit:** `node tools/schraeglage-bot.mjs --json tests/schraeglage-loesungen.json` sucht für jedes Level eine Eingabefolge in 0,1-s-Schritten, vereinfacht sie auf möglichst wenige Wechsel und misst, wie viele Läufe mit verschobenem Timing (±4 bzw. ±8 Takte = ±67/133 ms je Eingabe) noch ins Ziel kommen. Die Goldzeit ist die schnellste Bot-Zeit + 12 %, aufgerundet auf 0,5 s.

| # | Level | Fahrzeug | Bot-Bestzeit | Goldzeit | Toleranz ±4 Takte | ±8 Takte |
|---|---|---|---|---|---|---|
| 1 | Erste Runde | Kraxler | 12,33 s | 14 s | 100 % | 100 % |
| 2 | Hüpfburg | Kraxler | 7,99 s | 9 s | 100 % | 100 % |
| 3 | Holzweg | Kraxler | 15,18 s | 17,5 s | 90 % | 93 % |
| 4 | Wippe | Kraxler | 14,29 s | 16,5 s | 100 % | 100 % |
| 5 | Achterbahn | Strandfloh | 11,43 s | 13 s | 67 % | 40 % |
| 6 | Hängebrücke | Kraxler | 9,33 s | 10,5 s | 100 % | 60 % |
| 7 | Talfahrt | Kraxler | 8,81 s | 10 s | 77 % | 80 % |
| 8 | Canyon-Sprung | Pritsche | 9,55 s | 11 s | 73 % | 53 % |
| 9 | Schmaler Grat | Strandfloh | 10,07 s | 11,5 s | 77 % | 77 % |
| 10 | Felsenmeer | Kraxler | 16,00 s | 18 s | 70 % | 73 % |
| 11 | Aufzug | Pritsche | 21,07 s | 24 s | 43 % | 20 % |
| 12 | Wippenwerk | Kraxler | 17,52 s | 20 s | 83 % | 87 % |
| 13 | Schwertransport | Brummi | 12,28 s | 14 s | 43 % | 50 % |
| 14 | Kranschaukel | Kraxler | 15,39 s | 17,5 s | 3 % | 0 % |
| 15 | Rohbau | Pritsche | 10,25 s | 11,5 s | 43 % | 37 % |
| 16 | Glatteis | Kraxler | 9,12 s | 10,5 s | 57 % | 70 % |
| 17 | Schneeschanze | Strandfloh | 9,48 s | 11 s | 83 % | 67 % |
| 18 | Eisige Stufen | Wummser | 14,98 s | 17 s | 27 % | 10 % |
| 19 | Gletscherspalten | Pritsche | 10,60 s | 12 s | 50 % | 50 % |
| 20 | Lawinenhang | Kraxler | 8,43 s | 9,5 s | 23 % | 23 % |
| 21 | Umsteigen, bitte! | Kraxler → Wummser → Kraxler | 11,07 s | 12,5 s | 100 % | 100 % |
| 22 | Monsterstrand | Wummser | 13,77 s | 15,5 s | 87 % | 87 % |
| 23 | Balanceakt | Strandfloh | 6,74 s | 8 s | 20 % | 13 % |
| 24 | Fährbetrieb | Brummi → Strandfloh | 15,47 s | 17,5 s | 0 % | 0 % |
| 25 | Inselhüpfer | Wummser → Pritsche → Kraxler | 13,58 s | 15,5 s | 13 % | 3 % |
| 26 | Glutpfad | Kraxler | 16,00 s | 18 s | 17 % | 27 % |
| 27 | Ascheregen | Pritsche | 13,45 s | 15,5 s | 3 % | 7 % |
| 28 | Magmakammer | Wummser | 16,64 s | 19 s | 27 % | 10 % |
| 29 | Feuerprobe | Strandfloh → Brummi → Kraxler | 11,36 s | 13 s | 10 % | 13 % |
| 30 | Schräglage | Kraxler | 17,74 s | 20 s | 0 % | 0 % |
| 31 | Gipfelstürmer | Kraxler | 12,31 s | 14 s | 100 % | 100 % |
| 32 | Wolkenbrücke | Strandfloh | 7,71 s | 9 s | 83 % | 50 % |
| 33 | Rutschpartie | Pritsche | 9,10 s | 10,5 s | 73 % | 53 % |
| 34 | Schwergewicht | Brummi → Wummser | 21,18 s | 24 s | 83 % | 40 % |
| 35 | Gipfelkreuz | Kraxler, 3 Wechsel | 24,99 s | 28 s | 60 % | 37 % |
| 36 | Waldweg | Kraxler | 14,81 s | 17 s | 97 % | 70 % |
| 37 | Holzfäller | Brummi | 9,07 s | 10,5 s | 100 % | 100 % |
| 38 | Pilzhüpfer | Strandfloh | 7,96 s | 9 s | 100 % | 100 % |
| 39 | Wurzelwerk | Wummser | 11,99 s | 13,5 s | 100 % | 100 % |
| 40 | Baumwipfelpfad | Pritsche | 9,81 s | 11 s | 43 % | 27 % |
| 41 | Dünenmeer | Strandfloh | 10,71 s | 12 s | 53 % | 33 % |
| 42 | Treibsand | Wummser | 10,37 s | 12 s | 100 % | 100 % |
| 43 | Oase | Kraxler | 9,31 s | 10,5 s | 57 % | 17 % |
| 44 | Karawane | Brummi → Strandfloh | 11,82 s | 13,5 s | 30 % | 33 % |
| 45 | Sandsturm | Pritsche | 8,28 s | 9,5 s | 100 % | 100 % |
| 46 | Kaimauer | Kraxler | 15,25 s | 17,5 s | 0 % | 0 % |
| 47 | Drehbrücke | Pritsche | 18,68 s | 21 s | 87 % | 43 % |
| 48 | Containerstapel | Wummser | 16,20 s | 18,5 s | 30 % | 13 % |
| 49 | Ladekran | Kraxler | 19,92 s | 22,5 s | 47 % | 47 % |
| 50 | Leinen los! | Brummi → Strandfloh | 21,62 s | 24,5 s | 7 % | 0 % |
| 51 | Stollen | Kraxler | 9,72 s | 11 s | 100 % | 100 % |
| 52 | Lorenbahn | Pritsche | 13,65 s | 15,5 s | 10 % | 3 % |
| 53 | Förderschacht | Wummser | 17,45 s | 20 s | 13 % | 13 % |
| 54 | Sprengkammer | Strandfloh | 14,07 s | 16 s | 90 % | 80 % |
| 55 | Glutnest | Brummi | 11,19 s | 13 s | 100 % | 100 % |
| 56 | Nachtschicht | Kraxler | 12,33 s | 14 s | 47 % | 50 % |
| 57 | Sternschnuppe | Strandfloh | 9,63 s | 11 s | 23 % | 13 % |
| 58 | Geisterbahn | Wummser | 16,01 s | 18 s | 37 % | 23 % |
| 59 | Neonmeile | Pritsche | 10,69 s | 12 s | 100 % | 83 % |
| 60 | Grenzgänger | Kraxler, 4 Wechsel | 24,03 s | 27 s | 0 % | 0 % |

Hinweis zur Timing-Toleranz: Bei Leveln mit Fähren und Aufzügen ist der Wert niedrig, weil der Bot-Test jede Eingabe blind verschiebt. Menschen sehen die Plattform und warten einfach; die Plattformen halten an jedem Ende 1–2 s an.

### Erweiterung 36–60 (23.10.2026)

25 neue Level in fünf neuen Welten. Neue Bausteine waren nicht nötig: Die Level nutzen Elemente, die die Physik schon konnte, aber bisher kein Level: Schlamm und Tiefsand (bremsen), Trampolin (Pilze im Wald), Drehbalken (`rotorGap`, langsame Drehbrücke im Hafen, Bergwerk und Finale) und niedrige Decken (`ceiling`, Stollen im Bergwerk). Grafik: eigene Farben, Silhouetten und Deko je Welt in `game.js` (Tannen/Pilze, Kakteen/Palmen, Container/Poller, Grubenlampen/Loren/Kristalle, Laternen/Neonschilder mit Sternenhimmel).

**`SIM_VERSION` bleibt bewusst 1.** Level 1–35, Physik und Fahrzeuge sind unverändert; die neuen Level hängen nur hinten an. Damit bleiben alle gemeldeten Zeiten, Geister und Ranglisten gültig. Die Datenbank erlaubt bereits Level 1–60 (`schraeglage_laeufe.level`, `schraeglage_rangliste`). Die Edge Function `schraeglage-lauf` muss mit der neuen `levels.js` neu deployt werden, sonst werden Läufe in 36–60 als „ungültig“ abgelehnt.

Meisterfahrer und Alles Gold bleiben bei 35 (wer sie hat, behält sie); für alle 60 Level gibt es die neuen Awards Weltenbummler und Goldader.

## Auszeichnungen

23 Awards mit Symbol, Name, Beschreibung, Bedingung, Freischaltdatum und Seltenheit (Gewöhnlich, Selten, Episch, Legendär). Bedingungen in `awards.js` (`AWARDS`), Auswertung `evaluateAwards()` nach jedem Ziel, Crash und Teilen. Läufe liefern dafür Statistik aus der Physik: saubere Sprünge (≥ 0,5 s Luft, Landung ohne Karosseriekontakt), Saltos (volle Drehung in der Luft), Wheelie-Dauer, Bremse benutzt, maximale Schräglage.

| Award | Bedingung | Seltenheit |
|---|---|---|
| Bronze / Silber / Gold | 1 / 10 / 25 Level geschafft | Gewöhnlich / Selten / Episch |
| Meisterfahrer | 35 Level | Legendär |
| Weltenbummler | alle 60 Level | Legendär |
| Perfekte Landung | Level mit Sprung, ohne Überschlag, Karosserie nie aufgesetzt | Selten |
| Speedrunner | ein Level unter der Goldzeit | Selten |
| Unkaputtbar | fünfmal in Folge im Ziel ohne Unfall dazwischen | Episch |
| Stunt-König | drei saubere Sprünge in einem Level | Selten |
| Comeback | Level ab 11 nach ≥ 10 Fehlversuchen erstmals geschafft | Episch |
| Salto / Doppelsalto | 1 / 2 Überschläge in einem Sprung, sauber gelandet | Episch / Legendär |
| Goldrausch / Alles Gold / Goldader | 10 / 35 / 60 Goldzeiten | Episch / Legendär / Legendär |
| Vielflieger | 60 s Luft insgesamt | Gewöhnlich |
| Wheelie | 3 s am Stück auf den Hinterrädern | Selten |
| Ohne Bremse | Level ab 6 ohne Bremse | Selten |
| Fuhrpark | alle fünf Fahrzeuge gefahren | Selten |
| Kilometerfresser | 10 km gefahren | Gewöhnlich |
| Hartnäckig | 100 Unfälle | Gewöhnlich |
| Herausforderer | etwas geteilt | Gewöhnlich |
| Herausforderung angenommen | Zeit aus einem geteilten Link geschlagen | Episch |

## Teilen und Einladungen

- Nach jedem neuen Award: Erfolgsanimation mit „Teilen“, „Bild speichern“, „Link kopieren“, „Weiter spielen“. Nach dem Ziel zusätzlich „Herausfordern“ mit der eigenen Bestzeit.
- Teilen-Grafik 1080×1080 (Canvas): Award-Symbol bzw. Zeit, Award-Name, Spielname, PlaySaal-Logo, Leistung, Spielername (falls in der Garage eingetragen oder vom PlaySaal-Konto), Einladung und Adresse.
- Handy: Web Share API mit Bild (`navigator.canShare({files})`), sonst nur Text+Link. Desktop: Link wird kopiert und das Bild heruntergeladen.
- Links: `…/spiele/schraeglage?award=gold&von=Lena` bzw. `?level=7&zeit=14560&von=Lena`. Empfänger spielt sofort ohne Anmeldung; bei Zeit-Links startet das Level direkt mit Banner „Lena fordert dich heraus: 14,56 s – nicht verifiziert“. Parameter werden geprüft (Level 1–60, Zeit 1–3600 s, Name nur Buchstaben/Ziffern/._- , max. 16 Zeichen, nur als Text eingesetzt).
- **Lokal vs. verifiziert:** Ohne Server-Bestätigung steht auf Bild und Banner „auf meinem Gerät gemessen (nicht verifiziert)“. „✓ verifiziert“ erscheint nur, wenn der Prüfdienst den Lauf nachgefahren hat (siehe unten). Link-Parameter können nie „verifiziert“ behaupten.

## Ranglisten und Konten (vorbereitet, nicht aktiv)

Auf `main` gibt es noch keine Konten. Der Branch `rangliste` enthält das geplante Supabase-Konzept (`window.PlaySaal`, `lauf_melden`, `rangliste`, Cloud-Spielstand, Tageszähler). SCHRÄGLAGE baut darauf auf, ohne ein eigenes Konto- oder Ranglistensystem:

- `online.js` nutzt `window.PlaySaal`, sobald `assets/playsaal-config.js` und `assets/playsaal.js` auf der Seite eingebunden sind. Ohne das läuft alles lokal (Status „Zeit auf diesem Gerät gespeichert“).
- Gäste: alles lokal, nichts in der Datenbank. Mit Konto: Bestzeit wird gemeldet, Monats- und Jahresrangliste je Level im Bildschirm „Bestzeiten“. Freunde-Rangliste: vorbereitet, sobald es eine Freundschaftsfunktion gibt.
- SQL-Entwurf: [`docs/schraeglage-rangliste.sql`](schraeglage-rangliste.sql) (Tabelle `schraeglage_laeufe`, Funktionen `schraeglage_rangliste`, `schraeglage_platz`; kleinere Zeit = besser). Die vorhandene `lauf_melden`-Logik („höhere Punktzahl = besser“, Plausibilität über Faustformeln) passt für Zeitrennen nicht.

### Serverseitige Prüfung (Entwurf)

Der Browser meldet nie nur eine Zeit, sondern die **Eingabefolge**. Der Prüfdienst fährt sie mit genau derselben `sim.js` nach (`verifyRun()`): stimmt die Zielzeit bitgenau, wird sie eingetragen, sonst abgelehnt. Referenz: [`docs/schraeglage-pruefdienst.example.js`](schraeglage-pruefdienst.example.js).

1. Browser → `POST /api/schraeglage/lauf` mit Supabase-Token und `{ v, level, ms, inputs }`.
2. Worker prüft Token (`/auth/v1/user`), Format, Untergrenze (Goldzeit/2), dann `verifyRun()`.
3. Nur bei Erfolg schreibt der Worker mit `service_role` in `schraeglage_laeufe` (keine Insert-Policy für Browser) und gibt den Platz zurück.

Grenzen ehrlich benannt: Das Nachfahren beweist, dass die Zeit mit diesen Eingaben physikalisch erreichbar ist – nicht, dass ein Mensch sie gefahren hat (ein Programm wie der Lösungs-Bot könnte Eingaben erzeugen). Zusätzlich sinnvoll: Meldungen pro Konto drosseln, Zeiten deutlich unter der Bot-Bestzeit markieren, Eingaben speichern für spätere Nachprüfung. Kosten: Ein Lauf braucht ca. 0,1–1 s CPU; der kostenlose Workers-Plan erlaubt 10 ms CPU pro Anfrage, nötig ist **Workers Paid** (Standard: 30 s CPU pro Anfrage).

Zum Aktivieren (nach Freigabe): Branch `rangliste` auf den aktuellen Stand bringen, Migration + `docs/schraeglage-rangliste.sql` einspielen, Prüfdienst in `src/worker.js` einhängen, in `schraeglage.html` die beiden PlaySaal-Skripte einbinden, `saves`-Constraint und `playsaal.js` (SPIELSTAND) um `schraeglage` erweitern.

## Einbindung ins Portal

- Startseite: Kachel im Block „Hot“ an erster Stelle (2×2) und weiterhin in „Neu“, JSON-LD-Liste, Meta-Beschreibung „Zehn Browserspiele“, „Weiter spielen“ zeigt „x von 35 Level · y Gold“.
- `sitemap.xml`, `public/assets/umzug.js` (Spielstand-Umzug) und README ergänzt.
- Coverbild `public/bilder/schraeglage.jpg` (960×600, aus dem Spiel gerendert; Original 1920×1200 in `design/schraeglage/`). Kann jederzeit durch ein eigenes Motiv ersetzt werden.
- Im Spiel: „Alle Spiele“-Knopf wie bei den anderen Spielen, Vollbild (wo der Browser es kann; iPhone-Safari hat keine Vollbild-API), Farbrollen: Anthrazit-Panels, Gelb nur für Hauptaktionen, Orange für Auszeichnungen/Highlights.

## Tests

Automatisch geprüft (15.10.2026, Chromium headless über `wrangler dev`):

| Bereich | Test | Ergebnis |
|---|---|---|
| Physik | deterministische Winkelfunktionen, keine ungenauen Math-Funktionen in Physik/Level | bestanden |
| Physik | Anfahren, Bremsen, kein Kippen auf flachem Boden, kein Zittern im Stand – alle 5 Fahrzeuge | bestanden |
| Physik | Crash-Erkennung (Kopf/Dach, Absturz, Wasser, Lava), Zielzeit zwischen Takten | bestanden |
| Level | alle 35 Level mit gespeicherter Bot-Lösung im Ziel, Goldzeit erreichbar | bestanden |
| Replays | gleicher Lauf = gleiches Ergebnis bis aufs Bit; Prüfung lehnt falsche Zeit/Version/Level/Eingaben ab | bestanden |
| Awards | Bedingungen, Datum, keine Doppelvergabe, Comeback/Unkaputtbar-Sonderfälle | bestanden |
| Browser | Seite lädt ohne Fehler, SEO, Module mit JavaScript-MIME-Typ | bestanden |
| Browser | Tastatur: Gas (→/D), Bremse (←/A), Uhr startet mit erster Eingabe, R = Neustart, Esc = Pause | bestanden |
| Browser | Ziel → Award-Animation → Ergebnis; Bestzeit gespeichert; nach Neuladen Level 2 frei; Geist fährt mit | bestanden |
| Browser | Crash-Anzeige, automatischer Neustart, sofortiger Neustart, Fehlversuche gezählt | bestanden |
| Browser | Teilen: Web Share mit 1080×1080-PNG und Link; Desktop: Link kopiert + Bild-Download; „Herausforderer“-Award | bestanden |
| Browser | Herausforderungs-Link startet Level direkt, Banner „nicht verifiziert“, Sieg zählt; böse Parameter ignoriert | bestanden |
| Browser | Touch-Pedale und Bildschirmhälften, kein Scrollen, Vollbild-Knopf | bestanden |
| Browser | localStorage gesperrt: Spiel läuft ohne Fehler | bestanden |
| Browser | 320×568, 390×844, 844×390, 768×1024, 1440×900: kein Überlauf, HUD/Pedale überlappen nicht, Ergebnis erreichbar | bestanden |
| Portal | bestehende Suite `tests/playsaal.test.mjs` (23 Tests: Routen, Marke, Kacheln, Suche, Umzug, Farbrollen …) | bestanden |
| Portal | Kachel unter „Neu“, „Weiter spielen“ zeigt Fortschritt | bestanden |

**Offen (nicht ausgeführt):**
- Echte Geräte: iPhone/Safari, Android/Chrome (Touch-Gefühl, Ton nach dem ersten Tippen, Bildrate auf älteren Handys, echtes Teilen-Menü).
- Firefox und Safari: Determinismus ist durch `det.js` konstruktiv abgesichert, ein Vergleichslauf über Browser hinweg wurde aber nicht gemacht.
- Spielgefühl und Schwierigkeit durch Menschen: Lösbarkeit ist per Bot belegt, die Kurve (vor allem Level 24–35 mit Fähren, Lava und dem Gipfel-Finale) sollte probegespielt werden.
- Cloudflare-Vorschau des Branches (Build läuft erst nach dem Push).
- Konten, Ranglisten und Server-Prüfung: nur vorbereitet, nichts davon ist aktiv oder gegen Supabase getestet.

