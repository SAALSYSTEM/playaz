#!/usr/bin/env python3
"""Tuff-Tuff-Land: Kenney-Modelle (CC0) in eine kompakte Datei backen.

Aufruf:
  python3 tools/tuff-tuff-land-assets.py <train-kit>/Models/GLB\\ format <nature-kit>/Models/GLTF\\ format <city-kit-suburban>/Models/GLTF\\ format

Jedes Modell wird mit allen Knoten-Transformationen zu EINER Geometrie verschmolzen.
Farben kommen als Vertex-Farben hinein (Materialfarbe bzw. Pixel aus colormap.png an der UV-Stelle),
damit im Spiel ein einziges Material reicht und sich alles zu wenigen Zeichenaufrufen zusammenlegen lässt.

Ausgabe: public/spiele/tuff-tuff-land/modelle.bin
  uint32 Länge des JSON-Kopfes, JSON (UTF-8, auf 4 Byte aufgefüllt), danach die Daten.
  Je Modell: Positionen int16 (×skala), Normalen int8, Farben uint8 sRGB, Indizes uint16.
"""
import json, math, os, struct, sys
import numpy as np
from PIL import Image

ZIEL = os.path.join(os.path.dirname(__file__), '..', 'public', 'spiele', 'tuff-tuff-land', 'modelle.bin')

# name im Spiel: (paket, datei, skalierung, y-versatz)
T, N, C = 'train', 'nature', 'city'
MODELLE = {
    # Gleise: 1 Feld = 4 Einheiten. Gerade = 4 lang, Kurve = Viertelkreis mit Radius 2 (Kante zu Kante)
    'gleis': (T, 'railroad-straight', 1, 1.0),
    'kurve': (T, 'railroad-corner-small', 1, 1.0),
    # Züge (Front zeigt nach +z)
    'lok-blau': (T, 'train-locomotive-c', 1, 0.1), 'lok-rot': (T, 'train-locomotive-b', 1, 0.1), 'lok-gruen': (T, 'train-locomotive-a', 1, 0.1),
    'wagen-a': (T, 'train-locomotive-passenger-a', 1, 0.1), 'wagen-b': (T, 'train-locomotive-passenger-b', 1, 0.1),
    'kiste': (T, 'train-carriage-box', 1, 0.1), 'wagen-rot': (T, 'train-carriage-box', 1, 0.1, '#e8483f'), 'wagen-gelb': (T, 'train-carriage-box', 1, 0.1, '#ffc21c'),
    'wagen-gruen': (T, 'train-carriage-box', 1, 0.1, '#3fb35a'), 'wagen-blau': (T, 'train-carriage-box', 1, 0.1, '#3f8fe8'), 'kohle': (T, 'train-carriage-coal', 1, 0.1), 'holz': (T, 'train-carriage-lumber', 1, 0.1),
    'cont-rot': (T, 'train-carriage-container-red', 1, 0.1), 'cont-blau': (T, 'train-carriage-container-blue', 1, 0.1), 'cont-gruen': (T, 'train-carriage-container-green', 1, 0.1),
    'tank': (T, 'train-carriage-tank', 1, 0.1),
    'tram': (T, 'train-tram-round', 1, 0.1),
    'ice-a': (T, 'train-electric-bullet-a', 1, 0.1), 'ice-b': (T, 'train-electric-bullet-b', 1, 0.1), 'ice-c': (T, 'train-electric-bullet-c', 1, 0.1),
    # Natur
    'baum': (N, 'tree_default', 2.4, 0), 'eiche': (N, 'tree_oak', 2.4, 0), 'dickbaum': (N, 'tree_fat', 2.4, 0), 'baum2': (N, 'tree_detailed', 2.4, 0),
    'baum-herbst': (N, 'tree_default_fall', 2.4, 0), 'eiche-herbst': (N, 'tree_oak_fall', 2.4, 0),
    'tanne': (N, 'tree_pineRoundA', 2.6, 0), 'tanne2': (N, 'tree_pineRoundC', 2.6, 0), 'tanne-hoch': (N, 'tree_pineTallA', 2.6, 0), 'kegelbaum': (N, 'tree_cone', 2.4, 0),
    'busch': (N, 'plant_bush', 2.4, 0), 'busch-gross': (N, 'plant_bushLarge', 2.4, 0),
    'blume-rot': (N, 'flower_redA', 3.8, 0), 'blume-gelb': (N, 'flower_yellowA', 3.8, 0), 'blume-lila': (N, 'flower_purpleA', 3.8, 0),
    'fels': (N, 'rock_largeA', 2.4, 0), 'stein': (N, 'rock_smallA', 2.4, 0), 'pilz': (N, 'mushroom_redGroup', 3.6, 0),
    'stumpf': (N, 'stump_round', 2.4, 0), 'stamm': (N, 'log', 2.4, 0), 'gras': (N, 'grass_large', 3.2, 0),
    'kuerbis': (N, 'crop_pumpkin', 2.6, 0), 'mais': (N, 'crops_cornStageD', 2.4, 0), 'zaun': (N, 'fence_simple', 2.4, 0),
    # Häuser
    'haus1': (C, 'house_type02', 2.6, 0), 'haus2': (C, 'house_type03', 2.6, 0), 'haus3': (C, 'house_type06', 2.6, 0), 'haus4': (C, 'house_type07', 2.6, 0),
    'haus5': (C, 'house_type08', 2.6, 0), 'haus6': (C, 'house_type11', 2.6, 0), 'haus7': (C, 'house_type12', 2.6, 0), 'haus8': (C, 'house_type17', 2.6, 0),
}

# Farben an den Look der Titelbilder anpassen (kräftiges Grün statt Türkis, bunte Dächer)
GLOBAL = {'leafsGreen': '#5fc24a', 'leafsDark': '#3f9e45', 'grass': '#63c447', 'woodBark': '#9a6136', 'woodBarkDark': '#7a4b2c'}
HAUS = {  # Dach, Wand
    'haus1': ('#e8483f', '#f4e3c1'), 'haus2': ('#3f7fe0', '#ffd36b'), 'haus3': ('#ff9200', '#f4e3c1'), 'haus4': ('#8a5bd6', '#ffffff'),
    'haus5': ('#e8483f', '#ffd36b'), 'haus6': ('#2f9e6a', '#f6c2b0'), 'haus7': ('#3f7fe0', '#f4e3c1'), 'haus8': ('#ff9200', '#d6ebff'),
}

KOMP = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
ANZ = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}


def srgb_zu_linear(c):
    c = np.asarray(c, dtype=np.float64)
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def linear_zu_srgb(c):
    c = np.clip(np.asarray(c, dtype=np.float64), 0, 1)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * c ** (1 / 2.4) - 0.055)


def matrix(n):
    if 'matrix' in n:
        return np.array(n['matrix'], dtype=np.float64).reshape(4, 4).T
    t = n.get('translation', [0, 0, 0]); r = n.get('rotation', [0, 0, 0, 1]); s = n.get('scale', [1, 1, 1])
    x, y, z, w = r
    R = np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                  [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                  [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])
    M = np.eye(4); M[:3, :3] = R * np.array(s); M[:3, 3] = t
    return M


def lade(pfad):
    d = open(pfad, 'rb').read()
    l = struct.unpack('<I', d[12:16])[0]
    j = json.loads(d[20:20 + l])
    off = 20 + l
    bl = struct.unpack('<I', d[off:off + 4])[0]
    binär = d[off + 8:off + 8 + bl]

    def acc(i):
        a = j['accessors'][i]; bv = j['bufferViews'][a['bufferView']]
        dt = np.dtype(KOMP[a['componentType']]); k = ANZ[a['type']]
        start = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
        stride = bv.get('byteStride', 0) or dt.itemsize * k
        roh = np.frombuffer(binär, dtype=np.uint8, count=stride * (a['count'] - 1) + dt.itemsize * k, offset=start)
        out = np.lib.stride_tricks.as_strided(roh, shape=(a['count'], dt.itemsize * k), strides=(stride, 1)).copy()
        out = out.view(dt).reshape(a['count'], k)
        if a.get('normalized'):
            out = out.astype(np.float64) / np.iinfo(dt).max
        return out.ravel().astype(np.int64) if a['type'] == 'SCALAR' else out.astype(np.float64)

    return j, acc


def hex_linear(h):
    return srgb_zu_linear([int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)])


def backe(pfad, farben=None):
    farben = {**GLOBAL, **(farben or {})}
    j, acc = lade(pfad)
    bild = None
    for im in j.get('images', []):
        if 'uri' in im:
            bild = np.asarray(Image.open(os.path.join(os.path.dirname(pfad), im['uri'])).convert('RGB'), dtype=np.float64) / 255
    P, Nn, F, I = [], [], [], []
    basis = 0

    def knoten(i, eltern):
        nonlocal basis
        n = j['nodes'][i]; M = eltern @ matrix(n)
        if 'mesh' in n:
            for pr in j['meshes'][n['mesh']]['primitives']:
                pos = acc(pr['attributes']['POSITION'])
                nor = acc(pr['attributes']['NORMAL']) if 'NORMAL' in pr['attributes'] else np.zeros_like(pos)
                ind = acc(pr['indices']) if 'indices' in pr else np.arange(len(pos))
                mat = j['materials'][pr.get('material', 0)] if j.get('materials') else {}
                pbr = mat.get('pbrMetallicRoughness', {})
                faktor = np.array(pbr.get('baseColorFactor', [1, 1, 1, 1])[:3])
                if mat.get('name') in farben: faktor = hex_linear(farben[mat['name']])
                if 'baseColorTexture' in pbr and bild is not None and 'TEXCOORD_0' in pr['attributes']:
                    uv = acc(pr['attributes']['TEXCOORD_0'])
                    h, w, _ = bild.shape
                    px = np.clip((uv[:, 0] % 1) * w, 0, w - 1).astype(int); py = np.clip((uv[:, 1] % 1) * h, 0, h - 1).astype(int)
                    farbe = srgb_zu_linear(bild[py, px]) * faktor
                else:
                    farbe = np.tile(faktor, (len(pos), 1))
                hp = np.c_[pos, np.ones(len(pos))] @ M.T
                Nm = np.linalg.inv(M[:3, :3]).T
                nn = nor @ Nm.T; nn /= np.maximum(np.linalg.norm(nn, axis=1, keepdims=True), 1e-9)
                P.append(hp[:, :3]); Nn.append(nn); F.append(farbe); I.append(ind + basis); basis += len(pos)
        for c in n.get('children', []):
            knoten(c, M)

    szene = j['scenes'][j.get('scene', 0)]
    for r in szene['nodes']:
        knoten(r, np.eye(4))
    return np.vstack(P), np.vstack(Nn), np.vstack(F), np.concatenate(I)


def main():
    if len(sys.argv) < 4:
        print(__doc__); sys.exit(1)
    pakete = {T: sys.argv[1], N: sys.argv[2], C: sys.argv[3]}
    kopf, daten = {}, bytearray()

    def anhaengen(arr):
        while len(daten) % 4: daten.append(0)
        o = len(daten); daten.extend(arr.tobytes()); return o

    for name, (paket, datei, skala, dy, *faerben) in MODELLE.items():
        farben = {'roof': HAUS[name][0], '_defaultMat': HAUS[name][1]} if name in HAUS else None
        P, Nn, F, I = backe(os.path.join(pakete[paket], datei + '.glb'), farben)
        P = P * skala; P[:, 1] += dy
        if faerben:  # graublaue Wagenteile in eine Farbe tauchen (Helligkeit bleibt), Räder/Dunkles bleiben
            s_ = linear_zu_srgb(F); lum = s_.mean(1); blaeulich = (s_[:, 2] > s_[:, 0] + 0.04) & (lum > 0.3)
            ziel = np.array([int(faerben[0][i:i + 2], 16) / 255 for i in (1, 3, 5)])
            neu = np.clip(ziel[None, :] * (lum[:, None] / 0.47) ** 0.9, 0, 1)
            F = np.where(blaeulich[:, None], srgb_zu_linear(neu), F)
        q = float(np.abs(P).max()) / 32767 or 1
        lo, hi = P.min(0), P.max(0)
        kopf[name] = {
            'n': int(len(P)), 'i': int(len(I)), 'q': q,
            'box': [round(float(v), 3) for v in (*lo, *hi)],
            'p': anhaengen(np.round(P / q).astype(np.int16)),
            'no': anhaengen(np.round(Nn * 127).astype(np.int8)),
            'f': anhaengen(np.round(linear_zu_srgb(F) * 255).astype(np.uint8)),
            'ix': anhaengen(I.astype(np.uint16)),
        }
    js = json.dumps(kopf, separators=(',', ':')).encode()
    js += b' ' * (-len(js) % 4)
    os.makedirs(os.path.dirname(ZIEL), exist_ok=True)
    with open(ZIEL, 'wb') as f:
        f.write(struct.pack('<I', len(js))); f.write(js); f.write(daten)
    print(f'{len(MODELLE)} Modelle, {os.path.getsize(ZIEL) / 1024:.0f} KB → {os.path.relpath(ZIEL)}')


if __name__ == '__main__':
    main()
