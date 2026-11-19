"""The design photos (front, back) baked onto the TRELLIS model's texture, through the fitted cameras
and warps (fit.py): each texel where a photo sees it facing the camera takes the photo's colour (the
face, the skin, the clothes as designed); where neither sees it well, the model's own colour matched
to the photos'. Writes <work>/baked.png (S x S, default 2048) and baked_w.png (how much photo).

usage: python3 bake.py <work dir> <photos dir with front.png, back.png> [S]"""
import sys, json
import numpy as np, cv2
from PIL import Image
from rast import raster, interp, sample, load
from cams import project
from scipy.spatial.transform import Rotation as Rot

work = sys.argv[1]; photos = sys.argv[2]; S = int(sys.argv[3]) if len(sys.argv) > 3 else 2048
P, N, UV, T = load(work + '/trellis')
base = np.asarray(Image.open(work + '/trellis/base.webp').convert('RGB'), np.float32) / 255
cams = json.load(open(work + '/cams.json'))

# texels: where on her each one is, and which way it faces
_, tid, b1, b2 = raster(UV[:, 0] * S, UV[:, 1] * S, np.zeros(len(UV)), T, S, S)
valid = tid >= 0
X = interp(P, T, tid, b1, b2)[valid]
Nn = interp(N, T, tid, b1, b2)[valid]
Nn /= np.linalg.norm(Nn, axis=1, keepdims=True) + 1e-9
uvt = (np.stack(np.nonzero(valid)[::-1], 1) + 0.5) / S
C_t = sample(base, uvt[:, 0], uvt[:, 1])
print('texels', len(X))

acc = np.zeros((len(X), 3), np.float64); wsum = np.zeros(len(X))
views = {}
for view, back in [('front', False), ('back', True)]:
    prm = np.array(cams[view]); W = H = 1024
    px, py, pz = project(P, prm, back)
    zbuf, _, _, _ = raster(px, py, pz, T, W, H)
    rgba = np.asarray(Image.open(f'{work}/{view}_cut.png').convert('RGBA'), np.float32) / 255
    photo = np.asarray(Image.open(f'{photos}/{view}.png').convert('RGB'), np.float32) / 255
    flow = np.load(f'{work}/warp_{view}.npy')
    # texels into this camera
    tx, ty, tz = project(X, prm, back)
    xi = np.clip(tx, 0, W - 1.001); yi = np.clip(ty, 0, H - 1.001)
    zs = zbuf[yi.astype(int), xi.astype(int)]
    vis = (tz >= zs - 0.004)
    # facing the camera: the normal turned like the points
    n = Nn.copy()
    if back:
        n[:, 0] *= -1; n[:, 2] *= -1
    Rm = Rot.from_euler('yxz', prm[3:6]).as_matrix()
    cos = (n @ Rm.T)[:, 2]
    fx = sample(flow, (xi + 0.5) / W, (yi + 0.5) / H)
    qx = (tx + fx[:, 0]) / W; qy = (ty + fx[:, 1]) / H
    col = sample(photo, qx, qy)
    # the cut-out pulled in a little: no grey from the photo's background at the edges
    a_er = cv2.erode((rgba[..., 3] > 0.5).astype(np.uint8), np.ones((5, 5), np.uint8)).astype(np.float32)
    a_er = cv2.GaussianBlur(a_er, (0, 0), 1.5)[..., None]
    aq = sample(a_er, qx, qy)[:, 0]
    k = np.clip((cos - 0.2) / 0.45, 0, 1); k = k * k * (3 - 2 * k)
    w = vis * k * aq
    views[view] = (col, w)
    acc += col * w[:, None]; wsum += w
    print(view, 'seen', (w > 0.5).mean().round(3), 'flow px mean', np.abs(flow).mean().round(2), 'max', np.abs(flow).max().round(1))

# the model's colour matched to the photos' (per channel, where a photo sees well)
sure = wsum > 0.9
ph = acc[sure] / wsum[sure][:, None]
A = np.stack([C_t[sure], np.ones((sure.sum(), 3))], -1)
gain = np.zeros(3); bias = np.zeros(3)
for c in range(3):
    g, b = np.linalg.lstsq(A[:, c, :], ph[:, c], rcond=None)[0]
    gain[c], bias[c] = g, b
print('model->photo gain', gain.round(3), 'bias', bias.round(3))
C_m = np.clip(C_t * gain + bias, 0, 1)
rest = np.clip(1 - wsum, 0, None)
C = (acc + C_m * rest[:, None]) / (wsum + rest)[:, None]

def to_img(vals):
    img = np.zeros((S, S, 3), np.float32); img[valid] = vals
    # grow each island outwards (no dark seams when the texture is filtered)
    m = valid.astype(np.uint8)
    out = (np.clip(img, 0, 1) * 255).astype(np.uint8)
    for _ in range(8):
        dil = cv2.dilate(out, np.ones((3, 3), np.uint8))
        mm = cv2.dilate(m, np.ones((3, 3), np.uint8))
        grow = (mm > 0) & (m == 0)
        out[grow] = dil[grow]; m = mm
    return out
Image.fromarray(to_img(C)).save(f'{work}/baked.png')
Image.fromarray(to_img(np.stack([wsum.clip(0, 1)] * 3, 1))).save(f'{work}/baked_w.png')
print('saved')
