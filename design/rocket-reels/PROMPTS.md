# Rocket Reels – Bildprompts für ChatGPT

Fertige Bilder unter genau diesen Namen nach `design/rocket-reels/` legen, dann `python3 tools/rocket-reels-assets.py` ausführen (macht WebP daraus, stellt bei Bedarf frei, schreibt `manifest.json`).
Fehlt ein Bild, zeichnet das Spiel einen eigenen Platzhalter – man kann nach und nach liefern.

**Reihenfolge:** Zuerst `sym-rakete.png` erzeugen. Für alle weiteren Symbole dieses Bild als Stilvorlage anhängen (am besten im selben ChatGPT-Chat bleiben). Jedes Symbol einzeln erzeugen – nicht mehrere auf einem Bild.

## Asset-Liste (priorisiert)

| Prio | Datei | Zweck | Größe / Format | Transparent | Hinweise für Animation |
|---|---|---|---|---|---|
| 1 | `sym-rakete.png` … `sym-zehn.png` (12 Dateien) | Walzensymbole | 1024 × 1024, quadratisch | ja | Spiel skaliert auf ca. 240 px, Gewinn-Puls und Leuchten macht der Code |
| 1 | `sym-stargate.png` | Wild + Scatter | 1024 × 1024 | ja | Rotation, Energiewirbel und Glühen macht der Code – Bild muss rund und zentriert sein |
| 1 | `hintergrund.jpg` | Hauptspiel | 1024 × 1536, Hochformat 2:3 | nein | Mitte dunkel und ruhig (dort liegen die Walzen) |
| 1 | `rakete.png` | Rakete über den Walzen, Start, Flug, Hyperjump, Crash | 1024 × 1024, Rakete senkrecht | ja | **ohne** Flamme: Flamme, Rauch, Wackeln, Explosion zeichnet der Code |
| 2 | `rahmen.png` | Walzenrahmen | 1536 × 1024, 3:2 | nein (reines Schwarz innen und außen) | Schwarz wird im Spiel unsichtbar (Bildmischung „screen“) |
| 2 | `bonus-hintergrund.jpg` | Freispiele (andere Galaxie) | 1024 × 1536 | nein | Mitte dunkel |
| 2 | `risiko-hintergrund.jpg` | Hyperjump-Korridor | 1024 × 1536 | nein | Stationen und Beträge setzt der Code darüber |
| 3 | `kachel.png` | PlaySaal-Spielekatalog | 1024 × 1024 | nein | ohne Schrift |
| 3 | `social.png` | Link-Vorschau | 1536 × 1024 (wird auf 1200 × 630 zugeschnitten) | nein | mit Schriftzug, Motiv mittig |

Gemeinsame Bildsprache: hochwertiger, glänzender 3D-Render-Look (wie ein Premium-Arcade-Spiel), plastisch, kräftige Kontraste, Licht von oben links, Gold/Orange als Gewinnfarbe, Cyan/Violett als Weltraumfarbe. Keine Comic- oder Kinderoptik, keine Casino-Klischees (keine Würfel, Karten, Kirschen, Münzsäcke), keine Ägypten-Motive.

## 1. sym-rakete.png
```
Erzeuge ein einzelnes freigestelltes Spielsymbol für ein hochwertiges futuristisches Weltraum-Arcade-Spiel auf dem Handy: eine goldene Rakete, schräg nach rechts oben fliegend (ca. 35 Grad), stromlinienförmig, poliertes Gold mit orangefarbenen Reflexen, kleine cyanfarben leuchtende Bullaugen, drei elegante Heckflossen, kurzer leuchtender Triebwerksschweif in Orange und Gelb.
Stil: glänzender, plastischer 3D-Render wie in einem Premium-Mobile-Game, hohe Detailtreue, starke Lichtkanten, Licht von oben links, satte Farben, edle und erwachsene Optik, keine Comic- oder Kinderoptik.
Lesbarkeit: sehr klare Silhouette, muss auch nur 2 cm groß auf einem Handy sofort erkennbar sein.
Technik: echter transparenter Hintergrund (PNG mit Alphakanal), kein Schachbrettmuster, kein Hintergrund, kein Boden, kein Rahmen, kein Text. Motiv mittig, füllt das Bild mit etwa 8 % Rand, nichts abgeschnitten.
```

## 2. sym-astronaut.png
```
Verwende das angehängte Bild sym-rakete.png als verbindliche Stilvorlage (Render-Qualität, Glanz, Licht von oben links, Farbsättigung, Motivgröße im Bild). Erzeuge ein einzelnes freigestelltes Spielsymbol: Kopf und Schultern eines Astronauten von vorn, leicht schräg, futuristischer weißer Raumanzug mit goldenen Akzenten, großer gewölbter Helm mit goldverspiegeltem Visier, in dem sich ein violetter Nebel und Sterne spiegeln, kleine cyanfarbene Leuchtstreifen am Helm. Kein Gesicht sichtbar.
Stil: glänzender, plastischer 3D-Render, erwachsen und edel, keine Comic- oder Kinderoptik.
Lesbarkeit: sehr klare Silhouette, auch 2 cm groß auf dem Handy sofort erkennbar.
Technik: echter transparenter Hintergrund (PNG mit Alphakanal), kein Schachbrettmuster, kein Hintergrund, kein Rahmen, kein Text. Motiv mittig, etwa 8 % Rand, nichts abgeschnitten.
```

## 3. sym-alien.png
```
Verwende das angehängte Bild sym-rakete.png als verbindliche Stilvorlage (Render-Qualität, Glanz, Licht von oben links, Farbsättigung, Motivgröße im Bild). Erzeuge ein einzelnes freigestelltes Spielsymbol: den Kopf eines leuchtenden Aliens von vorn, glatte leicht durchscheinende smaragdgrüne Haut, die von innen schwach leuchtet, große mandelförmige glänzende schwarze Augen mit cyanfarbenen Lichtreflexen, feine Biolumineszenz-Linien auf Stirn und Wangen, ruhiger geheimnisvoller Ausdruck.
Stil: glänzender, plastischer 3D-Render, edel und eher geheimnisvoll als gruselig, keine Comic- oder Kinderoptik, kein Horror.
Lesbarkeit: sehr klare Silhouette, auch 2 cm groß auf dem Handy sofort erkennbar.
Technik: echter transparenter Hintergrund (PNG mit Alphakanal), kein Schachbrettmuster, kein Hintergrund, kein Rahmen, kein Text. Motiv mittig, etwa 8 % Rand, nichts abgeschnitten.
```

## 4. sym-planet.png
```
Verwende das angehängte Bild sym-rakete.png als verbindliche Stilvorlage (Render-Qualität, Glanz, Licht von oben links, Farbsättigung, Motivgröße im Bild). Erzeuge ein einzelnes freigestelltes Spielsymbol: einen Ringplaneten, leicht schräg gekippt, Planetenkugel mit violetten und magentafarbenen Wolkenbändern, breiter glänzender Ring in Gold und Hellorange, der vorn vor der Kugel und hinten dahinter verläuft, weiche Atmosphäre als Lichtsaum am Rand.
Stil: glänzender, plastischer 3D-Render, edel, keine Comic- oder Kinderoptik.
Lesbarkeit: sehr klare Silhouette, auch 2 cm groß auf dem Handy sofort erkennbar.
Technik: echter transparenter Hintergrund (PNG mit Alphakanal), kein Schachbrettmuster, kein Hintergrund, keine Sterne, kein Rahmen, kein Text. Motiv mittig, Ring vollständig im Bild, etwa 8 % Rand.
```

## 5. sym-kristall.png
```
Verwende das angehängte Bild sym-rakete.png als verbindliche Stilvorlage (Render-Qualität, Glanz, Licht von oben links, Farbsättigung, Motivgröße im Bild). Erzeuge ein einzelnes freigestelltes Spielsymbol: einen blauen Energie-Kristall, senkrecht stehend, sechseckig facettiert mit spitzem oberen und unteren Ende, tiefes Saphirblau mit hellcyanfarbenem Leuchtkern im Inneren, scharfe Lichtreflexe auf den Facetten, ein paar winzige schwebende Lichtfunken direkt am Kristall.
Stil: glänzender, plastischer 3D-Render, edel, keine Comic- oder Kinderoptik.
Lesbarkeit: sehr klare Silhouette, auch 2 cm groß auf dem Handy sofort erkennbar.
Technik: echter transparenter Hintergrund (PNG mit Alphakanal), kein Schachbrettmuster, kein Hintergrund, kein Rahmen, kein Text. Motiv mittig, etwa 8 % Rand, nichts abgeschnitten.
```

## 6. sym-meteor.png
```
Verwende das angehängte Bild sym-rakete.png als verbindliche Stilvorlage (Render-Qualität, Glanz, Licht von oben links, Farbsättigung, Motivgröße im Bild). Erzeuge ein einzelnes freigestelltes Spielsymbol: einen Meteor, der von rechts oben nach links unten fliegt, dunkler zerklüfteter Gesteinsbrocken mit glühend orangefarbenen Rissen, dahinter ein kurzer, kompakter Feuerschweif in Orange, Gelb und etwas Rot, der im Bild bleibt.
Stil: glänzender, plastischer 3D-Render, dramatisch aber sauber, keine Comic- oder Kinderoptik.
Lesbarkeit: sehr klare Silhouette, auch 2 cm groß auf dem Handy sofort erkennbar.
Technik: echter transparenter Hintergrund (PNG mit Alphakanal), kein Schachbrettmuster, kein Hintergrund, kein Rauch außerhalb des Motivs, kein Rahmen, kein Text. Motiv mittig, Feuerschweif vollständig im Bild, etwa 8 % Rand.
```

## 7. sym-satellit.png
```
Verwende das angehängte Bild sym-rakete.png als verbindliche Stilvorlage (Render-Qualität, Glanz, Licht von oben links, Farbsättigung, Motivgröße im Bild). Erzeuge ein einzelnes freigestelltes Spielsymbol: einen futuristischen Satelliten, leicht schräg von vorn, kompakter Körper aus silbernem und goldenem Metall, zwei ausgebreitete blau schimmernde Solarflügel, eine runde Parabolantenne, kleine cyanfarbene Signallichter.
Stil: glänzender, plastischer 3D-Render, edel, keine Comic- oder Kinderoptik.
Lesbarkeit: sehr klare Silhouette, auch 2 cm groß auf dem Handy sofort erkennbar.
Technik: echter transparenter Hintergrund (PNG mit Alphakanal), kein Schachbrettmuster, kein Hintergrund, keine Erde, kein Rahmen, kein Text. Motiv mittig, Solarflügel vollständig im Bild, etwa 8 % Rand.
```

## 8. sym-a.png
```
Verwende das angehängte Bild sym-rakete.png als verbindliche Stilvorlage (Render-Qualität, Glanz, Licht von oben links, Motivgröße im Bild). Erzeuge ein einzelnes freigestelltes Spielsymbol: den Großbuchstaben „A“ als dicke, plastische 3D-Form in futuristischer, eckiger Sci-Fi-Schrift, Material wie poliertes Chrom mit violett leuchtenden Kanten und einem violetten Neonschimmer.
Stil: glänzender 3D-Render, edel, keine Comic-Optik. Nur dieser eine Buchstabe, sonst nichts.
Lesbarkeit: sehr klar und breit, auch 2 cm groß auf dem Handy sofort lesbar.
Technik: echter transparenter Hintergrund (PNG mit Alphakanal), kein Schachbrettmuster, kein Hintergrund, kein Rahmen, kein weiterer Text. Motiv mittig, etwa 12 % Rand.
```

## 9. sym-k.png
```
Verwende die angehängten Bilder sym-rakete.png und sym-a.png als verbindliche Stilvorlage (Schriftart, Dicke, Chrom-Material, Größe im Bild, Licht von oben links). Erzeuge ein einzelnes freigestelltes Spielsymbol: den Großbuchstaben „K“ in genau derselben futuristischen 3D-Schrift wie das A, poliertes Chrom mit magentafarben leuchtenden Kanten und einem magentafarbenen Neonschimmer.
Nur dieser eine Buchstabe, sonst nichts. Sehr klar lesbar, auch 2 cm groß auf dem Handy.
Technik: echter transparenter Hintergrund (PNG mit Alphakanal), kein Schachbrettmuster, kein Hintergrund, kein Rahmen, kein weiterer Text. Motiv mittig, etwa 12 % Rand.
```

## 10. sym-q.png
```
Verwende die angehängten Bilder sym-rakete.png und sym-a.png als verbindliche Stilvorlage (Schriftart, Dicke, Chrom-Material, Größe im Bild, Licht von oben links). Erzeuge ein einzelnes freigestelltes Spielsymbol: den Großbuchstaben „Q“ in genau derselben futuristischen 3D-Schrift wie das A, poliertes Chrom mit cyanfarben leuchtenden Kanten und einem cyanfarbenen Neonschimmer.
Nur dieser eine Buchstabe, sonst nichts. Sehr klar lesbar, auch 2 cm groß auf dem Handy.
Technik: echter transparenter Hintergrund (PNG mit Alphakanal), kein Schachbrettmuster, kein Hintergrund, kein Rahmen, kein weiterer Text. Motiv mittig, etwa 12 % Rand.
```

## 11. sym-j.png
```
Verwende die angehängten Bilder sym-rakete.png und sym-a.png als verbindliche Stilvorlage (Schriftart, Dicke, Chrom-Material, Größe im Bild, Licht von oben links). Erzeuge ein einzelnes freigestelltes Spielsymbol: den Großbuchstaben „J“ in genau derselben futuristischen 3D-Schrift wie das A, poliertes Chrom mit grün leuchtenden Kanten und einem smaragdgrünen Neonschimmer.
Nur dieser eine Buchstabe, sonst nichts. Sehr klar lesbar, auch 2 cm groß auf dem Handy.
Technik: echter transparenter Hintergrund (PNG mit Alphakanal), kein Schachbrettmuster, kein Hintergrund, kein Rahmen, kein weiterer Text. Motiv mittig, etwa 12 % Rand.
```

## 12. sym-zehn.png
```
Verwende die angehängten Bilder sym-rakete.png und sym-a.png als verbindliche Stilvorlage (Schriftart, Dicke, Chrom-Material, Größe im Bild, Licht von oben links). Erzeuge ein einzelnes freigestelltes Spielsymbol: die Zahl „10“ in genau derselben futuristischen 3D-Schrift wie das A, beide Ziffern eng zusammen, poliertes Chrom mit orangefarben leuchtenden Kanten und einem orangefarbenen Neonschimmer.
Nur diese Zahl, sonst nichts. Sehr klar lesbar, auch 2 cm groß auf dem Handy.
Technik: echter transparenter Hintergrund (PNG mit Alphakanal), kein Schachbrettmuster, kein Hintergrund, kein Rahmen, kein weiterer Text. Motiv mittig, etwa 12 % Rand.
```

## 13. sym-stargate.png
```
Verwende das angehängte Bild sym-rakete.png als verbindliche Stilvorlage (Render-Qualität, Glanz, Licht von oben links, Farbsättigung). Erzeuge ein einzelnes freigestelltes Spielsymbol: ein kreisrundes Sternentor, direkt von vorn gesehen, massiver Ring aus dunklem Metall mit goldenen Einlagen und sieben gleichmäßig verteilten, leuchtend cyanfarbenen Energieknoten, in der Mitte ein wirbelndes Energieportal in Cyan, Violett und Weiß mit hellem Zentrum.
Stil: glänzender, plastischer 3D-Render, mächtig und edel, keine Comic- oder Kinderoptik. Es ist das wichtigste Sondersymbol des Spiels und soll am stärksten leuchten.
Lesbarkeit: perfekt kreisrund und zentriert (wird im Spiel gedreht), auch 2 cm groß auf dem Handy sofort erkennbar.
Technik: echter transparenter Hintergrund (PNG mit Alphakanal), kein Schachbrettmuster, kein Hintergrund außerhalb des Rings, kein Rahmen, kein Text. Ring füllt das Bild mit etwa 6 % Rand.
```

## 14. hintergrund.jpg
```
Erzeuge ein Hintergrundbild im Hochformat 2:3 für ein hochwertiges futuristisches Weltraum-Arcade-Spiel auf dem Handy. Tiefer Weltraum in Schwarz und Dunkelblau, weiche violette und cyanfarbene Nebelschwaden an den Rändern, viele feine leuchtende Sterne in unterschiedlicher Helligkeit, oben rechts eine entfernte Spiralgalaxie, unten links ein großer, angeschnittener Planet mit orangefarbenem Lichtsaum, oben links ein kleiner ferner Mond.
Wichtig: Das mittlere Drittel (vertikal und horizontal) bleibt dunkel und ruhig ohne helle Objekte, weil dort die Spielwalzen liegen.
Stil: hochwertiger, filmischer Space-Render, edel und erwachsen, keine Comic-Optik. Kein Text, keine Logos, keine Spielelemente, keine Rahmen.
```

## 15. rakete.png
```
Verwende das angehängte Bild sym-rakete.png als Stilvorlage für Material und Licht. Erzeuge ein einzelnes freigestelltes Spielobjekt: dieselbe Art goldene Rakete, aber genau senkrecht stehend mit der Spitze nach oben, von der Seite gesehen, schlanker Rumpf aus poliertem Gold mit orangefarbenen Reflexen, cyanfarben leuchtende Bullaugen, drei Heckflossen, unten eine dunkle Triebwerksdüse.
Wichtig: KEINE Flamme, kein Rauch, kein Abgasstrahl – die Flamme wird im Spiel animiert.
Stil: glänzender, plastischer 3D-Render, edel, keine Comic- oder Kinderoptik.
Technik: echter transparenter Hintergrund (PNG mit Alphakanal), kein Schachbrettmuster, kein Hintergrund, kein Boden, kein Text. Rakete mittig, senkrecht, mit etwa 8 % Rand oben und unten, nichts abgeschnitten.
```

## 16. rahmen.png
```
Erzeuge eine Grafik im Querformat 3:2: einen futuristischen, rechteckigen Rahmen für fünf Spielwalzen eines Weltraum-Arcade-Spiels, Seitenverhältnis des Innenraums etwa 5 zu 3. Der Rahmen ist schmal und edel: Profile aus dunklem Metall mit polierten goldenen Kanten, darauf durchgehende leuchtende cyanfarbene Neonlinien, an den vier Ecken kleine goldene Zierelemente mit cyanfarbenen Lichtpunkten, oben mittig ein schmales goldenes Zierelement.
Wichtig: Der gesamte Innenraum und alles außerhalb des Rahmens ist reines, gleichmäßiges Schwarz (#000000) – keine Walzen, keine Symbole, keine Trennlinien im Inneren, kein Weltraum, kein Verlauf.
Stil: hochwertiger 3D-Render, glänzend, edel, keine Comic-Optik. Kein Text, keine Logos.
```

## 17. bonus-hintergrund.jpg
```
Erzeuge ein Hintergrundbild im Hochformat 2:3 für den Bonusmodus eines hochwertigen Weltraum-Arcade-Spiels: der Spieler ist in einer fernen, spektakulären Galaxie angekommen. Oben eine riesige leuchtende Spiralgalaxie in Gold, Magenta und Violett, unten ein großer fremder Planet mit türkisfarbenen Ozeanen und goldenem Lichtsaum, dazwischen funkelnde Sternenfelder und ein paar Lichtstrahlen.
Wichtig: Das mittlere Drittel (vertikal und horizontal) bleibt deutlich dunkler und ruhig, weil dort die Spielwalzen liegen.
Stil: hochwertiger, filmischer Space-Render, prachtvoller als ein normaler Weltraumhintergrund, aber nicht kitschig, keine Comic-Optik. Kein Text, keine Logos, keine Spielelemente, keine Rahmen.
```

## 18. risiko-hintergrund.jpg
```
Erzeuge ein Hintergrundbild im Hochformat 2:3 für ein Risiko-Minispiel in einem Weltraum-Arcade-Spiel: ein senkrechter futuristischer Hyperraum-Korridor, der von unten nach oben in die Tiefe führt, mit fünf übereinander liegenden, waagerechten Stationen aus leuchtenden Ringen in gleichmäßigem Abstand (unterste Station groß und nah, oberste klein und fern). Wände aus Lichtstreifen in Cyan und Violett, ganz oben ein helles goldenes Leuchten als Ziel. An den Seiten im Dunkeln ein paar treibende Asteroiden.
Wichtig: Die Stationen bleiben leer (keine Zahlen, keine Schrift), unten in der Mitte ist Platz für eine Rakete.
Stil: hochwertiger, filmischer Sci-Fi-Render, dynamisch, keine Comic-Optik. Kein Text, keine Logos, keine Rakete.
```

## 19. kachel.png
```
Erzeuge ein quadratisches Titelbild 1:1 für das Weltraum-Arcade-Spiel „Rocket Reels – Mission Jackpot“ für einen Spielekatalog: im Vordergrund eine goldene Rakete, die schräg nach rechts oben aus einem kreisrunden, cyan-violett wirbelnden Sternentor herausstartet, mit leuchtendem Triebwerksschweif. Um sie herum schweben einige glänzende Spielsymbole: ein Ringplanet, ein blauer Energie-Kristall, ein Astronautenhelm und ein Meteor. Hintergrund tiefer Weltraum in Schwarz und Dunkelblau mit violetten und cyanfarbenen Nebeln und vielen Sternen, goldene Lichtakzente.
Stil: hochwertiger, glänzender 3D-Render wie ein Premium-Mobile-Game-Cover, edel und erwachsen, keine Comic- oder Kinderoptik, keine Casino-Klischees.
Wichtig: KEIN Text, keine Buchstaben, keine Zahlen, keine Logos. Hauptmotiv mittig, mit Rand, damit es auch beschnitten gut aussieht.
```

## 20. social.png
```
Erzeuge ein Vorschaubild im Querformat 3:2 für Link-Vorschauen des Weltraum-Arcade-Spiels „Rocket Reels – Mission Jackpot“. Links eine goldene Rakete, die schräg nach rechts oben aus einem kreisrunden, cyan-violett wirbelnden Sternentor startet, mit leuchtendem Triebwerksschweif; daneben schweben einige glänzende Spielsymbole (Ringplanet, Energie-Kristall, Meteor). Rechts der Schriftzug „ROCKET REELS“ in großen, dicken, goldglänzenden futuristischen Buchstaben, darunter kleiner „MISSION JACKPOT“ in cyanfarben leuchtender Schrift. Hintergrund tiefer Weltraum mit violetten und cyanfarbenen Nebeln und Sternen.
Wichtig: Alle wichtigen Inhalte und der gesamte Schriftzug liegen im mittleren Bereich, oben und unten bleiben je etwa 12 % ruhiger Rand (das Bild wird auf 1200 × 630 zugeschnitten). Schrift exakt so geschrieben, keine weiteren Wörter.
Stil: hochwertiger, glänzender 3D-Render, edel und erwachsen, keine Comic- oder Kinderoptik, keine Casino-Klischees.
```
