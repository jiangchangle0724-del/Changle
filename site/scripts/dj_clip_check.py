"""打碟 · DJ Booth, a song asked for played for real, in browsers: the TV starts the night on the
stand-in; Amy asks for 晴天 from the song list, and the TV fetches its clip (Apple's preview server
is answered here with a made-up song: 124 BPM, a kick on every beat, a 3 kHz tone through it, so
the clip can be heard in the speaker's output); the table drops into it: the clip starts on the
drop's bar, on the night's beat over the deck's drums alone, the phone names the song and links
the whole of it, the TV credits Apple. Then Ben asks for a song that isn't on the list: his phone
finds it on Apple (answered here: 100 BPM, a 5 kHz tone), the others don't read its name, and it
plays alone at its own speed. A name found nowhere gets the remix alone.

Needs the two local servers (site/README.md), with DEV_LYRIA_ANYONE off.
usage: python3 scripts/dj_clip_check.py [chromium|webkit]
"""
import io, json, math, os, sys, tempfile, time, wave
from playwright.sync_api import sync_playwright

sys.path.insert(0, os.path.dirname(__file__))
from party_test import until, ok, fails, phone, view  # noqa: E402

BASE = "http://127.0.0.1:5173/"
WHICH = next((a for a in sys.argv[1:] if a in ("chromium", "webkit")), "chromium")
OUT = os.environ.get("SHOTS", os.path.join(tempfile.gettempdir(), "dj-clip"))
os.makedirs(OUT, exist_ok=True)
PRE = "https://audio-ssl.itunes.apple.com/itunes-assets/"

try:
    import numpy as np
except ImportError:  # pragma: no cover
    sys.exit("needs numpy to make the clips")


def make_clip(bpm, tone, seconds=30.0, first=0.35, rate=44100, seed=1):
    """A made-up 30-second clip as WAV bytes: a kick on every beat (heavier on each bar's first), hats, a steady tone."""
    rng = np.random.default_rng(seed)
    n = int(seconds * rate)
    x = np.zeros(n, dtype=np.float64)
    beat = 60 / bpm
    u = np.arange(int(0.18 * rate)) / rate
    kick = np.sin(2 * np.pi * (55 + 90 * np.exp(-u * 30)) * u) * np.exp(-u * 18)
    uh = np.arange(int(0.03 * rate)) / rate
    hat = rng.uniform(-1, 1, len(uh)) * np.exp(-uh * 120)
    k = 0
    while first + k * beat < seconds:
        s0 = int((first + k * beat) * rate)
        m = min(len(kick), n - s0)
        x[s0 : s0 + m] += kick[:m] * (1 if k % 4 == 0 else 0.6)
        h0 = int((first + (k + 0.5) * beat) * rate)
        mh = max(0, min(len(hat), n - h0))
        x[h0 : h0 + mh] += hat[:mh] * 0.1
        k += 1
    x += np.sin(2 * np.pi * tone * np.arange(n) / rate) * 0.25
    # Apple's clips fade in and out
    f = int(0.4 * rate)
    x[:f] *= np.linspace(0, 1, f)
    x[-f:] *= np.linspace(1, 0, f)
    x /= np.abs(x).max() * 1.1
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes((x * 32767).astype("<i2").tobytes())
    return buf.getvalue()


LISTED = make_clip(124, 3000)
FOUND = make_clip(100, 5000, seed=2)
served = []


def apple_audio(route):
    url = route.request.url
    served.append(url)
    body = FOUND if "made-up" in url else LISTED
    route.fulfill(status=200, body=body, headers={"Content-Type": "audio/wav", "Access-Control-Allow-Origin": "*"})


def apple_search(route):
    url = route.request.url
    found = "made" in url.lower()
    results = (
        [
            {
                "kind": "song",
                "trackId": 990001,
                "trackName": "Made Up Song (Radio Edit)",
                "artistName": "Nobody Real",
                "previewUrl": PRE + "AudioPreview9/v4/made-up/mzaf_990001.plus.aac.p.m4a",
            }
        ]
        if found
        else []
    )
    route.fulfill(status=200, body=json.dumps({"resultCount": len(results), "results": results}), headers={"Content-Type": "application/json", "Access-Control-Allow-Origin": "*"})


def deck(pg):
    return (view(pg) or {}).get("deck") or {}


def fake(tv, expr):
    return tv.evaluate(f"() => {{ const f = window.__fakeDj; return {expr}; }}")


def loud_db(tv, secs=3.0):
    """The speaker's output over `secs`, as RMS dBFS (sampled from its analyser)."""
    return tv.evaluate(
        """(secs) => new Promise((done) => { const a = window.__fakeDj.speaker.analyser; const b = new Float32Array(a.fftSize);
        let sum = 0, n = 0; const end = performance.now() + secs * 1000;
        const take = () => { a.getFloatTimeDomainData(b); for (const v of b) { sum += v * v; n++; }
          if (performance.now() < end) setTimeout(take, 40); else done(10 * Math.log10(sum / n)); }; take(); })""",
        secs,
    )


def tone_db(tv, hz):
    """How far the tone at `hz` stands above the bins around it in the speaker's output now (dB)."""
    return tv.evaluate(
        """(hz) => { const a = window.__fakeDj.speaker.analyser; const b = new Float32Array(a.frequencyBinCount);
        a.getFloatFrequencyData(b); const i = Math.round(hz / (a.context.sampleRate / a.fftSize));
        const near = [...b.slice(i - 12, i - 4), ...b.slice(i + 5, i + 13)].sort((x, y) => x - y);
        return Math.max(b[i - 1], b[i], b[i + 1]) - near[Math.floor(near.length / 2)]; }""",
        hz,
    )


def charge(phones, tv, secs=40):
    end = time.time() + secs
    while time.time() < end and not deck(tv).get("drop"):
        for ph in phones:
            ph.evaluate("() => { const b = document.querySelector('.djk-charge'); if (b) for (let i = 0; i < 3; i++) b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); }")
        phones[0].wait_for_timeout(150)
    return deck(tv).get("drop")


def drop_on_cue(ph, tv, dr):
    ph.evaluate(
        """(when) => { setTimeout(() => { const b = document.querySelector('.djk-drop'); if (b) b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, isPrimary: true })); }, Math.max(0, when - Date.now())); }""",
        dr["cue"] + 15,
    )
    return until(lambda: (deck(tv).get("last") or {}).get("bar") == dr["bar"], max(0, dr["at"] - time.time() * 1000) + 5000)


def heard_after(tv, beat, secs):
    """Wait until the speakers have sounded `secs` past the stream's beat `beat`."""
    at = tv.evaluate("(b) => window.__djBooth.deck().beatAt(b)", beat)
    return until(lambda: tv.evaluate("() => window.__djBooth.deck().now") > at + secs, (secs + 10) * 1000, 100)


with sync_playwright() as p:
    br = getattr(p, WHICH).launch()
    chrome = br if WHICH == "chromium" else p.chromium.launch()
    tv = br.new_context(viewport={"width": 1600, "height": 900}).new_page()
    tv.route(PRE + "**", apple_audio)
    errs = []
    tv.on("pageerror", lambda e: errs.append(str(e)))
    tv.on("console", lambda m: errs.append(m.text) if m.type == "error" and "WebSocket" not in m.text else None)
    tv.goto(BASE + "dj", wait_until="load")
    code = until(lambda: tv.locator(".dj-join-code").inner_text().strip(), 15000)
    tv.locator(".dj-start-btn").click()
    ok(until(lambda: (view(tv) or {}).get("phase") == "warm", 15000), f"{WHICH}: the night starts on the stand-in ({code})")
    ok(until(lambda: tv.evaluate("() => window.__djBooth.stats()") and tv.evaluate("() => window.__djBooth.stats()")["state"] == "playing", 15000), "the music plays")

    phones = []
    for name in ("Amy", "Ben", "Cat"):
        ph = phone(chrome, name, "zh")
        ph.route("https://itunes.apple.com/search**", apple_search)
        ph.goto(BASE + f"#/r/{code}", wait_until="load")
        ph.locator(".join-card input").fill(name)
        ph.locator(".join-card button[type=submit]").click()
        ok(until(lambda: ph.locator(".djk-pad").count() == 8, 10000), f"{name}'s phone shows the deck")
        phones.append(ph)
    amy, ben, cat = phones
    ok("30 秒原曲" in amy.locator(".djk-req-note").inner_text(), f"the phone says what asking does: {amy.locator('.djk-req-note').inner_text()}")

    # Amy asks for 晴天 from the song list
    tone_before = tone_db(tv, 3000)
    night_db = loud_db(tv)
    amy.locator(".djk-req-input").fill("晴天")
    ok(until(lambda: amy.locator(".djk-req-hit").filter(has_text="周杰伦").count() >= 1, 8000, 100), "Amy types 晴天: Jay Chou's comes up from the song list")
    amy.locator(".djk-req-hit").filter(has_text="周杰伦").first.click()
    amy.locator(".djk-req-send").click()
    ok(until(lambda: (deck(tv).get("up") or {}).get("text") == "晴天", 4000), "it's up next")
    up = deck(tv)["up"]
    off = "b" if deck(tv)["fader"] < 0.5 else "a"
    ok(bool(up.get("p")) and up.get("song"), f"with its clip: the list's preview ({up.get('p', '')[:40]}…)")
    ok(until(lambda: fake(tv, f"!!f.clips.{off}.clip"), 10000, 200), f"the TV fetched and listened to it, on the deck off the air ({off.upper()})")
    ok(any("mzaf_" in u for u in served), "from Apple's preview server")
    clip = fake(tv, f"(c => ({{ bpm: c.beat && c.beat.bpm, start: c.start, end: c.end }}))(f.clips.{off}.clip)")
    ok(clip["bpm"] and abs(clip["bpm"] - 124) < 0.1, f"its beat heard: {clip}")
    ok(until(lambda: fake(tv, f"[...f.made.keys()].some(k => k.endsWith('!d') && k.startsWith('{up['style']}:'))"), 30000, 250), "the deck's drums alone recorded for it")
    ok(until(lambda: (deck(tv).get("sounding") or {}).get(off) == up["style"], 30000, 250), "the deck plays its style")
    tv.screenshot(path=os.path.join(OUT, f"clip-{WHICH}-tv-1-up.png"))

    dr = charge(phones, tv)
    ok(bool(dr) and dr["to"] == off, "everyone builds it up: the drop goes into it")
    plays = fake(tv, f"f.clips.{off}.playing")
    want_at = fake(tv, f"f.beatFrame({dr['bar'] * 4})")
    ok(len(plays) == 1 and abs(plays[0]["at"] - want_at) < 1 and plays[0]["bed"], f"the clip is set to start on the drop's bar, over the drums alone ({plays[0]['at'] if plays else None} = {want_at})")
    ok(drop_on_cue(ben, tv, dr), "it lands")
    ok((deck(tv).get("now") or {}).get("text") == "晴天", "晴天 is on the air")
    ok(abs(plays[0]["step"] - 125 / clip["bpm"]) < 1e-9, f"a little faster to fall on the night's beat ({plays[0]['step']:.4f})")
    ok(heard_after(tv, dr["bar"] * 4, 2.0), "two seconds into it")
    tone_on = max(tone_db(tv, 3000) for _ in range(3))
    ok(tone_on > 20 and tone_on > tone_before + 12, f"in the speakers: the clip's tone stands out ({tone_before:.1f} dB before, {tone_on:.1f} dB now)")
    clip_db = loud_db(tv)
    ok(abs(clip_db - night_db) < 6, f"about as loud as the night ({night_db:.1f} dBFS before, {clip_db:.1f} dBFS with the clip)")
    note = amy.locator(".djk-req-note").inner_text()
    ok("正在放你点的 周杰伦 《晴天》" in note and "Remix" not in note, f"Amy's phone names it: {note}")
    link = amy.locator(".djk-req-whole")
    ok(link.count() == 1 and f"/song/{up['song']}" in (link.get_attribute("href") or ""), "and links the whole song on Apple Music")
    ok(until(lambda: tv.locator(".dk-req-credit").count() == 1, 3000), f"the TV credits Apple: {tv.locator('.dk-req.is-now').inner_text() if tv.locator('.dk-req.is-now').count() else ''}")
    tv.screenshot(path=os.path.join(OUT, f"clip-{WHICH}-tv-2-on.png"))
    amy.screenshot(path=os.path.join(OUT, f"clip-{WHICH}-phone-1.png"), full_page=True)

    # it ends on a bar line, the remix carrying on
    to = plays[0]["to"]
    secs_left = (to - fake(tv, "f.speaker.heardFrame()")) / 48000
    ok(until(lambda: fake(tv, "f.speaker.heardFrame()") > to + 48000, (secs_left + 15) * 1000, 250), f"the clip plays out ({secs_left:.1f} s more)")
    tone_after = max(tone_db(tv, 3000) for _ in range(3))
    ok(tone_after < tone_on - 15, f"then the DJ's remix alone ({tone_after:.1f} dB)")
    st = tv.evaluate("() => window.__djBooth.stats()")
    ok(st["state"] == "playing" and st["stalls"] == 0, f"the music never stopped ({st})")

    # Ben asks for a song that isn't on the list: his phone finds it on Apple
    ben.locator(".djk-req-input").fill("made up song")
    ok(until(lambda: ben.locator(".djk-req-hit.is-apple").count() == 1, 8000, 100), "Ben types a song that isn't on the list: Apple has it")
    ok("Made Up Song" in ben.locator(".djk-req-hit.is-apple").inner_text() and "Radio Edit" not in ben.locator(".djk-req-hit.is-apple").inner_text(), "its title as people know it")
    ben.locator(".djk-req-hit.is-apple").click()
    ben.locator(".djk-req-send").click()
    ok(until(lambda: (deck(tv).get("up") or {}).get("apple") == 990001, 6000), "it's up next")
    ok(deck(tv)["up"]["text"] is None and (deck(cat)["up"] or {}).get("text") is None and deck(ben)["up"]["text"] == "Made Up Song", "only Ben (and the host) read its name; the TV and the others don't")
    off2 = "b" if deck(tv)["fader"] < 0.5 else "a"
    ok(until(lambda: fake(tv, f"!!f.clips.{off2}.clip"), 10000, 200) and any("made-up" in u for u in served), "the TV fetched its clip")
    ok(until(lambda: (deck(tv).get("sounding") or {}).get(off2) == deck(tv)["up"]["style"], 30000, 250), "the deck plays its style")
    dr2 = charge(phones, tv)
    ok(bool(dr2) and drop_on_cue(amy, tv, dr2), "the table drops into it")
    plays2 = fake(tv, f"f.clips.{off2}.playing")
    ok(len(plays2) == 1 and not plays2[0]["bed"] and plays2[0]["step"] == 1, f"100 BPM against the night's 125: it plays alone, at its own speed ({plays2})")
    ok(heard_after(tv, dr2["bar"] * 4, 2.0), "two seconds into it")
    tone2 = max(tone_db(tv, 5000) for _ in range(3))
    ok(tone2 > 20, f"in the speakers ({tone2:.1f} dB)")
    now_line = tv.locator(".dk-req.is-now").inner_text().split("\n")[0]
    ok(now_line in ("Now: Ben's song", "正在放：Ben 点的歌"), f"the TV names it as Ben's song, not a remix, and not by its name: {now_line}")

    # a name found nowhere: the remix alone, and the phone says so
    cat.locator(".djk-req-input").fill("qqqq zzzz")
    cat.wait_for_timeout(700)
    cat.locator(".djk-req-send").click()
    ok(until(lambda: any(r.get("by") and r.get("text") == "qqqq zzzz" for r in [deck(cat).get("up") or {}] + (deck(cat).get("reqs") or [])), 8000), "Cat's name found nowhere: asked for by name")
    r = next(r for r in [deck(cat).get("up") or {}] + (deck(cat).get("reqs") or []) if r.get("text") == "qqqq zzzz")
    ok(not r.get("p") and not r.get("apple"), "with no clip (its remix alone)")

    bad = [e for e in errs + [x for ph in phones for x in ph._errs] if "WebSocket" not in e and "favicon" not in e]
    ok(not bad, f"no errors {bad[:3]}")
    br.close()
    if chrome is not br:
        chrome.close()

print("\nall passed" if not fails else f"\n{len(fails)} failed: {fails}")
sys.exit(1 if fails else 0)
