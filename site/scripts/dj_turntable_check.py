"""打碟 · DJ Booth, the phone as a DJ controller (Steve on Nov 2: "再加一个简易打碟机，让整个页面看起来就像一个
打碟机", and "more DJ sound effects like airhorn blasts, vinyl record"), in browsers: a TV and two phones.
The phone's console: two turntables (the one on the air spinning), the mixer's round knobs, twelve
pads. A hand on a record: rubbed back and forth it scratches, spun back a long way it rewinds, held
still it brakes, each on the speaker from the next beat. A knob turned by dragging up, centred by a
double tap. The four new club pads (黑胶, 低音炸弹, 反向镲, 口哨) each play on a beat, and each sound is
what it says, rendered offline in the TV's browser and measured.

Needs the two local servers (site/README.md), with DEV_LYRIA_ANYONE off.
usage: python3 scripts/dj_turntable_check.py [chromium|webkit]   (the TV's browser; the phones are Chromium)
"""
import math, os, sys, tempfile, time
from playwright.sync_api import sync_playwright

sys.path.insert(0, os.path.dirname(__file__))
from party_test import until, ok, fails, phone, view  # noqa: E402

BASE = "http://127.0.0.1:5173/"
WHICH = next((a for a in sys.argv[1:] if a in ("chromium", "webkit")), "chromium")
OUT = os.environ.get("SHOTS", os.path.join(tempfile.gettempdir(), "dj-turntable"))
os.makedirs(OUT, exist_ok=True)


def deck(pg):
    return (view(pg) or {}).get("deck") or {}


def log(tv):
    return tv.evaluate(
        """() => { const d = window.__djBooth && window.__djBooth.deck(); if (!d) return [];
        return d.log.map(e => ({ k: e.k, at: e.at, beat: e.beat, want: d.beatAt(e.beat) })) }"""
    )


def on_beat(e):
    return e["want"] is not None and abs(e["beat"] - round(e["beat"])) < 1e-6 and abs(e["at"] - e["want"]) < 0.001


def played(tv, k, since):
    return [e for e in log(tv)[since:] if e["k"] == k]


def hand(pg, idx, path, hold_ms=0):
    """A finger on a record: down at the first angle, along the others (degrees, clockwise from 3
    o'clock), held a moment, then up."""
    pg.locator(".djk-vinyl").nth(idx).scroll_into_view_if_needed()
    pg.wait_for_timeout(200)
    box = pg.locator(".djk-vinyl").nth(idx).bounding_box()
    cx, cy, r = box["x"] + box["width"] / 2, box["y"] + box["height"] / 2, box["width"] * 0.36
    pt = lambda a: (cx + r * math.cos(math.radians(a)), cy + r * math.sin(math.radians(a)))
    pg.mouse.move(*pt(path[0]))
    pg.mouse.down()
    for a in path[1:]:
        pg.mouse.move(*pt(a), steps=2)
        pg.wait_for_timeout(12)
    if hold_ms:
        pg.wait_for_timeout(hold_ms)
    pg.mouse.up()


RENDER = """async ([name, bpm]) => {
  const beat = 60 / bpm, sr = 48000, len = 5 * beat;
  const c = new OfflineAudioContext(1, Math.ceil(len * sr), sr);
  const end = window.__club[name](c, c.destination, 0.5 * beat, beat);
  const d = (await c.startRendering()).getChannelData(0);
  const span = (a, b) => d.subarray(Math.floor(a * sr), Math.floor(b * sr));
  const rms = (x) => Math.sqrt(x.reduce((s, v) => s + v * v, 0) / Math.max(1, x.length));
  const peak = (x) => x.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
  const zc = (x) => { let n = 0; for (let i = 1; i < x.length; i++) if ((x[i - 1] < 0) !== (x[i] < 0)) n++; return n / (x.length / sr) / 2; };
  const s = 0.5 * beat;
  return { beat, end: end - s, before: rms(span(0, s - 0.01)), first: rms(span(s, s + 0.5 * beat)), early: rms(span(s, s + 0.25 * beat)),
    late: rms(span(s + 1.6 * beat, s + 2 * beat)), after: rms(span(s + 2.05 * beat, s + 2.5 * beat)), gap: rms(span(s + 0.36 * beat, s + 0.46 * beat)),
    hz: zc(span(s + 0.05 * beat, s + 0.3 * beat)), crest: peak(span(s, s + 4 * beat)) / Math.max(1e-9, rms(span(s, s + 4 * beat))) };
}"""


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
    ok(until(lambda: (view(tv) or {}).get("phase") == "warm", 15000), f"{WHICH}: the night starts ({code})")
    ok(until(lambda: deck(tv).get("grid"), 8000), "the speaker tells the room where its bars fall")

    # the sounds themselves, rendered offline on the TV
    bpm = 125
    vin = tv.evaluate(RENDER, ["vinyl", bpm])
    ok(abs(vin["end"] - 8 * vin["beat"]) < 1e-6 and vin["late"] > 0.008 and vin["crest"] > 6, f"黑胶: two bars of crackle, pops well over the hiss (RMS {vin['late']:.3f}, crest {vin['crest']:.0f})")
    bd = tv.evaluate(RENDER, ["bassDrop", bpm])
    ok(bd["before"] == 0 and bd["first"] > 0.15 and bd["hz"] < 160, f"低音炸弹: a loud low boom from its beat ({bd['first']:.2f} RMS, about {bd['hz']:.0f} Hz)")
    rv = tv.evaluate(RENDER, ["reverseCymbal", bpm])
    ok(rv["late"] > 4 * rv["early"] and rv["after"] < 1e-4 and abs(rv["end"] - 2 * rv["beat"]) < 1e-6, f"反向镲: it swells ({rv['early']:.4f} to {rv['late']:.4f}) and stops on the beat after next")
    wh = tv.evaluate(RENDER, ["whistle", bpm])
    ok(2400 < wh["hz"] < 3400 and wh["first"] > 0.02 and wh["gap"] < wh["first"] / 4, f"口哨: a whistle about {wh['hz']:.0f} Hz, in blasts")

    phones = []
    for name in ("Amy", "Ben"):
        ph = phone(chrome, name, "zh")
        ph.goto(BASE + f"#/r/{code}", wait_until="load")
        ph.locator(".join-card input").fill(name)
        ph.locator(".join-card button[type=submit]").click()
        ok(until(lambda: ph.locator(".djk-pad").count() == 12, 10000), f"{name}'s phone shows the deck, twelve pads")
        phones.append(ph)
    amy, ben = phones
    ok(amy.locator(".djk-console .djk-platter").count() == 2 and amy.locator(".djk-console .djk-dial").count() == 4, "the console: two turntables, four round knobs")
    ok(until(lambda: "is-on" in (amy.locator(".djk-platter").first.get_attribute("class") or ""), 3000), "deck A's record is on the air")
    spin = amy.evaluate("() => getComputedStyle(document.querySelector('.djk-platter.is-on .djk-vinyl-disc')).animationPlayState")
    ok(spin == "running", f"and spinning ({spin})")
    ok("气笛" in amy.locator(".djk-pad.is-horn").inner_text(), "the horn is the air horn now (气笛)")
    amy.wait_for_timeout(500)
    amy.screenshot(path=os.path.join(OUT, f"turntable-{WHICH}-amy-1.png"), full_page=True)

    # the new pads, each on a beat
    for pad, ph in (("vinyl", amy), ("bassdrop", ben), ("reverse", amy), ("whistle", ben)):
        since = len(log(tv))
        ph.locator(f".djk-pad.is-{pad}").click()
        ok(until(lambda: played(tv, pad, since), 3000), f"{pad}: it plays on the speaker")
        ok(on_beat(played(tv, pad, since)[0]), "on a beat")
        if pad == "vinyl":
            lp = lambda: tv.evaluate("() => window.__fakeDj.speaker.fxNodes.lp.frequency.value")
            ok(until(lambda: lp() < 5000, 2500, 50), f"from its beat the music darkens under the record ({lp():.0f} Hz)")
        ph.wait_for_timeout(700)
    ok(until(lambda: tv.locator(".dk-chip.is-whistle").count() >= 1 or tv.locator(".dk-chip").count() >= 1, 3000), "the TV says who pressed what")
    tv.wait_for_timeout(3500)

    # a hand on the record
    since = len(log(tv))
    hand(amy, 0, [0, 30, 0, 30, 0])
    ok(until(lambda: played(tv, "scratch", since), 3000), "rubbed back and forth: a scratch")
    ok(on_beat(played(tv, "scratch", since)[0]), "on a beat")
    tv.wait_for_timeout(4300)
    since = len(log(tv))
    hand(ben, 0, [0, -40, -80, -120, -160, -200, -240, -280])
    ok(until(lambda: played(tv, "rewind", since), 3000), "spun back a long way: a rewind")
    ok(on_beat(played(tv, "rewind", since)[0]), "on a beat")
    tv.wait_for_timeout(4300)
    since = len(log(tv))
    hand(amy, 1, [45], hold_ms=700)
    ok(until(lambda: played(tv, "brake", since), 3000), "held still: the music brakes")
    ok(on_beat(played(tv, "brake", since)[0]), "on a beat")
    tv.wait_for_timeout(3000)
    st = tv.evaluate("() => window.__djBooth.stats()")
    ok(st["state"] == "playing" and st["stalls"] == 0, f"the music comes back: playing, no stall ({st})")

    # a round knob
    amy.locator(".djk-dial").first.scroll_into_view_if_needed()
    amy.wait_for_timeout(200)
    box = amy.locator(".djk-dial").first.bounding_box()
    x, y = box["x"] + box["width"] / 2, box["y"] + box["height"] / 2
    amy.mouse.move(x, y)
    amy.mouse.down()
    for k in range(1, 8):
        amy.mouse.move(x, y - 10 * k)
        amy.wait_for_timeout(30)
    amy.mouse.up()
    ok(until(lambda: (deck(tv).get("mixer") or {}).get("knobs", {}).get("low") == 0.5, 3000), f"dragged up half way: the bass lifts (+0.5) ({(deck(tv).get('mixer') or {}).get('knobs')})")
    rot = amy.evaluate("() => getComputedStyle(document.querySelector('.djk-dial-cap')).rotate")
    ok("67.5" in rot, f"the knob's cap turned with it ({rot})")
    amy.wait_for_timeout(1700)
    amy.locator(".djk-dial").first.dblclick()
    ok(until(lambda: (deck(tv).get("mixer") or {}).get("knobs", {}).get("low") == 0, 3000), "a double tap centres it")

    bad = [e for e in errs + [x for ph in phones for x in ph._errs] if "WebSocket" not in e and "favicon" not in e]
    ok(not bad, f"no errors {bad[:3]}")
    br.close()
    if chrome is not br:
        chrome.close()

print("\nall passed" if not fails else f"\n{len(fails)} failed: {fails}")
sys.exit(1 if fails else 0)
