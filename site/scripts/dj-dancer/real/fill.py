"""The places neither design photo saw well (bake.py took the model's own colour there), filled from
the nearest place a photo did see, where that's close by and the model's colour is far off it: the
grooves between strands of her hair (TRELLIS coloured some of them like her blouse: white streaks in
her hair once she turns), a fold, the inside of a pleat. Her sides, which no photo sees head on but
which the model coloured well, keep the model's colour.
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
far_off = np.abs(lum(C[idx]) - lum(near)) > 0.22
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
