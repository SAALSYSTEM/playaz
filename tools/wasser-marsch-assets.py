#!/usr/bin/env python3
"""Wasser Marsch! – Laufzeitbilder aus den Originalen erzeugen.

    python3 tools/wasser-marsch-assets.py

Quelle:  design/wasser-marsch/*.png (Originale, werden nicht verändert)
Maße:    design/wasser-marsch/briefing/assets.json (gemessene sourceRects)
Ziel:    public/spiele/wasser-marsch/img/*.webp + manifest.json

Jedes Teilbild wird einmal ausgeschnitten (sourceRect + 2 px Rand, begrenzt auf die
logische Spalte des Atlas), auf Browsergröße verkleinert und als WebP mit Alpha gespeichert.
manifest.json nennt je Bild die Größe und das Kernrechteck (= sourceRect im verkleinerten Bild);
alle normierten Anschlusspunkte im Spiel beziehen sich auf dieses Kernrechteck.
Zusätzlich entstehen Farbvarianten der Fassaden (nur der Fassadenton wird verschoben).
Benötigt Pillow und numpy.
"""
import json
import os
import sys

import numpy as np
from PIL import Image

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
SRC = os.path.join(ROOT, 'design', 'wasser-marsch')
OUT = os.path.join(ROOT, 'public', 'spiele', 'wasser-marsch', 'img')
ASSETS = json.load(open(os.path.join(SRC, 'briefing', 'assets.json'), encoding='utf-8'))

# Ausgabename, Quell-Asset, Frame-Index, Spaltenanzahl im Atlas, Zielgröße (max Breite, max Höhe)
JOBS = [
    ('hintergrund', 'hintergrund', 0, 1, (941, 1672)),
    ('kleines-haus', 'kleines-haus', 0, 1, (720, 720)),
    ('reihenhaus', 'reihenhaus', 0, 1, (480, 860)),
    ('hochhaus-eg', 'hochhaus', 0, 3, (420, 420)),
    ('hochhaus-etage', 'hochhaus', 1, 3, (420, 420)),
    ('hochhaus-dach', 'hochhaus', 2, 3, (450, 450)),
    ('fenster-0', 'fenster', 0, 4, (128, 160)),
    ('fenster-1', 'fenster', 1, 4, (128, 160)),
    ('fenster-2', 'fenster', 2, 4, (128, 160)),
    ('fenster-3', 'fenster', 3, 4, (128, 160)),
    ('feuerwehrwagen', 'feuerwehrwagen', 0, 1, (520, 520)),
    ('feuerwehrmann', 'feuerwehrmann', 0, 1, (340, 340)),
    ('arm-loeschrohr', 'arm-loeschrohr', 0, 1, (240, 240)),
    ('leiter-segment', 'drehleiter', 0, 3, (72, 160)),
    ('leiter-gelenk', 'drehleiter', 1, 3, (120, 120)),
    ('korb', 'drehleiter', 2, 3, (200, 200)),
    ('katze-wartend', 'katze', 0, 2, (160, 160)),
    ('katze-gluecklich', 'katze', 1, 2, (160, 160)),
    ('flamme-0', 'flammen', 0, 4, (150, 180)),
    ('flamme-1', 'flammen', 1, 4, (150, 180)),
    ('flamme-2', 'flammen', 2, 4, (150, 180)),
    ('flamme-3', 'flammen', 3, 4, (150, 180)),
    ('deko-baum', 'dekoration', 0, 4, (220, 220)),
    ('deko-busch', 'dekoration', 1, 4, (200, 200)),
    ('deko-zaun', 'dekoration', 2, 4, (200, 200)),
    ('deko-laterne', 'dekoration', 3, 4, (100, 260)),
]

# Farbvarianten: Pixel im Farbtonbereich [lo, hi] (Grad) bekommen neuen Farbton, Sättigungs- und Helligkeitsfaktor.
VARIANTS = [
    ('hochhaus-eg', 'koralle', (150, 200), 9, 0.62, 1.32),
    ('hochhaus-etage', 'koralle', (150, 200), 9, 0.62, 1.32),
    ('hochhaus-dach', 'koralle', (150, 200), 9, 0.62, 1.32),
    ('hochhaus-eg', 'gelb', (150, 200), 43, 0.62, 1.42),
    ('hochhaus-etage', 'gelb', (150, 200), 43, 0.62, 1.42),
    ('hochhaus-dach', 'gelb', (150, 200), 43, 0.62, 1.42),
    ('reihenhaus', 'tuerkis', (0, 25), 174, 1.0, 0.78),
    ('reihenhaus', 'gelb', (0, 25), 40, 0.9, 1.0),
]

PAD = 2


def crop(asset, index, cols):
    meta = ASSETS[asset]
    img = Image.open(os.path.join(SRC, meta['file'])).convert('RGBA')
    x, y, w, h = meta['frames'][index]['sourceRect']
    colw = img.width / cols
    cx0, cx1 = int(round(colw * int(x // colw))), int(round(colw * (int(x // colw) + 1)))
    x0, y0 = max(cx0, x - PAD), max(0, y - PAD)
    x1, y1 = min(cx1, x + w + PAD), min(img.height, y + h + PAD)
    part = img.crop((x0, y0, x1, y1))
    core = (x - x0, y - y0, w, h)
    return part, core


def recolor(img, lo, hi, hue, sat, val):
    a = np.asarray(img).astype(np.float32) / 255.0
    rgb, alpha = a[..., :3], a[..., 3:]
    hsv = np.asarray(Image.fromarray((rgb * 255).astype(np.uint8), 'RGB').convert('HSV')).astype(np.float32)
    h = hsv[..., 0] * 360.0 / 255.0
    mask = (h >= lo) & (h <= hi) & (hsv[..., 1] > 40)
    hsv[..., 0] = np.where(mask, hue * 255.0 / 360.0, hsv[..., 0])
    hsv[..., 1] = np.where(mask, np.clip(hsv[..., 1] * sat, 0, 255), hsv[..., 1])
    hsv[..., 2] = np.where(mask, np.clip(hsv[..., 2] * val, 0, 255), hsv[..., 2])
    out = Image.fromarray(hsv.astype(np.uint8), 'HSV').convert('RGB')
    res = np.concatenate([np.asarray(out).astype(np.float32) / 255.0, alpha], axis=2)
    return Image.fromarray((res * 255).round().astype(np.uint8), 'RGBA')


def main():
    os.makedirs(OUT, exist_ok=True)
    manifest = {}
    made = {}
    for name, asset, index, cols, (mw, mh) in JOBS:
        part, core = crop(asset, index, cols)
        s = min(1.0, mw / part.width, mh / part.height)
        size = (max(1, round(part.width * s)), max(1, round(part.height * s)))
        part = part.resize(size, Image.LANCZOS)
        if asset == 'hintergrund':
            part = part.convert('RGB')
        part.save(os.path.join(OUT, name + '.webp'), 'WEBP', quality=84, method=6)
        manifest[name] = {
            'w': size[0], 'h': size[1],
            'core': [round(core[0] * s, 2), round(core[1] * s, 2), round(core[2] * s, 2), round(core[3] * s, 2)],
        }
        made[name] = part
    for base, suffix, (lo, hi), hue, sat, val in VARIANTS:
        name = base + '-' + suffix
        recolor(made[base], lo, hi, hue, sat, val).save(os.path.join(OUT, name + '.webp'), 'WEBP', quality=84, method=6)
        manifest[name] = dict(manifest[base])
    with open(os.path.join(OUT, 'manifest.json'), 'w', encoding='utf-8') as f:
        json.dump(manifest, f, ensure_ascii=False, indent=1)
        f.write('\n')
    total = sum(os.path.getsize(os.path.join(OUT, n)) for n in os.listdir(OUT))
    print(f'{len(manifest)} Bilder, {total / 1024:.0f} KB -> {os.path.relpath(OUT, ROOT)}')


if __name__ == '__main__':
    sys.exit(main())
