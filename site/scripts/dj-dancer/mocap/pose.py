"""A dance video's body, frame by frame (Nov 21: Steve's YouTube links, for fromvideo.ts): MediaPipe's
pose landmarker (the heavy model, pose_landmarker_heavy.task from Google's MediaPipe models; Apache 2.0),
its 33 points in metres round the hips (world) and in the picture (pixels: 0-1 of its width and height),
at 30 frames a second. A frame it didn't find her in is null.
usage: python3 pose.py <video, H.264> <out.json> <pose_landmarker_heavy.task>"""
import json, sys, time
import cv2, numpy as np, mediapipe as mp
from mediapipe.tasks.python import vision, BaseOptions

src, out, model = sys.argv[1:4]
cap = cv2.VideoCapture(src)
fps = cap.get(cv2.CAP_PROP_FPS)
step = max(1, round(fps / 30))
opts = vision.PoseLandmarkerOptions(base_options=BaseOptions(model_asset_path=model), running_mode=vision.RunningMode.VIDEO,
                                    num_poses=1, min_pose_detection_confidence=0.5, min_tracking_confidence=0.5)
lm = vision.PoseLandmarker.create_from_options(opts)
W, I, T = [], [], []
i = 0; t0 = time.time()
while True:
    ok, frame = cap.read()
    if not ok: break
    if i % step == 0:
        ms = int(i * 1000 / fps)
        r = lm.detect_for_video(mp.Image(image_format=mp.ImageFormat.SRGB, data=cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)), ms)
        if r.pose_world_landmarks:
            W.append([[p.x, p.y, p.z, p.visibility] for p in r.pose_world_landmarks[0]])
            I.append([[p.x, p.y, p.z, p.visibility] for p in r.pose_landmarks[0]])
        else:
            W.append([[np.nan] * 4] * 33); I.append([[np.nan] * 4] * 33)
        T.append(ms / 1000)
        if len(T) % 500 == 0: print(len(T), 'frames', round(time.time() - t0), 's', flush=True)
    i += 1
r = lambda fs: [[[None if not np.isfinite(v) else round(float(v), 4) for v in p] for p in f] for f in fs]
json.dump({'fps': fps / step, 'size': [cap.get(cv2.CAP_PROP_FRAME_WIDTH), cap.get(cv2.CAP_PROP_FRAME_HEIGHT)], 'world': r(W), 'image': r(I)}, open(out, 'w'))
print('done', len(T), 'frames', round(time.time() - t0), 's')
