"""Fit a camera to each design view: the model's silhouette onto the photo's cut-out."""
import numpy as np
from scipy.optimize import minimize
from scipy.spatial.transform import Rotation as Rot
from rast import raster

def project(P, prm, back=False):
    """prm: s, cx, cy, yaw, pitch, roll, persp (1/D in model units). Pixel coords and depth (bigger = nearer)."""
    s, cx, cy, yaw, pitch, roll, persp = prm
    Q = P.copy()
    if back:  # looking from -z: turn the model half round first
        Q[:, 0] *= -1; Q[:, 2] *= -1
    R = Rot.from_euler('yxz', [yaw, pitch, roll]).as_matrix()
    Q = Q @ R.T
    w = 1.0 / (1.0 - Q[:, 2] * persp)
    return cx + s * Q[:, 0] * w, cy - s * Q[:, 1] * w, Q[:, 2]

def silhouette(P, T, prm, W, H, back=False):
    px, py, pz = project(P, prm, back)
    _, tid, _, _ = raster(px, py, pz, T, W, H)
    return tid >= 0

def fit(P, T, mask, back=False, persp=False):
    H, W = mask.shape
    ys, xs = np.nonzero(mask)
    h_img = ys.max() - ys.min()
    h_mesh = P[:, 1].max() - P[:, 1].min()
    s0 = h_img / h_mesh
    c = (P.min(0) + P.max(0)) / 2
    x0 = np.array([s0, (xs.min() + xs.max()) / 2 - s0 * c[0] * (-1 if back else 1), (ys.min() + ys.max()) / 2 + s0 * c[1], 0, 0, 0, 0.0])
    m = mask.astype(bool)
    def loss(v):
        prm = x0.copy()
        prm[:6] = v[:6]
        if persp: prm[6] = v[6]
        sil = silhouette(P, T, prm, W, H, back)
        inter = (sil & m).sum(); union = (sil | m).sum()
        return 1 - inter / union
    v0 = x0[:7] if persp else x0[:6]
    steps = np.array([s0 * 0.02, 3, 3, 0.03, 0.03, 0.02] + ([0.1] if persp else []))
    simplex = np.vstack([v0] + [v0 + np.eye(len(v0))[i] * steps[i] for i in range(len(v0))])
    r = minimize(loss, v0, method='Nelder-Mead', options={'initial_simplex': simplex, 'maxfev': 600, 'xatol': 1e-4, 'fatol': 1e-5})
    prm = x0.copy(); prm[:len(r.x)] = r.x
    return prm, 1 - r.fun
