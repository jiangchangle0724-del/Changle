"""一本正经's audience (people at the table who aren't in this game) against the local site and rooms server.

usage: python3 scripts/straightface_crowd_check.py [base_url]   (default http://127.0.0.1:5173/)

A TV and four phones start a game; two more phones sit down after the deal and are the audience.
Checks: their panel says so; no bets while the parts are read; from the first explanation they can
back someone, once; whom they backed shows nowhere else before the verdict; the TV counts them; at
the verdict their phones say right or wrong and every screen says how the audience did; the end
names the audience's best on the phones' titles and on the TV. Screenshots go to
local-shots/straightface-crowd/. Helpers come from straightface_net_check.py.
"""
import os, re, sys
from playwright.sync_api import sync_playwright
from straightface_net_check import L, btn, clear_stamps, me, ok, page, pick, press, text, until, view, fails

BASE = next((a for a in sys.argv[1:] if a.startswith("http")), "http://127.0.0.1:5173/")
if not BASE.endswith("/"):
    BASE += "/"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "local-shots", "straightface-crowd")
os.makedirs(OUT, exist_ok=True)

YOU = {"zh": "你这局是观众", "en": "You're in the audience"}
WAIT = {"zh": "等第一个人开始解释", "en": "once the first explanation starts"}
RIGHT = {"zh": "你押对了", "en": "You backed the honest one"}
WRONG = {"zh": "这次没押中", "en": "Not this time"}


def shot(pg, tag):
    pg.screenshot(path=os.path.join(OUT, f"{tag}-{pg._name}.png"))


def look(pg):
    """Hold the part down a moment, then let go (the "got it" button comes after a first look)."""
    box = pg.locator(".sf-hold").first.bounding_box()
    pg.mouse.move(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
    pg.mouse.down()
    pg.wait_for_timeout(300)
    pg.mouse.up()
    pg.wait_for_timeout(150)


def sit(browser, code, name, lang):
    g = page(browser, name, lang, {"width": 390, "height": 844})
    g.goto(BASE + f"#/r/{code}", wait_until="networkidle")
    g.wait_for_timeout(300)
    g.locator(".join-card input").fill(name)
    g.locator(".join-card button[type=submit]").click()
    until(lambda: view(g) is not None or g.locator(".lobby").count() > 0, 10000)
    return g


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        tv = page(browser, "tv", "zh", {"width": 1600, "height": 900}, scale=1, mobile=False)
        tv.goto(BASE + "#/tv?g=straightface", wait_until="networkidle")
        tv.wait_for_selector(".tv-code", timeout=10000)
        tv.wait_for_timeout(800)
        code = tv.locator(".tv-code").inner_text().strip()
        phones = [sit(browser, code, n, l) for n, l in [("Amy", "zh"), ("Ben", "en"), ("小林", "zh"), ("Dan", "zh")]]
        host = phones[0]
        host.wait_for_timeout(600)
        press(host, host.locator(".lobby-actions .btn-primary"))
        ok(until(lambda: host.get_by_role("button", name=L["deal"]["zh"]).count() > 0, 10000), "the host can deal")
        press(host, host.get_by_role("button", name=L["deal"]["zh"], exact=True))
        ok(until(lambda: view(host) and view(host)["phase"] == "peek", 10000), "dealt: four play")

        # two sit down after the deal: the audience
        crowd = [sit(browser, code, "Eve", "zh"), sit(browser, code, "Fay", "en")]
        ids = {g._name: me(g) for g in phones + crowd}
        for c in crowd:
            ok(until(lambda c=c: YOU[c._lang] in text(c), 8000), f"{c._name}: the audience panel")
            ok(WAIT[c._lang] in text(c) and c.locator(".sf-crowd .ballot").count() == 0, f"{c._name}: no bets while the parts are read")
        shot(crowd[0], "01-waiting")

        rounds = 0
        while rounds < 6:
            rounds += 1
            ok(until(lambda: all(g.locator(".sf-term").count() > 0 for g in phones), 15000), f"[round {rounds}] the word is up")
            v = view(host)
            judge = v["table"]["judgeId"]
            for g in phones:
                if ids[g._name] != judge:
                    look(g)
                    press(g, btn(g, "got"))
            jp = next(g for g in phones if ids[g._name] == judge)
            ok(until(lambda: btn(jp, "startSpeaking").count() > 0, 10000), f"[round {rounds}] explaining")
            press(jp, btn(jp, "startSpeaking"))
            honest = next(g._name for g in phones if (view(g)["me"] or {}).get("role") == "honest")
            bluffer = next(g._name for g in phones if (view(g)["me"] or {}).get("role") == "bluffer")
            # the audience backs someone: Eve the honest one, Fay a bluffer
            for c, who in [(crowd[0], honest), (crowd[1], bluffer)]:
                ok(until(lambda c=c: c.locator(".sf-crowd .ballot .nominee:not([disabled])").count() > 0, 8000), f"[round {rounds}] {c._name} can bet now")
                pick(c, who)
                ok(until(lambda c=c: c.locator(".sf-crowd .ballot").count() == 0 and who in text(c), 6000), f"[round {rounds}] {c._name} backed {who}, once")
            if rounds == 1:
                shot(crowd[0], "02-backed")
            ok(all(view(g)["crowd"]["bets"] is None for g in phones + crowd + [tv]) and view(jp)["crowd"]["count"] == 2, f"[round {rounds}] nobody sees whom the audience backed, only how many")
            for _ in range(3):
                sp = until(lambda: next((g for g in phones if view(g)["me"] and view(g)["me"]["isSpeaking"]), None), 8000)
                if not sp:
                    break
                press(sp, btn(sp, "done"))
                sp.wait_for_timeout(400)
            ok(until(lambda: view(host)["phase"] in ("bets", "accuse"), 8000), f"[round {rounds}] on to the bets")
            if view(host)["phase"] == "bets":
                ok(until(lambda: "2 个观众押了" in text(tv), 5000), f"[round {rounds}] the TV counts the audience")
                if rounds == 1:
                    tv.wait_for_timeout(400)
                    shot(tv, "03-bets")
                for g in phones:
                    if ids[g._name] == judge:
                        continue
                    if until(lambda g=g: g.locator(".ballot .nominee:not([disabled])").count() > 0, 4000):
                        press(g, g.locator(".ballot .nominee:not([disabled])"))
            ok(until(lambda: view(host)["phase"] == "accuse", 8000), f"[round {rounds}] all bets in")
            pick(jp, honest)
            ok(until(lambda: all(view(g)["phase"] == "reveal" for g in phones), 10000), f"[round {rounds}] the reveal")
            host.wait_for_timeout(5200)
            clear_stamps(phones + crowd + [tv])
            ok(until(lambda: RIGHT[crowd[0]._lang] in text(crowd[0]) and WRONG[crowd[1]._lang] in text(crowd[1]), 6000), f"[round {rounds}] Eve was right, Fay wasn't, and their phones say so")
            line = {"zh": "观众 1/2 押对了", "en": "Audience: 1 of 2 backed the honest one"}
            ok(all(line[g._lang] in text(g) for g in phones), f"[round {rounds}] every phone says how the audience did")
            ok(until(lambda: line["zh"] in text(tv), 4000), f"[round {rounds}] so does the TV")
            if rounds == 1:
                shot(crowd[0], "04-verdict")
                shot(tv, "04-verdict")
            master = next((g for g in phones if g.locator(".sf-master .ballot").count() > 0), None)
            if master:
                press(master, master.locator(".sf-master .ballot .nominee:not([disabled])"))
                host.wait_for_timeout(600)
                clear_stamps(phones + crowd + [tv])
            press(host, host.locator(".sf-net-actions .btn-primary"))
            if until(lambda: view(host)["phase"] == "finished", 3000):
                break
            ok(until(lambda: view(host)["phase"] == "between", 8000), f"[round {rounds}] between rounds")
            press(host, host.locator(".sf-net-actions .btn-primary"))

        ok(view(host)["phase"] == "finished" and rounds == 4, f"four rounds, then the end ({rounds})")
        ok(view(host)["crowd"]["right"].get(ids["Eve"]) == 4 and not view(host)["crowd"]["right"].get(ids["Fay"]), f"the audience's board: Eve 4, Fay 0 ({view(host)['crowd']['right']})")
        best = {"zh": "最准的观众", "en": "Sharpest in the audience"}
        ok(all(best[g._lang] in g.locator(".sf-titles").inner_text() and "Eve" in g.locator(".sf-titles").inner_text() for g in phones), "the phones' titles name the audience's best")
        ok(until(lambda: "最准的观众：Eve" in text(tv), 5000), "so does the TV, under the podium")
        tv.wait_for_timeout(2500)
        shot(tv, "05-end")
        phones[1].locator(".sf-titles").scroll_into_view_if_needed()
        shot(phones[1], "05-titles")
        for g in phones + crowd + [tv]:
            real = [e for e in g._errs if "favicon" not in e and "ResizeObserver" not in e]
            ok(not real, f"{g._name}: no errors ({real[:2]})")
        browser.close()
    print("\nall good" if not fails else f"\n{len(fails)} failure(s)")
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
