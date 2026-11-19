"""Her hair where neither design photo saw it well (bake.py took the model's own colour there), filled
from the nearest place a photo did see: the grooves between its strands (TRELLIS coloured some of
them like her blouse: white streaks in her hair once she turns). Only the hair: behind her neck or
over her head, a light texel next to dark hair a photo saw. Elsewhere the model's own colour stays
(her face's undersides: filled from the nearest seen, the shadow of her nose spread grey).
Writes <work>/baked.png over bake.py's (that one kept as baked_photo.png).
usage: python3 fill.py <work dir> [S]"""
import os, sys
import numpy as np
from PIL import Image
from scipy import ndimage
from scipy.spatial import cKDTree
from rast import load, raster, interp

work = sys.argv[1]; S = int(sys.argv[2]) if len(sys.argv) > 2 else 2048
P, N, UV, T = load(work + '/trellis')
src = work + '/baked_photo.png'
if not os.path.exists(src):
    os.rename(work + '/baked.png', src)
img = np.asarray(Image.open(src).convert('RGB'), np.float32) / 255
w = np.asarray(Image.open(work + '/baked_w.png').convert('L'), np.float32) / 255
_, tid, b1, b2 = raster(UV[:, 0] * S, UV[:, 1] * S, np.zeros(len(UV)), T, S, S)
valid = tid >= 0
X = interp(P, T, tid, b1, b2)[valid]
C = img[valid]
Wt = w[valid]
seen = Wt > 0.5
poor = Wt < 0.15
tree = cKDTree(X[seen])
d, i = tree.query(X[poor], distance_upper_bound=0.02)
ok = np.isfinite(d)
idx = np.nonzero(poor)[0][ok]
near = C[seen][i[ok]]
lum = lambda c: c @ np.array([0.299, 0.587, 0.114])
# (TRELLIS's units: her height from her feet; her neck's middle, front to back)
y0, y1 = P[:, 1].min(), P[:, 1].max()
hy = (X[:, 1] - y0) / (y1 - y0)
pv = (P[:, 1] - y0) / (y1 - y0)
neck_z = np.median(P[(pv > 0.83) & (pv < 0.86), 2])
hairy = (X[:, 2] < neck_z) | (hy > 0.93)
far_off = (lum(C[idx]) - lum(near) > 0.22) & (lum(near) < 0.3) & hairy[idx]
C2 = C.copy()
C2[idx[far_off]] = near[far_off]
out = img.copy()
out[valid] = C2
# the gutters round each piece of the texture (so a far-off view doesn't bleed old colour in): from
# the nearest texel on her
_, (iy, ix) = ndimage.distance_transform_edt(~valid, return_indices=True)
out[~valid] = out[iy[~valid], ix[~valid]]
Image.fromarray((np.clip(out, 0, 1) * 255).astype(np.uint8)).save(work + '/baked.png')
print('texels', int(valid.sum()), 'poorly seen', int(poor.sum()), 'filled', int(far_off.sum()))
