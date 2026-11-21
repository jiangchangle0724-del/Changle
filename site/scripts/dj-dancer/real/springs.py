"""Her hair and her skirt, free to swing (Steve on Nov 18: "头发，看起来还有点僵硬…跳动时裙子和衣服的物理逻辑
惯性"): bones of their own added to her skeleton, which the page swings with springs (dancer/springs.ts)
as she moves, kept off her body by a few round shapes on her bones.

- The hair down her back (dark, behind her, below her head): a few chains of bones from the nape down
  to its ends, side by side; each hair vertex goes with the chain bones nearest it, its top with her
  head as before.
- A skirt (an outfit with one, from its config): bones round her waist, each from the waistband down to
  the hem; the skirt's vertices go with her hips at the waistband and with the two nearest skirt bones
  further down, so her legs move inside it and it swings out over them (not like trousers).

Run after weights.py (it rewrites what that wrote: the four bones a vertex, the skeleton's list) and
before build_glb.mjs, which reads springs.json for the new bones and what the page needs.
usage: python3 springs.py <mesh dir (simplified)> <joints.json> <baked texture> <outfit config .json>
config: {"hair": {"top": 1.52, "bottom": 1.18, "chains": 3, "bones": 3},
         "skirt": {"waist": 1.0, "hem": 0.79, "crotch": 0.87, "chains": 8}}   (heights in metres; skirt optional;
         "only": a .npy in the mesh dir marking the skirt's vertices, for a skirt made by skirt.py; the hair's
         "only" likewise, for a sheet of hair made by hairsheet.py)
"""
import json, sys
import numpy as np
from PIL import Image
from scipy.spatial import cKDTree
from rast import load, sample

lo, jfile, texfile, cfgfile = sys.argv[1:5]
J = {k: np.array(v, float) for k, v in json.load(open(jfile))['joints'].items()}
cfg = json.load(open(cfgfile))
P, _, UV, T = load(lo)
Ns = np.fromfile(lo + '/nrm_s.f32', np.float32).reshape(-1, 3).astype(float)
skel = json.load(open(lo + '/skeleton.json'))
j4 = np.fromfile(lo + '/j4.u8', np.uint8).reshape(-1, 4).astype(int)
w4 = np.fromfile(lo + '/w4.f32', np.float32).reshape(-1, 4).astype(float)
nv = len(P)
tex = np.asarray(Image.open(texfile).convert('RGB'), np.float32) / 255
col = sample(tex, UV[:, 0], UV[:, 1])
mx = col.max(1); mn = col.min(1); sat = (mx - mn) / np.maximum(mx, 1e-3)

bones = []        # new bones: name, parent, head, tail (metres, as joints.json)
groups = []       # what the page swings: their bones, how, and what they keep off
new_w = {}        # vertex -> {bone name: weight} for the vertices whose weights change
blend = np.zeros(nv)  # how much of the new weights (the rest: the old ones)


def seg_dist(p, a, b):
    ab = b - a
    t = np.clip(((p - a) @ ab) / max(ab @ ab, 1e-12), 0, 1)
    return np.linalg.norm(p - (a + t[:, None] * ab), axis=1)


def smooth(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


main = np.array([skel[j] for j in j4[:, 0]])  # each vertex's strongest bone before

# ---- the hair down her back
h = cfg['hair']
top, bottom, nc, nb = h['top'], h['bottom'], h.get('chains', 3), h.get('bones', 3)
behind = P[:, 2] < J['Neck'][2] - 0.01
if h.get('only'):
    # (her hair's own shell, hairshell.py: only its vertices; her back under it stays her back)
    hair = np.load(lo + '/' + h['only'])
else:
    hair = behind & (mx < 0.30) & (sat < 0.45) & (P[:, 1] < top + 0.04) & (P[:, 1] > bottom - 0.04) & (np.abs(P[:, 0]) < 0.17)
    hair &= np.isin(main, ['Head', 'Neck', 'Spine2', 'Spine1', 'Spine', 'LeftShoulder', 'RightShoulder'])
    # the hair goes with her back under it (the model's hair lies a few millimetres off her back: weighted
    # apart, a bend of her back or a shoulder pushes the back through it), its weights the nearest back's
    hair_all = behind & (mx < 0.30) & (sat < 0.45) & (P[:, 1] < top + 0.12) & (P[:, 1] > bottom - 0.04) & (np.abs(P[:, 0]) < 0.19)
    back = (~hair_all) & behind & (P[:, 1] < top + 0.16) & (P[:, 1] > bottom - 0.08) & (np.abs(P[:, 0]) < 0.24)
    if back.sum() > 50 and hair_all.any():
        tree = cKDTree(P[back])
        _, near_i = tree.query(P[hair_all])
        src = np.nonzero(back)[0][near_i]
        j4[hair_all] = j4[src]
        w4[hair_all] = w4[src]
        # and sits a little further off it
        P[hair_all] += Ns[hair_all] * 0.002
        P.astype(np.float32).tofile(lo + '/pos.f32')
    print('hair on her back', int(hair_all.sum()))
xs = P[hair, 0]
span = np.percentile(np.abs(xs), 90) if len(xs) else 0.08
cx = np.linspace(-span * 0.6, span * 0.6, nc) if nc > 1 else np.array([0.0])
ys = np.linspace(top, bottom, nb + 1)
hair_bones = []
for c in range(nc):
    pts = []
    for y in ys:
        m = hair & (np.abs(P[:, 1] - y) < 0.03) & (np.abs(P[:, 0] - cx[c]) < span * 0.45)
        if m.sum() >= 5:
            # the middle of the hair's layer there (between its outside and the back under it)
            pts.append([P[m, 0].mean(), y, np.percentile(P[m, 2], 60)])
        else:
            pts.append(None)
    # (a gap: filled from its neighbours; the top from the nape behind her neck)
    if pts[0] is None:
        pts[0] = [cx[c], top, J['Neck'][2] - 0.07]
    for k in range(1, len(pts)):
        if pts[k] is None:
            nxt = next((pts[i] for i in range(k + 1, len(pts)) if pts[i] is not None), None)
            pts[k] = list(np.array(pts[k - 1]) + (np.array(nxt) - np.array(pts[k - 1])) / 2) if nxt else [pts[k - 1][0], ys[k], pts[k - 1][2] - 0.005]
    for k in range(nb):
        name = f'Hair{c}_{k}'
        # (hung from her upper back: the model's hair is grown into her back above here, so it goes with
        # her back as before, and only its ends, hanging free, swing. The upper bones stiffer)
        bones.append({'name': name, 'parent': 'Spine2' if k == 0 else f'Hair{c}_{k - 1}', 'head': pts[k], 'tail': pts[k + 1], 'k': round(2.0 - k * (1.0 / max(nb - 1, 1)), 2)})
        hair_bones.append(name)
# hair vertices: the chain bones nearest them, falling off with distance; the top with her head as before
hb = [b for b in bones if b['name'] in hair_bones]
D = np.stack([seg_dist(P[hair], np.array(b['head']), np.array(b['tail'])) for b in hb], 1)
W = np.exp(-(D - D.min(1, keepdims=True)) / 0.02)
W /= W.sum(1, keepdims=True)
for i, v in enumerate(np.nonzero(hair)[0]):
    new_w[v] = {hb[k]['name']: W[i, k] for k in np.argsort(-W[i])[:3] if W[i, k] > 0.02}
# (the chain's pull grows down the hair: none at its top, all at its ends)
blend[hair] = smooth(top, bottom + 0.02, P[hair, 1])
r_head = 0.095
groups.append({
    # (the model's hair is grown into her back here and there: it sways a little, never flies out
    # like a cape, or it would pull her back's colours over it)
    # (a shell of her hair off her back, hairshell.py: no colours of her back to pull, so it swings freer)
    'name': 'hair', 'bones': hair_bones, 'hit': 0.006,
    **({'stiffness': 1.8, 'gravity': 0.3, 'drag': 0.5, 'max': 0.55} if h.get('only') else {'stiffness': 2.4, 'gravity': 0.25, 'drag': 0.6, 'max': 0.42}),
    'colliders': ['head', 'neck', 'back', 'lshoulder', 'rshoulder'],
})
print('hair vertices', int(hair.sum()), 'chains', nc, 'x', np.round(cx, 3))

# ---- a skirt
colliders = {
    'head': {'bone': 'Head', 'a': list(J['Head'] + [0, 0.08, -0.01]), 'r': r_head},
    'neck': {'bone': 'Neck', 'a': list(J['Neck']), 'b': list(J['Head']), 'r': 0.05},
    'lshoulder': {'bone': 'LeftShoulder', 'a': list(J['LeftArm'] * 0.6 + J['LeftShoulder'] * 0.4), 'r': 0.055},
    'rshoulder': {'bone': 'RightShoulder', 'a': list(J['RightArm'] * 0.6 + J['RightShoulder'] * 0.4), 'r': 0.055},
}
# her back under the hair: a capsule down her spine, as deep as her back is behind it (the hair's own
# vertices aside)
spine_a, spine_b = J['Spine1'], J['Neck'] * 0.7 + J['Spine2'] * 0.3
torso = (~hair) & (P[:, 1] > spine_a[1]) & (P[:, 1] < spine_b[1]) & (np.abs(P[:, 0]) < 0.08) & (P[:, 2] < spine_a[2])
# (a little inside it: only to keep the hair out of her when she leans back, never pushing it off her back)
r_back = 0.85 * float(np.percentile(seg_dist(P[torso], spine_a, spine_b), 50)) if torso.any() else 0.08
colliders['back'] = {'bone': 'Spine2', 'a': list(spine_a), 'b': list(spine_b), 'r': r_back}
print('back radius', round(r_back, 3))

s = cfg.get('skirt')
if s:
    waist, hem, crotch, K = s['waist'], s['hem'], s['crotch'], s.get('chains', 8)
    c0 = J['Hips'][[0, 2]]
    # her legs' thickness just under the hem (only legs there)
    legs = {}
    for side in ('Left', 'Right'):
        a, b = J[side + 'UpLeg'], J[side + 'Leg']
        # (at the hem, or high on her thighs for a long skirt: the thickness of her thighs)
        at = max(hem, crotch - 0.05)
        band = (P[:, 1] > at - 0.07) & (P[:, 1] < at - 0.03) & (np.sign(P[:, 0]) == np.sign(a[0]))
        # (her legs only: her hands hang at her thighs' height)
        band &= np.isin(main, [side + 'UpLeg', side + 'Leg'])
        legs[side] = (a, b, float(np.percentile(seg_dist(P[band], a, b), 80)) if band.any() else 0.07)
    in_leg = np.zeros(nv, bool)
    for side, (a, b, r) in legs.items():
        in_leg |= seg_dist(P, a, b) < r + 0.012
    pelvis = np.isin(main, ['Hips', 'LeftUpLeg', 'RightUpLeg', 'Spine'])
    skirt = pelvis & (P[:, 1] > hem - 0.03) & (P[:, 1] < waist + 0.01) & (np.abs(P[:, 0]) < 0.32) & ((P[:, 1] >= crotch) | ~in_leg)
    # (a skirt made of its own, skirt.py: only its vertices, her body under it as it was)
    if s.get('only'):
        skirt = np.load(lo + '/' + s['only'])
    ang = np.arctan2(P[:, 0] - c0[0], P[:, 2] - c0[1])  # 0: straight ahead
    rad = np.hypot(P[:, 0] - c0[0], P[:, 2] - c0[1])
    skirt_bones = []
    for k in range(K):
        th = -np.pi + 2 * np.pi * k / K
        da = np.angle(np.exp(1j * (ang - th)))
        near = skirt & (np.abs(da) < np.pi / K)
        top_m = near & (np.abs(P[:, 1] - (waist - 0.02)) < 0.015)
        r_top = float(np.percentile(rad[top_m], 70)) if top_m.sum() > 3 else 0.14
        lowest = float(np.percentile(P[near, 1], 2)) if near.sum() > 10 else hem
        hem_m = near & (P[:, 1] < lowest + 0.03)
        r_hem = float(np.percentile(rad[hem_m], 70)) if hem_m.sum() > 3 else r_top + 0.06
        d = np.array([np.sin(th), 0, np.cos(th)])
        head = np.array([c0[0], waist - 0.02, c0[1]]) + d * r_top * 0.85
        tail = np.array([c0[0], lowest, c0[1]]) + d * r_hem
        name = f'Skirt{k}'
        bones.append({'name': name, 'parent': 'Hips', 'head': list(head), 'tail': list(tail), 'k': 1})
        skirt_bones.append(name)
    step = 2 * np.pi / K
    for v in np.nonzero(skirt)[0]:
        f = (ang[v] + np.pi) / step
        k0 = int(np.floor(f)) % K; k1 = (k0 + 1) % K; u = f - np.floor(f)
        a = float(np.clip((waist - P[v, 1]) / (waist - hem) * 1.5, 0, 1))
        new_w[v] = {'Hips': 1 - a, skirt_bones[k0]: a * (1 - u), skirt_bones[k1]: a * u}
        blend[v] = 1
    for side, (a, b, r) in legs.items():
        colliders[side[0].lower() + 'thigh'] = {'bone': side + 'UpLeg', 'a': list(a), 'b': list(b), 'r': r + 0.01}
    colliders['hips'] = {'bone': 'Hips', 'a': list(J['Hips'] + [0, -0.02, 0]), 'r': 0.11}
    groups.append({
        'name': 'skirt', 'bones': skirt_bones, 'stiffness': 1.6, 'gravity': 0.35, 'drag': 0.4, 'hit': 0.015, 'max': 0.75,
        'colliders': ['lthigh', 'rthigh', 'hips'],
    })
    print('skirt vertices', int(skirt.sum()), 'legs r', {k: round(v[2], 3) for k, v in legs.items()})

# ---- the new weights in: blended with the old where it says, four bones a vertex
allb = skel + [b['name'] for b in bones]
idx = {n: i for i, n in enumerate(allb)}
for v, nw in new_w.items():
    f = blend[v]
    w = {}
    for j, ww in zip(j4[v], w4[v]):
        if ww > 0: w[skel[j]] = w.get(skel[j], 0) + ww * (1 - f)
    for n, ww in nw.items():
        w[n] = w.get(n, 0) + ww * f
    top4 = sorted(w.items(), key=lambda t: -t[1])[:4]
    tot = sum(t[1] for t in top4)
    j4[v] = [idx[n] for n, _ in top4] + [0] * (4 - len(top4))
    w4[v] = [t[1] / tot for t in top4] + [0] * (4 - len(top4))
j4.astype(np.uint8).tofile(lo + '/j4.u8')
w4.astype(np.float32).tofile(lo + '/w4.f32')
json.dump(allb, open(lo + '/skeleton.json', 'w'))
json.dump({'bones': bones, 'groups': groups, 'colliders': colliders}, open(lo + '/springs.json', 'w'), indent=1)
print('bones', len(allb), 'new', len(bones), 'vertices changed', len(new_w))
