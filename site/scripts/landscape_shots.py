"""Every game on a phone held sideways (844x390): get to the playing screen, screenshot, report overflow.

usage: python3 scripts/landscape_shots.py [base_url] [out_dir]
"""
import json, os, re, sys
from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:4173/"
OUT = sys.argv[2] if len(sys.argv) > 2 else "landscape-shots"
os.makedirs(OUT, exist_ok=True)
PLAYERS = [{"id": f"p{i}", "name": n} for i, n in enumerate(["Steve", "小雨", "Kevin", "阿强", "Lily", "大鹏"])]
report = []

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

def finish(pg, name):
    pg.wait_for_timeout(500)
    info = pg.evaluate("""() => {
      const de = document.documentElement;
      const wide = de.scrollWidth - innerWidth;
      const body = document.querySelector('.game-body, .net-body');
      const tall = body ? body.scrollHeight - body.clientHeight : 0;
      const off = [...document.querySelectorAll('button, .btn, .chip')].filter(b => { const r = b.getBoundingClientRect(); return r.width > 0 && (r.right > innerWidth + 1 || r.bottom > innerHeight + 1 || r.left < -1); }).length;
      return {coarse: matchMedia('(pointer: coarse)').matches, land: matchMedia('(orientation: landscape) and (max-height: 520px)').matches, wide, tall, off};
    }""")
    pg.screenshot(path=os.path.join(OUT, name + ".png"))
    report.append((name, info, pg._errs[:2]))
    pg.close()

def go(ctx, route, name, steps=None, wait=700):
    pg = page(ctx)
    pg.goto(BASE + route, wait_until="networkidle"); pg.wait_for_timeout(wait)
    try:
        if steps: steps(pg)
    except Exception as e:
        pg._errs.append("step failed: " + str(e)[:100])
    finish(pg, name)

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 844, "height": 390}, device_scale_factor=2, has_touch=True, is_mobile=True)

    go(ctx, "", "home", wait=1500)
    go(ctx, "#/g/dice", "dice", lambda pg: (pg.get_by_role("button", name="掷骰子").click(), pg.wait_for_timeout(1400)))
    go(ctx, "#/g/draw", "draw", lambda pg: (pg.locator(".setup-card .btn").first.click(), pg.wait_for_timeout(500), pg.locator(".cloche-dome").click(), pg.wait_for_timeout(1100), pg.get_by_role("button", name="开始画").click(), pg.wait_for_timeout(700)))
    go(ctx, "#/g/rogue", "rogue", lambda pg: (pg.locator(".pcard-back").click(), pg.wait_for_timeout(1300)))
    go(ctx, "#/g/truth", "truth", lambda pg: (pg.get_by_role("button", name="转瓶子").click(), pg.wait_for_timeout(5200), pg.get_by_role("button", name="真心话").click(), pg.wait_for_timeout(500), pg.locator(".cloche-dome").click(), pg.wait_for_timeout(1000)))
    go(ctx, "#/g/undercover", "undercover")
    go(ctx, "#/g/king", "king")
    go(ctx, "#/g/prompts", "prompts")
    go(ctx, "#/g/wheel", "wheel")
    go(ctx, "#/g/superlatives", "superlatives", lambda pg: (pg.get_by_role("button", name="开始颁奖").click(), pg.wait_for_timeout(800)))
    go(ctx, "#/g/punchline", "punchline", lambda pg: (pg.get_by_role("button", name="开始").click(), pg.wait_for_timeout(800)))
    go(ctx, "#/g/postit", "postit", lambda pg: (pg.locator(".deck-pick").nth(1).click(), pg.get_by_role("button", name="45 秒").click(), pg.get_by_role("button", name="开始", exact=True).click(), pg.wait_for_timeout(800)))
    go(ctx, "#/g/freeze", "freeze", lambda pg: (pg.get_by_role("button", name="放音乐").click(), pg.wait_for_timeout(1500)))
    go(ctx, "#/g/limbo", "limbo", lambda pg: (pg.get_by_role("button", name="放音乐，开始").click(), pg.wait_for_timeout(800)))
    go(ctx, "#/g/tune", "tune-setup")
    go(ctx, "#/g/tune", "tune-play", lambda pg: (pg.locator(".game-actions .btn-primary").first.click(), pg.wait_for_timeout(1500)))
    go(ctx, "#/g/euchre", "euchre", lambda pg: (pg.locator(".btn-primary").first.click(), pg.wait_for_timeout(1500)))
    go(ctx, "#/g/trip", "trip", wait=1500)
    b.close()

for name, info, errs in report:
    flag = " <-- overflow" if info["wide"] > 0 or info["off"] > 0 else ""
    print(f"{name:14} coarse={info['coarse']} land={info['land']} wide={info['wide']} tall={info['tall']} off={info['off']}{flag} {errs if errs else ''}")
