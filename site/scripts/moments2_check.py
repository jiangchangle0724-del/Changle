"""
Figures in Truth or Dare (whoever the bottle stops on, in a small spotlight), Post-it (the note
on each figure's forehead), Limbo (everyone under the bar, leaning back) and Freeze Dance
(dancing, frozen, the ones who moved toppling). Two players with drawn figures, two guests.

  python3 scripts/moments2_check.py [base_url] [out_dir]
"""
import os
import random
import string
import sys

import stage_check as sc
from moments_check import start, to_lobby
from playwright.sync_api import sync_playwright

BASE = sc.BASE
OUT = sys.argv[2] if len(sys.argv) > 2 else "/tmp/moment2-shots"
os.makedirs(OUT, exist_ok=True)
fails: list[str] = []


def check(ok, what):
    print(("PASS " if ok else "FAIL ") + what)
    if not ok:
        fails.append(what)


def main():
    tag = "".join(random.choice(string.ascii_lowercase) for _ in range(5))
    with sync_playwright() as p:
        browser = p.chromium.launch()
        pages = []
        for _ in range(4):
            pages.append(sc.phone(browser)[1])
        a, b, c, d = pages
        sc.signup_anime(a, f"amy.{tag}@example.com", "Amy", sc.chibi((255, 156, 197), (72, 33, 63), (49, 185, 255)))
        sc.signup_anime(b, f"bob.{tag}@example.com", "Bob", sc.chibi((140, 216, 255), (40, 36, 30), (255, 184, 46)))
        a.goto(BASE)
        a.wait_for_selector(".online-btn")
        a.click(".online-btn")
        a.wait_for_selector("#online-name")
        a.get_by_role("button", name="开一桌", exact=True).click()
        a.wait_for_selector(".lobby .faces", timeout=10000)
        code = a.evaluate("location.pathname").split("/")[-1]
        for page, name in ((b, None), (c, "Cy"), (d, "Dee")):
            page.goto(BASE + f"#/r/{code}")
            page.wait_for_selector(".join-card, .lobby", timeout=10000)
            if page.locator(".join-card").count():
                if name:
                    page.fill(".join-card input", name)
                page.click(".join-card button[type=submit]")
            page.wait_for_selector(".lobby .faces", timeout=10000)
        a.wait_for_function("document.querySelectorAll('.lobby .face:not(.face-add)').length === 4", timeout=8000)

        # Truth or Dare: the spinner spins; whoever it stops on steps into a spotlight
        start(a, "Truth or Dare")
        spinner = None
        for pg in pages:
            if pg.locator("button:has-text('转瓶子')").count():
                spinner = pg
        if spinner is None:
            pages[0].wait_for_timeout(1500)
            for pg in pages:
                if pg.locator("button:has-text('转瓶子')").count():
                    spinner = pg
        if spinner:
            spinner.click("button:has-text('转瓶子')")
            try:
                a.wait_for_selector(".moment-picked", timeout=12000)
                a.wait_for_timeout(1500)
                check(True, "Truth or Dare: whoever the bottle stops on is in a small spotlight")
            except Exception:
                check(False, "Truth or Dare: the picked one's spotlight")
            a.screenshot(path=f"{OUT}/1-truth.png")
        else:
            check(False, "Truth or Dare: nobody could spin")
        to_lobby(a, (b, c, d))

        # Post-it: everyone writes a note for the next person; then the wall
        start(a, "Post-it Note")
        for i, pg in enumerate(pages):
            pg.wait_for_selector(".pi-note-input", timeout=8000)
            pg.fill(".pi-note-input", ["孙悟空", "Pikachu", "埃菲尔铁塔", "Batman"][i])
            pg.click(".pi-note-form button[type=submit]")
        try:
            a.wait_for_selector(".forehead.has-figure", timeout=10000)
            a.wait_for_timeout(1200)
            check(a.locator(".forehead.has-figure .fig").count() == 4, "Post-it: four figures, each with the note on the forehead")
        except Exception:
            check(False, "Post-it: the figures' wall")
        a.screenshot(path=f"{OUT}/2-postit.png")
        to_lobby(a, (b, c, d))

        # Limbo: under the bar, leaning back
        start(a, "Limbo")
        a.wait_for_selector(".lb .btn-primary.btn-lg", timeout=8000)
        a.click(".lb .btn-primary.btn-lg")
        try:
            a.wait_for_selector(".limbo-people .lineup-fig[data-pose='lean']", timeout=12000)
            a.wait_for_timeout(1200)
            check(a.locator(".limbo-people .lineup-fig").count() == 4, "Limbo: everyone still in stands under the bar, leaning back")
        except Exception:
            check(False, "Limbo: the leaning row")
        a.screenshot(path=f"{OUT}/3-limbo.png")
        b.click("button:has-text('我过了')")
        c.click("button:has-text('没过')")
        a.wait_for_timeout(1500)
        a.screenshot(path=f"{OUT}/3b-limbo.png")
        check(a.locator(".limbo-people .lineup-fig[data-pose='pass']").count() >= 1 and a.locator(".limbo-people .lineup-fig[data-pose='fail']").count() >= 1, "Limbo: one made it (a tick), one fell over")
        to_lobby(a, (b, c, d))

        # Freeze Dance: dancing
        start(a, "Freeze Dance")
        a.wait_for_selector(".fz .btn-primary.btn-lg", timeout=8000)
        a.click(".fz .btn-primary.btn-lg")
        try:
            a.wait_for_selector(".lineup-fig[data-pose='dance']", timeout=12000)
            a.wait_for_timeout(700)
            check(a.locator(".lineup-fig[data-pose='dance']").count() == 4, "Freeze Dance: everyone dancing")
        except Exception:
            check(False, "Freeze Dance: the dancing row")
        a.screenshot(path=f"{OUT}/4-freeze.png")
        browser.close()
    print(f"\n{len(fails)} failure(s)" if fails else "\nall passed")
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
