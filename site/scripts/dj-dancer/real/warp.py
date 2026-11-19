"""A smooth 2D warp from the model's silhouette (seen through a fitted camera) onto the photo's
cut-out: the outline's displacement (each model edge pixel to the nearest photo edge pixel, smoothed
along the edge), carried inside by solving Laplace's equation; outside it, the nearest value."""
import numpy as np, cv2
from scipy import ndimage, sparse
from scipy.sparse.linalg import spsolve

def edge(m):
    return m & ~ndimage.binary_erosion(m)

def warp_field(M, F, sigma=3.0):
    """M: model silhouette, F: photo cut-out (bool, same size). Returns d (H,W,2): photo = p + d."""
    H, W = M.shape
    bM = edge(M); bF = edge(F)
    # nearest photo edge pixel for every pixel
    _, (iy, ix) = ndimage.distance_transform_edt(~bF, return_indices=True)
    yy, xx = np.nonzero(bM)
    dy = (iy[yy, xx] - yy).astype(np.float64); dx = (ix[yy, xx] - xx).astype(np.float64)
    # smoothed along the edge (normalised blur over the edge pixels only)
    acc = np.zeros((H, W, 2)); wt = np.zeros((H, W))
    acc[yy, xx, 0] = dx; acc[yy, xx, 1] = dy; wt[yy, xx] = 1
    k = int(sigma * 3) * 2 + 1
    accb = cv2.GaussianBlur(acc, (k, k), sigma); wb = cv2.GaussianBlur(wt, (k, k), sigma)
    bd = accb[yy, xx] / wb[yy, xx, None]
    # Laplace inside the model's silhouette, the edge fixed
    inside = M & ~bM
    idx = -np.ones((H, W), np.int64)
    iy2, ix2 = np.nonzero(inside)
    idx[iy2, ix2] = np.arange(len(iy2))
    fixed = np.zeros((H, W, 2)); fixed[yy, xx] = bd
    isfix = np.zeros((H, W), bool); isfix[yy, xx] = True
    rows, cols, vals = [], [], []
    rhs = np.zeros((len(iy2), 2))
    n = len(iy2)
    deg = np.zeros(n)
    for oy, ox in ((0, 1), (0, -1), (1, 0), (-1, 0)):
        ny = np.clip(iy2 + oy, 0, H - 1); nx = np.clip(ix2 + ox, 0, W - 1)
        j = idx[ny, nx]
        inn = j >= 0
        rows.append(np.arange(n)[inn]); cols.append(j[inn]); vals.append(-np.ones(inn.sum()))
        fx = (~inn) & isfix[ny, nx]
        rhs[fx] += fixed[ny[fx], nx[fx]]
        deg += inn | fx
    rows.append(np.arange(n)); cols.append(np.arange(n)); vals.append(np.maximum(deg, 1))
    A = sparse.csr_matrix((np.concatenate(vals), (np.concatenate(rows), np.concatenate(cols))), shape=(n, n))
    d = np.zeros((H, W, 2))
    d[iy2, ix2, 0] = spsolve(A, rhs[:, 0]); d[iy2, ix2, 1] = spsolve(A, rhs[:, 1])
    d[yy, xx] = bd
    # outside: the nearest value inside
    known = M
    _, (jy, jx) = ndimage.distance_transform_edt(~known, return_indices=True)
    d = d[jy, jx]
    return d.astype(np.float32)
