# MySupermarkt — Entwicklungsstand und Abnahme

Stand: Implementierung einschließlich neuer 3D-Figuren, Cover und 360°-Ansicht. Veröffentlichung auf `main` / öffentliches Cloudflare am 17.10.2026 ausdrücklich vom Auftraggeber freigegeben. Die unten benannten Browser- und Geräteprüfungen bleiben offen; die Freigabe ist kein Nachweis dieser Prüfungen.

## Grafiküberarbeitung

- Marktleiterin, Mitarbeiter und Kunden sind echte volumetrische Modelle: Gesicht mit Augen, Nase und Mund, Frisuren/Dutt, Mütze, Brille, Schürze mit vorderer Tasche und hinteren Bändern, Hände und Schuhe.
- Gemeinsames Modell in Spiel und `/spiele/mysupermarkt/figuren.html`. Die 360°-Ansicht erlaubt Drehen mit Drag/Regler, Vorder-/Seiten-/Rückansicht, Kleiderfarben sowie Stehen, Gehen, Tragen und Arbeiten. Keine Änderung des Spielstands.
- Arme bewegen sich abhängig von Tätigkeit und Tragezustand; Gehen bleibt zwischen 30-Hz-Simulationsschritten kontinuierlich. Körper und Kartons verwenden denselben räumlichen Drehursprung.
- Farbe pro Instanz statt zusätzlichem Materialbatch pro Kundenfarbe; zusätzliche Instanzseiten vermeiden fehlende Körperteile oberhalb von 1.024 Instanzen.
- Überarbeitete Regale mit sichtbarer unterer Warenebene, Holzablagen/Preisschildformen, Kühllichtleisten, petrolfarbene Kassen, Markisen und offener Lieferwagen-Aufbau.
- Freigegebenes generiertes Cover: Original unter `tools/art/mysupermarkt-cover.png`; WebP für Startseite/Spielstart, 1200 × 630 PNG für OG. `node tools/mysupermarkt-cover.mjs` erzeugt beide Größen.
- `docs/mysupermarkt-figuren.png` zeigt die tatsächliche Modellgeometrie aus vier Richtungen, mit einem Offline-CPU-Renderer gezeichnet. Kein Browser-Screenshot und kein Nachweis der Echtzeitbeleuchtung. Reproduzierbar mit `tools/mysupermarkt-model-export.mjs` und `tools/mysupermarkt-model-preview.py` (NumPy/Pillow).
- Das hochwertige Marketing-Cover ist eine Stilvorlage. Die prozeduralen Echtzeitmodelle entsprechen nicht seiner Filmrenderqualität.

## Was implementiert ist

- Echte Three.js-Szene mit eigener Geometrie: begehbarer Supermarkt, abgerundete Figuren, zwölf unterscheidbare Waren, Regale, Kühlregale, Tiefkühltruhe, Obststände, Lager, Packtische und Liefer-/Postfahrzeuge. Keine übernommenen Spielassets und keine externen CDNs.
- Sanft folgende schräge Orthografiekamera, Hochformat-/Desktop-Projektion, niedrige Wände, Schatten, Laufbewegung, sichtbare Tragestapel, Transportwagen, Fahrzeugankunft/-abfahrt, offene Ladefläche, Waren im Regal und auf Paketablage.
- WASD/Pfeile sowie Drag-Joystick. Pointer-Capture, Pointer-Cancel, Fokusverlust und Tabwechsel räumen Eingaben auf. ESC/Pause und Menüs stoppen die Simulation einschließlich Löhnen. Tätigkeiten laufen in Objektnähe; Weglaufen unterbricht den aktuellen Arbeitsschritt.
- Start mit einem Saftregal, einer Kasse, einer bezahlten Lieferung und ohne Mitarbeiter. Pfeil, Bodenmarkierungen, Status und Fortschrittsleiste erklären den nächsten Schritt.
- Vier offene Lieferungen maximal; echte, beim Einkauf bezahlte Warenbestände; Transportlimits und drei Fahrzeuggrößen. Alle Lieferungen müssen entladen werden. Inventur zählt auch noch unterwegs befindliche Einkäufe.
- Kunden mit eigener Einkaufs-/Warteschlangen-/Ausgangslogik, zwei Kassen, später zwei Artikel je Einkauf, Geduldslimit und Rückgabe unbezahlter Ware. Gitterwegfindung verhindert das Durchlaufen von Regalen und Kassen.
- Kassierer, Warenverräumer, Lagerarbeiter, Online-Packer. Je Rolle eine Person; drei Verbesserungsstufen für Tempo/Leistung, bei Trägern auch Kapazität. Ein Kassierer kann beide Kassen nacheinander bedienen, läuft dazu tatsächlich zur jeweiligen Kasse.
- Einstellung, Arbeitslöhne, offene Löhne, Pausieren und Wiedereinstieg. Löhne fallen pro 60 Sekunden Einsatzzeit an. Arbeitslose Verräumer/Packer ohne Ziel kosten in dieser Vereinfachung nichts; ein bereiter Kassierer zählt als eingesetzt. Kein Lohn in Spielpause oder Menüs.
- Gemeinsamer Bestand für Laden und Onlinehandel. Reservierte Ware liegt zunächst im Lager und ist für das Regal nicht verfügbar. Kommissionierte Ware wird getragen und am zugewiesenen Packtisch abgelegt. Fertige Pakete müssen zur Abholzone neben dem Postfahrzeug gebracht werden. Zahlung erst bei tatsächlicher Abholung.
- Fehlende Onlineware bleibt als offener Auftrag bestehen. Bis zu sechs Aufträge, Expressbonus ohne Verlust des normalen Auftrags bei Fristablauf, größere Bestellungen im Spätspiel, zweite Packstation, größere Ablage und kürzerer Posttakt.
- „Auftrag zurückstellen“ als wirtschaftlicher Ausweg: Lagerreservierungen werden freigegeben. Ware vom Packtisch oder in den Händen wird vom Spieler/Packer zurück ins Lager getragen. Der Auftrag wird nicht gelöscht und kann später fortgesetzt werden.
- Alle 20 fortlaufenden Meilensteine mit wirksamen Freischaltungen. Kein Zurücksetzen des Ladens. Nach dem Imperium-Ausbau steigen Kundenlimit und Bestellfrequenz; das Spiel läuft weiter.
- Verbesserbare Regale, Schuhe, Tragkraft, Verpackung und Abholfrequenz, tägliche Aufgaben im Zehn-Minuten-Spieltag, drei kostenlose Schürzenfarben.
- Integer-Geldbuchungen und Bestandsinventur. Einkauf wird nur einmal belastet. Bilanz zeigt Umsatz, Einkauf, Löhne, Investitionen und einen ausdrücklich vereinfachten Einkaufsüberschuss, keine echte periodengerechte GuV.
- Ausbau lässt 12 € Einkaufspuffer stehen. Bei null Waren und weniger als 12 € Geld ist ein begrenzter Warenkredit für sechs Saft erhältlich. Kein kostenloses Geld: 12 € Schuld, Rückzahlung aus einem Drittel künftiger Einnahmen. Kein zweiter Kredit bei offener Schuld.
- Zehn Awards, datierte lokale Freischaltungen, angebotener Share-Einstieg nach Erfolgen. Native Text-/Linkfreigabe, Zwischenablage-/manueller Link-Fallback, herunterladbare 1200 × 630 PNG-Erfolgsgrafik. Herausforderungslink `?kunden=N` zeigt ein lokales Ziel, keine verifizierte Rangliste.
- Versionierte lokale Speicherung `mysupermarkt.v1`, vorherige gültige Sicherung `mysupermarkt.v1.backup`, Autosave, JSON-Export und bestätigter Import mit Sicherung des aktuellen Stands. Defekte Speicherstände werden nicht still überschrieben. Kein Offline-Einkommen.
- Lokale PlaySaal-Integration: bestehendes Home-Icon, Schriftdateien, gelbe Aktionen/anthrazitfarbene Panels, vorhandener Award-Zeichner, Cover, Canonical/OG/Twitter/JSON-LD, Startseiten-Kachel, letzter Spielstand, Sitemap und Umzugsregistrierung.

## Architektur

| Datei | Aufgabe |
| --- | --- |
| `public/spiele/mysupermarkt.html` | Bestehendes statisches Spielseiten-Muster, Metadaten, HUD, Dialoge |
| `mysupermarkt/data.js` | Produkte, Preise, Arbeitsplätze, Ausbauten, Meilensteine, Awards |
| `mysupermarkt/engine.js` | Zustandsautomat, Warenketten, Geld, Personal, Kunden, Aufträge, Sicherung/Inventur |
| `mysupermarkt/navigation.js` | Kollisionen, gecachte Distanzfelder und Wege |
| `mysupermarkt/render.js` | Eigene 3D-Modelle, Instanzen, Kamera, Animationen |
| `mysupermarkt/characters.js` | Gemeinsame rundum modellierte Figuren und Posen |
| `mysupermarkt/figuren.html`, `figuren.js` | Interaktive 360°-Modellansicht ohne Spielstandänderung |
| `mysupermarkt/game.js` | DOM, Eingaben, Pause, Menüs, Ton, lokaler Speicher |
| `mysupermarkt/share.js` | Teilen, Herausforderungslink und Bild |
| `mysupermarkt/style.css` | Responsive Oberfläche und sichere Touchflächen |

Keine neue Serverarchitektur. In der geprüften Codebasis gab es keine gemeinsame Account-/Ranglistenanbindung; deshalb wird keine erfunden und keine angebliche Synchronisierung angezeigt. Vorhandene Workers und andere Spielregeln wurden nicht geändert.

## Wirtschaftliche Invarianten

Pro Produkt gilt jederzeit:

`eingekaufte Einheiten = Lieferungen + Lager + getragene Ware + Regal + Kundenkörbe + Online-Reservierungen + Packtisch + fertige Pakete + verkaufte Einheiten`

Ein getragener Paketbeleg verweist auf seinen Auftrag; sein Wareninhalt wird nur beim Auftrag gezählt.

`Guthaben = Startkapital + Ladenumsatz + Onlineumsatz + Aufgabenprämien − bezahlte Einkäufe − gezahlte Löhne − Investitionen − Kredittilgung`

`Warenkreditschuld = kreditfinanzierte Einkäufe − Kredittilgung`

## Ausgeführte Prüfungen

```sh
node --test tests/mysupermarkt-sim.test.mjs tests/mysupermarkt-render.test.mjs tests/mysupermarkt-ui.test.mjs
node --test tests/*-sim.test.mjs tests/mysupermarkt-render.test.mjs tests/mysupermarkt-ui.test.mjs
node tools/domain.mjs
git diff --check
```

Die neue Testsuite umfasst **34 Tests**:

Vor der Grafiküberarbeitung wurden zusammen mit den bestehenden Simulationstests **106 Tests bestanden**. Die Grafiküberarbeitung ergänzt drei gezielte Tests für 360°-Drehungen einschließlich Fracht, vollständige Instanzseiten bei vielen Figuren und unterschiedliche Bewegung/Trageposen. Das ersetzt die unten aufgeführte offene Browserabnahme nicht.

- Beide vollständigen Waren-/Zahlungsketten, Reservierungen und Doppelbuchungsschutz.
- Volle Traglasten, Lagerabgabe/-aufnahme, Freischaltungen, Kaufgrenzen, Arbeitslöhne, Rückfallkredit und einmalige Aufgabenprämien.
- Rücktransport zurückgestellter Aufträge, Sicherung mit Ware unterwegs, Ablehnung beschädigter/manipulierter Importdaten.
- Erreichbare Arbeitsplätze und Warteschlangen im Vollausbau, Kunden verlassen unbediente Märkte, Personal transportiert und kassiert.
- Drei Stressläufe mit je 30 simulierten Minuten, Speichern/Laden während des Betriebs, Inventur und Kollisionsprüfungen.
- Automatischer Testspieler erreicht mit **120 € Startkapital ohne Testzuschüsse** alle 20 Meilensteine. Gemessener Lauf: **122,8 simulierte Minuten, 1.245 Kunden, 48 Pakete, 14.046 € Umsatz**, danach weiterer Endlosbetrieb. Das misst Erreichbarkeit, nicht menschlichen Spielspaß.
- Szenenaufbau mit der echten vorhandenen Three.js-Version und einem Renderer-Stub bei **375, 390, 768 und 1440 px**: endliche Matrizen, Spielfigur im Kamerabild, Instanzgrenzen, keine anwachsenden NPC-Beschriftungen. **Das ist kein GPU-/Browser-/Layouttest.**
- DOM-Verdrahtung mit Test-Doubles: Start, alle Dialoge, Pointer-Abbruch, Pause und Speicherzugriff. **Kein echter Touch- oder Browsernachweis.**
- Referenzdateien, Startseiten-/Umzugsanbindung, SEO-Metadaten und gemeinsame Share-Grafikfunktion.

## Noch offene Browser- und Geräteabnahme

Die für diese Umgebung vorgesehene Browser-Steuerung ist nicht verfügbar. Deshalb wurde kein lokaler Preview-Server gestartet und keine Browserabnahme vorgetäuscht.

1. Echte WebGL-Darstellung bei 375, 390, 768 und 1440 px ansehen: Lesbarkeit, verdeckte Ziele, Dialog-Scrollen, Kamera, Warendarstellung und Animationen.
2. Echtes iPhone/Safari: Drag, Finger außerhalb der Fläche, Pointer-Abbruch, Appwechsel, Browserleisten, Audio, Vollbild-Fallback, Export/Share und Wiederladen.
3. Zwei manuelle Spielrunden: erste fünf Minuten sowie kompletter Laden-/Onlinebetrieb. Ein Mensch muss Tempo, Wege, Übersicht und Motivation beurteilen.
4. FPS, GPU-Speicher und reale Draw Calls auf einem Mittelklasse-Handy messen. **60 FPS sind ein Ziel, kein gemessenes Ergebnis.** Instancing, Geometrie-/Materialwiederverwendung, NPC-Pooling und begrenzte Kundenzahl sind implementiert.
5. Browser-Akzeptanztests ausführen. Vorbereitet in `tests/mysupermarkt.browser.mjs`, hier **nicht ausgeführt**:

```sh
# Ein lokal gestarteter PlaySaal-Server und installiertes Playwright/Chromium sind Voraussetzung.
PLAYSAAL_TEST_URL=http://127.0.0.1:8799 node --test tests/mysupermarkt.browser.mjs
```

6. Ausdrückliche Veröffentlichungsfreigabe wurde am 17.10.2026 erteilt. Zielroute: `https://playsaal.com/spiele/mysupermarkt`; Deployment-Erfolg separat prüfen.

## Bewusste Vereinfachungen / nicht implementiert

- Eigenständige prozedurale Casual-3D-Optik, kein fotorealistisches Assetpaket; visuelle Abnahme steht aus. Das Cover ist eine eigene Illustration, kein Spiel-Screenshot.
- Keine mehrere Filialen, Filialleiter, Zentrallager oder Lieferflotten. Nicht als umgesetzt beworben.
- Pro Rolle ein Mitarbeiter mit Upgrades; kein frei konfigurierbarer großer Personalpool.
- Festes, wachsendes Ladenlayout; keine freie Möbelplatzierung. Schürzenfarben sind die erste kosmetische Auswahl, noch keine umfangreiche Ladendekoration.
- Keine individuelle Auftrags-OG-Grafik im Server: Linkvorschauen zeigen das allgemeine Spielcover; das individuelle Ergebnis wird als herunterladbares PNG und Text geteilt.
- Keine verifizierte globale/Freunde-Rangliste und keine Cloud-Synchronisierung. Lokale Fortschritte können bearbeitet werden und eignen sich nicht als manipulationssichere Wettbewerbsergebnisse.
- Vorhandene Spielstände bleiben während des Offline-Seins unverändert. Es werden keine fiktiven Umsätze oder Löhne nachgerechnet.

## Änderungen außerhalb des Spielordners

Nur die erforderlichen Integrationsstellen: `public/index.html`, `public/sitemap.xml`, `public/assets/umzug.js`, neue Coverdateien, Tests, Cover-Generator und diese Dokumentation. Die bestehende Plattformstruktur und alle anderen Spiele bleiben erhalten.
