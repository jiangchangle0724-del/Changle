"""Her long hair free of her back, and still her own hair (Nov 21). Steve, 12:13: "背部头发粘在一起的的问题一直没改";
then, of a sheet of hair made anew for it (hairsheet.py), 12:42: "背面头发你做成双层的的了和原始的头发看起来不匹配，
完全错误". So here nothing about her hair is made anew: its own triangles, where they were and coloured as they
were, are copied 3 mm out as a shell of their own (its texture a copy of hers, in a strip under the others),
and the triangles it leaves behind become her back under her hair: painted as the nearest of her that isn't
hair, going with her back as the back round it does. At rest she looks as she was made; springs.py then gives
the shell the hair's swinging bones (its config's "only": hair.npy), so it swings without pulling her back.

usage: python3 hairshell.py <ms dir> <texture.png> <out ms dir> <out texture.png> <her ms dir (her own, with her springs)>
"""
import json, os, shutil, sys
import numpy as np
from PIL import Image
from scipy.spatial import cKDTree
sys.path.insert(0, os.path.dirname(__file__))
from rast import raster, interp

ms, texin, out, texout, herms = sys.argv[1:6]
os.makedirs(out, exist_ok=True)
P = np.fromfile(ms + '/pos.f32', np.float32).reshape(-1, 3).astype(float)
UV = np.fromfile(ms + '/uv.f32', np.float32).reshape(-1, 2).astype(float)
T = np.fromfile(ms + '/idx.u32', np.uint32).reshape(-1, 3)
Nr = np.fromfile(ms + '/nrm.f32', np.float32).reshape(-1, 3); Ns = np.fromfile(ms + '/nrm_s.f32', np.float32).reshape(-1, 3)
j4 = np.load(ms + '/joints4.npy'); w4 = np.load(ms + '/weights4.npy')
skel = [b for b in json.load(open(ms + '/skeleton.json')) if not b.startswith(('Hair', 'Skirt'))]
tex = np.asarray(Image.open(texin).convert('RGBA'), np.float32) / 255
TH, TW = tex.shape[:2]

# her hair down her back: the vertices her own springs swing (a little), below her nape
hskel = json.load(open(herms + '/skeleton.json'))
hj = np.fromfile(herms + '/j4.u8', np.uint8).reshape(-1, 4); hw = np.fromfile(herms + '/w4.f32', np.float32).reshape(-1, 4)
hairb = np.array([b.startswith('Hair') for b in hskel])
nh = len(hj)
H = np.zeros(len(P), bool)
H[:nh] = (hw * hairb[hj]).sum(1) > 0.05
H &= P[:, 1] < 1.46
under = H[T].all(1)
vs = np.unique(T[under])
print('hair', len(vs), 'vertices', int(under.sum()), 'triangles')

# her back under it goes with her back round it (not her head): the weights of the nearest of her back
back = np.zeros(len(P), bool)
back[:nh] = True
back &= ~H & (P[:, 2] < -0.02) & (P[:, 1] > 0.95) & (P[:, 1] < 1.5) & (np.abs(P[:, 0]) < 0.24)
bi = np.nonzero(back)[0]
_, nn = cKDTree(P[bi]).query(P[H])
j4 = j4.copy(); w4 = w4.copy()
j4[H] = j4[bi[nn]]; w4[H] = w4[bi[nn]]

# the shell: her hair's triangles again, 3 mm out, laid flat (as seen from behind) in a strip of its own
S0, SH = TH, 512
Pv = P[vs]
x0, x1 = Pv[:, 0].min() - 0.005, Pv[:, 0].max() + 0.005
y0, y1 = Pv[:, 1].min() - 0.005, Pv[:, 1].max() + 0.005
su = (Pv[:, 0] - x0) / (x1 - x0)
sv = (y1 - Pv[:, 1]) / (y1 - y0)
remap = np.full(len(P), -1, np.int64); remap[vs] = np.arange(len(vs))
Fs = remap[T[under]]
# its colours: hers, through her own texture coordinates
_, tid, b1, b2 = raster(su * TW, sv * SH, -Pv[:, 2], Fs, TW, SH)
ok = tid >= 0
src = interp(UV[vs], Fs, tid, b1, b2)
def bilinear(img, u, v):
    x = np.clip(u * img.shape[1] - 0.5, 0, img.shape[1] - 1.001); y = np.clip(v * img.shape[0] - 0.5, 0, img.shape[0] - 1.001)
    xi, yi = x.astype(int), y.astype(int); fx, fy = (x - xi)[..., None], (y - yi)[..., None]
    return (img[yi, xi] * (1 - fx) * (1 - fy) + img[yi, xi + 1] * fx * (1 - fy)
            + img[yi + 1, xi] * (1 - fx) * fy + img[yi + 1, xi + 1] * fx * fy)
strip = np.zeros((SH, TW, 4), np.float32)
strip[ok] = bilinear(tex, src[ok][:, 0], src[ok][:, 1])
# (round its edges, the nearest of it, so no seam shows)
if (~ok).any():
    yy, xx = np.nonzero(ok); ey, ex = np.nonzero(~ok)
    _, k = cKDTree(np.c_[yy, xx]).query(np.c_[ey, ex])
    strip[ey, ex] = strip[yy[k], xx[k]]
strip[..., 3] = 1
Uv = np.c_[su * (TW - 2) / TW + 1 / TW, (S0 + 1 + sv * (SH - 3)) / (S0 + SH)]

# her back under it: the texels of her hair's triangles, as the nearest of her that isn't hair
_, tid, b1, b2 = raster(UV[:, 0] * TW, UV[:, 1] * TH, np.zeros(len(UV)), T, TW, TH)
valid = tid >= 0
X = np.zeros((TH, TW, 3)); X[valid] = interp(P, T, tid, b1, b2)[valid]
hairtex = valid & under[np.maximum(tid, 0)]
keep = valid & ~hairtex & (X[..., 2] < 0.0) & (X[..., 1] > 0.95) & (X[..., 1] < 1.5)
if hairtex.any() and keep.any():
    _, nn = cKDTree(X[keep]).query(X[hairtex])
    tex[hairtex, :3] = tex[keep][nn, :3]
print('her back repainted', int(hairtex.sum()), 'texels')

big = np.concatenate([tex, strip], 0)
Image.fromarray((np.clip(big, 0, 1) * 255).astype(np.uint8)).save(texout)
UV2 = UV.copy(); UV2[:, 1] *= TH / (TH + SH)
V = Pv + Ns[vs] * 0.003
np.concatenate([P, V]).astype(np.float32).tofile(out + '/pos.f32')
np.concatenate([Nr, Nr[vs]]).astype(np.float32).tofile(out + '/nrm.f32')
np.concatenate([Ns, Ns[vs]]).astype(np.float32).tofile(out + '/nrm_s.f32')
np.concatenate([UV2, Uv]).astype(np.float32).tofile(out + '/uv.f32')
np.concatenate([T, Fs + len(P)]).astype(np.uint32).tofile(out + '/idx.u32')
# (the shell hangs from her spine and neck, as hair does: her shoulders and arms move under it, not it)
keepb = np.array([b in ('Spine', 'Spine1', 'Spine2', 'Neck', 'Head') for b in skel])
sj, sw = j4[vs].copy(), w4[vs] * keepb[j4[vs]]
none = sw.sum(1) < 1e-6
sj[none] = [skel.index('Spine2'), 0, 0, 0]; sw[none] = [1, 0, 0, 0]
sw /= sw.sum(1, keepdims=True)
jj = np.concatenate([j4, sj]); ww = np.concatenate([w4, sw])
np.save(out + '/joints4.npy', jj); np.save(out + '/weights4.npy', ww)
jj.astype(np.uint8).tofile(out + '/j4.u8'); ww.astype(np.float32).tofile(out + '/w4.f32')
json.dump(skel, open(out + '/skeleton.json', 'w'))
for f in ('skirt.npy', 'skirt.json', 'vest.npy'):
    if os.path.exists(f'{ms}/{f}'):
        if f.endswith('.npy'):
            m = np.load(f'{ms}/{f}'); np.save(f'{out}/{f}', np.concatenate([m, np.zeros(len(vs), bool)]))
        else: shutil.copy(f'{ms}/{f}', f'{out}/{f}')
only = np.zeros(len(P) + len(vs), bool); only[len(P):] = True
np.save(out + '/hair.npy', only)
