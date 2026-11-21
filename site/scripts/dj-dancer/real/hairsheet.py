"""Her long hair a layer of its own (Nov 21; Steve: "背部头发粘在一起的的问题一直没改"): TRELLIS made the hair
down her back one surface with her back, so it couldn't swing free of her. Here the hair is a sheet of its
own, from the back of her head down to its ends (each strip of it as long as the back photo shows the hair
there), following the curve of her back a little behind it, coloured from the back photo; her back under
it painted as what's round it (her top, her skin). Its own strip of the texture under the others. Its
vertices go with her head; springs.py then gives it the hair's swinging bones (its config's "only").

usage: python3 hairsheet.py <ms dir> <her photos dir> <texture.png> <out ms dir> <out texture.png> <her ms dir (her own, for her hair)>
"""
import json, os, shutil, sys
import numpy as np
from PIL import Image
from scipy.spatial import cKDTree
sys.path.insert(0, os.path.dirname(__file__))
from rast import raster, interp

ms, herph, texin, out, texout, herms = sys.argv[1:7]
os.makedirs(out, exist_ok=True)
P = np.fromfile(ms + '/pos.f32', np.float32).reshape(-1, 3).astype(float)
UV = np.fromfile(ms + '/uv.f32', np.float32).reshape(-1, 2).astype(float)
T = np.fromfile(ms + '/idx.u32', np.uint32).reshape(-1, 3)
Nr = np.fromfile(ms + '/nrm.f32', np.float32).reshape(-1, 3); Ns = np.fromfile(ms + '/nrm_s.f32', np.float32).reshape(-1, 3)
j4 = np.load(ms + '/joints4.npy'); w4 = np.load(ms + '/weights4.npy')
skel = [b for b in json.load(open(ms + '/skeleton.json')) if not b.startswith(('Hair', 'Skirt'))]
tex = np.asarray(Image.open(texin).convert('RGBA'), np.float32) / 255
TH, TW = tex.shape[:2]
Htop = P[:, 1].max()

# her hair down her back as she was made: the vertices her own springs gave to the hair, below her nape
hm = herms
hskel = json.load(open(hm + '/skeleton.json'))
hj = np.fromfile(hm + '/j4.u8', np.uint8).reshape(-1, 4); hw = np.fromfile(hm + '/w4.f32', np.float32).reshape(-1, 4)
hairb = np.array([b.startswith('Hair') for b in hskel])
nh = len(hj)
H = np.zeros(len(P), bool)
H[:nh] = (hw * hairb[hj]).sum(1) > 0.3
H &= P[:, 1] < 1.46

# the back photo: the hair in it (dark, in her figure, through her middle)
img = np.asarray(Image.open(f'{herph}/back.png').convert('RGB'), np.float32) / 255
bg = np.median(np.concatenate([img[:, :12], img[:, -12:]], 1), 1, keepdims=True)
fig = np.abs(img - bg).sum(2) > 0.12
ys, xs = np.nonzero(fig)
rows = np.bincount(ys, minlength=img.shape[0]) > 3
top = int(np.argmax(rows)); bottom = int(len(rows) - 1 - np.argmax(rows[::-1]))
mid = float(np.median(xs[(ys > top + (bottom - top) * 0.15) & (ys < top + (bottom - top) * 0.55)]))
k = Htop / (bottom - top)
hair = fig & (img.mean(2) < 0.34)
import cv2
hair = cv2.morphologyEx(hair.astype(np.uint8), cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8)).astype(bool)
px = lambda x: mid - x / k
py = lambda y: top + (Htop - y) / k
ym = lambda r: Htop - (r - top) * k

# the sheet: from the back of her head (inside it a little) down; columns as wide as the hair there
y0 = 1.50
c0 = int(round(py(1.40)))
row = hair[c0]
i0 = i1 = int(round(mid))
while i0 > 0 and row[i0 - 1]: i0 -= 1
while i1 < len(row) - 1 and row[i1 + 1]: i1 += 1
half = min((i1 - i0) / 2 * k, 0.16)
NU, NV = 20, 16
xs_ = np.linspace(-half, half, NU + 1)
ends = []
for x in xs_:
    c = int(round(px(x)))
    col = hair[:, max(0, c - 2):c + 3].any(1)
    r = int(py(1.35))
    while r < len(col) - 1 and col[r + 1]: r += 1
    ends.append(min(ym(r), 1.36))
ends = np.convolve(np.pad(np.array(ends), 2, mode='edge'), np.ones(5) / 5, 'valid')
print('hair', round(half * 2, 3), 'm wide, ends', round(float(ends.min()), 3), 'to', round(float(ends.max()), 3))

# behind her back: at each height and across, a little behind the furthest back she is there
body = np.ones(len(P), bool)
def back_z(x, y):
    near = body & (np.abs(P[:, 1] - y) < 0.015) & (np.abs(P[:, 0] - x) < 0.02)
    return P[near, 2].min() if near.any() else None
V, Nv, Uv = [], [], []
S0 = TH
SH = 512
for j in range(NV + 1):
    t = j / NV
    for i, x in enumerate(xs_):
        y = y0 + t * (ends[i] - y0)
        z = back_z(x * (0.85 if t < 0.15 else 1), y)
        z = (z if z is not None else -0.09) - (0.004 if t < 0.12 else 0.01)
        V.append([x, y, z]); Nv.append([0, 0.15, -1])
        Uv.append([(i / NU) * (TW - 2) / TW + 1 / TW, (S0 + 1 + t * (SH - 3)) / (S0 + SH)])
V, Nv, Uv = np.array(V), np.array(Nv) / np.linalg.norm(Nv, axis=1, keepdims=True), np.array(Uv)
F = []
for j in range(NV):
    for i in range(NU):
        a0 = j * (NU + 1) + i; a1 = a0 + 1; b0 = a0 + NU + 1; b1 = b0 + 1
        F += [[a0, a1, b0], [a1, b1, b0]]
F = np.array(F) + len(P)

# its colours: the back photo where the sheet is
strip = np.zeros((SH, TW, 4), np.float32)
uu, vv = np.meshgrid((np.arange(TW) + 0.5) / TW, (np.arange(SH) + 0.5) / SH)
xx = -half + uu * 2 * half
ee = np.interp(xx, xs_, ends)
yy = y0 + vv * (ee - y0)
xi = np.clip(px(xx), 0, img.shape[1] - 1).astype(int); yi = np.clip(py(yy), 0, img.shape[0] - 1).astype(int)
strip[..., :3] = img[yi, xi]
# (where the photo shows no hair: the nearest hair along the row)
ok = hair[yi, xi]
for r in range(SH):
    if (~ok[r]).any() and ok[r].any():
        idx = np.nonzero(ok[r])[0]
        strip[r, ~ok[r], :3] = strip[r, idx[np.abs(np.arange(TW)[~ok[r]][:, None] - idx[None]).argmin(1)], :3]
strip[..., 3] = 1

# her back under it: the texels of her hair's triangles, as the nearest of her that isn't hair
Sx = TW
under = H[T].all(1)
_, tid, b1, b2 = raster(UV[:, 0] * Sx, UV[:, 1] * TH, np.zeros(len(UV)), T, Sx, TH)
valid = tid >= 0
X = np.zeros((TH, Sx, 3)); X[valid] = interp(P, T, tid, b1, b2)[valid]
hairtex = valid & under[np.maximum(tid, 0)]
keep = valid & ~hairtex & (X[..., 2] < 0.0) & (X[..., 1] > 0.95) & (X[..., 1] < 1.5)
if hairtex.any() and keep.any():
    _, nn = cKDTree(X[keep]).query(X[hairtex])
    tex[hairtex, :3] = tex[keep][nn, :3]
print('her back repainted', int(hairtex.sum()), 'texels')

big = np.concatenate([tex, strip], 0)
Image.fromarray((np.clip(big, 0, 1) * 255).astype(np.uint8)).save(texout)
UV2 = UV.copy(); UV2[:, 1] *= TH / (TH + SH)
Uv[:, 1] = Uv[:, 1]  # (already in the new height)
np.concatenate([P, V]).astype(np.float32).tofile(out + '/pos.f32')
np.concatenate([Nr, Nv]).astype(np.float32).tofile(out + '/nrm.f32')
np.concatenate([Ns, Nv]).astype(np.float32).tofile(out + '/nrm_s.f32')
np.concatenate([UV2, Uv]).astype(np.float32).tofile(out + '/uv.f32')
np.concatenate([T, F]).astype(np.uint32).tofile(out + '/idx.u32')
head = skel.index('Head')
jj = np.concatenate([j4, np.tile([head, 0, 0, 0], (len(V), 1))]); ww = np.concatenate([w4, np.tile([1.0, 0, 0, 0], (len(V), 1))])
np.save(out + '/joints4.npy', jj); np.save(out + '/weights4.npy', ww)
jj.astype(np.uint8).tofile(out + '/j4.u8'); ww.astype(np.float32).tofile(out + '/w4.f32')
json.dump(skel, open(out + '/skeleton.json', 'w'))
for f in ('skirt.npy', 'skirt.json'):
    if os.path.exists(f'{ms}/{f}'):
        if f.endswith('.npy'):
            m = np.load(f'{ms}/{f}'); np.save(f'{out}/{f}', np.concatenate([m, np.zeros(len(V), bool)]))
        else: shutil.copy(f'{ms}/{f}', f'{out}/{f}')
only = np.zeros(len(P) + len(V), bool); only[len(P):] = True
np.save(out + '/hair.npy', only)
print('hair sheet', len(V), 'vertices', len(F), 'triangles')
