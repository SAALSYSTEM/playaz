# Texas Hold'em

Veröffentlicht am 02.11.2026. No Limit Texas Hold'em am 6er-Tisch gegen fünf Computergegner, Hochformat, klassisch wie Roulette (grüner Filz, Holz, Gold). Cash-Game und Sit & Go. Gespielt wird mit den **Casino-Coins** – denselben wie in Roulette und Rocket Reels. Seite: `/spiele/texas-holdem`, Kategorie „Casino“. Nicht für Kinder; PlaySaal-Empfehlung ab 18 (keine offizielle Altersfreigabe).

## Dateien

| Teil | Datei |
|---|---|
| Regeln, Handbewertung, Side-Pots, Computergegner, Ansicht (ohne DOM, ohne Importe) | `public/spiele/texas-holdem/poker.js` |
| Lobby, Tisch, Ereignisse abspielen, Raise-Regler, Konto | `public/spiele/texas-holdem/game.js` |
| Gast-Speicher / Konto-Server | `public/spiele/texas-holdem/speicher.js` |
| Ton (Web Audio, keine Dateien) | `public/spiele/texas-holdem/ton.js` |
| Server (Konten) | Edge Function `rocket-reels` (Aktion `poker`, Kopie von `poker.js` per `node tools/edge-sync.mjs`) |
| Katalog | `supabase/migrations/20261101230000_texas_holdem.sql` |
| Bilder | ChatGPT-Porträts, Kachel und Teilen-Bild in `design/texas-holdem/` (Prompts `PROMPTS.md`), Umwandlung `python3 tools/texas-holdem-assets.py` (Avatare aufs Gesicht gezoomt) |

## Regeln

- 6 Plätze, Dealer-Knopf wandert, Small/Big Blind (heads-up: Dealer = Small Blind). Vier Setzrunden, No Limit: Mindesterhöhung = letzte Erhöhung, All-in geht immer. Ein All-in unter der Mindesterhöhung öffnet die Runde nicht neu.
- Showdown mit Side-Pots (je Einsatzstufe ein Topf, nur wer so viel gesetzt hat, kann ihn gewinnen), Split-Pots mit Rest-Chip an den ersten Gewinner links vom Dealer. Wer gepasst hat, zeigt nichts.
- **Cash-Game:** Kleiner (5/10, Buy-in 200–1.000), Mittlerer (25/50, 1.000–5.000), Hoher Tisch (100/200, 4.000–20.000). Buy-in wird vom Guthaben abgebucht, Aufstehen bucht die Chips zurück. Nachkaufen zwischen den Händen bis zum Maximum. Pleite Computergegner kaufen sofort neu ein.
- **Sit & Go:** Buy-in 100/500/2.000, alle 1.500 Chips, Blinds steigen alle 6 Hände (10/20 → … → 2.000/4.000). Platz 1 = 4× Buy-in, Platz 2 = 2× Buy-in (zusammen genau die 6 Buy-ins). Wer ausscheidet oder aufgibt, bekommt sofort seinen Platz.
- **Gratis-Auffüllen (Rocket Reels) ist gesperrt, solange ein Tisch offen ist** – sonst könnte man alle Coins an den Tisch legen und unbegrenzt nachfüllen (`darfNachfuellen` in `rocket-reels/engine.js`).

## Computergegner

| Gegner | Stil | VPIP (Simulation) |
|---|---|---|
| Kalle | Gemütlich – geht fast immer mit | ca. 65 % |
| Vera | Kühl – spielt wenig, aber hart | ca. 20 % |
| Bruno | Bluffer – setzt gern unter Druck | ca. 60 % |
| Oma Hilde | Der Fels – wartet auf Asse | ca. 7 % |
| Prof. Lindqvist | Rechner – solide und schwer zu lesen | ca. 33 % |

Vor dem Flop: Chen-Formel mit Stil-Schwellen (`open`, `raise`, `zaeh`). Nach dem Flop: Gewinnchance per Simulation (90 Durchläufe) **nur aus eigenen Karten und Board** gegen die Zahl der Gegner, verglichen mit den Pot-Odds; dazu Bluff-Neigung. Die Gegner sehen fremde Karten nie. Werte in `BOTS` in `poker.js`.

## Speichern und Sicherheit

- Stand unter `zustand.poker` im gemeinsamen Casino-Stand (`v`, `stats`, `t` = offener Tisch inkl. Kartenstapel). Größe < 2 KB (Test prüft < 7,5 KB für den ganzen Stand, Grenze der Datenbank 8 KB).
- **Konto:** Der Server mischt (Krypto-Zufall), spielt alle Computerzüge und speichert nur bei unveränderter Revision. Jede Antwort der Function geht durch `ansicht()`: kein Kartenstapel, verdeckte Gegnerkarten als `[-1, -1]`. Auch Antworten auf Roulette/Rocket-Reels-Aktionen werden gefiltert.
- **Gast:** Regeln laufen im Browser; die Oberfläche bekommt ebenfalls nur die Ansicht.
- Eine Aktion = eine Anfrage (Spielerzug + alle Computerzüge bis zum nächsten eigenen Zug). Die Oberfläche spielt die Ereignisliste (`neu`, `akt`, `strasse`, `zeigen`, `pot`, `raus`, `level`, `nachkauf`, `sngEnde`, `aufstehen`) nacheinander ab; Tippen auf den Tisch beschleunigt.

## Einrichtung (nur du, in dieser Reihenfolge)

1. SQL aus `supabase/migrations/20261101230000_texas_holdem.sql` im Supabase SQL Editor ausführen (nur Katalogeintrag).
2. Edge Function `rocket-reels` neu deployen (enthält jetzt `poker.js` und das geänderte `engine.js`).
3. Schalter `rocketReels` in `playsaal-config.js` ist bereits `true`.

## Tests (nur dieses Spiel)

```sh
node --test tests/texas-holdem-sim.test.mjs                              # Handbewertung, Side-/Split-Pots, 1.500 Zufallszüge mit Chip-Erhaltung, Sit & Go bis zum Ende, Gegnerstile, Ansicht, Server
node --test --test-concurrency=1 tests/texas-holdem-browser.test.mjs     # Layout 320–1280 px, Cash-Game über Knöpfe + Raise-Regler, keine Gegnerkarten im DOM, Sit & Go, Nachkaufen, Lobby
```
Testparameter (nur mit `?test`, Gast): `seed=<Zahl>` macht Mischen und Gegner reproduzierbar, `zeitlupe` zeigt Animationen in echter Geschwindigkeit.

**Nicht automatisch getestet:** echte Supabase-Antworten/Deploy, echtes Handy (Safari/iOS), Ton auf Geräten.
