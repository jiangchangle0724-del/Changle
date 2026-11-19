"""A dance's loop played on her (linear blend skinning), a few moments side by side."""
import sys, json
import numpy as np
from PIL import Image
from scipy.spatial.transform import Rotation as Rot
from rast import load
from preview import views
from posetest import parents

def frames(loopdir, name):
    h = json.load(open(f'{loopdir}/{name}.json'))
    q = np.fromfile(f'{loopdir}/{name}.q.bin', np.int16).reshape(h['frames'], len(h['bones']), 4) / 32767
    hp = np.fromfile(f'{loopdir}/{name}.hips.bin', np.int16).reshape(h['frames'], 3) / 1000
    return h, q, hp

def pose(P, J, skel, j4, w4, bones, qf, hips):
    PAR = parents()
    Wr = {}; Wp = {}
    loc = {b: Rot.from_quat(qf[i]) for i, b in enumerate(bones)}
    for b in skel:
        p = PAR.get(b); lr = loc.get(b, Rot.identity())
        if p is None:
            Wr[b] = lr; Wp[b] = np.array(J[b]) + hips
        else:
            Wr[b] = Wr[p] * lr; Wp[b] = Wp[p] + Wr[p].apply(np.array(J[b]) - np.array(J[p]))
    M = np.zeros((len(skel), 3, 4))
    for i, b in enumerate(skel):
        R = Wr[b].as_matrix(); M[i, :, :3] = R; M[i, :, 3] = Wp[b] - R @ np.array(J[b])
    Ph = np.concatenate([P, np.ones((len(P), 1))], 1)
    out = np.zeros_like(P)
    for k in range(4): out += w4[:, k:k + 1] * np.einsum('nij,nj->ni', M[j4[:, k]], Ph)
    return out

if __name__ == '__main__':
    mesh, jfile, tex, loopdir, out = sys.argv[1:6]
    names = sys.argv[6].split(',')
    P, N, UV, T = load(mesh)
    J = json.load(open(jfile))['joints']
    shift = np.array([-J['Hips'][0], 0, -J['Hips'][2]])
    J = {k: (np.array(v) + shift).tolist() for k, v in J.items()}
    P = P + shift
    skel = json.load(open(mesh + '/skeleton.json')); j4 = np.load(mesh + '/joints4.npy'); w4 = np.load(mesh + '/weights4.npy')
    texi = np.asarray(Image.open(tex).convert('RGB'), np.float32) / 255
    rows = []
    for name in names:
        h, q, hp = frames(loopdir, name)
        n = 6
        imgs = []
        for k in range(n):
            f = int(h['frames'] * k / n)
            Q = pose(P, J, skel, j4, w4, h['bones'], q[f], hp[f])
            fn = np.cross(Q[T[:, 1]] - Q[T[:, 0]], Q[T[:, 2]] - Q[T[:, 0]]); Nq = np.zeros_like(Q)
            for kk in range(3): np.add.at(Nq, T[:, kk], fn)
            Nq /= np.linalg.norm(Nq, axis=1, keepdims=True) + 1e-12
            imgs.append(views(Q, Nq, UV, T, texi, [15], 300, crop=(0, 0.95, 1.0)))
        rows.append(np.concatenate(imgs, 1))
        print(name, 'done', flush=True)
    Image.fromarray(np.concatenate(rows, 0)).save(out)
