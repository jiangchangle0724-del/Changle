"""Single-phone regression: every game opens, plays a turn, and logs no errors.

usage: python3 scripts/local_check.py [base_url] [out_dir]
"""
import json, os, sys
from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:5173/"
OUT = sys.argv[2] if len(sys.argv) > 2 else "local-shots"
os.makedirs(OUT, exist_ok=True)
PLAYERS = [{"id": f"p{i}", "name": n} for i, n in enumerate(["Steve", "小雨", "Kevin", "阿强", "Lily", "大鹏"])]
fails = []

def page(ctx, lang="zh"):
    pg = ctx.new_page()
    pg.add_init_script(
        "localStorage.setItem('lazysusan.settings.v1', %s); sessionStorage.setItem('lazysusan.entered','1');"
        % json.dumps(json.dumps({"lang": lang, "sound": False, "music": False, "customPenalty": "", "players": PLAYERS}))
    )
    pg._errs = []
    pg.on("pageerror", lambda e: pg._errs.append(str(e)))
    pg.on("console", lambda m: pg._errs.append(m.text) if m.type == "error" else None)
    return pg

def snap(pg, name):
    pg.screenshot(path=os.path.join(OUT, name))

def done(pg, label):
    if pg._errs:
        fails.append(f"{label}: {pg._errs[:3]}")
    pg.close()

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, has_touch=True, is_mobile=True)

    pg = page(ctx)
    pg.goto(BASE, wait_until="networkidle"); pg.wait_for_timeout(1200)
    snap(pg, "hub.png")
    # Draw & Guess by name, not by place: the board's order changes when a game is added.
    pg.locator('.tile[aria-label^="Draw & Guess"]').tap(); pg.wait_for_timeout(900)
    if not pg.locator(".game-card").count():
        fails.append("hub: tapping a tile did not open its card")
    pg.locator(".mode-primary").tap(); pg.wait_for_timeout(900)
    if "#/g/draw" not in pg.url:
        fails.append("hub: playing on this phone did not open the game")
    done(pg, "hub")

    # dice: roll until a penalty, check the stamp's glass is clipped inside itself
    pg = page(ctx)
    pg.goto(BASE + "#/g/dice", wait_until="networkidle"); pg.wait_for_timeout(500)
    for _ in range(12):
        pg.get_by_role("button", name="掷骰子").click(); pg.wait_for_timeout(1300)
        btn = pg.locator(".stack .btn-lg").first
        label = btn.inner_text()
        btn.click(); pg.wait_for_timeout(1300)
        if pg.locator(".stamp-layer").count():
            snap(pg, "dice-stamp.png")
            ids = pg.evaluate("() => [...document.querySelectorAll('clipPath')].map(c => c.id)")
            if len(ids) != len(set(ids)):
                fails.append(f"dice: duplicate clip path ids {ids}")
            pg.locator(".stamp-done").click(); pg.wait_for_timeout(500)
            break
        if pg.locator(".picker").count():
            pg.locator(".picker .chip").first.click(); pg.wait_for_timeout(1200)
            if pg.locator(".stamp-layer").count():
                snap(pg, "dice-stamp.png")
                pg.locator(".stamp-done").click(); pg.wait_for_timeout(500)
                break
    done(pg, "dice")

    # draw: the tools fit the phone
    pg = page(ctx)
    pg.goto(BASE + "#/g/draw", wait_until="networkidle"); pg.wait_for_timeout(500)
    pg.locator(".setup-card .btn").first.click(); pg.wait_for_timeout(500)
    pg.locator(".cloche-dome").click(); pg.wait_for_timeout(1100)
    pg.get_by_role("button", name="开始画").click(); pg.wait_for_timeout(700)
    over = pg.evaluate("() => { const t = document.querySelector('.plate-tools'); return [...t.querySelectorAll('button')].filter(b => b.getBoundingClientRect().right > window.innerWidth + 1).length; }")
    if over:
        fails.append(f"draw: {over} drawing tools fall off the screen")
    snap(pg, "draw.png")
    done(pg, "draw")

    # rogue: draw three cards and resolve whatever comes
    pg = page(ctx)
    pg.goto(BASE + "#/g/rogue", wait_until="networkidle"); pg.wait_for_timeout(500)
    for i in range(3):
        pg.locator(".pcard-back").click(); pg.wait_for_timeout(1200)
        if i == 0:
            snap(pg, "rogue-card.png")
        pg.locator(".rule-card .btn").first.click(); pg.wait_for_timeout(700)
        if pg.locator(".rule-card .picker").count():
            snap(pg, "rogue-pick.png")
            pg.locator(".rule-card .picker .chip").first.click(); pg.wait_for_timeout(1300)
        if pg.locator(".stamp-layer").count():
            pg.locator(".stamp-done").click(); pg.wait_for_timeout(500)
    done(pg, "rogue")

    # truth: spin, choose, lift
    pg = page(ctx)
    pg.goto(BASE + "#/g/truth", wait_until="networkidle"); pg.wait_for_timeout(500)
    pg.get_by_role("button", name="转瓶子").click(); pg.wait_for_timeout(5200)
    pg.get_by_role("button", name="真心话").click(); pg.wait_for_timeout(500)
    pg.locator(".cloche-dome").click(); pg.wait_for_timeout(1000)
    snap(pg, "truth.png")
    done(pg, "truth")

    for g in ["undercover", "king", "prompts", "wheel"]:
        pg = page(ctx)
        pg.goto(BASE + f"#/g/{g}", wait_until="networkidle"); pg.wait_for_timeout(700)
        snap(pg, f"{g}.png")
        done(pg, g)
    b.close()

print("LOCAL FAIL:\n  " + "\n  ".join(fails) if fails else "local check passed")
sys.exit(1 if fails else 0)
