"""Every page has its own address, and the back button walks back through them (src/router.ts).

usage: python3 scripts/routes_check.py [base_url]
needs the site running (npm run dev); the rooms server too for the table at the end (site/README.md).
"""
import json, sys
from playwright.sync_api import sync_playwright

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:5173").rstrip("/")
PLAYERS = [{"id": f"p{i}", "name": n} for i, n in enumerate(["Steve", "Ann", "小明", "Ben", "Cathy"])]
failed = 0


def ok(cond, msg):
    global failed
    print(("ok   " if cond else "FAIL ") + msg)
    if not cond:
        failed += 1


def phone(browser, players=None, lang="zh"):
    ctx = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, has_touch=True, is_mobile=True)
    settings = {"lang": lang, "sound": False, "music": False, "customPenalty": "", "players": PLAYERS if players is None else players}
    ctx.add_init_script("localStorage.setItem('lazysusan.settings.v1', JSON.stringify(%s)); sessionStorage.setItem('changle.entered', '1');" % json.dumps(settings))
    pg = ctx.new_page()
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    # (a fetch the rooms server refused, e.g. /api/me signed out, is not a page error)
    pg.on("console", lambda m: errs.append(m.text) if m.type == "error" and "Failed to load resource" not in m.text else None)
    pg.errs = errs
    return pg


def path(pg):
    return pg.evaluate("location.pathname + location.search + location.hash")


def dialogs(pg):
    return pg.locator("[role=dialog]:visible").count()


def settle(pg, ms=700):
    pg.wait_for_timeout(ms)


with sync_playwright() as p:
    b = p.chromium.launch()

    # 1. home, a card by tapping, back closes it
    pg = phone(b)
    pg.goto(BASE + "/", wait_until="networkidle")
    settle(pg)
    ok(path(pg) == "/", "home is /")
    ok(pg.title() == "开席 Lazy Susan", f"home's title ({pg.title()})")
    pg.locator(".board .ui-tile").first.click()
    settle(pg)
    first = path(pg)
    ok(first.startswith("/g/") and dialogs(pg) == 1, f"tapping a game opens its card at its address ({first})")
    ok("·" in pg.title(), f"the card's title names the game ({pg.title()})")
    name = pg.locator("[role=dialog]").first.get_attribute("aria-label") or ""
    ok(len(name) > 1, f"the card's dialog has a name ({name})")
    pg.go_back()
    settle(pg)
    ok(path(pg) == "/" and dialogs(pg) == 0, "back closes the card and stays home")
    pg.go_forward()
    settle(pg)
    ok(path(pg) == first and dialogs(pg) == 1, "forward opens it again")

    # 2. from the card into the game; ‹ goes home, as before
    pg.goto(BASE + "/g/truth-or-dare", wait_until="networkidle")
    settle(pg)
    ok(dialogs(pg) == 1, "a game's link opens its card")
    pg.reload(wait_until="networkidle")
    settle(pg)
    ok(path(pg) == "/g/truth-or-dare" and dialogs(pg) == 1, "the card is still open after a reload")
    pg.locator(".mode-btn.mode-primary").click()
    settle(pg, 1200)
    ok(path(pg) == "/g/truth-or-dare/play", f"one phone: the game at /g/truth-or-dare/play ({path(pg)})")
    ok(pg.locator(".game-screen").count() == 1, "the game is on screen")
    # rules sheet: back closes it and the game stays (on a phone the rules sit behind ⋯ in the top bar)
    if pg.locator(".ui-game-menu-trigger").count():
        pg.locator(".ui-game-menu-trigger").click()
    pg.locator(".ui-game-header").get_by_role("button", name="玩法", exact=True).click()
    settle(pg)
    ok(dialogs(pg) == 1, "the rules sheet opens")
    pg.go_back()
    settle(pg)
    ok(dialogs(pg) == 0 and path(pg) == "/g/truth-or-dare/play" and pg.locator(".game-screen").count() == 1, "back closes the rules; the game is still there")
    pg.locator(".ui-game-header").get_by_role("button", name="返回", exact=True).click()
    settle(pg, 1000)
    ok(path(pg) == "/" and dialogs(pg) == 0, f"‹ in the game goes home ({path(pg)})")
    ok(not pg.errs, "no errors so far" + (": " + "; ".join(pg.errs[:3]) if pg.errs else ""))
    pg.context.close()

    # 3. people sheet over the card, online sheet in place of it
    pg = phone(b, players=[])
    pg.goto(BASE + "/", wait_until="networkidle")
    settle(pg)
    pg.locator(".board .ui-tile").first.click()
    settle(pg)
    card = path(pg)
    pg.locator(".mode-btn.mode-primary").click()  # with nobody here yet: add people
    settle(pg)
    ok(dialogs(pg) == 2, "add people opens the players sheet over the card")
    pg.go_back()
    settle(pg)
    ok(dialogs(pg) == 1 and path(pg) == card, "back closes the players sheet; the card is still open")
    pg.locator(".mode-btn").nth(1).click()  # everyone on their own phone
    settle(pg)
    ok(dialogs(pg) == 1 and pg.locator("#online-name").count() == 1, "the online sheet takes the card's place")
    pg.go_back()
    settle(pg)
    ok(dialogs(pg) == 1 and pg.locator("#online-name").count() == 0 and path(pg) == card, "back closes it and the card comes back")
    pg.go_back()
    settle(pg)
    ok(dialogs(pg) == 0 and path(pg) == "/", "back once more: home")

    # 4. a game link with nobody here: the card, at the card's address
    pg.goto(BASE + "/g/truth-or-dare/play", wait_until="networkidle")
    settle(pg)
    ok(path(pg) == "/g/truth-or-dare" and dialogs(pg) == 1, f"too few players: the card instead of the game ({path(pg)})")
    pg.context.close()

    # 5. links from before
    pg = phone(b)
    for old, new in [("/#/g/truth", "/g/truth-or-dare/play"), ("/#/tools", "/tools"), ("/#/r/abcd", "/t/ABCD"), ("/g/truth", "/g/truth-or-dare"), ("/nowhere", "/")]:
        pg.goto(BASE + old, wait_until="networkidle")
        settle(pg, 900)
        ok(path(pg) == new, f"{old} lands on {new} ({path(pg)})")
    # 到此一游's own links: through the one-phone page, which hands over to its Worker at /trip
    pg.goto(BASE + "/#/g/trip", wait_until="commit")
    pg.wait_for_url(lambda u: "/trip/" in u or "/g/been-there/play" in u, timeout=10000)
    ok(True, f"/#/g/trip goes on to 到此一游 ({path(pg)})")
    pg.goto(BASE + "/tv", wait_until="networkidle")
    settle(pg, 900)
    ok(path(pg).startswith("/tv"), f"/tv is the big screen ({path(pg)})")
    pg.goto(BASE + "/#/tv/wxyz", wait_until="networkidle")
    settle(pg, 900)
    ok(path(pg).startswith("/tv"), f"/#/tv/WXYZ lands on the big screen ({path(pg)})")

    # 6. settings and sign-in: their own links, and back closes them
    pg.goto(BASE + "/settings", wait_until="networkidle")
    settle(pg)
    ok(path(pg) == "/" and dialogs(pg) == 1, "/settings opens settings over home")
    pg.go_back()
    settle(pg)
    ok(dialogs(pg) == 0 and path(pg) == "/", "back closes settings and stays on the site")
    pg.goto(BASE + "/login", wait_until="networkidle")
    settle(pg)
    ok(path(pg) == "/" and dialogs(pg) == 1 and pg.locator("input[type=email]").count() == 1, "/login opens sign-in over home")
    pg.locator("[role=dialog] .sheet-close").click()
    settle(pg)
    ok(dialogs(pg) == 0, "✕ closes sign-in")
    pg.go_back()
    settle(pg)
    ok(path(pg) != "/login", "and its history entry went with it")

    # 7. an ordinary link stays in the page (no reload)
    pg.goto(BASE + "/", wait_until="networkidle")
    settle(pg)
    pg.evaluate("window.__stay = 1; const a = document.createElement('a'); a.href = '/tools'; a.id = 'probe'; a.textContent = 'x'; document.body.append(a)")
    pg.evaluate("document.getElementById('probe').click()")  # (the app covers the end of the body)
    settle(pg)
    ok(path(pg) == "/tools" and pg.evaluate("window.__stay") == 1, "an <a href=/tools> moves inside the page")
    ok(pg.locator("[role=tab][aria-selected=true]").inner_text().startswith("工具"), "and the tools tab is showing")
    ok(not pg.errs, "no errors" + (": " + "; ".join(pg.errs[:3]) if pg.errs else ""))
    pg.context.close()

    # 8. a table: one sheet giving way to another, and leaving for good
    pg = phone(b)
    pg.goto(BASE + "/", wait_until="networkidle")
    settle(pg)
    pg.locator(".online-btn").click()
    settle(pg)
    pg.fill("#online-name", "Steve")
    pg.get_by_role("button", name="开一桌", exact=True).click()
    pg.wait_for_url(lambda u: "/t/" in u, timeout=8000)
    settle(pg, 1500)
    table = path(pg)
    ok(table.startswith("/t/"), f"open a table: its address ({table})")
    pg.locator(".table-btn").click()
    settle(pg)
    pg.locator("[role=dialog] .btn-gold", has_text="叫人").click()
    settle(pg, 900)
    ok(dialogs(pg) == 1 and pg.locator("[role=dialog] .sheet-title", has_text="叫人").count() == 1, "this table → invite: the invite sheet stays open")
    pg.go_back()
    settle(pg)
    ok(dialogs(pg) == 0 and path(pg) == table, "back closes it, still at the table")
    pg.get_by_role("button", name="离开这桌").first.click()
    settle(pg)
    pg.locator("[role=dialog] .btn-primary", has_text="离开这桌").click()
    pg.wait_for_url(lambda u: "/t/" not in u, timeout=8000)
    settle(pg, 900)
    ok(path(pg) == "/", f"leaving the table goes home ({path(pg)})")
    pg.go_back()
    settle(pg, 900)
    ok(not path(pg).startswith("/t/"), f"and back doesn't return to the table ({path(pg)})")
    pg.context.close()

    # 9. Esc closes only the top sheet; a closing card can't be closed twice
    pg = phone(b, players=[])
    pg.goto(BASE + "/g/truth-or-dare", wait_until="networkidle")
    settle(pg)
    pg.locator(".mode-btn.mode-primary").click()
    settle(pg)
    pg.keyboard.press("Escape")
    settle(pg)
    ok(dialogs(pg) == 1 and path(pg) == "/g/truth-or-dare", "Esc over a shared card closes the players sheet only")
    pg.goto(BASE + "/", wait_until="networkidle")
    settle(pg)
    pg.locator(".board .ui-tile").first.click()
    settle(pg)
    pg.locator("[role=dialog] .sheet-close").dblclick()
    settle(pg, 900)
    ok(path(pg) == "/" and pg.url.startswith(BASE), f"a double tap on the card's ✕ goes back one page, not two ({pg.url})")

    # 10. a reload with a sheet open, then the same sheet again: back still closes it
    pg.locator("button[aria-label='设置']").click()
    settle(pg)
    pg.reload(wait_until="networkidle")
    settle(pg)
    pg.locator("button[aria-label='设置']").click()
    settle(pg)
    pg.go_back()
    settle(pg)
    ok(dialogs(pg) == 0 and path(pg) == "/", "after a reload, back still closes settings")

    # 11. a link inside a sheet: in-page, the sheet closes, and the page is the link's
    pg.locator("button[aria-label='设置']").click()
    settle(pg)
    pg.evaluate("window.__stay = 2; const a = document.createElement('a'); a.href = '/wish'; a.id = 'probe2'; a.textContent = 'x'; document.querySelector('[role=dialog] .sheet-body').append(a)")
    pg.evaluate("document.getElementById('probe2').click()")
    settle(pg, 900)
    ok(path(pg) == "/wish" and pg.evaluate("window.__stay") == 2 and dialogs(pg) == 0, f"a link in a sheet moves in-page and closes the sheet ({path(pg)})")
    pg.go_back()
    settle(pg)
    ok(path(pg) == "/" and dialogs(pg) == 0, "back from there: home, the sheet stays closed")
    ok(not pg.errs, "no errors" + (": " + "; ".join(pg.errs[:3]) if pg.errs else ""))
    pg.context.close()
    b.close()

print(f"\n{failed} failure(s)" if failed else "\nall passed")
sys.exit(1 if failed else 0)
