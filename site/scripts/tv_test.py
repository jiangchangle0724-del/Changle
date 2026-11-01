"""The big screen: a TV opens a table, phones scan in, and a whole game of Punchline plays as a
show on the TV while the phones are controllers. Then the TV reloads (it comes back to the same
table), and when it goes away the phones take the show over. Against the local dev servers.

usage: python3 scripts/tv_test.py [base_url] [zh|en] [quick]
Screenshots go to $SHOTS (default: scratchpad/tv or tv-en).
"""
import json, os, re, sys, time
from playwright.sync_api import sync_playwright

sys.path.insert(0, os.path.dirname(__file__))
from party_test import until, ok, fails, phone, room, view, me, clear_stamps, errors  # noqa: E402

BASE = next((a for a in sys.argv[1:] if a.startswith("http")), "http://127.0.0.1:5173/")
LANG = next((a for a in sys.argv[1:] if a in ("zh", "en")), "zh")
QUICK = "quick" in sys.argv[1:]
OUT = os.environ.get("SHOTS", "/tmp/claude-0/-home-claude/9e141460-a70a-5df4-ae5a-70d27259d966/scratchpad/" + ("tv" if LANG == "zh" else "tv-en"))
os.makedirs(OUT, exist_ok=True)
T = {
    "next": {"zh": "下一题", "en": "Next prompt"},
    "scores": {"zh": "看分数", "en": "See the scores"},
    "round": {"zh": "下一轮", "en": "Next round"},
}


def shot(pg, tag):
    pg.screenshot(path=os.path.join(OUT, f"{tag}-{pg._name}.png"))


def tv_page(browser, w=1600, h=900, path="#/tv?g=punchline"):
    ctx = browser.new_context(viewport={"width": w, "height": h}, device_scale_factor=1)
    pg = ctx.new_page()
    settings = {"lang": LANG, "sound": True, "music": False, "customPenalty": "", "players": []}
    pg.add_init_script("localStorage.setItem('lazysusan.settings.v1', %s);" % json.dumps(json.dumps(settings)))
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.on("console", lambda m: errs.append("console: " + m.text) if m.type == "error" else None)
    pg._errs = errs
    pg._name = "tv"
    return pg


def join(browser, code, name):
    g = phone(browser, name, LANG)
    g.goto(BASE + f"#/r/{code}", wait_until="networkidle")
    g.wait_for_timeout(250)
    g.locator(".join-card input").fill(name)
    g.locator(".join-card button[type=submit]").click()
    until(lambda: room(g))
    return g


def phase(pg):
    return (view(pg) or {}).get("phase")


def host_next(host, label):
    b = host.get_by_role("button", name=T[label][LANG])
    try:
        b.click(timeout=2500)
    except Exception:
        pass  # the show already moved on by itself


def press(g, loc, tries=6):
    """Click through: a penalty stamp landing on the phone gets drunk first."""
    for _ in range(tries):
        clear_stamps([g], wait=False)
        try:
            loc.click(timeout=2500)
            return True
        except Exception:
            g.wait_for_timeout(300)
    return False


def write_all(phones, answers, start=0):
    n = start
    for g in phones:
        while g.locator(".pl-write form textarea").count():
            clear_stamps([g], wait=False)
            g.locator(".pl-write form textarea").first.fill(answers[n % len(answers)])
            press(g, g.locator(".pl-write form button[type=submit]").first)
            g.wait_for_timeout(150)
            n += 1
    return n


def vote_all(phones, picks=1):
    clear_stamps(phones, wait=False)
    for g in phones:
        m = (view(g) or {}).get("match") or {}
        if not m.get("canVote"):
            continue
        buttons = g.locator(".pc-vote:not([disabled])")
        for i in range(min(picks, buttons.count())):
            press(g, buttons.nth(i))
            g.wait_for_timeout(120)


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        # changle.ca/tv (a path, easy to type on a TV) lands on the big screen
        tv = tv_page(browser)
        tv.goto(BASE.rstrip("/") + "/tv", wait_until="networkidle")
        ok(until(lambda: tv.locator(".tv-code").count() == 1, 8000), "/tv opens the big screen")
        tv.goto(BASE + "#/tv?g=punchline", wait_until="networkidle")
        tv.wait_for_selector(".tv-code", timeout=8000)
        tv.wait_for_timeout(900)
        code = tv.locator(".tv-code").inner_text().strip()
        ok(re.fullmatch(r"[A-Z0-9]{4}", code) is not None, f"the TV opened table {code}")
        ok(until(lambda: re.search(r"/tv/" + code, tv.url) is not None), "the TV's address now names the table (a reload comes back)")
        shot(tv, "01-lobby-empty")
        tv.mouse.click(800, 450)  # the click that lets the TV play sound
        tv.wait_for_timeout(300)
        ok(tv.locator(".tv-gate").count() == 0, "one click on the TV turns the sound on")

        names = ["Steve", "Mia", "小林", "Jay"]
        phones = []
        for n in names:
            phones.append(join(browser, code, n))
            tv.wait_for_timeout(250)
        host = phones[0]
        ok(until(lambda: tv.locator(".tv-seat").count() == len(names)), "the TV shows every phone that sat down")
        ok(room(host)["host"] == me(host), "the first phone to sit down hosts")
        ok(room(host)["screens"] == 1, "the phones know a big screen is watching")
        tv.wait_for_timeout(700)
        shot(tv, "02-lobby-seated")

        host.locator(".lobby-actions .btn-primary").click()
        ok(until(lambda: (view(tv) or {}).get("id") == "punchline"), "Punchline starts on the TV")
        tv.wait_for_timeout(1200)
        shot(tv, "03-write-title")
        tv.wait_for_timeout(2600)
        shot(tv, "04-write-board")
        ok(host.locator(".pc-chip").count() == 1, "with a TV in the room, the phone is a controller")
        shot(host, "04-phone-write")

        answers = ["我的手机先睡了", "Wi-Fi 叫 别偷了", "外星人要求退货", "冰箱在开会", "猫已读不回", "老板也想辞职", "月亮是个灯泡", "恐龙只想减肥"] if LANG == "zh" else [
            "My phone fell asleep first", "The Wi-Fi is called StopStealing", "Aliens asked for a refund", "The fridge is in a meeting",
            "Left on read by the cat", "My boss wants to quit too", "The moon is a light bulb", "Dinosaurs just wanted to diet"]
        n = write_all(phones[:2], answers)
        tv.wait_for_timeout(500)
        shot(tv, "05-write-some-done")
        n = write_all(phones[2:], answers, n)
        ok(until(lambda: phase(tv) == "present", 6000), "all answers in: the TV presents the first matchup")
        tv.wait_for_timeout(1500)
        shot(tv, "06-present-prompt")
        tv.wait_for_timeout(2600)
        shot(tv, "07-present-answers")
        mine = next((g for g in phones if ((view(g) or {}).get("match") or {}).get("mine") is not None), None)
        if mine:
            shot(mine, "07-phone-present-mine")
        ok(until(lambda: phase(tv) == "vote", 9000), "the vote opens")
        tv.wait_for_timeout(600)
        voters = [g for g in phones if view(g)["match"]["canVote"]]
        ok(len(voters) == 2, f"two phones can vote on a head-to-head with four players ({len(voters)})")
        shot(voters[0], "08-phone-vote")
        voters[0].locator(".pc-vote").first.click()
        tv.wait_for_timeout(500)
        shot(tv, "08-vote-one-in")
        voters[1].locator(".pc-vote").first.click()
        ok(until(lambda: phase(tv) == "result"), "everyone voted: the result")
        ok(voters[1].locator(".pc-drum").count() == 1, "the phone does not spoil the reveal")
        tv.wait_for_timeout(2200)
        shot(tv, "09-result-votes")
        tv.wait_for_timeout(2600)
        shot(tv, "10-result-points")
        author = next(g for g in phones if view(g)["match"]["mine"] is not None)
        shot(author, "10-phone-result-mine")
        ok(author.locator(".pc-big").count() >= 1 and author.locator(".pc-drum").count() == 0, "after the TV's reveal, the writer's phone says how it went")
        tv.wait_for_timeout(500)
        shot(tv, "11-result-sweep")

        if not QUICK:
            # the TV reloads in the middle of the game and comes straight back
            tv.reload(wait_until="networkidle")
            ok(until(lambda: tv.locator(".sh-stage.is-tv").count() == 1, 8000), "the TV reloads straight back into the show")
            tv.mouse.click(800, 450)

            # the rest of round one, quickly
            while phase(tv) != "scores":
                ph = phase(tv)
                if ph == "present":
                    host.get_by_role("button", name="开始投票" if LANG == "zh" else "Open the vote").click()
                    until(lambda: phase(tv) == "vote", 3000)
                elif ph == "vote":
                    vote_all(phones)
                    until(lambda: phase(tv) == "result", 4000)
                elif ph == "result":
                    clear_stamps(phones, wait=False)
                    m = view(tv)["match"]
                    host_next(host, "next" if m["n"] < m["of"] else "scores")
                    until(lambda: phase(tv) != "result", 3000)
                else:
                    time.sleep(0.3)
            tv.wait_for_timeout(1500)
            shot(tv, "12-scores-race")
            tv.wait_for_timeout(2800)
            shot(tv, "13-scores-reordered")
            clear_stamps(phones, wait=False)
            shot(host, "13-phone-standing")

            # round two straight to its end, then the final
            host_next(host, "round")
            ok(until(lambda: view(tv)["round"] == 2 and phase(tv) == "write", 4000), "round two")
            # someone is halfway through an answer when the TV reloads: the draft stays
            clear_stamps([phones[1]], wait=False)
            phones[1].locator(".pl-write form textarea").first.fill("写到一半")
            tv.reload(wait_until="networkidle")
            tv.wait_for_timeout(2500)
            ok(phones[1].locator(".pl-write form textarea").first.input_value() == "写到一半", "a TV reload doesn't wipe an answer being typed")
            n = write_all(phones, answers, n)
            while phase(tv) != "scores":
                ph = phase(tv)
                if ph == "present":
                    host.get_by_role("button", name="开始投票" if LANG == "zh" else "Open the vote").click()
                    until(lambda: phase(tv) == "vote", 3000)
                elif ph == "vote":
                    vote_all(phones)
                    until(lambda: phase(tv) == "result", 4000)
                elif ph == "result":
                    clear_stamps(phones, wait=False)
                    m = view(tv)["match"]
                    host_next(host, "next" if m["n"] < m["of"] else "scores")
                    until(lambda: phase(tv) != "result", 3000)
                else:
                    time.sleep(0.3)
            clear_stamps(phones, wait=False)
            host_next(host, "round")
            ok(until(lambda: view(tv)["round"] == 3 and phase(tv) == "write", 4000), "the final round")
            tv.wait_for_timeout(1200)
            shot(tv, "14-final-title")
            write_all(phones, answers, n)
            ok(until(lambda: phase(tv) == "present", 6000), "the final's answers go up")
            tv.wait_for_timeout(5600)
            shot(tv, "15-final-present")
            ok(until(lambda: phase(tv) == "vote", 6000), "the final vote opens")
            tv.wait_for_timeout(400)
            shot(phones[1], "16-phone-final-vote")
            vote_all(phones, picks=3)
            ok(until(lambda: phase(tv) == "result", 6000), "everyone picked three: the final result")
            tv.wait_for_timeout(2600)
            shot(tv, "17-final-votes")
            tv.wait_for_timeout(2600)
            shot(tv, "18-final-sorted")
            clear_stamps(phones, wait=False)
            host.get_by_role("button", name="看最终名次" if LANG == "zh" else "See who won").click()
            ok(until(lambda: phase(tv) == "end", 4000), "the end: the podium")
            tv.wait_for_timeout(3200)
            shot(tv, "19-podium")
            clear_stamps(phones)
            shot(host, "19-phone-end")

            # the TV goes away: every phone takes the show over
            tv.context.close()
            ok(until(lambda: room(host)["screens"] == 0, 6000), "the phones notice the big screen left")
            ok(host.locator(".sh-stage.is-phone").count() == 0, "a TV that just dropped gets a few seconds' grace")
            ok(until(lambda: host.locator(".sh-stage.is-phone").count() == 1, 9000), "without the TV, the phones play the show again")
            shot(host, "20-phone-show-after-tv")
            errors(phones)
        else:
            errors(phones + [tv])
        print("\ntv test:", "ALL PASS" if not fails else f"{len(fails)} FAILED: {fails}")
        for g in phones:
            g.context.close()
        browser.close()
        sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
