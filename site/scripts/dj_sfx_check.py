"""打碟 · DJ Booth: the sound board (Steve on Nov 13: "首先对我的这些音效进行细致的分类…玩家看到的会先是这些
分类进去之后才可以播放音效。把你的音效全部替换掉"), in browsers: a TV and two phones.

What it checks: every phone shows the nine categories first (in its language), no old pads; a category
opens its sounds, ‹ and the phone's back button go back to the categories; a tap plays the sound on the
TV at once (its own sound, the file from the site), a chip there saying who played what; the same
sound from someone else straight after isn't played twice; different ones at once all play (four at
most together); the TV has fetched the files ahead.

Needs the two local servers (site/README.md).
usage: python3 scripts/dj_sfx_check.py
"""
import os, sys, tempfile
from playwright.sync_api import sync_playwright

sys.path.insert(0, os.path.dirname(__file__))
from party_test import until, ok, fails, phone, view  # noqa: E402

BASE = "http://127.0.0.1:5173/"
OUT = os.environ.get("SHOTS", os.path.join(tempfile.gettempdir(), "dj-sfx"))
os.makedirs(OUT, exist_ok=True)


def text(pg, sel):
    loc = pg.locator(sel)
    return loc.first.inner_text() if loc.count() else ""


def played(tv):
    return tv.evaluate("() => window.__sfx || { n: 0 }")


with sync_playwright() as p:
    br = p.chromium.launch()
    tv = br.new_context(viewport={"width": 1600, "height": 900}).new_page()
    errs = []
    tv.on("pageerror", lambda e: errs.append(str(e)))
    tv.on("console", lambda m: errs.append(m.text) if m.type == "error" and "WebSocket" not in m.text else None)
    tv.goto(BASE + "dj", wait_until="load")
    code = until(lambda: tv.locator(".dj-join-code").inner_text().strip(), 15000)
    tv.locator(".dj-start-btn").click()
    ok(until(lambda: (view(tv) or {}).get("phase") == "warm", 15000), f"the night starts ({code})")
    sfx = tv.evaluate("async () => (await import('/src/shared/dj/sfx.ts')).SFX.map((x) => [x.id, x.cat, x.zh, x.en])")
    idx = {x[0]: i for i, x in enumerate(sfx)}

    phones = []
    for name, lang in (("Amy", "zh"), ("Ben", "en")):
        ph = phone(br, name, lang)
        ph.goto(BASE + f"#/r/{code}", wait_until="load")
        ph.locator(".join-card input").fill(name)
        ph.locator(".join-card button[type=submit]").click()
        ok(until(lambda: ph.locator(".djk-cat").count() == 9, 10000), f"{name}'s phone shows the nine kinds of sounds first")
        phones.append(ph)
    amy, ben = phones
    cats = amy.locator(".djk-cat .djk-cat-name").all_inner_texts()
    ok(cats[:3] == ["DJ 音效", "DJ 喊麦", "高潮"] and "粗口 · 慎点" in cats and ben.locator(".djk-cat .djk-cat-name").all_inner_texts()[3] == "Funny", f"named in each phone's language ({cats})")
    ok(amy.locator(".djk-pad").count() == 0 and amy.locator(".djk-sfx").count() == 0, "no old pads; no sounds until a kind is opened")
    sizes = amy.evaluate("() => [...document.querySelectorAll('.djk-cat')].map((b) => Math.round(b.getBoundingClientRect().height))")
    ok(all(h >= 48 for h in sizes), f"each kind big enough to hit ({sorted(set(sizes))} px)")
    amy.locator(".djk-board").scroll_into_view_if_needed()
    amy.screenshot(path=os.path.join(OUT, "sfx-amy-0-kinds.png"))

    # a kind opens its sounds; ‹ and the phone's back button go back
    n_funny = sum(1 for x in sfx if x[1] == "funny")
    ben.locator(".djk-cat.is-funny").click()
    ok(until(lambda: ben.locator(".djk-sfx").count() == n_funny, 3000) and "Funny" in text(ben, ".djk-board-name"), f"Ben opens Funny: its {n_funny} sounds")
    ben.locator(".djk-board-back").click()
    ok(until(lambda: ben.locator(".djk-cat").count() == 9, 3000), "‹ goes back to the kinds")
    ben.locator(".djk-cat.is-taunt").click()
    ok(until(lambda: ben.locator(".djk-sfx").count() > 0, 3000), "Taunts open")
    ben.go_back()
    ok(until(lambda: ben.locator(".djk-cat").count() == 9, 3000) and ben.locator(".djk-player").count() == 1, "the phone's back button goes back to the kinds, still on the booth")

    # Amy plays 芭比Q了 from 粗口: on the TV at once, a chip saying so
    amy.locator(".djk-cat.is-rude").click()
    amy.screenshot(path=os.path.join(OUT, "sfx-amy-1-rude.png"))
    n0 = played(tv)["n"]
    amy.get_by_role("button", name="芭比Q了").click()
    ok(until(lambda: played(tv)["n"] == n0 + 1 and played(tv).get("i") == idx["rude-bbq"], 4000), f"the TV plays it ({played(tv)})")
    ok(until(lambda: "Amy · 芭比Q了" in text(tv, ".dk-chip.is-sfx-rude") or "Amy · It's barbecued" in text(tv, ".dk-chip.is-sfx-rude"), 3000), f"a chip on the TV says who played what ({text(tv, '.dk-chips')!r})")
    ok(until(lambda: "你 · 芭比Q了" in text(amy, ".djk-said"), 3000), f"her phone too ({text(amy, '.djk-said')!r})")
    # the same one from Ben straight after: not twice
    ben.locator(".djk-cat.is-rude").click()
    ben.get_by_role("button", name="It's barbecued").click()
    tv.wait_for_timeout(1200)
    ok(played(tv)["n"] == n0 + 1, "the same one from Ben straight after: not played twice")
    tv.screenshot(path=os.path.join(OUT, "sfx-tv-1-chip.png"))

    # different ones at once: they all play, four together at most
    tv.wait_for_timeout(1600)
    ben.locator(".djk-board-back").click()
    ben.locator(".djk-cat.is-hype").click()
    amy.locator(".djk-board-back").click()
    amy.locator(".djk-cat.is-funny").click()
    n1 = played(tv)["n"]
    for k in range(3):
        amy.locator(".djk-sfx").nth(k).click()
        ben.locator(".djk-sfx").nth(k).click()
        amy.wait_for_timeout(650)
    ok(until(lambda: played(tv)["n"] >= n1 + 6, 6000), f"six different ones in a row all play ({played(tv)['n'] - n1})")
    ok(played(tv)["voices"] <= 4, f"four at most together ({played(tv)['voices']})")
    ok(until(lambda: (tv.evaluate("() => window.__sfxFetched || 0")) >= len(sfx), 30000, 500), f"the TV fetched every file ahead ({tv.evaluate('() => window.__sfxFetched || 0')} of {len(sfx)})")

    bad = [e for e in errs + [x for ph in phones for x in ph._errs] if "WebSocket" not in e and "favicon" not in e]
    ok(not bad, f"no errors {bad[:3]}")
    br.close()

print("\nall passed" if not fails else f"\n{len(fails)} failed: {fails}")
sys.exit(1 if fails else 0)
