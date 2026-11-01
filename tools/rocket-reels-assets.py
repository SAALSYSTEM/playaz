#!/usr/bin/env python3
"""Rocket Reels: ChatGPT-Bilder aus design/rocket-reels/ in schlanke WebP-Dateien fürs Spiel umwandeln.

Aufruf: python3 tools/rocket-reels-assets.py   (braucht Pillow, numpy, scipy)
Erwartet Einzeldateien (Namen und Prompts in design/rocket-reels/PROMPTS.md). Fehlende Dateien werden übersprungen –
das Spiel zeichnet dafür eigene Platzhalter. Optional: Musik als design/rocket-reels/ton/musik.mp3 bzw. freispiele.mp3.
Schreibt public/spiele/rocket-reels/img/*.webp (+ manifest.json), ton/*.mp3 sowie Kachel und Teilen-Vorschau in public/bilder/.
Hat ein freigestelltes Bild keinen echten Alphakanal, wird eine einfarbige oder karierte Randfläche entfernt.
"""
import json
import shutil
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'design' / 'rocket-reels'
OUT = ROOT / 'public' / 'spiele' / 'rocket-reels' / 'img'
TON = ROOT / 'public' / 'spiele' / 'rocket-reels' / 'ton'
BILDER = ROOT / 'public' / 'bilder'

SYMBOLE = ['rakete', 'astronaut', 'alien', 'planet', 'kristall', 'meteor', 'satellit', 'a', 'k', 'q', 'j', 'zehn', 'stargate']
# Name -> größte Kantenlänge (freigestellt, auf den Inhalt zugeschnitten). Walzenzellen sind auf dem Handy höchstens ~120 CSS-px groß.
FREI = {**{'sym-' + s: 288 for s in SYMBOLE}, 'rakete': 420}
# Vollbilder: Name -> Breite
VOLL = {'hintergrund': 900, 'bonus-hintergrund': 900, 'risiko-hintergrund': 900}


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
    grey = (np.abs(rgb[..., 0] - rgb[..., 1]) < 8) & (np.abs(rgb[..., 1] - rgb[..., 2]) < 8) & (rgb.min(-1) > 185)
    lab, _ = ndimage.label(near | grey)
    border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    bg = ndimage.binary_opening(np.isin(lab, list(border)), iterations=1)
    out = rgba.copy()
    out[..., 3] = np.where(bg, 0, out[..., 3])
    edge = ndimage.binary_dilation(bg, iterations=1) & ~bg
    out[..., 3] = np.where(edge, (out[..., 3] * 0.5).astype(np.uint8), out[..., 3])
    return out


def drop_specks(rgba):
    a = rgba[..., 3]
    lab, n = ndimage.label(a > 24)
    if n <= 1:
        return rgba
    sizes = ndimage.sum(np.ones_like(a), lab, range(1, n + 1))
    keep = np.zeros(n + 1, bool)
    keep[1:] = sizes >= sizes.max() * 0.01
    mask = ndimage.binary_dilation(keep[lab], iterations=3)
    out = rgba.copy()
    out[..., 3] = np.where(mask, a, 0)
    return out


def cut(name, size):
    f = find(name)
    if not f:
        return None
    rgba = drop_specks(remove_background(np.array(Image.open(f).convert('RGBA'))))
    ys, xs = np.nonzero(rgba[..., 3] > 8)
    crop = Image.fromarray(rgba[ys.min():ys.max() + 1, xs.min():xs.max() + 1])
    s = size / max(crop.width, crop.height)
    crop.resize((round(crop.width * s), round(crop.height * s)), Image.LANCZOS).save(OUT / f'{name}.webp', 'WEBP', quality=86, method=6)
    return f'{name}.webp'


def voll(name, breite):
    f = find(name)
    if not f:
        return None
    im = Image.open(f).convert('RGB')
    im.resize((breite, round(im.height * breite / im.width)), Image.LANCZOS).save(OUT / f'{name}.webp', 'WEBP', quality=78, method=6)
    return f'{name}.webp'


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    made = [n for n in (cut(k, h) for k, h in FREI.items()) if n]
    made += [n for n in (voll(k, b) for k, b in VOLL.items()) if n]
    r = find('rahmen')
    if r:  # Rahmen bleibt schwarz hinterlegt: das Spiel mischt ihn per "screen", Schwarz wird dadurch unsichtbar
        im = Image.open(r).convert('RGB')
        im.resize((1200, round(im.height * 1200 / im.width)), Image.LANCZOS).save(OUT / 'rahmen.webp', 'WEBP', quality=84, method=6)
        made.append('rahmen.webp')
    toene = []
    if (SRC / 'ton').is_dir():
        TON.mkdir(parents=True, exist_ok=True)
        for name in ('musik', 'freispiele'):
            q = SRC / 'ton' / f'{name}.mp3'
            if q.exists():
                shutil.copyfile(q, TON / f'{name}.mp3')
                toene.append(f'ton/{name}.mp3')
    (OUT / 'manifest.json').write_text(json.dumps(made + toene) + '\n')
    k = find('kachel')
    if k:
        im = Image.open(k).convert('RGB'); s = min(im.size)
        im.crop(((im.width - s) // 2, (im.height - s) // 2, (im.width + s) // 2, (im.height + s) // 2)).resize((720, 720), Image.LANCZOS).save(BILDER / 'rocket-reels.webp', 'WEBP', quality=84, method=6)
    s = find('social')
    if s:
        im = Image.open(s).convert('RGB')
        h = min(im.height, round(im.width * 630 / 1200)); w = min(im.width, round(im.height * 1200 / 630))
        left, top = (im.width - w) // 2, (im.height - h) // 2
        im.crop((left, top, left + w, top + h)).resize((1200, 630), Image.LANCZOS).save(BILDER / 'rocket-reels-og.jpg', 'JPEG', quality=86)
    fehlen = [n for n in list(FREI) + list(VOLL) + ['rahmen'] if not find(n)]
    print('Bilder:', ', '.join(made) or '–')
    print('Musik:', ', '.join(toene) or '– (Freispiel-Musik wird live erzeugt)')
    print('Kachel:', 'ja' if k else 'nein', '| Vorschau:', 'ja' if s else 'nein')
    print('Noch offen:', ', '.join(fehlen) or 'nichts')


if __name__ == '__main__':
    main()
