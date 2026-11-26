"""Her skirt's hem without a pale rim (Nov 21: a dark skirt showed a white line round its hem). skirt.py takes
the skirt's colours from the design's photos down to its hem, and there the photo's last rows are part
background or legs, so the strip's last rows (its hem) came out paler than the skirt. Here, in each column
of the skirt's strip whose last rows are paler than the skirt above them, those rows are the skirt above them
again, mirrored (its folds go on).
usage: python3 hemfix.py <texture.png>   (in place; the skirt's strip: rows 2048-2559 under her own texture)"""
import sys
import numpy as np
from PIL import Image
f = sys.argv[1]
im = Image.open(f); mode = im.mode
t = np.asarray(im.convert('RGBA'), np.float32).copy()
S0, A, B = 2048, 440, 512           # the strip's top, where the skirt is sure, its end
s = t[S0:S0 + B]
lum = s[..., :3].mean(2)
ref = lum[A - 30:A].mean(0)
low = lum[B - 24:B].mean(0)
bad = low - ref > 25                # (0-255: paler than the skirt; a darker hem, lace or a shadow, is the design's)
k = 0
for r in range(A, B):
    m = 2 * A - r                   # mirrored row above
    s[r, bad, :3] = s[m, bad, :3]
t[S0:S0 + B] = s
Image.fromarray(np.clip(t, 0, 255).astype(np.uint8), 'RGBA').convert(mode).save(f)
print(f, 'hem mended in', int(bad.sum()), 'of', len(bad), 'columns')
