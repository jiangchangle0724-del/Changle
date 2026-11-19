"""一起跳 at a table (party/stage): the host's phone opens a room at /party by itself, every phone goes in
as a dancer (the host first, so the room there is his), the TV opens the stage, a phone that only
watches gets the way to the stage, a phone that comes back finds the game still on, and the host ends
it. Against the local servers.

usage: python3 scripts/dance_table_check.py [base_url]
Needs the rooms server and the site (HANDOFF.md, "Run the site locally") and the dance server:
`node scripts/build.mjs && npx wrangler dev --port 8793 --ip 127.0.0.1` in games/party-server (the
site's /party is proxied there, vite.config.ts). Screenshots go to $SHOTS (default: stage in the
system's temp folder).
"""
import os, re, sys, tempfile, time
from playwright.sync_api import sync_playwright
import party_test as T

OUT = os.environ.get("SHOTS", os.path.join(tempfile.gettempdir(), "stage"))
os.makedirs(OUT, exist_ok=True)
ok, until, room, me = T.ok, T.until, T.room, T.me
# (the table's number goes along as &table=, but the join page rewrites its address to the code alone)
DANCE = re.compile(r"/party/join\?code=([A-HJ-NP-Z2-9]{4})")


def shot(pg, tag):
    pg.screenshot(path=os.path.join(OUT, f"{tag}-{pg._name}.png"))


with sync_playwright() as p:
    browser = p.chromium.launch()
    host, guests, code = T.seat_table(browser, ["Steve", "Mia", "Kev"])
    mia, kev = guests
    everyone = [host, mia, kev]
    tv = browser.new_context(viewport={"width": 1920, "height": 1080}).new_page()
    tv._errs, tv._name = [], "tv"
    tv.on("pageerror", lambda e: tv._errs.append(str(e)))
    tv.goto(T.BASE + f"tv/{code}", wait_until="networkidle")
    until(lambda: room(tv))
    ok(until(lambda: room(host)["screens"] == 1), "the TV shows the table")
    # Kev only watches this one: he gets the way to the stage, not a place in the dance
    kev.locator(".table-btn").first.click()
    kev.get_by_role("button", name="只看").click()
    ok(until(lambda: next((s for s in room(host)["seats"] if s["name"] == "Kev"), {}).get("watch")), "Kev just watches")
    kev.keyboard.press("Escape")
    kev.wait_for_timeout(400)

    # the host picks 一起跳 (the last tile) and starts it
    idx = T.GAME_INDEX["dance"]
    host.locator(f'.lobby [data-tile="{idx}"]').click()
    ok(until(lambda: room(host)["front"] == idx), "一起跳 is on the table")
    host.wait_for_timeout(300)
    shot(host, "dance-front")
    host.locator(".lobby-actions .btn-primary").click()
    ok(until(lambda: (room(kev) or {}).get("game", {}) and room(kev)["game"]["id"] == "dance"), "the game is on at the table")
    # the host's phone opens the game's room and goes in first; Mia follows a moment later
    host.wait_for_url(DANCE, timeout=10000)
    t_host = time.time()
    dance = DANCE.search(host.url).group(1)
    ok(until(lambda: (room(kev) or {}).get("game", {}).get("code") == dance), f"the table learned the room's code ({dance})")
    mia.wait_for_url(DANCE, timeout=10000)
    ok(DANCE.search(mia.url).group(1) == dance, "Mia went to the same room")
    ok(time.time() - t_host >= 0.8, f"...a moment after the host ({time.time() - t_host:.1f} s)")
    # in the game's room: by themselves (no form), with their names, the table's host its host
    for g in (host, mia):
        ok(until(lambda g=g: g.locator(".room-line").count() == 1, 8000), f"{g._name} went straight in, no form")
    ok(until(lambda: "Steve" in host.locator(".room-line").inner_text() and "主人" in host.locator(".room-line").inner_text()), "the table's host is the dance's host, by name")
    ok(until(lambda: "Mia" in mia.locator(".room-line").inner_text() and "主人" not in mia.locator(".room-line").inner_text()), "Mia came along by name, not the host")
    ok(until(lambda: "Mia" in host.inner_text("main") and "Steve" in mia.inner_text("main"), 8000), "each sees the other in the room")
    shot(host, "dance-room")
    # the TV opened the stage
    tv.wait_for_url(re.compile(r"/party/screen\?table=" + code + "#" + dance), timeout=10000)
    ok(True, "the TV went to the stage, with the room's code (and the table's number along)")
    tv.wait_for_timeout(1500)
    ok(tv.get_by_text("找不到这个房间").count() == 0, "...and the stage found the room")
    shot(tv, "dance-stage")
    # a seat that watches stays at the table, with the way to the stage
    ok(until(lambda: kev.locator(".watch .watch-away").count() == 1 and kev.get_by_role("button", name="打开一起跳的舞台").count() == 1), "a seat that watches gets the way to the stage")
    ok("/t/" in kev.url, "and stays at the table")
    shot(kev, "dance-watching")
    # a dancer comes back to the table: the game is still on there, with the way back in
    mia.goto(T.BASE + f"t/{code}", wait_until="networkidle")
    ok(until(lambda: mia.get_by_role("button", name="回到这局").count() == 1), "back at the table, the game is still on")
    ok(mia.get_by_role("button", name="结束这局").count() == 0, "only the host ends it")
    shot(mia, "dance-back")
    mia.get_by_role("button", name="回到这局").click()
    mia.wait_for_url(DANCE, timeout=10000)
    ok(until(lambda: mia.locator(".room-line").count() == 1, 8000), "and goes back in, no form")
    # the host comes back and ends it: everyone is back in the table's lobby
    host.goto(T.BASE + f"t/{code}", wait_until="networkidle")
    ok(until(lambda: host.get_by_role("button", name="结束这局").count() == 1), "the host, back at the table, can end it")
    host.get_by_role("button", name="结束这局").click()
    ok(until(lambda: room(host) and room(host)["game"] is None, 8000), "the game ended at the table")
    ok(until(lambda: room(kev) and room(kev)["game"] is None, 8000), "the seat that watched is back in the lobby too")
    T.errors([host, kev])
    for g in everyone + [tv]:
        g.context.close()
    browser.close()

print(f"screenshots: {OUT}")
print("FAILED:\n  " + "\n  ".join(T.fails) if T.fails else "stage check passed")
sys.exit(1 if T.fails else 0)
