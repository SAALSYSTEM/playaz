#!/usr/bin/env python3
"""Texas Hold'em: ChatGPT-Bilder aus design/texas-holdem/ aufbereiten.

Aufruf: python3 tools/texas-holdem-assets.py   (braucht Pillow)
  design/texas-holdem/<gegner>.png -> public/spiele/texas-holdem/img/<gegner>.webp  (quadratisch, 256 px) + img/manifest.json
      Gegner: kalle, vera, bruno, hilde, lindqvist. Fehlt ein Bild, zeigt das Spiel einen gezeichneten Avatar.
  design/texas-holdem/kachel.png   -> public/bilder/texas-holdem.webp     (720 px, mittig)
  design/texas-holdem/social.png   -> public/bilder/texas-holdem-og.jpg   (1200 x 630, oben betont, damit der Schriftzug bleibt)
Karten, Tisch und Chips zeichnet das Spiel selbst. Prompts: design/texas-holdem/PROMPTS.md.
Nach neuen Bildern ?v= in game.js (Avatare), public/index.html bzw. public/spiele/texas-holdem.html erhöhen.
"""
import json
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'design' / 'texas-holdem'
IMG = ROOT / 'public' / 'spiele' / 'texas-holdem' / 'img'
BILDER = ROOT / 'public' / 'bilder'
GEGNER = ['kalle', 'vera', 'bruno', 'hilde', 'lindqvist']


def finde(name):
    for ext in ('.png', '.webp', '.jpg', '.jpeg'):
        f = SRC / (name + ext)
        if f.exists():
            return f
    return None


def zuschneiden(img, w, h, oben=0.5):
    s = max(w / img.width, h / img.height)
    img = img.resize((round(img.width * s), round(img.height * s)), Image.LANCZOS)
    l, t = (img.width - w) // 2, round((img.height - h) * oben)
    return img.crop((l, t, l + w, t + h))


IMG.mkdir(parents=True, exist_ok=True)
da = []
for g in GEGNER:
    f = finde(g)
    if not f:
        continue
    # Für den runden Avatar aufs Gesicht zoomen: Quadrat mit 68 % Kantenlänge um (Mitte, 38 % Höhe)
    im = Image.open(f).convert('RGB'); seite = round(min(im.size) * 0.68)
    cx, cy = im.width * 0.5, im.height * 0.38
    l = max(0, min(im.width - seite, round(cx - seite / 2))); t = max(0, min(im.height - seite, round(cy - seite / 2)))
    im.crop((l, t, l + seite, t + seite)).resize((256, 256), Image.LANCZOS).save(IMG / (g + '.webp'), 'WEBP', quality=84, method=6)
    da.append(g)
    print('Avatar:', g)
(IMG / 'manifest.json').write_text(json.dumps(da))
k = finde('kachel')
if k:
    zuschneiden(Image.open(k).convert('RGB'), 720, 720).save(BILDER / 'texas-holdem.webp', 'WEBP', quality=82, method=6)
    print('Kachel')
s = finde('social')
if s:
    zuschneiden(Image.open(s).convert('RGB'), 1200, 630, oben=0.18).save(BILDER / 'texas-holdem-og.jpg', 'JPEG', quality=84, optimize=True, progressive=True)
    print('Teilen-Vorschau')
