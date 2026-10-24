# MÜHLE: Bilder aus design/muehle/ (Originale von ChatGPT) ins Spiel übernehmen.
# python3 tools/muehle-assets.py
# - Steine: größte zusammenhängende Fläche behalten (Farbsäume weg), Randpixel mit Farbe des nächsten vollen Pixels,
#   auf Inhalt zuschneiden, 192er-WebP
# - Gegner-Avatare: runder Ausschnitt innerhalb des orangen Rings (den Ring zeichnet das Spiel selbst), 256er-WebP
# - Brett: Holz ohne Linien, 1024er-WebP; Kachel 720er-WebP, Social Preview 1200x630-JPG
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
SRC, OUT, BILDER = ROOT / 'design/muehle', ROOT / 'public/spiele/muehle/img', ROOT / 'public/bilder'
OUT.mkdir(parents=True, exist_ok=True)

def stein(name, groesse=192):
    a = np.array(Image.open(SRC / (name + '.png')).convert('RGBA'))
    lab, n = ndimage.label(a[..., 3] > 16, structure=np.ones((3, 3)))
    if n > 1:
        groessen = ndimage.sum(np.ones_like(lab), lab, range(1, n + 1))
        a[lab != (1 + int(np.argmax(groessen)))] = 0
    voll = a[..., 3] >= 250
    _, (iy, ix) = ndimage.distance_transform_edt(~voll, return_indices=True)
    rand = (a[..., 3] > 0) & ~voll
    a[rand, :3] = a[iy[rand], ix[rand], :3]
    im = Image.fromarray(a)
    im = im.crop(im.getchannel('A').point(lambda v: 255 if v > 8 else 0).getbbox())
    s = max(im.size); q = Image.new('RGBA', (s, s), (0, 0, 0, 0)); q.paste(im, ((s - im.width) // 2, (s - im.height) // 2))
    q.resize((groesse, groesse), Image.LANCZOS).save(OUT / (name + '.webp'), 'WEBP', quality=90, method=6)

def avatar(name, groesse=256, anteil=0.90):
    im = Image.open(SRC / (name + '.png')).convert('RGB'); w, h = im.size
    r = int(min(w, h) / 2 * anteil); cx, cy = w // 2, h // 2
    im = im.crop((cx - r, cy - r, cx + r, cy + r)).resize((groesse, groesse), Image.LANCZOS).convert('RGBA')
    m = Image.new('L', (groesse * 4, groesse * 4), 0); ImageDraw.Draw(m).ellipse((0, 0, groesse * 4 - 1, groesse * 4 - 1), fill=255)
    im.putalpha(m.resize((groesse, groesse), Image.LANCZOS))
    im.save(OUT / (name + '.webp'), 'WEBP', quality=88, method=6)

for n in ['stein-hell', 'stein-dunkel']: stein(n)
for n in ['gegner-gemuetlich', 'gegner-geuebt', 'gegner-meister']:
    if (SRC / (n + '.png')).exists(): avatar(n)
Image.open(SRC / 'brett-holz.png').convert('RGB').resize((1024, 1024), Image.LANCZOS).save(OUT / 'brett-holz.webp', 'WEBP', quality=82, method=6)
if (SRC / 'kachel.png').exists():
    Image.open(SRC / 'kachel.png').convert('RGB').resize((720, 720), Image.LANCZOS).save(BILDER / 'muehle.webp', 'WEBP', quality=84, method=6)
if (SRC / 'social.png').exists():
    Image.open(SRC / 'social.png').convert('RGB').resize((1200, 630), Image.LANCZOS).save(BILDER / 'muehle-og.jpg', 'JPEG', quality=86, optimize=True, progressive=True)
print('Mühle: Bilder in', OUT, 'und public/bilder/')
