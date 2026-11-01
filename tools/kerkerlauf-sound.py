#!/usr/bin/env python3
"""KERKERLAUF: Sounds aufbereiten (Pixabay-Originale vom Auftraggeber in design/kerkerlauf/sound/)
→ public/spiele/kerkerlauf/sound/<name>.mp3 (mono, 44,1 kHz; Effekte 64 kbit/s, Musik 96 kbit/s). Braucht ffmpeg.

- Effekte: Stille vorn/hinten weg, auf -1 dBFS Spitze normalisiert, max. Länge begrenzt, kurzer Ausklang.
- Musik: auf -16 LUFS gebracht (loudnorm), sonst unverändert (das Spiel schneidet Stille beim Loopen selbst weg).
- Fackel: 24-s-Schleife mit 2 s Überblendung, damit das Knistern nahtlos loopt.

python3 tools/kerkerlauf-sound.py
"""
import glob, os, re, subprocess

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'design/kerkerlauf/sound')
OUT = os.path.join(ROOT, 'public/spiele/kerkerlauf/sound')
os.makedirs(OUT, exist_ok=True)

# name: maximale Länge in Sekunden
EFFEKTE = {'kill': 0.7, 'schwert': 0.6, 'muenze': 0.6, 'truhe': 0.7, 'sprung': 0.9, 'landung': 0.5, 'sturz': 0.9, 'kombo': 0.9, 'rekord': 3.0, 'freischalten': 2.5}


def quelle(name):
    return glob.glob(os.path.join(SRC, name + '_*.mp3'))[0]


def ff(*args):
    subprocess.run(['ffmpeg', '-v', 'error', '-y', *args], check=True)


def spitze(datei, filt):
    r = subprocess.run(['ffmpeg', '-v', 'info', '-i', datei, '-af', filt + ',volumedetect', '-f', 'null', '-'], capture_output=True, text=True)
    return float(re.search(r'max_volume: (-?[\d.]+) dB', r.stderr).group(1))


for name, maxlen in EFFEKTE.items():
    vor = ('silenceremove=start_periods=1:start_threshold=-50dB,areverse,silenceremove=start_periods=1:start_threshold=-55dB,areverse,'
           f'atrim=0:{maxlen},afade=t=out:st={max(0, maxlen - 0.08)}:d=0.08')
    gain = -1.0 - spitze(quelle(name), vor)
    ff('-i', quelle(name), '-af', f'{vor},volume={gain:.2f}dB', '-ac', '1', '-ar', '44100', '-b:a', '64k', os.path.join(OUT, name + '.mp3'))

ff('-i', quelle('musik'), '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11', '-ac', '1', '-ar', '44100', '-b:a', '96k', os.path.join(OUT, 'musik.mp3'))

# Fackel: A = 2…26 s (mit Einblendung), B = 26…28 s (Ausblendung) wird an den Anfang gemischt → Ende von A geht nahtlos in den Anfang über
tmp_a, tmp_b = os.path.join(OUT, '_a.wav'), os.path.join(OUT, '_b.wav')
ff('-ss', '2', '-t', '24', '-i', quelle('fackel'), '-af', 'afade=t=in:d=2', '-ac', '1', '-ar', '44100', tmp_a)
ff('-ss', '26', '-t', '2', '-i', quelle('fackel'), '-af', 'afade=t=out:d=2', '-ac', '1', '-ar', '44100', tmp_b)
ff('-i', tmp_a, '-i', tmp_b, '-filter_complex', '[0][1]amix=inputs=2:duration=first:dropout_transition=0:normalize=0,loudnorm=I=-24:TP=-3[o]',
   '-map', '[o]', '-ar', '44100', '-b:a', '64k', os.path.join(OUT, 'fackel.mp3'))
os.remove(tmp_a); os.remove(tmp_b)

for f in sorted(os.listdir(OUT)):
    p = os.path.join(OUT, f)
    d = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', p], capture_output=True, text=True).stdout.strip()
    print(f'{f:18} {float(d):6.2f} s  {os.path.getsize(p) // 1024:5} KB')
