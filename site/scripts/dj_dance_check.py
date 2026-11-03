"""打碟 · DJ Booth, dancing along (跟着跳), in browsers: a TV and two phones. The TV's coach dances the
routine's move on the speaker's beat, names it and the next; two phones start dancing (the motion
sensor, simulated: Amy's hand moves on every beat, Ben's between the beats, then on them too); each
phone says how its beats went and sends its bars; the room counts them, the TV's floor shows who
follows well, the whole floor dancing together fills the combo to fireworks, and the night's recap
names the best on the beat.

Needs the two local servers (site/README.md), with DEV_LYRIA_ANYONE off.
usage: python3 scripts/dj_dance_check.py [chromium|webkit]   (the TV's browser; the phones are Chromium)
"""
import os, sys, tempfile, time
from playwright.sync_api import sync_playwright

sys.path.insert(0, os.path.dirname(__file__))
from party_test import until, ok, fails, phone, view  # noqa: E402

BASE = "http://127.0.0.1:5173/"
WHICH = next((a for a in sys.argv[1:] if a in ("chromium", "webkit")), "chromium")
OUT = os.environ.get("SHOTS", os.path.join(tempfile.gettempdir(), "dj-dance"))
os.makedirs(OUT, exist_ok=True)
NAMES = ["Step and clap", "Raise the roof", "Hip sway", "Fist pump", "Disco point", "Bounce", "Wave", "Twist", "Running man", "Shimmy"]

# a hand that moves hard within 40 ms of every beat (`off`: half a beat later, between the beats), and
# gently otherwise, on the phone's own clock
MOVE = """(off) => { clearInterval(window.__hand); window.__hand = setInterval(() => {
  const v = window.__room && window.__room.game; const g = v && v.deck && v.deck.grid; if (!g) return;
  const t = window.__danceNow ? window.__danceNow() : Date.now();
  const ms = 60000 / g.bpm, b = 4 * g.bar + (t - g.at) / ms + (off ? 0.5 : 0);
  const a = Math.abs(b - Math.round(b)) * ms < 40 ? 6 : 0.3;
  window.dispatchEvent(new DeviceMotionEvent('devicemotion', { acceleration: { x: a, y: 0, z: 0 }, accelerationIncludingGravity: { x: a, y: 9.81, z: 0 }, interval: 16 }));
}, 16); }"""


def text(pg, sel):
    loc = pg.locator(sel)
    return loc.first.inner_text() if loc.count() else ""


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
    ok(until(lambda: ((view(tv) or {}).get("deck") or {}).get("grid"), 10000), "the speaker tells the room where its bars fall")

    # the coach
    ok(until(lambda: tv.locator(".dj-coach.is-on").count() == 1, 8000), "the coach is on the TV, dancing")
    first = text(tv, ".dj-coach-now")
    ok(first in NAMES, f"the move, by name ({first})")
    ok(tv.evaluate("() => document.querySelector('.dj-coach-svg').childElementCount") > 0, "the coach is drawn")
    pose = lambda: tv.evaluate("() => document.querySelector('.dj-coach-svg').innerHTML.length + ':' + document.querySelector('.dj-coach-svg').innerHTML.slice(0, 4000)")
    p0 = pose()
    tv.wait_for_timeout(700)
    ok(pose() != p0, "and moving")
    ok(until(lambda: text(tv, ".dj-coach-next.is-soon").startswith("In "), 9000, 100), f"the next move, called in the last beats ({text(tv, '.dj-coach-next')!r})")
    ok(until(lambda: text(tv, ".dj-coach-now") != first, 6000, 100), f"then the coach changes move ({text(tv, '.dj-coach-now')})")
    tv.screenshot(path=os.path.join(OUT, f"dance-{WHICH}-tv-1-coach.png"))

    phones = []
    for name in ("Amy", "Ben"):
        ph = phone(chrome, name, "zh")
        ph.goto(BASE + f"#/r/{code}", wait_until="load")
        ph.locator(".join-card input").fill(name)
        ph.locator(".join-card button[type=submit]").click()
        ok(until(lambda: ph.locator(".djk-dance").count() == 1, 10000), f"{name}'s phone has 跟着跳")
        phones.append(ph)
    amy, ben = phones
    pid = {n: ph.evaluate("() => window.__room.you") for n, ph in zip(("Amy", "Ben"), phones)}
    amy.evaluate(MOVE, False)
    ben.evaluate(MOVE, True)
    for ph in phones:
        # (a phone's browser asks before a page reads its motion; here the check says yes)
        ph.context.grant_permissions(["accelerometer", "gyroscope"], origin=BASE.rstrip("/"))
        ph.get_by_role("button", name="开始跟着跳").click()
    ok(until(lambda: amy.locator(".djk-dance.is-on").count() == 1 and ben.locator(".djk-dance.is-on").count() == 1, 3000), "both start dancing (the motion sensor allowed)")
    ok(until(lambda: text(amy, ".djk-dance-now") in [n for n in ("拍手踏步", "举手顶天", "左右摇", "出拳", "迪斯科", "弹跳", "双手挥", "扭一扭", "跑步人", "抖肩")], 3000), f"the phone names the same routine ({text(amy, '.djk-dance-now')})")
    ok(until(lambda: "踩准了" in text(amy, ".djk-dance-beat"), 4000, 50), "Amy's beats: on the beat")
    ok(until(lambda: "这一小节 4/4" in text(amy, ".djk-dance-score"), 6000), f"her bar: 4 of 4 ({text(amy, '.djk-dance-score')!r})")
    ok(until(lambda: "这一小节 0/4" in text(ben, ".djk-dance-score"), 6000), f"Ben's, between the beats: 0 of 4 ({text(ben, '.djk-dance-score')!r})")
    dance = lambda: (view(tv) or {}).get("dance") or {}
    ok(until(lambda: (dance().get(pid["Amy"]) or {}).get("bars", 0) >= 3, 9000), "the room counts their bars")
    a, b = dance()[pid["Amy"]], dance()[pid["Ben"]]
    ok(a["hits"] / a["of"] >= 0.9 and b["hits"] / b["of"] <= 0.25, f"Amy on the beat ({a['hits']}/{a['of']}), Ben not ({b['hits']}/{b['of']})")
    ok(until(lambda: tv.locator(".dj-dance-meter").count() == 2 and tv.locator(".dj-dance-meter.is-hot").count() == 1, 4000), "the TV's floor: a meter under each dancer, Amy's lit (she keeps it up)")
    ok(until(lambda: "2 dancing" in text(tv, ".dj-coach-combo"), 3000), f"the coach counts who's dancing ({text(tv, '.dj-coach-combo')!r})")
    tv.screenshot(path=os.path.join(OUT, f"dance-{WHICH}-tv-2-floor.png"))
    amy.screenshot(path=os.path.join(OUT, f"dance-{WHICH}-amy-1.png"))

    # Ben finds the beat: the whole floor dances together, the combo fills, fireworks
    ben.evaluate(MOVE, False)
    peak = [0.0]

    def full():
        c = (view(tv) or {}).get("combo", 0)
        peak[0] = max(peak[0], c)
        return peak[0] >= 0.75 and c < peak[0]

    ok(until(full, 30000, 200), f"the whole floor on the beat: the combo fills ({peak[0]}) and goes off (fireworks), starting again")

    # the recap
    amy.get_by_role("button", name="结束这一场").click()
    ok(until(lambda: "Best on the beat: Amy" in text(tv, ".dj-end"), 5000), f"the night's recap: the best on the beat ({text(tv, '.dj-end')!r})")
    for ph in phones:
        ph.evaluate("() => clearInterval(window.__hand)")

    bad = [e for e in errs + [x for ph in phones for x in ph._errs] if "WebSocket" not in e and "favicon" not in e]
    ok(not bad, f"no errors {bad[:3]}")
    br.close()
    if chrome is not br:
        chrome.close()

print("\nall passed" if not fails else f"\n{len(fails)} failed: {fails}")
sys.exit(1 if fails else 0)
