#!/usr/bin/env python3
"""Hide in the Crowd's announcer: original English voice lines (Kokoro TTS, Apache 2.0) made big:
pitched down, compressed, doubled, echoed round a stadium, over a stinger synthesised here (riser,
impact, sub drop, a brass stab whose chord climbs with the tier, a choir and a crash at the top).

  pip install kokoro-onnx soundfile scipy   (and ffmpeg)
  the model, beside this file, never committed (about 120 MB, from github.com/thewh1teagle/kokoro-onnx,
  release model-files-v1.0): kokoro-v1.0.int8.onnx and voices-v1.0.bin, in /tmp/tts/model
  python3 tools/voice/make.py src/client/art/voice am_onyx -1      (out folder, voice, semitones: Steve's pick)
"""
import json, os, subprocess, sys, numpy as np, soundfile as sf
from scipy import signal
from kokoro_onnx import Kokoro

RATE = 48_000
OUT = sys.argv[1] if len(sys.argv) > 1 else "/tmp/tts/out"
VOICE = sys.argv[2] if len(sys.argv) > 2 else "am_fenrir"
SHIFT = float(sys.argv[3]) if len(sys.argv) > 3 else -3.0   # semitones
os.makedirs(OUT, exist_ok=True)
rng = np.random.default_rng(7)

# the calls: what's said, how big the stinger is (1..5), its chord (semitones over D2), its colour
LINES = {
    "first":      ("First blood!",   3, [0, 3, 7, 12],          "dark"),
    "double":     ("Double kill!",   2, [0, 4, 7, 12],          "bright"),
    "triple":     ("Triple kill!",   3, [2, 6, 9, 14],          "bright"),
    "quadra":     ("Quadra kill!",   4, [4, 8, 11, 16],         "bright"),
    "penta":      ("Penta kill!",    5, [7, 11, 14, 19, 24],    "triumph"),
    "spree":      ("Killing spree!", 3, [0, 7, 12],             "power"),
    "rampage":    ("Rampage!",       4, [2, 9, 14],             "power"),
    "shutdown":   ("Shut down!",     3, [9, 12, 16, 21],        "fall"),
    "final":      ("Final round!",   4, [0, 5, 7, 12],          "dark"),
    "qualified":  ("Qualified!",     2, [5, 9, 12, 17],         "bright"),
    "eliminated": ("Eliminated!",    2, [0, 3, 6, 12],          "fall"),
    "champion":   ("Champion!",      5, [5, 9, 12, 17, 24],     "triumph"),
}
D2 = 73.42

def tts(kokoro, text):
    samples, rate = kokoro.create(text, voice=VOICE, speed=0.86, lang="en-us")
    wav = "/tmp/tts/work/_raw.wav"
    sf.write(wav, samples, rate)
    # pitch down, keeping the length (asetrate drops it, atempo puts the time back)
    r = 2 ** (SHIFT / 12)
    out = "/tmp/tts/work/_shift.wav"
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", wav, "-af", f"aresample={RATE},asetrate={RATE * r:.0f},aresample={RATE},atempo={1 / r:.5f}", "-ac", "1", out], check=True)
    x, _ = sf.read(out)
    # trim the silence either side
    env = np.abs(x) > 0.02 * np.max(np.abs(x))
    idx = np.flatnonzero(env)
    x = x[max(0, idx[0] - int(0.01 * RATE)): idx[-1] + int(0.06 * RATE)]
    return x / np.max(np.abs(x)) * 0.9

def butter(kind, freq, x, order=2):
    sos = signal.butter(order, freq, btype=kind, fs=RATE, output="sos")
    return signal.sosfilt(sos, x, axis=0)

def compress(x, threshold_db=-20.0, ratio=5.0, attack=0.003, release=0.08):
    level = np.abs(x)
    env = np.zeros_like(level)
    a, r = np.exp(-1 / (attack * RATE)), np.exp(-1 / (release * RATE))
    value = 0.0
    for i, v in enumerate(level):
        value = a * value + (1 - a) * v if v > value else r * value + (1 - r) * v
        env[i] = value
    db = 20 * np.log10(np.maximum(env, 1e-6))
    over = np.maximum(0, db - threshold_db)
    gain = 10 ** (-(over - over / ratio) / 20)
    return x * gain

def delay(x, seconds, length):
    out = np.zeros(length)
    n = int(seconds * RATE)
    out[n:n + len(x)] = x[: max(0, length - n)]
    return out

def reverb_ir(seconds=1.4, decay=0.42):
    n = int(seconds * RATE)
    t = np.arange(n) / RATE
    ir = rng.standard_normal((n, 2)) * np.exp(-t / decay)[:, None]
    ir = butter("lowpass", 6_500, ir)
    ir[: int(0.015 * RATE)] = 0
    return ir / np.sqrt(np.sum(ir ** 2, axis=0))

IR = reverb_ir()

def voice_chain(x, length, at):
    v = butter("highpass", 90, x)
    v = compress(v)
    v = v / np.max(np.abs(v))
    v = np.tanh(1.9 * v) / np.tanh(1.9)
    v = v + 0.35 * butter("bandpass", [2_000, 4_200], v) + 0.22 * butter("lowpass", 260, v)
    v = v / np.max(np.abs(v))
    left = delay(v, at, length) + 0.3 * delay(v, at + 0.023, length)
    right = delay(v, at, length) + 0.3 * delay(v, at + 0.017, length)
    # the stadium: two slaps off the far stands, then the room
    left += 0.28 * delay(v, at + 0.14, length) + 0.12 * delay(v, at + 0.29, length)
    right += 0.2 * delay(v, at + 0.155, length) + 0.16 * delay(v, at + 0.3, length)
    dry = np.stack([left, right], axis=1)
    wet = signal.fftconvolve(dry, IR, axes=0)[:length]
    return dry + 0.3 * wet

def saw(freq, t, cutoff):
    out = np.zeros_like(t)
    k = 1
    while k * freq < cutoff:
        out += ((-1) ** (k + 1)) * np.sin(2 * np.pi * k * freq * t) / k
        k += 1
    return out * (2 / np.pi)

def stinger(tier, chord, colour, length, at):
    t = np.arange(length) / RATE
    out = np.zeros((length, 2))
    hit = int(at * RATE)
    after = np.maximum(0, t - at)
    live = (t >= at).astype(float)
    # the riser into the hit (a reversed cymbal), from tier 2
    if tier >= 2:
        rise = rng.standard_normal(hit) * np.linspace(0, 1, hit) ** 3
        rise = butter("highpass", 3_500, rise) * 0.5
        out[:hit] += np.stack([rise, rise], axis=1)
    # the hit: a thump of noise and a click
    thump = rng.standard_normal(length) * np.exp(-after / 0.05) * live
    thump = butter("lowpass", 2_400, thump) * 0.9
    out += np.stack([thump, thump], axis=1)
    # the sub drop
    freq = 105 * np.exp(-after / 0.25) + 36
    phase = 2 * np.pi * np.cumsum(freq) / RATE
    sub = np.sin(phase) * np.exp(-after / (0.32 + 0.06 * tier)) * live
    sub = np.tanh(1.6 * sub) * 0.9
    out += np.stack([sub, sub], axis=1)
    # the stab: detuned saws on the chord, bright at the hit, darkening as it rings
    length_s = 0.5 + 0.18 * tier
    env = np.exp(-after / length_s) * live * (1 - np.exp(-after / 0.006))
    if colour == "fall":
        bend = 2 ** (-after * 1.6 / 12)
    else:
        bend = np.ones_like(t)
    stab_l = np.zeros_like(t); stab_r = np.zeros_like(t)
    for index, semis in enumerate(chord):
        f = D2 * 2 ** (semis / 12) * (2 if colour != "power" else 1)
        for detune, side in ((-0.004, 0), (0.0, 2), (0.0045, 1)):
            tone = saw(f * (1 + detune), t * bend, 7_000 if colour != "dark" else 4_000)
            if side == 0: stab_l += tone
            elif side == 1: stab_r += tone
            else: stab_l += 0.6 * tone; stab_r += 0.6 * tone
    bright = np.stack([stab_l, stab_r], axis=1) * env[:, None]
    dark = butter("lowpass", 1_100, bright)
    fade = np.exp(-after / 0.22)[:, None]
    stab = bright * fade + dark * (1 - fade)
    if colour == "power":
        stab = np.tanh(2.5 * stab / (np.max(np.abs(stab)) + 1e-9))
    stab = stab / (np.max(np.abs(stab)) + 1e-9) * (0.45 + 0.07 * tier)
    out += stab
    # a choir and a crash at the top
    if colour == "triumph" or tier >= 5:
        choir = np.zeros_like(t)
        for semis in chord:
            f = D2 * 2 ** (semis / 12) * 2
            vib = 1 + 0.006 * np.sin(2 * np.pi * 5.2 * t)
            choir += saw(f, t * vib, 3_500)
        choir = butter("bandpass", [550, 1_250], choir) * np.minimum(1, after / 0.25) * np.exp(-after / 1.4) * live
        choir = choir / (np.max(np.abs(choir)) + 1e-9) * 0.35
        out += np.stack([choir, choir * 0.9], axis=1)
    if tier >= 4:
        crash = butter("highpass", 4_500, rng.standard_normal((length, 2))) * (np.exp(-after / (0.5 + 0.15 * tier)) * live)[:, None]
        out += crash * 0.22
    # the stinger rings in the room too
    wet = signal.fftconvolve(out, IR, axes=0)[:length]
    return out + 0.25 * wet

def make(kokoro, key):
    text, tier, chord, colour = LINES[key]
    v = tts(kokoro, text)
    at = 0.16 if tier >= 2 else 0.04
    length = int((at + len(v) / RATE + 0.9 + 0.12 * tier) * RATE)
    voice = voice_chain(v, length, at + 0.015)
    sting = stinger(tier, chord, colour, length, at)
    # the stinger ducks under the words, and blooms in the gaps and the tail
    level = np.abs(voice).mean(axis=1)
    smooth = signal.lfilter([1 - np.exp(-1 / (0.02 * RATE))], [1, -np.exp(-1 / (0.02 * RATE))], level)
    duck = 1 - 0.6 * np.clip(smooth / (np.percentile(smooth, 99) + 1e-9), 0, 1)
    mix = voice + 0.6 * sting * duck[:, None]
    mix = np.tanh(1.3 * mix / np.max(np.abs(mix))) / np.tanh(1.3)
    # the tail fades out, and the whole is at -1 dB
    fade = int(0.25 * RATE)
    mix[-fade:] *= np.linspace(1, 0, fade)[:, None]
    mix *= 10 ** (-1 / 20) / np.max(np.abs(mix))
    wav = f"/tmp/tts/work/{key}.wav"
    sf.write(wav, mix.astype(np.float32), RATE)
    mp3 = f"{OUT}/{key}.mp3"
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", wav, "-ar", "44100", "-c:a", "libmp3lame", "-b:a", "96k", "-joint_stereo", "1", mp3], check=True)
    return {"key": key, "text": text, "seconds": round(length / RATE, 2), "voiceAt": round(at + 0.015, 3), "bytes": os.path.getsize(mp3)}

kokoro = Kokoro("/tmp/tts/model/kokoro-v1.0.int8.onnx", "/tmp/tts/model/voices-v1.0.bin")
keys = sys.argv[4].split(",") if len(sys.argv) > 4 else list(LINES)
made = [make(kokoro, key) for key in keys]
print(json.dumps(made, indent=0))
