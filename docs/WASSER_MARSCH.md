# Wasser Marsch! – Übergabenotiz

Feuerwehrspiel für Kinder ab 4, Hochformat, Finger oder Maus. 25 feste Level in 6 Szenen (Level 1–20 Leiter automatisch, Level 21–25 Leiter selbst gesteuert).
Route: `/spiele/wasser-marsch` (direkt erreichbar, `noindex`, nicht auf der Startseite und nicht in der Sitemap).

## Dateien
- `public/spiele/wasser-marsch.html` – Seite, HUD, Menüs (DOM)
- `public/spiele/wasser-marsch/engine.js` – Regeln, Gebäudeaufbau, Trefferflächen, Rettungsablauf, Spielstand (ohne DOM)
- `public/spiele/wasser-marsch/levels.js` – 25 Level; 1–20 1:1 aus `design/wasser-marsch/briefing/levels.json`, 21–25 von Hand (`"ladder":"manual"`)
- `public/spiele/wasser-marsch/game.js` – Canvas-2D-Darstellung, Eingabe, Ton (WebAudio), Menüs
- `public/spiele/wasser-marsch/img/` – WebP-Teilbilder + `manifest.json` (Kernrechteck je Bild)
- `design/wasser-marsch/` – Original-PNGs von ChatGPT, Vorschau, Briefing (unverändert)
- `tools/wasser-marsch-assets.py` – erzeugt die WebP-Teilbilder neu (`python3 tools/wasser-marsch-assets.py`, braucht Pillow + numpy)
- `tests/wasser-marsch-sim.test.mjs` – Leveldaten, Layout auf 360×640, alle Level spielbar, Rettung, Spielstand

## Bewusste Abweichungen vom Briefing
- **Speicherschlüssel `wassermarsch.v1`** statt `playsaal.wasser-marsch.v1`: Der Spielstand-Umzug (`public/assets/umzug.js`) erlaubt nur Schlüssel ohne Bindestrich, und das Präfix `playsaal.` ist dort für Umzugs-Metadaten belegt. Eingetragen in der Umzugsliste.
- **Gebäudeanordnung** (`SCENE_LAYOUT` in `engine.js`) statt der Starter-Rechtecke: Gebäude behalten ihr Seitenverhältnis und stehen auf dem Gehweg des Hintergrunds; Hochhaus-Etagen werden bei Bedarf bis 80 % gestaucht. Fenster-IDs und Zuordnungen unverändert.
- **Fensterprofile**: kleines Haus Fenster 0,15 breit bei x 0,28/0,72, y 0,50/0,75; Reihenhaus 0,20 breit bei x 0,22/0,78 (sonst überlappen die unteren Fenster die Tür); Hochhaus 0,30 breit, Mitte der jeweiligen Etage.
- **Farbvarianten** der Fassaden (Hochhaus koralle/gelb, Reihenhaus türkis/gelb) per Farbtonverschiebung aus den gelieferten Bildern, keine neuen Grafiken.
- Trefferflächen mindestens 46 CSS-px, bei engen Fenstern gewinnt der nächste Mittelpunkt.
- Wasser wird unterdrückt, solange das Ziel auf einer Katze liegt (nie auf die Katze spritzen).
- Pause per Esc-Taste und automatisch beim Tabwechsel.

## Leitersteuerung (Level 21–25)
- Nach dem Löschen eines Hauses ist dessen Katze frei; das Kind zieht den Korb (Greifkreis ≥ 56 px, auf dem Korb selbst immer) zum Fenster. Leiterwinkel und -länge folgen, der Korb bleibt waagerecht und im erreichbaren Bereich (`makeReach`/`clampTip` in `engine.js`).
- Nähe zum Fenster (Einrastradius 56–84 px) rastet ein: Korb fährt an, Katze steigt automatisch ein, Korb fährt allein zurück. Loslassen vorher: Korb bleibt stehen, jederzeit wieder greifbar, keine Strafe, kein Zeitdruck.
- Während Andocken/Einsteigen/Rückfahrt sind alle Eingaben gesperrt; die Katze zählt erst bei der Ankunft unten. Beim Ziehen kein Wasser.
- Pause, Tabwechsel, Neustart und Levelwechsel lassen den Korb los; Pause friert die Rettung ein, Neustart setzt alles zurück.
- Level 21 zeigt einen kurzen Finger-Ziehhinweis (nach Wartezeit auch später). Keine neuen Grafiken; Spielstandformat `wassermarsch.v1` unverändert (wer Level 20 geschafft hat, hat Level 21 offen).

## Teststand (19.10.2026)
- `node --test tests/wasser-marsch-sim.test.mjs` – grün
- `node tools/domain.mjs` – konsistent
- Browser (Chromium, Playwright, 360×640): alle 20 Level automatisch durchgespielt (Level 1, 7 und 20 inklusive gesperrter Katze), Loslassen stoppt Wasser sofort, Pause friert ein, Neustart während Rettung, Fortschritt nach Reload, Weiter-Button, Levelauswahl; Sichtprüfung Armanschluss, Wasserstart am Rohr, waagerechter Korb auf 360×640, 390×844, 1280×720.
- `tests/playsaal.test.mjs` (wrangler dev): 22 grün; „Stammvölker“ schlug schon vorher fehl (unabhängig von diesem Spiel).
- Nicht geprüft: echte Touch-Geräte (iOS/Android), Ton hörbar.

## Offen
- Freischaltung auf der Startseite: `noindex` entfernen, Kachel + Bild in `public/index.html`, Sitemap per `node tools/domain.mjs https://playsaal.com --umzug-aus` neu erzeugen.
- Eigenes Teilen-/OG-Bild fehlt (nutzt das PlaySaal-Standardbild).
