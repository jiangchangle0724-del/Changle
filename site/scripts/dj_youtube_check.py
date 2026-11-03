"""打碟 · DJ Booth, whole songs from YouTube (Steve on Nov 2: "换成 YouTube 放整首"), in browsers: a TV and
three phones. Ben pastes a YouTube link, Cat searches (the owner's key: on); each song up next, the
table drops into it, the DJ fades out over two bars and the TV plays the whole song in YouTube's player
(a stand-in for it here: this machine can't reach YouTube), the phones' decks waiting; it ends, or its
player skips it, and the DJ comes back. Without the key a search says links still work. Nothing goes to
Apple any more.

Needs the two local servers (site/README.md), with DEV_LYRIA_ANYONE off.
usage: python3 scripts/dj_youtube_check.py [chromium|webkit]   (the TV's browser; the phones are Chromium)
"""
import json, os, sys, tempfile, time
from playwright.sync_api import sync_playwright

sys.path.insert(0, os.path.dirname(__file__))
from party_test import until, ok, fails, phone, view  # noqa: E402

BASE = "http://127.0.0.1:5173/"
WHICH = next((a for a in sys.argv[1:] if a in ("chromium", "webkit")), "chromium")
OUT = os.environ.get("SHOTS", os.path.join(tempfile.gettempdir(), "dj-youtube"))
os.makedirs(OUT, exist_ok=True)
BEN_ID, CAT_ID = "kJQP7kiw5Fk", "fRh_vgS2dFE"

# YouTube's IFrame API, standing in: a player that says it's ready, plays when asked, ends on cue
FAKE_YT = """window.YT = { Player: function (el, o) {
  const f = document.createElement('iframe'); f.className = 'fake-yt'; f.dataset.video = o.videoId; f.title = 'YouTube';
  el.appendChild(f); const me = this; window.__yt = { video: o.videoId, playing: false, end: () => o.events.onStateChange({ data: 0 }) };
  this.playVideo = () => { window.__yt.playing = true; setTimeout(() => o.events.onStateChange({ data: 1 }), 30); };
  this.destroy = () => { f.remove(); window.__yt = null; };
  setTimeout(() => o.events.onReady({ target: me }), 30);
} }; if (window.onYouTubeIframeAPIReady) window.onYouTubeIframeAPIReady();"""

apple = []
key_on = [True]


def deck(pg):
    return (view(pg) or {}).get("deck") or {}


def text(pg, sel):
    loc = pg.locator(sel)
    return loc.first.inner_text() if loc.count() else ""


def yt_api(route):
    url = route.request.url
    if "/yt/info" in url:
        vid = url.split("id=")[1][:11]
        body = {"id": vid, "t": "Despacito (official video)" if vid == BEN_ID else "Some song", "a": "Luis Fonsi"}
        return route.fulfill(status=200, body=json.dumps(body), headers={"Access-Control-Allow-Origin": "*", "Content-Type": "application/json"})
    if not key_on[0]:
        return route.fulfill(status=200, body='{"nokey":true}', headers={"Access-Control-Allow-Origin": "*", "Content-Type": "application/json"})
    body = {"hits": [{"id": CAT_ID, "t": "Shape of You (Official Video)", "a": "Ed Sheeran"}]}
    return route.fulfill(status=200, body=json.dumps(body), headers={"Access-Control-Allow-Origin": "*", "Content-Type": "application/json"})


def drop_into(tv, phones, who):
    side = "b" if deck(tv).get("fader", 0) <= 0.5 else "a"
    ok(until(lambda: (deck(tv).get("up") or {}).get("by") == who, 6000), "up next")
    ok(until(lambda: bool((deck(tv).get("sounding") or {}).get(side)) and (deck(tv).get("sounding") or {}).get(side) == deck(tv).get(side), 40000, 250), f"the speaker plays it on deck {side.upper()}")
    end = time.time() + 30
    while time.time() < end and not deck(tv).get("drop"):
        for ph in phones:
            ph.evaluate("() => { const b = document.querySelector('.djk-charge'); if (b) for (let i = 0; i < 3; i++) b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); }")
        phones[0].wait_for_timeout(150)
    ok(bool(deck(tv).get("drop")), "the table builds it up")
    ok(until(lambda: (deck(tv).get("song") or {}).get("by") == who, 60000, 100), "it lands (the table's drop or the DJ's): the whole song's time")


with sync_playwright() as p:
    br = getattr(p, WHICH).launch()
    chrome = br if WHICH == "chromium" else p.chromium.launch()
    tv = br.new_context(viewport={"width": 1600, "height": 900}).new_page()
    tv.route("https://www.youtube.com/iframe_api", lambda r: r.fulfill(status=200, body=FAKE_YT, headers={"Content-Type": "text/javascript"}))
    tv.route("https://audio-ssl.itunes.apple.com/**", lambda r: (apple.append(r.request.url), r.abort()))
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

    # Ben pastes a link
    ben.locator(".djk-req-input").fill(f"https://youtu.be/{BEN_ID}?si=abc")
    ok(until(lambda: "YouTube" in text(ben, ".djk-req-hit.is-yt"), 4000), f"a pasted link: its video, by name ({text(ben, '.djk-req-hit.is-yt')!r})")
    ben.locator(".djk-req-hit.is-yt").first.click()
    ben.locator(".djk-req-send").click()
    ok(until(lambda: any(r.get("yt") == BEN_ID for r in [deck(tv).get("up") or {}] + deck(tv).get("reqs", [])), 4000), "the room has it, with its video")
    ok((deck(tv).get("up") or {}).get("text") is None, "the TV doesn't read its name before it plays")
    drop_into(tv, phones, pid["Ben"])
    ok(until(lambda: tv.locator(".dj-tube").count() == 1, 3000), "the TV shows the song's player")
    ok(until(lambda: tv.evaluate("() => window.__yt && window.__yt.playing && window.__yt.video") == BEN_ID, 8000), "two bars on, the whole song plays (Ben's video)")
    gain = tv.evaluate("() => window.__fakeDj.speaker.talkFade.gain.value")
    ok(gain < 0.05, f"the DJ has faded out under it ({gain:.3f})")
    ok(until(lambda: amy.locator(".djk-song").count() == 1 and amy.locator(".djk-pad").first.is_disabled(), 3000), "the phones say so, their decks waiting")
    ok(cat.locator(".djk-song button").count() == 0 and ben.locator(".djk-song button").count() == 1 and amy.locator(".djk-song button").count() == 1, "Ben (his song) and Amy (the host) can skip it, Cat can't")
    tv.screenshot(path=os.path.join(OUT, f"youtube-{WHICH}-tv-1-song.png"))
    amy.screenshot(path=os.path.join(OUT, f"youtube-{WHICH}-amy-1-song.png"))
    tv.evaluate("() => window.__yt.end()")
    ok(until(lambda: deck(tv).get("song") is None and tv.locator(".dj-tube").count() == 0, 4000), "it ends: the player goes, the room's song time is over")
    ok(until(lambda: tv.evaluate("() => window.__fakeDj.speaker.talkFade.gain.value") > 0.95, 5000), "and the DJ comes back")
    ok(until(lambda: not amy.locator(".djk-pad").first.is_disabled(), 3000), "the decks too")

    # Cat searches (the key is on), her song plays, she skips it
    cat.locator(".djk-req-input").fill("shape of you")
    ok(until(lambda: "Shape of You" in text(cat, ".djk-req-hit.is-yt"), 4000), "a search: YouTube's videos")
    cat.locator(".djk-req-hit.is-yt").first.click()
    cat.locator(".djk-req-send").click()
    drop_into(tv, phones, pid["Cat"])
    ok(until(lambda: tv.evaluate("() => window.__yt && window.__yt.video") == CAT_ID, 8000), "Cat's video plays")
    ok(until(lambda: cat.locator(".djk-song button").count() == 1, 3000), "her phone can skip it")
    cat.locator(".djk-song button").click()
    ok(until(lambda: deck(tv).get("song") is None and tv.locator(".dj-tube").count() == 0, 4000), "she skips it: the DJ comes back")

    # no key: a search says links still work; a typed name gets the remix
    key_on[0] = False
    amy.locator(".djk-req-input").fill("some song name")
    ok(until(lambda: "贴一个 YouTube 链接" in text(amy, ".djk-req-note") and amy.locator(".djk-req-hit.is-yt").count() == 0, 5000), f"no key: the phone asks for a link instead ({text(amy, '.djk-req-note')!r})")
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
