# Rocket Reels – Mission Jackpot

Veröffentlicht am 01.11.2026. Weltraum-Arcade mit 5 Walzen × 3 Symbolen, 10 festen Gewinnlinien, Stargate (Wild + Scatter), Freispielen „Rocket Launch“ mit Spezial-Symbol und optionalem Risiko-Spiel „Hyperjump“. Gespielt wird nur mit **Space Coins ohne Geldwert** (kein Kauf, keine Auszahlung, keine Preise). Seite: `/spiele/rocket-reels`. Nicht für Kinder; PlaySaal-Empfehlung ab 18 (keine offizielle Altersfreigabe).

Spielmechanisch orientiert am bekannten Prinzip „Walzen + Buch-Freispiele + Risiko-Leiter“, aber mit eigener Optik, eigenen Symbolen, eigener Oberfläche und eigener Mathematik.

## Dateien

| Teil | Datei |
|---|---|
| Regeln, Auszahlungstabelle, Walzenbänder, Coin-Buchhaltung (ohne DOM) | `public/spiele/rocket-reels/engine.js` |
| Ablauf, Walzen-Canvas, Rocket Launch, Hyperjump, Dialoge | `public/spiele/rocket-reels/game.js` |
| Platzhalter-Symbole, Bilder laden, Sternenhimmel, Rakete | `public/spiele/rocket-reels/grafik.js` |
| Soundeffekte (Web Audio) und Musik | `public/spiele/rocket-reels/ton.js` |
| Gast-Speicher / Konto-Server | `public/spiele/rocket-reels/speicher.js` |
| Server (Konten) | `supabase/functions/rocket-reels/` (Kopie von `engine.js` per `node tools/edge-sync.mjs`) |
| Datenbank | `supabase/migrations/20261101200000_rocket_reels.sql` |
| Mathe (exakt) | `node tools/rocket-reels-mathe.mjs` |
| Bilder | Prompts `design/rocket-reels/PROMPTS.md`, Umwandlung `python3 tools/rocket-reels-assets.py` |

## Regeln und Mathematik

- Einsatz 10/20/50/100 Coins = Gesamteinsatz; Linieneinsatz = Einsatz ÷ 10. Auszahlungen als Vielfaches des Linieneinsatzes (`AUSZAHLUNG` in `engine.js`), Scatter als Vielfaches des Gesamteinsatzes (`SCATTER`).
- Linien von links, ohne Lücke, Stargate ersetzt; je Linie ein Treffer; alles wird addiert. 5 Stargates auf einer Linie zahlen nur als Scatter.
- 3+ Stargates irgendwo: 10 Freispiele, Gewinn der auslösenden Runde sofort gutgeschrieben (nicht riskierbar). Spezial-Symbol = zufällig eines der 12 regulären Symbole. Liegt es in einem Freispiel auf ≥ 3 Walzen (beliebige), füllt es diese und zahlt **zusätzlich** auf allen 10 Linien den Tabellenwert für die Anzahl gefüllter Walzen. Wiederauslösung +10, höchstens 50 Freispiele. Bonusgewinn wird am Ende einmal gutgeschrieben.
- Zufall: jede Walze stoppt auf einer gleichverteilten Bandposition (`crypto.getRandomValues`, Ablehnungsverfahren ohne Modulo-Verzerrung). Keine Gewichtung nach Spielverlauf, keine Beinahe-Treffer, keine Spannungs-Verzögerung bei 2 Stargates.
- Exakte Werte (`node tools/rocket-reels-mathe.mjs`): Linien 54,3 %, Scatter 3,4 %, Freispiele 1 zu 97 Runden, Ø 11,1 Freispiele und Ø 36,5 × Einsatz je Bonus (37,5 % Anteil) → **Auszahlungsquote 95,13 %** (`QUOTE` in `engine.js`, im Test gegen die Rechnung geprüft). Trefferquote (irgendein Gewinn) ca. 21 %.
- Hyperjump: nur nach normalem Gewinn, genau 50 % je Sprung (ein Zufallsbit), Erfolg verdoppelt, Verlust kostet nur den offenen Gewinn. Höchstens 4 Sprünge, ein Sprung nur, solange das Doppelte ≤ 20.000 ist (sonst automatisch gesichert). Quote unverändert (neutral).
- Coins: Start 1.000, gratis Nachtanken auf 1.000, sobald kein Einsatz mehr möglich ist (ohne Werbung, ohne Konto), Tagesbonus +100 je Berliner Kalendertag.
- Walzenbänder neu abstimmen: Anzahl je Symbol in `ANZAHL` (Tool) ändern, `node tools/rocket-reels-mathe.mjs --bauen <seed>` → `WALZEN` in `engine.js` ersetzen, `QUOTE` anpassen, `node tools/edge-sync.mjs`, Tests laufen lassen.

## Speichern

- **Gast:** Stand in `localStorage["rocketreels-gast.v1"]` (Regeln laufen im Browser, Ergebnis wird vor der Animation gespeichert → Neuladen während Walzen/Risiko/Freispielen setzt korrekt fort). Alle Schlüssel beginnen mit `rocketreels-` (Bindestrich), damit der allgemeine PlaySaal-Sync sie **nicht** ins Konto hochlädt – der wäre vom Browser frei beschreibbar.
- **Konto:** Regeln laufen in der Edge Function mit Krypto-Zufall; der Browser schickt nur Aktionen (`dreh` + Einsatz, `sichern`, `risiko`, `sprung` + Route …). Stand in `private.rocket_konten` (für Browser unsichtbar), Speichern nur mit passender Revision → zwei Tabs/Doppeltipp buchen nie doppelt. Statistik (Runden, Einsätze, Gewinne, Höchstgewinn, Freispiele, Hyperjumps, Nachtanken) steht im selben Stand.
- **Gast-Übernahme:** beim ersten Spielen mit Konto einmalig angeboten. Übernommen wird der höhere Kontostand (höchstens 25.000, Gast-Coins sind nicht prüfbar) plus Statistik; nie addiert, danach `gastUebernommen = true`.
- **Keine gemeinsame PlaySaal-Währung:** Space Coins gelten nur in Rocket Reels.
- Konto-Hinweis für Gäste: nach 10 Runden bzw. erstem großen Gewinn (≥ 20× Einsatz) / neuem Rekord, höchstens 2 je Sitzung, nach „Als Gast weiterspielen“ 24 h Ruhe, nie während Walzen, Freispielen oder Risiko.

## Einrichtung (nur du, in dieser Reihenfolge)

1. SQL aus `supabase/migrations/20261101200000_rocket_reels.sql` im Supabase SQL Editor ausführen (legt Kategorie „Arcade“, Katalogeintrag, Tabelle und zwei Funktionen an; ändert nichts Bestehendes).
2. Edge Function deployen: `npx supabase functions deploy rocket-reels --project-ref cphwxikfrxgejiqghlwn --no-verify-jwt` (die Sitzung prüft `handler.js` selbst).
3. In `public/assets/playsaal-config.js` `rocketReels: true` setzen. Ohne diesen Schalter spielen auch Angemeldete als Gast (nichts geht verloren, Übernahme später möglich).

Kosten/Grenzen: Jede Aktion eines angemeldeten Spielers ist ein Aufruf der Edge Function (Supabase Free: 500.000 Aufrufe/Monat; ca. 1 Aufruf je Dreh/Freispiel/Sprung). Bei viel Verkehr im Dashboard beobachten. Gäste verursachen keine Aufrufe.

## Sound

Alle Effekte entstehen live mit der **Web Audio API** – keine Dateien, keine Lizenzfrage, zusammen < 4 KB Code. Musik und Effekte getrennt schaltbar, Lautstärke, alles gespeichert (`rocketreels-ton`), nichts vor der ersten Berührung, Pause bei verstecktem Tab.

| Ereignis | Funktion | Länge | Klang | Nötig? |
|---|---|---|---|---|
| Walzen starten | `spin` | 0,35 s | Rausch-Sweep nach oben + steigender Ton | ja |
| Walze stoppt | `stopp` | 0,05 s | kurzer Klick, je Walze etwas tiefer | ja |
| Kleiner Gewinn | `klein` | 0,3 s | drei helle Pings | ja |
| Großer Gewinn (≥ 15× Einsatz) | `gross` | 1,4 s | aufsteigende Synth-Fanfare | ja |
| Stargate (≥ 3) | `stargate` | 1,1 s | tiefes Brummen + Energie-Rauschen | ja |
| Raketenstart / Rückflug | `start` | 1,6 s | Triebwerks-Rauschen, tiefer Sägezahn | ja |
| Spezial dehnt sich / Hyperjump Erfolg | `warp` | 0,8 s | Sweep nach oben + Erfolgston | ja |
| Hyperjump verloren | `verloren` | 0,6 s | dumpfer Abbruch | ja |
| Gewinn sichern / Tagesbonus | `sichern` | 0,3 s | zwei Bestätigungstöne | ja |
| Freispiele | Musik | Schleife | ruhige Synth-Fläche (Am–F–C–G), live erzeugt | ja (erzeugt) |
| Grundspiel | Musik | Schleife | – | optional |

**Optional eigene Musik** (z. B. von Pixabay, Lizenz erlaubt Nutzung in Spielen ohne Namensnennung – vor dem Einbau die Lizenzseite des Titels prüfen): `design/rocket-reels/ton/freispiele.mp3` und/oder `design/rocket-reels/ton/musik.mp3` ablegen, `python3 tools/rocket-reels-assets.py` ausführen. Empfehlung: 64–96 kbit/s, 60–120 s, nahtlose Schleife. Pixabay-Suchbegriffe: „space ambient loop“, „synthwave space“, „cosmic arcade“. Prompt für einen KI-Musikgenerator: *„Ruhiger, epischer Weltraum-Synthwave-Loop, 100 BPM, warme analoge Pads, sanfter Arpeggiator, leichte Glockenakzente, kein Gesang, kein Schlagzeug-Drop, nahtlos loopbar, 90 Sekunden.“*

## Bilder

Prompts und priorisierte Liste: `design/rocket-reels/PROMPTS.md`. Alle Bilder von ChatGPT sind geliefert (Originale in `design/rocket-reels/`, WebP per `python3 tools/rocket-reels-assets.py`). Fehlt ein Bild, zeichnet das Spiel einen Vektor-Platzhalter. Die Teilen-Vorschau ist aus der Kachel plus Schriftzug zusammengesetzt (`social.png` würde sie ersetzen). Die Hyperjump-Stationen liegen genau auf den Ringen von `risiko-hintergrund` (Bildkoordinaten `RINGE` in `game.js`) – bei einem neuen Bild dort anpassen. Der Walzenrahmen wird per `mix-blend-mode: screen` über die Walzen gelegt – Schwarz im Bild wird dadurch durchsichtig.

## Tests (nur dieses Spiel)

```sh
node --test tests/rocket-reels-sim.test.mjs      # Regeln, 10 Linien, Wild/Scatter, Freispiele, Spezial, Hyperjump 50 %, Buchhaltung, Quote exakt vs. Simulation
node --test tests/rocket-reels-konto.test.mjs    # Edge Function: Anmeldung, Server rechnet selbst, Konflikte, Gast-Übernahme, CORS
PGLITE_PATH=… node --test tests/rocket-reels-db.test.mjs   # Migration: Rechte, Revisionen, Grenzen, Kontolöschung (PGlite)
node --test --test-concurrency=1 tests/rocket-reels-browser.test.mjs   # Layout 320–1280 px, Doppeltipp, Sichern, Hyperjump, Freispiele, Tanken, Übersicht, Konto, Hinweise
```
Testparameter (nur mit `?test`): `seed=<Zahl>` und `folge=<Werte>` ersetzen den Zufall im Gast-Modus, `zeitlupe` zeigt Animationen in normaler Geschwindigkeit.

**Nicht automatisch getestet:** echte Supabase-Antworten und Deploy der Function, echtes Handy (Safari/iOS), Ton auf Geräten.
