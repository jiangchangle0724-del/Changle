"""打碟 · DJ Booth, a night of the host's own songs, in browsers: the TV starts the night, the host
adds three song files on it (made up here: a kick, a snare, hats, a bass in the loud part, at 128,
124 and 100 BPM), the DJ hears each one's tempo; the host switches to them, the phones see the
song on the air and ask for one by name, the room switches into it by itself (点歌模式, the
booth's only way since Nov 12; held with 暂停 till the speaker has it ready) and its loud part lands
on the switch's bar, the pads still land on the beat, and as a song ends the DJ goes into the next.

Needs the two local servers (site/README.md). usage: python3 scripts/dj_local_check.py [chromium|webkit]
"""
import math, os, struct, sys, tempfile, time, wave
from playwright.sync_api import sync_playwright

sys.path.insert(0, os.path.dirname(__file__))
from party_test import until, ok, fails, phone, view  # noqa: E402
from dj_tube import key  # noqa: E402

BASE = "http://127.0.0.1:5173/"
WHICH = next((a for a in sys.argv[1:] if a in ("chromium", "webkit")), "chromium")
OUT = os.environ.get("SHOTS", os.path.join(tempfile.gettempdir(), "dj-local"))
os.makedirs(OUT, exist_ok=True)

try:
    import numpy as np
except ImportError:  # pragma: no cover
    sys.exit("needs numpy to make the songs")


def make_song(path, bpm, first, bars, loud_from, rate=44100, seed=1):
    """A made-up song: a kick (heavier on each bar's first beat), a snare on 2 and 4, hats, a bass in the loud part."""
    rng = np.random.default_rng(seed)
    beat = 60 / bpm
    n = int((first + bars * 4 * beat + 2) * rate)
    x = np.zeros(n, dtype=np.float32)

    def add(t, sig):
        s0 = int(t * rate)
        m = min(len(sig), n - s0)
        if m > 0:
            x[s0 : s0 + m] += sig[:m]

    u = np.arange(int(0.18 * rate)) / rate
    kick = np.sin(2 * np.pi * (55 + 90 * np.exp(-u * 30)) * u) * np.exp(-u * 18)
    us = np.arange(int(0.12 * rate)) / rate
    snare = rng.uniform(-1, 1, len(us)) * np.exp(-us * 30)
    uh = np.arange(int(0.03 * rate)) / rate
    hat = rng.uniform(-1, 1, len(uh)) * np.exp(-uh * 120)
    ub = np.arange(int(beat * 0.9 * rate)) / rate
    bass = np.sin(2 * np.pi * 49 * ub) * np.exp(-ub * 3)
    for k in range(bars * 4):
        t = first + k * beat
        in_bar, bar = k % 4, k // 4
        loud = bar >= loud_from
        add(t, kick * (1 if in_bar == 0 else 0.7) * (1 if loud else 0.5))
        if in_bar in (1, 3):
            add(t, snare * (0.4 if loud else 0.2))
        add(t, hat * 0.08)
        add(t + beat / 2, hat * 0.08)
        if loud:
            add(t, bass * 0.25)
    x /= max(1e-9, np.abs(x).max()) * 1.1
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes((x * 32767).astype("<i2").tobytes())


def deck(pg):
    return (view(pg) or {}).get("deck") or {}


def log(tv):
    return tv.evaluate(
        """() => { const d = window.__djBooth && window.__djBooth.deck(); if (!d) return null;
        return { now: d.now, log: d.log.map(e => ({ k: e.k, at: e.at, beat: e.beat, want: d.beatAt(e.beat) })) } }"""
    )


def on_beat(e):
    return e["want"] is not None and abs(e["beat"] - round(e["beat"])) < 1e-6 and abs(e["at"] - e["want"]) < 0.001


songs_dir = tempfile.mkdtemp(prefix="dj-songs-")
SONGS = [
    ("Alpha - First Song.wav", 128, 0.4, 44, 12),
    ("Beta - Second Song.wav", 124, 0.25, 48, 16),
    ("Gamma - Third Song.wav", 100, 0.6, 36, 8),
]
for i, (name, bpm, first, bars, loud) in enumerate(SONGS):
    make_song(os.path.join(songs_dir, name), bpm, first, bars, loud, seed=i + 1)

with sync_playwright() as p:
    br = getattr(p, WHICH).launch()
    chrome = br if WHICH == "chromium" else p.chromium.launch()
    tv = br.new_context(viewport={"width": 1600, "height": 900}).new_page()
    errs = []
    tv.on("pageerror", lambda e: errs.append(str(e)))
    tv.on("console", lambda m: errs.append(m.text) if m.type == "error" and "WebSocket" not in m.text else None)
    tv.goto(BASE + "dj", wait_until="load")
    code = until(lambda: tv.locator(".dj-join-code").inner_text().strip(), 15000)
    tv.locator(".dj-start-btn").click()
    ok(until(lambda: (view(tv) or {}).get("phase") == "warm", 15000), f"{WHICH}: the night starts on the stand-in ({code})")

    # the host's songs, added on the TV
    tv.locator(".dj-local-btn").click()
    ok(until(lambda: tv.locator(".dj-local").count() == 1, 3000), "the TV's 我的歌 opens")
    tv.locator(".dj-local input[type=file]").first.set_input_files([os.path.join(songs_dir, s[0]) for s in SONGS])
    ok(until(lambda: tv.locator(".dj-local-list li").count() == 3, 60000, 250), "three song files added: each listened to")
    rows = tv.locator(".dj-local-list li").all_inner_texts()
    ok(all(any(f"{b} BPM" in r for r in rows) for b in (128, 124, 100)), f"each one's tempo heard: {rows}")
    ok(any("First Song" in r and "Alpha" in r for r in rows), "named from the file name (artist - title)")
    tv.screenshot(path=os.path.join(OUT, f"local-{WHICH}-tv-1-songs.png"))
    ok(until(lambda: (view(tv) or {}).get("crateN") == 3, 6000), "the room has their names")

    phones = []
    for name in ("Amy", "Ben"):
        ph = phone(chrome, name, "zh")
        ph.goto(BASE + f"#/r/{code}", wait_until="load")
        ph.locator(".join-card input").fill(name)
        ph.locator(".join-card button[type=submit]").click()
        ok(until(lambda: ph.locator(".djk-player").count() == 1, 10000), f"{name}'s phone shows the player")
        phones.append(ph)
    amy, ben = phones

    # the host switches to them
    tv.locator(".dj-local-go .tv-btn-main").click()
    ok(until(lambda: (view(tv) or {}).get("source") == "local" and deck(tv).get("local"), 8000), "用我的歌放: the room plays the host's songs")
    ok(until(lambda: tv.evaluate("() => window.__djBooth.source") == "local", 15000), "the TV hands the speaker to the local DJ once the song on the air is ready")
    on_song = (view(tv) or {}).get("onDecks", {}).get("a") or {}
    ok(until(lambda: on_song.get("t", "~") in amy.locator(".djk-player-title").inner_text(), 4000), f"the phones' player says which song is on ({on_song.get('t')})")
    tv.locator(".dj-local-x").click()
    ok(until(lambda: tv.evaluate("() => window.__djBooth.stats()")["state"] == "playing", 8000), "the music plays")
    tv.wait_for_timeout(1500)
    st = tv.evaluate("() => window.__djBooth.stats()")
    ok(st["state"] == "playing", f"no gap at the hand-over ({st})")

    # pads on the song's own beat
    amy.locator(".djk-pad.is-echo").click()
    ben.locator(".djk-pad.is-horn").click()
    ok(until(lambda: len([e for e in (log(tv) or {}).get("log", []) if e["k"] in ("echo", "horn")]) >= 2, 4000), "pads play")
    pads = [e for e in log(tv)["log"] if e["k"] in ("echo", "horn")]
    ok(all(on_beat(e) for e in pads), f"on the song's beat, to the millisecond ({[round(e['beat'], 3) for e in pads]})")

    # Ben asks for one by name (Amy holds the room, so it waits up next while the speaker gets it ready)
    key(amy, 1).click()
    ok(until(lambda: deck(tv).get("paused", 0) > 0, 4000), "Amy holds the room (暂停)")
    want = next(s for s in ("Third Song", "Second Song", "First Song") if s != on_song.get("t") and s != ((view(tv) or {}).get("onDecks", {}).get("b") or {}).get("t"))
    ben.locator(".djk-req-input").fill(want.split()[0])
    ok(until(lambda: ben.locator(".djk-req-hit").filter(has_text=want).count() >= 1, 8000, 100), f"Ben types: the host's songs come up ({want})")
    ben.locator(".djk-req-hit").filter(has_text=want).first.click()
    ben.locator(".djk-req-send").click()
    ok(until(lambda: ((deck(tv).get("up") or {}).get("text") == want), 4000), "it's up next")
    off = "b" if deck(tv)["fader"] < 0.5 else "a"
    ok(until(lambda: (deck(tv).get("songs") or {}).get(off) == deck(tv)["up"]["local"], 3000), f"on the deck off the air ({off.upper()})")
    ok(until(lambda: (deck(tv).get("sounding") or {}).get("s" + off) == deck(tv)["up"]["local"], 15000, 200), "the speaker has it ready")
    tv.screenshot(path=os.path.join(OUT, f"local-{WHICH}-tv-2-up.png"))
    ben.screenshot(path=os.path.join(OUT, f"local-{WHICH}-phone-1.png"), full_page=True)

    key(ben, 1).click()
    dr = until(lambda: deck(tv).get("drop"), 20000, 50)
    ok(bool(dr) and dr["to"] == off and dr.get("quiet") is True, "Ben carries on (播放): the switch into it, by itself")
    ok(until(lambda: (deck(tv).get("last") or {}).get("bar") == dr["bar"], max(0, dr["at"] - time.time() * 1000) + 5000), "it lands")
    ok((deck(tv).get("now") or {}).get("text") == want, "the song asked for is on the air")
    xf = tv.evaluate("() => window.__localDj.sp.node.parameters.get('xfade').value")
    ok(abs(xf - (1 if off == "b" else 0)) < 0.01, f"and in the speakers: the player's crossfader on deck {off.upper()} ({xf:.2f})")
    # where the song is, just after its drop: its loud part (the cue), a second or so in
    got = tv.evaluate("() => window.__localDj.heardAt()")
    cue = tv.evaluate("(id) => window.__localDj.songs.get(id).beat.cue", got["id"])
    landed = [e for e in log(tv)["log"] if e["k"] == "drop"][-1]
    ok(got["id"] == deck(tv)["now"]["local"] and cue - 0.1 <= got["at"] <= cue + 6, f"the drop landed on its loud part ({got['at']:.2f} s in, its loud part at {cue:.2f} s)")
    # (its beat as the speaker counted it when it landed: a song too far off the beat brings its own bars right after)
    ok(abs(landed["beat"] - dr["bar"] * 4) < 1e-6, f"on the drop's bar exactly (beat {round(landed['beat'], 3)} = bar {dr['bar']})")
    tv.screenshot(path=os.path.join(OUT, f"local-{WHICH}-tv-3-dropped.png"))

    # as the song ends, the DJ drops into the next by itself
    playing_id = deck(tv)["now"]["local"]
    ok(until(lambda: (deck(tv).get("ending") == playing_id) or ((deck(tv).get("last") or {}).get("auto") and (deck(tv).get("songs") or {}).get("a" if deck(tv)["fader"] < 0.5 else "b") != playing_id), 120000, 500), "the song on the air nearly over: the room hears it")
    ok(until(lambda: (deck(tv).get("last") or {}).get("auto") is True and (deck(tv).get("last") or {}).get("bar") != dr["bar"], 60000, 500), "the DJ goes into the next song by itself")
    st = tv.evaluate("() => window.__djBooth.stats()")
    ok(st["state"] == "playing" and st["stalls"] == 0, f"the music never stopped ({st})")

    # back to the stand-in
    tv.locator(".dj-local-btn").click()
    tv.locator(".dj-local-go .tv-btn").first.click()
    ok(until(lambda: (view(tv) or {}).get("source") == "fake" and tv.evaluate("() => window.__djBooth.source") == "fake", 10000), "换回试音版 DJ: the stand-in plays again")
    ok(until(lambda: "BPM" in amy.locator(".djk-player-title").inner_text() and on_song.get("t", "~") not in amy.locator(".djk-player-title").inner_text(), 4000), f"and the phones' player says what it plays ({amy.locator('.djk-player-title').inner_text()!r})")

    bad = [e for e in errs + [x for ph in phones for x in ph._errs] if "WebSocket" not in e and "favicon" not in e]
    ok(not bad, f"no errors {bad[:3]}")
    br.close()
    if chrome is not br:
        chrome.close()

print("\nall passed" if not fails else f"\n{len(fails)} failed: {fails}")
sys.exit(1 if fails else 0)
