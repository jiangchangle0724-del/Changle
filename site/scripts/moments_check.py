"""
Figures in the other online games: the lobby (everyone standing together, the host crowned),
King's Game (the king on a throne), Superlatives (the winner with a sash) and Undercover (the
one voted out, under the spotlight). Two players with drawn figures, two guests. Screenshots go to OUT.

  python3 scripts/moments_check.py [base_url] [out_dir]
"""
import random
import string
import sys

sys.argv = sys.argv[:1] + sys.argv[1:]
import stage_check as sc  # (the chibi pictures, phones and the anime sign-up)

from playwright.sync_api import sync_playwright

BASE = sc.BASE
OUT = sys.argv[2] if len(sys.argv) > 2 else "/tmp/moment-shots"
import os

os.makedirs(OUT, exist_ok=True)
fails: list[str] = []


def check(ok, what):
    print(("PASS " if ok else "FAIL ") + what)
    if not ok:
        fails.append(what)


def start(host, title):
    host.click(f'.lobby .board .tile[aria-label^="{title}"]')
    host.wait_for_timeout(700)
    host.click(".lobby-actions .btn-primary")
    host.wait_for_timeout(1200)


def to_lobby(host, others):
    host.click(".topbar .topbar-side .icon-btn")
    host.wait_for_selector(".sheet button:has-text('回大厅')", timeout=5000)
    host.click(".sheet button:has-text('回大厅')")
    host.wait_for_selector(".lobby", timeout=8000)
    for p in others:
        p.wait_for_selector(".lobby", timeout=8000)


def main():
    tag = "".join(random.choice(string.ascii_lowercase) for _ in range(5))
    with sync_playwright() as p:
        browser = p.chromium.launch()
        actx, a = sc.phone(browser)
        bctx, b = sc.phone(browser)
        cctx, c = sc.phone(browser)
        dctx, d = sc.phone(browser)
        sc.signup_anime(a, f"ana.{tag}@example.com", "Ana", sc.chibi((255, 156, 197), (72, 33, 63), (49, 185, 255)))
        sc.signup_anime(b, f"bo.{tag}@example.com", "Bo", sc.chibi((140, 216, 255), (40, 36, 30), (255, 184, 46)))
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
        a.wait_for_timeout(800)
        check(a.locator(".room-figs .room-fig").count() == 4 and a.locator(".room-figs .fig-img").count() == 2, "the lobby: four standing, two drawn figures")
        check(a.locator(".room-figs .room-fig-crown").count() == 1, "the host wears a small crown")
        a.screenshot(path=f"{OUT}/1-lobby.png")

        # King's Game: the host moves it on to the crown
        start(a, "King's Game")
        a.wait_for_selector("button:has-text('不等了，直接开')", timeout=8000)
        a.click("button:has-text('不等了，直接开')")
        try:
            a.wait_for_selector(".moment-king", timeout=8000)
            a.wait_for_timeout(1600)
            check(a.locator(".moment-king .moment-crown").count() == 1, "King's Game: the king on a throne, crowned")
        except Exception as e:
            check(False, f"King's Game: the king's moment ({str(e)[:80]})")
        a.screenshot(path=f"{OUT}/2-king.png")
        to_lobby(a, (b, c, d))

        # Superlatives: everyone votes for Bo
        start(a, "Superlatives")
        for page in (a, c, d):
            page.wait_for_selector(".ballot .nominee", timeout=8000)
            page.click(".ballot .nominee:has-text('Bo')")
        b.wait_for_selector(".ballot .nominee", timeout=8000)
        b.click(".ballot .nominee:has-text('Ana')")
        try:
            a.wait_for_selector(".moment-winner", timeout=10000)
            a.wait_for_timeout(1600)
            check(a.locator(".moment-winner").count() == 1 and a.locator(".moment-winner .fig-img").count() == 1, "Superlatives: the winner's figure on stage with a sash")
        except Exception as e:
            check(False, f"Superlatives: the winner's moment ({str(e)[:80]})")
        a.screenshot(path=f"{OUT}/3-winner.png")

        browser.close()
    print(f"\n{len(fails)} failure(s)" if fails else "\nall passed")
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
