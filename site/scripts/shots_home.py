"""Screenshots of the new front door, tools, wishlist and a few game screens.

usage: python3 scripts/shots_home.py [base_url] [only...]
"""
import os, sys, time
from playwright.sync_api import sync_playwright

BASE = next((a for a in sys.argv[1:] if a.startswith("http")), "http://127.0.0.1:5173/")
ONLY = [a for a in sys.argv[1:] if not a.startswith("http")]
OUT = os.environ.get("SHOTS", "/tmp/claude-0/-home-claude/9e141460-a70a-5df4-ae5a-70d27259d966/scratchpad/home")
os.makedirs(OUT, exist_ok=True)

def phone(browser, lang="zh", players=None, w=390, h=844):
    ctx = browser.new_context(viewport={"width": w, "height": h}, device_scale_factor=2, has_touch=True, is_mobile=True)
    pg = ctx.new_page()
    ps = players if players is not None else [{"id": f"p{i}", "name": n} for i, n in enumerate(["Steve", "Ann", "小明", "Ben", "Cathy"])]
    import json
    pg.add_init_script(
        "localStorage.setItem('lazysusan.settings.v1', JSON.stringify(%s));" % json.dumps({"lang": lang, "sound": False, "music": False, "customPenalty": "", "players": ps})
    )
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.on("console", lambda m: errs.append("console: " + m.text) if m.type == "error" else None)
    pg._errs = errs
    return pg

def shot(pg, name, full=False):
    pg.screenshot(path=os.path.join(OUT, name + ".png"), full_page=full)

def want(k):
    return not ONLY or k in ONLY

with sync_playwright() as p:
    b = p.chromium.launch()
    if want("home"):
        for lang in ("zh", "en"):
            pg = phone(b, lang)
            pg.goto(BASE, wait_until="networkidle")
            pg.wait_for_timeout(1800)
            shot(pg, f"home-{lang}")
            shot(pg, f"home-{lang}-full", full=True)
            if lang == "zh":
                pg.locator(".board .ui-tile").nth(0).click()
                pg.wait_for_timeout(900)
                shot(pg, "sheet-truth")
                pg.keyboard.press("Escape")
                pg.wait_for_timeout(600)
                pg.locator(".board .ui-tile").nth(2).click()
                pg.wait_for_timeout(900)
                shot(pg, "sheet-soon")
                pg.keyboard.press("Escape")
                pg.wait_for_timeout(600)
                pg.locator(".spin-btn").click()
                pg.wait_for_timeout(700)
                shot(pg, "spin-mid")
                pg.wait_for_timeout(4200)
                shot(pg, "spin-end")
                pg.keyboard.press("Escape")
                pg.wait_for_timeout(500)
                pg.locator(".tip-btn").click()
                pg.wait_for_timeout(900)
                shot(pg, "tip")
            print(lang, "errors:", pg._errs[:3])
            pg.context.close()
    if want("tools"):
        for lang in ("zh", "en"):
            pg = phone(b, lang)
            pg.goto(BASE + "#/tools", wait_until="networkidle")
            pg.wait_for_timeout(2000)
            shot(pg, f"tools-{lang}")
            shot(pg, f"tools-{lang}-full", full=True)
            if lang == "zh":
                # each tool is a card on the tab and opens on its own page
                pg.goto(BASE + "/tools/currency", wait_until="networkidle")
                pg.wait_for_timeout(800)
                pg.locator(".fx-row").nth(1).locator("input").click()
                pg.keyboard.type("1000")
                pg.wait_for_timeout(300)
                shot(pg, "tools-fx-typed")
                pg.goto(BASE + "/tools/clock", wait_until="networkidle")
                pg.wait_for_timeout(800)
                pg.locator(".clock-time").nth(3).click()
                pg.wait_for_timeout(800)
                shot(pg, "tools-clock-sheet")
                pg.locator(".time-field input").fill("09:30")
                pg.locator(".sheet .btn-primary").click()
                pg.wait_for_timeout(900)
                shot(pg, "tools-clock-set")
                # drag the ruler
                tr = pg.locator(".scrub-track")
                box = tr.bounding_box()
                pg.mouse.move(box["x"] + box["width"] / 2, box["y"] + 20)
                pg.mouse.down()
                pg.mouse.move(box["x"] + box["width"] / 2 - 120, box["y"] + 20, steps=8)
                pg.mouse.up()
                pg.wait_for_timeout(300)
                shot(pg, "tools-clock-scrub")
                pg.goto(BASE + "/tools/price", wait_until="networkidle")
                pg.wait_for_timeout(800)
                shot(pg, "tools-price")
            print(lang, "errors:", pg._errs[:3])
            pg.context.close()
    if want("wish"):
        pg = phone(b, "zh")
        pg.goto(BASE + "#/wish", wait_until="networkidle")
        pg.wait_for_timeout(1500)
        shot(pg, "wish")
        pg.locator(".wish-form textarea").fill("狼人杀，带语音法官")
        pg.locator(".wish-form button[type=submit]").click()
        pg.wait_for_timeout(1200)
        pg.locator(".vote").first.click()
        pg.wait_for_timeout(400)
        shot(pg, "wish-posted")
        shot(pg, "wish-full", full=True)
        print("wish errors:", pg._errs[:3])
        pg.context.close()
    if want("games"):
        pg = phone(b, "zh")
        for gid in ("truth", "dice", "rogue", "wheel", "king", "draw", "prompts", "undercover"):
            pg.goto(BASE + f"#/g/{gid}", wait_until="networkidle")
            pg.wait_for_timeout(1200)
            shot(pg, f"game-{gid}")
        # a penalty: truth, spin, choose, pass
        pg.goto(BASE + "#/g/dice", wait_until="networkidle")
        pg.wait_for_timeout(800)
        for i in range(8):
            btn = pg.get_by_role("button", name="掷骰子")
            if btn.count():
                btn.first.click()
                pg.wait_for_timeout(1700)
            if pg.locator(".stamp-layer").count():
                pg.wait_for_timeout(1200)
                shot(pg, "stamp")
                break
            nxt = pg.get_by_role("button", name="下一个")
            if nxt.count():
                nxt.first.click()
                pg.wait_for_timeout(400)
        print("games errors:", pg._errs[:3])
        pg.context.close()
    b.close()
print("shots in", OUT)
