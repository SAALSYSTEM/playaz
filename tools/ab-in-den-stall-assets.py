#!/usr/bin/env python3
"""Ab in den Stall!: ChatGPT-Bilder aus design/ab-in-den-stall/ in einzelne WebP-Bilder zerlegen.

Aufruf: python3 tools/ab-in-den-stall-assets.py   (braucht Pillow, numpy, scipy)
Schreibt public/spiele/ab-in-den-stall/img/*.webp + manifest.json sowie Kachel und Vorschaubild in public/bilder/.
"""
import json
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'design' / 'ab-in-den-stall'
OUT = ROOT / 'public' / 'spiele' / 'ab-in-den-stall' / 'img'
BILDER = ROOT / 'public' / 'bilder'


def x_segments(alpha, count):
    """Bildteile, die durch leere Spalten getrennt sind (von links nach rechts)."""
    cols = (alpha > 20).sum(0)
    segs, start = [], None
    for x, v in enumerate(cols):
        if v > 0 and start is None:
            start = x
        if v == 0 and start is not None:
            segs.append((start, x)); start = None
    if start is not None:
        segs.append((start, len(cols)))
    segs = [s for s in segs if s[1] - s[0] > 30]
    assert len(segs) == count, f'{count} Teile erwartet, {len(segs)} gefunden'
    return segs


def component_masks(alpha, count):
    """Teile, die sich in den Spalten überlappen: zusammenhängende Flächen, Krümel zum nächsten großen Teil."""
    lab, n = ndimage.label(alpha > 40)
    sizes = ndimage.sum(np.ones_like(alpha), lab, range(1, n + 1))
    big = sorted(np.argsort(sizes)[::-1][:count] + 1, key=lambda i: ndimage.center_of_mass(lab == i)[1])
    centers = {i: ndimage.center_of_mass(lab == i) for i in big}
    owner = np.zeros(n + 1, int)
    for i in range(1, n + 1):
        if i in big:
            owner[i] = i; continue
        cy, cx = ndimage.center_of_mass(lab == i)
        owner[i] = min(big, key=lambda b: (centers[b][0] - cy) ** 2 + (centers[b][1] - cx) ** 2)
    owned = owner[lab]
    # halbtransparente Kanten (alpha 1..40) dem nächsten Teil zuordnen
    _, idx = ndimage.distance_transform_edt(owned == 0, return_indices=True)
    owned = owned[idx[0], idx[1]]
    return [(owned == b) & (alpha > 0) for b in big]


def save_part(rgba, mask, name, height):
    img = rgba.copy()
    img[..., 3] = np.where(mask, img[..., 3], 0)
    ys, xs = np.nonzero(img[..., 3] > 8)
    crop = Image.fromarray(img[ys.min():ys.max() + 1, xs.min():xs.max() + 1])
    w = round(crop.width * height / crop.height)
    crop = crop.resize((w, height), Image.LANCZOS)
    crop.save(OUT / f'{name}.webp', 'WEBP', quality=86, method=6)
    return name


def sheet(file, names, height, mode='x', merge=None):
    rgba = np.array(Image.open(SRC / file).convert('RGBA'))
    alpha = rgba[..., 3]
    if mode == 'x':
        segs = x_segments(alpha, len(names) + (len(merge) - 1 if merge else 0))
        masks = []
        for a, b in segs:
            m = np.zeros(alpha.shape, bool); m[:, a:b] = True; masks.append(m)
    else:
        masks = component_masks(alpha, len(names))
    if merge:   # mehrere Teile zu einem Bild (offenes Gatter = Pfosten mit Tür + einzelner Pfosten)
        i = merge[0]
        joined = masks[i]
        for j in merge[1:]:
            joined = joined | masks[j]
        masks = masks[:i] + [joined] + masks[merge[-1] + 1:]
    out = []
    for m, n in zip(masks, names):
        h = height[n] if isinstance(height, dict) else height
        out.append(save_part(rgba, m, n, h))
    return out


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    names = []
    names += sheet('tiere.png', ['tier-kueken', 'tier-ferkel', 'tier-kalb', 'tier-lamm', 'tier-ente', 'tier-fohlen'], 280, mode='comp')
    names += sheet('haeuser.png', ['haus-kueken', 'haus-ferkel', 'haus-kalb', 'haus-lamm', 'teich', 'haus-fohlen'], 320)
    names += sheet('gegenstaende.png', ['baum', 'heuballen', 'pfuetze', 'gatter-zu', 'gatter-auf'],
                   {'baum': 300, 'heuballen': 220, 'pfuetze': 150, 'gatter-zu': 220, 'gatter-auf': 220}, merge=[4, 5])
    (OUT / 'manifest.json').write_text(json.dumps(names) + '\n')
    # Kachel (quadratisch, ohne Schrift) und Vorschaubild für Teilen (1200×630, mit Schrift)
    Image.open(SRC / 'kachel.png').convert('RGB').resize((720, 720), Image.LANCZOS).save(BILDER / 'ab-in-den-stall.webp', 'WEBP', quality=84, method=6)
    og = Image.open(SRC / 'social-preview.png').convert('RGB')
    tw = og.height * 1200 / 630
    if tw <= og.width:
        x0 = (og.width - tw) / 2; og = og.crop((round(x0), 0, round(x0 + tw), og.height))
    og.resize((1200, 630), Image.LANCZOS).save(BILDER / 'ab-in-den-stall-og.jpg', 'JPEG', quality=86, optimize=True, progressive=True)
    print('geschrieben:', ', '.join(names))


if __name__ == '__main__':
    main()
