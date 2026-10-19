# Dino-Leiterhelden – Grafikpaket

Die PNGs haben einen echten Alphakanal. Die JPGs sind deckende Hintergrundbilder.
Alle Maße entsprechen dem Grafikbriefing; die Quelldateien sind für die spätere
WebP-Konvertierung gedacht. Es wurden keine Spielassets unter `public/` geändert.

## Sprites

- `dino-held.png`: 8 Spalten × 2 Reihen, 256 × 256 je Feld. Oben: Stehen 0–1,
  Laufen 2–7. Unten: Klettern 0–3, Jubeln 4–5, benommen 6, Tragen 7.
- `freund-tuerkis.png`, `freund-rosa.png`, `freund-gelb.png`: 4 × 2,
  256 × 256 je Feld. Oben: Rufen 0–1, Laufen 2–3. Unten: Klettern 0–1,
  Jubeln 2–3.
- `schlafmonster.png`: 4 × 1, 384 × 256 je Feld: schlafen A/B,
  wach, Frucht essen. Das Monster blickt wie bestellt nach links.
- `hebel.png`: 2 × 1, 128 × 128: aus, an.
- `tuer.png`: 2 × 1, 160 × 224: geschlossen, offen.
- `effekte.png`: 4 × 1, 128 × 128: Staub, Sterne, Herz, Glitzer.
- `icons.png`: 8 × 1, 128 × 128: Pause, Neustart, Ton an, Ton aus,
  Uhr, Teilen, Weiter, Levelraster.

Bei allen Dino-Feldern liegt der tiefste sichtbare Pixel auf derselben Linie,
16 Pixel über dem unteren Zellrand (Alpha-Schwelle 64). Die Figuren stehen
horizontal mittig; rechts gerichtete Ansichten werden im Spiel gespiegelt.

`plattform.png` und `gelaender.png` sind horizontal, `leiter.png` vertikal
kachelbar. Ihre jeweils gegenüberliegenden äußeren Pixelreihen stimmen überein.
`plattform-ende.png` ist das linke Ende; das rechte wird im Spiel gespiegelt.

Die drei Hintergründe zeigen dieselbe Szene bei Tag, am Nachmittag und am
Abend. Die gezeichneten Animationsposen sind für die technische Umsetzung
vorbereitet; Bewegungen und Größen im fertigen Spiel auf dem Telefon prüfen.

## Level 31–60

- `rutsche.png`: 1 Bild, 360 × 293, oben links Einstieg, unten rechts Ausstieg; im Spiel für Rutschen
  nach links gespiegelt.
- `bruecke.png`: 1 Bild, 384 × 115, Baumstamm mit Seilen und Moos; wird 170 Einheiten breit gezeichnet.
- `wechselmonster.png`: 4 × 1, 384 × 256 je Feld, orange, Blick nach links: schlafen A/B, blinzelt
  (Warnung), wach. Gleiche Fußlinie wie `schlafmonster.png`.

Die Dateien sind aus den ChatGPT-Originalen zugeschnitten und bereinigt (Rauschpixel entfernt, auf die
Zielgrößen skaliert). Ein zweiter, flacherer Brückenentwurf wurde nicht verwendet.
