"""Her lower legs bare and her boots' feet her heels (Nov 21; Steve: "一个接一个继续做", after: with a long dress
her knee-high boots still look like boots). TRELLIS made her boots part of her legs; the reskin paints a new
outfit's shoes' colour on them, so in a dress she still stood in boots. On an outfit that isn't her club one:
each boot's shaft, from her ankle to her knee, pulled in round her leg to a bare leg's width (never widened),
and painted as her own bare knees are in her club texture, round the same side of her leg; the boot's foot,
heel and all, stays: her shoe.

usage: python3 legs.py <ms dir> <texture.png> <club ms dir> <club texture.png> <joints.json>
       (in place: pos.f32 and the texture; the first time, their copies kept as pos.boots.f32, *.boots.png)
"""
import json, os, shutil, sys
import numpy as np
from PIL import Image
from scipy.spatial import cKDTree
sys.path.insert(0, os.path.dirname(__file__))
from rast import raster, interp

ms, texf, cms, ctexf, jf = sys.argv[1:6]
keep_p, keep_t = ms + '/pos.boots.f32', texf[:-4] + '.boots.png'
if not os.path.exists(keep_p): shutil.copy(ms + '/pos.f32', keep_p)
if not os.path.exists(keep_t): shutil.copy(texf, keep_t)
P = np.fromfile(keep_p, np.float32).reshape(-1, 3).astype(float)
C = np.fromfile(cms + '/pos.f32', np.float32).reshape(-1, 3).astype(float)
CUV = np.fromfile(cms + '/uv.f32', np.float32).reshape(-1, 2).astype(float)
CT = np.fromfile(cms + '/idx.u32', np.uint32).reshape(-1, 3)
nh = len(C)
J = json.load(open(jf))['joints']
tex = np.asarray(Image.open(keep_t).convert('RGBA'), np.float32) / 255
ctex = np.asarray(Image.open(ctexf).convert('RGB'), np.float32) / 255
S = ctex.shape[0]                     # (her texture's own block, the same texels at the top of every outfit's)

# a bare leg's width up from her ankle (metres from the middle of the leg): ankle, calf, below the knee
YS = np.array([0.20, 0.24, 0.30, 0.36, 0.42, 0.46, 0.50, 0.54])
RS = np.array([0.034, 0.036, 0.043, 0.050, 0.053, 0.053, 0.054, 0.056])
def smooth(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)
y0, y1 = 0.20, 0.505                  # the shaft painted: above her shoe, up past her boots' tops
newP = P.copy()
paint = np.zeros(nh, bool)
for side in (1, -1):
    foot = np.array(J['LeftFoot' if side > 0 else 'RightFoot'])
    leg = np.zeros(len(P), bool)
    leg[:nh] = (side * C[:, 0] > 0.03) & (C[:, 1] < 0.555)
    # the middle of her leg and its width, every centimetre up
    hs = np.arange(0.14, 0.56, 0.01)
    mid, wid = [], []
    for h in hs:
        s = leg & (np.abs(P[:, 1] - h) < 0.006)
        q = P[s]
        c = np.array([q[:, 0].mean(), q[:, 2].mean()]) if len(q) else np.array([foot[0], foot[2]])
        mid.append(c); wid.append(np.hypot(q[:, 0] - c[0], q[:, 2] - c[1]).mean() if len(q) else 0.05)
    mid, wid = np.array(mid), np.convolve(np.pad(np.array(wid), 2, mode='edge'), np.ones(5) / 5, 'valid')
    mid = np.stack([np.convolve(np.pad(mid[:, k], 2, mode='edge'), np.ones(5) / 5, 'valid') for k in (0, 1)], 1)
    want = np.interp(hs, YS, RS)
    # (eased in above her shoe and out below her knee, no step)
    w = smooth(0.165, 0.215, hs) * (1 - smooth(0.49, 0.54, hs))
    k = 1 + (np.minimum(1, want / np.maximum(wid, 1e-3)) - 1) * w
    i = np.nonzero(leg)[0]
    y = P[i, 1]
    kk = np.interp(y, hs, k, left=1, right=1)
    mx, mz = np.interp(y, hs, mid[:, 0]), np.interp(y, hs, mid[:, 1])
    newP[i, 0] = mx + (P[i, 0] - mx) * kk
    newP[i, 2] = mz + (P[i, 2] - mz) * kk
    paint[:nh] |= leg[:nh] & (C[:, 1] > y0) & (C[:, 1] < y1)
    print('leg', side, 'pulled in to', np.round(k[(hs > 0.19) & (hs < 0.47)].min(), 2), '..', np.round(k[(hs > 0.19) & (hs < 0.47)].max(), 2))
newP.astype(np.float32).tofile(ms + '/pos.f32')

# her skin on them: each texel as her bare knee is in her club texture, round the same side of the same leg
_, tid, b1, b2 = raster(CUV[:, 0] * S, CUV[:, 1] * S, np.zeros(nh), CT, S, S)
valid = tid >= 0
X = np.zeros((S, S, 3)); X[valid] = interp(C, CT, tid, b1, b2)[valid]
tri = paint[CT].all(1)
dst = valid & tri[np.maximum(tid, 0)]
lum = ctex.mean(2)
for side in (1, -1):
    def key(Xs, band):
        cx = np.interp(Xs[:, 1], [0.2, 0.72], [0.165 * side, 0.11 * side]); cz = 0.01
        a = np.arctan2(Xs[:, 2] - cz, Xs[:, 0] - cx)
        return np.c_[np.cos(a) * 0.08, np.sin(a) * 0.08, band]
    # (her thigh's skin, above the crease behind her knee)
    src = valid & (side * X[..., 0] > 0.03) & (X[..., 1] > 0.60) & (X[..., 1] < 0.72) & (lum > 0.35)
    d = dst & (side * X[..., 0] > 0.0)
    Xs, Xd = X[src], X[d]
    tree = cKDTree(key(Xs, (Xs[:, 1] - 0.60) / 0.12 * 0.02))
    _, nn = tree.query(key(Xd, (Xd[:, 1] - y0) / (y1 - y0) * 0.02))
    tex[:S][d, :3] = ctex[src][nn]
    print('leg', side, 'skin', int(d.sum()), 'texels from', int(src.sum()))
# (and the few texels round them that no triangle covers, which the picture's smoothing reads at their
# edges: the nearest painted one, so no seam of boot shows through)
from scipy.ndimage import distance_transform_edt
dist, (ry, rx) = distance_transform_edt(~dst, return_indices=True)
pad = (dist > 0) & (dist <= 4) & ~valid
tex[:S][pad, :3] = tex[:S][ry[pad], rx[pad], :3]
Image.fromarray((np.clip(tex, 0, 1) * 255).astype(np.uint8)).save(texf)
