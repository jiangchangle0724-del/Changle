"""打碟 · DJ Booth, songs from the phones (Steve on Nov 13: "要允许所有玩家都可以上传自己的歌上去，不仅是
host"; before, 我的歌 on the host's phone alone), in browsers: the TV starts the night; Ben (not the
host) sends two song files and a broken one from his phone; they go in pieces through the table to
the TV, which listens to each and adds the two (his phone hears how each went: on the playlist,
can't be played); they're his on the 歌单 at once, by name, and the first plays whole on the TV in
its own sound (the DJ quiet under it, a card saying whose); 暂停 stops it where it is, 播放 carries it
on from there, 切歌 brings his second; Amy sends the same file: the TV had it, it's on her 歌单 too;
someone who sits down and sends one as someone else gets it as their own; the host's phone has no
我的歌 card; the TV opened again loses the files, and the songs from them leave the 歌单.

Needs the two local servers (site/README.md), with DEV_LYRIA_ANYONE off.
usage: python3 scripts/dj_mine_check.py [chromium|webkit]   (the TV's browser; the phones are Chromium)
"""
import base64, os, struct, sys, tempfile, time, wave
from playwright.sync_api import sync_playwright

sys.path.insert(0, os.path.dirname(__file__))
from party_test import until, ok, fails, phone, view  # noqa: E402

BASE = "http://127.0.0.1:5173/"
ROOMS = "ws://127.0.0.1:8787"
WHICH = next((a for a in sys.argv[1:] if a in ("chromium", "webkit")), "chromium")
OUT = os.environ.get("SHOTS", os.path.join(tempfile.gettempdir(), "dj-mine"))
os.makedirs(OUT, exist_ok=True)

try:
    import numpy as np
except ImportError:  # pragma: no cover
    sys.exit("needs numpy to make the songs")


def make_song(path, bpm, seconds=70, rate=44100, seed=1):
    """A made-up song: a kick on every beat (heavier on the bar's first), hats, a bass from halfway."""
    rng = np.random.default_rng(seed)
    n = int(seconds * rate)
    x = np.zeros(n)
    beat = 60 / bpm
    u = np.arange(int(0.18 * rate)) / rate
    kick = np.sin(2 * np.pi * (55 + 90 * np.exp(-u * 30)) * u) * np.exp(-u * 18)
    uh = np.arange(int(0.03 * rate)) / rate
    hat = rng.uniform(-1, 1, len(uh)) * np.exp(-uh * 120)
    k = 0
    while 0.3 + k * beat < seconds - 0.5:
        s0 = int((0.3 + k * beat) * rate)
        x[s0 : s0 + len(kick)] += kick[: max(0, min(len(kick), n - s0))] * (1 if k % 4 == 0 else 0.6)
        h0 = int((0.3 + (k + 0.5) * beat) * rate)
        x[h0 : h0 + len(hat)] += hat[: max(0, min(len(hat), n - h0))] * 0.1
        k += 1
    x[n // 2 :] += np.sin(2 * np.pi * 49 * np.arange(n - n // 2) / rate) * 0.15
    x /= np.abs(x).max() * 1.1
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes((x * 32767).astype("<i2").tobytes())


folder = tempfile.mkdtemp(prefix="dj-mine-")
ALPHA = os.path.join(folder, "Alpha - First Song.wav")
BETA = os.path.join(folder, "Beta - Second Song.wav")
BROKEN = os.path.join(folder, "broken.mp3")
make_song(ALPHA, 126, seed=1)
make_song(BETA, 122, seed=2)
with open(BROKEN, "wb") as f:
    f.write(os.urandom(300_000))
INTRUDER = os.path.join(folder, "Gamma - Not Yours.wav")
make_song(INTRUDER, 124, seconds=50, seed=3)


def sent(ph):
    return ph.locator(".djk-send-done li").all_inner_texts()


def text(pg, sel):
    loc = pg.locator(sel)
    return loc.first.inner_text() if loc.count() else ""


def deck(pg):
    return (view(pg) or {}).get("deck") or {}


def song(tv):
    return tv.evaluate("() => window.__phoneSong || null") or {}


def key(ph, i):
    return ph.locator(".djk-key").nth(i)


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

    phones = []
    for name in ("Amy", "Ben", "Cat"):
        ph = phone(chrome, name, "zh")
        ph.goto(BASE + f"#/r/{code}", wait_until="load")
        ph.locator(".join-card input").fill(name)
        ph.locator(".join-card button[type=submit]").click()
        ok(until(lambda: ph.locator(".djk-cat").count() == 9, 10000), f"{name}'s phone shows the booth")
        phones.append(ph)
    amy, ben, cat = phones
    pid = {n: me for n, me in zip(("Amy", "Ben", "Cat"), [x.evaluate("() => window.__room && window.__room.you") for x in phones])}
    ok(amy.locator(".djp-mine").count() == 0, "the host's phone has no 我的歌 card any more")
    ok(all(ph.locator(".djk-send button").count() == 1 and "从手机传歌" in ph.locator(".djk-send button").inner_text() for ph in phones), "every phone can send songs from itself, under the song box")

    # Ben sends two songs and a broken file from his phone
    ben.locator(".djk-send input[type=file]").set_input_files([ALPHA, BROKEN, BETA])
    ok(until(lambda: "正在传" in text(ben, ".djk-send-now") or len(sent(ben)) > 0, 8000, 50), "his phone says it's sending")
    ok(until(lambda: len(sent(ben)) == 3, 60000, 250), f"each one's word back from the TV: {sent(ben)}")
    rows = sent(ben)
    ok(any("First Song" in r and "加进歌单了" in r for r in rows) and any("Second Song" in r and "加进歌单了" in r for r in rows), "the two songs: on the playlist")
    ok(any("broken.mp3" in r and "放不了" in r for r in rows), "the broken one: can't be played")
    ok(until(lambda: (view(tv) or {}).get("crateN") == 2, 6000), "the room has their names")
    ben.screenshot(path=os.path.join(OUT, f"mine-{WHICH}-phone-1.png"), full_page=True)

    # his on the 歌单 at once; the first plays whole on the TV, in its own sound
    def theirs():
        d = deck(tv)
        return [r for r in ([d.get("song") and d.get("now")] + [d.get("up")] + (d.get("reqs") or [])) if r and r.get("local")]
    ok(until(lambda: len(theirs()) == 2 and all(r["by"] == pid["Ben"] for r in theirs()), 8000), f"both on the 歌单 as Ben's ({[(r.get('text'), r.get('by')) for r in theirs()]})")
    ok(until(lambda: (deck(tv).get("song") or {}).get("local") and song(tv).get("playing"), 30000, 200), f"the first plays whole on the TV ({deck(tv).get('song')}, {song(tv)})")
    first = deck(tv)["song"]
    t0 = time.time()
    ok(first["by"] == pid["Ben"] and not first.get("yt") and song(tv).get("local") == first["local"], "his song file, not a video")
    ok(until(lambda: tv.evaluate("() => window.__fakeDj.speaker.talkFade.gain.value") < 0.05, 4000), "the DJ quiet under it")
    ok(until(lambda: ("Ben 传的歌" in text(tv, ".dj-file") or "Ben's song" in text(tv, ".dj-file")) and "First Song" in text(tv, ".dj-file"), 4000), f"a card on the TV says whose and what ({text(tv, '.dj-file')!r})")
    ok(tv.locator(".dj-tube.is-on").count() == 0, "and no video")
    ok(until(lambda: "First Song" in text(cat, ".djk-player-title") and "Ben" in text(cat, ".djk-player-by"), 4000), f"Cat's player names it ({text(cat, '.djk-player-now')!r})")
    ok(cat.locator(".djk-player .btn-ghost").count() == 0, "no video to put over the whole TV")
    tv.screenshot(path=os.path.join(OUT, f"mine-{WHICH}-tv-1.png"))

    # 暂停 and 播放: stopped where it is, carried on from there
    tv.wait_for_timeout(2500)
    key(cat, 1).click()
    ok(until(lambda: deck(tv).get("paused", 0) > 0 and song(tv).get("playing") is False, 4000), f"Cat pauses: the song stops ({song(tv)})")
    t_held = time.time()
    tv.wait_for_timeout(1500)
    key(cat, 1).click()
    ok(until(lambda: song(tv).get("playing") is True, 4000), "播放: it carries on")
    held = time.time() - t_held
    played = time.time() - t0 - held
    ok(2 < song(tv).get("from", 0) < played + 0.5, f"from where it was, not its start, the pause not counted ({song(tv).get('from', 0):.1f} s in, {played:.1f} s played, {held:.1f} s held)")
    ok(tv.evaluate("() => window.__fakeDj.speaker.talkFade.gain.value") < 0.05, "the DJ still quiet under it")

    # 切歌: his second
    tv.wait_for_timeout(1600)
    key(amy, 2).click()
    ok(until(lambda: (deck(tv).get("song") or {}).get("local") not in (None, first["local"]) and song(tv).get("playing") and song(tv).get("local") != first["local"], 20000, 200), f"Amy skips it: Ben's second plays ({deck(tv).get('song')})")
    ok(until(lambda: "Second Song" in text(tv, ".dj-file"), 4000), "the card says so")

    # the same file from Amy's phone: the TV had it, it's hers on the 歌单 too
    amy.locator(".djk-send input[type=file]").set_input_files([ALPHA])
    ok(until(lambda: len(sent(amy)) == 1 and "已经有这首" in sent(amy)[0], 30000, 250), f"Amy sends the same song: the TV had it ({sent(amy)})")
    ok(until(lambda: any(r["by"] == pid["Amy"] and r.get("text") == "First Song" for r in theirs()), 4000), "on the 歌单 as hers")

    # someone who sits down and sends one as someone else (straight at the rooms server): it's theirs
    with open(INTRUDER, "rb") as f:
        b64 = base64.b64encode(f.read()).decode()
    said = cat.evaluate(
        """async ([url, b64]) => {
          const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
          const ws = new WebSocket(url);
          ws.binaryType = "arraybuffer";
          await new Promise((ok) => (ws.onopen = ok));
          let room = false;
          ws.onmessage = (e) => { if (typeof e.data === "string" && JSON.parse(e.data).t === "room") room = true; };
          ws.send(JSON.stringify({ t: "hello", pid: "pintruder01", name: "Eve" }));
          for (let i = 0; i < 50 && !room; i++) await new Promise((ok) => setTimeout(ok, 100));
          const P = 256 * 1024, n = Math.ceil(bytes.length / P);
          for (let i = 0; i < n; i++) {
            const head = new TextEncoder().encode(JSON.stringify({ id: "evil0001", i, n, size: bytes.length, name: "Gamma - Not Yours.wav", type: "audio/wav", by: "p-host-spoof" }));
            const part = bytes.subarray(i * P, Math.min(bytes.length, (i + 1) * P));
            const out = new Uint8Array(8 + head.length + part.length);
            out.set([0x53, 0x4f, 0x4e, 0x47]); new DataView(out.buffer).setUint32(4, head.length, true); out.set(head, 8); out.set(part, 8 + head.length);
            ws.send(out.buffer);
          }
          for (let i = 0; i < 80; i++) await new Promise((ok) => setTimeout(ok, 100));
          ws.close();
          return room;
        }""",
        [f"{ROOMS}/room/{code}/ws", b64],
    )
    ok(said, "someone sits down and sends a song's pieces, saying they're someone else's")
    ok(until(lambda: (view(tv) or {}).get("crateN") == 3, 10000), "the TV gets it")
    ok(until(lambda: any(r.get("text") == "Not Yours" and r["by"] == "pintruder01" for r in theirs()), 4000), "as the sender's own, never the name they gave")
    ok(not any(r["by"] == "p-host-spoof" for r in theirs()), "nobody else's")

    # the TV opened again: the files went with the page, and the songs from them leave the 歌单
    tv.reload(wait_until="load")
    ok(until(lambda: (view(tv) or {}).get("crateN") == 0, 15000, 250), "the TV opened again: its files went with the page, and so do the room's names for them")
    ok(until(lambda: not theirs(), 4000), f"and the songs from them leave the 歌单 ({theirs()})")

    bad = [e for e in errs + [x for ph in phones for x in ph._errs] if "WebSocket" not in e and "favicon" not in e]
    ok(not bad, f"no errors {bad[:3]}")
    br.close()
    if chrome is not br:
        chrome.close()

print("\nall passed" if not fails else f"\n{len(fails)} failed: {fails}")
sys.exit(1 if fails else 0)
