# LEITUNGSCHAOS: Bilder aus design/leitungschaos/ (Originale von ChatGPT) ins Spiel übernehmen.
# Freigestellte Figuren werden auf ihren Inhalt zugeschnitten, quadratisch gemacht und als 256er-WebP gespeichert.
# python3 tools/leitungschaos-assets.py
from pathlib import Path
from PIL import Image
ROOT = Path(__file__).resolve().parent.parent
SRC, OUT, BILDER = ROOT / 'design/leitungschaos', ROOT / 'public/spiele/leitungschaos/img', ROOT / 'public/bilder'
OUT.mkdir(parents=True, exist_ok=True)

def rahmen(name):
    return Image.open(SRC / (name + '.png')).convert('RGBA').getchannel('A').point(lambda a: 255 if a > 8 else 0).getbbox()

def figur(name, groesse=256):
    im = Image.open(SRC / (name + '.png')).convert('RGBA')
    box = rahmen(name)
    # Haus trocken/versorgt: gleicher Zuschnitt (Vereinigung beider Rahmen), damit das Haus beim Füllen nicht springt
    partner = name[:-6] if name.endswith('-licht') else name + '-licht'
    if name.startswith('lc-haus') and (SRC / (partner + '.png')).exists():
        b2 = rahmen(partner); box = (min(box[0], b2[0]), min(box[1], b2[1]), max(box[2], b2[2]), max(box[3], b2[3]))
    im = im.crop(box); s = max(im.size)
    q = Image.new('RGBA', (s, s), (0, 0, 0, 0)); q.paste(im, ((s - im.width) // 2, (s - im.height) // 2))
    q.resize((groesse, groesse), Image.LANCZOS).save(OUT / (name + '.webp'), 'WEBP', quality=88, method=6)

for n in ['lc-hydrant', 'lc-haus-a', 'lc-haus-a-licht'] + [p.stem for p in SRC.glob('lc-haus-[bc]*.png')]:
    figur(n)
Image.open(SRC / 'lc-hintergrund.png').convert('RGB').resize((768, 1152), Image.LANCZOS).save(OUT / 'lc-hintergrund.webp', 'WEBP', quality=80, method=6)
Image.open(SRC / 'lc-kachel.png').convert('RGB').resize((720, 720), Image.LANCZOS).save(BILDER / 'leitungschaos.webp', 'WEBP', quality=84, method=6)
print('Leitungschaos: Bilder in', OUT, 'und public/bilder/leitungschaos.webp')
