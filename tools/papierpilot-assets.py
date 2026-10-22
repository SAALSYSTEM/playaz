#!/usr/bin/env python3
"""PAPIERPILOT – Laufzeitbilder aus den ChatGPT-Originalen erzeugen.

    python3 tools/papierpilot-assets.py

Quelle: design/papierpilot/pp-*.png (Originale, werden nicht verändert)
Ziel:   public/spiele/papierpilot/img/*.webp + manifest.json

Freigestellte Bilder: Alpha-Rauschen entfernen (ChatGPT liefert Reste mit Alpha 1–10 und ein
Inneres mit Alpha ~253), auf den sichtbaren Umriss zuschneiden, verkleinern. Beide Flieger werden
mit demselben Ausschnitt geschnitten, damit sie beim Umschalten nicht springen.
Ankerpunkt der Hindernisse = Mitte der Unterkante des Ausschnitts (Fußpunkt).
Benötigt Pillow und numpy.
"""
import json
import os

import numpy as np
from PIL import Image

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
SRC = os.path.join(ROOT, 'design', 'papierpilot')
OUT = os.path.join(ROOT, 'public', 'spiele', 'papierpilot', 'img')

# Name, Quelle, maximale Breite, maximale Höhe
SPRITES = [
    ('baum-rund', 'pp-baum-rund.png', 512, 512),
    ('baum-zypresse', 'pp-baum-zypresse.png', 256, 640),
    ('haus', 'pp-haus.png', 512, 512),
    ('haus-schmal', 'pp-haus-schmal.png', 320, 640),
    ('haus-flach', 'pp-haus-flach.png', 640, 320),
    ('turm', 'pp-turm.png', 256, 768),
]
FLIEGER = [('flieger-gerade', 'pp-flieger-gerade.png'), ('flieger-kurve', 'pp-flieger-kurve.png')]


def sauber(im):
    """Alpha-Rauschen weg, Inneres voll deckend."""
    a = np.array(im.convert('RGBA')).astype(np.float32)
    al = a[..., 3]
    al = np.clip((al - 16.0) * 255.0 / (240.0 - 16.0), 0, 255)
    a[..., 3] = al
    return Image.fromarray(a.astype(np.uint8), 'RGBA')


def umriss(im, pad=2):
    al = np.array(im)[..., 3]
    ys, xs = np.where(al > 24)
    return (max(0, xs.min() - pad), max(0, ys.min() - pad), min(im.width, xs.max() + 1 + pad), min(im.height, ys.max() + 1 + pad))


def klein(im, mw, mh):
    f = min(mw / im.width, mh / im.height, 1.0)
    return im.resize((max(1, round(im.width * f)), max(1, round(im.height * f))), Image.LANCZOS)


def main():
    os.makedirs(OUT, exist_ok=True)
    manifest = {}
    for name, src, mw, mh in SPRITES:
        im = sauber(Image.open(os.path.join(SRC, src)))
        im = klein(im.crop(umriss(im)), mw, mh)
        im.save(os.path.join(OUT, name + '.webp'), 'WEBP', quality=86, method=6)
        manifest[name] = {'w': im.width, 'h': im.height}
    # Flieger: gemeinsamer Ausschnitt (Vereinigung beider Umrisse)
    bilder = [(n, sauber(Image.open(os.path.join(SRC, s)))) for n, s in FLIEGER]
    boxen = [umriss(i) for _, i in bilder]
    box = (min(b[0] for b in boxen), min(b[1] for b in boxen), max(b[2] for b in boxen), max(b[3] for b in boxen))
    for name, im in bilder:
        im = klein(im.crop(box), 512, 512)
        im.save(os.path.join(OUT, name + '.webp'), 'WEBP', quality=88, method=6)
        manifest[name] = {'w': im.width, 'h': im.height}
    # Boden: deckend, nahtlos gekachelt
    g = Image.open(os.path.join(SRC, 'pp-boden-park.png')).convert('RGB').resize((512, 512), Image.LANCZOS)
    g.save(os.path.join(OUT, 'boden-park.webp'), 'WEBP', quality=80, method=6)
    manifest['boden-park'] = {'w': 512, 'h': 512}
    # Panorama: deckend; Dunstfarbe am unteren Rand für den Bodennebel
    p = Image.open(os.path.join(SRC, 'pp-panorama.png')).convert('RGB')
    dunst = np.array(p)[-24:].reshape(-1, 3).mean(0).round().astype(int).tolist()
    p = p.resize((1024, round(1024 * p.height / p.width)), Image.LANCZOS)
    p.save(os.path.join(OUT, 'panorama.webp'), 'WEBP', quality=82, method=6)
    manifest['panorama'] = {'w': p.width, 'h': p.height, 'horizont': 0.56, 'dunst': '#%02x%02x%02x' % tuple(dunst)}
    with open(os.path.join(OUT, 'manifest.json'), 'w', encoding='utf-8') as f:
        json.dump(manifest, f, indent=1)
    for k, v in manifest.items():
        print(k, v)


if __name__ == '__main__':
    main()
