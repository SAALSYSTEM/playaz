# Neon Coast – Sternenfahrt – Übergabenotiz

Autospiel für Kinder ab 5, Handy hochkant, Draufsicht. 20 feste Level. Route: `/spiele/sternenfahrt`
(„Neon Coast“ bleibt als Adresse frei für ein späteres großes Spiel). Grafiken: Motive aus den Neon-Coast-Tafeln
(ChatGPT), Kachel und Teilen-Vorschau von ChatGPT, Radio-Lieder von Pixabay – alles vom Auftraggeber.

## Spielprinzip
Das Auto fährt von selbst nach oben, die Straße hat 3 Spuren. Nur zwei Tasten: links / rechts (auch Pfeiltasten oder A/D).
Alternativ auf der Straße wischen: eine Wischbewegung = genau eine Spur (ab ca. 6 % der Breite seitlich, waagerecht überwiegend; Antippen und senkrechtes Wischen lenken nicht).
- Ein Druck = genau eine Spur (sanft, 0,3 s). Gedrückthalten und Tastenwiederholung lösen nichts weiter aus.
  Beide Pfeile zugleich heben sich auf. Zwei schnelle Drücke = zwei Spuren. Am Rand: kleines „Tock“, sonst nichts.
- Sterne sammeln. Hindernisse: Leitkegel (gezeichnet), Bake, Absperrung, langsame Autos (fahren mit 40 % Tempo mit).
- Berührung = „Hoppla!“: Auto wackelt, kurz langsamer (45 %, in 1,4 s wieder normal), 2,2 s Schutzzeit (blinkt),
  das Hindernis kippt zur Seite. Sterne bleiben. Kein Game-over, jedes Level endet im Ziel.
- Auszeichnung: ≥ 90 % der Sterne → 3, ≥ 60 % → 2, sonst 1. Jeder Abschluss schaltet das nächste Level frei.
- Autos: Türkis-Flitzer (Start), Pinke Rakete (nach Level 3), Orange Blitz (nach Level 6), Lila Limousine (nach 12), Sonnen-Taxi (nach 16). Alle fahren gleich.
- Level 1 (bis es einmal geschafft ist): Übung – erst links, dann rechts (blinkende Taste, tippender Finger, Pfeil auf der Straße,
  Übungssterne); das eigentliche Level beginnt erst danach. Hindernisse kommen erst nach der Sternen-Übungsphase.
- Welten: Stadt (1–3), Strandpromenade (4–7), Hafen (8–10); Teil 2 dieselben Welten bei Nacht (11–13 Neonstadt, 18–20 Hafen: dunkel, Laternen,
  leuchtende Neon-Bordsteine, Scheinwerfer, Rücklichter) und im Abendrot (14–17). Licht nur gezeichnet (`licht` in `levels.js`), Hindernisse und Sterne
  bleiben voll hell. Fußgänger laufen nur auf dem Gehweg (Deko).
- Handy-Symbol oben = Pause-Menü: Weiterfahren, Level, Autos, Ton, Startseite (PlaySaal). Pause auch bei Tab-Wechsel/Fokusverlust.
- Autoradio: zufälliger Sender, nach 45–90 s (oder am Liedende) kurz Rauschen und ein anderer Sender, mitten im Lied.
  Startet bei der ersten Berührung und läuft dann immer weiter (Fahrt, Menü, Pause, nach dem Level); still nur bei Ton aus oder Tab im Hintergrund. Folgt dem Ton-Knopf (über WebAudio, damit die Lautstärke auch auf dem iPhone gilt).
- Teilen: `?l=Level` lädt zu diesem Level ein (schaltet nichts außer der Reihe frei).

## Fairness
Die Kamera zeigt immer 7 bis 11 Spurbreiten vor dem Auto (Maßstab passt sich an). Der Test lässt einen Prüf-Fahrer alle
20 Level fahren: Er sieht Objekte erst bei 7 Spurbreiten, reagiert nach 1,0 bzw. 1,4 s, drückt höchstens alle 0,25 s und
braucht die echte Spurwechsel-Dauer – er darf nirgends anstoßen (bestanden) und erreicht ≥ 85 % der Sterne.
Rechnung in festen Schritten (1/120 s), damit 30, 60 und 144 Hz gleich laufen; nach Rucklern höchstens 0,25 s nachholen.

## Level
Aus Bausteinen in `levels.js` (Zeilen wie auf dem Bildschirm, `seq` = Fahrtreihenfolge). Dauer 59–74 s, Tempo 2,2 → 3,4 Spurbreiten/s,
Teil 2 (11–20) 3,0 → 3,6 mit neuen Bausteinen: Slalom, Doppel-Hütchen, Sternengasse (Sterne durch die Lücke zwischen zwei Absperrungen).
1–3 je ein Hindernis pro Zeile, ohne Autos; ab 4 langsame Autos; ab 5 Lücken (zwei Spuren zu); 7–10 mehr Abwechslung, schneller.

## Dateien
- `public/spiele/sternenfahrt.html` – Seite, HUD (Fortschritt, Sterne, Handy), Lenktasten, Menüs (DOM)
- `public/spiele/sternenfahrt/engine.js` – Fahrt, Spurwechsel, Kollisionen, Übung, Auszeichnung, Spielstand, Prüf-Fahrer (ohne DOM)
- `public/spiele/sternenfahrt/levels.js` – Bausteine und 10 Level
- `public/spiele/sternenfahrt/game.js` – Canvas-2D-Zeichnung, Landschaft, Fußgänger, Effekte, Ton, Radio, Menüs
- `public/spiele/sternenfahrt/img/` – freigestellte Motive (WebP) + `manifest.json`; `radio/` – 4 Sender + Rauschen (mono, 64 kbit/s)
- `design/sternenfahrt/` – Tafeln, Kachel, Teilen-Vorschau, `radio/` (Originale); `tools/sternenfahrt-assets.py` erzeugt alles neu
  (Freistellen vom Navy-Hintergrund, `--preview` schreibt ein Kontrollbild)
- `public/bilder/sternenfahrt.webp` (Kachel), `public/bilder/sternenfahrt-og.jpg` (Teilen-Vorschau)
- `tests/sternenfahrt-sim.test.mjs` – Level, Lernkurve, freie Spur, Prüf-Fahrer, kein Game-over, Steuerung, Schutzzeit, Bildraten, Übung, Spielstand
- `supabase/migrations/20261031120000_sternenfahrt.sql` – Katalog-Eintrag (Cloud-Spielstände)

Speicherschlüssel `sternenfahrt.v1` (in `public/assets/umzug.js` und `playsaal-config.js` eingetragen). Startseite: Kachel vorn unter „Neu“, Sitemap.

## Offen
- Nicht geprüft: echte Touch-Geräte, Ton/Radio hörbar (im Headless-Browser mit Touch-Emulation 320×568 bis 412×915 gespielt).
