#!/usr/bin/env python3
"""Neon Coast – Sternenfahrt: einzelne Motive aus den Neon-Coast-Referenztafeln freistellen und als WebP fürs Spiel speichern.

Aufruf: python3 tools/sternenfahrt-assets.py [--preview]   (braucht Pillow, numpy, scipy)

Die Tafeln (design/sternenfahrt/tafel-*.png) haben einen dunklen Navy-Hintergrund mit Beschriftungen.
Je Motiv wird ein Ausschnitt ohne Beschriftung gewählt, der Hintergrund von den Rändern her entfernt
(nur zusammenhängende Navy-Flächen, damit dunkle Fenster/Reifen im Motiv bleiben), die Kante weich
ausgeblendet und der Navy-Farbsaum herausgerechnet. Schatten der Tafel fallen weg, das Spiel zeichnet eigene.

Schreibt public/spiele/sternenfahrt/img/*.webp + manifest.json.
Liegen design/sternenfahrt/kachel.png bzw. social-preview.png vor, werden auch Kachel und Teilen-Vorschau erzeugt
(sonst: vorläufige Bilder mit `node tools/sternenfahrt-cover.mjs`).
Radio: design/sternenfahrt/radio/*.mp3 (Pixabay, vom Auftraggeber) → public/spiele/sternenfahrt/radio/ (mono, 64 kbit/s, braucht ffmpeg).
"""
import json
import shutil
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'design' / 'sternenfahrt'
OUT = ROOT / 'public' / 'spiele' / 'sternenfahrt' / 'img'
BILDER = ROOT / 'public' / 'bilder'
PREVIEW = Path(sys.argv[2]) if len(sys.argv) > 2 else ROOT / 'design' / 'sternenfahrt' / '_kontrolle.png'

# Name: (Tafel, Ausschnitt x0, y0, x1, y1, Drehung in Grad gegen den Uhrzeigersinn, Zielhöhe in px)
# Fahrzeuge: Front nach oben. Gebäude: Fassade zur Straße (links der Straße: Fassade rechts).
MOTIVE = {
    # Spielerautos
    'auto-tuerkis':  ('testpaket', 22, 70, 478, 300, 270, 300),
    'auto-pink':     ('fahrzeuge-03', 170, 125, 640, 905, 0, 300),
    'auto-orange':   ('fahrzeuge-02', 1215, 92, 1430, 462, 0, 300),
    # langsame Autos (Hindernisse, fahren in dieselbe Richtung)
    'verkehr-klein': ('fahrzeuge-02', 110, 130, 300, 440, 0, 240),
    'verkehr-lila':  ('fahrzeuge-02', 478, 98, 682, 462, 0, 260),
    'verkehr-taxi':  ('fahrzeuge-02', 850, 108, 1055, 462, 0, 260),
    'verkehr-suv':   ('fahrzeuge-02', 100, 525, 312, 920, 0, 270),
    'verkehr-bus':   ('fahrzeuge-02', 845, 500, 1058, 925, 0, 290),
    # Baustelle (Draufsicht)
    'absperrung':    ('verkehr', 1162, 562, 1518, 712, 0, 110),
    'bake':          ('verkehr', 830, 572, 1098, 698, 0, 90),
    # Grün und Stadtmöbel
    'palme':         ('gruen', 40, 105, 370, 385, 0, 220),
    'palme-faecher': ('gruen', 432, 108, 725, 385, 0, 210),
    'palme-jung':    ('gruen', 812, 108, 1100, 385, 0, 200),
    'baum':          ('gruen', 1178, 105, 1495, 400, 0, 220),
    'zierbaum':      ('gruen', 70, 418, 340, 652, 0, 180),
    'busch':         ('gruen', 440, 435, 720, 640, 0, 150),
    'bank':          ('gruen', 1178, 440, 1488, 580, 90, 150),
    'muelleimer':    ('gruen', 70, 705, 260, 870, 0, 80),
    # Gebäude (Draufsicht, Fassade unten → um 90° gedreht, damit sie links der Straße nach rechts zeigt)
    'haus-wohn':     ('gebaeude', 40, 160, 312, 410, 90, 300),
    'haus-apart':    ('gebaeude', 380, 145, 672, 440, 90, 320),
    'haus-hotel':    ('gebaeude', 715, 140, 1058, 445, 90, 330),
    'haus-laden':    ('gebaeude', 1118, 185, 1380, 395, 90, 280),
    'haus-cafe':     ('gebaeude', 1460, 145, 1745, 440, 90, 310),
    'haus-club':     ('gebaeude', 30, 515, 325, 810, 90, 310),
    'haus-halle':    ('gebaeude', 1090, 515, 1405, 810, 90, 330),
    'haus-werk':     ('gebaeude', 360, 515, 690, 800, 90, 320),
    # Strand und Hafen
    'schirm':        ('strand-hafen', 30, 155, 350, 478, 0, 170),
    'liege':         ('strand-hafen', 605, 155, 780, 495, 0, 150),
    'rettungsturm':  ('strand-hafen', 1045, 160, 1325, 490, 0, 210),
    'steg':          ('strand-hafen', 30, 550, 168, 925, 0, 380),
    'boot':          ('strand-hafen', 685, 515, 870, 965, 0, 300),
    'container':     ('strand-hafen', 1100, 550, 1295, 950, 0, 330),
}
# Fußgänger: 4 Figuren × 3 Posen (Schritt links, Mitte, Schritt rechts), Blick nach unten
FIGUR_ZEILEN = {'mann': (72, 256), 'frau': (285, 468), 'business': (497, 682), 'hafen': (708, 897)}
FIGUR_SPALTEN = {'a': (628, 922), 'b': (928, 1225), 'c': (1231, 1525)}
FIGUR_H = 120

# Bodenflächen: Innenausschnitt der Texturtafel, im Spiel gespiegelt gekachelt
BOEDEN = {
    'boden-sand':   (470, 418, 715, 605),
    'boden-gras':   (117, 418, 362, 605),
    'boden-meer':   (1175, 418, 1420, 605),
    'boden-flach':  (822, 418, 1068, 605),
    'boden-platten': (468, 133, 583, 228),
    'boden-pflaster': (822, 133, 1068, 325),
    'boden-asphalt': (116, 133, 360, 325),
}


RADIO = {
    'karumaru-tailgate-thunder-570779.mp3': 'sender-1.mp3',
    'the_mountain-american-western-country-496543.mp3': 'sender-2.mp3',
    'viacheslavstarostin-country-country-music-615002.mp3': 'sender-3.mp3',
    'fun-prank-music-playful-comedy-intro-459462.mp3': 'sender-4.mp3',
    'freesound_community-fm-radio-static-82334.mp3': 'rauschen.mp3',
}


def is_bg(a):
    r, g, b = a[..., 0].astype(int), a[..., 1].astype(int), a[..., 2].astype(int)
    # Navy der Tafeln: kaum Rot, Blau deutlich über Rot, dunkel (Schlagschatten eingeschlossen)
    return (r < 26) & (b - r > 14) & (b < 92) & (g < 72) & (g < b)


def cutout(img):
    a = np.array(img.convert('RGB'))
    bg = is_bg(a)
    lab, _ = ndimage.label(bg)
    edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    back = np.isin(lab, list(edge))
    fg = ~back
    # Rauschen weg: nur große zusammenhängende Teile behalten
    lab2, n = ndimage.label(fg)
    if n:
        sizes = ndimage.sum(np.ones_like(lab2), lab2, range(1, n + 1))
        keep = [i + 1 for i, s in enumerate(sizes) if s >= max(60, sizes.max() * 0.02)]
        fg = np.isin(lab2, keep)
    fg = ndimage.binary_fill_holes(fg)
    # Hintergrundfarbe (Median) für weiche Kante und Farbsaum
    bgc = np.median(a[back], axis=0) if back.any() else np.array([2, 24, 52])
    dist = np.sqrt(((a.astype(float) - bgc) ** 2).sum(axis=2))
    # Randzone: 2 px nach außen und innen
    inner = ndimage.binary_erosion(fg, iterations=2)
    outer = ndimage.binary_dilation(fg, iterations=1)
    band = outer & ~inner
    alpha = np.where(inner, 1.0, 0.0)
    soft = np.clip((dist - 18) / 70, 0, 1)
    alpha = np.where(band, soft, alpha)
    alpha = ndimage.gaussian_filter(alpha, 0.6) * outer
    alpha = np.where(inner, 1.0, alpha)
    # Farbsaum herausrechnen: C = (P - (1 - α)·B) / α
    al = np.clip(alpha, 1e-3, 1)[..., None]
    col = (a.astype(float) - (1 - al) * bgc) / al
    col = np.clip(col, 0, 255)
    out = np.dstack([col, alpha * 255]).astype(np.uint8)
    im = Image.fromarray(out, 'RGBA')
    ys, xs = np.nonzero(alpha > 0.04)
    return im.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))


def tafel(name, cache={}):
    if name not in cache:
        cache[name] = Image.open(SRC / f'tafel-{name}.png').convert('RGB')
    return cache[name]


def save(im, name, height):
    w = max(1, round(im.width * height / im.height))
    im = im.resize((w, height), Image.LANCZOS)
    im.save(OUT / f'{name}.webp', 'WEBP', quality=88, method=6)
    return im


def mirror_tile(im):
    """Ausschnitt so spiegeln, dass er nahtlos kachelbar wird (2×2)."""
    w, h = im.size
    big = Image.new('RGB', (w * 2, h * 2))
    big.paste(im, (0, 0))
    big.paste(im.transpose(Image.FLIP_LEFT_RIGHT), (w, 0))
    big.paste(im.transpose(Image.FLIP_TOP_BOTTOM), (0, h))
    big.paste(im.transpose(Image.ROTATE_180), (w, h))
    return big


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    names, previews = [], []
    for name, (t, x0, y0, x1, y1, rot, h) in MOTIVE.items():
        im = cutout(tafel(t).crop((x0, y0, x1, y1)))
        if rot:
            im = im.rotate(rot, expand=True, resample=Image.BICUBIC)
        previews.append((name, save(im, name, h)))
        names.append(name)
    fp = tafel('fussgaenger')
    for fig, (y0, y1) in FIGUR_ZEILEN.items():
        frames = [cutout(fp.crop((x0, y0, x1, y1))) for (x0, x1) in FIGUR_SPALTEN.values()]
        # Gleiche Feldgröße: alle Posen auf eine gemeinsame Fläche, unten bündig an den Füßen ausgerichtet, mittig
        fw = max(f.width for f in frames)
        fh = max(f.height for f in frames)
        sheet = Image.new('RGBA', (fw * 3, fh), (0, 0, 0, 0))
        for i, f in enumerate(frames):
            sheet.paste(f, (i * fw + (fw - f.width) // 2, (fh - f.height) // 2), f)
        n = f'figur-{fig}'
        previews.append((n, save(sheet, n, FIGUR_H)))
        names.append(n)
    tb = tafel('boeden')
    for name, box in BOEDEN.items():
        tile = mirror_tile(tb.crop(box))
        tile = tile.resize((256, round(256 * tile.height / tile.width)), Image.LANCZOS)
        tile.save(OUT / f'{name}.webp', 'WEBP', quality=78, method=6)
        names.append(name)
        previews.append((name, tile.convert('RGBA')))
    (OUT / 'manifest.json').write_text(json.dumps(names) + '\n')

    if (SRC / 'kachel.png').exists():
        Image.open(SRC / 'kachel.png').convert('RGB').resize((720, 720), Image.LANCZOS).save(BILDER / 'sternenfahrt.webp', 'WEBP', quality=84, method=6)
    if (SRC / 'social-preview.png').exists():
        og = Image.open(SRC / 'social-preview.png').convert('RGB')
        tw = og.height * 1200 / 630
        if tw <= og.width:
            x0 = (og.width - tw) / 2
            og = og.crop((round(x0), 0, round(x0 + tw), og.height))
        og.resize((1200, 630), Image.LANCZOS).save(BILDER / 'sternenfahrt-og.jpg', 'JPEG', quality=86, optimize=True, progressive=True)

    # Autoradio: vier Sender und das Rauschen beim Umschalten
    radio = ROOT / 'public' / 'spiele' / 'sternenfahrt' / 'radio'
    if shutil.which('ffmpeg'):
        radio.mkdir(parents=True, exist_ok=True)
        for src, dst in RADIO.items():
            subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', str(SRC / 'radio' / src), '-ac', '1', '-b:a', '64k', str(radio / dst)], check=True)

    if '--preview' in sys.argv:
        # Kontrollbild: jedes Motiv auf hellem und dunklem Grund (Kanten prüfen)
        cell = 220
        cols = 6
        rows = (len(previews) + cols - 1) // cols
        sheet = Image.new('RGB', (cols * cell * 2, rows * cell), (255, 255, 255))
        for i, (n, im) in enumerate(previews):
            x, y = (i % cols) * cell * 2, (i // cols) * cell
            for j, bgc in enumerate([(250, 236, 205), (60, 64, 78)]):
                tile = Image.new('RGB', (cell, cell), bgc)
                s = min((cell - 10) / im.width, (cell - 10) / im.height)
                th = im.resize((max(1, int(im.width * s)), max(1, int(im.height * s))), Image.LANCZOS)
                tile.paste(th, ((cell - th.width) // 2, (cell - th.height) // 2), th)
                sheet.paste(tile, (x + j * cell, y))
        sheet.save(PREVIEW)
        print('Kontrollbild:', PREVIEW)
    print('geschrieben:', len(names), 'Bilder')


if __name__ == '__main__':
    main()
