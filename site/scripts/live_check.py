"""Live check: four phones at one online table on the deployed site (no dev hooks).

usage: python3 scripts/live_check.py [base_url]
"""
import os, re, sys, time
from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "https://changle.ca/"
OUT = os.environ.get("SHOTS", "/tmp/claude-0/-home-claude/9e141460-a70a-5df4-ae5a-70d27259d966/scratchpad/live")
os.makedirs(OUT, exist_ok=True)

fails = []
def ok(cond, msg):
    print(("ok   " if cond else "FAIL ") + msg, flush=True)
    if not cond:
        fails.append(msg)

def until(fn, timeout=10000, step=150):
    end = time.time() + timeout / 1000
    while time.time() < end:
        try:
            v = fn()
            if v:
                return v
        except Exception:
            pass
        time.sleep(step / 1000)
    return None

def phone(browser, name):
    ctx = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, has_touch=True, is_mobile=True)
    pg = ctx.new_page()
    pg.add_init_script(
        "sessionStorage.setItem('lazysusan.entered','1');"
        "if(!localStorage.getItem('lazysusan.settings.v1')) localStorage.setItem('lazysusan.settings.v1', JSON.stringify({lang:'zh',sound:false,music:false,customPenalty:'',players:[]}));"
    )
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.on("console", lambda m: errs.append("console: " + m.text) if m.type == "error" else None)
    pg._errs, pg._name = errs, name
    return pg

def seated(pg):
    t = pg.locator(".table-btn .tabular")
    return t.inner_text() if t.count() else ""

with sync_playwright() as p:
    browser = p.chromium.launch()
    names = ["测A", "测B", "测C", "测D"]
    host = phone(browser, names[0])
    host.goto(BASE, wait_until="networkidle")
    host.wait_for_timeout(600)
    host.locator(".online-btn").click()
    host.wait_for_timeout(400)
    host.get_by_label("你的名字").fill(names[0])
    host.get_by_role("button", name="开一桌", exact=True).click()
    host.wait_for_url(re.compile(r"/t/[A-Z0-9]{4}"), timeout=8000)
    code = re.search(r"/t/([A-Z0-9]{4})", host.url).group(1)
    ok(until(lambda: seated(host) == "1"), f"host opened table {code} on the live server")
    host.screenshot(path=f"{OUT}/1-host-lobby.png")

    guests = []
    for n in names[1:]:
        g = phone(browser, n)
        g.goto(BASE + f"#/r/{code}", wait_until="networkidle")
        meta = until(lambda: "主人" in g.locator(".join-meta").inner_text() and g.locator(".join-meta").inner_text())
        ok(bool(meta), f"{n} sees the place card: {meta}")
        g.get_by_placeholder("你的名字").fill(n)
        g.get_by_role("button", name="入座").click()
        guests.append(g)
    everyone = [host] + guests
    ok(all(until(lambda g=g: seated(g) == "4") for g in everyone), "every phone counts 4 at the table")
    guests[0].screenshot(path=f"{OUT}/2-guest-lobby.png")

    # pick Seven Eight Nine on the board (tile 8), then start it
    host.locator('.lobby .tile[data-tile="8"]').click()
    host.wait_for_timeout(900)
    host.locator(".lobby-actions .btn-primary").click()
    in_game = all(until(lambda g=g: "七八九" in g.locator(".topbar-title").inner_text()) for g in everyone)
    ok(in_game, "every phone moved into 七八九 together")

    for r in range(2):
        roller = until(lambda: next((g for g in everyone if g.get_by_role("button", name="掷骰子").count()), None))
        ok(roller is not None, f"roll {r}: exactly one phone holds the dice ({roller._name if roller else '-'})")
        if not roller:
            break
        roller.get_by_role("button", name="掷骰子").last.click()
        time.sleep(2.2)
        sums = [g.locator(".dice-sum").inner_text() if g.locator(".dice-sum").count() else "-" for g in everyone]
        ok(len(set(sums)) == 1 and sums[0] != "-", f"roll {r}: every phone shows the same total {sums}")
        if r == 0:
            guests[1].screenshot(path=f"{OUT}/3-dice-watch.png")
        # clear any penalty stamps, then pass the dice on
        for _ in range(10):
            busy = False
            for g in everyone:
                if g.locator(".stamp-layer").count():
                    busy = True
                    for label in ("我喝了", "继续"):
                        b = g.locator(".stamp-layer button", has_text=label)
                        if b.count():
                            try:
                                b.first.click(timeout=1500)
                            except Exception:
                                pass
                            break
            if not busy:
                break
            time.sleep(0.6)
        assign = roller.locator(".picker .chip")
        if assign.count():
            assign.nth(1).click()
            time.sleep(1)
        nxt = roller.get_by_role("button", name="下一个")
        if nxt.count():
            nxt.first.click()
        time.sleep(0.8)

    # a reaction from one phone floats up on the others
    guests[2].locator(".react-btn").first.click()
    ok(until(lambda: host.locator(".react-float").count() > 0, 4000), "a reaction from 测D floats up on the host's phone")
    host.screenshot(path=f"{OUT}/4-reaction.png")

    # everyone leaves; the last one out closes the table
    for g in reversed(everyone):
        g.locator(".topbar .icon-btn").first.click()
        g.wait_for_timeout(400)
        g.get_by_role("button", name="离开这桌").last.click()
        g.wait_for_timeout(600)
    ok(all("/t/" not in g.url for g in everyone), "every phone left the table")

    errs = [(g._name, e) for g in everyone for e in g._errs if "favicon" not in e]
    ok(not errs, f"no page errors {errs[:4]}")
    browser.close()

print("\nlive check:", "ALL PASS" if not fails else f"{len(fails)} FAILED: {fails}")
sys.exit(1 if fails else 0)
