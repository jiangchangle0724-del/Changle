"""Second round: the fixed screens plus the penalty stamp and a spun table."""
import json, os, sys
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

def shot(ctx, route, name, lang="zh", actions=None, settle=600):
    page = ctx.new_page()
    seed(page, lang)
    errors = []
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(BASE + route, wait_until="networkidle")
    page.wait_for_timeout(settle)
    if actions:
        actions(page)
    page.screenshot(path=os.path.join(OUT, name))
    if errors:
        print(f"  !! console errors on {name}: {errors[:3]}")
    page.close()

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, has_touch=True, is_mobile=True)
    # the table after a spin: glyphs should stay upright
    shot(ctx, "", "m2-table-spun.png", actions=lambda pg: (pg.locator(".front-actions .btn-ghost").click(), pg.wait_for_timeout(5200)))
    shot(ctx, "", "m2-table-en.png", "en", settle=1200)
    shot(ctx, "#/g/truth", "m2-truth-1.png")
    shot(ctx, "#/g/truth", "m2-truth-stamp.png", actions=lambda pg: (
        pg.locator(".game-actions .btn-primary").click(), pg.wait_for_timeout(5200),
        pg.locator(".game-actions .btn-porcelain").click(), pg.wait_for_timeout(600),
        pg.locator(".cloche-dome").click(), pg.wait_for_timeout(1200),
        pg.get_by_role("button", name="放弃，认罚").click(), pg.wait_for_timeout(1800)))
    shot(ctx, "#/g/truth", "m2-truth-stamp-en.png", "en", actions=lambda pg: (
        pg.locator(".game-actions .btn-primary").click(), pg.wait_for_timeout(5200),
        pg.locator(".game-actions .btn-porcelain").click(), pg.wait_for_timeout(600),
        pg.locator(".cloche-dome").click(), pg.wait_for_timeout(1200),
        pg.get_by_role("button", name="Pass and take the penalty").click(), pg.wait_for_timeout(1800)))
    shot(ctx, "#/g/truth", "m2-truth-closed.png", actions=lambda pg: (
        pg.locator(".game-actions .btn-primary").click(), pg.wait_for_timeout(5200),
        pg.locator(".game-actions .btn-porcelain").click(), pg.wait_for_timeout(700)))
    shot(ctx, "#/g/prompts", "m2-prompts.png", actions=lambda pg: (pg.locator(".btn-primary").last.click(), pg.wait_for_timeout(900)))
    shot(ctx, "#/g/prompts", "m2-prompts-likely.png", actions=lambda pg: (pg.locator(".heat-tab button").nth(1).click(), pg.wait_for_timeout(300), pg.locator(".btn-primary").last.click(), pg.wait_for_timeout(900)))
    shot(ctx, "#/g/king", "m2-king.png", actions=lambda pg: (pg.locator(".holder-svg g[role=button]").nth(2).click(), pg.wait_for_timeout(1300)))
    shot(ctx, "#/g/wheel", "m2-wheel.png", actions=lambda pg: (pg.locator(".btn-primary").last.click(), pg.wait_for_timeout(5200)))
    shot(ctx, "#/g/undercover", "m2-undercover-closed.png", actions=lambda pg: (pg.locator(".btn-primary").last.click(), pg.wait_for_timeout(700)))
    shot(ctx, "", "m2-settings.png", actions=lambda pg: (pg.locator(".topbar .icon-btn").first.click(), pg.wait_for_timeout(700)))
    shot(ctx, "", "m2-empty.png", actions=lambda pg: (pg.evaluate("localStorage.removeItem('lazysusan.settings.v1')"), pg.reload(), pg.wait_for_timeout(2200)))
    b.close()
print("done")
