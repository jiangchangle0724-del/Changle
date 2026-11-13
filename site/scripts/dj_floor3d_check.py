"""打碟 · DJ Booth, the floor in 3D (Steve on Nov 5: everyone at the table as the coach's little robot,
dancing to the music and singing with feeling, as smooth as the coach), in browsers: TVs and phones.

This machine has no graphics chip (its browsers draw WebGL in software), so the TV is told to take
any WebGL: the robots come on as they would on a TV with one.

What it checks: the drawn floor gives way to the robots once they dance; a robot for each player,
in their own colour, their face and name over its head; every one's animation set to where the
speaker's beat is (the coach's way), the moves changing every two bars; a 🔥 makes its owner jump;
someone who leaves sits down, greyed. A whole song from YouTube: they stop dancing to the DJ's beat
and sing, a microphone each (not the one away), brows moving, notes going up; the song over, they
dance again. Crowded (more than 8): two rows, the back one on a step, its tags over the heads, the
front row's under the feet. The fallbacks: a TV drawing WebGL in software (as this machine's, untold)
keeps the drawn floor and never downloads three.js; frames too slow (a TV slowed down on purpose)
and the drawn floor comes back. With reduced motion the robots stand easy: no dancing, no jumping.

Needs the two local servers (site/README.md), with DEV_LYRIA_ANYONE off.
usage: python3 scripts/dj_floor3d_check.py
"""
import json, os, sys, tempfile, time
from playwright.sync_api import sync_playwright

sys.path.insert(0, os.path.dirname(__file__))
from party_test import until, ok, fails, phone, view  # noqa: E402
from dj_tube import FAKE_YT, deck, drop_into  # noqa: E402

BASE = "http://127.0.0.1:5173/"
OUT = os.environ.get("SHOTS", os.path.join(tempfile.gettempdir(), "dj-floor3d"))
os.makedirs(OUT, exist_ok=True)
SONG = "kJQP7kiw5Fk"
DANCES = {"Dance", "Yes", "Jump", "Wave", "Punch", "ThumbsUp"}
MORE = ["Dan", "Eve", "Fay", "Gus", "Hal", "Ivy"]


def yt_api(route):
    """The rooms server's YouTube lookup, standing in: any pasted link is Despacito."""
    url = route.request.url
    vid = url.split("id=")[1][:11] if "id=" in url else SONG
    hdr = {"Access-Control-Allow-Origin": "*", "Content-Type": "application/json"}
    route.fulfill(status=200, body=json.dumps({"id": vid, "t": "Despacito (official video)", "a": "Luis Fonsi"}), headers=hdr)


def f3(tv):
    """What the floor's last frame did (Floor3D's own snapshot)."""
    return tv.evaluate("() => window.__floor3d ? window.__floor3d() : null") or {}


def tags(tv):
    return tv.evaluate(
        """() => [...document.querySelectorAll('.dj-f3-tag')].map((t) => ({ name: t.querySelector('.dj-name')?.textContent,
        cls: t.className, tc: t.style.getPropertyValue('--tc'), x: parseFloat(t.style.left), y: parseFloat(t.style.top) }))"""
    )


def tag(tv, name):
    return next((t for t in tags(tv) if t["name"] == name), None)


def is3d(tv, key="__floor3dIs"):
    """How the robots turned out on this TV, once they have (None: still trying)."""
    x = tv.evaluate(f"() => window.{key}")
    return x if x in ("on", "software", "none", "slow", "failed") else None


def off_beat(snap):
    """The dancers whose animation isn't where the beat is: a move's loop is so many beats, and the
    animation stands at the beat's place in it (the last frame's beat, read with it)."""
    b, bad = snap.get("beat"), []
    for pid, x in (snap.get("bots") or {}).items():
        if x["clip"] not in DANCES or not x["beats"] or not x["dur"]:
            continue
        want = ((b % x["beats"]) + x["beats"]) % x["beats"] / x["beats"]
        got = x["at"] / x["dur"]
        d = abs(want - got)
        if min(d, 1 - d) > 0.01:
            bad.append((pid, x["clip"], round(want, 3), round(got, 3)))
    return bad


def join(br, code, name):
    ph = phone(br, name, "zh")
    ph.route("http://127.0.0.1:8787/api/yt/**", yt_api)
    ph.route("https://itunes.apple.com/**", lambda r: r.abort())
    ph.goto(BASE + f"#/r/{code}", wait_until="load")
    ph.locator(".join-card input").fill(name)
    ph.locator(".join-card button[type=submit]").click()
    return ph


def tv_page(br, any_gl=True, extra="", **ctx):
    tv = br.new_context(viewport={"width": 1600, "height": 900}, **ctx).new_page()
    if any_gl:
        tv.add_init_script("window.__djAnyGl = true;" + extra)
    tv.route("https://www.youtube.com/iframe_api", lambda r: r.fulfill(status=200, body=FAKE_YT, headers={"Content-Type": "text/javascript"}))
    tv.route("https://audio-ssl.itunes.apple.com/**", lambda r: r.abort())
    tv._errs = []
    tv.on("pageerror", lambda e: tv._errs.append(str(e)))
    tv.on("console", lambda m: tv._errs.append(m.text) if m.type == "error" and "WebSocket" not in m.text else None)
    tv.goto(BASE + "dj", wait_until="load")
    code = until(lambda: tv.locator(".dj-join-code").inner_text().strip(), 15000)
    tv.locator(".dj-start-btn").click()
    return tv, code


with sync_playwright() as p:
    br = p.chromium.launch()
    tv, code = tv_page(br)
    ok(until(lambda: (view(tv) or {}).get("phase") == "warm", 15000), f"the night starts ({code})")

    # the robots come on: the drawn floor gives way once they're dancing
    ok(until(lambda: is3d(tv), 30000, 200) == "on", f"a TV that takes any WebGL: the robots load ({tv.evaluate('() => window.__floor3dIs')})")
    ok(until(lambda: tv.locator(".dj-floor3d:not(.is-hidden) canvas").count() == 1 and tv.locator(".dj-floor").count() == 0, 8000), "the 3D floor takes over from the drawn one")

    phones = [join(br, code, n) for n in ("Amy", "Ben", "Cat")]
    for ph in phones:
        ok(until(lambda: ph.locator(".djk-player").count() == 1, 15000), f"{ph._name}'s phone shows the player")
    amy, ben, cat = phones
    pid = {ph._name: ph.evaluate("() => window.__room.you") for ph in phones}
    ok(until(lambda: f3(tv).get("n") == 3 and len(tags(tv)) == 3, 8000), f"a robot for each of the three ({f3(tv).get('n')})")
    snap = f3(tv)
    tg = {t["name"]: t for t in tags(tv)}
    ok(all(tg[n]["tc"] and tg[n]["tc"] == snap["bots"][pid[n]]["color"] for n in pid), f"each in their own colour, as their face over its head ({[(n, tg[n]['tc'], snap['bots'][pid[n]]['color']) for n in pid]})")
    ok(all("is-under" not in t["cls"] for t in tags(tv)) and snap.get("rows") == 1, "one row, the tags over their heads")
    ok(tv.locator(".dj-f3-tag .dj-name.is-host").count() == 1 and tv.locator(".dj-f3-tag .dj-name.is-host").inner_text() == "Amy", "the host's name ringed, as on the drawn floor")

    # on the beat
    ok(until(lambda: all(x["clip"] in DANCES for x in f3(tv)["bots"].values()), 8000), f"all three dancing ({[x['clip'] for x in f3(tv)['bots'].values()]})")
    worst = []
    for _ in range(12):
        worst += off_beat(f3(tv))
        tv.wait_for_timeout(170)
    ok(not worst, f"every animation where the speaker's beat is, frame after frame ({worst[:3]})")
    seen = set()
    end = time.time() + 9
    while time.time() < end:
        seen.add(f3(tv)["bots"][pid["Amy"]]["clip"])
        tv.wait_for_timeout(150)
    ok(len(seen) >= 2, f"the moves change every two bars ({sorted(seen)})")
    ok(seen <= {"Dance", "Yes", "Wave", "ThumbsUp"}, f"the warm-up's easy ones ({sorted(seen)})")
    tv.screenshot(path=os.path.join(OUT, "floor3d-tv-1-dancing.png"))

    # a 🔥 makes its owner jump
    base = f3(tv)["bots"][pid["Ben"]]["base"]
    tall = f3(tv).get("tall", 0)
    ben.locator(".djp-fire").click()
    top, tag_up = 0, 0
    end = time.time() + 1.6
    while time.time() < end:
        top = max(top, f3(tv)["bots"][pid["Ben"]]["y"] - base)
        tag_up = max(tag_up, -tv.evaluate("() => { const t = [...document.querySelectorAll('.dj-f3-tag')].find((x) => x.querySelector('.dj-name')?.textContent === 'Ben'); return t ? new DOMMatrix(getComputedStyle(t).transform).m42 : 0; }"))
        tv.wait_for_timeout(25)
    ok(top > tall * 0.1, f"Ben's 🔥: his robot jumps ({top:.2f} of {tall:.2f})")
    ok(tag_up > 8, f"his face and name going up with him ({tag_up:.0f} px)")
    ok(abs(f3(tv)["bots"][pid["Ben"]]["y"] - base) < 1e-6, "and lands")
    ok(tv.evaluate("() => [...document.querySelectorAll('.dj-f3-tag')].every((t) => !t.style.transform)"), "the tag back in its place")
    ok(abs(f3(tv)["bots"][pid["Amy"]]["y"] - f3(tv)["bots"][pid["Amy"]]["base"]) < 1e-6, "Amy's stays put")

    # Cat leaves: hers sits down, greyed
    cat.context.close()
    ok(until(lambda: f3(tv)["bots"][pid["Cat"]]["clip"] == "Sitting" and "is-away" in (tag(tv, "Cat") or {}).get("cls", ""), 15000), "Cat leaves: her robot sits down, her tag greyed")
    ok(f3(tv)["bots"][pid["Cat"]]["color"] != tag(tv, "Cat")["tc"], f"her robot greyed too ({f3(tv)['bots'][pid['Cat']]['color']}, hers {tag(tv, 'Cat')['tc']})")

    # a whole song: they stop dancing to the DJ's beat and sing
    ben.locator(".djk-req-input").fill(f"https://youtu.be/{SONG}")
    ok(until(lambda: ben.locator(".djk-req-hit.is-yt").count() > 0, 5000), "Ben pastes a song's link")
    ben.locator(".djk-req-hit.is-yt").first.click()
    ben.locator(".djk-req-send").click()
    drop_into(tv, [amy, ben], pid["Ben"], press=amy)
    ok(until(lambda: f3(tv).get("singing"), 5000), "the whole song plays: the floor sings")
    s1 = f3(tv)["bots"]
    ok(s1[pid["Amy"]]["mic"] and s1[pid["Ben"]]["mic"] and not s1[pid["Cat"]]["mic"], "a microphone for each at the table (none for Cat, away)")
    ok(until(lambda: all(f3(tv)["bots"][pid[n]]["clip"] == "Idle" for n in ("Amy", "Ben")), 3000), "no dancing to the DJ's beat over someone else's song: they stand at the mic")
    ok(f3(tv)["bots"][pid["Cat"]]["clip"] == "Sitting", "Cat still sitting")
    ok(until(lambda: all("is-singing" in (tag(tv, n) or {}).get("cls", "") for n in ("Amy", "Ben")) and "is-singing" not in (tag(tv, "Cat") or {}).get("cls", ""), 3000), "notes going up from the two singing")
    brows = []
    end = time.time() + 4.5
    while time.time() < end:
        brows.append(f3(tv)["bots"][pid["Amy"]]["brows"])
        tv.wait_for_timeout(100)
    ok(max(brows) > 0.5 and min(brows) < 0.15, f"brows up as a line opens, down for the next ({min(brows):.2f} to {max(brows):.2f})")
    tv.screenshot(path=os.path.join(OUT, "floor3d-tv-2-singing.png"))
    tv.evaluate("() => window.__yt.end()")
    ok(until(lambda: deck(tv).get("song") is None and not f3(tv).get("singing"), 5000), "the song over: the singing stops")
    ok(until(lambda: not f3(tv)["bots"][pid["Amy"]]["mic"] and not f3(tv)["bots"][pid["Ben"]]["mic"] and tv.locator(".dj-f3-tag.is-singing").count() == 0, 2000), "the microphones go, the notes too")
    ok(until(lambda: all(f3(tv)["bots"][pid[n]]["clip"] in DANCES for n in ("Amy", "Ben")), 15000), "and they dance again when the DJ's back")

    # crowded: two rows, the back one on a step
    more = [join(br, code, n) for n in MORE]
    ok(until(lambda: f3(tv).get("n") == 9 and len(tags(tv)) == 9, 30000), f"nine at the table (Cat's seat kept) ({f3(tv).get('n')})")
    ok(f3(tv)["bots"][pid["Cat"]]["color"] != tag(tv, "Cat")["tc"], "Cat's robot still greyed, the table laid out again")
    ok(until(lambda: f3(tv).get("rows") == 2, 5000), "two rows")
    tl = tags(tv)
    under = [t for t in tl if "is-under" in t["cls"]]
    over = [t for t in tl if "is-under" not in t["cls"]]
    ok(len(under) == 5 and len(over) == 4, f"the front row's five tags under their feet, the back row's four over their heads ({len(under)}, {len(over)})")
    ok(under and over and max(t["y"] for t in over) < min(t["y"] for t in under) - 150, f"the back row well over the front ({max((t['y'] for t in over), default=0):.0f} over {min((t['y'] for t in under), default=0):.0f})")
    xs = sorted(t["x"] for t in tl)
    ok(xs[0] > 0 and xs[-1] < 780, f"all of them on the floor, across ({xs[0]:.0f} to {xs[-1]:.0f})")
    worst = []
    for _ in range(8):
        worst += off_beat(f3(tv))
        tv.wait_for_timeout(200)
    ok(not worst, f"the crowd on the beat too ({worst[:3]})")
    tv.screenshot(path=os.path.join(OUT, "floor3d-tv-3-crowded.png"))

    # the host takes the night to the peak: when the music gets there, the big moves
    amy.locator(".djp-seg button").nth(2).click()
    ok(until(lambda: (view(tv) or {}).get("phase") == "peak", 4000), "the host takes the night to the peak")
    ok(until(lambda: f3(tv).get("level", 0) >= 0.8, 90000, 500), f"the music gets there ({f3(tv).get('level')})")
    seen = set()
    end = time.time() + 6
    while time.time() < end:
        seen |= {x["clip"] for x in f3(tv)["bots"].values() if not x["away"]}
        tv.wait_for_timeout(200)
    ok(seen <= {"Jump", "Dance", "Punch"} and len(seen) >= 2, f"the big moves at the peak ({sorted(seen)})")

    errs = [e for e in tv._errs + [x for ph in [amy, ben] + more for x in ph._errs] if "WebSocket" not in e and "favicon" not in e]
    ok(not errs, f"no errors {errs[:3]}")
    tv.context.close()
    for ph in [amy, ben] + more:
        ph.context.close()

    # a TV drawing WebGL in software, untold: the drawn floor, three.js never downloaded
    three = []
    sw = br.new_context(viewport={"width": 1600, "height": 900}).new_page()
    sw.on("request", lambda r: three.append(r.url) if r.url.split("?")[0].rsplit("/", 1)[-1].startswith("three") or "GLTFLoader" in r.url or r.url.endswith(".glb") else None)
    sw.goto(BASE + "dj", wait_until="load")
    until(lambda: sw.locator(".dj-join-code").inner_text().strip(), 15000)
    sw.locator(".dj-start-btn").click()
    ok(until(lambda: is3d(sw), 15000) == "software", f"a TV drawing WebGL in software: no robots ({sw.evaluate('() => window.__floor3dIs')})")
    ok(until(lambda: sw.locator(".dj-floor").count() == 1 and sw.locator(".dj-floor3d").count() == 0, 5000), "the drawn floor stays")
    sw.wait_for_timeout(1500)
    ok(not three, f"three.js and the robot never downloaded ({three[:2]})")
    sw.context.close()

    # frames too slow (the TV slowed down on purpose, its first seconds watched): the drawn floor back
    slow, scode = tv_page(br, extra="window.__djWatch = true;")
    cdp = slow.context.new_cdp_session(slow)
    cdp.send("Emulation.setCPUThrottlingRate", {"rate": 40})
    one = join(br, scode, "Amy")
    ok(until(lambda: is3d(slow), 60000, 300) == "slow", f"a TV too slow for them: its frames watched ({slow.evaluate('() => window.__floor3dIs')})")
    ok(until(lambda: slow.locator(".dj-floor").count() == 1 and slow.locator(".dj-floor3d").count() == 0, 8000), "the drawn floor comes back")
    cdp.send("Emulation.setCPUThrottlingRate", {"rate": 1})
    slow.context.close()
    one.context.close()

    # reduced motion: they stand easy
    calm, ccode = tv_page(br, reduced_motion="reduce")
    two = join(br, ccode, "Amy")
    ok(until(lambda: is3d(calm), 30000, 200) == "on" and until(lambda: f3(calm).get("n") == 1, 15000), "with reduced motion: the robots still come on")
    me = two.evaluate("() => window.__room.you")
    clips = set()
    end = time.time() + 3
    while time.time() < end:
        clips.add(f3(calm)["bots"][me]["clip"])
        calm.wait_for_timeout(150)
    ok(clips == {"Idle"} and ((view(calm) or {}).get("deck") or {}).get("grid"), f"standing easy while the music plays ({sorted(clips)})")
    two.locator(".djp-fire").click()
    ys = []
    end = time.time() + 1.2
    while time.time() < end:
        ys.append(f3(calm)["bots"][me]["y"])
        calm.wait_for_timeout(30)
    ok(max(ys) < 1e-6, "a 🔥: no jump")
    calm.screenshot(path=os.path.join(OUT, "floor3d-tv-4-calm.png"))
    calm.context.close()
    two.context.close()
    br.close()

print("\nall passed" if not fails else f"\n{len(fails)} failed: {fails}")
sys.exit(1 if fails else 0)
