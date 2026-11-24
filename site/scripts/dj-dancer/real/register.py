"""A new outfit's design sheet lined up with the first dancer's photos (front.png, back.png, 1024 px, as
bake.py's): the figure's top, bottom and middle found against the plain background, scaled and moved onto
the first one's. usage: register.py <new sheet.png> <club photos dir> <out dir>"""
import sys, os, numpy as np
from PIL import Image

sheet, club, out = sys.argv[1:4]
os.makedirs(out, exist_ok=True)

def figure(a):
    """The figure against the background: the border rows' colour per row, a pixel far from it."""
    bg = np.median(np.concatenate([a[:, :12], a[:, -12:]], 1), 1, keepdims=True)
    m = np.abs(a - bg).sum(2) > 0.12
    ys, xs = np.nonzero(m)
    # (the figure's own rows: long enough runs, not specks)
    rows = np.bincount(ys, minlength=a.shape[0]) > 3
    top = int(np.argmax(rows)); bottom = int(len(rows) - 1 - np.argmax(rows[::-1]))
    mid = float(np.median(xs[(ys > top + (bottom - top) * 0.15) & (ys < top + (bottom - top) * 0.55)]))
    return top, bottom, mid, bg

s = np.asarray(Image.open(sheet).convert('RGB'), np.float32) / 255
H, W = s.shape[:2]
for i, view in enumerate(['front', 'back']):
    half = s[:, i * W // 2:(i + 1) * W // 2]
    c = np.asarray(Image.open(f'{club}/{view}.png').convert('RGB'), np.float32) / 255
    t1, b1, m1, _ = figure(half)
    t0, b0, m0, bg0 = figure(c)
    k = (b0 - t0) / (b1 - t1)
    img = Image.fromarray((half * 255).astype(np.uint8))
    # x' = (x - m1) k + m0, y' = (y - t1) k + t0, as PIL's inverse affine
    a = 1 / k
    warped = img.transform((1024, 1024), Image.AFFINE, (a, 0, m1 - m0 * a, 0, a, t1 - t0 * a), Image.BICUBIC, fillcolor=tuple(int(v * 255) for v in bg0[512, 0]))
    warped.save(f'{out}/{view}.png')
    print(view, 'scale', round(k, 4), 'top', t1, '->', t0, 'bottom', b1, '->', b0, 'middle', round(m1, 1), '->', round(m0, 1))
