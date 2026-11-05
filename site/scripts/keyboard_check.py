"""With a keyboard: sheets and the penalty stamp take focus, keep Tab inside, close on Esc, and give
focus back to whatever opened them (components/Sheet.tsx, components/PenaltyStamp.tsx).

usage: python3 scripts/keyboard_check.py [base_url]
needs the site running (npm run dev).
"""
import json, re, sys
from playwright.sync_api import sync_playwright

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:5173").rstrip("/")
PLAYERS = [{"id": f"p{i}", "name": n} for i, n in enumerate(["Steve", "Mia", "Jay"])]
failed = 0


def ok(cond, msg):
    global failed
    print(("ok   " if cond else "FAIL ") + msg)
    if not cond:
        failed += 1


def inside(pg, sel):
    return pg.evaluate("(sel) => !!(document.activeElement && document.activeElement.closest(sel))", sel)


with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 1000, "height": 800})
    settings = {"lang": "en", "sound": False, "music": False, "customPenalty": "", "players": PLAYERS}
    pg.add_init_script("localStorage.setItem('lazysusan.settings.v1', %s); sessionStorage.setItem('changle.entered', '1');" % json.dumps(json.dumps(settings)))
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(BASE + "/g/truth-or-dare/play", wait_until="networkidle")
    pg.wait_for_timeout(800)

    # a sheet: the rules
    # (the game's top bar: on a wide screen its rules button sits in the bar, not behind a menu)
    RULES = re.compile(r"^(Rules|How to play)$")
    pg.get_by_role("button", name=RULES).first.focus()
    pg.keyboard.press("Enter")
    pg.wait_for_timeout(700)
    ok(inside(pg, "[role=dialog]"), "a sheet takes focus as it opens")
    stays = set()
    for key in ["Tab"] * 8 + ["Shift+Tab"] * 8:
        pg.keyboard.press(key)
        stays.add(inside(pg, "[role=dialog]"))
    ok(stays == {True}, "Tab and Shift+Tab go round inside the sheet")
    pg.keyboard.press("Escape")
    pg.wait_for_timeout(700)
    ok(pg.locator("[role=dialog]").count() == 0, "Esc closes the sheet")
    back = pg.evaluate("() => document.activeElement && (document.activeElement.getAttribute('aria-label') || document.activeElement.textContent.trim())")
    ok(bool(back and RULES.match(back)), f"focus goes back to the button that opened it ({back})")

    # the penalty stamp: spin, take truth, pass on it
    pg.get_by_role("button", name="Spin the bottle").click()
    pg.wait_for_timeout(5500)
    pg.get_by_role("button", name="Truth").click()
    pg.wait_for_timeout(500)
    pg.locator(".cloche-dome").first.click()
    pg.wait_for_timeout(900)
    pg.locator(".btn-penalty").click()
    pg.wait_for_timeout(900)
    ok(inside(pg, ".stamp-layer"), "the penalty stamp takes focus")
    pg.keyboard.press("Tab")
    ok(inside(pg, ".stamp-layer"), "Tab stays on the stamp")
    pg.keyboard.press("Escape")
    pg.wait_for_timeout(600)
    ok(pg.locator(".stamp-layer").count() == 0 and pg.locator(".bottle-svg").count() == 1, "Esc lets the stamp go and the game moves on")
    ok(not errs, f"no page errors {errs[:3]}")
    b.close()

print("keyboard check passed" if not failed else f"{failed} failed")
sys.exit(1 if failed else 0)
