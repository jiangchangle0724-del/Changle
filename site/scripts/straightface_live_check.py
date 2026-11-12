"""一本正经 online on the live site (changle.ca): a big screen and four phones play a whole game,
reading only what is on the screens (production builds don't expose the room state).

usage: python3 scripts/straightface_live_check.py [base_url]   (default https://changle.ca/)

Checks that the rooms server knows the game, that every non-judge phone holds a part (one honest,
the rest bluffing), that the part shows only while held, that the TV never shows a part, that the
reveal reaches every phone and the TV, and that four rounds end the game. Screenshots go to
local-shots/straightface-live/. Helpers come from straightface_net_check.py.

A test game is not a real one: what the phones would send for the cards' numbers (a round's
outcome, a flagged card) is answered by the check itself and never reaches the server, so the live
numbers stay real; the check still sees that the host's phone sent each round once.
"""
import os, re, sys, time
from playwright.sync_api import sync_playwright
from straightface_net_check import L, clear_stamps, ok, page, press, text, until, fails

BASE = next((a for a in sys.argv[1:] if a.startswith("http")), "https://changle.ca/")
if not BASE.endswith("/"):
    BASE += "/"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "local-shots", "straightface-live")
os.makedirs(OUT, exist_ok=True)

W = {
    "judge": {"zh": "这一轮你是裁判", "en": "You judge this round"},
    "honest": {"zh": "你是老实人", "en": "You are the honest one"},
    "bluff": {"zh": "你是瞎编的人", "en": "You are bluffing"},
    "speak": {"zh": "轮到你解释了", "en": "Your turn to explain"},
    "bet": {"zh": "你押谁是老实人？", "en": "Who do you think is honest?"},
    "accuse": {"zh": "谁是老实人？", "en": "Who is the honest one?"},
    "truth": {"zh": "真释义", "en": "The real meaning"},
    "over": {"zh": "打完了", "en": "Game over"},
}


def has(pg, key):
    return W[key][pg._lang] in text(pg)


def shot(pg, tag):
    pg.screenshot(path=os.path.join(OUT, f"{tag}-{pg._name}.png"))


def hold_read(pg):
    """Hold the part down, read it, let go; what showed while held."""
    box = pg.locator(".sf-hold").first.bounding_box()
    pg.mouse.move(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
    pg.mouse.down()
    pg.wait_for_timeout(350)
    held = text(pg)
    pg.mouse.up()
    pg.wait_for_timeout(200)
    return held


def tap_nominee(pg):
    return press(pg, pg.locator(".ballot .nominee:not([disabled])"))


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        tv = page(browser, "tv", "zh", {"width": 1600, "height": 900}, scale=1, mobile=False)
        tv.goto(BASE + "#/tv?g=straightface", wait_until="networkidle")
        tv.wait_for_selector(".tv-code", timeout=15000)
        tv.wait_for_timeout(800)
        code = tv.locator(".tv-code").inner_text().strip()
        ok(re.fullmatch(r"[A-Z0-9]{4}", code) is not None, f"the TV opened table {code} for the game")

        phones = []
        for name, lang in [("Amy", "zh"), ("Ben", "en"), ("小林", "zh"), ("Dan", "zh")]:
            g = page(browser, name, lang, {"width": 390, "height": 844})
            g.route(re.compile(r".*/api/sf/(round|report)$"), lambda route: route.fulfill(status=200, content_type="application/json", body='{"ok":true}', headers={"access-control-allow-origin": "*"}))
            g.goto(BASE + f"#/r/{code}", wait_until="networkidle")
            g.wait_for_timeout(500)
            g.locator(".join-card input").fill(name)
            g.locator(".join-card button[type=submit]").click()
            ok(until(lambda g=g: g.locator(".lobby").count() > 0, 15000), f"{name} sat down")
            phones.append(g)
        host = phones[0]
        host.wait_for_timeout(800)
        press(host, host.locator(".lobby-actions .btn-primary"))
        ok(until(lambda: host.get_by_role("button", name=L["deal"]["zh"]).count() > 0, 15000), "the rooms server runs the game: the host can deal")
        shot(host, "01-setup")
        press(host, host.get_by_role("button", name=L["deal"]["zh"], exact=True))

        rounds = 0
        while rounds < 6:
            rounds += 1
            # every phone gets the word; the judge knows it, the others hold their part
            ok(until(lambda: all(g.locator(".sf-term").count() > 0 for g in phones), 15000), f"[round {rounds}] the word is up on every phone")
            judge = next((g for g in phones if has(g, "judge")), None)
            ok(judge is not None, f"[round {rounds}] one phone judges ({judge._name if judge else '?'})")
            parts = {}
            for g in phones:
                if g is judge:
                    continue
                held = hold_read(g)
                parts[g._name] = "honest" if W["honest"][g._lang] in held else "bluff" if W["bluff"][g._lang] in held else "?"
                ok(W["honest"][g._lang] not in text(g) and W["bluff"][g._lang] not in text(g), f"[round {rounds}] {g._name}: the part goes dark on letting go")
                press(g, g.get_by_role("button", name=L["got"][g._lang], exact=True))
            ok(sorted(parts.values()) == ["bluff", "bluff", "honest"], f"[round {rounds}] one honest, two bluffing: {parts}")
            tvtext = text(tv)
            ok(W["honest"]["zh"] not in tvtext and W["bluff"]["zh"] not in tvtext, f"[round {rounds}] the TV shows nobody's part")
            if rounds == 1:
                tv.wait_for_timeout(600)
                shot(tv, "02-peek")

            # the judge starts; whoever is up says done
            ok(until(lambda: judge.get_by_role("button", name=L["startSpeaking"][judge._lang]).count() > 0, 10000), f"[round {rounds}] explaining: the judge starts it")
            press(judge, judge.get_by_role("button", name=L["startSpeaking"][judge._lang], exact=True))
            for _ in range(3):
                sp = until(lambda: next((g for g in phones if has(g, "speak")), None), 10000)
                if not sp:
                    break
                if rounds == 1 and not os.path.exists(os.path.join(OUT, f"03-speaking-{sp._name}.png")):
                    shot(sp, "03-speaking")
                    shot(tv, "03-explain")
                press(sp, sp.get_by_role("button", name=L["done"][sp._lang], exact=True))
                sp.wait_for_timeout(500)
            # the bets, then the judge names someone
            ok(until(lambda: any(has(g, "bet") for g in phones), 10000), f"[round {rounds}] on to the bets")
            for g in phones:
                if g is not judge and has(g, "bet"):
                    tap_nominee(g)
            ok(until(lambda: has(judge, "accuse"), 10000), f"[round {rounds}] all bets in: the judge decides")
            tap_nominee(judge)
            ok(until(lambda: all(has(g, "truth") for g in phones), 15000), f"[round {rounds}] the reveal on every phone")
            ok(until(lambda: W["truth"]["zh"] in text(tv), 10000), f"[round {rounds}] and on the TV")
            host.wait_for_timeout(5200)
            if rounds == 1:
                shot(phones[1], "04-reveal")
                shot(tv, "04-reveal")
            clear_stamps(phones + [tv])
            master = next((g for g in phones if g.locator(".sf-master .ballot").count() > 0), None)
            if master:
                tap_nominee(master)
                host.wait_for_timeout(600)
                clear_stamps(phones + [tv])
            nxt = host.locator(".sf-net-actions .btn-primary")
            ok(until(lambda: nxt.count() > 0, 10000), f"[round {rounds}] the host can move on")
            press(host, nxt)
            if until(lambda: any(has(g, "over") for g in phones), 4000):
                break
            ok(until(lambda: host.locator(".sf-net-actions .btn-primary").count() > 0, 10000), f"[round {rounds}] between rounds")
            press(host, host.locator(".sf-net-actions .btn-primary"))

        ok(all(until(lambda g=g: has(g, "over"), 10000) for g in phones) and rounds == 4, f"four rounds, then the end ({rounds})")
        sent = [(g._name, x[1]) for g in phones for x in g._sf if x[0] == "/sf/round"]
        ok(len(sent) == 4 and all(n == host._name for n, _ in sent), f"the host's phone would have counted each round once (answered by the check): {[(n, b.get('card')) for n, b in sent]}")
        tv.wait_for_timeout(3000)
        shot(host, "05-finished")
        shot(tv, "05-finished")
        for g in phones + [tv]:
            real = [e for e in g._errs if "favicon" not in e and "ResizeObserver" not in e]
            ok(not real, f"{g._name}: no errors ({real[:2]})")
        browser.close()
    print("\nall good" if not fails else f"\n{len(fails)} failure(s)")
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
