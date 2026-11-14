"""Paints the Ready Player Me logo off the stand-in's shirt: python3 clean_texture.py in.png out.png

The two logos (a small one on the chest, a big one on the back) sit in known boxes of the 1024 px
texture; their bright pixels are filled in from the navy around them (OpenCV's inpainting).
Needs: pip install opencv-python-headless pillow numpy"""
import sys

import cv2
import numpy as np
from PIL import Image

src, out = sys.argv[1], sys.argv[2]
im = np.array(Image.open(src).convert("RGB"))
assert im.shape[:2] == (1024, 1024), f"expected the 1024 px texture, got {im.shape}"
mask = np.zeros(im.shape[:2], np.uint8)
for (x0, y0, x1, y1) in [(140, 690, 250, 750), (320, 695, 470, 785)]:
    region = im[y0:y1, x0:x1]
    mask[y0:y1, x0:x1][region.max(axis=2) > 70] = 255
mask = cv2.dilate(mask, np.ones((5, 5), np.uint8))
clean = cv2.inpaint(im[:, :, ::-1], mask, 5, cv2.INPAINT_TELEA)[:, :, ::-1]
Image.fromarray(clean).save(out)
print(out, int((mask > 0).sum()), "pixels painted")
