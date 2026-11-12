"""打碟 · DJ Booth, the shared phone (Steve on Nov 11: "公用手机（投屏电视）另外进入这个页面之后手机自动旋转屏幕
到横屏，直接开始播放音乐，并且这个手机是可以在YouTube上点歌的"), in browsers: a phone held sideways that
everyone shares, two phones scanned in, a computer.

What it checks: on a phone the game's card offers 公用手机（投屏电视） first; its one tap opens the
speaker page, goes full screen (where the browser lets a page: an iPhone can't, and turning sideways
is asked instead) and starts the music with no other tap, in 点歌模式. Its 点歌 button opens the
sheet: a pasted link goes in as the shared phone's (not one of anyone's three), the badge counts the
playlist, the TV names it 公用手机's, and it plays whole in its corner; the phones at the table read
it by name and only the host can take it out; the sheet skips the song playing, takes its own song
back, switches 随机 and back to the build-up and DROP. Held upright, the phone is asked to turn
sideways (or keep it upright). On a computer the card's button is 这台电脑当音箱 and starts the music
the same way; the booth opened at its address still asks for the tap that starts the party.

Needs the two local servers (site/README.md), with DEV_LYRIA_ANYONE off.
usage: python3 scripts/dj_shared_check.py
"""
import json, os, sys, tempfile
from playwright.sync_api import sync_playwright

sys.path.insert(0, os.path.dirname(__file__))
from party_test import until, ok, fails, phone, view  # noqa: E402
from dj_tube import FAKE_YT, deck  # noqa: E402

BASE = "http://127.0.0.1:5173/"
OUT = os.environ.get("SHOTS", os.path.join(tempfile.gettempdir(), "dj-shared"))
os.makedirs(OUT, exist_ok=True)
SONG, MORE = "kJQP7kiw5Fk", "abcdefghij1"
SHARED = "~shared"


def yt_api(route):
    """The rooms server's YouTube lookup, standing in: a pasted link's video, by name."""
    url = route.request.url
    vid = url.split("id=")[1][:11] if "id=" in url else SONG
    named = {SONG: ("Despacito (official video)", "Luis Fonsi"), MORE: ("Another song", "Someone")}
    t, a = named.get(vid, ("Some song", "Some channel"))
    route.fulfill(status=200, body=json.dumps({"id": vid, "t": t, "a": a}), headers={"Access-Control-Allow-Origin": "*", "Content-Type": "application/json"})


def text(pg, sel):
    loc = pg.locator(sel)
    return loc.first.inner_text() if loc.count() else ""


def speaker(br, lang, **ctx):
    c = br.new_context(**ctx)
    c.add_init_script("localStorage.setItem('lazysusan.settings.v1', %s)" % json.dumps(json.dumps({"lang": lang, "sound": True, "music": False, "customPenalty": "", "players": []})))
    pg = c.new_page()
    pg._errs = []
    pg.on("pageerror", lambda e: pg._errs.append(str(e)))
    pg.on("console", lambda m: pg._errs.append(m.text) if m.type == "error" and "WebSocket" not in m.text else None)
    pg.route("https://www.youtube.com/iframe_api", lambda r: r.fulfill(status=200, body=FAKE_YT, headers={"Content-Type": "text/javascript"}))
    pg.route("http://127.0.0.1:8787/api/yt/**", yt_api)
    pg.route("https://itunes.apple.com/**", lambda r: r.abort())
    return pg


def ask(pg, vid):
    """The shared phone's sheet: a pasted link, its video picked, asked for."""
    pg.locator(".dj-share .djk-req-input").fill(f"https://youtu.be/{vid}")
    ok(until(lambda: pg.locator(".dj-share .djk-req-hit.is-yt").count() > 0, 6000), f"a pasted link: its video ({vid})")
    pg.locator(".dj-share .djk-req-hit.is-yt").first.click()
    pg.locator(".dj-share .djk-req-send").click()


with sync_playwright() as p:
    br = p.chromium.launch()

    # the shared phone, sideways
    sp = speaker(br, "zh", viewport={"width": 844, "height": 390}, device_scale_factor=2, is_mobile=True, has_touch=True)
    sp.goto(BASE + "g/dj-booth", wait_until="load")
    btn = sp.locator(".mode-btn.mode-primary")
    ok(until(lambda: "公用手机（投屏电视）" in btn.inner_text(), 8000), f"on a phone the card offers the shared phone first ({btn.inner_text()!r})")
    sp.screenshot(path=os.path.join(OUT, "shared-1-card.png"))
    btn.click()
    ok(until(lambda: (view(sp) or {}).get("phase") == "warm", 20000), "one tap: the speaker page, and the night starts by itself")
    ok(sp.locator(".dj-start").count() == 0, "no 开始派对 tap needed")
    ok(until(lambda: sp.evaluate("() => !!(window.__djBooth && window.__djBooth.stats() && window.__djBooth.level() >= 0)"), 8000), "the music plays here")
    ok(sp.evaluate("() => !!document.fullscreenElement"), "full screen (the browser lets this page: Chromium on a phone)")
    ok(until(lambda: (view(sp) or {}).get("juke") is True, 8000), "点歌模式: nobody needs to be at the table")
    code = until(lambda: sp.locator(".dj-join-code").inner_text().strip(), 8000)
    sp.wait_for_timeout(1200)
    sp.screenshot(path=os.path.join(OUT, "shared-2-speaker.png"))

    # two phones scan in: Amy (the host), Ben
    phones = []
    for name in ("Amy", "Ben"):
        ph = phone(br, name, "zh")
        ph.route("http://127.0.0.1:8787/api/yt/**", yt_api)
        ph.route("https://itunes.apple.com/**", lambda r: r.abort())
        ph.goto(BASE + f"#/r/{code}", wait_until="load")
        ph.locator(".join-card input").fill(name)
        ph.locator(".join-card button[type=submit]").click()
        ok(until(lambda: ph.locator(".djk-pad").count() == 12, 15000), f"{name}'s phone shows the deck")
        phones.append(ph)
    amy, ben = phones

    # 点歌 on the shared phone
    share = sp.locator(".dj-share-btn")
    ok(share.count() == 1 and "点歌" in share.inner_text(), "the shared phone's 点歌 button")
    box = share.bounding_box()
    ok(box and box["width"] >= 48 and box["height"] >= 48, f"big enough to tap ({box and round(box['width'])} x {box and round(box['height'])})")
    share.click()
    ok(until(lambda: sp.locator(".ui-sheet[open] .dj-share").count() == 1, 6000), "it opens the song sheet")
    ok("点歌" in text(sp, ".ui-sheet[open] .ui-sheet-heading"), "titled 点歌")
    ok(sp.locator(".dj-share .djk-juke button[aria-pressed=true]").inner_text().strip().endswith("点歌模式"), "点歌模式 switched on, in the sheet")
    ask(sp, SONG)
    ok(until(lambda: (deck(sp).get("up") or deck(sp).get("now") or {}).get("by") == SHARED, 6000), "it goes in as the shared phone's")
    ok(until(lambda: "下一首就是你点的" in text(sp, ".dj-share .djk-req-mine") or bool(deck(sp).get("song")), 6000), f"the sheet says it's next ({text(sp, '.dj-share .djk-req-mine')!r})")
    sp.screenshot(path=os.path.join(OUT, "shared-3-sheet.png"))
    sp.keyboard.press("Escape")
    ok(until(lambda: sp.locator(".ui-sheet[open]").count() == 0, 4000), "the sheet closes")
    ok(until(lambda: (deck(sp).get("song") or {}).get("by") == SHARED, 15000), "a few seconds on it plays whole")
    ok(until(lambda: "公用手机" in text(sp, ".dj-tube"), 6000), f"the TV says whose it is ({text(sp, '.dj-tube-head')!r})")
    tb = sp.locator(".dj-tube").bounding_box()
    sb = share.bounding_box()
    ok(tb and sb and sb["x"] >= tb["x"] + tb["width"] - 2, "the 点歌 button beside the video's corner, not over it")
    ok(until(lambda: "公用手机" in text(ben, ".djk-song-title"), 6000), f"Ben's phone says whose song plays ({text(ben, '.djk-song-title')!r})")
    sp.wait_for_timeout(800)
    sp.screenshot(path=os.path.join(OUT, "shared-4-song.png"))

    # another one while it plays: the playlist, read by the phones; only the host takes it out
    sp.wait_for_timeout(5200)
    share.click()
    until(lambda: sp.locator(".ui-sheet[open] .dj-share").count() == 1, 6000)
    ask(sp, MORE)
    ok(until(lambda: any(r.get("by") == SHARED for r in [deck(sp).get("up") or {}] + deck(sp).get("reqs", [])), 6000), "a second one, up next")
    ok(until(lambda: share.locator(".dj-share-n").count() == 1 and share.locator(".dj-share-n").inner_text() == "1", 4000), "the button counts the playlist")
    row = lambda pg: pg.locator(".djk-list-row").filter(has_text="Another song")
    ok(until(lambda: row(ben).count() == 1 and "公用手机" in row(ben).inner_text(), 6000), f"Ben reads it by name, the shared phone's ({row(ben).inner_text() if row(ben).count() else ''!r})")
    ok(row(ben).locator(".djk-list-out").count() == 0 and row(amy).locator(".djk-list-out").count() == 1, "only the host can take it out")
    # the song playing skipped from the sheet
    ok(sp.locator(".dj-share .djk-song").count() == 1, "the sheet shows the song playing")
    sp.locator(".dj-share .djk-song button:not([aria-pressed])").click()
    ok(until(lambda: deck(sp).get("song") is None or (deck(sp).get("song") or {}).get("yt") == MORE, 6000), "skipped from the shared phone")
    # its own taken back (the one up next, before it starts)
    if (deck(sp).get("up") or {}).get("by") == SHARED:
        row(sp).locator(".djk-list-out").click()
        ok(until(lambda: not any(r.get("by") == SHARED for r in [deck(sp).get("up") or {}] + deck(sp).get("reqs", [])), 4000), "the shared phone takes its own back")
    # 随机, and back to the build-up and DROP
    sp.locator(".dj-share .djk-list-seg button").nth(1).click()
    ok(until(lambda: (view(sp) or {}).get("shuffle") is True, 4000), "随机 from the shared phone")
    sp.locator(".dj-share .djk-list-seg button").nth(0).click()
    ok(until(lambda: (view(sp) or {}).get("shuffle") is False, 4000), "and 按顺序")
    sp.locator(".dj-share .djk-juke button").nth(0).click()
    ok(until(lambda: (view(sp) or {}).get("juke") is False and ben.locator(".djk-build").count() == 1, 4000), "back to the build-up and DROP: the phones have it again")
    sp.keyboard.press("Escape")

    # held upright: asked to turn sideways, or keep it so
    sp.evaluate("() => document.fullscreenElement && document.exitFullscreen()")
    sp.wait_for_timeout(500)
    sp.set_viewport_size({"width": 390, "height": 844})
    ok(until(lambda: sp.locator(".dj-turn").count() == 1, 4000), "held upright: turn it sideways")
    ok("横过来" in text(sp, ".dj-turn-title") and "自动旋转" in text(sp, ".dj-turn-text"), f"how (this one isn't an iPhone: {text(sp, '.dj-turn-text')!r})")
    sp.screenshot(path=os.path.join(OUT, "shared-5-upright.png"))
    sp.locator(".dj-turn button").click()
    ok(sp.locator(".dj-turn").count() == 0, "就竖着用: it goes")
    sp.set_viewport_size({"width": 844, "height": 390})
    ok(sp.locator(".dj-turn").count() == 0, "sideways: nothing to ask")

    errs = [e for e in sp._errs + [x for ph in phones for x in ph._errs] if "WebSocket" not in e and "favicon" not in e]
    ok(not errs, f"no errors {errs[:3]}")
    for pg in [sp] + phones:
        pg.context.close()

    # a computer: the card's button is this computer, and the music starts the same way
    pc = speaker(br, "en", viewport={"width": 1600, "height": 900})
    pc.goto(BASE + "g/dj-booth", wait_until="load")
    pb = pc.locator(".mode-btn.mode-primary")
    ok(until(lambda: "This computer is the speaker" in pb.inner_text(), 8000), f"on a computer, in English: {pb.inner_text()!r}")
    pb.click()
    ok(until(lambda: (view(pc) or {}).get("phase") == "warm", 20000) and pc.locator(".dj-start").count() == 0, "the music starts with no other tap")
    ok(not pc.evaluate("() => !!document.fullscreenElement"), "no full screen on a computer")
    ok(pc.locator(".dj-share-btn").inner_text().strip() == "Songs", "its own 点歌, in English")
    pc.wait_for_timeout(1200)
    pc.screenshot(path=os.path.join(OUT, "shared-6-computer.png"))
    pc.context.close()

    # the booth opened at its own address: no tap yet, so it asks for one
    tv = speaker(br, "zh", viewport={"width": 1600, "height": 900})
    tv.goto(BASE + "dj", wait_until="load")
    ok(until(lambda: tv.locator(".dj-start-btn").count() == 1, 10000) and (view(tv) or {}).get("phase") == "wait", "opened at changle.ca/dj: 开始派对 first, as before")
    tv.context.close()
    br.close()

print("\nall passed" if not fails else f"\n{len(fails)} failed: {fails}")
sys.exit(1 if fails else 0)
