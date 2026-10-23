# AUSFAHRT FREI: Bilder aus design/ausfahrt-frei/ (Originale von ChatGPT) ins Spiel übernehmen.
# Fahrzeuge werden auf ihren Inhalt zugeschnitten und mit transparentem Rand auf genau das Seitenverhältnis gebracht,
# in dem game.js sie zeichnet ((Länge - 0,1) : 0,86 Felder), damit nichts verzerrt wird.
# python3 tools/ausfahrt-assets.py
from pathlib import Path
from PIL import Image
ROOT = Path(__file__).resolve().parent.parent
SRC, OUT, BILDER = ROOT / 'design/ausfahrt-frei', ROOT / 'public/spiele/ausfahrt-frei/img', ROOT / 'public/bilder'
OUT.mkdir(parents=True, exist_ok=True)
FAHRZEUGE = {'af-mischer': 2, 'af-pritsche': 2, 'af-radlader': 2, 'af-stapler': 2, 'af-container': 3, 'af-tieflader': 3}

def fahrzeug(name, laenge, hoehe=128):
    im = Image.open(SRC / (name + '.png')).convert('RGBA')
    im = im.crop(im.getchannel('A').point(lambda a: 255 if a > 8 else 0).getbbox())
    if im.height > im.width: im = im.rotate(90, expand=True)   # senkrecht geliefert: liegend machen
    w = round(hoehe * (laenge - 0.1) / 0.86)
    s = min(w / im.width, hoehe / im.height)
    im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
    q = Image.new('RGBA', (w, hoehe), (0, 0, 0, 0)); q.paste(im, ((w - im.width) // 2, (hoehe - im.height) // 2), im)
    q.save(OUT / (name + '.webp'), 'WEBP', quality=88, method=6)

for n, l in FAHRZEUGE.items():
    if (SRC / (n + '.png')).exists(): fahrzeug(n, l)
if (SRC / 'af-hintergrund.png').exists():
    Image.open(SRC / 'af-hintergrund.png').convert('RGB').resize((768, 1152), Image.LANCZOS).save(OUT / 'af-hintergrund.webp', 'WEBP', quality=80, method=6)
if (SRC / 'af-kachel.png').exists():
    Image.open(SRC / 'af-kachel.png').convert('RGB').resize((720, 720), Image.LANCZOS).save(BILDER / 'ausfahrt-frei.webp', 'WEBP', quality=84, method=6)
print('Ausfahrt frei: Bilder umgewandelt nach', OUT)
