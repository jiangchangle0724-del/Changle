"""Skin weights by distance through her body (geodesic voxel binding, after Dionne and de Lasa 2013):
the model filled with voxels, each bone's distance to every voxel found going only through her,
each vertex weighted to the bones nearest it that way (not across the gap to a hand or the other
leg), then smoothed over the surface. Writes joints/weights (4 a vertex) next to the mesh."""
import sys, json, time
import numpy as np
from scipy import ndimage, sparse
from scipy.sparse.csgraph import dijkstra
from rast import load

hi, lo = sys.argv[1], sys.argv[2]   # the full model (to fill), the simplified one (to weigh)
J = json.load(open(sys.argv[3]))['joints']
V = 0.008
P, _, _, T = load(hi)
P2, N2, _, T2 = load(lo)
lo_ = P.min(0) - 3 * V; hi_ = P.max(0) + 3 * V
dims = np.ceil((hi_ - lo_) / V).astype(int) + 1
vox = lambda p: np.floor((p - lo_) / V).astype(int)
t0 = time.time()
# her solid: the voxels inside every one of her silhouettes, seen from all round (a visual hull: the
# model's surface has openings, so it can't be filled from outside)
from rast import raster
centres = lo_ + (np.argwhere(np.ones(dims, bool)) + 0.5) * V
inside = np.ones(len(centres), bool)
size = 1200
c = (P.min(0) + P.max(0)) / 2
sc = size * 0.95 / np.linalg.norm(P.max(0) - P.min(0))
views = [(np.radians(a), np.radians(e)) for e in (-60, -30, 0, 30, 60) for a in range(0, 360, 15 if e == 0 else 30)] + [(0, np.radians(89)), (0, np.radians(-89))]
for a, e in views:
    f = np.array([np.cos(e) * np.sin(a), np.sin(e), np.cos(e) * np.cos(a)])
    upv = np.array([0, 1, 0]) if abs(f[1]) < 0.95 else np.array([1, 0, 0])
    r = np.cross(upv, f); r /= np.linalg.norm(r); u = np.cross(f, r)
    q = P - c
    _, tid, _, _ = raster(size / 2 + (q @ r) * sc, size / 2 - (q @ u) * sc, q @ f, T, size, size)
    sil = ndimage.binary_dilation(tid >= 0, iterations=2)
    qc = centres - c
    cx = np.clip((size / 2 + (qc @ r) * sc).astype(int), 0, size - 1); cy = np.clip((size / 2 - (qc @ u) * sc).astype(int), 0, size - 1)
    inside &= sil[cy, cx]
inside = inside.reshape(dims)
# graph: inside voxels, 26 neighbours, edge length
ids = -np.ones(dims, np.int64); idx = np.argwhere(inside); ids[tuple(idx.T)] = np.arange(len(idx))
rows, cols, vals = [], [], []
for dx in (-1, 0, 1):
    for dy in (-1, 0, 1):
        for dz in (-1, 0, 1):
            if (dx, dy, dz) <= (0, 0, 0): continue
            nb = idx + [dx, dy, dz]
            ok = (nb >= 0).all(1) & (nb < dims).all(1)
            j = np.full(len(idx), -1); j[ok] = ids[tuple(nb[ok].T)]
            m = j >= 0
            rows.append(np.nonzero(m)[0]); cols.append(j[m]); vals.append(np.full(m.sum(), V * np.sqrt(dx * dx + dy * dy + dz * dz)))
G = sparse.csr_matrix((np.concatenate(vals), (np.concatenate(rows), np.concatenate(cols))), shape=(len(idx), len(idx)))
G = G + G.T
# the bones that bend her, each a line (or a few) through her
def seg(a, b, n=60): a, b = np.array(a), np.array(b); return a + (b - a) * np.linspace(0, 1, n)[:, None]
up = np.array([0, 1, 0])
B = {
    'Hips': [seg(J['Hips'], J['Spine']), seg(J['Hips'], J['LeftUpLeg']), seg(J['Hips'], J['RightUpLeg'])],
    'Spine': [seg(J['Spine'], J['Spine1'])], 'Spine1': [seg(J['Spine1'], J['Spine2'])], 'Spine2': [seg(J['Spine2'], J['Neck'])],
    'Neck': [seg(J['Neck'], J['Head'])], 'Head': [seg(J['Head'], np.array(J['Head']) + up * 0.16)],
}
for s in ('Left', 'Right'):
    hand_end = np.array(J[s + 'HandMiddle1']) + (np.array(J[s + 'HandMiddle1']) - np.array(J[s + 'Hand'])) * 0.8
    B.update({
        s + 'Shoulder': [seg(J[s + 'Shoulder'], J[s + 'Arm'])], s + 'Arm': [seg(J[s + 'Arm'], J[s + 'ForeArm'])],
        s + 'ForeArm': [seg(J[s + 'ForeArm'], J[s + 'Hand'])], s + 'Hand': [seg(J[s + 'Hand'], hand_end)],
        s + 'UpLeg': [seg(J[s + 'UpLeg'], J[s + 'Leg'])], s + 'Leg': [seg(J[s + 'Leg'], J[s + 'Foot'])],
        s + 'Foot': [seg(J[s + 'Foot'], J[s + 'ToeBase']), seg(J[s + 'Foot'], np.array(J[s + 'Foot']) - up * 0.15)],
    })
names = list(B)
# each vertex of the simplified model: its voxel (or the nearest inside one)
_, near = ndimage.distance_transform_edt(~inside, return_indices=True)
vi = vox(P2); vi = np.clip(vi, 0, dims - 1)
vv = near[:, vi[:, 0], vi[:, 1], vi[:, 2]].T
vnode = ids[vv[:, 0], vv[:, 1], vv[:, 2]]
centre = lo_ + (vv + 0.5) * V
off = np.linalg.norm(P2 - centre, axis=1)
D = np.full((len(P2), len(names)), np.inf)
for k, nm in enumerate(names):
    s = np.concatenate(B[nm]); si = vox(s)
    ok = (si >= 0).all(1) & (si < dims).all(1); si = si[ok]
    src = ids[si[:, 0], si[:, 1], si[:, 2]]; src = np.unique(src[src >= 0])
    if not len(src): print('bone outside her:', nm); continue
    d = dijkstra(G, directed=False, indices=src, min_only=True, limit=0.9)
    D[:, k] = d[vnode] + off
print('distances %.1fs' % (time.time() - t0))
# the vest hangs from her shoulders: its vertices (silver sequins on her body, by the texture) go
# with her chest only, so lifting an arm or a shoulder doesn't lift the vest's side like a wing
if len(sys.argv) > 4:
    import cv2
    from PIL import Image
    from rast import sample
    _, _, UV2, _ = load(lo)
    tex = np.asarray(Image.open(sys.argv[4]).convert('RGB'), np.float32) / 255
    blur = cv2.blur(tex, (5, 5))
    col = sample(blur, UV2[:, 0], UV2[:, 1])
    mx = col.max(1); mn = col.min(1); sat = (mx - mn) / np.maximum(mx, 1e-3)
    torso = (P2[:, 1] > 1.12) & (P2[:, 1] < 1.44) & (np.abs(P2[:, 0]) > 0.075) & (np.abs(P2[:, 0]) < 0.25)
    vest = torso & (sat < 0.16) & (mx > 0.33)
    allow = [names.index(n) for n in ('Spine1', 'Spine2')]
    mask = np.ones(len(names), bool); mask[allow] = False
    D[np.ix_(vest, mask)] = np.inf
    np.save(lo + '/vest.npy', vest)
    print('vest vertices', vest.sum())
# weights: the nearest bones, falling off with the extra distance
dmin = D.min(1, keepdims=True)
Wt = np.exp(-(D - dmin) / 0.022)
Wt[(D - dmin) > 0.09] = 0
# smoothed over the surface (neighbours by the triangles)
nv = len(P2)
e = np.concatenate([T2[:, [0, 1]], T2[:, [1, 2]], T2[:, [2, 0]]])
# seam vertices (same place, different UVs) count as neighbours too
key = np.round(P2 / 1e-5).astype(np.int64)
_, first = np.unique(key, axis=0, return_inverse=True)
grp = first.ravel()
A = sparse.csr_matrix((np.ones(len(e) * 2), (np.concatenate([e[:, 0], e[:, 1]]), np.concatenate([e[:, 1], e[:, 0]]))), shape=(nv, nv))
S = sparse.csr_matrix((np.ones(nv), (np.arange(nv), grp)))
A = A + S @ S.T
A.setdiag(0); A.eliminate_zeros(); A.data[:] = 1
deg = np.asarray(A.sum(1)).ravel()
Wt = Wt / Wt.sum(1, keepdims=True)
for _ in range(6):
    Wt = 0.5 * Wt + 0.5 * (A @ Wt) / np.maximum(deg, 1)[:, None]
# her sides under the vest belong to her chest, not her arms (the model joins the vest to the inside of
# the arm): there the arm bones are taken out again after smoothing
arm = [names.index(s + n) for s in ('Left', 'Right') for n in ('Arm', 'ForeArm', 'Hand')]
box = (P2[:, 1] > 1.10) & (P2[:, 1] < 1.46) & (np.abs(P2[:, 0]) > 0.06) & (np.abs(P2[:, 0]) < 0.26)
torso_d = D[:, [names.index(n) for n in ('Spine1', 'Spine2', 'LeftShoulder', 'RightShoulder')]].min(1)
arm_d = D[:, arm].min(1)
side = box & (torso_d < arm_d - 0.01)
if 'vest' in dir(): side |= vest
Wt[np.ix_(side, arm)] = 0
Wt = Wt / np.maximum(Wt.sum(1, keepdims=True), 1e-9)
# vertices at one place (a UV seam) weighted alike, so the seam never opens
gsum = np.zeros((grp.max() + 1, Wt.shape[1])); np.add.at(gsum, grp, Wt)
gcnt = np.bincount(grp)
Wt = gsum[grp] / gcnt[grp, None]
print('sides kept off the arms', side.sum())
# four bones a vertex
order = np.argsort(-Wt, 1)[:, :4]
w4 = np.take_along_axis(Wt, order, 1)
w4[w4 < 0.01] = 0
w4 /= w4.sum(1, keepdims=True)
skel = ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head']
for s in ('Left', 'Right'):
    skel += [s + n for n in ('Shoulder', 'Arm', 'ForeArm', 'Hand', 'HandMiddle1')]
for s in ('Left', 'Right'):
    skel += [s + n for n in ('UpLeg', 'Leg', 'Foot', 'ToeBase')]
j4 = np.array([[skel.index(names[k]) for k in r] for r in order], np.uint16)
j4[w4 == 0] = 0
np.save(lo + '/joints4.npy', j4); np.save(lo + '/weights4.npy', w4.astype(np.float32))
# for build_glb.mjs: the same as raw arrays, and smooth normals (a UV seam's vertices alike)
j4.astype(np.uint8).tofile(lo + '/j4.u8'); w4.astype(np.float32).tofile(lo + '/w4.f32')
fn = np.cross(P2[T2[:, 1]] - P2[T2[:, 0]], P2[T2[:, 2]] - P2[T2[:, 0]])
Nn = np.zeros_like(P2)
for k in range(3): np.add.at(Nn, T2[:, k], fn)
g = np.zeros((grp.max() + 1, 3)); np.add.at(g, grp, Nn); Nn = g[grp]
Nn /= np.linalg.norm(Nn, axis=1, keepdims=True) + 1e-12
Nn.astype(np.float32).tofile(lo + '/nrm_s.f32')
json.dump(skel, open(lo + '/skeleton.json', 'w'))
print('done %.1fs' % (time.time() - t0), 'max bones a vertex', (w4 > 0).sum(1).max())
