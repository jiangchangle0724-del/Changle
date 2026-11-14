"""
The 3D figure (/me/figure: Steve on Nov 13, 先做小样; Nov 14, 捏脸 on MakeHuman's human), on a
phone-sized browser.

This machine has no graphics chip (its browser draws WebGL in software), so the page is told to
take any WebGL (window.__figAnyGl, dev builds only) and the figure comes on as it would on a phone.

What it checks: untold, the page explains that this device can't draw 3D and never downloads
three.js; told, the man's figure loads (gzipped) and draws (frames counted); the 21 moves are chips
of at least 48 px, each playing its own clip (solved on the page: the file has none); they hold
their props (sword, shades, phone, beer, headphones), the selfie flashes, sleep lies down before its
Zzz float up with its eyes shut, fainting falls first and then lies with its eyes shut, crying
sheds tears with a sad face, the heart smiles, dancing sends notes up, the thumbs-up winks, standing
blinks; dragging sideways turns it. (That the moves keep their arms out of the body is
tests/figure.test.ts, in CI.) Then
捏脸: the camera comes up to the face, the sliders (face 11, eyes 8, nose 6, mouth 5, at least
44 px) reshape it, the skin and hair colours tint it, a hairstyle comes from its own file, a buzz
cut has none, the woman's body swaps in, random and reset work, and all of it is still there after
a reload. In English too; the back button goes back; the owner's /me page has the link (needs
the rooms server with MASTER_EMAIL=master@example.test in site/worker/.dev.vars, skipped when the
server is down); no error is thrown in any page. Screenshots go to OUT.

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
        check(pg.locator(".fig-moves .chip").count() == 21 and pg.locator(".fig-moves .chip:not(:disabled)").count() == 0, "the 21 moves are shown but off")
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
        check(any(u.endswith("/models/figure/male.glb.gz") for u in pg._js), "the model came from /models/figure/male.glb.gz")
        check(not any("/models/figure/hair/" in u for u in pg._js), "no other hairstyle came down yet")
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
        check(chips.count() == 21, f"21 moves ({chips.count()})")
        check(chips.all_inner_texts()[:5] == ["站着", "摆酷", "照相", "睡觉", "挥刀"], "站着, then Steve's four: 摆酷 照相 睡觉 挥刀")
        boxes = chips.evaluate_all("els => els.map(e => e.getBoundingClientRect().height)")
        check(all(h >= 48 for h in boxes), f"every move is at least 48 px tall (smallest {min(boxes):.0f})")
        check(pg.locator(".fig-moves .chip[aria-pressed='true']").inner_text() == "站着", "站着 is pressed at first")
        check(pg.evaluate("window.__figMove") == "stand", "the figure stands at first")
        pg.evaluate("window.__figBlinks = 0")
        pg.wait_for_function("window.__figBlinks >= 1", timeout=12000)
        check(True, "standing, it blinks")
        played = []
        for i in range(chips.count()):
            label = chips.nth(i).inner_text()
            chips.nth(i).click()
            pg.wait_for_timeout(120)
            played.append((label, pg.evaluate("window.__figMove")))
        ids = [m for _, m in played]
        check(len(set(ids)) == 21, f"each chip plays a clip of its own ({len(set(ids))} different)")
        check(pg.locator(".fig-moves .chip[aria-pressed='true']").inner_text() == "思考", "the last chip pressed is the pressed one")
        clips = [c[0] for c in pg.evaluate("window.__figClips")]
        check(set(ids) <= set(clips) and "sleep_in" in clips and "faint_in" in clips, f"every move has its clip ({len(clips)} clips)")

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
        pg.wait_for_function("window.__figFace.smile > 0.7", timeout=3000)
        check(True, "比心 smiles")
        pg.evaluate("window.__figFlashes = 0")
        tap("照相", 0)
        pg.wait_for_function("window.__figFlashes >= 1", timeout=8000)
        check(pg.evaluate("window.__figHeld") == ["phone"], "照相 holds the phone, and its flash goes")
        tap("睡觉", 300)
        check(pg.evaluate("window.__figLooping") is False, "睡觉 lies down first (its intro plays once)")
        pg.wait_for_function("window.__figLooping === true", timeout=8000)
        pg.wait_for_function("window.__figFloaters > 0", timeout=5000)
        check(True, "then it sleeps, and the Zzz float up")
        pg.wait_for_function("window.__figFace.blinkL > 0.9 && window.__figFace.blinkR > 0.9", timeout=3000)
        check(True, "asleep, its eyes are shut")
        pg.screenshot(path=f"{OUT}/figure-sleep.png")
        tap("大哭", 0)
        pg.wait_for_function("window.__figFloaters >= 4", timeout=3000)
        check(True, "大哭 sheds tears")
        pg.wait_for_function("window.__figFace.browsSad > 0.8 && window.__figFace.sadMouth > 0.7 && window.__figFace.blinkL < 0.5", timeout=3000)
        check(True, "大哭 pulls a sad face, its eyes open again")
        pg.screenshot(path=f"{OUT}/figure-cry.png")
        tap("晕倒", 300)
        check(pg.evaluate("window.__figLooping") is False, "晕倒 falls first (its intro plays once)")
        pg.wait_for_function("window.__figLooping === true", timeout=8000)
        pg.wait_for_function("window.__figFace.blinkL > 0.9 && window.__figFace.blinkR > 0.9", timeout=3000)
        check(True, "then it lies there, its eyes shut")
        pg.screenshot(path=f"{OUT}/figure-faint.png")
        tap("跳舞", 0)
        pg.wait_for_function("window.__figFloaters > 0", timeout=4000)
        check(True, "跳舞 sends notes up")
        tap("点赞", 0)
        pg.wait_for_function("window.__figFace.blinkR > 0.9 && window.__figFace.blinkL < 0.5", timeout=3000)
        check(True, "点赞 winks")
        pg.screenshot(path=f"{OUT}/figure-thumbs.png")
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

        # 捏脸: the camera comes up to the face, and it stands still
        z_body = pg.evaluate("window.__figCamZ")
        pg.locator("[role=tab]", has_text="捏脸").click()
        pg.wait_for_function("window.__figView === 'face' && window.__figMove === 'stand'", timeout=3000)
        pg.wait_for_timeout(1500)
        z_face = pg.evaluate("window.__figCamZ")
        check(z_face < 1.2 < z_body, f"捏脸 brings the camera up to the face ({z_body} m away, then {z_face})")
        check(pg.locator(".fig-moves").count() == 0 and pg.locator("#fig-face[role=tabpanel]").count() == 1, "捏脸 shows its own panel instead of the moves")
        parts = pg.locator(".fig-sculpt [role=radiogroup][aria-label='捏哪里'] [role=radio]")
        check(parts.all_inner_texts() == ["脸型", "眼睛", "鼻子", "嘴", "肤色", "发型"], f"six parts to shape ({parts.all_inner_texts()})")
        counts = {}
        for part in ["脸型", "眼睛", "鼻子", "嘴"]:
            parts.filter(has_text=part).click()
            counts[part] = pg.locator(".fig-slider input[type=range]").count()
        check(counts == {"脸型": 11, "眼睛": 8, "鼻子": 6, "嘴": 5}, f"sliders: {counts}")
        tall = pg.locator(".fig-slider input[type=range]").evaluate_all("els => els.map(e => e.getBoundingClientRect().height)")
        check(min(tall) >= 44, f"every slider is at least 44 px tall ({min(tall):.0f})")
        base_sum = pg.evaluate("window.__figShapeSum")
        parts.filter(has_text="鼻子").click()
        pg.locator("input[data-shape=noseWidth]").fill("100")
        pg.locator("input[data-shape=noseLength]").fill("-60")
        pg.wait_for_function(f"window.__figShapeSum !== {base_sum}", timeout=3000)
        check(True, "the nose's sliders reshape the face")
        pg.screenshot(path=f"{OUT}/figure-sculpt-nose.png")
        parts.filter(has_text="肤色").click()
        skin0 = pg.evaluate("window.__figSkin")
        pg.locator("[data-skin='7']").click()
        pg.wait_for_function(f"window.__figSkin !== '{skin0}'", timeout=3000)
        check(pg.locator("[data-skin='7']").get_attribute("aria-checked") == "true", "a skin swatch tints the skin, and stays picked")
        parts.filter(has_text="发型").click()
        pg.wait_for_function("window.__figView === 'bust'", timeout=3000)
        check(True, "for hair, the camera steps back to the head and shoulders")
        pg.locator("[data-hair=bob01]").click()
        pg.wait_for_function("window.__figHair === 'bob01'", timeout=30000)
        check(any(u.endswith("/models/figure/hair/bob01-male.glb.gz") for u in pg._js), "the bob comes from its own file")
        pg.locator("[data-hair-color='8']").click()
        pg.wait_for_timeout(1200)
        pg.screenshot(path=f"{OUT}/figure-sculpt-hair.png")
        pg.locator("[data-hair=none]").click()
        pg.wait_for_function("window.__figHair === 'none'", timeout=3000)
        check(True, "寸头 takes the hair off")
        pg.locator("[data-hair=short02]").click()
        pg.wait_for_function("window.__figHair === 'short02'", timeout=3000)
        check(sum(1 for u in pg._js if "/models/figure/hair/" in u) == 1, "its own hair back, without another download")
        pg.locator(".fig-sculpt [role=radio]", has_text="女").click()
        pg.wait_for_function("window.__figSex === 'female' && window.__figHair === 'long01'", timeout=30000)
        check(any(u.endswith("/models/figure/female.glb.gz") for u in pg._js), "女 swaps in the woman's body, with her own hair")
        pg.wait_for_timeout(1500)
        pg.screenshot(path=f"{OUT}/figure-sculpt-female.png")
        sum_f = pg.evaluate("window.__figShapeSum")
        pg.locator(".fig-actions button", has_text="随机").click()
        pg.wait_for_timeout(800)
        changed = pg.evaluate(f"window.__figShapeSum !== {sum_f}")
        check(changed, "随机 gives another face")
        pg.locator(".fig-actions button", has_text="还原").click()
        pg.wait_for_function("window.__figHair === 'long01'", timeout=30000)
        pg.wait_for_timeout(600)
        look = pg.evaluate("JSON.parse(localStorage.getItem('figure.look'))")
        check(look and look["sex"] == "female" and look["shape"] == {} and look["hair"] == "long01", f"还原 goes back to her first look, kept on the phone ({look})")
        parts.filter(has_text="眼睛").click()
        pg.locator("input[data-shape=eyeSize]").fill("70")
        parts.filter(has_text="发型").click()
        pg.locator("[data-hair=ponytail01]").click()
        pg.wait_for_function("window.__figHair === 'ponytail01'", timeout=30000)
        pg.wait_for_timeout(500)
        pg.reload(wait_until="load")
        pg.wait_for_function("window.__figIs === 'on' && window.__figHair === 'ponytail01'", timeout=60000)
        look = pg.evaluate("JSON.parse(localStorage.getItem('figure.look'))")
        check(pg.evaluate("window.__figSex") == "female" and look["shape"].get("eyeSize") == 0.7, "after a reload she's still there: the body, the eyes, the ponytail")
        pg.locator("[role=tab]", has_text="捏脸").click()
        pg.locator(".fig-sculpt [role=radio]", has_text="眼睛").click()
        check(pg.locator("input[data-shape=eyeSize]").input_value() == "70", "and the slider shows it")
        pg.locator("[role=tab]", has_text="动作").click()
        pg.wait_for_function("window.__figView === 'body'", timeout=3000)
        check(True, "back on 动作, the camera shows the whole figure")

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
        check(names[:5] == ["Stand", "Cool", "Selfie", "Sleep", "Sword"] and "Fist salute" in names, f"the moves are in English ({names[:5]})")
        check(pg.locator("[role=tab]").all_inner_texts() == ["Moves", "Face"], "the tabs are in English")
        check("A prototype" in pg.inner_text(".fig-intro"), "the introduction is in English")
        pg.locator("[role=tab]", has_text="Face").click()
        check(pg.locator(".fig-sculpt [role=radiogroup][aria-label='What to shape'] [role=radio]").all_inner_texts() == ["Face", "Eyes", "Nose", "Mouth", "Skin", "Hair"], "the parts are in English")
        check(pg.locator(".fig-slider span").first.inner_text() == "Width" and pg.locator(".fig-actions button").all_inner_texts() == ["Random", "Reset"], "the sliders and buttons are in English")
        pg.locator("[role=tab]", has_text="Moves").click()
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
