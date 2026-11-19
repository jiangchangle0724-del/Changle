"""The model in metres: 1.74 m tall in her boots (TRELLIS's model is a unit tall), feet on the floor,
centred on her knees (the hips over the origin later, in build_glb.mjs). Facing +z, up +y, as three.js.

usage: python3 metres.py <work dir>   (reads <work>/trellis, writes <work>/m)"""
import sys, os
import numpy as np
from rast import load

work = sys.argv[1]
P, N, UV, T = load(work + '/trellis')
k = 1.74 / (P[:, 1].max() - P[:, 1].min())
Q = P * k
Q[:, 1] -= Q[:, 1].min()
band = (Q[:, 1] > 0.40) & (Q[:, 1] < 0.50) & (np.abs(Q[:, 0]) < 0.25)
Q[:, 0] -= Q[band, 0].mean(); Q[:, 2] -= Q[band, 2].mean()
os.makedirs(work + '/m', exist_ok=True)
Q.astype(np.float32).tofile(work + '/m/pos.f32'); N.astype(np.float32).tofile(work + '/m/nrm.f32')
UV.astype(np.float32).tofile(work + '/m/uv.f32'); T.astype(np.uint32).tofile(work + '/m/idx.u32')
print('scale %.4f' % k)
