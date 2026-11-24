"""A learnt dance's turns and hips smoothed in time (Nov 23: the video dances shook, jerk 550-730 against
80-230 for the motion-captured ones; the pose finder's frame-to-frame noise). Gaussian, sigma frames.
usage: smooth_rt.py <in rt dir> <out rt dir> <sigma frames> <name>..."""
import json, shutil, sys
import numpy as np
from scipy.ndimage import gaussian_filter1d
src, dst, sig = sys.argv[1], sys.argv[2], float(sys.argv[3])
for n in sys.argv[4:]:
    j = json.load(open(f'{src}/{n}.json')); N = j['frames']; nb = len(j['bones'])
    q = np.fromfile(f'{src}/{n}.q.bin', np.int16).reshape(N, nb, 4).astype(float) / 32767
    for b in range(nb):                      # (each frame's turn the same way round as the one before)
        for t in range(1, N):
            if (q[t, b] * q[t - 1, b]).sum() < 0: q[t, b] *= -1
    q = gaussian_filter1d(q, sig, axis=0, mode='nearest')
    q /= np.linalg.norm(q, axis=2, keepdims=True)
    q *= np.where(q[..., 3:4] < 0, -1, 1)
    h = np.fromfile(f'{src}/{n}.hips.bin', np.int16).reshape(N, 3).astype(float)
    h = gaussian_filter1d(h, sig * 0.7, axis=0, mode='nearest')
    np.round(q * 32767).astype(np.int16).tofile(f'{dst}/{n}.q.bin'); np.round(h).astype(np.int16).tofile(f'{dst}/{n}.hips.bin')
    shutil.copy(f'{src}/{n}.json', f'{dst}/{n}.json')
print('smoothed', len(sys.argv) - 4)
