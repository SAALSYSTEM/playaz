#!/usr/bin/env python3
"""Gleich, gleich!: Kartenbilder aus den vorhandenen PlaySaal-Kinderspielen zusammenstellen.

Aufruf: python3 tools/gleich-gleich-assets.py   (braucht Pillow und numpy)
- Motive kommen aus den fertigen WebP-Bildern anderer Spiele (Ab in den Stall, Tiertrumpf, Krümel,
  Dino-Leiterhelden, Hexis Zaubersuppe, Wasser Marsch!, Sternenpups). Bei Sprite-Blättern wird ein Bild ausgeschnitten.
- Jedes Motiv wird auf den Inhalt zugeschnitten und auf höchstens 256 px gebracht: public/spiele/gleich-gleich/img/<id>.webp
- Kartenrückseite, Kachel und Teilen-Vorschau (von ChatGPT, in design/gleich-gleich/) werden umgewandelt.
"""
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SPIELE = ROOT / 'public' / 'spiele'
DESIGN = ROOT / 'design' / 'gleich-gleich'
OUT = SPIELE / 'gleich-gleich' / 'img'
BILDER = ROOT / 'public' / 'bilder'

# id -> (Quelle relativ zu public/spiele, Ausschnitt (x, y, w, h) oder None)
MOTIVE = {
    # Bauernhof
    'kueken': ('ab-in-den-stall/img/tier-kueken.webp', None),
    'ferkel': ('ab-in-den-stall/img/tier-ferkel.webp', None),
    'kalb': ('ab-in-den-stall/img/tier-kalb.webp', None),
    'lamm': ('ab-in-den-stall/img/tier-lamm.webp', None),
    'ente': ('ab-in-den-stall/img/tier-ente.webp', None),
    'fohlen': ('ab-in-den-stall/img/tier-fohlen.webp', None),
    'heuballen': ('ab-in-den-stall/img/heuballen.webp', None),
    'apfelbaum': ('ab-in-den-stall/img/baum.webp', None),
    # Tierfreunde
    'elefant': ('tiertrumpf/img/elefant.webp', None),
    'panda': ('tiertrumpf/img/panda.webp', None),
    'frosch': ('tiertrumpf/img/frosch.webp', None),
    'katze': ('tiertrumpf/img/katze.webp', None),
    'loewe': ('tiertrumpf/img/loewe.webp', None),
    'hase': ('tiertrumpf/img/hase.webp', None),
    'fuchs': ('tiertrumpf/img/fiete.webp', None),
    # Krümels Küche
    'maus': ('kruemel/img/maus-klein-stehen.webp', None),
    'kaese': ('kruemel/img/goldkaese.webp', None),
    'keks': ('kruemel/img/cookie.webp', None),
    'toast': ('kruemel/img/toast.webp', None),
    'wolle': ('kruemel/img/wollknaeuel.webp', None),
    'kaetzchen': ('kruemel/img/kaetzchen-0.webp', None),
    'quietscheente': ('kruemel/img/ente.webp', None),
    'kuchen': ('kruemel/img/kuchen.webp', None),
    # Dino-Dschungel (Sprite-Blätter: ein Bild ausschneiden)
    'dino': ('dino-leiterhelden/img/dino-held.webp', (0, 0, 256, 256)),
    'langhals': ('dino-leiterhelden/img/langhals.webp', (0, 0, 512, 512)),
    'blatt': ('dino-leiterhelden/img/blatt.webp', None),
    'mango': ('dino-leiterhelden/img/frucht.webp', None),
    'kokosnuss': ('dino-leiterhelden/img/kokosnuss.webp', None),
    'baumhaus': ('dino-leiterhelden/img/baumhaus.webp', None),
    'ballon': ('dino-leiterhelden/img/heissluftballon.webp', (0, 0, 320, 448)),
    'dinofreund': ('dino-leiterhelden/img/freund-rosa.webp', (0, 0, 256, 256)),
    # Hexenküche
    'hexe': ('hexis-zaubersuppe/img/hexe.webp', None),
    'kater': ('hexis-zaubersuppe/img/kater.webp', None),
    'kuerbis': ('hexis-zaubersuppe/img/kuerbis.webp', None),
    'pilz': ('hexis-zaubersuppe/img/pilz.webp', None),
    'fledermaus': ('hexis-zaubersuppe/img/fledermaus.webp', None),
    'mond': ('hexis-zaubersuppe/img/mond.webp', None),
    'bonbon': ('hexis-zaubersuppe/img/bonbon.webp', None),
    'kessel': ('hexis-zaubersuppe/img/kessel.webp', None),
    # Feuerwehr
    'feuerwehrauto': ('wasser-marsch/img/feuerwehrwagen.webp', None),
    'feuerwehrmann': ('wasser-marsch/img/feuerwehrmann.webp', None),
    'katze-rot': ('wasser-marsch/img/katze-wartend.webp', None),
    'feuer': ('wasser-marsch/img/flamme-0.webp', None),
    'haus': ('wasser-marsch/img/kleines-haus.webp', None),
    'baum': ('wasser-marsch/img/deko-baum.webp', None),
    'leiter': ('wasser-marsch/img/leiter-segment.webp', None),
    'laterne': ('wasser-marsch/img/deko-laterne.webp', None),
    # Feenwelt
    'einhorn': ('sternenpups/img/einhorn.webp', None),
    'fee': ('sternenpups/img/fee.webp', None),
    'elf': ('sternenpups/img/elf.webp', None),
    'schmetterling': ('sternenpups/img/schmetterling.webp', None),
    'regenbogen': ('sternenpups/img/regenbogen.webp', None),
    'stern': ('sternenpups/img/stern.webp', None),
    'zauberstab': ('sternenpups/img/zauberstab.webp', None),
    'schloss': ('sternenpups/img/ziel.webp', None),
}

# Sehr schmale Motive schräg stellen, damit sie die Karte füllen (Grad gegen den Uhrzeigersinn)
DREHEN = {'zauberstab': 40, 'leiter': -12}

# Fuchs Fiete als Mitspieler (drei Posen aus Tiertrumpf)
FIETE = {'fiete': 'tiertrumpf/img/fiete.webp', 'fiete-denkt': 'tiertrumpf/img/fiete-denkt.webp', 'fiete-jubel': 'tiertrumpf/img/fiete-jubel.webp'}


def trim(im):
    a = np.array(im)[..., 3]
    ys, xs = np.where(a > 12)
    if not len(xs):
        return im
    return im.crop((int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1))


def fit(im, size):
    im = im.copy()
    im.thumbnail((size, size), Image.LANCZOS)
    return im


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for mid, (src, box) in MOTIVE.items():
        im = Image.open(SPIELE / src).convert('RGBA')
        if box:
            x, y, w, h = box
            im = im.crop((x, y, x + w, y + h))
        if mid in DREHEN:
            im = trim(im).rotate(DREHEN[mid], resample=Image.BICUBIC, expand=True)
        fit(trim(im), 256).save(OUT / f'{mid}.webp', 'WEBP', quality=84, method=6)
    for name, src in FIETE.items():
        fit(trim(Image.open(SPIELE / src).convert('RGBA')), 220).save(OUT / f'{name}.webp', 'WEBP', quality=84, method=6)

    # Kartenrückseite: nur die dunkle Kartenfläche behalten (die Rundung zeichnet das Spiel per CSS)
    back = Image.open(DESIGN / 'rueckseite.png').convert('RGBA')
    arr = np.array(back).astype(int)
    dunkel = (arr[..., 3] > 200) & (arr[..., :3].sum(axis=2) < 120)
    ys, xs = np.where(dunkel)
    inset = 6
    back = back.crop((int(xs.min()) + inset, int(ys.min()) + inset, int(xs.max()) - inset, int(ys.max()) - inset)).convert('RGB')
    back = back.resize((300, 400), Image.LANCZOS)
    back.save(OUT / 'rueckseite.webp', 'WEBP', quality=86, method=6)

    # Kachel (quadratisch) und Teilen-Vorschau (1200 x 630)
    k = Image.open(DESIGN / 'kachel.png').convert('RGB').resize((720, 720), Image.LANCZOS)
    k.save(BILDER / 'gleich-gleich.webp', 'WEBP', quality=84, method=6)
    og = Image.open(DESIGN / 'social-preview.png').convert('RGB')
    w, h = og.size
    zh = round(w * 630 / 1200)
    if zh <= h:
        top = (h - zh) // 2
        og = og.crop((0, top, w, top + zh))
    else:
        zw = round(h * 1200 / 630)
        left = (w - zw) // 2
        og = og.crop((left, 0, left + zw, h))
    og.resize((1200, 630), Image.LANCZOS).save(BILDER / 'gleich-gleich-og.jpg', 'JPEG', quality=86, optimize=True, progressive=True)
    print(f'{len(MOTIVE)} Motive, 3 Fiete-Posen, Rückseite, Kachel und Teilen-Vorschau geschrieben.')


if __name__ == '__main__':
    main()
