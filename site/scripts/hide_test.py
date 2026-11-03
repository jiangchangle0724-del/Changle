"""藏在人群里 · Hide in the Crowd from a changle.ca table: the hand-off, a round, and the way back.

Needs the site, the table server and the game running locally (see games/hide-crowd/README.md):
  the game:   cd games/hide-crowd && npm run build && npx wrangler dev --port 8797 --var STANDALONE:1
  the tables: cd site && npx wrangler dev -c worker/wrangler.jsonc --port 8787 --ip 127.0.0.1
  the site:   cd site && VITE_ROOMS_URL=ws://127.0.0.1:8787 npm run dev -- --port 5173

usage: python3 scripts/hide_test.py [base_url]
Screenshots go to $SHOTS (default: scratchpad/hide).
"""
import os, re, sys, time

os.environ.setdefault("SHOTS", os.path.join(os.environ.get("TMPDIR", "/tmp"), "hide-shots"))
sys.path.insert(0, os.path.dirname(__file__))
from party_test import BASE, OUT, errors, fails, ok, phone, room, seat_table, start_game, until  # noqa: E402
from playwright.sync_api import sync_playwright  # noqa: E402

GAME = re.compile(r"/hide/r/(\d{4})\?table=")


def hide_view(pg):
    return pg.evaluate("() => window.__hide || null")


def t_hide_online(browser):
    host, guests, code = seat_table(browser, ["Steve", "Mia", "Kev"])
    mia, kev = guests
    tv = browser.new_context(viewport={"width": 1920, "height": 1080}).new_page()
    tv._errs, tv._name = [], "tv"
    tv.on("pageerror", lambda e: tv._errs.append(str(e)))
    tv.goto(BASE + f"tv/{code}", wait_until="networkidle")
    until(lambda: room(tv))
    # Kev only watches this one: he gets the game's big screen, not a seat in it
    kev.locator(".table-btn").first.click()
    kev.get_by_role("button", name="只看").click()
    ok(until(lambda: next((s for s in room(host)["seats"] if s["name"] == "Kev"), {}).get("watch")), "Kev just watches")
    kev.keyboard.press("Escape")
    kev.wait_for_timeout(400)
    everyone = [host, mia, kev]
    start_game(host, everyone, "hide")
    # the host's phone opens the game's room by itself, and the playing phones go in
    for g in (host, mia):
        g.wait_for_url(GAME, timeout=10000)
    num = GAME.search(host.url).group(1)
    ok(num in mia.url, f"both phones went to room {num}")
    tv.wait_for_url(re.compile(r"/hide/tv/" + num + r"\?table=" + code), timeout=10000)
    ok(True, "the big screen followed to the game's big screen")
    ok(until(lambda: kev.get_by_role("button", name="打开它的大屏").count() == 1), "a seat that watches gets the game's big screen")
    ok("/t/" in kev.url, "and stays at the table")
    kev.screenshot(path=os.path.join(OUT, "hide-table-watching.png"))
    for g in (host, mia):
        g.wait_for_selector(".lobby", timeout=10000)
    ok(host.locator(".lobby-code .code").inner_text() == code and mia.locator(".lobby-code .code").inner_text() == code, "the game's lobby shows the table's code")
    ok(host.get_by_role("button", name="开始").count() == 1, "the table's host is the game's host")
    ok(mia.get_by_role("button", name="开始").count() == 0, "the guest isn't")
    ok(until(lambda: "Mia" in host.inner_text(".chips")), "names came along")
    tv.wait_for_selector(".tv-lobby", timeout=10000)
    ok(tv.locator(".tv-code").inner_text() == code, "the big screen says to join the table")
    host.screenshot(path=os.path.join(OUT, "hide-game-lobby.png"))
    tv.screenshot(path=os.path.join(OUT, "hide-tv-lobby.png"))
    # a round
    host.get_by_role("button", name="开始").click()
    ok(until(lambda: (hide_view(mia) or {}).get("phase") == "playing", 10000), "the round is on")
    tv.wait_for_selector(".tv-hud", timeout=10000)
    tv_view = hide_view(tv)
    ok(tv_view and not any(a.get("me") for a in tv_view["game"]["avatars"]) and tv_view["game"]["me"] is None, "the big screen marks nobody")
    ok(sum(1 for a in hide_view(mia)["game"]["avatars"] if a.get("me")) == 1, "a phone sees its own body")
    time.sleep(1.5)
    tv.screenshot(path=os.path.join(OUT, "hide-tv-round.png"))
    # a guest goes back to the table: the game is still on there
    mia.goto(BASE + f"t/{code}", wait_until="networkidle")
    ok(until(lambda: mia.get_by_role("button", name="回到这局").count() == 1), "back at the table, the game is still on")
    # the host takes everyone back
    host.get_by_role("button", name="回到这桌").first.click()
    host.get_by_role("button", name="一起回去").click()
    host.wait_for_url(re.compile(r"/t/" + code), timeout=10000)
    ok(until(lambda: room(host) and room(host)["game"] is None, 10000), "the host's phone ended it: back in the table's lobby")
    ok(until(lambda: room(mia) and room(mia)["game"] is None, 10000), "and so is everyone else")
    tv.wait_for_url(re.compile(r"/tv/" + code + r"$"), timeout=10000)
    ok(True, "the big screen came back to the table's big screen")
    errors([host, mia, kev])
    for g in everyone + [tv]:
        g.context.close()


def t_hide_single(browser):
    pg = phone(browser, "solo", players=[{"id": "p0", "name": "Steve"}])
    pg.goto(BASE + "g/hide-in-the-crowd/play", wait_until="networkidle")
    pg.wait_for_url(re.compile(r"/hide/practice"), timeout=10000)
    ok(until(lambda: pg.locator(".play").count() == 1, 10000), "one phone: the practice crowd")
    errors([pg])
    pg.context.close()


if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=os.environ.get("CHROMIUM") or None)
        for fn in (t_hide_single, t_hide_online):
            print(f"--- {fn.__name__}", flush=True)
            try:
                fn(browser)
            except Exception as e:
                ok(False, f"{fn.__name__} crashed: {e}")
        browser.close()
    print("\nhide test:", "ALL PASS" if not fails else f"{len(fails)} FAILED: {fails}")
    sys.exit(1 if fails else 0)
