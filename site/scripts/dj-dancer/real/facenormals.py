"""Her face's light smooth (Nov 21; Steve: "点头了", to: her face shows triangles of light and shade on her
cheeks, under her eyes and on her chin). Her mesh is coarse there, and each vertex's own normal turns with
its few triangles, so the room's light breaks her face into facets. Here her head's normals (above her
neck) are averaged over their neighbours a few times, so the light runs smoothly over her face; her face's
shape and picture stay as they are.
usage: python3 facenormals.py <club ms dir> <ms dir>...   (in place: each dir's nrm_s.f32, her head's vertices)"""
import sys
import numpy as np
from scipy.sparse import coo_matrix
cms, dirs = sys.argv[1], sys.argv[2:]
P = np.fromfile(cms + '/pos.f32', np.float32).reshape(-1, 3).astype(float)
T = np.fromfile(cms + '/idx.u32', np.uint32).reshape(-1, 3).astype(np.int64)
N0 = np.fromfile(cms + '/nrm_s.f32', np.float32).reshape(-1, 3).astype(float)
nh = len(P); top = P[:, 1].max()
head = P[:, 1] > top - 0.30
# (vertices at one place, split at the texture's seams, as one)
_, wid = np.unique(np.round(P, 5), axis=0, return_inverse=True)
wid = wid.ravel()
e = np.concatenate([T[:, [0, 1]], T[:, [1, 2]], T[:, [2, 0]]])
a, b = wid[e[:, 0]], wid[e[:, 1]]
nw = wid.max() + 1
A = coo_matrix((np.ones(len(a) * 2), (np.r_[a, b], np.r_[b, a])), shape=(nw, nw)).tocsr()
A.data[:] = 1
deg = np.asarray(A.sum(1)).ravel()
Nw = np.zeros((nw, 3)); np.add.at(Nw, wid, N0)
Nw /= np.maximum(np.linalg.norm(Nw, axis=1, keepdims=True), 1e-9)
hw = np.zeros(nw, bool); hw[wid[head]] = True
for _ in range(6):
    avg = (A @ Nw + Nw) / (deg + 1)[:, None]
    avg /= np.maximum(np.linalg.norm(avg, axis=1, keepdims=True), 1e-9)
    Nw[hw] = avg[hw]
# (eased in over her neck, so no line of light where it starts)
k = np.clip((P[:, 1] - (top - 0.30)) / 0.05, 0, 1)[:, None]
N = N0 * (1 - k) + Nw[wid] * k
N /= np.maximum(np.linalg.norm(N, axis=1, keepdims=True), 1e-9)
for d in dirs:
    M = np.fromfile(d + '/nrm_s.f32', np.float32).reshape(-1, 3).copy()
    M[:nh][head] = N[head]
    M.astype(np.float32).tofile(d + '/nrm_s.f32')
print('her head', int(head.sum()), 'vertices smoothed in', len(dirs), 'models')
