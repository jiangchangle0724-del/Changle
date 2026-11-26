"""A new outfit on the first dancer (Nov 21; Steve: "直接用第一个人物的模型脸，只给她换几套衣服"): her own
texture kept where the new design looks as hers did (her face, her hair, her skin), the new design's
colours where it differs (the clothes, and skin where the clothes were), through the fitted cameras of
her own bake (bake.py). A texel neither photo sees well takes the colour of the nearest one seen (on her,
in 3D). usage: python3 reskin.py <her work dir (bake.py's)> <club photos dir> <new photos dir> <her texture.png> <out.png>"""
import sys, json, numpy as np, cv2
from PIL import Image
from scipy.spatial import cKDTree
from scipy.spatial.transform import Rotation as Rot
sys.path.insert(0, __import__('os').path.dirname(__file__))
from rast import load, raster, interp, sample
from cams import project

work, clubph, newph, tex, out = sys.argv[1:6]
P, N, UV, T = load(work + '/trellis')
cams = json.load(open(work + '/cams.json'))
her = np.asarray(Image.open(tex).convert('RGB'), np.float32) / 255
S = her.shape[0]
_, tid, b1, b2 = raster(UV[:, 0] * S, UV[:, 1] * S, np.zeros(len(UV)), T, S, S)
valid = tid >= 0
X = interp(P, T, tid, b1, b2)[valid]
Nn = interp(N, T, tid, b1, b2)[valid]; Nn /= np.linalg.norm(Nn, axis=1, keepdims=True) + 1e-9
acc = np.zeros((len(X), 3)); macc = np.zeros(len(X)); wsum = np.zeros(len(X))
bacc = np.zeros(len(X)); bsum = np.zeros(len(X))
KNEE = 0.579 / 1.74  # her knees' height, of hers
for view, back in [('front', False), ('back', True)]:
    prm = np.array(cams[view]); W = H = 1024
    px, py, pz = project(P, prm, back)
    zbuf, _, _, _ = raster(px, py, pz, T, W, H)
    old = np.asarray(Image.open(f'{clubph}/{view}.png').convert('RGB'), np.float32) / 255
    new = np.asarray(Image.open(f'{newph}/{view}.png').convert('RGB'), np.float32) / 255
    # where the new design differs from hers: the clothes (her head and her hair aside)
    d = np.abs(cv2.GaussianBlur(new, (0, 0), 2) - cv2.GaussianBlur(old, (0, 0), 2)).sum(2)
    ch = (d > 0.16).astype(np.uint8)
    ch = cv2.morphologyEx(ch, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8))
    ch = cv2.morphologyEx(ch, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
    rgba = np.asarray(Image.open(f'{work}/{view}_cut.png').convert('RGBA'), np.float32) / 255
    ys = np.nonzero((rgba[..., 3] > 0.5).any(1))[0]; top, bottom = ys.min(), ys.max()
    neck = int(top + 0.135 * (bottom - top))
    ch[:neck] = 0
    # her boots stay boots (their shape is in her mesh: bare legs painted on them look like boots in
    # skin), in the colour of the design's shoes, below her knees
    knee = int(top + (1 - KNEE) * (bottom - top))
    ch[knee:] = 0
    boot = ((old.mean(2) < 0.3) & (rgba[..., 3] > 0.5)).astype(np.float32); boot[:knee - 8] = 0
    boot = cv2.GaussianBlur(boot, (0, 0), 2)
    if view == 'front':
        feet = new[int(bottom - 0.035 * (bottom - top)):bottom + 1]
        fb = np.median(np.concatenate([new[:, :12], new[:, -12:]], 1), 1, keepdims=True)[int(bottom - 0.035 * (bottom - top)):bottom + 1]
        on = np.abs(feet - fb).sum(2) > 0.12
        shoe = np.median(feet[on], 0) if on.sum() > 20 else None
    dark = (old.mean(2) < 0.22) & (new.mean(2) < 0.22)
    ch[dark] = 0
    m = cv2.GaussianBlur(cv2.dilate(ch, np.ones((7, 7), np.uint8)).astype(np.float32), (0, 0), 3)
    # the new design's figure: what isn't its plain background (a texel of hers outside it, as her vest's
    # edges or her boots' when the new legs are bare, isn't seen: it takes the nearest seen colour)
    bg = np.median(np.concatenate([new[:, :12], new[:, -12:]], 1), 1, keepdims=True)
    fig = (np.abs(new - bg).sum(2) > 0.12).astype(np.uint8)
    fig = cv2.morphologyEx(fig, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
    fig = cv2.GaussianBlur(cv2.erode(fig, np.ones((7, 7), np.uint8)).astype(np.float32), (0, 0), 1.5)
    flow = np.load(f'{work}/warp_{view}.npy')
    tx, ty, tz = project(X, prm, back)
    xi = np.clip(tx, 0, W - 1.001); yi = np.clip(ty, 0, H - 1.001)
    vis = tz >= zbuf[yi.astype(int), xi.astype(int)] - 0.004
    n = Nn.copy()
    if back: n[:, 0] *= -1; n[:, 2] *= -1
    cos = (n @ Rot.from_euler('yxz', prm[3:6]).as_matrix().T)[:, 2]
    fx = sample(flow, (xi + 0.5) / W, (yi + 0.5) / H)
    qx = (tx + fx[:, 0]) / W; qy = (ty + fx[:, 1]) / H
    a_er = cv2.GaussianBlur(cv2.erode((rgba[..., 3] > 0.5).astype(np.uint8), np.ones((5, 5), np.uint8)).astype(np.float32), (0, 0), 1.5)[..., None]
    k = np.clip((cos - 0.2) / 0.45, 0, 1); k = k * k * (3 - 2 * k)
    w = vis * k * sample(a_er, qx, qy)[:, 0] * sample(fig[..., None], qx, qy)[:, 0]
    acc += sample(new, qx, qy) * w[:, None]; macc += sample(m[..., None], qx, qy)[:, 0] * w; wsum += w
    wb = vis * k * sample(a_er, qx, qy)[:, 0]
    bacc += sample(boot[..., None], qx, qy)[:, 0] * wb; bsum += wb
    print(view, 'changed', round(float(ch.mean()), 3))
seen = wsum > 0.6
col = np.where(seen[:, None], acc / np.maximum(wsum, 1e-6)[:, None], 0)
mask = np.where(seen, macc / np.maximum(wsum, 1e-6), 0)
# (not seen: as the nearest seen texel, on her)
tree = cKDTree(X[seen])
_, nn = tree.query(X[~seen])
col[~seen] = col[seen][nn]; mask[~seen] = mask[seen][nn]
mask = np.clip(mask * 1.4, 0, 1)
old_t = her[valid]
res = her.copy()
mixed = col * mask[:, None] + old_t * (1 - mask[:, None])
sb = bsum > 0.3
bw = np.where(sb, bacc / np.maximum(bsum, 1e-6), 0)
# (her boots' sides, which neither photo sees: as the nearest seen, on her)
_, nb = cKDTree(X[sb]).query(X[~sb]); bw[~sb] = bw[sb][nb]
if shoe is not None and shoe.mean() > 0.3:
    # (light shoes: her boots that colour, their own light and dark kept)
    lum = old_t.mean(1); ref = np.median(lum[bw > 0.5]) if (bw > 0.5).any() else 0.15
    re = np.clip(shoe[None] * (lum / max(ref, 1e-3))[:, None] ** 0.8, 0, 1)
    mixed = re * bw[:, None] + mixed * (1 - bw[:, None])
    print('boots in', (shoe * 255).astype(int))
res[valid] = mixed
Image.fromarray((np.clip(res, 0, 1) * 255).astype(np.uint8)).save(out)
mm = np.zeros((S, S), np.float32); mm[valid] = mask
Image.fromarray((mm * 255).astype(np.uint8)).save(out.replace('.png', '_mask.png'))
print('texels', len(X), 'seen', round(float(seen.mean()), 3), 'new', round(float((mask > 0.5).mean()), 3))
