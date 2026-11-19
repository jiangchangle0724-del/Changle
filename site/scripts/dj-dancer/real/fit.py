"""Each design photo lined up with the model (in TRELLIS's units): a camera fitted so the model's
silhouette covers the photo's cut-out (cams.py), then a smooth warp for what's left (warp.py), the
outline's displacement carried inside. Writes <work>/cams.json and <work>/warp_<view>.npy (1024 px).

usage: python3 fit.py <work dir>"""
import sys, json
import numpy as np, cv2
from PIL import Image
from rast import load, raster
from cams import fit, project
from warp import warp_field

work = sys.argv[1]
P, N, UV, T = load(work + '/trellis')
res = {}
for view, back in (('front', False), ('back', True)):
    a = np.asarray(Image.open(f'{work}/{view}_cut.png'))[..., 3]
    m = np.asarray(Image.fromarray(a).resize((512, 512), Image.BILINEAR)) > 127
    prm, iou = fit(P, T, m, back=back, persp=False)
    prm2, iou2 = fit(P, T, m, back=back, persp=True)
    best = (prm2 if iou2 > iou + 0.002 else prm).copy()
    print(view, 'silhouettes overlap %.3f' % max(iou, iou2))
    # the warp, at 512 then doubled
    px, py, pz = project(P, best, back)
    _, tv, _, _ = raster(px, py, pz, T, 512, 512)
    d = warp_field(tv >= 0, m)
    np.save(f'{work}/warp_{view}.npy', cv2.resize(d, (1024, 1024)) * 2)
    best[:3] *= 2  # to 1024 px
    res[view] = best.tolist()
json.dump(res, open(work + '/cams.json', 'w'))
