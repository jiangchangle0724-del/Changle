"""Where her eyes are in her texture, so the page can close them (Steve on Nov 18: "人物的面部表情…看起来还
有点僵硬": she blinks). The texels the front design photo's eyes were baked onto (the same camera and
warp as bake.py), marked in the texture's alpha: 1 elsewhere, under 0.8 in an eye, going from 0 at its
top edge to 0.8 at its bottom, so a lid can come down it. The lid's colour (the skin just above the
eyes) goes in lid.json, for build_glb.mjs. The texture stays opaque on the page (alpha is only read
by the blink).
usage: python3 eyes.py <work dir> <photos dir> [<eyes: x,y x,y in the front photo's pixels> [half width,half height]] [S]
       (without eyes: the ones facewarp.py found, in face.json; the club design's by hand: 560,87 600,87 with 9.5,4.2)"""
import json, sys
import numpy as np
from PIL import Image
from scipy.spatial.transform import Rotation as Rot
from rast import load, raster, interp, sample
from cams import project

work, photos = sys.argv[1], sys.argv[2]
args = sys.argv[3:]
if args and ',' in args[0]:
    rx, ry = (float(v) for v in (args[2] if len(args) > 2 and ',' in args[2] else '9.5,4.2').split(','))
    eyes = [tuple(float(v) for v in a.split(',')) + (rx, ry) for a in args[:2]]
    args = args[3:] if len(args) > 2 and ',' in args[2] else args[2:]
else:
    eyes = [tuple(e) for e in json.load(open(work + '/face.json'))['eyes']]
S = int(args[0]) if args else 2048
P, N, UV, T = load(work + '/trellis')
cams = json.load(open(work + '/cams.json'))
_, tid, b1, b2 = raster(UV[:, 0] * S, UV[:, 1] * S, np.zeros(len(UV)), T, S, S)
valid = tid >= 0
X = interp(P, T, tid, b1, b2)[valid]
Nn = interp(N, T, tid, b1, b2)[valid]
Nn /= np.linalg.norm(Nn, axis=1, keepdims=True) + 1e-9
prm = np.array(cams['front']); W = H = 1024
px, py, pz = project(P, prm, False)
zbuf, _, _, _ = raster(px, py, pz, T, W, H)
tx, ty, tz = project(X, prm, False)
xi = np.clip(tx, 0, W - 1.001); yi = np.clip(ty, 0, H - 1.001)
vis = tz >= zbuf[yi.astype(int), xi.astype(int)] - 0.004
cos = (Nn @ Rot.from_euler('yxz', prm[3:6]).as_matrix().T)[:, 2]
flow = np.load(work + '/warp_front.npy')
f = sample(flow, (xi + 0.5) / W, (yi + 0.5) / H)
qx = tx + f[:, 0]; qy = ty + f[:, 1]
alpha = np.ones(len(X))
above = np.zeros(len(X), bool)
for cx, cy, rx, ry in eyes:
    e = ((qx - cx) / rx) ** 2 + ((qy - cy) / ry) ** 2
    m = vis & (cos > 0.3) & (e < 1)
    alpha[m] = np.minimum(alpha[m], 0.8 * np.clip((qy[m] - (cy - ry)) / (2 * ry), 0, 1))
    # (the lid's colour: her skin round the eye, above it and below it)
    above |= vis & (cos > 0.3) & (np.abs(qx - cx) < rx * 0.6) & (((qy > cy - ry - 6) & (qy < cy - ry - 2)) | ((qy > cy + ry + 3) & (qy < cy + ry + 8)))
img = np.asarray(Image.open(work + '/baked.png').convert('RGB'))
a = np.full((S, S), 255, np.uint8)
a[valid] = (alpha * 255).round().astype(np.uint8)
Image.fromarray(np.dstack([img, a])).save(work + '/baked.png')
lid = img[valid][above].astype(float).mean(0) / 255 if above.any() else np.array([0.85, 0.7, 0.62])
json.dump({'lid': [round(float(v), 3) for v in lid]}, open(work + '/lid.json', 'w'))
print('eye texels', int((alpha < 0.99).sum()), 'lid colour', np.round(lid, 3))
