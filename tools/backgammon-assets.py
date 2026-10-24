# BACKGAMMON: Kachel und Social Preview aus design/backgammon/ (Originale von ChatGPT).
# python3 tools/backgammon-assets.py — Brett und Würfel zeichnet das Spiel selbst, Steine und Gegner kommen aus muehle/img/.
from pathlib import Path
from PIL import Image
ROOT = Path(__file__).resolve().parent.parent
SRC, BILDER = ROOT / 'design/backgammon', ROOT / 'public/bilder'
Image.open(SRC / 'kachel.png').convert('RGB').resize((720, 720), Image.LANCZOS).save(BILDER / 'backgammon.webp', 'WEBP', quality=84, method=6)
Image.open(SRC / 'social.png').convert('RGB').resize((1200, 630), Image.LANCZOS).save(BILDER / 'backgammon-og.jpg', 'JPEG', quality=86, optimize=True, progressive=True)
print('Backgammon: public/bilder/backgammon.webp und backgammon-og.jpg')
