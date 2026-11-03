"""打碟 · DJ Booth, 我的歌 from the host's phone, in browsers: the TV starts the night; Amy (the host)
sends two song files and a broken one from her phone; they go in pieces through the table to the
TV, which listens to each and adds the two (her phone hears how each went: added, can't be played,
already there); a phone that isn't the host's can't send any; Amy switches the night to her songs
from her phone, the TV hands the music over, and she switches back.

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
    return ph.locator(".djp-mine-sent li").all_inner_texts()


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
    for name in ("Amy", "Ben"):
        ph = phone(chrome, name, "zh")
        ph.goto(BASE + f"#/r/{code}", wait_until="load")
        ph.locator(".join-card input").fill(name)
        ph.locator(".join-card button[type=submit]").click()
        ok(until(lambda: ph.locator(".djk-pad").count() == 12, 10000), f"{name}'s phone shows the deck")
        phones.append(ph)
    amy, ben = phones
    ok(until(lambda: amy.locator(".djp-mine").count() == 1, 4000) and ben.locator(".djp-mine").count() == 0, "我的歌 on the host's phone (Amy's), not on Ben's")
    ok("电视上有 0 首" in amy.locator(".djp-mine .djp-host-label").inner_text(), "the TV has none yet")
    ok(amy.locator(".djp-mine .btn-primary").is_disabled(), "nothing to switch to yet")

    # Amy sends two songs and a broken file from her phone
    amy.locator(".djp-mine input[type=file]").set_input_files([ALPHA, BROKEN, BETA])
    ok(until(lambda: "正在传" in (amy.locator(".djp-mine-now").inner_text() if amy.locator(".djp-mine-now").count() else "") or len(sent(amy)) > 0, 8000, 50), "her phone says it's sending")
    ok(until(lambda: len(sent(amy)) == 3, 60000, 250), f"each one's word back from the TV: {sent(amy)}")
    rows = sent(amy)
    ok(any("First Song" in r and "加好了" in r for r in rows) and any("Second Song" in r and "加好了" in r for r in rows), "the two songs: added")
    ok(any("broken.mp3" in r and "放不了" in r for r in rows), "the broken one: can't be played")
    ok(until(lambda: (view(tv) or {}).get("crateN") == 2, 6000), "the room has their names")
    ok(until(lambda: "电视上有 2 首" in amy.locator(".djp-mine .djp-host-label").inner_text(), 4000), "her phone: 2 on the TV")
    tv.locator(".dj-local-btn").click()
    names = tv.locator(".dj-local-list li").all_inner_texts()
    ok(len(names) == 2 and any("First Song" in n and "Alpha" in n and "126 BPM" in n for n in names), f"on the TV, listened to like its own: {names}")
    tv.locator(".dj-local-x").click()
    amy.locator(".djp-mine input[type=file]").set_input_files([ALPHA])
    ok(until(lambda: len(sent(amy)) == 4 and "已经有这首" in sent(amy)[-1], 30000, 250), f"the same song again: the TV has it already ({sent(amy)[-1] if sent(amy) else ''})")
    amy.screenshot(path=os.path.join(OUT, f"mine-{WHICH}-phone-1.png"), full_page=True)

    # a phone that isn't the host's can't send one (straight at the rooms server, as it would have to)
    with open(INTRUDER, "rb") as f:
        b64 = base64.b64encode(f.read()).decode()
    said = ben.evaluate(
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
          await new Promise((ok) => setTimeout(ok, 500));
          ws.close();
          return room;
        }""",
        [f"{ROOMS}/room/{code}/ws", b64],
    )
    ok(said, "a phone that isn't the host's sits down and sends a song's pieces")
    tv.wait_for_timeout(5000)
    ok((view(tv) or {}).get("crateN") == 2, "the TV never gets them")

    # Amy switches the night to her songs from her phone, and back
    amy.locator(".djp-mine .btn-primary").click()
    ok(until(lambda: (view(tv) or {}).get("mine") is True, 4000), "用我的歌放 on her phone: the room has it")
    ok(until(lambda: (view(tv) or {}).get("source") == "local" and tv.evaluate("() => window.__djBooth.source") == "local", 20000, 250), "the TV hands the music to her songs")
    ok(until(lambda: "正在放你的歌" in amy.locator(".djp-mine").inner_text(), 4000), "her phone says so")
    on_song = ((view(tv) or {}).get("onDecks") or {}).get("a" if ((view(tv) or {}).get("deck") or {}).get("fader", 0) < 0.5 else "b") or {}
    ok(on_song.get("t") in ("First Song", "Second Song"), f"one of hers on the air ({on_song.get('t')})")
    tv.wait_for_timeout(1500)
    st = tv.evaluate("() => window.__djBooth.stats()")
    ok(st["state"] == "playing" and st["stalls"] == 0, f"playing, no gap ({st})")
    tv.screenshot(path=os.path.join(OUT, f"mine-{WHICH}-tv-1.png"))
    amy.screenshot(path=os.path.join(OUT, f"mine-{WHICH}-phone-2.png"), full_page=True)
    amy.locator(".djp-mine .btn-ghost").last.click()
    ok(until(lambda: (view(tv) or {}).get("source") == "fake" and tv.evaluate("() => window.__djBooth.source") == "fake", 10000), "换回试音版 DJ on her phone: the stand-in plays again")
    tv.locator(".dj-local-btn").click()
    ok(tv.locator(".dj-local-go .tv-btn-main").count() == 1, "and the TV's own switch agrees")

    # the TV opened again: the songs went with the page (they were in its memory), and the room's names for them
    tv.reload(wait_until="load")
    ok(until(lambda: (view(tv) or {}).get("crateN") == 0, 15000, 250), "the TV opened again: its songs went with the page, and so do the room's names for them")
    ok(until(lambda: "电视上有 0 首" in amy.locator(".djp-mine .djp-host-label").inner_text(), 4000), "her phone: none on the TV")

    bad = [e for e in errs + [x for ph in phones for x in ph._errs] if "WebSocket" not in e and "favicon" not in e]
    ok(not bad, f"no errors {bad[:3]}")
    br.close()
    if chrome is not br:
        chrome.close()

print("\nall passed" if not fails else f"\n{len(fails)} failed: {fails}")
sys.exit(1 if fails else 0)
