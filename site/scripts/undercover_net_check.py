"""谁是卧底 online: seven phones and a big screen at one table, against the local servers
(HANDOFF.md, "Run the site locally": the rooms server on 8787 and the site on 5173).

usage: python3 scripts/undercover_net_check.py [base_url]   (TV_LANG=en for an English TV)

Amy (Chinese, hosting), Ben (English), 小林, Dan, Eve (English), Fay and Gus (a 320px phone) sit
down; the host sets one undercover and a blank, deals, and deals a fresh pair once (换一组词). The
first speaker tries to type their own word (忌爆字) and the next one the line before (忌跟描): both
are turned away on the phone. The vote ties two civilians three to three: they go to a run-off,
describe again, and the other five vote one out. Next round the blank never opens; the table votes
the blank out, the blank guesses wrong, and the host counts it as a near miss: the blank wins alone.
The end shows the replay (复盘). No phone scrolls sideways, no page logs an error. Screenshots go
to local-shots/undercover-net/.
"""
import json, os, re, sys, time
from playwright.sync_api import sync_playwright

BASE = next((a for a in sys.argv[1:] if a.startswith("http")), "http://127.0.0.1:5173/")
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "local-shots", "undercover-net")
os.makedirs(OUT, exist_ok=True)

fails = []


def ok(cond, msg):
    print(("ok   " if cond else "FAIL ") + msg, flush=True)
    if not cond:
        fails.append(msg)


def until(fn, timeout=8000, step=120):
    end = time.time() + timeout / 1000
    while time.time() < end:
        try:
            v = fn()
            if v:
                return v
        except Exception:
            pass
        time.sleep(step / 1000)
    return None


def page(browser, name, lang, viewport, scale=2, mobile=True):
    ctx = browser.new_context(viewport=viewport, device_scale_factor=scale, has_touch=mobile, is_mobile=mobile)
    pg = ctx.new_page()
    settings = {"lang": lang, "sound": False, "music": False, "customPenalty": "", "players": []}
    pg.add_init_script("sessionStorage.setItem('lazysusan.entered','1'); localStorage.setItem('lazysusan.settings.v1', %s);" % json.dumps(json.dumps(settings)))
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.on("console", lambda m: errs.append("console: " + m.text) if m.type == "error" else None)
    pg._errs, pg._name, pg._lang = errs, name, lang
    return pg


def shot(pg, tag):
    pg.screenshot(path=os.path.join(OUT, f"{tag}-{pg._name}.png"), full_page=False)


def room(pg):
    return pg.evaluate("() => window.__room")


def view(pg):
    return pg.evaluate("() => window.__room && window.__room.game")


def me(pg):
    return pg.evaluate("() => window.__room && window.__room.you")


def phase(pg):
    return (view(pg) or {}).get("phase")


def text(pg):
    return pg.evaluate("() => document.body.innerText")


def press(pg, loc, tries=8):
    for _ in range(tries):
        try:
            loc.first.click(timeout=1500)
            return True
        except Exception:
            clear_stamps([pg], wait=False)
            pg.wait_for_timeout(250)
    return False


def button(pg, zh, en):
    return pg.get_by_role("button", name=zh if pg._lang == "zh" else en, exact=True)


def clear_stamps(pages, wait=True):
    if wait:
        time.sleep(0.4)
    for _ in range(14):
        busy = False
        for g in pages:
            if g.locator(".stamp-layer").count() == 0:
                continue
            busy = True
            for label in ("我喝了", "I drank", "继续", "Continue"):
                b = g.locator(".stamp-layer button", has_text=label)
                try:
                    if b.count():
                        b.first.click(timeout=1200)
                        break
                except Exception:
                    pass
        if not busy:
            return
        time.sleep(0.45)


def no_sideways(pg):
    return pg.evaluate("() => document.documentElement.scrollWidth <= window.innerWidth + 1")


def vote(pg, name):
    return press(pg, pg.locator(".picker button:not([disabled])", has_text=re.compile("^\\s*" + re.escape(name) + "\\s*$")))


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        tv = page(browser, "tv", os.environ.get("TV_LANG", "zh"), {"width": 1600, "height": 900}, scale=1, mobile=False)
        tv.goto(BASE + "#/tv?g=undercover", wait_until="networkidle")
        tv.wait_for_selector(".tv-code", timeout=10000)
        tv.wait_for_timeout(800)
        code = tv.locator(".tv-code").inner_text().strip()
        ok(re.fullmatch(r"[A-Z0-9]{4}", code) is not None, f"the TV opened table {code}")

        people = [("Amy", "zh", 390), ("Ben", "en", 390), ("小林", "zh", 390), ("Dan", "zh", 390), ("Eve", "en", 390), ("Fay", "zh", 390), ("Gus", "zh", 320)]
        phones = []
        for name, lang, w in people:
            g = page(browser, name, lang, {"width": w, "height": 760})
            g.goto(BASE + f"#/r/{code}", wait_until="networkidle")
            g.wait_for_timeout(300)
            g.locator(".join-card input").fill(name)
            g.locator(".join-card button[type=submit]").click()
            until(lambda g=g: room(g))
            phones.append(g)
        host = phones[0]
        ok(until(lambda: len(room(host)["seats"]) == 7), "seven seated")
        names = {me(g): g._name for g in phones}
        by_id = {me(g): g for g in phones}

        host.locator(".lobby-actions .btn-primary").click()
        ok(all(until(lambda g=g: (view(g) or {}).get("id") == "undercover") for g in phones), "every phone is in the game")
        ok(view(host)["uc"] == 2, f"seven at the table: two undercovers to start ({view(host)['uc']})")
        press(host, host.get_by_role("button", name="少一个卧底"))
        ok(until(lambda: view(host)["uc"] == 1), "the host sets one undercover")
        press(host, host.locator(".settings-row", has_text="加一个白板").locator("button"))
        ok(until(lambda: view(host)["blank"]), "and a blank")
        press(host, button(host, "发词", "Deal the words"))
        ok(all(until(lambda g=g: phase(g) == "word") for g in phones), "the words are dealt")
        first_words = {g._name: json.dumps(view(g)["myWord"], ensure_ascii=False) for g in phones}

        # 换一组词: the host deals a fresh pair before anyone speaks; every lid closes again
        phones[1].locator(".cloche-dome").first.click()
        ok(until(lambda: host.get_by_role("button", name=re.compile("换一组词")).count() > 0), "the host has 换一组词")
        press(host, host.get_by_role("button", name=re.compile("换一组词")))
        ok(all(until(lambda g=g: view(g)["redeals"] == 1) for g in phones), "a fresh deal reaches every phone")
        ok(until(lambda: "A fresh pair" in text(phones[1])), "Ben's phone says it's a fresh pair")
        ok(phones[1].locator(".cloche-content[aria-hidden=true]").count() == 1, "Ben's lid closed again")
        ok(any(json.dumps(view(g)["myWord"], ensure_ascii=False) != first_words[g._name] for g in phones if view(g)["myWord"]), "the words changed")
        shot(phones[1], "01-fresh-pair")
        shot(tv, "01-fresh-pair")

        for g in phones:
            press(g, g.locator(".cloche-dome"))
            g.wait_for_timeout(150)
            press(g, button(g, "记住了", "Got it"))
        ok(all(until(lambda g=g: phase(g) == "talk") for g in phones), "everyone read their word: the talk starts")

        views = {me(g): view(g) for g in phones}
        blank = next(pid for pid, v in views.items() if v["isBlank"])
        words = [v["myWord"]["zh"] for v in views.values() if v["myWord"]]
        civ_word = max(set(words), key=words.count)
        civs = [pid for pid, v in views.items() if v["myWord"] and v["myWord"]["zh"] == civ_word]
        uc = next(pid for pid, v in views.items() if v["myWord"] and v["myWord"]["zh"] != civ_word)
        ok(len(civs) == 5 and blank and uc, f"five civilians, one undercover ({names[uc]}), one blank ({names[blank]})")
        v = view(host)
        ok(v["order"][0] != blank, f"the blank doesn't open the round ({names[v['order'][0]]})")

        # the first speaker tries their own word, the second the first one's line
        lines = {}
        for i in range(len(v["order"])):
            v = view(host)
            if v["phase"] != "talk":
                break
            sp = by_id[v["order"][v["speaker"]]]
            inp = sp.locator(".talk-list ~ form input, form input").first
            until(lambda: inp.is_visible())
            mine = view(sp)["myWord"]
            if i == 0 and mine:
                inp.fill(f"就是{mine['zh']}" if sp._lang == "zh" else f"a {mine['en']}")
                ok(until(lambda: sp.locator(".uc-warn").is_visible()), f"{sp._name}: a line with their own word is turned away")
                ok(sp.locator("form button[type=submit]").is_disabled(), "and can't be sent")
                shot(sp, "02-giveaway")
            if i == 1:
                inp.fill(lines[0])
                ok(until(lambda: sp.locator(".uc-warn").is_visible()), f"{sp._name}: the line before, again, is turned away")
                shot(sp, "03-repeat")
            line = f"线索{i}号" if sp._lang == "zh" else f"clue number {i}"
            lines[i] = line
            inp.fill(line)
            sp.wait_for_timeout(100)
            press(sp, sp.locator("form button[type=submit]"))
            until(lambda i=i: view(host)["phase"] != "talk" or view(host)["speaker"] > i)
        ok(until(lambda: phase(host) == "vote"), "after the last speaker: the vote")
        ok(until(lambda: "What people said before" in text(phones[1]) or "收起" in text(phones[1]) or "Hide earlier rounds" in text(phones[1])), "the vote screen shows the round's lines")
        shot(phones[1], "04-vote")
        shot(tv, "04-vote")

        # three votes each for two civilians: a run-off
        a, b = civs[0], civs[1]
        others = [pid for pid in by_id if pid not in (a, b)]
        third = next(pid for pid in others if pid != blank)
        plan = {a: b, b: a}
        for n, pid in enumerate(others):
            plan[pid] = a if n < 2 else b if n < 4 else (blank if pid != blank else third)
        # the last of the five votes for someone else, so it's three and three
        last = others[4]
        plan[last] = third if last != third else blank
        counts = {}
        for pid, target in plan.items():
            counts[target] = counts.get(target, 0) + 1
        ok(counts.get(a) == 3 and counts.get(b) == 3, f"the plan is three and three ({ {names[k]: c for k, c in counts.items()} })")
        for pid, target in plan.items():
            vote(by_id[pid], names[target])
        ok(until(lambda: phase(host) == "reveal"), "all voted: the count")
        v = view(host)
        ok(v["tie"] and v["out"] is None and sorted(v["pk"]) == sorted([a, b]), f"a tie, and a run-off for {names[a]} and {names[b]}")
        ok(until(lambda: "平票，加赛" in text(host)), "the host's phone says 平票，加赛")
        ok(until(lambda: "加赛" in text(tv) or "run-off" in text(tv)), "so does the TV")
        tv.wait_for_timeout(1800)
        shot(host, "05-tie")
        shot(tv, "05-tie")

        press(host, button(host, "开始加赛", "Start the run-off"))
        ok(until(lambda: phase(host) == "talk" and len(view(host)["order"]) == 2), "the run-off: only the tied two describe")
        ok(until(lambda: "加赛" in text(tv) or "run-off" in text(tv)), "the TV says it's a run-off")
        tv.wait_for_timeout(900)
        shot(tv, "06-runoff-talk")
        for i in range(2):
            v = view(host)
            sp = by_id[v["order"][v["speaker"]]]
            inp = sp.locator("form input").first
            until(lambda: inp.is_visible())
            inp.fill(f"加赛第{i}句" if sp._lang == "zh" else f"run-off line {i}")
            press(sp, sp.locator("form button[type=submit]"))
            until(lambda i=i: view(host)["phase"] != "talk" or view(host)["speaker"] > i)
        ok(until(lambda: phase(host) == "vote"), "the run-off vote")
        v = view(host)
        ok(sorted(v["voters"]) == sorted(others), "the other five vote")
        ok(until(lambda: ("你在加赛里" in text(by_id[a])) or ("You're in the run-off" in text(by_id[a]))), f"{names[a]} is told they're in the run-off")
        shot(by_id[a], "07-in-runoff")
        shot(by_id[others[0]], "07-runoff-vote")
        tv.wait_for_timeout(600)
        shot(tv, "07-runoff-vote")
        for pid in others:
            vote(by_id[pid], names[a])
        ok(until(lambda: phase(host) == "reveal" and (view(host)["out"] or {}).get("pid") == a), f"the run-off sends {names[a]} out")
        press(host, button(host, "下一轮", "Next round"))
        ok(until(lambda: phase(host) == "talk" and view(host)["round"] == 2), "round 2")
        ok(view(host)["order"][0] != blank, "the blank doesn't open round 2 either")
        ok(until(lambda: "之前" in text(tv) or "Before" in text(tv)), "the TV shows what people said before")
        tv.wait_for_timeout(900)
        shot(tv, "08-round2-talk")

        # straight to the vote; everyone votes the blank out
        press(host, host.get_by_role("button", name="直接投票"))
        ok(until(lambda: phase(host) == "vote"), "the host goes to the vote")
        alive = view(host)["alive"]
        for pid in alive:
            vote(by_id[pid], names[blank] if pid != blank else names[uc])
        ok(until(lambda: phase(host) == "guess"), "the blank is out: the guess")
        bp = by_id[blank]
        ok(until(lambda: bp.locator("form input").is_visible()), f"{names[blank]}'s phone asks for the guess")
        ok(until(lambda: "白板猜词" in text(tv) or "The blank's guess" in text(tv)), "the TV shows the guess")
        tv.wait_for_timeout(1800)
        shot(bp, "09-guess")
        shot(host if host is not bp else phones[1], "09-guess-wait")
        shot(tv, "09-guess")
        bp.locator("form input").fill("随便猜" if bp._lang == "zh" else "wild guess")
        press(bp, bp.locator("form button[type=submit]"))
        ok(until(lambda: phase(host) == "reveal"), "the guess is in")
        v = view(host)
        ok(v["guess"] and v["guess"]["right"] is False and not v["winner"], "a wrong guess: the game goes on")
        ok(until(lambda: host.get_by_role("button", name="意思对上了，算白板猜中").count() > 0), "the host can count a near miss")
        tv.wait_for_timeout(1800)
        shot(host, "10-guess-wrong")
        shot(tv, "10-guess-wrong")
        press(host, host.get_by_role("button", name="意思对上了，算白板猜中"))
        ok(until(lambda: view(host)["winner"] == "blank"), "counted: the blank wins")
        press(host, button(host, "看结果", "See the result"))
        ok(until(lambda: phase(host) == "end"), "the end")
        clear_stamps(phones)
        ok(until(lambda: "白板赢了" in text(host)), "the host's phone: the blank wins")
        ok(until(lambda: "The blank wins" in text(phones[1])), "Ben's phone, in English")
        ok(until(lambda: "白板赢了" in text(tv) or "The blank guessed it" in text(tv)), "the TV")
        tv.wait_for_timeout(1500)
        shot(tv, "11-end")
        rp = phones[1]
        press(rp, rp.get_by_role("button", name=re.compile("Replay")))
        ok(until(lambda: "Round 1 · run-off" in text(rp) and "Out:" in text(rp)), "Ben's replay: every round, the run-off, who went")
        rp.locator(".uc-said").first.scroll_into_view_if_needed()
        shot(rp, "12-replay")

        for g in phones:
            ok(no_sideways(g), f"{g._name}: nothing scrolls sideways")
        for g in phones + [tv]:
            errs = [e for e in g._errs if "favicon" not in e]
            ok(not errs, f"{g._name}: no errors ({errs[:2]})")
        browser.close()
    print(f"\n{len(fails)} failure(s)" if fails else "\nall passed")
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
