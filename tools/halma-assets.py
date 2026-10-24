# HALMA: Bilder aus design/halma/ (Originale von ChatGPT) ins Spiel übernehmen.
# python3 tools/halma-assets.py
# Brett (quadratisch zugeschnitten, mit Rahmen), zwei freigestellte Steine, Kachel und Social Preview.
from pathlib import Path
import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
SRC, OUT, BILDER = ROOT / 'design/halma', ROOT / 'public/spiele/halma/img', ROOT / 'public/bilder'
OUT.mkdir(parents=True, exist_ok=True)

# ---- Brett: auf den Rahmen zuschneiden, auf 1024×1024 bringen und das Raster ausmessen ----
roh = Image.open(SRC / 'brett.png').convert('RGB')
a = np.array(roh); ys, xs = np.where(a.min(axis=2) < 240)
brett = roh.crop((xs.min() + 4, ys.min() + 4, xs.max() - 3, ys.max() - 3)).resize((1024, 1024), Image.LANCZOS)
brett.save(OUT / 'brett.webp', 'WEBP', quality=86, method=6)
lum = np.array(brett).astype(float).mean(axis=2)
def linien(profil, erste, teilung):
    pos = []
    for k in range(17):
        s = int(round(erste + k * teilung)); lo, hi = max(1, s - 7), min(len(profil) - 1, s + 8)
        pos.append(lo + int(np.argmax(profil[lo:hi])))
    k = np.arange(17); m, b = np.polyfit(k, pos, 1)
    return b, m
spalten = np.abs(np.diff(lum[260:760, :], axis=1)).mean(axis=0)
zeilen = np.abs(np.diff(lum[:, 260:760], axis=0)).mean(axis=1)
bx, mx = linien(spalten, 25, 61); by, my = linien(zeilen, 25, 61)
print('Raster in Pixeln des 1024er Brettbilds: x0=%.1f pitch=%.2f | y0=%.1f pitch=%.2f' % (bx, mx, by, my))
print('Anteile: x0=%.4f y0=%.4f bx=%.4f by=%.4f' % (bx / 1024, by / 1024, mx * 16 / 1024, my * 16 / 1024))

# ---- Steine: weißen Hintergrund entfernen, links hell, rechts dunkel ----
def stein(box, name):
    t = np.array(Image.open(SRC / 'steine.png').convert('RGB').crop(box)).astype(float)
    hintergrund = t.min(axis=2) >= 200      # auch der helle Bodenschatten fliegt raus
    lab, n = ndimage.label(~hintergrund)
    gr = ndimage.sum(np.ones_like(lab), lab, range(1, n + 1))
    k = lab == (1 + int(np.argmax(gr)))
    k = ndimage.binary_fill_holes(k)
    alpha = ndimage.gaussian_filter(ndimage.binary_erosion(k, iterations=1).astype(float), 0.8)
    _, (iy, ix) = ndimage.distance_transform_edt(~ndimage.binary_erosion(k, iterations=2), return_indices=True)
    rgb = t.copy(); rand = ~ndimage.binary_erosion(k, iterations=2)
    rgb[rand] = t[iy[rand], ix[rand]]                                   # Randpixel: Farbe von innen, kein weißer Saum
    im = Image.fromarray(np.dstack([rgb, alpha * 255]).astype(np.uint8), 'RGBA')
    im = im.crop(im.getchannel('A').point(lambda v: 255 if v > 8 else 0).getbbox())
    h = 320; im = im.resize((round(im.width * h / im.height), h), Image.LANCZOS)
    im.save(OUT / (name + '.webp'), 'WEBP', quality=90, method=6)
    print(name, im.size)
w = Image.open(SRC / 'steine.png').width
stein((0, 0, w // 2, 887), 'stein-hell'); stein((w // 2, 0, w, 887), 'stein-dunkel')

Image.open(SRC / 'kachel.png').convert('RGB').resize((720, 720), Image.LANCZOS).save(BILDER / 'halma.webp', 'WEBP', quality=84, method=6)
Image.open(SRC / 'social.png').convert('RGB').resize((1200, 630), Image.LANCZOS).save(BILDER / 'halma-og.jpg', 'JPEG', quality=86, optimize=True, progressive=True)
print('Halma: Bilder in', OUT, 'und public/bilder/')
