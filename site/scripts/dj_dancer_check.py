"""打碟 · DJ Booth, the big screen's dancer and its layout (Steve on Nov 14: "只保留我圈出来的部分，然后把
玩家的位置和youtube视频位置进行对换，并且把youtube视频变大一些…把我打红色的x的框和文字都删了，仅保留
人物…她也不需要坐着了，把跟着跳的功能也删了"), in browsers: a TV and two phones.

What it checks: up top only the song asked for that's up next (no decks, crossfader, build-up or
mixer round it); no night's curve at the bottom; the dancer on the left, only her, no card and no
words, dancing on the speaker's beat; a song from YouTube in the middle, big, the floor moving to its
right; the phones without 跟着跳; the host's switch taking her off the TV and back (Nov 18); the
night's recap without the dancing. The dancer in 3D where a
graphics chip draws her: this machine has none (its browsers draw WebGL in software, or too slowly),
so the TV keeps the drawn dancer (in Chromium without even downloading three.js); a second TV, told
to take any WebGL, shows her (since Nov 18 the design Steve chose, dancing real dancers' motion
capture: src/party/dj/dancer/): standing easy with no song, the look's dances when one plays, in its
outfit, under its lights (Nov 18: the cool-down's first-love skirt, changed into in a flash).

Needs the two local servers (site/README.md), with DEV_LYRIA_ANYONE off.
usage: python3 scripts/dj_dancer_check.py [chromium|webkit]   (the TV's browser; the phones are Chromium)
"""
import json, os, re, sys, tempfile
from playwright.sync_api import sync_playwright

sys.path.insert(0, os.path.dirname(__file__))
from party_test import until, ok, fails, phone, view  # noqa: E402
from dj_tube import FAKE_YT, deck, hold, carry_on  # noqa: E402

BASE = "http://127.0.0.1:5173/"
WHICH = next((a for a in sys.argv[1:] if a in ("chromium", "webkit")), "chromium")
OUT = os.environ.get("SHOTS", os.path.join(tempfile.gettempdir(), "dj-dancer"))
os.makedirs(OUT, exist_ok=True)
HERE = os.path.dirname(__file__)
# her dances and idles (src/party/dj/dancer/dances.ts): each id with the stretches it goes with
_DANCES_TS = open(os.path.join(HERE, "../src/party/dj/dancer/dances.ts"), encoding="utf-8").read()
DANCES = {i: re.findall(r'"(\w+)"', m) for i, m in re.findall(r'\{ id: "(\w+)", bpm: [\d.]+, looks: \[([^\]]*)\]', _DANCES_TS)}
IDLES = re.findall(r'\{ id: "(\w+)", bpm: [\d.]+ \}', _DANCES_TS)
ONE, TWO = "dancerone01", "dancertwo02"


def text(pg, sel):
    loc = pg.locator(sel)
    return loc.first.inner_text() if loc.count() else ""


def yt_api(route):
    hdr = {"Access-Control-Allow-Origin": "*", "Content-Type": "application/json"}
    url = route.request.url
    if "/yt/info" in url:
        vid = url.split("id=")[1][:11]
        return route.fulfill(status=200, body=json.dumps({"id": vid, "t": f"Song {vid}", "a": "Some channel"}), headers=hdr)
    return route.fulfill(status=200, body='{"nokey":true}', headers=hdr)


def ask(ph, vid):
    ph.locator(".djk-req-input").fill(f"https://youtu.be/{vid}")
    ok(until(lambda: ph.locator(".djk-req-hit.is-yt").count() > 0, 5000), f"a link ({vid})")
    ph.locator(".djk-req-hit.is-yt").first.click()
    ph.locator(".djk-req-send").click()


def join(br, code, name, lang="zh"):
    ph = phone(br, name, lang)
    ph.route("http://127.0.0.1:8787/api/yt/**", yt_api)
    ph.goto(BASE + f"#/r/{code}", wait_until="load")
    ph.locator(".join-card input").fill(name)
    ph.locator(".join-card button[type=submit]").click()
    ok(until(lambda: ph.locator(".djk-player").count() == 1, 10000), f"{name}'s phone")
    return ph


def tv_page(br, any_gl=False):
    tv = br.new_context(viewport={"width": 1600, "height": 900}).new_page()
    tv.route("https://www.youtube.com/iframe_api", lambda r: r.fulfill(status=200, body=FAKE_YT, headers={"Content-Type": "text/javascript"}))
    if any_gl:
        tv.add_init_script("window.__djAnyGl = true")
    tv.on("pageerror", lambda e: errs.append(str(e)))
    tv.on("console", lambda m: errs.append(m.text) if m.type == "error" and "WebSocket" not in m.text else None)
    tv.goto(BASE + "dj", wait_until="load")
    code = until(lambda: tv.locator(".dj-join-code").inner_text().strip(), 15000)
    tv.locator(".dj-start-btn").click()
    ok(until(lambda: (view(tv) or {}).get("phase") == "warm", 15000), f"{WHICH}: the night starts ({code})")
    return tv, code


errs = []
with sync_playwright() as p:
    br = getattr(p, WHICH).launch()
    chrome = br if WHICH == "chromium" else p.chromium.launch()
    three = []
    tv, code = tv_page(br)
    tv.on("request", lambda r: three.append(r.url) if r.url.split("?")[0].rsplit("/", 1)[-1].startswith("three") or "GLTFLoader" in r.url else None)

    # the TV, trimmed
    ok(tv.locator(".dk-board, .dk-deck, .dk-fader, .dk-meter, .dk-mix").count() == 0, "no decks, crossfader, build-up or mixer up top")
    ok(tv.locator(".dj-curve").count() == 0, "no night's curve at the bottom")
    ok(until(lambda: tv.locator(".dj-coach").count() == 1, 8000), "the dancer is on the TV")
    ok(tv.locator(".dj-coach-title, .dj-coach-now, .dj-coach-how, .dj-coach-next, .dj-coach-combo").count() == 0 and not tv.locator(".dj-coach").inner_text().strip(), "only her: no card, no words")
    ok(tv.locator(".dj-coach").get_attribute("aria-hidden") == "true", "a picture: nothing in it to read")
    cb = tv.locator(".dj-coach").bounding_box()
    ok(cb and cb["x"] < 40 and cb["height"] >= 700, f"on the left, tall ({cb})")
    # in 3D where a graphics chip draws her: none here, the drawn one stays and dances
    is3d = until(lambda: (lambda x: x if x in ("on", "software", "none", "slow", "small", "failed") else None)(tv.evaluate("() => window.__coach3dIs")), 20000, 200)
    if is3d == "on":
        print("--   (this browser has a graphics chip: the dancer stays on this TV)")
        ok(tv.locator(".dj-coach-3d canvas").count() == 1 and tv.locator(".dj-coach-svg.is-off").count() == 1, "the 3D dancer takes over from the drawn one")
    else:
        ok(tv.locator(".dj-coach-3d").count() == 0 and tv.locator(".dj-coach-svg.is-off").count() == 0, f"no graphics chip for her or the robot here ({is3d}): the drawn one stays")
        pose = lambda: tv.evaluate("() => document.querySelector('.dj-coach-svg').innerHTML.length + ':' + document.querySelector('.dj-coach-svg').innerHTML.slice(0, 4000)")
        p0 = pose()
        tv.wait_for_timeout(700)
        ok(pose() != p0, "and dances")
        if is3d == "software":
            ok(not three, f"three.js never downloaded for her ({three[:2]})")

    amy = join(chrome, code, "Amy")
    ben = join(chrome, code, "Ben")
    ok(amy.locator(".djk-dance").count() == 0 and amy.get_by_role("button", name="开始跟着跳").count() == 0, "no 跟着跳 on the phones")
    # the host's switch (Steve on Nov 18: "需要有个按钮可以关闭模特跳舞"): she leaves the TV, and comes back
    sw = amy.locator(".djp-dancer-switch")
    ok(until(lambda: sw.count() == 1, 4000) and "电视上的舞者：开" in sw.inner_text() and ben.locator(".djp-dancer-switch").count() == 0, "the host's card has the dancer's switch (only the host's)")
    sw.click()
    ok(until(lambda: tv.locator(".dj-coach").count() == 0, 4000) and "电视上的舞者：关" in sw.inner_text(), "off: she leaves the TV")
    sw.click()
    ok(until(lambda: tv.locator(".dj-coach").count() == 1, 4000) and "电视上的舞者：开" in sw.inner_text(), "on again: she's back")
    fl0 = tv.locator(".dj-floor, .dj-floor3d").first.bounding_box()
    ok(fl0 and fl0["x"] < 800 < fl0["x"] + fl0["width"], f"no song from YouTube: the floor in the middle ({fl0})")
    tv.screenshot(path=os.path.join(OUT, f"dancer-{WHICH}-tv-1-floor.png"))

    # a song from YouTube: up top, only the song up next; then in the middle, big, the floor to its right
    hold(tv, amy)
    ask(ben, ONE)
    ok(until(lambda: "下一首" in text(tv, ".dk-up") or "Up next" in text(tv, ".dk-up"), 4000), f"up top: the song up next ({text(tv, '.dk-up')!r})")
    ok(until(lambda: tv.locator(".dj-tube.is-next").count() == 1, 6000), "its video, ready")
    tb = tv.locator(".dj-tube").bounding_box()
    ok(tb and abs(tb["x"] + tb["width"] / 2 - 800) < 4 and tb["width"] >= 800, f"in the middle, big ({tb})")
    fl = until(lambda: (lambda b: b if b and b["x"] >= tb["x"] + tb["width"] else None)(tv.locator(".dj-floor, .dj-floor3d").first.bounding_box()), 3000)
    ok(fl, f"the floor goes to its right ({fl})")
    ok(cb["x"] + cb["width"] <= tb["x"] + 2, "the dancer left of it, clear of it")
    ok(tv.locator(".dj-join.is-big").count() == 0, "the code to scan stays small in its corner")
    tv.screenshot(path=os.path.join(OUT, f"dancer-{WHICH}-tv-2-next.png"))
    carry_on(tv, amy)
    ok(until(lambda: tv.locator(".dj-tube.is-on").count() == 1, 60000, 100), "it plays")
    ok("beat" not in (deck(tv).get("song") or {}), "nothing about the song's beats for the phones")
    tv.screenshot(path=os.path.join(OUT, f"dancer-{WHICH}-tv-3-on.png"))
    ben.locator(".djk-player-keys .djk-key").nth(2).click()
    ok(until(lambda: not deck(tv).get("song") and tv.locator(".dj-tube.is-off").count() == 1, 15000), "skipped: the video goes")
    ok(until(lambda: (lambda b: b and b["x"] < 800 < b["x"] + b["width"])(tv.locator(".dj-floor, .dj-floor3d").first.bounding_box()), 4000), "the floor back in the middle")

    # the recap: no dancing in it
    amy.evaluate("() => window.__djHost.phase('end')")
    ok(until(lambda: tv.locator(".dj-end").count() == 1, 5000), "the night's recap")
    ok("on the beat" not in text(tv, ".dj-end") and "跳得最准" not in text(tv, ".dj-end"), f"no dancing in it ({text(tv, '.dj-end')!r})")
    tv.context.close()

    # her in 3D: a second TV that takes any WebGL
    tv2, code2 = tv_page(br, any_gl=True)
    ok(until(lambda: tv2.locator(".dj-coach-3d canvas").count() == 1 and tv2.locator(".dj-coach-svg.is-off").count() == 1, 40000), "a TV that takes any WebGL: the 3D dancer loads and takes over from the drawn one")
    ok(len(DANCES) >= 6 and len(IDLES) >= 1, f"her dances read ({len(DANCES)} and {len(IDLES)} idles)")
    c1 = until(lambda: (lambda c: c if c and (c.get("move") in DANCES or c.get("move") in IDLES) else None)(tv2.evaluate("() => window.__coach3d")), 20000, 200) or {}
    ok(c1 and (c1.get("move") in IDLES or c1.get("dancing")), f"she stands easy, or dances on the speaker's beat ({c1})")
    ok(c1.get("tris", 0) < 90000 and c1.get("calls", 99) <= 6, f"light to draw ({c1.get('tris')} triangles, {c1.get('calls')} draws)")
    tv2.screenshot(path=os.path.join(OUT, f"dancer-{WHICH}-tv-4-dancer.png"))
    dee = join(chrome, code2, "Dee", "en")
    # walking the stage (Nov 20): with someone on the floor and no song's video in the middle she may;
    # told where (the page's hook for checks, in place of the chance at a new dance), she turns, walks
    # there in her look's walk, and turns back to the room
    ok(until(lambda: (tv2.evaluate("() => window.__coach3d") or {}).get("roam") is True, 15000, 200), "someone on the floor, no video in the middle: she may walk the stage")
    walks = set(re.findall(r'id: "(walk_\w+)"', _DANCES_TS))
    tv2.evaluate("() => { window.__djWalkTo = 700 }")
    w1 = until(lambda: (lambda c: c if c and c.get("walking") and c.get("move") in walks and 0 < c.get("x", 0) < 700 else None)(tv2.evaluate("() => window.__coach3d")), 20000, 100)
    ok(w1, f"she walks across, in her look's walk ({w1 or tv2.evaluate('() => window.__coach3d')})")
    if w1:
        tv2.screenshot(path=os.path.join(OUT, f"dancer-{WHICH}-tv-4b-walking.png"))
    w2 = until(lambda: (lambda c: c if c and c.get("x") == 700 and not c.get("walking") else None)(tv2.evaluate("() => window.__coach3d")), 20000, 200)
    ok(w2, f"and stops there, facing the room ({w2 or tv2.evaluate('() => window.__coach3d')})")
    box = tv2.locator(".dj-coach-3d").bounding_box()
    ok(box and box["x"] > 600, f"her canvas there on the stage ({box})")
    tv2.screenshot(path=os.path.join(OUT, f"dancer-{WHICH}-tv-4c-there.png"))
    tv2.evaluate("() => { delete window.__djWalkTo }")
    dee.evaluate("() => window.__djHost.phase('peak')")
    # a song in the peak: one of the peak's dances, on its beat
    ask(dee, TWO)
    ok(until(lambda: tv2.locator(".dj-tube.is-on").count() == 1, 60000, 100), "a song plays")
    ok(until(lambda: (lambda c: c and c.get("roam") is False and c.get("x") == 0)(tv2.evaluate("() => window.__coach3d")), 30000, 200), f"its video in the middle: she walks back to her place ({tv2.evaluate('() => window.__coach3d')})")
    # (a song whose tempo isn't known here: the stretch's look, the peak's club)
    # (her club outfit comes a moment after the look: fetched, taught the dance she's on, then a flash)
    c3 = until(lambda: (lambda c: c if c and c.get("dancing") and c.get("look") == "club" and c.get("outfit") == "club" and "club" in DANCES.get(c.get("move"), []) else None)(tv2.evaluate("() => window.__coach3d")), 30000, 300)
    ok(c3, f"she dances one of the club look's dances to it, in her club outfit ({c3 or tv2.evaluate('() => window.__coach3d')})")
    ok(until(lambda: tv2.locator(".dj-stage.look-club").count() == 1, 8000), f"the lights the club look's ({tv2.evaluate('() => document.querySelector(`.dj-stage`).className')})")
    tv2.screenshot(path=os.path.join(OUT, f"dancer-{WHICH}-tv-5-song.png"))
    # the night winding down: the sweet look (Nov 21: in the first dancer's own outfit, as in every look), its dances, its lights
    dee.evaluate("() => window.__djHost.phase('cool')")
    c4 = until(lambda: (lambda c: c if c and c.get("look") == "sweet" and c.get("outfit") == "club" else None)(tv2.evaluate("() => window.__coach3d")), 40000, 300)
    ok(c4, f"the cool-down: the sweet look, in her own outfit ({c4 or tv2.evaluate('() => window.__coach3d')})")
    c5 = until(lambda: (lambda c: c if c and c.get("dancing") and "sweet" in DANCES.get(c.get("move"), []) else None)(tv2.evaluate("() => window.__coach3d")), 30000, 300)
    ok(c5, f"and dances the sweet look's dances ({c5 or tv2.evaluate('() => window.__coach3d')})")
    ok(until(lambda: tv2.locator(".dj-stage.look-sweet").count() == 1, 8000), "the lights soft and pink")
    tv2.screenshot(path=os.path.join(OUT, f"dancer-{WHICH}-tv-6-sweet.png"))
    tv2.context.close()

    bad = [e for e in errs + [x for ph in (amy, ben, dee) for x in getattr(ph, "_errs", [])] if "WebSocket" not in e and "favicon" not in e]
    ok(not bad, f"no errors {bad[:3]}")
    br.close()
    if chrome is not br:
        chrome.close()

print("\nall passed" if not fails else f"\n{len(fails)} failed: {fails}")
sys.exit(1 if fails else 0)
