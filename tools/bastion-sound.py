#!/usr/bin/env python3
"""LETZTE BASTION: eigene Sounds aufbereiten (Pixabay-Originale vom Auftraggeber in design/letzte-bastion/sound/)
→ public/spiele/letzte-bastion/sound/<name>.mp3 (mono, 44,1 kHz). Alle übrigen Sounds kommen aus /spiele/kerkerlauf/sound/. Braucht ffmpeg.

- Effekte: Stille vorn/hinten weg, auf -1 dBFS Spitze normalisiert, max. Länge begrenzt, kurzer Ausklang (wie tools/kerkerlauf-sound.py).
- Kampfmusik: das Stück wiederholt sich alle 8,00 s (ab 0,05 s) → genau 3 Durchgänge (24 s) ausschneiden, dann loopt es nahtlos; -16 LUFS.

python3 tools/bastion-sound.py
"""
import glob, os, re, subprocess

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'design/letzte-bastion/sound')
OUT = os.path.join(ROOT, 'public/spiele/letzte-bastion/sound')
os.makedirs(OUT, exist_ok=True)

# name: (maximale Länge in s, Ausblenden in s)
EFFEKTE = {'zauber': (1.4, 0.4), 'kugel': (1.0, 0.3), 'au': (0.55, 0.08), 'schrei': (0.5, 0.08), 'horn': (2.6, 0.6)}


def quelle(name):
    return glob.glob(os.path.join(SRC, name + '_*.mp3'))[0]


def ff(*args):
    subprocess.run(['ffmpeg', '-v', 'error', '-y', *args], check=True)


def spitze(datei, filt):
    r = subprocess.run(['ffmpeg', '-v', 'info', '-i', datei, '-af', filt + ',volumedetect', '-f', 'null', '-'], capture_output=True, text=True)
    return float(re.search(r'max_volume: (-?[\d.]+) dB', r.stderr).group(1))


for name, (maxlen, aus) in EFFEKTE.items():
    vor = ('silenceremove=start_periods=1:start_threshold=-50dB,areverse,silenceremove=start_periods=1:start_threshold=-55dB,areverse,'
           f'atrim=0:{maxlen},afade=t=out:st={max(0, maxlen - aus)}:d={aus}')
    gain = -1.0 - spitze(quelle(name), vor)
    ff('-i', quelle(name), '-af', f'{vor},volume={gain:.2f}dB', '-ac', '1', '-ar', '44100', '-b:a', '64k', os.path.join(OUT, name + '.mp3'))

ff('-ss', '0.05', '-t', '24', '-i', quelle('kampf'), '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11', '-ac', '1', '-ar', '44100', '-b:a', '96k', os.path.join(OUT, 'kampf.mp3'))

for f in sorted(os.listdir(OUT)):
    p = os.path.join(OUT, f)
    d = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', p], capture_output=True, text=True).stdout.strip()
    print(f'{f:12} {float(d):6.2f} s  {os.path.getsize(p) // 1024:5} KB')
