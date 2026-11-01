"""
The last games: whose turn it is shows their figure beside their name (Seven Eight Nine, Rogue
Thirteen and every game that says whose turn it is), and Never Have I Ever raises a glass for
whoever has done it. Two players with drawn figures, two guests.

  python3 scripts/moments3_check.py
"""
import os
import random
import string
import sys

import stage_check as sc
from moments_check import start, to_lobby
from playwright.sync_api import sync_playwright

BASE = sc.BASE
OUT = "/tmp/moment3-shots"
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
        pages = [sc.phone(browser)[1] for _ in range(4)]
        a, b, c, d = pages
        sc.signup_anime(a, f"al.{tag}@example.com", "Al", sc.chibi((255, 156, 197), (72, 33, 63), (49, 185, 255)))
        sc.signup_anime(b, f"bea.{tag}@example.com", "Bea", sc.chibi((140, 216, 255), (40, 36, 30), (255, 184, 46)))
        a.goto(BASE)
        a.wait_for_selector(".online-btn")
        a.click(".online-btn")
        a.wait_for_selector("#online-name")
        a.get_by_role("button", name="开一桌", exact=True).click()
        a.wait_for_selector(".lobby .faces", timeout=10000)
        code = a.evaluate("location.hash").split("/")[-1]
        for page, name in ((b, None), (c, "Cy"), (d, "Dee")):
            page.goto(BASE + f"#/r/{code}")
            page.wait_for_selector(".join-card, .lobby", timeout=10000)
            if page.locator(".join-card").count():
                if name:
                    page.fill(".join-card input", name)
                page.click(".join-card button[type=submit]")
            page.wait_for_selector(".lobby .faces", timeout=10000)
        a.wait_for_function("document.querySelectorAll('.lobby .face:not(.face-add)').length === 4", timeout=8000)

        for title, shot in (("Seven Eight Nine", "1-dice"), ("Rogue Thirteen", "2-rogue")):
            start(a, title)
            try:
                b.wait_for_selector(".turn-line .turn-fig .fig", timeout=8000)
                b.wait_for_timeout(900)
                check(True, f"{title}: whose turn it is stands beside their name")
            except Exception:
                check(False, f"{title}: the turn figure")
            b.screenshot(path=f"{OUT}/{shot}.png")
            to_lobby(a, (b, c, d))

        start(a, "Never Have I Ever")
        a.wait_for_timeout(1200)
        for pg in pages:
            if pg.locator("button.btn-lg:has-text('抽一张')").count():
                pg.click("button.btn-lg:has-text('抽一张')")
                break
        for i, pg in enumerate(pages):
            try:
                pg.wait_for_selector("button.btn-lg[aria-pressed]", timeout=8000)
                pg.locator("button.btn-lg[aria-pressed]").nth(0 if i < 3 else 1).click()
            except Exception as e:
                print("answer", i, str(e)[:60])
        try:
            a.wait_for_selector(".lineup-fig[data-pose='cheers']", timeout=12000)
            a.wait_for_timeout(900)
            check(a.locator(".lineup-fig[data-pose='cheers']").count() >= 2, "Never Have I Ever: whoever has done it raises a glass")
        except Exception:
            check(False, "Never Have I Ever: the toast")
        a.screenshot(path=f"{OUT}/3-never.png")
        browser.close()
    print(f"\n{len(fails)} failure(s)" if fails else "\nall passed")
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
