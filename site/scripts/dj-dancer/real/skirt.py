"""A skirt of its own on the first dancer (Nov 21; Steve: "直接用第一个人物的模型脸，只给她换几套衣服"): her
clothes are painted on her (reskin.py), but a skirt painted on her thighs would part with her legs, so a
skirt is made here: rings round her from the waist down to the hem, each as wide as the new design shows
it at that height (from the front photo, her arms aside) and never inside her (each ring holds her body
at its height, a little ease), coloured from the design's front and back photos. Its own strip of the
texture, under hers (the texture 2048 x 2560 then). Its vertices go with her hips; springs.py then gives
it swinging bones (its config's "only": these vertices).

usage: python3 skirt.py <her ms dir> <joints.json> <her photos dir> <new photos dir> <new texture.png (2048)>
       <out ms dir> <out texture.png> [--waist m] [--hem m]
The photos are lined up with hers (register.py): her height in them from her top to her toes.
"""
import json, os, shutil, sys
import numpy as np
from PIL import Image

args = sys.argv[1:]
opt = {}
while '--waist' in args or '--hem' in args:
    i = next(i for i, a in enumerate(args) if a in ('--waist', '--hem'))
    opt[args[i][2:]] = float(args[i + 1]); del args[i:i + 2]
ms, jfile, herph, newph, texin, out, texout = args[:7]
os.makedirs(out, exist_ok=True)
P = np.fromfile(ms + '/pos.f32', np.float32).reshape(-1, 3).astype(float)
UV = np.fromfile(ms + '/uv.f32', np.float32).reshape(-1, 2)
T = np.fromfile(ms + '/idx.u32', np.uint32).reshape(-1, 3)
Nr = np.fromfile(ms + '/nrm.f32', np.float32).reshape(-1, 3)
Ns = np.fromfile(ms + '/nrm_s.f32', np.float32).reshape(-1, 3)
j4 = np.load(ms + '/joints4.npy'); w4 = np.load(ms + '/weights4.npy')
skel = [b for b in json.load(open(ms + '/skeleton.json')) if not b.startswith(('Hair', 'Skirt'))]
J = {k: np.array(v, float) for k, v in json.load(open(jfile))['joints'].items()}
Htop = P[:, 1].max()

def figure(a):
    bg = np.median(np.concatenate([a[:, :12], a[:, -12:]], 1), 1, keepdims=True)
    m = np.abs(a - bg).sum(2) > 0.12
    ys, xs = np.nonzero(m)
    rows = np.bincount(ys, minlength=a.shape[0]) > 3
    top = int(np.argmax(rows)); bottom = int(len(rows) - 1 - np.argmax(rows[::-1]))
    mid = float(np.median(xs[(ys > top + (bottom - top) * 0.15) & (ys < top + (bottom - top) * 0.55)]))
    return top, bottom, mid, m

photo, frame = {}, {}
for view in ('front', 'back'):
    her = np.asarray(Image.open(f'{herph}/{view}.png').convert('RGB'), np.float32) / 255
    new = np.asarray(Image.open(f'{newph}/{view}.png').convert('RGB'), np.float32) / 255
    top, bottom, mid, _ = figure(her)
    _, _, _, fig = figure(new)
    photo[view] = new
    frame[view] = (top, Htop / (bottom - top), mid, fig)

def to_px(view, x, y):
    top, k, mid, _ = frame[view]
    return (mid + x / k if view == 'front' else mid - x / k), top + (Htop - y) / k

# the hem: going down from her hips, the first height her legs part at in the front photo
top, k, mid, fig = frame['front']
waist = opt.get('waist', J['Hips'][1] + 0.01)
hem = opt.get('hem')
if hem is None:
    for y in np.arange(J['LeftUpLeg'][1] - 0.04, 0.3, -0.005):
        c, r = to_px('front', 0.0, y)
        if not fig[int(r), int(c) - 2:int(c) + 3].any():
            hem = y + 0.01; break
print('waist', round(waist, 3), 'hem', round(hem, 3))

# her body at each height (her arms and hands aside): what a ring must hold
main = np.array(skel)[j4[np.arange(len(P)), np.argmax(w4, 1)]]
body = np.isin(main, ['Hips', 'Spine', 'LeftUpLeg', 'RightUpLeg', 'LeftLeg', 'RightLeg'])
R, NU = 14, 48
Ys = np.linspace(waist, hem, R)
rings = []
for y in Ys:
    near = body & (np.abs(P[:, 1] - y) < 0.012)
    Q = P[near]
    cx, cz = (Q[:, 0].min() + Q[:, 0].max()) / 2, (Q[:, 2].min() + Q[:, 2].max()) / 2
    # the design's width at this height: the run of figure through her middle
    c, r = to_px('front', cx, y)
    row = fig[int(round(r))]
    i0 = i1 = int(round(c))
    while i0 > 0 and row[i0 - 1]: i0 -= 1
    while i1 < len(row) - 1 and row[i1 + 1]: i1 += 1
    a = max((i1 - i0) / 2 * k, (Q[:, 0].max() - Q[:, 0].min()) / 2 + 0.012)
    b = max((Q[:, 2].max() - Q[:, 2].min()) / 2 + 0.018, a * 0.6)
    # (never inside her: her body at this height within the ring, a little ease)
    e = np.sqrt((((Q[:, 0] - cx) / a) ** 2 + ((Q[:, 2] - cz) / b) ** 2).max())
    if e > 0.97: a *= e / 0.97; b *= e / 0.97
    rings.append([cx, cz, a, b])
rings = np.array(rings)
# (smooth down the skirt, never narrower going down: a skirt hangs)
for c in (2, 3):
    rings[:, c] = np.maximum.accumulate(np.convolve(np.pad(rings[:, c], 1, mode='edge'), np.ones(3) / 3, 'valid'))
print('rings a', rings[[0, R // 2, -1], 2].round(3), 'b', rings[[0, R // 2, -1], 3].round(3))

# the mesh: NU + 1 around (the seam at her back), R down
SW, SH0, SH = 2048, 2048, 512
th = np.linspace(-np.pi, np.pi, NU + 1)
V, Nv, Uv = [], [], []
for j, (y, (cx, cz, a, b)) in enumerate(zip(Ys, rings)):
    for t in th:
        V.append([cx + a * np.sin(t), y, cz + b * np.cos(t)])
        n = np.array([np.sin(t) / a, 0, np.cos(t) / b]); Nv.append(n / np.linalg.norm(n))
        Uv.append([(t + np.pi) / (2 * np.pi) * (SW - 2) / SW + 1 / SW, (SH0 + 1 + j / (R - 1) * (SH - 3)) / (SH0 + SH)])
V, Nv, Uv = np.array(V), np.array(Nv), np.array(Uv)
F = []
for j in range(R - 1):
    for i in range(NU):
        a0 = j * (NU + 1) + i; a1 = a0 + 1; b0 = a0 + NU + 1; b1 = b0 + 1
        F += [[a0, b0, a1], [a1, b0, b1]]
F = np.array(F) + len(P)

# its colours: the design's front photo for its front, the back photo for its back, both at its sides
tex = np.asarray(Image.open(texin).convert('RGB'), np.float32) / 255
strip = np.zeros((SH, SW, 3), np.float32)
uu, vv = np.meshgrid((np.arange(SW) + 0.5) / SW, (np.arange(SH) + 0.5) / SH)
tt = uu * 2 * np.pi - np.pi
yy = waist + vv * (hem - waist)
cx, cz, a, b = (np.interp(yy, Ys[::-1], rings[::-1, c]) for c in range(4))
X = cx + a * 0.93 * np.sin(tt)
acc = np.zeros_like(strip); ws = np.zeros(strip.shape[:2])
for view, w in (('front', np.clip(np.cos(tt), 0, 1)), ('back', np.clip(-np.cos(tt), 0, 1))):
    px, py = to_px(view, X, yy)
    img = photo[view]
    xi = np.clip(px, 0, img.shape[1] - 1).astype(int); yi = np.clip(py, 0, img.shape[0] - 1).astype(int)
    ok = frame[view][3][yi, xi]
    w = (w + 0.05) * ok
    acc += img[yi, xi] * w[..., None]; ws += w
strip = acc / np.maximum(ws, 1e-6)[..., None]
# (where neither saw it: the colour of the nearest seen column)
seen = ws > 1e-3
for r in range(SH):
    if (~seen[r]).any() and seen[r].any():
        idx = np.nonzero(seen[r])[0]
        strip[r, ~seen[r]] = strip[r, idx[np.abs(np.arange(SW)[~seen[r]][:, None] - idx[None]).argmin(1)]]
big = np.zeros((SH0 + SH, SW, 3), np.float32)
big[:SH0] = tex; big[SH0:] = strip
Image.fromarray((np.clip(big, 0, 1) * 255).astype(np.uint8)).save(texout)

# her mesh and the skirt's, her texture's rows above the skirt's
UV2 = UV.astype(float).copy(); UV2[:, 1] *= SH0 / (SH0 + SH)
np.concatenate([P, V]).astype(np.float32).tofile(out + '/pos.f32')
np.concatenate([Nr, Nv]).astype(np.float32).tofile(out + '/nrm.f32')
np.concatenate([Ns, Nv]).astype(np.float32).tofile(out + '/nrm_s.f32')
np.concatenate([UV2, Uv]).astype(np.float32).tofile(out + '/uv.f32')
np.concatenate([T, F]).astype(np.uint32).tofile(out + '/idx.u32')
hips = skel.index('Hips')
jj = np.concatenate([j4, np.tile([hips, 0, 0, 0], (len(V), 1))]); ww = np.concatenate([w4, np.tile([1.0, 0, 0, 0], (len(V), 1))])
np.save(out + '/joints4.npy', jj); np.save(out + '/weights4.npy', ww)
jj.astype(np.uint8).tofile(out + '/j4.u8'); ww.astype(np.float32).tofile(out + '/w4.f32')
json.dump(skel, open(out + '/skeleton.json', 'w'))
only = np.zeros(len(P) + len(V), bool); only[len(P):] = True
np.save(out + '/skirt.npy', only)
json.dump({'waist': float(waist), 'hem': float(hem), 'crotch': float(J['LeftUpLeg'][1] - 0.08)}, open(out + '/skirt.json', 'w'))
print('skirt', len(V), 'vertices', len(F), 'triangles; her', len(P))
