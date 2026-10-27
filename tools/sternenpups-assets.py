#!/usr/bin/env python3
"""Sternenpups: ChatGPT-Bilder aus design/sternenpups/ in WebP-Bilder fürs Spiel umwandeln.

Aufruf: python3 tools/sternenpups-assets.py   (braucht Pillow, numpy, scipy)
Erwartet Einzeldateien (Namen siehe BILDER unten). Fehlende Dateien werden übersprungen – das Spiel zeichnet dafür Platzhalter.
Schreibt public/spiele/sternenpups/img/*.webp + manifest.json sowie Kachel und Teilen-Vorschau in public/bilder/.
Hat ein Bild keinen echten transparenten Hintergrund, wird eine einfarbige oder karierte Randfläche entfernt.
"""
import json
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'design' / 'sternenpups'
OUT = ROOT / 'public' / 'spiele' / 'sternenpups' / 'img'
BILDER = ROOT / 'public' / 'bilder'

# Name -> Zielhöhe in Pixeln (freigestellt, auf den Inhalt zugeschnitten)
BILDER_FREI = {
    'einhorn': 300, 'einhorn-flug': 300, 'einhorn-jubel': 300,
    'fee': 260, 'fee-traurig': 260, 'elf': 250,
    'wolke-1': 180, 'wolke-2': 200, 'wolke-3': 220, 'ziel': 520, 'boden': 1000,
    'ranke': 900, 'regenbogen': 420, 'zauberstab': 120, 'stern': 140,
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


def cut(name, height):
    f = find(name)
    if not f:
        return None
    rgba = remove_background(np.array(Image.open(f).convert('RGBA')))
    rgba = drop_specks(rgba, keep_small=name in ('zauberstab', 'ranke'))
    ys, xs = np.nonzero(rgba[..., 3] > 8)
    crop = Image.fromarray(rgba[ys.min():ys.max() + 1, xs.min():xs.max() + 1])
    w = round(crop.width * height / crop.height)
    crop.resize((w, height), Image.LANCZOS).save(OUT / f'{name}.webp', 'WEBP', quality=86, method=6)
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
        im.crop(((im.width - s) // 2, (im.height - s) // 2, (im.width + s) // 2, (im.height + s) // 2)).resize((720, 720), Image.LANCZOS).save(BILDER / 'sternenpups.webp', 'WEBP', quality=84, method=6)
    s = find('social-preview')
    if not s and k and bg:
        # Ersatz, bis ein eigenes Motiv da ist: Kachel rechts auf dem Himmel
        sky = Image.open(bg).convert('RGB').resize((1200, 1800), Image.LANCZOS).crop((0, 600, 1200, 1230))
        tile = Image.open(k).convert('RGB').resize((630, 630), Image.LANCZOS)
        m = Image.new('L', (630, 630), 0)
        from PIL import ImageDraw, ImageFilter
        ImageDraw.Draw(m).rounded_rectangle((30, 30, 600, 600), 60, fill=255)
        sky.paste(tile, (540, 0), m.filter(ImageFilter.GaussianBlur(2)))
        sky.save(BILDER / 'sternenpups-og.jpg', 'JPEG', quality=86)
    if s:
        im = Image.open(s).convert('RGB')
        h = min(im.height, round(im.width * 630 / 1200)); w = min(im.width, round(im.height * 1200 / 630))
        left, top = (im.width - w) // 2, (im.height - h) // 2
        im.crop((left, top, left + w, top + h)).resize((1200, 630), Image.LANCZOS).save(BILDER / 'sternenpups-og.jpg', 'JPEG', quality=86)
    print('Bilder:', ', '.join(made) or '–', '| Kachel:', 'ja' if k else 'nein', '| Vorschau:', 'ja' if s else 'nein')


if __name__ == '__main__':
    main()
