"""Her face where the model has it (Nov 20). TRELLIS made the outfits' faces a little lower than the
front design photo has them (the eyes 8 px, the chin 6 px, in the photo's 1024), so the photo's eyes
went onto her brow, and the model's own eyes under them showed through where the photo saw little: a
second pair of eyes, a grey patch under her nose. This finds the face's 478 points (MediaPipe's face
landmarker, Apache 2.0, run here only) on the photo and on the model's own colours seen by the same
camera, and moves the front warp inside her face (warp_front.npy; the one fit.py made kept as
warp_front_body.npy, and always started from) so each point of the photo lands on the model's. bake.py,
fill.py and eyes.py then put the photo's face on the model's. Writes face.json too (the photo's eyes,
for eyes.py) and face_warp.png (the two faces with their points).
usage: python3 facewarp.py <work dir> <photos dir> <face_landmarker.task>
(the model: storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task)"""
import json, os, sys
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage
from scipy.interpolate import RBFInterpolator
from rast import load, raster, interp, sample
from cams import project
import mediapipe as mp
from mediapipe.tasks import python as mpp
from mediapipe.tasks.python import vision

work, photos, task = sys.argv[1:4]
W = H = 1024
P, N, UV, T = load(work + '/trellis')
prm = np.array(json.load(open(work + '/cams.json'))['front'])
px, py, pz = project(P, prm, False)
_, tid, b1, b2 = raster(px, py, pz, T, W, H)
uv = interp(UV, T, tid, b1, b2)
base = np.asarray(Image.open(work + '/trellis/base.webp').convert('RGB'), np.float32) / 255
own = sample(base, uv[..., 0], uv[..., 1]); own[tid < 0] = 0
own = Image.fromarray((np.clip(own, 0, 1) * 255).astype(np.uint8))
photo = Image.open(photos + '/front.png').convert('RGB')

# her head: the top of her figure, a square a fifth of her height
rows = np.nonzero((tid >= 0).any(1))[0]
y0, y1 = rows[0], rows[-1]
side = int(0.2 * (y1 - y0))
cx = int(np.nonzero((tid[y0:y0 + side // 4] >= 0).any(0))[0].mean())
box = (cx - side // 2, max(0, y0 - side // 20), cx + side // 2, max(0, y0 - side // 20) + side)
K = 4
lm = vision.FaceLandmarker.create_from_options(vision.FaceLandmarkerOptions(
    base_options=mpp.BaseOptions(model_asset_path=task), num_faces=1,
    min_face_detection_confidence=0.05, min_face_presence_confidence=0.05))

def points(im):
    c = im.crop(box).resize((side * K, side * K), Image.LANCZOS)
    r = lm.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(np.asarray(c))))
    if not r.face_landmarks: sys.exit('no face found in ' + ('the photo' if im is photo else 'the model'))
    return c, np.array([[p.x, p.y] for p in r.face_landmarks[0]]) * side + [box[0], box[1]]

co, Lo = points(own)
cp, Lp = points(photo)
body = work + '/warp_front_body.npy'
if not os.path.exists(body):
    os.rename(work + '/warp_front.npy', body)
flow = np.load(body)
# what each point needs on top of the body's warp: the model's point to look up the photo's
need = (Lp - Lo) - sample(flow, (Lo[:, 0] + 0.5) / W, (Lo[:, 1] + 0.5) / H)
if np.abs(need).max() > 25: sys.exit('the faces are too far apart (%.0f px): check face_warp.png' % np.abs(need).max())
# inside her face (the model's outline) all of it, out to nothing a quarter of her face's height outside
OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148,
        176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109]
m = Image.new('L', (W, H), 0)
ImageDraw.Draw(m).polygon([tuple(p) for p in Lo[OVAL]], fill=255)
inside = np.asarray(m) > 0
fall = 0.25 * (Lo[OVAL, 1].max() - Lo[OVAL, 1].min())
t = np.clip(1 - ndimage.distance_transform_edt(~inside) / fall, 0, 1)
k = t * t * (3 - 2 * t)
ys, xs = np.nonzero(k > 0)
f = RBFInterpolator(Lo, need, kernel='thin_plate_spline', smoothing=1.0)(np.c_[xs, ys].astype(float))
out = flow.copy()
out[ys, xs] += k[ys, xs, None] * f
np.save(work + '/warp_front.npy', out.astype(np.float32))

# the photo's eyes (their outlines' boxes), for eyes.py
EYES = ([33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246],
        [362, 382, 381, 380, 374, 373, 390, 249, 263, 466, 388, 387, 386, 385, 384, 398])
eyes = []
for e in EYES:
    lo, hi = Lp[e].min(0), Lp[e].max(0)
    eyes.append([round(float(v), 1) for v in ((lo + hi) / 2).tolist() + ((hi - lo) / 2 + 1).tolist()])
json.dump({'eyes': eyes}, open(work + '/face.json', 'w'))

sheet = Image.new('RGB', (side * K * 2 + 10, side * K))
for i, (c, L) in enumerate(((co, Lo), (cp, Lp))):
    d = ImageDraw.Draw(c)
    for x, y in (L - [box[0], box[1]]) * K: d.ellipse((x - 2, y - 2, x + 2, y + 2), fill=(0, 255, 0))
    sheet.paste(c, (i * (side * K + 10), 0))
sheet.resize((sheet.size[0] // 2, sheet.size[1] // 2)).save(work + '/face_warp.png')
print('face moved: median', np.round(np.median(need, 0), 1), 'most', round(float(np.abs(need).max()), 1), 'px; eyes', eyes)
