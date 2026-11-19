"""Turntable preview of the model with a texture: views at given yaw angles, simple light."""
import sys
import numpy as np
from PIL import Image
from rast import raster, interp, sample, load

def views(P, N, UV, T, tex, yaws, size=640, shade=True, crop=None, cull=True):
    c = (P.min(0) + P.max(0)) / 2
    h = P[:, 1].max() - P[:, 1].min()
    outs = []
    for yaw in yaws:
        a = np.radians(yaw)
        R = np.array([[np.cos(a), 0, np.sin(a)], [0, 1, 0], [-np.sin(a), 0, np.cos(a)]])
        Q = (P - c) @ R.T; Nq = N @ R.T
        s = size * 0.95 / h
        if crop:  # (cx, cy, half) in model units: zoom on a region
            cx, cy, half = crop
            s = size / (2 * half)
            Q = Q - np.array([cx, cy - c[1], 0])
        px = size / 2 + Q[:, 0] * s; py = size / 2 - Q[:, 1] * s
        TT = T
        if cull:  # as the GPU draws her: triangles facing away left out
            fz = np.cross(Q[T[:, 1]] - Q[T[:, 0]], Q[T[:, 2]] - Q[T[:, 0]])[:, 2]
            TT = T[fz > 0]
        _, tid, b1, b2 = raster(px, py, Q[:, 2], TT, size, size)
        T_ = TT
        uv = interp(UV, T_, tid, b1, b2)
        col = sample(tex, uv[..., 0], uv[..., 1])
        if shade:
            n = interp(Nq, T_, tid, b1, b2); n /= np.linalg.norm(n, axis=-1, keepdims=True) + 1e-9
            L = np.array([0.3, 0.5, 0.8]); L /= np.linalg.norm(L)
            col = col * (0.55 + 0.45 * np.clip(n @ L, 0, 1))[..., None]
        col[tid < 0] = 0.12
        outs.append((np.clip(col, 0, 1) * 255).astype(np.uint8))
    return np.concatenate(outs, 1)

if __name__ == '__main__':
    work, texf, out = sys.argv[1:4]
    yaws = [float(v) for v in sys.argv[4].split(',')] if len(sys.argv) > 4 else [0, 45, 90, 180]
    crop = tuple(float(v) for v in sys.argv[5].split(',')) if len(sys.argv) > 5 else None
    size = int(sys.argv[6]) if len(sys.argv) > 6 else 640
    P, N, UV, T = load(work + '/trellis')
    tex = np.asarray(Image.open(texf).convert('RGB'), np.float32) / 255
    Image.fromarray(views(P, N, UV, T, tex, yaws, size, crop=crop)).save(out)
