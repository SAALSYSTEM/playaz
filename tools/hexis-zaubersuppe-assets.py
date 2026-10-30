#!/usr/bin/env python3
"""Hexis Zaubersuppe: ChatGPT-Bilder aus design/hexis-zaubersuppe/ als WebP fürs Spiel aufbereiten.

Aufruf: python3 tools/hexis-zaubersuppe-assets.py   (braucht Pillow und numpy; ffmpeg für die Musik)
Schreibt public/spiele/hexis-zaubersuppe/img/*.webp + manifest.json, musik.mp3 sowie Kachel und Vorschaubild in public/bilder/.
Der Kessel wird zusätzlich in "kessel-suppe" zerlegt: nur die graue Suppe (das Spiel färbt sie je nach Zutaten ein).
"""
import json
import shutil
import subprocess
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'design' / 'hexis-zaubersuppe'
GAME = ROOT / 'public' / 'spiele' / 'hexis-zaubersuppe'
OUT = GAME / 'img'
BILDER = ROOT / 'public' / 'bilder'

# Name -> Höhe in Pixeln (freigestellt, Seitenverhältnis bleibt)
SPRITES = {
    'hexe': 520, 'hexe-jubel': 520, 'hexe-ueberrascht': 520,
    'kater': 400, 'kater-lila': 400, 'kater-fluegel': 400, 'kater-hut': 400,
    'kater-kuerbis': 400, 'kater-regenbogen': 400, 'kater-winzig': 400,
    'rauchwolke': 420,
    'frosch': 200, 'kuerbis': 200, 'stern': 200, 'pilz': 200, 'fledermaus': 160,
    'apfel': 200, 'bonbon': 120, 'feder': 200, 'mond': 200, 'beeren': 200,
}


def trim(img):
    a = np.array(img)[..., 3]
    ys, xs = np.nonzero(a > 8)
    return (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)


def save(img, name, height):
    w = round(img.width * height / img.height)
    img.resize((w, height), Image.LANCZOS).save(OUT / f'{name}.webp', 'WEBP', quality=86, method=6)


def kessel():
    img = Image.open(SRC / 'kessel.png').convert('RGBA')
    box = trim(img)
    img = img.crop(box)
    a = np.array(img).astype(int)
    r, g, b, al = a[..., 0], a[..., 1], a[..., 2], a[..., 3]
    hell = (r + g + b) / 3
    grau = (np.max(a[..., :3], axis=2) - np.min(a[..., :3], axis=2)) < 22
    h = a.shape[0]
    oben = np.zeros_like(grau); oben[: int(h * 0.55)] = True
    suppe = grau & (hell > 150) & (al > 200) & oben
    # nur die größte zusammenhängende Fläche (Suppe), Glanzpunkte am Rand ignorieren
    from scipy import ndimage
    lab, n = ndimage.label(suppe)
    if n:
        sizes = ndimage.sum(np.ones_like(lab), lab, range(1, n + 1))
        suppe = lab == (int(np.argmax(sizes)) + 1)
        suppe = ndimage.binary_fill_holes(suppe)
        suppe = ndimage.binary_dilation(suppe, iterations=2) & (al > 0)
    soup = np.array(img).copy()
    soup[..., 3] = np.where(suppe, soup[..., 3], 0)
    H = 420
    save(img, 'kessel', H)
    save(Image.fromarray(soup.astype(np.uint8)), 'kessel-suppe', H)
    ys, xs = np.nonzero(suppe)
    print(f'Suppe: x {xs.min() / img.width:.3f}–{xs.max() / img.width:.3f}, y {ys.min() / img.height:.3f}–{ys.max() / img.height:.3f}')
    return ['kessel', 'kessel-suppe']


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    names = []
    for name, height in SPRITES.items():
        img = Image.open(SRC / f'{name}.png').convert('RGBA')
        save(img.crop(trim(img)), name, height)
        names.append(name)
    names += kessel()
    # Hintergrund: Hochformat, als JPEG-artiges WebP ohne Transparenz
    bg = Image.open(SRC / 'hintergrund.png').convert('RGB')
    bg.resize((720, round(bg.height * 720 / bg.width)), Image.LANCZOS).save(OUT / 'hintergrund.webp', 'WEBP', quality=80, method=6)
    names.append('hintergrund')
    (OUT / 'manifest.json').write_text(json.dumps(names) + '\n')

    # Kachel (quadratisch, ohne Schrift) und Vorschaubild für Teilen (1200×630, mit Schrift)
    Image.open(SRC / 'kachel.png').convert('RGB').resize((720, 720), Image.LANCZOS).save(BILDER / 'hexis-zaubersuppe.webp', 'WEBP', quality=84, method=6)
    og = Image.open(SRC / 'social-preview.png').convert('RGB')
    tw = og.height * 1200 / 630
    if tw <= og.width:
        x0 = (og.width - tw) / 2; og = og.crop((round(x0), 0, round(x0 + tw), og.height))
    og.resize((1200, 630), Image.LANCZOS).save(BILDER / 'hexis-zaubersuppe-og.jpg', 'JPEG', quality=86, optimize=True, progressive=True)

    # Musik: mono, 64 kbit/s (Original von Pixabay bleibt in design/)
    src = SRC / 'musik-original.mp3'
    if src.exists() and shutil.which('ffmpeg'):
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', str(src), '-ac', '1', '-b:a', '64k', str(GAME / 'musik.mp3')], check=True)
    print('geschrieben:', ', '.join(names))


if __name__ == '__main__':
    main()
