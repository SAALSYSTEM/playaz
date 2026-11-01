#!/usr/bin/env python3
"""Roulette: Kachel und Teilen-Vorschau aus design/roulette/ für das Portal aufbereiten.

Aufruf: python3 tools/roulette-assets.py   (braucht Pillow)
  design/roulette/kachel.png  -> public/bilder/roulette.webp     (quadratisch, 720 px, mittig zugeschnitten)
  design/roulette/social.png  -> public/bilder/roulette-og.jpg   (1200 x 630, mittig zugeschnitten)
Kessel und Tisch im Spiel werden gezeichnet und brauchen keine Bilder. Prompts: design/roulette/PROMPTS.md.
Nach neuen Bildern in public/index.html bzw. public/spiele/roulette.html die ?v=-Nummer erhöhen.
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'design' / 'roulette'
BILDER = ROOT / 'public' / 'bilder'


def finde(name):
    for ext in ('.png', '.webp', '.jpg', '.jpeg'):
        f = SRC / (name + ext)
        if f.exists():
            return f
    return None


def zuschneiden(img, w, h):
    s = max(w / img.width, h / img.height)
    img = img.resize((round(img.width * s), round(img.height * s)), Image.LANCZOS)
    l, t = (img.width - w) // 2, (img.height - h) // 2
    return img.crop((l, t, l + w, t + h))


k = finde('kachel')
if k:
    zuschneiden(Image.open(k).convert('RGB'), 720, 720).save(BILDER / 'roulette.webp', 'WEBP', quality=82, method=6)
    print('Kachel:', BILDER / 'roulette.webp')
s = finde('social')
if s:
    zuschneiden(Image.open(s).convert('RGB'), 1200, 630).save(BILDER / 'roulette-og.jpg', 'JPEG', quality=84, optimize=True, progressive=True)
    print('Teilen-Vorschau:', BILDER / 'roulette-og.jpg')
