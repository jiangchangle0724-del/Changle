#!/usr/bin/env python3
"""
林波舞's spoken cues, recorded once with MiniMax voices (Steve, 2026-11-19: 「语音提示往前还是往后，根据手机
语言，用 MiniMax 里面的高质量人声」). The lines and their languages are the table in
src/party/limbo/voice.ts (read from there, so the two never drift); the files go to
public/sounds/limbo/<lang>/<line>.mp3, where voice.ts plays them.

Needs a MiniMax API key and group id, from the environment (never in the repository or a chat):

    MINIMAX_API_KEY=… MINIMAX_GROUP_ID=… python3 scripts/limbo_voices.py

Options:
    --list-voices          print the system voices the account can use, and stop
    --zh-voice ID          the Mandarin voice (default female-tianmei)
    --en-voice ID          the English voice (default English_Graceful_Lady)
    --cn                   the mainland endpoint (api.minimaxi.com) instead of api.minimax.io
    --only zh|en           one language
    --dry-run              show what would be asked for, make no requests

Stdlib only. With ffmpeg on the path, silence over 0.15 s at the start and end is trimmed.
"""
import argparse
import base64
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import urllib.error
import urllib.request
from pathlib import Path

SITE = Path(__file__).resolve().parent.parent
VOICE_TS = SITE / "src" / "party" / "limbo" / "voice.ts"
OUT = SITE / "public" / "sounds" / "limbo"
MODEL = "speech-02-hd"
DEFAULT_VOICES = {"zh": "female-tianmei", "en": "English_Graceful_Lady"}
BOOST = {"zh": "Chinese", "en": "English"}


def lines_from_voice_ts():
    """The LINES table in voice.ts: { line: { zh: "…", en: "…" } }."""
    src = VOICE_TS.read_text(encoding="utf-8")
    table = re.search(r"export const LINES[^=]*=\s*\{(.*?)\n\};", src, re.S)
    if not table:
        sys.exit(f"no LINES table in {VOICE_TS}")
    out = {}
    for m in re.finditer(r"^\s*(\w+):\s*\{\s*zh:\s*\"([^\"]+)\",\s*en:\s*\"([^\"]+)\"\s*\}", table.group(1), re.M):
        out[m.group(1)] = {"zh": m.group(2), "en": m.group(3)}
    if not out:
        sys.exit("the LINES table has no lines I can read")
    return out


def api(host, group, key, path, body):
    req = urllib.request.Request(f"https://{host}{path}?GroupId={group}", data=json.dumps(body).encode(), headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        sys.exit(f"MiniMax {path}: HTTP {e.code}: {e.read().decode(errors='replace')[:400]}")


def check(resp, what):
    base = resp.get("base_resp") or {}
    if base.get("status_code", 0) != 0:
        sys.exit(f"MiniMax {what}: {base.get('status_code')} {base.get('status_msg')}")


def list_voices(host, group, key):
    resp = api(host, group, key, "/v1/get_voice", {"voice_type": "system"})
    check(resp, "get_voice")
    for v in resp.get("system_voice") or []:
        print(f"{v.get('voice_id'):40} {v.get('voice_name', '')}  {v.get('description', '')}")


def speak(host, group, key, text, voice, lang):
    body = {
        "model": MODEL,
        "text": text,
        "stream": False,
        "voice_setting": {"voice_id": voice, "speed": 1.05, "vol": 1.4, "pitch": 0},
        "audio_setting": {"sample_rate": 32000, "bitrate": 128000, "format": "mp3", "channel": 1},
        "language_boost": BOOST[lang],
    }
    resp = api(host, group, key, "/v1/t2a_v2", body)
    check(resp, f"t2a_v2 {text!r}")
    audio = (resp.get("data") or {}).get("audio")
    if not audio:
        sys.exit(f"MiniMax gave no audio for {text!r}: {json.dumps(resp)[:300]}")
    try:
        return bytes.fromhex(audio)
    except ValueError:
        return base64.b64decode(audio)


def trim(mp3: bytes) -> bytes:
    """Silence over 0.15 s at either end, off (ffmpeg, when there is one)."""
    ff = shutil.which("ffmpeg")
    if not ff:
        return mp3
    with tempfile.TemporaryDirectory() as d:
        src = Path(d) / "in.mp3"
        dst = Path(d) / "out.mp3"
        src.write_bytes(mp3)
        flt = "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.15,areverse,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.15,areverse,apad=pad_dur=0.08"
        r = subprocess.run([ff, "-v", "error", "-y", "-i", str(src), "-af", flt, "-codec:a", "libmp3lame", "-b:a", "128k", str(dst)], capture_output=True)
        if r.returncode != 0 or not dst.exists():
            print("  (ffmpeg could not trim it: kept as made)", file=sys.stderr)
            return mp3
        return dst.read_bytes()


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--list-voices", action="store_true")
    ap.add_argument("--zh-voice", default=DEFAULT_VOICES["zh"])
    ap.add_argument("--en-voice", default=DEFAULT_VOICES["en"])
    ap.add_argument("--cn", action="store_true")
    ap.add_argument("--only", choices=["zh", "en"])
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()
    host = "api.minimaxi.com" if a.cn else "api.minimax.io"
    lines = lines_from_voice_ts()
    voices = {"zh": a.zh_voice, "en": a.en_voice}
    langs = [a.only] if a.only else ["zh", "en"]
    if a.dry_run:
        for lang in langs:
            for line, text in lines.items():
                print(f"{lang}/{line}.mp3  <- {voices[lang]}: {text[lang]}")
        return
    key = os.environ.get("MINIMAX_API_KEY")
    group = os.environ.get("MINIMAX_GROUP_ID")
    if not key or not group:
        sys.exit("set MINIMAX_API_KEY and MINIMAX_GROUP_ID in the environment (see the top of this file)")
    if a.list_voices:
        list_voices(host, group, key)
        return
    for lang in langs:
        folder = OUT / lang
        folder.mkdir(parents=True, exist_ok=True)
        for line, text in lines.items():
            print(f"{lang}/{line}: {text[lang]} ({voices[lang]})", flush=True)
            mp3 = trim(speak(host, group, key, text[lang], voices[lang], lang))
            (folder / f"{line}.mp3").write_bytes(mp3)
            print(f"  {len(mp3)} bytes")
    (OUT / "README.md").write_text(
        "# 林波舞的语音提示 / Limbo's spoken cues\n\n"
        f"Made by `site/scripts/limbo_voices.py` with MiniMax `{MODEL}` (zh: `{voices['zh']}`, en: `{voices['en']}`). "
        "The lines are the `LINES` table in `site/src/party/limbo/voice.ts`; change a line there and run the script again.\n",
        encoding="utf-8",
    )
    print("done:", OUT)


if __name__ == "__main__":
    main()
