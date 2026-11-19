"""Her joints found from the model's shape (metres, feet on the floor, facing +z, A-pose): legs and arms
from the front silhouette's runs, depths from the surfaces in front and behind, the spine by the
MakeHuman woman's proportions. Writes joints.json (Mixamo names) and a picture to check them by."""
import sys, json
import numpy as np
from PIL import Image, ImageDraw
from rast import raster, load

d = sys.argv[1]
P, N, UV, T = load(d)
R = 0.002  # metres a pixel
X0, X1, Y1 = -0.47, 0.47, 1.78
W = int((X1 - X0) / R); H = int(Y1 / R)
def to_px(x, y): return (x - X0) / R, (Y1 - y) / R
def to_m(px, py): return X0 + (px + 0.5) * R, Y1 - (py + 0.5) * R
px, py = to_px(P[:, 0], P[:, 1])
zf, tf, _, _ = raster(px, py, P[:, 2], T, W, H)      # nearest from the front: largest z
zb, tb, _, _ = raster(px, py, -P[:, 2], T, W, H)     # nearest from behind
zb = -zb
mask = tf >= 0
def runs(row, xmin=-1, xmax=1):
    """filled runs of a silhouette row: (x_left, x_right) in metres"""
    r = mask[row]; out = []; i = 0
    while i < W:
        if r[i]:
            j = i
            while j < W and r[j]: j += 1
            xl, _ = to_m(i, 0); xr, _ = to_m(j - 1, 0)
            if xr >= xmin and xl <= xmax: out.append((xl, xr))
            i = j
        else: i += 1
    return out
def row_of(y): return int(round((Y1 - y) / R - 0.5))
def depth_mid(x, y):
    c, r = to_px(x, y); c, r = int(c), int(r)
    win = (slice(r - 2, r + 3), slice(c - 2, c + 3))
    f, b = zf[win], zb[win]; ok = np.isfinite(f) & np.isfinite(b) & (f > -1e8)
    return float((f[ok].mean() + b[ok].mean()) / 2) if ok.any() else 0.0
def front_z(x, y, half=0.012):
    c, r = to_px(x, y); c, r = int(c), int(r); k = max(1, int(half / R))
    f = zf[r - 1:r + 2, c - k:c + k + 1]; f = f[f > -1e8]
    return float(f.max()) if f.size else 0.0

ytop = P[:, 1].max()
J = {}
# ---- legs: the crotch is where the two leg runs join
crotch = None
for y in np.arange(0.55, 1.1, 0.002):
    rr = [r for r in runs(row_of(y), -0.22, 0.22) if r[1] - r[0] > 0.03]
    if len(rr) < 2: crotch = y; break
yhj = crotch + 0.085
def leg_center(y, side):
    rr = [r for r in runs(row_of(y), -0.22, 0.22) if r[1] - r[0] > 0.03]
    rr = [r for r in rr if (r[0] + r[1]) / 2 * side > 0]
    if not rr: return None
    r = max(rr, key=lambda r: abs((r[0] + r[1]) / 2))
    return (r[0] + r[1]) / 2
for side, nm in ((1, 'Left'), (-1, 'Right')):
    xc = leg_center(crotch - 0.03, side) * 0.93
    J[nm + 'UpLeg'] = [xc, yhj, depth_mid(xc, crotch - 0.03)]
    # the ankle: going down the boot, where its depth starts growing into the foot
    sel = (P[:, 0] * side > 0.02) & (np.abs(P[:, 0]) < 0.25) & (P[:, 1] < 0.6)
    Q = P[sel]
    bands = np.arange(0.02, 0.45, 0.01)
    dep = np.array([np.ptp(Q[(Q[:, 1] >= b) & (Q[:, 1] < b + 0.01), 2]) if ((Q[:, 1] >= b) & (Q[:, 1] < b + 0.01)).sum() > 10 else 0 for b in bands])
    shaft = np.median(dep[(bands > 0.22) & (bands < 0.36)])
    ya = None
    for b, dd in sorted(zip(bands, dep), reverse=True):
        if b < 0.36 and dd > shaft * 1.22: ya = b + 0.025; break
    sl = Q[(Q[:, 1] > ya - 0.01) & (Q[:, 1] < ya + 0.01)]
    xa = float(sl[:, 0].mean()); za = float((sl[:, 2].min() + sl[:, 2].max()) / 2) - 0.01
    J[nm + 'Foot'] = [xa, ya, za]
    # the ball of the foot: the sole's front part
    sole = Q[Q[:, 1] < 0.035]
    front = sole[sole[:, 2] > np.percentile(sole[:, 2], 60)]
    J[nm + 'ToeBase'] = [float(front[:, 0].mean()), 0.03, float(np.percentile(front[:, 2], 40))]
    # the knee: halfway down the leg, in the middle of it
    yk = (yhj + ya) / 2 + 0.01
    xk = leg_center(yk, side)
    J[nm + 'Leg'] = [xk, yk, depth_mid(xk, yk) + 0.005]
    J[nm + 'Shaft'] = float(shaft); J[nm + '_ya'] = ya

# ---- arms: the runs out to each side, apart from the body
arm_rows = {1: [], -1: []}
armpit = {}
for y in np.arange(0.70, 1.5, 0.002):
    rr = runs(row_of(y))
    if len(rr) < 3: continue
    rr.sort()
    for side in (1, -1):
        r = rr[-1] if side == 1 else rr[0]
        cx = (r[0] + r[1]) / 2
        if abs(cx) > 0.12 and r[1] - r[0] < 0.12:
            arm_rows[side].append((y, cx, r[1] - r[0]))
            armpit[side] = y
for side, nm in ((1, 'Left'), (-1, 'Right')):
    a = np.array(arm_rows[side])
    ytip = a[:, 0].min()
    # the arm's axis: a line through the run centres above the hand
    sel = (a[:, 0] > ytip + 0.20) & (a[:, 0] < armpit[side] - 0.02)
    k, b = np.polyfit(a[sel, 0], a[sel, 1], 1)          # x = k y + b
    ax = lambda y: k * y + b
    ys = armpit[side] + 0.08
    xs = ax(ys)
    # the wrist: the narrowest place just above the hand
    win = (a[:, 0] > ytip + 0.10) & (a[:, 0] < ytip + 0.24)
    yw = float(a[win][np.argmin(a[win, 2]), 0])
    xw = ax(yw)
    dirv = np.array([xw - xs, yw - ys]); L = np.linalg.norm(dirv); dirv /= L
    ye = ys + dirv[1] * L * 0.53; xe = xs + dirv[0] * L * 0.53
    J[nm + 'Arm'] = [xs, ys, depth_mid(xs, ys)]
    J[nm + 'ForeArm'] = [xe, ye, depth_mid(xe, ye) - 0.01]
    J[nm + 'Hand'] = [xw, yw, depth_mid(xw, yw)]
    xm, ym = xw + dirv[0] * 0.095, yw + dirv[1] * 0.095
    J[nm + 'HandMiddle1'] = [xm, ym, J[nm + 'Hand'][2] + 0.01]
    J[nm + '_armpit'] = armpit[side]; J[nm + '_tip'] = ytip

# ---- the spine by MakeHuman's proportions, between the hip joints and the top of her head
MH = {'Hips': 0.941, 'Spine': 1.057, 'Spine1': 1.153, 'Spine2': 1.272, 'Neck': 1.420, 'Head': 1.482}
s_up = (ytop - 0.012 - yhj) / (1.67 - 0.897)
frac = {'Hips': 0.45, 'Spine': 0.42, 'Spine1': 0.42, 'Spine2': 0.42, 'Neck': 0.5, 'Head': 0.5}
hx = (J['LeftUpLeg'][0] + J['RightUpLeg'][0]) / 2
def layers(x, y):
    """the surfaces met going through her from behind to the front at (x, y): z ranges"""
    s = P[(np.abs(P[:, 0] - x) < 0.01) & (np.abs(P[:, 1] - y) < 0.006), 2]
    z = np.sort(s); gaps = np.where(np.diff(z) > 0.008)[0]
    return [(l.min(), l.max()) for l in np.split(z, gaps + 1)]
for nm, my in MH.items():
    y = yhj + (my - 0.897) * s_up
    L = layers(hx, y)
    zf = L[-1][0]; zb = L[-2][1] if len(L) > 1 else L[0][1]
    J[nm] = [hx, y, zb + frac[nm] * (zf - zb)]
for side, nm in ((1, 'Left'), (-1, 'Right')):
    nk = np.array(J['Neck']); ar = np.array(J[nm + 'Arm'])
    J[nm + 'Shoulder'] = (nk + (ar - nk) * 0.4 + np.array([0, 0.008, 0])).tolist()
info = {k: v for k, v in J.items() if not isinstance(v, list)}
J = {k: [float(x) for x in v] for k, v in J.items() if isinstance(v, list)}
json.dump({'joints': J, 'info': info, 'crotch': crotch, 'ytop': float(ytop), 's_up': s_up}, open(d + '/joints.json', 'w'), indent=1)
print(json.dumps(info), 'crotch %.3f top %.3f s_up %.3f' % (crotch, ytop, s_up))

# ---- a picture: front and side silhouettes with the bones
PAR = {'Spine': 'Hips', 'Spine1': 'Spine', 'Spine2': 'Spine1', 'Neck': 'Spine2', 'Head': 'Neck'}
for s in ('Left', 'Right'):
    PAR.update({s + 'Shoulder': 'Spine2', s + 'Arm': s + 'Shoulder', s + 'ForeArm': s + 'Arm', s + 'Hand': s + 'ForeArm', s + 'HandMiddle1': s + 'Hand', s + 'UpLeg': 'Hips', s + 'Leg': s + 'UpLeg', s + 'Foot': s + 'Leg', s + 'ToeBase': s + 'Foot'})
img = Image.fromarray((mask * 90).astype(np.uint8)).convert('RGB')
dr = ImageDraw.Draw(img)
for c, p in PAR.items():
    a = to_px(*J[p][:2]); b = to_px(*J[c][:2]); dr.line([a, b], fill=(255, 200, 0), width=2)
for k, v in J.items():
    x, y = to_px(v[0], v[1]); dr.ellipse([x - 3, y - 3, x + 3, y + 3], fill=(255, 60, 60))
# side view (from her left, +x): z to the right
Z0, Z1 = -0.25, 0.35; WS = int((Z1 - Z0) / R)
spx = (P[:, 2] - Z0) / R; spy = (Y1 - P[:, 1]) / R
_, ts, _, _ = raster(spx, spy, P[:, 0], T, WS, H)
side = Image.fromarray(((ts >= 0) * 90).astype(np.uint8)).convert('RGB')
ds = ImageDraw.Draw(side)
for c, p in PAR.items():
    if c.startswith('Right'): continue
    a = ((J[p][2] - Z0) / R, (Y1 - J[p][1]) / R); b = ((J[c][2] - Z0) / R, (Y1 - J[c][1]) / R)
    ds.line([a, b], fill=(255, 200, 0), width=2)
for k, v in J.items():
    if k.startswith('Right'): continue
    x, y = (v[2] - Z0) / R, (Y1 - v[1]) / R; ds.ellipse([x - 3, y - 3, x + 3, y + 3], fill=(255, 60, 60))
canvas = Image.new('RGB', (W + WS, H)); canvas.paste(img, (0, 0)); canvas.paste(side, (W, 0))
canvas.save(d + '/joints.png')
