"""Countdowns under timed dares and king's commands (components/DareTimer.tsx), on one phone.

Run with Vite running (npm run dev): python scripts/dare_timer_check.py [--base http://127.0.0.1:5173]
Python Playwright, Chromium, a 390x844 touch phone. No server, account or network needed: the decks
are narrowed to timed cards in the page (Vite serves each module once, so the game sees the change).
Screenshots go to local-shots/dare-timer/. Exits 1 on any failed check or console error.
"""
import argparse
import json
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

OUT = Path(__file__).resolve().parents[1] / "local-shots" / "dare-timer"
PLAYERS = [{"id": f"p{i}", "name": n} for i, n in enumerate(["小明", "Ann", "Ben"])]
FAILURES = []


def check(cond, message):
    print(("PASS " if cond else "FAIL ") + message, flush=True)
    if not cond:
        FAILURES.append(message)


def phone(browser, lang):
    ctx = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True,
                              has_touch=True, locale="zh-CN" if lang == "zh" else "en-CA")
    settings = {"lang": lang, "sound": False, "music": False, "customPenalty": "", "players": PLAYERS}
    ctx.add_init_script("localStorage.setItem('lazysusan.settings.v1', %s); sessionStorage.setItem('changle.entered', '1');"
                        % json.dumps(json.dumps(settings)))
    pg = ctx.new_page()
    errors = []
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    return ctx, pg, errors


def open_game(pg, base, module, narrow, path):
    """Load the site, narrow a deck to the cards we want, then go to the game without reloading."""
    pg.goto(base + "/", wait_until="networkidle")
    pg.evaluate("""async ([module, narrow]) => {
      const m = await import(module);
      const [name, test] = narrow;
      const keep = m[name].filter((c) => new RegExp(test).test(c.zh));
      m[name].splice(0, m[name].length, ...keep);
    }""", [module, narrow])
    pg.evaluate("path => { history.pushState({ inSite: true }, '', path); dispatchEvent(new Event('changle:navigate')); }", path)


def ring(pg):
    return pg.locator(".dare-timer .timer-text").inner_text().strip()


def status(pg):
    return pg.locator(".dare-timer-status").inner_text().strip()


def truth_dare(browser, base, lang, narrow):
    ctx, pg, errors = phone(browser, lang)
    zh = lang == "zh"
    open_game(pg, base, "/src/data/truthDare.ts", ["DARES", narrow], "/g/truth-or-dare/play")
    pg.locator(".bottle-actions .btn-primary").click()
    pg.get_by_role("button", name="大冒险" if zh else "Dare", exact=True).click(timeout=15000)
    pg.locator(".cloche-dome").click()
    timer = pg.get_by_role("group", name="倒计时" if zh else "Countdown")
    timer.wait_for(timeout=5000)
    pg.wait_for_timeout(500)
    return ctx, pg, errors, timer


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", default="http://127.0.0.1:5173")
    base = parser.parse_args().base.rstrip("/")
    OUT.mkdir(parents=True, exist_ok=True)
    all_errors = []
    with sync_playwright() as p:
        browser = p.chromium.launch()

        # 1. a ten-second dare, in Chinese: start, pause, resume, time's up, again
        ctx, pg, errors, timer = truth_dare(browser, base, "zh", "十秒")
        check(status(pg) == "倒计时 10 秒" and ring(pg) == "10", f"truth or dare: waits at 10 seconds ({status(pg)} / {ring(pg)})")
        pg.screenshot(path=str(OUT / "truth-ready-zh.png"), full_page=True)
        pg.get_by_role("button", name="开始", exact=True).click()
        pg.wait_for_timeout(2300)
        running = int(ring(pg))
        check(status(pg) == "计时中" and 6 <= running <= 8, f"counting down after Start ({running})")
        pg.screenshot(path=str(OUT / "truth-running-zh.png"), full_page=True)
        pg.get_by_role("button", name="暂停", exact=True).click()
        held = ring(pg)
        pg.wait_for_timeout(1500)
        check(status(pg) == "已暂停" and ring(pg) == held, f"Pause holds the time ({held})")
        pg.screenshot(path=str(OUT / "truth-paused-zh.png"), full_page=True)
        pg.get_by_role("button", name="继续", exact=True).click()
        pg.wait_for_function("() => document.querySelector('.dare-timer-status')?.textContent.includes('时间到')", timeout=12000)
        check(ring(pg) == "0", "Resume runs on to time's up")
        pg.screenshot(path=str(OUT / "truth-done-zh.png"), full_page=True)
        pg.get_by_role("button", name="再来一次", exact=True).click()
        pg.wait_for_timeout(300)
        check(status(pg) == "倒计时 10 秒" and ring(pg) == "10", "Again sets it back to 10, waiting for Start")
        pg.get_by_role("button", name="开始", exact=True).click()
        pg.wait_for_timeout(1200)
        pg.get_by_role("button", name="重新计时").click()
        pg.wait_for_timeout(300)
        check(ring(pg) == "10" and status(pg) == "倒计时 10 秒", "Start over while running goes back to 10")
        targets = pg.evaluate("() => [...document.querySelectorAll('.dare-timer button')].map((b) => { const r = b.getBoundingClientRect(); return [r.width, r.height]; })")
        check(all(w >= 44 and h >= 44 for w, h in targets), f"timer buttons are at least 44x44 ({targets})")
        pg.get_by_role("button", name="做完了", exact=True).click()
        pg.wait_for_timeout(400)
        check(pg.locator(".dare-timer").count() == 0, "Done it: the countdown goes with the card")
        all_errors += errors
        ctx.close()

        # 2. a one-minute dare reads as a clock
        ctx, pg, errors, timer = truth_dare(browser, base, "zh", "一分钟")
        check(ring(pg) == "1:00" and status(pg) == "倒计时 1 分钟", f"one minute reads 1:00 ({ring(pg)} / {status(pg)})")
        pg.get_by_role("button", name="开始", exact=True).click()
        pg.wait_for_timeout(1600)
        check(ring(pg) in ("0:59", "0:58"), f"and counts 0:59 ({ring(pg)})")
        all_errors += errors
        ctx.close()

        # 3. English
        ctx, pg, errors, timer = truth_dare(browser, base, "en", "对视")
        check(status(pg) == "20 seconds countdown" and ring(pg) == "20", f"English: {status(pg)} / {ring(pg)}")
        pg.get_by_role("button", name="Start", exact=True).click()
        pg.wait_for_timeout(1200)
        check(pg.get_by_role("button", name="Pause", exact=True).count() == 1 and status(pg) == "Counting down", "English: Pause while counting")
        pg.screenshot(path=str(OUT / "truth-running-en.png"), full_page=True)
        all_errors += errors
        ctx.close()

        # 4. a truth has no countdown
        ctx, pg, errors = phone(browser, "zh")
        open_game(pg, base, "/src/data/truthDare.ts", ["DARES", "."], "/g/truth-or-dare/play")
        pg.locator(".bottle-actions .btn-primary").click()
        pg.get_by_role("button", name="真心话", exact=True).click(timeout=15000)
        pg.locator(".cloche-dome").click()
        pg.wait_for_timeout(900)
        check(pg.locator(".dare-timer").count() == 0, "a truth gets no countdown")
        all_errors += errors
        ctx.close()

        # 5. king's game: a timed command (three seconds) counts down too
        ctx, pg, errors = phone(browser, "zh")
        open_game(pg, base, "/src/data/king.ts", ["COMMANDS", "三秒"], "/g/kings-game/play")
        # everyone draws a stick in turn (pass the phone): draw, look, got it, until the king is known
        draw_command = pg.get_by_role("button", name="国王抽命令")
        for _ in range(40):
            if draw_command.count():
                break
            got = pg.locator(".reveal-card .btn-primary")
            stick = pg.locator('[aria-label^="stick"][aria-disabled="false"]').first
            if got.count() and got.is_visible():
                got.click()
            elif stick.count():
                stick.click()
            else:
                cont = pg.locator(".pass-curtain button").first
                if cont.count():
                    cont.click()
            pg.wait_for_timeout(600)
        pg.get_by_role("button", name="国王抽命令").click()
        pg.locator(".cloche-dome").click()
        pg.get_by_role("group", name="倒计时").wait_for(timeout=5000)
        pg.wait_for_timeout(1200)  # the lid's flight
        check(ring(pg) == "3", f"king's game: a three-second command waits at 3 ({ring(pg)})")
        pg.screenshot(path=str(OUT / "king-ready-zh.png"), full_page=True)
        pg.get_by_role("button", name="开始", exact=True).click()
        pg.wait_for_function("() => document.querySelector('.dare-timer-status')?.textContent.includes('时间到')", timeout=8000)
        check(True, "king's game: runs to time's up")
        all_errors += errors
        ctx.close()

        # 6. the wheel of fate: a timed dare gets the countdown inside its card
        ctx, pg, errors = phone(browser, "zh")
        pg.goto(base + "/", wait_until="networkidle")
        pg.evaluate("""async () => {
          const dares = (await import('/src/data/truthDare.ts')).DARES;
          dares.splice(0, dares.length, ...dares.filter((d) => d.zh.includes('对视 20 秒')));
          const slices = (await import('/src/data/wheel.ts')).DEFAULT_SLICES;
          const dare = slices.find((x) => x.kind === 'dare' || x.id === 'dare');
          slices.splice(0, slices.length, dare, dare, dare, dare);
        }""")
        pg.evaluate("() => { history.pushState({ inSite: true }, '', '/g/wheel-of-fate/play'); dispatchEvent(new Event('changle:navigate')); }")
        pg.get_by_role("button", name="转一个", exact=True).click()
        pg.get_by_role("button", name="继续", exact=True).click(timeout=15000)
        pg.get_by_role("group", name="倒计时").wait_for(timeout=5000)
        pg.wait_for_timeout(600)
        check(ring(pg) == "20" and pg.locator(".porcelain .dare-timer").count() == 1, f"wheel of fate: the dare's card has a countdown at 20 ({ring(pg)})")
        pg.screenshot(path=str(OUT / "wheel-ready-zh.png"), full_page=True)
        all_errors += errors
        ctx.close()

        browser.close()
    check(not all_errors, "no console or page errors" + ("" if not all_errors else f": {all_errors[:3]}"))
    print(f"\n{'FAIL' if FAILURES else 'PASS'}: {len(FAILURES)} failed. Screenshots in {OUT}")
    return 1 if FAILURES else 0


if __name__ == "__main__":
    sys.exit(main())
