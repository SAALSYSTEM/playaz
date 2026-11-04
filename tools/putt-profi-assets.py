#!/usr/bin/env python3
"""PUTT-PROFI: Bahnteile aus dem Kenney Minigolf Kit (CC0) aufbereiten.

  python3 tools/putt-profi-assets.py

Quelle:  design/putt-profi/kenney/*.glb (+ Textures/)
Ziel:    public/spiele/putt-profi/modelle/*.glb (+ Textures/)   – Darstellung
         public/spiele/putt-profi/teile.js                       – Kollisionsdaten für logik.js

Die Physik nutzt genau die Dreiecke der Modelle, die auch gezeichnet werden:
  b = Boden  (grün eingefärbt bzw. dunkler Lochboden, Oberseite) → daraus wird ein Höhenraster
  w = Wände  (alles Steile, das nicht Boden ist: Banden, Hindernisse, Burg, Tunnel)
Flache Oberseiten von Banden, Unterseiten und Decken braucht die Kugel nie und fallen weg.
Die Mühlenflügel (Knoten "blades") sind nur Bild; sie sperren in logik.js zeitgesteuert die Tür.
Koordinaten als ganze Zahlen in 1/10000 Feld, damit Browser und Server exakt dasselbe rechnen.
"""
import json, os, shutil, struct
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
QUELLE = os.path.join(ROOT, 'design/putt-profi/kenney')
ZIEL = os.path.join(ROOT, 'public/spiele/putt-profi/modelle')
TEILE_JS = os.path.join(ROOT, 'public/spiele/putt-profi/teile.js')

BAHN = ['straight', 'end', 'corner', 'round-corner-c', 'side', 'open', 'hole-round', 'hole-open',
        'obstacle-block', 'obstacle-diamond', 'obstacle-triangle', 'narrow-block', 'narrow-round', 'narrow-square',
        'castle', 'windmill', 'tunnel-narrow', 'tunnel-wide', 'tunnel-double', 'gap', 'split',
        'bump', 'bump-down', 'bump-walls', 'hill-round', 'hill-square',
        'skew-corner', 'bump-down-walls', 'crest']
DEKO = ['ball-red', 'ball-blue', 'ball-green', 'club-red', 'club-blue', 'club-green', 'flag-red', 'flag-blue', 'flag-green']

TEX = Image.open(os.path.join(QUELLE, 'Textures/colormap.png')).convert('RGB')


def lies_glb(pfad):
    b = open(pfad, 'rb').read()
    jl = struct.unpack_from('<I', b, 12)[0]
    j = json.loads(b[20:20 + jl])
    bin0 = 20 + jl + 8

    def acc(i):
        a = j['accessors'][i]; bv = j['bufferViews'][a['bufferView']]
        off = bin0 + bv.get('byteOffset', 0) + a.get('byteOffset', 0)
        n = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}[a['type']]
        fmt, gr = {5126: ('f', 4), 5123: ('H', 2), 5125: ('I', 4), 5121: ('B', 1)}[a['componentType']]
        st = bv.get('byteStride', 0) or n * gr
        return [struct.unpack_from('<' + fmt * n, b, off + k * st) for k in range(a['count'])]

    tris = []
    def knoten(i, t):
        nd = j['nodes'][i]
        if nd.get('name') == 'blades':
            return
        tt = nd.get('translation', [0, 0, 0]); t = [t[0] + tt[0], t[1] + tt[1], t[2] + tt[2]]
        if 'rotation' in nd and any(abs(x) > 1e-6 for x in nd['rotation'][:3]):
            raise SystemExit('Rotation im Knoten nicht unterstützt: ' + pfad)
        if 'mesh' in nd:
            for p in j['meshes'][nd['mesh']]['primitives']:
                P = acc(p['attributes']['POSITION']); U = acc(p['attributes']['TEXCOORD_0'])
                I = [x[0] for x in acc(p['indices'])] if 'indices' in p else list(range(len(P)))
                for k in range(0, len(I), 3):
                    ids = I[k:k + 3]
                    tris.append(([[P[q][0] + t[0], P[q][1] + t[1], P[q][2] + t[2]] for q in ids], [U[q] for q in ids]))
        for c in nd.get('children', []):
            knoten(c, t)
    for r in j['scenes'][j.get('scene', 0)]['nodes']:
        knoten(r, [0, 0, 0])
    return tris


def farbe(uv):
    u = sum(x[0] for x in uv) / 3; v = sum(x[1] for x in uv) / 3
    x = min(TEX.width - 1, max(0, int((u % 1) * TEX.width))); y = min(TEX.height - 1, max(0, int((v % 1) * TEX.height)))
    return TEX.getpixel((x, y))


def normale(p):
    a = [p[1][i] - p[0][i] for i in range(3)]; b = [p[2][i] - p[0][i] for i in range(3)]
    n = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
    l = (n[0] ** 2 + n[1] ** 2 + n[2] ** 2) ** 0.5
    return [x / l for x in n] if l > 1e-12 else None


def gruen(c): return c[1] > c[0] + 25 and c[1] > c[2] + 10
def dunkel(c): return sum(c) < 200


def teil(name):
    boden, wand = [], []
    for p, uv in lies_glb(os.path.join(QUELLE, name + '.glb')):
        n = normale(p)
        if n is None:
            continue
        c = farbe(uv)
        q = [round(v * 10000) for pt in p for v in pt]
        if (gruen(c) or dunkel(c)) and n[1] > 0.25:
            if n[1] < 0:
                continue
            boden.append(q)
        elif abs(n[1]) < 0.7 and not dunkel(c) and max(pt[1] for pt in p) > 0.064:   # Seiten der Bodenplatte liegen unter der Spielfläche
            wand.append(q)
    return {'b': [v for t in boden for v in t], 'w': [v for t in wand for v in t]}


def main():
    os.makedirs(os.path.join(ZIEL, 'Textures'), exist_ok=True)
    for n in BAHN + DEKO:
        shutil.copyfile(os.path.join(QUELLE, n + '.glb'), os.path.join(ZIEL, n + '.glb'))
    for t in ['colormap.png', 'variation-a.png', 'variation-b.png']:
        shutil.copyfile(os.path.join(QUELLE, 'Textures', t), os.path.join(ZIEL, 'Textures', t))
    daten = {n: teil(n) for n in BAHN}
    with open(TEILE_JS, 'w') as f:
        f.write('// PUTT-PROFI: Kollisionsdreiecke der Bahnteile (erzeugt von tools/putt-profi-assets.py, nicht von Hand ändern).\n')
        f.write('// Je Teil: b = Boden-Dreiecke, w = Wand-Dreiecke; je Dreieck 9 Zahlen (x,y,z ×3) in 1/10000 Feld.\n')
        f.write('export const TEILE = {\n')
        for n, d in daten.items():
            f.write("  '%s': { b: [%s], w: [%s] },\n" % (n, ','.join(map(str, d['b'])), ','.join(map(str, d['w']))))
        f.write('};\n')
    for n, d in daten.items():
        print('%-18s Boden %4d  Wand %4d' % (n, len(d['b']) // 9, len(d['w']) // 9))
    print('teile.js', os.path.getsize(TEILE_JS), 'Bytes')


if __name__ == '__main__':
    main()
