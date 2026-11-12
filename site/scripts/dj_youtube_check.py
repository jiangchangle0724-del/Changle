"""打碟 · DJ Booth, whole songs from YouTube (Steve on Nov 2: "换成 YouTube 放整首"; on Nov 4: a song picked
from the list didn't play the song itself, and the video took seconds to start after the drop), in
browsers: a TV and three phones.

The TV's YouTube player is a stand-in that behaves like the real one (this machine can't play
YouTube): it takes a moment to load, buffers a video's start the first time it plays, plays an ad
first when told to, refuses a video its owner keeps on YouTube, and, like Safari, can want a tap on
the video before it plays with sound. The rooms server's YouTube lookups are stood in for on the
phones (the key on, or off).

What it checks: a song up next waits ready in a corner of the TV (loaded, its start buffered, held
at 0:00); on its drop's bar it starts (within a fraction of a second, heard) and comes to the
middle, the DJ letting go on that bar, not before; it ends, or its player skips it, and the DJ
comes back. An ad plays out muted in the corner before the song is ready. A song picked from the
song list goes in with its video when the search finds one (one search, none while typing it); with
no key the phone asks for the song's link (YouTube's own search a tap away), and a link pasted
there plays it whole; or it goes in as the remix alone. A video YouTube won't play here comes off
the song (its player's phone says why) and its drop plays the remix. A TV that wants a tap: one tap
on the video in its corner and it starts by itself on the drop; untapped, the DJ plays on until
someone taps. Over a song the pads that are a sound of their own still play; the 歌单 on every
phone, the host's 随机. Nothing goes to Apple.

Needs the two local servers (site/README.md), with DEV_LYRIA_ANYONE off.
usage: python3 scripts/dj_youtube_check.py [chromium|webkit]   (the TV's browser; the phones are Chromium)
"""
import json, os, sys, tempfile, time, urllib.parse
from playwright.sync_api import sync_playwright

sys.path.insert(0, os.path.dirname(__file__))
from party_test import until, ok, fails, phone, view  # noqa: E402
from dj_tube import FAKE_YT, deck, drop_into, press_drop  # noqa: E402

BASE = "http://127.0.0.1:5173/"
WHICH = next((a for a in sys.argv[1:] if a in ("chromium", "webkit")), "chromium")
OUT = os.environ.get("SHOTS", os.path.join(tempfile.gettempdir(), "dj-youtube"))
os.makedirs(OUT, exist_ok=True)
BEN_ID, CAT_ID, QT_ID, LINK_ID, AD_ID, BAD_ID, ZZ_ID, SAF1, SAF2 = "kJQP7kiw5Fk", "fRh_vgS2dFE", "qingtian001", "pastedlink1", "withanad001", "notallowed1", "zzpartymix1", "safarione01", "safaritwo01"
JK1, JK2 = "jukeboxone1", "jukeboxtwo1"

# the speaker's DJ (its fade under a whole song), every 20 ms, on the audio clock
SAMPLER = """try { new PerformanceObserver((l) => { for (const e of l.getEntries()) (window.__long ||= []).push([Math.round(e.startTime), Math.round(e.duration)]); }).observe({ type: 'longtask', buffered: true }); } catch (e) {}
setInterval(() => { const sp = window.__fakeDj && window.__fakeDj.speaker; if (!sp) return; (window.__fades ||= []).push([sp.ctx.currentTime, sp.talkFade.gain.value]); if (window.__fades.length > 4000) window.__fades.splice(0, 2000); }, 20);"""

apple, searches = [], []
key_on = [True]


def text(pg, sel):
    loc = pg.locator(sel)
    return loc.first.inner_text() if loc.count() else ""


def yt_api(route):
    url = route.request.url
    hdr = {"Access-Control-Allow-Origin": "*", "Content-Type": "application/json"}
    if "/yt/info" in url:
        vid = url.split("id=")[1][:11]
        named = {BEN_ID: ("Despacito (official video)", "Luis Fonsi"), QT_ID: ("周杰倫 Jay Chou【晴天 Sunny Day】", "JVR Music"), LINK_ID: ("Pasted song", "Someone")}
        t, a = named.get(vid, ("Some song", "Some channel"))
        return route.fulfill(status=200, body=json.dumps({"id": vid, "t": t, "a": a}), headers=hdr)
    q = urllib.parse.unquote_plus(url.split("q=")[1]) if "q=" in url else ""
    searches.append(q)
    if not key_on[0]:
        return route.fulfill(status=200, body='{"nokey":true}', headers=hdr)
    hit = {"id": CAT_ID, "t": "Shape of You (Official Video)", "a": "Ed Sheeran"} if "shape of you" in q.lower() else {"id": QT_ID, "t": "周杰倫 Jay Chou【晴天 Sunny Day】", "a": "JVR Music"} if "晴天" in q else {"id": ZZ_ID, "t": "ZZ party mix", "a": "Some channel"}
    return route.fulfill(status=200, body=json.dumps({"hits": [hit]}), headers=hdr)


def last_drop(tv):
    return tv.evaluate("() => { const l = window.__djBooth.deck().log.filter((x) => x.k === 'drop'); return l.length ? l[l.length - 1].at : null; }")


def heard_at(tv, vid, after=None):
    """When the whole song was first heard (after audio time `after`), on the audio clock (None: not yet)."""
    return tv.evaluate("([v, a]) => { const h = ((window.__yt && window.__yt.heard) || []).filter((x) => x.video === v && (a === null || x.ctx >= a)); return h.length ? h[0].ctx : null; }", [vid, after])


def fade_at(tv, t):
    """The DJ's level at audio time t (the sampler's nearest reading)."""
    return tv.evaluate("(t) => { const f = window.__fades || []; let best = null; for (const x of f) if (best === null || Math.abs(x[0] - t) < Math.abs(best[0] - t)) best = x; return best ? best[1] : null; }", t)


def fade_most(tv, t0, t1):
    return tv.evaluate("([a, b]) => Math.max(0, ...(window.__fades || []).filter((x) => x[0] >= a && x[0] <= b).map((x) => x[1]))", [t0, t1])


def on_the_drop(tv, vid, what):
    """The song is heard on its drop's bar, and the DJ lets go on that bar, not before."""
    ok(until(lambda: last_drop(tv) is not None and heard_at(tv, vid, last_drop(tv) - 1) is not None, 8000, 50), f"{what}: the song is heard")
    at = last_drop(tv)
    h = heard_at(tv, vid, at - 1)
    off = (h - at) if (at is not None and h is not None) else None
    # (within a few tens of ms on an idle machine, tests/dj.test.ts; this one runs a TV and three
    # phones on two cores with no graphics chip, and the page's own timers can run 0.1 to 0.3 s late)
    ok(off is not None and abs(off) < 0.3, f"{what}: heard on the drop's bar ({'%+.0f ms' % (off * 1000) if off is not None else '?'})")
    tv.wait_for_timeout(500)
    n = tv.evaluate("([a, b]) => (window.__fades || []).filter((x) => x[0] >= a && x[0] <= b).length", [at - 0.4, at - 0.06])
    before, after = fade_most(tv, at - 0.4, at - 0.06), fade_at(tv, at + 0.35)
    ok(n >= 3 and before > 0.9 and after is not None and after < 0.05, f"{what}: the DJ plays up to the bar and lets go on it ({before:.2f} before over {n} readings, {after:.2f} after)")
    if off is None or abs(off) >= 0.3 or n < 3 or before <= 0.9:
        # (what happened, to see why)
        print("   tube:", tv.evaluate("() => window.__tube && window.__tube.log.slice(-14)"))
        print("   yt:", tv.evaluate("() => window.__yt && window.__yt.log.slice(-14)"))
        print("   drops:", tv.evaluate("() => window.__djBooth.deck().log.filter((x) => x.k === 'drop').slice(-3)"), "heard:", h)
        gaps = tv.evaluate("([a, b]) => { const f = (window.__fades || []).filter((x) => x[0] >= a && x[0] <= b); let g = 0; for (let i = 1; i < f.length; i++) g = Math.max(g, f[i][0] - f[i - 1][0]); return [f.length, g]; }", [at - 2, at + 1])
        print("   readings around the bar, and the longest gap between them (the page busy):", gaps)
        print("   long tasks (start, ms), the last few:", tv.evaluate("() => (window.__long || []).slice(-6)"), "now:", tv.evaluate("() => Math.round(performance.now())"))
    return off


def said(tv, zh, en):
    """The TV's note under its YouTube player says this (the TV's in either language)."""
    t = text(tv, ".dj-tube-note")
    return zh in t or en in t


def tube(tv):
    return tv.evaluate("() => { const e = document.querySelector('.dj-tube'); return e ? e.className : ''; }")


with sync_playwright() as p:
    br = getattr(p, WHICH).launch()
    chrome = br if WHICH == "chromium" else p.chromium.launch()
    tvc = br.new_context(viewport={"width": 1600, "height": 900})
    tv = tvc.new_page()
    tv.route("https://www.youtube.com/iframe_api", lambda r: r.fulfill(status=200, body=FAKE_YT, headers={"Content-Type": "text/javascript"}))
    tv.route("https://audio-ssl.itunes.apple.com/**", lambda r: (apple.append(r.request.url), r.abort()))
    tv.add_init_script(SAMPLER)
    errs = []
    tv.on("pageerror", lambda e: errs.append(str(e)))
    tv.on("console", lambda m: errs.append(m.text) if m.type == "error" and "WebSocket" not in m.text else None)
    tv.goto(BASE + "dj", wait_until="load")
    code = until(lambda: tv.locator(".dj-join-code").inner_text().strip(), 15000)
    tv.locator(".dj-start-btn").click()
    ok(until(lambda: (view(tv) or {}).get("phase") == "warm", 15000), f"{WHICH}: the night starts ({code})")
    ok(until(lambda: deck(tv).get("grid"), 10000), "the speaker tells the room where its bars fall")

    phones = []
    for name in ("Amy", "Ben", "Cat"):
        ph = phone(chrome, name, "zh")
        ph.route("http://127.0.0.1:8787/api/yt/**", yt_api)
        ph.route("https://itunes.apple.com/**", lambda r: (apple.append(r.request.url), r.abort()))
        ph.goto(BASE + f"#/r/{code}", wait_until="load")
        ph.locator(".join-card input").fill(name)
        ph.locator(".join-card button[type=submit]").click()
        ok(until(lambda: ph.locator(".djk-pad").count() == 12, 10000), f"{name}'s phone shows the deck")
        phones.append(ph)
    amy, ben, cat = phones
    pid = {n: ph.evaluate("() => window.__room.you") for n, ph in zip(("Amy", "Ben", "Cat"), phones)}
    ok("YouTube" in text(ben, ".djk-req-note"), f"the phone says what asking does ({text(ben, '.djk-req-note')!r})")
    ok("is-off" in tube(tv), "no song from YouTube yet: the TV's player is out of sight")

    # Ben pastes a link: it waits ready in a corner of the TV, and starts on its drop's bar
    ben.locator(".djk-req-input").fill(f"https://youtu.be/{BEN_ID}?si=abc")
    ok(until(lambda: "YouTube" in text(ben, ".djk-req-hit.is-yt"), 4000), f"a pasted link: its video, by name ({text(ben, '.djk-req-hit.is-yt')!r})")
    ben.locator(".djk-req-hit.is-yt").first.click()
    ben.locator(".djk-req-send").click()
    ok(until(lambda: any(r.get("yt") == BEN_ID for r in [deck(tv).get("up") or {}] + deck(tv).get("reqs", [])), 4000), "the room has it, with its video")
    ok((deck(tv).get("up") or {}).get("text") is None, "the TV doesn't read its name before it plays")
    ok(until(lambda: "is-next" in tube(tv), 3000), "the TV shows it up next, in a corner")
    ok(until(lambda: said(tv, "准备好了", "Ready"), 8000), f"it gets ready there ({text(tv, '.dj-tube-note')!r})")
    st = tv.evaluate("() => window.__yt && { video: window.__yt.video, state: window.__yt.state, t: window.__yt.t, muted: window.__yt.muted, heard: window.__yt.heard.length }")
    ok(st and st["video"] == BEN_ID and st["state"] == 2 and st["t"] < 0.5 and not st["muted"] and st["heard"] == 0, f"loaded, its start buffered, held at 0:00 with its sound on, never heard ({st})")
    tv.screenshot(path=os.path.join(OUT, f"youtube-{WHICH}-tv-0-next.png"))
    drop_into(tv, phones, pid["Ben"], press=amy)
    on_the_drop(tv, BEN_ID, "Ben's link, Amy's DROP")
    tv.screenshot(path=os.path.join(OUT, f"youtube-{WHICH}-tv-1-drop.png"))
    ok(until(lambda: "is-on" in tube(tv), 2000), "it plays")
    box = tv.locator(".dj-tube").bounding_box()
    ok(box and box["x"] > 1050 and box["width"] < 500, f"in its corner, the floor and the coach in sight ({box})")
    ok(until(lambda: amy.locator(".djk-song").count() == 1 and amy.locator(".djk-pad.is-echo").is_disabled(), 3000), "the phones say so, the pads that work the music waiting")
    ok(not amy.locator(".djk-pad.is-horn").is_disabled() and not cat.locator(".djk-pad.is-siren").is_disabled(), "the air horn, the siren and the other sounds of their own still play")
    over = lambda: tv.evaluate("() => window.__fakeDj.speaker.overSong.gain.value")
    ok(until(lambda: over() > 0.9, 4000), f"over the song the pads have their own way out ({over():.2f})")
    n0 = tv.evaluate("() => window.__djBooth.deck().log.filter((x) => x.k === 'horn').length")
    amy.locator(".djk-pad.is-horn").click()
    ok(until(lambda: tv.evaluate("() => window.__djBooth.deck().log.filter((x) => x.k === 'horn').length") > n0, 3000), "Amy's air horn plays on the TV, over the song, at once")
    ok(cat.locator(".djk-song button:not([aria-pressed])").count() == 0 and ben.locator(".djk-song button:not([aria-pressed])").count() == 1 and amy.locator(".djk-song button:not([aria-pressed])").count() == 1, "Ben (his song) and Amy (the host) can skip it, Cat can't")
    ok(cat.locator(".djk-song button[aria-pressed]").count() == 1, "anyone can put its video over the whole TV")
    tv.screenshot(path=os.path.join(OUT, f"youtube-{WHICH}-tv-1-song.png"))
    amy.screenshot(path=os.path.join(OUT, f"youtube-{WHICH}-amy-1-song.png"))
    tv.evaluate("() => window.__yt.end()")
    ok(until(lambda: deck(tv).get("song") is None and "is-off" in tube(tv), 4000), "it ends: the player goes out of sight, the room's song time is over")
    ok(until(lambda: tv.evaluate("() => window.__fakeDj.speaker.talkFade.gain.value") > 0.95, 5000), "and the DJ comes back")
    ok(until(lambda: over() < 0.05, 5000), "the pads go back through the DJ's chain")
    ok(until(lambda: not amy.locator(".djk-pad").first.is_disabled(), 3000), "the decks too")

    # the 歌单: Ben puts two more on it, everyone sees the list; the host switches it to 随机 and back
    ben.wait_for_timeout(5200)
    for vid in ("aaaaaaaaaa1", "aaaaaaaaaa2"):
        ben.locator(".djk-req-input").fill(f"https://youtu.be/{vid}")
        ok(until(lambda: ben.locator(".djk-req-hit.is-yt").count() > 0, 4000), f"Ben finds {vid}")
        ben.locator(".djk-req-hit.is-yt").first.click()
        ben.locator(".djk-req-send").click()
        ben.wait_for_timeout(5200)
    ok(until(lambda: amy.locator(".djk-list-row").count() == 2 and cat.locator(".djk-list-row").count() == 2, 4000), f"every phone shows the playlist ({cat.locator('.djk-list-row').count()} songs)")
    ok("Ben" in text(cat, ".djk-list-row") and cat.locator(".djk-list-out").count() == 0, "Cat sees whose they are, and can't take Ben's out")
    ok(ben.locator(".djk-list-out").count() == 2 and amy.locator(".djk-list-out").count() == 2, "Ben can take his out, and so can the host")
    ok(until(lambda: "1 more on the playlist" in text(tv, ".dk-req.is-up") or "歌单里还有 1 首" in text(tv, ".dk-req.is-up"), 3000), f"the TV names the next and the playlist ({text(tv, '.dk-req.is-up')!r})")
    amy.get_by_role("button", name="随机").click()
    ok(until(lambda: "随机放" in text(cat, ".djk-list-mode"), 3000), "the host switches it to 随机: the others see it")
    amy.get_by_role("button", name="按顺序").click()
    ok(until(lambda: cat.locator(".djk-list-mode").count() == 0, 3000), "and back to 按顺序")
    amy.screenshot(path=os.path.join(OUT, f"youtube-{WHICH}-amy-2-playlist.png"))
    # (Ben's two leave the list, so Cat's comes up next)
    for _ in range(2):
        ben.locator(".djk-list-out").first.click()
        ben.wait_for_timeout(300)
    ok(until(lambda: amy.locator(".djk-list-row").count() == 0, 3000), "Ben takes his out again")

    # Cat picks Shape of You from the song list (the key is on): one search finds its video, none
    # while she types; an ad plays out muted in the TV's corner, then it's ready, and it starts on its drop
    tv.evaluate(f"() => {{ window.__ytConf.ads['{CAT_ID}'] = 2500; window.__yt.adLeft['{CAT_ID}'] = 2500; }}")
    n_search = len(searches)
    cat.locator(".djk-req-input").fill("shape of you")
    ok(until(lambda: cat.locator(".djk-req-hit").filter(has_text="Ed Sheeran").count() >= 1, 8000, 100), "the song list has it")
    cat.wait_for_timeout(1500)
    ok(len(searches) == n_search and cat.locator(".djk-req-hit.is-yt").count() == 0, f"no YouTube search while the list has it ({searches[n_search:]})")
    cat.locator(".djk-req-hit").filter(has_text="Ed Sheeran").first.click()
    cat.locator(".djk-req-send").click()
    ok(until(lambda: (deck(tv).get("up") or {}).get("yt") == CAT_ID and (deck(tv).get("up") or {}).get("song") is not None, 5000), "it goes in by its name on the list, with the video the search found")
    ok(len(searches) == n_search + 1, f"one search for it ({searches[n_search:]})")
    ok(until(lambda: said(tv, "广告", "an ad"), 6000), f"YouTube's ad plays first, muted, in its corner ({text(tv, '.dj-tube-note')!r})")
    ok(until(lambda: said(tv, "准备好了", "Ready"), 10000), "then it's ready")
    ok(tv.evaluate(f"() => window.__yt.heard.filter((x) => x.video === '{CAT_ID}').length") == 0, "the ad was never heard, nor the song yet")
    drop_into(tv, phones, pid["Cat"])
    on_the_drop(tv, CAT_ID, "Cat's pick, the DJ's own drop")
    ok(until(lambda: cat.locator(".djk-song button:not([aria-pressed])").count() == 1, 3000), "her phone can skip it")
    cat.locator(".djk-song button:not([aria-pressed])").click()
    ok(until(lambda: deck(tv).get("song") is None and "is-off" in tube(tv), 4000), "she skips it: the DJ comes back")
    ok(until(lambda: tv.evaluate("() => window.__fakeDj.speaker.talkFade.gain.value") > 0.95, 5000), "the DJ is heard again")

    # no key: Ben picks 晴天 from the list, the phone asks for its link (YouTube's search a tap
    # away); he pastes one and it plays whole (Steve's Nov 4 bug: it played as a remix)
    key_on[0] = False
    ben.wait_for_timeout(5200)
    ben.locator(".djk-req-input").fill("晴天")
    ok(until(lambda: ben.locator(".djk-req-hit").filter(has_text="周杰伦").count() >= 1, 8000, 100), "Ben types 晴天: the song list suggests Jay Chou's")
    ben.locator(".djk-req-hit").filter(has_text="周杰伦").first.click()
    ben.locator(".djk-req-send").click()
    ok(until(lambda: ben.locator(".djk-need").count() == 1, 5000), "no key: it doesn't go in as a remix, the phone asks for its link")
    ok(not any(r.get("by") == pid["Ben"] for r in deck(tv).get("reqs", [])) and (deck(tv).get("up") or {}).get("by") != pid["Ben"], "nothing sent yet")
    note = text(ben, ".djk-need .djk-req-note")
    ok("链接" in note and "还没开通" in note, f"it says why ({note!r})")
    href = ben.locator(".djk-need-find").get_attribute("href") or ""
    ok("youtube.com/results" in href and "%E6%99%B4%E5%A4%A9" in href and ben.locator(".djk-need-find").get_attribute("target") == "_blank", f"a tap opens YouTube's own search for it ({href})")
    ben.locator(".djk-need").scroll_into_view_if_needed()
    ben.screenshot(path=os.path.join(OUT, f"youtube-{WHICH}-ben-3-link.png"))
    ben.locator(".djk-need-paste input").fill("not a link")
    ok(until(lambda: "不是" in text(ben, ".djk-need-hit"), 3000) and ben.locator(".djk-need .djk-req-send").is_disabled(), "something that isn't a link: it says so, and can't go in")
    ben.locator(".djk-need-paste input").fill(f"https://www.youtube.com/watch?v={QT_ID}&feature=share")
    ok(until(lambda: "找到了" in text(ben, ".djk-need-hit"), 4000), f"the link pasted: its video ({text(ben, '.djk-need-hit')!r})")
    ben.locator(".djk-need .djk-req-send").click()
    ok(until(lambda: (deck(tv).get("up") or {}).get("yt") == QT_ID and (deck(tv).get("up") or {}).get("text") == "晴天", 5000), "晴天 goes in by its name, with the pasted video")
    ok(ben.locator(".djk-need").count() == 0, "the box is done")
    drop_into(tv, phones, pid["Ben"])
    on_the_drop(tv, QT_ID, "晴天, no key, a pasted link")
    ben.locator(".djk-song button:not([aria-pressed])").click()
    ok(until(lambda: deck(tv).get("song") is None, 4000), "Ben skips it")

    # no key: Cat picks one and wants the remix alone; a typed name says links work
    cat.wait_for_timeout(5200)
    cat.locator(".djk-req-input").fill("晴天")
    ok(until(lambda: cat.locator(".djk-req-hit").filter(has_text="周杰伦").count() >= 1, 8000, 100), "Cat types 晴天 too")
    cat.locator(".djk-req-hit").filter(has_text="周杰伦").first.click()
    cat.locator(".djk-req-send").click()
    ok(until(lambda: cat.locator(".djk-need").count() == 1, 5000), "she's asked for its link")
    cat.locator(".djk-need-remix").click()
    ok(until(lambda: any(r.get("by") == pid["Cat"] and r.get("yt") is None and r.get("text") == "晴天" for r in [deck(tv).get("up") or {}] + deck(tv).get("reqs", [])), 4000), "the remix alone: it goes in with no video")
    cat.locator(".djk-list-out").first.click()
    ok(until(lambda: cat.locator(".djk-list-row").count() == 0, 3000), "(and she takes it back out)")
    amy.wait_for_timeout(200)
    amy.locator(".djk-req-input").fill("some song name")
    ok(until(lambda: "贴一个 YouTube 链接" in text(amy, ".djk-req-note") and amy.locator(".djk-req-hit.is-yt").count() == 0, 5000), f"no key: a typed name, the phone says links work ({text(amy, '.djk-req-note')!r})")
    amy.locator(".djk-req-input").fill("")

    # a video YouTube won't play here: the TV finds out while getting it ready, the video comes off
    # the song, its player's phone says why, and its drop plays the DJ's remix
    tv.evaluate(f"() => {{ window.__ytConf.bad['{BAD_ID}'] = 150; }}")
    amy.wait_for_timeout(5200)
    amy.locator(".djk-req-input").fill(f"https://youtu.be/{BAD_ID}")
    ok(until(lambda: amy.locator(".djk-req-hit.is-yt").count() > 0, 4000), "Amy pastes a link to a video its owner keeps on YouTube")
    amy.locator(".djk-req-hit.is-yt").first.click()
    amy.locator(".djk-req-send").click()
    ok(until(lambda: (deck(tv).get("up") or {}).get("ytNo") is True and (deck(tv).get("up") or {}).get("yt") is None, 12000), "the TV tells the room: the video comes off it")
    ok(until(lambda: "不让" in text(amy, ".djk-req-mine"), 3000), f"Amy's phone says why ({text(amy, '.djk-req-mine')!r})")
    drop_into(tv, phones, pid["Amy"], whole=False)
    ok(deck(tv).get("song") is None and tv.evaluate("() => window.__fakeDj.speaker.talkFade.gain.value") > 0.95, "it lands as the DJ's remix: no song, the DJ never stops")

    # a TV that wants a tap on the video first (as Safari does): opened again, it says so in the
    # corner; one tap there and the song starts by itself on its drop
    tv.add_init_script("window.__tubeTapFirst = true; window.__ytConf = { sound: false };")
    tv.reload(wait_until="load")
    tv.locator(".dj-start-btn").click()
    ok(until(lambda: tv.evaluate("() => !!(window.__djBooth && window.__djBooth.stats() && window.__djBooth.stats().state === 'playing')"), 20000), "the TV, opened again, plays on after its start tap")
    ben.wait_for_timeout(1500)
    ben.locator(".djk-req-input").fill(f"https://youtu.be/{SAF1}")
    ok(until(lambda: ben.locator(".djk-req-hit.is-yt").count() > 0, 4000), "Ben pastes another")
    ben.locator(".djk-req-hit.is-yt").first.click()
    ben.locator(".djk-req-send").click()
    ok(until(lambda: said(tv, "点一下视频", "one tap on the video"), 15000), f"ready in its corner, the TV asks for one tap on the video ({text(tv, '.dj-tube-note')!r})")
    tv.screenshot(path=os.path.join(OUT, f"youtube-{WHICH}-tv-2-tap-first.png"))
    tv.evaluate("() => window.__yt.userTap()")
    ok(until(lambda: said(tv, "准备好了", "Ready"), 4000), "tapped: it's held ready again, and may start by itself")
    ok(tv.evaluate("() => window.__yt.state") == 2, "(paused back at its start)")
    drop_into(tv, phones, pid["Ben"])
    on_the_drop(tv, SAF1, "a TV that wanted a tap, tapped once")
    ben.locator(".djk-song button:not([aria-pressed])").click()
    ok(until(lambda: deck(tv).get("song") is None, 4000), "skipped")

    # ...and if the browser still won't start one by itself, the DJ plays on until someone taps it
    tv.evaluate("() => { window.__yt.activated = false; }")
    cat.wait_for_timeout(5200)
    cat.locator(".djk-req-input").fill(f"https://youtu.be/{SAF2}")
    ok(until(lambda: cat.locator(".djk-req-hit.is-yt").count() > 0, 4000), "Cat pastes one")
    cat.locator(".djk-req-hit.is-yt").first.click()
    cat.locator(".djk-req-send").click()
    drop_into(tv, phones, pid["Cat"])
    at = last_drop(tv)
    ok(until(lambda: said(tv, "点一下视频开始放", "Tap the video to start it"), 6000), f"it won't start by itself: the TV asks for a tap ({text(tv, '.dj-tube-note')!r})")
    ok(until(lambda: tv.evaluate("() => window.__fakeDj.speaker.talkFade.gain.value") > 0.95, 4000), "and the DJ plays on meanwhile (no silence)")
    tv.screenshot(path=os.path.join(OUT, f"youtube-{WHICH}-tv-3-tap.png"))
    tv.evaluate("() => window.__yt.userTap()")
    ok(until(lambda: heard_at(tv, SAF2, at - 1) is not None, 4000), "someone taps it: the song plays")
    ok(until(lambda: tv.evaluate("() => window.__fakeDj.speaker.talkFade.gain.value") < 0.05, 3000), "and the DJ gives way to it")
    cat.locator(".djk-song button:not([aria-pressed])").click()
    ok(until(lambda: deck(tv).get("song") is None and tv.evaluate("() => window.__fakeDj.speaker.talkFade.gain.value") > 0.95, 6000), "skipped: the DJ comes back")
    tv.evaluate("() => { window.__yt.activated = true; }")

    # 点歌模式 (Steve on Nov 5: "关闭 drop ... 当成一个点歌器，播放完一首歌，下一首歌就自动播放"): the host
    # switches it on; no build-up, DROP or picks; a song asked for starts by itself a few seconds on,
    # in its corner; anyone puts its video over the whole TV and back; the next follows on its own
    amy.locator(".djk-juke button").nth(1).click()
    ok(until(lambda: (view(tv) or {}).get("juke") is True, 3000), "the host switches to 点歌模式")
    ok(until(lambda: ben.locator(".djk-build").count() == 0 and ben.locator(".djk-picks").count() == 0, 3000), "the phones: no build-up, no DROP, no picks")
    ok(until(lambda: "点歌模式" in text(tv, ".dk-hint") or "Jukebox" in text(tv, ".dk-hint"), 4000), f"the TV says how it plays now ({text(tv, '.dk-hint')!r})")
    amy.wait_for_timeout(5200)
    amy.locator(".djk-req-input").fill(f"https://youtu.be/{JK1}")
    ok(until(lambda: amy.locator(".djk-req-hit.is-yt").count() > 0, 4000), "Amy pastes one")
    amy.locator(".djk-req-hit.is-yt").first.click()
    amy.locator(".djk-req-send").click()
    ok(until(lambda: (deck(tv).get("drop") or {}).get("quiet") is True, 8000), "a moment later the switch into it is on its way, nothing to press")
    ok(tv.locator(".dk-count").count() == 0, "no countdown on the TV")
    ok(until(lambda: heard_at(tv, JK1) is not None, 15000), "it starts by itself")
    ok(tv.locator(".dk-dropped").count() == 0, "no DROP party")
    box = tv.locator(".dj-tube").bounding_box()
    ok(box and box["x"] > 1050 and box["width"] < 500, f"in its corner ({box})")
    cat.locator(".djk-song button[aria-pressed]").click()
    ok(until(lambda: "is-full" in tube(tv), 3000), "Cat puts its video over the whole TV")
    tv.wait_for_timeout(int(1000))
    box = tv.locator(".dj-tube").bounding_box()
    ok(box and box["x"] < 2 and box["width"] > 1590, f"the whole TV ({box})")
    tv.screenshot(path=os.path.join(OUT, f"youtube-{WHICH}-tv-5-full.png"))
    cat.locator(".djk-song button[aria-pressed]").click()
    ok(until(lambda: "is-full" not in tube(tv), 3000), "and back in its corner")
    cat.wait_for_timeout(5200)
    cat.locator(".djk-req-input").fill(f"https://youtu.be/{JK2}")
    ok(until(lambda: cat.locator(".djk-req-hit.is-yt").count() > 0, 4000), "Cat asks for the next")
    cat.locator(".djk-req-hit.is-yt").first.click()
    cat.locator(".djk-req-send").click()
    ok(until(lambda: (deck(tv).get("up") or {}).get("yt") == JK2, 4000) and deck(tv).get("drop") is None, "it waits for Amy's to end")
    t_end = tv.evaluate("() => window.__fakeDj.speaker.heardTime()")
    tv.evaluate("() => window.__yt.end()")
    ok(until(lambda: heard_at(tv, JK2) is not None, 20000), "Amy's ends: Cat's follows by itself")
    gap = heard_at(tv, JK2) - t_end if heard_at(tv, JK2) else 99
    ok(gap < 12, f"a few seconds of DJ between them ({gap:.1f} s)")
    tv.screenshot(path=os.path.join(OUT, f"youtube-{WHICH}-tv-6-juke.png"))
    amy.screenshot(path=os.path.join(OUT, f"youtube-{WHICH}-amy-6-juke.png"))

    ok(not apple, f"nothing went to Apple ({apple[:2]})")
    st = tv.evaluate("() => window.__djBooth.stats()")
    ok(st["state"] == "playing" and st["stalls"] == 0, f"the music never stalled ({st})")
    bad = [e for e in errs + [x for ph in phones for x in ph._errs] if "WebSocket" not in e and "favicon" not in e]
    ok(not bad, f"no errors {bad[:3]}")
    br.close()
    if chrome is not br:
        chrome.close()

print("\nall passed" if not fails else f"\n{len(fails)} failed: {fails}")
sys.exit(1 if fails else 0)
