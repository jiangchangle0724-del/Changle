"""Her face (Nov 21; Steve: "面部跟之前那个模特保持一致就好，只需要换不同的衣服", "面部看起来有点扭曲").
Works on a built model (a mesh dir and its texture), seen straight from the front: her head, found by
the face's 478 points (MediaPipe's face landmarker, Apache 2.0, run here only).

  mask: how much each of her vertices is her face (inside its outline seen from the front, on her front;
        smoothed over her, so no triangle stands out), written as face_w.f32 next to her texture
        (build_glb.mjs puts it on her as `_FACE`): the page lights her face the way its photo was lit
        (its shadows the photo's, not the model's bumps, which drew it out of shape under the stage's
        lights).
  swap: her face (Steve's pick on Nov 21: the face in his third reference photo; one face in every
        outfit) put on this one: the photo's face (or another model's, seen from the front) laid over
        this one's, its features where the photo has them (her face's own proportions, scaled and turned
        to fit), its outline on this one's (so it meets her hair and jaw), blended in (OpenCV's seamless
        clone: the skin round it carries on); written back into this texture, with her eyes' marks
        (the blink, as eyes.py makes them) and the lid's colour (lid.json); then face_w.f32.

usage: python3 facekit.py mask <mesh dir> <texture.png> <face_landmarker.task>
       python3 facekit.py swap <mesh dir> <texture.png> <face photo | donor mesh dir> <face_landmarker.task> <out texture.png> [donor texture.png]
"""
import json, os, shutil, sys
import numpy as np
import cv2
from PIL import Image, ImageDraw
from scipy import ndimage
from scipy.interpolate import RBFInterpolator
from rast import raster, interp, sample
import mediapipe as mp
from mediapipe.tasks import python as mpp
from mediapipe.tasks.python import vision

OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148,
        176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109]
S = 2048          # her texture's size
VIEW_M = 0.30     # the front view: this many metres square round her head
VIEW_PX = 1024


def load(ms):
    P = np.fromfile(ms + '/pos.f32', np.float32).reshape(-1, 3).astype(np.float64)
    N = np.fromfile(ms + '/nrm_s.f32', np.float32).reshape(-1, 3).astype(np.float64)
    UV = np.fromfile(ms + '/uv.f32', np.float32).reshape(-1, 2).astype(np.float64)
    T = np.fromfile(ms + '/idx.u32', np.uint32).reshape(-1, 3).astype(np.int64)
    return P, N, UV, T


class Front:
    """A model seen from the front (orthographic), its head filling the view."""

    def __init__(self, ms, tex):
        self.P, self.N, self.UV, self.T = load(ms)
        P = self.P
        top = P[:, 1].max()
        head = P[:, 1] > top - 0.25
        self.x0 = float(np.median(P[head, 0])) - VIEW_M / 2
        self.y0 = top + 0.01
        self.k = VIEW_PX / VIEW_M
        sx, sy = self.screen(P)
        self.zbuf, tid, b1, b2 = raster(sx, sy, P[:, 2], self.T, VIEW_PX, VIEW_PX)
        uv = interp(self.UV, self.T, tid, b1, b2)
        self.tex = np.asarray(Image.open(tex).convert('RGBA'), np.float32) / 255
        img = sample(self.tex, uv[..., 0], uv[..., 1])
        img[tid < 0] = 0
        self.img = img  # RGBA, 0..1
        # her texels: where each is on her, which way it faces, where it is in the view, seen or not
        _, ttid, tb1, tb2 = raster(self.UV[:, 0] * S, self.UV[:, 1] * S, np.zeros(len(self.UV)), self.T, S, S)
        self.valid = ttid >= 0
        X = interp(self.P, self.T, ttid, tb1, tb2)[self.valid]
        Nn = interp(self.N, self.T, ttid, tb1, tb2)[self.valid]
        Nn /= np.linalg.norm(Nn, axis=1, keepdims=True) + 1e-9
        self.tx, self.ty = self.screen(X)
        xi = np.clip(self.tx, 0, VIEW_PX - 1.001).astype(int)
        yi = np.clip(self.ty, 0, VIEW_PX - 1.001).astype(int)
        inside = (self.tx >= 0) & (self.tx < VIEW_PX) & (self.ty >= 0) & (self.ty < VIEW_PX)
        self.seen = inside & (X[:, 2] >= self.zbuf[yi, xi] - 0.004)
        self.facing = np.clip((Nn[:, 2] - 0.2) / 0.3, 0, 1)

    def screen(self, X):
        return (X[:, 0] - self.x0) * self.k, (self.y0 - X[:, 1]) * self.k

    def points(self, lm):
        c = (np.clip(self.img[..., :3], 0, 1) * 255).astype(np.uint8)
        r = lm.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(c)))
        if not r.face_landmarks:
            sys.exit('no face found from the front')
        return np.array([[p.x, p.y] for p in r.face_landmarks[0]]) * VIEW_PX

    def at(self, view):
        """A view-sized image's values at her texels (bilinear)."""
        return sample(view, (self.tx + 0.5) / VIEW_PX, (self.ty + 0.5) / VIEW_PX)


def landmarker(task):
    return vision.FaceLandmarker.create_from_options(vision.FaceLandmarkerOptions(
        base_options=mpp.BaseOptions(model_asset_path=task), num_faces=1,
        min_face_detection_confidence=0.05, min_face_presence_confidence=0.05))


def oval(L, grow=0.0):
    """Her face's outline (its points' oval, grown or shrunk by a share of its size), filled, in the view."""
    pts = L[OVAL] if len(L) > len(OVAL) else L
    c = pts.mean(0)
    pts = c + (pts - c) * (1 + grow)
    m = Image.new('L', (VIEW_PX, VIEW_PX), 0)
    ImageDraw.Draw(m).polygon([tuple(p) for p in pts], fill=255)
    return np.asarray(m) > 0


def soft(inside, px):
    """1 well inside, falling to 0 at the edge over `px` view pixels."""
    d = ndimage.distance_transform_edt(inside)
    t = np.clip(d / px, 0, 1)
    return t * t * (3 - 2 * t)


INNER = [i for i in range(468) if i not in OVAL]
EYES = ([33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246],
        [362, 382, 381, 380, 374, 373, 390, 249, 263, 466, 388, 387, 386, 385, 384, 398])


class Photo:
    """A photo of her face: its pixels (RGBA) and the face's points in it."""

    def __init__(self, path, lm):
        rgb = np.asarray(Image.open(path).convert('RGB'))
        r = lm.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(rgb)))
        if not r.face_landmarks:
            sys.exit('no face found in ' + path)
        self.L = np.array([[p.x, p.y] for p in r.face_landmarks[0]]) * [rgb.shape[1], rgb.shape[0]]
        self.img = np.dstack([rgb.astype(np.float32) / 255, np.ones(rgb.shape[:2], np.float32)])


def similarity(src, dst):
    """The turn, scale and shift (no stretch) taking points `src` nearest onto `dst`."""
    ms, md = src.mean(0), dst.mean(0)
    a, b = src - ms, dst - md
    u, sig, vt = np.linalg.svd(a.T @ b)
    R = (u @ vt).T
    if np.linalg.det(R) < 0:
        vt[-1] *= -1
        R = (u @ vt).T
    k = sig.sum() / (a ** 2).sum()
    return lambda p: (p - ms) @ (k * R).T + md


def write_mask(f, L, tex_path):
    # (a little past the outline: the face's edge lit like the rest of it, fading into the model's light;
    # her front within 4 cm of what's seen there: the undersides of her nose and chin too, not the back
    # of her head)
    m = soft(oval(L, 0.06), 14)
    sx, sy = f.screen(f.P)
    xi = np.clip(sx, 0, VIEW_PX - 1.001).astype(int)
    yi = np.clip(sy, 0, VIEW_PX - 1.001).astype(int)
    front = f.P[:, 2] >= f.zbuf[yi, xi] - 0.04
    v = sample(m[..., None].astype(np.float32), (sx + 0.5) / VIEW_PX, (sy + 0.5) / VIEW_PX)[:, 0] * front
    # smoothed over her (each vertex with its neighbours, a few times)
    n = len(f.P)
    e = np.r_[f.T[:, [0, 1]], f.T[:, [1, 2]], f.T[:, [2, 0]]]
    A = np.zeros(n); B = np.zeros(n)
    for _ in range(4):
        A[:] = 0; B[:] = 0
        np.add.at(A, e[:, 0], v[e[:, 1]]); np.add.at(B, e[:, 0], 1)
        np.add.at(A, e[:, 1], v[e[:, 0]]); np.add.at(B, e[:, 1], 1)
        v = 0.5 * v + 0.5 * A / np.maximum(B, 1)
    out = os.path.join(os.path.dirname(tex_path), 'face_w.f32')
    v.astype(np.float32).tofile(out)
    print('face weights', out, int((v > 0.5).sum()), 'vertices of', n)


def gutters(img, valid):
    _, (iy, ix) = ndimage.distance_transform_edt(~valid, return_indices=True)
    img[~valid] = img[iy[~valid], ix[~valid]]
    return img


mode = sys.argv[1]
if mode == 'mask':
    ms, tex, task = sys.argv[2:5]
    f = Front(ms, tex)
    write_mask(f, f.points(landmarker(task)), tex)
elif mode == 'swap':
    ms, tex, donor_path, task, out = sys.argv[2:7]
    lm = landmarker(task)
    f = Front(ms, tex)
    Lf = f.points(lm)
    if os.path.isdir(donor_path):
        d = Front(donor_path, sys.argv[7])
        Ld, dimg = d.points(lm), d.img
    else:
        d = Photo(donor_path, lm)
        Ld, dimg = d.L, d.img
    # her face as it is (its proportions kept: only turned, scaled and moved onto this face by its eyes,
    # nose and mouth), put in where it's surely her face (inside her own outline there, and this one's)
    anchor = [33, 133, 362, 263, 1, 2, 13, 14, 61, 291, 152, 10]
    place = similarity(Ld[anchor], Lf[anchor])
    back = similarity(Lf[anchor], Ld[anchor])
    tgt = place(Ld)
    gy, gx = np.mgrid[0:VIEW_PX, 0:VIEW_PX]
    src = back(np.c_[gx.ravel(), gy.ravel()].astype(float)).reshape(VIEW_PX, VIEW_PX, 2).astype(np.float32)
    donor = cv2.remap((dimg * 255).astype(np.float32), src[..., 0], src[..., 1], cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=0)
    mine = (np.clip(f.img[..., :3], 0, 1) * 255).astype(np.uint8)
    inner = oval(tgt[OVAL], -0.08) & oval(Lf, -0.02)
    hole = (inner * 255).astype(np.uint8)
    yy, xx = np.nonzero(inner)
    centre = (int((xx.min() + xx.max() + 1) // 2), int((yy.min() + yy.max() + 1) // 2))
    blend = cv2.seamlessClone(np.clip(donor[..., :3], 0, 255).astype(np.uint8)[..., ::-1].copy(), mine[..., ::-1].copy(), hole, centre, cv2.NORMAL_CLONE)[..., ::-1]
    # her eyes' marks (eyes.py's: 0 at an eye's top edge to 0.8 at its bottom, 1 elsewhere), where her
    # eyes now are; the lid's colour, her skin just above and below them
    eye_a = np.ones((VIEW_PX, VIEW_PX), np.float32)
    around = np.zeros((VIEW_PX, VIEW_PX), bool)
    for e in EYES:
        lo, hi = tgt[e].min(0), tgt[e].max(0)
        (cx, cy), (rx, ry) = (lo + hi) / 2, (hi - lo) / 2 + [2, 2]
        inside = ((gx - cx) / rx) ** 2 + ((gy - cy) / ry) ** 2 < 1
        eye_a[inside] = np.minimum(eye_a[inside], 0.8 * np.clip((gy[inside] - (cy - ry)) / (2 * ry), 0, 1))
        near = np.abs(gx - cx) < rx * 0.6
        around |= near & (((gy > cy - ry - 14) & (gy < cy - ry - 4)) | ((gy > cy + ry + 6) & (gy < cy + ry + 16)))
    lid = blend[around].astype(float).mean(0) / 255
    # back into her texture: her face's texels (seen from the front, facing it) the blend's, fading out
    # at its edge
    w = (f.at(soft(inner, 10)[..., None])[:, 0] * f.seen * f.facing)[:, None]
    tex_now = f.tex.copy()
    rgb = tex_now[f.valid][:, :3] * (1 - w) + f.at(blend.astype(np.float32) / 255) * w
    a = tex_now[f.valid][:, 3]
    face_here = f.at(oval(Lf, 0.25)[..., None].astype(np.float32))[:, 0] * f.seen > 0.5
    a = np.where(face_here, 1.0, a)
    seen_eye = f.at(eye_a[..., None])[:, 0]
    a = np.where(face_here & (f.facing > 0.3), np.minimum(a, seen_eye), a)
    tex_now[f.valid] = np.c_[rgb, a]
    tex_now = gutters(tex_now, f.valid)
    Image.fromarray((np.clip(tex_now, 0, 1) * 255).round().astype(np.uint8), 'RGBA').save(out)
    json.dump({'lid': [round(float(v), 3) for v in lid]}, open(os.path.join(os.path.dirname(out), 'lid.json'), 'w'))
    f2 = Front(ms, out)
    after = (np.clip(f2.img[..., :3], 0, 1) * 255).astype(np.uint8)
    show = np.clip(donor[..., :3], 0, 255).astype(np.uint8) * inner[..., None]
    sheet = np.hstack([mine, show, after])
    Image.fromarray(sheet).resize((sheet.shape[1] // 2, sheet.shape[0] // 2)).save(os.path.join(os.path.dirname(out), 'face_swap.png'))
    print('face swapped in:', int((w > 0.5).sum()), 'texels; eye marks', int((a < 0.99).sum()), 'lid', np.round(lid, 3))
    write_mask(f2, Lf, out)
else:
    sys.exit(__doc__)
