"""打碟 · DJ Booth, the sound check (step 5 of docs/dj-booth.md). Against the local dev servers.

1. The speaker on its own (changle.ca/dj/test), in WebKit (the engine in Safari, on the Mac and the
   iPhone) and in Chromium: press start, time to first sound, a stretch of playing (state, stalls,
   the beat's pace against 125 BPM, the low end moving the lights), the drop test (stop the
   stream for 8 seconds: one stall, a fade, then back), and the move to the peak.
2. The booth at a table: a TV opens changle.ca/dj and becomes the speaker, two phones scan in (one
   WebKit, one Chromium), press 🔥, the TV shows whose; the host takes the night to the peak, ends
   the set, starts another.

usage: python3 scripts/dj_check.py [base_url] [zh|en] [seconds=60]
       python3 scripts/dj_check.py https://<preview>/ speaker [seconds]   the speaker page only
       python3 scripts/dj_check.py soak webkit|chromium [seconds=1800]   the speaker alone for a long
       while, the night's four stretches in turn (gate A asks for 30 minutes without a stall)
Screenshots and results.json go to $SHOTS (default: the session scratchpad's dj folder).
"""
import json, os, sys, time
from playwright.sync_api import sync_playwright

sys.path.insert(0, os.path.dirname(__file__))
from party_test import until, ok, fails, phone, room, view  # noqa: E402

BASE = next((a for a in sys.argv[1:] if a.startswith("http")), "http://127.0.0.1:5173/").rstrip("/") + "/"
LANG = next((a for a in sys.argv[1:] if a in ("zh", "en")), "zh")
SECONDS = next((int(a) for a in sys.argv[1:] if a.isdigit()), 60)
OUT = os.environ.get("SHOTS", "/tmp/claude-0/-home-claude/2907a50c-ad64-5e34-a6e1-1445acf2ecb9/scratchpad/dj")
os.makedirs(OUT, exist_ok=True)
results = {"base": BASE, "lang": LANG, "seconds": SECONDS, "engines": {}, "room": {}}


def settings(pg, sound=True):
    s = {"lang": LANG, "sound": sound, "music": False, "customPenalty": "", "players": []}
    pg.add_init_script("localStorage.setItem('lazysusan.settings.v1', %s);" % json.dumps(json.dumps(s)))


def errs_of(pg):
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.on("console", lambda m: errs.append("console: " + m.text) if m.type == "error" else None)
    return errs


def stats(pg):
    return pg.evaluate("() => window.__djTest && { s: window.__djTest.stats(), beat: window.__djTest.beat(), energy: window.__djTest.energy(), t: performance.now() }")


def speaker_alone(p, engine, mobile):
    name = f"{engine.name}-{'phone' if mobile else 'desktop'}"
    b = engine.launch()
    ctx = b.new_context(viewport={"width": 390, "height": 844} if mobile else {"width": 1280, "height": 800}, device_scale_factor=2 if mobile else 1, is_mobile=mobile and engine.name != "firefox", has_touch=mobile)
    pg = ctx.new_page()
    settings(pg)
    errs = errs_of(pg)
    pg.goto(BASE + "dj/test", wait_until="load")
    until(lambda: pg.evaluate("() => location.hash") == "#/dj/test", 4000)
    ready = until(lambda: pg.evaluate("() => window.__djTest && window.__djTest.ready()"), 30000, 200)
    ok(bool(ready), f"{name}: the music is recorded on the device before the tap")
    pg.screenshot(path=os.path.join(OUT, f"test-{name}-0-before.png"))
    t0 = time.time()
    pg.locator(".djt-intro .btn-primary").click()
    playing = until(lambda: (stats(pg) or {}).get("s", {}) and stats(pg)["s"]["state"] == "playing", 15000, 50)
    first = time.time() - t0
    ok(bool(playing), f"{name}: sound starts after the tap ({first:.2f} s)")
    r = {"first_sound_s": round(first, 2)}
    # a stretch of playing, sampled twice a second
    samples = []
    end = time.time() + SECONDS
    while time.time() < end:
        s = stats(pg)
        if s:
            samples.append(s)
        time.sleep(0.5)
    if len(samples) > 4:
        a, z = samples[2], samples[-1]
        pace = (z["beat"] - a["beat"]) / ((z["t"] - a["t"]) / 1000) * 60
        energies = [s["energy"] for s in samples]
        states = {s["s"]["state"] for s in samples}
        r.update(
            {
                "rate_hz": samples[-1]["s"]["rate"],
                "latency_ms": round(samples[-1]["s"]["latency"] * 1000),
                "stalls": samples[-1]["s"]["stalls"],
                "buffered_min_s": round(min(s["s"]["buffered"] for s in samples[2:]), 2),
                "bpm_measured": round(pace, 2),
                "energy_min": round(min(energies), 2),
                "energy_max": round(max(energies), 2),
                "states": sorted(states),
            }
        )
        ok(samples[-1]["s"]["stalls"] == 0 and states == {"playing"}, f"{name}: {SECONDS} s of playing, no stall (states {sorted(states)})")
        ok(abs(pace - 125) < 0.5, f"{name}: the beat clock runs at {pace:.2f} BPM (125 played)")
        ok(max(energies) > 0.6 and min(energies) < 0.4, f"{name}: the low end moves the lights ({min(energies):.2f} to {max(energies):.2f})")
    pg.screenshot(path=os.path.join(OUT, f"test-{name}-1-playing.png"))
    # the drop test: 8 seconds with nothing coming in
    before = stats(pg)["s"]["stalls"]
    pg.locator(".djt-actions .btn").nth(1).click()
    dropped = until(lambda: stats(pg)["s"]["state"] == "buffering", 12000, 100)
    ok(bool(dropped), f"{name}: the drop: the 5 seconds in hand play out, then it waits")
    back = until(lambda: stats(pg)["s"]["state"] == "playing", 12000, 100)
    after = stats(pg)["s"]["stalls"]
    ok(bool(back) and after == before + 1, f"{name}: the stream comes back and it plays again (one stall counted)")
    r["drop_stalls"] = after - before
    # the peak, on the phrase
    pg.locator(".djt-phases .seg button").nth(2).click()
    pg.wait_for_timeout(1500)
    ok(stats(pg)["s"]["state"] == "playing", f"{name}: playing on into the peak")
    pg.screenshot(path=os.path.join(OUT, f"test-{name}-2-peak.png"))
    r["errors"] = [e for e in errs if "favicon" not in e and "WebSocket" not in e][:5]
    ok(not r["errors"], f"{name}: no errors on the page {r['errors']}")
    results["engines"][name] = r
    b.close()


def the_room(p):
    br = p.chromium.launch()
    wk = p.webkit.launch()
    tv_ctx = br.new_context(viewport={"width": 1600, "height": 900})
    tv = tv_ctx.new_page()
    settings(tv)
    tv_errs = errs_of(tv)
    tv.goto(BASE + "dj", wait_until="load")
    code = until(lambda: tv.locator(".dj-join-code").inner_text().strip(), 15000)
    ok(bool(code) and len(code) == 4, f"the TV at /dj opens a table with the booth up ({code})")
    ok((view(tv) or {}).get("phase") == "wait", "the booth waits for the speaker")
    tv.screenshot(path=os.path.join(OUT, "room-0-tv-start.png"))
    tv.locator(".dj-start-btn").click()
    live = until(lambda: (view(tv) or {}).get("phase") == "warm", 15000)
    ok(bool(live), "the tap on the TV starts the music: the warm-up")
    # phones scan in
    a = phone(wk, "Amy", LANG)
    a.goto(BASE + f"#/r/{code}", wait_until="load")
    a.locator(".join-card input").fill("Amy")
    a.locator(".join-card button[type=submit]").click()
    until(lambda: room(a), 8000)
    bb = phone(br, "Ben", LANG)
    bb.goto(BASE + f"#/r/{code}", wait_until="load")
    bb.locator(".join-card input").fill("Ben")
    bb.locator(".join-card button[type=submit]").click()
    until(lambda: room(bb), 8000)
    ok(until(lambda: a.locator(".djp-fire").count() > 0, 8000) and until(lambda: bb.locator(".djp-fire").count() > 0, 8000), "both phones land on the booth's 🔥 (one WebKit, one Chromium)")
    ok(until(lambda: tv.locator(".dj-dancer").count() == 2, 6000), "the TV's floor has both dancing")
    for _ in range(3):
        a.locator(".djp-fire").click()
        a.wait_for_timeout(450)
    bb.locator(".djp-fire").click()
    flames = until(lambda: tv.locator(".dj-flame").count() > 0, 3000)
    ok(bool(flames), "the TV shows a flame over whoever pressed")
    tv.wait_for_timeout(300)
    tv.screenshot(path=os.path.join(OUT, "room-1-tv-fire.png"))
    totals = (view(tv) or {}).get("total", {})
    ok(sorted(totals.values()) == [1, 3], f"the room counted Amy 3, Ben 1 ({totals})")
    a.screenshot(path=os.path.join(OUT, "room-2-phone-host.png"))
    bb.screenshot(path=os.path.join(OUT, "room-3-phone-guest.png"))
    # the host (Amy sat first) drags the night to the peak
    a.locator(".djp-seg button").nth(2).click()
    ok(until(lambda: (view(tv) or {}).get("phase") == "peak", 4000), "the host takes the night to the peak")
    ok(bb.locator(".djp-seg").count() == 0, "a guest has no host controls")
    # the lights change with the music, which reaches the peak at the end of its phrase (and once
    # the device has recorded the peak's sections)
    t_tap = time.time()
    lit = until(lambda: "is-peak" in (tv.evaluate("() => document.querySelector('.dj-stage')?.className") or ""), 45000, 100)
    ok(bool(lit), f"the TV lights turn to the peak's colours when the music gets there ({time.time() - t_tap:.1f} s after the tap)")
    ok(tv.locator(".dj-drop.is-peak").count() > 0, "and its name goes across the floor")
    tv.screenshot(path=os.path.join(OUT, "room-4-tv-peak.png"))
    a.locator(".djp-host .btn-ghost").click()
    ok(until(lambda: (view(tv) or {}).get("phase") == "end", 4000), "the host ends the set")
    ok(until(lambda: tv.locator(".dj-end").count() > 0, 4000), "the TV shows the night's recap")
    tv.wait_for_timeout(1500)
    tv.screenshot(path=os.path.join(OUT, "room-5-tv-end.png"))
    a.locator(".djp-host .btn-primary").click()
    ok(until(lambda: (view(tv) or {}).get("phase") == "warm", 6000), "another set: the speaker starts it again by itself")
    # (the dev server's double mount closes a first socket early: not a real error)
    bad = [e for e in tv_errs + a._errs + bb._errs if "favicon" not in e and "WebSocket" not in e]
    ok(not bad, f"no errors on the TV or the phones {bad[:4]}")
    results["room"] = {"code": code, "totals": totals}
    br.close()
    wk.close()


def soak(p, engine, seconds):
    """The speaker test page left playing, moving through the night every few minutes."""
    b = engine.launch()
    pg = b.new_context(viewport={"width": 1280, "height": 800}).new_page()
    settings(pg)
    errs = errs_of(pg)
    pg.goto(BASE + "dj/test", wait_until="load")
    until(lambda: pg.evaluate("() => window.__djTest && window.__djTest.ready()"), 60000, 250)
    pg.locator(".djt-intro .btn-primary").click()
    until(lambda: stats(pg) and stats(pg)["s"]["state"] == "playing", 20000, 100)
    t0 = time.time()
    first = stats(pg)
    rows = []
    step = 0
    while time.time() - t0 < seconds:
        el = time.time() - t0
        if el > (step + 1) * 150:
            step += 1
            pg.locator(".djt-phases .seg button").nth(step % 4).click()
        s = stats(pg)
        rows.append({"t": round(el, 1), "state": s["s"]["state"], "stalls": s["s"]["stalls"], "buffered": round(s["s"]["buffered"], 2), "beat": round(s["beat"], 3)})
        time.sleep(5)
    last = stats(pg)
    pace = (last["beat"] - first["beat"]) / ((last["t"] - first["t"]) / 1000) * 60
    r = {
        "engine": engine.name,
        "seconds": round(time.time() - t0),
        "stalls": last["s"]["stalls"],
        "buffered_min_s": min(x["buffered"] for x in rows),
        "not_playing_samples": sum(1 for x in rows if x["state"] != "playing"),
        "bpm_measured": round(pace, 3),
        "errors": [e for e in errs if "favicon" not in e and "WebSocket" not in e][:5],
    }
    with open(os.path.join(OUT, f"soak-{engine.name}.json"), "w") as f:
        json.dump({**r, "rows": rows}, f, indent=1)
    ok(r["stalls"] == 0 and r["not_playing_samples"] == 0, f"{engine.name}: {r['seconds']} s through the night's stretches, {r['stalls']} stalls")
    ok(abs(pace - 125) < 0.2, f"{engine.name}: the beat clock held {pace:.3f} BPM")
    print(json.dumps(r))
    b.close()


if "soak" in sys.argv[1:]:
    which = next((a for a in sys.argv[1:] if a in ("webkit", "chromium")), "chromium")
    secs = next((int(a) for a in sys.argv[1:] if a.isdigit()), 1800)
    with sync_playwright() as p:
        soak(p, getattr(p, which), secs)
    sys.exit(1 if fails else 0)

with sync_playwright() as p:
    for engine in (p.webkit, p.chromium):
        for mobile in (False, True):
            speaker_alone(p, engine, mobile)
    # ("speaker": only the page above, e.g. on a branch preview, whose tables don't know the booth yet)
    if "speaker" not in sys.argv[1:]:
        the_room(p)

results["fails"] = fails
with open(os.path.join(OUT, "results.json"), "w") as f:
    json.dump(results, f, indent=2, ensure_ascii=False)
print(json.dumps(results, indent=2, ensure_ascii=False))
print("\nall passed" if not fails else f"\n{len(fails)} failed")
sys.exit(1 if fails else 0)
