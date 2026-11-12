#!/usr/bin/env python3
"""Neon Coast – Fluchtwagen: Motive aus den Neon-Coast-Referenztafeln freistellen und als WebP fürs Spiel speichern.

Aufruf: python3 tools/neon-coast-assets.py [--preview [Datei]]   (braucht Pillow, numpy, scipy)

Quelle sind dieselben Tafeln wie bei der Sternenfahrt (design/sternenfahrt/tafel-*.png, ChatGPT, vom Auftraggeber).
Das Freistellen (Navy-Hintergrund von den Rändern her entfernen, weiche Kante, Farbsaum) kommt aus
tools/sternenfahrt-assets.py. Neu gegenüber der Sternenfahrt: Polizeiwagen, Polizei-SUV, Pickup, Lieferwagen, LKW,
Polizeiwache, Tankstelle, Garage, Hotel mit Neonschild, Hecke, Müllcontainer, Haltestelle, Laterne, Ampel, Poller,
Leitplanke, Beton.

Ausrichtung: Fahrzeuge Front nach oben. Gebäude wie auf der Tafel (Fassade unten), das Spiel dreht sie zur Straße.

Schreibt public/spiele/neon-coast/img/*.webp und public/spiele/neon-coast/bilder.js (Bildgrößen und – für Gebäude –
die Grundfläche als wenige Rechtecke, abgeleitet aus der Bildform; daraus entstehen die Kollisionsflächen).
Liegen design/neon-coast/kachel.png bzw. social-preview.png vor, werden daraus Kachel und Teilen-Vorschau.
Radio: design/neon-coast/radio/*.mp3 (Pixabay, vom Auftraggeber) → public/spiele/neon-coast/radio/ (mono, 64 kbit/s, braucht ffmpeg).
Geräusche: design/neon-coast/ton/*.mp3 (Pixabay, vom Auftraggeber) → public/spiele/neon-coast/ton/ (Motor- und Sirenenschleife, Startklang, Crash)
und klang.js mit den Schleifenpunkten.
"""
import importlib.util
import json
import shutil
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'public' / 'spiele' / 'neon-coast' / 'img'
JS = ROOT / 'public' / 'spiele' / 'neon-coast' / 'bilder.js'
DESIGN = ROOT / 'design' / 'neon-coast'
BILDER = ROOT / 'public' / 'bilder'

_spec = importlib.util.spec_from_file_location('sternenfahrt_assets', ROOT / 'tools' / 'sternenfahrt-assets.py')
SF = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(SF)
cutout, tafel, mirror_tile = SF.cutout, SF.tafel, SF.mirror_tile

# Name: (Tafel, x0, y0, x1, y1, Drehung gegen den Uhrzeigersinn, Zielhöhe px)
FAHRZEUGE = {
    'auto-flitzer':  ('fahrzeuge-02', 110, 130, 300, 440, 0, 240),
    'auto-limo':     ('fahrzeuge-02', 478, 98, 682, 462, 0, 260),
    'auto-taxi':     ('fahrzeuge-02', 850, 108, 1055, 462, 0, 260),
    'auto-muscle':   ('fahrzeuge-02', 1215, 92, 1430, 462, 0, 260),
    'auto-suv':      ('fahrzeuge-02', 100, 525, 312, 920, 0, 260),
    'auto-pickup':   ('fahrzeuge-02', 478, 508, 672, 925, 0, 270),
    'auto-van':      ('fahrzeuge-02', 845, 500, 1058, 925, 0, 250),
    'auto-lkw':      ('fahrzeuge-02', 1232, 500, 1424, 930, 0, 300),
    'auto-sport':    ('testpaket', 22, 70, 478, 300, 270, 260),
    'auto-super':    ('fahrzeuge-03', 170, 125, 640, 905, 0, 280),
    'polizei':       ('testpaket', 528, 72, 978, 300, 270, 260),
    'polizei-suv':   ('fahrzeuge-03', 900, 100, 1395, 905, 0, 270),
}
GEBAEUDE = {
    'haus-wohn':     ('gebaeude', 40, 160, 312, 410, 0, 250),
    'haus-apart':    ('gebaeude', 380, 145, 672, 440, 0, 300),
    'haus-hotel':    ('gebaeude', 715, 140, 1058, 445, 0, 310),
    'haus-laden':    ('gebaeude', 1118, 185, 1380, 395, 0, 220),
    'haus-cafe':     ('gebaeude', 1460, 145, 1745, 440, 0, 300),
    'haus-club':     ('gebaeude', 30, 515, 325, 810, 0, 300),
    'haus-werk':     ('gebaeude', 360, 515, 690, 800, 0, 290),
    'haus-halle':    ('gebaeude', 1090, 515, 1405, 810, 0, 300),
    'haus-polizei':  ('gebaeude', 1436, 498, 1760, 800, 0, 310),
    'tank-dach':     ('gebaeude', 722, 512, 1056, 675, 0, 170),
    'tank-shop':     ('gebaeude', 800, 673, 1032, 812, 0, 150),
    'haus-neon':     ('testpaket', 1040, 62, 1497, 308, 0, 260),
    'haus-terrasse': ('testpaket', 31, 355, 472, 632, 0, 280),
    'haus-garage':   ('testpaket', 523, 358, 991, 630, 0, 280),
}
DINGE = {
    # Grün
    'palme':         ('gruen', 40, 105, 370, 385, 0, 220),
    'palme-faecher': ('gruen', 432, 108, 725, 385, 0, 210),
    'palme-jung':    ('gruen', 812, 108, 1100, 385, 0, 200),
    'baum':          ('gruen', 1178, 105, 1495, 400, 0, 220),
    'zierbaum':      ('gruen', 70, 418, 340, 652, 0, 180),
    'busch':         ('gruen', 440, 435, 720, 640, 0, 130),
    'hecke':         ('gruen', 787, 471, 1122, 602, 0, 80),
    # Stadtmöbel
    'bank':          ('gruen', 1178, 440, 1488, 580, 0, 60),
    'muelleimer':    ('gruen', 70, 705, 260, 878, 0, 70),
    'muellcontainer': ('gruen', 410, 690, 672, 900, 0, 120),
    'haltestelle':   ('gruen', 781, 690, 1127, 842, 0, 100),
    'laterne':       ('verkehr', 395, 150, 757, 247, 0, 60),
    'ampel':         ('verkehr', 15, 143, 356, 289, 0, 70),
    'poller':        ('verkehr', 113, 575, 252, 716, 0, 56),
    'leitplanke':    ('verkehr', 398, 591, 758, 706, 0, 70),
    'bake':          ('verkehr', 830, 572, 1098, 698, 0, 80),
    'absperrung':    ('verkehr', 1162, 562, 1518, 712, 0, 90),
    # Strand und Hafen
    'schirm':        ('strand-hafen', 30, 155, 350, 478, 0, 170),
    'liege':         ('strand-hafen', 605, 155, 780, 495, 0, 130),
    'rettungsturm':  ('strand-hafen', 1045, 160, 1325, 490, 0, 210),
    'steg':          ('strand-hafen', 30, 550, 168, 925, 0, 380),
    'boot':          ('strand-hafen', 685, 515, 870, 965, 0, 260),
    'container':     ('strand-hafen', 1100, 550, 1295, 950, 0, 280),
}
RADIO = {
    'eliza_music-golden-dreams-of-california-432189.mp3': 'sender-1.mp3',
    'eliza_music-california-snares-and-synths-435003.mp3': 'sender-2.mp3',
    'grand_project-neon-odyssey-399913.mp3': 'sender-3.mp3',
    'alex-morgan-neon-synthwave-drive-537447.mp3': 'sender-4.mp3',
    'the_mountain-pop-neon-246793.mp3': 'sender-5.mp3',
    'luis_humanoide-miami-cops-80s-retrowave-music-without-sounds-296632.mp3': 'sender-6.mp3',
}
# Geräusche (Pixabay, vom Auftraggeber): Motor (Leerlauf als Schleife, Aufheulen als Startklang), Sirene (Schleife), Crash
TON = {'motor': 'freesound_community-car-motor-revving-99317.mp3', 'sirene': 'magiaz-sirene-373610.mp3', 'crash': 'freesound_community-box-crash-106687.mp3'}
RATE = 44100
VORLAUF = 0.2   # so viel Schleife steht zusätzlich vor und hinter der Schleife in der Datei (MP3 verschiebt den Anfang um ein paar ms)
FIGUR_ZEILEN = SF.FIGUR_ZEILEN
FIGUR_SPALTEN = SF.FIGUR_SPALTEN
FIGUR_H = 96
BOEDEN = dict(SF.BOEDEN)
BOEDEN['boden-beton'] = (1175, 133, 1420, 325)


def save(im, name, height, quality=86):
    w = max(1, round(im.width * height / im.height))
    im = im.resize((w, height), Image.LANCZOS)
    im.save(OUT / f'{name}.webp', 'WEBP', quality=quality, method=6)
    return im


def umriss(im, n=24, deckung=0.5, rest=0.035):
    """Grundfläche als wenige Rechtecke (normiert 0..1): Raster über die Deckkraft, dann immer das größte
    vollständig belegte Rechteck herausnehmen, bis nur noch Reste (Antennen, Ecken) übrig sind."""
    a = np.array(im)[..., 3].astype(float) / 255
    h, w = a.shape
    gy = np.linspace(0, h, n + 1).astype(int)
    gx = np.linspace(0, w, n + 1).astype(int)
    occ = np.zeros((n, n), bool)
    for j in range(n):
        for i in range(n):
            occ[j, i] = a[gy[j]:gy[j + 1], gx[i]:gx[i + 1]].mean() >= deckung
    gesamt = occ.sum()
    rects = []
    versuche = 0
    while occ.sum() > gesamt * rest and versuche < 8:
        versuche += 1
        best, hoch = (0, None), np.zeros(n, int)
        for j in range(n):
            hoch = np.where(occ[j], hoch + 1, 0)
            for i in range(n):
                mh = hoch[i]
                k = i
                while k < n and hoch[k] > 0 and mh > 0:
                    mh = min(mh, hoch[k])
                    fl = mh * (k - i + 1)
                    if fl > best[0]:
                        best = (fl, (i, j - mh + 1, k + 1, j + 1))
                    k += 1
        if not best[1] or best[0] < 6:
            break
        x0, y0, x1, y1 = best[1]
        occ[y0:y1, x0:x1] = False
        # schmale Randstreifen (Dachkante, Vordach) zählen nicht zur Grundfläche
        if min(x1 - x0, y1 - y0) >= 3 and best[0] >= gesamt * 0.04:
            rects.append(best[1])
    return [[round(x0 / n, 3), round(y0 / n, 3), round(x1 / n, 3), round(y1 / n, 3)] for x0, y0, x1, y1 in rects]


def lies_ton(pfad):
    roh = subprocess.run(['ffmpeg', '-loglevel', 'error', '-i', str(pfad), '-ac', '1', '-ar', str(RATE), '-f', 'f32le', '-'], check=True, capture_output=True).stdout
    return np.frombuffer(roh, dtype=np.float32).astype(np.float64)


def schreib_ton(x, pfad, spitze=0.89, kbit=96):
    x = x / max(np.abs(x).max(), 1e-9) * spitze
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'f32le', '-ar', str(RATE), '-ac', '1', '-i', '-', '-b:a', f'{kbit}k', str(pfad)], input=x.astype(np.float32).tobytes(), check=True)


def schleife(x, start, laenge, blende=0.06):
    """Nahtlose Schleife: das Ende wird in das Material vor dem Start übergeblendet. Rückgabe mit Vor- und Nachlauf."""
    s, n, f, v = int(start * RATE), int(laenge * RATE), int(blende * RATE), int(VORLAUF * RATE)
    teil = x[s:s + n].copy()
    w = np.linspace(0, 1, f)
    teil[n - f:] = teil[n - f:] * np.sqrt(1 - w) + x[s - f:s] * np.sqrt(w)
    return np.concatenate([teil[-v:], teil, teil[:v]]), n / RATE


def periode(x, von, bis, fenster=0.02):
    """Wiederholdauer eines Jaultons: Autokorrelation des Klang-Schwerpunkts."""
    w = int(fenster * RATE)
    z = []
    for i in range(0, len(x) - w, w // 2):
        sp = np.abs(np.fft.rfft(x[i:i + w] * np.hanning(w)))
        z.append((sp * np.arange(len(sp))).sum() / max(sp.sum(), 1e-9))
    z = np.array(z) - np.mean(z)
    ac = np.correlate(z, z, 'full')[len(z) - 1:]
    lo, hi = int(von / (fenster / 2)), int(bis / (fenster / 2))
    k = lo + int(np.argmax(ac[lo:hi]))
    # Scheitel verfeinern (Parabel durch drei Punkte)
    a, b, c = ac[k - 1], ac[k], ac[k + 1]
    k += 0.5 * (a - c) / (a - 2 * b + c)
    return k * fenster / 2


def geraeusche():
    ziel = ROOT / 'public' / 'spiele' / 'neon-coast' / 'ton'
    quelle = DESIGN / 'ton'
    if not shutil.which('ffmpeg') or not all((quelle / f).exists() for f in TON.values()):
        return None
    ziel.mkdir(parents=True, exist_ok=True)
    klang = {}
    # Motor: ruhiger Leerlauf (um 5 s, rund 42 Zündungen je Sekunde) als Schleife; das Aufheulen ab 6 s als Startklang
    m = lies_ton(quelle / TON['motor'])
    hz = 1 / periode_welle(m, 4.9, 0.02, 0.03)
    lauf, laenge = schleife(m, 4.9, round(0.95 * hz) / hz)
    schreib_ton(lauf, ziel / 'motor.mp3')
    klang['motor'] = {'von': VORLAUF, 'bis': round(VORLAUF + laenge, 4), 'hz': round(hz, 1)}
    heul = m[int(6.02 * RATE):int(9.6 * RATE)].copy()
    heul[:int(0.03 * RATE)] *= np.linspace(0, 1, int(0.03 * RATE))
    heul[-int(0.9 * RATE):] *= np.linspace(1, 0, int(0.9 * RATE)) ** 2
    schreib_ton(heul, ziel / 'start.mp3')
    # Sirene: ganze Zahl von Jaul-Runden
    si = lies_ton(quelle / TON['sirene'])
    p = periode(si, 0.4, 1.1)
    runden = int((len(si) / RATE - 0.5) // p)
    lauf, laenge = schleife(si, 0.25, runden * p, 0.04)
    schreib_ton(lauf, ziel / 'sirene.mp3')
    klang['sirene'] = {'von': VORLAUF, 'bis': round(VORLAUF + laenge, 4), 'runde': round(p, 3)}
    # Crash: Stille davor weg, kurz ausblenden
    c = lies_ton(quelle / TON['crash'])
    an = int(np.argmax(np.abs(c) > 0.1 * np.abs(c).max())) - int(0.012 * RATE)
    c = c[max(an, 0):max(an, 0) + int(0.75 * RATE)].copy()
    c[-int(0.25 * RATE):] *= np.linspace(1, 0, int(0.25 * RATE))
    schreib_ton(c, ziel / 'crash.mp3')
    (ROOT / 'public' / 'spiele' / 'neon-coast' / 'klang.js').write_text(
        '// Erzeugt von tools/neon-coast-assets.py – nicht von Hand ändern. Schleifenpunkte der Geräusche in Sekunden.\n'
        'export const KLANG = ' + json.dumps(klang, ensure_ascii=False) + ';\n', encoding='utf-8')
    return klang


def periode_welle(x, start, von, bis):
    """Dauer einer Zündung im Leerlauf: Autokorrelation der Welle selbst."""
    s = x[int(start * RATE):int((start + 0.5) * RATE)]
    s = s - s.mean()
    ac = np.correlate(s, s, 'full')[len(s) - 1:]
    lo, hi = int(von * RATE), int(bis * RATE)
    return (lo + int(np.argmax(ac[lo:hi]))) / RATE


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    groessen, umrisse, previews = {}, {}, []

    def motive(tab):
        for name, (t, x0, y0, x1, y1, rot, h) in tab.items():
            im = cutout(tafel(t).crop((x0, y0, x1, y1)))
            if rot:
                im = im.rotate(rot, expand=True, resample=Image.BICUBIC)
            im = save(im, name, h)
            groessen[name] = [im.width, im.height]
            previews.append((name, im))
            yield name, im

    for _ in motive(FAHRZEUGE):
        pass
    for name, im in motive(GEBAEUDE):
        umrisse[name] = umriss(im)
    for _ in motive(DINGE):
        pass

    fp = tafel('fussgaenger')
    for fig, (y0, y1) in FIGUR_ZEILEN.items():
        frames = [cutout(fp.crop((x0, y0, x1, y1))) for (x0, x1) in FIGUR_SPALTEN.values()]
        fw = max(f.width for f in frames)
        fh = max(f.height for f in frames)
        sheet = Image.new('RGBA', (fw * 3, fh), (0, 0, 0, 0))
        for i, f in enumerate(frames):
            sheet.paste(f, (i * fw + (fw - f.width) // 2, (fh - f.height) // 2), f)
        n = f'figur-{fig}'
        im = save(sheet, n, FIGUR_H)
        groessen[n] = [im.width, im.height]
        previews.append((n, im))

    tb = tafel('boeden')
    for name, box in BOEDEN.items():
        tile = mirror_tile(tb.crop(box))
        tile = tile.resize((256, round(256 * tile.height / tile.width)), Image.LANCZOS)
        tile.save(OUT / f'{name}.webp', 'WEBP', quality=78, method=6)
        groessen[name] = [tile.width, tile.height]
        previews.append((name, tile.convert('RGBA')))

    JS.write_text(
        '// Erzeugt von tools/neon-coast-assets.py – nicht von Hand ändern.\n'
        '// GROESSE: Bildgröße in px. UMRISS: Grundfläche der Gebäude als Rechtecke (0..1 der Bildbreite/-höhe).\n'
        'export const GROESSE = ' + json.dumps(groessen, separators=(',', ':')) + ';\n'
        'export const UMRISS = ' + json.dumps(umrisse, separators=(',', ':')) + ';\n'
    )

    if (DESIGN / 'kachel.png').exists():
        Image.open(DESIGN / 'kachel.png').convert('RGB').resize((720, 720), Image.LANCZOS).save(BILDER / 'neon-coast.webp', 'WEBP', quality=84, method=6)
    if (DESIGN / 'social-preview.png').exists():
        og = Image.open(DESIGN / 'social-preview.png').convert('RGB')
        tw = og.height * 1200 / 630
        if tw <= og.width:
            x0 = (og.width - tw) / 2
            og = og.crop((round(x0), 0, round(x0 + tw), og.height))
        else:
            th = og.width * 630 / 1200
            y0 = (og.height - th) / 2
            og = og.crop((0, round(y0), og.width, round(y0 + th)))
        og.resize((1200, 630), Image.LANCZOS).save(BILDER / 'neon-coast-og.jpg', 'JPEG', quality=86, optimize=True, progressive=True)

    # Autoradio: eigene Sender (das Rauschen beim Umschalten kommt aus der Sternenfahrt)
    radio = ROOT / 'public' / 'spiele' / 'neon-coast' / 'radio'
    if shutil.which('ffmpeg'):
        radio.mkdir(parents=True, exist_ok=True)
        for src, dst in RADIO.items():
            if (DESIGN / 'radio' / src).exists():
                subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', str(DESIGN / 'radio' / src), '-ac', '1', '-b:a', '64k', str(radio / dst)], check=True)

    klang = geraeusche()
    if klang:
        print('Geräusche:', klang)

    if '--preview' in sys.argv:
        i = sys.argv.index('--preview')
        ziel = Path(sys.argv[i + 1]) if len(sys.argv) > i + 1 else ROOT / 'design' / 'neon-coast' / '_kontrolle.png'
        ziel.parent.mkdir(parents=True, exist_ok=True)
        cell, cols = 200, 7
        rows = (len(previews) + cols - 1) // cols
        sheet = Image.new('RGB', (cols * cell * 2, rows * cell), (255, 255, 255))
        from PIL import ImageDraw
        for i, (n, im) in enumerate(previews):
            x, y = (i % cols) * cell * 2, (i // cols) * cell
            for j, bgc in enumerate([(250, 236, 205), (40, 44, 70)]):
                tile = Image.new('RGB', (cell, cell), bgc)
                s = min((cell - 24) / im.width, (cell - 24) / im.height)
                th = im.resize((max(1, int(im.width * s)), max(1, int(im.height * s))), Image.LANCZOS)
                ox, oy = (cell - th.width) // 2, (cell - th.height) // 2 + 6
                tile.paste(th, (ox, oy), th)
                d = ImageDraw.Draw(tile)
                if j == 1 and n in umrisse:
                    for x0, y0, x1, y1 in umrisse[n]:
                        d.rectangle((ox + x0 * th.width, oy + y0 * th.height, ox + x1 * th.width, oy + y1 * th.height), outline=(255, 60, 60))
                d.text((4, 2), n, fill=(0, 0, 0) if j == 0 else (255, 255, 255))
                sheet.paste(tile, (x + j * cell, y))
        sheet.save(ziel)
        print('Kontrollbild:', ziel)
    total = sum(f.stat().st_size for f in OUT.glob('*.webp'))
    print('geschrieben:', len(groessen), 'Bilder,', round(total / 1024), 'KB')


if __name__ == '__main__':
    main()
