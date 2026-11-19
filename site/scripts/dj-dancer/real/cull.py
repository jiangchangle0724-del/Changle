"""The inner wall the model's remesh leaves (a second skin about 3.5 mm inside, facing in) dropped:
a triangle goes when no view from all round her sees it and a seen triangle facing the other way
sits just behind it (its outer wall). Hidden outer surfaces (armpits, under the vest) stay: a dance
shows them."""
import sys, os
import numpy as np
from scipy.spatial import cKDTree
from rast import raster, load

d, out = sys.argv[1], sys.argv[2]
P, N, UV, T = load(d)
seen = np.zeros(len(T), bool)
c = (P.min(0) + P.max(0)) / 2
size = 1400
s = size * 0.95 / np.linalg.norm(P.max(0) - P.min(0))
n = 160
i = np.arange(n) + 0.5
phi = np.arccos(1 - 2 * i / n); th = np.pi * (1 + 5 ** 0.5) * i
for v in np.stack([np.sin(phi) * np.cos(th), np.cos(phi), np.sin(phi) * np.sin(th)], 1):
    f = v / np.linalg.norm(v)
    up = np.array([0, 1, 0]) if abs(f[1]) < 0.9 else np.array([1, 0, 0])
    r = np.cross(up, f); r /= np.linalg.norm(r); u = np.cross(f, r)
    q = P - c
    _, tid, _, _ = raster(size / 2 + (q @ r) * s, size / 2 - (q @ u) * s, q @ f, T, size, size)
    seen[tid[tid >= 0]] = True
C = P[T].mean(1)
fn = np.cross(P[T[:, 1]] - P[T[:, 0]], P[T[:, 2]] - P[T[:, 0]]); fn /= np.linalg.norm(fn, axis=1, keepdims=True) + 1e-12
tree = cKDTree(C[seen]); cs = C[seen]; ns = fn[seen]
inner = np.zeros(len(T), bool)
un = np.nonzero(~seen)[0]
for t, lst in zip(un, tree.query_ball_point(C[un], r=0.007)):
    if not lst: continue
    v = cs[lst] - C[t]; along = v @ fn[t]
    lat = np.linalg.norm(v - along[:, None] * fn[t], axis=1)
    ok = (along < -0.001) & (along > -0.0065) & (ns[lst] @ fn[t] < -0.6) & (lat < 0.004)
    inner[t] = ok.any()
keep = T[~inner]
print('triangles', len(T), 'seen', seen.sum(), 'inner wall', inner.sum(), 'kept', len(keep))
used = np.unique(keep)
remap = -np.ones(len(P), np.int64); remap[used] = np.arange(len(used))
os.makedirs(out, exist_ok=True)
P[used].astype(np.float32).tofile(out + '/pos.f32'); N[used].astype(np.float32).tofile(out + '/nrm.f32')
UV[used].astype(np.float32).tofile(out + '/uv.f32'); remap[keep].astype(np.uint32).tofile(out + '/idx.u32')
print('vertices', len(P), '->', len(used))
