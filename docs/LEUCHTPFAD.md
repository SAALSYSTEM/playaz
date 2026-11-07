# Leuchtpfad

Merkspiel („Memory Path“) für Kinder ab 4 im Hochformat. Glühwürmchen **Lumi** fliegt einen leuchtenden Weg über Trittsteine
bis zum Pilzhaus, danach gehen die Lichter aus und das Kind läuft den Weg aus dem Gedächtnis nach – Steine antippen oder mit
dem Finger darüberziehen. Trainiert räumliches Arbeitsgedächtnis und Konzentration. Veröffentlicht am 07.11.2026 (`/spiele/leuchtpfad`).

## Regeln
- Nachlaufen nur waagrecht/senkrecht, Stein für Stein. Kein Zeitdruck beim Nachlaufen.
- Falscher Stein: „Hoppla!“, Lumi fliegt zum Start zurück und zeigt den Weg noch einmal (kein Game-over).
- Auge-Knopf „Nochmal zeigen“ jederzeit; nach 7 s ohne Tippen blinkt er.
- Sterne: ohne Fehler und ohne Nochmal-Zeigen 3, mit einem davon 2, sonst 1.
- Jeder Stein hat seinen eigenen Ton (Pentatonik) – die Melodie hilft beim Merken.

## Level (30, `public/spiele/leuchtpfad/levels.js`)
| Welt | Level | Neu |
|---|---|---|
| Blumenwiese | 1–10 | 3×4 bis 4×5 Steine, Wege mit 3–6 Steinen, alles leuchtet lange |
| Zauberwald | 11–20 | größere Felder, bis 8 Steine; ab 16 verblasst die Spur hinter Lumi (nur die letzten 3 Steine leuchten) |
| Mondsee | 21–30 | blaue Irrlichter als falsche Abzweigungen; ab 26 zusätzlich verblassende Spur; bis 12 Steine |

Die Wege entstehen aus einem festen Startwert je Level (`engine.js`, `brett()`), sind also überall gleich. Jeder Weg beginnt in
der untersten Reihe, endet weiter oben, hat genug Knicke und berührt sich nie selbst (eindeutig erkennbar). Irrlichter liegen
direkt neben dem Weg, nie neben dem Start und nie nebeneinander.

## Rekordpfad
Endlos: jede Runde ein Stein mehr (ab 3, Feld 5×7, Wege bis 22 Steine, danach nur noch schneller), 3 Leben. Rekord = längster
geschaffter Weg, Herausforderung per Link `?r=Steine`.

## Spielstand, Links
`leuchtpfad.v1` = `{ v, unlocked, best: {Level: Sterne}, rekord, mute }`. Einladung `?l=Level` (schaltet nichts frei),
Direktstart `?level=n` für offene Level. Konto-Hinweis ab 2 geschafften Leveln (wie die anderen Kinderspiele).

## Grafik
Alles im Spiel wird gezeichnet (Steine, Leuchten, Lumi, Pilzhaus, drei Hintergründe). Optional ersetzen ChatGPT-Bilder einzelne
Teile: als WebP in `public/spiele/leuchtpfad/img/` ablegen und den Namen in `img/manifest.json` eintragen –
`welt-1`, `welt-2`, `welt-3` (Hintergründe, Hochformat), `lumi` (Glühwürmchen, transparent, schaut nach rechts), `pilzhaus` (transparent).
Startseiten-Kachel und Teilen-Vorschau: `node tools/leuchtpfad-cover.mjs` (nimmt `design/leuchtpfad/lp-kachel.gif` bzw. `.png` und
`lp-social.png`, sonst gezeichnete Fassung). Prompts: [`design/leuchtpfad/PROMPTS.md`](../design/leuchtpfad/PROMPTS.md).

## Tests
`node --test tests/leuchtpfad-sim.test.mjs && node --test --test-concurrency=1 tests/leuchtpfad-browser.test.mjs`
