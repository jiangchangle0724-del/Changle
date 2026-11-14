"""打碟 · DJ Booth: 弹幕 (Steve on Nov 13: "再加一个玩家可以发弹幕的功能，可以推荐几个弹幕表情之类的，也可以
自定义"), in browsers: a TV and three phones.

What it checks: every phone has the 弹幕 card (twelve ready ones, in its own language, and a line of
one's own); a tap flies across the TV with the sender's face and name, right to left; a second tap
straight after isn't taken (the phone says to slow down); one's own words fly too, the worst ones
starred out; lines sent together take different rows; the host turns them off (the lines on their
way go, the phones say so) and on again; a TV with reduced motion has them stand still at the left.

Needs the two local servers (site/README.md).
usage: python3 scripts/dj_danmu_check.py
"""
import os, sys, tempfile
from playwright.sync_api import sync_playwright

sys.path.insert(0, os.path.dirname(__file__))
from party_test import until, ok, fails, phone, view  # noqa: E402

BASE = "http://127.0.0.1:5173/"
OUT = os.environ.get("SHOTS", os.path.join(tempfile.gettempdir(), "dj-danmu"))
os.makedirs(OUT, exist_ok=True)


def text(pg, sel):
    loc = pg.locator(sel)
    return loc.first.inner_text() if loc.count() else ""


def lines(tv):
    """The lines on the TV: their words, where they are, their row."""
    return tv.evaluate(
        """() => [...document.querySelectorAll('.dj-danmu-line')].map((e) => {
          const r = e.getBoundingClientRect();
          return { text: e.innerText, x: r.left, right: r.right, top: Math.round(r.top), face: !!e.querySelector('.avatar'), op: +getComputedStyle(e).opacity };
        })"""
    )


def on_tv(tv, words):
    return [l for l in lines(tv) if words in l["text"]]


def chip(ph, i):
    return ph.locator(".djk-danmu-chip").nth(i)


def say(ph, words):
    ph.locator(".djk-danmu-own input").fill(words)
    ph.locator(".djk-danmu-own button[type=submit]").click()


with sync_playwright() as p:
    br = p.chromium.launch()
    tvc = br.new_context(viewport={"width": 1600, "height": 900})
    tv = tvc.new_page()
    errs = []
    tv.on("pageerror", lambda e: errs.append(str(e)))
    tv.goto(BASE + "dj", wait_until="load")
    code = until(lambda: tv.locator(".dj-join-code").inner_text().strip(), 15000)
    tv.locator(".dj-start-btn").click()
    ok(until(lambda: (view(tv) or {}).get("phase") == "warm", 15000), f"the night starts ({code})")

    phones = []
    for name, lang in (("Amy", "zh"), ("Ben", "zh"), ("Cat", "en")):
        ph = phone(br, name, lang)
        ph.goto(BASE + f"#/r/{code}", wait_until="load")
        ph.locator(".join-card input").fill(name)
        ph.locator(".join-card button[type=submit]").click()
        ok(until(lambda: ph.locator(".djk-danmu").count() == 1, 10000), f"{name}'s phone has the 弹幕 card")
        phones.append(ph)
    amy, ben, cat = phones
    ok(ben.locator(".djk-danmu-chip").count() == 12 and "好听" in chip(ben, 1).inner_text() and "Love this" in chip(cat, 1).inner_text(), "twelve ready ones, each phone in its own language")
    sizes = ben.evaluate("() => [...document.querySelectorAll('.djk-danmu-chip')].map((b) => Math.round(b.getBoundingClientRect().height))")
    ok(all(h >= 48 for h in sizes), f"each big enough to hit among the others ({sorted(set(sizes))} px)")
    ok(amy.locator(".djp-host .djp-voice").count() == 1 and amy.locator(".djp-host .djp-danmu-switch").count() == 1 and ben.locator(".djp-host").count() == 0, "the host's card: 报幕 and 弹幕 switches; a guest has none")
    ben.locator(".djk-danmu").scroll_into_view_if_needed()
    ben.screenshot(path=os.path.join(OUT, "danmu-ben-0-card.png"))

    # a ready one flies across the TV, with Ben's face and name
    chip(ben, 1).click()
    ok(until(lambda: on_tv(tv, "Ben"), 3000), f"Ben's line is on the TV ({lines(tv)})")
    l0 = on_tv(tv, "Ben")[0]
    ok("好听" in l0["text"] or "Love this" in l0["text"], f"saying what he tapped ({l0['text']!r})")
    ok(l0["face"], "with his face")
    tv.wait_for_timeout(700)
    l1 = on_tv(tv, "Ben")[0]
    ok(l1["x"] < l0["x"] - 40, f"moving right to left ({l0['x']:.0f} → {l1['x']:.0f})")
    ok(until(lambda: "发到电视了" in text(ben, ".djk-danmu-sent"), 2000), f"his phone says it went ({text(ben, '.djk-danmu-sent')!r})")

    # straight after: not taken
    chip(ben, 2).click()
    ok(until(lambda: "慢一点" in text(ben, ".djk-danmu-sent"), 2000), f"a second tap at once: slow down ({text(ben, '.djk-danmu-sent')!r})")
    tv.wait_for_timeout(800)
    ok(not on_tv(tv, "再来一首"), "and nothing more on the TV")

    # one's own words, the worst starred out
    say(cat, "great set DJ!!")
    ok(until(lambda: on_tv(tv, "great set DJ!!"), 3000), "Cat's own words fly too")
    ben.wait_for_timeout(1600)
    say(ben, "傻逼DJ 太牛")
    ok(until(lambda: on_tv(tv, "**DJ 太牛"), 3000), f"the worst words starred out ({[l['text'] for l in lines(tv)]})")
    ok(ben.locator(".djk-danmu-own input").input_value() == "", "the field empties once it's sent")
    tv.screenshot(path=os.path.join(OUT, "danmu-tv-1-lines.png"))

    # several at once: different rows, never on top of each other
    tv.wait_for_timeout(1600)
    for ph, i in ((amy, 0), (ben, 4), (cat, 5)):
        chip(ph, i).click()
    tv.wait_for_timeout(1500)
    now = lines(tv)
    rows = {}
    for l in now:
        rows.setdefault(l["top"], []).append(l)
    crash = [(a["text"], b["text"]) for r in rows.values() for a in r for b in r if a is not b and a["x"] < b["x"] < a["right"]]
    ok(len(rows) >= 3 and not crash, f"lines together take different rows, none running into another ({len(rows)} rows, {crash})")
    tv.screenshot(path=os.path.join(OUT, "danmu-tv-2-many.png"))
    ok(until(lambda: not lines(tv), 16000, 300), "they all fly off the screen and are gone")

    # the host's switch
    amy.locator(".djp-danmu-switch").click()
    ok(until(lambda: (view(tv) or {}).get("danmuOn") is False, 3000), "the host turns 弹幕 off")
    ok(until(lambda: "主人关了弹幕" in text(ben, ".djk-danmu") and ben.locator(".djk-danmu-chip").count() == 0, 3000), "Ben's phone says the host turned them off")
    ok("关" in amy.locator(".djp-danmu-switch").inner_text(), "the host's switch says off")
    amy.locator(".djp-danmu-switch").click()
    ok(until(lambda: chip(ben, 3).count() == 1, 3000), "on again")
    chip(ben, 3).click()
    ok(until(lambda: on_tv(tv, "Ben"), 3000), "and Ben's line flies")

    # a TV with reduced motion: they stand still at the left, fading in and out
    still = br.new_context(viewport={"width": 1280, "height": 720}, reduced_motion="reduce").new_page()
    still.on("pageerror", lambda e: errs.append(str(e)))
    still.goto(BASE + f"tv/{code}", wait_until="load")
    ok(until(lambda: (view(still) or {}).get("id") == "dj", 10000), "a second TV with reduced motion shows the booth")
    cat.wait_for_timeout(1600)
    chip(cat, 6).click()
    ok(until(lambda: on_tv(still, "Cat"), 3000), "Cat's line is on it")
    a = on_tv(still, "Cat")[0]
    still.wait_for_timeout(800)
    b = on_tv(still, "Cat")[0]
    ok(abs(a["x"] - b["x"]) < 1 and b["x"] < 100, f"standing still at the left ({a['x']:.0f}, {b['x']:.0f})")
    still.screenshot(path=os.path.join(OUT, "danmu-tv-3-still.png"))

    bad = [e for e in errs + [x for ph in phones for x in ph._errs] if "WebSocket" not in e and "favicon" not in e]
    ok(not bad, f"no errors {bad[:3]}")
    br.close()

print("\nall passed" if not fails else f"\n{len(fails)} failed: {fails}")
sys.exit(1 if fails else 0)
