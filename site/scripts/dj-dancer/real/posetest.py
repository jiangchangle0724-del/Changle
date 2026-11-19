"""Her skinning tried on a few poses (linear blend skinning, as three.js does), rendered."""
import sys, json
import numpy as np
from PIL import Image
from scipy.spatial.transform import Rotation as Rot
from rast import load
from preview import views

def parents():
    PAR = {'Spine': 'Hips', 'Spine1': 'Spine', 'Spine2': 'Spine1', 'Neck': 'Spine2', 'Head': 'Neck'}
    for s in ('Left', 'Right'):
        PAR.update({s + 'Shoulder': 'Spine2', s + 'Arm': s + 'Shoulder', s + 'ForeArm': s + 'Arm', s + 'Hand': s + 'ForeArm', s + 'HandMiddle1': s + 'Hand', s + 'UpLeg': 'Hips', s + 'Leg': s + 'UpLeg', s + 'Foot': s + 'Leg', s + 'ToeBase': s + 'Foot'})
    return PAR

def skin(P, J, skel, j4, w4, local):
    """local: bone -> rotation (scipy) in the bone's frame (rest frames all unrotated)"""
    PAR = parents()
    Wr = {}; Wp = {}
    for b in skel:
        p = PAR.get(b)
        lr = local.get(b, Rot.identity())
        if p is None:
            Wr[b] = lr; Wp[b] = np.array(J[b])
        else:
            Wr[b] = Wr[p] * lr
            Wp[b] = Wp[p] + Wr[p].apply(np.array(J[b]) - np.array(J[p]))
    M = np.zeros((len(skel), 3, 4))
    for i, b in enumerate(skel):
        R = Wr[b].as_matrix(); t = Wp[b] - R @ np.array(J[b])
        M[i, :, :3] = R; M[i, :, 3] = t
    Ph = np.concatenate([P, np.ones((len(P), 1))], 1)
    out = np.zeros_like(P)
    for k in range(4):
        out += w4[:, k:k + 1] * np.einsum('nij,nj->ni', M[j4[:, k]], Ph)
    return out

if __name__ == '__main__':
    d = sys.argv[1]; J = json.load(open(sys.argv[2]))['joints']; tex = sys.argv[3]; out = sys.argv[4]
    P, N, UV, T = load(d)
    skel = json.load(open(d + '/skeleton.json')); j4 = np.load(d + '/joints4.npy'); w4 = np.load(d + '/weights4.npy')
    texi = np.asarray(Image.open(tex).convert('RGB'), np.float32) / 255
    E = lambda *a: Rot.from_euler('xyz', a, degrees=True)
    poses = {
        'rest': {},
        'arms up': {'LeftArm': E(0, 0, 100), 'RightArm': E(0, 0, -100), 'LeftForeArm': E(0, 0, 30), 'RightForeArm': E(0, 0, -30)},
        'elbows': {'LeftArm': E(0, 0, 40), 'RightArm': E(-60, 0, 0), 'LeftForeArm': E(0, -100, 0), 'RightForeArm': E(-90, 0, 0)},
        'legs': {'LeftUpLeg': E(-70, 0, 0), 'LeftLeg': E(90, 0, 0), 'RightUpLeg': E(0, 0, -25), 'Spine1': E(15, 0, 0)},
        'twist': {'Spine': E(0, 20, 0), 'Spine2': E(0, 20, 8), 'Neck': E(0, 30, 0), 'Head': E(-15, 20, 0), 'Hips': E(0, -10, 0)},
    }
    imgs = []
    for name, loc in poses.items():
        Q = skin(P, J, skel, j4, w4, loc)
        # normals from the posed triangles
        fn = np.cross(Q[T[:, 1]] - Q[T[:, 0]], Q[T[:, 2]] - Q[T[:, 0]])
        Nq = np.zeros_like(Q)
        for k in range(3): np.add.at(Nq, T[:, k], fn)
        Nq /= np.linalg.norm(Nq, axis=1, keepdims=True) + 1e-12
        imgs.append(views(Q, Nq, UV, T, texi, [20], 420))
    Image.fromarray(np.concatenate(imgs, 1)).save(out)
