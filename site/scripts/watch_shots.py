"""The observer: a TV (1366x768) and a phone that only watches (#/tv/CODE), while three phones play.
Screenshots of the big screen and the watching phone for a few games.

usage: python3 scripts/watch_shots.py [base_url] [out_dir]
"""
import os, sys
sys.argv = [a for a in sys.argv]
from playwright.sync_api import sync_playwright
import party_test as T

BASE = T.BASE
OUT = next((a for a in sys.argv[1:] if not a.startswith("http")), "watch-shots")
os.makedirs(OUT, exist_ok=True)

def screen(browser, name, w, h, code, mobile):
    ctx = browser.new_context(viewport={"width": w, "height": h}, device_scale_factor=1 if not mobile else 2, has_touch=mobile, is_mobile=mobile)
    pg = ctx.new_page()
    pg.add_init_script("localStorage.setItem('lazysusan.settings.v1', %s);" % T.json.dumps(T.json.dumps({"lang": "zh", "sound": False, "music": False, "customPenalty": "", "players": []})))
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.on("console", lambda m: errs.append("console: " + m.text) if m.type == "error" else None)
    pg._errs = errs; pg._name = name
    pg.goto(BASE + f"#/tv/{code}", wait_until="networkidle")
    pg.wait_for_timeout(1200)
    return pg

def snap(pg, tag):
    pg.screenshot(path=os.path.join(OUT, f"{tag}-{pg._name}.png"))

with sync_playwright() as p:
    browser = p.chromium.launch()
    host, guests, code = T.seat_table(browser, ["Steve", "小雨", "Kevin"])
    tv = screen(browser, "tv", 1366, 768, code, False)
    watcher = screen(browser, "watcher", 390, 844, code, True)
    T.until(lambda: T.room(host) and T.room(host).get("screens"))
    snap(tv, "lobby"); snap(watcher, "lobby"); snap(host, "lobby")
    everyone = [host] + guests
    for gid, steps in [
        ("dice", lambda: (host.get_by_role("button", name="掷骰子").click(), host.wait_for_timeout(1500))),
        ("wheel", lambda: (host.get_by_role("button", name="转一个").click(), host.wait_for_timeout(5500))),
        ("truth", lambda: (host.get_by_role("button", name="转瓶子").click(), host.wait_for_timeout(5500))),
    ]:
        T.start_game(host, everyone, gid)
        try:
            steps()
        except Exception as e:
            print("step:", gid, str(e)[:80])
        tv.wait_for_timeout(600)
        snap(tv, gid); snap(watcher, gid); snap(host, gid)
        # the watcher must have nothing to press that changes the game
        btns = watcher.evaluate("() => [...document.querySelectorAll('.net-body button, .tv-body button, main button')].map(b => b.innerText.trim()).filter(Boolean)")
        print(gid, "| watcher buttons:", btns[:8], "| errors:", tv._errs[:2], watcher._errs[:2])
        # back to the lobby
        host.locator(".topbar button").first.click() if False else None
        T.room(host)
        host.evaluate("() => window.__room && window.__room.act && window.__room.act({t:'end'})") if False else None
        # the host ends the game through the table sheet's "回到桌上" if present
        try:
            host.get_by_role("button", name="回到桌上").click(timeout=1500)
        except Exception:
            try:
                host.locator(".topbar .btn, .topbar button").first.click(timeout=1500)
                host.get_by_role("button", name="回到桌上").click(timeout=1500)
            except Exception as e:
                print("could not end", gid, str(e)[:60])
        T.until(lambda: not T.view(host), 6000)
        host.wait_for_timeout(500)
    browser.close()
print("done")
