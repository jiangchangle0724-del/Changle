"""打碟 · DJ Booth, Lyria (A2), against the fake Lyria server: a TV opens /dj and the stand-in starts
the night; a phone sits down (locally any table may try Lyria), the table's relay opens a session,
Lyria takes over once it has a few seconds in hand, plays on the beat, follows the host to the
peak, carries on through a dropped stream, and the stand-in takes the music back when the table
stops being one of the owner's (the phone leaves).

Needs the two local servers (site/README.md), plus the fake: `node scripts/fake_lyria.mjs`, with
DEV_LYRIA_URL=ws://127.0.0.1:8790 and DEV_LYRIA_ANYONE=1 in site/worker/.dev.vars.

usage: python3 scripts/dj_lyria_check.py [chromium|webkit]   (the TV's browser; the phone is Chromium)
"""
import json, os, sys, time, urllib.request
from playwright.sync_api import sync_playwright

sys.path.insert(0, os.path.dirname(__file__))
from party_test import until, ok, fails, phone, view  # noqa: E402

BASE = "http://127.0.0.1:5173/"
FAKE = "http://127.0.0.1:8790"
OUT = os.environ.get("SHOTS", "/tmp/claude-0/-home-claude/2907a50c-ad64-5e34-a6e1-1445acf2ecb9/scratchpad/dj-lyria")
os.makedirs(OUT, exist_ok=True)
WHICH = next((a for a in sys.argv[1:] if a in ("chromium", "webkit")), "chromium")


def fake(path):
    return json.loads(urllib.request.urlopen(FAKE + path, timeout=5).read())


def booth(pg):
    return pg.evaluate("() => window.__djBooth && { s: window.__djBooth.stats(), source: window.__djBooth.source, beat: window.__djBooth.beat(), t: performance.now() }")


def stage(pg):
    return pg.evaluate("() => (document.querySelector('.dj-stage') || {}).className || ''")


def words(st):
    return [p["text"] for p in (st.get("prompts") or [])]


with sync_playwright() as p:
    fake("/reset")
    br = getattr(p, WHICH).launch()
    chrome = br if WHICH == "chromium" else p.chromium.launch()
    tv = br.new_context(viewport={"width": 1600, "height": 900}).new_page()
    errs = []
    tv.on("pageerror", lambda e: errs.append(str(e)))
    tv.on("console", lambda m: errs.append(m.text) if m.type == "error" and "WebSocket" not in m.text else None)
    tv.goto(BASE + "dj", wait_until="load")
    code = until(lambda: tv.locator(".dj-join-code").inner_text().strip(), 15000)
    tv.locator(".dj-start-btn").click()
    ok(until(lambda: (view(tv) or {}).get("phase") == "warm", 15000), f"{WHICH}: the tap starts the night with the stand-in ({code})")
    ok((view(tv) or {}).get("lab") is False and fake("/state")["connections"] == 0, "nobody at the table: Lyria isn't asked")

    ph = phone(chrome, "Amy", "en")
    ph.goto(BASE + f"#/r/{code}", wait_until="load")
    ph.locator(".join-card input").fill("Amy")
    ph.locator(".join-card button[type=submit]").click()
    ok(until(lambda: (view(tv) or {}).get("lab") is True, 8000), "a phone sits down (locally, any table may try): the booth may play Lyria")
    ok(until(lambda: fake("/state")["setups"] >= 1, 10000), "the table's relay opens a Lyria session")
    ok(until(lambda: "Chill" in words(fake("/state")), 5000), "and asks for the warm-up")
    st = fake("/state")
    ok("Deep House" in words(st) and st["config"]["bpm"] == 125 and abs(st["config"]["density"] - 0.35) < 1e-6 and st["plays"].get("PLAY", 0) >= 1, f"deep house at 125 BPM, the warm-up's density, play ({words(st)})")
    ok(until(lambda: (view(tv) or {}).get("source") == "lyria", 20000), "Lyria takes over once it has a few seconds in hand (the phones see AI DJ)")
    ok(until(lambda: (booth(tv) or {}).get("source") == "lyria" and ((booth(tv) or {}).get("s") or {}).get("state") == "playing", 10000), "the speaker plays Lyria")
    tv.wait_for_timeout(3000)
    tv.screenshot(path=os.path.join(OUT, f"lyria-{WHICH}-1-warm.png"))
    a = booth(tv)
    tv.wait_for_timeout(12000)
    z = booth(tv)
    pace = (z["beat"] - a["beat"]) / ((z["t"] - a["t"]) / 1000) * 60
    ok(abs(pace - 125) < 1, f"on the beat: 125 BPM ({pace:.2f})")
    frac = z["beat"] % 1
    ok(z["s"]["stalls"] == a["s"]["stalls"], f"no stall ({z['s']['stalls']})")
    ok(fake("/state")["plays"].get("PAUSE", 0) >= 1, "Lyria (here twice as fast as real time) is held back when it gets ahead")

    ph.evaluate("() => window.__djHost.phase('peak')")
    ok(until(lambda: "Euphoric" in words(fake("/state")), 6000), "the host takes the night to the peak: Lyria is asked for it at once")
    ok(abs(fake("/state")["config"]["density"] - 0.9) < 1e-6, "dense and bright")
    ok(until(lambda: "is-peak" in stage(tv), 30000, 200), "the lights follow when the speakers get there")
    tv.wait_for_timeout(600)
    tv.screenshot(path=os.path.join(OUT, f"lyria-{WHICH}-2-peak.png"))

    before = booth(tv)["s"]["stalls"]
    setups = fake("/state")["setups"]
    fake("/drop")
    ok(until(lambda: fake("/state")["setups"] > setups, 12000), "Lyria's side drops: the relay sets a new session up")
    ok(until(lambda: fake("/state")["open"] >= 1 and "Euphoric" in words(fake("/state")), 6000), "where it was: the peak")
    tv.wait_for_timeout(8000)
    b = booth(tv)
    ok(b["source"] == "lyria" and b["s"]["state"] == "playing" and b["s"]["stalls"] - before <= 1, f"the music carries on (stalls {b['s']['stalls'] - before})")

    ph.locator(".topbar-side .icon-btn").first.click()
    ph.wait_for_timeout(500)
    for name in ("I'm leaving the table", "Leave the table"):
        btn = ph.get_by_role("dialog").get_by_role("button", name=name)
        if btn.count():
            btn.click()
            break
    ok(until(lambda: (view(tv) or {}).get("lab") is False, 8000), "the phone leaves: no longer one of the owner's tables")
    ok(until(lambda: (booth(tv) or {}).get("source") == "fake", 15000), "the stand-in takes the music back")
    ok(until(lambda: fake("/state")["open"] == 0, 15000), "and the Lyria session closes")
    ok(until(lambda: ((booth(tv) or {}).get("s") or {}).get("state") == "playing", 12000), "the stand-in plays")
    tv.screenshot(path=os.path.join(OUT, f"lyria-{WHICH}-3-back.png"))
    bad = [e for e in errs + ph._errs if "WebSocket" not in e and "favicon" not in e]
    ok(not bad, f"no errors {bad[:3]}")
    br.close()
    if chrome is not br:
        chrome.close()

print("\nall passed" if not fails else f"\n{len(fails)} failed: {fails}")
sys.exit(1 if fails else 0)
