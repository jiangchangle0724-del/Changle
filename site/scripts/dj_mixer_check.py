"""打碟 · DJ Booth, the mixer (混音台) in browsers: the TV starts the night; two phones play the mixer
and the speaker's output is measured for each control: Amy cuts the bass (the low end drops out;
Ben's turn of the same knob waits while she has it), the filter closed (the highs go) and opened
the other way (the lows go), the reset; the pump (the music ducking on every beat), the gate (cut
into sixteenths), the flanger and the lo-fi, each switching on a beat; the TV shows the mixer and
who did what; and a drop puts the knobs back to 0 on its bar.

Needs the two local servers (site/README.md), with DEV_LYRIA_ANYONE off.
usage: python3 scripts/dj_mixer_check.py [chromium|webkit]   (the TV's browser; the phones are Chromium)
"""
import os, sys, tempfile, time
from playwright.sync_api import sync_playwright

sys.path.insert(0, os.path.dirname(__file__))
from party_test import until, ok, fails, phone, view  # noqa: E402

BASE = "http://127.0.0.1:5173/"
WHICH = next((a for a in sys.argv[1:] if a in ("chromium", "webkit")), "chromium")
OUT = os.environ.get("SHOTS", os.path.join(tempfile.gettempdir(), "dj-mixer"))
os.makedirs(OUT, exist_ok=True)


def deck(pg):
    return (view(pg) or {}).get("deck") or {}


def mixer(pg):
    return deck(pg).get("mixer") or {}


def band(tv, lo, hi, n=12):
    """The speaker's output between `lo` and `hi` Hz, in dB, averaged over n looks 60 ms apart."""
    return tv.evaluate(
        """([lo, hi, n]) => new Promise((done) => { const a = window.__fakeDj.speaker.analyser; const b = new Float32Array(a.frequencyBinCount);
        const hz = a.context.sampleRate / a.fftSize; let sum = 0, k = 0;
        const look = () => { a.getFloatFrequencyData(b); let s = 0, m = 0;
          for (let i = Math.max(1, Math.round(lo / hz)); i <= Math.round(hi / hz); i++) { s += Math.pow(10, b[i] / 10); m++; }
          sum += 10 * Math.log10(s / m); k++; if (k < n) setTimeout(look, 60); else done(sum / k); }; look(); })""",
        [lo, hi, n],
    )


def param(tv, path):
    return tv.evaluate(f"() => window.__fakeDj.speaker.mixer.{path}.value")


def swing(tv, path, secs=2.0):
    """The lowest and highest a mixer gain goes over `secs` (looked at every 5 ms)."""
    return tv.evaluate(
        """([path, secs]) => new Promise((done) => { const p = path.split('.').reduce((o, k) => o[k], window.__fakeDj.speaker.mixer);
        let lo = Infinity, hi = -Infinity; const end = performance.now() + secs * 1000;
        const look = () => { const v = p.value; lo = Math.min(lo, v); hi = Math.max(hi, v); if (performance.now() < end) setTimeout(look, 5); else done([lo, hi]); }; look(); })""",
        [path, secs],
    )


def set_knob(ph, knob, value):
    """Turn a knob on a phone the way a finger does: a few moves, then let go."""
    i = ["low", "mid", "high", "filter"].index(knob)
    return ph.evaluate(
        """async ([i, to]) => { const el = document.querySelectorAll('.djk-knob input')[i]; if (!el || el.disabled) return false;
        const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; const from = Number(el.value);
        for (let k = 1; k <= 6; k++) { set.call(el, String(Math.round(from + (to - from) * k / 6))); el.dispatchEvent(new Event('input', { bubbles: true })); await new Promise(r => setTimeout(r, 60)); }
        el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); return true; }""",
        [i, round(value * 100)],
    )


def log(tv):
    return tv.evaluate(
        """() => { const d = window.__djBooth && window.__djBooth.deck(); if (!d) return [];
        return d.log.map(e => ({ k: e.k, at: e.at, beat: e.beat, want: d.beatAt(e.beat) })) }"""
    )


def on_beat(e):
    return e["want"] is not None and abs(e["beat"] - round(e["beat"])) < 1e-6 and abs(e["at"] - e["want"]) < 0.001


def charge(phones, tv, secs=30):
    end = time.time() + secs
    while time.time() < end and not deck(tv).get("drop"):
        for ph in phones:
            ph.evaluate("() => { const b = document.querySelector('.djk-charge'); if (b) for (let i = 0; i < 3; i++) b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); }")
        phones[0].wait_for_timeout(150)
    return deck(tv).get("drop")


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
    ok(until(lambda: tv.evaluate("() => window.__djBooth.stats()") and tv.evaluate("() => window.__djBooth.stats()")["state"] == "playing", 15000), "the music plays")

    phones = []
    for name in ("Amy", "Ben"):
        ph = phone(chrome, name, "zh")
        ph.goto(BASE + f"#/r/{code}", wait_until="load")
        ph.locator(".join-card input").fill(name)
        ph.locator(".join-card button[type=submit]").click()
        ok(until(lambda: ph.locator(".djk-pad").count() == 8, 10000), f"{name}'s phone shows the deck")
        phones.append(ph)
    amy, ben = phones
    ok(amy.locator(".djk-mix .djk-knob").count() == 4 and amy.locator(".djk-mix .djk-mix-btn").count() == 4, "the mixer on every phone: four knobs, four effects")
    ok(tv.locator(".dk-mix").count() == 0, "untouched, the TV doesn't show it")
    tv.wait_for_timeout(2500)

    # the bass cut
    low0 = band(tv, 45, 140)
    ok(set_knob(amy, "low", -1), "Amy turns the bass all the way down")
    ok(until(lambda: mixer(tv).get("knobs", {}).get("low") == -1 and mixer(tv).get("knobBy", {}).get("low"), 3000), "the room has it, and that it's hers for a moment")
    ok(until(lambda: ben.locator(".djk-knob input").first.is_disabled() and "Amy 在调" in ben.locator(".djk-knob").first.inner_text(), 3000), "Ben's bass knob waits while she has it")
    tv.wait_for_timeout(600)
    ok(abs(param(tv, "eq.low.gain") + 36) < 0.5, f"the TV's EQ: the low shelf at -36 dB ({param(tv, 'eq.low.gain'):.1f})")
    low1 = band(tv, 45, 140)
    ok(low1 < low0 - 15, f"in the speakers: the low end drops out ({low0:.1f} dB, then {low1:.1f})")
    ok(until(lambda: tv.locator(".dk-mix .dk-mix-knob").count() == 1 and "低音" in tv.locator(".dk-mix").inner_text() or "Low" in tv.locator(".dk-mix").inner_text(), 3000), "the TV shows the bass knob turned")
    tv.screenshot(path=os.path.join(OUT, f"mixer-{WHICH}-tv-1-low.png"))

    # the filter, both ways
    high0 = band(tv, 4000, 9000)
    set_knob(ben, "filter", -1)
    ok(until(lambda: mixer(tv).get("knobs", {}).get("filter") == -1, 3000), "Ben closes the filter")
    tv.wait_for_timeout(600)
    ok(param(tv, "lpf.frequency") < 400, f"the TV's low-pass closes to {param(tv, 'lpf.frequency'):.0f} Hz")
    high1 = band(tv, 4000, 9000)
    ok(high1 < high0 - 20, f"in the speakers: the highs go ({high0:.1f} dB, then {high1:.1f})")
    tv.wait_for_timeout(1700)
    set_knob(ben, "filter", 1)
    tv.wait_for_timeout(700)
    ok(param(tv, "hpf.frequency") > 2000 and param(tv, "lpf.frequency") > 15000, f"and the other way: the high-pass up to {param(tv, 'hpf.frequency'):.0f} Hz")

    # the reset
    tv.wait_for_timeout(1600)
    amy.locator(".djk-mix-reset").click()
    ok(until(lambda: all(v == 0 for v in (mixer(tv).get("knobs") or {"x": 1}).values()), 3000), "Amy resets the mixer: every knob back to 0")
    tv.wait_for_timeout(700)
    ok(abs(param(tv, "eq.low.gain")) < 0.3 and param(tv, "hpf.frequency") < 40 and param(tv, "lpf.frequency") > 15000, "on the TV too")
    low2 = band(tv, 45, 140)
    ok(abs(low2 - low0) < 6, f"the low end is back ({low2:.1f} dB)")
    ok(until(lambda: tv.locator(".dk-mix").count() == 0, 3000), "and the TV's mixer line goes")

    # the pump, on the beat
    amy.locator(".djk-mix-btn.is-pump").click()
    ok(until(lambda: bool((mixer(tv).get("fx") or {}).get("pump")), 3000), "Amy turns the pump on")
    ok(until(lambda: any("Amy" in c and ("泵感" in c or "Pump" in c) for c in tv.locator(".dk-chip").all_inner_texts()), 2000, 50), f"the TV says who turned it on ({tv.locator('.dk-chip').all_inner_texts()})")
    ok(until(lambda: "Amy · 泵感 开" in ben.locator(".djk-said").inner_text(), 2000, 50), "and so do the phones")
    ok(until(lambda: any(e["k"] == "pump-on" for e in log(tv)), 3000), "the TV switches it on")
    e = [e for e in log(tv) if e["k"] == "pump-on"][-1]
    ok(on_beat(e), f"on a beat, to the millisecond (beat {e['beat']})")
    tv.wait_for_timeout(1200)
    lo, hi = swing(tv, "pump.gain", 2.0)
    ok(lo < 0.3 and hi > 0.95, f"the music ducks on every beat and swells back (the pump's gain {lo:.2f} to {hi:.2f})")
    ok(until(lambda: amy.locator(".djk-mix-btn.is-pump.is-on").count() == 1 and ben.locator(".djk-mix-btn.is-pump[aria-pressed=true]").count() == 1, 3000), "lit on every phone")
    ok(until(lambda: tv.locator(".dk-mix-fx.is-pump").count() == 1, 3000), "and on the TV")

    # the gate, the flanger, the lo-fi
    ben.locator(".djk-mix-btn.is-gate").click()
    ok(until(lambda: any(e["k"] == "gate-on" for e in log(tv)), 4000), "Ben turns the gate on")
    ok(on_beat([e for e in log(tv) if e["k"] == "gate-on"][-1]), "on a beat")
    tv.wait_for_timeout(800)
    lo, hi = swing(tv, "gate.gain", 1.5)
    ok(lo < 0.15 and hi > 0.95, f"cut into sixteenths (the gate's gain {lo:.2f} to {hi:.2f})")
    amy.wait_for_timeout(500)
    amy.locator(".djk-mix-btn.is-flange").click()
    ok(until(lambda: any(e["k"] == "flange-on" for e in log(tv)), 4000), "Amy turns the flanger on")
    tv.wait_for_timeout(900)
    ok(abs(param(tv, "flangeWet.gain") - 0.7) < 0.05, f"the flanger's sweep in the mix ({param(tv, 'flangeWet.gain'):.2f})")
    ben.wait_for_timeout(500)
    high_a = band(tv, 8000, 16000)
    ben.locator(".djk-mix-btn.is-crush").click()
    ok(until(lambda: any(e["k"] == "crush-on" for e in log(tv)), 4000), "Ben turns the lo-fi on")
    tv.wait_for_timeout(900)
    ok(abs(param(tv, "crushWet.gain") - 0.85) < 0.05, f"the lo-fi copy in the mix ({param(tv, 'crushWet.gain'):.2f})")
    high_b = band(tv, 8000, 16000)
    ok(high_b > high_a + 6, f"in the speakers: the lo-fi's grit up top ({high_a:.1f} dB, then {high_b:.1f})")
    tv.screenshot(path=os.path.join(OUT, f"mixer-{WHICH}-tv-2-fx.png"))
    amy.screenshot(path=os.path.join(OUT, f"mixer-{WHICH}-phone-1.png"), full_page=True)
    st = tv.evaluate("() => window.__djBooth.stats()")
    ok(st["state"] == "playing" and st["stalls"] == 0, f"all four on, the music plays on ({st})")

    # all off; then a drop puts the knobs back to 0 on its bar
    amy.wait_for_timeout(500)
    amy.locator(".djk-mix-reset").click()
    ok(until(lambda: not (mixer(tv).get("fx") or {}), 3000), "the reset turns the effects off too")
    ok(until(lambda: all(any(e["k"] == f"{f}-off" for e in log(tv)) for f in ("pump", "gate", "flange", "crush")), 4000), "the TV switches each off, on a beat")
    tv.wait_for_timeout(1200)
    lo, hi = swing(tv, "pump.gain", 1.2)
    ok(lo > 0.95, f"the pump still ({lo:.2f})")
    amy.locator(".djk-pick").first.click()
    ok(until(lambda: (deck(tv).get("sounding") or {}).get("b") and (deck(tv).get("sounding") or {}).get("b") == deck(tv).get("b"), 30000, 250), "a pick on deck B, playing")
    tv.wait_for_timeout(1600)
    set_knob(amy, "low", -1)
    ok(until(lambda: mixer(tv).get("knobs", {}).get("low") == -1, 3000), "the bass cut again")
    dr = charge(phones, tv)
    ok(bool(dr), "everyone builds it up: a drop on its way")
    # (nobody presses DROP: the DJ drops it by itself on the count after, so no phone's timer is waited on)
    samples = []
    end = time.time() + 45
    while time.time() < end and (deck(tv).get("last") or {}).get("bar") is None:
        samples.append(param(tv, "eq.low.gain"))
        tv.wait_for_timeout(100)
    landed = deck(tv).get("last") or {}
    ok(landed.get("bar") is not None and landed["bar"] >= dr["bar"], f"it lands (the DJ's own drop, bar {landed.get('bar')})")
    ok(len(samples) > 5 and max(samples[:-4]) < -30, f"the bass cut until the drop ({samples[-5] if len(samples) > 5 else None})")
    tv.wait_for_timeout(500)
    ok(abs(param(tv, "eq.low.gain")) < 0.5 and all(v == 0 for v in mixer(tv)["knobs"].values()), f"the drop hits whole: the knobs back to 0 ({param(tv, 'eq.low.gain'):.1f} dB)")
    st = tv.evaluate("() => window.__djBooth.stats()")
    ok(st["state"] == "playing" and st["stalls"] == 0, f"the music never stopped ({st})")

    bad = [e for e in errs + [x for ph in phones for x in ph._errs] if "WebSocket" not in e and "favicon" not in e]
    ok(not bad, f"no errors {bad[:3]}")
    br.close()
    if chrome is not br:
        chrome.close()

print("\nall passed" if not fails else f"\n{len(fails)} failed: {fails}")
sys.exit(1 if fails else 0)
