"""A song's tempo from its sound (Nov 21, for a dance learnt from a video: loop.ts's name@bpm): how its
spectrum rises, frame to frame, autocorrelated over 60-180 beats a minute. usage: python3 tempo.py <audio or video>"""
import sys, subprocess, numpy as np
sr = 22050
raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', sys.argv[1], '-ac', '1', '-ar', str(sr), '-f', 's16le', '-'], capture_output=True).stdout
x = np.frombuffer(raw, np.int16).astype(np.float32) / 32768
hop, win = 512, 2048
frames = np.lib.stride_tricks.sliding_window_view(x, win)[::hop] * np.hanning(win)
mag = np.log1p(np.abs(np.fft.rfft(frames, axis=1)))
flux = np.maximum(0, np.diff(mag, axis=0)).sum(1)
flux = flux - np.convolve(flux, np.ones(16) / 16, 'same')
fr = sr / hop
ac = np.correlate(flux, flux, 'full')[len(flux) - 1:]
lags = np.arange(len(ac)) / fr
best, bpm = -1, 0
for b in np.arange(60, 180, 0.1):
    lag = 60 / b * fr
    i = int(lag); f = lag - i
    v = ac[i] * (1 - f) + ac[i + 1] * f
    # (a tempo's double and half count a little too)
    w = v * (1.0 if 85 <= b <= 160 else 0.85)
    if w > best: best, bpm = w, b
print(f'{bpm:.1f}')
