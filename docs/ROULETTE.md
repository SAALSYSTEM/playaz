# Roulette

Veröffentlicht am 01.11.2026. Europäisches Roulette (eine Null, 37 Zahlen) im Hochformat, klassisch edel: grüner Filz, Holzkessel, Gold. Gespielt wird nur mit **Coins ohne Geldwert** – denselben wie in Rocket Reels. Seite: `/spiele/roulette`, Kategorie „Casino“. Nicht für Kinder; PlaySaal-Empfehlung ab 18 (keine offizielle Altersfreigabe).

## Dateien

| Teil | Datei |
|---|---|
| Regeln, Wettfelder, Auszahlung, Kesselwetten (ohne DOM, ohne Importe) | `public/spiele/roulette/roulette.js` |
| Tisch: Aufteilung, Zeichnen, Antippen → Wettfeld, Jeton-Orte | `public/spiele/roulette/tisch.js` |
| Kessel und Kugelbahn | `public/spiele/roulette/kessel.js` |
| Ablauf, Dialoge, Konto | `public/spiele/roulette/game.js` |
| Ton (Web Audio, keine Dateien) | `public/spiele/roulette/ton.js` |
| Gast-Speicher / Konto-Server | `public/spiele/roulette/speicher.js` |
| Server (Konten) | Edge Function `rocket-reels` (Aktion `roulette`, Kopie von `roulette.js` per `node tools/edge-sync.mjs`) |
| Katalog | `supabase/migrations/20261101210000_roulette.sql` |
| Kachel / Teilen-Vorschau | ChatGPT-Bilder in `design/roulette/` (Prompts `PROMPTS.md`), Umwandlung `python3 tools/roulette-assets.py` |

## Regeln

- 157 Wettfelder: 37 Plein (35:1), 60 Cheval (17:1), 14 Transversalen inkl. 0/1/2 und 0/2/3 (11:1), 23 Carrés inkl. 0/1/2/3 (8:1), 11 Sixains (5:1), 3 Dutzende und 3 Kolonnen (2:1), 6 einfache Chancen (1:1). Auszahlung immer 36 ÷ Anzahl Zahlen inkl. Einsatz → **jede Wette 97,30 %** (36/37). Die Null lässt alle Wetten verlieren, die sie nicht enthalten (kein La Partage).
- Kesselwetten: Voisins du Zéro (9 Stück), Tiers (6), Orphelins (5), Jeu Zéro (4), Nachbarn (Zahl ± 2 im Kessel, 5 Plein). Sie bestehen nur aus normalen Tischfeldern.
- Tischlimit 1–500 je Feld, höchstens 5.000 je Runde, höchstens 160 Felder.
- Zufall: eine Zahl 0–36 gleichverteilt (`crypto.getRandomValues`, Ablehnungsverfahren). Die Zahl steht fest, bevor die Kugel rollt; `kessel.js plan()` berechnet nur eine Bahn, die genau in diesem Fach endet.

## Bedienung

Jeton wählen, aufs Feld tippen (beim Halten leuchtet die Wette, oben steht Name und Quote). Feldmitte = Plein, Linie = Cheval, Kreuzung = Carré, linker Zahlenrand = Transversale bzw. auf einer Linie Sixain, Linie zur Null = Wetten mit der Null. Lange drücken nimmt einen Stapel weg. Zurück, Leeren, Nochmal (letzte Einsätze; bei leerem Tisch heißt der Dreh-Knopf „Nochmal“ und setzt + dreht mit einem Tipp), Doppelt, Kessel. Tippen während die Kugel rollt = schneller.

## Gemeinsame Coins mit Rocket Reels

- Ein Stand für beide Spiele: Gast `localStorage["rocketreels-gast.v1"]`, Konto `private.rocket_konten`. Roulette legt eigene Daten nur unter `zustand.roulette` ab (`perm` = letzte 50 Zahlen, `stats`). Rocket Reels lässt diesen Teil unangetastet.
- Beide Seiten lesen vor jeder Aktion frisch (Gast) bzw. buchen über dieselbe Revision (Konto) → zwei offene Tabs buchen nie doppelt. Beim Zurückkehren in einen Tab wird der Stand neu geholt.
- Nachfüllen (unter 10 Coins auf 1.000) und Tagesbonus (+100 je Tag) sind die von Rocket Reels und gelten einmal für beide Spiele.
- Offener Rocket-Reels-Gewinn wird in Roulette angezeigt und kann dort gutgeschrieben werden; laufender Hyperjump / Freispiele verlinken zurück.
- Gast-Übernahme ins Konto (einmal je Konto) nimmt die Roulette-Statistik mit.
- Konto-Modus hängt am Schalter `rocketReels` in `playsaal-config.js` (gleicher Schalter, weil gleiche Kasse).

## Einrichtung (nur du, in dieser Reihenfolge)

1. SQL aus `supabase/migrations/20261101210000_roulette.sql` im Supabase SQL Editor ausführen (Katalog + Kategorie Casino).
2. Edge Function neu deployen (enthält jetzt `roulette.js`): `npx supabase functions deploy rocket-reels --project-ref cphwxikfrxgejiqghlwn --no-verify-jwt`.
3. Falls noch nicht geschehen (Rocket Reels): Migration `20261101200000_rocket_reels.sql` ausführen und `rocketReels: true` setzen. Bis dahin spielen alle als Gast – nichts geht verloren.

## Tests (nur dieses Spiel)

```sh
node --test tests/roulette-sim.test.mjs                               # Wettfelder, Quote 36/37 je Wette, Limits, Buchung, Server (gemeinsame Revision, Konflikt, Gast-Übernahme)
node --test --test-concurrency=1 tests/roulette-browser.test.mjs      # Layout 320–1280 px, alle 157 Felder antippbar, Setzen/Zurück/Limit, Drehen/Nochmal/Doppelt, Kesselwetten, Auffüllen, RR-Gewinn
```
Testparameter (nur mit `?test`): `folge=17,0,…` legt die nächsten Zahlen fest (Gast), `zeitlupe` zeigt Animationen in echter Geschwindigkeit.

**Nicht automatisch getestet:** echte Supabase-Antworten/Deploy, echtes Handy (Safari/iOS), Ton auf Geräten.
