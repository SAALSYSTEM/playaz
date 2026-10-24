#!/usr/bin/env python3
"""Krümel – Laufzeitbilder aus den ChatGPT-Originalen erzeugen.

    python3 tools/kruemel-assets.py

Quelle:  design/kruemel/*.png (Originale, werden nicht verändert)
Ziel:    public/spiele/kruemel/img/*.webp

Sprite-Sheets werden automatisch in zusammenhängende Figuren zerlegt
(nicht jede Pose ist gleich breit, manche überlappen sich in der Breite). Fast durchsichtige Ränder (Alpha < 40) werden entfernt,
damit kein Schleier um die Figuren bleibt. Fehlt ein Original, wird es übersprungen –
das Spiel zeichnet dann weiter seinen Platzhalter.
Benötigt Pillow, numpy und scipy.
"""
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
SRC = os.path.join(ROOT, 'design', 'kruemel')
OUT = os.path.join(ROOT, 'public', 'spiele', 'kruemel', 'img')

# Quelle, erwartete Teilbilder (Namen von links nach rechts), maximale Höhe der Ausgabe in px
SHEETS = [
    ('schlafkater.png', ['schlafkater-0', 'schlafkater-1', 'schlafkater-2'], 160),
    ('waage.png', ['waage', 'schale-a', 'schale-b'], 120),
    ('extras.png', ['linse-0', 'linse-1', 'linse-2', 'linse-3', 'linse-4', 'cookie', 'cookie-riss', 'cookie-krumen', 'kaese-station', 'minze'], 96),
]
BACKGROUNDS = [('kammer-hintergrund.png', 'kammer-hintergrund', 640)]


def split_cols(img, n):
    """Zuerst an durchsichtigen Spalten trennen; zu viele Stücke (z. B. Krümel neben dem Cookie)
    werden über die kleinste Lücke zusammengelegt. None, wenn es weniger als n Stücke gibt."""
    arr = np.array(img)
    cols = (arr[..., 3] > 150).sum(axis=0) > 2
    parts, start = [], None
    for x, on in enumerate(cols):
        if on and start is None:
            start = x
        elif not on and start is not None:
            parts.append([start, x]); start = None
    if start is not None:
        parts.append([start, len(cols)])
    if len(parts) < n:
        return None
    while len(parts) > n:
        gaps = [parts[i + 1][0] - parts[i][1] for i in range(len(parts) - 1)]
        i = int(np.argmin(gaps))
        parts[i] = [parts[i][0], parts[i + 1][1]]
        del parts[i + 1]
    out = []
    for k, (x0, x1) in enumerate(parts):
        lo = 0 if k == 0 else (parts[k - 1][1] + x0) // 2
        hi = len(cols) if k == len(parts) - 1 else (x1 + parts[k + 1][0]) // 2
        part = arr.copy(); part[:, :lo] = 0; part[:, hi:] = 0
        out.append(Image.fromarray(part))
    return out


def split(img, n):
    """Teilbilder als zusammenhängende Flächen finden (Posen dürfen sich in der Breite überlappen,
    z. B. ein Schwanz über der Nachbarpose). Kleine Splitter gehören zur nächstgelegenen großen Fläche.
    Liefert je Teilbild ein eigenes RGBA-Bild (nur seine Pixel), von links nach rechts."""
    arr = np.array(img)
    mask = ndimage.binary_dilation(arr[..., 3] > 40, iterations=3)
    lab, cnt = ndimage.label(mask)
    if cnt < n:
        return []
    sizes = ndimage.sum(mask, lab, range(1, cnt + 1))
    big = [int(i) + 1 for i in np.argsort(sizes)[::-1][:n]]
    centers = {i: ndimage.center_of_mass(mask, lab, i) for i in range(1, cnt + 1)}
    group = {}
    for i in range(1, cnt + 1):
        if i in big:
            group[i] = i
        else:
            cy, cx = centers[i]
            group[i] = min(big, key=lambda b: (centers[b][0] - cy) ** 2 + (centers[b][1] - cx) ** 2)
    out = []
    for b in sorted(big, key=lambda b: centers[b][1]):
        sel = np.isin(lab, [i for i, g in group.items() if g == b])
        part = arr.copy()
        part[~sel] = 0
        out.append(Image.fromarray(part))
    return out


def clean(img):
    a = np.array(img).copy()
    a[a[..., 3] < 40] = 0
    return Image.fromarray(a)


def main():
    os.makedirs(OUT, exist_ok=True)
    for src, names, max_h in SHEETS:
        path = os.path.join(SRC, src)
        if not os.path.exists(path):
            print('fehlt:', src); continue
        img = clean(Image.open(path).convert('RGBA'))
        parts = split_cols(img, len(names)) or split(img, len(names))
        if len(parts) != len(names):
            sys.exit(f'{src}: {len(parts)} Teile gefunden, erwartet {len(names)}')
        for part, name in zip(parts, names):
            bbox = part.getbbox()
            part = part.crop(bbox)
            k = min(1, max_h / part.height)
            part = part.resize((max(1, round(part.width * k)), max(1, round(part.height * k))), Image.LANCZOS)
            part.save(os.path.join(OUT, name + '.webp'), 'WEBP', quality=88, method=6)
            print(f'{name}.webp {part.width}×{part.height}')
    for src, name, h in BACKGROUNDS:
        path = os.path.join(SRC, src)
        if not os.path.exists(path):
            print('fehlt:', src); continue
        img = Image.open(path).convert('RGB')
        img = img.resize((round(img.width * h / img.height), h), Image.LANCZOS)
        img.save(os.path.join(OUT, name + '.webp'), 'WEBP', quality=80, method=6)
        print(f'{name}.webp {img.width}×{img.height}')


if __name__ == '__main__':
    main()
