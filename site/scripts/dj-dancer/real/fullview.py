"""Full-length views of a model (ms dir + texture): front, three-quarter, side, back. fullview.py <ms> <tex> <out> [H px]"""
import sys, numpy as np
from PIL import Image
sys.path.insert(0, __import__('os').path.dirname(__file__))
from rast import raster, interp, sample
ms, tex, out = sys.argv[1:4]; Hpx = int(sys.argv[4]) if len(sys.argv) > 4 else 700
P = np.fromfile(ms + '/pos.f32', np.float32).reshape(-1, 3)
UV = np.fromfile(ms + '/uv.f32', np.float32).reshape(-1, 2)
T = np.fromfile(ms + '/idx.u32', np.uint32).reshape(-1, 3).astype(np.int64)
img = np.asarray(Image.open(tex).convert('RGB'), np.float32) / 255
th = img.shape[0] / img.shape[1]
y0, y1 = P[:, 1].min(), P[:, 1].max(); k = Hpx / (y1 - y0) * 0.96; Wpx = int(Hpx * 0.5)
views = []
for ang in (0, 35, 90, 180):
    a = np.radians(ang); c, s = np.cos(a), np.sin(a)
    x = P[:, 0] * c + P[:, 2] * s; z = -P[:, 0] * s + P[:, 2] * c
    px = x * k + Wpx / 2; py = (y1 - P[:, 1]) * k + Hpx * 0.02
    _, tid, b1, b2 = raster(px, py, z, T, Wpx, Hpx)
    m = tid >= 0
    uv = interp(UV, T, tid, b1, b2)[m]
    col = np.full((Hpx, Wpx, 3), 0.12, np.float32)
    col[m] = sample(img, uv[:, 0], uv[:, 1])
    views.append((np.clip(col, 0, 1) * 255).astype(np.uint8))
Image.fromarray(np.hstack(views)).save(out); print('ok')
