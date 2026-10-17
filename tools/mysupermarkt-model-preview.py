"""Offline CPU geometry render of exported game meshes, not a WebGL screenshot.
Usage: python3 tools/mysupermarkt-model-preview.py input.json output.png
Requires numpy and Pillow. Intended to check silhouettes and surface intersections.
"""
import json
import sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont

frames = json.load(open(sys.argv[1], encoding='utf-8'))
W, H = 350, 470
scale = 150
pitch = .13
view = np.array([[1, 0, 0], [0, np.cos(pitch), -np.sin(pitch)], [0, np.sin(pitch), np.cos(pitch)]])
light = np.array([-.4, .8, .65]); light /= np.linalg.norm(light)
result = Image.new('RGB', (W*len(frames), H+100), '#e7f0e7')
for fi, frame in enumerate(frames):
    pixels = np.full((H, W, 3), [225., 237., 226.])
    depth = np.full((H, W), -np.inf)
    for mesh in frame['meshes']:
        pos = np.array(mesh['position']).reshape(-1, 3)
        normals = np.array(mesh['normal']).reshape(-1, 3)
        indices = np.array(mesh['index'] if mesh['index'] is not None else range(len(pos))).reshape(-1, 3)
        for inst in mesh['instances']:
            m = np.array(inst['matrix']).reshape(4, 4).T
            world = pos @ m[:3, :3].T + m[:3, 3]
            p = world @ view.T
            p[:, 0] = W/2 + p[:, 0]*scale
            p[:, 1] = H-54-p[:, 1]*scale
            n = normals @ np.linalg.inv(m[:3, :3])
            n /= np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-10)
            colour = np.array(inst['color'])
            for ids in indices:
                tri = p[ids]
                lo = np.maximum(np.floor(tri[:, :2].min(axis=0)).astype(int), [0, 0])
                hi = np.minimum(np.ceil(tri[:, :2].max(axis=0)).astype(int), [W-1, H-1])
                if np.any(hi < lo): continue
                x0, y0, x1, y1 = lo[0], lo[1], hi[0], hi[1]
                a, b, c = tri
                denom = (b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1])
                if abs(denom) < 1e-8: continue
                yy, xx = np.mgrid[y0:y1+1, x0:x1+1]; xx=xx+.5; yy=yy+.5
                u = ((b[1]-c[1])*(xx-c[0])+(c[0]-b[0])*(yy-c[1]))/denom
                v = ((c[1]-a[1])*(xx-c[0])+(a[0]-c[0])*(yy-c[1]))/denom
                w = 1-u-v
                z = u*a[2]+v*b[2]+w*c[2]
                region = depth[y0:y1+1, x0:x1+1]
                mask = (u>=0)&(v>=0)&(w>=0)&(z>region)
                if not mask.any(): continue
                normal = u[..., None]*n[ids[0]]+v[..., None]*n[ids[1]]+w[..., None]*n[ids[2]]
                normal /= np.maximum(np.linalg.norm(normal, axis=2, keepdims=True), 1e-10)
                lighting = .58+.42*np.maximum(0, normal @ light)
                rgb = np.clip(colour[None,None,:]*lighting[..., None]*255, 0, 255)
                pixels[y0:y1+1, x0:x1+1][mask] = rgb[mask]
                region[mask] = z[mask]
    result.paste(Image.fromarray(pixels.astype('uint8')), (fi*W, 70))

d=ImageDraw.Draw(result)
try:
    font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 18)
    title=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 24)
except OSError:
    font=title=ImageFont.load_default()
d.text((24, 12), 'MySupermarkt · Modellansichten', fill='#164e45', font=title)
d.text((24, 43), 'Originalgeometrie aus dem Spiel · Offline gerendert, kein Browser-Screenshot', fill='#557769', font=font)
for i, f in enumerate(frames):
    d.text((i*W+W/2, H+76), f['title'], anchor='mm', fill='#164e45', font=font)
result.save(sys.argv[2])
