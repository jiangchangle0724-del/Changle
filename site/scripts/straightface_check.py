"""一本正经 · Straight Face on one phone: a whole 4-player round at iPhone size, a screenshot of every
step, and the rules the screen must keep (nothing private before the holder says it's them; the
"pass to" line only once the peek clock has run out; the honest one shows after the fun fact).

usage: python3 scripts/straightface_check.py [base_url] [out_dir]
The site must be running (npm run dev -- --port 5173); the rooms server is not needed.
"""
import json, os, sys, time
from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:5173"
OUT = sys.argv[2] if len(sys.argv) > 2 else "local-shots/straightface"
os.makedirs(OUT, exist_ok=True)
PLAYERS = [{"id": f"p{i}", "name": n} for i, n in enumerate(["Steve", "小雨", "Kevin", "阿强"])]
fails = []
shot_n = 0


def snap(pg, name):
    global shot_n
    shot_n += 1
    pg.screenshot(path=os.path.join(OUT, f"{shot_n:02d}-{name}.png"))


def check(cond, msg):
    if not cond:
        fails.append(msg)
        print("  FAIL:", msg)


def hold(pg, locator, ms):
    """Press and hold a button for `ms` milliseconds (a finger on the screen)."""
    box = locator.bounding_box()
    x, y = box["x"] + box["width"] / 2, box["y"] + box["height"] / 2
    pg.mouse.move(x, y)
    pg.mouse.down()
    pg.wait_for_timeout(ms)
    return (x, y)


def release(pg):
    pg.mouse.up()


def run(lang):
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={"width": 393, "height": 852}, device_scale_factor=2, has_touch=True, is_mobile=True, locale="zh-CN" if lang == "zh" else "en-CA")
        pg = ctx.new_page()
        pg.add_init_script(
            "localStorage.setItem('lazysusan.settings.v1', %s); sessionStorage.setItem('lazysusan.entered','1');"
            % json.dumps(json.dumps({"lang": lang, "sound": False, "music": False, "customPenalty": "", "players": PLAYERS}))
        )
        errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
        zh = lang == "zh"

        pg.goto(BASE + "/g/straight-face/play", wait_until="networkidle")
        pg.wait_for_timeout(800)
        check("/g/straight-face/play" in pg.url, "the game's address opens the game")
        snap(pg, "setup")

        # setup: level 3 so the fallback to level 2 shows, bets on
        pg.get_by_role("button", name="没人听过" if zh else "Obscure").click()
        pg.get_by_role("button", name="开始" if zh else "Start", exact=True).click()
        pg.wait_for_timeout(700)
        snap(pg, "term")
        check(pg.locator(".sf-term.is-big").count() == 1, "the word goes up big for the table")
        judge = pg.locator(".sf-stage .hint strong").first.inner_text().strip()
        names = [x["name"] for x in PLAYERS]
        check(judge in names, f"a judge is named ({judge})")
        order = names[names.index(judge) + 1 :] + names[: names.index(judge)]

        pg.get_by_role("button", name="开始传手机" if zh else "Start passing the phone").click()
        pg.wait_for_timeout(600)

        # three peeks, in seat order left of the judge
        for i, who in enumerate(order):
            curtain = pg.locator(".pass-curtain")
            check(curtain.count() == 1, f"a curtain before {who}'s peek")
            check(who in curtain.inner_text(), f"the curtain names {who}")
            check(pg.locator(".sf-hold").count() == 0, f"nothing to hold before {who} says it's them")
            if i == 0:
                snap(pg, "pass-curtain")
            curtain.get_by_role("button").click()
            pg.wait_for_timeout(500)
            h = pg.locator(".sf-hold")
            check(h.count() == 1, f"{who} gets the hold-to-see button")
            check(pg.locator(".sf-part").count() == 0, f"{who}'s part is hidden until held")
            if i == 0:
                snap(pg, "peek-closed")
            hold(pg, h, 1200)
            check(pg.locator(".sf-part").count() == 1, f"{who}'s part shows while held")
            role = pg.locator(".sf-part-role").inner_text()
            if i == 0:
                snap(pg, "peek-held")
            release(pg)
            pg.wait_for_timeout(300)
            check(pg.locator(".sf-part").count() == 0, f"{who}'s part goes dark on release")
            check(pg.locator(".pass-curtain").count() == 0, "no 'pass to' before the clock runs out")
            # held again: still readable, the clock keeps running
            hold(pg, h, 800)
            check(pg.locator(".sf-part").count() == 1, "a second hold shows the part again")
            release(pg)
            # wait out the 15 s clock
            pg.wait_for_selector(".pass-curtain", timeout=20000)
            pg.wait_for_timeout(300)
            print(f"  {who}: {role.strip()}")
        # the phone comes back to the judge
        curtain = pg.locator(".pass-curtain")
        check(judge in curtain.inner_text(), "after the last peek the phone goes back to the judge")
        snap(pg, "back-to-judge")
        curtain.get_by_role("button").click()
        pg.wait_for_timeout(500)

        # explaining
        check(pg.locator(".sf-order").count() == 1, "the speaking order shows")
        snap(pg, "order")
        pg.get_by_role("button", name="开始发言" if zh else "Start the explanations").click()
        pg.wait_for_timeout(600)
        check(pg.locator(".sf-speaker").count() == 1, "the first speaker's ring shows")
        snap(pg, "speaker-1")
        # the judge tags the second speaker
        pg.get_by_role("button", name="贴疑点" if zh else "Tag a suspect").click()
        pg.wait_for_timeout(400)
        snap(pg, "tag-picker")
        tag_names = pg.locator(".sf-panel .nominee .nominee-name").all_inner_texts()
        tagged = tag_names[1]
        pg.locator(".sf-panel .nominee").nth(1).click()
        pg.wait_for_timeout(400)
        check(tagged in pg.locator(".game-actions").inner_text(), "the tag button says whom it is on")
        pg.get_by_role("button", name="下一位" if zh else "Next speaker").click()
        pg.wait_for_timeout(400)
        snap(pg, "speaker-2")
        pg.get_by_role("button", name="下一位" if zh else "Next speaker").click()
        pg.wait_for_timeout(400)
        pg.get_by_role("button", name="都说完了" if zh else "All done").click()
        pg.wait_for_timeout(600)

        # bets: three curtains, three picks
        for i, who in enumerate(order):
            curtain = pg.locator(".pass-curtain")
            check(curtain.count() == 1 and who in curtain.inner_text(), f"a curtain before {who}'s bet")
            curtain.get_by_role("button").click()
            pg.wait_for_timeout(400)
            if i == 0:
                snap(pg, "bet")
            check(pg.locator(".ballot .nominee").count() == 2, f"{who} may bet on the two others")
            pg.locator(".ballot .nominee").first.click()
            pg.wait_for_timeout(500)
        curtain = pg.locator(".pass-curtain")
        check(judge in curtain.inner_text(), "after the bets the phone goes back to the judge")
        curtain.get_by_role("button").click()
        pg.wait_for_timeout(500)

        # accusing: the tagged one is greyed out
        snap(pg, "accuse")
        disabled = pg.locator(".ballot .nominee:disabled .nominee-name").all_inner_texts()
        check(disabled == [tagged], f"the tagged player cannot be accused ({disabled})")
        pg.locator(".ballot .nominee:not(:disabled)").first.click()
        pg.wait_for_timeout(400)

        # the reveal, line by line; the honest one must not be on screen before the fun fact
        check(pg.locator(".sf-reveal-item").count() == 1, "the reveal starts with one line")
        check(pg.locator(".sf-honest").count() == 0, "the honest one is not the first line")
        snap(pg, "reveal-1")
        pg.wait_for_timeout(1000)
        check(pg.locator(".sf-fact").count() == 1 and pg.locator(".sf-honest").count() == 0, "the fun fact comes before the honest one")
        pg.wait_for_timeout(2900)
        check(pg.locator(".sf-honest").count() == 1, "then the honest one")
        snap(pg, "reveal-all")
        # penalties: a stamp when the judge was fooled or a tag caught a bluffer
        t0 = time.time()
        while time.time() - t0 < 20:
            if pg.locator(".stamp-done").count():
                snap(pg, "stamp")
                pg.locator(".stamp-done").click()
                pg.wait_for_timeout(900)
                continue
            if pg.locator(".sf-master").count():
                snap(pg, "master-picks")
                pg.locator(".sf-master .nominee").first.click()
                pg.wait_for_timeout(600)
                continue
            btn = pg.get_by_role("button", name="下一轮" if zh else "Next round")
            if btn.count() and btn.is_enabled():
                break
            pg.wait_for_timeout(300)
        btn = pg.get_by_role("button", name="下一轮" if zh else "Next round")
        check(btn.count() == 1 and btn.is_enabled(), "the next-round button is ready once the penalties are done")
        btn.click()
        pg.wait_for_timeout(600)
        check(pg.locator(".leaderboard").count() == 1, "scores between rounds")
        check(("第 2 轮" if zh else "round 2") in pg.locator(".game-actions").inner_text(), "the next round is round 2")
        snap(pg, "between")

        # one more round at speed, to the end: four rounds in all
        for rnd in range(2, 5):
            pg.get_by_role("button", name=("开始第 %d 轮" % rnd) if zh else ("Start round %d" % rnd)).click()
            pg.wait_for_timeout(500)
            judge = pg.locator(".sf-stage .hint strong").first.inner_text().strip()
            pg.get_by_role("button", name="开始传手机" if zh else "Start passing the phone").click()
            pg.wait_for_timeout(300)
            for _ in range(3):
                pg.locator(".pass-curtain").get_by_role("button").click()
                pg.wait_for_timeout(200)
                hold(pg, pg.locator(".sf-hold"), 300)
                release(pg)
                pg.wait_for_selector(".pass-curtain", timeout=20000)
            pg.locator(".pass-curtain").get_by_role("button").click()
            pg.wait_for_timeout(300)
            pg.get_by_role("button", name="开始发言" if zh else "Start the explanations").click()
            pg.wait_for_timeout(200)
            pg.get_by_role("button", name="下一位" if zh else "Next speaker").click()
            pg.get_by_role("button", name="下一位" if zh else "Next speaker").click()
            pg.get_by_role("button", name="都说完了" if zh else "All done").click()
            pg.wait_for_timeout(300)
            for _ in range(3):
                pg.locator(".pass-curtain").get_by_role("button").click()
                pg.wait_for_timeout(200)
                pg.locator(".ballot .nominee").first.click()
                pg.wait_for_timeout(300)
            pg.locator(".pass-curtain").get_by_role("button").click()
            pg.wait_for_timeout(300)
            pg.locator(".ballot .nominee:not(:disabled)").first.click()
            pg.wait_for_timeout(300)
            pg.get_by_role("button", name="直接看完" if zh else "Show everything").click()
            t0 = time.time()
            label = ("看结果" if zh else "See the result") if rnd == 4 else ("下一轮" if zh else "Next round")
            while time.time() - t0 < 20:
                if pg.locator(".stamp-done").count():
                    pg.locator(".stamp-done").click()
                    pg.wait_for_timeout(900)
                    continue
                if pg.locator(".sf-master").count():
                    pg.locator(".sf-master .nominee").first.click()
                    pg.wait_for_timeout(400)
                    continue
                btn = pg.get_by_role("button", name=label)
                if btn.count() and btn.is_enabled():
                    break
                pg.wait_for_timeout(200)
            pg.get_by_role("button", name=label).click()
            pg.wait_for_timeout(600)
        check(pg.locator(".sf-final").count() == 1, "the game ends with a result")
        check(pg.locator(".sf-learned li").count() == 4, "four words learned tonight")
        snap(pg, "final")
        pg.get_by_role("button", name="再来一局" if zh else "Play again").click()
        pg.wait_for_timeout(400)
        check(pg.locator(".setup-panel").count() == 1, "play again goes back to the setup")

        # layout: nothing wider than the phone
        over = pg.evaluate("() => Math.max(0, document.documentElement.scrollWidth - window.innerWidth)")
        check(over == 0, f"no sideways scroll ({over}px over)")
        if errs:
            fails.append(f"{lang}: console errors {errs[:3]}")
        b.close()


run("zh")
shot_n = 100
run("en")
print(f"\n{len(fails)} failure(s)" if fails else "\nall good")
for f in fails:
    print(" -", f)
sys.exit(1 if fails else 0)
