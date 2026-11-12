"""一本正经 online: four phones and a big screen at one table, against the local servers
(HANDOFF.md, "Run the site locally": the rooms server on 8787 and the site on 5173).

usage: python3 scripts/straightface_net_check.py [base_url]   (TV_LANG=en for an English TV)

The TV opens a table for the game; Amy (Chinese, hosting), Ben (English), 小林 and Dan (Chinese)
sit down and play a whole game, four rounds. At every step it checks: the real meaning is on the
honest phone only (and only while it is held), never on the TV or any other phone before the
reveal; a bluffer's phone has the seeds; every phone and the TV get the reveal; the master bluffer
picks; the end shows the board and the words. The cards: Dan's phone has played every card but
one, so that one comes up first (the table's played cards go last); every screen learns which card
it was at the reveal, the host's phone counts each round once, every phone can flag the card (Ben
flags one) and remembers the cards played. No phone scrolls sideways, no page logs an error.
Screenshots go to local-shots/straightface-net/.
"""
import json, os, re, sys, time
from playwright.sync_api import sync_playwright

BASE = next((a for a in sys.argv[1:] if a.startswith("http")), "http://127.0.0.1:5173/")
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "local-shots", "straightface-net")
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
    # what this phone tells the server about cards: a round's outcome, a flagged card
    pg._sf = []
    pg.on("request", lambda r: pg._sf.append((r.url.split("/api")[-1], json.loads(r.post_data or "{}"))) if "/api/sf/" in r.url and r.method == "POST" else None)
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


# the buttons, in each phone's language
L = {
    "deal": {"zh": "发牌开始", "en": "Deal"},
    "got": {"zh": "看好了", "en": "Got it"},
    "startSpeaking": {"zh": "开始发言", "en": "Start the explanations"},
    "done": {"zh": "说完了", "en": "Done"},
    "next": {"zh": "下一位", "en": "Next speaker"},
    "allDone": {"zh": "都说完了", "en": "All done"},
    "tag": {"zh": "贴疑点", "en": "Tag a suspect"},
    "close": {"zh": "不等了，现在指认", "en": "Stop the bets and decide"},
    "nextRound": {"zh": "下一轮", "en": "Next round"},
    "result": {"zh": "看结果", "en": "See the result"},
    "drank": {"zh": "我喝了", "en": "I drank"},
    "cont": {"zh": "继续", "en": "Continue"},
}


def btn(pg, key, exact=True):
    return pg.get_by_role("button", name=L[key][pg._lang], exact=exact)


def press(pg, loc, tries=8):
    for _ in range(tries):
        try:
            loc.first.click(timeout=1500)
            return True
        except Exception:
            clear_stamps([pg], wait=False)
            pg.wait_for_timeout(250)
    return False


def clear_stamps(pages, wait=True):
    """Penalty stamps: the one who takes it says so; the others' go by themselves (or get a tap)."""
    if wait:
        time.sleep(0.4)
    for _ in range(14):
        busy = False
        for g in pages:
            if g.locator(".stamp-layer").count() == 0:
                continue
            busy = True
            for key in ("drank", "cont"):
                b = g.locator(".stamp-layer button", has_text=L[key][g._lang])
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


def pick(pg, name):
    """Tap a face by name in the phone's picker (a bet, the tag, the accusation, the master's pick)."""
    return press(pg, pg.locator(".ballot .nominee:not([disabled])", has=pg.locator(".nominee-name", has_text=re.compile("^" + re.escape(name) + "$"))))


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        tv = page(browser, "tv", os.environ.get("TV_LANG", "zh"), {"width": 1600, "height": 900}, scale=1, mobile=False)
        tv.goto(BASE + "#/tv?g=straightface", wait_until="networkidle")
        tv.wait_for_selector(".tv-code", timeout=10000)
        tv.wait_for_timeout(800)
        code = tv.locator(".tv-code").inner_text().strip()
        ok(re.fullmatch(r"[A-Z0-9]{4}", code) is not None, f"the TV opened table {code} for the game")

        people = [("Amy", "zh"), ("Ben", "en"), ("小林", "zh"), ("Dan", "zh")]
        phones = []
        for name, lang in people:
            g = page(browser, name, lang, {"width": 390, "height": 844})
            g.goto(BASE + f"#/r/{code}", wait_until="networkidle")
            g.wait_for_timeout(300)
            g.locator(".join-card input").fill(name)
            g.locator(".join-card button[type=submit]").click()
            until(lambda g=g: room(g))
            phones.append(g)
        host = phones[0]
        # a fifth seat that only watches: never dealt in, its phone shows the big screen's view
        eve = page(browser, "Eve", "zh", {"width": 390, "height": 844})
        eve.goto(BASE + f"#/r/{code}", wait_until="networkidle")
        eve.wait_for_timeout(300)
        eve.locator(".join-card input").fill("Eve")
        eve.locator(".join-card button[type=submit]").click()
        until(lambda: room(eve))
        eve.locator(".table-btn").click()
        eve.wait_for_timeout(400)
        eve.locator(".table-watch button").click()
        ok(until(lambda: any(s["id"] == me(eve) and s.get("watch") for s in room(eve)["seats"])), "Eve just watches")
        eve.keyboard.press("Escape")
        eve.wait_for_timeout(400)
        names = {me(g): g._name for g in phones}
        by_id = {me(g): g for g in phones}
        ok(until(lambda: len(room(host)["seats"]) == 5), "five seated, one only watching")
        ok(room(host)["host"] == me(host), "Amy hosts")

        # Dan's phone has played every card but one before: the table's first card is that one
        bank = re.findall(r'^    id: "([^"]+)"', open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src", "data", "straightface.ts"), encoding="utf-8").read(), re.M)
        fresh = "haboob"  # 冷知识, a pack every table starts with
        dan = phones[3]
        dan.evaluate("(ids) => localStorage.setItem('changle.sf.seen', JSON.stringify(ids))", [c for c in bank if c != fresh][-300:])
        played = []

        host.locator(".lobby-actions .btn-primary").click()
        ok(all(until(lambda g=g: (view(g) or {}).get("id") == "straightface") for g in phones), "every phone is in the game")
        ok(until(lambda: (view(host) or {}).get("setup", {}).get("packs")), "the host's phone put in its packs")
        host.wait_for_timeout(900)
        for g in (host, phones[1]):
            shot(g, "01-setup")
        tv.wait_for_timeout(400)
        shot(tv, "01-setup")
        ok(phones[1].locator(".sf-pack-strip li").count() > 0 and phones[1].locator(".sf-pack-grid").count() == 0, "a guest sees the host's packs, not the picker")

        press(host, btn(host, "deal"))
        ok(all(until(lambda g=g: phase(g) == "peek") for g in phones), "dealt: the word is up on every phone")
        ok(me(eve) not in view(host)["players"] and len(view(host)["players"]) == 4, "the watcher isn't dealt in")
        ok(until(lambda: eve.locator(".tvx").count() > 0), "the watcher's phone shows the big screen's view")
        ok((view(eve) or {}).get("me") is None, "and holds nobody's part")
        eve.wait_for_timeout(1200)
        shot(eve, "02-peek-watching")
        tv.wait_for_timeout(1500)
        shot(tv, "02-peek")

        rounds = 0
        while phase(host) not in ("finished", None) and rounds < 6:
            rounds += 1
            v = view(host)
            judge = v["table"]["judgeId"]
            parts = {pid: (view(g)["me"] or {}).get("role") for pid, g in by_id.items()}
            honest = next(pid for pid, r in parts.items() if r == "honest")
            bluffers = [pid for pid, r in parts.items() if r == "bluffer"]
            definition = view(by_id[honest])["me"]["definition"]
            ok(parts[judge] == "judge" and len(bluffers) == 2, f"[round {rounds}] judge {names[judge]}, honest {names[honest]}, bluffers {', '.join(names[b] for b in bluffers)}")
            ok(all((view(by_id[b])["me"] or {}).get("definition") is None for b in bluffers + [judge]), f"[round {rounds}] only the honest phone has the real meaning")
            for g in phones + [tv]:
                ok(definition["zh"] not in text(g) and definition["en"] not in text(g), f"[round {rounds}] {g._name}: the meaning is on no screen before anyone holds")

            # each player holds to read their part, then says got it
            for pid in [honest] + bluffers:
                g = by_id[pid]
                hold = g.locator(".sf-hold").first
                box = hold.bounding_box()
                g.mouse.move(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
                g.mouse.down()
                g.wait_for_timeout(350)
                held = text(g)
                if pid == honest:
                    ok(definition[g._lang] in held, f"[round {rounds}] the honest one reads the meaning while holding")
                else:
                    seeds = view(g)["me"]["bluffSeeds"] or []
                    ok(len(seeds) == 2 and seeds[0][g._lang] in held, f"[round {rounds}] {g._name} reads the seeds while holding")
                if rounds == 1:
                    shot(g, f"03-holding-{'honest' if pid == honest else 'bluffer'}")
                g.mouse.up()
                g.wait_for_timeout(150)
                ok(definition[g._lang] not in text(g), f"[round {rounds}] {g._name}: dark again on letting go")
                press(g, btn(g, "got"))
            ok(all(until(lambda g=g: phase(g) == "explain") for g in phones), f"[round {rounds}] everyone has read theirs: explaining")
            if rounds == 1:
                shot(by_id[judge], "04-order-judge")

            # the judge starts; each speaker says done (the judge moves the last one on); round 1: a tag
            jg = by_id[judge]
            press(jg, btn(jg, "startSpeaking"))
            ok(until(lambda: view(host)["table"]["speakerId"] is not None), f"[round {rounds}] the first speaker is up")
            order = view(host)["table"]["speakOrder"]
            for i, sp in enumerate(order):
                until(lambda sp=sp: view(host)["table"]["speakerId"] == sp)
                if rounds == 1 and i == 0:
                    tv.wait_for_timeout(700)
                    shot(tv, "05-explain")
                    shot(by_id[sp], "05-speaking")
                    press(jg, btn(jg, "tag"))
                    jg.wait_for_timeout(300)
                    shot(jg, "05-judge-tag")
                    tagged = next(b for b in bluffers if b != sp) if any(b != sp for b in bluffers) else bluffers[0]
                    pick(jg, names[tagged])
                    ok(until(lambda: (view(jg)["me"] or {}).get("suspectId") == tagged), f"[round {rounds}] the judge tagged {names[tagged]}")
                    ok(all((view(g)["me"] or {}).get("suspectId") in (None,) for pid, g in by_id.items() if pid != judge), f"[round {rounds}] the tag stays on the judge's phone")
                if i == len(order) - 1:
                    press(jg, btn(jg, "allDone"))
                else:
                    press(by_id[sp], btn(by_id[sp], "done"))
                    ok(until(lambda i=i: order.index(view(host)["table"]["speakerId"] or order[0]) == i + 1 or phase(host) != "explain"), f"[round {rounds}] {by_id[sp]._name} done: the next one is up")
            ok(until(lambda: phase(host) == "bets"), f"[round {rounds}] four players: on to the bets")
            if rounds == 1:
                shot(by_id[bluffers[0]], "06-bet")
                shot(tv, "06-bets")
            for pid in [honest] + bluffers:
                g = by_id[pid]
                target = bluffers[0] if pid == honest else honest
                if target == pid:
                    target = bluffers[1]
                pick(g, names[target])
            ok(until(lambda: phase(host) == "accuse"), f"[round {rounds}] all bets in: the judge decides")
            if rounds == 1:
                shot(jg, "07-accuse")
                shot(by_id[honest], "07-waiting")
            # rounds 1 and 3: the judge is fooled (a bluffer not tagged); 2 and 4: right
            suspect = (view(jg)["me"] or {}).get("suspectId")
            wrong = next((b for b in bluffers if b != suspect), None)
            target = wrong if rounds % 2 == 1 and wrong else honest
            pick(jg, names[target])
            ok(all(until(lambda g=g: phase(g) == "reveal") for g in phones), f"[round {rounds}] the reveal on every phone")
            host.wait_for_timeout(5200)
            ok(all(definition[g._lang] in text(g) for g in phones), f"[round {rounds}] every phone shows the real meaning now")
            ok(definition[tv._lang] in text(tv), f"[round {rounds}] so does the TV")
            card = view(host).get("cardId")
            played.append(card)
            ok(card and all(view(g).get("cardId") == card for g in phones + [tv]), f"[round {rounds}] every screen knows which card it was ({card})")
            if rounds == 1:
                ok(card == fresh, f"[round 1] the one card nobody at the table has played came up ({card})")
            sent = [(g._name, x[1]) for g in phones for x in g._sf if x[0] == "/sf/round"]
            ok(len(sent) == rounds and all(n == host._name for n, _ in sent) and sent[-1][1].get("card") == card and sent[-1][1].get("players") == 4, f"[round {rounds}] the host's phone counted the round, once ({[(n, b.get('card')) for n, b in sent]})")
            ok(all(g.locator(".sf-report-link").count() == 1 for g in phones), f"[round {rounds}] every phone can flag the card")
            if rounds == 2:
                bg = phones[1]
                clear_stamps(phones + [tv, eve])
                press(bg, bg.locator(".sf-report-link"))
                ok(until(lambda: bg.locator(".sf-report").count() == 1), "[round 2] Ben opens the flag sheet")
                press(bg, bg.locator(".sf-reason").nth(0))
                bg.locator(".sf-report textarea").fill("net check")
                shot(bg, "08-report")
                press(bg, bg.locator(".sf-report .btn-primary"))
                ok(until(lambda: "Got it" in bg.locator(".sf-report").inner_text()), "[round 2] sent: thanks")
                reports = [x[1] for x in bg._sf if x[0] == "/sf/report"]
                ok(len(reports) == 1 and reports[0].get("card") == card and reports[0].get("reason") == "wrong" and reports[0].get("lang") == "en", f"[round 2] the flag went out for this card ({reports})")
                press(bg, bg.locator(".sf-report .btn-primary"))
                bg.wait_for_timeout(400)
            if rounds <= 2:
                for g in (by_id[honest], phones[1]):
                    shot(g, f"08-reveal-r{rounds}")
                shot(tv, f"08-reveal-r{rounds}")
            if rounds == 1:
                shot(eve, "08-reveal-watching")
            clear_stamps(phones + [tv, eve])
            vv = view(host)
            if vv.get("master"):
                mg = by_id[vv["master"]]
                ok(target == vv["master"], f"[round {rounds}] the fooling bluffer is the master")
                ok(until(lambda: mg.locator(".sf-master .ballot").count() == 1), f"[round {rounds}] {mg._name}'s phone offers the pick")
                shot(mg, f"09-master-r{rounds}")
                victim = next(pid for pid in by_id if pid != vv["master"])
                pick(mg, names[victim])
                ok(until(lambda: view(host).get("picked") == victim), f"[round {rounds}] picked {names[victim]}")
                clear_stamps(phones + [tv, eve])
            # the judge moves on (the host would too)
            mover = jg
            last = view(host)["table"]["roundNumber"] >= view(host)["table"]["roundsPlanned"]
            press(mover, btn(mover, "result" if last else "nextRound"))
            ok(until(lambda: phase(host) in ("between", "finished")), f"[round {rounds}] the round is recorded")
            clear_stamps(phones + [tv, eve])
            if phase(host) == "between":
                nj = view(host)["nextJudge"]
                ok(nj is not None and nj != judge, f"[round {rounds}] next judge: {names.get(nj)}")
                if rounds == 1:
                    shot(by_id[nj], "10-between-nextjudge")
                    shot(tv, "10-between")
                ng = by_id[nj]
                press(ng, ng.locator(".sf-net-actions .btn-primary"))
                ok(until(lambda: phase(host) == "peek"), f"[round {rounds + 1}] the next judge started it")

        ok(phase(host) == "finished" and rounds == 4, f"four rounds, then the end ({rounds})")
        tv.wait_for_timeout(3500)
        for g in (host, phones[1]):
            shot(g, "11-finished")
        shot(tv, "11-finished")
        v = view(host)
        ok(len(v.get("learned") or []) == 4, "the end lists the four words")
        for g in phones:
            seen = g.evaluate("JSON.parse(localStorage.getItem('changle.sf.seen') || '[]')")
            ok(all(c in seen for c in played), f"{g._name}'s phone remembers the four cards played ({len(seen)} in all)")
        for g in phones:
            ok(no_sideways(g), f"{g._name}: no sideways scroll")
        for g in phones + [tv, eve]:
            real = [e for e in g._errs if "favicon" not in e and "ResizeObserver" not in e]
            ok(not real, f"{g._name}: no errors ({real[:2]})")
        browser.close()
    print("\nall good" if not fails else f"\n{len(fails)} failure(s)")
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
