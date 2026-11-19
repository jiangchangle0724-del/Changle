"""抓紧了 at a table (party/stage), against the local servers.

With a TV: the host's phone opens a room at /hang-on, every phone goes in as a controller by itself
(no form, with its name), the TV opens the big screen and takes over the table's room (no new one); a
phone that only watches can't start a second big screen and is sent back; a phone that comes back to
the table finds the game still on and goes back in; the big screen ends it ("回到桌上" twice) and
everyone is back in the table's lobby by themselves. Phones only: the host's phone is the big screen
and plays; it ends the game the same way.

usage: python3 scripts/hangon_table_check.py [base_url]
Needs the rooms server and the site (HANDOFF.md, "Run the site locally") and the hang-on server:
`npm run build && npx wrangler dev --port 8792 --ip 127.0.0.1` in games/hang-on (the site's
/hang-on is proxied there, vite.config.ts). Screenshots go to $SHOTS (default: stage in the
system's temp folder).
"""
import json, os, re, sys, tempfile, urllib.request
from playwright.sync_api import sync_playwright
import party_test as T

OUT = os.environ.get("SHOTS", os.path.join(tempfile.gettempdir(), "stage"))
os.makedirs(OUT, exist_ok=True)
ok, until, room = T.ok, T.until, T.room
PAD = re.compile(r"/hang-on/pad/\?code=([A-HJ-NP-Z2-9]{4})&auto=1&table=([A-Z0-9]+)")
HOST = re.compile(r"/hang-on/\?phone=([01])&room=([A-HJ-NP-Z2-9]{4})&table=([A-Z0-9]+)")
NO_PROXY = urllib.request.build_opener(urllib.request.ProxyHandler({}))


def shot(pg, tag):
    pg.screenshot(path=os.path.join(OUT, f"hangon-{tag}-{pg._name}.png"))


def status(code):
    with NO_PROXY.open(T.BASE + f"hang-on/api/rooms/{code}") as r:
        return json.loads(r.read())


def hang_code(pg):
    return pg.evaluate("() => window.hangOn && window.hangOn.link && window.hangOn.link.code")


def hang_names(pg):
    return set(pg.evaluate("() => ((window.hangOn && window.hangOn.link && window.hangOn.link.room) || { seats: [] }).seats.map((s) => s.name)"))


def pad_in(pg):
    return pg.evaluate("() => !!(window.hangOnPad && window.hangOnPad.link && window.hangOnPad.link.room)")


def back_at(pg, path, timeout=10000):
    try:
        pg.wait_for_url(re.compile(re.escape(path) + r"$"), timeout=timeout)
        return True
    except Exception:
        print(f"     ({pg._name} is at {pg.url})")
        return False


def says(pg, sel, *words):
    """The element shows one of these (the page may be in either language: it follows the site's setting)."""
    text = pg.locator(sel).inner_text()
    return any(w in text for w in words) or print(f"     ({pg._name} {sel}: {text!r})")


def tap(pg, sel):
    """A plain click from the page itself: the game's canvas keeps a headless browser busy, and
    Playwright's own click waits so long for it that 回到桌上's 3-second second tap runs out."""
    pg.evaluate("(sel) => document.querySelector(sel).click()", sel)


def start_hangon(host):
    idx = T.GAME_INDEX["hangon"]
    host.locator(f'.lobby [data-tile="{idx}"]').click()
    ok(until(lambda: room(host)["front"] == idx), "抓紧了 is on the table")
    host.wait_for_timeout(300)
    host.locator(".lobby-actions .btn-primary").click()


with sync_playwright() as p:
    browser = p.chromium.launch()

    # ---------------------------------------------------------------- with a TV
    host, guests, code = T.seat_table(browser, ["Steve", "Mia", "Kev"])
    mia, kev = guests
    tv = browser.new_context(viewport={"width": 1920, "height": 1080}).new_page()
    tv._errs, tv._name = [], "tv"
    tv.on("pageerror", lambda e: tv._errs.append(str(e)))
    tv.goto(T.BASE + f"tv/{code}", wait_until="networkidle")
    until(lambda: room(tv))
    ok(until(lambda: room(host)["screens"] == 1), "the TV shows the table")
    # Kev only watches this one
    kev.locator(".table-btn").first.click()
    kev.get_by_role("button", name="只看").click()
    ok(until(lambda: next((s for s in room(host)["seats"] if s["name"] == "Kev"), {}).get("watch")), "Kev just watches")
    kev.keyboard.press("Escape")
    kev.wait_for_timeout(400)

    start_hangon(host)
    # the host's phone opened the room (a TV is there, so it's a controller), Mia follows
    host.wait_for_url(PAD, timeout=10000)
    room_code = PAD.search(host.url).group(1)
    ok(PAD.search(host.url).group(2) == code, f"the host's phone is a controller in {room_code}, the table's number along")
    mia.wait_for_url(PAD, timeout=10000)
    ok(PAD.search(mia.url).group(1) == room_code, "Mia went to the same room")
    for g in (host, mia):
        ok(until(lambda g=g: pad_in(g), 10000), f"{g._name} is in, no form")
    # the TV went to the big screen and took over the table's room
    tv.wait_for_url(HOST, timeout=10000)
    m = HOST.search(tv.url)
    ok(m.group(1) == "0" and m.group(2) == room_code and m.group(3) == code, "the TV opened the big screen for that room")
    ok(until(lambda: hang_code(tv) == room_code, 10000), "the big screen took over the table's room, no new one")
    ok(until(lambda: {"Steve", "Mia"} <= hang_names(tv), 15000), "Steve and Mia are there by name")
    ok(status(room_code) == {"exists": True, "phase": "lobby"}, "the room says lobby")
    ok(tv.locator("#tableBtn").is_visible() and tv.locator("#modeBtn").is_hidden(), "the big screen has 回到桌上, and no switch to a phones-only game")
    shot(tv, "screen")

    # Kev (watching) opens the big screen too: the TV already is it
    ok(until(lambda: kev.get_by_role("button", name="打开抓紧了的大屏").count() == 1), "a seat that watches gets the way to the big screen")
    kev.get_by_role("button", name="打开抓紧了的大屏").click()
    kev.wait_for_url(HOST, timeout=10000)
    ok(until(lambda: kev.locator("#fatal").is_visible(), 10000) and until(lambda: says(kev, "#fatalLine", "另一台设备", "another device"), 3000), "...but one big screen per game: the second is turned away")
    ok(kev.locator("#fatalTableBtn").is_visible() and kev.locator("#reopenBtn").is_hidden(), "...with the way back to the table, not a new room")
    shot(kev, "taken")
    kev.locator("#fatalTableBtn").click()
    ok(back_at(kev, f"/t/{code}"), "...and back at the table")
    ok(tv.evaluate("() => window.hangOn.link.socketOpen") and hang_code(tv) == room_code, "the TV is still the big screen")

    # Mia comes back to the table: the game is still on, and she goes back in
    mia.goto(T.BASE + f"t/{code}", wait_until="networkidle")
    ok(until(lambda: mia.get_by_role("button", name="回到这局").count() == 1), "back at the table, the game is still on")
    mia.get_by_role("button", name="回到这局").click()
    mia.wait_for_url(PAD, timeout=10000)
    ok(until(lambda: pad_in(mia), 10000), "and she goes back in, no form")

    # the big screen ends it
    tap(tv, "#tableBtn")
    ok(says(tv, "#tableBtn", "再按一下", "Tap again"), "回到桌上 asks again first")
    tap(tv, "#tableBtn")
    ok(back_at(tv, f"/tv/{code}"), "the big screen went back to the table's TV page")
    ok(until(lambda: status(room_code)["phase"] == "over", 8000), "the room is over")
    for g in (host, mia):
        ok(back_at(g, f"/t/{code}"), f"{g._name}'s phone came back to the table by itself")
    ok(until(lambda: room(host) and room(host)["game"] is None, 10000), "the table ended the game: back in the lobby")
    ok(until(lambda: room(kev) and room(kev)["game"] is None, 10000), "...the seat that watched too")
    shot(host, "lobby")
    T.errors([host, mia, kev, tv])
    for g in (host, mia, kev, tv):
        g.context.close()

    # ---------------------------------------------------------------- phones only
    ann, guests, code2 = T.seat_table(browser, ["Ann", "Bo"])
    bo = guests[0]
    start_hangon(ann)
    ann.wait_for_url(HOST, timeout=10000)
    m = HOST.search(ann.url)
    room2 = m.group(2)
    ok(m.group(1) == "1" and m.group(3) == code2, "no big screen: the host's phone is the big screen and plays")
    bo.wait_for_url(PAD, timeout=10000)
    ok(PAD.search(bo.url).group(1) == room2, "Bo is a controller in the same room")
    ok(until(lambda: hang_code(ann) == room2, 10000), "the host's phone took over the table's room")
    ok(until(lambda: "Bo" in hang_names(ann), 15000), "Bo is there by name")
    ok(ann.locator("#tableBtn").is_visible(), "the host's phone has 回到桌上")
    shot(ann, "phones")
    tap(ann, "#tableBtn")
    tap(ann, "#tableBtn")
    # (both phones draw the whole game at twice the pixels in software here, so their timers and
    # messages wait for slow frames: up to half a minute; on a real phone it's a moment)
    ok(back_at(ann, f"/t/{code2}", 45000), "the host's phone went back to the table")
    ok(back_at(bo, f"/t/{code2}", 60000), "Bo's phone too, by itself")
    ok(until(lambda: room(ann) and room(ann)["game"] is None, 10000), "the table ended the game")
    T.errors([ann, bo])
    for g in (ann, bo):
        g.context.close()
    browser.close()

print(f"screenshots: {OUT}")
print("FAILED:\n  " + "\n  ".join(T.fails) if T.fails else "hang-on table check passed")
sys.exit(1 if T.fails else 0)
