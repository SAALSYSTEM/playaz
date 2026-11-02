#!/usr/bin/env python3
"""PUTT-PROFI: Sounds aufbereiten (ffmpeg). Originale von Pixabay (Lieferung Auftraggeber) in design/putt-profi/sound/.

  python3 tools/putt-profi-sound.py   →  public/spiele/putt-profi/sound/*.mp3

Effekte: mono, Ausschnitt, Stille weg, Spitze −1 dBFS, 64 kbit/s. Musik: mono, −16 LUFS, 96 kbit/s (Schleife).
"""
import os, subprocess

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
Q = os.path.join(ROOT, 'design/putt-profi/sound')
Z = os.path.join(ROOT, 'public/spiele/putt-profi/sound')

# Ziel: (Quelle, Start s, Dauer s)
EFFEKTE = {
    'schlag': ('golf-14.mp3', 0.0, 0.44),                       # leiser Putt
    'schlag-stark': ('golf-club-hit-series.mp3', 0.9, 0.45),    # kräftiger Schlag
    'bande': ('small-ball-spinopel.mp3', 0.03, 0.3),            # Kugel an der Bande
    'loch': ('minigolf-putt-into-hole.mp3', 0.92, 1.5),         # Kugel fällt ins Loch
    'geschafft': ('level-complete-universfield.mp3', 0.0, 1.96),
    'fanfare': ('fanfare-success-trumpets.mp3', 0.0, 3.91),     # Hole-in-one und Tagesbestwert
}
MUSIK = 'musik-kaazoom-sun-sea-and-surf.mp3'


def ff(*args):
    subprocess.run(['ffmpeg', '-v', 'error', '-y', *args], check=True)


def spitze(datei, start, dauer):
    r = subprocess.run(['ffmpeg', '-v', 'info', '-ss', str(start), '-t', str(dauer), '-i', datei, '-af', 'volumedetect', '-f', 'null', '-'],
                       capture_output=True, text=True)
    for z in r.stderr.splitlines():
        if 'max_volume' in z:
            return float(z.split(':')[1].replace('dB', ''))
    return 0.0


def main():
    os.makedirs(Z, exist_ok=True)
    for ziel, (quelle, start, dauer) in EFFEKTE.items():
        q = os.path.join(Q, quelle)
        plus = -1.0 - spitze(q, start, dauer)
        ff('-ss', str(start), '-t', str(dauer), '-i', q, '-ac', '1', '-ar', '44100',
           '-af', f'silenceremove=start_periods=1:start_threshold=-50dB,volume={plus:.2f}dB,afade=t=out:st={max(0, dauer - 0.06):.2f}:d=0.06',
           '-b:a', '64k', os.path.join(Z, ziel + '.mp3'))
    ff('-i', os.path.join(Q, MUSIK), '-ac', '1', '-ar', '44100', '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11', '-b:a', '96k', os.path.join(Z, 'musik.mp3'))
    for f in sorted(os.listdir(Z)):
        print(f, os.path.getsize(os.path.join(Z, f)))


if __name__ == '__main__':
    main()
