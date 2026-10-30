"""Settled screenshots of the online surfaces for review. Needs the dev site and a local room server."""
import os, re, sys, time
sys.argv = ["x", "none"]
exec(open("scripts/net_test.py").read().split("with sync_playwright() as p:")[0])
OUT = ".impeccable/review/online"
os.makedirs(OUT, exist_ok=True)
def keep(pg, name):
    pg.wait_for_timeout(500)
    pg.screenshot(path=os.path.join(OUT, name))

with sync_playwright() as p:
    browser = p.chromium.launch()
    host, guests, code = seat_table(browser, ["Steve", "小雨", "Ben", "Cat"])
    everyone = [host] + guests
    time.sleep(2.6)  # let the arrival toasts pass
    keep(host, "mobile-lobby-host.png")
    keep(guests[0], "mobile-lobby-guest.png")
    host.get_by_role("button", name="叫人").first.click(); time.sleep(0.7)
    keep(host, "mobile-invite.png")
    host.keyboard.press("Escape"); time.sleep(0.4)
    guests[1].locator(".table-btn").click(); time.sleep(0.7)
    keep(guests[1], "mobile-table-sheet-guest.png")
    guests[1].keyboard.press("Escape"); time.sleep(0.4)
    j = phone(browser, "joiner")
    j.goto(BASE + f"#/r/{code}", wait_until="networkidle"); time.sleep(0.9)
    keep(j, "mobile-join.png")
    j.close()
    # reactions
    for g, r in [(guests[0], "干杯"), (guests[1], "哈哈"), (guests[2], "喝"), (host, "好")]:
        g.get_by_role("button", name=r).click(); time.sleep(0.15)
    time.sleep(0.5)
    keep(guests[0], "mobile-reactions.png")
    time.sleep(2.5)
    # dice until somebody is stamped
    start_game(host, everyone, "dice")
    for _ in range(10):
        v = view(host)
        turn = by_pid(everyone, v["turn"])
        turn.get_by_role("button", name="掷骰子").last.click()
        time.sleep(1.5)
        v = view(host)
        if v["phase"] == "assign":
            keep(turn, "mobile-dice-assign.png")
            turn.locator(".picker .chip").nth(1).click(); time.sleep(1.2)
        else:
            time.sleep(0.5)
        if stamps_up(everyone):
            time.sleep(1.0)
            mine = next(g for g in everyone if g.get_by_role("button", name="我喝了").count())
            keep(mine, "mobile-penalty-mine.png")
            watcher = next(g for g in everyone if g is not mine)
            keep(watcher, "mobile-penalty-watch.png")
            clear_stamps(everyone)
            break
        keep(turn, "mobile-dice-result.png")
        turn.get_by_role("button", name="下一个").first.click(); time.sleep(0.5)
    end_game(host, everyone)
    # truth: choice on the chosen phone
    start_game(host, everyone, "truth")
    v = view(host)
    by_pid(everyone, v["spinner"]).get_by_role("button", name="转瓶子").click()
    until(lambda: all(g.locator(".choose-box").count() for g in everyone), 9000)
    time.sleep(0.8)
    chosen = by_pid(everyone, view(host)["chosen"])
    keep(chosen, "mobile-truth-chosen.png")
    keep(next(g for g in everyone if g is not chosen), "mobile-truth-watch.png")
    end_game(host, everyone)
    # undercover word
    start_game(host, everyone, "undercover")
    host.get_by_role("button", name="发词").click(); time.sleep(0.8)
    keep(guests[0], "mobile-undercover-lid.png")
    guests[0].locator(".cloche-dome").click(); time.sleep(1.1)
    keep(guests[0], "mobile-undercover-word.png")
    end_game(host, everyone)
    # draw: guesser view mid-drawing
    start_game(host, everyone, "draw")
    drawer = by_pid(everyone, view(host)["drawer"])
    drawer.get_by_role("button", name=re.compile("中等")).click(); time.sleep(0.8)
    box = drawer.locator(".plate-canvas").bounding_box()
    cx, cy = box["x"] + box["width"] / 2, box["y"] + box["height"] / 2
    import math
    drawer.mouse.move(cx + 60, cy); drawer.mouse.down()
    for i in range(1, 40):
        a = i / 39 * 2 * math.pi
        drawer.mouse.move(cx + 60 * math.cos(a), cy + 60 * math.sin(a)); drawer.wait_for_timeout(10)
    drawer.mouse.up(); time.sleep(0.6)
    gs = [g for g in everyone if g is not drawer]
    gs[0].get_by_placeholder("猜是什么").fill("月亮"); gs[0].get_by_role("button", name="猜").click(); time.sleep(0.6)
    keep(gs[1], "mobile-draw-guesser.png")
    keep(drawer, "mobile-draw-drawer.png")
    end_game(host, everyone)
    # king: my chopstick
    start_game(host, everyone, "king")
    guests[1].locator(".holder-svg g[role=button][aria-disabled='false']").first.click(); time.sleep(1.2)
    keep(guests[1], "mobile-king-token.png")
    end_game(host, everyone)
    # prompts: answering
    start_game(host, everyone, "prompts")
    by_pid(everyone, view(host)["reader"]).get_by_role("button", name="抽一张").click(); time.sleep(0.9)
    guests[2].get_by_role("button", name="我做过").click(); time.sleep(0.5)
    keep(guests[2], "mobile-prompts-answer.png")
    end_game(host, everyone)
    # rogue: grab
    start_game(host, everyone, "rogue")
    keep(guests[0], "mobile-rogue-wait.png")
    end_game(host, everyone)
    # english + desktop lobby
    en = phone(browser, "en", "en")
    en.goto(BASE + f"#/r/{code}", wait_until="networkidle"); time.sleep(0.6)
    en.get_by_placeholder("Your name").fill("Amy"); en.get_by_role("button", name="Take a seat").click(); time.sleep(2.8)
    keep(en, "mobile-lobby-en.png")
    dctx = browser.new_context(viewport={"width": 1440, "height": 900})
    d = dctx.new_page()
    d.add_init_script("sessionStorage.setItem('lazysusan.entered','1');")
    d.goto(BASE + f"#/r/{code}", wait_until="networkidle"); time.sleep(0.6)
    d.get_by_placeholder("你的名字").fill("Dee"); d.get_by_role("button", name="入座").click(); time.sleep(2.8)
    d.screenshot(path=os.path.join(OUT, "desktop.png"))
    keep(host, "mobile.png")
    sctx = browser.new_context(viewport={"width": 390, "height": 667}, device_scale_factor=2, has_touch=True, is_mobile=True)
    sp = sctx.new_page()
    sp.add_init_script("sessionStorage.setItem('lazysusan.entered','1');")
    sp.goto(BASE + f"#/r/{code}", wait_until="networkidle"); time.sleep(0.6)
    sp.get_by_placeholder("你的名字").fill("Eve"); sp.get_by_role("button", name="入座").click(); time.sleep(2.8)
    sp.screenshot(path=os.path.join(OUT, "mobile-lobby-short.png"))
    # the king's own phone
    start_game(host, everyone, "king")
    for g in everyone:
        g.locator(".holder-svg g[role=button][aria-disabled='false']").first.click(); time.sleep(0.35)
    time.sleep(1.0)
    king = next((g for g in everyone if (view(g) or {}).get("myToken") == "K"), None)
    if king:
        keep(king, "mobile-king-crown.png")
    end_game(host, everyone)
    browser.close()
print("captured", len(os.listdir(OUT)))
