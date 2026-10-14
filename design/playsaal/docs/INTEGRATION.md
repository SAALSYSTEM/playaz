# Produktionsassets — Einbauhilfe

Die Dateien unter `public/` können in einen vorhandenen öffentlichen Assetordner kopiert werden. Ggf. Pfade auf das Framework anpassen. PWA-Konfigurationen zusammenführen, nicht blind ersetzen.

| Einsatz | Datei im ZIP | Webpfad bei Root-Public-Folder |
|---|---|---|
| Header hell | `public/brand/playsaal-logo-horizontal-light.svg` | `/brand/playsaal-logo-horizontal-light.svg` |
| Header dunkel | `public/brand/playsaal-logo-horizontal-dark.svg` | `/brand/playsaal-logo-horizontal-dark.svg` |
| Hauptzeichen | `public/brand/playsaal-icon.svg` | `/brand/playsaal-icon.svg` |
| Hauptzeichen PNG transparent | `public/brand/playsaal-icon-transparent-1024.png` | `/brand/playsaal-icon-transparent-1024.png` |
| Favicon SVG | `public/favicon.svg` | `/favicon.svg` |
| Legacy favicon | `public/favicon.ico` | `/favicon.ico` |
| Apple touch | `public/apple-touch-icon.png` | `/apple-touch-icon.png` |
| Android | `public/icon-192.png`, `public/icon-512.png` | `/icon-192.png`, `/icon-512.png` |
| Maskable Android | `public/icon-maskable-512.png` | `/icon-maskable-512.png` |
| OG | `public/og-playsaal-1200x630.jpg` | `/og-playsaal-1200x630.jpg` |
| Twitter | `public/twitter-playsaal-1200x600.jpg` | `/twitter-playsaal-1200x600.jpg` |
| PWA Manifest | `public/site.webmanifest` | `/site.webmanifest` (bestehende App-Einstellungen beachten) |

## Beispiel (an tatsächliches Framework anpassen)

```html
<title>PlaySaal – Browsergames direkt spielen</title>
<meta name="theme-color" content="#11121A">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<link rel="icon" type="image/x-icon" href="/favicon.ico">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<link rel="canonical" href="https://playsaal.com/">
<meta property="og:type" content="website">
<meta property="og:site_name" content="PlaySaal">
<meta property="og:title" content="PlaySaal – Browsergames direkt spielen">
<meta property="og:description" content="Kostenlose Browsergames. Direkt im Browser spielen.">
<meta property="og:url" content="https://playsaal.com/">
<meta property="og:image" content="https://playsaal.com/og-playsaal-1200x630.jpg">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="https://playsaal.com/twitter-playsaal-1200x600.jpg">
```

Auf Spielunterseiten Canonical und `og:url` dynamisch mit deren **tatsächlichem Pfad** ausgeben. Die neue Domain erst aktiv stellen, wenn die Domain über Cloudflare auf die Website zeigt. Logo auf dunklem Hintergrund = `*-dark.svg` (weiße Schrift), auf hellem Hintergrund = `*-light.svg` (dunkle Schrift). Der Text im SVG ist zu Pfaden umgewandelt, daher wird keine Schriftartdatei mitgeliefert.

## Farben

- Gelb `#FFD21C`, Orange `#FF9200`, Koralle `#FF4A13`, Rot `#B31912`, Ink `#11121A`.
- Schwarze und weiße Wortmarkenfarben dürfen je nach Hintergrund wechseln, das Zeichen bleibt orange/gelb.
- Standard-UI-Font empfohlen: Inter bzw. vorhandene lesbare UI-Font; für das SVG-Wortzeichen wird **keine** Fontdatei gebraucht.
