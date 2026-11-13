"""打碟 · DJ Booth, what the plan asked of the floor, in browsers: a TV and three phones. ❄️ next to 🔥 on
every phone, the TV counting both, the room reading them (读场: the stretch's energy leans down with
❄️, up with 🔥) and the hint telling the table what to do when it's cold; 报幕, the TV saying who a
song asked for is from as the switch into it starts (the host can turn it off); one player's two
songs 10 minutes apart (the others' go first, and the phone says why: the room held with 暂停, so
they wait); and the night's recap (今晚回顾) on the TV and the phones once the host ends the set.
The songs come on by themselves (点歌模式, the booth's only way since Nov 12).

Needs the two local servers (site/README.md), with DEV_LYRIA_ANYONE off. Headless browsers have no
voices: the check reads what the TV meant to say (`window.__said`, the dev build only).
usage: python3 scripts/dj_floor_check.py [chromium|webkit]   (the TV's browser; the phones are Chromium)
"""
import os, sys, tempfile
from playwright.sync_api import sync_playwright

sys.path.insert(0, os.path.dirname(__file__))
from party_test import until, ok, fails, phone, view  # noqa: E402
from dj_tube import key  # noqa: E402

BASE = "http://127.0.0.1:5173/"
WHICH = next((a for a in sys.argv[1:] if a in ("chromium", "webkit")), "chromium")
OUT = os.environ.get("SHOTS", os.path.join(tempfile.gettempdir(), "dj-floor"))
os.makedirs(OUT, exist_ok=True)


def deck(pg):
    return (view(pg) or {}).get("deck") or {}


def no_apple(route):
    """Apple stays out of this check: no clip, nothing found."""
    search = "/search" in route.request.url
    route.fulfill(status=200, body='{"resultCount":0,"results":[]}' if search else b"", headers={"Access-Control-Allow-Origin": "*", "Content-Type": "application/json" if search else "audio/mp4"})


def text(pg, sel):
    loc = pg.locator(sel)
    return loc.first.inner_text() if loc.count() else ""


def tap(pg, sel, n, gap_ms=450):
    for _ in range(n):
        pg.locator(sel).click()
        pg.wait_for_timeout(gap_ms)


def ask(pg, words):
    pg.locator(".djk-req-input").fill(words)
    pg.locator(".djk-req-send").click()
    # (no YouTube key here: with no video found the phone asks for a link; the remix alone)
    if until(lambda: pg.locator(".djk-need-remix").count() == 1, 5000):
        pg.locator(".djk-need-remix").click()


def said(tv):
    return tv.evaluate("() => (window.__said || []).map(x => x.text)")


def hold(tv, ph):
    """暂停 from a phone: nothing comes up next till 播放."""
    key(ph, 1).click()
    ok(until(lambda: deck(tv).get("paused", 0) > 0, 4000), "(held: the songs wait)")


def drop_into(tv, phones, style, who):
    """The song up next comes on by itself: the room held carries on from Amy's phone first; the
    speaker plays its style on the deck off the air, and the room switches into it."""
    if deck(tv).get("paused"):
        key(phones[0], 1).click()
        ok(until(lambda: not deck(tv).get("paused"), 4000), "(Amy carries on: 播放)")
    side = "b" if deck(tv).get("fader", 0) <= 0.5 else "a"
    ok(until(lambda: (deck(tv).get("sounding") or {}).get(side) == style or (deck(tv).get("now") or {}).get("by") == who, 40000, 250), f"the speaker plays {style} on deck {side.upper()}")
    ok(until(lambda: (deck(tv).get("now") or {}).get("by") == who and not deck(tv).get("drop"), 45000, 100), "it comes on by itself")


with sync_playwright() as p:
    br = getattr(p, WHICH).launch()
    chrome = br if WHICH == "chromium" else p.chromium.launch()
    tv = br.new_context(viewport={"width": 1600, "height": 900}).new_page()
    tv.route("https://audio-ssl.itunes.apple.com/**", no_apple)
    errs = []
    tv.on("pageerror", lambda e: errs.append(str(e)))
    tv.on("console", lambda m: errs.append(m.text) if m.type == "error" and "WebSocket" not in m.text else None)
    tv.goto(BASE + "dj", wait_until="load")
    code = until(lambda: tv.locator(".dj-join-code").inner_text().strip(), 15000)
    tv.locator(".dj-start-btn").click()
    ok(until(lambda: (view(tv) or {}).get("phase") == "warm", 15000), f"{WHICH}: the night starts ({code})")
    ok(until(lambda: deck(tv).get("grid"), 8000), "the speaker tells the room where its bars fall")

    phones = []
    for name in ("Amy", "Ben", "Cat"):
        ph = phone(chrome, name, "zh")
        ph.route("https://itunes.apple.com/search**", no_apple)
        ph.goto(BASE + f"#/r/{code}", wait_until="load")
        ph.locator(".join-card input").fill(name)
        ph.locator(".join-card button[type=submit]").click()
        ok(until(lambda: ph.locator(".djk-player").count() == 1, 10000), f"{name}'s phone shows the player")
        phones.append(ph)
    amy, ben, cat = phones
    pid = {n: ph.evaluate("() => window.__room.you") for n, ph in zip(("Amy", "Ben", "Cat"), phones)}

    # ❄️, and the room reading it
    ok(amy.locator(".djp-cold").count() == 1 and "冷场" in text(amy, ".djp-cold"), "❄️ beside 🔥 on every phone")
    energy0 = view(tv)["mix"]["density"]
    tap(ben, ".djp-cold", 3)
    tap(cat, ".djp-cold", 3)
    ok(until(lambda: len([c for c in view(tv).get("colds", []) if c["pid"] in (pid["Ben"], pid["Cat"])]) == 6, 3000), "six ❄️ reach the room")
    ok(until(lambda: "❄️ Ben" in text(amy, ".djp-others") or "❄️ Cat" in text(amy, ".djp-others"), 3000), f"Amy's phone shows who ({text(amy, '.djp-others')!r})")
    ok(until(lambda: "❄️ 6" in text(amy, ".djp-count"), 6000), f"and the minute's count ({text(amy, '.djp-count')!r})")
    ok(until(lambda: tv.locator(".dj-heat-n.is-cold").count() == 1 and "6" in text(tv, ".dj-heat-n.is-cold"), 6000), "the TV counts them")
    ok(view(tv)["mix"]["density"] < energy0, f"读场: the stretch's energy leans down ({energy0} to {view(tv)['mix']['density']}; Lyria plays it)")
    ok(until(lambda: "dragging" in text(tv, ".dk-hint"), 20000, 250), f"the TV's hint: change it up ({text(tv, '.dk-hint')!r})")
    tv.screenshot(path=os.path.join(OUT, f"floor-{WHICH}-tv-1-cold.png"))
    amy.screenshot(path=os.path.join(OUT, f"floor-{WHICH}-amy-1-cold.png"))
    tap(amy, ".djp-fire", 10)
    ok(until(lambda: view(tv)["mix"]["density"] > energy0, 5000), f"🔥 pulls it back up ({view(tv)['mix']['density']})")

    # 报幕: Ben's song up next, the switch into it, the TV says who it's from
    ok(said(tv) == [], "nothing said yet")
    ask(ben, "reggaeton uno")
    ok(until(lambda: (deck(tv).get("up") or {}).get("by") == pid["Ben"], 4000), "Ben's song is up next (latin)")
    drop_into(tv, phones, "latin", pid["Ben"])
    ok("Next up, a request from Ben" in said(tv), f"报幕: as the switch started the TV said who it's from ({said(tv)})")
    ok(len(said(tv)) == 1, "once")
    # (Latin plays half a minute or more, so the recap counts it: the next switch lands on time now)
    tv.wait_for_timeout(32000)

    # one player's two songs 10 minutes apart (held, so they wait their turn)
    hold(tv, amy)
    ask(cat, "techno cat")
    ok(until(lambda: (deck(tv).get("up") or {}).get("by") == pid["Cat"], 4000), "Cat's is up next")
    ben.wait_for_timeout(5200)
    ask(ben, "trance two")
    amy.wait_for_timeout(300)
    ask(amy, "afrobeats amy")
    ok(until(lambda: [r["by"] for r in deck(tv).get("reqs", [])] == [pid["Ben"], pid["Amy"]], 3000), "Ben's second waits, then Amy's")
    ok(until(lambda: "前面还有 2 首" in text(ben, ".djk-req-mine") and "10 分钟内别人的先放" in text(ben, ".djk-req-mine"), 4000), f"Ben's phone: two ahead, and why ({text(ben, '.djk-req-mine')!r})")
    ok(until(lambda: "前面还有 1 首" in text(amy, ".djk-req-mine"), 4000), f"Amy's: one ahead ({text(amy, '.djk-req-mine')!r})")
    ben.screenshot(path=os.path.join(OUT, f"floor-{WHICH}-ben-2-wait.png"))
    # the host turns 报幕 off
    amy.locator(".djp-voice").click()
    ok(until(lambda: view(tv).get("voice") is False, 3000) and "关" in text(amy, ".djp-voice"), "the host turns 报幕 off from her phone")
    drop_into(tv, phones, "techno", pid["Cat"])
    ok(len(said(tv)) == 1, "off: the TV says nothing for Cat's")
    ok(until(lambda: (deck(tv).get("up") or {}).get("by") == pid["Amy"], 4000), "Cat's lands: Amy's comes up ahead of Ben's")
    hold(tv, amy)
    tv.wait_for_timeout(32000)

    # the night's recap
    amy.get_by_role("button", name="结束这一场").click()
    ok(until(lambda: (view(tv) or {}).get("phase") == "end", 5000), "the host ends the set")
    ok(until(lambda: "Tonight's recap" in text(tv, ".dj-end"), 4000), "the TV shows the night's recap")
    end_text = text(tv, ".dj-end")
    ok("of music" in end_text and "Played most:" in end_text and "Techno" in end_text and "Latin" in end_text, f"how long, and the styles played most ({end_text!r})")
    ok("2 songs asked for played" in end_text and "Ben asked for a song" in end_text and "reggaeton" not in end_text, "the songs that played: who asked, never what they typed")
    perfect = (deck(tv).get("perfects") or {}).get(pid["Amy"], 0)
    ok("Most fired up: Amy" in end_text and (("Perfect drops: Amy" in end_text) == (perfect > 0)), f"who was most fired up, and Amy's perfect drops ({perfect})")
    ok("The sound never broke tonight" in end_text, "and the sound held up")
    tv.screenshot(path=os.path.join(OUT, f"floor-{WHICH}-tv-3-recap.png"))
    ok(until(lambda: "今晚回顾" in text(ben, ".djp-recap"), 4000), "Ben's phone shows it too")
    ok("你：🔥 0 次" in text(ben, ".djp-recap") and "点的歌放了 1 首" in text(ben, ".djp-recap") and "reggaeton uno" in text(ben, ".djp-recap"), f"with his own line, and his song by name for him ({text(ben, '.djp-recap')!r})")
    ok("reggaeton uno" not in text(cat, ".djp-recap") and "Ben 点了一首歌" in text(cat, ".djp-recap"), "Cat reads only that Ben asked for one")
    ben.screenshot(path=os.path.join(OUT, f"floor-{WHICH}-ben-3-recap.png"))
    st = tv.evaluate("() => window.__djBooth.stats()")
    ok(st["stalls"] == 0, f"the music never stalled ({st})")

    bad = [e for e in errs + [x for ph in phones for x in ph._errs] if "WebSocket" not in e and "favicon" not in e]
    ok(not bad, f"no errors {bad[:3]}")
    br.close()
    if chrome is not br:
        chrome.close()

print("\nall passed" if not fails else f"\n{len(fails)} failed: {fails}")
sys.exit(1 if fails else 0)
