import json, os
from playwright.sync_api import sync_playwright
BASE = "http://localhost:4173/"
OUT = ".impeccable/review"
PLAYERS = [{"id": f"p{i}", "name": n} for i, n in enumerate(["Steve", "小雨", "Kevin", "阿强", "Lily", "大鹏"])]


def mk(ctx, lang, players=PLAYERS):
    pg = ctx.new_page()
    pg.add_init_script(
        "localStorage.setItem('lazysusan.settings.v1', %s); sessionStorage.setItem('lazysusan.entered','1');"
        % json.dumps(json.dumps({"lang": lang, "sound": False, "customPenalty": "", "players": players}))
    )
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg._errs = errs
    return pg


def shot(ctx, route, name, lang="zh", actions=None, settle=600, players=PLAYERS):
    pg = mk(ctx, lang, players)
    pg.goto(BASE + route, wait_until="networkidle")
    pg.wait_for_timeout(settle)
    if actions:
        actions(pg)
    pg.screenshot(path=os.path.join(OUT, name))
    if pg._errs:
        print("!!", name, pg._errs[:2])
    pg.close()


with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, has_touch=True, is_mobile=True)
    shot(ctx, "#/g/undercover", "r3-undercover-setup.png")
    shot(ctx, "#/g/undercover", "r3-undercover-setup-en.png", "en")
    shot(ctx, "#/g/wheel", "r3-wheel-zh.png")
    shot(ctx, "#/g/wheel", "r3-wheel-en.png", "en")
    shot(ctx, "#/g/draw", "r3-draw-tools.png", actions=lambda pg: (pg.locator(".setup-card .btn").nth(1).click(), pg.wait_for_timeout(500), pg.locator(".cloche-dome").click(), pg.wait_for_timeout(1200), pg.locator(".btn-primary").last.click(), pg.wait_for_timeout(800)))
    shot(ctx, "#/g/rogue", "r3-rogue-stamp.png", actions=lambda pg: (pg.locator(".pcard-back").click(), pg.wait_for_timeout(1400), pg.locator(".rule-card .btn").first.click(), pg.wait_for_timeout(300), (pg.locator(".picker .chip").first.click() if pg.locator(".picker .chip").count() else None), pg.wait_for_timeout(1800)))
    shot(ctx, "#/g/prompts", "r3-prompts-guilty.png", actions=lambda pg: (pg.locator(".btn-primary").last.click(), pg.wait_for_timeout(900), pg.locator(".btn-penalty").click(), pg.wait_for_timeout(500), pg.locator(".picker .chip").nth(1).click(), pg.locator(".picker .chip").nth(3).click(), pg.wait_for_timeout(400)))
    shot(ctx, "#/g/truth", "r3-truth-1.png")
    shot(ctx, "", "r3-empty.png", players=[], settle=1800)
    shot(ctx, "#/g/truth", "r3-truth-stamp-en.png", "en", actions=lambda pg: (pg.locator(".game-actions .btn-primary").click(), pg.wait_for_timeout(5200), pg.locator(".game-actions .btn-gold").click(), pg.wait_for_timeout(600), pg.locator(".cloche-dome").click(), pg.wait_for_timeout(1200), pg.locator(".btn-penalty").click(), pg.wait_for_timeout(1800)))
    b.close()
print("ok")
