"""Small CPU rasterizer (numba) for the dancer pipeline: depth/id buffers in screen or UV space."""
import numpy as np
from numba import njit, prange

@njit(cache=True)
def raster(px, py, pz, tri, W, H):
    """Triangles (pixel coords px,py; depth pz, larger = nearer) into an id buffer + barycentrics.
    Returns zbuf (H,W) float32 (-inf empty), tid (H,W) int32 (-1 empty), b1,b2 (H,W) float32."""
    zbuf = np.full((H, W), -np.inf, np.float32)
    tid = np.full((H, W), -1, np.int32)
    b1 = np.zeros((H, W), np.float32)
    b2 = np.zeros((H, W), np.float32)
    for t in range(tri.shape[0]):
        a, b, c = tri[t, 0], tri[t, 1], tri[t, 2]
        x0, y0, x1, y1, x2, y2 = px[a], py[a], px[b], py[b], px[c], py[c]
        minx = max(int(np.floor(min(x0, min(x1, x2)))), 0)
        maxx = min(int(np.ceil(max(x0, max(x1, x2)))), W - 1)
        miny = max(int(np.floor(min(y0, min(y1, y2)))), 0)
        maxy = min(int(np.ceil(max(y0, max(y1, y2)))), H - 1)
        if minx > maxx or miny > maxy:
            continue
        den = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2)
        if abs(den) < 1e-12:
            continue
        for yy in range(miny, maxy + 1):
            cy = yy + 0.5
            for xx in range(minx, maxx + 1):
                cx = xx + 0.5
                l0 = ((y1 - y2) * (cx - x2) + (x2 - x1) * (cy - y2)) / den
                l1 = ((y2 - y0) * (cx - x2) + (x0 - x2) * (cy - y2)) / den
                l2 = 1.0 - l0 - l1
                if l0 < -1e-6 or l1 < -1e-6 or l2 < -1e-6:
                    continue
                z = l0 * pz[a] + l1 * pz[b] + l2 * pz[c]
                if z > zbuf[yy, xx]:
                    zbuf[yy, xx] = z
                    tid[yy, xx] = t
                    b1[yy, xx] = l1
                    b2[yy, xx] = l2
    return zbuf, tid, b1, b2

def interp(attr, tri, tid, b1, b2):
    """Per-pixel attribute from the id buffer (empty pixels: 0)."""
    m = tid >= 0
    t = tri[np.where(m, tid, 0)]
    b0 = 1 - b1 - b2
    out = attr[t[..., 0]] * b0[..., None] + attr[t[..., 1]] * b1[..., None] + attr[t[..., 2]] * b2[..., None]
    out[~m] = 0
    return out

def sample(img, u, v):
    """Bilinear sample of img (H,W,C float) at uv (0..1, v down as glTF)."""
    H, W = img.shape[:2]
    x = np.clip(u * W - 0.5, 0, W - 1.001)
    y = np.clip(v * H - 0.5, 0, H - 1.001)
    x0 = np.floor(x).astype(np.int32); y0 = np.floor(y).astype(np.int32)
    fx = (x - x0)[..., None]; fy = (y - y0)[..., None]
    a = img[y0, x0]; b = img[y0, x0 + 1]; c = img[y0 + 1, x0]; d = img[y0 + 1, x0 + 1]
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy

def load(d):
    P = np.fromfile(d + '/pos.f32', np.float32).reshape(-1, 3).astype(np.float64)
    N = np.fromfile(d + '/nrm.f32', np.float32).reshape(-1, 3).astype(np.float64)
    UV = np.fromfile(d + '/uv.f32', np.float32).reshape(-1, 2).astype(np.float64)
    T = np.fromfile(d + '/idx.u32', np.uint32).reshape(-1, 3).astype(np.int64)
    return P, N, UV, T

def ortho(P, axis_right, axis_up, axis_toward, W, H, center, scale):
    """Orthographic view: pixel coords and depth (larger = nearer the viewer)."""
    R = np.asarray(axis_right, float); U = np.asarray(axis_up, float); F = np.asarray(axis_toward, float)
    q = P - center
    px = W / 2 + (q @ R) * scale
    py = H / 2 - (q @ U) * scale
    pz = q @ F
    return px, py, pz

