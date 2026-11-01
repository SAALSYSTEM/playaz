#!/usr/bin/env python3
"""SCHATTENSCHRITT: Spielmusik aufbereiten (Pixabay-Original vom Auftraggeber in design/schattenschritt/sound/)
→ public/spiele/schattenschritt/sound/musik.mp3 (mono, 44,1 kHz, 80 kbit/s, -18 LUFS). Braucht ffmpeg.
Das Stück wiederholt sich in Takten von 4,36 s; bei 78,595 s klingt es wie am Anfang (0,05 s) → genau dieses Stück
(18 Takte) ausschneiden, dann loopt es nahtlos. Alle Effekte kommen aus Kerkerlauf, Letzte Bastion und Sternenpups.

python3 tools/schattenschritt-sound.py
"""
import glob, os, subprocess
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = glob.glob(os.path.join(ROOT, 'design/schattenschritt/sound/musik_*.mp3'))[0]
OUT = os.path.join(ROOT, 'public/spiele/schattenschritt/sound')
os.makedirs(OUT, exist_ok=True)
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', '0.05', '-t', '78.545', '-i', SRC, '-af', 'loudnorm=I=-18:TP=-1.5:LRA=11',
                '-ac', '1', '-ar', '44100', '-b:a', '80k', os.path.join(OUT, 'musik.mp3')], check=True)
p = os.path.join(OUT, 'musik.mp3')
print('musik.mp3', round(os.path.getsize(p) / 1024), 'KB')
