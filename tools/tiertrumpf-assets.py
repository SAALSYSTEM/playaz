#!/usr/bin/env python3
"""Tiertrumpf: ChatGPT-Bilder aus design/tiertrumpf/ in WebP-Bilder fürs Spiel umwandeln.

Aufruf: python3 tools/tiertrumpf-assets.py   (braucht Pillow, numpy, scipy)
Erwartet Einzeldateien (Namen siehe BILDER_FREI unten, Prompts in design/tiertrumpf/PROMPTS.md).
Fehlende Dateien werden übersprungen – das Spiel zeigt dafür die Emoji-Platzhalter.
Schreibt public/spiele/tiertrumpf/img/*.webp + manifest.json sowie Kachel und Teilen-Vorschau in public/bilder/.
Hat ein Bild keinen echten transparenten Hintergrund, wird eine einfarbige oder karierte Randfläche entfernt.
"""
import json
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'design' / 'tiertrumpf'
OUT = ROOT / 'public' / 'spiele' / 'tiertrumpf' / 'img'
BILDER = ROOT / 'public' / 'bilder'

# Name -> größte Kantenlänge in Pixeln (freigestellt, auf den Inhalt zugeschnitten)
BILDER_FREI = {
    'elefant': 320, 'panda': 320, 'frosch': 320, 'katze': 320, 'loewe': 320, 'hase': 320,
    'fiete': 300, 'fiete-denkt': 300, 'fiete-jubel': 300,
}


def find(name):
    for ext in ('.png', '.webp', '.jpg', '.jpeg'):
        f = SRC / (name + ext)
        if f.exists():
            return f
    return None


def remove_background(rgba):
    """Randfläche entfernen, falls das Bild keinen echten Alphakanal hat (weiß, einfarbig oder Schachbrett)."""
    if (rgba[..., 3] < 250).mean() > 0.02:
        return rgba
    rgb = rgba[..., :3].astype(int)
    corners = np.array([rgb[0, 0], rgb[0, -1], rgb[-1, 0], rgb[-1, -1]])
    near = np.zeros(rgb.shape[:2], bool)
    for c in corners:
        near |= np.abs(rgb - c).sum(-1) < 40
    # Schachbrett: helle, fast graue Pixel zählen auch zum Hintergrund
    grey = (np.abs(rgb[..., 0] - rgb[..., 1]) < 8) & (np.abs(rgb[..., 1] - rgb[..., 2]) < 8) & (rgb.min(-1) > 185)
    cand = near | grey
    lab, _ = ndimage.label(cand)
    border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    bg = np.isin(lab, list(border))
    bg = ndimage.binary_opening(bg, iterations=1)
    out = rgba.copy()
    out[..., 3] = np.where(bg, 0, out[..., 3])
    # weiche Kante
    edge = ndimage.binary_dilation(bg, iterations=1) & ~bg
    out[..., 3] = np.where(edge, (out[..., 3] * 0.5).astype(np.uint8), out[..., 3])
    return out


def drop_specks(rgba, keep_small=False):
    """Lose Krümel (kleine, abgetrennte Pixelinseln) entfernen, damit der Zuschnitt stimmt.
    keep_small: kleine Teile in der Nähe des Hauptteils behalten (Funken am Zauberstab)."""
    a = rgba[..., 3]
    lab, n = ndimage.label(a > 24)
    if n <= 1:
        return rgba
    sizes = ndimage.sum(np.ones_like(a), lab, range(1, n + 1))
    big = sizes.max()
    keep = np.zeros(n + 1, bool)
    keep[1:] = sizes >= big * (0.002 if keep_small else 0.03)
    mask = keep[lab]
    mask = ndimage.binary_dilation(mask, iterations=3)
    out = rgba.copy()
    out[..., 3] = np.where(mask, a, 0)
    return out


def cut(name, size):
    f = find(name)
    if not f:
        return None
    rgba = remove_background(np.array(Image.open(f).convert('RGBA')))
    rgba = drop_specks(rgba)
    ys, xs = np.nonzero(rgba[..., 3] > 8)
    crop = Image.fromarray(rgba[ys.min():ys.max() + 1, xs.min():xs.max() + 1])
    s = size / max(crop.width, crop.height)
    crop.resize((round(crop.width * s), round(crop.height * s)), Image.LANCZOS).save(OUT / f'{name}.webp', 'WEBP', quality=86, method=6)
    return name


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    made = [n for n in (cut(k, h) for k, h in BILDER_FREI.items()) if n]
    bg = find('hintergrund')
    if bg:
        im = Image.open(bg).convert('RGB')
        im.resize((768, round(im.height * 768 / im.width)), Image.LANCZOS).save(OUT / 'hintergrund.webp', 'WEBP', quality=80, method=6)
        made.append('hintergrund')
    (OUT / 'manifest.json').write_text(json.dumps(made) + '\n')
    k = find('kachel')
    if k:
        im = Image.open(k).convert('RGB'); s = min(im.size)
        im.crop(((im.width - s) // 2, (im.height - s) // 2, (im.width + s) // 2, (im.height + s) // 2)).resize((720, 720), Image.LANCZOS).save(BILDER / 'tiertrumpf.webp', 'WEBP', quality=84, method=6)
    s = find('social-preview')
    if s:
        im = Image.open(s).convert('RGB')
        h = min(im.height, round(im.width * 630 / 1200)); w = min(im.width, round(im.height * 1200 / 630))
        left, top = (im.width - w) // 2, (im.height - h) // 2
        im.crop((left, top, left + w, top + h)).resize((1200, 630), Image.LANCZOS).save(BILDER / 'tiertrumpf-og.jpg', 'JPEG', quality=86)
    print('Bilder:', ', '.join(made) or '–', '| Kachel:', 'ja' if k else 'nein (Platzhalter bleibt)', '| Vorschau:', 'ja' if s else 'nein (Platzhalter bleibt)')


if __name__ == '__main__':
    main()
