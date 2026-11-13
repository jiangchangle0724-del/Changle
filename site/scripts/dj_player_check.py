"""打碟 · DJ Booth: the player on every phone (Steve on Nov 12: "把截图2 3功能去掉，不需要drop了，把dance
along 放到最下面，手机上点完歌后可以直接在玩家手机上一键播放，切歌，暂停，上一曲"), in browsers: a TV
and two phones.

What it checks: a phone has the player at the very top (上一曲, 暂停 or 播放, 切歌; the card with the
night's stretch gone, Steve's second message that night), then the song box, the 歌单 and the sound
pads, and 跟着跳 at the very bottom; no turntables, mixer, crossfader, build-up, DROP, picks or switch
to them. A song asked for plays by itself; anyone pauses it (the TV's video stops where it is, the
DJ stays quiet) and carries it on (from there, not from its start); 切歌 brings the next on in a few
seconds, its keys not grey while it comes on; 上一曲 the one before, the one that was playing first
on the 歌单 again; paused between songs, the DJ goes quiet too and comes back on 播放. One phone asks
for many songs in a row (Steve: at least 24 each). A TV that wants a tap on its video says so on
the phones, and its own 点歌 sheet gets out of the video's way.

The TV's YouTube player is the stand-in of dj_tube.py (this machine can't play YouTube).
Needs the two local servers (site/README.md).
usage: python3 scripts/dj_player_check.py
"""
import json, os, sys, tempfile
from playwright.sync_api import sync_playwright

sys.path.insert(0, os.path.dirname(__file__))
from party_test import until, ok, fails, phone, view  # noqa: E402
from dj_tube import FAKE_YT, deck, key  # noqa: E402

BASE = "http://127.0.0.1:5173/"
OUT = os.environ.get("SHOTS", os.path.join(tempfile.gettempdir(), "dj-player"))
os.makedirs(OUT, exist_ok=True)
A_ID, B_ID, C_ID, T_ID = "playerone01", "playertwo02", "playerthr03", "playertap04"


def yt_api(route):
    url = route.request.url
    hdr = {"Access-Control-Allow-Origin": "*", "Content-Type": "application/json"}
    if "/yt/info" in url:
        vid = url.split("id=")[1][:11]
        return route.fulfill(status=200, body=json.dumps({"id": vid, "t": f"Song {vid}", "a": "Some channel"}), headers=hdr)
    return route.fulfill(status=200, body='{"nokey":true}', headers=hdr)


def text(pg, sel):
    loc = pg.locator(sel)
    return loc.first.inner_text() if loc.count() else ""


def ask(ph, vid):
    """A pasted link, its video found, asked for."""
    ph.locator(".djk-req-input").fill(f"https://youtu.be/{vid}")
    ok(until(lambda: ph.locator(".djk-req-hit.is-yt").count() > 0, 4000), f"{ph._name} pastes a link ({vid})")
    ph.locator(".djk-req-hit.is-yt").first.click()
    ph.locator(".djk-req-send").click()


def yt(tv):
    return tv.evaluate("() => window.__yt && { video: window.__yt.video, state: window.__yt.state, t: window.__yt.t }") or {}


def heard(tv, vid):
    return tv.evaluate("(v) => ((window.__yt && window.__yt.heard) || []).filter((x) => x.video === v).length", vid)


def dj_level(tv):
    return tv.evaluate("() => window.__fakeDj.speaker.talkFade.gain.value")


with sync_playwright() as p:
    br = p.chromium.launch()
    tvc = br.new_context(viewport={"width": 1600, "height": 900})
    tv = tvc.new_page()
    tv.route("https://www.youtube.com/iframe_api", lambda r: r.fulfill(status=200, body=FAKE_YT, headers={"Content-Type": "text/javascript"}))
    errs = []
    tv.on("pageerror", lambda e: errs.append(str(e)))
    tv.on("console", lambda m: errs.append(m.text) if m.type == "error" and "WebSocket" not in m.text else None)
    forbidden = []
    tv.on("response", lambda r: forbidden.append(r.url) if r.status == 403 else None)
    tv.goto(BASE + "dj", wait_until="load")
    code = until(lambda: tv.locator(".dj-join-code").inner_text().strip(), 15000)
    tv.locator(".dj-start-btn").click()
    ok(until(lambda: (view(tv) or {}).get("phase") == "warm", 15000), f"the night starts ({code})")
    ok(until(lambda: deck(tv).get("grid"), 10000), "the speaker tells the room where its bars fall")
    ok((view(tv) or {}).get("juke") is True, "the songs play one after another (点歌模式), with nobody switching it on")

    phones = []
    for name, lang in (("Amy", "zh"), ("Ben", "zh"), ("Cat", "en")):
        ph = phone(br, name, lang)
        ph.on("response", lambda r: forbidden.append(r.url) if r.status == 403 else None)
        ph.route("http://127.0.0.1:8787/api/yt/**", yt_api)
        ph.goto(BASE + f"#/r/{code}", wait_until="load")
        ph.locator(".join-card input").fill(name)
        ph.locator(".join-card button[type=submit]").click()
        ok(until(lambda: ph.locator(".djk-player").count() == 1, 10000), f"{name}'s phone shows the player")
        phones.append(ph)
    amy, ben, cat = phones
    ok("Previous" in key(cat, 0).inner_text() and "Pause" in key(cat, 1).inner_text() and "Next" in key(cat, 2).inner_text(), "in English too")

    # the page: the player first, then the song box, the 歌单, the pads; 跟着跳 at the very bottom
    order = ben.evaluate("""() => [...document.querySelectorAll('.djk > *')].map((e) => e.className.split(' ')[0])""")
    ok(order[:2] == ["djk-player", "djk-req"] and order[-1] == "djk-sounds", f"the player at the top, the song box under it, the pads last ({order})")
    last = ben.evaluate("""() => { const kids = [...document.querySelector('.djp').children]; return kids[kids.length - 1].className; }""")
    ok("djk-dance" in last, f"跟着跳 at the very bottom of the page ({last!r})")
    first = ben.evaluate("""() => document.querySelector('.djp').firstElementChild.className""")
    ok(ben.locator(".djp-now").count() == 0 and first.startswith("djk"), f"no card with the night's stretch at the top: the player is the first thing ({first!r})")
    gone = ben.evaluate("""() => ['.djk-console', '.djk-platter', '.djk-vinyl', '.djk-fader', '.djk-mix', '.djk-charge', '.djk-drop', '.djk-picks', '.djk-juke', '.djk-hint', '.djk-song'].filter((s) => document.querySelector(s))""")
    ok(not gone, f"no turntables, mixer, crossfader, build-up, DROP, picks, nor a switch to them ({gone})")
    ok(ben.locator(".djk-pad").count() == 12, "the twelve sound pads are there")
    ok(key(ben, 0).is_disabled() and key(ben, 2).is_disabled() and not key(ben, 1).is_disabled(), "nothing played yet, nothing up: 上一曲 and 切歌 wait, 暂停 is there")
    ok("暂停" in key(ben, 1).inner_text() and "上一曲" in key(ben, 0).inner_text() and "切歌" in key(ben, 2).inner_text(), "the keys say what they do")
    sizes = ben.evaluate("() => [...document.querySelectorAll('.djk-key')].map((b) => Math.round(b.getBoundingClientRect().height))")
    ok(all(h >= 48 for h in sizes), f"each key big enough to hit together ({sizes} px)")
    ben.screenshot(path=os.path.join(OUT, "player-ben-0-empty.png"), full_page=True)

    # a song asked for plays by itself
    ask(amy, A_ID)
    ok(until(lambda: heard(tv, A_ID) > 0, 20000), "Amy's song starts by itself on the TV")
    ok(until(lambda: "电视上在放" in text(ben, ".djk-player-kicker") and "Amy" in text(ben, ".djk-player-by"), 4000), f"Ben's player says what's on, and whose ({text(ben, '.djk-player-now')!r})")
    ben.wait_for_timeout(5200)
    ask(ben, B_ID)
    ok(until(lambda: "下一首" in text(amy, ".djk-player-next"), 4000), f"and what's next ({text(amy, '.djk-player-next')!r})")
    ok(until(lambda: not key(amy, 2).is_disabled(), 3000), "切歌 is ready")
    amy.screenshot(path=os.path.join(OUT, "player-amy-1-song.png"), full_page=True)

    # 暂停: Ben's (not the host, not his song); the video stops where it is, the DJ stays quiet
    amy.wait_for_timeout(1500)
    key(ben, 1).click()
    ok(until(lambda: deck(tv).get("paused", 0) > 0, 3000), "Ben pauses: the room holds its music")
    ok(until(lambda: yt(tv).get("state") == 2, 3000), f"the TV's video stops ({yt(tv)})")
    t_held = yt(tv).get("t", 0)
    ok(t_held > 1, f"where it was, not back at its start ({t_held:.1f} s in)")
    tv.wait_for_timeout(1500)
    ok(dj_level(tv) < 0.05, f"the DJ stays quiet ({dj_level(tv):.2f})")
    ok(until(lambda: "暂停了" in text(tv, ".dj-tube-note") or "Paused" in text(tv, ".dj-tube-note"), 3000), f"the TV says so ({text(tv, '.dj-tube-note')!r})")
    ok(until(lambda: "暂停了" in text(amy, ".djk-player-kicker") and "播放" in key(amy, 1).inner_text(), 3000), "Amy's phone says it's paused, the key now 播放")
    ok(abs(yt(tv).get("t", 0) - t_held) < 0.05, "it stays where it is")
    ok(amy.locator(".djk-pad.is-echo").is_disabled() and not amy.locator(".djk-pad.is-horn").is_disabled(), "the DJ's pads wait, the air horn still sounds")
    amy.screenshot(path=os.path.join(OUT, "player-amy-2-paused.png"))
    tv.screenshot(path=os.path.join(OUT, "player-tv-2-paused.png"))

    # 播放: from where it stopped
    key(amy, 1).click()
    ok(until(lambda: deck(tv).get("paused", 1) == 0 and yt(tv).get("state") == 1, 4000), f"Amy carries it on ({yt(tv)})")
    ok(yt(tv).get("t", 0) >= t_held - 0.05 and yt(tv).get("t", 0) < t_held + 3, f"from where it stopped ({yt(tv).get('t', 0):.1f} s)")
    tv.wait_for_timeout(800)
    ok(dj_level(tv) < 0.05, "the DJ stays out of the song's way")
    ok("暂停" in key(ben, 1).inner_text(), "the key is 暂停 again")

    # 切歌: the next one in a few seconds
    key(ben, 2).click()
    ok(until(lambda: bool(deck(tv).get("drop")), 3000) and not key(amy, 2).is_disabled() and not key(amy, 0).is_disabled(), "while Ben's is coming on, 切歌 and 上一曲 aren't grey")
    ok(until(lambda: (deck(tv).get("song") or {}).get("yt") == B_ID, 8000), "Ben skips it: his own comes on")
    ok(until(lambda: heard(tv, B_ID) > 0, 10000), "and is heard on the TV")
    ok(until(lambda: "Ben" in text(amy, ".djk-player-by") or "你点的" in text(amy, ".djk-player-by"), 3000) and "你点的" in text(ben, ".djk-player-by"), "the phones say whose it is (Ben's own: 你点的)")

    # 上一曲: Amy's again, Ben's first on the 歌单 after it
    ben.wait_for_timeout(1700)
    ok(until(lambda: not key(amy, 0).is_disabled(), 3000), "上一曲 is ready (a song before this one)")
    n_a = heard(tv, A_ID)
    key(amy, 0).click()
    ok(until(lambda: (deck(tv).get("song") or {}).get("yt") == A_ID, 8000), "Amy goes back: her song comes on again")
    ok(until(lambda: heard(tv, A_ID) > n_a, 10000), "heard again on the TV")
    ok(until(lambda: (deck(tv).get("up") or {}).get("yt") == B_ID, 3000), "Ben's comes after it again")
    ok(until(lambda: "下一首" in text(ben, ".djk-player-next"), 3000), f"his phone says so ({text(ben, '.djk-player-next')!r})")

    # paused between songs: the DJ quiet too, back on 播放
    ben.wait_for_timeout(1700)
    key(ben, 2).click()
    ok(until(lambda: heard(tv, B_ID) > 1 and (deck(tv).get("song") or {}).get("yt") == B_ID, 12000), "切歌 again: Ben's plays")
    tv.wait_for_timeout(1000)
    tv.evaluate("() => window.__yt.end()")
    back = until(lambda: deck(tv).get("song") is None and dj_level(tv) > 0.9, 6000)
    ok(back, "it ends, nothing up next: the DJ plays")
    if not back:
        dk = deck(tv)
        print("   deck:", {k: dk.get(k) for k in ("song", "up", "drop", "paused", "reqs")}, "dj:", dj_level(tv))
        print("   tube:", tv.evaluate("() => window.__tube && window.__tube.log.slice(-10)"))
        print("   yt:", tv.evaluate("() => window.__yt && window.__yt.log.slice(-10)"))
    ok(until(lambda: "DJ 在放" in text(amy, ".djk-player-kicker"), 3000) and key(amy, 2).is_disabled(), "the phones say the DJ plays, nothing to skip to")
    key(amy, 1).click()
    ok(until(lambda: dj_level(tv) < 0.05, 3000), f"Amy pauses the DJ: quiet ({dj_level(tv):.2f})")
    ok(until(lambda: "暂停了" in text(tv, ".dk-hint") or "Paused" in text(tv, ".dk-hint"), 3000), f"the TV's line says so ({text(tv, '.dk-hint')!r})")
    key(ben, 1).click()
    ok(until(lambda: dj_level(tv) > 0.9, 4000), "Ben presses 播放: the DJ is back")

    # one phone, many songs in a row (Steve: "一个人一次性可以至少点24首歌"; it was 3): held, so they wait
    key(amy, 1).click()
    ok(until(lambda: deck(tv).get("paused", 0) > 0, 3000), "(held)")
    many = [f"manysongs0{k}" for k in range(1, 7)]
    for vid in many:
        ask(cat, vid)
        cat.wait_for_timeout(1100)
    cats = lambda: [r for r in deck(tv).get("reqs", []) + [deck(tv).get("up") or {}] if r.get("yt") in many]
    ok(until(lambda: len(cats()) == len(many), 4000), f"Cat asks for {len(many)} in a row: all on the 歌单 ({len(cats())})")
    ok(until(lambda: "Up next" in text(cat, ".djk-player-next") or "more on the playlist" in text(cat, ".djk-player-next"), 3000), f"her player says what's next ({text(cat, '.djk-player-next')!r})")
    key(amy, 1).click()

    # a TV that wants a tap on its video first (as an iPhone does): the phones say so
    tv.add_init_script("window.__tubeTapFirst = true; window.__ytConf = { sound: false };")
    tv.reload(wait_until="load")
    tv.locator(".dj-start-btn").click()
    ok(until(lambda: tv.evaluate("() => !!(window.__djBooth && window.__djBooth.stats() && window.__djBooth.stats().state === 'playing')"), 20000), "the TV, opened again, plays on after its start tap")
    # (the big screen's own 点歌 sheet open over it: it gets out of the way, so the tap lands on the video)
    tv.locator(".dj-share-btn").click()
    ok(until(lambda: tv.locator(".ui-sheet[open] .dj-share").count() == 1, 4000), "the TV's own 点歌 sheet is open")
    ask(amy, T_ID)
    ok(until(lambda: amy.locator(".djk-player-tap").count() == 1, 20000), f"the TV wants a tap on its video: the phones say so ({text(amy, '.djk-player-tap')!r})")
    ok(until(lambda: tv.locator(".ui-sheet[open]").count() == 0, 3000), "and the TV's sheet closes, out of the video's way")
    amy.screenshot(path=os.path.join(OUT, "player-amy-3-tap.png"))
    tv.evaluate("() => window.__yt.userTap()")
    ok(until(lambda: amy.locator(".djk-player-tap").count() == 0, 8000), "someone taps it: the word goes")

    bad = [e for e in errs + [x for ph in phones for x in ph._errs] if "WebSocket" not in e and "favicon" not in e]
    ok(not bad, f"no errors {bad[:3]} {forbidden[:3]}")
    br.close()

print("\nall passed" if not fails else f"\n{len(fails)} failed: {fails}")
sys.exit(1 if fails else 0)
