"""打碟 · DJ Booth: the sound board's files, made from Steve's own sound files (sfx_catalog.py says which).

For each sound: decoded, the silence at its start cut, 20 s at most (faded out over the last 0.8 s
when cut), the tail under -60 dB cut, brought to one loudness (the RMS of its loudest 30 % of 50 ms
windows at -17 dBFS, its peaks never over -1 dBFS: a quiet clip and a blasting one land alike), then
written as a mono 44.1 kHz MP3 at 96 kb/s with no tags to public/media/sfx/<id>.mp3. The list in
src/shared/dj/sfx.ts (`SFX`) is written again from the catalogue with each sound's length.

Needs ffmpeg and numpy.
usage: python3 scripts/sfx_make.py <Steve's 音效 folder> [id ...]
  (with ids, only those sounds' files are made again; the list is always written whole)
"""
import json, os, re, subprocess, sys
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from sfx_catalog import CATALOG  # noqa: E402

SITE = os.path.dirname(HERE)
OUT = os.path.join(SITE, "public", "media", "sfx")
LIST = os.path.join(SITE, "src", "shared", "dj", "sfx.ts")
MAX_S = 20.0
FADE_S = 0.8
TARGET = 10 ** (-17 / 20)
PEAK = 10 ** (-1 / 20)
RATE = 44100
KINDS = ("dj", "mc", "hype", "funny", "shock", "fail", "taunt", "songs", "rude")


def decode(src, trim):
    af = ["-af", "silenceremove=start_periods=1:start_threshold=-50dB"] if trim else []
    pcm = subprocess.run(["ffmpeg", "-v", "error", "-i", src, *af, "-ac", "1", "-ar", str(RATE), "-f", "f32le", "-"], capture_output=True, check=True).stdout
    return np.frombuffer(pcm, dtype="<f4").astype(np.float64)


def make(src, dst):
    x = decode(src, True)
    if len(x) == 0:
        x = decode(src, False)
    if len(x) > MAX_S * RATE:
        x = x[: int(MAX_S * RATE)].copy()
        f = int(FADE_S * RATE)
        x[-f:] *= np.linspace(1, 0, f)
    loud = np.nonzero(np.abs(x) > 10 ** (-60 / 20))[0]
    if len(loud):
        x = x[: min(len(x), loud[-1] + int(0.05 * RATE))]
    w = int(0.05 * RATE)
    k = max(1, len(x) // w)
    frames = x[: k * w].reshape(k, w) if len(x) >= w else x.reshape(1, -1)
    rms = np.sqrt((frames**2).mean(axis=1))
    top = np.sort(rms)[-max(1, int(len(rms) * 0.3)) :]
    level = float(np.sqrt((top**2).mean())) or 1e-6
    gain = min(TARGET / level, PEAK / max(1e-6, float(np.abs(x).max())))
    y = np.clip(x * gain, -1, 1).astype("<f4")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "f32le", "-ar", str(RATE), "-ac", "1", "-i", "-", "-c:a", "libmp3lame", "-b:a", "96k", "-map_metadata", "-1", dst], input=y.tobytes(), check=True)
    return round(len(y) / RATE, 2), round(20 * np.log10(gain), 1)


def lengths():
    """The seconds the list has for each sound now (kept for the sounds not made again)."""
    ts = open(LIST, encoding="utf-8").read()
    return {m[1]: float(m[2]) for m in re.finditer(r'\{ id: "([a-z0-9-]+)",.*?, s: ([0-9.]+) \}', ts)}


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    base, only = sys.argv[1], set(sys.argv[2:])
    ids = [c[0] for c in CATALOG]
    assert len(ids) == len(set(ids)), "an id twice"
    assert all(re.fullmatch(r"[a-z0-9-]+", i) for i in ids), "ids: lower-case letters, digits and dashes"
    assert all(c[1] in KINDS for c in CATALOG), "a kind that isn't one"
    assert all(c[2].strip() and c[3].strip() for c in CATALOG), "a name missing in one language"
    unknown = only - set(ids)
    assert not unknown, f"not in the catalogue: {sorted(unknown)}"
    os.makedirs(OUT, exist_ok=True)
    had = lengths()
    rows = []
    for sid, cat, zh, en, rel in CATALOG:
        dst = os.path.join(OUT, sid + ".mp3")
        if only and sid not in only:
            assert os.path.exists(dst) and sid in had, f"{sid} isn't made yet: make it too"
            secs = had[sid]
        else:
            src = os.path.join(base, rel)
            assert os.path.exists(src), src
            secs, gain = make(src, dst)
            print(f"{sid:18} {cat:6} {secs:6.2f}s {round(os.path.getsize(dst) / 1024):4d} KB  gain {gain:+.1f} dB  {zh} / {en}", flush=True)
        rows.append((sid, cat, zh, en, secs))
    left = sorted(set(f[:-4] for f in os.listdir(OUT) if f.endswith(".mp3")) - set(ids))
    if left:
        print("files no sound uses any more (take them out):", ", ".join(left))
    # the list in sfx.ts, between its first line and its closing bracket
    ts = open(LIST, encoding="utf-8").read()
    start = ts.index("export const SFX: Sfx[] = [\n") + len("export const SFX: Sfx[] = [\n")
    end = ts.index("];\n", start)
    q = lambda s: json.dumps(s, ensure_ascii=False)
    body = "".join(f"  {{ id: {q(i)}, cat: {q(c)}, zh: {q(z)}, en: {q(e)}, s: {s} }},\n" for i, c, z, e, s in rows)
    open(LIST, "w", encoding="utf-8").write(ts[:start] + body + ts[end:])
    total = sum(os.path.getsize(os.path.join(OUT, i + ".mp3")) for i in ids)
    print(f"{len(rows)} sounds, {total / 1e6:.1f} MB; the list in src/shared/dj/sfx.ts written again")


if __name__ == "__main__":
    main()
