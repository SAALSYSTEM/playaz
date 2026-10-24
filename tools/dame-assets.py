# DAME: Bilder aus design/dame/ (Originale von ChatGPT) ins Spiel übernehmen.
# python3 tools/dame-assets.py
# Steine und Gegner-Avatare kommen aus Mühle (public/spiele/muehle/img/), hier nur Brett, Krone, Kachel, Social Preview.
from pathlib import Path
import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
SRC, OUT, BILDER = ROOT / 'design/dame', ROOT / 'public/spiele/dame/img', ROOT / 'public/bilder'
OUT.mkdir(parents=True, exist_ok=True)

def freistellen(name, groesse):
    a = np.array(Image.open(SRC / (name + '.png')).convert('RGBA'))
    lab, n = ndimage.label(a[..., 3] > 16, structure=np.ones((3, 3)))
    if n > 1:
        groessen = ndimage.sum(np.ones_like(lab), lab, range(1, n + 1))
        a[lab != (1 + int(np.argmax(groessen)))] = 0
    voll = a[..., 3] >= 250
    _, (iy, ix) = ndimage.distance_transform_edt(~voll, return_indices=True)
    rand = (a[..., 3] > 0) & ~voll
    a[rand, :3] = a[iy[rand], ix[rand], :3]          # Farbsäume (rot/gelb) an den Kanten entfernen
    im = Image.fromarray(a)
    im = im.crop(im.getchannel('A').point(lambda v: 255 if v > 8 else 0).getbbox())
    s = max(im.size); q = Image.new('RGBA', (s, s), (0, 0, 0, 0)); q.paste(im, ((s - im.width) // 2, (s - im.height) // 2))
    q.resize((groesse, groesse), Image.LANCZOS).save(OUT / (name + '.webp'), 'WEBP', quality=90, method=6)

freistellen('krone', 192)
Image.open(SRC / 'brett.png').convert('RGB').resize((1024, 1024), Image.LANCZOS).save(OUT / 'brett.webp', 'WEBP', quality=84, method=6)
Image.open(SRC / 'kachel.png').convert('RGB').resize((720, 720), Image.LANCZOS).save(BILDER / 'dame.webp', 'WEBP', quality=84, method=6)
Image.open(SRC / 'social.png').convert('RGB').resize((1200, 630), Image.LANCZOS).save(BILDER / 'dame-og.jpg', 'JPEG', quality=86, optimize=True, progressive=True)
print('Dame: Bilder in', OUT, 'und public/bilder/')
