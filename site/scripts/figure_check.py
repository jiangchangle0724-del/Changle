"""
The 3D figure's prototype (/me/figure, Steve on Nov 13: 先做小样), on a phone-sized browser.

This machine has no graphics chip (its browser draws WebGL in software), so the page is told to
take any WebGL (window.__figAnyGl, dev builds only) and the figure comes on as it would on a phone.

What it checks: untold, the page explains that this device can't draw 3D and never downloads
three.js; told, the figure loads (gzipped) and draws (frames counted), the 26 moves are chips of
at least 48 px in two groups (9 of ours, 17 borrowed), each one plays its own clip, our moves hold
their props (sword, shades, phone, beer, headphones), the selfie flashes, sleep lies down before
its Zzz float up, crying sheds tears; dragging sideways turns the figure, the stats line names the
file's size and the engine's; in English too; the back button goes back; the owner's /me page has
the link (needs the rooms server with MASTER_EMAIL=master@example.test in site/worker/.dev.vars,
skipped when the server is down); no error is thrown in any page. Screenshots go to OUT.

Needs the site's dev server (npm run dev, port 5173); the rooms server (port 8787) only for the
last step.
  python3 scripts/figure_check.py [out_dir]
"""
import os
import sys
import time
import urllib.request

from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:5173/"
API = "http://127.0.0.1:8787/api"
OUT = sys.argv[1] if len(sys.argv) > 1 else "/tmp/figure-shots"
os.makedirs(OUT, exist_ok=True)

fails: list[str] = []
errors: list[str] = []


def check(ok: bool, what: str):
    print(("PASS " if ok else "FAIL ") + what, flush=True)
    if not ok:
        fails.append(what)


def phone(browser, locale="zh-CN", any_gl=True):
    ctx = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True, color_scheme="dark", locale=locale)
    page = ctx.new_page()
    if any_gl:
        page.add_init_script("window.__figAnyGl = true;")
    page.on("pageerror", lambda e: errors.append(f"pageerror {e}"))
    page.on("console", lambda m: m.type == "error" and errors.append(f"console {m.text}"))
    page._js = []
    page.on("request", lambda r: page._js.append(r.url) if r.url.endswith(".js") or ".js?" in r.url or ".glb" in r.url else None)
    return ctx, page


def rooms_up() -> bool:
    try:
        urllib.request.install_opener(urllib.request.build_opener(urllib.request.ProxyHandler({})))
        urllib.request.urlopen(API + "/me", timeout=2)
    except urllib.error.HTTPError as e:
        return e.code == 401
    except Exception:
        return False
    return True


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch()

        # 1. a device without a graphics chip (this one, untold): the page says so, no three.js comes down
        ctx, pg = phone(browser, any_gl=False)
        pg.goto(BASE + "me/figure", wait_until="load")
        pg.wait_for_selector(".fig-stage .ui-empty", timeout=15000)
        check("画不了 3D" in pg.inner_text(".fig-stage"), "without a graphics chip the page explains, in the stage")
        check(pg.evaluate("window.__figIs") == "software", f"the figure reports 'software' ({pg.evaluate('window.__figIs')})")
        pg.wait_for_timeout(800)
        check(not any("three" in u or ".glb" in u for u in pg._js), "three.js and the model were not downloaded")
        check(pg.locator(".fig-moves .chip").count() == 26 and pg.locator(".fig-moves .chip:not(:disabled)").count() == 0, "the 26 moves are shown but off")
        pg.screenshot(path=f"{OUT}/figure-no-gl.png")
        ctx.close()

        # 2. told to take any WebGL: the figure comes on
        ctx, pg = phone(browser)
        t0 = time.time()
        pg.goto(BASE + "me/figure", wait_until="load")
        pg.wait_for_function("window.__figIs === 'on'", timeout=60000)
        took = time.time() - t0
        print(f"     the figure was on after {took:.1f}s (software rendering, a development build)")
        check(pg.locator(".fig-canvas canvas").count() == 1, "one canvas in the stage")
        check(pg.evaluate("document.title").startswith("3D 小人"), f"the tab is titled 3D 小人 ({pg.evaluate('document.title')})")
        check(any(u.endswith("/models/figure.glb.gz") for u in pg._js), "the model came from /models/figure.glb.gz")
        check(any("three" in u for u in pg._js), "three.js came down on this page")
        pg.wait_for_function("typeof window.__figFps === 'number' && window.__figFps > 0", timeout=20000)
        fps = pg.evaluate("window.__figFps")
        check(fps > 0, f"frames are drawn ({fps} a second here, in software)")
        stats = pg.inner_text(".fig-stats")
        check("KB" in stats and "个面" in stats and "帧/秒" in stats, f"the stats line: {stats}")
        kb = int(stats.split(" KB")[0].split("模型 ")[1].replace(",", ""))
        check(200 <= kb <= 1024, f"the model is under 1 MB ({kb} KB)")
        check("引擎" in stats, "the engine's download is named")
        pg.wait_for_timeout(1500)
        pg.screenshot(path=f"{OUT}/figure-on.png")

        # the moves: chips, big enough, each playing its own clip
        chips = pg.locator(".fig-moves .chip")
        check(chips.count() == 26, f"26 moves ({chips.count()})")
        groups = pg.locator(".fig-group")
        check(groups.count() == 2 and groups.nth(0).locator(".list-title").inner_text() == "我们编的" and groups.nth(0).locator(".chip").count() == 9, "two groups: 9 of ours first")
        check(groups.nth(0).locator(".chip").all_inner_texts()[:4] == ["摆酷", "照相", "睡觉", "挥刀"], "Steve's four lead: 摆酷 照相 睡觉 挥刀")
        boxes = chips.evaluate_all("els => els.map(e => e.getBoundingClientRect().height)")
        check(all(h >= 48 for h in boxes), f"every move is at least 48 px tall (smallest {min(boxes):.0f})")
        check(pg.locator(".fig-moves .chip[aria-pressed='true']").inner_text() == "站着", "站着 is pressed at first")
        check(pg.evaluate("window.__figMove") == "stand", "the figure stands at first")
        played = []
        for i in range(chips.count()):
            label = chips.nth(i).inner_text()
            chips.nth(i).click()
            pg.wait_for_timeout(120)
            played.append((label, pg.evaluate("window.__figMove")))
        ids = [m for _, m in played]
        check(len(set(ids)) == 26, f"each chip plays a clip of its own ({len(set(ids))} different)")
        check(pg.locator(".fig-moves .chip[aria-pressed='true']").inner_text() == "跑步", "the last chip pressed is the pressed one")
        pg.locator(".fig-moves .chip", has_text="跳舞").click()
        pg.wait_for_timeout(1200)
        check(pg.evaluate("window.__figMove") == "dance", "跳舞 plays the dance")
        pg.screenshot(path=f"{OUT}/figure-dance.png")

        # our moves: what they hold, and what comes off them
        def tap(label, wait=700):
            pg.locator(".fig-moves .chip", has_text=label).first.click()
            pg.wait_for_timeout(wait)

        for label, prop in [("挥刀", "sword"), ("摆酷", "shades"), ("干杯", "beer"), ("打碟", "headphones")]:
            tap(label)
            held = pg.evaluate("window.__figHeld")
            check(held == [prop], f"{label} holds the {prop} ({held})")
            pg.screenshot(path=f"{OUT}/figure-{prop}.png")
        tap("比心", 400)
        check(pg.evaluate("window.__figHeld") == [], "比心 holds nothing: the headphones are put away")
        pg.wait_for_function("window.__figFloaters > 0", timeout=4000)
        check(True, "比心 sends hearts up")
        pg.evaluate("window.__figFlashes = 0")
        tap("照相", 0)
        pg.wait_for_function("window.__figFlashes >= 1", timeout=8000)
        check(pg.evaluate("window.__figHeld") == ["phone"], "照相 holds the phone, and its flash goes")
        tap("睡觉", 300)
        check(pg.evaluate("window.__figLooping") is False, "睡觉 lies down first (its intro plays once)")
        pg.wait_for_function("window.__figLooping === true", timeout=8000)
        pg.wait_for_function("window.__figFloaters > 0", timeout=5000)
        check(True, "then it sleeps, and the Zzz float up")
        pg.screenshot(path=f"{OUT}/figure-sleep.png")
        tap("大哭", 0)
        pg.wait_for_function("window.__figFloaters >= 4", timeout=3000)
        check(True, "大哭 sheds tears")
        pg.screenshot(path=f"{OUT}/figure-cry.png")
        tap("抱拳")
        check(pg.evaluate("window.__figMove") == "fist" and pg.evaluate("window.__figHeld") == [], "抱拳 plays, with empty hands")

        # dragging sideways turns it
        before = pg.evaluate("window.__figTurn")
        box = pg.locator(".fig-canvas canvas").bounding_box()
        cx, cy = box["x"] + box["width"] / 2, box["y"] + box["height"] / 2
        pg.mouse.move(cx - 80, cy)
        pg.mouse.down()
        for k in range(1, 9):
            pg.mouse.move(cx - 80 + k * 20, cy)
            pg.wait_for_timeout(30)
        pg.mouse.up()
        pg.wait_for_timeout(600)
        after = pg.evaluate("window.__figTurn")
        check(after is not None and before is not None and after - before > 0.5, f"a drag of 160 px turned it by {(after or 0) - (before or 0):.2f} rad")
        pg.screenshot(path=f"{OUT}/figure-turned.png")

        # ‹ on a page opened from a link goes home (router.ts: back); from /me it goes back to /me
        pg.click(".topbar .icon-btn")
        pg.wait_for_function("location.pathname === '/'", timeout=5000)
        check(pg.evaluate("location.pathname") == "/", "‹ on the page opened by its address goes home")
        check(pg.evaluate("document.querySelectorAll('canvas').length") == 0, "leaving the page takes the canvas with it")
        pg.goto(BASE + "me", wait_until="load")
        pg.wait_for_selector(".screen.me", timeout=10000)
        pg.evaluate("document.querySelector('.screen.me').insertAdjacentHTML('beforeend', '<a id=\"fig-link\" href=\"/me/figure\">3D</a>')")
        pg.click("#fig-link")
        pg.wait_for_function("window.__figIs === 'on'", timeout=60000)
        pg.click(".topbar .icon-btn")
        pg.wait_for_function("location.pathname === '/me'", timeout=5000)
        check(pg.evaluate("location.pathname") == "/me", "‹ on the page opened from /me goes back to /me")
        ctx.close()

        # 3. in English
        ctx, pg = phone(browser, locale="en-CA")
        pg.add_init_script("localStorage.setItem('lazysusan.settings.v1', JSON.stringify({lang: 'en', players: [], sound: false, music: false, customPenalty: ''}));")
        pg.goto(BASE + "me/figure", wait_until="load")
        pg.wait_for_function("window.__figIs === 'on'", timeout=60000)
        names = pg.locator(".fig-moves .chip").all_inner_texts()
        check(names[:4] == ["Cool", "Selfie", "Sleep", "Sword"] and "Stand" in names and "Thumbs up" in names, f"the moves are in English ({names[:4]})")
        check(pg.locator(".fig-group .list-title").all_inner_texts() == ["Ours", "Borrowed, to be replaced"], "the groups are in English")
        check("A prototype" in pg.inner_text(".fig-intro"), "the introduction is in English")
        pg.wait_for_function("typeof window.__figFps === 'number' && window.__figFps > 0", timeout=20000)
        check("fps" in pg.inner_text(".fig-stats") and "triangles" in pg.inner_text(".fig-stats"), f"the stats line in English: {pg.inner_text('.fig-stats')}")
        pg.screenshot(path=f"{OUT}/figure-en.png")
        ctx.close()

        # 4. the owner's /me page links to it (the rooms server must be up)
        if rooms_up():
            ctx, pg = phone(browser)
            pg.goto(BASE, wait_until="load")
            pg.wait_for_selector(".acct-signin, .acct-me", timeout=15000)
            pg.click(".acct-signin")
            pg.wait_for_selector("#si-email")
            pg.fill("#si-email", "master@example.test")
            pg.click(".signin button[type=submit]")
            pg.wait_for_selector(".otp-input")
            pg.wait_for_function("document.querySelector('.otp-input').value.length === 6")
            pg.click(".signin button[type=submit]")
            pg.wait_for_selector(".profile-form, .acct-me", timeout=10000)
            if pg.locator(".profile-form").count():
                pg.fill("#pf-name", "Master")
                pg.fill("#pf-phone", "+1 604 555 0100")
                pg.fill("#pf-city", "Vancouver")
                pg.click(".pf-genders .chip:text-is('不透露')")
                pg.fill("#pf-bio", "站长")
                pg.check(".pf-check input")
                pg.click(".profile-form button[type=submit]")
                pg.wait_for_selector(".acct-me", timeout=10000)
            pg.goto(BASE + "me", wait_until="load")
            pg.wait_for_selector(".me-foot", timeout=10000)
            link = pg.locator(".me-foot a.me-figure")
            check(link.count() == 1 and link.get_attribute("href") == "/me/figure", "the owner's /me has the 3D 小人 link")
            link.click()
            pg.wait_for_function("location.pathname === '/me/figure'", timeout=5000)
            pg.wait_for_function("window.__figIs === 'on'", timeout=60000)
            check(True, "the link opens the figure")
            pg.screenshot(path=f"{OUT}/figure-from-me.png")
            ctx.close()
        else:
            print("     (rooms server down: the owner's link not checked)")

        browser.close()

    real = [e for e in errors if "favicon" not in e]
    check(not real, f"no error was thrown in any page ({len(real)})")
    for e in real[:5]:
        print("   ", e[:300])
    print(f"\n{len(fails)} failed" if fails else "\nall passed")
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
