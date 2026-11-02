"""打碟 · DJ Booth, the beginner deck, in browsers: a TV opens /dj and starts the night; three phones
sit down and play at once. Every pad lands on a beat; picks load deck B; whoever moves the fader
holds it; everyone taps the build-up full, the countdown runs on the TV and the phones, one phone
presses DROP on the cue, and the drop lands exactly on its bar, swaps to deck B and is perfect.

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


def press_at(pg, selector, when_ms, event="pointerdown"):
    """Press a button at a moment of the server's clock (locally, the page's own clock)."""
    return pg.evaluate(
        """([sel, when, ev]) => new Promise((done) => {
          const go = () => { const b = document.querySelector(sel); if (!b) return done(false);
            b.dispatchEvent(new PointerEvent(ev, { bubbles: true, pointerId: 1, isPrimary: true })); if (ev !== 'click') b.click && null; done(Date.now()); };
          const wait = when - Date.now(); if (wait <= 0) go(); else setTimeout(go, wait); })""",
        [selector, when_ms, event],
    )


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
    ok(until(lambda: deck(tv).get("grid"), 8000), "the speaker tells the room where its bars fall")

    phones = []
    for name in ("Amy", "Ben", "Cat"):
        ph = phone(chrome, name, "zh")
        ph.goto(BASE + f"#/r/{code}", wait_until="load")
        ph.locator(".join-card input").fill(name)
        ph.locator(".join-card button[type=submit]").click()
        ok(until(lambda: ph.locator(".djk-pad").count() == 4, 10000), f"{name}'s phone shows the deck")
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

    # picks: deck B takes the floor's style
    amy.locator(".djk-pick").nth(0).click()  # latin
    ben.locator(".djk-pick").nth(0).click()
    cat.locator(".djk-pick").nth(2).click()  # techno
    ok(until(lambda: deck(tv).get("b") == "latin", 4000), "two picks for latin, one for techno: latin goes on deck B")
    ok(until(lambda: any(w in tv.locator(".dk-deck").nth(1).inner_text() for w in ("拉丁", "Latin")), 3000), "the TV's deck B says so")

    # the fader: Amy holds it, Ben waits
    fader = amy.locator(".djk-fader input")
    fader.evaluate("(el) => { const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(el, '40'); el.dispatchEvent(new Event('input', { bubbles: true })); }")
    ok(until(lambda: abs(deck(tv).get("fader", 0) - 0.4) < 0.011, 3000), "Amy moves the crossfader to 0.4")
    ok(until(lambda: ben.locator(".djk-fader input").is_disabled(), 2000), "Ben's waits while Amy has it")
    ok("Amy" in ben.locator(".djk-fader-who").inner_text(), "and says who has it")
    fader.evaluate("(el) => { const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(el, '0'); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); }")
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
    ok(until(lambda: amy.locator(".djk-drop").count() == 1, 2000), "the phones' button turns into DROP")
    g = deck(tv)["grid"]
    beat_ms = 60000 / g["bpm"]
    ok(dr["bar"] % 4 == 0 and abs(dr["at"] - (g["at"] + (dr["bar"] - g["bar"]) * 4 * beat_ms)) < 2, "it lands on a 4-bar line of the speaker's bars")
    ok(until(lambda: tv.locator(".dk-count").count() == 1, (dr["at"] - time.time() * 1000) + 2000, 50), "the countdown shows on the TV")
    tv.screenshot(path=os.path.join(OUT, f"deck-{WHICH}-tv-2-count.png"))
    amy.screenshot(path=os.path.join(OUT, f"deck-{WHICH}-phone-2-drop.png"))
    # Ben presses DROP on the cue
    t = press_at(ben, ".djk-drop", dr["cue"] + 15)
    ok(bool(t), f"Ben presses DROP {round(t - dr['cue']) if t else '?'} ms after the cue")
    ok(until(lambda: any(e["k"] == "drop" for e in log(tv)["log"]), 3000), "the speaker sets the drop up")
    d_e = [e for e in log(tv)["log"] if e["k"] == "drop"][-1]
    ok(abs(d_e["beat"] - dr["bar"] * 4) < 1e-6 and on_beat(d_e), f"on its bar exactly (beat {round(d_e['beat'], 3)} = bar {dr['bar']})")
    ok(until(lambda: (deck(tv).get("last") or {}).get("bar") == dr["bar"], 6000), "it lands")
    last = deck(tv)["last"]
    ok(last["hits"] and last["hits"][0]["grade"] == "perfect" and last["to"] == "b" and deck(tv)["fader"] == 1, f"perfect, on deck B, the fader there ({last['hits']})")
    ok(until(lambda: tv.locator(".dk-dropped.is-perfect").count() == 1, 2000), "the TV celebrates a perfect drop")
    tv.wait_for_timeout(300)
    tv.screenshot(path=os.path.join(OUT, f"deck-{WHICH}-tv-3-perfect.png"))
    ok(deck(tv)["perfects"].get(ben.evaluate("() => window.__room.you"), 0) == 1, "and counts Ben's perfect drop")
    st = tv.evaluate("() => window.__djBooth.stats()")
    ok(st["state"] == "playing" and st["stalls"] == 0, f"the music never stopped ({st})")

    bad = [e for e in errs + [x for ph in phones for x in ph._errs] if "WebSocket" not in e and "favicon" not in e]
    ok(not bad, f"no errors {bad[:3]}")
    br.close()
    if chrome is not br:
        chrome.close()

print("\nall passed" if not fails else f"\n{len(fails)} failed: {fails}")
sys.exit(1 if fails else 0)
