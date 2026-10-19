# Grafiken und Anschlüsse

12 PNG-Quelldateien. Alle außer hintergrund.png besitzen echte Alpha-Transparenz. Keine gemalten Schachbrett-Hintergründe. Die Dateien sind hochauflösende Quellen, keine bereits auf Browsergröße komprimierten Assets.

assets.json enthält tatsächliche Bildmaße und gemessene sourceRect-Ausschnitte [x,y,Breite,Höhe]. Verwende diese statt geratener Zellmaße. Die Atlanten besitzen gleich breite logische Spalten, aber unterschiedliche transparente Innenabstände. sourceRect ist die Kernsilhouette ab Alpha 128; für feine Kanten beim Extrahieren 2 Pixel innerhalb der jeweiligen Spalte zugeben. Keine anderen Motive anschneiden. Katzen und Flammen beim Rendern unten mittig verankern; beide Katzen mit gemeinsamer Skalierung rendern. Die Flammen dürfen sich leicht in der Höhe verändern.

| Datei | Inhalt / Reihenfolge von links |
|---|---|
| hintergrund.png | Himmel, ferne Stadt, Gehweg, Straße; formatfüllend |
| kleines-haus.png | Ein Haus ohne Fenster; Fensterpositionen gemäß Profil unten |
| reihenhaus.png | Drei Fassadenbereiche ohne Fenster |
| hochhaus.png | 0 Erdgeschoss, 1 wiederholbare Etage, 2 Dach |
| fenster.png | 0 Creme geschlossen, 1 Creme offen, 2 Koralle geschlossen, 3 Türkis geschlossen |
| feuerwehrwagen.png | Wagen, Kabine links, Leiteraufnahme hinten oben |
| feuerwehrmann.png | Stehende Figur, rechter Arm separat |
| arm-loeschrohr.png | Schulter links, Wasseröffnung rechts |
| drehleiter.png | 0 Leitersegment vertikal, 1 Gelenk, 2 leerer Rettungskorb |
| katze.png | 0 wartend, 1 glücklich |
| flammen.png | Vier Flackerbilder, etwa 6–8 fps |
| dekoration.png | Baum, Busch, Zaun, Laterne; optional sparsam einsetzen |

## Geometrie
Alle folgenden normalisierten Punkte beziehen sich auf den jeweiligen sourceRect, nicht auf die komplette PNG. Es sind konkrete Startwerte, visuell im zusammengesetzten Spiel einmal feinjustieren.
- Feuerwehrmann: Schulter (0.77,0.36), Fußanker (0.5,1). Figur etwa 110–145 CSS-px hoch bei 390px Bildschirmbreite.
- Arm: Schulterdrehpunkt (0.065,0.48), Wasseraustritt (0.98,0.48). Sichtbare Armlänge etwa 0.40 × Figurenhöhe. Arm über Figur rendern und Schulterübergang leicht überlappen lassen. Figur ganz links anordnen, Ziele rechts/oberhalb; Winkelbereich begrenzen, damit Arm nicht durch den Kopf rotiert.
- Wagen: Leiterbasis (0.83,0.12). Leiterwinkel und Länge mathematisch aus Basis und Ziel bestimmen. Der Korb wird separat ohne Rotation am Leiterende gezeichnet. Ladder-Sprite hochkant bei Winkel 0 nach oben; bei Standard-atan2 entsprechend +PI/2 korrigieren.
- Korb: Aufnahmepunkt der Katze (0.5,0.72). Katze kleiner als Korb; untere Pfoten durch eine kleine Vorderkanten-Maske verdecken. Katzenwechsel per kurzer Translation, kein neuer Animationsatlas nötig.
- Hochhaus: Etage als Modul mit Gesims, keine nahtlos wiederholbare Textur. Etagen auf gleiche sichtbare Fassadenbreite skalieren, Kanten ca. 2px überlappen; Dach separat passend zur Breite. Kein Durchscheinen des Himmels zwischen Etagen.

## Fensterprofile
Fenster-IDs sind b{Hausindex}-r{Reihe}-c{Spalte}, nullbasiert, Reihen von oben nach unten. centers in levels.json beziehen sich auf das sichtbare Gesamtgebäude-Rechteck nach dem Zusammensetzen. Kleine Häuser: Fenster seitlich der Tür. Reihenhaus: je zwei Fenster pro Fassadenbereich. Hochhäuser: Erdgeschoss unten bleibt für die Tür frei, Fenster nur auf den Etagen darüber.

In der kleinsten mobilen Ansicht müssen Trefferflächen mindestens 40–44 CSS-px erreichen. Bei eng stehenden Fenstern nicht überlappende Ziele bevorzugen; unsichtbare Hitboxen leicht vergrößern. HUD oben etwa 12%, Gebäudezone etwa 15–77%, Fahrzeug und Figur im unteren Bereich. Dekoration darf kein Ziel verdecken.

Wasserstrahl (Bezierkurve), Schlauch, Spritzer, Dampf, Blaulicht und kurze Erfolgspartikel zeichnet der Code. Feuergröße zeigt verbleibende Stärke. Kein physikalischer Wasserpartikelsimulator erforderlich.

## Paketgrenzen
Die Grafiken wurden erzeugt, visuell geprüft und ihre Alpha-Kanäle sowie Ausschnitte ausgelesen. Das Paket enthält noch keine getestete Spielengine. Die Anschlusswerte und mobile Komposition sind bei der Implementierung visuell zu kontrollieren. Vorschau.png zeigt den Entwurf; sie ist keine Aufnahme eines bereits implementierten Spiels.
