"""打碟 · DJ Booth, the beginner deck, in browsers: a TV opens /dj and starts the night; three phones
sit down and play at once. Every pad lands on a beat (the club ones too: siren, laser, scratch,
rewind); picks load deck B; the fader thrown to B before B has music of its own plays deck A on,
never silence; whoever moves the fader holds it; everyone taps the build-up full, the 8-second
countdown runs on the TV and the phones (the picks wait), one phone presses DROP on the cue, one a
quarter second after it (it counts), one too late (it says so), and the drop lands exactly on its
bar, swaps to deck B and is perfect. Then songs asked for by name: one picked from the song list goes
on the deck off the air in its style, named on the TV, and its drop plays its remix; one typed in
waits its turn, its name only on its own phone, and the DJ drops into it when nobody does.

Needs the two local servers (site/README.md); a table that isn't the owner's (DEV_LYRIA_ANYONE off
in site/worker/.dev.vars), so the stand-in plays both decks.

usage: python3 scripts/dj_deck_check.py [chromium|webkit]   (the TV's browser; the phones are Chromium)
"""
import os, sys, time
from playwright.sync_api import sync_playwright

sys.path.insert(0, os.path.dirname(__file__))
from party_test import until, ok, fails, phone, view  # noqa: E402

BASE = "http://127.0.0.1:5173/"
OUT = os.environ.get("SHOTS", "/tmp/claude-0/-home-claude/2907a50c-ad64-5e34-a6e1-1445acf2ecb9/scratchpad/dj-deck")
os.makedirs(OUT, exist_ok=True)
WHICH = next((a for a in sys.argv[1:] if a in ("chromium", "webkit")), "chromium")


def deck(pg):
    return (view(pg) or {}).get("deck") or {}


def log(tv):
    """What the speaker's deck played: kind, audio time, the beat it was put on (and where that beat falls)."""
    return tv.evaluate(
        """() => { const d = window.__djBooth && window.__djBooth.deck(); if (!d) return null;
        return { now: d.now, log: d.log.map(e => ({ k: e.k, at: e.at, beat: e.beat, want: d.beatAt(e.beat) })) } }"""
    )


def on_beat(e):
    """An effect is on the beat when its beat is whole and its time is that beat's time (to a millisecond)."""
    return e["want"] is not None and abs(e["beat"] - round(e["beat"])) < 1e-6 and abs(e["at"] - e["want"]) < 0.001


def set_fader(pg, value, let_go=False):
    """Drag a phone's crossfader to `value` (0 to 100), as a finger would."""
    pg.locator(".djk-fader input").evaluate(
        """(el, [v, up]) => { const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        set.call(el, String(v)); el.dispatchEvent(new Event('input', { bubbles: true }));
        if (up) el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); }""",
        [value, let_go],
    )


def arm_press(pg, selector, when_ms):
    """Set a phone to press a button at a moment of the server's clock (locally, the page's own
    clock), without waiting for it: `pressed_at` says when it did."""
    pg.evaluate(
        """([sel, when]) => { window.__pressedAt = null;
          const go = () => { const b = document.querySelector(sel); if (!b) return;
            b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, isPrimary: true })); window.__pressedAt = Date.now(); };
          const wait = when - Date.now(); if (wait <= 0) go(); else setTimeout(go, wait); }""",
        [selector, when_ms],
    )


def pressed_at(pg):
    return pg.evaluate("() => window.__pressedAt")


def press_at(pg, selector, when_ms, event="pointerdown"):
    """Press a button at a moment of the server's clock (locally, the page's own clock)."""
    return pg.evaluate(
        """([sel, when, ev]) => new Promise((done) => {
          const go = () => { const b = document.querySelector(sel); if (!b) return done(false);
            b.dispatchEvent(new PointerEvent(ev, { bubbles: true, pointerId: 1, isPrimary: true })); if (ev !== 'click') b.click && null; done(Date.now()); };
          const wait = when - Date.now(); if (wait <= 0) go(); else setTimeout(go, wait); })""",
        [selector, when_ms, event],
    )


def no_apple(route):
    """Apple stays out of this check (dj_clip_check.py plays songs' clips): no clip, nothing found."""
    search = "/search" in route.request.url
    route.fulfill(status=200, body='{"resultCount":0,"results":[]}' if search else b"", headers={"Access-Control-Allow-Origin": "*", "Content-Type": "application/json" if search else "audio/mp4"})


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
        ok(until(lambda: ph.locator(".djk-pad").count() == 8, 10000), f"{name}'s phone shows the deck, eight pads")
        phones.append(ph)
    amy, ben, cat = phones
    amy.wait_for_timeout(800)
    amy.screenshot(path=os.path.join(OUT, f"deck-{WHICH}-phone-1.png"), full_page=True)

    # pads, three phones at once
    amy.locator(".djk-pad.is-echo").click()
    ben.locator(".djk-pad.is-horn").click()
    cat.locator(".djk-pad.is-sweep").click()
    ok(until(lambda: len((log(tv) or {}).get("log", [])) >= 3, 4000), "three pads at once: all three play on the speaker")
    pads = [e for e in log(tv)["log"] if e["k"] in ("echo", "horn", "sweep")]
    ok(all(on_beat(e) for e in pads), f"each on a beat, to the millisecond ({[(e['k'], round(e['beat'], 3)) for e in pads]})")
    ok(until(lambda: tv.locator(".dk-chip").count() >= 2, 3000), "the TV says who pressed what")
    tv.wait_for_timeout(1500)
    amy.wait_for_timeout(700)
    amy.locator(".djk-pad.is-brake").click()
    ok(until(lambda: any(e["k"] == "brake" for e in log(tv)["log"]), 3000), "the brake plays too")
    br_e = [e for e in log(tv)["log"] if e["k"] == "brake"][0]
    ok(on_beat(br_e), "on a beat")
    tv.wait_for_timeout(4000)
    st = tv.evaluate("() => window.__djBooth.stats()")
    ok(st and st["state"] == "playing" and st["stalls"] == 0, f"and the music comes back on the bar: playing, no stall ({st})")

    # the club pads: a siren and a laser from two phones at once, then a scratch, then a rewind
    ben.locator(".djk-pad.is-siren").click()
    cat.locator(".djk-pad.is-laser").click()
    ok(until(lambda: {"siren", "laser"} <= {e["k"] for e in log(tv)["log"]}, 3000), "a siren and a laser at once: both play")
    ok(all(on_beat(e) for e in log(tv)["log"] if e["k"] in ("siren", "laser")), "each on a beat")
    tv.wait_for_timeout(600)
    cat.locator(".djk-pad.is-scratch").click()
    ok(until(lambda: any(e["k"] == "scratch" for e in log(tv)["log"]), 3000), "a scratch")
    ok(on_beat([e for e in log(tv)["log"] if e["k"] == "scratch"][0]), "on a beat")
    tv.wait_for_timeout(4200)
    ben.locator(".djk-pad.is-rewind").click()
    ok(until(lambda: any(e["k"] == "rewind" for e in log(tv)["log"]), 3000), "and 4 seconds on, a rewind")
    ok(on_beat([e for e in log(tv)["log"] if e["k"] == "rewind"][0]), "on a beat")
    tv.wait_for_timeout(4000)
    st = tv.evaluate("() => window.__djBooth.stats()")
    ok(st and st["state"] == "playing" and st["stalls"] == 0, f"the music comes back on the bar: playing, no stall ({st})")

    # picks: deck B takes the floor's style
    amy.locator(".djk-pick").nth(0).click()  # latin
    ben.locator(".djk-pick").nth(0).click()
    cat.locator(".djk-pick").nth(2).click()  # techno
    ok(until(lambda: deck(tv).get("b") == "latin", 4000), "two picks for latin, one for techno: latin goes on deck B")
    ok(until(lambda: any(w in tv.locator(".dk-deck").nth(1).inner_text() for w in ("拉丁", "Latin")), 3000), "the TV's deck B says so")

    # deck B has nothing of its own until latin is recorded for its next section: the fader thrown
    # all the way to B plays deck A on, never silence
    empty = (deck(tv).get("sounding") or {}).get("b") is None
    set_fader(amy, 100, let_go=True)
    ok(until(lambda: deck(tv).get("fader", 0) == 1, 3000), "Amy throws the fader all the way to B" + (" while B has nothing to play yet" if empty else " (B already plays latin)"))
    tv.wait_for_timeout(400)
    levels = []
    for _ in range(15):
        levels.append(tv.evaluate("() => window.__djBooth.level()"))
        tv.wait_for_timeout(100)
    # (silence would be all of them near 0; a sparse bar can have one quiet moment)
    ok(sorted(levels)[len(levels) // 2] > 0.02 and min(levels) > 0.002, f"the music plays on, never silence (quietest {min(levels):.3f}, middle {sorted(levels)[len(levels) // 2]:.3f}, loudest {max(levels):.3f})")
    amy.wait_for_timeout(1300)
    set_fader(amy, 0, let_go=True)
    ok(until(lambda: deck(tv).get("fader", 1) == 0, 3000), "back to A (each swap starts the picks over)")
    amy.locator(".djk-pick").nth(0).click()  # latin again
    ben.locator(".djk-pick").nth(0).click()
    ok(until(lambda: len([v for v in (deck(tv).get("votes") or {}).values() if v == "latin"]) == 2 and deck(tv).get("b") == "latin", 3000), "the floor picks latin again")

    # the fader: Amy holds it, Ben waits
    amy.wait_for_timeout(1300)
    set_fader(amy, 40)
    ok(until(lambda: abs(deck(tv).get("fader", 0) - 0.4) < 0.011, 3000), "Amy moves the crossfader to 0.4")
    ok(until(lambda: ben.locator(".djk-fader input").is_disabled(), 2000), "Ben's waits while Amy has it")
    ok("Amy" in ben.locator(".djk-fader-who").inner_text(), "and says who has it")
    set_fader(amy, 0, let_go=True)
    ok(until(lambda: deck(tv).get("fader", 1) == 0, 3000), "and back to A")
    tv.screenshot(path=os.path.join(OUT, f"deck-{WHICH}-tv-1.png"))

    # deck B plays latin from its next section, once it's recorded: then it's cued
    ok(until(lambda: (deck(tv).get("sounding") or {}).get("b") == "latin", 25000, 250), "the speaker says deck B really plays latin now (from its next section)")
    ok(until(lambda: tv.locator(".dk-cued").filter(has_text="Up next").count() + tv.locator(".dk-cued").filter(has_text="下一首").count() == 1, 3000), "and the TV marks it up next")

    # the build-up: everyone taps
    end = time.time() + 20
    while time.time() < end and not deck(tv).get("drop"):
        for ph in phones:
            ph.evaluate("() => { const b = document.querySelector('.djk-charge'); if (b) for (let i = 0; i < 3; i++) b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); }")
        amy.wait_for_timeout(150)
    dr = deck(tv).get("drop")
    ok(bool(dr) and dr["to"] == "b", f"everyone taps: the build-up fills and a drop is on its way, to deck B ({dr and dr['bar']})")
    ok(until(lambda: amy.locator(".djk-drop").count() == 1 and ben.locator(".djk-drop").count() == 1 and cat.locator(".djk-drop").count() == 1, 2000), "the phones' button turns into DROP")
    # three presses, set now so nothing below can make them late: Ben on the cue, Amy a quarter
    # second after it (she saw DROP, then pressed), Cat too late for the speaker
    arm_press(ben, ".djk-drop", dr["cue"] + 15)
    arm_press(amy, ".djk-drop", dr["cue"] + 200)
    arm_press(cat, ".djk-drop", dr["at"] - 140)
    ok(cat.locator(".djk-pick:not([disabled])").count() == 0, "and the picks wait for the drop")
    g = deck(tv)["grid"]
    beat_ms = 60000 / g["bpm"]
    ok(dr["bar"] % 4 == 0 and abs(dr["at"] - (g["at"] + (dr["bar"] - g["bar"]) * 4 * beat_ms)) < 2, "it lands on a 4-bar line of the speaker's bars")
    ok(until(lambda: tv.locator(".dk-count").count() == 1, (dr["at"] - time.time() * 1000) + 2000, 50), "the countdown shows on the TV")
    ok(tv.locator(".dk-count.is-8, .dk-count.is-7").count() == 1 and dr["at"] - time.time() * 1000 > 6500, f"from 8, about 8 seconds before the drop ({tv.locator('.dk-count-n').inner_text()})")
    tv.screenshot(path=os.path.join(OUT, f"deck-{WHICH}-tv-2-count.png"))
    amy.screenshot(path=os.path.join(OUT, f"deck-{WHICH}-phone-2-drop.png"))
    wait_ms = lambda when: max(0, when - time.time() * 1000) + 2000
    t = until(lambda: pressed_at(ben), wait_ms(dr["cue"]), 10)
    ok(bool(t), f"Ben presses DROP {round(t - dr['cue']) if t else '?'} ms after the cue")
    ta = until(lambda: pressed_at(amy), wait_ms(dr["cue"]), 10)
    tc = until(lambda: pressed_at(cat), wait_ms(dr["at"]), 10)
    said = lambda ph: ph.locator(".djk-result").inner_text() if ph.locator(".djk-result").count() else ""
    # (a phone's timer on this busy test machine can fire late: past `pressBy` her press is late too)
    amy_counts = bool(ta) and ta <= dr["at"] - 200
    ok(until(lambda: said(amy) == ("好" if amy_counts else "晚了一点"), 1200, 20), f"Amy, {round(ta - dr['cue']) if ta else '?'} ms after the cue: " + ("her phone says it counts, good" if amy_counts else "her timer fired late, so her phone says late") + f" ({said(amy)})")
    ok(until(lambda: said(cat) == "晚了一点", 1200, 20), f"Cat, {round(dr['at'] - tc) if tc else '?'} ms before the bar: her phone says she's late, not early, and it stays up after the drop ({said(cat)})")
    ok(until(lambda: any(e["k"] == "drop" for e in log(tv)["log"]), 3000), "the speaker sets the drop up")
    drops = [e for e in log(tv)["log"] if e["k"] == "drop"]
    d_e = drops[-1]
    ok(len(drops) == 1 and abs(d_e["beat"] - dr["bar"] * 4) < 1e-6 and on_beat(d_e), f"once, on its bar exactly (beat {round(d_e['beat'], 3)} = bar {dr['bar']}; {[round(e['beat'], 3) for e in drops]})")
    ok(until(lambda: (deck(tv).get("last") or {}).get("bar") == dr["bar"], 6000), "it lands")
    last = deck(tv)["last"]
    want = ["perfect", "good"] if amy_counts else ["perfect"]
    ok([h["grade"] for h in last["hits"]] == want and last["to"] == "b" and deck(tv)["fader"] == 1, f"perfect (Ben)" + (" and good (Amy)" if amy_counts else "") + f", Cat's didn't count, on deck B, the fader there ({last['hits']})")
    ok(until(lambda: tv.locator(".dk-dropped.is-perfect").count() == 1, 2000), "the TV celebrates a perfect drop")
    tv.wait_for_timeout(300)
    tv.screenshot(path=os.path.join(OUT, f"deck-{WHICH}-tv-3-perfect.png"))
    ok(deck(tv)["perfects"].get(ben.evaluate("() => window.__room.you"), 0) == 1, "and counts Ben's perfect drop")
    st = tv.evaluate("() => window.__djBooth.stats()")
    ok(st["state"] == "playing" and st["stalls"] == 0, f"the music never stopped ({st})")

    # a song asked for by name: Ben picks 晴天 from the song list, it goes on the deck off the air
    # (A) in its style, the TV names it, the table drops into it and the stand-in plays its remix
    ben.locator(".djk-req-input").fill("晴天")
    ok(until(lambda: ben.locator(".djk-req-hit").filter(has_text="周杰伦").count() >= 1, 15000, 100), "Ben types 晴天: the song list suggests Jay Chou's")
    ben.screenshot(path=os.path.join(OUT, f"deck-{WHICH}-phone-3-ask.png"), full_page=True)
    ben.locator(".djk-req-hit").filter(has_text="周杰伦").first.click()
    ben.locator(".djk-req-send").click()
    ok(until(lambda: ((deck(tv).get("up") or {}).get("text") == "晴天" and deck(tv).get("a") == "cpop"), 4000), "晴天 is up next, C-pop on deck A (off the air)")
    ok(until(lambda: "晴天" in (tv.locator(".dk-req.is-up").inner_text() if tv.locator(".dk-req.is-up").count() else "") and "Ben" in tv.locator(".dk-req.is-up").inner_text(), 3000), f"the TV says who asked for what ({tv.locator('.dk-req.is-up').inner_text() if tv.locator('.dk-req.is-up').count() else ''})")
    ok(until(lambda: "下一首就是你点的" in (ben.locator(".djk-req-mine").inner_text() if ben.locator(".djk-req-mine").count() else ""), 3000), "Ben's phone says his is up next")
    ok(amy.locator(".djk-pick:not([disabled])").count() == 0, "the picks wait for it")
    cat.locator(".djk-req-input").fill("my cousin's song")
    cat.locator(".djk-req-send").click()
    ok(until(lambda: len(deck(tv).get("reqs") or []) == 1, 3000), "Cat types a name that isn't on the list: it waits its turn")
    ok(until(lambda: "前面还有 1 首" in (cat.locator(".djk-req-mine").inner_text() if cat.locator(".djk-req-mine").count() else ""), 3000), "her phone says one is ahead of hers")
    ok("cousin" not in tv.locator(".dj-stage, body").first.inner_text() and (deck(tv)["reqs"][0].get("text") is None), "the TV never shows what she typed")
    tv.screenshot(path=os.path.join(OUT, f"deck-{WHICH}-tv-4-ask.png"))
    ok(until(lambda: (deck(tv).get("sounding") or {}).get("a") == "cpop", 30000, 250), "the speaker plays C-pop on deck A")
    end = time.time() + 20
    while time.time() < end and not deck(tv).get("drop"):
        for ph in phones:
            ph.evaluate("() => { const b = document.querySelector('.djk-charge'); if (b) for (let i = 0; i < 3; i++) b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); }")
        amy.wait_for_timeout(150)
    dr = deck(tv).get("drop")
    ok(bool(dr) and dr["to"] == "a", "the table builds it up: the drop goes to deck A")
    arm_press(amy, ".djk-drop", dr["cue"] + 15)
    ok(until(lambda: (deck(tv).get("last") or {}).get("bar") == dr["bar"], wait_ms(dr["at"]) + 4000), "it lands")
    now_req = deck(tv).get("now") or {}
    ok(now_req.get("text") == "晴天" and deck(tv)["fader"] == 0, "晴天's remix is on the air")
    ok(until(lambda: "晴天" in (tv.locator(".dk-req.is-now").inner_text() if tv.locator(".dk-req.is-now").count() else ""), 3000), f"the TV says so ({tv.locator('.dk-req.is-now').inner_text() if tv.locator('.dk-req.is-now').count() else ''})")
    heard = lambda: (tv.evaluate("() => window.__djBooth.heard()") or {}).get("track")
    ok(until(lambda: heard() == now_req.get("track"), 40000, 250), f"the stand-in plays its remix, a song of its own, from its next section (track {heard()})")
    ok(until(lambda: (deck(tv).get("up") or {}).get("by") is not None and deck(tv)["up"].get("text") is None and deck(tv).get("b") == "house", 3000), "Cat's comes up next, on deck B: the TV knows a song was asked for, not its name")
    tv.screenshot(path=os.path.join(OUT, f"deck-{WHICH}-tv-5-remix.png"))
    # nobody drops into Cat's: 40 seconds on, the DJ does
    up_at = time.time()
    ok(until(lambda: (deck(tv).get("drop") or {}).get("auto") is True, 75000, 250), f"nobody drops into it: the DJ starts the countdown itself, {round(time.time() - up_at)} s on")
    dr = deck(tv)["drop"]
    ok(until(lambda: (deck(tv).get("last") or {}).get("bar") == dr["bar"], wait_ms(dr["at"]) + 4000), "and drops it")
    ok(deck(tv)["last"]["auto"] and deck(tv)["last"]["to"] == "b" and (deck(tv).get("now") or {}).get("by") == cat.evaluate("() => window.__room.you"), "Cat's song plays now")
    st = tv.evaluate("() => window.__djBooth.stats()")
    ok(st["state"] == "playing" and st["stalls"] == 0, f"the music never stopped ({st})")

    bad = [e for e in errs + [x for ph in phones for x in ph._errs] if "WebSocket" not in e and "favicon" not in e]
    ok(not bad, f"no errors {bad[:3]}")
    br.close()
    if chrome is not br:
        chrome.close()

print("\nall passed" if not fails else f"\n{len(fails)} failed: {fails}")
sys.exit(1 if fails else 0)
