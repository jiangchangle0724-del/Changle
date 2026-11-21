"""Her expressions (Nov 21; Steve: "表情可以做但要很细致"): two small changes of her own face, as morph targets
the page weighs while she dances: `smile` (the corners of her mouth up and a little back, her cheeks and
lower lids up after them) and `brows` (her brows up). A few millimetres at most, falling off smoothly round
each point, so it's still her face, only moving. Where: her face's landmarks (Google's MediaPipe face
landmarker, Apache 2.0) found in a straight-on picture of her head (her own texture, no light added),
each put back on her mesh at the front of her face there.

usage: python3 expressions.py <club ms dir> <club texture.png> <face_landmarker.task> <out dir>
writes smile.f32 and brows.f32 (her base mesh's vertices, metres each) and face.jpg (neutral | smile+brows)
"""
import os, sys
import numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(__file__))
from rast import raster, interp

ms, texf, model, out = sys.argv[1:5]
os.makedirs(out, exist_ok=True)
P = np.fromfile(ms + '/pos.f32', np.float32).reshape(-1, 3).astype(float)
UV = np.fromfile(ms + '/uv.f32', np.float32).reshape(-1, 2).astype(float)
T = np.fromfile(ms + '/idx.u32', np.uint32).reshape(-1, 3)
Ns = np.fromfile(ms + '/nrm_s.f32', np.float32).reshape(-1, 3)
tex = np.asarray(Image.open(texf).convert('RGB'), np.float32) / 255
top = P[:, 1].max()

def shot(Q, x0=-0.12, y1=None, S=4000, W=960, H=1100):
    """Her head straight on, orthographic: picture, depth (z, larger nearer), the picture's mapping."""
    y1 = top + 0.01 if y1 is None else y1
    z, tid, b1, b2 = raster((Q[:, 0] - x0) * S, (y1 - Q[:, 1]) * S, Q[:, 2], T, W, H)
    ok = tid >= 0
    uv = interp(UV, T, tid, b1, b2)
    img = np.zeros((H, W, 3))
    th, tw = tex.shape[:2]
    img[ok] = tex[np.clip((uv[ok][:, 1] * th).astype(int), 0, th - 1), np.clip((uv[ok][:, 0] * tw).astype(int), 0, tw - 1)]
    return img, z, ok, (x0, y1, S)

img, zb, ok, (x0, y1, S) = shot(P)
import mediapipe as mp
from mediapipe.tasks.python import vision, BaseOptions
det = vision.FaceLandmarker.create_from_options(vision.FaceLandmarkerOptions(base_options=BaseOptions(model_asset_path=model), num_faces=1))
pic = mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray((img * 255).astype(np.uint8)))
res = det.detect(pic)
if not res.face_landmarks: sys.exit('no face found in her picture')
L = res.face_landmarks[0]
H, W = img.shape[:2]
def at(i):
    px, py = L[i].x * W, L[i].y * H
    r, c = int(round(py)), int(round(px))
    win = zb[max(0, r - 3):r + 4, max(0, c - 3):c + 4]
    return np.array([x0 + px / S, y1 - py / S, np.nanmax(np.where(np.isfinite(win), win, np.nan))])

face = (P[:, 1] > top - 0.30) & (P[:, 2] > 0.0) & (Ns[:, 2] > 0.15)
def bump(c, sigma, d):
    w = np.exp(-((P - c) ** 2).sum(1) / (2 * sigma ** 2)) * face
    return w[:, None] * np.array(d)[None]

mouth = (at(61) + at(291)) / 2
smile = np.zeros_like(P)
for corner in (at(61), at(291)):
    out_x = np.sign(corner[0] - mouth[0])
    smile += bump(corner, 0.0075, [0.0009 * out_x, 0.0028, -0.0009])
for cheek in (at(205), at(425)):
    smile += bump(cheek, 0.013, [0, 0.0013, 0.0006])
for lid in (at(145), at(374)):
    smile += bump(lid, 0.0045, [0, 0.0006, 0])
brows = np.zeros_like(P)
for i in (105, 334, 70, 300, 107, 336):
    brows += bump(at(i), 0.009, [0, 0.0012, 0.0002])
for D in (smile, brows):
    n = np.linalg.norm(D, axis=1, keepdims=True)
    D *= np.minimum(1, 0.003 / np.maximum(n, 1e-9))
smile.astype(np.float32).tofile(out + '/smile.f32')
brows.astype(np.float32).tofile(out + '/brows.f32')
print('smile up to', round(float(np.linalg.norm(smile, axis=1).max() * 1000), 2), 'mm on', int((np.linalg.norm(smile, axis=1) > 1e-4).sum()),
      'vertices; brows up to', round(float(np.linalg.norm(brows, axis=1).max() * 1000), 2), 'mm')
a, _, _, _ = shot(P); b, _, _, _ = shot(P + smile + brows)
both = np.concatenate([a[250:900, 260:700], b[250:900, 260:700]], 1)
Image.fromarray((np.clip(both, 0, 1) * 255).astype(np.uint8)).save(out + '/face.jpg', quality=90)
