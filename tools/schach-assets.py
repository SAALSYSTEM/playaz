# SCHACH: Bilder aus design/schach/ (Originale von ChatGPT) ins Spiel übernehmen.
# python3 tools/schach-assets.py
# Figuren: je Farbe ein Bild mit König, Dame, Turm, Läufer, Springer, Bauer nebeneinander auf Weiß.
# Jede Figur wird freigestellt und in ein gemeinsames Format gesetzt (unten bündig, gleicher Maßstab),
# damit das Spiel alle Figuren mit derselben Box zeichnen kann. Brett: das Holzbrett von Dame.
from pathlib import Path
import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
SRC, OUT, BILDER = ROOT / 'design/schach', ROOT / 'public/spiele/schach/img', ROOT / 'public/bilder'
OUT.mkdir(parents=True, exist_ok=True)
NAMEN = ['k', 'd', 't', 'l', 's', 'b']   # König, Dame, Turm, Läufer, Springer, Bauer

def figuren(datei):
    t = np.array(Image.open(SRC / datei).convert('RGB')).astype(float)
    weiss = t.min(axis=2) >= 232
    lab, n = ndimage.label(weiss)
    rand = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    hinter = np.isin(lab, list(rand))                     # nur Weiß, das mit dem Rand verbunden ist
    k = ndimage.binary_fill_holes(~hinter)
    k = ndimage.binary_opening(k, iterations=1)
    teile, m = ndimage.label(k)
    gr = ndimage.sum(np.ones_like(teile), teile, range(1, m + 1))
    gross = [i + 1 for i in np.argsort(gr)[::-1][:6]]
    boxen = sorted([(ndimage.find_objects((teile == g).astype(int))[0], g) for g in gross], key=lambda x: x[0][1].start)
    alpha = ndimage.gaussian_filter(ndimage.binary_erosion(k, iterations=1).astype(float), 0.8)
    innen = ndimage.binary_erosion(k, iterations=2)
    _, (iy, ix) = ndimage.distance_transform_edt(~innen, return_indices=True)
    rgb = t.copy(); r = ~innen; rgb[r] = t[iy[r], ix[r]]
    rgba = np.dstack([rgb, alpha * 255]).astype(np.uint8)
    out = []
    for (sy, sx), g in boxen:
        teil = rgba[sy, sx].copy(); fremd = teile[sy, sx]; teil[..., 3][(fremd != 0) & (fremd != g)] = 0   # Nachbarfigur im Ausschnitt ausblenden
        out.append(Image.fromarray(teil, 'RGBA'))
    return out

hell, dunkel = figuren('figuren-hell.png'), figuren('figuren-dunkel.png')
H = max(im.height for im in hell + dunkel); B = max(im.width for im in hell + dunkel)
ZIEL_H = 256; f = ZIEL_H / H; ZW = int(round(B * f)) + 4
for farbe, liste in (('w', hell), ('s', dunkel)):
    for name, im in zip(NAMEN, liste):
        im = im.resize((max(1, round(im.width * f)), max(1, round(im.height * f))), Image.LANCZOS)
        q = Image.new('RGBA', (ZW, ZIEL_H), (0, 0, 0, 0)); q.paste(im, ((ZW - im.width) // 2, ZIEL_H - im.height), im)
        q.save(OUT / (farbe + name + '.webp'), 'WEBP', quality=90, method=6)
print('Figuren', ZW, 'x', ZIEL_H)
Image.open(SRC / 'kachel.png').convert('RGB').resize((720, 720), Image.LANCZOS).save(BILDER / 'schach.webp', 'WEBP', quality=84, method=6)
Image.open(SRC / 'social.png').convert('RGB').resize((1200, 630), Image.LANCZOS).save(BILDER / 'schach-og.jpg', 'JPEG', quality=86, optimize=True, progressive=True)
print('Schach: Bilder in', OUT, 'und public/bilder/')
