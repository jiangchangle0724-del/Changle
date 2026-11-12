"""一本正经 自己出题 (every player writes a word of their own) against the local site and rooms server.

usage: python3 scripts/straightface_own_check.py [base_url]   (default http://127.0.0.1:5173/)

Online, a TV and four phones: the host turns it on; three phones write a word, one doesn't; nobody's
screen shows anyone else's word, the TV counts; the deal plays the players' words first, never to
their writer as judge; the writer's own part says it's theirs and their phone has no bets; the
reveal names the writer on every screen; the end lists the words. One phone, three players: the
phone goes round for the writing (one skips), and the first word is a player's. Screenshots go to
local-shots/straightface-own/. Helpers come from straightface_net_check.py.
"""
import os, re, sys
from playwright.sync_api import sync_playwright
from straightface_net_check import L, btn, clear_stamps, me, ok, page, pick, press, text, until, view, fails

BASE = next((a for a in sys.argv[1:] if a.startswith("http")), "http://127.0.0.1:5173/")
if not BASE.endswith("/"):
    BASE += "/"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "local-shots", "straightface-own")
os.makedirs(OUT, exist_ok=True)

WORDS = {
    "Amy": ("搞掂", "粤语，事情办妥了、搞定了。", "港片里常听到。"),
    "Ben": ("Gobbledygook", "Pompous, unintelligible jargon.", "Coined by a Texas congressman in 1944."),
    "小林": ("斯文", "形容人文雅、有礼貌。", ""),
}
OWN_ON = {"zh": "自己出题", "en": "Write your own words"}
PACK = {"zh": "玩家出的题", "en": "A player's word"}
YOURS = {"zh": "这是你出的词", "en": "This is your word"}


def shot(pg, tag):
    pg.screenshot(path=os.path.join(OUT, f"{tag}-{pg._name}.png"))


def write(pg, term, meaning, fact):
    form = pg.locator(".sf-own")
    form.locator("input").fill(term)
    form.locator("textarea").nth(0).fill(meaning)
    form.locator("textarea").nth(1).fill(fact)
    press(pg, form.locator("button[type=submit]"))


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


def online(browser):
    tv = page(browser, "tv", "zh", {"width": 1600, "height": 900}, scale=1, mobile=False)
    tv.goto(BASE + "#/tv?g=straightface", wait_until="networkidle")
    tv.wait_for_selector(".tv-code", timeout=10000)
    tv.wait_for_timeout(800)
    code = tv.locator(".tv-code").inner_text().strip()
    phones = []
    for name, lang in [("Amy", "zh"), ("Ben", "en"), ("小林", "zh"), ("Dan", "zh")]:
        g = page(browser, name, lang, {"width": 390, "height": 844})
        g.goto(BASE + f"#/r/{code}", wait_until="networkidle")
        g.wait_for_timeout(300)
        g.locator(".join-card input").fill(name)
        g.locator(".join-card button[type=submit]").click()
        until(lambda g=g: view(g) is not None or g.locator(".lobby").count() > 0, 10000)
        phones.append(g)
    host = phones[0]
    host.wait_for_timeout(600)
    press(host, host.locator(".lobby-actions .btn-primary"))
    ok(until(lambda: host.get_by_role("button", name=L["deal"]["zh"]).count() > 0, 10000), "the host can deal")
    ids = {g._name: me(g) for g in phones}
    names = {v: k for k, v in ids.items()}

    # the switch: the host's, nobody else's
    row = lambda g: g.locator(".settings-row", has_text=OWN_ON[g._lang]).locator("button")
    ok(all(row(g).count() == 1 for g in phones) and row(phones[1]).is_disabled(), "every phone shows the switch; only the host's works")
    press(host, row(host))
    ok(until(lambda: all(g.locator(".sf-own").count() == 1 for g in phones), 8000), "on: every phone gets the form")
    shot(phones[3], "01-form")
    for g in phones[:3]:
        write(g, *WORDS[g._name])
        ok(until(lambda g=g: g.locator(".sf-own-done").count() == 1, 6000), f"{g._name} handed in a word")
    ok(until(lambda: "3/4 写好了" in text(tv), 6000), "the TV counts the words (3 of 4), nothing more")
    ok(until(lambda: "3/4 人写好了" in text(host), 6000), "so does the host's phone, by the deal button")
    for g in phones + [tv]:
        others = [w[0] for n, w in WORDS.items() if n != g._name]
        ok(not any(o in text(g) for o in others), f"{g._name}: nobody else's word on this screen")
    shot(host, "02-written")
    tv.wait_for_timeout(500)
    shot(tv, "02-setup")
    # Ben changes his mind about the fun fact, then keeps it
    press(phones[1], phones[1].get_by_role("button", name="Change it"))
    ok(until(lambda: phones[1].locator(".sf-own input").input_value() == "Gobbledygook", 4000), "changing a word starts from what was written")
    press(phones[1], phones[1].get_by_role("button", name="Keep it"))

    press(host, host.get_by_role("button", name=L["deal"]["zh"], exact=True))
    seen_words = []
    rounds = 0
    while rounds < 6:
        rounds += 1
        ok(until(lambda: all(g.locator(".sf-term").count() > 0 for g in phones), 15000), f"[round {rounds}] the word is up")
        v = view(host)
        t = v["table"]
        judge = t["judgeId"]
        word = t["term"]["zh"]
        seen_words.append(word)
        author = None
        if t["own"]:
            author = next((n for n, w in WORDS.items() if w[0] == word), None)
            ok(author is not None and ids[author] != judge, f"[round {rounds}] a player's word ({word}), and its writer ({author}) isn't judging")
            ok(all(PACK[g._lang] in g.locator(".sf-term").first.inner_text() for g in phones) and PACK["zh"] in text(tv), f"[round {rounds}] every screen marks it a player's word")
        for g in phones:
            if ids[g._name] == judge:
                continue
            held = hold_read(g)
            if author and g._name == author:
                ok(YOURS[g._lang] in held, f"[round {rounds}] {g._name}'s part says it's their word")
                if rounds == 1:
                    shot(g, "03-yours")
            elif author:
                ok(YOURS[g._lang] not in held, f"[round {rounds}] {g._name}'s part doesn't")
            press(g, btn(g, "got"))
        jp = next(g for g in phones if ids[g._name] == judge)
        ok(until(lambda: btn(jp, "startSpeaking").count() > 0, 10000), f"[round {rounds}] explaining")
        press(jp, btn(jp, "startSpeaking"))
        for _ in range(3):
            sp = until(lambda: next((g for g in phones if view(g)["me"] and view(g)["me"]["isSpeaking"]), None), 8000)
            if not sp:
                break
            press(sp, btn(sp, "done"))
            sp.wait_for_timeout(400)
        ok(until(lambda: view(host)["phase"] in ("bets", "accuse"), 8000), f"[round {rounds}] on to the bets")
        if view(host)["phase"] == "bets":
            for g in phones:
                if ids[g._name] == judge:
                    continue
                ballot = g.locator(".ballot .nominee:not([disabled])")
                if author and g._name == author:
                    g.wait_for_timeout(300)
                    ok(view(g)["me"]["canBet"] is False and ballot.count() == 0, f"[round {rounds}] {g._name} wrote it: no bets on that phone")
                    continue
                until(lambda g=g: g.locator(".ballot .nominee:not([disabled])").count() > 0, 6000)
                press(g, ballot)
        ok(until(lambda: view(host)["phase"] == "accuse", 8000), f"[round {rounds}] all bets in")
        honest = next(g._name for g in phones if (view(g)["me"] or {}).get("role") == "honest")
        pick(jp, honest)
        ok(until(lambda: all(view(g)["phase"] == "reveal" for g in phones), 10000), f"[round {rounds}] the reveal")
        host.wait_for_timeout(5200)
        clear_stamps(phones + [tv])
        if author:
            by = {"zh": f"这个词是 {author} 出的", "en": f"{author} wrote this one"}
            ok(all(by[g._lang] in text(g) or (g._name == author and (by[g._lang].replace(author, "你") in text(g) or "You wrote" in text(g))) for g in phones), f"[round {rounds}] every phone names the writer")
            ok(until(lambda: by["zh"] in text(tv), 4000), f"[round {rounds}] so does the TV")
            if rounds == 1:
                shot(phones[1], "04-reveal")
                shot(tv, "04-reveal")
        master = next((g for g in phones if g.locator(".sf-master .ballot").count() > 0), None)
        if master:
            press(master, master.locator(".sf-master .ballot .nominee:not([disabled])"))
            host.wait_for_timeout(600)
            clear_stamps(phones + [tv])
        press(host, host.locator(".sf-net-actions .btn-primary"))
        if until(lambda: view(host)["phase"] == "finished", 3000):
            break
        ok(until(lambda: view(host)["phase"] == "between", 8000), f"[round {rounds}] between rounds")
        press(host, host.locator(".sf-net-actions .btn-primary"))

    ok(view(host)["phase"] == "finished" and rounds == 4, f"four rounds, then the end ({rounds})")
    ok(seen_words[:3] and all(w in seen_words[:3] for w in [x[0] for x in WORDS.values()]), f"the three words came first ({seen_words})")
    learned = [l["term"]["zh"] for l in view(host)["learned"]]
    ok(all(w[0] in learned for w in WORDS.values()), f"the end lists them ({learned})")
    sent = [x for g in phones for x in g._sf if x[0] == "/sf/round"]
    ok(len(sent) == 1, f"only the bank's word was counted for the numbers ({len(sent)})")
    for g in phones + [tv]:
        real = [e for e in g._errs if "favicon" not in e and "ResizeObserver" not in e]
        ok(not real, f"{g._name}: no errors ({real[:2]})")


def one_phone(browser):
    pg = browser.new_page(viewport={"width": 390, "height": 844}, device_scale_factor=2, has_touch=True, is_mobile=True)
    players = [{"id": f"p{i}", "name": n} for i, n in enumerate(["Steve", "小雨", "Kevin"])]
    import json
    settings = {"lang": "zh", "sound": False, "music": False, "customPenalty": "", "players": players}
    pg.add_init_script("sessionStorage.setItem('lazysusan.entered','1'); localStorage.setItem('lazysusan.settings.v1', %s);" % json.dumps(json.dumps(settings)))
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(BASE + "g/in-all-seriousness/play", wait_until="networkidle")
    pg.wait_for_selector(".setup-panel", timeout=10000)
    pg.locator(".settings-row", has_text="自己出题").locator("button").click()
    pg.get_by_role("button", name="开始", exact=True).click()
    for i, (name, word) in enumerate([("Steve", ("吃了吗您", "北京人打招呼的客气话，不是真问你吃没吃。", "")), ("小雨", ("搞掂", "粤语，事情办妥了。", "")), ("Kevin", None)]):
        ok(until(lambda: pg.locator(".pass-curtain").count() == 1 and name in pg.locator(".pass-curtain").inner_text(), 5000), f"one phone: pass it to {name} to write")
        if i == 0:
            pg.screenshot(path=os.path.join(OUT, "05-one-curtain.png"))
        pg.get_by_role("button", name=f"我是 {name}").click()
        ok(until(lambda: pg.locator(".sf-own").count() == 1, 4000), f"one phone: {name}'s form")
        if word:
            pg.locator(".sf-own input").fill(word[0])
            pg.locator(".sf-own textarea").nth(0).fill(word[1])
            if i == 0:
                pg.screenshot(path=os.path.join(OUT, "06-one-form.png"))
            pg.locator(".sf-own button[type=submit]").click()
        else:
            pg.get_by_role("button", name="这次不写").click()
    ok(until(lambda: pg.locator(".sf-term").count() == 1, 6000), "one phone: everyone has had their turn, the game starts")
    term = pg.locator(".sf-term").inner_text()
    ok("玩家出的题" in term and ("吃了吗您" in term or "搞掂" in term), f"one phone: the first word is a player's ({term.splitlines()[:3]})")
    pg.screenshot(path=os.path.join(OUT, "07-one-first-word.png"))
    ok(not errs, f"one phone: no errors ({errs[:2]})")


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        online(browser)
        one_phone(browser)
        browser.close()
    print("\nall good" if not fails else f"\n{len(fails)} failure(s)")
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
