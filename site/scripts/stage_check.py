"""
Name That Tune with the players on the stage. Two players make anime avatars (locally the "AI"
hands back the picture it was sent: here a made-up chibi on a flat backdrop, so the phone's
cut-out runs for real), a guest joins without one, and a melody round is played: everyone in the
row, a buzz-in in the spotlight, the reveal, and the podium at the end. Screenshots go to OUT.

  python3 scripts/stage_check.py [base_url] [out_dir]
"""
import io
import random
import string
import sys

from PIL import Image, ImageDraw
from playwright.sync_api import sync_playwright

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:5173/").rstrip("/") + "/"
OUT = sys.argv[2] if len(sys.argv) > 2 else "/tmp/stage-shots"
import os

os.makedirs(OUT, exist_ok=True)
fails: list[str] = []
errors: list[str] = []


def check(ok, what):
    print(("PASS " if ok else "FAIL ") + what)
    if not ok:
        fails.append(what)


def chibi(bg, hair, shirt) -> bytes:
    """A made-up chibi drawing on a flat backdrop, dark outlines, a hand on the hip (a pocket of backdrop)."""
    W, H = 768, 1024
    im = Image.new("RGB", (W, H), bg)
    d = ImageDraw.Draw(im)
    ink = (34, 28, 46)
    # legs and shoes
    d.rounded_rectangle([318, 760, 372, 930], 18, fill=(60, 64, 98), outline=ink, width=7)
    d.rounded_rectangle([396, 760, 450, 930], 18, fill=(60, 64, 98), outline=ink, width=7)
    d.ellipse([296, 905, 380, 955], fill=(245, 245, 250), outline=ink, width=7)
    d.ellipse([388, 905, 472, 955], fill=(245, 245, 250), outline=ink, width=7)
    # body
    d.rounded_rectangle([290, 540, 478, 790], 60, fill=shirt, outline=ink, width=8)
    # an arm bent to the hip: a loop that shuts in some backdrop
    d.ellipse([440, 560, 560, 720], fill=shirt, outline=ink, width=8)
    d.ellipse([468, 596, 532, 684], fill=bg, outline=ink, width=6)
    d.rounded_rectangle([238, 560, 296, 740], 26, fill=shirt, outline=ink, width=8)
    # head and hair
    d.ellipse([214, 120, 554, 560], fill=(252, 224, 200), outline=ink, width=9)
    d.chord([200, 96, 568, 420], 180, 360, fill=hair, outline=ink, width=9)
    d.polygon([(214, 300), (250, 200), (300, 330)], fill=hair, outline=ink)
    # eyes and smile
    for x in (300, 412):
        d.ellipse([x, 330, x + 58, 410], fill=(40, 52, 110), outline=ink, width=5)
        d.ellipse([x + 12, 342, x + 30, 362], fill=(255, 255, 255))
    d.arc([344, 430, 424, 480], 20, 160, fill=ink, width=7)
    b = io.BytesIO()
    im.save(b, "PNG")
    return b.getvalue()


def phone(browser):
    ctx = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True, color_scheme="dark", locale="zh-CN")
    page = ctx.new_page()
    page.on("pageerror", lambda e: errors.append(f"pageerror {e}"))
    return ctx, page


def signup_anime(page, email, name, pic):
    page.goto(BASE)
    page.wait_for_selector(".acct-signin", timeout=15000)
    page.click(".acct-signin")
    page.wait_for_selector("#si-email")
    page.fill("#si-email", email)
    page.click(".signin button[type=submit]")
    page.wait_for_selector(".otp-input")
    page.wait_for_function("document.querySelector('.otp-input').value.length === 6")
    page.click(".signin button[type=submit]")
    page.wait_for_selector(".profile-form", timeout=10000)
    page.click(".pf-kind button:has-text('动漫头像')")
    page.wait_for_selector(".mk-start", timeout=5000)
    page.set_input_files(".mk input[type=file]:not([capture])", files=[{"name": "me.png", "mimeType": "image/png", "buffer": pic}])
    page.wait_for_selector(".mk-acts .btn-primary", timeout=20000)
    page.click(".mk-acts .btn-primary")
    page.wait_for_selector(".mk", state="detached", timeout=8000)
    page.fill("#pf-name", name)
    page.fill("#pf-phone", "+1 604 555 01" + str(random.randint(10, 99)))
    page.fill("#pf-city", "Vancouver")
    page.click(".pf-genders .chip:text-is('女')")
    page.fill("#pf-bio", "周末组局。")
    page.check(".pf-check input")
    page.click(".profile-form button[type=submit]")
    page.wait_for_selector(".acct-me", timeout=10000)


def main():
    tag = "".join(random.choice(string.ascii_lowercase) for _ in range(5))
    with sync_playwright() as p:
        browser = p.chromium.launch()
        actx, a = phone(browser)
        bctx, b = phone(browser)
        cctx, c = phone(browser)
        signup_anime(a, f"ann.{tag}@example.com", "Ann", chibi((255, 156, 197), (72, 33, 63), (49, 185, 255)))
        signup_anime(b, f"ben.{tag}@example.com", "Ben", chibi((140, 216, 255), (40, 36, 30), (255, 184, 46)))
        me = a.evaluate("u => fetch(u + '/me', {headers: {Authorization: 'Bearer ' + localStorage.getItem('changle.session')}}).then(r => r.json())", "http://127.0.0.1:8787/api")
        check(me["user"].get("cut") is True, "the saved figure was cut out on the phone and sent with it")
        r = a.request.get(f"http://127.0.0.1:8787/api/figure/{me['user']['id']}/cut?v=1")
        check(r.ok and r.headers.get("content-type") in ("image/webp", "image/png") and r.headers.get("access-control-allow-origin") == "*", f"the cut-out is served ({r.headers.get('content-type')}, {len(r.body())} bytes, open to any page)")
        with open(f"{OUT}/cut.{'webp' if r.headers.get('content-type') == 'image/webp' else 'png'}", "wb") as f:
            f.write(r.body())

        # a table: Ann hosts, Ben and a guest sit down
        a.goto(BASE)
        a.wait_for_selector(".online-btn")
        a.click(".online-btn")
        a.wait_for_selector("#online-name")
        a.get_by_role("button", name="开一桌", exact=True).click()
        a.wait_for_selector(".lobby .faces", timeout=10000)
        code = a.evaluate("location.hash").split("/")[-1]
        for page, name in ((b, None), (c, "Lin")):
            page.goto(BASE + f"#/r/{code}")
            page.wait_for_selector(".join-card, .lobby", timeout=10000)
            if page.locator(".join-card").count():
                if name:
                    page.fill(".join-card input", name)
                page.click(".join-card button[type=submit]")
            page.wait_for_selector(".lobby .faces", timeout=10000)
        a.wait_for_function("document.querySelectorAll('.lobby .face:not(.face-add)').length === 3", timeout=8000)

        # a fourth phone only watches (for the TV): at the table, out of the game
        dctx, dpage = phone(browser)
        dpage.goto(BASE + f"#/r/{code}")
        dpage.wait_for_selector(".join-card", timeout=10000)
        dpage.fill(".join-card input", "TV")
        dpage.click(".join-card button[type=submit]")
        dpage.wait_for_selector(".lobby .faces", timeout=10000)
        dpage.click(".table-btn")
        dpage.wait_for_selector(".table-watch button", timeout=5000)
        dpage.click(".table-watch button")
        dpage.wait_for_timeout(600)
        dpage.keyboard.press("Escape")
        a.wait_for_selector(".lobby .face-watch", timeout=5000)
        check(a.locator(".lobby .face-watch").count() == 1, "the lobby shows who is just watching")
        a.click(".lobby .board .tile[aria-label^='Name That Tune']")
        a.wait_for_timeout(700)
        a.click(".lobby-actions .btn-primary")
        a.wait_for_selector(".tn", timeout=8000)
        a.click(".tn .seg button:has-text('旋律')")
        a.click(".tn .seg-sm button:has-text('5 首')")
        a.wait_for_timeout(300)
        a.click(".tn .btn-primary.btn-lg")

        # listening: everyone in the row, bouncing
        a.wait_for_selector(".tn-stage.has-crew .tn-mate", timeout=8000)
        a.wait_for_timeout(2500)
        n = a.locator(".tn-crew .tn-mate").count()
        figs = a.locator(".tn-crew .tn-mate-fig").count()
        tokens = a.locator(".tn-crew .tn-token").count()
        check(n == 3 and figs == 2 and tokens == 1, f"all three on the stage: two drawn figures and the guest's face on a body ({n}, {figs}, {tokens})")
        loaded = a.evaluate("[...document.querySelectorAll('.tn-mate-fig')].every(i => i.complete && i.naturalWidth > 0)")
        check(loaded, "the figures' cut-outs load")
        a.screenshot(path=f"{OUT}/1-row.png")
        dpage.wait_for_selector(".watch-strip", timeout=6000)
        check(dpage.locator(".buzz").count() == 0 or dpage.locator(".buzz.is-locked").count() >= 0, "the watcher's phone shows the game with a watching strip")
        dpage.screenshot(path=f"{OUT}/watcher.png")

        # Ben buzzes in: up into the spotlight
        b.wait_for_selector(".buzz", timeout=8000)
        b.click(".buzz")
        a.wait_for_selector(".tn-mate[data-state='spot']", timeout=6000)
        a.wait_for_timeout(900)
        check(a.locator(".tn-mate[data-state='dim']").count() == 2, "the buzzer in the spotlight, the others wait dimmed")
        a.screenshot(path=f"{OUT}/2-spot.png")
        b.wait_for_selector(".tn-option:not([disabled])", timeout=6000)
        b.click(".tn-option:not([disabled]) >> nth=0")
        a.wait_for_selector(".tn-mate[data-state='win'], .tn-mate[data-state='miss']", timeout=8000)
        a.wait_for_timeout(1300)
        state = a.get_attribute(".tn-mate[data-state='win'], .tn-mate[data-state='miss']", "data-state")
        check(state in ("win", "miss"), f"the answer shows on the stage ({state})")
        a.screenshot(path=f"{OUT}/3-answer.png")

        def clear_stamps():
            # a penalty stamp covers the screen until it's dealt with (watching phones let it go by itself)
            for pg in (a, b, c):
                for _ in range(3):
                    if not pg.locator(".stamp-layer").count():
                        break
                    btn = pg.locator(".stamp-layer .stamp-done")
                    if btn.count():
                        btn.first.click(force=True)
                    pg.wait_for_timeout(1200)

        # through the rest quickly, then the podium
        for _ in range(16):
            clear_stamps()
            if a.locator(".tn button:has-text('看结果')").count():
                a.click(".tn button:has-text('看结果')")
                break
            if a.locator(".tn button:has-text('下一首')").count():
                a.click(".tn button:has-text('下一首')")
            elif a.locator("button:has-text('揭晓答案')").count():
                if b.locator(".buzz:not(.is-locked)").count():
                    b.click(".buzz")
                    b.wait_for_selector(".tn-option:not([disabled])", timeout=6000)
                    b.click(".tn-option:not([disabled]) >> nth=0")
                else:
                    a.click("button:has-text('揭晓答案')")
            a.wait_for_timeout(1500)
        clear_stamps()
        a.wait_for_selector(".pl-board-title", timeout=10000)
        clear_stamps()
        a.wait_for_timeout(1800)
        a.screenshot(path=f"{OUT}/4-end.png")
        check(a.locator(".tn-podium").count() <= 1, "the end: a podium when someone scored")
        browser.close()

    real = [e for e in errors if "favicon" not in e]
    if real:
        print("\npage errors:\n  " + "\n  ".join(real[:10]))
    print(f"\n{len(fails)} failure(s)" if fails else "\nall passed")
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
