"""Three phones at one online table: create, join by link, play a round of each game that needs it."""
import os, re, sys, time
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:4173/"
OUT = ".impeccable/review/online"
os.makedirs(OUT, exist_ok=True)

def phone(ctx, name):
    pg = ctx.new_page()
    pg.add_init_script("sessionStorage.setItem('lazysusan.entered','1'); localStorage.setItem('lazysusan.settings.v1', JSON.stringify({lang:'zh',sound:false,customPenalty:'',players:[]}));")
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.on("console", lambda m: errs.append("console: " + m.text) if m.type == "error" else None)
    pg._errs = errs
    pg._name = name
    return pg

def shot(pg, name):
    pg.screenshot(path=os.path.join(OUT, f"{pg._name}-{name}.png"))

def report(pages):
    for pg in pages:
        if pg._errs:
            print(f"!! {pg._name}: {pg._errs[:3]}")

with sync_playwright() as p:
    b = p.chromium.launch()
    phones = []
    for name in ["host", "amy", "ben", "cat"]:
        ctx = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, has_touch=True, is_mobile=True)
        phones.append(phone(ctx, name))
    host, amy, ben, cat = phones

    # host opens a table
    host.goto(BASE, wait_until="networkidle"); host.wait_for_timeout(800)
    host.get_by_role("button", name="联机").click(); host.wait_for_timeout(500)
    host.get_by_placeholder("你的名字").fill("Steve")
    host.get_by_role("button", name="开一桌").click()
    host.wait_for_timeout(2500)
    shot(host, "lobby")
    text = host.locator(".invite-code").inner_text().strip()
    code = re.sub(r"\s", "", text)
    print("room code:", code)
    assert len(code) == 4

    # guests join via link
    for g, nm in [(amy, "小雨"), (ben, "Ben"), (cat, "阿猫")]:
        g.goto(BASE + f"#/join/{code}", wait_until="networkidle"); g.wait_for_timeout(800)
        g.get_by_placeholder("你的名字").fill(nm)
        g.get_by_role("button", name="加入").click()
        g.wait_for_timeout(2000)
    shot(amy, "lobby")
    host.wait_for_timeout(500)
    print("host sees players:", host.locator(".picker .chip").all_inner_texts())
    assert host.locator(".picker .chip").count() == 4, "host should see 4 players"

    # close sheets
    for g in phones:
        g.keyboard.press("Escape"); g.wait_for_timeout(400)
    shot(host, "table"); shot(amy, "table")

    # host serves Undercover via the menu
    host.get_by_role("button", name="菜单").click(); host.wait_for_timeout(500)
    host.locator(".menu-item").nth(2).click(); host.wait_for_timeout(1500)
    print("amy hash:", amy.evaluate("location.hash"), "ben hash:", ben.evaluate("location.hash"))
    assert "undercover" in amy.evaluate("location.hash")
    host.locator(".btn-primary").last.click(); host.wait_for_timeout(1200)   # deal
    words = {}
    for g in phones:
        g.locator(".cloche-dome").click(); g.wait_for_timeout(1000)
        words[g._name] = g.locator(".word-big").inner_text()
        shot(g, "undercover-word")
        g.locator(".btn-primary").last.click(); g.wait_for_timeout(500)
    print("words:", words)
    assert len(set(words.values())) == 2, "one undercover word among four phones"
    host.wait_for_timeout(1000)
    shot(host, "undercover-talk"); shot(ben, "undercover-talk")
    assert ben.locator(".timer-arc").count() == 1
    # vote: everyone taps the same target
    host.get_by_role("button", name="投票").click(); host.wait_for_timeout(800)
    for g in phones:
        g.locator(".picker .chip").nth(1).click(); g.wait_for_timeout(400)
    host.wait_for_timeout(1200)
    shot(amy, "undercover-reveal")
    assert amy.locator(".reveal-card").count() == 1, "reveal should show on a guest phone"

    # back to the table, then Never Have I Ever with hands on separate phones
    host.locator(".topbar .icon-btn").first.click(); host.wait_for_timeout(1200)
    print("amy after host back:", amy.evaluate("location.hash"))
    host.get_by_role("button", name="菜单").click(); host.wait_for_timeout(500)
    host.locator(".menu-item").nth(5).click(); host.wait_for_timeout(1500)
    host.locator(".btn-primary").last.click(); host.wait_for_timeout(1000)  # draw
    amy.get_by_role("button", name="我没做过").click(); amy.wait_for_timeout(800)
    shot(host, "nhie-hands")
    assert "小雨" in host.locator(".deck-stage").inner_text()
    host.get_by_role("button", name="喝").click(); host.wait_for_timeout(1500)
    shot(amy, "nhie-stamp"); shot(ben, "nhie-stamp")
    assert amy.locator(".stamp-layer").count() == 1 and ben.locator(".stamp-layer").count() == 1, "stamp on every phone"
    # only the stamped player or host can dismiss
    assert ben.locator(".stamp-done").count() == 0 and amy.locator(".stamp-done").count() == 1
    amy.locator(".stamp-done").click(); amy.wait_for_timeout(800)
    assert ben.locator(".stamp-layer").count() == 0

    # dice: it's the host's turn first (seat 0); then amy's
    host.locator(".topbar .icon-btn").first.click(); host.wait_for_timeout(800)
    host.get_by_role("button", name="菜单").click(); host.wait_for_timeout(500)
    host.locator(".menu-item").nth(6).click(); host.wait_for_timeout(1500)
    host.get_by_role("button", name="掷骰子").click(); host.wait_for_timeout(1600)
    shot(ben, "dice-after-roll")
    assert ben.locator(".dice-sum").count() == 1, "guest sees the roll result"

    # reconnect: amy reloads and lands back at the same game
    amy.reload(wait_until="networkidle"); amy.wait_for_timeout(2500)
    print("amy after reload:", amy.evaluate("location.hash"))
    assert "dice" in amy.evaluate("location.hash")
    shot(amy, "after-reload")

    report(phones)
    b.close()
print("ONLINE TEST OK")
