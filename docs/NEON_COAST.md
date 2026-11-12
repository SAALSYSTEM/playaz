# Neon Coast – Fluchtwagen

Verfolgungsjagd von oben für Jugendliche und Erwachsene (Zielgruppe wie GTA 1/2, Smashy Road), Handy hochkant und Rechner,
`/spiele/neon-coast`. Nachts in der Stadt Neon Coast: Koffer einsammeln, der Polizei entkommen, Beute im Versteck sichern.
Kein Konto nötig, keine Gewalt gegen Menschen (Fußgänger springen immer zur Seite).

Stand 11.11.2026: veröffentlicht auf `main` (Freigabe „Push Main“ vom Auftraggeber). Katalog-Eintrag:
`supabase/migrations/20261111120000_neon_coast.sql` (führt der Auftraggeber selbst aus). Kachel und Teilen-Vorschau von ChatGPT
(vom Auftraggeber, Originale in `design/neon-coast/`, Prompts in `PROMPTS.md`).

Alle Spielgrafiken stammen aus den vorhandenen Neon-Coast-Tafeln der Sternenfahrt (`design/sternenfahrt/tafel-*.png`, ChatGPT,
vom Auftraggeber): 12 Fahrzeuge, 14 Gebäude, Palmen, Stadtmöbel, Strand, Hafen, Fußgänger, Böden. Neue Bilder waren für
das Spiel selbst nicht nötig. Das Autoradio hat zwei eigene Sender (Pixabay, eliza_music: „Golden Dreams of California“,
„California Snares and Synths“; Originale in `design/neon-coast/radio/`, mono 64 kbit/s in `public/spiele/neon-coast/radio/`);
nur das Rauschen beim Umschalten kommt aus der Sternenfahrt.

## Spielprinzip

Man fährt selbst: Gas, Bremse, Handbremse, stufenlose Lenkung. Die Kamera dreht mit der Fahrtrichtung (vorn ist immer
oben), bei Tempo zoomt sie heraus.

| Was | Wirkung |
|---|---|
| Koffer (gelb, immer 3 in der Stadt) | Grundwert 200–800 $ je nach Ort × Faktor. Faktor steigt mit jedem Koffer ohne Sichern: ×1 · ×1,5 · ×2 … höchstens ×5 |
| Fahndung ★ bis ★★★★★ | Jeder Koffer löst Alarm aus: mindestens `1 + 0,5 × (Serie − 1) + 0,25 × ⌊Koffer der Nacht / 3⌋` Sterne (höchstens 4), sonst +0,6. Bei Sichtkontakt +1 Stern je 42 s, Streifenwagen rammen +0,1, Streifenwagen Schrott +0,35 |
| Peilsender | 12 s nach jedem Koffer kennt die Polizei alle 2 s die Position; so lange läuft die Suchuhr nicht |
| Entkommen | Ohne Sichtkontakt (Gebäude und Container verdecken, Sichtweite 58 m) für `7 + 1,5 × Sterne` Sekunden: Sterne weg, Bonus `100 × Sterne²` $ |
| Versteck (grün, 3 Stück) | Aufs Tor zufahren: Beute ist sicher, Fahndung weg, Auto repariert, Serie beginnt neu. Nur ohne Sichtkontakt |
| Lack & Fix (türkis, 2 Stück) | Fahndung weg und Auto repariert, Beute und Serie bleiben im Auto. Kostet 10 % der Beute (mindestens 100 $), danach 60 s gesperrt. Nur ohne Sichtkontakt |
| Nitro | Füllt sich durch Driften, haarscharfes Überholen, Umfahren, Streifenwagen-Schrott (und langsam von selbst). Voll: 2,6 s Schub, halber Schaden, Rammen wirkt stärker |
| Haarscharf | dicht und schnell an fahrendem Verkehr vorbei ohne Berührung: +50 $ × Sterne |
| Ende der Nacht | Festnahme (unter 3 m/s neben einem Streifenwagen, ca. 2 s), Totalschaden, tiefes Wasser oder „Nacht beenden“. Gesichertes bleibt, Beute im Auto verfällt |

Polizei je Sternzahl (`POLIZEI` in `engine.js`): 2 / 3 / 4 / 6 / 8 Wagen, ab 2 Sternen auch SUVs, ab 3 Sternen kommt
Nachschub von vorn und jeder dritte Wagen setzt sich vor den Spieler und bremst. Ihr Tempo ist 86 % bis 108 % des
Spielerautos (mindestens 17–25 m/s), ohne Sichtkontakt fahren sie langsamer. Sie fahren über ein Wegefeld (Dijkstra vom
Spieler aus, alle 0,35 s, 96-m-Fenster) auch durch Hinterhöfe, Parks und über den Strand, fahren sich fest, setzen zurück,
verunglücken an Wänden und im Wasser. Nach der Jagd fahren sie als Streife im Verkehr weiter; wer eine Streife rammt
oder vor ihren Augen einen Unfall baut, hat einen Stern.

Dauerhaft: Geld (gesicherte Beute + Auftragslohn), 8 Autos (Flitzer gratis … Supersportwagen 90.000 $) mit Tempo, Antritt,
Halt und Panzer, 28 Aufträge (immer drei offen, Lohn am Ende der Nacht), 6 Ränge nach insgesamt gesicherter Beute,
Rekord (beste Nacht) mit Herausforderung per Link `?r=Betrag`.

## Steuerung

Seit 12.11.2026 für Erwachsene ausgelegt (Wunsch des Auftraggebers: „muss nicht für Kinder sein“) – kein Auto-Gas mehr.

- Handy: links die **Lenkleiste** (stufenlos: Ruhezone in der Mitte, je weiter außen der Daumen, desto stärker; gilt für
  die ganze linke untere Bildhälfte). Rechts die Pedale: **Gas** (groß, unten rechts), **Bremse** daneben (im Stand:
  rückwärts), **Handbremse** über dem Gas, **Nitro** über der Bremse. Ein Daumen darf von Pedal zu Pedal rutschen
  (Gas → Handbremse → Gas für die Kehre); gewertet wird das Pedal unter dem Finger, sonst das nächste in 64 px.
- Rechner: W/↑ Gas, S/↓ Bremse und rückwärts, A D/← → lenken, Leertaste Handbremse, Shift (oder N, X) Nitro, Esc Pause.
  Ganze Fensterbreite; von den Bedienelementen bleibt nur die Nitro-Anzeige.
- Vom Gas gehen bremst mit dem Motor (ca. 3,4 m/s²). Nitro schiebt 2,6 s von selbst, auch wenn der Daumen nicht auf dem
  Gas ist. Die Welt wartet am Start und nach Versteck/Werkstatt auf die erste Eingabe. Pause auch bei Tab-Wechsel.

## Stadt

Feste Insel 760 × 780 m aus Regeln (`welt.js`, immer gleich): 7 × 8 Straßen (drei breite Alleen), 42 Blöcke –
Palmenhügel (Wohnhäuser, Gärten), Neonstadt (Läden, Clubs, Hotels, Park, Platz, Polizeiwache, Tankstellen), Hafen
(Hallen, Container, Kai, zwei Piers), Strandmeile mit Strand und zwei Stegen. Nord- und Westufer haben Leitplanken,
Hafenkante, Piers, Stege und Strand sind offen (Wasser!). Koffer an Pier und Kai sind am wertvollsten und am riskantesten.
Bodenraster 2 m für Untergrund (Sand und Gras bremsen), Sicht und Wege; Gebäudeflächen aus der Bildform (`bilder.js`).

## Technik

- `engine.js` – Regeln ohne DOM, feste Schritte 1/60 s. Alle Autos sind Körper mit derselben Fahrphysik (Längs-/Querkraft,
  Reifenhalt, Handbremse, Untergrund), drei Kreise je Auto für Stöße (Masse, Drehimpuls, Schaden). Fahrer: Spieler,
  Polizei, Verkehr (folgt Spuren, eine Kreuzung nach der anderen), niemand. Prüf-Fahrer `botEingabe` für Tests.
- `zeichner.js` – Canvas 2D: Bodenflächen als Muster, Markierungen, Dinge in drei Ebenen, Autos (zwischen den Schritten
  interpoliert), Gebäude, Teilchen, Bremsspuren; Nacht als Lichtkarte in Viertel-Auflösung (multipliziert), darüber alles,
  was leuchtet (Neon, Scheinwerfer, Blaulicht). Bildschirm-Ebene: Koffer, Schilder, Wegweiser am Rand, Radar, Stadtplan.
  Fußgänger sind nur Stimmung (laufen auf Gehwegen, springen vor Autos weg).
- `ton.js` – Motor, Reifen, Sirene und Effekte über WebAudio erzeugt; Autoradio wie in der Sternenfahrt (Senderwechsel mit Rauschen).
- `game.js` – Schleife, Steuerung, HUD, Menüs, Abrechnung, Teilen, Spielstand `neoncoast.v1`.
- `daten.js` – Autos, Aufträge, Ränge, Abrechnung, Spielstand-Prüfung. `welt.js` – Stadt. `bilder.js` – erzeugt.
- `tools/neon-coast-assets.py` – schneidet die Motive aus den Tafeln (`--preview` schreibt ein Kontrollbild) und wandelt
  `design/neon-coast/kachel.png` / `social-preview.png` in `public/bilder/neon-coast.webp` / `neon-coast-og.jpg`.
- Bei dauerhaft langsamen Bildern (über 27 ms) zeichnet das Spiel mit weniger Bildpunkten (Schärfe 2 → 1,5 → 1).

## Tests

```sh
node --test tests/neon-coast-sim.test.mjs
node --test --test-concurrency=1 tests/neon-coast-browser.test.mjs
```

Simulation: Stadt (alle Koffer-Orte und Einfahrten erreichbar), Fahrphysik aller 8 Autos, Koffer/Faktor, Peilsender und
Entkommen, Festnahme eines stehenden Wagens, Versteck/Werkstatt, Wasser/Totalschaden/Feierabend, sechs Nächte mit dem
Prüf-Fahrer (keine Rechenfehler, Verkehr fließt, gleiche Nacht läuft gleich ab), Aufträge, Abrechnung, Kauf, Spielstand.
Browser (Chromium, 320×568 bis 412×915 und 1280×720): lädt ohne Fehler, Finger- und Tastensteuerung, HUD, Nitro, Pause
mit Stadtplan, Abrechnung und Speichern, Garage, Platz der Bedienelemente.

## Offen

- Nicht geprüft: echte Handys (Bildrate, Daumenwege), Ton und Radio hörbar. Die Balance (Schaden, Polizei-Tempo, Preise)
  ist nur mit dem Prüf-Fahrer und nach Zahlen eingestellt – nach den ersten echten Nächten nachstellen.
- Mögliche Ausbaustufen: Straßensperren ab 3 Sternen, Hubschrauber bei 5 Sternen, Tagesnacht mit geprüfter Rangliste
  (bräuchte Edge Function und SQL), weitere Radiosender, weitere Stadtteile.
