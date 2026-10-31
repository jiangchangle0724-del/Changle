"""The live site after a deploy: Name That Tune's new pools and quiz on one phone (upright and
sideways), then an online table with three phones and a phone that only watches.

usage: python3 scripts/live_tune_check.py [out_dir]
"""
import json, os, re, sys

OUT = sys.argv[1] if len(sys.argv) > 1 else "live-shots"
sys.argv = [sys.argv[0], "https://changle.ca/"]  # party_test reads its base URL from argv
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import party_test as T  # noqa: E402
from playwright.sync_api import sync_playwright  # noqa: E402

os.makedirs(OUT, exist_ok=True)
T.OUT = OUT
BASE = "https://changle.ca/"
PROXY = {"server": os.environ["HTTPS_PROXY"]} if os.environ.get("HTTPS_PROXY") else None
PLAYERS = [{"id": f"p{i}", "name": n} for i, n in enumerate(["Steve", "小雨", "Kevin"])]
ok = T.ok


def solo(browser, w, h, tag):
    pg = T.phone(browser, "solo-" + tag, players=PLAYERS, w=w, h=h)
    pg.goto(BASE + "#/g/tune", wait_until="networkidle")
    pg.wait_for_selector(".vinyl")
    btn = lambda name: pg.get_by_role("button", name=name, exact=True)
    cats = lambda: pg.locator(".tn-pool-cats .chip").all_inner_texts()
    picked = lambda: pg.locator(".tn-pool-cats .chip[aria-pressed=true]").all_inner_texts()
    for name in ["韩语", "华语", "英文"]:  # add Korean, then drop the two picked to start with
        btn(name).click()
        pg.wait_for_timeout(150)
    ok("摇滚" not in cats(), f"[{tag}] Korean alone: no rock to pick {cats()}")
    btn("粤语").click()
    pg.wait_for_timeout(200)
    ok("摇滚" in cats(), f"[{tag}] Korean and Cantonese together: Cantonese brings rock")
    pg.locator(".tn-pool-cats .chip", has_text="摇滚").click()
    pg.locator(".tn-pool-cats .chip", has_text="老歌").click()
    pg.wait_for_timeout(200)
    ok(sorted(picked()) == ["摇滚", "老歌"], f"[{tag}] two categories at once {picked()}")
    btn("粤语").click()
    pg.wait_for_timeout(300)
    ok(picked() == ["老歌"], f"[{tag}] Cantonese dropped: rock goes with it, oldies stay {picked()}")
    pg.get_by_role("button", name="选择题").click()
    pg.get_by_role("button", name="5 首").click()
    T.shot(pg, "setup")
    pg.get_by_role("button", name="开始").click()
    up = T.until(lambda: pg.locator(".tn-stage").count() > 0 and pg.locator(".tn-option").count() >= 4, 15000)
    ok(up, f"[{tag}] a Korean song is up with four titles to choose from")
    pg.wait_for_timeout(1500)
    T.shot(pg, "quiz")
    wide = pg.evaluate("() => document.documentElement.scrollWidth - innerWidth")
    ok(wide <= 0, f"[{tag}] nothing runs off the side ({wide})")
    T.errors([pg])
    pg.context.close()


def seat_table(browser, names):
    """The production build has no test hook, so everything here is read off the screen."""
    host = T.phone(browser, names[0])
    host.goto(BASE, wait_until="networkidle")
    host.wait_for_timeout(400)
    host.locator(".online-btn").click()
    host.wait_for_timeout(400)
    host.locator("#online-name").fill(names[0])
    host.get_by_role("button", name="开一桌", exact=True).click()
    host.wait_for_url(re.compile(r"#/r/[A-Z0-9]{4}"), timeout=8000)
    code = re.search(r"#/r/([A-Z0-9]{4})", host.url).group(1)
    guests = []
    for n in names[1:]:
        g = T.phone(browser, n)
        g.goto(BASE + f"#/r/{code}", wait_until="networkidle")
        g.wait_for_timeout(400)
        g.locator(".join-card input").fill(n)
        g.locator(".join-card button[type=submit]").click()
        guests.append(g)
    ok(T.until(lambda: all(g.locator(".lobby").count() > 0 for g in guests), 10000), f"{len(names)} seated at {code}")
    return host, guests, code


def online(browser):
    host, guests, code = seat_table(browser, ["Steve", "小雨", "Kevin"])
    ctx = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
    watcher = ctx.new_page()
    watcher._errs = []
    watcher._name = "watcher"
    watcher.on("pageerror", lambda e: watcher._errs.append(str(e)))
    watcher.goto(BASE + f"#/r/{code}", wait_until="networkidle")
    watcher.wait_for_timeout(600)
    btn = watcher.get_by_role("button", name=re.compile("只看不玩"))
    ok(btn.count() == 1, "the join card offers to just watch")
    btn.click()
    ok(T.until(lambda: "/tv/" in watcher.url, 6000), "the watcher goes to the big-screen view")
    watcher.wait_for_timeout(1500)
    everyone = [host] + guests
    host.locator(f'.lobby .tile[data-tile="{T.GAME_INDEX["tune"]}"]').click()
    host.wait_for_timeout(800)
    host.locator(".lobby-actions .btn-primary").click()
    ok(all(T.until(lambda g=g: g.locator(".vinyl").count() > 0, 10000) for g in everyone), "[tune] every phone is in the game")
    host.wait_for_timeout(600)
    host.get_by_role("button", name="韩语", exact=True).click()
    ok(T.until(lambda: guests[0].locator(".chip[aria-pressed=true]", has_text="韩语").count() == 1, 6000), "the host picks Korean songs; the table sees it")
    quiz = host.get_by_role("button", name="选择题")
    if quiz.count():
        quiz.click()
    T.shot(host, "net-setup")
    host.get_by_role("button", name="放第一首").click()
    ok(T.until(lambda: guests[0].locator(".tn-option").count() >= 4, 15000), "a guest gets four titles to choose from")
    host.wait_for_timeout(2000)
    T.shot(guests[0], "net-quiz")
    watcher.screenshot(path=os.path.join(OUT, "net-watcher.png"))
    shown = watcher.evaluate("() => { const c = document.querySelector('.tv-canvas'); if (!c) return null; const r = c.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.right), innerWidth]; }")
    ok(shown is not None and shown[0] >= -1 and shown[1] <= shown[2] + 1, f"the watching phone sees the whole stage ({shown})")
    T.errors(everyone)
    for g in everyone:
        g.context.close()
    ctx.close()


ONLY = os.environ.get("ONLY", "solo,online").split(",")
with sync_playwright() as p:
    browser = p.chromium.launch(proxy=PROXY)
    if "solo" in ONLY:
        solo(browser, 390, 844, "upright")
        solo(browser, 844, 390, "sideways")
    if "online" in ONLY:
        online(browser)
    browser.close()

print("\nlive tune check:", "ALL PASS" if not T.fails else f"{len(T.fails)} FAILED: {T.fails}")
sys.exit(1 if T.fails else 0)
