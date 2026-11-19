"""Mirroring a phone to the TV, from the lobby: a guest makes their own phone the TV, the host makes
another guest's phone the TV from its face, either comes back to playing, and in a game the phone
that is the TV shows the big screen's view. Three phones on the local servers.

usage: python3 scripts/cast_check.py [base_url]
Needs the rooms server and the site running (HANDOFF.md, "Run the site locally"). Screenshots go to
$SHOTS (default: cast in the system's temp folder).
"""
import os, sys, tempfile, time
from playwright.sync_api import sync_playwright
import party_test as T

OUT = os.environ.get("SHOTS", os.path.join(tempfile.gettempdir(), "cast"))
os.makedirs(OUT, exist_ok=True)
ok, until, room, me, view = T.ok, T.until, T.room, T.me, T.view


def shot(pg, tag):
    pg.screenshot(path=os.path.join(OUT, f"{tag}-{pg._name}.png"))


def watching(pg, name):
    return bool(next((s for s in room(pg)["seats"] if s["name"] == name), {}).get("watch"))


with sync_playwright() as p:
    browser = p.chromium.launch()
    host, guests, code = T.seat_table(browser, ["Amy", "Ben", "Cat"])
    ben, cat = guests
    everyone = [host, ben, cat]
    CAST = "这台手机投屏电视"
    ok(host.get_by_role("button", name=CAST).count() == 0, "the host's own phone has no mirror button (the games wait on the host's buttons)")
    ok(ben.get_by_role("button", name=CAST).count() == 1 and cat.get_by_role("button", name=CAST).count() == 1, "every guest's lobby has one")
    shot(ben, "lobby-button")
    # Ben makes his phone the TV
    ben.get_by_role("button", name=CAST).click()
    ok(until(lambda: watching(host, "Ben")), "Ben's seat only watches now")
    ok(until(lambda: ben.locator(".lobby-cast.is-on").count() == 1), "his lobby says this phone is the TV")
    ok(ben.get_by_role("button", name="回来玩").count() == 1, "...with the way back to playing")
    ok(until(lambda: host.locator(".face", has_text="Ben").locator(".face-watch").inner_text() == "投屏"), "on the others' phones his face says 投屏")
    shot(ben, "casting")
    shot(host, "lobby-host")
    # the host makes Cat's phone the TV, from her face
    host.locator(".face", has_text="Cat").locator(".face-dot").click()
    sheet_btn = host.get_by_role("button", name="用这台手机投屏电视")
    ok(until(lambda: sheet_btn.count() == 1, 4000), "the host's tap on a face offers to use that phone as the TV")
    shot(host, "person-sheet")
    sheet_btn.click()
    ok(until(lambda: watching(host, "Cat")), "Cat's seat only watches now")
    ok(until(lambda: cat.locator(".lobby-cast.is-on").count() == 1), "her lobby says so")
    # the same face now offers the way back
    host.locator(".face", has_text="Cat").locator(".face-dot").click()
    back_btn = host.get_by_role("button", name="让 TA 回来玩")
    ok(until(lambda: back_btn.count() == 1, 4000), "...and the face now offers to bring her back")
    host.keyboard.press("Escape")
    host.wait_for_timeout(400)
    # a guest's own phone has no such button on a face (only the host's does)
    ben.locator(".face", has_text="Cat").locator(".face-dot").click()
    ben.wait_for_timeout(600)
    ok(ben.get_by_role("button", name="让 TA 回来玩").count() == 0 and ben.get_by_role("button", name="用这台手机投屏电视").count() == 0, "a guest's tap on a face has no table buttons")
    ben.keyboard.press("Escape")
    ben.wait_for_timeout(400)
    # Ben comes back to playing
    ben.get_by_role("button", name="回来玩").click()
    ok(until(lambda: not watching(host, "Ben")), "Ben plays again")
    ok(until(lambda: ben.get_by_role("button", name=CAST).count() == 1), "...and has the mirror button back")
    # a game: Cat's phone, the TV, shows the big screen's view; Amy and Ben play
    T.start_game(host, everyone, "prompts")
    ok(until(lambda: cat.locator(".watch .watch-canvas").count() == 1, 8000), "in the game, the phone that is the TV shows the big screen's view")
    ok(ben.locator(".watch").count() == 0 and host.locator(".watch").count() == 0, "the players' phones show the game")
    shot(cat, "tv-in-game")
    T.errors(everyone)
    browser.close()

print(f"screenshots: {OUT}")
print("FAILED:\n  " + "\n  ".join(T.fails) if T.fails else "cast check passed")
sys.exit(1 if T.fails else 0)
