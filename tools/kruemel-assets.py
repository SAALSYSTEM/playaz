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
from PIL import Image, ImageEnhance, ImageFilter
from scipy import ndimage

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
SRC = os.path.join(ROOT, 'design', 'kruemel')
OUT = os.path.join(ROOT, 'public', 'spiele', 'kruemel', 'img')

# Quelle, erwartete Teilbilder (Namen von links nach rechts), maximale Höhe der Ausgabe in px
MAUS = ['stehen', 'lauf-0', 'lauf-1', 'lauf-2', 'lauf-3', 'sprung', 'klettern', 'autsch']
SHEETS = [
    ('kruemel-b.png', ['maus-klein-' + n for n in MAUS], 128),
    ('kruemel-a.png', ['maus-gross-' + n for n in MAUS], 160),
    ('kaetzchen.png', ['kaetzchen-0', 'kaetzchen-1', 'kaetzchen-2', 'kaetzchen-flucht'], 128),
    ('items.png', ['kruemel', 'goldkaese', 'fahne-zu', 'fahne-auf', 'kaeseglocke', 'zucker'], 128),
    ('kueche-objekte.png', ['regalbrett', 'kochloeffel', 'schublade', 'schrank', 'arbeitsplatte', 'fliese'], 128),
    ('schlafkater.png', ['schlafkater-0', 'schlafkater-1', 'schlafkater-2'], 160),
    ('waage.png', ['waage', 'schale-a', 'schale-b'], 120),
    ('extras.png', ['linse-0', 'linse-1', 'linse-2', 'linse-3', 'linse-4', 'cookie', 'cookie-riss', 'cookie-krumen', 'kaese-station', 'minze'], 96),
]
BACKGROUNDS = [('kammer-hintergrund.png', 'kammer-hintergrund', 640), ('kueche-hintergrund.png', 'kueche-hintergrund', 640),
               ('keller-hintergrund.png', 'keller-hintergrund', 640), ('garten-hintergrund.png', 'garten-hintergrund', 640)]


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


def split_even(img, n):
    """Letzter Ausweg, wenn sich Posen berühren (z. B. Ohr an Schwanz): n gleich breite Felder über den
    Inhalt legen und jeweils an der dünnsten Spalte in der Nähe der Feldgrenze schneiden."""
    arr = np.array(img)
    dens = (arr[..., 3] > 150).sum(axis=0)
    xs = np.where(dens > 2)[0]
    x0, x1 = int(xs.min()), int(xs.max()) + 1
    step = (x1 - x0) / n
    cuts = [x0]
    for k in range(1, n):
        c = int(x0 + k * step); r = int(step * 0.25)
        cuts.append(c - r + int(np.argmin(dens[c - r:c + r])))
    cuts.append(x1)
    out = []
    for a, b in zip(cuts, cuts[1:]):
        part = arr.copy(); part[:, :a] = 0; part[:, b:] = 0
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
        if len(parts) != len(names) or max(p.getbbox()[2] - p.getbbox()[0] for p in parts) > 1.8 * min(p.getbbox()[2] - p.getbbox()[0] for p in parts) and src.startswith('kruemel'):
            parts = split_even(img, len(names))
        if len(parts) != len(names):
            sys.exit(f'{src}: {len(parts)} Teile gefunden, erwartet {len(names)}')
        # Figuren-Posen: gemeinsame Ober-/Unterkante, damit die Animation nicht springt (Füße bleiben auf einer Linie)
        same_rows = src.startswith(('kruemel', 'kaetzchen', 'schlafkater'))
        boxes = [p.getbbox() for p in parts]
        top, bottom = min(b[1] for b in boxes), max(b[3] for b in boxes)
        k_all = min(1, max_h / (bottom - top))
        for part, name, bbox in zip(parts, names, boxes):
            part = part.crop((bbox[0], top, bbox[2], bottom) if same_rows else bbox)
            k = k_all if same_rows else min(1, max_h / part.height)
            part = part.resize((max(1, round(part.width * k)), max(1, round(part.height * k))), Image.LANCZOS)
            part.save(os.path.join(OUT, name + '.webp'), 'WEBP', quality=88, method=6)
            print(f'{name}.webp {part.width}×{part.height}')
    for src, name, h in BACKGROUNDS:
        path = os.path.join(SRC, src)
        if not os.path.exists(path):
            print('fehlt:', src); continue
        img = Image.open(path).convert('RGB')
        img = img.resize((round(img.width * h / img.height), h), Image.LANCZOS)
        # Hintergrund zurücknehmen: leicht unscharf, weniger Kontrast und Farbe – sonst sehen gemalte Schränke wie Plattformen aus
        img = img.filter(ImageFilter.GaussianBlur(2.2))
        img = ImageEnhance.Contrast(img).enhance(0.72)
        img = ImageEnhance.Color(img).enhance(0.75)
        img = ImageEnhance.Brightness(img).enhance(1.06)
        img.save(os.path.join(OUT, name + '.webp'), 'WEBP', quality=80, method=6)
        print(f'{name}.webp {img.width}×{img.height}')


if __name__ == '__main__':
    main()
