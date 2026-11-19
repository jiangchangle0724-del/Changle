"""Another outfit's joints, from her first model's (the same design: the same face, body and pose,
drawn in the same place on the sheet, only the clothes changed): the upper body, the arms and the
hips taken as they were there; the knees and feet the new model's own (found by joints.py below a
skirt, where its outline is the legs: flat shoes put them lower than her boots did). A skirt or a
dress hides the hips and the crotch from joints.py's outlines, so they can't be found from this
model alone. Writes joints.json over the one joints.py wrote, and joints_from.png to check by.
usage: python3 joints_from.py <m dir of the new outfit> <joints.json of the first model>"""
import json, sys
import numpy as np
from PIL import Image, ImageDraw
from rast import load, raster

d, ref = sys.argv[1], sys.argv[2]
own = json.load(open(d + '/joints.json'))
first = json.load(open(ref))['joints']
KEEP = [s + n for s in ('Left', 'Right') for n in ('Leg', 'Foot', 'ToeBase')]
J = {k: (own['joints'][k] if k in KEEP else first[k]) for k in first}
own['joints'] = J
own['from'] = 'upper body, arms, hips: ' + ref
json.dump(own, open(d + '/joints.json', 'w'), indent=1)

# a picture: her outline from the front and from the side, the bones over it
P, N, UV, T = load(d)
R = 0.002
img = Image.new('RGB', (1000, 900), (0, 0, 0))
dr = ImageDraw.Draw(img)
PAR = {'Spine': 'Hips', 'Spine1': 'Spine', 'Spine2': 'Spine1', 'Neck': 'Spine2', 'Head': 'Neck'}
for s in ('Left', 'Right'):
    PAR.update({s + 'Shoulder': 'Spine2', s + 'Arm': s + 'Shoulder', s + 'ForeArm': s + 'Arm', s + 'Hand': s + 'ForeArm', s + 'HandMiddle1': s + 'Hand',
                s + 'UpLeg': 'Hips', s + 'Leg': s + 'UpLeg', s + 'Foot': s + 'Leg', s + 'ToeBase': s + 'Foot'})
for k, (ax, ox) in enumerate(((0, 250), (2, 750))):
    px = ox + P[:, ax] / R
    py = (1.78 - P[:, 1]) / R
    _, tid, _, _ = raster(px, py, P[:, 2 - ax], T, 1000, 900)
    m = (tid >= 0).astype(np.uint8) * 90
    img.paste(Image.fromarray(np.stack([m, m, m], -1)), mask=Image.fromarray(m))
    for c, p in PAR.items():
        a, b = J[c], J[p]
        dr.line([(ox + a[ax] / R, (1.78 - a[1]) / R), (ox + b[ax] / R, (1.78 - b[1]) / R)], fill=(255, 200, 0), width=2)
    for v in J.values():
        x, y = ox + v[ax] / R, (1.78 - v[1]) / R
        dr.ellipse([x - 3, y - 3, x + 3, y + 3], fill=(255, 60, 60))
img.save(d + '/joints_from.png')
print('joints:', len(J), 'own:', ', '.join(KEEP))
