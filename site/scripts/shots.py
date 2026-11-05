"""Screenshot every screen at phone and desktop sizes, with a seeded player list."""
import json, os, sys, time
from playwright.sync_api import sync_playwright

BASE = "http://localhost:4173/"
OUT = sys.argv[1] if len(sys.argv) > 1 else ".impeccable/review"
os.makedirs(OUT, exist_ok=True)

PLAYERS = [{"id": f"p{i}", "name": n} for i, n in enumerate(["Steve", "小雨", "Kevin", "阿强", "Lily", "大鹏"])]

def seed(page, lang="zh"):
    page.add_init_script(
        "localStorage.setItem('lazysusan.settings.v1', %s); sessionStorage.setItem('lazysusan.entered','1');"
        % json.dumps(json.dumps({"lang": lang, "sound": False, "customPenalty": "", "players": PLAYERS}))
    )

def shot(ctx, route, name, lang="zh", actions=None, full=False, settle=600):
    page = ctx.new_page()
    seed(page, lang)
    errors = []
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(BASE + route, wait_until="networkidle")
    page.wait_for_timeout(settle)
    if actions:
        actions(page)
    page.screenshot(path=os.path.join(OUT, name), full_page=full)
    if errors:
        print(f"  !! console errors on {name}: {errors[:3]}")
    page.close()

def run(viewport, tag, scale):
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport=viewport, device_scale_factor=scale, has_touch=True, is_mobile=viewport["width"] < 600)
        shot(ctx, "", f"{tag}-table-zh.png", "zh", settle=1800)
        shot(ctx, "", f"{tag}-table-en.png", "en", settle=1800)
        shot(ctx, "", f"{tag}-table-menu.png", "zh", actions=lambda pg: (pg.get_by_role("button", name="菜单").click(), pg.wait_for_timeout(700)))
        shot(ctx, "", f"{tag}-table-players.png", "zh", actions=lambda pg: (pg.locator(".table-strip .chip").first.click(), pg.wait_for_timeout(700)))
        shot(ctx, "#/g/rogue", f"{tag}-rogue-1.png")
        shot(ctx, "#/g/rogue", f"{tag}-rogue-2.png", actions=lambda pg: (pg.locator(".pcard-back").click(), pg.wait_for_timeout(1400)))
        shot(ctx, "#/g/rogue", f"{tag}-rogue-3-stamp.png", actions=lambda pg: (pg.locator(".pcard-back").click(), pg.wait_for_timeout(1400), pg.locator(".game-actions .btn").click(), pg.wait_for_timeout(300), pg.locator(".picker .chip").first.click() if pg.locator(".picker .chip").count() else None, pg.wait_for_timeout(1600)))
        shot(ctx, "#/g/truth", f"{tag}-truth-1.png")
        shot(ctx, "#/g/truth", f"{tag}-truth-2.png", actions=lambda pg: (pg.locator(".game-actions .btn-primary").click(), pg.wait_for_timeout(5200)))
        shot(ctx, "#/g/truth", f"{tag}-truth-3.png", actions=lambda pg: (pg.locator(".game-actions .btn-primary").click(), pg.wait_for_timeout(5200), pg.locator(".game-actions .btn-porcelain").click(), pg.wait_for_timeout(600)))
        shot(ctx, "#/g/truth", f"{tag}-truth-4.png", actions=lambda pg: (pg.locator(".game-actions .btn-primary").click(), pg.wait_for_timeout(5200), pg.locator(".game-actions .btn-porcelain").click(), pg.wait_for_timeout(600), pg.locator(".cloche-dome").click(), pg.wait_for_timeout(1200)))
        shot(ctx, "#/g/undercover", f"{tag}-undercover-1.png")
        shot(ctx, "#/g/undercover", f"{tag}-undercover-2.png", actions=lambda pg: (pg.locator(".btn-primary").last.click(), pg.wait_for_timeout(600), pg.locator(".cloche-dome").click(), pg.wait_for_timeout(1200)))
        shot(ctx, "#/g/draw", f"{tag}-draw-1.png")
        shot(ctx, "#/g/draw", f"{tag}-draw-2.png", actions=lambda pg: (pg.locator(".setup-card .btn").nth(1).click(), pg.wait_for_timeout(500), pg.locator(".cloche-dome").click(), pg.wait_for_timeout(1200), pg.locator(".btn-primary").last.click(), pg.wait_for_timeout(800)))
        shot(ctx, "#/g/king", f"{tag}-king-1.png")
        shot(ctx, "#/g/king", f"{tag}-king-2.png", actions=lambda pg: (pg.locator(".holder-svg g[role=button]").nth(2).click(), pg.wait_for_timeout(1300)))
        shot(ctx, "#/g/prompts", f"{tag}-prompts-1.png", actions=lambda pg: (pg.locator(".btn-primary").last.click(), pg.wait_for_timeout(900)))
        shot(ctx, "#/g/dice", f"{tag}-dice-1.png")
        shot(ctx, "#/g/dice", f"{tag}-dice-2.png", actions=lambda pg: (pg.locator(".btn-gold").click(), pg.wait_for_timeout(1700)))
        shot(ctx, "#/g/wheel", f"{tag}-wheel-1.png")
        shot(ctx, "#/g/wheel", f"{tag}-wheel-2.png", actions=lambda pg: (pg.locator(".btn-primary").last.click(), pg.wait_for_timeout(5200)))
        b.close()

run({"width": 390, "height": 844}, "mobile", 2)
run({"width": 1440, "height": 900}, "desktop", 1)
print("done")
