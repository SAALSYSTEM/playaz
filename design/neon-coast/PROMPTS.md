# Neon Coast – Fluchtwagen – Bildprompts für ChatGPT

Für das Spiel selbst sind keine neuen Bilder nötig (alle Motive kommen aus den Neon-Coast-Tafeln in `design/sternenfahrt/`).
Gebraucht werden nur Kachel und Teilen-Vorschau. Ablage hier als `kachel.png` und `social-preview.png` (die vorläufigen
Bilder aus dem Spiel werden dabei überschrieben), dann `python3 tools/neon-coast-assets.py` und in `public/index.html`
und `public/spiele/neon-coast.html` die Bildversion (`?v=1` → `?v=2`) anheben.

## kachel.png – Startseiten-Kachel, quadratisch, ohne Schrift
```
Erstelle ein quadratisches Bild (1024 × 1024) als Titelbild für ein Arcade-Autospiel im Browser. Stil: hochwertige, leicht stilisierte 3D-Illustration wie ein modernes Handyspiel-Cover, kräftige Neonfarben, Nacht. Keine Schrift, keine Buchstaben, kein Logo, keine Markenzeichen, keine erkennbaren echten Automarken. Blick schräg von oben auf eine breite Küstenstraße in einer Neonstadt im 80er-Jahre-Miami-Look: Ein korallenroter kompakter Sportwagen driftet mit quietschenden Reifen und Rauch um eine Kurve direkt auf den Betrachter zu, leicht schräg im Bild. Dicht dahinter zwei schwarz-weiße Streifenwagen mit grell leuchtendem rot-blauem Blaulicht, einer schleudert gerade. Auf dem Beifahrersitz des Sportwagens liegt ein offener gelber Koffer, aus dem ein paar Geldscheine in den Fahrtwind fliegen. Links und rechts Palmen, Hotels und Läden mit pinken und türkisen Neonröhren, nasser Asphalt spiegelt die Lichter, am Horizont ein violett-oranger Nachthimmel und das Meer. Fahrer nur als dunkle Silhouette, keine Gesichter. Keine Waffen, keine Gewalt, keine Fußgänger. Farben: Nachtblau und Violett, Neonpink #FF5FA2, Türkis #1ED6E0, Akzente in Gelb #FFD21C und Orange #FF9200. Das Hauptmotiv (Sportwagen) steht in der Bildmitte und bleibt auch stark verkleinert gut erkennbar.
```

## social-preview.png – Teilen-Vorschau 1200 × 630, mit Schriftzug
```
Erstelle ein Querformat-Bild im Format 1200 × 630 als Teilen-Vorschau für ein Arcade-Autospiel im Browser. Stil: hochwertige, leicht stilisierte 3D-Illustration wie ein modernes Handyspiel-Cover, kräftige Neonfarben, Nacht, 80er-Jahre-Miami-Look. Keine Markenzeichen, keine erkennbaren echten Automarken. Rechte Bildhälfte: Blick schräg von oben auf eine Küstenstraße in einer Neonstadt – ein korallenroter kompakter Sportwagen driftet mit Reifenrauch durch eine Kurve, dicht dahinter zwei schwarz-weiße Streifenwagen mit rot-blauem Blaulicht, Palmen, Neonröhren in Pink und Türkis an den Häusern, nasser Asphalt mit Spiegelungen, violett-oranger Nachthimmel. Aus dem Sportwagen fliegen ein paar Geldscheine. Fahrer nur als Silhouette, keine Gesichter, keine Waffen, keine Fußgänger. Linke Bildhälfte auf ruhigem dunkelblau-violettem Grund: oben groß in leuchtender türkiser Neonröhren-Blockschrift „NEON COAST“, darunter leicht schräg in pinker Neonschrift „Fluchtwagen“, darunter klein in Weiß „Wie viel Beute schaffst du in einer Nacht?“. Bitte genau so schreiben: NEON COAST – Fluchtwagen – Wie viel Beute schaffst du in einer Nacht? Keine weiteren Texte, kein Logo. Wichtige Inhalte mit Abstand zum Rand.
```
